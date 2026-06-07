-- Armazena o refresh_token do DuploGreen por usuário SureEdge
-- O access_token é renovado automaticamente pelo servidor

create table if not exists public.dg_credentials (
  user_id        uuid primary key references auth.users(id) on delete cascade,
  refresh_token  text not null,
  access_token   text,
  expires_at     bigint,   -- unix timestamp segundos
  updated_at     timestamptz default now()
);

-- Apenas o próprio usuário pode ver/editar suas credenciais
alter table public.dg_credentials enable row level security;

create policy "owner only" on public.dg_credentials
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Service role pode atualizar (para rotação do refresh_token)
create policy "service role full access" on public.dg_credentials
  to service_role using (true) with check (true);
