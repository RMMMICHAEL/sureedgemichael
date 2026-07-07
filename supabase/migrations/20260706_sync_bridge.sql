-- SureEdge Sync Bridge — tabelas de suporte

create table if not exists sync_devices (
  device_id         text primary key,
  alias             text,
  extension_version text,
  active            boolean not null default true,
  status            text default 'offline',
  dg_tab_open       boolean default false,
  last_sync_at      timestamptz,
  last_seen         timestamptz,
  last_plugin       text,
  config            jsonb,
  created_at        timestamptz not null default now()
);

create table if not exists sync_sequence (
  device_id        text not null,
  plugin_id        text not null,
  last_sequence_id bigint not null default 0,
  updated_at       timestamptz not null default now(),
  primary key (device_id, plugin_id)
);

create table if not exists sync_alerts (
  id         bigint generated always as identity primary key,
  device_id  text,
  plugin_id  text,
  type       text,
  payload    jsonb,
  resolved   boolean not null default false,
  created_at timestamptz not null default now()
);

-- RLS: apenas service_role escreve, autenticados lêem
alter table sync_devices  enable row level security;
alter table sync_sequence enable row level security;
alter table sync_alerts   enable row level security;

create policy "service_role_all_devices"  on sync_devices  for all using (auth.role() = 'service_role');
create policy "service_role_all_sequence" on sync_sequence for all using (auth.role() = 'service_role');
create policy "service_role_all_alerts"   on sync_alerts   for all using (auth.role() = 'service_role');

create policy "auth_read_devices"  on sync_devices  for select using (auth.role() = 'authenticated');
create policy "auth_read_alerts"   on sync_alerts   for select using (auth.role() = 'authenticated');
