/* ============================================================
   prove:legal — the three legal pages sit inside the window
   ------------------------------------------------------------
   privacy.html, terms.html and refund.html wear the public site's frame
   (a FIXED header and a contents column beside the text). Two bugs
   shipped with that on 20 Oct 2026 and no check saw them:

     - the title started underneath the fixed header, and
     - the two-column grid was wider than a laptop window and, centred,
       spilled the contents column past the LEFT edge, where no scrollbar
       reaches. prove:scroll's sideways-scroll check could not see a
       spill to the left.

   So, at each width, for each page: nothing scrolls sideways, no element
   starts left of x=0 or ends past the right edge, the <h1> starts below
   the header, and the sticky contents column (where shown) is inside the
   window, and the phone menu button's icon actually shows (the icon font
   reaches a page only when its <html> carries data-fms-marketing). Reads the OPEN build (dist-verify in CI), like prove:scroll.

   Run:  npm run build:verify && PROVE_DIST=dist-verify npm run prove:legal
         PW_CHROMIUM=<path> for a Chromium other than Playwright's own.
   ============================================================ */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5373;
const PAGES = ['privacy.html', 'terms.html', 'refund.html'];
const WIDTHS = [[1440, 900], [1280, 800], [1100, 800], [1024, 768], [390, 844]];

for (const p of PAGES) {
  if (!fs.existsSync(path.join(DIST, p))) { console.error(`✗ ${path.relative(ROOT, DIST)}/${p} is missing; build first`); process.exit(2); }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another> npm run prove:legal`);
  process.exit(2);
});

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ✗ ' + m); } };

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
for (const [width, height] of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  for (const f of PAGES) {
    await page.goto(`http://localhost:${PORT}/${f}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const m = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const out = [];
      for (const el of document.querySelectorAll('body *')) {
        const cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden' || cs.position === 'fixed' && el.closest('.mk-skip')) continue;
        if (el.closest('.mk-skip, .mk-mega, .mk-sentinel, details:not([open]) > :not(summary)')) continue;
        const r = el.getBoundingClientRect();
        if (!r.width || !r.height) continue;
        if (r.left < -0.5 || r.right > vw + 0.5) out.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ')[0] : ''} ${Math.round(r.left)}..${Math.round(r.right)}`);
      }
      const head = document.querySelector('.mk-top').getBoundingClientRect();
      const h1 = document.querySelector('main h1').getBoundingClientRect();
      const toc = document.querySelector('.legal-toc');
      const tocShown = toc && getComputedStyle(toc).display !== 'none';
      const burger = document.querySelector('.mk-burger');
      const burgerShown = burger && getComputedStyle(burger).display !== 'none';
      const burgerSym = burger && burger.querySelector('.sym');
      return {
        burgerShown, burgerVisible: burgerShown && document.documentElement.classList.contains('sym-ready') && getComputedStyle(burgerSym).visibility === 'visible',
        scroll: document.documentElement.scrollWidth - vw,
        outside: out.slice(0, 5), outsideN: out.length,
        h1Gap: Math.round(h1.top - head.bottom),
        tocShown, tocLeft: tocShown ? Math.round(toc.getBoundingClientRect().left) : null
      };
    });
    const tag = `${f} @${width}`;
    ok(m.scroll <= 0, `${tag}: scrolls sideways by ${m.scroll}px`);
    ok(m.outsideN === 0, `${tag}: ${m.outsideN} element(s) outside the window, e.g. ${m.outside.join(', ')}`);
    ok(!m.burgerShown || m.burgerVisible, `${tag}: the phone menu button's icon never appears (no icon font, or sym-ready never set)`);
    ok(m.h1Gap >= 0, `${tag}: the title starts ${-m.h1Gap}px under the fixed header`);
    ok(width < 1100 ? !m.tocShown : (m.tocShown && m.tocLeft >= 0), `${tag}: contents column ${width < 1100 ? 'should be the disclosure here' : 'missing or off the left edge (' + m.tocLeft + ')'}`);
  }
  ok(errors.length === 0, `@${width}: page errors: ${errors.join(' | ')}`);
  await ctx.close();
}
await browser.close(); server.close();
console.log(`${fail ? '✗' : '✓'} prove:legal: ${pass} passed, ${fail} failed (${PAGES.length} pages × ${WIDTHS.length} widths)`);
process.exit(fail ? 1 : 0);
