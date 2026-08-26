# BME ExamFlow v2
## Faculty-Centered Academic Activity, Assessment and Examination Management System

### 1. Product Vision

BME ExamFlow should become the **single operational dashboard for all academic responsibilities of BME faculty members during a term**.

The fundamental problem is not simply digitizing the departmental spreadsheet.

The problem is that the spreadsheet forces every faculty member to:

- open several sheets,
- scan many courses unrelated to them,
- remember which responsibilities belong to them,
- manually check dates,
- remember CT schedules,
- track several lab activities independently,
- interpret different lab assessment systems,
- repeatedly check whether another faculty member has completed a prerequisite task,
- and manually determine what needs attention next.

The application must reverse this model.

> **The system should know what each faculty member is responsible for and show them only what they need to know, while still preserving a department-wide overview.**

A faculty member should be able to open the application and immediately answer:

1. What do I need to do?
2. For which course?
3. By when?
4. What is waiting on someone else?
5. What CTs/labs/assessments are approaching?
6. What has already been completed?
7. What is overdue?
8. What changed recently?

---

# 2. Core Academic Model

Courses are divided into two fundamentally different types.

## 2.1 Theory Courses

By departmental convention:

**Odd-numbered BME courses → Theory**

Examples:

- BME 201
- BME 203
- BME 211
- BME 303
- BME 309
- BME 403
- BME 441
- BME 449

Theory courses use a relatively standardized workflow.

They include:

- Class Tests / CTs
- Question preparation
- Question submission
- Question moderation
- Examination
- Script examination
- Script scrutiny
- Gradesheet preparation
- Gradesheet scrutiny
- Final gradesheet submission

The existing ExamFlow theory workflow should therefore be retained and extended.

---

## 2.2 Laboratory Courses

By departmental convention:

**Even-numbered BME courses → Laboratory**

Examples:

- BME 206
- BME 210
- BME 304
- BME 310

Lab courses must **not** inherit the theory examination workflow.

Different lab courses may use completely different assessment systems.

One course may have:

- 8 reports
- 2 quizzes
- 1 viva

Another may have:

- 6 reports
- 2 lab tests
- daily assessments
- attendance

Another may have:

- project
- presentation
- viva
- final lab test

Therefore a fixed lab workflow would be wrong.

Lab courses need a **configurable assessment engine**.

---

# 3. Course Type Detection

When a course is created/imported:

1. Extract its numerical course number.
2. If odd → suggest **Theory**.
3. If even → suggest **Laboratory**.
4. Store `course_type` explicitly in the database.

Example:

`BME 211 → 211 → odd → Theory`

`BME 310 → 310 → even → Laboratory`

The administrator must still be allowed to override course type for exceptional courses.

The application must never repeatedly calculate behavior solely from parity after the course has been created. `course_type` becomes authoritative.

---

# 4. Faculty Roles

There should be three application permission levels.

## Faculty

Can:

- view department academic calendar,
- view relevant course information,
- view CT dates,
- view their own tasks,
- update tasks assigned to them,
- manage allowed portions of courses they teach.

## Course Coordinator / Assigned Course Teacher

Can additionally:

- configure their lab course,
- create/edit lab assessment components,
- define number of labs,
- schedule CTs where applicable,
- create activity deadlines,
- update assessment structure.

## Admin / HOD

Can:

- create/edit courses,
- assign faculty,
- edit any academic configuration,
- publish/unpublish courses,
- correct mistakes,
- manage term settings,
- view full department progress,
- override course configuration where necessary.

---

# 5. THEORY COURSE ENGINE

The existing theory workflow remains the foundation.

For every theory course maintain:

### Course Information

- Course code
- Course title
- Academic term
- Batch
- Section A
- Section B where applicable
- Assigned faculty
- Notes

### Examination Responsibilities

#### Question Preparation

- Question Preparer — Section A
- Status
- Question Preparer — Section B
- Status
- Question submission deadline

#### Question Moderation

- Moderator 01
- Status
- Moderator 02
- Status

#### Script Examination

- Examiner — Section A
- Status
- Examiner — Section B
- Status

#### Script Scrutiny

- Script Scrutinizer
- Status

#### Gradesheet Preparation

- Gradesheet Preparer
- Status

#### Gradesheet Scrutiny

- Gradesheet Scrutinizer
- Status

#### Final Submission

- Final gradesheet submission deadline to HOD
- Submission status
- Remarks/notes

---

# 6. Existing Theory Assignment Rules Must Remain

The spreadsheet-derived responsibility rules must continue to be enforced.

### Automatic relationships

- Examiner A = Question Preparer A
- Examiner B = Question Preparer B
- Gradesheet Preparer = Question Preparer A
- Gradesheet Scrutinizer = Script Scrutinizer

These should not be separately entered by the administrator.

They should be **derived automatically**.

### Conflict prevention

Hard errors:

- QP-A cannot equal QP-B.
- Moderator 01 cannot equal Moderator 02.
- Moderators cannot be either question preparer.
- Script scrutinizer cannot be either question preparer.

Warnings may still be used where spreadsheet practice permits overlapping secondary roles.

---

# 7. THEORY WORKFLOW DEPENDENCIES

The system should understand dependencies rather than simply displaying independent checkboxes.

```text
Question Preparation A ─┐
                        ├──→ Moderation ─→ Examination
Question Preparation B ─┘

Examination A ─┐
               ├──→ Script Scrutiny
Examination B ─┘

Script Scrutiny
      ↓
Gradesheet Preparation
      ↓
Gradesheet Scrutiny
      ↓
Final Submission
```

If a prerequisite has not been completed, later tasks may show:

**Waiting on: [Faculty Name]**

instead of simply:

**Not Started**

This is important because it tells a faculty member whether they personally need to act.

---

# 8. CLASS TEST / CT MODULE

CT dates must become a **first-class academic entity**.

They must not be treated as generic course deadlines.

Every theory course receives a dedicated:

# Class Tests

section.

---

## 8.1 CT Configuration

Course teachers/admin can define:

- Number of CTs
- CT number/name
- Section
- Date
- Start time if needed
- Batch
- Syllabus/topics
- Responsible teacher
- Status
- Notes

Example:

```text
BME 211 — Bioelectricity

CT 01
Section: A
Date: 03 September
Topic: Membrane Potential
Status: Scheduled

CT 02
Section: A
Date: 28 September
Status: Tentative
```

The system must support whatever CT count is actually used rather than hard-coding CT-1, CT-2 and CT-3.

---

# 9. CT DATE STATES

A CT date should have explicit state:

- Proposed
- Confirmed
- Completed
- Postponed
- Rescheduled
- Cancelled

This matters because real CT schedules change frequently.

A CT should therefore not simply overwrite its old date when rescheduled.

Example:

```text
Original:
CT-02 — 10 September

Changed:
CT-02 — 14 September

Reason:
Academic holiday
```

The system retains the history.

---

# 10. CT RESCHEDULING

Whenever a CT is rescheduled:

1. preserve original date,
2. store new date,
3. record who changed it,
4. store optional reason,
5. update all dashboards,
6. highlight the change to relevant faculty,
7. update the department calendar.

Display:

**CT-02 moved from Sep 10 → Sep 14**

rather than silently replacing the date.

---

# 11. CT CONFLICT DETECTION

The CT calendar should actively prevent accidental scheduling conflicts.

Before saving a CT:

Check:

- same batch,
- same section,
- same date,
- overlapping time where time is recorded.

If another CT already exists:

> ⚠ Batch 22 already has BME 303 CT-02 scheduled on this date.

Depending on departmental rules this can be:

- warning, or
- hard block.

Admin/HOD may override a warning with a recorded reason.

---

# 12. CT CALENDAR

Create a dedicated:

# CT Calendar

Views:

- Month
- Week
- Batch
- Course
- My Courses

CT calendar entries show:

```text
SEP 03
BME 211
CT-01
Batch 24

SEP 05
BME 303
CT-02
Batch 23
```

Faculty should no longer search a spreadsheet to see CT dates.

---

# 13. CTs ON PERSONAL DASHBOARD

Relevant CTs automatically appear in:

### Upcoming

```text
Tomorrow
BME 211 — CT-02
Section A
```

### This Week

```text
Sep 03 — BME 211 CT-02
Sep 05 — BME 303 CT-01
```

### Recently Changed

```text
BME 211 CT-02
Sep 08 → Sep 11
```

---

# 14. LAB COURSE CONFIGURATION WIZARD

This is the major new system.

When an assigned teacher opens an unconfigured laboratory course:

> **Configure BME 310**

> Every laboratory course uses a different assessment structure. Select the components used in this course.

Then show selectable items.

### Standard Components

- [ ] Lab Reports
- [ ] Lab Quiz
- [ ] Lab Viva
- [ ] Lab Test
- [ ] Daily/Lab Assessment
- [ ] Attendance
- [ ] Project
- [ ] Presentation
- [ ] Final Lab Examination
- [ ] Other

The teacher can select any combination.

---

# 15. NUMBER OF ITEMS

After selecting a component, immediately ask for quantity.

Example:

```text
✓ Lab Reports
Number: 8

✓ Lab Quiz
Number: 2

✓ Lab Viva
Number: 1

✓ Lab Test
Number: 2
```

From this configuration the system automatically creates:

```text
Report 01
Report 02
Report 03
...
Report 08

Quiz 01
Quiz 02

Viva 01

Lab Test 01
Lab Test 02
```

Nothing should require manually creating thirteen separate records.

---

# 16. ASSESSMENT COMPONENT SETTINGS

Each component may additionally contain:

- Component name
- Number of occurrences
- Marks per occurrence
- Total marks
- Required/optional
- Best N policy
- Drop lowest N policy
- Due-date behavior
- Section-specific/common
- Responsible teacher
- Remarks

Example:

```text
Lab Reports

Number of reports: 8
Marks/report: 5
Best reports counted: 6

Raw total = 40
Counted total = 30
```

The system performs the calculation automatically.

---

# 17. CUSTOM COMPONENTS

A course teacher must never be forced into the predefined list.

Provide:

**+ Add Custom Assessment**

Example:

```text
Component:
Design Challenge

Number:
2

Marks each:
10
```

This ensures the system remains usable even when a new course adopts a different assessment strategy.

---

# 18. NUMBER OF LABS

Every lab course should separately define:

**Number of laboratory sessions**

Example:

```text
BME 304
Number of labs: 10
```

The system generates:

```text
Lab 01
Lab 02
...
Lab 10
```

Each lab session can contain:

- Experiment/title
- Scheduled date
- Section/group
- Assigned teacher
- Status
- Report required?
- Report deadline
- Assessment attached?
- Notes

---

# 19. LINK ASSESSMENTS TO LABS

Assessments should optionally be linked to particular sessions.

Example:

```text
Lab 04
Image Filtering

Date:
Aug 26

Assessment:
Lab Report 04

Report Deadline:
Aug 31

Responsible Faculty:
Assigned teacher
```

Or:

```text
Lab 06

Assessment:
Daily Assessment 03
```

This creates one coherent workflow rather than separate disconnected lists.

---

# 20. LAB COURSE DASHBOARD

Opening BME 310 should show something like:

```text
BME 310
Machine Learning Laboratory

10 Labs

Progress
██████░░░░ 6 / 10 completed

Upcoming
Lab 07 — Sep 02
Report 06 due — Aug 30
Lab Test 01 — Sep 05

Assessments
Reports       5 / 8 completed
Quizzes       1 / 2 completed
Viva          0 / 1
Lab Tests     0 / 2
```

---

# 21. LAB ACTIVITY STATUS

Each generated lab activity can have:

- Not Started
- Scheduled
- In Progress
- Conducted
- Submission Pending
- Evaluation Pending
- Completed
- Cancelled

This is more appropriate than forcing everything into the theory examination statuses.

---

# 22. EDIT LAB CONFIGURATION ANYTIME

The teacher specifically needs the ability to modify the configuration.

Therefore:

**Edit Assessment Structure**

must always be available to authorized course teachers.

Examples:

- Reports: 8 → 7
- Quizzes: 2 → 3
- Add lab viva
- Remove presentation
- Change marks

However, editing must be intelligent.

If no marks/activity data exist:

> Apply immediately.

If existing records would be affected:

> ⚠ Changing Reports from 8 to 6 will affect Report 07 and Report 08, which already contain activity records.

Then require confirmation.

No academic records should silently disappear.

---

# 23. CONFIGURATION VERSION HISTORY

Every significant course-structure modification should be recorded.

Example:

```text
Aug 20
Reports changed 10 → 8
by Faculty A

Aug 24
Lab Quiz added
2 quizzes × 5 marks
by Faculty B
```

Admin can inspect this history.

---

# 24. PERSONAL FACULTY HOME PAGE

After login, the first screen must answer:

# What requires my attention?

Suggested structure:

## Needs Attention

```text
BME 211
Question preparation
Due in 2 days

BME 310
Lab Report 05 evaluation
Pending

BME 304
Lab Test 01
Tomorrow
```

## Upcoming CTs

Relevant CTs for the next 7–14 days.

## Upcoming Lab Activities

Relevant labs/tests/vivas/report deadlines.

## Waiting on Others

Example:

```text
BME 211 — Moderation
Waiting on question preparation

BME 303 — Gradesheet
Waiting on script scrutiny
```

## Recently Changed

- CT rescheduled
- deadline changed
- role reassigned
- lab activity modified

---

# 25. MY COURSES

Courses should be clearly separated visually.

## Theory

```text
BME 211
Bioelectricity
Theory
```

## Laboratory

```text
BME 210
Biomedical Engineering Laboratory
Lab
```

Do not present them as identical course cards.

Theory cards emphasize:

- CTs
- examination workflow
- responsibilities
- deadlines

Lab cards emphasize:

- laboratory sessions
- reports
- quizzes
- viva
- assessments
- tests

---

# 26. MY TASKS

Tasks from every system feed into one personal task engine.

Examples:

```text
TODAY

BME 310
Conduct Lab 05

BME 304
Evaluate Lab Assessment 03

BME 211
Submit CT-02 marks
```

Tomorrow:

```text
BME 303
Question submission deadline
```

This is the central productivity benefit of the application.

---

# 27. UNIVERSAL ACADEMIC EVENT ENGINE

Behind the UI, CTs, lab tests, vivas and deadlines should feed into one calendar/event system.

Event types include:

- CT
- Lab Session
- Lab Test
- Lab Quiz
- Lab Viva
- Report Deadline
- Assessment
- Question Submission
- Examination
- Gradesheet Deadline
- Other

This enables one unified departmental calendar without forcing all events to behave identically.

---

# 28. DEPARTMENT CALENDAR

Create a general calendar containing:

- CT dates
- lab tests
- lab viva
- important report deadlines where appropriate
- examination activities
- submission deadlines

Filters:

**Batch**

**Course**

**Faculty**

**Theory**

**Lab**

**CT**

**Assessment**

**Deadline**

This replaces searching dates across multiple spreadsheet tabs.

---

# 29. GENERAL DEPARTMENT DASHBOARD

A general dashboard should remain available.

It should show operational status without forcing faculty to inspect every record.

Example:

```text
THEORY COURSES
13 active

Question preparation
10 / 13 complete

Moderation
7 / 13 complete

LAB COURSES
8 active

Configured
7 / 8

CTs This Week
6

Overdue Activities
3
```

---

# 30. COURSE HEALTH

Each course receives an automatically calculated health status.

### On Track

No overdue item or unresolved problem.

### Attention

Deadline approaching or configuration incomplete.

### At Risk

Overdue task / missed assessment / unresolved dependency.

### Blocked

Cannot proceed because another required activity is incomplete.

This should be calculated rather than manually chosen.

---

# 31. NOTIFICATIONS

The application should generate useful notifications rather than constant noise.

Examples:

### Deadline approaching

> BME 211 question submission is due tomorrow.

### Dependency released

> BME 303 moderation is complete. Script examination can now proceed.

### CT changed

> BME 211 CT-02 was rescheduled from Sep 10 to Sep 13.

### Lab deadline

> BME 310 Report 04 submission is due tomorrow.

### Course configuration

> BME 304 assessment structure has been modified.

---

# 32. REMINDER POLICY

Recommended automatic reminders:

- 7 days before
- 3 days before
- 1 day before
- Due today
- Overdue

Avoid generating multiple reminders for completed items.

---

# 33. FACULTY WORKLOAD VIEW

The system should automatically calculate workload.

Example:

```text
Faculty A

Theory
BME 211 — QP-B
BME 303 — Moderator
BME 309 — Scrutinizer

Lab
BME 310 — Course Teacher
BME 304 — Lab 03, 04, 07

Upcoming Tasks: 6
```

Admin/HOD can use this during responsibility allocation.

---

# 34. SEARCH

Global search should find:

- faculty,
- course code,
- course title,
- assessment,
- CT,
- deadline.

Searching:

`BME 310`

should directly show the course rather than requiring menu navigation.

---

# 35. DATABASE REDESIGN

The current `courses + primary_assignments + task_statuses` structure is insufficient for v2.

Recommended conceptual model:

```text
academic_terms
faculty
profiles
courses
course_faculty
```

Theory:

```text
theory_assignments
theory_tasks
theory_task_deadlines
class_tests
class_test_history
```

Laboratory:

```text
lab_course_config
lab_sessions
lab_assessment_types
lab_assessment_items
lab_activity_assignments
```

Shared:

```text
academic_events
notifications
audit_logs
```

If student marks are later introduced:

```text
students
enrollments
assessment_marks
```

They should be separated from workflow metadata.

---

# 36. LAB ASSESSMENT DATA MODEL

Do **not** create database columns such as:

```text
quiz1
quiz2
quiz3
report1
report2
viva1
```

That would recreate spreadsheet rigidity.

Instead:

```text
lab_assessment_types

id
course_id
name
count
marks_each
counted_items
display_order
```

Example record:

```text
course: BME 310
name: Lab Report
count: 8
marks_each: 5
counted_items: 6
```

The application dynamically generates assessment items from this configuration.

That makes the system future-proof.

---

# 37. CT DATA MODEL

CTs also must not be stored as:

```text
ct1_date
ct2_date
ct3_date
```

Use records:

```text
class_tests

id
course_id
section
ct_number
title
scheduled_date
scheduled_time
status
syllabus
responsible_faculty
notes
```

This supports:

- any number of CTs,
- rescheduling,
- section differences,
- historical terms,
- future rule changes.

---

# 38. DATA VISIBILITY

The application contains departmental academic information, so visibility must be intentionally separated.

### All authenticated faculty may see

- course list,
- faculty responsibilities where departmentally appropriate,
- CT schedule,
- academic calendar,
- general workflow progress.

### Assigned course teachers may see/edit

- detailed lab configuration,
- their assigned activity information,
- course-specific internal details.

### Admin/HOD

Full access.

If student marks are later stored, those must **not automatically inherit department-wide visibility**.

Marks require stricter course-level RLS.

---

# 39. SECURITY

Retain the current security architecture:

- Supabase Auth
- institutional faculty accounts
- allowlist
- Row Level Security
- no real academic data embedded in GitHub Pages
- no service-role key in browser code
- audit logging

The frontend must never be considered the security boundary.

Database RLS remains authoritative.

---

# 40. AUDIT TRAIL

Record important changes such as:

```text
WHO
changed it

WHAT
was changed

OLD VALUE

NEW VALUE

WHEN
```

Especially:

- CT rescheduling
- course teacher changes
- lab assessment configuration changes
- deadline changes
- role assignments
- task completion reversal
- course publication

---

# 41. TERM ARCHITECTURE

The application must be term-based.

Example:

```text
Jan 2026
Jul 2026
Jan 2027
```

When a new term starts:

- archive previous term,
- preserve historical data,
- create/import new courses,
- create new assignments,
- create new CT schedule,
- configure new labs.

Historical terms remain read-only unless reopened by admin.

---

# 42. SPREADSHEET IMPORT

Spreadsheet import should remain available, but the spreadsheet should become an **input source rather than the operating interface**.

Import workflow:

```text
Upload Spreadsheet
      ↓
Parse Courses
      ↓
Detect Theory/Lab
      ↓
Parse Faculty Assignments
      ↓
Parse Available Dates
      ↓
Validate Conflicts
      ↓
Show Import Preview
      ↓
Admin Confirms
      ↓
Publish
```

Never immediately write imported rows without preview.

---

# 43. IMPORT VALIDATION REPORT

After import show:

```text
13 Theory Courses
8 Lab Courses
14 Faculty

2 missing assignments
1 duplicate responsibility conflict
3 missing dates
1 unknown faculty name
```

Then allow admin to fix problems before publication.

---

# 44. COURSE SETUP STATUS

Each course should indicate whether setup is complete.

Theory:

```text
✓ Faculty assigned
✓ Responsibilities assigned
✓ CT configuration
✓ Deadlines configured
✓ Published
```

Lab:

```text
✓ Course teachers assigned
✓ Number of labs configured
✓ Assessment types configured
✓ Assessment counts configured
✓ Dates configured
✓ Published
```

An incompletely configured lab course should clearly show:

> **Setup Required**

---

# 45. ADMIN SETUP CENTRE

Instead of making administrators hunt through courses, create:

# Setup Centre

Example:

```text
Courses requiring attention

BME 210
Lab assessment structure not configured

BME 304
Lab dates incomplete

BME 211
CT schedule incomplete

BME 403
Question deadline missing
```

---

# 46. MOBILE BEHAVIOR

Because faculty will often check the system quickly from phones:

Mobile home page should prioritize:

1. Needs Attention
2. Today
3. Upcoming
4. My Courses
5. CT Calendar

Never present a spreadsheet-like 20-column table on mobile.

---

# 47. DESKTOP BEHAVIOR

Desktop may provide richer department views:

- kanban workflow,
- calendar,
- faculty workload,
- course progress table,
- filters,
- administration.

The existing visual identity should remain:

- warm paper background,
- navy typography,
- teal accent,
- rounded cards,
- subtle grid,
- restrained shadows,
- clear typography.

Do not turn the system into a generic corporate dashboard.

---

# 48. CRITICAL DESIGN PRINCIPLE

The application should never ask:

> “Which spreadsheet cell do you want to update?”

It should ask things in academic language:

> “When is CT-02?”

> “How many lab reports will this course have?”

> “Has Script Scrutiny been completed?”

> “Who is conducting Lab 06?”

The software should understand the department's workflow.

---

# 49. NON-NEGOTIABLE AUTOMATIONS

The finished system must automatically:

1. Determine Theory/Lab course type.
2. Generate personalized faculty responsibilities.
3. Derive theory roles where relationships are fixed.
4. Prevent invalid responsibility combinations.
5. Track theory workflow dependencies.
6. Manage CTs as individual scheduled events.
7. Detect CT scheduling conflicts.
8. Preserve CT rescheduling history.
9. Ask each lab course teacher to configure assessment components.
10. Allow arbitrary assessment structures.
11. Generate assessment instances from counts.
12. Generate laboratory sessions from lab count.
13. Link reports/tests/quizzes/vivas to labs.
14. Allow lab configuration editing.
15. Protect existing data when configuration changes.
16. Calculate deadlines and overdue status.
17. Populate faculty personal feeds automatically.
18. Populate department calendar automatically.
19. Generate relevant reminders.
20. Keep complete audit history.
21. Archive terms without deleting history.
22. Keep sensitive academic data protected by database-level RLS.

---

# 50. TARGET USER EXPERIENCE

A faculty member should not need instructions to use ExamFlow.

They sign in and see:

```text
Good morning.

3 items need your attention.

TODAY
BME 310 — Lab 06
BME 211 — CT-02

DUE SOON
BME 211 — Question submission
2 days

WAITING
BME 303 — Gradesheet
Waiting for Script Scrutiny
```

Selecting **BME 310**:

```text
10 Labs
6 Completed

Reports      5/8
Quizzes      1/2
Lab Tests    0/2
Viva         0/1
```

Selecting **BME 211**:

```text
CTs

CT-01 ✓
CT-02 Sep 03
CT-03 Not scheduled

Examination Workflow

Question Prep A     ✓
Question Prep B     In Progress
Moderation          Waiting
Script Examination  Locked
Script Scrutiny     Locked
Gradesheet          Locked
```

That is the desired level of automation.

---

# 51. DEFINITION OF SUCCESS

BME ExamFlow v2 succeeds when:

> **A faculty member no longer needs to open the departmental activity-tracking spreadsheet during normal day-to-day academic work.**

The spreadsheet may remain useful for:

- initial import,
- backup,
- export,
- administrative reporting.

But the operational workflow should occur entirely inside ExamFlow.

The application should tell every faculty member:

**what they have to do, for which course, at what time, what is pending, what has changed, and what comes next.**

That is the actual product.