/* ============================================================
   VAULT MODEL — the Idea Vault page's two compound actions
   ------------------------------------------------------------
   Moved out of src/pages/vault.js when the view and the logic were
   split (docs/ARCHITECTURE.md). The clippings and the story are
   src/lib/story.js's; these only combine its calls the way the page's
   buttons always did.
   ============================================================ */
import * as Story from './story.js';

/** "ADD TO SYNOPSIS": append clipping `id` to the end of the synopsis,
 *  exactly as the Story page's own button does.
 *  @returns {boolean} false when there is no such clipping. */
export function appendClipToSynopsis(id) {
  const it = Story.listVault().find((x) => x.id === id);
  if (!it) return false;
  const s = Story.loadStory();
  s.source = (s.source.trim() ? s.source.replace(/\s+$/, '') + '\n\n' : '') + it.snippet;
  Story.saveStory(s);
  return true;
}

/** Remove clipping `id`; returns the removed record (for undo) or undefined. */
export function removeClip(id) {
  const gone = Story.listVault().find((x) => x.id === id);
  Story.removeFromVault(id);
  return gone;
}

/** Undo a removal: put the clipping back with its id, date and beat.
 *  @returns {boolean} whether it went back in. */
export function restoreClip(gone) {
  if (Story.addToVault({ snippet: gone.snippet, url: gone.url, title: gone.title, at: gone.at, id: gone.id })) {
    if (gone.beat) Story.updateVault(gone.id, { beat: gone.beat });
    return true;
  }
  return false;
}

export default { appendClipToSynopsis, removeClip, restoreClip };
