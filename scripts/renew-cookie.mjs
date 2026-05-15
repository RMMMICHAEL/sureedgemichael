/**
 * renew-cookie.mjs
 * Abre o Chrome real (Playwright), faz login no SuperMonitor
 * e salva o PHPSESSID no Supabase para a Vercel usar.
 *
 * Roda via GitHub Actions a cada 2 horas.
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
  await page.goto(LOGIN_PAGE, { waitUntil: 'domcontentloaded', timeout: 30_000 });

  // ── Passo 2: preencher formulário ──────────────────────────────────────────
  await page.waitForSelector('input[name="email"]', { timeout: 10_000 });
  await page.fill('input[name="email"]',  email);
  await page.fill('input[name="senha"]',  password);

  // Preenche honeypot vazio (campo website) se existir
  const honeypot = page.locator('input[name="website"]');
  if (await honeypot.count() > 0) await honeypot.fill('');

  console.log('📝  Formulário preenchido, enviando…');

  // ── Passo 3: submit e aguarda saída da página de login ─────────────────────
  await Promise.all([
    page.waitForURL(url => !url.toString().includes('login'), { timeout: 15_000 }),
    page.click('button[type="submit"]'),
  ]);

  console.log(`✅  Redirecionado para: ${page.url()}`);

  // ── Passo 4: extrair PHPSESSID ─────────────────────────────────────────────
  const cookies   = await context.cookies(BASE);
  const sessid    = cookies.find(c => c.name === 'PHPSESSID');

  if (!sessid?.value) {
    throw new Error('PHPSESSID não encontrado após login');
  }

  const cookieStr = `PHPSESSID=${sessid.value}`;
  console.log(`🍪  Cookie obtido: ${cookieStr.slice(0, 24)}…`);

  // ── Passo 5: salvar no Supabase ────────────────────────────────────────────
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

} catch (err) {
  // Screenshot de debug em caso de erro
  try {
    await page.screenshot({ path: 'error-screenshot.png', fullPage: true });
    console.error('📸  Screenshot salvo em error-screenshot.png');
  } catch (_) { /* ignora */ }

  console.error('❌  Erro:', err.message);
  process.exit(1);

} finally {
  await browser.close();
}
