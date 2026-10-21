/* ============================================================
   PURCHASE MODEL — what purchase.html knows, without the page
   ------------------------------------------------------------
   The logic half of src/pages/purchase.js and of the plan cards
   (src/ui/plan-cards.js): loading the plans with billing_status(), the
   plan a visitor came to buy (?plan= or its per-tab stash), the
   referral code in the address, and the sentences the page says about
   a plan and a trial. Nothing here touches the DOM; what a plan is and
   what was paid stays the server's, read every time.
   ============================================================ */
import Billing from './billing.js';
import { session } from './prefs.js';
import { timeLeft } from './trial-time.js';
import { perDay, LIST_PRICE } from './plans.js';

/* ---- the plan they came to buy ------------------------------------ */

/* ?plan=<id> must survive the Google hop, which returns to the hub and
   loses the address: a press on a Google button stashes it for the tab. */
const PLAN_STASH = 'fms_purchase_plan';

const planParam = (search) => new URLSearchParams(search).get('plan');

/** The plan named in the address, else the one stashed for this tab, else ''. */
export function wantedPlan(search) {
  try {
    const q = planParam(search);
    if (q) return q;
    return session.readText(PLAN_STASH) || '';
  } catch (e) { return ''; }
}
/** The stash is spent once its card has been marked. */
export const clearPlanStash = () => { session.removeKey(PLAN_STASH); };
/** Before the Google hop: hold ?plan= for the return. */
export function stashPlanFromAddress(search) {
  try {
    const q = planParam(search);
    if (q && /^[\w-]{1,32}$/.test(q)) session.writeText(PLAN_STASH, q);
  } catch (e) { /* ignore */ }
}

/* ---- the referral code in the address ----------------------------- */

/** /purchase?ref=REF-XXXXXX (or `code`, typed by hand): the code,
 *  upper-cased, or '' — the same shape the server accepts. Held in
 *  memory by the page; nothing is stored. */
export function linkCode(search) {
  try {
    const q = new URLSearchParams(search);
    const v = (q.get('ref') || q.get('code') || '').trim();
    return /^[A-Za-z0-9_-]{3,40}$/.test(v) ? v.toUpperCase() : '';
  } catch (e) { return ''; }
}

/* ---- the plans ---------------------------------------------------- */

export const EMPTY_BILLING = Object.freeze({ plans: null, st: null, error: '', missing: false });

/** The plans and this account's billing_status(), in one round trip.
 *  `ok` says the round trip succeeded. Never throws: a schema without the plans reads as `missing`, any
 *  other failure as `error` (the sentence the page shows). */
export async function loadBilling() {
  try {
    const [plans, st] = await Promise.all([Billing.listPlans(), Billing.status()]);
    return { plans, st, error: '', missing: false, ok: true };
  } catch (e) {
    const missing = /does not exist|Could not find|PGRST/i.test(e.message || '');
    return { plans: null, st: null, error: missing ? '' : (e.message || 'The plans did not load.'), missing, ok: false };
  }
}

/** §32: the owner has switched purchasing off (the key must be PRESENT). */
export const purchasesOff = (st) => !!(st && st.purchase_required === false);

export const FREE_LINE = 'The studio is free to use right now — nothing to buy.';

/* What a plan actually does. Names from planName(), never typed. */
export const DECK = 'A plan opens the stages of your own film — ' + Billing.planName('starter') + ' to write it, '
  + Billing.planName('indie') + ' to prepare it, ' + Billing.planName('pro') + ' to shoot and finish it — and sets how much syncs to the cloud. '
  + 'A year at a time, from about ' + perDay(LIST_PRICE.starter) + ' a day; nothing renews by itself. Nothing you write is ever deleted, on any plan or none.';

/** The plan section's heading for a signed-in account with plans loaded. */
export function planHeading(st) {
  return st && st.plan !== 'free' ? `${st.plan_name || Billing.planName(st.plan)}${st.account_name ? ' · ' + st.account_name : ''}`
    : st && st.granted === true ? 'Access given by the studio.' : 'Choose a plan.';
}

/** The heading while the plans have not arrived. */
export function plansPendingHeading({ missing, error }) {
  return missing ? 'Plans are not set up on this project yet.' : error ? 'The plans did not load.' : 'Loading the plans…';
}

/** The line for a refunded plan that has lapsed. */
export function lapsedLine(st) {
  const refunded = Array.isArray(st.payments) && st.payments.some((p) => p && p.status === 'refunded' && p.plan_id === st.bought_plan);
  return `Your ${Billing.planName(st.bought_plan)} plan ended on ${new Date(st.plan_until).toLocaleDateString(undefined, { dateStyle: 'medium' })}${refunded ? ' (refunded)' : ''}. Renew it, or choose a plan, to keep using the studio.`;
}

/** §33 — WHERE THE TRIAL STANDS, or null when there is nothing to say.
 *  `now` is a function (the server's clock, via plan-gate), read only
 *  when a running trial needs it.
 *    { kind: 'granted', text }   access given by e-mail, no plan
 *    { kind: 'active',  text }   a trial is running
 *    { kind: 'over',    text }   not entitled: the trial ended, or none */
export function trialStatus(st, now) {
  if (!st || st.plan !== 'free' || st.purchase_required === false) return null;
  if (st.granted === true) {
    return { kind: 'granted', text: 'Access given by the studio. An administrator has opened the whole studio to you — there is nothing to buy while this access stands. A plan is here if you want one of your own.' };
  }
  const ends = st.trial_ends_at ? Date.parse(st.trial_ends_at) : NaN;
  if (st.trial_active === true && Number.isFinite(ends)) {
    const left = timeLeft(ends - now());
    return { kind: 'active', text: 'Your free trial has ' + left + ' left. A plan keeps the studio open after it ends.' };
  }
  if (st.entitled === false) {
    const when = Number.isFinite(ends) ? ' on ' + new Date(ends).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '';
    return { kind: 'over', text: (st.trial_used ? 'Your free trial ended' + when + '. ' : '') + 'Choose a plan to keep using the studio. Everything you wrote is still saved on this device.' };
  }
  return null;
}

export default {
  wantedPlan, clearPlanStash, stashPlanFromAddress, linkCode, EMPTY_BILLING, loadBilling, purchasesOff, FREE_LINE, DECK,
  planHeading, plansPendingHeading, lapsedLine, trialStatus
};
