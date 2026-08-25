window.EXAMFLOW_DEMO = (() => {
  const faculty = [
    {id:'f1', full_name:'Faculty Alpha', designation:'Professor'},
    {id:'f2', full_name:'Faculty Beta', designation:'Professor'},
    {id:'f3', full_name:'Faculty Gamma', designation:'Lecturer'},
    {id:'f4', full_name:'Faculty Delta', designation:'Lecturer'},
    {id:'f5', full_name:'Faculty Epsilon', designation:'Lecturer'},
    {id:'f6', full_name:'Faculty Zeta', designation:'Lecturer'}
  ];
  const courses = [
    {id:'c1', course_code:'DEMO 101', title:'Demonstration Course A', term:'2026', status:'published', question_deadline:'2026-08-29', exam_date:'2026-09-05', final_gradesheet_deadline:'2026-09-20', active:true, notes:''},
    {id:'c2', course_code:'DEMO 201', title:'Demonstration Course B', term:'2026', status:'published', question_deadline:'2026-08-31', exam_date:'2026-09-07', final_gradesheet_deadline:'2026-09-22', active:true, notes:''},
    {id:'c3', course_code:'DEMO 301', title:'Demonstration Course C', term:'2026', status:'published', question_deadline:'2026-09-02', exam_date:'2026-09-10', final_gradesheet_deadline:'2026-09-25', active:true, notes:''},
    {id:'c4', course_code:'DEMO 401', title:'Demonstration Course D', term:'2026', status:'published', question_deadline:'2026-09-04', exam_date:'2026-09-12', final_gradesheet_deadline:'2026-09-27', active:true, notes:''}
  ];
  const primaryAssignments = [
    {course_id:'c1', preparer_a:'f3', preparer_b:'f4', moderator_1:'f1', moderator_2:'f5', scrutinizer:'f6'},
    {course_id:'c2', preparer_a:'f6', preparer_b:'f3', moderator_1:'f2', moderator_2:'f5', scrutinizer:'f4'},
    {course_id:'c3', preparer_a:'f4', preparer_b:'f5', moderator_1:'f2', moderator_2:'f3', scrutinizer:'f6'},
    {course_id:'c4', preparer_a:'f2', preparer_b:'f6', moderator_1:'f3', moderator_2:'f5', scrutinizer:'f5'}
  ];
  const statuses = [
    {course_id:'c1', task_key:'question_prep_a', status:'completed', completed_at:'2026-08-23T10:00:00+06:00'},
    {course_id:'c1', task_key:'question_prep_b', status:'completed', completed_at:'2026-08-24T11:00:00+06:00'},
    {course_id:'c1', task_key:'moderation_1', status:'in_progress'},
    {course_id:'c2', task_key:'question_prep_a', status:'in_progress'},
    {course_id:'c3', task_key:'question_prep_a', status:'completed'},
    {course_id:'c3', task_key:'question_prep_b', status:'completed'},
    {course_id:'c3', task_key:'moderation_1', status:'completed'},
    {course_id:'c3', task_key:'moderation_2', status:'completed'},
    {course_id:'c3', task_key:'examination_a', status:'in_progress'}
  ];
  return {faculty, courses, primaryAssignments, statuses};
})();
