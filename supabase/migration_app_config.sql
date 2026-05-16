-- ══════════════════════════════════════════════════════════════════════════════
-- Migração: cria tabela app_config (cookie do SuperMonitor)
-- Execute no Supabase SQL Editor:
--   https://supabase.com/dashboard/project/_/sql
-- ══════════════════════════════════════════════════════════════════════════════

create table if not exists public.app_config (
  key        text primary key,
  value      text not null,
  updated_at timestamptz default now()
);

-- Sem RLS — lida exclusivamente pelo service_role key no backend Vercel.
-- Nunca contém dados de usuários individuais.

-- Confirmar que a tabela existe e está acessível:
-- select * from public.app_config;
