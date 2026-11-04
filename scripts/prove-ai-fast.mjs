/* ============================================================
   PROOF: the AI Desk's one-press flow — small batches three at a
   time, a card the moment a scene arrives, Careful, Edit prompt, a
   run that outlives the Desk — in a real Chromium against the shared
   Supabase fake (scripts/fake-supabase.mjs) and a FAKED, HELD
   Anthropic: every request waits until the proof lets it answer, so
   "a card is on screen while a later request is still out" is a fact
   the proof can stand on. No key, no network, never a real provider.

     (a) SHOT DRAFT, ten scenes (visualize.html): the Desk opens on a
         "Draft shots for 10 scenes" button with a cost line, the
         Careful switch (off) and a closed "See what is sent" link;
         one press → ONE request goes out alone (warm first); when it
         answers, three scenes' cards are visible while the next three
         requests are still held — at most 3 open at once; closing the
         Desk mid-run keeps the run, reopening shows it still filling;
         NOTHING reaches the shots, the script or the job before Accept
         (a localStorage write spy); effort is LOW; the system prompt
         carries cache_control and the key is a header, not the url;
         Stop keeps the arrived cards and says "Stopped after 3 of 10";
         a scene's checkbox unticks its shots; Accept selected writes
         exactly the ticked ones, and Undo removes exactly those
     (b) CAREFUL, a fresh load: ticking the switch writes aiCareful in
         fms_studio_prefs_v1 on the click and not before; the requests
         say effort "high"; the run completes (4 requests); Accept all
         writes every shot; Undo removes them
     (c) GEN-BATCH, six remaining scenes (write.html#generate): the
         one-press button sits beside the provider disclosure; pressing
         it opens the Desk and runs at once; three requests of two
         scenes; a 429 on one batch is retried once, then its two
         scenes are NAMED in the note and everything else is kept;
         Accept all writes the arrived scenes only, the two failed ones
         stay next in line; Undo restores the script and the cursor

   Run:  npm run build:verify  (or VITE_SITE_GATE=off vite build --outDir dist-verify)
         PROVE_DIST=dist-verify npm run prove:ai-fast
         (PW_CHROMIUM=/path/to/chromium for a sandboxed browser)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE, scenePagesAnswer } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5384;
const BASE = 'http://localhost:' + PORT;

if (!fs.existsSync(path.join(DIST, 'visualize.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/visualize.html — run an open build first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build'); process.exit(2); }
}

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let pass = 0, fail = 0;
function ok(cond, label, detail) {
  if (cond) pass++; else fail++;
  console.log((cond ? '  ✓ ' : '  ✗ ') + label + (cond || detail === undefined ? '' : '\n        ' + JSON.stringify(detail)));
  return !!cond;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';

/* ---- the held fake model ----------------------------------------
   Every request is recorded and then WAITS (when `hold` is on) until
   the proof releases it. `open` is how many are out right now. */
const reqs = [];
let hold = true;
let open = 0;
let peakOpen = 0;
let answerFn = null;
const text = (v) => (Array.isArray(v) ? v.map((b) => (b && b.text) || '').join('\n') : v);
const shotsFor = (id) => ({
  sceneId: id,
  shots: [
    { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: 'Key from window', setup: 'Setup 1', description: 'The room of ' + id + '.' },
    { size: 'CU', angle: 'eye level', movement: 'static', lens: '', rig: '', setup: '', description: 'A detail of ' + id + '.' }
  ]
});

async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const user = text(body.messages ? body.messages[0].content : '');
  const entry = {
    url: req.url(), body, user, key: req.headers()['x-api-key'] || '',
    ids: [...user.matchAll(/sceneId: (\S+)/g)].map((m) => m[1]), released: false, aborted: false
  };
  entry.wait = new Promise((res) => { entry.release = () => { entry.released = true; res(); }; });
  reqs.push(entry);
  open++; peakOpen = Math.max(peakOpen, open);
  if (hold) await entry.wait;
  open--;
  const ans = answerFn ? await answerFn(entry) : null;
  try {
    if (ans && ans.status) return await r.fulfill({ status: ans.status, contentType: 'application/json', body: JSON.stringify(ans.body || {}) });
    return await r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE(ans) });
  } catch (e) { entry.aborted = true; }   // the page stopped waiting
}
const releaseAll = () => { for (const e of reqs) if (!e.released) e.release(); };
const heldCount = () => reqs.filter((e) => !e.released).length;
async function waitFor(fn, ms = 15000) {
  const t0 = Date.now();
  for (;;) { if (await fn()) return true; if (Date.now() - t0 > ms) return false; await sleep(60); }
}
function reset() { reqs.length = 0; hold = true; open = 0; peakOpen = 0; answerFn = null; }

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function context({ tok = null, width = 1280 } = {}) {
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width, height: 900 } });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await ctx.route((u) => !u.href.startsWith(BASE) && !u.href.startsWith(SB) && !/^https:\/\/api\.anthropic\.com\//.test(u.href)
    && !/fonts\.(googleapis|gstatic)\.com/.test(u.href), (r) => r.abort());
  await ctx.route(SB + '/**', handle);
  await ctx.route(/^https:\/\/api\.anthropic\.com\//, aiRoute);
  await ctx.addInitScript(([k, v, uid]) => {
    window.__writes = [];
    const set = Storage.prototype.setItem, rem = Storage.prototype.removeItem;
    Storage.prototype.setItem = function (a, b) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now() }); return set.call(this, a, b); };
    Storage.prototype.removeItem = function (a) { if (this === localStorage) window.__writes.push({ k: String(a), t: performance.now(), rm: true }); return rem.call(this, a); };
    if (k && !sessionStorage.getItem('__seeded')) { localStorage.setItem(k, v); localStorage.setItem('fms_studio_account_v1', uid); sessionStorage.setItem('__seeded', '1'); }
  }, tok ? [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id] : [null, null, null]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload|ERR_FAILED|aborted/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { d.accept().catch(() => {}); return; }
    errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {});
  });
  return { ctx, page, errors };
}

async function planKnown(page) {
  for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(900);
}
const writesTo = (page, key) => page.evaluate((key) => window.__writes.filter((w) => w.k.startsWith(key)).length, key);
const stored = (page, key) => page.evaluate((key) => {
  const k = Object.keys(localStorage).find((x) => x === key || x.startsWith(key + '__'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
}, key);
const deskOpen = (page) => page.evaluate(() => {
  const d = document.querySelector('aside.ai-desk');
  if (!d) return false;
  const r = d.getBoundingClientRect(), cs = getComputedStyle(d);
  return !d.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0;
});
const cards = (page) => page.$$eval('aside.ai-desk label.ai-desk-item', (ls) => ls.map((l) => ({
  id: (l.querySelector('input[data-tick="item"]') || {}).dataset?.id || '', checked: !!(l.querySelector('input[data-tick="item"]') || {}).checked
})));
const SCENE_KEYS = ['fms_shots_v1', 'fms_script_v1', 'fms_scriptgen_v1', 'fms_scenes_v1'];
const modelWrites = async (page) => (await Promise.all(SCENE_KEYS.map((k) => writesTo(page, k)))).reduce((a, b) => a + b, 0);

async function openPillIn(page, scope, labelRe, taskId) {
  await page.waitForSelector(scope + ' .ai-pill', { state: 'attached', timeout: 15000 }).catch(() => {});
  const all = page.locator(scope + ' .ai-pill');
  const n = await all.count();
  let target = null, label = '';
  for (let i = 0; i < n; i++) {
    const t = (await all.nth(i).textContent()) || '';
    if (labelRe.test(t)) { target = all.nth(i); label = t.trim(); break; }
  }
  if (!target) return '';
  await target.scrollIntoViewIfNeeded().catch(() => {});
  await target.click();
  const item = page.locator(`[data-action="ai-pill-task"][data-task="${taskId}"]`).first();
  try { await item.waitFor({ state: 'visible', timeout: 1500 }); await item.click(); } catch (e) { /* one task: the Desk opened itself */ }
  await page.waitForFunction(() => {
    const d = document.querySelector('aside.ai-desk');
    return d && !d.hidden && d.getBoundingClientRect().width > 0;
  }, null, { timeout: 8000 }).catch(() => {});
  await page.waitForTimeout(400);
  return label || '(pill)';
}

/* ---- seeds ------------------------------------------------------ */
const SCENES = Array.from({ length: 10 }, (_, i) => ({
  id: 'sc' + (i + 1), number: String(i + 1), intExt: i % 2 ? 'EXT' : 'INT', dayNight: i % 3 ? 'DAY' : 'NIGHT',
  location: 'PLACE ' + (i + 1), synopsis: 'Scene ' + (i + 1) + ' happens', eighths: 8
}));
async function seedShots(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ scenes, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'Fast Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    /* a script, or the draft panel says "There is no script yet" */
    const elements = scenes.flatMap((sc, i) => [
      { id: 'h' + i, type: 'scene', text: sc.intExt + '. ' + sc.location + ' - ' + (sc.dayNight || 'DAY') },
      { id: 'a' + i, type: 'action', text: 'Something happens in scene ' + sc.number + '.' }
    ]);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements, revisions: [], documents: [] }));
    S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key);
  }, { scenes: SCENES, key: KEY });
}
const shotsOf = async (page) => { const s = await stored(page, 'fms_shots_v1'); return s ? (Array.isArray(s) ? s : s.shots || []) : []; };

async function openShotDesk(page) {
  await page.goto(BASE + '/visualize.html#draft', { waitUntil: 'networkidle' });
  await planKnown(page);
  const label = await openPillIn(page, 'body', /with AI/i, 'shot-draft');
  return label;
}
const clickUndo = async (page) => {
  const undo = page.locator('.toast', { hasText: /applied\./ }).locator('.toast-action', { hasText: /Undo/ }).last();
  const has = await undo.waitFor({ state: 'visible', timeout: 4000 }).then(() => true, () => false);
  if (has) await undo.click();
  await page.waitForTimeout(900);
  return has;
};

/* =================================================================
   (a) shot draft, ten scenes
   ================================================================= */
{
  console.log('(a) shot-draft: ten scenes, one press');
  F.reset(); reset();
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    await seedShots(page);
    answerFn = async (e) => ({ scenes: e.ids.map(shotsFor) });
    const label = await openShotDesk(page);
    ok(!!label, 'the shot-draft pill opens the Desk ("' + label + '")');
    ok(await deskOpen(page), 'the Desk is open');
    ok(reqs.length === 0, 'nothing was sent on open', reqs.length);

    const ui = await page.evaluate(() => {
      const d = document.querySelector('aside.ai-desk');
      const run = d.querySelector('[data-action="ai-desk-run"]');
      const det = d.querySelector('details.ai-desk-editprompt');
      const care = d.querySelector('input[data-action="ai-desk-careful"]');
      return {
        run: run ? run.textContent.trim() : null, cost: (d.querySelector('.ai-desk-cost') || {}).textContent || '',
        det: !!det, detOpen: det ? det.open : null, sum: det ? det.querySelector('summary').textContent.trim() : '',
        taVisible: det ? det.querySelector('textarea').checkVisibility() : null,
        care: care ? care.checked : null, disclose: !!d.querySelector('.ai-disclose')
      };
    });
    ok(/^Draft shots for 10 scenes$/.test(ui.run || ''), 'the primary button says what it will do ("' + ui.run + '")', ui);
    ok(/4 requests, 3 at a time/.test(ui.cost), 'a cost line: "' + ui.cost + '"', ui);
    ok(ui.det && ui.detOpen === false && ui.taVisible === false, 'the prompt sits in a closed link, not a step', ui);
    ok(/^See what is sent$/.test(ui.sum), 'the link reads "' + ui.sum + '" for a task whose input is not editable', ui);
    ok(ui.care === false, 'the Careful switch is there and off', ui);
    ok(ui.disclose, 'the provider disclosure is on the Desk');
    await page.locator('aside.ai-desk details.ai-desk-editprompt summary').click();
    const ta = await page.locator('aside.ai-desk .ai-desk-input').inputValue();
    ok(await page.locator('aside.ai-desk .ai-desk-input').isVisible() && /sceneId: sc1/.test(ta), 'the link opens the textarea with what is sent');
    await page.locator('aside.ai-desk details.ai-desk-editprompt summary').click();

    const prefsBefore = await writesTo(page, 'fms_studio_prefs_v1');
    const m0 = await modelWrites(page);
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    ok(await waitFor(() => reqs.length >= 1), 'Run sent a request');
    await sleep(500);
    ok(reqs.length === 1, 'WARM FIRST: one request goes out alone while it is held (' + reqs.length + ')');
    ok(await page.locator('aside.ai-desk [data-action="ai-desk-stop"]').count() === 1, 'Stop is there while it runs');
    ok(await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').isDisabled(), 'Accept is disabled while the run is live');
    ok(await page.locator('aside.ai-desk .ai-desk-progress[role="status"]').count() === 1, 'a progress line with role=status');

    reqs[0].release();
    ok(await waitFor(() => reqs.length === 4), 'when the first answers, the other three requests go out (' + reqs.length + ')');
    ok(await waitFor(async () => (await cards(page)).length === 6), 'three scenes\' cards (six shots) are on screen');
    ok(heldCount() === 3, 'while the next three requests are still held (' + heldCount() + ')');
    ok(peakOpen <= 3 && peakOpen >= 3, 'at most three requests were open at once (peak ' + peakOpen + ')');
    const prog = await page.locator('aside.ai-desk .ai-desk-progress').textContent();
    ok(/3 of 10 scenes/.test(prog), 'the progress line counts them: "' + prog + '"');
    ok(await page.locator('aside.ai-desk label.ai-desk-group').count() === 3, 'each scene has its header');
    ok(await modelWrites(page) === m0, 'NOTHING was written to the shots, script, scenes or job yet', await modelWrites(page) - m0);
    ok(reqs[0].body.output_config.effort === 'low', 'effort is LOW by default', reqs[0].body.output_config);
    ok(Array.isArray(reqs[0].body.system) && reqs[0].body.system[0].cache_control && reqs[0].body.system[0].cache_control.type === 'ephemeral', 'the system prompt carries cache_control');
    ok(reqs.every((e) => e.key === KEY && !e.url.includes(KEY)), 'the key is a header on every request, never the url');
    ok(await writesTo(page, 'fms_studio_prefs_v1') === prefsBefore, 'no preference was written by the run');

    /* close the Desk mid-run: the run goes on */
    await page.click('aside.ai-desk [data-action="ai-desk-close"]');
    ok(!(await deskOpen(page)), 'the Desk closes');
    await sleep(300);
    ok(heldCount() === 3 && reqs.every((e) => !e.aborted), 'closing did not stop the run: the three requests are still out');
    await openPillIn(page, 'body', /with AI/i, 'shot-draft');
    ok(await deskOpen(page), 'the Desk reopens');
    ok(await page.locator('aside.ai-desk [data-action="ai-desk-stop"]').count() === 1 && (await cards(page)).length === 6, 'and shows the run still filling (Stop, six cards)');
    ok(reqs.length === 4, 'reopening sent nothing new (' + reqs.length + ')');

    /* a second answer lands: more cards, while the others are held */
    reqs[1].release();
    ok(await waitFor(async () => (await cards(page)).length === 12), 'a later answer adds its three scenes\' cards live');
    ok(heldCount() === 2, 'two requests are still held');

    /* Stop keeps what arrived */
    await page.click('aside.ai-desk [data-action="ai-desk-stop"]');
    ok(await waitFor(async () => await page.locator('aside.ai-desk [data-action="ai-desk-stop"]').count() === 0), 'Stop ends the run');
    releaseAll();
    const kept = await cards(page);
    ok(kept.length === 12, 'the arrived cards are kept (' + kept.length + ')');
    const note = await page.locator('aside.ai-desk .ai-desk-answer .ai-desk-note').textContent();
    ok(/Stopped after 6 of 10 scenes/.test(note) && /Nothing is written until you accept/.test(note), 'the note says so: "' + note.trim() + '"');
    ok(await page.locator('aside.ai-desk [data-action="ai-desk-accept"]').isEnabled(), 'Accept is available again');
    ok(await modelWrites(page) === m0, 'still nothing written after Stop');

    /* tick per scene */
    const groupBox = page.locator('aside.ai-desk input[data-tick="group"]').nth(1);
    await groupBox.uncheck();
    const after = await cards(page);
    ok(after.filter((c) => !c.checked).length === 2 && after.slice(2, 4).every((c) => !c.checked), 'a scene\'s checkbox unticks its shots (and only its)', after.map((c) => c.checked));
    await page.click('aside.ai-desk [data-action="ai-desk-accept"]');
    await page.waitForTimeout(900);
    const shots = await shotsOf(page);
    const bySc = {};
    for (const s of shots) bySc[s.sceneId] = (bySc[s.sceneId] || 0) + 1;
    ok(shots.length === 10 && !bySc.sc2 && bySc.sc1 === 2 && bySc.sc6 === 2, 'Accept selected wrote exactly the ticked scenes\' shots (10, none for sc2)', bySc);
    ok(await clickUndo(page), 'an Undo toast is offered');
    ok((await shotsOf(page)).length === 0, 'Undo removed exactly those shots');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { releaseAll(); await ctx.close(); }
}

/* =================================================================
   (b) Careful, a fresh load, the whole run
   ================================================================= */
{
  console.log('(b) shot-draft: Careful, a whole run, Accept all and Undo');
  F.reset(); reset();
  hold = false;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    await seedShots(page);
    answerFn = async (e) => { await sleep(80); return { scenes: e.ids.map(shotsFor) }; };
    await openShotDesk(page);
    const w0 = await writesTo(page, 'fms_studio_prefs_v1');
    await page.locator('aside.ai-desk input[data-action="ai-desk-careful"]').check();
    await page.waitForTimeout(200);
    ok(await writesTo(page, 'fms_studio_prefs_v1') === w0 + 1, 'ticking Careful writes aiCareful on the click, and only then');
    const prefs = await page.evaluate(() => { try { return JSON.parse(localStorage.getItem('fms_studio_prefs_v1')); } catch (e) { return null; } });
    ok(prefs && prefs.aiCareful === true, 'the field is aiCareful inside fms_studio_prefs_v1', prefs);
    const keysBefore = await page.evaluate(() => Object.keys(localStorage).sort().join('|'));
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    ok(await waitFor(async () => await page.locator('aside.ai-desk [data-action="ai-desk-stop"]').count() === 0 && reqs.length === 4, 30000), 'the run completes in four requests (' + reqs.length + ')');
    ok(reqs.every((e) => e.body.output_config.effort === 'high'), 'every request says effort "high"', reqs.map((e) => e.body.output_config.effort));
    const c = await cards(page);
    ok(c.length === 20, 'twenty shot cards, ten scenes (' + c.length + ')');
    const keysAfter = await page.evaluate(() => Object.keys(localStorage).sort().join('|'));
    ok(keysAfter === keysBefore, 'no storage key was added', { keysBefore, keysAfter });
    ok((await shotsOf(page)).length === 0, 'and still no shot is written');
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    await page.waitForTimeout(900);
    const shots = await shotsOf(page);
    ok(shots.length === 20 && shots.every((s) => s.ai), 'Accept all wrote all twenty, each marked ai', shots.length);
    ok(await clickUndo(page) && (await shotsOf(page)).length === 0, 'Undo removes them all');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { releaseAll(); await ctx.close(); }
}

/* =================================================================
   (c) gen-batch: the one-press button, six remaining scenes
   ================================================================= */
{
  console.log('(c) gen-batch: "Write all 6 scenes", a 429 on one batch');
  F.reset(); reset();
  hold = false;
  const tok = aiScenario('pro', 'tok-amy');
  const { ctx, page, errors } = await context({ tok });
  try {
    const LOCS = ['ANBU HOUSE', 'BUS STAND', 'CHENNAI MANSION', 'TEA SHOP', 'MILL GATE', 'TEMPLE'];
    const rows = LOCS.map((loc, i) => ({
      id: 'gs' + (i + 1), number: String(i + 1), intExt: i % 2 ? 'EXT' : 'INT', dayNight: i % 2 ? 'DAY' : 'NIGHT',
      location: loc, synopsis: 'Scene ' + (i + 1) + ' happens', eighths: 8, elements: { cast: ['ANBU'] }
    }));
    const jobScenes = rows.map((r) => ({
      sceneId: r.id, slug: r.intExt + '. ' + r.location + ' - ' + r.dayNight, synopsis: r.synopsis, eighths: 8, cast: ['ANBU'], beat: 'catalyst'
    }));
    await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
    await page.evaluate(({ rows, jobScenes, key }) => {
      const S = window.StudioStore;
      const p = S.createProject({ title: 'Gen Fast', format: 'feature' });
      S.setCurrentProject(p.id);
      localStorage.setItem('fms_script_v1', JSON.stringify({ elements: [], revisions: [], documents: [] }));
      localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: rows }));
      localStorage.setItem('fms_scriptgen_v1', JSON.stringify({
        stage: 'pages', synopsis: 'A broke son leaves.', logline: 'A son leaves home to find work.', format: 'feature', lang: 'ta-dialogue',
        target: 0, beats: [{ id: 'catalyst', label: 'Catalyst', happens: 'The mill closes.' }], scenes: jobScenes, cursor: 0,
        model: '', startedAt: new Date().toISOString(), truncations: 0
      }));
      S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key);
    }, { rows, jobScenes, key: KEY });
    answerFn = async (e) => {
      if (e.ids.includes('gs3')) return { status: 429, body: { error: { message: 'slow down' } } };
      await sleep(60);
      return scenePagesAnswer(e.user);
    };
    await page.goto(BASE + '/write.html?stay=1#generate', { waitUntil: 'networkidle' });
    await planKnown(page);
    const btn = page.locator('#generate [data-action="gen-run-all"]');
    ok(await btn.isVisible(), 'the one-press button is on the generate section');
    ok(/^Write all 6 scenes$/.test((await btn.textContent()).trim()), 'it says "' + (await btn.textContent()).trim() + '"');
    const near = await page.evaluate(() => {
      const b = document.querySelector('#generate [data-action="gen-run-all"]');
      const acts = b.closest('.wr-gen-acts');
      const d = acts && acts.parentElement.querySelector('.ai-disclose');
      return { disclose: !!d, text: d ? d.textContent : '', after: d ? !!(acts.compareDocumentPosition(d) & Node.DOCUMENT_POSITION_FOLLOWING) : false };
    });
    ok(near.disclose && near.after && /sent/.test(near.text), 'the provider disclosure sits right beside it', near);
    ok(reqs.length === 0, 'nothing is sent before the press');
    const m0 = await modelWrites(page);
    await btn.click();
    ok(await waitFor(async () => await deskOpen(page)), 'the press opens the Desk');
    ok(await waitFor(() => reqs.length >= 1), 'and runs at once (no second press)');
    ok(await waitFor(async () => (await page.locator('aside.ai-desk label.ai-desk-item').count()) >= 1), 'cards appear');
    ok(await waitFor(async () => await page.locator('aside.ai-desk [data-action="ai-desk-stop"]').count() === 0, 40000), 'the run finishes (the 429 batch is retried once, then reported)');
    /* callModel sends a 429 straight to the next model (Opus here), so per
       runBatches attempt the batch goes out once on the chosen model; the
       batch is retried once, so twice on the chosen model in all. */
    const onChosen = reqs.filter((e) => e.ids.includes('gs3') && e.body.model === 'claude-sonnet-5').length;
    ok(reqs.length >= 4 && onChosen === 2, 'six scenes are three requests of two; the 429 one went out twice on the chosen model (' + onChosen + '; ' + reqs.length + ' in all)');
    ok(reqs.every((e) => /marked WRITE THIS/.test(e.user)), 'every request is a pages request');
    const shared = text(reqs[0].body.messages[0].content);
    ok(Array.isArray(reqs[0].body.messages[0].content) && reqs[0].body.messages[0].content[0].cache_control, 'the run\'s shared block is cached');
    ok(reqs.slice(1).every((e) => JSON.stringify(e.body.messages[0].content[0]) === JSON.stringify(reqs[0].body.messages[0].content[0])
      && JSON.stringify(e.body.system) === JSON.stringify(reqs[0].body.system) && JSON.stringify(e.body.output_config) === JSON.stringify(reqs[0].body.output_config)),
    'system, schema, effort and the shared block are byte-identical across the batches');
    void shared;
    ok(reqs[0].body.output_config.effort === 'low', 'effort low');
    const items = await cards(page);
    ok(items.length === 4, 'four scenes arrived (' + items.length + ')', items);
    const note = await page.locator('aside.ai-desk .ai-desk-answer .ai-desk-note').textContent();
    ok(/Not drafted \(rate limited\)/.test(note) && /MILL GATE|CHENNAI MANSION/.test(note) && /CHENNAI MANSION/.test(note) && /TEA SHOP/.test(note), 'the failed batch names its two scenes: "' + note.replace(/\n/g, ' | ').slice(0, 260) + '"');
    ok(await modelWrites(page) === m0, 'NOTHING was written before Accept', await modelWrites(page) - m0);
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    await page.waitForTimeout(1200);
    const doc = await stored(page, 'fms_script_v1');
    const heads = (doc.elements || []).filter((e) => e.type === 'scene').map((e) => e.text);
    ok(heads.length === 4 && !heads.some((h) => /CHENNAI MANSION|TEA SHOP/.test(h)), 'Accept all wrote the four arrived scenes only', heads);
    const job = await stored(page, 'fms_scriptgen_v1');
    ok(job.cursor === 4 && job.stage === 'pages' && job.scenes.slice(4).map((s) => s.sceneId).join() === 'gs3,gs4', 'the two failed scenes are next in line', { cursor: job.cursor, tail: job.scenes.slice(4).map((s) => s.sceneId) });
    ok(await clickUndo(page), 'an Undo toast is offered');
    const undone = await stored(page, 'fms_script_v1');
    ok(undone.elements.length === 0 && (await stored(page, 'fms_scriptgen_v1')).cursor === 0, 'Undo restores the script and the cursor');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String(e && e.message || e).split('\n')[0]); }
  finally { releaseAll(); await ctx.close(); }
}

await browser.close();
server.close();
console.log('\nprove:ai-fast — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
