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

   MANY AT ONCE (20 Oct 2026): uploadManyToFrames() is a drop of
   several pictures onto a shot — one new frame per picture, each
   through uploadToFrame() in turn (board-frames.js runBulkUpload).
   ============================================================ */
import Drive, { driveRef, driveFileIdOf } from '../lib/drive.js';
import { currentBoardGate, reconnectDrive } from '../lib/drive-board.js';
import {
  fitWithin, uploadProblem, frameFileName, UPLOAD_EDGE, UPLOAD_QUALITY, runBulkUpload, bulkSummary
} from '../lib/board-frames.js';

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

/** Ask for a file, the way a click must: a hidden input, opened now.
    `many` lets the writer pick several (it resolves to an array then). */
export function chooseFile(many = false) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp,image/gif';
    input.multiple = !!many;
    input.hidden = true;
    input.addEventListener('change', () => {
      const files = input.files ? Array.from(input.files) : [];
      resolve(many ? files : (files[0] || null));
      input.remove();
    }, { once: true });
    input.addEventListener('cancel', () => { resolve(many ? [] : null); input.remove(); }, { once: true });
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
 *   file         optional: the picture already in hand (a drop), so
 *                no chooser opens
 *   quiet        optional: no notices and no Undo toast (a bulk run
 *                says one sentence for all of them)
 * }
 * Answers { ok, id?, why?, stop? } so a bulk run can count; a single
 * press ignores the answer.
 */
export async function uploadToFrame(o) {
  const gate = currentBoardGate();
  if (!gate.ok) {
    if (o.file) {                    // a drop cannot open Google's window: say what to press
      const why = gate.reconnect ? 'Drive needs reconnecting: press Reconnect Drive, then add the pictures again.'
        : (GATE_WORDS[gate.state] || gate.text);
      if (!o.quiet) o.say(why);
      return { ok: false, why, stop: true };
    }
    if (gate.reconnect) {
      try { await reconnectDrive(); o.say('Drive is connected again. Press Upload once more to choose the picture.'); }
      catch (e) { o.say('Google did not reconnect Drive (' + String((e && e.message) || 'cancelled').slice(0, 80) + ').'); }
      return { ok: false, why: 'reconnect', stop: true };
    }
    o.say(GATE_WORDS[gate.state] || gate.text);
    return { ok: false, why: GATE_WORDS[gate.state] || gate.text, stop: true };
  }
  const file = o.file || await chooseFile();
  if (!file) return { ok: false, why: 'No file was chosen.' };
  const why = uploadProblem(file);
  if (why) { if (!o.quiet) o.say(why); return { ok: false, why }; }
  if (!o.quiet) o.say('Uploading the picture to your Google Drive…');
  let meta;
  try {
    const blob = await shrinkImage(file);
    meta = await Drive.createFile(frameFileName({ label: o.label }, 'image/jpeg'), blob, 'image/jpeg',
      { description: 'Storyboard frame for shot ' + o.label + ' (the shot list links to this file).' });
    if (!meta || !meta.id) throw new Error('Drive did not return a file id.');
  } catch (e) {
    const msg = String((e && e.message) || 'unknown error').slice(0, 120);
    if (!o.quiet) o.say('The picture was not saved (' + msg + '). The frame is unchanged.');
    return { ok: false, why: msg };
  }
  const before = String(o.frame.ref || '');
  o.update({ ref: driveRef(meta.id) });
  if (o.quiet) return { ok: true, id: meta.id };
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
  return { ok: true, id: meta.id };
}

/**
 * Several pictures onto one shot: ONE NEW FRAME PER PICTURE, each sent
 * through uploadToFrame() in turn. A frame whose upload fails is taken
 * away again, so no empty frame is left behind; one Undo removes every
 * frame the run made and deletes its files from Drive.
 * o = {
 *   files        the dropped or picked File objects
 *   label        (frame) => the Drive file name's label for that frame
 *   addFrame     () => a new frame record (Shots.addFrame(shotId))
 *   updateFrame  (id, patch) => write a frame
 *   removeFrame  (id) => delete a frame
 *   after, toast, say   as for uploadToFrame
 * }
 */
export async function uploadManyToFrames(o) {
  const gate = currentBoardGate();
  if (!gate.ok) {
    o.say(gate.reconnect ? 'Drive needs reconnecting: press Reconnect Drive, then add the pictures again.'
      : (GATE_WORDS[gate.state] || gate.text));
    return { made: [], refused: [], failed: [] };
  }
  const res = await runBulkUpload(o.files, {
    addFrame: () => o.addFrame(),
    removeFrame: (frame) => o.removeFrame(frame.id),
    onProgress: (i, n) => o.say('Uploading picture ' + (i + 1) + ' of ' + n + ' to your Google Drive…'),
    uploadOne: (file, frame) => uploadToFrame({
      frame, file, quiet: true, label: o.label(frame),
      update: (patch) => o.updateFrame(frame.id, patch), after: () => {}, toast: o.toast, say: o.say
    })
  });
  o.after();
  const text = bulkSummary(res);
  try {
    if (res.made.length) {
      o.toast(text, {
        type: res.failed.length || res.refused.length ? 'info' : 'success', action: 'Undo',
        onAction: () => {
          for (const m of res.made) { o.removeFrame(m.frame.id); Drive.deleteFileQuiet(m.id).catch(() => {}); }
          o.after();
        }
      });
    } else o.say(text);
  } catch (e) { /* chrome may not be up */ }
  return res;
}

export default { uploadToFrame, uploadManyToFrames, chooseFile, shrinkImage };
