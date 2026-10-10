/* Render-time hook: a page puts an EMPTY hidden slot where a Watch block
   may go; one idle import of video.js (and videos.json with it) fills the
   ones that have an approved video. No words enter the DOM before then. */
import { h } from '../lib/dom.js';

let pending = [];
let queued = false;

export function videoSlot(key) {
  const slot = h('div.vid-slot', { 'data-vkey': key, hidden: true });
  pending.push(slot);
  if (!queued) {
    queued = true;
    const run = () => {
      const batch = pending; pending = []; queued = false;
      import('./video.js').then((m) => m.fillSlots(batch)).catch(() => {});
    };
    (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(run, { timeout: 2000 });
  }
  return slot;
}
