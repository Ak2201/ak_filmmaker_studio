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

/* 7 phone width, fresh load */
const phone = await ctx.newPage();
phone.on('pageerror', (e) => errors.push(e.message));
await phone.setViewportSize({ width: 390, height: 860 });
await phone.goto(url('breakdown.html#scenes'), { waitUntil: 'networkidle' });
await phone.waitForTimeout(300);
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
