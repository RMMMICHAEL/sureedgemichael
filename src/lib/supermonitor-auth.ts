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

function extractPHPSESSID(header: string): string | null {
  const m = header.match(/PHPSESSID=([^;,\s]+)/i);
  return m ? `PHPSESSID=${m[1]}` : null;
}

/** Node.js Headers.get('set-cookie') retorna todos os cookies numa só string separada por vírgula */
function firstSetCookie(headers: Headers): string {
  return headers.get('set-cookie') ?? '';
}

// ── Login ─────────────────────────────────────────────────────────────────────

async function doLogin(email: string, password: string): Promise<string> {
  // ── Passo 1: GET login.php → captura sessão anônima + csrf_token ──────────
  const getRes = await fetch(LOGIN_PAGE, {
    headers: {
      'User-Agent':       UA,
      'Accept':           'text/html,application/xhtml+xml,*/*;q=0.9',
      'Accept-Language':  'pt-BR,pt;q=0.9',
      'Cache-Control':    'no-cache',
    },
    redirect: 'follow',
  });

  if (!getRes.ok) throw new Error(`GET login falhou (${getRes.status})`);

  const html = await getRes.text();

  // PHPSESSID anônimo (sessão será autenticada após o POST)
  const anonCookie = extractPHPSESSID(firstSetCookie(getRes.headers));
  if (!anonCookie) throw new Error('Não foi possível obter sessão do servidor');

  // csrf_token (campo hidden na página)
  const csrfMatch = html.match(/name=["']csrf_token["'][^>]+value=["']([a-f0-9]+)["']/i)
    ?? html.match(/value=["']([a-f0-9]{40,})["'][^>]+name=["']csrf_token["']/i);
  const csrfToken = csrfMatch?.[1] ?? '';

  // ── Passo 2: POST login.php com as credenciais ────────────────────────────
  // Campos confirmados pelo debug:
  //   csrf_token (hidden), email (email), senha (password), website (honeypot = vazio)
  const body = new URLSearchParams();
  if (csrfToken) body.set('csrf_token', csrfToken);
  body.set('email',   email);
  body.set('senha',   password);
  // NÃO preenche 'website' — é honeypot anti-bot (tabindex="-1")

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
    redirect: 'manual', // importante: não seguir redirect para ver o Location
  });

  // ── Passo 3: verificar resultado ──────────────────────────────────────────
  const location = postRes.headers.get('location') ?? '';
  const newCookie = extractPHPSESSID(firstSetCookie(postRes.headers));

  // Login bem-sucedido: servidor redireciona para fora de login.php
  if (postRes.status >= 300 && postRes.status < 400) {
    const normalizedLoc = location.toLowerCase();
    const isStillLogin  = normalizedLoc.includes('login') || normalizedLoc.includes('erro') || normalizedLoc.includes('error');

    if (!isStillLogin) {
      // Redireciona para o painel — login OK
      // Usa o novo cookie se o servidor emitiu um, senão usa o da sessão anônima
      return newCookie ?? anonCookie;
    }

    // Redirecionou de volta ao login → credenciais inválidas
    throw new Error('Credenciais inválidas — verifique SUPERMONITOR_EMAIL e SUPERMONITOR_PASSWORD');
  }

  // Resposta 200 no POST (sem redirect) — verifica se ainda está na página de login
  if (postRes.status === 200) {
    const body200 = await postRes.text();
    if (body200.includes('csrf_token') && body200.includes('name="senha"')) {
      // Ainda está na página de login → credenciais incorretas
      throw new Error('Credenciais inválidas — verifique SUPERMONITOR_EMAIL e SUPERMONITOR_PASSWORD');
    }
    // Página diferente — login OK
    return newCookie ?? anonCookie;
  }

  throw new Error(`Login retornou status inesperado (${postRes.status})`);
}

// ── API pública ────────────────────────────────────────────────────────────────

export function invalidateCache() {
  _cache = null;
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
    }
  }

  // 3. Cookie estático no .env
  const staticCookie = (process.env.SUPERMONITOR_COOKIE ?? '').trim();
  if (staticCookie) {
    _cache = { cookie: staticCookie, fetchedAt: Date.now() };
    return staticCookie;
  }

  // 4. Passado pelo cliente (retrocompatibilidade)
  return clientCookie ?? '';
}
