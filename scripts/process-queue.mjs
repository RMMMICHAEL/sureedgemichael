/**
 * process-queue.mjs — v3.0 (daemon com auto-renovação e sessão cacheada)
 *
 * - Verifica fila a cada 8s (odds aparecem em ~8-10s)
 * - Cookie expirado → renova automaticamente (chama renew-cookie.mjs)
 * - Sessão ECDH mantida em memória entre ciclos (evita handshake repetido)
 * - Fila vazia → zero chamadas ao SuperMonitor
 * - Max 5 eventos por ciclo, delay 3-6s entre requests
 */

import https              from 'node:https';
import http               from 'node:http';
import { execFile }       from 'node:child_process';
import { promisify }      from 'node:util';
import { URL }            from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }  from 'node:url';

const execFileAsync = promisify(execFile);

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
const POLL_INTERVAL = 4_000;           // 4 segundos

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
async function validateCookie(cookie) {
  try {
    const res = await request('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json', 'Referer': `${BASE}/`,
    });
    if (res.status !== 200) return false;
    // Sessão expirada → servidor retorna HTML (redirecionamento para login)
    // Verificações explícitas + genérica: qualquer HTML indica sessão inválida
    if (res.body.includes('<title>Login') || res.body.includes('name="senha"')) return false;
    if (res.body.trimStart().startsWith('<')) return false; // HTML = inválido
    return true;
  } catch { return false; }
}

// ── Keepalive de sessão ───────────────────────────────────────────────────────
// Pinga o servidor a cada 18 min para evitar expiração da sessão PHP (TTL padrão = 24 min).
const KEEPALIVE_INTERVAL = 18 * 60 * 1000;
// Inicializa no momento atual para evitar ping imediato no startup
// (acabamos de validar o cookie ao subir — não precisa pingar de novo)
let _lastKeepalive = Date.now();

async function keepalive() {
  if (!_cookie) return;
  if (Date.now() - _lastKeepalive < KEEPALIVE_INTERVAL) return;
  try {
    const res = await request('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA, 'Cookie': _cookie, 'Accept': 'application/json', 'Referer': `${BASE}/`,
    });
    const ok = res.status === 200
      && !res.body.includes('name="senha"')
      && !res.body.trimStart().startsWith('<');
    if (ok) {
      _lastKeepalive = Date.now();
    } else {
      // Sessão expirou — invalida cache para renovação no próximo ciclo
      console.log('   [keepalive] Sessao expirada — sera renovada no proximo ciclo');
      _cookie = null;
      _cookieValidatedAt = 0;
      invalidateSession();
      invalidateFreebetSession();
    }
  } catch { /* ignora erros de rede temporários */ }
}

// ── Auto-renovação: chama renew-cookie.mjs ────────────────────────────────────
async function autoRenewCookie() {
  console.log('   Cookie expirado — renovando automaticamente...');
  _session = null;          // invalida sessao buscador cacheada
  _freebetSession = null;   // invalida sessao freebet cacheada
  _freebetSessionCookieHash = '';
  try {
    await execFileAsync(process.execPath, [resolve(__dir, 'renew-cookie.mjs')], {
      cwd: __dir, timeout: 150_000, // 2.5 min (inclui 2captcha)
    });
    const cookie = await readCookieFromSupabase();
    if (cookie) {
      console.log('   Cookie renovado com sucesso.');
      return cookie;
    }
  } catch (err) {
    console.error(`   Renovacao falhou: ${err.message}`);
  }
  return null;
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
  const hdrs = {
    'User-Agent': UA, 'Accept': '*/*', 'Cache-Control': 'no-cache',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer': `${BASE}/index.php?page=buscador`,
    'Cookie': cookie,
  };

  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`nonce handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await nonceRes.json();
  if (!handshakeNonce) throw new Error('nonce invalido');

  const keyPair     = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw      = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method: 'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body: JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`handshake falhou (${hsRes.status})`);
  const hs = await hsRes.json();
  if (!hs.success) throw new Error('cookie invalido (handshake negado)');

  const srvRaw = new Uint8Array(65);
  srvRaw[0] = 0x04;
  srvRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  srvRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', srvRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const sharedBits = await subtle.deriveBits({ name: 'ECDH', public: serverPub }, keyPair.privateKey, 256);
  const hkdfKey    = await subtle.importKey('raw', sharedBits, 'HKDF', false, ['deriveKey']);
  const aesKey     = await subtle.deriveKey(
    { name: 'HKDF', hash: 'SHA-256', salt: new Uint8Array(0), info: new TextEncoder().encode('buscador-aes256-v1') },
    hkdfKey, { name: 'AES-CBC', length: 256 }, false, ['decrypt']
  );
  return { aesKey, hdrs };
}

async function fetchDecrypted(session, qs) {
  const nonceRes = await fetch(`${BASE}/api/proxy_nonce.php`, { headers: session.hdrs });
  if (!nonceRes.ok) throw new Error(`proxy_nonce falhou (${nonceRes.status})`);
  const { nonce } = await nonceRes.json();

  const res = await fetch(`${BASE}/api/buscador_proxy.php?${qs}`, {
    headers: { ...session.hdrs, 'Accept': 'application/json', 'X-Proxy-Nonce': nonce },
  });
  if (!res.ok) throw new Error(`proxy falhou (${res.status})`);

  const enc = await res.json();
  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const plain    = await subtle.decrypt({ name: 'AES-CBC', iv: encBytes.slice(0, 16) }, session.aesKey, encBytes.slice(16));
    return JSON.parse(new TextDecoder().decode(plain));
  }
  return enc;
}

// ── Sessão ECDH cacheada em memória ──────────────────────────────────────────
let _session = null;
let _sessionCookieHash = '';

async function getSession(cookie) {
  // Reutiliza se o cookie não mudou
  if (_session && _sessionCookieHash === cookie.slice(0, 32)) return _session;
  _session = await createSession(cookie);
  _sessionCookieHash = cookie.slice(0, 32);
  console.log('   Sessao ECDH criada');
  return _session;
}

function invalidateSession() {
  _session = null;
  _sessionCookieHash = '';
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
      _lastKeepalive = 0;
      const renewed = await autoRenewCookie();
      if (!renewed) { for (const ev of batch) await markQueueError(ev.id); return; }
      _cookie = renewed;
      _cookieValidatedAt = Date.now();
      _lastKeepalive = Date.now();
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
    try {
      const data    = await fetchDecrypted(session, `action=search&q=${encodeURIComponent(ev.name)}&type=all`);
      const results = Array.isArray(data) ? data : (data?.results ?? data?.data ?? []);

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
        } else {
          await markQueueError(ev.id);
        }
      }
    } catch (err) {
      // Sessão pode ter expirado no meio do lote
      if (err.message.includes('nonce') || err.message.includes('proxy')) {
        invalidateSession();
      }
      await markQueueError(ev.id);
      console.error(`   Erro: ${ev.name}: ${err.message}`);
    }

    if (i < batch.length - 1) {
      const delay = 3000 + Math.random() * 3000;
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
const FREEBET_SESSION_TTL = 240_000; // 4 min (server TTL = 4.5 min)

async function createFreebetSession(cookie) {
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
  const { nonce: handshakeNonce } = await nonceRes.json();
  if (!handshakeNonce) throw new Error('freebet: app handshake nonce inválido');

  // 2. Gera par de chaves ECDH
  const keyPair    = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw     = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  // 3. Handshake via app_handshake.php (endpoint dedicado do freebet/app)
  const hsRes = await fetch(`${BASE}/api/app_handshake.php`, {
    method:  'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body:    JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) {
    const body = await hsRes.text().catch(() => '');
    throw new Error(`freebet: app_handshake falhou (${hsRes.status}) ${body.slice(0, 80)}`);
  }
  const hs = await hsRes.json();
  if (!hs.success) throw new Error(`freebet: app_handshake negado: ${JSON.stringify(hs).slice(0, 100)}`);
  console.log(`   Sessão ECDH freebet criada (app_handshake.php) | cookie=${cookieWithCf.slice(0,60)}`);

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

  return { aesKey, hdrs };
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

async function fetchFreebetFromSuperMonitor(freebetSession, { bookmaker, value, min_odd, max_odd, pa_filter }) {
  const freebetHdrs = {
    ...freebetSession.hdrs,
    'Accept': 'application/json',
  };

  // Nonce para a requisição freebet
  let nonce = null;
  for (const endpoint of [
    `${BASE}/api/proxy_nonce_freebet.php`,
    `${BASE}/api/proxy_nonce.php`,
  ]) {
    try {
      const r = await fetch(endpoint, { headers: freebetHdrs });
      if (r.ok) {
        const body = await r.json();
        if (body.nonce) { nonce = body.nonce; break; }
      }
    } catch { /* tenta próximo */ }
  }
  if (!nonce) throw new Error('freebet: não foi possível obter nonce');
  console.error(`   [DBG] nonce=${nonce.slice(0,8)}… cookie=${(freebetHdrs['Cookie']??'').slice(0,60)}`);

  const qs = new URLSearchParams({
    endpoint:  'api/v2/freebet/convert',
    bookmaker: String(bookmaker),
    value:     String(value),
    min_odd:   String(min_odd),
    max_odd:   String(max_odd),
    pa_filter: String(pa_filter),
  }).toString();

  const res = await fetch(`${BASE}/api/freebet_proxy-v2.php?${qs}`, {
    headers: { ...freebetHdrs, 'X-Proxy-Nonce': nonce },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    console.error(`   [freebet] proxy ${res.status}: ${body.slice(0, 300)}`);
    throw new Error(`freebet_proxy falhou (${res.status})`);
  }

  const enc = await res.json();
  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const plain    = await subtle.decrypt(
      { name: 'AES-CBC', iv: encBytes.slice(0, 16) },
      freebetSession.aesKey,
      encBytes.slice(16),
    );
    return JSON.parse(new TextDecoder().decode(plain));
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

  const cookie = await getCookie();
  if (!cookie) {
    console.error('   Freebet: sem cookie válido');
    return;
  }

  let freebetSession;
  try {
    freebetSession = await getFreebetSession(cookie);
  } catch (err) {
    invalidateFreebetSession();
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
        // Sessão expirou ou foi invalidada → tenta uma vez com nova sessão
        const is401 = err.message.includes('401') || err.message.includes('INVALID_SESSION') || err.message.includes('NEEDS_HANDSHAKE');
        if (is401) {
          console.log(`   Freebet: sessão inválida — recriando e retentando...`);
          invalidateFreebetSession();
          freebetSession = await getFreebetSession(cookie);
          result = await fetchFreebetFromSuperMonitor(freebetSession, req);
        } else {
          throw err;
        }
      }
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
      if (err.message.includes('401') || err.message.includes('403') || err.message.includes('handshake')) {
        invalidateFreebetSession();
      }
    }

    await sleep(1000 + Math.random() * 1000);
  }
}

// ── SSE Token refresh ─────────────────────────────────────────────────────────
// Roda no startup e a cada 12 min (TTL do token é 840s = 14 min).
// Salva temp_token + sse_url no Supabase para o frontend consumir.
const SSE_REFRESH_INTERVAL = 720_000; // 12 min
let _lastSseTokenFetch = 0;

async function fetchSseToken(cookie) {
  try {
    const hdrs = {
      'User-Agent': UA,
      'Accept': 'application/json',
      'Cache-Control': 'no-store',
      'Referer': `${BASE}/index.php?page=buscador`,
      'Cookie': cookie,
    };

    // 1. Nonce específico do buscador
    const nonceRes = await fetch(`${BASE}/api/proxy_nonce_buscador.php`, { headers: hdrs });
    if (!nonceRes.ok) throw new Error(`nonce_buscador falhou (${nonceRes.status})`);
    const { nonce } = await nonceRes.json();
    if (!nonce) throw new Error('nonce_buscador: campo nonce ausente');

    // 2. Token SSE
    const tokenRes = await fetch(`${BASE}/api/sse_token_buscador_proxy.php`, {
      headers: { ...hdrs, 'X-Proxy-Nonce': nonce },
    });
    if (!tokenRes.ok) throw new Error(`sse_token_buscador_proxy falhou (${tokenRes.status})`);
    const data = await tokenRes.json();

    if (!data?.success || !data.temp_token || !data.sse_url) {
      throw new Error(`resposta inválida: ${JSON.stringify(data).slice(0, 120)}`);
    }

    // 3. Salva no Supabase (upsert)
    await sbFetch('app_config', 'POST',
      { key: 'sse_temp_token', value: data.temp_token, updated_at: new Date().toISOString() },
      { 'Prefer': 'resolution=merge-duplicates' }
    );
    await sbFetch('app_config', 'POST',
      { key: 'sse_url', value: data.sse_url, updated_at: new Date().toISOString() },
      { 'Prefer': 'resolution=merge-duplicates' }
    );

    _lastSseTokenFetch = Date.now();
    const t = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${t}] SSE token OK: ...${data.temp_token.slice(-12)} | ${data.sse_url}`);
    return true;
  } catch (err) {
    console.error(`   SSE token falhou: ${err.message}`);
    return false;
  }
}

// ── Daemon loop ───────────────────────────────────────────────────────────────
console.log('SureEdge Queue Daemon v3 iniciado');
console.log(`Verificando fila a cada ${POLL_INTERVAL / 1000}s | Ctrl+C para parar\n`);

// Startup: busca SSE token imediatamente (antes de processar a fila)
{
  const initCookie = await getCookie();
  if (initCookie) await fetchSseToken(initCookie);
}

await processOneCycle();
await processFreebetCycle();

while (true) {
  await sleep(POLL_INTERVAL);

  // Keepalive: pinga servidor a cada 18 min para manter sessão PHP viva
  await keepalive();

  // Renova SSE token a cada 12 min (independente da fila)
  if (Date.now() - _lastSseTokenFetch > SSE_REFRESH_INTERVAL) {
    const c = await getCookie();
    if (c) await fetchSseToken(c);
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
