/* ============================================================
   MARKETING — the public product pages' only script
   ------------------------------------------------------------
   product-*.html (and pricing.html) sit OUTSIDE the site gate, like
   start.html, and keep their words in the markup: scripts/make-marketing-
   pages.mjs writes them. This module adds only what cannot be static.

   WHAT IT MAY IMPORT. Stylesheets and the pure leaf libraries start.js
   already uses (funnel.js, trial-time.js, invite-code.js, region-core.js in the `startlib`
   chunk; start-auth.js, which reaches only auth-scope.js). NOT store.js,
   chrome.js, cloud.js, gate.js, plan-gate.js, billing.js, dom.js or
   modal-focus.js: every one of those lives in (or drags in) the `studio`
   CORE chunk, about a megabyte, on a page that exists to be instant.
   `prove:growth` asserts that no supabase-* chunk and no studio-* chunk is
   fetched on a product page. This page's JS stays a few KB.

   What it adds, in order:
     1. the `mk-js` class and the icon font's readiness
     2. the header's scroll state (solid once the page has moved)
     3. the Product mega-menu and the phone menu
     4. the step slot: one shared frame, the stills cross-fade
     5. the sign-up modal: Google through start-auth.js, the live offer line
     6. an invite code in the address bar (held, stripped, announced) —
        the same hold start.js does, so a code link works from any page
     7. the demo loops, played while on screen
     8. the lines a visitor outside India reads instead (data-mk-intl)
   ============================================================ */
import '../styles/base.css';
import '../styles/marketing.css';
import { bumpEvent, purchasesRequired, trialOffer } from '../lib/funnel.js';
import { trialLength } from '../lib/trial-time.js';
import { codeFromLocation, setCodePass } from '../lib/invite-code.js';
import * as StartAuth from '../lib/start-auth.js';
import { guessVisitorRegion, normaliseRegion } from '../lib/region-core.js';

const root = document.documentElement;
const $ = (sel, from = document) => from.querySelector(sel);
const $$ = (sel, from = document) => Array.from(from.querySelectorAll(sel));
const byId = (id) => document.getElementById(id);

/* ---- 1. the class, and the icon font ------------------------------
   The marks are Material Symbols ligatures: until the face has LOADED a
   span holds a symbol's NAME, which base.css keeps invisible behind
   html:not(.sym-ready). chrome.js does this on app pages; these pages
   load no chrome, so the same few lines run here. */
root.classList.add('mk-js');
(function symbolFontReady() {
  const done = () => root.classList.add('sym-ready');
  let fonts;
  try { fonts = document.fonts; } catch (e) { fonts = null; }
  if (!fonts || typeof fonts.forEach !== 'function') return done();
  const check = () => {
    if (root.classList.contains('sym-ready')) return;
    let ok = false;
    fonts.forEach((f) => { if (f.status === 'loaded' && /Material Symbols/i.test(f.family)) ok = true; });
    if (ok) done();
  };
  check();
  try { fonts.addEventListener('loadingdone', check); } catch (e) { /* older engines */ }
  try { fonts.ready.then(check); } catch (e) { /* older engines */ }
  addEventListener('load', check, { once: true });
})();

const top = byId('mkTop');

/* ---- 2. the header: transparent over the hero, solid once scrolled --
   A sentinel at the very top of the document: when it leaves the viewport
   the page has moved. No scroll listener where IntersectionObserver
   exists; one passive listener where it does not. */
(function headerState() {
  if (!top) return;
  const set = (solid) => top.classList.toggle('is-solid', solid);
  const sentinel = byId('mkSentinel');
  if (sentinel && 'IntersectionObserver' in window) {
    new IntersectionObserver((entries) => {
      for (const e of entries) set(!e.isIntersecting);
    }, { threshold: 0 }).observe(sentinel);
  } else {
    const on = () => set((window.scrollY || root.scrollTop) > 8);
    addEventListener('scroll', on, { passive: true });
    on();
  }
})();

/* ---- 3. the mega-menu and the phone menu ---------------------------
   Product is an <a href="start.html#tools"> in the markup (only the home page has #tools), so with scripts off it
   jumps to the list of every tool. Here it becomes the disclosure for the
   four-column panel: click, Enter and Space toggle it; hover opens it
   with a short grace period (mouse only, desktop width); Escape closes it
   and returns focus; so does a click outside. At phone width the panel's
   columns are simply part of the menu sheet and Product is not shown. */
const wide = (() => { try { return matchMedia('(min-width: 900px)'); } catch (e) { return { matches: true }; } })();
const prod = byId('mkProd');
const item = prod && prod.closest('.mk-nav-item');
const burger = byId('mkBurger');
let closeTimer = 0;
let hoverOpened = false;

function setMega(open, { focus = false } = {}) {
  if (!open) hoverOpened = false;
  if (!prod || !item) return;
  clearTimeout(closeTimer);
  if (open) item.setAttribute('data-open', ''); else item.removeAttribute('data-open');
  prod.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (top) { if (open) top.setAttribute('data-mega', ''); else top.removeAttribute('data-mega'); }
  if (!open && focus) prod.focus();
}
function setMenu(open, { focus = false } = {}) {
  if (!burger || !top) return;
  if (open) top.setAttribute('data-menu', ''); else top.removeAttribute('data-menu');
  burger.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (!open && focus) burger.focus();
}
if (prod && item) {
  prod.setAttribute('role', 'button');
  prod.addEventListener('click', (e) => {
    e.preventDefault();
    if (!wide.matches) return;
    /* a mouse that hovered it open and then clicks means "keep it", not "close it" */
    if (hoverOpened && item.hasAttribute('data-open')) { hoverOpened = false; return; }
    setMega(!item.hasAttribute('data-open'));
  });
  prod.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); prod.click(); }
    if (e.key === 'ArrowDown') { e.preventDefault(); setMega(true); const first = $('.mk-mega a', item); if (first) first.focus(); }
  });
  item.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && wide.matches && !item.hasAttribute('data-open')) { setMega(true); hoverOpened = true; } });
  item.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || !wide.matches) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => setMega(false), 160);
  });
  item.addEventListener('focusout', (e) => {
    if (wide.matches && !item.contains(e.relatedTarget) && item.hasAttribute('data-open')) setMega(false);
  });
}
if (burger && top) {
  burger.addEventListener('click', (e) => {
    e.preventDefault();
    setMenu(!top.hasAttribute('data-menu'));
  });
}
document.addEventListener('click', (e) => {
  if (item && item.hasAttribute('data-open') && !item.contains(e.target)) setMega(false);
  if (top && top.hasAttribute('data-menu') && !top.contains(e.target)) setMenu(false);
  /* following a link inside the phone sheet closes it */
  if (top && top.hasAttribute('data-menu') && e.target.closest && e.target.closest('.mk-nav a[href]')) setMenu(false);
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  if (modal && !modal.hidden) return;                       // the modal owns Escape while open
  if (item && item.hasAttribute('data-open')) { setMega(false, { focus: true }); return; }
  if (top && top.hasAttribute('data-menu')) setMenu(false, { focus: true });
});
try { (wide.addEventListener ? wide.addEventListener.bind(wide, 'change') : wide.addListener.bind(wide))(() => { setMega(false); setMenu(false); }); } catch (e) { /* no media query events */ }

/* ---- 4. the step slot ----------------------------------------------
   Roving tabindex over a vertical tablist. The slot holds every step's
   still stacked in one grid cell; selecting a step fades its still in and
   the previous one out (CSS; prefers-reduced-motion makes it instant).
   Hover, click and focus all select, and the arrow keys, Home and End
   move between steps. Nothing autoplays: these are stills. */
(function stepSlot() {
  const how = $('.mk-how');
  if (!how) return;
  const tabs = $$('.mk-step', how);
  const stills = $$('.mk-still', how);
  const panel = byId('mkSlot');
  if (!tabs.length || tabs.length !== stills.length) return;
  /* the panel holds no focusable child, so it is itself a keyboard stop (APG) */
  if (panel) panel.tabIndex = 0;
  function select(i, { focus = false } = {}) {
    tabs.forEach((t, k) => {
      const on = k === i;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      stills[k].classList.toggle('is-on', on);
      if (on) stills[k].removeAttribute('aria-hidden'); else stills[k].setAttribute('aria-hidden', 'true');
    });
    if (panel) panel.setAttribute('aria-labelledby', tabs[i].id);
    if (focus) tabs[i].focus();
  }
  tabs.forEach((t, i) => {
    t.addEventListener('click', () => select(i));
    t.addEventListener('focus', () => select(i));
    /* hover selects only after the pointer rests on a step, so a mouse
       crossing the list on its way elsewhere changes nothing */
    let hoverTimer = 0;
    t.addEventListener('pointerenter', (e) => {
      if (e.pointerType !== 'mouse') return;
      clearTimeout(hoverTimer);
      hoverTimer = setTimeout(() => select(i), 150);
    });
    t.addEventListener('pointerleave', () => clearTimeout(hoverTimer));
  });
  how.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const n = tabs.length;
    const to = { ArrowDown: (i + 1) % n, ArrowRight: (i + 1) % n, ArrowUp: (i - 1 + n) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(to, { focus: true });
  });
})();

/* ---- 5. the sign-up modal and Google --------------------------------
   Every "Get started" / "Sign up" is already <a href="invite.html"
   data-open-signup> in the markup, a real door for a reader with scripts
   off. With scripts on it opens the modal instead; the modal's Google
   link is <a href="invite.html" data-start-auth="google"> too, and is
   intercepted only when the build has a Supabase project to send people
   to (start-auth.js), exactly as start.js does. A visitor who is already
   signed in is sent to the studio instead of being asked again. */
const modal = byId('mkSignup');
const msg = byId('mkMsg');
const says = (text, bad) => { if (!msg) return; msg.textContent = text; msg.classList.toggle('mk-bad', !!bad); };
const SIGNED_IN = StartAuth.hasStoredSession();
let opener = null;

if (SIGNED_IN) {
  root.dataset.signedin = '1';
  for (const a of $$('[data-start-auth="google"], [data-open-signup]')) a.setAttribute('href', '/');
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trap(e) {
  if (e.key !== 'Tab' || !modal || modal.hidden) return;
  const list = $$(FOCUSABLE, modal).filter((n) => !n.closest('[hidden]') && n.getClientRects().length > 0);
  if (!list.length) { e.preventDefault(); return; }
  const first = list[0], last = list[list.length - 1];
  const inside = modal.contains(document.activeElement);
  if (e.shiftKey && (document.activeElement === first || !inside)) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && (document.activeElement === last || !inside)) { e.preventDefault(); first.focus(); }
}
function openModal() {
  if (!modal || !modal.hidden) return;
  opener = document.activeElement;
  setMega(false); setMenu(false);
  says('');
  modal.hidden = false;
  root.classList.add('mk-modal-open');
  document.addEventListener('keydown', trap, true);
  const go = byId('mkGoogle') || $('.mk-modal-card', modal);
  if (go) go.focus();
}
function closeModal() {
  if (!modal || modal.hidden) return;
  modal.hidden = true;
  root.classList.remove('mk-modal-open');
  document.removeEventListener('keydown', trap, true);
  if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus();
  opener = null;
  if (location.hash === '#signup') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ } }
}
if (modal) {
  modal.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-close]')) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !modal.hidden) { e.preventDefault(); closeModal(); } });
}

document.addEventListener('click', (e) => {
  const plain = e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey;
  const opens = e.target.closest && e.target.closest('[data-open-signup]');
  if (opens && !e.defaultPrevented && plain && modal && !SIGNED_IN) { e.preventDefault(); openModal(); return; }
  const a = e.target.closest && e.target.closest('[data-start-auth="google"]');
  if (!a || e.defaultPrevented || SIGNED_IN || !plain) return;
  if (!StartAuth.configured()) return;                      // no project: the markup's door stands
  e.preventDefault();
  bumpEvent('signup');
  /* the modal's own line, or the modal opened just to say it */
  if (modal && modal.hidden) openModal();
  says('Taking you to Google…');
  try {
    if (!StartAuth.startGoogle({ redirectTo: StartAuth.defaultRedirect() })) location.href = a.href;
  } catch (err) {
    says('Could not open the Google sign-in just now. Try again, or use the invite page.', true);
  }
});
if (location.hash === '#signup' && !SIGNED_IN) openModal();

/* The live offer line, read the way start.js reads it. The markup keeps
   the trial wording (what a crawler and a failed request see). Signed in
   wins over purchases-off; purchases off drops the promise of a trial,
   because nothing starts one by itself and the studio is open; a trial
   switched off removes the line; the trial's real length replaces "a
   limited time". textContent only: nothing here builds markup from a
   server string. */
function swapWords(off) {
  for (const n of $$('[data-open-text], [data-off-text]')) {
    const t = SIGNED_IN && n.dataset.openText ? n.dataset.openText : (off ? n.dataset.offText : '');
    if (!t) continue;
    if (n.dataset.origText === undefined) n.dataset.origText = n.textContent;
    n.textContent = t;
  }
}
swapWords(false);
try {
  purchasesRequired().then((req) => { if (req === false) { root.dataset.purchases = 'off'; swapWords(true); } }, () => {});
} catch (e) { /* never breaks the page */ }
try {
  trialOffer().then((t) => {
    if (!t) return;
    const offer = byId('mkOffer');
    if (t.trial_enabled === false) { if (offer && !SIGNED_IN && root.dataset.purchases !== 'off') offer.hidden = true; return; }
    const len = trialLength(t.trial_minutes);
    if (len) $$('[data-trial-length]').forEach((n) => { n.textContent = len; });
  }, () => {});
} catch (e) { /* never breaks the page */ }

/* ---- 6. an invite code in the address bar ---------------------------
   start.html#code=XXXX-XXXX is the link the console copies, and the same
   code works from any page that carries this script. It is HELD in this
   browser (cloud.js's runGate() redeems it for the account that signs in:
   a code is worth a trial, and a trial is counted against a person, so
   the code has to meet an account), stripped from the address bar at once
   so it does not travel in a screenshot or sit in a shared machine's
   history, and announced in the sign-up modal. replaceState, not
   pushState, so Back does not restore it. */
(function holdInviteCode() {
  let code = '';
  try { code = codeFromLocation(); } catch (e) { return; }
  if (!code) return;
  try { setCodePass(code, { from: 'marketing' }); } catch (e) { /* private mode */ }
  try { history.replaceState(null, '', location.pathname + location.search); } catch (e) { /* */ }
  if (!SIGNED_IN) openModal();
  says('Invite code saved: it is applied when you sign in.');
})();

/* ---- 7. the demo loops play while they are on screen ---------------
   Every player is muted, looped and preload="none". A loop below the fold
   downloads nothing until half of it scrolls into view; then it loads and
   plays, and it pauses when it leaves. The HERO's loop is in view on load,
   so it does download on every visit (about 90-310KB): that is a choice,
   and to keep it off the first paint the observer only starts after the
   page's `load` event, so the poster (preloaded) is the first screen.
   The native controls stay in the markup and are the pause control WCAG
   2.2.2 asks for, and A PAUSE STAYS A PAUSE: a pause the visitor made is
   remembered (data-user-paused) and the observer never restarts that
   video; pressing play clears it. Skipped entirely under reduced motion
   and Save-Data: the poster stays and the visitor can press play. A
   play() that the browser refuses (autoplay policy) leaves the poster. */
(function playInView() {
  const vids = $$('video');
  if (!vids.length || !('IntersectionObserver' in window)) return;
  try {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (navigator.connection && navigator.connection.saveData) return;
  } catch (e) { return; }
  const auto = new WeakSet(); /* play/pause calls the observer made */
  const io = new IntersectionObserver((entries) => {
    for (const e of entries) {
      const v = e.target;
      if (e.isIntersecting) {
        if (v.dataset.userPaused || !v.paused) continue;
        if (v.preload !== 'auto') v.preload = 'auto';
        auto.add(v);
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => { auto.delete(v); });
      } else if (!v.paused) { auto.add(v); v.pause(); }
    }
  }, { threshold: 0.5 });
  vids.forEach((v) => {
    v.addEventListener('pause', () => {
      if (auto.has(v)) auto.delete(v);
      else if (!v.ended) v.dataset.userPaused = '1';
    });
    v.addEventListener('play', () => {
      if (auto.has(v)) auto.delete(v);
      else delete v.dataset.userPaused;
    });
  });
  const start = () => vids.forEach((v) => io.observe(v));
  if (document.readyState === 'complete') start();
  else addEventListener('load', start, { once: true });
})();

/* ---- 8. lines for a visitor outside India ---------------------------
   REGION-CONTENT (docs/US-MARKET-PLAN.md §E). The pages are written with
   the India lines (crawlers and no-JS visitors read those, as before); a
   line that has an `…Elsewhere` variant in src/data/marketing-*.json
   carries it as data-mk-intl, and for a visitor whose region is not India
   the text is swapped in. The region is the device's own stated market
   (`fms_region_v1`, read raw: this page loads no store.js) or else the
   browser's local guess (region-core.js guessVisitorRegion: time zone
   and language, never a network call, never an IP). Reads only. */
export function visitorRegion() {
  let chosen = '';
  try { chosen = normaliseRegion(localStorage.getItem('fms_region_v1')); } catch (e) { /* no storage */ }
  return chosen || guessVisitorRegion();
}
(function regionLines() {
  const els = $$('[data-mk-intl]');
  if (!els.length || visitorRegion() === 'IN') return;
  root.setAttribute('data-mk-region', 'INT');
  els.forEach((el) => { el.textContent = el.getAttribute('data-mk-intl'); });
})();
