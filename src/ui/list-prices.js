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
import '../styles/list-prices.css';

/* THE PRICES, FOR SOMEBODY NOT SIGNED IN. invite.html and purchase.html
   used to send a signed-out visitor back to start.html to learn what a
   plan costs, off the buying path. The plans ROWS need a session (and
   the Supabase SDK, which a signed-out first paint must not fetch), so
   this reads LIST_PRICE — the same constant start.html is stamped from
   at build time — and says "confirmed at checkout", exactly as that
   page does. Each plan's one line ("Write the film — from beat sheet to formatted screenplay.") arrives with the
   lazy matrix chunk; until then the names and figures stand alone. */
export function listPriceBlock() {
  const ids = PLAN_ORDER.filter((id) => id !== 'free' && LIST_PRICE[id] > 0);
  const ul = h('ul.pl-list-prices', { 'aria-label': 'Plans and prices' });
  const lines = {};
  for (const id of ids) {
    const line = h('span.pl-list-line');
    lines[id] = line;
    ul.append(h('li', {}, [h('strong', { text: planName(id) }), h('span.pl-list-price', { text: inr(LIST_PRICE[id]) + ' a year · ≈ ' + perDay(LIST_PRICE[id]) + ' a day' }), line]));
  }
  import('../lib/plan-matrix.js').then((m) => {
    for (const id of ids) { const t = m.MATRIX.lines && m.MATRIX.lines[id]; if (t && lines[id]) lines[id].textContent = t; }
  }).catch(() => { /* the names and prices stand */ });
  return h('div.pl-list-wrap', {}, [ul,
    h('p.pl-note', { text: 'A year each, in Indian rupees, confirmed at checkout. Nothing renews by itself: you buy the next year when you want it. Each plan includes everything in the one before it.' })]);
}

export default { listPriceBlock };
