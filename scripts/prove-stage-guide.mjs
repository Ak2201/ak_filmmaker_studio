/* ============================================================
   PROOF: the stage guide shares storage with the blueprints
   ------------------------------------------------------------
   Two halves, because the guide is mounted by pages other lanes own
   and the widgets it ports live on stages whose pages do not mount
   it yet:

   (1) THE BUILD (dist/, `npm run build:open`): shoot.html and
       edit.html carry a Guide section. For a feature project and for
       a short project, an answer given in the guide appears on the
       blueprint page after a reload, and an answer given on the
       blueprint page appears in the guide — both directions, ticks
       included — and a write from the guide leaves every other
       answer in the blob alone. With no project the section says so.

   (2) THE SOURCE (a Vite dev server): the same module mounted on
       every stage for a feature and a short project. The short's
       scene map and script editor round-trip byte-identical against
       the shapes short.js stores, the feature's derived views draw,
       and a freshly mounted guide writes NOTHING until someone types.

       npm run build:open && npm run prove:stage-guide
       (PW_CHROMIUM=<path> picks a Chromium other than Playwright's own)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { createServer } from 'vite';
process.env.VITE_SITE_GATE = 'off';

const DIST = path.resolve('dist');
const PORT = Number(process.env.PROVE_PORT) || 5361;
const DEV_PORT = PORT + 1;
const FKEY = 'fms_filmmaker_combined_v1';
const SKEY = 'fms_shortfilm_blueprint_v1';

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
/* network failures (fonts, Supabase) are the sandbox, not the page */
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const blob = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
const guideReady = async () => {
  await page.evaluate(() => document.getElementById('guide') && document.getElementById('guide').scrollIntoView());
  await page.waitForSelector('#guide .sg-steps', { timeout: 15000 });
};
const guideFields = () => page.evaluate(() => [...document.querySelectorAll('#guide [data-key]')]
  .map((el) => el.getAttribute('data-key') + ':' + el.tagName));
const settle = () => page.waitForTimeout(700);

/* a project, set up the way adoption's proof does it */
async function seed(format, title, seedBlobKey, seedBlob) {
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(({ format, title, key, data }) => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title, format });
    S.setCurrentProject(p.id);
    localStorage.setItem(key, JSON.stringify(data));
    S.notify('projects:changed', { reason: 'test' });
  }, { format, title, key: seedBlobKey, data: seedBlob });
}

/* ---- (0) no project ------------------------------------------------- */
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.clear());
await page.goto(url('shoot.html'), { waitUntil: 'networkidle' });
check('(0) no project: the Guide section is still there', await page.evaluate(() => !!document.getElementById('guide')), true);
check('(0) no project: it asks for a project and links to the hub', await page.evaluate(() => {
  const s = document.getElementById('guide');
  const a = s && s.querySelector('a[href="index.html"]');
  return !!a && /Open a project/.test(s.textContent);
}), true);
check('(0) no project: it carries its tab label', await page.evaluate(() => document.getElementById('guide').getAttribute('data-tab-label')), 'Guide');

/* ---- (1) FEATURE project through the build ---------------------------- */
const KEEP = { s1_whatif: 'KEEP-ME', sl_1_slug: 'INT. HOUSE - DAY', meta_title: 'Dragon', hod_a_check: true };
await seed('feature', 'Proof Feature', FKEY, KEEP);

await page.goto(url('shoot.html'), { waitUntil: 'networkidle' });
const before = await blob(FKEY);
await guideReady();
await settle();
check('(1) opening shoot.html + the guide writes nothing', await blob(FKEY), before);
const fields = await guideFields();
check('(1) production guide shows the Part IV cover fields', ['p3_start', 'p3_days', 'p3_ad', 'p3_base']
  .every((k) => fields.some((f) => f.startsWith(k + ':'))), true);
check('(1) production guide shows steps 25–28 only', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .step')].map((s) => s.getAttribute('data-sg-id') || s.id)), ['sg-step-25', 'sg-step-26', 'sg-step-27', 'sg-step-28'].map((x) => x.replace('sg-', '')));

/* answer a cover field and a step field in the guide */
await page.fill('#guide [data-key="p3_ad"]', 'GUIDE-1ST-AD');
const stepField = await page.evaluate(() => {
  const el = document.querySelector('#guide .step textarea[data-key], #guide .step input[type="text"][data-key]');
  return el && el.getAttribute('data-key');
});
await page.fill(`#guide [data-key="${stepField}"]`, 'GUIDE-ANSWER');
/* a checklist tick */
const tickKey = await page.evaluate(() => {
  const li = document.querySelector('#guide .step-check li[data-key]');
  li.click();
  return li.getAttribute('data-key');
});
await settle();
let b = await blob(FKEY);
check('(1) the guide wrote the cover field', b.p3_ad, 'GUIDE-1ST-AD');
check('(1) the guide wrote the step field', b[stepField], 'GUIDE-ANSWER');
check('(1) a tick is stored as a boolean true', b[tickKey], true);
const changed = Object.keys(b).filter((k) => !(k in before) || JSON.stringify(b[k]) !== JSON.stringify(before[k])).sort();
check('(1) ONLY the touched keys changed', changed, ['p3_ad', stepField, tickKey].sort());
check('(1) every other answer is intact', Object.entries(KEEP).every(([k, v]) => b[k] === v), true);

/* … and the blueprint shows them */
await page.goto(url('feature.html'), { waitUntil: 'networkidle' });
const onBlueprint = await page.evaluate(([c, s, t]) => ({
  c: document.querySelector(`[data-key="${c}"]`).value,
  s: document.querySelector(`[data-key="${s}"]`).value,
  t: document.querySelector(`li[data-key="${t}"]`).classList.contains('checked'),
  keep: document.querySelector('[data-key="s1_whatif"]').value
}), ['p3_ad', stepField, tickKey]);
check('(1) feature.html shows the guide’s cover answer', onBlueprint.c, 'GUIDE-1ST-AD');
check('(1) feature.html shows the guide’s step answer', onBlueprint.s, 'GUIDE-ANSWER');
check('(1) feature.html shows the guide’s tick', onBlueprint.t, true);
check('(1) feature.html still has the untouched answer', onBlueprint.keep, 'KEEP-ME');

/* the other direction: type on the blueprint, read it in the guide on edit.html */
await page.fill('[data-key="p4_editor"]', 'BLUEPRINT-EDITOR');
await page.waitForTimeout(900);
await page.goto(url('edit.html'), { waitUntil: 'networkidle' });
await guideReady();
check('(1) edit.html’s guide shows what the blueprint saved',
  await page.inputValue('#guide [data-key="p4_editor"]'), 'BLUEPRINT-EDITOR');
check('(1) edit.html’s guide is steps 29–32', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .step')].map((s) => s.getAttribute('data-sg-id'))), ['step-29', 'step-30', 'step-31', 'step-32']);
await page.fill('#guide [data-key="p4_music"]', 'GUIDE-COMPOSER');
/* a production-ns checkbox (the HOD sign-off) is a boolean */
const hod = await page.evaluate(() => {
  const el = document.querySelector('#guide input[type="checkbox"][data-key]');
  return el ? el.getAttribute('data-key') : null;
});
if (hod) { await page.check(`#guide [data-key="${hod}"]`); }
await settle();
b = await blob(FKEY);
check('(1) edit.html wrote the composer', b.p4_music, 'GUIDE-COMPOSER');
check('(1) the blueprint’s own edit survived the guide’s write', b.p4_editor, 'BLUEPRINT-EDITOR');
if (hod) check('(1) a sign-off checkbox is stored as boolean true', b[hod], true);
await page.goto(url('feature.html'), { waitUntil: 'networkidle' });
check('(1) feature.html shows the composer', await page.inputValue('[data-key="p4_music"]'), 'GUIDE-COMPOSER');
if (hod) check('(1) feature.html shows the ticked sign-off', await page.isChecked(`[data-key="${hod}"]`), true);

/* storage event: an answer given in another tab shows without a reload */
await page.goto(url('shoot.html'), { waitUntil: 'networkidle' });
await guideReady();
const other = await ctx.newPage();
await other.goto(url('feature.html'), { waitUntil: 'networkidle' });
await other.fill('[data-key="p3_base"]', 'OTHER-TAB-BASE');
await other.waitForTimeout(900);
await page.waitForTimeout(500);
check('(1) another tab’s answer reaches an open guide', await page.inputValue('#guide [data-key="p3_base"]'), 'OTHER-TAB-BASE');
await other.close();

/* ---- (2) SHORT project through the build ------------------------------- */
await seed('short', 'Proof Short', SKEY, { meta_title: 'Tiny', b1_setup: 'KEEP-SHORT', _sceneMap: [{ slug: 'A', who: '', what: '', beat: '', pages: '' }] });
await page.goto(url('shoot.html'), { waitUntil: 'networkidle' });
await guideReady();
await settle();
check('(2) short: the guide reads the short blueprint (step 09 only)', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .step')].map((s) => s.getAttribute('data-sg-id'))), ['step-09']);
check('(2) short: no feature cover fields', (await guideFields()).some((f) => /^p3_/.test(f)), false);
await page.fill('#guide [data-key="p_days"]', '3 days');
await settle();
b = await blob(SKEY);
check('(2) short: the guide wrote p_days to the short blob', b.p_days, '3 days');
check('(2) short: the arrays and fields beside it are intact', [b.meta_title, b.b1_setup, b._sceneMap.length], ['Tiny', 'KEEP-SHORT', 1]);
check('(2) short: the feature blob was not touched', await page.evaluate((k) => localStorage.getItem(k), FKEY), null);
await page.goto(url('short.html'), { waitUntil: 'networkidle' });
check('(2) short.html shows the guide’s answer', await page.inputValue('[data-key="p_days"]'), '3 days');
await page.fill('[data-key="p_crew"]', 'SHORT-CREW');
await page.waitForTimeout(900);
await page.goto(url('edit.html'), { waitUntil: 'networkidle' });
await guideReady();
check('(2) short: edit.html’s guide is step 10', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .step')].map((s) => s.getAttribute('data-sg-id'))), ['step-10']);
await page.goto(url('shoot.html'), { waitUntil: 'networkidle' });
await guideReady();
check('(2) short.html’s answer shows in the guide', await page.inputValue('#guide [data-key="p_crew"]'), 'SHORT-CREW');

/* ---- (3) the source, every stage, on the dev server ---------------------- */
const vite = await createServer({ configFile: path.resolve('vite.config.js'), server: { port: DEV_PORT, strictPort: true }, logLevel: 'error' });
await vite.listen();
const dev = (p) => `http://localhost:${DEV_PORT}/${p}`;
const mount = (stage) => page.evaluate(async (st) => {
  document.querySelectorAll('#guide').forEach((n) => n.remove());
  const m = await import('/src/ui/stage-guide.js');
  m.mountStageGuide(document.querySelector('main') || document.body, { stage: st });
  await new Promise((r) => setTimeout(r, 0));
  document.getElementById('guide').scrollIntoView();
}, stage);
const stageIds = () => page.evaluate(() => [...document.querySelectorAll('#guide .step')].map((s) => s.getAttribute('data-sg-id')));

async function devSeed(format, key, data) {
  await page.goto(dev('index.html'), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StudioStore, null, { timeout: 20000 });
  await page.evaluate(({ format, key, data }) => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Dev ' + format, format });
    S.setCurrentProject(p.id);
    localStorage.setItem(key, JSON.stringify(data));
  }, { format, key, data });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.StudioStore, null, { timeout: 20000 });
}

const sceneMap = [
  { slug: 'INT. FLAT - DAY', who: 'Ravi, Maya', what: 'He waits.', beat: 'Setup', pages: '0.5' },
  { slug: 'EXT. ROAD - NIGHT', who: 'Ravi', what: 'He leaves "now" & <goes>.', beat: 'Turn', pages: '1' }
];
const script = [
  { slug: 'INT. FLAT - DAY', action: 'Ravi waits.', dialogues: [{ character: 'RAVI', parenthetical: 'quietly', line: 'Hello.' }, { character: 'MAYA', parenthetical: '', line: 'You came.' }] },
  { slug: 'EXT. ROAD - NIGHT', action: 'Rain.', dialogues: [] }
];
await devSeed('short', SKEY, { meta_title: 'Tiny', meta_runtime: '2 min', _sceneMap: sceneMap, _script: script, b1_setup: 'BEAT-ONE' });
await mount('screenplay');
await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
await settle();
check('(3) short screenplay: steps 06, 07, 08, 11', await stageIds(), ['step-06', 'step-07', 'step-08', 'step-11']);
const afterMount = await blob(SKEY);
check('(3) mounting wrote nothing (scene map and script untouched)', [afterMount._sceneMap, afterMount._script], [sceneMap, script]);
check('(3) the scene map shows the saved rows', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .sg-scenemap tbody tr')].map((tr) => tr.querySelector('[data-field="slug"]').value)),
['INT. FLAT - DAY', 'EXT. ROAD - NIGHT']);
check('(3) the script shows its scenes and dialogues', await page.evaluate(() =>
  [...document.querySelectorAll('#guide .scene-block')].map((b) => b.querySelectorAll('.dialogue-block').length)), [2, 0]);
check('(3) the page counter was drawn', await page.evaluate(() => document.querySelector('#guide [data-sg-id="totalWords"]').textContent !== '0'), true);

/* edit one scene-map cell: the array is written whole, same shape */
await page.fill('#guide .sg-scenemap tbody tr:first-child [data-field="what"]', 'He waits, then leaves.');
await settle();
b = await blob(SKEY);
const expectMap = sceneMap.map((r, i) => (i === 0 ? { ...r, what: 'He waits, then leaves.' } : r));
check('(3) _sceneMap is byte-identical in shape after an edit', JSON.stringify(b._sceneMap), JSON.stringify(expectMap));
check('(3) _script and the fields were not touched by it', [JSON.stringify(b._script), b.b1_setup, b.meta_title], [JSON.stringify(script), 'BEAT-ONE', 'Tiny']);
/* edit the script */
await page.fill('#guide .scene-block:first-child .dialogue-block:first-child textarea.line', 'Hello again.');
await settle();
b = await blob(SKEY);
const expectScript = JSON.parse(JSON.stringify(script)); expectScript[0].dialogues[0].line = 'Hello again.';
check('(3) _script keeps short.js’s shape after an edit', JSON.stringify(b._script), JSON.stringify(expectScript));
/* add a scene-map row, then type in it */
await page.click('#guide [data-sg="map-add"][data-n="1"]');
await settle();
check('(3) adding a blank row alone writes nothing', JSON.stringify((await blob(SKEY))._sceneMap), JSON.stringify(expectMap));
await page.fill('#guide .sg-scenemap tbody tr:last-child [data-field="slug"]', 'INT. NEW - DAY');
await settle();
b = await blob(SKEY);
check('(3) typing in the new row saves the whole array', [b._sceneMap.length, b._sceneMap[2]], [3, { slug: 'INT. NEW - DAY', who: '', what: '', beat: '', pages: '' }]);
/* …and short.js reads it back */
await page.goto(dev('short.html'), { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sceneMapBody tr', { timeout: 20000 });
check('(3) short.html reads the guide’s scene map back', await page.evaluate(() =>
  [...document.querySelectorAll('#sceneMapBody tr')].map((tr) => tr.querySelector('[data-field="slug"]').value)),
['INT. FLAT - DAY', 'EXT. ROAD - NIGHT', 'INT. NEW - DAY']);

/* the old flat scene-map keys: the guide refuses to overwrite them */
await devSeed('short', SKEY, { sm_1_slug: 'OLD', sm_1_who: 'x' });
await mount('screenplay');
await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
check('(3) a flat-key scene map is not editable in the guide', await page.evaluate(() =>
  document.querySelector('#guide .sg-scenemap table').hidden), true);

/* feature: every stage mounts and the derived views draw */
await devSeed('feature', FKEY, { s4_name: 'Kavin', s5_name: 'Rana', b01: 'open', b02: 'theme', v2s11_atl: '10L', v2s11_btl: '20L', lad_1_logline: 'LOGLINE-KEEP' });
/* steps plus the interludes the blueprint carries (the ladder, write-the-draft) */
const want = { story: 11, screenplay: 4, preprod: 11, production: 4, post: 4 };
for (const [stage, n] of Object.entries(want)) {
  await mount(stage);
  await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
  const ids = await stageIds();
  check(`(3) feature ${stage}: ${n} steps drawn`, ids.length, n);
}
await mount('story');
await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
check('(3) feature story: the treatment ladder follows step 02', (await page.evaluate(() =>
  [...document.querySelectorAll('#guide .sg-steps > section')].map((s) => s.getAttribute('data-sg-id')))).slice(0, 3),
['step-01', 'step-02', 'treatment-ladder']);
check('(3) the ladder shows the saved rung', await page.inputValue('#guide [data-key="lad_1_logline"]'), 'LOGLINE-KEEP');
check('(3) the pacing chart counts filled beats', await page.evaluate(() => document.querySelector('#guide [data-sg-id="pacingFilled"]').textContent), '2');
check('(3) the character map names the protagonist', await page.evaluate(() => document.querySelector('#guide [data-sg-id="charMapSvg"]').textContent.includes('Kavin')), true);
check('(3) the story guide wrote nothing', Object.keys(await blob(FKEY)).sort(), ['b01', 'b02', 's4_name', 's5_name', 'v2s11_atl', 'v2s11_btl', 'lad_1_logline'].sort());
await mount('preprod');
await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
check('(3) the budget total is derived from the fields', await page.evaluate(() =>
  /3|30/.test(document.querySelector('#guide [data-sg-id="budgetTotal"]').textContent)), true);
check('(3) the shot, cast and location tables each show rows', await page.evaluate(() =>
  ['shotListBody', 'castListBody', 'locListBody']
    .map((id) => document.querySelectorAll(`#guide [data-sg-id="${id}"] tr`).length >= 3)), [true, true, true]);
await page.fill('#guide [data-sg-id="shotListBody"] tr:nth-child(2) [data-key$="_desc"]', 'WIDE');
await settle();
b = await blob(FKEY);
check('(3) a table row writes its flat key', b.shot_2_desc, 'WIDE');

await mount('screenplay');
await page.waitForSelector('#guide .sg-steps', { timeout: 20000 });
check('(3) the scene-list table shows rows', await page.evaluate(() =>
  document.querySelectorAll('#guide [data-sg-id="sceneListBody"] tr').length >= 3), true);
check('no page errors', errors, []);
await vite.close();
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
