-- BME ExamFlow secure backend schema for Supabase/PostgreSQL
-- Run once in a NEW Supabase project using the SQL editor.

create extension if not exists pgcrypto;

create table if not exists public.faculty (
  id uuid primary key default gen_random_uuid(),
  full_name text not null unique,
  designation text,
  email text,
  created_at timestamptz not null default now()
);
create unique index if not exists faculty_email_unique on public.faculty(lower(email)) where email is not null;

create table if not exists public.allowed_users (
  email text primary key,
  faculty_id uuid not null references public.faculty(id) on delete cascade,
  app_role text not null default 'faculty' check (app_role in ('faculty','admin','hod')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists allowed_users_email_lower_unique on public.allowed_users(lower(email));
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='allowed_users_bme_email_check'
      and conrelid='public.allowed_users'::regclass
  ) then
    alter table public.allowed_users
      add constraint allowed_users_bme_email_check
      check (email ~* '^[^@[:space:]]+@bme\.buet\.ac\.bd$');
  end if;
end $$;

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  faculty_id uuid not null unique references public.faculty(id) on delete restrict,
  app_role text not null default 'faculty' check (app_role in ('faculty','admin','hod')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.academic_terms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  start_date date,
  end_date date,
  total_teaching_weeks integer not null default 14 check(total_teaching_weeks between 1 and 52),
  latest_completed_week integer not null default 0 check(latest_completed_week >= 0),
  calendar_status text not null default 'active' check(calendar_status in ('active','paused')),
  pause_reason text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (latest_completed_week <= total_teaching_weeks)
);

create table if not exists public.academic_weeks (
  id uuid primary key default gen_random_uuid(),
  term_id uuid not null references public.academic_terms(id) on delete cascade,
  week_no integer not null check(week_no > 0),
  starts_on date,
  ends_on date,
  label text,
  unique(term_id, week_no),
  check (starts_on is null or ends_on is null or starts_on <= ends_on)
);

create table if not exists public.courses (
  id uuid primary key default gen_random_uuid(),
  course_code text not null unique,
  title text not null,
  term text not null default '2026',
  status text not null default 'draft' check(status in ('draft','published','archived')),
  question_deadline date,
  exam_date date,
  final_gradesheet_deadline date,
  notes text not null default '',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (question_deadline is null or exam_date is null or question_deadline <= exam_date),
  check (exam_date is null or final_gradesheet_deadline is null or exam_date <= final_gradesheet_deadline)
);

alter table public.courses add column if not exists term_id uuid references public.academic_terms(id) on delete set null;
alter table public.courses add column if not exists course_type text not null default 'theory';
alter table public.courses add column if not exists batch text;
alter table public.courses add column if not exists section_a text not null default 'A';
alter table public.courses add column if not exists section_b text not null default 'B';
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname='courses_course_type_check'
      and conrelid='public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_course_type_check
      check (course_type in ('theory','lab'));
  end if;
end $$;

create table if not exists public.course_faculty (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  role text not null default 'course_teacher',
  section text,
  created_at timestamptz not null default now()
);
create unique index if not exists course_faculty_unique_role on public.course_faculty(course_id, faculty_id, role, coalesce(section,''));

create table if not exists public.primary_assignments (
  course_id uuid primary key references public.courses(id) on delete cascade,
  preparer_a uuid references public.faculty(id) on delete restrict,
  preparer_b uuid references public.faculty(id) on delete restrict,
  moderator_1 uuid references public.faculty(id) on delete restrict,
  moderator_2 uuid references public.faculty(id) on delete restrict,
  scrutinizer uuid references public.faculty(id) on delete restrict,
  updated_at timestamptz not null default now(),
  check (preparer_a is null or preparer_b is null or preparer_a <> preparer_b),
  check (moderator_1 is null or moderator_2 is null or moderator_1 <> moderator_2),
  check (moderator_1 is null or preparer_a is null or moderator_1 <> preparer_a),
  check (moderator_1 is null or preparer_b is null or moderator_1 <> preparer_b),
  check (moderator_2 is null or preparer_a is null or moderator_2 <> preparer_a),
  check (moderator_2 is null or preparer_b is null or moderator_2 <> preparer_b),
  check (scrutinizer is null or preparer_a is null or scrutinizer <> preparer_a),
  check (scrutinizer is null or preparer_b is null or scrutinizer <> preparer_b)
);

create table if not exists public.task_statuses (
  course_id uuid not null references public.courses(id) on delete cascade,
  task_key text not null check(task_key in ('question_prep_a','question_prep_b','moderation_1','moderation_2','examination_a','examination_b','scrutiny','gradesheet_prep','gradesheet_scrutiny')),
  status text not null default 'not_started' check(status in ('not_started','waiting','in_progress','submitted','completed','blocked')),
  completed_at timestamptz,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(course_id,task_key)
);

create table if not exists public.task_deadlines (
  course_id uuid not null references public.courses(id) on delete cascade,
  task_key text not null check(task_key in ('question_prep_a','question_prep_b','moderation_1','moderation_2','examination_a','examination_b','scrutiny','gradesheet_prep','gradesheet_scrutiny')),
  due_date date not null,
  primary key(course_id,task_key)
);

create table if not exists public.class_tests (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id uuid references public.academic_terms(id) on delete set null,
  title text not null,
  section text,
  batch text,
  date date not null,
  time time,
  syllabus text not null default '',
  responsible_faculty uuid references public.faculty(id) on delete set null,
  status text not null default 'proposed' check(status in ('proposed','confirmed','completed','postponed','rescheduled','cancelled')),
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists class_tests_schedule_idx on public.class_tests(batch, section, date, time);

create table if not exists public.class_test_history (
  id bigint generated always as identity primary key,
  class_test_id uuid not null references public.class_tests(id) on delete cascade,
  changed_by uuid references public.faculty(id) on delete set null,
  old_date date,
  new_date date,
  old_time time,
  new_time time,
  reason text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lab_course_config (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null unique references public.courses(id) on delete cascade,
  term_id uuid references public.academic_terms(id) on delete set null,
  session_count integer not null default 0 check(session_count >= 0),
  config_status text not null default 'setup_required' check(config_status in ('setup_required','configured')),
  version integer not null default 1 check(version > 0),
  remarks text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_sessions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  term_id uuid references public.academic_terms(id) on delete set null,
  session_no integer not null check(session_no > 0),
  title text not null,
  date date,
  section text,
  group_label text,
  assigned_faculty uuid references public.faculty(id) on delete set null,
  status text not null default 'not_started' check(status in ('not_started','scheduled','in_progress','conducted','submission_pending','evaluation_pending','completed','cancelled')),
  report_required boolean not null default false,
  report_deadline date,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists lab_sessions_unique_slot on public.lab_sessions(course_id, session_no, coalesce(section,''), coalesce(group_label,''));

create table if not exists public.lab_assessment_types (
  id uuid primary key default gen_random_uuid(),
  config_id uuid references public.lab_course_config(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  name text not null,
  marks numeric not null default 0,
  count integer not null default 1 check(count > 0),
  best_of integer,
  drop_count integer not null default 0 check(drop_count >= 0),
  due_behavior text not null default 'scheduled',
  section text,
  responsible_faculty uuid references public.faculty(id) on delete set null,
  remarks text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.lab_assessment_items (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.courses(id) on delete cascade,
  assessment_type_id uuid references public.lab_assessment_types(id) on delete cascade,
  lab_session_id uuid references public.lab_sessions(id) on delete set null,
  title text not null,
  due_date date,
  responsible_faculty uuid references public.faculty(id) on delete set null,
  status text not null default 'scheduled' check(status in ('not_started','scheduled','in_progress','conducted','submission_pending','evaluation_pending','completed','cancelled')),
  marks numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.lab_activity_assignments (
  id uuid primary key default gen_random_uuid(),
  lab_session_id uuid references public.lab_sessions(id) on delete cascade,
  assessment_item_id uuid references public.lab_assessment_items(id) on delete cascade,
  faculty_id uuid not null references public.faculty(id) on delete restrict,
  role text not null default 'responsible',
  created_at timestamptz not null default now(),
  check (lab_session_id is not null or assessment_item_id is not null)
);

create table if not exists public.academic_events (
  id uuid primary key default gen_random_uuid(),
  term_id uuid references public.academic_terms(id) on delete set null,
  course_id uuid references public.courses(id) on delete cascade,
  event_type text not null,
  title text not null,
  event_date date not null,
  event_time time,
  faculty_id uuid references public.faculty(id) on delete set null,
  source_table text,
  source_id uuid,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  faculty_id uuid references public.faculty(id) on delete cascade,
  title text not null,
  body text not null default '',
  level text not null default 'info' check(level in ('info','warning','error')),
  related_type text,
  related_id uuid,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor uuid references auth.users(id) on delete set null,
  table_name text not null,
  action text not null,
  row_key text,
  old_value jsonb,
  new_value jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.has_active_profile()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active);
$$;
create or replace function public.current_faculty_id()
returns uuid language sql stable security definer set search_path=public as $$
  select p.faculty_id from public.profiles p where p.user_id=auth.uid() and p.active limit 1;
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path=public as $$
  select exists(select 1 from public.profiles p where p.user_id=auth.uid() and p.active and p.app_role in ('admin','hod'));
$$;

create or replace function public.can_access_course(p_course uuid)
returns boolean language sql stable security definer set search_path=public as $$
  select public.is_admin() or (
    public.has_active_profile() and
    exists(select 1 from public.courses c where c.id=p_course and c.active and c.status='published')
  );
$$;

create or replace function public.assignee_for_task(p_course uuid,p_task text)
returns uuid language sql stable security definer set search_path=public as $$
  select case p_task
    when 'question_prep_a' then a.preparer_a
    when 'question_prep_b' then a.preparer_b
    when 'moderation_1' then a.moderator_1
    when 'moderation_2' then a.moderator_2
    when 'examination_a' then a.preparer_a
    when 'examination_b' then a.preparer_b
    when 'scrutiny' then a.scrutinizer
    when 'gradesheet_prep' then a.preparer_a
    when 'gradesheet_scrutiny' then a.scrutinizer
    else null end
  from public.primary_assignments a where a.course_id=p_course;
$$;

create or replace function public.enforce_bme_auth_email()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if new.email is null or new.email !~* '^[^@[:space:]]+@bme\.buet\.ac\.bd$' then
    raise exception 'Only @bme.buet.ac.bd faculty email addresses can sign up.';
  end if;
  return new;
end;$$;
drop trigger if exists enforce_bme_auth_email_trg on auth.users;
create trigger enforce_bme_auth_email_trg before insert or update of email on auth.users
for each row execute function public.enforce_bme_auth_email();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path=public as $$
declare a public.allowed_users%rowtype;
begin
  select * into a from public.allowed_users where lower(email)=lower(new.email) and active=true;
  if found then
    insert into public.profiles(user_id,faculty_id,app_role,active)
    values(new.id,a.faculty_id,a.app_role,true)
    on conflict(user_id) do update set faculty_id=excluded.faculty_id,app_role=excluded.app_role,active=true;
  end if;
  return new;
end;$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

-- Allows an already-existing authenticated account to claim its profile after an admin
-- adds that email to the allowlist. It reveals no data and succeeds only on exact allowlist match.
create or replace function public.claim_allowed_profile()
returns boolean language plpgsql security definer set search_path=public,auth as $$
declare user_email text; a public.allowed_users%rowtype;
begin
  select email into user_email from auth.users where id=auth.uid();
  if user_email is null then return false; end if;
  select * into a from public.allowed_users where lower(email)=lower(user_email) and active=true;
  if not found then return false; end if;
  insert into public.profiles(user_id,faculty_id,app_role,active)
  values(auth.uid(),a.faculty_id,a.app_role,true)
  on conflict(user_id) do nothing;
  return exists(select 1 from public.profiles where user_id=auth.uid() and active=true);
end;$$;

create or replace function public.sync_allowlist_change()
returns trigger language plpgsql security definer set search_path=public,auth as $$
begin
  if tg_op='DELETE' then
    update public.profiles p set active=false
    from auth.users u
    where p.user_id=u.id and lower(u.email)=lower(old.email);
    return old;
  end if;
  update public.profiles p
  set faculty_id=new.faculty_id, app_role=new.app_role, active=new.active
  from auth.users u
  where p.user_id=u.id and lower(u.email)=lower(new.email);
  return new;
end;$$;
drop trigger if exists sync_allowlist_change_trg on public.allowed_users;
create trigger sync_allowlist_change_trg after insert or update or delete on public.allowed_users
for each row execute function public.sync_allowlist_change();

create or replace function public.validate_course_publish()
returns trigger language plpgsql set search_path=public as $$
declare a public.primary_assignments%rowtype;
begin
  if new.status='published' then
    if tg_op='INSERT' then
      raise exception 'Create the course as draft, assign all five primary roles, then publish it.';
    elsif old.status is distinct from 'published' then
      select * into a from public.primary_assignments where course_id=new.id;
      if not found or a.preparer_a is null or a.preparer_b is null or a.moderator_1 is null or a.moderator_2 is null or a.scrutinizer is null then
        raise exception 'Cannot publish: all five primary assignments are required.';
      end if;
    end if;
  end if;
  return new;
end;$$;
drop trigger if exists validate_course_publish_trg on public.courses;
create trigger validate_course_publish_trg before insert or update on public.courses for each row execute function public.validate_course_publish();

-- When an assignee changes, unfinished statuses owned by the old assignee are reset.
-- Completed work is preserved as a historical completion; the assignment change remains audited.
create or replace function public.reset_unfinished_on_assignment_change()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  if old.preparer_a is distinct from new.preparer_a then
    delete from public.task_statuses where course_id=new.course_id and task_key in ('question_prep_a','examination_a','gradesheet_prep') and status <> 'completed';
  end if;
  if old.preparer_b is distinct from new.preparer_b then
    delete from public.task_statuses where course_id=new.course_id and task_key in ('question_prep_b','examination_b') and status <> 'completed';
  end if;
  if old.moderator_1 is distinct from new.moderator_1 then
    delete from public.task_statuses where course_id=new.course_id and task_key='moderation_1' and status <> 'completed';
  end if;
  if old.moderator_2 is distinct from new.moderator_2 then
    delete from public.task_statuses where course_id=new.course_id and task_key='moderation_2' and status <> 'completed';
  end if;
  if old.scrutinizer is distinct from new.scrutinizer then
    delete from public.task_statuses where course_id=new.course_id and task_key in ('scrutiny','gradesheet_scrutiny') and status <> 'completed';
  end if;
  new.updated_at=now();
  return new;
end;$$;
drop trigger if exists reset_assignment_statuses_trg on public.primary_assignments;
create trigger reset_assignment_statuses_trg before update on public.primary_assignments
for each row execute function public.reset_unfinished_on_assignment_change();

create or replace function public.check_task_dependencies()
returns trigger language plpgsql set search_path=public as $$
declare deps text[]; dep text; dep_status text;
begin
  new.updated_at=now();
  if new.status <> 'completed' then new.completed_at=null; return new; end if;
  deps := case new.task_key
    when 'moderation_1' then array['question_prep_a','question_prep_b']
    when 'moderation_2' then array['question_prep_a','question_prep_b']
    when 'examination_a' then array['moderation_1','moderation_2']
    when 'examination_b' then array['moderation_1','moderation_2']
    when 'scrutiny' then array['examination_a','examination_b']
    when 'gradesheet_prep' then array['scrutiny']
    when 'gradesheet_scrutiny' then array['gradesheet_prep']
    else array[]::text[] end;
  foreach dep in array deps loop
    select status into dep_status from public.task_statuses where course_id=new.course_id and task_key=dep;
    if coalesce(dep_status,'not_started') <> 'completed' then
      raise exception 'Cannot complete % before prerequisite % is completed.',new.task_key,dep;
    end if;
  end loop;
  if new.completed_at is null then new.completed_at=now(); end if;
  return new;
end;$$;
drop trigger if exists task_dependency_trg on public.task_statuses;
create trigger task_dependency_trg before insert or update on public.task_statuses for each row execute function public.check_task_dependencies();

create or replace function public.audit_row()
returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.audit_logs(actor,table_name,action,row_key,old_value,new_value)
  values(auth.uid(),tg_table_name,tg_op,
    case when tg_op='DELETE' then coalesce(to_jsonb(old)->>'course_id',to_jsonb(old)->>'id',to_jsonb(old)->>'email',to_jsonb(old)->>'user_id') else coalesce(to_jsonb(new)->>'course_id',to_jsonb(new)->>'id',to_jsonb(new)->>'email',to_jsonb(new)->>'user_id') end,
    case when tg_op in ('UPDATE','DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT','UPDATE') then to_jsonb(new) else null end);
  return coalesce(new,old);
end;$$;

drop trigger if exists audit_courses on public.courses;
create trigger audit_courses after insert or update or delete on public.courses for each row execute function public.audit_row();
drop trigger if exists audit_assignments on public.primary_assignments;
create trigger audit_assignments after insert or update or delete on public.primary_assignments for each row execute function public.audit_row();
drop trigger if exists audit_statuses on public.task_statuses;
create trigger audit_statuses after insert or update or delete on public.task_statuses for each row execute function public.audit_row();
drop trigger if exists audit_deadlines on public.task_deadlines;
create trigger audit_deadlines after insert or update or delete on public.task_deadlines for each row execute function public.audit_row();
drop trigger if exists audit_allowlist on public.allowed_users;
create trigger audit_allowlist after insert or update or delete on public.allowed_users for each row execute function public.audit_row();
drop trigger if exists audit_profiles on public.profiles;
create trigger audit_profiles after insert or update or delete on public.profiles for each row execute function public.audit_row();
drop trigger if exists audit_academic_terms on public.academic_terms;
create trigger audit_academic_terms after insert or update or delete on public.academic_terms for each row execute function public.audit_row();
drop trigger if exists audit_academic_weeks on public.academic_weeks;
create trigger audit_academic_weeks after insert or update or delete on public.academic_weeks for each row execute function public.audit_row();
drop trigger if exists audit_course_faculty on public.course_faculty;
create trigger audit_course_faculty after insert or update or delete on public.course_faculty for each row execute function public.audit_row();
drop trigger if exists audit_class_tests on public.class_tests;
create trigger audit_class_tests after insert or update or delete on public.class_tests for each row execute function public.audit_row();
drop trigger if exists audit_class_test_history on public.class_test_history;
create trigger audit_class_test_history after insert or update or delete on public.class_test_history for each row execute function public.audit_row();
drop trigger if exists audit_lab_config on public.lab_course_config;
create trigger audit_lab_config after insert or update or delete on public.lab_course_config for each row execute function public.audit_row();
drop trigger if exists audit_lab_sessions on public.lab_sessions;
create trigger audit_lab_sessions after insert or update or delete on public.lab_sessions for each row execute function public.audit_row();
drop trigger if exists audit_lab_assessment_types on public.lab_assessment_types;
create trigger audit_lab_assessment_types after insert or update or delete on public.lab_assessment_types for each row execute function public.audit_row();
drop trigger if exists audit_lab_assessment_items on public.lab_assessment_items;
create trigger audit_lab_assessment_items after insert or update or delete on public.lab_assessment_items for each row execute function public.audit_row();
drop trigger if exists audit_academic_events on public.academic_events;
create trigger audit_academic_events after insert or update or delete on public.academic_events for each row execute function public.audit_row();
drop trigger if exists audit_notifications on public.notifications;
create trigger audit_notifications after insert or update or delete on public.notifications for each row execute function public.audit_row();

alter table public.faculty enable row level security;
alter table public.allowed_users enable row level security;
alter table public.profiles enable row level security;
alter table public.academic_terms enable row level security;
alter table public.academic_weeks enable row level security;
alter table public.courses enable row level security;
alter table public.course_faculty enable row level security;
alter table public.primary_assignments enable row level security;
alter table public.task_statuses enable row level security;
alter table public.task_deadlines enable row level security;
alter table public.class_tests enable row level security;
alter table public.class_test_history enable row level security;
alter table public.lab_course_config enable row level security;
alter table public.lab_sessions enable row level security;
alter table public.lab_assessment_types enable row level security;
alter table public.lab_assessment_items enable row level security;
alter table public.lab_activity_assignments enable row level security;
alter table public.academic_events enable row level security;
alter table public.notifications enable row level security;
alter table public.audit_logs enable row level security;

-- No public/anon policies: unauthorized visitors receive zero protected rows.
drop policy if exists faculty_read_authenticated on public.faculty;
drop policy if exists faculty_admin_write on public.faculty;
drop policy if exists allowed_admin_only on public.allowed_users;
drop policy if exists profiles_read on public.profiles;
drop policy if exists profiles_admin_write on public.profiles;
drop policy if exists terms_read on public.academic_terms;
drop policy if exists terms_admin_write on public.academic_terms;
drop policy if exists weeks_read on public.academic_weeks;
drop policy if exists weeks_admin_write on public.academic_weeks;
drop policy if exists courses_read on public.courses;
drop policy if exists courses_admin_write on public.courses;
drop policy if exists course_faculty_read on public.course_faculty;
drop policy if exists course_faculty_admin_write on public.course_faculty;
drop policy if exists assignments_read on public.primary_assignments;
drop policy if exists assignments_admin_write on public.primary_assignments;
drop policy if exists task_status_read on public.task_statuses;
drop policy if exists task_status_insert on public.task_statuses;
drop policy if exists task_status_update on public.task_statuses;
drop policy if exists deadlines_read on public.task_deadlines;
drop policy if exists deadlines_admin_write on public.task_deadlines;
drop policy if exists class_tests_read on public.class_tests;
drop policy if exists class_tests_admin_write on public.class_tests;
drop policy if exists class_test_history_read on public.class_test_history;
drop policy if exists class_test_history_admin_write on public.class_test_history;
drop policy if exists lab_config_read on public.lab_course_config;
drop policy if exists lab_config_admin_write on public.lab_course_config;
drop policy if exists lab_sessions_read on public.lab_sessions;
drop policy if exists lab_sessions_admin_write on public.lab_sessions;
drop policy if exists lab_assessment_types_read on public.lab_assessment_types;
drop policy if exists lab_assessment_types_admin_write on public.lab_assessment_types;
drop policy if exists lab_assessment_items_read on public.lab_assessment_items;
drop policy if exists lab_assessment_items_admin_write on public.lab_assessment_items;
drop policy if exists lab_activity_assignments_read on public.lab_activity_assignments;
drop policy if exists lab_activity_assignments_admin_write on public.lab_activity_assignments;
drop policy if exists academic_events_read on public.academic_events;
drop policy if exists academic_events_admin_write on public.academic_events;
drop policy if exists notifications_read on public.notifications;
drop policy if exists notifications_admin_write on public.notifications;
drop policy if exists audit_admin_read on public.audit_logs;
create policy faculty_read_authenticated on public.faculty for select using (public.has_active_profile());
create policy faculty_admin_write on public.faculty for all using (public.is_admin()) with check (public.is_admin());
create policy allowed_admin_only on public.allowed_users for all using (public.is_admin()) with check (public.is_admin());
create policy profiles_read on public.profiles for select using (user_id=auth.uid() or public.is_admin());
create policy profiles_admin_write on public.profiles for update using (public.is_admin()) with check (public.is_admin());
create policy terms_read on public.academic_terms for select using (public.has_active_profile());
create policy terms_admin_write on public.academic_terms for all using (public.is_admin()) with check (public.is_admin());
create policy weeks_read on public.academic_weeks for select using (public.has_active_profile());
create policy weeks_admin_write on public.academic_weeks for all using (public.is_admin()) with check (public.is_admin());
create policy courses_read on public.courses for select using (public.is_admin() or (public.has_active_profile() and active and status='published'));
create policy courses_admin_write on public.courses for all using (public.is_admin()) with check (public.is_admin());
create policy course_faculty_read on public.course_faculty for select using (public.can_access_course(course_id));
create policy course_faculty_admin_write on public.course_faculty for all using (public.is_admin()) with check (public.is_admin());
create policy assignments_read on public.primary_assignments for select using (public.can_access_course(course_id));
create policy assignments_admin_write on public.primary_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy task_status_read on public.task_statuses for select using (public.can_access_course(course_id));
create policy task_status_insert on public.task_statuses for insert with check (public.is_admin() or (public.can_access_course(course_id) and public.assignee_for_task(course_id,task_key)=public.current_faculty_id()));
create policy task_status_update on public.task_statuses for update using (public.is_admin() or (public.can_access_course(course_id) and public.assignee_for_task(course_id,task_key)=public.current_faculty_id())) with check (public.is_admin() or (public.can_access_course(course_id) and public.assignee_for_task(course_id,task_key)=public.current_faculty_id()));
create policy deadlines_read on public.task_deadlines for select using (public.can_access_course(course_id));
create policy deadlines_admin_write on public.task_deadlines for all using (public.is_admin()) with check (public.is_admin());
create policy class_tests_read on public.class_tests for select using (public.can_access_course(course_id));
create policy class_tests_admin_write on public.class_tests for all using (public.is_admin()) with check (public.is_admin());
create policy class_test_history_read on public.class_test_history for select using (public.has_active_profile());
create policy class_test_history_admin_write on public.class_test_history for all using (public.is_admin()) with check (public.is_admin());
create policy lab_config_read on public.lab_course_config for select using (public.can_access_course(course_id));
create policy lab_config_admin_write on public.lab_course_config for all using (public.is_admin()) with check (public.is_admin());
create policy lab_sessions_read on public.lab_sessions for select using (public.can_access_course(course_id));
create policy lab_sessions_admin_write on public.lab_sessions for all using (public.is_admin()) with check (public.is_admin());
create policy lab_assessment_types_read on public.lab_assessment_types for select using (public.can_access_course(course_id));
create policy lab_assessment_types_admin_write on public.lab_assessment_types for all using (public.is_admin()) with check (public.is_admin());
create policy lab_assessment_items_read on public.lab_assessment_items for select using (public.can_access_course(course_id));
create policy lab_assessment_items_admin_write on public.lab_assessment_items for all using (public.is_admin()) with check (public.is_admin());
create policy lab_activity_assignments_read on public.lab_activity_assignments for select using (
  public.is_admin()
  or exists(select 1 from public.lab_sessions s where s.id=lab_session_id and public.can_access_course(s.course_id))
  or exists(select 1 from public.lab_assessment_items i where i.id=assessment_item_id and public.can_access_course(i.course_id))
);
create policy lab_activity_assignments_admin_write on public.lab_activity_assignments for all using (public.is_admin()) with check (public.is_admin());
create policy academic_events_read on public.academic_events for select using (course_id is null or public.can_access_course(course_id));
create policy academic_events_admin_write on public.academic_events for all using (public.is_admin()) with check (public.is_admin());
create policy notifications_read on public.notifications for select using (public.is_admin() or faculty_id is null or faculty_id=public.current_faculty_id());
create policy notifications_admin_write on public.notifications for all using (public.is_admin()) with check (public.is_admin());
create policy audit_admin_read on public.audit_logs for select using (public.is_admin());

-- Harden helper function execution to authenticated users only.
revoke all on function public.has_active_profile() from public;
revoke all on function public.current_faculty_id() from public;
revoke all on function public.is_admin() from public;
revoke all on function public.assignee_for_task(uuid,text) from public;
revoke all on function public.can_access_course(uuid) from public;
revoke all on function public.enforce_bme_auth_email() from public;
revoke all on function public.claim_allowed_profile() from public;
grant execute on function public.has_active_profile() to authenticated;
grant execute on function public.current_faculty_id() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.assignee_for_task(uuid,text) to authenticated;
grant execute on function public.can_access_course(uuid) to authenticated;
grant execute on function public.claim_allowed_profile() to authenticated;
