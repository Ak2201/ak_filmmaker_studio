/* ============================================================
   BEAT PAGE BASIS — src/lib/beat-basis.js
   ------------------------------------------------------------
   ONE rule for where a framework's beats land, on every page that
   places them (owner, 27 Oct 2026): the writer's TARGET length when
   one is set, else the script AS WRITTEN. The beats panel on the
   Screenplay Writer and Script analysis used to disagree because the
   panel padded an unset target with a guess (~110 pages for a feature)
   while the analysis read the script. A target is minutes, and a page
   is a minute, so the target is already a page count.

   PURE and import-free: no model, no storage. Stores nothing.
   ============================================================ */

/** @returns {{pages:number, basis:'target'|'script'}} pages is whole, >= 1 */
export function beatPageBasis({ targetPages = 0, scriptPages = 0 } = {}) {
  const t = Number(targetPages);
  if (t > 0) return { pages: Math.max(1, Math.round(t)), basis: 'target' };
  const s = Number(scriptPages);
  return { pages: Math.max(1, Math.round(s > 0 ? s : 0)), basis: 'script' };
}

/** The one line each view prints under its beats. */
export function beatBasisText(b) {
  return b.basis === 'target'
    ? 'Beats placed against your ' + b.pages + '-page target'
    : 'Beats placed against the script as written, ' + b.pages + (b.pages === 1 ? ' page' : ' pages');
}

export default { beatPageBasis, beatBasisText };
