/* ============================================================
   prove:script-structure — the Screenplay Writer's L6 tools, in Chromium
   ------------------------------------------------------------
   Against the built app (PROVE_DIST, default dist; build:open first):
     1  the scene navigator reorders a scene with Alt+↓: the whole block
        moves, ids survive, ONE undo puts it back;
     2  a drag in the navigator moves a scene;
     3  fold: the body rows hide, the heading stays, the arrows step over
        a fold, a jump into the scene opens it, find opens every fold,
        and the blob never sees a fold;
     4  split view: a second pane at 1280px, an edit there reaches the
        model and the main page, an edit on the main page reaches it;
        off under 1100px;
     5  Statistics opens with real pages and the scene count;
     6  Drafts › Compare › Side by side draws two columns;
     7  no page errors, and nothing written while idle.

       PW_CHROMIUM=… PROVE_PORT=… node scripts/prove-script-structure.mjs
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5377;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json'
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
const ok = (c, label, extra) => {
  if (!c) failed++;
  console.log(`${c ? 'PASS' : 'FAIL'}  ${label}`);
  if (!c && extra !== undefined) console.log('        ' + JSON.stringify(extra));
};

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push({ k, t: performance.now() }); return set.call(this, k, v); };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });
const url = (p) => `http://localhost:${PORT}/${p}`;
const settle = (ms = 900) => page.waitForTimeout(ms);
const blob = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const ids = async () => ((await blob()) || { elements: [] }).elements.map((e) => e.id);

const E = (id, type, text) => ({ id, type, text });
const ELEMENTS = [
  E('h1', 'scene', 'INT. KITCHEN - DAY'), E('a1', 'action', 'Ravi cooks.'),
  E('h2', 'scene', 'EXT. STREET - NIGHT'), E('c2', 'character', 'MEERA'), E('d2', 'dialogue', 'Come out, Ravi.'),
  E('h3', 'scene', 'INT. CAR - DAWN'), E('a3', 'action', 'They drive in silence.'),
  E('h4', 'scene', 'EXT. ROOFTOP - NIGHT'), E('a4', 'action', 'The city below.')
];

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate((els) => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Structure', format: 'feature' });
  S.setCurrentProject(p.id);
  localStorage.setItem('fms_script_v1', JSON.stringify({ elements: els, revisions: [], notes: [] }));
}, ELEMENTS);

await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await settle(1200);
ok((await page.$$('#wr-page [data-el]')).length === ELEMENTS.length, 'the seeded script is on the page');

/* ---- 1 reorder by keyboard ---------------------------------------- */
await page.click('[data-el="a1"] .wr-text');
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.wk-nav');
await page.keyboard.press('ArrowDown');           // active: scene 2
await page.keyboard.press('Alt+ArrowDown');       // scene 2 → place 3
await settle();
const afterKey = await ids();
ok(afterKey.join() === 'h1,a1,h3,a3,h2,c2,d2,h4,a4', '1  Alt+↓ moves the whole scene block', afterKey);
ok(/Moved/.test(await page.textContent('.wk-nav .wk-note')), '1  the navigator says where it went');
await page.keyboard.press('Escape');
await page.click('[data-el="a1"] .wr-text');
await page.keyboard.press('Control+z');
await settle();
ok((await ids()).join() === ELEMENTS.map((e) => e.id).join(), '1  one undo puts the scene back', await ids());

/* ---- 2 reorder by drag -------------------------------------------- */
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.wk-nav li');
const items = await page.$$('.wk-nav li');
const from = await items[3].boundingBox();
const to = await items[0].boundingBox();
await page.mouse.move(from.x + 20, from.y + from.height / 2);
await page.mouse.down();
await page.mouse.move(from.x + 20, from.y - 10, { steps: 4 });
await page.mouse.move(to.x + 20, to.y + 3, { steps: 6 });
await page.mouse.up();
await settle();
const afterDrag = await ids();
ok(afterDrag.slice(0, 2).join() === 'h4,a4' && afterDrag.length === ELEMENTS.length, '2  a drag moves scene 4 to the top', afterDrag);
await page.keyboard.press('Escape');
await page.click('[data-el="a1"] .wr-text');
await page.keyboard.press('Control+z');
await settle();

/* ---- 3 fold ----------------------------------------------------------- */
await page.click('[data-el="c2"] .wr-text');
await page.click('[data-el="h2"] .wr-text');
await page.evaluate(() => document.querySelector('[data-action="sc-fold"]').click());
await settle(300);
const hid = await page.evaluate(() => ['c2', 'd2', 'h2'].map((id) => document.querySelector('[data-el="' + id + '"]').hidden));
ok(hid.join() === 'true,true,false', '3  fold hides the body, keeps the heading', hid);
ok(await page.evaluate(() => /lines folded/.test(document.querySelector('[data-el="h2"]').dataset.folded || '')), '3  the heading says how much is folded');
await page.keyboard.press('End');
await page.keyboard.press('ArrowDown');
ok(await page.evaluate(() => document.activeElement.closest('[data-el]').dataset.el) === 'h3', '3  ↓ from a folded heading steps over the fold');
const b = await blob();
ok(!JSON.stringify(b).includes('fold'), '3  the script blob holds no fold');
await page.keyboard.press('Control+Shift+S');
await page.waitForSelector('.wk-nav li');
ok(/folded/.test(await page.textContent('.wk-nav li:nth-child(2)')), '3  the navigator marks the folded scene');
await page.keyboard.press('Escape');
await page.evaluate(() => document.querySelector('[data-action="sc-fold-all"]').click());
await settle(300);
ok(await page.evaluate(() => document.querySelectorAll('#wr-page [data-el][hidden]').length) >= 4, '3  fold all hides every body');
await page.keyboard.press('Control+Shift+H');
await settle(300);
ok(await page.evaluate(() => document.querySelectorAll('#wr-page [data-el][hidden]').length) === 0, '3  find opens every fold');
await page.keyboard.press('Escape');

/* ---- 4 split view ----------------------------------------------------- */
await page.evaluate(() => document.querySelector('[data-action="sc-split"]').click());
await page.waitForSelector('.sc-split .sc-split-text');
ok(await page.isVisible('.sc-split'), '4  the second pane is shown at 1280px');
const twoCols = await page.evaluate(() => {
  const a = document.getElementById('wr-page').getBoundingClientRect();
  const s = document.querySelector('.sc-split').getBoundingClientRect();
  return s.left >= a.right - 1 && document.documentElement.scrollWidth <= innerWidth;
});
ok(twoCols, '4  side by side, no sideways scroll');
await page.click('.sc-split [data-split-el="a3"] .sc-split-text');
await page.keyboard.press('End');
await page.keyboard.type(' Fast.');
await settle(1200);
ok(((await blob()).elements.find((e) => e.id === 'a3') || {}).text === 'They drive in silence. Fast.', '4  an edit in the second pane is saved');
ok(await page.inputValue('[data-el="a3"] .wr-text') === 'They drive in silence. Fast.', '4  and shows in the main page at once');
await page.click('[data-el="a4"] .wr-text');
await page.keyboard.press('End');
await page.keyboard.type(' Lights.');
ok(await page.inputValue('.sc-split [data-split-el="a4"] .sc-split-text') === 'The city below. Lights.', '4  a main-page edit shows in the second pane');
await page.setViewportSize({ width: 1000, height: 900 });
await settle(300);
ok(!(await page.$('.sc-split')), '4  under 1100px the split closes');
await page.setViewportSize({ width: 1280, height: 900 });

/* ---- 5 statistics ----------------------------------------------------- */
/* Reached with a MOUSE through the ⋯ menu, in a short window: the menu is
   taller than 720px, and it used to run off the bottom with the wheel
   scrolling the page (and the sticky bar and the menu with it), so
   Statistics could not be clicked at all (QA r3 B-1). The panel now caps
   to the room below its button and scrolls inside itself. */
await page.setViewportSize({ width: 1280, height: 720 });
await settle(300);
await page.evaluate(() => [...document.querySelectorAll('#scTop .tb-menu')]
  .find((m) => m.querySelector('[data-action="sc-stats"]')).querySelector('.tb-menu-btn').click());
await settle(200);
const menuBox = await page.evaluate(() => {
  const p = document.querySelector('#scTop .tb-menu-panel:not([hidden])');
  const r = p.getBoundingClientRect();
  return { bottom: Math.round(r.bottom), vh: innerHeight, scrolls: p.scrollHeight > p.clientHeight };
});
ok(menuBox.bottom <= menuBox.vh && menuBox.scrolls, '5  the ⋯ menu fits the window and scrolls inside itself', menuBox);
let statsClicked = true;
try { await page.click('[data-action="sc-stats"]', { timeout: 3000 }); } catch (e) { statsClicked = false; }
ok(statsClicked, '5  Statistics, the last Tools item, takes a real mouse click at 1280x720');
if (!statsClicked) await page.evaluate(() => document.querySelector('[data-action="sc-stats"]').click());
await page.setViewportSize({ width: 1280, height: 900 });
await page.waitForSelector('.sst-facts');
const facts = await page.$$eval('.sst-facts dd', (d) => d.map((x) => x.textContent));
ok(facts[2] === '4', '5  Statistics counts the scenes', facts);
ok(/^\d+$/.test(facts[1]), '5  pages are the paginator’s', facts);
ok((await page.$$('.sst-long li')).length > 0, '5  longest scenes listed');
await page.keyboard.press('Escape');

/* ---- 7 idle ------------------------------------------------------------ */
await settle(1500);
await page.evaluate(() => { document.activeElement && document.activeElement.blur && document.activeElement.blur(); window.__writes = []; });
await page.waitForTimeout(4000);
const idle = await page.evaluate(() => window.__writes.length);
ok(idle === 0, '7  nothing written in 4s of idle', idle);

/* ---- 6 drafts compare side by side ------------------------------------ */
await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  const d = JSON.parse(localStorage.getItem(k));
  d.revisions = [{ id: 'r1', name: 'Draft 1', date: new Date().toISOString(), elements: d.elements.map((e) => ({ ...e, liveId: e.id, text: e.id === 'a1' ? 'Ravi burns the toast.' : e.text })) }];
  localStorage.setItem(k, JSON.stringify(d));
});
await page.reload({ waitUntil: 'networkidle' });
await settle(800);
const cmpBtn = await page.$('[data-action="rev-compare"]');
if (cmpBtn) {
  await page.evaluate(() => document.querySelector('[data-action="rev-compare"]').click());
  await page.waitForSelector('#wr-cmp-out .wr-cmp-scene', { timeout: 5000 }).catch(() => {});
  await page.evaluate(() => document.querySelector('[data-rt-layout="side"]').click());
  await settle(200);
  ok((await page.$$('#wr-cmp-out .wr-cmp-side .wr-cmp-srow.is-changed')).length >= 1, '6  side by side draws the changed line in two columns');
} else ok(false, '6  the Compare panel is on drafts.html', await page.evaluate(() => ({ html: (document.getElementById('dr-compare') || {}).outerHTML, app: document.getElementById('app') && document.getElementById('app').textContent.slice(0, 300) })));

ok(errors.length === 0, '   no page errors', errors.slice(0, 5));
await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : '\nall passed');
process.exit(failed ? 1 : 0);
