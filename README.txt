BME WORKFLOW — INTERACTIVE CT + SESSIONAL PATCH

WHAT THIS ADDS
1. Manage CTs:
   - inline CT status dropdown
   - "Date set" checkbox
   - date calendar appears only when Date set is checked
   - date/status changes save immediately to Supabase
   - setting a date automatically changes Not Planned -> CT Scheduled
   - Details button still allows CT title, section, responsible teacher, syllabus and notes

2. Sessional / Lab Manager:
   - Save "Number of Sessions / Labs" and actual Lab 01...N rows are generated in public.sessional_sessions
   - each lab has a Date set checkbox + calendar
   - each lab has a status dropdown
   - Details lets you edit title/experiment, section/scope, responsible faculty, report requirement/deadline and notes

3. Assessment Activity:
   - each quiz/viva/lab test/report/etc. gets its own Date set checkbox + calendar
   - each assessment gets a status dropdown:
     Not Started -> Scheduled -> Evaluation Taken -> Marking Complete -> Marks Uploaded / Published
   - changes save immediately to public.assessment_instances

HOW TO APPLY
A. Copy tracker-admin.js to the ROOT of your BME-Workflow repo.
B. Make sure index.html contains this line AFTER app.js:
   <script src="./tracker-admin.js?v=4"></script>
   You can also replace index.html with the one in this patch.
C. Commit and push:
   git add tracker-admin.js index.html
   git commit -m "Add editable CT and sessional date/status controls"
   git push origin main
D. Open the production site WITHOUT ?demo=1, sign in with an approved BME account, and hard refresh (Ctrl+Shift+R).

IMPORTANT
- The previous activity_tracker_v3_migration.sql must already have been run in Supabase so course teachers have RLS write access.
- Do not test persistence using ?demo=1. Demo changes are intentionally browser-only.
