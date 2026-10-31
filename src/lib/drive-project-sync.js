/* ============================================================
   DRIVE PROJECT SYNC — cloud.js's drive branch (storage_mode 'drive')
   ------------------------------------------------------------
   Loaded LAZILY by cloud.js, and only once the server has answered
   get_storage_mode() = 'drive' (schema §66). With the switch off this
   file is never fetched, and every Supabase path stays byte-identical.

   cloud.js keeps its public API; each sync entry point (pull, push,
   comments, shares, budget privacy, delete, adoption) asks
   `if (_mode === 'drive')` and hands the call here. This file does
   the WHEN and the WHERE; src/lib/drive-store.js does the HOW (layout,
   revisions, merges) and is pure; src/lib/drive-migrate.js moves an
   account's server rows into its Drive.

   NOT drive-sync.js. That one is the single-file BACKUP feature and
   stays exactly what it was.

   WHAT IS STORED, AND WHERE. Nothing new. The device's Drive ids and
   revisions are `store` inside fms_drive_sync_v1 (device-local, in
   ALL_KEYS, deliberately NOT in GLOBAL_KEYS — a folder id inside a
   backup would point another machine at this account's Drive), keyed
   per account id so two accounts on one browser never share a root.
   The migration's progress is `migrate` in the same key. A project's
   folder is the `drive` FIELD on its entry in fms_studio_projects_v1
   (Store.setProjectDrive), which backup.js leaves out of an export.
   Every write happens after a user write or a sync event: an idle
   page writes nothing.

   WHEN.
     push   2 s after the last save to a scope, at most 10 s after the
            first; flushed on visibilitychange:hidden / pagehide with a
            keepalive fetch for small files.
     pull   on project open, on focus / visible, and every 60 s while
            the tab is visible — one files.list on the folder first, and
            only the scopes whose head moved are downloaded.
   No realtime, no presence: both key off a `projects` row that no
   longer exists in drive mode.

   A REFUSED WRITE NEVER LOOKS LIKE A SAVE. A push Drive refuses (403,
   a 5xx, no token) leaves the local copy exactly as it is, the status
   line says so, and the scope stays dirty (its hash differs from the
   agreed one) so the next pass sends it again.
   ============================================================ */
import Store, { rawGet, rawSet } from './store.js';
import Drive from './drive.js';
import { createDriveStore, DriveError, STUDIO_ROLE, BUDGET_SCOPES, canonicalHash } from './drive-store.js';
import { runMigration } from './drive-migrate.js';
import { callPort } from './ports.js';
import { BRAND } from './brand.js';
/* The view (src/ui/drive-ui.js) through a port: logic never imports the
   view (test:layers). src/ui/ports-view.js plugs in a LAZY import, so
   the sheet and its stylesheet are fetched only when something shows. */
const driveUI = () => Promise.resolve(callPort('driveUI', null)).then((m) => { if (!m) throw new Error('no drive view'); return m; });

const STATE_KEY = 'fms_drive_sync_v1';
const PUSH_DEBOUNCE_MS = 2000;
const PUSH_CAP_MS = 10000;
const PULL_EVERY_MS = 60000;
const COEDIT_SCOPES = new Set(['script', 'story']);

let C = null;          // the context cloud.js hands over (see init)
let ds = null;         // the drive store, per account
let dsFor = '';        // the account it was built for
let _status = null;    // { state, detail } while something needs saying
let _pullTimer = 0;
let _wired = false;
let _ownedCount = null;
let _capHeld = false;
let _reconnectShown = false;
let _refusedToldAt = 0;
let _migrating = null;
const _timers = new Map();   // pid::scope -> { t, first }
const _chains = new Map();   // pid::scope -> promise (one push at a time)
const _comments = new Map(); // pid -> { items, at }

/* ------------------------------------------------------------
   STATE in fms_drive_sync_v1
   ------------------------------------------------------------ */
function readAll() { try { return JSON.parse(rawGet(STATE_KEY) || '{}') || {}; } catch (e) { return {}; } }
function writePart(name, value) {
  const all = readAll();
  all[name] = value;
  const next = JSON.stringify(all);
  if (rawGet(STATE_KEY) !== next) rawSet(STATE_KEY, next);
}
const uid = () => { const s = C && C.session(); return (s && s.user && s.user.id) || ''; };
function accountState() {
  const all = readAll();
  const store = all.store && typeof all.store === 'object' ? all.store : {};
  const mine = store[uid()];
  return mine && typeof mine === 'object' ? mine : {};
}
function saveAccountState(st) {
  const all = readAll();
  const store = all.store && typeof all.store === 'object' ? all.store : {};
  store[uid()] = st;
  writePart('store', store);
}
export function markGranted(on) {
  const st = accountState();
  if (!!st.granted === !!on) return;
  if (on) st.granted = true; else delete st.granted;
  saveAccountState(st);
}
function migrateState() { const m = readAll().migrate; return m && typeof m === 'object' ? m : {}; }

function store() {
  if (ds && dsFor === uid()) return ds;
  const st = accountState();
  dsFor = uid();
  ds = createDriveStore({
    transport: Drive.transport,
    scopes: Object.values(C.SCOPE_BY_KEY),
    rootName: BRAND.name,
    state: st,
    onState: (s) => saveAccountState(s)
  });
  return ds;
}

/* ------------------------------------------------------------
   INIT — the context from cloud.js
   ------------------------------------------------------------
   C = { Store, session(), rpc(name,args), setSync(state, detail),
         SYNC_STATES, toast(msg,type,ms), salvage(pid,scope,raw),
         applyingRemote(fn), KEY_BY_SCOPE, SCOPE_BY_KEY, isSample(pid),
         allowed(), coEditingEnabled(), listCommentsServer(pid),
         planLimitToast(msg), idleSync(), setSyncEnabled(on),
         reconnect(), userEmail() } */
export function init(ctx) {
  C = ctx;
  if (_wired || typeof window === 'undefined') return;
  _wired = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushAll({ keepalive: true });
    else pullCurrentSoon();
  });
  window.addEventListener('pagehide', () => flushAll({ keepalive: true }));
  window.addEventListener('focus', () => pullCurrentSoon());
  window.addEventListener('online', () => { sweepDirty(Store.currentProjectId()); });
}

/* ------------------------------------------------------------
   STATUS — what idleSync() shows in drive mode
   ------------------------------------------------------------ */
export function status() {
  if (_capHeld) return { state: C.SYNC_STATES.ERROR, detail: 'Not saved to Drive — plan limit reached' };
  return _status || { state: C.SYNC_STATES.SYNCED, detail: 'Everything is in your Google Drive' };
}
function say(state, detail) { _status = state ? { state: C.SYNC_STATES[state], detail } : null; C.idleSync(); }

function isRegrant(e) { return !!(e && (e.code === 'regrant' || (e.cause && e.cause.code === 'regrant'))); }
function isNoToken(e) { return !!(e && !e.status && /token|click/i.test(String(e.message || ''))); }
function driveFailed(e, what) {
  if (isRegrant(e) || isNoToken(e)) { askReconnect(); return; }
  const st = e && e.status;
  const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
  if (offline) { say('OFFLINE', 'Offline — saved on this device, will go to Drive when you are back'); return; }
  const why = st ? 'Google Drive answered ' + st : (e && e.message) || 'Google Drive could not be reached';
  say('ERROR', 'Saved on this device — ' + why + (what ? ' (' + what + ')' : ''));
  if (Date.now() - _refusedToldAt > 60000) {
    _refusedToldAt = Date.now();
    C.toast(st === 403
      ? 'Google Drive refused the change (' + why + '). Your work is kept on this device.'
      : 'Could not save to Google Drive: ' + why + '. Your work is kept on this device.', 'error', 5000);
  }
}
function askReconnect() {
  say('ERROR', 'Drive needs you to sign in again — your work is kept on this device');
  if (_reconnectShown) return;
  _reconnectShown = true;
  driveUI().then((UI) => UI.reconnectToast(() => C.reconnect())).catch(() => {
    C.toast('Reconnect Google Drive: sign in again to keep saving there.', 'error', 8000);
  });
}

/* ------------------------------------------------------------
   PROJECTS
   ------------------------------------------------------------ */
const entryOf = (pid) => Store.listAllProjects().find((p) => p.id === pid) || null;
const roleOf = (pid) => {
  const e = entryOf(pid);
  const st = store().state[pid];
  return (e && e.drive && e.drive.role) || (st && st.role) || null;
};
const writable = (pid) => { const r = roleOf(pid); return r === 'owner' || r === 'edit'; };
function migrating(pid) { const m = migrateState()[pid]; return !!(m && !m.done); }
function eligible(pid) {
  if (!pid || !C.allowed()) return false;
  if (C.isSample(pid)) return false;
  if (migrating(pid)) return false;
  return !!entryOf(pid);
}
function folderOf(pid) {
  const e = entryOf(pid);
  if (e && e.drive && e.drive.folderId) {
    const s = store();
    if (!s.state[pid] || s.state[pid].folderId !== e.drive.folderId) s.adoptFolder(pid, e.drive.folderId, e.drive.role || 'owner');
    return e.drive.folderId;
  }
  const st = store().state[pid];
  return st && st.folderId ? st.folderId : null;
}
async function planCap() {
  try {
    const st = await C.rpc('billing_status');
    const lim = st && st.limits;
    return lim && Number.isInteger(lim.projects) ? lim.projects : null;
  } catch (e) { return null; }
}
/* Find-or-create the folder for a project this account owns. Plan
   caps are counted here, on owned project folders: the P0402
   triggers no longer see content in drive mode. */
const _ensuring = new Map();
function ensureFolder(pid) {
  if (!_ensuring.has(pid)) _ensuring.set(pid, ensureFolderNow(pid).finally(() => _ensuring.delete(pid)));
  return _ensuring.get(pid);
}
async function ensureFolderNow(pid) {
  const have = folderOf(pid);
  if (have) {
    const e = entryOf(pid);
    if (e && !e.drive) { const st = store().state[pid] || {}; Store.setProjectDrive(pid, { folderId: have, role: st.role || 'owner' }); }
    return have;
  }
  const e = entryOf(pid);
  if (!e || C.isSample(pid)) return null;
  const s = store();
  const found = await s.findProjectFolder(pid);
  if (!found) {
    const cap = await planCap();
    if (cap !== null) {
      if (_ownedCount === null) _ownedCount = (await s.listProjects()).filter((r) => r.owned).length;
      if (_ownedCount >= cap) {
        _capHeld = true; C.idleSync();
        C.planLimitToast('Your plan saves up to ' + cap + ' film' + (cap === 1 ? '' : 's') + ' to Google Drive. This one is saved on this device.');
        return null;
      }
    }
  }
  const folderId = found || await s.createProjectFolder({ id: pid, title: e.title, format: e.format, region: e.region, createdAt: e.createdAt });
  if (!found && _ownedCount !== null) _ownedCount++;
  _capHeld = false;
  Store.setProjectDrive(pid, { folderId, role: 'owner' });
  return folderId;
}

/** The studio index: every project folder this account can see, merged
 *  into the project list, then each one pulled. */
export async function pullProjectList() {
  if (!C.allowed()) return;
  try {
    const s = store();
    await s.ensureRoot();
    const rows = await s.listProjects();
    _ownedCount = rows.filter((r) => r.owned).length;
    for (const r of rows) {
      if (C.isSample(r.pid) || migrating(r.pid)) continue;
      const vis = Store.listProjects().some((p) => p.id === r.pid);
      if (!vis) Store.upsertProjectMeta({ id: r.pid, title: r.title, format: r.format, updatedAt: r.modifiedTime });
      Store.setProjectDrive(r.pid, { folderId: r.folderId, role: r.role });
      s.adoptFolder(r.pid, r.folderId, r.role);
    }
    for (const r of rows) if (!C.isSample(r.pid) && !migrating(r.pid)) await pullProject(r.pid);
    /* Films made on this device while offline, or before drive mode: a
       folder each, then everything they hold. */
    for (const p of Store.listProjects()) {
      if (p.drive || C.isSample(p.id) || migrating(p.id)) continue;
      if (await ensureFolder(p.id)) await sweepDirty(p.id);
    }
    Store.notify('projects:changed', { reason: 'cloud-pull' });
    say(null);
  } catch (e) { driveFailed(e, 'project list'); }
}
export const uploadProjects = async (list) => {
  for (const p of list || []) {
    if (C.isSample(p.id)) continue;
    try { if (await ensureFolder(p.id)) await sweepDirty(p.id); } catch (e) { driveFailed(e, 'upload'); }
  }
};

/* ------------------------------------------------------------
   PULL
   ------------------------------------------------------------ */
async function coEdit() { try { return (await C.coEditingEnabled()) === true; } catch (e) { return false; } }
function apply(pid, scope, r) {
  const key = C.KEY_BY_SCOPE[scope];
  if (!key || !r) return false;
  const nsKey = key + '__' + pid;
  let wrote = false;
  if (r.salvage) C.salvage(pid, scope, r.salvage);
  if (r.text != null && rawGet(nsKey) !== r.text) {
    C.applyingRemote(() => rawSet(nsKey, r.text));
    wrote = true;
  }
  if (r.salvage) {
    C.toast('Someone else changed ' + pageName(scope) + '; your version is kept in Settings → Sync → Recovered copies.', 'info', 6000);
  }
  return wrote;
}
const PAGE = { script: 'the screenplay', story: 'the story', scenes: 'the scenes', shots: 'the shot list', contacts: 'the contacts', costs: 'the costs', library: 'the budget', locations: 'the schedule', characters: 'the characters' };
const pageName = (scope) => PAGE[scope] || ('the ' + scope.replace(/_/g, ' '));

export async function pullProjectData(pid) {
  return pullProject(pid);
}
async function pullProject(pid) {
  if (!eligible(pid)) return;
  const folderId = folderOf(pid);
  if (!folderId) { if (writable(pid) || !roleOf(pid)) { if (await ensureFolder(pid)) await sweepDirty(pid); } return; }
  const s = store();
  let idx;
  try { idx = await s.folderIndex(pid); }
  catch (e) {
    if (e && (e.status === 404)) { lateFiles(pid, 'folder'); return; }
    driveFailed(e, 'read'); return;
  }
  const ce = await coEdit();
  const scopes = [];
  let applied = 0, kept = 0;
  for (const [scope, remote] of Object.entries(idx.scopes)) {
    const key = C.KEY_BY_SCOPE[scope];
    if (!key) continue;
    if (COEDIT_SCOPES.has(scope) && ce) { try { Store.notify('cloud:incoming', { projectId: pid, scope }); } catch (e) { /* a page's listener */ } }
    const raw = rawGet(key + '__' + pid);
    let r;
    try { r = await s.pullScopeInto(pid, scope, raw, remote, { coEdit: ce && COEDIT_SCOPES.has(scope) }); }
    catch (e) { driveFailed(e, scope); continue; }
    if (apply(pid, scope, r)) { applied++; scopes.push(scope); }
    if (r.action === 'merged') kept++;
  }
  if (applied || kept) Store.notify('cloud:synced', { projectId: pid, applied, kept, scopes });
  /* project.json: title, private budget, and files a teammate cannot see */
  try {
    const st = s.state[pid] || {};
    if (idx.meta && idx.meta.rev !== st.metaRev) {
      const m = await s.readMeta(folderId);
      if (m.meta) {
        const was = !!st.budgetPrivate;
        st.budgetPrivate = !!m.meta.budgetPrivate; st.metaRev = m.rev; st.metaId = m.fileId;
        s.adoptFolder(pid, folderId, st.role || roleOf(pid));
        saveAccountState(s.state);
        if (was !== st.budgetPrivate) Store.notify('cloud:budget-privacy', { projectId: pid, state: privacyOf(pid) });
        const e = entryOf(pid);
        if (m.meta.title && e && e.title !== m.meta.title && roleOf(pid) !== 'owner') Store.upsertProjectMeta({ id: pid, title: m.meta.title });
        /* Files the manifest names that this account cannot see: under
           drive.file a file added after the teammate picked the folder
           may need picking too ("late files"). A private budget's two
           files are hidden on purpose and are not counted. */
        const seen = new Set(Object.values(idx.scopes).map((x) => x.id));
        const hidden = Object.entries(m.meta.files || {})
          .filter(([sc, id]) => id && !seen.has(id) && !(st.budgetPrivate && BUDGET_SCOPES.includes(sc))).length;
        if (hidden && roleOf(pid) !== 'owner') lateFiles(pid, hidden);
      }
    }
  } catch (e) { /* the manifest is advisory */ }
  /* comments: a writer folds what commenters posted */
  if (writable(pid) && idx.comments) { try { if (await s.foldCommenterItems(pid)) { _comments.delete(pid); Store.notify('cloud:comment', { projectId: pid }); } } catch (e) { /* next pull */ } }
  /* screening exports past their expiry: the owner's client removes them */
  if (roleOf(pid) === 'owner' && idx.screening.length) expireScreenings(pid).catch(() => {});
  await sweepDirty(pid, idx);
  if (!_status || _status.state !== C.SYNC_STATES.ERROR) say(null);
}
/* Every local scope that differs from the agreed copy goes up. */
async function sweepDirty(pid, idx) {
  if (!pid || !eligible(pid) || !writable(pid)) return;
  const s = store();
  for (const [key, scope] of Object.entries(C.SCOPE_BY_KEY)) {
    const raw = rawGet(key + '__' + pid);
    if (raw == null) continue;
    if (BUDGET_SCOPES.includes(scope) && (s.state[pid] || {}).budgetPrivate && roleOf(pid) !== 'owner') continue;
    if (idx && idx.scopes[scope] && (s.state[pid] || {}).files && s.state[pid].files[scope] && s.state[pid].files[scope].rev !== idx.scopes[scope].rev) continue;
    if (await s.isDirty(pid, scope, raw)) await pushOne(pid, scope);
  }
}
let _lateShown = new Set();
function lateFiles(pid, n) {
  if (_lateShown.has(pid)) return;
  _lateShown.add(pid);
  const folderId = folderOf(pid);
  driveUI().then((UI) => UI.lateFilesToast(n, () => openShared(folderId, { filesOnly: true }))).catch(() => {});
}

/* ------------------------------------------------------------
   PUSH
   ------------------------------------------------------------ */
export function onSaved(pid, scope) {
  if (!eligible(pid)) return;
  const k = pid + '::' + scope;
  const cur = _timers.get(k);
  const first = cur ? cur.first : Date.now();
  if (cur) clearTimeout(cur.t);
  const wait = Math.max(0, Math.min(PUSH_DEBOUNCE_MS, first + PUSH_CAP_MS - Date.now()));
  _timers.set(k, { first, t: setTimeout(() => { _timers.delete(k); pushOne(pid, scope); }, wait) });
}
export function flushAll(opts) {
  const jobs = [];
  for (const [k, v] of _timers) {
    clearTimeout(v.t);
    const [pid, scope] = k.split('::');
    jobs.push(pushOne(pid, scope, opts));
  }
  _timers.clear();
  return Promise.all(jobs);
}
export function pending() { return _timers.size; }
function pushOne(pid, scope, opts) {
  const k = pid + '::' + scope;
  const prev = _chains.get(k) || Promise.resolve();
  const next = prev.then(() => pushNow(pid, scope, opts)).catch(() => {});
  _chains.set(k, next);
  next.finally(() => { if (_chains.get(k) === next) _chains.delete(k); });
  return next;
}
async function pushNow(pid, scope, opts) {
  if (!eligible(pid)) return;
  const key = C.KEY_BY_SCOPE[scope];
  if (!key) return;
  const raw = rawGet(key + '__' + pid);
  if (raw == null) return;   // never written (or unreadable): nothing to say
  const role = roleOf(pid);
  if (role === 'comment' || role === 'view') return;
  const s = store();
  if (BUDGET_SCOPES.includes(scope) && (s.state[pid] || {}).budgetPrivate && role !== 'owner') return;
  let folderId;
  try { folderId = await ensureFolder(pid); } catch (e) { driveFailed(e, 'folder'); return; }
  if (!folderId) return;
  say('SYNCING', 'Saving to your Google Drive…');
  const hadFile = !!(s.state[pid] && s.state[pid].files && s.state[pid].files[scope]);
  let r;
  try { r = await s.pushScope(pid, scope, raw, { coEdit: COEDIT_SCOPES.has(scope) && await coEdit(), keepalive: !!(opts && opts.keepalive) }); }
  catch (e) { driveFailed(e, pageName(scope)); return; }
  if (r.action === 'merged' || r.action === 'remote-wins') {
    if (apply(pid, scope, r)) Store.notify('cloud:synced', { projectId: pid, applied: 1, kept: 0, scopes: [scope] });
  }
  if (!hadFile && writable(pid)) noteFileInManifest(pid, scope).catch(() => {});
  say(null);
}
/* One manifest write at a time per film: it is read-modify-write. */
const _metaChain = new Map();
function noteFileInManifest(pid, scope) {
  const next = (_metaChain.get(pid) || Promise.resolve()).then(() => noteFileNow(pid, scope)).catch(() => {});
  _metaChain.set(pid, next);
  return next;
}
async function noteFileNow(pid, scope) {
  const s = store();
  const f = s.state[pid] && s.state[pid].files[scope];
  const folderId = folderOf(pid);
  if (!f || !folderId) return;
  const cur = await s.readMeta(folderId);
  const meta = Object.assign({ v: 1, id: pid, files: {} }, cur.meta || {});
  meta.files = Object.assign({}, meta.files || {}, { [scope]: f.id });
  await s.writeMeta(folderId, meta, pid);
}

/* ------------------------------------------------------------
   ATTACH — the open project
   ------------------------------------------------------------ */
export async function attachToCurrentProject() {
  const pid = Store.currentProjectId();
  clearInterval(_pullTimer);
  _pullTimer = setInterval(() => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
    const p = Store.currentProjectId();
    if (p) pullProject(p);
  }, PULL_EVERY_MS);
  if (!pid) return;
  await pullProject(pid);
}
let _soon = 0;
function pullCurrentSoon() {
  clearTimeout(_soon);
  _soon = setTimeout(() => { const p = Store.currentProjectId(); if (p && C && C.allowed()) pullProject(p); }, 300);
}

/* ------------------------------------------------------------
   PROJECT EVENTS (create / rename / delete)
   ------------------------------------------------------------ */
export async function onProjectsChanged(info) {
  if (!info) return;
  try {
    if (info.reason === 'create' && info.project) {
      if (!C.isSample(info.project.id)) { if (await ensureFolder(info.project.id)) await sweepDirty(info.project.id); }
    } else if (info.reason === 'update' && info.project) {
      const pid = info.project.id;
      if (roleOf(pid) === 'owner' && folderOf(pid)) {
        const st = store().state[pid] || {};
        if (st.title !== info.project.title) {
          await store().renameProject(pid, info.project.title);
          st.title = info.project.title; saveAccountState(store().state);
        }
      }
    } else if (info.reason === 'adopt' && Array.isArray(info.projects)) {
      await uploadProjects(info.projects);
    } else if (info.reason === 'delete' && info.id) {
      const st = store().state[info.id];
      if (st && st.folderId && st.role === 'owner') await store().trashProject(st.folderId);
      else if (st) { delete store().state[info.id]; saveAccountState(store().state); }
    }
  } catch (e) { driveFailed(e, 'project'); }
}

/* ------------------------------------------------------------
   COMMENTS — comments.json; a commenter posts a Drive comment
   ------------------------------------------------------------ */
const newId = () => (globalThis.crypto && crypto.randomUUID ? crypto.randomUUID()
  : 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10));
async function itemsOf(pid, fresh) {
  const c = _comments.get(pid);
  if (c && !fresh && Date.now() - c.at < 5000) return c.items;
  folderOf(pid);
  const { items } = await store().readComments(pid);
  _comments.set(pid, { items, at: Date.now() });
  return items;
}
const asRow = (pid) => (x) => Object.assign({ project_id: pid, author_name: x.author_name || x.author_email || '', status: x.status || 'open', type: x.type || 'comment' }, x);
export async function listComments(pid, scope, fieldKey) {
  if (!pid || !folderOf(pid)) return [];
  let items = [];
  try { items = await itemsOf(pid); } catch (e) { return []; }
  return items.filter((x) => !x.deleted && (!scope || x.scope === scope) && (!fieldKey || x.field_key === fieldKey))
    .map(asRow(pid));
}
async function writeItem(pid, item) {
  const role = roleOf(pid);
  if (role === 'owner' || role === 'edit') {
    await store().updateComments(pid, (cur) => cur.concat([item]));
  } else if (role === 'comment') {
    try { await store().postCommenterItem(pid, item); }
    catch (e) {
      if (e && e.status === 403) throw new Error('Ask the owner for edit access to comment.');
      throw e;
    }
  } else {
    throw new Error('You can read this film but not comment on it. Ask the owner for comment access.');
  }
  _comments.delete(pid);
  const cached = _comments.get(pid);
  if (cached) cached.items.push(item);
  Store.notify('cloud:comment', { projectId: pid });
  return asRow(pid)(item);
}
export async function createComment(opts) {
  const pid = opts.projectId;
  if (!folderOf(pid)) throw new Error('This film is not in Google Drive yet.');
  const at = new Date().toISOString();
  const email = C.userEmail() || '';
  return writeItem(pid, {
    id: newId(), scope: opts.scope, field_key: opts.fieldKey, author_email: email, author_name: email,
    body: opts.body, type: opts.type || 'comment', status: 'open', parent_id: opts.parentId || null,
    suggest_from: opts.suggestFrom || null, suggest_to: opts.suggestTo || null, created_at: at, updated_at: at
  });
}
async function findItem(id) {
  const pid = Store.currentProjectId();
  const items = await itemsOf(pid, true);
  const it = items.find((x) => x.id === id);
  if (!it) throw new Error('That comment is no longer there.');
  return { pid, it };
}
export async function updateCommentStatus(id, status) {
  const { pid, it } = await findItem(id);
  return writeItem(pid, Object.assign({}, it, { status, updated_at: new Date().toISOString() }));
}
export async function deleteComment(id) {
  const { pid, it } = await findItem(id);
  await writeItem(pid, Object.assign({}, it, { deleted: true, updated_at: new Date().toISOString() }));
}
export async function getProjectRole(pid) { return pid ? roleOf(pid) : null; }

/* ------------------------------------------------------------
   SHARING — the folder's permissions
   ------------------------------------------------------------ */
export async function shareByEmail(pid, email, role) {
  const folderId = await ensureFolder(pid) || folderOf(pid);
  if (!folderId) throw new Error('This film is not in Google Drive yet.');
  const e = entryOf(pid);
  const link = location.origin + '/?drive=' + encodeURIComponent(folderId);
  const msg = 'You have been invited to "' + ((e && e.title) || 'a film') + '". Open it in the studio: ' + link;
  return store().share(folderId, String(email || '').trim(), role || 'comment', msg);
}
export async function listShares(pid) {
  const folderId = folderOf(pid);
  if (!folderId) return [];
  try {
    return (await store().listPermissions(folderId)).map((p) => ({ id: p.id, email: p.emailAddress || '', name: p.displayName || p.emailAddress || '', role: STUDIO_ROLE[p.role] || 'view', type: p.type, drive: true }));
  } catch (e) { return []; }
}
export async function revokeShare(permId, pid) {
  const folderId = folderOf(pid || Store.currentProjectId());
  if (!folderId) return false;
  return store().revoke(folderId, permId);
}
export async function createShare() {
  throw Object.assign(new Error('Films in Google Drive are shared by e-mail: type the person’s Google address.'), { code: 'drive-email-only' });
}

/* ------------------------------------------------------------
   OPENING A SHARED FOLDER (?drive=<folderId>, or late files)
   ------------------------------------------------------------ */
export function handleDriveLink() {
  let id = '';
  try { id = new URLSearchParams(location.search).get('drive') || ''; } catch (e) { return; }
  if (!/^[A-Za-z0-9_-]{8,200}$/.test(id)) return;
  const known = Store.listProjects().find((p) => p.drive && p.drive.folderId === id);
  const strip = () => { try { const u = new URL(location.href); u.searchParams.delete('drive'); history.replaceState(history.state, '', u.pathname + u.search + u.hash); } catch (e) { /* */ } };
  if (known) { Store.setCurrentProject(known.id); strip(); return; }
  driveUI().then((UI) => UI.sharedFilmToast(() => openShared(id).then(strip))).catch(() => {});
}
/** The Google Picker, once per shared folder (drive.file sees only what
 *  the user picked), and Fallback A — pick the files too — when picking
 *  the folder does not unlock its children. */
export async function openShared(folderId, opts) {
  const P = await import('./drive-picker.js');
  let token;
  try { token = await Drive.getToken({ interactive: false }); }
  catch (e) { driveFailed(e, 'picker'); return false; }
  const s = store();
  if (!(opts && opts.filesOnly)) {
    const got = await P.pick({ token, folderId, kind: 'folder' });
    if (!got || !got.length) return false;
  }
  const meta = await s.folderMeta(folderId).catch(() => null);
  const a = (meta && meta.appProperties) || {};
  if (!meta || a.fms_kind !== 'project' || !a.fms_pid) {
    C.toast('That folder is not a film from the studio.', 'error', 5000);
    return false;
  }
  const role = meta.ownedByMe ? 'owner' : (meta.capabilities && meta.capabilities.canEdit) ? 'edit' : (meta.capabilities && meta.capabilities.canComment) ? 'comment' : 'view';
  if ((opts && opts.filesOnly) || !(await s.childrenVisible(folderId))) {
    const files = await P.pick({ token, folderId, kind: 'files' });
    if (!files || !files.length) return false;
  }
  Store.upsertProjectMeta({ id: a.fms_pid, title: meta.name, format: a.fms_format || 'feature' });
  Store.setProjectDrive(a.fms_pid, { folderId, role, picked: true });
  s.adoptFolder(a.fms_pid, folderId, role);
  _lateShown.delete(a.fms_pid);
  await pullProject(a.fms_pid);
  Store.setCurrentProject(a.fms_pid);
  Store.notify('projects:changed', { reason: 'cloud-pull' });
  return true;
}

/* ------------------------------------------------------------
   PRIVATE BUDGET (§55 parity: owner-only in drive mode)
   ------------------------------------------------------------ */
function privacyOf(pid) {
  const st = store().state[pid] || {};
  const owner = roleOf(pid) === 'owner';
  const priv = !!st.budgetPrivate;
  return { known: !!folderOf(pid), private: priv, visible: owner || !priv, canChange: owner, missing: false };
}
export async function budgetPrivacy(pid) { return pid ? privacyOf(pid) : { known: false, private: false, visible: true, canChange: false, missing: false }; }
export async function setBudgetPrivate(pid, on) {
  if (roleOf(pid) !== 'owner') return { ok: false, state: privacyOf(pid), error: '42501' };
  try {
    if (!(await ensureFolder(pid))) return { ok: false, state: privacyOf(pid), error: 'no-folder' };
    await store().setBudgetPrivate(pid, !!on);
    const state = privacyOf(pid);
    Store.notify('cloud:budget-privacy', { projectId: pid, state });
    return { ok: true, state, error: null };
  } catch (e) { return { ok: false, state: privacyOf(pid), error: String((e && e.status) || (e && e.message) || e) }; }
}

/* ------------------------------------------------------------
   DELETE THE CLOUD COPIES — the owned folders go to Drive's trash
   ------------------------------------------------------------ */
export async function deleteOwnedCloudProjects() {
  let rows;
  try { rows = (await store().listProjects()).filter((r) => r.owned); }
  catch (e) { return { ok: false, deleted: 0, failed: [], readError: e.message || String(e) }; }
  await C.setSyncEnabled(false);
  let deleted = 0; const failed = [];
  for (const r of rows) {
    try { await store().trashProject(r.folderId); deleted++; }
    catch (e) { failed.push({ id: r.pid, error: e.message || String(e) }); }
  }
  Store.notify('projects:changed', { reason: 'cloud-delete' });
  return { ok: failed.length === 0, deleted, failed };
}

/* ------------------------------------------------------------
   SCREENING — a pass's export, link-shared, never in a URL
   ------------------------------------------------------------ */
const SCREENING_SCOPES = ['story', 'feature', 'short', 'scenes'];
/** Build screening-<passId>.json for the open (owned) film and
 *  link-share it. → the Drive file id the pass row carries. */
export async function exportScreening(pid, passId, expiresAt) {
  if (roleOf(pid) !== 'owner') throw new Error('Only the film’s owner can make a screening pass.');
  const folderId = await ensureFolder(pid);
  if (!folderId) throw new Error('This film is not in Google Drive yet.');
  const e = entryOf(pid) || {};
  const scopes = {};
  for (const sc of SCREENING_SCOPES) {
    const raw = rawGet(C.KEY_BY_SCOPE[sc] + '__' + pid);
    if (raw == null) continue;
    try { scopes[sc] = JSON.parse(raw); } catch (err) { /* not JSON: left out */ }
  }
  const s = store();
  const id = await s.writeScreening(pid, passId, { v: 1, title: e.title || 'Untitled Project', format: e.format || 'feature', scopes, expires_at: expiresAt || null });
  if (expiresAt) {
    const st = s.state[pid]; st.screenings = Object.assign({}, st.screenings || {}, { [passId]: { id, until: expiresAt } }); saveAccountState(s.state);
  }
  return id;
}
/** The console's half: export, link-share, then put the FILE ID on the
 *  pass (admin_set_screening_file, schema §66). A refusal there undoes
 *  the share, so no readable export is left behind for a pass that does
 *  not point at it. → fileId */
export async function attachScreening(pid, passId, expiresAt) {
  const fileId = await exportScreening(pid, passId, expiresAt);
  try { await C.rpc('admin_set_screening_file', { p_id: passId, p_drive_file_id: fileId }); }
  catch (e) { try { await revokeScreening(passId); } catch (er) { /* the next pull expires it */ } throw e; }
  return fileId;
}
export async function revokeScreening(passId) {
  const s = store();
  for (const [pid, st] of Object.entries(s.state)) {
    const hit = st && st.screenings && st.screenings[passId];
    if (!hit) continue;
    try { await s.unlinkShareFile(hit.id); await s.trashFile(hit.id); } catch (e) { /* the next pull tries again */ continue; }
    delete st.screenings[passId]; saveAccountState(s.state);
    return true;
  }
  return false;
}
async function expireScreenings(pid) {
  const s = store();
  const st = s.state[pid];
  const list = (st && st.screenings) || {};
  let changed = false;
  for (const [pass, x] of Object.entries(list)) {
    if (!x.until || Date.parse(x.until) > Date.now()) continue;
    try { await s.unlinkShareFile(x.id); await s.trashFile(x.id); delete list[pass]; changed = true; } catch (e) { /* again next pull */ }
  }
  if (changed) saveAccountState(s.state);
}

/* ------------------------------------------------------------
   MIGRATION — the server's copy into this account's Drive
   ------------------------------------------------------------ */
let _paused = false;
export function pauseMigration() { _paused = true; }
export async function migrateServer() {
  if (_migrating) return _migrating;
  _migrating = (async () => {
    const run = async () => {
      let list;
      try { list = await C.rpc('drive_migrate_list'); }
      catch (e) { return { done: 0, total: 0, skipped: (e && e.code) || 'unreachable' }; }
      list = Array.isArray(list) ? list : [];
      if (!list.length) return { done: 0, total: 0 };
      _paused = false;
      let ui = null;
      try { ui = (await driveUI()).openMigrationSheet({ total: list.length, titles: list.map((r) => r.title), onPause: () => { _paused = true; } }); }
      catch (e) { ui = null; }
      const all = readAll();
      const mig = all.migrate && typeof all.migrate === 'object' ? all.migrate : {};
      const s = store();
      try {
        const res = await runMigration({
          rpc: C.rpc, ds: s, state: mig, list,
          save: () => writePart('migrate', mig),
          hash: canonicalHash,
          listComments: (pid) => C.listCommentsServer(pid),
          shouldStop: () => _paused,
          onProgress: (p) => { if (ui) ui.update(p); if (p.step === 'done') finishProject(p.pid, mig[p.pid]); },
          applyLocal: (pid, scope, value) => applyMigrated(pid, scope, value, list.find((r) => (r.project_id || r.id) === pid))
        });
        if (ui) ui.done(res);
        Store.notify('projects:changed', { reason: 'cloud-pull' });
        return res;
      } catch (e) {
        if (ui) ui.stopped(e);
        if (!(e && e.paused)) driveFailed(e, 'moving to Drive');
        return { error: e };
      }
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.locks && navigator.locks.request) {
        return await navigator.locks.request('fms-drive-migrate', { ifAvailable: true }, async (lock) => (lock ? run() : { done: 0, total: 0, locked: true }));
      }
      return await run();
    } finally { _migrating = null; }
  })();
  return _migrating;
}
async function applyMigrated(pid, scope, value, row) {
  const key = C.KEY_BY_SCOPE[scope];
  if (!key) return;
  if (!entryOf(pid)) Store.upsertProjectMeta({ id: pid, title: (row && row.title) || 'Untitled Project', format: (row && row.format) || 'feature' });
  const nsKey = key + '__' + pid;
  const local = rawGet(nsKey);
  const text = JSON.stringify(value);
  if (local === text) return;
  if (local != null) {
    let same = false;
    try { same = (await canonicalHash(JSON.parse(local))) === (await canonicalHash(value)); } catch (e) { same = false; }
    if (same) return;
    C.salvage(pid, scope, local);
  }
  C.applyingRemote(() => rawSet(nsKey, text));
}
function finishProject(pid, m) {
  if (!m || !m.folderId) return;
  Store.setProjectDrive(pid, { folderId: m.folderId, role: 'owner' });
  store().adoptFolder(pid, m.folderId, 'owner');
}

export default {
  init, status, markGranted, pullProjectList, pullProjectData, uploadProjects, onSaved, flushAll, pending,
  attachToCurrentProject, onProjectsChanged, listComments, createComment, updateCommentStatus, deleteComment,
  getProjectRole, shareByEmail, listShares, revokeShare, createShare, handleDriveLink, openShared,
  budgetPrivacy, setBudgetPrivate, deleteOwnedCloudProjects, exportScreening, attachScreening, revokeScreening,
  migrateServer, pauseMigration, DriveError
};
