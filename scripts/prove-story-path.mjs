/* ============================================================
   PROOF: the Story page's four steps, in a browser (dist/)
   ------------------------------------------------------------
   A feature project and a short project on story.html (four steps for
   both since 19 Oct 2026: Idea · Characters & world · Beat Sheet ·
   Synopsis):

     - each has its path (src/data/story-paths.json), every step on the
       page at once, one shown — no tab, no drop-down, no favourite-film
       picker, no Format select;
     - no blueprint question is asked twice: every data-key appears once;
     - the format is not chosen first: the Beat Sheet says which beat
       sheet it is using until one is picked in its picker;
     - an answer to a blueprint question asked inline lands in the
       blueprint's own blob, and ticks its path step;
     - the lock is a toggle on the Beat Sheet and survives a reload (and
       Unlock clears it); Send to screenplay sits beside it;
     - old links (#path-2 … #path-13, #path-lock, #path-setups, #logline,
       #pacing, ?step=feature/step-07#guide) land on the step that holds
       that question now, and on the spot inside it;
     - the cover sheet's keys are edited on the dashboard's Title page
       through the blueprint's merge-write.

       npm run build:open && node scripts/prove-story-path.mjs
       (PW_CHROMIUM=<path> picks a Chromium other than Playwright's own;
        PROVE_PORT picks the port, default 5381)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');   // like the other proofs: CI points it at dist-verify
const PORT = Number(process.env.PROVE_PORT) || 5381;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
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
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const FKEY = 'fms_filmmaker_combined_v1';
const SKEY = 'fms_shortfilm_blueprint_v1';
const FOUR = ['idea', 'bible', 'outline', 'synopsis'];
const blob = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
const story = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}'));
/* ONE STEP AT A TIME: only the current step is shown, so a proof that types
   into a step opens it first (the address bar is how a link does it). */
const step = async (id) => { await page.evaluate((i) => { location.hash = '#path-' + i; }, id); await page.waitForTimeout(500); };
const settle = () => page.waitForTimeout(900);
/* the closed boxes (blueprint questions, More craft) hold real fields: open them to type */
const openBoxes = (sel) => page.evaluate((s) => document.querySelectorAll(s + ' details').forEach((d) => { d.open = true; }), sel);

async function project(format, title) {
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(({ format, title }) => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title, format });
    S.setCurrentProject(p.id);
    S.notify('projects:changed', { reason: 'test' });
  }, { format, title });
}
async function open(hash = '', search = '') {
  await page.goto(url('story.html' + search + hash), { waitUntil: 'networkidle' });
  await page.waitForSelector('main > section.st-step', { timeout: 15000, state: 'attached' });
  await page.waitForSelector('#path-outline .st-bp .sg-steps', { timeout: 20000, state: 'attached' });
  await page.waitForTimeout(600);
}
const pathIds = () => page.evaluate(() => [...document.querySelectorAll('main > section.st-step')].map((s) => s.getAttribute('data-path')));
const dupKeys = () => page.evaluate(() => {
  const k = [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key'));
  return k.filter((x, i) => k.indexOf(x) !== i);
});
const inViewEl = (id) => page.evaluate((i) => {
  const el = document.getElementById(i);
  if (!el) return 'missing';
  const r = el.getBoundingClientRect();
  return r.height > 0 && r.top < window.innerHeight && r.bottom > 0;
}, id);
const inView = (id) => inViewEl('path-' + id);
const shown = () => page.evaluate(() => [...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id));

/* ---- the feature road ------------------------------------------------- */
await project('feature', 'Proof Feature');
await open();
check('feature: four steps, every one on the page', await pathIds(), FOUR);
check('feature: the menu lists the same four', await page.evaluate(() => [...document.querySelectorAll('#main nav.tabs[data-sm-self] .tabs-tab[data-path]')].map((b) => b.getAttribute('data-path'))), FOUR);
check('feature: the menu labels', await page.evaluate(() => [...document.querySelectorAll('#main nav.tabs[data-sm-self] .tabs-tab[data-path] .tabs-tab-l')].map((b) => b.textContent)),
  ['Idea', 'Characters & world', 'Beat Sheet', 'Synopsis']);
/* The Pitch deck is off for everybody, so the Tools group is gone; Beats &
   pacing is inside the Synopsis step and the Cover sheet is the dashboard's
   Title page, so neither is a menu row any more. */
check('feature: no Tools rows (Pitch deck off; pacing and the cover sheet are not rows)', await page.evaluate(() => [...document.querySelectorAll('#main nav.tabs[data-sm-self] .tabs-tab:not([data-path])')].map((b) => b.getAttribute('data-tab'))), []);
check('feature: on a blank story the start cards lead and the menu waits', await page.evaluate(() => [!!document.querySelector('.st-modes'), document.querySelector('#main nav.tabs[data-sm-self]').hidden]), [true, true]);
check('feature: the open row carries the step number the blueprint drawer reads', await page.evaluate(() => { const r = document.querySelector('#main nav.tabs[data-sm-self] [aria-selected="true"]'); return [r && r.dataset.step, r && r.dataset.path]; }), ['4', 'outline']);   // the page opens on the Beat Sheet (currentStep defaults to outline)
check('feature: no other tab and no Format drop-down', await page.evaluate(() => [document.querySelectorAll('[role="tab"]:not(.tabs-tab)').length, !!document.getElementById('stFw')]), [0, false]);
check('feature: no favourite-film picker on the page', await page.evaluate(() => document.querySelectorAll('.fav-picker, .fav-switch, .st-fav').length), 0);
check('feature: after the path, the Pitch deck section and the hidden Guide; Beats & pacing is inside the Synopsis', await page.evaluate(() =>
  [[...document.querySelectorAll('main > section')].map((s) => s.id).filter((i) => ['pacing', 'pitch', 'guide'].includes(i)), !!document.querySelector('#path-synopsis #pacing'), !!document.querySelector('#path-synopsis #ai-map')]),
[['pitch', 'guide'], true, true]);
check('feature: the Beat Sheet holds the picker, the lock, the send, the Unassigned bin and the More craft boxes', await page.evaluate(() =>
  ['st-fw-pick', 'stLockRow', 'stHandoff', 'st-more-beats', 'st-more-setups', 'st-more-timeline', 'st-more-free'].map((i) => !!document.querySelector('#path-outline #' + i)).concat(!!document.querySelector('#path-outline .st-unplaced'))),
[true, true, true, true, true, true, true, true]);
check('feature: the More craft boxes start closed', await page.evaluate(() => ['st-fw-pick', 'st-more-setups', 'st-more-timeline', 'st-more-free'].map((i) => document.getElementById(i).open)), [false, false, false, false]);
check('feature: no Idea Vault on this page', await page.evaluate(() => [!!document.getElementById('vault'), document.querySelectorAll('.st-vault').length]), [false, 0]);
check('feature: no data-key appears twice', await dupKeys(), []);
check('feature: the format is not chosen first — the Beat Sheet says what it is using', await page.evaluate(() =>
  document.querySelector('#path-outline .st-using').textContent.replace(/\s+/g, ' ').trim().startsWith('Using Save the Cat! until you choose a beat sheet')), true);

/* the idea step asks the blueprint's questions inline and writes the blueprint's own key */
await step('idea');
check('feature: the menu is a visible strip above the steps, not behind a disclosure', await page.evaluate(() => {
  const n = document.querySelector('#main nav.tabs[data-sm-self]');
  return [!!n && !n.hidden && n.getBoundingClientRect().height > 0, !!n && !n.closest('details'), document.querySelectorAll('.st-views, details.st-notes').length];
}), [true, true, 0]);
await openBoxes('#path-idea');
/* QA r3: pencils name their field; a stat card makes no claim about an empty story;
   stand-alone links are real targets. */
check('feature: every note pencil names its own field', await page.evaluate(() => {
  const l = [...document.querySelectorAll('#path-idea .comment-btn, #path-bible .comment-btn')].map((b) => b.getAttribute('aria-label'));
  return [l.length > 1, new Set(l).size === l.length, l.every((x) => /^Add a private note on: \S/.test(x))];
}), [true, true, true]);
check('feature: peak tension is a dash until a beat is tagged', await page.evaluate(() => {
  const c = [...document.querySelectorAll('.st-stats .k-stat')].find((e) => /Peak tension/.test(e.textContent));
  return c ? c.querySelector('.k-stat-value').textContent : 'missing';
}), '—');
check('feature: a stand-alone .st-link is at least 24px high', await page.evaluate(() =>
  [...document.querySelectorAll('.st-link')].filter((e) => !e.closest('p') && e.offsetHeight).every((e) => e.getBoundingClientRect().height >= 24)), true);
await page.fill('#stIdea', 'A dragon who is afraid of fire.');
await page.fill('#path-idea [data-key="s1_whatif"]', 'WHATIF-ONCE');
await page.fill('#stLogline', 'A dragon must light the beacon.');
await settle();
check('feature: the blueprint answer typed in the Idea step is in the blueprint blob', (await blob(FKEY)).s1_whatif, 'WHATIF-ONCE');
check('feature: …and nowhere in the story model', (await story()).s1_whatif, undefined);
check('feature: the logline is in the same step', (await story()).logline, 'A dragon must light the beacon.');
await page.click('#path-idea .stp-nav .btn.primary');   // NEXT
check('feature: Next goes to the following step (Characters & world) and lands on it', [await page.evaluate(() => location.hash), await inView('bible')], ['#path-bible', true]);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-bp="idea:step-01"] .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: the idea survives a reload', await page.inputValue('#stIdea'), 'A dragon who is afraid of fire.');
check('feature: …and so does the blueprint answer', await page.inputValue('#path-idea [data-key="s1_whatif"]'), 'WHATIF-ONCE');
check('feature: the Idea step is ticked', await page.evaluate(() => !!document.querySelector('.tabs-tab[data-path="idea"] .tabs-done')), true);

/* a Bible card writes the blueprint's key too, once */
await step('bible');
await page.fill('.sb [data-key="s3_theme"]', 'THEME-ONCE');
await settle();
await page.click('[data-sb="add-char"]');
await page.waitForTimeout(300);
check('feature: Add with no name says what to do', await page.evaluate(() => /name first/.test((document.querySelector('.toast-host') || {}).textContent || '')), true);
check('feature: a Characters & world answer is stored under the blueprint’s key', (await blob(FKEY)).s3_theme, 'THEME-ONCE');

/* choosing the beat sheet in the Beat Sheet's own picker */
await step('outline');
await page.click('#path-outline #st-fw-pick > summary');
await page.waitForTimeout(300);
check('feature: "Choose one" opens the picker', await page.evaluate(() => document.getElementById('st-fw-pick').open), true);
await page.click('.st-fw[data-fw="three_act"]');
await page.waitForTimeout(300);
check('feature: picking a beat sheet stores the choice', [(await story()).framework, (await story()).frameworkChosen], ['three_act', true]);
check('feature: the "Using … until you choose" line is gone, and the picker folds away', await page.evaluate(() => [document.querySelectorAll('.st-using').length, document.getElementById('st-fw-pick').open]), [0, false]);
check('feature: a beat sheet chosen with no step yet shows the Beat Sheet as started', await page.evaluate(() => [!!document.querySelector('.tabs-tab[data-path="outline"] .tabs-done'), !!document.querySelector('.tabs-tab[data-path="outline"] .tabs-doing')]), [false, true]);

/* the outline, the lock toggle */
await page.click('#path-outline [data-st="step-add"]');
await page.waitForTimeout(300);
await page.fill('#path-outline .st-ol-text', 'A dragon hatches.');
await page.waitForTimeout(900);
await page.click('#stLockRow [data-st="lock"]');
await page.waitForTimeout(400);
let st = await story();
check('feature: the Lock toggle stores an ISO time in outlineLockedAt', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(st.outlineLockedAt), true);
check('feature: a locked outline is read-only and offers no editing', await page.evaluate(() => [
  document.querySelector('#path-outline .st-ol-text').hasAttribute('readonly'),
  document.querySelectorAll('#path-outline [data-st="step-add"], #path-outline [data-st="step-del"]').length
]), [true, 0]);
check('feature: the toggle shows it pressed, and the Beat Sheet is done', await page.evaluate(() => [
  document.querySelector('#stLockRow [data-st="unlock"]').getAttribute('aria-pressed'),
  !!document.querySelector('.tabs-tab[data-path="outline"] .tabs-done')]), ['true', true]);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#path-outline .st-bp .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: the lock survives a reload', (await story()).outlineLockedAt, st.outlineLockedAt);
check('feature: …and the page still shows it locked', await page.evaluate(() => !!document.querySelector('#stLockRow [data-st="unlock"]')), true);
await step('outline');
await page.click('#stLockRow [data-st="unlock"]');
await page.waitForTimeout(400);
check('feature: pressing it again unlocks', (await story()).outlineLockedAt, '');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#path-outline .st-bp .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: …and it stays cleared after a reload', await page.evaluate(() => [!!document.querySelector('#stLockRow [data-st="lock"]'), document.querySelector('#path-outline .st-ol-text').hasAttribute('readonly')]), [true, false]);

/* Send to screenplay, with Undo, from the Beat Sheet's head */
await step('outline');
await page.click('#stHandoff [data-st="send"]');
await page.waitForTimeout(500);
const sentId = (await story()).outline[0].sceneId;
check('feature: Send creates a scene for the written step and links it', [!!sentId, await page.evaluate((id) => (JSON.parse(localStorage.getItem('fms_scenes_v1') || '[]').scenes || JSON.parse(localStorage.getItem('fms_scenes_v1') || '[]')).some((x) => x.id === id), sentId)], [true, true]);
await page.click('#stHandoff [data-st="send-undo"]');
await page.waitForTimeout(400);
check('feature: Undo the send unlinks it', (await story()).outline[0].sceneId, undefined);
await step('synopsis');
check('feature: the last step hands over to the next stage, the Screenplay Writer', await page.evaluate(() => { const a = document.querySelector('#path-synopsis .stp-nav .st-next-stage'); return a && a.getAttribute('href'); }), 'screenplay.html');

/* old links land on their new home — and on the spot inside it */
await open('#path-4');
check('#path-4 (the old outline number) lands on the Beat Sheet', await inView('outline'), true);
await open('#path-6');
check('#path-6 (the old Screenplay step) lands on the Beat Sheet’s Send, and the address bar names the step', [await shown(), await inViewEl('stHandoff'), await page.evaluate(() => location.hash)], [['path-outline'], true, '#path-outline']);
await open('#path-lock');
check('#path-lock lands on the lock toggle', [await shown(), await inViewEl('stLockRow')], [['path-outline'], true]);
await open('#path-setups');
check('#path-setups opens the Setups & payoffs box in the Beat Sheet', [await shown(), await page.evaluate(() => document.getElementById('st-more-setups').open), await inViewEl('st-more-setups')], [['path-outline'], true, true]);
await open('#path-9');
check('#path-9 (Timeline) opens the Timeline box', [await shown(), await page.evaluate(() => document.getElementById('st-more-timeline').open)], [['path-outline'], true]);
await open('#path-structure');
check('#path-structure opens the beat sheet picker', [await shown(), await page.evaluate(() => document.getElementById('st-fw-pick').open)], [['path-outline'], true]);
await open('#path-2');
check('#path-2 (the old Logline step) lands on the logline in the Idea step', [await shown(), await inViewEl('logline')], [['path-idea'], true]);
await open('#path-conflict');
check('#path-conflict lands on Characters & world', await shown(), ['path-bible']);
await open('#pacing');
check('#pacing opens the Synopsis step on its beats and pacing', [await shown(), await inViewEl('pacing')], [['path-synopsis'], true]);
await open('#path-nope');
check('an unknown #path-… lands on the first step', await inView('idea'), true);
await open('#pitch');
/* The pitch deck is off for everybody (features['pitch-deck']): the section
   stays in the DOM, hidden, and a link to it lands nowhere. */
check('#pitch is off for everybody: kept in the DOM, hidden, not shown', await page.evaluate(() => { const p = document.getElementById('pitch'); return [!!p, p && p.hidden]; }), [true, true]);
await open('#guide');
check('#guide (a navigation target) still opens the cover sheet, though it is no menu row', [await shown(), await page.evaluate(() => !!document.querySelector('#main nav.tabs[data-sm-self] [data-tab="guide"]'))], [['guide'], false]);
await open('#guide', '?step=feature/step-07');
check('an old ?step=feature/step-07#guide link lands on Characters & world', [await page.evaluate(() => location.hash), await inView('bible')], ['#path-bible', true]);
check('the favourite film is a Settings link under an example, not a switcher', await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const a = document.querySelector('.st-example-from a');
  return a ? a.getAttribute('href') : 'none yet';
}), 'settings.html#favourite');

/* the cover sheet: the dashboard's Title page, through the same keys */
await page.goto(url('dashboard.html'), { waitUntil: 'networkidle' });
await page.waitForSelector('#title-page [data-key="meta_title"]', { timeout: 15000 });
await page.fill('#title-page [data-key="meta_title"]', 'DRAGON TITLE');
await page.selectOption('#title-page [data-key="v1_genre"]', 'Fantasy');
await settle();
const fb = await blob(FKEY);
check('dashboard: the Title page writes the blueprint’s own cover keys', [fb.meta_title, fb.v1_genre], ['DRAGON TITLE', 'Fantasy']);
check('dashboard: …by merge, every other answer kept', [fb.s1_whatif, fb.s3_theme], ['WHATIF-ONCE', 'THEME-ONCE']);
check('dashboard: each cover key is on the page once', await dupKeys(), []);
await open();
check('story: the cover sheet stays hidden here, holding the same answer', await page.evaluate(() => {
  const g = document.getElementById('guide');
  const f = g && g.querySelector('[data-key="meta_title"]');
  return [!!g && g.hidden, f ? f.value : null];
}), [true, 'DRAGON TITLE']);

/* ---- the short road --------------------------------------------------- */
await project('short', 'Proof Short');
await open();
check('short: the same four steps', await pathIds(), FOUR);
check('short: none of the feature’s More craft boxes', await page.evaluate(() => ['st-more-setups', 'st-more-timeline', 'st-more-free'].some((i) => !!document.getElementById(i))), false);
check('short: the first step is the Idea', await page.evaluate(() => document.querySelector('.tabs-tab[data-path="idea"] .tabs-tab-l').textContent), 'Idea');
check('short: no data-key appears twice', await dupKeys(), []);
check('short: Characters & world shows its three cards, and no feature-only key', await page.evaluate(() => {
  const k = [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key'));
  return [[...document.querySelectorAll('[data-sb-card]')].map((c) => c.getAttribute('data-sb-card')),
    k.filter((x) => /^(s4_(name|age|want|need|lie|wound|skill|flaw|arc)|s5_name|s5_want|s6_|s7_|s3_(ext|int|theme|phil)|lad_|comment_for_)/.test(x))];
}), [['characters', 'world', 'conflict'], []]);
check('short: the Beat Sheet is the Short Five', await page.evaluate(() =>
  document.querySelector('#path-outline .st-using').textContent.includes('Short Film Five-Beat')), true);
/* Owner, 23 Oct 2026: a short film keeps to the short-film flow — the
   five beats only, no picker, no Save the Cat!, no feature sample. */
check('short: no beat sheet picker, and the five beats only', await page.evaluate(() =>
  [!!document.getElementById('st-fw-pick'), [...document.querySelectorAll('#path-outline [data-beat-card]')].map((c) => c.getAttribute('data-beat-card'))]),
[false, ['short_five:setup', 'short_five:disturbance', 'short_five:escalation', 'short_five:turn', 'short_five:image']]);
check('short: no sample offered, and no Save the Cat! on the page', await page.evaluate(() =>
  [document.querySelectorAll('[data-st="sample"]').length, /Save the Cat/.test(document.querySelector('main').textContent)]), [0, false]);
await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ b4_turn: 'TURN-ONCE' })), SKEY);
await open('#path-outline');
check('short: the blueprint’s own beat answer shows beside its beat', await page.evaluate(() => {
  const c = document.querySelector('#path-outline [data-beat-card="short_five:turn"] .st-ol-bp');
  return c ? c.textContent.includes('TURN-ONCE') : null;
}), true);
await page.evaluate((k) => localStorage.removeItem(k), SKEY);
await open();
await step('idea');
await openBoxes('#path-idea');
await page.fill('#path-idea [data-key="s1_seed"]', 'SEED-ONCE');
await settle();
check('short: a seed answer is stored in the SHORT blueprint blob', [(await blob(SKEY)).s1_seed, await page.evaluate((k) => localStorage.getItem(k), FKEY)], ['SEED-ONCE', null]);
for (const n of ['7', '11', '12', '13']) {
  await open('#path-' + n);
  check(`short: #path-${n} (the Bible, Character, World, Conflict) lands on Characters & world`, await inView('bible'), true);
}
/* a feature answer that already exists on a short project is shown, not hidden */
await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ s3_theme: 'OLD-THEME' })), FKEY);
await open();
check('short: a feature-only card appears once its feature key holds an answer', await page.evaluate(() =>
  [[...document.querySelectorAll('[data-sb-card]')].map((c) => c.getAttribute('data-sb-card')), document.querySelector('.sb [data-key="s3_theme"]') ? document.querySelector('.sb [data-key="s3_theme"]').value : null]),
[['characters', 'world', 'conflict', 'theme'], 'OLD-THEME']);

/* the owner's rule: one step at a time, and scrolling never runs into the next */
await project('feature', 'Proof Stepper');
await open('#path-idea');
check('one step shown at a time', await shown(), ['path-idea']);
check('every data-key stays in the DOM while hidden', await page.evaluate(() => document.querySelectorAll('section[hidden] [data-key]').length > 0), true);
await page.evaluate(() => { for (let i = 0; i < 20; i++) window.scrollBy(0, 3000); });
await page.waitForTimeout(300);
check('scrolling to the end of a step reveals no other step', await shown(), ['path-idea']);
await page.click('#path-idea .stp-nav .btn.primary');
check('Next shows the next step only and lands at its top', [await shown(), await inView('bible')], [['path-bible'], true]);
await page.click('#path-bible .stp-nav .btn:not(.primary)');
check('Back returns', [await shown(), await page.evaluate(() => location.hash)], [['path-idea'], '#path-idea']);
await page.click('#main nav.tabs[data-sm-self] .tabs-tab[data-path="synopsis"]');
await page.waitForTimeout(300);
check('any step opens from the menu, in any order', await shown(), ['path-synopsis']);
await open('#pitch');
check('#pitch (off for everybody) opens no Pitch deck step', (await shown()).includes('pitch'), false);
await open('#logline');
check('#logline opens the Idea step on its logline', [await shown(), await inViewEl('logline')], [['path-idea'], true]);

/* ---- QA round 2 (Story & writing): data kept, focus kept --------------- */
const act = () => page.evaluate(() => { const a = document.activeElement; return a ? a.tagName + (a.getAttribute('data-st') ? '[' + a.getAttribute('data-st') + ']' : '') + (a.getAttribute('data-st-field') ? '{' + a.getAttribute('data-st-field') + '}' : '') : 'none'; });
const toasts = () => page.evaluate(() => [...document.querySelectorAll('.toast')].map((t) => t.querySelector('.toast-msg').textContent));
const chars = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_characters_v1') || '[]'));
await project('feature', 'Proof QA r2');
await open('#path-bible');
await page.fill('[data-sb-slot="protagonist"] [data-sb-key="s4_name"]', 'Ravi');
await page.fill('[data-sb-slot="protagonist"] [data-sb-key="s4_want"]', 'To swim the strait');
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
check('bible: the add-role buttons are kit buttons in sentence case', await page.evaluate(() =>
  [...document.querySelectorAll('[data-sb="add-role"], [data-sb="add-char"]')].map((b) => [b.classList.contains('k-btn'), b.textContent])),
  [[true, 'Add the protagonist'], [true, 'Add the antagonist'], [true, 'Add']]);
await page.click('[data-sb="add-role"][data-role="protagonist"]');
await page.waitForTimeout(400);
check('bible: "Add the protagonist" after answering the slot keeps the answers in the blueprint', await blob(FKEY).then((b) => [b.s4_name, b.s4_want]), ['Ravi', 'To swim the strait']);
check('bible: …and makes ONE protagonist, the slot’s person (no empty card beside a role-less RAVI)', await page.evaluate(() =>
  [...document.querySelectorAll('.sb-chars details.sb-char:not(.is-slot)')].map((d) => [d.querySelector('.sb-char-name').textContent, (d.querySelector('.sb-char-role') || {}).textContent || ''])), [['Ravi', 'Protagonist']]);
await page.fill('[data-sb-newname]', 'Meera');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('bible: adding a character from the keyboard puts the focus on its card', await page.evaluate(() =>
  !!(document.activeElement.closest('details.sb-char') && document.activeElement.getAttribute('data-ch-field') === 'name')), true);
await page.fill('[data-sb-newname]', 'Meera');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('bible: a second character of the same name is added and said', [(await chars()).filter((c) => c.name === 'MEERA').length, (await toasts()).some((t) => /already a MEERA/.test(t))], [2, true]);

/* Tab out of an edited field reaches the next control. */
await open('#path-idea');
await page.click('#stIdea');
await page.keyboard.type('Hello there');
await page.waitForTimeout(900);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
check('story: Tab out of an edited Idea goes on to the next control, not <body>', (await act()) !== 'BODY', true);

/* Beat Sheet: the beat select, Add a step, the lock and the picker keep the keyboard. */
await open('#path-outline');
await page.click('[data-st="step-add"][data-beat="save_the_cat:opening_image"]');
await page.waitForTimeout(300);
await page.keyboard.type('A first step');
await page.click('[data-st="step-add"][data-beat="save_the_cat:opening_image"]');
await page.waitForTimeout(300);
await page.keyboard.type('A second step');
await page.waitForTimeout(800);
const sid = (await story()).outline[0].id;
await page.focus(`select[data-st-field="step-beat"][data-step="${sid}"]`);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(400);
check('beat sheet: moving a step to another beat from the keyboard keeps the focus on its select', await page.evaluate((id) =>
  document.activeElement.matches(`select[data-st-field="step-beat"][data-step="${id}"]`), sid), true);
await page.focus('#stLockRow [data-st="lock"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('beat sheet: Lock from the keyboard leaves the focus on the (now Locked) button', await act(), 'BUTTON[unlock]');
await page.focus('#stLockRow [data-st="unlock"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.evaluate(() => { document.getElementById('st-fw-pick').open = true; });
await page.waitForTimeout(300);
await page.focus('[data-st="pick-fw"][data-fw="three_act"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('beat sheet: picking a beat sheet from the keyboard leaves the focus on the picker', await page.evaluate(() => document.activeElement.matches('#st-fw-pick > summary')), true);
await page.click('#st-fw-pick > summary');
await page.waitForTimeout(200);
await page.click('[data-st="pick-fw"][data-fw="save_the_cat"]');
await page.waitForTimeout(400);
check('beat sheet: the empty Unassigned box has no "Save the Cat!."', await page.evaluate(() => {
  const t = document.querySelector('.st-unplaced') ? document.querySelector('.st-unplaced').textContent : '';
  return [/Cat!\./.test(t), /one of the Save the Cat! beats/.test(t)];
}), [false, true]);
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('[data-st="step-add"][data-beat="save_the_cat:midpoint"]').scrollIntoViewIfNeeded();
await page.waitForTimeout(400);
await page.click('[data-st="step-add"][data-beat="save_the_cat:midpoint"]');
await page.waitForTimeout(1500);
check('beat sheet: Add a step leaves the new step’s box focused AND on screen', await page.evaluate(() => {
  const a = document.activeElement; const r = a.getBoundingClientRect();
  return [a.getAttribute('data-st-field'), r.top >= 0 && r.bottom <= innerHeight];
}), ['step-text', true]);

/* Synopsis: an import while a keystroke is pending asks first; build-undo takes its toast down. */
await open('#path-synopsis');
await page.click('#stSource');
await page.keyboard.type('My own draft words');
await page.setInputFiles('.st-bar .st-import input[type=file]', { name: 'syn.txt', mimeType: 'text/plain', buffer: Buffer.from('A swimmer crosses the strait at night and finds her brother on the far shore.') });
await page.waitForTimeout(500);
check('synopsis: importing while typing asks before replacing what was typed', await page.evaluate(() => !!document.querySelector('.dlg.k-modal')), true);
await page.click('.dlg.k-modal .k-modal-actions .mbtn:not(.primary)');
await page.waitForTimeout(1200);
check('synopsis: …and "Cancel" keeps the typed draft, no "Imported" toast', [(await story()).source, (await toasts()).some((t) => /Imported/.test(t))], ['My own draft words', false]);
await page.focus('[data-st="mode"][data-mode="tag"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('synopsis: the Write/Tag mode button keeps the focus', await act(), 'BUTTON[mode]');
await page.click('[data-st="build"]');
await page.waitForTimeout(300);
await page.click('.dlg.k-modal .k-modal-actions .mbtn.primary');
await page.waitForTimeout(500);
check('synopsis: Build shows its UNDO toast', (await toasts()).some((t) => /built from the outline/.test(t)), true);
await page.click('[data-st="build-undo"]');
await page.waitForTimeout(300);
if (await page.evaluate(() => !!document.querySelector('.dlg.k-modal'))) { await page.click('.dlg.k-modal .k-modal-actions .mbtn.primary'); await page.waitForTimeout(300); }
await page.waitForTimeout(400);
check('synopsis: "Undo the build" takes the build’s toast down (its UNDO would do nothing)', (await toasts()).some((t) => /built from the outline/.test(t)), false);

/* The tension curve's last dot keeps its label inside the chart, at 390. */
await project('feature', 'Proof Curve');
await open();
await page.click('[data-st="sample"]');
await page.waitForTimeout(1500);
await page.setViewportSize({ width: 390, height: 844 });
await step('synopsis');
const tipFits = await page.evaluate(() => {
  const dots = [...document.querySelectorAll('#path-synopsis .pc-dot')];
  if (!dots.length) return 'no dots';
  const last = dots[dots.length - 1], first = dots[0];
  last.focus();
  const t = last.querySelector('.pc-dot-tip').getBoundingClientRect(), f = first.querySelector('.pc-dot-tip').getBoundingClientRect();
  return [t.right <= innerWidth, f.left >= 0];
});
await page.setViewportSize({ width: 1280, height: 900 });
check('pacing: the edge dots’ labels stay inside the window at 390px', tipFits, [true, true]);

/* Dashboard Title page: the twin title follows the whole title, PROJECT TITLE is the name. */
await project('feature', 'QA empty');
await page.goto(url('dashboard.html'), { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('title page: PROJECT TITLE shows the project’s name', await page.inputValue('#tp_meta_title'), 'QA empty');
await page.fill('#tp_meta_title', '');
await page.click('#tp_meta_title');
await page.keyboard.type('The Kettle');
await page.waitForTimeout(300);
check('title page: typing the Title fills Working title with the WHOLE title', [await page.inputValue('#tp_v1_title'), (await blob(FKEY)).v1_title], ['The Kettle', 'The Kettle']);
await page.keyboard.press('Tab');
await page.waitForTimeout(500);
check('title page: leaving PROJECT TITLE renames the project, and Tab reaches the next field', await page.evaluate(() =>
  [window.StudioStore.currentProject().title, document.activeElement.tagName !== 'BODY']), ['The Kettle', true]);
await page.focus('[data-action="tp-region"][data-region="IN"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('title page: the region button keeps the focus after the press', await page.evaluate(() =>
  document.activeElement.matches('[data-action="tp-region"][data-region="IN"]')), true);

/* Round 4 fixes */
/* a blank Project title is refused: the field goes back to the name */
await page.fill('#tp_meta_title', '');
await page.press('#tp_meta_title', 'Tab');
await page.waitForTimeout(500);
check('title page: a blanked PROJECT TITLE is put back at once, and stored so', [await page.inputValue('#tp_meta_title'), (await blob(FKEY)).meta_title], ['The Kettle', 'The Kettle']);
check('title page: the Stage field has no placeholder repeating its hint', (await page.getAttribute('#tp_meta_stage', 'placeholder')) || '', '');

await project('feature', 'QA r4');
await open('#path-bible');
check('story: the strip says no characters before one is added', await page.evaluate(() => /add them in the Story Bible/.test(document.querySelector('.st-stats').textContent)), true);
await page.fill('#sb-newname', 'Maya');
await page.click('[data-sb="add-char"]');
await page.waitForTimeout(900);
check('story: adding a character updates the strip without a reload', await page.evaluate(() => /1\s*in the Story Bible/.test(document.querySelector('.st-stats').textContent.replace(/\s+/g, ' '))), true);

await step('outline');
check('beat sheet: one bar while no beat sheet is chosen, offering Choose one', await page.evaluate(() => [
  !!document.querySelector('#path-outline .st-fw-pick .st-using'), document.querySelectorAll('#path-outline .st-using').length,
  document.querySelector('#path-outline .st-fw-change').textContent]), [true, 1, 'Choose one']);
check('beat sheet: every beat’s Add a step names its beat', await page.evaluate(() => {
  const n = [...document.querySelectorAll('#path-outline [data-st="step-add"]')].map((b) => b.getAttribute('aria-label'));
  return [n.length > 1, new Set(n).size === n.length, n.every((x) => /^Add a step to \S/.test(x))];
}), [true, true, true]);
await step('synopsis');
check('synopsis: every Tension field has its own accessible name', await page.evaluate(() => {
  const n = [...document.querySelectorAll('#path-synopsis .st-beat-tlabel')].map((l) => l.getAttribute('aria-label'));
  return [n.length > 1, new Set(n).size === n.length];
}), [true, true]);

/* 'Use this as my logline' over a written logline: replaced, with Undo */
await step('idea');
await openBoxes('#path-idea');
await page.fill('#stLogline', 'First logline.');
await page.waitForTimeout(500);
await page.fill('[data-key="lad_1_logline"]', 'Rough draft.');
await page.waitForTimeout(500);
await page.click('[data-st="use-lad1"]');
await page.waitForTimeout(600);
check('idea: the earlier-version button replaces a written logline', (await story()).logline, 'Rough draft.');
await page.click('.toast button:has-text("UNDO")').catch(() => {});
await page.waitForTimeout(600);
check('idea: …and the toast Undo puts the written logline back', (await story()).logline, 'First logline.');

check('no page errors', errors, []);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
