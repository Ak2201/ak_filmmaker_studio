/* ============================================================
   THE GOOGLE SCOPE, ON ITS OWN, SO TWO CALLERS CANNOT DRIFT
   ------------------------------------------------------------
   One constant, no imports. It is here rather than in drive.js
   because there are now TWO places that build a Google sign-in:

     - src/lib/cloud.js      signInWithGoogle(), inside the app
     - src/lib/start-auth.js the button on start.html, which must
                             not load the Supabase SDK (and so must
                             not load cloud.js, which is in the
                             shared CORE chunk)

   and the scope has to be IDENTICAL in both. Google records consent
   per client id AND per scope set: ask for the e-mail alone on the
   landing page and the Drive grant is simply not in the session that
   comes back, so drive-sync.js finds no provider_token and the user
   meets a second consent screen later for a permission they believe
   they already gave. That is the bug this file exists to make
   impossible — see the "ONE Google OAuth client" note in CLAUDE.md,
   which is the same lesson from the other direction.

   drive.js re-exports it, so nothing that imports DRIVE_SCOPE from
   there has to change.
   ============================================================ */
export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
