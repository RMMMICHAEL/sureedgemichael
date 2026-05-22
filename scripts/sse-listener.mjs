/**
 * sse-listener.mjs — Daemon SSE do SuperMonitor (tempo real)
 *
 * Mantém uma conexão SSE persistente com o SuperMonitor para receber
 * atualizações de odds assim que mudam — sem precisar fazer poll.
 *
 * Fluxo:
 *   1. Lê cookie do Supabase
 *   2. Obtém SSE token (proxy_nonce_buscador.php → sse_token_buscador_proxy.php)
 *   3. Conecta ao stream: {sse_url}/events?temp_token=...
 *   4. On odds_delta: se o evento está em sm_odds → aciona re-fetch via odds_queue
 *   5. Auto-reconecta com backoff exponencial
 *   6. Renova token antes de expirar (TTL = 840s)
 *
 * Para usar junto com o daemon principal:
 *   node scripts/sse-listener.mjs
 */

import https from 'node:https';
import http  from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }         from 'node:path';
import { fileURLToPath }            from 'node:url';

// ── .env ──────────────────────────────────────────────────────────────────────
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
const UA   = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36';

const SSE_TOKEN_TTL_MS      = 840_000;  // 840s — confirmado em buscador-sse.js
const TOKEN_RENEW_MARGIN_MS = 60_000;   // renova 60s antes de expirar
const STALE_TIMEOUT_MS      = 480_000;  // 8 min sem ping → conexão morta
const PING_CHECK_MS         = 30_000;   // watchdog a cada 30s
const TRACKED_REFRESH_MS    = 30_000;   // atualiza eventos rastreados a cada 30s
const DEBOUNCE_REFETCH_MS   = 3_000;    // agrupa deltas por 3s antes de re-buscar

const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL          ?? '').trim();
const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY
            ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY     ?? '').trim();

if (!sbUrl || !sbKey) { console.error('[SSE] Supabase nao configurado.'); process.exit(1); }

// ── Supabase REST ─────────────────────────────────────────────────────────────
async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  return fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// ── Cookie ────────────────────────────────────────────────────────────────────
async function readCookie() {
  try {
    const res  = await sbFetch('app_config?key=eq.supermonitor_cookie&select=value');
    const rows = await res.json();
    let cookie = rows?.[0]?.value ?? null;
    if (!cookie) return null;

    // Mescla cf_clearance se disponível e recente
    try {
      const cr   = await sbFetch('app_config?key=eq.cf_clearance&select=value,updated_at');
      const crows = await cr.json();
      if (crows?.length && crows[0].value) {
        const age = Date.now() - new Date(crows[0].updated_at).getTime();
        if (age < 23 * 3600_000) {
          const cf    = `cf_clearance=${crows[0].value}`;
          const parts = cookie.split(';').map(p => p.trim())
            .filter(p => p && !p.toLowerCase().startsWith('cf_clearance='));
          parts.push(cf);
          cookie = parts.join('; ');
        }
      }
    } catch {}

    return cookie;
  } catch { return null; }
}

// ── Eventos rastreados ────────────────────────────────────────────────────────
// Map<event_id (string), event_name (string)> — do que temos em sm_odds
let _tracked = new Map();

async function refreshTracked() {
  try {
    const res  = await sbFetch('sm_odds?select=event_id,event_name');
    const rows = await res.json();
    if (!Array.isArray(rows)) return;
    _tracked = new Map(rows.map(r => [String(r.event_id), r.event_name ?? r.event_id]));
  } catch (e) {
    console.error(`[SSE] refreshTracked: ${e.message}`);
  }
}

// ── Re-fetch via odds_queue ───────────────────────────────────────────────────
// Insere na fila — o daemon principal (process-queue.mjs) re-busca as odds.
async function queueRefetch(eventId, eventName) {
  try {
    await sbFetch(
      'odds_queue',
      'POST',
      { event_id: eventId, event_name: eventName, status: 'pending', created_at: new Date().toISOString() },
      { 'Prefer': 'return=minimal' },
    );
  } catch (e) {
    console.error(`[SSE] queueRefetch(${eventId}): ${e.message}`);
  }
}

// Debounce: se o mesmo evento receber vários deltas em 3s, re-busca só uma vez
const _pending = new Map(); // event_id → event_name
let   _debTimer = null;

function scheduleRefetch(eventId, eventName) {
  _pending.set(eventId, eventName);
  if (_debTimer) return;
  _debTimer = setTimeout(async () => {
    _debTimer = null;
    const batch = [..._pending.entries()];
    _pending.clear();
    const t = new Date().toLocaleTimeString('pt-BR');
    console.log(`[${t}] SSE delta → ${batch.length} evento(s) na fila`);
    for (const [id, name] of batch) await queueRefetch(id, name);
  }, DEBOUNCE_REFETCH_MS);
}

// ── Aplica delta ──────────────────────────────────────────────────────────────
let _firstDelta = true;

function applyDelta(delta) {
  const { event_key, house, market, label, odd } = delta;
  if (!event_key) return;

  // Na primeira vez, loga o formato para diagnóstico
  if (_firstDelta) {
    _firstDelta = false;
    console.log(`[SSE] Primeiro delta — event_key="${event_key}" house="${house}" market="${market}" label="${label}" odd=${odd}`);
    if (_tracked.size) {
      console.log(`[SSE] Eventos rastreados (${_tracked.size}): ${[..._tracked.keys()].slice(0, 5).join(', ')}${_tracked.size > 5 ? '...' : ''}`);
    } else {
      console.log('[SSE] Nenhum evento em sm_odds ainda — busque um evento primeiro no app.');
    }
  }

  const name = _tracked.get(String(event_key));
  if (!name) return; // evento não rastreado

  scheduleRefetch(String(event_key), name);
}

// ── SSE token ─────────────────────────────────────────────────────────────────
let _sseToken     = null;
let _sseUrl       = null;
let _tokenExp     = 0;

async function getSseToken(cookie) {
  // Reutiliza se ainda válido (com margem de 60s)
  if (_sseToken && _sseUrl && Date.now() < _tokenExp - TOKEN_RENEW_MARGIN_MS) {
    return { token: _sseToken, url: _sseUrl };
  }

  const hdrs = {
    'User-Agent':        UA,
    'Accept':            'application/json',
    'Accept-Language':   'pt-BR,pt;q=0.6',
    'Cache-Control':     'no-cache',
    'Pragma':            'no-cache',
    'Referer':           `${BASE}/index.php?page=buscador`,
    'Cookie':            cookie,
    'Sec-Fetch-Dest':    'empty',
    'Sec-Fetch-Mode':    'cors',
    'Sec-Fetch-Site':    'same-origin',
    'Sec-Ch-Ua':         '"Chromium";v="148", "Brave";v="148", "Not/A)Brand";v="99"',
    'Sec-Ch-Ua-Mobile':  '?0',
    'Sec-Ch-Ua-Platform':'"Windows"',
    'Sec-Gpc':           '1',
  };

  // 1) Tenta cache do servidor (leve — sem nonce)
  try {
    const cr = await fetch(`${BASE}/api/proxy_nonce_buscador.php`, {
      headers: { ...hdrs, 'X-Check-Token-Cache': '1' },
    });
    if (cr.ok) {
      const cd = await cr.json();
      if (cd?.has_valid_token) {
        const tr = await fetch(`${BASE}/api/sse_token_buscador_proxy.php`, { headers: hdrs });
        if (tr.ok) {
          const td = await tr.json();
          if (td?.success) {
            _sseToken = td.temp_token;
            _sseUrl   = td.sse_url;
            _tokenExp = Date.now() + (cd.expires_in ?? 840) * 1000;
            console.log('[SSE] Token SSE (cache servidor)');
            return { token: _sseToken, url: _sseUrl };
          }
        }
      }
    }
  } catch {}

  // 2) Fluxo completo: nonce → token
  const nr = await fetch(`${BASE}/api/proxy_nonce_buscador.php`, { headers: hdrs });
  if (!nr.ok) throw new Error(`nonce_buscador falhou (${nr.status})`);
  const { nonce } = await nr.json();
  if (!nonce) throw new Error('nonce_buscador vazio');

  const tr = await fetch(`${BASE}/api/sse_token_buscador_proxy.php`, {
    headers: { ...hdrs, 'X-Proxy-Nonce': nonce },
  });
  if (!tr.ok) throw new Error(`sse_token falhou (${tr.status})`);
  const td = await tr.json();
  if (!td?.success) throw new Error('sse_token negado — cookie inválido?');

  _sseToken = td.temp_token;
  _sseUrl   = td.sse_url;
  _tokenExp = Date.now() + SSE_TOKEN_TTL_MS;
  console.log(`[SSE] Token SSE obtido — expira em ${Math.round(SSE_TOKEN_TTL_MS / 60000)}min`);
  return { token: _sseToken, url: _sseUrl };
}

// ── SSE parser ────────────────────────────────────────────────────────────────
function parseSSEBlock(block) {
  let type = 'message';
  let data = '';
  for (const line of block.split('\n')) {
    if (line.startsWith('event:'))     type = line.slice(6).trim();
    else if (line.startsWith('data:')) data += (data ? '\n' : '') + line.slice(5);
  }
  return data ? { type, data: data.trim() } : null;
}

// ── Conexão SSE ───────────────────────────────────────────────────────────────
let _sseReq      = null;
let _lastPing    = 0;
let _retryDelay  = 3_000;
let _booting     = false;

async function bootSSE() {
  if (_booting) return;
  _booting = true;

  // Destrói conexão anterior se existir
  if (_sseReq) { try { _sseReq.destroy(); } catch {} _sseReq = null; }

  try {
    const cookie = await readCookie();
    if (!cookie) throw new Error('cookie nao encontrado no Supabase');

    const { token, url } = await getSseToken(cookie);
    const sseUrl = `${url}/events?temp_token=${encodeURIComponent(token)}`;
    const u      = new URL(sseUrl);
    const lib    = u.protocol === 'https:' ? https : http;

    console.log(`[SSE] Conectando a ${u.hostname}...`);

    _sseReq = lib.request(
      {
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     u.pathname + u.search,
        method:   'GET',
        headers:  { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache', 'User-Agent': UA },
        timeout:  15_000,
      },
      (res) => {
        if (res.statusCode !== 200) {
          console.error(`[SSE] HTTP ${res.statusCode} — reconectando...`);
          res.resume();
          scheduleReboot();
          return;
        }

        const t = new Date().toLocaleTimeString('pt-BR');
        console.log(`[${t}] SSE conectado! Monitorando odds em tempo real.`);
        _lastPing   = Date.now();
        _retryDelay = 3_000; // reset backoff
        _booting    = false;

        let buf = '';
        res.setEncoding('utf8');

        res.on('data', (chunk) => {
          buf += chunk;
          const blocks = buf.split('\n\n');
          buf = blocks.pop() ?? '';

          for (const block of blocks) {
            if (!block.trim()) continue;
            const ev = parseSSEBlock(block);
            if (!ev) continue;

            if (ev.type === 'ping') {
              _lastPing = Date.now();
              return;
            }

            if (ev.type === 'reconnect') {
              // Servidor pediu reconexão — invalida token
              _sseToken = null; _sseUrl = null; _tokenExp = 0;
              res.destroy();
              console.log('[SSE] Servidor pediu reconexão...');
              setTimeout(bootSSE, 1_000);
              return;
            }

            if (ev.type === 'update') {
              try {
                const p = JSON.parse(ev.data);
                if (p?.type === 'odds_delta' && Array.isArray(p.deltas)) {
                  p.deltas.forEach(applyDelta);
                }
              } catch {}
            }
          }
        });

        res.on('end',   () => { console.log('[SSE] Stream encerrado.'); scheduleReboot(); });
        res.on('error', (e) => { console.error(`[SSE] Erro stream: ${e.message}`); scheduleReboot(); });
      }
    );

    _sseReq.on('error',   (e) => { console.error(`[SSE] Erro conexão: ${e.message}`); scheduleReboot(); });
    _sseReq.on('timeout', ()  => { _sseReq.destroy(); scheduleReboot(); });
    _sseReq.end();

  } catch (e) {
    console.error(`[SSE] bootSSE: ${e.message}`);
    scheduleReboot();
  }
}

function scheduleReboot() {
  _booting = false;
  if (_sseReq) { try { _sseReq.destroy(); } catch {} _sseReq = null; }
  const delay = _retryDelay;
  _retryDelay = Math.min(_retryDelay * 2, 60_000);
  console.log(`[SSE] Reconectando em ${Math.round(delay / 1000)}s...`);
  setTimeout(bootSSE, delay);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('=== SSE Listener iniciado ===');

  // Carrega eventos rastreados antes de conectar
  await refreshTracked();
  console.log(`[SSE] ${_tracked.size} evento(s) rastreado(s) em sm_odds`);

  // Atualiza lista de eventos rastreados periodicamente (novos eventos adicionados no app)
  setInterval(refreshTracked, TRACKED_REFRESH_MS);

  // Watchdog: reconecta se ficou muito tempo sem ping
  setInterval(() => {
    if (_lastPing > 0 && Date.now() - _lastPing > STALE_TIMEOUT_MS) {
      console.log('[SSE] Sem ping por 8min — reconectando...');
      bootSSE();
    }
  }, PING_CHECK_MS);

  // Conecta
  await bootSSE();
}

main().catch(e => { console.error(e); process.exit(1); });
