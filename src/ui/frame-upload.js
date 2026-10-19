/* ============================================================
   FRAME UPLOAD — the writer's own picture on a storyboard frame
   ------------------------------------------------------------
   The same road a drawn frame takes (src/lib/ai-tasks.js, the
   board-frames task): the picture becomes a FILE IN THE WRITER'S OWN
   GOOGLE DRIVE and the frame keeps `ref = drive:<fileId>` and nothing
   else. No bytes reach localStorage, so none reach a backup file
   either, and no new storage key exists for any of it.

   The order is the gate's (board-frames.js boardGate): this build
   reaches Drive, a Google sign-in, Drive connected on this device, a
   live token. A lapsed token is the one gap a click can close, and
   the Upload press IS a click, so it reconnects and asks to be
   pressed again (the file picker must open inside a click as well,
   and Google's window has used that one up).

   The picture is shrunk before it leaves (fitWithin, UPLOAD_EDGE) and
   re-encoded as JPEG on a white ground, so a transparent PNG does not
   turn black. Undo puts the frame's previous reference back and
   deletes the new file from Drive; an earlier Drive picture on the
   frame is never deleted, because the writer may still want it.
   ============================================================ */
import Drive, { driveRef, driveFileIdOf } from '../lib/drive.js';
import { currentBoardGate, reconnectDrive } from '../lib/drive-board.js';
import { fitWithin, uploadProblem, frameFileName, UPLOAD_EDGE, UPLOAD_QUALITY } from '../lib/board-frames.js';

/** Shrink a picked image to fit UPLOAD_EDGE and return a JPEG Blob. */
export async function shrinkImage(file, edge = UPLOAD_EDGE, quality = UPLOAD_QUALITY) {
  let bmp = null;
  let w = 0, hgt = 0, draw = null;
  if (typeof globalThis.createImageBitmap === 'function') {
    bmp = await globalThis.createImageBitmap(file);
    w = bmp.width; hgt = bmp.height;
    draw = (ctx, W, H) => ctx.drawImage(bmp, 0, 0, W, H);
  } else {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise((res, rej) => {
        const i = new Image();
        i.onload = () => res(i);
        i.onerror = () => rej(new Error('The picture could not be read.'));
        i.src = url;
      });
      w = img.naturalWidth; hgt = img.naturalHeight;
      draw = (ctx, W, H) => ctx.drawImage(img, 0, 0, W, H);
    } finally { URL.revokeObjectURL(url); }
  }
  const size = fitWithin(w, hgt, edge);
  if (!size.w) throw new Error('The picture has no size the studio can read.');
  const canvas = document.createElement('canvas');
  canvas.width = size.w; canvas.height = size.h;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = 'white';   // the paper behind a transparent PNG; not a design colour
  ctx.fillRect(0, 0, size.w, size.h);
  draw(ctx, size.w, size.h);
  if (bmp && bmp.close) bmp.close();
  const blob = await new Promise((res) => canvas.toBlob(res, 'image/jpeg', quality));
  if (!blob) throw new Error('The picture could not be prepared for upload.');
  return blob;
}

/* The gate's refusals, said for an upload rather than a drawing. */
const GATE_WORDS = {
  nodrive: 'Pictures are saved only to Google Drive, and this build of the studio cannot reach Drive.',
  signedout: 'Sign in with Google first (Settings → Account). Pictures are saved to your own Google Drive, never in this browser.',
  noconnect: 'Connect Google Drive first (Settings → Google Drive). Pictures are saved there, never in this browser.'
};

/** Ask for a file, the way a click must: a hidden input, opened now. */
function chooseFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.hidden = true;
    input.addEventListener('change', () => { resolve(input.files && input.files[0] ? input.files[0] : null); input.remove(); }, { once: true });
    input.addEventListener('cancel', () => { resolve(null); input.remove(); }, { once: true });
    document.body.append(input);
    input.click();
  });
}

/**
 * The Upload press on a frame.
 * o = {
 *   frame        the frame record ({ id, ref })
 *   label        the shot's label, for the Drive file name ("4.1")
 *   update       (patch) => write the frame (Shots.updateFrame)
 *   after        () => redraw
 *   toast        (msg, opts) => { dismiss }
 *   say          (msg) => a plain notice
 * }
 */
export async function uploadToFrame(o) {
  const gate = currentBoardGate();
  if (!gate.ok) {
    if (gate.reconnect) {
      try { await reconnectDrive(); o.say('Drive is connected again. Press Upload once more to choose the picture.'); }
      catch (e) { o.say('Google did not reconnect Drive (' + String((e && e.message) || 'cancelled').slice(0, 80) + ').'); }
      return;
    }
    o.say(GATE_WORDS[gate.state] || gate.text);
    return;
  }
  const file = await chooseFile();
  if (!file) return;
  const why = uploadProblem(file);
  if (why) { o.say(why); return; }
  o.say('Uploading the picture to your Google Drive…');
  let meta;
  try {
    const blob = await shrinkImage(file);
    meta = await Drive.createFile(frameFileName({ label: o.label }, 'image/jpeg'), blob, 'image/jpeg',
      { description: 'Storyboard frame for shot ' + o.label + ' (the shot list links to this file).' });
    if (!meta || !meta.id) throw new Error('Drive did not return a file id.');
  } catch (e) {
    o.say('The picture was not saved (' + String((e && e.message) || 'unknown error').slice(0, 120) + '). The frame is unchanged.');
    return;
  }
  const before = String(o.frame.ref || '');
  o.update({ ref: driveRef(meta.id) });
  o.after();
  const kept = driveFileIdOf(before) ? ' The earlier picture is still in your Drive.' : '';
  try {
    o.toast('Picture saved to your Google Drive. The frame keeps only a link to it.' + kept, {
      type: 'success', action: 'Undo',
      onAction: () => {
        o.update({ ref: before });
        o.after();
        Drive.deleteFileQuiet(meta.id).catch(() => {});
      }
    });
  } catch (e) { /* chrome may not be up */ }
}

export default { uploadToFrame, shrinkImage };
