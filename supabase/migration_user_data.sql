-- ══════════════════════════════════════════════════════════════════════════════
-- SureEdge — Migration: user_data table + avatars bucket
-- Run this in: https://supabase.com/dashboard/project/_/sql/new
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Tabela principal de dados do usuário (AppDB como JSON blob)
create table if not exists public.user_data (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_data enable row level security;

-- Cada usuário acessa apenas seus próprios dados
create policy "user_data: own select" on public.user_data
  for select using (auth.uid() = user_id);

create policy "user_data: own insert" on public.user_data
  for insert with check (auth.uid() = user_id);

create policy "user_data: own update" on public.user_data
  for update using (auth.uid() = user_id);

create policy "user_data: own delete" on public.user_data
  for delete using (auth.uid() = user_id);

-- Auto-atualiza updated_at em cada update
create or replace function public.set_user_data_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists user_data_set_updated_at on public.user_data;
create trigger user_data_set_updated_at
  before update on public.user_data
  for each row execute function public.set_user_data_updated_at();

-- 2. Bucket de avatares (público para leitura, escrita restrita ao dono)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars',
  'avatars',
  true,
  2097152,           -- 2 MB
  array['image/jpeg','image/png','image/webp','image/gif']
)
on conflict (id) do nothing;

-- Leitura pública (qualquer um pode ver avatares)
drop policy if exists "avatars: public read" on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');

-- Apenas o próprio usuário pode fazer upload (pasta = user_id)
drop policy if exists "avatars: own insert" on storage.objects;
create policy "avatars: own insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
