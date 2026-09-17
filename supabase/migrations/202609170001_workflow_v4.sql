-- Apply after schema.sql and activity_tracker_v3_migration.sql, on a backup-tested database.
-- This migration preserves existing IDs and academic history. Never re-run the old seed.
begin;
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table if not exists public.workflow_migrations(version text primary key, applied_at timestamptz default now());
alter table public.workflow_migrations enable row level security;
alter table public.courses drop constraint if exists courses_course_code_key;
create unique index if not exists courses_term_code_v4 on public.courses(term_id,course_code) where term_id is not null;
alter table public.class_tests add column if not exists marking_due_date date;
alter table public.class_tests add column if not exists publication_due_date date;
alter table public.class_tests add column if not exists duration_minutes integer not null default 30 check(duration_minutes between 1 and 480);

do $$declare t text;begin
  foreach t in array array['task_statuses','class_tests','sessional_sessions','assessment_instances','course_outline_statuses','feedback_statuses','course_file_statuses','sessional_grade_statuses'] loop
    execute format('alter table public.%I add column if not exists evidence_url text',t);
    execute format('alter table public.%I add column if not exists revision integer not null default 1',t);
    execute format('alter table public.%I add column if not exists notes text not null default %L',t,'');
  end loop;
end $$;

create or replace function public.has_active_profile() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
 join public.allowed_users a on lower(a.email)=lower(u.email) and a.faculty_id=p.faculty_id
 where p.user_id=auth.uid() and p.active and a.active and u.email_confirmed_at is not null
 and not coalesce((to_jsonb(u)->>'is_anonymous')::boolean,false));
$$;
create or replace function public.current_faculty_id() returns uuid
language sql stable security definer set search_path='' as $$
 select p.faculty_id from public.profiles p where p.user_id=auth.uid() and public.has_active_profile();
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_active_profile() and exists(select 1 from public.profiles p join auth.users u on u.id=p.user_id
 join public.allowed_users a on lower(a.email)=lower(u.email) and a.faculty_id=p.faculty_id
 where p.user_id=auth.uid() and a.app_role in ('admin','hod'));
$$;
create or replace function public.can_manage_course(p_course uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_active_profile() and (public.is_admin() or exists(select 1 from public.course_faculty cf
 where cf.course_id=p_course and cf.faculty_id=public.current_faculty_id() and cf.role in ('coordinator','sessional_coordinator')));
$$;
create or replace function public.can_access_course(p_course uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.has_active_profile() and (public.is_admin() or exists(select 1 from public.courses c where c.id=p_course and c.status in ('published','archived') and (
 public.can_manage_course(c.id)
 or exists(select 1 from public.course_faculty cf where cf.course_id=c.id and cf.faculty_id=public.current_faculty_id())
 or exists(select 1 from public.primary_assignments a where a.course_id=c.id and public.current_faculty_id() in (a.preparer_a,a.preparer_b,a.moderator_1,a.moderator_2,a.scrutinizer))
 or exists(select 1 from public.sessional_grade_assignments a where a.course_id=c.id and public.current_faculty_id() in (a.preparer,a.scrutinizer))
 or exists(select 1 from public.class_tests a where a.course_id=c.id and coalesce(a.responsible_faculty,a.responsible_faculty_id)=public.current_faculty_id())
 or exists(select 1 from public.sessional_sessions a where a.course_id=c.id and a.assigned_faculty=public.current_faculty_id())
 or exists(select 1 from public.assessment_instances a where a.course_id=c.id and a.responsible_faculty=public.current_faculty_id())
 or exists(select 1 from public.course_outline_statuses a where a.course_id=c.id and a.responsible_faculty=public.current_faculty_id())
 or exists(select 1 from public.feedback_statuses a where a.course_id=c.id and a.responsible_faculty=public.current_faculty_id())
 or exists(select 1 from public.course_file_statuses a where a.course_id=c.id and a.responsible_faculty=public.current_faculty_id())
 )));
$$;
-- Internal assignment resolver never exposed as an unrestricted data API.
create or replace function private.task_owner(cid uuid,k text) returns uuid language sql stable security definer set search_path='' as $$
 select case k when 'question_prep_a' then preparer_a when 'question_prep_b' then preparer_b
 when 'moderation_1' then moderator_1 when 'moderation_2' then moderator_2
 when 'examination_a' then preparer_a when 'examination_b' then preparer_b
 when 'scrutiny' then scrutinizer when 'gradesheet_prep' then preparer_a when 'gradesheet_scrutiny' then scrutinizer end
 from public.primary_assignments where course_id=cid;
$$;
create or replace function public.assignee_for_task(p_course uuid,p_task text) returns uuid
language sql stable security definer set search_path='' as $$
 select private.task_owner(p_course,p_task) where public.can_access_course(p_course);
$$;

-- Remove every old policy on canonical course data; permissive policies otherwise OR together.
do $$declare t text;p record;begin
 foreach t in array array['courses','course_sections','course_faculty','primary_assignments','task_statuses','task_deadlines','class_tests','class_test_history','sessional_course_configs','sessional_sessions','assessment_components','assessment_instances','sessional_grade_assignments','sessional_grade_statuses','course_outline_statuses','feedback_statuses','course_file_statuses','academic_events','notifications','term_milestones','lab_course_config','lab_sessions','lab_assessment_types','lab_assessment_items','lab_activity_assignments'] loop
  for p in select policyname from pg_policies where schemaname='public' and tablename=t loop execute format('drop policy %I on public.%I',p.policyname,t);end loop;
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke insert,update,delete on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  if t='courses' then execute 'create policy workflow_read on public.courses for select to authenticated using(public.can_access_course(id))';
  elsif t='class_test_history' then execute 'create policy workflow_read on public.class_test_history for select to authenticated using(exists(select 1 from public.class_tests c where c.id=class_test_id and public.can_access_course(c.course_id)))';
  elsif t='notifications' then execute 'create policy workflow_read on public.notifications for select to authenticated using(public.has_active_profile() and (faculty_id=public.current_faculty_id() or faculty_id is null))';
  elsif t='term_milestones' then execute 'create policy workflow_read on public.term_milestones for select to authenticated using(public.has_active_profile() and (course_id is null or public.can_access_course(course_id)))';
  elsif t='academic_events' then execute 'create policy workflow_read on public.academic_events for select to authenticated using(public.has_active_profile() and (course_id is null or public.can_access_course(course_id)))';
  elsif t='lab_activity_assignments' then execute 'create policy workflow_read on public.lab_activity_assignments for select to authenticated using(public.is_admin())';
  else execute format('create policy workflow_read on public.%I for select to authenticated using(public.can_access_course(course_id))',t);
  end if;
 end loop;
end $$;
revoke insert,update,delete on public.faculty,public.allowed_users,public.profiles,public.academic_terms,public.academic_weeks,public.audit_logs from anon,authenticated;

create table if not exists public.notification_receipts(
 notification_id uuid references public.notifications(id) on delete cascade,
 user_id uuid references auth.users(id) on delete cascade, read_at timestamptz default now(),primary key(notification_id,user_id));
alter table public.notification_receipts enable row level security;
create policy receipts_read on public.notification_receipts for select to authenticated using(user_id=auth.uid() and public.has_active_profile());
create policy receipts_insert on public.notification_receipts for insert to authenticated with check(user_id=auth.uid() and public.has_active_profile() and exists(select 1 from public.notifications n where n.id=notification_id));
grant select,insert on public.notification_receipts to authenticated;

create table if not exists public.notification_outbox(
 id uuid primary key default gen_random_uuid(),dedupe_key text not null unique,faculty_id uuid not null references public.faculty(id),
 title text not null,body text not null,course_id uuid references public.courses(id),
 status text not null default 'pending' check(status in ('pending','sending','sent','failed','cancelled')),
 attempts integer not null default 0, available_at timestamptz default now(),locked_at timestamptz,sent_at timestamptz,last_error text,created_at timestamptz default now());
alter table public.notification_outbox enable row level security;
create policy outbox_admin_read on public.notification_outbox for select to authenticated using(public.is_admin());
grant select on public.notification_outbox to authenticated;
revoke all on public.notification_outbox from anon;

create or replace function private.queue_notice(fid uuid,cid uuid,title text,body text,event_key text) returns void
language plpgsql security definer set search_path='' as $$begin
 if fid is null then return;end if;
 insert into public.notification_outbox(dedupe_key,faculty_id,course_id,title,body) values(event_key,fid,cid,title,body) on conflict(dedupe_key) do nothing;
 if found then insert into public.notifications(faculty_id,title,body,related_type,related_id) values(fid,title,body,'course',cid);end if;
end $$;
create or replace function private.assert_editable(cid uuid) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.has_active_profile() then raise exception 'An approved, verified BME account is required.' using errcode='42501';end if;
 if not exists(select 1 from public.courses c join public.academic_terms t on t.id=c.term_id where c.id=cid and c.active and c.status<>'archived' and t.active) then raise exception 'This course or term is archived. An administrator must reopen it first.';end if;
 if not public.can_access_course(cid) then raise exception 'You do not have access to this course.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
end $$;

-- One transaction for every activity change, optimistic concurrency, field-level ownership.
create or replace function public.workflow_save_activity(p_kind text,p_course uuid,p_id uuid default null,p_task text default null,p_patch jsonb default '{}'::jsonb,p_expected integer default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare tbl text;oldrow jsonb;newrow jsonb;owner uuid;target_owner uuid;owner_col text;identity_where text;
 k text;allowed text[];set_sql text:='';row_id uuid;can_manage boolean;result jsonb;is_new boolean; old_status text;
begin
 perform private.assert_editable(p_course);can_manage:=public.can_manage_course(p_course);
 tbl:=case p_kind when 'theory' then 'task_statuses' when 'ct' then 'class_tests' when 'session' then 'sessional_sessions'
 when 'assessment' then 'assessment_instances' when 'outline' then 'course_outline_statuses' when 'feedback' then 'feedback_statuses'
 when 'car' then 'course_file_statuses' when 'grade' then 'sessional_grade_statuses' end;
 if tbl is null then raise exception 'Unknown activity type';end if;
 if p_patch is null or jsonb_typeof(p_patch)<>'object' then raise exception 'Expected a change object';end if;
 perform set_config('workflow.change_reason',coalesce(p_patch->>'change_reason',''),true);
 p_patch:=p_patch-'change_reason';
 if p_kind='theory' and p_task not in ('question_prep_a','question_prep_b','moderation_1','moderation_2','examination_a','examination_b','scrutiny','gradesheet_prep','gradesheet_scrutiny') then raise exception 'Invalid theory task';end if;
 identity_where:=case when p_kind in ('theory','grade') then format('course_id=%L::uuid and task_key=%L',p_course,p_task)
 when p_kind in ('outline','feedback','car') then format('course_id=%L::uuid',p_course) else format('id=%L::uuid and course_id=%L::uuid',p_id,p_course) end;
 execute format('select to_jsonb(r) from public.%I r where %s for update',tbl,identity_where) into oldrow;
 is_new:=oldrow is null;old_status:=oldrow->>'status';
 if p_expected is distinct from (oldrow->>'revision')::integer then raise exception 'This item changed. Refresh and review the latest version before saving.' using errcode='40001';end if;
 owner_col:=case when p_kind='session' then 'assigned_faculty' else 'responsible_faculty' end;
 if p_kind='theory' then owner:=private.task_owner(p_course,p_task);
 elsif p_kind='grade' then
  if p_task not in ('sessional_gradesheet_prep','sessional_gradesheet_scrutiny') then raise exception 'Invalid gradesheet task';end if;
  select case p_task when 'sessional_gradesheet_prep' then preparer else scrutinizer end into owner from public.sessional_grade_assignments where course_id=p_course;
 else owner:=coalesce(oldrow->>owner_col,oldrow->>'responsible_faculty_id')::uuid;end if;
 if not can_manage and owner is distinct from public.current_faculty_id() then raise exception 'Only the assigned owner can update this activity' using errcode='42501';end if;
 if not is_new and public.is_admin() and owner is distinct from public.current_faculty_id() and coalesce(current_setting('workflow.change_reason',true),'')='' then raise exception 'An administrative correction requires a reason';end if;
 allowed:=array['status','notes','evidence_url'];
 if p_kind='ct' then allowed:=allowed||array['title','ct_number','scheduled_date','scheduled_time','duration_minutes','marking_due_date','publication_due_date','section','batch','syllabus','responsible_faculty'];
 elsif p_kind='session' then allowed:=allowed||array['title','date','scheduled_time','section','scope','assigned_faculty','report_required','report_deadline','session_no'];
 elsif p_kind='assessment' then allowed:=allowed||array['title','scheduled_date','due_date','scope','responsible_faculty'];
 elsif p_kind='outline' then allowed:=allowed||array['due_date','responsible_faculty'];
 elsif p_kind in ('feedback','car') then allowed:=allowed||array['deadline','responsible_faculty'];
 elsif p_kind='grade' then allowed:=allowed||array['due_date'];end if;
 if jsonb_typeof(p_patch)<>'object' then raise exception 'Expected an object';end if;
 for k in select jsonb_object_keys(p_patch) loop
  if not k=any(allowed) then raise exception 'Field % is not editable',k;end if;
  if k=owner_col then
   if not can_manage then raise exception 'Only a course teacher or administrator may assign work.' using errcode='42501';end if;
  elsif k in ('status','notes','evidence_url') then
   if not public.is_admin() and owner is distinct from public.current_faculty_id() and not(is_new and can_manage and (not(p_patch?'status') or p_patch->>'status' in ('not_started','not_planned','scheduled'))) then
    if oldrow->k is distinct from p_patch->k then raise exception 'Only the assigned owner can update this work.' using errcode='42501';end if;
   end if;
  elsif not can_manage and not ((p_kind='ct' and k in ('scheduled_date','scheduled_time','duration_minutes')) or (p_kind='session' and k='date')) then
   if oldrow->k is distinct from p_patch->k then raise exception 'A coordinator must approve setup or deadline changes' using errcode='42501';end if;
  end if;
 end loop;
 if is_new and p_kind not in ('theory','grade') and not can_manage then raise exception 'Only a course teacher may create activities.';end if;
 if is_new and p_kind in ('theory','grade') and owner is distinct from public.current_faculty_id() and not public.is_admin() then raise exception 'This task is assigned to another teacher.';end if;
 target_owner:=case when p_patch?owner_col then nullif(p_patch->>owner_col,'')::uuid else owner end;
 if p_kind not in ('theory','grade') and target_owner is not null and not exists(select 1 from public.course_faculty where course_id=p_course and faculty_id=target_owner) then raise exception 'Choose a teacher assigned to this course.';end if;
 if nullif(p_patch->>'evidence_url','') is not null and p_patch->>'evidence_url' !~ '^https://' then raise exception 'Evidence must be an HTTPS link.';end if;
 if p_kind='grade' and p_task='sessional_gradesheet_scrutiny' and p_patch->>'status'='completed' and not exists(select 1 from public.sessional_grade_statuses where course_id=p_course and task_key='sessional_gradesheet_prep' and status='completed') then raise exception 'Complete gradesheet preparation first.';end if;
 if not is_new and p_patch?'status' and private.activity_done(p_kind,old_status,oldrow) and not private.activity_done(p_kind,p_patch->>'status',oldrow) then
  if not public.is_admin() or coalesce(current_setting('workflow.change_reason',true),'')='' then raise exception 'Reopening requires an administrator and a reason';end if;
  if p_kind='theory' and exists(select 1 from public.task_statuses s where s.course_id=p_course and s.status='completed' and p_task=any(private.task_dependencies(s.task_key))) then raise exception 'Reopen downstream completed work first';end if;
  if p_kind='grade' and p_task='sessional_gradesheet_prep' and exists(select 1 from public.sessional_grade_statuses where course_id=p_course and task_key='sessional_gradesheet_scrutiny' and status='completed') then raise exception 'Reopen gradesheet scrutiny first';end if;
 end if;
 if not is_new and p_kind in ('ct','session','assessment','outline','feedback','car','grade') and exists(select 1 from jsonb_each(p_patch) e where e.key in ('scheduled_date','scheduled_time','date','due_date','deadline','marking_due_date','publication_due_date','report_deadline') and oldrow->e.key is distinct from e.value and oldrow->>e.key is not null) and coalesce(current_setting('workflow.change_reason',true),'')='' then raise exception 'Schedule and deadline changes require a reason';end if;
 if is_new then
  if p_kind in ('theory','grade') then execute format('insert into public.%I(course_id,task_key) values($1,$2)',tbl) using p_course,p_task;
  elsif p_kind in ('outline','feedback','car') then execute format('insert into public.%I(course_id,term_id) select id,term_id from public.courses where id=$1',tbl) using p_course;
  elsif p_kind='ct' then
   insert into public.class_tests(course_id,term_id,title,ct_number) select id,term_id,coalesce(p_patch->>'title','Class test'),(p_patch->>'ct_number')::integer from public.courses where id=p_course returning id into row_id;
  elsif p_kind='session' then
   insert into public.sessional_sessions(course_id,term_id,title,session_no) select id,term_id,coalesce(p_patch->>'title','Session'),(p_patch->>'session_no')::integer from public.courses where id=p_course returning id into row_id;
  else raise exception 'Generate assessments from a component first.';end if;
  if row_id is not null then identity_where:=format('id=%L::uuid',row_id);end if;
 end if;
 -- jsonb_populate_record performs native typed conversion; identifiers are allowlisted above.
 for k in select jsonb_object_keys(p_patch) loop
  set_sql:=set_sql||format('%I=(jsonb_populate_record(null::public.%I,$1)).%I,',k,tbl,k);
 end loop;
 if p_kind='ct' then
  if p_patch?'scheduled_date' then set_sql:=set_sql||'date=($1->>''scheduled_date'')::date,';end if;
  if p_patch?'scheduled_time' then set_sql:=set_sql||'time=($1->>''scheduled_time'')::time,';end if;
  if p_patch?'responsible_faculty' then set_sql:=set_sql||'responsible_faculty_id=($1->>''responsible_faculty'')::uuid,';end if;
 end if;
 if p_kind in ('theory','grade') then set_sql:=set_sql||'updated_by=auth.uid(),completed_at=case when $1->>''status''=''completed'' then coalesce(completed_at,now()) when $1?''status'' then null else completed_at end,';end if;
 execute format('update public.%I set %s revision=revision+1,updated_at=now() where %s returning to_jsonb(%I.*)',tbl,set_sql,identity_where,tbl) into result using p_patch;
 if p_kind='ct' then
  if (result->>'ct_number')::integer<1 then raise exception 'CT number must be positive';end if;
  if exists(select 1 from public.class_tests where course_id=p_course and ct_number=(result->>'ct_number')::integer and coalesce(section,'X')=coalesce(result->>'section','X') and id<>(result->>'id')::uuid) then raise exception 'This CT number already exists for that section.';end if;
  perform pg_advisory_xact_lock(hashtextextended((select term_id::text from public.courses where id=p_course)||':ct-calendar',0));
  -- A cohort and time are needed to enforce overlap; incomplete schedules remain visible.
  if nullif(result->>'batch','') is not null and nullif(result->>'scheduled_time','') is not null and exists(
   select 1 from public.class_tests ct join public.courses c on c.id=ct.course_id
   where ct.id<>(result->>'id')::uuid and c.term_id=(select term_id from public.courses where id=p_course)
   and ct.batch=result->>'batch' and (coalesce(ct.section,'Entire Course') in ('X','All','Entire Course','') or coalesce(result->>'section','Entire Course') in ('X','All','Entire Course','') or ct.section=result->>'section')
   and coalesce(ct.scheduled_date,ct.date)=(result->>'scheduled_date')::date and ct.status not in ('cancelled','postponed')
   and (result->>'status') not in ('cancelled','postponed')
   and coalesce(ct.scheduled_time,ct.time)<(result->>'scheduled_time')::time+make_interval(mins=>(result->>'duration_minutes')::integer)
   and (result->>'scheduled_time')::time<coalesce(ct.scheduled_time,ct.time)+make_interval(mins=>ct.duration_minutes)) then raise exception 'Another CT overlaps this batch and section. Choose another time.';end if;
 end if;
 return result;
end $$;

create or replace function public.workflow_department(p_term uuid) returns jsonb
language plpgsql stable security definer set search_path='' as $$declare result jsonb;begin
 if not public.has_active_profile() then raise exception 'Approved account required' using errcode='42501';end if;
 select jsonb_build_object('courses',coalesce(jsonb_agg(jsonb_build_object('id',c.id,'course_code',c.course_code,'title',c.title,'course_type',c.course_type,'batch',c.batch)),'[]'::jsonb)) into result from public.courses c where c.term_id=p_term and c.status='published';
 return result||jsonb_build_object('calendar',coalesce((select jsonb_agg(x) from (
  select ct.id,c.course_code,ct.title,coalesce(ct.scheduled_date,ct.date) as date,coalesce(ct.scheduled_time,ct.time) as time,ct.section,ct.status,'Class test' as kind from public.class_tests ct join public.courses c on c.id=ct.course_id where c.term_id=p_term and c.status='published'
  union all select s.id,c.course_code,s.title,s.date,s.scheduled_time,s.section,s.status,'Session' from public.sessional_sessions s join public.courses c on c.id=s.course_id where c.term_id=p_term and c.status='published'
  union all select a.id,c.course_code,a.title,coalesce(a.scheduled_date,a.due_date),null::time,a.scope,a.status,'Assessment' from public.assessment_instances a join public.courses c on c.id=a.course_id where c.term_id=p_term and c.status='published'
 )x where x.date is not null),'[]'::jsonb),'progress',coalesce((select jsonb_agg(x) from (
 select c.course_code,c.course_type,
 (select count(*) from public.class_tests a where a.course_id=c.id and a.status not in ('cancelled')) as ct_total,
 (select count(*) from public.class_tests a where a.course_id=c.id and a.status in ('marks_published','completed')) as ct_complete,
 (select count(*) from public.assessment_instances a where a.course_id=c.id and a.status<>'cancelled') as assessment_total,
 (select count(*) from public.assessment_instances a where a.course_id=c.id and a.status in ('marks_uploaded','completed')) as assessment_complete,
 (select count(*) from public.task_statuses a where a.course_id=c.id and a.status='completed') as theory_complete
 from public.courses c where c.term_id=p_term and c.status='published')x),'[]'::jsonb));
end $$;

-- Server-side sessional generation preserves IDs and refuses destructive reduction.
create or replace function public.workflow_generate(p_course uuid,p_kind text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$declare n integer;qty integer;comp uuid;r record;begin
 perform private.assert_editable(p_course);if not public.can_manage_course(p_course) then raise exception 'Assigned course teacher required';end if;
 if (select lower(course_type) from public.courses where id=p_course) not in ('sessional','lab') then raise exception 'Choose a sessional course';end if;
 qty:=(p_payload->>'quantity')::integer;if qty is null or qty<1 or qty>100 then raise exception 'Quantity must be 1–100';end if;
 if p_kind='sessions' then
  if exists(select 1 from public.sessional_sessions where course_id=p_course and session_no>qty and status<>'cancelled') then raise exception 'Cancel the extra sessions explicitly before reducing the count.';end if;
  insert into public.sessional_course_configs(course_id,session_count,config_status) values(p_course,qty,'configured') on conflict(course_id) do update set session_count=excluded.session_count,config_status='configured',version=public.sessional_course_configs.version+1;
  for n in 1..qty loop
   if not exists(select 1 from public.sessional_sessions where course_id=p_course and session_no=n and coalesce(section,'')=coalesce(p_payload->>'scope','')) then
    insert into public.sessional_sessions(course_id,term_id,session_no,title,section,scope,assigned_faculty)
    select id,term_id,n,'Session '||lpad(n::text,2,'0'),p_payload->>'scope',coalesce(p_payload->>'scope','Entire Course'),nullif(p_payload->>'owner','')::uuid from public.courses where id=p_course;
   end if;
  end loop;
 elsif p_kind='component' then
  if (p_payload->>'marks_each')::numeric<0 or (p_payload->>'counted_quantity')::integer not between 0 and qty then raise exception 'Check marks and counted quantity';end if;
  insert into public.assessment_components(course_id,name,quantity,marks_each,counted_quantity,scope,responsible_faculty)
  values(p_course,p_payload->>'name',qty,(p_payload->>'marks_each')::numeric,(p_payload->>'counted_quantity')::integer,coalesce(p_payload->>'scope','Entire Course'),nullif(p_payload->>'owner','')::uuid) returning id into comp;
  for n in 1..qty loop
   insert into public.assessment_instances(course_id,component_id,sequence_number,title,scope,responsible_faculty,status)
   values(p_course,comp,n,(p_payload->>'name')||' '||lpad(n::text,2,'0'),coalesce(p_payload->>'scope','Entire Course'),nullif(p_payload->>'owner','')::uuid,'not_started');
  end loop;
 else raise exception 'Unknown configuration';end if;
 if nullif(p_payload->>'owner','') is not null and not exists(select 1 from public.course_faculty where course_id=p_course and faculty_id=(p_payload->>'owner')::uuid) then raise exception 'Owner must teach this course';end if;
end $$;

-- A single account mapping procedure; revocation takes effect on every authorized request.
create or replace function public.workflow_faculty(p_id uuid,p_name text,p_email text,p_role text,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$declare fid uuid;begin
 if not public.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if p_email !~* '^[^@[:space:]]+@bme\.buet\.ac\.bd$' or p_role not in ('faculty','admin','hod') then raise exception 'Use a BME address and valid role';end if;
 if p_id=public.current_faculty_id() and (not p_active or p_role not in ('admin','hod')) then raise exception 'Ask another administrator to change your own access.';end if;
 fid:=coalesce(p_id,gen_random_uuid());
 insert into public.faculty(id,full_name,email) values(fid,trim(p_name),lower(trim(p_email))) on conflict(id) do update set full_name=excluded.full_name,email=excluded.email;
 delete from public.allowed_users where faculty_id=fid and lower(email)<>lower(trim(p_email));
 insert into public.allowed_users(email,faculty_id,app_role,active) values(lower(trim(p_email)),fid,p_role,p_active)
 on conflict(email) do update set faculty_id=excluded.faculty_id,app_role=excluded.app_role,active=excluded.active;
 update public.profiles set active=false where faculty_id=fid;
 update public.profiles p set active=p_active,app_role=p_role from auth.users u where u.id=p.user_id and lower(u.email)=lower(trim(p_email)) and p.faculty_id=fid;
 return fid;
end $$;

create or replace function public.workflow_term(p_id uuid,p_patch jsonb) returns uuid
language plpgsql security definer set search_path='' as $$declare tid uuid;begin
 if not public.is_admin() then raise exception 'Administrator required';end if;
 tid:=coalesce(p_id,gen_random_uuid());
 if p_id is null then
  if nullif(trim(p_patch->>'name'),'') is null then raise exception 'Term name required';end if;
  insert into public.academic_terms(id,name,total_teaching_weeks,latest_completed_week,active) values(tid,trim(p_patch->>'name'),coalesce((p_patch->>'total_teaching_weeks')::integer,14),0,false);
 else
  if (p_patch->>'active')::boolean then update public.academic_terms set active=false where id<>tid;end if;
  update public.academic_terms set name=coalesce(p_patch->>'name',name),total_teaching_weeks=coalesce((p_patch->>'total_teaching_weeks')::integer,total_teaching_weeks),latest_completed_week=coalesce((p_patch->>'latest_completed_week')::integer,latest_completed_week),calendar_status=coalesce(p_patch->>'calendar_status',calendar_status),pause_reason=coalesce(p_patch->>'pause_reason',pause_reason),active=coalesce((p_patch->>'active')::boolean,active),updated_at=now() where id=tid;
 end if;return tid;
end $$;

create or replace function public.workflow_course(p_id uuid,p_term uuid,p_patch jsonb,p_teachers uuid[],p_assignments jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$declare cid uuid;fid uuid;begin
 if not public.is_admin() then raise exception 'Administrator required';end if;
 if not exists(select 1 from public.academic_terms where id=p_term) then raise exception 'Choose a term';end if;
 cid:=coalesce(p_id,gen_random_uuid());perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if p_id is null then
  insert into public.courses(id,course_code,title,course_type,term_id,term,status) select cid,regexp_replace(trim(p_patch->>'course_code'),'\s+',' ','g'),p_patch->>'title',p_patch->>'course_type',id,name,'draft' from public.academic_terms where id=p_term;
 else
  update public.courses set title=coalesce(p_patch->>'title',title),batch=p_patch->>'batch',question_deadline=nullif(p_patch->>'question_deadline','')::date,exam_date=nullif(p_patch->>'exam_date','')::date,final_gradesheet_deadline=nullif(p_patch->>'final_gradesheet_deadline','')::date where id=cid and term_id=p_term;
  if not found then raise exception 'Course not in selected term';end if;
 end if;
 -- Do not delete section-specific links. Add new teachers and remove only explicitly deselected teachers.
 delete from public.course_faculty where course_id=cid and not(faculty_id=any(p_teachers));
 foreach fid in array p_teachers loop
  if not exists(select 1 from public.course_faculty where course_id=cid and faculty_id=fid) then insert into public.course_faculty(course_id,faculty_id) values(cid,fid);end if;
 end loop;
 if (select lower(course_type) from public.courses where id=cid)='theory' then
  insert into public.primary_assignments(course_id,preparer_a,preparer_b,moderator_1,moderator_2,scrutinizer)
  values(cid,nullif(p_assignments->>'preparer_a','')::uuid,nullif(p_assignments->>'preparer_b','')::uuid,nullif(p_assignments->>'moderator_1','')::uuid,nullif(p_assignments->>'moderator_2','')::uuid,nullif(p_assignments->>'scrutinizer','')::uuid)
  on conflict(course_id) do update set preparer_a=excluded.preparer_a,preparer_b=excluded.preparer_b,moderator_1=excluded.moderator_1,moderator_2=excluded.moderator_2,scrutinizer=excluded.scrutinizer;
 else
  insert into public.sessional_grade_assignments(course_id,preparer,scrutinizer) values(cid,nullif(p_assignments->>'preparer','')::uuid,nullif(p_assignments->>'scrutinizer','')::uuid)
  on conflict(course_id) do update set preparer=excluded.preparer,scrutinizer=excluded.scrutinizer;
 end if;
 insert into public.course_outline_statuses(course_id,term_id) values(cid,p_term) on conflict do nothing;
 insert into public.feedback_statuses(course_id,term_id) values(cid,p_term) on conflict do nothing;
 insert into public.course_file_statuses(course_id,term_id) values(cid,p_term) on conflict do nothing;
 if p_patch?'status' then update public.courses set status=p_patch->>'status' where id=cid;end if;
 return cid;
end $$;

-- Explicitly grant only reviewed endpoints. Trigger/helper functions are not public APIs.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like 'workflow_%' or p.proname in ('has_active_profile','current_faculty_id','is_admin','can_access_course','can_manage_course','assignee_for_task','claim_allowed_profile')) loop
  execute format('revoke all on function %s from public,anon',f.sig);execute format('grant execute on function %s to authenticated',f.sig);
 end loop;
end $$;
insert into public.workflow_migrations(version) values('202609170001') on conflict do nothing;
create policy migration_read on public.workflow_migrations for select to authenticated using(public.has_active_profile());
grant select on public.workflow_migrations to authenticated;
commit;
