-- BME Workflow v3 migration
-- Safe to run AFTER the existing supabase/schema.sql.
-- Fixes sessional publishing, CT write permissions, CT reschedule history,
-- and adds small integrity/index improvements for the full Activity Tracker workflow.

begin;

-- 1) A course should require the five theory roles only if it is a THEORY course.
create or replace function public.validate_course_publish()
returns trigger
language plpgsql
set search_path=public
as $$
declare
  a public.primary_assignments%rowtype;
  normalized_type text;
begin
  normalized_type := lower(coalesce(new.course_type, 'theory'));
  if normalized_type = 'lab' then normalized_type := 'sessional'; end if;

  if new.status='published' and normalized_type='theory' then
    if tg_op='INSERT' then
      raise exception 'Create the theory course as draft, assign all five primary roles, then publish it.';
    elsif old.status is distinct from 'published' then
      select * into a from public.primary_assignments where course_id=new.id;
      if not found
         or a.preparer_a is null
         or a.preparer_b is null
         or a.moderator_1 is null
         or a.moderator_2 is null
         or a.scrutinizer is null then
        raise exception 'Cannot publish theory course: all five primary assignments are required.';
      end if;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists validate_course_publish_trg on public.courses;
create trigger validate_course_publish_trg
before insert or update on public.courses
for each row execute function public.validate_course_publish();

-- 2) One helper for course teachers/admins.
create or replace function public.can_manage_course(p_course uuid)
returns boolean
language sql
stable
security definer
set search_path=public
as $$
  select public.is_admin()
  or exists(
    select 1
    from public.course_faculty cf
    where cf.course_id=p_course
      and cf.faculty_id=public.current_faculty_id()
  );
$$;

revoke all on function public.can_manage_course(uuid) from public;
grant execute on function public.can_manage_course(uuid) to authenticated;

-- 3) CTs are course-teacher work, not admin-only work.
drop policy if exists class_tests_admin_write on public.class_tests;
drop policy if exists class_tests_write on public.class_tests;
create policy class_tests_write
on public.class_tests
for all
using (public.can_manage_course(course_id))
with check (public.can_manage_course(course_id));

-- 4) Preserve CT date/time changes automatically in history.
--    This avoids relying on browser code to create history correctly.
create or replace function public.capture_class_test_reschedule()
returns trigger
language plpgsql
security definer
set search_path=public
as $$
declare
  old_d date;
  new_d date;
  old_t time;
  new_t time;
begin
  old_d := coalesce(old.scheduled_date, old.date);
  new_d := coalesce(new.scheduled_date, new.date);
  old_t := coalesce(old.scheduled_time, old.time);
  new_t := coalesce(new.scheduled_time, new.time);

  if old_d is distinct from new_d or old_t is distinct from new_t then
    insert into public.class_test_history(
      class_test_id, changed_by, old_date, new_date, old_time, new_time, reason
    ) values (
      new.id,
      public.current_faculty_id(),
      old_d,
      new_d,
      old_t,
      new_t,
      coalesce(nullif(new.notes,''), 'CT schedule changed')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists capture_class_test_reschedule_trg on public.class_tests;
create trigger capture_class_test_reschedule_trg
after update on public.class_tests
for each row execute function public.capture_class_test_reschedule();

-- Faculty may read CT history for courses they can access.
drop policy if exists class_test_history_read on public.class_test_history;
create policy class_test_history_read
on public.class_test_history
for select
using (
  exists(
    select 1 from public.class_tests ct
    where ct.id=class_test_history.class_test_id
      and public.can_access_course(ct.course_id)
  )
);

-- Direct writes to history remain admin-only; normal history is trigger-generated.
drop policy if exists class_test_history_admin_write on public.class_test_history;
create policy class_test_history_admin_write
on public.class_test_history
for all
using (public.is_admin())
with check (public.is_admin());

-- 5) Explicit indexes for the most frequent personalized queries.
create index if not exists course_faculty_faculty_course_idx
  on public.course_faculty(faculty_id, course_id);
create index if not exists class_tests_course_ct_idx
  on public.class_tests(course_id, ct_number);
create index if not exists assessment_components_course_active_idx
  on public.assessment_components(course_id, active, display_order);
create index if not exists assessment_instances_course_status_idx
  on public.assessment_instances(course_id, status, scheduled_date, due_date);
create index if not exists sessional_configs_course_idx
  on public.sessional_course_configs(course_id);

-- 6) Keep status/name updates timestamped consistently.
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- Only tables that actually contain updated_at.
do $$
declare t text;
begin
  foreach t in array array[
    'academic_terms','term_milestones','course_outline_statuses','class_tests',
    'sessional_course_configs','sessional_sessions','assessment_instances',
    'sessional_grade_assignments','sessional_grade_statuses','feedback_statuses',
    'course_file_statuses'
  ] loop
    execute format('drop trigger if exists touch_updated_at_trg on public.%I',t);
    execute format('create trigger touch_updated_at_trg before update on public.%I for each row execute function public.touch_updated_at()',t);
  end loop;
end $$;

commit;
