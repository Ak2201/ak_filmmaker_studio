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

/* THE THIRD THING THE TWO SIGN-IN PATHS SHARE: the Google query
   parameters. Drive-only storage (schema §66) keeps a refresh token on
   the server, and Google issues one only for `access_type=offline` WITH
   a consent screen — so a sign-in that still needs the grant asks for
   both, and every other sign-in asks for neither (re-consenting on
   every sign-in would be an extra screen for nothing).

     drive      storage_mode is 'drive'
     needGrant  this device has no record of the grant
                (fms_drive_sync_v1.store[<uid>].granted), or the server said
                'regrant'

   `select_account` always, for the shared-machine reason in cloud.js.
   Pure and import-free, like the rest of this file. */
export function googleQueryParams(o) {
  const { drive, needGrant } = o || {};
  const out = { prompt: needGrant ? 'consent select_account' : 'select_account' };
  if (drive && needGrant) out.access_type = 'offline';
  return out;
}

/* Has this device recorded the Drive grant? Read raw from the one
   device-local key that holds it, so start.html (which has no store.js)
   answers the same as the studio. A throw reads as "no". */
export const DRIVE_STATE_KEY_NAME = 'fms_drive_sync_v1';
export function driveGrantRecorded(raw) {
  try {
    const text = raw != null ? raw : (typeof localStorage !== 'undefined' ? localStorage.getItem(DRIVE_STATE_KEY_NAME) : null);
    const st = JSON.parse(text || '{}') || {};
    /* `store` is per account id (drive-project-sync.js): any account
       on this device that recorded the grant counts. */
    const accts = st.store && typeof st.store === 'object' ? Object.values(st.store) : [];
    return accts.some((a) => !!(a && typeof a === 'object' && a.granted));
  } catch (e) { return false; }
}
