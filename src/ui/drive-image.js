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
import { isConnected } from '../lib/drive-sync.js';
import { boardGate } from '../lib/board-frames.js';
import { h, delegate } from '../lib/dom.js';
import { button } from './kit/index.js';

/** The four facts, read now. */
export function boardFacts() {
  const c = typeof window !== 'undefined' ? window.StudioCloud : null;
  let signedIn = false;
  try { signedIn = !!(c && c.getSession && c.getSession()); } catch (e) { signedIn = false; }
  return {
    configured: Drive.isConfigured(),
    signedIn,
    connected: isConnected(),
    token: Drive.hasToken()
  };
}
export const currentBoardGate = () => boardGate(boardFacts());

const urls = new Map();       // fileId → object URL, for this page visit
const listeners = new Set();
/** Called after a reconnect, so a page can redraw what depended on it. */
export function onDriveReconnect(cb) { listeners.add(cb); return () => listeners.delete(cb); }

const tokenGone = (e) => !!e && (e.status === 401
  || /click|token|popup|unauthori[sz]ed/i.test(String((e && e.message) || e)));

/** Only from a click: ask Google for a token, then redraw. */
export async function reconnectDrive() {
  await Drive.getToken({ interactive: true });
  refreshDriveImages();
  listeners.forEach((cb) => { try { cb(); } catch (e) { /* a listener is not the reconnect */ } });
}

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
    urls.set(id, URL.createObjectURL(blob));
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

export default { boardFacts, currentBoardGate, driveImage, refreshDriveImages, reconnectDrive, onDriveReconnect };
