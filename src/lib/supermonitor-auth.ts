/**
 * supermonitor-auth.ts
 * Gerencia a sessão do provedor de dados de odds.
 *
 * Problema: o PHP do servidor amarra o CSRF token ao IP da requisição.
 * Vercel usa IPs diferentes para GET e POST (load balancer).
 * Solução: usar https.Agent com keepAlive para forçar o mesmo socket TCP
 * (e portanto o mesmo IP de saída) para GET e POST do login.
 */

import https from 'node:https';
import http  from 'node:http';
import { URL } from 'node:url';

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
const COOKIE_TTL = 6 * 60 * 60 * 1000; // 6 horas

interface SessionCache {
  cookie:    string;
  fetchedAt: number;
}

let _cache: SessionCache | null = null;

// ── Agent keepAlive (garante mesmo IP para GET e POST) ────────────────────────

const _agent = new https.Agent({
  keepAlive:    true,
  maxSockets:   1,     // força serialização — mesma conexão reutilizada
  timeout:      15000,
});

// ── HTTP helpers usando node:https (sem Fetch API) ────────────────────────────

interface HttpResponse {
  status:  number;
  headers: Record<string, string | string[]>;
  body:    string;
}

function nodeRequest(
  method: 'GET' | 'POST',
  urlStr: string,
  reqHeaders: Record<string, string>,
  body?: string,
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const u   = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;

    const options: https.RequestOptions = {
      hostname: u.hostname,
      port:     u.port || (u.protocol === 'https:' ? 443 : 80),
      path:     u.pathname + u.search,
      method,
      headers:  reqHeaders,
      agent:    lib === https ? _agent : undefined,
      timeout:  15000,
    };

    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        resolve({
          status:  res.statusCode ?? 0,
          headers: res.headers as Record<string, string | string[]>,
          body:    Buffer.concat(chunks).toString('utf8'),
        });
      });
    });

    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });

    if (body) req.write(body);
    req.end();
  });
}

// ── Supabase (storage persistente para quando auto-login falha) ───────────────

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

async function readCookieFromSupabase(): Promise<string | null> {
  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'supermonitor_cookie')
      .single();
    if (!data?.value) return null;
    const age = Date.now() - new Date(data.updated_at as string).getTime();
    if (age > 20 * 24 * 60 * 60 * 1000) return null; // > 20 dias → expirado
    return data.value as string;
  } catch {
    return null;
  }
}

export async function storeCookieInSupabase(cookie: string): Promise<void> {
  try {
    const sb = await getSupabaseAdmin();
    await sb.from('app_config').upsert(
      { key: 'supermonitor_cookie', value: cookie, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );
    _cache = { cookie, fetchedAt: Date.now() };
  } catch (err) {
    console.error('[auth] erro ao salvar no Supabase:', err);
  }
}

// ── Extração de cookies do header Set-Cookie ──────────────────────────────────

function extractPHPSESSID(setCookieHeader: string | string[] | undefined): string | null {
  const list = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader ? [setCookieHeader] : [];
  for (const c of list) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

// ── Auto-login (via node:https com keepAlive) ─────────────────────────────────

async function doLogin(email: string, password: string): Promise<string> {
  console.log('[auth] iniciando login (node:https + keepAlive) para', `${email.slice(0, 3)}…`);

  const commonHeaders = {
    'User-Agent':               UA,
    'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language':          'pt-BR,pt;q=0.9,en-US;q=0.8',
    'Accept-Encoding':          'identity', // sem compressão para simplificar leitura
    'Cache-Control':            'no-cache',
    'Sec-Ch-Ua':                '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile':         '?0',
    'Sec-Ch-Ua-Platform':       '"Windows"',
    'Upgrade-Insecure-Requests':'1',
  };

  // ── Passo 1: GET login.php ─────────────────────────────────────────────────
  const getRes = await nodeRequest('GET', LOGIN_PAGE, {
    ...commonHeaders,
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Sec-Fetch-User': '?1',
  });

  if (getRes.status !== 200) throw new Error(`GET login falhou (${getRes.status})`);

  const setCookieGet = getRes.headers['set-cookie'];
  const anonCookie   = extractPHPSESSID(setCookieGet);
  if (!anonCookie) throw new Error('PHPSESSID não recebido no GET');

  const html = getRes.body;
  const csrfMatch =
    html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i) ??
    html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
  const csrfToken = csrfMatch?.[1] ?? '';

  console.log('[auth] GET ok — sessid:', anonCookie.slice(0, 24), '— csrf:', csrfToken ? 'encontrado' : 'ausente');

  // Delay humano
  await new Promise(r => setTimeout(r, 500 + Math.random() * 400));

  // ── Passo 2: POST com CSRF ─────────────────────────────────────────────────
  const tryPost = async (includeCsrf: boolean): Promise<HttpResponse> => {
    const bodyParams = new URLSearchParams();
    if (includeCsrf && csrfToken) bodyParams.set('csrf_token', csrfToken);
    bodyParams.set('email',   email);
    bodyParams.set('senha',   password);
    bodyParams.set('website', ''); // honeypot presente e vazio (browser real sempre envia)

    const bodyStr = bodyParams.toString();

    return nodeRequest('POST', LOGIN_PAGE, {
      ...commonHeaders,
      'Content-Type':   'application/x-www-form-urlencoded',
      'Content-Length': String(Buffer.byteLength(bodyStr)),
      'Origin':         BASE,
      'Referer':        LOGIN_PAGE,
      'Cookie':         anonCookie,
      'Cache-Control':  'max-age=0',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'same-origin',
      'Sec-Fetch-User': '?1',
    }, bodyStr);
  };

  // Tentativa 1: com CSRF
  let postRes = await tryPost(true);
  let newCookie = extractPHPSESSID(postRes.headers['set-cookie']);
  const loc1 = (postRes.headers['location'] as string | undefined) ?? '';

  console.log('[auth] POST (com csrf) — status:', postRes.status, '— location:', loc1 || '(nenhum)');

  // Se redirecionou para fora de login → sucesso
  if (postRes.status >= 300 && postRes.status < 400 && loc1 && !loc1.toLowerCase().includes('login')) {
    console.log('[auth] login OK (redirect com csrf)');
    return newCookie ?? anonCookie;
  }

  // Tentativa 2: sem CSRF (alguns servidores não validam ausência do token)
  if (postRes.body.includes('verificação de segurança') || postRes.body.includes('csrf')) {
    console.log('[auth] CSRF falhou, tentando sem token…');
    await new Promise(r => setTimeout(r, 300));
    postRes    = await tryPost(false);
    newCookie  = extractPHPSESSID(postRes.headers['set-cookie']);
    const loc2 = (postRes.headers['location'] as string | undefined) ?? '';
    console.log('[auth] POST (sem csrf) — status:', postRes.status, '— location:', loc2 || '(nenhum)');

    if (postRes.status >= 300 && postRes.status < 400 && loc2 && !loc2.toLowerCase().includes('login')) {
      console.log('[auth] login OK (redirect sem csrf)');
      return newCookie ?? anonCookie;
    }
  }

  // Status 200 direto (sem redirect): verifica se ainda é página de login
  if (postRes.status === 200) {
    const body = postRes.body;
    if (body.includes('name="senha"') || body.includes("name='senha'")) {
      const errMsg = body.match(/verificação de segurança|Senha.*incorreta|Usuário.*não|muitas tentativas/i)?.[0] ?? '';
      throw new Error(
        errMsg
          ? `Login rejeitado: ${errMsg}`
          : 'Login rejeitado — credenciais inválidas ou servidor bloqueando requisição'
      );
    }
    // Página diferente de login — considera sucesso
    return newCookie ?? anonCookie;
  }

  throw new Error(`Status inesperado: ${postRes.status}`);
}

// ── Validação de cookie ───────────────────────────────────────────────────────

export async function validateCookie(cookie: string): Promise<boolean> {
  try {
    const res = await nodeRequest('GET', `${BASE}/ajax.php?action=events_lite`, {
      'User-Agent': UA,
      'Cookie':     cookie,
      'Accept':     'application/json, text/plain, */*',
      'Referer':    `${BASE}/`,
    });
    if (res.status >= 300 && res.status < 400) return false;
    if (res.body.includes('<title>Login') || res.body.includes('name="senha"')) return false;
    return res.status === 200;
  } catch {
    return false;
  }
}

// ── API pública ────────────────────────────────────────────────────────────────

export function invalidateCache() {
  _cache = null;
  console.log('[auth] cache invalidado');
}

/**
 * Retorna cookie ativo.
 * Prioridade: cache → auto-login → Supabase → env estático → clientCookie
 */
export async function getActiveCookie(clientCookie?: string): Promise<string> {
  // 1. Cache fresco
  if (_cache && Date.now() - _cache.fetchedAt < COOKIE_TTL) {
    return _cache.cookie;
  }

  const email    = (process.env.SUPERMONITOR_EMAIL    ?? '').trim();
  const password = (process.env.SUPERMONITOR_PASSWORD ?? '').trim();

  // 2. Auto-login
  if (email && password) {
    try {
      const cookie = await doLogin(email, password);
      _cache = { cookie, fetchedAt: Date.now() };
      storeCookieInSupabase(cookie).catch(() => {}); // persiste como backup
      console.log('[auth] sessão renovada via auto-login');
      return cookie;
    } catch (err) {
      console.error('[auth] auto-login falhou:', (err as Error).message);
    }
  }

  // 3. Cookie do Supabase (backup persistente)
  const sbCookie = await readCookieFromSupabase();
  if (sbCookie) {
    console.log('[auth] usando cookie do Supabase');
    _cache = { cookie: sbCookie, fetchedAt: Date.now() };
    return sbCookie;
  }

  // 4. Cookie estático do env
  const staticCookie = (process.env.SUPERMONITOR_COOKIE ?? '').trim();
  if (staticCookie) {
    _cache = { cookie: staticCookie, fetchedAt: Date.now() };
    return staticCookie;
  }

  // 5. Cookie do cliente
  if (clientCookie) return clientCookie;

  throw new Error('auth/no-cookie');
}
