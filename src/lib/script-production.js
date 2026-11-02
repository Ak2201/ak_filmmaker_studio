/* ============================================================
   SCRIPT PRODUCTION — revision mode and the writer's reports
   ------------------------------------------------------------
   Two things a shooting script needs from the Screenplay Writer once it
   is locked (docs/SCRIPT-LOCK.md), both DERIVED and stored nowhere:

   1. REVISION MODE. Every line changed since the locked script (the
      draft `numbering.base` names) is marked with an asterisk in the
      right margin, in the colour of the revision now being written —
      on screen as the writer types, and in the PDF with the colour's
      name and date at the head of each revised page. Nothing new is
      stored: the base is a draft that already exists, the colour is
      the ISSUED order (issuedColour(), src/lib/script-incoming.js),
      and the marks are revisedIds() of the same diff the change report
      reads (src/lib/script-diff.js). A lock taken before tracking
      existed has no base and therefore no marks — it is not "held".

   2. THE WRITER'S REPORTS. Scene, location and character reports read
      off the PAGES the PDF prints (paginateDoc), so a scene's page and
      its length in eighths are the ones a reader will find, not an
      estimate. The Breakdown's own reports (src/ui/script-reports.js)
      read the scene rows; these read the script as written, which is
      what a writer has before a Breakdown exists.

   PURE: no DOM, no storage.
   ============================================================ */
import { isHeld, revisionColour } from './script.js';
import { diffElements, revisedIds, isUnchanged } from './script-diff.js';
import { isSideCopy, issuedCount } from './script-incoming.js';
import { cueName, headingParts } from './screenplay-analysis.js';
import { formatEighths } from './sample-figures.js';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "2 Nov 2026", from an ISO string; '' when it is not a date. Fixed
    words rather than toLocaleDateString, so Node and every browser agree. */
export function revDate(iso) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  return d.getUTCDate() + ' ' + MONTHS[d.getUTCMonth()] + ' ' + d.getUTCFullYear();
}

/**
 * The marks revision mode paints, or null when the script is not held.
 *   { ids: Set(elementId), colour: { name, swatch }, date: ISO,
 *     label: 'Blue Revision', header: 'Blue Revision · 2 Nov 2026',
 *     baseId, baseName }
 * The colour: if the script is exactly the latest ISSUED draft, that
 * draft is this issue and its colour is the one; otherwise this is the
 * NEXT issue, not yet saved as a draft — the same rule the revised-pages
 * export on drafts.html has always used (src/ui/write-revisions.js).
 */
export function revisionMarks(doc, now = new Date().toISOString()) {
  const n = doc && doc.numbering;
  if (!isHeld(n)) return null;
  const revs = Array.isArray(doc.revisions) ? doc.revisions : [];
  const base = revs.find((r) => r && r.id === n.base);
  if (!base) return null;
  const els = Array.isArray(doc.elements) ? doc.elements : [];
  const ids = revisedIds(diffElements(base.elements || [], els));
  let latest = -1;
  for (let i = revs.length - 1; i >= 0; i--) if (!isSideCopy(revs[i])) { latest = i; break; }
  const issued = latest >= 0 && (revs[latest] === base ? !ids.size : isUnchanged(diffElements(revs[latest].elements || [], els)));
  const count = issuedCount(revs);
  const colour = revisionColour(Math.max(0, issued ? count - 1 : count));
  const date = issued ? revs[latest].date : now;
  const label = colour.name + ' Revision';
  const day = revDate(date);
  return {
    ids, colour: { name: colour.name, swatch: colour.swatch }, date, label,
    header: day ? label + ' · ' + day : label,
    baseId: base.id, baseName: base.name
  };
}

/* ------------------------------------------------------------
   THE REPORTS
   ------------------------------------------------------------ */
const rowCost = (row, first) => (first ? 0 : (row.blankBefore || 0)) + ((row.lines && row.lines.length) || 0);
const toEighths = (lines, body) => Math.max(1, Math.round((lines / body) * 8));
const upper = (s) => String(s || '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Every character cue in a page row, a dual block's two included. The
    paginator's own "NAME (CONT'D)" at the top of a page is not a speech. */
function cuesOf(row) {
  if (row.type === 'dual') return (row.cols || []).flat().filter((r) => r.type === 'character').map((r) => r.lines.join(' '));
  return row.type === 'character' && !row.contd ? [row.lines.join(' ')] : [];
}

/**
 * The script's scenes as printed.
 *   pages   paginateDoc(doc)
 *   labels  pageNumbersDoc(doc, pages) (a locked script's 12A, 12-13)
 *   bodyLines  the lines a page body holds (paginate.js BODY_LINES)
 * Returns [{ id, number, heading, page, pages: [label…], lines, eighths,
 *            length: '1 3/8', cast: [NAME…], speeches }]
 * Material before the first heading belongs to no scene and is left out.
 */
export function sceneReport(pages, labels, bodyLines) {
  const out = [];
  let cur = null;
  (pages || []).forEach((rows, p) => {
    const label = (labels && labels[p]) || String(p + 1);
    rows.forEach((row, j) => {
      if (row.type === 'scene' && !row.omitted && !row.cont && row.id) {
        cur = { id: row.id, number: String(row.sceneNo || ''), heading: upper(row.lines.join(' ')),
          page: label, pages: [label], lines: 0, cast: new Map(), speeches: 0 };
        out.push(cur);
      }
      if (!cur || row.omitted) return;
      if (cur.pages[cur.pages.length - 1] !== label) cur.pages.push(label);
      cur.lines += rowCost(row, j === 0 || cur.lines === 0);
      for (const cue of cuesOf(row)) {
        const name = cueName(cue);
        if (!name) continue;
        cur.speeches++;
        cur.cast.set(name, (cur.cast.get(name) || 0) + 1);
      }
    });
  });
  return out.map((s) => {
    const eighths = toEighths(s.lines, bodyLines);
    return { ...s, eighths, length: formatEighths(eighths), cast: [...s.cast.keys()] };
  });
}

/**
 * Locations: one row per PLACE (the heading without INT/EXT and the time),
 * with how it is used. From sceneReport()'s rows.
 * [{ place, ie: ['INT'…], times: ['DAY'…], scenes, numbers, eighths, length, pages }]
 * Most screen time first, then by name.
 */
export function locationReport(scenes) {
  const by = new Map();
  for (const s of scenes || []) {
    const parts = headingParts(s.heading);
    const place = upper(parts.place) || s.heading || 'UNNAMED';
    let row = by.get(place);
    if (!row) { row = { place, ie: new Set(), times: new Set(), scenes: 0, numbers: [], eighths: 0, pages: new Set() }; by.set(place, row); }
    if (parts.ie) row.ie.add(parts.ie);
    if (parts.time) row.times.add(parts.time);
    row.scenes++;
    if (s.number) row.numbers.push(s.number);
    row.eighths += s.eighths;
    s.pages.forEach((p) => row.pages.add(p));
  }
  return [...by.values()]
    .map((r) => ({ ...r, ie: [...r.ie], times: [...r.times], length: formatEighths(r.eighths), pages: [...r.pages] }))
    .sort((a, b) => b.eighths - a.eighths || a.place.localeCompare(b.place));
}

/**
 * Characters: who speaks, in how many scenes, how many speeches, and on
 * how many pages. From the printed pages, so a page is one a reader can
 * turn to. [{ name, scenes, numbers, speeches, pages, firstPage }]
 * Most speeches first, then by name.
 */
export function characterReport(pages, labels) {
  const by = new Map();
  let scene = null;
  (pages || []).forEach((rows, p) => {
    const label = (labels && labels[p]) || String(p + 1);
    for (const row of rows) {
      if (row.type === 'scene' && !row.omitted && !row.cont && row.id) scene = String(row.sceneNo || row.id);
      for (const cue of cuesOf(row)) {
        const name = cueName(cue);
        if (!name) continue;
        let c = by.get(name);
        if (!c) { c = { name, scenes: new Set(), speeches: 0, pages: new Set(), firstPage: label }; by.set(name, c); }
        c.speeches++;
        c.pages.add(label);
        if (scene) c.scenes.add(scene);
      }
    }
  });
  return [...by.values()]
    .map((c) => ({ name: c.name, scenes: c.scenes.size, numbers: [...c.scenes], speeches: c.speeches, pages: c.pages.size, firstPage: c.firstPage }))
    .sort((a, b) => b.speeches - a.speeches || a.name.localeCompare(b.name));
}

export default { revDate, revisionMarks, sceneReport, locationReport, characterReport };
