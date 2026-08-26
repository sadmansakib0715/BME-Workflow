FIX FOR MISSING "Manage CTs" / "Sessional Setup" BUTTONS

Cause:
tracker-admin.js checked Supabase once during initial page load. If the main BME app had not yet restored the session, tracker-admin exited and never retried. The main app then became Authenticated, but the manager buttons were never injected.

Apply:
1. Replace repository-root tracker-admin.js with the tracker-admin.js in this patch.
2. Replace index.html with this patch's index.html (it uses tracker-admin.js?v=5 to force a fresh browser copy).
3. Commit and push:
   git add tracker-admin.js index.html
   git commit -m "Fix CT sessional manager visibility after auth"
   git push origin main
4. Wait for GitHub Pages to deploy, then open the production URL and press Ctrl+Shift+R once.

Expected sidebar after login:
- CT Calendar
- ... existing items ...
- Manage CTs
- Sessional Setup
- Sync Health (admin only)
- Logout

The manager now injects its navigation hooks even before auth finishes, registers the Supabase auth listener before checking the current session, and retries injection when the main app rerenders the sidebar.
