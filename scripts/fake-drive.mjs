/* ============================================================
   A FAKE GOOGLE DRIVE (v3), in memory, for drive-only storage
   ------------------------------------------------------------
   Shared by scripts/test-drive-store.mjs (as a transport, in Node)
   and scripts/prove-drive-only.mjs (behind a Playwright route for
   www.googleapis.com). It models what src/lib/drive-store.js relies
   on, and the drive.file rules that make the design hard:

     - a user sees a file they (through the app) created, or one that
       is shared with them AND that they PICKED (Google Picker) — or,
       with `knobs.childrenInherit` (the optimistic Q1 answer), one
       whose ancestor folder they picked. Turn it off to prove
       Fallback A;
     - a commenter cannot write a file, but may post a Drive comment
       (unless `knobs.commenterComments` is false: Fallback B);
     - every content write is a new revision; `knobs.pruned` makes
       every revision but the head unreadable (404), as Drive does
       when it prunes;
     - an `anyone` reader permission lets an API-key request with no
       user read the file's media (the screening room).

   Fault injection: `fake.failNext({ method, match, status, times })`.
   ============================================================ */
let SEQ = 0;
const nid = (p) => p + (++SEQ).toString(36) + Math.random().toString(36).slice(2, 8);

export function createFakeDrive() {
  const files = new Map();      // id -> file
  const uploads = new Map();    // resumable session id -> { method, id?, meta, user }
  const faults = [];
  const log = [];
  const knobs = { childrenInherit: true, pruned: false, commenterComments: true, corrupt: '' };
  let revN = 0;

  const err = (status, reason, message) => ({ status, json: { error: { code: status, message: message || reason, errors: [{ reason }] } } });
  const ancestors = (f) => { const out = []; let cur = f; for (let i = 0; i < 20 && cur && cur.parents && cur.parents[0]; i++) { cur = files.get(cur.parents[0]); if (cur) out.push(cur); } return out; };
  function roleOf(f, user) {
    if (!f || !user) return null;
    if (f.owner === user) return 'owner';
    const chain = [f].concat(ancestors(f));
    let best = null; const rank = { reader: 1, commenter: 2, writer: 3, owner: 4 };
    for (const x of chain) for (const p of x.perms) if (p.type === 'user' && p.emailAddress === user && (!best || rank[p.role] > rank[best])) best = p.role;
    return best;
  }
  function visible(f, user) {
    if (!f) return false;
    if (!user) return false;
    if (f.owner === user || f.createdBy === user) return true;
    if (!roleOf(f, user)) return false;
    if (f.picked.has(user)) return true;
    if (knobs.childrenInherit && ancestors(f).some((a) => a.picked.has(user))) return true;
    return false;
  }
  const anyoneReads = (f) => !!f && f.perms.some((p) => p.type === 'anyone');
  const canWrite = (f, user) => { const r = roleOf(f, user); return r === 'owner' || r === 'writer'; };
  const canComment = (f, user) => { const r = roleOf(f, user); return r === 'owner' || r === 'writer' || r === 'commenter'; };
  const head = (f) => f.revs.length ? f.revs[f.revs.length - 1].id : undefined;
  function shape(f, user) {
    return {
      id: f.id, name: f.name, mimeType: f.mimeType, parents: f.parents.slice(), appProperties: Object.assign({}, f.appProperties),
      headRevisionId: f.mimeType.includes('folder') ? undefined : head(f), modifiedTime: new Date(f.modified).toISOString(),
      trashed: !!f.trashed, ownedByMe: f.owner === user, owners: [{ emailAddress: f.owner }],
      capabilities: { canEdit: canWrite(f, user), canComment: canComment(f, user) }, size: String((f.content || '').length)
    };
  }
  function addRev(f, content, user) {
    f.content = content;
    f.revs.push({ id: 'rv' + (++revN), content, time: Date.now(), by: user });
    f.modified = Date.now();
  }
  function make(user, meta, content) {
    const id = nid('f');
    const f = { id, name: meta.name || 'untitled', mimeType: meta.mimeType || 'application/json', parents: (meta.parents || []).slice(),
      appProperties: Object.assign({}, meta.appProperties || {}), owner: user, createdBy: user, trashed: false, revs: [], perms: [], comments: [],
      picked: new Set(), modified: Date.now(), content: '' };
    if (!f.mimeType.includes('folder')) addRev(f, content == null ? '' : String(content), user);
    files.set(id, f);
    return f;
  }
  /* ---- the query language, as much of it as drive-store.js speaks ---- */
  function matches(f, q) {
    if (!q) return true;
    const props = [...q.matchAll(/appProperties has \{ key='((?:[^'\\]|\\.)*)' and value='((?:[^'\\]|\\.)*)' \}/g)];
    for (const [, k, v] of props) if ((f.appProperties || {})[k.replace(/\\(.)/g, '$1')] !== v.replace(/\\(.)/g, '$1')) return false;
    const parents = [...q.matchAll(/'([^']+)' in parents/g)].map((m) => m[1]);
    if (parents.length && !parents.some((p) => f.parents.includes(p))) return false;
    if (/trashed = false/.test(q) && f.trashed) return false;
    const name = q.match(/name = '((?:[^'\\]|\\.)*)'/);
    if (name && f.name !== name[1].replace(/\\(.)/g, '$1')) return false;
    return true;
  }
  function multipart(contentType, body) {
    const b = (String(contentType).match(/boundary=([^;]+)/) || [])[1];
    const parts = String(body).split('--' + b).filter((x) => x && x !== '--' && x.trim() !== '--');
    const bodies = parts.map((p) => { const i = p.indexOf('\r\n\r\n'); return i < 0 ? '' : p.slice(i + 4).replace(/\r\n$/, ''); });
    let meta = {}; try { meta = JSON.parse(bodies[0] || '{}'); } catch (e) { meta = {}; }
    return { meta, content: bodies[1] == null ? '' : bodies[1] };
  }

  function request(user, method, url, opts) {
    const o = opts || {};
    const u = new URL(url);
    if (o.query) for (const [k, v] of Object.entries(o.query)) if (v !== undefined && v !== null) u.searchParams.set(k, String(v));
    const path = u.pathname;
    const qp = (k) => u.searchParams.get(k);
    const hdr = Object.fromEntries(Object.entries(o.headers || {}).map(([k, v]) => [k.toLowerCase(), v]));
    log.push({ user, method, path, query: Object.fromEntries(u.searchParams) });
    for (let i = 0; i < faults.length; i++) {
      const ft = faults[i];
      if ((!ft.method || ft.method === method) && (!ft.match || ft.match.test(method + ' ' + path + u.search)) && (!ft.user || ft.user === user)) {
        if (--ft.times <= 0) faults.splice(i, 1);
        return done(err(ft.status, ft.reason || 'injected', 'injected ' + ft.status));
      }
    }
    return done(route());

    function route() {
      let m;
      if (path === '/drive/v3/files' && method === 'GET') {
        if (!user) return err(401, 'authError');
        const q = qp('q') || '';
        const out = [...files.values()].filter((f) => visible(f, user) && matches(f, q)).map((f) => shape(f, user));
        return { status: 200, json: { files: out } };
      }
      if (path === '/drive/v3/files' && method === 'POST') {
        if (!user) return err(401, 'authError');
        const meta = JSON.parse(o.body || '{}');
        for (const p of meta.parents || []) { const pf = files.get(p); if (!pf || !visible(pf, user) || !canWrite(pf, user)) return err(pf ? 403 : 404, pf ? 'insufficientFilePermissions' : 'notFound'); }
        return { status: 200, json: shape(make(user, meta), user) };
      }
      if (path === '/upload/drive/v3/files' && method === 'POST') {
        if (!user) return err(401, 'authError');
        if (qp('uploadType') === 'resumable') {
          const sid = nid('up'); uploads.set(sid, { kind: 'create', meta: JSON.parse(o.body || '{}'), user });
          return { status: 200, headers: { location: 'https://www.googleapis.com/upload/resumable/' + sid }, json: {} };
        }
        const { meta, content } = multipart(hdr['content-type'], o.body);
        for (const p of meta.parents || []) { const pf = files.get(p); if (!pf || !visible(pf, user) || !canWrite(pf, user)) return err(pf ? 403 : 404, pf ? 'insufficientFilePermissions' : 'notFound'); }
        return { status: 200, json: shape(make(user, meta, content), user) };
      }
      if ((m = path.match(/^\/upload\/resumable\/([^/]+)$/)) && method === 'PUT') {
        const s = uploads.get(m[1]); if (!s) return err(404, 'notFound');
        uploads.delete(m[1]);
        if (s.kind === 'create') return { status: 200, json: shape(make(s.user, s.meta, o.body), s.user) };
        const f = files.get(s.id); addRev(f, String(o.body), s.user); return { status: 200, json: shape(f, s.user) };
      }
      if ((m = path.match(/^\/upload\/drive\/v3\/files\/([^/]+)$/)) && method === 'PATCH') {
        const f = files.get(m[1]);
        if (!f || !visible(f, user) || f.trashed) return err(404, 'notFound');
        if (!canWrite(f, user)) return err(403, 'insufficientFilePermissions');
        if (qp('uploadType') === 'resumable') {
          const sid = nid('up'); uploads.set(sid, { kind: 'update', id: f.id, user });
          return { status: 200, headers: { location: 'https://www.googleapis.com/upload/resumable/' + sid }, json: {} };
        }
        addRev(f, String(o.body == null ? '' : o.body), user);
        return { status: 200, json: shape(f, user) };
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/revisions\/([^/]+)$/)) && method === 'GET') {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        const r = f.revs.find((x) => x.id === m[2]);
        if (!r || (knobs.pruned && r.id !== head(f))) return err(404, 'revisionNotFound');
        return { status: 200, text: r.content };
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/revisions$/)) && method === 'GET') {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        const revs = knobs.pruned ? f.revs.slice(-1) : f.revs;
        return { status: 200, json: { revisions: revs.map((r) => ({ id: r.id, modifiedTime: new Date(r.time).toISOString() })) } };
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/permissions$/))) {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        if (method === 'GET') return { status: 200, json: { permissions: [{ id: 'owner', type: 'user', role: 'owner', emailAddress: f.owner }].concat(f.perms) } };
        if (method === 'POST') {
          if (roleOf(f, user) !== 'owner' && roleOf(f, user) !== 'writer') return err(403, 'insufficientFilePermissions');
          const b = JSON.parse(o.body || '{}');
          const existing = f.perms.find((p) => p.type === b.type && (b.type === 'anyone' || p.emailAddress === b.emailAddress));
          if (existing) { existing.role = b.role; return { status: 200, json: existing }; }
          const p = { id: nid('perm'), type: b.type, role: b.role, emailAddress: b.emailAddress, displayName: b.emailAddress, emailMessage: qp('emailMessage') || '' };
          f.perms.push(p);
          return { status: 200, json: p };
        }
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/permissions\/([^/]+)$/)) && method === 'DELETE') {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        if (roleOf(f, user) !== 'owner' && roleOf(f, user) !== 'writer') return err(403, 'insufficientFilePermissions');
        const i = f.perms.findIndex((p) => p.id === m[2]); if (i < 0) return err(404, 'notFound');
        f.perms.splice(i, 1); return { status: 204, text: '' };
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/comments$/))) {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        if (method === 'GET') return { status: 200, json: { comments: f.comments.map((c) => Object.assign({}, c)) } };
        if (method === 'POST') {
          if (!canComment(f, user) || (!knobs.commenterComments && roleOf(f, user) === 'commenter')) return err(403, 'insufficientFilePermissions');
          const b = JSON.parse(o.body || '{}');
          const c = { id: nid('cm'), content: b.content, author: { emailAddress: user, displayName: user }, createdTime: new Date().toISOString() };
          f.comments.push(c); return { status: 200, json: { id: c.id } };
        }
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)\/comments\/([^/]+)$/)) && method === 'DELETE') {
        const f = files.get(m[1]); if (!f || !visible(f, user)) return err(404, 'notFound');
        const c = f.comments.find((x) => x.id === m[2]); if (!c) return err(404, 'notFound');
        if (c.author.emailAddress !== user && !canWrite(f, user)) return err(403, 'insufficientFilePermissions');
        f.comments = f.comments.filter((x) => x !== c); return { status: 204, text: '' };
      }
      if ((m = path.match(/^\/drive\/v3\/files\/([^/]+)$/))) {
        const f = files.get(m[1]);
        if (method === 'GET') {
          if (qp('alt') === 'media' && !user && f && anyoneReads(f) && !f.trashed) return { status: 200, text: f.content };
          if (!f || !visible(f, user)) return err(404, 'notFound');
          if (qp('alt') === 'media') {
            if (knobs.corrupt && (f.appProperties || {}).fms_scope === knobs.corrupt) return { status: 200, text: '{"tampered":true}' };
            return { status: 200, text: f.content };
          }
          return { status: 200, json: shape(f, user) };
        }
        if (!f || !visible(f, user)) return err(404, 'notFound');
        if (method === 'PATCH') {
          if (!canWrite(f, user)) return err(403, 'insufficientFilePermissions');
          const b = JSON.parse(o.body || '{}');
          if (b.name) f.name = b.name;
          if (b.trashed === true) f.trashed = true;
          const add = qp('addParents'), rem = qp('removeParents');
          if (add || rem) {
            if (f.owner !== user) return err(403, 'insufficientFilePermissions');
            if (rem) f.parents = f.parents.filter((p) => !rem.split(',').includes(p));
            if (add) for (const p of add.split(',')) if (!f.parents.includes(p)) f.parents.push(p);
          }
          f.modified = Date.now();
          return { status: 200, json: shape(f, user) };
        }
        if (method === 'DELETE') { if (f.owner !== user) return err(403, 'insufficientFilePermissions'); files.delete(f.id); return { status: 204, text: '' }; }
      }
      return err(400, 'badRequest', 'fake drive: no route for ' + method + ' ' + path);
    }
    function done(r) {
      const out = { status: r.status, headers: r.headers || {}, text: r.text != null ? r.text : (r.json != null ? JSON.stringify(r.json) : ''), json: r.json != null ? r.json : null };
      if (out.json == null && out.text) { try { out.json = JSON.parse(out.text); } catch (e) { out.json = null; } }
      return out;
    }
  }

  return {
    files, knobs, log,
    request,
    /** A transport bound to one user (an e-mail), as drive-store.js expects. */
    transport(user) { return { request: async (method, url, opts) => request(user, method, url, opts) }; },
    failNext(f) { faults.push(Object.assign({ times: 1 }, f)); },
    clearFaults() { faults.length = 0; },
    /** The Google Picker, faked: `user` picked these ids. */
    pick(user, ids) { for (const id of [].concat(ids)) { const f = files.get(id); if (f) f.picked.add(user); } },
    byProp(k, v) { return [...files.values()].filter((f) => (f.appProperties || {})[k] === v); },
    /** Write as somebody else's device would (a new revision). */
    writeAs(user, id, content) { const f = files.get(id); addRev(f, content, user); return f.revs[f.revs.length - 1].id; },
    reset() { files.clear(); uploads.clear(); faults.length = 0; log.length = 0; Object.assign(knobs, { childrenInherit: true, pruned: false, commenterComments: true, corrupt: '' }); }
  };
}

/** A Playwright route handler for https://www.googleapis.com/** over
 *  `fake`. `userOf(token)` maps a bearer token to an e-mail; a request
 *  with no bearer is anonymous (an API-key read). */
export function driveRoute(fake, userOf) {
  return async (route) => {
    const req = route.request();
    const h = req.headers();
    const tok = String(h['authorization'] || '').replace(/^Bearer\s+/i, '');
    const user = tok ? userOf(tok) : null;
    if (tok && !user) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { code: 401, message: 'Invalid Credentials', errors: [{ reason: 'authError' }] } }) });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': '*' } });
    const r = fake.request(user, req.method(), req.url(), { headers: h, body: req.postData() });
    return route.fulfill({
      status: r.status,
      headers: Object.assign({ 'access-control-allow-origin': '*', 'access-control-expose-headers': 'location', 'content-type': r.json != null ? 'application/json' : 'text/plain' }, r.headers || {}),
      body: r.status === 204 ? '' : r.text
    });
  };
}
