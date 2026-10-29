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
   ============================================================ */
import './marketing.js';
import './start-motion.js';   // the scroll story (29 Oct 2026): motion + device-motion only
import '../styles/start.css';
import { bumpOnce, optOut, priceNotice } from '../lib/funnel.js';
import { AUTH_ERROR_KEY } from '../lib/auth-scope.js';
import { takeAuthError, isAppPage, deviceRegion, fromDayNow, stampedFromDay, swapFigure } from '../lib/start-model.js';
import { pricingCurrency, readPayCurrency, guessVisitorRegion } from '../lib/region-core.js';
import { shopView, fromDay } from '../lib/price-model.js';

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
try {
  const usdAsk = pricingCurrency({ override: readPayCurrency(), chosen: deviceRegion(), guess: guessVisitorRegion() }) === 'USD'
    ? priceNotice('USD') : null;
  priceNotice().then((notice) => {
    sayFrom(fromDayNow(notice));
    if (!usdAsk) return;
    usdAsk.then((usd) => {
      const view = shopView('USD', usd);
      if (view.currency === 'USD') sayFrom(fromDay(view));
    }, () => {});
  }, () => {});
} catch (e) { /* the stamped rupees stand */ }
