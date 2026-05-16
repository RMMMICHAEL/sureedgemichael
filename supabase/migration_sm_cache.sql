-- ══════════════════════════════════════════════════════════════════════════════
-- Migração: tabelas de cache do SuperMonitor (eventos + odds)
-- Execute no Supabase SQL Editor:
--   https://supabase.com/dashboard/project/_/sql
-- ══════════════════════════════════════════════════════════════════════════════

-- Tabela app_config (cookie do SuperMonitor)
create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- Eventos do dia (lista de eventos com house_count)
create table if not exists public.sm_events (
  id          text primary key,
  name        text not null,
  sport       text default '',
  league      text default '',
  start_utc   text default '',
  house_count integer default 0,
  event_date  text default '',
  updated_at  timestamptz default now()
);

-- Odds de cada evento (JSON bruto do SuperMonitor)
create table if not exists public.sm_odds (
  event_id    text primary key,
  event_name  text not null,
  data        jsonb not null,
  updated_at  timestamptz default now()
);

-- Índices para buscas rápidas
create index if not exists sm_events_date_idx  on public.sm_events(event_date);
create index if not exists sm_events_name_idx  on public.sm_events using gin (to_tsvector('simple', name));
create index if not exists sm_odds_name_idx    on public.sm_odds(event_name);

-- Sem RLS — lidas exclusivamente pelo service_role key no backend Vercel.
-- Confirmar após executar:
--   select count(*) from public.sm_events;
--   select count(*) from public.sm_odds;
