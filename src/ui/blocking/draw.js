/* ============================================================
   BLOCKING — the drawing (src/ui/blocking/draw.js)
   ------------------------------------------------------------
   ONE drawing function for the editor, the read-only Scene board, the
   PNG and the PDF, so none of them can disagree about what a mark, a
   set piece, a walk or the 180-degree line looks like.

   PURE in the sense that matters: it reads only what it is handed (the
   block, the view, the selection, the shots and characters to derive
   from) and returns an <svg>. It holds no state, writes nothing, binds
   no event but the one two-finger touch guard on an editable map — see
   ZOOM AND PAN in editor.js.

   Layers, bottom to top: the floor and its grid, the set (furniture is
   under people), the 180-degree line, the distance lines, the walks,
   the marks, the callouts, then the editor's handles.

   Everything derived is derived HERE on every draw and stored nowhere:
   a camera's field of view from the lens of the shots linked to it
   (cameraFov), the shot numbers on its badge, the beat numbers on a
   walk, a character's colour from the order of the Characters list.
   ============================================================ */
import { BLOCK_W, BLOCK_H, blockCallouts, formatMetres, shotsOfCamera, cameraFov, axisSides } from '../../lib/shots.js';

const NS = 'http://www.w3.org/2000/svg';
export const svg = (tag, attrs = {}, kids = []) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of kids) if (c) el.append(c);
  return el;
};

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
/** The number of character colours (vz-ch-0 … vz-ch-7 in visualize.css). */
export const CHAR_HUES = 8;

/** The letters a block's walks are numbered with, by mark id: actors
    A, B, C… in map order, so "Actor 1" walks A1 → A2 → A3 and the next
    actor B1 → B2; a camera's moves use its own letter in lower case
    ("Cam B" moves b1 → b2), so a camera never reads as an actor.
    Derived from the order of the marks, never stored. */
export function beatPrefixes(block) {
  const out = new Map();
  let n = 0;
  for (const m of (block && block.marks) || []) {
    if (m.kind === 'camera') {
      const c = String(m.label || '').match(/^cam(?:era)?\s+(\w)/i);
      out.set(m.id, c ? c[1].toLowerCase() : 'c');
    } else if (m.kind !== 'track') {
      out.set(m.id, n < 26 ? String.fromCharCode(65 + n) : String(n + 1) + '·');
      n++;
    }
  }
  return out;
}

/** Every point a mark passes through, in order: where it stands, the
    first leg (toX/toY), then the beats of its path. */
export function walkPoints(m) {
  if (!m || m.toX == null || m.kind === 'track') return [];
  return [{ x: m.x, y: m.y }, { x: m.toX, y: m.toY }].concat((m.path || []).map((b) => ({ x: b.x, y: b.y, beat: b.beat })));
}

/** An SVG path through the points: straight legs, or a Catmull-Rom curve
    turned into cubic Béziers when the mark says `curve`. */
export function walkD(pts, curve) {
  if (pts.length < 2) return '';
  const f = (n) => Math.round(n * 100) / 100;
  if (!curve || pts.length < 3) return 'M' + pts.map((p) => f(p.x) + ',' + f(p.y)).join(' L');
  let d = 'M' + f(pts[0].x) + ',' + f(pts[0].y);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += ` C${f(c1.x)},${f(c1.y)} ${f(c2.x)},${f(c2.y)} ${f(p2.x)},${f(p2.y)}`;
  }
  return d;
}

/* ---- set pieces: plan-view glyphs --------------------------------
   Each is drawn centred on (0,0), `w` across and `h` deep, inside a
   group that carries the piece's place and turn. Clean architectural
   symbols, not pictures: a wall is a solid bar, a door a leaf and its
   swing, a window a frame with a sash line. */
function glyph(p) {
  const w = p.w, hh = p.h, x = -w / 2, y = -hh / 2;
  const r = (cls, attrs) => svg('rect', { class: cls, x, y, width: w, height: hh, ...attrs });
  const line = (x1, y1, x2, y2, cls = 'vz-sp-line') => svg('line', { class: cls, x1, y1, x2, y2 });
  const out = [];
  switch (p.kind) {
    case 'wall':
      out.push(r('vz-sp-wall'));
      break;
    case 'door': {
      // The frame, then the leaf standing open 90 degrees and its swing.
      const leaf = Math.max(1, w - 0.6);
      out.push(r('vz-sp-gap'),
        line(x, y + hh, x, y + hh - leaf, 'vz-sp-leaf'),
        svg('path', { class: 'vz-sp-swing', d: `M${x},${y + hh - leaf} A${leaf},${leaf} 0 0 1 ${x + leaf},${y + hh}` }));
      break;
    }
    case 'window':
      out.push(r('vz-sp-frame'), line(x, 0, x + w, 0));
      break;
    case 'table':
      out.push(r('vz-sp-body', { rx: Math.min(1.2, hh / 4) }));
      break;
    case 'chair': {
      const back = Math.max(0.6, hh * 0.22);
      out.push(r('vz-sp-body', { rx: 0.5 }), svg('rect', { class: 'vz-sp-solid', x, y, width: w, height: back, rx: 0.4 }));
      break;
    }
    case 'sofa': {
      const back = Math.max(0.8, hh * 0.3), arm = Math.max(0.8, Math.min(w * 0.12, 2.4));
      out.push(r('vz-sp-body', { rx: 0.8 }),
        svg('rect', { class: 'vz-sp-solid', x, y, width: w, height: back, rx: 0.6 }),
        svg('rect', { class: 'vz-sp-solid', x, y, width: arm, height: hh, rx: 0.6 }),
        svg('rect', { class: 'vz-sp-solid', x: x + w - arm, y, width: arm, height: hh, rx: 0.6 }));
      break;
    }
    case 'bed': {
      const pil = Math.max(1, hh * 0.16);
      out.push(r('vz-sp-body', { rx: 0.6 }),
        svg('rect', { class: 'vz-sp-solid', x: x + w * 0.08, y: y + hh * 0.05, width: w * 0.38, height: pil, rx: 0.5 }),
        svg('rect', { class: 'vz-sp-solid', x: x + w * 0.54, y: y + hh * 0.05, width: w * 0.38, height: pil, rx: 0.5 }),
        line(x, y + hh * 0.34, x + w, y + hh * 0.34));
      break;
    }
    case 'counter':
      out.push(r('vz-sp-body'), line(x, y + hh * 0.72, x + w, y + hh * 0.72));
      break;
    case 'car': {
      // Plan view, nose up the map: body, windscreen, rear screen, seats.
      out.push(r('vz-sp-body', { rx: Math.min(w, hh) * 0.28 }),
        svg('path', { class: 'vz-sp-glass', d: `M${x + w * 0.14},${y + hh * 0.3} Q0,${y + hh * 0.2} ${x + w * 0.86},${y + hh * 0.3} L${x + w * 0.8},${y + hh * 0.38} L${x + w * 0.2},${y + hh * 0.38} Z` }),
        svg('path', { class: 'vz-sp-glass', d: `M${x + w * 0.2},${y + hh * 0.8} L${x + w * 0.8},${y + hh * 0.8} L${x + w * 0.84},${y + hh * 0.86} L${x + w * 0.16},${y + hh * 0.86} Z` }),
        line(x + w * 0.5, y + hh * 0.42, x + w * 0.5, y + hh * 0.76, 'vz-sp-line'));
      break;
    }
    case 'stairs': {
      out.push(r('vz-sp-body'));
      const n = Math.max(3, Math.min(14, Math.round(hh / 1.6)));
      for (let i = 1; i < n; i++) out.push(line(x, y + (hh * i) / n, x + w, y + (hh * i) / n));
      // The run: an arrow pointing up the flight.
      out.push(line(0, y + hh * 0.9, 0, y + hh * 0.12, 'vz-sp-run'),
        svg('path', { class: 'vz-sp-runhead', d: `M-0.9,${y + hh * 0.12 + 1.4} L0,${y + hh * 0.12} L0.9,${y + hh * 0.12 + 1.4}` }));
      break;
    }
    default:
      out.push(r('vz-sp-prop', { rx: 0.8 }));
  }
  return out;
}

export function drawPiece(p, { editable, selected } = {}) {
  const g = svg('g', {
    class: 'vz-sp vz-sp-' + p.kind + (selected ? ' is-selected' : ''),
    'data-piece': p.id,
    transform: `translate(${p.x} ${p.y}) rotate(${p.rot})`
  });
  if (editable) {
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${p.label || p.kind}, set piece. Arrow keys move it, [ and ] turn it.`);
    g.append(svg('rect', { class: 'vz-sp-hit', x: -p.w / 2 - 1.2, y: -p.h / 2 - 1.2, width: p.w + 2.4, height: p.h + 2.4 }));
  }
  g.append(...glyph(p));
  if (selected) g.append(svg('rect', { class: 'vz-sel-box', x: -p.w / 2 - 0.8, y: -p.h / 2 - 0.8, width: p.w + 1.6, height: p.h + 1.6 }));
  if (p.label) {
    // The label reads upright whatever way the piece is turned.
    /* A thin piece (a wall, a door, a window) carries its label beside
       it rather than struck through it. */
    const thick = Math.min(p.w, p.h);
    const thin = thick < 3;
    // Is the long side upright on screen? Then the label goes beside it.
    const upright = thin && ((p.w > p.h) === (Math.round(p.rot / 90) % 2 === 1));
    const t = svg('text', {
      class: 'vz-sp-label', transform: `rotate(${-p.rot})`,
      'text-anchor': upright ? 'start' : 'middle',
      x: upright ? thick / 2 + 1.2 : 0,
      y: upright ? 0.8 : thin ? thick / 2 + 2.6 : 0.8
    });
    t.textContent = p.label;
    g.append(t);
  }
  return g;
}

/* ---- marks ---------------------------------------------------------
   Five kinds. An ACTOR is a disc with a facing tick; a CAMERA a body
   with its field of view (from the lens when a linked shot says one);
   a LIGHT a head with rays and a beam; a MARK a diamond (a tape mark on
   the floor). A DOLLY TRACK is a rail from (x,y) to (toX,toY) — the
   same two points a move uses — drawn as two rails with sleepers so it
   never reads as a move arrow. */
function cameraCone(fov) {
  if (fov == null) {
    // The default wedge, exactly as it has always been drawn.
    return { cone: '0,-3.6 -5,-11 5,-11', l: [-5, -11], r: [5, -11] };
  }
  const half = Math.min(60, Math.max(2, fov / 2)) * Math.PI / 180;
  const depth = 9.4;   // from the lens at -3.6 to -13
  const dx = Math.tan(half) * depth;
  const y = -3.6 - depth;
  return { cone: `0,-3.6 ${-dx},${y} ${dx},${y}`, l: [-dx, y], r: [dx, y] };
}

export function drawMark(m, { editable, selected, shotNos = [], fov = null, hue = null, linked = false } = {}) {
  const g = svg('g', {
    class: 'vz-mk vz-mk-' + m.kind + (selected ? ' is-selected' : '') + (linked ? ' is-linked' : '')
      + (hue != null ? ' vz-ch-' + hue : ''),
    'data-mark': m.id,
    transform: `translate(${m.x} ${m.y})`
  });
  if (editable) {
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', m.kind === 'track'
      ? `${m.label || 'Track'}, dolly track start. Arrow keys move it.`
      : `${m.label || m.kind}, ${m.kind}. Arrow keys move it, [ and ] turn it.`);
  }
  if (m.kind === 'track') {
    const dx = (m.toX ?? m.x) - m.x, dy = (m.toY ?? m.y) - m.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len, ny = dx / len;           // unit normal: the rail gauge
    const gauge = 1.1;
    const rails = svg('g', { class: 'vz-mk-rails' });
    for (const s of [-1, 1]) {
      rails.append(svg('line', { class: 'vz-mk-rail', x1: nx * gauge * s, y1: ny * gauge * s, x2: dx + nx * gauge * s, y2: dy + ny * gauge * s }));
    }
    const n = Math.max(2, Math.floor(len / 3));
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      rails.append(svg('line', { class: 'vz-mk-sleeper', x1: dx * t - nx * 1.8, y1: dy * t - ny * 1.8, x2: dx * t + nx * 1.8, y2: dy * t + ny * 1.8 }));
    }
    g.append(rails, svg('circle', { class: 'vz-mk-shape', r: 1.6 }));
  } else {
    const body = svg('g', { transform: `rotate(${m.rot})` });
    if (m.kind === 'camera') {
      const c = cameraCone(fov);
      body.append(svg('polygon', { class: 'vz-mk-cone', points: c.cone }),
        svg('polygon', { class: 'vz-mk-shape', points: '-2.6,2.2 2.6,2.2 0,-3.6' }),
        svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: c.l[0], y2: c.l[1] }),
        svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: c.r[0], y2: c.r[1] }));
    } else if (m.kind === 'light') {
      body.append(svg('polygon', { class: 'vz-mk-beam', points: '-1.6,-2 1.6,-2 7,-13 -7,-13' }));
      for (let a = 0; a < 360; a += 45) {
        const r = (a * Math.PI) / 180;
        body.append(svg('line', { class: 'vz-mk-ray', x1: Math.sin(r) * 2.4, y1: -Math.cos(r) * 2.4, x2: Math.sin(r) * 3.4, y2: -Math.cos(r) * 3.4 }));
      }
      body.append(svg('circle', { class: 'vz-mk-shape', r: 1.8 }));
    } else if (m.kind === 'mark') {
      body.append(svg('path', { class: 'vz-mk-shape', d: 'M-1.8,0 L0,-1.8 L1.8,0 L0,1.8 Z' }));
    } else {
      body.append(svg('circle', { class: 'vz-mk-shape', r: 2.4 }),
        svg('line', { class: 'vz-mk-face', x1: 0, y1: -2.4, x2: 0, y2: -4.4 }));
    }
    g.append(body);
  }
  /* A thumb-sized target: an unpainted disc under the mark, about 36px
     across on a phone at fit, so a mark can be picked up by touch
     without first zooming in. */
  if (editable) g.prepend(svg('circle', { class: 'vz-mk-hit', r: 5 }));
  const label = svg('text', { class: 'vz-mk-label', y: 5.9, 'text-anchor': 'middle' });
  label.textContent = m.label || '';
  g.append(label);
  /* A camera that shots point at says which, on a badge beside it: read
     off the shot records on every draw; the mark stores none of it. */
  if (shotNos.length) {
    const txt = shotNos.join(', ');
    const w = Math.max(3.6, txt.length * 1.55 + 1.6);
    g.append(svg('g', { class: 'vz-mk-badge', transform: 'translate(3.4 -5.4)' }, [
      svg('rect', { x: 0, y: -1.7, width: w, height: 3.4, rx: 1.7 }),
      Object.assign(svg('text', { x: w / 2, y: 0.95, 'text-anchor': 'middle' }), { textContent: txt })
    ]));
  }
  return g;
}

/** What a map says to a screen reader, and the part of it the key prints. */
export function mapSummary(block) {
  const parts = [plural(block.marks.length, 'mark', 'marks')];
  if (block.set && block.set.length) parts.push(plural(block.set.length, 'set piece', 'set pieces'));
  if (block.axis) parts.push('a 180-degree line');
  return parts.join(', ');
}

/**
 * The map. `opts`:
 *   editable   draw the focus stops, hit areas and handles
 *   viewBox    {x, y, w, h} (the whole floor when absent)
 *   zoomed     the view is closer than fit
 *   selected   Set of mark / piece ids
 *   primary    the one id whose handles are drawn
 *   linkedCam  the camera a focused shot row names
 *   shots      every shot (for shot numbers and the lens's field of view)
 *   hues       Map characterId → colour index
 *   snap       draw the finer snapping grid
 *   idPrefix   makes the defs' ids unique when one block is drawn twice
 *   under      a SHOT's diagram only: the scene's floor block, whose set
 *              and 180° line are drawn dimmed underneath and never take a
 *              pointer (they are the floor's to edit, not this shot's);
 *              its width gives the distances when the shot has none
 *   sides      the 180° sides to draw with (shots.js sceneAxisSides, so a
 *              camera on ANOTHER shot's diagram counts); default: this
 *              block's own
 */
export function drawBlock(block, opts = {}) {
  const { editable = false, zoomed = false, selected = new Set(), primary = '', linkedCam = '', shots = [], hues = new Map(), snap = false } = opts;
  const vb = opts.viewBox || { x: 0, y: 0, w: BLOCK_W, h: BLOCK_H };
  const uid = (opts.idPrefix || (editable ? 'e' : 'r')) + '-' + block.id;
  const set = block.set || [];
  const under = opts.under && opts.under !== block ? opts.under : null;
  const root = svg('svg', {
    class: 'vz-map' + (editable ? ' is-editable' : '') + (zoomed ? ' is-zoomed' : '') + (snap ? ' is-snapping' : ''),
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    role: editable ? 'group' : 'img',
    'aria-label': `Overhead map "${block.name || 'setup'}": ${mapSummary(block)}` + (under ? ', drawn over the floor plan' : '')
      + (editable ? '. Plus and minus zoom, 0 fits, the arrow keys pan.' : ''),
    'data-block': block.id,
    // The map itself is a focus stop in the editor: the keyboard's way
    // to zoom and pan (see ZOOM AND PAN in editor.js).
    tabindex: editable ? 0 : null
  });
  /* At fit the map lets one finger scroll the page (touch-action:
     pan-y), so a second finger has to claim the gesture before the
     browser does: a cancelable two-finger move over the map is ours.
     On the map itself, not the document, so the rest of the page
     keeps the browser's fast scrolling path. */
  if (editable) {
    root.addEventListener('touchmove', (e) => {
      if (e.touches.length > 1 && e.cancelable) e.preventDefault();
    }, { passive: false });
  }
  root.append(
    svg('defs', {}, [
      svg('pattern', { id: 'vzgrid-' + uid, width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, [
        svg('path', { d: 'M10 0H0V10', class: 'vz-map-grid' })
      ]),
      svg('pattern', { id: 'vzfine-' + uid, width: 2.5, height: 2.5, patternUnits: 'userSpaceOnUse' }, [
        svg('path', { d: 'M2.5 0H0V2.5', class: 'vz-map-fine' })
      ]),
      svg('marker', { id: 'vzarrow-' + uid, viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' }, [
        svg('path', { d: 'M0,0 L6,3 L0,6 Z', class: 'vz-map-arrowhead' })
      ])
    ]),
    svg('rect', { class: 'vz-map-ground', width: BLOCK_W, height: BLOCK_H })
  );
  if (snap) root.append(svg('rect', { fill: `url(#vzfine-${uid})`, width: BLOCK_W, height: BLOCK_H }));
  root.append(svg('rect', { fill: `url(#vzgrid-${uid})`, width: BLOCK_W, height: BLOCK_H }));

  // The floor's set, under a shot's own diagram: seen, never grabbed.
  if (under) {
    const floorSet = svg('g', { class: 'vz-set vz-under', 'aria-hidden': 'true' });
    for (const p of under.set || []) {
      const n = drawPiece(p, {});
      n.removeAttribute('data-piece');   // not this diagram's: no handler may find it
      floorSet.append(n);
    }
    root.append(floorSet);
  }
  // The set: furniture under the people.
  const setLayer = svg('g', { class: 'vz-set' });
  for (const p of set) setLayer.append(drawPiece(p, { editable, selected: editable && selected.has(p.id) }));
  root.append(setLayer);

  // The 180-degree line, over the set and under everything that moves.
  const sides = opts.sides || axisSides(block);
  const axis = block.axis || (under && under.axis) || null;
  if (axis) {
    const a = axis;
    const ax = svg('g', { class: 'vz-axis' + (sides.crossed ? ' is-crossed' : '') + (block.axis ? '' : ' vz-under') });
    ax.append(svg('line', { class: 'vz-axis-line', x1: a.x1, y1: a.y1, x2: a.x2, y2: a.y2 }));
    const tag = svg('text', { class: 'vz-axis-tag', x: a.x1 + (a.x2 - a.x1) * 0.06, y: a.y1 + (a.y2 - a.y1) * 0.06 - 1.4, 'text-anchor': 'middle' });
    tag.textContent = '180°';
    ax.append(tag);
    root.append(ax);
  }

  /* Distance callouts, under everything: derived by blockCallouts()
     from the floor width the user typed, and absent without one. */
  const callouts = blockCallouts(under && !String(block.widthM ?? '').trim() ? { ...block, widthM: under.widthM } : block);
  for (const c of callouts) {
    if (c.kind === 'reach') root.append(svg('line', { class: 'vz-map-reach', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 }));
  }

  // Walks next, so every mark draws over its own line; then the beats.
  const beatLayer = svg('g', { class: 'vz-beats' });
  const prefixes = beatPrefixes(block);
  for (const m of block.marks) {
    const pts = walkPoints(m);
    if (!pts.length) continue;
    const hue = m.charId && hues.has(m.charId) ? hues.get(m.charId) : null;
    const hueCls = hue != null ? ' vz-ch-' + hue : '';
    // A plain two-point move stays a <line>, exactly as older builds drew it.
    root.append(pts.length === 2 && !m.curve
      ? svg('line', { class: 'vz-mk-move vz-mk-move-' + m.kind + hueCls, 'data-walk': m.id, x1: m.x, y1: m.y, x2: m.toX, y2: m.toY, 'marker-end': `url(#vzarrow-${uid})` })
      : svg('path', { class: 'vz-mk-move vz-mk-move-' + m.kind + hueCls, 'data-walk': m.id, d: walkD(pts, m.curve), fill: 'none', 'marker-end': `url(#vzarrow-${uid})` }));
    if (pts.length > 2 || (m.path && m.path.length) || m.kind === 'actor' || m.kind === 'camera') {
      const pre = prefixes.get(m.id) || 'A';
      pts.forEach((p, i) => {
        if (i === 0) return;   // the mark itself stands at beat 1
        const g = svg('g', { class: 'vz-beat' + hueCls, transform: `translate(${p.x} ${p.y})` });
        g.append(svg('circle', { class: 'vz-beat-dot', r: 1.9 }));
        const t = svg('text', { class: 'vz-beat-no', y: 0.85, 'text-anchor': 'middle' });
        t.textContent = pre + (i + 1);
        g.append(t);
        if (p.beat) {
          // Words run to the left of a stop near the right edge, so they stay on the floor.
          const left = p.x > BLOCK_W * 0.72;
          const b = svg('text', { class: 'vz-beat-text', x: left ? -2.6 : 2.6, y: 0.9, 'text-anchor': left ? 'end' : 'start' });
          b.textContent = p.beat;
          g.append(b);
        }
        beatLayer.append(g);
      });
    }
  }
  root.append(beatLayer);

  // Tracks under the people and the cameras that ride them.
  const order = (k) => (k === 'track' ? 0 : k === 'light' ? 1 : 2);
  const linkedShots = shots.filter((x) => x.cam);
  for (const m of block.marks.slice().sort((a, b) => order(a.kind) - order(b.kind))) {
    const isCam = m.kind === 'camera';
    root.append(drawMark(m, {
      editable,
      selected: editable && selected.has(m.id),
      shotNos: isCam ? shotsOfCamera(m.id, linkedShots).map((x) => x.number || '?') : [],
      fov: isCam ? cameraFov(m.id, linkedShots) : null,
      hue: m.charId && hues.has(m.charId) ? hues.get(m.charId) : null,
      linked: isCam && !!linkedCam && m.id === linkedCam
    }));
  }
  // A camera across the line says so on the map, not only in the panel.
  if (sides.crossed) {
    for (const id of sides.left.length <= sides.right.length ? sides.left : sides.right) {
      const c = block.marks.find((m) => m.id === id);
      if (c) root.append(svg('g', { class: 'vz-axis-warn', transform: `translate(${c.x - 4.6} ${c.y - 5.2})` }, [
        svg('circle', { r: 1.7 }), Object.assign(svg('text', { y: 0.95, 'text-anchor': 'middle' }), { textContent: '!' })
      ]));
    }
  }
  for (const c of callouts) {
    const t = svg('text', { class: 'vz-map-callout', x: c.x, y: c.kind === 'track' ? c.y - 2.4 : c.y - 1, 'text-anchor': 'middle' });
    t.textContent = formatMetres(c.metres);
    root.append(t);
  }

  if (editable) drawHandles(root, block, primary, selected);
  return root;
}

/* The editor's handles for the ONE primary selection: the far end of a
   move (or a rail), each beat of a walk, the rotate knob, and the two
   ends of the 180-degree line (always grabbable while it exists). */
function drawHandles(root, block, primary, selected) {
  const m = block.marks.find((x) => x.id === primary);
  const p = !m && (block.set || []).find((x) => x.id === primary);
  if (m && m.toX != null) {
    root.append(svg('circle', { class: 'vz-mk-handle', 'data-handle': m.id, cx: m.toX, cy: m.toY, r: 2.2, tabindex: 0, role: 'button',
      'aria-label': m.kind === 'track'
        ? `Far end of ${m.label || 'the track'}. Arrow keys move it.`
        : `End of ${m.label || m.kind}'s move. Arrow keys move it.` }));
    (m.path || []).forEach((b, i) => {
      root.append(svg('circle', { class: 'vz-mk-handle vz-beat-handle', 'data-beat': m.id, 'data-i': i, cx: b.x, cy: b.y, r: 2.2, tabindex: 0, role: 'button',
        'aria-label': `Beat ${i + 3} of ${m.label || m.kind}'s walk. Arrow keys move it, Delete removes it.` }));
    });
  }
  const item = (m && m.kind !== 'track') ? m : p;
  if (item && selected.size === 1) {
    const reach = p ? Math.max(p.w, p.h) / 2 + 3.2 : 7.6;
    const r = (item.rot * Math.PI) / 180;
    const hx = item.x + Math.sin(r) * reach, hy = item.y - Math.cos(r) * reach;
    root.append(svg('line', { class: 'vz-rot-arm', x1: item.x, y1: item.y, x2: hx, y2: hy }),
      svg('circle', { class: 'vz-rot-handle', 'data-rot': item.id, cx: hx, cy: hy, r: 1.6,
        'aria-hidden': 'true' }));
  }
  if (block.axis) {
    const a = block.axis;
    for (const [end, x, y] of [['1', a.x1, a.y1], ['2', a.x2, a.y2]]) {
      root.append(svg('circle', { class: 'vz-axis-handle', 'data-axis': end, cx: x, cy: y, r: 1.4, tabindex: 0, role: 'button',
        'aria-label': `End ${end} of the 180-degree line. Arrow keys move it.` }));
    }
  }
}
