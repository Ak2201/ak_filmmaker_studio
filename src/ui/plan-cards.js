/* ============================================================
   PLAN CARDS — the three tiers, one price each, and a BUY button
   ------------------------------------------------------------
   One component, drawn on purchase.html (a member choosing or
   renewing) and on invite.html (a signed-in stranger buying their way
   in — PAYING GRANTS ENTRY). The prices and limits come from the plans
   table, so what the console saves is what this shows; nothing here
   names a number.

   Limits are written as sentences, not icons, and every card says the
   same five things in the same order so the eye can compare down the
   row. A number that is null is "unlimited".

   NO FREE CARD (owner, 11 Oct 2026): "Let's not have a free version;
   it can be a free TRIAL." The plans table keeps its 'free' row — it is
   what user_plan() answers for somebody who has bought nothing, the
   "no plan" state — but it is never drawn here as a choice, on
   purchase.html or invite.html. A trial is not a plan and is not sold.

   THE LAUNCH PASS IS NOT A TIER EITHER (§61). It is a few days of Pro,
   period 'pass', drawn by purchase.html as its own card above this row
   and never here. An account on a running pass holds NO plan for this
   row: quote_for treats it as none, so every tier is a first purchase
   (no renewal, no upgrade credit), and the one bought replaces the pass
   from that day.

   A YEAR AT A TIME (schema section 52, owner 21 Oct 2026). A plan lasts
   365 days; the price is per year and the card leads with what that
   costs a DAY (₹599 → ≈ ₹1.64). The current tier's card says until when
   and offers RENEW (another year, stacked onto the time left — nothing
   is ever charged automatically); HIGHER tiers offer an upgrade credited
   with the unused part of the year; a lower tier waits for the year to
   end. A plan GRANTED for good says so and has nothing to renew. The
   period the host receives is always 'year'.

   THE CURRENCY (docs/US-MARKET-PLAN.md §B/§C). The host passes `shop`, a
   price-model.js view: India sees the rows' rupees; everybody else the
   owner's dollar figures from price_notice('USD'). The CHARGE is said on
   every card — a dollar card charged in rupees prints the rupee amount
   ("Charged as ₹599 at checkout"), because hiding the amount taken until
   checkout is drip pricing. Quotes (a promo code, an upgrade credit) are
   asked in the ORDER currency and printed in whatever currency they came
   back in; BUY sends that same currency to rzp-order, never an amount.

   PROMO CODES (schema section 20). "Have a code?" under the row: APPLY
   asks quote_order() for every plan the row can sell, and a card whose
   quote came back ok reprices itself — the discounted figure large,
   the list price struck beside it. A refused code prints the server's
   sentence. The code then rides on BUY; the server re-quotes it when
   it makes the order, and the client sends no price, ever. The code
   lives in this module's memory for the page and in no storage.

   ONE-TIME OR AUTO-RENEW (schema §62, owner 27 Oct 2026). The owner sets
   it in the console; the buyer is TOLD, never asked. Every card's terms
   line is offer-terms.js's, from the mode trial_offer() published
   (billing.js cachedModes()): "₹599 every year · renews until you cancel
   · cancel anytime", or "₹599 for a year · one payment, nothing renews",
   or — a server that says neither — the price and the length alone. The
   mode the card showed rides on BUY (`shownMode`), and billing.js refuses
   to open a checkout whose terms changed since. On auto-renew a code has
   nowhere to ride (a subscription's amount is the plan's), so the code
   box is not drawn; an account whose auto-pay is running buys nothing
   more here until it is cancelled (rzp-subscribe's 'subscribed').

   No inline handlers (CSP). Everything is delegate() on
   [data-plan-action]; the host page passes `onBuy(planId, period,
   onStatus, code)`.
   ============================================================ */
import { reveal } from '../lib/motion.js';
import '../styles/motion.css';
import { h, delegate } from '../lib/dom.js';
import { errorSentence } from '../lib/gate.js';
import Billing, { priceFor, cap, planName, normalisePromo, UPGRADE_ONCE } from '../lib/billing.js';
import { ask } from './dialog.js';
import PlanGate, { CAPABILITIES, OFF_BY_DEFAULT } from '../lib/plan-gate.js';
import { wantedPlan as wantedPlanFrom, buyParam, wantsBuy, stripBuyFromAddress, clearPlanStash, stashPlanFromAddress } from '../lib/purchase-model.js';
import { SUPPORT_EMAIL } from '../lib/brand.js';
import { onPass } from '../lib/pass-view.js';
import { offerTerms, renewsText, cancelledText } from '../lib/offer-terms.js';
import { fmtMinor, perDayIn, orderCurrency, chargeCaption } from '../lib/price-model.js';
import { meter } from './kit/meter.js';
import { RECOMMENDED } from './list-prices.js';
import SITE from '../data/marketing-site.json';   // student.live: the code is named only once it exists
import '../styles/plans.css';
import '../styles/growth.css';

const period = 'year';         // the only period sold (schema §52)
/* "21 Oct 2027", for "valid until". */
const day = (iso) => { const d = new Date(iso); return isNaN(d) ? '' : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }); };
const daysTo = (iso) => Math.ceil((new Date(iso) - Date.now()) / 86400000);
let busyPlan = '';
let statusText = '';
/* A ?buy= that could not be honoured, said once above the cards. */
let buyNote = '';
/* The card whose sheet was dismissed or failed: its button says Try again. */
let failedPlan = '';
const planNameOf = (plans, id) => { const p = (plans || []).find((x) => x.id === id); return (p && p.name) || planName(id); };
/* Which card the status belongs to: it is drawn under THAT card's
   button, where the reader pressed. At the foot of the row it sat
   1,000-3,500px below the button and nobody saw why nothing happened. */
let statusPlan = '';
/* After a redraw, put focus back where the reader was if the redraw
   dropped it (the pressed control was rebuilt, or drawn disabled while
   busy, so it could not keep focus). Only when focus fell to <body>:
   a reader who has moved on is left where they are. */
function refocus(sel) {
  const a = document.activeElement;
  if (a && a !== document.body && a.isConnected) return;
  const el = document.querySelector(sel);
  if (el && !el.disabled) try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
}
let hooks = { onBuy: null, rerender: null, onSuccess: null };
/* The price view the host passed (price-model.js shopView), kept for the
   page so BUY and the quotes use the currency the cards were drawn in. */
let shopNow = null;
const orderCur = () => orderCurrency(shopNow);
/* A quote's figure in the quote's own currency (§56 answers *_minor and
   `currency`; an older server answers *_paise only, and that is rupees). */
const qCur = (q) => (q && q.currency === 'USD' ? 'USD' : 'INR');
const qAmt = (q, k) => (q ? (Number.isInteger(q[k + '_minor']) ? q[k + '_minor'] : q[k + '_paise']) : 0);
const qFmt = (q, k) => fmtMinor(qAmt(q, k), qCur(q));
/* The plan just bought, in this module's memory for the page. Set when
   onBuy resolves; drawn above the row as "You're on <plan>". */
let justBought = '';
let pickedDone = false;
/* The card a deep link picked, and what it was picked FOR, kept for the
   page: the row is rebuilt on every billing event, and the mark and the
   reason line were drawn once and lost on the first redraw. */
let picked = { id: '', why: '' };
/* The code as typed, the quotes it earned (plan id -> quote_order()
   answer), a sentence when it was refused, and whether the box is open. */
const promo = { typed: '', code: '', quotes: {}, error: '', busy: false, open: false, at: null, cur: '' };
const appliedQuote = (planId) => { const q = promo.quotes[planId]; return q && q.ok && q.code ? q : null; };
/* WHAT BILLING LOOKED LIKE, as one string: the plan held, until when,
   and how many payments are paid. A quote is only true of the state it
   was asked in, and a payment the studio has not yet confirmed is only
   confirmed when this moves. */
const billingKey = (st) => st ? `${st.plan || ''}|${st.plan_until || ''}|${((st.payments || []).filter((p) => p && p.status === 'paid')).length}` : '';
let lastSt = null;
/* A PAYMENT CHECKOUT TOOK THAT THE STUDIO HAS NOT CONFIRMED (billing.js
   afterPayment(): 202 pending, or no answer). Until billing moves off
   the state it was taken in, no BUY button is live and the plan's says
   so — the old billing still offers the plan just paid for, and a second
   press was a second year charged (§52 stacks it). */
let confirming = { id: '', at: '' };
/* Drop the quotes a code earned and ask again, once the row is drawn:
   the server prices it for the billing there is NOW (an upgrade credit,
   a use of the code spent). The typed code stays, so a link's code is
   not lost to a sign-in or a purchase landing after it was applied. */
function requote() {
  const had = promo.code;
  promo.code = ''; promo.quotes = {}; promo.error = ''; promo.at = null;
  if (!had) return;
  setTimeout(() => {
    const input = document.getElementById('plPromoCode');
    const form = input && input.closest('form');
    if (!form || !form.isConnected || input.disabled || !input.value) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, 0);
}

/* UPGRADE BY PAYING THE DIFFERENCE (schema section 21). For somebody who
   has already paid, the server prices a higher tier as its list price
   less what they paid; the cards ask quote_order() for each buyable
   tier once per (plan held, payments) state and print the answer. The
   arithmetic is the server's — this only shows it. A promo quote
   already includes the credit, so it wins when both exist. */
const upg = { key: '', quotes: {}, busy: false };
const upgradeQuote = (planId) => { const q = upg.quotes[planId]; return q && q.ok && qAmt(q, 'credit') > 0 ? q : null; };
function loadUpgradeQuotes(st, ids) {
  const paid = ((st && st.payments) || []).filter((p) => p.status === 'paid').length;
  if (!st || st.plan === 'free' || onPass(st) || !paid || !ids.length) { upg.key = ''; upg.quotes = {}; return; }
  const cur = orderCur();
  const key = `${st.plan}:${paid}:${ids.join(',')}:${cur}`;
  if (upg.key === key || upg.busy) return;
  upg.busy = true; upg.key = key; upg.quotes = {};
  Promise.all(ids.map((id) => Billing.quote(id, null, cur).then((q) => [id, q], () => [id, null])))
    .then((answers) => { upg.quotes = Object.fromEntries(answers); })
    .finally(() => { upg.busy = false; if (hooks.rerender) hooks.rerender(); });
}

const LIMIT_LINES = [
  ['projects',      (n) => n === null ? 'Unlimited cloud projects' : `${n} cloud project${n === 1 ? '' : 's'}`],
  ['collaborators', (n) => n === null ? 'Unlimited collaborators per film' : n === 0 ? 'No collaborators' : `${n} collaborator${n === 1 ? '' : 's'} per film`],
  ['shares',        (n) => n === null ? 'Unlimited share links' : n === 0 ? 'No share links' : `${n} live share link${n === 1 ? '' : 's'}`],
  ['seats',         (n) => n === null ? 'Unlimited organisation seats' : `${n} organisation seat${n === 1 ? '' : 's'}`]
];
/* The same caps as a comparison-table row: a label and a short cell. */
const LIMIT_ROWS = [
  ['projects',      'Cloud projects'],
  ['collaborators', 'Collaborators per film'],
  ['shares',        'Live share links'],
  ['seats',         'Organisation seats']
];

/* WHICH MODULES ARE SOLD AT ALL. A module switched off for everybody
   (plan-matrix.json `plans: []`, mirrored by OFF_BY_DEFAULT; or unticked
   on every paid plan row in the console) is not a feature of any plan,
   so neither a card nor the comparison lists it — a ticked "Songs" on
   Pro would sell a page nobody can open. A row that says true for some
   plan wins, the same precedence isDisabledEverywhere() gives it. Built
   from the plans ROWS, so a console edit shows on the next load. */
function listedIn(plans) {
  const paid = (plans || []).filter((p) => p && p.id !== 'free');
  return (id) => {
    if (paid.some((p) => p.features && p.features[id] === true)) return true;
    if (OFF_BY_DEFAULT.includes(id)) return false;
    return !(paid.length && paid.every((p) => p.features && p.features[id] === false));
  };
}

/* WHAT A PLAN INCLUDES, counted from the console's Features matrix
   (plans.features, schema section 18): every module that is sold plus
   the capabilities, except `sample_only`, which is a restriction and is
   said in words instead. A missing key is included (plan-gate.js reads
   it as allowed), so the count agrees with what the pages will do.
   Stages with nothing sold in them are dropped. */
function featureSummary(p, listed = () => true) {
  const f = (p && p.features) || {};
  const incl = (key) => f[key] !== false;
  const stages = PlanGate.moduleCatalogue()
    .map((s) => ({ id: s.id, label: s.label, items: s.modules.filter((m) => listed(m.id)).map((m) => ({ ...m, on: incl(m.id) })) }))
    .filter((s) => s.items.length);
  const caps = CAPABILITIES.filter(([k]) => k !== 'sample_only').map(([k, label]) => ({ id: k, label, on: incl(k) }));
  const all = [...stages.flatMap((s) => s.items), ...caps];
  return { stages, caps, total: all.length, included: all.filter((x) => x.on).length, sampleOnly: f.sample_only === true };
}
/* The card's foot: the count, and the way to the full table below. */
function featureBlock(p, listed, preview = false) {
  const s = featureSummary(p, listed);
  const wrap = h('div.pl-features');
  wrap.append(h('p.pl-features-n', {}, [h('strong', { text: `${s.included} of ${s.total}` }), h('span', { text: ' features' })]));
  if (s.sampleOnly) wrap.append(h('p.pl-features-note', { text: 'Sample project only' }));
  wrap.append(h('a.pl-features-link', { href: '#plCompare', 'data-plan-action': 'compare', text: 'Compare every feature' }));
  return wrap;
}

/* WHAT THIS PLAN ADDS to the paid plan below it, as a checklist grouped
   by stage. From the plans ROWS (plans.features — what the pages will
   actually do, console edits included), which schema section 36 seeds
   from src/data/plan-matrix.json. If the rows do not tell the plans
   apart at all (every map still {}), the matrix itself says it, loaded
   lazily. Never a typed list. */
let matrixMod = null;
let matrixAsked = false;
function wantMatrix() {
  if (matrixMod || matrixAsked) return;
  matrixAsked = true;
  import('../lib/plan-matrix.js').then((m) => { matrixMod = m; if (hooks.rerender) hooks.rerender(); }).catch(() => { /* the counts stand */ });
}
/* THE ROWS THE COUNT AND THE TABLE READ. When the rows do not tell the
   plans apart (every features map still {}, so a missing key reads as
   included), "32 of 32" on every card and a tick in every cell would
   contradict the "Everything in X, plus:" list beside them, which
   already falls back to the matrix. Same fallback, same source: the
   matrix's own maps, once its lazy chunk is in (QA, 26 Oct 2026). */
function effectiveRows(plans) {
  const rows = plans || [];
  const differ = rows.some((x) => x && x.id !== 'free' && x.features && Object.values(x.features).some((v) => v === false));
  if (differ || !matrixMod) return rows;
  return rows.map((x) => (x && x.id !== 'free' ? { ...x, features: matrixMod.matrixFeatures(x.id) } : x));
}
const paidSorted = (plans) => (plans || []).filter((x) => x && x.id !== 'free').sort((a, b) => Billing.planRank(a.id) - Billing.planRank(b.id));
/** The ids this plan adds, and the plan it adds them to (null = the first). */
function addedIds(plans, p) {
  const paid = paidSorted(plans);
  const differ = paid.some((x) => x.features && Object.values(x.features).some((v) => v === false));
  const i = paid.findIndex((x) => x.id === p.id);
  if (i < 0) return null;
  const prev = i > 0 ? paid[i - 1] : null;
  let ids;
  if (differ) {
    const f = p.features || {};
    const pf = (prev && prev.features) || {};
    const s = featureSummary(p);
    ids = [...s.stages.flatMap((x) => x.items), ...s.caps].map((x) => x.id).filter((id) => f[id] !== false && (!prev || pf[id] === false));
  } else {
    wantMatrix();
    if (!matrixMod) return null;
    ids = matrixMod.addedBy(p.id).filter((r) => r.kind !== 'limit').map((r) => r.key);
  }
  /* The Chrome extension is a LIMIT (plans.limits.extension), not a
     feature key: the card's Limits group says it, not this list. */
  return { prev, ids: new Set(ids) };
}
function checklist(labels) {
  return h('ul.pl-check', {}, labels.map((t) => h('li', { text: t })));
}
/* AT MOST FIVE BULLETS (owner, 28 Oct 2026): the card is the decision,
   the comparison table is the check. The bullets are the plan's OWN
   additions in plan-matrix.json `card` order (the list start.html and
   pricing.html print), then any other addition in stage order, cut so
   that with the "N more" line the list never passes five. */
const CARD_MAX = 5;
function addsBlock(plans, p, listed, preview = false) {
  const a = addedIds(plans, p);
  if (!a) return null;
  const s = featureSummary(p, listed);
  const all = [...s.stages.flatMap((st) => st.items), ...s.caps].filter((x) => a.ids.has(x.id));
  if (!all.length) return null;
  const order = (matrixMod && matrixMod.MATRIX.card && matrixMod.MATRIX.card[p.id]) || [];
  const rank = (id) => { const i = order.indexOf(id); return i < 0 ? order.length : i; };
  const sorted = all.map((x, i) => ({ x, i })).sort((m, n) => rank(m.x.id) - rank(n.x.id) || m.i - n.i).map((m) => m.x);
  const pickN = order.length ? Math.min(order.length, CARD_MAX - 1) : CARD_MAX - 1;
  const shown = sorted.length <= CARD_MAX ? sorted : sorted.slice(0, pickN);
  const more = sorted.length - shown.length;
  const box = h('div.pl-adds', { 'data-plan-adds': p.id });
  box.append(h('p.pl-adds-lead', { text: a.prev ? 'Everything in ' + (a.prev.name || planName(a.prev.id)) + ', plus:' : 'Includes:' }));
  const ul = checklist(shown.map((x) => x.label));
  if (more > 0) ul.append(h('li.pl-check-more', {}, [h('a', { href: '#plCompare', 'data-plan-action': 'compare', text: `${more} more in the comparison` })]));
  box.append(ul);
  return box;
}

/* The caps, as the card's last group. What the plan INCLUDES (Drive,
   AI, the stages) is the checklist above and the table below, so it is
   not said a third time here. */
/* One line, not a second list: the five bullets above are the card's
   list (owner, 28 Oct 2026). The table below has each cap as a row. */
function limitList(limits) {
  const parts = LIMIT_LINES.map(([key, text]) => text(cap(limits, key)));
  parts.push(limits && limits.extension ? 'Chrome extension included' : 'No Chrome extension');
  return h('p.pl-limits', { text: parts.join(' · ') });
}

let staggered = false;

/* The modes are read once for the page (the same trial_offer() answer as
   the pass); the row redraws when they arrive. */
let modesAsked = false;
function wantModes() {
  if (modesAsked || Billing.modesRead()) return;
  modesAsked = true;
  Billing.offerModes().then(() => { if (hooks.rerender) hooks.rerender(); }, () => {});
}
const planMode = () => Billing.cachedModes().plan;

/** `st` is billing_status() or null (signed out / unknown). */
/* THE PLAN WE RECOMMEND (owner, 28 Oct 2026): Intermediate. Its card
   carries the "Recommended" badge and the brand border, comes first on a
   phone (plans.css) and, whenever it can be bought, its button is the
   only filled one in the row. The id lives in list-prices.js. */
export { RECOMMENDED };

/** `fine: false` leaves the fine print to the host, which draws the
 *  same facts in its own "Read this before you purchase" list
 *  (purchase.html), so nothing is said twice on one page.
 *  `rowTerms: false` leaves the one-line terms above the row ("One
 *  payment · nothing renews") to the host too: purchase.html says them
 *  beside its currency switch, once.
 *  `preview: true` is the SIGNED-OUT row (purchase.html): the same cards
 *  and bullets, from `plans` rows the host builds from the list prices and
 *  the matrix, with a "Sign in to buy <plan>" button where BUY would be.
 *  The caps are not known without a session (they are the server's rows),
 *  so the limits line and the comparison table are left out and the
 *  count links to the public comparison instead. Nothing here can buy. */
export function planCards(plans, st, { onBuy, onSuccess, rerender, compact = false, shop = null, fine = true, rowTerms = true, preview = false } = {}) {
  hooks = { onBuy: onBuy || hooks.onBuy, rerender: rerender || hooks.rerender, onSuccess: onSuccess || hooks.onSuccess };
  lastSt = st;
  const nowKey = billingKey(st);
  if (confirming.id && nowKey !== confirming.at) {
    /* billing moved: the payment landed (or something else changed and
       the cards are drawn from the truth again) */
    if (st && st.plan === confirming.id) { justBought = confirming.id; statusText = ''; }
    confirming = { id: '', at: '' };
  }
  /* A promo quote taken under another billing state (before a purchase,
     say: no upgrade credit then, a use of the code since) prices the
     card wrongly and hides the upgrade line, while the order re-quotes
     on the server. Drop it and ask again (requote()). */
  if (promo.code && promo.at !== nowKey) requote();
  shopNow = shop;
  /* A code quoted in one currency is not a price in the other: switching
     the currency drops the applied quotes and asks again in the new one
     (requote() keeps the typed code). */
  if (promo.code && promo.cur && promo.cur !== orderCur()) requote();
  const usd = !!(shop && shop.currency === 'USD');
  const wrap = h('div.pl-wrap' + (compact ? '.is-compact' : ''));
  const current = st ? (onPass(st) ? 'free' : st.plan) : null;
  const eff = effectiveRows(plans);
  const listed = listedIn(eff);
  wantModes();
  const mode = planMode();
  /* A running YEARLY auto-pay: rzp-subscribe refuses a second, so on
     auto-renew nothing more is bought here until it is cancelled. A
     weekly (pass) auto-pay does not block a year: BUY stops it first
     (the click handler below asks). */
  const ap = Billing.autopayOf(st);
  const apBlocks = mode === 'renew' && !!(ap && ap.open && ap.product !== 'pass');
  if (justBought) wrap.append(successCard(justBought, plans));
  if (!matrixMod) wantMatrix();

  const row = h('div.pl-row');
  const buyable = [];
  let nextCard = null;
  for (const p of plans.filter((x) => x.id !== 'free' && (x.active || x.id === current))) {
    const isCurrent = p.id === current;
    const price = priceFor(p, period);
    const pq = mode === 'renew' ? null : appliedQuote(p.id);
    const uq = upgradeQuote(p.id);
    /* on auto-renew the amount is the plan's own (no code, no credit): the card
       prints what the subscription charges */
    /* AN UPGRADE WHILE A YEAR RUNS is paid once even on auto-renew (a
       subscription cannot carry the credit; quote_subscription says
       'upgrade'), so its card prints the credited one-time price. */
    const upgradeOnce = mode === 'renew' && !apBlocks && !!current && current !== 'free' && Billing.planRank(p.id) > Billing.planRank(current) && !!(st && st.plan_until);
    const q = pq || (mode === 'renew' && !upgradeOnce ? null : uq);
    const name = p.name || planName(p.id);
    const higher = !current || Billing.planRank(p.id) > Billing.planRank(current);
    /* §52: the plan held, bought for a year, can be renewed (a grant for
       good — no plan_until — has nothing to renew). */
    const until = isCurrent && st ? st.plan_until : null;
    const renew = isCurrent && !!until;
    /* the plan whose year has run out: buying it again is a renewal too */
    const lapsedHere = !!(st && st.lapsed && st.bought_plan === p.id);
    /* this card's own auto-pay, while it runs (it renews by itself, so
       there is nothing to buy again by hand) */
    const apHere = !!(isCurrent && ap && ap.open && ap.product === p.id);
    const canBuy = p.id !== 'free' && price !== null && (higher || renew) && !apHere && !apBlocks;
    /* A tier BELOW the one held: on a phone it collapses to its name, its
       price and "Included in your plan" and drops under the buyer's own
       (plans.css), so the first full card a buyer reads is theirs. */
    const below = !!current && current !== 'free' && !isCurrent && !higher;
    const credit = q ? qAmt(q, 'credit') : 0;
    /* What this card prints with no quote: the dollar display figure for a
       visitor shown dollars, else the row's rupees. */
    const usdRow = usd && price !== null ? shop.plans[p.id] : null;
    const listMinor = usdRow ? usdRow.minor : price;
    const listCur = usdRow ? 'USD' : 'INR';
    const recommended = p.id === RECOMMENDED && !isCurrent && !below;
    const card = h('article.pl-card' + (isCurrent ? '.is-current' : '') + (below ? '.is-below' : '') + (recommended ? '.is-recommended' : '') + (pq ? '.has-promo' : '') + (credit > 0 ? '.is-upgrade' : ''), { 'data-plan': p.id, 'data-currency': q ? qCur(q) : listCur, 'aria-label': name + (isCurrent ? ' — your plan' : '') });

    /* HEAD: what it is called and who it is for. The badge row keeps its
       height on every card so the prices line up across the row. */
    const pitch = p.blurb || (matrixMod && matrixMod.MATRIX.lines && matrixMod.MATRIX.lines[p.id]) || '';
    card.append(h('div.pl-card-head', {}, [
      h('p.pl-tag', {}, [isCurrent ? h('span.k-badge.k-badge--solid', { text: 'Your plan' }) : recommended ? h('span.k-badge.k-badge--solid.pl-rec', { text: 'Recommended' }) : null, ' '].filter(Boolean)),
      h('h3.pl-name', { text: name }),
      h('p.pl-blurb', { text: pitch })
    ]));

    /* PRICE: ONE line, "₹7,999 a year · about ₹21.92 a day" (QA r2b,
       29 Oct 2026: the currency and the term were said three or four
       times before a buyer reached a card). The currency is said once,
       beside the host's switch, and a one-time payment's terms once above
       the row (`rowTerms`). What stays on a card is what differs by card:
       - an AUTO-RENEW card keeps its full terms line, because offer-terms.js's
         rule is that a renewing price never stands without "every year ·
         cancel anytime" in the same sentence (an upgrade while a year runs
         is paid once, and says so);
       - a dollar card CHARGED in rupees keeps "Charged as ₹X at checkout",
         because hiding the amount taken until checkout is drip pricing.
       The per-day figure is derived (perDayIn), never typed. An upgrade's
       credited price is "now" and its sentence below explains it, so it
       carries no per-day figure. */
    const shown = price === null ? null : q ? qFmt(q, 'amount') : fmtMinor(listMinor, listCur);
    const dayFig = price === null || credit > 0 ? '' : q ? perDayIn(qAmt(q, 'amount'), qCur(q)) : perDayIn(listMinor, listCur);
    const ownTerms = price !== null && (upgradeOnce || mode === 'renew');
    const charged = !q && usdRow && shop.charge !== 'USD' ? chargeCaption(shop, usdRow.inrMinor != null ? usdRow.inrMinor : price) : '';
    card.append(h('div.pl-price-block', {}, [
      h('p.pl-price', { 'data-offer-mode': mode || 'unknown' }, [
        h('strong', { text: price === null ? '—' : shown }),
        price === null ? null : h('span.pl-per', { text: credit > 0 ? ' now' : ' a year' }),
        q ? h('s.pl-list', { text: qFmt(q, 'list'), 'aria-label': 'list price ' + qFmt(q, 'list') }) : null,
        dayFig ? h('span.pl-day', { text: ' · about ' + dayFig + ' a day' }) : null
      ].filter(Boolean)),
      price === null ? h('p.pl-price-cap', { text: 'Not for sale' }) : null,
      ownTerms ? h('p.pl-price-cap.pl-terms', { 'data-offer-mode': upgradeOnce ? 'once' : mode,
        /* the terms name the amount CHARGED: a dollar card charged in
           rupees says the rupees here, as the caption under it does */
        text: offerTerms(upgradeOnce ? 'once' : mode, q ? qFmt(q, 'amount') : listCur !== orderCur() && usdRow ? fmtMinor(usdRow.inrMinor != null ? usdRow.inrMinor : price, 'INR') : fmtMinor(listMinor, listCur), 'year').line }) : null,
      charged ? h('p.pl-price-cap.pl-charge', { text: charged }) : null
    ].filter(Boolean)));
    if (credit > 0) card.append(h('p.pl-upgrade', { text: `Upgrade to ${name} — ${qFmt(q, 'amount')} today: the ${qFmt(q, 'credit')} left on your ${q.upgrade_from_name || planName(q.upgrade_from)} year counts toward it, and ${name}'s own year starts now.` }));
    if (upgradeOnce) card.append(h('p.pl-upgrade.pl-upgrade-once', { text: UPGRADE_ONCE }));
    if (pq && qAmt(pq, 'discount') > 0) card.append(h('p.pl-save', { text: `${qFmt(pq, 'discount')} off with ${pq.code}` }));

    /* ACTION. A button only where there is something to buy: a higher
       tier. The current tier says so instead, and a lower one offers
       nothing — paying to have less is not a thing this page will sell.
       Neither stand-in carries data-plan-action, so nothing can buy it. */
    const act = h('div.pl-cta');
    if (preview && price !== null) {
      /* SIGNED OUT: a plan belongs to an account, so the press is the
         Google sign-in, and the plan is held for the tab so its card is
         marked on the way back (stashed in the capture listener below).
         Outline here; the recommended plan's is made the one filled
         button once the row is built. No data-plan-action: nothing buys. */
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--secondary', { type: 'button', 'data-auth-action': 'google', 'data-plan-signin': p.id, 'aria-label': 'Continue with Google to buy ' + name, text: 'Continue with Google' }));
    } else if (canBuy) {
      if (!buyable.length) nextCard = card;
      buyable.push(p.id);
      const disabled = busyPlan !== '' || confirming.id !== '' || !Billing.paymentsConfigured() || (st && st.disabled);
      const first = !current || current === 'free';
      /* On auto-renew a press starts auto-pay, so the label does not
         promise "1 YEAR" or "ADD A YEAR": the terms line above says how
         it runs. */
      const auto = mode === 'renew';
      const label = busyPlan === p.id ? 'Opening…'
        : confirming.id === p.id ? 'Payment received — confirming…'
        : failedPlan === p.id ? 'Try again'
        : renew || lapsedHere ? (auto ? 'Continue ' + name + ' — start auto-pay' : 'Renew ' + name + ' — add a year')
        : first ? (auto ? 'Buy ' + name : 'Buy ' + name + ' — 1 year') : 'Upgrade to ' + name;
      /* secondary here; the ONE filled button is chosen once the row is built */
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--secondary', {
        type: 'button', 'data-plan-action': 'buy', 'data-plan': p.id, 'data-offer-mode': mode || '', disabled, text: label }));
      if (renew) {
        const left = daysTo(until);
        act.append(h('p.pl-until' + (left <= 30 ? '.is-soon' : ''), { text: left <= 30
          ? `Ends in ${left} day${left === 1 ? '' : 's'} (${day(until)}). Renew to keep full access; the new year starts when this one ends.`
          : `Valid until ${day(until)} · a renewal adds a year after that date.` }));
      }
    } else if (apHere) {
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--secondary.pl-cta-held', { type: 'button', disabled: true, text: 'Your current plan' }));
      const when = day(ap.nextChargeAt || ap.currentEnd);
      act.append(h('p.pl-until.pl-autopay', { text: ap.live ? renewsText(when, ap.price) : cancelledText(day(ap.currentEnd)) }));
    } else if (isCurrent && p.id !== 'free') {
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--secondary.pl-cta-held', { type: 'button', disabled: true, text: 'Your current plan' }));
      act.append(h('p.pl-until', { text: 'Granted to you for good. Nothing to renew.' }));
    } else if (current && !higher) {
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--ghost.pl-cta-held', { type: 'button', disabled: true, text: 'Included in your plan' }));
    }
    if (statusText && statusPlan === p.id) act.append(h('p.pl-status', { role: 'status', text: statusText }));
    if (act.childNodes.length) card.append(act);

    /* WHAT YOU GET: the additions by stage, then the limits, then the
       count with the way to the full table. */
    const body = h('div.pl-card-body');
    { const adds = addsBlock(plans, p, listed, preview); if (adds) body.append(adds); }
    if (!preview) body.append(h('p.pl-check-stage', { text: 'Limits' }), limitList(p.limits));
    card.append(body);
    card.append(featureBlock(eff.find((x) => x && x.id === p.id) || p, listed, preview));
    row.append(card);
  }
  /* The next step up wears the slow border trail (it is a class, so it
     is there on every redraw), and the row staggers in ONCE: the settings
     page redraws this block on every billing event. */
  /* ONE filled button: the recommended plan's when it can be bought,
     else the next step up. No glow trail: the 8B mix marks it with the
     brand border and the badge (owner, 28 Oct 2026). */
  {
    const rec = row.querySelector(`.pl-card[data-plan="${RECOMMENDED}"] [data-plan-action="buy"], .pl-card[data-plan="${RECOMMENDED}"] [data-plan-signin]`);
    const lead = rec || (nextCard && nextCard.querySelector('[data-plan-action="buy"]'));
    if (lead) { lead.classList.remove('k-btn--secondary'); lead.classList.add('k-btn--primary'); lead.closest('.pl-card').classList.add('is-next'); }
  }
  if (!staggered) {
    staggered = true;
    row.setAttribute('data-reveal-group', '');
    setTimeout(() => { if (row.isConnected) reveal(row); }, 0);
  }
  /* The terms, ONCE, above the row: a one-time payment's "One payment ·
     nothing renews" (offer-terms.js short). An auto-renew card carries its
     own full line, and an unknown mode says neither. */
  if (rowTerms && mode === 'once') wrap.append(h('p.pl-row-terms', { 'data-offer-mode': mode, text: offerTerms(mode, '', 'year').short }));
  wrap.append(row);
  /* ?plan=<id> (the landing page's buttons, a lock card's deep link):
     mark that card, scroll it into view once, and — on request — open
     its buy flow once the page has signed the buyer in. */
  const want = wantedPlan();
  if (want && !pickedDone) {
    const target = row.querySelector(`.pl-card[data-plan="${CSS.escape(want)}"]`);
    if (target) {
      pickedDone = true;
      const buying = wantsBuy(location.search);   // read BEFORE the stash is spent
      clearPlanStash();
      picked = { id: want, why: wantedFor() };
      markPicked(row);
      setTimeout(() => { if (target.isConnected) target.scrollIntoView({ block: 'center', behavior: 'auto' }); }, 0);
      const btn = target.querySelector('[data-plan-action="buy"]');
      /* ?buy= is the visitor's press on the landing page: it opens the
         sheet ONCE, from the live card (the price on it was just drawn
         from the server's rows). The address and the stash are spent
         first, so a reload or Back never opens it again. Where the card
         cannot be bought, or the dollar price is shown but rupees are
         charged, ONE status line says so and nothing is charged. */
      const usdShownInr = !!(usd && shop && shop.charge !== 'USD');
      let owned = false;
      if (buying && st) {
        stripBuyFromAddress();
        /* a plan held, or a lower one, is never bought by a link (the held
           plan's own RENEW button is the buyer's to press) */
        owned = !btn || target.classList.contains('is-current') || target.classList.contains('is-below');
        if (owned) buyNote = current && current !== 'free' ? 'You already have ' + planNameOf(plans, current) + '.' : '';
        else if (usdShownInr) buyNote = 'Dollar checkout isn’t open yet; you can pay in rupees.';
        else if (btn.disabled) buyNote = (st.disabled ? 'This account cannot buy just now.' : 'Payments are not available just now.') + ' Nothing was charged.';
      }
      if (btn && st && !btn.disabled && (hooks.onSuccess || buying) && !(buying && (usdShownInr || owned))) setTimeout(() => {
        /* the row is rebuilt on every billing event, so press the LIVE button */
        const live = document.querySelector(`.pl-card[data-plan="${CSS.escape(want)}"] [data-plan-action="buy"]`);
        if (live && !live.disabled) live.click();
      }, 400);
    }
  }
  else if (picked.id) markPicked(row);
  loadUpgradeQuotes(st, buyable);
  if (buyNote) wrap.append(h('p.pl-status.pl-buy-note', { role: 'status', text: buyNote }));
  if (statusText && !row.querySelector('.pl-status')) wrap.append(h('p.pl-status', { role: 'status', text: statusText }));
  if (!preview && !Billing.paymentsConfigured()) wrap.append(h('p.pl-note', { text: 'Payments are not available yet. Please check back soon.' }));
  if (st && st.disabled) wrap.append(h('p.pl-note', { text: 'This account has been disabled by an administrator, so it cannot buy a plan.' }));
  /* The offers sit side by side under the row: the code box and the
     student band. Drawn only where there is something to buy. */
  /* Auto-pay is managed with the payment service, not in the studio
     (owner, 28 Oct 2026): no link to a Settings control here. */
  if (apBlocks) wrap.append(h('p.pl-note.pl-autopay-note', { text: 'Auto-pay is on for this account, so nothing more is bought here while it runs.' }));
  if (buyable.length && Billing.paymentsConfigured() && !(st && st.disabled)) wrap.append(h('div.pl-offers', {}, [mode === 'renew' ? null : promoBox(buyable), eduCallout()].filter(Boolean)));
  /* The fine print, together: what kind of payment, the refund terms and
     the upgrade credit (refund.html §4, schema section 21), the legal. */
  if (fine) wrap.append(h('div.pl-fine', {}, [
    h('p.pl-note', { text: fineTerms(mode) }),
    h('p.pl-note.pl-promise', { text: 'Refunded in full if you are charged twice or by mistake, if the plan is not activated on your account, or where Indian law requires it. Otherwise a year is final. Move up any time: what is left of your year counts toward the new plan.' }),
    h('p.pl-note.pl-legal', {}, [
      'By paying you agree to the ',
      h('a', { href: 'terms.html', text: 'Terms of Service' }),
      ' and the ',
      h('a', { href: 'refund.html', text: 'Refund & Cancellation Policy' }),
      '. See also our ',
      h('a', { href: 'privacy.html', text: 'Privacy Policy' }),
      '.'
    ])
  ]));
  /* Signed out the table is the matrix's own (no caps without a session, so no Limits group),
     drawn once the lazy matrix is in; the cards' links stay inside the studio frame. */
  if (!preview || matrixMod) { const cmp = compareBlock(eff, current, listed, preview); if (cmp) wrap.append(cmp); }   // append(null) prints "null"
  return wrap;
}


/* The fine print's first line: what kind of payment, in the mode's own
   words (offer-terms.js short), then what the buyer does at the year's
   end — which differs by mode, and is said only when the mode is known. */
function fineTerms(mode) {
  const cur = orderCur() === 'USD' ? 'US dollars' : 'Indian rupees';
  const t = offerTerms(mode, '', 'year');
  const head = `Each plan is a year of full access, paid in ${cur} through Razorpay`;
  if (t.mode === 'renew') return `${head}. ${t.short}: cancel with Razorpay, in your mandate e-mail or your bank / UPI app, and you keep the year already paid for.`;
  if (t.mode === 'once') return `${head}. ${t.short}: when the year is ending, buy the next from this page and it starts where the old one stops.`;
  return `${head}. The card says how each one is paid before you pay.`;
}

/* "Have a code?" — a disclosure so the row reads as prices first and an
   offer second. `buyable` is the plan ids the row has a button for; the
   quote is asked for each, because a code may apply to some and not
   others, and the box says which. */
function promoBox(buyable) {
  const det = h('details.pl-promo', { 'data-plan-promo': '', ...(promo.open ? { open: true } : {}) });
  det.append(h('summary', { text: 'Have a code?' }));
  const form = h('form.pl-promo-form', { 'data-plan-form': 'promo', autocomplete: 'off' });
  form.append(h('label.pl-promo-label', { for: 'plPromoCode', text: 'Promo code' }));
  const input = h('input#plPromoCode.pl-promo-input', { type: 'text', name: 'code', inputmode: 'text', autocapitalize: 'characters', spellcheck: 'false',
    maxlength: 40, placeholder: 'e.g. LAUNCH10', 'aria-describedby': 'plPromoHint', value: promo.typed, disabled: promo.busy || busyPlan !== '' });
  form.append(input);
  form.append(h('button.k-btn.k-btn--secondary', { type: 'submit', disabled: promo.busy || busyPlan !== '', text: promo.busy ? 'Checking…' : promo.code ? 'Re-check' : 'Apply' }));
  if (promo.code) form.append(h('button.k-btn.k-btn--ghost', { type: 'button', 'data-plan-action': 'promo-clear', disabled: promo.busy || busyPlan !== '', text: 'Remove' }));
  det.append(form);
  const applied = buyable.filter((id) => appliedQuote(id));
  if (promo.error) det.append(h('p#plPromoHint.pl-promo-msg.is-error', { role: 'alert', text: promo.error }));
  else if (promo.code && applied.length) det.append(h('p#plPromoHint.pl-promo-msg', { role: 'status',
    text: `${promo.code} applied to ${applied.map((id) => planName(id)).join(', ')}. The price above is what you will pay.` }));
  else det.append(h('p#plPromoHint.pl-promo-msg', { text: 'Spaces and case do not matter. The discount shows on the card before you pay.' }));
  return det;
}

/* EDUCATION. The student offer is a promo code like any other, so this
   band only fills the "Have a code?" box and presses its APPLY — the
   quote, the refusal sentence and the repricing all stay promoBox's.
   Drawn under the same condition as the box, because without the box
   the button has nothing to press. Deliberately not a form and not a
   pl-promo* class: prove:billing reads those as the promo box itself. */
/* The same switch as the pricing page's students band (marketing-site.json
   student.live): no code is named while it does not exist on the server. */
const EDU_LIVE = !!(SITE.student && SITE.student.live === true);
const EDU_CODE = String((SITE.student && SITE.student.code) || '');
function eduCallout() {
  const mail = SUPPORT_EMAIL
    ? h('a', { href: 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('Group access for a film school'), text: 'e-mail us' })
    : 'e-mail us';
  return h('aside.pl-edu-band', { 'aria-label': 'Education and film schools' }, [
    h('div.pl-edu-text', {}, [
      h('p.bd-eyebrow', { text: 'Education & film schools' }),
      h('p.pl-edu-lead', {}, [h('strong', { text: 'Film or Viscom student?' })]),
      EDU_LIVE
        ? h('p.pl-edu-note', {}, ['Use code ' + EDU_CODE + ' for the student price on Intermediate. Film schools, clubs and workshops: ', mail, ' for group access.'])
        : h('p.pl-edu-note', {}, ['Write to us and we will tell you what we can offer. Film schools, clubs and workshops: ', mail, ' for group access.'])
    ]),
    EDU_LIVE ? h('button.k-btn.k-btn--secondary', { type: 'button', 'data-plan-action': 'edu-apply', disabled: promo.busy || busyPlan !== '', text: 'Apply ' + EDU_CODE }) : null
  ]);
}

/* ?plan= survives the Google hop (which returns to the bare path) through a
   sessionStorage stash written when a sign-in button is pressed on a page
   that carried it (purchase-model.js owns it). sessionStorage, never
   localStorage: verify asserts no idle localStorage writes, and a plan
   choice is not worth keeping. */
/* ?for=<id>: what a lock or a toast refused (plan-gate.js offerFor()).
   Only an id the studio knows is ever printed — the LABEL is looked up
   again here, so a hand-typed ?for= cannot put words on the card. */
function wantedFor() {
  try {
    const id = new URLSearchParams(location.search).get('for') || '';
    return /^[\w-]{1,48}$/.test(id) ? PlanGate.labelFor(id) : '';
  } catch (e) { return ''; }
}
function markPicked(row) {
  const target = row.querySelector(`.pl-card[data-plan="${CSS.escape(picked.id)}"]`);
  if (!target) return;
  target.classList.add('is-picked');
  if (picked.why && !target.querySelector('.pl-why')) {
    const after = target.querySelector('.pl-name');
    const why = h('p.pl-why', { text: 'Opens ' + picked.why + ', the part of the studio you just tried.' });
    if (after) after.after(why); else target.prepend(why);
  }
}

/* COMPARE EVERY FEATURE, side by side. The cards each list what they
   ADD, which answers "what is new here" and not "which one has X"; this
   is the table for that question. From the plans ROWS (featureSummary,
   so console edits show), one column per paid plan on sale, the limits
   first and then every SOLD module grouped by stage. Open on a desk;
   on a phone it starts closed, so the cards stay the decision and the
   table is the check. Whether it is open is kept here for the page (the
   block is rebuilt on every billing event) and in no storage. */
let compareOpen = null;
function compareBlock(plans, current, listed, noLimits = false) {
  const cols = (plans || []).filter((p) => p && p.id !== 'free' && (p.active !== false || p.id === current))
    .sort((a, b) => Billing.planRank(a.id) - Billing.planRank(b.id));
  if (cols.length < 2) return null;
  if (compareOpen === null) {
    try { compareOpen = !window.matchMedia('(max-width: 720px)').matches; } catch (e) { compareOpen = true; }
  }
  const sums = cols.map((p) => featureSummary(p, listed));
  const det = h('details#plCompare.pl-compare', { 'data-plan-compare': '', ...(compareOpen ? { open: true } : {}) });
  det.append(h('summary', {}, [
    h('span.pl-compare-h', { text: 'Compare every feature' }),
    h('span.pl-compare-n', { text: `${sums[sums.length - 1].total} features across ${sums[0].stages.length} stages` })
  ]));
  const table = h('table.pl-compare-table');
  table.append(h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Feature' }),
    ...cols.map((p) => h('th' + (p.id === current ? '.is-current' : ''), { scope: 'col' }, [
      h('span.pl-compare-plan', { text: p.name || planName(p.id) }),
      p.id === current ? h('span.pl-compare-mine', { text: 'Your plan' }) : null
    ].filter(Boolean)))])]));
  const body = h('tbody');
  const span = String(cols.length + 1);
  const group = (label) => body.append(h('tr.pl-compare-stage', {}, [h('th', { scope: 'rowgroup', colspan: span, text: label })]));
  const mark = (on, cls = '') => h('td' + (on ? '.is-on' : '.is-off') + cls, {}, [
    h('span', { 'aria-hidden': 'true', text: on ? '✓' : '—' }),
    h('span.visually-hidden', { text: on ? 'Included' : 'Not included' })]);
  const curCls = (i) => (cols[i].id === current ? '.is-current' : '');

  if (!noLimits) {
    group('Limits');
    for (const [key, label] of LIMIT_ROWS) {
      body.append(h('tr', {}, [h('th', { scope: 'row', text: label }),
        ...cols.map((p, i) => { const n = cap(p.limits, key); return h('td.pl-compare-num' + curCls(i), { text: n === null ? 'Unlimited' : String(n) }); })]));
    }
    body.append(h('tr', {}, [h('th', { scope: 'row', text: 'Chrome extension' }),
      ...cols.map((p, i) => mark(!!(p.limits && p.limits.extension), curCls(i)))]));
  }
  sums[0].stages.forEach((stage, si) => {
    group(stage.label);
    stage.items.forEach((item, ii) => body.append(h('tr', {}, [h('th', { scope: 'row', text: item.label }),
      ...sums.map((s, i) => mark(s.stages[si] && s.stages[si].items[ii] && s.stages[si].items[ii].on, curCls(i)))])));
  });
  group('Tools');
  sums[0].caps.forEach((c, ci) => body.append(h('tr', {}, [h('th', { scope: 'row', text: c.label }),
    ...sums.map((s, i) => mark(s.caps[ci] && s.caps[ci].on, curCls(i)))])));
  table.append(body);
  det.append(h('div.pl-compare-wrap', { role: 'region', 'aria-label': 'Plan comparison', tabindex: '0' }, [table]));
  return det;
}
delegate(document, 'toggle', '[data-plan-compare]', (e, el) => { compareOpen = el.open; }, true);
/* "Compare every feature" on a card: open the table before the jump. */
delegate(document, 'click', '[data-plan-action="compare"]', () => {
  compareOpen = true;
  const det = document.getElementById('plCompare');
  if (det) det.open = true;
});


const wantedPlan = () => wantedPlanFrom(location.search);
document.addEventListener('click', (e) => {
  const g = e.target.closest && e.target.closest('[data-auth-action="google"]');
  if (!g) return;
  /* a signed-out card's own button holds ITS plan; any other sign-in, ?plan= */
  const id = g.dataset.planSignin;
  /* a card pressed on a ?buy=<same id> address stays a buy */
  stashPlanFromAddress(id && /^[\w-]{1,32}$/.test(id) && buyParam(location.search) !== id ? '?plan=' + encodeURIComponent(id) : location.search);
}, true);

/* PURCHASE SUCCESS. What unlocked is read from the same matrix the
   pricing table uses (src/lib/plan-matrix.js addedBy()): what this plan
   has that the paid plan before it did not. The invoice lives on purchase.html (invoice-panels). */
function unlockedBy(M, planId) {
  return M.addedBy(planId).map(M.labelOf).slice(0, 8);
}
function successCard(planId, plans) {
  const p = (plans || []).find((x) => x.id === planId);
  const name = (p && p.name) || planName(planId);
  const card = h('section.pl-success', { role: 'status', 'aria-live': 'polite' });
  card.append(h('p.bd-eyebrow', { text: 'Payment received' }), h('h3.pl-success-h', { text: `You’re on ${name}.` }));
  /* plan-matrix.js is a lazy chunk (invite's first paint is budgeted),
     so the unlock list fills in when it arrives. */
  const slot = h('div.pl-unlocked');
  card.append(slot);
  import('../lib/plan-matrix.js').then((m) => {
    const items = unlockedBy(m, planId);
    if (items.length) slot.append(h('p.pl-note', { text: 'Just unlocked:' }), h('ul.pl-what-list', {}, items.map((t) => h('li', { text: t }))));
  }).catch(() => { /* the card still says what plan you are on */ });
  
  card.append(h('p.pl-note', {}, [
    /* The receipt is the studio's own (an edge function, _shared/mail.js),
       not Razorpay's. */
    'Your receipt and invoice are on their way by e-mail, and ',
    h('a', { href: 'purchase.html#invoices', text: 'listed under Invoices on the Purchase page' }), '.'
  ]));
  card.append(h('div.iv-actions', {}, [h('a.k-btn.k-btn--primary', { href: 'index.html?welcome=plan', text: 'Start your film' })]));
  return card;
}

/** Where a usage figure stands against its cap: 'full' (a warning),
 *  'seats' (every seat taken, said neutrally) or null. Seats are not a
 *  warning: Basic's one seat is the buyer's own, so it is taken on day
 *  one with nothing wrong. Films, links and readers still warn. */
export function capState(key, used, c) {
  if (c === null || used < c) return null;
  return key === 'seats' ? 'seats' : 'full';
}
const seatsNote = (c) => (c === 1 ? 'Your own seat' : 'Every seat in use');

/** Usage against the current plan, for the settings page. */
export function usageList(st) {
  if (!st) return null;
  const u = st.usage || {};
  const lim = st.limits || {};
  const ul = h('ul.pl-usage');
  const line = (label, used, key) => {
    const c = cap(lim, key);
    const at = capState(key, used, c);
    const full = at === 'full';
    ul.append(h('li' + (full ? '.is-full' : ''), { text: `${label}: ${used}${c === null ? '' : ' of ' + c}${full ? ' — at the limit' : at ? ' — ' + seatsNote(c).toLowerCase() : ''}` }));
  };
  line('Cloud projects', u.projects || 0, 'projects');
  line('Live share links', u.shares || 0, 'shares');
  line('Most collaborators on one film', u.collaborators || 0, 'collaborators');
  line('Organisation seats used', u.seats || 0, 'seats');
  return ul;
}

/** The same usage as tiles with a meter each, for the purchase page's
 *  current-plan strip. A cap that is null is unlimited: the tile prints
 *  what is used and says so, with no bar to fill. */
export function usageTiles(st) {
  if (!st) return null;
  const u = st.usage || {};
  const lim = st.limits || {};
  const tile = (label, used, key) => {
    const c = cap(lim, key);
    const at = capState(key, used, c);
    const full = at === 'full';
    const el = h('div.pl-use' + (full ? '.is-full' : ''), { 'data-usage': key });
    el.append(h('p.pl-use-label', { text: label }));
    el.append(h('p.pl-use-fig', {}, [h('strong', { text: String(used) }), h('span', { text: c === null ? ' · unlimited' : ' of ' + c })]));
    if (c !== null) {
      const m = meter({ value: used, max: Math.max(c, 1), show: false, tone: full ? 'warn' : null });
      const track = m.querySelector('.k-meter-track');
      if (track) track.setAttribute('aria-label', label + ' used');
      el.append(m);
    }
    if (full) el.append(h('p.pl-use-note', { text: 'At the limit' }));
    else if (at) el.append(h('p.pl-use-note', { text: seatsNote(c) }));
    return el;
  };
  return h('div.pl-usage-tiles', { role: 'group', 'aria-label': 'Your usage' }, [
    tile('Cloud projects', u.projects || 0, 'projects'),
    tile('Live share links', u.shares || 0, 'shares'),
    tile('Most collaborators on a film', u.collaborators || 0, 'collaborators'),
    tile('Organisation seats', u.seats || 0, 'seats')
  ]);
}

delegate(document, 'click', '[data-plan-action="buy"]', async (e, el) => {
  if (!hooks.onBuy || busyPlan) return;
  const planId = el.dataset.plan, shownMode = el.dataset.offerMode || null;
  /* A LIVE WEEKLY AUTO-PAY STOPS FIRST. Its next charge would land on an
     account that now holds a year and be applied to nothing, so a year
     is never bought while one runs: ask, cancel it (rzp-cancel, at the
     period's end), then buy. Read fresh, not from the drawn billing. */
  let passStopped = false;
  {
    let st = lastSt;
    try { st = await Billing.status(); } catch (x) { /* the drawn billing */ }
    const ap = Billing.autopayOf(st);
    if (ap && ap.live && ap.product === 'pass') {
      const yes = await ask({ title: 'Stop the weekly auto-pay?', body: 'Buying a yearly plan stops your weekly auto-pay. Continue?', confirm: 'Stop it and continue', cancel: 'Not now' });
      if (!yes) return;
      busyPlan = planId; statusPlan = planId; statusText = 'Stopping the weekly auto-pay…';
      if (hooks.rerender) hooks.rerender();
      try { await Billing.cancelAutopay(); passStopped = true; }
      catch (err) {
        busyPlan = ''; statusText = (err && err.message) || 'The weekly auto-pay could not be stopped, so nothing was bought.';
        if (hooks.rerender) hooks.rerender();
        return;
      }
    }
  }
  busyPlan = planId; statusText = ''; statusPlan = planId; failedPlan = ''; buyNote = '';
  if (hooks.rerender) hooks.rerender();
  try {
    const q = appliedQuote(planId);
    /* The ORDER currency: the quote's, when a code is applied (it was
       asked in the order currency), else what the cards say is charged. */
    await hooks.onBuy(planId, period, (t) => { statusText = t; if (hooks.rerender) hooks.rerender(); }, q ? q.code : null, q ? qCur(q) : orderCur(), shownMode, passStopped);
    statusText = '';
    justBought = planId;
    /* The quotes were taken before this purchase; see planCards(). */
    requote();
    if (hooks.onSuccess) { try { hooks.onSuccess(justBought); } catch (e) { /* redirect is a convenience */ } }
  } catch (err) {
    statusText = err && err.message ? err.message : 'The payment did not complete.';
    failedPlan = planId;   // the card stays; its button offers Try again, nothing reopens by itself
    if (err && err.afterPayment && err.unconfirmed) confirming = { id: planId, at: billingKey(lastSt) };
  } finally {
    busyPlan = '';
    if (hooks.rerender) hooks.rerender();
    refocus(`.pl-card [data-plan-action="buy"][data-plan="${planId}"]`);
  }
});

/* The box's own state: a details element is rebuilt on every rerender,
   so whether it is open is remembered here rather than read back. */
delegate(document, 'toggle', '[data-plan-promo]', (e, el) => { promo.open = el.open; }, true);

delegate(document, 'submit', '[data-plan-form="promo"]', async (e, form) => {
  e.preventDefault();
  if (promo.busy || busyPlan) return;
  const typed = String(new FormData(form).get('code') || '');
  const code = normalisePromo(typed);
  promo.typed = typed; promo.error = ''; promo.quotes = {}; promo.code = ''; promo.open = true; promo.cur = orderCur();
  if (!code) { if (hooks.rerender) hooks.rerender(); refocus('#plPromoCode'); return; }
  promo.busy = true;
  if (hooks.rerender) hooks.rerender();
  try {
    const ids = [...document.querySelectorAll('.pl-card [data-plan-action="buy"]')].map((b) => b.dataset.plan);
    const answers = await Promise.all(ids.map((id) => Billing.quote(id, code, promo.cur).then((q) => [id, q], (err) => [id, { ok: false, reason: 'error', sentence: errorSentence(err, 'The code could not be checked.') }])));
    const quotes = Object.fromEntries(answers);
    const okIds = ids.filter((id) => quotes[id] && quotes[id].ok && quotes[id].code);
    if (okIds.length) { promo.quotes = quotes; promo.code = code; promo.at = billingKey(lastSt); }
    else {
      /* Every plan refused it. Prefer the reason that is about the CODE
         over "not for this plan", which only says which card. */
      const refusals = ids.map((id) => quotes[id]).filter(Boolean);
      const pick = refusals.find((q) => q.reason !== 'not_for_plan') || refusals[0];
      promo.error = pick && pick.sentence ? pick.sentence : 'That code cannot be used.';
    }
  } finally {
    promo.busy = false;
    if (hooks.rerender) hooks.rerender();
    refocus('#plPromoCode');
  }
});

/* APPLY <student code>: through the promo box's own form, as purchase.js's
   applyLinkCode() does, deferred so the submit's redraw is not inside
   this click. A box that is missing or disabled (a buy or a check in
   flight) is left alone. */
delegate(document, 'click', '[data-plan-action="edu-apply"]', () => {
  const input = document.getElementById('plPromoCode');
  const form = input && input.closest('form');
  if (!input || !form || input.disabled || promo.busy || busyPlan) return;
  if (!EDU_LIVE) return;
  promo.typed = EDU_CODE; promo.open = true;
  const det = input.closest('details');
  if (det) det.open = true;
  input.value = EDU_CODE;
  setTimeout(() => {
    if (!form.isConnected) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, 0);
});

delegate(document, 'click', '[data-plan-action="promo-clear"]', () => {
  promo.typed = ''; promo.code = ''; promo.quotes = {}; promo.error = ''; promo.open = true;
  if (hooks.rerender) hooks.rerender();
});

export default { planCards, usageList, usageTiles };
