/* ============================================================
   PROOF: the Story page's two paths, in a browser (dist/)
   ------------------------------------------------------------
   A feature project and a short project on story.html:

     - each has its OWN path (src/data/story-paths.json), every step
       on the page at once — no tab, no drop-down, no favourite-film
       picker, no Format select;
     - no blueprint question is asked twice: every data-key appears once;
     - the format is not chosen first: the outline says which beat sheet
       it is using until Scene order is picked;
     - an answer to a blueprint question asked inline lands in the
       blueprint's own blob, and ticks its path step;
     - the lock step works and survives a reload (and Unlock clears it);
     - old links (#path-4, #path-7, ?step=feature/step-07#guide) land on
       the step that asks that question now.

       npm run build:open && node scripts/prove-story-path.mjs
       (PW_CHROMIUM=<path> picks a Chromium other than Playwright's own)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve('dist');
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
const blob = (key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || '{}'), key);
const story = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}'));
/* ONE STEP AT A TIME: only the current step is shown, so a proof that types
   into a step opens it first (the address bar is how a link does it). */
const step = async (id) => { await page.evaluate((i) => { location.hash = '#path-' + i; }, id); await page.waitForTimeout(500); };
const settle = () => page.waitForTimeout(900);

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
  await page.waitForSelector('[data-bp="structure"] .sg-steps', { timeout: 20000, state: 'attached' });
  await page.waitForTimeout(400);
}
const pathIds = () => page.evaluate(() => [...document.querySelectorAll('main > section.st-step')].map((s) => s.getAttribute('data-path')));
const dupKeys = () => page.evaluate(() => {
  const k = [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key'));
  return k.filter((x, i) => k.indexOf(x) !== i);
});
const inView = (id) => page.evaluate((i) => {
  const r = document.getElementById('path-' + i).getBoundingClientRect();
  return r.top < window.innerHeight && r.bottom > 0;
}, id);

/* ---- the feature road ------------------------------------------------- */
await project('feature', 'Proof Feature');
await open();
check('feature: its own path, every step on the page', await pathIds(),
  ['idea', 'logline', 'bible', 'structure', 'outline', 'setups', 'timeline', 'synopsis', 'lock', 'screenplay']);
check('feature: the menu lists the same ten', await page.evaluate(() => [...document.querySelectorAll('#main > nav.tabs .tabs-tab[data-path]')].map((b) => b.getAttribute('data-path'))),
  ['idea', 'logline', 'bible', 'structure', 'outline', 'setups', 'timeline', 'synopsis', 'lock', 'screenplay']);
/* Beats & pacing, Pitch deck and the Cover sheet are the menu's Tools
   group (the shared section menu, since 13 Oct 2026): no done state and no
   data-path (the row's id is the panel's element id), so they are the rows
   without data-path. */
check('feature: …then the three Tools rows, in order', await page.evaluate(() => [...document.querySelectorAll('#main > nav.tabs .tabs-tab:not([data-path])')].map((b) => b.getAttribute('data-tab'))),
  ['pacing', 'pitch', 'guide']);
/* A path group carries its done count beside its name (14 Oct 2026 parity
   pass: "Idea · 0/2"); Tools has no steps, so no count. */
check('feature: the groups are Idea, Build, Write up, Tools', await page.evaluate(() => [...document.querySelectorAll('#main > nav.tabs .tabs-group-h')].map((e) => e.textContent.replace(/ · \d+\/\d+$/, ''))),
  ['Idea', 'Build', 'Write up', 'Tools']);
check('feature: each path group says how many of its steps are done', await page.evaluate(() => [...document.querySelectorAll('#main > nav.tabs .tabs-group-h')].map((e) => / · \d+\/\d+$/.test(e.textContent))),
  [true, true, true, false]);
check('feature: the open row carries the step number the blueprint drawer reads', await page.evaluate(() => { const r = document.querySelector('#main > nav.tabs [aria-selected="true"]'); return [r && r.dataset.step, r && r.dataset.path]; }), ['1', 'idea']);
/* the path is the menu now, and nothing else on the page is a tab */
check('feature: no other tab and no Format drop-down', await page.evaluate(() => [document.querySelectorAll('[role="tab"]:not(.tabs-tab)').length, !!document.getElementById('stFw')]), [0, false]);
check('feature: no favourite-film picker on the page', await page.evaluate(() => document.querySelectorAll('.fav-picker, .fav-switch, .st-fav').length), 0);
check('feature: Beats & pacing and the Pitch deck are plain sections, then the Guide', await page.evaluate(() =>
  [...document.querySelectorAll('main > section')].map((s) => s.id).filter((i) => ['pacing', 'pitch', 'guide'].includes(i))), ['pacing', 'pitch', 'guide']);
check('feature: no Idea Vault on this page', await page.evaluate(() => [!!document.getElementById('vault'), document.querySelectorAll('.st-vault').length]), [false, 0]);
check('feature: no data-key appears twice', await dupKeys(), []);
check('feature: the format is not chosen first — the outline says what it is using', await page.evaluate(() =>
  document.querySelector('#path-outline .st-using').textContent.replace(/\s+/g, ' ').trim().startsWith('Using Save the Cat! until you choose a scene order')), true);

/* the idea step asks the blueprint's questions inline and writes the blueprint's own key */
await step('idea');
await page.fill('#stIdea', 'A dragon who is afraid of fire.');
await page.fill('#path-idea [data-key="s1_whatif"]', 'WHATIF-ONCE');
await settle();
check('feature: the blueprint answer typed in the Idea step is in the blueprint blob', (await blob(FKEY)).s1_whatif, 'WHATIF-ONCE');
check('feature: …and nowhere in the story model', (await story()).s1_whatif, undefined);
await page.click('#path-idea .stp-nav .btn.primary');   // NEXT
check('feature: Next goes to the following step (the Logline) and lands on it', [await page.evaluate(() => location.hash), await inView('logline')], ['#path-logline', true]);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-bp="idea"] .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: the idea survives a reload', await page.inputValue('#stIdea'), 'A dragon who is afraid of fire.');
check('feature: …and so does the blueprint answer', await page.inputValue('#path-idea [data-key="s1_whatif"]'), 'WHATIF-ONCE');
check('feature: the Idea step is ticked', await page.evaluate(() => !!document.querySelector('.tabs-tab[data-path="idea"] .tabs-done')), true);

/* a Bible card writes the blueprint's key too, once */
await step('bible');
await page.fill('.sb [data-key="s3_theme"]', 'THEME-ONCE');
await settle();
check('feature: a Story Bible answer is stored under the blueprint’s key', (await blob(FKEY)).s3_theme, 'THEME-ONCE');

/* choosing the scene order in Scene order, and only there */
await step('structure');
await page.click('.st-fw[data-fw="three_act"]');
await page.waitForTimeout(300);
check('feature: picking a scene order stores the choice', [(await story()).framework, (await story()).frameworkChosen], ['three_act', true]);
check('feature: the "Using … until you choose" line is gone', await page.evaluate(() => document.querySelectorAll('.st-using').length), 0);

/* the outline, the lock */
await step('outline');
await page.click('#path-outline [data-st="step-add"]');
await page.waitForTimeout(300);
await page.fill('#path-outline .st-ol-text', 'A dragon hatches.');
await page.waitForTimeout(900);
await step('lock');
await page.click('#path-lock [data-st="lock"]');
await page.waitForTimeout(400);
let st = await story();
check('feature: Lock stores an ISO time in outlineLockedAt', /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(st.outlineLockedAt), true);
check('feature: a locked outline is read-only and offers no editing', await page.evaluate(() => [
  document.querySelector('#path-outline .st-ol-text').hasAttribute('readonly'),
  document.querySelectorAll('#path-outline [data-st="step-add"], #path-outline [data-st="step-del"]').length
]), [true, 0]);
check('feature: the Lock step shows it, and the path step is done', await page.evaluate(() => [
  document.querySelector('#path-lock .st-coverage').textContent.startsWith('Locked'),
  !!document.querySelector('.tabs-tab[data-path="lock"] .tabs-done')]), [true, true]);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-bp="structure"] .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: the lock survives a reload', (await story()).outlineLockedAt, st.outlineLockedAt);
check('feature: …and the page still shows it locked', await page.evaluate(() => !!document.querySelector('#path-lock [data-st="unlock"]')), true);
await step('lock');
await page.click('#path-lock [data-st="unlock"]');
await page.waitForTimeout(400);
check('feature: Unlock clears it', (await story()).outlineLockedAt, '');
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('[data-bp="structure"] .sg-steps', { timeout: 15000, state: 'attached' });
check('feature: …and it stays cleared after a reload', await page.evaluate(() => [!!document.querySelector('#path-lock [data-st="lock"]'), document.querySelector('#path-outline .st-ol-text').hasAttribute('readonly')]), [true, false]);

/* old links */
await open('#path-4');
check('#path-4 (the old outline number) lands on the Step outline', await inView('outline'), true);
await open('#path-nope');
check('an unknown #path-… lands on the first step', await inView('idea'), true);
await open('#pitch');
check('#pitch is a plain section and the page lands on it', await page.evaluate(() => { const r = document.getElementById('pitch').getBoundingClientRect(); return r.top < window.innerHeight && r.bottom > 0; }), true);
await open('#guide', '?step=feature/step-07');
check('an old ?step=feature/step-07#guide link lands on the Story Bible', [await page.evaluate(() => location.hash), await inView('bible')], ['#path-bible', true]);
check('the favourite film is a Settings link under an example, not a switcher', await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 3500));
  const a = document.querySelector('.st-example-from a');
  return a ? a.getAttribute('href') : 'none yet';
}), 'settings.html#favourite');

/* ---- the short road --------------------------------------------------- */
await project('short', 'Proof Short');
await open();
check('short: its own path', await pathIds(), ['idea', 'logline', 'character', 'world', 'conflict', 'structure', 'outline', 'synopsis', 'lock', 'screenplay']);
check('short: none of the feature’s steps', await page.evaluate(() => ['bible', 'setups', 'timeline'].some((i) => !!document.getElementById('path-' + i))), false);
check('short: the first step is the Seed', await page.evaluate(() => document.querySelector('.tabs-tab[data-path="idea"] .tabs-tab-l').textContent), 'Seed');
check('short: no data-key appears twice', await dupKeys(), []);
check('short: no feature-only card, no feature-only key', await page.evaluate(() => {
  const k = [...document.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key'));
  return [[...document.querySelectorAll('[data-sb-card]')].map((c) => c.getAttribute('data-sb-card')),
    k.filter((x) => /^(s4_(name|age|want|need|lie|wound|skill|flaw|arc)|s5_name|s5_want|s6_|s7_|s3_(ext|int|theme|phil)|lad_|comment_for_)/.test(x))];
}), [['characters', 'world', 'conflict'], []]);
check('short: the outline defaults to the Short Five until a scene order is chosen', await page.evaluate(() =>
  document.querySelector('#path-outline .st-using').textContent.includes('Short Film Five-Beat')), true);
await step('idea');
await page.fill('#path-idea [data-key="s1_seed"]', 'SEED-ONCE');
await settle();
check('short: a Seed answer is stored in the SHORT blueprint blob', [(await blob(SKEY)).s1_seed, await page.evaluate((k) => localStorage.getItem(k), FKEY)], ['SEED-ONCE', null]);
await open('#path-7');
check('short: #path-7 (the Bible) lands on Character', await inView('character'), true);
/* a feature answer that already exists on a short project is shown, not hidden */
await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ s3_theme: 'OLD-THEME' })), FKEY);
await open();
check('short: a feature-only card appears once its feature key holds an answer', await page.evaluate(() =>
  [[...document.querySelectorAll('[data-sb-card]')].map((c) => c.getAttribute('data-sb-card')), document.querySelector('.sb [data-key="s3_theme"]') ? document.querySelector('.sb [data-key="s3_theme"]').value : null]),
[['characters', 'world', 'conflict', 'theme'], 'OLD-THEME']);

/* the owner's rule: one step at a time, and scrolling never runs into the next */
await project('feature', 'Proof Stepper');
await open('#path-idea');
const shown = () => page.evaluate(() => [...document.querySelectorAll('main > section')].filter((s) => !s.hidden).map((s) => s.id));
check('one step shown at a time', await shown(), ['path-idea']);
check('every data-key stays in the DOM while hidden', await page.evaluate(() => document.querySelectorAll('section[hidden] [data-key]').length > 0), true);
await page.evaluate(() => { for (let i = 0; i < 20; i++) window.scrollBy(0, 3000); });
await page.waitForTimeout(300);
check('scrolling to the end of a step reveals no other step', await shown(), ['path-idea']);
await page.click('#path-idea .stp-nav .btn.primary');
check('Next shows the next step only and lands at its top', [await shown(), await inView('logline')], [['path-logline'], true]);
await page.click('#path-logline .stp-nav .btn:not(.primary)');
check('Back returns', [await shown(), await page.evaluate(() => location.hash)], [['path-idea'], '#path-idea']);
await open('#pitch');
check('#pitch opens the Pitch deck step alone', await shown(), ['pitch']);
await open('#logline');
check('#logline opens the Logline step', await shown(), ['path-logline']);

check('no page errors', errors, []);
await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
