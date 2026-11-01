/* ============================================================
   BLOCKING — what this visit remembers (src/ui/blocking/state.js)
   ------------------------------------------------------------
   NOTHING HERE IS STORED. Which scene is picked, what is selected, the
   tool in hand, the zoom, whether snapping is on, the clipboard: module
   state for this visit, shared by the editor and the Scene board. The
   idle-write assertion in `verify` would catch a view that wrote on
   load; a stored "which tool was I using" would be a new key in a
   contract that holds people's work.
   ============================================================ */
import { BLOCK_W, BLOCK_H } from '../../lib/shots.js';

export const S = {
  pickedScene: '',                 // scene id for both sections
  views: new Map(),                // blockId -> { z, cx, cy }
  /* The selection: marks and set pieces by id (their ids never collide:
     both are UUIDs). `primary` is the one whose handles are drawn and
     whose fields the inspector shows. */
  sel: { blockId: '', ids: new Set(), primary: '' },
  tools: new Map(),                // blockId -> 'select' | 'move' | 'axis'
  drawers: new Map(),              // blockId -> '' | 'set' | 'templates'
  /* Snapping is ON for a setup added during this visit and OFF for the
     ones that were already there, so an existing map's marks keep their
     free positions until somebody asks for the grid (G). */
  snap: new Map(),                 // blockId -> boolean
  clipboard: null,                 // { marks: [], set: [] } copied this visit
  linkedCam: '',
  rerender: () => {}
};

export const Z_MIN = 1, Z_MAX = 4;
export const SNAP_STEP = 2.5;

export function viewOf(blockId) {
  return S.views.get(blockId) || { z: 1, cx: BLOCK_W / 2, cy: BLOCK_H / 2 };
}

const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** The viewBox for a view, kept inside the floor: zoomed in, the edge
    of the map is the edge of the pan. */
export function viewBoxOf(v) {
  const w = BLOCK_W / v.z, hh = BLOCK_H / v.z;
  const x = clampN(v.cx - w / 2, 0, BLOCK_W - w);
  const y = clampN(v.cy - hh / 2, 0, BLOCK_H - hh);
  return { x, y, w, h: hh };
}

export const toolOf = (blockId) => S.tools.get(blockId) || 'select';
export const snapOf = (blockId) => S.snap.get(blockId) === true;

/** Select exactly these ids in a block (primary = the last). */
export function select(blockId, ids = []) {
  const list = [].concat(ids).filter(Boolean);
  S.sel = { blockId, ids: new Set(list), primary: list[list.length - 1] || '' };
}
export function isSelected(blockId, id) {
  return S.sel.blockId === blockId && S.sel.ids.has(id);
}
export function selectedIn(blockId) {
  return S.sel.blockId === blockId ? S.sel.ids : new Set();
}
