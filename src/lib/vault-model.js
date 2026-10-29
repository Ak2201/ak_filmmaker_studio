/* ============================================================
   VAULT MODEL — the Idea Vault page's compound action
   ------------------------------------------------------------
   Moved out of src/pages/vault.js when the view and the logic were
   split (docs/ARCHITECTURE.md). The clippings and the story are
   src/lib/story.js's; these only combine its calls the way the page's
   buttons always did.
   ============================================================ */
import * as Story from './story.js';

/** "Add to synopsis": append clipping `id` to the end of the synopsis,
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

export default { appendClipToSynopsis };
