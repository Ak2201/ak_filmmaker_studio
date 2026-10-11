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
import { h } from '../lib/dom.js';
import Billing from '../lib/billing.js';
import { planCards, usageList } from '../ui/plan-cards.js';
import { memberGrowthPanels, refreshGrowthPanels } from '../ui/growth-panels.js';
import { refundRequestPanel, refreshRefundRequest } from '../ui/refund-request.js';
import { memberInvoicePanel, refreshInvoices } from '../ui/invoice-panels.js';
import { planExtras } from '../ui/footer.js';

const app = document.getElementById('app');
const cloud = () => window.StudioCloud || null;

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

const DECK = 'A plan sets how much you can do in the cloud — synced projects, share links, collaborators and team seats — and unlocks the Chrome extension. Work on this device is never limited.';

function planSection() {
  const c = cloud();
  const signedIn = !!(c && c.getSession && c.getSession());
  if (!c || !c.isConfigured()) {
    const sec = section('plan', 'Plan', 'No cloud, no plan.', DECK);
    sec.append(h('p.hint', { text: 'This build is not connected to a cloud project, so there is no account to put a plan on.' }));
    return sec;
  }
  if (!signedIn) {
    const sec = section('plan', 'Plan', 'Sign in to see the plans.',
      DECK + ' A plan belongs to an account, so the plans and your usage show here once you are signed in.');
    sec.append(h('div.pu-actions', {}, [
      h('button.btn.primary', { type: 'button', 'data-auth-action': 'google', text: 'SIGN IN TO BUY' }),
      h('a.btn', { href: 'start.html#pricing', text: 'SEE PLANS AND PRICES' })
    ]));
    return sec;
  }
  if (!billing.plans) {
    const sec = section('plan', 'Plan',
      billing.missing ? 'Plans are not set up on this project yet.' : billing.error ? 'The plans did not load.' : 'Loading the plans…', DECK);
    if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
    sec.append(h('div.pu-actions', {}, [
      h('button.btn', { type: 'button', 'data-pu-action': 'retry', disabled: billing.loading ? true : null, text: billing.loading ? 'LOADING…' : 'TRY AGAIN' })
    ]));
    return sec;
  }
  const st = billing.st;
  const sec = section('plan', 'Plan', st && st.plan !== 'free' ? `${st.plan_name || Billing.planName(st.plan)}${st.account_name ? ' · ' + st.account_name : ''}` : 'Choose a plan.', DECK);
  if (billing.error) sec.append(h('p.gt-error', { role: 'alert', text: billing.error }));
  if (st) {
    const u = usageList(st);
    if (u) sec.append(h('h3.gt-h3', { text: 'Your usage' }), u);
    if (st.lapsed) sec.append(h('p.pl-status', { text: `Your ${Billing.planName(st.bought_plan)} plan ended on ${new Date(st.plan_until).toLocaleDateString(undefined, { dateStyle: 'medium' })} (refunded). You are on the free plan’s limits now.` }));
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
    h('p.bd-deck', { text: 'Choose a plan, pay once, and find your invoices and refund requests in the same place.' })
  ]));
  const body = h('div.pu-body');
  body.append(planSection());
  main.append(body);
  app.replaceChildren(main);
  mountShell();
  try { StudioUI.autoAriaLabels(); StudioUI.wireGlossaryPopovers(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[purchase] chrome', e); }
}

document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-pu-action="retry"]');
  if (el) { el.disabled = true; el.textContent = 'LOADING…'; refreshBilling(); }
});

Store.subscribe('billing:changed', () => refreshBilling());
if (cloud() && cloud().onAuth) cloud().onAuth(() => setTimeout(refreshBilling, 0));
/* A restored session fires no SIGNED_IN, and a refreshBilling() at module
   evaluation runs before cloud.js has restored one; cloud:booted is the
   signal (the same note sits in settings.js). */
Store.subscribe('cloud:booted', () => refreshBilling());
render();
refreshBilling();
