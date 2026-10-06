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

function stopWaiting() {
  if (_observer) { _observer.disconnect(); _observer = null; }
  if (_timer) { clearTimeout(_timer); _timer = 0; }
}

function idFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
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
  el.scrollIntoView({ block: 'start', behavior: 'auto' });
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
  const id = idFromHash(hash);
  if (!id) return;

  let lastTop = null;
  let stableTicks = 0;

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
      el.scrollIntoView({ block: 'start', behavior: 'auto' });
      return false;
    }
    return ++stableTicks >= 3;
  };

  if (settle()) return;
  if (typeof MutationObserver !== 'function') return;

  /* rAF-throttled, for the same reason shell.js throttles its own
     observer: a page rendering 2,361 script elements produces
     thousands of mutations and the question is worth answering once
     per frame, not once per node. */
  let raf = 0;
  const tick = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (settle()) stopWaiting(); });
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
    return u.origin === location.origin && u.pathname === location.pathname;
  } catch (e) { return false; }
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
