/**
 * renew-cookie.mjs
 * Abre Chrome com stealth mode, resolve Cloudflare Turnstile automaticamente,
 * faz login no SuperMonitor e salva o PHPSESSID no Supabase.
 */

import { chromium } from 'playwright-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';
import { createClient } from '@supabase/supabase-js';

// Stealth: mascara o browser como Chrome real (passa Cloudflare Turnstile)
chromium.use(StealthPlugin());

const BASE       = 'https://painel.supermonitor.pro';
const LOGIN_PAGE = `${BASE}/login.php`;

const email    = (process.env.SUPERMONITOR_EMAIL    ?? '').trim();
const password = (process.env.SUPERMONITOR_PASSWORD ?? '').trim();
const sbUrl    = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey    = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();

if (!email || !password) {
  console.error('❌  SUPERMONITOR_EMAIL ou SUPERMONITOR_PASSWORD não configurados.');
  process.exit(1);
}
if (!sbUrl || !sbKey) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados.');
  process.exit(1);
}

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

  console.log(`🌐  URL: ${page.url()}`);
  console.log(`📋  Título: ${await page.title()}`);

  await page.screenshot({ path: 'step1-login-page.png', fullPage: true });

  // ── Passo 2: preencher formulário ──────────────────────────────────────────
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });
  await page.fill('input[name="email"]',  email);
  await page.fill('input[name="senha"]',  password);

  const honeypot = page.locator('input[name="website"]');
  if (await honeypot.count() > 0) await honeypot.fill('');

  // ── Passo 3: aguardar Turnstile resolver automaticamente ───────────────────
  const hasTurnstile = await page.locator('input[name="cf-turnstile-response"]').count() > 0;
  console.log(`🔍  Turnstile presente: ${hasTurnstile}`);

  if (hasTurnstile) {
    console.log('⏳  Aguardando Turnstile resolver (até 30s)…');
    try {
      await page.waitForFunction(
        () => {
          const el = document.querySelector('input[name="cf-turnstile-response"]');
          return el instanceof HTMLInputElement && el.value.length > 0;
        },
        { timeout: 30_000 },
      );
      const tokenPreview = await page.$eval(
        'input[name="cf-turnstile-response"]',
        (el) => (el as HTMLInputElement).value.slice(0, 20),
      );
      console.log(`✅  Turnstile resolvido: ${tokenPreview}…`);
    } catch {
      console.log('⚠️  Turnstile não resolveu automaticamente — tentando submit assim mesmo…');
    }
  }

  await page.screenshot({ path: 'step2-before-submit.png', fullPage: true });

  // ── Passo 4: submit ────────────────────────────────────────────────────────
  console.log('📤  Enviando formulário…');
  await page.click('button[type="submit"]');

  try {
    await page.waitForURL(url => !url.toString().includes('login'), { timeout: 20_000 });
    console.log(`✅  Redirecionado para: ${page.url()}`);
  } catch {
    await page.screenshot({ path: 'step3-after-submit.png', fullPage: true });

    const errText = await page.evaluate(() => {
      const selectors = ['.alert', '.alert-danger', '.erro', '.error', '[class*="alert"]', 'p'];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el?.textContent?.trim().length ?? 0 > 5) return el!.textContent!.trim().slice(0, 300);
      }
      return null;
    });

    const turnstileValue = await page.$eval(
      'input[name="cf-turnstile-response"]',
      (el) => (el as HTMLInputElement).value,
    ).catch(() => '(campo não encontrado)');

    console.log(`⚠️  URL após submit: ${page.url()}`);
    console.log(`⚠️  Erro na página: ${errText ?? 'nenhum'}`);
    console.log(`🔍  Valor cf-turnstile-response: ${turnstileValue ? turnstileValue.slice(0, 30) + '…' : '(vazio)'}`);

    throw new Error(`Login falhou. Erro: ${errText ?? 'desconhecido'}`);
  }

  // ── Passo 5: extrair PHPSESSID ─────────────────────────────────────────────
  const cookies = await context.cookies(BASE);
  const sessid  = cookies.find(c => c.name === 'PHPSESSID');

  if (!sessid?.value) throw new Error('PHPSESSID não encontrado após login');

  const cookieStr = `PHPSESSID=${sessid.value}`;
  console.log(`🍪  Cookie: ${cookieStr.slice(0, 24)}…`);

  // ── Passo 6: salvar no Supabase ────────────────────────────────────────────
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
