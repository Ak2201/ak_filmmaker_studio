/* ============================================================
   SCRIPT INDEX — the character navigator and the bookmarks
   ------------------------------------------------------------
   Pure, and stores nothing. The character list is DERIVED from the
   elements on every call (like caret-position.js and the cast matrix),
   so it can never disagree with the page. The one stored thing here is
   a bookmark, and it is a FIELD on the element — `mark: true` — inside
   the script blob: no new key, blankElement() keeps it, merge and sync
   carry whole elements, the exporters read type and text only and so
   ignore it, and the "did the draft change" hash does not look at it
   (a bookmark is the writer's place-holder, not an edit).
   ============================================================ */

/** "SARAH (V.O.)", "Sarah (CONT'D)", "SARAH ^" -> "SARAH". Extensions
 *  and the dual-dialogue caret are not part of who is speaking. */
export function baseName(text) {
  return String(text ?? '')
    .replace(/\^/g, ' ')
    .replace(/\s*\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

const sceneTitle = (e) => String((e && e.text) || '').trim() || '(untitled heading)';

/**
 * Every speaking character, most lines first (then by first appearance).
 *   { name, speeches, scenes: [sceneNumber…], sceneCount,
 *     firstId, firstScene, firstHeading, cues: [cueId…] }
 * `speeches` counts dialogue elements under the character's cues (a
 * parenthetical is direction, not a line). A scene number is the
 * heading's ordinal; 0 means "before the first heading". Headings with
 * no words still count, so the number matches what the navigator shows.
 */
export function characterIndex(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const by = new Map();
  let scene = 0;
  let heading = '';
  let cur = null;
  for (const e of list) {
    if (!e) continue;
    if (e.type === 'scene') { scene++; heading = sceneTitle(e); cur = null; continue; }
    if (e.type === 'character') {
      const name = baseName(e.text);
      if (!name) { cur = null; continue; }
      let c = by.get(name);
      if (!c) {
        c = { name, speeches: 0, scenes: [], sceneCount: 0, firstId: e.id, firstScene: scene, firstHeading: heading, cues: [], order: by.size };
        by.set(name, c);
      }
      c.cues.push(e.id);
      if (c.scenes[c.scenes.length - 1] !== scene) { c.scenes.push(scene); c.sceneCount++; }
      cur = c;
      continue;
    }
    if (e.type === 'dialogue') { if (cur) cur.speeches++; continue; }
    if (e.type !== 'paren') cur = null;             // action, transition, shot end the speech
  }
  return [...by.values()]
    .sort((a, b) => b.speeches - a.speeches || a.order - b.order)
    .map(({ order, ...c }) => c);
}

/** The id of the character's next cue after `fromId`, wrapping round
 *  to the first; the first cue when `fromId` is not in the list. Null
 *  when the character does not speak. */
export function nextCueOf(elements, name, fromId) {
  const list = Array.isArray(elements) ? elements : [];
  const want = baseName(name);
  const cues = [];
  let at = -1;
  list.forEach((e, i) => {
    if (e && e.id === fromId) at = i;
    if (e && e.type === 'character' && baseName(e.text) === want) cues.push(i);
  });
  if (!cues.length) return null;
  const next = cues.find((i) => i > at);
  return list[next === undefined ? cues[0] : next].id;
}

/** Bookmarked lines in script order: { id, n (1-based), type, text, scene }. */
export function bookmarks(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const out = [];
  let scene = 0;
  list.forEach((e) => {
    if (!e) return;
    if (e.type === 'scene') scene++;
    if (e.mark === true) out.push({ id: e.id, n: out.length + 1, type: e.type, text: String(e.text || '').trim(), scene });
  });
  return out;
}

/** Turn a bookmark on or off on one element; answers whether it is on.
 *  Off removes the field, so an unmarked script is byte-identical. */
export function toggleMark(el) {
  if (!el) return false;
  if (el.mark === true) { delete el.mark; return false; }
  el.mark = true;
  return true;
}

/** The next (dir 1) or previous (dir -1) bookmarked line from `fromId`,
 *  wrapping; null when there are none. */
export function stepMark(elements, fromId, dir = 1) {
  const list = Array.isArray(elements) ? elements : [];
  const marked = [];
  let at = -1;
  list.forEach((e, i) => {
    if (e && e.id === fromId) at = i;
    if (e && e.mark === true) marked.push(i);
  });
  if (!marked.length) return null;
  let pick;
  if (dir < 0) {
    pick = [...marked].reverse().find((i) => i < at);
    if (pick === undefined) pick = marked[marked.length - 1];
  } else {
    pick = marked.find((i) => i > at);
    if (pick === undefined) pick = marked[0];
  }
  return list[pick].id;
}

export default { baseName, characterIndex, nextCueOf, bookmarks, toggleMark, stepMark };
