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

/* 6. QA round 2 (public site and shell): focus kept in the account menu,
      the palette's scattered-letter matches, the dead #script links, the
      phone sheets, the 404 button, the pricing gap. */
{
  /* with the Dragon sample open, through the hub's own button */
  const { ctx, page } = await ctxAt(1440, 900);
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  const btn = await page.$('[data-action="sample-project"]');
  if (btn) {
    await btn.click();
    await page.waitForFunction(() => JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes?.length > 10, null, { timeout: 15000 }).catch(() => {});
  } else {
    await page.evaluate(() => { if (!StudioStore.currentProject()) StudioStore.createProject({ title: 'Proof', format: 'feature' }); });
  }
  await page.goto(BASE + 'dashboard.html', { waitUntil: 'networkidle' });

  /* a. Help & shortcuts: Escape returns focus to the Account button */
  await page.focus('#studioRail .sh-rail-account');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#shAcctMenu');
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#shortcutSheet.show');
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('sh-rail-account')),
    'Escape on the shortcut sheet (opened from the account menu) returns focus to the Account button');

  /* b. Tab and Shift+Tab close the menu; Home and End move inside it */
  await page.focus('#studioRail .sh-rail-account');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#shAcctMenu');
  await page.keyboard.press('End');
  const last = await page.evaluate(() => { const i = [...document.querySelectorAll('#shAcctMenu .sh-acct-item')]; return i.indexOf(document.activeElement) === i.length - 1; });
  await page.keyboard.press('Home');
  const firstRow = await page.evaluate(() => document.activeElement === document.querySelector('#shAcctMenu .sh-acct-item'));
  ok(last && firstRow, 'End and Home go to the last and first rows of the account menu');
  await page.keyboard.press('Shift+Tab');
  ok(await page.evaluate(() => !document.getElementById('shAcctMenu')), 'Shift+Tab from the account menu closes it (focus never lands under an open menu)');
  await page.focus('#studioRail .sh-rail-account');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#shAcctMenu');
  await page.keyboard.press('Tab');
  ok(await page.evaluate(() => !document.getElementById('shAcctMenu')), 'Tab from the account menu closes it');

  /* c. palette: scattered letters do not match; a tight abbreviation does */
  const rows = async (q) => {
    await page.keyboard.press('Escape');
    await page.evaluate(() => StudioUI.openPalette());
    await page.waitForSelector('.pal-row, .pal-empty, [class*=pal]');
    await page.keyboard.type(q);
    await page.waitForTimeout(250);
    return page.evaluate(() => [...document.querySelectorAll('.pal-row')].map((r) => (r.querySelector('.pal-row-group') || {}).textContent + '|' + (r.querySelector('.pal-row-label') || {}).textContent));
  };
  const pr = await rows('pricing');
  ok(!pr.some((r) => /^(Scenes|Places)\|/i.test(r)), 'palette "pricing" matches no scene or place by scattered letters (' + pr.slice(0, 3).join('; ') + ')');
  const sb = await rows('sbd');
  ok(sb.some((r) => /stripboard/i.test(r)), 'palette "sbd" still finds Stripboard');

  /* d. a character hit and the Go to Screenplay Analysis link open the analysis tab */
  await page.keyboard.press('Escape');
  await page.goto(BASE + 'dashboard.html', { waitUntil: 'networkidle' });
  await rows('anbu');
  const hasChar = await page.evaluate(() => !!document.querySelector('.pal-row'));
  if (hasChar) {
    await page.keyboard.press('Enter');
    await page.waitForTimeout(800);
    ok(/screenplay(\.html)?#analysis$/.test(page.url()), 'a palette character hit opens screenplay.html#analysis (' + page.url().replace(BASE, '') + ')');
  } else ok(true, 'no character in this state (skipped)');
  await page.goto(BASE + 'screenplay.html', { waitUntil: 'networkidle' });
  const href = await page.evaluate(() => (document.querySelector('.sc-done a') || {}).getAttribute?.('href'));
  ok(href === 'screenplay.html#analysis', 'the "Go to Screenplay Analysis" link points at the Script analysis tab (' + href + ')');
  await page.goto(BASE + 'write.html#characters', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  ok(/screenplay(\.html)?#analysis$/.test(page.url()), 'an old write.html#characters link lands on the Script analysis tab (' + page.url().replace(BASE, '') + ')');

  /* e. the library's search door says what it searches */
  await page.goto(BASE + 'library.html', { waitUntil: 'networkidle' });
  const door = await page.evaluate(() => (document.querySelector('.lib-search') || {}).textContent || '');
  ok(/studio/i.test(door) && !/directors/i.test(door), 'the library search door is labelled for the studio palette (' + door.trim() + ')');
  /* The 28 Oct 2026 copy pass rewrote the cover without the word
     "craft-book"; the claim this guards against is the second half. */
  ok(!/mapped to every step/i.test(await page.evaluate(() => document.body.innerText)), 'the library cover no longer claims the watch list covers every step');
  await ctx.close();
}
{
  /* phone: Go to lists the Dashboard on a global page; one heading for the account control */
  const { ctx, page } = await ctxAt(390, 844, { isMobile: true, hasTouch: true });
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  const sb = await page.$('[data-action="sample-project"]');
  if (sb) { await sb.click(); await page.waitForTimeout(2500); }
  await page.goto(BASE + 'library.html', { waitUntil: 'networkidle' });
  await page.click('[data-mn-item="goto"]');
  await page.waitForSelector('.mn-overlay');
  ok(await page.evaluate(() => [...document.querySelectorAll('.mn-overlay .mn-global')].some((a) => /dashboard/.test(a.getAttribute('href') || ''))), 'phone Go to on library.html lists the Dashboard');
  const heads = [];
  for (const f of ['index.html', 'library.html', 'dashboard.html']) {
    await page.goto('about:blank');
    await page.goto(BASE + f, { waitUntil: 'networkidle' });
    await page.click('[data-mn-item="tools"]');
    await page.waitForSelector('.mn-overlay');
    heads.push(await page.evaluate(() => { const g = [...document.querySelectorAll('.mn-tools-group')].find((x) => x.querySelector('#signInPill')); return g ? g.querySelector('.mn-group-h').textContent : 'none'; }));
  }
  ok(heads.every((x) => x === 'Account'), 'the sign-in control carries the heading "Account" on every page [' + heads + ']');
  /* the phone Tools sheet on a module page: "How this works" once, no bare chip */
  await page.goto('about:blank');
  await page.goto(BASE + 'story.html', { waitUntil: 'networkidle' });
  await page.click('[data-mn-item="tools"]');
  await page.waitForSelector('.mn-overlay');
  await page.waitForTimeout(800);
  const how = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length > 0;
    const g = document.querySelector('.mn-tools-group');
    return { chip: [...document.querySelectorAll('.mn-tools-group .vid-help-more')].filter(vis).length,
      how: [...document.querySelectorAll('.mn-tools-group button, .mn-tools-group a')].filter((e) => vis(e) && /how this works/i.test(e.textContent + ' ' + (e.getAttribute('aria-label') || ''))).length, g: !!g };
  });
  /* the chip only mounts when a module has approved videos, so probe the rule itself */
  const chipDisplay = await page.evaluate(() => {
    const g = document.querySelector('.mn-tools-group'); const c = document.createElement('button'); c.className = 'vid-help-more';
    g.append(c); const d = getComputedStyle(c).display; c.remove(); return d;
  });
  ok(chipDisplay === 'none', 'phone Tools sheet: a .vid-help-more chip is never drawn (' + chipDisplay + ')');
  ok(how.chip === 0 && how.how <= 1, 'phone Tools sheet: no bare overflow chip, "How this works" at most once (chip ' + how.chip + ', how ' + how.how + ')');
  await page.keyboard.press('Escape');
  /* Go to sub-rows meet the 44px floor on touch */
  await page.click('[data-mn-item="goto"]');
  await page.waitForSelector('.mn-overlay .mn-mod.is-sub');
  const subH = await page.evaluate(() => Math.min(...[...document.querySelectorAll('.mn-sheet .mn-mod.is-sub')].filter((e) => e.getClientRects().length).map((e) => e.getBoundingClientRect().height)));
  ok(subH >= 44, 'Go to sub-rows are at least 44px tall on touch (' + Math.round(subH) + 'px)');
  /* the project pill: the accessible name carries the visible text */
  const pill = await page.evaluate(() => { const b = document.querySelector('.ps-btn'); return b && { name: b.getAttribute('aria-label') || '', text: b.querySelector('.ps-title').textContent }; });
  ok(pill && pill.name.toLowerCase().includes(pill.text.toLowerCase()), 'project pill: aria-label contains the visible text (' + JSON.stringify(pill) + ')');
  await page.goto(BASE + 'pricing.html', { waitUntil: 'networkidle' });
  await page.click('#mkBurger');
  const pr = await page.evaluate(() => { const l = document.querySelector('#mkNav .mk-nav-pricing').getBoundingClientRect(); return { bottom: l.bottom, vh: innerHeight }; });
  ok(pr.bottom <= pr.vh, 'pricing at 390: Pricing is visible in the open menu without scrolling (bottom ' + Math.round(pr.bottom) + ' of ' + pr.vh + ')');
  await page.goto(BASE + 'pricing.html', { waitUntil: 'networkidle' });
  /* The trial card became the launch-pass strip (§61), drawn only while a
     pass is on sale: measure the lede against whatever follows it on the page. */
  const gap = await page.evaluate(() => {
    const l = document.querySelector('.pr-lede');
    let n = l.parentElement.nextElementSibling;
    while (n && !n.getClientRects().length) n = n.nextElementSibling;
    return { px: n ? n.getBoundingClientRect().top - l.getBoundingClientRect().bottom : null, next: n ? n.className : null };
  });
  ok(gap.px !== null && gap.px >= 16, 'pricing at 390: the lede and the block after it (' + gap.next + ') have room between them (' + Math.round(gap.px) + 'px)');
  await ctx.close();
}
ok(/href="about\.html"[^>]*>About /.test(fs.readFileSync(path.join(DIST, '404.html'), 'utf8')), "the 404 page's About button opens about.html");

/* 7. the Product menu is reachable by a real mouse path (hover gap + re-enter cancelled nothing) */
for (const w of [1440, 1100]) {
  const { ctx, page } = await ctxAt(w, 900);
  await page.goto(BASE + 'start.html', { waitUntil: 'networkidle' });
  const tb = await page.locator('#mkProd').boundingBox();
  await page.mouse.move(tb.x + tb.width / 2, tb.y + tb.height / 2);
  await page.waitForSelector('.mk-nav-item[data-open]', { timeout: 2000 }).catch(() => {});
  const links = page.locator('.mk-mega a[href]');
  const n = await links.count();
  const target = links.nth(n > 3 ? 3 : n - 1);
  const lb = await target.boundingBox();
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2, { steps: 25 });
  await page.waitForTimeout(500);
  ok(await page.locator('.mk-nav-item[data-open]').count() === 1, `${w}: Product panel stays open while the pointer travels to an item`);
  const href = await target.getAttribute('href');
  await Promise.all([page.waitForURL((u) => u.pathname !== '/start' && u.pathname !== '/start.html', { timeout: 5000 }).catch(() => {}), page.mouse.click(lb.x + lb.width / 2, lb.y + lb.height / 2)]);
  ok(!/start(\.html)?$/.test(new URL(page.url()).pathname) || /#/.test(href || ''), `${w}: clicking the item navigates (${href})`);
  await page.goto(BASE + 'start.html', { waitUntil: 'networkidle' });
  await page.focus('#mkProd'); await page.keyboard.press('ArrowDown');
  ok(await page.evaluate(() => !!document.activeElement.closest('.mk-mega')), `${w}: ArrowDown moves focus into the panel`);
  await page.keyboard.press('Escape');
  ok(await page.evaluate(() => document.activeElement.id === 'mkProd') && await page.locator('.mk-nav-item[data-open]').count() === 0, `${w}: Escape closes and returns focus`);
  await ctx.close();
}

await browser.close();
server.close();
ok(errors.length === 0, 'no page errors' + (errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''));
console.log(`\nprove:shell-a11y: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
