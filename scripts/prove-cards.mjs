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

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:cards: all passed');
process.exit(failed ? 1 : 0);
