/* ============================================================
   BOARD FRAMES — drawn storyboard frames, the pure half
   ------------------------------------------------------------
   NEXT-UI-REVAMP-PLAN-2026-10-14 phase 4. The AI Desk task
   `board-frames` (src/lib/ai-tasks.js) draws a picture per shot with
   Gemini's image model and, on Accept, saves each ticked picture as a
   FILE IN THE WRITER'S OWN GOOGLE DRIVE. The frame record keeps the
   reference and nothing else: `ref` = `drive:<fileId>` (drive.js
   driveRef), on an existing field of an existing record
   (shots.js blankFrame). No new storage key, no bytes in
   localStorage, and so no bytes in a backup file — a backup carries
   the reference, the image stays in Drive. The UI says so.

   This module is PURE — no imports, no DOM, no storage — so every
   rule here is tested in Node (scripts/test-board-frames.mjs):

     STYLES          the looks the writer picks per run
     boardGate()     may generation run? signed in, Drive reachable,
                     Drive connected, a live Drive token; else WHY
     boardJobs()     the shots to draw (those without a drawn frame)
     boardInput()    the text the Desk shows and sends (editable)
     parseBoardInput() that text back: style + the lines kept
     framePrompt()   one shot as an image prompt
     styleFromRefine() the style a chat chip asked for
     frameFileName() the Drive file name
   ============================================================ */

/** At most this many pictures per run: each is a separate paid call. */
export const MAX_FRAMES = 8;

export const STYLES = [
  { id: 'pencil', label: 'Pencil sketch', prompt: 'a rough black-and-white pencil storyboard sketch, loose lines, light hatching, no colour' },
  { id: 'ink',    label: 'Ink and wash',  prompt: 'a black ink storyboard drawing with grey wash shading, clean outlines' },
  { id: 'marker', label: 'Marker',        prompt: 'a storyboard drawing in grey markers with bold outlines, the way a storyboard artist works on set' },
  { id: 'colour', label: 'Colour',        prompt: 'a colour storyboard illustration, painterly, with the lighting and palette of the scene' }
];
export const DEFAULT_STYLE = STYLES[0].id;
const styleById = Object.fromEntries(STYLES.map((s) => [s.id, s]));
export const styleOf = (id) => styleById[id] || styleById[DEFAULT_STYLE];

/** A style id from free text: a label, an id, or a word of either. */
export function matchStyle(text) {
  const t = String(text || '').trim().toLowerCase();
  if (!t) return '';
  for (const s of STYLES) if (t === s.id || t === s.label.toLowerCase()) return s.id;
  for (const s of STYLES) if (t.includes(s.label.toLowerCase()) || t.includes(s.id)) return s.id;
  if (/\bcolor\b/.test(t)) return 'colour';
  return '';
}

/* ---- the gate --------------------------------------------------
   facts: { configured, signedIn, connected, token }
     configured  this build has a Google client id (drive.js)
     signedIn    a Supabase session (Google sign-in) on this page
     connected   Drive is connected on this device (drive-sync.js)
     token       a live Drive token is held right now
   Returns { ok: true } or { ok: false, state, text, href?, hrefLabel?,
   reconnect? }. The ORDER is the order the writer has to fix them in. */
export function boardGate(facts = {}) {
  if (!facts.configured) {
    return { ok: false, state: 'nodrive',
      text: 'Drawn frames are saved only to Google Drive, and this build of the studio cannot reach Drive.' };
  }
  if (!facts.signedIn) {
    return { ok: false, state: 'signedout',
      text: 'Continue with Google first. Drawn frames are saved to your own Google Drive, never in this browser.',
      href: 'settings.html#account', hrefLabel: 'Continue with Google' };
  }
  if (!facts.connected) {
    return { ok: false, state: 'noconnect',
      text: 'Connect Google Drive first. Drawn frames are saved there, never in this browser.',
      href: 'settings.html#drive', hrefLabel: 'Connect Drive in Settings' };
  }
  if (!facts.token) {
    return { ok: false, state: 'reconnect', reconnect: true,
      text: 'Google lets Drive stay connected for about an hour at a time. Reconnect to draw frames and to show the ones you have.' };
  }
  return { ok: true, state: 'ok', text: '' };
}

/* ---- what to draw ------------------------------------------------ */
const slug = (scene) => scene
  ? (scene.intExt || 'INT') + '. ' + (scene.location || 'Location TBC') + ' — ' + (scene.dayNight || 'DAY')
  : 'Scene deleted';

/** The label a line is matched back by: scene number . shot number. */
export function shotLabel(shot, scene) {
  const sn = String((scene && scene.number) || '?').replace(/\s+/g, '');
  const n = String((shot && shot.number) || '?').replace(/\s+/g, '');
  return sn + '.' + n;
}

/** Is this ref a drawn (Drive-held) image? */
export const isDrawnRef = (ref) => /^drive:[A-Za-z0-9_-]{8,}$/.test(String(ref || '').trim());

/**
 * The shots to draw, in shot-list order: every shot (or those in
 * `onlyShotIds`) that has no frame with a drawn image yet.
 * Returns { jobs: [{ shotId, label, shot, scene }], more } — `more`
 * is how many were left out by MAX_FRAMES.
 */
export function boardJobs({ shots = [], scenes = [], frames = [], onlyShotIds = null, max = MAX_FRAMES } = {}) {
  const sceneById = new Map(scenes.map((s) => [s.id, s]));
  const drawn = new Set(frames.filter((f) => f && isDrawnRef(f.ref)).map((f) => f.shotId));
  const only = onlyShotIds ? new Set([].concat(onlyShotIds).map(String)) : null;
  const want = shots.filter((s) => s && (!only || only.has(String(s.id))) && !drawn.has(s.id));
  const jobs = want.slice(0, max).map((shot) => {
    const scene = sceneById.get(shot.sceneId) || null;
    return { shotId: shot.id, label: shotLabel(shot, scene), shot, scene };
  });
  return { jobs, more: Math.max(0, want.length - jobs.length) };
}

const oneLine = (v, max = 220) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

/** One line of the input: label | camera | slug | what we see. */
export function jobLine(job) {
  const s = job.shot || {};
  const cam = [s.size, s.angle, s.lens, s.movement].filter(Boolean).join(' · ');
  return job.label + ' | ' + cam + ' | ' + slug(job.scene) + ' | ' + (oneLine(s.description) || oneLine(job.scene && job.scene.synopsis) || 'no description');
}

/** The Desk's "what goes in" text. Editable: delete a line to skip it. */
export function boardInput({ jobs, more = 0 }, style = DEFAULT_STYLE) {
  const lines = [
    'Style: ' + styleOf(style).label,
    'Aspect: 16:9',
    ''
  ].concat(jobs.map(jobLine));
  if (more) lines.push('', '(' + more + ' more shot' + (more === 1 ? '' : 's') + ' without a drawing — run again after this one.)');
  return lines.join('\n');
}

/**
 * The input text back: { style, labels: [label…] } — the labels kept,
 * in the order they appear. A line is a shot line when it starts with
 * a label and a '|'. Lines the writer edited keep their label, and the
 * prompt is rebuilt from the shot itself, so what is drawn is always
 * the shot as the shot list holds it.
 */
export function parseBoardInput(text) {
  let style = DEFAULT_STYLE;
  const labels = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^style\s*:\s*(.+)$/i.exec(line);
    if (m) { style = matchStyle(m[1]) || style; continue; }
    const l = /^([^\s|]+)\s*\|/.exec(line);
    if (l && !labels.includes(l[1])) labels.push(l[1]);
  }
  return { style, labels };
}

/** The style the newest chat request names, else the current one, and
    the free-text notes (anything that is not a style) to add. */
export function styleFromRefine(instructions, current = DEFAULT_STYLE) {
  let style = current;
  const notes = [];
  for (const t of [].concat(instructions || [])) {
    const s = matchStyle(t);
    if (s) style = s;
    else if (String(t || '').trim()) notes.push(oneLine(t, 300));
  }
  return { style, notes };
}

/** One shot as an image prompt. No names of real people; the cast are
    the characters the scene lists. */
export function framePrompt(job, style = DEFAULT_STYLE, notes = []) {
  const s = job.shot || {};
  const sc = job.scene || {};
  const castList = sc.elements && Array.isArray(sc.elements.cast) ? sc.elements.cast : [];
  const cast = castList.map((c) => oneLine(c, 40)).filter(Boolean).slice(0, 8);
  const parts = [
    'Draw one film storyboard frame as ' + styleOf(style).prompt + '.',
    'Shot: ' + [s.size && ('size ' + s.size), s.angle && ('angle ' + s.angle), s.lens && ('lens ' + s.lens), s.movement && ('movement ' + s.movement)].filter(Boolean).join(', ') + '.',
    'Setting: ' + slug(job.scene) + '.',
    s.description ? 'What we see: ' + oneLine(s.description, 600) + '.' : '',
    sc.synopsis ? 'The scene: ' + oneLine(sc.synopsis, 400) + '.' : '',
    cast.length ? 'Characters in the scene: ' + cast.join(', ') + '.' : '',
    s.rig ? 'Lighting and rig: ' + oneLine(s.rig, 200) + '.' : '',
    'Frame it as the camera sees it, 16:9. No text, captions, labels, panel borders or watermarks in the image.'
  ];
  for (const n of [].concat(notes || [])) if (n) parts.push('The writer also asks: ' + oneLine(n, 300) + '.');
  return parts.filter(Boolean).join(' ');
}

/** The Drive file name: a human scrolling their Drive can tell what it is. */
export function frameFileName(job, mime = 'image/png', at = new Date()) {
  const ext = /jpe?g/.test(mime) ? 'jpg' : /webp/.test(mime) ? 'webp' : 'png';
  const stamp = at.toISOString().slice(0, 19).replace(/[:T]/g, '-');
  const label = String(job.label || 'shot').replace(/[^A-Za-z0-9.-]+/g, '_');
  return 'filmmakers-studio-frame-' + label + '-' + stamp + '.' + ext;
}

/* ---- an UPLOADED frame ------------------------------------------
   The writer's own drawing or photo, saved the same way a drawn frame
   is: a file in their Google Drive, and `ref = drive:<fileId>` on the
   frame. Shrunk first, so a 12-megapixel phone photo does not cost a
   12-megapixel upload: its long edge is brought down to UPLOAD_EDGE
   and it is re-encoded as JPEG. */
export const UPLOAD_EDGE = 1600;
export const UPLOAD_QUALITY = 0.85;
/** Bigger than this is refused before it is read (a 40 MB RAW is not a frame). */
export const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
export const UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

/** { w, h } scaled to fit inside `edge` on the long side; never enlarged. */
export function fitWithin(w, h, edge = UPLOAD_EDGE) {
  const W = Math.max(0, Math.round(Number(w) || 0)), H = Math.max(0, Math.round(Number(h) || 0));
  if (!W || !H) return { w: 0, h: 0 };
  const k = Math.min(1, edge / Math.max(W, H));
  return { w: Math.max(1, Math.round(W * k)), h: Math.max(1, Math.round(H * k)) };
}

/** Why a picked file cannot be a frame, or '' when it can. */
export function uploadProblem(file) {
  if (!file) return 'No file was chosen.';
  if (!UPLOAD_TYPES.includes(String(file.type || '').toLowerCase())) {
    return 'That file is not a picture the studio can read. Choose a JPEG, PNG, WebP or GIF.';
  }
  if (Number(file.size) > UPLOAD_MAX_BYTES) return 'That picture is larger than 25 MB. Choose a smaller one.';
  return '';
}

/* ---- the frame's shape -------------------------------------------
   `aspect` is a FIELD on the frame record (shots.js blankFrame), ''
   meaning the board's default. The ids are what the slate's
   [data-aspect] rules in visualize.css key off, so they are stored
   values: do not rename one. */
export const ASPECTS = [
  { id: '16:9', label: '16:9 (HD)' },
  { id: '2.39:1', label: '2.39:1 (scope)' },
  { id: '1.85:1', label: '1.85:1 (flat)' },
  { id: '4:3', label: '4:3' },
  { id: '1:1', label: '1:1 (square)' },
  { id: '9:16', label: '9:16 (vertical)' }
];
export const DEFAULT_ASPECT = '16:9';
/** A stored aspect, or the default for '' and anything unknown. */
export const aspectOf = (id) => (ASPECTS.some((a) => a.id === id) ? id : DEFAULT_ASPECT);

/* ---- many pictures at once ------------------------------------------
   A drop of several images onto a shot (or a multi-pick) is ONE FRAME
   PER IMAGE, uploaded ONE AT A TIME through the same single-frame path
   (frame-upload.js uploadToFrame). Sequential on purpose: Drive is the
   writer's own quota and token, a token that lapses mid-run fails the
   rest the same way, and each frame is either fully made or not made.

   Pure orchestration, so it runs in Node with the I/O passed in:
     addFrame(file, i)       → the new frame record (written by the caller)
     uploadOne(file, frame)  → { ok, id?, why? } (or throws)
     removeFrame(frame)      → undo an empty frame whose upload failed
     onProgress(i, n, file)  → before each upload
   Files that are not pictures are refused before any frame is made. */
export async function runBulkUpload(files, io = {}) {
  const list = Array.from(files || []);
  const accepted = [], refused = [];
  for (const file of list) {
    const why = uploadProblem(file);
    if (why) refused.push({ file, why }); else accepted.push(file);
  }
  const made = [], failed = [];
  for (const [i, file] of accepted.entries()) {
    if (io.onProgress) io.onProgress(i, accepted.length, file);
    const frame = io.addFrame(file, i);
    let r = null;
    try { r = await io.uploadOne(file, frame); }
    catch (e) { r = { ok: false, why: String((e && e.message) || e || 'unknown error') }; }
    if (r && r.ok) made.push({ frame, id: r.id || '' });
    else {
      if (io.removeFrame) io.removeFrame(frame);
      failed.push({ file, why: (r && r.why) || 'not saved' });
      if (r && r.stop) {           // the gate closed: the rest would fail the same way
        const why = (r && r.why) || 'not saved';
        for (const rest of accepted.slice(i + 1)) failed.push({ file: rest, why, skipped: true });
        break;
      }
    }
  }
  return { made, refused, failed };
}

/** The one sentence a bulk run ends on. */
export function bulkSummary({ made = [], refused = [], failed = [] } = {}) {
  const n = (k, one, many) => k + ' ' + (k === 1 ? one : many);
  const parts = [];
  if (made.length) parts.push(n(made.length, 'picture', 'pictures') + ' saved to your Google Drive, one frame each');
  if (refused.length) parts.push(n(refused.length, 'file was', 'files were') + ' not a picture the studio can read');
  if (failed.length) parts.push(n(failed.length, 'picture', 'pictures') + ' did not upload (' + String(failed[0].why).slice(0, 80) + ')');
  return parts.length ? parts.join('; ') + '.' : 'Nothing to upload.';
}

export default {
  MAX_FRAMES, STYLES, DEFAULT_STYLE, styleOf, matchStyle, boardGate, shotLabel, isDrawnRef,
  boardJobs, jobLine, boardInput, parseBoardInput, styleFromRefine, framePrompt, frameFileName,
  UPLOAD_EDGE, UPLOAD_QUALITY, UPLOAD_MAX_BYTES, UPLOAD_TYPES, fitWithin, uploadProblem,
  ASPECTS, DEFAULT_ASPECT, aspectOf, runBulkUpload, bulkSummary
};
