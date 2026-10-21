/* ============================================================
   THE SHOT MODEL — shots, storyboard frames, lookbook boards
   ------------------------------------------------------------
   One representation of a shot, which the storyboard is a view of.
   Same argument as src/lib/scenes.js: build it once or build three
   islands that disagree by Friday.

   A shot BELONGS TO A SCENE and holds nothing but that scene's id.
   It never copies the slug line, the location or the time of day —
   rename a location in the breakdown and every shot card here says
   the new name, because it was never written down twice. Scenes are
   READ-ONLY from this module's point of view: src/lib/scenes.js owns
   them and nothing in the Visualize phase ever writes one.

   STORAGE CONTRACT. `fms_shots_v1` is a new key, and a new key has
   to be registered in four places or it silently misbehaves:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/lib/backup.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   All four are already done for this key. Miss #2 and a user's shot
   list is absent from the file that calls itself a full studio
   backup; that bug has already happened here once.

   ONE KEY, FOUR COLLECTIONS (shots, frames, boards, and blocking
   diagrams). Frames and lookbook boards live under
   this same key. A frame is a drawing of a shot and has no life
   without one; a lookbook is the same act of seeing the film before
   it exists. Each collection is read and written through a
   read-modify-write so that saving one never drops the other two.

   NO IMAGES, ANYWHERE. This studio is local-first: everything a user
   writes lives in their browser's localStorage, which is a handful of
   megabytes shared by the whole project and is not a file store. A
   base64 frame would blow the quota, would be copied into every
   backup, and would be synced over a column meant for text. So a
   frame and a lookbook entry carry a `ref` — a URL the user pastes,
   or a description in words — and never bytes. The UI says so out
   loud rather than letting somebody discover it by losing work.
   A frame's PICTURE (drawn with AI, or uploaded by the writer through
   src/ui/frame-upload.js) is a file in the writer's own Google Drive,
   and the frame's `ref` is `drive:<fileId>`: still a reference, still
   no bytes here.

   COUNTS ARE DERIVED. The number of shots in a scene is counted at
   render time, never stored. A stored count is the second
   representation the trap list warns about: it goes stale the first
   time a shot is deleted and inflates a denominator forever.
   ============================================================ */
import Store from './store.js';   // load-bearing: namespaces localStorage

export const SHOTS_KEY = 'fms_shots_v1';

/* The vocabulary, widest to tightest as a camera department says it.
   Value is the abbreviation that goes on the sheet; the label is what
   the picker shows, because "MLS" teaches nobody anything. */
export const SHOT_SIZES = [
  { id: 'EWS', label: 'EWS · extreme wide' },
  { id: 'WS',  label: 'WS · wide' },
  { id: 'LS',  label: 'LS · long' },
  { id: 'MLS', label: 'MLS · medium long' },
  { id: 'MS',  label: 'MS · medium' },
  { id: 'MCU', label: 'MCU · medium close' },
  { id: 'CU',  label: 'CU · close-up' },
  { id: 'ECU', label: 'ECU · extreme close' }
];

export const SHOT_ANGLES = ['eye level', 'high', 'low', 'overhead', 'dutch'];

/* Common focal lengths, offered as suggestions on the free-text lens
   field (a <datalist>), never enforced: "35mm", "24-70 @ 50" and
   "anamorphic 40" all stay valid, because the lens a crew writes is
   whatever their kit is called. */
export const SHOT_LENSES = ['14mm', '18mm', '24mm', '28mm', '35mm', '50mm', '85mm', '100mm', '135mm', '200mm', 'zoom'];

export const SHOT_MOVEMENTS = [
  'static', 'pan', 'tilt', 'dolly', 'track', 'handheld', 'crane', 'drone'
];

/* Suggested board names, in the order a director usually builds them.
   Only a suggestion for the next board's name — the name is a plain
   editable string and a user can call a board anything. */
export const BOARD_SUGGESTIONS = [
  'Palette', 'Light', 'Texture', 'Wardrobe', 'Location', 'Camera', 'Sound'
];

const uid = (p) =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : p + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** A shot with every field present, so callers never guard for undefined. */
export function blankShot(patch = {}) {
  return {
    id: uid('sh'),
    sceneId: '',
    number: '',
    size: 'MS',
    angle: SHOT_ANGLES[0],
    movement: SHOT_MOVEMENTS[0],
    lens: '',
    // Lighting / rig, one line in the cinematographer's words ("Key from
    // window, handheld"). Additive: a shot stored before it existed reads
    // back '' through listShots()'s spread, so nothing migrates.
    rig: '',
    // The id of a camera MARK on this scene's blocking map, or ''. Only the
    // id is stored; the label (Cam A) and the setup are read off the map, so
    // a renamed camera is renamed here. A deleted camera leaves a dead id,
    // which camOf() reads as "no camera" rather than inventing one.
    cam: '',
    description: '',
    done: false,
    // Drafted by the AI panel rather than typed by a person. Declared
    // here so it is part of the record's contract: it survived on an
    // undeclared field only because listShots() spreads the stored
    // object over this one, which works until someone rebuilds a shot
    // from blankShot() and silently drops the provenance.
    ai: false,
    // Drafted by the BASIC breakdown (src/lib/shot-rules.js), the
    // rule-based pass that needs no key. Declared here for the same
    // reason as `ai`: provenance is part of the record, and a shot
    // rebuilt from blankShot() must not quietly lose it. Never both:
    // a shot is typed, AI-drafted or rules-drafted.
    rules: false,
    /* Three fields from the shot-list revamp (20 Oct 2026). All spread
       under every stored row by listShots(), so a shot written before
       they existed reads back with the defaults and nothing migrates —
       the shotState / songId pattern.
         mins       the time estimate for the setup, in minutes, as typed
                    ('' = no estimate). Read through shotMinutes(), never
                    parsed anywhere else.
         setup      the camera setup the shot is grouped under, in the
                    crew's words. '' means "whatever the camera link says":
                    setupOf() falls back to the blocking camera's name, so
                    the default is derived, never copied.
         numLocked  the number is the writer's and auto-numbering leaves it
                    alone. Typing a number locks it. */
    mins: '',
    setup: '',
    numLocked: false,
    ...patch
  };
}

/* ---- blocking: an overhead diagram ---------------------------
   A block is one top-down map of a scene: where the actors stand,
   where the camera sits and what it faces, and where either moves to.
   Vector data only (a few numbers per mark), so unlike a drawing it
   costs nothing against the quota. The map is 100 wide and 70 deep in
   its own units; the page scales it.

   A block belongs to a SCENE and holds only that scene's id, the way
   a shot does — never the slug. It rides in the scene's bin entry. */
export const BLOCK_W = 100;
export const BLOCK_H = 70;
export const BLOCK_KINDS = [
  { id: 'actor',  label: 'Actor' },
  { id: 'camera', label: 'Camera' },
  { id: 'track',  label: 'Dolly track' },
  { id: 'light',  label: 'Light' },
  { id: 'mark',   label: 'Mark' }
];
/* `track` and `light` came later (14 Oct 2026) and are ONE more value of
   the existing `kind` field, not a new record: a stored block written
   before they existed reads back unchanged, and an unknown kind still
   falls back to an actor in cleanMark(). A track is a rail from (x,y) to
   (toX,toY) — the same two points a move uses, so it ALWAYS has an end.
   A light is a head at (x,y) facing `rot`, like a camera. */
const TRACK_DEFAULT_LEN = 24;

/* Distances need a real scale, and the map has none until somebody says
   how wide the floor is. `widthM` is ONE field on the existing block
   record (blankBlock() spreads under every stored row, the songId
   pattern), '' until it is typed. With no width, no distance is printed:
   a callout in invented metres is a figure nobody measured. */
export function blockScale(block) {
  const w = Number(String((block && block.widthM) ?? '').replace(',', '.'));
  return Number.isFinite(w) && w > 0 ? w / BLOCK_W : null;   // metres per map unit
}

/** The derived distance callouts of a block: every camera to every actor,
    and the length of every dolly track. Metres, to a tenth, with the
    midpoint to print them at. Empty when the floor has no width — see
    blockScale(). Pure and never stored. */
export function blockCallouts(block) {
  const k = blockScale(block);
  if (!k || !block || !Array.isArray(block.marks)) return [];
  const out = [];
  const dist = (ax, ay, bx, by) => Math.round(Math.hypot(bx - ax, by - ay) * k * 10) / 10;
  const cams = block.marks.filter((m) => m.kind === 'camera');
  const actors = block.marks.filter((m) => m.kind === 'actor');
  for (const c of cams) {
    for (const a of actors) {
      out.push({ kind: 'reach', from: c.id, to: a.id, x1: c.x, y1: c.y, x2: a.x, y2: a.y,
        x: (c.x + a.x) / 2, y: (c.y + a.y) / 2, metres: dist(c.x, c.y, a.x, a.y) });
    }
  }
  for (const t of block.marks.filter((m) => m.kind === 'track' && m.toX != null)) {
    out.push({ kind: 'track', from: t.id, to: t.id, x1: t.x, y1: t.y, x2: t.toX, y2: t.toY,
      x: (t.x + t.toX) / 2, y: (t.y + t.toY) / 2, metres: dist(t.x, t.y, t.toX, t.toY) });
  }
  return out;
}

/** "3.4 m" — one decimal, a comma never; the unit is always printed. */
export const formatMetres = (m) => (Number.isFinite(m) ? (Math.round(m * 10) / 10).toFixed(1) + ' m' : '');

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
/** A point kept inside the map, as numbers rounded to a tenth. */
export function clampPoint(x, y) {
  const nx = Number(x), ny = Number(y);
  return {
    x: Math.round(clamp(Number.isFinite(nx) ? nx : BLOCK_W / 2, 0, BLOCK_W) * 10) / 10,
    y: Math.round(clamp(Number.isFinite(ny) ? ny : BLOCK_H / 2, 0, BLOCK_H) * 10) / 10
  };
}

/** One mark on the map. `toX`/`toY` are null until it has a move. */
export function blankMark(patch = {}) {
  return {
    id: uid('mk'),
    kind: 'actor',
    label: '',
    x: BLOCK_W / 2,
    y: BLOCK_H / 2,
    rot: 0,          // degrees, 0 = facing up the map
    toX: null,
    toY: null,
    ...patch
  };
}

export function blankBlock(patch = {}) {
  return { id: uid('bk'), sceneId: '', name: '', note: '', widthM: '', marks: [], ...patch };
}

function cleanMark(m) {
  const base = blankMark();
  const out = { ...base, ...m };
  out.kind = BLOCK_KINDS.some((k) => k.id === out.kind) ? out.kind : 'actor';
  Object.assign(out, clampPoint(out.x, out.y));
  out.rot = ((Math.round(Number(out.rot) || 0) % 360) + 360) % 360;
  if (out.toX == null || out.toY == null || !Number.isFinite(Number(out.toX)) || !Number.isFinite(Number(out.toY))) {
    out.toX = null; out.toY = null;
    if (out.kind === 'track') {          // a rail always has two ends
      const t = clampPoint(out.x + TRACK_DEFAULT_LEN, out.y); out.toX = t.x; out.toY = t.y;
    }
  } else {
    const t = clampPoint(out.toX, out.toY); out.toX = t.x; out.toY = t.y;
  }
  out.label = String(out.label ?? '');
  return out;
}

/** A storyboard frame. `ref` is a URL, a description or `drive:<fileId>` — never bytes. */
export function blankFrame(patch = {}) {
  return {
    id: uid('fr'),
    shotId: '',
    caption: '',
    ref: '',
    /* The frame's shape on the board: an id from board-frames.js ASPECTS,
       '' meaning the default (16:9). A FIELD spread under every stored row
       by listFrames(), so an older frame reads back '' and needs no
       migration or new key — the shotState pattern. */
    aspect: '',
    /* The board panel's three lines (20 Oct 2026), Boords-style. Spread
       under every stored row like `aspect`. `action` is what happens in
       the frame; a frame written before it existed kept that in
       `caption`, so frameAction() reads `caption` while `action` is
       empty, and the first edit MOVES it (setFrameAction) rather than
       copying it — one representation, not two. */
    action: '',
    dialogue: '',
    camera: '',
    ...patch
  };
}

/** What happens in the frame: `action`, or the older `caption` it replaced. */
export function frameAction(frame) {
  if (!frame) return '';
  const a = String(frame.action ?? '');
  return a !== '' ? a : String(frame.caption ?? '');
}

/** The patch that writes a frame's action: the caption it may still be
    held in is cleared in the same write, so the text lives in one field. */
export const actionPatch = (value) => ({ action: String(value ?? ''), caption: '' });

/** A lookbook board. Entries live ON the board rather than in a flat
    list keyed by board index — indices renumber when a board moves,
    and the stranded-key bug on the trap list is what that costs. */
export function blankBoard(patch = {}) {
  return {
    id: uid('bd'),
    name: '',
    note: '',
    entries: [],
    ...patch
  };
}

export function blankEntry(patch = {}) {
  return {
    id: uid('en'),
    title: '',
    ref: '',
    why: '',
    ...patch
  };
}

/** Everything persisted under the shots key, shape-guaranteed. */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(SHOTS_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { shots: [], frames: [], boards: [], blocks: [] };
  try {
    const got = JSON.parse(raw);
    const parsed = got && typeof got === 'object' && !Array.isArray(got) ? got : {};
    // An empty array is truthy — the trap that once gave returning users
    // a table with no rows and no way to add one. Check Array.isArray.
    //
    // PASSTHROUGH. Every writer here does `{ ...readAll(), x }`, so a
    // top-level field this build does not know (written by a NEWER build
    // in another tab, or synced in from one) must ride along in what
    // readAll() returns, or the first save from this tab wipes it. The
    // four collections are restated after the spread, shape-guaranteed;
    // everything else is carried through untouched. Records keep their
    // unknown fields the same way: the list readers spread the stored
    // row OVER the blank one, never pick fields out of it.
    return {
      ...parsed,
      shots:  Array.isArray(parsed.shots)  ? parsed.shots  : [],
      frames: Array.isArray(parsed.frames) ? parsed.frames : [],
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      blocks: Array.isArray(parsed.blocks) ? parsed.blocks : []
    };
  } catch (e) {
    return { shots: [], frames: [], boards: [], blocks: [] };
  }
}

function writeAll(data) {
  try {
    localStorage.setItem(SHOTS_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- shots --------------------------------------------------- */

export function listShots() {
  return readAll().shots.map((s) => ({ ...blankShot(), ...s }));
}

/** Writes the shots and leaves the frames and boards alone. The three
    collections share one key and a naive whole-blob write drops
    whichever two the caller wasn't holding. */
export function saveShots(shots) {
  return writeAll({ ...readAll(), shots });
}

/** Add a shot to a scene. The default number is the next ordinal
    WITHIN that scene, which is how a shot list is numbered — it is a
    starting value on an editable text field, not a derived count, so
    "4A" and "12B" stay possible. */
export function addShot(sceneId, patch = {}) {
  const shots = listShots();
  /* One past the highest number in the scene, not count + 1 — after a
     delete the count hands out a number already in use (audit M26). */
  const top = shots.filter((s) => s.sceneId === sceneId)
    .reduce((n, s) => Math.max(n, parseInt(s && s.number, 10) || 0), 0);
  const shot = blankShot({ sceneId, number: String(top + 1), ...patch });
  shots.push(shot);
  saveShots(shots);
  return shot;
}

export function updateShot(id, patch) {
  const shots = listShots();
  const i = shots.findIndex((s) => s.id === id);
  if (i < 0) return null;
  shots[i] = { ...shots[i], ...patch, id };   // id is not patchable
  saveShots(shots);
  return shots[i];
}

/** Removing a shot removes its frames. A frame pointing at a deleted
    shot id is a stranded record — the same defect that once inflated
    the progress denominator forever. */
export function removeShot(id) {
  const all = readAll();
  const shots = listShots().filter((s) => s.id !== id);
  const frames = all.frames.filter((f) => f && f.shotId !== id);
  writeAll({ ...all, shots, frames });
  return shots;
}

/** Move a shot within its own scene. Swapping with the neighbouring
    element of the flat array would move it across a scene boundary
    and silently reassign it, so the swap is done against the previous
    or next shot OF THE SAME SCENE. */
export function moveShot(id, delta) {
  const shots = listShots();
  const shot = shots.find((s) => s.id === id);
  if (!shot) return shots;
  const siblings = shots.filter((s) => s.sceneId === shot.sceneId);
  const at = siblings.indexOf(shot);
  const swapWith = siblings[at + delta];
  if (!swapWith) return shots;
  const i = shots.indexOf(shot);
  const j = shots.indexOf(swapWith);
  [shots[i], shots[j]] = [shots[j], shots[i]];
  saveShots(shots);
  return shots;
}

/* The shot list's optional columns, in table order. The number is
   always shown; everything else can be hidden from the screen, and the
   same choice drives the PDF and CSV columns (shotlist-export.js). Ids
   are view state, never stored on a shot. */
export const SHOT_COLUMNS = [
  { id: 'size',        label: 'Size' },
  { id: 'angle',       label: 'Angle' },
  { id: 'movement',    label: 'Move' },
  { id: 'lens',        label: 'Lens' },
  { id: 'rig',         label: 'Light / rig' },
  { id: 'setup',       label: 'Setup' },
  { id: 'mins',        label: 'Minutes' },
  { id: 'description', label: 'What we see' },
  { id: 'done',        label: 'Status' }
];
/* Every column the old sheet carried shows by default, rig included: a
   device with no saved view must not hide notes somebody already typed. */
export const DEFAULT_COLUMNS = ['size', 'angle', 'movement', 'lens', 'rig', 'setup', 'mins', 'description', 'done'];
/** A column list, cleaned: known ids only, in table order. */
export function cleanColumns(ids) {
  const want = new Set(Array.isArray(ids) ? ids : DEFAULT_COLUMNS);
  return SHOT_COLUMNS.map((c) => c.id).filter((id) => want.has(id));
}

/* ---- order, numbering and time ---------------------------------- */

/** Put one scene's shots in the order `ids` gives. The scene's shots keep
    the SLOTS they held in the flat array (so nothing crosses a scene
    boundary, the reason moveShot() swaps within a scene); ids that are
    not this scene's are ignored, and any of the scene's shots missing
    from `ids` follow in their old order. Returns the scene's shots. */
export function reorderShots(sceneId, ids) {
  const shots = listShots();
  const slots = [];
  const mine = [];
  shots.forEach((s, i) => { if (s.sceneId === sceneId) { slots.push(i); mine.push(s); } });
  const byId = new Map(mine.map((s) => [s.id, s]));
  const next = [];
  const seen = new Set();
  for (const id of ids || []) {
    const s = byId.get(id);
    if (s && !seen.has(id)) { next.push(s); seen.add(id); }
  }
  for (const s of mine) if (!seen.has(s.id)) next.push(s);
  if (next.every((s, i) => s === mine[i])) return mine;
  slots.forEach((slot, i) => { shots[slot] = next[i]; });
  saveShots(shots);
  return next;
}

/** A number the writer chose rather than one the list handed out: locked
    on purpose, or anything that is not a plain ordinal ("4A", "12B",
    "INS"). A number typed before `numLocked` existed is therefore safe
    from autoNumber() as long as it says something an ordinal cannot. */
export function isLockedNumber(shot) {
  if (!shot) return false;
  if (shot.numLocked) return true;
  const n = String(shot.number ?? '').trim();
  return n !== '' && !/^\d+$/.test(n);
}

/** PURE. The numbers autoNumber() would write, as [id, number] for every
    shot it changes. Unlocked shots count 1, 2, 3… in list order, skipping
    any number a locked shot of the scene already holds, so the two never
    collide. */
export function autoNumbers(list) {
  const taken = new Set(list.filter(isLockedNumber).map((s) => String(s.number).trim().toUpperCase()));
  const out = [];
  let n = 0;
  for (const s of list) {
    if (isLockedNumber(s)) continue;
    do { n++; } while (taken.has(String(n)));
    if (String(s.number ?? '') !== String(n)) out.push([s.id, String(n)]);
  }
  return out;
}

/** PURE. True when the list already reads as autoNumber() would leave it,
    blanks aside: every unlocked shot with a number holds its ordinal. A
    move renumbers only such a scene; a scene numbered by hand (12, 13,
    14 across the script, or 1, 2, 5 after a delete) is left as typed. */
export function isAutoOrdered(list) {
  const byId = new Map(list.map((s) => [s.id, s]));
  return autoNumbers(list).every(([id]) => String((byId.get(id) || {}).number ?? '').trim() === '');
}
/** The same question for one scene of the stored list. */
export const sceneAutoOrdered = (sceneId) => isAutoOrdered(listShots().filter((s) => s.sceneId === sceneId));

/** Renumber one scene's unlocked shots in their current order. Writes
    only when something changes; returns how many numbers moved. */
export function autoNumber(sceneId) {
  const shots = listShots();
  const changes = autoNumbers(shots.filter((s) => s.sceneId === sceneId));
  if (!changes.length) return 0;
  const to = new Map(changes);
  saveShots(shots.map((s) => (to.has(s.id) ? { ...s, number: to.get(s.id) } : s)));
  return changes.length;
}

/** A shot's time estimate in minutes, or 0. A whole-string match, the
    money.js rule: "12", "7.5", "20 min", "1h 30", "1:30" (h:mm) read;
    anything with other words in it reads 0 rather than a guess. */
export function shotMinutes(shot) {
  const t = String((shot && shot.mins) ?? '').trim().toLowerCase();
  if (!t) return 0;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)?$/);
  if (m) return Number(m[1]);
  m = t.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)(?:\s*(\d+)\s*(m|min|mins|minutes?)?)?$/);
  if (m) return Number(m[1]) * 60 + (m[3] ? Number(m[3]) : 0);
  m = t.match(/^(\d+):([0-5]\d)$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  return 0;
}

/** Total minutes over a list of shots, and how many carry an estimate. */
export function minutesOf(shots) {
  let total = 0, timed = 0;
  for (const s of shots || []) {
    const m = shotMinutes(s);
    if (m > 0) { total += m; timed++; }
  }
  return { total: Math.round(total * 10) / 10, timed, count: (shots || []).length };
}

/** "1 h 25 min", "45 min", "" for nothing. Rounded to the minute. */
export function formatMinutes(total) {
  const m = Math.round(Number(total) || 0);
  if (m <= 0) return '';
  const hrs = Math.floor(m / 60), rest = m % 60;
  return hrs ? hrs + ' h' + (rest ? ' ' + rest + ' min' : '') : rest + ' min';
}

/** Minutes per shoot day: { day → { total, timed, count, scenes } }, read
    off each scene's own `shootDay` (the stripboard's assignment; 0 is
    unscheduled and is left out). Derived on every call, never stored. */
export function minutesByDay(scenes, shots = listShots()) {
  const out = new Map();
  for (const scene of scenes || []) {
    const d = parseInt(scene && scene.shootDay, 10);
    if (!(d > 0)) continue;
    const mine = shots.filter((s) => s.sceneId === scene.id);
    const m = minutesOf(mine);
    const cur = out.get(d) || { total: 0, timed: 0, count: 0, scenes: 0 };
    out.set(d, { total: Math.round((cur.total + m.total) * 10) / 10, timed: cur.timed + m.timed, count: cur.count + m.count, scenes: cur.scenes + 1 });
  }
  return out;
}

/** The setup a shot is grouped under: its own `setup`, else the name of
    the blocking camera it is linked to, else ''. */
export function setupOf(shot, cameras) {
  const own = String((shot && shot.setup) || '').trim();
  if (own) return own;
  const cam = camOf(shot, cameras);
  return cam ? cam.name : '';
}

/** PURE. A scene's shots grouped by setup, in order of first appearance;
    shots with no setup are one last group with label ''. */
export function groupBySetup(shots, cameras) {
  const groups = new Map();
  for (const s of shots || []) {
    const k = setupOf(s, cameras);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(s);
  }
  const named = [...groups].filter(([k]) => k !== '').map(([label, list]) => ({ label, shots: list }));
  if (groups.has('')) named.push({ label: '', shots: groups.get('') });
  return named;
}

/** A shot's status as the coverage table prints it. Derived from the one
    stored boolean (`done`), never a second field: "in the can" is what the
    camera department ticks, and shoot.html's per-SCENE word lives on the
    scene record and is not this. */
export function shotStatus(shot) {
  return shot && shot.done
    ? { id: 'can', label: 'In the can', tone: 'ok' }
    : { id: 'shoot', label: 'To shoot', tone: 'warn' };
}

/** Lighting / rig suggestions for the datalist. Suggestions only. */
export const SHOT_RIGS = ['Tripod', 'Handheld', 'Gimbal', 'Steadicam', 'Dolly', 'Slider', 'Crane', 'Drone'];

/** The camera marks on a scene's blocking maps, in map order. Derived on
    every call; `blocks` may be passed to avoid a second read. `name` is what
    the picker prints: the bare label while the scene has one setup with
    cameras, "Setup 2 · Cam A" once two setups each have one. */
export function sceneCameras(sceneId, blocks = blocksOfScene(sceneId)) {
  const out = [];
  for (const b of blocks) {
    for (const m of b.marks || []) {
      if (m.kind === 'camera') out.push({ id: m.id, label: m.label || 'Camera', blockId: b.id, blockName: b.name || '' });
    }
  }
  const multi = new Set(out.map((c) => c.blockId)).size > 1;
  return out.map((c) => ({ ...c, name: multi && c.blockName ? c.blockName + ' · ' + c.label : c.label }));
}

/** The camera a shot is linked to, or null when none is set or the mark
    has since been deleted. */
export function camOf(shot, cameras) {
  if (!shot || !shot.cam) return null;
  return (cameras || sceneCameras(shot.sceneId)).find((c) => c.id === shot.cam) || null;
}

/** The shots that name this camera mark. The reverse of camOf(). */
export function shotsOfCamera(camId, shots) {
  if (!camId) return [];
  return (shots || listShots()).filter((s) => s.cam === camId);
}

/** Counts for one scene's coverage head. Derived on every call. */
export function coverageOf(shots) {
  const list = shots || [];
  const done = list.filter((s) => s.done).length;
  const lenses = [...new Set(list.map((s) => String(s.lens || '').trim()).filter(Boolean))];
  return { setups: list.length, done, open: list.length - done, lenses };
}

/** The shot list as the page reads it: one group per scene, in the
    scene model's order, plus a final group for shots whose scene has
    been deleted. Derived on every call, never stored.

    The orphan group exists on purpose. A scene deleted in the
    breakdown takes its shots out of every other view, and silently
    hidden work is lost work — so they get a group that says what
    happened and can be cleared deliberately. */
export function shotsByScene(scenes) {
  const shots = listShots();
  const known = new Set((scenes || []).map((s) => s.id));
  const groups = (scenes || []).map((scene) => ({
    scene,
    shots: shots.filter((s) => s.sceneId === scene.id)
  }));
  const orphans = shots.filter((s) => !known.has(s.sceneId));
  if (orphans.length) groups.push({ scene: null, shots: orphans });
  return groups;
}

/* ---- a scene leaving for the bin, and coming back --------------
   src/lib/scene-bin.js takes a scene and everything hung on it into
   one bin entry. These two are this module's half: every shot of the
   scene and every frame of those shots, taken out as the RAW stored
   objects with their positions, and put back at those positions.
   Raw, not through listShots(): blankShot() spread over a stored row
   would add fields it never had, and a restore has to be the same
   bytes it was. Lookbook boards belong to no scene and stay. */
export function takeSceneOut(sceneId) {
  const all = readAll();
  const shots = [], frames = [], blocks = [];
  const keepShots = [], keepFrames = [], keepBlocks = [];
  all.shots.forEach((s, index) => {
    if (s && s.sceneId === sceneId) shots.push({ index, row: s });
    else keepShots.push(s);
  });
  const gone = new Set(shots.map((x) => x.row.id));
  all.frames.forEach((f, index) => {
    if (f && gone.has(f.shotId)) frames.push({ index, row: f });
    else keepFrames.push(f);
  });
  all.blocks.forEach((b, index) => {
    if (b && b.sceneId === sceneId) blocks.push({ index, row: b });
    else keepBlocks.push(b);
  });
  if (shots.length || frames.length || blocks.length) {
    writeAll({ ...all, shots: keepShots, frames: keepFrames, blocks: keepBlocks });
  }
  return { shots, frames, blocks };
}

/** Put back what takeSceneOut() took, at its old positions (clamped
    when the list has shrunk since). A row whose id is already present
    is not put back twice. */
export function putSceneBack(snap) {
  const all = readAll();
  const shots = all.shots.slice(), frames = all.frames.slice(), blocks = all.blocks.slice();
  const haveB = new Set(blocks.map((b) => b && b.id));
  const haveS = new Set(shots.map((s) => s && s.id));
  const haveF = new Set(frames.map((f) => f && f.id));
  let n = 0;
  for (const { index, row } of (snap && snap.shots) || []) {
    if (!row || haveS.has(row.id)) continue;
    shots.splice(Math.min(index, shots.length), 0, row); n++;
  }
  for (const { index, row } of (snap && snap.frames) || []) {
    if (!row || haveF.has(row.id)) continue;
    frames.splice(Math.min(index, frames.length), 0, row); n++;
  }
  for (const { index, row } of (snap && snap.blocks) || []) {
    if (!row || haveB.has(row.id)) continue;
    blocks.splice(Math.min(index, blocks.length), 0, row); n++;
  }
  if (n) writeAll({ ...all, shots, frames, blocks });
  return n;
}

/* ---- storyboard frames ---------------------------------------- */

export function listFrames() {
  return readAll().frames.map((f) => ({ ...blankFrame(), ...f }));
}

export function saveFrames(frames) {
  return writeAll({ ...readAll(), frames });
}

export function addFrame(shotId, patch = {}) {
  const frames = listFrames();
  const frame = blankFrame({ shotId, ...patch });
  frames.push(frame);
  saveFrames(frames);
  return frame;
}

export function updateFrame(id, patch) {
  const frames = listFrames();
  const i = frames.findIndex((f) => f.id === id);
  if (i < 0) return null;
  frames[i] = { ...frames[i], ...patch, id };
  saveFrames(frames);
  return frames[i];
}

export function removeFrame(id) {
  const frames = listFrames().filter((f) => f.id !== id);
  saveFrames(frames);
  return frames;
}

export function moveFrame(id, delta) {
  const frames = listFrames();
  const frame = frames.find((f) => f.id === id);
  if (!frame) return frames;
  const siblings = frames.filter((f) => f.shotId === frame.shotId);
  const swapWith = siblings[siblings.indexOf(frame) + delta];
  if (!swapWith) return frames;
  const i = frames.indexOf(frame);
  const j = frames.indexOf(swapWith);
  [frames[i], frames[j]] = [frames[j], frames[i]];
  saveFrames(frames);
  return frames;
}

/** Frames grouped by the shot they belong to. Derived, never stored. */
export function framesByShot() {
  const map = new Map();
  for (const frame of listFrames()) {
    if (!map.has(frame.shotId)) map.set(frame.shotId, []);
    map.get(frame.shotId).push(frame);
  }
  return map;
}

/* ---- blocking diagrams ------------------------------------------ */

export function listBlocks() {
  return readAll().blocks.map((b) => {
    const row = { ...blankBlock(), ...b };
    row.marks = (Array.isArray(b && b.marks) ? b.marks : []).map(cleanMark);
    return row;
  });
}

export function saveBlocks(blocks) {
  return writeAll({ ...readAll(), blocks });
}

export function blocksOfScene(sceneId) {
  return listBlocks().filter((b) => b.sceneId === sceneId);
}

export function addBlock(sceneId, patch = {}) {
  const blocks = listBlocks();
  const n = blocks.filter((b) => b.sceneId === sceneId).length;
  const block = blankBlock({ sceneId, name: 'Setup ' + (n + 1), ...patch });
  blocks.push(block);
  saveBlocks(blocks);
  return block;
}

export function updateBlock(id, patch) {
  const blocks = listBlocks();
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return null;
  blocks[i] = { ...blocks[i], ...patch, id, marks: blocks[i].marks };   // marks go through the mark calls
  saveBlocks(blocks);
  return blocks[i];
}

export function removeBlock(id) {
  const blocks = listBlocks().filter((b) => b.id !== id);
  saveBlocks(blocks);
  return blocks;
}

export function addMark(blockId, kind, patch = {}) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const same = block.marks.filter((m) => m.kind === kind).length;
  const label = kind === 'camera' ? (same ? 'Cam ' + String.fromCharCode(65 + same) : 'Cam A')
    : kind === 'actor' ? 'Actor ' + (same + 1)
    : kind === 'light' ? 'Light ' + (same + 1)
    : kind === 'track' ? 'Track ' + (same + 1) : 'Mark ' + (same + 1);
  // New marks land staggered near the middle so each is easy to grab.
  const at = clampPoint(22 + (block.marks.length % 5) * 14, 18 + (block.marks.length % 3) * 16);
  const mark = cleanMark({ ...blankMark({ kind, label, ...at }), ...patch });
  block.marks.push(mark);
  saveBlocks(blocks);
  return mark;
}

export function updateMark(blockId, markId, patch) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const i = block.marks.findIndex((m) => m.id === markId);
  if (i < 0) return null;
  block.marks[i] = cleanMark({ ...block.marks[i], ...patch, id: markId });
  saveBlocks(blocks);
  return block.marks[i];
}

export function removeMark(blockId, markId) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  block.marks = block.marks.filter((m) => m.id !== markId);
  saveBlocks(blocks);
  return block;
}

/* ---- lookbook boards ------------------------------------------ */

export function listBoards() {
  return readAll().boards.map((b) => ({
    ...blankBoard(),
    ...b,
    entries: (Array.isArray(b && b.entries) ? b.entries : [])
      .map((e) => ({ ...blankEntry(), ...e }))
  }));
}

export function saveBoards(boards) {
  return writeAll({ ...readAll(), boards });
}

/** The next unused suggested name, so four clicks give the four boards
    most films start with and nothing has to be typed to begin. */
export function nextBoardName(boards) {
  const taken = new Set((boards || listBoards()).map((b) => String(b.name).toLowerCase()));
  return BOARD_SUGGESTIONS.find((n) => !taken.has(n.toLowerCase())) || '';
}

export function addBoard(patch = {}) {
  const boards = listBoards();
  const board = blankBoard({ name: nextBoardName(boards), ...patch });
  boards.push(board);
  saveBoards(boards);
  return board;
}

export function updateBoard(id, patch) {
  const boards = listBoards();
  const i = boards.findIndex((b) => b.id === id);
  if (i < 0) return null;
  boards[i] = { ...boards[i], ...patch, id };
  saveBoards(boards);
  return boards[i];
}

export function removeBoard(id) {
  const boards = listBoards().filter((b) => b.id !== id);
  saveBoards(boards);
  return boards;
}

export function moveBoard(id, delta) {
  const boards = listBoards();
  const i = boards.findIndex((b) => b.id === id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= boards.length) return boards;
  [boards[i], boards[j]] = [boards[j], boards[i]];
  saveBoards(boards);
  return boards;
}

export function addEntry(boardId, patch = {}) {
  const boards = listBoards();
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  const entry = blankEntry(patch);
  board.entries.push(entry);
  saveBoards(boards);
  return entry;
}

export function updateEntry(boardId, entryId, patch) {
  const boards = listBoards();
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  const i = board.entries.findIndex((e) => e.id === entryId);
  if (i < 0) return null;
  board.entries[i] = { ...board.entries[i], ...patch, id: entryId };
  saveBoards(boards);
  return board.entries[i];
}

export function removeEntry(boardId, entryId) {
  const boards = listBoards();
  const board = boards.find((b) => b.id === boardId);
  if (!board) return null;
  board.entries = board.entries.filter((e) => e.id !== entryId);
  saveBoards(boards);
  return board;
}

/** Total references across every board. Derived — see the header. */
export function countEntries(boards) {
  return (boards || listBoards()).reduce((a, b) => a + b.entries.length, 0);
}

/** Is this reference something a browser can open? Used only to decide
    whether to render a link; a reference in plain words is equally
    valid and is the recommended one. */
export function isLinkable(ref) {
  return /^https?:\/\/\S+$/i.test(String(ref || '').trim());
}

export default {
  SHOTS_KEY, SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS, SHOT_LENSES, SHOT_RIGS, BOARD_SUGGESTIONS,
  sceneCameras, camOf, shotsOfCamera,
  BLOCK_W, BLOCK_H, BLOCK_KINDS, clampPoint, blockScale, blockCallouts, formatMetres, shotStatus, coverageOf, blankMark, blankBlock, listBlocks, saveBlocks, blocksOfScene,
  addBlock, updateBlock, removeBlock, addMark, updateMark, removeMark,
  blankShot, listShots, saveShots, addShot, updateShot, removeShot, moveShot,
  SHOT_COLUMNS, DEFAULT_COLUMNS, cleanColumns,
  reorderShots, isLockedNumber, autoNumbers, autoNumber, isAutoOrdered, sceneAutoOrdered, shotMinutes, minutesOf, formatMinutes,
  minutesByDay, setupOf, groupBySetup, frameAction, actionPatch,
  shotsByScene, takeSceneOut, putSceneBack,
  blankFrame, listFrames, saveFrames, addFrame, updateFrame, removeFrame,
  moveFrame, framesByShot,
  blankBoard, blankEntry, listBoards, saveBoards, nextBoardName, addBoard,
  updateBoard, removeBoard, moveBoard, addEntry, updateEntry, removeEntry,
  countEntries, isLinkable
};
