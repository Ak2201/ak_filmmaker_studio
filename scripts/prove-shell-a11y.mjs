/* ============================================================
   prove:shell-a11y — the shell's and the public site's keyboard paths
   ------------------------------------------------------------
   Five bugs a QA pass found (26 Oct 2026), each invisible to verify:
     1. the account menu's "Help & shortcuts" closed the menu and opened
        nothing (the close handler detached the row before its own
        delegate() ran);
     2. the phone Go-to sheet on bare library.html left focus on the bar,
        outside the aria-modal sheet (its "here" row was a hidden shelf);
     3. the public site's hero video showed no focus ring (its player
        clips the outline);
     4. Tab from the open phone menu went into <main>, under the sheet;
     5. at 390 a control focused by Tab sat under the fixed bottom bar.
   Reads the OPEN build (dist-verify in CI), like prove:scroll.

   Run:  npm run build:open && PROVE_DIST=dist npm run prove:shell-a11y
   ============================================================ */
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5374;
if (!fs.existsSync(path.join(DIST, 'dashboard.html'))) { console.error(`✗ ${DIST} has no build; build first`); process.exit(2); }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.mp4': 'video/mp4', '.webm': 'video/webm', '.webp': 'image/webp', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another>`);
  process.exit(2);
});
const BASE = `http://localhost:${PORT}/`;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };
const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const errors = [];
async function ctxAt(width, height, extra = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', ...extra });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  return { ctx, page };
}

/* 1. account menu -> Help & shortcuts */
{
  const { ctx, page } = await ctxAt(1440, 900);
  for (const f of ['dashboard.html', 'breakdown.html']) {
    await page.goto(BASE + f, { waitUntil: 'networkidle' });
    await page.click('#studioRail .sh-rail-account');
    await page.waitForSelector('#shAcctMenu [data-action="rail-help"]');
    await page.click('#shAcctMenu [data-action="rail-help"]');
    const r = await page.evaluate(() => ({
      shown: !!document.querySelector('#shortcutSheet.show'),
      menu: !!document.getElementById('shAcctMenu')
    }));
    ok(r.shown && !r.menu, f + ': "Help & shortcuts" opens the shortcut sheet and closes the menu');
  }
  await ctx.close();
}

/* 2 + 5. phone: Go-to focus on library.html; focus clear of the bottom bar */
{
  const { ctx, page } = await ctxAt(390, 844, { isMobile: true, hasTouch: true });
  for (const f of ['library.html', 'library.html#films', 'index.html']) {
    await page.goto('about:blank');   // a hash-only change would keep the open sheet
    await page.goto(BASE + f, { waitUntil: 'networkidle' });
    await page.click('[data-mn-item="goto"]');
    await page.waitForSelector('.mn-overlay');
    await page.waitForTimeout(300);
    const r = await page.evaluate(() => {
      const a = document.activeElement;
      const ov = document.querySelector('.mn-overlay');
      return { inSheet: !!(ov && ov.contains(a)), hiddenHere: [...document.querySelectorAll('.mn-mod.is-here')].filter((x) => x.closest('[hidden],[data-pg-gone]')).length };
    });
    ok(r.inSheet, f + ': opening Go to moves focus into the sheet');
    ok(r.hiddenHere === 0, f + ': no hidden, switched-off row is marked as here');
  }
  for (const f of ['index.html', 'library.html']) {
    await page.goto(BASE + f, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts && document.fonts.ready);
    /* base.css scrolls smoothly, so a read right after Tab is mid-glide;
       an instant scroll honours the same scroll-padding and lands at once */
    await page.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });
    const covered = [];
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab');
      await page.waitForTimeout(50);
      const c = await page.evaluate(() => {
        const a = document.activeElement;
        const bar = document.querySelector('nav.mobile-actionbar');
        if (!a || a === document.body || !bar || bar.contains(a)) return null;
        const r = a.getBoundingClientRect();
        if (!r.height || r.height > innerHeight / 2) return null;
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return hit && bar.contains(hit) ? (a.textContent || a.tagName).trim().slice(0, 40) : null;
      });
      if (c) covered.push(c);
    }
    ok(covered.length === 0, f + ' @390: no Tab stop sits under the bottom bar [' + covered.join(' | ') + ']');
  }
  await ctx.close();
}

/* 3. hero video focus ring; 4. the phone menu keeps Tab */
{
  for (const [w, h] of [[1440, 900], [390, 844]]) {
    const { ctx, page } = await ctxAt(w, h);
    for (const f of ['start.html', 'product-story.html']) {
      await page.goto(BASE + f, { waitUntil: 'networkidle' });
      let found = false;
      for (let i = 0; i < 30 && !found; i++) {
        await page.keyboard.press('Tab');
        found = await page.evaluate(() => document.activeElement && document.activeElement.tagName === 'VIDEO');
      }
      if (!found) { ok(false, f + ' @' + w + ': a Tab stop reaches the hero video'); continue; }
      const ring = await page.evaluate(() => {
        const v = document.activeElement;
        const p = v.closest('.mk-player');
        const cs = p && getComputedStyle(p);
        return cs ? cs.outlineStyle + ' ' + cs.outlineWidth : 'no player';
      });
      ok(/^solid [1-9]/.test(ring), f + ' @' + w + ': the focused video\'s player draws a ring (' + ring + ')');
    }
    await ctx.close();
  }
  const { ctx, page } = await ctxAt(390, 844);
  for (const f of ['start.html', 'pricing.html']) {
    await page.goto(BASE + f, { waitUntil: 'networkidle' });
    await page.focus('#mkBurger');
    await page.keyboard.press('Enter');
    const stops = [];
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press('Tab');
      stops.push(await page.evaluate(() => {
        const a = document.activeElement;
        return a && (a.id === 'mkBurger' || !!a.closest('#mkNav'));
      }));
    }
    ok(stops.every(Boolean), f + ': Tab from the open phone menu stays in the menu [' + stops + ']');
  }
  await ctx.close();
}

await browser.close();
server.close();
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`\nprove:shell-a11y: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
