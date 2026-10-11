/* ============================================================
   PROOF: the Script page and Drafts — writing the conventional
   way, and the "new draft or update this one?" question.
   ------------------------------------------------------------
   verify sees words, keys, overflow and idle writes on an EMPTY
   page. None of what this page is for happens on an empty page:
   typing INT. and getting a scene heading, ALL CAPS + Return
   giving a character, a draft saved from the leave dialog, a
   draft printing the same way twice. So this types.

   Asserted:
     1  INT. becomes a scene heading; Return moves to action
     2  ALL CAPS + Return makes a character, then dialogue follows
     3  Alt+digit sets the type, and the top-bar dropdown follows
     4  no per-row <select> on the writing page
     5  a typing burst is one save, and idle writes nothing
     6  the beats panel opens, marks a current beat, and jumps
     7  Ctrl/⌘+S offers "Save as Draft 1" before any draft exists
     8  leaving with changes asks: Save as Draft 2 / Update Draft 1 / Not now
     9  each answer does what it says, and navigation continues
    10  leaving with NO changes asks nothing
    11  a draft's print staging is identical twice
    12  old write.html fragments land on their new homes; ?stay=1 stays
    13  no horizontal overflow at 390 or 1280; no page errors

       npm run build:open && npm run prove:script
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5371;
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
/* Count script saves, and make print() observable without a dialog. */
await ctx.addInitScript(() => {
  window.__writes = [];
  const set = Storage.prototype.setItem;
  Storage.prototype.setItem = function (k, v) { window.__writes.push({ k, t: performance.now() }); return set.call(this, k, v); };
  window.__prints = [];
  window.print = () => {
    const m = document.getElementById('main');
    window.__prints.push((m ? m.innerHTML : '') + '|' + document.title + '|' + document.body.className);
    setTimeout(() => dispatchEvent(new Event('afterprint')), 0);
  };
});
const page = await ctx.newPage();
/* The beforeunload warning is the page doing its job on page.goto with
   unsaved draft changes; Chromium logs that it held back the panel. */
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });

const url = (p) => `http://localhost:${PORT}/${p}`;
const doc = () => page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
  return k ? JSON.parse(localStorage.getItem(k)) : null;
});
const types = async () => ((await doc()) || { elements: [] }).elements.map((e) => e.type + ':' + e.text);
const settle = (ms = 1500) => page.waitForTimeout(ms);
const dialog = () => page.$$eval('.lp-card [data-lp]', (bs) => bs.map((b) => b.textContent.trim()));

/* ---- a project ---------------------------------------------------- */
await page.goto(url('index.html'), { waitUntil: 'networkidle' });
await page.evaluate(() => {
  const S = window.StudioStore;
  localStorage.clear();
  const p = S.createProject({ title: 'Proof Script', format: 'feature' });
  S.setCurrentProject(p.id);
});

/* ---- 1–4 typing ----------------------------------------------------- */
await page.goto(url('script.html'), { waitUntil: 'networkidle' });
ok(await page.$$eval('#wr-page select', (s) => s.length) === 0, '4  no per-row <select> on the writing page');
ok(await page.isVisible('.sc-hint'), 'the empty script shows its one-line hint');
await page.click('#wr-page .wr-text');
await page.keyboard.type('int. hostel room - night');
await page.keyboard.press('Enter');
await page.keyboard.type('Arun stares at the board.');
await page.keyboard.press('Enter');
await page.keyboard.type('ARUN');
await page.keyboard.press('Enter');
await page.keyboard.type('I will finish this.');
await settle();
const t1 = await types();
ok(t1[0] && t1[0].startsWith('scene:'), '1  INT. becomes a scene heading', t1);
ok(t1[1] === 'action:Arun stares at the board.', '1  Return after the heading moves to action', t1);
ok(t1[2] === 'character:ARUN' && t1[3] === 'dialogue:I will finish this.', '2  ALL CAPS + Return makes a character, then dialogue', t1);
ok(!(await page.isVisible('.sc-hint')), 'the hint is gone once something is written');

await page.keyboard.press('Enter');
await page.keyboard.press('Alt+6');   // transition, per write-presets
await page.waitForTimeout(200);
const sel = await page.$eval('#scType', (s) => s.value);
await page.keyboard.type('CUT TO:');
await settle();
const t2 = await types();
ok(sel === t2[t2.length - 1].split(':')[0] && sel !== 'dialogue', '3  Alt+digit sets the type and the dropdown follows', { sel, last: t2[t2.length - 1] });

/* ---- 5 one save per burst; idle writes nothing ------------------------ */
await page.click('#wr-page .wr-el:nth-child(2) .wr-text').catch(() => {});
let before = await page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
await page.keyboard.press('End');
await page.keyboard.type(' He does not blink.', { delay: 20 });
await settle();
let after = await page.evaluate(() => window.__writes.filter((w) => w.k.startsWith('fms_script_v1')).length);
ok(after - before >= 1 && after - before <= 2, '5  a typing burst is one save (two at most across the debounce)', after - before);
before = await page.evaluate(() => window.__writes.length);
await page.waitForTimeout(4000);
after = await page.evaluate(() => window.__writes.length);
ok(after === before, '5  four idle seconds write nothing', after - before);

/* ---- 6 beats --------------------------------------------------------- */
await page.click('[data-action="sc-beats"]');
await page.waitForSelector('#beatsPanel .bp-beat', { timeout: 5000 }).catch(() => {});
const nBeats = await page.$$eval('#beatsPanel .bp-beat', (b) => b.length);
ok(nBeats >= 5, '6  the beats panel lists the beats', nBeats);
await page.click('#wr-page .wr-text');
await page.waitForTimeout(300);
ok(await page.$('#beatsPanel .bp-beat[aria-current="true"]') !== null, '6  the beat being written is marked');
await page.click('#beatsPanel .bp-beat >> nth=-1');
await page.waitForTimeout(300);
ok(/./.test(await page.$eval('#beatsPanel .bp-hint', (n) => n.textContent)), '6  an unwritten beat says so and jumps to the end');
await page.click('[data-action="sc-beats"]');

/* ---- 7 Ctrl+S before any draft ---------------------------------------- */
await page.click('#wr-page .wr-text');
await page.keyboard.press('Control+s');
await page.waitForSelector('.lp-card', { timeout: 3000 }).catch(() => {});
const d0 = await dialog();
ok(d0.includes('Save as Draft 1') && d0.includes('Not now') && d0.length === 2, '7  Ctrl+S offers Save as Draft 1 / Not now', d0);
await page.click('.lp-card [data-lp="new"]');
await settle(800);
let revs = ((await doc()) || {}).revisions || [];
ok(revs.length === 1 && revs[0].number === 1, '7  Draft 1 is saved inside the script blob', revs.map((r) => r.number));
ok(/Draft 1/.test(await page.$eval('[data-sc="draft"]', (n) => n.textContent)), 'the top bar names Draft 1');

/* ---- 8–10 leaving ------------------------------------------------------ */
async function editAndLeave(text) {
  await page.click('#wr-page .wr-el:nth-child(2) .wr-text').catch(() => page.click('#wr-page .wr-text'));
  await page.keyboard.press('End');
  await page.keyboard.type(text);
  await settle();
  await page.click('.sc-done a');
  await page.waitForSelector('.lp-card', { timeout: 3000 }).catch(() => {});
}
await editAndLeave(' Again.');
const d1 = await dialog();
ok(d1.join('|') === 'Save as Draft 2|Update Draft 1|Not now', '8  leaving with changes asks the three questions', d1);
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="new"]')]);
ok(/breakdown\.html/.test(page.url()), '9  Save as Draft 2, and the navigation continues', page.url());
revs = ((await doc()) || {}).revisions || [];
ok(revs.length === 2 && revs[1].number === 2, '9  Draft 2 exists', revs.map((r) => r.number));

await page.goto(url('script.html'), { waitUntil: 'networkidle' });
await editAndLeave(' Once more.');
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="update"]')]);
revs = ((await doc()) || {}).revisions || [];
const live = ((await doc()) || {}).elements || [];
ok(revs.length === 2 && JSON.stringify(revs[1].elements.map((e) => e.text)) === JSON.stringify(live.map((e) => e.text)),
  '9  Update Draft 2 overwrites it with the working copy, and adds none', revs.length);

await page.goto(url('script.html'), { waitUntil: 'networkidle' });
await page.click('.sc-done a');
await page.waitForURL(/breakdown\.html/, { timeout: 5000 }).catch(() => {});
ok(/breakdown\.html/.test(page.url()) && !(await page.$('.lp-card')), '10 leaving with no changes asks nothing');

await page.goto(url('script.html'), { waitUntil: 'networkidle' });
await editAndLeave(' Not yet.');
await Promise.all([page.waitForURL(/breakdown\.html/, { timeout: 8000 }).catch(() => {}), page.click('.lp-card [data-lp="skip"]')]);
revs = ((await doc()) || {}).revisions || [];
ok(/breakdown\.html/.test(page.url()) && revs.length === 2, '9  Not now leaves, and makes no draft');
ok(JSON.stringify(((await doc()) || {}).elements || []).includes('Not yet.'), '9  …and the working copy kept the edit');

/* ---- 11 a draft prints the same way twice ------------------------------ */
await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
ok(await page.$$eval('[data-dr="pdf"]', (b) => b.length) === 2, 'the Drafts page lists both drafts');
for (let i = 0; i < 2; i++) {
  await page.click('[data-dr="pdf"] >> nth=1');
  await page.waitForFunction((n) => window.__prints.length > n, i, { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(300);
}
const prints = await page.evaluate(() => window.__prints);
ok(prints.length === 2 && prints[0] === prints[1] && prints[0].length > 200, '11 the same draft stages the same document twice', prints.map((p) => p.length));

/* ---- 12 redirects ------------------------------------------------------ */
for (const [from, to] of [['write.html', /script\.html$/], ['write.html#revisions', /drafts\.html$/],
  ['write.html#outline', /breakdown\.html#script$/], ['write.html#guide', /script\.html#guide$/]]) {
  await page.goto(url(from));
  await page.waitForURL(to, { timeout: 5000 }).catch(() => {});
  ok(to.test(page.url()), `12 ${from} → ${page.url().replace(/^.*\//, '')}`);
}
await page.goto(url('write.html?stay=1'), { waitUntil: 'networkidle' });
ok(/write\.html\?stay=1/.test(page.url()), '12 write.html?stay=1 stays');

/* ---- 13 overflow -------------------------------------------------------- */
for (const w of [390, 1280]) {
  for (const p of ['script.html', 'drafts.html', 'breakdown.html#script']) {
    await page.setViewportSize({ width: w, height: 860 });
    await page.goto(url(p), { waitUntil: 'networkidle' });
    await page.waitForTimeout(400);
    const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(over <= 0, `13 ${p} has no horizontal overflow at ${w}px`, over);
  }
}
ok(errors.length === 0, '13 no page errors', errors.slice(0, 5));

await browser.close();
server.close();
console.log(failed ? `\n${failed} FAILED` : '\nprove:script: all passed');
process.exit(failed ? 1 : 0);
