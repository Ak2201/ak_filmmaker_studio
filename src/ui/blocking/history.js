/* ============================================================
   BLOCKING — undo and redo (src/ui/blocking/history.js)
   ------------------------------------------------------------
   One snapshot stack per setup, IN MEMORY ONLY. A snapshot is the whole
   block as JSON, taken just before an edit; undo hands it back to the
   editor, which writes it with Shots.replaceBlock() — the one path that
   cleans every mark and piece on the way in.

   NEVER STORED. How you got to a diagram is not the diagram: a new key
   for it would be a new entry in a contract that holds months of
   people's work, bought for a convenience that ends with the visit.
   The idle-write assertion in `verify` would also catch a history that
   wrote. A reload starts with an empty history, like every editor.
   ============================================================ */
const LIMIT = 60;
const stacks = new Map();   // blockId -> { undo: string[], redo: string[] }

const of = (id) => {
  if (!stacks.has(id)) stacks.set(id, { undo: [], redo: [] });
  return stacks.get(id);
};

/** Remember the block as it is BEFORE an edit. A new edit ends the redo. */
export function record(block) {
  if (!block || !block.id) return;
  const s = of(block.id);
  const snap = JSON.stringify(block);
  if (s.undo[s.undo.length - 1] === snap) return;   // nothing changed since
  s.undo.push(snap);
  if (s.undo.length > LIMIT) s.undo.shift();
  s.redo.length = 0;
}

/** The block to restore for an undo, given the block as it is now (which
    becomes the redo). Null when there is nothing to undo. */
export function undo(current) {
  const s = current && stacks.get(current.id);
  if (!s || !s.undo.length) return null;
  s.redo.push(JSON.stringify(current));
  return JSON.parse(s.undo.pop());
}

export function redo(current) {
  const s = current && stacks.get(current.id);
  if (!s || !s.redo.length) return null;
  s.undo.push(JSON.stringify(current));
  return JSON.parse(s.redo.pop());
}

export const canUndo = (id) => !!(stacks.get(id) && stacks.get(id).undo.length);
export const canRedo = (id) => !!(stacks.get(id) && stacks.get(id).redo.length);
/** Forget a setup's history (it was deleted). */
export const forget = (id) => { stacks.delete(id); };

export default { record, undo, redo, canUndo, canRedo, forget };
