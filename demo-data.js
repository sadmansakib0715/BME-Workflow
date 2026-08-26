window.EXAMFLOW_DEMO = (() => {
  const faculty = [
    {id:'f1', full_name:'Faculty Alpha', designation:'Professor', email:'alpha@bme.buet.ac.bd'},
    {id:'f2', full_name:'Faculty Beta', designation:'Professor', email:'beta@bme.buet.ac.bd'},
    {id:'f3', full_name:'Faculty Gamma', designation:'Lecturer', email:'gamma@bme.buet.ac.bd'},
    {id:'f4', full_name:'Faculty Delta', designation:'Lecturer', email:'delta@bme.buet.ac.bd'},
    {id:'f5', full_name:'Faculty Epsilon', designation:'Lecturer', email:'epsilon@bme.buet.ac.bd'},
    {id:'f6', full_name:'Faculty Zeta', designation:'Lecturer', email:'zeta@bme.buet.ac.bd'}
  ];

  const term = {
    id:'term-jan-2026',
    name:'January 2026',
    start_date:'2026-06-28',
    end_date:'2026-10-08',
    total_teaching_weeks:14,
    latest_completed_week:9,
    calendar_status:'active',
    pause_reason:'',
    active:true
  };

  const academicWeeks = Array.from({length:14}, (_,i) => {
    const start = new Date('2026-06-28T00:00:00+06:00');
    start.setDate(start.getDate() + i * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const iso = d => d.toLocaleDateString('en-CA',{timeZone:'Asia/Dhaka'});
    return {id:`w${i+1}`, term_id:term.id, week_no:i+1, starts_on:iso(start), ends_on:iso(end)};
  });

  const courses = [
    {id:'c1', course_code:'BME 211', title:'Biomedical Instrumentation', term:'January 2026', course_type:'theory', batch:'Level 2 Term 1', section_a:'A', section_b:'B', status:'published', question_deadline:'2026-08-29', exam_date:'2026-09-05', final_gradesheet_deadline:'2026-09-20', active:true, notes:''},
    {id:'c2', course_code:'BME 303', title:'Biomaterials', term:'January 2026', course_type:'theory', batch:'Level 3 Term 1', section_a:'A', section_b:'B', status:'published', question_deadline:'2026-09-02', exam_date:'2026-09-10', final_gradesheet_deadline:'2026-09-25', active:true, notes:''},
    {id:'c3', course_code:'BME 310', title:'Biomedical Instrumentation Lab', term:'January 2026', course_type:'lab', batch:'Level 3 Term 1', section_a:'A', section_b:'B', status:'published', question_deadline:null, exam_date:null, final_gradesheet_deadline:'2026-09-28', active:true, notes:'Configured lab course with reports, quiz and viva.'},
    {id:'c4', course_code:'BME 404', title:'Medical Imaging Lab', term:'January 2026', course_type:'lab', batch:'Level 4 Term 1', section_a:'A', section_b:'B', status:'published', question_deadline:null, exam_date:null, final_gradesheet_deadline:'2026-09-30', active:true, notes:'Needs assessment setup review.'},
    {id:'c5', course_code:'BME 407', title:'Rehabilitation Engineering', term:'January 2026', course_type:'theory', batch:'Level 4 Term 1', section_a:'A', section_b:'B', status:'draft', question_deadline:'2026-09-07', exam_date:'2026-09-14', final_gradesheet_deadline:'2026-10-01', active:true, notes:''}
  ];

  const primaryAssignments = [
    {course_id:'c1', preparer_a:'f3', preparer_b:'f4', moderator_1:'f1', moderator_2:'f5', scrutinizer:'f6'},
    {course_id:'c2', preparer_a:'f6', preparer_b:'f3', moderator_1:'f2', moderator_2:'f5', scrutinizer:'f4'},
    {course_id:'c5', preparer_a:'f4', preparer_b:'f5', moderator_1:'f2', moderator_2:'f3', scrutinizer:'f6'}
  ];

  const courseFaculty = [
    {course_id:'c1', faculty_id:'f3', role:'course_teacher', section:'A'},
    {course_id:'c1', faculty_id:'f4', role:'course_teacher', section:'B'},
    {course_id:'c2', faculty_id:'f3', role:'course_teacher', section:'B'},
    {course_id:'c3', faculty_id:'f3', role:'lab_coordinator', section:'All'},
    {course_id:'c3', faculty_id:'f5', role:'lab_teacher', section:'A'},
    {course_id:'c4', faculty_id:'f3', role:'lab_teacher', section:'A'},
    {course_id:'c4', faculty_id:'f6', role:'lab_coordinator', section:'All'}
  ];

  const statuses = [
    {course_id:'c1', task_key:'question_prep_a', status:'completed', completed_at:'2026-08-23T10:00:00+06:00'},
    {course_id:'c1', task_key:'question_prep_b', status:'completed', completed_at:'2026-08-24T11:00:00+06:00'},
    {course_id:'c1', task_key:'moderation_1', status:'in_progress'},
    {course_id:'c2', task_key:'question_prep_a', status:'in_progress'},
    {course_id:'c2', task_key:'question_prep_b', status:'not_started'},
    {course_id:'c5', task_key:'question_prep_a', status:'completed'},
    {course_id:'c5', task_key:'question_prep_b', status:'completed'},
    {course_id:'c5', task_key:'moderation_1', status:'completed'},
    {course_id:'c5', task_key:'moderation_2', status:'completed'},
    {course_id:'c5', task_key:'examination_a', status:'in_progress'}
  ];

  const classTests = [
    {id:'ct1', course_id:'c1', term_id:term.id, title:'CT 01', section:'A', batch:'Level 2 Term 1', date:'2026-08-24', time:'10:00', syllabus:'Amplifiers and filters', responsible_faculty:'f3', status:'completed', notes:''},
    {id:'ct2', course_id:'c1', term_id:term.id, title:'CT 02', section:'B', batch:'Level 2 Term 1', date:'2026-09-03', time:'11:00', syllabus:'Sensors and bridges', responsible_faculty:'f4', status:'confirmed', notes:''},
    {id:'ct3', course_id:'c2', term_id:term.id, title:'CT 01', section:'B', batch:'Level 3 Term 1', date:'2026-09-03', time:'11:00', syllabus:'Polymer scaffolds', responsible_faculty:'f3', status:'confirmed', notes:'Same slot as another CT to demonstrate conflict detection.'},
    {id:'ct4', course_id:'c5', term_id:term.id, title:'CT 01', section:'A', batch:'Level 4 Term 1', date:'2026-09-08', time:'09:00', syllabus:'Assistive devices', responsible_faculty:'f4', status:'proposed', notes:''}
  ];

  const classTestHistory = [
    {id:'h1', class_test_id:'ct2', changed_by:'f3', old_date:'2026-09-01', new_date:'2026-09-03', old_time:'10:00', new_time:'11:00', reason:'Section request', created_at:'2026-08-25T16:00:00+06:00'}
  ];

  const labConfigs = [
    {id:'lc1', course_id:'c3', term_id:term.id, session_count:10, config_status:'configured', version:2, remarks:'Best 8 reports, all quizzes counted.'},
    {id:'lc2', course_id:'c4', term_id:term.id, session_count:8, config_status:'setup_required', version:1, remarks:'Assessment components pending admin confirmation.'}
  ];

  const labAssessmentTypes = [
    {id:'lat1', config_id:'lc1', course_id:'c3', name:'Lab Reports', marks:20, count:10, best_of:8, due_behavior:'after_session', responsible_faculty:'f3', remarks:''},
    {id:'lat2', config_id:'lc1', course_id:'c3', name:'Lab Quiz', marks:10, count:4, best_of:4, due_behavior:'scheduled', responsible_faculty:'f5', remarks:''},
    {id:'lat3', config_id:'lc1', course_id:'c3', name:'Lab Viva', marks:10, count:2, best_of:2, due_behavior:'scheduled', responsible_faculty:'f3', remarks:''},
    {id:'lat4', config_id:'lc1', course_id:'c3', name:'Final Lab Examination', marks:40, count:1, best_of:1, due_behavior:'scheduled', responsible_faculty:'f3', remarks:''}
  ];

  const labSessions = [
    {id:'ls1', course_id:'c3', term_id:term.id, session_no:7, title:'ECG Front-end', date:'2026-08-26', section:'A', group_label:'G1-G4', assigned_faculty:'f3', status:'conducted', report_required:true, report_deadline:'2026-09-02', notes:''},
    {id:'ls2', course_id:'c3', term_id:term.id, session_no:8, title:'Pulse Oximetry', date:'2026-09-02', section:'A', group_label:'G1-G4', assigned_faculty:'f3', status:'scheduled', report_required:true, report_deadline:'2026-09-09', notes:''},
    {id:'ls3', course_id:'c3', term_id:term.id, session_no:8, title:'Pulse Oximetry', date:'2026-09-04', section:'B', group_label:'G5-G8', assigned_faculty:'f5', status:'scheduled', report_required:true, report_deadline:'2026-09-11', notes:''},
    {id:'ls4', course_id:'c4', term_id:term.id, session_no:1, title:'Image Acquisition', date:'2026-09-06', section:'A', group_label:'All', assigned_faculty:'f3', status:'scheduled', report_required:false, report_deadline:null, notes:''}
  ];

  const labAssessmentItems = [
    {id:'lai1', course_id:'c3', assessment_type_id:'lat1', lab_session_id:'ls1', title:'Report 07', due_date:'2026-09-02', responsible_faculty:'f3', status:'submission_pending', marks:20},
    {id:'lai2', course_id:'c3', assessment_type_id:'lat2', lab_session_id:'ls2', title:'Quiz 03', due_date:'2026-09-02', responsible_faculty:'f5', status:'scheduled', marks:10},
    {id:'lai3', course_id:'c3', assessment_type_id:'lat3', lab_session_id:null, title:'Viva 01', due_date:'2026-09-10', responsible_faculty:'f3', status:'scheduled', marks:10},
    {id:'lai4', course_id:'c3', assessment_type_id:'lat4', lab_session_id:null, title:'Final Lab Examination', due_date:'2026-09-22', responsible_faculty:'f3', status:'scheduled', marks:40}
  ];

  const notifications = [
    {id:'n1', faculty_id:'f3', title:'CT 02 was rescheduled', body:'BME 211 CT 02 moved to 03 Sep at 11:00.', level:'info', related_type:'class_test', related_id:'ct2', created_at:'2026-08-25T16:01:00+06:00', read_at:null},
    {id:'n2', faculty_id:'f3', title:'Lab report deadline approaching', body:'BME 310 Report 07 is due on 02 Sep.', level:'warning', related_type:'lab_assessment', related_id:'lai1', created_at:'2026-08-26T09:00:00+06:00', read_at:null}
  ];

  return {faculty, term, academicWeeks, courses, primaryAssignments, courseFaculty, statuses, classTests, classTestHistory, labConfigs, labSessions, labAssessmentTypes, labAssessmentItems, notifications};
})();
