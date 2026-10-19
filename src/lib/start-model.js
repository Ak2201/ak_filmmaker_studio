/* ============================================================
   START MODEL — what the landing page knows, without the page
   ------------------------------------------------------------
   The logic half of src/pages/start.js: the per-tab stashes it reads
   and writes, and every derivation that does not need the DOM (which
   links lead into the app, the sentence a price rise is announced
   with, which testimonials may be drawn).

   IMPORT-FREE, AND IT HAS TO STAY THAT WAY. start.html must ship
   almost no JavaScript; the day this file imports store.js (or
   anything in CORE) the landing page statically imports the 209 KB
   app bundle — the startlib trap in CLAUDE.md. That is why the
   storage calls below talk to sessionStorage directly rather than
   through prefs.js, and why the auth-error key is a PARAMETER (it is
   owned by auth-scope.js, which start.js already imports).
   ============================================================ */

/* A plan's BUY must survive the Google hop. Google returns to the hub,
   the gate sends a non-member to invite.html, and the address there has
   lost ?plan=. invite.js reads this same sessionStorage key back
   (takeInvitePlan() in invite-model.js) and forwards the buyer to the
   checkout with the plan named. sessionStorage is per tab and per
   origin, and the Google round trip stays in both. */
export const INVITE_PLAN_KEY = 'fms_invite_plan';

const PLAN_ID = /^[\w-]{1,32}$/;
/** A plan id as the stash and ?plan= accept it, or ''. */
export const cleanPlanId = (id) => (PLAN_ID.test(id) ? id : '');

/** Remember that this tab is on its way to buy `id`. */
export function stashPlan(id) {
  try { sessionStorage.setItem(INVITE_PLAN_KEY, JSON.stringify({ plan: cleanPlanId(id), buy: true })); } catch (e) { /* private mode */ }
}

/** The plan stash, or null. Never throws. */
export function readPlanStash() {
  try { return JSON.parse(sessionStorage.getItem(INVITE_PLAN_KEY) || 'null'); } catch (e) { return null; }
}
/** Spend the stash. */
export function clearPlanStash() {
  try { sessionStorage.removeItem(INVITE_PLAN_KEY); } catch (e) { /* ignore */ }
}

/** Read-and-clear the reason cloud.js left behind when a sign-in did
 *  not produce a session. `key` is auth-scope.js's AUTH_ERROR_KEY.
 *  Answers the parsed object, or null (none, private mode, garbage). */
export function takeAuthError(key) {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    sessionStorage.removeItem(key);
    return JSON.parse(raw);
  } catch (e) { return null; }
}

/* Under the gate every app page bounces a stranger, so a "try it" link
   would land them on the landing page they came from. The exempt pages
   (invite.html first: it is the no-JS fallback of every sign-in CTA)
   keep their hrefs. */
const APP_PAGE = /^(?!(?:invite|start|privacy|terms|refund|screening|purchase|pricing|contact|about|product-[\w-]+)(?:\.html)?(?:[?#]|$))[\w-]+\.html(?:[?#]|$)/;
/** Is this href a link INTO the gated app? */
export const isAppPage = (href) => APP_PAGE.test(href);

/** The checkout address for a plan's BUY when already signed in. */
export const buyHref = (planId) => 'purchase.html?plan=' + encodeURIComponent(planId);

/* ---- the e-mail capture ------------------------------------------ */
export const validEmail = (email) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
/** The consent sentence as stored: the label's text, whitespace folded. */
export const consentText = (text) => String(text).replace(/\s+/g, ' ').trim();

/* ---- testimonials ------------------------------------------------- */
/** { testimonials, films } with only the entries that may be drawn:
 *  complete, and carrying the date consent was given. */
export function consentedVoices(data) {
  const d = data || {};
  return {
    testimonials: (Array.isArray(d.testimonials) ? d.testimonials : []).filter((t) => t && t.id && t.quote && t.name && t.consentOn),
    films: (Array.isArray(d.films) ? d.films : []).filter((f) => f && f.id && f.title && f.consentOn)
  };
}
export const voiceByline = (t) => [t.name, t.role, t.film].filter(Boolean).join(' · ');
export const filmByline = (f) => ' ' + [f.year && `(${f.year})`, f.director, f.format].filter(Boolean).join(' · ');

/* ---- the scheduled price rise ------------------------------------ */
export const inr = (paise) => '₹' + Math.round(Number(paise || 0) / 100).toLocaleString('en-IN');
export const onDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long' }); }
  catch (e) { return d.toDateString(); }
};
export function timeLeft(ms) {
  if (!(ms > 0)) return '';
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  if (days >= 1) return days + 'd ' + (hrs % 24) + 'h left';
  if (hrs >= 1) return hrs + 'h ' + (mins % 60) + 'm left';
  return Math.max(1, mins) + 'm left';
}

/** The plans in a notice that carry a coming price, each with the text
 *  drawn beside its current one. */
export function risingTiers(notice) {
  if (!notice || !Array.isArray(notice.plans)) return [];
  return notice.plans
    .filter((p) => p && p.id && p.next_price_paise && p.next_price_at)
    .map((p) => ({ id: p.id, text: inr(p.next_price_paise) + ' from ' + onDate(p.next_price_at) }));
}

/** The band's facts, or null when there is nothing honest to announce:
 *  the cheapest PAID tier that is rising carries the headline, and a
 *  rise already fired (`now` past its instant) draws no band. */
export function priceRiseBand(notice, now) {
  if (!notice || !Array.isArray(notice.plans)) return null;
  const rise = notice.plans.find((p) => p && p.id && p.id !== 'free' && p.next_price_paise && p.next_price_at);
  if (!rise) return null;
  const ends = new Date(rise.next_price_at).getTime();
  if (!(ends > now)) return null;
  const seatsTotal = Number(notice.seats_total);
  const seatsTaken = Number(notice.seats_taken);
  const capped = Number.isFinite(seatsTotal) && seatsTotal > 0;
  return {
    ends,
    line: inr(rise.price_paise) + ' today. ' + inr(rise.next_price_paise) + ' from ' + onDate(rise.next_price_at)
      + (capped ? ' — or once ' + seatsTotal.toLocaleString('en-IN') + ' people have joined, whichever comes first.' : '.'),
    seats: capped && Number.isFinite(seatsTaken)
      ? seatsTaken.toLocaleString('en-IN') + ' of ' + seatsTotal.toLocaleString('en-IN') + ' taken'
      : ''
  };
}

/** Which text a [data-open-text]/[data-off-text] node shows: signed in
 *  wins over purchases off; '' means leave the markup's own words. */
export function swappedText({ openText, offText }, { signedIn, off }) {
  return signedIn && openText ? openText : (off ? offText : '');
}

export default {
  INVITE_PLAN_KEY, cleanPlanId, stashPlan, readPlanStash, clearPlanStash, takeAuthError, isAppPage, buyHref,
  validEmail, consentText, consentedVoices, voiceByline, filmByline, inr, onDate, timeLeft, risingTiers,
  priceRiseBand, swappedText
};
