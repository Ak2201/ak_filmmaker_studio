/* ============================================================
   PROOF: an explainer opens OVER the page, never inside it
   ------------------------------------------------------------
   Owner, 29 Oct 2026: every "What is a …?" (src/ui/learn.js) opens as
   a pop-up — the kit modal at 721px and up, the phone's bottom sheet at
   720px and below (src/ui/explainer.js) — so the work never moves.

   On story.html with a project, at 1440 and at 390:
     - the first learn trigger is a button with aria-haspopup="dialog";
     - pressing it opens a dialog (the kit modal / the sheet) with the
       trigger's question as its title, and the definition in it;
     - focus moves inside; Tab and Shift+Tab stay inside;
     - Escape closes it, and focus is back on the trigger;
     - nothing on the page moved (main's first child, the trigger) and
       nothing expanded inline (no <details class="learn">, the document
       is no taller);
     - text in it meets 4.5:1; it does not overflow at 390;
     - zero localStorage writes while it is open and closed.
   The Close button closes it too.

       npm run build:open && npm run prove:explainer
       (PROVE_DIST picks the build, default dist — CI uses dist-verify;
        PROVE_PORT the port, default 5397; PW_CHROMIUM a Chromium)
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const DIST = path.resolve(process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5397;
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
if (!fs.existsSync(path.join(DIST, 'story.html'))) {
  console.error(`prove:explainer: no build at ${DIST} — run npm run build:open (or build:verify with PROVE_DIST=dist-verify)`);
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
    console.error(`prove:explainer: port ${PORT} is taken (${e.code}); set PROVE_PORT to a free one`);
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
  /* count every storage write, under the store's own patch */
  await ctx.addInitScript(() => {
    window.__writes = [];
    const P = Storage.prototype;
    const set = P.setItem; const rem = P.removeItem; const clr = P.clear;
    P.setItem = function (k, v) { window.__writes.push('set ' + k); return set.call(this, k, v); };
    P.removeItem = function (k) { window.__writes.push('remove ' + k); return rem.call(this, k); };
    P.clear = function () { window.__writes.push('clear'); return clr.call(this); };
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });

  await page.goto(url('index.html'), { waitUntil: 'networkidle' });
  await page.evaluate(() => {
    const S = window.StudioStore;
    localStorage.clear();
    const p = S.createProject({ title: 'Explainer proof', format: 'feature' });
    S.setCurrentProject(p.id);
    S.notify('projects:changed', { reason: 'test' });
  });
  await page.goto(url('story.html#path-idea'), { waitUntil: 'networkidle' });
  await page.waitForSelector('main > section.st-step', { timeout: 15000, state: 'attached' });
  await page.waitForTimeout(1200);

  const trig = page.locator('main .learn-q:visible').first();
  check(at + 'a learn trigger is on the page', await trig.count(), 1);
  if (!(await trig.count())) {
    console.log('        on the page:', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.learn, [data-learn]')].slice(0, 2).map((e) => { let a = e; while (a && a.getClientRects().length === 0 && a.parentElement && a.parentElement.getClientRects().length === 0) a = a.parentElement; return e.dataset.learn + ' hidden at ' + (a && a.outerHTML.slice(0, 160)); })).catch(() => [])), errors);
    await ctx.close(); return;
  }
  check(at + 'it is a button that says it opens a dialog', await trig.evaluate((b) => [b.tagName, b.getAttribute('aria-haspopup'), b.getAttribute('type')]), ['BUTTON', 'dialog', 'button']);
  check(at + 'no learn <details> is left on the page', await page.$$eval('details.learn, .learn-body', (d) => d.length), 0);
  await trig.scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);

  const where = () => page.evaluate(() => {
    const first = document.querySelector('main') && document.querySelector('main').firstElementChild;
    const t = document.querySelector('main .learn-q');
    const doc = (el) => el ? Math.round(el.getBoundingClientRect().top + scrollY) : null;
    return { first: doc(first), trigger: doc(t), height: document.documentElement.scrollHeight, scroll: Math.round(scrollY) };
  });
  const before = await where();
  const question = (await trig.textContent()).trim();
  await page.evaluate(() => { window.__writes.length = 0; });

  await trig.click();
  await page.waitForSelector(DIALOG, { timeout: 8000 });
  await page.waitForFunction(() => {
    const b = document.querySelector('[data-explainer] .xp-body');
    return b && !b.hasAttribute('aria-busy');
  }, null, { timeout: 15000 });
  await page.waitForTimeout(400);

  const kind = await page.evaluate(() => (document.querySelector('.xp-modal[role="dialog"]') ? 'modal' : document.querySelector('.mn-overlay[data-mn-sheet="explainer"]') ? 'sheet' : 'none'));
  check(at + 'the frame is the ' + (width > 720 ? 'kit modal' : 'bottom sheet'), kind, width > 720 ? 'modal' : 'sheet');
  const info = await page.evaluate((sel) => {
    const d = document.querySelector(sel);
    const lab = d && document.getElementById(d.getAttribute('aria-labelledby'));
    return {
      modal: d && d.getAttribute('aria-modal'),
      title: lab ? lab.textContent.trim() : null,
      def: !!(d && d.querySelector('.learn-def') && d.querySelector('.learn-def').textContent.trim().length > 20),
      why: !!(d && d.querySelector('.learn-why')),
      close: !!(d && [...d.querySelectorAll('button')].some((b) => b.textContent.trim() === 'Close')),
      videos: d ? d.querySelectorAll('.vid-facade, .vid-block [data-yt], .vid-block button').length <= 4 : false,
      nullText: d ? /\bnull\b/.test(d.textContent) : true,
      focusInside: !!(d && d.contains(document.activeElement))
    };
  }, DIALOG);
  check(at + 'aria-modal is set', info.modal, 'true');
  check(at + 'the title is the question', info.title, question);
  check(at + 'the definition is in it', info.def, true);
  check(at + '"Why it matters" is in it', info.why, true);
  check(at + 'it has a Close button', info.close, true);
  check(at + 'at most two videos', info.videos, true);
  check(at + 'no "null" printed', info.nullText, false);
  check(at + 'focus moved inside', info.focusInside, true);

  let outside = 0;
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    if (!(await page.evaluate((sel) => !!document.querySelector(sel).contains(document.activeElement), DIALOG))) outside++;
  }
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press('Shift+Tab');
    if (!(await page.evaluate((sel) => !!document.querySelector(sel).contains(document.activeElement), DIALOG))) outside++;
  }
  check(at + 'Tab and Shift+Tab stay inside', outside, 0);

  const aa = await page.evaluate((sel) => {
    const root = document.querySelector(sel);
    const parse = (c) => {
      let m = c.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)/);
      if (m) return [+m[1] / 255, +m[2] / 255, +m[3] / 255, m[4] == null ? 1 : +m[4]];
      m = c.match(/^color\(srgb ([\d.e-]+) ([\d.e-]+) ([\d.e-]+)(?: \/ ([\d.]+))?\)/);
      if (m) return [+m[1], +m[2], +m[3], m[4] == null ? 1 : +m[4]];
      return null;
    };
    const lum = ([r, g, b]) => {
      const f = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
    };
    const bgOf = (el) => {
      for (let e = el; e; e = e.parentElement) {
        const c = parse(getComputedStyle(e).backgroundColor);
        if (c && c[3] >= 0.99) return c;
      }
      return [1, 1, 1, 1];
    };
    const bad = [];
    let n = 0;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    while (walk.nextNode()) {
      const t = walk.currentNode;
      if (!t.textContent.trim()) continue;
      const el = t.parentElement;
      if (!el.getClientRects().length || el.closest('.sym, [aria-hidden="true"]')) continue;
      const fg = parse(getComputedStyle(el).color);
      if (!fg) continue;
      const bg = bgOf(el);
      const mix = fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
      const [a, b] = [lum(mix), lum(bg)].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      n++;
      if (ratio < 4.5) bad.push(t.textContent.trim().slice(0, 30) + ' ' + ratio.toFixed(2));
    }
    return { n, bad };
  }, DIALOG);
  check(at + 'every text in it meets 4.5:1 (' + aa.n + ' measured)', aa.bad, []);
  check(at + 'no horizontal overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);

  const during = await where();
  check(at + 'nothing on the page moved while it is open', { first: during.first, trigger: during.trigger, height: during.height }, { first: before.first, trigger: before.trigger, height: before.height });

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(at + 'Escape closes it', await page.$$eval(OPEN, (d) => d.length), 0);
  check(at + 'focus is back on the trigger', await page.evaluate(() => document.activeElement && document.activeElement.matches('main .learn-q')), true);
  const after = await where();
  check(at + 'nothing moved after closing', after, before);

  /* again, closed with the Close button */
  await trig.click();
  await page.waitForSelector(DIALOG, { timeout: 8000 });
  await page.locator('[data-explainer] button', { hasText: /^Close$/ }).click();
  await page.waitForTimeout(400);
  check(at + 'the Close button closes it', await page.$$eval(OPEN, (d) => d.length), 0);
  check(at + 'focus is back on the trigger after Close', await page.evaluate(() => document.activeElement && document.activeElement.matches('main .learn-q')), true);

  /* the frame LISTENS to the width: crossing 720px while open moves the
     same body into the other frame, and it still closes cleanly */
  await trig.click();
  await page.waitForSelector(DIALOG, { timeout: 8000 });
  const other = width > 720 ? { width: 390, height: 844 } : { width: 1440, height: 900 };
  await page.setViewportSize(other);
  await page.waitForTimeout(600);
  const kind2 = await page.evaluate(() => (document.querySelector('.xp-modal[role="dialog"]') ? 'modal' : document.querySelector('.mn-overlay[data-mn-sheet="explainer"]') ? 'sheet' : 'none'));
  check(at + 'resized across 720px while open, it becomes the ' + (width > 720 ? 'sheet' : 'modal'), [kind2, await page.$$eval(OPEN, (d) => d.length)], [width > 720 ? 'sheet' : 'modal', 1]);
  check(at + 'focus is still inside after the switch', await page.evaluate((sel) => !!document.querySelector(sel) && document.querySelector(sel).contains(document.activeElement), DIALOG), true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check(at + 'and Escape still closes it', await page.$$eval(OPEN, (d) => d.length), 0);
  await page.setViewportSize({ width, height: width > 720 ? 900 : 844 });

  check(at + 'zero localStorage writes while it opened and closed', await page.evaluate(() => window.__writes.slice()), []);
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
console.log(failed ? `\n${failed} check(s) FAILED` : '\nall explainer checks passed');
process.exit(failed ? 1 : 0);
