/* ============================================================
   WRITING GOALS — the merge of two copies, PURE
   ------------------------------------------------------------
   Lifted out of cloud.js (31 Oct 2026) so the Drive store
   (src/lib/drive-store.js), which may not import cloud.js or
   store.js, runs exactly the same merge. No imports, no storage.
   ============================================================ */
/* A scope whose value is a HISTORY (per-day entries) cannot use the
   whole-blob last-writer-wins rule below: two devices that each wrote a
   different day would have one of them erased. For these scopes the
   pull and the live handler MERGE the two copies instead.
   `fms_write_goals_v1` is { v, goal, days: { 'YYYY-MM-DD': {w0,p0,w,p} } }:
   days are unioned; a day both devices have keeps the entry that
   recorded more writing (w - w0), the remote on a tie; the goal follows
   whichever side wins the clock. Pure, and returns canonical JSON text
   (sorted days) so "did anything change" is a string comparison. */
export function mergeWriteGoals(localRaw, remoteRaw, localWins) {
  const parse = (r) => { try { const o = typeof r === 'string' ? JSON.parse(r) : r; return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const L = parse(localRaw), R = parse(remoteRaw);
  const ld = L.days && typeof L.days === 'object' ? L.days : {};
  const rd = R.days && typeof R.days === 'object' ? R.days : {};
  const written = (d) => (d && Number.isFinite(d.w - d.w0)) ? d.w - d.w0 : -Infinity;
  const days = {};
  for (const k of [...new Set([...Object.keys(ld), ...Object.keys(rd)])].sort()) {
    if (!(k in ld)) days[k] = rd[k];
    else if (!(k in rd)) days[k] = ld[k];
    else days[k] = written(ld[k]) > written(rd[k]) ? ld[k] : rd[k];
  }
  const goal = (localWins ? L.goal || R.goal : R.goal || L.goal);
  const out = { v: 1, days };
  if (goal) out.goal = goal;
  return JSON.stringify(out);
}
