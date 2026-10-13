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
import { h, commitMain } from '../lib/dom.js';
import Billing from '../lib/billing.js';
import { planCards, usageList } from '../ui/plan-cards.js';
import { listPriceBlock } from '../ui/list-prices.js';
import { memberGrowthPanels, refreshGrowthPanels } from '../ui/growth-panels.js';
import { refundRequestPanel, refreshRefundRequest } from '../ui/refund-request.js';
import { memberInvoicePanel, refreshInvoices } from '../ui/invoice-panels.js';
import { planExtras } from '../ui/footer.js';
import PlanGate from '../lib/plan-gate.js';
import { timeLeft } from '../lib/trial-time.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;

/* A referral link (growth-panels.js referralLink) opens this page as
   /purchase?ref=REF-XXXXXX. The code is read from the address and held in
   memory for this visit only — nothing is stored, so it survives neither a
   reload nor the Google round trip, which is why the signed-out line below
   says what to do rather than promising it is remembered. `code` is accepted
   too, for a link somebody typed by hand. Same shape the server accepts. */
const LINK_CODE = (() => {
  try {
    const q = new URLSearchParams(location.search);
    const v = (q.get('ref') || q.get('code') || '').trim();
    return /^[A-Za-z0-9_-]{3,40}$/.test(v) ? v.toUpperCase() : '';
  } catch (e) { return ''; }
})();
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

function section(id, eyebrow, title, deck) {
  const sec = h('section.pu-sec.st-sec', { id });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

async function refreshBilling() {
  const c = cloud();
  if (!c || !c.isConfigured() || !c.getSession()) { billing = { plans: null, st: null, error: '', missing: false, loading: false }; render(); return; }
  billing = { ...billing, error: '', missing: false, loading: true };
  render();
  try {
    const [plans, st] = await Promise.all([Billing.listPlans(), Billing.status()]);
    billing = { plans, st, error: '', missing: false, loading: false };
    refreshRefundRequest();
  } catch (e) {
    const missing = /does not exist|Could not find|PGRST/i.test(e.message || '');
    billing = { plans: null, st: null, error: missing ? '' : (e.message || 'The plans did not load.'), missing, loading: false };
  }
  render();
}

const FREE_LINE = 'The studio is free to use right now \u2014 nothing to buy.';
const purchasesOff = (st) => !!(st && st.purchase_required === false);

/* §33 — WHERE THE TRIAL STANDS, said on the page that sells the way
   past it. A trial user arrives here from the band's SEE PLANS; a
   lapsed one from the wall's. Both used to find "Choose a plan." over a
   Free card marked "Your plan" — the wall said the trial was over and
   this page said they were on a plan. The line reads billing_status()
   (this page's own copy) and the server's clock through plan-gate. */
function trialLine(st) {
  if (!st || st.plan !== 'free' || st.purchase_required === false) return null;
  /* §33. Access given by e-mail with no plan: in, uncapped, nothing owed
     while it stands. Said instead of any trial wording — a trial row
     ticking beside it is not this person's situation. */
  if (st.granted === true) {
    return h('p.pl-status.pu-granted', { text: 'Access given by the studio. An administrator has opened the whole studio to you — there is nothing to buy while this access stands. A plan is here if you want one of your own.' });
  }
  const ends = st.trial_ends_at ? Date.parse(st.trial_ends_at) : NaN;
  if (st.trial_active === true && Number.isFinite(ends)) {
    const left = timeLeft(ends - (PlanGate.serverNow ? PlanGate.serverNow() : Date.now()));
    return h('p.pl-status.pu-trial', { text: 'Your free trial has ' + left + ' left. A plan keeps the studio open after it ends.' });
  }
  if (st.entitled === false) {
    const when = Number.isFinite(ends) ? ' on ' + new Date(ends).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return h('div.pu-trial.pu-trial-over', {}, [
      h('p.pl-status', { text: (st.trial_used ? 'Your free trial ended' + when + '. ' : '') + 'Choose a plan to keep using the studio. Everything you wrote is still saved on this device.' }),
      /* The way out sits beside the way through: this is the one page
         a lapsed trial can reach, and the band's account pill is a
         link to Settings, two steps from here. */
      h('div.pu-actions', {}, [h('button.btn', { type: 'button', 'data-auth-action': 'signout', text: 'SIGN OUT' })])
    ]);
  }
  return null;
}

/* What a plan actually does. This said "work on this device is never
   limited", which stopped being true with the three-plan split: a plan
   decides which STAGES open (plan-matrix.json), and the trial's end walls
   the studio. Nothing written is ever deleted — that part was true and
   stays. Names from planName(), never typed. */
const DECK = 'A plan opens the stages of your own film — ' + Billing.planName('starter') + ' to write it, '
  + Billing.planName('indie') + ' to prepare it, ' + Billing.planName('pro') + ' to shoot and finish it — and sets how much syncs to the cloud. '
  + 'One payment, yours for good. Nothing you write is ever deleted, on any plan or none.';

function planSection() {
  const c = cloud();
  const signedIn = !!(c && c.getSession && c.getSession());
  if (!c || !c.isConfigured()) {
    const sec = section('plan', 'Plan', 'No cloud, no plan.', DECK);
    sec.append(h('p.hint', { text: 'This build is not connected to a cloud project, so there is no account to put a plan on.' }));
    const x0 = planExtras(null); if (x0) sec.append(x0);
    return sec;
  }
  if (!signedIn) {
    const sec = section('plan', 'Plan', 'Sign in to buy a plan.',
      DECK + ' A plan belongs to an account, so you sign in with Google first — you come straight back to this page.');
    /* The prices HERE, not one page away (start.html#pricing), which
       took a buyer off the buying path to learn the one fact they came
       for. The link stays for the full comparison. */
    sec.append(listPriceBlock());
    if (LINK_CODE) {
      sec.append(h('p.pl-status.pu-ref', { text: `You arrived with the referral code ${LINK_CODE}. Sign in, then enter it under \u201cHave a code?\u201d below the plan cards to see your discount.` }));
    }
    sec.append(h('div.pu-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'SIGN IN TO BUY' }),
      h('a.btn', { href: 'start.html#pricing', text: 'COMPARE EVERY FEATURE' })
    ]));
    const x1 = planExtras(null); if (x1) sec.append(x1);
    return sec;
  }
  if (!billing.plans) {
    const sec = section('plan', 'Plan',
      billing.missing ? 'Plans are not set up on this project yet.' : billing.error ? 'The plans did not load.' : 'Loading the plans…', DECK);
    if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
    sec.append(h('div.pu-actions', {}, [
      h('button.btn', { type: 'button', 'data-pu-action': 'retry', disabled: billing.loading ? true : null, text: billing.loading ? 'LOADING…' : 'TRY AGAIN' })
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
    const invs0 = memberInvoicePanel(st, { rerender: render });
    if (invs0) sec.append(invs0);
    return sec;
  }
  const sec = section('plan', 'Plan', st && st.plan !== 'free' ? `${st.plan_name || Billing.planName(st.plan)}${st.account_name ? ' · ' + st.account_name : ''}`
    : st && st.granted === true ? 'Access given by the studio.' : 'Choose a plan.', DECK);
  if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
  if (st) {
    const tl = trialLine(st);
    if (tl) sec.append(tl);
    /* Usage is measured against a PLAN's caps. With no plan there is no
       free tier to be "0 of 1" against (owner, 11 Oct 2026), so it is
       drawn for a buyer only. */
    const u = st.plan !== 'free' ? usageList(st) : null;
    if (u) sec.append(h('h3.gt-h3', { text: 'Your usage' }), u);
    if (st.lapsed) sec.append(h('p.pl-status', { text: `Your ${Billing.planName(st.bought_plan)} plan ended on ${new Date(st.plan_until).toLocaleDateString(undefined, { dateStyle: 'medium' })} (refunded). Choose a plan to keep using the studio.` }));
  }
  sec.append(planCards(billing.plans, st, {
    onBuy: (planId, period, onStatus, code) => Billing.buy(planId, period, { accountId: st && st.account_id, onStatus, code }).then(() => { refreshGrowthPanels(); refreshInvoices(); return refreshBilling(); }),
    rerender: render
  }));
  const growth = memberGrowthPanels(st, { rerender: render });
  if (growth) sec.append(growth);
  const refundBlock = refundRequestPanel({ rerender: render });
  if (refundBlock) sec.append(refundBlock);
  const invs = memberInvoicePanel(st, { rerender: render });
  if (invs) sec.append(invs);
  const extras = planExtras(st);
  if (extras) sec.append(extras);
  return sec;
}

function render() {
  const main = h('main#main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Studio · Purchase' }),
    h('h1.bd-title', { text: 'Purchase.' }),
    h('p.bd-deck', { text: purchasesOff(billing.st) ? 'Nothing is for sale at the moment, and every part of the studio is open.'
      : 'Choose a plan, pay once, and find your invoices and refund requests in the same place.' })
  ]));
  const body = h('div.pu-body');
  body.append(planSection());
  main.append(body);
  if (!commitMain(app, main, mountShell)) return;
  try { StudioUI.autoAriaLabels(); StudioUI.wireGlossaryPopovers(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[purchase] chrome', e); }
  applyLinkCode();
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pu-action="retry"]');
  if (el) { el.disabled = true; el.textContent = 'LOADING…'; refreshBilling(); }
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
