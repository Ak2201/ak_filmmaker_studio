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
import { prefersReducedMotion, splitWords, countUp, spotlight, magnetic } from '../lib/motion.js';

const doc = typeof document !== 'undefined' ? document : null;
const WANT = !!doc && !prefersReducedMotion() && !navigator.webdriver && 'IntersectionObserver' in window;
const T0 = Date.now();
const WINDOW = 4000;
const BACKSTOP = 8000;

const CARDS = '.door, .start-card, .tool-card, .project-card, .film-card, .director-card, .rule-card, .fest-card, .job-card, .db-tile, .db-card, .db-proj, .lx-mod, .ct-person';
const ROWS = '.bd-scene, .sb-shot';
const NUMS = '.hero-stat .num, .bd-stat strong, .db-num, .db-big-num, .rp-stat strong, .cx-stats .bd-stat strong';
const FILLS = '.progress-fill-bar, .db-bar-fill, .rp-meter-fill, .st-bar-fill, .tw-fill, .js-fill, .bb-bar-fill, .fm-bar-fill';
const HEADS = 'main h2';
const MAGNETS = 'main .btn.primary.db-big, main .hero .btn.primary';

const seen = new WeakSet();
const kinds = new WeakMap();
const pending = new Set();
let io = null;

const fresh = () => Date.now() - T0 < WINDOW;
const inView = (n) => { const r = n.getBoundingClientRect(); return r.width + r.height > 0 && r.top < innerHeight && r.bottom > 0; };

function show(n) {
  pending.delete(n);
  if (io) io.unobserve(n);
  const k = kinds.get(n);
  if (k === 'head') { if (!n.closest('[hidden]')) splitWords(n); return; }
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

function scan(root) {
  const isNew = fresh();
  const counts = new Map();
  const stagger = (n) => {
    const p = n.parentElement;
    const c = counts.get(p) || 0;
    counts.set(p, c + 1);
    n.style.setProperty('--i', Math.min(c, 8));
  };

  pick(root, HEADS).forEach((h) => {
    if (seen.has(h)) return;
    seen.add(h);
    if (!okHead(h)) return;
    if (inView(h)) { splitWords(h); return; }
    if (isNew) watch(h, 'head');
  });

  pick(root, CARDS + ',' + ROWS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    const row = n.matches(ROWS);
    n.classList.add(row ? 'ma-row' : 'ma-card');
    if (!row) {
      const cs = getComputedStyle(n);
      if (cs.position === 'static') n.classList.add('ma-rel');
      if (getComputedStyle(n, '::after').content === 'none') spotlight(n);
    }
    if (isNew) { stagger(n); watch(n, 'card', 'ma-veil'); }
  });

  pick(root, FILLS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (isNew) watch(n, 'fill', 'ma-fill-veil');
  });

  pick(root, NUMS).forEach((n) => {
    if (seen.has(n)) return;
    seen.add(n);
    if (isNew && !n.closest('input, textarea, [contenteditable]')) countUp(n);
  });

  let m = 0;
  pick(root, MAGNETS).forEach((n) => {
    if (seen.has(n) || m++ > 5) return;
    seen.add(n);
    magnetic(n, { strength: 5 });
  });
}

/* ---- the moving tab indicator (TransitionPanel's underline) ---- */
function placeInk(strip) {
  const sel = strip.querySelector('[role="tab"][aria-selected="true"]');
  if (!sel) return;
  strip.style.setProperty('--ink-x', sel.offsetLeft + 'px');
  strip.style.setProperty('--ink-w', String(sel.offsetWidth));
}
function wireTabs() {
  document.querySelectorAll('.tabs:not([data-ma-ink])').forEach((strip) => {
    strip.dataset.maInk = '1';
    const ink = document.createElement('span');
    ink.className = 'tabs-ink';
    ink.setAttribute('aria-hidden', 'true');
    strip.append(ink);
    placeInk(strip);
    requestAnimationFrame(() => requestAnimationFrame(() => strip.classList.add('ma-ink-ready')));
    new MutationObserver(() => placeInk(strip)).observe(strip, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  });
}
function replaceInk() { document.querySelectorAll('.tabs[data-ma-ink]').forEach(placeInk); }

/* ---- the shell band slides down once ----------------------------- */
let bandDone = false;
function band() {
  if (bandDone) return;
  const b = document.querySelector('.sh-bar');
  if (!b) return;
  bandDone = true;
  b.classList.add('ma-band');
}

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
  /* The palette re-renders its rows on every keystroke, so its stagger
     is the OPENING only: a class on <html> for a moment. */
  let wasOpen = false;
  new MutationObserver(() => {
    const open = document.body.classList.contains('pal-open');
    if (open && !wasOpen) {
      document.documentElement.classList.add('ma-pal-fresh');
      setTimeout(() => document.documentElement.classList.remove('ma-pal-fresh'), 700);
    }
    wasOpen = open;
  }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', replaceInk, { passive: true });
  addEventListener('hashchange', () => requestAnimationFrame(replaceInk));
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(replaceInk);
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
    if (fresh()) scan(document.body);
    else for (const n of added) if (n.isConnected) scan(n);
    added = new Set();
    wireTabs(); band();
  };
  tick();
  new MutationObserver((records) => {
    if (!fresh()) {
      for (const r of records) for (const n of r.addedNodes) if (n.nodeType === 1) added.add(n);
      if (!added.size) return;
    }
    if (!queued) queued = requestAnimationFrame(tick);
  }).observe(document.body, { childList: true, subtree: true });
  wireEvents();
  setTimeout(() => { pending.forEach((n) => { if (inView(n)) show(n); }); }, BACKSTOP);
  /* Printing reveals everything still waiting (motion-app.css also
     overrides the veils under print media). */
  addEventListener('beforeprint', () => { Array.from(pending).forEach(show); });
  /* Whatever is still veiled and NOT on screen at the backstop keeps
     waiting for its scroll; the veil never outlives a reveal. */
}

if (WANT) {
  doc.documentElement.classList.add('ma-on');
  const go = () => boot();
  if (doc.body) go(); else doc.addEventListener('DOMContentLoaded', go, { once: true });
}
