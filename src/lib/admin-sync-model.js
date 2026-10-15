/* ============================================================
   ADMIN SYNC MODEL — the Sync & storage tab's derivations
   ------------------------------------------------------------
   Pure: admin_sync_overview() / admin_limit_pressure() answers in,
   comparisons and rows out (src/pages/admin-tabs/sync.js draws them).
   THE SCOPE DIFF is decided here: the scopes the running client can
   write against the scopes the project_data CHECK allows.
   ============================================================ */
export { fmtBytes } from './admin-format.js';

export const METRIC = { projects: 'Films', shares: 'Share links', collaborators: 'Collaborators', seats: 'Seats', storage_bytes: 'Storage' };
export const CODE = {
  '23514': 'A CHECK refused it (an unknown kind of data)', '42501': 'Row security refused it', P0401: 'Not a studio member',
  P0402: 'A plan limit', P0429: 'Rate limit', '23505': 'A conflict', PGRST202: 'Function missing', network: 'The request never arrived', other: 'Something else'
};

/** The scope names the running client can write (StudioCloud.KEY_BY_SCOPE's keys), sorted. */
export function clientScopes(keyByScope) {
  return Object.keys(keyByScope || {}).sort();
}

/** Client against database: { client, allowed, ahead, unknownToClient, inUseBad, reportBad }.
    `ahead` is what this build saves and the CHECK refuses (the §37 incident). */
export function scopeDiff(client, d) {
  const allowed = d.allowed_scopes || [];
  return {
    client,
    allowed,
    ahead: client.filter((s) => !allowed.includes(s)),
    unknownToClient: allowed.filter((s) => !client.includes(s)),
    inUseBad: d.in_use_not_allowed || [],
    reportBad: d.reportable_not_allowed || []
  };
}

/** Members by last sync, as bar items. */
export function syncBuckets(d) {
  const b = d.last_sync_buckets || {};
  return [
    { label: 'Within a day', value: b.under_1d }, { label: '1 to 7 days', value: b.d1_to_7 }, { label: '7 to 30 days', value: b.d7_to_30 },
    { label: 'Over 30 days', value: b.over_30d }, { label: 'Never synced', value: b.never }
  ].map((i) => ({ ...i, value: Number(i.value) || 0 }));
}

/** Refusals summed by code, largest first, each with its meaning. */
export function refusalsByCode(rows) {
  const byCode = {};
  for (const r of rows) byCode[r.code] = (byCode[r.code] || 0) + (Number(r.count) || 0);
  return Object.entries(byCode).sort((a, b) => b[1] - a[1]).map(([c, v]) => ({ label: c, value: v, note: CODE[c] || '' }));
}

/** Refused saves per day, as numbers. */
export const refusalsPerDay = (e) => (e.by_day || []).map((x) => Number(x.count) || 0);

/** An account's meters at or above the threshold. */
export const metersOver = (r, threshold) => (r.metrics || []).filter((m) => Number(m.pct) >= (threshold || 80));

export default { METRIC, CODE, clientScopes, scopeDiff, syncBuckets, refusalsByCode, refusalsPerDay, metersOver };
