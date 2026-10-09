/* ============================================================
   PROOF: Drive backup, every path that is not Google itself.
   ------------------------------------------------------------
   `npm run verify` cannot see any of this. settings.html is not in
   its PAGES array (baselineFacts() hard-exits on a name missing
   from baseline.json, and re-baselining to add one would bake the
   current output in as the thing every later run is judged
   against), and the gate has no Google account, no network and no
   client id — so the whole feature is invisible to it by
   construction.

   What this script does instead is replace the ONE seam that
   needs an account — `window.fetch` to googleapis.com, and the
   Google Identity token client — with a Drive that keeps its file
   in memory and counts revisions. Everything above that seam is
   the real shipped code: drive.js builds the real requests,
   drive-sync.js compares the real head revisions, backup.js
   builds and applies the real file.

   Asserted here:
     (a) the backup object is v2 and holds every project
     (b) fms_ai_key_v1 is NOT in the uploaded bytes, with a key set
     (c) first connect with no remote file CREATES it
     (d) a push when the head has not moved UPLOADS
     (e) a push when the head HAS moved refuses and raises a
         conflict naming both sides
     (f) "keep mine" uploads over it; "take theirs" applies the
         remote, replacing rather than duplicating
     (g) a pull applies in RESTORE mode — same project ids, no
         "(imported)" duplicates
     (h) the hub's file import still MERGES — same file, same
         applier, the other mode
     (i) revisions list and a restore from one
     (j) Supabase ownership turns live sync off and leaves manual on
     (k) an idle connected page writes nothing to localStorage

   Run (needs Node >= 22.12):
     node scripts/prove-drive.mjs
   It builds its own dist into dist-drive/ with a fake client id,
   so the dist/ the gate judges is left alone.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-drive');
const PORT = Number(process.env.PROVE_PORT) || 5356;
const AI_KEY = 'fms_ai_key_v1';
const AI_SECRET = 'sk-ant-PROBE-SECRET-DO-NOT-UPLOAD';

/* ---- build, with a client id, into our own directory -------- */
console.log('building dist-drive/ …');
const build = spawnSync(process.execPath, [
  path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build',
  '--outDir', OUT, '--emptyOutDir'
], {
  cwd: ROOT,
  env: Object.assign({}, process.env, {
    /* The site gate (5 Oct 2026) sends a signed-out visitor to
       invite.html, and this proof drives settings.html signed out — so
       with the gate on, every page it opens navigates away under it.
       Drive is what is on trial here, not the gate (prove:gate owns
       that), so this fixture is the open build, as verify's is. */
    VITE_SITE_GATE: 'off',
    VITE_GOOGLE_CLIENT_ID: 'probe-client-id.apps.googleusercontent.com',
    VITE_DISABLE_SW: '1'
  }),
  encoding: 'utf8'
});
if (build.status !== 0) {
  console.error(build.stdout || '', build.stderr || '');
  process.exit(1);
}

/* ---- serve it ----------------------------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(OUT, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  // The browser asks for /favicon.ico on its own; the pages declare their icons, so answer empty rather than log a 404.
  if (req.url === '/favicon.ico') { res.writeHead(204); return res.end(); }
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

/* ---- the fake Drive, and the fake token client --------------
   Installed before any module evaluates. Everything it answers is
   shaped like the real API's JSON, because drive.js reads the real
   field names — headRevisionId is the one the whole conflict rule
   turns on. */
const FAKE_DRIVE = () => {
  const store = {
    files: {},        // id -> { id, name, body, headRevisionId, modifiedTime }
    hideHeadOnWrite: false,   // see the media PATCH branch below
    revisions: {},    // id -> [ { id, modifiedTime, body } ]
    nextFile: 1,
    nextRev: 1,
    calls: []
  };
  window.__drive = store;

  window.google = {
    accounts: {
      oauth2: {
        initTokenClient(cfg) {
          return {
            requestAccessToken() {
              setTimeout(() => cfg.callback({
                access_token: 'fake-token', expires_in: 3600, token_type: 'Bearer'
              }), 0);
            }
          };
        }
      }
    }
  };

  const json = (obj, status) => ({
    ok: (status || 200) < 400,
    status: status || 200,
    json: async () => obj,
    text: async () => JSON.stringify(obj)
  });
  const text = (s) => ({ ok: true, status: 200, json: async () => JSON.parse(s), text: async () => s });

  const newRev = (f, body) => {
    const rid = 'rev' + (store.nextRev++);
    f.headRevisionId = rid;
    f.body = body;
    f.modifiedTime = new Date(Date.now() + store.nextRev * 1000).toISOString();
    (store.revisions[f.id] = store.revisions[f.id] || []).push({
      id: rid, modifiedTime: f.modifiedTime, body
    });
  };

  const meta = (f) => ({
    id: f.id, name: f.name, headRevisionId: f.headRevisionId,
    modifiedTime: f.modifiedTime, webViewLink: 'https://drive.example/' + f.id,
    trashed: false, size: String(f.body.length)
  });

  const realFetch = window.fetch.bind(window);
  window.fetch = async (url, opts) => {
    const u = String(url);
    if (u.indexOf('https://www.googleapis.com') !== 0) return realFetch(url, opts);
    opts = opts || {};
    store.calls.push(opts.method || 'GET');

    // create (multipart)
    if (u.indexOf('/upload/drive/v3/files?') >= 0 && (opts.method === 'POST')) {
      const id = 'file' + (store.nextFile++);
      const parts = String(opts.body).split(/\r\n\r\n/);
      const body = parts[parts.length - 1].replace(/\r\n--.*--$/, '');
      const f = { id, name: 'filmmakers-studio-backup.json', body: '', headRevisionId: null, modifiedTime: null };
      store.files[id] = f;
      newRev(f, body);
      return json(meta(f));
    }
    // update (media)
    let m = u.match(/\/upload\/drive\/v3\/files\/([^?]+)\?/);
    if (m && opts.method === 'PATCH') {
      const f = store.files[decodeURIComponent(m[1])];
      if (!f) return json({ error: { message: 'not found' } }, 404);
      newRev(f, String(opts.body));
      /* A WRITE RESPONSE THAT WITHHOLDS THE HEAD. Drive calls
         headRevisionId output-only and promises it for binary-content
         files on a GET; nothing promises a media PATCH returns the
         revision the write just made rather than the one it replaced.
         This fake was well-behaved, which is exactly why it never
         caught the bug it was built to catch — a push stored the
         upload's id, reconcile compared it against readMeta's, and
         every later sync refused to upload on a file nobody else had
         touched. Flip this on to reproduce that. */
      const m2 = meta(f);
      if (store.hideHeadOnWrite) delete m2.headRevisionId;
      return json(m2);
    }
    // one revision's contents
    m = u.match(/\/drive\/v3\/files\/([^/]+)\/revisions\/([^?]+)\?/);
    if (m) {
      const rows = store.revisions[decodeURIComponent(m[1])] || [];
      const row = rows.find((r) => r.id === decodeURIComponent(m[2]));
      return row ? text(row.body) : json({ error: { message: 'no revision' } }, 404);
    }
    // revision list
    m = u.match(/\/drive\/v3\/files\/([^/]+)\/revisions\?/);
    if (m) {
      const rows = (store.revisions[decodeURIComponent(m[1])] || [])
        .map((r) => ({ id: r.id, modifiedTime: r.modifiedTime, size: String(r.body.length) }));
      return json({ revisions: rows });
    }
    // list / search
    if (u.indexOf('/drive/v3/files?') >= 0) {
      const files = Object.values(store.files).map(meta);
      return json({ files });
    }
    // meta or content
    m = u.match(/\/drive\/v3\/files\/([^?]+)\?(.*)$/);
    if (m) {
      const f = store.files[decodeURIComponent(m[1])];
      if (!f) return json({ error: { message: 'not found' } }, 404);
      if (m[2].indexOf('alt=media') >= 0) return text(f.body);
      return json(meta(f));
    }
    return json({ error: { message: 'unhandled ' + u } }, 400);
  };
};

/* ---- harness ------------------------------------------------- */
let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function openPage(opts) {
  opts = opts || {};
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  /* Stubbed as prove-billing does: a sandbox that cannot reach Google
     Fonts reports each refused stylesheet as a console error, which is
     the network, not the page. */
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.addInitScript(FAKE_DRIVE);
  if (opts.seed) await ctx.addInitScript(opts.seed);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`http://localhost:${PORT}/${opts.at || 'settings.html'}`);
  await page.waitForFunction(() => !!window.StudioDrive, null, { timeout: 15000 });
  page.__errors = errors;
  return { ctx, page };
}

/* A studio with two films, seeded the way the gate seeds its own
   round-trip check: through the real Store, so the project meta,
   the namespace and the per-project suffixes are all real. */
const seedTwo = async (page) => page.evaluate(() => {
  const S = window.StudioStore;
  const a = S.createProject({ title: 'Probe Alpha', format: 'feature' });
  const b = S.createProject({ title: 'Probe Beta', format: 'short' });
  S.rawSet('fms_scenes_v1__' + a.id, JSON.stringify({ logline: 'ALPHA-ONE' }));
  S.rawSet('fms_scenes_v1__' + b.id, JSON.stringify({ logline: 'BETA-ONE' }));
  return { a: a.id, b: b.id };
});

console.log('\n--- the backup object, and what is not in it ---');
{
  const { ctx, page } = await openPage();
  await page.evaluate((k) => localStorage.setItem(k[0], k[1]), [AI_KEY, AI_SECRET]);
  const ids = await seedTwo(page);

  // Connect, which uploads the real backup through the real code.
  const res = await page.evaluate(() => window.StudioDrive.connect());
  check('connect creates the one file', await page.evaluate(() => Object.keys(window.__drive.files).length), 1);
  check('connect reports connected', res.connected, true);

  const uploaded = await page.evaluate(() => Object.values(window.__drive.files)[0].body);
  const parsed = JSON.parse(uploaded);
  check('uploaded file is backup v2', parsed._version, 2);
  check('uploaded file names the studio', parsed._from, "FilmMakerStudio");
  check('uploaded file holds both projects',
    parsed.projects.map((p) => p.title).sort(), ['Probe Alpha', 'Probe Beta']);
  check('uploaded file holds each project\'s data',
    [parsed.data[ids.a].scenes.logline, parsed.data[ids.b].scenes.logline],
    ['ALPHA-ONE', 'BETA-ONE']);

  /* THE KEY-ABSENCE CHECK. Not "the map does not list it" — the
     actual bytes that went over the wire, with a key set. */
  check('AI key is set on this device',
    await page.evaluate((k) => !!localStorage.getItem(k), AI_KEY), true);
  check('AI key value is NOT in the uploaded bytes', uploaded.indexOf(AI_SECRET) >= 0, false);
  check('the AI key NAME is not in the uploaded bytes', uploaded.indexOf(AI_KEY) >= 0, false);
  check('the Drive pointer is not in the uploaded bytes', uploaded.indexOf('fms_drive_sync_v1') >= 0, false);
  check('the account id key is not in the uploaded bytes', uploaded.indexOf('fms_studio_account_v1') >= 0, false);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- push, and the head-revision guard ---');
{
  const { ctx, page } = await openPage();
  await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());
  const rev1 = await page.evaluate(() => window.StudioDrive.readState().revisionId);

  // An ordinary push: the head has not moved.
  const ok = await page.evaluate(() => window.StudioDrive.push());
  check('a push with an unmoved head uploads', ok.ok, true);
  const rev2 = await page.evaluate(() => window.StudioDrive.readState().revisionId);
  check('the push recorded a NEW head revision', rev2 !== rev1, true);

  /* ---- THE REGRESSION THIS HARNESS MISSED --------------------
     A push whose upload response withholds headRevisionId must still
     leave the device in sync, because the head is RE-READ after the
     write rather than taken from it. Before that fix the stored id
     was null, the next reconcile saw a head that "moved", and a file
     nobody else had touched produced a permanent conflict: Drive
     would never upload again.

     Asserted as a round trip rather than by inspecting storage —
     what matters is the next reconcile's verdict, not the value. */
  await page.evaluate(() => { window.__drive.hideHeadOnWrite = true; });
  await page.evaluate(() => window.StudioDrive.push({ force: true }));
  const quiet = await page.evaluate(() => window.StudioDrive.reconcile());
  check('a push whose response hides the head still reconciles clean',
        [quiet.ok, quiet.did], [true, 'nothing']);
  check('and the device did not land in a conflict',
        await page.evaluate(() => window.StudioDrive.getDriveStatus().state), 'synced');
  await page.evaluate(() => { window.__drive.hideHeadOnWrite = false; });

  /* Somebody else's device writes the file. Exactly the thing that
     makes last-write-wins destroy a month of work. */
  await page.evaluate(() => {
    const f = Object.values(window.__drive.files)[0];
    const body = JSON.stringify({
      _from: "FilmMakerStudio", _version: 2, _exported: new Date().toISOString(),
      projects: [{ id: 'remote-1', title: 'Written Elsewhere', format: 'feature' }],
      currentProject: null, data: { 'remote-1': { scenes: { logline: 'REMOTE-ONE' } } },
      global: {}, notes: {}
    });
    f.headRevisionId = 'rev-elsewhere';
    f.modifiedTime = new Date().toISOString();
    f.body = body;
    (window.__drive.revisions[f.id] = window.__drive.revisions[f.id] || [])
      .push({ id: 'rev-elsewhere', modifiedTime: f.modifiedTime, body });
  });

  const blocked = await page.evaluate(() => window.StudioDrive.push());
  check('a push with a MOVED head refuses', [blocked.ok, blocked.reason], [false, 'conflict']);
  const st = await page.evaluate(() => window.StudioDrive.getDriveStatus());
  check('the refusal raises a conflict', st.state, 'conflict');
  check('the conflict names the remote time', !!(st.conflict && st.conflict.remote.modifiedTime), true);
  check('the conflict names the local time', !!(st.conflict && st.conflict.localAt), true);
  check('nothing was uploaded',
    await page.evaluate(() => JSON.parse(Object.values(window.__drive.files)[0].body).projects[0].title),
    'Written Elsewhere');

  // Keep mine.
  const mine = await page.evaluate(() => window.StudioDrive.resolveConflict('mine'));
  check('"keep mine" uploads over the remote', mine.ok, true);
  check('the remote now holds this studio',
    await page.evaluate(() => JSON.parse(Object.values(window.__drive.files)[0].body).projects.map((p) => p.title).sort()),
    ['Probe Alpha', 'Probe Beta']);
  check('the earlier content is still a Drive revision',
    await page.evaluate(() => window.__drive.revisions[Object.keys(window.__drive.files)[0]]
      .some((r) => r.body.indexOf('Written Elsewhere') >= 0)), true);
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- take theirs, and RESTORE vs MERGE ---');
{
  const { ctx, page } = await openPage();
  const ids = await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());

  /* The same two project ids come back with changed content — the
     ordinary "another device wrote this" case. A merge would make
     four projects; a restore makes two. */
  await page.evaluate((ids) => {
    const f = Object.values(window.__drive.files)[0];
    const body = JSON.stringify({
      _from: "FilmMakerStudio", _version: 2, _exported: new Date().toISOString(),
      projects: [
        { id: ids.a, title: 'Probe Alpha', format: 'feature' },
        { id: ids.b, title: 'Probe Beta', format: 'short' }
      ],
      currentProject: null,
      data: {
        [ids.a]: { scenes: { logline: 'ALPHA-FROM-THE-OTHER-DEVICE' } },
        [ids.b]: { scenes: { logline: 'BETA-FROM-THE-OTHER-DEVICE' } }
      },
      global: {}, notes: {}
    });
    f.headRevisionId = 'rev-elsewhere';
    f.modifiedTime = new Date().toISOString();
    f.body = body;
    (window.__drive.revisions[f.id] = window.__drive.revisions[f.id] || [])
      .push({ id: 'rev-elsewhere', modifiedTime: f.modifiedTime, body });
  }, ids);

  const took = await page.evaluate(() => window.StudioDrive.pull());
  check('a pull applies', took.ok, true);
  check('a pull does NOT duplicate the projects',
    await page.evaluate(() => window.StudioStore.listAllProjects().map((p) => p.title).sort()),
    ['Probe Alpha', 'Probe Beta']);
  check('a pull REPLACED the contents',
    await page.evaluate((ids) => [ids.a, ids.b].map((id) =>
      JSON.parse(window.StudioStore.rawGet('fms_scenes_v1__' + id)).logline), ids),
    ['ALPHA-FROM-THE-OTHER-DEVICE', 'BETA-FROM-THE-OTHER-DEVICE']);

  /* The OTHER mode of the same applier — 'merge', where a colliding
     id arrives beside what is here as a marked copy — is what the
     hub's file import uses, and `npm run verify`'s backup round trip
     already exercises it end to end on every run. It is not repeated
     here: one assertion in two places is how two assertions start
     disagreeing. */
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- revisions, and restoring one ---');
{
  const { ctx, page } = await openPage();
  const ids = await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());
  // Change the studio and push again, twice.
  await page.evaluate((ids) => {
    window.StudioStore.rawSet('fms_scenes_v1__' + ids.a, JSON.stringify({ logline: 'ALPHA-TWO' }));
  }, ids);
  await page.evaluate(() => window.StudioDrive.push());
  await page.evaluate((ids) => {
    window.StudioStore.rawSet('fms_scenes_v1__' + ids.a, JSON.stringify({ logline: 'ALPHA-THREE' }));
  }, ids);
  await page.evaluate(() => window.StudioDrive.push());

  const revs = await page.evaluate(() => window.StudioDrive.listVersions());
  check('three revisions exist', revs.length, 3);
  check('newest first', revs[0].modifiedTime >= revs[revs.length - 1].modifiedTime, true);

  const oldest = revs[revs.length - 1].id;
  const back = await page.evaluate((r) => window.StudioDrive.restoreVersion(r), oldest);
  check('restoring an old revision applies', back.ok, true);
  check('the studio came back as it was',
    await page.evaluate((ids) => JSON.parse(window.StudioStore.rawGet('fms_scenes_v1__' + ids.a)).logline, ids),
    'ALPHA-ONE');
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- who owns sync ---');
{
  /* A real Supabase session needs a real Supabase. The SEAM is
     cloud.js's own `ownsSync()`, which is the one thing drive-sync
     asks, so that is what is replaced here — the predicate itself
     (`isConfigured() && session`) belongs to cloud.js and is
     exercised by cloud.js. Asserted first in its real signed-out
     state, so the stub is a change of answer rather than a change
     of mechanism. */
  const { ctx, page } = await openPage();
  check('signed out, cloud.js says it does NOT own sync',
    await page.evaluate(() => !!window.StudioCloud && window.StudioCloud.ownsSync()), false);
  check('drive-sync agrees while signed out',
    await page.evaluate(() => window.StudioDrive.ownsSync()), false);

  await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());
  await page.evaluate(() => { window.StudioCloud.ownsSync = () => true; });

  const st = await page.evaluate(() => window.StudioDrive.getDriveStatus());
  check('Supabase is reported as the sync owner', await page.evaluate(() => window.StudioDrive.ownsSync()), true);
  check('Drive is connected but NOT live', [st.connected, st.live], [true, false]);
  const manual = await page.evaluate(() => window.StudioDrive.push());
  check('manual backup still works while Supabase owns sync', manual.ok, true);

  // A save must not schedule a Drive push in this state.
  const before = await page.evaluate(() => window.__drive.calls.length);
  await page.evaluate(() => {
    window.StudioStore.notify('saved', { key: 'fms_scenes_v1' });
  });
  await page.waitForTimeout(7000);
  check('a save does not push to Drive while Supabase owns sync',
    await page.evaluate(() => window.__drive.calls.length), before);
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- live sync, and the idle-write rule ---');
{
  const { ctx, page } = await openPage();
  const ids = await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());
  const st = await page.evaluate(() => window.StudioDrive.getDriveStatus());
  check('Drive is live when nobody else owns sync', st.live, true);

  const before = await page.evaluate(() => window.__drive.calls.length);
  await page.evaluate((ids) => {
    window.StudioStore.rawSet('fms_scenes_v1__' + ids.a, JSON.stringify({ logline: 'ALPHA-LIVE' }));
    window.StudioStore.notify('saved', { key: 'fms_scenes_v1' });
  }, ids);
  await page.waitForTimeout(9000);
  check('a save pushes to Drive, debounced',
    await page.evaluate(() => window.__drive.calls.length) > before, true);
  check('the remote now has the new line',
    await page.evaluate((ids) => JSON.parse(Object.values(window.__drive.files)[0].body)
      .data[ids.a].scenes.logline, ids), 'ALPHA-LIVE');

  /* The gate's rule, on the page the gate cannot reach: four idle
     seconds with Drive connected must write nothing. */
  await page.evaluate(() => {
    window.__writes = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { window.__writes++; return orig.apply(this, a); };
  });
  await page.waitForTimeout(4500);
  check('zero localStorage writes across four idle seconds',
    await page.evaluate(() => window.__writes), 0);
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- disconnect ---');
{
  const { ctx, page } = await openPage();
  await seedTwo(page);
  await page.evaluate(() => window.StudioDrive.connect());
  await page.evaluate(() => window.StudioDrive.disconnect());
  check('disconnect clears the pointer',
    await page.evaluate(() => window.StudioStore.rawGet('fms_drive_sync_v1')), null);
  check('disconnect does NOT delete the Drive file',
    await page.evaluate(() => Object.keys(window.__drive.files).length), 1);
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- the settings page, both themes, both widths ---');
for (const theme of ['paper', 'ink']) {
  for (const width of [1280, 390]) {
    const seed = () => {
      localStorage.setItem('fms_drive_sync_v1', JSON.stringify({
        enabled: true, fileId: 'file1', revisionId: 'rev1',
        syncedAt: new Date().toISOString(), link: 'https://drive.example/file1'
      }));
    };
    const ctx = await browser.newContext({ viewport: { width, height: 900 } });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
    await ctx.addInitScript(FAKE_DRIVE);
    await ctx.addInitScript(seed);
    /* fms_studio_theme_v1 — the key chrome.js's loadTheme() actually
       reads. Seeding the prefs blob instead silently left every run on
       the light palette, so the dark half of the AA walk below was
       measuring the light theme twice. The assertion right after the
       load is what keeps that from recurring. */
    await ctx.addInitScript((t) => {
      try { localStorage.setItem('fms_studio_theme_v1', t); } catch (e) {}
    }, theme);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`http://localhost:${PORT}/settings.html`);
    await page.waitForFunction(() => !!document.getElementById('drive'), null, { timeout: 15000 });
    const r = await page.evaluate(() => {
      const sec = document.getElementById('drive');
      const over = document.documentElement.scrollWidth - document.documentElement.clientWidth;
      return {
        cssTheme: document.documentElement.getAttribute('data-theme'),
        present: !!sec,
        heading: sec.querySelector('.bd-h2').textContent,
        buttons: [...sec.querySelectorAll('[data-action]')].map((b) => b.getAttribute('data-action')),
        inlineHandlers: document.querySelectorAll('[onclick],[onchange],[oninput]').length,
        overflow: over
      };
    });
    check(`settings/${theme}/${width}: the page is really in that theme`,
      r.cssTheme, theme === 'ink' ? 'dark' : 'light');
    check(`settings/${theme}/${width}: the Drive section renders`, r.present, true);
    check(`settings/${theme}/${width}: it offers backup, restore, versions, disconnect`,
      r.buttons, ['drive-backup', 'drive-restore', 'drive-versions', 'drive-disconnect']);
    check(`settings/${theme}/${width}: no inline handlers`, r.inlineHandlers, 0);
    check(`settings/${theme}/${width}: no horizontal overflow`, r.overflow <= 0, true);

    /* Every leaf text node in the Drive section, against its own
       ground — the same walk the gate does elsewhere. */
    const low = await page.evaluate(() => {
      const lum = (c) => {
        const m = c.match(/[\d.]+/g).map(Number);
        const f = m.slice(0, 3).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
        return 0.2126 * f[0] + 0.7152 * f[1] + 0.0722 * f[2];
      };
      const bg = (el) => {
        let n = el;
        while (n && n !== document.documentElement) {
          const c = getComputedStyle(n).backgroundColor;
          const m = c.match(/[\d.]+/g);
          if (m && (m.length < 4 || Number(m[3]) > 0.5)) return c;
          n = n.parentElement;
        }
        return getComputedStyle(document.documentElement).backgroundColor || 'rgb(255,255,255)';
      };
      const out = [];
      const sec = document.getElementById('drive');
      const walk = document.createTreeWalker(sec, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = walk.nextNode())) {
        if (!t.textContent.trim()) continue;
        const el = t.parentElement;
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue;
        const fg = getComputedStyle(el).color;
        const a = lum(fg), b = lum(bg(el));
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        if (ratio < 4.5) out.push({ text: t.textContent.trim().slice(0, 40), fg, bg: bg(el), ratio: +ratio.toFixed(2) });
      }
      return out;
    });
    check(`settings/${theme}/${width}: all text clears 4.5:1`, low, []);
    check(`settings/${theme}/${width}: no page errors`, errors, []);
    await ctx.close();
  }
}

await browser.close();
server.close();
console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ all drive checks pass');
process.exit(failed ? 1 : 0);
