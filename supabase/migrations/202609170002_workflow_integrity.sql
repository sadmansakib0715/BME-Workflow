-- v4 completion: explicit coordinators, verified identity, private work,
-- reviewed imports, transactional requests, and retry-safe notification delivery.
begin;
alter table public.allowed_users drop constraint if exists allowed_users_bme_email_check;
alter table public.faculty drop constraint if exists faculty_full_name_key;
alter table public.profiles drop constraint if exists profiles_faculty_id_key;
create unique index profiles_active_faculty on public.profiles(faculty_id) where active;
create unique index approved_identity on public.allowed_users(faculty_id) where active;
alter table public.academic_terms add column code text;
update public.academic_terms set code=id::text where code is null;
alter table public.academic_terms alter column code set not null;
create unique index terms_stable_code on public.academic_terms(code);
alter table public.courses add column revision integer not null default 1;
alter table public.assessment_components add column revision integer not null default 1;
alter table public.assessment_components add constraint component_marks check(marks_each>=0 and counted_quantity between 0 and quantity) not valid;
alter table public.class_tests add constraint positive_ct_number check(ct_number>0) not valid;
create unique index ct_identity_v4 on public.class_tests(course_id,coalesce(section,'Entire Course'),ct_number);
create unique index assessment_identity_v4 on public.assessment_instances(component_id,coalesce(section_id,'00000000-0000-0000-0000-000000000000'::uuid),scope,sequence_number) where component_id is not null;

create or replace function public.enforce_bme_auth_email() returns trigger language plpgsql set search_path='' as $$begin
 if new.email is null or new.email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'A valid email address is required';end if;return new;end $$;
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$begin
 -- Mapping is claimed only after verified login, never from unverified signup metadata.
 if tg_op='UPDATE' and (old.email is distinct from new.email or new.email_confirmed_at is null) then update public.profiles set active=false where user_id=new.id;end if;return new;end $$;
create trigger workflow_auth_changed after update of email,email_confirmed_at on auth.users for each row execute function public.handle_new_user();
create or replace function public.claim_allowed_profile() returns boolean language plpgsql security definer set search_path='' as $$
declare a public.allowed_users%rowtype;mail text;begin
 select lower(email) into mail from auth.users where id=auth.uid() and email_confirmed_at is not null;
 if mail is null then return false;end if;
 select * into a from public.allowed_users where lower(email)=mail and active;
 if not found then update public.profiles set active=false where user_id=auth.uid();return false;end if;
 if exists(select 1 from public.profiles where faculty_id=a.faculty_id and active and user_id<>auth.uid()) then return false;end if;
 insert into public.profiles(user_id,faculty_id,app_role,active) values(auth.uid(),a.faculty_id,a.app_role,true)
 on conflict(user_id) do update set faculty_id=excluded.faculty_id,app_role=excluded.app_role,active=true;
 return public.has_active_profile();end $$;
create or replace function public.sync_allowlist_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 if tg_op in ('DELETE','UPDATE') then update public.profiles set active=false where faculty_id=old.faculty_id;end if;
 if tg_op='DELETE' then return old;end if;
 update public.profiles p set active=new.active,app_role=new.app_role from auth.users u
 where p.user_id=u.id and lower(u.email)=lower(new.email) and p.faculty_id=new.faculty_id and u.email_confirmed_at is not null;
 return new;end $$;
create or replace function public.workflow_faculty(p_id uuid,p_name text,p_email text,p_role text,p_active boolean) returns uuid
language plpgsql security definer set search_path='' as $$declare fid uuid;begin
 if not public.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if nullif(trim(p_name),'') is null or p_email is null or p_email !~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' or p_role is null or p_role not in ('faculty','admin','hod') or p_active is null then raise exception 'Use a name, valid email, role and access setting';end if;
 if p_id=public.current_faculty_id() then raise exception 'Ask another administrator to change your own access';end if;
 fid:=coalesce(p_id,gen_random_uuid());
 if exists(select 1 from public.allowed_users where lower(email)=lower(trim(p_email)) and faculty_id<>fid) then raise exception 'That email is already mapped to another identity';end if;
 update public.profiles set active=false where faculty_id=fid;
 delete from public.allowed_users where faculty_id=fid and lower(email)<>lower(trim(p_email));
 insert into public.faculty(id,full_name,email) values(fid,trim(p_name),lower(trim(p_email))) on conflict(id) do update set full_name=excluded.full_name,email=excluded.email;
 insert into public.allowed_users(email,faculty_id,app_role,active) values(lower(trim(p_email)),fid,p_role,p_active)
 on conflict(email) do update set app_role=excluded.app_role,active=excluded.active;
 return fid;end $$;

create or replace function private.task_dependencies(k text) returns text[] language sql immutable as $$select case k
 when 'moderation_1' then array['question_prep_a','question_prep_b'] when 'moderation_2' then array['question_prep_a','question_prep_b']
 when 'examination_a' then array['moderation_1','moderation_2'] when 'examination_b' then array['moderation_1','moderation_2']
 when 'scrutiny' then array['examination_a','examination_b'] when 'gradesheet_prep' then array['scrutiny'] when 'gradesheet_scrutiny' then array['gradesheet_prep']
 when 'sessional_gradesheet_scrutiny' then array['sessional_gradesheet_prep'] else array[]::text[] end$$;
create or replace function private.activity_done(kind text,status text,row_data jsonb default '{}') returns boolean language sql immutable as $$
 select coalesce(status='completed' or case kind when 'ct' then status='marks_published' when 'assessment' then status='marks_uploaded' when 'outline' then status='shared_with_students' when 'car' then status='uploaded' when 'session' then status='conducted' and not coalesce((row_data->>'report_required')::boolean,false) else false end,false)$$;

-- Details are personal; prerequisite status is returned separately without notes/evidence.
do $$declare t text;owner_expr text;begin
 foreach t in array array['task_statuses','class_tests','sessional_sessions','assessment_instances','course_outline_statuses','feedback_statuses','course_file_statuses','sessional_grade_statuses'] loop
  owner_expr:=case t when 'task_statuses' then 'public.assignee_for_task(course_id,task_key)'
  when 'sessional_sessions' then 'assigned_faculty' when 'class_tests' then 'coalesce(responsible_faculty,responsible_faculty_id)'
  when 'sessional_grade_statuses' then '(select case task_key when ''sessional_gradesheet_prep'' then preparer else scrutinizer end from public.sessional_grade_assignments a where a.course_id=sessional_grade_statuses.course_id)'
  else 'responsible_faculty' end;
  execute format('drop policy workflow_read on public.%I',t);
  execute format('create policy workflow_read on public.%I for select to authenticated using(public.can_access_course(course_id) and (public.can_manage_course(course_id) or %s=public.current_faculty_id()))',t,owner_expr);
 end loop;
end $$;
create or replace function public.workflow_prerequisites(p_term uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$begin
 if not public.has_active_profile() then raise exception 'Approved profile required';end if;
 return jsonb_build_object('theory',coalesce((select jsonb_agg(jsonb_build_object('course_id',s.course_id,'task_key',s.task_key,'status',s.status)) from public.task_statuses s join public.courses c on c.id=s.course_id where c.term_id=p_term and public.can_access_course(c.id)),'[]'::jsonb),
 'grade',coalesce((select jsonb_agg(jsonb_build_object('course_id',s.course_id,'task_key',s.task_key,'status',s.status)) from public.sessional_grade_statuses s join public.courses c on c.id=s.course_id where c.term_id=p_term and public.can_access_course(c.id)),'[]'::jsonb));end $$;

-- Canonicalize legacy-only rows once, preserving IDs. A conflicting identity stops the migration.
insert into public.sessional_course_configs(id,course_id,term_id,session_count,config_status)
 select id,course_id,term_id,0,'setup_required' from public.lab_course_config l where not exists(select 1 from public.sessional_course_configs s where s.course_id=l.course_id);
insert into public.sessional_sessions(id,course_id,term_id,session_no,title,date,section,group_label,assigned_faculty,status,report_required,report_deadline,notes)
 select id,course_id,term_id,session_no,title,date,section,group_label,assigned_faculty,status,report_required,report_deadline,notes from public.lab_sessions l where not exists(select 1 from public.sessional_sessions s where s.id=l.id);
insert into public.assessment_components(id,course_id,name,quantity,marks_each,counted_quantity,scope,responsible_faculty,remarks)
 select id,course_id,name,count,marks,coalesce(best_of,count),coalesce(section,'Entire Course'),responsible_faculty,remarks from public.lab_assessment_types l where not exists(select 1 from public.assessment_components s where s.id=l.id);
insert into public.assessment_instances(id,component_id,course_id,title,due_date,responsible_faculty,status)
 select id,assessment_type_id,course_id,title,due_date,responsible_faculty,status from public.lab_assessment_items l where not exists(select 1 from public.assessment_instances s where s.id=l.id);

create or replace function private.check_child_consistency() returns trigger language plpgsql set search_path='' as $$begin
 if tg_table_name='assessment_instances' then
  if new.component_id is not null and not exists(select 1 from public.assessment_components where id=new.component_id and course_id=new.course_id) then raise exception 'Component belongs to another course';end if;
  if new.sessional_session_id is not null and not exists(select 1 from public.sessional_sessions where id=new.sessional_session_id and course_id=new.course_id) then raise exception 'Session belongs to another course';end if;
 end if;
 if new.section_id is not null and not exists(select 1 from public.course_sections where id=new.section_id and course_id=new.course_id) then raise exception 'Section belongs to another course';end if;return new;end $$;
create trigger assessment_parent_check before insert or update on public.assessment_instances for each row execute function private.check_child_consistency();
create trigger session_parent_check before insert or update on public.sessional_sessions for each row execute function private.check_child_consistency();

-- Reassignment preserves statuses, notes and IDs; every change remains audited.
drop trigger if exists reset_assignment_statuses_trg on public.primary_assignments;
create or replace function public.workflow_course(p_id uuid,p_term uuid,p_patch jsonb,p_teachers uuid[],p_assignments jsonb default '{}') returns uuid
language plpgsql security definer set search_path='' as $$declare cid uuid;f uuid;k text;old_revision integer;coordinator uuid;begin
 if not public.is_admin() then raise exception 'Administrator required' using errcode='42501';end if;
 if not exists(select 1 from public.academic_terms where id=p_term) then raise exception 'Choose a term';end if;
 cid:=coalesce(p_id,gen_random_uuid());perform pg_advisory_xact_lock(hashtextextended(cid::text,0));
 if p_teachers is null or cardinality(p_teachers)=0 then raise exception 'Assign the course teachers';end if;
 coordinator:=nullif(p_patch->>'coordinator','')::uuid;
 if coordinator is not null and not(coordinator=any(p_teachers)) then raise exception 'The coordinator must be a course teacher';end if;
 perform set_config('workflow.change_reason',coalesce(p_patch->>'change_reason',''),true);
 if p_id is null then
  insert into public.courses(id,course_code,title,course_type,term_id,term,status) select cid,regexp_replace(trim(p_patch->>'course_code'),'\s+',' ','g'),p_patch->>'title',p_patch->>'course_type',id,name,'draft' from public.academic_terms where id=p_term;
 else
  select revision into old_revision from public.courses where id=cid and term_id=p_term for update;
  if not found or old_revision is distinct from (p_patch->>'expected_revision')::integer then raise exception 'Course changed. Refresh before saving' using errcode='40001';end if;
  if exists(select 1 from public.courses where id=cid and status='archived') and p_patch->>'status'<>'draft' then raise exception 'Reopen an archived offering as draft before editing';end if;
  if coalesce(p_patch->>'change_reason','')='' then raise exception 'Record a reason for changing the offering';end if;
 end if;
 update public.courses set title=coalesce(p_patch->>'title',title),batch=p_patch->>'batch',question_deadline=nullif(p_patch->>'question_deadline','')::date,exam_date=nullif(p_patch->>'exam_date','')::date,final_gradesheet_deadline=nullif(p_patch->>'final_gradesheet_deadline','')::date,revision=revision+1 where id=cid;
 -- Never remove a teacher who still owns operational work.
 if exists(select 1 from public.class_tests where course_id=cid and coalesce(responsible_faculty,responsible_faculty_id)<>all(p_teachers)) or exists(select 1 from public.sessional_sessions where course_id=cid and assigned_faculty<>all(p_teachers)) or exists(select 1 from public.assessment_instances where course_id=cid and responsible_faculty<>all(p_teachers)) then raise exception 'Reassign existing activities before removing their owner';end if;
 delete from public.course_faculty where course_id=cid and faculty_id<>all(p_teachers);
 update public.course_faculty set role='course_teacher' where course_id=cid and role in ('coordinator','sessional_coordinator');
 foreach f in array p_teachers loop
  if not exists(select 1 from public.course_faculty where course_id=cid and faculty_id=f) then insert into public.course_faculty(course_id,faculty_id) values(cid,f);end if;
 end loop;
 if coordinator is not null then update public.course_faculty set role='coordinator' where id=(select id from public.course_faculty where course_id=cid and faculty_id=coordinator order by id limit 1);end if;
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
 if p_patch->>'status'='published' then
  if coordinator is null then raise exception 'Designate a coordinator before publishing';end if;
  if exists(select 1 from public.class_tests where course_id=cid and responsible_faculty is null and responsible_faculty_id is null) or exists(select 1 from public.sessional_sessions where course_id=cid and assigned_faculty is null) or exists(select 1 from public.assessment_instances where course_id=cid and responsible_faculty is null) then raise exception 'Assign the configured activities before publishing';end if;
 end if;
 if p_patch?'status' then update public.courses set status=p_patch->>'status' where id=cid;end if;return cid;
end $$;

create or replace function public.workflow_term(p_id uuid,p_patch jsonb) returns uuid language plpgsql security definer set search_path='' as $$declare tid uuid;w jsonb;begin
 if not public.is_admin() then raise exception 'Administrator required';end if;tid:=coalesce(p_id,gen_random_uuid());
 if nullif(trim(p_patch->>'name'),'') is null then raise exception 'Term name required';end if;
 if p_id is null then
  if nullif(trim(p_patch->>'code'),'') is null then raise exception 'A unique stable term code is required';end if;
  insert into public.academic_terms(id,code,name,total_teaching_weeks,latest_completed_week,active) values(tid,trim(p_patch->>'code'),trim(p_patch->>'name'),coalesce((p_patch->>'total_teaching_weeks')::integer,14),0,false);
 else
  perform pg_advisory_xact_lock(hashtextextended('academic-calendar',0));
  if coalesce(p_patch->>'pause_reason','')='' then raise exception 'Record the reason for a calendar change';end if;
  if (p_patch->>'active')::boolean then update public.academic_terms set active=false where id<>tid;end if;
  update public.academic_terms set name=p_patch->>'name',total_teaching_weeks=coalesce((p_patch->>'total_teaching_weeks')::integer,total_teaching_weeks),latest_completed_week=coalesce((p_patch->>'latest_completed_week')::integer,latest_completed_week),calendar_status=coalesce(p_patch->>'calendar_status',calendar_status),pause_reason=p_patch->>'pause_reason',active=coalesce((p_patch->>'active')::boolean,active),updated_at=now() where id=tid;
  if p_patch?'weeks' then
   for w in select * from jsonb_array_elements(p_patch->'weeks') loop
    if (w->>'starts_on' is null)<>(w->>'ends_on' is null) then raise exception 'Set both week boundaries or neither';end if;
    insert into public.academic_weeks(term_id,week_no,starts_on,ends_on) values(tid,(w->>'week_no')::integer,(w->>'starts_on')::date,(w->>'ends_on')::date)
    on conflict(term_id,week_no) do update set starts_on=excluded.starts_on,ends_on=excluded.ends_on;
   end loop;
   if exists(select 1 from public.academic_weeks a join public.academic_weeks b on a.term_id=b.term_id and a.id<>b.id where a.term_id=tid and daterange(a.starts_on,a.ends_on,'[]')&&daterange(b.starts_on,b.ends_on,'[]') and a.starts_on is not null and b.starts_on is not null) then raise exception 'Teaching weeks cannot overlap';end if;
  end if;
 end if;return tid;end $$;

-- Stable session/component reconciliation, including gaps and cancelled slots.
create or replace function public.workflow_generate(p_course uuid,p_kind text,p_payload jsonb) returns void
language plpgsql security definer set search_path='' as $$declare n integer;qty integer;comp uuid;owner uuid;scope_value text;begin
 perform private.assert_editable(p_course);if not public.can_manage_course(p_course) then raise exception 'Coordinator required';end if;
 if (select lower(course_type) from public.courses where id=p_course) not in ('sessional','lab') then raise exception 'Choose a sessional course';end if;
 qty:=(p_payload->>'quantity')::integer;owner:=nullif(p_payload->>'owner','')::uuid;scope_value:=coalesce(nullif(p_payload->>'scope',''),'Entire Course');
 if qty is null or qty not between 1 and 100 then raise exception 'Quantity must be 1–100';end if;
 if owner is not null and not exists(select 1 from public.course_faculty where course_id=p_course and faculty_id=owner) then raise exception 'Owner must teach this course';end if;
 if p_kind='sessions' then
  if exists(select 1 from public.sessional_sessions where course_id=p_course and scope=scope_value and session_no>qty and status<>'cancelled') then raise exception 'Cancel surplus sessions before reducing the count';end if;
  insert into public.sessional_course_configs(course_id,session_count,config_status) values(p_course,qty,'configured') on conflict(course_id) do update set session_count=excluded.session_count,config_status='configured',version=public.sessional_course_configs.version+1;
  for n in 1..qty loop
   if not exists(select 1 from public.sessional_sessions where course_id=p_course and session_no=n and scope=scope_value) then
    insert into public.sessional_sessions(course_id,term_id,session_no,title,section,scope,assigned_faculty) select id,term_id,n,'Session '||lpad(n::text,2,'0'),scope_value,scope_value,owner from public.courses where id=p_course;
   end if;
  end loop;
 elsif p_kind='component' then
  if nullif(trim(p_payload->>'name'),'') is null or (p_payload->>'marks_each') is null or (p_payload->>'marks_each')::numeric<0 or (p_payload->>'counted_quantity') is null or (p_payload->>'counted_quantity')::integer not between 0 and qty then raise exception 'Check component name, marks and counted quantity';end if;
  select id into comp from public.assessment_components where course_id=p_course and name=p_payload->>'name' and scope=scope_value;
  if comp is not null then
   if exists(select 1 from public.assessment_instances where component_id=comp and sequence_number>qty and status<>'cancelled') then raise exception 'Cancel surplus assessments before reducing the count';end if;
   if exists(select 1 from public.assessment_components where id=comp and (responsible_faculty is distinct from owner or marks_each<>(p_payload->>'marks_each')::numeric)) then raise exception 'Existing component ownership and marks require explicit review; update individual activity owners separately';end if;
   update public.assessment_components set quantity=qty,counted_quantity=(p_payload->>'counted_quantity')::integer,revision=revision+1 where id=comp;
  else
   insert into public.assessment_components(course_id,name,quantity,marks_each,counted_quantity,scope,responsible_faculty) values(p_course,p_payload->>'name',qty,(p_payload->>'marks_each')::numeric,(p_payload->>'counted_quantity')::integer,scope_value,owner) returning id into comp;
  end if;
  for n in 1..qty loop
   if not exists(select 1 from public.assessment_instances where component_id=comp and sequence_number=n and scope=scope_value) then
    insert into public.assessment_instances(course_id,component_id,sequence_number,title,scope,responsible_faculty,status) values(p_course,comp,n,(p_payload->>'name')||' '||lpad(n::text,2,'0'),scope_value,owner,'not_started');
   end if;
  end loop;
 else raise exception 'Unknown configuration';end if;
end $$;

create table public.workflow_requests(
 id uuid primary key default gen_random_uuid(),course_id uuid not null references public.courses(id),kind text not null,activity_id uuid,task_key text,
 requester uuid not null references public.faculty(id),request_type text not null check(request_type in ('extension','reassignment')),
 reason text not null check(length(trim(reason))>0),proposed_date date,status text not null default 'pending' check(status in ('pending','approved','declined')),
 resolution text,resolved_by uuid references auth.users(id),created_at timestamptz not null default now(),resolved_at timestamptz);
alter table public.workflow_requests enable row level security;
create policy request_read on public.workflow_requests for select to authenticated using(public.has_active_profile() and (requester=public.current_faculty_id() or public.can_manage_course(course_id)));
grant select on public.workflow_requests to authenticated;

create or replace function private.activity_row(k text,c uuid,i uuid,t text) returns jsonb language plpgsql stable security definer set search_path='' as $$declare tbl text;r jsonb;begin
 tbl:=case k when 'theory' then 'task_statuses' when 'ct' then 'class_tests' when 'session' then 'sessional_sessions' when 'assessment' then 'assessment_instances' when 'outline' then 'course_outline_statuses' when 'feedback' then 'feedback_statuses' when 'car' then 'course_file_statuses' when 'grade' then 'sessional_grade_statuses' end;
 if tbl is null then raise exception 'Invalid activity kind';end if;
 if k in ('theory','grade') then execute format('select to_jsonb(r) from public.%I r where course_id=$1 and task_key=$2',tbl) into r using c,t;
 elsif k in ('outline','feedback','car') then execute format('select to_jsonb(r) from public.%I r where course_id=$1',tbl) into r using c;
 else execute format('select to_jsonb(r) from public.%I r where course_id=$1 and id=$2',tbl) into r using c,i;end if;return r;end $$;
create or replace function private.activity_owner(k text,c uuid,r jsonb,t text) returns uuid language sql stable security definer set search_path='' as $$
 select case k when 'theory' then private.task_owner(c,t) when 'grade' then (select case t when 'sessional_gradesheet_prep' then preparer when 'sessional_gradesheet_scrutiny' then scrutinizer end from public.sessional_grade_assignments where course_id=c)
 when 'session' then (r->>'assigned_faculty')::uuid else coalesce(r->>'responsible_faculty',r->>'responsible_faculty_id')::uuid end$$;
create or replace function public.workflow_request(p_course uuid,p_kind text,p_id uuid,p_task text,p_type text,p_reason text,p_date date default null) returns uuid language plpgsql security definer set search_path='' as $$declare r jsonb;rid uuid;begin
 perform private.assert_editable(p_course);r:=private.activity_row(p_kind,p_course,p_id,p_task);
 if private.activity_owner(p_kind,p_course,r,p_task) is distinct from public.current_faculty_id() then raise exception 'Only the assigned owner can request a change';end if;
 if p_type='extension' and p_date is null then raise exception 'Propose a new deadline';end if;
 insert into public.workflow_requests(course_id,kind,activity_id,task_key,requester,request_type,reason,proposed_date) values(p_course,p_kind,p_id,p_task,public.current_faculty_id(),p_type,p_reason,p_date) returning id into rid;return rid;end $$;
create or replace function public.workflow_resolve_request(p_id uuid,p_decision text,p_reason text,p_date date default null,p_owner uuid default null) returns void language plpgsql security definer set search_path='' as $$declare q public.workflow_requests%rowtype;r jsonb;k text;begin
 select * into q from public.workflow_requests where id=p_id for update;
 if not found or not public.can_manage_course(q.course_id) then raise exception 'Coordinator or administrator required';end if;
 if q.status<>'pending' then raise exception 'Request already resolved';end if;
 if p_decision is null or p_decision not in ('approved','declined') or nullif(trim(p_reason),'') is null then raise exception 'Record a decision and reason';end if;
 perform private.assert_editable(q.course_id);r:=private.activity_row(q.kind,q.course_id,q.activity_id,q.task_key);
 if p_decision='approved' then
  if q.request_type='extension' then
   if p_date is null then raise exception 'Approved deadline required';end if;
   if q.kind='theory' then
    insert into public.task_deadlines(course_id,task_key,due_date) values(q.course_id,q.task_key,p_date) on conflict(course_id,task_key) do update set due_date=excluded.due_date;
   else
    k:=case q.kind when 'ct' then 'publication_due_date' when 'session' then 'report_deadline' when 'feedback' then 'deadline' when 'car' then 'deadline' else 'due_date' end;
    perform public.workflow_save_activity(q.kind,q.course_id,q.activity_id,q.task_key,jsonb_build_object(k,p_date,'change_reason',p_reason),(r->>'revision')::integer);
   end if;
  else
   if p_owner is null then raise exception 'Select the new owner';end if;
   if q.kind in ('theory','grade') then raise exception 'Use course settings to change authoritative examination assignments, then decline this request with a resolution note';end if;
   k:=case when q.kind='session' then 'assigned_faculty' else 'responsible_faculty' end;
   perform public.workflow_save_activity(q.kind,q.course_id,q.activity_id,q.task_key,jsonb_build_object(k,p_owner,'change_reason',p_reason),(r->>'revision')::integer);
  end if;
 end if;
 update public.workflow_requests set status=p_decision,resolution=p_reason,resolved_by=auth.uid(),resolved_at=now() where id=p_id;
end $$;

create table public.workflow_imports(id uuid primary key default gen_random_uuid(),term_id uuid not null references public.academic_terms(id),fingerprint text not null,actor uuid not null references auth.users(id),reason text not null,created_at timestamptz not null default now());
create table public.workflow_import_rows(import_id uuid not null references public.workflow_imports(id),record_id uuid not null references public.class_tests(id),source jsonb not null,before_value jsonb,after_value jsonb not null,primary key(import_id,record_id));
alter table public.workflow_imports enable row level security;alter table public.workflow_import_rows enable row level security;
create policy imports_admin on public.workflow_imports for select to authenticated using(public.is_admin());
create policy import_rows_admin on public.workflow_import_rows for select to authenticated using(public.is_admin());
grant select on public.workflow_imports,public.workflow_import_rows to authenticated;
create or replace function public.workflow_import_ct(p_term uuid,p_fingerprint text,p_rows jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare imp uuid;r jsonb;oldrow jsonb;newrow jsonb;cid uuid;rid uuid;begin
 if not public.is_admin() then raise exception 'Administrator required';end if;
 if p_fingerprint !~ '^[0-9a-f]{64}$' or nullif(trim(p_reason),'') is null or jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows)=0 then raise exception 'Fingerprint, reviewed rows, and reason required';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_term::text||':ct-import',0));
 insert into public.workflow_imports(term_id,fingerprint,actor,reason) values(p_term,p_fingerprint,auth.uid(),p_reason) returning id into imp;
 for r in select * from jsonb_array_elements(p_rows) loop
  cid:=(r->>'course_id')::uuid;rid:=(r->>'id')::uuid;
  if not exists(select 1 from public.courses where id=cid and term_id=p_term and course_code=r->>'course_code') then raise exception 'Source course does not match the selected term';end if;
  if rid is null then
   select id into rid from public.class_tests where course_id=cid and ct_number=(r->>'ct_number')::integer;
   if found then raise exception 'A matching CT was created since preview. Refresh the preview' using errcode='40001';end if;
  end if;
  oldrow:=private.activity_row('ct',cid,rid,null);
  if oldrow is not null and (oldrow->>'ct_number')::integer<>(r->>'ct_number')::integer then raise exception 'CT identity does not match';end if;
  if exists(select 1 from public.workflow_import_rows ir join public.workflow_imports i on i.id=ir.import_id where i.term_id=p_term and i.fingerprint=p_fingerprint and ir.source->>'source_row'=r->>'source_row' and ir.source->>'source_column'=r->>'source_column') then continue;end if;
  newrow:=public.workflow_save_activity('ct',cid,rid,null,jsonb_build_object('title',coalesce(oldrow->>'title','CT '||(r->>'ct_number')),'ct_number',(r->>'ct_number')::integer,'scheduled_date',r->>'scheduled_date','status',r->>'status','change_reason',p_reason),(r->>'expected_revision')::integer);
  insert into public.workflow_import_rows(import_id,record_id,source,before_value,after_value) values(imp,(newrow->>'id')::uuid,r,oldrow,newrow);
 end loop;return imp;
end $$;

-- Record actor, original state, final state and explicit correction reason.
alter table public.audit_logs add column if not exists change_reason text;
create or replace function public.audit_change() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.audit_logs(actor,table_name,action,row_key,old_value,new_value,change_reason)
 values(auth.uid(),tg_table_name,tg_op,coalesce(to_jsonb(new)->>'id',to_jsonb(old)->>'id',to_jsonb(new)->>'course_id',to_jsonb(old)->>'course_id'),case when tg_op<>'INSERT' then to_jsonb(old) end,case when tg_op<>'DELETE' then to_jsonb(new) end,current_setting('workflow.change_reason',true));
 return coalesce(new,old);end $$;
do $$declare t text;tr record;begin
 foreach t in array array['courses','course_faculty','primary_assignments','sessional_grade_assignments','task_statuses','class_tests','sessional_sessions','assessment_components','assessment_instances','course_outline_statuses','feedback_statuses','course_file_statuses','sessional_grade_statuses','academic_terms','academic_weeks','allowed_users','workflow_requests','task_deadlines'] loop
  for tr in select tgname from pg_trigger where tgrelid=format('public.%I',t)::regclass and not tgisinternal and tgname like 'audit%' loop execute format('drop trigger %I on public.%I',tr.tgname,t);end loop;
  execute format('create trigger audit_workflow after insert or update or delete on public.%I for each row execute function public.audit_change()',t);
 end loop;
end $$;

create table public.workflow_settings(id boolean primary key default true check(id),reminder_days integer[] not null default array[7,3,1,0],overdue_every_days integer not null default 3 check(overdue_every_days>0));
insert into public.workflow_settings default values;
alter table public.workflow_settings enable row level security;
create policy settings_admin on public.workflow_settings for select to authenticated using(public.is_admin());
grant select on public.workflow_settings to authenticated;
alter table public.notification_outbox add column refs jsonb not null default '[]';
alter table public.notification_outbox add column lease_token uuid;
alter table public.notification_outbox add column provider_response jsonb;
alter table public.notification_outbox add column first_attempt_at timestamptz;

create or replace view private.live_tasks as
 select 'theory'::text kind,s.course_id,null::uuid activity_id,s.task_key,private.task_owner(s.course_id,s.task_key) owner,s.status,s.revision,
 coalesce(d.due_date,case when s.task_key like 'question%' or s.task_key like 'moderation%' then c.question_deadline else c.final_gradesheet_deadline end) due_date,s.status='completed' finished,
 not exists(select 1 from unnest(private.task_dependencies(s.task_key)) dep where not exists(select 1 from public.task_statuses p where p.course_id=s.course_id and p.task_key=dep and p.status='completed')) ready,
 replace(s.task_key,'_',' ') title from public.task_statuses s join public.courses c on c.id=s.course_id left join public.task_deadlines d on d.course_id=s.course_id and d.task_key=s.task_key
 union all select 'ct',course_id,id,null,coalesce(responsible_faculty,responsible_faculty_id),status,revision,case when status='scripts_checked' then publication_due_date when status in ('ct_taken','scripts_under_examination') then marking_due_date else coalesce(scheduled_date,date) end,private.activity_done('ct',status,to_jsonb(r)),true,title from public.class_tests r
 union all select 'session',course_id,id,null,assigned_faculty,status,revision,case when report_required and status in ('conducted','submission_pending','evaluation_pending') then report_deadline else date end,private.activity_done('session',status,to_jsonb(r)),true,title from public.sessional_sessions r
 union all select 'assessment',course_id,id,null,responsible_faculty,status,revision,coalesce(due_date,scheduled_date),private.activity_done('assessment',status,to_jsonb(r)),true,title from public.assessment_instances r
 union all select 'outline',course_id,null,null,responsible_faculty,status,revision,due_date,private.activity_done('outline',status),true,'Share course outline' from public.course_outline_statuses
 union all select 'feedback',course_id,null,null,responsible_faculty,status,revision,deadline,private.activity_done('feedback',status),true,'Collect student feedback' from public.feedback_statuses
 union all select 'car',course_id,null,null,responsible_faculty,status,revision,deadline,private.activity_done('car',status),true,'Complete course file / CAR' from public.course_file_statuses
 union all select 'grade',s.course_id,null,s.task_key,case s.task_key when 'sessional_gradesheet_prep' then a.preparer else a.scrutinizer end,s.status,s.revision,s.due_date,private.activity_done('grade',s.status),s.task_key='sessional_gradesheet_prep' or exists(select 1 from public.sessional_grade_statuses p where p.course_id=s.course_id and p.task_key='sessional_gradesheet_prep' and p.status='completed'),replace(s.task_key,'_',' ') from public.sessional_grade_statuses s join public.sessional_grade_assignments a on a.course_id=s.course_id;

-- Create derived workflow rows once on assignment, retaining existing progress.
create or replace function private.ensure_tasks() returns trigger language plpgsql security definer set search_path='' as $$declare k text;begin
 if tg_table_name='primary_assignments' then
  foreach k in array array['question_prep_a','question_prep_b','moderation_1','moderation_2','examination_a','examination_b','scrutiny','gradesheet_prep','gradesheet_scrutiny'] loop
   insert into public.task_statuses(course_id,task_key) values(new.course_id,k) on conflict do nothing;
  end loop;
 else
  foreach k in array array['sessional_gradesheet_prep','sessional_gradesheet_scrutiny'] loop insert into public.sessional_grade_statuses(course_id,task_key) values(new.course_id,k) on conflict do nothing;end loop;
 end if;return new;end $$;
create trigger generate_theory_tasks after insert or update on public.primary_assignments for each row execute function private.ensure_tasks();
create trigger generate_grade_tasks after insert or update on public.sessional_grade_assignments for each row execute function private.ensure_tasks();
insert into public.task_statuses(course_id,task_key) select a.course_id,k from public.primary_assignments a cross join unnest(array['question_prep_a','question_prep_b','moderation_1','moderation_2','examination_a','examination_b','scrutiny','gradesheet_prep','gradesheet_scrutiny']) k on conflict do nothing;
insert into public.sessional_grade_statuses(course_id,task_key) select a.course_id,k from public.sessional_grade_assignments a cross join unnest(array['sessional_gradesheet_prep','sessional_gradesheet_scrutiny']) k on conflict do nothing;

create or replace function private.queue_activity(r private.live_tasks,event_name text) returns void language plpgsql security definer set search_path='' as $$declare key text;begin
 if r.owner is null or r.finished or r.status='cancelled' or not r.ready then return;end if;
 key:=event_name||':'||r.course_id||':'||r.kind||':'||coalesce(r.activity_id::text,r.task_key,'common')||':'||r.revision||':'||r.owner;
 insert into public.notification_outbox(dedupe_key,faculty_id,course_id,title,body,refs)
 values(key,r.owner,r.course_id,event_name,r.title,jsonb_build_array(to_jsonb(r))) on conflict(dedupe_key) do nothing;
 if found then insert into public.notifications(faculty_id,title,body,related_type,related_id) values(r.owner,event_name,r.title,'course',r.course_id);end if;
end $$;
create or replace function private.activity_changed() returns trigger language plpgsql security definer set search_path='' as $$declare r private.live_tasks;begin
 for r in select * from private.live_tasks t where t.course_id=new.course_id and (t.activity_id=(to_jsonb(new)->>'id')::uuid or (t.activity_id is null and coalesce(t.task_key,'')=coalesce(to_jsonb(new)->>'task_key',''))) loop perform private.queue_activity(r,'Activity updated');end loop;
 if tg_op='UPDATE' and to_jsonb(old)->>'status' is distinct from to_jsonb(new)->>'status' and new.status='completed' then
  for r in select * from private.live_tasks where course_id=new.course_id and (to_jsonb(new)->>'task_key')=any(private.task_dependencies(task_key)) loop perform private.queue_activity(r,'Ready for your next step');end loop;
 end if;return new;end $$;
do $$declare t text;begin
 foreach t in array array['task_statuses','class_tests','sessional_sessions','assessment_instances','course_outline_statuses','feedback_statuses','course_file_statuses','sessional_grade_statuses'] loop execute format('create trigger queue_activity_change after insert or update on public.%I for each row execute function private.activity_changed()',t);end loop;
end $$;

-- Daily digest generation can run repeatedly. Calendar dates use Asia/Dhaka.
create or replace function public.workflow_enqueue_reminders() returns integer language plpgsql security definer set search_path='' as $$
declare r record;n integer:=0;today date:=(now() at time zone 'Asia/Dhaka')::date;begin
 for r in select t.owner,jsonb_agg(to_jsonb(t)) refs from private.live_tasks t join public.courses c on c.id=t.course_id join public.academic_terms term on term.id=c.term_id cross join public.workflow_settings s
 where not t.finished and t.status<>'cancelled' and t.ready and t.owner is not null and c.status='published' and c.active and term.active
 and (t.due_date-today=any(s.reminder_days) or (t.due_date<today and (today-t.due_date)%s.overdue_every_days=0))
 and exists(select 1 from public.allowed_users a join public.profiles p on p.faculty_id=a.faculty_id join auth.users u on u.id=p.user_id and lower(u.email)=lower(a.email) where a.faculty_id=t.owner and a.active and p.active and u.email_confirmed_at is not null) group by t.owner loop
  insert into public.notification_outbox(dedupe_key,faculty_id,title,body,refs) values('digest:'||today||':'||r.owner,r.owner,'Your academic day','Your personal activity digest',r.refs) on conflict(dedupe_key) do nothing;
  if found then n:=n+1;end if;
 end loop;return n;end $$;

create or replace function private.delivery_payload(o public.notification_outbox) returns jsonb language plpgsql stable security definer set search_path='' as $$declare mail text;items jsonb;begin
 select a.email into mail from public.allowed_users a join public.profiles p on p.faculty_id=a.faculty_id join auth.users u on u.id=p.user_id and lower(u.email)=lower(a.email) where a.faculty_id=o.faculty_id and a.active and p.active and u.email_confirmed_at is not null;
 if mail is null then return null;end if;
 select jsonb_agg(jsonb_build_object('course',c.course_code,'title',t.title,'date',t.due_date,'course_id',c.id)) into items
 from jsonb_array_elements(o.refs) ref join private.live_tasks t on t.course_id=(ref->>'course_id')::uuid and t.kind=ref->>'kind' and coalesce(t.activity_id::text,t.task_key,'common')=coalesce(ref->>'activity_id',ref->>'task_key','common') and t.revision=(ref->>'revision')::integer
 join public.courses c on c.id=t.course_id join public.academic_terms term on term.id=c.term_id
 where t.owner=o.faculty_id and not t.finished and t.status<>'cancelled' and t.ready and c.active and c.status='published' and term.active and t.due_date is not distinct from (ref->>'due_date')::date;
 if items is null then return null;end if;return jsonb_build_object('to',mail,'title',o.title,'items',items);
end $$;
create or replace function public.workflow_claim_delivery() returns jsonb language plpgsql security definer set search_path='' as $$declare o public.notification_outbox;p jsonb;token uuid;begin
 for o in select * from public.notification_outbox where (status in ('pending','failed') and available_at<=now() or status='sending' and locked_at<now()-interval '5 minutes') and attempts<6 order by created_at for update skip locked limit 50 loop
  p:=private.delivery_payload(o);
  if p is null then update public.notification_outbox set status='cancelled',last_error='Activity changed, completed, or recipient disabled' where id=o.id;continue;end if;
  if o.first_attempt_at<now()-interval '23 hours' then update public.notification_outbox set status='failed',attempts=6,last_error='Delivery reconciliation required: provider idempotency window reached' where id=o.id;continue;end if;
  token:=gen_random_uuid();update public.notification_outbox set status='sending',locked_at=now(),lease_token=token,attempts=attempts+1,first_attempt_at=coalesce(first_attempt_at,now()) where id=o.id;
  return p||jsonb_build_object('id',o.id,'token',token,'dedupe_key',o.dedupe_key);
 end loop;return null;end $$;
create or replace function public.workflow_check_delivery(p_id uuid,p_token uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$declare o public.notification_outbox;begin
 select * into o from public.notification_outbox where id=p_id and lease_token=p_token and status='sending';if not found then return null;end if;return private.delivery_payload(o);end $$;
create or replace function public.workflow_finish_delivery(p_id uuid,p_token uuid,p_success boolean,p_response jsonb) returns void language plpgsql security definer set search_path='' as $$begin
 update public.notification_outbox set status=case when p_success then 'sent' else 'failed' end,sent_at=case when p_success then now() else null end,provider_response=p_response,last_error=case when not p_success then left(p_response::text,2000) else null end,available_at=now()+interval '1 minute'*power(2,attempts),locked_at=null where id=p_id and lease_token=p_token and status='sending';end $$;

-- Restrict grants as well as policies. No old generic RPC may bypass the new write paths.
do $$declare f record;begin
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('private','public') and p.prosecdef loop execute format('revoke all on function %s from public,anon,authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname in ('has_active_profile','current_faculty_id','is_admin','can_access_course','can_manage_course','assignee_for_task','claim_allowed_profile') or p.proname like 'workflow_%') and p.proname not in ('workflow_enqueue_reminders','workflow_claim_delivery','workflow_check_delivery','workflow_finish_delivery') loop execute format('grant execute on function %s to authenticated',f.sig);end loop;
 for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('workflow_enqueue_reminders','workflow_claim_delivery','workflow_check_delivery','workflow_finish_delivery') loop execute format('grant execute on function %s to service_role',f.sig);end loop;
end $$;
revoke all on public.workflow_requests,public.workflow_imports,public.workflow_import_rows,public.workflow_settings from anon;
revoke insert,update,delete on public.notification_outbox,public.workflow_requests,public.workflow_imports,public.workflow_import_rows,public.workflow_settings from authenticated;
insert into public.workflow_migrations(version) values('202609170002');
commit;
