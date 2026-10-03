/* ============================================================
   DRIVE SYNC — this studio, in one Drive file, kept current
   ------------------------------------------------------------
   drive.js knows Drive and nothing about films. backup.js knows
   the file format and nothing about Drive. This module is the
   only place the two meet, and it owns exactly three decisions:
   WHEN to push, WHEN to pull, and WHAT TO DO when it cannot tell.

   NEVER CLOBBER A REMOTE YOU HAVE NOT SEEN.
   Last-write-wins silently destroys somebody's month of writing,
   and that is the one outcome this codebase refuses. Every push
   reads the remote's `headRevisionId` first and compares it with
   the revision this device last pulled or pushed. If they differ
   the file changed somewhere else since we last looked, and this
   module STOPS and asks. It does not merge, it does not guess,
   and it does not upload "just this once". Drive keeps revisions
   either way, so nothing is destroyed by either answer — but the
   app must not be the thing that decides silently.

   WHAT COUNTS AS A LOCAL CHANGE. `updatedAt` on each project,
   which the storage proxy already bumps on every save, against
   `syncedAt` from the last successful transfer. That is why this
   module needs no dirty flag and writes nothing on a timer: the
   clock it needs is already being kept by somebody else. (A dirty
   flag would also have been a storage write on every save, and
   the gate asserts zero writes across four idle seconds for good
   reasons.)

   ONLY ONE SYNC OWNER AT A TIME.
   cloud.js already does push-debounced/pull-realtime to Supabase.
   Two live syncs in one document is a loop: realtime pull writes
   storage, `saved` fires, Drive pushes; a Drive pull writes
   storage, `saved` fires, Supabase pushes. So when Supabase sync
   is live, Drive does NOT sync live — it falls back to manual
   backup and restore, and the settings page says so out loud.
   Supabase also carries collaboration (comments, share links,
   roles) which Drive cannot, so it is the right one to win.

   THE ONE NEW STORAGE KEY. `fms_drive_sync_v1`, holding the Drive
   file id, the revision last seen, and when. It is:
     - read and written through rawGet/rawSet, so the storage proxy
       cannot scope it to whichever project happens to be open;
     - NOT in SCOPED_KEYS — a Drive file is per device, not per film;
     - NOT in GLOBAL_KEYS — and this is the important one. That map
       is what buildBackup() walks, so a file id inside a backup
       would travel to whatever machine restored it, and THAT
       machine would then start pushing its own studio into THIS
       machine's file. Two studios, one file, each overwriting the
       other through a conflict prompt neither user asked for;
     - IS in ALL_KEYS in hub.js, so "reset everything" disconnects
       Drive. Without that, a wiped studio stays connected and the
       next keystroke pushes an empty backup over the remote. The
       Drive FILE is never deleted by anything here — reconnecting
       finds it again and offers it back.
   ============================================================ */
import Store, { rawGet, rawSet, rawRemove } from './store.js';
import { buildBackup, applyBackup, backupShape } from './backup.js';
import Drive from './drive.js';

const global = typeof window !== 'undefined' ? window : globalThis;

/** The one new key. See the header for all four registry decisions. */
export const DRIVE_STATE_KEY = 'fms_drive_sync_v1';

/* Supabase's two facts, read where they are stored, for the one
   case where cloud.js is not in the document. See ownsSync(). */
const SUPABASE_CFG_KEY = 'fms_supabase_cfg_v1';
const ACCOUNT_KEY      = 'fms_studio_account_v1';

/* A whole studio is a bigger upload than one scope, so this waits
   longer than cloud.js's 250ms. It is still a debounce on a real
   event, never a poll. */
const PUSH_DEBOUNCE_MS = 5000;

export const DRIVE_STATES = {
  OFF:      'off',       // this build has no client id, or not connected
  MANUAL:   'manual',    // connected, but Supabase owns live sync
  IDLE:     'idle',      // connected, nothing outstanding
  SYNCING:  'syncing',   // a transfer is in flight
  SYNCED:   'synced',    // last transfer succeeded
  CONFLICT: 'conflict',  // both sides changed — the user decides
  ERROR:    'error'      // last transfer failed; the work is still local
};

/* ------------------------------------------------------------
   STATE
   ------------------------------------------------------------ */
let _status  = { state: DRIVE_STATES.OFF, detail: 'Not connected' };
let _conflict = null;      // { remote, localAt } while unresolved
let _applying = false;     // echo guard, same job as cloud.js's
let _timer = null;
let _inflight = null;
const listeners = new Set();

export function onDriveStatus(cb) { listeners.add(cb); return () => listeners.delete(cb); }

export function getDriveStatus() {
  const st = readState();
  return {
    state:    _status.state,
    detail:   _status.detail,
    conflict: _conflict,
    fileId:   st.fileId || null,
    link:     st.link || null,
    revisionId: st.revisionId || null,
    syncedAt: st.syncedAt || null,
    connected: isConnected(),
    configured: Drive.isConfigured(),
    live: isConnected() && !ownsSync()
  };
}

function setStatus(state, detail) {
  _status = { state, detail };
  const snap = getDriveStatus();
  listeners.forEach((cb) => { try { cb(snap); } catch (e) { /* a listener is not a transfer */ } });
}

/* ------------------------------------------------------------
   THE STORED POINTER
   ------------------------------------------------------------ */
export function readState() {
  try { return JSON.parse(rawGet(DRIVE_STATE_KEY) || '{}') || {}; }
  catch (e) { return {}; }
}
function writeState(patch) {
  const next = Object.assign(readState(), patch);
  rawSet(DRIVE_STATE_KEY, JSON.stringify(next));
  return next;
}
export function isConnected() {
  const st = readState();
  return !!(st.enabled && st.fileId);
}

/* ------------------------------------------------------------
   WHO OWNS SYNC
   ------------------------------------------------------------ */
/**
 * Is Supabase the live sync in this document?
 *
 * The real predicate lives in cloud.js — `ownsSync()`, which is
 * `isConfigured() && session`, the same two conditions its own
 * `saved` subscriber uses to decide whether to push. It is asked,
 * never copied: a copy of "is somebody signed in" is stale the
 * moment they sign out.
 *
 * Reached through the global rather than imported, exactly as
 * src/ui/auth.js reaches it and for the same reason — and in a
 * production build it is always there, because vite.config.js folds
 * every src/lib and src/ui module into one `studio` chunk, so
 * importing anything from it evaluates cloud.js too. This is the
 * path that runs.
 *
 * The fallback is for a context where cloud.js has not evaluated.
 * It cannot be syncing THERE, so no loop is possible either way —
 * but it still answers true for a signed-in account, because what a
 * user is told must not change from page to page. Both halves it
 * reads are cloud.js's own two facts, at the keys that hold them.
 * This function can only ever turn Drive's LIVE sync off; manual
 * backup and restore stay available in every state.
 */
export function ownsSync() {
  const c = global.StudioCloud;
  if (c && typeof c.ownsSync === 'function') return !!c.ownsSync();
  return !!(rawGet(SUPABASE_CFG_KEY) && rawGet(ACCOUNT_KEY));
}

/* ------------------------------------------------------------
   CLOCKS
   ------------------------------------------------------------ */
/** The most recent local edit, across every project in every namespace. */
export function localClock() {
  let newest = null;
  Store.listAllProjects().forEach((p) => {
    const t = p.updatedAt || p.createdAt;
    if (t && (!newest || t > newest)) newest = t;
  });
  return newest;
}
function localHasWork() { return Store.listAllProjects().length > 0; }
function localChangedSinceSync() {
  const st = readState();
  const local = localClock();
  if (!local) return false;
  if (!st.syncedAt) return true;
  return local > st.syncedAt;
}

/* ------------------------------------------------------------
   TRANSFERS
   ------------------------------------------------------------ */
const serialise = (all) => JSON.stringify(all, null, 2);

/* One at a time. Two overlapping pushes would each read the head
   revision before the other wrote it, and both would pass the
   conflict check.

   The queue wraps the EXPORTED entry points only. The `_do*`
   functions below call each other directly, because a queued
   function waiting on the queue is a deadlock, not a lock. */
function queue(fn) {
  const run = () => fn();
  _inflight = (_inflight || Promise.resolve()).then(run, run);
  return _inflight;
}

function raiseConflict(remote) {
  _conflict = {
    remote: {
      modifiedTime: remote && remote.modifiedTime || null,
      revisionId:   remote && remote.headRevisionId || null
    },
    localAt: localClock()
  };
  setStatus(DRIVE_STATES.CONFLICT,
    'This backup changed somewhere else. Nothing was uploaded.');
}

/**
 * Upload. Reads the remote head FIRST and refuses if it has moved.
 * `force` is only ever reached from the user answering "keep mine"
 * out loud, never from the debounce.
 */
async function _doPush(opts) {
  opts = opts || {};
  if (!isConnected()) return { ok: false, reason: 'not-connected' };
  const st = readState();
  setStatus(DRIVE_STATES.SYNCING, 'Uploading to Drive…');
  try {
    const remote = await Drive.readMeta(st.fileId);
    if (!opts.force && remote.headRevisionId !== st.revisionId) {
      raiseConflict(remote);
      return { ok: false, reason: 'conflict' };
    }
    const out = await Drive.uploadBackup(st.fileId, serialise(buildBackup()));
    _conflict = null;
    writeState({
      revisionId: out.headRevisionId || null,
      link: out.webViewLink || st.link || null,
      syncedAt: new Date().toISOString()
    });
    setStatus(DRIVE_STATES.SYNCED, 'Backed up to Drive');
    return { ok: true };
  } catch (e) {
    setStatus(DRIVE_STATES.ERROR, errText(e));
    return { ok: false, reason: 'error', error: e };
  }
}
export function push(opts) { return queue(() => _doPush(opts)); }

/**
 * Download and apply, in RESTORE mode — an incoming project this
 * device already has replaces that project rather than arriving
 * beside it as a duplicate. Local projects the file has never
 * heard of are left alone; see backup.js.
 */
async function _doPull(opts) {
  opts = opts || {};
  if (!isConnected()) return { ok: false, reason: 'not-connected' };
  const st = readState();
  setStatus(DRIVE_STATES.SYNCING, 'Reading from Drive…');
  try {
    const remote = await Drive.readMeta(st.fileId);
    const text = opts.revisionId
      ? await Drive.downloadRevision(st.fileId, opts.revisionId)
      : await Drive.downloadBackup(st.fileId);
    const all = JSON.parse(text);
    const shape = backupShape(all);
    if (!shape.looksOurs) {
      setStatus(DRIVE_STATES.ERROR, 'That file is not a Studio backup. Nothing was changed.');
      return { ok: false, reason: 'not-a-backup' };
    }
    _applying = true;
    let res;
    try {
      res = applyBackup(all, { mode: 'restore', confirm: () => true });
    } finally { _applying = false; }
    _conflict = null;
    /* A restore FROM an older revision leaves this device holding
       something the head does not have, so it records the head it
       read rather than the revision it restored — the next push
       then goes through cleanly and the old content becomes the
       new head, which is what the user asked for. */
    writeState({
      revisionId: remote.headRevisionId || null,
      link: remote.webViewLink || st.link || null,
      syncedAt: new Date().toISOString()
    });
    setStatus(DRIVE_STATES.SYNCED, res.message || 'Restored from Drive');
    return { ok: true, result: res };
  } catch (e) {
    setStatus(DRIVE_STATES.ERROR, errText(e));
    return { ok: false, reason: 'error', error: e };
  }
}
export function pull(opts) { return queue(() => _doPull(opts)); }

function errText(e) {
  const m = (e && e.message) || String(e);
  return m.length > 160 ? m.slice(0, 157) + '…' : m;
}

/* ------------------------------------------------------------
   RECONCILE — what happens on load, and after connecting
   ------------------------------------------------------------ */
async function _doReconcile() {
  if (!isConnected()) return { ok: false, reason: 'not-connected' };
  const st = readState();
  setStatus(DRIVE_STATES.SYNCING, 'Checking Drive…');
  let remote;
  try { remote = await Drive.readMeta(st.fileId); }
  catch (e) { setStatus(DRIVE_STATES.ERROR, errText(e)); return { ok: false, did: 'error', error: e }; }

  const moved = remote.headRevisionId !== st.revisionId;
  const dirty = localChangedSinceSync();

  if (!moved && !dirty) {
    setStatus(DRIVE_STATES.SYNCED, 'Up to date');
    return { ok: true, did: 'nothing' };
  }
  if (!moved && dirty) { const r = await _doPush(); return { ok: r.ok, did: 'push', result: r }; }
  if (moved && !dirty) { const r = await _doPull(); return { ok: r.ok, did: 'pull', result: r }; }

  /* Both sides moved. This is the case the whole module exists
     for: there is no answer that is not somebody's work. */
  raiseConflict(remote);
  return { ok: false, did: 'conflict' };
}
export function reconcile() { return queue(() => _doReconcile()); }

/** The user's answer. 'mine' uploads over the remote; 'theirs' takes it. */
export function resolveConflict(choice) {
  if (choice === 'mine')   { _conflict = null; return push({ force: true }); }
  if (choice === 'theirs') { _conflict = null; return pull(); }
  return Promise.resolve({ ok: false, reason: 'unknown-choice' });
}

/* ------------------------------------------------------------
   CONNECT / DISCONNECT
   ------------------------------------------------------------ */

/**
 * Only ever from a click. Asks Google for consent, then finds the
 * app's backup file or creates it.
 *
 * A file that ALREADY EXISTS while this browser also has work is a
 * conflict on the very first connect, and it is reported as one
 * rather than resolved: two studios met and only the person who
 * wrote them knows which is which.
 */
export async function connect() {
  if (!Drive.isConfigured()) throw new Error('This build has no Google client id.');
  setStatus(DRIVE_STATES.SYNCING, 'Asking Google…');
  await Drive.getToken({ interactive: true });

  const existing = await Drive.findBackupFile();
  if (!existing) {
    const made = await Drive.createBackupFile(Drive.BACKUP_FILE_NAME, serialise(buildBackup()));
    writeState({
      enabled: true,
      fileId: made.id,
      link: made.webViewLink || null,
      revisionId: made.headRevisionId || null,
      syncedAt: new Date().toISOString()
    });
    setStatus(DRIVE_STATES.SYNCED, 'Backed up to Drive');
    return getDriveStatus();
  }

  writeState({
    enabled: true,
    fileId: existing.id,
    link: existing.webViewLink || null,
    revisionId: null,        // never seen — so reconcile cannot skip the check
    syncedAt: null
  });
  if (!localHasWork()) { await pull(); return getDriveStatus(); }
  await reconcile();
  return getDriveStatus();
}

/**
 * Stop syncing. The Drive FILE is untouched — deleting somebody's
 * only backup because they turned a switch off is not a thing this
 * app gets to do, and reconnecting finds it again.
 */
export function disconnect() {
  rawRemove(DRIVE_STATE_KEY);
  Drive.forgetToken();
  _conflict = null;
  if (_timer) { clearTimeout(_timer); _timer = null; }
  setStatus(DRIVE_STATES.OFF, 'Not connected');
  return getDriveStatus();
}

/** Earlier versions Drive is keeping of the one file. */
export async function listVersions() {
  const st = readState();
  if (!st.fileId) return [];
  return Drive.listRevisions(st.fileId);
}

/** Restore one of them, through the same applier as everything else. */
export function restoreVersion(revisionId) { return pull({ revisionId }); }

/* ------------------------------------------------------------
   THE LIVE WIRE
   ------------------------------------------------------------ */
function schedulePush() {
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => { _timer = null; push(); }, PUSH_DEBOUNCE_MS);
}

Store.subscribe('saved', () => {
  if (_applying) return;                 // our own restore writing back
  if (!isConnected()) return;
  if (!Drive.isConfigured()) return;
  if (ownsSync()) return;                // Supabase has it; see the header
  schedulePush();
});

/* ------------------------------------------------------------
   BOOT
   ------------------------------------------------------------ */
/* Fire and forget, like cloud.js's. Nothing here runs — not a
   script load, not a fetch, not a storage write — unless this
   build has a client id AND this device has connected. That is
   why importing this module costs a page nothing. */
/* SIGNING IN CONNECTS DRIVE, WITHOUT A SECOND CONSENT.
   ------------------------------------------------------------
   Sign-in asks Google for drive.file alongside the e-mail address
   (see signInWithGoogle in cloud.js), so the session comes back
   carrying a Google access token. Adopting it here means the user
   agreed once and Drive is live when they land — rather than meeting
   a second Google popup later, which reads as the app asking twice
   and which, being a popup, is the part people's browsers block.

   Deliberately quiet about failure. This runs on every sign-in, most
   of which will have nothing to adopt: a session restored from
   storage has no provider_token, because Supabase returns one on the
   sign-in response only. Nothing is broken when that happens — the
   button on the settings page still works, and the silent GIS mint
   still covers later loads, because consent was recorded against the
   same client id. So a miss is a no-op, not an error to show.

   Note what this does NOT change: once Supabase is signed in it owns
   live sync (ownsSync), so Drive connects as the BACKUP it is, writes
   its file, and stays manual. Two live syncers writing the same
   storage would echo each other forever. */
/* THE RELOAD BEATS THE CONNECT, SO THE CONNECT HAS TO SURVIVE IT.
   ------------------------------------------------------------
   adoptSignInToken() below is a fast path and cannot be the only
   one. cloud.js's auth handler calls notifyAuth() — which is where
   that runs — and then Store.setAccount(user.id), which on a FIRST
   sign-in sees the namespace change and schedules location.reload()
   on a zero timer. connect() is several Drive round trips long, so
   the reload lands first and the document dies mid-request. Nothing
   is written, nothing throws, and provider_token does not exist
   after the reload because Supabase returns it once and never
   persists it. That is precisely the silence this was debugged out
   of: Drive off, no state key, no console error.

   PERSISTING THE TOKEN WOULD BE THE WRONG FIX. drive.js keeps it in
   a module variable on purpose and the header there says why; a
   credential written to storage is the mistake this app already
   refuses for the AI key.

   So use the thing that DOES survive: the consent. Sign-in asked for
   drive.file and the user granted it, and a grant is recorded
   against the client id on Google's side, not in this page. After
   the reload GIS can mint a token silently — no popup, no prompt —
   because the consent is already there. So we simply try, once per
   document, whenever somebody is signed in and Drive is not
   connected yet.

   interactive:false is doing the safety work. A user who has never
   granted drive.file gets a rejected promise and nothing else: no
   popup, no error surfaced, no state written. So this is only ever
   an auto-connect for people who already said yes. */
let _autoConnectTried = false;

async function autoConnectIfGranted() {
  if (_autoConnectTried) return;
  if (!Drive.isConfigured() || isConnected()) return;
  const c = (typeof window !== 'undefined') && window.StudioCloud;
  if (!c || !c.getSession || !c.getSession()) return;   // only for the signed in
  _autoConnectTried = true;

  try {
    await Drive.getToken({ interactive: false });
  } catch (e) {
    /* No consent on record, or the Google session is gone. Both are
       ordinary and neither is this function's business to report —
       the button on settings.html is still there. */
    return;
  }
  try {
    await connect();
  } catch (e) {
    console.warn('[drive] auto-connect after sign-in', e);
    setStatus(DRIVE_STATES.ERROR, 'Signed in, but Drive did not connect. Try the button on Settings.');
  }
}

function adoptSignInToken(sess) {
  if (!Drive.isConfigured()) return;
  const c = (typeof window !== 'undefined') && window.StudioCloud;
  const tok = c && c.providerToken && c.providerToken();
  if (!tok) return;
  if (!Drive.adoptToken(tok, sess && sess.expires_in)) return;
  /* connect() asks Drive.getToken(), which hands back the token we
     just adopted instead of opening anything — that is the whole
     trick. If this device was already connected, there is a file
     already and reconcile is the right call, not a second create. */
  const job = isConnected() ? reconcile() : connect();
  Promise.resolve(job).catch((e) => {
    console.warn('[drive] connect after sign-in', e);
    setStatus(DRIVE_STATES.ERROR, 'Signed in, but Drive did not connect. Try the button on Settings.');
  });
}

(function boot() {
  if (!Drive.isConfigured()) { setStatus(DRIVE_STATES.OFF, 'Drive backup is not set up in this build'); return; }

  /* WIRED ON A TIMER, AND BOTH HALVES ARE LOAD-BEARING.
     ------------------------------------------------------------
     The first version read window.StudioCloud right here, at module
     evaluation, and did nothing when it was not there yet. It was not
     there yet: chrome.js imports this file, vite folds every lib
     module into one chunk, and nothing gives cloud.js an edge that
     forces it to evaluate first — so the subscription was skipped
     silently and Drive never connected after a sign-in that had
     already been granted. Measured, not theorised: the session came
     back carrying a Google token and the settings page still read
     NOT CONNECTED.

     setTimeout(0) is what fixes the ordering. Every module in the
     chunk finishes evaluating before any timer runs, so
     window.StudioCloud is assigned by then whatever the import graph
     decides.

     The second half matters as much. Subscribing only to onAuth
     assumes the event is still AHEAD of us, and after an OAuth
     redirect it usually is not — the session is read out of the URL
     during cloud.js's own boot, so SIGNED_IN can fire before anything
     here is listening. So: subscribe for next time, AND adopt
     whatever is already in hand. Either path alone leaves the common
     case broken. */
  setTimeout(() => {
    const c = (typeof window !== 'undefined') && window.StudioCloud;
    if (!c || !c.onAuth) return;
    c.onAuth((event, sess) => {
      if (event !== 'SIGNED_IN') return;
      adoptSignInToken(sess);   // fast path, when no reload intervenes
      autoConnectIfGranted();   // the one that survives the reload
    });
    /* Already signed in when we got here — the redirect case, and the
       load AFTER setAccount's reload, which is the one that actually
       completes. */
    if (c.getSession && c.getSession()) {
      adoptSignInToken(c.getSession());
      autoConnectIfGranted();
    }
  }, 0);

  if (!isConnected()) {
    setStatus(DRIVE_STATES.OFF, 'Not connected');
    /* Not awaited: boot returns, and this reports through setStatus
       like every other Drive operation. The session may not be
       restored yet, in which case this returns immediately and the
       onAuth branch above picks it up instead. */
    autoConnectIfGranted();
    return;
  }
  if (ownsSync()) {
    setStatus(DRIVE_STATES.MANUAL,
      'Cloud sync is signed in, so Drive stays a manual backup here.');
    return;
  }
  setStatus(DRIVE_STATES.IDLE, 'Connected');
  /* The silent token request, then reconcile. A failure here is
     ordinary — consent may have been revoked, or the Google
     session may be gone — so it reports and stops rather than
     throwing into the page. */
  Drive.getToken({ interactive: false })
    .then(() => reconcile())
    .catch((e) => setStatus(DRIVE_STATES.ERROR,
      'Drive needs you to sign in again. ' + errText(e)));
})();

/* Assigned for the same reason cloud.js assigns window.StudioCloud:
   a sync layer is a thing other code asks about rather than imports,
   and scripts/prove-drive.mjs drives every branch of the conflict
   logic through it against a faked Drive. Assigned synchronously at
   evaluation, like StudioCloud and StudioStore. */
global.StudioDrive = {
  DRIVE_STATE_KEY, DRIVE_STATES,
  onDriveStatus, getDriveStatus, isConnected, ownsSync,
  connect, disconnect, push, pull, reconcile, resolveConflict,
  listVersions, restoreVersion, readState, localClock
};

export default {
  DRIVE_STATE_KEY, DRIVE_STATES,
  onDriveStatus, getDriveStatus, isConnected, ownsSync,
  connect, disconnect, push, pull, reconcile, resolveConflict,
  listVersions, restoreVersion, readState, localClock
};
