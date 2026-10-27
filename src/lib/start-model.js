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
const APP_PAGE = /^(?!(?:invite|start|privacy|terms|refund|screening|purchase|pricing|contact|about|product-[\w-]+|guides|guide-[\w-]+|compare-[\w-]+|trust)(?:\.html)?(?:[?#]|$))[\w-]+\.html(?:[?#]|$)/;
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
/* THE DAY IS INDIA'S, NOT THE READER'S. The rise instant is 23:59 IST
   on its day (2026-10-31T18:29Z), and effective_price() turns at that
   instant for everybody. Formatted in the browser's own zone, a reader
   in Singapore saw "1 November" — and on 1 November they were already
   paying the new price. So the date is always the Asia/Kolkata day,
   which is the one the server's clock means. */
export const RISE_ZONE = 'Asia/Kolkata';
export const onDate = (iso) => {
  const d = new Date(iso);
  if (isNaN(d)) return '';
  try { return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', timeZone: RISE_ZONE }); }
  catch (e) {
    /* no Intl zone data: shift to IST by hand (no DST there) */
    const ist = new Date(d.getTime() + 330 * 60000);
    return ist.getUTCDate() + ' ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August',
      'September', 'October', 'November', 'December'][ist.getUTCMonth()];
  }
};
export function timeLeft(ms) {
  if (!(ms > 0)) return '';
  const mins = Math.floor(ms / 60000), hrs = Math.floor(mins / 60), days = Math.floor(hrs / 24);
  if (days >= 1) return days + 'd ' + (hrs % 24) + 'h left';
  if (hrs >= 1) return hrs + 'h ' + (mins % 60) + 'm left';
  return Math.max(1, mins) + 'm left';
}

/* THE DEVICE'S MARKET, read raw. `fms_region_v1` ('IN' | 'INT') is
   written by Settings → Region (src/lib/region.js, which a public page
   may not import); it is the second voice in pricingCurrency() after the
   buyer's own pick. Read only, never written here. */
export const REGION_KEY = 'fms_region_v1';
export function deviceRegion() {
  try { return localStorage.getItem(REGION_KEY) || ''; } catch (e) { return ''; }
}

/* HOW A RISE IS PRINTED. Rupees by default (the notice's own paise); a
   page showing dollars passes `money` = { now(p), next(p) }, each a
   string or '' for "nothing to say" (price-model.js builds it from
   price_notice('USD')). A plan whose `next` is '' is not rising in the
   currency on screen. */
const RUPEES = { now: (p) => inr(p.price_paise), next: (p) => inr(p.next_price_paise) };

/** The plans in a notice that carry a coming price, each with the text
 *  drawn beside its current one. */
export function risingTiers(notice, money = RUPEES) {
  if (!notice || !Array.isArray(notice.plans)) return [];
  return notice.plans
    .filter((p) => p && p.id && p.next_price_paise && p.next_price_at && money.next(p))
    .map((p) => ({ id: p.id, text: money.next(p) + ' a year after ' + onDate(p.next_price_at) + ' (IST)' }));
}

/** The band's facts, or null when there is nothing honest to announce:
 *  the cheapest PAID tier that is rising carries the headline, and a
 *  rise already fired (`now` past its instant) draws no band.
 *
 *  Worded as a FOUNDING PRICE, not a countdown (launch study, 21 Oct
 *  2026): what it costs now, what it costs after, the seat condition
 *  when the server publishes one, and what a purchase made today buys.
 *  The rise instant is 23:59 IST on its day, so "until <day>" and
 *  "after <day>" are both true of it. No urgency words. `money` picks
 *  the figures (rupees by default, dollars from price-model riseMoney). */
export function priceRiseBand(notice, now, money = RUPEES) {
  if (!notice || !Array.isArray(notice.plans)) return null;
  const rise = notice.plans.find((p) => p && p.id && p.id !== 'free' && p.next_price_paise && p.next_price_at && money.next(p));
  if (!rise) return null;
  const ends = new Date(rise.next_price_at).getTime();
  if (!(ends > now)) return null;
  const seatsTotal = Number(notice.seats_total);
  const seatsTaken = Number(notice.seats_taken);
  const capped = Number.isFinite(seatsTotal) && seatsTotal > 0;
  return {
    ends,
    line: 'Founding price ' + money.now(rise) + ' a year until ' + onDate(rise.next_price_at) + ' (IST). '
      + money.next(rise) + ' a year after that'
      + (capped ? ', or once ' + seatsTotal.toLocaleString('en-IN') + ' people have bought a plan, whichever comes first.' : '.')
      + ' A plan bought now is a full year at the price you paid.',
    seats: capped && Number.isFinite(seatsTaken)
      ? seatsTaken.toLocaleString('en-IN') + ' of ' + seatsTotal.toLocaleString('en-IN') + ' founding places taken'
      : ''
  };
}

/** The band's quiet second chip: how long the founding price holds, in
 *  minutes at the finest ('' once it has passed). */
export function foundingLeft(ms) {
  const t = timeLeft(ms);
  return t ? t.replace(/ left$/, '') + ' more at the founding price' : '';
}

/* ---- the price TODAY ---------------------------------------------
   The build stamps LIST_PRICE (plans.js: the price BEFORE any rise) into
   the cards, the comparison table and every "from about ₹X a day". Once
   effective_price() turns — on the date, or on the buyer that fills the
   cap, so no rebuild can be timed for it — price_notice() still reports
   each plan's CURRENT price_paise while next_price_* go null. These
   helpers are what lets the page say that figure instead of the stale
   one. plans.js cannot be imported here (CORE; the startlib trap), so
   perDayOf() restates its per-day arithmetic in paise, and
   test:marketing asserts the two agree for every whole rupee figure. */
export const PLAN_DAYS = 365;
/** ₹ a day for a year's price in paise: "₹1.64". Same rounding as
 *  plans.js perDay() (nearest paisa). */
export const perDayOf = (paise) => '₹' + (Math.round((Number(paise) || 0) / PLAN_DAYS) / 100).toFixed(2);

/** Each PAID plan's current figures from a notice:
 *  [{ id, paise, price: '₹999', day: '₹2.74' }]. Only plans with a real
 *  positive price_paise; anything else leaves the markup alone. */
export function currentPrices(notice) {
  if (!notice || !Array.isArray(notice.plans)) return [];
  return notice.plans
    .filter((p) => p && typeof p.id === 'string' && p.id && p.id !== 'free'
      && typeof p.price_paise === 'number' && Number.isFinite(p.price_paise) && p.price_paise > 0)
    .map((p) => ({ id: p.id, paise: p.price_paise, price: inr(p.price_paise), day: perDayOf(p.price_paise) }));
}
/** The cheapest current plan's per-day figure, or '' when unknown. */
export function fromDayNow(notice) {
  const ps = currentPrices(notice);
  if (!ps.length) return '';
  return perDayOf(Math.min(...ps.map((p) => p.paise)));
}
/* The stamped "from (about) ₹X a day" figure in a piece of text, or ''. */
const FROM_DAY = /\bfrom (?:about )?(₹\d+\.\d{2}) a day\b/;
export const stampedFromDay = (text) => { const m = FROM_DAY.exec(String(text || '')); return m ? m[1] : ''; };
/** `text` with every whole occurrence of the figure `was` replaced by
 *  `now`. Whole means not followed by another digit, so ₹599 never
 *  rewrites the front of ₹5990. */
export function swapFigure(text, was, now) {
  const s = String(text);
  if (!was || was === now) return s;
  const esc = was.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.replace(new RegExp(esc + '(?![\\d.,]*\\d)', 'g'), now);
}

/** Which text a [data-open-text]/[data-off-text] node shows: signed in
 *  wins over purchases off; '' means leave the markup's own words. */
export function swappedText({ openText, offText }, { signedIn, off }) {
  return signedIn && openText ? openText : (off ? offText : '');
}

/* ---- the launch pass, as the public pages say it (27 Oct 2026) -----
   The free trial is retired for the public; the pages offer the launch
   PASS instead, and every figure in it is the server's: trial_offer()'s
   `pass` block, read through src/lib/pass-offer.js. This file stays pure
   (no module of its own), so the formatters come in as the second argument (the
   pass-offer module itself, or anything with the same four functions):

     passCopy(passState(raw, now, readAt), PassOffer)

   answers what each runtime slot shows:
     { open, price, length, timer, left, spoken }
   `open` false means show nothing of the pass (the markup's fallback
   copy, the yearly plans, stands). `timer` is '' with no deadline, and
   then no timer is drawn. `spoken` is the same deadline to the MINUTE
   ("3 days 4 hours 12 minutes"), for the band's accessible label, so a
   screen reader is never handed a figure that changes every second. */
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
/** "3 days 4 hours 12 minutes", to the minute; '' for nothing. */
export function spokenLeft(msLeft) {
  if (msLeft == null || !(msLeft > 0)) return '';
  const m = Math.max(1, Math.floor(msLeft / 60000));
  const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60), mm = m % 60;
  return [d && plural(d, 'day'), h && plural(h, 'hour'), mm && plural(mm, 'minute')].filter(Boolean).join(' ');
}
export function passCopy(st, P) {
  const none = { open: false, price: '', length: '', timer: '', left: '', spoken: '' };
  if (!st || st.state !== 'open' || !st.pass || !P) return none;
  const price = P.passPrice(st.pass), length = P.passLength(st.pass);
  if (!price || !length) return none;
  return { open: true, price, length, timer: P.countdownText(st.msLeft), left: P.leftText(st), spoken: spokenLeft(st.msLeft) };
}

export default {
  passCopy, spokenLeft,
  INVITE_PLAN_KEY, REGION_KEY, deviceRegion, cleanPlanId, stashPlan, readPlanStash, clearPlanStash, takeAuthError, isAppPage, buyHref,
  validEmail, consentText, consentedVoices, voiceByline, filmByline, inr, onDate, timeLeft, risingTiers,
  priceRiseBand, foundingLeft, swappedText, RISE_ZONE, PLAN_DAYS, perDayOf, currentPrices, fromDayNow, stampedFromDay, swapFigure
};
