/* ============================================================
   INVITE MODEL — what invite.html knows, without the page
   ------------------------------------------------------------
   The logic half of src/pages/invite.js: the per-tab breadcrumbs it
   reads (the site gate's, the landing page's plan stash, its own
   #request view) and the derivations that decide what the doorway
   says — the deck sentence, why the visitor was sent here, whether a
   trial may be offered. No DOM; the page draws.

   No key is new. The gate's three keys are sitegate.js's own
   constants; the plan stash is start-model.js's; VIEW_KEY is this
   page's and always was.
   ============================================================ */
import { session } from './prefs.js';
import { PASS_KEY, REQ_KEY, WHY_KEY } from './sitegate.js';
import { readPlanStash, clearPlanStash, cleanPlanId } from './start-model.js';

/* `#request` survives the Google hop in sessionStorage: the hash does
   not (the return lands on the hub). */
const VIEW_KEY = 'fms_invite_view';

/* ---- the per-tab breadcrumbs ------------------------------------- */

/** The raw reason sitegate.js left for turning this visitor away, or ''. */
export const readGateWhyRaw = () => session.readText(WHY_KEY, '') || '';
/** Forget it (a fresh check is about to answer). */
export const clearGateWhy = () => { session.removeKey(WHY_KEY); };
/** The breadcrumb parsed, or null. */
export function readGateWhy() {
  try { return JSON.parse(readGateWhyRaw() || 'null'); } catch (e) { return null; }
}

/** The gate's cached purchases_required() answer says the site is open. */
export const readSiteOpen = () => session.readText(REQ_KEY) === '0';
/** Cache the anon answer in the gate's own key, so both agree. */
export const saveSiteOpen = (required) => { session.writeText(REQ_KEY, required ? '1' : '0'); };

/** Does this visit want the request block? A `#request` hash is
 *  remembered for the tab; otherwise the remembered answer stands. */
export function wantsRequestView(hash) {
  if (/(^|#)request$/.test(hash)) {
    session.writeText(VIEW_KEY, 'request');
    return true;
  }
  return session.readText(VIEW_KEY) === 'request';
}
export const forgetRequestView = () => { session.removeKey(VIEW_KEY); };

/** FORGET THIS CODE also drops the site gate's per-tab pass. */
export const clearSitegatePass = () => { session.removeKey(PASS_KEY); };

/** The landing page's plan stash, spent: where to send a SIGNED-IN
 *  buyer ('purchase.html' with the plan named), or null when there is
 *  no stash, it is not a buy, or there is no session yet. */
export function takeInvitePlan(signedIn) {
  const v = readPlanStash();
  if (!v || !v.buy || !signedIn) return null;
  clearPlanStash();
  const plan = v.plan ? cleanPlanId(v.plan) : '';
  return 'purchase.html' + (plan ? '?plan=' + encodeURIComponent(plan) : '');
}

/* ---- what the page says ------------------------------------------ */

/** The deck under the title: which of the four situations this is.
 *  `gateDetail` is cloud.js's sentence for a gate reason, when present.
 *  `pass` is pass-view.js passPhase() ('open' | 'ended' | 'off') and
 *  `passPrice` its price ("₹49"): while the launch pass runs, or once the
 *  launch offer has ended, the free trial is not offered to the public. */
export function deckFor({ configured, signedIn, codeHeld, trialsOff, state, reason, gateDetail, pass = 'off', passPrice = '' }) {
  if (!configured) return 'Invites are not available right now. Everything you write is saved in this browser.';
  if (!signedIn && codeHeld) return 'This browser is holding an invite code. Sign in with Google to spend it on your account and start the trial it carries.';
  const passOpen = pass === 'open' && !!passPrice;
  if (!signedIn) {
    if (passOpen) return 'Try the whole studio for ' + passPrice + ', buy a yearly plan, or come in on the code you were given. Each of them begins by signing in with Google.';
    return !trialsOff && pass === 'off'
      ? 'Start a free trial of the whole studio, buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.'
      : 'Buy a plan, or come in on the code you were given. Each of them begins by signing in with Google.';
  }
  if (state === 'unknown') return 'Checking your invite…';
  if (state === 'open') return 'You are in. Your projects sync to this account.';
  if (state === 'lost') return 'This account is active on another device, so sync is paused here.';
  /* CLOSED. Say what they can do, and keep the one thing they will
     actually be worried about. */
  if (state === 'closed' && (!reason || reason === 'noinvite')) {
    if (passOpen) return 'Try the whole studio for ' + passPrice + ', buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.';
    return pass === 'off'
      ? 'Start a free trial, buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.'
      : 'Buy a plan, or enter the code you were given. Everything on this device is still here, exactly as you left it.';
  }
  return gateDetail ? gateDetail(reason) + '. Everything on this device is still here.' : 'Sync is paused.';
}

/** Why the gate sent them here, in one sentence, or '' when the
 *  breadcrumb no longer describes the present (`w` is readGateWhy()). */
export function whySentence(w, { configured, signedIn, state }) {
  if (!w || !w.reason) return '';
  const r = String(w.reason).toLowerCase();
  /* A BREADCRUMB ABOUT A STATE THAT NO LONGER HOLDS IS A LIE. */
  if (r === 'signedout' && signedIn) return '';
  if (r === 'nocloud' && configured) return '';
  if (signedIn && (state === 'open' || state === 'lost')) return '';
  const page = w.from ? String(w.from).replace(/^\//, '').split(/[?#]/)[0] : '';
  const lead = page ? 'You were sent here from ' + page + ' because ' : 'You were sent here because ';
  if (r === 'signedout') return lead + 'you are not signed in.';
  if (r === 'nocloud') return lead + 'this site is not connected to its server just now. Everything on this device is still here.';
  if (r === 'timeout' || r === 'unreachable') return lead + 'your invite could not be checked just then. Everything on this device is still here.';
  return lead + 'this account has no trial running and no plan yet.';
}

/** A check that could not be made is retryable; the others are not. */
export const retryable = (reason, whyRaw) =>
  reason === 'unreachable' || reason === 'nocloud' || /"reason":"(timeout|unreachable|nocloud)"/.test(whyRaw);

/** `&demo=1` on an invite link (the console's "Create demo link"). */
export const isDemoHash = (hash) => /(?:^#|&)demo=1(?:&|$)/.test(String(hash || ''));

/** The landing page's plan stash names the launch pass ('pass'): spend
 *  it and say so. The pass is bought on this page, so the visitor stays;
 *  a stash naming a yearly plan is takeInvitePlan()'s, untouched. */
export function takePassIntent() {
  const v = readPlanStash();
  if (!v || !v.buy || v.plan !== 'pass') return false;
  clearPlanStash();
  return true;
}

/* ---- the trial --------------------------------------------------- */

/** Anything paid, granted or refunded — start_trial() refuses all three
 *  (the same read as plan-gate.js: the wall and the door agree). */
export function paidBefore(st) {
  return !!(st && Array.isArray(st.payments)
            && st.payments.some((p) => p && /^(paid|granted|refunded)$/.test(p.status)));
}

/** { minutes } when this account may START a trial, else null. The key
 *  has to be PRESENT to be believed; entitlement is a different question
 *  (see the note in invite.js). */
export function trialOfferFrom(st) {
  const on = st && st.trial_enabled === true && st.trial_used !== true
          && st.trial_active !== true && !paidBefore(st);
  const mins = Number(st && st.trial_minutes);
  return on ? { minutes: mins > 0 ? Math.round(mins) : 30 } : null;
}

/** The anonymous trial_offer() answer as the signed-out branch reads it. */
export function anonTrialFrom(t) {
  if (!t) return null;
  return { enabled: t.trial_enabled === true, minutes: Number(t.trial_minutes) > 0 ? Math.round(t.trial_minutes) : 30 };
}

/** The sentence for a start_trial() refusal verdict. */
export function trialRefusal(reason) {
  return {
    used: 'You have already had your trial on this account. A plan opens the studio for a year.',
    paid: 'You have already bought a plan — you should be in. Try reloading.',
    disabled: 'Trials are not open at the moment.',
    /* §61: a signup trial is refused while the launch pass is on sale. */
    pass: 'The free trial is closed while the launch pass is on sale. The pass or a yearly plan opens the studio.'
  }[reason] || 'That did not start. Please try again.';
}

export default {
  readGateWhyRaw, clearGateWhy, readGateWhy, readSiteOpen, saveSiteOpen, wantsRequestView, forgetRequestView,
  clearSitegatePass, takeInvitePlan, takePassIntent, deckFor, whySentence, retryable, isDemoHash, paidBefore, trialOfferFrom,
  anonTrialFrom, trialRefusal
};
