/* ============================================================
   TEST: src/lib/drive-store.js (+ drive-migrate.js) against an
   in-memory Drive (scripts/fake-drive.mjs). No browser, no Google.
   npm run test:drive-store
   ============================================================ */
import { createDriveStore, canonicalHash, canonicalize, mergeCommentItems, resolveConflict, COMMENT_PREFIX } from '../src/lib/drive-store.js';
import { runMigration, framesIn } from '../src/lib/drive-migrate.js';
import { createFakeDrive } from './fake-drive.mjs';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };
const SCOPES = ['feature', 'short', 'library', 'scenes', 'script', 'story', 'costs', 'write_goals', 'shots'];
const AMY = 'amy@example.com', BEN = 'ben@example.com', CAL = 'cal@example.com';
const fake = createFakeDrive();
const storeFor = (user, state) => {
  let writes = 0;
  const ds = createDriveStore({ transport: fake.transport(user), scopes: SCOPES, state: state || {}, onState: () => { writes++; } });
  ds.writes = () => writes;
  return ds;
};
const J = (o) => JSON.stringify(o);

/* ---- canonical hash ---- */
{
  const a = await canonicalHash({ b: 1, a: [1, { y: 2, x: 1 }] });
  const b = await canonicalHash({ a: [1, { x: 1, y: 2 }], b: 1 });
  ok(a === b && /^[0-9a-f]{64}$/.test(a), 'canonical hash is equal across key order');
  ok(a !== await canonicalHash({ a: [{ x: 1, y: 2 }, 1], b: 1 }), 'array order still matters');
  ok(canonicalize({ z: undefined, a: 1 }) === '{"a":1}', 'undefined keys are dropped like JSON.stringify drops them');
}

/* ---- root + folder created once ---- */
fake.reset();
const amy = storeFor(AMY);
const P1 = '11111111-1111-4111-8111-111111111111';
{
  const r1 = await amy.ensureRoot();
  const r2 = await amy.ensureRoot();
  const fresh = storeFor(AMY);
  const r3 = await fresh.ensureRoot();
  ok(r1 === r2 && r1 === r3 && fake.byProp('fms_kind', 'root').length === 1, 'the root folder is created once, and a second device finds it');
  const f1 = await amy.createProjectFolder({ id: P1, title: 'Dragon', format: 'feature' });
  const f2 = await storeFor(AMY).createProjectFolder({ id: P1, title: 'Dragon', format: 'feature' });
  ok(f1 === f2 && fake.byProp('fms_kind', 'project').length === 1, 'a project folder is found by fms_pid, never made twice');
  const meta = await amy.readMeta(f1);
  ok(meta.meta && meta.meta.id === P1 && meta.meta.title === 'Dragon', 'project.json carries the manifest');
  const list = await amy.listProjects();
  ok(list.length === 1 && list[0].pid === P1 && list[0].role === 'owner', 'listProjects finds it with the owner role');
  const before = amy.writes();
  await amy.ensureRoot(); await amy.readMeta(f1); await amy.listProjects();
  ok(amy.writes() === before, 'reads never fire onState (an idle page writes nothing)');
}

/* ---- push then pull round-trips each scope ---- */
{
  const values = { scenes: { scenes: [{ id: 's1', heading: 'INT. HOUSE - DAY' }] }, script: { elements: [{ id: 'e1', type: 'action', text: 'Rain.' }] }, feature: { title_a: 'x' } };
  for (const [scope, v] of Object.entries(values)) {
    const r = await amy.pushScope(P1, scope, J(v));
    ok(r.action === 'pushed' && r.rev, 'push ' + scope + ' → pushed');
    const again = await amy.pushScope(P1, scope, J(v));
    ok(again.action === 'same', 'pushing the same ' + scope + ' again sends nothing');
  }
  const ben = storeFor(AMY);     // the same account on a second device
  await ben.createProjectFolder({ id: P1, title: 'Dragon' });
  const idx = await ben.folderIndex(P1);
  for (const [scope, v] of Object.entries(values)) {
    const r = await ben.pullScopeInto(P1, scope, null, idx.scopes[scope]);
    ok(r.action === 'applied' && canonicalize(JSON.parse(r.text)) === canonicalize(v), 'pull ' + scope + ' round-trips');
    const r2 = await ben.pullScopeInto(P1, scope, r.text, idx.scopes[scope]);
    ok(r2.action === 'same', 'a second pull of ' + scope + ' at the same head is "same"');
  }
  ok(Object.keys(idx.scopes).length === 3 && idx.meta, 'the folder index is one listing with every scope and the manifest');
}

/* ---- conflicts: merge (script / story / write_goals) or keep both ---- */
async function twoDevices(scope, base, mine, theirs, opt, before) {
  fake.reset();
  if (before) before();
  const A = storeFor(AMY), B = storeFor(AMY);
  await A.createProjectFolder({ id: P1, title: 'T' });
  await A.pushScope(P1, scope, J(base));
  await B.createProjectFolder({ id: P1, title: 'T' });
  const idx = await B.folderIndex(P1);
  await B.pullScopeInto(P1, scope, null, idx.scopes[scope]);
  ok((await B.pushScope(P1, scope, J(theirs), opt)).action === 'pushed', scope + ': device B pushes first');
  return A.pushScope(P1, scope, J(mine), opt);
}
{
  const base = { elements: [{ id: 'a', type: 'action', text: 'One.', u: 1 }, { id: 'b', type: 'action', text: 'Two.', u: 1 }] };
  const mine = { elements: [{ id: 'a', type: 'action', text: 'One, mine.', u: 3 }, { id: 'b', type: 'action', text: 'Two.', u: 1 }] };
  const theirs = { elements: [{ id: 'a', type: 'action', text: 'One.', u: 1 }, { id: 'b', type: 'action', text: 'Two, theirs.', u: 2 }, { id: 'c', type: 'action', text: 'Three.', u: 2 }] };
  const r = await twoDevices('script', base, mine, theirs, { coEdit: true });
  const got = r.text ? JSON.parse(r.text) : {};
  const texts = (got.elements || []).map((e) => e.text);
  ok(r.action === 'merged' && texts.includes('One, mine.') && texts.includes('Two, theirs.') && texts.includes('Three.'), 'script: a stale rev merges three-way (' + texts.join(' | ') + ')');
  const fileId = fake.byProp('fms_scope', 'script')[0].id;
  ok(canonicalize(JSON.parse(fake.files.get(fileId).content)) === canonicalize(got), 'script: the merge is what Drive now holds');
  const off = await twoDevices('script', base, mine, theirs, { coEdit: false });
  ok(off.action === 'remote-wins' && JSON.parse(off.salvage).elements[0].text === 'One, mine.', 'script with co-editing OFF keeps both: remote wins, local salvaged');
}
{
  const base = { outline: [{ id: 's1', text: 'A' }] };
  const r = await twoDevices('story', base, { outline: [{ id: 's1', text: 'A' }, { id: 's2', text: 'mine' }] }, { outline: [{ id: 's1', text: 'A' }, { id: 's3', text: 'theirs' }] }, { coEdit: true });
  const ids = r.text ? (JSON.parse(r.text).outline || []).map((s) => s.id) : [];
  ok(r.action === 'merged' && ids.includes('s2') && ids.includes('s3'), 'story: a stale rev merges by step id (' + ids.join(',') + ')');
}
{
  const r = await twoDevices('write_goals', { v: 1, days: {} }, { v: 1, days: { '2026-10-30': { w0: 0, w: 100 } } }, { v: 1, days: { '2026-10-31': { w0: 0, w: 50 } } }, {});
  const days = r.text ? Object.keys(JSON.parse(r.text).days) : [];
  ok(r.action === 'merged' && days.length === 2, 'write_goals: days are unioned even without co-editing');
}
{
  const r = await twoDevices('scenes', { scenes: [] }, { scenes: [{ id: 'm' }] }, { scenes: [{ id: 't' }] }, { coEdit: true });
  ok(r.action === 'remote-wins' && JSON.parse(r.text).scenes[0].id === 't' && JSON.parse(r.salvage).scenes[0].id === 'm', 'a scope with no merger keeps both (remote in storage, local salvaged)');
}
{
  const base = { elements: [{ id: 'a', type: 'action', text: 'One.' }] };
  const r = await twoDevices('script', base, { elements: [{ id: 'a', type: 'action', text: 'Mine.' }] }, { elements: [{ id: 'a', type: 'action', text: 'Theirs.' }] }, { coEdit: true }, () => { fake.knobs.pruned = true; });
  ok(r.action === 'remote-wins' && JSON.parse(r.salvage).elements[0].text === 'Mine.', 'a pruned base revision falls back to keep-both');
  fake.knobs.pruned = false;
}
{
  // a pull with local dirty edits and a moved head merges too
  fake.reset();
  const A = storeFor(AMY), B = storeFor(AMY);
  await A.createProjectFolder({ id: P1, title: 'T' });
  await A.pushScope(P1, 'write_goals', J({ v: 1, days: { d1: { w0: 0, w: 1 } } }));
  await B.createProjectFolder({ id: P1, title: 'T' });
  let idx = await B.folderIndex(P1);
  const first = await B.pullScopeInto(P1, 'write_goals', null, idx.scopes.write_goals);
  await A.pushScope(P1, 'write_goals', J({ v: 1, days: { d1: { w0: 0, w: 1 }, d2: { w0: 0, w: 2 } } }));
  idx = await B.folderIndex(P1);
  const local = J({ v: 1, days: Object.assign(JSON.parse(first.text).days, { d3: { w0: 0, w: 3 } }) });
  const r = await B.pullScopeInto(P1, 'write_goals', local, idx.scopes.write_goals);
  ok(r.action === 'merged' && Object.keys(JSON.parse(r.text).days).length === 3, 'a pull over dirty local edits merges and uploads the merge');
  ok(await B.isDirty(P1, 'write_goals', r.text) === false, 'after the merge the local copy is the agreed one');
}
{
  // an untracked remote file (another device made it first) is a conflict, never overwritten
  fake.reset();
  const A = storeFor(AMY), B = storeFor(AMY);
  await A.createProjectFolder({ id: P1, title: 'T' });
  await B.createProjectFolder({ id: P1, title: 'T' });
  await A.pushScope(P1, 'scenes', J({ scenes: [{ id: 'a' }] }));
  const r = await B.pushScope(P1, 'scenes', J({ scenes: [{ id: 'b' }] }));
  ok(r.action === 'remote-wins' && r.salvage && fake.byProp('fms_scope', 'scenes').length === 1, 'a scope file made by another device is never overwritten blind, nor duplicated');
}

/* ---- comments ---- */
{
  const a = [{ id: '1', body: 'x', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }];
  const b = [{ id: '1', body: 'x', status: 'resolved', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-02T00:00:00Z' }, { id: '2', body: 'y', created_at: '2026-10-03T00:00:00Z' }];
  const m = mergeCommentItems(a, b);
  ok(m.length === 2 && m[0].status === 'resolved', 'comments merge by id; the later updated_at wins');
  fake.reset();
  const A = storeFor(AMY);
  const folder = await A.createProjectFolder({ id: P1, title: 'Shared' });
  await A.updateComments(P1, (cur) => cur.concat([{ id: 'c1', scope: 'feature', field_key: 'k', body: 'owner note', type: 'comment', status: 'open', created_at: new Date().toISOString(), updated_at: new Date().toISOString() }]));
  await A.share(folder, CAL, 'comment');
  fake.pick(CAL, folder);
  const C = storeFor(CAL);
  const list = await C.listProjects();
  ok(list.length === 1 && list[0].role === 'comment', 'a picked shared folder lists with the commenter role');
  C.adoptFolder(P1, folder, 'comment');
  const readC = await C.readComments(P1);
  ok(readC.items.length === 1, 'a commenter reads comments.json');
  let refused = false;
  try { await C.writeComments(P1, [{ id: 'z' }]); } catch (e) { refused = e.status === 403; }
  ok(refused, 'a commenter cannot write comments.json (403)');
  await C.postCommenterItem(P1, { id: 'c2', scope: 'feature', field_key: 'k', body: 'from Cal', type: 'comment', status: 'open', author_email: 'forged@x', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  const fileId = fake.byProp('fms_kind', 'comments')[0].id;
  ok(fake.files.get(fileId).comments.some((c) => c.content.startsWith(COMMENT_PREFIX)), 'the commenter posts a Drive comment carrying the item');
  const n = await A.foldCommenterItems(P1);
  const after = await A.readComments(P1);
  const c2 = after.items.find((x) => x.id === 'c2');
  ok(n === 1 && c2 && c2.author_email === CAL, 'a writer folds commenter comments, with the author Drive names (not the forged one)');
  ok(fake.files.get(fileId).comments.length === 0, 'and deletes the folded Drive comments');
  fake.knobs.commenterComments = false;
  let fb = false;
  try { await C.postCommenterItem(P1, { id: 'c3' }); } catch (e) { fb = e.status === 403; }
  ok(fb, 'Fallback B: a refused Drive comment surfaces as 403 for the caller');
}

/* ---- sharing ---- */
{
  fake.reset();
  const A = storeFor(AMY);
  const folder = await A.createProjectFolder({ id: P1, title: 'S' });
  await A.pushScope(P1, 'scenes', J({ scenes: [{ id: 's' }] }));
  const p = await A.share(folder, BEN, 'edit', 'Open it: https://example.test/?drive=' + folder);
  ok(p && p.role === 'writer', 'edit maps to writer');
  const perms = await A.listPermissions(folder);
  ok(perms.length === 1 && perms[0].emailAddress === BEN, 'listPermissions never lists the owner');
  const B = storeFor(BEN);
  ok((await B.listProjects()).length === 0, 'before the Picker, a shared folder is invisible under drive.file');
  fake.pick(BEN, folder);
  ok((await B.listProjects()).length === 1, 'after the Picker it lists');
  B.adoptFolder(P1, folder, 'edit');
  ok(await B.childrenVisible(folder), 'children visible when picking the folder unlocks them (Q1 yes)');
  fake.knobs.childrenInherit = false;
  ok(!(await B.childrenVisible(folder)), 'Fallback A detected: the folder is picked but its files are invisible');
  fake.pick(BEN, [...fake.files.values()].filter((f) => f.parents.includes(folder)).map((f) => f.id));
  ok(await B.childrenVisible(folder), 'picking the files (second Picker) makes them visible');
  fake.knobs.childrenInherit = true;
  const r = await B.pushScope(P1, 'scenes', J({ scenes: [{ id: 's' }, { id: 't' }] }));
  ok(r.action === 'remote-wins' || r.action === 'pushed' || r.action === 'merged', 'a writer can push into the shared folder (' + r.action + ')');
  ok(await A.revoke(folder, perms[0].id) === true && (await A.listPermissions(folder)).length === 0, 'revoke removes the permission');
  const file = await A.writeScreening(P1, 'pass1', { title: 'S', scopes: { scenes: { scenes: [] } } });
  const anon = fake.request(null, 'GET', 'https://www.googleapis.com/drive/v3/files/' + file + '?alt=media', {});
  ok(anon.status === 200 && JSON.parse(anon.text).title === 'S', 'a screening export is readable anonymously once link-shared');
  await A.unlinkShareFile(file);
  ok(fake.request(null, 'GET', 'https://www.googleapis.com/drive/v3/files/' + file + '?alt=media', {}).status === 404, 'and unreadable once the link share is removed');
}

/* ---- private budget ---- */
{
  fake.reset();
  const A = storeFor(AMY);
  const folder = await A.createProjectFolder({ id: P1, title: 'Budget' });
  await A.pushScope(P1, 'library', J({ lines: [1] }));
  await A.pushScope(P1, 'costs', J({ rows: [1] }));
  await A.pushScope(P1, 'scenes', J({ scenes: [] }));
  await A.share(folder, BEN, 'edit');
  fake.pick(BEN, folder);
  await A.setBudgetPrivate(P1, true);
  const lib = fake.byProp('fms_scope', 'library')[0], costs = fake.byProp('fms_scope', 'costs')[0];
  ok(!lib.parents.includes(folder) && !costs.parents.includes(folder), 'private budget: library and costs move out of the shared folder');
  const B = storeFor(BEN); B.adoptFolder(P1, folder, 'edit');
  const idxB = await B.folderIndex(P1);
  ok(!idxB.scopes.library && !idxB.scopes.costs && idxB.scopes.scenes, 'the teammate no longer sees them');
  const idxA = await A.folderIndex(P1);
  ok(idxA.scopes.library && idxA.scopes.costs, 'the owner still does (the private folder is indexed)');
  ok((await A.pushScope(P1, 'library', J({ lines: [1, 2] }))).action === 'pushed' && !fake.byProp('fms_scope', 'library')[0].parents.includes(folder), 'a push of a private scope stays private');
  ok((await A.readMeta(folder)).meta.budgetPrivate === true, 'project.json records budgetPrivate');
  await A.setBudgetPrivate(P1, false);
  ok(fake.byProp('fms_scope', 'library')[0].parents.includes(folder), 'turning it off moves them back');
}

/* ---- faults ---- */
{
  fake.reset();
  const A = storeFor(AMY);
  await A.createProjectFolder({ id: P1, title: 'F' });
  await A.pushScope(P1, 'scenes', J({ scenes: [1] }));
  fake.failNext({ method: 'PATCH', match: /upload/, status: 403 });
  let e403 = null;
  try { await A.pushScope(P1, 'scenes', J({ scenes: [1, 2] })); } catch (e) { e403 = e; }
  ok(e403 && e403.status === 403, 'a 403 from Drive is thrown as a DriveError with the status');
  ok(await A.isDirty(P1, 'scenes', J({ scenes: [1, 2] })), 'and the scope stays dirty (it will be sent again)');
  fake.failNext({ match: /files/, status: 503 });
  let e5 = null;
  try { await A.folderIndex(P1); } catch (e) { e5 = e; }
  ok(e5 && e5.status === 503, 'a 5xx is reported as observed');
  ok((await A.pushScope(P1, 'scenes', J({ scenes: [1, 2] }))).action === 'pushed', 'the retry succeeds');
}

/* ---- resolveConflict, pure ---- */
ok(resolveConflict({ scope: 'contacts', localText: '{}', remoteText: '{}', baseText: '{}', coEdit: true }).kind === 'keep-both', 'resolveConflict: no merger means keep-both');

/* ---- migration ---- */
async function migrationScenario(opts) {
  fake.reset();
  const o = opts || {};
  const server = {
    projects: [{ id: P1, title: 'Old Film', format: 'feature', scopes: ['scenes', 'script', 'shots'] }],
    data: { scenes: { scenes: [{ id: 's1' }] }, script: { elements: [{ id: 'e', text: 'x' }] }, shots: { frames: [{ ref: 'drive:FRAMEFILE123456' }] } },
    collaborators: [{ email: BEN, role: 'edit' }],
    comments: [{ id: 'cm1', scope: 'feature', field_key: 'k', body: 'hi', type: 'comment', status: 'open', created_at: '2026-10-01T00:00:00Z' }],
    deleted: [], finished: false, deletedComments: []
  };
  const calls = [];
  const rpc = async (name, args) => {
    calls.push(name + (args && args.p_scope ? ':' + args.p_scope : ''));
    if (o.kill && calls.length === o.kill) throw Object.assign(new Error('killed'), { killed: true });
    switch (name) {
      case 'drive_migrate_list': return server.finished ? [] : server.projects.map((p) => ({ project_id: p.id, title: p.title, format: p.format, scopes: p.scopes.filter((s) => !server.deleted.includes(s)) }));
      case 'drive_migrate_read': return server.data[args.p_scope];
      case 'drive_migrate_delete_scope': {
        if (o.changeServer === args.p_scope && !o.changed) { o.changed = true; server.data[args.p_scope] = { changed: true }; return false; }
        if (canonicalize(server.data[args.p_scope]) !== canonicalize(args.p_data)) return false;
        server.deleted.push(args.p_scope); return true;
      }
      case 'drive_migrate_collaborators': return server.collaborators;
      case 'drive_migrate_delete_comments': server.deletedComments.push(...args.p_ids); return null;
      case 'drive_migrate_finish': if (server.deleted.length < 3) throw Object.assign(new Error('rows remain'), { code: 'P0001' }); server.finished = true; return true;
      default: throw new Error('unexpected rpc ' + name);
    }
  };
  // the frame file exists in Amy's Drive (uploaded by the storyboard)
  const frame = { id: 'FRAMEFILE123456', name: 'frame.png', mimeType: 'image/png', parents: [], appProperties: {}, owner: AMY, createdBy: AMY, trashed: false, revs: [{ id: 'rv0', content: 'png' }], perms: [], comments: [], picked: new Set(), modified: Date.now(), content: 'png' };
  fake.files.set(frame.id, frame);
  const state = o.state || {};
  const ds = storeFor(AMY, o.dsState || {});
  const transportWrap = o.mismatch ? { corrupt: o.mismatch } : null;
  const res = await runMigration({
    rpc, ds, state, save: () => {}, hash: canonicalHash,
    listComments: async () => server.comments,
    readBack: transportWrap ? async (pid, scope, fileId) => (scope === o.mismatch ? '{"tampered":true}' : ds.download(fileId)) : undefined,
    onProgress: () => {}
  }).catch((e) => ({ error: e }));
  return { res, server, calls, state, ds, frame };
}
{
  const { res, server, calls, state, frame } = await migrationScenario();
  ok(!res.error && res.done === 1, 'migration: one project moved (' + JSON.stringify(res.error ? String(res.error) : res) + ')');
  const firstDelete = calls.findIndex((c) => c.startsWith('drive_migrate_delete_scope'));
  const lastRead = calls.map((c, i) => (c.startsWith('drive_migrate_read') ? i : -1)).reduce((a, b) => Math.max(a, b), -1);
  ok(firstDelete > lastRead, 'nothing is deleted before every scope is written and read back');
  ok(server.deleted.length === 3 && server.finished && server.deletedComments.includes('cm1'), 'then each scope row, the comments and the project row go');
  ok(state[P1] && state[P1].done === true && Object.values(state[P1].scopes).every((s) => s === 'deleted'), 'the resumable record says done, every scope deleted');
  ok(fake.byProp('fms_kind', 'scope').length === 3 && fake.byProp('fms_kind', 'comments').length === 1, 'Drive holds three scope files and comments.json');
  const folder = fake.byProp('fms_kind', 'project')[0];
  ok(frame.parents.length === 1 && fake.files.get(frame.parents[0]).appProperties.fms_kind === 'frames', 'the storyboard frame moved into frames/');
  ok(folder.perms.some((p) => p.emailAddress === BEN && p.role === 'writer'), 'the collaborator is shared in as writer');
  ok(framesIn({ frames: [{ ref: 'drive:ABCDEFGH1234' }], x: [{ y: { ref: 'drive:ZZZZZZZZZZZZ' } }] }).length === 2, 'framesIn finds every drive: ref, nested');
}
{
  const { res, server } = await migrationScenario({ mismatch: 'script' });
  ok(res.error && server.deleted.length === 0 && !server.finished, 'a read-back that does not match deletes NOTHING (' + (res.error && res.error.message) + ')');
}
{
  const state = {};
  const first = await migrationScenario({ state, kill: 6 });
  ok(first.res.error && first.server.deleted.length === 0, 'a killed run leaves the server rows (' + first.calls.length + ' calls)');
  const marked = Object.values((state[P1] || {}).scopes || {});
  ok(marked.length >= 1, 'and its progress is recorded (' + marked.join(',') + ')');
  // resume: the same fake Drive and the same state
  const server2 = first.server;
  const rpc2Calls = [];
  const res2 = await runMigration({
    rpc: async (name, args) => {
      rpc2Calls.push(name);
      switch (name) {
        case 'drive_migrate_list': return server2.finished ? [] : server2.projects.map((p) => ({ project_id: p.id, title: p.title, format: p.format, scopes: p.scopes }));
        case 'drive_migrate_read': return server2.data[args.p_scope];
        case 'drive_migrate_delete_scope': if (canonicalize(server2.data[args.p_scope]) !== canonicalize(args.p_data)) return false; server2.deleted.push(args.p_scope); return true;
        case 'drive_migrate_collaborators': return server2.collaborators;
        case 'drive_migrate_delete_comments': return null;
        case 'drive_migrate_finish': server2.finished = true; return true;
      }
    },
    ds: first.ds, state, save: () => {}, hash: canonicalHash, listComments: async () => server2.comments, onProgress: () => {}
  });
  ok(res2.done === 1 && server2.finished && fake.byProp('fms_kind', 'project').length === 1 && fake.byProp('fms_scope', 'scenes').length === 1, 'the next run resumes into the same folder and files and finishes');
}
{
  const { res, server, calls } = await migrationScenario({ changeServer: 'scenes' });
  ok(!res.error && server.finished && calls.filter((c) => c === 'drive_migrate_read:scenes').length === 2, 'a delete refused because the row changed re-reads and re-verifies that scope');
  const sc = fake.byProp('fms_scope', 'scenes')[0];
  ok(JSON.parse(sc.content).changed === true, 'and Drive holds the changed copy');
}

console.log(fail ? `\n✗ ${fail} of ${pass + fail} drive-store checks failed` : `✓ all ${pass} drive-store checks pass`);
process.exit(fail ? 1 : 0);
