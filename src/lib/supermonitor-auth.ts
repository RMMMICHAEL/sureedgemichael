/**
 * supermonitor-auth.ts
 * Auto-login no SuperMonitor com cache de sessão.
 * Armazena email/senha em variáveis de ambiente e renova o cookie automaticamente.
 */

const BASE       = 'https://painel.supermonitor.pro';
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const COOKIE_TTL = 6 * 60 * 60 * 1000; // 6 horas

interface SessionCache {
  cookie:     string;
  fetchedAt:  number;
}

// Cache em memória no processo do servidor (persiste enquanto o servidor rodar)
let _cache: SessionCache | null = null;

// ── Utilitários ────────────────────────────────────────────────────────────────

function extractPhpSessionId(setCookieHeader: string): string | null {
  const match = setCookieHeader.match(/PHPSESSID=([^;,\s]+)/i);
  return match ? `PHPSESSID=${match[1]}` : null;
}

function collectSetCookies(headers: Headers): string[] {
  // Next.js / node-fetch: múltiplos Set-Cookie vêm separados ou juntos
  const raw = headers.get('set-cookie') ?? '';
  return raw.split(/,(?=\s*[a-zA-Z_][a-zA-Z0-9_-]*=)/);
}

// ── Login automático ───────────────────────────────────────────────────────────

async function doLogin(email: string, password: string): Promise<string> {
  // 1. Baixa a página de login para capturar PHPSESSID inicial e campos do form
  const loginUrl  = `${BASE}/login`;
  const pageRes   = await fetch(loginUrl, {
    headers: { 'User-Agent': UA, 'Accept': 'text/html' },
    redirect: 'follow',
  });

  const html = await pageRes.text();

  // Pega PHPSESSID da página de login (sessão anônima)
  const pageSetCookies = collectSetCookies(pageRes.headers);
  let initSession = '';
  for (const sc of pageSetCookies) {
    const id = extractPhpSessionId(sc);
    if (id) { initSession = id; break; }
  }

  // Detecta token CSRF (Laravel, CodeIgniter, etc.)
  const csrfMatch = html.match(/name=["']?_token["']?[^>]+value=["']([^"']+)["']/i)
    ?? html.match(/name=["']?csrf_token["']?[^>]+value=["']([^"']+)["']/i)
    ?? html.match(/<meta[^>]+name=["']csrf-token["'][^>]+content=["']([^"']+)["']/i);
  const csrf = csrfMatch?.[1] ?? '';

  // Detecta nomes dos campos do form (pode ser email/password, login/senha, etc.)
  const emailFieldMatch    = html.match(/name=["']?(email|login|usuario|user|username)["']?/i);
  const passwordFieldMatch = html.match(/name=["']?(password|senha|pass|pwd)["']?/i);
  const emailField    = emailFieldMatch?.[1]    ?? 'email';
  const passwordField = passwordFieldMatch?.[1] ?? 'password';

  // Detecta action do formulário
  const actionMatch = html.match(/<form[^>]+action=["']([^"']+)["'][^>]*>/i);
  const formAction  = actionMatch?.[1] ?? loginUrl;
  const submitUrl   = formAction.startsWith('http')
    ? formAction
    : `${BASE}${formAction.startsWith('/') ? '' : '/'}${formAction}`;

  // 2. Envia as credenciais
  const body = new URLSearchParams();
  body.set(emailField, email);
  body.set(passwordField, password);
  if (csrf) body.set('_token', csrf);

  const loginRes = await fetch(submitUrl, {
    method:   'POST',
    headers:  {
      'User-Agent':    UA,
      'Content-Type':  'application/x-www-form-urlencoded',
      'Referer':       loginUrl,
      'Cookie':        initSession,
      'Accept':        'text/html,application/xhtml+xml,*/*',
      'Cache-Control': 'no-cache',
    },
    body:     body.toString(),
    redirect: 'manual', // não segue redirect para pegar o Set-Cookie
  });

  // Pega cookie da resposta (e de qualquer redirect)
  const setCookies = collectSetCookies(loginRes.headers);
  for (const sc of setCookies) {
    const id = extractPhpSessionId(sc);
    if (id) return id;
  }

  // Se houve redirect, segue e pega o cookie de lá
  const location = loginRes.headers.get('location');
  if (location) {
    const redirectUrl = location.startsWith('http')
      ? location
      : `${BASE}${location.startsWith('/') ? '' : '/'}${location}`;

    const redirRes = await fetch(redirectUrl, {
      headers: { 'User-Agent': UA, 'Cookie': initSession },
      redirect: 'manual',
    });
    const redirCookies = collectSetCookies(redirRes.headers);
    for (const sc of redirCookies) {
      const id = extractPhpSessionId(sc);
      if (id) return id;
    }
  }

  // Verifica se o cookie inicial ainda é válido verificando a sessão
  if (initSession) return initSession;

  throw new Error('Login falhou — verifique e-mail e senha do SuperMonitor');
}

// ── API pública ────────────────────────────────────────────────────────────────

/**
 * Invalida o cache forçando renovação na próxima chamada de getActiveCookie().
 */
export function invalidateCache() {
  _cache = null;
}

/**
 * Retorna o cookie ativo.
 * Ordem de prioridade:
 *  1. Cache em memória (se não expirado)
 *  2. Auto-login com EMAIL + PASSWORD do .env.local
 *  3. Cookie estático SUPERMONITOR_COOKIE do .env.local
 *  4. Cookie passado pelo cliente (fallback para retrocompatibilidade)
 */
export async function getActiveCookie(clientCookie?: string): Promise<string> {
  // 1. Cache fresco
  if (_cache && Date.now() - _cache.fetchedAt < COOKIE_TTL) {
    return _cache.cookie;
  }

  const email    = process.env.SUPERMONITOR_EMAIL    ?? '';
  const password = process.env.SUPERMONITOR_PASSWORD ?? '';

  // 2. Auto-login com credenciais
  if (email && password) {
    try {
      const cookie = await doLogin(email.trim(), password.trim());
      _cache = { cookie, fetchedAt: Date.now() };
      return cookie;
    } catch (err) {
      // Falhou — tenta cookie estático / cliente como fallback
      console.error('[supermonitor-auth] auto-login falhou:', err);
    }
  }

  // 3. Cookie estático no .env
  const staticCookie = process.env.SUPERMONITOR_COOKIE ?? '';
  if (staticCookie) return staticCookie;

  // 4. Passado pelo cliente
  return clientCookie ?? '';
}

