/* ============================================================
   STICKY NOTES — the model, pure (owner, 23 Oct 2026)
   ------------------------------------------------------------
   "Multiple thoughts and ideas like sticky notes, which I can use while
   writing the scene order or the synopsis, like Celtx." A note is a
   RECORD IN THE IDEA VAULT ARRAY (`fms_idea_vault_v1`, per project),
   beside the clippings, so it is already scoped, backed up, reset and
   synced (scope `idea_vault`): no new key, no schema section.

     { id, kind: 'note', snippet, color, beat, sceneId, at }

   - `snippet` is the text. It has to be: listVault() keeps only records
     whose `snippet` is a string, and "Add to synopsis" reads it.
   - A clipping is a record with no `kind`; nothing here changes one.
   - `beat` is the vault's existing pin, "<frameworkId>:<beatId>";
     `sceneId` is a scene's id in `fms_scenes_v1`. One pin at a time.
   - `color` is a NAME from COLORS, never a hex (tokens.css paints it).
   - THE ARRAY ORDER IS THE BOARD ORDER. Dragging a note moves the record.

   Everything here takes an array and returns a new one or a value; the
   reads and writes are src/lib/story.js's. Unknown fields pass through
   untouched, so an older tab never strips a newer field.
   ============================================================ */
import { newId } from './record-id.js';

export const COLORS = ['yellow', 'pink', 'blue', 'green', 'violet'];
export const COLOR_LABEL = { yellow: 'Yellow', pink: 'Pink', blue: 'Blue', green: 'Green', violet: 'Violet' };
export const MAX_TEXT = 4000;

export const isNote = (x) => !!x && x.kind === 'note';
export const colorOf = (x) => (x && COLORS.includes(x.color) ? x.color : COLORS[0]);

/** A new note record, or null for empty text. */
export function makeNote(text, { color = COLORS[0], beat = '', sceneId = '' } = {}, now = Date.now()) {
  const t = String(text == null ? '' : text).trim();
  if (!t) return null;
  return {
    id: newId('note'), kind: 'note', snippet: t.slice(0, MAX_TEXT),
    color: COLORS.includes(color) ? color : COLORS[0],
    beat: String(beat || ''), sceneId: String(sceneId || ''), at: now
  };
}

/** The pin as one value for a select: 'beat:<fw>:<id>', 'scene:<id>' or ''. */
export function pinValue(x) {
  if (!x) return '';
  if (x.sceneId) return 'scene:' + x.sceneId;
  if (x.beat) return 'beat:' + x.beat;
  return '';
}
/** The patch a select's value makes: one pin, the other cleared. */
export function pinPatch(value) {
  const v = String(value || '');
  if (v.startsWith('scene:')) return { sceneId: v.slice(6), beat: '' };
  if (v.startsWith('beat:')) return { beat: v.slice(5), sceneId: '' };
  return { beat: '', sceneId: '' };
}

/** Move record `id` to position `to` (clamped). Returns a new array, or
 *  the same one when nothing moves. */
export function moveItem(items, id, to) {
  const from = items.findIndex((x) => x && x.id === id);
  if (from < 0) return items;
  const n = Math.max(0, Math.min(items.length - 1, Number(to) | 0));
  if (n === from) return items;
  const out = items.slice();
  const [it] = out.splice(from, 1);
  out.splice(n, 0, it);
  return out;
}

/** The notes pinned to one beat ("<fw>:<beat>") or one scene, in board order. */
export function notesFor(items, { beat = '', sceneId = '' } = {}) {
  return (items || []).filter((x) => isNote(x) && (sceneId ? x.sceneId === sceneId : beat ? x.beat === beat : false));
}

/** Pinned-note counts, keyed 'beat:<fw>:<id>' and 'scene:<id>'. */
export function pinCounts(items) {
  const out = {};
  for (const x of items || []) {
    if (!isNote(x)) continue;
    const k = pinValue(x);
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** The board's filter: 'all' | 'notes' | 'clips' | 'pinned' | a colour. */
export function filterBoard(items, f = 'all') {
  const all = items || [];
  if (f === 'notes') return all.filter(isNote);
  if (f === 'clips') return all.filter((x) => !isNote(x));
  if (f === 'pinned') return all.filter((x) => isNote(x) && pinValue(x));
  if (COLORS.includes(f)) return all.filter((x) => isNote(x) && colorOf(x) === f);
  return all;
}

/** A context's notes first (pinned here), then the rest, each in board order. */
export function hereFirst(items, ctx = {}) {
  const notes = (items || []).filter(isNote);
  const here = notesFor(notes, ctx);
  return here.concat(notes.filter((x) => !here.includes(x)));
}

/**
 * Undo an "Add to synopsis" / "Add to the scene" append. `before` was the
 * text, `after` what the append made it, `current` what it is now. The
 * Undo toast never times out, so the writer may have typed since: going
 * back to `before` would throw that writing away. So: unchanged → `before`;
 * changed → the text with ONLY the appended part taken out, when that part
 * is still there exactly once and not run into a longer word; otherwise
 * null (nothing safe to undo — the caller says so and writes nothing).
 */
export function undoAppend(current, before, after) {
  const cur = String(current == null ? '' : current);
  const b = String(before == null ? '' : before);
  const a = String(after == null ? '' : after);
  if (cur === a) return b;
  const base = b.replace(/\s+$/, '');
  if (!a.startsWith(base)) return null;
  const added = a.slice(base.length);
  if (!added.trim()) return null;
  const at = cur.indexOf(added);
  if (at < 0 || cur.indexOf(added, at + 1) >= 0) return null;
  if (/[\p{L}\p{N}]/u.test(cur.charAt(at + added.length)) && /[\p{L}\p{N}]$/u.test(added)) return null;
  return cur.slice(0, at) + cur.slice(at + added.length);
}

export default { COLORS, COLOR_LABEL, MAX_TEXT, isNote, colorOf, makeNote, pinValue, pinPatch, moveItem, notesFor, pinCounts, filterBoard, hereFirst, undoAppend };
