/* ============================================================
   BEAT COLOURS AND BEAT <-> SCENE SYNC — end to end in Chromium
   ------------------------------------------------------------
   (owner, 24 Oct 2026) A Beat Sheet step sent to the Screenplay and
   its scene stay in step both ways: a step edit reaches the scene's
   synopsis, a scene edit reaches the step; when both changed, each
   page offers the other's text and Undo puts BOTH back. A step's
   colour shows on the step and on its scene (table and index cards),
   and stays on a locked outline. An old pair (the 280-character cut)
   gives its scene the full text, so a later scene edit never shrinks
   the step; a binned scene says so; a field left focused across a tab
   switch is redrawn, never saved stale; a locked outline is never
   rewritten and still shows a differing scene; a freshly loaded sample
   offers no conflict; a phone has no sideways scroll.

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

/* ---- the old pair: the scene gets the full text, once ---------------- */
const NLONG = LONG.replace(/\s+/g, ' ');
await go('breakdown.html#scenes');
check('old cut: the scene now holds the step’s whole text', (await scene('sc2')).synopsis, NLONG);
check('old cut: the step keeps its whole text and gains the baseline', [(await step('s2')).text === LONG, (await step('s2')).synced === NLONG], [true, true]);
await page.click('#scene-sc2 [data-action="sl-toggle"]');
await page.fill('#scene-sc2 textarea[data-scene-field="synopsis"]', 'The big ' + NLONG.slice(4));
await page.waitForTimeout(1000);
check('old cut: a later scene edit keeps the whole step (nothing cut away)', (await step('s2')).text, 'The big ' + NLONG.slice(4));
await go('story.html#path-outline');
check('old cut: no choice is offered on the old pair', await page.evaluate(() => !!document.querySelector('[data-step-row="s2"] .ss-note')), false);
const settled = await raw();
await go('story.html#path-outline');
check('old cut: a second visit writes nothing', JSON.stringify(await raw()) === JSON.stringify(settled), true);

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

/* ---- "Restore it" for the binned scene: ITS scene comes back --------- */
check('bin: the binned scene’s button says it restores', await page.evaluate(() => document.querySelector('[data-step-row="s3"] [data-ss="resend"]').textContent.trim()), 'Restore it');
await page.click('[data-step-row="s3"] [data-ss="resend"]');
await page.waitForTimeout(400);
const s3 = await step('s3');
const binLeft = () => page.evaluate(() => (JSON.parse(localStorage.getItem('fms_scene_bin_v1') || '{}').entries || []).length);
check('resend: the binned scene itself is back, still linked (no second scene)', [s3.sceneId, (await scene('sc3') || {}).synopsis, (await scenes()).length, await binLeft()], ['sc3', 'Ravi fights back.', 3, 0]);

/* ---- a step edited while its scene is in the bin, then Restore -------- */
const binSc1 = async (stepText) => {
  await go('index.html');
  await page.evaluate((t) => {
    const s = JSON.parse(localStorage.getItem('fms_story_v1'));
    Object.assign(s.outline.find((x) => x.id === 's1'), { text: t, synced: 'One.' });
    delete s.outline.find((x) => x.id === 's1').syncedWas;
    localStorage.setItem('fms_story_v1', JSON.stringify(s));
    const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
    const i = d.scenes.findIndex((x) => x.id === 'sc1');
    const row = { ...d.scenes[i], synopsis: 'One.' };
    d.scenes.splice(i, 1);
    localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
    localStorage.setItem('fms_scene_bin_v1', JSON.stringify({ entries: [{
      id: 'binS1', binnedAt: new Date().toISOString(), reason: 'hand', heading: '',
      scene: { index: i, row }, shots: [], frames: [], blocks: [], sheets: [], edit: null
    }] }));
  }, stepText);
};
await binSc1('One, edited while binned.');
await go('breakdown.html#scenes');
await page.evaluate(() => document.querySelector('[data-bin="binS1"] [data-action="bin-restore"]').click());
await page.waitForTimeout(500);
await page.click('#scene-sc1 [data-action="sl-toggle"]');
check('restore: the scene takes the step’s newer text at once (row and field)', [
  (await scene('sc1')).synopsis,
  await page.inputValue('#scene-sc1 textarea[data-scene-field="synopsis"]')
], ['One, edited while binned.', 'One, edited while binned.']);
/* …and the bin's UNDO toast does the same */
await page.click('#scene-sc1 [data-action="scene-del"]');
await page.waitForTimeout(400);
await page.evaluate(() => {   // the step edited elsewhere while the scene is in the bin
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  s.outline.find((x) => x.id === 's1').text = 'One, edited during the undo window.';
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
});
await undo();
check('undo bin: the scene back from the bin takes the step’s newer text at once', (await scene('sc1') || {}).synopsis, 'One, edited during the undo window.');

/* ---- a field left focused across a tab switch ------------------------- */
await go('index.html');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  Object.assign(s.outline.find((x) => x.id === 's1'), { text: 'Original line.', synced: 'Original line.' });
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
  const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  d.scenes.find((x) => x.id === 'sc1').synopsis = 'Original line.';
  localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
});
const tabB = await ctx.newPage();
tabB.on('pageerror', (e) => errors.push(e.message));
const setHidden = (pg, hidden) => pg.evaluate((hd) => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (hd ? 'hidden' : 'visible') });
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hd });
  document.dispatchEvent(new Event('visibilitychange'));
}, hidden);
await tabB.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
await tabB.waitForTimeout(700);
await tabB.click('#scene-sc1 [data-action="sl-toggle"]');
await tabB.focus('#scene-sc1 textarea[data-scene-field="synopsis"]');
await setHidden(tabB, true);
await go('story.html#path-outline');
await page.fill('#stStep_s1', 'Original line. The step writer adds a whole new paragraph of beat.');
await page.waitForTimeout(1000);
await setHidden(tabB, false);
await tabB.waitForTimeout(300);
check('tab switch: the focused field shows the other tab’s edit, still focused', await tabB.evaluate(() => {
  const t = document.querySelector('#scene-sc1 textarea[data-scene-field="synopsis"]');
  return [t && t.value, document.activeElement === t];
}), ['Original line. The step writer adds a whole new paragraph of beat.', true]);
await tabB.keyboard.press('End');
await tabB.keyboard.type(' Scene note.');
await tabB.waitForTimeout(1000);
check('tab switch: the next keystroke keeps the other tab’s edit', (await step('s1')).text, 'Original line. The step writer adds a whole new paragraph of beat. Scene note.');
await tabB.close();

/* ---- two windows side by side, BOTH visible (no visibilitychange) ---- */
const seedOne = async () => {
  await go('index.html');
  await page.evaluate(() => {
    const s = JSON.parse(localStorage.getItem('fms_story_v1'));
    const st = s.outline.find((x) => x.id === 's1');
    Object.assign(st, { text: 'One.', synced: 'One.' }); delete st.syncedWas;
    localStorage.setItem('fms_story_v1', JSON.stringify(s));
    const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
    d.scenes.find((x) => x.id === 'sc1').synopsis = 'One.';
    localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
  });
};
{
  await seedOne();
  const winA = await ctx.newPage();
  winA.on('pageerror', (e) => errors.push(e.message));
  await winA.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await winA.waitForTimeout(700);
  await winA.click('#scene-sc1 [data-action="sl-toggle"]');
  await winA.focus('#scene-sc1 textarea[data-scene-field="synopsis"]');
  await go('story.html#path-outline');
  await page.fill('#stStep_s1', 'One. The step writer adds a long new beat in the other window.');
  await page.waitForTimeout(1200);
  check('two windows: the open scene field is redrawn with the step’s edit, still focused', await winA.evaluate(() => {
    const t = document.querySelector('#scene-sc1 textarea[data-scene-field="synopsis"]');
    return [t && t.value, document.activeElement === t, document.visibilityState];
  }), ['One. The step writer adds a long new beat in the other window.', true, 'visible']);
  await winA.keyboard.press('End');
  await winA.keyboard.type(' Scene note.');
  await winA.waitForTimeout(1200);
  check('two windows: the stale field never saves over the step window’s edit', [(await step('s1')).text, (await scene('sc1')).synopsis],
    ['One. The step writer adds a long new beat in the other window. Scene note.', 'One. The step writer adds a long new beat in the other window. Scene note.']);
  await winA.close();
}
{
  await seedOne();
  const winA = await ctx.newPage();
  winA.on('pageerror', (e) => errors.push(e.message));
  await winA.goto(url('story.html#path-outline'), { waitUntil: 'networkidle' });
  await winA.waitForTimeout(700);
  await winA.focus('#stStep_s1');
  await go('breakdown.html#scenes');
  await page.click('#scene-sc1 [data-action="sl-toggle"]');
  await page.fill('#scene-sc1 textarea[data-scene-field="synopsis"]', 'One. Rewritten in the scene window.');
  await page.waitForTimeout(1200);
  check('two windows: the open step field is redrawn with the scene’s edit, still focused', await winA.evaluate(() => {
    const t = document.querySelector('#stStep_s1');
    return [t && t.value, document.activeElement === t];
  }), ['One. Rewritten in the scene window.', true]);
  await winA.keyboard.press('Control+End');   // the end of the text, not of a wrapped line
  await winA.keyboard.type(' More.');
  await winA.waitForTimeout(1200);
  check('two windows: the stale step field never saves over the scene window’s edit', [(await scene('sc1')).synopsis, (await step('s1')).text],
    ['One. Rewritten in the scene window. More.', 'One. Rewritten in the scene window. More.']);
  await winA.close();
}

/* ---- a locked outline: shown, never rewritten ------------------------- */
await go('index.html');
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  s.outlineLockedAt = '2026-10-01T00:00:00.000Z';
  Object.assign(s.outline.find((x) => x.id === 's1'), { text: 'Locked line.', synced: 'Locked line.' });
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
  const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
  d.scenes.find((x) => x.id === 'sc1').synopsis = 'Locked line.';
  localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
});
await go('breakdown.html#scenes');
await page.click('#scene-sc1 [data-action="sl-toggle"]');
await page.fill('#scene-sc1 textarea[data-scene-field="synopsis"]', 'Scene side edit');
await page.waitForTimeout(1000);
check('locked: a scene edit leaves the locked step alone', [(await step('s1')).text, !!(await story()).outlineLockedAt], ['Locked line.', true]);
await go('breakdown.html#scenes');
check('locked: the scene row says it differs, and sends nothing into the step', await page.evaluate(() => {
  const n = document.querySelector('#scene-sc1 .ss-note');
  return n ? [...n.querySelectorAll('button')].map((b) => b.textContent.trim()) : null;
}), ['Use the step’s text']);
await go('story.html#path-outline');
check('locked: the Story row shows the differing scene, offering only "Send mine"', await page.evaluate(() => {
  const n = document.querySelector('[data-step-row="s1"] .ss-note');
  return n ? [n.querySelector('span').textContent, [...n.querySelectorAll('button')].map((b) => b.textContent.trim())] : null;
}), ['The scene’s synopsis differs: “Scene side edit”', ['Send mine to the scene']]);
await page.evaluate(() => {
  const s = JSON.parse(localStorage.getItem('fms_story_v1'));
  s.outlineLockedAt = '';
  localStorage.setItem('fms_story_v1', JSON.stringify(s));
});

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

/* ---- a freshly loaded sample: no conflict on either page -------------- */
{
  const c2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p2 = await c2.newPage();
  p2.on('pageerror', (e) => errors.push(e.message));
  await p2.goto(url('index.html'), { waitUntil: 'networkidle' });
  await p2.waitForTimeout(700);
  await p2.click('[data-action="sample-project"]');
  await p2.waitForTimeout(1500);
  const notes = [];
  for (const pg of ['story.html#path-outline', 'breakdown.html#scenes']) {
    await p2.goto(url(pg), { waitUntil: 'networkidle' });
    await p2.waitForTimeout(800);
    notes.push(await p2.evaluate(() => [document.querySelectorAll('[data-step-row], .bd-sl').length > 0, document.querySelectorAll('.ss-note').length]));
  }
  check('sample: steps and scenes drawn, and no conflict box on either page', notes, [[true, 0], [true, 0]]);
  await c2.close();
}

/* ---- a short film whose stored beat sheet is still Save the Cat! -----
   (docs/KNOWN-ISSUES.md: a short that chose another sheet before 23 Oct
   keeps it stored until the Story page next saves). The board shows the
   five beats, and a scene moved there keeps its step inside them. */
{
  const c3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const p3 = await c3.newPage();
  p3.on('pageerror', (e) => errors.push(e.message));
  await p3.goto(url('index.html'), { waitUntil: 'networkidle' });
  await p3.waitForTimeout(700);
  await p3.click('[data-action="sample-project"]');
  await p3.waitForTimeout(1500);
  const sc0 = await p3.evaluate(() => {
    const all = JSON.parse(localStorage.getItem('fms_studio_projects_v1'));
    for (const p of (Array.isArray(all) ? all : (all.projects || []))) p.format = 'short';
    localStorage.setItem('fms_studio_projects_v1', JSON.stringify(all));
    const s = JSON.parse(localStorage.getItem('fms_story_v1'));
    const d = JSON.parse(localStorage.getItem('fms_scenes_v1'));
    s.framework = 'save_the_cat'; s.frameworkChosen = true;
    for (const o of s.outline) delete o.sceneId;
    s.outline.unshift({ id: 'q1', beat: 'short_five:setup', text: 'Short setup step.', sceneId: d.scenes[0].id, synced: 'Short setup step.', syncedBeat: 'short_five:setup', u: 1 });
    d.scenes[0].synopsis = 'Short setup step.'; d.scenes[0].beatId = 'short_five:setup';
    localStorage.setItem('fms_story_v1', JSON.stringify(s));
    localStorage.setItem('fms_scenes_v1', JSON.stringify(d));
    return d.scenes[0].id;
  });
  await p3.goto(url('breakdown.html#script'), { waitUntil: 'networkidle' });
  const pick = `[data-bb-scene="${sc0}"] select[data-bb-field="beat"]`;
  await p3.waitForSelector(pick, { state: 'attached', timeout: 10000 }).catch(() => {});
  const opts = await p3.evaluate((sel) => [...document.querySelectorAll(sel + ' option')].map((o) => o.value).filter(Boolean), pick);
  check('short film: the board offers only the five beats', [opts.length, opts.every((v) => v.startsWith('short_five:'))], [5, true]);
  await p3.evaluate((sel) => { const x = document.querySelector(sel); if (!x) return; x.value = 'short_five:turn'; x.dispatchEvent(new Event('change', { bubbles: true })); }, pick);
  await p3.waitForTimeout(600);
  check('short film: a scene moved on the board takes its step to that beat, inside the five', await p3.evaluate((id) => [
    JSON.parse(localStorage.getItem('fms_scenes_v1')).scenes.find((x) => x.id === id).beatId,
    JSON.parse(localStorage.getItem('fms_story_v1')).outline.find((x) => x.id === 'q1').beat
  ], sc0), ['short_five:turn', 'short_five:turn']);
  await c3.close();
}

/* ---- the beat-note line follows a note written in another window ------- */
{
  const setNote = (v) => page.evaluate((t) => {
    const b = JSON.parse(localStorage.getItem('fms_filmmaker_combined_v1') || '{}');
    b.b04 = t;
    localStorage.setItem('fms_filmmaker_combined_v1', JSON.stringify(b));
  }, v);
  const shown = (pg) => pg.evaluate(() => {
    const n = document.querySelector('[data-beat-card="save_the_cat:catalyst"] > .st-ol-bp');
    return n ? n.textContent : null;
  });
  await go('index.html');
  await setNote('');
  const winA = await ctx.newPage();
  winA.on('pageerror', (e) => errors.push(e.message));
  await winA.goto(url('story.html#path-outline'), { waitUntil: 'networkidle' });
  await winA.waitForTimeout(700);
  check('beat note: none yet', await shown(winA), null);
  await go('index.html');
  await setNote('A letter arrives.');
  await winA.waitForTimeout(600);
  check('beat note: a note written in another window shows without a reload', await shown(winA), 'Your beat note: \u201cA letter arrives.\u201d');
  await winA.focus('#stStep_s1');
  await setNote('The letter is a summons.');
  await winA.waitForTimeout(600);
  check('beat note: not redrawn while the focus is inside its card', [await shown(winA), await winA.evaluate(() => document.activeElement && document.activeElement.id)],
    ['Your beat note: \u201cA letter arrives.\u201d', 'stStep_s1']);
  await winA.evaluate(() => document.activeElement.blur());
  await winA.waitForTimeout(400);
  check('beat note: redrawn when the focus leaves the card', await shown(winA), 'Your beat note: \u201cThe letter is a summons.\u201d');
  await winA.close();
}

check('no page errors', errors, []);
console.log(failed ? `✗ beat-sync proof: ${passed} passed, ${failed} failed` : `✓ beat-sync proof: ${passed} passed, 0 failed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
