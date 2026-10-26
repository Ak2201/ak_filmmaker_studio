/* ============================================================
   PURCHASE — the plans, the checkout, your invoices, a refund request
   ------------------------------------------------------------
   Its own page, not a tab of Settings: every "see plans" link in the
   app (the upgrade panel, the trial band, the account menu, the
   billing toasts) lands here. Nothing is new underneath — the same
   plan cards (src/ui/plan-cards.js), the same Billing.buy(), the same
   invoice list and refund request Settings used to carry. What a plan
   is, and what was paid, is read from the server every time and kept
   in no storage here.

   SIGNED OUT there is no account to put a plan on, so the page says
   so and offers the sign-in; it fetches nothing from the cloud (the
   Supabase chunk stays out of a signed-out first paint).

   ENTITLEMENT FAILS OPEN and this page does not change that: it is
   where a plan is bought, so it is never walled.

   THE CURRENCY (docs/US-MARKET-PLAN.md §B). India sees rupees, everybody
   else the owner's dollar figures, read from price_notice('USD') with a
   plain fetch (funnel.js) so a signed-out visitor still fetches no SDK.
   Which one: the buyer's own pick (the "Show prices in" switch, kept as
   `payCurrency` inside fms_studio_prefs_v1 — no new key — and written
   only on a press), then the device's chosen market (Settings → Region),
   then the guess from the browser's time zone. The switch never touches
   fms_region_v1: choosing a currency must not hide the CBFC tab. What is
   CHARGED is the server's to say (usd_checkout), and the page says it.
   ============================================================ */
import Store from '../lib/store.js';   /* FIRST — invariant 6. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/gate.css';
import '../styles/purchase.css';
import '../lib/cloud.js';              /* sets window.StudioCloud */

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, commitMain, delegate } from '../lib/dom.js';
import { pageHeader } from '../ui/kit/page-header.js';
import Billing from '../lib/billing.js';
import { planCards, usageTiles } from '../ui/plan-cards.js';
import { listPriceBlock } from '../ui/list-prices.js';
import { memberGrowthPanels, refreshGrowthPanels } from '../ui/growth-panels.js';
import { refundRequestPanel, refreshRefundRequest } from '../ui/refund-request.js';
import { memberInvoicePanel, refreshInvoices } from '../ui/invoice-panels.js';
import { planExtras } from '../ui/footer.js';
import PlanGate from '../lib/plan-gate.js';
import { SUPPORT_EMAIL } from '../lib/brand.js';
import { priceNotice as publicPriceNotice } from '../lib/funnel.js';
import { pricingCurrency, readPayCurrency, writePayCurrency, guessVisitorRegion, chosenRegion } from '../lib/region.js';
import { shopView, rupeeView, orderCurrency, currencySentence, CURRENCY_OPTIONS, fromDay } from '../lib/price-model.js';
import { segmented } from '../ui/kit/segmented.js';
import {
  visitCode, EMPTY_BILLING, loadBilling, purchasesOff, FREE_LINE, deckFor, planHeading, plansPendingHeading, lapsedLine, trialStatus
} from '../lib/purchase-model.js';
import { clearAttribRef } from '../lib/attribution.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;

/* A referral link (growth-panels.js referralLink) opens this page as
   /purchase?ref=REF-XXXXXX, and any public page's ?ref= (an ad, an
   affiliate's link) is held for the TAB by attribution.js — sessionStorage,
   no localStorage key — so the code survives the Google round trip and a
   reload, and is put in the "Have a code?" box once signed in. `code` is
   accepted in this page's own address too, for a link typed by hand. Same
   shape the server accepts. The visitor can clear the box, and clearing
   it forgets the held code (below), so it does not come back. */
const LINK_CODE = visitCode(location);
let linkCodeApplied = false;

/* Put the linked code in the "Have a code?" box and press APPLY — through
   the box's own form, so the quote, the sentence a refused code gets and the
   self-referral refusal are all plan-cards.js's, not copied here. Once per
   visit, and deferred: the form's submit handler redraws this page, and doing
   that from inside a render is a recursion. */
function applyLinkCode() {
  if (!LINK_CODE || linkCodeApplied) return;
  const input = document.getElementById('plPromoCode');
  const form = input && input.closest('form');
  if (!input || !form || input.disabled) return;
  linkCodeApplied = true;
  const det = input.closest('details');
  if (det) det.open = true;
  input.value = LINK_CODE;
  setTimeout(() => {
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  }, 0);
}

let billing = { plans: null, st: null, error: '', missing: false, loading: false };

/* ---- the currency ---------------------------------------------------- */
const wantCurrency = () => pricingCurrency({ override: readPayCurrency(), chosen: chosenRegion(), guess: guessVisitorRegion() });
const shop = { want: wantCurrency(), view: null, loading: false, seq: 0 };
async function refreshShop() {
  const seq = ++shop.seq;
  if (shop.want !== 'USD') { shop.view = rupeeView('INR'); shop.loading = false; render(); return; }
  shop.loading = true;
  render();
  let notice = null;
  try { notice = await publicPriceNotice('USD'); } catch (e) { notice = null; }
  if (seq !== shop.seq) return;          // the buyer switched again meanwhile
  shop.view = shopView('USD', notice);
  shop.loading = false;
  render();
}
/* The switch and the one sentence that says what is shown and what is
   charged. While the dollar figures load, the cards stay on rupees and
   the line says so; a BUY pressed then orders in rupees, which is what
   the card it was pressed on says. */
function currencyBlock() {
  const view = shop.view || rupeeView(shop.want);
  return h('div.pu-currency', {}, [
    h('p.pu-currency-line', { role: 'status', text: shop.loading ? 'Loading the dollar prices…' : currencySentence(view) }),
    segmented({ label: 'Show prices in', options: CURRENCY_OPTIONS, value: shop.want, name: 'pu-currency', action: 'pu-currency', quiet: true })
  ]);
}
const currentView = () => (shop.loading ? rupeeView('INR') : shop.view || rupeeView('INR'));
delegate(document, 'click', '[data-action="pu-currency"]', (e, btn) => {
  const want = btn.dataset.value;
  if (want === shop.want || (want !== 'INR' && want !== 'USD')) return;
  writePayCurrency(want);                // the buyer's own pick, on a press only
  shop.want = want;
  refreshShop();
});

function section(id, eyebrow, title, deck) {
  const sec = h('section.pu-sec', { id });
  const head = h('div.pu-sec-head', {}, [h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title })]);
  if (deck) head.append(h('p.bd-sub', { text: deck }));
  sec.append(head);
  return sec;
}

async function refreshBilling() {
  const c = cloud();
  if (!c || !c.isConfigured() || !c.getSession()) { billing = { ...EMPTY_BILLING, loading: false }; render(); return; }
  billing = { ...billing, error: '', missing: false, loading: true };
  render();
  const { ok, ...got } = await loadBilling();
  billing = { ...got, loading: false };
  if (ok) refreshRefundRequest();
  render();
}


/* §33 — WHERE THE TRIAL STANDS, said on the page that sells the way
   past it. A trial user arrives here from the band's SEE PLANS; a
   lapsed one from the wall's. Both used to find "Choose a plan." over a
   Free card marked "Your plan" — the wall said the trial was over and
   this page said they were on a plan. The line reads billing_status()
   (this page's own copy) and the server's clock through plan-gate. */
function trialLine(st) {
  const t = trialStatus(st, () => (PlanGate.serverNow ? PlanGate.serverNow() : Date.now()));
  if (!t) return null;
  /* §33. Access given by e-mail with no plan: in, uncapped, nothing owed
     while it stands. Said instead of any trial wording. */
  if (t.kind === 'granted') return h('p.pl-status.pu-granted', { text: t.text });
  if (t.kind === 'active') return h('p.pl-status.pu-trial', { text: t.text });
  return h('div.pu-trial.pu-trial-over', {}, [
    h('p.pl-status', { text: t.text }),
    /* The way out sits beside the way through: this is the one page
       a lapsed trial can reach, and the band's account pill is a
       link to Settings, two steps from here. */
    h('div.pu-actions', {}, [h('button.k-btn.k-btn--secondary', { type: 'button', 'data-auth-action': 'signout', text: 'Sign out' })])
  ]);
}

/* BEFORE YOU PAY — what one payment buys and when a refund IS given,
   drawn right under the buy buttons (launch study, 21 Oct 2026: "purchases
   are final" with no visible exceptions was a reason to wait). The three
   exceptions are refund.html §4's, in its own headings and order; the
   one-year line is refund.html §2 and §52 (nothing auto-renews). If
   refund.html changes, change this, REFUND_TERMS in
   supabase/functions/_shared/terms.js and plan-cards.js's fine print
   together. No trial length is typed here: it is the console's to set. */
function buyTerms() {
  const li = (head, text) => h('li', {}, [h('strong', { text: head }), ' \u2014 ' + text]);
  return h('aside.pu-terms', { 'aria-labelledby': 'puTermsH' }, [
    h('h3.pu-h3', { id: 'puTermsH', text: 'Before you pay' }),
    h('p.pu-terms-lead', { text: 'A plan is one payment for one year. Nothing renews by itself, so there is nothing to cancel: if you do not want another year, do nothing.' }),
    h('p.pu-terms-sub', { text: 'A refund is given in these cases. They are not discretionary: if one applies, the refund is yours.' }),
    h('ul.pu-terms-list', {}, [
      li('A duplicate or erroneous charge', 'charged more than once for the same order, or an amount you did not agree to at checkout: the extra payment is refunded in full.'),
      li('Charged but not delivered', 'the payment went through but the plan was never activated on your account: you choose, the plan you paid for or a full refund.'),
      li('Where the law requires it', 'wherever the law of India, including the Consumer Protection Act, 2019, requires a refund.')
    ]),
    h('p.pu-terms-sub', {}, [
      'Otherwise a plan, once bought and activated, is final. To ask, e-mail ',
      h('a', { href: 'mailto:' + SUPPORT_EMAIL, text: SUPPORT_EMAIL }),
      ' from the e-mail address on your account, with the payment ID from your receipt or invoice. ',
      h('a', { href: 'refund.html#the-exceptions', text: 'The full policy' }),
      '.'
    ])
  ]);
}

/* The deck says the per-day figure in the currency the cards are drawn in. */
const deck = () => { const v = currentView(); return deckFor(v.currency === 'USD' ? fromDay(v) : ''); };
/* What a plan actually does: deckFor(), in purchase-model.js. A plan decides
   which STAGES open (plan-matrix.json), and the trial's end walls the
   studio. Nothing written is ever deleted. */

function planSection() {
  const c = cloud();
  const signedIn = !!(c && c.getSession && c.getSession());
  if (!c || !c.isConfigured()) {
    const sec = section('plan', 'Plan', 'No cloud, no plan.', deck());
    sec.append(h('p.hint', { text: 'This build is not connected to a cloud project, so there is no account to put a plan on.' }));
    const x0 = planExtras(null); if (x0) sec.append(x0);
    return sec;
  }
  if (!signedIn) {
    const sec = section('plan', 'Plan', 'Sign in to buy a plan.',
      deck() + ' A plan belongs to an account, so you sign in with Google first — you come straight back to this page.');
    /* The prices HERE, not one page away (start.html#pricing), which
       took a buyer off the buying path to learn the one fact they came
       for. The link stays for the full comparison. */
    sec.append(currencyBlock());
    sec.append(listPriceBlock(currentView()));
    /* The action straight under the prices, before the refund terms: at
       390px it sat two screens down, under the whole policy (UI review,
       22 Oct 2026). The terms still come before any payment, which is
       on the next page, after sign-in. */
    sec.append(h('div.pu-actions', {}, [
      h('button.k-btn.k-btn--primary', { type: 'button', 'data-auth-action': 'google', text: 'Sign in to buy' }),
      h('a.k-btn.k-btn--secondary', { href: 'pricing.html#compare', text: 'Compare every feature' })
    ]));
    if (LINK_CODE) {
      sec.append(h('p.pl-status.pu-ref', { text: `You arrived with the code ${LINK_CODE}. Sign in and it is filled in under \u201cHave a code?\u201d below the plan cards, with what it takes off; you can clear it there.` }));
    }
    sec.append(buyTerms());
    const x1 = planExtras(null); if (x1) sec.append(x1);
    return sec;
  }
  if (!billing.plans) {
    const sec = section('plan', 'Plan', plansPendingHeading(billing), deck());
    if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
    sec.append(h('div.pu-actions', {}, [
      h('button.k-btn.k-btn--secondary', { type: 'button', 'data-pu-action': 'retry', disabled: billing.loading ? true : null, text: billing.loading ? 'Loading…' : 'Try again' })
    ]));
    const x2 = planExtras(null); if (x2) sec.append(x2);
    return sec;
  }
  const st = billing.st;
  /* §32. The owner has switched purchasing off: one line, no cards, no
     checkout. The key must be PRESENT to be believed — a database that
     has not run §32 sends none, and the page is what it always was. An
     invoice already issued is still the buyer's, so it stays. */
  if (purchasesOff(st)) {
    const sec = section('plan', 'Plan', 'Free to use.', FREE_LINE);
    sec.dataset.purchases = 'off';
    return sec;
  }
  const buyer = !!(st && st.plan !== 'free');
  const sec = h('section#plan.pu-sec');
  if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));

  /* THE CURRENT PLAN, as one strip: what you hold and where it stands,
     then the usage against its caps as tiles. Usage is measured against
     a PLAN's caps; with no plan there is no free tier to be "0 of 1"
     against (owner, 11 Oct 2026), so the tiles are drawn for a buyer only. */
  const strip = h('div.pu-current' + (buyer ? '.is-buyer' : ''));
  const ident = h('div.pu-current-id', {}, [
    h('p.bd-eyebrow', { text: buyer ? 'Your plan' : 'Plan' }),
    h('h2.bd-h2', { text: planHeading(st) })
  ]);
  if (buyer && !(st && st.lapsed)) {
    ident.append(h('p.pu-current-state', {}, [h('span.k-badge.k-badge--ok', {}, [h('span.k-badge-dot', { 'aria-hidden': 'true' }), 'Active']),
      h('span', { text: st && st.plan_until ? ' Valid until ' + new Date(st.plan_until).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) + '. Renew any time to add a year; move up and what is left of this year counts.' : ' Granted to you for good.' })]));
  }
  if (st) {
    const tl = trialLine(st);
    if (tl) ident.append(tl);
    if (st.lapsed) ident.append(h('p.pl-status', { text: lapsedLine(st) }));
  }
  strip.append(ident);
  const tiles = buyer ? usageTiles(st) : null;
  if (tiles) strip.append(h('div.pu-current-use', {}, [h('h3.pu-use-h', { text: 'Your usage' }), tiles]));
  sec.append(strip);

  /* THE PLANS: a heading, what a plan does, and the row. */
  sec.append(h('div.pu-plans-head', {}, [
    h('h3.pu-h3', { text: buyer ? 'Plans' : 'Choose your plan' }),
    h('p.bd-sub', { text: deck() })
  ]));
  sec.append(currencyBlock());
  const view = currentView();
  const cards = planCards(billing.plans, st, {
    shop: view,
    onBuy: (planId, period, onStatus, code, currency) => Billing.buy(planId, period, { accountId: st && st.account_id, onStatus, code, currency: currency || orderCurrency(view) }).then(() => { refreshGrowthPanels(); refreshInvoices(); return refreshBilling(); }),
    rerender: render
  });
  /* the terms go straight under the row of buy buttons, above the code
     box and the comparison table, so they are read before a press */
  const row = cards.querySelector('.pl-row');
  if (row) row.after(buyTerms()); else cards.prepend(buyTerms());
  sec.append(cards);
  const growth = memberGrowthPanels(st, { rerender: render });
  if (growth) sec.append(growth);
  const extras = planExtras(st);
  if (extras) sec.append(extras);
  return sec;
}

/* REFUNDS and INVOICES, each its own section under the plans, so a
   buyer looking for a receipt does not scroll through the price row to
   find it. Each panel decides whether it has anything to say (a refund
   request only while the studio's switch is on and a payment is
   eligible; invoices once billing is deployed); an empty one draws
   nothing. An invoice already issued stays the buyer's even while
   nothing is on sale. */
function afterSections() {
  const st = billing.st;
  const c = cloud();
  if (!st || !billing.plans || !c || !c.getSession || !c.getSession()) return [];
  const out = [];
  if (!purchasesOff(st)) {
    const rf = refundRequestPanel({ rerender: render });
    if (rf) { const sec = h('section#refunds.pu-sec.pu-aside'); sec.append(rf); out.push(sec); }
  }
  const inv = memberInvoicePanel(st, { rerender: render });
  if (inv) { const sec = h('section#invoices.pu-sec.pu-aside'); sec.append(inv); out.push(sec); }
  return out;
}

function render() {
  const main = h('main#main');
  /* ONE PAGE FRAME: the kit header; the deck is a body line (.bd-head
     hides a header's sub, and this one says whether anything is on sale). */
  main.append(pageHeader({ eyebrow: ['Studio', 'Purchase'], title: 'Purchase', class: 'bd-head' }));
  const body = h('div.pu-body');
  body.append(h('p.bd-deck.pu-deck', { text: purchasesOff(billing.st) ? 'Nothing is for sale at the moment, and every part of the studio is open.'
    : 'Choose a plan for a year, and find your invoices and refund requests in the same place.' }));
  body.append(planSection());
  for (const x of afterSections()) body.append(x);
  main.append(body);
  if (!commitMain(app, main, mountShell)) return;
  try { StudioUI.autoAriaLabels(); StudioUI.wireGlossaryPopovers(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[purchase] chrome', e); }
  applyLinkCode();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pu-action="retry"]');
  if (el) { el.disabled = true; el.textContent = 'LOADING…'; refreshBilling(); }
});
/* Emptying the box the link filled is a "no": the held code is forgotten
   for the tab, so the next redraw or reload does not put it back. */
delegate(document, 'input', '#plPromoCode', (e, el) => {
  if (!LINK_CODE || el.value.trim()) return;
  clearAttribRef();
  try {
    const u = new URL(location.href);
    if (u.searchParams.has('ref') || u.searchParams.has('code')) {
      u.searchParams.delete('ref'); u.searchParams.delete('code');
      history.replaceState(history.state, '', u.pathname + u.search + u.hash);
    }
  } catch (err) { /* the address keeps it; the box stays as they left it */ }
});

Store.subscribe('billing:changed', () => refreshBilling());
/* §32: the switch moved while the page was open (plan-gate re-reads
   billing_status() on focus and every few minutes) — redraw once. */
Store.subscribe('plan:changed', (cp) => {
  if (!cp || typeof cp.purchaseRequired !== 'boolean' || !billing.st) return;
  if (cp.purchaseRequired !== billing.st.purchase_required) refreshBilling();
});
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshBilling, 0));
/* A restored session fires no SIGNED_IN, and a refreshBilling() at module
   evaluation runs before cloud.js has restored one; cloud:booted is the
   signal (the same note sits in settings.js). */
Store.subscribe('cloud:booted', () => refreshBilling());
render();
refreshBilling();
refreshShop();
