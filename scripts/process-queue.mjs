/**
 * process-queue.mjs — v3.0 (daemon com auto-renovação e sessão cacheada)
 *
 * - Verifica fila a cada 8s (odds aparecem em ~8-10s)
 * - Cookie expirado → avisa para renovar manualmente (sem automação de login)
 * - Sessão ECDH mantida em memória entre ciclos (evita handshake repetido)
 * - Fila vazia → zero chamadas ao SuperMonitor
 * - Max 5 eventos por ciclo, delay 3-6s entre requests
 */

import https              from 'node:https';
import http               from 'node:http';
import { URL }            from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';
import { exec }           from 'node:child_process';

// ── Carrega .env local ────────────────────────────────────────────────────────
const __dir  = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Configuração ──────────────────────────────────────────────────────────────
const BASE          = 'https://painel.supermonitor.pro';
const UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';
const CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutos
const MAX_PER_CYCLE = 5;
const POLL_INTERVAL = 500;             // 0.5s (só consulta Supabase — sem risco anti-ban)

const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!sbUrl || !sbKey) { console.error('Supabase nao configurado.'); process.exit(1); }

// ── Agent keepAlive ───────────────────────────────────────────────────────────
const agent = new https.Agent({ keepAlive: true, maxSockets: 1, timeout: 20_000 });

// ── HTTP helper ───────────────────────────────────────────────────────────────
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      { hostname: u.hostname, port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: u.pathname + u.search, method, headers,
        agent: lib === https ? agent : undefined, timeout: 20_000 },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
      }
    );
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Supabase REST ─────────────────────────────────────────────────────────────
async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  return fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Safe JSON parser ──────────────────────────────────────────────────────────
// Lê a resposta como texto antes de parsear para detectar páginas HTML
// (redirecionamento de login / Cloudflare challenge) retornadas no lugar de JSON.
// Quando HTML é detectado, invalida o cache do cookie para forçar renovação
// no próximo ciclo e lança um erro descritivo com o contexto da chamada.
async function safeJson(res, context) {
  const text = await res.text();
  // Body vazio = servidor retornou 200 sem conteúdo → erro descritivo
  if (!text.trim()) {
    throw new Error(`${context}: resposta vazia (body em branco) — status ${res.status ?? '?'}`);
  }
  if (text.trimStart().startsWith('<')) {
    // Cookie expirado / desafio CF → invalida cache para renovação automática
    _cookie = null;
    _cookieValidatedAt = 0;
    throw new Error(`${context}: HTML recebido em vez de JSON (cookie/CF expirado) — ${text.slice(0, 120)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${context}: JSON inválido — ${text.slice(0, 120)}`);
  }
}

// ── Ler cookie do Supabase ────────────────────────────────────────────────────
async function readCookieFromSupabase() {
  try {
    const res  = await sbFetch('app_config?key=eq.supermonitor_cookie&select=value,updated_at');
    const rows = await res.json();
    if (!rows?.length) return null;
    const age = Date.now() - new Date(rows[0].updated_at).getTime();
    if (age > 20 * 24 * 60 * 60 * 1000) return null;
    return rows[0].value ?? null;
  } catch { return null; }
}

// ── Lê cf_clearance separado e mescla no cookie ───────────────────────────────
async function mergeCfClearance(cookie) {
  try {
    const res  = await sbFetch('app_config?key=eq.cf_clearance&select=value,updated_at');
    const rows = await res.json();
    if (!rows?.length || !rows[0].value) return cookie;
    // cf_clearance expira em ~24h no Cloudflare
    const age = Date.now() - new Date(rows[0].updated_at).getTime();
    if (age > 23 * 60 * 60 * 1000) return cookie; // expirado — não inclui
    const cf = `cf_clearance=${rows[0].value}`;
    // Remove cf_clearance antigo do cookie se existir, adiciona o salvo
    const parts = cookie.split(';').map(p => p.trim())
      .filter(p => p && !p.toLowerCase().startsWith('cf_clearance='));
    parts.push(cf);
    return parts.join('; ');
  } catch { return cookie; }
}

// ── Validar cookie ────────────────────────────────────────────────────────────
// NOTA: ajax.php?action=events_lite foi removido pelo SuperMonitor (retorna 404).
// Usa proxy_nonce.php que retorna 200+nonce quando autenticado e 401 quando não.
async function validateCookie(cookie) {
  try {
    const res = await request('GET', `${BASE}/api/proxy_nonce.php`, {
      'User-Agent': UA, 'Cookie': cookie,
      'Accept': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': `${BASE}/index.php?page=buscador`,
    });
    if (res.status !== 200) return false;
    if (res.body.trimStart().startsWith('<')) return false; // HTML = sessão expirada
    if (res.body.includes('"error"')) return false;        // {"error":"Não autenticado"}
    return true; // 200 + JSON com nonce = sessão válida
  } catch { return false; }
}

// ── Keepalive de sessão ───────────────────────────────────────────────────────
// Problema: check_session.php parece ser read-only — não renova o TTL da sessão
// PHP no servidor. Usamos ajax.php?action=events_lite (mesmo endpoint do
// validateCookie) que faz uma leitura real e com certeza chama session_start()
// com escrita, renovando o TTL.
//

// ── Renovação manual — sem automação de login ─────────────────────────────────
// Login automático removido para evitar detecção de bot pelo SuperMonitor.
// Quando o cookie expira, o daemon para e avisa para renovar manualmente:
//   1. Acesse painel.supermonitor.pro e faça login
//   2. Copie o cookie via DevTools e salve no Supabase (app_config)
//   3. Reinicie o daemon: node scripts/process-queue.mjs
async function autoRenewCookie() {
  console.error('');
  console.error('══════════════════════════════════════════════════════');
  console.error('  COOKIE EXPIRADO — renovação manual necessária');
  console.error('  1. Acesse painel.supermonitor.pro e copie o PHPSESSID');
  console.error('  2. Cole no painel admin do SureEdge (app_config)');
  console.error('  3. Reinicie: node scripts/process-queue.mjs');
  console.error('══════════════════════════════════════════════════════');
  console.error('');

  // Grava status no Supabase para o frontend exibir o alerta
  sbFetch('app_config', 'POST', { key: 'cookie_status', value: 'expired', updated_at: new Date().toISOString() },
    { 'Prefer': 'resolution=merge-duplicates' }).catch(() => {});

  // Alerta visual no Windows
  const msg = 'Cookie SuperMonitor expirado!\\n\\nPegue o novo PHPSESSID no supermonitor.pro e cole no painel admin do SureEdge.\\n\\nDepois reinicie: node scripts/process-queue.mjs';
  exec(
    `powershell -WindowStyle Hidden -Command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.MessageBox]::Show('${msg}', 'SureEdge — Cookie Expirado', 'OK', 'Warning') | Out-Null"`,
    () => {} // ignora resultado
  );

  return null;
}

// Alias mantido para compatibilidade — mesma lógica de aviso manual
async function renewCookieBackground() {
  return autoRenewCookie();
}

// ── Cookie jar helper ─────────────────────────────────────────────────────────
// Node fetch() não mantém cookies entre chamadas. Precisamos capturar os
// Set-Cookie das respostas do handshake e reencaminhar nas requisições seguintes.

function extractSetCookies(headers) {
  const cookies = [];

  // Node.js 18+ expõe getSetCookie() que retorna cada Set-Cookie como item
  // separado — é o método correto para fetch nativo (undici). O método legado
  // headers.get('set-cookie') junta todos numa string e perde separadores em
  // cookies que têm vírgula no campo expires.
  if (typeof headers.getSetCookie === 'function') {
    for (const cookie of headers.getSetCookie()) {
      const part = cookie.split(';')[0].trim();
      if (part) cookies.push(part);
    }
    return cookies;
  }

  // Fallback para ambientes sem getSetCookie (Node 16 ou polyfills)
  const raw = headers.get('set-cookie') ?? '';
  for (const line of raw.split('\n')) {
    const part = line.split(';')[0].trim();
    if (part) cookies.push(part);
  }
  return cookies;
}

function mergeCookies(base, extra) {
  if (!extra.length) return base;
  const newNames = new Set(extra.map(c => c.split('=')[0].trim().toLowerCase()));
  const existing = base.split(';').map(p => p.trim())
    .filter(p => p && !newNames.has(p.split('=')[0].trim().toLowerCase()));
  return [...existing, ...extra].join('; ');
}

// ── ECDH / Crypto helpers ─────────────────────────────────────────────────────
const subtle = globalThis.crypto.subtle;

function hexToBytes(hex) {
  const b = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return b;
}
function bytesToHex(b) { return Array.from(b).map(x => x.toString(16).padStart(2, '0')).join(''); }
function base64ToBytes(b64) {
  const bin = atob(b64);
  const b   = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i);
  return b;
}

async function createSession(cookie) {
  const cookieWithCf = await mergeCfClearance(cookie);
  // Headers espelhando exatamente o que o browser envia para buscador_proxy.php
  const hdrs = {
    'User-Agent':        UA,
    'Accept':            'application/json',
    'Accept-Language':   'pt-BR,pt;q=0.6',
    'Accept-Encoding':   'gzip, deflate, br',
    'Cache-Control':     'no-cache',
    'Pragma':            'no-cache',
    'Referer':           `${BASE}/index.php?page=buscador`,
    'Cookie':            cookieWithCf,
    'Sec-Fetch-Dest':    'empty',
    'Sec-Fetch-Mode':    'cors',
    'Sec-Fetch-Site':    'same-origin',
    'Sec-Ch-Ua':         '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile':  '?0',
    'Sec-Ch-Ua-Platform':'"Windows"',
    'Sec-Gpc':           '1',
  };

  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`nonce handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await safeJson(nonceRes, 'buscador: proxy_nonce_handshake');
  if (!handshakeNonce) throw new Error('nonce invalido');

  // Captura cookies de sessão retornados pelo servidor (ex: PHPSESSID renovado)
  const nonceCookies = extractSetCookies(nonceRes.headers);
  const hdrsAfterNonce = nonceCookies.length
    ? { ...hdrs, 'Cookie': mergeCookies(hdrs['Cookie'], nonceCookies) }
    : hdrs;

  const keyPair     = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw      = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  let hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method: 'POST',
    headers: { ...hdrsAfterNonce, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body: JSON.stringify({ client_pub_x, client_pub_y }),
  });

  // Handshake retorna 403 na 1ª tentativa — comportamento normal do servidor.
  // Browser busca novo nonce e retenta automaticamente. Fazemos o mesmo.
  if (hsRes.status === 403) {
    console.log('   Handshake 403 — buscando novo nonce e retentando...');
    const r2 = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrsAfterNonce });
    if (r2.ok) {
      const { nonce: nonce2 } = await safeJson(r2, 'buscador: retry nonce').catch(() => ({ nonce: null }));
      if (nonce2) {
        const c2 = extractSetCookies(r2.headers);
        if (c2.length) hdrsAfterNonce['Cookie'] = mergeCookies(hdrsAfterNonce['Cookie'], c2);
        hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
          method: 'POST',
          headers: { ...hdrsAfterNonce, 'Content-Type': 'application/json', 'X-Handshake-Nonce': nonce2 },
          body: JSON.stringify({ client_pub_x, client_pub_y }),
        });
      }
    }
  }

  if (!hsRes.ok) throw new Error(`handshake falhou (${hsRes.status})`);
  const hs = await safeJson(hsRes, 'buscador: buscador_handshake');
  if (!hs.success) throw new Error('cookie invalido (handshake negado)');

  // Captura cookies de sessão retornados pelo handshake (token de sessão ECDH)
  const hsCookies = extractSetCookies(hsRes.headers);
  if (hsCookies.length) {
    hdrsAfterNonce['Cookie'] = mergeCookies(hdrsAfterNonce['Cookie'], hsCookies);
  }

  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('buscador-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
  );
  // Captura session_token do handshake — necessário em todas as chamadas ao proxy
  const sessionToken = hs.session_token ?? null;

  return { aesKey, hdrs: hdrsAfterNonce, sessionToken };
}


async function fetchDecrypted(session, qs) {
  // SuperMonitor migrou de buscador_proxy.php (GET) para buscador_frame.php (POST iframe).
  // Nova arquitetura: POST form → resposta HTML com postMessage contendo payload ECDH.
  const params  = new URLSearchParams(qs);
  const _a      = params.get('action') ?? 'search';
  const _qRaw   = params.get('q') ?? '';
  const _t      = 'all'; // browser usa type=all no referer
  const _fid    = '_' + Math.random().toString(36).slice(2, 18); // frame session ID aleatório
  const referer = _qRaw
    ? `${BASE}/index.php?page=buscador&q=${encodeURIComponent(_qRaw)}&type=all`
    : `${BASE}/index.php?page=buscador`;

  // Nonce para buscador_frame.php — usa proxy_nonce.php (nonce de API, não de handshake)
  // proxy_nonce_handshake.php é apenas para o handshake ECDH inicial.
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, {
    headers: { ...session.hdrs, 'Referer': referer, 'X-Requested-With': 'XMLHttpRequest' },
  });
  if (!nonceRes.ok) throw new Error(`proxy_nonce falhou (${nonceRes.status})`);
  const { nonce: _n } = await safeJson(nonceRes, 'buscador_frame: nonce');

  const nonceCookies = extractSetCookies(nonceRes.headers);
  const frameHdrs = {
    ...session.hdrs,
    'Cookie':        nonceCookies.length ? mergeCookies(session.hdrs['Cookie'], nonceCookies) : session.hdrs['Cookie'],
    'Content-Type':  'application/x-www-form-urlencoded',
    'Referer':       referer,
    'Accept':        'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Sec-Fetch-Dest':'iframe',
    'Sec-Fetch-Mode':'navigate',
    // Iframes de mesma origem não enviam Origin — remove para imitar browser
    // Inclui session token se disponível (mesmo padrão do scanner)
    ...(session.sessionToken ? { 'X-Session-Token': session.sessionToken } : {}),
  };
  // Remove Origin — navegação iframe same-origin não envia esse header
  delete frameHdrs['Origin'];

  // 2. POST para buscador_frame.php
  const body = new URLSearchParams({ _a, _n, _fid, _q: _qRaw, _t }).toString();
  const frameRes = await fetch(`${BASE}/api/buscador_frame.php`, {
    method: 'POST', headers: frameHdrs, body,
  });

  if (!frameRes.ok) {
    const text = await frameRes.text().catch(() => '');
    throw new Error(`buscador_frame falhou (${frameRes.status}): ${text.slice(0, 120)}`);
  }

  const html = await frameRes.text();

  // 3. Extrai payload do postMessage no HTML retornado
  // Formato: parent.postMessage({ _fid: "...", p: { "encrypted":true, "data":"...", "ts":..., "key_mode":"ecdh" } }, "...")
  const pMatch = html.match(/\bp\s*:\s*(\{[^{}]*\})/s);
  if (!pMatch) {
    console.log(`   [buscador_frame] Sem postMessage na resposta. HTML (300 chars): ${html.slice(0, 300)}`);
    return [];
  }

  let enc; // let para permitir reatribuição no RENEW_NONCE
  try { enc = JSON.parse(pMatch[1]); }
  catch { throw new Error('buscador_frame: JSON inválido no postMessage'); }

  if (enc.needs_handshake) throw new Error('401 needs_handshake — sessao ECDH expirou');

  // Função auxiliar para descriptografar e lidar com RENEW_NONCE no payload
  async function decryptAndRetry(encObj, retryNonce, attempt) {
    if (!encObj.encrypted || !encObj.data) return encObj;

    const encBytes = base64ToBytes(encObj.data);
    const plain    = await subtle.decrypt({ name: 'AES-CBC', iv: encBytes.slice(0, 16) }, session.aesKey, encBytes.slice(16));
    const decoded  = new TextDecoder().decode(plain);
    if (!decoded.trim()) throw new Error('buscador: payload vazio após descriptografia');
    let result;
    try { result = JSON.parse(decoded); }
    catch { throw new Error(`buscador: JSON inválido após descriptografia — ${decoded.slice(0, 80)}`); }

    // RENEW_NONCE pode estar dentro do payload descriptografado
    if (result?.code === 'RENEW_NONCE' && result?.nn && attempt < 3) {
      console.log(`   [buscador_frame] RENEW_NONCE (attempt ${attempt}) — retentando com nn`);
      // Tenta com nn direto
      const body2 = new URLSearchParams({ _a, _n: result.nn, _fid, _q: _qRaw, _t }).toString();
      const r2 = await fetch(`${BASE}/api/buscador_frame.php`, { method: 'POST', headers: frameHdrs, body: body2 });
      if (!r2.ok) throw new Error(`buscador_frame retry falhou (${r2.status})`);
      const html2 = await r2.text();
      const m2 = html2.match(/\bp\s*:\s*(\{[^{}]*\})/s);
      if (!m2) { console.log('   [buscador_frame] Sem dados após retry'); return []; }
      let enc2;
      try { enc2 = JSON.parse(m2[1]); } catch { throw new Error('JSON inválido após retry'); }
      return decryptAndRetry(enc2, result.nn, attempt + 1);
    }

    return result;
  }

  // 4. Descriptografa AES-CBC (com retry automático de RENEW_NONCE no payload)
  if (enc.encrypted && enc.data) {
    return await decryptAndRetry(enc, _n, 1);
  }
  return enc;
}

// ── Sessão ECDH cacheada em memória ──────────────────────────────────────────
let _session = null;
let _sessionCookieHash = '';
let _sessionExpiresAt = 0;
// Contador de 404 consecutivos no buscador_frame.
// Quando atinge o limite, aumenta o backoff drasticamente
// para não ficar criando sessão ECDH à toa.
let _buscador404Count = 0;
let _buscador404BackoffUntil = 0;
const BUSCADOR_404_LIMIT = 3;
const BUSCADOR_404_BACKOFF_MS = 10 * 60 * 1000; // 10 minutos
const SESSION_TTL = 1_740_000; // 29 min — igual ao JS do servidor (_ttl=1740000)

async function getSession(cookie) {
  // Reutiliza se o cookie não mudou E a sessão ainda não expirou
  if (_session && _sessionCookieHash === cookie.slice(0, 32) && Date.now() < _sessionExpiresAt) {
    return _session;
  }
  _session = await createSession(cookie);
  _sessionCookieHash = cookie.slice(0, 32);
  _sessionExpiresAt = Date.now() + SESSION_TTL;
  console.log('   Sessao ECDH criada');
  return _session;
}

function invalidateSession() {
  _session = null;
  _sessionCookieHash = '';
  _sessionExpiresAt = 0;
}

// ── Cookie com auto-renovação ─────────────────────────────────────────────────
let _cookie = null;
let _cookieValidatedAt = 0;
const COOKIE_CHECK_INTERVAL = 10 * 60 * 1000; // revalida a cada 10 min

async function getCookie() {
  // Usa o cookie em memória se foi validado recentemente
  if (_cookie && Date.now() - _cookieValidatedAt < COOKIE_CHECK_INTERVAL) return _cookie;

  const stored = await readCookieFromSupabase();
  if (stored) {
    const valid = await validateCookie(stored);
    if (valid) {
      _cookie = stored;
      _cookieValidatedAt = Date.now();
      // Marca cookie como válido no Supabase (limpa alerta no frontend)
      sbFetch('app_config', 'POST', { key: 'cookie_status', value: 'valid', updated_at: new Date().toISOString() },
        { 'Prefer': 'resolution=merge-duplicates' }).catch(() => {});
      return _cookie;
    }
  }

  // Cookie inválido — renova automaticamente
  const renewed = await autoRenewCookie();
  if (renewed) {
    _cookie = renewed;
    _cookieValidatedAt = Date.now();
    return _cookie;
  }

  return null;
}

// ── Helpers Supabase ──────────────────────────────────────────────────────────
async function getOddsAge(eventId) {
  try {
    const res  = await sbFetch(`sm_odds?event_id=eq.${encodeURIComponent(eventId)}&select=updated_at&limit=1`);
    const rows = await res.json();
    if (!rows?.length) return Infinity;
    return Date.now() - new Date(rows[0].updated_at).getTime();
  } catch { return Infinity; }
}

async function markQueueDone(eventId) {
  await sbFetch(
    `odds_queue?event_id=eq.${encodeURIComponent(eventId)}&status=eq.pending`,
    'PATCH', { status: 'done', fulfilled_at: new Date().toISOString() }
  );
}

async function markQueueError(eventId) {
  await sbFetch(
    `odds_queue?event_id=eq.${encodeURIComponent(eventId)}&status=eq.pending`,
    'PATCH', { status: 'error' }
  );
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Um ciclo de processamento ─────────────────────────────────────────────────
async function processOneCycle() {
  // 1. Lê fila
  let pending = [];
  try {
    const res = await sbFetch('odds_queue?status=eq.pending&order=created_at.asc&limit=50', 'GET', null, { 'Accept': 'application/json' });
    pending   = await res.json();
  } catch { return; }

  if (!pending.length) return; // fila vazia — silencioso

  // Backoff ativo: endpoint buscador_frame pode ter mudado — aguarda sem criar sessão
  if (_buscador404BackoffUntil > Date.now()) {
    const remainMin = Math.ceil((_buscador404BackoffUntil - Date.now()) / 60_000);
    console.log(`   [buscador] backoff ativo — aguardando mais ${remainMin} min (endpoint pode ter mudado)`);
    return;
  }

  const t = new Date().toLocaleTimeString('pt-BR');
  console.log(`\n[${t}] ${pending.length} item(ns) na fila`);

  // 2. Deduplica
  const seen = new Map();
  for (const item of pending) {
    if (!seen.has(item.event_id)) seen.set(item.event_id, item.event_name);
  }
  const uniqueEvents = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));

  // 3. Separa frescos de quem precisa buscar
  const needFetch = [];
  for (const ev of uniqueEvents) {
    if ((await getOddsAge(ev.id)) < CACHE_TTL_MS) {
      await markQueueDone(ev.id);
      console.log(`   Cache fresco: ${ev.name}`);
    } else {
      needFetch.push(ev);
    }
  }
  if (!needFetch.length) return;

  const batch = needFetch.slice(0, MAX_PER_CYCLE);

  // 4. Cookie com auto-renovação
  const cookie = await getCookie();
  if (!cookie) {
    console.error('   Nao foi possivel obter cookie valido.');
    for (const ev of batch) await markQueueError(ev.id);
    return;
  }

  // 5. Sessão ECDH (cacheada)
  let session;
  try {
    session = await getSession(cookie);
  } catch (err) {
    invalidateSession();
    console.error(`   Sessao falhou: ${err.message}`);

    // Se o handshake rejeitou o cookie explicitamente → força login imediato
    // (não passa pelo validateCookie que pode retornar true erroneamente)
    const cookieInvalid = err.message.includes('handshake') || err.message.includes('cookie');
    if (cookieInvalid) {
      console.log('   Cookie rejeitado pelo servidor — renovando agora...');
      _cookie = null;
      _cookieValidatedAt = 0;
      const renewed = await autoRenewCookie();
      if (!renewed) { for (const ev of batch) await markQueueError(ev.id); return; }
      _cookie = renewed;
      _cookieValidatedAt = Date.now();
      try {
        session = await getSession(renewed);
      } catch (err2) {
        console.error(`   Sessao falhou apos renovacao: ${err2.message}`);
        for (const ev of batch) await markQueueError(ev.id);
        return;
      }
    } else {
      // Erro de rede ou nonce — tenta com o cookie atual sem renovar
      _cookieValidatedAt = 0;
      const freshCookie = await getCookie();
      if (!freshCookie) { for (const ev of batch) await markQueueError(ev.id); return; }
      try {
        session = await getSession(freshCookie);
      } catch (err2) {
        console.error(`   Sessao falhou novamente: ${err2.message}`);
        for (const ev of batch) await markQueueError(ev.id);
        return;
      }
    }
  }

  // 6. Busca sequencial
  for (let i = 0; i < batch.length; i++) {
    const ev = batch[i];
    let attempts = 0;
    const MAX_ATTEMPTS = 2;

    while (attempts < MAX_ATTEMPTS) {
      attempts++;
      try {
        // Busca por nome completo, fallback pelo time da casa
        const homeTeam = ev.name.split(/\s+(?:x|vs|×|X)\s+/i)[0]?.trim() ?? ev.name;

        let data    = await fetchDecrypted(session, `action=search&q=${encodeURIComponent(ev.name)}&type=all`);
        let results = Array.isArray(data) ? data : (data?.d?.results ?? data?.results ?? data?.data ?? data?.events ?? []);

        if (!results.length && homeTeam !== ev.name) {
          data    = await fetchDecrypted(session, `action=search&q=${encodeURIComponent(homeTeam)}&type=all`);
          results = Array.isArray(data) ? data : (data?.d?.results ?? data?.results ?? data?.data ?? data?.events ?? []);
        }

        if (!results.length) {
          await markQueueDone(ev.id);
          console.log(`   Sem odds: ${ev.name}`);
        } else {
          const r = await sbFetch('sm_odds', 'POST',
            { event_id: ev.id, event_name: ev.name, data, updated_at: new Date().toISOString() },
            { 'Prefer': 'resolution=merge-duplicates' }
          );
          if (r.ok) {
            await markQueueDone(ev.id);
            console.log(`   OK: ${ev.name} (${results.length} resultados)`);
            // Reseta contador de 404 e limpa flag de manutenção
            _buscador404Count = 0;
            _buscador404BackoffUntil = 0;
            sbFetch('app_config', 'POST',
              { key: 'supermonitor_status', value: 'ok', updated_at: new Date().toISOString() },
              { 'Prefer': 'resolution=merge-duplicates' }
            ).catch(() => {});
          } else {
            await markQueueError(ev.id);
          }
        }
        break; // sucesso — sai do loop de tentativas

      } catch (err) {
        const is401      = err.message.includes('401');
        const isCrypto   = err.message.includes('operation failed') || err.message.includes('operation-specific');
        // 404 no buscador_frame = PHPSESSID expirou no servidor (sessão PHP encerrada)
        const is404Frame = err.message.includes('404') && err.message.includes('buscador_frame');
        const isSessionErr = is401 || isCrypto || is404Frame || err.message.includes('nonce') || err.message.includes('proxy');

        if (isSessionErr) invalidateSession();

        // 404 no buscador_frame = endpoint removido ou rate-limit
        if (is404Frame) {
          invalidateSession();
          await markQueueError(ev.id);
          _buscador404Count++;
          sbFetch('app_config', 'POST',
            { key: 'supermonitor_status', value: 'maintenance', updated_at: new Date().toISOString() },
            { 'Prefer': 'resolution=merge-duplicates' }
          ).catch(() => {});

          // Após 3 falhas consecutivas → backoff de 10 min (endpoint pode ter mudado)
          if (_buscador404Count >= BUSCADOR_404_LIMIT) {
            _buscador404BackoffUntil = Date.now() + BUSCADOR_404_BACKOFF_MS;
            console.log(`   buscador_frame 404 (${_buscador404Count}x consecutivo) — endpoint pode ter mudado. Backoff 10 min.`);
          } else {
            console.log(`   buscador_frame 404 (${_buscador404Count}/${BUSCADOR_404_LIMIT}) — aguardando 90s...`);
            await sleep(90_000);
          }
          return;
        }

        // 401 ou erro de crypto na primeira tentativa: recria sessão e retenta
        if ((is401 || isCrypto) && attempts < MAX_ATTEMPTS) {
          console.log(`   Sessão expirada em ${ev.name} — recriando e retentando...`);
          try {
            session = await getSession(cookie);
          } catch (sessErr) {
            console.error(`   Sessão falhou na recriação: ${sessErr.message}`);
            await markQueueError(ev.id);
            break;
          }
          continue; // retenta
        }

        await markQueueError(ev.id);
        console.error(`   Erro: ${ev.name}: ${err.message}`);
        break;
      }
    }

    if (i < batch.length - 1) {
      const delay = 1500 + Math.random() * 1500;
      await sleep(delay);
    }
  }
}

// ── Sessão ECDH dedicada para freebet ─────────────────────────────────────────
// freebet_proxy-v2.php exige handshake próprio com contexto converter-freebet.
// Mantida separada da sessão buscador.

let _freebetSession = null;
let _freebetSessionCookieHash = '';
let _freebetSessionExpiresAt = 0;
const FREEBET_SESSION_TTL = 90_000; // 90s — conservador, servidor pode expirar antes dos 4 min declarados

// Contador de falhas INVALID_SESSION consecutivas em ciclos de freebet.
// Quando atinge o limite, força renovação completa do cookie em vez de
// ficar criando sessões que o servidor rejeita imediatamente.
let _freebetConsecutiveFailures = 0;
const FREEBET_FAILURE_LIMIT = 3;

async function createFreebetSession(cookie, _retries = 2) {
  const cookieWithCf = await mergeCfClearance(cookie);

  const hdrs = {
    'User-Agent':        UA,
    'Accept':            '*/*',
    'Accept-Language':   'pt-BR,pt;q=0.9',
    'Cache-Control':     'no-cache',
    'Origin':            BASE,
    'Referer':           `${BASE}/index.php?page=converter-freebet`,
    'Cookie':            cookieWithCf,
    'Sec-Fetch-Dest':    'empty',
    'Sec-Fetch-Mode':    'cors',
    'Sec-Fetch-Site':    'same-origin',
    'Sec-Ch-Ua':         '"Chromium";v="148", "Google Chrome";v="148", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile':  '?0',
    'Sec-Ch-Ua-Platform':'"Windows"',
    'X-Requested-With':  'XMLHttpRequest',
  };

  // 1. Nonce para o handshake (endpoint específico da app)
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_app_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`freebet: proxy_nonce_app_handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await safeJson(nonceRes, 'freebet: proxy_nonce_app_handshake');
  if (!handshakeNonce) throw new Error('freebet: app handshake nonce inválido');

  // Captura cookies retornados pelo nonce (ex: PHPSESSID renovado)
  const nonceCookies = extractSetCookies(nonceRes.headers);
  const hdrs2 = nonceCookies.length
    ? { ...hdrs, 'Cookie': mergeCookies(hdrs['Cookie'], nonceCookies) }
    : hdrs;

  // 2. Gera par de chaves ECDH
  const keyPair    = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw     = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // 3. Handshake via app_handshake.php (endpoint dedicado do freebet/app)
  const hsRes = await fetch(`${BASE}/api/app_handshake.php`, {
    method:  'POST',
    headers: { ...hdrs2, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body:    JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) {
    const body = await hsRes.text().catch(() => '');
    // NONCE_INVALID: nonce expirou durante geração ECDH — busca nonce novo e retenta
    if (body.includes('NONCE_INVALID') && _retries > 0) {
      console.log(`   Freebet: NONCE_INVALID — retentando handshake (${_retries} tentativa(s) restante(s))...`);
      await sleep(300);
      return createFreebetSession(cookie, _retries - 1);
    }
    throw new Error(`freebet: app_handshake falhou (${hsRes.status}) ${body.slice(0, 80)}`);
  }
  const hs = await safeJson(hsRes, 'freebet: app_handshake');
  if (!hs.success) throw new Error(`freebet: app_handshake negado: ${JSON.stringify(hs).slice(0, 100)}`);

  // Captura cookies retornados pelo handshake (token de sessão ECDH do freebet)
  const hsCookies = extractSetCookies(hsRes.headers);
  const finalHdrs = hsCookies.length
    ? { ...hdrs2, 'Cookie': mergeCookies(hdrs2['Cookie'], hsCookies) }
    : hdrs2;

  // session_token é necessário — freebet_proxy-v2.php exige X-Session-Token
  const sessionToken = hs.session_token ?? null;
  console.log(`   Sessão ECDH freebet criada | session_token: ${sessionToken ? sessionToken.slice(0,12)+'...' : 'AUSENTE'} | hs.success: ${hs.success}`);

  // 4. Deriva chave AES — info string: 'app-aes256-v1'
  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);

  // IMPORTANT: app session uses 32-byte zero salt (not empty) — matches app-crypto-loader.js
  const aesKey = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('app-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt'],
  );

  return { aesKey, hdrs: finalHdrs, sessionToken };
}

async function getFreebetSession(cookie) {
  const cookieKey = cookie.slice(0, 32);
  // Reutiliza apenas se o cookie não mudou E a sessão ainda não expirou
  if (_freebetSession && _freebetSessionCookieHash === cookieKey && Date.now() < _freebetSessionExpiresAt) {
    return _freebetSession;
  }
  _freebetSession = await createFreebetSession(cookie);
  _freebetSessionCookieHash = cookieKey;
  _freebetSessionExpiresAt = Date.now() + FREEBET_SESSION_TTL;
  return _freebetSession;
}

function invalidateFreebetSession() {
  _freebetSession = null;
  _freebetSessionCookieHash = '';
  _freebetSessionExpiresAt = 0;
}

// ── Freebet queue ─────────────────────────────────────────────────────────────

async function fetchFreebetFromSuperMonitor(freebetSession, { bookmaker, value, min_odd, max_odd, pa_filter, days }) {
  const freebetHdrs = {
    ...freebetSession.hdrs,
    'Accept': 'application/json',
  };

  // Passo 0: chama bookmakers primeiro — igual ao browser, inicializa contexto da sessão
  // Sem essa chamada o servidor retorna resultados incompletos no freebet/convert
  try {
    const bmNonceR = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: freebetHdrs });
    if (bmNonceR.ok) {
      const { nonce: bmNonce } = await safeJson(bmNonceR, 'freebet: bookmakers nonce').catch(() => ({ nonce: null }));
      if (bmNonce) {
        const bmCookies = extractSetCookies(bmNonceR.headers);
        const bmHdrs = bmCookies.length
          ? { ...freebetHdrs, 'Cookie': mergeCookies(freebetHdrs['Cookie'], bmCookies) }
          : freebetHdrs;
        await fetch(`${BASE}/api/freebet_proxy-v2.php?endpoint=api%2Fv2%2Fbookmakers`, {
          headers: { ...bmHdrs, 'X-Proxy-Nonce': bmNonce },
        });
      }
    }
  } catch { /* best-effort — não bloqueia o convert */ }

  // Nonce para a requisição freebet — proxy_nonce_freebet.php retorna 404, usa o genérico
  const nonceR = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: freebetHdrs });
  if (!nonceR.ok) throw new Error(`freebet: proxy_nonce falhou (${nonceR.status})`);
  const { nonce } = await safeJson(nonceR, 'freebet: proxy_nonce');
  if (!nonce) throw new Error('freebet: nonce vazio');

  // Captura cookies do nonce e propaga para o proxy
  const nonceCookies = extractSetCookies(nonceR.headers);
  const proxyHdrs = nonceCookies.length
    ? { ...freebetHdrs, 'Cookie': mergeCookies(freebetHdrs['Cookie'], nonceCookies) }
    : freebetHdrs;

  // 'days' controla a janela de eventos retornados pelo SuperMonitor.
  // Padrão 7 = busca completa (7 dias). O frontend filtra a janela exata.
  const daysParam = String(Math.min(30, Math.max(1, parseInt(String(days ?? 7), 10) || 7)));
  const qs = new URLSearchParams({
    endpoint:  'api/v2/freebet/convert',
    bookmaker: String(bookmaker),
    value:     String(value),
    min_odd:   String(min_odd),
    max_odd:   String(max_odd),
    pa_filter: String(pa_filter),
    days:      daysParam,
  }).toString();

  // NOTA: browser não envia X-Session-Token no freebet_proxy — apenas X-Proxy-Nonce
  // Enviar o token pode limitar os resultados retornados pelo servidor
  const res = await fetch(`${BASE}/api/freebet_proxy-v2.php?${qs}`, {
    headers: { ...proxyHdrs, 'X-Proxy-Nonce': nonce },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`   [freebet] proxy ${res.status}: ${body.slice(0, 300)}`);
    console.error(`   [freebet-debug] nonce=${nonce?.slice(0,8)}... | session_token=${freebetSession.sessionToken ? 'presente' : 'AUSENTE'} | qs=${qs.slice(0,100)}`);
    throw new Error(`freebet_proxy falhou (${res.status})`);
  }

  const enc = await safeJson(res, 'freebet: freebet_proxy-v2');
  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const plain    = await subtle.decrypt(
      { name: 'AES-CBC', iv: encBytes.slice(0, 16) },
      freebetSession.aesKey,
      encBytes.slice(16),
    );
    const decoded = new TextDecoder().decode(plain);
    if (!decoded.trim()) {
      throw new Error('freebet: payload vazio após descriptografia — sessão ECDH corrompida, tente novamente');
    }
    try {
      return JSON.parse(decoded);
    } catch (_e) {
      throw new Error(`freebet: JSON inválido após descriptografia — ${decoded.slice(0, 80)}`);
    }
  }
  return enc;
}

async function processFreebetCycle() {
  let pending = [];
  try {
    const res = await sbFetch(
      'freebet_queue?status=eq.pending&order=created_at.asc&limit=5',
      'GET', null, { 'Accept': 'application/json' },
    );
    pending = await res.json();
    if (!Array.isArray(pending)) pending = [];
  } catch { return; }

  if (!pending.length) return;

  const t = new Date().toLocaleTimeString('pt-BR');
  console.log(`\n[${t}] ${pending.length} freebet(s) na fila`);

  let cookie = await getCookie();
  if (!cookie) {
    console.error('   Freebet: sem cookie válido');
    return;
  }

  // Se atingimos o limite de falhas INVALID_SESSION consecutivas, o cookie
  // provavelmente está com problemas. Tenta renovar antes de qualquer coisa.
  if (_freebetConsecutiveFailures >= FREEBET_FAILURE_LIMIT) {
    console.log(`   Freebet: ${_freebetConsecutiveFailures} falhas INVALID_SESSION consecutivas — renovando cookie...`);
    _freebetConsecutiveFailures = 0;
    _cookie = null;
    _cookieValidatedAt = 0;
    const renewed = await autoRenewCookie();
    if (renewed) {
      cookie = renewed;
      _cookie = renewed;
      _cookieValidatedAt = Date.now();
    } else {
      console.error('   Freebet: renovação falhou — abortando ciclo');
      return;
    }
  }

  // Sempre cria sessão fresca por ciclo — evita INVALID_SESSION por TTL/cache
  let freebetSession;
  try {
    invalidateFreebetSession();
    freebetSession = await createFreebetSession(cookie);
    _freebetSession = freebetSession;
    _freebetSessionCookieHash = cookie.slice(0, 32);
    _freebetSessionExpiresAt = Date.now() + FREEBET_SESSION_TTL;
  } catch (err) {
    console.error(`   Freebet: sessão ECDH falhou: ${err.message}`);
    return;
  }

  for (const req of pending) {
    await sbFetch(
      `freebet_queue?id=eq.${req.id}`,
      'PATCH', { status: 'processing', updated_at: new Date().toISOString() },
    );

    try {
      let result;
      try {
        result = await fetchFreebetFromSuperMonitor(freebetSession, req);
      } catch (err) {
        // Sessão expirou ou foi invalidada → tenta UMA vez com nova sessão.
        // Não tenta uma terceira vez — INVALID_SESSION repetido indica problema
        // no cookie/servidor que não é resolvido criando mais sessões.
        const is401    = err.message.includes('401') || err.message.includes('INVALID_SESSION') || err.message.includes('NEEDS_HANDSHAKE');
        const isCrypto = err.message.includes('operation failed') || err.message.includes('operation-specific');

        if (isCrypto) {
          // Erro de crypto = sessão ECDH desincronizou (servidor regenerou chave).
          // Recriar a sessão ECDH resolve — NÃO precisa renovar cookie.
          console.log(`   Freebet: crypto error — recriando sessão ECDH e retentando...`);
          invalidateFreebetSession();
          freebetSession = await createFreebetSession(cookie);
          _freebetSession = freebetSession;
          _freebetSessionCookieHash = cookie.slice(0, 32);
          _freebetSessionExpiresAt = Date.now() + FREEBET_SESSION_TTL;
          result = await fetchFreebetFromSuperMonitor(freebetSession, req);
        } else if (is401) {
          // 401 no freebet = PHPSESSID esgotado — precisa de cookie novo.
          console.log(`   Freebet: PHPSESSID esgotado — renovando cookie e retentando...`);
          const renewed = await autoRenewCookie();
          if (renewed) {
            cookie = renewed;
            _cookie = renewed;
            _cookieValidatedAt = Date.now();
          }
          invalidateFreebetSession();
          freebetSession = await createFreebetSession(cookie);
          _freebetSession = freebetSession;
          _freebetSessionCookieHash = cookie.slice(0, 32);
          _freebetSessionExpiresAt = Date.now() + FREEBET_SESSION_TTL;
          result = await fetchFreebetFromSuperMonitor(freebetSession, req);
        } else {
          throw err;
        }
      }
      // Sucesso: reseta contador de falhas
      _freebetConsecutiveFailures = 0;
      await sbFetch(
        `freebet_queue?id=eq.${req.id}`,
        'PATCH', { status: 'done', result, updated_at: new Date().toISOString() },
      );
      console.log(`   Freebet OK: ${req.bookmaker} R$${req.value}`);
    } catch (err) {
      await sbFetch(
        `freebet_queue?id=eq.${req.id}`,
        'PATCH', { status: 'error', error_msg: err.message, updated_at: new Date().toISOString() },
      );
      console.error(`   Freebet erro: ${req.bookmaker} R$${req.value}: ${err.message}`);
      if (err.message.includes('401') || err.message.includes('INVALID_SESSION') || err.message.includes('NEEDS_HANDSHAKE')) {
        invalidateFreebetSession();
        _freebetConsecutiveFailures++;
      } else if (err.message.includes('operation failed') || err.message.includes('operation-specific')) {
        // Crypto error no catch externo = 2ª tentativa também falhou → invalida sessão
        invalidateFreebetSession();
      } else if (err.message.includes('403') || err.message.includes('handshake')) {
        invalidateFreebetSession();
      }
    }

    await sleep(500 + Math.random() * 500);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCANNER (Duplo Green / Alertas)
// ═══════════════════════════════════════════════════════════════════════════════

// ── Scanner ECDH session ──────────────────────────────────────────────────────
const SCANNER_SESSION_TTL = 30_000;  // 30s — servidor limita ~3 calls por session_token (ciclo=20s),
                                     // recria proativamente antes de atingir o limite
let _scannerSession = null;
let _scannerSessionCookieHash = '';
let _scannerSessionExpiresAt  = 0;

async function createScannerSession(cookie) {
  const cookieWithCf = await mergeCfClearance(cookie);
  const hdrs = {
    'User-Agent':        UA,
    'Accept':            '*/*',
    'Accept-Language':   'pt-BR,pt;q=0.6',
    'Cache-Control':     'no-cache',
    'Pragma':            'no-cache',
    'Origin':            BASE,
    'Referer':           `${BASE}/index.php?page=alertas-scanner`,
    'Cookie':            cookieWithCf,
    'Sec-Fetch-Dest':    'empty',
    'Sec-Fetch-Mode':    'cors',
    'Sec-Fetch-Site':    'same-origin',
    'Sec-Ch-Ua':         '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile':  '?0',
    'Sec-Ch-Ua-Platform':'"Windows"',
    'Sec-Gpc':           '1',
  };

  // Step 1: nonce para o handshake do scanner
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_scanner_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`scanner: nonce handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await safeJson(nonceRes, 'scanner: proxy_nonce_scanner_handshake');
  if (!handshakeNonce) throw new Error('scanner: handshake nonce inválido');

  const nonceCookies = extractSetCookies(nonceRes.headers);
  const hdrs2 = nonceCookies.length
    ? { ...hdrs, 'Cookie': mergeCookies(hdrs['Cookie'], nonceCookies) }
    : hdrs;

  // Step 2: par de chaves ECDH P-256
  const keyPair    = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw     = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // Step 3: handshake
  const hsRes = await fetch(`${BASE}/api/scanner_handshake.php`, {
    method:  'POST',
    headers: { ...hdrs2, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body:    JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) {
    const body = await hsRes.text().catch(() => '');
    throw new Error(`scanner: handshake falhou (${hsRes.status}) ${body.slice(0, 80)}`);
  }
  const hs = await safeJson(hsRes, 'scanner: scanner_handshake');
  if (!hs.success) throw new Error(`scanner: handshake negado: ${JSON.stringify(hs).slice(0, 100)}`);

  const hsCookies = extractSetCookies(hsRes.headers);
  const finalHdrs = hsCookies.length
    ? { ...hdrs2, 'Cookie': mergeCookies(hdrs2['Cookie'], hsCookies) }
    : hdrs2;

  // Step 4: deriva chave AES — info string: 'scanner-aes256-v1'
  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('scanner-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
  );

  const sessionToken = hs.session_token ?? null;
  console.log('   Sessão ECDH scanner criada');
  return { aesKey, hdrs: finalHdrs, sessionToken };
}

async function getScannerSession(cookie) {
  const key = cookie.slice(0, 32);
  if (_scannerSession && _scannerSessionCookieHash === key && Date.now() < _scannerSessionExpiresAt) {
    return _scannerSession;
  }
  _scannerSession = await createScannerSession(cookie);
  _scannerSessionCookieHash = key;
  _scannerSessionExpiresAt  = Date.now() + SCANNER_SESSION_TTL;
  return _scannerSession;
}

function invalidateScannerSession() {
  _scannerSession = null;
  _scannerSessionCookieHash = '';
  _scannerSessionExpiresAt  = 0;
}

// ── Fetch scanner snapshot (signals_proxy.php) ────────────────────────────────
async function fetchScannerSnapshot(scannerSession) {
  // Nonce genérico — mesmo que o browser usa para signals_proxy
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: scannerSession.hdrs });
  if (!nonceRes.ok) throw new Error(`scanner: proxy_nonce falhou (${nonceRes.status})`);
  const { nonce } = await safeJson(nonceRes, 'scanner: proxy_nonce');

  const nonceCookies = extractSetCookies(nonceRes.headers);
  const hdrs = nonceCookies.length
    ? { ...scannerSession.hdrs, 'Cookie': mergeCookies(scannerSession.hdrs['Cookie'], nonceCookies) }
    : scannerSession.hdrs;

  const sessionHdr = scannerSession.sessionToken
    ? { 'X-Session-Token': scannerSession.sessionToken }
    : {};

  const res = await fetch(`${BASE}/api/signals_proxy.php?limit=3000`, {
    headers: { ...hdrs, 'X-Proxy-Nonce': nonce, 'Accept': 'application/json', ...sessionHdr },
  });
  if (!res.ok) throw new Error(`scanner: signals_proxy falhou (${res.status})`);

  const enc = await safeJson(res, 'scanner: signals_proxy');
  if (enc.needs_handshake) throw new Error('401 needs_handshake — scanner ECDH expirou');

  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const plain    = await subtle.decrypt(
      { name: 'AES-CBC', iv: encBytes.slice(0, 16) },
      scannerSession.aesKey,
      encBytes.slice(16)
    );
    return JSON.parse(new TextDecoder().decode(plain));
  }
  return enc;
}

// ── Scanner SSE token (sse_token_proxy.php) ───────────────────────────────────
// Filtros completos — aceita todos os tipos/casas/ligas disponíveis na plataforma
const SCANNER_FILTERS = {
  tipos:    ['ML'],
  casas: [
    '7games','Alfabet','Apostaganha','Betbra','BetfairSB','BetssonSO','Tradeball',
    'Betnacional','BetmgmSO','Betao','BetanoSO','BetsulSO','BetesporteSO','Br4betSO',
    'EsportesdasorteSO','EsportivaSO','EstrelabetSO','JogodeouroSO','StakeSO',
    'Sporty','Sporty 1UP','Sporty 2UP',
    'NovibetSO','KTOso','VaidebetSO','VivasorteSO','VersusbetSO',
    'Betano (PA)','Novibet (PA)','Betsul (PA)','Betesporte (PA)','Betsson (PA)',
    'Bet365 (PA)','KTO (PA)','Vivasorte (PA)','Sportingbet (PA)','Superbet (PA)',
    'Apostabet (PA)','Br4bet (PA)','Esportesdasorte (PA)','Esportiva (PA)',
    'Sortenabet (PA)','Betmgm (PA)','Estrelabet (PA)','Bet7k (PA)','Jogodeouro (PA)',
    'Meridianbet (PA)','Versusbet (PA)','Vaidebet (PA)',
  ],
  profitMin:          -2.5,
  maxDaysDiff:         2,
  empate_sempa:        false,
  empate_compa:        true,
  ligas: [
    'Alemanha - Bundesliga 2','Alemanha - Bundesliga','Alemanha - DFB-Pokal',
    'Áustria - Bundesliga','Bélgica - Copa','Bélgica - Pro League',
    'Dinamarca - Superliga','Escócia - Premiership','Espanha - Copa do Rei',
    'Espanha - LaLiga','Espanha - LaLiga 2','França - Copa da França',
    'França - Ligue 1','França - Ligue 2','Holanda - Eredivisie',
    'Inglaterra - EFL Cup','Inglaterra - Championship','Inglaterra - FA Cup',
    'Inglaterra - League One','Inglaterra - League Two','Inglaterra - Premier League',
    'Itália - Coppa Italia','Itália - Serie A','Itália - Serie B',
    'Noruega - Eliteserien','Portugal - Primeira Liga','Portugal - Taça de Portugal',
    'Suécia - Allsvenskan','Suíça - Super League','Turquia - Süper Lig',
    'UEFA - Champions League','UEFA - Conference League','UEFA - Europa League',
    'Europa - Eliminatórias da Copa','Argentina - Superliga','Argentina - Copa Argentina',
    'Bolívia - Divisón Profesional','Brasil - Copa do Brasil','Brasil - Serie A',
    'Brasil - Serie B','Equador - Liga Pro Serie A','Sul-Americana','Libertadores',
    'Colômbia - Categoría Primera A','Colômbia - Primera A','Peru - Liga 1',
    'Estados Unidos - MLS','México - Liga de Expansion','México - Liga MX',
    'Arábia Saudita - Saudi Pro League','China - Super League','Japão - J1 League',
    'Austrália - A-League','FIFA - Copa do Mundo','FIFA - Qualificação Copa',
    'CONMEBOL UEFA - Copa','__RESTO_MUNDO__',
  ],
  casasPrioridade: [],
};

async function fetchScannerSseToken(cookie) {
  const hdrs = {
    'User-Agent':        UA,
    'Accept':            'application/json',
    'Content-Type':      'application/json',
    'Origin':            BASE,
    'Referer':           `${BASE}/index.php?page=alertas-scanner`,
    'Cookie':            cookie,
    'Cache-Control':     'no-cache',
    'Pragma':            'no-cache',
    'Sec-Fetch-Dest':    'empty',
    'Sec-Fetch-Mode':    'cors',
    'Sec-Fetch-Site':    'same-origin',
    'Sec-Ch-Ua':         '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile':  '?0',
    'Sec-Ch-Ua-Platform':'"Windows"',
    'Sec-Gpc':           '1',
  };

  const res = await fetch(`${BASE}/api/sse_token_proxy.php`, {
    method:  'POST',
    headers: hdrs,
    body:    JSON.stringify({ filters: SCANNER_FILTERS }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`scanner: sse_token_proxy falhou (${res.status}) ${body.slice(0, 80)}`);
  }
  const data = await safeJson(res, 'scanner: sse_token_proxy');
  if (!data.success || !data.temp_token) {
    throw new Error(`scanner: sse_token inválido: ${JSON.stringify(data).slice(0, 120)}`);
  }
  return data; // { success, temp_token, sse_url, expires_in, ... }
}

// ── Decrypt SSE payload ───────────────────────────────────────────────────────
// Chave = SHA-256("SSE::" + tempToken) → AES-CBC (IV = primeiros 16 bytes)
// WebCrypto AES-CBC já remove PKCS7 padding automaticamente — NÃO fazer manual.
async function decryptSsePayload(encryptedBase64, tempToken) {
  const keyData = new TextEncoder().encode('SSE::' + tempToken);
  const hashBuf = await subtle.digest('SHA-256', keyData);
  const aesKey  = await subtle.importKey('raw', hashBuf, { name: 'AES-CBC' }, false, ['decrypt']);

  const enc   = base64ToBytes(encryptedBase64);
  const iv    = enc.slice(0, 16);
  const ct    = enc.slice(16);
  const plain = await subtle.decrypt({ name: 'AES-CBC', iv }, aesKey, ct);

  return JSON.parse(new TextDecoder().decode(plain));
}

// ── Normaliza sinal para a tabela scanner_signals ─────────────────────────────
function normalizeSignal(raw) {
  return {
    id:            raw.id,
    tipo:          raw.tipo          ?? raw.type   ?? null,
    jogo:          raw.jogo          ?? raw.match  ?? raw.game ?? null,
    casa1:         raw.casa1         ?? raw.bookmaker1 ?? null,
    casa2:         raw.casa2         ?? raw.bookmaker2 ?? null,
    casa3:         raw.casa3         ?? raw.bookmaker3 ?? null,
    campeonato:    raw.campeonato    ?? raw.league ?? raw.competition ?? null,
    data_evento:   raw.data          ?? raw.data_evento ?? raw.event_date ?? null,
    profit_margin: raw.profit_margin ?? raw.profit ?? 0,
    raw_data:      raw,
    updated_at:    new Date().toISOString(),
  };
}

// ── Supabase scanner helpers ──────────────────────────────────────────────────
async function upsertSignals(signals) {
  if (!signals.length) return;
  const rows = signals.map(normalizeSignal);
  const res  = await sbFetch('scanner_signals', 'POST', rows, {
    'Prefer': 'resolution=merge-duplicates',
  });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`upsertSignals falhou (${res.status}): ${body.slice(0, 120)}`);
  }
}

async function deleteSignals(ids) {
  if (!ids.length) return;
  const inList = ids.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
  await sbFetch(`scanner_signals?id=in.(${inList})`, 'DELETE');
}

async function replaceAllSignals(signals) {
  // Delete tudo (filter sempre verdadeiro via timestamp epoch)
  await sbFetch('scanner_signals?updated_at=gte.1970-01-01T00:00:00.000Z', 'DELETE');
  if (signals.length) await upsertSignals(signals);
}

async function markSignalsNew(ids) {
  if (!ids.length) return;
  const inList = ids.map(id => `"${String(id).replace(/"/g, '')}"`).join(',');
  const now    = new Date().toISOString();
  await sbFetch(`scanner_signals?id=in.(${inList})`, 'PATCH', { is_new: true, new_at: now });
}

async function clearOldNewFlags() {
  const cutoff = new Date(Date.now() - 60_000).toISOString();
  await sbFetch(
    `scanner_signals?is_new=eq.true&new_at=lt.${cutoff}`,
    'PATCH', { is_new: false }
  );
}

/**
 * Deletes scanner signals whose event has already started.
 * Uses a 5-minute grace window so we don't delete signals seconds before
 * kick-off while the user is still placing bets.
 *
 * This is the primary defence against SuperMonitor returning stale events
 * that never disappear from their feed — we purge them ourselves.
 */
async function cleanupPastSignals() {
  try {
    // cutoff = 5 minutes ago — events that started more than 5 min ago are gone
    const cutoff = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const res = await sbFetch(
      `scanner_signals?data_evento=not.is.null&data_evento=lt.${cutoff}`,
      'DELETE',
    );
    // Log only when something was actually deleted
    if (res.ok) {
      const body = await res.text().catch(() => '');
      // PostgREST returns the deleted rows when Prefer: return=representation is set;
      // without it the body is empty on success — either way we succeeded.
      const t = new Date().toLocaleTimeString('pt-BR');
      if (body && body !== '[]' && body.trim().length > 2) {
        console.log(`[Scanner ${t}] cleanupPastSignals: removidos sinais passados`);
      }
    }
  } catch (err) {
    console.error('[Scanner] cleanupPastSignals erro:', err.message);
  }
}

// ── Verifica flag de pausa do scanner ─────────────────────────────────────────
async function isScannerPaused() {
  try {
    const res  = await sbFetch('app_config?key=eq.scanner_paused&select=value');
    const rows = await res.json();
    return rows?.[0]?.value === 'true';
  } catch { return false; }
}

// ── SSE parser (texto → eventos) ──────────────────────────────────────────────
function makeSseParser(onEvent) {
  let eventType = '';
  let dataLines = [];
  return (line) => {
    if (line.startsWith('event:')) {
      eventType = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    } else if (line === '') {
      if (dataLines.length) {
        const data = dataLines.join('\n');
        onEvent(eventType || 'message', data);
      }
      eventType = '';
      dataLines = [];
    }
  };
}

// ── Conexão SSE via raw HTTPS ─────────────────────────────────────────────────
function connectScannerSse(sseUrl, onLine, onClose) {
  const u   = new URL(sseUrl);
  const lib = u.protocol === 'https:' ? https : http;
  const req = lib.request(
    {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method:   'GET',
      headers:  {
        'Accept':          'text/event-stream',
        'Cache-Control':   'no-cache',
        'Connection':      'keep-alive',
        'User-Agent':      UA,
      },
      // timeout: 0 — stream indefinido; nunca força fechamento por inatividade
    },
    res => {
      console.log(`[Scanner] SSE status HTTP: ${res.statusCode} | Content-Type: ${res.headers['content-type'] ?? '(sem)'}`);
      let buf = '';
      let bytesReceived = 0;
      res.on('data', chunk => {
        bytesReceived += chunk.length;
        buf += chunk.toString('utf8');
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) onLine(line);
      });
      res.on('end',   () => {
        const isJson = (res.headers['content-type'] ?? '').includes('json');
        if (isJson && buf.trim()) {
          console.log(`[Scanner] SSE body (JSON): ${buf.trim().slice(0, 200)}`);
        }
        console.log(`[Scanner] SSE end — ${bytesReceived} bytes`);
        onClose(null);
      });
      res.on('error', err => onClose(err));
    }
  );
  req.on('error', err => onClose(err));
  req.end();
  return req;
}

// ── Processa um evento SSE ────────────────────────────────────────────────────
async function handleSseEvent(type, rawData, tempToken) {
  let parsed;
  try {
    parsed = await decryptSsePayload(rawData, tempToken);
  } catch {
    // Pode ser ping ou evento não-criptografado
    try { parsed = JSON.parse(rawData); } catch { return; }
  }
  if (!parsed) return;

  const t      = new Date().toLocaleTimeString('pt-BR');
  const action = parsed.action ?? type;

  if (action === 'snapshot') {
    const signals = parsed.signals ?? parsed.data ?? [];
    console.log(`[Scanner ${t}] snapshot SSE: ${signals.length} sinais`);
    await replaceAllSignals(signals);

  } else if (action === 'delta') {
    const added   = parsed.added   ?? [];
    const updated = parsed.updated ?? [];
    const removed = parsed.removed ?? parsed.deleted ?? [];
    const newIds  = parsed.new     ?? parsed.new_ids  ?? [];

    if (added.length || updated.length) await upsertSignals([...added, ...updated]);
    if (removed.length) {
      const ids = removed.map(r => (typeof r === 'string' ? r : r?.id ?? r));
      await deleteSignals(ids);
    }
    if (newIds.length) await markSignalsNew(newIds);

    if (added.length || updated.length || removed.length || newIds.length) {
      console.log(`[Scanner ${t}] delta +${added.length} ~${updated.length} -${removed.length} new=${newIds.length}`);
    }

  } else if (action === 'new' || action === 'reopened') {
    const signals = parsed.signals ?? (parsed.id ? [parsed] : []);
    if (signals.length) {
      await upsertSignals(signals);
      await markSignalsNew(signals.map(s => s.id));
      console.log(`[Scanner ${t}] novo sinal: ${signals.map(s => s.jogo ?? s.id).join(', ')}`);
    }

  } else if (action === 'ping' || action === 'heartbeat' || action === 'connected') {
    // ignora keepalive

  } else if (parsed.signals || parsed.data) {
    // update genérico com array de sinais
    const signals = parsed.signals ?? parsed.data ?? [];
    if (signals.length) await upsertSignals(signals);
  }

  // Limpa flags "new" expiradas
  await clearOldNewFlags().catch(() => {});
}

// ── Loop principal do scanner (polling de snapshot) ───────────────────────────
// Estratégia: polling do signals_proxy.php a cada 15s com diff para detectar
// sinais novos/removidos. SSE direto requer autenticação de sessão de browser
// que não está disponível no contexto do daemon.
const SCANNER_POLL_INTERVAL = 20_000; // 20s — suficiente para scanner, evita 429
let   _prevSignalIds        = new Set();
// Flag: true no primeiro ciclo após o startup do processo.
// No primeiro ciclo nunca marcamos sinais como is_new — o banco já continha
// todos eles antes do reinício, apenas populamos _prevSignalIds.
let   _firstScannerCycle    = true;

// Contador de falhas 401 consecutivas no scanner.
// Após o limite, força renovação do cookie — a sessão ECDH não resolve
// se o próprio cookie base estiver expirado.
let   _scannerConsecutiveFailures = 0;
const SCANNER_FAILURE_LIMIT       = 3;

// Backoff progressivo para falhas de renovação de cookie.
// Evita loop infinito de tentativas que queima créditos 2captcha e causa ban.
let _renewFailCount = 0;
// Esperas em ms: 2min → 5min → 15min → 30min (cap)
const RENEW_BACKOFF_MS = [2 * 60_000, 5 * 60_000, 15 * 60_000, 30 * 60_000];

async function runScannerSse() {
  console.log('[Scanner] Loop iniciado (modo polling 15s).');

  // Ao iniciar, limpa qualquer is_new=true que ficou do ciclo anterior
  // (evita que usuários vejam alertas de sinais antigos no reload).
  await sbFetch(
    'scanner_signals?is_new=eq.true',
    'PATCH', { is_new: false },
  ).catch(() => {});

  while (true) {
    // Pausa manual via Supabase app_config scanner_paused=true
    if (await isScannerPaused()) {
      console.log('[Scanner] Pausado — aguardando 30s...');
      await sleep(30_000);
      continue;
    }

    const cookie = await getCookie();
    if (!cookie) {
      _renewFailCount++;
      const backoffMs = RENEW_BACKOFF_MS[Math.min(_renewFailCount - 1, RENEW_BACKOFF_MS.length - 1)];
      const backoffMin = Math.round(backoffMs / 60_000);
      console.error(
        `[Scanner] Sem cookie válido (falha #${_renewFailCount}) — ` +
        `aguardando ${backoffMin}min antes de tentar novamente. ` +
        `Verifique se o login foi bloqueado e renove o cookie manualmente se necessário.`,
      );
      await sleep(backoffMs);
      continue;
    }
    // Cookie obtido — reseta contador de backoff
    _renewFailCount = 0;

    try {
      // Sessão ECDH scanner
      const scannerSession = await getScannerSession(cookie);

      // Snapshot completo
      let snapshot;
      try {
        snapshot = await fetchScannerSnapshot(scannerSession);
      } catch (err) {
        if (err.message.includes('401') || err.message.includes('needs_handshake')) {
          invalidateScannerSession();
        }
        throw err;
      }

      const signals = Array.isArray(snapshot)
        ? snapshot
        : (snapshot?.signals ?? snapshot?.data ?? []);

      const t = new Date().toLocaleTimeString('pt-BR');

      // Diff: detecta IDs novos para marcar is_new
      const currentIds = new Set(signals.map(s => s.id));

      // No primeiro ciclo após reinício o _prevSignalIds está vazio, então
      // TODOS os sinais pareceriam "novos". Evitamos isso: apenas populamos
      // o Set e não marcamos nenhum como is_new — eles já estavam no banco.
      const isFirstCycle = _firstScannerCycle;
      _firstScannerCycle = false;

      const newIds = isFirstCycle
        ? []
        : signals.filter(s => !_prevSignalIds.has(s.id)).map(s => s.id);

      // Upsert todos os sinais (merge-duplicates)
      await upsertSignals(signals);

      // Remove sinais que sumiram do snapshot
      const removedIds = isFirstCycle
        ? []   // no primeiro ciclo não apagamos nada — _prevSignalIds está vazio
        : [..._prevSignalIds].filter(id => !currentIds.has(id));
      if (removedIds.length) await deleteSignals(removedIds);

      // Marca novos (nunca no primeiro ciclo)
      if (newIds.length) await markSignalsNew(newIds);

      // Limpa flags expiradas
      await clearOldNewFlags().catch(() => {});

      // Sempre remove sinais cujo evento já começou, independente do que
      // o SuperMonitor retornou — defesa contra feeds congelados.
      await cleanupPastSignals().catch(() => {});

      _prevSignalIds = currentIds;

      // Ciclo OK — reseta contador de falhas
      _scannerConsecutiveFailures = 0;

      // Log
      if (isFirstCycle) {
        console.log(`[Scanner ${t}] startup: ${signals.length} sinais carregados (sem marcar novos)`);
      } else if (newIds.length || removedIds.length) {
        console.log(`[Scanner ${t}] +${newIds.length} novos, -${removedIds.length} removidos | total ${signals.length}`);
      } else {
        // Log silencioso periódico (a cada ~5 min = 20 ciclos)
        if (Math.random() < 0.05) {
          console.log(`[Scanner ${t}] ${signals.length} sinais (sem mudanças)`);
        }
      }

    } catch (err) {
      console.error(`[Scanner] Erro no ciclo: ${err.message}`);

      const is401 = err.message.includes('401') || err.message.includes('needs_handshake') || err.message.includes('INVALID_SESSION');
      // 403 = sessão ECDH expirou no servidor (rate-limit por session_token) → recria sessão, NÃO faz login
      const is403 = err.message.includes('403');
      // Erro de crypto do Windows (AES-CBC decrypt falhou) = sessão ECDH corrompida → recria sessão
      const isCryptoErr = err.message.includes('operation failed') || err.message.includes('operation-specific');

      if (is401) {
        invalidateScannerSession();
        _scannerConsecutiveFailures++;

        // Após N falhas 401 consecutivas, o cookie base provavelmente expirou —
        // renova antes de tentar criar mais sessões ECDH.
        if (_scannerConsecutiveFailures >= SCANNER_FAILURE_LIMIT) {
          console.log(`[Scanner] ${_scannerConsecutiveFailures} falhas 401 consecutivas — renovando cookie...`);
          _scannerConsecutiveFailures = 0;
          _cookie = null;
          _cookieValidatedAt = 0;
          const renewed = await autoRenewCookie();
          if (renewed) {
            _cookie = renewed;
            _cookieValidatedAt = Date.now();
          }
          await sleep(5_000);
          continue;
        }
      } else if (is403 || isCryptoErr) {
        // 403 ou erro de crypto: session_token esgotado ou dados corrompidos.
        // Recria a sessão ECDH — NÃO incrementa o contador de falha de cookie
        // e NÃO aciona login. Apenas aguarda o próximo ciclo com sessão nova.
        invalidateScannerSession();
        _scannerConsecutiveFailures = 0; // reset: não é culpa do cookie
      }

      // Backoff em rate-limit (429) ou erro de servidor (5xx)
      if (err.message.includes('429') || err.message.includes('508') || err.message.includes('503')) {
        console.log('[Scanner] Rate-limit — aguardando 60s...');
        await sleep(60_000);
        continue;
      }
    }

    await sleep(SCANNER_POLL_INTERVAL);
  }
}

// ── SSE Token refresh ─────────────────────────────────────────────────────────
// Roda no startup e a cada 12 min (TTL do token é 840s = 14 min).

// ── Refresh de eventos on-demand ─────────────────────────────────────────────
// Quando o painel seta app_config.refresh_events_requested=true, o daemon
// executa renew-cookie.mjs como subprocesso — mesmo código que roda às 07:00,
// garantindo o mesmo comportamento (ECDH, headers, parsing idênticos).

// ── Sessão ECDH leve para busca de eventos (headers idênticos ao renew-cookie.mjs) ──
// O buscador_proxy.php retorna 403 para events_lite com os headers "pesados" do
// buscador (Sec-*, Origin, etc). Usa headers mínimos igual ao renew-cookie.mjs.
async function createEventsSession(cookie) {
  const cookieWithCf = await mergeCfClearance(cookie);
  const hdrs = {
    'User-Agent':      UA,
    'Accept':          '*/*',
    'Cache-Control':   'no-cache',
    'Pragma':          'no-cache',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer':         `${BASE}/index.php?page=buscador`,
    'Cookie':          cookieWithCf,
  };

  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`events: nonce handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await safeJson(nonceRes, 'events: proxy_nonce_handshake');

  const keyPair    = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw     = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method: 'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body: JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`events: handshake falhou (${hsRes.status})`);
  const hs = await safeJson(hsRes, 'events: buscador_handshake');
  if (!hs.success) throw new Error('events: handshake negado (cookie inválido?)');

  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(32), info: new TextEncoder().encode('buscador-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
  );
  return { aesKey, hdrs };
}

function normaliseEvent(raw) {
  const home  = String(raw.home ?? '');
  const away  = String(raw.away ?? '');
  const name  = home && away ? `${home} x ${away}` : home || away || 'Evento';
  const id    = raw.id ? String(raw.id) : `${home}-${away}-${raw.date ?? ''}`.replace(/\s+/g, '-');
  const league = typeof raw.league === 'string' ? raw.league : (raw.league?.name ?? raw.sport ?? 'Sport');
  const sport  = String(raw.sport ?? league);
  const start_utc = (() => {
    const s = String(raw.date ?? '');
    if (!s) return '';
    const d = new Date(s.replace(' ', 'T') + '-03:00');
    return isNaN(d.getTime()) ? s : d.toISOString();
  })();
  let house_count = 0;
  if (typeof raw.bookmakers === 'number')      house_count = raw.bookmakers;
  else if (Array.isArray(raw.bookmakers))      house_count = raw.bookmakers.length;
  else if (typeof raw.odds_count === 'number') house_count = raw.odds_count;
  else if (typeof raw.houses === 'number')     house_count = raw.houses;
  return { id, name, sport, league, start_utc, house_count };
}

async function processEventRefreshCycle() {
  try {
    const flagRes  = await sbFetch('app_config?key=eq.refresh_events_requested&select=value');
    const flagRows = await flagRes.json();
    if (!flagRows?.length || flagRows[0].value !== 'true') return;

    const t = new Date().toLocaleTimeString('pt-BR');
    console.log(`\n[${t}] Refresh de eventos solicitado...`);

    // Limpa flag imediatamente
    await sbFetch('app_config', 'POST',
      { key: 'refresh_events_requested', value: 'false', updated_at: new Date().toISOString() },
      { 'Prefer': 'resolution=merge-duplicates' }
    );

    // Usa cookie já existente — NÃO faz login automático
    const cookie = await getCookie();
    if (!cookie) {
      console.error('   Refresh: cookie inválido — faça login manualmente e tente novamente');
      return;
    }

    // Sessão ECDH leve (headers mínimos, sem Sec-* que causavam 403)
    let session;
    try {
      session = await createEventsSession(cookie);
      console.log('   Refresh: sessão ECDH OK');
    } catch (err) {
      console.error(`   Refresh: sessão falhou: ${err.message}`);
      return;
    }

    // Data de hoje em BRT
    const brtNow = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const _p     = x => String(x).padStart(2, '0');
    const today  = `${brtNow.getUTCFullYear()}-${_p(brtNow.getUTCMonth() + 1)}-${_p(brtNow.getUTCDate())}`;

    // Busca events_lite com nonce fresco
    let events = [];
    try {
      const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: session.hdrs });
      if (!nonceRes.ok) throw new Error(`proxy_nonce falhou (${nonceRes.status})`);
      const { nonce } = await safeJson(nonceRes, 'events: proxy_nonce');

      const res = await fetch(`${BASE}/api/buscador_proxy.php?action=events_lite&date=${today}`, {
        headers: { ...session.hdrs, 'Accept': 'application/json', 'X-Proxy-Nonce': nonce },
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.error(`   Refresh: buscador_proxy retornou ${res.status} — ${body.slice(0, 120)}`);
        return;
      }

      const enc = await safeJson(res, 'events: buscador_proxy');
      let parsed = enc;
      if (enc.encrypted && enc.data) {
        const encBytes = base64ToBytes(enc.data);
        const plain    = await subtle.decrypt(
          { name: 'AES-CBC', iv: encBytes.slice(0, 16) },
          session.aesKey,
          encBytes.slice(16)
        );
        parsed = JSON.parse(new TextDecoder().decode(plain));
      }

      const rawEvents = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
      events = rawEvents.map(normaliseEvent);
      events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
      console.log(`   Refresh: ${events.length} eventos encontrados para ${today}`);
    } catch (err) {
      console.error(`   Refresh: falha ao buscar eventos: ${err.message}`);
      return;
    }

    if (!events.length) {
      console.warn('   Refresh: 0 eventos — SuperMonitor pode não ter dados para hoje ainda');
      return;
    }

    // Upsert em lotes de 50
    const rows = events.map(e => ({ ...e, event_date: today, updated_at: new Date().toISOString() }));
    let saved = 0;
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const r = await sbFetch('sm_events', 'POST', chunk, { 'Prefer': 'resolution=merge-duplicates' });
      if (r.ok) saved += chunk.length;
      else console.warn(`   Refresh: chunk falhou: ${await r.text()}`);
    }
    console.log(`   Refresh: ${saved}/${events.length} eventos salvos no Supabase`);

    await sbFetch('app_config', 'POST',
      { key: 'refresh_events_done', value: new Date().toISOString(), updated_at: new Date().toISOString() },
      { 'Prefer': 'resolution=merge-duplicates' }
    );

  } catch (err) {
    console.error(`[EventRefresh] erro: ${err.message}`);
  }
}

// ── Daemon loop ───────────────────────────────────────────────────────────────
console.log('SureEdge Queue Daemon v3 iniciado');
console.log(`Verificando fila a cada ${POLL_INTERVAL}ms (anti-ban: 3-6s entre requests SM) | Ctrl+C para parar\n`);

await processOneCycle();
await processFreebetCycle();

// ── Guardião do loop do scanner ───────────────────────────────────────────────
// Se o loop do scanner cair por qualquer motivo, reinicia automaticamente
// com backoff de 10s para não floodar o servidor em caso de erro persistente.
async function guardScannerLoop() {
  while (true) {
    try {
      await runScannerSse();
    } catch (err) {
      console.error('[Scanner] Loop encerrado — reiniciando em 10s:', err.message);
    }
    await sleep(10_000);
  }
}

// Scanner de Alertas Duplo Green removido da UI — loop desativado
// guardScannerLoop();

while (true) {
  await sleep(POLL_INTERVAL);

  try {
    await processEventRefreshCycle();
  } catch (err) {
    console.error(`Erro no ciclo event-refresh: ${err.message}`);
  }

  try {
    await processOneCycle();
  } catch (err) {
    console.error(`Erro no ciclo odds: ${err.message}`);
  }

  try {
    await processFreebetCycle();
  } catch (err) {
    console.error(`Erro no ciclo freebet: ${err.message}`);
  }
}
