/* ============================================================
   MARKETING — the public product pages' only script
   ------------------------------------------------------------
   product-*.html (and pricing.html) sit OUTSIDE the site gate, like
   start.html, and keep their words in the markup: scripts/make-marketing-
   pages.mjs writes them. This module adds only what cannot be static.

   WHAT IT MAY IMPORT. Stylesheets and the pure leaf libraries start.js
   already uses (funnel.js, trial-time.js, invite-code.js, pass-offer.js
   in the `startlib` chunk; start-auth.js, which reaches only auth-scope.js; visitor-region.js,
   which reaches only region-core.js). NOT store.js,
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
     5b. the LAUNCH PASS: the band, its countdown and every [data-pass-*]
        slot, from trial_offer().pass through pass-offer.js
     5c. the OFFER TERMS: every [data-offer-terms] slot and [data-mode-answer]
        line, from trial_offer()'s pass.mode / plan_mode through offer-terms.js
     6. an invite code in the address bar (held, stripped, announced) —
        the same hold start.js does, so a code link works from any page
     7. the demo loops, played while on screen
     8. the lines a visitor outside India reads instead (data-mk-intl)
     9. the launch-offers form ([data-lead-form]), when a page has one
   Before any of it: the link's ?ref= and source are held for the tab
   (attribution.js), so a code in an ad or a referral link reaches the
   checkout's code box after the Google round trip.
   ============================================================ */
import '../styles/base.css';
import '../styles/marketing.css';
import { bumpEvent, bumpOnce, sourceBucket, purchasesRequired, trialOffer, addLead } from '../lib/funnel.js';
import { captureAttribution, attribution } from '../lib/attribution.js';
import { deviceReducedMotion } from '../lib/device-motion.js';
import { passCopy, validEmail, consentText } from '../lib/start-model.js';
import * as PassOffer from '../lib/pass-offer.js';
import { offerTerms, readMode } from '../lib/offer-terms.js';
import { codeFromLocation, setCodePass } from '../lib/invite-code.js';
import * as StartAuth from '../lib/start-auth.js';
import { visitorRegion } from '../lib/visitor-region.js';
import { animate } from 'motion/mini';   // the motion package's WAAPI animate(), ~8 KB; see 10

/* First, before a script below can strip or rewrite the address. */
try { captureAttribution(location); } catch (e) { /* never breaks the page */ }

/* The landing count, on whichever public page a visit starts: a guide,
   a switching guide, the trust page, a product page, pricing, about or
   contact. Once per tab (bumpOnce keeps its mark in sessionStorage, the
   same mark start.js uses, so moving on to start.html counts nothing
   more); Do Not Track, Global Privacy Control and "Don't count this
   visit" are honoured inside funnel.js. start.html counts its own in
   start.js. After captureAttribution, so the count carries the link's
   source bucket. */
try {
  if (!/(^|\/)start(\.html)?$/.test(location.pathname)) bumpOnce('landing_view');
} catch (e) { /* a counter never breaks the page */ }

const root = document.documentElement;
/* The device's own "Reduce motion" switch (Settings > Preferences), read
   here as well as the OS preference (28 Oct 2026), and applied the way
   src/ui/motion-pref.js applies it: html.ma-off and --motion: 0. */
const deviceReduce = deviceReducedMotion();
if (deviceReduce) { root.classList.add('ma-off'); root.style.setProperty('--motion', '0'); }
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
  /* Re-entering (trigger -> gap -> panel is a leave and an enter) must CANCEL the pending close;
     it used to run only when the panel was closed, so the 160ms timer from the leave always won. */
  item.addEventListener('pointerenter', (e) => {
    if (e.pointerType !== 'mouse' || !wide.matches) return;
    clearTimeout(closeTimer);
    if (!item.hasAttribute('data-open')) { setMega(true); hoverOpened = true; }
  });
  item.addEventListener('pointerleave', (e) => {
    if (e.pointerType !== 'mouse' || !wide.matches) return;
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => setMega(false), 260);
  });
  item.addEventListener('focusout', (e) => {
    if (wide.matches && !item.contains(e.relatedTarget) && item.hasAttribute('data-open')) setMega(false);
  });
}
if (burger && top) {
  /* a toggle, not a link: the href stays as the no-JS fallback, and Space
     toggles it instead of scrolling the page */
  burger.setAttribute('role', 'button');
  burger.addEventListener('click', (e) => {
    e.preventDefault();
    setMenu(!top.hasAttribute('data-menu'));
  });
  burger.addEventListener('keydown', (e) => {
    if (e.key === ' ') { e.preventDefault(); burger.click(); }
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
/* The open phone sheet keeps Tab to itself. #mkNav comes BEFORE the
   burger in the DOM, so a plain Tab from the burger walked forward into
   <main>, onto controls the full-screen sheet covers, and the menu's own
   links were reachable only with Shift+Tab. The cycle is the burger, then
   the sheet's visible links in the order they are drawn (the phone sheet
   reorders Sign in and Pricing to the top). */
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Tab' || !burger || !top || !top.hasAttribute('data-menu')) return;
  const nav = byId('mkNav');
  if (!nav) return;
  const links = $$('a[href], button', nav)
    .filter((a) => a.getClientRects().length && getComputedStyle(a).visibility !== 'hidden')
    .map((a) => ({ a, r: a.getBoundingClientRect() }))
    .sort((x, y) => (x.r.top - y.r.top) || (x.r.left - y.r.left))
    .map((x) => x.a);
  const ring = [burger, ...links];
  if (ring.length < 2) return;
  const i = ring.indexOf(document.activeElement);
  const next = ring[(i < 0 ? 0 : i + (e.shiftKey ? -1 : 1) + ring.length) % ring.length];
  e.preventDefault();
  next.focus();
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

/* The live offer line. Signed in wins over purchases-off: the markup's
   words are replaced by data-open-text / data-off-text. textContent
   only: nothing here builds markup from a server string. */
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
  purchasesRequired().then((req) => { if (req === false) { root.dataset.purchases = 'off'; swapWords(true); launchPass.off(); } }, () => {});
} catch (e) { /* never breaks the page */ }

/* ---- 5b. THE LAUNCH PASS (27 Oct 2026) -------------------------------
   The free trial is retired for the public. While the launch offer runs,
   the pages sell a paid pass, and EVERY FIGURE IN IT IS THE SERVER'S:
   trial_offer().pass = { open, amount_paise, days, plan, ends_at, cap,
   left, now }, read through pass-offer.js (passState fails CLOSED: a
   missing or malformed field is no offer at all) and said through
   start-model.js passCopy(). The markup holds no price, no length, no
   date and no count: every [data-pass-only] element is hidden there and
   every slot is empty, so a crawler, verify and a reader with scripts off
   see the [data-pass-off] fallback, which speaks of the yearly plans.

   THE SCARCITY IS TRUE. The countdown runs to the server's deadline on
   the server's clock (`now`, plus the local time elapsed since it was
   read), so every visitor sees the same end and a visitor's own clock
   cannot move it; nothing restarts per visit; at zero the band says the
   offer has ended (the server now refuses it too, quote_pass 'closed'),
   then hides itself and every [data-pass-only] thing; "N of CAP left" is
   the real count of paid passes. No deadline: no timer. Purchases not
   required: no pass (nothing is being sold).

   ACCESSIBILITY. The ticking digits are aria-hidden; [data-pass-spoken]
   carries the same deadline to the MINUTE and is rewritten only when the
   minute changes, and it is not a live region, so a screen reader is
   never interrupted every second. The one announcement is the "has
   ended" line (role=status). No animation anywhere: it is text. */
/* ---- 5c. THE OFFER TERMS (27 Oct 2026) ------------------------------
   Whether a purchase renews is the owner's choice in the console, per
   product (schema §62), so the markup never says it: every sentence that
   would is an EMPTY [data-offer-terms] slot (data-offer-product "year" or
   "pass"), and every line true in one mode only is a hidden
   [data-mode-answer="once"|"renew"] beside a visible "neutral" one. The
   words come from src/lib/offer-terms.js alone, from trial_offer()'s
   top-level plan_mode and pass.mode. A mode that is missing or anything
   but 'once' / 'renew' is UNKNOWN: the slots stay empty and the neutral
   answers stand, so nothing is ever claimed either way. A pass slot speaks
   only while the pass is open (it needs the server's price and length).
   A [data-offer-wrap] around a chip hides with it. textContent only. */
const offerSlots = (function () {
  let planMode = null, pass = null;            // pass: { mode, price, days } while open
  function words(product, chip) {
    const t = product === 'pass'
      ? (pass ? offerTerms(pass.mode, pass.price, 'pass', pass.days).short : '')
      : offerTerms(planMode, '', 'year').short;
    return t ? (chip ? t : t + '.') : '';
  }
  function apply() {
    for (const n of $$('[data-offer-terms]')) {
      const t = words(n.dataset.offerProduct, n.dataset.offerForm === 'chip');
      if (n.textContent !== t) n.textContent = t;
    }
    for (const w of $$('[data-offer-wrap]')) {
      const slot = $('[data-offer-terms]', w);
      w.hidden = !(slot && slot.textContent);
    }
    for (const n of $$('[data-mode-answer]')) {
      const m = n.dataset.offerProduct === 'pass' ? (pass ? readMode(pass.mode) : null) : planMode;
      const want = n.dataset.modeAnswer;
      n.hidden = want === 'neutral' ? m !== null : want !== m;
    }
    if (planMode) root.dataset.planMode = planMode; else delete root.dataset.planMode;
  }
  return {
    take(t) { planMode = t && typeof t === 'object' ? readMode(t.plan_mode) : null; apply(); },
    pass(p) {
      const next = p ? { mode: readMode(p.mode), price: p.price, days: p.days } : null;
      if (JSON.stringify(next) === JSON.stringify(pass)) return;
      pass = next; apply();
    }
  };
})();

const launchPass = (function () {
  const band = byId('mkPass');
  let raw = null, readAt = 0, timer = 0, wasOpen = false, off = false, lastSpoken = '';
  const setAll = (sel, text) => $$(sel).forEach((n) => { if (n.textContent !== text) n.textContent = text; });
  function show(open) {
    $$('[data-pass-only]').forEach((n) => { n.hidden = !open; });
    $$('[data-pass-off]').forEach((n) => { n.hidden = open; });
    if (open) root.dataset.pass = 'open'; else delete root.dataset.pass;
  }
  function stop() { if (timer) { clearInterval(timer); timer = 0; } }
  function ended() {
    stop();
    show(false);
    if (!band || band.hidden) return;
    /* the band says so once, then goes with everything else that named it */
    $$('[data-pass-live], [data-pass-cta]', band).forEach((n) => { n.hidden = true; });
    const e = $('[data-pass-ended]', band);
    if (e) e.hidden = false;
    setTimeout(() => { band.hidden = true; }, 8000);
  }
  function apply() {
    const st = raw && !off ? PassOffer.passState(raw, Date.now(), readAt) : { state: 'none' };
    const v = passCopy(st, PassOffer);
    offerSlots.pass(v.open ? { mode: raw.mode, price: v.price, days: st.pass.days } : null);
    if (!v.open) {
      if (wasOpen) ended(); else { stop(); show(false); }
      wasOpen = false;
      return;
    }
    wasOpen = true;
    setAll('[data-pass-price]', v.price);
    setAll('[data-pass-length]', v.length);
    setAll('[data-pass-timer]', v.timer);
    if (v.spoken !== lastSpoken) { lastSpoken = v.spoken; setAll('[data-pass-spoken]', v.spoken); }
    $$('[data-pass-when]').forEach((n) => { n.hidden = !v.timer; });
    setAll('[data-pass-left]', v.left);
    $$('[data-pass-left-wrap]').forEach((n) => { n.hidden = !v.left; });
    show(true);
    if (band) band.hidden = false;
    if (v.timer && !timer) timer = setInterval(apply, 1000);
    if (!v.timer) stop();
  }
  return {
    take(t) {
      if (!t || typeof t !== 'object') return;
      if (t.purchase_required === false) off = true;
      raw = t.pass || null;
      readAt = Date.now();
      apply();
    },
    off() { off = true; apply(); }
  };
})();
/* A signed-in visitor's pass button goes to the checkout page (the pass
   card is there), not through the sign-up modal. */
if (SIGNED_IN) for (const a of $$('[data-pass-cta]')) a.setAttribute('href', 'purchase.html');
try {
  trialOffer().then((t) => { offerSlots.take(t); launchPass.take(t); }, () => {});
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
    if (deviceReduce || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
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
   or else the browser's local guess: src/lib/visitor-region.js (never a
   network call, never an IP). Reads only. */
(function regionLines() {
  const els = $$('[data-mk-intl]');
  if (!els.length || visitorRegion() === 'IN') return;
  root.setAttribute('data-mk-region', 'INT');
  els.forEach((el) => { el.textContent = el.getAttribute('data-mk-intl'); });
})();

/* ---- 9. the launch-offers form -----------------------------------
   The page draws <form data-lead-form> with an e-mail field, a consent
   box (input[name=consent]) and a submit button, and a [data-lead-status]
   line for the answer. One delegated listener on the document (dom.js's
   delegate() is CORE, which this page may not import — same shape,
   written here), so a page without the form does nothing at all, and the
   form works whenever it is drawn. Consent is REQUIRED and the words the
   visitor ticked are the words sent (§29 keeps them with the address).
   The source is the link's (?src= / utm_source, attribution.js), else the
   page's own name. Nothing here navigates or waits on a navigation. */
const statusOf = (form) => form.querySelector('[data-lead-status]') || $('[data-lead-status]');
$$('[data-lead-status]').forEach((n) => { n.setAttribute('role', 'status'); n.setAttribute('aria-live', 'polite'); });
function leadSays(form, text, bad) {
  const out = statusOf(form);
  if (!out) return;
  /* a form drawn after load still gets a live region (set before the text) */
  if (out.getAttribute('role') !== 'status') { out.setAttribute('role', 'status'); out.setAttribute('aria-live', 'polite'); }
  out.textContent = text;
  out.classList.toggle('mk-bad', !!bad);
  out.dataset.state = bad ? 'error' : text ? 'ok' : '';
}
const pageSource = () => {
  const name = String(location.pathname || '').split('/').pop().replace(/\.html$/, '').toLowerCase();
  return /^[a-z0-9_-]{1,32}$/.test(name) ? name : 'start';
};
document.addEventListener('submit', (e) => {
  const form = e.target && e.target.closest && e.target.closest('[data-lead-form]');
  if (!form) return;
  e.preventDefault();
  if (form.dataset.busy) return;
  const field = form.querySelector('input[name="email"]');
  const consent = form.querySelector('input[name="consent"]');
  const email = field ? field.value.trim() : '';
  if (!validEmail(email)) { leadSays(form, 'That does not look like an e-mail address.', true); if (field) field.focus(); return; }
  if (!consent || !consent.checked) { leadSays(form, 'Tick the box to say we may e-mail you.', true); if (consent) consent.focus(); return; }
  const label = consent.closest('label') || (consent.id && form.querySelector('label[for="' + consent.id + '"]'));
  const words = consentText(label ? label.textContent : '');
  let source = pageSource();
  /* The link's source as its BUCKET (funnel.js sourceBucket: 'instagram',
     'school', 'other'...), never the raw ?src= slug: a lead is an e-mail
     address, and a slug beside it ('creator-<name>', 'school-<name>')
     would tie the address to a person or a school. privacy.html#leads
     says exactly this. */
  try { source = sourceBucket(attribution().src) || source; } catch (err) { /* the page's name stands */ }
  const btn = form.querySelector('button[type="submit"], button:not([type])');
  form.dataset.busy = '1';
  if (btn) btn.disabled = true;
  leadSays(form, 'Saving…');
  addLead(email, words, source).then(() => {
    leadSays(form, 'Thank you. You are on the list.');
    if (field) field.value = '';
    consent.checked = false;
  }, (err) => {
    leadSays(form, (err && err.message) || 'Could not save that just now. Please try again.', true);
  }).finally(() => {
    delete form.dataset.busy;
    if (btn) btn.disabled = false;
  });
});

/* ---- 10. calm motion (28 Oct 2026) ------------------------------------
   The 8B template's entrances, made with the bundled `motion` package and
   motion/mini only (WAAPI, about 8 KB; the full package is 69 KB). What moves: a section's heading rises in as the
   section enters, and its cards, points, facts and steps stack in after
   it, a beat apart. The hero's own entrance is CSS (marketing.css), so it
   needs no script at all. Hover is CSS too.

   WHAT NEVER HAPPENS. Nothing is hidden that is already on screen when
   this runs (no flash of a painted page): only sections wholly below the
   fold are prepared, and they are prepared synchronously, before any
   paint can show them. A fragment target only FADES (an element with an
   id that travels would be measured where it was; prove:scroll caught
   that once). Reduced motion, a --motion of 0, a browser with no
   IntersectionObserver and Playwright (navigator.webdriver, like
   src/ui/motion-app.js) get no motion at all and the page as written.
   If anything throws, every prepared element is put back. */
(function calmMotion() {
  let k = 1;
  try {
    if (deviceReduce || navigator.webdriver || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (!('IntersectionObserver' in window) || typeof Element.prototype.animate !== 'function') return;
    const m = parseFloat(getComputedStyle(root).getPropertyValue('--motion'));
    k = Number.isFinite(m) ? m : 1;
  } catch (e) { return; }
  if (!k) return;
  const PARTS = ':is(.mk-h2, .mk-cards > *, .mk-stages > *, .st-stages > *, .st-points > *, .mk-facts > li, .mk-steps > li, .pr-tiers > li, .co-cards > *, .co-principles > li, .mk-slot)';
  const fold = window.innerHeight || 800;
  const groups = [];
  for (const sec of $$('main .mk-sec')) {
    if (sec.getBoundingClientRect().top < fold) continue;          // on screen, or above: leave it
    const els = $$(PARTS, sec).filter((n) => !n.closest('[hidden]'));
    if (!els.length) continue;
    for (const n of els) n.style.opacity = '0';
    groups.push({ sec, els });
  }
  if (!groups.length) return;
  let restored = false;
  const restore = () => { restored = true; groups.forEach((g) => g.els.forEach((n) => { n.style.opacity = ''; n.style.transform = ''; })); };
  /* NOTHING STAYS VEILED FOR PRINT, or for a stalled observer: printing
     straight after load printed blank sections (28 Oct 2026). The studio
     helper (src/ui/motion.js) has the same two backstops. */
  try {
    window.addEventListener('beforeprint', restore);
    const pm = matchMedia('print');
    if (pm.addEventListener) pm.addEventListener('change', (e) => { if (e.matches) restore(); });
  } catch (e) { /* the timeout below still restores */ }
  setTimeout(restore, 8000);
  /* motion/mini's animate() (imported statically: a dynamic import()
     makes Vite add its preload helper, which the build puts in the studio
     CORE chunk, and prove:growth asserts no studio-* chunk reaches a public
     page). The "in view" trigger is the page's own IntersectionObserver. */
  try {
    const ease = [0.16, 1, 0.3, 1];
    const run = (g) => restored || g.els.forEach((n, i) => {
      const travel = !n.id;                                          // fragment targets: fade only
      const a = animate(n, travel ? { opacity: [0, 1], transform: [`translateY(${20 * k}px)`, 'none'] } : { opacity: [0, 1] },
        { duration: travel ? 0.7 : 0.6, delay: Math.min(i, 8) * 0.06, ease });
      const done = () => { n.style.opacity = ''; n.style.transform = ''; };
      if (a && typeof a.then === 'function') a.then(done, done); else done();
    });
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        io.unobserve(e.target);
        const g = groups.find((x) => x.sec === e.target);
        if (g) run(g);
      }
    }, { threshold: 0, rootMargin: '0px 0px -12% 0px' });
    groups.forEach((g) => io.observe(g.sec));
  } catch (e) { restore(); }
})();
