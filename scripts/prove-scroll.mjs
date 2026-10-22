/* ============================================================
   PROOF: every page scrolls the way a page should
   ------------------------------------------------------------
   Owner, 19 Oct 2026: "there are scrolling issues in a few pages;
   analyse all the pages and fix them." Nothing in the gate looked at
   scrolling as such: verify measures horizontal overflow at 390px and
   fragment landings on a list of hrefs, and that is all. So this loads
   EVERY root page (studio and public; not the arunak-* stubs, 404 or
   the dev-only kit) from the build, with the Dragon sample open so the
   long states exist, at 1440x900, 1100x800 and 390x844 — each viewport
   set at context creation, so matchMedia decides at load as a phone
   does — and asserts, per load:

     nested    no element other than the document is a vertical scroll
               container that holds the page's content (main, or a box
               inside main at least 60% of the viewport each way) while
               it actually overflows: that is a second scrollbar, and
               a wheel over it scrolls one and not the other
     bottom    scrolled to the end, the last visible thing in <main>
               (and the footer, when there is one) sits fully above
               every fixed or bottom-sticky element that overlaps it
               horizontally — the phone's bottom bar, a status bar, a
               pinned action bar — and above the viewport's edge
     hscroll   the document is no wider than the viewport
     locked    at rest (no modal, no sheet open) neither <html> nor
               <body> computes overflow-y hidden/clip while the page is
               taller than the viewport: a scroll lock left on
     sticky    each sticky element whose container is still in view
               after a scroll to the middle is AT its sticky offset —
               a sticky that scrolls away has an overflow ancestor
     fragment  for up to three section ids per page, location.hash =
               id lands the target below the pinned chrome and inside
               the viewport (the tab strip's own panels included)
     chain     an overflowing scroll box inside fixed/sticky chrome —
               a side menu, a rail, a flyout — has overscroll-behavior
               contain, or a wheel at its end scrolls the page under it
     jump      the document's height does not change by more than a
               viewport (and 15%) while it is scrolled through
     wheel     a real mouse wheel over the content, the side menu and
               the band moves the page (reported under "chain")
     overlays  each bottom-bar sheet and the palette, opened and closed:
               reachable inside, and no lock left behind ("locked")
     tall      no fixed or sticky box that does NOT scroll itself is
               taller than the room it is pinned in, with focusable
               content past the viewport's edge (unreachable)

   Run:  npm run build:open && npm run prove:scroll
         PROVE_PORT (default 5371), PROVE_DIST (default dist),
         PROVE_ONLY=a.html,b.html to probe a few pages,
         PROVE_STATE=sample (default) | empty | none — what is open,
         PROVE_WIDTHS=1024x768,768x1024 for other viewports,
         PROVE_SHOTS=<dir> to keep a screenshot per load,
         PW_CHROMIUM=<path> for a Chromium other than Playwright's own.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist');
const PORT = Number(process.env.PROVE_PORT) || 5371;
const BASE = `http://localhost:${PORT}/`;
/* PROVE_WIDTHS=1024x768,768x1024 probes other viewports */
const WIDTHS = process.env.PROVE_WIDTHS
  ? process.env.PROVE_WIDTHS.split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { width: w, height: h || 800 }; })
  : [{ width: 1440, height: 900 }, { width: 1100, height: 800 }, { width: 390, height: 844 }];
const CONCURRENCY = Number(process.env.PROVE_CONCURRENCY) || 4;
const SHOTS = process.env.PROVE_SHOTS || '';

/* ---- the open build, or nothing ------------------------------- */
{
  const idx = path.join(DIST, 'index.html');
  const stamp = fs.existsSync(idx) ? (fs.readFileSync(idx, 'utf8').match(/<meta name="fms-site-gate" content="([a-z]+)"/) || [])[1] : null;
  if (stamp !== 'off') {
    console.error(`✗ ${path.relative(ROOT, DIST)}/ was built with the site gate ${stamp ? 'ON' : 'unstamped'}; this proof loads pages signed out.`);
    console.error('  Build it with:  npm run build:open');
    process.exit(2);
  }
}

/* ---- every page: derived from what was built, not listed ------ */
const SKIP = /^(arunak-.*|404|kit)\.html$/;
let PAGES = fs.readdirSync(DIST).filter((f) => f.endsWith('.html') && !SKIP.test(f)).sort();
if (process.env.PROVE_ONLY) {
  const only = new Set(process.env.PROVE_ONLY.split(',').map((s) => s.trim()));
  PAGES = PAGES.filter((p) => only.has(p));
}

/* ---- a static server for the build ---------------------------- */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain',
  '.webp': 'image/webp', '.jpg': 'image/jpeg', '.mp4': 'video/mp4', '.webm': 'video/webm'
};
const server = http.createServer((req, res) => {
  let p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p) && fs.existsSync(p + '.html')) p += '.html';
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
await new Promise((r, j) => { server.once('error', j); server.listen(PORT, r); }).catch((e) => {
  console.error(`✗ port ${PORT}: ${e.code || e.message}. Use PROVE_PORT=<another> npm run prove:scroll`);
  process.exit(2);
});

const browser = await chromium.launch(process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {});
const PIN = () => { try { localStorage.setItem('fms_region_v1', 'IN'); } catch (e) { /* private mode */ } };

/* The Dragon sample, through the hub's own button (as verify does), so
   the scene table, the stripboard and the reports are LONG — a short
   page has no scrolling to get wrong. Falls back to an empty project. */
let seeded;
{
  const ctx = await browser.newContext({ viewport: WIDTHS[0] });
  await ctx.addInitScript(PIN);
  const page = await ctx.newPage();
  await page.goto(BASE + 'index.html', { waitUntil: 'networkidle' });
  let sample = false;
  const STATE = process.env.PROVE_STATE || 'sample';   // sample | empty | none
  const btn = STATE === 'sample' ? await page.$('[data-action="sample-project"]') : null;
  if (btn) {
    await btn.click();
    sample = await page.waitForFunction(() => {
      const S = window.StudioStore; const p = S && S.currentProject();
      return !!p && JSON.parse(localStorage.getItem('fms_scenes_v1') || '{}').scenes?.length > 10;
    }, null, { timeout: 15000 }).then(() => true, () => false);
  }
  if (!sample && STATE !== 'none') {
    await page.evaluate(() => {
      if (window.StudioStore && !StudioStore.currentProject()) StudioStore.createProject({ title: 'Verification', format: 'feature' });
    });
  }
  await page.waitForTimeout(600);
  console.log(`state: ${sample ? 'the Dragon sample' : STATE === 'none' ? 'no project' : 'an empty project'}`);
  /* indexedDB too: a long screenplay lives in the overflow tier, and
     without it every later context opens the sample with an empty script */
  seeded = await ctx.storageState({ indexedDB: true });
  await ctx.close();
}

/* ---- the measurements, run inside the page -------------------- */
const probe = async () => {
  const vw = document.documentElement.clientWidth;
  const vh = window.innerHeight;
  const de = document.documentElement;
  const main = document.querySelector('main') || document.body;
  const findings = [];
  const add = (kind, msg) => findings.push({ kind, msg });
  const visible = (el) => {
    if (!el || !el.isConnected) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || Number(cs.opacity) <= 0.01) return false;
    /* inside a closed <details>, under content-visibility: hidden */
    if (el.checkVisibility && !el.checkVisibility({ contentVisibilityAuto: false, opacityProperty: true, visibilityProperty: true })) return false;
    const shut = el.closest('details:not([open])');
    if (shut && !el.closest('summary')) return false;
    /* clipped away by an ancestor (a collapsed accordion, a carousel) is
       not visible, however large its own box */
    for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) {
      const acs = getComputedStyle(a);
      if (acs.overflowX === 'visible' && acs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.bottom <= ar.top + 1 || r.top >= ar.bottom - 1 || r.right <= ar.left + 1 || r.left >= ar.right - 1) return false;
    }
    return true;
  };
  const name = (el) => {
    if (!el || el === document) return '?';
    if (el === de) return 'html';
    let s = el.tagName.toLowerCase();
    if (el.id) s += '#' + el.id;
    const cls = [...el.classList].slice(0, 3);
    if (cls.length) s += '.' + cls.join('.');
    return s;
  };
  const scrollsY = (cs) => /(auto|scroll|overlay)/.test(cs.overflowY);
  /* An open overlay legitimately locks the page; nothing should be
     open at rest, and if something is, the lock is reported with it. */
  const openOverlay = [...document.querySelectorAll('dialog[open], [aria-modal="true"], [role="dialog"]')].find((el) => {
    if (el.hidden) return false;
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01 && r.width > 1 && r.height > 1;
  });
  const all = [...document.querySelectorAll('body *')];
  const tall = de.scrollHeight > vh + 4;
  const h0 = de.scrollHeight;

  /* hscroll */
  if (de.scrollWidth > vw + 1) {
    const wide = all.filter((el) => { const r = el.getBoundingClientRect(); return r.right > vw + 1 && r.width > 0 && visible(el); })
      .sort((a, b) => b.getBoundingClientRect().right - a.getBoundingClientRect().right)[0];
    add('hscroll', `document ${de.scrollWidth}px in a ${vw}px viewport (widest: ${name(wide)})`);
  }

  /* locked */
  for (const el of [de, document.body]) {
    const cs = getComputedStyle(el);
    if (/(hidden|clip)/.test(cs.overflowY) && tall && !openOverlay) add('locked', `${name(el)} overflow-y: ${cs.overflowY} at rest on a ${de.scrollHeight}px page`);
  }
  if (openOverlay) add('locked', `an overlay is open at rest: ${name(openOverlay)}`);

  /* nested */
  const mainR = main.getBoundingClientRect();
  for (const el of all) {
    if (el.matches('textarea, select, input, pre, code, table *, [contenteditable]')) continue;
    const cs = getComputedStyle(el);
    if (!scrollsY(cs)) continue;
    if (el.scrollHeight <= el.clientHeight + 2) continue;
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const holdsMain = el.contains(main) && main !== document.body;
    const bigInMain = main.contains(el) && el !== main && r.width >= 0.6 * Math.min(vw, mainR.width || vw) && r.height >= 0.6 * vh;
    const isMain = el === main;
    if (holdsMain || isMain || bigInMain) {
      add('nested', `${name(el)} scrolls itself (${el.clientHeight}px showing ${el.scrollHeight}px)${holdsMain ? ' and holds <main>' : ''}`);
    }
  }

  /* hbar: a sideways scroller taller than the viewport keeps its
     scrollbar at its own bottom, so a reader at its top has no way to
     scroll it sideways but a trackpad — a mouse has to travel the whole
     table down to the bar and back. Recorded under "nested": it is the
     same disease, a scroll box the page does not own. */
  /* a phone swipes sideways anywhere on the box, so only desk widths */
  for (const el of vw >= 720 ? all : []) {
    const cs = getComputedStyle(el);
    if (!/(auto|scroll)/.test(cs.overflowX) || el.scrollWidth <= el.clientWidth + 2) continue;
    if (!visible(el) || el.matches('textarea, input, select, pre')) continue;
    const r = el.getBoundingClientRect();
    if (r.height > vh * 1.2 && !scrollsY(cs)) add('nested', `${name(el)} scrolls sideways (${el.clientWidth}px showing ${el.scrollWidth}px) and is ${Math.round(r.height)}px tall: its scrollbar is a page away`);
    else if (r.height > vh * 1.2 && el.scrollHeight <= el.clientHeight + 2) add('nested', `${name(el)} scrolls sideways (${el.clientWidth}px showing ${el.scrollWidth}px) and is ${Math.round(r.height)}px tall: its scrollbar is a page away`);
  }

  /* chain */
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (!scrollsY(cs) || el.scrollHeight <= el.clientHeight + 2 || !visible(el)) continue;
    if (el.matches('textarea, select, input')) continue;
    let pinned = null;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const p = getComputedStyle(a).position;
      if (p === 'fixed' || p === 'sticky') { pinned = a; break; }
    }
    if (!pinned) continue;
    if (cs.overscrollBehaviorY !== 'contain' && cs.overscrollBehaviorY !== 'none') {
      add('chain', `${name(el)} scrolls inside pinned ${name(pinned)} with overscroll-behavior ${cs.overscrollBehaviorY}`);
    }
  }

  /* fixed / bottom-sticky chrome that can cover content */
  const fixedEls = () => all.filter((el) => {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') return false;
    if (!visible(el) || el.contains(main)) return false;
    if (main.contains(el) && cs.position === 'sticky') return false;
    /* a toast is transient and dismissable; it is not chrome */
    if (el.closest('[aria-live], [role="status"], [role="alert"], .toast, .toast-host')) return false;
    const r = el.getBoundingClientRect();
    /* bottom-anchored: it sits in the bottom band of the viewport (a
       full-width bar, or a floating pill a few px above the edge) and is
       not a full-height side column */
    return r.bottom >= vh - 96 && r.top > vh * 0.5 && r.height < vh * 0.5;
  });

  /* tall */
  for (const el of all) {
    const cs = getComputedStyle(el);
    if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
    if (!visible(el) || el.contains(main)) continue;
    if (scrollsY(cs)) continue;
    const r = el.getBoundingClientRect();
    if (r.bottom <= vh + 2) continue;
    if (cs.position === 'sticky') {
      /* a sticky taller than the room under its offset stays stuck
         while its container scrolls past, so whatever hangs below the
         viewport is out of reach until the container's very end —
         unreachable in practice when the container is much taller */
      const top = parseFloat(cs.top) || 0;
      const room = vh - top;
      const cont = el.parentElement.getBoundingClientRect();
      if (r.height > room + 2 && cont.height > r.height + vh) {
        const past = [...el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
          .filter((f) => visible(f) && f.getBoundingClientRect().top >= top + room - 1).length;
        if (past) add('tall', `${name(el)} is sticky at ${top}px, ${Math.round(r.height)}px tall in ${Math.round(room)}px of room and does not scroll: ${past} control(s) stay out of reach while it is stuck`);
      }
      continue;
    }
    const hidden = [...el.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')]
      .filter((f) => visible(f) && f.getBoundingClientRect().top >= vh - 1);
    /* a scrollable descendant would bring them into view */
    const rescued = hidden.filter((f) => {
      for (let a = f.parentElement; a && a !== el.parentElement; a = a.parentElement) {
        if (scrollsY(getComputedStyle(a)) && a.scrollHeight > a.clientHeight + 2) return true;
      }
      return false;
    });
    if (hidden.length > rescued.length) add('tall', `${name(el)} is fixed, ${Math.round(r.height)}px tall in a ${vh}px viewport, ${hidden.length - rescued.length} control(s) past the edge`);
  }

  /* sticky: scroll to the middle and check each sticky is pinned */
  const sticky = all.filter((el) => getComputedStyle(el).position === 'sticky' && visible(el));
  if (tall) {
    window.scrollTo({ top: Math.round((de.scrollHeight - vh) / 2), behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    for (const el of sticky) {
      const cs = getComputedStyle(el);
      const top = parseFloat(cs.top);
      if (!Number.isFinite(top)) continue;
      const r = el.getBoundingClientRect();
      const cont = el.parentElement.getBoundingClientRect();
      /* only judge a sticky whose container still has room for it below
         the offset, and which the scroll moved past its natural spot */
      if (cont.bottom < top + r.height + 4 || cont.top > top) continue;
      /* a sticky inside a scroll box sticks to THAT box */
      let box = null;
      for (let a = el.parentElement; a && a !== document.body && a !== de; a = a.parentElement) {
        const acs = getComputedStyle(a);
        if (/(auto|scroll|hidden|clip|overlay)/.test(acs.overflowY) || /(auto|scroll|hidden|clip|overlay)/.test(acs.overflowX)) { box = a; break; }
      }
      if (box) {
        if (box.scrollHeight <= box.clientHeight + 2 && box.getBoundingClientRect().top < 0) {
          add('sticky', `${name(el)} is sticky (top ${top}px) inside ${name(box)} (overflow ${getComputedStyle(box).overflowX}/${getComputedStyle(box).overflowY}), which does not scroll — it scrolls away with the page`);
        }
        continue;
      }
      /* above its offset is a sticky that scrolled away; below it is
         one whose natural place has not reached the offset yet */
      if (r.top < top - 2) add('sticky', `${name(el)} should sit at ${top}px and sits at ${Math.round(r.top)}px`);
    }
  }

  /* bottom: scroll to the end — and again, until the end stops moving
     (content-visibility: auto and lazy renders grow the page as it is
     scrolled; ten tries, then the page is reported as never ending) */
  let endTries = 0;
  for (; endTries < 10; endTries++) {
    window.scrollTo({ top: de.scrollHeight, behavior: 'instant' });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await new Promise((r) => setTimeout(r, 150));
    if (scrollY >= de.scrollHeight - vh - 2) {
      await new Promise((r) => setTimeout(r, 150));
      if (scrollY >= de.scrollHeight - vh - 2) break;
    }
  }
  if (endTries >= 10) add('bottom', `the end of the page keeps moving: scrollY ${Math.round(scrollY)} of ${de.scrollHeight - vh} after ten scrolls`);
  /* jump: a page whose height is a guess until it is scrolled through
     (content-visibility with a poor intrinsic size, lazy renders) moves
     its scrollbar thumb under the reader's hand and moves the end */
  if (de.scrollHeight - h0 > Math.max(vh, h0 * 0.15)) add('jump', `the page grew from ${h0}px to ${de.scrollHeight}px while it was scrolled through`);
  if (h0 - de.scrollHeight > Math.max(vh, h0 * 0.15)) add('jump', `the page shrank from ${h0}px to ${de.scrollHeight}px while it was scrolled through`);
  const lastIn = (root) => {
    let best = null; let bestBottom = -Infinity;
    for (const el of root.querySelectorAll('*')) {
      if (el.children.length && el.matches(':not(button):not(a):not(label)')) {
        /* leaves and controls only: a wrapper's padding is not content */
        const kids = [...el.children].some((k) => visible(k));
        if (kids) continue;
      }
      if (!visible(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.position === 'fixed' || cs.position === 'absolute') continue;
      const r = el.getBoundingClientRect();
      if (r.bottom > bestBottom) { best = el; bestBottom = r.bottom; }
    }
    return best;
  };
  const covers = fixedEls();
  const targets = [lastIn(main)];
  const foot = document.querySelector('body > footer, .site-footer, footer.ft');
  if (foot && visible(foot) && !main.contains(foot)) targets.push(lastIn(foot));
  for (const t of targets.filter(Boolean)) {
    const r = t.getBoundingClientRect();
    let edge = vh;
    let by = 'the viewport';
    for (const c of covers) {
      if (c.contains(t)) continue;
      const cr = c.getBoundingClientRect();
      if (cr.right <= r.left || cr.left >= r.right) continue;
      if (cr.top < edge) { edge = cr.top; by = name(c); }
    }
    if (r.bottom > edge + 1) add('bottom', `scrolled to the end, ${name(t)} ends at ${Math.round(r.bottom)}px and ${by} starts at ${Math.round(edge)}px (${Math.round(r.bottom - edge)}px hidden; scrollY ${Math.round(scrollY)} of ${de.scrollHeight - vh})`);
  }
  window.scrollTo({ top: 0, behavior: 'instant' });

  /* the pinned chrome's bottom, for the fragment check */
  const cover = (() => {
    let b = 0;
    for (const el of all) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (!visible(el) || main.contains(el) || el.contains(main)) continue;
      const r = el.getBoundingClientRect();
      if (r.top <= 1 && r.width >= vw * 0.5 && r.height < vh * 0.5) b = Math.max(b, r.bottom);
    }
    return b;
  })();

  /* fragment candidates: section ids in main, tab panels first */
  const ids = [...main.querySelectorAll('section[id], [role="tabpanel"][id], h2[id]')]
    .map((e) => e.id).filter((id) => id && !/^(app|main)$/.test(id));
  const uniq = [...new Set(ids)];
  /* the last one first: it is the one most likely to be far down */
  const pick = [uniq[uniq.length - 1], uniq[Math.floor(uniq.length / 2)], uniq[1]].filter(Boolean);
  return { findings, frags: [...new Set(pick)], cover, scrollH: de.scrollHeight, vh };
};

/* Land one fragment the way a link does, and say where it went. */
const landFragment = async (page, id) => {
  /* a click on an in-page link, as a person makes it: assigning the
     hash it already has would not scroll at all */
  /* The jump to the top and the click go in SEPARATE tasks. In one task,
     coming from far down a page with `scroll-behavior: smooth`, Chromium
     cancels the click's smooth scroll and the page stays at the top
     (measured on start.html at 390: scrollY 4, target 3,440px down) —
     a sequence no person can produce, since a click always arrives in a
     later task than the scroll before it. */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await page.waitForTimeout(100);
  await page.evaluate((i) => {
    const a = document.createElement('a');
    a.href = '#' + i;
    a.hidden = true;
    document.body.append(a);
    a.click();
    a.remove();
  }, id);
  await page.waitForTimeout(1300);
  let m = await page.evaluate((i) => {
    const el = document.getElementById(i);
    if (!el) return { missing: true };
    const panel = el.closest('[role="tabpanel"]');
    if ((panel && panel.hidden) || !el.getClientRects().length) return { hidden: true };
    const main = document.querySelector('main') || document.body;
    const vw = document.documentElement.clientWidth;
    let cover = 0;
    for (const e of document.querySelectorAll('body *')) {
      const cs = getComputedStyle(e);
      if (cs.position !== 'fixed' && cs.position !== 'sticky') continue;
      if (main.contains(e) && !e.closest('nav.tabs, .tabs')) continue;
      if (e.contains(main) || e.contains(el)) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 1 || r.height < 1 || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.top <= 1 && r.width >= vw * 0.5 && r.height < innerHeight * 0.5) cover = Math.max(cover, r.bottom);
    }
    const r = el.getBoundingClientRect();
    const de = document.documentElement;
    const atEnd = de.scrollTop + innerHeight >= de.scrollHeight - 2;
    return { top: Math.round(r.top), cover: Math.round(cover), vh: innerHeight, atEnd };
  }, id);
  if (!m.missing && !m.hidden && m.top < m.cover - 1) { await page.waitForTimeout(1000); m = await page.evaluate((i) => { const r = document.getElementById(i).getBoundingClientRect(); return r ? Math.round(r.top) : null; }, id).then((t) => ({ ...m, top: t })); }
  return m;
};

/* ---- the overlays: open each, judge it, close it, judge the page ----
   The phone's bottom-bar sheets (each <button> in the bar) and, at
   desk widths, the command palette. Open: the sheet's controls must be
   reachable (something inside scrolls when they run past the viewport)
   and its scroll box must contain its overscroll. Closed: no lock left
   on <html>/<body>, and the page scrolls again. */
const overlayState = () => {
  const vh = innerHeight;
  const out = [];
  const shown = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 1 && r.height > 1 && cs.display !== 'none' && cs.visibility !== 'hidden'; };
  const dlg = [...document.querySelectorAll('[aria-modal="true"], [role="dialog"], dialog[open], #palette:not([hidden]), .pal:not([hidden])')].filter((e) => !e.hidden && shown(e)).pop();
  if (!dlg) return { open: false, out };
  const scrolls = (a) => /(auto|scroll|overlay)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 2;
  const past = [...dlg.querySelectorAll('a[href], button, input, [tabindex]')].filter((f) => shown(f) && f.getBoundingClientRect().top >= vh - 1);
  const stuck = past.filter((f) => { for (let a = f.parentElement; a && a !== dlg.parentElement; a = a.parentElement) if (scrolls(a)) return false; return true; });
  if (stuck.length) out.push(`${stuck.length} control(s) past the viewport's edge and nothing in it scrolls`);
  for (const a of [dlg, ...dlg.querySelectorAll('*')]) {
    if (!scrolls(a)) continue;
    const ob = getComputedStyle(a).overscrollBehaviorY;
    if (ob !== 'contain' && ob !== 'none') out.push(`${a.tagName.toLowerCase()}.${[...a.classList].join('.')} scrolls with overscroll-behavior ${ob}`);
  }
  return { open: true, name: dlg.tagName.toLowerCase() + (dlg.id ? '#' + dlg.id : '') + '.' + [...dlg.classList].slice(0, 2).join('.'), out };
};
const pageLocked = () => {
  const de = document.documentElement;
  const locked = [de, document.body].filter((el) => /(hidden|clip)/.test(getComputedStyle(el).overflowY)).map((el) => el.tagName.toLowerCase());
  const tall = de.scrollHeight > innerHeight + 40;
  let scrolls = true;
  if (tall) {
    window.scrollTo({ top: 0, behavior: 'instant' });
    window.scrollBy({ top: 30, behavior: 'instant' });
    scrolls = scrollY > 0;
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  return { locked, scrolls, tall, cls: de.className };
};
async function overlays(page, vp) {
  const found = [];
  const openers = [];
  if (vp.width < 720) {
    const n = await page.$$eval('#mobileActionbar button', (bs) => bs.map((b, i) => ({ i, label: b.getAttribute('aria-label') || b.textContent.trim() })));
    for (const b of n) openers.push({ label: `bottom bar "${b.label}"`, open: () => page.click(`#mobileActionbar button >> nth=${b.i}`, { timeout: 3000 }) });
  } else {
    openers.push({ label: 'command palette', open: () => page.keyboard.press('Control+k') });
  }
  for (const o of openers) {
    try {
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await o.open();
      await page.waitForTimeout(450);
      const st = await page.evaluate(overlayState);
      st.out.forEach((m) => found.push({ kind: m.includes('overscroll') ? 'chain' : 'tall', msg: `${o.label} → ${st.name}: ${m}` }));
      if (st.open) {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(400);
        const still = await page.evaluate(overlayState);
        if (still.open) {
          const x = await page.$('.mn-close, [data-action="close"], [aria-label="Close"]');
          if (x) { await x.click().catch(() => {}); await page.waitForTimeout(400); }
        }
      }
      const lk = await page.evaluate(pageLocked);
      if (lk.locked.length && lk.tall) found.push({ kind: 'locked', msg: `after ${o.label} closed, ${lk.locked.join(' and ')} still overflow hidden (html class "${lk.cls}")` });
      else if (!lk.scrolls) found.push({ kind: 'locked', msg: `after ${o.label} closed the page does not scroll` });
    } catch (e) {
      found.push({ kind: 'locked', msg: `${o.label}: could not exercise (${String(e.message || e).split('\n')[0]})` });
    }
  }
  return found;
}

/* ---- a real wheel, where a person's pointer rests ---------------
   The centre of the content, the side menu when there is one, and the
   band. A wheel there must move the document (or a box the pointer is
   over that genuinely scrolls and is not at its end) — an invisible
   layer, a pointer-events trap or a box that eats the wheel without
   scrolling reads as "the page will not scroll", which is how it is
   reported. */
async function wheels(page, vp) {
  const found = [];
  const spots = await page.evaluate(() => {
    const de = document.documentElement;
    if (de.scrollHeight <= innerHeight + 40) return [];
    const main = document.querySelector('main');
    const out = [];
    const mr = main ? main.getBoundingClientRect() : null;
    const cx = mr ? Math.round(mr.left + mr.width / 2) : Math.round(innerWidth / 2);
    out.push({ label: 'the content', x: cx, y: Math.round(innerHeight * 0.6) });
    const side = document.querySelector('.tabs-has-side nav.tabs, nav.tabs.tabs-side');
    if (side) { const r = side.getBoundingClientRect(); if (r.width > 1 && r.height > 1) out.push({ label: 'the side menu', x: Math.round(r.left + r.width / 2), y: Math.round(Math.min(r.top + 40, innerHeight - 40)) }); }
    const bar = document.querySelector('.sh-bar');
    if (bar) { const r = bar.getBoundingClientRect(); if (r.height > 1 && r.bottom > 0) out.push({ label: 'the band', x: Math.round(r.left + r.width * 0.35), y: Math.round(r.top + r.height / 2) }); }
    return out;
  });
  /* A fragment landing (story.html#guide, which feature.html and
     short.html redirect to) is GUARDED by fragments.js for 2.5s: a drift
     under half a screen is put back, and any reader input stands the
     guard down. Our scrollTo below is not input, so on a short page whose
     target sits at the bottom the guard snapped it back and the wheel ran
     at the end of the page. Press a key that does nothing, as a reader's
     first touch would, so the page is the reader's before we measure. */
  await page.keyboard.press('Shift');
  for (const s of spots) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(80);
    const before = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      const boxes = [];
      for (let a = el; a && a !== document.body && a !== document.documentElement; a = a.parentElement) {
        if (/(auto|scroll|overlay)/.test(getComputedStyle(a).overflowY) && a.scrollHeight > a.clientHeight + 2) boxes.push(a);
      }
      boxes.forEach((b, i) => { b.dataset.pwWheel = String(i); });
      return { y: scrollY, boxes: boxes.map((b) => b.scrollTop), hit: el ? el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + (el.classList.length ? '.' + [...el.classList].slice(0, 2).join('.') : '') : null };
    }, s);
    await page.mouse.move(s.x, s.y);
    await page.mouse.wheel(0, 400);
    await page.waitForTimeout(900);
    const after = await page.evaluate(() => {
      const boxes = [...document.querySelectorAll('[data-pw-wheel]')].sort((a, b) => a.dataset.pwWheel - b.dataset.pwWheel);
      const out = { y: scrollY, boxes: boxes.map((b) => b.scrollTop) };
      boxes.forEach((b) => delete b.dataset.pwWheel);
      return out;
    });
    const moved = after.y > before.y + 5 || after.boxes.some((t, i) => t > (before.boxes[i] || 0) + 5);
    if (!moved) found.push({ kind: 'chain', msg: `a wheel over ${s.label} (${s.x},${s.y} on ${before.hit}) scrolled nothing` });
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  return found;
}

/* ---- scroll locks a page sets for an overlay of its own ---------
   Hand-listed, as prove-nav lists its in-page calls to action: each
   opens an overlay that locks the document, then LEAVES it the way a
   person might without pressing Close (a tab switch by hash — Back, the
   strip, a crumb), and asserts no lock survived. The breakdown's phone
   sheet lives inside the Elements tab, and a tab switch used to hide it
   with `bdx-locked` still on <html>. A new page-owned lock is a row. */
const LOCKS = [
  { file: 'breakdown.html#elements', vp: { width: 390, height: 844 }, open: '.bdx-sheet-open', leave: 'scenes' }
];
async function lockScenario(s) {
  const ctx = await browser.newContext({ viewport: s.vp, storageState: seeded });
  await ctx.addInitScript(PIN);
  const page = await ctx.newPage();
  const found = [];
  try {
    await page.goto(BASE + s.file, { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForTimeout(1200);
    const btn = await page.$(s.open);
    /* the opener exists only with data (no project: no Elements tab
       content) — said, not counted, so a skipped scenario is visible */
    if (!btn) { console.log(`  (skipped: ${s.file} has no ${s.open} in this state)`); return found; }
    await btn.click();
    await page.waitForTimeout(400);
    const lockedOpen = await page.evaluate(pageLocked);
    await page.evaluate((h) => { location.hash = h; }, s.leave);
    await page.waitForTimeout(700);
    const lk = await page.evaluate(pageLocked);
    const st = await page.evaluate(overlayState);
    if (lk.locked.length && lk.tall && !st.open) found.push({ kind: 'locked', msg: `${s.open} opened${lockedOpen.locked.length ? ' (locked)' : ''}, then #${s.leave}: ${lk.locked.join(' and ')} still overflow hidden with nothing open (html class "${lk.cls}")` });
  } catch (e) {
    found.push({ kind: 'locked', msg: `could not run (${String(e.message || e).split('\n')[0]})` });
  } finally {
    await ctx.close();
  }
  return found;
}

/* ---- load every (page, width) --------------------------------- */
const jobs = [];
for (const file of PAGES) for (const vp of WIDTHS) jobs.push({ file, vp });
const results = [];
let next = 0;
if (SHOTS) fs.mkdirSync(SHOTS, { recursive: true });
async function worker() {
  while (next < jobs.length) {
    const job = jobs[next++];
    const ctx = await browser.newContext({ viewport: job.vp, storageState: seeded });
    await ctx.addInitScript(PIN);
    const page = await ctx.newPage();
    const out = { ...job, findings: [] };
    try {
      await page.goto(BASE + job.file, { waitUntil: 'networkidle', timeout: 45000 });
      await page.evaluate(() => new Promise((r) => (window.requestIdleCallback
        ? requestIdleCallback(() => r(), { timeout: 4000 }) : setTimeout(r, 1200))));
      await page.waitForTimeout(700);
      out.landed = page.url().replace(BASE, '');
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, `${job.file.replace(/\.html$/, '')}-${job.vp.width}.png`) });
      const p = await page.evaluate(probe);
      out.findings.push(...p.findings);
      out.scrollH = p.scrollH;
      /* the wheel and the overlays BEFORE any fragment is landed: a
         landing arms the resolver's guard, which (rightly) puts the
         target back after a scroll nobody's input made */
      out.findings.push(...(await wheels(page, job.vp)));
      out.findings.push(...(await overlays(page, job.vp)));
      for (const id of p.frags) {
        const m = await landFragment(page, id);
        if (m.missing || m.hidden) continue;
        if (m.top < m.cover - 1) out.findings.push({ kind: 'fragment', msg: `#${id} lands at ${m.top}px, under ${m.cover}px of pinned chrome` });
        else if (m.top > m.vh - 24 && !m.atEnd) out.findings.push({ kind: 'fragment', msg: `#${id} lands at ${m.top}px, below the ${m.vh}px viewport` });
      }
    } catch (e) {
      out.error = String(e.message || e).split('\n')[0];
    }
    results.push(out);
    await ctx.close();
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
for (const s of LOCKS) {
  const file = s.file.split('#')[0];
  if (!PAGES.includes(file)) continue;
  results.push({ file, vp: s.vp, findings: await lockScenario(s) });
}
await browser.close();
server.close();

/* ---- report --------------------------------------------------- */
const KINDS = ['nested', 'bottom', 'hscroll', 'locked', 'sticky', 'fragment', 'chain', 'tall', 'jump'];
const counts = Object.fromEntries(KINDS.map((k) => [k, 0]));
let errors = 0;
const byPage = new Map();
for (const r of results) {
  if (!byPage.has(r.file)) byPage.set(r.file, []);
  byPage.get(r.file).push(r);
}
for (const file of PAGES) {
  const rows = (byPage.get(file) || []).sort((a, b) => b.vp.width - a.vp.width);
  const lines = [];
  for (const r of rows) {
    if (r.error) { errors++; lines.push(`    @${r.vp.width}  ERROR ${r.error}`); continue; }
    /* the same finding at several widths is one line with the widths */
    for (const f of r.findings) { counts[f.kind] = (counts[f.kind] || 0) + 1; lines.push(`    @${r.vp.width}  ${f.kind.padEnd(8)} ${f.msg}`); }
  }
  console.log(`${lines.length ? '✗' : '✓'} ${file}${rows[0] && rows[0].landed && rows[0].landed !== file ? `  (landed on ${rows[0].landed})` : ''}`);
  lines.forEach((l) => console.log(l));
}
const total = Object.values(counts).reduce((a, b) => a + b, 0);
console.log(`\n${PAGES.length} pages × ${WIDTHS.length} widths; findings: ${total}  (${KINDS.map((k) => `${k} ${counts[k]}`).join(', ')})${errors ? `; ${errors} load error(s)` : ''}`);
process.exit(total || errors ? 1 : 0);
