/**
 * renew-cookie.mjs — v3.0
 *
 * Abre Chromium com stealth, detecta e resolve TODOS os cenários do Cloudflare,
 * faz login no SuperMonitor e salva o PHPSESSID no Supabase.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Cenários Cloudflare cobertos:                                  │
 * │  1. IUAM "Just a moment" — JS challenge, auto-resolve           │
 * │  2. Managed Challenge (Turnstile na página do CF)               │
 * │  3. Interactive Challenge (hCaptcha na página do CF)            │
 * │  4. Hard Block / Access Denied (sem widget) — precisa proxy     │
 * │  5. Redirect loop com parâmetros __cf_chl na URL                │
 * │  6. Turnstile / hCaptcha no próprio formulário do site          │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Variáveis de ambiente:
 *   SUPERMONITOR_EMAIL        — e-mail de login
 *   SUPERMONITOR_PASSWORD     — senha de login
 *   NEXT_PUBLIC_SUPABASE_URL  — URL do Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — chave de serviço Supabase
 *   TWOCAPTCHA_API_KEY        — chave da API 2captcha
 *   PROXY_URL (opcional)      — proxy residencial: http://user:pass@host:port
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';

chromium.use(StealthPlugin());

// ── Constantes ────────────────────────────────────────────────────────────────

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;

const MAX_LOGIN_RETRIES = 3;   // tentativas totais de login
const CF_AUTO_WAIT_MS   = 35_000; // tempo para CF JS challenge auto-resolver
const CF_POLL_MS        = 2_000;
const CAP_POLL_INTERVAL = 5_000;
const CAP_MAX_POLLS     = 24;     // 24 × 5s = 2 min

// ── Env vars ──────────────────────────────────────────────────────────────────

const email         = (process.env.SUPERMONITOR_EMAIL        ?? '').trim();
const password      = (process.env.SUPERMONITOR_PASSWORD     ?? '').trim();
const sbUrl         = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey         = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const captchaApiKey = (process.env.TWOCAPTCHA_API_KEY        ?? '').trim();
const proxyUrl      = (process.env.PROXY_URL                 ?? '').trim();

if (!email || !password) { console.error('❌  Credenciais não configuradas.'); process.exit(1); }
if (!sbUrl  || !sbKey)   { console.error('❌  Supabase não configurado.');      process.exit(1); }
if (!captchaApiKey)      { console.error('❌  TWOCAPTCHA_API_KEY não configurada.'); process.exit(1); }

// ── Parse proxy URL → objeto 2captcha ────────────────────────────────────────

function parseProxy(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    return {
      server:   url,                            // para Playwright
      type:     u.protocol.replace(':', ''),    // http | socks5
      address:  u.hostname,
      port:     parseInt(u.port || '80', 10),
      login:    decodeURIComponent(u.username) || undefined,
      password: decodeURIComponent(u.password) || undefined,
    };
  } catch {
    return null;
  }
}

const proxy = parseProxy(proxyUrl);

if (proxy) {
  console.log(`🌐  Proxy: ${proxy.type}://${proxy.address}:${proxy.port}`);
} else {
  console.log('ℹ️  Sem proxy — IP do runner pode ser bloqueado pelo Cloudflare');
}

// ── 2captcha helper ───────────────────────────────────────────────────────────

/**
 * Resolve um captcha via 2captcha.
 * @param {'turnstile'|'hcaptcha'} type
 * @param {string} siteKey
 * @param {string} pageUrl
 * @returns {Promise<string>} token
 */
async function solveCaptcha(type, siteKey, pageUrl) {
  const taskTypeMap = {
    turnstile: proxy ? 'TurnstileTask'   : 'TurnstileTaskProxyless',
    hcaptcha:  proxy ? 'HCaptchaTask'    : 'HCaptchaTaskProxyless',
  };

  const taskType = taskTypeMap[type];
  if (!taskType) throw new Error(`Tipo de captcha desconhecido: ${type}`);

  const proxyFields = proxy ? {
    proxyType:     proxy.type,
    proxyAddress:  proxy.address,
    proxyPort:     proxy.port,
    proxyLogin:    proxy.login,
    proxyPassword: proxy.password,
  } : {};

  const siteKeyField = type === 'hcaptcha' ? 'websiteKey' : 'websiteKey';

  console.log(`🤖  2captcha [${taskType}] — siteKey: ${siteKey.slice(0, 14)}…`);

  const createRes = await fetch('https://api.2captcha.com/createTask', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: captchaApiKey,
      task: {
        type:        taskType,
        websiteURL:  pageUrl,
        [siteKeyField]: siteKey,
        ...proxyFields,
      },
    }),
  });

  const created = await createRes.json();
  if (created.errorId !== 0) throw new Error(`2captcha createTask: ${created.errorCode}`);

  const taskId = created.taskId;
  console.log(`⏳  Task ${taskId} criada. Aguardando…`);

  for (let i = 0; i < CAP_MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, CAP_POLL_INTERVAL));

    const res = await fetch('https://api.2captcha.com/getTaskResult', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: captchaApiKey, taskId }),
    });
    const result = await res.json();

    if (result.errorId !== 0) throw new Error(`2captcha getTaskResult: ${result.errorCode}`);
    if (result.status === 'ready') {
      const token = result.solution?.token ?? result.solution?.gRecaptchaResponse;
      console.log(`✅  Captcha resolvido: ${String(token).slice(0, 20)}…`);
      return token;
    }
    console.log(`   … ${(i + 1) * (CAP_POLL_INTERVAL / 1000)}s`);
  }

  throw new Error('2captcha timeout — solução não chegou em 2 minutos');
}

// ── Detectar estado Cloudflare ────────────────────────────────────────────────

/**
 * Identifica o tipo de challenge Cloudflare presente na página.
 * @returns {{ isCF: boolean, type: 'none'|'js'|'turnstile'|'hcaptcha'|'hard_block', siteKey: string|null }}
 */
async function detectCFState(page) {
  const title = await page.title().catch(() => '');
  const url   = page.url();

  // Sinais de CF na URL (redirect challenge)
  const cfInUrl = /(__cf_chl|cf_chl|cdn-cgi\/challenge)/i.test(url);

  // Sinais no título
  const cfInTitle = /just a moment|attention required|access denied|cloudflare/i.test(title);

  // Sinais no DOM
  const domInfo = await page.evaluate(() => {
    const body = document.body?.innerHTML ?? '';

    // Sinal de CF via DOM elements
    const cfDom =
      !!document.querySelector('#cf-wrapper, #cf-challenge-running, .cf-browser-verification, [data-cf-settings]') ||
      body.includes('cdn-cgi/challenge') ||
      body.includes('cf-challenge') ||
      body.includes('cloudflare');

    // Turnstile na página CF (diferente do Turnstile do próprio site)
    const turnstileEl = document.querySelector('.cf-turnstile, div[data-sitekey]');
    let turnstileSiteKey = turnstileEl?.getAttribute('data-sitekey') ?? null;

    // Fallback: script inline
    if (!turnstileSiteKey) {
      for (const s of Array.from(document.querySelectorAll('script'))) {
        const m = (s.textContent || '').match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
        if (m) { turnstileSiteKey = m[1]; break; }
      }
    }

    // hCaptcha na página CF
    const hcaptchaEl = document.querySelector('.h-captcha, #cf-hcaptcha-container, iframe[src*="hcaptcha"]');
    const hcaptchaSiteKey = hcaptchaEl?.getAttribute('data-sitekey') ?? null;

    // IUAM: JS challenge rodando (não tem widget visível)
    const isIUAM = !!document.querySelector('#cf-challenge-running, #trk_jschal_js') ||
      (document.title === 'Just a moment...');

    return { cfDom, turnstileSiteKey, hcaptchaSiteKey, isIUAM };
  }).catch(() => ({ cfDom: false, turnstileSiteKey: null, hcaptchaSiteKey: null, isIUAM: false }));

  const isCF = cfInTitle || cfInUrl || domInfo.cfDom;
  if (!isCF) return { isCF: false, type: 'none', siteKey: null };

  // Classifica o tipo
  if (domInfo.turnstileSiteKey) {
    return { isCF: true, type: 'turnstile', siteKey: domInfo.turnstileSiteKey };
  }
  if (domInfo.hcaptchaSiteKey) {
    return { isCF: true, type: 'hcaptcha', siteKey: domInfo.hcaptchaSiteKey };
  }
  if (domInfo.isIUAM || title === 'Just a moment...') {
    return { isCF: true, type: 'js', siteKey: null };
  }

  // CF presente mas sem widget identificável → hard block ou JS challenge sem sinal
  // Tratamos como 'js' primeiro (aguardamos auto-resolução antes de desistir)
  return { isCF: true, type: 'js', siteKey: null };
}

// ── Aguardar saída da página CF ───────────────────────────────────────────────

async function waitOutOfCF(page, label = '') {
  await page.waitForFunction(
    () => {
      const title = document.title;
      const url   = window.location.href;
      const cfTitle = /just a moment|attention required|access denied|cloudflare/i.test(title);
      const cfUrl   = /(__cf_chl|cf_chl|cdn-cgi\/challenge)/i.test(url);
      const cfDom   = !!document.querySelector('#cf-wrapper, #cf-challenge-running');
      return !cfTitle && !cfUrl && !cfDom;
    },
    { timeout: CF_AUTO_WAIT_MS, polling: CF_POLL_MS }
  );
  const newTitle = await page.title().catch(() => '');
  console.log(`✅  CF saiu${label}. Título agora: "${newTitle}"`);
}

// ── Injetar token e submeter o form do CF ─────────────────────────────────────

async function submitCFForm(page, token, captchaType) {
  await page.evaluate(({ token, captchaType }) => {
    if (captchaType === 'hcaptcha') {
      // hCaptcha injections
      const resp = document.querySelector('textarea[name="h-captcha-response"], input[name="h-captcha-response"]');
      if (resp) resp.value = token;
      const gresp = document.querySelector('textarea[name="g-recaptcha-response"], input[name="g-recaptcha-response"]');
      if (gresp) gresp.value = token;
    } else {
      // Turnstile injection
      const resp = document.querySelector('input[name="cf-turnstile-response"]');
      if (resp) resp.value = token;

      // Tenta callback do widget se existir
      if (window.turnstile) {
        try { window.turnstile.reset(); } catch {}
      }
    }

    // Submit do form CF
    const form = document.querySelector('#challenge-form, form[action*="challenge"], form');
    if (form) {
      form.submit();
    } else {
      // Fallback: botão de submit
      const btn = document.querySelector('button[type="submit"], input[type="submit"]');
      if (btn) btn.click();
    }
  }, { token, captchaType });
}

// ── Resolver Cloudflare (todas as variantes) ──────────────────────────────────

/**
 * Detecta e resolve o challenge do Cloudflare na página atual.
 * Retorna false se não havia CF, true se resolveu com sucesso.
 * Lança erro se não conseguiu resolver.
 */
async function resolveCF(page, loginUrl, attempt = 1) {
  const state = await detectCFState(page);

  if (!state.isCF) return false;

  console.log(`\n🛡️  CF detectado [tentativa ${attempt}] — tipo: ${state.type}`);
  await page.screenshot({ path: `cf-${state.type}-${attempt}.png`, fullPage: true });

  // ── Cenário 1 & 2: JS challenge ou widget não identificado ──────────────────
  // Aguarda auto-resolução (funciona para IUAM e JS challenge com stealth)
  if (state.type === 'js') {
    console.log(`   Aguardando auto-resolução JS (${CF_AUTO_WAIT_MS / 1000}s)…`);
    try {
      await waitOutOfCF(page, ' (auto JS)');
      return true;
    } catch {
      // Auto-resolução falhou — re-detecta se agora tem widget visível
      const recheck = await detectCFState(page);
      if (recheck.type === 'turnstile' || recheck.type === 'hcaptcha') {
        console.log(`   Widget apareceu após espera: ${recheck.type}. Resolvendo via 2captcha…`);
        return resolveCF(page, loginUrl, attempt + 1);
      }
      // Hard block confirmado
      await page.screenshot({ path: `cf-hard-block-${attempt}.png`, fullPage: true });
      throw new Error(
        `Cloudflare hard block (IP do runner bloqueado).\n` +
        `Configure o secret PROXY_URL com um proxy residencial para contornar.\n` +
        `Título atual: "${await page.title()}"  URL: ${page.url()}`
      );
    }
  }

  // ── Cenário 3: Managed Challenge com Turnstile ──────────────────────────────
  if (state.type === 'turnstile') {
    console.log(`   Resolvendo Turnstile CF via 2captcha…`);
    const token = await solveCaptcha('turnstile', state.siteKey, loginUrl);
    await submitCFForm(page, token, 'turnstile');

    try {
      await waitOutOfCF(page, ' (Turnstile)');
      return true;
    } catch {
      // Token rejeitado ou expirou — tenta mais uma vez
      if (attempt < 3) {
        console.log('   Turnstile token rejeitado, tentando novamente…');
        return resolveCF(page, loginUrl, attempt + 1);
      }
      await page.screenshot({ path: `cf-turnstile-fail-${attempt}.png`, fullPage: true });
      throw new Error('CF Turnstile não resolvido após 3 tentativas com 2captcha');
    }
  }

  // ── Cenário 4: Interactive Challenge com hCaptcha ───────────────────────────
  if (state.type === 'hcaptcha') {
    console.log(`   Resolvendo hCaptcha CF via 2captcha…`);
    const token = await solveCaptcha('hcaptcha', state.siteKey, loginUrl);
    await submitCFForm(page, token, 'hcaptcha');

    try {
      await waitOutOfCF(page, ' (hCaptcha)');
      return true;
    } catch {
      if (attempt < 3) return resolveCF(page, loginUrl, attempt + 1);
      await page.screenshot({ path: `cf-hcaptcha-fail-${attempt}.png`, fullPage: true });
      throw new Error('CF hCaptcha não resolvido após 3 tentativas com 2captcha');
    }
  }

  return false;
}

// ── Extrair siteKey de captcha no formulário do site ─────────────────────────

async function extractSiteCaptcha(page) {
  return await page.evaluate(() => {
    // Turnstile do site
    const turnstile = document.querySelector('.cf-turnstile, [data-sitekey]:not(iframe)');
    if (turnstile) {
      return { type: 'turnstile', siteKey: turnstile.getAttribute('data-sitekey') };
    }
    // hCaptcha do site
    const hcaptcha = document.querySelector('.h-captcha, [data-hcaptcha-sitekey]');
    if (hcaptcha) {
      return {
        type: 'hcaptcha',
        siteKey: hcaptcha.getAttribute('data-sitekey') || hcaptcha.getAttribute('data-hcaptcha-sitekey'),
      };
    }
    // Busca em scripts inline
    for (const s of Array.from(document.querySelectorAll('script'))) {
      const m = (s.textContent || '').match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
      if (m) return { type: 'turnstile', siteKey: m[1] };
    }
    return null;
  });
}

// ── Injetar token no formulário do site ──────────────────────────────────────

async function injectSiteCaptchaToken(page, token, captchaType) {
  await page.evaluate(({ token, captchaType }) => {
    if (captchaType === 'hcaptcha') {
      const resp = document.querySelector('textarea[name="h-captcha-response"], input[name="h-captcha-response"]');
      if (resp) resp.value = token;
    } else {
      const resp = document.querySelector('input[name="cf-turnstile-response"]');
      if (resp) resp.value = token;
    }
  }, { token, captchaType });
}

// ── Fluxo de login ────────────────────────────────────────────────────────────

async function runLogin(page) {
  for (let attempt = 1; attempt <= MAX_LOGIN_RETRIES; attempt++) {
    console.log(`\n🔄  Login — tentativa ${attempt}/${MAX_LOGIN_RETRIES}`);

    try {
      // 1. Navegar para a página de login
      console.log('📄  Abrindo página de login…');
      await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded', timeout: 40_000 });
      console.log(`📋  Título: "${await page.title()}"  URL: ${page.url()}`);

      // 2. Resolver CF (pode ocorrer 0, 1 ou várias vezes em cadeia)
      let cfHandled = await resolveCF(page, LOGIN_PAGE);

      // 3. Garantir que chegamos na página de login (mesmo após CF)
      //    Em alguns casos o CF redireciona de volta para a URL original
      const currentUrl = page.url();
      if (cfHandled && !currentUrl.includes('login')) {
        console.log('   CF resolvido mas não está em /login — navegando para login…');
        await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        // Pode aparecer outro CF após o primeiro ser resolvido
        await resolveCF(page, LOGIN_PAGE);
      }

      // 4. Aguardar formulário de login
      console.log('⌛  Aguardando formulário de login…');
      await page.waitForSelector('input[name="email"]', { timeout: 30_000 });
      console.log('✅  Formulário de login visível');

      // 5. Extrair captcha do formulário do site (se houver)
      const siteCaptcha = await extractSiteCaptcha(page);
      console.log(`🔍  Captcha no formulário do site: ${siteCaptcha ? `${siteCaptcha.type} (${siteCaptcha.siteKey?.slice(0, 14)}…)` : 'nenhum'}`);

      // 6. Preencher formulário
      await page.fill('input[name="email"]', email);
      await page.fill('input[name="senha"]', password);
      const honeypot = page.locator('input[name="website"]');
      if (await honeypot.count() > 0) await honeypot.fill('');

      // 7. Resolver captcha do site via 2captcha (se necessário)
      if (siteCaptcha?.siteKey) {
        const token = await solveCaptcha(siteCaptcha.type, siteCaptcha.siteKey, LOGIN_PAGE);
        await injectSiteCaptchaToken(page, token, siteCaptcha.type);
        console.log(`💉  Token ${siteCaptcha.type} injetado no formulário.`);
      }

      await page.screenshot({ path: `login-before-submit-${attempt}.png`, fullPage: true });

      // 8. Submeter
      console.log('📤  Enviando formulário…');
      await page.click('button[type="submit"]');

      // 9. Aguardar redirect pós-login
      try {
        await page.waitForURL(url => !url.toString().includes('login'), { timeout: 25_000 });
        console.log(`✅  Login OK — URL: ${page.url()}`);
      } catch {
        await page.screenshot({ path: `login-fail-${attempt}.png`, fullPage: true });

        // Verifica se CF apareceu após o submit
        const postSubmitCF = await detectCFState(page);
        if (postSubmitCF.isCF) {
          console.log('   CF apareceu após submit. Resolvendo…');
          await resolveCF(page, LOGIN_PAGE);
          // Tenta re-submeter na próxima iteração
          if (attempt < MAX_LOGIN_RETRIES) continue;
        }

        const errText = await page.evaluate(() => {
          const el = document.querySelector('.alert, .alert-danger, .erro, [class*="alert"], [class*="error"]');
          return el ? el.textContent.trim().slice(0, 300) : null;
        });
        throw new Error(`Login falhou. Erro na página: ${errText ?? '(nenhuma mensagem de erro visível)'}`);
      }

      // 10. Extrair PHPSESSID
      const cookies = await page.context().cookies(BASE);
      const sessid  = cookies.find(c => c.name === 'PHPSESSID');
      if (!sessid?.value) throw new Error('PHPSESSID não encontrado após login bem-sucedido');

      return `PHPSESSID=${sessid.value}`;

    } catch (err) {
      console.error(`\n❌  Tentativa ${attempt} falhou: ${err.message}`);
      if (attempt === MAX_LOGIN_RETRIES) throw err;
      console.log(`   Aguardando 6s antes da próxima tentativa…`);
      await new Promise(r => setTimeout(r, 6_000));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('═'.repeat(60));
console.log(`🔐  SuperMonitor Cookie Renew — ${new Date().toISOString()}`);
console.log('═'.repeat(60));
console.log(`📧  Usuário: ${email.slice(0, 3)}…`);

const browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-blink-features=AutomationControlled',
    '--disable-infobars',
    '--window-size=1280,800',
  ],
  ...(proxy ? { proxy: { server: proxy.server } } : {}),
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale:    'pt-BR',
  viewport:  { width: 1280, height: 800 },
  extraHTTPHeaders: {
    'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
  },
});

// Oculta sinais de automação via script init
await context.addInitScript(() => {
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = { runtime: {} };
});

const page = await context.newPage();

try {
  const cookieStr = await runLogin(page);

  console.log(`\n🍪  Cookie: ${cookieStr.slice(0, 24)}…`);

  // Salvar no Supabase
  const sb = createClient(sbUrl, sbKey);
  const { error } = await sb
    .from('app_config')
    .upsert(
      { key: 'supermonitor_cookie', value: cookieStr, updated_at: new Date().toISOString() },
      { onConflict: 'key' }
    );

  if (error) throw new Error(`Supabase upsert: ${error.message}`);

  console.log('💾  Cookie salvo no Supabase.');
  console.log('🎉  Renovação concluída com sucesso!\n');

} finally {
  await browser.close();
}
