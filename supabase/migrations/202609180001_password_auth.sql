-- Password-auth signup gate for BME Workflow
-- Run this in Supabase SQL Editor AFTER the existing numbered workflow migrations.

begin;

create or replace function public.signup_email_allowed(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.allowed_users a
    where lower(a.email) = lower(trim(coalesce(p_email, '')))
      and a.active
  );
$$;

revoke all on function public.signup_email_allowed(text) from public;
grant execute on function public.signup_email_allowed(text) to anon, authenticated;

insert into public.workflow_migrations(version)
values ('202609180001')
on conflict (version) do nothing;

commit;
