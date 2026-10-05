/* ============================================================
   EXTENSION BRIDGE — the app's half of the Chrome extension
   ------------------------------------------------------------
   The extension (extension/ at the repo root) packages this same
   build and opens its pages in the side panel and in tabs, so on
   those pages `chrome.storage` and `chrome.runtime` exist. On the
   website they do not, and every function here is a no-op there.

   CLIPPINGS. The context-menu "Send to Filmmaker Studio" runs in the
   extension's service worker, which has no localStorage and no idea
   which project is open. So it appends to a QUEUE in
   chrome.storage.local and pings any open page; the page drains the
   queue into the open project's Idea Vault through story.js. A clip
   carries its own id, and addToVault() ignores an id it has already
   stored, so a page that drains, crashes and drains again does not
   double anything.

   A clipping is not a credential, which is why chrome.storage.local
   is allowed for it. The session token is the one thing PRD FR-202
   forbids there, and nothing in this file touches it.
   ============================================================ */
import { addToVault } from './story.js';

export const CLIP_QUEUE_KEY = 'fms_clip_queue';

const ext = () => {
  const c = globalThis.chrome;
  return c && c.runtime && c.runtime.id && c.storage && c.storage.local ? c : null;
};

export const inExtension = () => !!ext();

/** Move queued clips into the open project's Idea Vault. Resolves to
 *  the number stored. The queue is only cleared of the clips that were
 *  read, so a clip that arrives mid-drain survives to the next one. */
export async function drainClipQueue() {
  const c = ext();
  if (!c) return 0;
  try {
    const got = await c.storage.local.get(CLIP_QUEUE_KEY);
    const queue = Array.isArray(got[CLIP_QUEUE_KEY]) ? got[CLIP_QUEUE_KEY] : [];
    if (!queue.length) return 0;
    let n = 0;
    for (const clip of queue) if (addToVault(clip)) n++;
    const after = await c.storage.local.get(CLIP_QUEUE_KEY);
    const ids = new Set(queue.map((q) => q.id));
    const rest = (after[CLIP_QUEUE_KEY] || []).filter((q) => !ids.has(q.id));
    await c.storage.local.set({ [CLIP_QUEUE_KEY]: rest });
    return n;
  } catch (e) {
    console.warn('[extension] clip queue', e);
    return 0;
  }
}

/** Call `cb` whenever the service worker says a clip was queued. */
export function onClipQueued(cb) {
  const c = ext();
  if (!c || !c.runtime.onMessage) return () => {};
  const fn = (msg) => { if (msg && msg.type === 'fms-clip-queued') cb(); };
  c.runtime.onMessage.addListener(fn);
  return () => c.runtime.onMessage.removeListener(fn);
}
