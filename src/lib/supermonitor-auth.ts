/**
 * supermonitor-auth.ts
 * Auto-login com cache de sessão server-side.
 */

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const COOKIE_TTL = 6 * 60 * 60 * 1000; // 6 horas

interface SessionCache {
  cookie:    string;
  fetchedAt: number;
}

let _cache: SessionCache | null = null;

// ── Utilitários ────────────────────────────────────────────────────────────────

/**
 * Extrai todos os valores de Set-Cookie de uma Response.
 * Node.js 18+ / undici: usa getSetCookie() (array); fallback para get().
 */
function getAllSetCookies(headers: Headers): string[] {
  // getSetCookie() disponível no Node.js 18+ com undici
  if (typeof (headers as unknown as Record<string, unknown>).getSetCookie === 'function') {
    return (headers as unknown as { getSetCookie(): string[] }).getSetCookie();
  }
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

/** Procura PHPSESSID em qualquer um dos cabeçalhos Set-Cookie */
function extractPHPSESSID(headers: Headers): string | null {
  const all = getAllSetCookies(headers);
  for (const c of all) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function doLogin(email: string, password: string): Promise<string> {
  console.log('[auth] iniciando login para', email);

  // ── Passo 1: GET login.php → captura sessão anônima + csrf_token ──────────
  const getRes = await fetch(LOGIN_PAGE, {
    headers: {
      'User-Agent':      UA,
      'Accept':          'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Cache-Control':   'no-cache',
    },
    redirect: 'follow',
  });

  console.log('[auth] GET login status:', getRes.status, 'url:', getRes.url);
  if (!getRes.ok) throw new Error(`GET login falhou (${getRes.status})`);

  const html = await getRes.text();

  // PHPSESSID anônimo
  const anonCookie = extractPHPSESSID(getRes.headers);
  console.log('[auth] anonCookie:', anonCookie ? 'obtido' : 'NÃO encontrado');

  if (!anonCookie) {
    // Tenta extrair do HTML da resposta (fallback)
    const ck = html.match(/PHPSESSID=([a-z0-9]+)/i);
    if (!ck) throw new Error('Não foi possível obter sessão do servidor (sem PHPSESSID)');
    console.log('[auth] PHPSESSID extraído do HTML');
    return doLoginWithCookie(`PHPSESSID=${ck[1]}`, html, email, password);
  }

  return doLoginWithCookie(anonCookie, html, email, password);
}

async function doLoginWithCookie(
  anonCookie: string, html: string, email: string, password: string,
): Promise<string> {
  // csrf_token (campo hidden na página) — tenta várias regex
  const csrfMatch =
    html.match(/name=["']csrf_token["'][^>]*value=["']([a-f0-9]+)["']/i) ??
    html.match(/value=["']([a-f0-9]{32,})["'][^>]*name=["']csrf_token["']/i) ??
    html.match(/csrf_token["']?\s*[^>]*value=["']([a-f0-9]+)["']/i) ??
    html.match(/<input[^>]+csrf_token[^>]+value=["']([^"']+)["']/i);

  const csrfToken = csrfMatch?.[1] ?? '';
  console.log('[auth] csrfToken:', csrfToken ? `${csrfToken.slice(0,8)}…` : 'NÃO encontrado (prosseguindo sem ele)');

  // ── Passo 2: POST login.php ────────────────────────────────────────────────
  const body = new URLSearchParams();
  if (csrfToken) body.set('csrf_token', csrfToken);
  body.set('email', email);
  body.set('senha', password);
  // NÃO preenche 'website' — honeypot anti-bot

  const postRes = await fetch(LOGIN_PAGE, {
    method:  'POST',
    headers: {
      'User-Agent':      UA,
      'Content-Type':    'application/x-www-form-urlencoded',
      'Accept':          'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language': 'pt-BR,pt;q=0.9',
      'Referer':         LOGIN_PAGE,
      'Origin':          BASE,
      'Cookie':          anonCookie,
      'Cache-Control':   'no-cache',
    },
    body:    body.toString(),
    redirect: 'manual',
  });

  console.log('[auth] POST login status:', postRes.status, 'location:', postRes.headers.get('location') ?? '(nenhum)');

  // ── Passo 3: verificar resultado ──────────────────────────────────────────
  const location  = postRes.headers.get('location') ?? '';
  const newCookie = extractPHPSESSID(postRes.headers);

  // Login bem-sucedido: redirect para fora de login.php
  if (postRes.status >= 300 && postRes.status < 400) {
    const loc = location.toLowerCase();
    const isStillLogin = loc.includes('login') || loc.includes('erro') || loc.includes('error');

    if (!isStillLogin) {
      const cookie = newCookie ?? anonCookie;
      console.log('[auth] login OK via redirect →', location);
      return cookie;
    }

    throw new Error('Credenciais inválidas — servidor redirecionou para login');
  }

  // Status 200 — verifica se ainda está na página de login
  if (postRes.status === 200) {
    const body200 = await postRes.text();
    const stillLogin = body200.includes('name="senha"') || body200.includes("name='senha'");
    if (stillLogin) throw new Error('Credenciais inválidas — página de login retornada');
    const cookie = newCookie ?? anonCookie;
    console.log('[auth] login OK via 200');
    return cookie;
  }

  throw new Error(`Login retornou status inesperado (${postRes.status})`);
}

// ── API pública ────────────────────────────────────────────────────────────────

export function invalidateCache() {
  _cache = null;
  console.log('[auth] cache invalidado');
}

/**
 * Retorna cookie ativo.
 * Prioridade: cache em memória → auto-login → cookie estático → cookie do cliente
 */
export async function getActiveCookie(clientCookie?: string): Promise<string> {
  // 1. Cache fresco
  if (_cache && Date.now() - _cache.fetchedAt < COOKIE_TTL) {
    return _cache.cookie;
  }

  const email    = (process.env.SUPERMONITOR_EMAIL    ?? '').trim();
  const password = (process.env.SUPERMONITOR_PASSWORD ?? '').trim();

  // 2. Auto-login com credenciais configuradas
  if (email && password) {
    try {
      const cookie = await doLogin(email, password);
      _cache = { cookie, fetchedAt: Date.now() };
      console.log('[auth] sessão renovada via auto-login');
      return cookie;
    } catch (err) {
      console.error('[auth] auto-login falhou:', (err as Error).message);
      // Não lança — tenta próximas opções
    }
  } else {
    console.warn('[auth] SUPERMONITOR_EMAIL / SUPERMONITOR_PASSWORD não configurados');
  }

  // 3. Cookie estático no .env
  const staticCookie = (process.env.SUPERMONITOR_COOKIE ?? '').trim();
  if (staticCookie) {
    console.log('[auth] usando SUPERMONITOR_COOKIE estático');
    _cache = { cookie: staticCookie, fetchedAt: Date.now() };
    return staticCookie;
  }

  // 4. Passado pelo cliente (retrocompatibilidade)
  if (clientCookie) {
    console.log('[auth] usando cookie do cliente');
    return clientCookie;
  }

  throw new Error('Nenhuma credencial disponível — configure SUPERMONITOR_EMAIL e SUPERMONITOR_PASSWORD no Vercel');
}
