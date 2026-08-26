(() => {
  'use strict';

  const TASKS = [
    {key:'question_prep_a', label:'Question Preparation — Section A', short:'QP-A', stage:'Question Preparation', order:1, source:'preparer_a'},
    {key:'question_prep_b', label:'Question Preparation — Section B', short:'QP-B', stage:'Question Preparation', order:2, source:'preparer_b'},
    {key:'moderation_1', label:'Question Moderator 01', short:'MOD-1', stage:'Question Moderation', order:3, source:'moderator_1'},
    {key:'moderation_2', label:'Question Moderator 02', short:'MOD-2', stage:'Question Moderation', order:4, source:'moderator_2'},
    {key:'examination_a', label:'Script Examination — Section A', short:'EX-A', stage:'Script Examination', order:5, source:'preparer_a', derived:true},
    {key:'examination_b', label:'Script Examination — Section B', short:'EX-B', stage:'Script Examination', order:6, source:'preparer_b', derived:true},
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
  const FACULTY_EMAIL_RE = /^[^@\s]+@bme\.buet\.ac\.bd$/i;
  const state = {
    supabase:null, demo:false, session:null, profile:null,
    faculty:[], courses:[], primaryAssignments:[], statuses:[], deadlines:[], auditLogs:[],
    view:'home', courseId:null, search:'', statusFilter:'all', modal:null, authMode:'signin'
  };

  const $app = document.getElementById('app');
  const cfg = window.EXAMFLOW_CONFIG || {};
  const esc = (v='') => String(v ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#039;','"':'&quot;'}[c]));
  const byId = (list,id) => list.find(x=>x.id===id);
  const fmtDate = (d) => d ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(`${d}T00:00:00`)) : 'Not set';
  const todayIso = () => new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
  const isAdmin = () => ['admin','hod'].includes(state.profile?.app_role);
  const activeProfile = () => !!state.profile?.active;
  const facultyName = id => byId(state.faculty,id)?.full_name || 'Unassigned';
  const statusRow = (courseId,key) => state.statuses.find(s=>s.course_id===courseId && s.task_key===key);
  const statusFor = (course,key) => {
    const raw = statusRow(course.id,key)?.status || 'not_started';
    const due = dueDateFor(course,key);
    if(raw !== 'completed' && due && due < todayIso()) return 'overdue';
    if(raw === 'not_started' && (DEPENDENCIES[key] || []).length && !taskCanStart(course.id,key)) return 'waiting';
    return raw;
  };
  const dueDateFor = (course,key) => {
    const override = state.deadlines.find(d=>d.course_id===course.id && d.task_key===key)?.due_date;
    if(override) return override;
    if(['question_prep_a','question_prep_b','moderation_1','moderation_2'].includes(key)) return course.question_deadline || null;
    return course.final_gradesheet_deadline || null;
  };
  const assignmentFor = courseId => state.primaryAssignments.find(a=>a.course_id===courseId) || {};
  const assigneeFor = (courseId,key) => {
    const task = TASKS.find(t=>t.key===key); const a = assignmentFor(courseId);
    return task ? a[task.source] || null : null;
  };
  const taskObjects = () => state.courses.flatMap(course => TASKS.map(task => ({
    ...task, course, assignee_id:assigneeFor(course.id,task.key), status:statusFor(course,task.key), due_date:dueDateFor(course,task.key)
  })));
  const profileFacultyId = () => state.profile?.faculty_id || state.profile?.faculty?.id || null;
  const myTasks = () => taskObjects().filter(t=>t.assignee_id===profileFacultyId());
  const taskCanStart = (courseId,key) => (DEPENDENCIES[key] || []).every(dep => (statusRow(courseId,dep)?.status || 'not_started') === 'completed');

  function statusBadge(status){ return `<span class="badge ${esc(status)}">${esc(STATUS_LABEL[status] || status)}</span>`; }
  function roleLabel(key){ return TASKS.find(t=>t.key===key)?.label || key; }
  function progressPct(tasks){ if(!tasks.length) return 0; return Math.round(tasks.filter(t=>t.status==='completed').length/tasks.length*100); }

  function toast(message,type=''){
    let wrap=document.querySelector('.toast-wrap');
    if(!wrap){wrap=document.createElement('div');wrap.className='toast-wrap';document.body.appendChild(wrap)}
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
    const d=window.EXAMFLOW_DEMO;
    state.faculty=structuredClone(d.faculty); state.courses=structuredClone(d.courses); state.primaryAssignments=structuredClone(d.primaryAssignments); state.statuses=structuredClone(d.statuses); state.deadlines=[]; state.auditLogs=[{id:2,table_name:'task_statuses',action:'UPDATE',row_key:'c1',created_at:'2026-08-25T08:30:00+06:00'},{id:1,table_name:'primary_assignments',action:'UPDATE',row_key:'c2',created_at:'2026-08-24T16:10:00+06:00'}];
    state.profile={user_id:'demo-user',faculty_id:'f3',app_role:'admin',active:true,faculty:byId(state.faculty,'f3')};
  }

  async function bootstrap(){
    const uid=state.session?.user?.id;
    let {data:profile,error:pErr}=await state.supabase.from('profiles').select('user_id,faculty_id,app_role,active,faculty:faculty_id(id,full_name,designation,email)').eq('user_id',uid).maybeSingle();
    if(pErr){renderFatal(`Profile lookup failed: ${pErr.message}`);return}
    if(!profile){
      const claim=await state.supabase.rpc('claim_allowed_profile');
      if(!claim.error && claim.data===true){
        const retry=await state.supabase.from('profiles').select('user_id,faculty_id,app_role,active,faculty:faculty_id(id,full_name,designation,email)').eq('user_id',uid).maybeSingle();
        profile=retry.data; pErr=retry.error;
      }
    }
    if(pErr){renderFatal(`Profile lookup failed: ${pErr.message}`);return}
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
    if(err){renderFatal(`Data could not be loaded: ${err.message}`);return}
    const [f,c,a,s,d]=base;
    state.faculty=f.data||[];state.courses=c.data||[];state.primaryAssignments=a.data||[];state.statuses=s.data||[];state.deadlines=d.data||[];
    state.auditLogs=[];
    if(['admin','hod'].includes(profile.app_role)){
      const audit=await state.supabase.from('audit_logs').select('id,actor,table_name,action,row_key,old_value,new_value,created_at').order('created_at',{ascending:false}).limit(80);
      if(!audit.error) state.auditLogs=audit.data||[];
    }
    render();
  }

  function renderLocked(){
    $app.innerHTML=`<div class="locked"><div class="locked-card">
      <p class="eyebrow">Secure deployment not configured</p><h1>BME <span style="color:var(--accent)">ExamFlow</span></h1>
      <p>This copy is intentionally locked. No academic data is embedded in the public site. Configure Supabase authentication and Row Level Security before production deployment.</p>
      <div class="code-note">Production: configure GitHub repository variables SUPABASE_URL and SUPABASE_ANON_KEY.<br>Local anonymous preview: append <b>?demo=1</b> to the URL. Demo data contains no real faculty assignments.</div>
    </div></div>`;
  }
  function renderFatal(msg){$app.innerHTML=`<div class="locked"><div class="locked-card"><p class="eyebrow">System error</p><h1>ExamFlow</h1><div class="notice error">${esc(msg)}</div></div></div>`}
  function renderUnauthorized(){ $app.innerHTML=`<div class="locked"><div class="locked-card"><p class="eyebrow">Access denied</p><h1>Unauthorized account</h1><p>Your login succeeded, but this account is not on the approved faculty allowlist. No academic data has been disclosed.</p></div></div>`; }

  function renderAuth(message='', type=''){
    const isSignup = state.authMode === 'signup';
    $app.innerHTML=`<div class="auth-page"><div class="auth-wrap">
      <div class="auth-brand"><p class="eyebrow">Secure Academic Workflow</p><h1 class="brand">BME <span>ExamFlow</span></h1><p class="subtitle">Faculty-centered examination responsibility management.</p></div>
      <div class="auth-grid">
        <div class="auth-card"><span class="kicker">Authorized Faculty Only</span><h2>${isSignup?'Create account':'Sign in'}</h2><p>${isSignup?'Use a BME BUET faculty email, then choose any password for this app.':'Use your BME BUET faculty email and the password you set during sign up.'}</p>
          <div class="auth-switch" role="tablist" aria-label="Authentication mode"><button type="button" id="showSignin" class="${!isSignup?'active':''}" role="tab" aria-selected="${!isSignup}">Sign in</button><button type="button" id="showSignup" class="${isSignup?'active':''}" role="tab" aria-selected="${isSignup}">Sign up</button></div>
          <form id="authForm"><div class="field"><label>Email</label><input type="email" name="email" required autocomplete="username" placeholder="name@bme.buet.ac.bd"><div class="field-help" id="emailHelp">Only addresses ending in @bme.buet.ac.bd can sign up.</div></div><div class="field"><label>Password</label><input type="password" name="password" required autocomplete="${isSignup?'new-password':'current-password'}"></div><div class="auth-actions"><button class="btn primary" type="submit" id="authSubmit">${isSignup?'Sign up':'Sign in'}</button>${!isSignup?'<button class="btn" type="button" id="magicBtn">Email magic link</button>':''}</div></form>
          ${message?`<div class="notice ${esc(type)}">${esc(message)}</div>`:''}
        </div>
        <div class="auth-card"><span class="kicker">Security model</span><h2>Protected by identity + authorization</h2><p>Sign up is limited to faculty email addresses in the BME BUET domain. After a valid sign up, the same email and password can be used for future logins.</p><div class="notice">Protected academic records still require an active administrator-managed faculty profile before any data is disclosed.</div></div>
      </div>
    </div></div>`;
    document.getElementById('authForm').addEventListener('submit',isSignup ? signUp : signIn);
    document.getElementById('showSignin').addEventListener('click',()=>{state.authMode='signin';renderAuth();});
    document.getElementById('showSignup').addEventListener('click',()=>{state.authMode='signup';renderAuth();});
    document.querySelector('[name=email]').addEventListener('input',validateEmailField);
    validateEmailField();
    const magic=document.getElementById('magicBtn'); if(magic) magic.addEventListener('click',magicLink);
  }
  function facultyEmailError(email){
    if(!email) return 'Enter your BME BUET faculty email.';
    if(!FACULTY_EMAIL_RE.test(email)) return 'Use an address like name@bme.buet.ac.bd.';
    return '';
  }
  function validateEmailField(){
    const input=document.querySelector('[name=email]'), help=document.getElementById('emailHelp'), submit=document.getElementById('authSubmit');
    if(!input || !help || !submit) return true;
    const email=input.value.trim();
    const error=facultyEmailError(email);
    input.setCustomValidity(error);
    input.classList.toggle('invalid', !!error && !!email);
    help.textContent=error || 'This email can be used to sign up or sign in.';
    help.className=`field-help ${error && email ? 'error' : error ? '' : 'success'}`;
    submit.disabled=state.authMode==='signup' && !!error;
    return !error;
  }
  function authCredentials(form){
    const fd=new FormData(form);
    return {email:String(fd.get('email') || '').trim().toLowerCase(),password:String(fd.get('password') || '')};
  }
  async function signIn(e){
    e.preventDefault();
    if(!validateEmailField()){e.currentTarget.reportValidity();return}
    const {email,password}=authCredentials(e.currentTarget);
    const {error}=await state.supabase.auth.signInWithPassword({email,password});
    if(error)renderAuth(error.message,'error');
  }
  async function signUp(e){
    e.preventDefault();
    if(!validateEmailField()){e.currentTarget.reportValidity();return}
    const {email,password}=authCredentials(e.currentTarget);
    const redirectTo=location.href.split('?')[0];
    const {data,error}=await state.supabase.auth.signUp({email,password,options:{emailRedirectTo:redirectTo}});
    if(error){renderAuth(error.message,'error');return}
    if(data.session){await bootstrap();return}
    state.authMode='signin';
    renderAuth('Account created. Check your institutional inbox if Supabase asks for email confirmation, then sign in with the same password.','success');
  }
  async function magicLink(){const email=document.querySelector('[name=email]').value.trim().toLowerCase();if(facultyEmailError(email)){toast('Enter a valid @bme.buet.ac.bd email first.','error');return}const redirectTo=location.href.split('?')[0];const {error}=await state.supabase.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo}});if(error)toast(error.message,'error');else renderAuth('Magic link sent. Check your institutional inbox.','success')}

  function shell(content){
    const f=state.profile?.faculty || byId(state.faculty,profileFacultyId()) || {};
    const nav=[['home','⌂','Home'],['tasks','✓','My Tasks'],['courses','▦','My Courses'],['general','◎','General Overview'],['notifications','◉','Notifications']];
    if(isAdmin()){nav.push(['conflicts','⚠','Conflicts'],['admin','✦','Admin'])}
    return `<div class="shell">
      <header class="topbar"><div><p class="eyebrow">Academic Responsibility Management</p><h1 class="brand">BME <span>ExamFlow</span></h1><p class="subtitle">Know what you own, what is blocked, and what needs attention—without searching the full departmental matrix.</p></div><div class="term-badge"><b>${esc(cfg.academicTerm||'2026')}</b>${esc(cfg.institutionShort||'BME')} · Secure Faculty Portal<br>${state.demo?'DEMO MODE':'Authenticated'}</div></header>
      <div class="app-grid"><aside class="sidebar"><div class="profile-mini"><p class="profile-name">${esc(f.full_name||'Faculty')}</p><div class="profile-meta">${esc(f.designation||'')} · ${esc(state.profile.app_role||'faculty').toUpperCase()}</div></div><nav class="nav">${nav.map(([v,i,l])=>`<button data-nav="${v}" class="${state.view===v?'active':''}"><span>${i}</span>${l}</button>`).join('')}<button id="logoutBtn"><span>↪</span>${state.demo?'Exit Demo':'Logout'}</button></nav></aside><main class="main">${content}</main></div>
    </div><div id="modalRoot"></div>`;
  }

  function render(){
    if(!activeProfile()){renderUnauthorized();return}
    let content='';
    if(state.courseId) content=renderCourseDetail(state.courseId);
    else if(state.view==='tasks') content=renderTasks();
    else if(state.view==='courses') content=renderCourses();
    else if(state.view==='general') content=renderGeneral();
    else if(state.view==='notifications') content=renderNotifications();
    else if(state.view==='conflicts') content=renderConflicts();
    else if(state.view==='admin') content=renderAdmin();
    else content=renderHome();
    $app.innerHTML=shell(content);
    bindCommon();
    if(state.modal) renderModal();
  }

  function bindCommon(){
    document.querySelectorAll('[data-nav]').forEach(b=>b.addEventListener('click',()=>{state.view=b.dataset.nav;state.courseId=null;state.modal=null;render()}));
    document.querySelectorAll('[data-open-course]').forEach(b=>b.addEventListener('click',()=>{state.courseId=b.dataset.openCourse;render()}));
    document.querySelectorAll('[data-status-change]').forEach(b=>b.addEventListener('change',e=>updateStatus(e.target.dataset.course,e.target.dataset.task,e.target.value)));
    const lo=document.getElementById('logoutBtn'); if(lo) lo.addEventListener('click',async()=>{if(state.demo){location.href=location.pathname}else await state.supabase.auth.signOut()});
  }

  function renderHome(){
    const tasks=myTasks(); const counts={completed:tasks.filter(t=>t.status==='completed').length, overdue:tasks.filter(t=>t.status==='overdue').length, active:tasks.filter(t=>['in_progress','submitted'].includes(t.status)).length};
    const dueWeek=tasks.filter(t=>t.due_date && t.status!=='completed' && daysFromToday(t.due_date)>=0 && daysFromToday(t.due_date)<=7).length;
    const urgent=[...tasks].filter(t=>t.status!=='completed').sort(prioritySort).slice(0,6);
    const mine=state.courses.filter(c=>TASKS.some(t=>assigneeFor(c.id,t.key)===profileFacultyId()));
    return `<div class="page-head"><div><p class="eyebrow">Personal Feed</p><h2>Good ${dayPart()}, ${esc(firstName(state.profile?.faculty?.full_name||facultyName(profileFacultyId())))}</h2><p>Your feed contains only the courses and responsibilities assigned to you.</p></div></div>
      <div class="metrics"><div class="metric"><div class="metric-label">Needs attention</div><div class="metric-value">${tasks.filter(t=>t.status!=='completed').length}</div><div class="metric-note">All unfinished responsibilities</div></div><div class="metric"><div class="metric-label">Due this week</div><div class="metric-value">${dueWeek}</div><div class="metric-note">Within the next 7 days</div></div><div class="metric"><div class="metric-label">Overdue</div><div class="metric-value">${counts.overdue}</div><div class="metric-note">Calculated automatically</div></div><div class="metric"><div class="metric-label">Completed</div><div class="metric-value">${counts.completed}</div><div class="metric-note">${progressPct(tasks)}% of your responsibilities</div></div></div>
      <div class="attention"><section class="panel"><div class="panel-title"><h3>What needs your attention</h3><span class="meta">PRIORITY ORDER</span></div><div class="stack">${urgent.length?urgent.map(t=>taskCard(t,false)).join(''):'<div class="empty">You have no unfinished responsibilities.</div>'}</div></section><section class="panel"><div class="panel-title"><h3>My courses</h3><span class="meta">${mine.length} ACTIVE</span></div><div class="stack">${mine.slice(0,5).map(c=>compactCourse(c)).join('')||'<div class="empty">No courses assigned.</div>'}</div></section></div>`;
  }

  function renderTasks(){
    let tasks=myTasks();
    if(state.search){const q=state.search.toLowerCase();tasks=tasks.filter(t=>`${t.course.course_code} ${t.course.title} ${t.label}`.toLowerCase().includes(q))}
    if(state.statusFilter!=='all') tasks=tasks.filter(t=>t.status===state.statusFilter);
    tasks.sort(prioritySort);
    return `<div class="page-head"><div><p class="eyebrow">Personal Responsibility Queue</p><h2>My Tasks</h2><p>${myTasks().length} total responsibilities across ${new Set(myTasks().map(t=>t.course.id)).size} courses.</p></div><div class="toolbar"><input id="taskSearch" class="search" placeholder="Search course or responsibility" value="${esc(state.search)}"><select id="statusFilter" class="select"><option value="all">All statuses</option>${Object.entries(STATUS_LABEL).map(([v,l])=>`<option value="${v}" ${state.statusFilter===v?'selected':''}>${l}</option>`).join('')}</select></div></div>
      <section class="panel"><div class="stack">${tasks.length?tasks.map(t=>taskCard(t,true)).join(''):'<div class="empty">No tasks match this filter.</div>'}</div></section>`;
  }

  function renderCourses(){
    const mine=state.courses.filter(c=>TASKS.some(t=>assigneeFor(c.id,t.key)===profileFacultyId()));
    return `<div class="page-head"><div><p class="eyebrow">Personal Course Feed</p><h2>My Courses</h2><p>Only courses where you have at least one current responsibility are shown.</p></div></div><div class="course-grid">${mine.map(c=>courseCard(c,true)).join('')||'<div class="empty">No courses assigned.</div>'}</div>`;
  }

  function renderGeneral(){
    const all=taskObjects();const pct=progressPct(all);const pending=all.filter(t=>t.status!=='completed').length;const overdue=all.filter(t=>t.status==='overdue').length;const dueWeek=all.filter(t=>t.due_date&&t.status!=='completed'&&daysFromToday(t.due_date)>=0&&daysFromToday(t.due_date)<=7).length;
    return `<div class="page-head"><div><p class="eyebrow">Department Summary</p><h2>General Overview</h2><p>Operational progress only. No question-paper content is exposed.</p></div></div><div class="metrics"><div class="metric"><div class="metric-label">Overall completion</div><div class="metric-value">${pct}%</div><div class="metric-note">${all.filter(t=>t.status==='completed').length} of ${all.length} tasks</div></div><div class="metric"><div class="metric-label">Pending</div><div class="metric-value">${pending}</div><div class="metric-note">Across ${state.courses.length} courses</div></div><div class="metric"><div class="metric-label">Overdue</div><div class="metric-value">${overdue}</div><div class="metric-note">Calculated from deadlines</div></div><div class="metric"><div class="metric-label">Due this week</div><div class="metric-value">${dueWeek}</div><div class="metric-note">Next 7 days</div></div></div>
      <div class="attention"><section class="panel"><div class="panel-title"><h3>Completion by stage</h3><span class="meta">REAL-TIME</span></div>${STAGE_ORDER.map(stage=>stageProgress(stage)).join('')}</section><section class="panel"><div class="panel-title"><h3>Course health</h3><span class="meta">AUTO</span></div><div class="health-list">${state.courses.map(healthItem).join('')}</div></section></div>`;
  }

  function renderCourseDetail(id){
    const c=byId(state.courses,id); if(!c){state.courseId=null;return renderHome()}
    const tasks=TASKS.map(t=>({...t,course:c,assignee_id:assigneeFor(c.id,t.key),status:statusFor(c,t.key),due_date:dueDateFor(c,t.key)}));
    const stages=STAGE_ORDER.map(stage=>({stage,tasks:tasks.filter(t=>t.stage===stage)}));
    return `<div class="page-head"><div><button class="btn small" id="backCourse">← Back</button><p class="eyebrow" style="margin-top:15px">${esc(c.course_code)}</p><h2>${esc(c.title)}</h2><p>Question milestone: ${fmtDate(c.question_deadline)} · Final gradesheet milestone: ${fmtDate(c.final_gradesheet_deadline)}</p></div><div>${statusBadge(progressPct(tasks)===100?'completed':'in_progress')}</div></div><section class="panel"><div class="panel-title"><h3>Workflow</h3><span class="meta">${progressPct(tasks)}% COMPLETE</span></div><div class="workflow">${stages.map((s,i)=>workflowStage(s,i)).join('')}</div></section>`;
  }

  function notificationItems(){
    const items=[];
    for(const t of myTasks()){
      if(t.status==='overdue') items.push({level:'overdue',title:`${t.course.course_code} — ${t.label}`,detail:`Deadline passed on ${fmtDate(t.due_date)}.`,courseId:t.course.id,rank:0});
      else if(t.due_date && t.status!=='completed' && daysFromToday(t.due_date)>=0 && daysFromToday(t.due_date)<=3) items.push({level:'waiting',title:`${t.course.course_code} — ${t.label}`,detail:`Due ${fmtDate(t.due_date)}.`,courseId:t.course.id,rank:1});
      else if((statusRow(t.course.id,t.key)?.status||'not_started')==='not_started' && taskCanStart(t.course.id,t.key) && (DEPENDENCIES[t.key]||[]).length) items.push({level:'in_progress',title:`${t.course.course_code} — ${t.label}`,detail:'Prerequisites are complete. This task is ready to start.',courseId:t.course.id,rank:2});
    }
    return items.sort((a,b)=>a.rank-b.rank);
  }
  function renderNotifications(){
    const items=notificationItems();
    return `<div class="page-head"><div><p class="eyebrow">Action Signals</p><h2>Notifications</h2><p>Generated from your assignments, deadlines, and workflow dependencies.</p></div></div><section class="panel"><div class="panel-title"><h3>Current notifications</h3><span class="meta">${items.length} ACTIVE</span></div><div class="stack">${items.length?items.map(n=>`<article class="task-card" data-open-course="${esc(n.courseId)}"><div class="task-top"><div><div class="task-role">${esc(n.title)}</div><div class="task-title">${esc(n.detail)}</div></div>${statusBadge(n.level)}</div></article>`).join(''):'<div class="empty">Nothing currently needs a notification.</div>'}</div></section>`;
  }

  function renderConflicts(){
    if(!isAdmin()) return '<div class="empty">Administrator permission required.</div>';
    const {errors,warnings}=findConflicts();
    return `<div class="page-head"><div><p class="eyebrow">Fail-safe Center</p><h2>Conflicts</h2><p>Hard errors must be fixed. Warnings require administrative review but may be legitimate.</p></div></div><div class="metrics"><div class="metric"><div class="metric-label">Hard errors</div><div class="metric-value">${errors.length}</div><div class="metric-note">Cannot be published in production</div></div><div class="metric"><div class="metric-label">Warnings</div><div class="metric-value">${warnings.length}</div><div class="metric-note">Review recommended</div></div></div><section class="panel"><div class="panel-title"><h3>Validation results</h3><span class="meta">${state.courses.length} COURSES CHECKED</span></div>${errors.map(x=>conflictBox(x,false)).join('')}${warnings.map(x=>conflictBox(x,true)).join('')||(!errors.length?'<div class="empty">No conflicts or warnings detected.</div>':'')}</section>`;
  }

  function renderAdmin(){
    if(!isAdmin()) return '<div class="empty">Administrator permission required.</div>';
    return `<div class="page-head"><div><p class="eyebrow">Administrator Workspace</p><h2>Course Assignments</h2><p>Edit only the five primary responsibilities. Derived roles are calculated automatically.</p></div></div><section class="panel"><div class="panel-title"><h3>Assignment matrix</h3><span class="meta">DERIVED ROLES LOCKED</span></div><div class="table-wrap"><table class="table"><thead><tr><th>Course</th><th>QP-A</th><th>QP-B</th><th>Moderator 1</th><th>Moderator 2</th><th>Scrutinizer</th><th></th></tr></thead><tbody>${state.courses.map(c=>adminRow(c)).join('')}</tbody></table></div></section><section class="panel"><div class="panel-title"><h3>Recent audit trail</h3><span class="meta">IMMUTABLE LOG</span></div>${renderAuditTable()}</section>`;
  }

  function renderAuditTable(){
    if(!state.auditLogs.length) return '<div class="empty">No audit records available yet.</div>';
    return `<div class="table-wrap"><table class="table"><thead><tr><th>Time</th><th>Area</th><th>Action</th><th>Record</th></tr></thead><tbody>${state.auditLogs.slice(0,30).map(l=>`<tr><td>${esc(new Date(l.created_at).toLocaleString('en-GB',{timeZone:'Asia/Dhaka'}))}</td><td>${esc(l.table_name)}</td><td>${esc(l.action)}</td><td>${esc(l.row_key||'—')}</td></tr>`).join('')}</tbody></table></div>`;
  }

  function taskCard(t,editable=false){
    const canEdit=editable && (state.demo || t.assignee_id===profileFacultyId() || isAdmin());
    const options=['not_started','in_progress','submitted','completed'].map(s=>`<option value="${s}" ${(statusRow(t.course.id,t.key)?.status||'not_started')===s?'selected':''}>${STATUS_LABEL[s]}</option>`).join('');
    return `<article class="task-card" data-open-course="${esc(t.course.id)}"><div class="task-top"><div><div class="task-course">${esc(t.course.course_code)}</div><div class="task-role">${esc(t.label)}</div><div class="task-title">${esc(t.course.title)}</div></div>${statusBadge(t.status)}</div><div class="task-foot"><span>${t.due_date?`Due ${fmtDate(t.due_date)}`:'No deadline set'}</span>${canEdit?`<select class="select" data-status-change data-course="${esc(t.course.id)}" data-task="${esc(t.key)}" onclick="event.stopPropagation()">${options}</select>`:`<span>${esc(facultyName(t.assignee_id))}</span>`}</div></article>`;
  }
  function compactCourse(c){const tasks=TASKS.filter(t=>assigneeFor(c.id,t.key)===profileFacultyId()).map(t=>({...t,status:statusFor(c,t.key)}));return `<div class="course-card" data-open-course="${esc(c.id)}"><div class="course-code">${esc(c.course_code)}</div><div class="course-name">${esc(c.title)}</div><div class="progress-row"><span>${tasks.length} responsibilities</span><span>${progressPct(tasks)}%</span></div><div class="progress"><span style="width:${progressPct(tasks)}%"></span></div></div>`}
  function courseCard(c,personal=false){const tasks=TASKS.map(t=>({...t,status:statusFor(c,t.key),assignee_id:assigneeFor(c.id,t.key)}));const mine=tasks.filter(t=>t.assignee_id===profileFacultyId());return `<article class="course-card" data-open-course="${esc(c.id)}"><div class="course-code">${esc(c.course_code)}</div><div class="course-name">${esc(c.title)}</div>${personal?`<div class="course-roles">${mine.map(t=>`<span class="role-chip">${esc(t.label)}</span>`).join('')}</div>`:''}<div class="progress-row"><span>Course progress</span><span>${progressPct(tasks)}%</span></div><div class="progress"><span style="width:${progressPct(tasks)}%"></span></div></article>`}
  function stageProgress(stage){const tasks=taskObjects().filter(t=>t.stage===stage);const pct=progressPct(tasks);return `<div class="stage-row"><div class="stage-name">${esc(stage)}</div><div class="progress"><span style="width:${pct}%"></span></div><div class="stage-pct">${pct}%</div></div>`}
  function healthItem(c){const tasks=TASKS.map(t=>({...t,status:statusFor(c,t.key),due_date:dueDateFor(c,t.key)}));const pct=progressPct(tasks);let h='green',label='On Track';if(pct===100){h='done';label='Completed'}else if(tasks.some(t=>t.status==='overdue')){h='red';label='Delayed'}else if(tasks.some(t=>t.due_date&&daysFromToday(t.due_date)>=0&&daysFromToday(t.due_date)<=3&&t.status!=='completed')){h='yellow';label='Attention'}return `<div class="health-item" data-open-course="${esc(c.id)}"><div class="health-main"><span class="health-dot ${h}"></span><div><b>${esc(c.course_code)}</b><div style="font-size:10px;color:var(--ink-soft)">${esc(c.title)}</div></div></div><span class="badge ${h==='red'?'overdue':h==='done'?'completed':h==='yellow'?'waiting':'in_progress'}">${label}</span></div>`}
  function workflowStage(s,i){const complete=s.tasks.every(t=>t.status==='completed');const any=s.tasks.some(t=>['in_progress','submitted','overdue'].includes(t.status));return `<div class="wf-stage"><div class="wf-icon ${complete?'done':any?'now':''}">${String(i+1).padStart(2,'0')}</div><div class="wf-content"><div class="wf-title">${esc(s.stage)}</div><div class="wf-people">${s.tasks.map(t=>`<span class="person-pill"><div><b>${esc(t.short)}</b><br>${esc(facultyName(t.assignee_id))}</div>${statusBadge(t.status)}</span>`).join('')}</div></div></div>`}
  function adminRow(c){const a=assignmentFor(c.id);return `<tr><td><b>${esc(c.course_code)}</b><br><span style="color:var(--ink-soft)">${esc(c.title)}</span><br><span class="badge ${c.status==='published'?'completed':'waiting'}">${esc(c.status||'draft')}</span></td><td>${esc(facultyName(a.preparer_a))}</td><td>${esc(facultyName(a.preparer_b))}</td><td>${esc(facultyName(a.moderator_1))}</td><td>${esc(facultyName(a.moderator_2))}</td><td>${esc(facultyName(a.scrutinizer))}</td><td><div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn small" data-edit-course="${esc(c.id)}">Edit</button><button class="btn small ${c.status==='published'?'danger':'accent'}" data-publish-course="${esc(c.id)}">${c.status==='published'?'Unpublish':'Publish'}</button></div></td></tr>`}

  function findConflicts(){
    const errors=[],warnings=[];
    for(const c of state.courses){const a=assignmentFor(c.id);const p=`${c.course_code} — ${c.title}`;
      const missing=['preparer_a','preparer_b','moderator_1','moderator_2','scrutinizer'].filter(k=>!a[k]); if(missing.length) errors.push({title:`${p}: incomplete assignment`,detail:`Missing ${missing.join(', ')}.`});
      if(a.preparer_a&&a.preparer_a===a.preparer_b) errors.push({title:`${p}: Section A/B preparer conflict`,detail:'Question Preparer A and Question Preparer B must be different.'});
      if(a.moderator_1&&a.moderator_1===a.moderator_2) errors.push({title:`${p}: moderator conflict`,detail:'Moderator 01 and Moderator 02 must be different.'});
      for(const m of ['moderator_1','moderator_2']) if(a[m]&&(a[m]===a.preparer_a||a[m]===a.preparer_b)) errors.push({title:`${p}: moderator independence conflict`,detail:`${m==='moderator_1'?'Moderator 01':'Moderator 02'} cannot also be a question preparer.`});
      if(a.scrutinizer&&(a.scrutinizer===a.preparer_a||a.scrutinizer===a.preparer_b)) errors.push({title:`${p}: scrutiny conflict`,detail:'Script Scrutinizer cannot be either examiner/question preparer.'});
      if(a.scrutinizer&&(a.scrutinizer===a.moderator_1||a.scrutinizer===a.moderator_2)) warnings.push({title:`${p}: moderator also scrutinizer`,detail:'This combination is permitted by the source spreadsheet, but is flagged for administrative awareness.'});
      if(c.question_deadline&&c.exam_date&&c.question_deadline>c.exam_date) errors.push({title:`${p}: invalid deadline order`,detail:'Question submission deadline occurs after the exam date.'});
      if(c.exam_date&&c.final_gradesheet_deadline&&c.exam_date>c.final_gradesheet_deadline) errors.push({title:`${p}: invalid deadline order`,detail:'Final gradesheet deadline occurs before the exam date.'});
    }
    const load={};taskObjects().forEach(t=>{if(t.assignee_id)load[t.assignee_id]=(load[t.assignee_id]||0)+1});Object.entries(load).filter(([,n])=>n>=12).forEach(([id,n])=>warnings.push({title:`High workload: ${facultyName(id)}`,detail:`${n} workflow responsibilities are currently assigned across active courses.`}));
    return {errors,warnings};
  }
  function conflictBox(x,warn){return `<div class="conflict ${warn?'warning':''}"><strong>${warn?'Warning':'Error'} — ${esc(x.title)}</strong><p>${esc(x.detail)}</p></div>`}

  function prioritySort(a,b){const rank={overdue:0,in_progress:1,submitted:2,not_started:3,waiting:4,blocked:5,completed:9};const r=(rank[a.status]??5)-(rank[b.status]??5);if(r)return r;return (a.due_date||'9999-12-31').localeCompare(b.due_date||'9999-12-31')}
  function daysFromToday(d){const a=new Date(`${todayIso()}T00:00:00`),b=new Date(`${d}T00:00:00`);return Math.round((b.getTime()-a.getTime())/86400000)}
  function firstName(n){return n.replace(/^(Dr\.|Mr\.|Ms\.|Mrs\.|Prof\.)\s+/i,'').split(' ')[0]||'Faculty'}
  function dayPart(){const h=Number(new Intl.DateTimeFormat('en',{hour:'2-digit',hour12:false,timeZone:'Asia/Dhaka'}).format(new Date()));return h<12?'morning':h<17?'afternoon':'evening'}

  async function updateStatus(courseId,key,newStatus){
    const course=byId(state.courses,courseId); if(!course)return;
    if(newStatus==='completed'&&!taskCanStart(courseId,key)){toast('Cannot complete this task before its prerequisite tasks are completed.','error');render();return}
    if(state.demo){const row=statusRow(courseId,key);if(row){row.status=newStatus;row.completed_at=newStatus==='completed'?new Date().toISOString():null}else state.statuses.push({course_id:courseId,task_key:key,status:newStatus,completed_at:newStatus==='completed'?new Date().toISOString():null});toast('Demo status updated.','success');render();return}
    const payload={course_id:courseId,task_key:key,status:newStatus,completed_at:newStatus==='completed'?new Date().toISOString():null,updated_by:state.session.user.id};
    const {error}=await state.supabase.from('task_statuses').upsert(payload,{onConflict:'course_id,task_key'});if(error){toast(error.message,'error');render();return}toast('Task status updated.','success');await bootstrap();
  }

  async function togglePublishCourse(courseId){
    const c=byId(state.courses,courseId); if(!c || !isAdmin()) return;
    const next=c.status==='published'?'draft':'published';
    if(next==='published'){
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
    const c=byId(state.courses,state.modal.courseId),a=assignmentFor(c.id);const options=(selected)=>`<option value="">Select faculty</option>${state.faculty.map(f=>`<option value="${f.id}" ${selected===f.id?'selected':''}>${esc(f.full_name)}</option>`).join('')}`;
    document.getElementById('modalRoot').innerHTML=`<div class="modal"><div class="modal-card"><div class="modal-head"><div><p class="eyebrow">Course Setup</p><h3>${esc(c.course_code)} — ${esc(c.title)}</h3></div><button class="modal-close" id="closeModal">×</button></div><form id="courseForm"><div class="form-grid"><div class="field"><label>Question Preparer A</label><select name="preparer_a" required>${options(a.preparer_a)}</select></div><div class="field"><label>Question Preparer B</label><select name="preparer_b" required>${options(a.preparer_b)}</select></div><div class="field"><label>Moderator 01</label><select name="moderator_1" required>${options(a.moderator_1)}</select></div><div class="field"><label>Moderator 02</label><select name="moderator_2" required>${options(a.moderator_2)}</select></div><div class="field"><label>Script Scrutinizer</label><select name="scrutinizer" required>${options(a.scrutinizer)}</select></div><div class="field"><label>Question Submission Deadline</label><input type="date" name="question_deadline" value="${esc(c.question_deadline||'')}"></div><div class="field"><label>Exam Date</label><input type="date" name="exam_date" value="${esc(c.exam_date||'')}"></div><div class="field"><label>Final Gradesheet Deadline</label><input type="date" name="final_gradesheet_deadline" value="${esc(c.final_gradesheet_deadline||'')}"></div><div class="span-2 notice">Derived automatically: Examiner A = QP-A, Examiner B = QP-B, Gradesheet Preparer = QP-A, Gradesheet Scrutinizer = Script Scrutinizer.</div><div class="span-2" id="formValidation"></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Validate & Save</button><button class="btn" type="button" id="cancelModal">Cancel</button></div></div></form></div></div>`;
    document.getElementById('closeModal').onclick=closeModal;document.getElementById('cancelModal').onclick=closeModal;document.getElementById('courseForm').addEventListener('submit',saveCourseAssignment);
  }
  function closeModal(){state.modal=null;document.getElementById('modalRoot').innerHTML=''}
  function validateAssignmentPayload(p,c){const errs=[];if(p.preparer_a===p.preparer_b)errs.push('Section A and Section B preparers must differ.');if(p.moderator_1===p.moderator_2)errs.push('Moderator 01 and Moderator 02 must differ.');if([p.preparer_a,p.preparer_b].includes(p.moderator_1))errs.push('Moderator 01 cannot be a question preparer.');if([p.preparer_a,p.preparer_b].includes(p.moderator_2))errs.push('Moderator 02 cannot be a question preparer.');if([p.preparer_a,p.preparer_b].includes(p.scrutinizer))errs.push('Script Scrutinizer cannot be a question preparer/examiner.');if(c.question_deadline&&c.exam_date&&c.question_deadline>c.exam_date)errs.push('Question deadline cannot be after exam date.');if(c.exam_date&&c.final_gradesheet_deadline&&c.exam_date>c.final_gradesheet_deadline)errs.push('Final gradesheet deadline cannot be before exam date.');return errs}
  async function saveCourseAssignment(e){e.preventDefault();const fd=new FormData(e.currentTarget);const c=byId(state.courses,state.modal.courseId);const p={course_id:c.id,preparer_a:fd.get('preparer_a'),preparer_b:fd.get('preparer_b'),moderator_1:fd.get('moderator_1'),moderator_2:fd.get('moderator_2'),scrutinizer:fd.get('scrutinizer')};const dates={question_deadline:fd.get('question_deadline')||null,exam_date:fd.get('exam_date')||null,final_gradesheet_deadline:fd.get('final_gradesheet_deadline')||null};const errs=validateAssignmentPayload(p,{...c,...dates});const out=document.getElementById('formValidation');if(errs.length){out.innerHTML=errs.map(x=>`<div class="notice error">${esc(x)}</div>`).join('');return}
    const previous=assignmentFor(c.id);
    const consequences=[];
    if(previous.preparer_a && previous.preparer_a!==p.preparer_a) consequences.push('QP-A → Examiner A + Gradesheet Preparer');
    if(previous.preparer_b && previous.preparer_b!==p.preparer_b) consequences.push('QP-B → Examiner B');
    if(previous.moderator_1 && previous.moderator_1!==p.moderator_1) consequences.push('Moderator 01');
    if(previous.moderator_2 && previous.moderator_2!==p.moderator_2) consequences.push('Moderator 02');
    if(previous.scrutinizer && previous.scrutinizer!==p.scrutinizer) consequences.push('Script Scrutinizer → Gradesheet Scrutinizer');
    if(consequences.length && !window.confirm(`This changes responsibility ownership:

${consequences.join('\n')}

Unfinished statuses for changed assignees will reset to Not Started. Completed work will remain completed and the change will be audited. Continue?`)) return;
    if(state.demo){Object.assign(assignmentFor(c.id),p);Object.assign(c,dates);closeModal();toast('Demo assignment saved with conflict checks.','success');render();return}
    const [aRes,cRes]=await Promise.all([state.supabase.from('primary_assignments').upsert(p,{onConflict:'course_id'}),state.supabase.from('courses').update(dates).eq('id',c.id)]);const err=aRes.error||cRes.error;if(err){out.innerHTML=`<div class="notice error">${esc(err.message)}</div>`;return}closeModal();toast('Assignments updated. Derived roles changed automatically.','success');await bootstrap();
  }

  document.addEventListener('click',e=>{
    const edit=e.target.closest('[data-edit-course]');if(edit){state.modal={type:'editCourse',courseId:edit.dataset.editCourse};renderModal();return}
    const pub=e.target.closest('[data-publish-course]');if(pub){togglePublishCourse(pub.dataset.publishCourse);return}
    if(e.target.id==='backCourse'){state.courseId=null;render();return}
  });
  document.addEventListener('input',e=>{if(e.target.id==='taskSearch'){const pos=e.target.selectionStart;state.search=e.target.value;render();const n=document.getElementById('taskSearch');if(n){n.focus();n.setSelectionRange(pos,pos)}}});
  document.addEventListener('change',e=>{if(e.target.id==='statusFilter'){state.statusFilter=e.target.value;render()}});

  init();
})();
