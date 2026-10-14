/* ============================================================
   PROOF: a browser walk of the revisions, coverage and costs screens
   (HANDOFF T9) — on the Dragon sample, at 390 and 1280, in both themes
   ------------------------------------------------------------
   Nothing else in the repo opens these screens with real content.
   verify sees an empty page; the Node tests read the models. This
   opens them and fails on a page error, a console error, a section
   that renders empty, or a horizontal overflow at 390px.

   Asserted, per viewport x theme:
     1  the Dragon sample opens (index.html?sample=1) with its script
     2  drafts.html: with two drafts, Compare produces a result
        (the Element.append(null) fix at write-revisions.js was
        never exercised before this)
     3  write.html?stay=1#coverage: the coverage section renders
     4  budget.html: each cost section (Petty cash, Cost report, Crew
        payments, Top sheet, Wage table, Export) renders, by hash
     5  no horizontal overflow on any of them at 390px
     6  no page errors and no console errors

       npm run build:open && npm run prove:walk
       PROVE_URL=http://localhost:5173 npm run prove:walk   (against `npm run dev`
         started with VITE_SITE_GATE=off)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const BASE = process.env.PROVE_URL ? process.env.PROVE_URL.replace(/\/$/, '') : null;
const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5374;
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

const COSTS = [['expenses', 'Petty cash'], ['actuals', 'Cost report'], ['crew', 'Crew payments'],
  ['topsheet', 'Top sheet'], ['wages', 'Wage table'], ['export', 'Export']];

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});

for (const width of [1280, 390]) {
  /* ONE theme since 14 Oct 2026. */
  for (const theme of ['dark']) {
    const tag = `${width}px ${theme}`;
    const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 } });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource|beforeunload/.test(m.text())) errors.push('console: ' + m.text()); });
    const setTheme = () => page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

    /* 1 — the sample */
    await page.goto(url('index.html?sample=1'), { waitUntil: 'networkidle' });
    await page.waitForFunction(() => window.StudioStore && window.StudioStore.listProjects().length > 0, null, { timeout: 30000 }).catch(() => {});
    await page.waitForFunction(() => Object.keys(localStorage).some((k) => k.startsWith('fms_script_v1')), null, { timeout: 30000 }).catch(() => {});
    const hasScript = await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
      const d = k ? JSON.parse(localStorage.getItem(k)) : null;
      return !!(d && d.elements && d.elements.length > 20);
    });
    ok(hasScript, `1  [${tag}] the Dragon sample opens with a script`);

    /* two drafts, so Compare has something to compare */
    await page.evaluate(() => {
      const k = Object.keys(localStorage).find((x) => x.startsWith('fms_script_v1'));
      const d = JSON.parse(localStorage.getItem(k));
      const snap = (name, edit) => ({
        id: 'rev_' + name, name, date: new Date().toISOString(),
        elements: d.elements.map((e, i) => ({ id: 'r' + name + i, liveId: e.id, type: e.type, text: edit && i === 3 ? e.text + ' (revised)' : e.text }))
      });
      d.revisions = [snap('First', false), snap('Second', true)];
      localStorage.setItem(k, JSON.stringify(d));
    });

    /* 2 — compare */
    await page.goto(url('drafts.html'), { waitUntil: 'networkidle' });
    await setTheme();
    const hasCompare = await page.$('[data-action="rev-compare"]');
    ok(!!hasCompare, `2  [${tag}] drafts.html shows the Compare tool`);
    if (hasCompare) {
      await page.selectOption('#wr-cmp-from', 'rev_First').catch(() => {});
      await page.selectOption('#wr-cmp-to', 'rev_Second').catch(() => {});
      await page.click('[data-action="rev-compare"]');
      await page.waitForTimeout(800);
      const out = await page.$eval('#wr-cmp-out', (e) => e.textContent.trim().length).catch(() => 0);
      ok(out > 0, `2  [${tag}] Compare produces a result`, out);
    }
    if (width === 390) ok((await overflow()) <= 1, `5  [${tag}] drafts.html does not overflow`, await overflow());

    /* 3 — coverage */
    await page.goto(url('write.html?stay=1#coverage'), { waitUntil: 'networkidle' });
    await setTheme();
    await page.waitForTimeout(600);
    const cov = await page.$eval('#coverage', (e) => ({ n: e.textContent.trim().length, hidden: e.hidden })).catch(() => null);
    ok(cov && cov.n > 40 && !cov.hidden, `3  [${tag}] the coverage section renders`, cov);
    if (width === 390) ok((await overflow()) <= 1, `5  [${tag}] write.html#coverage does not overflow`, await overflow());

    /* 4 — each cost section */
    for (const [id, label] of COSTS) {
      await page.goto(url('budget.html#' + id), { waitUntil: 'networkidle' });
      await setTheme();
      await page.waitForTimeout(400);
      const s = await page.$eval('#' + id, (e) => ({ n: e.textContent.trim().length, hidden: e.hidden })).catch(() => null);
      ok(s && s.n > 20 && !s.hidden, `4  [${tag}] budget.html#${id} (${label}) renders`, s);
      if (width === 390) ok((await overflow()) <= 1, `5  [${tag}] budget.html#${id} does not overflow`, await overflow());
    }

    ok(errors.length === 0, `6  [${tag}] no page or console errors`, errors.slice(0, 5));
    await ctx.close();
  }
}

await browser.close();
if (server) server.close();
console.log(failed ? `\n✗ walk: ${failed} failed` : '\n✓ walk: all checks pass');
process.exit(failed ? 1 : 0);
