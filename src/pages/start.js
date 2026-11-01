/* ============================================================
   START — the public home page's script
   ------------------------------------------------------------
   start.html sits OUTSIDE the site gate (EXEMPT in src/lib/sitegate.js)
   and is the page EVERY signed-out visitor lands on, so it is the one a
   stranger, a crawler and a link preview meet first. The words are in the
   MARKUP (scripts/make-marketing-pages.mjs writes the file, like the
   product pages) and this module adds only what cannot be static.

   ALL OF THE SHARED BEHAVIOUR COMES FROM marketing.js, imported for its
   side effects: the header's scroll state, the Product mega-menu, the
   sign-up modal with Google (start-auth.js), the live trial / purchases
   line, and the invite-code hold. THE INVITE FLOW LIVES THERE NOW:
   start.html#code=XXXX-XXXX (the link the console copies) is held in
   fms_invite_code_v1, stripped from the address bar and announced in the
   sign-up modal ("Invite code saved"), and runGate() redeems it for the
   account that signs in. The old banner is gone; its job (telling the
   visitor the code took) is the modal's message.

   WHAT THIS FILE MAY IMPORT, AND WHY THE LIST IS SHORT. marketing.js,
   start-motion.js (the scroll story: motion and device-motion.js only), the
   stylesheet, funnel.js, auth-scope.js and start-model.js (import-free).
   NOT store.js, chrome.js, cloud.js, gate.js, billing.js, plan-gate.js,
   plans.js or dom.js: every one of those lives in (or drags in) the shared
   `studio` CORE chunk, about a megabyte, on the one page that must be
   instant on a phone. prove:growth asserts no Supabase chunk and no
   studio-* chunk is fetched here, and the first-paint budget fails one by
   name. Keep the startlib modules pure for the same reason.

   What it adds, in order:

   1. The CTA targets under the gate: every link INTO the app becomes the
      doorway, because a gated app page bounces a stranger back to the page
      they came from.
   2. WHY THEY ARE BACK HERE: a Google return that did not produce a
      session is told in the sign-up modal, which opens to say it.
   3. The landing_view count (once per session; Do Not Track and the
      opt-out are honoured inside funnel.js), and the opt-out button the
      privacy page promises.
   5. The "from about ₹X a day" figures, true today and in the visitor's
      currency (docs/US-MARKET-PLAN.md §B). price_notice() brings the
      rupee stamp to the server's current price once a scheduled rise has
      fired; a visitor outside India is then shown the owner's dollar
      figure from price_notice('USD'). No answer: the stamped rupees
      stand. The charge currency is said on pricing.html and at checkout,
      where the price is.
   6. THE OFFER (30 Oct 2026): the hero card, the slide-in / phone bar and
      the closing band, from the same two replies (see section 6).
   ============================================================ */
import { passNow, startSignIn, signedIn } from './marketing.js';
import './start-motion.js';   // the scroll story (29 Oct 2026): motion + device-motion only
import '../styles/start.css';
import { bumpOnce, bumpEvent, funnelSource, configured, optOut, priceNotice } from '../lib/funnel.js';
import { AUTH_ERROR_KEY } from '../lib/auth-scope.js';
import { takeAuthError, isAppPage, deviceRegion, fromDayNow, stampedFromDay, swapFigure,
  offerFrom, ctaText, offerHref, clockText, spokenLeft, stashPlan, dockClosed as isDockClosed, rememberDockClosed } from '../lib/start-model.js';
import { pricingCurrency, readPayCurrency, guessVisitorRegion } from '../lib/region-core.js';
import { shopView, fromDay, fmtMinor, chargeCaption } from '../lib/price-model.js';

const byId = (id) => document.getElementById(id);

/* ---- 1. where the app links go ------------------------------------- */
/* Named directly so Vite inlines the one string; reading it off the
   env OBJECT inlines every VITE_* value into this chunk. */
const GATED = String(import.meta.env.VITE_SITE_GATE || 'invite').toLowerCase() !== 'off';   // sitegate.js SITE_GATE

/* Under the gate every app page bounces a stranger, so a link into the app
   would land them on the page they came from. Point each at the doorway.
   invite.html is on the exempt list in isAppPage, which is what keeps the
   sign-in CTAs (<a href="invite.html">, the no-JS door) intact. */
if (GATED) {
  for (const a of document.querySelectorAll('a[href]')) {
    if (isAppPage(a.getAttribute('href'))) a.setAttribute('href', 'invite.html');
  }
}

/* ---- 2. why they are back here -------------------------------------
   A Google return that does not produce a session lands on the hub, where
   the site gate reads "signed out" and replaces the document with this
   page, so the sign-in's own message is destroyed before anyone can read
   it: "I pressed Continue with Google and ended up where I started".
   cloud.js leaves the reason in sessionStorage (AUTH_ERROR_KEY); this reads
   it once, clears it, and says it in the modal's own status line (#mkMsg,
   role="status"). Deliberately NOT an import of cloud.js; the key is
   shared, the code is not. */
(function showWhyTheyCameBack() {
  const info = takeAuthError(AUTH_ERROR_KEY);   // null: none, private mode, or unparseable
  if (!info || !info.message) return;
  const msg = byId('mkMsg');
  const modal = byId('mkSignup');
  const opener = document.querySelector('.mk-hero [data-open-signup]');
  if (!msg || !modal || !opener) return;
  /* marketing.js opens the modal (focus trap, Escape, scroll lock) and
     clears the line as it does, so the sentence is written after. A
     signed-in visitor's opener is a plain link to the studio and is not
     clicked: there is no failure to explain to somebody who is in. */
  if (document.documentElement.dataset.signedin === '1') return;
  opener.click();
  msg.textContent = 'Sign-in did not complete. ' + info.message;
  msg.classList.add('mk-bad');
})();

/* ---- 3. the funnel -------------------------------------------------- */
bumpOnce('landing_view');

/* ---- 4. "Don't count this visit" -------------------------------------
   privacy.html promises this control, so it stays on the page that counts.
   It sets the same session flag Do Not Track would, and says it has. */
const noCount = byId('noCount');
if (noCount) noCount.addEventListener('click', () => { optOut(); noCount.textContent = noCount.dataset.done; noCount.disabled = true; });

/* ---- 5. the price today, in the visitor's currency --------------------
   The hero and the closing note say "from about ₹X a day", stamped from
   LIST_PRICE, which is the price BEFORE any scheduled rise. The rise
   fires on its date or on the buyer that fills the cap, so the stamp can
   go stale with no rebuild; price_notice() always carries each plan's
   CURRENT price_paise. Each figure is a [data-price-day="from"] span
   (make-marketing-pages.mjs priceSpans()), rewritten by what it is; the
   title, which cannot carry a span, is swapped by its stamped figure. A
   visitor shown dollars then gets the owner's dollar figure from
   price_notice('USD'), and only when every plan has one. The call failing
   leaves the markup as it was (pricing.js does the same for its cards). */
function sayFrom(fig) {
  if (!fig) return;
  for (const n of document.querySelectorAll('[data-price-day="from"]')) n.textContent = fig;
  const was = stampedFromDay(TITLE0);
  if (was) document.title = swapFigure(TITLE0, was, fig);
}
const TITLE0 = document.title;
let usdView = null;   // the dollar view, for a visitor shown dollars (section 6 reads it)

/* ---- 6. THE OFFER (30 Oct 2026) ------------------------------------------
   One offer, three surfaces: the hero card (#offerCard), the slide-in on a
   desk / the bottom bar on a phone (#offerDock), and the closing band
   (#offerClose). Which offer is start-model.js offerFrom()'s to say, from
   the two replies this page already has:

     - trial_offer(), read by marketing.js and handed over as 'mk:pass'
       (passNow()): its pass is read ONLY through pass-offer.js, inside
       marketing.js's closures. An open pass is the offer.
     - price_notice(), section 5: with no open pass, a scheduled rise for
       the founding plan that is still ahead is the offer, at today's price.
     - neither: every surface stays hidden and the plans stand.

   Nothing is drawn until BOTH replies are in (or have failed), so the
   founding card never flashes up before the pass replaces it. EVERY FIGURE
   IS THE SERVER'S: the markup holds empty slots and no digit
   (test:marketing), and the pass's countdown runs on the server's clock
   (a reply's own `now` plus the local time elapsed since it arrived). The
   founding offer draws no ticking clock at all (see drawClock): it says
   the IST day the price holds until, "or while the founding places last".
   At the deadline the offer is worked out again, so the card moves to the
   next offer or goes; it never shows a deadline that passed.

   THE BUTTON IS THE CHECKOUT (owner, 30 Oct 2026): purchase.html?buy=<id>,
   which opens Razorpay for exactly this offer. Signed in, a plain
   navigation. Signed out, the intent is stashed (fms_invite_plan, the
   existing key) and the press goes straight to Google; invite.js forwards
   the returning buyer to purchase.html?buy=<id>. Counted as 'signup' only:
   checkout_start and purchase are counted downstream.

   No storage write but two session flags: the plan stash on a press, and
   fms_offer_dock_closed when the slide-in is closed (session only, in no
   registry). textContent only: nothing here builds markup. */
const root = document.documentElement;
const SURFACES = ['offerCard', 'offerDock', 'offerClose'].map(byId).filter(Boolean);
const DOCK = byId('offerDock');
const HEAD_CTA = document.querySelector('.mk-top .mk-btn--primary[data-open-signup]');
const MOBILE = '(max-width: 720px)';

/* Motion stands still for Playwright, the device switch (marketing.js
   sets html.ma-off) and the OS setting: start.css keys every offer
   animation off html:not(.st-still). */
try {
  if (navigator.webdriver || root.classList.contains('ma-off') || matchMedia('(prefers-reduced-motion: reduce)').matches) root.classList.add('st-still');
} catch (e) { root.classList.add('st-still'); }

const offerTake = (function () {
  let notice = null, noticeAt = 0, haveNotice = false, havePass = false;
  let offer = null, timer = 0, spoken = null, drawnKey = '';
  let dockClosed = isDockClosed();

  const set = (n, text) => { if (n.textContent !== text) n.textContent = text; };
  const show = (n, on) => { if (n.hidden === on) n.hidden = !on; };

  /* the server's clock: trial_offer()'s pass, else price_notice()'s,
     both read through pass-offer.js (marketing.js's closures) */
  function serverNow(P) {
    if (!P) return null;
    const a = P.serverNow();
    if (a != null) return a;
    return notice && notice.pass ? P.serverNowOf(notice.pass, noticeAt) : null;
  }
  function compute() {
    const P = passNow();
    const st = P ? P.state() : null;
    const copy = P && st ? P.copy(st) : null;
    const off = root.dataset.purchases === 'off' || !!(P && P.off);
    return { o: offerFrom(st, copy, notice, Date.now(), { serverNowMs: serverNow(P), off }), P, off };
  }

  function drawSurface(s, o) {
    const kind = o ? o.kind : 'none';
    s.dataset.offerState = kind;
    for (const n of s.querySelectorAll('[data-o-for]')) show(n, n.dataset.oFor === kind);
    for (const n of s.querySelectorAll('[data-o-price]')) set(n, o ? o.price : '');
    for (const n of s.querySelectorAll('[data-o-unit]')) set(n, !o ? '' : o.kind === 'pass' ? o.unit : s.dataset.unitYear);
    for (const n of s.querySelectorAll('[data-o-was]')) {
      const on = !!o && o.kind === 'founding';
      show(n, on);
      const amt = n.querySelector('[data-o-was-amt]');
      if (amt) set(amt, on ? o.was : '');
    }
    for (const n of s.querySelectorAll('[data-o-day]')) {
      const on = !!o && o.kind === 'founding';
      set(n, on ? s.dataset.dayLead + ' ' + o.day + ' ' + s.dataset.dayTail : '');
      show(n, on);
    }
    for (const n of s.querySelectorAll('[data-o-usd]')) {
      const r = o && o.kind === 'founding' && usdView && usdView.currency === 'USD' ? usdView.plans[o.plan] : null;
      const t = r && r.minor > 0 ? fmtMinor(r.minor, 'USD') + ' ' + s.dataset.unitYear + ' in US dollars · ' + chargeCaption(usdView, o.paise) : '';
      set(n, t); show(n, !!t);
    }
    for (const n of s.querySelectorAll('[data-o-seats]')) {
      const t = !o ? '' : o.kind === 'pass' ? o.left : o.seats;
      set(n, t || ''); show(n, !!t);
    }
    for (const a of s.querySelectorAll('[data-offer-cta]')) {
      if (!o) continue;
      const href = offerHref(o);
      if (a.getAttribute('href') !== href) a.setAttribute('href', href);
      a.dataset.startBuy = o.id;
      const words = { pass: s.dataset.ctaPass, passIn: s.dataset.ctaPassIn, founding: s.dataset.ctaFounding, foundingIn: s.dataset.ctaFoundingIn };
      /* the dock's button is the short form (the bar has no room for
         "continue with Google"), so signed out its NAME is the long form
         (it starts with the visible words) and, on a desk, a small line
         under it says the press goes to Google first */
      set(a, ctaText(o, s === DOCK || signedIn(), words));
      if (s === DOCK && !signedIn()) a.setAttribute('aria-label', ctaText(o, false, words));
      else a.removeAttribute('aria-label');
    }
    for (const n of s.querySelectorAll('[data-o-google]')) show(n, !!o && !signedIn());
    if (s !== DOCK) show(s, !!o);
  }
  /* the clock, every second: digits aria-hidden, the label to the minute
     (rewritten only when the minute changes, and not a live region) */
  function drawClock(o) {
    /* THE FOUNDING PRICE HAS NO TICKING CLOCK (30 Oct 2026): the server
       also raises it when the founding places run out, which can come
       before next_price_at, so a countdown to that instant would claim a
       deadline it cannot promise. It says the IST day it holds until, and
       "or while the founding places last" while there are places to count.
       The pass (a fixed ends_at) keeps its countdown. msLeft still drives
       the tick, so the card is worked out again at the deadline. */
    const ms = o && o.kind === 'pass' ? o.msLeft : null;
    const clock = ms != null ? clockText(ms) : '';
    const say = ms != null ? spokenLeft(ms) : '';
    const founding = !!o && o.kind === 'founding';
    for (const s of SURFACES) {
      const ends = s.dataset.passEnds;
      const until = founding ? s.dataset.until + ' ' + o.until + (o.seats ? ' ' + s.dataset.untilSeats : '') : '';
      for (const p of s.querySelectorAll('[data-o-timer]')) {
        const lead = p.querySelector('[data-o-timer-lead]');
        if (lead) set(lead, !o ? '' : founding ? until : ends);
        for (const c of p.querySelectorAll('[data-o-clock]')) set(c, clock);
        if (say !== spoken) for (const c of p.querySelectorAll('[data-o-spoken]')) set(c, say ? ends + ' ' + say : '');
        /* the dock has no lead, so the founding offer draws no line there */
        show(p, !!clock || (founding && !!lead));
      }
    }
    spoken = say;
  }
  function draw() {
    if (!haveNotice || !havePass) return;
    clearTimeout(giveUp);
    const { o, P, off } = compute();
    offer = o;
    const key = o ? [o.kind, o.price, o.was || '', o.left || o.seats || '', usdView ? 'usd' : ''].join('|') : 'none';
    if (key !== drawnKey) {
      drawnKey = key;
      for (const s of SURFACES) drawSurface(s, o);
      for (const n of document.querySelectorAll('[data-o-fallback]')) show(n, !o);
      for (const n of document.querySelectorAll('[data-o-only]')) show(n, !!o);
      const plan = o ? o.plan : 'indie';
      for (const n of document.querySelectorAll('[data-value-for]')) show(n, n.dataset.valueFor === plan);
      for (const n of document.querySelectorAll('[data-v-price]')) {
        const t = !o ? '' : o.kind === 'pass' ? o.price + ' ' + o.unit : o.price + ' a year, about ' + o.day + ' a day';
        set(n, t); show(n, !!t);
      }
      /* the FAQ's trial clause: only while trials are open, no pass is
         running and purchases are required */
      const trialOpen = !!(P && P.trialOpen) && !off && !(o && o.kind === 'pass');
      for (const n of document.querySelectorAll('[data-o-trial]')) show(n, trialOpen);
      if (o) root.dataset.offer = o.kind; else delete root.dataset.offer;
      /* ONE PRIMARY ACTION ON THE FIRST SCREEN: while an offer shows, the
         header's "Get started" (the sign-up door) steps down to a
         secondary button, so the only filled button above the fold is
         the offer's checkout. */
      if (HEAD_CTA) { HEAD_CTA.classList.toggle('mk-btn--primary', !o); HEAD_CTA.classList.toggle('mk-btn--outline', !!o); }
      /* decided: start.css drops the hero's reservation (see THE HERO) */
      root.dataset.offerReady = '1';
    }
    drawClock(o);
    dockUpdate();
    const ticking = !!o && o.msLeft != null;
    if (ticking && !timer) timer = setInterval(draw, 1000);
    if (!ticking && timer) { clearInterval(timer); timer = 0; }
  }

  /* ---- the slide-in: past the hero card, and neither the closing band
     nor the footer on screen. Not on load, not modal, closed for good
     (this session) by its close button or Escape. */
  const seen = new Map();
  function dockWanted() {
    if (!offer || dockClosed || !DOCK) return false;
    const card = byId('offerCard');
    if (!card || card.hidden) return false;
    if (card.getBoundingClientRect().bottom > 0) return false;   // not scrolled past it yet
    for (const v of seen.values()) if (v) return false;          // the closing band or the footer is on screen
    return true;
  }
  function dockUpdate() {
    if (!DOCK) return;
    const want = dockWanted();
    show(DOCK, want);
    let h = 0;
    try { if (want && matchMedia(MOBILE).matches) h = Math.ceil(DOCK.getBoundingClientRect().height); } catch (e) { /* */ }
    const v = h + 'px';
    if (root.style.getPropertyValue('--offer-dock-h') !== v) root.style.setProperty('--offer-dock-h', v);
  }
  function closeDock() {
    if (!DOCK) return;
    const inside = DOCK.contains(document.activeElement);
    dockClosed = true;
    rememberDockClosed();
    dockUpdate();
    if (inside) {
      const main = byId('main');
      if (main) { if (!main.hasAttribute('tabindex')) main.setAttribute('tabindex', '-1'); main.focus({ preventScroll: true }); }
    }
  }
  if (DOCK) {
    DOCK.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('[data-offer-close]')) closeDock(); });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || DOCK.hidden || root.classList.contains('mk-modal-open')) return;
      const a = document.activeElement;
      if (DOCK.contains(a) || !a || a === document.body || a === root || a === byId('main')) { e.preventDefault(); closeDock(); }
    });
    const watch = [byId('offerCard'), byId('offerClose'), document.querySelector('.mk-foot')].filter(Boolean);
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver((es) => {
        for (const x of es) if (x.target.id !== 'offerCard') seen.set(x.target, x.isIntersecting);
        dockUpdate();
      });
      watch.forEach((n) => io.observe(n));
    } else addEventListener('scroll', dockUpdate, { passive: true });
    try { matchMedia(MOBILE).addEventListener('change', dockUpdate); } catch (e) { /* */ }
  }

  /* ---- the button: straight to the checkout for this offer ----------- */
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('[data-offer-cta]');
    if (!a || e.defaultPrevented || signedIn()) return;            // signed in: the href is the checkout
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new tab: the href does what was asked
    if (!configured()) return;                                     // no project: purchase.html asks for the sign-in itself
    e.preventDefault();
    stashPlan(a.dataset.startBuy);
    bumpEvent('signup', funnelSource());
    try { if (!startSignIn()) location.href = a.href; } catch (err) { location.href = a.href; }
  });

  /* a reply that never comes must not hold the hero's reservation for
     ever: after 5s decide with what is in (a late reply still redraws) */
  const giveUp = setTimeout(() => { haveNotice = havePass = true; draw(); }, 5000);
  document.addEventListener('mk:pass', () => { havePass = true; drawnKey = ''; draw(); });
  if (passNow()) havePass = true;
  return {
    notice(n) { notice = n && typeof n === 'object' ? n : null; noticeAt = Date.now(); haveNotice = true; draw(); },
    redraw() { drawnKey = ''; draw(); }
  };
})();

try {
  const usdAsk = pricingCurrency({ override: readPayCurrency(), chosen: deviceRegion(), guess: guessVisitorRegion() }) === 'USD'
    ? priceNotice('USD') : null;
  priceNotice().then((notice) => {
    sayFrom(fromDayNow(notice));
    offerTake.notice(notice);
    if (!usdAsk) return;
    usdAsk.then((usd) => {
      const view = shopView('USD', usd);
      if (view.currency === 'USD') { sayFrom(fromDay(view)); usdView = view; offerTake.redraw(); }
    }, () => {});
  }, () => offerTake.notice(null));
} catch (e) { offerTake.notice(null); /* the stamped rupees stand */ }
