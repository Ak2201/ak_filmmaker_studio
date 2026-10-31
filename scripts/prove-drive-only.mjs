/* ============================================================
   PROOF: drive-only storage, in a browser, end to end
   ------------------------------------------------------------
   The real built app (dist-verify/: the open build) against
     - a faked Supabase (scripts/fake-supabase.mjs) whose
       get_storage_mode() answers 'drive' (or 'supabase'), with the
       §66 RPCs (drive_migrate_*, google_token_status,
       admin_set_screening_file) and the google-token function;
     - a faked Google Drive (scripts/fake-drive.mjs) behind
       https://www.googleapis.com/**, the SAME fake test:drive-store
       drives in Node.
   Asserted:
     (a) a project's scenes and script go to Drive; a reload keeps them;
         an edit made on another device arrives on focus
     (b) two contexts editing the script at once merge (co-editing on)
     (c) share as writer and as commenter through the Share sheet, and
         revoke
     (d) a commenter (another account) opens the shared folder through
         the Picker and comments; the owner's next pull folds it in
     (e) a screening pass: an anonymous context opens it from the
         owner's link-shared Drive export; an expired pass is refused
     (f) migration of seeded server rows: verified, then deleted, in
         that order; a forced read-back mismatch deletes nothing; a run
         stopped half way resumes and finishes without duplicates
     (g) refusals: a mint 409 shows "Reconnect Google Drive"; a 403
         from Drive keeps the local data and says so
     (h) ZERO requests to /rest/v1/project_data or /rest/v1/comments,
         and no realtime socket (pd:/cm:/pr:) in drive mode
     (i) storage_mode 'supabase': the existing path is untouched (an
         upsert reaches project_data)
   Run:  PROVE_DIST=dist-verify node scripts/prove-drive-only.mjs
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor, EXT_RPC, EXT_FN } from './fake-supabase.mjs';
import { createFakeDrive, driveRoute } from './fake-drive.mjs';
import { canonicalize } from '../src/lib/drive-store.js';
import brand from '../src/data/brand.json' with { type: 'json' };

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist-verify');
const PORT = Number(process.env.PROVE_PORT) || 5391;
const BASE = `http://localhost:${PORT}/`;
if (!fs.existsSync(path.join(DIST, 'settings.html'))) { console.error('No build at ' + DIST + ' — run npm run build:verify first.'); process.exit(1); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.txt': 'text/plain', '.webp': 'image/webp', '.mp4': 'video/mp4' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p = p + '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
const ok = (c, m, extra) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); } };
const wait = async (fn, ms = 15000, step = 200) => { const t0 = Date.now(); for (;;) { let v; try { v = await fn(); } catch (e) { v = null; } if (v) return v; if (Date.now() - t0 > ms) return v; await new Promise((r) => setTimeout(r, step)); } };

/* ---- the fakes ---------------------------------------------------- */
const fake = createFakeDrive();
const TOK = { 'gt-amy': USERS['tok-amy'].email, 'gt-ben': USERS['tok-ben'].email, 'gt-cal': USERS['tok-cal'].email, 'gt-admin': USERS['tok-admin'].email };
const gtFor = (user) => ({ [USERS['tok-amy'].id]: 'gt-amy', [USERS['tok-ben'].id]: 'gt-ben', [USERS['tok-cal'].id]: 'gt-cal', [USERS['tok-admin'].id]: 'gt-admin' })[user && user.id];
let MODE = 'drive';
let MINT = 'ok';          // 'ok' | 'regrant'
const REST = [];          // every /rest/v1 table request (not rpc)
const RPCS = [];          // every rpc name
const TOKENS = { stored: [], revoked: [] };
let SERVER = null;        // the migration's server rows
let PHASE = '';           // which scenario a request belongs to
function resetServer() {
  SERVER = { projects: [], data: {}, collaborators: {}, comments: {}, deleted: [], finished: [], failCollab: 0 };
}
resetServer();
function installFakes() {
  F.reset();
  F.db.settings.purchase_required = false;
  for (const u of Object.values(USERS)) if (!F.db.members.get(u.id)) F.db.members.set(u.id, { role: 'user', disabled_at: null });
  EXT_RPC.get_storage_mode = () => MODE;
  EXT_RPC.co_editing_enabled = () => true;
  EXT_RPC.google_token_status = (a, user) => ({ has_token: !!user, updated_at: new Date().toISOString() });
  EXT_RPC.session_acquire = () => [{ status: 'ok' }];
  EXT_RPC.session_ping = () => [{ status: 'ok' }];
  EXT_RPC.session_release = () => [{ status: 'ok' }];
  EXT_RPC.drive_migrate_list = (a, user) => {
    if (MODE !== 'drive') throw { code: 'P0001', message: 'storage_mode is not drive' };
    return SERVER.projects.filter((p) => p.owner === (user && user.id) && !SERVER.finished.includes(p.id))
      .map((p) => ({ project_id: p.id, title: p.title, format: p.format, scopes: Object.keys(SERVER.data[p.id] || {}) }));
  };
  EXT_RPC.drive_migrate_read = (a) => (SERVER.data[a.p_project] || {})[a.p_scope] ?? null;
  EXT_RPC.drive_migrate_delete_scope = (a) => {
    const d = SERVER.data[a.p_project] || {};
    if (!(a.p_scope in d) || canonicalize(d[a.p_scope]) !== canonicalize(a.p_data)) return false;
    delete d[a.p_scope]; SERVER.deleted.push(a.p_project + ':' + a.p_scope); return true;
  };
  EXT_RPC.drive_migrate_collaborators = (a) => {
    if (SERVER.failCollab > 0) { SERVER.failCollab--; throw { code: 'XX000', message: 'boom', status: 500 }; }
    return SERVER.collaborators[a.p_project] || [];
  };
  EXT_RPC.drive_migrate_delete_comments = (a) => { SERVER.comments[a.p_project] = (SERVER.comments[a.p_project] || []).filter((c) => !(a.p_ids || []).includes(c.id)); return null; };
  EXT_RPC.drive_migrate_finish = (a) => {
    if (Object.keys(SERVER.data[a.p_project] || {}).length || (SERVER.comments[a.p_project] || []).length) throw { code: 'P0001', message: 'rows remain' };
    SERVER.finished.push(a.p_project); return true;
  };
  EXT_RPC.admin_set_screening_file = (a) => { const c = F.db.codes.find((x) => x.id === a.p_id); if (c) c.drive_file_id = a.p_drive_file_id; return true; };
  EXT_RPC.screening_open = (a) => {
    const c = F.db.codes.find((x) => x.code === a.p_code);
    if (!c || c.pass_type !== 'screening_pass' || c.revoked_at || (c.expires_at && Date.parse(c.expires_at) <= Date.now())) throw { code: '22023', message: 'That screening pass is not valid' };
    return [{ project_id: null, title: c.label || 'Film', format: 'feature', access_id: 'ACC12345', expires_at: c.expires_at, drive_file_id: c.drive_file_id, scopes: null }];
  };
  EXT_FN['google-token'] = (body, user) => {
    if (!user) return [401, { error: 'no session' }];
    if (body.action === 'store') { TOKENS.stored.push(user.email); return [204, {}]; }
    if (body.action === 'revoke') { TOKENS.revoked.push(body.user_id || user.id); return [204, {}]; }
    if (body.action === 'mint') return MINT === 'regrant' ? [409, { code: 'regrant' }] : [200, { access_token: gtFor(user), expires_in: 3600 }];
    return [400, { error: 'unknown action' }];
  };
}
async function sbRoute(r) {
  const url = new URL(r.request().url());
  const m = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z_]+)/);
  if (m) RPCS.push(m[1]);
  else if (url.pathname.startsWith('/rest/v1/')) REST.push((PHASE ? PHASE + ' ' : '') + r.request().method() + ' ' + url.pathname.split('/')[3]);
  if (url.pathname.startsWith('/rest/v1/comments') && r.request().method() === 'GET') {
    const pid = (url.searchParams.get('project_id') || '').replace(/^eq\./, '');
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SERVER.comments[pid] || []) });
  }
  return handle(r);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
async function open(tok, { page: file = 'settings.html', seed = true, viewport } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: viewport || { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', sbRoute);
  await ctx.route('https://www.googleapis.com/**', driveRoute(fake, (t) => TOK[t] || null));
  await ctx.route(/fonts\.(googleapis|gstatic)\.com|apis\.google\.com|accounts\.google\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(() => {
    window.__fmsKeepWall = true;
    window.__sockets = [];
    const WS = window.WebSocket;
    window.WebSocket = function (u, p) { window.__sockets.push(String(u)); return new WS(u, p); };
    window.WebSocket.prototype = WS.prototype;
  });
  if (tok && seed) {
    await ctx.addInitScript(([k, v, uid]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  }
  const page = await ctx.newPage();
  let native = 0;
  page.on('dialog', (d) => { native++; d.dismiss().catch(() => {}); });
  page.native = () => native;
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(String(e && e.message)));
  await page.goto(BASE + file);
  await page.waitForFunction(() => !!window.StudioCloud, null, { timeout: 15000 });
  if (tok) await page.waitForFunction(() => window.StudioCloud.getSession() && window.StudioCloud.storageModeKnown(), null, { timeout: 15000 });
  return { ctx, page };
}
const newFilm = (page, title) => page.evaluate((title) => {
  const p = window.StudioStore.createProject({ title, format: 'feature' });
  window.StudioStore.setCurrentProject(p.id);
  return p.id;
}, title);
/* A fresh context is a fresh device: the film arrives from Drive first. */
async function useFilm(page, pid) {
  await page.waitForFunction((id) => window.StudioStore.listProjects().some((p) => p.id === id), pid, { timeout: 20000 });
  await page.evaluate((id) => window.StudioStore.setCurrentProject(id), pid);
  await page.evaluate(() => window.StudioCloud.attachToCurrentProject());
}
const setLocal = (page, key, value) => page.evaluate(([k, v]) => localStorage.setItem(k, JSON.stringify(v)), [key, value]);
const getLocal = (page, key) => page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, key);
const driveScope = (pid, scope) => { const f = fake.byProp('fms_pid', pid).find((x) => x.appProperties.fms_scope === scope && !x.trashed); return f ? JSON.parse(f.content) : null; };
const folderOf = (pid) => fake.byProp('fms_pid', pid).find((x) => x.appProperties.fms_kind === 'project');

try {
  installFakes();
  /* ================================================================ */
  console.log('(a) scenes and script go to Drive, survive a reload, and pull on focus');
  let PID;
  {
    const { ctx, page } = await open('tok-amy');
    ok(await page.evaluate(() => window.StudioCloud.storageModeNow()) === 'drive', 'the app reads storage_mode = drive');
    PID = await newFilm(page, 'Drive Film');
    await setLocal(page, 'fms_scenes_v1', { scenes: [{ id: 's1', heading: 'INT. KITCHEN - NIGHT' }] });
    await setLocal(page, 'fms_script_v1', { elements: [{ id: 'e1', type: 'action', text: 'The kettle sings.', u: 1 }] });
    ok(await wait(() => driveScope(PID, 'scenes') && driveScope(PID, 'script')), 'both scopes are files in the film’s Drive folder');
    const folder = folderOf(PID);
    const root = folder && fake.files.get(folder.parents[0]);
    ok(folder && root && root.appProperties.fms_kind === 'root' && root.name === brand.name, 'inside one root folder named after the product');
    ok(fake.byProp('fms_kind', 'meta').some((f) => JSON.parse(f.content).id === PID), 'with project.json as the manifest');
    const entry = await page.evaluate((id) => window.StudioStore.listAllProjects().find((p) => p.id === id), PID);
    ok(entry && entry.drive && entry.drive.folderId === folder.id && entry.drive.role === 'owner', 'the project entry carries its drive field');
    const st = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_drive_sync_v1') || '{}'));
    ok(st.store && Object.values(st.store).some((a) => a && a[PID] && a[PID].files && a[PID].files.scenes && a[PID].files.scenes.rev), 'the device state (rev + hash per scope) is inside fms_drive_sync_v1.store');
    await page.reload();
    await page.waitForFunction(() => window.StudioCloud.getSession() && window.StudioCloud.storageModeKnown(), null, { timeout: 15000 });
    ok((await getLocal(page, 'fms_scenes_v1')).scenes[0].heading === 'INT. KITCHEN - NIGHT', 'after a reload the scenes are still here');
    // another device edits the scenes in Drive
    const f = fake.byProp('fms_scope', 'scenes').find((x) => x.appProperties.fms_pid === PID);
    fake.writeAs(USERS['tok-amy'].email, f.id, JSON.stringify({ scenes: [{ id: 's1', heading: 'INT. KITCHEN - NIGHT' }, { id: 's2', heading: 'EXT. ROOF - DAWN' }] }));
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    ok(await wait(async () => ((await getLocal(page, 'fms_scenes_v1')) || {}).scenes?.length === 2), 'an edit from another device arrives on focus');
    ok(page.native() === 0 && !page.errors.length, 'no native dialog, no page error', page.errors);
    await ctx.close();
  }

  /* ================================================================ */
  console.log('(b) two contexts on the script merge');
  {
    const A = await open('tok-amy');
    const B = await open('tok-amy');
    for (const x of [A, B]) await useFilm(x.page, PID);
    const base = (await getLocal(A.page, 'fms_script_v1')) || { elements: [] };
    const mine = { elements: base.elements.map((e) => Object.assign({}, e)).concat([{ id: 'eA', type: 'action', text: 'From A.', u: Date.now() }]) };
    const theirs = { elements: base.elements.map((e) => Object.assign({}, e)).concat([{ id: 'eB', type: 'action', text: 'From B.', u: Date.now() }]) };
    await setLocal(A.page, 'fms_script_v1', mine);
    await setLocal(B.page, 'fms_script_v1', theirs);
    await Promise.all([A.page.evaluate(() => window.StudioCloud.drive().then((D) => D.flushAll())), B.page.evaluate(() => window.StudioCloud.drive().then((D) => D.flushAll()))]);
    await A.page.evaluate(() => window.StudioCloud.drive().then((D) => D.flushAll()));
    const ids = await wait(() => { const d = driveScope(PID, 'script'); const s = d ? d.elements.map((e) => e.id) : []; return s.includes('eA') && s.includes('eB') ? s : null; });
    ok(ids, 'Drive holds both lines: ' + JSON.stringify(ids || driveScope(PID, 'script')));
    await A.page.evaluate(() => window.StudioCloud.pullProjectData(window.StudioStore.currentProjectId()));
    await B.page.evaluate(() => window.StudioCloud.pullProjectData(window.StudioStore.currentProjectId()));
    const la = ((await getLocal(A.page, 'fms_script_v1')) || {}).elements?.map((e) => e.id) || [];
    const lb = ((await getLocal(B.page, 'fms_script_v1')) || {}).elements?.map((e) => e.id) || [];
    ok(la.includes('eA') && la.includes('eB') && lb.includes('eA') && lb.includes('eB'), 'and both devices end with the merge', { la, lb });
    await A.ctx.close(); await B.ctx.close();
  }

  /* ================================================================ */
  console.log('(c) share as writer and commenter, then revoke');
  {
    const { ctx, page } = await open('tok-amy');
    await useFilm(page, PID);
    await page.evaluate((id) => window.StudioUI.openShareDialog(id), PID);
    await page.waitForSelector('[data-drive-share-sheet]', { timeout: 10000 });
    ok(await page.locator('#shareDialog').count() === 0, 'drive mode opens the e-mail share sheet, not the link dialog');
    await page.fill('#dsEmail', USERS['tok-ben'].email);
    await page.selectOption('#dsRole', 'edit');
    await page.click('[data-drive-share]');
    await page.waitForSelector(`[data-drive-perm="${USERS['tok-ben'].email}"]`, { timeout: 10000 });
    await page.fill('#dsEmail', USERS['tok-cal'].email);
    await page.selectOption('#dsRole', 'comment');
    await page.click('[data-drive-share]');
    await page.waitForSelector(`[data-drive-perm="${USERS['tok-cal'].email}"]`, { timeout: 10000 });
    const folder = folderOf(PID);
    const ben = folder.perms.find((p) => p.emailAddress === USERS['tok-ben'].email);
    const cal = folder.perms.find((p) => p.emailAddress === USERS['tok-cal'].email);
    ok(ben && ben.role === 'writer' && cal && cal.role === 'commenter', 'Drive permissions: Ben writer, Cal commenter');
    ok(ben && /\?drive=/.test(ben.emailMessage), 'Google’s invitation carries the studio’s ?drive= link');
    page.once('dialog', () => {});
    await page.click(`[data-drive-perm="${USERS['tok-ben'].email}"] [data-perm]`);
    await page.waitForSelector('.k-modal, [role="alertdialog"], .dlg', { timeout: 5000 }).catch(() => {});
    const confirm = page.getByRole('button', { name: /remove|delete|yes|ok|confirm/i }).last();
    await confirm.click({ timeout: 5000 }).catch(() => {});
    ok(await wait(() => !folder.perms.some((p) => p.emailAddress === USERS['tok-ben'].email), 6000), 'revoke removes Ben’s permission');
    ok(page.native() === 0, 'no native dialog (the in-app one asked)');
    await ctx.close();
  }

  /* ================================================================ */
  console.log('(d) a commenter opens the shared folder through the Picker and comments');
  {
    const folder = folderOf(PID);
    const { ctx, page } = await open('tok-cal', { page: 'index.html?drive=' + folder.id });
    await page.exposeFunction('__pickNode', (o) => {
      const user = USERS['tok-cal'].email;
      const ids = o.kind === 'folder' ? [o.folderId] : [...fake.files.values()].filter((f) => f.parents.includes(o.folderId)).map((f) => f.id);
      fake.pick(user, ids);
      return ids;
    });
    await page.evaluate(() => { window.__fmsPicker = (o) => window.__pickNode(o); });
    const btn = page.getByRole('button', { name: 'Open the shared film' });
    await btn.waitFor({ timeout: 15000 });
    await btn.click();
    ok(await wait(() => page.evaluate((id) => (window.StudioStore.listProjects().find((p) => p.id === id) || {}).drive?.role === 'comment', PID)), 'the picked folder opens as this account’s film, role comment');
    ok(await wait(async () => ((await getLocal(page, 'fms_scenes_v1')) || {}).scenes?.length === 2), 'its scenes are pulled in');
    const posted = await page.evaluate((pid) => window.StudioCloud.createComment({ projectId: pid, scope: 'feature', fieldKey: 'logline', body: 'Cal says hi' }).then((r) => r.body, (e) => 'ERR ' + e.message), PID);
    ok(posted === 'Cal says hi', 'createComment as a commenter: ' + posted);
    const cf = fake.byProp('fms_kind', 'comments').find((x) => x.appProperties.fms_pid === PID) || { comments: [] };
    ok(cf.comments.length === 1 && cf.comments[0].content.startsWith('FMSC1:'), 'it went to Drive’s Comments API on comments.json');
    const pushed = await page.evaluate(async () => { localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [] })); await window.StudioCloud.drive().then((D) => D.flushAll()); return true; });
    void pushed;
    ok(driveScope(PID, 'scenes').scenes.length === 2, 'a commenter’s local edit is never pushed into the shared film');
    await ctx.close();
    const A = await open('tok-amy');
    await useFilm(A.page, PID);
    await A.page.evaluate(() => window.StudioCloud.pullProjectData(window.StudioStore.currentProjectId()));
    const list = await A.page.evaluate((pid) => window.StudioCloud.listComments(pid, 'feature', null), PID);
    ok(list.some((c) => c.body === 'Cal says hi' && c.author_email === USERS['tok-cal'].email), 'the owner’s pull folds it into comments.json, authored by Cal', list);
    ok(cf.comments.length === 0, 'and the Drive comment is gone');
    await A.ctx.close();
  }

  /* ================================================================ */
  console.log('(e) a screening pass opens from the owner’s Drive export; an expired one is refused');
  {
    const A = await open('tok-amy');
    await useFilm(A.page, PID);
    const until = new Date(Date.now() + 3600e3).toISOString();
    const fileId = await A.page.evaluate(([pid, until]) => window.StudioCloud.drive().then((D) => D.exportScreening(pid, 'cdrive', until)), [PID, until]);
    ok(typeof fileId === 'string' && fake.files.get(fileId).perms.some((p) => p.type === 'anyone' && p.role === 'reader'), 'the export is link-shared, reader only');
    F.db.codes.push({ id: 'cdrive', code: 'DRIVEPASS234', pass_type: 'screening_pass', target_project_id: null, max_redemptions: 5, redemptions_count: 0, expires_at: until, revoked_at: null, label: 'Drive Film', created_at: new Date().toISOString() });
    EXT_RPC.admin_set_screening_file({ p_id: 'cdrive', p_drive_file_id: fileId });
    F.db.codes.push({ id: 'cold', code: 'OLDPASS23456', pass_type: 'screening_pass', target_project_id: null, max_redemptions: 5, redemptions_count: 0, expires_at: new Date(Date.now() - 60e3).toISOString(), revoked_at: null, label: 'Old', created_at: new Date().toISOString(), drive_file_id: fileId });
    const V = await open(null, { page: 'screening.html' });
    await V.page.fill('#scCode', 'DRIVEPASS234');
    await V.page.locator('[data-sc-form="open"]').evaluate((f) => f.requestSubmit());
    const inRoom = await wait(() => V.page.evaluate(() => document.body.classList.contains('sc-in-room') && /Drive Film/.test(document.body.innerText) && /\b2\s+scenes/i.test(document.body.innerText)));
    ok(inRoom, 'the anonymous viewer is in the room, reading the film from Drive', inRoom ? undefined : await V.page.evaluate(() => document.body.innerText.slice(0, 600)));
    const googleCalls = fake.log.filter((l) => l.user === null && l.path.includes(fileId));
    ok(googleCalls.length >= 1 && !googleCalls.some((l) => 'key' in l.query), 'read with no OAuth, and no API key in the URL');
    await V.ctx.close();
    const V2 = await open(null, { page: 'screening.html' });
    await V2.page.fill('#scCode', 'OLDPASS23456');
    await V2.page.locator('[data-sc-form="open"]').evaluate((f) => f.requestSubmit());
    ok(await wait(() => V2.page.evaluate(() => !document.body.classList.contains('sc-in-room') && /not valid|expired/i.test(document.body.innerText))), 'an expired pass is refused by screening_open');
    await V2.ctx.close();
    await A.ctx.close();
  }

  /* ================================================================ */
  console.log('(f) migration: verified, then deleted; a mismatch deletes nothing; a stopped run resumes');
  {
    PHASE = 'migrate';
    const OLD = '77777777-7777-4777-8777-777777777777';
    resetServer();
    SERVER.projects = [{ id: OLD, owner: USERS['tok-amy'].id, title: 'Server Film', format: 'feature' }];
    SERVER.data[OLD] = { scenes: { scenes: [{ id: 'o1', heading: 'INT. OLD HOUSE - DAY' }] }, script: { elements: [{ id: 'x', type: 'action', text: 'Old words.', u: 1 }] }, story: { source: 'An old idea.' } };
    SERVER.collaborators[OLD] = [{ email: USERS['tok-ben'].email, role: 'edit' }];
    SERVER.comments[OLD] = [{ id: '00000000-0000-4000-8000-0000000000c9', project_id: OLD, scope: 'feature', field_key: 'k', author_name: 'amy@example.com', body: 'server note', type: 'comment', status: 'open', created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' }];
    // 1. a read-back that does not match: nothing is deleted
    fake.knobs.corrupt = 'script';
    RPCS.length = 0;
    {
      const { ctx, page } = await open('tok-amy');
      await page.waitForSelector('[data-drive-migrate]', { timeout: 15000 });
      ok(await wait(() => page.evaluate(() => /did not read back identical|Stopped/i.test((document.querySelector('[data-drive-migrate]') || {}).innerText || '') || /did not read back/i.test(document.body.innerText))), 'the sheet says the copy did not read back identical');
      ok(SERVER.deleted.length === 0 && !SERVER.finished.length && !RPCS.includes('drive_migrate_delete_scope'), 'and NOTHING was deleted from the server', SERVER.deleted);
      ok(await page.evaluate(() => /Nothing on our server is deleted until your Drive copy reads back identical/.test(document.body.innerText)), 'the sheet promises it in words');
      await ctx.close();
    }
    fake.knobs.corrupt = '';
    // 2. a run that stops half way (sharing fails once)
    SERVER.failCollab = 1;
    {
      const { ctx, page } = await open('tok-amy');
      await page.waitForSelector('[data-drive-migrate]', { timeout: 15000 });
      await wait(() => page.evaluate(() => /Stopped/i.test(document.body.innerText)), 15000);
      ok(SERVER.deleted.length === 0, 'a run that stopped before the delete step left every server row');
      await ctx.close();
    }
    // 3. the next sign-in resumes and finishes
    RPCS.length = 0;
    {
      const { ctx, page } = await open('tok-amy');
      await page.waitForSelector('[data-drive-migrate]', { timeout: 15000 });
      ok(await wait(() => SERVER.finished.includes(OLD), 20000), 'the next run finishes: drive_migrate_finish was called');
      const reads = RPCS.map((n, i) => (n === 'drive_migrate_read' ? i : -1)).filter((i) => i >= 0);
      const dels = RPCS.map((n, i) => (n === 'drive_migrate_delete_scope' ? i : -1)).filter((i) => i >= 0);
      ok(reads.length >= 3 && dels.length === 3 && Math.min(...dels) > Math.max(...reads), 'every read (and its read-back) came before the first delete', RPCS);
      ok(fake.byProp('fms_pid', OLD).filter((f) => f.appProperties.fms_kind === 'project').length === 1 && fake.byProp('fms_scope', 'scenes').filter((f) => f.appProperties.fms_pid === OLD).length === 1, 'one folder and one file per scope: the rerun reused them');
      ok(canonicalize(driveScope(OLD, 'scenes')) === canonicalize({ scenes: [{ id: 'o1', heading: 'INT. OLD HOUSE - DAY' }] }), 'Drive holds the server’s scenes byte-for-byte (canonically)');
      ok(!(SERVER.comments[OLD] || []).length && fake.byProp('fms_kind', 'comments').some((f) => f.appProperties.fms_pid === OLD && /server note/.test(f.content)), 'the comment moved into comments.json and left the server');
      ok(folderOf(OLD).perms.some((p) => p.emailAddress === USERS['tok-ben'].email && p.role === 'writer'), 'the collaborator was shared in as writer');
      const local = await page.evaluate((id) => ({ entry: window.StudioStore.listAllProjects().find((p) => p.id === id), scenes: JSON.parse(window.StudioStore.rawGet('fms_scenes_v1__' + id) || 'null') }), OLD);
      ok(local.entry && local.entry.drive && local.entry.drive.folderId === folderOf(OLD).id && local.scenes && local.scenes.scenes[0].id === 'o1', 'the film is on this device with its drive field and its data');
      ok(await wait(() => page.evaluate(() => /in your Google Drive/.test(document.body.innerText))), 'the sheet reports it done');
      await ctx.close();
    }
  }

  /* ================================================================ */
  PHASE = '';
  console.log('(g) refusals: a mint 409 asks to reconnect; a Drive 403 keeps local data');
  {
    MINT = 'regrant';
    const { ctx, page } = await open('tok-amy');
    await newFilm(page, 'Offline Film');
    await setLocal(page, 'fms_contacts_v1', { contacts: [{ id: 'k1', name: 'A gaffer' }] });
    await page.evaluate(() => window.StudioCloud.drive().then((D) => D.flushAll()));
    ok(await wait(() => page.getByRole('button', { name: 'Reconnect Google Drive' }).count()), 'a refused mint (409 regrant) shows "Reconnect Google Drive"');
    ok(((await getLocal(page, 'fms_contacts_v1')) || {}).contacts?.length === 1, 'and the contacts stay on this device');
    await ctx.close();
    MINT = 'ok';
    const B = await open('tok-amy');
    await useFilm(B.page, PID);
    fake.failNext({ method: 'PATCH', match: /upload/, status: 403, times: 5 });
    fake.failNext({ method: 'POST', match: /upload/, status: 403, times: 5 });
    await setLocal(B.page, 'fms_scenes_v1', { scenes: [{ id: 'z', heading: 'INT. REFUSED - DAY' }] });
    await B.page.evaluate(() => window.StudioCloud.drive().then((D) => D.flushAll()));
    ok(((await getLocal(B.page, 'fms_scenes_v1')) || {}).scenes?.[0]?.id === 'z', 'a 403 from Drive leaves the local scenes exactly as written');
    const st = await B.page.evaluate(() => window.StudioCloud.getSyncStatus());
    ok(st.state === 'error' && /Drive/.test(st.detail), 'the status line says Drive refused it: ' + st.detail);
    ok(driveScope(PID, 'scenes').scenes[0].id !== 'z', 'and Drive was not changed');
    fake.clearFaults();
    await B.page.evaluate(() => window.StudioCloud.pullProjectData(window.StudioStore.currentProjectId()));
    ok(await wait(() => (driveScope(PID, 'scenes') || {}).scenes?.[0]?.id === 'z'), 'once Drive accepts again, the next pass sends it');
    await B.ctx.close();
  }

  /* ================================================================ */
  console.log('(h) drive mode never touched project_data or comments, nor any realtime channel');
  {
    const bad = REST.filter((r) => /project_data|comments/.test(r) && !/^migrate GET comments$/.test(r));
    ok(bad.length === 0, 'zero /rest/v1/project_data and /rest/v1/comments requests in drive mode', bad);
    ok(REST.filter((r) => /^migrate GET comments$/.test(r)).length >= 1, 'the only server reads were the migration reading its own comment rows (listComments), never a write');
    const { ctx, page } = await open('tok-amy');
    await useFilm(page, PID);
    await page.evaluate(() => window.StudioCloud.attachToCurrentProject());
    const presence = await page.evaluate((pid) => window.StudioCloud.joinPresence(pid, () => {}), PID);
    const socks = await page.evaluate(() => window.__sockets.filter((u) => /realtime/.test(u)));
    ok(presence === null && socks.length === 0, 'no presence and no realtime socket (no pd:, cm: or pr: join)', socks);
    await ctx.close();
  }

  /* ================================================================ */
  console.log('(i) storage_mode supabase: the existing path is untouched');
  {
    MODE = 'supabase';
    REST.length = 0;
    const { ctx, page } = await open('tok-amy');
    ok(await page.evaluate(() => window.StudioCloud.storageModeNow()) === 'supabase', 'the app reads storage_mode = supabase');
    const before = fake.log.length;
    const id = await newFilm(page, 'Supabase Film');
    await setLocal(page, 'fms_scenes_v1', { scenes: [{ id: 'sb1' }] });
    ok(await wait(() => REST.some((r) => /^(POST|PATCH|PUT) project_data$/.test(r)), 12000), 'a scene edit upserts project_data as before', REST);
    ok(fake.log.slice(before).length === 0 && !fake.byProp('fms_pid', id).length, 'and nothing went to Drive');
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
console.log(fail ? `\n✗ ${fail} of ${pass + fail} drive-only checks failed` : `\n✓ all ${pass} drive-only checks pass`);
process.exit(fail ? 1 : 0);
