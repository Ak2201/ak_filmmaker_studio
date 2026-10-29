/* ============================================================
   PROOF: a blueprint step's "Why this matters" opens as a pop-up
   ------------------------------------------------------------
   On feature.html at 1440 and 390: the box is a trigger (its words hidden
   on screen, kept for print), pressing it opens the explainer with the
   words in it, Escape closes it and focus returns, nothing storage-wise.

       npm run build:open && npm run prove:why-popup
       (PROVE_DIST picks the build, default dist — CI uses dist-verify;
        PROVE_PORT the port, default 5398; PW_CHROMIUM a Chromium)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5398;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'story.html'))) {
  console.error(`prove:why-popup: no build at ${DIST} — run npm run build:open (or build:verify with PROVE_DIST=dist-verify)`);
  process.exit(2);
}
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
/* our own server, or nothing: a port somebody else holds is THEIR server */
await new Promise((resolve) => {
  server.once('error', (e) => {
    console.error(`prove:why-popup: port ${PORT} is taken (${e.code}); set PROVE_PORT to a free one`);
    process.exit(2);
  });
  server.listen(PORT, resolve);
});

let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const url = (p) => `http://localhost:${PORT}/${p}`;
const OPEN = '[data-explainer]';
const DIALOG = '.xp-modal[role="dialog"], .mn-overlay[data-mn-sheet="explainer"][role="dialog"]';


async function run(width, height) {
  const at = width + 'px: ';
  const ctx = await browser.newContext({ viewport: { width, height } });
  await ctx.addInitScript(() => {
    window.__writes = [];
    const P = Storage.prototype; const set = P.setItem;
    P.setItem = function (k) { window.__writes.push(k); return set.apply(this, arguments); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const S = window.StudioStore; localStorage.clear();
    const p = S.createProject({ title: 'Why proof', format: 'feature' });
    S.setCurrentProject(p.id); S.notify('projects:changed', { reason: 'test' });
  });
  await page.goto(url('feature.html?stay=1'), { waitUntil: 'networkidle' });
  await page.waitForSelector('.why-pop .why-open', { state: 'attached', timeout: 15000 });
  await page.waitForTimeout(800);
  const trig = page.locator('.why-pop .why-open:visible').first();
  check(at + 'a Why-this-matters trigger shows', await trig.count(), 1);
  check(at + 'its words are not shown in place', await page.$$eval('.why-pop .why-body', (a) => a.every((e) => e.getClientRects().length === 0)), true);
  await trig.scrollIntoViewIfNeeded();
  const words = await trig.evaluate((b) => b.closest('.why-pop').querySelector('.why-body p').textContent.trim().slice(0, 40));
  const y0 = await trig.evaluate((b) => b.getBoundingClientRect().top);
  const w0 = await page.evaluate(() => window.__writes.length);
  await trig.click();
  await page.waitForSelector('[data-explainer]', { timeout: 8000 });
  await page.waitForTimeout(500);
  check(at + 'a dialog holds the words', await page.$eval('[data-explainer]', (d, w) => d.textContent.includes(w), words), true);
  check(at + 'the page did not move', Math.abs((await trig.evaluate((b) => b.getBoundingClientRect().top)) - y0) < 1, true);
  check(at + 'focus is inside', await page.evaluate(() => !!document.activeElement.closest('.xp-modal, .mn-overlay[data-mn-sheet="explainer"]')), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(500);
  check(at + 'Escape closes it', await page.$$eval('[data-explainer]', (d) => d.length), 0);
  check(at + 'focus is back on the trigger', await trig.evaluate((b) => b === document.activeElement), true);
  check(at + 'no storage writes', await page.evaluate((n) => window.__writes.length - n, w0), 0);
  check(at + 'no page errors', errors, []);
  await ctx.close();
}
await run(1440, 900);
await run(390, 844);
await browser.close();
server.close();
if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log('\nall why-popup checks passed');
