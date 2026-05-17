/**
 * process-queue.mjs — v1.0 (on-demand odds queue processor)
 *
 * Roda a cada 2 min pelo Task Scheduler.
 * - Lê itens pendentes em odds_queue no Supabase
 * - Se fila vazia → sai sem fazer NENHUMA chamada ao SuperMonitor
 * - Deduplica por event_id
 * - Para cada evento único: verifica se sm_odds já tem dado fresco (< 15 min)
 *   → se sim, marca como done sem buscar
 *   → se não, busca odds no SuperMonitor
 * - Máximo 5 eventos únicos por ciclo (anti-ban)
 * - UMA sessão ECDH criada e reutilizada para todo o lote
 * - Delay aleatório 3–6s entre requisições
 *
 * Variáveis de ambiente (scripts/.env):
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   SUPERMONITOR_EMAIL / SUPERMONITOR_PASSWORD  (usados só se cookie inválido)
 */

import https   from 'node:https';
import http    from 'node:http';
import { URL } from 'node:url';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }        from 'node:path';
import { fileURLToPath }           from 'node:url';

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
const BASE = 'https://painel.supermonitor.pro';
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

const CACHE_TTL_MS  = 15 * 60 * 1000; // 15 minutos
const MAX_PER_CYCLE = 5;               // máximo de eventos únicos por ciclo

if (!sbUrl || !sbKey) { console.error('❌  Supabase não configurado.'); process.exit(1); }

// ── Agent keepAlive ───────────────────────────────────────────────────────────
const agent = new https.Agent({ keepAlive: true, maxSockets: 1, timeout: 20_000 });

// ── HTTP helper (node:https) ──────────────────────────────────────────────────
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(
      {
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     u.pathname + u.search,
        method, headers,
        agent: lib === https ? agent : undefined,
        timeout: 20_000,
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () => resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        }));
      }
    );
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Supabase REST helper ──────────────────────────────────────────────────────
async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  const res = await fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type':  'application/json',
      'apikey':         sbKey,
      'Authorization': `Bearer ${sbKey}`,
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res;
}

// ── Ler cookie do Supabase ────────────────────────────────────────────────────
async function readCookieFromSupabase() {
  try {
    const res = await sbFetch('app_config?key=eq.supermonitor_cookie&select=value,updated_at');
    if (!res.ok) return null;
    const rows = await res.json();
    if (!rows?.length) return null;
    const { value, updated_at } = rows[0];
    const age = Date.now() - new Date(updated_at).getTime();
    if (age > 20 * 24 * 60 * 60 * 1000) return null; // > 20 dias
    return value ?? null;
  } catch { return null; }
}

// ── Validar cookie ────────────────────────────────────────────────────────────
async function validateCookie(cookie) {
  try {
    const res = await request('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA, 'Cookie': cookie,
      'Accept': 'application/json', 'Referer': `${BASE}/`,
    });
    if (res.status !== 200) return false;
    if (res.body.includes('<title>Login') || res.body.includes('name="senha"')) return false;
    return true;
  } catch { return false; }
}

// ── ECDH / Crypto helpers ─────────────────────────────────────────────────────
const subtle = globalThis.crypto.subtle;

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return bytes;
}
function bytesToHex(bytes) {
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function createSession(cookie) {
  const hdrs = {
    'User-Agent': UA, 'Accept': '*/*', 'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
    'Accept-Language': 'pt-BR,pt;q=0.9',
    'Referer': `${BASE}/index.php?page=buscador`,
    ...(cookie ? { 'Cookie': cookie } : {}),
  };

  const nonceRes = await fetch(`${BASE}/api/proxy_nonce_handshake.php`, { headers: hdrs });
  if (!nonceRes.ok) throw new Error(`Nonce handshake falhou (${nonceRes.status})`);
  const { nonce: handshakeNonce } = await nonceRes.json();
  if (!handshakeNonce) throw new Error('Nonce inválido — sessão expirada?');

  const keyPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const pubRaw  = new Uint8Array(await subtle.exportKey('raw', keyPair.publicKey));
  const client_pub_x = bytesToHex(pubRaw.slice(1, 33));
  const client_pub_y = bytesToHex(pubRaw.slice(33, 65));

  const hsRes = await fetch(`${BASE}/api/buscador_handshake.php`, {
    method: 'POST',
    headers: { ...hdrs, 'Content-Type': 'application/json', 'X-Handshake-Nonce': handshakeNonce },
    body: JSON.stringify({ client_pub_x, client_pub_y }),
  });
  if (!hsRes.ok) throw new Error(`Handshake falhou (${hsRes.status})`);
  const hs = await hsRes.json();
  if (!hs.success) throw new Error('Cookie inválido ou expirado (handshake negado)');

  const serverPubRaw = new Uint8Array(65);
  serverPubRaw[0] = 0x04;
  serverPubRaw.set(hexToBytes(hs.server_pub_x ?? ''), 1);
  serverPubRaw.set(hexToBytes(hs.server_pub_y ?? ''), 33);

  const serverPub  = await subtle.importKey('raw', serverPubRaw, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
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
  if (!res.ok) throw new Error(`Proxy falhou (${res.status})`);

  const enc = await res.json();
  if (enc.encrypted && enc.data) {
    const encBytes = base64ToBytes(enc.data);
    const iv       = encBytes.slice(0, 16);
    const cipher   = encBytes.slice(16);
    const plain    = await subtle.decrypt({ name: 'AES-CBC', iv }, session.aesKey, cipher);
    return JSON.parse(new TextDecoder().decode(plain));
  }
  return enc;
}

// ── Delay aleatório ───────────────────────────────────────────────────────────
function randomDelay(minMs = 3000, maxMs = 6000) {
  const ms = minMs + Math.random() * (maxMs - minMs);
  return new Promise(r => setTimeout(r, ms));
}

// ── Verifica idade de sm_odds para um evento ──────────────────────────────────
async function getOddsAge(eventId) {
  try {
    const res = await sbFetch(
      `sm_odds?event_id=eq.${encodeURIComponent(eventId)}&select=updated_at&limit=1`
    );
    if (!res.ok) return Infinity;
    const rows = await res.json();
    if (!rows?.length) return Infinity;
    return Date.now() - new Date(rows[0].updated_at).getTime();
  } catch { return Infinity; }
}

// ── Marca itens da fila como done ─────────────────────────────────────────────
async function markQueueDone(eventId) {
  const now = new Date().toISOString();
  await sbFetch(
    `odds_queue?event_id=eq.${encodeURIComponent(eventId)}&status=eq.pending`,
    'PATCH',
    { status: 'done', fulfilled_at: now }
  );
}

// ── Marca itens da fila como error ────────────────────────────────────────────
async function markQueueError(eventId) {
  await sbFetch(
    `odds_queue?event_id=eq.${encodeURIComponent(eventId)}&status=eq.pending`,
    'PATCH',
    { status: 'error' }
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log(`⚡  SureEdge Queue Processor — ${new Date().toISOString()}`);
console.log('═'.repeat(60));

// 1. Lê itens pendentes da fila
let pending = [];
try {
  const res = await sbFetch(
    'odds_queue?status=eq.pending&order=created_at.asc&limit=50',
    'GET', null,
    { 'Accept': 'application/json' }
  );
  if (!res.ok) throw new Error(await res.text());
  pending = await res.json();
} catch (err) {
  console.error(`❌  Falha ao ler fila: ${err.message}`);
  process.exit(1);
}

if (!pending.length) {
  console.log('\n✅  Fila vazia — nenhuma chamada ao SuperMonitor.\n');
  process.exit(0);
}

console.log(`\n📋  ${pending.length} item(ns) na fila.`);

// 2. Deduplica por event_id
const seen = new Map(); // event_id → event_name
for (const item of pending) {
  if (!seen.has(item.event_id)) seen.set(item.event_id, item.event_name);
}
const uniqueEvents = Array.from(seen.entries()).map(([id, name]) => ({ id, name }));
console.log(`   ${uniqueEvents.length} evento(s) único(s).`);

// 3. Separa quem já tem dados frescos de quem precisa buscar
const needFetch = [];
const alreadyFresh = [];

for (const ev of uniqueEvents) {
  const age = await getOddsAge(ev.id);
  if (age < CACHE_TTL_MS) {
    alreadyFresh.push(ev);
  } else {
    needFetch.push(ev);
  }
}

// Marca os já frescos como done imediatamente (sem chamar SuperMonitor)
if (alreadyFresh.length) {
  console.log(`\n✅  ${alreadyFresh.length} evento(s) com cache fresco — marcando done sem buscar.`);
  for (const ev of alreadyFresh) {
    await markQueueDone(ev.id);
    console.log(`   ✓ ${ev.name}`);
  }
}

if (!needFetch.length) {
  console.log('\n🎉  Todos os eventos já tinham cache fresco. Zero chamadas ao SuperMonitor.\n');
  process.exit(0);
}

// Limita a MAX_PER_CYCLE eventos por ciclo
const batch = needFetch.slice(0, MAX_PER_CYCLE);
if (needFetch.length > MAX_PER_CYCLE) {
  console.log(`\n⚠️  ${needFetch.length} eventos precisam de fetch — limitando a ${MAX_PER_CYCLE} por ciclo.`);
}
console.log(`\n🎯  Buscando odds para ${batch.length} evento(s) no SuperMonitor…`);

// 4. Lê e valida cookie
const cookie = await readCookieFromSupabase();
if (!cookie) {
  console.error('❌  Cookie não encontrado no Supabase. Execute renew-cookie.mjs primeiro.');
  for (const ev of batch) await markQueueError(ev.id);
  process.exit(1);
}

const valid = await validateCookie(cookie);
if (!valid) {
  console.error('❌  Cookie inválido ou expirado. Execute renew-cookie.mjs para renovar.');
  for (const ev of batch) await markQueueError(ev.id);
  process.exit(1);
}

// 5. Cria UMA sessão ECDH para o lote inteiro
let session;
try {
  session = await createSession(cookie);
  console.log('   ✅  Sessão ECDH criada (será reutilizada para todos os eventos)');
} catch (err) {
  console.error(`❌  Falha ao criar sessão ECDH: ${err.message}`);
  for (const ev of batch) await markQueueError(ev.id);
  process.exit(1);
}

// 6. Busca odds de cada evento (sequencial, com delay)
let fetchOk = 0;
let fetchFail = 0;

for (let i = 0; i < batch.length; i++) {
  const ev = batch[i];
  console.log(`\n   [${i + 1}/${batch.length}] ${ev.name}`);

  try {
    const qs   = `action=search&q=${encodeURIComponent(ev.name)}&type=all`;
    const data = await fetchDecrypted(session, qs);

    // Verifica se há resultados reais
    const results = Array.isArray(data) ? data
      : Array.isArray(data?.results) ? data.results
      : Array.isArray(data?.data)    ? data.data
      : [];

    if (!results.length) {
      console.log(`   ⚠️  Sem resultados — marcando done (sem dados disponíveis)`);
      await markQueueDone(ev.id);
      fetchOk++;
    } else {
      // Salva em sm_odds (upsert)
      const r = await sbFetch(
        'sm_odds', 'POST',
        { event_id: ev.id, event_name: ev.name, data, updated_at: new Date().toISOString() },
        { 'Prefer': 'resolution=merge-duplicates' }
      );
      if (r.ok) {
        await markQueueDone(ev.id);
        console.log(`   ✅  Odds salvas (${results.length} resultado(s))`);
        fetchOk++;
      } else {
        const errText = await r.text();
        console.error(`   ❌  Falha ao salvar sm_odds: ${errText}`);
        await markQueueError(ev.id);
        fetchFail++;
      }
    }
  } catch (err) {
    console.error(`   ❌  Erro: ${err.message}`);
    await markQueueError(ev.id);
    fetchFail++;
  }

  // Delay entre requests (exceto após o último)
  if (i < batch.length - 1) {
    const delayMs = 3000 + Math.random() * 3000;
    console.log(`   ⏱️  Aguardando ${(delayMs / 1000).toFixed(1)}s antes do próximo…`);
    await new Promise(r => setTimeout(r, delayMs));
  }
}

console.log('\n═'.repeat(60));
console.log(`✅  Ciclo concluído: ${fetchOk} ok, ${fetchFail} falhas.`);
if (needFetch.length > MAX_PER_CYCLE) {
  console.log(`   ℹ️  ${needFetch.length - MAX_PER_CYCLE} evento(s) aguardam o próximo ciclo.`);
}
console.log('');
