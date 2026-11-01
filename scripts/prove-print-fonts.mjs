/* ============================================================
   PROOF: a staged call sheet prints in the app's own faces only
   ------------------------------------------------------------
   lib/pdf.js used to call window.print() in the same tick it staged
   the document. A staged sheet was display:none a moment before, so
   the glyph-fallback faces (Rupee / Glyph Fallback, unicode-range) and
   the Latin-ext subsets had never been laid out and print rasterised
   ≈ ▾ ₹ in whatever system face the browser found (DejaVu Sans).
   exportPDF() now loads the faces the staged text needs first.

   This clicks the real "PDF" button on a call sheet that also carries
   ≈ ▾ ₹ ▶ ✓, stubs window.print to take the moment print would have
   run, writes a print-media PDF from there and lists its fonts with
   pdffonts. Every embedded font must be Gabarito, Onest, a Noto subset,
   Catamaran or Courier Prime. It also asserts that print() was NOT
   called before the faces were usable.

   Run:  npm run build:open && npm run prove:print-fonts
         PROVE_PORT (5381), PROVE_DIST (dist), PW_CHROMIUM=<path>
   Needs `pdffonts` (poppler-utils); without it it checks document.fonts.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5381;
const BASE = `http://localhost:${PORT}/`;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another>`); process.exit(2);
});

const ALLOWED = /Gabarito|Onest|Noto|Catamaran|Courier|Rupee|Glyph/i;
let failed = 0;
const check = (ok, msg) => { console.log((ok ? '✓ ' : '✗ ') + msg); if (!ok) failed++; };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await ctx.addInitScript(() => { try { localStorage.setItem('fms_region_v1', 'IN'); } catch (e) { /* private mode */ } });
const page = await ctx.newPage();
await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
const sample = await page.$('[data-action="sample-project"]');
if (sample) await sample.click(); else await page.evaluate(() => StudioStore.createProject({ title: 'Print', format: 'feature' }));
await page.waitForTimeout(2500);
await page.goto(BASE + 'contacts.html?day=3#call-sheets', { waitUntil: 'networkidle' });
await page.waitForTimeout(600);
await page.click('[data-action="sheet-add"] >> visible=true');
await page.waitForTimeout(800);

/* the glyphs the fonts file names, in the sheet itself */
await page.evaluate(() => {
  const card = document.querySelector('.ct-sheet .ct-doc') || document.querySelector('.ct-sheet');
  const p = document.createElement('p');
  p.id = 'pf-probe'; p.textContent = '≈ 3 days ▾ ₹ 5,000 ▶ ● ✱';
  card.append(p);
  window.__pf = null;
  /* keep the document staged: pdf.js unstages 2s after print() */
  const st = window.setTimeout.bind(window);
  window.setTimeout = (f, t, ...a) => (t === 2000 ? 0 : st(f, t, ...a));
  window.print = () => {
    const bad = [...'≈▾₹▶●✱'].filter((c) => !document.fonts.check("16px Onest, 'Rupee Fallback', 'Glyph Fallback'", c));
    window.__pf = { bad, usable: !bad.length, t: Math.round(performance.now() - window.__t0), st: [...document.fonts].filter((f) => /Fallback/.test(f.family) && f.status !== 'unloaded').map((f) => f.family + ' ' + f.weight + ' ' + f.status) };
  };
});
await page.evaluate(() => { window.__t0 = performance.now(); });
await page.$eval('.ct-sheet [data-action="sheet-pdf"]', (b) => b.click());
await page.waitForFunction(() => window.__pf, null, { timeout: 8000 });
const pf = await page.evaluate(() => window.__pf);
console.log('  print after ' + pf.t + 'ms; faces: ' + pf.st.join(' | '));
check(pf.usable, 'print() ran only once the faces for ≈ ▾ ₹ ▶ ● ✱ were usable' + (pf.bad.length ? ' (not ready: ' + pf.bad.join(' ') + ')' : ''));

await page.emulateMedia({ media: 'print' });
const out = path.join(os.tmpdir(), `fms-print-fonts-${process.pid}.pdf`);
await page.pdf({ path: out, preferCSSPageSize: true, printBackground: true });
let listing = '';
try { listing = execFileSync('pdffonts', [out], { encoding: 'utf8' }); } catch (e) { listing = ''; }
if (listing) {
  const names = listing.split('\n').slice(2).map((l) => l.trim().split(/\s+/)[0]).filter(Boolean);
  console.log('  fonts: ' + names.join(', '));
  check(names.length > 0, 'the PDF embeds fonts');
  const bad = names.filter((n) => !ALLOWED.test(n));
  check(!bad.length, 'no system font in the PDF' + (bad.length ? ' (' + bad.join(', ') + ')' : ''));
} else {
  console.log('  pdffonts unavailable; checking document.fonts only');
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family));
  check(loaded.some((f) => /Fallback/.test(f)), 'a fallback face loaded');
}
if (process.env.PROVE_KEEP) console.log('  kept ' + out); else fs.rmSync(out, { force: true });
await browser.close();
server.close();
console.log(failed ? `\n${failed} failed` : '\nprint fonts: all passed');
process.exit(failed ? 1 : 0);
