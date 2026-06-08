/**
 * dg-poller.mjs — Daemon DuploGreen (roda no PC do usuário, IP residencial)
 *
 * Por que no PC e não no servidor?
 *   Cloudflare Bot Management bloqueia IPs de datacenter (Vercel, AWS, etc).
 *   IP residencial passa normalmente — mesma lógica do SuperMonitor.
 *
 * Fluxo:
 *  1. Lê sessão DG do Supabase (access_token + refresh_token)
 *  2. Renova o token automaticamente quando necessário (funciona de IP residencial)
 *  3. Chama get-all-odds + get-dg-opportunities a cada POLL_MS
 *  4. Salva resultados no Supabase para o Vercel servir do cache
 *  5. Repete indefinidamente
 *
 * Como configurar:
 *   1. Abra https://www.duplogreenengine.com no browser e faça login
 *   2. Abra DevTools (F12) → Console
 *   3. Execute: JSON.parse(localStorage.getItem('sb-db-auth-token'))
 *   4. Copie access_token e refresh_token
 *   5. Cole no SureEdge (Buscar Odds → botão "Configurar DuploGreen")
 *   6. Rode este script: node scripts/dg-poller.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }        from 'node:path';
import { fileURLToPath }           from 'node:url';

// ── .env ──────────────────────────────────────────────────────────────────────
const __dir  = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}

const sbUrl  = (process.env.NEXT_PUBLIC_SUPABASE_URL  ?? '').trim();
const sbKey  = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim();

if (!sbUrl || !sbKey) {
  console.error('[DG] ERRO: Supabase não configurado em scripts/.env');
  process.exit(1);
}

// DuploGreen — credenciais públicas extraídas do bundle JS
const DG_API  = 'https://api.duplogreenengine.com';
const DG_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzc3Njg0MDM4LCJleHAiOjIwOTMwNDQwMzh9.9JN4OCzFRPvDhBdrd81PjZJzFnZs3EgZtdHFAuKENks';

const POLL_MS           = 3 * 60 * 1000;  // poll a cada 3 minutos
const RENEW_MARGIN_MS   = 5 * 60 * 1000;  // renova token 5 min antes de expirar
const RETRY_DELAY_MS    = 30 * 1000;       // aguarda 30s antes de retry em erro

// ── Supabase helpers ──────────────────────────────────────────────────────────

const SB_HEADERS = {
  'Content-Type':  'application/json',
  'apikey':        sbKey,
  'Authorization': `Bearer ${sbKey}`,
};

async function sbGet(key) {
  const res  = await fetch(
    `${sbUrl}/rest/v1/app_config?key=eq.${encodeURIComponent(key)}&select=value,updated_at`,
    { headers: SB_HEADERS },
  );
  const rows = await res.json();
  return rows?.[0] ?? null;
}

async function sbSet(key, value) {
  const res = await fetch(`${sbUrl}/rest/v1/app_config`, {
    method:  'POST',
    headers: { ...SB_HEADERS, 'Prefer': 'resolution=merge-duplicates' },
    body:    JSON.stringify({ key, value, updated_at: new Date().toISOString() }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`sbSet(${key}) falhou (${res.status}): ${text}`);
  }
}

// ── Token management ──────────────────────────────────────────────────────────

let _session = null; // { access_token, refresh_token, expires_at (ms) }

async function loadSession() {
  const row = await sbGet('dg_session');
  if (!row?.value) return null;
  try {
    const s = JSON.parse(row.value);
    // expires_at pode vir em segundos (Supabase padrão) ou ms
    if (s.expires_at && s.expires_at < 1e12) s.expires_at *= 1000;
    _session = s;
    return _session;
  } catch {
    return null;
  }
}

async function saveSession(session) {
  _session = { ...session };
  await sbSet('dg_session', JSON.stringify(_session));
}

async function refreshToken() {
  if (!_session?.refresh_token) {
    throw new Error('Sem refresh_token — configure a sessão DG no SureEdge.');
  }

  console.log('[DG] Renovando access token...');

  const res = await fetch(`${DG_API}/auth/v1/token?grant_type=refresh_token`, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        DG_ANON,
      'Authorization': `Bearer ${DG_ANON}`,
    },
    body: JSON.stringify({ refresh_token: _session.refresh_token }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Refresh falhou (${res.status}): ${body}`);
  }

  const data = await res.json();
  if (!data.access_token) {
    throw new Error(`Refresh sem access_token na resposta: ${JSON.stringify(data)}`);
  }

  const session = {
    access_token:  data.access_token,
    refresh_token: data.refresh_token ?? _session.refresh_token,
    expires_at:    Date.now() + (data.expires_in ?? 3600) * 1000,
  };

  await saveSession(session);
  const min = Math.round((session.expires_at - Date.now()) / 60000);
  console.log(`[DG] Token renovado — válido por ${min} min`);
  return session;
}

async function getValidToken() {
  if (!_session) {
    await loadSession();
  }

  if (!_session?.access_token) {
    throw new Error(
      'Sessão DuploGreen não configurada.\n' +
      'Configure via SureEdge: Buscar Odds → "Configurar DuploGreen"',
    );
  }

  // Renova se expira em menos de RENEW_MARGIN_MS
  if (Date.now() > _session.expires_at - RENEW_MARGIN_MS) {
    await refreshToken();
  }

  return _session.access_token;
}

// ── DuploGreen fetch ──────────────────────────────────────────────────────────

async function dgFetch(endpoint, params = {}) {
  const token = await getValidToken();

  const url = new URL(`${DG_API}/functions/v1/${endpoint}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, String(v)));
  url.searchParams.set('_t', String(Date.now())); // cache busting

  const res = await fetch(url.toString(), {
    headers: {
      'Authorization': `Bearer ${token}`,
      'apikey':        DG_ANON,
      'Content-Type':  'application/json',
      'Accept':        'application/json',
    },
  });

  if (res.status === 401) {
    // Token inválido — tenta refresh e reenvia
    console.warn(`[DG] 401 em ${endpoint} — tentando refresh...`);
    await refreshToken();
    return dgFetch(endpoint, params); // 1 retry
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`${endpoint} falhou (${res.status}): ${body.slice(0, 200)}`);
  }

  return res.json();
}

// ── Poll ──────────────────────────────────────────────────────────────────────

async function poll() {
  const t = new Date().toLocaleTimeString('pt-BR');

  try {
    console.log(`[${t}] Buscando odds DuploGreen...`);

    const [allOdds, opportunities] = await Promise.all([
      dgFetch('get-all-odds'),
      dgFetch('get-dg-opportunities'),
    ]);

    const countAll  = Array.isArray(allOdds)        ? allOdds.length        : (allOdds?.data?.length ?? '?');
    const countOpp  = Array.isArray(opportunities)  ? opportunities.length  : (opportunities?.data?.length ?? '?');

    await Promise.all([
      sbSet('dg_all_odds',      JSON.stringify(allOdds)),
      sbSet('dg_opportunities', JSON.stringify(opportunities)),
      sbSet('dg_poller_status', JSON.stringify({
        ok:        true,
        count_all: countAll,
        count_opp: countOpp,
        at:        new Date().toISOString(),
      })),
    ]);

    console.log(`[${t}] ✓ ${countAll} jogos · ${countOpp} oportunidades → Supabase`);
  } catch (e) {
    console.error(`[${t}] ✗ Erro: ${e.message}`);
    try {
      await sbSet('dg_poller_status', JSON.stringify({
        ok:    false,
        error: e.message,
        at:    new Date().toISOString(),
      }));
    } catch { /* silencioso */ }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('╔═══════════════════════════════════════╗');
  console.log('║   SureEdge — DuploGreen Poller v1.0  ║');
  console.log('╚═══════════════════════════════════════╝');
  console.log(`Poll: a cada ${POLL_MS / 60000} min | Ctrl+C para parar\n`);

  await loadSession();

  if (!_session?.access_token) {
    console.warn('⚠ Sessão DuploGreen não configurada.');
    console.warn('  Configure em: SureEdge → Buscar Odds → "Configurar DuploGreen"');
    console.warn('  Aguardando sessão ser configurada (verifica a cada 30s)...\n');

    // Espera a sessão ser configurada
    while (!_session?.access_token) {
      await new Promise(r => setTimeout(r, 30_000));
      await loadSession();
    }
    console.log('✓ Sessão carregada!');
  } else {
    const exp = new Date(_session.expires_at).toLocaleTimeString('pt-BR');
    console.log(`✓ Sessão carregada — token expira às ${exp}`);
  }

  // Poll inicial imediato
  await poll();

  // Loop periódico
  setInterval(async () => {
    try {
      await poll();
    } catch (e) {
      console.error('[DG] Erro inesperado no poll:', e.message);
      // Aguarda antes do próximo
      await new Promise(r => setTimeout(r, RETRY_DELAY_MS));
    }
  }, POLL_MS);
}

main().catch(e => {
  console.error('[DG] Erro fatal:', e);
  process.exit(1);
});
