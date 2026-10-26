/* ============================================================
   FUNNEL — first-party daily counts, and the launch-offers lead
   ------------------------------------------------------------
   Schema §29. Plain fetch() to PostgREST with the public anon key, so
   the start page never loads the Supabase SDK on first paint (the
   `supabase-*` chunk is a budget failure). Both calls are fire-and-
   forget for counts: a counter that errors is a counter nobody misses.

   What a count carries: an event NAME, and since §58 an optional SOURCE
   bucket (below). Nothing else — the database column set is (day, name,
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
   A source is a short label the attribution layer derives from ?ref= or
   ?utm_source= ('google', 'instagram', 'newsletter-oct'), counted per day
   beside the event name and nothing else. sourceBucket() reduces whatever
   it is given to the server's own pattern, ^[a-z0-9_-]{1,32}$, or '' — so
   an address, a URL or free text never leaves the browser as a source.

   setFunnelSource() records the bucket for THIS browser session
   (sessionStorage, like the once-per-session flags below; no
   localStorage key), so a count fired later on another page — a trial
   started on the hub, a purchase — carries the source the visit arrived
   with. An explicit `source` argument wins over it.

   IMPORT-FREE ON PURPOSE: this file is in the `startlib` chunk
   (vite.config.js), which CORE and the landing page share. The caller
   passes the source in; nothing here imports the attribution module. */
const SOURCE_KEY = 'fms_funnel_src_v1';
export function sourceBucket(raw) {
  if (raw == null) return '';
  const s = String(raw).toLowerCase().trim()
    .replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-')
    .replace(/^[-_]+/, '').slice(0, 32).replace(/[-_]+$/, '');
  return /^[a-z0-9_-]{1,32}$/.test(s) ? s : '';
}
export function setFunnelSource(raw) {
  const b = sourceBucket(raw);
  try { if (b) sessionStorage.setItem(SOURCE_KEY, b); } catch (e) { /* storage blocked: explicit sources still work */ }
  return b;
}
export function funnelSource() {
  try { return sourceBucket(sessionStorage.getItem(SOURCE_KEY)); } catch (e) { return ''; }
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

export default { bumpEvent, bumpOnce, sourceBucket, setFunnelSource, funnelSource, countSignIn, countSampleOpen, countTrialStart, countPlanViewInApp, addLead, optedOut, optOut, configured, priceNotice, purchasesRequired, trialOffer };
