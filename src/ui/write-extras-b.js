/* ============================================================
   WRITE EXTRAS (B) — one entry for write.html's phase-6 additions
   ------------------------------------------------------------
   The production hand-off banner (handoff.js) and the dialogue strip
   with alternate takes and Tanglish help (alt-lines.js), behind one
   call so write.js carries one import and one line. Both read the
   page's in-memory script through `getDoc`; neither writes anything
   except on a click, and then only through the page's own save path
   (alt-lines) or src/lib/scenes.js (the hand-off).
   ============================================================ */
import '../styles/write-extras-b.css';
import { mountHandoff } from './handoff.js';
import { mountAltLines } from './alt-lines.js';

export function mountWriteExtrasB(opts = {}) {
  try { mountAltLines(opts); } catch (e) { console.warn('[write] alternates', e); }
  try { mountHandoff(opts); } catch (e) { console.warn('[write] hand-off', e); }
}

export default mountWriteExtrasB;
