# BME Workflow v3 patch — apply instructions

This patch fixes the three observed production gaps without replacing the working theory engine:

1. **CT data missing** — the current app has a CT page, but the old seed generator only imports the theory grade CSV. The full workbook must seed `class_tests`.
2. **Sessional is read-only / empty** — the current app renders sessional records if they exist, but has no setup/save UI. `tracker-admin.js` adds writable CT and sessional managers.
3. **Changes not appearing in Supabase** — the hard-coded Gmail test login enters demo mode, so changes are deliberately browser-only. Remove that shortcut. Also note: committing `schema.sql` does NOT automatically migrate an existing Supabase database.

## A. Copy the patch files into the repo

Copy:

- `tracker-admin.js` → repository root
- `supabase/activity_tracker_v3_migration.sql` → `supabase/`
- `scripts/generate_full_seed.py` → `scripts/`

Apply the two tiny text patches manually (or with `git apply`):

```bash
git apply remove_demo_login.patch
git apply index_script.patch
```

## B. Update the EXISTING Supabase database

Open **Supabase → SQL Editor** and run, in this order:

1. the latest `supabase/schema.sql` from the repository
2. `supabase/activity_tracker_v3_migration.sql`

This is required because GitHub Pages deploys JavaScript; it does **not** apply PostgreSQL schema files automatically.

## C. Generate a private seed from the FULL workbook

From the repository root:

```bash
python scripts/generate_full_seed.py "BME - Jan 26 - Activity Tracker - Final.xlsx"
```

This creates:

```text
supabase/seed.local.sql
```

The output contains real faculty/course assignments, CTs and sessional activity and must remain private.

Then paste/run `supabase/seed.local.sql` in the Supabase SQL Editor.

## D. Important authentication rule

For production, sign in with an approved `@bme.buet.ac.bd` account.

`?demo=1` is intentionally non-persistent. It should NEVER be used to test whether Supabase writes work.

## E. What you should see after seeding

- **CT Calendar** populated from `04_Class Test Tracker`.
- Theory course detail pages show their CTs.
- **Sessional Courses** populated from `02_Sessional Course List`.
- Sessional assessment activity populated from `05_Sessional Assessment Tracker`.
- **Manage CTs** appears in the left navigation and writes directly to Supabase.
- **Sessional Setup** allows the assigned course teachers to configure number of sessions, add assessment components, choose quantities/marks/scope, and update assessment lifecycle statuses.
- Admin **Sync Health** shows whether core CT/session tables are actually populated.

## F. Commit and push

```bash
git add app.js index.html tracker-admin.js supabase/activity_tracker_v3_migration.sql scripts/generate_full_seed.py
git commit -m "Complete CT and sessional workflow with Supabase persistence"
git push origin main
```

Do **not** add `supabase/seed.local.sql`.
