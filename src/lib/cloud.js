/* ============================================================
   THE FILMMAKER'S STUDIO — CLOUD LAYER (v3, ES module port)
   ------------------------------------------------------------
   Ported from studio-cloud.js. Layered on top of StudioStore
   (local-first). Adds:
     - Supabase auth (Google, and only Google — see AUTH below)
     - Cloud sync of every project (push debounced, pull realtime)
     - Sharing (links + claim flow)
     - Comments (per-data-key threads, suggestion accept/reject)

   Idempotent — safe to reload.

   LOAD ORDER: imports ../lib/store.js first and on purpose — store.js
   installs the localStorage proxy at evaluation time and everything
   below reads localStorage through it.

   The Supabase SDK is still loaded LAZILY via dynamic import() inside
   ensureClient(), so it is never fetched for users who never sign in.
   Only the specifier changed (esm.sh URL → npm package name) so the
   bundler can version-pin and code-split it.
   ============================================================ */
import Store from './store.js';
/* One constant, for the scope string, so sign-in and the Drive client
   cannot drift apart about what was consented to. drive.js imports
   nothing from here, so this is not a cycle, and vite.config folds
   every src/lib module into one chunk anyway. */
import { DRIVE_SCOPE } from './drive.js';

// ============================================================
// CONSTANTS
// ============================================================
// SDK is imported dynamically below from '@supabase/supabase-js'
// (was: https://esm.sh/@supabase/supabase-js@2.45.4 — the version is
// now pinned in package.json instead of in this URL).
const CFG_KEY          = 'fms_supabase_cfg_v1';        // { url, key } — public
const QUEUE_KEY        = 'fms_studio_cloud_queue_v1';  // offline queue
const MIGRATE_FLAG_KEY = 'fms_studio_migrated_v1';     // <userId> = migrated
const MIGRATE_LOCK_KEY = 'fms_studio_migrate_lock_v1'; // ts when running
const SYNC_META_KEY    = 'fms_studio_sync_meta_v1';    // per (project,scope) clocks
const SALVAGE_KEY      = 'fms_studio_sync_salvage_v1'; // overwritten-local safety net
const PENDING_SHARE_KEY = 'fms_studio_pending_share_v1'; // survives an OAuth round trip

// Map between localStorage scoped-key and DB scope name.
//
// EVERY entry in Store.SCOPED_KEYS belongs here. A scoped key with no
// scope name is a key that saves locally and silently never reaches the
// account — which reads, from the user's side, exactly like data loss on
// a new device. The seven module keys below (scenes … dissect) were
// missing for three releases for precisely that reason.
//
// The names on the right are not free-form: `project_data.scope` in
// supabase-schema.sql has a CHECK constraint listing them, so a new
// scope needs BOTH sides changed or the upsert is rejected by Postgres.
// The assertion under this map turns the silent version of that mistake
// into a console warning at load.
const SCOPE_BY_KEY = {
  'fms_filmmaker_combined_v1':  'feature',
  'fms_shortfilm_blueprint_v1': 'short',
  'fms_library_calc_v1':        'library',
  'fms_filmmaker_prefs_v1':     'feature_prefs',
  'fms_shortfilm_prefs_v1':     'short_prefs',
  'fms_library_prefs_v1':       'library_prefs',
  'fms_studio_activity_v1':     'activity',
  'fms_scenes_v1':              'scenes',
  'fms_contacts_v1':            'contacts',
  'fms_shots_v1':               'shots',
  'fms_script_v1':              'script',
  'fms_locations_v1':           'locations',
  'fms_workbench_v1':           'workbench',
  'fms_dissect_v1':             'dissect',
  // festivals was in SCOPED_KEYS and NOT here, so it saved locally
  // and never reached the account — exactly the failure the note
  // above describes, recurring. The scope name is already in the
  // CHECK constraint, so this one line is the whole fix.
  'fms_festivals_v1':           'festivals',
  'fms_scriptgen_v1':           'scriptgen',
  'fms_songs_v1':               'songs'
};
const KEY_BY_SCOPE = Object.fromEntries(
  Object.entries(SCOPE_BY_KEY).map(([k, v]) => [v, k])
);

// Derived, not hand-checked: the list of scoped keys lives in store.js
// and this asks that file rather than repeating it.
const _unsynced = (Store.SCOPED_KEYS || []).filter((k) => !SCOPE_BY_KEY[k]);
if (_unsynced.length) {
  console.warn(
    '[StudioCloud] these project-scoped keys have no cloud scope and will ' +
    'NEVER sync to an account:', _unsynced
  );
}

// ============================================================
// STATE
// ============================================================
let supabase = null;          // client instance, null until configured
let session = null;           // current session, null until signed in
let cfg = null;               // {url,key}
let _applyingRemote = false;  // echo-loop guard
let _activeChannels = [];     // realtime subscriptions for current project
let _migrationPromise = null; // single-flight migration guard
let _signingIn = false;       // an OAuth redirect is in flight
let _invitesCheckedFor = null; // user id whose account invites we swept

// ============================================================
// SYNC STATUS — one visible answer to "is my writing safe?"
// ------------------------------------------------------------
// A local-first app that also syncs owes the user an honest status
// line, because the two states it can be in ("saved here" and "saved
// to the account") are different promises. Nothing below ever blocks
// a local save on a network result; the status only ever REPORTS.
// ============================================================
export const SYNC_STATES = {
  OFF:      'off',       // not configured, or signed out — local only
  IDLE:     'idle',      // signed in, nothing outstanding
  SYNCING:  'syncing',   // a push or pull is in flight
  SYNCED:   'synced',    // last operation succeeded
  OFFLINE:  'offline',   // queued locally, waiting for a connection
  ERROR:    'error'      // last operation failed; work is still local
};
let _syncState  = SYNC_STATES.OFF;
let _syncDetail = 'Local only';
const syncListeners = new Set();

export function onSyncStatus(cb) {
  syncListeners.add(cb);
  try { cb(getSyncStatus()); } catch (e) {}
  return () => syncListeners.delete(cb);
}
export function getSyncStatus() {
  return {
    state:   _syncState,
    detail:  _syncDetail,
    pending: _readQueue().length,
    online:  typeof navigator === 'undefined' ? true : navigator.onLine
  };
}
function setSync(state, detail) {
  _syncState  = state;
  _syncDetail = detail || '';
  const snap = getSyncStatus();
  syncListeners.forEach((fn) => { try { fn(snap); } catch (e) {} });
  Store.notify('cloud:status', snap);
}
function idleSync() {
  const q = _readQueue().length;
  if (!session)  return setSync(SYNC_STATES.OFF, isConfigured() ? 'Signed out — local only' : 'Local only');
  if (q)         return setSync(SYNC_STATES.OFFLINE, q + ' change' + (q === 1 ? '' : 's') + ' waiting to upload');
  setSync(SYNC_STATES.SYNCED, 'Everything is in your account');
}

// ============================================================
// SYNC CLOCKS — what last-write-wins is decided on
// ------------------------------------------------------------
// One entry per (project, scope): when this device last WROTE that
// scope, and the server timestamp it last SAW. Kept out of the
// SCOPED_KEYS list deliberately and written through rawSet, so the
// storage proxy neither re-scopes it nor re-fires `saved` (which
// would be an infinite loop — see the save-loop trap in CLAUDE.md).
// ============================================================
function _readMeta() {
  try { return JSON.parse(Store.rawGet(SYNC_META_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function _writeMeta(m) { Store.rawSet(SYNC_META_KEY, JSON.stringify(m)); }
const _metaId = (pid, scope) => pid + '::' + scope;

function markLocalWrite(pid, scope, ts) {
  if (!pid || !scope) return;
  const m = _readMeta();
  const row = m[_metaId(pid, scope)] || {};
  row.local = ts || Date.now();
  m[_metaId(pid, scope)] = row;
  _writeMeta(m);
}
function markRemoteSeen(pid, scope, ts, alsoLocal) {
  if (!pid || !scope) return;
  const m = _readMeta();
  const row = m[_metaId(pid, scope)] || {};
  row.remote = ts || Date.now();
  if (alsoLocal) row.local = row.remote;
  m[_metaId(pid, scope)] = row;
  _writeMeta(m);
}

/* When this device last touched a scope, in epoch ms.

   The per-scope clock is the precise answer. When there isn't one —
   data written before the account existed, or restored from a backup
   file — fall back to the project's own `updatedAt`, which store.js
   bumps on EVERY scoped write. That fallback is coarse (any save in
   the project bumps it) and therefore biased toward "local is newer",
   which is the safe direction for a local-first tool: the worst case
   is an extra upload, not a lost paragraph. */
function localClock(pid, scope) {
  const row = _readMeta()[_metaId(pid, scope)];
  if (row && row.local) return row.local;
  const proj = Store.getProject(pid);
  const t = proj && proj.updatedAt ? Date.parse(proj.updatedAt) : 0;
  return Number.isFinite(t) ? t : 0;
}

/* The last thing standing between a bad clock and somebody's writing.

   Before any remote value replaces a DIFFERENT non-empty local value,
   the local one is copied here first. Capped at the last 12 so it can
   never grow without bound. Nothing reads it automatically — it exists
   so that "the sync ate my scene list" has an answer other than "sorry". */
function salvage(pid, scope, previous) {
  if (!previous) return;
  let all = [];
  try { all = JSON.parse(Store.rawGet(SALVAGE_KEY) || '[]') || []; } catch (e) { all = []; }
  all.push({ at: new Date().toISOString(), projectId: pid, scope, data: previous });
  while (all.length > 12) all.shift();
  Store.rawSet(SALVAGE_KEY, JSON.stringify(all));
}
export function listSalvage() {
  try { return JSON.parse(Store.rawGet(SALVAGE_KEY) || '[]') || []; }
  catch (e) { return []; }
}
export function restoreSalvage(index) {
  const all = listSalvage();
  const row = all[index];
  if (!row) return false;
  const localKey = KEY_BY_SCOPE[row.scope];
  if (!localKey) return false;
  Store.rawSet(localKey + '__' + row.projectId, row.data);
  markLocalWrite(row.projectId, row.scope, Date.now());
  Store.notify('cloud:restored', row);
  return true;
}

// ============================================================
// CFG (URL + anon key — both public, gated by RLS)
// ============================================================
/* THE BUILD KNOWS WHICH PROJECT THIS IS; THE BROWSER MAY OVERRIDE IT.
   ------------------------------------------------------------
   This used to read localStorage and nothing else, which made the
   hosted app impossible to sign in to: ensureClient() needs a URL and
   a key, signInWithGoogle() needs ensureClient(), so nobody could
   reach an account until somebody had typed a project URL and a
   208-character JWT into a modal. That is a chicken-and-egg, not a
   setup step — there is no account, and therefore no admin, until the
   config already exists.

   So the deployed build carries its own, the same way it carries the
   Google client id, and for the same reason: both values are public
   and ship in the page either way. What guards this database is the
   row-level policy in supabase-schema.sql. A service_role key would
   be a different matter entirely and belongs nowhere near a browser —
   saveConfig() in ui/auth.js refuses one on sight.

   A value SAVED in this browser still wins, because self-hosting is a
   real use for this app: point it at your own project and the build's
   default steps aside. That is also why setCfg(null) is a meaningful
   operation now — it clears the override and falls back rather than
   un-configuring the app. */
const BUILT_IN_CFG = (() => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  const url = (env.VITE_SUPABASE_URL || '').trim();
  const key = (env.VITE_SUPABASE_ANON_KEY || '').trim();
  return (url && key) ? { url, key, builtIn: true } : null;
})();

export function getCfg() {
  try {
    const saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    if (saved && saved.url && saved.key) return saved;
  } catch (e) { /* unreadable storage falls through to the build's own */ }
  return BUILT_IN_CFG;
}

/** Did this browser override the build? Admin UI reads it; nothing else should. */
export function isCfgOverridden() {
  try {
    const saved = JSON.parse(localStorage.getItem(CFG_KEY) || 'null');
    return !!(saved && saved.url && saved.key);
  } catch (e) { return false; }
}

/** The build's own, for an admin panel that wants to show what it is falling back to. */
export function builtInCfg() { return BUILT_IN_CFG; }
export function setCfg(c) {
  if (c && c.url && c.key) {
    localStorage.setItem(CFG_KEY, JSON.stringify({ url: c.url.trim(), key: c.key.trim() }));
    cfg = c;
  } else {
    localStorage.removeItem(CFG_KEY);
    cfg = null;
  }
}

export const isConfigured = () => !!(getCfg() && getCfg().url && getCfg().key);

/* IS THIS MODULE THE LIVE SYNC RIGHT NOW?
   ------------------------------------------------------------
   The same two conditions the `saved` subscriber at the bottom of
   this file uses to decide whether to push — configured, and a
   session. Stated once, here, because a SECOND sync backend now
   has to ask: src/lib/drive-sync.js refuses to sync live while
   this one is live, since two live syncs in one document echo each
   other through localStorage forever.

   It is a function rather than a flag for the obvious reason: a
   flag copied into another module is stale the moment somebody
   signs out. */
export function ownsSync() { return !!(isConfigured() && session); }

// ============================================================
// CLIENT INIT — loads SDK on demand
// ============================================================
export async function ensureClient() {
  if (supabase) return supabase;
  cfg = getCfg();
  if (!cfg || !cfg.url || !cfg.key) return null;
  try {
    // Lazy, on-purpose: keeps the SDK out of the initial page load for
    // anyone who never signs in. Bundled + version-pinned by Vite.
    const mod = await import('@supabase/supabase-js');
    supabase = mod.createClient(cfg.url, cfg.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      },
      realtime: {
        params: { eventsPerSecond: 5 }
      }
    });
    // Restore session
    const { data } = await supabase.auth.getSession();
    session = data.session;
    // Listen for auth changes
    supabase.auth.onAuthStateChange((event, sess) => {
      const wasNull = !session;
      session = sess;
      if (sess) _signingIn = false;
      notifyAuth(event, sess);
      if (sess) {
        /* WHO IS SIGNED IN IS STORAGE STATE, and store.js is the only
           thing that can act on it — it patched Storage.prototype
           before this file was even parsed, so it reads the id from
           localStorage rather than asking us. Tell it first, before
           anything below reads or writes a project.

           A true return means this document is still holding the
           PREVIOUS namespace's data in its fields and a reload is
           already scheduled. Uploading or pulling now would push those
           fields into the account that is about to open, which is the
           one way this design can lose somebody's writing. Stop. */
        if (Store.setAccount(sess.user.id)) { idleSync(); return; }
      } else {
        /* Involuntary: a refresh token that expired while the tab sat
           open. Persist it for the next load, but do NOT reload — see
           setAccount()'s note. The deliberate signOut() path below
           asks for the reload itself. */
        Store.setAccount(null, { reload: false });
      }
      if (sess && wasNull) {
        // First time signed in this load — try migration
        maybeMigrateLocalToCloud();
        attachToCurrentProject();
        // An invite is addressed to an email, so it can only be matched
        // once there is a session to read an email off. This is that
        // moment; handlePendingInvites() is idempotent per user id.
        handlePendingInvites();
      }
      if (!sess) {
        tearDownChannels();
        _invitesCheckedFor = null;
      }
      idleSync();
    });
    idleSync();
    return supabase;
  } catch (e) {
    console.warn('[StudioCloud] failed to load SDK', e);
    return null;
  }
}

// ============================================================
// AUTH — GOOGLE ONLY
// ------------------------------------------------------------
// There is exactly one way in: `signInWithGoogle()` below. The
// magic-link / OTP path that used to sit beside it (`signInWithEmail`,
// `sb.auth.signInWithOtp`) is gone, and no password, second provider or
// anonymous-session call has ever existed here. If you add one, you are
// adding a second set of redirect, session and error states to keep
// correct, plus a credential this app would then be responsible for.
//
// THIS IS HALF THE FENCE. Removing a client call does not disable a
// provider: Supabase will still mint a session for any provider enabled
// under Authentication → Providers, called directly against the project
// URL with the public anon key. Email/Anonymous/everything-but-Google
// must be turned OFF in the dashboard for "Google only" to be true. The
// header of supabase-schema.sql says so as a setup step.
// ============================================================
const authListeners = new Set();
export function onAuth(cb) { authListeners.add(cb); return () => authListeners.delete(cb); }
function notifyAuth(event, sess) {
  authListeners.forEach(fn => { try { fn(event, sess); } catch (e) {} });
}
export function getSession() { return session; }
export function getUser()    { return session && session.user; }
export function getUserEmail() {
  if (!session || !session.user) return null;
  return session.user.email || (session.user.user_metadata && session.user.user_metadata.email);
}

/* WHO SEES THE ADMIN CONSOLE — AND WHAT THAT IS WORTH.
   ------------------------------------------------------------
   A build-time list of addresses, compared against the signed-in
   one. Say the limit out loud, because the name invites the wrong
   assumption: THIS IS NOT A SECURITY BOUNDARY. The bundle is public,
   the list is in it, and anyone can call the same functions from a
   devtools console. It decides what is SHOWN, nothing more.

   What actually stops somebody reading or writing rows that are not
   theirs is RLS, in Postgres, audited in docs/SECURITY-RLS.md. If a
   panel ever needs to be admin-only for a reason other than tidiness,
   the check belongs in a policy, not here.

   It is also a BOOTSTRAP and should be replaced. The real tier exists
   already — account_members.role is owner/admin/member and the
   policies read it — but this file makes no account-tier reads and no
   UI creates a member row, so there is currently no way to become an
   admin except by being named here. See open item 5 in CLAUDE.md. */
const ADMIN_EMAILS = (() => {
  const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
  return String(env.VITE_ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
})();

export function isAdmin() {
  const email = (getUserEmail() || '').trim().toLowerCase();
  return !!email && ADMIN_EMAILS.includes(email);
}

/* The Google access token Supabase hands back when sign-in asked for
   a Google scope of its own. Drive reads it so that ONE consent
   covers both jobs.

   It is deliberately read off `session` rather than copied anywhere:
   Supabase returns `provider_token` on the sign-in response ONLY and
   does not persist it, so this is null again after a reload. That is
   not a bug to work around here — drive.js re-mints silently through
   GIS on later loads, which works without a prompt precisely because
   the consent this token came from was recorded against the same
   client id. Storing it instead would mean writing a credential to
   disk, which this app refuses to do for the AI key and should refuse
   to do for this. */
export function providerToken() {
  return (session && session.provider_token) || null;
}

/* Where the provider sends the browser back to.

   The CURRENT page, with query and fragment stripped. Two reasons it
   is not a fixed landing page: the user keeps the page they were
   working on, and the value has to be listed verbatim in Supabase's
   "Additional Redirect URLs", which a wildcard per origin covers
   (docs/GOOGLE-AUTH.md). Nothing app-specific is smuggled through the
   URL — the pending share token rides in localStorage instead, because
   a bearer token has no business in a query string. */
export function authRedirectTarget() {
  return location.origin + location.pathname;
}

// ------------------------------------------------------------
// COMING BACK FROM THE PROVIDER
// ------------------------------------------------------------
// FLOW TYPE. The client is left on supabase-js's default, `implicit`,
// on purpose rather than by omission:
//
//   implicit → the return URL carries the tokens in the FRAGMENT
//     (`#access_token=…`). A fragment is never sent to any server, so
//     nothing lands in a Netlify or Vercel access log, and auth-js
//     clears it the moment it has read it (we tidy the leftover `#`
//     below). No credential of ours ever appears in a query string.
//   pkce → the return URL carries `?code=…` in the QUERY STRING, and
//     the exchange needs a verifier held in THIS browser's storage.
//
// The reason for implicit USED TO BE the magic-link path: pkce breaks
// the moment someone opens the emailed link on their phone instead of
// the laptop that asked for it, because the verifier is in the laptop's
// storage. That path is gone — Google is now the only way in, and a
// Google redirect always comes back to the browser that started it, so
// pkce would hold.
//
// So this is now INERTIA, not a constraint, and it is worth naming as
// such: the cost of implicit is that a refresh token passes through
// `location.hash` and therefore through the tab's history entry (we
// replace that entry immediately, below). Switching to
// `flowType: 'pkce'` is the better position and the detector below
// already reads `?code=`; it is deliberately NOT part of the
// remove-the-other-providers change, because the only sign-in path in
// the app cannot be re-verified without a live Supabase project, and
// `npm run verify` never signs in.
//
// auth-js throws the provider's own `#error=access_denied&…` away
// inside its initialiser, so the only way to tell a user WHY Google
// bounced them is to read the URL before the client is constructed.
const _redirect = (() => {
  if (typeof location === 'undefined') return null;
  const hash = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
  const qs   = new URLSearchParams(String(location.search || ''));
  const pick = (k) => hash.get(k) || qs.get(k);
  const err  = pick('error') || pick('error_code');
  if (err) {
    return {
      error: err,
      description: (pick('error_description') || '').replace(/\+/g, ' ')
    };
  }
  if (hash.get('access_token') || qs.get('code')) return { pending: true };
  return null;
})();

/** What the provider said when it sent the browser back here, if anything. */
export function readRedirect() { return _redirect; }

/* Strip anything the provider appended, without adding a history entry.
   auth-js sets `location.hash = ''`, which leaves a bare trailing '#'
   AND pushes a new entry; this replaces the entry outright. */
function cleanRedirectUrl() {
  if (!_redirect) return;
  try {
    const url = new URL(location.href);
    ['error', 'error_code', 'error_description', 'code', 'state'].forEach(
      (k) => url.searchParams.delete(k)
    );
    url.hash = '';
    history.replaceState(history.state, '', url.pathname + url.search);
  } catch (e) {}
}

/* A share token must survive the trip to Google and back. It rides in
   localStorage rather than on the redirect URL: the token is a bearer
   credential, and a bearer credential in a query string ends up in
   logs, in Referer headers and in whatever the user pastes next. */
function stashPendingShare() {
  try {
    const t = new URLSearchParams(location.search).get('share');
    if (t) Store.rawSet(PENDING_SHARE_KEY, t);
  } catch (e) {}
}
function takePendingShare() {
  const t = Store.rawGet(PENDING_SHARE_KEY);
  if (t) Store.rawRemove(PENDING_SHARE_KEY);
  return t || null;
}

/* Google. The only sign-in in this file, by design — see the AUTH
   banner above.

   `signInWithOAuth` does a top-level navigation to Google; it injects
   no script and posts no form, so the strict CSP (`script-src 'self'`,
   `form-action 'self'`) does not touch it. What comes back is handled
   by `detectSessionInUrl` inside ensureClient() plus readRedirect()
   below — see the flow-type note there.

   `prompt: 'select_account'` because the alternative is that a user on
   a shared machine is silently signed back into somebody else's
   Google account without ever being asked which one. */
export async function signInWithGoogle() {
  const sb = await ensureClient();
  if (!sb) throw new Error('Cloud is not set up in this browser yet. Add your Supabase URL and anon key first.');
  if (_signingIn) return;
  _signingIn = true;
  stashPendingShare();
  setSync(SYNC_STATES.SYNCING, 'Opening Google…');
  notifyAuth('REDIRECTING', null);
  try {
    const { error } = await sb.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authRedirectTarget(),
        /* ONE CONSENT FOR BOTH JOBS. Asking for drive.file here means
           the sign-in screen lists it alongside the e-mail address,
           the user agrees once, and Drive is connected the moment they
           land back — instead of meeting a second Google popup later
           that most people read as the app asking twice.

           This only works because the Drive client id and this one are
           now the SAME client: Google records consent per client, so
           with two clients a grant made here taught the other one
           nothing. See VITE_GOOGLE_CLIENT_ID in .env.

           drive.file is non-sensitive, so adding it needs no
           verification review and does not change the user cap. */
        scopes: DRIVE_SCOPE,
        queryParams: { prompt: 'select_account' }
      }
    });
    if (error) throw error;
    // On success the browser is already navigating away; nothing after
    // this line is guaranteed to run.
  } catch (e) {
    _signingIn = false;
    setSync(SYNC_STATES.ERROR, 'Google sign-in could not start');
    notifyAuth('SIGNED_OUT', null);
    throw e;
  }
}

export function isSigningIn() { return _signingIn; }

/* Sign out clears the SESSION, never the work.

   Nothing here touches a SCOPED_KEY, the projects list or the current
   project — the user keeps every word on this device and can carry on
   writing offline. The queue survives too: it holds changes that have
   not reached the account yet, and dropping it would turn "sign out"
   into "discard my unsynced edits".

   What it DOES clear is the namespace: the device's own projects come
   back into view, including anything that was there before this
   account ever existed. The account's own projects stay on disk under
   their own namespace, untouched, waiting for the next sign-in — sign
   out is not a delete. This is a deliberate click, so it takes the
   reload that makes the switch visible immediately. */
export async function signOut() {
  if (!supabase) {
    session = null;
    Store.setAccount(null);       // may reload; nothing left to await
    idleSync();
    return;
  }
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[StudioCloud] sign-out', e);
  }
  session = null;
  _signingIn = false;
  tearDownChannels();
  _invitesCheckedFor = null;
  Store.rawRemove(PENDING_SHARE_KEY);
  setSync(SYNC_STATES.OFF, 'Signed out — your projects are still on this device');
  /* LAST, and after the await on purpose. This schedules a reload, and
     a reload that lands before auth-js has finished clearing its own
     stored session would restore that session on the next load and
     sign the user straight back in. */
  Store.setAccount(null);
}

// ============================================================
// MIGRATION
// ============================================================
/* "You have work on this device. Put it in the account too?"
   ------------------------------------------------------------
   What changed with account namespaces: `Store.listProjects()` now
   answers for the OPEN namespace, so once signed in it returns the
   account's projects — which on a first sign-in is an empty list. The
   question this function asks is about the DEVICE's projects, so it
   has to ask for those explicitly.

   `listAdoptableProjects()` returns device projects that no account
   has taken yet. Accepting ADDS this account to them: the device keeps
   them (sign out and they are still there, the same single copy), and
   the account gains them and starts syncing them. It is not a move and
   not a duplicate.

   A device project another account already adopted is not offered, so
   this can never be the path by which two accounts end up sharing one
   film. Copying a film between accounts is what the backup file is
   for. */
async function maybeMigrateLocalToCloud() {
  if (!session) return;
  const userId = session.user.id;
  /* The page still belongs to a different namespace and a reload is
     inbound — see the setAccount() note in ensureClient(). */
  if (!Store.isAccountNamespace(userId)) return;
  const flag = Store.rawGet(MIGRATE_FLAG_KEY);
  if (flag === userId) return;  // already migrated for this user
  // Avoid race when two tabs sign in at the same time
  const lock = parseInt(Store.rawGet(MIGRATE_LOCK_KEY) || '0', 10);
  if (lock && (Date.now() - lock) < 30_000) return;
  Store.rawSet(MIGRATE_LOCK_KEY, String(Date.now()));

  if (_migrationPromise) return _migrationPromise;
  _migrationPromise = (async () => {
    try {
      const local = Store.listAdoptableProjects();
      if (!local.length) {
        // Nothing to bring across — but still pull cloud projects
        await pullProjectList();
        Store.rawSet(MIGRATE_FLAG_KEY, userId);
        return;
      }
      // Ask the user
      const ok = await askMigratePrompt(local.length);
      if (!ok) {
        // Don't re-prompt; mark as migrated even though we didn't do anything,
        // so they can sign in/out without the prompt re-appearing. The
        // projects stay exactly where they are — on the device, visible
        // the moment they sign out again.
        Store.rawSet(MIGRATE_FLAG_KEY, userId);
        await pullProjectList();
        return;
      }
      /* Membership first, upload second. The upload reads each
         project's blobs by id through rawGet, so it does not depend on
         the namespace — but the realtime attach and every later push
         do, and a project that reached the server without being in
         this namespace would sync in one direction only. */
      const taken = Store.adoptDeviceProjects();
      await uploadAllLocalProjects(taken.length ? taken : local);
      Store.rawSet(MIGRATE_FLAG_KEY, userId);
      /* Also pull: this account may have projects from another device,
         and the old code pulled them only if the user said NO. */
      await pullProjectList();
      toast('Added ' + local.length + ' project' + (local.length === 1 ? '' : 's') +
            ' to your account. They are still on this device too.', 'success');
    } catch (e) {
      console.warn('[StudioCloud] migrate failed', e);
      toast('Migration failed: ' + (e.message || e), 'error');
    } finally {
      Store.rawRemove(MIGRATE_LOCK_KEY);
      _migrationPromise = null;
    }
  })();
  return _migrationPromise;
}

async function askMigratePrompt(count) {
  if (window.StudioUI && StudioUI.openMigrationModal) {
    return await StudioUI.openMigrationModal(count);
  }
  return confirm('Found ' + count + ' local project(s). Upload to your cloud account?');
}

async function uploadAllLocalProjects(localProjects) {
  if (!supabase) return;
  const userId = session.user.id;
  for (const p of localProjects) {
    // Insert/update project meta — keep the same UUID locally so we don't
    // need a key rewrite. The cloud accepts the local UUID directly.
    const { error: pe } = await supabase.from('projects').upsert({
      id: p.id,
      owner_id: userId,
      title: p.title,
      format: p.format || 'feature',
      created_at: p.createdAt || new Date().toISOString(),
      updated_at: p.updatedAt || new Date().toISOString()
    }, { onConflict: 'id' });
    if (pe) { console.warn('[migrate proj]', pe); continue; }

    // Push every scope
    for (const [k, scope] of Object.entries(SCOPE_BY_KEY)) {
      const raw = Store.rawGet(k + '__' + p.id);
      if (!raw) continue;
      let json = null;
      try { json = JSON.parse(raw); } catch (e) { json = raw; }
      await supabase.from('project_data').upsert({
        project_id: p.id,
        scope: scope,
        data: json,
        updated_at: new Date().toISOString(),
        updated_by: userId
      }, { onConflict: 'project_id,scope' });
    }
  }
}

export async function pullProjectList() {
  if (!supabase || !session) return;
  const { data, error } = await supabase
    .from('projects')
    .select('id,title,format,created_at,updated_at,owner_id')
    .order('updated_at', { ascending: false });
  if (error) { console.warn('[pull list]', error); return; }
  if (!data) return;
  // Merge into local: any project_id we don't have, add it.
  //
  // Through Store.upsertProjectMeta() rather than the raw write to a
  // hard-coded 'fms_studio_projects_v1' this used to do. Two reasons
  // that write is gone: it appended to the list THIS NAMESPACE can
  // see and saved that filtered copy back, which would delete every
  // other namespace's projects; and a project filed with no namespace
  // stamp would be invisible to the account that just pulled it.
  const localIds = new Set(Store.listProjects().map(p => p.id));
  for (const row of data) {
    if (!localIds.has(row.id)) {
      Store.upsertProjectMeta({
        id: row.id,
        title: row.title,
        format: row.format,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      });
    }
    // For each scope, pull the data
    await pullProjectData(row.id);
  }
  Store.notify('projects:changed', { reason: 'cloud-pull' });
}

/* Pull one project's scopes, resolving each one by last-write-wins.

   The old version of this function had a comment admitting it "always
   trusts remote on pull". On a device that had been edited offline,
   that is an instruction to overwrite unsent work with an older copy
   the second the user signs in — the exact failure a local-first tool
   exists to not have. Each scope is now decided on its own clock, a
   newer local copy is pushed up instead of being replaced, and any
   local value that IS replaced is copied to the salvage ring first. */
export async function pullProjectData(projectId) {
  if (!supabase || !projectId) return;
  setSync(SYNC_STATES.SYNCING, 'Checking your account…');
  const { data, error } = await supabase
    .from('project_data')
    .select('scope,data,updated_at')
    .eq('project_id', projectId);
  if (error) {
    console.warn('[pull data]', error);
    // A failed pull changes nothing on disk. Local work is untouched.
    setSync(navigator.onLine ? SYNC_STATES.ERROR : SYNC_STATES.OFFLINE,
      navigator.onLine ? 'Could not read your account — working locally'
                       : 'Offline — working locally');
    return;
  }
  if (!data) { idleSync(); return; }

  let applied = 0, kept = 0;
  for (const row of data) {
    const localKey = KEY_BY_SCOPE[row.scope];
    if (!localKey) continue;                      // scope this build doesn't know
    const nsKey    = localKey + '__' + projectId;
    const remoteTs = Date.parse(row.updated_at || '') || 0;
    const localRaw = Store.rawGet(nsKey);
    const nextRaw  = JSON.stringify(row.data || {});

    if (localRaw === nextRaw) {                   // identical — write nothing
      markRemoteSeen(projectId, row.scope, remoteTs);
      continue;
    }
    if (localRaw != null && localClock(projectId, row.scope) > remoteTs) {
      // Local is the later write. Keep it, and send it up.
      kept++;
      markRemoteSeen(projectId, row.scope, remoteTs);
      _debouncedPush(projectId, row.scope, 250);
      continue;
    }
    // Remote wins. Keep a copy of whatever it displaces.
    if (localRaw != null && localRaw !== '{}') salvage(projectId, row.scope, localRaw);
    _applyingRemote = true;
    try { Store.rawSet(nsKey, nextRaw); } finally { _applyingRemote = false; }
    markRemoteSeen(projectId, row.scope, remoteTs, true);
    applied++;
  }
  if (applied || kept) {
    Store.notify('cloud:synced', { projectId, applied, kept });
  }
  idleSync();
  return { applied, kept };
}

// ============================================================
// PUSH ENGINE
// ============================================================
const _pushTimers = new Map();
function _debouncedPush(projectId, scope, delay) {
  if (!projectId || !scope) return;
  const k = projectId + '::' + scope;
  clearTimeout(_pushTimers.get(k));
  _pushTimers.set(k, setTimeout(() => {
    _pushTimers.delete(k);
    _pushScope(projectId, scope).catch(e => {
      console.warn('[push]', e);
      _enqueue({ kind: 'upsert', projectId, scope });
    });
  }, delay || 800));
}

async function _pushScope(projectId, scope) {
  if (!supabase || !session) {
    _enqueue({ kind: 'upsert', projectId, scope });
    idleSync();
    return;
  }
  const localKey = KEY_BY_SCOPE[scope];
  if (!localKey) return;
  const raw = Store.rawGet(localKey + '__' + projectId);
  let json = {};
  if (raw) { try { json = JSON.parse(raw); } catch (e) { json = {}; } }
  const stamp = new Date().toISOString();
  setSync(SYNC_STATES.SYNCING, 'Saving to your account…');
  const { error } = await supabase.from('project_data').upsert({
    project_id: projectId,
    scope: scope,
    data: json,
    updated_at: stamp,
    updated_by: session.user.id
  }, { onConflict: 'project_id,scope' });
  if (error) {
    console.warn('[push scope]', error);
    // The local copy is already on disk and stays there. All a failed
    // push costs is the upload, which the queue retries.
    _enqueue({ kind: 'upsert', projectId, scope });
    setSync(navigator.onLine ? SYNC_STATES.ERROR : SYNC_STATES.OFFLINE,
      navigator.onLine ? 'Saved here — could not reach your account'
                       : 'Saved here — will upload when you are back online');
    throw error;
  }
  // Both clocks now agree on the value this device just sent.
  markRemoteSeen(projectId, scope, Date.parse(stamp), true);
  idleSync();
}

async function _pushProjectMeta(project) {
  if (!supabase || !session || !project) return;

  /* UPDATE FIRST, INSERT ONLY IF ABSENT — and never send owner_id on
     the update.

     This was one upsert that always carried `owner_id: session.user.id`.
     For the owner that is a no-op. For an `edit` COLLABORATOR it is an
     attempted ownership transfer, and the `projects_guard_owner`
     trigger rejects the whole statement with 42501 — so renaming a
     shared project failed for exactly the people sharing is for, and
     the failure looked like a sync error rather than a permission one.
     See docs/SECURITY-RLS.md (P2). The trigger is right; the client was
     wrong to send the column. */
  const { data: updated, error: upErr } = await supabase
    .from('projects')
    .update({
      title: project.title,
      format: project.format,
      updated_at: project.updatedAt
    })
    .eq('id', project.id)
    .select('id');

  if (!upErr && updated && updated.length) return;

  // Nothing there (or no update rights) → try to create it as ours.
  const { error } = await supabase.from('projects').insert({
    id: project.id,
    owner_id: session.user.id,
    title: project.title,
    format: project.format,
    created_at: project.createdAt,
    updated_at: project.updatedAt
  });
  if (error) {
    console.warn('[push meta]', error);
    _enqueue({ kind: 'meta', project });
  }
}

async function _deleteProjectInCloud(projectId) {
  if (!supabase || !session) return;
  await supabase.from('projects').delete().eq('id', projectId);
}

// ============================================================
// OFFLINE QUEUE
// ============================================================
function _readQueue() {
  try { return JSON.parse(Store.rawGet(QUEUE_KEY) || '[]'); }
  catch (e) { return []; }
}
function _writeQueue(arr) {
  Store.rawSet(QUEUE_KEY, JSON.stringify(arr));
}
function _enqueue(op) {
  const q = _readQueue();
  // dedupe — drop existing same (kind, projectId, scope)
  const filtered = q.filter(o =>
    !(o.kind === op.kind &&
      o.projectId === op.projectId &&
      o.scope === op.scope &&
      JSON.stringify(o.project) === JSON.stringify(op.project))
  );
  filtered.push(Object.assign({}, op, { ts: Date.now() }));
  _writeQueue(filtered);
}
async function _flushQueue() {
  const q = _readQueue();
  if (!q.length || !supabase || !session) return;
  const remaining = [];
  for (const op of q) {
    try {
      if (op.kind === 'upsert') await _pushScope(op.projectId, op.scope);
      else if (op.kind === 'meta') await _pushProjectMeta(op.project);
      else if (op.kind === 'delete') await _deleteProjectInCloud(op.projectId);
    } catch (e) {
      remaining.push(op);
    }
  }
  _writeQueue(remaining);
  if (q.length && !remaining.length) {
    toast('Synced ' + q.length + ' offline change' + (q.length === 1 ? '' : 's'), 'success', 1800);
  }
  idleSync();
}
window.addEventListener('online',  () => { idleSync(); setTimeout(_flushQueue, 500); });
window.addEventListener('offline', () => {
  if (session) setSync(SYNC_STATES.OFFLINE, 'Offline — still saving to this device');
});
setInterval(() => { if (navigator.onLine) _flushQueue(); }, 30_000);

// ============================================================
// REALTIME
// ============================================================
function tearDownChannels() {
  _activeChannels.forEach(ch => { try { ch.unsubscribe(); } catch (e) {} });
  _activeChannels = [];
}
export async function attachToCurrentProject() {
  if (!supabase || !session) return;
  tearDownChannels();
  const pid = Store.currentProjectId();
  if (!pid) return;
  // 1. Pull latest data
  await pullProjectData(pid);
  // 2. Subscribe to changes
  const dataChannel = supabase
    .channel('pd:' + pid)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'project_data',
        filter: 'project_id=eq.' + pid },
      payload => _onRemoteData(payload))
    .subscribe();
  const commentsChannel = supabase
    .channel('cm:' + pid)
    .on('postgres_changes',
      { event: '*', schema: 'public', table: 'comments',
        filter: 'project_id=eq.' + pid },
      payload => _onRemoteComment(payload))
    .subscribe();
  _activeChannels = [dataChannel, commentsChannel];
}

function _onRemoteData(payload) {
  const row = payload.new || payload.old;
  if (!row) return;
  if (session && row.updated_by === session.user.id) return;  // self echo
  const localKey = KEY_BY_SCOPE[row.scope];
  if (!localKey) return;
  const nsKey    = localKey + '__' + row.project_id;
  const remoteTs = Date.parse(row.updated_at || '') || Date.now();
  const localRaw = Store.rawGet(nsKey);
  const nextRaw  = JSON.stringify(row.data || {});
  if (localRaw === nextRaw) return;

  // Same rule as the pull: a live edit from another device does not
  // get to overwrite a later edit made here. It loses, and this
  // device's copy goes up instead.
  if (localRaw != null && localClock(row.project_id, row.scope) > remoteTs) {
    _debouncedPush(row.project_id, row.scope, 250);
    return;
  }
  if (localRaw != null && localRaw !== '{}') salvage(row.project_id, row.scope, localRaw);
  _applyingRemote = true;
  try {
    Store.rawSet(nsKey, nextRaw);
  } finally {
    _applyingRemote = false;
  }
  markRemoteSeen(row.project_id, row.scope, remoteTs, true);
  // Re-render visible inputs if blueprint exposes a reload hook
  if (typeof window.loadAll === 'function') {
    try { window.loadAll(); } catch (e) {}
  }
  Store.notify('cloud:synced', { projectId: row.project_id, scope: row.scope });
  toast('Synced from another device.', 'info', 1800);
}
function _onRemoteComment(payload) {
  Store.notify('cloud:comment', payload);
}

// ============================================================
// SHARING
// ============================================================
function genToken() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
  // getRandomValues predates randomUUID by years and is the real floor.
  // The old fallback was two Math.random() calls and a timestamp — not a
  // CSPRNG, and its state is recoverable from a handful of outputs. A
  // share token is a bearer credential and resolve_share() answers to
  // anon, so a guessable token is a readable project.
  if (window.crypto && crypto.getRandomValues) {
    const b = new Uint8Array(16);
    crypto.getRandomValues(b);
    return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  }
  throw new Error('This browser cannot generate a secure share link.');
}

export async function createShare(projectId, role, expiresAt) {
  if (!supabase || !session) throw new Error('Sign in first.');
  const token = genToken();
  const { error } = await supabase.from('shares').insert({
    project_id: projectId,
    role: role || 'comment',
    token: token,
    expires_at: expiresAt || null,
    created_by: session.user.id
  });
  if (error) throw error;
  return token;
}
export async function listShares(projectId) {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('shares')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false });
  if (error) { console.warn('[list shares]', error); return []; }
  return data || [];
}
export async function revokeShare(shareId) {
  if (!supabase) return;
  const { error } = await supabase.from('shares').delete().eq('id', shareId);
  if (error) throw error;
}
export async function resolveShareToken(token) {
  if (!supabase) await ensureClient();
  if (!supabase) return null;
  const { data, error } = await supabase.rpc('resolve_share', { p_token: token });
  if (error) { console.warn('[resolve]', error); return null; }
  return (data && data[0]) || null;
}
export async function claimShare(token) {
  if (!supabase || !session) throw new Error('Sign in first to claim a share.');
  const { data, error } = await supabase.rpc('claim_share', { p_token: token });
  if (error) throw error;
  return (data && data[0]) || null;
}

// ============================================================
// ACCOUNT INVITES
// ------------------------------------------------------------
// An account invite is a row in `account_members` with user_id null and
// status 'pending', keyed by the email address the owner typed. Nothing
// used to turn that row into a membership: the table's own write policy
// asks whether the caller already runs the account, which an invitee by
// definition does not, and its read policy matches on user_id, which is
// null until the claim. So the invite could be created and never
// accepted. `claim_invite()` (schema section 11) is the way in.
//
// There is NO TOKEN and no invite link, deliberately — the schema
// section explains why at length. The credential is the signed-in
// email, read server-side out of auth.users. Which is why the client
// half is this small: there is nothing to carry, nothing to stash
// across the Google round trip, and nothing to strip out of the URL
// afterwards. Sign in with the address you were invited at and the
// claim succeeds; sign in with any other and it finds nothing.
//
// An empty result is the normal answer, not a failure. Almost every
// sign-in has nothing pending, so this must stay silent in that case —
// a toast on every sign-in saying "no invites" is noise, and an error
// toast would be a lie.
export async function claimInvites(accountId) {
  if (!supabase || !session) throw new Error('Sign in first to accept an invite.');
  const { data, error } = await supabase.rpc('claim_invite', {
    p_account_id: accountId || null
  });
  if (error) throw error;
  return data || [];
}

// Once per signed-in user per page load. `_invitesCheckedFor` (declared
// with the rest of the module state) holds a user id rather than a bare
// boolean, so signing out and in as somebody else re-checks rather than
// inheriting the previous person's answer.
async function handlePendingInvites() {
  if (!supabase || !session || !session.user) return;
  const uid = session.user.id;
  if (_invitesCheckedFor === uid) return;
  _invitesCheckedFor = uid;
  let claimed = [];
  try {
    claimed = await claimInvites();
  } catch (e) {
    // Includes the case where the function does not exist yet: a
    // database still on section 10 answers PGRST202. Nothing the person
    // can act on, and nothing that should interrupt a sign-in.
    console.warn('[StudioCloud] invite check skipped', e.message || e);
    return;
  }
  if (!claimed.length) return;
  for (const row of claimed) {
    toast('Joined ' + (row.account_name || 'an account') + ' as ' + row.role + '.', 'success', 3200);
  }
  // An 'owner' or 'admin' membership grants access to every project in
  // that account (has_project_access), so the studio they just joined
  // has projects in it that were invisible a second ago. A 'member'
  // membership grants none, and the pull is then a no-op.
  await pullProjectList();
}

// ============================================================
// COMMENTS
// ------------------------------------------------------------
// The thread model: one thread per (project, scope, field_key), which
// is the same `data-key` string the blueprint saves under. A comment
// hangs off a FIELD, never off a character offset — this is a form of
// several hundred inputs, not a prose document, and a field key is the
// one identifier that survives a rewrite of the value it points at.
//
// Replies are one level deep (enforced in the schema, §7.5). A
// `suggestion` carries the value it was made against (`suggest_from`)
// and the value it proposes (`suggest_to`); accepting one is a CLIENT
// act — the page writes `suggest_to` through its normal save path and
// only then marks the row accepted. The server never touches
// project_data on a comment's behalf, because then there would be two
// ways for a value to change and only one of them would be in the
// local-first save path.
//
// Every read below returns [] rather than throwing when the cloud is
// not configured. A signed-out user is not an error state in this app;
// it is the normal state.
// ============================================================
export async function listComments(projectId, scope, fieldKey) {
  if (!supabase) return [];
  let q = supabase.from('comments').select('*').eq('project_id', projectId);
  if (scope) q = q.eq('scope', scope);
  if (fieldKey) q = q.eq('field_key', fieldKey);
  const { data, error } = await q.order('created_at');
  if (error) { console.warn('[comments list]', error); return []; }
  return data || [];
}
export async function createComment(opts) {
  if (!supabase || !session) throw new Error('Sign in to comment.');
  const row = {
    project_id: opts.projectId,
    scope: opts.scope,
    field_key: opts.fieldKey,
    // Both identity columns are overwritten server-side by the
    // comments_set_author trigger; they are sent only because the
    // columns are NOT NULL and an insert has to satisfy that before
    // the trigger runs. Do not read them back from here — read the
    // returned row.
    author_id: session.user.id,
    author_name: getUserEmail() || 'Anonymous',
    body: opts.body,
    type: opts.type || 'comment',
    parent_id: opts.parentId || null,
    suggest_from: opts.suggestFrom || null,
    suggest_to: opts.suggestTo || null
  };
  const { data, error } = await supabase.from('comments').insert(row).select().single();
  if (error) throw error;
  return data;
}
export async function updateCommentStatus(id, status) {
  if (!supabase) return null;
  if (!session) throw new Error('Sign in to resolve a comment.');
  const { data, error } = await supabase
    .from('comments').update({ status }).eq('id', id).select().single();
  if (error) throw error;
  return data;
}
export async function deleteComment(id) {
  if (!supabase) return;
  if (!session) throw new Error('Sign in first.');
  const { error } = await supabase.from('comments').delete().eq('id', id);
  if (error) throw error;
}

/* What this user may do on this project: 'owner' | 'edit' | 'comment'
   | 'view' | null.

   The UI needs this to decide whether to offer ACCEPT at all, and
   asking is cheaper and more honest than guessing: an RLS denial
   arrives as a 403 in the middle of a click, which is a bad place to
   discover you were never allowed. Two reads rather than an RPC so
   nothing new has to be installed in the database.

   Note what it does NOT cover: an account owner/admin reaches the
   project through `has_project_access()`'s account branch and has no
   collaborator row, so they come back as null here and the UI treats
   them as read-only. Wrong in the conservative direction — they can
   still write, the buttons just aren't offered. A `my_project_role()`
   RPC is the proper fix. */
export async function getProjectRole(projectId) {
  if (!supabase || !session || !projectId) return null;
  const uid = session.user.id;
  const { data: own } = await supabase
    .from('projects').select('owner_id').eq('id', projectId).maybeSingle();
  if (own && own.owner_id === uid) return 'owner';
  const { data: col } = await supabase
    .from('project_collaborators')
    .select('role')
    .eq('project_id', projectId)
    .eq('user_id', uid)
    .maybeSingle();
  return (col && col.role) || (own ? 'view' : null);
}

// ============================================================
// STORE EVENT WIRE-UP
// ============================================================
Store.subscribe('saved', ({ key }) => {
  if (_applyingRemote) return;
  const scope = SCOPE_BY_KEY[key];
  if (!scope) return;
  const pid = Store.currentProjectId();
  if (!pid) return;
  // Record the clock even when signed out, as long as an account
  // exists in this browser. Otherwise a week of offline writing has
  // no timestamp to defend itself with at the next sign-in, and the
  // pull resolves every scope in the server's favour.
  if (isConfigured()) markLocalWrite(pid, scope);
  if (!session) return;  // not signed in → nothing to push to
  _debouncedPush(pid, scope);
});
Store.subscribe('current:changed', () => {
  if (session) attachToCurrentProject();
});
Store.subscribe('projects:changed', (info) => {
  if (!session) return;
  if (!info) return;
  if (info.reason === 'create' || info.reason === 'update') {
    if (info.project) _pushProjectMeta(info.project);
  } else if (info.reason === 'adopt') {
    /* Adoption from the hub control is the same operation as the
       first-sign-in prompt, performed later — so it runs the same
       function rather than a second implementation of it.
       uploadAllLocalProjects() pushes meta AND every scope, which is
       what an adopted project needs: it was created while signed out,
       so the server has never seen it or its data.

       Fire and forget with a catch, like the delete branch: a
       subscriber is synchronous, and a failed push must not take the
       local adoption down with it. The adoption already happened on
       disk and is correct there; this is the copy going up. */
    if (Array.isArray(info.projects) && info.projects.length) {
      uploadAllLocalProjects(info.projects).catch((e) => {
        console.warn('[adopt push]', e);
        setSync(navigator.onLine ? SYNC_STATES.ERROR : SYNC_STATES.OFFLINE,
                'Added here, not yet uploaded');
      });
    }
  } else if (info.reason === 'delete') {
    if (info.id) {
      _deleteProjectInCloud(info.id).catch(e => {
        _enqueue({ kind: 'delete', projectId: info.id });
      });
    }
  }
});

// ============================================================
// SHARED-LINK URL HANDLER (?share=<token>)
// ============================================================
async function handleSharedLink() {
  const params = new URLSearchParams(location.search);
  // Either it is in the URL now, or it was stashed before we sent the
  // browser off to Google and this is the trip back.
  const token = params.get('share') || takePendingShare();
  if (!token) return;
  await ensureClient();
  if (!supabase) {
    // need to configure first
    if (window.StudioUI && StudioUI.openCloudAuthModal) StudioUI.openCloudAuthModal({ shareToken: token });
    return;
  }
  const meta = await resolveShareToken(token);
  if (!meta) {
    toast('This share link is invalid.', 'error');
    return;
  }
  if (meta.is_expired) {
    toast('This share link has expired.', 'error');
    return;
  }
  if (!session) {
    // prompt sign-in then claim
    if (window.StudioUI && StudioUI.openCloudAuthModal) {
      StudioUI.openCloudAuthModal({ shareToken: token, shareMeta: meta });
    } else {
      toast('Sign in to view this shared project (' + meta.title + ').', 'info', 4000);
    }
    return;
  }
  // signed in already → claim and switch to the project
  try {
    await claimShare(token);
    // pull list + data, set current
    await pullProjectList();
    Store.setCurrentProject(meta.project_id);
    toast('Joined "' + meta.title + '" as ' + meta.role + '.', 'success', 2400);
    // strip the share param so refresh doesn't reclaim
    history.replaceState({}, '', location.pathname);
  } catch (e) {
    toast('Could not claim share: ' + (e.message || e), 'error');
  }
}

// ============================================================
// SHORT TOAST PASSTHROUGH (uses StudioUI if present)
// ============================================================
function toast(msg, type, duration) {
  if (window.StudioUI) {
    const fn = type === 'success' ? StudioUI.toastSuccess
            : type === 'error'   ? StudioUI.toastError
            : StudioUI.toastInfo;
    return fn(msg, { duration: duration || 2400 });
  }
  console.log('[StudioCloud]', msg);
}

// ============================================================
// PUBLIC API
// ============================================================
// Shape is identical to the old `window.StudioCloud` global.
const StudioCloud = {
  // config
  getCfg, setCfg, isCfgOverridden, builtInCfg,
  isConfigured: () => !!(getCfg() && getCfg().url && getCfg().key),
  isAdmin, providerToken,
  /* Read through this global by drive-sync.js, the way src/ui/auth.js
     reaches this module — importing it there would put cloud.js on
     all sixteen page entries. See ownsSync() above. */
  ownsSync,
  // auth — Google only; nothing else belongs on this line
  ensureClient,
  signInWithGoogle, signOut,
  getSession, getUser, getUserEmail,
  onAuth, isSigningIn, readRedirect, authRedirectTarget,
  // sync
  pullProjectList, pullProjectData, attachToCurrentProject,
  flushQueue: _flushQueue,
  onSyncStatus, getSyncStatus, SYNC_STATES,
  listSalvage, restoreSalvage,
  // sharing
  createShare, listShares, revokeShare, resolveShareToken, claimShare,
  // account invites
  claimInvites,
  // comments
  listComments, createComment, updateCommentStatus, deleteComment, getProjectRole,
  // misc
  SCOPE_BY_KEY, KEY_BY_SCOPE
};

// Legacy inline page scripts call this by global name; the HTML pages
// migrate later, so keep the global assignment. Assigned synchronously
// at module evaluation — exactly like the old async IIFE, whose body ran
// to this point before its first `await`.
window.StudioCloud = StudioCloud;

export const flushQueue = _flushQueue;
export { SCOPE_BY_KEY, KEY_BY_SCOPE, StudioCloud };
export default StudioCloud;

// ============================================================
// BOOT
// ============================================================
// Kept as a fire-and-forget async call rather than top-level await, so
// importing this module never blocks the importer's evaluation — the
// old file was a separate <script type="module"> and behaved the same.
async function boot() {
  // A provider bounce we can explain before the client even exists.
  if (_redirect && _redirect.error) {
    const why = _redirect.description || _redirect.error;
    cleanRedirectUrl();
    _signingIn = false;
    setSync(SYNC_STATES.ERROR, 'Sign-in was not completed');
    notifyAuth('OAUTH_ERROR', null);
    toast('Google sign-in did not complete: ' + why, 'error', 5000);
    Store.notify('cloud:auth-error', { message: why, code: _redirect.error });
    return;
  }
  if (_redirect && _redirect.pending) _signingIn = true;

  // Try to initialise the client if cfg exists; fail silently if not.
  // createClient({ detectSessionInUrl: true }) is what actually reads
  // the tokens out of the URL and turns them into a session.
  await ensureClient();

  if (_redirect && _redirect.pending) {
    _signingIn = false;
    cleanRedirectUrl();
    if (session) {
      notifyAuth('SIGNED_IN', session);
      toast('Signed in as ' + (getUserEmail() || 'your account') + '.', 'success', 2400);
    } else {
      // Tokens came back but no session survived — almost always a
      // Site URL / redirect-URL mismatch. Say so; the runbook covers it.
      setSync(SYNC_STATES.ERROR, 'Sign-in did not complete');
      notifyAuth('OAUTH_ERROR', null);
      toast('Signed in with Google, but the session did not stick. Check the Supabase Site URL and Redirect URLs.', 'error', 6000);
    }
  }

  // If signed in already (session restored), attach to current project + run migration check
  if (session) {
    /* The namespace before anything else, for the reason in
       ensureClient(). `ensureClient()` reads the stored session
       synchronously into `session` BEFORE it registers the auth
       listener, so a restored session produces no SIGNED_IN event and
       this is the only place that learns about it. A true return means
       this document loaded in the wrong namespace (first sign-in, or a
       different account last time) and a reload is on its way. */
    if (Store.setAccount(session.user.id)) return;
    await maybeMigrateLocalToCloud();
    attachToCurrentProject();
    setTimeout(_flushQueue, 1500);
    // Also on a restored session, not only on a fresh sign-in: the
    // invite may have been created while this browser already held a
    // session, and onAuthStateChange's first-sign-in branch never
    // fires on a page load that starts out signed in.
    handlePendingInvites();
  } else if (supabase) {
    /* We got as far as a client and there is no session: the stored
       account id is stale (signed out elsewhere, or a token that died
       while this browser was closed). Clear it so the next load opens
       the device's own studio.

       Only when `supabase` exists. If the cloud is not configured in
       this browser at all we cannot tell a signed-out user from an
       unreachable one, and clearing on that guess would hide an
       account's projects from the person who wrote them. */
    Store.setAccount(null, { reload: false });
  }
  idleSync();
  // Always handle ?share= if present, even before sign-in
  handleSharedLink();
}
boot();
