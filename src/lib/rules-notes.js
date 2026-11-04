/* ============================================================
   RULES NOTES — keep a rules read as notes (the twin of keepNotes)
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md lane B. The AI Desk's reads keep their
   ticked points through ai-tasks.js keepNotes; this is the same
   write for the rules twins, simpler because a rules item always
   knows its scene row id (no matching by content, no guessing).

     item with `sceneId`   appended to that scene's reader note,
                           marked  Rules (<label>): …  (appendSceneNotes)
     any other item        a sticky note, `from: 'rules'`, headed with
                           the item's `where`

   Blanks and new records only: a point already on its scene word for
   word is not written again (changes.same), and a sticky note whose
   text is already on the board is not made twice, so a second Accept
   of the same list writes nothing. ONE exact Undo: the scene notes
   through undoSceneNotes (a person's later edit survives) and the
   sticky notes through removeManyFromVault. NEVER AI-stamped: no `ai`
   and no `aiFill`, and `from` is 'rules', never 'ai'.

   Lives in the same layer as local-tasks.js: it touches storage only
   through the models. Imports no ai*.js. Loaded lazily by
   local-tasks-post.js, so it is not in any first paint.
   ============================================================ */
import * as ScenesM from './scenes.js';
import * as StoryM from './story.js';
import { makeNote } from './notes-model.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const call = (fn, ...a) => (typeof fn === 'function' ? fn(...a) : undefined);

/**
 * keepRuleNotes(selected, { label, after, say })
 *   selected  Desk items { text, keep?, where?, sceneId? }
 * -> an Undo function (with `.said`, the line the toast shows), or null
 * when nothing was written (and `say` has been told why).
 */
export function keepRuleNotes(selected, { label = 'Notes', after, say } = {}) {
  const from = 'Rules (' + label + ')';
  const rows = new Map(ScenesM.listScenes().map((s) => [s.id, s]));
  const onScene = [];
  const sticky = [];
  for (const it of selected || []) {
    const t = String((it && (it.keep || it.text)) ?? '').trim();
    if (!t) continue;
    const row = it.sceneId ? rows.get(it.sceneId) : null;
    if (row) onScene.push({ id: row.id, text: t, where: 'Sc ' + (row.number || '?') });
    else sticky.push(it.where ? it.where + ' — ' + t : t);
  }
  if (!onScene.length && !sticky.length) {
    call(say, 'Nothing is ticked, so there is nothing to keep.');
    return null;
  }
  const changes = onScene.length ? ScenesM.appendSceneNotes(onScene, { from }) : [];
  if (changes === null) throw new Error('The scene list could not be saved (storage may be full), so nothing was kept.');

  const have = new Set(StoryM.listVault().map((x) => x.snippet));
  const notes = [];
  for (const t of sticky) {
    const n = makeNote(from + ': ' + t);
    if (!n || have.has(n.snippet)) continue;
    have.add(n.snippet);
    n.from = 'rules';   // a field, not a key; notes pass unknown fields through
    notes.push(n);
  }
  const added = notes.length ? StoryM.addNotesToVault(notes) : [];
  if (added === null) {
    ScenesM.undoSceneNotes(changes);
    throw new Error('The notes board could not be saved (storage may be full), so nothing was kept.');
  }
  const ids = added.map((n) => n.id);
  const wrote = new Map(added.map((n) => [n.id, n.snippet]));
  const same = (changes && changes.same) || 0;
  const skippedSticky = sticky.length - notes.length;
  if (!changes.length && !ids.length) {
    call(say, label + ': ' + (onScene.length && !sticky.length ? (onScene.length === 1 ? 'that note is' : 'those notes are') + ' already on '
      + (onScene.length === 1 ? 'its scene' : 'their scenes')
      : 'those notes are already there') + ', so nothing was written.');
    return null;
  }
  call(after);
  const undo = () => {
    ScenesM.undoSceneNotes(changes);
    if (ids.length) {
      // a note edited since Accept is the writer's now: only unchanged ones go
      const now = new Map(StoryM.listVault().map((x) => [x.id, x.snippet]));
      const keep = ids.filter((id) => now.has(id) && now.get(id) === wrote.get(id));
      if (keep.length) StoryM.removeManyFromVault(keep);
    }
    call(after);
  };
  const written = new Set(changes.map((x) => x.id));
  const whereSaid = [...new Set(onScene.filter((x) => written.has(x.id)).map((x) => x.where))];
  const scenesSaid = changes.length ? plural(Math.max(0, onScene.length - same), 'note', 'notes') + ' on the scene list (' + whereSaid.join(', ') + ')' : '';
  const stickySaid = ids.length ? plural(ids.length, 'sticky note', 'sticky notes') + ' on the notes board' : '';
  const already = same + skippedSticky;
  undo.said = label + ': saved ' + [scenesSaid, stickySaid].filter(Boolean).join(' and ') + '.'
    + (already ? ' ' + plural(already, 'note was', 'notes were') + ' already there.' : '');
  return undo;
}

export default { keepRuleNotes };
