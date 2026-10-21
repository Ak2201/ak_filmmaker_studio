/* ============================================================
   make:sample-pdf — the sample screenplay, as the PDF a writer gets
   ------------------------------------------------------------
   The launch study (docs/research/LAUNCH-SIM-2026-10-21-run2.md) asked
   for proof a person can check WITHOUT signing in: margins, pagination,
   (MORE)/(CONT'D), Tanglish dialogue. So this writes
   public/marketing/sample-screenplay.pdf from the product itself: it
   seeds the Dragon sample in an open build, opens the Screenplay
   Writer, presses Export PDF, and saves what that print job lays out.

   Nothing here typesets. The pages are the app's own — the button's
   before() builds them with screenplay-export.js buildDocument() and
   pdf.js stage() applies SETUPS.screenplay (US Letter, 1in / 1.5in) —
   and Chromium's PDF printer renders them, which is what "Save as PDF"
   in a person's browser does. If the export ever changes, re-run this.

   The sample's first two elements say it is pages written for this app
   (a teaching reconstruction; src/data/sample.dragon.script.json
   `_about`), so the PDF says what it is on page one.

   Env: SAMPLE_DIST  the build to drive (default dist-verify/: the open
                     build; a gated build walls a signed-out visitor)
        PW_CHROMIUM  a Chromium executable (optional)

       npm run build:verify && npm run make:sample-pdf
   ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { chromium } from 'playwright';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, process.env.SAMPLE_DIST || 'dist-verify');
const OUT = join(ROOT, 'public', 'marketing', 'sample-screenplay.pdf');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json' };

if (!existsSync(join(DIST, 'index.html'))) { console.error(DIST + ' is missing: run `npm run build:verify` first.'); process.exit(1); }
if (/name="fms-site-gate"[^>]*content="invite"|data-site-gate="invite"/.test(readFileSync(join(DIST, 'index.html'), 'utf8'))) {
  console.error(DIST + ' is the GATED build; build the open one (`npm run build:verify`).'); process.exit(1);
}

const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(DIST, p);
  if (!f.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
let failed = '';
try {
  /* seed the sample (its script lives in indexedDB `fms_overflow`) */
  const seed = await browser.newContext({ serviceWorkers: 'block' });
  const sp = await seed.newPage();
  await sp.goto(BASE + 'index.html?sample=1', { waitUntil: 'load' });
  await sp.waitForTimeout(3500);
  const storageState = await seed.storageState({ indexedDB: true });
  await seed.close();

  const ctx = await browser.newContext({ storageState, serviceWorkers: 'block' });
  /* window.print() becomes a flag, and pdf.js's 2s unstage timer is held
     until the PDF is written: the staged pages must still be in the DOM
     when Chromium prints them. */
  await ctx.addInitScript(() => {
    window.__held = [];
    window.print = () => { window.__printed = true; };
    const st = window.setTimeout.bind(window);
    window.setTimeout = (fn, ms, ...a) => (window.__printed && ms === 2000 ? (window.__held.push(fn), 0) : st(fn, ms, ...a));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + 'screenplay.html', { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-action="sc-pdf"]'), null, { timeout: 20000 });
  await page.waitForTimeout(1500);
  await page.evaluate(() => document.querySelector('[data-action="sc-pdf"]').click());
  await page.waitForFunction(() => window.__printed === true, null, { timeout: 20000 });
  await page.evaluate(() => document.fonts.ready);
  const pages = await page.evaluate(() => document.querySelectorAll('.sp-page, .pdf-page, [data-page]').length);
  mkdirSync(dirname(OUT), { recursive: true });
  await page.pdf({ path: OUT, preferCSSPageSize: true, printBackground: true });
  await page.evaluate(() => window.__held.forEach((fn) => fn()));
  const kb = Math.round(statSync(OUT).size / 1024);
  console.log(`wrote public/marketing/sample-screenplay.pdf (${kb} KB; ${pages} page elements staged)`);
  if (kb < 20) failed = 'the PDF is suspiciously small — the pages were probably not staged';
} catch (e) {
  failed = String(e.message || e).split('\n')[0];
} finally {
  await browser.close();
  server.close();
}
if (failed) { console.error('make:sample-pdf: ' + failed); process.exit(1); }
