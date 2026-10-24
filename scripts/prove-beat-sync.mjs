/* ============================================================
   BEAT COLOURS AND BEAT <-> SCENE SYNC — end to end in Chromium
   ------------------------------------------------------------
   (owner, 24 Oct 2026) A Beat Sheet step sent to the Screenplay and
   its scene stay in step both ways: a step edit reaches the scene's
   synopsis, a scene edit reaches the step; when both changed, each
   page offers the other's text and Undo puts BOTH back. A step's
   colour shows on the step and on its scene (table and index cards),
   and stays on a locked outline. An old pair (the 280-character cut)
   is adopted without rewriting either side; a binned scene says so;
   a phone has no sideways scroll.

       npm run build:open && npm run prove:beat-sync
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5384;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r) => server.listen(PORT, r));

let failed = 0, passed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) passed++; else failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
const url = (p) => `http://localhost:${PORT}/${p}`;
const story = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}'));
const scenes = () => page.evaluate(() => (JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes || []));
const step = async (id) => (await story()).outline.find((x) => x.id === id);
const scene = async (id) => (await scenes()).find((x) => x.id === id);
const raw = () => page.evaluate(() => [localStorage.getItem('fms_story_v1'), localStorage.getItem('fms_scenes_v1')]);
const go = async (p) => { await page.goto(url(p), { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };
const undo = async () => { await page.click('.toast-host button:has-text("Undo"), .toast-host button:has-text("UNDO")'); await page.waitForTimeout(400); };

const LONG = ('The chain store opens across the road and its prices undercut every shelf Ravi has stocked for thirty years; '
  + 'his customers drift away one by one, his son wants to sell, and the landlord calls twice a week. ').repeat(2).trim();
const CUT = LONG.slice(0, 277).trimEnd() + '…';
const K = (b) => 'save_the_cat:' + b;

await go('index.html');
await page.evaluate(({ LONG, CUT, K1, K2, K3 }) => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Beat Sync Proof', format: 'feature' });
  S.setCurrentProject(p.id);
  S.notify('projects:changed', { reason: 'test' });
  localStorage.setItem('fms_story_v1', JSON.stringify({
    v: 1, source: '', framework: 'save_the_cat', frameworkChosen: true, marks: [], tension: {},
    outline: [
      { id: 's1', beat: K1, text: 'The chain arrives in town.', sceneId: 'sc1', synced: 'The chain arrives in town.', syncedBeat: K1, u: 1 },
      { id: 's2', beat: K2, text: LONG, sceneId: 'sc2', u: 1 },          // an old pair: no baseline, the 280 cut
      { id: 's3', beat: K3, text: 'Ravi fights back.', sceneId: 'sc3', u: 1 }
    ]
  }));
  localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
    { id: 'sc1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'SHOP', synopsis: 'The chain arrives in town.', beatId: K1, eighths: 8, elements: {} },
    { id: 'sc2', number: '2', intExt: 'EXT', dayNight: 'NIGHT', location: 'ROAD', synopsis: CUT, beatId: K2, eighths: 8, elements: {} }
  ] }));
  localStorage.setItem('fms_scene_bin_v1', JSON.stringify({ entries: [{
    id: 'bin1', binnedAt: new Date().toISOString(), reason: 'hand', heading: '',
    scene: { index: 2, row: { id: 'sc3', number: '3', intExt: 'INT', dayNight: 'DAY', location: 'HALL', synopsis: 'Ravi fights back.', beatId: K3, eighths: 8, elements: {} } },
    shots: [], frames: [], blocks: [], sheets: [], edit: null
  }] }));
}, { LONG, CUT, K1: K('catalyst'), K2: K('midpoint'), K3: K('finale') });

/* ---- the old pair is adopted, and nothing else is written ------------ */
await go('story.html#path-outline');
check('adopt: the old 280-cut scene keeps its synopsis', (await scene('sc2')).synopsis, CUT);
check('adopt: the step keeps its whole text and gains the baseline', [(await step('s2')).text === LONG, (await step('s2')).synced === LONG.replace(/\s+/g, ' ')], [true, true]);
check('adopt: no choice is offered on the old pair', await page.evaluate(() => !!document.querySelector('[data-step-row="s2"] .ss-note')), false);
const settled = await raw();
await go('story.html#path-outline');
check('adopt: a second visit writes nothing', JSON.stringify(await raw()) === JSON.stringify(settled), true);

/* ---- a binned scene -------------------------------------------------- */
check('bin: the step says its scene is in the bin', await page.evaluate(() => {
  const n = document.querySelector('[data-step-row="s3"] .ss-note');
  return n ? [n.querySelector('span').textContent, !!n.querySelector('[data-ss="resend"]')] : null;
}), ['Its scene is in the bin.', true]);

/* ---- a step edit reaches its scene ----------------------------------- */
await page.fill('#stStep_s1', 'The chain arrives in town, with a brass band.');
await page.waitForTimeout(1000);
check('push: the step edit is the scene’s synopsis', (await scene('sc1')).synopsis, 'The chain arrives in town, with a brass band.');

/* ---- a colour on the step -------------------------------------------- */
await page.click('[data-st="step-color"][data-step="s1"][data-color="pink"]');
await page.waitForTimeout(400);
check('colour: stored on the step', (await step('s1')).color, 'pink');
check('colour: shown on the step, the dot pressed', await page.evaluate(() => [
  document.querySelector('[data-step-row="s1"]').getAttribute('data-color'),
  document.querySelector('[data-st="step-color"][data-step="s1"][data-color="pink"]').getAttribute('aria-pressed'),
  getComputedStyle(document.querySelector('[data-step-row="s1"]'), '::before').backgroundColor !== 'rgba(0, 0, 0, 0)'
]), ['pink', 'true', true]);
check('colour: never copied onto the scene', 'color' in (await scene('sc1')), false);

/* ---- locked: the colour stays, the dots go --------------------------- */
await page.click('[data-st="lock"]');
await page.waitForTimeout(400);
check('locked: the colour shows, the dots do not', await page.evaluate(() => [
  document.querySelector('[data-step-row="s1"]').getAttribute('data-color'),
  document.querySelectorAll('[data-st="step-color"]').length
]), ['pink', 0]);
await page.click('#stLockRow [data-st="unlock"]');
await page.waitForTimeout(400);

/* ---- the Scene List: colour, beat, and a scene edit reaching the step - */
await go('breakdown.html#scenes');
check('table: the scene shows its step’s colour and beat', await page.evaluate(() => {
  const r = document.querySelector('#scene-sc1');
  const t = r.querySelector('.bc-beat');
  return [r.getAttribute('data-step-color'), !!t.querySelector('.bc-swatch.bc-pink'), t.textContent];
}), ['pink', true, 'Beat: Catalyst']);
await page.click('.bd-sl-view [data-value="cards"]');
await page.waitForTimeout(400);
check('cards: the index card shows the colour strip and the beat', await page.evaluate(() => {
  const c = document.querySelector('#scene-sc1.bd-card');
  return [c.getAttribute('data-step-color'), c.classList.contains('bc-strip'), getComputedStyle(c, '::before').backgroundColor !== 'rgba(0, 0, 0, 0)', c.querySelector('.bc-beat').textContent];
}), ['pink', true, true, 'Beat: Catalyst']);
await page.click('.bd-sl-view [data-value="table"]');
await page.waitForTimeout(400);
await page.click('#scene-sc1 [data-action="sl-toggle"]');
await page.fill('#scene-sc1 textarea[data-scene-field="synopsis"]', 'The band plays; nobody buys.');
await page.waitForTimeout(1000);
check('pull: the scene edit is the step’s text', (await step('s1')).text, 'The band plays; nobody buys.');
check('pull: the colour stays on the step', (await step('s1')).color, 'pink');

/* ---- both edited: the choice on both pages, Undo restores both ------- */
await go('index.html');   // as if edited elsewhere: no page of ours has the fields open
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  s.outline.find((x) => x.id === 's1').text = 'Mine.';
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
  const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  d.scenes.find((x) => x.id === 'sc1').synopsis = 'Theirs.';
  localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
});
await go('breakdown.html#scenes');
check('conflict: nothing was written over either side', [(await step('s1')).text, (await scene('sc1')).synopsis], ['Mine.', 'Theirs.']);
check('conflict: the scene row offers the step’s text', await page.evaluate(() => {
  const n = document.querySelector('#scene-sc1 .ss-note');
  return n ? [n.querySelector('span').textContent, [...n.querySelectorAll('button')].map((b) => b.textContent.trim())] : null;
}), ['The beat step differs: “Mine.”', ['Use the step’s text', 'Send mine to the step']]);
await page.click('#scene-sc1 [data-ss="use-step"]');
await page.waitForTimeout(400);
check('scene side: "Use the step’s text"', [(await step('s1')).text, (await scene('sc1')).synopsis], ['Mine.', 'Mine.']);
await undo();
check('scene side: Undo restores both', [(await step('s1')).text, (await scene('sc1')).synopsis], ['Mine.', 'Theirs.']);

await go('story.html#path-outline');
check('conflict: the step row offers the scene’s text', await page.evaluate(() => {
  const n = document.querySelector('[data-step-row="s1"] .ss-note');
  return n ? [n.querySelector('span').textContent, [...n.querySelectorAll('button')].map((b) => b.textContent.trim())] : null;
}), ['The scene’s synopsis differs: “Theirs.”', ['Use the scene’s text', 'Send mine to the scene']]);
await page.click('[data-step-row="s1"] [data-ss="use-scene"]');
await page.waitForTimeout(400);
check('step side: "Use the scene’s text"', [(await step('s1')).text, (await scene('sc1')).synopsis, await page.inputValue('#stStep_s1')], ['Theirs.', 'Theirs.', 'Theirs.']);
await undo();
check('step side: Undo restores both', [(await step('s1')).text, (await scene('sc1')).synopsis], ['Mine.', 'Theirs.']);
await page.click('[data-step-row="s1"] [data-ss="use-step"]');
await page.waitForTimeout(400);
check('step side: "Send mine to the scene"', [(await step('s1')).text, (await scene('sc1')).synopsis], ['Mine.', 'Mine.']);
check('settled: no choice left on the row', await page.evaluate(() => !!document.querySelector('[data-step-row="s1"] .ss-note')), false);

/* ---- Send again for the binned scene --------------------------------- */
await page.click('[data-step-row="s3"] [data-ss="resend"]');
await page.waitForTimeout(400);
const s3 = await step('s3');
check('resend: a new scene with the step’s whole text', [s3.sceneId !== 'sc3', (await scene(s3.sceneId) || {}).synopsis], [true, 'Ravi fights back.']);
check('resend: only that step was sent', (await scenes()).length, 3);

/* ---- a phone: no sideways scroll ------------------------------------- */
await page.setViewportSize({ width: 390, height: 844 });
await go('index.html');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  s.outline.find((x) => x.id === 's1').text = 'Phone mine.';
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
  const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  d.scenes.find((x) => x.id === 'sc1').synopsis = 'Phone theirs, a much longer synopsis that has to wrap across the narrow screen without pushing anything sideways.';
  localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
});
await go('story.html#path-outline');
check('phone: the step row with a choice fits', await page.evaluate(() => [!!document.querySelector('[data-step-row="s1"] .ss-note'), document.documentElement.scrollWidth <= innerWidth]), [true, true]);
await go('breakdown.html#scenes');
check('phone: the scene list with a choice fits', await page.evaluate(() => [!!document.querySelector('#scene-sc1 .ss-note'), document.documentElement.scrollWidth <= innerWidth]), [true, true]);

check('no page errors', errors, []);
console.log(failed ? `✗ beat-sync proof: ${passed} passed, ${failed} failed` : `✓ beat-sync proof: ${passed} passed, 0 failed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
