/* ============================================================
   PROOF: "delete everything from the cloud" (lane L6, 11 Oct 2026)
   ------------------------------------------------------------
   StudioCloud.deleteOwnedCloudProjects() against a faked Supabase
   (scripts/fake-supabase.mjs for everything it already fakes; this
   file answers /rest/v1/projects and /rest/v1/project_data itself,
   with RLS reproduced from supabase/schema/supabase-schema.sql: proj_delete is
   owner-only, pd_write is FOR ALL for anyone with edit access, and
   project_data cascades from projects).

   Asserted:
     (a) only projects the signed-in user OWNS are deleted — a
         project shared with them and one owned by a stranger keep
         their rows and their project_data
     (b) each owned project's project_data goes too
     (c) local copies are untouched — this deletes the cloud only
     (d) cloud sync is paused (cloudSync:'off') so the next
         keystroke cannot re-create what was just deleted
     (e) the user is still signed in
     (f) a failure on one project is reported by id and does not
         stop the others
     (g) signed out, it refuses

   Run:  node scripts/prove-cloud-delete.mjs
   Builds its own dist (dist-cloud-delete/), gate off, like prove:drive.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { chromium } from 'playwright';
import { F, USERS, SB, REF, handle, sessionFor } from './fake-supabase.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-cloud-delete');
const PORT = Number(process.env.PROVE_PORT) || 5361;
const BASE = `http://localhost:${PORT}/`;

console.log('building dist-cloud-delete/ …');
const build = spawnSync(process.execPath, [
  path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build', '--outDir', OUT, '--emptyOutDir'
], { cwd: ROOT, env: Object.assign({}, process.env, { VITE_DISABLE_SW: '1', VITE_SITE_GATE: 'off' }), encoding: 'utf8' });
if (build.status !== 0) { console.error(build.stdout || '', build.stderr || ''); process.exit(1); }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

const ME = USERS['tok-amy'].id;
const OTHER = USERS['tok-ben'].id;
const O1 = '11111111-1111-4111-8111-111111111111';
const O2 = '22222222-2222-4222-8222-222222222222';
const SHARED = '33333333-3333-4333-8333-333333333333';   // owned by Ben, Amy collaborates
const STRANGER = '44444444-4444-4444-8444-444444444444'; // owned by Ben, invisible to Amy

/* The faked tables, and the log of what the page asked for. */
let DB, LOG, FAIL_DATA_FOR;
const resetDb = () => {
  DB = {
    projects: [
      { id: O1, owner_id: ME, title: 'Mine One', format: 'feature' },
      { id: O2, owner_id: ME, title: 'Mine Two', format: 'short' },
      { id: SHARED, owner_id: OTHER, title: 'Shared With Me', format: 'feature' },
      { id: STRANGER, owner_id: OTHER, title: 'Not Mine', format: 'feature' }
    ],
    data: [O1, O2, SHARED, STRANGER].map((id) => ({ project_id: id, scope: 'scenes', data: { x: id } })),
    visibleExtra: [SHARED]
  };
  LOG = [];
  FAIL_DATA_FOR = null;
};
const uidOf = (auth) => {
  if (USERS[auth]) return USERS[auth].id;    // the fake's session carries the bare token
  try { return JSON.parse(Buffer.from(String(auth).split('.')[1], 'base64url').toString()).sub; } catch (e) { return null; }
};
const eq = (url, col) => { const v = url.searchParams.get(col); return v && v.startsWith('eq.') ? v.slice(3) : null; };
const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

async function route(r) {
  const req = r.request();
  const url = new URL(req.url());
  const uid = uidOf((req.headers()['authorization'] || '').replace(/^Bearer\s+/i, ''));
  const p = url.pathname;
  /* (h) the membership door: this account is a member, so sync is OPEN deterministically. Without it
     the proof raced the gate's first answer and only the first film made in a page ever pushed. */
  if (p.endsWith('/rpc/studio_status')) return json(r, 200, [{ registered: true, role: 'member', disabled: false }]);
  if (/\/rpc\/session_(acquire|ping|takeover|release)$/.test(p)) return json(r, 200, [{ status: 'ok' }]);
  if (p.startsWith('/rest/v1/projects')) {
    const m = req.method();
    const visible = (x) => x.owner_id === uid || DB.visibleExtra.includes(x.id);
    if (m === 'GET') {
      const own = eq(url, 'owner_id');
      return json(r, 200, DB.projects.filter((x) => (own ? x.owner_id === own && x.owner_id === uid : visible(x)))
        .map((x) => ({ id: x.id, title: x.title, format: x.format, owner_id: x.owner_id, created_at: '2026-10-01T00:00:00Z', updated_at: '2026-10-01T00:00:00Z' })));
    }
    if (m === 'DELETE') {
      const id = eq(url, 'id');
      LOG.push('DELETE projects ' + id);
      const hit = DB.projects.find((x) => x.id === id && x.owner_id === uid);   // proj_delete: owner only
      if (hit) {
        DB.projects = DB.projects.filter((x) => x !== hit);
        DB.data = DB.data.filter((d) => d.project_id !== id);                    // ON DELETE CASCADE
      }
      return json(r, 200, hit ? [{ id }] : []);
    }
    if (m !== 'GET') {   // (h) watches what a sync push says
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      LOG.push(m + ' projects ' + (b.id || eq(url, 'id')));
    }
    return handle(r);
  }
  if (p.startsWith('/rest/v1/project_data')) {
    const m = req.method();
    if (m === 'GET') {
      const pid = eq(url, 'project_id');
      return json(r, 200, DB.data.filter((d) => (!pid || d.project_id === pid)
        && (DB.projects.find((x) => x.id === d.project_id) || {}).owner_id === uid || DB.visibleExtra.includes(d.project_id)));
    }
    if (m === 'DELETE') {
      const pid = eq(url, 'project_id');
      LOG.push('DELETE project_data ' + pid);
      if (pid === FAIL_DATA_FOR) return json(r, 500, { message: 'boom', code: 'XX000' });
      const owner = (DB.projects.find((x) => x.id === pid) || {}).owner_id;
      if (owner === uid) DB.data = DB.data.filter((d) => d.project_id !== pid);   // pd_write via has_project_access(edit)
      return json(r, 200, []);
    }
    {   // (h)
      let b = {}; try { b = JSON.parse(req.postData() || '{}'); } catch (e) {}
      LOG.push(m + ' project_data ' + b.project_id);
    }
    return handle(r);
  }
  return handle(r);
}

async function open(browser, signedIn) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  await ctx.route(SB + '/**', route);
  /* this fake account has no plan; the unpaid-account redirect to purchase.html would destroy the page mid-proof (plan-gate.js, a PROOF hook) */
  await ctx.addInitScript(() => { window.__fmsKeepWall = true; });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  let native = 0;
  if (signedIn) {
    await ctx.addInitScript(([k, v, uid]) => {
      if (!sessionStorage.getItem('__seeded')) {
        localStorage.setItem(k, v);
        localStorage.setItem('fms_studio_account_v1', uid);
        sessionStorage.setItem('__seeded', '1');
      }
    }, [`sb-${REF}-auth-token`, sessionFor('tok-amy'), ME]);
  }
  const page = await ctx.newPage();
  page.on('dialog', (d) => { native++; d.dismiss().catch(() => {}); });
  page.__native = () => native;
  await page.goto(BASE + 'settings.html');
  await page.waitForFunction(() => !!window.StudioCloud, null, { timeout: 15000 });
  return { ctx, page };
}

const srv = spawn(process.execPath, [path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'preview', '--outDir', OUT, '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

try {
  F.reset();
  console.log('(a-e) owned projects go, everything else stays');
  resetDb();
  {
    const { ctx, page } = await open(browser, true);
    await page.waitForFunction(() => window.StudioCloud.getSession(), null, { timeout: 15000 });
    await page.evaluate(() => window.StudioCloud.pullProjectList());
    const localBefore = await page.evaluate(() => window.StudioStore.listAllProjects().map((p) => p.id).sort());
    ok(localBefore.includes(O1) && localBefore.includes(O2), 'the account\'s projects are on this device first (' + localBefore.length + ')');
    const res = await page.evaluate(() => window.StudioCloud.deleteOwnedCloudProjects());
    ok(res.ok === true && res.deleted === 2 && res.failed.length === 0, 'result is {ok, deleted:2, failed:[]}: ' + JSON.stringify(res));
    ok(DB.projects.map((x) => x.id).sort().join() === [SHARED, STRANGER].sort().join(), 'only the two owned project rows are gone');
    ok(DB.data.map((d) => d.project_id).sort().join() === [SHARED, STRANGER].sort().join(), 'their project_data is gone, the others keep theirs');
    ok(!LOG.some((l) => l.includes(SHARED) || l.includes(STRANGER)), 'no delete was even attempted on a project that is not theirs');
    const localAfter = await page.evaluate(() => window.StudioStore.listAllProjects().map((p) => p.id).sort());
    ok(JSON.stringify(localAfter) === JSON.stringify(localBefore), 'local copies are untouched');
    const prefs = await page.evaluate(() => JSON.parse(localStorage.getItem('fms_studio_prefs_v1') || '{}'));
    ok(prefs.cloudSync === 'off', 'cloud sync is paused (cloudSync: off)');
    ok(await page.evaluate(() => !!window.StudioCloud.getSession()) && await page.evaluate((k) => !!localStorage.getItem(k), `sb-${REF}-auth-token`), 'still signed in');
    ok(page.__native() === 0, 'no native dialog');
    await ctx.close();
  }

  console.log('(f) one failing project is reported and does not stop the rest');
  resetDb(); FAIL_DATA_FOR = O1;
  {
    const { ctx, page } = await open(browser, true);
    await page.waitForFunction(() => window.StudioCloud.getSession(), null, { timeout: 15000 });
    const res = await page.evaluate(() => window.StudioCloud.deleteOwnedCloudProjects());
    ok(res.ok === false && res.deleted === 1 && res.failed.length === 1 && res.failed[0].id === O1, 'reports {deleted:1, failed:[O1]}: ' + JSON.stringify(res));
    ok(DB.projects.some((x) => x.id === O1) && !DB.projects.some((x) => x.id === O2), 'the failing project survives, the other is gone');
    await ctx.close();
  }

  console.log('(g) signed out, it refuses');
  resetDb();
  {
    const { ctx, page } = await open(browser, false);
    const r = await page.evaluate(() => window.StudioCloud.deleteOwnedCloudProjects().then(() => 'resolved', (e) => String(e.message)));
    ok(/sign in/i.test(r), 'rejects with a sign-in message: ' + r);
    ok(DB.projects.length === 4 && LOG.length === 0, 'and touches nothing');
    await ctx.close();
  }

  console.log('(h) the sample stays on this device; a normal project still syncs');
  /* One film per fresh signed-in page and a clean fake server each time: the sync follows the OPEN
     project. Each probe says whether anything for that project reached the server. */
  const probe = async (title, extra, seedScenes) => {
    resetDb(); DB.projects = []; DB.data = [];
    const { ctx, page } = await open(browser, true);
    await page.waitForFunction(() => window.StudioCloud.getSession(), null, { timeout: 15000 });
    const id = await page.evaluate(({ title, extra, seedScenes }) => {
      const S = window.StudioStore;
      const id = crypto.randomUUID();
      /* a legacy sample's seed ids are stored BEFORE its entry exists, so the create-time push sees them */
      if (seedScenes) S.rawSet('fms_scenes_v1__' + id, JSON.stringify({ scenes: seedScenes }));
      const p = S.createProject({ id, title, format: 'feature', ...(extra || {}) });
      S.setCurrentProject(p.id);
      if (!seedScenes) localStorage.setItem('fms_scenes_v1', JSON.stringify([{ id: 's1', heading: 'INT. ROOM - DAY' }]));
      return p.id;
    }, { title, extra, seedScenes });
    await page.waitForTimeout(3500);
    const hits = LOG.filter((l) => /^(POST|PATCH|PUT) project/.test(l) && l.endsWith(' ' + id));
    await ctx.close();
    return hits;
  };
  {
    const mine = await probe('My Own Film');
    ok(mine.length > 0, 'a normal project still pushes (' + mine.join(', ') + ')');
    const sample = await probe('Dragon', { sample: 'dragon' });
    ok(sample.length === 0, 'the sample (stamped, as openSampleProject() writes it) pushes no project row and no scope: ' + JSON.stringify(sample));
    const namesake = await probe('Dragon');
    ok(namesake.length > 0, 'a film the user titled "Dragon" STILL syncs, title alone is not the sample: ' + namesake.join(', '));
    const bare = await probe('The Dark Knight');
    ok(bare.length > 0, 'an unstamped "The Dark Knight" with no seed ids syncs (no provable marker, safe default)');
    const legacy = await probe('The Dark Knight', null, [{ id: 'darkknight-sc-1' }]);
    ok(legacy.length === 0, 'an unstamped legacy sample whose stored scenes still carry the seed ids stays on the device: ' + JSON.stringify(legacy));
  }
} finally {
  await browser.close();
  srv.kill();
}
console.log(fail ? `\n✗ ${fail} check(s) failed` : `\n✓ all ${pass} cloud-delete checks pass`);
process.exit(fail ? 1 : 0);
