/* ============================================================
   PRICE MODEL — a price in rupees or dollars, as PURE functions
   ------------------------------------------------------------
   docs/US-MARKET-PLAN.md §B, §C1 and the PRICING-CLIENT brief. Visitors
   in India see and pay rupees; everybody else sees US dollars, and pays
   them once the owner has turned `usd_checkout` on. This file is how a
   page turns the server's answer into what a card prints. It decides
   nothing about the PRICE: the dollar figures are the owner's, typed in
   the console (admin.html#tiers) and read back through
   price_notice('USD'); no dollar amount appears anywhere in the client
   or the build.

   IMPORT-FREE, and in no manual chunk. It is imported by the public
   pages (start, pricing) and by the app's purchase page, the plan cards
   and the console, so the bundler gives it a small shared chunk of its
   own. It must not go into CORE or `startlib`, both of which are on
   every page's first paint (scripts/budget.json).

   MINOR UNITS EVERYWHERE. Paise for INR, cents for USD, exactly as the
   server's `*_minor` keys and every `*_paise` column hold "minor units
   of that row's currency" (§C1). Whole-rupee display copy (LIST_PRICE)
   stays in plans.js and is INR only.

   THE TRUTH ABOUT THE CHARGE IS ALWAYS SAID. A dollar figure on a card
   is a DISPLAY figure until the server says otherwise: `usd_checkout` is
   believed only when it is a boolean in the notice (the entitlement()
   lesson in CLAUDE.md: a key has to be PRESENT to be believed), and
   while it is false every dollar card says what Razorpay will actually
   charge, in rupees.

   The server's twins (_shared/razorpay.js fmtMinor / perDayMinor /
   parseMinor) are PRICING-SERVER's; these round the same way, so a card
   and a receipt cannot disagree. When they land, the client may import
   them from there instead.
   ============================================================ */

export const PLAN_DAYS = 365;
const SYMBOL = { INR: '₹', USD: '$' };
const LOCALE = { INR: 'en-IN', USD: 'en-US' };
const cur = (c) => (c === 'USD' ? 'USD' : 'INR');

/** "₹599", "₹599.50", "$19", "$19.50": en-IN grouping for rupees,
 *  en-US for dollars. A fraction is printed only when there is one. */
export function fmtMinor(minor, currency = 'INR') {
  const c = cur(currency);
  const n = Math.round(Number(minor) || 0);
  const whole = Math.floor(Math.abs(n) / 100), frac = Math.abs(n) % 100;
  return (n < 0 ? '-' : '') + SYMBOL[c] + whole.toLocaleString(LOCALE[c]) + (frac ? '.' + String(frac).padStart(2, '0') : '');
}

/** What a year costs a day, in minor units, rounded to the nearest
 *  paisa or cent (the same rounding as perDayPaise). null when nothing
 *  is for sale. */
export function perDayMinor(minor) {
  const n = Number(minor);
  return Number.isFinite(n) && n > 0 ? Math.round(n / PLAN_DAYS) : null;
}

/** "₹1.64", "$0.05": a day of a year, always with two decimals (a
 *  per-day figure with no pence reads as a typo). '' when not for sale. */
export function perDayIn(minor, currency = 'INR') {
  const d = perDayMinor(minor);
  if (d === null) return '';
  const c = cur(currency);
  return SYMBOL[c] + Math.floor(d / 100).toLocaleString(LOCALE[c]) + '.' + String(d % 100).padStart(2, '0');
}

/** A DOLLAR amount the owner typed ("19", "$19.50", "1,299") → cents,
 *  or null. Rupees are not parsed here: rupee input goes through
 *  parseRupees (billing.js) or money.js, the one rupee parser rule. */
export function parseMinor(s, currency = 'USD') {
  if (currency !== 'USD') return null;
  const m = String(s ?? '').replace(/[$,\s]/g, '').replace(/^USD/i, '').match(/^(\d+)(?:\.(\d{1,2}))?$/);
  if (!m) return null;
  return Number(m[1]) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
}

/* ---- reading price_notice('USD') --------------------------------- */

/**
 * What the shop can honestly print for `currency`, from the server's
 * price_notice(currency) answer (§31, §53). Never throws.
 *
 *   { currency, charge, fallback, plans }
 *     currency  what the cards print: 'USD' only when EVERY active paid
 *               plan came back with a dollar display figure; otherwise
 *               'INR' (a card in the wrong currency beats a blank one)
 *     charge    what Razorpay will charge: 'USD' only when the notice
 *               carries `usd_checkout: true` (a boolean, present) AND
 *               says `charged_currency: 'USD'`; otherwise 'INR'
 *     fallback  true when dollars were asked for and rupees are shown
 *     plans     { <id>: { minor, nextMinor, nextAt, inrMinor, inrNextMinor } }
 *               minor/nextMinor in `currency`; inr* always rupees (paise)
 */
export function shopView(currency, notice) {
  const want = cur(currency);
  const rows = notice && Array.isArray(notice.plans) ? notice.plans.filter((p) => p && p.id && p.id !== 'free') : [];
  const usdOk = want === 'USD' && rows.length > 0 && rows.every((p) =>
    (Number(p.price_paise) || 0) <= 0 || (p.display_currency === 'USD' && Number.isInteger(p.display_minor) && p.display_minor >= 100));
  const show = usdOk ? 'USD' : 'INR';
  const charge = usdOk && typeof notice.usd_checkout === 'boolean' && notice.usd_checkout === true && notice.charged_currency === 'USD' ? 'USD' : 'INR';
  const plans = {};
  for (const p of rows) {
    const inr = Number.isInteger(p.price_paise) ? p.price_paise : null;
    const inrNext = Number.isInteger(p.next_price_paise) ? p.next_price_paise : null;
    plans[p.id] = show === 'USD'
      ? { minor: p.display_minor, nextMinor: Number.isInteger(p.display_next_minor) ? p.display_next_minor : null, nextAt: p.next_price_at || null, inrMinor: inr, inrNextMinor: inrNext }
      : { minor: inr, nextMinor: inrNext, nextAt: p.next_price_at || null, inrMinor: inr, inrNextMinor: inrNext };
  }
  return { currency: show, charge, fallback: want === 'USD' && show !== 'USD', plans };
}

/** The view before (or without) any answer from the server: rupees,
 *  and, when dollars were wanted, the honest "prices in rupees". */
export const rupeeView = (wanted) => ({ currency: 'INR', charge: 'INR', fallback: cur(wanted) === 'USD', plans: {} });

/** The order currency to send to rzp-order: the CHARGE, never the
 *  display. A dollar card on a rupee checkout orders in rupees. */
export const orderCurrency = (view) => (view && view.charge === 'USD' ? 'USD' : 'INR');

/** The small line under a price: what kind of payment it is, and, on a
 *  dollar card that is charged in rupees, the rupee amount itself
 *  (hiding the charged amount until checkout is drip pricing). */
export function chargeCaption(view, inrMinor) {
  if (!view || view.currency !== 'USD') return 'Charged in Indian rupees';
  if (view.charge === 'USD') return 'Charged in US dollars';
  return Number(inrMinor) > 0 ? 'Charged as ' + fmtMinor(inrMinor, 'INR') + ' at checkout' : 'Charged in Indian rupees at checkout';
}

/** One sentence for the whole price list, said once beside the switch. */
export function currencySentence(view) {
  if (!view || view.currency !== 'USD') {
    return view && view.fallback
      ? 'Prices in rupees: the dollar prices could not be loaded just now. You pay in Indian rupees through Razorpay.'
      : 'Prices in Indian rupees, paid in rupees through Razorpay.';
  }
  return view.charge === 'USD'
    ? 'Prices in US dollars, charged in US dollars through Razorpay.'
    : 'Prices shown in US dollars. Razorpay charges the rupee price shown on each plan, and your card provider converts it.';
}

/** How a scheduled rise is printed on a page showing `view`, as the
 *  { now(p), next(p) } pair start-model.js's risingTiers/priceRiseBand
 *  take; null for rupees (their default). A plan with a dollar next
 *  price rises in dollars. One without, on a page charged in RUPEES,
 *  still rises where it is charged, so that rise is printed in rupees:
 *  a coming change to the amount taken is never left out. Charged in
 *  dollars with no dollar next price, nothing rises on screen (the
 *  server charges the dollar figure until one is set). */
export function riseMoney(view) {
  if (!view || view.currency !== 'USD') return null;
  const pick = (p) => {
    const r = view.plans[p.id];
    if (!r) return null;
    if (r.nextMinor) return { now: fmtMinor(r.minor, 'USD'), next: fmtMinor(r.nextMinor, 'USD') };
    if (view.charge !== 'USD' && r.inrNextMinor) return { now: fmtMinor(r.inrMinor, 'INR'), next: fmtMinor(r.inrNextMinor, 'INR') };
    return null;
  };
  return { now: (p) => (pick(p) || {}).now || '', next: (p) => (pick(p) || {}).next || '' };
}

/** The cheapest plan's figure a day, for "from about $0.05 a day". */
export function fromDay(view) {
  const all = Object.values((view && view.plans) || {}).map((r) => r.minor).filter((n) => n > 0);
  return all.length ? perDayIn(Math.min(...all), view.currency) : '';
}

/** The switch's two options, in the order it draws them. */
export const CURRENCY_OPTIONS = [
  { value: 'INR', label: '₹ INR' },
  { value: 'USD', label: '$ USD' }
];
