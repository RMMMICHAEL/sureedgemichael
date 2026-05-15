/**
 * renew-cookie.mjs
 * Abre o Chrome real (Playwright), faz login no SuperMonitor
 * e salva o PHPSESSID no Supabase para a Vercel usar.
 */

import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';

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
  await page.goto(LOGIN_PAGE, { waitUntil: 'networkidle', timeout: 30_000 });

  console.log(`🌐  URL atual: ${page.url()}`);
  console.log(`📋  Título: ${await page.title()}`);

  // Screenshot da página de login
  await page.screenshot({ path: 'step1-login-page.png', fullPage: true });

  // ── Passo 2: verificar se há Cloudflare challenge ──────────────────────────
  const pageContent = await page.content();
  if (pageContent.includes('cf-challenge') || pageContent.includes('cf_clearance') || pageContent.includes('Checking your browser')) {
    console.log('⚠️  Cloudflare challenge detectado — aguardando resolução…');
    await page.waitForTimeout(8_000);
    await page.screenshot({ path: 'step1b-after-cf.png', fullPage: true });
  }

  // ── Passo 3: preencher formulário ──────────────────────────────────────────
  await page.waitForSelector('input[name="email"]', { timeout: 15_000 });

  // Log dos campos disponíveis no formulário
  const inputs = await page.$$eval('input', els => els.map(e => ({ name: e.name, type: e.type })));
  console.log('📝  Campos encontrados:', JSON.stringify(inputs));

  await page.fill('input[name="email"]',  email);
  await page.fill('input[name="senha"]',  password);

  const honeypot = page.locator('input[name="website"]');
  if (await honeypot.count() > 0) await honeypot.fill('');

  await page.screenshot({ path: 'step2-form-filled.png', fullPage: true });
  console.log('📝  Formulário preenchido, enviando…');

  // ── Passo 4: submit ────────────────────────────────────────────────────────
  await page.click('button[type="submit"]');

  // Aguarda navegação ou mudança na URL (até 20s)
  try {
    await page.waitForURL(url => !url.toString().includes('login'), { timeout: 20_000 });
    console.log(`✅  Redirecionado para: ${page.url()}`);
  } catch {
    // Não redirecionou — captura mensagem de erro da página
    await page.screenshot({ path: 'step3-after-submit.png', fullPage: true });

    const errText = await page.evaluate(() => {
      const selectors = [
        '.alert', '.alert-danger', '.erro', '.error',
        '[class*="alert"]', '[class*="erro"]', '[class*="error"]',
        'p', '.mensagem',
      ];
      for (const sel of selectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim().length > 5) {
          return el.textContent.trim().slice(0, 300);
        }
      }
      return null;
    });

    const url = page.url();
    console.log(`⚠️  URL após submit: ${url}`);
    console.log(`⚠️  Mensagem de erro na página: ${errText ?? '(nenhuma encontrada)'}`);

    // Verifica se tem Turnstile / CAPTCHA
    const hasTurnstile = await page.locator('iframe[src*="turnstile"], iframe[src*="captcha"], .cf-turnstile').count() > 0;
    console.log(`🔍  Turnstile/CAPTCHA detectado: ${hasTurnstile}`);

    throw new Error(`Login falhou — ficou em ${url}. Erro: ${errText ?? 'desconhecido'}`);
  }

  // ── Passo 5: extrair PHPSESSID ─────────────────────────────────────────────
  const cookies = await context.cookies(BASE);
  const sessid  = cookies.find(c => c.name === 'PHPSESSID');

  if (!sessid?.value) {
    throw new Error('PHPSESSID não encontrado após login');
  }

  const cookieStr = `PHPSESSID=${sessid.value}`;
  console.log(`🍪  Cookie obtido: ${cookieStr.slice(0, 24)}…`);

  // ── Passo 6: salvar no Supabase ────────────────────────────────────────────
  const sb = createClient(sbUrl, sbKey);
  const { error } = await sb
    .from('app_config')
    .upsert(
      { key: 'supermonitor_cookie', value: cookieStr, updated_at: new Date().toISOString() },
      { onConflict: 'key' },
    );

  if (error) throw new Error(`Supabase: ${error.message}`);

  console.log('💾  Cookie salvo no Supabase com sucesso.');
  console.log('🎉  Renovação concluída!');

} finally {
  await browser.close();
}
