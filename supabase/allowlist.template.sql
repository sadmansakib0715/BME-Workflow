-- Copy this file to allowlist.local.sql (git-ignored), replace addresses, then run in Supabase SQL editor.
-- The faculty names must exactly match the rows imported from seed.local.sql.

-- Example:
-- update public.faculty set email='name@buet.ac.bd' where full_name='Faculty Name';
-- insert into public.allowed_users(email,faculty_id,app_role)
-- select 'name@buet.ac.bd', id, 'faculty' from public.faculty where full_name='Faculty Name'
-- on conflict(email) do update set faculty_id=excluded.faculty_id,app_role=excluded.app_role,active=true;

-- Make the first administrator 'admin' or 'hod'.
