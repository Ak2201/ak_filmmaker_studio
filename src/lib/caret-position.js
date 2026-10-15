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
   ============================================================ */
import { elementLines, LINES_PER_PAGE } from './script.js';

/** The caret's place in the script, or null when it is in no line. */
export function caretPosition(els, id) {
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
  const page = Math.floor(atLine / LINES_PER_PAGE) + 1;
  const eighths = Math.floor(((atLine % LINES_PER_PAGE) / LINES_PER_PAGE) * 8);
  return {
    index: at,
    line: atLine + 1,
    page,
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
  return 'p. ' + pos.page + (pos.eighths ? ' ' + pos.eighths + '/8' : '');
}

/** How many scenes have headings, with no caret needed. */
export function sceneTotal(els) {
  return (els || []).filter((e) => e && e.type === 'scene' && String(e.text || '').trim()).length;
}

export default { caretPosition, formatCaretPage, sceneTotal };
