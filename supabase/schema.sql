-- ══════════════════════════════════════════════════════════════════════════════
-- SureEdge — Supabase Schema
-- Run this in the Supabase SQL Editor: https://supabase.com/dashboard/project/_/sql
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- ── User profiles (extends auth.users) ───────────────────────────────────────

create table if not exists public.profiles (
  id            uuid references auth.users(id) on delete cascade primary key,
  name          text,
  email         text,
  phone         text,
  role          text default 'Apostador', -- Apostador | Gerente | Analista | Operador | Trader
  avatar_url    text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

alter table public.profiles enable row level security;

-- Users can only read/write their own profile
create policy "profiles: own read"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: own update" on public.profiles for update using (auth.uid() = id);
create policy "profiles: own insert" on public.profiles for insert with check (auth.uid() = id);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, name)
  values (new.id, new.email, split_part(new.email, '@', 1));
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── Legs (individual bets) ────────────────────────────────────────────────────

create table if not exists public.legs (
  id            text primary key,
  user_id       uuid references auth.users(id) on delete cascade not null,
  oid           text not null,           -- operation id
  bd            timestamptz not null,    -- bet date
  ed            timestamptz,             -- event date
  sp            text,                    -- sport
  ev            text,                    -- event name
  ho            text,                    -- house/bookmaker
  mk            text,                    -- market
  od            numeric(10,4) default 0, -- odds
  st            numeric(12,2) default 0, -- stake R$
  pc            numeric(8,4)  default 0, -- percentage
  re            text not null default 'Pendente', -- result
  pr            numeric(12,2) default 0, -- profit
  fl            jsonb default '[]',      -- anomaly flags
  signal        text,
  op_type       text default 'surebet',
  source        text default 'manual',   -- 'manual' | 'import'
  manual_profit numeric(12,2),
  cashout_value numeric(12,2),
  created_at    timestamptz default now()
);

alter table public.legs enable row level security;
create policy "legs: own all" on public.legs for all using (auth.uid() = user_id);
create index if not exists legs_user_id_bd_idx on public.legs(user_id, bd desc);
create index if not exists legs_oid_idx on public.legs(oid);

-- ── Bookmakers ────────────────────────────────────────────────────────────────

create table if not exists public.bookmakers (
  id               text primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  name             text not null,
  abbr             text,
  color            text,
  initial_balance  numeric(12,2) default 0,
  balance          numeric(12,2) default 0,
  status           text default 'ativa', -- ativa | inativa | limitada
  notes            text default '',
  ops              int  default 0,
  credentials      jsonb,
  created_at       timestamptz default now()
);

alter table public.bookmakers enable row level security;
create policy "bookmakers: own all" on public.bookmakers for all using (auth.uid() = user_id);

-- ── Banks ─────────────────────────────────────────────────────────────────────

create table if not exists public.banks (
  id         text primary key,
  user_id    uuid references auth.users(id) on delete cascade not null,
  name       text not null,
  balance    numeric(12,2) default 0,
  notes      text default '',
  created_at timestamptz default now()
);

alter table public.banks enable row level security;
create policy "banks: own all" on public.banks for all using (auth.uid() = user_id);

-- ── Expenses ─────────────────────────────────────────────────────────────────

create table if not exists public.expenses (
  id          text primary key,
  user_id     uuid references auth.users(id) on delete cascade not null,
  date        date not null,
  category    text not null,
  description text not null,
  amount      numeric(12,2) not null,
  notes       text,
  recurring   boolean default false,
  created_at  timestamptz default now()
);

alter table public.expenses enable row level security;
create policy "expenses: own all" on public.expenses for all using (auth.uid() = user_id);

-- ── Partner accounts ─────────────────────────────────────────────────────────

create table if not exists public.partner_accounts (
  id               text primary key,
  user_id          uuid references auth.users(id) on delete cascade not null,
  owner            text not null,
  houses           text[] default '{}',
  status           text default 'ativa',
  total_deposited  numeric(12,2) default 0,
  total_withdrawn  numeric(12,2) default 0,
  tax_threshold    numeric(12,2) default 60000,
  notes            text,
  created_at       timestamptz default now()
);

alter table public.partner_accounts enable row level security;
create policy "partner_accounts: own all" on public.partner_accounts for all using (auth.uid() = user_id);

create table if not exists public.account_transactions (
  id         text primary key,
  account_id text references public.partner_accounts(id) on delete cascade not null,
  user_id    uuid references auth.users(id) on delete cascade not null,
  date       date not null,
  type       text not null, -- deposito | saque
  house      text not null,
  amount     numeric(12,2) not null,
  notes      text,
  created_at timestamptz default now()
);

alter table public.account_transactions enable row level security;
create policy "account_transactions: own all" on public.account_transactions for all using (auth.uid() = user_id);

-- ── Excluded import keys (duplication prevention) ────────────────────────────

create table if not exists public.excluded_import_keys (
  user_id    uuid references auth.users(id) on delete cascade not null,
  key        text not null,
  created_at timestamptz default now(),
  primary key (user_id, key)
);

alter table public.excluded_import_keys enable row level security;
create policy "excluded_import_keys: own all" on public.excluded_import_keys for all using (auth.uid() = user_id);

-- ── Sheet sync config ─────────────────────────────────────────────────────────

create table if not exists public.sheet_sync (
  user_id           uuid references auth.users(id) on delete cascade primary key,
  url               text not null,
  sheet_id          text,
  gid               text default '0',
  last_sync         timestamptz,
  auto_sync         boolean default false,
  interval_min      int default 0,
  history_imported  boolean default false,
  updated_at        timestamptz default now()
);

alter table public.sheet_sync enable row level security;
create policy "sheet_sync: own all" on public.sheet_sync for all using (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════════════════════
-- MANAGER ROLE: Allows viewing all users' data (for admin/manager access level)
-- Only enable if you need multi-user management
-- ══════════════════════════════════════════════════════════════════════════════

-- create policy "legs: manager read" on public.legs for select
--   using (
--     exists (
--       select 1 from public.profiles
--       where id = auth.uid() and role in ('Gerente', 'Admin')
--     )
--   );
