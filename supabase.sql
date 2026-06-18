create extension if not exists pgcrypto;

create table if not exists public.device_commands (
  id uuid primary key default gen_random_uuid(),
  device_id text not null,
  action text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

create index if not exists idx_device_commands_status_created_at
  on public.device_commands (status, created_at);

create index if not exists idx_device_commands_device_status_created_at
  on public.device_commands (device_id, status, created_at);

create index if not exists idx_device_commands_created_at
  on public.device_commands (created_at);

alter table public.device_commands enable row level security;

drop policy if exists "mvp_select_all" on public.device_commands;
create policy "mvp_select_all"
on public.device_commands
for select
to anon, authenticated
using (true);

drop policy if exists "mvp_insert_all" on public.device_commands;
create policy "mvp_insert_all"
on public.device_commands
for insert
to anon, authenticated
with check (true);

drop policy if exists "mvp_update_all" on public.device_commands;
create policy "mvp_update_all"
on public.device_commands
for update
to anon, authenticated
using (true)
with check (true);
