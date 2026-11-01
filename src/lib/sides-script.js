/* ============================================================
   SIDES SCRIPT — the script's own words under a scene on the sides
   ------------------------------------------------------------
   PURE. Given one scene row, the script's elements and its numbering,
   returns the scene's script elements as they print, or null. Only a
   CONFIDENT pair (heading link, or heading/location agree: matchScenes
   + isConfident) is read: a position-only guess prints nothing, the
   same promise Add all and the lock extract keep. Stores nothing.
   `firstPage` is the page label of the scene's heading in the whole
   script (locked pages honoured), '' when it cannot be told.
   ============================================================ */
import { matchScenes, isConfident } from './screenplay-analysis.js';
import { printedText, paginate, paginateDoc, pageNumbersDoc } from './screenplay-export.js';

export function sidesScript(scene, elements, numbering) {
  if (!scene || !Array.isArray(elements)) return null;
  const { pairs } = matchScenes([scene], elements);
  const pair = pairs[0];
  if (!pair || !pair.slice || !isConfident(pair.how)) return null;
  const sl = pair.slice;
  const head = (sl.id && elements.find((e) => e && e.id === sl.id)) || { id: sl.id || null, type: 'scene', text: sl.heading };
  const own = [head, ...sl.elements];
  const out = own.map((el) => ({ id: el.id || '', type: el.type, text: printedText(el) })).filter((e) => e.text);
  let pages = 1;
  try { pages = Math.max(1, paginate(own).length); } catch (e) { /* keep 1 */ }
  let firstPage = '';
  try {
    if (sl.id) {
      const doc = { elements, numbering };
      const all = paginateDoc(doc);
      const labels = pageNumbersDoc(doc, all);
      const at = all.findIndex((pg) => pg.some((r) => r.id === sl.id));
      if (at >= 0) firstPage = String(labels[at] || '');
    }
  } catch (e) { firstPage = ''; }
  return { how: pair.how, elements: out, firstPage, pages };
}

export default { sidesScript };
