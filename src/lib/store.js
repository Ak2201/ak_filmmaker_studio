/* ============================================================
   THE FILMMAKER'S STUDIO — PROJECT STORE  (ES module port)
   ------------------------------------------------------------
   Ported from studio-store.js. Behaviour, storage keys and bus
   event names are unchanged. Adds:
     1. A multi-project model (was single-project before)
     2. Per-project namespaced localStorage (legacy keys auto-suffix)
     3. A subscribe/notify bus for cross-field cascading
     4. One-time migration of existing single-project data
     5. A preamble (`init()` → `installStorageProxy()`) that makes all
        legacy `localStorage.getItem('fms_…')` calls transparently
        scope to the current project — no other code changes needed.
     6. An ACCOUNT dimension on top of the project one, which renames
        no key: see the ACCOUNT NAMESPACE section below, and
        docs/STORAGE-MODEL.md. Signed out is exactly what it always
        was; signed in sees one account's projects.

   ⚠️  LOAD ORDER — READ THIS BEFORE IMPORTING ANYTHING ELSE  ⚠️
   ------------------------------------------------------------
   `installStorageProxy()` monkey-patches `Storage.prototype`, and
   every other module in the app assumes that patch is already in
   place when it touches localStorage. As a plain <script> this was
   guaranteed by tag order; as a module it is guaranteed by IMPORT
   ORDER instead — ES modules evaluate depth-first in import order.

   Therefore:
     • Every page entry point MUST import this module (directly or
       transitively) BEFORE any module that reads localStorage.
       Put `import './lib/store.js'` (or an import of a module that
       itself imports it first) at the TOP of the entry file.
     • src/ui/chrome.js and src/lib/cloud.js import this module
       explicitly for exactly this reason — do not remove those
       imports "because the symbol is unused".
     • `init()` is called at module evaluation time (bottom of this
       file), same as the old file's auto-init block. Importing this
       module is enough; callers do not need to call init().
   ============================================================ */

// The shared chrome CSS that this module used to inject at runtime.
// Imported (not injected) so it participates in the build — see
// injectSharedStyles() below.
import '../styles/chrome-injected.css';

const global = typeof window !== 'undefined' ? window : globalThis;

// ============================================================
// CONSTANTS
// ============================================================
const PROJECTS_KEY        = 'fms_studio_projects_v1';     // array of project meta
const CURRENT_KEY         = 'fms_studio_current_project_v1'; // string projectId
const SCHEMA_VERSION_KEY  = 'fms_studio_schema_v1';       // for future migrations

/* WHICH ACCOUNT THIS DEVICE IS SIGNED INTO — the second dimension.
   See the ACCOUNT NAMESPACE section below for the whole design. The
   value is a Supabase user id, or absent for "signed out". Absent is
   the normal state and is not an error. */
const ACCOUNT_KEY         = 'fms_studio_account_v1';

// Legacy per-blueprint keys that should be project-scoped.
// Anything in this list gets auto-suffixed with `__<projectId>`
// when read or written through the storage proxy.
const SCOPED_KEYS = [
  'fms_filmmaker_combined_v1',
  'fms_shortfilm_blueprint_v1',
  'fms_library_calc_v1',
  'fms_filmmaker_prefs_v1',
  'fms_shortfilm_prefs_v1',
  'fms_library_prefs_v1',
  'fms_studio_activity_v1',
  'fms_scenes_v1',
  'fms_contacts_v1',
  'fms_shots_v1',
  'fms_script_v1',
  'fms_locations_v1',
  'fms_workbench_v1',
  'fms_dissect_v1',
  'fms_festivals_v1'
  // intentionally NOT scoped: fms_studio_prefs_v1 (dark mode = global),
  //                            fms_supabase_cfg_v1 (account-level),
  //                            fms_note_* (per-field notes, fine global for now)
];

const FORMATS = ['feature', 'short', 'documentary', 'musicvideo', 'adfilm'];

// ============================================================
// INTERNAL: low-level localStorage access (BEFORE proxy)
// ============================================================
// We capture the original methods so the proxy can call through.
const _origGet    = global.localStorage.getItem.bind(global.localStorage);
const _origSet    = global.localStorage.setItem.bind(global.localStorage);
const _origRemove = global.localStorage.removeItem.bind(global.localStorage);

export function rawGet(k)    { try { return _origGet(k); } catch (e) { return null; } }
export function rawSet(k, v) { try { _origSet(k, v); return true; } catch (e) { return false; } }
export function rawRemove(k) { try { _origRemove(k); return true; } catch (e) { return false; } }

export function jsonGet(k, fallback) {
  const raw = rawGet(k);
  if (raw == null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
export function jsonSet(k, v) { return rawSet(k, JSON.stringify(v)); }

/* ============================================================
   ACCOUNT NAMESPACE — the second dimension
   ------------------------------------------------------------
   This file already had ONE dimension: a scoped key is suffixed
   `__<projectId>`. An account is the second, and the whole design
   below exists to add it WITHOUT RENAMING A SINGLE EXISTING KEY.

   WHY NO RENAME. Every `fms_*` string is a contract with saved work
   (CLAUDE.md invariant 1). The prefix rename cost 137 literals, a
   five-property migration and a seeded pre-rename studio to prove it.
   A second such pass, to bolt an account id onto 15 scoped key names,
   would put every existing user's months of writing through that risk
   again for no gain — because the id in `__<projectId>` is ALREADY
   unique per project, and a project belongs to one namespace.

   SO THE NAMESPACE IS A PROPERTY OF THE PROJECT, NOT OF THE KEY.
   The single projects list at `fms_studio_projects_v1` keeps its key
   and its shape (an array of meta objects); each entry gains one
   additive field, `ns`, listing the namespaces it is visible in:

       ns absent  or  ns: ['']        this device, signed out
       ns: ['', '<uid>']              this device AND that account
       ns: ['<uid>']                  that account only (came from the cloud)

   `listProjects()` filters on the current namespace, so signing in
   changes which projects you can SEE, and therefore which project ids
   exist to be suffixed — and data separation follows from that,
   through key strings that are byte-identical to today's.

     • SIGNED OUT is the device namespace and is EXACTLY today's app:
       same list key, same pointer key, same `__<projectId>` blobs, no
       login wall, no migration, nothing moved.
     • SIGNED IN shows that account's projects only. Two accounts
       cannot see each other's work because no project entry can ever
       carry two account ids: `createProject` stamps one namespace,
       and adoption (below) only touches device-ONLY entries. The one
       way an id reaches two accounts is the server saying so — a
       claimed share — which is what sharing means.
     • EXISTING LOCAL WORK IS NEVER MOVED. Signing in does not take a
       device project away; `adoptDeviceProjects()` ADDS the account to
       its `ns`, so the same project (and the same single copy of its
       data — one representation per thing) is reachable both signed in
       and signed out.

   THE POINTER is the one thing that must differ per namespace, or
   signing in would leave "current project" aimed at a project you
   cannot see. The bare `fms_studio_current_project_v1` stays the
   DEVICE pointer, unchanged in name and in value format; an account
   uses `fms_studio_current_project_v1@<uid>`. That is a new key, not
   a renamed one, so there is nothing to migrate.

   IDENTITY IS READ, NEVER DERIVED. `Storage.prototype` is patched at
   module evaluation, long before the Supabase SDK is even fetched, so
   this file cannot ask who is signed in — it reads the id that
   cloud.js last persisted at `fms_studio_account_v1`, raw, exactly as
   ai.js reads its key. Like the AI key it is in none of the five
   registries (SCOPED_KEYS, PROJECT_KEYS, ALL_KEYS, the Supabase scope
   list, GLOBAL_KEYS) — an account id is not project data, must never
   be project-scoped, must never sync, and must never ride inside a
   backup file and make another machine claim to be somebody.

   CAPTURED ONCE PER PAGE LOAD, on purpose. A page that read the
   namespace live would load 359 fields from one namespace and then
   autosave them into another the moment a session changed underneath
   it. `_ns` is therefore fixed for the life of the document, and
   `setAccount()` reloads when it needs the change to be visible now.
   ============================================================ */
const DEVICE_NS = '';

function readAccountNs() {
  const v = rawGet(ACCOUNT_KEY);
  return (typeof v === 'string' && v.trim()) ? v.trim() : DEVICE_NS;
}

/* Fixed for this document. See the note above. */
const _ns = readAccountNs();

/** '' when signed out (the device namespace), else the account id. */
export function currentNamespace() { return _ns; }
/** The signed-in account id, or null. Null is the normal state. */
export function currentAccountId() { return _ns || null; }
/** Is this page reading and writing an account's data rather than the device's? */
export function isAccountNamespace(id) {
  return id == null ? _ns !== DEVICE_NS : String(id) === _ns;
}

const currentKeyFor = (ns) => (ns ? CURRENT_KEY + '@' + ns : CURRENT_KEY);

/* Namespaces an entry is visible in.

   An ABSENT `ns` means the device: that is what every project written
   before this change has, and it is what keeps the signed-out app
   byte-identical. An EMPTY ARRAY is read the same way rather than as
   "visible nowhere" — `[]` is truthy and has burned this codebase
   before (the `_sceneMap` trap), and the safe direction for a
   local-first tool is "still on the device", never "gone". */
function nsOf(p) {
  const v = p && p.ns;
  if (Array.isArray(v) && v.length) return v.filter((x) => typeof x === 'string');
  return [DEVICE_NS];
}
const visibleIn = (p, ns) => nsOf(p).indexOf(ns) >= 0;

// ============================================================
// PROJECTS — list / CRUD
// ============================================================
function uuid() {
  if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
  return 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

/* EVERY project on this device, all namespaces. Read this — never
   `listProjects()` — before writing the list back, or you save a
   filtered copy and delete every other namespace's projects. */
function allProjectMeta() {
  const arr = jsonGet(PROJECTS_KEY, []);
  return Array.isArray(arr) ? arr : [];
}
function saveAllProjects(arr) { jsonSet(PROJECTS_KEY, arr); }

/* The projects THIS namespace can see. Signed out that is every
   project written before accounts existed, unchanged. */
export function listProjects() {
  return allProjectMeta().filter((p) => visibleIn(p, _ns));
}

/* Every project on the device regardless of namespace.

   For genuinely device-wide operations — a full backup, a real reset —
   in the same spirit as the `rawGet(key + '__' + id)` rule for
   studio-wide work in CLAUDE.md. An export built from `listProjects()`
   now holds one NAMESPACE's films, which is the 2024 "full studio
   backup that contained a single film" bug wearing a new hat. */
export function listAllProjects() { return allProjectMeta(); }

/* Namespace-BLIND removal, for the one operation that promises to
   erase everything.

   deleteProject() is namespace-scoped ON PURPOSE: deleting a film
   inside your account must not reach the copy that still lives on the
   device. resetAll() makes the opposite promise — "this erases
   EVERYTHING" — and the scoped version cannot keep it. Called from the
   device namespace it computes `rest = ns.filter(n => n !== '')`,
   which for an account-only project is the whole array, so the entry
   survives, `gone` stays false and the blobs are never wiped. Every
   account-only project would have outlived a wipe the user was told
   was total.

   That is the 2024 single-film bug wearing the account dimension: an
   operation that is genuinely studio-wide has to say so explicitly
   rather than inherit whatever scope the proxy happens to be in. */
export function purgeProjectEverywhere(id) {
  saveAllProjects(allProjectMeta().filter((p) => p.id !== id));
  SCOPED_KEYS.forEach((k) => rawRemove(k + '__' + id));
  _invalidateCurrent();
  return true;
}

/* Every per-namespace open-project pointer, so a total wipe can clear
   the `…@<uid>` ones too — they are new key forms and therefore not in
   ALL_KEYS, which only knows the bare name. */
export function currentPointerKeys() {
  const out = [CURRENT_KEY];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(CURRENT_KEY + '@')) out.push(k);
  }
  return out;
}

export function getProject(id) {
  if (!id) return null;
  return listProjects().find(p => p.id === id) || null;
}

export function createProject(meta) {
  meta = meta || {};
  const now = new Date().toISOString();
  /* `meta.ns` is for callers that must file a project somewhere other
     than the open namespace — migrateLegacy(), which files pre-account
     data on the device where its owner can always reach it. */
  const ns = (Array.isArray(meta.ns) && meta.ns.length)
    ? meta.ns.filter((x) => typeof x === 'string')
    : [_ns];
  const arr0 = allProjectMeta();
  /* A caller-supplied id that is already on this device gets a fresh
     one instead of a second list entry.

     hub.js's importer checks for collisions against `listProjects()`,
     which now answers for one namespace — so restoring a backup while
     signed in could offer an id that already exists in the device
     namespace, and two entries sharing an id would share their
     `__<projectId>` blobs and restore straight over somebody's film.
     The id is the join between a project and its data; it cannot be
     allowed to mean two things. */
  const wanted = meta.id && !arr0.some((p) => p.id === meta.id) ? meta.id : null;
  const project = {
    id:         wanted || uuid(),
    title:      (meta.title || 'Untitled Project').trim(),
    format:     FORMATS.indexOf(meta.format) >= 0 ? meta.format : 'feature',
    createdAt:  now,
    updatedAt:  now,
    ns:         ns
  };
  arr0.push(project);
  saveAllProjects(arr0);
  _invalidateCurrent();
  if (ns.indexOf(_ns) >= 0) setCurrentProject(project.id);
  notify('projects:changed', { reason: 'create', project });
  return project;
}

export function updateProject(id, patch) {
  const arr = allProjectMeta();
  // Visible-only: a page never renames a project it cannot see.
  const idx = arr.findIndex(p => p.id === id && visibleIn(p, _ns));
  if (idx < 0) return null;
  const next = Object.assign({}, patch || {});
  delete next.ns;               // membership is not editable through here
  delete next.id;
  Object.assign(arr[idx], next, { updatedAt: new Date().toISOString() });
  saveAllProjects(arr);
  notify('projects:changed', { reason: 'update', project: arr[idx] });
  notify('project:meta', arr[idx]);
  return arr[idx];
}

/* Delete means "remove it from where I am standing".

   For a project that lives only here, that is the old behaviour
   exactly: entry dropped, data wiped. For one the user adopted into an
   account, deleting it INSIDE the account drops the account's
   membership and leaves the device copy — the data is still the copy
   that was on this machine before they ever signed in, and a sign-in
   is not a licence to erase it. The blobs are wiped only when no
   namespace refers to them any more, so nothing is ever orphaned and
   nothing is ever deleted out from under the other side. */
export function deleteProject(id) {
  const arr = allProjectMeta();
  const idx = arr.findIndex(p => p.id === id);
  let gone = true;
  if (idx >= 0) {
    const rest = nsOf(arr[idx]).filter((n) => n !== _ns);
    if (rest.length) { arr[idx].ns = rest; gone = false; }
    else             { arr.splice(idx, 1); }
    saveAllProjects(arr);
  }
  if (gone) SCOPED_KEYS.forEach(k => rawRemove(k + '__' + id));
  _invalidateCurrent();
  if (rawGet(currentKeyFor(_ns)) === id) {
    const mine = listProjects();
    const next = mine[0] ? mine[0].id : null;
    rawSet(currentKeyFor(_ns), next || '');
    _invalidateCurrent();
    notify('current:changed', { id: next });
  }
  notify('projects:changed', { reason: 'delete', id });
  return true;
}

/* The open project id — VALIDATED against this namespace.

   The storage proxy suffixes every scoped write with whatever this
   returns, so a pointer left behind by another namespace would aim
   this page's saves straight into another account's blob. Hence the
   membership check, and hence the memo: the proxy calls this on every
   single localStorage access, and parsing the project list 359 times
   per page load to answer the same question is not free. The cache is
   keyed on the raw pointer and dropped by every membership change, so
   it can only ever be as stale as the list it was read from. Reads
   only — nothing here writes, which is what the gate's four idle
   seconds are watching for. */
let _curCache = { raw: undefined, id: null };
function _invalidateCurrent() { _curCache = { raw: undefined, id: null }; }

export function currentProjectId() {
  const raw = rawGet(currentKeyFor(_ns)) || null;
  if (_curCache.raw === raw) return _curCache.id;
  const id = (raw && listProjects().some((p) => p.id === raw)) ? raw : null;
  _curCache = { raw, id };
  return id;
}

export function currentProject() {
  return getProject(currentProjectId());
}

export function setCurrentProject(id) {
  if (!getProject(id)) return false;
  rawSet(currentKeyFor(_ns), id);
  _invalidateCurrent();
  notify('current:changed', { id });
  return true;
}

// Bump updatedAt on the active project. Called by the storage
// proxy whenever any scoped key is written.
function touch() {
  const id = currentProjectId();
  if (!id) return;
  const arr = allProjectMeta();
  const idx = arr.findIndex(p => p.id === id);
  if (idx < 0) return;
  arr[idx].updatedAt = new Date().toISOString();
  saveAllProjects(arr);   // NOT the filtered list — see allProjectMeta()
}

// ============================================================
// ACCOUNT — identity in, projects brought across
// ============================================================

/* Record which account this device is signed into.

   Called by cloud.js on every auth transition, and by nothing else.
   Returns true when the effective namespace CHANGED, which is the
   caller's signal to stop what it was doing: the page it is running on
   still holds the previous namespace's data in its fields, and a
   reload is on its way.

   `{ reload: false }` for an involuntary sign-out — a refresh token
   that expired while the tab sat open. Yanking the document out from
   under somebody mid-sentence is worse than letting the page finish
   its life writing to the namespace it loaded from, which is where
   that data belongs anyway. */
export function setAccount(id, opts) {
  const next = (typeof id === 'string' && id.trim()) ? id.trim() : DEVICE_NS;
  const prev = readAccountNs();
  if (next !== prev) {
    if (next) rawSet(ACCOUNT_KEY, next); else rawRemove(ACCOUNT_KEY);
    notify('account:changed', { account: next || null, previous: prev || null });
  }
  if (next === _ns) return false;
  if (!opts || opts.reload !== false) _scheduleReload();
  return true;
}

let _reloading = false;
function _scheduleReload() {
  if (_reloading) return;
  _reloading = true;      // one reload per document; cannot loop
  try {
    if (global.location && typeof global.location.reload === 'function') {
      setTimeout(() => { try { global.location.reload(); } catch (e) {} }, 0);
    }
  } catch (e) {}
}

/* Device projects no account has taken yet.

   Only device-ONLY entries are offered. That single condition is what
   makes cross-account separation provable rather than hoped for: an
   entry can gain at most one account id this way, so no two accounts
   ever end up pointing at the same blob by accident. */
export function listAdoptableProjects() {
  if (_ns === DEVICE_NS) return [];
  return allProjectMeta().filter((p) => {
    const ns = nsOf(p);
    return ns.length === 1 && ns[0] === DEVICE_NS;
  });
}

/* Bring this device's own projects into the signed-in account.

   ADDS, never moves: the entry keeps its device membership, so the
   work is still there when the user signs out, and there is still
   exactly one copy of the data (CLAUDE.md: don't persist the same
   thing twice). The user is asked first — cloud.js owns that prompt. */
export function adoptDeviceProjects() {
  if (_ns === DEVICE_NS) return [];
  const arr = allProjectMeta();
  const taken = [];
  arr.forEach((p) => {
    const ns = nsOf(p);
    if (ns.length === 1 && ns[0] === DEVICE_NS) {
      p.ns = [DEVICE_NS, _ns];
      taken.push(p);
    }
  });
  if (taken.length) {
    saveAllProjects(arr);
    _invalidateCurrent();
    notify('projects:changed', { reason: 'adopt', count: taken.length });
  }
  return taken;
}

/* File a project the server told us about into this namespace.

   cloud.js used to append to the list with a raw write to a hard-coded
   key literal, which would now land a pulled project in no namespace
   at all. It goes through here instead so membership is stamped in one
   place. A project id that already exists keeps its data and simply
   gains this namespace — that happens when a share is claimed, which
   is the one legitimate way one project reaches two accounts. */
export function upsertProjectMeta(meta) {
  if (!meta || !meta.id) return null;
  const arr = allProjectMeta();
  const idx = arr.findIndex((p) => p.id === meta.id);
  if (idx < 0) {
    arr.push({
      id:        meta.id,
      title:     meta.title || 'Untitled Project',
      format:    FORMATS.indexOf(meta.format) >= 0 ? meta.format : 'feature',
      createdAt: meta.createdAt || new Date().toISOString(),
      updatedAt: meta.updatedAt || new Date().toISOString(),
      ns:        [_ns]
    });
  } else {
    const ns = nsOf(arr[idx]);
    if (ns.indexOf(_ns) < 0) ns.push(_ns);
    arr[idx].ns = ns;
    if (meta.title)     arr[idx].title = meta.title;
    if (meta.format)    arr[idx].format = meta.format;
    if (meta.updatedAt) arr[idx].updatedAt = meta.updatedAt;
  }
  saveAllProjects(arr);
  _invalidateCurrent();
  return arr[idx < 0 ? arr.length - 1 : idx];
}

// ============================================================
// STORAGE PROXY
// ============================================================
// Monkey-patches Storage.prototype so that every existing
// `localStorage.getItem('fms_filmmaker_combined_v1')` etc.
// is transparently scoped to the current project.
//
// Idempotent — safe to call multiple times. Only installs once.
//
// MUST run before any other module reads localStorage — see the
// load-order banner at the top of this file.
// ============================================================
let _proxyInstalled = false;
export function installStorageProxy() {
  if (_proxyInstalled) return;
  _proxyInstalled = true;

  const proto = global.Storage && global.Storage.prototype;
  if (!proto) return; // bail gracefully in odd environments

  function scopedKey(k) {
    if (typeof k !== 'string') return k;
    if (SCOPED_KEYS.indexOf(k) < 0) return k;
    const id = currentProjectId();
    if (id) return k + '__' + id;
    /* No project open. The bare, unsuffixed key is the pre-projects
       slot — it is DEVICE data by definition, written before accounts
       or projects existed, so an account gets its own holding slot
       rather than reading and overwriting it. Without this, two
       different accounts with no project selected would both be
       writing into the same bare key. */
    return _ns === DEVICE_NS ? k : k + '@' + _ns;
  }

  const originalGet    = proto.getItem;
  const originalSet    = proto.setItem;
  const originalRemove = proto.removeItem;

  proto.getItem = function (k) {
    // only intercept on `localStorage` (not sessionStorage)
    if (this === global.localStorage) k = scopedKey(k);
    return originalGet.call(this, k);
  };
  proto.setItem = function (k, v) {
    if (this === global.localStorage) {
      const orig = k;
      k = scopedKey(k);
      const result = originalSet.call(this, k, v);
      if (k !== orig) {
        touch();
        // Tell the UI a save happened (debounced display in src/ui/chrome.js)
        notify('saved', { key: orig });
      }
      return result;
    }
    return originalSet.call(this, k, v);
  };
  proto.removeItem = function (k) {
    if (this === global.localStorage) k = scopedKey(k);
    return originalRemove.call(this, k);
  };
}

// ============================================================
// MIGRATION — one-time
// ============================================================
// If user has legacy single-project data (any of the SCOPED_KEYS
// present without a `__<id>` suffix) and no projects yet,
// create a project "My First Project" and move that data under it.
// ============================================================
/* ============================================================
   THE PREFIX MIGRATION — fms_ -> fms_
   ------------------------------------------------------------
   CLAUDE.md invariant 1: every localStorage key is load-bearing, and
   renaming one without a migration silently orphans somebody's
   writing. This renames all of them at once, so it is the one change
   in this repo that most needs to be boring and verifiable.

   FIVE PROPERTIES, each of which is a way this could have gone wrong:

   1. RAW, NOT PROXIED. It runs through the captured _orig* methods,
      before installStorageProxy() has patched anything. The proxy
      suffixes SCOPED_KEYS with the open project id; a migration that
      went through it would rename one project's data and silently
      skip the rest.

   2. PREFIX-ONLY, so the `__<projectId>` suffix and the open-ended
      families (note_, studio_backup_) come along without being
      enumerated. A list of 36 key names would be wrong the first
      time somebody added the 37th.

   3. SET, VERIFY, THEN REMOVE. The old key is deleted only after the
      new one is read back and compared. If setItem throws on quota
      the old value is still there, and the marker is not written, so
      the next load tries again.

   4. IT NEVER CLOBBERS. If a new-prefix key somehow already holds a
      different value, the old one is parked under a salvage name
      rather than either value being dropped.

   5. IDEMPOTENT AND INTERRUPT-SAFE. The marker is written last. A
      run killed halfway leaves the marker unset and the remaining
      old keys in place, and the next load finishes the job.

   The middle of the names is deliberately untouched — fms_library_calc_v1
   becomes fms_library_calc_v1 and not fms_budget_calc_v1, even though
   the estimator now lives on budget.html. Renaming the middle is a
   second migration, and hiding it inside this one is how a rename
   turns into data loss.
   ============================================================ */

const OLD_PREFIX = 'arunak_';
const NEW_PREFIX = 'fms_';
/* In the NEW namespace on purpose: were it an arunak_ key it would
   rename itself mid-run and the migration would look unfinished. */
const PREFIX_DONE_KEY = 'fms_studio_prefix_v1';

export function migratePrefix() {
  let done = null;
  try { done = _origGet(PREFIX_DONE_KEY); } catch (e) { return { ran: false, reason: 'storage unavailable' }; }
  if (done === '1') return { ran: false, reason: 'already migrated' };

  const old = [];
  try {
    for (let i = 0; i < global.localStorage.length; i++) {
      const k = global.localStorage.key(i);
      if (k && k.indexOf(OLD_PREFIX) === 0) old.push(k);
    }
  } catch (e) { return { ran: false, reason: 'enumeration failed' }; }

  const moved = [], kept = [], failed = [];
  for (const k of old) {
    const nk = NEW_PREFIX + k.slice(OLD_PREFIX.length);
    let value = null;
    try { value = _origGet(k); } catch (e) { failed.push(k); continue; }
    if (value == null) continue;

    let existing = null;
    try { existing = _origGet(nk); } catch (e) {}
    if (existing != null && existing !== value) {
      // Property 4. Park it; do not choose for the user.
      try { _origSet(NEW_PREFIX + 'salvage_' + k, value); _origRemove(k); kept.push(nk); } catch (e) { failed.push(k); }
      continue;
    }

    try {
      _origSet(nk, value);
      if (_origGet(nk) !== value) { failed.push(k); continue; }  // property 3
      _origRemove(k);
      moved.push(nk);
    } catch (e) {
      failed.push(k);   // quota or private mode: old key survives untouched
    }
  }

  if (!failed.length) {
    try { _origSet(PREFIX_DONE_KEY, '1'); } catch (e) {}
  }
  return { ran: true, moved: moved.length, collided: kept.length, failed: failed.length, failedKeys: failed };
}

export function migrateLegacy() {
  if (rawGet(SCHEMA_VERSION_KEY) === '1') return null; // already migrated
  const projects = listProjects();
  const hasLegacy = SCOPED_KEYS.some(k => rawGet(k) != null);

  if (projects.length === 0 && hasLegacy) {
    // Try to read the existing feature title for a nice name
    let title = 'My First Project';
    try {
      const featRaw = rawGet('fms_filmmaker_combined_v1');
      if (featRaw) {
        const feat = JSON.parse(featRaw);
        if (feat && (feat.meta_title || feat.v1_title)) {
          title = (feat.meta_title || feat.v1_title).trim() || title;
        }
      }
    } catch (e) {}

    /* Filed on the DEVICE, whoever happens to be signed in.

       This data predates both projects and accounts: it is somebody's
       single-blueprint studio from 2023, sitting in unsuffixed keys.
       Filing it inside whichever account was open would put work that
       was never behind an account behind one, and it would vanish at
       sign-out. On the device it is reachable forever. */
    const project = createProject({ title, format: 'feature', ns: [DEVICE_NS] });

    // Move legacy keys to namespaced keys
    SCOPED_KEYS.forEach(k => {
      const v = rawGet(k);
      if (v != null) {
        rawSet(k + '__' + project.id, v);
        rawRemove(k);
      }
    });

    rawSet(SCHEMA_VERSION_KEY, '1');
    notify('migration:done', { project });
    return project;
  }

  rawSet(SCHEMA_VERSION_KEY, '1');
  return null;
}

// ============================================================
// PUB/SUB BUS
// ============================================================
const _subs = {};
export function subscribe(event, cb) {
  if (!_subs[event]) _subs[event] = [];
  _subs[event].push(cb);
  return function unsubscribe() {
    _subs[event] = (_subs[event] || []).filter(fn => fn !== cb);
  };
}
export function notify(event, payload) {
  (_subs[event] || []).forEach(fn => {
    try { fn(payload); } catch (e) { console.warn('[StudioStore]', event, e); }
  });
  // wildcard `*` listeners receive the event name as first arg
  (_subs['*'] || []).forEach(fn => {
    try { fn(event, payload); } catch (e) { console.warn('[StudioStore]', event, e); }
  });
}

// ============================================================
// CROSS-FIELD BINDING — `data-bind="project.meta.title"`
// ============================================================
// Two-way bind any input to a path on the current project meta.
// Today we support: project.meta.title, project.meta.format
// Future paths (project.protagonist.name, project.scenes[]) plug
// into the same pattern but read/write through the blueprint
// storage instead of the project meta.
// ============================================================
export function bindElements(root) {
  root = root || document;
  const els = root.querySelectorAll('[data-bind]');
  els.forEach(el => {
    const path = el.getAttribute('data-bind');
    if (!path) return;
    // initial population
    const v = readPath(path);
    if (v != null) setElValue(el, v);
    // listen for changes from elsewhere
    subscribe('bind:' + path, function (newVal) {
      if (document.activeElement !== el) setElValue(el, newVal);
    });
    // write back on input
    const handler = function () {
      const val = getElValue(el);
      writePath(path, val);
    };
    el.addEventListener('input', handler);
    el.addEventListener('change', handler);
  });
}

function getElValue(el) {
  if (el.type === 'checkbox') return el.checked;
  return el.value;
}
function setElValue(el, v) {
  if (el.type === 'checkbox') el.checked = !!v;
  else if (el.value !== v) el.value = v == null ? '' : v;
  // also update any text-display siblings tagged data-bind-text
  const display = document.querySelectorAll('[data-bind-text="' + el.getAttribute('data-bind') + '"]');
  display.forEach(d => { d.textContent = v == null ? '' : v; });
}

function readPath(path) {
  // only `project.meta.<key>` for now
  const parts = path.split('.');
  if (parts[0] !== 'project') return null;
  const proj = currentProject();
  if (!proj) return null;
  if (parts[1] === 'meta') return proj[parts[2]];
  return null;
}
function writePath(path, value) {
  const parts = path.split('.');
  if (parts[0] !== 'project') return;
  const proj = currentProject();
  if (!proj) return;
  if (parts[1] === 'meta') {
    const patch = {};
    patch[parts[2]] = value;
    updateProject(proj.id, patch);
    // notify all bound listeners
    notify('bind:' + path, value);
    // also update any text displays everywhere on the page
    document.querySelectorAll('[data-bind-text="' + path + '"]').forEach(d => {
      d.textContent = value == null ? '' : value;
    });
  }
}

export function refreshAllBoundDisplays(root) {
  root = root || document;
  root.querySelectorAll('[data-bind]').forEach(el => {
    const path = el.getAttribute('data-bind');
    const v = readPath(path);
    if (v != null) setElValue(el, v);
  });
  root.querySelectorAll('[data-bind-text]').forEach(el => {
    const path = el.getAttribute('data-bind-text');
    const v = readPath(path);
    el.textContent = v == null ? '' : v;
  });
}

// ============================================================
// BLUEPRINT HELPER — wires the toolbar "← STUDIO · <project>" link
// and shows a banner when no project is selected.
// Each blueprint calls this once at end of body.
// ============================================================
export function wireBlueprintHeader(opts) {
  opts = opts || {};
  const linkId  = opts.linkId  || 'studioProjLink';
  const labelId = opts.labelId || 'studioProjLabel';
  function update() {
    const p = currentProject();
    const link = document.getElementById(linkId);
    const lab  = document.getElementById(labelId);
    if (!link || !lab) return;
    if (p) {
      lab.textContent = p.title;
      link.classList.remove('no-project');
      link.title = 'Back to Studio · editing "' + p.title + '"';
    } else {
      lab.textContent = 'NO PROJECT — pick one';
      link.classList.add('no-project');
      link.title = 'No project selected. Click to go to the Studio and pick or create one.';
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', update);
  } else {
    update();
  }
  subscribe('current:changed', update);
  subscribe('project:meta', update);

  // Also show a banner if no project — makes it impossible to miss
  function ensureBanner() {
    if (currentProject()) {
      const existing = document.getElementById('studioNoProjectBanner');
      if (existing) existing.remove();
      return;
    }
    if (document.getElementById('studioNoProjectBanner')) return;
    const banner = document.createElement('div');
    banner.id = 'studioNoProjectBanner';
    // Styling lives in chrome-injected.css (imported here) so it can use
    // tokens. It was an inline cssText blob with two raw colours, the
    // text one being the pre-token paper value, so the banner did not
    // move with the theme.
    banner.className = 'studio-no-project-banner';
    banner.append(
      '⚠ NO PROJECT SELECTED — your edits won\'t save until you pick a project. '
    );
    const link = document.createElement('a');
    link.href = 'index.html';
    link.textContent = 'GO TO STUDIO →';
    banner.append(link);
    document.body.insertBefore(banner, document.body.firstChild);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ensureBanner);
  } else {
    ensureBanner();
  }
  subscribe('current:changed', ensureBanner);
}

// Re-render bound displays whenever the active project changes
subscribe('current:changed', () => refreshAllBoundDisplays());
subscribe('project:meta',     () => refreshAllBoundDisplays());

// ============================================================
// PUBLIC API
// ============================================================
// Shape is identical to the old `window.StudioStore` global so that
// legacy inline page scripts keep working unchanged.
const StudioStore = {
  // version
  VERSION: '1.0.0',

  // projects
  listProjects,
  listAllProjects, purgeProjectEverywhere, currentPointerKeys,
  getProject,
  createProject,
  updateProject,
  deleteProject,
  currentProjectId,
  currentProject,
  setCurrentProject,
  upsertProjectMeta,

  // account namespace
  currentNamespace,
  currentAccountId,
  isAccountNamespace,
  setAccount,
  listAdoptableProjects,
  adoptDeviceProjects,

  // bus
  subscribe,
  notify,

  // bindings
  bindElements,
  refreshAllBoundDisplays,
  wireBlueprintHeader,

  // storage
  installStorageProxy,
  migrateLegacy,

  // raw helpers (handy for blueprints)
  rawGet, rawSet, rawRemove, jsonGet, jsonSet,

  // constants
  FORMATS,
  SCOPED_KEYS,
  ACCOUNT_KEY
};

export const VERSION = StudioStore.VERSION;

// ============================================================
// SHARED CSS
// ============================================================
// Used to build a CSS string and inject <style id="studio-store-styles">.
// The rules now live in src/styles/chrome-injected.css, imported at the
// top of this module, so the bundler owns them. This function is kept
// (and still called by init()) purely so the public API shape and any
// legacy caller keep working; it is intentionally a no-op.
export function injectSharedStyles() {
  /* rules moved to ../styles/chrome-injected.css — imported above */
}

// ============================================================
// INIT — migration + storage proxy + shared styles
// ============================================================
// Called once at module evaluation (below), exactly as the old file's
// auto-init block did. Exported so an entry point can be explicit
// about the ordering requirement documented at the top of this file.
// Idempotent: migrateLegacy() short-circuits on the schema flag and
// installStorageProxy() only installs once.
export function init() {
  try {
    /* FIRST, before anything reads a key and before the proxy is
       installed. migrateLegacy() reads SCOPED_KEYS by their current
       names, so the prefix has to be settled before it runs — and
       the proxy has to be absent, or the rename would only reach the
       open project. */
    migratePrefix();
    migrateLegacy();
    installStorageProxy();
    injectSharedStyles();
  } catch (e) {
    console.warn('[StudioStore] init error', e);
  }
}

// Auto-init: run migration + install proxy as soon as we load.
// (Blueprints relying on existing `localStorage.getItem(KEY)`
// calls will Just Work after this.)
init();

// Auto-wire the blueprint header link if the elements are present.
// Blueprints just need to include `<a id="studioProjLink"><span id="studioProjLabel">…</span></a>`
// and StudioStore takes care of label + banner.
function autoWireIfBlueprint() {
  if (document.getElementById('studioProjLink')) wireBlueprintHeader();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', autoWireIfBlueprint);
} else {
  autoWireIfBlueprint();
}

// ============================================================
// AUTO TITLE BRIDGE
// ------------------------------------------------------------
// Two-way sync between a blueprint's title fields and the
// project's meta.title, so typing the title once reflects
// everywhere — toolbar, project list, blueprint header, exports.
//
// Bridges any input with data-key="meta_title" or "v1_title".
// Runs slightly after DOMContentLoaded so the blueprint's own
// load logic populates fields first.
// ============================================================
function autoBridgeTitle() {
  if (typeof document === 'undefined') return;

  function setup() {
    const fields = document.querySelectorAll(
      '[data-key="meta_title"], [data-key="v1_title"]'
    );
    if (!fields.length) return;

    function pushToFields(value) {
      fields.forEach(el => {
        if (document.activeElement !== el && el.value !== value) {
          el.value = value || '';
          // Tell the existing data-key save handler (in each
          // blueprint) that this field changed, so it persists.
          try {
            el.dispatchEvent(new Event('input',  { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
          } catch (e) {}
        }
      });
    }

    function pullFromField(el) {
      const proj = currentProject();
      if (!proj) return;
      const v = (el.value || '').trim();
      if (v && v !== proj.title) updateProject(proj.id, { title: v });
    }

    // Sync after blueprint's own loadAll (~100 ms is plenty)
    setTimeout(() => {
      const proj = currentProject();
      if (!proj) return;
      const firstFilled = Array.prototype.find.call(
        fields, el => el.value && el.value.trim()
      );
      // If field has a real value and project is still "Untitled
      // Project", lift the field value up into project meta.
      if (firstFilled &&
          (!proj.title || /^untitled/i.test(proj.title))) {
        updateProject(proj.id, { title: firstFilled.value.trim() });
        pushToFields(firstFilled.value.trim());
      } else if (proj.title) {
        pushToFields(proj.title);
      }
    }, 100);

    subscribe('project:meta', (p) => { if (p) pushToFields(p.title); });

    fields.forEach(el => {
      el.addEventListener('input',  () => pullFromField(el));
      el.addEventListener('change', () => pullFromField(el));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', setup);
  } else {
    setup();
  }
}
autoBridgeTitle();

// Legacy inline page scripts call this by global name; the HTML pages
// migrate later, so keep the global assignment.
global.StudioStore = StudioStore;

export { FORMATS, SCOPED_KEYS, ACCOUNT_KEY, StudioStore };
export default StudioStore;
