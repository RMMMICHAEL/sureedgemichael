/**
 * /api/supermonitor/diag — diagnóstico detalhado do auto-login.
 * REMOVER após resolver o problema.
 */
import { NextResponse } from 'next/server';

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function getAllSetCookies(headers: Headers): string[] {
  if (typeof (headers as unknown as Record<string, unknown>).getSetCookie === 'function') {
    return (headers as unknown as { getSetCookie(): string[] }).getSetCookie();
  }
  const raw = headers.get('set-cookie');
  return raw ? [raw] : [];
}

export async function GET() {
  const email    = (process.env.SUPERMONITOR_EMAIL    ?? '').trim();
  const password = (process.env.SUPERMONITOR_PASSWORD ?? '').trim();

  const report: Record<string, unknown> = {
    env_email_set:    email.length > 0,
    env_password_set: password.length > 0,
    email_preview:    email ? `${email.slice(0, 3)}…@${email.split('@')[1] ?? '?'}` : null,
    password_length:  password.length,
  };

  if (!email || !password) {
    return NextResponse.json({ ...report, error: 'Credenciais não configuradas' });
  }

  try {
    // Passo 1: GET login page (com headers completos do Chrome)
    const getRes = await fetch(LOGIN_PAGE, {
      headers: {
        'User-Agent':               UA,
        'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language':          'pt-BR,pt;q=0.9',
        'Cache-Control':            'no-cache',
        'Sec-Ch-Ua':                '"Google Chrome";v="124"',
        'Sec-Fetch-Dest':           'document',
        'Sec-Fetch-Mode':           'navigate',
        'Sec-Fetch-Site':           'none',
        'Upgrade-Insecure-Requests':'1',
      },
      redirect: 'follow',
    });

    const html = await getRes.text();
    const cookies = getAllSetCookies(getRes.headers);
    const phpSessid = cookies.map(c => c.match(/PHPSESSID=([^;,\s]+)/i)?.[1]).filter(Boolean)[0] ?? null;

    const csrfMatch =
      html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i) ??
      html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
    const csrfToken = csrfMatch?.[1] ?? null;

    report.step1_status     = getRes.status;
    report.step1_url        = getRes.url;
    report.step1_phpsessid  = phpSessid;
    report.step1_csrf_found = !!csrfToken;
    report.step1_csrf       = csrfToken ? `${csrfToken.slice(0,8)}…` : null;

    const effectiveCookie = phpSessid ? `PHPSESSID=${phpSessid}` : null;
    if (!effectiveCookie) {
      return NextResponse.json({ ...report, error: 'PHPSESSID não obtido' });
    }

    // Delay humano
    await new Promise(r => setTimeout(r, 600));

    // Passo 2: POST — com TODOS os campos incluindo honeypot vazio
    const body = new URLSearchParams();
    if (csrfToken) body.set('csrf_token', csrfToken);
    body.set('email',   email);
    body.set('senha',   password);
    body.set('website', ''); // honeypot presente e vazio

    const postHeaders = {
      'User-Agent':               UA,
      'Accept':                   'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language':          'pt-BR,pt;q=0.9',
      'Content-Type':             'application/x-www-form-urlencoded',
      'Origin':                   BASE,
      'Referer':                  LOGIN_PAGE,
      'Cookie':                   effectiveCookie,
      'Cache-Control':            'max-age=0',
      'Sec-Ch-Ua':                '"Google Chrome";v="124"',
      'Sec-Fetch-Dest':           'document',
      'Sec-Fetch-Mode':           'navigate',
      'Sec-Fetch-Site':           'same-origin',
      'Sec-Fetch-User':           '?1',
      'Upgrade-Insecure-Requests':'1',
    };

    // Testa com redirect: 'follow'
    const postFollow = await fetch(LOGIN_PAGE, {
      method: 'POST', headers: postHeaders, body: body.toString(), redirect: 'follow',
    });
    const followBody = await postFollow.text();
    const followIsLogin = followBody.includes('name="senha"') || postFollow.url.includes('login');

    report.step2_follow_status   = postFollow.status;
    report.step2_follow_url      = postFollow.url;
    report.step2_follow_is_login = followIsLogin;

    // Extrai mensagem de erro se houver
    const errMsg = followBody.match(/class=["'][^"']*(?:alert|erro|error|danger)[^"']*["'][^>]*>\s*([^<]{5,200})/i)?.[1]?.trim()
      ?? followBody.match(/<p[^>]*>\s*(Senha|Email|Usuário|Acesso|Erro|Inválid)[^<]{0,150}/i)?.[0]?.replace(/<[^>]+>/g,'').trim()
      ?? null;
    report.step2_error_message = errMsg;

    // Preview maior do body para diagnóstico
    report.step2_body_snippet = followBody
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi,'')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi,'')
      .replace(/<[^>]+>/g,' ')
      .replace(/\s+/g,' ')
      .trim()
      .slice(0, 500);

    report.login_ok = !followIsLogin;

  } catch (err: unknown) {
    report.fetch_error = (err as Error).message;
  }

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
