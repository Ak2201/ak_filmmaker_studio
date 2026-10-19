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

   FULL-TIME ACCESS (schema section 18). A plan is bought once and kept
   for good, so there is no period switch, no "until", no renew and no
   extend: the current tier's card simply says so, and only HIGHER
   tiers offer a button. The period the host receives is always
   'lifetime'.

   PROMO CODES (schema section 20). "Have a code?" under the row: APPLY
   asks quote_order() for every plan the row can sell, and a card whose
   quote came back ok reprices itself — the discounted figure large,
   the list price struck beside it. A refused code prints the server's
   sentence. The code then rides on BUY; the server re-quotes it when
   it makes the order, and the client sends no price, ever. The code
   lives in this module's memory for the page and in no storage.

   No inline handlers (CSP). Everything is delegate() on
   [data-plan-action]; the host page passes `onBuy(planId, period,
   onStatus, code)`.
   ============================================================ */
import { reveal } from '../lib/motion.js';
import '../styles/motion.css';
import { h, delegate } from '../lib/dom.js';
import Billing, { fmtPaise, priceFor, cap, planName, normalisePromo } from '../lib/billing.js';
import PlanGate, { CAPABILITIES, OFF_BY_DEFAULT } from '../lib/plan-gate.js';
import { wantedPlan as wantedPlanFrom, clearPlanStash, stashPlanFromAddress } from '../lib/purchase-model.js';
import { SUPPORT_EMAIL } from '../lib/brand.js';
import { meter } from './kit/meter.js';
import '../styles/plans.css';
import '../styles/growth.css';

const period = 'lifetime';     // the only period there is
let busyPlan = '';
let statusText = '';
let hooks = { onBuy: null, rerender: null, onSuccess: null };
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
const promo = { typed: '', code: '', quotes: {}, error: '', busy: false, open: false };
const appliedQuote = (planId) => { const q = promo.quotes[planId]; return q && q.ok && q.code ? q : null; };

/* UPGRADE BY PAYING THE DIFFERENCE (schema section 21). For somebody who
   has already paid, the server prices a higher tier as its list price
   less what they paid; the cards ask quote_order() for each buyable
   tier once per (plan held, payments) state and print the answer. The
   arithmetic is the server's — this only shows it. A promo quote
   already includes the credit, so it wins when both exist. */
const upg = { key: '', quotes: {}, busy: false };
const upgradeQuote = (planId) => { const q = upg.quotes[planId]; return q && q.ok && q.credit_paise > 0 ? q : null; };
function loadUpgradeQuotes(st, ids) {
  const paid = ((st && st.payments) || []).filter((p) => p.status === 'paid').length;
  if (!st || st.plan === 'free' || !paid || !ids.length) { upg.key = ''; upg.quotes = {}; return; }
  const key = `${st.plan}:${paid}:${ids.join(',')}`;
  if (upg.key === key || upg.busy) return;
  upg.busy = true; upg.key = key;
  Promise.all(ids.map((id) => Billing.quote(id, null).then((q) => [id, q], () => [id, null])))
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
function featureBlock(p, listed) {
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
function addsBlock(plans, p, listed) {
  const a = addedIds(plans, p);
  if (!a) return null;
  const s = featureSummary(p, listed);
  const groups = s.stages.map((st) => ({ label: st.label, labels: st.items.filter((x) => a.ids.has(x.id)).map((x) => x.label) }));
  const extras = s.caps.filter((c) => a.ids.has(c.id)).map((c) => c.label);
  groups.push({ label: 'Tools', labels: extras });
  const shown = groups.filter((g) => g.labels.length);
  if (!shown.length) return null;
  const box = h('div.pl-adds', { 'data-plan-adds': p.id });
  box.append(h('p.pl-adds-lead', { text: a.prev ? 'Everything in ' + (a.prev.name || planName(a.prev.id)) + ', plus:' : 'Includes:' }));
  for (const g of shown) box.append(h('p.pl-check-stage', { text: g.label }), checklist(g.labels));
  return box;
}

/* The caps, as the card's last group. What the plan INCLUDES (Drive,
   AI, the stages) is the checklist above and the table below, so it is
   not said a third time here. */
function limitList(limits) {
  const ul = h('ul.pl-limits');
  for (const [key, text] of LIMIT_LINES) ul.append(h('li', { text: text(cap(limits, key)) }));
  ul.append(h('li' + (limits && limits.extension ? '' : '.is-off'), { text: limits && limits.extension ? 'Chrome extension included' : 'Chrome extension not included' }));
  return ul;
}

let staggered = false;

/** `st` is billing_status() or null (signed out / unknown). */
export function planCards(plans, st, { onBuy, onSuccess, rerender, compact = false } = {}) {
  hooks = { onBuy: onBuy || hooks.onBuy, rerender: rerender || hooks.rerender, onSuccess: onSuccess || hooks.onSuccess };
  const wrap = h('div.pl-wrap' + (compact ? '.is-compact' : ''));
  const current = st ? st.plan : null;
  const listed = listedIn(plans);
  if (justBought) wrap.append(successCard(justBought, plans));
  if (!matrixMod) wantMatrix();

  const row = h('div.pl-row');
  const buyable = [];
  let nextCard = null;
  for (const p of plans.filter((x) => x.id !== 'free' && (x.active || x.id === current))) {
    const isCurrent = p.id === current;
    const price = priceFor(p, period);
    const pq = appliedQuote(p.id);
    const uq = upgradeQuote(p.id);
    const q = pq || uq;
    const name = p.name || planName(p.id);
    const higher = !current || Billing.planRank(p.id) > Billing.planRank(current);
    const canBuy = p.id !== 'free' && price !== null && higher;
    const card = h('article.pl-card' + (isCurrent ? '.is-current' : '') + (pq ? '.has-promo' : '') + (q && q.credit_paise > 0 ? '.is-upgrade' : ''), { 'data-plan': p.id, 'aria-label': name + (isCurrent ? ' — your plan' : '') });

    /* HEAD: what it is called and who it is for. The badge row keeps its
       height on every card so the prices line up across the row. */
    const pitch = p.blurb || (matrixMod && matrixMod.MATRIX.lines && matrixMod.MATRIX.lines[p.id]) || '';
    card.append(h('div.pl-card-head', {}, [
      h('p.bd-eyebrow.pl-tag', {}, [isCurrent ? h('span.k-badge.k-badge--solid', { text: 'Your plan' }) : null, ' '].filter(Boolean)),
      h('h3.pl-name', { text: name }),
      h('p.pl-blurb', { text: pitch })
    ]));

    /* PRICE: the figure on one line, what kind of payment it is under it. */
    card.append(h('div.pl-price-block', {}, [
      h('p.pl-price', {}, [
        h('strong', { text: p.id === 'free' ? '₹0' : price === null ? '—' : fmtPaise(q ? q.amount_paise : price) }),
        q ? h('s.pl-list', { text: fmtPaise(q.list_paise), 'aria-label': 'list price ' + fmtPaise(q.list_paise) }) : null
      ].filter(Boolean)),
      h('p.pl-price-cap', { text: price === null ? 'Not for sale' : 'One-time payment · yours for good' })
    ]));
    if (q && q.credit_paise > 0) card.append(h('p.pl-upgrade', { text: `Upgrade to ${name} — ${fmtPaise(q.amount_paise)} (you paid ${fmtPaise(q.paid_paise || q.credit_paise)} for ${q.upgrade_from_name || planName(q.upgrade_from)})` }));
    if (pq && pq.discount_paise > 0) card.append(h('p.pl-save', { text: `${fmtPaise(pq.discount_paise)} off with ${pq.code}` }));

    /* ACTION. A button only where there is something to buy: a higher
       tier. The current tier says so instead, and a lower one offers
       nothing — paying to have less is not a thing this page will sell.
       Neither stand-in carries data-plan-action, so nothing can buy it. */
    const act = h('div.pl-cta');
    if (canBuy) {
      if (!buyable.length) nextCard = card;
      buyable.push(p.id);
      const disabled = busyPlan !== '' || !Billing.paymentsConfigured() || (st && st.disabled);
      const first = !current || current === 'free';
      const label = busyPlan === p.id ? 'OPENING…' : first ? 'BUY ' + name.toUpperCase() : 'UPGRADE TO ' + name.toUpperCase();
      act.append(h('button.k-btn.k-btn--lg.k-btn--block' + (buyable.length === 1 ? '.k-btn--primary' : '.k-btn--secondary'), {
        type: 'button', 'data-plan-action': 'buy', 'data-plan': p.id, disabled, text: label }));
    } else if (isCurrent && p.id !== 'free') {
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--secondary.pl-cta-held', { type: 'button', disabled: true, text: 'YOUR CURRENT PLAN' }));
      act.append(h('p.pl-until', { text: 'Yours, for good. Nothing to renew.' }));
    } else if (current && !higher) {
      act.append(h('button.k-btn.k-btn--lg.k-btn--block.k-btn--ghost.pl-cta-held', { type: 'button', disabled: true, text: 'INCLUDED IN YOUR PLAN' }));
    }
    if (act.childNodes.length) card.append(act);

    /* WHAT YOU GET: the additions by stage, then the limits, then the
       count with the way to the full table. */
    const body = h('div.pl-card-body');
    { const adds = addsBlock(plans, p, listed); if (adds) body.append(adds); }
    body.append(h('p.pl-check-stage', { text: 'Limits' }), limitList(p.limits));
    card.append(body);
    card.append(featureBlock(p, listed));
    row.append(card);
  }
  /* The next step up wears the slow border trail (it is a class, so it
     is there on every redraw), and the row staggers in ONCE: the settings
     page redraws this block on every billing event. */
  if (nextCard) nextCard.classList.add('mo-trail', 'is-next');
  if (!staggered) {
    staggered = true;
    row.setAttribute('data-reveal-group', '');
    setTimeout(() => { if (row.isConnected) reveal(row); }, 0);
  }
  wrap.append(row);
  /* ?plan=<id> (the landing page's buttons, a lock card's deep link):
     mark that card, scroll it into view once, and — on request — open
     its buy flow once the page has signed the buyer in. */
  const want = wantedPlan();
  if (want && !pickedDone) {
    const target = row.querySelector(`.pl-card[data-plan="${CSS.escape(want)}"]`);
    if (target) {
      pickedDone = true;
      clearPlanStash();
      picked = { id: want, why: wantedFor() };
      markPicked(row);
      setTimeout(() => { if (target.isConnected) target.scrollIntoView({ block: 'center', behavior: 'auto' }); }, 0);
      const btn = target.querySelector('[data-plan-action="buy"]');
      if (btn && st && !btn.disabled && hooks.onSuccess) setTimeout(() => { if (btn.isConnected) btn.click(); }, 400);
    }
  }
  else if (picked.id) markPicked(row);
  loadUpgradeQuotes(st, buyable);
  if (statusText) wrap.append(h('p.pl-status', { role: 'status', text: statusText }));
  if (!Billing.paymentsConfigured()) wrap.append(h('p.pl-note', { text: 'Payments are not available yet. Please check back soon.' }));
  if (st && st.disabled) wrap.append(h('p.pl-note', { text: 'This account has been disabled by an administrator, so it cannot buy a plan.' }));
  /* The offers sit side by side under the row: the code box and the
     student band. Drawn only where there is something to buy. */
  if (buyable.length && Billing.paymentsConfigured() && !(st && st.disabled)) wrap.append(h('div.pl-offers', {}, [promoBox(buyable), eduCallout()]));
  /* The fine print, together: what kind of payment, the refund terms and
     the upgrade credit (refund.html §4, schema section 21), the legal. */
  wrap.append(h('div.pl-fine', {}, [
    h('p.pl-note', { text: 'One payment, full access for good — nothing recurs and nothing expires. Paid through Razorpay in INR; an invoice arrives from Razorpay by e-mail.' }),
    h('p.pl-note.pl-promise', { text: 'Refunded in full if you are charged twice or by mistake, or if the plan is not activated on your account. Otherwise a plan is final — which is why the trial comes first. Move up later and pay only the difference.' }),
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
  { const cmp = compareBlock(plans, current, listed); if (cmp) wrap.append(cmp); }   // append(null) prints "null"
  return wrap;
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
  form.append(h('button.btn', { type: 'submit', disabled: promo.busy || busyPlan !== '', text: promo.busy ? 'CHECKING…' : promo.code ? 'RE-CHECK' : 'APPLY' }));
  if (promo.code) form.append(h('button.btn', { type: 'button', 'data-plan-action': 'promo-clear', disabled: promo.busy || busyPlan !== '', text: 'REMOVE' }));
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
function eduCallout() {
  const mail = SUPPORT_EMAIL
    ? h('a', { href: 'mailto:' + SUPPORT_EMAIL + '?subject=' + encodeURIComponent('Group access for a film school'), text: 'e-mail us' })
    : 'e-mail us';
  return h('aside.pl-edu-band', { 'aria-label': 'Education and film schools' }, [
    h('div.pl-edu-text', {}, [
      h('p.bd-eyebrow', { text: 'Education & film schools' }),
      h('p.pl-edu-lead', {}, [h('strong', { text: 'Film or Viscom student?' })]),
      h('p.pl-edu-note', {}, ['Use code STUDENT50 for the student price on Intermediate. Film schools, clubs and workshops: ', mail, ' for group access.'])
    ]),
    h('button.btn', { type: 'button', 'data-plan-action': 'edu-apply', disabled: promo.busy || busyPlan !== '', text: 'APPLY STUDENT50' })
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
function compareBlock(plans, current, listed) {
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

  group('Limits');
  for (const [key, label] of LIMIT_ROWS) {
    body.append(h('tr', {}, [h('th', { scope: 'row', text: label }),
      ...cols.map((p, i) => { const n = cap(p.limits, key); return h('td.pl-compare-num' + curCls(i), { text: n === null ? 'Unlimited' : String(n) }); })]));
  }
  body.append(h('tr', {}, [h('th', { scope: 'row', text: 'Chrome extension' }),
    ...cols.map((p, i) => mark(!!(p.limits && p.limits.extension), curCls(i)))]));
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
  if (!(e.target.closest && e.target.closest('[data-auth-action="google"]'))) return;
  stashPlanFromAddress(location.search);
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
    'Your invoice is on its way from Razorpay by e-mail, and ',
    h('a', { href: 'purchase.html#invoices', text: 'listed under Invoices on the Purchase page' }), '.'
  ]));
  card.append(h('div.iv-actions', {}, [h('a.btn.primary', { href: 'index.html?welcome=plan', text: 'START YOUR FILM' })]));
  return card;
}

/** Usage against the current plan, for the settings page. */
export function usageList(st) {
  if (!st) return null;
  const u = st.usage || {};
  const lim = st.limits || {};
  const ul = h('ul.pl-usage');
  const line = (label, used, key) => {
    const c = cap(lim, key);
    const full = c !== null && used >= c;
    ul.append(h('li' + (full ? '.is-full' : ''), { text: `${label}: ${used}${c === null ? '' : ' of ' + c}${full ? ' — at the limit' : ''}` }));
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
    const full = c !== null && used >= c;
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
  busyPlan = el.dataset.plan; statusText = '';
  if (hooks.rerender) hooks.rerender();
  try {
    const q = appliedQuote(el.dataset.plan);
    await hooks.onBuy(el.dataset.plan, period, (t) => { statusText = t; if (hooks.rerender) hooks.rerender(); }, q ? q.code : null);
    statusText = '';
    justBought = el.dataset.plan;
    if (hooks.onSuccess) { try { hooks.onSuccess(justBought); } catch (e) { /* redirect is a convenience */ } }
  } catch (err) {
    statusText = err && err.message ? err.message : 'The payment did not complete.';
  } finally {
    busyPlan = '';
    if (hooks.rerender) hooks.rerender();
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
  promo.typed = typed; promo.error = ''; promo.quotes = {}; promo.code = ''; promo.open = true;
  if (!code) { if (hooks.rerender) hooks.rerender(); return; }
  promo.busy = true;
  if (hooks.rerender) hooks.rerender();
  try {
    const ids = [...document.querySelectorAll('.pl-card [data-plan-action="buy"]')].map((b) => b.dataset.plan);
    const answers = await Promise.all(ids.map((id) => Billing.quote(id, code).then((q) => [id, q], (err) => [id, { ok: false, reason: 'error', sentence: err.message || 'The code could not be checked.' }])));
    const quotes = Object.fromEntries(answers);
    const okIds = ids.filter((id) => quotes[id] && quotes[id].ok && quotes[id].code);
    if (okIds.length) { promo.quotes = quotes; promo.code = code; }
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
  }
});

/* APPLY STUDENT50: through the promo box's own form, as purchase.js's
   applyLinkCode() does, deferred so the submit's redraw is not inside
   this click. A box that is missing or disabled (a buy or a check in
   flight) is left alone. */
delegate(document, 'click', '[data-plan-action="edu-apply"]', () => {
  const input = document.getElementById('plPromoCode');
  const form = input && input.closest('form');
  if (!input || !form || input.disabled || promo.busy || busyPlan) return;
  promo.typed = 'STUDENT50'; promo.open = true;
  const det = input.closest('details');
  if (det) det.open = true;
  input.value = 'STUDENT50';
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
