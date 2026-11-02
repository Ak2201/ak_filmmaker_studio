/* ============================================================
   SCRIPT STRUCTURE — scenes as blocks: move one, fold one
   ------------------------------------------------------------
   PURE. Element lists in, element lists (or id sets) out; nothing is
   read from storage and nothing written. The editor
   (src/ui/script-editor/editor.js) owns the history step and the save.

   A SCENE BLOCK is its heading and every element after it up to (not
   including) the next heading or act break. An act break is not part
   of the scene before it: dragging the last scene of Act One must not
   carry "END OF ACT ONE" along, so a block stops there and the act
   element (and anything between it and the next heading) stays put.
   The lines before the first heading — a FADE IN:, a title card — are
   no scene's, and never move.

   A MOVE REORDERS THE SAME ELEMENT OBJECTS. Ids survive, which is the
   whole point: the scene sync (src/lib/scene-sync.js) relinks a
   Breakdown row by its heading's id, so a moved scene keeps its row,
   its shots and its notes, and nothing is duplicated. Under a held
   lock (isHeld(), docs/SCRIPT-LOCK.md) the locked number stays with
   the heading id too, so a moved scene keeps "12" wherever it lands,
   and the change report shows it as moved — the lock's own rules, not
   a special case here.

   FOLDING is view state: a Set of heading ids, held by the page in
   memory and never in the script blob. foldedIds() says which element
   ids a fold hides; the editor hides those rows.
   ============================================================ */

const isBoundary = (e) => !!e && (e.type === 'scene' || e.type === 'act');

/** Every scene, in order: { id, index (of the heading), start, end }
    with `end` exclusive. */
export function sceneBlocks(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const out = [];
  let cur = null;
  list.forEach((e, i) => {
    if (isBoundary(e)) {
      if (cur) { cur.end = i; out.push(cur); cur = null; }
      if (e.type === 'scene') cur = { id: e.id, index: i, start: i, end: list.length };
    }
  });
  if (cur) { cur.end = list.length; out.push(cur); }
  return out;
}

/** The block a heading id opens, or null. */
export function blockOf(elements, headingId) {
  return sceneBlocks(elements).find((b) => b.id === headingId) || null;
}

/** The heading id of the scene element `id` sits in (its own id for a
    heading), or null before the first heading / on an act break. */
export function sceneOfElement(elements, id) {
  const b = sceneBlocks(elements).find((x) => {
    for (let i = x.start; i < x.end; i++) if (elements[i] && elements[i].id === id) return true;
    return false;
  });
  return b ? b.id : null;
}

/**
 * Move a whole scene so that it becomes scene number `toPos` (0-based,
 * counted among scenes AFTER the move, clamped). Returns a new array of
 * the SAME element objects, or null when nothing would change (unknown
 * id, same place, no scenes).
 *
 * Where the block lands: in front of the heading that holds `toPos`
 * once the block is lifted out, or, for the last place, straight after
 * the last scene's block (so a trailing act break or closing card the
 * old last scene was followed by stays at the very end).
 */
export function moveScene(elements, headingId, toPos) {
  const list = Array.isArray(elements) ? elements : [];
  const blocks = sceneBlocks(list);
  const from = blocks.findIndex((b) => b.id === headingId);
  if (from < 0) return null;
  const to = Math.max(0, Math.min(blocks.length - 1, Math.trunc(Number(toPos) || 0)));
  if (to === from) return null;
  const b = blocks[from];
  const moving = list.slice(b.start, b.end);
  const rest = list.slice(0, b.start).concat(list.slice(b.end));
  const left = sceneBlocks(rest);
  let at;
  if (to >= left.length) at = left.length ? left[left.length - 1].end : rest.length;
  else at = left[to].start;
  return rest.slice(0, at).concat(moving, rest.slice(at));
}

/** Move by one place: -1 up, +1 down. Null at either end. */
export function nudgeScene(elements, headingId, delta) {
  const blocks = sceneBlocks(elements);
  const from = blocks.findIndex((b) => b.id === headingId);
  if (from < 0) return null;
  const to = from + (delta < 0 ? -1 : 1);
  if (to < 0 || to >= blocks.length) return null;
  return moveScene(elements, headingId, to);
}

/** The element ids a set of folded headings hides: every element of
    each folded block except its heading. `keepId` (the line the caret
    is in) unfolds its own scene: a caret never sits in a hidden row. */
export function foldedIds(elements, folded, keepId = null) {
  const out = new Set();
  if (!folded || !folded.size) return out;
  for (const b of sceneBlocks(elements)) {
    if (!folded.has(b.id)) continue;
    let holds = false;
    for (let i = b.start + 1; i < b.end; i++) if (elements[i] && elements[i].id === keepId) { holds = true; break; }
    if (holds) continue;
    for (let i = b.start + 1; i < b.end; i++) if (elements[i]) out.add(elements[i].id);
  }
  return out;
}

/** Drop folds whose heading is gone (a cut scene, a restored draft). */
export function pruneFolds(elements, folded) {
  const live = new Set(sceneBlocks(elements).map((b) => b.id));
  for (const id of [...folded]) if (!live.has(id)) folded.delete(id);
  return folded;
}

/** How many lines a folded heading stands for (its block minus itself). */
export function foldedCount(elements, headingId) {
  const b = blockOf(elements, headingId);
  return b ? b.end - b.start - 1 : 0;
}

export default { sceneBlocks, blockOf, sceneOfElement, moveScene, nudgeScene, foldedIds, pruneFolds, foldedCount };
