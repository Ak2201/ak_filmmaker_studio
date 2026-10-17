/* ============================================================
   CHROME BANNER — the site announcement, without the bar
   ------------------------------------------------------------
   The logic half of src/ui/site-banner.js: schema §45's
   site_announcement_now(), asked with ONE plain request (no SDK, the
   public anon key — RLS and the function itself are the boundary, like
   the start page's counters, so a signed-out first load still fetches
   no supabase-* chunk), and the two per-tab keys it is remembered by.

     fms_banner_v1       { at, row|null } for this browser session
     fms_banner_seen_v1  the id of a banner dismissed this session

   sessionStorage only, every call answered rather than thrown; nothing
   is ever written to localStorage. WHEN the cache is written is the
   view's decision (on pagehide — verify counts idle writes), so this
   only offers the write.
   ============================================================ */
import { session } from './prefs.js';

const CACHE_KEY = 'fms_banner_v1';
const SEEN_KEY = 'fms_banner_seen_v1';

/** Is this row live now? (text, inside its window) */
export function bannerLive(row, now = Date.now()) {
  if (!row || !row.text) return false;
  if (row.starts_at && Date.parse(row.starts_at) > now) return false;
  if (row.ends_at && Date.parse(row.ends_at) <= now) return false;
  return true;
}

/** Was this banner dismissed in this browser session? */
export const bannerSeen = (row) => session.readText(SEEN_KEY) === String(row.id);
/** Dismissed, for the rest of the session. */
export const markBannerSeen = (row) => { session.writeText(SEEN_KEY, String(row.id)); };

/** The session's cached answer ({ at, row }), or undefined. */
export function readBannerCache() {
  const raw = session.readText(CACHE_KEY);
  if (!raw) return undefined;
  try { const c = JSON.parse(raw); return c && typeof c === 'object' && 'row' in c ? c : undefined; } catch (e) { return undefined; }
}
export const saveBannerCache = (entry) => { session.writeText(CACHE_KEY, JSON.stringify(entry)); };
/** Forget the cache and the dismissal (the console set a new banner). */
export function forgetBanner() {
  session.removeKey(CACHE_KEY);
  session.removeKey(SEEN_KEY);
}

/** Ask the server. Answers the row, null for "no banner", or undefined
 *  for "could not ask" (no project in this build, §45 not run, a
 *  network fault) — the view says nothing on undefined. May reject on
 *  a network error; the caller treats that as no banner. */
export async function fetchBannerRow() {
  const cloud = typeof window !== 'undefined' ? window.StudioCloud : null;
  const cfg = cloud && cloud.getCfg && cloud.getCfg();
  if (!cfg || !cfg.url || !cfg.key) return undefined;     // no project: no banner, no request
  const res = await fetch(String(cfg.url).replace(/\/+$/, '') + '/rest/v1/rpc/site_announcement_now', {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: 'Bearer ' + cfg.key, 'Content-Type': 'application/json', Accept: 'application/json' },
    body: '{}',
    credentials: 'omit'
  });
  if (!res.ok) return undefined;                           // §45 not run, or a network fault: say nothing
  const data = await res.json();
  return data && typeof data === 'object' && data.text ? data : null;
}

export default { bannerLive, bannerSeen, markBannerSeen, readBannerCache, saveBannerCache, forgetBanner, fetchBannerRow };
