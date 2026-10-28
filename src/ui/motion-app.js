/* ============================================================
   MOTION (app pages) — the studio-wide animation layer, modelled on
   Motion Primitives: AnimatedGroup, InView, TransitionPanel,
   Spotlight, GlowEffect, AnimatedNumber, Magnetic. Loaded once by
   chrome.js, so every page that has the chrome has it.

   - Touches NO storage. Idempotent.
   - JS-only hidden states: `ma-on` is put on <html> only when motion
     is wanted (not reduced, and not an automated browser, which is
     what verify is); nothing is veiled without it. An 8s backstop
     reveals anything still waiting that is on screen.
   - Re-renders never replay: every node is remembered in a WeakSet,
     and nothing NEW is veiled or counted once WINDOW ms have passed
     since load, so a list that re-renders on each edit stays still.
   - Distances live in motion-app.css, multiplied by --motion.
   ============================================================ */
import { lowEndDevice } from './motion-pref.js';
import { prefersReducedMotion } from '../lib/motion.js';

const doc = typeof document !== 'undefined' ? document : null;
const WANT = !!doc && !prefersReducedMotion() && !lowEndDevice() && !navigator.webdriver && 'IntersectionObserver' in window;
/* ENTRANCES ONLY ON ARRIVAL (19 Oct 2026). This is a multi-page app, so
   every click between two studio pages is a page load, and replaying the
   page fade and the card rise on each of them is motion seen tens of
   times a day. They play when the visitor came from OUTSIDE the studio
   (a bookmark, a link, a fresh tab) and not on a same-origin hop. Read
   from document.referrer only; no storage. `ma-on` (exits, modal
   transitions, the sheet) is unaffected. */
const sameOrigin = () => {
  try { return !!document.referrer && new URL(document.referrer).origin === location.origin; }
  catch (_) { return false; }
};
const ENTER = WANT && !sameOrigin();
const T0 = Date.now();
const WINDOW = 4000;
const BACKSTOP = 8000;

/* RESTORED 11 Oct 2026. Wave 3 (c7b0b2f) deleted this line and left its
   only use at `pick(root, HEADS)` below, so scan() threw
   `ReferenceError: HEADS is not defined` on every page in a real
   browser — and took the Supabase SDK import down with it, which is
   how it presented: Google sign-in bouncing people back to the
   landing page, signed out. Nothing caught it because WANT above
   switches this whole module off under `navigator.webdriver`. */
const HEADS = 'main h2';
/* .lx-mod is not here: launcher.css's own lx-arrive already brings the
   launcher's tiles in, and two systems on one element meant one won by
   order. */
const CARDS = '.door, .start-card, .tool-card, .project-card, .film-card, .director-card, .rule-card, .fest-card, .job-card, .db-tile, .db-card, .db-proj, .ct-person';
const ROWS = '.bd-scene, .sb-shot';
const FILLS = '.progress-fill-bar, .db-bar-fill, .rp-meter-fill, .st-bar-fill, .tw-fill, .js-fill, .bb-bar-fill, .fm-bar-fill';

const seen = new WeakSet();
const kinds = new WeakMap();
const pending = new Set();
let io = null;

const fresh = () => Date.now() - T0 < WINDOW;
const entering = () => ENTER && fresh();
const inView = (n) => { const r = n.getBoundingClientRect(); return r.width + r.height > 0 && r.top < innerHeight && r.bottom > 0; };

function show(n) {
  pending.delete(n);
  if (io) io.unobserve(n);
  const k = kinds.get(n);
  if (k === 'fill') { n.classList.remove('ma-fill-veil'); n.classList.add('ma-fill-in'); return; }
  n.classList.remove('ma-veil'); n.classList.add('ma-in');
}

function watch(n, kind, veilClass) {
  kinds.set(n, kind);
  if (veilClass) n.classList.add(veilClass);
  pending.add(n);
  io.observe(n);
}

function okHead(h) {
  if (h.dataset.moSplit || h.closest('.modal, .pal-box, form, [contenteditable], [hidden]')) return false;
  if (h.querySelector('a, button, input, textarea, select, [data-key], svg, img')) return false;
  return h.textContent.trim().length > 0 && h.textContent.length < 120;
}

/* root itself as well as its descendants: after the window only the
   ADDED nodes are scanned, and an added node may be the card itself. */
const pick = (root, sel) => {
  const out = Array.from(root.querySelectorAll(sel));
  if (root.matches && root.matches(sel)) out.unshift(root);
  return out;
};

/* THE ENTRANCE PLAYS ONCE PER PAGE LOAD. Pages rebuild <main> whenever auth,
   the gate or a fetch lands (the console did it five times in a second),
   and every replacement re-ran the page fade, re-veiled every card and
   re-counted every number: the page blinked blank three or four times.
   A main added after the first one is marked `ma-same-page`; it gets no
   entrance and its contents are not veiled. */
let mainSeen = !!document.querySelector('main');
/* `[data-ma-painted]` is the same idea for a container a page redraws in
   place (the hub's project grid): its nodes are re-added, not new. */
const replay = (n) => !(n.closest && n.closest('main.ma-same-page, [data-ma-painted]'));
function markReplacedMain(records) {
  for (const r of records) for (const n of r.addedNodes) {
    if (n.nodeName !== 'MAIN') continue;
    if (mainSeen) n.classList.add('ma-same-page');
    mainSeen = true;
  }
}

function scan(root) {
  const isNew = entering();
  const counts = new Map();
  const stagger = (n) => {
    const p = n.parentElement;
    const c = counts.get(p) || 0;
    counts.set(p, c + 1);
    n.style.setProperty('--i', Math.min(c, 5));   /* 30ms x 5: the last card starts by 150ms */
  };

  pick(root, HEADS).forEach((h) => {
    if (seen.has(h)) return;
    seen.add(h);
    if (!okHead(h)) return;
    /* A heading already on screen is left alone. It used to be
       `splitWords(h)`, and that call is why this file threw: Wave 3
       pruned `splitWords` from the import above and the HEADS const
       below, and left both uses behind. Removing the call rather than
       restoring the import is deliberate — the same commit also
       dropped `show()`'s `k === 'head'` branch, so a heading scrolled
       into view already gets the plain veil/reveal and not a split.
       Word-splitting was kept for the LANDING page, where
       motion-landing.js still does it to the hero. Putting it back
       here would be reviving something that was pruned on purpose. */
    if (inView(h)) return;
    if (isNew && replay(h)) watch(h, 'head');
  });

  pick(root, CARDS + ',' + ROWS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    const row = n.matches(ROWS);
    n.classList.add(row ? 'ma-row' : 'ma-card');
    /* No pointer spotlight: it wrote --mx/--my onto the card on every
       pointermove, which restyles every child, and decorative tracking
       on a working surface is noise. (lib/motion.js keeps it for the
       landing page.) */
    if (!row && getComputedStyle(n).position === 'static') n.classList.add('ma-rel');
    if (isNew && replay(n)) { stagger(n); watch(n, 'card', 'ma-veil'); }
  });

  pick(root, FILLS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (isNew && replay(n)) watch(n, 'fill', 'ma-fill-veil');
  });

  /* No count-up and no magnetic buttons on app pages: a figure on a
     dashboard is data being read, and a button that drifts toward the
     pointer is a target that moves. */
}

/* ---- PANELS: the motion package (owner, 28 Oct 2026) -------------
   The studio's larger surfaces — the launcher's row cards, the
   dashboard's Continue, readiness and title-page cards — rise in as
   they scroll into view, a few at a time, with `animate` from the
   bundled `motion` package (motion/mini: the WAAPI driver, ~2.5 KB,
   fetched only when motion is wanted, so it is in no page's first
   paint and verify, under webdriver, never loads it).

   Calm by construction: 10px × --motion over 320ms, a 40ms stagger
   capped at five, once per element per page load. A panel already on
   screen at load is left alone unless the visitor arrived from outside
   the studio (the same rule as the cards above), a panel that holds
   the fragment target is never veiled (a rising target is a jump that
   lands in the wrong place), and after the first WINDOW ms nothing new
   is veiled, so a re-render never replays. The veil is opacity only
   (motion-app.css .ma-pveil, under html.ma-on), lifted by the 8s
   backstop and by printing whatever happens to the import. */
const PANELS = '.lx-row, .db-continue, .db-main > .db-sec, .db-main > .db-title-page';
let miniAnimate = null;
const loadMini = () => (miniAnimate || (miniAnimate = import('motion/mini').then((m) => m.animate, () => null)));
const pveiled = new Set();
let panelIO = null;
let panelQueue = 0;
const hashTarget = () => {
  try { return location.hash.length > 1 ? document.getElementById(decodeURIComponent(location.hash.slice(1))) : null; }
  catch (e) { return null; }
};
function liftPanel(n) {
  pveiled.delete(n);
  n.classList.remove('ma-pveil');
}
function playPanel(n, i) {
  loadMini().then((animate) => {
    if (!n.isConnected) { pveiled.delete(n); return; }
    const m = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--motion'));
    const dist = 10 * (Number.isFinite(m) ? m : 1);
    /* the veil comes off and the animation starts in the same task, so
       no frame paints the panel at full opacity first */
    liftPanel(n);
    if (!animate) return;
    try {
      animate(n, { opacity: [0, 1], transform: ['translateY(' + dist + 'px)', 'none'] },
        { duration: 0.32, delay: Math.min(i, 5) * 0.04, ease: [0.22, 1, 0.36, 1] });
    } catch (e) { /* an engine without WAAPI: the panel is simply there */ }
  });
}
function panels(root) {
  if (!fresh()) return;
  panelIO = panelIO || new IntersectionObserver((entries) => {
    for (const en of entries) {
      if (!en.isIntersecting) continue;
      panelIO.unobserve(en.target);
      playPanel(en.target, panelQueue++);
      setTimeout(() => { panelQueue = 0; }, 200);
    }
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.04 });
  const t = hashTarget();
  pick(root, PANELS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (!replay(n)) return;
    if (t && (n === t || n.contains(t) || t.contains(n))) return;
    if (inView(n) && !entering()) return;
    n.classList.add('ma-pveil');
    pveiled.add(n);
    panelIO.observe(n);
  });
}

/* The sliding tab underline (span.tabs-ink) is gone: the selected row's
   own fill is the marker, and in the side menu `bottom: 0` put the line
   under the last row. See tabs.css. */

/* The shell band no longer slides in: persistent navigation does not
   move on every page load. */

/* ---- small, event-driven touches --------------------------------- */
function wireEvents() {
  document.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('.step-check li');
    if (!li) return;
    li.classList.remove('ma-tick');
    void li.offsetWidth;
    li.classList.add('ma-tick');
    setTimeout(() => li.classList.remove('ma-tick'), 500);
  }, true);
  /* The command palette is deliberately NOT animated (keyboard, 100+
     times a day); its row stagger and observer are gone. */
}

/* Infinite animations only run while their element is on screen. */
const LOOPS = '.mo-marquee, .mo-aurora, .mo-trail, .mo-shine-loop, .save-indicator.saving';
const looped = new WeakSet();
let loopIO = null;
function pauseOffscreen(root) {
  loopIO = loopIO || new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle('ma-paused', !e.isIntersecting)));
  root.querySelectorAll(LOOPS).forEach((n) => { if (!looped.has(n)) { looped.add(n); loopIO.observe(n); } });
}

function boot() {
  io = new IntersectionObserver((entries) => {
    for (const en of entries) if (en.isIntersecting) show(en.target);
  }, { rootMargin: '0px 0px -6% 0px', threshold: 0.02 });
  /* Inside the first WINDOW ms the whole page is scanned on each frame
     with changes. After it only the ADDED elements are: five
     document-wide queries per frame for the life of the page cost 2-3ms
     on the feature blueprint, and the observer fires on every keystroke
     in a field that re-renders (224 times in 2.5s of typing). */
  let queued = 0;
  let added = new Set();
  const tick = () => {
    queued = 0;
    if (fresh()) { scan(document.body); panels(document.body); }
    else for (const n of added) if (n.isConnected) scan(n);
    if (fresh()) pauseOffscreen(document.body); else for (const n of added) if (n.isConnected && n.querySelectorAll) pauseOffscreen(n);
    added = new Set();
  };
  tick();
  new MutationObserver((records) => {
    markReplacedMain(records);
    if (!fresh()) {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) added.add(n);
      if (!added.size) return;
    }
    if (!queued) queued = requestAnimationFrame(tick);
  }).observe(document.body, { childList: true, subtree: true });
  wireEvents();
  setTimeout(() => { pending.forEach((n) => { if (inView(n)) show(n); }); pveiled.forEach((n) => { if (inView(n)) liftPanel(n); }); }, BACKSTOP);
  /* a link to a section further down (#readiness) must not land on a veil */
  addEventListener('hashchange', () => { const t = hashTarget(); if (t) pveiled.forEach((n) => { if (n === t || n.contains(t) || t.contains(n)) liftPanel(n); }); });
  /* Printing reveals everything still waiting (motion-app.css also
     overrides the veils under print media). */
  addEventListener('beforeprint', () => { Array.from(pending).forEach(show); Array.from(pveiled).forEach(liftPanel); });
  /* Whatever is still veiled and NOT on screen at the backstop keeps
     waiting for its scroll; the veil never outlives a reveal. */
}

if (WANT) {
  doc.documentElement.classList.add('ma-on');
  if (ENTER) doc.documentElement.classList.add('ma-enter');
  const go = () => boot();
  if (doc.body) go(); else doc.addEventListener('DOMContentLoaded', go, { once: true });
}
