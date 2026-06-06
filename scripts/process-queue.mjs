/**
 * process-queue.mjs — v4.0 (sem contato com SuperMonitor)
 *
 * Todas as buscas ao SuperMonitor agora são feitas exclusivamente
 * pela extensão no navegador (Brave) — sem risco de ban.
 *
 * Este script não faz nenhuma requisição ao SuperMonitor.
 * Mantido apenas para compatibilidade com o Task Scheduler.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }        from 'node:path';
import { fileURLToPath }           from 'node:url';

// ── Carrega .env local ────────────────────────────────────────────────────────
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

if (!sbUrl || !sbKey) { console.error('Supabase nao configurado.'); process.exit(1); }

async function sbFetch(path, method = 'GET', body = null, extra = {}) {
  return fetch(`${sbUrl}/rest/v1/${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', 'apikey': sbKey, 'Authorization': `Bearer ${sbKey}`, ...extra },
    body: body ? JSON.stringify(body) : undefined,
  });
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

console.log('=====================================');
console.log(' SureEdge Daemon — Reiniciando...');
console.log('=====================================\n');
console.log('[OK] Daemon iniciado em segundo plano!');
console.log('\n=====================================');
console.log(' Logs em tempo real (Ctrl+C para sair)');
console.log('=====================================\n');
console.log('SureEdge Queue Daemon v4 iniciado');
console.log('Extensão gerencia todas as buscas | Ctrl+C para parar\n');

// Marca status como ok no Supabase
try {
  await sbFetch('app_config', 'POST',
    { key: 'supermonitor_status', value: 'ok', updated_at: new Date().toISOString() },
    { 'Prefer': 'resolution=merge-duplicates' }
  );
} catch { /* silencioso */ }

// Loop leve — sem contato com SuperMonitor
while (true) {
  await sleep(60_000); // aguarda 1 minuto entre ciclos
}
