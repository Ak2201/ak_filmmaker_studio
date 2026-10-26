/* ============================================================
   ATTRIBUTION — where this visit came from, for this tab only
   ------------------------------------------------------------
   A link like start.html?ref=FOUNDER50&src=insta (or the utm_* trio)
   names a code and a source. The code has to reach purchase.html's
   "Have a code?" box after a Google round trip that loses the address,
   and the source has to reach the launch-offers form. So both are kept
   for the TAB, in sessionStorage under ONE key, and nowhere else.

   NOT localStorage, on purpose: a localStorage key is a contract with
   saved work (it would have to join ALL_KEYS and the backup story), and
   a referral is worth one sitting. Closing the tab forgets it.

   The rules: the FIRST source wins (the link that brought them, not the
   page they wandered to), the LATEST code wins (a code typed into a
   newer link is the one they mean). A source is bucketed to a short
   lowercase token, which is also the shape add_lead's p_source accepts.

   PURE AND IMPORT-FREE: it sits in vite.config.js's `startlib` chunk
   with funnel.js, shared by the landing pages and CORE-loading pages.
   The day it imports anything, the landing page can pay for the app
   bundle (CLAUDE.md, "A PURE module shared with CORE is swallowed by
   CORE"). Every storage call is wrapped: private mode, blocked storage
   and Node all read as "nothing known" and write nothing.
   ============================================================ */
export const ATTRIB_KEY = 'fms_attrib_session';

/* The shape a promo, referral or affiliate code takes: the same test
   purchase-model.js's linkCode() applied to ?ref= before this existed
   (REF-XXXXXX from ensure_referral_code, or an owner's promo code). */
const REF = /^[A-Za-z0-9_-]{3,40}$/;
/** A code as the server accepts it, upper-cased, or ''. */
export const cleanRef = (v) => {
  const s = String(v == null ? '' : v).trim();
  return REF.test(s) ? s.toUpperCase() : '';
};

/** A source as a short token: lowercase, [a-z0-9_-], at most 32. */
export const bucketSource = (v) => String(v == null ? '' : v).trim().toLowerCase()
  .replace(/[^a-z0-9_-]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '').slice(0, 32).replace(/-+$/, '');

const EMPTY = Object.freeze({ ref: '', src: '', medium: '', campaign: '' });

/** What one address says: { ref, src, medium, campaign }, each '' when
 *  absent or malformed. `src` is ?src=, else utm_source. Pure. */
export function parseAttribution(search) {
  let q;
  try { q = new URLSearchParams(search || ''); } catch (e) { return { ...EMPTY }; }
  return {
    ref: cleanRef(q.get('ref')),
    src: bucketSource(q.get('src') || q.get('utm_source')),
    medium: bucketSource(q.get('utm_medium')),
    campaign: bucketSource(q.get('utm_campaign'))
  };
}

/** The stored record and a new reading, merged: the first source (with
 *  its medium and campaign) stays, the latest code replaces. Pure. */
export function mergeAttribution(prev, next) {
  const p = { ...EMPTY, ...(prev || {}) }, n = { ...EMPTY, ...(next || {}) };
  const keepSrc = !!p.src;
  return {
    ref: n.ref || p.ref,
    src: keepSrc ? p.src : n.src,
    medium: keepSrc ? p.medium : n.medium,
    campaign: keepSrc ? p.campaign : n.campaign
  };
}

function read() {
  try {
    const v = JSON.parse(sessionStorage.getItem(ATTRIB_KEY) || 'null');
    if (!v || typeof v !== 'object') return { ...EMPTY };
    /* re-cleaned on the way out: the tab's storage is not a trusted source */
    return { ref: cleanRef(v.ref), src: bucketSource(v.src), medium: bucketSource(v.medium), campaign: bucketSource(v.campaign) };
  } catch (e) { return { ...EMPTY }; }
}

/** Read this address into the tab's record. Call once per page load.
 *  Writes only when the address carried something new. Never throws. */
export function captureAttribution(loc) {
  let search = '';
  try { search = (loc || globalThis.location || {}).search || ''; } catch (e) { search = ''; }
  const seen = parseAttribution(search);
  if (!seen.ref && !seen.src) return attribution();
  const prev = read();
  const merged = mergeAttribution(prev, seen);
  if (JSON.stringify(merged) !== JSON.stringify(prev)) {
    try { sessionStorage.setItem(ATTRIB_KEY, JSON.stringify(merged)); } catch (e) { /* private mode: this load only */ }
  }
  return { ref: merged.ref, src: merged.src };
}

/** { ref, src } for this tab, '' each when unknown. Never throws. */
export function attribution() {
  const v = read();
  return { ref: v.ref, src: v.src };
}

/** Forget the code (the visitor cleared it, or it was spent). The source
 *  stays: it describes the visit, not the purchase. */
export function clearAttribRef() {
  const v = read();
  if (!v.ref) return;
  try { sessionStorage.setItem(ATTRIB_KEY, JSON.stringify({ ...v, ref: '' })); } catch (e) { /* ignore */ }
}

export default { ATTRIB_KEY, cleanRef, bucketSource, parseAttribution, mergeAttribution, captureAttribution, attribution, clearAttribRef };
