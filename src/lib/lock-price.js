/* ============================================================
   LOCK PRICE — what the locked-module card says a plan costs
   ------------------------------------------------------------
   plan-gate.js (CORE) imports this with import() only once a lock card
   knows which plan it is selling, so none of it is on any page's first
   paint. It fills the card's price line and, for a signed-in buyer, the
   upgrade button's figure from the server's own quote.

   A visitor whose shop currency (docs/US-MARKET-PLAN.md §B: their own
   pick, the device's stated market, the guess) is USD sees the plan in
   dollars, and the button quotes in the currency the checkout will
   CHARGE, as purchase.html does. A rupee visitor, or a server that
   cannot answer in dollars, gets the rupee line exactly as before.
   Reads only.
   ============================================================ */
import Billing from './billing.js';
import { pricingCurrency, readPayCurrency, chosenRegion, guessVisitorRegion } from './region.js';
import { shopView, fmtMinor, perDayIn, orderCurrency } from './price-model.js';

/** The dollar line and order currency for plan `p`, or null. */
async function dollars(p, name) {
  let want = 'INR';
  try { want = pricingCurrency({ override: readPayCurrency(), chosen: chosenRegion(), guess: guessVisitorRegion() }); } catch (e) { want = 'INR'; }
  if (want !== 'USD') return null;
  let notice = null;
  try { notice = await Billing.priceNotice('USD'); } catch (e) { notice = null; }
  const v = shopView('USD', notice);
  const r = v.currency === 'USD' && v.plans[p.id];
  if (!r || !(r.minor > 0)) return null;
  return {
    line: 'Included in the ' + name + ' plan — ' + fmtMinor(r.minor, 'USD') + ' a year, about ' + perDayIn(r.minor, 'USD') + ' a day'
      + (v.charge === 'USD' ? '.' : ', charged in rupees.'),
    orderCur: orderCurrency(v)
  };
}

/** Fill `line` (and `cta`, when given) for plan `p`. `ids` are the locked ids. */
export async function fillLock(p, ids, line, cta) {
  const name = p.name || Billing.planName(p.id);
  const paise = Billing.priceFor(p, 'year');
  line.textContent = 'Included in the ' + name + ' plan' + (paise > 0 ? ' — ' + Billing.fmtPaise(paise) + ' a year, about ' + Billing.fmtPaise(Billing.perDayPaise(paise)) + ' a day.' : '.');
  if (cta) {
    const q = new URLSearchParams({ plan: p.id });
    if (ids.length === 1) q.set('for', ids[0]);
    cta.href = 'purchase.html?' + q.toString();
  }
  let usd = null;
  try { usd = await dollars(p, name); } catch (e) { usd = null; }
  if (usd) line.textContent = usd.line;
  const c = window.StudioCloud;
  if (!cta || !c || !c.getSession || !c.getSession()) return;
  try {
    const q = await Billing.quote(p.id, null, usd ? usd.orderCur : 'INR');
    if (!q || !q.ok || !(q.amount_paise > 0)) return;
    const amount = usd ? fmtMinor(q.amount_minor != null ? q.amount_minor : q.amount_paise, q.currency === 'USD' ? 'USD' : 'INR') : Billing.fmtPaise(q.amount_paise);
    cta.textContent = 'UPGRADE FOR ' + amount + (q.credit_paise > 0 ? ' MORE' : '');
  } catch (e) { /* the plain button stands */ }
}

export default { fillLock };
