/**
 * set-cf-clearance.mjs
 *
 * Salva o cf_clearance (cookie Cloudflare) no Supabase de duas formas:
 *  1. Injeta no cookie principal (supermonitor_cookie)
 *  2. Salva separadamente na chave "cf_clearance" para sobreviver
 *     a renovações automáticas de PHPSESSID pelo daemon.
 *
 * Uso:
 *   node set-cf-clearance.mjs "SEU_CF_CLEARANCE_AQUI"
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }        from 'node:path';
import { fileURLToPath }           from 'node:url';

const __dir  = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}

const sbUrl = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!sbUrl || !sbKey) { console.error('❌  Supabase não configurado em scripts/.env'); process.exit(1); }

const cfClearance = process.argv[2]?.trim();
if (!cfClearance) {
  console.error('Uso: node set-cf-clearance.mjs "SEU_CF_CLEARANCE_AQUI"');
  process.exit(1);
}

async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  return fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function upsert(key, value) {
  const r = await sbFetch('app_config', 'POST',
    { key, value, updated_at: new Date().toISOString() },
    { 'Prefer': 'resolution=merge-duplicates' },
  );
  if (!r.ok) throw new Error(`upsert ${key} falhou: ${await r.text()}`);
}

// 1. Lê cookie atual para mesclar
const res  = await sbFetch('app_config?key=eq.supermonitor_cookie&select=value');
const rows = await res.json();
if (!rows?.length || !rows[0].value) {
  console.error('❌  Cookie não encontrado no Supabase. Rode renew-cookie.mjs primeiro.');
  process.exit(1);
}

// Remove cf_clearance antigo, adiciona o novo
const parts = rows[0].value
  .split(';')
  .map(p => p.trim())
  .filter(p => p && !p.toLowerCase().startsWith('cf_clearance='));
parts.push(`cf_clearance=${cfClearance}`);
const newCookie = parts.join('; ');

// 2. Salva cookie completo
await upsert('supermonitor_cookie', newCookie);

// 3. Salva cf_clearance SEPARADO — o daemon sempre mescla este valor
//    mesmo após renovar o PHPSESSID automaticamente
await upsert('cf_clearance', cfClearance);

console.log('✅  cf_clearance salvo no Supabase!');
console.log(`   Cookie: ${newCookie.slice(0, 80)}…`);
console.log('   Chave separada "cf_clearance" salva — sobreviverá a renovações automáticas.');
console.log('\nReinicie o daemon para usar o cookie atualizado.');
