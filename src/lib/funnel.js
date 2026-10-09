/* ============================================================
   FUNNEL — first-party daily counts, and the launch-offers lead
   ------------------------------------------------------------
   Schema §29. Plain fetch() to PostgREST with the public anon key, so
   the start page never loads the Supabase SDK on first paint (the
   `supabase-*` chunk is a budget failure). Both calls are fire-and-
   forget for counts: a counter that errors is a counter nobody misses.

   What a count carries: an event NAME. Nothing else — the database
   column set is (day, name, count). No id, no cookie, no localStorage.

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

/** Fire and forget. Never throws, never awaits anything the caller needs. */
export function bumpEvent(name) {
  if (!configured() || optedOut()) return;
  try { rpc('bump_event', { p_name: name }).catch(() => {}); } catch (e) { /* */ }
}

/** Once per browser session per name. */
export function bumpOnce(name) {
  if (!configured() || optedOut()) return;
  const k = 'fms_funnel_' + name;
  try { if (sessionStorage.getItem(k)) return; sessionStorage.setItem(k, '1'); } catch (e) { /* storage blocked: count once per load */ }
  bumpEvent(name);
}

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
export async function priceNotice() {
  if (!configured()) return null;
  try { return await rpc('price_notice', {}); } catch (e) { return null; }
}

export default { bumpEvent, bumpOnce, addLead, optedOut, optOut, configured, priceNotice };
