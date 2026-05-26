/**
 * create-scanner-table.mjs
 *
 * Cria a tabela scanner_signals no Supabase via Management API.
 *
 * Pré-requisito:
 *   Adicione SUPABASE_ACCESS_TOKEN ao scripts/.env
 *   Gere em: https://supabase.com/dashboard/account/tokens
 *
 * Uso:
 *   node scripts/create-scanner-table.mjs
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname }        from 'node:path';
import { fileURLToPath }           from 'node:url';

// ── Carrega .env ──────────────────────────────────────────────────────────────
const __dir  = dirname(fileURLToPath(import.meta.url));
const envFile = resolve(__dir, '.env');
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf8').split('\n')) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] ??= m[2].replace(/^["']|["']$/g, '');
  }
}

// ── Credenciais ───────────────────────────────────────────────────────────────
const supabaseUrl   = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
const accessToken   = (process.env.SUPABASE_ACCESS_TOKEN    ?? '').trim();

if (!supabaseUrl) {
  console.error('❌  NEXT_PUBLIC_SUPABASE_URL não encontrado em scripts/.env');
  process.exit(1);
}
if (!accessToken) {
  console.error('❌  SUPABASE_ACCESS_TOKEN não encontrado em scripts/.env');
  console.error('   Gere em: https://supabase.com/dashboard/account/tokens');
  console.error('   Adicione ao scripts/.env:  SUPABASE_ACCESS_TOKEN=sbp_xxxxxxx');
  process.exit(1);
}

// Extrai o project ref da URL (ex: https://iclzwnrpwkojhxhnclhc.supabase.co)
const projectRef = supabaseUrl.replace('https://', '').split('.')[0];
console.log(`📦  Projeto: ${projectRef}`);

// ── SQL ───────────────────────────────────────────────────────────────────────
const SQL = `
-- Tabela principal de sinais do scanner
CREATE TABLE IF NOT EXISTS scanner_signals (
  id             text        PRIMARY KEY,
  tipo           text        NOT NULL,          -- 'ML' ou 'DUO'
  jogo           text        NOT NULL,          -- 'Flamengo x Vasco'
  casa1          text,                          -- casa do lado CASA
  casa2          text,                          -- casa do EMPATE (ML)
  casa3          text,                          -- casa do lado FORA
  campeonato     text,                          -- 'Brasil - Serie A'
  data_evento    timestamptz,                   -- data/hora do jogo
  profit_margin  double precision DEFAULT 0,   -- ex: -1.14 ou 0.35
  is_new         boolean     DEFAULT false,     -- true nos primeiros 60s
  new_at         timestamptz,                   -- quando ficou is_new=true
  raw_data       jsonb,                         -- objeto completo do SuperMonitor
  updated_at     timestamptz DEFAULT now()
);

-- Índices para filtros comuns
CREATE INDEX IF NOT EXISTS scanner_signals_tipo_idx          ON scanner_signals (tipo);
CREATE INDEX IF NOT EXISTS scanner_signals_profit_idx        ON scanner_signals (profit_margin DESC);
CREATE INDEX IF NOT EXISTS scanner_signals_campeonato_idx    ON scanner_signals (campeonato);
CREATE INDEX IF NOT EXISTS scanner_signals_data_evento_idx   ON scanner_signals (data_evento);
CREATE INDEX IF NOT EXISTS scanner_signals_is_new_idx        ON scanner_signals (is_new) WHERE is_new = true;
CREATE INDEX IF NOT EXISTS scanner_signals_updated_at_idx    ON scanner_signals (updated_at DESC);

-- RLS: habilita mas permite tudo com service role
ALTER TABLE scanner_signals ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scanner_signals' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY "service_role_all" ON scanner_signals
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;
`.trim();

// ── Executa via Management API ────────────────────────────────────────────────
async function runQuery(sql) {
  const url = `https://api.supabase.com/v1/projects/${projectRef}/database/query`;
  const res  = await fetch(url, {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({ query: sql }),
  });

  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${JSON.stringify(json)}`);
  }
  return json;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log('🚀  Criando tabela scanner_signals...\n');

try {
  await runQuery(SQL);
  console.log('✅  Tabela scanner_signals criada com sucesso!');
  console.log('   Índices e RLS configurados.');
  console.log('\n   Próximo passo: implementar o ciclo do scanner no process-queue.mjs');
} catch (err) {
  // Erro de "already exists" não é problema
  if (err.message.includes('already exists')) {
    console.log('ℹ️   Tabela já existe — nenhuma alteração feita.');
  } else {
    console.error('❌  Erro:', err.message);
    process.exit(1);
  }
}
