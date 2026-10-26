/* ============================================================
   BLOCKING — an overhead map of a scene, and the scene board
   ------------------------------------------------------------
   Two sections for visualize.html, both reading the shot model
   (src/lib/shots.js) and writing only through it:

     #blocking     a top-down map per setup: actors, cameras and marks,
                   each draggable, with an optional move to a second
                   point. Vector data only — a few numbers per mark —
                   so it costs nothing against the localStorage quota
                   that rules out images (see the header of shots.js).
     #scene-board  one scene on one surface: the script text, the shots,
                   the storyboard frames and the blocking maps side by
                   side, read-only, printable. Nothing is copied: every
                   word on it is read from the model it came from.

   NOTHING HERE IS STORED BUT THE MARKS. Which scene is picked and which
   mark is selected are module state for this visit; the idle-write
   assertion in `verify` would catch a view that wrote on load.

   DRAGGING WRITES ONCE. pointermove moves the SVG node and nothing
   else; pointerup commits one updateMark() and repaints. A drag that
   saved on every move would rewrite the whole shots blob sixty times
   a second.

   KEYBOARD. A mark is a focus stop; the arrow keys move it one unit
   (Shift: five), [ and ] turn it, Delete removes it. A map you can
   only drag is a map somebody cannot use.

   ZOOM AND PAN (14 Oct 2026, the phone pass). On a 390px phone the
   100-unit floor is 358px wide and a mark is a dot under a thumb, so
   the editor's map can be looked at closer: pinch, Ctrl+wheel (a
   trackpad pinch arrives as one) or the zoom buttons; drag the empty
   floor to pan once zoomed in. The SAME things from the keyboard: the
   map itself is a focus stop, + and − zoom, 0 fits, the arrow keys pan
   (Shift: further). The view is the svg's viewBox and lives in memory
   per setup for this visit — how you are looking at a map is not the
   map, so nothing about it is stored, and a mark keeps the coordinates
   it always had. At rest (fit) one finger still scrolls the page
   (touch-action: pan-y); zoomed in, the map takes the finger.
   ============================================================ */
import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';
import { formatEighths } from '../lib/scenes.js';
import Shots, { BLOCK_W, BLOCK_H, BLOCK_KINDS, clampPoint, blockCallouts, blockScale, formatMetres } from '../lib/shots.js';
import { button, buttonGroup, badge, intExtBadge, todBadge, field as kitField } from './kit/index.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, kids = []) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of kids) if (c) el.append(c);
  return el;
};

let pickedScene = '';          // scene id for both sections
const views = new Map();       // blockId -> { z, cx, cy }; in memory only
const Z_MIN = 1, Z_MAX = 4;
let sel = { blockId: '', markId: '' };
let rerender = () => {};

const slugOf = (scene) =>
  [scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' · ') || 'Scene';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* ---- the view (zoom and pan) ----------------------------------- */
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
function viewOf(blockId) {
  return views.get(blockId) || { z: 1, cx: BLOCK_W / 2, cy: BLOCK_H / 2 };
}
/** The viewBox for a view, kept inside the floor: zoomed in, the edge
    of the map is the edge of the pan. */
function viewBoxOf(v) {
  const w = BLOCK_W / v.z, hh = BLOCK_H / v.z;
  const x = clampN(v.cx - w / 2, 0, BLOCK_W - w);
  const y = clampN(v.cy - hh / 2, 0, BLOCK_H - hh);
  return { x, y, w, h: hh };
}
const zoomLabel = (z) => (Math.round(z * 10) / 10) + '×';
/** Set a block's view and paint it on every editable map of it, in
    place: no re-render, no write. */
function setView(blockId, next) {
  const z = clampN(next.z, Z_MIN, Z_MAX);
  const vb0 = viewBoxOf({ z, cx: next.cx, cy: next.cy });
  // Keep the CLAMPED centre, so a pan past the edge does not bank
  // distance that the next pan has to unwind first.
  const v = { z, cx: vb0.x + vb0.w / 2, cy: vb0.y + vb0.h / 2 };
  if (z === 1) views.delete(blockId); else views.set(blockId, v);
  const vb = viewBoxOf(v);
  document.querySelectorAll('.vz-map.is-editable[data-block="' + CSS.escape(blockId) + '"]').forEach((el) => {
    el.setAttribute('viewBox', `${vb.x} ${vb.y} ${vb.w} ${vb.h}`);
    el.classList.toggle('is-zoomed', z > 1);
    const card = el.closest('.vz-blk');
    if (!card) return;
    const read = card.querySelector('.vz-blk-zoomread');
    if (read) read.textContent = zoomLabel(z);
    const btn = (by) => card.querySelector('[data-action="blk-zoom"][data-by="' + by + '"]');
    const out = btn('out'), inn = btn('in'), fit = btn('fit');
    if (out) out.disabled = z <= Z_MIN;
    if (fit) fit.disabled = z <= Z_MIN;
    if (inn) inn.disabled = z >= Z_MAX;
  });
}
/** Zoom by a factor about a point in map units (the centre if none). */
function zoomAbout(blockId, factor, at) {
  const v = viewOf(blockId);
  const z = clampN(v.z * factor, Z_MIN, Z_MAX);
  const p = at || { x: v.cx, y: v.cy };
  // Keep `p` where it is on screen: the centre moves toward it by the
  // share of the view the zoom took away.
  const k = v.z / z;
  setView(blockId, { z, cx: p.x + (v.cx - p.x) * k, cy: p.y + (v.cy - p.y) * k });
}
/** Pan by a share of the visible width / height. */
function panBy(blockId, fx, fy) {
  const v = viewOf(blockId);
  setView(blockId, { z: v.z, cx: v.cx + fx * (BLOCK_W / v.z), cy: v.cy + fy * (BLOCK_H / v.z) });
}
/** After a keyboard move, keep the mark on screen. */
function keepInView(blockId, x, y) {
  const v = viewOf(blockId);
  if (v.z === 1) return;
  const vb = viewBoxOf(v);
  const pad = 4;
  if (x < vb.x + pad || x > vb.x + vb.w - pad || y < vb.y + pad || y > vb.y + vb.h - pad) {
    setView(blockId, { z: v.z, cx: x, cy: y });
  }
}

function pickScene(scenes) {
  if (!scenes.some((s) => s.id === pickedScene)) {
    const withBlock = new Set(Shots.listBlocks().map((b) => b.sceneId));
    pickedScene = (scenes.find((s) => withBlock.has(s.id)) || scenes[0] || {}).id || '';
  }
  return scenes.find((s) => s.id === pickedScene) || null;
}

function scenePicker(scenes, name) {
  return kitField({
    kind: 'select', label: 'scene', value: pickedScene, class: 'vz-blk-scenefield',
    options: scenes.map((s) => ({ value: s.id, label: (s.number ? s.number + ' · ' : '') + slugOf(s) })),
    attrs: { 'data-blk-scene': name, 'aria-label': 'Scene', class: 'vz-blk-scene' }
  });
}

/* ---- the map ---------------------------------------------------
   One drawing function for the editor and the read-only board, so the
   two cannot disagree about what a mark looks like.

   Five kinds. An ACTOR is a disc with a facing tick; a CAMERA a wedge
   with its field of view; a LIGHT a head with rays and a beam; a MARK
   a diamond (a tape mark on the floor). A DOLLY TRACK is a rail from
   (x,y) to (toX,toY) — the same two points a move uses — drawn as two
   rails with sleepers so it never reads as a move arrow. */
/* The camera a focused shot row names. Held here as well as painted, so a
   map drawn after the focus (the Blocking tab re-renders when opened) still
   shows it. In memory only; nothing is stored. */
let linkedCam = '';
export function highlightCamera(id) {
  linkedCam = id || '';
  document.querySelectorAll('.vz-mk-camera[data-mark]').forEach((el) => {
    el.classList.toggle('is-linked', !!linkedCam && el.getAttribute('data-mark') === linkedCam);
  });
}

function drawMark(m, { editable, selected, shotNos = [] }) {
  const g = svg('g', {
    class: 'vz-mk vz-mk-' + m.kind + (selected ? ' is-selected' : '') + (m.kind === 'camera' && m.id === linkedCam ? ' is-linked' : ''),
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
      body.append(svg('polygon', { class: 'vz-mk-cone', points: '0,-3.6 -5,-11 5,-11' }),
        svg('polygon', { class: 'vz-mk-shape', points: '-2.6,2.2 2.6,2.2 0,-3.6' }),
        svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: -5, y2: -11 }),
        svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: 5, y2: -11 }));
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
  g.append(svg('text', { class: 'vz-mk-label', y: 6.4, 'text-anchor': 'middle' }));
  // A camera that shots point at says which: "Cam A · 1, 3". Read off the
  // shot records on every draw; the mark stores none of it.
  g.lastChild.textContent = (m.label || '') + (shotNos.length ? ' · ' + shotNos.join(', ') : '');
  return g;
}

export function drawBlock(block, { editable = false } = {}) {
  const v = editable ? viewOf(block.id) : { z: 1 };
  const vb = editable ? viewBoxOf(v) : { x: 0, y: 0, w: BLOCK_W, h: BLOCK_H };
  const root = svg('svg', {
    class: 'vz-map' + (editable ? ' is-editable' : '') + (v.z > 1 ? ' is-zoomed' : ''),
    viewBox: `${vb.x} ${vb.y} ${vb.w} ${vb.h}`,
    role: editable ? 'group' : 'img',
    'aria-label': `Overhead map "${block.name || 'setup'}": ${plural(block.marks.length, 'mark', 'marks')}`
      + (editable ? '. Plus and minus zoom, 0 fits, the arrow keys pan.' : ''),
    'data-block': block.id,
    // The map itself is a focus stop in the editor: the keyboard's way
    // to zoom and pan (see ZOOM AND PAN in the header).
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
      svg('pattern', { id: 'vzgrid-' + block.id, width: 10, height: 10, patternUnits: 'userSpaceOnUse' }, [
        svg('path', { d: 'M10 0H0V10', class: 'vz-map-grid' })
      ]),
      svg('marker', { id: 'vzarrow-' + block.id, viewBox: '0 0 6 6', refX: 5, refY: 3, markerWidth: 4, markerHeight: 4, orient: 'auto-start-reverse' }, [
        svg('path', { d: 'M0,0 L6,3 L0,6 Z', class: 'vz-map-arrowhead' })
      ])
    ]),
    svg('rect', { class: 'vz-map-ground', width: BLOCK_W, height: BLOCK_H }),
    svg('rect', { fill: `url(#vzgrid-${block.id})`, width: BLOCK_W, height: BLOCK_H })
  );
  /* Distance callouts, under everything: derived by blockCallouts()
     from the floor width the user typed, and absent without one. */
  const callouts = blockCallouts(block);
  for (const c of callouts) {
    if (c.kind === 'reach') {
      root.append(svg('line', { class: 'vz-map-reach', x1: c.x1, y1: c.y1, x2: c.x2, y2: c.y2 }));
    }
  }
  // Moves next, so every mark draws over its own line.
  for (const m of block.marks) {
    if (m.toX == null || m.kind === 'track') continue;
    root.append(svg('line', {
      class: 'vz-mk-move vz-mk-move-' + m.kind,
      x1: m.x, y1: m.y, x2: m.toX, y2: m.toY, 'marker-end': `url(#vzarrow-${block.id})`
    }));
  }
  // Tracks under the people and the cameras that ride them.
  const order = (k) => (k === 'track' ? 0 : k === 'light' ? 1 : 2);
  const linked = Shots.listShots().filter((x) => x.cam);
  for (const m of block.marks.slice().sort((a, b) => order(a.kind) - order(b.kind))) {
    const shotNos = m.kind === 'camera' ? Shots.shotsOfCamera(m.id, linked).map((x) => x.number || '?') : [];
    root.append(drawMark(m, { shotNos, editable, selected: editable && sel.markId === m.id && sel.blockId === block.id }));
  }
  for (const c of callouts) {
    const t = svg('text', { class: 'vz-map-callout', x: c.x, y: c.kind === 'track' ? c.y - 2.4 : c.y - 1, 'text-anchor': 'middle' });
    t.textContent = formatMetres(c.metres);
    root.append(t);
  }
  if (editable && sel.blockId === block.id) {
    const m = block.marks.find((x) => x.id === sel.markId);
    if (m && m.toX != null) {
      root.append(svg('circle', { class: 'vz-mk-handle', 'data-handle': m.id, cx: m.toX, cy: m.toY, r: 2.2, tabindex: 0, role: 'button',
        'aria-label': m.kind === 'track'
          ? `Far end of ${m.label || 'the track'}. Arrow keys move it.`
          : `End of ${m.label || m.kind}'s move. Arrow keys move it.` }));
    }
  }
  return root;
}

/* What is on a map, counted. Printed under it, so the key carries the
   numbers and identity is never colour alone. */
function mapKey(block) {
  const n = (k) => block.marks.filter((m) => m.kind === k).length;
  const key = h('ul.vz-map-key', { 'aria-label': 'What is on this map' });
  for (const k of BLOCK_KINDS) {
    const c = n(k.id);
    if (!c) continue;
    key.append(h('li.vz-key-' + k.id, {}, [
      h('span.vz-key-swatch', { 'aria-hidden': 'true' }),
      h('span', { text: k.label + (c > 1 ? ' × ' + c : '') })
    ]));
  }
  return key.childNodes.length ? key : null;
}

/* ---- the blocking section -------------------------------------- */
const WIDTH_SET = 'Distances are drawn to this scale: camera to each actor, and each track’s length.';
const WIDTH_UNSET = 'Say how wide this floor is and the map prints camera-to-actor distances and track lengths.';
const KIND_ICON = { actor: 'person', camera: 'videocam', track: 'timeline', light: 'lightbulb', mark: 'place' };

function renderBlockCard(block) {
  const card = h('article.vz-blk.k-panel', { 'data-block': block.id });
  card.append(h('div.vz-blk-head.k-panel-head', {}, [
    h('div.k-control.vz-blk-namebox', {}, [
      h('input.k-input.vz-blk-name', { type: 'text', value: block.name, placeholder: 'Setup name', 'data-block-field': 'name', 'aria-label': 'Setup name' })
    ]),
    button({ label: 'Delete setup', icon: 'delete', size: 'sm', variant: 'danger', action: 'blk-del' })
  ]));

  const body = h('div.vz-blk-body.k-panel-body');
  const stage = h('div.vz-blk-stage');
  stage.append(h('div.vz-blk-tools', { role: 'group', 'aria-label': 'Add to the map' }, BLOCK_KINDS.map((k) =>
    button({ label: k.label, icon: KIND_ICON[k.id] || 'add', size: 'sm', action: 'blk-add-mark', attrs: { 'data-kind': k.id } }))));
  const z = viewOf(block.id).z;
  stage.append(h('div.vz-blk-view', { role: 'group', 'aria-label': 'Zoom the map' }, [
    buttonGroup([
      button({ label: 'Zoom out', icon: 'zoom_out', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z <= Z_MIN, attrs: { 'data-by': 'out' } }),
      button({ label: 'Zoom in', icon: 'zoom_in', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z >= Z_MAX, attrs: { 'data-by': 'in' } }),
      button({ label: 'Fit the whole floor', icon: 'fit_screen', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z <= Z_MIN, attrs: { 'data-by': 'fit' } })
    ], { label: 'Zoom' }),
    h('span.vz-blk-zoomread.k-mono', { text: zoomLabel(z), 'aria-live': 'polite' }),
    h('span.vz-blk-viewhint', { text: 'Pinch or Ctrl+scroll to zoom, drag the floor to pan. Focus the map for + − 0 and the arrows.' })
  ]));
  stage.append(drawBlock(block, { editable: true }));
  const key = mapKey(block);
  if (key) stage.append(key);
  body.append(stage);

  const side = h('div.vz-blk-side');
  side.append(kitField({
    kind: 'mono', label: 'Floor width', addon: 'm', value: block.widthM, placeholder: 'e.g. 12',
    class: 'vz-blk-width',
    hint: blockScale(block) ? WIDTH_SET : WIDTH_UNSET,
    attrs: { 'data-block-field': 'widthM', inputmode: 'decimal', 'aria-label': 'Floor width in metres' }
  }));

  const m = sel.blockId === block.id ? block.marks.find((x) => x.id === sel.markId) : null;
  if (m) {
    const kind = (BLOCK_KINDS.find((k) => k.id === m.kind) || { label: m.kind }).label;
    side.append(h('div.vz-blk-sel', { role: 'group', 'aria-label': 'Selected: ' + (m.label || kind) }, [
      h('p.k-eyebrow', {}, [h('span', { text: 'Selected' }), h('span.k-eyebrow-sep', { text: '/', 'aria-hidden': 'true' }), h('span.k-eyebrow-muted', { text: kind })]),
      h('div.k-control.vz-blk-labelbox', {}, [
        h('input.k-input.vz-blk-label', { type: 'text', value: m.label, placeholder: 'Label', 'data-mark-field': 'label', 'aria-label': 'Label of the selected mark' })
      ]),
      h('div.vz-blk-selacts', {}, [
        m.kind === 'track' ? null : buttonGroup([
          button({ label: 'Turn 15 degrees left', icon: 'rotate_left', iconOnly: true, size: 'sm', action: 'mk-turn', attrs: { 'data-by': '-15' } }),
          button({ label: 'Turn 15 degrees right', icon: 'rotate_right', iconOnly: true, size: 'sm', action: 'mk-turn', attrs: { 'data-by': '15' } })
        ], { label: 'Turn' }),
        m.kind === 'track' ? null
          : m.toX == null
            ? button({ label: 'Add a move', icon: 'arrow_forward', size: 'sm', action: 'mk-move-add' })
            : button({ label: 'Clear the move', icon: 'close', size: 'sm', action: 'mk-move-clear' }),
        button({ label: 'Remove mark', icon: 'delete', size: 'sm', variant: 'danger', action: 'mk-del' })
      ])
    ]));
  } else if (block.marks.length) {
    side.append(h('p.vz-blk-hint', { text: 'Pick a mark to name it, turn it or give it a move.' }));
  }
  side.append(kitField({
    kind: 'textarea', rows: 3, label: 'Crew note', value: block.note,
    placeholder: 'A note for the crew — what the move is, where the light comes from…',
    class: 'vz-blk-notefield',
    attrs: { 'data-block-field': 'note', 'aria-label': 'Note on this setup', class: 'vz-blk-note' }
  }));
  body.append(side);
  card.append(body);
  return card;
}

export function renderBlocking(scenes, redraw) {
  rerender = redraw;
  const wrap = h('section.vz-blocking', { id: 'blocking', 'data-tab-icon': 'grid_view' });
  wrap.append(
    h('h2.bd-h2', { text: 'Blocking' }),
    h('p.bd-sub', {
      text: 'A top-down map of where the actors stand, where the camera sits and what it faces, '
          + 'and where anyone moves to. Drag a mark, or focus it and use the arrow keys. '
          + 'It is a few numbers per mark, so it costs nothing to keep.'
    })
  );
  if (!scenes.length) {
    wrap.append(h('p.bd-none', { text: 'Blocking belongs to a scene, so the breakdown comes first. Break the script into scenes and each one can have its maps.' }));
    return wrap;
  }
  const scene = pickScene(scenes);
  wrap.append(h('div.vz-blk-pick', {}, [
    scenePicker(scenes, 'blocking'),
    button({ label: 'Add a setup', icon: 'add', variant: 'primary', pill: true, action: 'blk-add', class: 'bd-cta' })
  ]));
  const blocks = Shots.blocksOfScene(scene.id);
  if (!blocks.length) {
    wrap.append(h('p.bd-none', { text: 'No maps for this scene yet. Add a setup, then place the actors and the camera.' }));
  }
  blocks.forEach((b) => wrap.append(renderBlockCard(b)));
  return wrap;
}

/* ---- the scene board ------------------------------------------- */
const EL_LABEL = { scene: 'scene', action: 'action', character: 'character', dialogue: 'dialogue', paren: 'paren', transition: 'transition', shot: 'shot' };

/** One column of the board: a kit panel whose head is the column's
    name and count. */
function sbCol(title, body, cls) {
  return h('div.vz-sb-col.k-panel' + (cls ? '.' + cls : ''), {}, [
    h('div.k-panel-head', {}, [h('h3.vz-sb-h.k-panel-title', { text: title })]),
    h('div.k-panel-body', {}, [].concat(body))
  ]);
}

export function renderSceneBoard(scenes, shots, frames, scriptElements, pairs, redraw) {
  rerender = redraw;
  const wrap = h('section.vz-sceneboard', { id: 'scene-board', 'data-tab-icon': 'article' });
  wrap.append(
    h('h2.bd-h2', { text: 'Scene board' }),
    h('p.bd-sub', {
      text: 'One scene on one page: the script, the shots, the storyboard frames and the maps, '
          + 'read from the places they live. Print it for the director, the DP and the first AD.'
    })
  );
  if (!scenes.length) {
    wrap.append(h('p.bd-none', { text: 'The scene board needs a scene. Break the script into scenes in the breakdown.' }));
    return wrap;
  }
  const scene = pickScene(scenes);
  wrap.append(h('div.vz-blk-pick', {}, [
    scenePicker(scenes, 'board'),
    button({ label: 'Print this board', icon: 'picture_as_pdf', action: 'board-print' })
  ]));

  const sheet = h('div.vz-sb');
  sheet.append(h('header.vz-sb-head', {}, [
    badge({ label: scene.number || '—', tag: true, class: 'vz-scene-no' }),
    h('span.vz-scene-slug', { text: slugOf(scene) }),
    h('span.vz-scene-badges', {}, [intExtBadge(scene.intExt), todBadge(scene.dayNight)]),
    // The length as every other view prints it ("2 2/8 pgs"), never raw eighths.
    h('span.vz-scene-count', { text: formatEighths(Number(scene.eighths) || 0) + ' pgs' })
  ]));
  if (scene.synopsis) sheet.append(h('p.vz-sb-syn', { text: scene.synopsis }));
  if (scene.readerNote) sheet.append(h('p.vz-sb-syn', { text: 'Reader note: ' + scene.readerNote }));

  // The script, as the model has it.
  const pair = (pairs || []).find((p) => p.scene.id === scene.id && p.slice);
  let scriptBody;
  if (pair && pair.slice.elements.length) {
    scriptBody = h('div.vz-sb-script');
    pair.slice.elements.slice(0, 60).forEach((el) => {
      const t = String(el.text || '').trim();
      if (t) scriptBody.append(h('p.vz-sb-el.vz-sb-' + (EL_LABEL[el.type] || 'action'), { text: t }));
    });
    if (pair.slice.elements.length > 60) scriptBody.append(h('p.vz-sb-more', { text: '…' }));
  } else {
    scriptBody = h('p.bd-none', { text: 'No script text is matched to this scene.' });
  }
  sheet.append(sbCol('Script', scriptBody));

  // The shots.
  const mine = shots.filter((s) => s.sceneId === scene.id);
  let shotBody;
  if (mine.length) {
    const t = h('table.k-table.vz-sb-table');
    t.append(h('thead', {}, [h('tr', {}, ['#', 'Size', 'Angle', 'Move', 'Lens', 'What we see', 'Status'].map((x) => h('th', { scope: 'col', text: x })))]));
    t.append(h('tbody', {}, mine.map((s, i) => {
      const st = Shots.shotStatus(s);
      const tr = h('tr' + (s.done ? '.is-done' : ''), {}, [
        s.number || String(i + 1), s.size, s.angle, s.movement, s.lens || '—', s.description || ''
      ].map((x) => h('td', { text: x })));
      tr.append(h('td', {}, [badge({ label: st.label, tone: st.tone, dot: true })]));
      return tr;
    })));
    shotBody = h('div.k-table-wrap', { role: 'region', tabindex: '0', 'aria-label': 'Shots in this scene' }, [t]);
  } else shotBody = h('p.bd-none', { text: 'No shots yet for this scene.' });
  sheet.append(sbCol('Shots · ' + mine.length, shotBody, 'vz-sb-shots'));

  // The storyboard frames, in shot order.
  const byShot = Shots.framesByShot();
  const fr = mine.flatMap((s) => (byShot.get(s.id) || []).map((f) => ({ f, s })));
  sheet.append(sbCol('Frames · ' + fr.length, fr.length
    ? h('ol.vz-sb-frames', {}, fr.map(({ f, s }) =>
      h('li', {}, [h('strong', { text: 'Shot ' + (s.number || '?') + ' ' }), h('span', { text: Shots.frameAction(f) || f.ref || 'untitled frame' })])))
    : h('p.bd-none', { text: 'No frames drawn for this scene.' })));

  // The maps, read-only.
  const blocks = Shots.blocksOfScene(scene.id);
  sheet.append(sbCol('Blocking · ' + blocks.length, blocks.length
    ? h('div.vz-sb-mapgrid', {}, blocks.map((b) => h('figure.vz-sb-map', {}, [
      drawBlock(b), h('figcaption', { text: [b.name, b.note].filter(Boolean).join(' — ') })
    ])))
    : h('p.bd-none', { text: 'No maps for this scene. Add one under Blocking.' }), 'vz-sb-maps'));

  wrap.append(sheet);
  return wrap;
}

/* ---- events ----------------------------------------------------- */
const blockIdOf = (el) => { const n = el.closest('[data-block]'); return n ? n.dataset.block : ''; };

/** A screen point in map units, through the svg's own transform — so
    it is right at any zoom and pan, not only at fit. */
function rawMap(svgEl, e) {
  const ctm = svgEl.getScreenCTM && svgEl.getScreenCTM();
  if (ctm) {
    const pt = svgEl.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }
  const r = svgEl.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * BLOCK_W, y: ((e.clientY - r.top) / r.height) * BLOCK_H };
}
function toMap(svgEl, e) {
  const p = rawMap(svgEl, e);
  return clampPoint(p.x, p.y);
}

let drag = null;
/* Pointers down on an editable map, for pan (one, on the floor, once
   zoomed in) and pinch (two, anywhere on it). Keyed by pointerId. */
const touches = new Map();
let gesture = null;   // { root, blockId, kind: 'pan' | 'pinch', ... }
function startGesture(root) {
  const pts = [...touches.values()].filter((t) => t.root === root);
  const blockId = root.dataset.block;
  const v = viewOf(blockId);
  if (pts.length >= 2) {
    const [a, b] = pts;
    gesture = { root, blockId, kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, z0: v.z,
      mid: rawMap(root, { clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 }) };
  } else if (pts.length === 1 && !pts[0].onMark && v.z > 1) {
    gesture = { root, blockId, kind: 'pan', x0: pts[0].x, y0: pts[0].y, cx0: v.cx, cy0: v.cy };
  } else gesture = null;
}
document.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest && e.target.closest('.vz-map.is-editable [data-handle]');
  const mk = !handle && e.target.closest && e.target.closest('.vz-map.is-editable [data-mark]');
  const floor = !handle && !mk && e.target.closest && e.target.closest('.vz-map.is-editable');
  if (floor) {
    /* The floor: a pan once zoomed in, a pinch with a second finger.
       Pressing it never moves a mark. A second finger while a mark is
       being dragged turns the drag into a pinch — the drag is dropped
       uncommitted, so a pinch cannot nudge a mark by accident. */
    touches.set(e.pointerId, { root: floor, x: e.clientX, y: e.clientY });
    if (drag && drag.root === floor) drag = null;
    startGesture(floor);
    if (gesture) {
      try { floor.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
      e.preventDefault();
    }
    return;
  }
  if (!handle && !mk) return;
  const mroot = (handle || mk).closest('.vz-map');
  touches.set(e.pointerId, { root: mroot, x: e.clientX, y: e.clientY, onMark: true });
  if ([...touches.values()].filter((t) => t.root === mroot).length >= 2) {
    drag = null;
    startGesture(mroot);
    e.preventDefault();
    return;
  }
  const root = (handle || mk).closest('.vz-map');
  const blockId = root.dataset.block;
  const markId = (handle || mk).dataset.handle || (handle || mk).dataset.mark;
  drag = { root, blockId, markId, node: handle || mk, end: !!handle, moved: false };
  sel = { blockId, markId };
  try { (handle || mk).setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  const t = touches.get(e.pointerId);
  if (t) { t.x = e.clientX; t.y = e.clientY; }
  if (gesture && t && t.root === gesture.root) {
    const g = gesture;
    if (g.kind === 'pan') {
      const r = g.root.getBoundingClientRect();
      const v = viewOf(g.blockId);
      const ux = (BLOCK_W / v.z) / (r.width || 1);   // map units per screen px
      setView(g.blockId, { z: v.z, cx: g.cx0 - (e.clientX - g.x0) * ux, cy: g.cy0 - (e.clientY - g.y0) * ux });
    } else {
      const pts = [...touches.values()].filter((p) => p.root === g.root);
      if (pts.length >= 2) {
        const [a, b] = pts;
        const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
        zoomAbout(g.blockId, (g.z0 * d / g.d0) / viewOf(g.blockId).z, g.mid);
      }
    }
    e.preventDefault();
    return;
  }
  if (!drag) return;
  drag.moved = true;
  const p = toMap(drag.root, e);
  drag.at = p;
  if (drag.end) { drag.node.setAttribute('cx', p.x); drag.node.setAttribute('cy', p.y); }
  else drag.node.setAttribute('transform', `translate(${p.x} ${p.y})`);
});
const finish = (e) => {
  const t = e && touches.get(e.pointerId);
  if (t) {
    touches.delete(e.pointerId);
    if (gesture && t.root === gesture.root) {
      // A finger lifted from a pinch: carry on as a pan, or stop.
      startGesture(t.root);
      return;
    }
  }
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved && d.at) {
    Shots.updateMark(d.blockId, d.markId, d.end ? { toX: d.at.x, toY: d.at.y } : { x: d.at.x, y: d.at.y });
  }
  rerender(`[data-block="${CSS.escape(d.blockId)}"] [data-mark="${CSS.escape(d.markId)}"]`);
};
document.addEventListener('pointerup', finish);
document.addEventListener('pointercancel', finish);

/* Ctrl+wheel zooms about the pointer — a trackpad pinch arrives as
   exactly that. A plain wheel is left to scroll the page. */
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  const root = e.target.closest && e.target.closest('.vz-map.is-editable');
  if (!root) return;
  e.preventDefault();
  zoomAbout(root.dataset.block, Math.exp(-e.deltaY * 0.01), rawMap(root, e));
}, { passive: false });

/* The map's own keys, when the svg itself has focus (not a mark on it). */
delegate(document, 'keydown', '.vz-map.is-editable', (e, root) => {
  if (e.target !== root) return;
  const id = root.dataset.block;
  const step = e.shiftKey ? 0.5 : 0.2;
  const pans = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  if (e.key === '+' || e.key === '=') zoomAbout(id, 1.5);
  else if (e.key === '-' || e.key === '_') zoomAbout(id, 1 / 1.5);
  else if (e.key === '0') setView(id, { z: 1, cx: BLOCK_W / 2, cy: BLOCK_H / 2 });
  else if (pans[e.key]) panBy(id, ...pans[e.key]);
  else return;
  e.preventDefault();
});
delegate(document, 'click', '[data-action="blk-zoom"]', (e, el) => {
  const id = blockIdOf(el);
  if (!id) return;
  const by = el.dataset.by;
  if (by === 'fit') setView(id, { z: 1, cx: BLOCK_W / 2, cy: BLOCK_H / 2 });
  else zoomAbout(id, by === 'in' ? 1.5 : 1 / 1.5);
});

delegate(document, 'keydown', '.vz-map.is-editable [data-mark], .vz-map.is-editable [data-handle]', (e, el) => {
  const root = el.closest('.vz-map');
  const blockId = root.dataset.block;
  const end = el.hasAttribute('data-handle');
  const markId = end ? el.dataset.handle : el.dataset.mark;
  const m = Shots.listBlocks().find((b) => b.id === blockId)?.marks.find((x) => x.id === markId);
  if (!m) return;
  const step = e.shiftKey ? 5 : 1;
  const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  sel = { blockId, markId };
  if (arrows[e.key]) {
    const [dx, dy] = arrows[e.key];
    Shots.updateMark(blockId, markId, end ? { toX: m.toX + dx, toY: m.toY + dy } : { x: m.x + dx, y: m.y + dy });
    if (end) keepInView(blockId, m.toX + dx, m.toY + dy); else keepInView(blockId, m.x + dx, m.y + dy);
  } else if (!end && (e.key === '[' || e.key === ']')) {
    Shots.updateMark(blockId, markId, { rot: m.rot + (e.key === ']' ? 15 : -15) });
  } else if (!end && (e.key === 'Delete' || e.key === 'Backspace')) {
    removeMarkWithUndo(blockId, markId);
    e.preventDefault();
    return;
  } else return;
  e.preventDefault();
  rerender(`[data-block="${CSS.escape(blockId)}"] ${end ? '[data-handle="' : '[data-mark="'}${CSS.escape(markId)}"]`);
});

delegate(document, 'change', '[data-blk-scene]', (e, el) => { pickedScene = el.value; rerender(); });
delegate(document, 'click', '[data-action="blk-add"]', () => {
  if (!pickedScene) return;
  const b = Shots.addBlock(pickedScene);
  sel = { blockId: b.id, markId: '' };
  rerender(`[data-block="${CSS.escape(b.id)}"] .vz-blk-name`);
  // The default name is a suggestion: select it so typing replaces it.
  const nameBox = document.querySelector(`[data-block="${CSS.escape(b.id)}"] .vz-blk-name`);
  if (nameBox && nameBox.select) nameBox.select();
});
delegate(document, 'click', '[data-action="blk-del"]', (e, el) => {
  const id = blockIdOf(el);
  const all = Shots.listBlocks();
  const at = all.findIndex((b) => b.id === id);
  const was = all[at];
  if (!was) return;
  // Focus goes to a neighbouring setup's name, else the Add button.
  const cards = [...document.querySelectorAll('.vz-blk[data-block]')];
  const here = cards.findIndex((n) => n.dataset.block === id);
  const near = cards[here + 1] || cards[here - 1] || null;
  Shots.removeBlock(id);
  rerender(near ? `[data-block="${CSS.escape(near.dataset.block)}"] .vz-blk-name` : '[data-action="blk-add"]');
  // Undo, not confirm: the toast carries the way back.
  try {
    StudioUI.toast('Deleted the setup “' + (was.name || 'setup') + '”.', {
      action: 'Undo',
      onAction: () => { Shots.restoreBlock(was, at); rerender(); }
    });
  } catch (err) { /* chrome may not be up */ }
});
delegate(document, 'click', '[data-action="blk-add-mark"]', (e, el) => {
  const id = blockIdOf(el);
  const m = Shots.addMark(id, el.dataset.kind);
  if (!m) return;
  sel = { blockId: id, markId: m.id };
  rerender(`[data-block="${CSS.escape(id)}"] [data-mark="${CSS.escape(m.id)}"]`);
});
delegate(document, 'change', '[data-block-field]', (e, el) => {
  const id = blockIdOf(el);
  const b = Shots.updateBlock(id, { [el.dataset.blockField]: el.value });
  /* The floor width changes what the map prints (the distances), so the
     map and the hint under the field are redrawn IN PLACE: a full
     re-render on `change` would destroy the element Tab is moving to. */
  if (!b || el.dataset.blockField !== 'widthM') return;
  const card = el.closest('.vz-blk');
  const map = card && card.querySelector('.vz-map');
  if (map) map.replaceWith(drawBlock(b, { editable: true }));
  const hint = card && card.querySelector('.vz-blk-width .k-field-hint');
  if (hint) hint.textContent = blockScale(b) ? WIDTH_SET : WIDTH_UNSET;
});
delegate(document, 'change', '[data-mark-field]', (e, el) => {
  Shots.updateMark(sel.blockId, sel.markId, { [el.dataset.markField]: el.value });
  /* The label is drawn on the map and named on the selected group.
     Patched in place: a full re-render on `change` destroys the element
     Tab is moving to. */
  const b = Shots.listBlocks().find((x) => x.id === sel.blockId);
  const card = el.closest('.vz-blk');
  const map = card && card.querySelector('.vz-map');
  if (b && map) map.replaceWith(drawBlock(b, { editable: true }));
  const grp = card && card.querySelector('.vz-blk-sel');
  const m = b && b.marks.find((x) => x.id === sel.markId);
  if (grp && m) {
    const kindEl = grp.querySelector('.k-eyebrow-muted');
    grp.setAttribute('aria-label', 'Selected: ' + (m.label || (kindEl ? kindEl.textContent : m.kind)));
  }
});
delegate(document, 'click', '[data-action="mk-turn"]', (e, el) => {
  const m = Shots.listBlocks().find((b) => b.id === sel.blockId)?.marks.find((x) => x.id === sel.markId);
  if (m) Shots.updateMark(sel.blockId, sel.markId, { rot: m.rot + Number(el.dataset.by) });
  rerender(`[data-block="${CSS.escape(sel.blockId)}"] [data-mark="${CSS.escape(sel.markId)}"]`);
});
delegate(document, 'click', '[data-action="mk-move-add"]', () => {
  const m = Shots.listBlocks().find((b) => b.id === sel.blockId)?.marks.find((x) => x.id === sel.markId);
  if (!m) return;
  const to = clampPoint(m.x + 14, m.y - 10);
  Shots.updateMark(sel.blockId, sel.markId, { toX: to.x, toY: to.y });
  rerender(`[data-block="${CSS.escape(sel.blockId)}"] [data-handle="${CSS.escape(sel.markId)}"]`);
});
delegate(document, 'click', '[data-action="mk-move-clear"]', () => {
  Shots.updateMark(sel.blockId, sel.markId, { toX: null, toY: null });
  rerender(`[data-block="${CSS.escape(sel.blockId)}"] [data-mark="${CSS.escape(sel.markId)}"]`);
});
/* One way to remove a mark, whether by the Remove mark button or the
   Delete key on the map: the key used to remove it silently, with no
   toast and so no way back. */
function removeMarkWithUndo(b, markId) {
  const was = Shots.listBlocks().find((x) => x.id === b)?.marks.find((x) => x.id === markId);
  Shots.removeMark(b, markId);
  sel = { blockId: b, markId: '' };
  rerender(`[data-block="${CSS.escape(b)}"] .vz-blk-tools .k-btn`);
  if (was) {
    StudioUI.toast('Removed ' + (was.label || was.kind) + '.', {
      action: 'Undo',
      onAction: () => {
        const bl = Shots.listBlocks().find((x) => x.id === b);
        if (bl) { bl.marks.push(was); Shots.saveBlocks(Shots.listBlocks().map((x) => (x.id === b ? bl : x))); }
        rerender();
      }
    });
  }
}
delegate(document, 'click', '[data-action="mk-del"]', () => removeMarkWithUndo(sel.blockId, sel.markId));
delegate(document, 'click', '[data-action="board-print"]', () => { window.print(); });
