/* ============================================================
   SIGN-IN FOR THE LANDING PAGE, WITHOUT THE SDK
   ------------------------------------------------------------
   start.html carries the "Continue with Google" button now (owner's
   decision, 9 Oct 2026: the landing page is where people arrive and
   where they sign in; invite.html stops being the doorway). This file
   is how it does that without loading any app code.

   WHY NOT JUST CALL cloud.js's signInWithGoogle(). Two reasons, and the
   second is the one that decided it:

     - cloud.js sits in the shared `studio` CORE chunk together with
       store.js, sitegate.js, gate.js and billing.js. Importing it —
       even behind a click-time `await import()` — fetches that whole
       core, about a megabyte, at the exact moment somebody has decided
       to sign up, on a phone. That is the one click that must be
       instant.
     - `npm run prove:growth` asserts no Supabase SDK chunk is fetched
       on the start page at all.

   WHAT signInWithGoogle ACTUALLY DOES for the web is one thing: a
   top-level GET navigation to the Supabase authorize endpoint. There is
   no handshake to reproduce, no state to keep, nothing cryptographic —
   auth-js builds a URL and sets location. So this file builds the same
   URL. The shape is documented verbatim in docs/GOOGLE-AUTH.md.

   THE RISK, STATED PLAINLY: this pins the authorize URL's shape. If
   Supabase ever changes it, start.html's sign-in breaks and the app's
   own sign-in keeps working, so nothing obvious would point at it.
   prove:gate asserts the button navigates to a URL carrying
   provider=google, the right redirect_to and the Drive scope — that
   assertion is the thing that catches the drift. Do not delete it.

   THE SCOPE COMES FROM auth-scope.js, shared with cloud.js, because
   Google records consent per client AND per scope set: ask for less
   here and the Drive grant is simply missing from the session that
   comes back, and the user meets a second consent screen later for a
   permission they believe they already gave.

   WHERE IT RETURNS TO: the hub, never back here. The flow is
   implicit — the tokens come home in the URL fragment and only
   auth-js's detectSessionInUrl can store them. start.html does not load
   auth-js and must not, so a redirect back to start.html would strand
   the tokens in the address bar and sign the user in nowhere.

   The hub is addressed as `/`, NOT as `/index.html`, and that
   distinction shipped broken: see defaultRedirect() below.
   ============================================================ */
import { DRIVE_SCOPE } from './auth-scope.js';

/* Named directly so Vite inlines two strings rather than an object, and
   wrapped so the module stays importable from Node. Same shape funnel.js
   uses, for the same reason. */
let URL_ = '', KEY_ = '';
try { URL_ = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, ''); } catch (e) { /* */ }
try { KEY_ = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(); } catch (e) { /* */ }

/** False on a build with no Supabase project. The caller must then let
 *  its <a href="invite.html"> stand rather than preventing default —
 *  the markup is the fallback, which is also what a scripts-off reader
 *  gets. */
export const configured = () => !!(URL_ && KEY_);

/** Where Google sends them back: the hub, addressed as the DIRECTORY
 *  rather than as `index.html`. It boots cloud.js, which reads the
 *  fragment, stores the session and runs the gate.
 *
 *  NOT `index.html`, AND THAT IS THE WHOLE POINT — this returned
 *  people to the landing page signed out, on the live site only.
 *  `vercel.json` sets `cleanUrls`, so of the four spellings of this
 *  page the production host serves exactly one without a redirect:
 *
 *      /index.html  308 → /          /            200
 *      /start.html  308 → /start     /start       200
 *
 *  So `redirect_to=…/index.html` made the ONE navigation that carries
 *  a session the ONE navigation this host answers with a 308 — a
 *  redirect that has to survive a cross-origin bounce from Supabase,
 *  carry a fragment Vercel never sees, and pass a service worker that
 *  this repo has already lost a day to (CLAUDE.md: "a service worker
 *  must never answer a navigation with a redirected response" →
 *  ERR_FAILED, `.html` form only, browser only). None of that is worth
 *  risking to name a file.
 *
 *  cloud.js never had the bug: `authRedirectTarget()` is
 *  `location.origin + location.pathname`, which on a cleanUrls host is
 *  always already clean. This file hand-built its target instead and
 *  drifted — the same shape of mistake auth-scope.js exists to prevent,
 *  one field along.
 *
 *  `new URL('.', href)` is the directory of the current page, which is
 *  the origin root from `/start` and from `/start.html` alike, and
 *  serves index.html under vite dev, vite preview and Vercel without a
 *  redirect in any of them. It is also what Supabase falls back to when
 *  a redirect_to is not allow-listed, so the allow-list can no longer
 *  change the destination. */
export function defaultRedirect() {
  try { return new URL('.', location.href).href; } catch (e) { return '/'; }
}

/** The authorize URL, built rather than called — exported on its own so
 *  a test can read it without navigating. */
export function googleAuthorizeUrl(opts) {
  const o = opts || {};
  const u = new URL(URL_ + '/auth/v1/authorize');
  u.searchParams.set('provider', 'google');
  u.searchParams.set('redirect_to', o.redirectTo || defaultRedirect());
  u.searchParams.set('scopes', o.scopes || DRIVE_SCOPE);
  /* Matches cloud.js. Without it a browser holding several Google
     accounts silently reuses the last one, which on a shared machine
     signs somebody into a stranger's studio. */
  u.searchParams.set('prompt', 'select_account');
  return u.href;
}

/** Go. Returns false if the build has no project, so the caller can let
 *  the link do its ordinary thing. */
export function startGoogle(opts) {
  if (!configured()) return false;
  location.href = googleAuthorizeUrl(opts);
  return true;
}

export default { configured, googleAuthorizeUrl, defaultRedirect, startGoogle };
