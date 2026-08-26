(() => {
  'use strict';

  const TASKS = [
    {key:'question_prep_a', label:'Question Preparation - Section A', short:'QP-A', stage:'Question Preparation', order:1, source:'preparer_a'},
    {key:'question_prep_b', label:'Question Preparation - Section B', short:'QP-B', stage:'Question Preparation', order:2, source:'preparer_b'},
    {key:'moderation_1', label:'Question Moderator 01', short:'MOD-1', stage:'Question Moderation', order:3, source:'moderator_1'},
    {key:'moderation_2', label:'Question Moderator 02', short:'MOD-2', stage:'Question Moderation', order:4, source:'moderator_2'},
    {key:'examination_a', label:'Script Examination - Section A', short:'EX-A', stage:'Script Examination', order:5, source:'preparer_a', derived:true},
    {key:'examination_b', label:'Script Examination - Section B', short:'EX-B', stage:'Script Examination', order:6, source:'preparer_b', derived:true},
    {key:'scrutiny', label:'Script Scrutiny', short:'SCR', stage:'Script Scrutiny', order:7, source:'scrutinizer'},
    {key:'gradesheet_prep', label:'Gradesheet Preparation', short:'GS-P', stage:'Gradesheet Preparation', order:8, source:'preparer_a', derived:true},
    {key:'gradesheet_scrutiny', label:'Gradesheet Scrutiny', short:'GS-S', stage:'Gradesheet Scrutiny', order:9, source:'scrutinizer', derived:true}
  ];
  const DEPENDENCIES = {
    moderation_1:['question_prep_a','question_prep_b'],
    moderation_2:['question_prep_a','question_prep_b'],
    examination_a:['moderation_1','moderation_2'],
    examination_b:['moderation_1','moderation_2'],
    scrutiny:['examination_a','examination_b'],
    gradesheet_prep:['scrutiny'],
    gradesheet_scrutiny:['gradesheet_prep']
  };
  const STAGE_ORDER = ['Question Preparation','Question Moderation','Script Examination','Script Scrutiny','Gradesheet Preparation','Gradesheet Scrutiny'];
  const STATUS_LABEL = {not_started:'Not Started',waiting:'Waiting',in_progress:'In Progress',submitted:'Submitted',completed:'Completed',overdue:'Overdue',blocked:'Blocked'};
  const CT_STATUS_LABEL = {not_planned:'Not Started / Not Planned',scheduled:'CT Scheduled',ct_taken:'CT Taken',scripts_under_examination:'Scripts Under Examination',scripts_checked:'Scripts Checked',marks_published:'Marks Published',proposed:'Proposed',confirmed:'CT Scheduled',completed:'Marks Published',postponed:'Postponed',rescheduled:'Rescheduled',cancelled:'Cancelled'};
  const SESSIONAL_STATUS_LABEL = {not_started:'Not Started',scheduled:'Scheduled',in_progress:'In Progress',conducted:'Conducted',submission_pending:'Submission Pending',evaluation_pending:'Evaluation Pending',completed:'Completed',cancelled:'Cancelled',setup_required:'Setup Required',configured:'Configured',evaluation_taken:'Evaluation Taken',marking_complete:'Marking Complete',marks_uploaded:'Marks Uploaded in Excel'};
  const OUTLINE_STATUS_LABEL = {not_started:'Not Started',under_preparation:'Under Preparation',prepared:'Prepared',shared_with_students:'Shared with Students'};
  const FACULTY_EMAIL_RE = /^[^@\s]+@bme\.buet\.ac\.bd$/i;
  const TEST_ADMIN_EMAIL = 'sadmansakib715@gmail.com';

  const state = {
    supabase:null, demo:false, session:null, profile:null,
    faculty:[], courses:[], primaryAssignments:[], statuses:[], deadlines:[], auditLogs:[],
    term:null, academicWeeks:[], termMilestones:[], courseSections:[], courseFaculty:[], classTests:[], classTestHistory:[],
    courseOutlines:[], feedbackStatuses:[], courseFileStatuses:[],
    sessionalConfigs:[], sessionalSessions:[], assessmentComponents:[], assessmentInstances:[],
    sessionalGradeAssignments:[], sessionalGradeStatuses:[],
    labConfigs:[], labSessions:[], labAssessmentTypes:[], labAssessmentItems:[], labActivityAssignments:[],
    events:[], notifications:[], view:'home', courseId:null, search:'', statusFilter:'all', calendarFilter:'all',
    selectedWeek:null, modal:null
  };

  const $app = document.getElementById('app');
  const cfg = window.EXAMFLOW_CONFIG || {};
  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const clone = value => typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value));
  const byId = (list,id) => list.find(x=>x.id===id);
  const fmtDate = (d) => d ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${d}T00:00:00`)) : 'Not set';
  const todayIso = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
  const isAdmin = () => ['admin','hod'].includes(state.profile?.app_role);
  const activeProfile = () => !!state.profile?.active;
  const profileFacultyId = () => state.profile?.faculty_id || state.profile?.faculty?.id || null;
  const facultyName = id => byId(state.faculty,id)?.full_name || 'Unassigned';
  const courseById = id => byId(state.courses,id) || {};
  const activeTerm = () => state.term || defaultTerm();
  const assignmentFor = courseId => state.primaryAssignments.find(a=>a.course_id===courseId) || {};
  const sessionalConfigFor = courseId => state.sessionalConfigs.find(c=>c.course_id===courseId) || state.labConfigs.find(c=>c.course_id===courseId) || {};
  const sessionalSessionsFor = courseId => (state.sessionalSessions.length ? state.sessionalSessions : state.labSessions).filter(s=>s.course_id===courseId);
  const assessmentComponentsFor = courseId => (state.assessmentComponents.length ? state.assessmentComponents : state.labAssessmentTypes).filter(t=>t.course_id===courseId);
  const assessmentInstancesFor = courseId => (state.assessmentInstances.length ? state.assessmentInstances : state.labAssessmentItems).filter(i=>i.course_id===courseId);
  const labConfigFor = sessionalConfigFor;
  const labSessionsFor = sessionalSessionsFor;
  const labItemsFor = assessmentInstancesFor;
  const classTestsFor = courseId => state.classTests.filter(c=>c.course_id===courseId);
  const ctDate = ct => ct.scheduled_date || ct.date || null;
  const ctTime = ct => ct.scheduled_time || ct.time || '';

  function defaultTerm(){
    return {id:'term-local', name:cfg.academicTerm || 'January 2026', total_teaching_weeks:14, latest_completed_week:9, calendar_status:'active', pause_reason:'', active:true};
  }
  function suggestCourseType(code=''){
    const match = String(code).match(/(\d{3})\b/);
    if(!match) return 'theory';
    return Number(match[1]) % 2 === 0 ? 'sessional' : 'theory';
  }
  function courseType(course){
    const raw = String(course.course_type || suggestCourseType(course.course_code)).toLowerCase();
    if(raw === 'lab') return 'sessional';
    return raw === 'theory' ? 'theory' : 'sessional';
  }
  function isTheoryCourse(course){ return courseType(course) === 'theory'; }
  function isSessionalCourse(course){ return courseType(course) === 'sessional'; }
  function isLabCourse(course){ return isSessionalCourse(course); }
  function statusRow(courseId,key){ return state.statuses.find(s=>s.course_id===courseId && s.task_key===key); }
  function dueDateFor(course,key){
    const override = state.deadlines.find(d=>d.course_id===course.id && d.task_key===key)?.due_date;
    if(override) return override;
    if(['question_prep_a','question_prep_b','moderation_1','moderation_2'].includes(key)) return course.question_deadline || null;
    return course.final_gradesheet_deadline || null;
  }
  function taskCanStart(courseId,key){ return (DEPENDENCIES[key] || []).every(dep => (statusRow(courseId,dep)?.status || 'not_started') === 'completed'); }
  function statusFor(course,key){
    const raw = statusRow(course.id,key)?.status || 'not_started';
    const due = dueDateFor(course,key);
    if(raw !== 'completed' && due && due < todayIso()) return 'overdue';
    if(raw === 'not_started' && (DEPENDENCIES[key] || []).length && !taskCanStart(course.id,key)) return 'waiting';
    return raw;
  }
  function assigneeFor(courseId,key){
    const task = TASKS.find(t=>t.key===key);
    const a = assignmentFor(courseId);
    return task ? a[task.source] || null : null;
  }
  function theoryCourses(){ return state.courses.filter(isTheoryCourse); }
  function sessionalCourses(){ return state.courses.filter(isSessionalCourse); }
  function labCourses(){ return sessionalCourses(); }
  function taskObjects(){
    return theoryCourses().flatMap(course => TASKS.map(task => ({
      ...task, kind:'theory', course, assignee_id:assigneeFor(course.id,task.key), status:statusFor(course,task.key), due_date:dueDateFor(course,task.key)
    })));
  }
  function courseTeachers(courseId){
    const rows = state.courseFaculty.filter(r=>r.course_id===courseId);
    return rows.map(r => ({...r, name:facultyName(r.faculty_id)}));
  }
  function courseIsMine(course){
    const fid = profileFacultyId();
    if(isTheoryCourse(course) && TASKS.some(t=>assigneeFor(course.id,t.key)===fid)) return true;
    if(state.courseFaculty.some(r=>r.course_id===course.id && r.faculty_id===fid)) return true;
    if(state.classTests.some(ct=>ct.course_id===course.id && ct.responsible_faculty===fid)) return true;
    if(state.labSessions.some(s=>s.course_id===course.id && s.assigned_faculty===fid)) return true;
    if(state.labAssessmentItems.some(i=>i.course_id===course.id && i.responsible_faculty===fid)) return true;
    return false;
  }
  function myTheoryTasks(){ return taskObjects().filter(t=>t.assignee_id===profileFacultyId()); }
  function myClassTests(){ return state.classTests.filter(ct=>ct.responsible_faculty===profileFacultyId() || courseIsMine(courseById(ct.course_id))); }
  function mySessionalSessions(){ return (state.sessionalSessions.length ? state.sessionalSessions : state.labSessions).filter(s=>s.assigned_faculty===profileFacultyId() || courseIsMine(courseById(s.course_id))); }
  function myAssessmentInstances(){ return (state.assessmentInstances.length ? state.assessmentInstances : state.labAssessmentItems).filter(i=>i.responsible_faculty===profileFacultyId() || courseIsMine(courseById(i.course_id))); }
  function myLabSessions(){ return mySessionalSessions(); }
  function myLabItems(){ return myAssessmentInstances(); }
  function progressPct(items){ if(!items.length) return 0; return Math.round(items.filter(t=>['completed','conducted','configured'].includes(t.status)).length/items.length*100); }
  function statusBadge(status, labels=STATUS_LABEL){
    return `<span class="badge ${esc(status)}">${esc(labels[status] || status || 'Unknown')}</span>`;
  }
  function typeBadge(course){
    const type = courseType(course);
    return `<span class="badge ${type}">${type === 'sessional' ? 'Sessional' : 'Theory'}</span>`;
  }
  function milestoneLabel(type=''){
    const labels = {
      COURSE_OUTLINE_SHARING:'Course Outline Sharing Deadline',
      QUESTION_SUBMISSION_DEADLINE:'Question Submission Deadline',
      FEEDBACK_START:'Feedback Start',
      FEEDBACK_DEADLINE:'Feedback Deadline',
      THEORY_GRADESHEET_DEADLINE:'Theory Gradesheet Deadline',
      SESSIONAL_GRADESHEET_DEADLINE:'Sessional Gradesheet Deadline',
      CAR_DEADLINE:'Course File / CAR Deadline'
    };
    return labels[type] || String(type || 'Term Milestone').replace(/_/g,' ').toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
  }
  function milestoneDate(type){
    return state.termMilestones.find(m=>m.milestone_type===type)?.milestone_date || null;
  }
  function weekForDate(date){
    if(!date) return null;
    const row = state.academicWeeks.find(w=>w.starts_on && w.ends_on && w.starts_on <= date && date <= w.ends_on);
    if(row) return row.week_no;
    const term = activeTerm();
    if(!term.start_date) return null;
    const diff = daysBetween(term.start_date,date);
    return diff >= 0 ? Math.floor(diff / 7) + 1 : null;
  }
  function eventsForAll(){
    const events = [];
    for(const m of state.termMilestones){
      events.push({id:`milestone-${m.id}`, type:'Deadline', date:m.milestone_date, time:'', week:weekForDate(m.milestone_date), courseId:m.course_id, course:courseById(m.course_id), title:milestoneLabel(m.milestone_type), status:m.status || 'scheduled', facultyId:m.faculty_id, detail:m.notes || 'Term-level milestone'});
    }
    for(const row of state.events){
      const c = courseById(row.course_id);
      events.push({id:`event-${row.id}`, type:row.event_type || 'Academic Event', date:row.event_date, time:row.event_time || '', week:weekForDate(row.event_date), courseId:row.course_id, course:c, title:row.title, status:row.status || 'scheduled', facultyId:row.faculty_id, detail:row.source_table ? `Source: ${row.source_table}` : facultyName(row.faculty_id)});
    }
    for(const o of state.courseOutlines){
      const c = courseById(o.course_id);
      const due = o.due_date || milestoneDate('COURSE_OUTLINE_SHARING');
      if(due) events.push({id:`outline-${o.course_id}`, type:'Course Outline', date:due, time:'', week:weekForDate(due), courseId:o.course_id, course:c, title:'Course outline sharing', status:o.status || 'not_started', facultyId:o.responsible_faculty, detail:OUTLINE_STATUS_LABEL[o.status] || 'Not Started'});
    }
    for(const t of taskObjects()){
      if(t.due_date) events.push({id:`task-${t.course.id}-${t.key}`, type:'Theory Deadline', date:t.due_date, time:'', week:weekForDate(t.due_date), courseId:t.course.id, course:t.course, title:t.label, status:t.status, facultyId:t.assignee_id, detail:`Responsible: ${facultyName(t.assignee_id)}`});
    }
    for(const ct of state.classTests){
      const c = courseById(ct.course_id);
      events.push({id:`ct-${ct.id}`, type:'Class Test', date:ctDate(ct), time:ctTime(ct), week:weekForDate(ctDate(ct)), courseId:ct.course_id, course:c, title:`${ct.title || `CT ${ct.ct_number || ''}`} - Section ${ct.section || 'All'}`, status:ct.status || 'not_planned', facultyId:ct.responsible_faculty || ct.responsible_faculty_id, detail:`${ct.batch || c.batch || ''}${ct.syllabus ? ` | ${ct.syllabus}` : ''}`});
    }
    const legacySessions = state.sessionalSessions.length ? [] : state.labSessions;
    for(const s of legacySessions){
      const c = courseById(s.course_id);
      events.push({id:`lab-${s.id}`, type:'Sessional Session', date:s.date, time:'', week:weekForDate(s.date), courseId:s.course_id, course:c, title:`Session ${String(s.session_no || '').padStart(2,'0')} - ${s.title}`, status:s.status, facultyId:s.assigned_faculty, detail:`${s.section || 'All'} ${s.group_label || ''}`});
    }
    for(const s of state.sessionalSessions){
      const c = courseById(s.course_id);
      events.push({id:`sessional-${s.id}`, type:'Sessional Session', date:s.date, time:s.scheduled_time || '', week:weekForDate(s.date), courseId:s.course_id, course:c, title:`Session ${String(s.session_no || s.sequence_number || '').padStart(2,'0')} - ${s.title}`, status:s.status, facultyId:s.assigned_faculty, detail:`${s.section || s.scope || 'Entire Course'} ${s.group_label || ''}`});
    }
    const legacyItems = state.assessmentInstances.length ? [] : state.labAssessmentItems;
    for(const i of legacyItems.concat(state.assessmentInstances)){
      const c = courseById(i.course_id);
      events.push({id:`assessment-${i.id}`, type:'Sessional Assessment', date:i.due_date || i.scheduled_date, time:'', week:weekForDate(i.due_date || i.scheduled_date), courseId:i.course_id, course:c, title:i.title, status:i.status, facultyId:i.responsible_faculty, detail:`${i.marks || i.marks_each || 0} marks | ${facultyName(i.responsible_faculty)}`});
    }
    for(const f of state.feedbackStatuses){
      const c = courseById(f.course_id), due=f.deadline || milestoneDate('FEEDBACK_DEADLINE');
      if(due) events.push({id:`feedback-${f.course_id}`, type:'Feedback', date:due, time:'', week:weekForDate(due), courseId:f.course_id, course:c, title:'Student feedback', status:f.status || 'not_started', facultyId:f.responsible_faculty, detail:f.notes || 'Feedback workflow'});
    }
    for(const cf of state.courseFileStatuses){
      const c = courseById(cf.course_id), due=cf.deadline || milestoneDate('CAR_DEADLINE');
      if(due) events.push({id:`course-file-${cf.course_id}`, type:'Course File', date:due, time:'', week:weekForDate(due), courseId:cf.course_id, course:c, title:'Course File / CAR', status:cf.status || 'not_started', facultyId:cf.responsible_faculty, detail:cf.notes || 'Course file workflow'});
    }
    return events.filter(e=>e.date).sort((a,b)=>(a.date || '').localeCompare(b.date || '') || (a.time || '').localeCompare(b.time || ''));
  }
  function myAcademicEvents(){
    const fid = profileFacultyId();
    return eventsForAll().filter(e=>e.facultyId===fid || courseIsMine(e.course));
  }

  function toast(message,type=''){
    let wrap=document.querySelector('.toast-wrap');
    if(!wrap){wrap=document.createElement('div');wrap.className='toast-wrap';document.body.appendChild(wrap);}
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;wrap.appendChild(el);
    setTimeout(()=>el.remove(),3400);
  }

  async function init(){
    const params = new URLSearchParams(location.search);
    if(params.get('demo') === '1'){
      loadDemo(); render(); return;
    }
    if(cfg.mode !== 'production' || !cfg.supabaseUrl || !cfg.supabaseAnonKey){
      renderLocked(); return;
    }
    if(!window.supabase){ renderFatal('Authentication library could not be loaded.'); return; }
    state.supabase = window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const {data:{session}} = await state.supabase.auth.getSession();
    state.session=session;
    state.supabase.auth.onAuthStateChange(async (_event,session)=>{ state.session=session; if(session) await bootstrap(); else {state.profile=null;renderAuth();} });
    if(session) await bootstrap(); else renderAuth();
  }

  function loadDemo(){
    state.demo=true;
    const d=window.EXAMFLOW_DEMO || {};
    for(const key of ['faculty','courses','primaryAssignments','statuses','academicWeeks','termMilestones','courseSections','courseFaculty','classTests','classTestHistory','courseOutlines','feedbackStatuses','courseFileStatuses','sessionalConfigs','sessionalSessions','assessmentComponents','assessmentInstances','sessionalGradeAssignments','sessionalGradeStatuses','labConfigs','labSessions','labAssessmentTypes','labAssessmentItems','events','notifications']){
      state[key]=clone(d[key] || []);
    }
    state.term=clone(d.term || defaultTerm());
    state.deadlines=[];
    state.auditLogs=[
      {id:3,table_name:'academic_terms',action:'UPDATE',row_key:'term-jan-2026',created_at:'2026-08-26T09:30:00+06:00'},
      {id:2,table_name:'class_tests',action:'UPDATE',row_key:'ct2',created_at:'2026-08-25T16:10:00+06:00'},
      {id:1,table_name:'primary_assignments',action:'UPDATE',row_key:'c2',created_at:'2026-08-24T16:10:00+06:00'}
    ];
    state.profile={user_id:'demo-user',faculty_id:'f3',app_role:'admin',active:true,faculty:byId(state.faculty,'f3')};
    state.selectedWeek=state.term.latest_completed_week;
  }

  async function selectOptional(table, build, fallback=[]){
    try{
      const query = build ? build(state.supabase.from(table)) : state.supabase.from(table).select('*');
      const {data,error} = await query;
      if(error){ console.warn(`Optional table ${table} unavailable: ${error.message}`); return fallback; }
      return data || fallback;
    }catch(err){
      console.warn(`Optional table ${table} unavailable: ${err.message}`);
      return fallback;
    }
  }
  async function loadActiveTerm(){
    try{
      const {data,error}=await state.supabase.from('academic_terms').select('*').eq('active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
      if(error) throw error;
      return data || defaultTerm();
    }catch(err){
      console.warn(`Academic term table unavailable: ${err.message}`);
      return defaultTerm();
    }
  }

  async function bootstrap(){
    const uid=state.session?.user?.id;
    let {data:profile,error:pErr}=await state.supabase.from('profiles').select('user_id,faculty_id,app_role,active,faculty:faculty_id(id,full_name,designation,email)').eq('user_id',uid).maybeSingle();
    if(pErr){renderFatal(`Profile lookup failed: ${pErr.message}`);return;}
    if(!profile){
      const claim=await state.supabase.rpc('claim_allowed_profile');
      if(!claim.error && claim.data===true){
        const retry=await state.supabase.from('profiles').select('user_id,faculty_id,app_role,active,faculty:faculty_id(id,full_name,designation,email)').eq('user_id',uid).maybeSingle();
        profile=retry.data; pErr=retry.error;
      }
    }
    if(pErr){renderFatal(`Profile lookup failed: ${pErr.message}`);return;}
    if(!profile || !profile.active){ await state.supabase.auth.signOut(); renderUnauthorized(); return; }
    state.profile=profile;
    const base = await Promise.all([
      state.supabase.from('faculty').select('id,full_name,designation,email').order('full_name'),
      state.supabase.from('courses').select('*').eq('active',true).order('course_code'),
      state.supabase.from('primary_assignments').select('*'),
      state.supabase.from('task_statuses').select('*'),
      state.supabase.from('task_deadlines').select('*')
    ]);
    const err=base.find(x=>x.error)?.error;
    if(err){renderFatal(`Data could not be loaded: ${err.message}`);return;}
    const [f,c,a,s,d]=base;
    state.faculty=f.data||[];state.courses=c.data||[];state.primaryAssignments=a.data||[];state.statuses=s.data||[];state.deadlines=d.data||[];
    state.term = await loadActiveTerm();
    const termId = state.term.id;
    const [weeks,termMilestones,courseSections,courseFaculty,classTests,classTestHistory,courseOutlines,feedbackStatuses,courseFileStatuses,sessionalConfigs,sessionalSessions,assessmentComponents,assessmentInstances,sessionalGradeAssignments,sessionalGradeStatuses,labConfigs,labSessions,labAssessmentTypes,labAssessmentItems,labActivityAssignments,events,notifications] = await Promise.all([
      selectOptional('academic_weeks', q=>q.select('*').eq('term_id',termId).order('week_no')),
      selectOptional('term_milestones', q=>q.select('*').eq('term_id',termId).order('milestone_date')),
      selectOptional('course_sections', q=>q.select('*')),
      selectOptional('course_faculty', q=>q.select('*')),
      selectOptional('class_tests', q=>q.select('*').order('date')),
      selectOptional('class_test_history', q=>q.select('*').order('created_at',{ascending:false})),
      selectOptional('course_outline_statuses', q=>q.select('*')),
      selectOptional('feedback_statuses', q=>q.select('*')),
      selectOptional('course_file_statuses', q=>q.select('*')),
      selectOptional('sessional_course_configs', q=>q.select('*')),
      selectOptional('sessional_sessions', q=>q.select('*').order('date')),
      selectOptional('assessment_components', q=>q.select('*')),
      selectOptional('assessment_instances', q=>q.select('*').order('due_date')),
      selectOptional('sessional_grade_assignments', q=>q.select('*')),
      selectOptional('sessional_grade_statuses', q=>q.select('*')),
      selectOptional('lab_course_config', q=>q.select('*')),
      selectOptional('lab_sessions', q=>q.select('*').order('date')),
      selectOptional('lab_assessment_types', q=>q.select('*')),
      selectOptional('lab_assessment_items', q=>q.select('*').order('due_date')),
      selectOptional('lab_activity_assignments', q=>q.select('*')),
      selectOptional('academic_events', q=>q.select('*').order('event_date')),
      selectOptional('notifications', q=>q.select('*').order('created_at',{ascending:false}).limit(80))
    ]);
    Object.assign(state,{academicWeeks:weeks,termMilestones,courseSections,courseFaculty,classTests,classTestHistory,courseOutlines,feedbackStatuses,courseFileStatuses,sessionalConfigs,sessionalSessions,assessmentComponents,assessmentInstances,sessionalGradeAssignments,sessionalGradeStatuses,labConfigs,labSessions,labAssessmentTypes,labAssessmentItems,labActivityAssignments,events,notifications});
    if(!state.selectedWeek) state.selectedWeek=state.term.latest_completed_week || 1;
    state.auditLogs=[];
    if(isAdmin()){
      const audit=await state.supabase.from('audit_logs').select('id,actor,table_name,action,row_key,old_value,new_value,created_at').order('created_at',{ascending:false}).limit(80);
      if(!audit.error) state.auditLogs=audit.data||[];
    }
    render();
  }

  function renderLocked(){
    $app.innerHTML=`<div class="locked"><div class="locked-card">
      <p class="eyebrow">Secure deployment not configured</p><h1>BME <span style="color:var(--accent)">Workflow</span></h1>
      <p>This copy is intentionally locked. No academic data is embedded in the public site. Configure Supabase authentication and Row Level Security before production deployment.</p>
      <div class="code-note">Production: configure GitHub repository variables SUPABASE_URL and SUPABASE_ANON_KEY.<br>Local anonymous preview: append <b>?demo=1</b> to the URL.</div>
    </div></div>`;
  }
  function renderFatal(msg){$app.innerHTML=`<div class="locked"><div class="locked-card"><p class="eyebrow">System error</p><h1>BME Workflow</h1><div class="notice error">${esc(msg)}</div></div></div>`;}
  function renderUnauthorized(){ $app.innerHTML=`<div class="locked"><div class="locked-card"><p class="eyebrow">Access denied</p><h1>Unauthorized account</h1><p>Your login succeeded, but this account is not on the approved faculty allowlist. No academic data has been disclosed.</p></div></div>`; }

  function renderAuth(message='', type=''){
    $app.innerHTML=`<div class="auth-page"><div class="auth-wrap">
      <div class="auth-brand"><p class="eyebrow">Secure Academic Workflow</p><h1 class="brand">BME <span>Workflow</span></h1><p class="subtitle">Complete faculty academic activity management.</p></div>
      <div class="auth-grid">
        <div class="auth-card"><span class="kicker">Existing Account</span><h2>Sign in</h2><p>Use your BME BUET faculty email and the password you set during sign up.</p>
          <form id="signinForm"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username" placeholder="name@bme.buet.ac.bd"><div class="field-help">Only @bme.buet.ac.bd addresses are accepted.</div></div><div class="field"><label>Password</label><input type="password" name="password" required autocomplete="current-password"></div><div class="auth-actions"><button class="btn primary" type="submit">Sign in</button><button class="btn" type="button" id="magicBtn">Email magic link</button></div></form>
          ${message?`<div class="notice ${esc(type)}">${esc(message)}</div>`:''}
        </div>
        <div class="auth-card"><span class="kicker">New Faculty Account</span><h2>Sign up</h2><p>Only a valid institutional address can create an account. After signup, use the same email and password to sign in.</p>
          <form id="signupForm"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username" placeholder="teacher@bme.buet.ac.bd"><div class="field-help">Use any faculty name before @bme.buet.ac.bd.</div></div><div class="field"><label>Set Password</label><input type="password" name="password" required autocomplete="new-password"></div><div class="auth-actions"><button class="btn accent" type="submit">Create account</button></div></form>
          <div class="notice">Testing shortcut: ${TEST_ADMIN_EMAIL} can sign in with any non-empty password and opens demo admin mode.</div>
        </div>
      </div>
    </div></div>`;
    document.getElementById('signinForm').addEventListener('submit',signIn);
    document.getElementById('signupForm').addEventListener('submit',signUp);
    document.querySelectorAll('[name=email]').forEach(input=>{input.addEventListener('input',()=>validateEmailInput(input));validateEmailInput(input);});
    document.getElementById('magicBtn').addEventListener('click',magicLink);
  }
  function facultyEmailError(email){
    if(!email) return 'Enter your BME BUET faculty email.';
    if(!FACULTY_EMAIL_RE.test(email)) return 'Use an address like name@bme.buet.ac.bd.';
    return '';
  }
  function authEmailError(input,email){
    if(input?.form?.id === 'signinForm' && email.toLowerCase() === TEST_ADMIN_EMAIL) return '';
    return facultyEmailError(email);
  }
  function isTestAdminShortcut(email,password){ return email.toLowerCase() === TEST_ADMIN_EMAIL && password.length > 0; }
  function validateEmailInput(input){
    const help=input?.closest('.field')?.querySelector('.field-help'), submit=input?.form?.querySelector('[type="submit"]');
    if(!input || !help || !submit) return true;
    const email=input.value.trim();
    const error=authEmailError(input,email);
    input.setCustomValidity(error);
    input.classList.toggle('invalid', !!error && !!email);
    help.textContent=email.toLowerCase() === TEST_ADMIN_EMAIL ? 'Testing shortcut: opens demo admin mode with any password.' : error || 'This email can be used to sign up or sign in.';
    help.className=`field-help ${error && email ? 'error' : error ? '' : 'success'}`;
    submit.disabled=!!error;
    return !error;
  }
  function validateAuthForm(form){
    const input=form.querySelector('[name=email]');
    const valid=validateEmailInput(input);
    if(!valid) form.reportValidity();
    return valid;
  }
  function authCredentials(form){
    const fd=new FormData(form);
    return {email:String(fd.get('email') || '').trim().toLowerCase(),password:String(fd.get('password') || '')};
  }
  async function signIn(e){
    e.preventDefault();
    const {email,password}=authCredentials(e.currentTarget);
    if(isTestAdminShortcut(email,password)){
      loadDemo();
      render();
      toast('Test admin demo mode enabled. No protected Supabase data was loaded.','success');
      return;
    }
    if(!validateAuthForm(e.currentTarget)) return;
    const {error}=await state.supabase.auth.signInWithPassword({email,password});
    if(error)renderAuth(error.message,'error');
  }
  async function signUp(e){
    e.preventDefault();
    if(!validateAuthForm(e.currentTarget)) return;
    const {email,password}=authCredentials(e.currentTarget);
    const redirectTo=location.href.split('?')[0];
    const {data,error}=await state.supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
    if(error){renderAuth(error.message,'error');return;}
    if(data.session){await bootstrap();return;}
    renderAuth('Account created. Check your institutional inbox if Supabase asks for email confirmation, then sign in with the same password.','success');
  }
  async function magicLink(){
    const email=document.querySelector('#signinForm [name=email]').value.trim().toLowerCase();
    if(facultyEmailError(email)){toast('Enter a valid @bme.buet.ac.bd email first.','error');return;}
    const redirectTo=location.href.split('?')[0];
    const {error}=await state.supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});
    if(error)toast(error.message,'error');else renderAuth('Magic link sent. Check your institutional inbox.','success');
  }

  function shell(content){
    const f=state.profile?.faculty || byId(state.faculty,profileFacultyId()) || {};
    const nav=[['home','H','Home'],['tasks','T','My Tasks'],['courses','C','My Courses'],['ct','CT','CT Calendar'],['calendar','D','Dept Calendar'],['general','G','General'],['workload','W','Workload'],['notifications','N','Notifications']];
    if(isAdmin()) nav.push(['setup','S','Setup Centre'],['conflicts','!','Conflicts'],['admin','A','Admin']);
    const term=activeTerm();
    return `<div class="shell">
      <header class="topbar"><div><p class="eyebrow">Academic Responsibility Management</p><h1 class="brand">BME <span>Workflow</span></h1><p class="subtitle">Faculty-centered academic activity management across theory, CT, sessional, feedback, and course-file work.</p></div><div class="term-badge"><b>${esc(term.name)}</b>Academic Week ${esc(term.latest_completed_week || 0)} of ${esc(term.total_teaching_weeks || 0)}<br>${state.demo?'DEMO ADMIN':'Authenticated'}</div></header>
      <div class="app-grid"><aside class="sidebar"><div class="profile-mini"><p class="profile-name">${esc(f.full_name||'Faculty')}</p><div class="profile-meta">${esc(f.designation||'')} | ${esc(state.profile.app_role||'faculty').toUpperCase()}</div></div><nav class="nav">${nav.map(([v,i,l])=>`<button data-nav="${v}" class="${state.view===v?'active':''}"><span>${i}</span>${l}</button>`).join('')}<button id="logoutBtn"><span>Q</span>${state.demo?'Exit Demo':'Logout'}</button></nav></aside><main class="main">${content}</main></div>
    </div><div id="modalRoot"></div>`;
  }

  function render(){
    if(!activeProfile()){renderUnauthorized();return;}
    let content='';
    if(state.courseId) content=renderCourseDetail(state.courseId);
    else if(state.view==='tasks') content=renderTasks();
    else if(state.view==='courses') content=renderCourses();
    else if(state.view==='ct') content=renderCtCalendar();
    else if(state.view==='calendar') content=renderDepartmentCalendar();
    else if(state.view==='general') content=renderGeneral();
    else if(state.view==='workload') content=renderWorkload();
    else if(state.view==='notifications') content=renderNotifications();
    else if(state.view==='setup') content=renderSetupCentre();
    else if(state.view==='conflicts') content=renderConflicts();
    else if(state.view==='admin') content=renderAdmin();
    else content=renderHome();
    $app.innerHTML=shell(content);
    bindCommon();
    if(state.modal) renderModal();
  }

  function bindCommon(){
    document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.nav;state.courseId=null;state.modal=null;render();}));
    document.querySelectorAll('[data-open-course]').forEach(b=>b.addEventListener('click',()=>{state.courseId=b.dataset.openCourse;render();}));
    document.querySelectorAll('[data-status-change]').forEach(b=>b.addEventListener('change',e=>updateStatus(e.target.dataset.course,e.target.dataset.task,e.target.value)));
    document.querySelectorAll('[data-week-select]').forEach(b=>b.addEventListener('click',()=>{state.selectedWeek=Number(b.dataset.weekSelect);render();}));
    document.querySelectorAll('[data-calendar-filter]').forEach(b=>b.addEventListener('click',()=>{state.calendarFilter=b.dataset.calendarFilter;render();}));
    document.querySelectorAll('[data-term-action]').forEach(b=>b.addEventListener('click',()=>updateTermAction(b.dataset.termAction)));
    const form=document.getElementById('termForm'); if(form) form.addEventListener('submit',saveTermSettings);
    const lo=document.getElementById('logoutBtn'); if(lo) lo.addEventListener('click',async()=>{if(state.demo){location.href=location.pathname;}else await state.supabase.auth.signOut();});
  }

  function renderHome(){
    const theory=myTheoryTasks();
    const myEvents=myAcademicEvents();
    const dueWeek=myEvents.filter(e=>daysFromToday(e.date)>=0 && daysFromToday(e.date)<=7 && !['completed','cancelled'].includes(e.status)).length;
    const todayEvents=myEvents.filter(e=>e.date===todayIso()).slice(0,5);
    const needs=attentionItems().slice(0,7);
    const cts=myClassTests().filter(ct=>daysFromToday(ctDate(ct))>=0).sort((a,b)=>(ctDate(a) || '').localeCompare(ctDate(b) || '')).slice(0,5);
    const sessional=[...myLabSessions(),...myLabItems()].filter(x=>daysFromToday(x.date || x.due_date || x.scheduled_date)>=0).sort((a,b)=>(a.date || a.due_date || a.scheduled_date || '').localeCompare(b.date || b.due_date || b.scheduled_date || '')).slice(0,5);
    const recent=recentChanges().slice(0,5);
    return `${renderTermTracker()}<div class="page-head"><div><p class="eyebrow">Personal Home</p><h2>Good ${dayPart()}, ${esc(firstName(state.profile?.faculty?.full_name||facultyName(profileFacultyId())))}</h2><p>Your feed prioritizes what to do next, who is waiting, and what changed recently.</p></div></div>
      <div class="metrics"><div class="metric"><div class="metric-label">Needs attention</div><div class="metric-value">${needs.length}</div><div class="metric-note">Theory, CT, and sessional items</div></div><div class="metric"><div class="metric-label">Due this week</div><div class="metric-value">${dueWeek}</div><div class="metric-note">Academic Week ${esc(activeTerm().latest_completed_week)}</div></div><div class="metric"><div class="metric-label">Upcoming CTs</div><div class="metric-value">${cts.length}</div><div class="metric-note">Assigned or course-linked</div></div><div class="metric"><div class="metric-label">Sessional activities</div><div class="metric-value">${sessional.length}</div><div class="metric-note">Sessions and assessments</div></div></div>
      <div class="home-grid"><section class="panel"><div class="panel-title"><h3>Needs Attention</h3><span class="meta">PRIORITY</span></div><div class="stack">${needs.length?needs.map(actionCard).join(''):'<div class="empty">Nothing urgent right now.</div>'}</div></section><section class="panel"><div class="panel-title"><h3>Today</h3><span class="meta">${todayEvents.length} EVENTS</span></div><div class="stack">${todayEvents.length?todayEvents.map(eventCard).join(''):'<div class="empty">No academic events today.</div>'}</div></section><section class="panel"><div class="panel-title"><h3>Upcoming CTs</h3><span class="meta">CALENDAR</span></div><div class="stack">${cts.length?cts.map(ctCard).join(''):'<div class="empty">No upcoming class tests.</div>'}</div></section><section class="panel"><div class="panel-title"><h3>Upcoming Sessional Activities</h3><span class="meta">SESSIONAL</span></div><div class="stack">${sessional.length?sessional.map(labSmallCard).join(''):'<div class="empty">No upcoming sessional activities.</div>'}</div></section><section class="panel"><div class="panel-title"><h3>Recently Changed</h3><span class="meta">AUDIT</span></div><div class="stack">${recent.length?recent.map(changeCard).join(''):'<div class="empty">No recent changes recorded.</div>'}</div></section></div>`;
  }

  function renderTermTracker(){
    const term=activeTerm(), total=Number(term.total_teaching_weeks || 14), latest=Number(term.latest_completed_week || 0), remaining=Math.max(total-latest,0), pct=total ? Math.round(latest/total*100) : 0;
    const selected=state.selectedWeek || latest || 1;
    return `<section class="term-tracker panel"><div class="term-summary"><div><p class="eyebrow">Term Week Tracker</p><h2>${esc(term.name)}</h2><p>Week ${esc(latest)} of ${esc(total)} completed. Calendar is ${esc(term.calendar_status || 'active')}${term.pause_reason ? `: ${esc(term.pause_reason)}` : ''}.</p></div><div class="term-stats"><div><b>${esc(latest)} / ${esc(total)}</b><span>teaching weeks completed</span></div><div><b>${esc(remaining)}</b><span>weeks remaining</span></div><div><b>${esc(pct)}%</b><span>term progress</span></div></div></div>
      <div class="week-strip">${Array.from({length:total},(_,i)=>weekCell(i+1,latest,selected)).join('')}</div>
      <div class="week-footer"><div class="progress"><span style="width:${pct}%"></span></div>${isAdmin()?`<div class="toolbar"><button class="btn small" data-term-action="previous">Previous Week</button><button class="btn small accent" data-term-action="advance">Advance Week</button><button class="btn small" data-term-action="${term.calendar_status==='paused'?'resume':'pause'}">${term.calendar_status==='paused'?'Resume Calendar':'Pause Calendar'}</button></div>`:''}</div>
      ${renderWeekPlanner(selected)}</section>`;
  }
  function weekCell(n,latest,selected){
    const cls=n===selected?'selected':n<latest?'past':n===latest?'latest':'future';
    return `<button class="week-cell ${cls}" data-week-select="${n}"><b>${n}</b><span>${n<latest?'Done':n===latest?'Latest':'Future'}</span></button>`;
  }
  function renderWeekPlanner(weekNo){
    const events=eventsForAll().filter(e=>e.week===weekNo).slice(0,6);
    return `<div class="week-planner"><div><p class="eyebrow">Academic Week ${esc(weekNo)}</p><h3>Light Planner</h3></div><div class="mini-event-list">${events.length?events.map(e=>`<div class="mini-event" data-open-course="${esc(e.courseId)}"><b>${esc(e.type)}</b><span>${esc(e.course?.course_code || '')} | ${esc(e.title)} | ${fmtDate(e.date)}</span></div>`).join(''):'<div class="empty compact">No CTs, sessional activities, or deadlines mapped to this week.</div>'}</div></div>`;
  }

  function renderTasks(){
    let rows=[
      ...myTheoryTasks().map(t=>({kind:'Theory', title:t.label, course:t.course, date:t.due_date, status:t.status, assignee:t.assignee_id, raw:t})),
      ...myClassTests().map(ct=>({kind:'Class Test', title:ct.title || `CT ${ct.ct_number || ''}`, course:courseById(ct.course_id), date:ctDate(ct), status:ct.status || 'not_planned', assignee:ct.responsible_faculty || ct.responsible_faculty_id, raw:ct})),
      ...myLabSessions().map(s=>({kind:'Sessional Session', title:`Session ${s.session_no || s.sequence_number || ''} - ${s.title}`, course:courseById(s.course_id), date:s.date || s.scheduled_date, status:s.status, assignee:s.assigned_faculty, raw:s})),
      ...myLabItems().map(i=>({kind:'Sessional Assessment', title:i.title, course:courseById(i.course_id), date:i.due_date || i.scheduled_date, status:i.status, assignee:i.responsible_faculty, raw:i})),
      ...state.courseOutlines.filter(o=>courseIsMine(courseById(o.course_id))).map(o=>({kind:'Course Outline', title:'Course outline sharing', course:courseById(o.course_id), date:o.due_date || milestoneDate('COURSE_OUTLINE_SHARING'), status:o.status || 'not_started', assignee:o.responsible_faculty, raw:o})),
      ...state.feedbackStatuses.filter(f=>courseIsMine(courseById(f.course_id))).map(f=>({kind:'Feedback', title:'Student feedback', course:courseById(f.course_id), date:f.deadline || milestoneDate('FEEDBACK_DEADLINE'), status:f.status || 'not_started', assignee:f.responsible_faculty, raw:f})),
      ...state.courseFileStatuses.filter(cf=>courseIsMine(courseById(cf.course_id))).map(cf=>({kind:'Course File / CAR', title:'Course File / CAR', course:courseById(cf.course_id), date:cf.deadline || milestoneDate('CAR_DEADLINE'), status:cf.status || 'not_started', assignee:cf.responsible_faculty, raw:cf}))
    ];
    if(state.search){const q=state.search.toLowerCase();rows=rows.filter(t=>`${t.kind} ${t.course.course_code} ${t.course.title} ${t.title}`.toLowerCase().includes(q));}
    if(state.statusFilter!=='all') rows=rows.filter(t=>t.status===state.statusFilter);
    rows.sort((a,b)=>prioritySort({status:a.status,due_date:a.date},{status:b.status,due_date:b.date}));
    const statusOptions={...STATUS_LABEL,...CT_STATUS_LABEL,...SESSIONAL_STATUS_LABEL,...OUTLINE_STATUS_LABEL};
    return `<div class="page-head"><div><p class="eyebrow">Personal Responsibility Queue</p><h2>My Tasks</h2><p>Theory workflow tasks, class tests, sessional sessions, and sessional assessments in one list.</p></div><div class="toolbar"><input id="taskSearch" class="search" placeholder="Search course or responsibility" value="${esc(state.search)}"><select id="statusFilter" class="select"><option value="all">All statuses</option>${Object.entries(statusOptions).map(([v,l])=>`<option value="${v}" ${state.statusFilter===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <section class="panel"><div class="stack">${rows.length?rows.map(unifiedTaskCard).join(''):'<div class="empty">No tasks match this filter.</div>'}</div></section>`;
  }

  function renderCourses(){
    const mine=state.courses.filter(courseIsMine);
    const theory=mine.filter(isTheoryCourse), sessional=mine.filter(isSessionalCourse);
    return `<div class="page-head"><div><p class="eyebrow">Personal Course Feed</p><h2>My Courses</h2><p>Theory and sessional courses are separated because their workflows are intentionally different.</p></div></div>
      <section class="panel"><div class="panel-title"><h3>Theory Courses</h3><span class="meta">${theory.length} ACTIVE</span></div><div class="course-grid">${theory.map(c=>courseCard(c,true)).join('')||'<div class="empty">No assigned theory courses.</div>'}</div></section>
      <section class="panel"><div class="panel-title"><h3>Sessional Courses</h3><span class="meta">${sessional.length} ACTIVE</span></div><div class="course-grid">${sessional.map(c=>courseCard(c,true)).join('')||'<div class="empty">No assigned sessional courses.</div>'}</div></section>`;
  }

  function renderGeneral(){
    const all=taskObjects(), events=eventsForAll(), pct=progressPct(all), pending=all.filter(t=>t.status!=='completed').length;
    const ctWeek=state.classTests.filter(ct=>daysFromToday(ctDate(ct))>=0 && daysFromToday(ctDate(ct))<=7).length;
    const sessionalPending=[...(state.sessionalSessions.length ? state.sessionalSessions : state.labSessions),...(state.assessmentInstances.length ? state.assessmentInstances : state.labAssessmentItems)].filter(x=>!['completed','cancelled','marks_uploaded'].includes(x.status)).length;
    const outlinesShared=state.courseOutlines.filter(x=>x.status==='shared_with_students').length;
    const feedbackDone=state.feedbackStatuses.filter(x=>x.status==='completed').length;
    const carDone=state.courseFileStatuses.filter(x=>x.status==='uploaded' || x.status==='completed').length;
    const overdue=events.filter(e=>e.date < todayIso() && !['completed','conducted','cancelled'].includes(e.status)).length;
    return `${renderTermTracker()}<div class="page-head"><div><p class="eyebrow">Department Summary</p><h2>General Overview</h2><p>Operational progress only. No question-paper content is exposed.</p></div></div><div class="metrics"><div class="metric"><div class="metric-label">Theory courses</div><div class="metric-value">${theoryCourses().length}</div><div class="metric-note">${pending} pending theory tasks</div></div><div class="metric"><div class="metric-label">Sessional courses</div><div class="metric-value">${labCourses().length}</div><div class="metric-note">${sessionalPending} pending activities</div></div><div class="metric"><div class="metric-label">CTs this week</div><div class="metric-value">${ctWeek}</div><div class="metric-note">Workbook CT lifecycle</div></div><div class="metric"><div class="metric-label">Outlines shared</div><div class="metric-value">${outlinesShared}/${state.courseOutlines.length || state.courses.length}</div><div class="metric-note">Global deadline ${fmtDate(milestoneDate('COURSE_OUTLINE_SHARING'))}</div></div></div>
      <div class="metrics"><div class="metric"><div class="metric-label">Theory progress</div><div class="metric-value">${pct}%</div><div class="metric-note">${all.filter(t=>t.status==='completed').length} of ${all.length} tasks</div></div><div class="metric"><div class="metric-label">Feedback</div><div class="metric-value">${feedbackDone}/${state.feedbackStatuses.length || state.courses.length}</div><div class="metric-note">Student feedback workflow</div></div><div class="metric"><div class="metric-label">Course File / CAR</div><div class="metric-value">${carDone}/${state.courseFileStatuses.length || state.courses.length}</div><div class="metric-note">Archive readiness</div></div><div class="metric"><div class="metric-label">At risk</div><div class="metric-value">${overdue}</div><div class="metric-note">Overdue event signals</div></div></div>
      <div class="attention"><section class="panel"><div class="panel-title"><h3>Completion by Stage</h3><span class="meta">THEORY</span></div>${STAGE_ORDER.map(stage=>stageProgress(stage)).join('')}</section><section class="panel"><div class="panel-title"><h3>Course Health</h3><span class="meta">${overdue} OVERDUE SIGNALS</span></div><div class="health-list">${state.courses.map(healthItem).join('')}</div></section></div>`;
  }

  function renderCourseDetail(id){
    const c=byId(state.courses,id); if(!c){state.courseId=null;return renderHome();}
    return isSessionalCourse(c) ? renderSessionalCourseDetail(c) : renderTheoryCourseDetail(c);
  }
  function renderTheoryCourseDetail(c){
    const tasks=TASKS.map(t=>({...t,course:c,assignee_id:assigneeFor(c.id,t.key),status:statusFor(c,t.key),due_date:dueDateFor(c,t.key)}));
    const stages=STAGE_ORDER.map(stage=>({stage,tasks:tasks.filter(t=>t.stage===stage)}));
    const cts=classTestsFor(c.id);
    return `<div class="page-head"><div><button class="btn small" id="backCourse">Back</button><p class="eyebrow" style="margin-top:15px">${esc(c.course_code)} | Theory | Academic Week ${esc(activeTerm().latest_completed_week)}</p><h2>${esc(c.title)}</h2><p>Question milestone: ${fmtDate(c.question_deadline)} | Final gradesheet milestone: ${fmtDate(c.final_gradesheet_deadline)}</p></div><div>${statusBadge(progressPct(tasks)===100?'completed':'in_progress')}</div></div>
      <section class="panel"><div class="panel-title"><h3>Theory Workflow</h3><span class="meta">${progressPct(tasks)}% COMPLETE</span></div><div class="workflow">${stages.map((s,i)=>workflowStage(s,i)).join('')}</div></section>
      ${renderCourseOutline(c)}
      <section class="panel"><div class="panel-title"><h3>Class Tests</h3><span class="meta">${cts.length} CT ITEMS</span></div><div class="stack">${cts.length?cts.map(ctCard).join(''):'<div class="empty">No class tests scheduled for this course.</div>'}</div></section>`;
  }
  function renderSessionalCourseDetail(c){
    const config=labConfigFor(c.id), sessions=labSessionsFor(c.id), types=assessmentComponentsFor(c.id), items=labItemsFor(c.id);
    return `<div class="page-head"><div><button class="btn small" id="backCourse">Back</button><p class="eyebrow" style="margin-top:15px">${esc(c.course_code)} | Sessional ${c.sessional_subtype?`| ${esc(c.sessional_subtype)}`:''} | Academic Week ${esc(activeTerm().latest_completed_week)}</p><h2>${esc(c.title)}</h2><p>Sessional courses use configurable sessions, assessments, and gradesheet workflow instead of the theory exam workflow.</p></div>${statusBadge(config.config_status || 'setup_required', SESSIONAL_STATUS_LABEL)}</div>
      <div class="metrics"><div class="metric"><div class="metric-label">Sessions</div><div class="metric-value">${sessions.length || config.session_count || 0}</div><div class="metric-note">${progressPct(sessions)}% conducted/completed</div></div><div class="metric"><div class="metric-label">Assessment types</div><div class="metric-value">${types.length}</div><div class="metric-note">Reports, quiz, viva, test, final, custom</div></div><div class="metric"><div class="metric-label">Assessment items</div><div class="metric-value">${items.length}</div><div class="metric-note">${progressPct(items)}% complete</div></div><div class="metric"><div class="metric-label">Version</div><div class="metric-value">${config.version || 1}</div><div class="metric-note">Config changes are audited</div></div></div>
      ${renderCourseOutline(c)}
      <section class="panel"><div class="panel-title"><h3>Assessment Components</h3><span class="meta">CONFIGURABLE</span></div>${types.length?`<div class="table-wrap"><table class="table"><thead><tr><th>Component</th><th>Marks</th><th>Count</th><th>Best/Drop</th><th>Scope</th><th>Responsible</th></tr></thead><tbody>${types.map(t=>`<tr><td>${esc(t.name)}</td><td>${esc(t.marks_each || t.marks || 0)}</td><td>${esc(t.quantity || t.count || 1)}</td><td>${esc(t.counted_quantity || t.best_of || t.quantity || t.count || 1)}</td><td>${esc(t.scope || t.section || 'Entire Course')}</td><td>${esc(facultyName(t.responsible_faculty))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="empty">No assessment components configured yet.</div>'}</section>
      <section class="panel"><div class="panel-title"><h3>Sessional Sessions</h3><span class="meta">SESSION 01...N</span></div><div class="stack">${sessions.length?sessions.map(labSmallCard).join(''):'<div class="empty">No sessional sessions generated yet.</div>'}</div></section>
      <section class="panel"><div class="panel-title"><h3>Assessment Items</h3><span class="meta">LINKED TO SESSIONS</span></div><div class="stack">${items.length?items.map(labSmallCard).join(''):'<div class="empty">No assessment items generated yet.</div>'}</div></section>`;
  }
  function renderCourseOutline(c){
    const outline=state.courseOutlines.find(o=>o.course_id===c.id) || {};
    const due=outline.due_date || milestoneDate('COURSE_OUTLINE_SHARING');
    return `<section class="panel"><div class="panel-title"><h3>Course Outline</h3><span class="meta">GLOBAL DEADLINE ${fmtDate(due)}</span></div><div class="health-item"><div class="health-main"><span class="health-dot ${outline.status==='shared_with_students'?'done':outline.status==='prepared'?'green':'yellow'}"></span><div><b>${esc(OUTLINE_STATUS_LABEL[outline.status || 'not_started'])}</b><div style="font-size:10px;color:var(--ink-soft)">Workflow: Under Preparation -> Prepared -> Shared with Students</div></div></div>${statusBadge(outline.status || 'not_started',OUTLINE_STATUS_LABEL)}</div></section>`;
  }

  function renderCtCalendar(){
    const tests=[...state.classTests].sort((a,b)=>(ctDate(a) || '').localeCompare(ctDate(b) || '') || ctTime(a).localeCompare(ctTime(b)));
    const conflicts=findCtConflicts();
    return `<div class="page-head"><div><p class="eyebrow">Class Test Module</p><h2>CT Calendar</h2><p>Month/week/batch/course views can be represented through the filters below. Conflict detection uses batch, section, date, and time.</p></div></div>
      <div class="metrics"><div class="metric"><div class="metric-label">CT records</div><div class="metric-value">${tests.length}</div><div class="metric-note">Any count, not CT1-CT5 columns</div></div><div class="metric"><div class="metric-label">Marks published</div><div class="metric-value">${tests.filter(t=>['marks_published','completed'].includes(t.status)).length}</div><div class="metric-note">Final CT lifecycle stage</div></div><div class="metric"><div class="metric-label">Recent changes</div><div class="metric-value">${state.classTestHistory.length}</div><div class="metric-note">Reschedule history</div></div><div class="metric"><div class="metric-label">Conflicts</div><div class="metric-value">${conflicts.length}</div><div class="metric-note">Same slot overlap</div></div></div>
      <section class="panel"><div class="panel-title"><h3>Class Tests</h3><span class="meta">BATCH / COURSE / MY COURSES</span></div><div class="calendar-list">${tests.map(ctCard).join('')||'<div class="empty">No class tests yet.</div>'}</div></section>
      <section class="panel"><div class="panel-title"><h3>CT Conflicts</h3><span class="meta">AUTOMATIC</span></div>${conflicts.map(x=>conflictBox(x,true)).join('') || '<div class="empty">No CT schedule conflicts detected.</div>'}</section>`;
  }

  function renderDepartmentCalendar(){
    let events=eventsForAll();
    if(state.calendarFilter!=='all') events=events.filter(e=>e.type===state.calendarFilter);
    const filters=['all','Theory Deadline','Class Test','Sessional Session','Sessional Assessment','Course Outline','Feedback','Course File','Deadline'];
    return `<div class="page-head"><div><p class="eyebrow">Universal Academic Events</p><h2>Department Calendar</h2><p>Shared event layer for theory deadlines, CTs, sessional activities, feedback, course files, and term milestones.</p></div><div class="toolbar">${filters.map(f=>`<button class="btn small ${state.calendarFilter===f?'primary':''}" data-calendar-filter="${esc(f)}">${esc(f)}</button>`).join('')}</div></div>
      <section class="panel"><div class="calendar-list">${events.map(eventCard).join('')||'<div class="empty">No events match this filter.</div>'}</div></section>`;
  }

  function renderWorkload(){
    const rows=state.faculty.map(f=>{
      const theory=taskObjects().filter(t=>t.assignee_id===f.id && t.status!=='completed').length;
      const ct=state.classTests.filter(c=>(c.responsible_faculty===f.id || c.responsible_faculty_id===f.id) && !['completed','marks_published','cancelled'].includes(c.status)).length;
      const sessional=(state.sessionalSessions.length ? state.sessionalSessions : state.labSessions).filter(s=>s.assigned_faculty===f.id && !['completed','cancelled'].includes(s.status)).length + (state.assessmentInstances.length ? state.assessmentInstances : state.labAssessmentItems).filter(i=>i.responsible_faculty===f.id && !['completed','cancelled','marks_uploaded'].includes(i.status)).length;
      return {...f,theory,ct,sessional,total:theory+ct+sessional};
    }).sort((a,b)=>b.total-a.total);
    return `<div class="page-head"><div><p class="eyebrow">Faculty Workload</p><h2>Workload View</h2><p>Counts current unfinished ownership across theory tasks, CTs, and sessional activities.</p></div></div><section class="panel"><div class="table-wrap"><table class="table"><thead><tr><th>Faculty</th><th>Theory</th><th>CT</th><th>Sessional</th><th>Total</th></tr></thead><tbody>${rows.map(r=>`<tr><td><b>${esc(r.full_name)}</b><br><span style="color:var(--ink-soft)">${esc(r.designation || '')}</span></td><td>${r.theory}</td><td>${r.ct}</td><td>${r.sessional}</td><td><b>${r.total}</b></td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderSetupCentre(){
    if(!isAdmin()) return '<div class="empty">Administrator permission required.</div>';
    const inferred=state.courses.filter(c=>!c.course_type).length;
    const sessionalNeed=labCourses().filter(c=>(labConfigFor(c.id).config_status || 'setup_required') !== 'configured').length;
    const outlineMissing=state.courseOutlines.filter(o=>o.status!=='shared_with_students').length || Math.max(state.courses.length-state.courseOutlines.length,0);
    const warnings=setupWarnings();
    return `<div class="page-head"><div><p class="eyebrow">Setup Centre</p><h2>Term and Course Setup</h2><p>Administrative readiness checks for the active term, course type, sections, CTs, outlines, feedback, CAR, and sessional configuration.</p></div></div>
      <div class="setup-grid"><div class="setup-card"><b>Academic term</b><span>${esc(activeTerm().name)} | Week ${esc(activeTerm().latest_completed_week)} of ${esc(activeTerm().total_teaching_weeks)}</span></div><div class="setup-card"><b>Explicit course type</b><span>${inferred ? `${inferred} inferred from odd/even code` : 'All courses have explicit type'}</span></div><div class="setup-card"><b>Sessional setup</b><span>${sessionalNeed ? `${sessionalNeed} sessional course(s) need setup` : 'All sessional courses configured'}</span></div><div class="setup-card"><b>Outline sharing</b><span>${outlineMissing ? `${outlineMissing} outline record(s) need attention` : 'All outlines shared'}</span></div></div>
      <section class="panel"><div class="panel-title"><h3>Smart Warnings</h3><span class="meta">${warnings.length} SIGNALS</span></div>${warnings.map(x=>conflictBox(x,true)).join('') || '<div class="empty">No setup warnings detected.</div>'}</section>
      <section class="panel"><div class="panel-title"><h3>Course Readiness</h3><span class="meta">ADMIN REVIEW</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Course</th><th>Type</th><th>Sections</th><th>Setup</th><th>Health</th></tr></thead><tbody>${state.courses.map(c=>`<tr><td><b>${esc(c.course_code)}</b><br>${esc(c.title)}</td><td>${typeBadge(c)}</td><td>${esc(sectionsFor(c.id).join(', ') || 'X')}</td><td>${isSessionalCourse(c)?statusBadge(labConfigFor(c.id).config_status || 'setup_required',SESSIONAL_STATUS_LABEL):statusBadge(c.status==='published'?'completed':'waiting')}</td><td>${esc(courseHealth(c).label)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }

  function renderNotifications(){
    const items=notificationItems();
    return `<div class="page-head"><div><p class="eyebrow">Action Signals</p><h2>Notifications</h2><p>Generated from assignments, deadlines, week changes, CT changes, and sessional activities.</p></div></div><section class="panel"><div class="panel-title"><h3>Current Notifications</h3><span class="meta">${items.length} ACTIVE</span></div><div class="stack">${items.length?items.map(n=>`<article class="task-card" ${n.courseId?`data-open-course="${esc(n.courseId)}"`:''}><div class="task-top"><div><div class="task-role">${esc(n.title)}</div><div class="task-title">${esc(n.detail)}</div></div>${statusBadge(n.level)}</div></article>`).join(''):'<div class="empty">Nothing currently needs a notification.</div>'}</div></section>`;
  }

  function renderConflicts(){
    if(!isAdmin()) return '<div class="empty">Administrator permission required.</div>';
    const {errors,warnings}=findConflicts();
    return `<div class="page-head"><div><p class="eyebrow">Fail-safe Center</p><h2>Conflicts</h2><p>Hard errors must be fixed. Warnings require administrative review but may be legitimate.</p></div></div><div class="metrics"><div class="metric"><div class="metric-label">Hard errors</div><div class="metric-value">${errors.length}</div><div class="metric-note">Cannot be published in production</div></div><div class="metric"><div class="metric-label">Warnings</div><div class="metric-value">${warnings.length}</div><div class="metric-note">Review recommended</div></div></div><section class="panel"><div class="panel-title"><h3>Validation Results</h3><span class="meta">${state.courses.length} COURSES CHECKED</span></div>${errors.map(x=>conflictBox(x,false)).join('')}${warnings.map(x=>conflictBox(x,true)).join('')||(!errors.length?'<div class="empty">No conflicts or warnings detected.</div>':'')}</section>`;
  }

  function renderAdmin(){
    if(!isAdmin()) return '<div class="empty">Administrator permission required.</div>';
    return `<div class="page-head"><div><p class="eyebrow">Administrator Workspace</p><h2>Admin</h2><p>Term controls, assignment matrix, and immutable audit trail.</p></div></div>${renderTermAdmin()}
      <section class="panel"><div class="panel-title"><h3>Theory Assignment Matrix</h3><span class="meta">DERIVED ROLES LOCKED</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Course</th><th>QP-A</th><th>QP-B</th><th>Moderator 1</th><th>Moderator 2</th><th>Scrutinizer</th><th></th></tr></thead><tbody>${theoryCourses().map(c=>adminRow(c)).join('')}</tbody></table></div></section>
      <section class="panel"><div class="panel-title"><h3>Recent Audit Trail</h3><span class="meta">IMMUTABLE LOG</span></div>${renderAuditTable()}</section>`;
  }
  function renderTermAdmin(){
    const t=activeTerm();
    return `<section class="panel"><div class="panel-title"><h3>Academic Term Controls</h3><span class="meta">MANUAL CALENDAR</span></div><form id="termForm"><div class="form-grid"><div class="field"><label>Term Name</label><input name="name" value="${esc(t.name)}"></div><div class="field"><label>Number of Teaching Weeks</label><input name="total_teaching_weeks" type="number" min="1" max="52" value="${esc(t.total_teaching_weeks || 14)}"></div><div class="field"><label>Latest Completed Week</label><input name="latest_completed_week" type="number" min="0" max="52" value="${esc(t.latest_completed_week || 0)}"></div><div class="field"><label>Calendar Status</label><select name="calendar_status"><option value="active" ${t.calendar_status!=='paused'?'selected':''}>Active</option><option value="paused" ${t.calendar_status==='paused'?'selected':''}>Paused</option></select></div><div class="field span-2"><label>Pause Reason</label><input name="pause_reason" value="${esc(t.pause_reason || '')}" placeholder="Strike, closure, emergency, make-up week..."></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Save Term Settings</button><button class="btn" type="button" data-term-action="previous">Previous Week</button><button class="btn" type="button" data-term-action="advance">Advance Week</button><button class="btn" type="button" data-term-action="${t.calendar_status==='paused'?'resume':'pause'}">${t.calendar_status==='paused'?'Resume Calendar':'Pause Calendar'}</button></div></div></form></section>`;
  }
  function renderAuditTable(){
    if(!state.auditLogs.length) return '<div class="empty">No audit records available yet.</div>';
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Area</th><th>Action</th><th>Record</th></tr></thead><tbody>${state.auditLogs.slice(0,30).map(l=>`<tr><td>${esc(new Date(l.created_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'}))}</td><td>${esc(l.table_name)}</td><td>${esc(l.action)}</td><td>${esc(l.row_key||'-')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function actionCard(item){
    return `<article class="task-card" data-open-course="${esc(item.courseId)}"><div class="task-top"><div><div class="task-course">${esc(item.kind)}</div><div class="task-role">${esc(item.title)}</div><div class="task-title">${esc(item.detail)}</div></div>${statusBadge(item.status, {...STATUS_LABEL,...CT_STATUS_LABEL,...SESSIONAL_STATUS_LABEL,...OUTLINE_STATUS_LABEL})}</div><div class="task-foot"><span>${item.date?`Due ${fmtDate(item.date)}`:'No date set'}</span><span>Academic Week ${esc(item.week || '-')}</span></div></article>`;
  }
  function unifiedTaskCard(t){
    const canEdit=t.kind==='Theory' && (state.demo || t.assignee===profileFacultyId() || isAdmin());
    const options=['not_started','in_progress','submitted','completed'].map(s=>`<option value="${s}" ${(statusRow(t.course.id,t.raw.key)?.status||'not_started')===s?'selected':''}>${STATUS_LABEL[s]}</option>`).join('');
    return `<article class="task-card" data-open-course="${esc(t.course.id)}"><div class="task-top"><div><div class="task-course">${esc(t.kind)} | ${esc(t.course.course_code || '')}</div><div class="task-role">${esc(t.title)}</div><div class="task-title">${esc(t.course.title || '')}</div></div>${statusBadge(t.status,{...STATUS_LABEL,...CT_STATUS_LABEL,...SESSIONAL_STATUS_LABEL,...OUTLINE_STATUS_LABEL})}</div><div class="task-foot"><span>${t.date?`Due ${fmtDate(t.date)}`:'No date set'}</span>${canEdit?`<select class="select" data-status-change data-course="${esc(t.course.id)}" data-task="${esc(t.raw.key)}" onclick="event.stopPropagation()">${options}</select>`:`<span>${esc(facultyName(t.assignee))}</span>`}</div></article>`;
  }
  function ctCard(ct){
    const c=courseById(ct.course_id);
    return `<article class="task-card" data-open-course="${esc(ct.course_id)}"><div class="task-top"><div><div class="task-course">Class Test | ${esc(c.course_code || '')}</div><div class="task-role">${esc(ct.title || `CT ${ct.ct_number || ''}`)} - Section ${esc(ct.section || 'All')}</div><div class="task-title">${esc(ct.syllabus || (ctDate(ct) ? 'Syllabus not set' : 'Status exists but no CT date has been recorded.'))}</div></div>${statusBadge(ct.status || 'not_planned',CT_STATUS_LABEL)}</div><div class="task-foot"><span>${ctDate(ct)?`${fmtDate(ctDate(ct))} ${esc(ctTime(ct))}`:'Date missing'}</span><span>${esc(facultyName(ct.responsible_faculty || ct.responsible_faculty_id))}</span></div></article>`;
  }
  function labSmallCard(item){
    const isSession='session_no' in item, c=courseById(item.course_id), date=item.date || item.due_date || item.scheduled_date;
    const title=isSession ? `Session ${item.session_no || item.sequence_number || ''} - ${item.title}` : item.title;
    const responsible=isSession ? item.assigned_faculty : item.responsible_faculty;
    return `<article class="task-card" data-open-course="${esc(item.course_id)}"><div class="task-top"><div><div class="task-course">${isSession?'Sessional Session':'Sessional Assessment'} | ${esc(c.course_code || '')}</div><div class="task-role">${esc(title)}</div><div class="task-title">${esc(isSession ? `${item.section || item.scope || 'Entire Course'} ${item.group_label || ''}` : `${item.marks || item.marks_each || 0} marks`)}</div></div>${statusBadge(item.status,SESSIONAL_STATUS_LABEL)}</div><div class="task-foot"><span>${fmtDate(date)}</span><span>${esc(facultyName(responsible))}</span></div></article>`;
  }
  function eventCard(e){
    return `<article class="event-row" data-open-course="${esc(e.courseId)}"><div class="event-date"><b>${fmtDate(e.date)}</b><span>${esc(e.time || `Week ${e.week || '-'}`)}</span></div><div><div class="task-course">${esc(e.type)} | ${esc(e.course?.course_code || '')}</div><div class="task-role">${esc(e.title)}</div><div class="task-title">${esc(e.detail)}</div></div>${statusBadge(e.status,{...STATUS_LABEL,...CT_STATUS_LABEL,...SESSIONAL_STATUS_LABEL,...OUTLINE_STATUS_LABEL})}</article>`;
  }
  function changeCard(item){
    return `<article class="task-card"><div class="task-top"><div><div class="task-course">${esc(item.kind)}</div><div class="task-role">${esc(item.title)}</div><div class="task-title">${esc(item.detail)}</div></div>${statusBadge(item.level)}</div></article>`;
  }
  function courseCard(c,personal=false){
    const health=courseHealth(c);
    const progress=courseProgress(c);
    const roles=courseTeachers(c.id).map(r=>`${r.role.replace(/_/g,' ')} ${r.section ? `(${r.section})` : ''}`);
    const mine=isTheoryCourse(c) ? TASKS.filter(t=>assigneeFor(c.id,t.key)===profileFacultyId()).map(t=>t.short) : roles;
    return `<article class="course-card" data-open-course="${esc(c.id)}"><div class="course-card-head"><div><div class="course-code">${esc(c.course_code)}</div><div class="course-name">${esc(c.title)}</div></div>${typeBadge(c)}</div>${personal?`<div class="course-roles">${mine.map(t=>`<span class="role-chip">${esc(t)}</span>`).join('')}</div>`:''}<div class="progress-row"><span>${esc(health.label)}</span><span>${progress}%</span></div><div class="progress"><span style="width:${progress}%"></span></div></article>`;
  }
  function stageProgress(stage){
    const tasks=taskObjects().filter(t=>t.stage===stage), pct=progressPct(tasks);
    return `<div class="stage-row"><div class="stage-name">${esc(stage)}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="stage-pct">${pct}%</div></div>`;
  }
  function healthItem(c){
    const h=courseHealth(c);
    return `<div class="health-item" data-open-course="${esc(c.id)}"><div class="health-main"><span class="health-dot ${h.tone}"></span><div><b>${esc(c.course_code)}</b><div style="font-size:10px;color:var(--ink-soft)">${esc(c.title)}</div></div></div><span class="badge ${h.status}">${esc(h.label)}</span></div>`;
  }
  function workflowStage(s,i){
    const complete=s.tasks.every(t=>t.status==='completed'), any=s.tasks.some(t=>['in_progress','submitted','overdue'].includes(t.status));
    return `<div class="wf-stage"><div class="wf-icon ${complete?'done':any?'now':''}">${String(i+1).padStart(2,'0')}</div><div class="wf-content"><div class="wf-title">${esc(s.stage)}</div><div class="wf-people">${s.tasks.map(t=>`<span class="person-pill"><div><b>${esc(t.short)}</b><br>${esc(facultyName(t.assignee_id))}</div>${statusBadge(t.status)}</span>`).join('')}</div></div></div>`;
  }
  function adminRow(c){
    const a=assignmentFor(c.id);
    return `<tr><td><b>${esc(c.course_code)}</b><br><span style="color:var(--ink-soft)">${esc(c.title)}</span><br>${typeBadge(c)} ${statusBadge(c.status==='published'?'completed':'waiting')}</td><td>${esc(facultyName(a.preparer_a))}</td><td>${esc(facultyName(a.preparer_b))}</td><td>${esc(facultyName(a.moderator_1))}</td><td>${esc(facultyName(a.moderator_2))}</td><td>${esc(facultyName(a.scrutinizer))}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-edit-course="${esc(c.id)}">Edit</button><button class="btn small ${c.status==='published'?'danger':'accent'}" data-publish-course="${esc(c.id)}">${c.status==='published'?'Unpublish':'Publish'}</button></div></td></tr>`;
  }
  function sectionsFor(courseId){
    const sections=state.courseSections.filter(s=>s.course_id===courseId).map(s=>s.section_code).filter(Boolean);
    if(sections.length) return [...new Set(sections)];
    const c=courseById(courseId);
    if(isSessionalCourse(c)) return [c.section_a || 'A1', c.section_b || 'A2'].filter(Boolean);
    return [c.section_a || 'X'].filter(Boolean);
  }

  function courseProgress(c){
    if(isTheoryCourse(c)) return progressPct(TASKS.map(t=>({status:statusFor(c,t.key)})));
    const items=[...labSessionsFor(c.id),...labItemsFor(c.id)];
    return progressPct(items);
  }
  function courseHealth(c){
    const events=eventsForAll().filter(e=>e.courseId===c.id);
    const config=labConfigFor(c.id);
    if(isSessionalCourse(c) && (config.config_status || 'setup_required') !== 'configured') return {label:'Attention', status:'waiting', tone:'yellow'};
    if(events.some(e=>e.date < todayIso() && !['completed','conducted','marks_published','marks_uploaded','shared_with_students','uploaded','cancelled'].includes(e.status))) return {label:'At Risk', status:'overdue', tone:'red'};
    if(courseProgress(c)===100) return {label:'Completed', status:'completed', tone:'done'};
    if(events.some(e=>daysFromToday(e.date)>=0 && daysFromToday(e.date)<=3 && !['completed','conducted','marks_published','marks_uploaded','shared_with_students','uploaded','cancelled'].includes(e.status))) return {label:'Attention', status:'waiting', tone:'yellow'};
    return {label:'On Track', status:'in_progress', tone:'green'};
  }
  function setupWarnings(){
    const warnings=[];
    for(const type of ['COURSE_OUTLINE_SHARING','QUESTION_SUBMISSION_DEADLINE','FEEDBACK_DEADLINE','CAR_DEADLINE']){
      if(!milestoneDate(type)) warnings.push({title:`${milestoneLabel(type)} not configured`,detail:'This should be a term-level milestone, not repeated manually for every course.'});
    }
    for(const c of state.courses){
      if(!sectionsFor(c.id).length) warnings.push({title:`${c.course_code}: sections missing`,detail:'Theory normally uses X; sessional courses commonly use A1/A2; thesis may also use X.'});
      const outline=state.courseOutlines.find(o=>o.course_id===c.id);
      if(!outline || outline.status!=='shared_with_students') warnings.push({title:`${c.course_code}: course outline not shared`,detail:`Current status: ${OUTLINE_STATUS_LABEL[outline?.status || 'not_started']}.`});
      if(isSessionalCourse(c) && (sessionalConfigFor(c.id).config_status || 'setup_required') !== 'configured') warnings.push({title:`${c.course_code}: sessional assessment structure not configured`,detail:'Configure components, quantities, scope, and session count before full tracking.'});
    }
    for(const ct of state.classTests){
      if((ct.status && ct.status!=='not_planned') && !ctDate(ct)) warnings.push({title:`${courseById(ct.course_id).course_code || ''}: ${ct.title || `CT ${ct.ct_number || ''}`} has status but no date`,detail:'Migrated CT records may be incomplete, but they should remain visible for cleanup.'});
    }
    for(const i of (state.assessmentInstances.length ? state.assessmentInstances : state.labAssessmentItems)){
      if((i.due_date || i.scheduled_date) && !i.title) warnings.push({title:`${courseById(i.course_id).course_code || ''}: assessment date exists without type`,detail:'Do not silently discard partially-filled workbook triplets.'});
      if(i.title && !i.due_date && !i.scheduled_date) warnings.push({title:`${courseById(i.course_id).course_code || ''}: ${i.title} has incomplete scheduling`,detail:'Assessment type exists but scheduling details are incomplete.'});
    }
    return warnings;
  }
  function attentionItems(){
    const items=[];
    for(const o of state.courseOutlines.filter(o=>o.status!=='shared_with_students')){
      const c=courseById(o.course_id), date=o.due_date || milestoneDate('COURSE_OUTLINE_SHARING');
      if(courseIsMine(c) && daysFromToday(date)<=10) items.push({kind:'Course Outline', title:`${c.course_code || ''} - Course outline`, detail:OUTLINE_STATUS_LABEL[o.status || 'not_started'], date, week:weekForDate(date), status:o.status || 'not_started', courseId:o.course_id, rank:daysFromToday(date)<0?0:2});
    }
    for(const t of myTheoryTasks()){
      if(t.status==='completed') continue;
      if(t.status==='overdue' || (t.due_date && daysFromToday(t.due_date)<=7)) items.push({kind:'Theory', title:`${t.course.course_code} - ${t.label}`, detail:t.status==='waiting'?'Waiting for prerequisite completion.':`Responsible: ${facultyName(t.assignee_id)}`, date:t.due_date, week:weekForDate(t.due_date), status:t.status, courseId:t.course.id, rank:t.status==='overdue'?0:2});
    }
    for(const ct of myClassTests().filter(ct=>!['completed','marks_published','cancelled'].includes(ct.status))){
      const date=ctDate(ct);
      if(!date || daysFromToday(date)<=10) items.push({kind:'Class Test', title:`${courseById(ct.course_id).course_code || ''} - ${ct.title || `CT ${ct.ct_number || ''}`}`, detail:date ? `${ct.section || 'All'} | ${ct.syllabus || 'Syllabus not set'}` : 'CT status exists but no CT date has been recorded.', date, week:weekForDate(date), status:ct.status || 'not_planned', courseId:ct.course_id, rank:!date?0:daysFromToday(date)<0?0:1});
    }
    for(const i of [...myLabSessions(),...myLabItems()].filter(x=>!['completed','cancelled'].includes(x.status))){
      const date=i.date || i.due_date || i.scheduled_date;
      if(daysFromToday(date)<=10) items.push({kind:'Sessional', title:`${courseById(i.course_id).course_code || ''} - ${'session_no' in i ? `Session ${i.session_no}` : i.title}`, detail:'assigned_faculty' in i ? i.title : `${i.marks || i.marks_each || 0} marks`, date, week:weekForDate(date), status:i.status, courseId:i.course_id, rank:daysFromToday(date)<0?0:2});
    }
    for(const f of state.feedbackStatuses.filter(f=>f.status!=='completed')){
      const c=courseById(f.course_id), date=f.deadline || milestoneDate('FEEDBACK_DEADLINE');
      if(courseIsMine(c) && daysFromToday(date)<=10) items.push({kind:'Feedback', title:`${c.course_code || ''} - Student feedback`, detail:f.notes || 'Feedback workflow not complete.', date, week:weekForDate(date), status:f.status || 'not_started', courseId:f.course_id, rank:daysFromToday(date)<0?0:3});
    }
    for(const cf of state.courseFileStatuses.filter(cf=>!['uploaded','completed'].includes(cf.status))){
      const c=courseById(cf.course_id), date=cf.deadline || milestoneDate('CAR_DEADLINE');
      if(courseIsMine(c) && daysFromToday(date)<=10) items.push({kind:'Course File / CAR', title:`${c.course_code || ''} - Course File / CAR`, detail:cf.notes || 'Course archive not complete.', date, week:weekForDate(date), status:cf.status || 'not_started', courseId:cf.course_id, rank:daysFromToday(date)<0?0:3});
    }
    return items.sort((a,b)=>a.rank-b.rank || (a.date || '').localeCompare(b.date || ''));
  }
  function recentChanges(){
    const changes=state.classTestHistory.map(h=>{
      const ct=byId(state.classTests,h.class_test_id) || {}, c=courseById(ct.course_id);
      return {kind:'CT Change', title:`${c.course_code || ''} ${ct.title || ''}`, detail:`Moved from ${fmtDate(h.old_date)} ${h.old_time || ''} to ${fmtDate(h.new_date)} ${h.new_time || ''}. ${h.reason || ''}`, level:'in_progress'};
    });
    state.notifications.filter(n=>!n.read_at && (!n.faculty_id || n.faculty_id===profileFacultyId())).forEach(n=>changes.push({kind:'Notification', title:n.title, detail:n.body, level:n.level==='warning'?'waiting':'in_progress'}));
    return changes;
  }
  function notificationItems(){
    const items=attentionItems().slice(0,8).map(i=>({level:i.status,title:i.title,detail:i.detail,courseId:i.courseId,rank:i.rank}));
    state.notifications.filter(n=>!n.read_at && (!n.faculty_id || n.faculty_id===profileFacultyId())).forEach(n=>items.push({level:n.level==='warning'?'waiting':'in_progress',title:n.title,detail:n.body,courseId:null,rank:1}));
    return items.sort((a,b)=>(a.rank||0)-(b.rank||0));
  }
  function findCtConflicts(){
    const seen={}, conflicts=[];
    for(const ct of state.classTests.filter(x=>!['cancelled','postponed'].includes(x.status))){
      const key=[ct.batch || courseById(ct.course_id).batch || '',ct.section || '',ctDate(ct) || '',ctTime(ct)].join('|');
      if(seen[key] && ctDate(ct)) conflicts.push({title:`${ct.batch || ''} Section ${ct.section || 'All'} has overlapping CTs`,detail:`${courseById(seen[key].course_id).course_code || ''} ${seen[key].title} and ${courseById(ct.course_id).course_code || ''} ${ct.title} share ${fmtDate(ctDate(ct))} ${ctTime(ct)}.`});
      else seen[key]=ct;
    }
    return conflicts;
  }
  function findConflicts(){
    const errors=[],warnings=[];
    for(const c of theoryCourses()){
      const a=assignmentFor(c.id);const p=`${c.course_code} - ${c.title}`;
      const missing=['preparer_a','preparer_b','moderator_1','moderator_2','scrutinizer'].filter(k=>!a[k]); if(missing.length) errors.push({title:`${p}: incomplete assignment`,detail:`Missing ${missing.join(', ')}.`});
      if(a.preparer_a&&a.preparer_a===a.preparer_b) errors.push({title:`${p}: Section A/B preparer conflict`,detail:'Question Preparer A and Question Preparer B must be different.'});
      if(a.moderator_1&&a.moderator_1===a.moderator_2) errors.push({title:`${p}: moderator conflict`,detail:'Moderator 01 and Moderator 02 must be different.'});
      for(const m of ['moderator_1','moderator_2']) if(a[m]&&(a[m]===a.preparer_a||a[m]===a.preparer_b)) errors.push({title:`${p}: moderator independence conflict`,detail:`${m==='moderator_1'?'Moderator 01':'Moderator 02'} cannot also be a question preparer.`});
      if(a.scrutinizer&&(a.scrutinizer===a.preparer_a||a.scrutinizer===a.preparer_b)) errors.push({title:`${p}: scrutiny conflict`,detail:'Script Scrutinizer cannot be either examiner/question preparer.'});
      if(a.scrutinizer&&(a.scrutinizer===a.moderator_1||a.scrutinizer===a.moderator_2)) warnings.push({title:`${p}: moderator also scrutinizer`,detail:'This combination is permitted but is flagged for administrative awareness.'});
      if(c.question_deadline&&c.exam_date&&c.question_deadline>c.exam_date) errors.push({title:`${p}: invalid deadline order`,detail:'Question submission deadline occurs after the exam date.'});
      if(c.exam_date&&c.final_gradesheet_deadline&&c.exam_date>c.final_gradesheet_deadline) errors.push({title:`${p}: invalid deadline order`,detail:'Final gradesheet deadline occurs before the exam date.'});
    }
    for(const c of labCourses()) if((labConfigFor(c.id).config_status || 'setup_required') !== 'configured') warnings.push({title:`${c.course_code}: sessional configuration pending`,detail:'Sessional courses need session count and assessment components before full tracking.'});
    setupWarnings().forEach(x=>warnings.push(x));
    findCtConflicts().forEach(x=>warnings.push(x));
    const load={};taskObjects().forEach(t=>{if(t.assignee_id)load[t.assignee_id]=(load[t.assignee_id]||0)+1;});Object.entries(load).filter(([,n])=>n>=12).forEach(([id,n])=>warnings.push({title:`High workload: ${facultyName(id)}`,detail:`${n} theory workflow responsibilities are currently assigned.`}));
    return {errors,warnings};
  }
  function conflictBox(x,warn){return `<div class="conflict ${warn?'warning':''}"><strong>${warn?'Warning':'Error'} - ${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`;}
  function prioritySort(a,b){const rank={overdue:0,confirmed:1,scheduled:1,in_progress:1,submitted:2,proposed:2,submission_pending:2,evaluation_pending:2,not_started:3,waiting:4,blocked:5,completed:9,conducted:8,cancelled:10};const r=(rank[a.status]??5)-(rank[b.status]??5);if(r)return r;return (a.due_date||a.date||'9999-12-31').localeCompare(b.due_date||b.date||'9999-12-31');}
  function daysFromToday(d){if(!d)return 9999;const a=new Date(`${todayIso()}T00:00:00`),b=new Date(`${d}T00:00:00`);return Math.round((b.getTime()-a.getTime())/86400000);}
  function daysBetween(a,b){return Math.round((new Date(`${b}T00:00:00`).getTime()-new Date(`${a}T00:00:00`).getTime())/86400000);}
  function firstName(n){return n.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s+/i,'').split(' ')[0]||'Faculty';}
  function dayPart(){const h=Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hour12:false,timeZone:'Asia/Dhaka'}).format(new Date()));return h<12?'morning':h<17?'afternoon':'evening';}

  async function saveTermSettings(e){
    e.preventDefault();
    const fd=new FormData(e.currentTarget), total=Number(fd.get('total_teaching_weeks')), latest=Number(fd.get('latest_completed_week'));
    if(!Number.isFinite(total) || total<1 || total>52 || latest<0 || latest>total){toast('Check the teaching week values. Latest completed week must be between 0 and total weeks.','error');return;}
    const next={...activeTerm(), name:String(fd.get('name') || '').trim() || activeTerm().name, total_teaching_weeks:total, latest_completed_week:latest, calendar_status:String(fd.get('calendar_status') || 'active'), pause_reason:String(fd.get('pause_reason') || '').trim()};
    if(!window.confirm('Save academic term settings? This changes the term tracker for all faculty.')) return;
    await persistTerm(next,'Term settings saved.');
  }
  async function updateTermAction(action){
    const t={...activeTerm()}, total=Number(t.total_teaching_weeks || 14);
    if(action==='advance') t.latest_completed_week=Math.min(Number(t.latest_completed_week || 0)+1,total);
    if(action==='previous') t.latest_completed_week=Math.max(Number(t.latest_completed_week || 0)-1,0);
    if(action==='pause'){t.calendar_status='paused';t.pause_reason=t.pause_reason || window.prompt('Pause reason') || 'Calendar paused by admin';}
    if(action==='resume'){t.calendar_status='active';t.pause_reason='';}
    if(!window.confirm(`Confirm ${action.replace('_',' ')} for ${t.name}?`)) return;
    await persistTerm(t,'Academic calendar updated.');
  }
  async function persistTerm(term,message){
    if(state.demo){
      state.term=term; state.selectedWeek=term.latest_completed_week || state.selectedWeek;
      state.auditLogs.unshift({id:Date.now(),table_name:'academic_terms',action:'UPDATE',row_key:term.id,created_at:new Date().toISOString()});
      toast(message,'success'); render(); return;
    }
    const payload={name:term.name,total_teaching_weeks:term.total_teaching_weeks,latest_completed_week:term.latest_completed_week,calendar_status:term.calendar_status,pause_reason:term.pause_reason,active:true};
    let res;
    if(term.id && term.id !== 'term-local') res=await state.supabase.from('academic_terms').update(payload).eq('id',term.id);
    else res=await state.supabase.from('academic_terms').insert(payload).select().single();
    if(res.error){toast(`${res.error.message}. Run the updated Supabase schema first if this table does not exist.`,'error');return;}
    toast(message,'success'); await bootstrap();
  }

  async function updateStatus(courseId,key,newStatus){
    const course=byId(state.courses,courseId); if(!course)return;
    if(newStatus==='completed'&&!taskCanStart(courseId,key)){toast('Cannot complete this task before its prerequisite tasks are completed.','error');render();return;}
    if(state.demo){const row=statusRow(courseId,key);if(row){row.status=newStatus;row.completed_at=newStatus==='completed'?new Date().toISOString():null;}else state.statuses.push({course_id:courseId,task_key:key,status:newStatus,completed_at:newStatus==='completed'?new Date().toISOString():null});toast('Demo status updated.','success');render();return;}
    const payload={course_id:courseId,task_key:key,status:newStatus,completed_at:newStatus==='completed'?new Date().toISOString():null,updated_by:state.session.user.id};
    const {error}=await state.supabase.from('task_statuses').upsert(payload,{onConflict:'course_id,task_key'});if(error){toast(error.message,'error');render();return;}toast('Task status updated.','success');await bootstrap();
  }

  async function togglePublishCourse(courseId){
    const c=byId(state.courses,courseId); if(!c || !isAdmin()) return;
    const next=c.status==='published'?'draft':'published';
    if(next==='published' && isTheoryCourse(c)){
      const a=assignmentFor(c.id);
      const missing=['preparer_a','preparer_b','moderator_1','moderator_2','scrutinizer'].filter(k=>!a[k]);
      if(missing.length){toast('Cannot publish: all five primary assignments are required.','error');return;}
      const errs=validateAssignmentPayload(a,c);
      if(errs.length){toast(`Cannot publish: ${errs[0]}`,'error');return;}
    }
    if(state.demo){c.status=next;toast(`Course ${next}.`,'success');render();return;}
    const {error}=await state.supabase.from('courses').update({status:next}).eq('id',courseId);
    if(error){toast(error.message,'error');return;}
    toast(`Course ${next}.`,'success');await bootstrap();
  }

  function renderModal(){
    if(state.modal?.type!=='editCourse') return;
    const c=byId(state.courses,state.modal.courseId),a=assignmentFor(c.id);
    const options=(selected)=>`<option value="">Select faculty</option>${state.faculty.map(f=>`<option value="${f.id}" ${selected===f.id?'selected':''}>${esc(f.full_name)}</option>`).join('')}`;
    document.getElementById('modalRoot').innerHTML=`<div class="modal"><div class="modal-card"><div class="modal-head"><div><p class="eyebrow">Course Setup</p><h3>${esc(c.course_code)} - ${esc(c.title)}</h3></div><button class="modal-close" id="closeModal">x</button></div><form id="courseForm"><div class="form-grid"><div class="field"><label>Question Preparer A</label><select name="preparer_a" required>${options(a.preparer_a)}</select></div><div class="field"><label>Question Preparer B</label><select name="preparer_b" required>${options(a.preparer_b)}</select></div><div class="field"><label>Moderator 01</label><select name="moderator_1" required>${options(a.moderator_1)}</select></div><div class="field"><label>Moderator 02</label><select name="moderator_2" required>${options(a.moderator_2)}</select></div><div class="field"><label>Script Scrutinizer</label><select name="scrutinizer" required>${options(a.scrutinizer)}</select></div><div class="field"><label>Question Submission Deadline</label><input type="date" name="question_deadline" value="${esc(c.question_deadline||'')}"></div><div class="field"><label>Exam Date</label><input type="date" name="exam_date" value="${esc(c.exam_date||'')}"></div><div class="field"><label>Final Gradesheet Deadline</label><input type="date" name="final_gradesheet_deadline" value="${esc(c.final_gradesheet_deadline||'')}"></div><div class="span-2 notice">Derived automatically: Examiner A = QP-A, Examiner B = QP-B, Gradesheet Preparer = QP-A, Gradesheet Scrutinizer = Script Scrutinizer.</div><div class="span-2" id="formValidation"></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Validate & Save</button><button class="btn" type="button" id="cancelModal">Cancel</button></div></div></form></div></div>`;
    document.getElementById('closeModal').onclick=closeModal;document.getElementById('cancelModal').onclick=closeModal;document.getElementById('courseForm').addEventListener('submit',saveCourseAssignment);
  }
  function closeModal(){state.modal=null;document.getElementById('modalRoot').innerHTML='';}
  function validateAssignmentPayload(p,c){
    const errs=[];
    if(p.preparer_a===p.preparer_b)errs.push('Section A and Section B preparers must differ.');
    if(p.moderator_1===p.moderator_2)errs.push('Moderator 01 and Moderator 02 must differ.');
    if([p.preparer_a,p.preparer_b].includes(p.moderator_1))errs.push('Moderator 01 cannot be a question preparer.');
    if([p.preparer_a,p.preparer_b].includes(p.moderator_2))errs.push('Moderator 02 cannot be a question preparer.');
    if([p.preparer_a,p.preparer_b].includes(p.scrutinizer))errs.push('Script Scrutinizer cannot be a question preparer/examiner.');
    if(c.question_deadline&&c.exam_date&&c.question_deadline>c.exam_date)errs.push('Question deadline cannot be after exam date.');
    if(c.exam_date&&c.final_gradesheet_deadline&&c.exam_date>c.final_gradesheet_deadline)errs.push('Final gradesheet deadline cannot be before exam date.');
    return errs;
  }
  async function saveCourseAssignment(e){
    e.preventDefault();
    const fd=new FormData(e.currentTarget);const c=byId(state.courses,state.modal.courseId);
    const p={course_id:c.id,preparer_a:fd.get('preparer_a'),preparer_b:fd.get('preparer_b'),moderator_1:fd.get('moderator_1'),moderator_2:fd.get('moderator_2'),scrutinizer:fd.get('scrutinizer')};
    const dates={question_deadline:fd.get('question_deadline')||null,exam_date:fd.get('exam_date')||null,final_gradesheet_deadline:fd.get('final_gradesheet_deadline')||null};
    const errs=validateAssignmentPayload(p,{...c,...dates});const out=document.getElementById('formValidation');
    if(errs.length){out.innerHTML=errs.map(x=>`<div class="notice error">${esc(x)}</div>`).join('');return;}
    const previous=assignmentFor(c.id), consequences=[];
    if(previous.preparer_a && previous.preparer_a!==p.preparer_a) consequences.push('QP-A -> Examiner A + Gradesheet Preparer');
    if(previous.preparer_b && previous.preparer_b!==p.preparer_b) consequences.push('QP-B -> Examiner B');
    if(previous.moderator_1 && previous.moderator_1!==p.moderator_1) consequences.push('Moderator 01');
    if(previous.moderator_2 && previous.moderator_2!==p.moderator_2) consequences.push('Moderator 02');
    if(previous.scrutinizer && previous.scrutinizer!==p.scrutinizer) consequences.push('Script Scrutinizer -> Gradesheet Scrutinizer');
    if(consequences.length && !window.confirm(`This changes responsibility ownership:\n\n${consequences.join('\n')}\n\nUnfinished statuses for changed assignees will reset to Not Started. Completed work will remain completed and the change will be audited. Continue?`)) return;
    if(state.demo){Object.assign(assignmentFor(c.id),p);Object.assign(c,dates);closeModal();toast('Demo assignment saved with conflict checks.','success');render();return;}
    const [aRes,cRes]=await Promise.all([state.supabase.from('primary_assignments').upsert(p,{onConflict:'course_id'}),state.supabase.from('courses').update(dates).eq('id',c.id)]);
    const err=aRes.error||cRes.error;if(err){out.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;return;}closeModal();toast('Assignments updated. Derived roles changed automatically.','success');await bootstrap();
  }

  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit-course]');if(edit){state.modal={type:'editCourse',courseId:edit.dataset.editCourse};renderModal();return;}
    const pub=e.target.closest('[data-publish-course]');if(pub){togglePublishCourse(pub.dataset.publishCourse);return;}
    if(e.target.id==='backCourse'){state.courseId=null;render();return;}
  });
  document.addEventListener('input',e=>{
    if(e.target.id==='taskSearch'){const pos=e.target.selectionStart;state.search=e.target.value;render();const n=document.getElementById('taskSearch');if(n){n.focus();n.setSelectionRange(pos,pos);}}
  });
  document.addEventListener('change',e=>{if(e.target.id==='statusFilter'){state.statusFilter=e.target.value;render();}});

  init();
})();
