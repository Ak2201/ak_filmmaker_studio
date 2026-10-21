/* ============================================================
   DRIVE IMAGES — a drawn storyboard frame, shown from Drive
   ------------------------------------------------------------
   A frame whose `ref` is `drive:<fileId>` (src/lib/board-frames.js)
   has its picture in the writer's own Google Drive and nowhere else.
   Showing it is an authenticated fetch with the Drive token, turned
   into an object URL for this page visit only (never stored).

   NEVER A BROKEN IMAGE. The Google token lasts about an hour and this
   static build cannot mint another without a click (drive.js header),
   so a frame with no token shows a "Reconnect Drive" control instead
   of an <img> that fails. That button is the only thing here that
   may open Google's window, because it is a click. A file deleted
   from Drive says so in words.

   Also the live half of the board-frames gate: boardFacts() reads the
   four facts boardGate() decides on — the build reaches Drive, a
   Google sign-in is on this page, Drive is connected on this device,
   a token is held now. drive.js and drive-sync.js are already in the
   CORE chunk (chrome.js imports drive-sync), so this costs a page
   almost nothing.
   ============================================================ */
import Drive from '../lib/drive.js';
import { boardFacts, currentBoardGate, onDriveReconnect, reconnectDrive } from '../lib/drive-board.js';
import { h, delegate } from '../lib/dom.js';
import { button } from './kit/index.js';

/* The facts and the reconnect are logic (src/lib/drive-board.js); this
   file draws on top of them, and redraws when a reconnect lands. */
export { boardFacts, currentBoardGate, onDriveReconnect, reconnectDrive };

const urls = new Map();       // fileId → object URL, for this page visit
const blobs = new Map();      // fileId → the Blob behind it (an image ZIP reads these)

const tokenGone = (e) => !!e && (e.status === 401
  || /click|token|popup|unauthori[sz]ed/i.test(String((e && e.message) || e)));

function reconnectBox(el, text) {
  el.classList.remove('is-loaded');
  el.replaceChildren(
    h('p.drv-img-note', { text: text || 'The drawing is in your Google Drive. Reconnect to show it.' }),
    button({ label: 'Reconnect Drive', size: 'sm', action: 'drive-reconnect', class: 'drv-img-reconnect' })
  );
}

async function fill(el) {
  const id = el.dataset.driveFile;
  if (!id) return;
  const alt = el.dataset.alt || 'Storyboard frame';
  if (urls.has(id)) {
    el.classList.add('is-loaded');
    el.replaceChildren(h('img.drv-img-pic', { src: urls.get(id), alt }));
    return;
  }
  if (!Drive.hasToken()) { reconnectBox(el); return; }
  el.replaceChildren(h('p.drv-img-note', { role: 'status', text: 'Loading the drawing from Drive…' }));
  try {
    const blob = await Drive.downloadFileBlob(id);
    if (!blob || !/^image\//.test(blob.type || 'image/')) throw new Error('Drive returned something that is not a picture.');
    keep(id, blob);
    if (el.isConnected) fill(el);
  } catch (e) {
    if (!el.isConnected) return;
    if (e && e.status === 404) {
      el.replaceChildren(h('p.drv-img-note', { text: 'This drawing is no longer in your Drive. The frame keeps only the link, so delete the frame or draw it again.' }));
    } else if (tokenGone(e)) {
      reconnectBox(el);
    } else {
      el.replaceChildren(
        h('p.drv-img-note', { text: 'Drive did not send the drawing (' + String((e && e.message) || 'unknown error').slice(0, 120) + ').' }),
        button({ label: 'Try again', size: 'sm', action: 'drive-img-retry', class: 'drv-img-reconnect' })
      );
    }
  }
}

function keep(id, blob) {
  if (!urls.has(id)) urls.set(id, URL.createObjectURL(blob));
  blobs.set(id, blob);
}

/** The object URL of a picture this page visit already holds, or ''.
    The PDF storyboard sheet prints these; it never fetches. */
export const cachedImageUrl = (fileId) => urls.get(fileId) || '';

/** A frame picture as a Blob: the one already held, else one download
    with the Drive token (rejects with no token; never opens a window). */
export async function driveImageBlob(fileId) {
  if (blobs.has(fileId)) return blobs.get(fileId);
  const blob = await Drive.downloadFileBlob(fileId);
  if (!blob || !/^image\//.test(blob.type || 'image/')) throw new Error('Drive returned something that is not a picture.');
  keep(fileId, blob);
  return blob;
}

/** A frame's picture, from Drive. Fills itself; never a broken <img>. */
export function driveImage(fileId, alt) {
  wire();
  const el = h('div.drv-img', { 'data-drive-file': fileId, 'data-alt': alt || 'Storyboard frame' });
  Promise.resolve().then(() => fill(el));
  return el;
}

export function refreshDriveImages() {
  if (typeof document === 'undefined') return;
  document.querySelectorAll('[data-drive-file]').forEach((el) => fill(el));
}
// A reconnect from anywhere (here or the AI Desk) redraws every frame first.
onDriveReconnect(refreshDriveImages);

let wired = false;
/** Bind the Reconnect / Try again clicks (once). driveImage() does it
    itself; a page that draws its own Reconnect control calls this. */
export function wireDriveImages() { wire(); }
function wire() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="drive-reconnect"]', (e, btn) => {
    btn.disabled = true;
    reconnectDrive().catch((err) => {
      btn.disabled = false;
      const box = btn.closest('.drv-img, .drv-gate');
      const note = box && box.querySelector('.drv-img-note');
      if (note) note.textContent = 'Google did not reconnect (' + String((err && err.message) || 'dismissed').slice(0, 120) + '). Try again.';
    });
  });
  delegate(document, 'click', '[data-action="drive-img-retry"]', (e, btn) => {
    const box = btn.closest('.drv-img');
    if (box) fill(box);
  });
}

export default { boardFacts, currentBoardGate, driveImage, refreshDriveImages, reconnectDrive, onDriveReconnect, cachedImageUrl, driveImageBlob };
