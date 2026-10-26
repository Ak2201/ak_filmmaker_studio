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
import { mergeScriptRaw } from './script-merge.js';
import { mergeStoryRaw } from './story-merge.js';
import { readPrivacy, skipScope, isBudgetScope, UNKNOWN as PRIVACY_UNKNOWN } from './budget-privacy.js';
/* One constant, for the scope string, so sign-in and the Drive client
   cannot drift apart about what was consented to. drive.js imports
   nothing from here, so this is not a cycle, and vite.config folds
   every src/lib module into one chunk anyway. */
import { DRIVE_SCOPE } from './drive.js';
/* The key only; the stash and its reader are below. Shared with
   start.js, which cannot import this file. */
import { AUTH_ERROR_KEY } from './auth-scope.js';
export { AUTH_ERROR_KEY };
import { createGate, startHeartbeat, useHolder, getCodePass } from './gate.js';
import { callPort, hasPort } from './ports.js';
/* The question goes to whichever view registered 'ask' (src/ui/dialog.js);
   with no view to show it, the answer is no. */
const ask = (q) => Promise.resolve(callPort('ask', false, q));
import { bumpUsage } from './usage.js';
import { inExtension, sessionStorageAdapter, gateHolder, extensionGoogleTokens, onSessionLost } from './extension-bridge.js';

/* INSIDE THE CHROME EXTENSION (PRD FR-202) the gate's short-lived
   things move from sessionStorage/localStorage to chrome.storage.session.
   On the website both calls below are no-ops. */
if (inExtension()) useHolder(gateHolder());

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
  'fms_songs_v1':               'songs',
  'fms_story_v1':               'story',
  'fms_idea_vault_v1':          'idea_vault',
  // Post-Production. The scope names are in schema section 17 (live).
  // Before a section like this has run, Postgres refuses its upserts
  // (23514) and the rest still sync.
  'fms_edit_v1':                'edit',
  'fms_deliverables_v1':        'deliverables',
  // Schema section 24 (live since 8 Oct 2026).
  'fms_characters_v1':          'characters',
  'fms_costs_v1':               'costs',
  // Schema section 37 (live since 12 Oct 2026; the client shipped
  // first and every save answered 23514 until it ran — run the section
  // BEFORE the client names a new scope). Its value is a per-day history, so it is MERGED, not replaced: see
  // MERGE_BY_SCOPE below.
  'fms_write_goals_v1':         'write_goals'
};
const KEY_BY_SCOPE = Object.fromEntries(
  Object.entries(SCOPE_BY_KEY).map(([k, v]) => [v, k])
);

// Derived, not hand-checked: the list of scoped keys lives in store.js
// and this asks that file rather than repeating it.
/* LOCAL ONLY, ON PURPOSE — the one sanctioned exception to the rule
   above: a key with NO scope name because `project_data.scope`'s CHECK
   constraint does not list one. `fms_scene_bin_v1` (the scene bin,
   src/lib/scene-bin.js) is the one left. `fms_characters_v1` and
   `fms_costs_v1` left this set with schema section 24, and
   `fms_write_goals_v1` with section 37. */
const LOCAL_ONLY = new Set(['fms_scene_bin_v1']);

/* A scope whose value is a HISTORY (per-day entries) cannot use the
   whole-blob last-writer-wins rule below: two devices that each wrote a
   different day would have one of them erased. For these scopes the
   pull and the live handler MERGE the two copies instead.
   `fms_write_goals_v1` is { v, goal, days: { 'YYYY-MM-DD': {w0,p0,w,p} } }:
   days are unioned; a day both devices have keeps the entry that
   recorded more writing (w - w0), the remote on a tie; the goal follows
   whichever side wins the clock. Pure, and returns canonical JSON text
   (sorted days) so "did anything change" is a string comparison. */
export function mergeWriteGoals(localRaw, remoteRaw, localWins) {
  const parse = (r) => { try { const o = typeof r === 'string' ? JSON.parse(r) : r; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const L = parse(localRaw), R = parse(remoteRaw);
  const ld = L.days && typeof L.days === 'object' ? L.days : {};
  const rd = R.days && typeof R.days === 'object' ? R.days : {};
  const written = (d) => (d && Number.isFinite(d.w - d.w0)) ? d.w - d.w0 : -Infinity;
  const days = {};
  for (const k of [...new Set([...Object.keys(ld), ...Object.keys(rd)])].sort()) {
    if (!(k in ld)) days[k] = rd[k];
    else if (!(k in rd)) days[k] = ld[k];
    else days[k] = written(ld[k]) > written(rd[k]) ? ld[k] : rd[k];
  }
  const goal = (localWins ? L.goal || R.goal : R.goal || L.goal);
  const out = { v: 1, days };
  if (goal) out.goal = goal;
  return JSON.stringify(out);
}
const MERGE_BY_SCOPE = { write_goals: mergeWriteGoals };

/* The script scope merges ONLY with the co-editing switch on (§49);
   off, it is newer-wins as it always was. Its merge is three-way, so it
   needs a copy the other side is known to have built on: `_base` holds,
   per project, the script as last RECEIVED from the server, in memory.
   Never this device's own push — a writer who was offline never saw it,
   and a line added here would then read as "cut over there". A page that
   has just opened has none, and script-merge.js then never deletes a
   line (a line coming back beats a line lost). */
const _base = new Map();
const baseKey = (pid, scope) => pid + '::' + scope;
/* THE SCOPES CO-EDITING MERGES, and the list inside each whose items
   are merged by id (what salvageDropped compares). The story joined the
   script on 24 Oct 2026: the beat sheet's steps merge by id
   (src/lib/story-merge.js), behind the same switch. Off, both stay
   newer-wins exactly as before. */
const COEDIT = { script: mergeScriptRaw, story: mergeStoryRaw };
const COEDIT_ITEMS = { script: 'elements', story: 'outline' };
const coEdits = (scope) => _coEdit === true && Object.prototype.hasOwnProperty.call(COEDIT, scope);
/* WHAT THE SENDER HAD SEEN (QA round 2). The base above is never this
   device's own push, so a step added HERE and pushed was never "agreed"
   here: when the collaborator who received it deleted it, this device
   read their copy as "a step new on my side", kept it and pushed it
   back, and the two pushed each other's copy for ever. So a co-edited
   push now carries `_sync: { id, seen }` inside its data: `id` names
   this push, `seen` the push this device RECEIVED last (every arrival
   strips `_sync` before anything reads the row). An arrival whose
   sender had received exactly this device's last push was built on it,
   and that push is the base it merges against. Named, never compared
   as clocks: a stamp is an edit time, and a later stamp does not mean
   its writer saw an earlier push. An arrival without it (an older
   build, a writer who was offline and never saw the push) keeps the
   rule above: nothing this device added is read as deleted there. */
const SYNC_META = '_sync';
const _receivedId = new Map();   // baseKey -> the id of the last co-edited push RECEIVED for that scope
const _pushedCopy = new Map();   // baseKey -> { id, data }: this device's last push of a co-edited scope
const newPushId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
function unwrapRow(row) {
  const d = row && row.data;
  if (!d || typeof d !== 'object' || Array.isArray(d) || !Object.prototype.hasOwnProperty.call(d, SYNC_META)) return { data: d || {}, id: null, seen: null };
  const { [SYNC_META]: meta, ...data } = d;
  const str = (x) => (typeof x === 'string' && x ? x : null);
  return { data, id: str(meta && meta.id), seen: str(meta && meta.seen) };
}
function agreedPush(pid, scope, seen) {
  const p = _pushedCopy.get(baseKey(pid, scope));
  return p && seen && seen === p.id ? p.data : null;
}
function mergerFor(projectId, scope, seen = null) {
  if (COEDIT[scope]) {
    if (_coEdit !== true) return null;
    const merge = COEDIT[scope];
    /* `noBase` gives the arrival's own canonical form, to compare the
       merge against: merged against the base, '{}' reads every line the
       base has as cut here, and every arrival looked different. */
    return (localRaw, remote, _localWins, noBase) =>
      merge(localRaw, remote, noBase ? null
        : (agreedPush(projectId, scope, seen) || _base.get(baseKey(projectId, scope)) || receivedBase(projectId, scope, localRaw) || null));
  }
  return MERGE_BY_SCOPE[scope] || null;
}
const noteBase = (pid, scope, data, pushId) => {
  if (!COEDIT[scope]) return;
  _base.set(baseKey(pid, scope), data);
  if (pushId) _receivedId.set(baseKey(pid, scope), pushId);
};
/* AN ARRIVAL IS ABOUT TO BE READ AGAINST THE LOCAL COPY: a page with a
   keystroke still on its debounce saves it NOW (story.html listens), so
   the merge sees the stamped edit. Saved after the merge, it landed on a
   step the arrival had already deleted, and the typing was lost. */
const announceIncoming = (projectId, scope) => { try { Store.notify('cloud:incoming', { projectId, scope }); } catch (e) { /* a page's listener must not stop a sync */ } };
/* A merge that leaves out a line (or a step) this device had keeps the
   whole local copy in the salvage list first, as a replace does. */
function salvageDropped(pid, scope, localRaw, merged) {
  const list = COEDIT_ITEMS[scope];
  if (!list) return;
  try {
    const kept = new Set((JSON.parse(merged)[list] || []).map((e) => e && e.id));
    if ((JSON.parse(localRaw)[list] || []).some((e) => e && e.id && !kept.has(e.id))) salvage(pid, scope, localRaw);
  } catch (e) { /* not JSON: nothing to compare */ }
}
/* Self-echo by our OWN last push, not by user id, once co-editing is on:
   the same person on a second device is a collaborator too. Compared as
   instants: Postgres hands a timestamptz back in its own spelling. */
const _lastPushedAt = new Map();
const isOwnPush = (row) => {
  const sent = _lastPushedAt.get(baseKey(row.project_id, row.scope));
  return !!sent && Date.parse(sent) === Date.parse(row.updated_at || '');
};
const _unsynced = (Store.SCOPED_KEYS || []).filter((k) => !SCOPE_BY_KEY[k] && !LOCAL_ONLY.has(k));
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
    pending: _myQueue().length,
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
/* One sentence per closed reason. The pill, the account menu and
   invite.html all print this rather than composing their own, so the
   three cannot disagree about why sync is off. */
export function gateDetail(reason) {
  switch (reason) {
    case 'pending':     return 'Invite requested — waiting for an administrator';
    case 'declined':    return 'Invite request declined — sync is off';
    case 'disabled':    return 'This account was disabled by an administrator';
    case 'revoked':     return 'Your invite was revoked — sync is paused';
    case 'notdeployed': return 'Signed in — invites are not open yet';
    case 'unreachable': return 'Could not reach the studio to check your invite — sync paused';
    default:            return 'Signed in — awaiting an invite';
  }
}

/* The plan-limit message has to outlive the idle pass: idleSync() runs
   after every attach, flush and gate check, and used to replace "Not
   synced — plan limit reached" with "Everything is in your account"
   while the project was still only on this device. Held until a push
   to the cloud actually succeeds. */
let _planLimitHeld = false;
function idleSync() {
  const q = _myQueue().length;
  if (!session)  return setSync(SYNC_STATES.OFF, isConfigured() ? 'Signed out — local only' : 'Local only');
  if (!syncEnabled()) return setSync(SYNC_STATES.OFF, 'Cloud sync is off on this device');
  if (_gateState === 'closed') return setSync(_gateReason === 'unreachable' ? SYNC_STATES.ERROR : SYNC_STATES.OFF, gateDetail(_gateReason));
  if (_gateState === 'lost')   return setSync(SYNC_STATES.ERROR, 'Paused — this account is active on another device');
  if (_planLimitHeld) return setSync(SYNC_STATES.ERROR, 'Not synced \u2014 plan limit reached');
  if (q) {
    const waiting = q + ' change' + (q === 1 ? '' : 's') + ' waiting to upload';
    /* "Offline" only when the browser says so. A queue on a connected
       machine is either about to flush or being REFUSED, and calling
       that offline sent the owner looking at their Wi-Fi for a plan
       limit (20 Oct 2026). */
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return setSync(SYNC_STATES.OFFLINE, waiting);
    const refused = _myQueue().filter((o) => o.code);
    if (refused.length) return setSync(SYNC_STATES.ERROR, refusalSentence(refused[0].code, refused.length));
    return setSync(SYNC_STATES.IDLE, waiting);
  }
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
/* `alsoLocal` says the two copies now agree, so the local clock may
   take the remote one — but THE LOCAL CLOCK ONLY MOVES FORWARD. A push
   returns after its await; a save that landed during that flight has
   already set `local` to its own (later) time, and resetting it to the
   push's older stamp made the next push carry the newer content under
   the older time, so a collaborator's later edit beat all of it. The
   one exception is a clock in the future (skewed, or an older bad
   stamp), which is still pulled back, as before. `raw`, when given, is
   the copy the server now holds: its fingerprint lets salvage() tell a
   copy this device merely received from one with unsent work in it. */
function markRemoteSeen(pid, scope, ts, alsoLocal, raw) {
  if (!pid || !scope) return;
  const m = _readMeta();
  const row = m[_metaId(pid, scope)] || {};
  row.remote = ts || Date.now();
  if (alsoLocal && !(row.local > row.remote && row.local <= Date.now())) row.local = row.remote;
  if (raw != null) row.h = _fingerprint(raw);
  m[_metaId(pid, scope)] = row;
  _writeMeta(m);
}
/* FNV-1a over the string. Not a security hash: it only has to tell
   "the copy the server gave us" from "anything else". */
function _fingerprint(s) {
  let h = 0x811c9dc5;
  s = String(s);
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return s.length + '-' + h.toString(16);
}
/* True when `localRaw` is exactly the copy last exchanged with the
   server and nothing was written here since: replacing it loses
   nothing, so it must not take a slot in the salvage ring. Without
   this, every live arrival from a collaborator salvaged the PREVIOUS
   server copy, and about twelve of them pushed out the one offline
   copy the ring was holding. No fingerprint (older meta, a backup
   restore written raw) means unknown, and unknown is salvaged. */
function _isServerCopy(pid, scope, localRaw) {
  const row = _readMeta()[_metaId(pid, scope)];
  return !!row && row.h != null && !(row.local > row.remote) && row.h === _fingerprint(localRaw);
}
/* A BASE THAT OUTLIVES THE PAGE, for the scopes named here (the story;
   the script keeps exactly its old rule). `_base` is in memory, so a
   page that has just opened has none — and for the story that made a
   collaborator's synopsis edit read as "both changed" (a kept copy of
   your OLD text on every visit) and brought back every step they had
   deleted. `rh` fingerprints the copy last RECEIVED from the server
   (never one this device pushed: a writer who was offline never saw
   that, the reason `_base` refuses it too). While the stored copy is
   still exactly that one and nothing was written here since, it IS the
   copy both sides last agreed on, and serves as the base. */
const RECEIVED_BASE = new Set(['story']);
function markReceived(pid, scope, raw) {
  if (!RECEIVED_BASE.has(scope) || raw == null) return;
  const m = _readMeta();
  const row = m[_metaId(pid, scope)];
  if (!row) return;
  row.rh = _fingerprint(raw);
  _writeMeta(m);
}
function receivedBase(pid, scope, localRaw) {
  if (!RECEIVED_BASE.has(scope) || localRaw == null) return null;
  const row = _readMeta()[_metaId(pid, scope)];
  if (!row || row.rh == null || row.local > row.remote || row.rh !== _fingerprint(localRaw)) return null;
  try { return JSON.parse(localRaw); } catch (e) { return null; }
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
export function ownsSync() { return !!(isConfigured() && session && syncAllowed()); }

// ============================================================
// THE GATE (PRD 2.0 §4.1-4.2, schema section 13)
// ------------------------------------------------------------
// After a sign-in: is this account through the invite gate, and does
// this browser hold the account's one active session? Both answers can
// only PAUSE sync. Nothing here touches a project on this device —
// local-first is the contract, and a revoked code or a lost lock is a
// reason to stop uploading, never a reason to take somebody's work
// out of their hands. src/lib/gate.js has the full reasoning.
//
//   'unknown'  not asked yet (a decision is in flight)
//   'open'     through the gate — sync as before
//   'closed'   signed in and NOT through it — no sync. `reason` says why:
//                'noinvite'     deployed, no membership, nothing asked
//                'pending'      an invite request is waiting on an admin
//                'declined'     the request was declined
//                'disabled'     an administrator disabled this account
//                'revoked'      the membership went away mid-session
//                'notdeployed'  schema sections 13/14 have not run
//                'unreachable'  the status call failed (network); retried
//                               when the browser comes back online
//   'lost'     another device took the session — no sync until taken back
//
// IT FAILS CLOSED. It failed open — "no functions, so no gate, so
// sync as before" — and that was a studio every Google account could
// sync to, because the functions were never deployed. A gate that
// cannot be checked is shut; what the two unverifiable cases get is a
// different SENTENCE, not a different answer.
//
// THE LANDING. The first load after a sign-in that ends up closed is
// sent to invite.html, where the two routes through are offered (a
// code, or a request for an invite). ONLY that first load: a marker
// in sessionStorage is set when the sign-in begins and consumed by the
// first runGate() that sees it, so a visitor who is waiting on an
// administrator can still be on invite.html. Under the website gate
// (src/lib/sitegate.js) every OTHER page bounces a closed account back
// to invite.html, so "keep working" is no longer a route from there;
// local work is hidden from a visitor outside the gate, not deleted.
// ============================================================
const Gate = createGate(() => ensureClient());
const GATE_LANDING_KEY = 'fms_gate_landing';
let _gateState = 'unknown';
let _gateReason = '';
let _gateStatus = null;
let _heartbeat = null;
let _gateRole = '';
function syncAllowed() { return _gateState !== 'closed' && _gateState !== 'lost' && syncEnabled(); }

/* THE USER'S OWN OFF SWITCH (Settings → Account → Cloud sync).
   ------------------------------------------------------------
   `cloudSync: 'off'` inside the existing device prefs blob
   fms_studio_prefs_v1 — no new key, the same read/write shape footer.js
   uses for `branding`. Written only when the switch is clicked. It rides
   syncAllowed(), so one predicate stops every push, pull, queue flush and
   Drive hand-off (ownsSync() reads it). Local writes still stamp their
   sync clock (markLocalWrite runs before the syncAllowed check in the
   `saved` subscriber), so work done while it is off wins its argument
   when the switch comes back on. Nothing is deleted either way. */
const SYNC_PREFS_KEY = 'fms_studio_prefs_v1';
function _readSyncPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(SYNC_PREFS_KEY) || '{}');
    return p && typeof p === 'object' && !Array.isArray(p) ? p : {};
  } catch (e) { return {}; }
}
export function syncEnabled() { return _readSyncPrefs().cloudSync !== 'off'; }
export async function setSyncEnabled(on) {
  const p = _readSyncPrefs();
  if (on) delete p.cloudSync; else p.cloudSync = 'off';
  try { localStorage.setItem(SYNC_PREFS_KEY, JSON.stringify(p)); } catch (e) { /* private mode: the switch does not stick */ }
  if (!on) {
    try { tearDownChannels(); } catch (e) { /* none attached */ }
    idleSync();
    Store.notify('sync:pref', { enabled: false });
    return;
  }
  idleSync();
  Store.notify('sync:pref', { enabled: true });
  /* Catch up BOTH ways through the path sign-in already uses: attach
     pulls the server's rows (a scope whose local clock is later is kept
     and pushed by that same pass), then the queue flushes. */
  if (session && supabase && syncAllowed()) {
    try { await maybeMigrateLocalToCloud(); await attachToCurrentProject(); } catch (e) { /* idleSync below reports */ }
    _flushQueue();
  }
  idleSync();
}
function setGate(state, reason) {
  _gateState = state;
  _gateReason = state === 'closed' ? (reason || _gateReason || 'noinvite') : (reason || '');
  idleSync();
  Store.notify('gate:changed', getGateState());
}
/** { state, reason, role, status } — `status` is the last studio_status()
 *  answer (see gate.js), so a page can read the request's standing
 *  without a second round trip. */
export function getGateState() { return { state: _gateState, reason: _gateReason, role: _gateRole, status: _gateStatus }; }

/* The marker is sessionStorage, not localStorage: it is about THIS
   tab's sign-in, it must survive the reload Store.setAccount()
   schedules and the trip to Google, and it must not survive the tab.
   Private mode may refuse it, in which case the landing is skipped and
   the pill still says what is wrong. */
function markGateLanding() { try { sessionStorage.setItem(GATE_LANDING_KEY, '1'); } catch (e) { /* no landing */ } }
function takeGateLanding() {
  try { const v = sessionStorage.getItem(GATE_LANDING_KEY); if (v) sessionStorage.removeItem(GATE_LANDING_KEY); return !!v; }
  catch (e) { return false; }
}
function onInvitePage() { return /(^|\/)invite(\.html)?$/.test(location.pathname); }
function landOnInvite() {
  if (inExtension() || onInvitePage()) return;
  /* The screening room is a guest's page; never pull a guest into the
     members' doorway. */
  if (/(^|\/)screening(\.html)?$/.test(location.pathname)) return;
  /* When the site gate is installed on this page (src/lib/sitegate.js
     stamps <html data-sitegate> at evaluation) it will send a closed
     visitor to the doorway itself, on this same gate:changed. Two
     navigations to one URL in one tick is a race the browser resolves
     by aborting the first, which a harness sees as an interrupted
     navigation and a person may see as a flash. One owner. */
  if (document.documentElement.dataset.sitegate) return;
  /* THE OPEN SITE. With purchases off the gate lets any signed-in
     visitor in, and allow() may already have removed data-sitegate by
     the time this runs — so the guard above sees nothing and a member
     the site admits is walked to the doorway anyway. Ask the gate
     itself (window hook; sitegate.js imports this file, so this file
     cannot import it). */
  try {
    const sg = window.StudioSiteGate;
    if (sg && sg.evaluate && sg.evaluate().verdict === 'allow') return;
  } catch (e) { /* no answer: carry on as before */ }
  location.assign('invite.html');
}

async function askTakeover(info) {
  try {
    // The view plugs this in (src/ui/chrome.js, lazily loading gate-ui.js).
    if (!hasPort('takeoverDialog')) throw new Error('no takeover dialog');
    return await callPort('takeoverDialog', false, info);
  } catch (e) {
    return await ask('Your account is currently active in another Chrome window. '
      + 'Would you like to terminate that session and continue here?');
  }
}

function onLockLost(reason) {
  _heartbeat = null;
  tearDownChannels();
  if (reason === 'revoked') {
    _gateRole = '';
    setGate('closed', 'revoked');
    toast('Your invite has been revoked, so sync is paused. Everything on this device is still here.', 'error', 8000);
    return;
  }
  setGate('lost', 'lost');
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast('This account is now active on another device, so sync is paused here. Your work on this device is safe.', {
      type: 'error', action: 'Take over', onAction: () => { takeBack(); }
    });
  }
}

async function takeBack() {
  try {
    await Gate.takeover();
    _heartbeat = startHeartbeat(Gate, { onLost: onLockLost });
    setGate('open');
    attachToCurrentProject();
    toast('Sync resumed on this device.', 'success');
  } catch (e) {
    toast('Could not take the session back: ' + (e.message || e), 'error', 5000);
  }
}

/* A REDEEMED CODE MUST ALSO START ITS TRIAL, and this is the one place
   a trial begins without somebody pressing a button marked "start my
   trial". That is not the auto-start the owner ruled out on 12 Oct 2026:
   the visitor has just submitted a code by hand, and this is what the
   code is FOR.

   WHY IT IS NEEDED AT ALL. redeem_invite() writes the studio_members
   row but never touches trial_started_at, so with the purchases switch
   ON a code holder became a member who was not entitled — walled, on
   their first page, by the very thing the code was supposed to open.
   start_trial() reads studio_members.invite_code_id (which only
   redeem_invite() ever writes, and no browser can reach) and grants
   code_trial_days, seven days by default, instead of the signup
   trial's minutes. The client passes no source and cannot.

   Quiet in every direction: a verdict ('used', 'paid') means they
   already have something better, and a throw means the trial did not
   start — neither is a closed door, because they are already a member
   and already in. The import is lazy so billing.js stays out of the
   first paint of every page that never redeems a code.

   EXPORTED because there are THREE redemption paths and they are not
   the same code: this one, for a code HELD in the browser and spent on
   the next sign-in; the pending TICKET a signed-out code box leaves for
   runGate() to redeem on the way back from Google (missed until the
   21 Oct 2026 audit — the held-code branch is skipped once the ticket
   has made them a member); and gate-ui.js's box (and the extension
   panel's form) for somebody already signed in.
   The second was missed on the first pass and prove:gate caught it —
   a signed-in person who typed a code became a member with no trial,
   which with the purchases switch ON is a member who is not entitled. */
export async function startCodeTrial() {
  try {
    const { default: Billing } = await import('./billing.js');
    await Billing.startTrial();
  } catch (e) { /* already used, already paid, or offline: they are in regardless */ }
}

/** Resolves true when sync may run. Never throws. */
async function runGate() {
  if (!session) return false;
  const landing = takeGateLanding();
  const closed = (reason) => {
    setGate('closed', reason);
    if (landing) landOnInvite();
    return false;
  };
  let st;
  try { st = await Gate.status(); }
  catch (e) {
    /* Could not ask. Closed, not open: the writes are still clocked
       (see the `saved` subscriber) and win at the next sync, so the
       cost of a wrong "closed" is a delay, while the cost of a wrong
       "open" was the whole gate. Retried when the network returns. */
    _gateStatus = null;
    return closed('unreachable');
  }
  _gateStatus = st;
  if (!st.deployed) {
    _gateRole = '';
    return closed('notdeployed');
  }
  if ((!st.registered || st.disabled) && await Gate.hasPendingTicket()) {
    try {
      const wasRegistered = !!st.registered;
      const redeemed = await Gate.redeemPending();
      st = await Gate.status();
      _gateStatus = st;
      if (st.registered) {
        toast('Invite code accepted — your studio will sync to this account.', 'success', 4000);
        /* The third redemption path (audit, 21 Oct 2026): a code typed
           SIGNED OUT is verified into a pending ticket, and this branch
           redeems it on the way back from Google. Without the trial the
           member is registered and not entitled — and the held-code
           branch below, the one that did start it, is skipped because
           `st.registered` is now true. Only when a ticket was actually
           spent (a row back, or the status flipped to member): no
           ticket, no code, no trial. start_trial() itself refuses a
           second one, so this cannot stack. */
        if (redeemed || !wasRegistered) await startCodeTrial();
      }
    } catch (e) {
      toast(e.message || 'That invite code could not be redeemed.', 'error', 6000);
    }
  }
  /* A browser that ENTERED WITH A CODE (gate.js's code pass) and has now
     signed in: redeem that code for this account, so "come in with the
     code, sign in later to sync" is one motion rather than a second
     form. A failure here is not a closed door — the code pass still
     admits them to the site — so it is quiet; the pill says sync is
     awaiting an invite, and invite.html still offers the box. */
  const pass = getCodePass();
  if (!st.registered && !st.disabled && pass && pass.code) {
    try {
      await Gate.redeemCode(pass.code);
      st = await Gate.status();
      _gateStatus = st;
      if (st.registered) {
        toast('Your invite code is now on this account — sync is on.', 'success', 4000);
        await startCodeTrial();
      }
    } catch (e) { /* see above */ }
  }
  _gateRole = st.role || '';
  if (st.disabled) return closed('disabled');
  if (!st.registered) return closed(st.requestStatus === 'pending' ? 'pending' : st.requestStatus === 'declined' ? 'declined' : 'noinvite');

  let r = 'ok';
  try { r = await Gate.acquire(); } catch (e) { r = 'ok'; }   // lock RPC unavailable: do not block
  if (r !== 'ok' && r.conflict) {
    const take = await askTakeover(r);
    if (!take) { setGate('lost'); return false; }
    try { await Gate.takeover(); } catch (e) { setGate('lost'); return false; }
  }
  if (_heartbeat) _heartbeat.stop();
  _heartbeat = startHeartbeat(Gate, { onLost: onLockLost });
  setGate('open');
  return true;
}
export { Gate };

/* A gate closed only because the status call failed is re-asked when
   the browser says it is back. Nothing else re-runs it on its own: a
   gate closed because the answer was "no" stays closed until the
   person acts (a code, a request, an administrator). */
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    if (session && _gateState === 'closed' && _gateReason === 'unreachable') {
      runGate().then((ok) => { if (ok) attachToCurrentProject(); });
    }
  });
}

/* In the extension the service worker keeps the heartbeat even with no
   page open, and when it loses the session it has already cleared the
   credentials. A page that is open hears about it here and pauses the
   same way its own heartbeat would have. */
onSessionLost(async (reason) => {
  /* The worker has ALREADY cleared the credentials, so there is nothing
     to "take back" with: in the extension a lost session is a signed-out
     session, and the PRD routes it to the gatekeeper. Drop the copy this
     document still holds in memory (scope 'local': no network, the
     server already knows) and say why. Local work is not touched. */
  if (_heartbeat) { _heartbeat.stop(); _heartbeat = null; }
  tearDownChannels();
  session = null; _gateState = 'unknown'; _gateRole = '';
  try { if (supabase) await supabase.auth.signOut({ scope: 'local' }); } catch (e) { /* already gone */ }
  idleSync();
  notifyAuth('SIGNED_OUT', null);
  const why = reason === 'conflict' ? 'Your account was opened on another device, so this window signed out.'
            : reason === 'revoked'  ? 'Your invite was revoked, so this window signed out.'
            : 'Your session ended, so this window signed out.';
  toast(why + ' Everything on this device is still here.', 'error', 8000);
});

// ============================================================
// CLIENT INIT — loads SDK on demand
// ============================================================
/* ONE CLIENT PER DOCUMENT, even when two callers ask in the same tick.
   This used to check `if (supabase)` and then await the SDK import, so
   boot() and a page that asked for the client before boot finished
   each built one — two GoTrue clients on one storage key, which
   supabase-js warns "may produce undefined behavior" (both refresh the
   token, both fire auth events). The in-flight promise is shared now,
   and cleared on failure so a later call can try again. */
let _clientPromise = null;
export function ensureClient() {
  if (supabase) return Promise.resolve(supabase);
  if (_clientPromise) return _clientPromise;
  _clientPromise = _createClient().then((c) => { if (!c) _clientPromise = null; return c; });
  return _clientPromise;
}

async function _createClient() {
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
        /* In the extension the Supabase session — the credentials —
           lives in chrome.storage.session, never localStorage (PRD
           FR-202); see extension-bridge.js. There is no redirect to read
           a session out of there either: sign-in is launchWebAuthFlow. */
        storage: inExtension() ? sessionStorageAdapter() : undefined,
        detectSessionInUrl: !inExtension()
      },
      realtime: {
        params: { eventsPerSecond: 5 }
      }
    });
    // Restore session
    /* THE ERROR HALF WAS BEING THROWN AWAY, and it is the only place
       auth-js reports why an OAuth return did not become a session.
       `getSession()` resolves `{ data, error }`; destructuring only
       `data` turns "the provider's token was rejected", "the stored
       entry is corrupt" and "there was nothing to restore" into one
       indistinguishable `null`. A real sign-in that failed on the live
       site reported exactly nothing, and the sentence the app then
       showed the user was a guess — a wrong one, as it happened: the
       Supabase URL configuration it blamed was correct.
       Kept, surfaced through the same stash the provider errors use. */
    const { data, error: sessErr } = await supabase.auth.getSession();
    if (sessErr) {
      _sessionError = sessErr.message || String(sessErr);
      /* A refresh that failed on the NETWORK is not a sign-out: auth-js
         keeps the stored token and returns a null session, and boot()
         must not read that as "the stored account is stale". */
      _sessionErrorRetryable = !!((typeof mod.isAuthRetryableFetchError === 'function' && mod.isAuthRetryableFetchError(sessErr))
        || sessErr.name === 'AuthRetryableFetchError');
      try { console.error('[cloud] getSession:', _sessionError); } catch (e) {}
    }
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
        if (sess && wasNull && !inExtension()) markGateLanding();
        if (Store.setAccount(sess.user.id)) { idleSync(); return; }
      } else {
        /* Involuntary: a refresh token that expired while the tab sat
           open. Persist it for the next load, but do NOT reload — see
           setAccount()'s note. The deliberate signOut() path below
           asks for the reload itself. */
        Store.setAccount(null, { reload: false });
      }
      if (sess && wasNull) {
        // First time signed in this load. The gate decides first whether
        // this account may sync at all; see runGate().
        runGate().then((ok) => {
          // An account-tier invite is addressed to an email and is
          // separate from the studio's invite CODE; it is matched
          // whether or not sync is open. Idempotent per user id.
          handlePendingInvites();
          if (!ok) return;
          maybeMigrateLocalToCloud();
          attachToCurrentProject();
        });
      }
      if (!sess) {
        tearDownChannels();
        _invitesCheckedFor = null;
        if (_heartbeat) { _heartbeat.stop(); _heartbeat = null; }
        _gateState = 'unknown'; _gateRole = ''; _gateReason = ''; _gateStatus = null;
      }
      idleSync();
    });
    idleSync();
    return supabase;
  } catch (e) {
    /* KEEP THE REASON. This catch swallowed the single most useful
       sentence in the app: on 10 Oct 2026 an unrelated ReferenceError
       in the motion layer (`HEADS is not defined`) landed here, the
       client was never built, and the only symptom anyone could see
       was Google sign-in returning people to the landing page. The
       warning was in the console; nothing carried it to the user or
       to the page they were bounced to. */
    _sdkError = (e && e.message) ? e.message : String(e);
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

   Read off `session` rather than copied anywhere, so this app still
   never writes a Google credential itself.

   IT IS NOT GONE AFTER A RELOAD, WHICH THIS COMMENT USED TO CLAIM.
   Supabase documents provider_token as returned on the sign-in
   response and not persisted — and supabase-js 2.45.4 nevertheless
   writes it inside the session blob it saves to localStorage, so a
   RESTORED session still carries it. Measured on a reloaded page:
   present. drive-sync.js depends on that, because the alternative it
   was built on does not exist: GIS's token client always opens a
   popup, so there is no silent re-mint to fall back to. Both facts
   are pinned to that version; if the pin moves, re-measure. */
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
  /* `kind` matters because the two are NOT interchangeable here. The
     client is implicit (see the note above), and auth-js refuses a
     `?code=` outright in that mode — GoTrueClient: `if (flowType ===
     'implicit' && !_isImplicitGrantFlow()) return`. It returns
     quietly, so a code arriving at an implicit client produces no
     session, no error and no log line: exactly the silent bounce this
     block now exists to name. */
  if (hash.get('access_token')) return { pending: true, kind: 'implicit' };
  if (qs.get('code')) return { pending: true, kind: 'code' };
  return null;
})();

/** What the provider said when it sent the browser back here, if anything. */
export function readRedirect() { return _redirect; }

/* Whatever auth-js said when it declined to produce a session, kept so
   the failure branch can report the truth instead of a likely cause. */
let _sessionError = null;
let _sessionErrorRetryable = false;
/** Why the SDK never became a client, if it did not. */
let _sdkError = null;
export function sdkError() { return _sdkError; }
export function sessionError() { return _sessionError; }

/* WHY THE SIGN-IN DID NOT TAKE, WRITTEN SOMEWHERE THAT SURVIVES THE
   BOUNCE. Everything this file says about a failed sign-in it says in a
   toast — and a toast cannot outlive its document. The page a failed
   Google return lands on is a page the SITE GATE immediately replaces
   (`location.replace('start.html')` for a visitor with no session), so
   the explanation was destroyed, every time, a few hundred
   milliseconds after being written. The owner's report was "I sign in
   with Google and come back to the landing page" — which is precisely
   what a correct refusal and a total failure both look like when
   neither can say anything.
   sessionStorage, this tab, read-once: the same shape sitegate.js
   already uses for `fms_sitegate_why`, and for the same reason. Not
   localStorage — `npm run verify` asserts zero localStorage writes
   while idle, and a diagnostic has no business in a store that holds
   people's work. */
function stashAuthError(message, code) {
  try {
    sessionStorage.setItem(AUTH_ERROR_KEY, JSON.stringify({
      message: String(message || '').slice(0, 300),
      code: code || null,
      at: new Date().toISOString()
    }));
  } catch (e) { /* private mode: the toast is all there is */ }
}
/** Read and clear. A reason is shown once, by whoever lands first. */
export function takeAuthError() {
  try {
    const raw = sessionStorage.getItem(AUTH_ERROR_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(AUTH_ERROR_KEY);
    return JSON.parse(raw);
  } catch (e) { return null; }
}

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
  if (inExtension()) {
    // FR-201: chrome.identity opens Google's window and hands the
    // tokens back; setSession() then fires SIGNED_IN, which runs the
    // gate like any other sign-in. No page navigation happens.
    setSync(SYNC_STATES.SYNCING, 'Waiting for Google…');
    try {
      const tokens = await extensionGoogleTokens(getCfg().url, DRIVE_SCOPE);
      const { error } = await sb.auth.setSession(tokens);
      if (error) throw error;
    } catch (e) {
      setSync(SYNC_STATES.ERROR, 'Google sign-in did not complete');
      notifyAuth('SIGNED_OUT', null);
      throw e;
    } finally {
      _signingIn = false;
    }
    return;
  }
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
/* SAVE FIRST (11 Oct 2026). Before the session goes, push what has not
   reached the account — the offline queue, and the Drive backup when
   one is connected — with a 10 s cap so a dead network cannot hold the
   button hostage. Returns true to go ahead. If anything is still
   outstanding the person is asked: the queue is local and survives
   either answer, so "Sign out anyway" loses nothing from this device;
   it only means those edits reach the cloud after the next sign-in. */
const SAVE_CAP_MS = 10000;
async function saveBeforeSignOut() {
  if (!supabase || !session) return true;
  const flush = (syncAllowed() && _myQueue().length) ? _flushQueue() : Promise.resolve();
  const drive = import('./drive-sync.js').then(async (D) => {
    if (!D.isConnected()) return { ok: true };
    return D.push();
  }).catch(() => ({ ok: true }));
  let progress = null;
  try { progress = toast('Saving your projects before signing out…', 'info', SAVE_CAP_MS); } catch (e) { /* ignore */ }
  let timedOut = false;
  const cap = new Promise((r) => setTimeout(() => { timedOut = true; r(); }, SAVE_CAP_MS));
  let driveFailed = false;
  try {
    const out = await Promise.race([Promise.all([flush, drive]), cap]);
    const d = out && out[1];
    if (d && d.ok === false && d.reason === 'error') driveFailed = true;
  } catch (e) { driveFailed = true; }
  try { if (progress && progress.dismiss) progress.dismiss(); } catch (e) { /* ignore */ }
  const left = syncAllowed() ? _myQueue().length : 0;
  if (!left && !driveFailed) return true;   // (a timeout with nothing queued is fine too)
  return !!(await ask({
    title: 'Some changes have not reached the cloud',
    body: 'We could not finish saving your latest changes to your account'
      + (left ? ' (' + left + ' waiting)' : '')
      + '. They are safe on this device and will go up the next time you sign in. Sign out now, or stay signed in and try again?',
    confirm: 'Sign out anyway',
    cancel: 'Stay signed in'
  }));
}

export async function signOut() {
  if (!supabase) {
    session = null;
    Store.setAccount(null);       // may reload; nothing left to await
    idleSync();
    return;
  }
  if (!(await saveBeforeSignOut())) return false;
  if (_heartbeat) { _heartbeat.stop(); _heartbeat = null; }
  // Free the device lock now rather than in 90 seconds. Best effort,
  // and BEFORE the session goes: the RPC needs the JWT to say whose.
  await Gate.release();
  try {
    await supabase.auth.signOut();
  } catch (e) {
    console.warn('[StudioCloud] sign-out', e);
  }
  _gateState = 'unknown'; _gateRole = '';
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
  if (!session || !syncAllowed()) return;
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
  return await ask('Found ' + count + ' local project(s). Upload to your cloud account?');
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

/* ONE SERVER ROW AGAINST THE LOCAL COPY — the decision pullProjectData
   makes per scope, lifted out so a queued upsert can ask the same
   question about its own row before it sends (see _pushScope). Returns
   what happened: 'same' (identical, nothing written), 'kept' (local is
   the later write and goes up instead), 'applied' (remote won; the
   local copy was salvaged first), 'merged' / 'merged-kept' (a merged
   scope: whether the merge also differs from the server and so goes
   up), or null for a scope this build does not know. */
function _applyRemoteRow(projectId, row) {
  const localKey = KEY_BY_SCOPE[row.scope];
  if (!localKey) return null;                     // scope this build doesn't know
  const nsKey    = localKey + '__' + projectId;
  const remoteTs = Date.parse(row.updated_at || '') || 0;
  const { data: rowData, id: pushId, seen } = unwrapRow(row);
  if (coEdits(row.scope)) announceIncoming(projectId, row.scope);
  const localRaw = Store.rawGet(nsKey);
  const nextRaw  = JSON.stringify(rowData);

  const pullMerge = mergerFor(projectId, row.scope, seen);
  if (pullMerge && localRaw != null && localRaw !== '{}') {
    const localWins = localClock(projectId, row.scope) > remoteTs;
    const merged = pullMerge(localRaw, rowData, localWins);
    const remoteCanon = pullMerge('{}', rowData, false, true);
    noteBase(projectId, row.scope, rowData, pushId);
    let wrote = false;
    if (merged !== localRaw) {
      salvageDropped(projectId, row.scope, localRaw, merged);
      _applyingRemote = true;
      try { Store.rawSet(nsKey, merged); } finally { _applyingRemote = false; }
      wrote = true;
    }
    markRemoteSeen(projectId, row.scope, remoteTs, merged === remoteCanon);
    if (merged === remoteCanon) markReceived(projectId, row.scope, merged);
    if (merged !== remoteCanon) { _debouncedPush(projectId, row.scope, 250); return wrote ? 'merged-kept' : 'merged'; }
    return wrote ? 'applied' : 'same';
  }

  if (localRaw === nextRaw) {                     // identical — write nothing
    markRemoteSeen(projectId, row.scope, remoteTs);
    return 'same';
  }
  if (localRaw != null && localClock(projectId, row.scope) > remoteTs) {
    // Local is the later write. Keep it, and send it up.
    markRemoteSeen(projectId, row.scope, remoteTs);
    _debouncedPush(projectId, row.scope, 250);
    return 'kept';
  }
  // Remote wins. Keep a copy of whatever it displaces.
  if (localRaw != null && localRaw !== '{}' && !_isServerCopy(projectId, row.scope, localRaw)) salvage(projectId, row.scope, localRaw);
  _applyingRemote = true;
  try { Store.rawSet(nsKey, nextRaw); } finally { _applyingRemote = false; }
  markRemoteSeen(projectId, row.scope, remoteTs, true, nextRaw);
  markReceived(projectId, row.scope, nextRaw);
  if (coEdits(row.scope)) noteBase(projectId, row.scope, rowData, pushId);   // this copy IS the one received
  return 'applied';
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
  const scopes = [];
  for (const row of data) {
    const r = _applyRemoteRow(projectId, row);
    if (r === 'applied' || r === 'merged-kept') { applied++; scopes.push(row.scope); }
    if (r === 'kept' || r === 'merged-kept' || r === 'merged') kept++;
  }
  if (applied || kept) {
    /* `scopes` names what was WRITTEN here, so an open page holding one of
       them in memory (the Screenplay Writer's script) knows to re-read it
       rather than save its older copy over the one just pulled. */
    Store.notify('cloud:synced', { projectId, applied, kept, scopes });
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

/* ADMIN SYNC-HEALTH REPORT (schema §44, report_sync_error). When a sync
   write is REFUSED by the database for one of three reasons that mean
   "the client and the database disagree" — 23514 a CHECK (an unknown
   scope: the §37 incident), 42501 RLS, P0402 a plan limit — tell the
   console, so it can flag it. Sends the SCOPE NAME and the CODE and
   nothing else: no project id, no content, no message. Once per
   scope+code per page load (the queue retries every 30s and would
   otherwise count one fault forever), best effort, never throws, and
   honours the same opt-out as usage counting. */
const _reportedSync = new Set();
function reportSyncError(scope, code) {
  try {
    if (!supabase || !session || !/^(23514|42501|P0402)$/.test(String(code))) return;
    const k = scope + '|' + code;
    if (_reportedSync.has(k)) return;
    _reportedSync.add(k);
    if (Store.rawGet('fms_usage_optout_v1') === '1') return;
    Promise.resolve(supabase.rpc('report_sync_error', { p_scope: scope, p_code: String(code) })).catch(() => {});
  } catch (e) { /* a report must never disturb a save */ }
}

async function _pushScope(projectId, scope, opts) {
  if (!supabase || !session) {
    _enqueue({ kind: 'upsert', projectId, scope });
    idleSync();
    return;
  }
  const localKey = KEY_BY_SCOPE[scope];
  if (!localKey) return;
  /* A PRIVATE BUDGET IS NOT SHARED WITH THIS ACCOUNT (schema §55). A
     view or comment collaborator's copy of 'library' / 'costs' is not
     sent: RLS would refuse it, and the queue would ask again for ever.
     The local copy is left exactly where it is. */
  if (skipScope(_budgetPrivacy.get(projectId), scope)) {
    _dequeue((o) => o.kind === 'upsert' && o.projectId === projectId && o.scope === scope && _ownsOp(o));
    idleSync();
    return 'skipped';
  }
  const raw = Store.rawGet(localKey + '__' + projectId);
  /* A null read is not an empty document. It is a key that was never
     written, or — worse — a stub whose bytes sit in an overflow tier
     this document cannot open (store.js returns null and says
     storage:degraded). Pushing `{}` with a fresh stamp from here made
     the server's copy empty with the newest clock, and every other
     device then pulled the emptiness over its own screenplay. Nothing
     to read means nothing to say. */
  if (raw == null) return;
  let json = {};
  try { json = JSON.parse(raw); } catch (e) { return; }

  /* A QUEUED EDIT ASKS THE SERVER FIRST (audit, 21 Oct 2026). The
     upsert below is unconditional, so a tab that sat offline through
     somebody else's later edit used to come back online and overwrite
     it: the 'online' listener and the 30 s timer flush with no pull
     first, and every receiver then let the "newer" row win and
     replaced its own later copy. A queued op is late by definition, so
     it reads its own row and lets _applyRemoteRow decide exactly as a
     pull would; only a server copy OLDER than this device's edit is
     replaced. A live, debounced save is under a second old and does
     not pay for the extra read. */
  if (opts && opts.queued) {
    const { data: rows, error: readErr } = await supabase
      .from('project_data')
      .select('scope,data,updated_at')
      .eq('project_id', projectId)
      .eq('scope', scope);
    if (readErr) {
      // Could not ask: stays queued, exactly as a failed upsert would.
      _enqueue({ kind: 'upsert', projectId, scope });
      throw readErr;
    }
    const row = Array.isArray(rows) ? rows[0] : rows;
    const remoteTs = row ? (Date.parse(row.updated_at || '') || 0) : 0;
    if (row && remoteTs > localClock(projectId, scope)) {
      const r = _applyRemoteRow(projectId, row);
      if (r === 'applied' || r === 'merged-kept') Store.notify('cloud:synced', { projectId, applied: 1, kept: 0, scopes: [scope] });
      _dequeue((o) => o.kind === 'upsert' && o.projectId === projectId && o.scope === scope && _ownsOp(o));
      idleSync();
      return;
    }
  }

  /* STAMPED WITH THE EDIT, NOT THE SEND. updated_at is what every other
     device's last-write-wins compares against, and the server keeps it
     as sent (project_data_stamp forces only updated_by). Stamping the
     moment of upload made the OLDEST edit win whenever it went up late.
     The edit clock is this scope's localClock(); one in the future
     (a skewed clock, an older bad stamp) or missing falls back to now. */
  const edited = localClock(projectId, scope);
  const sentAt = Date.now();
  const stamp = new Date(edited > 0 && edited <= sentAt ? edited : sentAt).toISOString();
  _lastPushedAt.set(baseKey(projectId, scope), stamp);
  setSync(SYNC_STATES.SYNCING, 'Saving to your account…');
  /* A co-edited push names itself and what it received last (SYNC_META, above). */
  const tagged = coEdits(scope) && json && typeof json === 'object' && !Array.isArray(json);
  const pushId = tagged ? newPushId() : null;
  const sent = tagged ? { ...json, [SYNC_META]: { id: pushId, seen: _receivedId.get(baseKey(projectId, scope)) || null } } : json;
  const { error } = await supabase.from('project_data').upsert({
    project_id: projectId,
    scope: scope,
    data: sent,
    updated_at: stamp,
    updated_by: session.user.id
  }, { onConflict: 'project_id,scope' });
  if (error) {
    /* A budget scope refused by RLS may be a budget the owner has just
       made private. Ask once; if so this is "not shared with you", not
       a change to queue. */
    if (String(error.code) === '42501' && isBudgetScope(scope)) {
      const st = await budgetPrivacy(projectId, { force: true });
      if (skipScope(st, scope)) {
        _dequeue((o) => o.kind === 'upsert' && o.projectId === projectId && o.scope === scope && _ownsOp(o));
        idleSync();
        return 'skipped';
      }
    }
    console.warn('[push scope]', error);
    reportSyncError(scope, error.code);
    // The local copy is already on disk and stays there. All a failed
    // push costs is the upload, which the queue retries.
    const code = refusalCode(error);
    if (code) {
      /* Refused, not unreachable: say why, and let the queue back off. */
      _enqueue({ kind: 'upsert', projectId, scope, code });
      idleSync();
      tellRefusal(code, _myQueue().filter((o) => o.code).length);
      throw error;
    }
    _enqueue({ kind: 'upsert', projectId, scope });
    setSync(navigator.onLine ? SYNC_STATES.ERROR : SYNC_STATES.OFFLINE,
      navigator.onLine ? 'Saved here — could not reach your account'
                       : 'Saved here — will upload when you are back online');
    throw error;
  }
  // Both clocks now agree on the value this device just sent (unless a
  // save landed during the upsert, which markRemoteSeen keeps).
  markRemoteSeen(projectId, scope, Date.parse(stamp), true, raw);
  if (pushId) _pushedCopy.set(baseKey(projectId, scope), { id: pushId, data: json });
  /* The value just sent is the newest one, so a queued (perhaps refused)
     copy of this scope has nothing left to say. */
  _dequeue((o) => o.kind === 'upsert' && o.projectId === projectId && o.scope === scope && _ownsOp(o));
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
    /* P0402: the plan's project cap (schema section 16.8). Not a sync
       failure — retrying every 30 seconds would fail every 30 seconds —
       so it is NOT queued. The project stays on this device, the
       status says why, and a toast offers the plan page. The next
       successful purchase re-runs the queue, and anything saved to
       this project after that pushes with it. */
    if (error.code === 'P0402') {
      console.info('[push meta] plan limit:', error.message);
      reportSyncError('other', 'P0402');   // project meta has no scope
      bumpUsage('limit_hit');
      _planLimitHeld = true;
      setSync(SYNC_STATES.ERROR, 'Not synced \u2014 plan limit reached');
      planLimitToast(error.message);
      return;
    }
    console.warn('[push meta]', error);
    _enqueue({ kind: 'meta', project });
    /* Thrown so a queue flush knows this attempt failed and why; the
       direct caller wraps it in track(), which swallows it. */
    throw error;
  }
  /* A new project got in: the cap no longer holds this account. */
  _planLimitHeld = false;
}

/* A page that creates a project and then navigates (the hub's setup
   sheet opens the dashboard) would lose the answer to the push: the
   refusal arrives after unload, and the cap toast with it. settle()
   lets such a caller wait a moment for the in-flight meta pushes, and
   a refusal is carried to the next page in SESSION storage (the same
   tier as fms_gate_landing — it is about this tab, not the studio). */
const _inflight = new Set();
function track(p) {
  if (!p || typeof p.then !== 'function') return p;
  _inflight.add(p);
  p.finally(() => _inflight.delete(p)).catch(() => {});
  return p;
}
export function settle(ms = 3000) {
  if (!_inflight.size) return Promise.resolve();
  return Promise.race([
    Promise.allSettled([..._inflight]),
    new Promise((r) => setTimeout(r, ms))
  ]).then(() => {});
}
const PLAN_NOTICE_KEY = 'fms_plan_limit_notice';
function replayPlanLimitNotice() {
  let n = null;
  try { n = JSON.parse(sessionStorage.getItem(PLAN_NOTICE_KEY) || 'null'); sessionStorage.removeItem(PLAN_NOTICE_KEY); } catch (e) { return; }
  if (!n || !n.m || Date.now() - (n.at || 0) > 5 * 60000) return;
  _planLimitHeld = true;
  setSync(SYNC_STATES.ERROR, 'Not synced \u2014 plan limit reached');
  _planToastAt = 0;
  setTimeout(() => planLimitToast(n.m, { carry: false }), 0);
}

let _planToastAt = 0;
function planLimitToast(message, opts) {
  if (!(opts && opts.carry === false)) {
    try { sessionStorage.setItem(PLAN_NOTICE_KEY, JSON.stringify({ m: message, at: Date.now() })); } catch (e) { /* no session tier: the toast below still shows */ }
  }
  if (Date.now() - _planToastAt < 60000) return;   // once a minute, not once a keystroke
  _planToastAt = Date.now();
  /* THE NEXT PLAN AND WHAT IT COSTS THIS ACCOUNT. Which cap was hit is
     read off the server's own sentence (schema §54: "Your % plan syncs
     up to % project%", "allows % live share link%"); a collaborator cap
     is the film OWNER's plan, not this person's, so it names no plan.
     plan-gate.js (CORE, already loaded) answers with the server's quote,
     or with the plan alone when there is none — never a guessed figure. */
  const key = /^Your .* plan syncs up to/i.test(message) ? 'projects' : /^Your .* plan allows .* share link/i.test(message) ? 'shares' : '';
  if (!(window.StudioUI && StudioUI.toast)) return;
  /* The toast goes up NOW (the cap is news the moment it happens); the
     plan and the figure are added to the same toast when they arrive,
     and its button follows them to that plan's card. */
  let href = 'purchase.html';
  StudioUI.toast(message + ' This film is saved on this device.', {
    type: 'error', action: 'See plans', onAction: () => { location.href = href; }
  });
  const host = document.getElementById('toastHostAlert');
  const msgEl = host && host.lastElementChild && host.lastElementChild.querySelector('.toast-msg');
  if (!key || !msgEl) return;
  import('./plan-gate.js')
    .then((PG) => PG.quotedOffer([], { limit: key }))
    .then((o) => {
      if (!o || !msgEl.isConnected) return;
      msgEl.textContent += ' ' + (o.due ? (o.more ? 'Upgrade to ' + o.name + ' for ' + o.due + ' more.' : o.name + ' raises it, ' + o.due + ' a year.') : o.name + ' raises it.');
      href = o.href;
    }, () => { /* the plain toast stands */ });
}

async function _deleteProjectInCloud(projectId) {
  if (!supabase || !session) return;
  const { error } = await supabase.from('projects').delete().eq('id', projectId);
  if (error) throw error;
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
/* EVERY OP NAMES THE ACCOUNT THAT QUEUED IT (audit, 21 Oct 2026).
   The queue is one raw key for the whole browser and survives sign-out
   on purpose ("they will go up the next time you sign in") — which, on
   a shared browser, used to mean the next account to sign in. B's
   flush pushed A's project meta as a new project OWNED BY B and
   upserted A's screenplay into it. An op now carries `uid`, and only
   the session that owns it sends it; the rest wait for their own
   account. An op queued with no session, or written before this field
   existed, has no uid: it is sent only for a project the OPEN
   namespace can see (Store.listProjects() — never listAllProjects(),
   which spans every account on the device). A legacy delete is the
   one exception, kept as it was: its project is already gone from
   every list, and RLS lets only the owner delete. */
const _opUid = (o) => (o && typeof o.uid === 'string') ? o.uid : '';
function _ownsOp(o) {
  const me = session && session.user ? session.user.id : '';
  if (!me) return false;
  if (_opUid(o)) return _opUid(o) === me;
  if (o.kind === 'delete') return true;
  const pid = o.projectId || (o.project && o.project.id);
  return !!pid && Store.listProjects().some((p) => p.id === pid);
}
/* The part of the queue the signed-in account can send: what the status
   line counts and sign-out waits for. Signed out, the whole queue. */
function _myQueue() {
  const q = _readQueue();
  return session ? q.filter(_ownsOp) : q;
}
const _sameOp = (a, b) => a.kind === b.kind && a.projectId === b.projectId && a.scope === b.scope && _opUid(a) === _opUid(b);
function _enqueue(op) {
  const q = _readQueue();
  const uid = op.uid !== undefined ? op.uid : (session && session.user ? session.user.id : '');
  const next = Object.assign({}, op, { ts: Date.now() });
  if (uid) next.uid = uid; else delete next.uid;
  // dedupe — drop existing same (kind, projectId, scope, owner)
  const filtered = q.filter(o =>
    !(_sameOp(o, next) &&
      JSON.stringify(o.project) === JSON.stringify(next.project))
  );
  /* A refusal carries its back-off across re-queues, so saving again
     does not reset the clock and retry a known "no" at once. */
  const prev = q.find(o => _sameOp(o, next));
  if (op.code) {
    next.tries = ((prev && prev.tries) || 0) + 1;
    next.nextAt = Date.now() + BACKOFF_MS[Math.min(next.tries, BACKOFF_MS.length) - 1];
  } else if (prev && prev.code && prev.nextAt > Date.now()) {
    Object.assign(next, { code: prev.code, tries: prev.tries, nextAt: prev.nextAt });
  }
  filtered.push(next);
  _writeQueue(filtered);
}
function _dequeue(match) {
  const q = _readQueue();
  const kept = q.filter((o) => !match(o));
  if (kept.length !== q.length) _writeQueue(kept);
}

/* A REFUSAL is the server answering "no" (a Postgres or PostgREST code:
   a CHECK, RLS, a plan limit, a bad reference). A network failure has no
   such code. Only a refusal is remembered on the queued op, backed off
   and named in the status; a network failure is simply retried. */
const REFUSAL_CODE = /^(?:\d{2}[0-9A-Z]{3}|P\d{4}|PGRST\d+)$/;
function refusalCode(e) {
  const c = e && e.code != null ? String(e.code) : '';
  return REFUSAL_CODE.test(c) ? c : '';
}
/* 1 minute, 5 minutes, then every 30: a refused change is asked again
   in case the cause went away (a plan was bought, a section ran), not
   every 30 seconds for ever. */
const BACKOFF_MS = [60e3, 5 * 60e3, 30 * 60e3];
export function refusalSentence(code, n = 1) {
  const c = String(code || '');
  const many = n + ' change' + (n === 1 ? '' : 's');
  if (c === 'P0402') return 'Not synced \u2014 your plan\u2019s limit is reached (' + many + ' kept on this device)';
  if (c === '42501') return 'Not synced \u2014 this account can\u2019t write to that project (' + many + ' kept on this device)';
  if (c === '23514') return 'Not synced \u2014 the server doesn\u2019t accept this kind of change yet (' + many + ' kept on this device)';
  return 'Not synced \u2014 the server refused ' + many + ' (' + c + '); they are kept on this device';
}
let _refusalToldAt = 0;
function tellRefusal(code, n) {
  if (_refusalToldAt) return;                     // once a page load
  _refusalToldAt = Date.now();
  if (code === 'P0402') { planLimitToast('Your work is saved on this device, but your plan doesn\u2019t allow syncing it.', { carry: false }); return; }
  if (window.StudioUI && StudioUI.toast) StudioUI.toast(refusalSentence(code, n), { type: 'error' });
}

let _flushing = null;
function _flushQueue() {
  if (_flushing) return _flushing;
  _flushing = (async () => {
    try { await _flushOnce(); } finally { _flushing = null; }
  })();
  return _flushing;
}
async function _flushOnce() {
  const q = _readQueue();
  if (!q.length || !supabase || !session || !syncAllowed()) { idleSync(); return; }
  /* A project that is no longer on this device has nothing to upload
     (a delete op is the exception: it is the one that removes it). */
  const known = new Set(Store.listAllProjects().map((p) => p.id));
  const now = Date.now();
  const done = [];      // ops this pass handled, success or not
  const keep = [];      // ops to stay queued, with what was learned
  let sent = 0, refused = 0, firstCode = '';
  const me = session.user.id;
  for (let op of q) {
    if (op.kind !== 'delete' && op.projectId && !known.has(op.projectId) && !(op.project && known.has(op.project.id))) { done.push(op); continue; }
    // Another account's change: not ours to send. It waits for them.
    if (!_ownsOp(op)) { keep.push(op); done.push(op); continue; }
    /* An owner-less op this account may send is adopted by it, so the
       copy a failed push re-queues (stamped with this uid) and the one
       kept here are the same op, not two. */
    if (!_opUid(op)) { done.push(op); op = Object.assign({}, op, { uid: me }); }
    if (op.nextAt && op.nextAt > now) { keep.push(op); done.push(op); continue; }
    try {
      if (op.kind === 'upsert') {
        if (await _pushScope(op.projectId, op.scope, { queued: true }) === 'skipped') { done.push(op); continue; }
      } else if (op.kind === 'meta') await _pushProjectMeta(op.project);
      else if (op.kind === 'delete') await _deleteProjectInCloud(op.projectId);
      sent++;
      done.push(op);
    } catch (e) {
      const code = refusalCode(e);
      const tries = (op.tries || 0) + 1;
      done.push(op);
      if (code) {
        refused++; firstCode = firstCode || code;
        keep.push(Object.assign({}, op, { code, tries, nextAt: now + BACKOFF_MS[Math.min(tries, BACKOFF_MS.length) - 1] }));
      } else {
        keep.push(Object.assign({}, op, { code: undefined, tries, nextAt: undefined }));
      }
    }
  }
  /* Write back what this pass learned WITHOUT dropping anything queued
     while it ran (a push that failed re-queues itself; a new save can
     land mid-flush): entries this pass never saw are kept as they are. */
  const same = _sameOp;
  const added = _readQueue().filter((o) => !done.some((d) => same(d, o)) && !keep.some((k) => same(k, o)));
  _writeQueue(keep.concat(added));
  if (sent && !keep.some(_ownsOp) && !added.some(_ownsOp)) {
    toast('Synced ' + sent + ' waiting change' + (sent === 1 ? '' : 's'), 'success', 1800);
  }
  if (refused) tellRefusal(firstCode, keep.filter((o) => o.code && _ownsOp(o)).length);
  idleSync();
}
window.addEventListener('online',  () => { idleSync(); setTimeout(_flushQueue, 500); });
/* A queue found at load is flushed once the session is known (attach),
   and on this timer; a refused op waits out its own back-off. */
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
  if (!supabase || !session || !syncEnabled()) return;
  tearDownChannels();
  const pid = Store.currentProjectId();
  if (!pid) return;
  // 0. The co-editing switch decides how the script scope is applied.
  await coEditingEnabled();
  // 0b. Whether this film's budget is shared with this account (§55).
  await budgetPrivacy(pid, { force: true });
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

/* THE CO-EDITING SWITCH (schema §49). When it is ON the script scope
   merges a remote copy into the local one line by line
   (src/lib/script-merge.js) instead of newer-wins. Read once per page
   and kept; a missing function (§49 not run), no client or no session
   all read as OFF, which is how this database has always behaved. */
let _coEdit = null;
export async function coEditingEnabled() {
  if (_coEdit !== null) return _coEdit;
  if (!session) return false;
  try {
    const client = await ensureClient();
    if (!client) return false;
    const { data, error } = await client.rpc('co_editing_enabled');
    _coEdit = !error && data === true;
  } catch (e) { _coEdit = false; }
  return _coEdit;
}
export const coEditingKnown = () => _coEdit === true;

/* KEEP THE BUDGET PRIVATE (schema §55). budget_privacy(p_project)
   answers {private, visible, can_change} for a film this account can
   see, null for one it cannot (or one never synced), and PGRST202
   before §55 has run. src/lib/budget-privacy.js turns every one of
   those into one state; anything unknown is "not private", which is
   how the database behaved before §55. Kept in memory per film for the
   page load, refreshed on every attach and after a toggle. Never
   throws, stores nothing on disk.
   → { known, private, visible, canChange, missing } */
const _budgetPrivacy = new Map();
export async function budgetPrivacy(pid, opts) {
  if (!pid || !session) return PRIVACY_UNKNOWN;
  if (!(opts && opts.force) && _budgetPrivacy.has(pid)) return _budgetPrivacy.get(pid);
  let st = PRIVACY_UNKNOWN;
  try {
    const client = await ensureClient();
    if (client && session) st = readPrivacy(await client.rpc('budget_privacy', { p_project: pid }));
  } catch (e) { st = PRIVACY_UNKNOWN; }
  const before = _budgetPrivacy.get(pid);
  /* A FLAKY READ DOES NOT UNLOCK A KNOWN STATE. Only a real answer, or
     "the function is absent" (§55 not run), replaces what is known; a
     network error, a 5xx or a malformed reply keeps it. Otherwise one bad
     re-attach showed a viewer their stale local budget again, sent their
     budget pushes back to the 42501 path, and hid the owner's switch. */
  if (!st.known && !st.missing && before && before.known) return before;
  _budgetPrivacy.set(pid, st);
  if (!before || before.private !== st.private || before.visible !== st.visible || before.canChange !== st.canChange || before.known !== st.known) {
    Store.notify('cloud:budget-privacy', { projectId: pid, state: st });
  }
  return st;
}
/* The owner's switch. → { ok, state, error } — never throws. The
   server refuses anyone but projects.owner_id (42501); the state after
   is READ BACK rather than assumed, so the page shows what is true. */
export async function setBudgetPrivate(pid, on) {
  if (!pid || !session) return { ok: false, state: PRIVACY_UNKNOWN, error: 'signed-out' };
  let error = null;
  let set = null;
  try {
    const client = await ensureClient();
    if (!client) return { ok: false, state: PRIVACY_UNKNOWN, error: 'no-client' };
    const res = await client.rpc('set_budget_private', { p_project: pid, p_private: !!on });
    error = res && res.error ? res.error : null;
    if (!error && res && typeof res.data === 'boolean') set = res.data;
  } catch (e) { error = e; }
  if (error) console.warn('[budget privacy]', error.code || '', error.message || error);
  /* set_budget_private RETURNS the new value, and that is the truth about
     the toggle. The read-back is only for the rest of the state; when it
     fails after a successful set, the last known state is kept with the
     returned value, rather than an UNKNOWN that would hide the switch and
     report a change the server made as "nothing changed". */
  const ok = !error && set === !!on;
  let state = await budgetPrivacy(pid, { force: true });
  if (ok && !(state.known && state.private === set)) {
    const prev = _budgetPrivacy.get(pid);
    if (prev && prev.known) {
      state = Object.assign({}, prev, { private: set });
      _budgetPrivacy.set(pid, state);
      Store.notify('cloud:budget-privacy', { projectId: pid, state });
    }
  }
  return { ok, state, error: error ? String(error.code || error.message || error) : (ok ? null : 'unconfirmed') };
}

/* PRESENCE — who else has this project's screenplay open. A PRIVATE
   channel 'pr:<project id>', because presence on a public channel is
   outside RLS: anyone with the anon key and a project id could read who
   is writing. Who may join is schema §48's two policies on
   realtime.messages (the people has_project_access() lets read the
   project). Until §48 runs, the join is refused and onSync never fires:
   the page shows nobody, and nothing else changes. Kept apart from
   _activeChannels on purpose — the page that shows presence owns its
   channel (src/ui/presence.js) and leaves it on pagehide; a re-attach
   for sync must not drop it. Stores nothing.
   → { track(meta), leave() } or null when there is no session, no
     client or sync is off. */
export async function joinPresence(pid, onSync) {
  if (!pid || !session || !syncEnabled()) return null;
  let client;
  try { client = await ensureClient(); } catch (e) { return null; }
  if (!client || !session) return null;
  try { client.realtime.setAuth(session.access_token); } catch (e) { /* the SDK sets it on SIGNED_IN as well */ }
  const key = session.user.id;
  const ch = client.channel('pr:' + pid, { config: { private: true, presence: { key } } });
  let joined = false, last = null, gone = false;
  ch.on('presence', { event: 'sync' }, () => { if (!gone) { try { onSync(ch.presenceState(), key); } catch (e) { /* the page's */ } } });
  ch.subscribe((status) => {
    if (status !== 'SUBSCRIBED' || gone) return;
    joined = true;
    if (last) ch.track(last).catch(() => {});
  });
  return {
    track(meta) { last = meta; if (joined && !gone) ch.track(meta).catch(() => {}); },
    leave() {
      if (gone) return;
      gone = true;
      try { ch.untrack(); } catch (e) { /* not tracked */ }
      try { client.removeChannel(ch); } catch (e) { try { ch.unsubscribe(); } catch (err) { /* gone */ } }
    }
  };
}

function _onRemoteData(payload) {
  /* A DELETE carries no data: `new` is empty and `old` names the scope,
     so `row.data` would be undefined, `nextRaw` '{}', and the stamp
     Date.now() — newer than any local clock — which replaced the local
     blob with nothing. A project deleted in the cloud is handled by its
     own path; a row vanishing is never an edit to apply. */
  if (payload && payload.eventType === 'DELETE') return;
  const row = payload.new || payload.old;
  if (!row || !row.scope) return;
  if (session && row.updated_by === session.user.id) {          // self echo
    // …or this person on another device, which co-editing merges.
    if (!coEdits(row.scope)) return;
    if (isOwnPush(row)) return;
  }
  const localKey = KEY_BY_SCOPE[row.scope];
  if (!localKey) return;
  const nsKey    = localKey + '__' + row.project_id;
  const remoteTs = Date.parse(row.updated_at || '') || Date.now();
  const { data: rowData, id: pushId, seen } = unwrapRow(row);
  if (coEdits(row.scope)) announceIncoming(row.project_id, row.scope);
  const localRaw = Store.rawGet(nsKey);
  const nextRaw  = JSON.stringify(rowData);
  if (localRaw === nextRaw) return;

  const merge = mergerFor(row.project_id, row.scope, seen);
  if (merge && localRaw != null && localRaw !== '{}') {
    const merged = merge(localRaw, rowData, localClock(row.project_id, row.scope) > remoteTs);
    const remoteCanon = merge('{}', rowData, false, true);
    noteBase(row.project_id, row.scope, rowData, pushId);
    if (merged !== localRaw) {
      salvageDropped(row.project_id, row.scope, localRaw, merged);
      _applyingRemote = true;
      try { Store.rawSet(nsKey, merged); } finally { _applyingRemote = false; }
      Store.notify('cloud:synced', { projectId: row.project_id, scope: row.scope });
    }
    markRemoteSeen(row.project_id, row.scope, remoteTs, merged === remoteCanon);
    if (merged === remoteCanon) markReceived(row.project_id, row.scope, merged);
    if (merged !== remoteCanon) _debouncedPush(row.project_id, row.scope, 250);
    return;
  }

  // Same rule as the pull: a live edit from another device does not
  // get to overwrite a later edit made here. It loses, and this
  // device's copy goes up instead.
  if (localRaw != null && localClock(row.project_id, row.scope) > remoteTs) {
    _debouncedPush(row.project_id, row.scope, 250);
    return;
  }
  if (localRaw != null && localRaw !== '{}' && !_isServerCopy(row.project_id, row.scope, localRaw)) salvage(row.project_id, row.scope, localRaw);
  _applyingRemote = true;
  try {
    Store.rawSet(nsKey, nextRaw);
  } finally {
    _applyingRemote = false;
  }
  markRemoteSeen(row.project_id, row.scope, remoteTs, true, nextRaw);
  markReceived(row.project_id, row.scope, nextRaw);
  if (coEdits(row.scope)) noteBase(row.project_id, row.scope, rowData, pushId);   // this copy IS the one received
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
  bumpUsage('share_created');   // a name only (src/lib/usage.js)
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
  // Gate closed or lock lost: the clock above is still recorded, so
  // this write wins its argument at the next sync rather than losing it.
  if (!syncAllowed()) return;
  _debouncedPush(pid, scope);
});
Store.subscribe('current:changed', () => {
  if (session && syncAllowed()) attachToCurrentProject();
});
Store.subscribe('projects:changed', (info) => {
  if (!session || !syncAllowed()) return;
  if (!info) return;
  if (info.reason === 'create' || info.reason === 'update') {
    if (info.project) track(_pushProjectMeta(info.project));
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

/* DELETE THE CLOUD COPIES OF EVERY PROJECT THIS ACCOUNT OWNS.
   ------------------------------------------------------------
   Owner-chosen (11 Oct 2026). Account, plan, purchases and invoices
   stay; projects the user merely collaborates on are not theirs to
   delete and are never selected (owner_id filter, on top of RLS
   proj_delete = owner only). project_data cascades from projects, but
   its rows are deleted first and explicitly so a failure is reported
   per project rather than hidden in a cascade. Local copies are NOT
   touched. Sync is paused FIRST: otherwise the next keystroke would
   re-create the rows that were just deleted. No schema change needed:
   pd_write is FOR ALL (covers DELETE) for anyone with edit access,
   proj_delete allows the owner, and project_data.project_id is
   ON DELETE CASCADE.
   @returns {Promise<{ok:boolean, deleted:number, failed:{id:string,error:string}[]}>} */
export async function deleteOwnedCloudProjects() {
  const sb = await ensureClient();
  if (!sb || !session) throw new Error('Sign in to delete your cloud projects.');
  const uid = session.user.id;
  await setSyncEnabled(false);
  const { data, error } = await sb.from('projects').select('id').eq('owner_id', uid);
  if (error) return { ok: false, deleted: 0, failed: [{ id: '*', error: error.message || String(error) }] };
  let deleted = 0;
  const failed = [];
  for (const row of data || []) {
    const d1 = await sb.from('project_data').delete().eq('project_id', row.id);
    if (d1.error) { failed.push({ id: row.id, error: d1.error.message || String(d1.error) }); continue; }
    const d2 = await sb.from('projects').delete().eq('id', row.id).eq('owner_id', uid);
    if (d2.error) failed.push({ id: row.id, error: d2.error.message || String(d2.error) });
    else deleted++;
  }
  Store.notify('projects:changed', { reason: 'cloud-delete' });
  return { ok: failed.length === 0, deleted, failed };
}

// ============================================================
// PUBLIC API
// ============================================================
// Shape is identical to the old `window.StudioCloud` global.
const StudioCloud = {
  // config
  getCfg, setCfg, isCfgOverridden, builtInCfg,
  isConfigured: () => !!(getCfg() && getCfg().url && getCfg().key),
  isBooted,
  isAdmin, providerToken,
  /* Read through this global by drive-sync.js, the way src/ui/auth.js
     reaches this module — importing it there would put cloud.js on
     all sixteen page entries. See ownsSync() above. */
  ownsSync, syncEnabled, setSyncEnabled,
  // auth — Google only; nothing else belongs on this line
  ensureClient,
  signInWithGoogle, signOut, startCodeTrial,
  getSession, getUser, getUserEmail,
  onAuth, isSigningIn, readRedirect, sessionError, sdkError, authRedirectTarget,
  // sync
  /* coEditingKnown was exported but missing here, so a page asking
     window.StudioCloud (screenplay.js, story.js) always read the switch
     as OFF; prove:presence faked it onto this object and never saw. */
  pullProjectList, pullProjectData, attachToCurrentProject, deleteOwnedCloudProjects, joinPresence, coEditingEnabled, coEditingKnown,
  budgetPrivacy, setBudgetPrivate,
  flushQueue: _flushQueue,
  onSyncStatus, getSyncStatus, SYNC_STATES, settle,
  listSalvage, restoreSalvage,
  // sharing
  createShare, listShares, revokeShare, resolveShareToken, claimShare,
  // account invites
  claimInvites,
  // the studio gate (schema section 13): invite codes, device lock, admin
  gate: Gate, getGateState, gateDetail, runGate, takeBack,
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
/* Is a supabase-js session sitting in localStorage? Read without the
   SDK: its key is `sb-<project-ref>-auth-token` (optionally chunked as
   `.0`, `.1`), and the project ref depends on the configured URL, so
   match the shape rather than rebuild the name. Storage that throws
   answers "yes" — loading the SDK is the safe error. */
function hasStoredSession() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && /^sb-.+-auth-token(\.\d+)?$/.test(k)) return true;
    }
    return false;
  } catch (e) { return true; }
}

async function boot() {
  replayPlanLimitNotice();
  // A provider bounce we can explain before the client even exists.
  if (_redirect && _redirect.error) {
    const why = _redirect.description || _redirect.error;
    cleanRedirectUrl();
    _signingIn = false;
    setSync(SYNC_STATES.ERROR, 'Sign-in was not completed');
    notifyAuth('OAUTH_ERROR', null);
    toast('Google sign-in did not complete: ' + why, 'error', 5000);
    stashAuthError(why, _redirect.error);
    Store.notify('cloud:auth-error', { message: why, code: _redirect.error });
    /* AND STILL BOOT. This used to `return` here, which read as
       tidy and was not: sitegate.js waits for `cloud:booted` before it
       decides anything, so a provider error left the gate waiting for
       an event that would never come. The page stayed behind the
       veil — blank — for the full GIVE_UP_MS of twenty seconds, and
       was then thrown out on `timeout`, which is the one verdict that
       means "the gate broke", not "you are not allowed in".
       Falling through costs nothing: there is no session to restore
       (that is what the error says), so boot does its ordinary
       signed-out work and the gate decides in milliseconds. */
  }
  if (_redirect && _redirect.pending) _signingIn = true;

  // Try to initialise the client if cfg exists; fail silently if not.
  // createClient({ detectSessionInUrl: true }) is what actually reads
  // the tokens out of the URL and turns them into a session.
  //
  // ...but only when there is something for it to restore. The SDK is
  // ~98KB and nearly every visitor is signed out, so boot loads it only
  // for a stored session, an OAuth redirect in the URL (handled above:
  // `_redirect.pending`), or the extension (whose session is not in
  // localStorage). Everything else that needs a client — a sign-in
  // click, the invite-code check, a share link, billing, Drive — calls
  // ensureClient() itself. The gate still fails closed: with no session
  // `getSession()` is null, which the site gate reads as signed out.
  const _needClient = inExtension() || (_redirect && _redirect.pending) || hasStoredSession();
  if (_needClient) await ensureClient();
  else cfg = getCfg();

  if (_redirect && _redirect.pending) {
    _signingIn = false;
    cleanRedirectUrl();
    if (session) {
      /* Back from Google. Store.setAccount() below may reload this
         document into the account's namespace before the gate is
         asked, so the landing is marked NOW and consumed by whichever
         load runs runGate(). */
      markGateLanding();
      notifyAuth('SIGNED_IN', session);
      toast('Signed in as ' + (getUserEmail() || 'your account') + '.', 'success', 2400);
    } else {
      /* Back from Google, and nothing survived. Two different faults
         land here and they used to share one sentence, which is why
         neither was ever diagnosed from a user's report:

           kind 'code'     — the provider returned `?code=`, and this
                             client is implicit, so auth-js declined to
                             exchange it and said nothing. That is a
                             configuration mismatch between the project
                             and this build, not a user error, and no
                             amount of trying again will fix it.
           kind 'implicit' — real tokens arrived and did not become a
                             session: almost always a Site URL /
                             redirect-URL mismatch. The runbook covers
                             it, and trying again is reasonable. */
      const codeFlow = _redirect.kind === 'code';
      /* auth-js's own words first, when it gave any. */
      /* The truth, in the order it is worth hearing. A client that
         never got built is not a Supabase misconfiguration, and
         saying so sent one investigation to the dashboard for
         nothing. */
      const said = _sdkError
        ? ' The app could not start its connection to the server: ' + _sdkError
        : (_sessionError ? ' auth-js said: ' + _sessionError : '');
      const why = codeFlow
        ? 'This project returned an authorisation code, which this build cannot exchange '
          + '(its Supabase client uses the implicit flow). Nothing you do differently will '
          + 'change that — see docs/GOOGLE-AUTH.md.'
        : 'Google signed you in, but this browser could not turn that into a session.';
      setSync(SYNC_STATES.ERROR, 'Sign-in did not complete');
      notifyAuth('OAUTH_ERROR', null);
      stashAuthError(why + said, codeFlow ? 'code_flow_mismatch' : 'no_session');
      toast('Sign-in did not complete. ' + why + said, 'error', 6000);
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
    // The gate, on the restored path too — the redirect back from
    // Google is a page load that STARTS signed in, which is exactly
    // where a pending invite ticket gets redeemed.
    const open = await runGate();
    if (open) {
      await maybeMigrateLocalToCloud();
      attachToCurrentProject();
      setTimeout(_flushQueue, 1500);
    }
    // Also on a restored session, not only on a fresh sign-in: the
    // invite may have been created while this browser already held a
    // session, and onAuthStateChange's first-sign-in branch never
    // fires on a page load that starts out signed in.
    handlePendingInvites();
  } else if (supabase || (!_needClient && cfg && cfg.url && cfg.key)) {
    /* We got as far as a client (or, with nothing stored to restore, as
       far as knowing one is configured) and there is no session: the stored
       account id is stale (signed out elsewhere, or a token that died
       while this browser was closed). Clear it so the next load opens
       the device's own studio.

       Only when `supabase` exists. If the cloud is not configured in
       this browser at all we cannot tell a signed-out user from an
       unreachable one, and clearing on that guess would hide an
       account's projects from the person who wrote them.

       AND NOT WHEN THE NULL MEANS "UNREACHABLE" (audit, 21 Oct 2026).
       A built client is not proof of a sign-out: on set with no
       signal, an access token over an hour old makes getSession()
       try a refresh, which fails with AuthRetryableFetchError, and
       auth-js answers `{ session: null }` while KEEPING the token. The
       site gate's offline grace (graceOk) admits that visitor — and
       clearing here then opened the device's own studio on the next
       page, hid every `ns:[uid]` project, and put whatever they wrote
       offline outside the account. A definite end (a refused refresh,
       a revoked session) is non-retryable, and auth-js removes the
       token for it, so it still lands below. */
    const unreachable = _sessionErrorRetryable
      || (typeof navigator !== 'undefined' && navigator.onLine === false);
    if (!unreachable) Store.setAccount(null, { reload: false });
  }
  idleSync();
  // Always handle ?share= if present, even before sign-in
  handleSharedLink();
  /* The site gate (src/lib/sitegate.js) cannot tell "signed out" from
     "not asked yet" without this: `session` is null in both states. It
     is announced LAST, after the restored session (if any) has been
     through runGate(), so a subscriber that decides on it sees the
     settled answer and not an in-flight one. */
  _booted = true;
  Store.notify('cloud:booted', { session: !!session });
}
let _booted = false;
/** True once boot() has restored (or failed to restore) a session. */
export function isBooted() { return _booted; }
boot();
