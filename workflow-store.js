/* One authenticated client and one invalidation path for every screen. */
(function(root){
  'use strict';
  const TABLES={faculty:'faculty',courses:'courses',primaryAssignments:'primary_assignments',statuses:'task_statuses',deadlines:'task_deadlines',academicWeeks:'academic_weeks',termMilestones:'term_milestones',courseSections:'course_sections',courseFaculty:'course_faculty',classTests:'class_tests',classTestHistory:'class_test_history',courseOutlines:'course_outline_statuses',feedbackStatuses:'feedback_statuses',courseFileStatuses:'course_file_statuses',sessionalConfigs:'sessional_course_configs',sessionalSessions:'sessional_sessions',assessmentComponents:'assessment_components',assessmentInstances:'assessment_instances',sessionalGradeAssignments:'sessional_grade_assignments',sessionalGradeStatuses:'sessional_grade_statuses',notifications:'notifications',receipts:'notification_receipts',requests:'workflow_requests'};
  const KIND={theory:'statuses',ct:'classTests',session:'sessionalSessions',assessment:'assessmentInstances',outline:'courseOutlines',feedback:'feedbackStatuses',car:'courseFileStatuses',grade:'sessionalGradeStatuses'};
  class Store{
    constructor(client){this.client=client;this.demo=!client;this.data={};this.pending=false;this.profile=null;this.termId=null;}
    async query(query,label){const {data,error}=await query;if(error)throw Error(`${label}: ${error.message}`);return data;}
    async load(){
      if(this.demo)return this.data;
      if(!await this.query(this.client.rpc('has_active_profile'),'Account access'))throw Error('This verified account is awaiting approval or its access was revoked.');
      const terms=await this.query(this.client.from('academic_terms').select('*').order('created_at',{ascending:false}),'Terms');
      const term=terms.find(t=>t.id===this.termId)||terms.find(t=>t.active)||terms[0];
      const next={terms,term,errors:[]};
      if(!term)throw Error('No academic term has been configured. Ask an administrator to create one.');
      const results=await Promise.allSettled(Object.entries(TABLES).map(async([key,table])=>{
        let q=this.client.from(table).select('*');
        if(['courses','academicWeeks','termMilestones'].includes(key))q=q.eq('term_id',term.id);
        if(key==='notifications')q=q.order('created_at',{ascending:false}).limit(100);
        if(key==='classTestHistory')q=q.order('created_at',{ascending:false}).limit(100);
        return [key,await this.query(q,table)||[]];
      }));
      results.forEach((r,i)=>{const key=Object.keys(TABLES)[i];if(r.status==='fulfilled')next[key]=r.value[1];else {next[key]=[];next.errors.push({key,message:r.reason.message});}});
      if(next.errors.length)throw Error('The workspace could not be loaded completely. '+next.errors.map(e=>e.message).join(' · '));
      const ids=new Set(next.courses.map(c=>c.id));
      for(const [key,rows] of Object.entries(next))if(Array.isArray(rows)&&!['terms','faculty','notifications','receipts','errors'].includes(key))next[key]=rows.filter(r=>!r.course_id||ids.has(r.course_id));
      next.department=await this.query(this.client.rpc('workflow_department',{p_term:term.id}),'Department summary');
      if(root.Workflow.isAdmin(this.profile)){
        next.allowed=await this.query(this.client.from('allowed_users').select('*'),'Faculty approvals');
        next.audit=await this.query(this.client.from('audit_logs').select('*').order('created_at',{ascending:false}).limit(100),'Audit history');
        next.outbox=await this.query(this.client.from('notification_outbox').select('id,status,attempts,last_error,created_at').order('created_at',{ascending:false}).limit(100),'Delivery status');
      }
      this.data=next;return next;
    }
    async mutate(endpoint,args){
      if(this.pending)throw Error('A save is already in progress.');this.pending=true;
      try{const result=await this.query(this.client.rpc(endpoint,args),'Save failed');try{await this.load();}catch(error){error.saved=true;throw error;}return result;}finally{this.pending=false;}
    }
    async save(a,patch){
      if(!this.demo)return this.mutate('workflow_save_activity',{p_kind:a.kind,p_course:a.course.id,p_id:a.row.id||null,p_task:a.key,p_patch:patch,p_expected:a.row.revision??null});
      if(a.waiting.length&&patch.status==='completed')throw Error('Complete the prerequisites first.');
      if(!root.Workflow.isAdmin(this.profile)&&a.owner!==this.profile.faculty_id)throw Error('Only the assigned owner can update this work.');
      const list=this.data[KIND[a.kind]]||(this.data[KIND[a.kind]]=[]);
      let row=list.find(r=>a.row.id?r.id===a.row.id:r.course_id===a.course.id&&(!a.key||r.task_key===a.key));
      if(!row){row={...a.row};list.push(row);}Object.assign(row,patch,{revision:(row.revision||0)+1,updated_at:new Date().toISOString()});
    }
  }
  root.WorkflowStore={Store,TABLES,KIND};
})(window);
