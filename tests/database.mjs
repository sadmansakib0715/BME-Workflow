import assert from 'node:assert/strict';
import fs from 'node:fs';
const {PGlite}=await import(process.env.PGLITE_PATH||'@electric-sql/pglite');
const db=new PGlite();let passed=0;
const q=(s,p=[])=>db.query(s,p);
const scalar=async(s,p=[])=>Object.values((await q(s,p)).rows[0]||{})[0];
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const uid=n=>id(100+n),fid=n=>id(200+n),cid=n=>id(300+n),tid=id(400);
const as=async(n,role='authenticated')=>{await db.exec('reset role');await q("select set_config('request.jwt.claim.sub',$1,false)",[n?uid(n):'']);await db.exec(`set role ${role}`);};
const fail=async(fn,pattern)=>{await assert.rejects(fn,pattern);passed++;};
const equal=(a,b)=>{assert.deepEqual(a,b);passed++;};
const rpc=async(kind,course,row,task,patch,rev)=>scalar('select public.workflow_save_activity($1,$2,$3,$4,$5,$6)',[kind,course,row,task,patch,rev]);
try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema public,auth to anon,authenticated,service_role;grant execute on function auth.uid() to anon,authenticated,service_role;alter default privileges in schema public grant all on tables to anon,authenticated,service_role;alter default privileges in schema public grant all on sequences to anon,authenticated,service_role;`);
for(const f of ['supabase/schema.sql','supabase/activity_tracker_v3_migration.sql',...fs.readdirSync('supabase/migrations').sort().map(x=>'supabase/migrations/'+x)])await db.exec(fs.readFileSync(f,'utf8').replace('create extension if not exists pgcrypto;',''));
for(let n=1;n<=7;n++){
 await q('insert into auth.users values($1,$2,$3)',[uid(n),`faculty${n}@example.edu`,n===7?null:new Date()]);
 if(n!==6){await q('insert into public.faculty(id,full_name,email) values($1,$2,$3)',[fid(n),`Teacher ${n}`,`faculty${n}@example.edu`]);await q('insert into public.allowed_users(email,faculty_id,app_role,active) values($1,$2,$3,$4)',[`faculty${n}@example.edu`,fid(n),n===1?'admin':'faculty',n!==5]);}
}
await q('insert into public.academic_terms(id,code,name) values($1,$2,$3)',[tid,'2026-01','January 2026']);
for(let n=1;n<=3;n++)await q("insert into public.courses(id,course_code,title,term_id,course_type,batch) values($1,$2,'Example course',$3,$4,'Level 2')",[cid(n),'BME '+(210+n),tid,n===3?'sessional':'theory']);
for(const n of [1,2]){
 await q('insert into public.primary_assignments(course_id,preparer_a,preparer_b,moderator_1,moderator_2,scrutinizer) values($1,$2,$3,$4,$5,$4)',[cid(n),fid(2),fid(3),fid(4),fid(1)]);
 for(const f of [2,3,4])await q('insert into public.course_faculty(course_id,faculty_id,role) values($1,$2,$3)',[cid(n),fid(f),f===4?'coordinator':'course_teacher']);
 await q("update public.courses set status='published' where id=$1",[cid(n)]);
}
for(const f of [2,3,4])await q('insert into public.course_faculty(course_id,faculty_id,role) values($1,$2,$3)',[cid(3),fid(f),f===4?'coordinator':'course_teacher']);
await q("update public.courses set status='published' where id=$1",[cid(3)]);
await q('insert into public.sessional_grade_assignments(course_id,preparer,scrutinizer) values($1,$2,$3)',[cid(3),fid(2),fid(3)]);
await q("insert into public.class_tests(id,course_id,ct_number,title,responsible_faculty,status,scheduled_date,scheduled_time,batch,section) values($1,$2,1,'CT 1',$3,'scheduled',current_date,'10:00','Level 2','A1')",[id(501),cid(1),fid(2)]);
for(let n=1;n<=7;n++){await as(n);equal(await scalar('select public.claim_allowed_profile()'),![5,6,7].includes(n));}
await as(6);equal(await scalar('select count(*)::int from public.courses'),0);equal(await scalar('select count(*)::int from public.notifications'),0);await fail(()=>scalar('select public.workflow_department($1)',[tid]),/Approved/);
await as(0,'anon');await fail(()=>q('select public.workflow_department($1)',[tid]),/permission denied/);equal(await scalar('select count(*)::int from public.academic_events'),0);
await as(3);equal(await scalar('select count(*)::int from public.class_tests'),0);await fail(()=>rpc('ct',cid(1),id(501),null,{status:'ct_taken'},1),/assigned owner/);
await fail(()=>q('insert into public.class_tests(course_id,title,responsible_faculty) values($1,$2,$3)',[cid(1),'Forged',fid(3)]),/permission denied/);
await fail(()=>rpc('ct',cid(1),null,null,{title:'Forged',ct_number:2,responsible_faculty:fid(3)},null),/assigned owner/);
await as(2);equal(await scalar('select count(*)::int from public.class_tests'),1);equal(await scalar('select public.can_manage_course($1)',[cid(1)]),false);
await fail(()=>rpc('ct',cid(1),id(501),null,{responsible_faculty:fid(3)},1),/assign work/);
await fail(()=>rpc('ct',cid(1),id(501),null,{course_id:cid(2)},1),/not editable/);
await fail(()=>rpc('ct',cid(1),id(501),null,{section:'A2'},1),/coordinator/);
let saved=await rpc('ct',cid(1),id(501),null,{status:'ct_taken'},1);equal(saved.status,'ct_taken');equal(saved.revision,2);
await fail(()=>rpc('ct',cid(1),id(501),null,{status:'marks_published'},1),/changed/);
await fail(()=>rpc('ct',cid(1),id(501),null,{scheduled_date:'2026-10-01'},2),/reason/);
saved=await rpc('ct',cid(1),id(501),null,{scheduled_date:'2026-10-01',change_reason:'Students requested a new time'},2);equal(saved.revision,3);
equal(await scalar('select count(*)::int from public.class_test_history'),1);
await fail(()=>rpc('theory',cid(1),null,'gradesheet_prep',{status:'completed'},1),/prerequisite/);
await as(4);equal(await scalar('select public.can_manage_course($1)',[cid(1)]),true);
await fail(()=>rpc('ct',cid(1),id(501),null,{status:'marks_published'},3),/assigned owner/);
saved=await rpc('ct',cid(1),id(501),null,{responsible_faculty:fid(3)},3);equal(saved.responsible_faculty,fid(3));
await fail(()=>rpc('ct',cid(2),null,null,{title:'Overlap',ct_number:1,responsible_faculty:fid(2),scheduled_date:'2026-10-01',scheduled_time:'10:15',duration_minutes:30,batch:'Level 2',section:'Entire Course',status:'scheduled'},null),/overlaps/);
equal(await scalar('select count(*)::int from public.class_tests where course_id=$1',[cid(2)]),0);
await scalar('select public.workflow_generate($1,$2,$3)',[cid(3),'component',{name:'Quiz',quantity:3,marks_each:10,counted_quantity:2,scope:'A1',owner:fid(2)}]);
let component=await scalar('select id from public.assessment_components where course_id=$1',[cid(3)]);
const original=await q('select id from public.assessment_instances where component_id=$1 order by sequence_number',[component]);
await scalar('select public.workflow_generate($1,$2,$3)',[cid(3),'component',{name:'Quiz',quantity:3,marks_each:10,counted_quantity:2,scope:'A1',owner:fid(2)}]);
equal((await q('select id from public.assessment_instances where component_id=$1 order by sequence_number',[component])).rows,original.rows);
await fail(()=>scalar('select public.workflow_generate($1,$2,$3)',[cid(3),'component',{name:'Quiz',quantity:1,marks_each:10,counted_quantity:1,scope:'A1',owner:fid(2)}]),/Cancel surplus/);
await as(3);await fail(()=>rpc('grade',cid(3),null,'sessional_gradesheet_scrutiny',{status:'completed'},1),/preparation first/);
await as(1);await fail(()=>rpc('ct',cid(1),id(501),null,{status:'marks_published'},4),/correction requires a reason/);
saved=await rpc('ct',cid(1),id(501),null,{status:'marks_published',change_reason:'Confirmed with teacher'},4);equal(saved.status,'marks_published');
await as(3);await fail(()=>rpc('ct',cid(1),id(501),null,{status:'scheduled',change_reason:'Reopen'},5),/administrator/);
await as(1);saved=await rpc('ct',cid(1),id(501),null,{status:'scheduled',change_reason:'Correction approved'},5);equal(saved.status,'scheduled');
// Identity changes revoke old access immediately, and external verified emails can claim.
await scalar('select public.workflow_faculty($1,$2,$3,$4,$5)',[fid(3),'Teacher 3','new-address@example.org','faculty',true]);await as(3);equal(await scalar('select public.has_active_profile()'),false);equal(await scalar('select count(*)::int from public.class_tests'),0);
await as(null,'postgres');await q('update auth.users set email=$1 where id=$2',['new-address@example.org',uid(3)]);await as(3);equal(await scalar('select public.claim_allowed_profile()'),true);
await as(1);await q("select public.workflow_faculty($1,'Teacher 3','new-address@example.org','faculty',false)",[fid(3)]);await as(3);equal(await scalar('select public.has_active_profile()'),false);
// Same course code in a new term leaves original offering intact.
await as(1);const newTerm=await scalar('select public.workflow_term(null,$1)',[{name:'January 2027',code:'2027-01'}]);
await as(null,'postgres');await q("insert into public.courses(course_code,title,term_id) values('BME 211','Next offering',$1)",[newTerm]);equal(await scalar("select count(*)::int from public.courses where course_code='BME 211'"),2);
await q("update public.courses set status='archived' where id=$1",[cid(1)]);await as(2);await fail(()=>rpc('theory',cid(1),null,'question_prep_a',{status:'completed'},1),/archived/);
await as(2);await fail(()=>scalar('select public.workflow_claim_delivery()'),/permission denied/);
console.log(`PASS ${passed} database authorization and integrity assertions (PostgreSQL WASM).`);
}finally{await db.close();}
