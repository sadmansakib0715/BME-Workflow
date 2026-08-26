(() => {
  'use strict';

  const cfg = window.EXAMFLOW_CONFIG || {};
  const CT_STATUSES = [
    ['not_planned','Not Started / Not Planned'],
    ['scheduled','CT Scheduled'],
    ['ct_taken','CT Taken'],
    ['scripts_under_examination','Scripts Under Examination'],
    ['scripts_checked','Scripts Checked'],
    ['marks_published','Marks Published'],
    ['postponed','Postponed'],
    ['cancelled','Cancelled']
  ];
  const SESSIONAL_STATUSES = [
    ['not_started','Not Started'], ['scheduled','Scheduled'],
    ['evaluation_taken','Evaluation Taken'], ['marking_complete','Marking Complete'],
    ['marks_uploaded','Marks Uploaded in Excel'], ['completed','Completed'], ['cancelled','Cancelled']
  ];
  const ASSESSMENT_PRESETS = [
    'Continuous Assessment','Continuous Assessment Quiz','Continuous Assessment Viva',
    'Lab Report','Lab Quiz','Lab Viva','Lab Test','Final Viva','Final Quiz',
    'Presentation','Demonstration','Intermediate Submission','Final Report','Attendance','Project'
  ];

  let sb, session, profile, activeTerm;
  let faculty=[], courses=[], courseFaculty=[], classTests=[], configs=[], components=[], instances=[];
  let observer=null;

  const esc=(v='')=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const byId=(a,id)=>a.find(x=>x.id===id);
  const facultyName=id=>byId(faculty,id)?.full_name||'Unassigned';
  const normalizeCode=c=>String(c||'').replace(/\s+/g,' ').trim();
  const isAdmin=()=>['admin','hod'].includes(profile?.app_role);
  const courseType=c=>{
    const raw=String(c.course_type||'').toLowerCase();
    if(raw==='sessional'||raw==='lab')return 'sessional';
    if(raw==='theory')return 'theory';
    const n=Number(String(c.course_code||'').match(/\d{3}/)?.[0]);
    return Number.isFinite(n)&&n%2===0?'sessional':'theory';
  };
  const toast=(message,type='')=>{
    let wrap=document.querySelector('.toast-wrap');
    if(!wrap){wrap=document.createElement('div');wrap.className='toast-wrap';document.body.appendChild(wrap);}
    const el=document.createElement('div');el.className=`toast ${type}`;el.textContent=message;wrap.appendChild(el);setTimeout(()=>el.remove(),3800);
  };

  async function init(){
    if(new URLSearchParams(location.search).get('demo')==='1'){installDemoWarning();return;}
    if(cfg.mode!=='production'||!cfg.supabaseUrl||!cfg.supabaseAnonKey||!window.supabase)return;
    sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    ({data:{session}}=await sb.auth.getSession());
    if(!session)return;
    await loadData(); install();
    sb.auth.onAuthStateChange(async(_e,s)=>{session=s;if(s){await loadData();install();}});
  }

  function installDemoWarning(){
    if(document.querySelector('.tracker-admin-demo-warning'))return;
    const el=document.createElement('div');el.className='tracker-admin-demo-warning';
    el.textContent='DEMO MODE — changes are browser-only and are NOT written to Supabase. Remove ?demo=1 and sign in with an approved BME account for real updates.';
    document.body.prepend(el); injectStyles();
  }

  async function loadData(){
    const p=await sb.from('profiles').select('user_id,faculty_id,app_role,active').eq('user_id',session.user.id).maybeSingle();
    if(p.error||!p.data?.active)return; profile=p.data;
    const term=await sb.from('academic_terms').select('*').eq('active',true).order('created_at',{ascending:false}).limit(1).maybeSingle();
    activeTerm=term.data||null;
    const rs=await Promise.all([
      sb.from('faculty').select('id,full_name').order('full_name'),
      sb.from('courses').select('*').eq('active',true).order('course_code'),
      sb.from('course_faculty').select('*'),
      sb.from('class_tests').select('*').order('ct_number'),
      sb.from('sessional_course_configs').select('*'),
      sb.from('assessment_components').select('*').order('display_order'),
      sb.from('assessment_instances').select('*').order('sequence_number')
    ]);
    const err=rs.find(r=>r.error)?.error;
    if(err){console.warn('BME tracker manager could not load:',err.message);return;}
    [faculty,courses,courseFaculty,classTests,configs,components,instances]=rs.map(r=>r.data||[]);
  }

  function install(){
    if(!profile)return; injectStyles(); injectButtons();
    observer?.disconnect(); observer=new MutationObserver(injectButtons);
    const app=document.getElementById('app');if(app)observer.observe(app,{subtree:true,childList:true});
  }

  function injectButtons(){
    const nav=document.querySelector('.nav'); if(!nav||nav.querySelector('[data-tracker-manager]'))return;
    const logout=nav.querySelector('#logoutBtn');
    [['ct','CT+','Manage CTs'],['sessional','SL','Sessional Setup']].forEach(([k,i,l])=>{
      const b=document.createElement('button');b.dataset.trackerManager=k;b.innerHTML=`<span>${i}</span>${l}`;b.onclick=()=>openManager(k);nav.insertBefore(b,logout);
    });
    if(isAdmin()){
      const b=document.createElement('button');b.dataset.trackerManager='health';b.innerHTML='<span>DB</span>Sync Health';b.onclick=()=>openManager('health');nav.insertBefore(b,logout);
    }
  }

  function canManage(c){
    return isAdmin()||courseFaculty.some(x=>x.course_id===c.id&&x.faculty_id===profile.faculty_id);
  }
  const theoryCourses=()=>courses.filter(c=>courseType(c)==='theory'&&canManage(c));
  const sessionalCourses=()=>courses.filter(c=>courseType(c)==='sessional'&&canManage(c));

  function modal(title,body){
    closeModal(); const root=document.createElement('div');root.id='trackerAdminRoot';root.className='tracker-admin-modal';
    root.innerHTML=`<div class="tracker-admin-card"><div class="tracker-admin-head"><div><p class="eyebrow">Activity Tracker Control</p><h2>${esc(title)}</h2></div><button class="btn" id="trackerAdminClose">Close</button></div><div id="trackerAdminBody">${body}</div></div>`;
    document.body.appendChild(root);document.getElementById('trackerAdminClose').onclick=closeModal;root.onclick=e=>{if(e.target===root)closeModal();};
  }
  function closeModal(){document.getElementById('trackerAdminRoot')?.remove();}
  async function openManager(kind){await loadData();if(kind==='ct')renderCtManager();if(kind==='sessional')renderSessionalManager();if(kind==='health')renderHealth();}

  function renderCtManager(selected){
    const cs=theoryCourses();selected=selected||cs[0]?.id||'';
    const rows=classTests.filter(x=>x.course_id===selected).sort((a,b)=>(a.ct_number||99)-(b.ct_number||99));
    modal('Class Test Manager',`<div class="tracker-toolbar"><label>Course <select id="ctCourse">${cs.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(normalizeCode(c.course_code))} — ${esc(c.title)}</option>`).join('')}</select></label><button class="btn accent" id="newCtBtn">+ Add CT</button></div><div class="notice">Writes directly to <b>Supabase → class_tests</b>. Date/time changes are automatically recorded by the database trigger.</div><div class="tracker-list">${rows.length?rows.map(ctRow).join(''):'<div class="empty">No CTs for this course yet.</div>'}</div>`);
    document.getElementById('ctCourse')?.addEventListener('change',e=>renderCtManager(e.target.value));
    document.getElementById('newCtBtn')?.addEventListener('click',()=>editCt(selected));
    document.querySelectorAll('[data-edit-ct]').forEach(b=>b.onclick=()=>editCt(selected,b.dataset.editCt));
  }
  function ctRow(ct){return `<div class="tracker-row"><div><b>${esc(ct.title||`CT ${ct.ct_number||''}`)}</b><span>${esc(ct.scheduled_date||ct.date||'Date not set')} · ${esc(CT_STATUSES.find(x=>x[0]===ct.status)?.[1]||ct.status)}</span></div><button class="btn small" data-edit-ct="${ct.id}">Edit</button></div>`;}
  const nextCtNumber=courseId=>Math.max(0,...classTests.filter(x=>x.course_id===courseId).map(x=>Number(x.ct_number)||0))+1;
  function editCt(courseId,id){
    const ct=id?byId(classTests,id):null, n=ct?.ct_number||nextCtNumber(courseId);
    const teacherIds=[...new Set(courseFaculty.filter(x=>x.course_id===courseId).map(x=>x.faculty_id))];
    document.getElementById('trackerAdminBody').innerHTML=`<form id="ctEditForm"><div class="form-grid"><div class="field"><label>CT Number</label><input name="ct_number" type="number" min="1" value="${esc(n)}" required></div><div class="field"><label>Title</label><input name="title" value="${esc(ct?.title||`CT ${String(n).padStart(2,'0')}`)}" required></div><div class="field"><label>Date</label><input name="scheduled_date" type="date" value="${esc(ct?.scheduled_date||ct?.date||'')}"></div><div class="field"><label>Status</label><select name="status">${CT_STATUSES.map(([v,l])=>`<option value="${v}" ${ct?.status===v?'selected':''}>${l}</option>`).join('')}</select></div><div class="field"><label>Section</label><input name="section" value="${esc(ct?.section||'X')}"></div><div class="field"><label>Responsible Faculty</label><select name="responsible_faculty"><option value="">Course-wide / unassigned</option>${teacherIds.map(fid=>`<option value="${fid}" ${(ct?.responsible_faculty||ct?.responsible_faculty_id)===fid?'selected':''}>${esc(facultyName(fid))}</option>`).join('')}</select></div><div class="field span-2"><label>Syllabus / Topics</label><input name="syllabus" value="${esc(ct?.syllabus||'')}"></div><div class="field span-2"><label>Notes / Reschedule Reason</label><input name="notes" value="${esc(ct?.notes||'')}"></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Save to Supabase</button><button class="btn" type="button" id="cancelCt">Cancel</button></div></div></form>`;
    document.getElementById('cancelCt').onclick=()=>renderCtManager(courseId);document.getElementById('ctEditForm').onsubmit=e=>saveCt(e,courseId,ct);
  }
  async function saveCt(e,courseId,ct){
    e.preventDefault();const fd=new FormData(e.currentTarget);
    const fid=fd.get('responsible_faculty')||null;
    const payload={course_id:courseId,term_id:activeTerm?.id||null,ct_number:Number(fd.get('ct_number')),title:String(fd.get('title')).trim(),scheduled_date:fd.get('scheduled_date')||null,status:fd.get('status'),section:String(fd.get('section')||'X').trim(),responsible_faculty:fid,responsible_faculty_id:fid,syllabus:String(fd.get('syllabus')||'').trim(),notes:String(fd.get('notes')||'').trim()};
    const r=ct?await sb.from('class_tests').update(payload).eq('id',ct.id):await sb.from('class_tests').insert(payload);
    if(r.error){toast(`CT save failed: ${r.error.message}`,'error');return;}toast('CT saved to Supabase.','success');await loadData();renderCtManager(courseId);
  }

  function renderSessionalManager(selected){
    const cs=sessionalCourses();selected=selected||cs[0]?.id||'';
    const config=configs.find(x=>x.course_id===selected)||{}, comps=components.filter(x=>x.course_id===selected), ins=instances.filter(x=>x.course_id===selected);
    modal('Sessional Setup & Assessment Manager',`<div class="tracker-toolbar"><label>Course <select id="sesCourse">${cs.map(c=>`<option value="${c.id}" ${c.id===selected?'selected':''}>${esc(normalizeCode(c.course_code))} — ${esc(c.title)}</option>`).join('')}</select></label></div>${selected?`<section class="tracker-section"><div class="tracker-section-head"><div><b>Course Setup</b><span>Set the number of sessions/labs. Assessment structure remains editable.</span></div></div><form id="sesConfigForm"><div class="form-grid"><div class="field"><label>Number of Sessions / Labs</label><input type="number" min="0" name="session_count" value="${esc(config.session_count||0)}"></div><div class="field"><label>Setup Status</label><select name="config_status"><option value="setup_required" ${config.config_status!=='configured'?'selected':''}>Setup Required</option><option value="configured" ${config.config_status==='configured'?'selected':''}>Configured</option></select></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Save Course Setup</button></div></div></form></section><section class="tracker-section"><div class="tracker-section-head"><div><b>Assessment Components</b><span>Reports, quiz, viva, lab test, presentation, final report, or any custom type.</span></div><button class="btn accent" id="addComponent">+ Add Component</button></div><div class="tracker-list">${comps.length?comps.map(componentRow).join(''):'<div class="empty">No components configured yet.</div>'}</div></section><section class="tracker-section"><div class="tracker-section-head"><div><b>Assessment Activity</b><span>Uses the exact workbook lifecycle: Scheduled → Evaluation Taken → Marking Complete → Marks Uploaded.</span></div></div><div class="tracker-list">${ins.length?ins.map(instanceRow).join(''):'<div class="empty">Adding a component automatically generates its assessment items.</div>'}</div></section>`:'<div class="empty">No accessible sessional course.</div>'}`);
    document.getElementById('sesCourse')?.addEventListener('change',e=>renderSessionalManager(e.target.value));
    document.getElementById('sesConfigForm')?.addEventListener('submit',e=>saveConfig(e,selected));
    document.getElementById('addComponent')?.addEventListener('click',()=>editComponent(selected));
    document.querySelectorAll('[data-edit-component]').forEach(b=>b.onclick=()=>editComponent(selected,b.dataset.editComponent));
    document.querySelectorAll('[data-instance-status]').forEach(s=>s.onchange=()=>saveInstanceStatus(s.dataset.instanceStatus,s.value,selected));
  }
  function componentRow(c){return `<div class="tracker-row"><div><b>${esc(c.name)}</b><span>${c.quantity} item(s) · ${esc(c.marks_each||0)} marks each · ${esc(c.scope||'Entire Course')}</span></div><button class="btn small" data-edit-component="${c.id}">Edit</button></div>`;}
  function instanceRow(i){return `<div class="tracker-row"><div><b>${esc(i.title||'Assessment')}</b><span>${esc(i.scheduled_date||i.due_date||'Date not set')} · ${esc(facultyName(i.responsible_faculty))}</span></div><select class="select" data-instance-status="${i.id}">${SESSIONAL_STATUSES.map(([v,l])=>`<option value="${v}" ${i.status===v?'selected':''}>${l}</option>`).join('')}</select></div>`;}
  async function saveConfig(e,courseId){
    e.preventDefault();const fd=new FormData(e.currentTarget), old=configs.find(x=>x.course_id===courseId);
    const payload={course_id:courseId,term_id:activeTerm?.id||null,session_count:Number(fd.get('session_count')||0),config_status:fd.get('config_status'),version:(old?.version||0)+1};
    const r=await sb.from('sessional_course_configs').upsert(payload,{onConflict:'course_id'});if(r.error){toast(`Save failed: ${r.error.message}`,'error');return;}toast('Sessional setup saved to Supabase.','success');await loadData();renderSessionalManager(courseId);
  }
  function editComponent(courseId,id){
    const c=id?byId(components,id):null, teachers=[...new Set(courseFaculty.filter(x=>x.course_id===courseId).map(x=>x.faculty_id))];
    document.getElementById('trackerAdminBody').innerHTML=`<form id="componentForm"><div class="form-grid"><div class="field"><label>Assessment Type</label><input list="assessmentPresets" name="name" value="${esc(c?.name||'')}" required><datalist id="assessmentPresets">${ASSESSMENT_PRESETS.map(x=>`<option value="${esc(x)}"></option>`).join('')}</datalist></div><div class="field"><label>Number of Items</label><input type="number" min="1" name="quantity" value="${esc(c?.quantity||1)}" required></div><div class="field"><label>Marks Each</label><input type="number" min="0" step="0.5" name="marks_each" value="${esc(c?.marks_each||0)}"></div><div class="field"><label>Counted Quantity</label><input type="number" min="0" name="counted_quantity" value="${esc(c?.counted_quantity??c?.quantity??1)}"></div><div class="field"><label>Scope</label><select name="scope">${['Entire Course','A1','A2','Selected Sections'].map(x=>`<option ${c?.scope===x?'selected':''}>${x}</option>`).join('')}</select></div><div class="field"><label>Responsible Faculty</label><select name="responsible_faculty"><option value="">Course-wide / unassigned</option>${teachers.map(fid=>`<option value="${fid}" ${c?.responsible_faculty===fid?'selected':''}>${esc(facultyName(fid))}</option>`).join('')}</select></div><div class="span-2 auth-actions"><button class="btn accent" type="submit">Save & Generate Items</button><button class="btn" type="button" id="cancelComponent">Cancel</button></div></div></form>`;
    document.getElementById('cancelComponent').onclick=()=>renderSessionalManager(courseId);document.getElementById('componentForm').onsubmit=e=>saveComponent(e,courseId,c);
  }
  async function saveComponent(e,courseId,old){
    e.preventDefault();const fd=new FormData(e.currentTarget), quantity=Number(fd.get('quantity'));
    const payload={course_id:courseId,name:String(fd.get('name')).trim(),quantity,marks_each:Number(fd.get('marks_each')||0),counted_quantity:Number(fd.get('counted_quantity')||quantity),scope:fd.get('scope'),responsible_faculty:fd.get('responsible_faculty')||null,display_order:old?.display_order||components.filter(x=>x.course_id===courseId).length+1,active:true};
    const r=old?await sb.from('assessment_components').update(payload).eq('id',old.id).select().single():await sb.from('assessment_components').insert(payload).select().single();
    if(r.error){toast(`Component save failed: ${r.error.message}`,'error');return;}
    const comp=r.data, existing=instances.filter(x=>x.component_id===comp.id), toInsert=[];
    for(let n=existing.length+1;n<=quantity;n++)toInsert.push({component_id:comp.id,course_id:courseId,sequence_number:n,title:`${payload.name} ${String(n).padStart(2,'0')}`,scope:payload.scope,status:'scheduled',responsible_faculty:payload.responsible_faculty});
    if(toInsert.length){const ir=await sb.from('assessment_instances').insert(toInsert);if(ir.error){toast(`Component saved; item generation failed: ${ir.error.message}`,'error');return;}}
    if(existing.length>quantity){
      const extras=existing.filter(x=>(x.sequence_number||999)>quantity), used=extras.some(x=>!['not_started','scheduled','cancelled'].includes(x.status));
      const er=used?await sb.from('assessment_instances').update({status:'cancelled'}).in('id',extras.map(x=>x.id)):await sb.from('assessment_instances').delete().in('id',extras.map(x=>x.id));
      if(er.error){toast(`Component saved; extra-item cleanup failed: ${er.error.message}`,'error');return;}
    }
    toast('Assessment structure saved to Supabase.','success');await loadData();renderSessionalManager(courseId);
  }
  async function saveInstanceStatus(id,status,courseId){const r=await sb.from('assessment_instances').update({status}).eq('id',id);if(r.error){toast(`Status save failed: ${r.error.message}`,'error');return;}toast('Assessment status saved.','success');await loadData();renderSessionalManager(courseId);}

  function renderHealth(){
    const theory=courses.filter(c=>courseType(c)==='theory').length, sessional=courses.filter(c=>courseType(c)==='sessional').length;
    const configured=configs.filter(x=>x.config_status==='configured').length, missingCtDates=classTests.filter(x=>x.status&&x.status!=='not_planned'&&!(x.scheduled_date||x.date)).length;
    modal('Supabase Sync Health',`<div class="metrics"><div class="metric"><div class="metric-label">Courses</div><div class="metric-value">${courses.length}</div><div class="metric-note">${theory} theory · ${sessional} sessional</div></div><div class="metric"><div class="metric-label">CT records</div><div class="metric-value">${classTests.length}</div><div class="metric-note">${missingCtDates} with missing dates</div></div><div class="metric"><div class="metric-label">Sessional configured</div><div class="metric-value">${configured}/${sessional}</div><div class="metric-note">editable per course</div></div><div class="metric"><div class="metric-label">Assessment items</div><div class="metric-value">${instances.length}</div><div class="metric-note">persisted in Supabase</div></div></div><div class="notice ${classTests.length&&sessional?'success':''}">${classTests.length&&sessional?'Core CT and sessional tables are populated.':'The schema may exist, but the full workbook has not been seeded into Supabase yet.'}</div>`);
  }

  function injectStyles(){
    if(document.getElementById('trackerAdminStyles'))return;
    const s=document.createElement('style');s.id='trackerAdminStyles';s.textContent=`.tracker-admin-demo-warning{position:sticky;top:0;z-index:9999;background:#7f1d1d;color:#fff;padding:10px 16px;font:600 12px/1.4 Inter,sans-serif;text-align:center}.tracker-admin-modal{position:fixed;inset:0;z-index:9998;background:rgba(15,23,42,.58);display:flex;align-items:flex-start;justify-content:center;padding:4vh 18px;overflow:auto}.tracker-admin-card{width:min(1040px,96vw);background:#fffdf7;border:1px solid #d9d2c5;border-radius:20px;box-shadow:0 25px 80px rgba(15,23,42,.22);padding:22px}.tracker-admin-head,.tracker-section-head,.tracker-toolbar,.tracker-row{display:flex;gap:12px;align-items:center;justify-content:space-between}.tracker-admin-head{padding-bottom:16px;border-bottom:1px solid #ddd5c8}.tracker-toolbar{margin:18px 0;flex-wrap:wrap}.tracker-toolbar label{display:flex;gap:8px;align-items:center;font-weight:600}.tracker-toolbar select{min-width:360px;max-width:70vw}.tracker-section{margin-top:18px;padding:16px;border:1px solid #ddd5c8;border-radius:14px;background:#fff}.tracker-section-head{margin-bottom:12px}.tracker-section-head span,.tracker-row span{display:block;color:#667085;font-size:11px;margin-top:3px}.tracker-list{display:grid;gap:8px}.tracker-row{padding:11px 12px;border:1px solid #e6e0d5;border-radius:11px;background:#fff}.tracker-row select{max-width:250px}@media(max-width:700px){.tracker-admin-card{padding:14px}.tracker-admin-head,.tracker-section-head,.tracker-row{align-items:flex-start;flex-direction:column}.tracker-toolbar select{min-width:0;width:100%}}`;document.head.appendChild(s);
  }

  init();
})();
