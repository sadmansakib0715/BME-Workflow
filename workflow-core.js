(function(root){
  'use strict';
  const TASKS=[
    ['question_prep_a','Prepare questions · A','preparer_a'],['question_prep_b','Prepare questions · B','preparer_b'],
    ['moderation_1','Moderate questions · 01','moderator_1'],['moderation_2','Moderate questions · 02','moderator_2'],
    ['examination_a','Examine scripts · A','preparer_a'],['examination_b','Examine scripts · B','preparer_b'],
    ['scrutiny','Scrutinize scripts','scrutinizer'],['gradesheet_prep','Prepare gradesheet','preparer_a'],['gradesheet_scrutiny','Scrutinize gradesheet','scrutinizer']
  ];
  const DEPS={moderation_1:['question_prep_a','question_prep_b'],moderation_2:['question_prep_a','question_prep_b'],examination_a:['moderation_1','moderation_2'],examination_b:['moderation_1','moderation_2'],scrutiny:['examination_a','examination_b'],gradesheet_prep:['scrutiny'],gradesheet_scrutiny:['gradesheet_prep']};
  const STATES={theory:['not_started','in_progress','submitted','completed','blocked'],ct:['not_planned','proposed','scheduled','ct_taken','scripts_under_examination','scripts_checked','marks_published','postponed','cancelled'],session:['not_started','scheduled','in_progress','conducted','submission_pending','evaluation_pending','completed','cancelled'],assessment:['not_started','scheduled','evaluation_taken','marking_complete','marks_uploaded','completed','cancelled'],outline:['not_started','under_preparation','prepared','shared_with_students'],feedback:['not_started','in_progress','completed','blocked'],car:['not_started','in_progress','uploaded','completed','blocked'],grade:['not_started','in_progress','submitted','completed','blocked']};
  const LABELS={ct:'Class test',session:'Session',assessment:'Assessment',theory:'Examination',outline:'Course outline',feedback:'Student feedback',car:'Course file / CAR',grade:'Sessional grades'};
  const text=s=>String(s||'').replace(/_/g,' ').replace(/^./,c=>c.toUpperCase());
  const done=(kind,status,row={})=>status==='completed'||({ct:['marks_published'],assessment:['marks_uploaded'],outline:['shared_with_students'],car:['uploaded'],session:row.report_required?[]:['conducted']}[kind]||[]).includes(status);
  const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dhaka',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  const days=(date,now=today())=>date?Math.round((Date.parse(date+'T12:00:00Z')-Date.parse(now+'T12:00:00Z'))/86400000):null;
  const isAdmin=p=>!!p?.active&&['admin','hod'].includes(p.app_role);
  const manages=(data,course,p)=>isAdmin(p)||(data.courseFaculty||[]).some(r=>r.course_id===course&&r.faculty_id===p?.faculty_id);
  function activities(d){
    const out=[],courses=new Map((d.courses||[]).map(c=>[c.id,c]));
    const milestone=(type,cid)=>(d.termMilestones||[]).find(m=>m.course_id===cid&&m.milestone_type===type)?.milestone_date||(d.termMilestones||[]).find(m=>!m.course_id&&m.milestone_type===type)?.milestone_date||null;
    const push=(kind,row,title,owner,date,key)=>{
      const c=courses.get(row.course_id);if(!c)return;
      out.push({id:kind+':'+(row.id||row.course_id+':'+(key||'')),kind,row,course:c,title,owner:owner||null,date:date||null,key:key||null,status:row.status||'not_started',finished:done(kind,row.status,row),cancelled:row.status==='cancelled'});
    };
    for(const c of courses.values()){
      if(String(c.course_type).toLowerCase()==='theory'){
        const a=(d.primaryAssignments||[]).find(a=>a.course_id===c.id)||{};
        for(const [key,title,field] of TASKS){
          const row=(d.statuses||[]).find(s=>s.course_id===c.id&&s.task_key===key)||{course_id:c.id,task_key:key,status:'not_started'};
          const due=(d.deadlines||[]).find(s=>s.course_id===c.id&&s.task_key===key)?.due_date||(key.startsWith('question')||key.startsWith('moderation')?c.question_deadline||milestone('QUESTION_SUBMISSION_DEADLINE',c.id):c.final_gradesheet_deadline||milestone('THEORY_GRADESHEET_DEADLINE',c.id));
          push('theory',row,title,a[field],due,key);
        }
      }
    }
    for(const r of d.classTests||[])push('ct',r,r.title||'CT '+r.ct_number,r.responsible_faculty||r.responsible_faculty_id,r.status==='scripts_checked'?r.publication_due_date:['ct_taken','scripts_under_examination'].includes(r.status)?r.marking_due_date:r.scheduled_date||r.date);
    for(const r of d.sessionalSessions||[])push('session',r,r.title||'Session '+r.session_no,r.assigned_faculty,r.report_required&&['conducted','submission_pending','evaluation_pending'].includes(r.status)?r.report_deadline:r.date);
    for(const r of d.assessmentInstances||[])push('assessment',r,r.title||'Assessment '+r.sequence_number,r.responsible_faculty,r.due_date||r.scheduled_date);
    for(const [list,kind,title,type] of [['courseOutlines','outline','Share course outline','COURSE_OUTLINE_SHARING'],['feedbackStatuses','feedback','Collect student feedback','FEEDBACK_DEADLINE'],['courseFileStatuses','car','Complete course file / CAR','CAR_DEADLINE']]){
      for(const r of d[list]||[])push(kind,r,title,r.responsible_faculty,r.due_date||r.deadline||milestone(type,r.course_id));
    }
    for(const a of d.sessionalGradeAssignments||[]){
      for(const [key,title,owner] of [['sessional_gradesheet_prep','Prepare sessional gradesheet',a.preparer],['sessional_gradesheet_scrutiny','Scrutinize sessional gradesheet',a.scrutinizer]]){
        const r=(d.sessionalGradeStatuses||[]).find(r=>r.course_id===a.course_id&&r.task_key===key)||{course_id:a.course_id,task_key:key,status:'not_started'};
        push('grade',r,title,owner,r.due_date||milestone('SESSIONAL_GRADESHEET_DEADLINE',r.course_id),key);
      }
    }
    for(const a of out){
      let keys=a.kind==='theory'?DEPS[a.key]||[]:a.kind==='grade'&&a.key==='sessional_gradesheet_scrutiny'?['sessional_gradesheet_prep']:[];
      a.waiting=keys.map(k=>out.find(x=>x.course.id===a.course.id&&x.key===k)).filter(x=>!x||!x.finished);
    }
    return out;
  }
  function bucket(a,now=today()){
    if(a.finished||a.cancelled)return 'completed';
    if(a.waiting?.length)return 'waiting';
    if(a.status==='blocked'||!a.date||days(a.date,now)<=0)return 'attention';
    return 'upcoming';
  }
  function progress(items){const required=items.filter(a=>!a.cancelled);return required.length?Math.round(100*required.filter(a=>a.finished).length/required.length):null;}
  function sort(a,b){const rank={attention:0,waiting:2,upcoming:1,completed:3};return rank[bucket(a)]-rank[bucket(b)]||(a.date||'9999').localeCompare(b.date||'9999')||a.title.localeCompare(b.title);}
  function parseCSV(text){
    const rows=[];let row=[],cell='',quoted=false;
    text=text.replace(/^\uFEFF/,'');
    for(let i=0;i<text.length;i++){const ch=text[i];if(ch==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}else if(ch===','&&!quoted){row.push(cell);cell='';}else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&text[i+1]==='\n')i++;row.push(cell);if(row.some(x=>x.trim()))rows.push(row);row=[];cell='';}else cell+=ch;}
    if(quoted)throw Error('An opening quote is missing its closing quote.');
    row.push(cell);if(row.some(x=>x.trim()))rows.push(row);return rows;
  }
  function isoDate(raw){
    if(!raw?.trim())return null;
    const s=raw.trim();let y,m,d,match;
    if((match=s.match(/^(\d{4})-(\d{2})-(\d{2})$/))){[,y,m,d]=match;}
    else if((match=s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))){[,d,m,y]=match;}
    else {
      const clean=s.replace(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s*/i,'');
      const months=['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'];
      if((match=clean.match(/^(\d{1,2})-([A-Za-z]+)-(\d{4})$/))){d=match[1];m=months.indexOf(match[2].slice(0,3).toLowerCase())+1;y=match[3];}
      else if((match=clean.match(/^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/))){m=months.indexOf(match[1].slice(0,3).toLowerCase())+1;d=match[2];y=match[3];}
      else throw Error('Unrecognized date: '+s);
    }
    const date=new Date(Date.UTC(+y,+m-1,+d));if(date.getUTCFullYear()!==+y||date.getUTCMonth()!==+m-1||date.getUTCDate()!==+d)throw Error('Invalid date: '+s);
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function previewCT(text,data){
    const rows=parseCSV(text);if(!rows.length)throw Error('The file is empty.');const headers=rows.shift().map(x=>x.trim());
    const codeCol=headers.findIndex(h=>/^course\s+code$/i.test(h));if(codeCol<0)throw Error('Expected a Class Test Tracker CSV with a Course Code header.');
    const slots=headers.map((h,i)=>({m:h.match(/^CT\s*0*(\d+)\s+Date$/i),i})).filter(x=>x.m);
    if(!slots.length)throw Error('No CT date columns were found.');
    const map={'CT Scheduled':'scheduled','CT Taken':'ct_taken','Scripts Under Examination':'scripts_under_examination','Scripts Checked':'scripts_checked','Marks Published':'marks_published'};
    const out=[],seen=new Set();
    rows.forEach((r,ri)=>{
      const code=(r[codeCol]||'').trim().replace(/\s+/g,' ');if(!code)return;
      const course=data.courses.find(c=>c.course_code.trim().replace(/\s+/g,' ')===code);
      for(const {m,i} of slots){const raw=r[i]||'',statusRaw=(r[i+1]||'').trim();if(!raw&&!statusRaw)continue;const n=+m[1],key=code+':'+n,errors=[],warnings=[];let date=null;
        try{date=isoDate(raw);}catch(e){errors.push(e.message);}
        if(!course)errors.push('Course is not in the selected term.');
        if(seen.has(key))errors.push('Duplicate CT number in this file.');seen.add(key);
        if(statusRaw&&!map[statusRaw])errors.push('Unknown status: '+statusRaw);
        const matches=(data.classTests||[]).filter(x=>x.course_id===course?.id&&+x.ct_number===n);
        if(matches.length>1)errors.push('Multiple sections/records match. Resolve the scope before import.');
        const old=matches[0];if(!date)warnings.push('Date missing');
        if(date&&date<today()&&map[statusRaw]==='scheduled')warnings.push('Past date; confirm actual state');
        if(!old?.responsible_faculty)warnings.push('Owner must be assigned');
        const status=map[statusRaw]||(date?'scheduled':'not_planned');
        const changed=!old||date!==(old.scheduled_date||old.date||null)||status!==old.status;
        out.push({source_row:ri+2,source_column:i+1,original_course_code:r[codeCol],original_date:raw,original_status:statusRaw,course_code:code,course_id:course?.id,ct_number:n,scheduled_date:date,status,old,errors,warnings,action:errors.length?'blocked':!old?'new':changed?'changed':'unchanged'});
      }
    });return out;
  }
  const weekForDate=(weeks,date)=>weeks.find(w=>w.starts_on&&w.ends_on&&w.starts_on<=date&&date<=w.ends_on)?.week_no??null;
  const api={weekForDate,TASKS,DEPS,STATES,LABELS,text,done,today,days,isAdmin,manages,activities,bucket,progress,sort,parseCSV,isoDate,previewCT};
  if(typeof module!=='undefined')module.exports=api;root.Workflow=api;
})(typeof window!=='undefined'?window:globalThis);
