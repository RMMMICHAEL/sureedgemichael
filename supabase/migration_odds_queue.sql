-- migration_odds_queue.sql
-- Tabela de fila de odds sob demanda (on-demand queue)
-- Execute no Supabase SQL Editor

create table if not exists public.odds_queue (
  id           uuid        default gen_random_uuid() primary key,
  event_id     text        not null,
  event_name   text        not null,
  status       text        not null default 'pending',  -- pending | processing | done | error
  created_at   timestamptz default now(),
  fulfilled_at timestamptz
);

create index if not exists odds_queue_status_idx  on public.odds_queue(status, created_at);
create index if not exists odds_queue_event_idx   on public.odds_queue(event_id, status);
