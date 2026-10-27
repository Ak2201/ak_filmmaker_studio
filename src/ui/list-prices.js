/* ============================================================
   LIST PRICES — the plans and their prices, with nobody signed in
   ------------------------------------------------------------
   Its own module, and a light one, because invite.html's first paint is
   budgeted: plan-cards.js brings billing's card machinery and two
   stylesheets, and this needs none of it. Pure apart from h() and the
   lazy matrix chunk. purchase.html and invite.html draw it.
   ============================================================ */
import { h } from '../lib/dom.js';
import { PLAN_ORDER, LIST_PRICE, inr, perDay, planName } from '../lib/plans.js';
import { fmtMinor, perDayIn, chargeCaption } from '../lib/price-model.js';
import { offerTerms } from '../lib/offer-terms.js';
import '../styles/list-prices.css';

/* THE PRICES, FOR SOMEBODY NOT SIGNED IN. invite.html and purchase.html
   used to send a signed-out visitor back to start.html to learn what a
   plan costs, off the buying path. The plans ROWS need a session (and
   the Supabase SDK, which a signed-out first paint must not fetch), so
   this reads LIST_PRICE — the same constant start.html is stamped from
   at build time — and says "confirmed at checkout", exactly as that
   page does. Each plan's one line ("Write the film — from beat sheet to formatted screenplay.") arrives with the
   lazy matrix chunk; until then the names and figures stand alone. */
/* `view` (price-model.js shopView, optional): purchase.html passes the
   visitor's currency. A dollar view prints the owner's dollar figures from
   price_notice('USD') and, on each line, what is CHARGED; invite.html
   passes nothing and prints rupees, as before.
   `mode` is the server's plan_mode (§62, billing.js cachedModes().plan):
   each price carries its terms in offer-terms.js's words, and an unknown
   mode states neither one-time nor auto-renew. */
export function listPriceBlock(view = null, mode = null) {
  const usd = !!(view && view.currency === 'USD');
  const ids = PLAN_ORDER.filter((id) => id !== 'free' && LIST_PRICE[id] > 0);
  const ul = h('ul.pl-list-prices', { 'aria-label': 'Plans and prices' });
  const lines = {};
  for (const id of ids) {
    const line = h('span.pl-list-line');
    lines[id] = line;
    /* The server's CURRENT price wins once price_notice() has answered,
       in rupees as in dollars: LIST_PRICE is the price before any
       scheduled rise (plans.js), and a list still quoting it after the
       rise would contradict what checkout charges (QA, 26 Oct 2026). */
    const r = view && view.plans ? view.plans[id] : null;
    const text = usd && r ? offerTerms(mode, fmtMinor(r.minor, 'USD'), 'year').line + ' · ≈ ' + perDayIn(r.minor, 'USD') + ' a day · ' + chargeCaption(view, r.inrMinor)
      : !usd && r && r.minor > 0 ? offerTerms(mode, fmtMinor(r.minor, 'INR'), 'year').line + ' · ≈ ' + perDayIn(r.minor, 'INR') + ' a day'
      : offerTerms(mode, inr(LIST_PRICE[id]), 'year').line + ' · ≈ ' + perDay(LIST_PRICE[id]) + ' a day';
    ul.append(h('li', {}, [h('strong', { text: planName(id) }), h('span.pl-list-price', { text }), line]));
  }
  import('../lib/plan-matrix.js').then((m) => {
    for (const id of ids) { const t = m.MATRIX.lines && m.MATRIX.lines[id]; if (t && lines[id]) lines[id].textContent = t; }
  }).catch(() => { /* the names and prices stand */ });
  const t = offerTerms(mode, '', 'year');
  return h('div.pl-list-wrap', { 'data-offer-mode': t.mode || 'unknown' }, [ul,
    h('p.pl-note', { text: (usd ? (view.charge === 'USD' ? 'A year each, in US dollars' : 'A year each, shown in US dollars and charged in Indian rupees') : 'A year each, in Indian rupees')
      + ', confirmed at checkout' + (t.short ? ' · ' + t.short : '') + '. Each plan includes everything in the one before it.' })]);
}

export default { listPriceBlock };
