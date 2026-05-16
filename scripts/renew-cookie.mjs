/**
 * renew-cookie.mjs
 * Abre Chrome, resolve Cloudflare Turnstile via 2captcha,
 * faz login no SuperMonitor e salva o PHPSESSID no Supabase.
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

if (!email || !password) { console.error('❌  Credenciais não configuradas.'); process.exit(1); }
if (!sbUrl  || !sbKey)   { console.error('❌  Supabase não configurado.');      process.exit(1); }
if (!captchaApiKey)      { console.error('❌  TWOCAPTCHA_API_KEY não configurada.'); process.exit(1); }

// ── 2captcha: resolve Cloudflare Turnstile ────────────────────────────────────

async function solveTurnstile(siteKey, pageUrl) {
  console.log(`🤖  Enviando Turnstile para 2captcha (siteKey: ${siteKey.slice(0, 12)}…)`);

  // Cria task
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

  // Polling a cada 5s por até 2 minutos
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

// ── Login principal ───────────────────────────────────────────────────────────

console.log(`🔐  Iniciando login para ${email.slice(0, 3)}…`);

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
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

  // ── Passo 2: extrair siteKey do Turnstile ──────────────────────────────────
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  const siteKey = await page.evaluate(() => {
    // Tenta no widget .cf-turnstile
    const widget = document.querySelector('[data-sitekey]');
    if (widget) return widget.getAttribute('data-sitekey');
    // Tenta no script inline
    const scripts = Array.from(document.querySelectorAll('script'));
    for (const s of scripts) {
      const m = s.textContent.match(/sitekey['":\s]+['"]([0-9a-zA-Z_-]{20,})['"]/);
      if (m) return m[1];
    }
    return null;
  });

  console.log(`🔑  SiteKey Turnstile: ${siteKey ? siteKey.slice(0, 16) + '…' : 'não encontrada'}`);

  // ── Passo 3: preencher formulário ──────────────────────────────────────────
  await page.fill('input[name="email"]',  email);
  await page.fill('input[name="senha"]',  password);
  const honeypot = page.locator('input[name="website"]');
  if (await honeypot.count() > 0) await honeypot.fill('');

  // ── Passo 4: resolver Turnstile via 2captcha ───────────────────────────────
  if (siteKey) {
    const token = await solveTurnstile(siteKey, LOGIN_PAGE);
    // Injeta token no campo oculto
    await page.evaluate((t) => {
      const el = document.querySelector('input[name="cf-turnstile-response"]');
      if (el) el.value = t;
    }, token);
    console.log('💉  Token injetado no formulário.');
  } else {
    console.log('⚠️  SiteKey não encontrada — tentando sem Turnstile…');
  }

  await page.screenshot({ path: 'before-submit.png', fullPage: true });

  // ── Passo 5: submit ────────────────────────────────────────────────────────
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

  // ── Passo 6: extrair PHPSESSID ─────────────────────────────────────────────
  const cookies = await context.cookies(BASE);
  const sessid  = cookies.find(c => c.name === 'PHPSESSID');
  if (!sessid?.value) throw new Error('PHPSESSID não encontrado após login');

  const cookieStr = `PHPSESSID=${sessid.value}`;
  console.log(`🍪  Cookie: ${cookieStr.slice(0, 24)}…`);

  // ── Passo 7: salvar no Supabase ────────────────────────────────────────────
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
