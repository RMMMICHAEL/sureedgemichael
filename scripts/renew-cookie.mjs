/**
 * renew-cookie.mjs — v4.0 (sem browser)
 *
 * Faz login no SuperMonitor via HTTP puro (node:https + keepAlive),
 * sem Playwright nem Chromium. O fingerprint TLS do Node.js é diferente
 * do Chromium, por isso não aciona o "Attention Required!" do Cloudflare.
 *
 * Variáveis de ambiente:
 *   SUPERMONITOR_EMAIL        — e-mail de login
 *   SUPERMONITOR_PASSWORD     — senha de login
 *   NEXT_PUBLIC_SUPABASE_URL  — URL do Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — chave de serviço Supabase
 */

import https from 'node:https';
import http  from 'node:http';
import { URL } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// ── Configuração ──────────────────────────────────────────────────────────────

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const email    = (process.env.SUPERMONITOR_EMAIL        ?? '').trim();
const password = (process.env.SUPERMONITOR_PASSWORD     ?? '').trim();
const sbUrl    = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey    = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!email || !password) { console.error('❌  SUPERMONITOR_EMAIL / PASSWORD não configurados.'); process.exit(1); }
if (!sbUrl  || !sbKey)   { console.error('❌  Supabase não configurado.');                       process.exit(1); }

// ── Agent keepAlive — garante mesmo IP/socket para GET e POST ─────────────────
// O Cloudflare amarra o CSRF token ao IP. keepAlive força a mesma conexão TCP.

const agent = new https.Agent({ keepAlive: true, maxSockets: 1, timeout: 20_000 });

// ── HTTP helper ───────────────────────────────────────────────────────────────

function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;

    const req = lib.request(
      {
        hostname: u.hostname,
        port:     u.port || (u.protocol === 'https:' ? 443 : 80),
        path:     u.pathname + u.search,
        method,
        headers,
        agent:   lib === https ? agent : undefined,
        timeout: 20_000,
      },
      res => {
        const chunks = [];
        res.on('data', c => chunks.push(c));
        res.on('end', () =>
          resolve({
            status:  res.statusCode ?? 0,
            headers: res.headers,
            body:    Buffer.concat(chunks).toString('utf8'),
          })
        );
      }
    );

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('request timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

// ── Extrai PHPSESSID do header Set-Cookie ─────────────────────────────────────

function extractPHPSESSID(setCookie) {
  const list = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
  for (const c of list) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

// ── Login via HTTP puro ────────────────────────────────────────────────────────

async function doLogin() {
  const commonHeaders = {
    'User-Agent':                UA,
    'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':           'pt-BR,pt;q=0.9,en-US;q=0.8',
    'Accept-Encoding':           'identity',
    'Cache-Control':             'no-cache',
    'Pragma':                    'no-cache',
    'Sec-Ch-Ua':                 '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile':          '?0',
    'Sec-Ch-Ua-Platform':        '"Windows"',
    'Upgrade-Insecure-Requests': '1',
  };

  // ── Passo 1: GET login.php — pega sessão anônima + CSRF ──────────────────────
  console.log('📄  GET login.php…');
  const getRes = await request('GET', LOGIN_PAGE, {
    ...commonHeaders,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  });

  console.log(`   status: ${getRes.status}`);

  // Detecta se Cloudflare serviu página de challenge mesmo via HTTP puro
  if (getRes.body.includes('Attention Required') || getRes.body.includes('cf-browser-verification')) {
    throw new Error(
      'Cloudflare bloqueou requisição HTTP pura — IP do runner está em hard block.\n' +
      'Solução: configure um self-hosted runner com IP residencial ou use PROXY_URL.'
    );
  }

  if (getRes.status !== 200) {
    throw new Error(`GET login.php falhou com status ${getRes.status}`);
  }

  const anonCookie = extractPHPSESSID(getRes.headers['set-cookie']);
  if (!anonCookie) throw new Error('PHPSESSID não recebido no GET — sessão não iniciada');

  // Extrai CSRF token do HTML
  const html = getRes.body;
  const csrfMatch =
    html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i) ??
    html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
  const csrfToken = csrfMatch?.[1] ?? '';

  console.log(`   sessid: ${anonCookie.slice(0, 24)}…  csrf: ${csrfToken ? '✓' : 'ausente'}`);

  // Delay humano (evita rate-limit)
  await new Promise(r => setTimeout(r, 600 + Math.random() * 400));

  // ── Passo 2: POST com credenciais ────────────────────────────────────────────
  const tryPost = async (withCsrf) => {
    const params = new URLSearchParams();
    if (withCsrf && csrfToken) params.set('csrf_token', csrfToken);
    params.set('email',   email);
    params.set('senha',   password);
    params.set('website', ''); // honeypot

    const bodyStr = params.toString();

    return request('POST', LOGIN_PAGE, {
      ...commonHeaders,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(bodyStr)),
      'Cookie':         anonCookie,
      'Origin':         BASE,
      'Referer':        LOGIN_PAGE,
      'Cache-Control':  'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    }, bodyStr);
  };

  console.log('📤  POST credenciais (com CSRF)…');
  let postRes   = await tryPost(true);
  let newCookie = extractPHPSESSID(postRes.headers['set-cookie']);
  const loc1    = String(postRes.headers['location'] ?? '');

  console.log(`   status: ${postRes.status}  location: ${loc1 || '(nenhum)'}`);

  // Redirect para fora de login = sucesso
  if (postRes.status >= 300 && postRes.status < 400 && loc1 && !loc1.toLowerCase().includes('login')) {
    console.log('✅  Login OK via redirect (com CSRF)');
    return newCookie ?? anonCookie;
  }

  // CSRF rejeitado → tenta sem
  if (postRes.body.includes('csrf') || postRes.body.includes('verificação de segurança')) {
    console.log('   CSRF rejeitado — tentando sem token…');
    await new Promise(r => setTimeout(r, 400));
    postRes   = await tryPost(false);
    newCookie = extractPHPSESSID(postRes.headers['set-cookie']);
    const loc2 = String(postRes.headers['location'] ?? '');
    console.log(`   status: ${postRes.status}  location: ${loc2 || '(nenhum)'}`);

    if (postRes.status >= 300 && postRes.status < 400 && loc2 && !loc2.toLowerCase().includes('login')) {
      console.log('✅  Login OK via redirect (sem CSRF)');
      return newCookie ?? anonCookie;
    }
  }

  // Status 200 mas não está mais na página de login = sucesso silencioso
  if (postRes.status === 200) {
    const body = postRes.body;
    if (body.includes('name="senha"') || body.includes("name='senha'")) {
      const errMsg =
        body.match(/muitas tentativas|Senha.*incorreta|Usuário.*não|verificação de segurança/i)?.[0] ?? '';
      throw new Error(errMsg ? `Login rejeitado: ${errMsg}` : 'Login rejeitado — credenciais inválidas');
    }
    // Qualquer outra página = considera autenticado
    console.log('✅  Login OK (status 200, fora da página de login)');
    return newCookie ?? anonCookie;
  }

  throw new Error(`Resposta inesperada: status ${postRes.status}`);
}

// ── Validação rápida do cookie ────────────────────────────────────────────────

async function validateCookie(cookie) {
  try {
    const res = await request('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA,
      'Cookie':     cookie,
      'Accept':     'application/json, text/plain, */*',
      'Referer':    `${BASE}/`,
    });
    if (res.status !== 200) return false;
    if (res.body.includes('<title>Login') || res.body.includes('name="senha"')) return false;
    return true;
  } catch {
    return false;
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('═'.repeat(60));
console.log(`🔐  SuperMonitor Cookie Renew — ${new Date().toISOString()}`);
console.log('    Modo: HTTP puro (sem browser, sem Playwright)');
console.log('═'.repeat(60));
console.log(`📧  Usuário: ${email.slice(0, 3)}…`);

let cookie;
let lastErr;

for (let attempt = 1; attempt <= 3; attempt++) {
  console.log(`\n🔄  Tentativa ${attempt}/3`);
  try {
    cookie = await doLogin();
    break;
  } catch (err) {
    lastErr = err;
    console.error(`❌  Falhou: ${err.message}`);
    if (attempt < 3) {
      console.log('   Aguardando 5s…');
      await new Promise(r => setTimeout(r, 5_000));
    }
  }
}

if (!cookie) {
  console.error(`\n💥  Todas as tentativas falharam: ${lastErr?.message}`);
  process.exit(1);
}

// Valida o cookie antes de salvar
console.log('\n🔍  Validando cookie…');
const valid = await validateCookie(cookie);
if (!valid) {
  console.warn('⚠️  Cookie não validado (pode ainda funcionar) — salvando mesmo assim…');
} else {
  console.log('✅  Cookie válido');
}

// Salva no Supabase
console.log(`🍪  Cookie: ${cookie.slice(0, 24)}…`);
const sb = createClient(sbUrl, sbKey);
const { error } = await sb
  .from('app_config')
  .upsert(
    { key: 'supermonitor_cookie', value: cookie, updated_at: new Date().toISOString() },
    { onConflict: 'key' }
  );

if (error) {
  console.error(`❌  Supabase: ${error.message}`);
  process.exit(1);
}

console.log('💾  Cookie salvo no Supabase.');
console.log('🎉  Renovação concluída!\n');
