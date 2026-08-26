# BME ExamFlow

A secure, faculty-centered academic examination workflow app designed from the department responsibility spreadsheet and styled after the visual language of the BME 4-1 Timetable Builder.

## What is already implemented

- Secure production lock: the public GitHub Pages bundle contains **no real faculty/course assignment data**.
- Supabase authentication + allowlist authorization.
- PostgreSQL Row Level Security (RLS): no anonymous read policies exist.
- Personalized faculty feed, My Tasks, My Courses, course workflow detail.
- Academic Week Progress Tracker with admin-controlled total weeks, latest completed week, pause/resume state, and week planner.
- Explicit theory/lab course handling. Odd/even BME code inference is only a fallback; `course_type` is the authoritative value.
- Class Test module with CT status, responsible faculty, schedule conflict checks, and reschedule history display.
- Lab course module with configurable sessions, assessment components, assessment items, and lab-specific statuses.
- Department calendar, setup center, notifications, and workload view covering theory, CT, and lab activities.
- General department progress dashboard and course health.
- Five primary assignments only: QP-A, QP-B, Moderator 01, Moderator 02, Script Scrutinizer.
- Derived roles are automatic: Examiner A = QP-A; Examiner B = QP-B; Gradesheet Preparer = QP-A; Gradesheet Scrutinizer = Script Scrutinizer.
- Conflict checks preserved from the source spreadsheet and enforced again in PostgreSQL constraints.
- Dependency-aware completion checks enforced in both UI and database trigger.
- Admin assignment editor, hard-error vs warning separation, workload warning, deadline-order validation.
- Audit logging for course, assignment, and task-status changes.
- GitHub Pages deployment workflow.
- Responsive desktop/mobile design.

## Theme

The UI intentionally follows the supplied timetable-builder theme: warm paper background, subtle dotted grid, navy ink, teal accent, Fraunces headings, Inter body type, JetBrains Mono metadata, rounded white cards, thin neutral borders, and restrained shadows.

## Security model

GitHub Pages hosts only the static app shell. Protected data lives in Supabase. Authentication is necessary but **not sufficient**: a user must also have an active row in `allowed_users`, which is converted into an active `profiles` row on signup. RLS requires an active profile before data can be read.

The Supabase anon key is a public client credential; it is **not** treated as an authorization secret. RLS is the security boundary. Never expose a Supabase service-role key in GitHub Pages, JavaScript, or repository variables.

## Testing shortcut

For smoother UI testing, the sign-in form accepts:

```text
sadmansakib715@gmail.com
```

with any non-empty password. This opens demo admin mode only. It does not authenticate against Supabase and it does not read or write protected academic records.

## 1. Preview safely

You can preview the interface with anonymous fake data:

```bash
python -m http.server 8080
```

Open:

```text
http://localhost:8080/?demo=1
```

The demo contains no real faculty assignment data.

## 2. Create Supabase backend

Create a new Supabase project, then run:

1. `supabase/schema.sql`
2. `supabase/seed.local.sql` (generated from the private spreadsheet; git-ignored)
3. Your private `supabase/allowlist.local.sql`

If you already ran an older version of `schema.sql`, run the updated file again. The new v2 tables and policies are additive and the policy block is re-runnable.

The current package already contains `seed.local.sql` generated from the supplied CSV, but `.gitignore` prevents it from entering Git history.

## 3. Add faculty emails / allowlist

Copy:

```text
supabase/allowlist.template.sql
```

to:

```text
supabase/allowlist.local.sql
```

and add the approved institutional email for each faculty member. At least one user should receive `admin` or `hod` role.

Do **not** guess institutional email addresses. They are deliberately not inferred from faculty names.

## 4. Configure Supabase Auth

Recommended:

- Keep email/password signup enabled. The app and schema restrict signup to addresses matching `name@bme.buet.ac.bd`.
- Do not add app-side password rules. If you need very short passwords to work, keep Supabase Auth password-strength settings relaxed enough for that policy.
- Keep the allowlist + RLS protection for academic records. A signed-up account can authenticate, but protected data is visible only after that email maps to an active faculty profile.
- Configure institutional Google/OIDC provider if available.
- Keep email/password or magic-link as a fallback.
- Enable MFA for admin/HOD accounts if possible.
- Add your final GitHub Pages URL to Auth redirect URLs.

## 5. Deploy with GitHub Pages

Push the repository to GitHub. In repository **Settings → Secrets and variables → Actions → Variables**, add:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `ACADEMIC_TERM` (optional; defaults to 2026)

Then enable **Settings → Pages → Source: GitHub Actions**.

The workflow `.github/workflows/pages.yml` injects only the public Supabase client configuration into the built `config.js`.

## 6. Re-generate private seed from a spreadsheet CSV

```bash
python scripts/generate_seed.py /path/to/export.csv
```

This normalizes repeated whitespace in course codes (including the source `BME  207` → `BME 207`) and writes:

```text
supabase/seed.local.sql
```

This file is intentionally ignored by Git.

## Spreadsheet rules encoded

Hard rules:

- QP-A ≠ QP-B
- Moderator 01 ≠ Moderator 02
- Neither moderator may equal QP-A or QP-B
- Script Scrutinizer may not equal QP-A or QP-B
- Examiner A derives from QP-A
- Examiner B derives from QP-B
- Gradesheet Preparer derives from QP-A
- Gradesheet Scrutinizer derives from Script Scrutinizer
- Question deadline cannot be after exam date
- Final gradesheet deadline cannot be before exam date

Permitted but warned:

- Moderator may also be Script Scrutinizer. The source spreadsheet contains this pattern, so it is **not** blocked.

Workflow completion dependencies:

```text
Question Prep A + B
        ↓
Moderator 01 + 02
        ↓
Examination A + B
        ↓
Script Scrutiny
        ↓
Gradesheet Preparation
        ↓
Gradesheet Scrutiny
```

## Important production note

A public GitHub Pages URL cannot itself be made invisible to outsiders on ordinary GitHub Pages. What is protected here is the **data**: unauthorized users can reach only the login/app shell and RLS prevents them from retrieving academic records. If the requirement is that outsiders must not even load the login page, use an access-controlled host/proxy instead of standard public GitHub Pages.
