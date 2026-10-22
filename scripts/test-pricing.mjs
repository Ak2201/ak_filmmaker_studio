/* test:pricing — the PRICING-CLIENT half of docs/US-MARKET-PLAN.md, in Node.
   src/lib/price-model.js is how every page turns price_notice('USD') into
   what a card prints and what an order is placed in. These are the rules
   that must not drift: rupees format exactly as the server's fmtPaise and
   the build's perDay; a dollar card is a DISPLAY figure until usd_checkout
   is a boolean true AND charged_currency says USD; the order currency is
   the CHARGE, never the display; and nothing in the client types a dollar
   amount. */
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const M = await import('../src/lib/price-model.js');
const { fmtPaise, perDayPaise } = await import('../supabase/functions/_shared/razorpay.js');
const P = await import('../src/lib/plans.js').catch(() => null);
const I = await import('../src/lib/invoice.js');

let n = 0, bad = 0;
const ok = (name, c) => { n++; if (!c) { bad++; console.error('FAIL', name); } };
const eq = (name, a, b) => ok(`${name} (got ${JSON.stringify(a)})`, a === b);

/* ---- formatting ---------------------------------------------------- */
let agree = true;
for (const v of [0, 1, 99, 100, 59900, 59950, 149900, 1999900, 12345678]) if (M.fmtMinor(v, 'INR') !== fmtPaise(v)) agree = false;
ok('fmtMinor(INR) prints exactly what the server\'s fmtPaise prints', agree);
eq('fmtMinor $19', M.fmtMinor(1900, 'USD'), '$19');
eq('fmtMinor $19.50', M.fmtMinor(1950, 'USD'), '$19.50');
eq('fmtMinor $1,299 (en-US grouping)', M.fmtMinor(129900, 'USD'), '$1,299');
eq('fmtMinor ₹1,49,999 (en-IN grouping)', M.fmtMinor(14999900, 'INR'), '₹1,49,999');
eq('perDayMinor rounds like perDayPaise', M.perDayMinor(59900), perDayPaise(59900));
eq('perDayIn $19 a year', M.perDayIn(1900, 'USD'), '$0.05');
eq('perDayIn $39 a year', M.perDayIn(3900, 'USD'), '$0.11');
eq('perDayIn nothing for sale', M.perDayIn(0, 'USD'), '');
if (P && P.perDay) {
  let same = true;
  for (let r = 1; r <= 3000; r++) if (M.perDayIn(r * 100, 'INR') !== P.perDay(r)) { same = false; break; }
  ok('perDayIn(INR) agrees with plans.js perDay (the build stamp) for every whole rupee to 3000', same);
}
eq('parseMinor "19"', M.parseMinor('19', 'USD'), 1900);
eq('parseMinor "$19.5"', M.parseMinor('$19.5', 'USD'), 1950);
eq('parseMinor "1,299"', M.parseMinor('1,299', 'USD'), 129900);
eq('parseMinor refuses words', M.parseMinor('19 dollars', 'USD'), null);
eq('parseMinor refuses rupees (money.js / parseRupees own those)', M.parseMinor('599', 'INR'), null);

/* ---- reading price_notice('USD') ----------------------------------- */
const row = (id, inr, usd, extra = {}) => ({ id, price_paise: inr, next_price_paise: null, next_price_at: null,
  display_currency: usd ? 'USD' : 'INR', display_minor: usd || inr, display_next_minor: null, ...extra });
const notice = (over = {}) => ({ currency: 'USD', charged_currency: 'INR', usd_checkout: false,
  plans: [row('starter', 59900, 1900), row('indie', 79900, 2900), row('pro', 99900, 3900)], ...over });

let v = M.shopView('USD', notice());
ok('every plan has a dollar figure: the cards print dollars', v.currency === 'USD' && v.plans.starter.minor === 1900);
ok('usd_checkout false: the charge is rupees', v.charge === 'INR' && M.orderCurrency(v) === 'INR');
eq('a dollar card charged in rupees names the rupee amount', M.chargeCaption(v, v.plans.starter.inrMinor), 'Charged as ₹599 at checkout');
ok('the switch line says Razorpay charges rupees', /charges the rupee price/.test(M.currencySentence(v)));

v = M.shopView('USD', notice({ usd_checkout: true, charged_currency: 'USD' }));
ok('usd_checkout true and charged_currency USD: charged in dollars', v.charge === 'USD' && M.orderCurrency(v) === 'USD');
eq('caption, charged in dollars', M.chargeCaption(v, 59900), 'Charged in US dollars');

v = M.shopView('USD', notice({ usd_checkout: 'true', charged_currency: 'USD' }));
ok('usd_checkout is believed only as a boolean (the entitlement() lesson)', v.charge === 'INR');
v = M.shopView('USD', (() => { const x = notice({ charged_currency: 'USD' }); delete x.usd_checkout; return x; })());
ok('a notice without usd_checkout (no §56) is charged in rupees', v.charge === 'INR');
v = M.shopView('USD', notice({ usd_checkout: true, charged_currency: 'INR' }));
ok('switch on but the server still says INR: rupees', v.charge === 'INR');

v = M.shopView('USD', notice({ plans: [row('starter', 59900, 1900), row('indie', 79900, null), row('pro', 99900, 3900)] }));
ok('one plan without a dollar price: the whole list stays in rupees, and says so', v.currency === 'INR' && v.fallback === true && v.plans.indie.minor === 79900);
ok('the fallback sentence says the dollar prices could not be shown', /rupees/.test(M.currencySentence(v)));
v = M.shopView('USD', null);
ok('no answer at all: rupees, fallback', v.currency === 'INR' && v.fallback && v.charge === 'INR');
v = M.shopView('INR', notice());
ok('a rupee visitor is shown rupees from the same notice (the CURRENT price)', v.currency === 'INR' && v.plans.pro.minor === 99900 && !v.fallback);
ok('rupeeView before any answer', M.rupeeView('USD').currency === 'INR' && M.rupeeView('USD').fallback && !M.rupeeView('INR').fallback);
eq('fromDay is the cheapest plan a day, in the view\'s currency', M.fromDay(M.shopView('USD', notice())), '$0.05');

/* ---- a rise, in dollars ---------------------------------------------- */
const at = '2026-10-31T18:29:00Z';
const rising = notice({ plans: [row('starter', 59900, 1900, { next_price_paise: 99900, next_price_at: at, display_next_minor: 2900 }),
  row('indie', 79900, 2900, { next_price_paise: 149900, next_price_at: at, display_next_minor: null }), row('pro', 99900, 3900)] });
let money = M.riseMoney(M.shopView('USD', rising));
eq('a plan with a dollar next price rises in dollars', money.next({ id: 'starter' }), '$29');
eq('charged in rupees with no dollar next price: the coming RUPEE rise is still said', money.next({ id: 'indie' }), '₹1,499');
money = M.riseMoney(M.shopView('USD', { ...rising, usd_checkout: true, charged_currency: 'USD' }));
eq('charged in dollars with no dollar next price: nothing rises on screen', money.next({ id: 'indie' }), '');
ok('riseMoney is null for a rupee page (start-model\'s rupee default)', M.riseMoney(M.shopView('INR', rising)) === null);

/* ---- invoices in the paid currency ---------------------------------- */
eq('amount in words, dollars', I.amountInWords(1950, 'USD'), 'US Dollars Nineteen and Fifty Cents only');

/* ---- the client never types a dollar amount, and stays light -------- */
for (const f of ['src/lib/price-model.js', 'src/lib/plans.js', 'src/ui/plan-cards.js', 'src/pages/purchase.js', 'src/pages/pricing.js', 'src/pages/start.js',
  'src/ui/billing-admin.js', 'src/ui/list-prices.js', 'scripts/make-marketing-pages.mjs', 'vite.config.js']) {
  const src = read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  ok(f + ' types no dollar amount', !/\$\d/.test(src.replace(/\$\{/g, '')));
}
ok('price-model.js imports nothing (a public page loads it)', !/^\s*import\b/m.test(read('src/lib/price-model.js')));
for (const f of ['src/pages/pricing.js', 'src/pages/start.js']) ok(f + ' reads region-core.js, never region.js (the startlib rule)', !/lib\/region\.js/.test(read(f)) && /lib\/region-core\.js/.test(read(f)));
ok('purchase.js reads region.js (the app side)', /lib\/region\.js/.test(read('src/pages/purchase.js')));
ok('billing.quote() falls back to the 2-arg rupee quote on PGRST202', /PGRST202/.test(read('src/lib/billing.js')) && /p_currency: 'USD'/.test(read('src/lib/billing.js')));
ok('buy() sends the currency to rzp-order', /currency: currency === 'USD' \? 'USD' : 'INR'/.test(read('src/lib/billing.js')));
ok('the currency switch writes payCurrency, never fms_region_v1', !/setRegion|fms_region_v1['"]\s*,/.test(read('src/pages/purchase.js')) && /writePayCurrency\(/.test(read('src/pages/purchase.js')));
ok('price-model is not in CORE or startlib (vite manualChunks)', !/price-model/.test(read('vite.config.js').split('manualChunks')[1] || ''));

console.log(`test:pricing: ${n - bad} passed, ${bad} failed`);
process.exit(bad ? 1 : 0);
