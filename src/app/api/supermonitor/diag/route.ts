/**
 * /api/supermonitor/diag — diagnóstico do auto-login.
 * REMOVER após resolver o problema.
 */
import { NextResponse } from 'next/server';

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

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
    email_preview:    email ? `${email.slice(0, 3)}…${email.slice(email.indexOf('@'))}` : null,
  };

  if (!email || !password) {
    return NextResponse.json({ ...report, error: 'Credenciais não configuradas' });
  }

  try {
    // Passo 1: GET login page
    const getRes = await fetch(LOGIN_PAGE, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html', 'Cache-Control': 'no-cache' },
      redirect: 'follow',
    });

    const html = await getRes.text();
    const cookies = getAllSetCookies(getRes.headers);

    const phpSessMatches = cookies.map(c => c.match(/PHPSESSID=([^;,\s]+)/i)?.[1]).filter(Boolean);
    const anonSessid     = phpSessMatches[0] ?? null;
    const htmlSessMatch  = html.match(/PHPSESSID=([a-z0-9]+)/i)?.[1] ?? null;

    const csrfMatch =
      html.match(/name=["']csrf_token["'][^>]*value=["']([a-f0-9]+)["']/i) ??
      html.match(/value=["']([a-f0-9]{32,})["'][^>]*name=["']csrf_token["']/i);
    const csrfToken = csrfMatch?.[1] ?? null;

    report.step1_status      = getRes.status;
    report.step1_final_url   = getRes.url;
    report.step1_cookies     = cookies.map(c => c.slice(0, 60));
    report.step1_phpsessid   = anonSessid ?? `(header vazio — HTML: ${htmlSessMatch ?? 'não encontrado'})`;
    report.step1_csrf_found  = !!csrfToken;
    report.step1_csrf_preview= csrfToken ? `${csrfToken.slice(0, 8)}…` : null;
    report.step1_html_length = html.length;

    const effectiveCookie = anonSessid ? `PHPSESSID=${anonSessid}` : (htmlSessMatch ? `PHPSESSID=${htmlSessMatch}` : null);
    if (!effectiveCookie) {
      return NextResponse.json({ ...report, error: 'PHPSESSID não obtido no passo 1' });
    }

    // Passo 2: POST login
    const body = new URLSearchParams();
    if (csrfToken) body.set('csrf_token', csrfToken);
    body.set('email', email);
    body.set('senha', password);

    const postRes = await fetch(LOGIN_PAGE, {
      method: 'POST',
      headers: {
        'User-Agent':      UA,
        'Content-Type':    'application/x-www-form-urlencoded',
        'Accept':          'text/html',
        'Referer':         LOGIN_PAGE,
        'Origin':          BASE,
        'Cookie':          effectiveCookie,
        'Cache-Control':   'no-cache',
      },
      body: body.toString(),
      redirect: 'manual',
    });

    const postCookies  = getAllSetCookies(postRes.headers);
    const postSessid   = postCookies.map(c => c.match(/PHPSESSID=([^;,\s]+)/i)?.[1]).filter(Boolean)[0] ?? null;
    const location     = postRes.headers.get('location') ?? null;
    const postBody200  = postRes.status === 200 ? (await postRes.text()).slice(0, 200) : null;

    report.step2_status       = postRes.status;
    report.step2_location     = location;
    report.step2_cookies      = postCookies.map(c => c.slice(0, 60));
    report.step2_new_phpsessid= postSessid;
    report.step2_body_preview = postBody200;

    const loginOk = (postRes.status >= 300 && postRes.status < 400 && location && !location.toLowerCase().includes('login'))
      || (postRes.status === 200 && postBody200 && !postBody200.includes('name="senha"'));

    report.login_ok       = loginOk;
    report.final_cookie   = loginOk ? (postSessid ? `PHPSESSID=${postSessid}` : effectiveCookie) : null;

  } catch (err: unknown) {
    report.fetch_error = (err as Error).message;
  }

  return NextResponse.json(report);
}
