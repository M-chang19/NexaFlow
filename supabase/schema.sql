create table if not exists public.nexaflow_workspaces (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

alter table public.nexaflow_workspaces enable row level security;

revoke all on public.nexaflow_workspaces from anon;
grant select, insert, update, delete on public.nexaflow_workspaces to authenticated;

drop policy if exists "Users can read their own NexaFlow workspace" on public.nexaflow_workspaces;
create policy "Users can read their own NexaFlow workspace"
  on public.nexaflow_workspaces for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "Users can create their own NexaFlow workspace" on public.nexaflow_workspaces;
create policy "Users can create their own NexaFlow workspace"
  on public.nexaflow_workspaces for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can update their own NexaFlow workspace" on public.nexaflow_workspaces;
create policy "Users can update their own NexaFlow workspace"
  on public.nexaflow_workspaces for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "Users can delete their own NexaFlow workspace" on public.nexaflow_workspaces;
create policy "Users can delete their own NexaFlow workspace"
  on public.nexaflow_workspaces for delete
  to authenticated
  using ((select auth.uid()) = user_id);
