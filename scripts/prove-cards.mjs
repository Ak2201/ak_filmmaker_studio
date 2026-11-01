/* ============================================================
   PROOF: the scene list's index cards (breakdown.html#scenes,
   renderSceneCard in src/pages/breakdown.js).
   ------------------------------------------------------------
   verify loads the breakdown with two seeded scenes in the TABLE; the
   cards exist only after the switch, so this seeds four and drives it.

   Asserted:
     1  the Table / Cards switch is there and the table is the default
     2  Cards shows one card per scene with slug, synopsis, cast and the
        time-of-day hue; switching writes nothing; #scenes resolves
     3  the INT / EXT filter hides cards, as it hides rows
     4  ArrowRight / ArrowLeft on a card's handle reorder (one write each),
        focus stays, and the first move says the script has not moved
     5  a drag onto a card's leading half drops the scene before it
     6  Edit returns to the table with that scene open and focused
     7  one column and no horizontal overflow at 390; no page errors
     8  (QA, 26 Oct 2026) no card prints "null"; an edited row is found
        by the search and the filters; the length box shows what was
        saved, whole, and fits two digits; the tag category stays; an
        empty name says so; removing a chip and restoring a scene keep
        focus; opening a scene keeps it in view; Restore retires the
        dead UNDO; the bin heading; the search placeholder fits

       npm run build:open && npm run prove:cards
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5374;
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
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push(k); return set.call(this, k, v); };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const order = () => page.evaluate(() => JSON.parse(localStorage.getItem('fms_scenes_v1') || '{"scenes":[]}').scenes.map((s) => s.location));

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Cards', format: 'feature' });
  S.setCurrentProject(p.id);
  const sc = (n, location, intExt, dayNight, synopsis, cast) => ({ id: 'sc' + n, number: String(n), intExt, dayNight, location, synopsis, eighths: 8 + n, elements: cast ? { cast } : {} });
  localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
    sc(1, 'HOSTEL ROOM', 'INT', 'NIGHT', 'Arun cannot sleep.', ['ARUN']),
    sc(2, 'COLLEGE GATE', 'EXT', 'DAY', 'The first day.', ['ARUN', 'MEERA']),
    sc(3, 'CANTEEN', 'INT', 'DAY', '', []),
    sc(4, 'ROOFTOP', 'EXT', 'DUSK', 'They talk until the light goes.', ['MEERA'])
  ] }));
});
await page.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
await page.waitForTimeout(400);

/* 1 the switch */
ok(await page.$$eval('.bd-sl-view [data-value="cards"]', (b) => b.length) === 1, '1  the scene list offers a Cards view');
ok(await page.$$eval('.bd-scene.bd-sl', (r) => r.length) === 4, '1  the table is the default');
const w0 = await page.evaluate(() => window.__writes.length);
await page.click('.bd-sl-view [data-value="cards"]');
await page.waitForTimeout(200);
ok(await page.$$eval('.bd-card', (c) => c.length) === 4, '2  four cards, one per scene');
ok(await page.$$eval('.bd-scene.bd-sl', (r) => r.length) === 0, '2  the table rows are gone in Cards');
ok(await page.evaluate(() => window.__writes.length) === w0, '2  switching the view writes nothing');
const first = await page.$eval('.bd-card', (c) => ({ slug: c.querySelector('.bd-card-slug').textContent, syn: c.querySelector('.bd-card-syn').textContent, cast: c.querySelector('.bd-card-cast').textContent, hue: c.className }));
const nulls = await page.$$eval('.bd-card', (cs) => cs.filter((c) => [...c.childNodes].some((n) => n.nodeType === 3 && /null/.test(n.textContent)) || /\bnull\b/.test(c.innerText)).length);
ok(nulls === 0, '8  no index card prints the word "null"', nulls);
ok(first.slug === 'HOSTEL ROOM' && first.syn === 'Arun cannot sleep.' && /ARUN/i.test(first.cast) && /hue-night/.test(first.hue), '2  a card shows the slug, the synopsis, the cast and the time-of-day hue', first);
ok(await page.$eval('#scenes', (n) => !!n), '2  #scenes still resolves');

/* 3 the filter applies to cards */
await page.selectOption('[data-sl-filter="ie"]', 'EXT');
await page.waitForTimeout(200);
ok(await page.$$eval('.bd-card:not([hidden])', (c) => c.length) === 2, '3  the INT / EXT filter hides cards');
await page.selectOption('[data-sl-filter="ie"]', '');
await page.waitForTimeout(200);

/* 4 keyboard reorder */
await page.focus('[data-scene="sc1"] .bd-sl-grip');
await page.keyboard.press('ArrowRight');
await page.waitForTimeout(300);
ok(JSON.stringify(await order()) === JSON.stringify(['COLLEGE GATE', 'HOSTEL ROOM', 'CANTEEN', 'ROOFTOP']), '4  ArrowRight on a card moves the scene one place', await order());
ok(await page.evaluate(() => document.activeElement && document.activeElement.closest('[data-scene]')?.dataset.scene) === 'sc1', '4  focus stays on the moved card');
ok(await page.isVisible('.toast:has-text("The screenplay itself has not moved")'), '4  the first move says the screenplay has not moved');
await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(300);
ok((await order())[0] === 'HOSTEL ROOM', '4  ArrowLeft moves it back');

/* 5 drag on the grid */
const grip = await page.$('[data-scene="sc4"] .bd-sl-grip');
const target = await page.$('.bd-sl[data-scene="sc1"]');
const g = await grip.boundingBox(), t = await target.boundingBox();
await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
await page.mouse.down();
await page.mouse.move(g.x + 30, g.y + 10, { steps: 4 });
await page.mouse.move(t.x + 10, t.y + t.height / 2, { steps: 8 });
ok(await page.$$eval('.bd-card.is-drop-before', (c) => c.length) === 1, '5  the drop is shown on the card edge');
await page.mouse.up();
await page.waitForTimeout(300);
ok((await order())[0] === 'ROOFTOP', '5  a drag onto the first card\'s leading half puts the scene first', await order());

/* 6 Edit opens the table at that scene */
await page.click('[data-scene="sc3"] [data-action="sl-card-open"]');
await page.waitForTimeout(300);
ok(await page.$$eval('.bd-scene.bd-sl', (r) => r.length) === 4, '6  Edit goes back to the table');
ok(await page.$eval('.bd-sl[data-scene="sc3"]', (r) => r.classList.contains('is-open')), '6  with that scene open');
ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.bd-slug') && document.activeElement.closest('[data-scene]').dataset.scene === 'sc3'), '6  and its location field focused');

/* 8 the table after edits (QA, 26 Oct 2026) */
const stored = (id) => page.evaluate((i) => JSON.parse(localStorage.getItem('fms_scenes_v1')).scenes.find((s) => s.id === i), id);
const shown = () => page.$$eval('.bd-sl[data-scene]:not([hidden])', (r) => r.map((x) => x.dataset.scene));
await page.fill('[data-scene="sc1"] [data-scene-field="location"]', 'LIGHTHOUSE');
await page.keyboard.press('Tab');
await page.fill('#bdSceneSearch', 'lighthouse');
await page.waitForTimeout(150);
ok(JSON.stringify(await shown()) === '["sc1"]', '8  a renamed location is found by the search', await shown());
await page.fill('#bdSceneSearch', '');
await page.selectOption('[data-scene="sc1"] [data-scene-field="intExt"]', 'EXT');
await page.selectOption('[data-sl-filter="ie"]', 'EXT');
await page.waitForTimeout(150);
ok((await shown()).includes('sc1'), '8  an INT turned EXT is in the EXT filter', await shown());
await page.selectOption('[data-sl-filter="ie"]', '');
const len = '[data-scene="sc2"] [data-scene-field="eighths"]';
for (const [typed, want] of [['-5', 0], ['2.5', 2], ['500', 80]]) {
  await page.fill(len, typed);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(80);
  const v = await page.$eval(len, (i) => i.value);
  ok(v === String(want) && (await stored('sc2')).eighths === want, `8  length ${typed} is saved and shown as ${want}`, { v, s: (await stored('sc2')).eighths });
}
await page.fill(len, '18'); await page.keyboard.press('Tab');
const fit = await page.$eval(len, (i) => ({ sw: i.scrollWidth, cw: i.clientWidth }));
ok(fit.sw <= fit.cw, '8  two digits fit the length box', fit);
// sc3 is open (from 6): tag a prop, then the category stays Props
await page.selectOption('[data-scene="sc3"] .bd-add-cat', 'props');
await page.fill('[data-scene="sc3"] .bd-add-name', 'Trophy');
await page.click('[data-scene="sc3"] [data-action="el-attach"]');
await page.waitForTimeout(150);
ok(await page.$eval('[data-scene="sc3"] .bd-add-cat', (s) => s.value) === 'props', '8  after Attach Element the category is still Props');
await page.click('[data-scene="sc3"] [data-action="el-attach"]');
await page.waitForTimeout(150);
ok(await page.evaluate(() => document.activeElement && document.activeElement.matches('.bd-add-name')), '8  an empty Attach Element sends focus to the name');
ok(await page.isVisible('.toast:has-text("Name the element first")'), '8  and says to name it first');
await page.focus('[data-scene="sc3"] [data-action="el-remove"]');
await page.keyboard.press('Enter');
await page.waitForTimeout(150);
ok(await page.evaluate(() => !!document.activeElement?.closest('[data-scene="sc3"]')), '8  removing a chip keeps focus in the scene', await page.evaluate(() => document.activeElement?.tagName));
// opening a scene keeps its toggle in view
await page.evaluate(() => window.scrollTo(0, 0));
await page.click('[data-scene="sc4"] .bd-sl-toggle');
await page.waitForTimeout(400);
const inView = await page.evaluate(() => { const r = document.activeElement.getBoundingClientRect(); return { top: Math.round(r.top), h: innerHeight, y: Math.round(scrollY), sc: document.activeElement.closest('[data-scene]')?.dataset.scene }; });
ok(inView.sc === 'sc4' && inView.top >= 0 && inView.top < inView.h, '8  opening a scene leaves its toggle on screen', inView);
// bin: Delete, then Restore by hand retires the UNDO toast
await page.focus('[data-scene="sc2"] .bd-sl-toggle');
await page.keyboard.press('Delete');
await page.waitForTimeout(200);
ok(await page.$eval('.bd-bin h2', (h) => h.textContent) === 'Removed scenes (1)', '8  the bin is headed Removed scenes', await page.$eval('.bd-bin h2', (h) => h.textContent));
await page.click('[data-action="bin-restore"]');
await page.waitForTimeout(400);
ok(!(await page.isVisible('.toast:has-text("moved to the bin")')), '8  restoring by hand retires the dead UNDO toast');
ok(await page.evaluate(() => document.activeElement?.closest('[data-scene]')?.dataset.scene) === 'sc2', '8  focus lands on the restored scene');
const ph = await page.$eval('#bdSceneSearch', (i) => {
  const c = document.createElement('canvas').getContext('2d'); const cs = getComputedStyle(i);
  c.font = cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
  return { need: Math.ceil(c.measureText(i.placeholder).width), have: i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) };
});
ok(ph.need <= ph.have, '8  the search placeholder fits its box', ph);

/* 9 (breakdown QA round 2) keyboard focus, undo and reach on the Scene List and Auto-Tag */
{
  const q = await ctx.newPage();
  q.on('pageerror', (e) => errors.push(e.message));
  await q.goto(url('index.html'), { waitUntil: 'networkidle' });
  await q.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Round2', format: 'feature' });
    S.setCurrentProject(p.id);
    const sc = (n, location, synopsis, extra) => ({ id: 'sc' + n, number: String(n), intExt: 'INT', dayNight: 'DAY', location, synopsis, eighths: 8, elements: {}, ...(extra || {}) });
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [
      sc(1, 'HOSTEL ROOM', 'Arun cannot sleep.', { elements: { props: ['Gold medal and box'] } }), sc(2, 'COLLEGE GATE', 'The first day.'), sc(3, 'CANTEEN', 'Tea.'), sc(4, 'ROOFTOP', 'Light goes.')
    ] }));
    const el = (id, type, text) => ({ id, type, text });
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: [
      el('h1', 'scene', 'INT. HOSTEL ROOM - DAY'), el('a1', 'action', 'A medal and a lamp and a pen on the desk. Behind the glass: ARREAR SUBJECTS, REGISTERED CANDIDATES.'),
      el('h2', 'scene', 'INT. COLLEGE GATE - DAY'), el('a2', 'action', 'A lorry and a bicycle at the gate.')
    ] }));
  });
  await q.goto(url('breakdown.html#suggest'), { waitUntil: 'networkidle' });
  await q.waitForTimeout(400);
  const chips = await q.$$eval('.bd-sug-scene[data-scene="sc1"] .bd-sug', (c) => c.map((x) => x.dataset.name));
  ok(!chips.includes('medal') && chips.includes('lamp'), '9  a tagged "Gold medal and box" is not offered again as "medal"', chips);
  ok(!(await q.$$eval('.bd-sug[data-cat="cast"]', (c) => c.map((x) => x.dataset.name))).includes('Arrear Subjects'), '9  capitals on a sign are not offered as cast');
  const n0 = chips.length;
  await q.focus('.bd-sug-scene[data-scene="sc1"] .bd-sug');
  await q.keyboard.press('Enter');
  await q.waitForTimeout(250);
  ok(await q.evaluate(() => !!document.activeElement?.closest('.bd-sug-scene[data-scene="sc1"]') && document.activeElement.classList.contains('bd-sug')), '9  tagging a suggestion moves focus to the next chip, not <body>', await q.evaluate(() => document.activeElement?.tagName));
  ok((await q.$$eval('.bd-sug-scene[data-scene="sc1"] .bd-sug', (c) => c.length)) === n0 - 1, '9  and the chip left the list');
  await q.focus('.bd-sug-scene[data-scene="sc1"] .bd-sug-scene-all');
  await q.keyboard.press('Enter');
  await q.waitForTimeout(250);
  ok(await q.evaluate(() => document.activeElement && document.activeElement !== document.body), '9  ADD THESE leaves focus on a control', await q.evaluate(() => document.activeElement?.tagName));
  await q.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await q.waitForTimeout(300);
  // Re-measure, type a length, Undo: the typed length survives
  const rm = await q.$('[data-action="eighths-measure"]');
  if (rm) {
    await q.focus('[data-action="eighths-measure"]');
    await q.keyboard.press('Enter');
    await q.waitForTimeout(250);
    ok(await q.evaluate(() => document.activeElement && document.activeElement !== document.body), '9  Re-measure leaves focus on a control');
    await q.evaluate(() => { const o = JSON.parse(localStorage.getItem('fms_scenes_v1')); o.scenes[0].eighths = 33; localStorage.setItem('fms_scenes_v1', JSON.stringify(o)); });
    await q.click('.toast [data-action], .toast button:has-text("Undo")');
    await q.waitForTimeout(250);
    ok(await q.evaluate(() => JSON.parse(localStorage.getItem('fms_scenes_v1')).scenes[0].eighths) === 33, '9  Undo of a re-measure keeps a length typed afterwards');
  }
  // bulk actions reach only the scenes the filter leaves on screen
  await q.check('[data-scene="sc1"] [data-action="sl-pick"]');
  await q.check('[data-scene="sc2"] [data-action="sl-pick"]');
  await q.fill('#bdSceneSearch', 'HOSTEL');
  await q.waitForTimeout(200);
  ok(/2 selected \(1 hidden/.test(await q.$eval('.bd-sl-bulk-n', (n) => n.textContent)), '9  the bulk bar says a selected scene is hidden by the filter', await q.$eval('.bd-sl-bulk-n', (n) => n.textContent));
  await q.selectOption('[data-sl-bulk="dayNight"]', 'NIGHT');
  await q.waitForTimeout(200);
  const dn = await q.evaluate(() => JSON.parse(localStorage.getItem('fms_scenes_v1')).scenes.map((s) => s.dayNight));
  ok(dn[0] === 'NIGHT' && dn[1] === 'DAY', '9  a bulk change leaves the hidden selected scene alone', dn);
  await q.fill('#bdSceneSearch', '');
  // bin: the buttons name the action and focus stays in the list
  await q.focus('[data-scene="sc3"] .bd-sl-toggle');
  await q.keyboard.press('Enter');
  await q.click('[data-scene="sc3"] [data-action="scene-del"]');
  await q.waitForTimeout(250);
  ok(await q.evaluate(() => document.activeElement && document.activeElement !== document.body), '9  Move to the bin leaves focus on a control', await q.evaluate(() => document.activeElement?.tagName));
  await q.focus('.bd-bin-del');
  await q.keyboard.press('Enter');
  await q.waitForTimeout(200);
  ok(await q.$eval('.mbtn.primary', (b) => b.textContent) === 'Delete for good', '9  the bin\'s delete dialog confirms with "Delete for good", not OK');
  await q.click('.mbtn.primary');
  await q.waitForTimeout(250);
  ok(await q.evaluate(() => document.activeElement && document.activeElement !== document.body), '9  after Delete for good focus is not on <body>', await q.evaluate(() => document.activeElement?.tagName));
  // the bar's labels are kit sentence case
  ok(/^Expand all$/.test(await q.$eval('.bd-sl-expand', (b) => b.textContent.trim())) && /^Save this filter$/.test(await q.$eval('.bd-sl-save', (b) => b.textContent.trim())), '9  Expand all and Save this filter are sentence case');
  // keyboard reorder: the grip stays where it was on screen
  /* INSTANT: base.css sets scroll-behavior: smooth, so a bare scrollTo(0, 0)
     is an animation, and on a loaded runner it was still running while the
     focus and the first key landed, so where the grip started depended on
     the runner's speed (Gate run 383). */
  await q.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await q.focus('[data-scene="sc2"] .bd-sl-grip');
  const top0 = await q.$eval('[data-scene="sc2"] .bd-sl-grip', (g) => g.getBoundingClientRect().top);
  await q.keyboard.press('ArrowDown');
  await q.waitForTimeout(250);
  await q.keyboard.press('ArrowUp');
  await q.waitForTimeout(250);
  const top1 = await q.$eval('[data-scene="sc2"] .bd-sl-grip', (g) => g.getBoundingClientRect().top);
  ok(Math.abs(top1 - top0) < 90, '9  keyboard reorder does not throw the moved row across the screen', { top0, top1 });
  // a script mark stays an inline word on a touch screen (base.css's 44px floor made each a box)
  const dump = await q.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(localStorage))));
  const touch = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await touch.addInitScript((d) => { if (!sessionStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(JSON.parse(d))) localStorage.setItem(k, v); sessionStorage.setItem('__seeded', '1'); } }, dump);
  const tp = await touch.newPage();
  await tp.goto(url('breakdown.html#breakdown'), { waitUntil: 'networkidle' });
  await tp.waitForTimeout(500);
  const marks = await tp.$$eval('.bdp-mark', (m) => m.map((x) => { const c = getComputedStyle(x); return { d: c.display, h: c.minHeight, w: c.minWidth }; }));
  ok(marks.length > 0 && marks.every((m) => m.d === 'inline' && m.h === '0px' && m.w === '0px'), '9  on a touch screen a script mark is inline, not a 44px box', marks.slice(0, 2));
  await touch.close();
  await q.close();
}

/* 7 phone width, fresh load */
const phone = await ctx.newPage();
phone.on('pageerror', (e) => errors.push(e.message));
await phone.setViewportSize({ width: 390, height: 860 });
await phone.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
await phone.waitForTimeout(300);
await phone.click('[data-scene="sc1"] .bd-sl-toggle');
await phone.waitForTimeout(300);
const overOpen = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(overOpen <= 0, '7  an open scene does not overflow at 390 (the detail grid track)', overOpen);
await phone.click('.bd-sl-view [data-value="cards"]');
await phone.waitForTimeout(300);
const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, '7  no horizontal overflow at 390 in Cards', over);
const cols = await phone.$$eval('.bd-card', (c) => new Set(c.map((x) => Math.round(x.getBoundingClientRect().left))).size);
ok(cols === 1, '7  one column of cards at 390', cols);
ok(errors.length === 0, '7  no page errors', errors.slice(0, 5));

/* 10 (breakdown QA round 3, 27 Oct 2026) */
{
  const r = await ctx.newPage();
  r.on('pageerror', (e) => errors.push(e.message));
  await r.goto(url('index.html'), { waitUntil: 'networkidle' });
  await r.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Round3', format: 'feature' });
    S.setCurrentProject(p.id);
    const times = ['DAY', 'NIGHT', 'DUSK'];
    const scenes = Array.from({ length: 30 }, (_, i) => ({
      id: 'r' + (i + 1), number: String(i + 1), intExt: i % 2 ? 'EXT' : 'INT', dayNight: times[i % 3],
      location: i === 1 ? 'ROOF' : i === 0 ? 'KITCHEN' : 'PLACE ' + (i + 1), synopsis: i === 1 ? 'Meera and the knife.' : 'Something happens ' + i,
      eighths: i === 0 ? 18 : 8, elements: i === 0 ? { props: ['Knife'] } : {}
    }));
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes }));
    const el = (id, type, text) => ({ id, type, text });
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: [
      el('h1', 'scene', 'INT. KITCHEN - DAY'), el('a1', 'action', 'A card on the table.'),
      el('h2', 'scene', 'EXT. ROOF - DUSK'), el('a2', 'action', 'Wind.')
    ] }));
    localStorage.setItem('fms_story_v1', JSON.stringify({ outline: [{ id: 'st1', text: 'Something happens 0', synced: 'Something happens 0', sceneId: 'r1', color: 'pink', beat: 'opening-image', title: 'Setup' }] }));
  });
  const stored = () => r.evaluate(() => JSON.parse(localStorage.getItem('fms_scenes_v1')).scenes.map((s) => s.id));
  await r.setViewportSize({ width: 1280, height: 900 });
  await r.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);

  // multi-word search spans fields
  await r.fill('#bdSceneSearch', 'roof meera');
  await r.waitForTimeout(150);
  ok(JSON.stringify(await r.$$eval('.bd-sl[data-scene]:not([hidden])', (x) => x.map((n) => n.dataset.scene))) === '["r2"]', '10 a search of words from two fields finds the scene');
  await r.fill('#bdSceneSearch', '');

  // bin three, restore in the listed (not newest-first) order: scene order holds
  for (const id of ['r2', 'r3', 'r4']) {
    await r.focus(`[data-scene="${id}"] .bd-sl-toggle`);
    await r.keyboard.press('Delete');
    await r.waitForTimeout(150);
  }
  for (let i = 0; i < 3; i++) {
    const want = ['r2', 'r3', 'r4'][i];
    await r.click(`[data-bin]:has-text("Scene ${want.slice(1)} ") [data-action="bin-restore"], [data-bin]:has-text("${want.slice(1)} · ") [data-action="bin-restore"]`);
    await r.waitForTimeout(150);
  }
  const ord = (await stored()).slice(0, 6).join(',');
  ok(ord === 'r1,r2,r3,r4,r5,r6', '10 restoring binned scenes one at a time in any order keeps the scene order', ord);

  // the bin toast names only what went with the scene
  await r.focus('[data-scene="r8"] .bd-sl-toggle');
  await r.keyboard.press('Delete');
  await r.waitForTimeout(150);
  const tt = await r.$$eval('.toast', (t) => t.map((x) => x.textContent).join('|'));
  ok(/Scene 8 moved to the bin\./.test(tt) && !/call-sheet places went/.test(tt), '10 the bin toast claims nothing was attached when nothing was', tt);

  // arrows are inert under a filter
  await r.selectOption('[data-sl-filter="ie"]', 'INT');
  await r.click('[data-scene="r1"] .bd-sl-toggle');
  await r.waitForTimeout(150);
  const before = await stored();
  await r.click('[data-scene="r1"] [data-action="scene-down"]');
  await r.waitForTimeout(150);
  ok(JSON.stringify(await stored()) === JSON.stringify(before) && await r.isVisible('.toast:has-text("Reordering is off")'), '10 Move later does nothing under a filter, and says why');
  await r.selectOption('[data-sl-filter="ie"]', '');

  // attaching a duplicate says so
  await r.selectOption('.bd-sl[data-scene="r1"] .bd-add-cat', 'props');
  await r.fill('[data-scene="r1"] .bd-add-name', 'knife');
  await r.press('[data-scene="r1"] .bd-add-name', 'Enter');
  await r.waitForTimeout(150);
  ok(await r.isVisible('.toast:has-text("already on this scene")'), '10 attaching an element the scene already has says so');

  // bulk bar: focus stays on a control; sticky stays in view when far down the list
  await r.check('[data-scene="r20"] [data-action="sl-pick"]');
  await r.check('[data-scene="r21"] [data-action="sl-pick"]');
  await r.evaluate(() => document.querySelector('[data-scene="r25"]').scrollIntoView({ block: 'center' }));
  await r.waitForTimeout(250);
  const bar = await r.$eval('.bd-sl-bulk', (b) => { const q = b.getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom), h: innerHeight }; });
  ok(bar.bottom > 0 && bar.top < bar.h, '10 the bulk bar stays in view while rows far down are ticked', bar);
  await r.focus('[data-sl-bulk="intExt"]');
  await r.selectOption('[data-sl-bulk="intExt"]', 'EXT');
  await r.waitForTimeout(250);
  ok(await r.evaluate(() => document.activeElement && document.activeElement !== document.body), '10 a bulk Set leaves focus on a control', await r.evaluate(() => document.activeElement?.tagName));
  await r.focus('[data-action="sl-clear"]');
  await r.keyboard.press('Enter');
  await r.waitForTimeout(250);
  ok(await r.evaluate(() => document.activeElement && document.activeElement !== document.body), '10 CLEAR SELECTION leaves focus on a control', await r.evaluate(() => document.activeElement?.tagName));

  // a removed saved filter can be put back
  await r.selectOption('[data-sl-filter="ie"]', 'EXT');
  await r.click('[data-action="sl-save"]');
  await r.fill('.dlg-field', 'Mine');
  await r.keyboard.press('Enter');
  await r.waitForTimeout(250);
  if (await r.$('[data-action="sl-preset-x"]')) {
    const n = await r.$$eval('[data-preset]', (x) => x.length);
    await r.click('[data-action="sl-preset-x"]');
    await r.waitForTimeout(150);
    await r.locator('.toast button:has-text("UNDO")').last().click();
    await r.waitForTimeout(150);
    ok(await r.$$eval('[data-preset]', (x) => x.length) === n, '10 Removing a saved filter offers UNDO');
  } else ok(false, '10 a saved filter could be made to test UNDO');
  await r.selectOption('[data-sl-filter="ie"]', '');

  // an emptied synopsis does not blank the Beat Sheet step
  if (!(await r.isVisible('.bd-sl[data-scene="r1"] [data-scene-field="synopsis"]'))) await r.click('.bd-sl[data-scene="r1"] .bd-sl-toggle');
  await r.fill('.bd-sl[data-scene="r1"] [data-scene-field="synopsis"]', '');
  await r.waitForTimeout(1500);
  const stepText = await r.evaluate(() => JSON.parse(localStorage.getItem('fms_story_v1')).outline[0].text);
  ok(stepText === 'Something happens 0', '10 emptying a linked scene synopsis leaves the step text', stepText);

  // beat colour has a name
  const sw = await r.$eval('.bd-sl[data-scene="r1"] .bc-swatch', (e) => ({ l: e.getAttribute('aria-label'), h: e.getAttribute('aria-hidden') }));
  ok(/Pink/.test(sw.l || '') && sw.h !== 'true', '10 a beat colour swatch carries its name', sw);

  // Whole script: sub-tabs by keyboard, and the day / night tile adds up
  await r.goto(url('breakdown.html#overview'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);
  await r.focus('.bdo-seg-btn[aria-selected="true"]');
  await r.keyboard.press('End');
  await r.waitForTimeout(200);
  ok(await r.evaluate(() => document.activeElement?.dataset.view) === 'totals' && await r.$eval('#bdo-tab-totals', (b) => b.getAttribute('aria-selected')) === 'true', '10 End on the Whole script tabs opens the last one');
  await r.keyboard.press('ArrowLeft');
  await r.waitForTimeout(200);
  ok(await r.evaluate(() => document.activeElement?.dataset.view) === 'locations', '10 ArrowLeft moves to the one before');
  await r.click('#bdo-tab-totals');
  await r.waitForTimeout(200);
  const tile = await r.$$eval('.bdo-totals .bd-stat', (c) => c.map((x) => x.textContent));
  ok(tile.some((t) => /^\d+ \/ \d+ \/ \d+day \/ night \/ other$/.test(t)), '10 the day / night tile counts dusk and dawn too', tile);

  // Auto-Tag chip: the name starts with what is printed
  await r.goto(url('breakdown.html#suggest'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);
  const chip = await r.$eval('.bd-sug', (c) => ({ l: c.getAttribute('aria-label'), t: c.textContent.replace(/\s+/g, ' ').trim().toLowerCase() })).catch(() => null);
  ok(chip && chip.l.toLowerCase().replace(/\s+/g, '') === chip.t.replace(/\s+/g, ''), '10 an Auto-Tag chip is named by its printed words', chip);

  // widths: the page figure is whole at 800 and 1100; the phone's tag row shows its category
  for (const w of [721, 800, 1100]) {
    await r.setViewportSize({ width: w, height: 900 });
    await r.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
    await r.waitForTimeout(300);
    const f = await r.$eval('[data-scene="r1"] .bd-pages', (e) => ({ sw: e.scrollWidth, cw: e.clientWidth }));
    ok(f.sw <= f.cw, `10 the page figure is whole at ${w}px`, f);
  }
  await r.setViewportSize({ width: 390, height: 860 });
  await r.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(300);
  if (!(await r.isVisible('.bd-sl[data-scene="r1"] .bd-add-cat'))) await r.click('.bd-sl[data-scene="r1"] .bd-sl-toggle');
  await r.waitForTimeout(250);
  const cat = await r.$eval('.bd-sl[data-scene="r1"] .bd-add-cat', (e) => e.getBoundingClientRect().width);
  ok(cat >= 100, '10 at 390 the tag category select shows its name', cat);

  // the Elements sheet holds Tab
  await r.goto(url('breakdown.html#elements'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);
  await r.click('[data-action="ex-sheet"]');
  await r.waitForTimeout(250);
  let outside = 0;
  for (let i = 0; i < 40; i++) {
    await r.keyboard.press('Tab');
    if (!(await r.evaluate(() => !!document.activeElement?.closest('#bdxSide')))) outside++;
  }
  ok(outside === 0, '10 Tab stays inside the open Element index sheet', outside);
  await r.close();
}
/* 11 (leftovers, 27 Oct 2026): behaviour the pure tests only read as text.
   The empty state's link to Whole script keeps focus; Delete focuses the
   neighbour; Removed scenes jumps to the bin; the tag menu stays in the window. */
{
  const r = await ctx.newPage();
  r.on('pageerror', (e) => errors.push(e.message));
  await r.setViewportSize({ width: 1280, height: 700 });
  await r.goto(url('index.html'), { waitUntil: 'networkidle' });
  await r.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Round4', format: 'feature' });
    S.setCurrentProject(p.id);
  });
  await r.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);
  await r.click('a[data-action="bd-to-overview"]');
  await r.waitForTimeout(500);
  const f1 = await r.evaluate(() => { const a = document.activeElement; return { tag: a && a.tagName, inOv: !!(a && a.closest('#overview')) }; });
  ok(f1.inOv && f1.tag !== 'BODY', '11 the empty state link lands focus inside the Whole script tab', f1);

  await r.goto(url('index.html'), { waitUntil: 'networkidle' });
  await r.evaluate(() => {
    const sc = (n, loc) => ({ id: 'q' + n, number: String(n), intExt: 'INT', dayNight: 'DAY', location: loc, synopsis: 'x', eighths: 8, elements: {} });
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ scenes: [sc(1, 'ONE'), sc(2, 'TWO'), sc(3, 'THREE')] }));
    const el = (id, type, text) => ({ id, type, text });
    localStorage.setItem('fms_script_v1', JSON.stringify({ elements: [
      el('h1', 'scene', 'INT. ONE - DAY'), el('a1', 'action', 'Arun lifts the knife and walks to the window.')
    ] }));
  });
  await r.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(400);
  if (!(await r.isVisible('.bd-sl[data-scene="q2"] [data-action="scene-del"]'))) await r.click('.bd-sl[data-scene="q2"] .bd-sl-toggle');
  await r.click('.bd-sl[data-scene="q2"] [data-action="scene-del"]');
  await r.waitForTimeout(400);
  const f2 = await r.evaluate(() => document.activeElement?.closest('[data-scene]')?.dataset.scene);
  ok(f2 === 'q3' || f2 === 'q1', '11 deleting a scene puts focus on a neighbouring row, not <body>', f2);
  await r.click('[data-action="sl-bin"]');
  await r.waitForTimeout(300);
  const f3 = await r.evaluate(() => { const h = document.querySelector('.bd-bin .bd-h2'); const b = h.getBoundingClientRect(); return { focused: document.activeElement === h, top: Math.round(b.top), h: innerHeight }; });
  ok(f3.focused && f3.top >= 0 && f3.top < f3.h, '11 Removed scenes jumps to the bin heading and focuses it', f3);

  await r.goto(url('breakdown.html#breakdown'), { waitUntil: 'networkidle' });
  await r.waitForTimeout(500);
  const sel = await r.evaluate(() => {
    const host = document.querySelector('#breakdown .bdp-page, #breakdown [class*="bdp-"] p, #breakdown .bdp-line');
    const walker = document.createTreeWalker(document.querySelector('#breakdown'), NodeFilter.SHOW_TEXT);
    let n; while ((n = walker.nextNode())) { if (/knife/.test(n.textContent) && n.parentElement.offsetParent) { const i = n.textContent.indexOf('knife'); const rg = document.createRange(); rg.setStart(n, i); rg.setEnd(n, i + 5); const s = getSelection(); s.removeAllRanges(); s.addRange(rg); const b = rg.getBoundingClientRect(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; } }
    return null;
  });
  if (!sel) ok(false, '11 found the word to select in the paper');
  else {
    await r.mouse.move(sel.x, sel.y);
    await r.evaluate(() => document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })));
    await r.waitForTimeout(300);
    const m = await r.evaluate(() => { const t = document.querySelector('#breakdown .bdp-tagger'); if (!t || t.hidden) return null; const b = t.getBoundingClientRect(); return { top: Math.round(b.top), bottom: Math.round(b.bottom), left: Math.round(b.left), right: Math.round(b.right), vw: innerWidth, vh: innerHeight }; });
    ok(m && m.top >= 0 && m.bottom <= m.vh && m.left >= 0 && m.right <= m.vw, '11 the tag menu opens inside the window', m);
  }
  await r.close();
}
ok(errors.length === 0, '10 no page errors', errors.slice(0, 5));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:cards: all passed');
process.exit(failed ? 1 : 0);
