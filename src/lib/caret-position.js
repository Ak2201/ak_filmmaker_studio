/* ============================================================
   WHERE THE CARET IS — src/lib/caret-position.js
   ------------------------------------------------------------
   Pure: the script's elements and the id of the line being written
   in, to "scene 3 of 36, page 18 3/8, line 184". Derived on every
   call and stored nowhere. Read by the Screenplay Writer's position
   strip and by focus mode's top strip, so the two can never disagree
   about where the writer is.

   The arithmetic is the beats panel's (src/ui/beats-panel.js): each
   element costs elementLines() and a page is LINES_PER_PAGE lines, so
   "page 18" here is the page the beats panel highlights. Scenes are
   counted the way a person counts them: headings with words in them,
   in order (an ordinal, not the locked scene number).

   REAL PAGES. When the caller has the paginator's answer — the
   Screenplay Writer's page view computes it at idle — it passes
   `paged: { index, labels }` (index = paginate.js pageIndex(pages),
   labels = pageNumbersDoc), and the page and the eighths are the
   PDF's own: "p. 12A 3/8" is where that line prints. A line typed since
   the last pagination is not in the index yet; it is placed on the
   page of the nearest line above it that is, until the next idle
   pass. Without `paged` the estimate above is used, as before.
   ============================================================ */
import { elementLines, LINES_PER_PAGE, isNumberingLocked, sceneNumbers } from './script.js';
import { BODY_LINES } from './paginate.js';

/** The caret's place in the script, or null when it is in no line. */
export function caretPosition(els, id, paged) {
  const list = els || [];
  let line = 0;
  let scene = 0;
  let sceneCount = 0;
  let sceneElId = null;
  let sceneText = '';
  let at = -1;
  let atLine = 0;
  for (let i = 0; i < list.length; i++) {
    const e = list[i];
    const heading = e && e.type === 'scene' && String(e.text || '').trim();
    if (heading) sceneCount++;
    if (at < 0) {
      if (heading) { scene = sceneCount; sceneElId = e.id; sceneText = heading; }
      if (e && e.id === id) { at = i; atLine = line; }
    }
    line += elementLines(e);
  }
  if (at < 0) return null;
  let page = Math.floor(atLine / LINES_PER_PAGE) + 1;
  let eighths = Math.floor(((atLine % LINES_PER_PAGE) / LINES_PER_PAGE) * 8);
  let pageLabel = '';
  const index = paged && paged.index instanceof Map ? paged.index : null;
  if (index && index.size) {
    let hit = null;
    for (let k = at; k >= 0 && !hit; k--) hit = list[k] ? index.get(list[k].id) || null : null;
    const where = hit || { page: 0, line: 0 };
    page = where.page + 1;
    eighths = Math.min(7, Math.floor((where.line / BODY_LINES) * 8));
    const labels = paged.labels;
    pageLabel = labels && labels[where.page] ? String(labels[where.page]) : '';
  }
  return {
    index: at,
    line: atLine + 1,
    page,
    pageLabel,             // the printed label ("12A") on real pages, else ''
    eighths,
    scene,                 // 0 = above the first heading
    sceneCount,
    sceneElId,
    sceneText
  };
}

/** "p. 18 3/8" — the page and how far down it, in the eighths a
    production counts in (a whole page reads "p. 18"). */
export function formatCaretPage(pos) {
  if (!pos) return '';
  return 'p. ' + (pos.pageLabel || pos.page) + (pos.eighths ? ' ' + pos.eighths + '/8' : '');
}

/** How many scenes have headings, with no caret needed. */
export function sceneTotal(els) {
  return (els || []).filter((e) => e && e.type === 'scene' && String(e.text || '').trim()).length;
}

/** The caret scene's LOCKED number ("12A") when the scene numbers are
    locked, else ''. With numbers locked the ordinal is not the scene's
    number: a scene inserted after 12 is the 13th heading and scene 12A
    on the Breakdown, the stripboard and the PDF (QA r4). */
export function lockedSceneNumber(els, numbering, sceneElId) {
  if (!sceneElId || !isNumberingLocked(numbering)) return '';
  return sceneNumbers(els || [], numbering).byId.get(sceneElId) || '';
}

/** "Scene 13 of 37", or with a locked number "Scene 12A (13 of 37)" —
    the number every other view prints, and the place in the script. */
export function sceneLabel(pos, total, locked) {
  if (!pos || !pos.scene) return '';
  const n = String(locked || '').trim();
  return n && n !== String(pos.scene)
    ? 'Scene ' + n + ' (' + pos.scene + ' of ' + total + ')'
    : 'Scene ' + pos.scene + ' of ' + total;
}

export default { caretPosition, formatCaretPage, sceneTotal, lockedSceneNumber, sceneLabel };
