/**
 * supermonitor-auth.ts
 * Gerencia a sessão do provedor de dados de odds.
 *
 * Prioridade do cookie:
 *   1. Cache em memória (até 6h)
 *   2. Auto-login server-side (credenciais no env)
 *   3. Cookie salvo no Supabase (definido pelo admin via UI)
 *   4. Cookie estático no env (SUPERMONITOR_COOKIE)
 *   5. Cookie passado pelo cliente (retrocompatibilidade)
 */

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const COOKIE_TTL = 6 * 60 * 60 * 1000; // 6 horas

// Chrome 124 User-Agent completo
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

interface SessionCache {
  cookie:    string;
  fetchedAt: number;
}

let _cache: SessionCache | null = null;

// ── Supabase (importação dinâmica para evitar ciclos) ─────────────────────────

async function getSupabaseAdmin() {
  const { createClient } = await import('@supabase/supabase-js');
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

/** Lê cookie salvo pelo admin no Supabase */
async function readCookieFromSupabase(): Promise<string | null> {
  try {
    const sb = await getSupabaseAdmin();
    const { data } = await sb
      .from('app_config')
      .select('value, updated_at')
      .eq('key', 'supermonitor_cookie')
      .single();
    if (!data?.value) return null;
    // Ignora se tiver mais de 20 dias (PHP session max lifetime)
    const age = Date.now() - new Date(data.updated_at as string).getTime();
    if (age > 20 * 24 * 60 * 60 * 1000) return null;
    return data.value as string;
  } catch {
    return null;
  }
}

/** Salva cookie no Supabase (upsert) */
export async function storeCookieInSupabase(cookie: string): Promise<void> {
  try {
    const sb = await getSupabaseAdmin();
    await sb.from('app_config').upsert({
      key:        'supermonitor_cookie',
      value:      cookie,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'key' });
    // Atualiza o cache em memória
    _cache = { cookie, fetchedAt: Date.now() };
    console.log('[auth] cookie salvo no Supabase');
  } catch (err) {
    console.error('[auth] erro ao salvar cookie no Supabase:', err);
  }
}

/** Invalida o cookie salvo no Supabase */
export async function clearCookieFromSupabase(): Promise<void> {
  try {
    const sb = await getSupabaseAdmin();
    await sb.from('app_config').delete().eq('key', 'supermonitor_cookie');
    _cache = null;
  } catch { /* noop */ }
}

// ── Extração de cookies ───────────────────────────────────────────────────────

function getAllSetCookies(headers: Headers): string[] {
  // Node.js 18+ com undici usa getSetCookie() (array)
  if (typeof (headers as unknown as Record<string, unknown>).getSetCookie === 'function') {
    return (headers as unknown as { getSetCookie(): string[] }).getSetCookie();
  }
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

function extractPHPSESSID(headers: Headers): string | null {
  for (const c of getAllSetCookies(headers)) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

// ── Validação de cookie ───────────────────────────────────────────────────────

/** Verifica se o cookie ainda tem uma sessão válida */
export async function validateCookie(cookie: string): Promise<boolean> {
  try {
    const res = await fetch(`${BASE}/ajax.php?action=events_lite`, {
      headers: {
        'User-Agent': UA,
        'Cookie':     cookie,
        'Accept':     'application/json, text/plain, */*',
        'Referer':    `${BASE}/`,
      },
      redirect: 'manual',
    });
    // Redirect para login = sessão inválida
    if (res.status >= 300 && res.status < 400) return false;
    if (res.status === 200) {
      const text = await res.text();
      // Se retornar HTML da página de login, sessão inválida
      if (text.includes('<title>Login') || text.includes('name="senha"')) return false;
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

// ── Auto-login ─────────────────────────────────────────────────────────────────

async function doLogin(email: string, password: string): Promise<string> {
  console.log('[auth] tentando auto-login para', `${email.slice(0,3)}…`);

  // Passo 1: GET login.php
  const getRes = await fetch(LOGIN_PAGE, {
    headers: {
      'User-Agent':               UA,
      'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language':          'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding':          'gzip, deflate, br',
      'Cache-Control':            'no-cache',
      'Sec-Ch-Ua':                '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile':         '?0',
      'Sec-Ch-Ua-Platform':       '"Windows"',
      'Sec-Fetch-Dest':           'document',
      'Sec-Fetch-Mode':           'navigate',
      'Sec-Fetch-Site':           'none',
      'Sec-Fetch-User':           '?1',
      'Upgrade-Insecure-Requests':'1',
    },
    redirect: 'follow',
  });

  if (!getRes.ok) throw new Error(`GET login falhou (${getRes.status})`);

  const html = await getRes.text();
  const anonCookie = extractPHPSESSID(getRes.headers);
  if (!anonCookie) throw new Error('PHPSESSID não recebido no GET');

  // Extrai csrf_token
  const csrfMatch =
    html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i) ??
    html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
  const csrfToken = csrfMatch?.[1] ?? '';

  console.log('[auth] passo 1 ok — cookie:', anonCookie.slice(0,20), '— csrf:', csrfToken ? 'encontrado' : 'não encontrado');

  // Pequeno delay para simular comportamento humano (400-900ms)
  await new Promise(r => setTimeout(r, 400 + Math.random() * 500));

  // Passo 2: POST login — inclui TODOS os campos do formulário (incluindo honeypot vazio)
  // Bots que sabem do honeypot costumam omiti-lo; aqui incluímos explicitamente vazio
  const body = new URLSearchParams();
  if (csrfToken) body.set('csrf_token', csrfToken);
  body.set('email',   email);
  body.set('senha',   password);
  body.set('website', ''); // honeypot — deve estar presente e vazio

  const postHeaders = {
    'User-Agent':               UA,
    'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'Accept-Language':          'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding':          'gzip, deflate, br',
    'Content-Type':             'application/x-www-form-urlencoded',
    'Content-Length':           String(Buffer.byteLength(body.toString())),
    'Origin':                   BASE,
    'Referer':                  LOGIN_PAGE,
    'Cookie':                   anonCookie,
    'Cache-Control':            'max-age=0',
    'Sec-Ch-Ua':                '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile':         '?0',
    'Sec-Ch-Ua-Platform':       '"Windows"',
    'Sec-Fetch-Dest':           'document',
    'Sec-Fetch-Mode':           'navigate',
    'Sec-Fetch-Site':           'same-origin',
    'Sec-Fetch-User':           '?1',
    'Upgrade-Insecure-Requests':'1',
    'Connection':               'keep-alive',
  };

  // Tenta primeiro seguindo redirect (alguns PHP apps autenticam e redirecionam)
  const postResFollow = await fetch(LOGIN_PAGE, {
    method:  'POST',
    headers: postHeaders,
    body:    body.toString(),
    redirect: 'follow',
  });

  console.log('[auth] passo 2 (follow) — status:', postResFollow.status, 'url:', postResFollow.url);

  // Se redirecionou para fora do login, é sucesso
  if (!postResFollow.url.toLowerCase().includes('login')) {
    const cookieFollow = extractPHPSESSID(postResFollow.headers) ?? anonCookie;
    console.log('[auth] login OK via redirect (follow)');
    return cookieFollow;
  }

  // Se voltou ao login, tenta com redirect: 'manual' para capturar o Location header
  const postRes = await fetch(LOGIN_PAGE, {
    method:  'POST',
    headers: postHeaders,
    body:    body.toString(),
    redirect: 'manual',
  });

  const location  = postRes.headers.get('location') ?? '';
  const newCookie = extractPHPSESSID(postRes.headers);

  console.log('[auth] passo 2 (manual) — status:', postRes.status, '— location:', location || '(nenhum)');

  if (postRes.status >= 300 && postRes.status < 400) {
    if (!location.toLowerCase().includes('login') && !location.toLowerCase().includes('erro')) {
      return newCookie ?? anonCookie;
    }
    throw new Error('Credenciais inválidas — servidor retornou redirect para login');
  }

  if (postRes.status === 200) {
    const html200 = await postRes.text();
    if (html200.includes('name="senha"') || html200.includes("name='senha'")) {
      // Tenta extrair mensagem de erro da página
      const errMsg = html200.match(/class=["'][^"']*alert[^"']*["'][^>]*>([^<]{5,100})</i)?.[1]?.trim()
        ?? html200.match(/class=["'][^"']*erro[^"']*["'][^>]*>([^<]{5,100})</i)?.[1]?.trim()
        ?? '';
      throw new Error(
        errMsg
          ? `Login rejeitado: ${errMsg}`
          : 'Login rejeitado pelo servidor — verifique SUPERMONITOR_EMAIL e SUPERMONITOR_PASSWORD no Vercel'
      );
    }
    return newCookie ?? anonCookie;
  }

  throw new Error(`Status inesperado no login: ${postRes.status}`);
}

// ── API pública ────────────────────────────────────────────────────────────────

export function invalidateCache() {
  _cache = null;
}

/**
 * Retorna cookie ativo.
 *
 * Prioridade:
 *   1. Cache em memória (6h)
 *   2. Auto-login com credenciais do env
 *   3. Cookie do Supabase (salvo pelo admin via UI)
 *   4. Cookie estático do env (SUPERMONITOR_COOKIE)
 *   5. Cookie do cliente
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
      // Persiste no Supabase como backup
      storeCookieInSupabase(cookie).catch(() => {});
      console.log('[auth] sessão renovada via auto-login');
      return cookie;
    } catch (err) {
      console.error('[auth] auto-login falhou:', (err as Error).message);
    }
  }

  // 3. Cookie do Supabase (definido pelo admin via UI)
  const sbCookie = await readCookieFromSupabase();
  if (sbCookie) {
    console.log('[auth] usando cookie do Supabase');
    _cache = { cookie: sbCookie, fetchedAt: Date.now() };
    return sbCookie;
  }

  // 4. Cookie estático do env
  const staticCookie = (process.env.SUPERMONITOR_COOKIE ?? '').trim();
  if (staticCookie) {
    console.log('[auth] usando SUPERMONITOR_COOKIE do env');
    _cache = { cookie: staticCookie, fetchedAt: Date.now() };
    return staticCookie;
  }

  // 5. Cookie do cliente
  if (clientCookie) return clientCookie;

  throw new Error('auth/no-cookie');
}
