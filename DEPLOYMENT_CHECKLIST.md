# Deployment Checklist

1. Create a new Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL editor.
3. Run the private `supabase/seed.local.sql` supplied in this package.
4. Copy `supabase/allowlist.template.sql` to `supabase/allowlist.local.sql` and add the real institutional email address for every approved faculty member. Assign at least one account `admin` or `hod`.
5. Configure Supabase Auth (institutional Google/OIDC if available; email/password or magic-link may remain as fallback). Add the final GitHub Pages URL to the allowed redirect URLs.
6. Push the repository to GitHub. The real seed and allowlist are already excluded by `.gitignore`.
7. Add repository Actions variables: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and optionally `ACADEMIC_TERM`.
8. Set GitHub Pages source to **GitHub Actions** and run the deployment workflow.
9. Sign in as the first admin. Imported courses start as **Draft** and therefore remain invisible to ordinary faculty.
10. For each course, review the five primary assignments, enter deadlines when known, check **Conflicts**, then publish the course.
11. Test with a normal faculty account: it should show only that teacher's personal task/course feed plus the authenticated general overview.
12. Test with an unauthorized account: authentication may succeed, but it must receive **Access denied** and no protected rows.
13. Open a private/incognito browser without signing in: no faculty/course assignment data should be visible or retrievable.

## Before real departmental use

- Enable MFA for admin/HOD accounts if your identity provider supports it.
- Set a database backup policy in Supabase.
- Confirm institutional email addresses rather than guessing them from names.
- Review the two source-supported Moderator/Scrutinizer overlaps as warnings, not errors.
- Decide whether normal faculty should retain access to aggregate department-wide progress; the current design allows this after authentication.
