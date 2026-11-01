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
import { newId as uid } from './record-id.js';

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

/** The widest floor a block may claim, in metres: a stadium. Past it the
    distances and track lengths are drawn at a scale nobody measured. */
export const BLOCK_WIDTH_MAX_M = 500;

/** Says what is wrong with a typed floor width, or '' when it is usable
    (blank is usable: it means "not said yet"). Pure. */
export function floorWidthError(raw) {
  const t = String(raw ?? '').trim();
  if (!t) return '';
  const w = Number(t.replace(',', '.'));
  if (!Number.isFinite(w) || w <= 0) return 'Floor width must be a positive number of metres.';
  if (w > BLOCK_WIDTH_MAX_M) return 'Floor width can be at most ' + BLOCK_WIDTH_MAX_M + ' metres.';
  return '';
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
    /* The blocking studio (1 Nov 2026). Three more FIELDS on the same
       record, spread under every stored mark like widthM: a mark written
       before them reads back with no path, a straight line and no
       character, and every field it already had is untouched.
         path    the beats AFTER the first leg: [{ x, y, beat }]. The first
                 leg stays toX/toY, so an older build still draws the move
                 to its first stop and simply does not know the rest.
         curve   draw the walk as a curve through its beats, not a polyline.
         charId  a Characters record id (src/lib/characters.js), or ''. An
                 id, never a copied name: rename the character and the
                 colour and the picker follow. */
    path: [],
    curve: false,
    charId: '',
    ...patch
  };
}

/* What a setup can be furnished with, in plan view (1 Nov 2026). ONE
   field, `set`, on the existing block record: an array of pieces, each a
   rectangle centred at (x,y), `w` across and `h` deep in map units,
   turned `rot` degrees. An unknown kind reads back as a prop, the way an
   unknown mark kind reads back as an actor. */
export const SET_KINDS = ['wall', 'door', 'window', 'table', 'chair', 'sofa', 'bed', 'counter', 'car', 'stairs', 'prop'];
/* The size a piece is born at, in map units (a 12 m floor is ~8 units a
   metre, so a chair is a little over half a metre). Suggestions only. */
export const SET_SIZE = {
  wall: [30, 1.2], door: [7, 1.2], window: [10, 1.2], table: [14, 8], chair: [4, 4], sofa: [16, 6],
  bed: [14, 18], counter: [20, 5], car: [12, 24], stairs: [10, 16], prop: [5, 5]
};

export function blankSetPiece(patch = {}) {
  return { id: uid('st'), kind: 'prop', x: BLOCK_W / 2, y: BLOCK_H / 2, w: 5, h: 5, rot: 0, label: '', ...patch };
}

const tenth = (n) => Math.round(n * 10) / 10;
const finite = (v) => v !== null && v !== '' && Number.isFinite(Number(v));

/** A set piece kept inside the rules: a known kind, a centre on the map,
    a size between 1 and the map, a whole number of degrees. Unknown
    fields ride along (an older tab must not wipe a newer field). */
export function cleanSetPiece(p) {
  const src = p && typeof p === 'object' ? p : {};
  const out = { ...blankSetPiece(), ...src };
  if (!src.id) out.id = uid('st');
  out.kind = SET_KINDS.includes(out.kind) ? out.kind : 'prop';
  Object.assign(out, clampPoint(out.x, out.y));
  const [dw, dh] = SET_SIZE[out.kind];
  out.w = tenth(clamp(finite(src.w) ? Number(src.w) : dw, 1, BLOCK_W));
  out.h = tenth(clamp(finite(src.h) ? Number(src.h) : dh, 1, BLOCK_H));
  out.rot = ((Math.round(Number(out.rot) || 0) % 360) + 360) % 360;
  out.label = String(out.label ?? '');
  return out;
}

/** The 180-degree line, both ends on the map, or null. Two ends on the
    same spot are not a line. */
export function cleanAxis(a) {
  if (!a || typeof a !== 'object') return null;
  if (![a.x1, a.y1, a.x2, a.y2].every(finite)) return null;
  const p = clampPoint(a.x1, a.y1), q = clampPoint(a.x2, a.y2);
  if (p.x === q.x && p.y === q.y) return null;
  return { x1: p.x, y1: p.y, x2: q.x, y2: q.y };
}

/** The most beats one walk may carry. A path is a few numbers a beat. */
export const PATH_MAX = 24;

function cleanPath(path) {
  if (!Array.isArray(path)) return [];
  const out = [];
  for (const b of path) {
    if (!b || typeof b !== 'object' || !finite(b.x) || !finite(b.y)) continue;
    out.push({ ...clampPoint(b.x, b.y), beat: String(b.beat ?? '') });
    if (out.length >= PATH_MAX) break;
  }
  return out;
}

export function blankBlock(patch = {}) {
  /* `set` and `axis` (1 Nov 2026) are two more FIELDS, spread under every
     stored block: an older block reads back unfurnished and with no line. */
  /* `shotId` (1 Nov 2026, per-shot blocking) is one more FIELD: '' is the
     scene's FLOOR PLAN (and every setup written before the field existed),
     a shot id makes this block that ONE shot's diagram. A shot block holds
     only its own marks; the set, the 180° line and the floor width live on
     the floor block and are READ by a shot view, never copied into it —
     two copies of a wall drift apart the first time one is moved. */
  return { id: uid('bk'), sceneId: '', shotId: '', name: '', note: '', widthM: '', marks: [], set: [], axis: null, ...patch };
}

/** A whole block, cleaned the way listBlocks() reads one. */
export function cleanBlock(b) {
  const src = b && typeof b === 'object' ? b : {};
  const row = { ...blankBlock(), ...src };
  row.marks = (Array.isArray(src.marks) ? src.marks : []).map(cleanMark);
  row.set = (Array.isArray(src.set) ? src.set : []).filter((p) => p && typeof p === 'object').map(cleanSetPiece);
  row.axis = cleanAxis(src.axis);
  row.shotId = typeof row.shotId === 'string' ? row.shotId : '';
  return row;
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
  /* Beats after the first leg exist only while there IS a first leg, and
     never on a track (whose toX/toY is the far end of a rail). */
  out.path = out.toX == null || out.kind === 'track' ? [] : cleanPath(out.path);
  out.curve = out.curve === true;
  out.charId = typeof out.charId === 'string' ? out.charId : '';
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
    the progress denominator forever.

    A shot's BLOCKING DIAGRAM (a block with that shotId) is deliberately
    LEFT, not removed: deleting a row of the shot list must not quietly
    take a person's staging with it (the frames are the shot's own; the
    diagram is drawn work). While its shot is gone the block reads as an
    orphan, and the Blocking tab lists it under the floor plan
    (isOrphanBlock), where it can be deleted by hand with Undo — never
    hidden and never removed as a side effect. */
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
export function moveShot(id, delta, keep) {
  const shots = listShots();
  const shot = shots.find((s) => s.id === id);
  if (!shot) return shots;
  const siblings = shots.filter((s) => s.sceneId === shot.sceneId);
  const at = siblings.indexOf(shot);
  if (!keep) {
    const swapWith = siblings[at + delta];
    if (!swapWith) return shots;
    const i = shots.indexOf(shot);
    const j = shots.indexOf(swapWith);
    [shots[i], shots[j]] = [shots[j], shots[i]];
    saveShots(shots);
    return shots;
  }
  /* With a filter on (`keep` is what the screen shows), a move steps
     over the hidden shots to the next VISIBLE one and lands beside it,
     the way a drop does: swapping with a hidden neighbour moved
     nothing on screen and silently renumbered two shots. The hidden
     shots keep their order relative to each other. */
  const step = delta < 0 ? -1 : 1;
  let j = at + step;
  while (siblings[j] && !keep(siblings[j])) j += step;
  const target = siblings[j];
  if (!target) return shots;
  const order = siblings.filter((s) => s !== shot);
  order.splice(order.indexOf(target) + (step > 0 ? 1 : 0), 0, shot);
  reorderShots(shot.sceneId, order.map((s) => s.id));
  return listShots();
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
  const n = parseMinutes(shot && shot.mins);
  return n == null ? 0 : n;
}

/** The longest estimate one setup may carry: a day. */
export const MAX_SHOT_MINUTES = 1440;

/** PURE. The minutes a typed estimate means: null for text it cannot read
    (or for a negative or over-a-day figure), 0 for blank. */
export function parseMinutes(text) {
  const t = String(text ?? '').trim().toLowerCase();
  if (!t) return 0;
  let n = null;
  let m = t.match(/^(\d+(?:\.\d+)?)\s*(m|min|mins|minutes?)?$/);
  if (m) n = Number(m[1]);
  if (n == null) {
    m = t.match(/^(\d+(?:\.\d+)?)\s*(h|hr|hrs|hours?)(?:\s*(\d+)\s*(m|min|mins|minutes?)?)?$/);
    if (m) n = Number(m[1]) * 60 + (m[3] ? Number(m[3]) : 0);
  }
  if (n == null) {
    m = t.match(/^(\d+):([0-5]\d)$/);
    if (m) n = Number(m[1]) * 60 + Number(m[2]);
  }
  return n != null && n <= MAX_SHOT_MINUTES ? n : null;
}

/** PURE. '' when a typed estimate reads (or is blank), else the reason. */
export function minutesProblem(text) {
  return parseMinutes(text) == null
    ? 'Time estimates read as 12, 7.5, 1h 30 or 1:30, and no more than a day.'
    : '';
}

/** PURE. The shot numbers more than one shot of this list holds (trimmed,
    upper-cased), so a typed clash can be named before it reaches the
    paperwork. Blank numbers never clash. */
export function duplicateNumbers(list) {
  const seen = new Set(), dup = new Set();
  for (const s of list || []) {
    const n = String((s && s.number) ?? '').trim().toUpperCase();
    if (!n) continue;
    if (seen.has(n)) dup.add(n); else seen.add(n);
  }
  return dup;
}

/** PURE. The first free "Setup N" among a scene's diagrams. */
export function nextBlockName(blocks) {
  const taken = new Set((blocks || []).map((b) => String((b && b.name) ?? '').trim().toLowerCase()));
  let n = 1;
  while (taken.has('setup ' + n)) n++;
  return 'Setup ' + n;
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
  return readAll().blocks.map(cleanBlock);
}

/** One block by id, cleaned, or null. */
export function getBlock(blockId) {
  return listBlocks().find((b) => b.id === blockId) || null;
}

export function saveBlocks(blocks) {
  return writeAll({ ...readAll(), blocks });
}

export function blocksOfScene(sceneId) {
  return listBlocks().filter((b) => b.sceneId === sceneId);
}

export function addBlock(sceneId, patch = {}) {
  const blocks = listBlocks();
  const block = blankBlock({ sceneId, name: nextBlockName(blocks.filter((b) => b.sceneId === sceneId)), ...patch });
  blocks.push(block);
  saveBlocks(blocks);
  return block;
}

export function updateBlock(id, patch) {
  const blocks = listBlocks();
  const i = blocks.findIndex((b) => b.id === id);
  if (i < 0) return null;
  // Marks and set pieces go through their own calls; the axis is cleaned.
  blocks[i] = cleanBlock({ ...blocks[i], ...patch, id, marks: blocks[i].marks, set: blocks[i].set });
  saveBlocks(blocks);
  return blocks[i];
}

/** Write a whole block by id, every mark and piece cleaned; inserted at
    the end when no block has that id. The one path for undo / redo and
    for an AI draft's apply and undo, so none of them can store a shape
    the readers would not produce. Returns the cleaned block. */
export function replaceBlock(block) {
  if (!block || typeof block !== 'object' || !block.id) return null;
  const row = cleanBlock(block);
  const blocks = listBlocks();
  const i = blocks.findIndex((b) => b.id === row.id);
  if (i < 0) blocks.push(row); else blocks[i] = row;
  saveBlocks(blocks);
  return row;
}

/** Put a removed diagram back at its old place in the list (Undo). */
export function restoreBlock(block, index) {
  const blocks = listBlocks().filter((b) => b.id !== block.id);
  const at = Number.isInteger(index) && index >= 0 && index <= blocks.length ? index : blocks.length;
  blocks.splice(at, 0, block);
  saveBlocks(blocks);
  return blocks;
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
  /* The label and the spot are the first FREE ones, never a count: after
     a delete a count hands out a label already in use and the spot of a
     mark still on the map (the count-after-delete flaw shot numbers had). */
  const labels = new Set(block.marks.map((m) => m.label));
  const nameAt = (n) => (kind === 'camera' ? 'Cam ' + (n < 26 ? String.fromCharCode(65 + n) : n + 1)
    : (kind === 'actor' ? 'Actor ' : kind === 'light' ? 'Light ' : kind === 'track' ? 'Track ' : 'Mark ') + (n + 1));
  let n = 0;
  while (labels.has(nameAt(n))) n++;
  const label = nameAt(n);
  // New marks land staggered near the middle so each is easy to grab.
  const spot = (i) => clampPoint(22 + (i % 5) * 14, 18 + (i % 3) * 16);
  const taken = new Set(block.marks.map((m) => m.x + ',' + m.y));
  let i = 0;
  while (i < 15 && taken.has(spot(i).x + ',' + spot(i).y)) i++;
  const at = spot(i < 15 ? i : block.marks.length);
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

/* The default names a duplicate may renumber: "Actor 2" copied is the
   next free "Actor N", but "Ravi" copied is still Ravi. */
const DEFAULT_LABEL = /^(?:(?:Actor|Light|Track|Mark) \d+|Cam (?:[A-Z]|\d+))$/;
function freeLabel(marks, kind) {
  const labels = new Set(marks.map((m) => m.label));
  const nameAt = (n) => (kind === 'camera' ? 'Cam ' + (n < 26 ? String.fromCharCode(65 + n) : n + 1)
    : (kind === 'actor' ? 'Actor ' : kind === 'light' ? 'Light ' : kind === 'track' ? 'Track ' : 'Mark ') + (n + 1));
  let n = 0;
  while (labels.has(nameAt(n))) n++;
  return nameAt(n);
}

/** Copies of some marks, offset by (dx, dy), with new ids. Their moves
    and beats travel with them. Returns the new marks. */
/** A mark moved by (dx, dy) as a whole: its spot, its walk's end and
    every beat on the way, so a copy walks where the original walks,
    offset — never back to the original's destinations. */
export function offsetMark(m, dx, dy) {
  return {
    ...m, x: m.x + dx, y: m.y + dy,
    toX: m.toX == null ? null : m.toX + dx, toY: m.toY == null ? null : m.toY + dy,
    path: (m.path || []).map((b) => ({ ...b, x: b.x + dx, y: b.y + dy }))
  };
}

export function duplicateMarks(blockId, markIds, dx = 4, dy = 4) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return [];
  const want = new Set(markIds || []);
  const made = [];
  for (const m of block.marks.filter((x) => want.has(x.id))) {
    const label = DEFAULT_LABEL.test(m.label) ? freeLabel(block.marks.concat(made), m.kind) : m.label;
    made.push(cleanMark({ ...offsetMark(m, dx, dy), id: uid('mk'), label }));
  }
  if (!made.length) return [];
  block.marks.push(...made);
  saveBlocks(blocks);
  return made;
}

/* ---- set pieces and the line ------------------------------------ */

export function addSetPiece(blockId, kind, patch = {}) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const k = SET_KINDS.includes(kind) ? kind : 'prop';
  const [w, h] = SET_SIZE[k];
  // Born a little apart from the last piece, so two adds are two shapes.
  const n = block.set.length % 6;
  const piece = cleanSetPiece({ ...blankSetPiece({ kind: k, w, h, x: 40 + n * 4, y: 30 + n * 3 }), ...patch });
  block.set.push(piece);
  saveBlocks(blocks);
  return piece;
}

export function updateSetPiece(blockId, pieceId, patch) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  const i = block.set.findIndex((p) => p.id === pieceId);
  if (i < 0) return null;
  block.set[i] = cleanSetPiece({ ...block.set[i], ...patch, id: pieceId });
  saveBlocks(blocks);
  return block.set[i];
}

export function removeSetPiece(blockId, pieceId) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return null;
  block.set = block.set.filter((p) => p.id !== pieceId);
  saveBlocks(blocks);
  return block;
}

/** Draw (or, with null, take away) the 180-degree line. Returns the
    stored axis, null when cleared or unusable, undefined for no block. */
export function setAxis(blockId, axis) {
  const blocks = listBlocks();
  const block = blocks.find((b) => b.id === blockId);
  if (!block) return undefined;
  block.axis = cleanAxis(axis);
  saveBlocks(blocks);
  return block.axis;
}

/* ---- per-shot blocking (1 Nov 2026) ------------------------------
   ONE floor plan per scene, ONE diagram per shot. The floor is the
   scene's block with no shotId (the first one, when an older studio drew
   several setups); a shot's diagram is the block whose shotId names it.
   Every helper here READS, except ensureShotBlock(), splitBlock() and
   writeBlocking(), and those run only on a person's action (a click, an
   Accept): the idle-write check in `verify` must stay at zero, so a view
   never makes a diagram just by being opened. */

/** The scene's floor plan: its first block with no shotId, or null.
    Never created here — a write that needs one makes it. */
export function floorOf(sceneId, blocks = listBlocks()) {
  return blocks.find((b) => b.sceneId === sceneId && !b.shotId) || null;
}

/** The diagram of one shot, or null. */
export function blockOfShot(shotId, blocks = listBlocks()) {
  if (!shotId) return null;
  return blocks.find((b) => b.shotId === shotId) || null;
}

/** A block whose shot has been deleted (see removeShot). */
export function isOrphanBlock(block, shots = listShots()) {
  return !!(block && block.shotId) && !shots.some((s) => s.id === block.shotId);
}

/** The name a shot's diagram is given: "Shot 4A". */
export const shotBlockName = (shot) => 'Shot ' + (String((shot && shot.number) || '').trim() || '?');

/** The shot's diagram, made (empty) if it has none. ONLY on a person's
    action — never from a render. Null when the shot does not exist. */
export function ensureShotBlock(shotId) {
  const shot = listShots().find((s) => s.id === shotId);
  if (!shot) return null;
  const have = blockOfShot(shotId);
  if (have) return have;
  return replaceBlock(blankBlock({ sceneId: shot.sceneId, shotId, name: shotBlockName(shot) }));
}

/** The 180° line's sides across a whole scene: the floor's line against
    every camera on the floor AND on every shot diagram, so a shot whose
    camera jumps the line is flagged though no single diagram holds both
    cameras. Pure over the blocks it is given. */
export function sceneAxisSides(sceneId, blocks = listBlocks()) {
  const mine = blocks.filter((b) => b.sceneId === sceneId);
  const floor = mine.find((b) => !b.shotId);
  const cams = mine.filter((b) => b === floor || b.shotId).flatMap((b) => (b.marks || []).filter((m) => m.kind === 'camera'));
  return axisSides({ axis: floor ? floor.axis : null, marks: cams });
}

/* Key-order-free comparison: a row read back may list its keys in a
   different order from the object that was written. */
const stableJSON = (v) => Array.isArray(v) ? '[' + v.map(stableJSON).join(',') + ']'
  : v && typeof v === 'object' ? '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableJSON(v[k])).join(',') + '}'
  : JSON.stringify(v === undefined ? null : v);

/**
 * Several blocks and shot camera links in ONE write (a split, an AI
 * draft's Accept). `blocks` are whole rows to insert or replace (each
 * cleaned); `cams` are { id, cam } and FILL ONLY: a shot that already
 * names a camera keeps it. Returns the undo snapshot:
 *   { blocks: [{ id, before (row | null), wrote }], cams: [{ id, was, wrote }] }
 * Unknown fields on every row ride through (readAll's passthrough).
 */
export function writeBlocking({ blocks = [], cams = [] } = {}) {
  const all = readAll();
  const list = all.blocks.map(cleanBlock);
  const snap = { blocks: [], cams: [] };
  for (const raw of blocks) {
    if (!raw || !raw.id) continue;
    const row = cleanBlock(raw);
    const i = list.findIndex((b) => b.id === row.id);
    snap.blocks.push({ id: row.id, before: i < 0 ? null : list[i], wrote: row });
    if (i < 0) list.push(row); else list[i] = row;
  }
  const shots = all.shots.slice();
  for (const c of cams) {
    const i = shots.findIndex((s) => s && s.id === c.id);
    if (i < 0 || !c.cam || String(shots[i].cam || '')) continue;   // fill blanks only
    snap.cams.push({ id: c.id, was: '', wrote: c.cam });
    shots[i] = { ...shots[i], cam: c.cam };
  }
  if (snap.blocks.length || snap.cams.length) writeAll({ ...all, blocks: list, shots });
  return snap;
}

/**
 * Undo a writeBlocking() WITHOUT reverting anything edited since (CLAUDE.md
 * row 68): a block goes back (or away, when the write made it) only while
 * it is still exactly what was written; a shot's camera goes back to blank
 * only while it still names the written one. One write. → { reverted, kept }
 */
export function undoBlocking(snap) {
  const all = readAll();
  let list = all.blocks.map(cleanBlock);
  let reverted = 0, kept = 0;
  for (const b of (snap && snap.blocks) || []) {
    const i = list.findIndex((x) => x.id === b.id);
    if (i < 0) { if (b.before) kept++; continue; }       // deleted since: leave it gone
    if (stableJSON(list[i]) !== stableJSON(cleanBlock(b.wrote))) { kept++; continue; }
    if (b.before) list[i] = b.before; else list = list.filter((x) => x.id !== b.id);
    reverted++;
  }
  const shots = all.shots.slice();
  for (const c of (snap && snap.cams) || []) {
    const i = shots.findIndex((s) => s && s.id === c.id);
    if (i < 0) continue;
    if (shots[i].cam !== c.wrote) { kept++; continue; }
    shots[i] = { ...shots[i], cam: c.was };
    reverted++;
  }
  if (reverted) writeAll({ ...all, blocks: list, shots });
  return { reverted, kept };
}

/* The rail a camera rides: a track whose line passes within 2 units of
   the camera. The nearest one, or null. */
function railOf(cam, marks) {
  let best = null, bestD = 2.0001;
  for (const t of marks) {
    if (t.kind !== 'track' || t.toX == null) continue;
    const dx = t.toX - t.x, dy = t.toY - t.y, len2 = dx * dx + dy * dy;
    const k = len2 ? Math.max(0, Math.min(1, ((cam.x - t.x) * dx + (cam.y - t.y) * dy) / len2)) : 0;
    const d = Math.hypot(cam.x - (t.x + k * dx), cam.y - (t.y + k * dy));
    if (d < bestD) { best = t; bestD = d; }
  }
  return best;
}

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Plan a split of an older COMBINED setup (one map, every shot's camera on
 * it) into one diagram per shot. Pure: returns the rows writeBlocking()
 * would write, and touches nothing.
 *   Each camera finds its shot: first a shot whose `cam` names it, then one
 *   whose setup (or, failing that, nothing) equals the camera's label —
 *   only shots of this scene with no diagram yet, each shot used once.
 *   A matched camera MOVES (same id, so every shot.cam link still holds)
 *   into a new shot diagram with the rail it rides and COPIES of the
 *   actors (new ids); the actors stay on the floor too. An unmatched
 *   camera stays where it is. The original block stays, as the floor.
 * → { floor, made: [rows], cams: [{ id, cam }], matched, unmatched } or null.
 */
export function planSplit(block, shots, blocks) {
  if (!block || block.shotId) return null;
  const sceneShots = shots.filter((s) => s.sceneId === block.sceneId && !blockOfShot(s.id, blocks));
  const cams = block.marks.filter((m) => m.kind === 'camera');
  if (cams.length < 2) return null;
  const actors = block.marks.filter((m) => m.kind === 'actor');
  const used = new Set();
  const out = { floor: null, made: [], cams: [], matched: 0, unmatched: 0 };
  const moved = new Set();
  for (const cam of cams) {
    const shot = sceneShots.find((s) => !used.has(s.id) && s.cam === cam.id)
      || sceneShots.find((s) => !used.has(s.id) && !s.cam && norm(s.setup) && norm(s.setup) === norm(cam.label));
    if (!shot) { out.unmatched++; continue; }
    used.add(shot.id);
    const rail = railOf(cam, block.marks.filter((m) => !moved.has(m.id)));
    moved.add(cam.id);
    if (rail) moved.add(rail.id);
    out.made.push(blankBlock({
      sceneId: block.sceneId, shotId: shot.id, name: shotBlockName(shot),
      marks: [cam, ...(rail ? [rail] : []), ...actors.map((a) => ({ ...a, id: uid('mk') }))]
    }));
    if (!shot.cam) out.cams.push({ id: shot.id, cam: cam.id });
    out.matched++;
  }
  if (!out.matched) return null;
  out.floor = { ...block, marks: block.marks.filter((m) => !moved.has(m.id)) };
  return out;
}

/** Split a combined setup into shot diagrams (see planSplit). One write;
    returns the writeBlocking() snapshot (undoBlocking() takes it back) plus
    the counts, or null when there is nothing to split. */
export function splitBlock(blockId) {
  const blocks = listBlocks();
  const plan = planSplit(blocks.find((b) => b.id === blockId) || null, listShots(), blocks);
  if (!plan) return null;
  const snap = writeBlocking({ blocks: [plan.floor, ...plan.made], cams: plan.cams });
  return { ...snap, matched: plan.matched, unmatched: plan.unmatched };
}

/* ---- derived, never stored --------------------------------------- */

/** A lens's horizontal field of view in degrees, on a Super 35 gate
    (24.9 mm wide), or null when the lens says no focal length ("zoom",
    blank). "24-70mm" reads its wide end. Pure. */
export function lensFov(lens) {
  const m = String(lens ?? '').match(/(\d+(?:\.\d+)?)\s*(?:-\s*\d+(?:\.\d+)?)?\s*(?:mm)?/i);
  const f = m ? Number(m[1]) : NaN;
  if (!Number.isFinite(f) || f < 4 || f > 1200) return null;
  return Math.round((2 * Math.atan(24.9 / (2 * f)) * 180) / Math.PI * 10) / 10;
}

/** The field of view a camera mark draws: the WIDEST lens among the shots
    linked to it, or null (the drawing's default wedge) when none says. */
export function cameraFov(camId, shots) {
  let best = null;
  for (const s of shotsOfCamera(camId, shots || [])) {
    const f = lensFov(s.lens);
    if (f != null && (best == null || f > best)) best = f;
  }
  return best;
}

/** Which side of the 180-degree line each camera stands on. `crossed` is
    true when two cameras of this setup stand on opposite sides — the
    warning. Cameras within half a unit of the line count as on it. Pure. */
export function axisSides(block) {
  const out = { left: [], right: [], on: [], crossed: false };
  const a = block && cleanAxis(block.axis);
  if (!a) return out;
  const len = Math.hypot(a.x2 - a.x1, a.y2 - a.y1);
  for (const m of (block.marks || []).filter((x) => x.kind === 'camera')) {
    const d = ((a.x2 - a.x1) * (m.y - a.y1) - (a.y2 - a.y1) * (m.x - a.x1)) / len;
    (Math.abs(d) < 0.5 ? out.on : d < 0 ? out.left : out.right).push(m.id);
  }
  out.crossed = out.left.length > 0 && out.right.length > 0;
  return out;
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
  floorWidthError,
  addBlock, updateBlock, removeBlock, restoreBlock, addMark, updateMark, removeMark,
  SET_KINDS, SET_SIZE, PATH_MAX, offsetMark, blankSetPiece, cleanSetPiece, cleanAxis, cleanBlock, getBlock, addSetPiece,
  updateSetPiece, removeSetPiece, setAxis, replaceBlock, duplicateMarks, lensFov, cameraFov, axisSides,
  floorOf, blockOfShot, isOrphanBlock, shotBlockName, ensureShotBlock, sceneAxisSides, writeBlocking, undoBlocking, planSplit, splitBlock,
  blankShot, listShots, saveShots, addShot, updateShot, removeShot, moveShot,
  SHOT_COLUMNS, DEFAULT_COLUMNS, cleanColumns,
  reorderShots, isLockedNumber, autoNumbers, autoNumber, isAutoOrdered, sceneAutoOrdered, shotMinutes, parseMinutes, minutesProblem, MAX_SHOT_MINUTES, duplicateNumbers, nextBlockName, minutesOf, formatMinutes,
  minutesByDay, setupOf, groupBySetup, frameAction, actionPatch,
  shotsByScene, takeSceneOut, putSceneBack,
  blankFrame, listFrames, saveFrames, addFrame, updateFrame, removeFrame,
  moveFrame, framesByShot,
  blankBoard, blankEntry, listBoards, saveBoards, nextBoardName, addBoard,
  updateBoard, removeBoard, moveBoard, addEntry, updateEntry, removeEntry,
  countEntries, isLinkable
};
