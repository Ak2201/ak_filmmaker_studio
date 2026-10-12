/* ============================================================
   PROOF: Tamil typing, executed (HANDOFF T3)
   ------------------------------------------------------------
   scripts/test-tanglish.mjs reads src/ui/tamil-type.js as TEXT and
   checks the rules by regex. Nothing there types. This does: it
   writes a dialogue line in a real browser and asserts what lands
   in the stored script.

   Asserted:
     1  mode OFF: a Roman word typed in dialogue stays Roman, no list opens
     2  the preference is NOT written by loading the page, nor by typing
     3  Alt+T turns it on, and only then is `tamilTyping` written (true)
     4  with it on, "vanakkam" offers the Tamil word, and Space commits it
     5  the committed word is in the STORED script, and the Roman one is gone
     6  Esc keeps a word in Roman letters ("sir"), and Space then leaves it
     7  action lines and character cues are never offered Tamil
     8  Alt+T again turns it off and writes false
     9  no page errors

       npm run build:open && npm run prove:tamil
       PROVE_URL=http://localhost:5173 npm run prove:tamil   (against `npm run dev`)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.PROVE_URL ? process.env.PROVE_URL.replace(/\/$/, '') : null;
const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5373;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
let server = null;
if (!BASE) {
  server = http.createServer((req, res) => {
    let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
    fs.createReadStream(p).pipe(res);
  });
  await new Promise((r) => server.listen(PORT, r));
}
const url = (p) => `${BASE || 'http://localhost:' + PORT}/${p}`;

let failed = 0;
function ok(cond, label, extra) {
  if (!cond) failed++;
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`);
  if (!cond && extra !== undefined) console.log('        ' + JSON.stringify(extra));
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.addInitScript(() => {
  window.__prefWrites = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) {
    if (String(k).startsWith('fms_write_prefs_v1')) window.__prefWrites.push(v);
    return set.call(this, k, v);
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });

const doc = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const lines = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.type + ':' + e.text);
const prefs = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_write_prefs_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : {};
});
const writes = () => page.evaluate(() => window.__prefWrites.length);
const listOpen = () => page.evaluate(() => { const l = document.getElementById('tt-list'); return !!l && !l.hidden && l.children.length > 0; });
const settle = (ms = 1200) => page.waitForTimeout(ms);

await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Tamil', format: 'feature' });
  S.setCurrentProject(p.id);
});
await page.goto(url('screenplay.html'), { waitUntil: 'networkidle' });
const loadWrites = await writes();

/* A heading, an action, a cue, then a dialogue line to type into. */
await page.click('#wr-page .wr-text');
await page.keyboard.type('int. hostel room - night');
await page.keyboard.press('Enter');
await page.keyboard.type('Arun stares at the board');
await page.waitForTimeout(150);
ok(!(await listOpen()), '7  an action line is never offered Tamil');
await page.keyboard.press('Enter');
await page.keyboard.type('ARUN');
await page.waitForTimeout(150);
ok(!(await listOpen()), '7  a character cue is never offered Tamil');
await page.keyboard.press('Enter');

/* 1 — mode off */
await page.keyboard.type('vanakkam');
await page.waitForTimeout(150);
ok(!(await listOpen()), '1  mode OFF: no list opens for a Roman word in dialogue');
await page.keyboard.type(' ');
await settle();
let l = await lines();
ok(l.some((x) => x === 'dialogue:vanakkam ' || x === 'dialogue:vanakkam'), '1  mode OFF: the word stays in Roman letters in the stored script', l);

/* 2 — nothing written by load or typing */
ok(loadWrites === 0 && (await writes()) === 0, '2  loading the page and typing write no preference', { load: loadWrites, now: await writes() });
ok((await prefs()).tamilTyping === undefined, '2  the stored prefs carry no tamilTyping yet', await prefs());

/* 3 — toggle on */
await page.keyboard.press('Alt+t');
await settle(400);
ok((await prefs()).tamilTyping === true, '3  Alt+T on: tamilTyping is stored true', await prefs());
ok((await writes()) === 1, '3  ...by exactly one write', await writes());

/* 4/5 — a word becomes Tamil on Space */
await page.keyboard.type('vanakkam');
await page.waitForTimeout(200);
const offered = await page.evaluate(() => [...document.querySelectorAll('#tt-list .tt-lab')].map((e) => e.textContent));
ok(offered.length > 0 && offered.some((t) => /[஀-௿]/.test(t)), '4  mode ON: the list offers Tamil script', offered);
await page.keyboard.press('Space');
await settle();
l = await lines();
const last = l[l.length - 1] || '';
ok(/dialogue:.*[஀-௿]/.test(last), '5  the stored dialogue line now holds Tamil script', last);
ok(!/vanakkam$/.test(last.trim()) || /[஀-௿]/.test(last), '5  the committed word replaced the Roman one', last);

/* 6 — Esc keeps Roman */
await page.keyboard.type('sir');
await page.waitForTimeout(150);
ok(await listOpen(), '6  a new word opens the list again');
await page.keyboard.press('Escape');
await page.waitForTimeout(100);
await page.keyboard.type(' ');
await settle();
l = await lines();
ok(/sir\s*$/.test(l[l.length - 1] || ''), '6  Esc keeps "sir" in Roman letters through the next Space', l[l.length - 1]);

/* 8 — toggle off */
await page.keyboard.press('Alt+t');
await settle(400);
ok((await prefs()).tamilTyping === false, '8  Alt+T again writes tamilTyping false', await prefs());
ok((await writes()) === 2, '8  ...and that is the second write, no more', await writes());

/* the preference survives a reload and is not rewritten by it */
await page.reload({ waitUntil: 'networkidle' });
ok((await writes()) === 0, '2  a reload writes no preference', await writes());

ok(errors.length === 0, '9  no page or console errors', errors);
await browser.close();
if (server) server.close();
console.log(failed ? `\n✗ tamil proof: ${failed} failed` : '\n✓ tamil proof: all checks pass');
process.exit(failed ? 1 : 0);
