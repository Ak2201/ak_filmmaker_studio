/* ============================================================
   THE FIRST-SIGN-IN TOUR: reading the server's answer
   ------------------------------------------------------------
   Owner, 31 Oct 2026: the first time an account EVER signs in, on any
   device, the studio tour starts by itself. "Ever" cannot be a device
   fact (a new laptop is not a new account), so it is a server flag on
   the account: tour_status() says whether the tour has started for it,
   and mark_tour_started() sets it and says whether THIS call was the one
   that set it — true exactly once, across every device and tab, which is
   what makes two devices signing in at once safe.

   PURE: no storage, no DOM, no SDK. cloud.js passes its rpc and acts on
   the answer; test:account-tour drives this file in Node.

   IT FAILS CLOSED, the opposite of entitlement() and for the opposite
   reason: a tour that starts when it should not have is a stranger's
   page navigated away from under them, while one that does not start
   costs nothing — the account menu and Settings both have it. So:
   an error, an absent function (the schema section not yet run live),
   no client, a signed-out `started: null` or any shape this file does
   not recognise means DO NOT START AND DO NOT MARK. Only an explicit
   "not started" is followed by the mark, and only an explicit "you were
   first" starts anything.

   Two shapes are accepted for each reply, because the two specs that
   name these RPCs wrote them differently (the UX spec: {started} and
   {started, first}; the server spec: {started_at, finished_at} and a
   bare boolean). Either is read; anything else is "unknown".
   ============================================================ */

const one = (d) => (Array.isArray(d) ? (d.length === 1 ? d[0] : null) : d);

/** tour_status() → true (started), false (never started), null (unknown). */
export function parseTourStatus(data) {
  const d = one(data);
  if (!d || typeof d !== 'object') return null;
  if (typeof d.started === 'boolean') return d.started;
  if ('started' in d) return null;                       // signed out: {started: null}
  if ('started_at' in d) return d.started_at != null && d.started_at !== '';
  return null;
}

/** mark_tour_started() → true (this call set the flag), false, null (unknown). */
export function parseMarkTour(data) {
  const d = one(data);
  if (typeof d === 'boolean') return d;
  if (d && typeof d === 'object') {
    if (typeof d.first === 'boolean') return d.first;
    if (typeof d.mark_tour_started === 'boolean') return d.mark_tour_started;
  }
  return null;
}

/** The function is not on this database (PostgREST PGRST202, Postgres 42883):
 *  a settled "no", asked again only in a later browser session. */
export function isMissingFn(err) {
  const c = String((err && err.code) || '');
  return c === 'PGRST202' || c === '42883' || (err && err.status === 404);
}

/**
 * Ask, and mark when the answer is "never started".
 * `rpc(name)` resolves to `{ data, error }` (the supabase-js shape).
 * Resolves `{ start, settled }`: `start` — begin the tour now;
 * `settled` — the server gave a definite answer, so this browser session
 * need not ask again. Never throws.
 */
export async function firstTourCheck(rpc) {
  if (typeof rpc !== 'function') return { start: false, settled: false };
  let r;
  try { r = await rpc('tour_status'); } catch (e) { return { start: false, settled: false }; }
  if (!r || r.error) return { start: false, settled: !!(r && isMissingFn(r.error)) };
  const started = parseTourStatus(r.data);
  if (started !== false) return { start: false, settled: started === true };
  let m;
  try { m = await rpc('mark_tour_started'); } catch (e) { return { start: false, settled: false }; }
  if (!m || m.error) return { start: false, settled: !!(m && isMissingFn(m.error)) };
  const first = parseMarkTour(m.data);
  return { start: first === true, settled: first !== null };
}

export default { parseTourStatus, parseMarkTour, isMissingFn, firstTourCheck };
