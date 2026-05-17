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
const UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutos
const MAX_PER_CYCLE = 5;
const POLL_INTERVAL = 8_000;           // 8 segundos

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

// ── Validar cookie ────────────────────────────────────────────────────────────
async function validateCookie(cookie) {
  try {
    const res = await request('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA, 'Cookie': cookie, 'Accept': 'application/json', 'Referer': `${BASE}/`,
    });
    if (res.status !== 200) return false;
    if (res.body.includes('<title>Login') || res.body.includes('name="senha"')) return false;
    return true;
  } catch { return false; }
}

// ── Auto-renovação: chama renew-cookie.mjs ────────────────────────────────────
async function autoRenewCookie() {
  console.log('   Cookie expirado — renovando automaticamente...');
  _session = null; // invalida sessao cacheada
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
    // Sessão pode ter expirado — invalida e tenta uma vez com cookie renovado
    invalidateSession();
    _cookieValidatedAt = 0; // força revalidação do cookie
    console.error(`   Sessao falhou: ${err.message} — tentando renovar...`);
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

// ── Daemon loop ───────────────────────────────────────────────────────────────
console.log('SureEdge Queue Daemon v3 iniciado');
console.log(`Verificando fila a cada ${POLL_INTERVAL / 1000}s | Ctrl+C para parar\n`);

await processOneCycle();

while (true) {
  await sleep(POLL_INTERVAL);
  try {
    await processOneCycle();
  } catch (err) {
    console.error(`Erro no ciclo: ${err.message}`);
  }
}
