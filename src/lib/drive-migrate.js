/* ============================================================
   DRIVE MIGRATION — an account's server content, into its Drive
   ------------------------------------------------------------
   Runs once storage_mode is 'drive' (schema §66) for whatever the
   server still holds for projects this account OWNS. Per project:

     1. find-or-create the Drive folder by fms_pid (a rerun reuses it);
     2. per scope: read the server row → write <scope>.json → READ IT
        BACK → compare canonical hashes → 'verified' (retry once, then
        stop this project with an error);
     3. comments.json, built from the comment rows, verified the same way;
     4. storyboard frames (drive:<id> refs) moved into frames/ — a frame
        the user does not own stays where it is and is reported;
     5. collaborators shared in on the folder, role mapped;
     6. ONLY THEN: drive_migrate_delete_scope(p_data = the read-back
        JSON) per scope — the server deletes a row only if it still
        equals what Drive holds, so a row edited meanwhile survives and
        this goes back to step 2 for it — then the comments, then
        drive_migrate_finish.

   NOTHING IS DELETED BEFORE THE READ-BACK MATCHES. Every step is
   idempotent and its progress is in `state` (the caller keeps it in
   fms_drive_sync_v1.migrate), so a killed run resumes where it
   stopped. Pure apart from what is injected: no store.js, no DOM.
   ============================================================ */
import { canonicalHash as defaultHash } from './drive-store.js';

const COMMENT_COLS = ['id', 'scope', 'field_key', 'author_email', 'author_name', 'body', 'type', 'status', 'parent_id', 'suggest_from', 'suggest_to', 'created_at', 'updated_at'];
export const ROLE_MAP = { edit: 'edit', comment: 'comment', view: 'view', owner: 'edit' };

/** Every `drive:<id>` ref anywhere inside a value (shots, story). */
export function framesIn(value) {
  const out = new Set();
  const walk = (v, depth) => {
    if (depth > 12 || v == null) return;
    if (typeof v === 'string') { const m = v.match(/^drive:([A-Za-z0-9_-]{8,200})$/); if (m) out.add(m[1]); return; }
    if (Array.isArray(v)) { v.forEach((x) => walk(x, depth + 1)); return; }
    if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, depth + 1));
  };
  walk(value, 0);
  return [...out];
}
export function commentItem(row) {
  const out = {};
  for (const k of COMMENT_COLS) if (row[k] !== undefined && row[k] !== null) out[k] = row[k];
  if (!out.author_email && row.author_name) out.author_email = row.author_name;
  if (!out.updated_at) out.updated_at = out.created_at;
  return out;
}
const asList = (x) => (Array.isArray(x) ? x : x == null ? [] : [x]);

const GONE = Symbol('gone');

/** A project whose migration was under way and is no longer listed by
 *  drive_migrate_list has had its server row deleted: drive_migrate_finish
 *  committed and the reply was lost (or the film was deleted). Left
 *  `done: false`, migrating() held it out of Drive sync for good. Marks
 *  each one done and returns their ids, so the caller can attach the
 *  folder. Call it with every answer of the list, an empty one too. */
export function reconcileFinished(state, list) {
  const listed = new Set(asList(list).map((r) => r && (r.project_id || r.id)).filter(Boolean));
  const out = [];
  for (const [pid, m] of Object.entries(state || {})) {
    if (!m || typeof m !== 'object' || m.done || listed.has(pid)) continue;
    m.done = true; m.at = m.at || new Date().toISOString(); m.reconciled = true;
    out.push(pid);
  }
  return out;
}

export class MigrationStopped extends Error {
  constructor(msg, extra) { super(msg); this.name = 'MigrationStopped'; Object.assign(this, extra || {}); }
}

/**
 * @param {object} o
 *   rpc(name, args) → data (throws on a refusal)
 *   ds              a drive-store
 *   state           the migrate map, mutated in place
 *   save()          persist `state`
 *   listComments(pid) → comment rows (the existing read)
 *   onProgress({ pid, title, step, done, total, scope })
 *   shouldStop()    true to pause between steps
 *   applyLocal(pid, scope, value)  the verified copy, for the local store
 *   readBack(pid, scope, fileId)   override for the read-back (tests)
 * @returns {{ done:number, total:number, frames:string[], errors:object[] }}
 */
export async function runMigration(o) {
  const hash = o.hash || defaultHash;
  const state = o.state;
  const save = o.save || (() => {});
  const progress = o.onProgress || (() => {});
  const stop = o.shouldStop || (() => false);
  const ds = o.ds;
  const readBack = o.readBack || ((pid, scope, id) => ds.download(id));
  const checkpoint = () => { if (stop()) throw new MigrationStopped('Paused', { paused: true }); };

  const list = asList(o.list || await o.rpc('drive_migrate_list'));
  const total = list.length;
  let done = 0;
  const framesLeft = [];
  const errors = [];
  for (const row of list) {
    const pid = row.project_id || row.id;
    if (!pid) continue;
    const title = row.title || 'Untitled Project';
    const m = state[pid] && typeof state[pid] === 'object' ? state[pid] : (state[pid] = { localId: pid, scopes: {}, done: false });
    if (!m.scopes) m.scopes = {};
    m.done = false;
    const scopes = asList(row.scopes).map((s) => (typeof s === 'string' ? s : s && s.scope)).filter(Boolean);
    const say = (step, extra) => progress(Object.assign({ pid, title, step, done, total }, extra || {}));
    try {
      checkpoint();
      say('folder');
      m.folderId = await ds.createProjectFolder({ id: pid, title, format: row.format || 'feature' });
      save();

      const verified = new Map();
      /* A ROW THAT IS GONE IS NOT AN EMPTY ROW (review, 31 Oct 2026).
         The list said it existed; if the read now answers null, another
         device or browser profile of this account moved it meanwhile
         (navigator.locks covers one browser only). Writing `{}` here put
         an empty file over the real Drive copy and then emptied this
         device's local copy to match. Gone means already moved: nothing
         is written, nothing is applied. */
      const verify = async (scope) => {
        for (let attempt = 0; attempt < 2; attempt++) {
          checkpoint();
          say('copy', { scope });
          const data = await o.rpc('drive_migrate_read', { p_project: pid, p_scope: scope });
          if (data == null) { m.scopes[scope] = 'deleted'; verified.delete(scope); save(); return GONE; }
          const value = data;
          const put = await ds.putScope(pid, scope, value);
          m.scopes[scope] = 'written'; save();
          const text = await readBack(pid, scope, put.id);
          let back;
          try { back = JSON.parse(text); } catch (e) { back = undefined; }
          if (back !== undefined && (await hash(back)) === (await hash(value))) {
            m.scopes[scope] = 'verified'; save();
            verified.set(scope, back);
            if (o.applyLocal) { try { await o.applyLocal(pid, scope, back); } catch (e) { /* the local copy is the caller's */ } }
            return back;
          }
        }
        throw new MigrationStopped('The Drive copy of ' + scope + ' did not read back identical, so nothing was deleted from the server.', { scope });
      };
      for (const scope of scopes) {
        if (m.scopes[scope] === 'deleted') continue;
        if (m.scopes[scope] === 'verified') {
          /* Verified on an earlier run: re-read what Drive holds so the
             delete below sends the bytes the server compares with. */
          const f = await ds.findScopeFile(pid, scope);
          const text = f ? await ds.download(f.id) : null;
          let v; try { v = JSON.parse(text); } catch (e) { v = undefined; }
          if (v !== undefined && text != null) { verified.set(scope, v); continue; }
          m.scopes[scope] = 'written';
        }
        await verify(scope);
      }

      /* comments — read by a reader that THROWS on an error and pages
         past the server's row cap (o.listComments), and checked against
         the list's own count: an empty or short read recorded here would
         make every later run skip this step and fail at finish. */
      checkpoint();
      if (m.comments !== 'deleted') {
        say('comments');
        const rows = asList(await o.listComments(pid));
        if (Number.isInteger(row.comments) && rows.length < row.comments) {
          throw new MigrationStopped('Only ' + rows.length + ' of ' + row.comments + ' comments could be read, so nothing was deleted from the server.', { scope: 'comments' });
        }
        const items = rows.map(commentItem);
        if (items.length) {
          /* By id: a rerun (after a short delete, say) replaces its
             earlier copy of a comment rather than adding a second one. */
          const ids = new Set(items.map((x) => x.id));
          await ds.updateComments(pid, (cur) => cur.filter((x) => !ids.has(x.id)).concat(items));
          const back = await ds.readComments(pid);
          const byId = new Map(back.items.map((x) => [x.id, x]));
          for (const it of items) {
            const got = byId.get(it.id);
            if (!got || (await hash(got)) !== (await hash(it))) throw new MigrationStopped('The Drive copy of the comments did not read back identical, so nothing was deleted from the server.', { scope: 'comments' });
          }
        }
        m.commentIds = items.map((x) => x.id);
        m.comments = 'verified'; save();
      }

      /* frames: moved, never copied; a frame not ours stays and is listed */
      checkpoint();
      if (m.frames !== 'done') {
        say('frames');
        const refs = new Set();
        for (const [scope, v] of verified) if (scope === 'shots' || scope === 'story') framesIn(v).forEach((x) => refs.add(x));
        if (refs.size) {
          const framesId = await ds.ensureFrames(pid);
          for (const id of refs) {
            try { if (!(await ds.moveInto(id, framesId))) framesLeft.push(id); }
            catch (e) { framesLeft.push(id); }
          }
        }
        m.frames = 'done'; save();
      }

      /* collaborators — a share Google refused is KEPT in
         m.pendingShares and retried on every run, and the project is not
         finished while one is left: finish deletes project_collaborators,
         the only record of who the teammate was and what they could do. */
      checkpoint();
      if (!m.shared) {
        say('share');
        const people = Array.isArray(m.pendingShares) ? m.pendingShares
          : asList(await o.rpc('drive_migrate_collaborators', { p_project: pid })).filter((p) => p && p.email).map((p) => ({ email: p.email, role: p.role }));
        const left = [];
        for (const p of people) {
          try { await ds.share(m.folderId, p.email, ROLE_MAP[p.role] || 'view'); }
          catch (e) { left.push(p); errors.push({ pid, step: 'share', email: p.email, status: e.status || 0 }); }
        }
        if (left.length) {
          m.pendingShares = left; save();
          throw new MigrationStopped('Google Drive would not share this film with ' + left.map((p) => p.email).join(', ') + ', so it stays on the server for now and the share is tried again next time.', { step: 'share' });
        }
        delete m.pendingShares;
        m.shared = true; save();
      }

      /* ONLY NOW does anything leave the server. */
      for (const scope of scopes) {
        if (m.scopes[scope] === 'deleted') continue;
        for (let attempt = 0; ; attempt++) {
          checkpoint();
          say('delete', { scope });
          const gone = await o.rpc('drive_migrate_delete_scope', { p_project: pid, p_scope: scope, p_data: verified.get(scope) });
          if (gone === true || (Array.isArray(gone) && gone[0] === true)) { m.scopes[scope] = 'deleted'; save(); break; }
          /* False means changed OR already gone; the re-read tells them
             apart (verify answers GONE and writes nothing). */
          m.scopes[scope] = 'written'; save();
          if ((await verify(scope)) === GONE) break;
          if (attempt >= 2) throw new MigrationStopped('The server copy of ' + scope + ' kept changing while it was being moved; it is still on the server.', { scope });
        }
      }
      if (m.comments !== 'deleted') {
        const ids = m.commentIds || [];
        const n = ids.length ? await o.rpc('drive_migrate_delete_comments', { p_project: pid, p_ids: ids }) : 0;
        /* A short count: the server kept a parent whose reply this run
           never saw. Read the comments again next time (the copy in
           comments.json is merged by id, so nothing doubles). */
        if (typeof n === 'number' && n < ids.length) {
          delete m.comments; delete m.commentIds; save();
          throw new MigrationStopped('A comment was answered while the film was moving, so its thread stays on the server until the next run copies the reply.', { scope: 'comments' });
        }
        m.comments = 'deleted'; save();
      }
      checkpoint();
      say('finish');
      try { await o.rpc('drive_migrate_finish', { p_project: pid }); }
      catch (e) {
        /* "rows remain": something reappeared, or a step above recorded
           more than it did — clear the comment step so it is re-read. */
        if (e && e.code === 'P0001') { delete m.comments; delete m.commentIds; save(); }
        throw e;
      }
      m.done = true; m.at = new Date().toISOString(); save();
      done++;
      say('done');
    } catch (e) {
      if (e && e.paused) throw e;
      errors.push({ pid, step: 'stopped', message: (e && e.message) || String(e), status: (e && e.status) || 0 });
      save();
      if (o.stopOnError !== false) { const err = e instanceof Error ? e : new Error(String(e)); err.pid = pid; err.progress = { done, total, frames: framesLeft, errors }; throw err; }
    }
  }
  return { done, total, frames: framesLeft, errors };
}

export default { runMigration, reconcileFinished, framesIn, commentItem, ROLE_MAP, MigrationStopped };
