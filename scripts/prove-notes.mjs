/* ============================================================
   STICKY NOTES — end to end in Chromium (owner, 23 Oct 2026)
   ------------------------------------------------------------
   A note written beside the Beat Sheet is the same note on the Scene
   List, in the Screenplay Writer and on the Idea Vault's board; a pin
   shows a chip on its beat or scene; "Add to the scene" writes the
   scene's synopsis and Undo takes it back; the board's order survives
   a reload; the dock fits a phone.

       npm run build:open && npm run prove:notes
       (PROVE_DIST=dist-verify after build:verify, like the others)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5383;
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
const vault = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_idea_vault_v1') || '[]'));
const scenes = () => page.evaluate(() => (JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes || []));
const go = async (p) => { await page.goto(url(p), { waitUntil: 'networkidle' }); await page.waitForTimeout(700); };
const openDock = async () => { await page.click('.nt-open'); await page.waitForSelector('.nt-dock:not([hidden])', { timeout: 8000 }); await page.waitForTimeout(200); };

await go('index.html');
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Notes Proof', format: 'feature' });
  S.setCurrentProject(p.id);
  S.notify('projects:changed', { reason: 'test' });
  localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
    { id: 'sc1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'KITCHEN', synopsis: 'Breakfast.', eighths: 8, elements: {} },
    { id: 'sc2', number: '2', intExt: 'EXT', dayNight: 'NIGHT', location: 'ROOF', synopsis: '', eighths: 8, elements: {} }
  ] }));
});

/* ---- Story: write a note beside the Beat Sheet, pin it to a beat ---- */
await go('story.html#path-outline');
await openDock();
check('story: the dock opens beside the page (main narrows)', await page.evaluate(() =>
  [document.documentElement.classList.contains('nt-dock-open'), parseFloat(getComputedStyle(document.querySelector('main')).marginRight) > 200]), [true, true]);
await page.fill('#ntDockNew', 'The kettle screams at the worst moment');
await page.click('.nt-dock [data-nt="new-color"][data-color="pink"]');
await page.click('.nt-dock [data-nt="add"]');
await page.waitForTimeout(300);
let v = await vault();
check('story: the note is stored in the Idea Vault, pink, unpinned', v.map((x) => [x.kind, x.snippet, x.color, x.beat, x.sceneId]),
  [['note', 'The kettle screams at the worst moment', 'pink', '', '']]);
const id = v[0].id;
await page.selectOption(`.nt-dock [data-nt-field="pin"][data-note="${id}"]`, 'beat:save_the_cat:catalyst');
await page.waitForTimeout(400);
check('story: pinned to the Catalyst beat', (await vault())[0].beat, 'save_the_cat:catalyst');
check('story: a chip shows on that beat card, and only there', await page.evaluate(() =>
  [...document.querySelectorAll('#path-outline [data-beat-card] .nt-chip')].map((c) => c.closest('[data-beat-card]').getAttribute('data-beat-card'))), ['save_the_cat:catalyst']);
await page.fill(`.nt-dock [data-nt-field="text"][data-note="${id}"]`, 'The kettle screams. Twice.');
await page.waitForTimeout(700);
check('story: editing a note saves its text', (await vault())[0].snippet, 'The kettle screams. Twice.');
await page.click(`.nt-dock [data-nt="to-synopsis"][data-note="${id}"]`);
await page.waitForTimeout(400);
check('story: "Add to synopsis" appends the note to the synopsis', await page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1') || '{}').source), 'The kettle screams. Twice.');
await page.keyboard.press('Escape');
await page.waitForTimeout(200);
check('story: Escape puts the dock away', await page.evaluate(() => [document.querySelector('.nt-dock').hidden, document.documentElement.classList.contains('nt-dock-open')]), [true, false]);

/* ---- the Scene List: the same note, pinned to a scene, sent into it -- */
await go('breakdown.html#scenes');
await openDock();
check('scene list: the same note is in the dock', await page.evaluate(() => [...document.querySelectorAll('.nt-dock .nt-card .nt-text')].map((t) => t.value)), ['The kettle screams. Twice.']);
await page.selectOption(`.nt-dock [data-nt-field="pin"][data-note="${id}"]`, 'scene:sc2');
await page.waitForTimeout(400);
check('scene list: pinned to scene 2', [(await vault())[0].sceneId, (await vault())[0].beat], ['sc2', '']);
check('scene list: the chip is on scene 2’s row', await page.evaluate(() =>
  [...document.querySelectorAll('[data-scene] .nt-chip')].map((c) => c.closest('[data-scene]').getAttribute('data-scene'))), ['sc2']);
await page.click(`.nt-dock [data-nt="to-scene"][data-note="${id}"]`);
await page.waitForTimeout(400);
check('scene list: "Add to the scene" writes the scene’s synopsis', (await scenes()).find((s) => s.id === 'sc2').synopsis, 'The kettle screams. Twice.');
await page.click('.toast-host button:has-text("UNDO"), .toast button:has-text("UNDO")');
await page.waitForTimeout(400);
check('scene list: Undo takes it back', (await scenes()).find((s) => s.id === 'sc2').synopsis, '');
await page.keyboard.press('Escape');
await page.click('[data-scene="sc2"] .nt-chip');
await page.waitForSelector('.nt-dock:not([hidden])');
check('scene list: the chip opens the dock on that scene', await page.evaluate(() => document.querySelector('.nt-ctx strong').textContent), '1 pinned to scene 2');
await page.keyboard.press('Escape');

/* ---- the Screenplay Writer: the same notes --------------------------- */
await go('screenplay.html');
check('screenplay: a Notes button with the count', await page.evaluate(() => { const b = document.querySelector('.nt-open'); return b ? b.querySelector('.nt-count').textContent : null; }), '1');
await openDock();
check('screenplay: the same note in the dock', await page.evaluate(() => document.querySelectorAll('.nt-dock .nt-card').length), 1);
await page.keyboard.press('Escape');

/* ---- the board: order, keyboard move, drag, reload ------------------- */
await go('vault.html');
await page.fill('#ntBoardNew', 'Second thought');
await page.click('[data-nt="add"][data-for="ntBoardNew"]');
await page.waitForTimeout(300);
await page.fill('#ntBoardNew', 'Third thought');
await page.click('[data-nt="add"][data-for="ntBoardNew"]');
await page.waitForTimeout(300);
const order = async () => (await vault()).map((x) => x.snippet);
check('board: newest first', await order(), ['Third thought', 'Second thought', 'The kettle screams. Twice.']);
const third = (await vault())[0].id;
await page.focus(`[data-board-item="${third}"] [data-nt="grip"]`);
await page.keyboard.press('ArrowDown');
await page.waitForTimeout(300);
check('board: an arrow key on the grip moves a note one place', await order(), ['Second thought', 'Third thought', 'The kettle screams. Twice.']);
check('board: the focus stays on the moved note’s grip', await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-board-item]') && document.activeElement.closest('[data-board-item]').querySelector('.nt-text').value), 'Third thought');
const kettle = (await vault())[2].id;
const g = await page.locator(`[data-board-item="${kettle}"] [data-nt="grip"]`).boundingBox();
const t = await page.locator('[data-board-item]').first().boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await page.mouse.down();
await page.mouse.move(t.x + 10, t.y + t.height / 2, { steps: 8 });
await page.mouse.up();
await page.waitForTimeout(400);
check('board: dragging a note before another moves it there', await order(), ['The kettle screams. Twice.', 'Second thought', 'Third thought']);
await go('vault.html');
check('board: the order survives a reload', await page.evaluate(() => [...document.querySelectorAll('[data-board-item] .nt-text')].map((x) => x.value)),
  ['The kettle screams. Twice.', 'Second thought', 'Third thought']);
await page.click('[data-action="vault-filter"][data-value="pinned"]');
await page.waitForTimeout(200);
check('board: the Pinned filter', await page.evaluate(() => [...document.querySelectorAll('[data-board-item] .nt-text')].map((x) => x.value)), ['The kettle screams. Twice.']);
await page.click('[data-action="vault-filter"][data-value="all"]');
await page.waitForTimeout(200);
const second = (await vault())[1].id;
await page.click(`[data-board-item="${second}"] [data-nt="del"]`);
await page.waitForTimeout(300);
check('board: delete', (await order()).length, 2);
await page.click('.toast-host button:has-text("UNDO"), .toast button:has-text("UNDO")');
await page.waitForTimeout(300);
check('board: Undo puts it back where it was', await order(), ['The kettle screams. Twice.', 'Second thought', 'Third thought']);

/* ---- a phone: the dock is a sheet that fits -------------------------- */
await page.setViewportSize({ width: 390, height: 844 });
await go('story.html#path-outline');
await openDock();
check('phone: the dock fits the width and nothing scrolls sideways', await page.evaluate(() => {
  const r = document.querySelector('.nt-dock').getBoundingClientRect();
  return [r.left >= 0 && r.right <= innerWidth + 0.5, document.documentElement.scrollWidth <= innerWidth];
}), [true, true]);


/* ---- QA, 26 Oct 2026: the Story & writing findings ------------------ */
const lastUndo = () => page.locator('.toast button:has-text("UNDO")').last();
const active = () => page.evaluate(() => { const a = document.activeElement; return a ? [a.tagName, a.getAttribute('data-nt') || a.getAttribute('data-st') || a.id || '', a.getAttribute('data-color') || ''] : null; });
check('phone: Tab stays inside the notes sheet (it is modal below 1100px)', await (async () => {
  const out = [];
  for (let i = 0; i < 80; i++) { await page.keyboard.press('Tab'); out.push(await page.evaluate(() => !!document.activeElement.closest('.nt-dock'))); }
  return out.every(Boolean);
})(), true);
await page.keyboard.press('Escape');
await page.evaluate(() => { const S = window.StudioStore; localStorage.clear(); const p = S.createProject({ title: 'QA Proof', format: 'feature' }); S.setCurrentProject(p.id); S.notify('projects:changed', { reason: 'test' }); });
await go('story.html#path-synopsis');
check('phone: the synopsis step’s beat deck does not widen the page', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

await page.setViewportSize({ width: 1280, height: 900 });
await go('breakdown.html#scenes');
check('scene list: the Notes button is there before any scene exists', await page.locator('.nt-open').count(), 1);

/* An undo of "Add to synopsis" takes out only what it added. */
await go('story.html#path-outline');
await openDock();
await page.fill('#ntDockNew', 'Note A');
await page.click('.nt-dock [data-nt="add"]');
await page.waitForTimeout(300);
const qa = (await vault())[0].id;
await page.click(`.nt-dock [data-nt="to-synopsis"][data-note="${qa}"]`);
await page.waitForTimeout(400);
await page.evaluate(() => { const s = JSON.parse(localStorage.getItem('fms_story_v1')); s.source += ' MORE WRITING.'; localStorage.setItem('fms_story_v1', JSON.stringify(s)); });
await lastUndo().click();
await page.waitForTimeout(400);
check('story: Undo of "Add to synopsis" keeps writing typed after it', await page.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1')).source.trim()), 'MORE WRITING.');
await page.keyboard.press('Escape');

/* Beat Sheet steps: a move or a removal keeps the keyboard's place. */
await page.click('[data-st="step-add"] >> nth=0');
await page.waitForTimeout(300);
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.waitForTimeout(300);
await page.click('[data-st="step-add"] >> nth=0');
await page.waitForTimeout(300);
await page.evaluate(() => document.activeElement && document.activeElement.blur());
await page.waitForTimeout(400);
const firstStep = await page.getAttribute('[data-st="step-down"]:not([disabled])', 'data-step');
await page.focus(`[data-st="step-down"][data-step="${firstStep}"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('story: after "Down" the focus is on the moved step’s arrow', await page.evaluate(() => { const a = document.activeElement; return [/^step-(up|down)$/.test(a.getAttribute('data-st') || ''), a.getAttribute('data-step')]; }), [true, firstStep]);
await page.focus(`[data-st="step-del"][data-step="${firstStep}"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('story: after "Remove" the focus is on a neighbour, not <body>', await page.evaluate(() => /^step-(del|add)$/.test(document.activeElement.getAttribute('data-st') || '')), true);

/* "Add to the scene": its undo keeps a later edit of that scene. */
await page.evaluate(() => localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
  { id: 'sc1', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'KITCHEN', synopsis: 'Breakfast.', eighths: 8, elements: {} }] })));
await go('breakdown.html#scenes');
await openDock();
await page.selectOption(`.nt-dock [data-nt-field="pin"][data-note="${qa}"]`, 'scene:sc1');
await page.waitForTimeout(400);
await page.click(`.nt-dock [data-nt="to-scene"][data-note="${qa}"]`);
await page.waitForTimeout(400);
await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('fms_scenes_v1')); d.scenes[0].synopsis += '\nLATER EDIT'; localStorage.setItem('fms_scenes_v1', JSON.stringify(d)); });
await lastUndo().click();
await page.waitForTimeout(400);
check('scene list: Undo of "Add to the scene" keeps a later edit', (await scenes()).find((x) => x.id === 'sc1').synopsis, 'Breakfast.\nLATER EDIT');
await page.keyboard.press('Escape');

/* The board. */
await go('vault.html');
await page.fill('#stClip', 'A clipped line');
await page.click('[data-st="clip-add"]');
await page.waitForTimeout(300);
check('board: a clipping pins to the beats the Story page draws (Save the Cat! on a feature)', await page.evaluate(() =>
  [...document.querySelectorAll('[data-st-field="clip-beat"] option')].slice(1, 3).map((o) => o.value.split(':')[0])), ['save_the_cat', 'save_the_cat']);
const clipId = (await vault()).find((x) => x.kind !== 'note').id;
await page.click(`[data-st="clip-use"][data-clip="${clipId}"]`);
await page.waitForTimeout(400);
check('board: a clipping’s "Add to synopsis" offers Undo too, and keeps the focus', [await lastUndo().count(), (await active())[1]], [1, 'clip-use']);
check('board: the new note’s colour row is one Tab stop', await page.evaluate(() => [...document.querySelectorAll('[data-nt="new-color"][data-for="ntBoardNew"]')].filter((b) => b.tabIndex === 0).length), 1);
await page.focus('[data-nt="new-color"][data-for="ntBoardNew"][aria-checked="true"]');
await page.keyboard.press('ArrowRight');
check('board: an arrow key moves the colour choice', await active(), ['BUTTON', 'new-color', 'pink']);
await page.fill('#ntBoardNew', '');
await page.click('[data-nt="add"][data-for="ntBoardNew"]');
await page.waitForTimeout(300);
check('board: "Add note" with an empty box says what to do', await page.evaluate(() => /Write the note in the box first/.test(document.body.innerText)), true);
await page.fill('#ntBoardNew', 'Board one');
await page.click('[data-nt="add"][data-for="ntBoardNew"]');
await page.waitForTimeout(300);
const one = (await vault()).find((x) => x.snippet === 'Board one').id;
await page.focus(`[data-board-item="${one}"] [data-nt="color"][data-color="blue"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('board: a colour change keeps the focus on the dot pressed', await active(), ['BUTTON', 'color', 'blue']);
await page.click('[data-action="vault-filter"][data-value="pinned"]');
await page.waitForTimeout(200);
await page.fill('#ntBoardNew', 'Added while filtered');
await page.click('[data-nt="add"][data-for="ntBoardNew"]');
await page.waitForTimeout(400);
check('board: a note added under a filter that hides it is shown (the filter goes off, and says so)', await page.evaluate(() =>
  [[...document.querySelectorAll('[data-board-item] .nt-text')].some((t) => t.value === 'Added while filtered'), /filter is off/.test(document.body.innerText)]), [true, true]);
await page.click('[data-action="vault-filter"][data-value="all"]');   // a no-op once the add turned the filter off
await page.waitForTimeout(200);
await page.click(`[data-board-item="${one}"] .nt-text`);
await page.keyboard.press('Control+A');
await page.keyboard.press('Backspace');
await page.waitForTimeout(600);
await page.keyboard.press('Tab');
await page.waitForTimeout(300);
check('board: emptying a note puts its text back on leaving, and says why', [await page.inputValue(`[data-board-item="${one}"] .nt-text`), await page.evaluate(() => /can’t be empty/.test(document.body.innerText))], ['Board one', true]);
await page.focus(`[data-board-item="${one}"] [data-nt="del"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('board: deleting a note from the keyboard keeps the focus on the board', await page.evaluate(() => !!document.activeElement.closest('[data-board-item], .nt-add')), true);

/* A short film's clipping pins to the short's five beats, as its notes do
   (a new project: no story saved, so the stored framework is the default). */
await page.evaluate(() => { const S = window.StudioStore; const p = S.createProject({ title: 'QA Short', format: 'short' }); S.setCurrentProject(p.id); S.notify('projects:changed', { reason: 'test' }); });
await go('vault.html');
await page.fill('#stClip', 'A short clipping');
await page.click('[data-st="clip-add"]');
await page.waitForTimeout(300);
check('board: a short film’s clipping pins to the Short Film Five-Beat', await page.evaluate(() =>
  [...new Set([...document.querySelectorAll('[data-st-field="clip-beat"] option')].slice(1).map((o) => o.value.split(':')[0]))]), ['short_five']);

/* ---- QA round 2 (Story & writing) ----------------------------------- */
const focusIs = (sel) => page.evaluate((s) => document.activeElement.matches(s), sel);
const toastSaid = (re) => page.evaluate((r) => [...document.querySelectorAll('.toast .toast-msg')].some((t) => new RegExp(r).test(t.textContent)), re.source);
await page.evaluate(() => { const S = window.StudioStore; localStorage.clear(); const p = S.createProject({ title: 'QA r2', format: 'feature' }); S.setCurrentProject(p.id); S.notify('projects:changed', { reason: 'test' });
  localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
    { id: 'p1', number: '1', intExt: 'INT', dayNight: 'DAY', location: '', synopsis: 'Ravi dives into the black water at dawn and does not come up', eighths: 8, elements: {} },
    { id: 'p2', number: '2', intExt: 'INT', dayNight: 'DAY', location: '', synopsis: 'Meera waits', eighths: 8, elements: {} }
  ] })); });
await go('story.html#path-outline');
check('notes button: its name carries the count (no aria-label on the count) and it says whether the dock is open',
  await page.evaluate(() => { const b = document.querySelector('.nt-open'); return [b.querySelector('.nt-count').hasAttribute('aria-label'), b.getAttribute('aria-expanded')]; }), [false, 'false']);
await openDock();
check('notes button: aria-expanded is true while the dock is open', await page.evaluate(() => document.querySelector('.nt-open').getAttribute('aria-expanded')), 'true');
await page.fill('#ntDockNew', 'Into the synopsis');
await page.click('.nt-dock [data-nt="add"]');
await page.waitForTimeout(300);
const r2 = (await vault())[0].id;
check('pin list: scenes with no location yet are told apart by their synopsis', await page.evaluate(() =>
  [...document.querySelectorAll('.nt-dock [data-nt-field="pin"] option')].map((o) => o.textContent).filter((t) => /^[12]\. /.test(t))),
  ['1. INT · Ravi dives into the black water at dawn…', '2. INT · Meera waits']);
await page.focus(`.nt-dock [data-nt="to-synopsis"][data-note="${r2}"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('story: Escape after "Add to synopsis" gives the focus to the page’s Notes button, not <body>', await focusIs('.nt-open'), true);

await go('vault.html');
await page.focus('[data-st="clip-add"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('vault: an empty "Add to vault" focuses the box and says what to do', [await focusIs('#stClip'), await toastSaid(/clipping in the box first/)], [true, true]);
for (const t of ['Clip one', 'Clip two', 'Clip three']) {
  await page.fill('#stClip', t);
  await page.focus('[data-st="clip-add"]');
  await page.keyboard.press('Enter');
  await page.waitForTimeout(300);
}
check('vault: after Add the keyboard is back in the clipping box', await focusIs('#stClip'), true);
const snips = async () => (await vault()).map((x) => x.snippet);
const before = await snips();
const mid = (await vault())[1].id;
await page.focus(`[data-st="clip-del"][data-clip="${mid}"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('vault: removing a clipping leaves the focus on the board, not <body>', await page.evaluate(() => !!document.activeElement.closest('[data-board-item], .st-clip-add, .vault-add') || document.activeElement.id === 'stClip'), true);
await lastUndo().click();
await page.waitForTimeout(300);
check('vault: Undo puts the clipping back IN ITS PLACE', await snips(), before);
await page.fill('#ntBoardNew', 'N1'); await page.click('[data-nt="add"][data-for="ntBoardNew"]'); await page.waitForTimeout(300);
await page.fill('#ntBoardNew', 'N2'); await page.click('[data-nt="add"][data-for="ntBoardNew"]'); await page.waitForTimeout(300);
const n2 = (await vault())[0].id;
await page.focus(`[data-board-item="${n2}"] [data-nt="down"]`);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('board: "Move down" keeps the focus on the moved note’s Move down', await focusIs(`[data-nt="down"][data-note="${n2}"]`), true);
await page.keyboard.press('Enter');
await page.waitForTimeout(300);
check('board: …so Enter again moves it again', (await vault()).findIndex((x) => x.id === n2), 2);

check('no page errors', errors, []);
console.log(failed ? `✗ notes proof: ${passed} passed, ${failed} failed` : `✓ notes proof: ${passed} passed, 0 failed`);
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
