BME Workflow — Email/Password Authentication Patch

This patch changes only the login/signup experience.

Desired flow:
1. Admin pre-approves a faculty email in public.allowed_users.
2. Faculty clicks "Create your account".
3. Faculty enters approved email + password.
4. Unauthorized email is rejected before signup in the UI.
5. Approved faculty confirms their email once (recommended).
6. Future logins use email + password only.
7. Existing RLS + profiles + allowed_users remain the security boundary.

FILES
- index.html                                  replace repository root file
- auth-password.js                            add to repository root
- .github/workflows/pages.yml                 replace existing workflow
- supabase/migrations/202609180001_password_auth.sql   add this migration

IMPORTANT ORDER
A. Run supabase/migrations/202609180001_password_auth.sql in Supabase SQL Editor.
B. Then copy the other files into the repository and push.

SUPABASE SETTINGS
Authentication -> Providers -> Email:
- Email provider: enabled
- Confirm email: recommended ON

Authentication -> URL Configuration:
Site URL:
  https://sadmansakib0715.github.io/BME-Workflow/

Redirect URLs:
  https://sadmansakib0715.github.io/BME-Workflow/
  https://sadmansakib0715.github.io/BME-Workflow/**

ALLOWED USER
The email must already exist in public.allowed_users with:
- email = exact faculty email
- faculty_id = that faculty member's faculty.id
- app_role = faculty / admin / hod
- active = true

GIT COMMANDS
git add index.html auth-password.js .github/workflows/pages.yml supabase/migrations/202609180001_password_auth.sql
git commit -m "Switch to allowlisted email password authentication"
git push origin main

After GitHub Pages deploys, hard refresh:
Mac: Command + Shift + R

OLD TEST USER NOTE
If the same email already exists in Supabase Authentication -> Users from earlier magic-link testing,
it may not have a password. For the cleanest first test, delete that TEST auth user only, then use
"Create your account" on the website. Do not delete faculty or allowed_users rows.
