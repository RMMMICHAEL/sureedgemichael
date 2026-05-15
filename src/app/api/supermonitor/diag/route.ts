/**
 * /api/supermonitor/diag — diagnóstico do auto-login via node:https.
 * Usa a mesma lógica do supermonitor-auth.ts (keepAlive agent).
 */
import { NextResponse } from 'next/server';
import https from 'node:https';
import http  from 'node:http';
import { URL } from 'node:url';

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;
const UA         = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Agent com keepAlive — mesma lógica do supermonitor-auth.ts
const _diagAgent = new https.Agent({ keepAlive: true, maxSockets: 1, timeout: 15000 });

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
      agent:    lib === https ? _diagAgent : undefined,
      timeout:  15000,
    };
    const req = lib.request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({
        status:  res.statusCode ?? 0,
        headers: res.headers as Record<string, string | string[]>,
        body:    Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error',   reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

function extractPHPSESSID(h: string | string[] | undefined): string | null {
  const list = Array.isArray(h) ? h : h ? [h] : [];
  for (const c of list) {
    const m = c.match(/PHPSESSID=([^;,\s]+)/i);
    if (m) return `PHPSESSID=${m[1]}`;
  }
  return null;
}

const commonHeaders = {
  'User-Agent':                UA,
  'Accept':                    'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language':           'pt-BR,pt;q=0.9',
  'Accept-Encoding':           'identity',
  'Cache-Control':             'no-cache',
  'Sec-Ch-Ua':                 '"Google Chrome";v="124", "Chromium";v="124", "Not-A.Brand";v="99"',
  'Sec-Ch-Ua-Mobile':          '?0',
  'Sec-Ch-Ua-Platform':        '"Windows"',
  'Upgrade-Insecure-Requests': '1',
};

export async function GET() {
  const email    = (process.env.SUPERMONITOR_EMAIL    ?? '').trim();
  const password = (process.env.SUPERMONITOR_PASSWORD ?? '').trim();

  const report: Record<string, unknown> = {
    env_email_set:    email.length > 0,
    env_password_set: password.length > 0,
    email_preview:    email ? `${email.slice(0, 3)}…@${email.split('@')[1] ?? '?'}` : null,
    password_length:  password.length,
    method:           'node:https + keepAlive (mesmo IP)',
  };

  if (!email || !password) {
    return NextResponse.json({ ...report, error: 'Credenciais não configuradas' });
  }

  try {
    // ── Passo 1: GET login.php ────────────────────────────────────────────────
    const getRes = await nodeRequest('GET', LOGIN_PAGE, {
      ...commonHeaders,
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
    });

    const anonCookie = extractPHPSESSID(getRes.headers['set-cookie']);
    const html       = getRes.body;
    const csrfMatch  =
      html.match(/name=["']csrf_token["'][^>]*value=["']([^"']+)["']/i) ??
      html.match(/value=["']([^"']{32,})["'][^>]*name=["']csrf_token["']/i);
    const csrfToken  = csrfMatch?.[1] ?? '';

    report.step1_status    = getRes.status;
    report.step1_phpsessid = anonCookie;
    report.step1_csrf_found = !!csrfToken;
    report.step1_csrf       = csrfToken ? `${csrfToken.slice(0, 8)}…` : null;

    if (!anonCookie) {
      return NextResponse.json({ ...report, error: 'PHPSESSID não recebido no GET' });
    }

    // Delay humano
    await new Promise(r => setTimeout(r, 600));

    // ── Passo 2: POST com CSRF ────────────────────────────────────────────────
    const bodyParams = new URLSearchParams();
    if (csrfToken) bodyParams.set('csrf_token', csrfToken);
    bodyParams.set('email',   email);
    bodyParams.set('senha',   password);
    bodyParams.set('website', '');
    const bodyStr = bodyParams.toString();

    const postRes = await nodeRequest('POST', LOGIN_PAGE, {
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

    const newCookie  = extractPHPSESSID(postRes.headers['set-cookie']);
    const location   = (postRes.headers['location'] as string | undefined) ?? '';
    const isLoginPage = postRes.body.includes('name="senha"') || postRes.body.includes("name='senha'");
    const isRedirectOk = postRes.status >= 300 && postRes.status < 400 && location && !location.toLowerCase().includes('login');

    const errMsg = postRes.body
      .match(/verificação de segurança|Senha.*incorreta|Usuário.*não|muitas tentativas/i)?.[0] ?? null;

    const bodySnippet = postRes.body
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 400);

    report.step2_status        = postRes.status;
    report.step2_location      = location || null;
    report.step2_new_cookie    = newCookie;
    report.step2_is_login_page = isLoginPage;
    report.step2_redirect_ok   = isRedirectOk;
    report.step2_error_message = errMsg;
    report.step2_body_snippet  = bodySnippet;
    report.login_ok            = isRedirectOk || (!isLoginPage && postRes.status === 200);

  } catch (err: unknown) {
    report.fetch_error = (err as Error).message;
  }

  return NextResponse.json(report, { headers: { 'Cache-Control': 'no-store' } });
}
