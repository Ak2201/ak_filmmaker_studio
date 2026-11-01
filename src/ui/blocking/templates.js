/* ============================================================
   BLOCKING — starting layouts (src/ui/blocking/templates.js)
   ------------------------------------------------------------
   Five common setups a blocking diagram starts from. A template is
   DATA: set pieces, marks and (sometimes) a 180-degree line, in map
   units (100 × 70, rot 0 = facing up the map). Applying one ADDS to the
   setup — it never clears what is there — and goes through
   Shots.replaceBlock(), so every piece and mark is cleaned like any
   other. The editor records the block first, so Undo takes it back off.

   Labels are suggestions: actors are numbered after the ones already on
   the map, cameras take the next free letters.
   ============================================================ */
import { blankMark, blankSetPiece } from '../../lib/shots.js';

const P = (kind, x, y, w, h, rot = 0, label = '') => ({ kind, x, y, w, h, rot, label });
const A = (x, y, rot, extra = {}) => ({ kind: 'actor', x, y, rot, ...extra });
const C = (x, y, rot, extra = {}) => ({ kind: 'camera', x, y, rot, ...extra });

export const TEMPLATES = [
  {
    id: 'dinner', label: 'Dinner table', icon: 'table_restaurant',
    set: [
      P('table', 50, 35, 32, 12, 0, 'Table'),
      P('chair', 38, 25.5, 4.4, 4.4, 0), P('chair', 50, 25.5, 4.4, 4.4, 0), P('chair', 62, 25.5, 4.4, 4.4, 0),
      P('chair', 38, 44.5, 4.4, 4.4, 180), P('chair', 50, 44.5, 4.4, 4.4, 180), P('chair', 62, 44.5, 4.4, 4.4, 180)
    ],
    marks: [A(38, 25.5, 180), A(62, 25.5, 180), A(38, 44.5, 0), A(62, 44.5, 0),
      C(30, 62, 36), C(70, 62, 324)],
    axis: { x1: 14, y1: 35, x2: 86, y2: 35 }
  },
  {
    id: 'two-hander', label: 'Two-hander', icon: 'group',
    set: [],
    marks: [A(42, 33, 90), A(58, 33, 270), C(30, 48, 62), C(70, 48, 298), C(50, 64, 0)],
    axis: { x1: 18, y1: 33, x2: 82, y2: 33 }
  },
  {
    id: 'walk-and-talk', label: 'Walk-and-talk', icon: 'route',
    set: [P('wall', 50, 21, 94, 1.4, 0, 'Corridor'), P('wall', 50, 49, 94, 1.4), P('door', 30, 21, 7, 1.4, 180), P('door', 70, 49, 7, 1.4, 0)],
    marks: [
      A(10, 31, 90, { toX: 44, toY: 31, path: [{ x: 76, y: 31, beat: '' }], curve: false }),
      A(10, 39, 90, { toX: 44, toY: 39, path: [{ x: 76, y: 39, beat: '' }] }),
      C(24, 35, 270, { toX: 58, toY: 35, path: [{ x: 90, y: 35, beat: '' }] })
    ],
    axis: null
  },
  {
    id: 'car', label: 'Car interior', icon: 'directions_car',
    set: [P('car', 50, 38, 30, 52, 0, 'Car')],
    marks: [A(43.5, 36, 0), A(56.5, 36, 0), C(50, 6, 180), C(68, 14, 225)],
    axis: { x1: 26, y1: 36, x2: 74, y2: 36 }
  },
  {
    id: 'office', label: 'Office desk', icon: 'chair',
    set: [
      P('wall', 50, 8, 84, 1.4, 0), P('wall', 92, 36, 56, 1.4, 90), P('window', 30, 8, 14, 1.4, 0),
      P('door', 92, 54, 8, 1.4, 270), P('table', 50, 32, 26, 10, 0, 'Desk'),
      P('chair', 50, 23, 5, 5, 0), P('chair', 50, 42, 5, 5, 180)
    ],
    marks: [A(50, 23, 180), A(50, 42, 0), C(40, 58, 16), C(38, 14, 157)],
    axis: { x1: 50, y1: 12, x2: 50, y2: 64 }
  }
];

const camName = (n) => 'Cam ' + (n < 26 ? String.fromCharCode(65 + n) : n + 1);

/** The block with a template's pieces, marks and line added to it.
    Pure: the caller writes the result. `null` for an unknown template. */
export function withTemplate(block, id) {
  const t = TEMPLATES.find((x) => x.id === id);
  if (!t || !block) return null;
  const labels = new Set(block.marks.map((m) => m.label));
  const next = (make) => { let n = 0; while (labels.has(make(n))) n++; labels.add(make(n)); return make(n); };
  const marks = t.marks.map((m) => blankMark({
    ...m,
    label: m.kind === 'camera' ? next(camName) : next((n) => 'Actor ' + (n + 1)),
    toX: m.toX ?? null, toY: m.toY ?? null,
    path: (m.path || []).map((b) => ({ ...b }))
  }));
  const set = t.set.map((p) => blankSetPiece({ ...p }));
  return {
    ...block,
    set: (block.set || []).concat(set),
    marks: block.marks.concat(marks),
    // A line already drawn is the director's; a template never moves it.
    axis: block.axis || t.axis || null
  };
}
