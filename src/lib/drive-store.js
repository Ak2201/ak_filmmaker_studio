/* ============================================================
   DRIVE STORE — a project's content as files in the user's Drive
   ------------------------------------------------------------
   The adapter for DRIVE-ONLY STORAGE (docs/DRIVE-STORAGE.md). It
   knows the folder layout and the sync rules; it does NOT know the
   browser. Everything that leaves this module goes through the one
   injected `transport`:

     transport.request(method, url, { query, headers, body, keepalive })
       → { status, text, json, headers }      (never throws on an HTTP status)

   so scripts/test-drive-store.mjs drives every branch against an
   in-memory Drive (scripts/fake-drive.mjs) with no Google account,
   and src/lib/drive.js supplies the real one (token, 401 retry).

   PURE APART FROM THE TRANSPORT. No store.js, no cloud.js, no DOM,
   no localStorage. The ids and revisions it learns live in `state`,
   which the CALLER persists (drive-project-sync.js keeps it in
   `fms_drive_sync_v1.store`) — `onState` fires after a change, never
   on a read, so an idle page writes nothing.

   LAYOUT (one root, one folder per project, one file per scope):
     FilmMakerStudio/                     appProperties fms_kind=root
       <project title>/                   fms_kind=project, fms_pid
         project.json                     fms_kind=meta  (the manifest)
         <scope>.json                     fms_kind=scope, fms_scope
         comments.json                    fms_kind=comments
         frames/                          fms_kind=frames
         screening-<pass>.json            fms_kind=screening
       Private — <title>/                 fms_kind=private (owner only)
   Files are found by appProperties, never by name: a rename (or a
   user tidying their Drive) must not lose a film.

   THE SYNC RULE, per scope. `state[pid].files[scope]` is
   `{ id, rev, hash }`: the head revision this device last AGREED
   with, and the canonical hash of that content. Local is DIRTY when
   its hash differs from `hash`; the remote MOVED when its head
   differs from `rev`. Both at once is a conflict:
     - a scope with a merger merges three-way against the base
       revision (script/story only while co-editing is on; write
       goals always, it is a union);
     - otherwise, or when Drive has pruned the base revision, the
       remote wins in storage and the local copy is handed back as
       `salvage` — the caller keeps it in the recovered-copies list.
   Nothing is ever uploaded over a head this device has not seen.
   ============================================================ */
import { mergeScriptRaw } from './script-merge.js';
import { mergeStoryRaw } from './story-merge.js';
import { mergeWriteGoals } from './write-goals-merge.js';

export const API = 'https://www.googleapis.com';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';
export const JSON_MIME = 'application/json';
/* The root folder's NAME (it is found by appProperties, never by name);
   the caller passes the product name from brand.json (`rootName`). */
export const ROOT_NAME = 'Studio';
export const LAYOUT_VERSION = '1';
/* Simple multipart below this, resumable at or above (Drive's own
   guidance). A script is typically 50–500 KB. */
export const RESUMABLE_AT = 5 * 1024 * 1024;
/* A comment a COMMENTER posts through Drive's Comments API, because a
   commenter cannot write comments.json. A writer's next pull folds it
   in and deletes the Drive comment. */
export const COMMENT_PREFIX = 'FMSC1:';
/* The two scopes a private budget moves into the owner-only folder. */
export const BUDGET_SCOPES = ['library', 'costs'];
/* Scopes with a three-way merger; script/story only while the
   co-editing switch (schema §49) is on, exactly as on Supabase. */
const COEDIT = { script: mergeScriptRaw, story: mergeStoryRaw };

/* ------------------------------------------------------------
   CANONICAL HASH — "is this the same document?" across key order
   ------------------------------------------------------------ */
export function canonicalize(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
  if (Array.isArray(v)) return '[' + v.map((x) => canonicalize(x === undefined ? null : x)).join(',') + ']';
  return '{' + Object.keys(v).filter((k) => v[k] !== undefined).sort()
    .map((k) => JSON.stringify(k) + ':' + canonicalize(v[k])).join(',') + '}';
}
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
/** SHA-256 hex of the canonical form. WebCrypto in a browser and in
 *  Node ≥ 19 (globalThis.crypto.subtle); node:crypto otherwise. */
export async function canonicalHash(value) {
  const text = canonicalize(value);
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (subtle && typeof TextEncoder !== 'undefined') {
    return hex(await subtle.digest('SHA-256', new TextEncoder().encode(text)));
  }
  const { createHash } = await import(/* @vite-ignore */ 'node:' + 'crypto');
  return createHash('sha256').update(text).digest('hex');
}
const parse = (t) => { if (t == null) return null; try { return JSON.parse(t); } catch (e) { return undefined; } };

/* ------------------------------------------------------------
   ERRORS — what Drive said, never a guessed cause
   ------------------------------------------------------------ */
export class DriveError extends Error {
  constructor(status, message, reason) {
    super(message || ('Google Drive answered ' + status));
    this.name = 'DriveError';
    this.status = status;
    this.reason = reason || '';
  }
}
function fail(res, what) {
  const body = res && res.json && typeof res.json === 'object' ? res.json : null;
  const err = body && body.error;
  const reason = err && Array.isArray(err.errors) && err.errors[0] ? err.errors[0].reason : (err && err.status) || '';
  const msg = (what ? what + ': ' : '') + 'Google Drive answered ' + res.status + (err && err.message ? ' (' + err.message + ')' : '');
  return new DriveError(res.status, msg, reason);
}

/* Drive query literals: backslash and single quote escaped. */
const lit = (s) => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const appProp = (k, v) => 'appProperties has { key=' + lit(k) + ' and value=' + lit(v) + ' }';

/* ------------------------------------------------------------
   PURE MERGE DECISION
   ------------------------------------------------------------ */
/** What to do when both sides changed. → { kind:'merged', text } |
 *  { kind:'keep-both' }. `baseText` null means Drive no longer has the
 *  base revision (or there never was one). */
export function resolveConflict({ scope, localText, remoteText, baseText, coEdit }) {
  if (scope === 'write_goals') {
    return { kind: 'merged', text: mergeWriteGoals(localText, remoteText, false) };
  }
  if (coEdit && COEDIT[scope] && baseText != null) {
    const base = parse(baseText);
    if (base === undefined) return { kind: 'keep-both' };
    return { kind: 'merged', text: COEDIT[scope](localText, parse(remoteText) || {}, base) };
  }
  return { kind: 'keep-both' };
}

/** Comments are merged by id: the union of both lists, and for an id
 *  both have, the later `updated_at` (a tombstone `deleted:true` is
 *  an item like any other, so a delete survives a merge). Sorted by
 *  `created_at` so the file is stable. Pure. */
export function mergeCommentItems(a, b) {
  const by = new Map();
  const t = (x) => Date.parse((x && (x.updated_at || x.created_at)) || '') || 0;
  for (const x of [].concat(a || [], b || [])) {
    if (!x || !x.id) continue;
    const cur = by.get(x.id);
    if (!cur || t(x) > t(cur) || (t(x) === t(cur) && canonicalize(x) > canonicalize(cur))) by.set(x.id, x);
  }
  return [...by.values()].sort((x, y) =>
    (Date.parse(x.created_at || '') || 0) - (Date.parse(y.created_at || '') || 0) || String(x.id).localeCompare(String(y.id)));
}

/** Role mapping between the studio's words and Drive's. */
export const DRIVE_ROLE = { edit: 'writer', comment: 'commenter', view: 'reader', owner: 'owner' };
export const STUDIO_ROLE = { owner: 'owner', organizer: 'owner', fileOrganizer: 'edit', writer: 'edit', commenter: 'comment', reader: 'view' };

/* ============================================================
   THE STORE
   ============================================================ */
export function createDriveStore(opts) {
  const o = opts || {};
  const transport = o.transport;
  if (!transport || typeof transport.request !== 'function') throw new Error('createDriveStore needs a transport');
  const now = o.now || (() => Date.now());
  const scopes = new Set(o.scopes || []);
  const state = (o.state && typeof o.state === 'object') ? o.state : {};
  const onState = typeof o.onState === 'function' ? o.onState : () => {};
  const changed = () => { try { onState(state); } catch (e) { /* the caller's */ } };

  async function req(method, path, ropts) {
    const r = ropts || {};
    const url = path.startsWith('http') ? path : API + path;
    const res = await transport.request(method, url, r);
    return res;
  }
  async function ok(method, path, ropts, what) {
    const res = await req(method, path, ropts);
    if (res.status < 200 || res.status >= 300) throw fail(res, what);
    return res;
  }
  const LIST_FIELDS = 'nextPageToken,files(id,name,mimeType,parents,appProperties,headRevisionId,modifiedTime,trashed,capabilities/canEdit,capabilities/canComment,owners/emailAddress,ownedByMe)';
  async function list(q, fields) {
    const out = [];
    let pageToken;
    for (let i = 0; i < 50; i++) {
      const res = await ok('GET', '/drive/v3/files', { query: {
        q, fields: fields || LIST_FIELDS, spaces: 'drive', pageSize: 1000,
        includeItemsFromAllDrives: true, supportsAllDrives: true, pageToken
      } }, 'list');
      const b = res.json || {};
      out.push(...(b.files || []));
      if (!b.nextPageToken) break;
      pageToken = b.nextPageToken;
    }
    return out;
  }
  async function createFolder(name, parent, props) {
    const res = await ok('POST', '/drive/v3/files', {
      query: { fields: 'id,name,parents,appProperties', supportsAllDrives: true },
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: parent ? [parent] : undefined, appProperties: props })
    }, 'create folder');
    return res.json;
  }
  /* One request for a new file: multipart under RESUMABLE_AT, a
     resumable session above it. */
  async function createFile(name, parent, props, text) {
    const meta = { name, mimeType: JSON_MIME, parents: [parent], appProperties: props };
    if (String(text).length >= RESUMABLE_AT) return resumable('POST', '/upload/drive/v3/files', meta, text, 'create file');
    const boundary = 'fms' + Math.random().toString(36).slice(2);
    const body = '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) +
      '\r\n--' + boundary + '\r\nContent-Type: ' + JSON_MIME + '\r\n\r\n' + text + '\r\n--' + boundary + '--';
    const res = await ok('POST', '/upload/drive/v3/files', {
      query: { uploadType: 'multipart', fields: 'id,headRevisionId,parents', supportsAllDrives: true },
      headers: { 'Content-Type': 'multipart/related; boundary=' + boundary }, body
    }, 'create file');
    return res.json;
  }
  async function updateFile(id, text, ropts) {
    if (String(text).length >= RESUMABLE_AT) return resumable('PATCH', '/upload/drive/v3/files/' + encodeURIComponent(id), null, text, 'upload');
    const res = await ok('PATCH', '/upload/drive/v3/files/' + encodeURIComponent(id), {
      query: { uploadType: 'media', fields: 'id,headRevisionId', supportsAllDrives: true },
      headers: { 'Content-Type': JSON_MIME }, body: text,
      keepalive: !!(ropts && ropts.keepalive) && String(text).length < 64 * 1024
    }, 'upload');
    return res.json;
  }
  async function resumable(method, path, meta, text, what) {
    const start = await ok(method, path, {
      query: { uploadType: 'resumable', fields: 'id,headRevisionId,parents', supportsAllDrives: true },
      headers: { 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': JSON_MIME },
      body: meta ? JSON.stringify(meta) : undefined
    }, what);
    const loc = start.headers && (start.headers.location || start.headers.Location);
    if (!loc) throw new DriveError(start.status, what + ': Google Drive gave no upload address');
    /* The bearer token rides on the next request: only ever to Google. */
    if (!String(loc).startsWith(API + '/')) throw new DriveError(start.status, what + ': the upload address was not Google Drive’s');
    const res = await ok('PUT', loc, { headers: { 'Content-Type': JSON_MIME }, body: text }, what);
    return res.json;
  }
  async function getMeta(id, fields) {
    const res = await req('GET', '/drive/v3/files/' + encodeURIComponent(id), { query: { fields: fields || 'id,name,headRevisionId,parents,trashed,appProperties', supportsAllDrives: true } });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw fail(res, 'read');
    return res.json;
  }
  async function download(id) {
    const res = await req('GET', '/drive/v3/files/' + encodeURIComponent(id), { query: { alt: 'media', supportsAllDrives: true } });
    if (res.status === 404) return null;
    if (res.status < 200 || res.status >= 300) throw fail(res, 'download');
    return res.text;
  }
  async function readRevision(fileId, revId) {
    if (!fileId || !revId) return null;
    const res = await req('GET', '/drive/v3/files/' + encodeURIComponent(fileId) + '/revisions/' + encodeURIComponent(revId), { query: { alt: 'media' } });
    if (res.status === 404 || res.status === 410) return null;   // pruned: the caller keeps both
    if (res.status < 200 || res.status >= 300) throw fail(res, 'revision');
    return res.text;
  }
  async function listRevisions(fileId) {
    const res = await ok('GET', '/drive/v3/files/' + encodeURIComponent(fileId) + '/revisions', { query: { fields: 'revisions(id,modifiedTime)', pageSize: 1000 } }, 'revisions');
    return (res.json && res.json.revisions) || [];
  }

  /* ---------------- per-project state ---------------- */
  function ps(pid) {
    if (!state[pid] || typeof state[pid] !== 'object') state[pid] = { files: {} };
    if (!state[pid].files) state[pid].files = {};
    return state[pid];
  }
  const known = (pid) => state[pid] && state[pid].folderId ? state[pid] : null;

  /* ---------------- root + folders ---------------- */
  /* ONE IN FLIGHT. Several saves land in the same tick (a new project
     writes a handful of scopes at once); without these, each found no
     folder and made its own. */
  let _rootP = null;
  const _folderP = new Map();
  function ensureRoot() {
    if (state.rootId) return Promise.resolve(state.rootId);
    if (!_rootP) _rootP = ensureRootNow().finally(() => { _rootP = null; });
    return _rootP;
  }
  async function ensureRootNow() {
    if (state.rootId) return state.rootId;
    const found = await list(appProp('fms_kind', 'root') + ' and trashed = false', 'files(id,name,ownedByMe)');
    const mine = found.filter((f) => f.ownedByMe !== false);
    if (mine.length) { state.rootId = mine[0].id; changed(); return state.rootId; }
    const f = await createFolder(o.rootName || ROOT_NAME, null, { fms_kind: 'root', fms_v: LAYOUT_VERSION });
    state.rootId = f.id; changed();
    return f.id;
  }
  /** Every project folder this account can see (created by the app or
   *  picked by the user), with what this account may do in it. */
  async function listProjects() {
    const rows = await list(appProp('fms_kind', 'project') + ' and trashed = false');
    return rows.map((f) => ({
      folderId: f.id,
      pid: (f.appProperties && f.appProperties.fms_pid) || '',
      format: (f.appProperties && f.appProperties.fms_format) || 'feature',
      title: f.name,
      modifiedTime: f.modifiedTime,
      owned: f.ownedByMe !== false,
      owner: f.owners && f.owners[0] ? f.owners[0].emailAddress : '',
      role: f.ownedByMe !== false ? 'owner'
        : (f.capabilities && f.capabilities.canEdit) ? 'edit'
        : (f.capabilities && f.capabilities.canComment) ? 'comment' : 'view'
    })).filter((r) => r.pid);
  }
  async function findProjectFolder(pid) {
    const rows = await list(appProp('fms_kind', 'project') + ' and ' + appProp('fms_pid', pid) + ' and trashed = false', 'files(id,name,ownedByMe)');
    return rows.length ? rows[0].id : null;
  }
  /** Find-or-create the folder for `meta.id` (a rerun reuses it), and
   *  write project.json. → folderId */
  function createProjectFolder(meta) {
    const id = meta && meta.id;
    if (!_folderP.has(id)) _folderP.set(id, createProjectFolderNow(meta).finally(() => _folderP.delete(id)));
    return _folderP.get(id);
  }
  async function createProjectFolderNow(meta) {
    const m = meta || {};
    const root = await ensureRoot();
    let folderId = known(m.id) ? state[m.id].folderId : await findProjectFolder(m.id);
    if (!folderId) {
      const f = await createFolder(String(m.title || 'Untitled Project').slice(0, 200), root,
        { fms_kind: 'project', fms_pid: m.id, fms_format: m.format || 'feature', fms_v: LAYOUT_VERSION });
      folderId = f.id;
    }
    const p = ps(m.id);
    p.folderId = folderId; p.role = 'owner';
    changed();
    /* comments.json from the start, so a commenter (who cannot create
       files) always has the file to post Drive comments on. */
    await commentsFile(m.id, true);
    const cur = await readMeta(folderId).catch(() => null);
    if (!cur || !cur.meta) {
      await writeMeta(folderId, { v: 1, id: m.id, title: m.title || 'Untitled Project', format: m.format || 'feature',
        region: m.region || undefined, sample: m.sample || undefined, createdAt: m.createdAt || new Date(now()).toISOString(), files: {} }, m.id);
    }
    return folderId;
  }
  async function findIn(folderId, kind, extra) {
    const q = "'" + folderId + "' in parents and " + appProp('fms_kind', kind) + (extra ? ' and ' + extra : '') + ' and trashed = false';
    const rows = await list(q);
    return rows[0] || null;
  }
  /** project.json → { fileId, rev, meta } (meta null when absent). */
  async function readMeta(folderId) {
    const f = await findIn(folderId, 'meta');
    if (!f) return { fileId: null, rev: null, meta: null };
    const text = await download(f.id);
    return { fileId: f.id, rev: f.headRevisionId || null, meta: parse(text) || null };
  }
  async function writeMeta(folderId, meta, pidHint) {
    const text = JSON.stringify(meta);
    const pid = (meta && meta.id) || pidHint;
    const p = pid ? ps(pid) : null;
    let id = p && p.metaId;
    if (!id) { const f = await findIn(folderId, 'meta'); id = f && f.id; }
    const out = id ? await updateFile(id, text) : await createFile('project.json', folderId, { fms_kind: 'meta', fms_pid: pid || '' }, text);
    if (p) { p.metaId = out.id || id; changed(); }
    return out;
  }
  async function renameProject(pid, title) {
    const p = known(pid); if (!p) return false;
    await ok('PATCH', '/drive/v3/files/' + encodeURIComponent(p.folderId), { query: { fields: 'id', supportsAllDrives: true }, headers: { 'Content-Type': JSON_MIME }, body: JSON.stringify({ name: String(title || 'Untitled Project').slice(0, 200) }) }, 'rename');
    const cur = await readMeta(p.folderId);
    if (cur.meta) { cur.meta.title = title; await writeMeta(p.folderId, cur.meta, pid); }
    return true;
  }
  /** Adopt a folder found by listing / picking into the state. */
  function adoptFolder(pid, folderId, role) {
    const p = ps(pid);
    if (p.folderId === folderId && p.role === role) return p;
    p.folderId = folderId; p.role = role || p.role || 'owner';
    changed();
    return p;
  }

  /* ---------------- scope files ---------------- */
  /** One call: every file in the folder (and in the private folder, if
   *  any) with its head revision. → Map scope → { id, rev } plus
   *  `comments`, `meta`, `frames`. */
  async function folderIndex(pid) {
    const p = known(pid); if (!p) throw new DriveError(404, 'This film has no Drive folder on this device');
    const parents = [p.folderId].concat(p.privateId ? [p.privateId] : []);
    const q = '(' + parents.map((id) => "'" + id + "' in parents").join(' or ') + ') and trashed = false';
    const rows = await list(q, 'nextPageToken,files(id,name,mimeType,headRevisionId,appProperties)');
    const idx = { scopes: {}, comments: null, meta: null, frames: null, screening: [] , count: rows.length };
    for (const f of rows) {
      const a = f.appProperties || {};
      if (a.fms_kind === 'scope' && a.fms_scope) idx.scopes[a.fms_scope] = { id: f.id, rev: f.headRevisionId || null };
      else if (a.fms_kind === 'comments') idx.comments = { id: f.id, rev: f.headRevisionId || null };
      else if (a.fms_kind === 'meta') idx.meta = { id: f.id, rev: f.headRevisionId || null };
      else if (a.fms_kind === 'frames') idx.frames = { id: f.id };
      else if (a.fms_kind === 'screening') idx.screening.push({ id: f.id, pass: a.fms_pass || '' });
    }
    return idx;
  }
  async function findScopeFile(pid, scope) {
    const p = known(pid);
    for (const parent of [p.folderId].concat(p.privateId ? [p.privateId] : [])) {
      const f = await findIn(parent, 'scope', appProp('fms_scope', scope));
      if (f) return { id: f.id, rev: f.headRevisionId || null };
    }
    return null;
  }
  async function head(id) {
    const m = await getMeta(id, 'id,headRevisionId,trashed');
    return m && !m.trashed ? (m.headRevisionId || null) : null;
  }
  async function pullScope(pid, scope) {
    const p = known(pid); if (!p) return null;
    const f = p.files[scope] && p.files[scope].id ? p.files[scope] : await findScopeFile(pid, scope);
    if (!f) return null;
    const m = await getMeta(f.id, 'id,headRevisionId');
    if (!m) return null;
    const text = await download(f.id);
    return { id: f.id, rev: m.headRevisionId || null, text, value: parse(text) };
  }
  async function record(pid, scope, id, rev, value) {
    const p = ps(pid);
    p.files[scope] = { id, rev, hash: await canonicalHash(value) };
    changed();
    return p.files[scope];
  }
  /* Upload `text` over file `id` whose head must still be `expect`.
     → { rev } | { moved: headNow }. After the upload, the revision list
     says whether somebody else's revision landed between our check and
     our write (Drive has no compare-and-swap): `lost` is that text. */
  async function guardedUpload(id, text, expect, ropts) {
    const before = await head(id);
    if (before !== expect) return { moved: before };
    const out = await updateFile(id, text, ropts);
    const rev = out.headRevisionId || null;
    let lost = null;
    try {
      const revs = (await listRevisions(id)).map((r) => r.id);
      const a = revs.indexOf(expect), b = revs.indexOf(rev);
      if (a >= 0 && b > a + 1) lost = { rev: revs[b - 1], text: await readRevision(id, revs[b - 1]) };
    } catch (e) { /* revisions unreadable: nothing more is known */ }
    return { rev, lost };
  }
  /**
   * Push one scope. `localText` is the local JSON text; `o.coEdit` is the
   * §49 switch. → { action, text?, salvage?, rev }
   *   'same'        nothing to send (local equals the agreed copy)
   *   'pushed'      uploaded; the local copy is the head
   *   'merged'      both changed; the merge was uploaded — write `text` locally
   *   'remote-wins' both changed, no merge possible; write `text` locally
   *                 and keep `salvage` (the local copy) in recovered copies
   */
  async function pushScope(pid, scope, localText, o2) {
    const opt = o2 || {};
    const p = known(pid);
    if (!p) throw new DriveError(404, 'This film has no Drive folder on this device');
    const local = parse(localText);
    if (local === undefined || local === null) return { action: 'same' };
    const lh = await canonicalHash(local);
    let f = p.files[scope];
    if (f && f.id && lh === f.hash && !opt.force) return { action: 'same', rev: f.rev };
    if (!f || !f.id) {
      const found = await findScopeFile(pid, scope);
      if (!found) {
        const parent = (p.privateId && BUDGET_SCOPES.includes(scope)) ? p.privateId : p.folderId;
        const made = await createFile(scope + '.json', parent, { fms_kind: 'scope', fms_pid: pid, fms_scope: scope }, JSON.stringify(local));
        await record(pid, scope, made.id, made.headRevisionId || null, local);
        return { action: 'pushed', rev: made.headRevisionId || null };
      }
      /* A file this device never agreed with: another device made it.
         Read it as a conflict with no base, never as a blank to fill. */
      f = { id: found.id, rev: null, hash: null };
    }
    return settle(pid, scope, f, localText, local, opt, 0);
  }
  async function settle(pid, scope, f, localText, local, opt, depth) {
    if (f.rev) {
      const up = await guardedUpload(f.id, JSON.stringify(local), f.rev, opt);
      if (!up.moved) {
        if (up.lost && up.lost.text != null && depth < 1) {
          /* Somebody's revision landed between our check and our write.
             Merge it back in once, against the copy both started from. */
          const base = await readRevision(f.id, f.rev);
          const r = resolveConflict({ scope, localText: JSON.stringify(local), remoteText: up.lost.text, baseText: base, coEdit: opt.coEdit });
          if (r.kind === 'merged') {
            const mergedVal = parse(r.text);
            await record(pid, scope, f.id, up.rev, local);
            return Object.assign(await settle(pid, scope, { id: f.id, rev: up.rev, hash: null }, r.text, mergedVal, opt, depth + 1), { action: 'merged', text: r.text });
          }
          /* No merge: their copy goes back on top, ours is salvaged. */
          const back = await guardedUpload(f.id, up.lost.text, up.rev, opt);
          await record(pid, scope, f.id, back.rev || up.rev, parse(up.lost.text));
          return { action: 'remote-wins', text: up.lost.text, salvage: localText, rev: back.rev || up.rev };
        }
        await record(pid, scope, f.id, up.rev, local);
        return { action: 'pushed', rev: up.rev };
      }
      if (up.moved === null) {
        /* The file is gone (trashed or deleted elsewhere): forget it and
           make a fresh one rather than writing into the void. */
        delete ps(pid).files[scope]; changed();
        return pushScope(pid, scope, localText, Object.assign({}, opt, { force: true }));
      }
    }
    /* The head moved (or this device never had one): a conflict. */
    const remoteRev = await head(f.id);
    const remoteText = await download(f.id);
    if (remoteText == null) { delete ps(pid).files[scope]; changed(); return pushScope(pid, scope, localText, opt); }
    const remote = parse(remoteText);
    if (remote !== undefined && (await canonicalHash(remote)) === (await canonicalHash(local))) {
      await record(pid, scope, f.id, remoteRev, remote);
      return { action: 'same', rev: remoteRev };
    }
    const baseText = f.rev ? await readRevision(f.id, f.rev) : null;
    const r = resolveConflict({ scope, localText: JSON.stringify(local), remoteText, baseText, coEdit: opt.coEdit });
    if (r.kind === 'merged' && depth < 3) {
      const mv = parse(r.text);
      const out = await settle(pid, scope, { id: f.id, rev: remoteRev, hash: null }, r.text, mv, opt, depth + 1);
      if (out.action === 'pushed' || out.action === 'same') return { action: 'merged', text: r.text, rev: out.rev };
      return out;
    }
    await record(pid, scope, f.id, remoteRev, remote === undefined ? {} : remote);
    return { action: 'remote-wins', text: remoteText, salvage: localText, rev: remoteRev };
  }
  /**
   * Pull one scope whose remote head is `remote` ({id, rev}). `localText`
   * is the local copy (null when none). → { action, text?, salvage? }
   *   'same'     nothing changed (or the remote equals local)
   *   'applied'  local was clean: write `text`
   *   'merged'   both changed: the merge is uploaded too; write `text`
   *   'remote-wins' both changed, no merge: write `text`, keep `salvage`
   */
  async function pullScopeInto(pid, scope, localText, remote, o2) {
    const opt = o2 || {};
    const p = known(pid); if (!p) return { action: 'same' };
    const f = p.files[scope];
    if (f && f.id === remote.id && f.rev && f.rev === remote.rev) return { action: 'same' };
    const remoteText = await download(remote.id);
    if (remoteText == null) return { action: 'same' };
    const rv = parse(remoteText);
    if (rv === undefined) return { action: 'same' };
    const rh = await canonicalHash(rv);
    const lv = parse(localText);
    const lh = lv == null || lv === undefined ? null : await canonicalHash(lv);
    const clean = lh === null || (f && f.hash === lh) || lh === rh || (lv && typeof lv === 'object' && !Array.isArray(lv) && !Object.keys(lv).length);
    if (clean) {
      await record(pid, scope, remote.id, remote.rev, rv);
      return lh === rh ? { action: 'same' } : { action: 'applied', text: remoteText };
    }
    const baseText = f && f.rev && f.id === remote.id ? await readRevision(remote.id, f.rev) : null;
    const r = resolveConflict({ scope, localText: JSON.stringify(lv), remoteText, baseText, coEdit: opt.coEdit });
    if (r.kind === 'merged') {
      const mv = parse(r.text);
      if ((await canonicalHash(mv)) === rh) { await record(pid, scope, remote.id, remote.rev, rv); return { action: 'applied', text: remoteText }; }
      const out = await settle(pid, scope, { id: remote.id, rev: remote.rev, hash: null }, r.text, mv, opt, 1);
      if (out.action === 'pushed' || out.action === 'same') return { action: 'merged', text: r.text };
      return out;
    }
    await record(pid, scope, remote.id, remote.rev, rv);
    return { action: 'remote-wins', text: remoteText, salvage: localText };
  }
  /** Write `value` as the scope's file whatever is there (the migration
   *  writes the server's copy; it is the source), find-or-create by
   *  appProperties, and record it as agreed. → { id, rev } */
  async function putScope(pid, scope, value) {
    const p = known(pid); if (!p) throw new DriveError(404, 'This film has no Drive folder on this device');
    const text = JSON.stringify(value);
    let f = p.files[scope] && p.files[scope].id ? { id: p.files[scope].id } : await findScopeFile(pid, scope);
    let out = null;
    if (f) {
      try { out = await updateFile(f.id, text); }
      catch (e) { if (e.status !== 404) throw e; f = null; }
    }
    if (!f) {
      const parent = (p.privateId && BUDGET_SCOPES.includes(scope)) ? p.privateId : p.folderId;
      out = await createFile(scope + '.json', parent, { fms_kind: 'scope', fms_pid: pid, fms_scope: scope }, text);
    }
    const id = (out && out.id) || f.id;
    await record(pid, scope, id, (out && out.headRevisionId) || null, value);
    return { id, rev: (out && out.headRevisionId) || null };
  }
  /** Is the local copy different from the agreed one? */
  async function isDirty(pid, scope, localText) {
    const p = known(pid); if (!p) return false;
    const lv = parse(localText);
    if (lv == null || lv === undefined) return false;
    const f = p.files[scope];
    return !f || (await canonicalHash(lv)) !== f.hash;
  }

  /* ---------------- comments ---------------- */
  async function commentsFile(pid, create) {
    const p = known(pid); if (!p) return null;
    if (p.commentsId) return { id: p.commentsId };
    const f = await findIn(p.folderId, 'comments');
    if (f) { p.commentsId = f.id; changed(); return { id: f.id, rev: f.headRevisionId }; }
    if (!create) return null;
    const made = await createFile('comments.json', p.folderId, { fms_kind: 'comments', fms_pid: pid }, JSON.stringify({ v: 1, items: [] }));
    p.commentsId = made.id; p.commentsRev = made.headRevisionId || null; changed();
    return { id: made.id, rev: made.headRevisionId };
  }
  /** → { items, rev } (items include tombstones; callers filter). */
  async function readComments(pid) {
    const f = await commentsFile(pid, false);
    if (!f) return { items: [], rev: null };
    const m = await getMeta(f.id, 'id,headRevisionId');
    if (!m) { const p = ps(pid); delete p.commentsId; changed(); return { items: [], rev: null }; }
    const text = await download(f.id);
    const v = parse(text) || {};
    return { items: Array.isArray(v.items) ? v.items : [], rev: m.headRevisionId || null };
  }
  /** Read-modify-write: `change(items)` → new items. Retries on a moved
   *  head, merging by id each time. → { items, rev } */
  async function updateComments(pid, change) {
    const f = await commentsFile(pid, true);
    for (let i = 0; i < 4; i++) {
      const cur = await readComments(pid);
      const next = mergeCommentItems(cur.items, change(cur.items.slice()));
      if (canonicalize(next) === canonicalize(mergeCommentItems(cur.items, []))) return { items: next, rev: cur.rev };
      const up = await guardedUpload(f.id, JSON.stringify({ v: 1, items: next }), cur.rev);
      if (!up.moved) {
        if (up.lost && up.lost.text != null) {
          const lostItems = (parse(up.lost.text) || {}).items || [];
          const both = mergeCommentItems(next, lostItems);
          if (canonicalize(both) !== canonicalize(next)) { await guardedUpload(f.id, JSON.stringify({ v: 1, items: both }), up.rev); }
        }
        const p = ps(pid); p.commentsRev = up.rev; changed();
        return { items: next, rev: up.rev };
      }
    }
    throw new DriveError(409, 'The comments file kept changing; try again');
  }
  const writeComments = (pid, items) => updateComments(pid, () => items);
  /** A commenter's write: a Drive comment on comments.json carrying the
   *  item. → the Drive comment id. Throws (403) when Drive refuses —
   *  the caller then shows the role as read-only (Fallback B). */
  async function postCommenterItem(pid, item) {
    const f = await commentsFile(pid, false);
    if (!f) throw new DriveError(404, 'This film has no comments file yet; ask the owner to open it once');
    const res = await ok('POST', '/drive/v3/files/' + encodeURIComponent(f.id) + '/comments', {
      query: { fields: 'id' }, headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({ content: COMMENT_PREFIX + JSON.stringify(item) })
    }, 'comment');
    return res.json && res.json.id;
  }
  /** A writer's pull: fold every FMSC1 Drive comment into comments.json,
   *  then delete those Drive comments. → number folded. */
  async function foldCommenterItems(pid) {
    const f = await commentsFile(pid, false);
    if (!f) return 0;
    const res = await req('GET', '/drive/v3/files/' + encodeURIComponent(f.id) + '/comments', { query: { fields: 'comments(id,content,author(emailAddress,displayName),createdTime)', pageSize: 100 } });
    if (res.status < 200 || res.status >= 300) return 0;
    const rows = ((res.json && res.json.comments) || []).filter((c) => String(c.content || '').startsWith(COMMENT_PREFIX));
    if (!rows.length) return 0;
    const items = [];
    for (const c of rows) {
      const it = parse(String(c.content).slice(COMMENT_PREFIX.length));
      if (!it || !it.id) continue;
      /* The author is whoever Drive says posted it, never what the item claims. */
      const who = c.author || {};
      items.push(Object.assign({}, it, { author_email: who.emailAddress || it.author_email || '', author_name: who.displayName || who.emailAddress || it.author_name || '' }));
    }
    await updateComments(pid, (cur) => cur.concat(items));
    for (const c of rows) {
      await req('DELETE', '/drive/v3/files/' + encodeURIComponent(f.id) + '/comments/' + encodeURIComponent(c.id), {});
    }
    return items.length;
  }

  /* ---------------- sharing ---------------- */
  async function share(folderId, email, role, message) {
    const res = await ok('POST', '/drive/v3/files/' + encodeURIComponent(folderId) + '/permissions', {
      query: { sendNotificationEmail: true, emailMessage: message || undefined, fields: 'id,emailAddress,role', supportsAllDrives: true },
      headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({ type: 'user', role: DRIVE_ROLE[role] || role, emailAddress: email })
    }, 'share');
    return res.json;
  }
  async function listPermissions(folderId) {
    const res = await ok('GET', '/drive/v3/files/' + encodeURIComponent(folderId) + '/permissions', {
      query: { fields: 'permissions(id,emailAddress,role,displayName,type)', supportsAllDrives: true }
    }, 'permissions');
    return ((res.json && res.json.permissions) || []).filter((x) => x.role !== 'owner');
  }
  async function revoke(folderId, permId) {
    const res = await req('DELETE', '/drive/v3/files/' + encodeURIComponent(folderId) + '/permissions/' + encodeURIComponent(permId), { query: { supportsAllDrives: true } });
    if (res.status === 404) return false;
    if (res.status < 200 || res.status >= 300) throw fail(res, 'revoke');
    return true;
  }
  /** Anyone with the link may READ this one file. → permission id. */
  async function linkShareFile(fileId) {
    const res = await ok('POST', '/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions', {
      query: { fields: 'id', supportsAllDrives: true }, headers: { 'Content-Type': JSON_MIME },
      body: JSON.stringify({ type: 'anyone', role: 'reader', allowFileDiscovery: false })
    }, 'link share');
    return res.json && res.json.id;
  }
  async function unlinkShareFile(fileId) {
    const perms = await req('GET', '/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions', { query: { fields: 'permissions(id,type)' } });
    if (perms.status === 404) return false;
    if (perms.status < 200 || perms.status >= 300) throw fail(perms, 'link share');
    let n = 0;
    for (const x of (perms.json && perms.json.permissions) || []) {
      if (x.type !== 'anyone') continue;
      await req('DELETE', '/drive/v3/files/' + encodeURIComponent(fileId) + '/permissions/' + encodeURIComponent(x.id), {});
      n++;
    }
    return n > 0;
  }
  /** Write a screening export for a pass and link-share it. → fileId */
  async function writeScreening(pid, passId, payload) {
    const p = known(pid); if (!p) throw new DriveError(404, 'This film has no Drive folder on this device');
    const made = await createFile('screening-' + passId + '.json', p.folderId, { fms_kind: 'screening', fms_pid: pid, fms_pass: String(passId) }, JSON.stringify(payload));
    await linkShareFile(made.id);
    return made.id;
  }
  async function trashFile(id) {
    const res = await req('PATCH', '/drive/v3/files/' + encodeURIComponent(id), { query: { fields: 'id', supportsAllDrives: true }, headers: { 'Content-Type': JSON_MIME }, body: JSON.stringify({ trashed: true }) });
    if (res.status === 404) return false;
    if (res.status < 200 || res.status >= 300) throw fail(res, 'trash');
    return true;
  }

  /* ---------------- moves, trash, private budget ---------------- */
  async function moveInto(fileId, folderId) {
    const m = await getMeta(fileId, 'id,parents');
    if (!m) return false;
    const from = (m.parents || []).filter((x) => x !== folderId);
    if ((m.parents || []).includes(folderId) && !from.length) return true;
    await ok('PATCH', '/drive/v3/files/' + encodeURIComponent(fileId), {
      query: { addParents: folderId, removeParents: from.join(',') || undefined, fields: 'id,parents', supportsAllDrives: true },
      headers: { 'Content-Type': JSON_MIME }, body: '{}'
    }, 'move');
    return true;
  }
  async function trashProject(folderId) {
    const res = await req('PATCH', '/drive/v3/files/' + encodeURIComponent(folderId), { query: { fields: 'id', supportsAllDrives: true }, headers: { 'Content-Type': JSON_MIME }, body: JSON.stringify({ trashed: true }) });
    if (res.status === 404) return false;
    if (res.status < 200 || res.status >= 300) throw fail(res, 'trash');
    for (const k of Object.keys(state)) if (state[k] && state[k].folderId === folderId) { delete state[k]; changed(); }
    return true;
  }
  async function ensureFrames(pid) {
    const p = known(pid); if (!p) return null;
    if (p.framesId) return p.framesId;
    const f = await findIn(p.folderId, 'frames');
    const id = f ? f.id : (await createFolder('frames', p.folderId, { fms_kind: 'frames', fms_pid: pid })).id;
    p.framesId = id; changed();
    return id;
  }
  /** Keep the budget private: move library/costs into an owner-only
   *  folder in the root (permissions inherit from the folder, so a move
   *  is the only way to hide one file), or back. Records it in
   *  project.json as `budgetPrivate`. */
  async function setBudgetPrivate(pid, on) {
    const p = known(pid); if (!p) throw new DriveError(404, 'This film has no Drive folder on this device');
    const root = await ensureRoot();
    if (on && !p.privateId) {
      const f = (await list(appProp('fms_kind', 'private') + ' and ' + appProp('fms_pid', pid) + ' and trashed = false', 'files(id)'))[0];
      p.privateId = f ? f.id : (await createFolder('Private — ' + pid.slice(0, 8), root, { fms_kind: 'private', fms_pid: pid })).id;
      changed();
    }
    for (const scope of BUDGET_SCOPES) {
      const fl = (p.files[scope] && p.files[scope].id) ? { id: p.files[scope].id } : await findScopeFile(pid, scope);
      if (fl) await moveInto(fl.id, on ? p.privateId : p.folderId);
    }
    const cur = await readMeta(p.folderId);
    const meta = Object.assign({ v: 1, id: pid, files: {} }, cur.meta || {}, { budgetPrivate: !!on });
    await writeMeta(p.folderId, meta, pid);
    p.budgetPrivate = !!on; changed();
    return !!on;
  }
  /** Fallback A detection: the folder is visible but the files inside
   *  it are not (drive.file grants only what was picked). */
  async function childrenVisible(folderId) {
    const rows = await list("'" + folderId + "' in parents and trashed = false", 'files(id)');
    return rows.length > 0;
  }
  async function folderMeta(folderId) {
    return getMeta(folderId, 'id,name,appProperties,ownedByMe,capabilities/canEdit,capabilities/canComment,trashed');
  }

  return {
    state, ensureRoot, listProjects, findProjectFolder, createProjectFolder, readMeta, writeMeta, renameProject, adoptFolder,
    folderIndex, findScopeFile, pullScope, pushScope, putScope, pullScopeInto, isDirty, readRevision, download, record,
    readComments, writeComments, updateComments, postCommenterItem, foldCommenterItems,
    share, listPermissions, revoke, linkShareFile, unlinkShareFile, writeScreening, trashFile,
    moveInto, trashProject, ensureFrames, setBudgetPrivate, childrenVisible, folderMeta,
    _req: req
  };
}

export default { createDriveStore, canonicalHash, canonicalize, resolveConflict, mergeCommentItems, DRIVE_ROLE, STUDIO_ROLE, COMMENT_PREFIX, BUDGET_SCOPES, DriveError };
