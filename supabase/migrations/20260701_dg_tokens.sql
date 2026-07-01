-- Armazena tokens DG com persistência entre cold starts do Vercel
create table if not exists app_settings (
  key   text primary key,
  value text not null,
  updated_at timestamptz default now()
);

-- Apenas service_role pode escrever; sem leitura pública
alter table app_settings enable row level security;

create policy "service_role full access" on app_settings
  using (true)
  with check (true);
