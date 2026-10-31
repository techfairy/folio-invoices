-- Run once in the SQL Editor of your invoice Supabase project.
-- This table is separate from any other application.
begin;
create table if not exists public.invoice_workspaces (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  revision bigint not null default 0 check (revision >= 0),
  data jsonb not null,
  updated_at timestamptz not null default now(),
  constraint invoice_data_shape check (
    jsonb_typeof(data) = 'object' and data->>'schema' = '1'
    and jsonb_typeof(data->'clients') = 'array'
    and jsonb_typeof(data->'invoices') = 'array'
    and jsonb_typeof(data->'settings') = 'object'
  )
);
alter table public.invoice_workspaces enable row level security;
revoke all on public.invoice_workspaces from anon;
grant select, insert, update on public.invoice_workspaces to authenticated;
do $$
begin
  if not exists (
    select 1 from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'invoice_workspaces'
      and policyname = 'Own invoice workspace'
  ) then
    create policy "Own invoice workspace" on public.invoice_workspaces
      for all to authenticated using ((select auth.uid()) = owner_id)
      with check ((select auth.uid()) = owner_id);
  end if;
end;
$$;

create or replace function public.save_invoice_workspace(expected_revision bigint, new_data jsonb)
returns table (revision bigint, data jsonb)
language plpgsql security invoker set search_path = '' as $$
declare
  current_revision bigint;
  user_id uuid := auth.uid();
begin
  if user_id is null then raise exception 'Sign in before saving.' using errcode = '42501'; end if;
  if octet_length(new_data::text) > 15000000 then raise exception 'Workspace exceeds 15 MB.'; end if;
  insert into public.invoice_workspaces(owner_id, revision, data)
    values(user_id, 0, new_data) on conflict (owner_id) do nothing;
  select w.revision into current_revision from public.invoice_workspaces w
    where w.owner_id = user_id for update;
  if current_revision is distinct from expected_revision then
    raise exception 'Workspace changed on another device.' using errcode = '40001';
  end if;
  return query update public.invoice_workspaces w
    set data = new_data, revision = w.revision + 1, updated_at = now()
    where w.owner_id = user_id returning w.revision, w.data;
end;
$$;
revoke all on function public.save_invoice_workspace(bigint, jsonb) from public, anon;
grant execute on function public.save_invoice_workspace(bigint, jsonb) to authenticated;
commit;
