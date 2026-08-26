# Diagnosis of the current repository

## Why CT looks missing

`app.js` already contains a **CT Calendar** route and reads the `class_tests` table. The problem is that the repository's existing `scripts/generate_seed.py` only parses the theory-grade CSV and never imports `04_Class Test Tracker`. Therefore a correctly rendered CT module can still show zero records.

## Why sessional looks missing

The frontend already has a sessional detail renderer and the schema contains normalized sessional tables (`sessional_course_configs`, `assessment_components`, `assessment_instances`, etc.). However:

- the old seed generator never imports `02_Sessional Course List` or `05_Sessional Assessment Tracker`;
- the current sessional detail is essentially read-only;
- no normal UI handler exists to add/edit sessional components or persist their statuses.

`tracker-admin.js` supplies that missing writable layer while leaving the working theory engine intact.

## Why changes may not be reaching Supabase

The current production `app.js` contains a hard-coded Gmail test shortcut. When that address is used, `signIn()` calls `loadDemo()` instead of Supabase authentication. In demo mode, updates are intentionally in-memory only.

The patch removes that shortcut. The only demo entry point should be explicit `?demo=1`.

There is also an infrastructure issue: editing `supabase/schema.sql` in GitHub does **not** migrate an already-created Supabase project. You must run the new schema/migration in Supabase once.

## Backend bug discovered

The existing `validate_course_publish()` trigger requires the five theory roles for **every** course. This blocks proper sessional publishing. The migration changes that requirement to theory courses only.

## Workbook areas now covered by the full seed

- Theory Course List
- Sessional Course List + A1/A2/X sections
- Course Outline Tracker
- Class Test Tracker (CT01–CT05 import, dynamic thereafter)
- Sessional Assessment Tracker (25 flexible triplets)
- Feedback Tracker
- Sessional Grade Tracker
- Theory Grade Tracker
- CF/CAR Tracker
- normalization of course-code whitespace, assessment-label typos, Excel dates, and textual dates
- import warnings for incomplete sessional records rather than silently deleting them
