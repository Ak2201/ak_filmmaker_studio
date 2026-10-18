/* ============================================================
   PRICING — the pricing page's script
   ------------------------------------------------------------
   pricing.html is a public marketing page (outside the site gate, like
   start.html and product-*.html): scripts/make-marketing-pages.mjs writes
   its words into the markup, vite.config.js stamps the plan names, prices
   and bullets at build time, and marketing.js (imported first, for its
   side effects) gives it the header, the mega-menu, the sign-up modal and
   the live offer line.

   This module is the part of the old start.html pricing section that is
   BEHAVIOUR, moved here unchanged in what it does:

     1. a plan's BUY hands off to Google with the plan stashed, so the
        buyer reaches the checkout after the sign-in (stashPlan)
     2. a signed-in visitor's BUY goes straight to the checkout page
     3. the pricing_view count, once, when the plans scroll into view
     4. the scheduled price rise from price_notice(): it ADDS the coming
        figure beside the build-stamped one and never replaces it, and the
        band stays hidden unless the server reports a rise it will execute
     5. purchases off: the page is marked, the trial promise goes, and no
        rise band is drawn (a countdown on a studio that is not selling is
        urgency nobody enforces)
     6. trials switched off: the trial strip and each card's "or start the
        free trial first" go, because offering one would be untrue

   WHAT IT MAY IMPORT. The same light leaves as marketing.js and start.js:
   funnel.js (plain fetch), trial-time.js, start-auth.js, and
   start-model.js, which is import-free. NOT store.js, chrome.js, cloud.js,
   gate.js, plan-gate.js, plans.js or billing.js: each is, or drags in, the
   ~209 KB `studio` chunk. prove:growth asserts no supabase-* and no
   studio-* chunk is fetched here, and test:marketing checks this list.
   ============================================================ */
import './marketing.js';
import '../styles/pricing.css';
import { bumpEvent, bumpOnce, priceNotice, purchasesRequired, trialOffer } from '../lib/funnel.js';
import * as StartAuth from '../lib/start-auth.js';
import { stashPlan, buyHref, risingTiers, priceRiseBand, timeLeft } from '../lib/start-model.js';

const root = document.documentElement;
const byId = (id) => document.getElementById(id);
const SIGNED_IN = StartAuth.hasStoredSession();

const authMsg = byId('authMsg');
function says(text, bad) {
  if (!authMsg) return;
  authMsg.textContent = text;
  authMsg.classList.toggle('pr-bad', !!bad);
}

/* ---- 1 and 2. a plan's BUY ------------------------------------------
   Every BUY is already <a href="purchase.html?plan=ID"> in the markup, a
   real door for a reader with scripts off. A signed-in visitor goes to
   the checkout with the plan named (plan-cards.js marks that card and
   opens its payment). A visitor who is not signed in has the plan
   stashed and is taken to Google; Google returns to the hub, the gate
   sends a non-member to invite.html, and invite.js forwards the buyer to
   the checkout once they are signed in. */
if (SIGNED_IN) {
  for (const a of document.querySelectorAll('[data-start-buy]')) a.setAttribute('href', buyHref(a.dataset.startBuy));
}
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('[data-start-buy]');
  if (!a || e.defaultPrevented) return;
  stashPlan(a.dataset.startBuy);               // bump_event() accepts a fixed list; 'signup' below counts it
  if (SIGNED_IN) return;                       // the href is the checkout; let it go
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;   // a new tab or a saved link: the href does what was asked
  if (!StartAuth.configured()) return;         // no project: the markup's door stands
  e.preventDefault();
  bumpEvent('signup');
  says('Taking you to Google…');
  try {
    if (!StartAuth.startGoogle({ redirectTo: StartAuth.defaultRedirect() })) location.href = a.href;
  } catch (err) {
    says('Could not open the Google sign-in just now. Try again, or use the invite page.', true);
  }
});

/* ---- 3. the funnel ---------------------------------------------------- */
const plansSec = byId('pricing');
if (plansSec && 'IntersectionObserver' in window) {
  const io = new IntersectionObserver((es) => {
    if (es.some((x) => x.isIntersecting)) { io.disconnect(); bumpOnce('pricing_view'); }
  }, { threshold: 0.25 });
  io.observe(plansSec);
}

/* ---- 4. the scheduled price rise ---------------------------------------
   section 30's price_notice(): anon-callable, one narrow fact per plan,
   and NOTHING unless a rise is actually scheduled. What makes this an
   announcement rather than false urgency is that effective_price() fires
   the rise by itself the instant next_price_at passes or the buyer cap is
   reached, the same function that charges the card. So the countdown
   renders the SERVER's instant (the same for every visitor, less time on
   a reload, never more), the seat count is a real count against a real
   cap, and if either is missing or the call fails this draws nothing and
   the build-stamped list prices stand on their own. */
function el(tag, attrs, text) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
function renderPriceRise(notice) {
  if (!notice || !Array.isArray(notice.plans)) return;
  for (const p of risingTiers(notice)) {
    let li;
    try { li = document.querySelector(`.pr-tiers li[data-tier="${CSS.escape(p.id)}"]`); } catch (e) { li = null; }
    const price = li && li.querySelector('.pr-price');
    if (!price || price.querySelector('.pr-price-next')) continue;
    price.append(el('span', { class: 'pr-price-next' }, p.text));
  }
  const band = byId('offer');
  if (!band) return;
  const rise = priceRiseBand(notice, Date.now());     // null: nothing rising, or it has already fired
  if (!rise) return;
  const ends = rise.ends;
  const line = byId('offerLine');
  if (line) line.textContent = rise.line;
  const seatsChip = byId('offerSeats');
  if (seatsChip && rise.seats) { seatsChip.textContent = rise.seats; seatsChip.hidden = false; }
  const leftChip = byId('offerLeft');
  const tick = () => {
    const t = timeLeft(ends - Date.now());
    if (!t) { band.hidden = true; return; }           // it fired while the page was open
    if (leftChip) { leftChip.textContent = t; leftChip.hidden = false; }
  };
  tick();
  /* Minutes, not seconds: a ticking second counter on a three-week
     deadline is pressure theatre. */
  setInterval(tick, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  band.hidden = false;
}

/* ---- 5 and 6. purchases off, trials off --------------------------------
   marketing.js already swaps the words (data-open-text / data-off-text)
   and fills in the trial's length; what is left here is what has to
   GO when nothing is offered. */
function hideTrial() {
  document.querySelectorAll('[data-trial], [data-trial-link]').forEach((n) => { n.hidden = true; });
}
try {
  Promise.all([purchasesRequired(), priceNotice()]).then(([req, notice]) => {
    if (req === false) { root.dataset.purchases = 'off'; hideTrial(); return; }
    renderPriceRise(notice);
  }, () => {});
} catch (e) { /* never breaks the page */ }
try {
  trialOffer().then((t) => { if (t && t.trial_enabled === false) hideTrial(); }, () => {});
} catch (e) { /* never breaks the page */ }
