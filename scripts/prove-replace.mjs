/* ============================================================
   PROOF: find and replace in the screenplay
   (src/ui/script-replace-bar.js over src/lib/script-replace.js).
   ------------------------------------------------------------
   verify loads screenplay.html empty, where the bar has nothing to
   find, so this writes a short scene and drives the bar.

   Asserted:
     1  Ctrl/⌘+Shift+H from a line opens the bar with the field focused
     2  the Tools menu carries "Find and replace"
     3  the count reads "N of M" and the current line is marked
     4  next / previous step through the matches and wrap
     5  Replace changes the current match only
     6  Replace all keeps a cue in capitals, saves once, and offers Undo
     7  Undo puts every line back as it was
     8  Esc closes the bar, clears the marks and selects the match
     9  no element type and no id changes across all of it
    10  no horizontal overflow at 390 with the bar open; no page errors

       npm run build:open && npm run prove:replace
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5373;
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
const doc = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const lines = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.type + ':' + e.text);
const shape = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.id + ':' + e.type).join('|');
const count = () => page.$eval('.sc-find-count', (n) => n.textContent);
const scriptSaves = () => page.evaluate(() => window.__writes.filter((k) => k.startsWith('fms_script_v1')).length);

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Replace', format: 'feature' });
  S.setCurrentProject(p.id);
});
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await page.click('#wr-page .wr-text');
await page.keyboard.type('int. ravi\'s flat - night');
await page.keyboard.press('Enter');
await page.keyboard.type('Ravi paces. Ravindra watches Ravi.');
await page.keyboard.press('Enter');
await page.keyboard.type('RAVI');
await page.keyboard.press('Enter');
await page.keyboard.type('Leave it, Ravindra.');
await page.waitForTimeout(1200);
const shape0 = await shape();

/* 1 the shortcut, from a line */
await page.focus('#wr-page .wr-el:nth-child(2) .wr-text');
await page.keyboard.press('Control+Shift+H');
await page.waitForTimeout(150);
ok(await page.isVisible('#scFind'), '1  Ctrl+Shift+H opens the bar');
ok(await page.evaluate(() => document.activeElement && document.activeElement.id === 'scFindQ'), '1  the find field has focus');

/* 2 Tools menu */
ok(await page.$$eval('#scTop [data-action="sc-find"]', (b) => b.length) >= 1, '2  the Tools menu carries Find and replace');

/* 3 count and marks */
await page.fill('#scFindQ', 'ravi');
await page.waitForTimeout(100);
const c1 = await count();
ok(/^\d+ of 6$/.test(c1), '3  the count reads N of 6 (Ravindra included without Whole word)', c1);
await page.check('#scFindWord');
await page.waitForTimeout(100);
const c2 = await count();
ok(/^\d+ of 4$/.test(c2), '3  Whole word drops Ravindra: N of 4', c2);
ok(await page.$$eval('.wr-el.sc-find-cur', (r) => r.length) === 1, '3  exactly one current line is marked');
ok(await page.$$eval('.wr-el.sc-find-row', (r) => r.length) === 3, '3  three lines hold a match', await page.$$eval('.wr-el.sc-find-row', (r) => r.length));

/* 4 next / previous wrap */
const start = Number((await count()).split(' ')[0]);
for (let i = 0; i < 4; i++) await page.click('[data-action="sc-find-next"]');
ok(Number((await count()).split(' ')[0]) === start, '4  four steps forward over four matches lands where it started');
await page.click('[data-action="sc-find-prev"]');
ok(Number((await count()).split(' ')[0]) === ((start + 2) % 4) + 1, '4  previous steps back and wraps', await count());

/* 5 Replace one */
await page.fill('#scFindQ', 'Ravindra');
await page.uncheck('#scFindWord');
await page.fill('#scFindR', 'Mani');
await page.waitForTimeout(100);
await page.click('[data-action="sc-find-one"]');
await page.waitForTimeout(900);
const l5 = await lines();
ok(l5.filter((l) => l.includes('Mani')).length === 1 && l5.filter((l) => l.includes('Ravindra')).length === 1, '5  Replace changes one match only', l5);

/* 6 Replace all */
await page.fill('#scFindQ', 'ravi');
await page.check('#scFindWord');
await page.fill('#scFindR', 'Arun');
await page.waitForTimeout(400);
const saves0 = await scriptSaves();
await page.click('[data-action="sc-find-all"]');
await page.waitForTimeout(900);
const l6 = await lines();
ok(l6.some((l) => l === 'character:ARUN'), '6  the cue becomes ARUN, in capitals', l6);
ok(l6.some((l) => /^scene:INT\. ARUN'S FLAT/i.test(l)), '6  the heading is renamed', l6);
ok(l6.some((l) => l.startsWith('action:Arun paces.') && l.endsWith('watches Arun.')), '6  the action keeps mixed case', l6);
const saves1 = await scriptSaves();
ok(saves1 - saves0 >= 1 && saves1 - saves0 <= 2, '6  replace all is one save (two at most with the scene sync)', saves1 - saves0);
ok((await count()) === 'No matches', '6  the count says No matches afterwards', await count());
ok(await page.isVisible('.toast:has-text("Replaced") .toast-action'), '6  the toast offers Undo');

/* 7 Undo */
await page.click('.toast:has-text("Replaced") .toast-action');
await page.waitForTimeout(900);
const l7 = await lines();
ok(l7.some((l) => l === 'character:RAVI') && !l7.some((l) => /Arun|ARUN/.test(l)), '7  Undo puts every line back', l7);

/* 8 Esc */
await page.waitForTimeout(200);
await page.focus('#scFindQ');
await page.keyboard.press('Escape');
await page.waitForTimeout(150);
ok(!(await page.isVisible('#scFind')), '8  Esc closes the bar');
ok(await page.$$eval('.sc-find-row, .sc-find-cur', (r) => r.length) === 0, '8  the marks are cleared');
const sel = await page.evaluate(() => {
  const a = document.activeElement;
  return a && a.matches('.wr-text') ? a.value.slice(a.selectionStart, a.selectionEnd) : null;
});
ok(sel && sel.toLowerCase() === 'ravi', '8  the caret lands on the match with it selected', sel);

/* 9 shape */
ok((await shape()) === shape0, '9  no element type and no id changed', { before: shape0, after: await shape() });

/* 10 phone width. A fresh load at 390, not a resize: the band decides
   its phone layout at load (CLAUDE.md, "Known blind spot"), so a page
   resized from 1280 overflows by the band's width whatever the bar does. */
const phone = await ctx.newPage();
phone.on('pageerror', (e) => errors.push(e.message));
await phone.setViewportSize({ width: 390, height: 860 });
await phone.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
await phone.waitForTimeout(400);
/* Through the Tools menu item, which is what the phone's Tools sheet
   clicks. A held Ctrl on its own widens the band by 13px at 390 on
   this page today (Ctrl+Shift+S does it too; docs/KNOWN-ISSUES.md), and
   a phone has no Ctrl key, so the shortcut is proved at 1280 above. */
await phone.evaluate(() => document.querySelector('#scTop [data-action="sc-find"]').click());
await phone.waitForTimeout(300);
ok(await phone.isVisible('#scFind'), '10 the bar opens at 390');
await phone.fill('#scFindQ', 'ravi');
await phone.waitForTimeout(150);
const over = await phone.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
ok(over <= 0, '10 no horizontal overflow at 390 with the bar open', over);
ok(errors.length === 0, '10 no page errors', errors.slice(0, 5));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:replace: all passed');
process.exit(failed ? 1 : 0);
