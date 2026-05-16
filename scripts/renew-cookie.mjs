/**
 * renew-cookie.mjs
 * Abre Chrome, lida com Cloudflare (JS challenge + Turnstile),
 * faz login no SuperMonitor e salva o PHPSESSID no Supabase.
 *
 * Variáveis de ambiente:
 *   SUPERMONITOR_EMAIL        — e-mail de login
 *   SUPERMONITOR_PASSWORD     — senha de login
 *   NEXT_PUBLIC_SUPABASE_URL  — URL do Supabase
 *   SUPABASE_SERVICE_ROLE_KEY — chave de serviço Supabase
 *   TWOCAPTCHA_API_KEY        — chave da API 2captcha
 *   PROXY_URL (opcional)      — proxy residencial, ex: http://user:pass@host:port
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';

chromium.use(StealthPlugin());

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;

const email         = (process.env.SUPERMONITOR_EMAIL      ?? '').trim();
const password      = (process.env.SUPERMONITOR_PASSWORD   ?? '').trim();
const sbUrl         = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey         = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
const captchaApiKey = (process.env.TWOCAPTCHA_API_KEY        ?? '').trim();
const proxyUrl      = (process.env.PROXY_URL                 ?? '').trim();

if (!email || !password) { console.error('❌  Credenciais não configuradas.'); process.exit(1); }
if (!sbUrl  || !sbKey)   { console.error('❌  Supabase não configurado.');      process.exit(1); }
if (!captchaApiKey)      { console.error('❌  TWOCAPTCHA_API_KEY não configurada.'); process.exit(1); }

if (proxyUrl) {
  console.log(`🌐  Proxy configurado: ${proxyUrl.replace(/:([^:@]+)@/, ':***@')}`);
} else {
  console.log('ℹ️  Sem proxy — usando IP do runner (pode ser bloqueado pelo Cloudflare)');
}

// ── 2captcha: resolve Turnstile (tanto do site quanto do CF challenge) ─────────

async function solveTurnstile(siteKey, pageUrl) {
  console.log(`🤖  Enviando Turnstile para 2captcha (siteKey: ${siteKey.slice(0, 12)}…)`);

  const createRes = await fetch('https://api.2captcha.com/createTask', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      clientKey: captchaApiKey,
      task: {
        type:       'TurnstileTaskProxyless',
        websiteURL: pageUrl,
        websiteKey: siteKey,
      },
    }),
  });
  const createData = await createRes.json();

  if (createData.errorId !== 0) {
    throw new Error(`2captcha createTask erro: ${createData.errorCode}`);
  }

  const taskId = createData.taskId;
  console.log(`⏳  Task criada (id: ${taskId}). Aguardando solução…`);

  for (let i = 0; i < 24; i++) {
    await new Promise(r => setTimeout(r, 5_000));

    const resultRes = await fetch('https://api.2captcha.com/getTaskResult', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientKey: captchaApiKey, taskId }),
    });
    const result = await resultRes.json();

    if (result.errorId !== 0) {
      throw new Error(`2captcha getTaskResult erro: ${result.errorCode}`);
    }

    if (result.status === 'ready') {
      const token = result.solution?.token;
      console.log(`✅  Turnstile resolvido: ${token.slice(0, 20)}…`);
      return token;
    }

    console.log(`   … ainda processando (${(i + 1) * 5}s)`);
  }

  throw new Error('2captcha timeout — solução não chegou em 2 minutos');
}

// ── Lida com Cloudflare challenge page ────────────────────────────────────────

/**
 * Verifica se o título é uma página de challenge do Cloudflare e tenta resolver.
 * 1) Aguarda auto-resolução (funciona para CF JS challenge com browser stealth)
 * 2) Se persistir, tenta extrair sitekey do CF e resolver via 2captcha
 * 3) Se não tiver sitekey, levanta erro com orientação de proxy
 */
async function handleCloudflarePage(page) {
  const title = await page.title();
  const isCF  = /cloudflare|attention required|just a moment/i.test(title);

  if (!isCF) return; // página normal, não precisa fazer nada

  console.log(`⚠️  Cloudflare challenge detectado (título: "${title}")`);
  console.log('   Aguardando resolução automática do JS challenge (30s)…');
  await page.screenshot({ path: 'cf-challenge-before.png', fullPage: true });

  // Tentativa 1: aguardar auto-resolução (CF JS challenge demora 5-15s)
  try {
    await page.waitForFunction(
      () => !/cloudflare|attention required|just a moment/i.test(document.title),
      { timeout: 30_000, polling: 2_000 }
    );
    console.log(`✅  CF resolvido automaticamente. Título: "${await page.title()}"`);
    return;
  } catch {
    console.log('⚠️  Auto-resolução falhou. Tentando via 2captcha na página CF…');
  }

  // Tentativa 2: extrair sitekey do widget Turnstile na página CF e resolver
  const cfSiteKey = await page.evaluate(() => {
    const widget = document.querySelector('[data-sitekey]');
    if (widget) return widget.getAttribute('data-sitekey');
    // tenta em script inline
    for (const s of Array.from(document.querySelectorAll('script'))) {
      const m = (s.textContent || '').match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
      if (m) return m[1];
    }
    return null;
  });

  if (!cfSiteKey) {
    await page.screenshot({ path: 'cf-hard-block.png', fullPage: true });
    throw new Error(
      'Cloudflare bloqueou o IP do runner e não há Turnstile visível para resolver. ' +
      'Configure PROXY_URL com um proxy residencial (ex: BrightData, Smartproxy) ' +
      'ou use um self-hosted runner com IP residencial.'
    );
  }

  console.log(`🔑  SiteKey CF: ${cfSiteKey.slice(0, 16)}…`);
  const token = await solveTurnstile(cfSiteKey, LOGIN_PAGE);

  // Injeta token no widget CF e aguarda submit automático
  await page.evaluate((t) => {
    const input = document.querySelector('input[name="cf-turnstile-response"]');
    if (input) {
      input.value = t;
      const form = input.closest('form');
      if (form) form.submit();
    } else {
      // Alguns casos usam callback no widget
      if (window.turnstile) window.turnstile.reset();
    }
  }, token);

  // Aguarda sair da página CF
  try {
    await page.waitForFunction(
      () => !/cloudflare|attention required|just a moment/i.test(document.title),
      { timeout: 30_000, polling: 2_000 }
    );
    console.log(`✅  CF resolvido via 2captcha. Título: "${await page.title()}"`);
  } catch {
    await page.screenshot({ path: 'cf-still-blocked.png', fullPage: true });
    throw new Error('CF não resolveu mesmo após 2captcha — IP com bloqueio severo. Use proxy residencial.');
  }
}

// ── Login principal ───────────────────────────────────────────────────────────

console.log(`🔐  Iniciando login para ${email.slice(0, 3)}…`);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
  ...(proxyUrl ? { proxy: { server: proxyUrl } } : {}),
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  locale:    'pt-BR',
  viewport:  { width: 1280, height: 800 },
});

const page = await context.newPage();

try {
  // ── Passo 1: abrir página de login ─────────────────────────────────────────
  console.log('📄  Abrindo página de login…');
  await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  console.log(`📋  Título: ${await page.title()}`);

  // ── Passo 2: lidar com Cloudflare (se presente) ────────────────────────────
  await handleCloudflarePage(page);

  // ── Passo 3: aguardar formulário de login (timeout aumentado) ──────────────
  await page.waitForSelector('input[name="email"]', { timeout: 30_000 });

  // ── Passo 4: extrair siteKey do Turnstile do site (se houver) ─────────────
  const siteKey = await page.evaluate(() => {
    const widget = document.querySelector('[data-sitekey]');
    if (widget) return widget.getAttribute('data-sitekey');
    for (const s of Array.from(document.querySelectorAll('script'))) {
      const m = (s.textContent || '').match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
      if (m) return m[1];
    }
    return null;
  });

  console.log(`🔑  SiteKey Turnstile do site: ${siteKey ? siteKey.slice(0, 16) + '…' : 'não encontrada'}`);

  // ── Passo 5: preencher formulário ──────────────────────────────────────────
  await page.fill('input[name="email"]',  email);
  await page.fill('input[name="senha"]',  password);
  const honeypot = page.locator('input[name="website"]');
  if (await honeypot.count() > 0) await honeypot.fill('');

  // ── Passo 6: resolver Turnstile do site via 2captcha ──────────────────────
  if (siteKey) {
    const token = await solveTurnstile(siteKey, LOGIN_PAGE);
    await page.evaluate((t) => {
      const el = document.querySelector('input[name="cf-turnstile-response"]');
      if (el) el.value = t;
    }, token);
    console.log('💉  Token injetado no formulário.');
  } else {
    console.log('⚠️  SiteKey do site não encontrada — tentando sem Turnstile…');
  }

  await page.screenshot({ path: 'before-submit.png', fullPage: true });

  // ── Passo 7: submit ────────────────────────────────────────────────────────
  console.log('📤  Enviando formulário…');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(url => !url.toString().includes('login'), { timeout: 20_000 });
    console.log(`✅  Login OK — redirecionado para: ${page.url()}`);
  } catch {
    await page.screenshot({ path: 'after-submit.png', fullPage: true });
    const errText = await page.evaluate(() => {
      const el = document.querySelector('.alert, .alert-danger, .erro, [class*="alert"]');
      return el ? el.textContent.trim().slice(0, 200) : null;
    });
    throw new Error(`Login falhou. Erro: ${errText ?? 'desconhecido'}`);
  }

  // ── Passo 8: extrair PHPSESSID ─────────────────────────────────────────────
  const cookies = await context.cookies(BASE);
  const sessid  = cookies.find(c => c.name === 'PHPSESSID');
  if (!sessid?.value) throw new Error('PHPSESSID não encontrado após login');

  const cookieStr = `PHPSESSID=${sessid.value}`;
  console.log(`🍪  Cookie: ${cookieStr.slice(0, 24)}…`);

  // ── Passo 9: salvar no Supabase ────────────────────────────────────────────
  const sb = createClient(sbUrl, sbKey);
  const { error } = await sb
    .from('app_config')
    .upsert(
      { key: 'supermonitor_cookie', value: cookieStr, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) throw new Error(`Supabase: ${error.message}`);

  console.log('💾  Cookie salvo no Supabase.');
  console.log('🎉  Renovação concluída!');

} finally {
  await browser.close();
}
