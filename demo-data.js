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
    {id:'c1', course_code:'BME 211', title:'Bioelectricity', term:'January 2026', course_type:'theory', sessional_subtype:null, contact_hours:3, batch:'Level 2 Term 1', section_a:'X', section_b:null, status:'published', question_deadline:'2026-08-29', exam_date:'2026-09-05', final_gradesheet_deadline:'2026-09-20', active:true, notes:''},
    {id:'c2', course_code:'BME 311', title:'Biomaterials', term:'January 2026', course_type:'theory', sessional_subtype:null, contact_hours:3, batch:'Level 3 Term 1', section_a:'X', section_b:null, status:'published', question_deadline:'2026-09-02', exam_date:'2026-09-10', final_gradesheet_deadline:'2026-09-25', active:true, notes:''},
    {id:'c3', course_code:'BME 310', title:'Communication Protocol for Biomedical Instruments Sessional', term:'January 2026', course_type:'sessional', sessional_subtype:'LABORATORY', contact_hours:3, batch:'Level 3 Term 1', section_a:'A1', section_b:'A2', status:'published', question_deadline:null, exam_date:null, final_gradesheet_deadline:'2026-09-28', active:true, notes:'Configured sessional course with reports, quiz and viva.'},
    {id:'c4', course_code:'BME 404', title:'Medical Imaging Sessional', term:'January 2026', course_type:'sessional', sessional_subtype:'LABORATORY', contact_hours:3, batch:'Level 4 Term 1', section_a:'A1', section_b:'A2', status:'published', question_deadline:null, exam_date:null, final_gradesheet_deadline:'2026-09-30', active:true, notes:'Needs assessment setup review.'},
    {id:'c5', course_code:'BME 407', title:'Rehabilitation Engineering', term:'January 2026', course_type:'theory', sessional_subtype:null, contact_hours:3, batch:'Level 4 Term 1', section_a:'X', section_b:null, status:'draft', question_deadline:'2026-09-07', exam_date:'2026-09-14', final_gradesheet_deadline:'2026-10-01', active:true, notes:''},
    {id:'c6', course_code:'BME 400', title:'Thesis', term:'January 2026', course_type:'sessional', sessional_subtype:'THESIS', contact_hours:3, batch:'Level 4 Term 2', section_a:'X', section_b:null, status:'published', question_deadline:null, exam_date:null, final_gradesheet_deadline:'2026-10-05', active:true, notes:'Sessional course that is not a conventional laboratory.'}
  ];

  const termMilestones = [
    {id:'tm1', term_id:term.id, milestone_type:'COURSE_OUTLINE_SHARING', milestone_date:'2026-06-27', status:'completed', notes:'Shared deadline from workbook merged cells.'},
    {id:'tm2', term_id:term.id, milestone_type:'QUESTION_SUBMISSION_DEADLINE', milestone_date:'2026-08-30', status:'scheduled', notes:'Global theory question submission deadline.'},
    {id:'tm3', term_id:term.id, milestone_type:'FEEDBACK_DEADLINE', milestone_date:'2026-09-28', status:'scheduled', notes:'Student feedback collection deadline.'},
    {id:'tm4', term_id:term.id, milestone_type:'CAR_DEADLINE', milestone_date:'2026-10-02', status:'scheduled', notes:'Course File / CAR deadline.'},
    {id:'tm5', term_id:term.id, milestone_type:'SESSIONAL_GRADESHEET_DEADLINE', milestone_date:'2026-10-05', status:'scheduled', notes:'Global sessional gradesheet deadline.'}
  ];

  const courseSections = [
    {id:'sec1', course_id:'c1', section_code:'X'},
    {id:'sec2', course_id:'c2', section_code:'X'},
    {id:'sec3', course_id:'c3', section_code:'A1'},
    {id:'sec4', course_id:'c3', section_code:'A2'},
    {id:'sec5', course_id:'c4', section_code:'A1'},
    {id:'sec6', course_id:'c4', section_code:'A2'},
    {id:'sec7', course_id:'c5', section_code:'X'},
    {id:'sec8', course_id:'c6', section_code:'X'}
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
    {course_id:'c3', faculty_id:'f3', role:'sessional_coordinator', section:'Entire Course', display_order:1},
    {course_id:'c3', faculty_id:'f5', role:'course_teacher', section:'A1', display_order:2},
    {course_id:'c3', faculty_id:'f4', role:'course_teacher', section:'A2', display_order:3},
    {course_id:'c4', faculty_id:'f3', role:'course_teacher', section:'A1', display_order:1},
    {course_id:'c4', faculty_id:'f6', role:'sessional_coordinator', section:'Entire Course', display_order:2},
    {course_id:'c6', faculty_id:'f3', role:'thesis_supervisor', section:'X', display_order:1}
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
    {id:'ct1', course_id:'c1', term_id:term.id, ct_number:1, title:'CT 01', section:'X', batch:'Level 2 Term 1', scheduled_date:'2026-08-24', scheduled_time:'10:00', syllabus:'Amplifiers and filters', responsible_faculty:'f3', status:'marks_published', notes:''},
    {id:'ct2', course_id:'c1', term_id:term.id, ct_number:2, title:'CT 02', section:'X', batch:'Level 2 Term 1', scheduled_date:'2026-09-03', scheduled_time:'11:00', syllabus:'Sensors and bridges', responsible_faculty:'f4', status:'scheduled', notes:''},
    {id:'ct3', course_id:'c2', term_id:term.id, ct_number:2, title:'CT 02', section:'X', batch:'Level 3 Term 1', scheduled_date:'2026-08-24', scheduled_time:'11:00', syllabus:'Polymer scaffolds', responsible_faculty:'f3', status:'scripts_under_examination', notes:''},
    {id:'ct4', course_id:'c5', term_id:term.id, ct_number:1, title:'CT 01', section:'X', batch:'Level 4 Term 1', scheduled_date:'2026-09-08', scheduled_time:'09:00', syllabus:'Assistive devices', responsible_faculty:'f4', status:'scheduled', notes:''},
    {id:'ct5', course_id:'c2', term_id:term.id, ct_number:3, title:'CT 03', section:'X', batch:'Level 3 Term 1', scheduled_date:null, scheduled_time:null, syllabus:'Bioceramics', responsible_faculty:'f3', status:'scheduled', notes:'Migration warning demo: status exists but date is empty.'}
  ];

  const classTestHistory = [
    {id:'h1', class_test_id:'ct2', changed_by:'f3', old_date:'2026-09-01', new_date:'2026-09-03', old_time:'10:00', new_time:'11:00', reason:'Section request', created_at:'2026-08-25T16:00:00+06:00'}
  ];

  const courseOutlines = [
    {course_id:'c1', term_id:term.id, status:'shared_with_students', due_date:null, responsible_faculty:'f3', notes:''},
    {course_id:'c2', term_id:term.id, status:'prepared', due_date:null, responsible_faculty:'f3', notes:'Prepared but not shared with students.'},
    {course_id:'c3', term_id:term.id, status:'shared_with_students', due_date:null, responsible_faculty:'f3', notes:''},
    {course_id:'c4', term_id:term.id, status:'under_preparation', due_date:null, responsible_faculty:'f3', notes:''},
    {course_id:'c5', term_id:term.id, status:'not_started', due_date:null, responsible_faculty:'f4', notes:''},
    {course_id:'c6', term_id:term.id, status:'shared_with_students', due_date:null, responsible_faculty:'f3', notes:''}
  ];

  const feedbackStatuses = [
    {course_id:'c1', term_id:term.id, status:'not_started', deadline:null, responsible_faculty:'f3', notes:'Feedback collection starts near the end of term.'},
    {course_id:'c3', term_id:term.id, status:'in_progress', deadline:null, responsible_faculty:'f3', notes:'A1 responses collected; A2 pending.'},
    {course_id:'c6', term_id:term.id, status:'not_started', deadline:null, responsible_faculty:'f3', notes:''}
  ];

  const courseFileStatuses = [
    {course_id:'c1', term_id:term.id, status:'not_started', deadline:null, responsible_faculty:'f3', notes:'Question, moderation, and gradesheet records pending.'},
    {course_id:'c3', term_id:term.id, status:'in_progress', deadline:null, responsible_faculty:'f3', notes:'Assessment evidence being collected.'},
    {course_id:'c6', term_id:term.id, status:'not_started', deadline:null, responsible_faculty:'f3', notes:'Thesis archive pending.'}
  ];

  const sessionalConfigs = [
    {id:'lc1', course_id:'c3', term_id:term.id, session_count:10, config_status:'configured', version:2, remarks:'Best 8 reports, all quizzes counted.'},
    {id:'lc2', course_id:'c4', term_id:term.id, session_count:8, config_status:'setup_required', version:1, remarks:'Assessment components pending admin confirmation.'},
    {id:'lc3', course_id:'c6', term_id:term.id, session_count:0, config_status:'configured', version:1, remarks:'Thesis milestones only.'}
  ];

  const assessmentComponents = [
    {id:'lat1', config_id:'lc1', course_id:'c3', name:'Lab Report', quantity:10, marks_each:20, counted_quantity:8, scope:'Entire Course', due_behavior:'after_session', display_order:1, responsible_faculty:'f3', remarks:''},
    {id:'lat2', config_id:'lc1', course_id:'c3', name:'Continuous Assessment Quiz', quantity:4, marks_each:10, counted_quantity:4, scope:'Entire Course', due_behavior:'scheduled', display_order:2, responsible_faculty:'f5', remarks:''},
    {id:'lat3', config_id:'lc1', course_id:'c3', name:'Continuous Assessment Viva', quantity:2, marks_each:10, counted_quantity:2, scope:'A1', due_behavior:'scheduled', display_order:3, responsible_faculty:'f3', remarks:''},
    {id:'lat4', config_id:'lc1', course_id:'c3', name:'Final Viva', quantity:1, marks_each:40, counted_quantity:1, scope:'Entire Course', due_behavior:'scheduled', display_order:4, responsible_faculty:'f3', remarks:''},
    {id:'lat5', config_id:'lc3', course_id:'c6', name:'Final Report', quantity:1, marks_each:100, counted_quantity:1, scope:'X', due_behavior:'scheduled', display_order:1, responsible_faculty:'f3', remarks:''}
  ];

  const sessionalSessions = [
    {id:'ls1', course_id:'c3', term_id:term.id, session_no:7, title:'ECG Front-end', date:'2026-08-26', section:'A', group_label:'G1-G4', assigned_faculty:'f3', status:'conducted', report_required:true, report_deadline:'2026-09-02', notes:''},
    {id:'ls2', course_id:'c3', term_id:term.id, session_no:8, title:'Pulse Oximetry', date:'2026-09-02', section:'A1', group_label:'G1-G4', assigned_faculty:'f3', status:'scheduled', report_required:true, report_deadline:'2026-09-09', notes:''},
    {id:'ls3', course_id:'c3', term_id:term.id, session_no:8, title:'Pulse Oximetry', date:'2026-09-04', section:'A2', group_label:'G5-G8', assigned_faculty:'f5', status:'scheduled', report_required:true, report_deadline:'2026-09-11', notes:''},
    {id:'ls4', course_id:'c4', term_id:term.id, session_no:1, title:'Image Acquisition', date:'2026-09-06', section:'A1', group_label:'All', assigned_faculty:'f3', status:'scheduled', report_required:false, report_deadline:null, notes:''}
  ];

  const assessmentInstances = [
    {id:'lai1', course_id:'c3', component_id:'lat1', sessional_session_id:'ls1', sequence_number:7, title:'Lab Report 07', due_date:'2026-09-02', responsible_faculty:'f3', status:'submission_pending', marks_each:20},
    {id:'lai2', course_id:'c3', component_id:'lat2', sessional_session_id:'ls2', sequence_number:3, title:'Continuous Assessment Quiz 03', scheduled_date:'2026-09-02', responsible_faculty:'f5', status:'evaluation_taken', marks_each:10},
    {id:'lai3', course_id:'c3', component_id:'lat3', sessional_session_id:null, sequence_number:1, title:'Continuous Assessment Viva 01', scheduled_date:'2026-09-10', responsible_faculty:'f3', status:'scheduled', marks_each:10},
    {id:'lai4', course_id:'c3', component_id:'lat4', sessional_session_id:null, sequence_number:1, title:'Final Viva', scheduled_date:'2026-09-22', responsible_faculty:'f3', status:'scheduled', marks_each:40},
    {id:'lai5', course_id:'c4', component_id:null, sessional_session_id:null, sequence_number:1, title:'Lab Test 01', scheduled_date:null, responsible_faculty:'f3', status:'marking_complete', marks_each:20},
    {id:'lai6', course_id:'c6', component_id:'lat5', sessional_session_id:null, sequence_number:1, title:'Final Report', due_date:'2026-10-01', responsible_faculty:'f3', status:'scheduled', marks_each:100}
  ];

  const sessionalGradeAssignments = [
    {course_id:'c3', preparer:'f3', scrutinizer:'f5'},
    {course_id:'c4', preparer:'f6', scrutinizer:'f3'},
    {course_id:'c6', preparer:'f3', scrutinizer:'f1'}
  ];

  const sessionalGradeStatuses = [
    {course_id:'c3', task_key:'sessional_gradesheet_prep', status:'in_progress', due_date:'2026-10-05', responsible_faculty:'f3'},
    {course_id:'c6', task_key:'sessional_gradesheet_prep', status:'not_started', due_date:'2026-10-05', responsible_faculty:'f3'}
  ];

  const labConfigs = sessionalConfigs;
  const labAssessmentTypes = assessmentComponents.map(x => ({...x, marks:x.marks_each, count:x.quantity, best_of:x.counted_quantity}));
  const labSessions = sessionalSessions;
  const labAssessmentItems = assessmentInstances.map(x => ({...x, assessment_type_id:x.component_id, lab_session_id:x.sessional_session_id, marks:x.marks_each}));

  const notifications = [
    {id:'n1', faculty_id:'f3', title:'CT 02 was rescheduled', body:'BME 211 CT 02 moved to 03 Sep at 11:00.', level:'info', related_type:'class_test', related_id:'ct2', created_at:'2026-08-25T16:01:00+06:00', read_at:null},
    {id:'n2', faculty_id:'f3', title:'Sessional report deadline approaching', body:'BME 310 Lab Report 07 is due on 02 Sep.', level:'warning', related_type:'assessment_instance', related_id:'lai1', created_at:'2026-08-26T09:00:00+06:00', read_at:null}
  ];

  return {faculty, term, academicWeeks, termMilestones, courseSections, courses, primaryAssignments, courseFaculty, statuses, classTests, classTestHistory, courseOutlines, feedbackStatuses, courseFileStatuses, sessionalConfigs, sessionalSessions, assessmentComponents, assessmentInstances, sessionalGradeAssignments, sessionalGradeStatuses, labConfigs, labSessions, labAssessmentTypes, labAssessmentItems, notifications};
})();
