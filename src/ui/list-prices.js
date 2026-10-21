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
   passes nothing and prints rupees, as before. */
export function listPriceBlock(view = null) {
  const usd = !!(view && view.currency === 'USD');
  const ids = PLAN_ORDER.filter((id) => id !== 'free' && LIST_PRICE[id] > 0);
  const ul = h('ul.pl-list-prices', { 'aria-label': 'Plans and prices' });
  const lines = {};
  for (const id of ids) {
    const line = h('span.pl-list-line');
    lines[id] = line;
    const r = usd ? view.plans[id] : null;
    const text = r ? fmtMinor(r.minor, 'USD') + ' a year · ≈ ' + perDayIn(r.minor, 'USD') + ' a day · ' + chargeCaption(view, r.inrMinor)
      : inr(LIST_PRICE[id]) + ' a year · ≈ ' + perDay(LIST_PRICE[id]) + ' a day';
    ul.append(h('li', {}, [h('strong', { text: planName(id) }), h('span.pl-list-price', { text }), line]));
  }
  import('../lib/plan-matrix.js').then((m) => {
    for (const id of ids) { const t = m.MATRIX.lines && m.MATRIX.lines[id]; if (t && lines[id]) lines[id].textContent = t; }
  }).catch(() => { /* the names and prices stand */ });
  return h('div.pl-list-wrap', {}, [ul,
    h('p.pl-note', { text: (usd ? (view.charge === 'USD' ? 'A year each, in US dollars' : 'A year each, shown in US dollars and charged in Indian rupees') : 'A year each, in Indian rupees')
      + ', confirmed at checkout. Nothing renews by itself: you buy the next year when you want it. Each plan includes everything in the one before it.' })]);
}

export default { listPriceBlock };
