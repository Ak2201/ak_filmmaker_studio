/* ============================================================
   PROOF: the AI history — stamp, badge, Desk History tab and the
   dashboard's "AI in this film" — in a real Chromium against the shared
   Supabase fake (scripts/fake-supabase.mjs aiScenario('pro')) and a
   FAKED Anthropic (the shot division answered from here). No key, no
   network: every other host is aborted. Never a real provider.

   docs/AI-FAST-HARNESS.md B9. A Pro account with a key and a film of
   three scenes with no shots:

     (a) the shot division is run in the Desk and accepted: every shot
         row carries a `.ai-badge` ("AI", role=img, an aria-label that
         names the tool) and the stored shots carry the history stamp
         (`ai.task`, `ai.run`), not `ai: true`
     (b) the Desk's History tab (button.ai-desk-histbtn) lists the run
         with the right count, the item links land on a target that
         exists, and opening it writes nothing to localStorage
     (c) one shot is edited; the run's Undo asks first (the dialog says
         how many are taken back and how many stay), removes the others
         and keeps the edited one, whose badge now says it changed
     (d) dashboard.html#ai opens the closed disclosure, lists the run,
         filters by stage, and writes nothing; with no AI in the film it
         says so
     (e) the badge's text meets AA (4.5:1) against its own ground

   Run:  npm run build:open && npm run prove:ai-history
         (PROVE_DIST=dist-verify to point it at another open build;
          PW_CHROMIUM=/path/to/chromium for a sandboxed browser;
          PROVE_PORT for the port)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { F, SB, REF, USERS, handle, sessionFor, aiScenario } from './fake-supabase.mjs';
import { anthropicSSE } from './fake-ai.mjs';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5384;
const BASE = 'http://localhost:' + PORT;

if (!fs.existsSync(path.join(DIST, 'visualize.html'))) {
  console.error('✗ no ' + path.relative(process.cwd(), DIST) + '/visualize.html — run `npm run build:open` first');
  process.exit(2);
}
{
  const stamp = (fs.readFileSync(path.join(DIST, 'index.html'), 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1];
  if (stamp === 'invite') { console.error('✗ this proof needs the OPEN build (npm run build:open)'); process.exit(2); }
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

const KEY = 'sk-ant-PROVEPROVEPROVEPROVE12';
const ELEMENTS = [
  { id: 'el1', type: 'scene', text: 'INT. ANBU HOUSE - NIGHT' },
  { id: 'el2', type: 'action', text: 'Anbu counts coins on the floor. The ceiling fan ticks.' },
  { id: 'el3', type: 'scene', text: 'EXT. BUS STAND - DAY' },
  { id: 'el4', type: 'action', text: 'The first bus to Chennai pulls in.' },
  { id: 'el5', type: 'scene', text: 'EXT. TEMPLE - DAY' },
  { id: 'el6', type: 'action', text: 'Bells. Anbu lights a lamp and does not pray.' }
];
const SCENES = [
  { id: 'sc1', number: '1', intExt: 'INT', location: 'ANBU HOUSE', dayNight: 'NIGHT', synopsis: 'Coins.' },
  { id: 'sc2', number: '2', intExt: 'EXT', location: 'BUS STAND', dayNight: 'DAY', synopsis: 'The bus.' },
  { id: 'sc3', number: '3', intExt: 'EXT', location: 'TEMPLE', dayNight: 'DAY', synopsis: 'A lamp.' }
];

/* ---- the fake model: a shot division, two shots a scene ------------ */
const requests = [];
async function aiRoute(r) {
  const req = r.request();
  const body = JSON.parse(req.postData() || '{}');
  const content = body.messages ? body.messages[0].content : '';
  const user = typeof content === 'string' ? content : content.map((c) => c.text || '').join('\n');
  requests.push({ url: req.url(), key: req.headers()['x-api-key'] || '' });
  const ids = [...user.matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
  const scenes = ids.map((id) => ({ sceneId: id, shots: [
    { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: '', setup: 'Setup 1', description: 'The place, wide (' + id + ').' },
    { size: 'CU', angle: 'eye level', movement: 'static', lens: '85mm', rig: '', setup: 'Setup 2', description: 'A detail (' + id + ').' }
  ] }));
  return r.fulfill({ status: 200, contentType: 'text/event-stream', body: anthropicSSE({ scenes }) });
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

async function context() {
  const tok = aiScenario('pro', 'tok-amy');
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
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
  }, [`sb-${REF}-auth-token`, sessionFor(tok), USERS[tok].id]);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|websocket|realtime|beforeunload/i.test(m.text())) errors.push(m.text()); });
  page.on('dialog', (d) => {
    if (d.type() === 'beforeunload') { d.accept().catch(() => {}); return; }
    errors.push('native dialog: ' + d.type() + ' ' + d.message()); d.dismiss().catch(() => {});
  });
  return { ctx, page, errors };
}

async function seed(page) {
  await page.goto(BASE + '/index.html', { waitUntil: 'networkidle' });
  await page.evaluate(({ els, scenes, key }) => {
    const S = window.StudioStore;
    const p = S.createProject({ title: 'History Proof', format: 'feature' });
    S.setCurrentProject(p.id);
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: els, revisions: [], documents: [] }));
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    S.rawSet('fms_ai_provider_v1', 'anthropic'); S.rawSet('fms_ai_key_v1', key);
  }, { els: ELEMENTS, scenes: SCENES, key: KEY });
}
async function planKnown(page) {
  for (let i = 0; i < 80 && !F.db.calls.includes('billing_status'); i++) await page.waitForTimeout(100);
  await page.waitForTimeout(900);
}
const shotsNow = (page) => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_shots_v1'));
  return k ? (JSON.parse(localStorage.getItem(k)).shots || []) : [];
});
async function openDeskOnShots(page) {
  /* The pill lives on the page's "Draft a shot division" tab. */
  await page.evaluate(() => { if (location.hash !== '#draft') location.hash = '#draft'; });
  await page.waitForTimeout(400);
  await page.waitForSelector('.ai-pill', { state: 'attached', timeout: 15000 });
  const p = page.locator('.ai-pill:visible', { hasText: /Draft/ }).first();
  if (!(await p.count())) {
    const seen = await page.$$eval('.ai-pill', (els) => els.map((e) => ({ t: e.textContent.trim(), v: !!(e.offsetWidth || e.offsetHeight), s: e.dataset.aiState })));
    throw new Error('no visible Draft pill; pills: ' + JSON.stringify(seen) + ' url ' + page.url());
  }
  await p.click({ timeout: 8000 });
  const item = page.locator('[data-action="ai-pill-task"][data-task="shot-draft"], [data-ai-task="shot-draft"]').first();
  try { await item.waitFor({ state: 'visible', timeout: 1500 }); await item.click(); } catch (e) { /* a one-task pill opens the Desk itself */ }
  await page.waitForFunction(() => { const d = document.querySelector('aside.ai-desk'); return d && !d.hidden && d.getBoundingClientRect().width > 0; }, null, { timeout: 8000 });
  await page.waitForTimeout(500);
}
const contrast = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return null;
  const rgb = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); return m ? m[1].split(',').slice(0, 3).map(Number) : null; };
  const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const fg = rgb(getComputedStyle(el).color);
  let bgEl = el, bg = null;
  while (bgEl && !bg) { const c = getComputedStyle(bgEl).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (m && !(m[1].split(',').length === 4 && Number(m[1].split(',')[3]) === 0)) bg = rgb(c); bgEl = bgEl.parentElement; }
  if (!fg || !bg) return null;
  const a = lum(fg) + 0.05, b = lum(bg) + 0.05;
  return Math.max(a, b) / Math.min(a, b);
}, sel);

{
  console.log('AI history');
  F.reset();
  const { ctx, page, errors } = await context();
  try {
    await seed(page);

    /* ---- (a) run and accept the shot division ---- */
    await page.goto(BASE + '/visualize.html#shot-list', { waitUntil: 'networkidle' });
    await planKnown(page);
    await openDeskOnShots(page);
    await page.click('aside.ai-desk [data-action="ai-desk-run"]');
    await page.waitForSelector('aside.ai-desk .ai-desk-item input[type="checkbox"]', { timeout: 20000 });
    ok(requests.length >= 1 && requests.every((r) => r.key === KEY && !r.url.includes(KEY)), 'the fake provider answered (key in a header, never in the URL)', requests.length);
    const before = await shotsNow(page);
    ok(before.length === 0, 'nothing was written before Accept', before.length);
    await page.click('aside.ai-desk [data-action="ai-desk-accept-all"]');
    await page.waitForFunction(() => document.querySelectorAll('.vz-row').length >= 6, null, { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    const shots = await shotsNow(page);
    ok(shots.length === 6, 'six shots were written (two a scene)', shots.length);
    ok(shots.every((s) => s.ai && typeof s.ai === 'object' && s.ai.task === 'shot-draft' && s.ai.run && s.ai.h && s.ai.model !== undefined),
      'every stored shot carries the history stamp (ai.task, ai.run, ai.h), not `ai: true`', shots.map((s) => s.ai).slice(0, 2));
    ok(new Set(shots.map((s) => s.ai.run)).size === 1, 'one Accept is one run', shots.map((s) => s.ai.run));
    const runId = shots[0].ai.run;
    const badges = await page.$$eval('.vz-row .ai-badge', (els) => els.map((e) => ({ role: e.getAttribute('role'), label: e.getAttribute('aria-label'), text: e.textContent })));
    ok(badges.length === 6, 'a badge on every shot row (6)', badges.length);
    ok(badges.every((b) => b.role === 'img' && b.text === 'AI' && /^Drafted by AI — Shot division/.test(b.label || '')), 'each badge says AI with an accessible label naming the tool', badges[0]);
    const aaBadge = await contrast(page, '.vz-row .ai-badge');
    ok(aaBadge !== null && aaBadge >= 4.5, 'the badge text meets AA (' + (aaBadge && aaBadge.toFixed(2)) + ':1)', aaBadge);

    /* ---- (b) the Desk's History tab ---- */
    await openDeskOnShots(page);
    await page.waitForTimeout(400);
    const w0 = await page.evaluate(() => window.__writes.length);
    await page.click('aside.ai-desk .ai-desk-histbtn');
    await page.waitForSelector('aside.ai-desk .aih-run', { timeout: 10000 });
    const hist = await page.evaluate(() => {
      const runs = [...document.querySelectorAll('aside.ai-desk .aih-run')];
      return {
        runs: runs.length,
        title: runs[0] && runs[0].querySelector('.aih-run-title').textContent,
        meta: runs[0] && runs[0].querySelector('.aih-run-meta').textContent,
        links: runs[0] ? [...runs[0].querySelectorAll('.aih-item a')].map((a) => a.getAttribute('href')) : [],
        shown: runs[0] ? runs[0].querySelector(':scope > ul.aih-items').querySelectorAll('a').length : 0,
        more: runs[0] && (runs[0].querySelector('.aih-more-d summary') || {}).textContent,
        pressed: document.querySelector('aside.ai-desk .ai-desk-histbtn').getAttribute('aria-pressed'),
        undo: runs[0] && !!runs[0].querySelector('[data-action="ai-hist-undo"]')
      };
    });
    ok(hist.runs === 1 && /Shot division/.test(hist.title), 'the History tab lists the one run, named for the tool', hist);
    ok(/6 items/.test(hist.meta || ''), 'it counts the six items it wrote', hist.meta);
    ok(hist.shown === 5 && /and 1 more/.test(hist.more || '') && hist.links.length === 6 && hist.links.every((h) => h === 'visualize.html#shot-list'), 'five links shown and "and 1 more" (six in all); each lands on #shot-list', hist);
    ok(hist.pressed === 'true' && hist.undo, 'the button is pressed and the run offers Undo', hist);
    const idle = await page.evaluate((n) => window.__writes.slice(n).map((w) => w.k), w0);
    ok(idle.length === 0, 'opening the History tab writes nothing to localStorage', idle);
    const target = await page.evaluate(() => !!document.getElementById('shot-list'));
    ok(target, 'the link target (#shot-list) exists on this page');

    /* ---- (c) edit one shot, Undo the run ---- */
    await page.evaluate(() => {
      const k = 'fms_shots_v1';
      const blob = JSON.parse(localStorage.getItem(k));
      blob.shots[0].description = 'I rewrote this one myself.';
      localStorage.setItem(k, JSON.stringify(blob));
    });
    await page.reload({ waitUntil: 'networkidle' });
    await planKnown(page);
    const labels = await page.$$eval('.vz-row .ai-badge', (els) => els.map((e) => e.getAttribute('aria-label')));
    ok(labels.filter((l) => /changed since$/.test(l || '')).length === 1, 'the edited shot\'s badge says it changed since', labels);
    await openDeskOnShots(page);
    await page.click('aside.ai-desk .ai-desk-histbtn');
    await page.waitForSelector('aside.ai-desk .aih-run', { timeout: 10000 });
    const meta2 = await page.textContent('aside.ai-desk .aih-run-meta');
    ok(/1 changed since/.test(meta2), 'the run says one item changed since', meta2);
    await page.click('aside.ai-desk [data-action="ai-hist-undo"]');
    const dlg = page.locator('.dlg');
    await dlg.waitFor({ state: 'visible', timeout: 5000 });
    const dtext = await dlg.textContent();
    ok(/Undo 5 AI-written items from this run\?/.test(dtext) && /1 item you have changed stays/.test(dtext), 'the dialog asks first and says both numbers (5 taken back, 1 stays)', dtext.slice(0, 220));
    const same = await shotsNow(page);
    ok(same.length === 6, 'nothing is removed until the dialog is answered', same.length);
    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => {}),
      page.locator('.dlg button', { hasText: 'Undo' }).last().click()
    ]);
    await page.waitForTimeout(800);
    const left = await shotsNow(page);
    ok(left.length === 1 && left[0].description === 'I rewrote this one myself.', 'only the edited shot is left, with the writer\'s words', left.map((s) => s.description));
    ok(left[0].ai && left[0].ai.run === runId, 'the edited shot keeps its stamp', left[0].ai);
    await planKnown(page);
    const lab2 = await page.$$eval('.vz-row .ai-badge', (els) => els.map((e) => e.getAttribute('aria-label')));
    ok(lab2.length === 1 && /changed since$/.test(lab2[0]), 'its badge still says changed since', lab2);

    /* ---- (d) the dashboard's AI in this film ---- */
    await page.goto(BASE + '/dashboard.html#ai', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    const opened = await page.evaluate(() => { const d = document.getElementById('ai'); return !!d && d.tagName === 'DETAILS' && d.open; });
    ok(opened, 'dashboard.html#ai opens the disclosure');
    await page.waitForSelector('#ai .aih-run', { timeout: 10000 });
    const w1 = await page.evaluate(() => window.__writes.length);
    const dash = await page.evaluate(() => ({
      runs: document.querySelectorAll('#ai .aih-run').length,
      stages: [...document.querySelectorAll('#ai [data-k-seg] .k-seg-btn')].map((b) => b.textContent.trim()),
      links: [...document.querySelectorAll('#ai .aih-item a')].map((a) => a.getAttribute('href'))
    }));
    ok(dash.runs === 1 && dash.stages.includes('Pre-production') && dash.links.length === 1, 'the dashboard lists the run with a stage filter', dash);
    await page.click('#ai [data-k-seg] .k-seg-btn:has-text("Pre-production")');
    ok(await page.locator('#ai .aih-run').count() === 1, 'filtering by Pre-production keeps the run');
    ok(await page.locator('#ai .aih-task option').count() === 2, 'the tool filter lists the one tool (and All)');
    await page.waitForTimeout(500);
    const w2 = await page.evaluate((n) => window.__writes.slice(n).map((w) => w.k), w1);
    ok(w2.length === 0, 'opening and filtering the dashboard section writes nothing', w2);
    const aaTxt = await contrast(page, '#ai .aih-run-title');
    ok(aaTxt !== null && aaTxt >= 4.5, 'the run title meets AA (' + (aaTxt && aaTxt.toFixed(2)) + ':1)', aaTxt);

    /* an empty film says so */
    await page.evaluate(() => {
      const S = window.StudioStore;
      const p = S.createProject({ title: 'Clean Film', format: 'feature' });
      S.setCurrentProject(p.id);
    });
    await page.goto(BASE + '/dashboard.html#ai', { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
    ok(await page.locator('#ai .aih-empty').count() === 1 && /Nothing in this film was drafted by AI yet\./.test(await page.textContent('#ai .aih-empty')), 'a film with no AI in it says so');
    ok(errors.length === 0, 'no page errors', errors);
  } catch (e) { ok(false, 'the scenario stopped: ' + String((e && e.message) || e).split('\n')[0]); }
  finally { await ctx.close(); }
}

await browser.close();
server.close();
console.log(`\nprove:ai-history — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
