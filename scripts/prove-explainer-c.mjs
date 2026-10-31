/* ============================================================
   PROOF (lane C): the other in-place explainers open the pop-up too
   ------------------------------------------------------------
   Owner, 29 Oct 2026: every "What is a …?" (src/ui/learn.js) opens as
   a pop-up — the kit modal at 721px and up, the phone's bottom sheet at
   720px and below (src/ui/explainer.js) — so the work never moves.

   Library term cards ("Tanglish, example, video", and a #term-… link),
   the budget's "Who can see this budget?", and a glossary term in
   blueprint prose each open the explainer; the page does not move;
   Escape closes and focus is back on the trigger; the old hover
   popover is gone; zero storage writes.

       npm run build:open && node scripts/prove-explainer-c.mjs
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
  console.error(`prove:explainer-c: no build at ${DIST} — run npm run build:open (or build:verify with PROVE_DIST=dist-verify)`);
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
    console.error(`prove:explainer-c: port ${PORT} is taken (${e.code}); set PROVE_PORT to a free one`);
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
    const P = Storage.prototype;
    const set = P.setItem; const rem = P.removeItem;
    P.setItem = function (k, v) { window.__writes.push('set ' + k); return set.call(this, k, v); };
    P.removeItem = function (k) { window.__writes.push('remove ' + k); return rem.call(this, k); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Explainer C proof', format: 'feature' });
    S.setCurrentProject(p.id);
    S.notify('projects:changed', { reason: 'test' });
  });
  const ready = async () => {
    await page.waitForSelector(DIALOG, { timeout: 8000 });
    await page.waitForFunction(() => { const b = document.querySelector('[data-explainer] .xp-body'); return b && !b.hasAttribute('aria-busy'); }, null, { timeout: 15000 });
    await page.waitForTimeout(300);
  };
  const title = () => page.evaluate((sel) => { const d = document.querySelector(sel); const l = d && document.getElementById(d.getAttribute('aria-labelledby')); return l ? l.textContent.trim() : (d && d.querySelector('h3, .mn-title') || {}).textContent; }, DIALOG);
  const closeCheck = async (label, trigSel) => {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    check(at + label + ': Escape closes it', await page.$$eval(OPEN, (d) => d.length), 0);
    check(at + label + ': focus is back on the trigger', await page.evaluate((s) => !!document.activeElement && document.activeElement.matches(s), trigSel), true);
  };

  /* library term card. Film Terminology is a switched-off shelf today
     (plan-gate OFF_BY_DEFAULT), so its section is a hidden tab: the
     cards are in the DOM and the button is pressed from script. */
  await page.goto(url('library.html'), { waitUntil: 'networkidle' });
  await page.waitForSelector('#libTerms .lib-term-open', { timeout: 15000, state: 'attached' });
  check(at + 'no <details> on a term card', await page.$$eval('#libTerms details', (d) => d.length), 0);
  const termName = await page.$eval('#libTerms .lib-term-open', (b) => b.closest('.lib-term').querySelector('.lib-term-name').firstChild.textContent.trim());
  await page.evaluate(() => { window.__writes.length = 0; });
  await page.$eval('#libTerms .lib-term-open', (b) => b.click());
  await ready();
  check(at + 'term card: the title is the term', await title(), termName);
  check(at + 'term card: it carries the definition', await page.$eval(DIALOG, (d) => !!d.querySelector('.learn-def') && /\bnull\b/.test(d.textContent) === false), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(at + 'term card: Escape closes it', await page.$$eval(OPEN, (d) => d.length), 0);

  /* a #term- fragment opens it, once */
  await page.evaluate(() => { location.hash = '#term-logline'; });
  await ready();
  check(at + 'fragment: #term-logline opens the pop-up titled logline', (await title() || '').toLowerCase(), 'logline');
  await page.waitForTimeout(500);
  check(at + 'fragment: opened once', await page.$$eval(OPEN, (d) => d.length), 1);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(at + 'fragment: closed, it does not reopen', await page.$$eval(OPEN, (d) => d.length), 0);

  /* budget */
  await page.goto(url('budget.html'), { waitUntil: 'networkidle' });
  await page.waitForSelector('.bud-who button', { timeout: 15000 });
  check(at + 'budget: no <details> in .bud-who', await page.$$eval('.bud-who details', (d) => d.length), 0);
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__writes.length = 0; });
  await page.click('.bud-who button');
  await ready();
  check(at + 'budget: the title is the question', await title(), 'Who can see this budget?');
  check(at + 'budget: the answer is in it', await page.$eval(DIALOG, (d) => /view-only link included/.test(d.textContent)), true);
  await closeCheck('budget', '.bud-who button');
  check(at + 'budget: zero storage writes while it opened and closed', await page.evaluate(() => window.__writes.slice()), []);

  /* glossary term in prose */
  await page.goto(url('feature.html?stay=1'), { waitUntil: 'networkidle' });
  await page.waitForSelector('.glossary-term', { timeout: 15000, state: 'attached' });
  check(at + 'glossary: no hover popover element', await page.$$eval('#glossaryPopover', (d) => d.length), 0);
  const gt = page.locator('.glossary-term:visible').first();
  await gt.scrollIntoViewIfNeeded();
  const gterm = await gt.getAttribute('data-glossary');
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__writes.length = 0; });
  await gt.hover();
  await page.waitForTimeout(300);
  check(at + 'glossary: hovering opens nothing', await page.$$eval(OPEN, (d) => d.length), 0);
  await gt.focus();
  await page.keyboard.press('Enter');
  await ready();
  check(at + 'glossary: Enter opens the pop-up titled with the term', (await title() || '').toLowerCase(), gterm);
  check(at + 'glossary: definition and Close are in it', await page.$eval(DIALOG, (d) => !!d.querySelector('.learn-def') && [...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Close')), true);
  await closeCheck('glossary', '.glossary-term');
  check(at + 'glossary: zero storage writes while it opened and closed', await page.evaluate(() => window.__writes.slice()), []);

  check(at + 'no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  check(at + 'no page errors', errors, []);
  await ctx.close();
}

try {
  await run(1440, 900);
  await run(390, 844);
} finally {
  await browser.close();
  server.close();
}
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall lane-C explainer checks passed');
process.exit(failed ? 1 : 0);
