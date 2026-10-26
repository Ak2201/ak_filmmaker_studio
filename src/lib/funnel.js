/* ============================================================
   FUNNEL — first-party daily counts, and the launch-offers lead
   ------------------------------------------------------------
   Schema §29. Plain fetch() to PostgREST with the public anon key, so
   the start page never loads the Supabase SDK on first paint (the
   `supabase-*` chunk is a budget failure). Both calls are fire-and-
   forget for counts: a counter that errors is a counter nobody misses.

   What a count carries: an event NAME, and since §58 an optional SOURCE
   bucket from a fixed list (below). Nothing else — the database column set is (day, name,
   source, count). No id, no cookie, no localStorage.

   Who is not counted: Do-Not-Track, Global Privacy Control, and anyone
   who pressed "Don't count this visit" (sessionStorage only — a new
   localStorage key would have to join ALL_KEYS and the backup story for
   a flag worth one sitting; closing the tab forgets it, DNT/GPC never do).
   ============================================================ */
/* Named directly so Vite inlines just these two strings; the try keeps
   the module importable from Node, where import.meta.env is undefined. */
let URL_ = '', KEY_ = '';
try { URL_ = String(import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, ''); } catch (e) { /* */ }
try { KEY_ = String(import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim(); } catch (e) { /* */ }
const OPT_OUT = 'fms_no_analytics_session';

export const configured = () => !!(URL_ && KEY_);

export function optedOut() {
  try {
    if (navigator.doNotTrack === '1' || window.doNotTrack === '1' || navigator.globalPrivacyControl === true) return true;
  } catch (e) { /* */ }
  try { return sessionStorage.getItem(OPT_OUT) === '1'; } catch (e) { return false; }
}
export function optOut() { try { sessionStorage.setItem(OPT_OUT, '1'); } catch (e) { /* */ } }

async function rpc(name, args) {
  const r = await fetch(`${URL_}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: KEY_, Authorization: 'Bearer ' + KEY_ },
    body: JSON.stringify(args),
    credentials: 'omit',
    referrerPolicy: 'no-referrer'
  });
  if (!r.ok) {
    let m = ''; try { m = (await r.json()).message || ''; } catch (e) { /* */ }
    const err = new Error(m || ('HTTP ' + r.status)); err.status = r.status; throw err;
  }
  /* The body, for the one caller that wants it. The counters ignore it.
     A 204 and an empty body both read as null rather than throwing. */
  try { return await r.json(); } catch (e) { return null; }
}

/* ---- §58: where the visit came from, as an AGGREGATE bucket -----------
   A source is one word from a FIXED LIST, counted per day beside the
   event name and nothing else. sourceBucket() maps whatever it is given
   onto that list ('insta' and 'Instagram' are 'instagram', 'newsletter'
   is 'email') and ANYTHING NOT ON IT becomes 'other'. It does not tidy
   free text into the server's pattern: tidied, 'kasi.v@example.com' is
   'kasi-v-example-com', which passes ^[a-z0-9_-]{1,32}$ and names a
   person. The pattern on the server is a second fence, not the first.

   THE SOURCE OF A VISIT HAS ONE WRITER: src/lib/attribution.js
   (captureAttribution(), run on the public pages) keeps { ref, src } for
   the tab in sessionStorage under ATTRIB_KEY. funnelSource() reads that
   record BY ITS KEY STRING, so this file still imports nothing, and reads
   `src` only, never `ref`: a referral code (REF-XXXXXX) names one member,
   which is exactly what an aggregate counter must not hold. If
   attribution.js ever renames ATTRIB_KEY, change it here too (test:funnel
   asserts the two agree whenever attribution.js exists).

   IMPORT-FREE ON PURPOSE: this file is in the `startlib` chunk
   (vite.config.js), which CORE and the landing page share. */
export const ATTRIB_KEY = 'fms_attrib_session';
const KNOWN_SOURCES = Object.freeze({
  google: 'google', bing: 'bing', duckduckgo: 'duckduckgo', ddg: 'duckduckgo', yahoo: 'yahoo',
  instagram: 'instagram', insta: 'instagram', ig: 'instagram',
  facebook: 'facebook', fb: 'facebook',
  youtube: 'youtube', yt: 'youtube',
  twitter: 'x', x: 'x',
  linkedin: 'linkedin',
  whatsapp: 'whatsapp', wa: 'whatsapp',
  telegram: 'telegram',
  reddit: 'reddit', threads: 'threads', pinterest: 'pinterest',
  producthunt: 'producthunt',
  email: 'email', mail: 'email', newsletter: 'email',
  podcast: 'podcast', partner: 'partner', affiliate: 'partner', event: 'event', festival: 'event'
});
/** The buckets a count can carry, for the console and the tests. */
export const SOURCES = Object.freeze([...new Set(Object.values(KNOWN_SOURCES)), 'other']);
/** '' for nothing; a name from the fixed list; 'other' for anything else. */
export function sourceBucket(raw) {
  if (raw == null) return '';
  const s = String(raw).trim().toLowerCase();
  if (!s) return '';
  return Object.prototype.hasOwnProperty.call(KNOWN_SOURCES, s) ? KNOWN_SOURCES[s] : 'other';
}
/** This tab's source bucket, from attribution.js's record; '' when none. */
export function funnelSource() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ATTRIB_KEY) || 'null');
    return v && typeof v === 'object' ? sourceBucket(v.src) : '';
  } catch (e) { return ''; }
}

/* A server that has not run §58 has only bump_event(p_name): the two-
   argument call answers 404 / PGRST202. Then the count goes again
   without its source, and this page stops asking with one. */
let twoArg = true;
const isMissingRpc = (e) => !!e && (e.status === 404 || /PGRST202|Could not find|does not exist/i.test(String(e.message || '')));

/** Fire and forget. Never throws, never awaits anything the caller needs.
 *  `source` (optional) is bucketed; left out, the session's own is used. */
export function bumpEvent(name, source) {
  if (!configured() || optedOut()) return;
  const src = source === undefined ? funnelSource() : sourceBucket(source);
  try {
    if (src && twoArg) {
      rpc('bump_event', { p_name: name, p_source: src }).catch((e) => {
        if (!isMissingRpc(e)) return;
        twoArg = false;
        rpc('bump_event', { p_name: name }).catch(() => {});
      });
    } else {
      rpc('bump_event', { p_name: name }).catch(() => {});
    }
  } catch (e) { /* */ }
}

/** Once per browser session per name. */
export function bumpOnce(name, source) {
  if (!configured() || optedOut()) return;
  const k = 'fms_funnel_' + name;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { /* storage blocked: count once per load */ }
  bumpEvent(name, source);
}

/* The four steps §58 added, named so a call site reads as what happened.
   Each counts once per browser session, like the page views. */
export const countSignIn = (source) => bumpOnce('signin_done', source);
export const countSampleOpen = (source) => bumpOnce('sample_open', source);
export const countTrialStart = (source) => bumpOnce('trial_start', source);
export const countPlanViewInApp = (source) => bumpOnce('plan_view_in_app', source);

/** The launch-offers form. Rejects with a sentence fit to show. */
export async function addLead(email, consentText, source = 'start') {
  if (!configured()) throw new Error('Sign-up is not open on this build yet.');
  try { await rpc('add_lead', { p_email: email, p_consent: consentText, p_source: source }); }
  catch (e) {
    if (e.status === 429 || /too many/i.test(e.message)) throw new Error('Too many sign-ups just now. Please try again in a little while.');
    if (/e-mail address/i.test(e.message)) throw new Error('That does not look like an e-mail address.');
    throw new Error('Could not save that just now. Check your connection and try again.');
  }
}

/** The prices, and any scheduled rise, for the signed-out landing page.
 *  §30's price_notice() — anon-callable, one narrow fact per plan.
 *
 *  WHY IT IS HERE and not in billing.js: billing.js goes through the
 *  Supabase SDK, which is a ~98 KB chunk that must never be fetched on
 *  start.html (prove:growth asserts exactly that, and the first-paint
 *  budget would fail by name). This file already owns the plain-fetch
 *  pattern for precisely that reason.
 *
 *  NEVER THROWS. The page ships the current prices in its markup; this
 *  only ever ADDS the coming ones. A failure here must leave a correct
 *  page, not a broken one — so the caller gets null and shows nothing.
 *
 *  Not gated on optedOut(): this is a price list, not a count. Someone
 *  who has asked not to be counted still deserves to be told what the
 *  thing costs. */
export async function priceNotice(currency) {
  if (!configured()) return null;
  /* price_notice(text) (§31/§56) for a currency: the same rupee keys plus
     that currency's display figures and `usd_checkout`. */
  try { return await rpc('price_notice', currency ? { p_currency: currency } : {}); } catch (e) { return null; }
}

/** §32's purchases_required(): true, false, or null when it is not
 *  known (unconfigured, offline, or a database that has not run §32).
 *  NEVER THROWS, and null means "as before": the page's pricing, which
 *  is in the markup, stands. Only an explicit false hides it. */
export async function purchasesRequired() {
  if (!configured()) return null;
  try { const v = await rpc('purchases_required', {}); return typeof v === 'boolean' ? v : null; } catch (e) { return null; }
}

/** §33's trial_offer(): { trial_enabled, trial_minutes, trial_hours,
 *  purchase_required } for the landing page's "Free trial" card, or
 *  null when it is not known (unconfigured, offline, a database that
 *  has not run §33). NEVER THROWS; null leaves the markup's own words. */
export async function trialOffer() {
  if (!configured()) return null;
  try { const v = await rpc('trial_offer', {}); return v && typeof v === 'object' && typeof v.trial_enabled === 'boolean' ? v : null; } catch (e) { return null; }
}

export default { bumpEvent, bumpOnce, sourceBucket, funnelSource, SOURCES, countSignIn, countSampleOpen, countTrialStart, countPlanViewInApp, addLead, optedOut, optOut, configured, priceNotice, purchasesRequired, trialOffer };
