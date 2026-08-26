# Academic Week Progress Tracker

A persistent **Term Week Tracker** should appear prominently at the top of the application dashboard.

Its purpose is to immediately show faculty:

- how far the current term has progressed,
- which academic week has most recently been completed,
- how many teaching weeks remain,
- and whether the university academic calendar has been paused or adjusted.

---

## 1. Configurable Number of Academic Weeks

Each academic term must have an administrator-configurable number of teaching weeks.

Example:

```text
Term: January 2026

Total Teaching Weeks: 14
```

The system should support values such as:

- 13 weeks
- 14 weeks
- or another number if required in a future term.

The number must **not be hard-coded**.

---

# 2. Week Progress Bar

At the very top of the main dashboard, display:

```text
ACADEMIC TERM PROGRESS

1   2   3   4   5   6   7   8   9   10   11   12   13   14
```

Each week should appear as a compact numbered block/circle.

For the current situation, where **Week 9 has just ended**, display:

```text
● ● ● ● ● ● ● ● ● ○ ○ ○ ○ ○
1 2 3 4 5 6 7 8 9 10 11 12 13 14
```

Color logic:

### Red — Previous Weeks

Weeks already passed before the latest completed academic week.

Example:

```text
Weeks 1–8 → Red
```

These indicate:

> Previous academic weeks

---

### Green — Latest Completed / Current Academic Position

The most recently completed academic week should be highlighted prominently.

Example:

```text
Week 9 → Green
```

This gives faculty an immediate visual reference:

> **The department has completed Week 9.**

---

### Grey — Future Weeks

Weeks that have not yet been reached.

Example:

```text
Weeks 10–14 → Grey
```

These represent remaining academic weeks.

---

# 3. Example Display

Current state:

```text
Term Progress                               Week 9 of 14 completed

[1] [2] [3] [4] [5] [6] [7] [8] [9] [10] [11] [12] [13] [14]
 🔴  🔴  🔴  🔴  🔴  🔴  🔴  🔴  🟢   ⚪   ⚪   ⚪   ⚪   ⚪

9 / 14 teaching weeks completed
5 teaching weeks remaining
```

The visual implementation should remain cleaner than emoji; the colors above only illustrate the intended states.

---

# 4. Admin-Controlled Academic Week

The application must **not automatically assume that one calendar week equals one academic week**.

The administrator should control the department's current academic week.

Admin settings:

```text
Academic Term
January 2026

Total Teaching Weeks
14

Current Academic Position
Week 9 completed
```

The administrator may change this manually.

---

# 5. Why Manual Control Is Necessary

A university term may contain interruptions such as:

- university holidays,
- government holidays,
- vacation,
- emergency closure,
- examination breaks,
- departmental suspension of classes,
- unexpected university closure,
- academic-calendar adjustments.

For example:

```text
Calendar week passes
        ↓
University closed for 7 days
        ↓
Academic Week DOES NOT advance
```

Therefore:

**Calendar time and Academic Week must be separate concepts.**

---

# 6. Pause Academic Week Progression

Admin should have:

### Pause Academic Calendar

Example:

```text
Academic Week: 9

Status:
PAUSED

Reason:
University Vacation
```

While paused:

- Week 9 remains the active academic position.
- The week tracker does not advance.
- No automatic Week 10 transition occurs.
- Date-based tasks and CT dates remain individually valid.

Display:

```text
Week 9 of 14

Academic calendar paused
University Vacation
```

---

# 7. Resume Academic Calendar

When classes resume:

Admin clicks:

**Resume Academic Calendar**

The system continues from the same academic position.

Example:

```text
Before vacation:
Week 9 completed

Vacation:
Academic progression paused

Classes resume:
Week 10 begins
```

---

# 8. Optional Week Start and End Dates

Admin should optionally be able to define actual academic-week ranges.

Example:

| Academic Week | Start | End |
|---|---|---|
| Week 8 | Aug 9 | Aug 15 |
| Week 9 | Aug 16 | Aug 22 |
| Week 10 | Aug 30 | Sep 5 |

Notice that a university closure could create a gap between Week 9 and Week 10.

This is preferable to assuming consecutive seven-day periods.

---

# 9. Week State Model

Each academic week should conceptually support:

```text
Past
Latest Completed
Current / Ongoing
Future
Paused
```

For the requested default display:

```text
Past            → Red
Latest Completed → Green
Future          → Grey
```

If the department later wants to distinguish an **ongoing** week from the most recently completed week, a separate visual state can be added without changing the underlying data structure.

---

# 10. Dashboard Placement

This component should be placed **above the faculty task feed**.

Recommended hierarchy:

```text
BME ExamFlow
January 2026

TERM PROGRESS
Week 9 of 14 completed

1  2  3  4  5  6  7  8  [9]  10  11  12  13  14
───────────────────────────────────────────────────

Needs Your Attention

Upcoming CTs

Upcoming Labs

Waiting on Others
```

A faculty member should see the academic position before scrolling.

---

# 11. Clicking a Week

The week indicator can also become an extremely useful navigation system.

Selecting:

**Week 10**

could show:

```text
WEEK 10

CTs
• BME 211 — CT 02
• BME 303 — CT 01

Labs
• BME 304 — Lab 07
• BME 310 — Lab 06

Deadlines
• BME 403 — Question Submission
• BME 310 — Report 05
```

This turns the progress indicator into a lightweight **academic-week planner**.

---

# 12. "This Week" Integration

The application should use the admin-defined academic week throughout the UI.

Instead of merely saying:

```text
This Week
```

the dashboard can display:

```text
Academic Week 10
```

and show:

- CTs
- laboratories
- report deadlines
- assessments
- theory responsibilities
- departmental deadlines

belonging to that academic period.

---

# 13. Admin Term Controls

Under:

**Admin → Academic Term**

provide:

```text
Term Name
January 2026

Number of Teaching Weeks
14

Latest Completed Week
9

Academic Calendar
Active / Paused

Pause Reason
Optional

Week Start/End Dates
Optional
```

Buttons:

```text
Previous Week
Advance Week
Pause Calendar
Resume Calendar
```

The admin should therefore be able to correct the academic position immediately if the university calendar changes.

---

# 14. Safety Against Accidental Changes

Changing the current academic week affects the whole department dashboard.

Therefore an admin action such as:

```text
Week 9 → Week 10
```

should show a confirmation:

> Advance the department from Academic Week 9 to Academic Week 10?

The action should also enter the audit log.

Example:

```text
27 Aug 2026
Academic position changed
Week 8 → Week 9
Changed by: Admin
```

---

# 15. Database Model

Do not store this simply as:

```text
current_week = 9
```

inside frontend configuration.

It belongs in the protected backend.

Recommended structure:

```text
academic_terms

id
name
start_date
end_date
total_teaching_weeks
latest_completed_week
calendar_status
pause_reason
active
```

Optional detailed table:

```text
academic_weeks

id
term_id
week_number
start_date
end_date
status
notes
```

This allows irregular academic calendars.

---

# 16. Integration With Other ExamFlow Modules

The academic-week tracker should connect with:

### CT Calendar

Show:

> CT scheduled in Week 11

### Laboratory Activities

Show:

> Lab Test 01 — Week 10

### Theory Workflow

Show:

> Question Submission — Week 12

### Faculty Feed

Show:

> 4 responsibilities remaining this academic week

### Department Dashboard

Show:

```text
Week 9 / 14 completed

64% of teaching term completed
```

---

# 17. Core UX Principle

Faculty should be able to open ExamFlow and understand the term position in **one glance**.

For the present state the top of the application should communicate:

```text
JANUARY 2026 TERM

Week 9 of 14 completed
5 teaching weeks remaining

1   2   3   4   5   6   7   8   9   10   11   12   13   14
RED RED RED RED RED RED RED RED GREEN GREY GREY GREY GREY GREY
```

The academic-week position remains under administrative control so that university closure or calendar disruption never causes the software to become out of sync with the actual semester.

This should be treated as a **core navigation and term-status feature**, not merely a decorative countdown.