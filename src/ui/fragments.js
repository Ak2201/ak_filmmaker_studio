/* ============================================================
   FRAGMENT NAVIGATION — making the phase menu actually navigate
   ------------------------------------------------------------
   Measured before this existed: of the 24 fragment hrefs in
   navigation.json, ZERO landed on their target in a studio with data.
   `write.html#documents` left the reader 107,363px from Documents;
   `reports.html#cast-matrix` 23,327px; `breakdown.html#elements`
   20,709px. `scrollY` was 0 in every case. The few that looked right
   — `#screenplay`, `#reports`, `#stripboard` — were simply the first
   section on their page.

   It read as "the menu does nothing", which is CLAUDE.md's own
   description of this class of bug, and it was invisible to the gate
   for the reason the notes already give: verify loads each page at its
   URL WITHOUT a fragment, so it cannot tell whether an anchor
   resolves.

   THREE CAUSES COMPOUNDED, and only fixing all three helps.

   1. Every href is page-qualified — `reports.html#sides`, never
      `#sides` — so a click on the page it points AT is a full document
      reload rather than a hash change.
   2. On that load the target does not exist yet. Pages render from JS
      after the module graph evaluates, and the browser makes exactly
      ONE attempt to scroll to a fragment, at parse time. It never
      retries.
   3. `fragmentTargets()` and the `hashchange` listener in shell.js
      were built for precisely this and NEVER FIRE, because a
      page-qualified href is a navigation and not a hash change. That
      is why the notes record that spy as "silently inert on those
      three pages".

   An earlier fix moved the ids onto wrappers that always render,
   which was right and is why 0 are missing today. But existence was
   never the problem: the stated bar — "0 missing and 0 obscured" —
   does not describe this failure at all. The id exists, nothing covers
   it, and the browser simply never goes there.

   WHY BOTH HALVES BELOW. The resolver fixes a pasted link, a bookmark
   and a click that genuinely changes page. The interceptor stops a
   same-page click from reloading 107,000px of screenplay to move the
   viewport, which is both slow and the case the resolver cannot make
   instant.

   WHAT THIS DELIBERATELY DOES NOT DO: no offset arithmetic. The chrome
   is cleared by `scroll-padding-top`, which shell.js already feeds
   from a MEASURED `--sh-chrome-h`. A second opinion about the height
   of the bar is how that number goes wrong — see the note on
   measureChrome() for the two times it already did.

   AND IT STORES NOTHING. The gate asserts zero localStorage writes
   across four idle seconds; a module that remembered where you were
   would trip it, correctly.
   ============================================================ */

import { delegate } from '../lib/dom.js';
import { pageFile } from '../lib/page-file.js';
import { revealTarget } from './tabs.js';

/* An ABSOLUTE cap, not the thing that normally ends the wait — the
   settle condition below does that, the instant the target holds
   still. So this only matters for a hash naming something that is
   never going to appear.

   Measured, which is why it is this large: write.html with the
   sample's 106-page screenplay renders 2,361 textareas, and the
   target's document position was still moving at t=14s. The first
   version of this capped at 6s and therefore gave up on the one page
   that most needed it — all three of write.html's fragments came back
   unscrolled. The cost of waiting is one rAF per frame in which the
   DOM actually changed, which is the same throttle shell.js uses for
   its own observer. */
const WAIT_MS = 20000;

let _observer = null;
let _timer = 0;
let _takeover = null;

function stopWaiting() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  if (_timer) { clearTimeout(_timer); _timer = 0; }
  if (_takeover) { _takeover(); _takeover = null; }
}

/** A page that lands somewhere MORE precise than the hash (contacts.html's
 *  `?sheet=<id>#call-sheets` lands on one sheet inside the section) says so
 *  here, and the resolver and its guard stand down exactly as they do for
 *  the reader's own input. Without it the settle loop re-lands the section
 *  on the next mutation — any late insert does it (item 77: the What-is
 *  pill under the call-sheets subtitle arrives after a dynamic import) —
 *  and the reader is put back at the top of the list. */
export function standDown() { stopWaiting(); stopGuard(); }

/* THE READER OUTRANKS THE RESOLVER (owner, 19 Oct 2026: "there are
   scrolling issues in a few pages"). The settle loop below runs for up
   to WAIT_MS while a page is still rendering, and every mutation re-lands
   the target — so on library.html#films, whose shelves keep rendering
   for seconds, scrolling down was yanked straight back to Films, again
   and again: measured, the page could not be scrolled past 2,727px of
   7,311. The guard already stood down on input; the loop did not.

   Two signals, because neither is enough alone: any input the reader
   makes (a wheel, a touch, a key, a press — which includes grabbing the
   scrollbar), and a target that has ARRIVED and then left the viewport's
   rest line while its own document position did not move — nothing
   re-rendered, so the viewport moved, and only somebody scrolling moves
   it. Either one ends the wait and the guard. */
function watchTakeover(onTakeover) {
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  const fire = () => onTakeover();
  inputs.forEach((e) => window.addEventListener(e, fire, { passive: true, capture: true }));
  return () => inputs.forEach((e) => window.removeEventListener(e, fire, { capture: true }));
}

/* A LANDING CAN BE UNDONE BY THE BROWSER'S OWN.

   Opening `page.html#frag` makes the browser scroll to the fragment
   itself, and html has `scroll-behavior: smooth`, so that scroll is an
   animation. It reads `scroll-padding-top` when it STARTS. If the band
   grows after that (a tab strip built a frame later is 53px of chrome)
   the animation still runs to the old, smaller padding — and it can
   finish AFTER the resolver has landed correctly and called itself
   settled, moving the target back out from under the chrome with no
   mutation for the resolver to notice. Measured on stripboard.html#dood
   in the seeded studio: landed at 163px, then slid to 117px against a
   151px band, every time.

   So a settled landing is guarded for a short while: if the target
   drifts from where the settle condition says it belongs, put it back,
   `instant`. The guard stands down the moment the reader does anything
   — wheel, touch, a key, a press — so it can never fight somebody who
   has chosen to move. It is not a loop: it reacts to scroll events, once
   per frame, and ends by itself. */
/* Where an element belongs when a scroll has landed it: scroll-padding-top
   on <html> PLUS the element's own scroll-margin-top. Both are real parts of
   what `scrollIntoView({block:'start'})` aligns to — path-bar.css gives each
   tab section a margin the height of the pre-production bar, so a target
   with one rests lower than the padding alone says, and a check that
   ignored it never agreed the target had arrived. */
function restTop(el) {
  const pad = parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0;
  const margin = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
  return pad + margin;
}

let _guard = null;
const GUARD_MS = 2500;
function stopGuard() {
  if (_guard) { _guard(); _guard = null; }
}
function guardLanding(id) {
  stopGuard();
  let moved = false;
  let raf = 0;
  const mark = () => { moved = true; };
  const inputs = ['wheel', 'touchstart', 'keydown', 'pointerdown'];
  inputs.forEach((e) => window.addEventListener(e, mark, { passive: true, capture: true }));
  const onScroll = () => {
    if (raf || moved) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      if (moved) return;
      const el = document.getElementById(id);
      if (!el) return;
      const off = Math.abs(el.getBoundingClientRect().top - restTop(el));
      /* half a screen away is the reader scrolling, not a late landing */
      if (off > innerHeight / 2) { stopGuard(); return; }
      if (off > 2) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  const timer = setTimeout(() => stopGuard(), GUARD_MS);
  _guard = () => {
    clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
    window.removeEventListener('scroll', onScroll);
    inputs.forEach((e) => window.removeEventListener(e, mark, { capture: true }));
  };
}

function idFromHash(hash) {
  /* `#people?user=7`: what follows a `?` is the page's own state (the
     admin drawer), not an element id. */
  const raw = String(hash || '').replace(/^#/, '').split('?')[0];
  if (!raw) return '';
  try { return decodeURIComponent(raw); } catch (e) { return raw; }
}

/** Scroll to the element the hash names, if it is there yet.
 *  Returns true once it has actually been done. */
function tryLand(id) {
  if (!id) return true;
  const el = document.getElementById(id);
  if (!el) return false;
  /* A target inside a hidden tab has no box to scroll to — switch to
     its tab first (tabs.js; a no-op on untabbed pages). */
  revealTarget(id);
  /* `block: 'start'` plus the page's own scroll-padding-top. `auto`
     rather than `smooth`: this runs on load, and a smooth scroll that
     begins while the rest of the page is still rendering gets
     overtaken by the reflow and stops somewhere arbitrary. */
  /* 'instant', not 'auto': per spec 'auto' defers to the computed
     scroll-behavior, which base.css sets to smooth — so this started a
     glide that the instant hashchange landing one line later cancelled.
     The note above meant instant; only 'instant' says it. */
  el.scrollIntoView({ block: 'start', behavior: 'instant' });
  return true;
}

/** Land on the hash, and KEEP landing until the target stops moving.
 *
 *  LANDING ONCE IS NOT ENOUGH, which the first version of this got
 *  wrong and the measurement caught: it took the seeded studio from
 *  0/24 to 14/24 and left ten stranded in two shapes, both of which
 *  are "we stopped too early".
 *
 *  Content ABOVE the target is still rendering, so the element we
 *  scrolled to slides out from under the viewport — breakdown#songs,
 *  reports#cast-matrix and visualize#lookbook all ended 453–737px off
 *  with a large, nearly-right scrollY. And a page that replaces its
 *  whole `#app` after first paint resets the scroll to 0 with the
 *  observer already disconnected, which is why write.html went back to
 *  scrollY 0 and 107,363px.
 *
 *  So the exit condition is not "the element exists", it is "the
 *  element has stopped moving". `offsetTop` is the document-relative
 *  measure to watch: it changes both when something above grows and
 *  when the element is replaced by a re-render, which is exactly the
 *  pair of causes. */
export function resolveFragment(hash = location.hash) {
  stopWaiting();
  stopGuard();
  const id = idFromHash(hash);
  if (!id) return;
  /* Armed from the start, not only once the landing settles: the
     browser's own scroll can finish after the resolver has stopped
     watching, and nothing mutates to wake it. */
  guardLanding(id);

  let lastTop = null;
  let stableTicks = 0;
  let arrived = false;
  const takeOver = () => { stopWaiting(); stopGuard(); };
  _takeover = watchTakeover(takeOver);

  /* Returns true once the target has held the same document position
     across enough frames to call it settled. */
  const settle = () => {
    const el = document.getElementById(id);
    if (!el) { lastTop = null; stableTicks = 0; return false; }
    /* Every tick, not once: a page that re-renders `main` (settings,
       admin) rebuilds its tabs with the first one showing, and a
       hidden target's offsetTop is a steady 0 that would otherwise
       read as "settled". */
    if (revealTarget(id)) { lastTop = null; stableTicks = 0; }
    const top = el.offsetTop;
    if (top !== lastTop) {
      lastTop = top;
      stableTicks = 0;
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      return false;
    }
    /* A STABLE DOCUMENT POSITION IS NOT AN ARRIVAL, and conflating the
       two is how this failed. `html` has scroll-behavior: smooth, so
       every scrollIntoView above starts an ANIMATION; the next render
       moves offsetTop, we call it again, and the animation restarts
       from wherever it had got to. When the page finally stops moving
       we counted three stable ticks and returned true — with the
       viewport parked wherever the last interrupted animation died.

       Measured on feature.html#glossary, an 86,000px page: the target
       settled at offsetTop 81,247 and the reader was left 3,552px
       short of it, every time, with no further attempt. It was
       intermittent rather than constant — sometimes the last
       animation happened to complete — which is worse, because it
       reads as a flaky test rather than a broken link.

       So the second half of the question: is the element actually
       where it should be? The target is `scroll-padding-top`, which is
       the measured chrome; anything within a couple of pixels of it
       has arrived. If not, scroll again and keep waiting. */
    const want = restTop(el);
    const now = el.getBoundingClientRect().top;
    if (arrived && Math.abs(now - want) > innerHeight / 2) {
      /* It was there, nothing above it moved, and now it is half a
         screen or more away: the reader scrolled. Stop, rather than drag
         them back. (Half a screen, not 2px: the browser's own smooth
         landing can finish late against a smaller padding — the 46px
         slide guardLanding() exists for — and that one we DO correct.) */
      takeOver();
      return null;
    }
    if (Math.abs(now - want) > 2) {
      /* 'instant', NOT 'auto'. Per spec 'auto' means "use the computed
         scroll-behavior", and base.css sets `scroll-behavior: smooth`
         on html — so 'auto' here would start exactly the animation
         that causes this, and the fix would have looked right and
         changed nothing. Only 'instant' overrides the stylesheet.
         A landing-on-load has nothing to animate for anyway: nobody
         watches 81,000px of blur. */
      el.scrollIntoView({ block: 'start', behavior: 'instant' });
      stableTicks = 0;
      return false;
    }
    arrived = true;
    return ++stableTicks >= 3;
  };

  const first = settle();
  if (first === null) return;
  if (first) { stopWaiting(); guardLanding(id); return; }
  if (typeof MutationObserver !== 'function') return;

  /* rAF-throttled, for the same reason shell.js throttles its own
     observer: a page rendering 2,361 script elements produces
     thousands of mutations and the question is worth answering once
     per frame, not once per node. */
  let raf = 0;
  const tick = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const done = settle();
      if (done) { stopWaiting(); guardLanding(id); }
    });
  };
  _observer = new MutationObserver(tick);
  _observer.observe(document.body, { childList: true, subtree: true });

  /* A reflow does not have to come with a mutation — a webfont
     arriving re-measures every line box and moves everything below it.
     shell.js measures twice for this reason; this re-lands for it. */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(tick);

  _timer = setTimeout(stopWaiting, WAIT_MS);
}

/** True when `href`'s path is the document we are already on. */
function isThisPage(href) {
  try {
    const u = new URL(href, location.href);
    return u.origin === location.origin && pageFile(u.pathname) === pageFile(location.pathname);
  } catch (e) { return false; }
}

/* THE FOCUS GOES WITH THE SCROLL (28 Oct 2026). preventDefault() above
   also cancels the browser's own move of the sequential-focus start
   point, so "Skip to content" scrolled and left focus on the link: the
   next Tab went to the rail. A target that cannot take focus is given
   tabindex=-1 (focusable by script only, never a Tab stop), and the
   scroll is left to the landing above. */
function moveFocus(id) {
  const el = document.getElementById(id);
  if (!el || el.contains(document.activeElement) && document.activeElement !== document.body) return;
  if (!el.matches('a[href], button, input, select, textarea, [tabindex]')) el.setAttribute('tabindex', '-1');
  try { el.focus({ preventScroll: true }); } catch (e) { /* ignore */ }
}

export function installFragmentNav() {
  if (!document.body) return;        // called again from the ready hook below

  /* A SAME-PAGE CLICK SHOULD NOT RELOAD THE PAGE. Every href is
     page-qualified, so the browser treats `reports.html#sides`
     clicked ON reports.html as a navigation: it tears the document
     down, re-renders every scene and every script element, and then
     fails to scroll anyway because of cause 2 above. Intercepting it
     turns the app's primary navigation back into what it looks like. */
  delegate(document, 'click', 'a[href*="#"]', (e, a) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey ||
        e.shiftKey || e.altKey) return;
    if (a.target && a.target !== '_self') return;
    const href = a.getAttribute('href') || '';
    if (!href.includes('#') || !isThisPage(href)) return;
    const id = idFromHash(href.slice(href.indexOf('#')));
    if (!id || !document.getElementById(id)) return;   // let the browser try
    e.preventDefault();
    /* replaceState rather than assigning location.hash: the latter
       pushes a history entry per click, so Back walks the sections
       the reader skimmed instead of leaving the page. */
    history.replaceState(null, '', href.slice(href.indexOf('#')));
    /* The tab first, then the scroll — and then the `hashchange` that
       replaceState does not fire, because the shell's breadcrumb and
       the tab strip both follow the hash through it (UX audit H2: the
       address changed, the tab did not). The listener below re-runs
       the resolver, which keeps landing while the newly shown panel
       lays itself out. */
    revealTarget(id);
    tryLand(id);
    moveFocus(id);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  window.addEventListener('hashchange', () => resolveFragment());
  resolveFragment();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', installFragmentNav);
} else {
  installFragmentNav();
}

export default { installFragmentNav, resolveFragment };
