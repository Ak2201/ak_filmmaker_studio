/* ============================================================
   FIT TO PAGE — the "cheat", as arithmetic
   ------------------------------------------------------------
   A production office that needs a script one page shorter does not
   cut a line: it nudges the page. Final Draft calls it a cheat — the
   top and bottom margins come in a little, the line spacing tightens a
   hair — and the same words land on fewer sheets. Done within limits
   nobody reading the page can see, it is routine; done past them it is
   a script that reads as cramped and times out wrong (a page is still
   supposed to be about a minute).

   So the cheat here is BOUNDED and counted in whole LINES, because the
   paginator (src/lib/paginate.js) thinks in lines and 12pt Courier is
   six of them to the inch:

     · margins: up to 0.25in off the top AND the bottom. 1/12in off each
       edge is 1/6in of page, which is exactly one more line — so the
       margin steps are 0, 1, 2 or 3 extra lines, never a fraction;
     · spacing: at most ONE more line per page, by setting the leading
       to (lines)/(lines + 1) of a line — about 2%, invisible.

   Four extra lines is the most the cheat can ever add. It never touches
   the text: the same elements are paginated with a taller body, and the
   print sets the margins and the leading that make that body real.

   PURE: no DOM, no storage. The choice is stored by the page as
   `fitPage` in the device prefs blob (src/lib/chrome-prefs.js), keyed by
   project — an export setting, never part of the script.
   ============================================================ */

/** Inches per line at 12pt, 6 lines to the inch. */
export const LINE_IN = 1 / 6;
/** The most the margins may move, per edge, in inches. */
export const MAX_MARGIN_IN = 0.25;
/** Lines the margin nudge can add: 2 × 0.25in × 6 = 3. */
export const MAX_MARGIN_LINES = Math.round((2 * MAX_MARGIN_IN) / LINE_IN);
/** Lines the leading may add: never more than one per page. */
export const MAX_SPACING_LINES = 1;
/** The whole cheat's ceiling. */
export const MAX_CHEAT_LINES = MAX_MARGIN_LINES + MAX_SPACING_LINES;

/** A stored or typed value as a whole number of extra lines, 0..4. */
export function normaliseCheat(raw) {
  const n = Math.floor(Number(raw && typeof raw === 'object' ? raw.lines : raw));
  return Number.isFinite(n) ? Math.max(0, Math.min(MAX_CHEAT_LINES, n)) : 0;
}

/**
 * What `lines` extra lines mean on paper. The margins go first (they
 * are the less visible of the two), the leading only for the fourth.
 *   bodyLines   what paginate() is told a page holds
 *   marginIn    inches off the top and off the bottom, each
 *   lineHeight  the leading, as a multiple of 12pt (1 = untouched)
 */
export function cheatGeometry(lines, bodyLines) {
  const n = normaliseCheat(lines);
  const m = Math.min(MAX_MARGIN_LINES, n);
  const s = n - m;
  const marginIn = (m * LINE_IN) / 2;
  /* The box after the margin nudge holds PAGE lines + m at full leading;
     one more line in the same box is a leading of (L)/(L + 1). The
     header's two lines are inside the box too, so it is the PAGE count,
     not the body's, that the ratio is taken over. */
  const page = bodyLines + 2 + m;
  return {
    lines: n,
    marginLines: m,
    spacingLines: s,
    bodyLines: bodyLines + n,
    marginIn,
    marginMm: Math.round(marginIn * 25.4 * 100) / 100,
    lineHeight: s ? page / (page + s) : 1
  };
}

/**
 * A page setup's CSS margin ("top right bottom left", any unit pdf.js
 * writes) with `mm` taken off the top and the bottom. The sides never
 * move — the gutter is where a script is punched. A margin that is not
 * four lengths in mm comes back untouched rather than guessed at.
 */
export function shaveMargin(margin, mm) {
  const parts = String(margin || '').trim().split(/\s+/);
  const cut = Number(mm) || 0;
  if (!cut || parts.length !== 4 || !parts.every((p) => /^\d+(\.\d+)?mm$/.test(p))) return margin;
  const v = parts.map((p) => parseFloat(p));
  const r = (x) => String(Math.round(Math.max(0, x) * 100) / 100) + 'mm';
  return [r(v[0] - cut), r(v[1]), r(v[2] - cut), r(v[3])].join(' ');
}

/**
 * Every cheat from none to the ceiling, with the pages each prints on.
 * `countPages(bodyLines)` is the caller's paginator (screenplay-export's
 * paginateDoc, length of) so this module stays free of the format.
 * Returns [{ lines, pages, saved, geometry }]; `saved` is against no
 * cheat at all.
 */
export function fitOptions(countPages, bodyLines) {
  const out = [];
  let base = 0;
  for (let n = 0; n <= MAX_CHEAT_LINES; n++) {
    const g = cheatGeometry(n, bodyLines);
    const pages = countPages(g.bodyLines);
    if (n === 0) base = pages;
    out.push({ lines: n, pages, saved: base - pages, geometry: g });
  }
  return out;
}

/** The smallest cheat that saves the most pages (the useful default to
    offer): the first option whose page count equals the minimum. */
export function bestFit(options) {
  const list = Array.isArray(options) ? options : [];
  if (!list.length) return null;
  const min = Math.min(...list.map((o) => o.pages));
  return list.find((o) => o.pages === min) || null;
}

/** "0.08in top and bottom, spacing −2%" — what a cheat does, in words. */
export function describeCheat(g) {
  if (!g || !g.lines) return 'No cheat: standard margins and spacing.';
  const parts = [];
  if (g.marginLines) parts.push((Math.round(g.marginIn * 100) / 100).toFixed(2) + 'in off the top and bottom margins');
  if (g.spacingLines) parts.push('line spacing ' + Math.round(g.lineHeight * 1000) / 10 + '%');
  return parts.join(', ') + ' (' + g.lines + ' more ' + (g.lines === 1 ? 'line' : 'lines') + ' a page).';
}

export default { LINE_IN, MAX_MARGIN_IN, MAX_MARGIN_LINES, MAX_SPACING_LINES, MAX_CHEAT_LINES, normaliseCheat, cheatGeometry, shaveMargin, fitOptions, bestFit, describeCheat };
