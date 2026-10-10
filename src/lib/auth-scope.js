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

/* THE SECOND THING THE TWO SIGN-IN PATHS SHARE, here for the same
   reason as the first: it is a name that must be identical in two
   files which may not import each other.

   cloud.js WRITES it (sessionStorage) when a Google return fails;
   start.js READS it, and start.js must not touch cloud.js — cloud.js
   is in the `studio` CORE chunk and importing it would put a megabyte
   of app code on the landing page. So the key crosses between them as
   a constant, through this leaf, which imports nothing and must stay
   that way (CLAUDE.md, "A PURE module shared with CORE is swallowed by
   CORE").

   Why a stash at all: a failed sign-in used to be reported only in a
   toast, and the page that raised it is immediately replaced by the
   site gate, so the sentence died with the document. Every failure
   looked the same from the outside — "I signed in and came back to the
   landing page". This is the channel that outlives the redirect. */
export const AUTH_ERROR_KEY = 'fms_auth_error';
