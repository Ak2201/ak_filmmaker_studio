/* ============================================================
   SETTINGS MODEL — what the Settings page derives and the one
   switch it stores
   ------------------------------------------------------------
   The pure half of src/pages/settings.js: the storage meter's figures
   and band, the plan card's sentences and pill, the identity card's
   role line, and the old billing anchors' new homes. Plus the usage-
   counting switch, whose key is usage.js's (OPTOUT_KEY) and which is
   written through store.js's raw writers exactly as the page did —
   in the reset list, in no backup, never scoped to a project.
   ============================================================ */
import Store from './store.js';
import { OPTOUT_KEY } from './usage.js';
import { passName } from './pass-view.js';
import { renewsText } from './offer-terms.js';
import { dayLabel, autopaySummary } from './pass-view.js';
export { dayLabel, autopaySummary };

/* ---- old anchors ----------------------------------------------------- */

/** settings.html#plan and friends now live on purchase.html. */
export const OLD_BILLING_ANCHORS = {
  plan: 'purchase.html#plan', billing: 'purchase.html#plan', invoices: 'purchase.html#plan', refund: 'purchase.html#plan',
  promo: 'purchase.html#plan', gift: 'purchase.html#plan', trial: 'purchase.html#plan', referral: 'purchase.html#plan'
};
/** Where an old fragment ('#plan') now lives, or undefined. */
export const movedAnchor = (hash) => OLD_BILLING_ANCHORS[String(hash || '').replace(/^#/, '')];

/* ---- words --------------------------------------------------------------- */

export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/** An ISO time as a short local date and time; 'never' / 'unknown'. */
export function formatWhen(iso) {
  if (!iso) return 'never';
  const d = new Date(iso);
  if (isNaN(d)) return 'unknown';
  return d.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

/* ---- storage --------------------------------------------------------- */

/* Chars in, quota bytes out. storageUsage() counts UTF-16 code
   units because that is the unit browsers bill, and `smallLimit`
   is quoted in the same unit, so the proportion of the two is
   sound. Two bytes per unit is the conversion, and the page says
   so out loud. */
export function fmtQuota(chars) {
  const kb = (Number(chars) || 0) * 2 / 1024;
  if (kb < 1) return 'under 1 KB';
  if (kb < 1024) return Math.round(kb) + ' KB';
  return (kb / 1024).toFixed(1) + ' MB';
}

/** The main-storage meter from storageUsage(): { limit, share, pct, band, shown }.
    Three bands — a healthy number is not drawn in a warning hue — and 0%
    on a studio that has written something is shown as "under 1%". */
export function storageReadout(u) {
  const limit = u.smallLimit > 0 ? u.smallLimit : 0;
  const share = limit ? u.small / limit : 0;
  const pct   = Math.max(0, Math.min(100, Math.round(share * 100)));
  const band  = share >= 0.9 ? 'bad' : share >= 0.75 ? 'warn' : 'ok';
  const shown = (u.small > 0 && pct < 1) ? 'under 1%' : pct + '%';
  return { limit, share, pct, band, shown };
}

/** The large-item tier's figure: counted, never proportioned. */
export function bigTierFigure(u) {
  return u.tier === 'unavailable' ? 'could not be counted'
    : u.overflowed ? fmtQuota(u.big) + ' across ' + plural(u.overflowed, 'item', 'items')
    : 'nothing here yet';
}

/* ---- the plan --------------------------------------------------------- */

/** The identity card's role line: "Studio admin · Free trial". 'granted' is
    only ever computed with plan 'free', so its planName is the free plan's. */
export function roleLine(cp, gateRole) {
  const role = gateRole === 'admin' ? 'Studio admin' : 'Member';
  const plan = cp.reason === 'paid' && cp.passActive ? passName(cp.passDays) : cp.reason === 'paid' ? cp.planName : cp.reason === 'granted' ? 'Access given by the studio' : cp.reason === 'trial' ? 'Free trial' : '';
  return role + (plan ? ' · ' + plan : '');
}

/** "3/5" from an account's seats, for noticing that the count moved. */
export const seatsKey = (d) => (d && d.seats ? d.seats.used + '/' + d.seats.limit : '');

/** The plan card's words: { line, led: [word, tone] | null, usageNote, bought }.
    `trialEndsAt()` is asked only for a running trial. */
export function planSummary(cp, { off, signedIn, trialEndsAt }) {
  /* 'expired' is every not-entitled state while trials are on, which
     includes somebody who never STARTED one (QA, 26 Oct 2026: the card
     said "Your free trial has ended" beside "Start your free trial").
     Told apart the way the wall tells them apart (plan-gate.js
     wallPanel's `fresh`): never used, never paid and no launch pass is
     nobody who has had anything yet. The public trial is retired (27 Oct
     2026), so that state names no trial; a pass, a plan and a trial that
     ran out each say which. */
  const fresh = !off && cp.reason === 'expired' && !cp.used && !cp.paidBefore && !cp.passUsed;
  let line;
  if (off) line = 'The studio is free to use right now. Nothing needs buying.';
  else if (cp.reason === 'trial') {
    const end = trialEndsAt();
    line = 'Free trial' + (end ? ' · ends ' + end.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '') + '.';
  } else if (cp.reason === 'paid' && cp.passActive && cp.autopay && cp.autopay.live && cp.autopay.product === 'pass') {
    line = passName(cp.passDays) + ' · ' + renewsText(dayLabel(cp.autopay.nextChargeAt || cp.autopay.currentEnd || cp.planUntil), cp.autopay.price) + '. The whole studio is open.';
  } else if (cp.reason === 'paid' && cp.passActive) {
    /* §61: the launch pass is Pro for a few days, not a plan to renew. */
    line = passName(cp.passDays) + (cp.planUntil ? ' · ends ' + new Date(cp.planUntil).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '') + '. The whole studio is open; a yearly plan keeps it open after.';
  } else if (cp.reason === 'paid' && cp.autopay && cp.autopay.live && cp.autopay.product === cp.plan) {
    /* §62: a running auto-pay renews by itself; the card below it says more */
    line = (cp.planName || 'Your plan') + ' · ' + renewsText(dayLabel(cp.autopay.nextChargeAt || cp.autopay.currentEnd || cp.planUntil), cp.autopay.price) + '.';
  } else if (cp.reason === 'paid') line = (cp.planName || 'Your plan') + (cp.planUntil ? ' · valid until ' + new Date(cp.planUntil).toLocaleDateString(undefined, { dateStyle: 'medium' }) + '. Renew from Purchase to add a year.' : ' · granted for good.');
  else if (cp.reason === 'granted') line = 'Access given to you by the studio.';   // its planName is the free plan's
  else if (cp.reason === 'expired' && cp.passUsed) line = 'Your launch pass has ended. A yearly plan opens the studio again.';
  else if (cp.reason === 'expired' && cp.paidBefore) line = 'Your plan has ended. Buying a plan again brings it back.';
  else if (cp.reason === 'expired' && cp.used) line = 'Your free trial has ended. A plan brings it back.';
  else if (fresh) line = 'No plan yet. Choose one from Purchase.';
  else line = cp.gated ? (cp.planName || 'No plan') + '.' : 'Plan details load when you are signed in.';
  /* One LED pill, read from the same facts as the line, so it can never
     say something the line does not. */
  const led = off ? ['Open', 'ok'] : cp.reason === 'trial' ? ['Trial', 'warn'] : cp.reason === 'paid' && cp.passActive ? ['Pass', 'warn'] : cp.reason === 'paid' ? ['Active', 'ok']
    : cp.reason === 'granted' ? ['Granted', 'ok'] : fresh ? ['No plan', 'warn'] : cp.reason === 'expired' ? ['Ended', 'bad'] : null;
  /* The second line: what the plan means for what you can keep and share. */
  let usageNote = '';
  if (off) usageNote = 'The studio is open, so nothing is capped: sync as many films as you like and share them freely.';
  else if (!signedIn) usageNote = '';   // the line above already says plan details need a sign-in
  else if (cp.reason === 'granted') usageNote = 'Nothing is capped while this access stands.';
  else if (cp.reason === 'trial') usageNote = 'Plan limits on synced films and shares apply once you choose a plan.';
  else if (cp.reason === 'expired') usageNote = 'Everything you wrote is still saved on this device.';
  const bought = signedIn && !off && cp.reason === 'paid';
  return { line, led, usageNote, bought };
}

/** The answer after "Delete my cloud projects". */
export function cloudDeleteReport(res) {
  const failed = (res && res.failed) || [];
  if (res && res.readError) {
    return { title: 'Could not read your cloud projects', body: 'Nothing was deleted and cloud sync was left as it was. ' + res.readError };
  }
  if (!failed.length && !(res && res.deleted)) {
    return { title: 'No cloud projects to delete', body: 'You have no projects in the cloud. Cloud sync is paused.' };
  }
  return {
    title: failed.length ? 'Some cloud projects were not deleted' : 'Cloud projects deleted',
    body: 'Deleted ' + ((res && res.deleted) || 0) + ' cloud project(s)' + (failed.length ? '; ' + failed.length + ' failed.' : '.') + ' Cloud sync is paused.'
  };
}

/* ---- the one switch this page stores --------------------------------- */

/** Counting on = the key removed; off = '1'. The default leaves nothing.
    A storage that refuses the write throws, as it always did, so the
    page can say the choice was not saved. */
export function setUsageCounting(on) {
  if (on) Store.rawRemove(OPTOUT_KEY); else Store.rawSet(OPTOUT_KEY, '1');
}

export default { dayLabel, autopaySummary, OLD_BILLING_ANCHORS, movedAnchor, plural, formatWhen, fmtQuota, storageReadout, bigTierFigure, roleLine, seatsKey, planSummary, cloudDeleteReport, setUsageCounting };
