/**
 * renew-cookie.mjs — v6.0 (somente eventos, sem odds)
 *
 * 1. Valida o cookie existente no Supabase.
 *    - Válido: pula o login (economiza 2captcha).
 *    - Inválido/ausente: faz login completo (node:https + 2captcha Turnstile).
 * 2. Após ter um cookie válido, faz ECDH com o SuperMonitor e salva no Supabase:
 *    - sm_events  — lista de eventos do dia (UMA vez por dia)
 *
 * ATENÇÃO: odds NÃO são mais buscadas em bulk — usam o sistema de fila on-demand
 * (process-queue.mjs) para evitar ban no SuperMonitor.
 *
 * Execute UMA VEZ ao dia (07:00) pelo Task Scheduler.
 *
 * Variáveis de ambiente (scripts/.env):
 *   SUPERMONITOR_EMAIL / SUPERMONITOR_PASSWORD
 *   NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY
 *   TWOCAPTCHA_API_KEY  (opcional — só necessário quando login é exigido)
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
const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const email         = (process.env.SUPERMONITOR_EMAIL        ?? '').trim();
const password      = (process.env.SUPERMONITOR_PASSWORD     ?? '').trim();
const sbUrl         = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const captchaApiKey = (process.env.TWOCAPTCHA_API_KEY        ?? '').trim();
const sbKey         = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

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

// ── Salvar cookie no Supabase ─────────────────────────────────────────────────
async function saveCookie(cookie) {
  const res = await sbFetch('app_config', 'POST',
    { key: 'supermonitor_cookie', value: cookie, updated_at: new Date().toISOString() },
    { 'Prefer': 'resolution=merge-duplicates' }
  );
  if (!res.ok) throw new Error(`Supabase save failed: ${await res.text()}`);
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

// ── 2captcha Turnstile ────────────────────────────────────────────────────────
async function solveTurnstile(siteKey, pageUrl) {
  if (!captchaApiKey) return null;
  console.log(`🤖  2captcha Turnstile — siteKey: ${siteKey.slice(0, 14)}…`);
  const createRes = await fetch('https://api.2captcha.com/createTask', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientKey: captchaApiKey,
      task: { type: 'TurnstileTaskProxyless', websiteURL: pageUrl, websiteKey: siteKey } }),
  });
  const created = await createRes.json();
  if (created.errorId !== 0) throw new Error(`2captcha createTask: ${created.errorCode}`);
  const taskId = created.taskId;
  console.log(`⏳  Task ${taskId} criada. Aguardando token…`);
  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5_000));
    const res    = await fetch('https://api.2captcha.com/getTaskResult', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: captchaApiKey, taskId }),
    });
    const result = await res.json();
    if (result.errorId !== 0) throw new Error(`2captcha error: ${result.errorCode}`);
    if (result.status === 'ready') {
      const token = result.solution?.token;
      console.log(`✅  Turnstile resolvido: ${token.slice(0, 20)}…`);
      return token;
    }
    console.log(`   … ${(i + 1) * 5}s`);
  }
  throw new Error('2captcha timeout');
}

function extractSiteKey(html) {
  return html.match(/data-sitekey=["']([0-9a-zA-Z_-]{20,})["']/)?.[1]
      ?? html.match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/)?.[1]
      ?? null;
}

function extractPHPSESSID(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

/** Extrai TODOS os cookies de set-cookie e retorna um mapa { nome: valor } */
function extractAllCookieMap(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  const map  = {};
  for (const c of list) {
    const m = c.match(/^([^=\s]+)=([^;]*)/);
    if (m) map[m[1].trim()] = m[2].trim();
  }
  return map;
}

/** Serializa mapa de cookies para string "k=v; k=v" */
function serializeCookies(map) {
  return Object.entries(map).map(([k, v]) => `${k}=${v}`).join('; ');
}

// ── Login ─────────────────────────────────────────────────────────────────────
async function doLogin() {
  if (!email || !password) throw new Error('SUPERMONITOR_EMAIL / PASSWORD não configurados');

  const commonHeaders = {
    'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8', 'Accept-Encoding': 'identity',
    'Cache-Control': 'no-cache', 'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0', 'Sec-Ch-Ua-Platform': '"Windows"', 'Upgrade-Insecure-Requests': '1',
  };

  console.log('📄  GET login.php…');
  const getRes = await request('GET', LOGIN_PAGE, {
    ...commonHeaders, 'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none', 'Sec-Fetch-User': '?1',
  });
  console.log(`   status: ${getRes.status}`);

  if (getRes.body.includes('Attention Required') || getRes.body.includes('cf-browser-verification'))
    throw new Error('Cloudflare bloqueou — IP em hard block');
  if (getRes.status !== 200) throw new Error(`GET login.php falhou: ${getRes.status}`);

  // Captura TODOS os cookies do GET (inclui cf_clearance se Cloudflare já passou)
  const getCookieMap = extractAllCookieMap(getRes.headers['set-cookie']);
  if (!getCookieMap['PHPSESSID']) throw new Error('PHPSESSID não recebido no GET');
  const anonCookieStr = serializeCookies(getCookieMap);

  const html      = getRes.body;
  const csrfMatch = html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i)
                 ?? html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
  const csrfToken = csrfMatch?.[1] ?? '';
  const siteKey   = extractSiteKey(html);
  const cfKeys    = Object.keys(getCookieMap).filter(k => k.startsWith('cf_')).join(', ') || 'nenhum';
  console.log(`   sessid: PHPSESSID=${getCookieMap['PHPSESSID'].slice(0, 16)}…  csrf: ${csrfToken ? '✓' : 'ausente'}  turnstile: ${siteKey ? '✓' : 'ausente'}  cf_cookies: ${cfKeys}`);

  let turnstileToken = null;
  if (siteKey) turnstileToken = await solveTurnstile(siteKey, LOGIN_PAGE);

  await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

  const tryPost = async (withCsrf, cookieStr) => {
    const params = new URLSearchParams();
    if (withCsrf && csrfToken) params.set('csrf_token', csrfToken);
    params.set('email', email); params.set('senha', password); params.set('website', '');
    if (turnstileToken) params.set('cf-turnstile-response', turnstileToken);
    const bodyStr = params.toString();
    return request('POST', LOGIN_PAGE, {
      ...commonHeaders,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(bodyStr)),
      'Cookie': cookieStr, 'Origin': BASE, 'Referer': LOGIN_PAGE, 'Cache-Control': 'max-age=0',
      'Sec-Fetch-Dest': 'document', 'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin', 'Sec-Fetch-User': '?1',
    }, bodyStr);
  };

  /** Mescla cookies do GET com os do POST, sobrescrevendo onde necessário */
  const mergeCookies = (postSetCookie) => {
    const merged = { ...getCookieMap, ...extractAllCookieMap(postSetCookie) };
    return serializeCookies(merged);
  };

  console.log('📤  POST credenciais…');
  let postRes    = await tryPost(true, anonCookieStr);
  let fullCookie = mergeCookies(postRes.headers['set-cookie']);
  const loc1     = String(postRes.headers['location'] ?? '');
  console.log(`   status: ${postRes.status}  location: ${loc1 || '(nenhum)'}`);

  if (postRes.status >= 300 && postRes.status < 400 && loc1 && !loc1.toLowerCase().includes('login')) {
    console.log('✅  Login OK (redirect com CSRF)');
    return fullCookie;
  }

  if (postRes.body.includes('csrf') || postRes.body.includes('verificação de segurança')) {
    console.log('   CSRF rejeitado — tentando sem token…');
    await new Promise(r => setTimeout(r, 400));
    postRes    = await tryPost(false, anonCookieStr);
    fullCookie = mergeCookies(postRes.headers['set-cookie']);
    const loc2 = String(postRes.headers['location'] ?? '');
    if (postRes.status >= 300 && postRes.status < 400 && loc2 && !loc2.toLowerCase().includes('login')) {
      console.log('✅  Login OK (sem CSRF)');
      return fullCookie;
    }
  }

  if (postRes.status === 200) {
    const body = postRes.body;
    if (body.includes('name="senha"') || body.includes("name='senha'")) {
      const errMsg = body.match(/muitas tentativas|Senha.*incorreta|Usuário.*não|verificação de segurança/i)?.[0] ?? '';
      throw new Error(errMsg ? `Login rejeitado: ${errMsg}` : 'Login rejeitado — credenciais inválidas');
    }
    console.log('✅  Login OK (status 200)');
    return fullCookie;
  }

  throw new Error(`Resposta inesperada: status ${postRes.status}`);
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

// ── Normalizar evento ─────────────────────────────────────────────────────────
function normaliseEvent(raw) {
  const home  = String(raw.home ?? '');
  const away  = String(raw.away ?? '');
  const name  = home && away ? `${home} x ${away}` : home || away || 'Evento';
  const id    = raw.id ? String(raw.id) : `${home}-${away}-${raw.date ?? ''}`.replace(/\s+/g, '-');
  const league = typeof raw.league === 'string' ? raw.league : (raw.league?.name ?? raw.sport ?? 'Sport');
  const sport  = String(raw.sport ?? league);
  const start_utc = String(raw.date ?? '');
  let house_count = 0;
  if (typeof raw.bookmakers === 'number')      house_count = raw.bookmakers;
  else if (Array.isArray(raw.bookmakers))      house_count = raw.bookmakers.length;
  else if (typeof raw.odds_count === 'number') house_count = raw.odds_count;
  else if (typeof raw.houses === 'number')     house_count = raw.houses;
  return { id, name, sport, league, start_utc, house_count };
}

// ── Busca e salva apenas eventos no Supabase ──────────────────────────────────
// Odds são buscadas on-demand pelo process-queue.mjs (evita ban no SuperMonitor)
async function fetchAndCache(cookie) {
  console.log('\n📊  Iniciando cache de eventos do dia…');

  // Cria sessão ECDH
  let session;
  try {
    session = await createSession(cookie);
    console.log('   ✅  Sessão ECDH OK');
  } catch (err) {
    console.error(`   ❌  ECDH falhou: ${err.message}`);
    return;
  }

  // Busca eventos do dia
  const today = new Date().toISOString().slice(0, 10);
  let events;
  try {
    const parsed    = await fetchDecrypted(session, `action=events_lite&date=${today}`);
    const rawEvents = Array.isArray(parsed) ? parsed : (parsed.events ?? []);
    events = rawEvents.map(normaliseEvent);
    events.sort((a, b) => a.start_utc.localeCompare(b.start_utc));
    console.log(`   📋  ${events.length} eventos para ${today}`);
  } catch (err) {
    console.error(`   ❌  Falha ao buscar eventos: ${err.message}`);
    return;
  }

  // Salva eventos no Supabase (upsert em lotes de 50)
  const rows = events.map(e => ({ ...e, event_date: today, updated_at: new Date().toISOString() }));
  let evSaved = 0;
  for (let i = 0; i < rows.length; i += 50) {
    const chunk = rows.slice(i, i + 50);
    const r = await sbFetch('sm_events', 'POST', chunk, { 'Prefer': 'resolution=merge-duplicates' });
    if (r.ok) evSaved += chunk.length;
    else console.warn(`   ⚠️  Chunk eventos: ${await r.text()}`);
  }
  console.log(`   💾  ${evSaved}/${events.length} eventos salvos`);
  console.log(`   ℹ️  Odds serão buscadas on-demand pelo process-queue.mjs`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('═'.repeat(60));
console.log(`🔐  SureEdge Cache Renew — ${new Date().toISOString()}`);
console.log('═'.repeat(60));

// Passo 1: Tenta usar o cookie existente
let cookie = null;
console.log('\n🔍  Verificando cookie existente no Supabase…');
const existing = await readCookieFromSupabase();

if (existing) {
  console.log(`   Cookie encontrado: ${existing.slice(0, 24)}…`);
  const valid = await validateCookie(existing);
  if (valid) {
    console.log('✅  Cookie válido — pulando login (economizando 2captcha)');
    cookie = existing;
  } else {
    console.log('⚠️  Cookie inválido ou expirado — será feito novo login');
  }
} else {
  console.log('   Nenhum cookie no Supabase — login necessário');
}

// Passo 2: Login (só se precisar)
if (!cookie) {
  if (!email || !password) {
    console.error('❌  SUPERMONITOR_EMAIL / PASSWORD não configurados — não é possível fazer login.');
    process.exit(1);
  }
  if (!captchaApiKey) {
    console.warn('⚠️  TWOCAPTCHA_API_KEY não configurada — login pode falhar se Turnstile exigido.');
  }

  let lastErr;
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`\n🔄  Tentativa de login ${attempt}/3`);
    try {
      cookie = await doLogin();
      break;
    } catch (err) {
      lastErr = err;
      console.error(`❌  Falhou: ${err.message}`);
      if (attempt < 3) { console.log('   Aguardando 5s…'); await new Promise(r => setTimeout(r, 5_000)); }
    }
  }

  if (!cookie) {
    console.error(`\n💥  Todas as tentativas de login falharam: ${lastErr?.message}`);
    process.exit(1);
  }

  // Valida e salva o novo cookie
  const valid = await validateCookie(cookie);
  if (!valid) console.warn('⚠️  Cookie não validado — salvando mesmo assim…');
  else console.log('✅  Novo cookie válido');

  await saveCookie(cookie);
  console.log('💾  Cookie salvo no Supabase.');
}

// Passo 3: Busca e cacheia lista de eventos (sem odds — on-demand pelo process-queue.mjs)
await fetchAndCache(cookie);

console.log('\n🎉  Concluído!\n');
