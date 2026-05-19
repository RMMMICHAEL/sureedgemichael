/**
 * set-cf-clearance.mjs
 *
 * Adiciona o cf_clearance ao cookie salvo no Supabase.
 * O cf_clearance só pode ser obtido via browser — rode este script
 * sempre que o Cloudflare pedir um novo desafio (~24h).
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

async function sbFetch(path, method = 'GET', body = null) {
  return fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'apikey': sbKey,
      'Authorization': `Bearer ${sbKey}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
}

// Lê cookie atual
const res  = await sbFetch('app_config?key=eq.supermonitor_cookie&select=value');
const rows = await res.json();
if (!rows?.length || !rows[0].value) {
  console.error('❌  Cookie não encontrado no Supabase. Rode renew-cookie.mjs primeiro.');
  process.exit(1);
}

const existingCookie = rows[0].value;

// Remove cf_clearance antigo se existir, adiciona o novo
const parts = existingCookie
  .split(';')
  .map(p => p.trim())
  .filter(p => p && !p.toLowerCase().startsWith('cf_clearance='));

parts.push(`cf_clearance=${cfClearance}`);
const newCookie = parts.join('; ');

// Salva
const upd = await sbFetch(
  'app_config?key=eq.supermonitor_cookie',
  'PATCH',
  { value: newCookie, updated_at: new Date().toISOString() },
);

if (upd.ok) {
  console.log('✅  cf_clearance adicionado ao cookie no Supabase!');
  console.log(`   Cookie: ${newCookie.slice(0, 80)}…`);
  console.log('\nReinicie o daemon para usar o cookie atualizado.');
} else {
  console.error(`❌  Falha ao atualizar Supabase: ${await upd.text()}`);
}
