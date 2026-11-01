/* ============================================================
   BLOCKING — the editor (src/ui/blocking/editor.js)
   ------------------------------------------------------------
   The #blocking section of visualize.html: one card per setup, each a
   tool palette on the left, the map in the middle and an inspector on
   the right (stacked below 1100px; below 720px the palette is a strip
   that scrolls sideways). It reads the shot model (src/lib/shots.js)
   and writes ONLY through it.

   NOTHING HERE IS STORED BUT THE DIAGRAM. The selection, the tool, the
   zoom, snapping, the clipboard and the undo history are memory for
   this visit (state.js, history.js); the idle-write assertion in
   `verify` would catch a view that wrote on load.

   DRAGGING WRITES ONCE. pointermove moves SVG nodes and nothing else;
   pointerup commits one replaceBlock() and redraws. A drag that saved
   on every move would rewrite the whole shots blob sixty times a
   second.

   EVERY EDIT IS ONE COMMIT. commit() snapshots the block for Undo,
   applies the change to a copy, writes it once with replaceBlock()
   (which cleans every mark and piece) and redraws THAT CARD only — so
   the zoom, the selection and the focus of every other setup survive,
   and the learn box above the section is never rebuilt. The one
   exception is a change to the CAMERAS (added, removed, renamed by
   undo): the shot list's camera picker reads them, so the whole page
   is redrawn, as it always was.

   KEYBOARD. A mark or a set piece is a focus stop; the arrow keys move
   it one unit (Shift: five) — every selected item with it — [ and ]
   turn it, Delete removes it (with Undo in the toast). Ctrl/Cmd+Z and
   Ctrl/Cmd+Shift+Z undo and redo, Ctrl/Cmd+D duplicates, C and V copy
   and paste within the page, G toggles snapping. A map you can only
   drag is a map somebody cannot use.

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
   (touch-action: pan-y); zoomed in, the map takes the finger. With a
   mouse, dragging the empty floor draws a selection box instead (at
   fit, or with Shift when zoomed in).

   ONE FLOOR, ONE DIAGRAM PER SHOT (1 Nov 2026). Under the scene picker
   a second picker chooses the view: "Floor plan" (the scene's block with
   no shotId — the set, the 180° line, the width, where people start, and
   any older setup or orphaned shot diagram) or one SHOT, whose own block
   holds that shot's camera and actors and is drawn over the floor's set
   and line, dimmed and not editable. A shot's diagram is never made by
   looking at it (the idle-write check): "Start this shot's diagram" makes
   it. An older setup holding several cameras offers "Split into shots".
   ============================================================ */
import StudioUI from '../chrome.js';
import { h, delegate } from '../../lib/dom.js';
import Shots, { BLOCK_W, BLOCK_H, clampPoint, blockScale } from '../../lib/shots.js';
import { button, field as kitField } from '../kit/index.js';
import { aiPill } from '../ai-pill.js';
import { S, Z_MIN, Z_MAX, SNAP_STEP, viewOf, viewBoxOf, toolOf, snapOf, select, isSelected, selectedIn } from './state.js';
import { drawBlock, svg, walkPoints, CHAR_HUES } from './draw.js';
import { palette, toolbar, inspector, mapKey, axisWarning, modeHint, zoomLabel, WIDTH_SET, WIDTH_UNSET, SET_LABEL } from './tools.js';
import History from './history.js';
import { withTemplate } from './templates.js';
import { exportPNG, exportBlockPDF } from './export.js';

const esc = (s) => CSS.escape(s);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
export const slugOf = (scene) =>
  [scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' · ') || 'Scene';
let lastScenes = [];

/* ---- what the drawing derives from -------------------------------- */
/* The Characters list is read through a DYNAMIC import: characters.js
   drags the script model and the story bible with it, which is more
   first paint than the Visualize page can afford for a colour. Until it
   lands the maps draw with no character colours; when it lands, every
   blocking card on the page is redrawn once (a read, never a write). */
let charList = null;
let charLoad = null;
function characters() {
  if (charList) {
    try { return charList.loadCharacters(); } catch (e) { return []; }
  }
  if (!charLoad) {
    charLoad = import('../../lib/characters.js').then((m) => {
      charList = m;
      let list = [];
      try { list = m.loadCharacters(); } catch (e) { /* nothing to colour */ }
      if (!list.length) return;
      document.querySelectorAll('.vz-blk[data-block]').forEach((card) => {
        const keep = focusSelectorOf(document.activeElement, card.dataset.block);
        redrawCard(card.dataset.block, keep);
      });
      document.querySelectorAll('.vz-sb-map .vz-map').forEach((map) => {
        const b = Shots.getBlock(map.dataset.block);
        if (b) map.replaceWith(drawReadOnly(b));
      });
    }).catch(() => { /* colours are a nicety, never the page */ });
  }
  return [];
}
/** A character's colour is its place in the Characters list, mod the
    number of hues. Derived on every draw; nothing is stored. */
export function huesOf(list) {
  const m = new Map();
  (list || []).forEach((c, i) => m.set(c.id, i % CHAR_HUES));
  return m;
}
function shotsNow() {
  try { return Shots.listShots(); } catch (e) { return []; }
}

/* What a block is drawn over and checked against: a shot's diagram sits
   on its scene's floor, and the floor and every shot diagram share ONE
   180° check across all the scene's cameras (shots.js sceneAxisSides).
   An older extra setup keeps its own line and its own check. */
export function floorCtx(block) {
  const blocks = Shots.blocksOfScene(block.sceneId);
  const floor = Shots.floorOf(block.sceneId, blocks);
  const sceneWide = !!block.shotId || (!!floor && floor.id === block.id);
  return { under: block.shotId ? floor : null, sides: sceneWide ? Shots.sceneAxisSides(block.sceneId, blocks) : null };
}

export function drawEditable(block, ctx = {}) {
  const v = viewOf(block.id);
  const fc = floorCtx(block);
  return drawBlock(block, {
    under: fc.under, sides: fc.sides,
    editable: true,
    viewBox: viewBoxOf(v),
    zoomed: v.z > 1,
    selected: selectedIn(block.id),
    primary: S.sel.blockId === block.id ? S.sel.primary : '',
    linkedCam: S.linkedCam,
    shots: ctx.shots || shotsNow(),
    hues: ctx.hues || huesOf(characters()),
    snap: snapOf(block.id)
  });
}

/** The read-only drawing (the Scene board, the PDF). */
export function drawReadOnly(block, ctx = {}) {
  const fc = floorCtx(block);
  return drawBlock(block, { shots: ctx.shots || shotsNow(), hues: ctx.hues || huesOf(characters()), linkedCam: S.linkedCam, idPrefix: ctx.idPrefix, under: fc.under, sides: fc.sides });
}

/* The camera a focused shot row names. Held as well as painted, so a map
   drawn after the focus (the Blocking tab re-renders when opened) still
   shows it. In memory only; nothing is stored. */
export function highlightCamera(id) {
  S.linkedCam = id || '';
  document.querySelectorAll('.vz-mk-camera[data-mark]').forEach((el) => {
    el.classList.toggle('is-linked', !!S.linkedCam && el.getAttribute('data-mark') === S.linkedCam);
  });
}

/* ---- the view (zoom and pan) ----------------------------------- */
const clampN = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
/** Set a block's view and paint it on every editable map of it, in
    place: no re-render, no write. */
function setView(blockId, next) {
  const z = clampN(next.z, Z_MIN, Z_MAX);
  const vb0 = viewBoxOf({ z, cx: next.cx, cy: next.cy });
  // Keep the CLAMPED centre, so a pan past the edge does not bank
  // distance that the next pan has to unwind first.
  const v = { z, cx: vb0.x + vb0.w / 2, cy: vb0.y + vb0.h / 2 };
  if (z === 1) S.views.delete(blockId); else S.views.set(blockId, v);
  const vb = viewBoxOf(v);
  document.querySelectorAll('.vz-map.is-editable[data-block="' + esc(blockId) + '"]').forEach((el) => {
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
/** After a keyboard move, keep the item on screen. */
function keepInView(blockId, x, y) {
  const v = viewOf(blockId);
  if (v.z === 1) return;
  const vb = viewBoxOf(v);
  const pad = 4;
  if (x < vb.x + pad || x > vb.x + vb.w - pad || y < vb.y + pad || y > vb.y + vb.h - pad) {
    setView(blockId, { z: v.z, cx: x, cy: y });
  }
}

/* ---- the section ------------------------------------------------- */
export function pickScene(scenes) {
  if (!scenes.some((s) => s.id === S.pickedScene)) {
    const withBlock = new Set(Shots.listBlocks().map((b) => b.sceneId));
    S.pickedScene = (scenes.find((s) => withBlock.has(s.id)) || scenes[0] || {}).id || '';
  }
  return scenes.find((s) => s.id === S.pickedScene) || null;
}

/** One shot as the pickers print it: "#4 MS 35mm — Meena at the door". */
export function shotLabel(s, i = 0) {
  const desc = String(s.description || '').trim();
  return '#' + (String(s.number || '').trim() || String(i + 1)) + ' ' + [s.size, s.lens].filter(Boolean).join(' ')
    + (desc ? ' — ' + (desc.length > 48 ? desc.slice(0, 47) + '…' : desc) : '');
}

/** The view picker under the scene picker: the floor plan, then each shot. */
function shotPicker(shots) {
  return kitField({
    kind: 'select', label: 'view', value: S.pickedShot, class: 'vz-blk-shotfield',
    options: [{ value: '', label: 'Floor plan' }, ...shots.map((s, i) => ({ value: s.id, label: shotLabel(s, i) }))],
    attrs: { 'data-blk-shot': '', 'aria-label': 'Floor plan or one shot', class: 'vz-blk-shot' }
  });
}

/** Open the Blocking tab on one shot of one scene (the Shot List's link).
    Memory only; returns the id to land on: the shot diagram's card when
    it has one, else the section. */
export function showShotBlocking(sceneId, shotId) {
  S.pickedScene = sceneId || S.pickedScene;
  S.pickedShot = shotId || '';
  const b = shotId ? Shots.blockOfShot(shotId) : null;
  return b ? 'blk-' + b.id : 'blocking';
}

export function scenePicker(scenes, name) {
  return kitField({
    kind: 'select', label: 'scene', value: S.pickedScene, class: 'vz-blk-scenefield',
    options: scenes.map((s) => ({ value: s.id, label: (s.number ? s.number + ' · ' : '') + slugOf(s) })),
    attrs: { 'data-blk-scene': name, 'aria-label': 'Scene', class: 'vz-blk-scene' }
  });
}

const sceneLabel = (sceneId) => {
  const s = lastScenes.find((x) => x.id === sceneId);
  return s ? (s.number ? 'Scene ' + s.number + ' · ' : '') + slugOf(s) : '';
};

function renderBlockCard(block, ctx = {}) {
  const chars = ctx.chars || characters();
  const hues = ctx.hues || huesOf(chars);
  const shots = ctx.shots || shotsNow();
  const shot = !!block.shotId;
  /* The id is what the Shot List's "Blocking" link lands on. */
  const card = h('article.vz-blk.k-panel', { 'data-block': block.id, id: 'blk-' + block.id });
  const cams = block.marks.filter((m) => m.kind === 'camera').length;
  card.append(h('div.vz-blk-head.k-panel-head', {}, [
    h('div.k-control.vz-blk-namebox', {}, [
      h('input.k-input.vz-blk-name', { type: 'text', value: block.name, placeholder: shot ? 'Shot diagram name' : 'Setup name', 'data-block-field': 'name', 'aria-label': shot ? 'Shot diagram name' : 'Setup name' })
    ]),
    /* An older setup that holds several shots' cameras can be split into
       one diagram per shot; the toast's Undo puts it back as it was.
       Only the scene's floor (planSplit refuses any other setup). */
    !shot && cams >= 2 && (Shots.floorOf(block.sceneId) || {}).id === block.id ? button({ label: 'Split into shots', icon: 'call_split', size: 'sm', action: 'blk-split',
      title: 'Make one diagram per shot, each with its own camera; the set and the line stay on the floor plan' }) : null,
    button({ label: shot ? 'Delete diagram' : 'Delete setup', icon: 'delete', size: 'sm', variant: 'danger', action: 'blk-del' })
  ].filter(Boolean)));
  if (Shots.isOrphanBlock(block, shots)) {
    card.append(h('p.vz-blk-hint.vz-blk-orphan', { text: 'This diagram belonged to a shot that has been deleted. It is kept so nothing is lost; delete it if you no longer need it.' }));
  }
  card.append(toolbar(block));

  const body = h('div.vz-blk-body.k-panel-body');
  body.append(palette(block));
  const stage = h('div.vz-blk-stage');
  stage.append(h('div.vz-blk-canvas', {}, [drawEditable(block, { shots, hues })]));
  const warn = axisWarning(block, floorCtx(block).sides);
  if (warn) stage.append(warn);
  const key = mapKey(block);
  if (key) stage.append(key);
  stage.append(h('p.vz-blk-viewhint', {}, [
    h('span.vz-blk-modehint', { text: modeHint(toolOf(block.id)) }),
    ' ',
    h('span', { text: 'Pinch or Ctrl+scroll to zoom, drag the floor to pan. Focus the map for + − 0 and the arrows.' })
  ]));
  body.append(stage);
  body.append(inspector(block, { chars, hues }));
  card.append(body);
  return card;
}

export function renderBlocking(scenes, redraw) {
  S.rerender = redraw;
  lastScenes = scenes;
  const wrap = h('section.vz-blocking', { id: 'blocking', 'data-tab-icon': 'grid_view' });
  wrap.append(
    h('h2.bd-h2', { text: 'Blocking' }),
    h('p.bd-sub', {
      text: 'A top-down map of where the actors stand, where the camera sits and what it faces, '
          + 'and where anyone moves to: the set, each walk beat by beat, and the 180° line. '
          + 'Drag a mark, or focus it and use the arrow keys. '
          + 'It is a few numbers per mark, so it costs nothing to keep.'
    })
  );
  if (!scenes.length) {
    wrap.append(h('p.bd-none', { text: 'Blocking belongs to a scene, so the breakdown comes first. Break the script into scenes and each one can have its maps.' }));
    return wrap;
  }
  const scene = pickScene(scenes);
  const allShots = shotsNow();
  const sceneShots = allShots.filter((s) => s.sceneId === scene.id);
  if (!sceneShots.some((s) => s.id === S.pickedShot)) S.pickedShot = '';
  const blocks = Shots.blocksOfScene(scene.id);
  const shotView = S.pickedShot ? sceneShots.find((s) => s.id === S.pickedShot) : null;
  wrap.append(h('div.vz-blk-pick', {}, [
    scenePicker(scenes, 'blocking'),
    sceneShots.length ? shotPicker(sceneShots) : null,
    shotView ? null : button({ label: 'Add a setup', icon: 'add', variant: 'primary', pill: true, action: 'blk-add', class: 'bd-cta' }),
    aiPill({ label: 'Draft blocking', tasks: ['blocking-draft'], ctx: () => ({ sceneId: S.pickedScene, prompt: '',
      /* The draft lands as a floor and a diagram per shot; open the first
         shot it wrote so the result is on screen, not behind the picker. */
      after: (id) => { const b = id && Shots.getBlock(id); S.pickedShot = b && b.shotId ? b.shotId : ''; S.rerender(); } }) })
  ].filter(Boolean)));
  const chars = characters();
  const ctx = { chars, hues: huesOf(chars), shots: allShots };
  if (shotView) {
    const own = Shots.blockOfShot(shotView.id, blocks);
    if (own) wrap.append(renderBlockCard(own, ctx));
    else {
      wrap.append(h('p.bd-none', { text: 'No diagram for this shot yet. It is drawn over the floor plan: place this shot’s camera and where the actors are during it.' }),
        h('div.vz-blk-pick', {}, [button({ label: 'Start this shot’s diagram', icon: 'add', variant: 'primary', pill: true, action: 'blk-shot-start', class: 'bd-cta' })]));
    }
    return wrap;
  }
  /* The floor view: the floor plan, any older extra setup, and any diagram
     whose shot has since been deleted (kept, never hidden: see removeShot). */
  const floorish = blocks.filter((b) => !b.shotId || Shots.isOrphanBlock(b, allShots));
  if (!floorish.length) {
    wrap.append(h('p.bd-none', { text: 'No maps for this scene yet. Add a setup, then start from a template or place the actors and the camera.' }));
  }
  floorish.forEach((b) => wrap.append(renderBlockCard(b, ctx)));
  return wrap;
}

/* ---- redraws ----------------------------------------------------- */
function cardOf(blockId) {
  return document.querySelector('.vz-blk[data-block="' + esc(blockId) + '"]');
}
function focusIn(selector) {
  if (!selector) return;
  const n = document.querySelector(selector);
  if (n && n.focus) n.focus({ preventScroll: true });
}
/** Redraw ONE setup's card in place, then put the focus back. */
function redrawCard(blockId, focus) {
  const card = cardOf(blockId);
  const block = Shots.getBlock(blockId);
  if (!card || !block) { S.rerender(focus); return; }
  card.replaceWith(renderBlockCard(block));
  focusIn(focus);
}
/** Redraw only the map (and what is printed under it) — for a field
    edit in the inspector, where rebuilding the panel would destroy the
    element Tab is moving to. */
function redrawMap(blockId) {
  const card = cardOf(blockId);
  const block = Shots.getBlock(blockId);
  if (!card || !block) return;
  const map = card.querySelector('.vz-map');
  if (map) map.replaceWith(drawEditable(block));
  const stage = card.querySelector('.vz-blk-stage');
  if (stage) {
    stage.querySelectorAll(':scope > .vz-axis-msg, :scope > .vz-map-key').forEach((n) => n.remove());
    const hint = stage.querySelector('.vz-blk-viewhint');
    const key = mapKey(block), warn = axisWarning(block, floorCtx(block).sides);
    if (key) stage.insertBefore(key, hint);
    if (warn) stage.insertBefore(warn, key || hint);
  }
  refreshHistoryButtons(card, blockId);
}
function refreshHistoryButtons(card, blockId) {
  const u = card.querySelector('[data-action="blk-undo"]'), r = card.querySelector('[data-action="blk-redo"]');
  if (u) u.disabled = !History.canUndo(blockId);
  if (r) r.disabled = !History.canRedo(blockId);
}

const camSig = (b) => (b ? b.marks.filter((m) => m.kind === 'camera').map((m) => m.id + ':' + m.label).join('|') : '');
const itemSel = (blockId, id) => `[data-block="${esc(blockId)}"] [data-mark="${esc(id)}"], [data-block="${esc(blockId)}"] [data-piece="${esc(id)}"]`;

/**
 * One edit: snapshot for Undo, change a copy, write it once, redraw.
 * `how`: 'card' (default), 'map' (fields), or 'none'. A change to the
 * cameras redraws the whole page (the shot list reads them).
 */
function commit(blockId, change, { focus = '', how = 'card' } = {}) {
  const before = Shots.getBlock(blockId);
  if (!before) return null;
  const next = JSON.parse(JSON.stringify(before));
  if (change(next) === false) return null;
  History.record(before);
  const saved = Shots.replaceBlock(next);
  afterWrite(blockId, before, saved, { focus, how });
  return saved;
}
function afterWrite(blockId, before, after, { focus = '', how = 'card' } = {}) {
  /* A field edit ('map') never redraws the page, even for a camera's
     label: that would destroy the element Tab is moving to. The shot
     list picks the new name up on its next render, as it always has. */
  if (how !== 'map' && camSig(before) !== camSig(after)) { S.rerender(focus); return; }
  if (how === 'map') redrawMap(blockId);
  else if (how === 'card') redrawCard(blockId, focus);
}

/* ---- events ------------------------------------------------------ */
const blockIdOf = (el) => { const n = el.closest('[data-block]'); return n ? n.dataset.block : ''; };
const isField = (el) => !!(el && el.closest && el.closest('input, textarea, select, [contenteditable="true"]'));
const snapV = (blockId, v) => (snapOf(blockId) ? Math.round(v / SNAP_STEP) * SNAP_STEP : v);

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
const toMap = (svgEl, e) => { const p = rawMap(svgEl, e); return clampPoint(p.x, p.y); };

const findItem = (block, id) => block.marks.find((m) => m.id === id) || (block.set || []).find((p) => p.id === id) || null;
const isPiece = (block, id) => (block.set || []).some((p) => p.id === id);

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
  } else if (pts.length === 1 && !pts[0].onItem && v.z > 1) {
    gesture = { root, blockId, kind: 'pan', x0: pts[0].x, y0: pts[0].y, cx0: v.cx, cy0: v.cy };
  } else gesture = null;
}

/** A live line on the map (a move being drawn, the axis, a guide). */
function liveLine(root, cls, x1, y1, x2, y2) {
  let n = root.querySelector('.' + cls.split(' ')[0]);
  if (!n) { n = svg('line', { class: cls }); root.append(n); }
  n.setAttribute('x1', x1); n.setAttribute('y1', y1); n.setAttribute('x2', x2); n.setAttribute('y2', y2);
  return n;
}
const clearLive = (root) => root.querySelectorAll('.vz-guide, .vz-live, .vz-marquee').forEach((n) => n.remove());

document.addEventListener('pointerdown', (e) => {
  const root = e.target.closest && e.target.closest('.vz-map.is-editable');
  if (!root) return;
  if (e.button != null && e.button > 0) return;
  const blockId = root.dataset.block;
  const block = Shots.getBlock(blockId);
  if (!block) return;
  const tool = toolOf(blockId);
  const hit = e.target.closest('[data-rot], [data-handle], [data-beat], [data-axis], [data-mark], [data-piece]');
  touches.set(e.pointerId, { root, x: e.clientX, y: e.clientY, onItem: !!hit });
  if ([...touches.values()].filter((t) => t.root === root).length >= 2) {
    /* A second finger turns whatever the first was doing into a pinch —
       the drag is dropped uncommitted, so a pinch cannot nudge a mark. */
    drag = null; clearLive(root);
    startGesture(root);
    e.preventDefault();
    return;
  }
  const p = rawMap(root, e);
  const capture = (node) => { try { node.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } };

  /* The 180-degree line is drawn between the actors, so in that tool a
     press on a mark or a piece starts the line rather than a drag. */
  const lineFromItem = tool === 'axis' && hit && (hit.dataset.mark || hit.dataset.piece);
  if (hit && !lineFromItem) {
    const ds = hit.dataset;
    if (ds.rot) drag = { kind: 'rot', root, blockId, id: ds.rot, node: hit };
    else if (ds.handle) drag = { kind: 'end', root, blockId, id: ds.handle, node: hit };
    else if (ds.beat) drag = { kind: 'beat', root, blockId, id: ds.beat, i: Number(ds.i), node: hit };
    else if (ds.axis) drag = { kind: 'axisEnd', root, blockId, end: ds.axis, node: hit };
    else {
      const id = ds.mark || ds.piece;
      const item = findItem(block, id);
      if (!item) return;
      if (tool === 'move' && ds.mark && item.kind !== 'track') {
        // Drag out from the mark to draw its move (or its next beat).
        select(blockId, [id]);
        const pts = walkPoints(item);
        const from = pts.length ? pts[pts.length - 1] : { x: item.x, y: item.y };
        drag = { kind: 'moveNew', root, blockId, id, from, start: p };
      } else if (e.shiftKey) {
        const ids = new Set(selectedIn(blockId));
        if (ids.has(id)) ids.delete(id); else ids.add(id);
        select(blockId, [...ids]);
        redrawCard(blockId, itemSel(blockId, id));
        e.preventDefault();
        return;
      } else {
        if (!isSelected(blockId, id)) select(blockId, [id]);
        else S.sel.primary = id;
        const ids = [...selectedIn(blockId)];
        drag = { kind: 'items', root, blockId, id, ids, start: p,
          origin: new Map(ids.map((x) => { const it = findItem(block, x); return [x, it ? { x: it.x, y: it.y } : null]; }).filter(([, v]) => v)) };
      }
    }
    capture(hit);
    e.preventDefault();
    return;
  }

  // The empty floor.
  const v = viewOf(blockId);
  if (tool === 'axis') {
    drag = { kind: 'axisNew', root, blockId, start: { x: snapV(blockId, p.x), y: snapV(blockId, p.y) } };
    capture(root); e.preventDefault(); return;
  }
  if (tool === 'move') {
    const prim = block.marks.find((m) => m.id === S.sel.primary && S.sel.blockId === blockId);
    if (prim && prim.kind !== 'track') {
      drag = { kind: 'moveClick', root, blockId, id: prim.id, start: p, sx: e.clientX, sy: e.clientY };
      capture(root); e.preventDefault(); return;
    }
  }
  if (e.pointerType === 'mouse' && (v.z === 1 || e.shiftKey)) {
    drag = { kind: 'marquee', root, blockId, start: p, additive: e.shiftKey, sx: e.clientX, sy: e.clientY };
    capture(root); e.preventDefault(); return;
  }
  /* The floor with a finger: a pan once zoomed in, a pinch with a second
     finger. Pressing it never moves a mark. */
  startGesture(root);
  if (gesture) { capture(root); e.preventDefault(); }
});

/** Snap a dragged point to the grid, then to the nearest other item's
    x or y within reach — drawing the guide it aligned to. */
function align(d, block, cand, skip) {
  let x = snapV(d.blockId, cand.x), y = snapV(d.blockId, cand.y);
  d.root.querySelectorAll('.vz-guide').forEach((n) => n.remove());
  const others = block.marks.concat(block.set || []).filter((it) => !skip.has(it.id));
  const reach = 0.9;
  let gx = null, gy = null;
  for (const it of others) {
    if (gx == null && Math.abs(it.x - cand.x) < reach) { gx = it.x; }
    if (gy == null && Math.abs(it.y - cand.y) < reach) { gy = it.y; }
  }
  if (gx != null) { x = gx; d.root.append(svg('line', { class: 'vz-guide', x1: gx, y1: 0, x2: gx, y2: BLOCK_H })); }
  if (gy != null) { y = gy; d.root.append(svg('line', { class: 'vz-guide', x1: 0, y1: gy, x2: BLOCK_W, y2: gy })); }
  return clampPoint(x, y);
}

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
  const d = drag;
  const p = rawMap(d.root, e);
  if (!d.moved && d.start && Math.hypot(p.x - d.start.x, p.y - d.start.y) < 0.6) return;
  d.moved = true;
  const block = d.block || (d.block = Shots.getBlock(d.blockId));
  if (!block) return;
  if (d.kind === 'items') {
    const o = d.origin.get(d.id) || d.origin.values().next().value;
    if (!o) return;
    const at = align(d, block, { x: o.x + p.x - d.start.x, y: o.y + p.y - d.start.y }, new Set(d.ids));
    d.dx = at.x - o.x; d.dy = at.y - o.y;
    for (const [id, org] of d.origin) {
      const node = d.root.querySelector(`[data-mark="${esc(id)}"], [data-piece="${esc(id)}"]`);
      if (!node) continue;
      const q = clampPoint(org.x + d.dx, org.y + d.dy);
      const it = findItem(block, id);
      node.setAttribute('transform', `translate(${q.x} ${q.y})` + (node.hasAttribute('data-piece') ? ` rotate(${it.rot})` : ''));
    }
    d.root.querySelectorAll('.vz-rot-handle, .vz-rot-arm').forEach((n) => n.remove());
  } else if (d.kind === 'end' || d.kind === 'beat' || d.kind === 'axisEnd') {
    const q = clampPoint(snapV(d.blockId, p.x), snapV(d.blockId, p.y));
    d.at = q;
    d.node.setAttribute('cx', q.x); d.node.setAttribute('cy', q.y);
  } else if (d.kind === 'rot') {
    const it = findItem(block, d.id);
    if (!it) return;
    let a = (Math.atan2(p.x - it.x, -(p.y - it.y)) * 180) / Math.PI;
    if (e.shiftKey || snapOf(d.blockId)) a = Math.round(a / 15) * 15;
    d.rot = ((Math.round(a) % 360) + 360) % 360;
    d.node.setAttribute('cx', p.x); d.node.setAttribute('cy', p.y);
    const node = d.root.querySelector(`[data-mark="${esc(d.id)}"] > g, [data-piece="${esc(d.id)}"]`);
    if (node && node.hasAttribute('data-piece')) node.setAttribute('transform', `translate(${it.x} ${it.y}) rotate(${d.rot})`);
    else if (node) node.setAttribute('transform', `rotate(${d.rot})`);
    const arm = d.root.querySelector('.vz-rot-arm');
    if (arm) { arm.setAttribute('x2', p.x); arm.setAttribute('y2', p.y); }
  } else if (d.kind === 'moveNew') {
    d.at = clampPoint(snapV(d.blockId, p.x), snapV(d.blockId, p.y));
    liveLine(d.root, 'vz-live vz-live-move', d.from.x, d.from.y, d.at.x, d.at.y);
  } else if (d.kind === 'axisNew') {
    d.at = clampPoint(snapV(d.blockId, p.x), snapV(d.blockId, p.y));
    liveLine(d.root, 'vz-live vz-live-axis', d.start.x, d.start.y, d.at.x, d.at.y);
  } else if (d.kind === 'marquee') {
    let r = d.root.querySelector('.vz-marquee');
    if (!r) { r = svg('rect', { class: 'vz-marquee' }); d.root.append(r); }
    const x = Math.min(d.start.x, p.x), y = Math.min(d.start.y, p.y);
    r.setAttribute('x', x); r.setAttribute('y', y);
    r.setAttribute('width', Math.abs(p.x - d.start.x)); r.setAttribute('height', Math.abs(p.y - d.start.y));
    d.at = p;
  } else if (d.kind === 'moveClick') {
    // A drag on the floor in Move mode is not a click; nothing to show.
    d.at = p;
  }
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
  const cancelled = e && e.type === 'pointercancel';
  clearLive(d.root);
  const B = d.blockId;
  if (cancelled) { redrawCard(B, ''); return; }
  switch (d.kind) {
    case 'items':
      if (d.moved && (d.dx || d.dy)) {
        commit(B, (b) => {
          for (const it of b.marks.concat(b.set)) {
            if (!d.origin.has(it.id)) continue;
            const o = d.origin.get(it.id);
            const q = clampPoint(o.x + d.dx, o.y + d.dy);
            it.x = q.x; it.y = q.y;
          }
        }, { focus: itemSel(B, d.id) });
      } else redrawCard(B, itemSel(B, d.id));
      break;
    case 'end':
      if (d.moved && d.at) commit(B, (b) => { const m = b.marks.find((x) => x.id === d.id); if (!m) return false; m.toX = d.at.x; m.toY = d.at.y; }, { focus: `[data-block="${esc(B)}"] [data-handle="${esc(d.id)}"]` });
      else redrawCard(B, `[data-block="${esc(B)}"] [data-handle="${esc(d.id)}"]`);
      break;
    case 'beat':
      if (d.moved && d.at) commit(B, (b) => { const m = b.marks.find((x) => x.id === d.id); if (!m || !m.path[d.i]) return false; m.path[d.i].x = d.at.x; m.path[d.i].y = d.at.y; }, { focus: `[data-block="${esc(B)}"] [data-beat="${esc(d.id)}"][data-i="${d.i}"]` });
      break;
    case 'axisEnd':
      if (d.moved && d.at) commit(B, (b) => { if (!b.axis) return false; b.axis['x' + d.end] = d.at.x; b.axis['y' + d.end] = d.at.y; }, { focus: `[data-block="${esc(B)}"] [data-axis="${d.end}"]` });
      break;
    case 'rot':
      if (d.moved && d.rot != null) commit(B, (b) => { const it = findItem(b, d.id); if (!it) return false; it.rot = d.rot; }, { focus: itemSel(B, d.id) });
      else redrawCard(B, itemSel(B, d.id));
      break;
    case 'moveNew':
      if (d.moved && d.at) addBeat(B, d.id, d.at);
      else redrawCard(B, itemSel(B, d.id));
      break;
    case 'moveClick':
      if (!d.moved) addBeat(B, d.id, clampPoint(snapV(B, d.start.x), snapV(B, d.start.y)));
      break;
    case 'axisNew':
      if (d.moved && d.at) {
        commit(B, (b) => { b.axis = { x1: d.start.x, y1: d.start.y, x2: d.at.x, y2: d.at.y }; }, { focus: `[data-block="${esc(B)}"] [data-axis="2"]` });
      }
      break;
    case 'marquee': {
      const block = Shots.getBlock(B);
      if (!block) break;
      if (!d.moved || !d.at) {
        // A plain click on the floor lets go of the selection.
        if (S.sel.blockId === B && S.sel.ids.size) { select(B, []); redrawCard(B, `.vz-map[data-block="${esc(B)}"]`); }
        break;
      }
      const x1 = Math.min(d.start.x, d.at.x), x2 = Math.max(d.start.x, d.at.x);
      const y1 = Math.min(d.start.y, d.at.y), y2 = Math.max(d.start.y, d.at.y);
      const inside = block.marks.concat(block.set).filter((it) => it.x >= x1 && it.x <= x2 && it.y >= y1 && it.y <= y2).map((it) => it.id);
      const ids = d.additive ? [...selectedIn(B), ...inside] : inside;
      select(B, [...new Set(ids)]);
      redrawCard(B, ids.length ? itemSel(B, ids[ids.length - 1]) : `.vz-map[data-block="${esc(B)}"]`);
      break;
    }
    default:
  }
};
document.addEventListener('pointerup', finish);
document.addEventListener('pointercancel', finish);

/** The next stop of a mark's walk: the first leg if it has none, else a
    beat on its path. */
function addBeat(blockId, markId, at) {
  commit(blockId, (b) => {
    const m = b.marks.find((x) => x.id === markId);
    if (!m || m.kind === 'track') return false;
    if (m.toX == null) { m.toX = at.x; m.toY = at.y; }
    else {
      if ((m.path || []).length >= Shots.PATH_MAX) return false;
      m.path = (m.path || []).concat([{ x: at.x, y: at.y, beat: '' }]);
    }
  }, { focus: itemSel(blockId, markId) });
}

/* Ctrl+wheel zooms about the pointer — a trackpad pinch arrives as
   exactly that. A plain wheel is left to scroll the page. */
document.addEventListener('wheel', (e) => {
  if (!e.ctrlKey) return;
  const root = e.target.closest && e.target.closest('.vz-map.is-editable');
  if (!root) return;
  e.preventDefault();
  zoomAbout(root.dataset.block, Math.exp(-e.deltaY * 0.01), rawMap(root, e));
}, { passive: false });

/* The map's own keys, when the svg itself has focus (not an item on it). */
delegate(document, 'keydown', '.vz-map.is-editable', (e, root) => {
  if (e.target !== root || e.ctrlKey || e.metaKey) return;
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

/* An item's keys: move, turn, remove. */
delegate(document, 'keydown', '.vz-map.is-editable [data-mark], .vz-map.is-editable [data-piece], .vz-map.is-editable [data-handle], .vz-map.is-editable [data-beat], .vz-map.is-editable [data-axis]', (e, el) => {
  if (e.ctrlKey || e.metaKey || e.altKey) return;
  const root = el.closest('.vz-map');
  const B = root.dataset.block;
  const block = Shots.getBlock(B);
  if (!block) return;
  const step = e.shiftKey ? 5 : 1;
  const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
  const ds = el.dataset;
  const arrow = arrows[e.key];

  if (ds.handle || ds.beat || ds.axis) {
    const focus = ds.handle ? `[data-block="${esc(B)}"] [data-handle="${esc(ds.handle)}"]`
      : ds.beat ? `[data-block="${esc(B)}"] [data-beat="${esc(ds.beat)}"][data-i="${ds.i}"]`
        : `[data-block="${esc(B)}"] [data-axis="${ds.axis}"]`;
    if (arrow) {
      let at = null;
      commit(B, (b) => {
        if (ds.handle) { const m = b.marks.find((x) => x.id === ds.handle); if (!m || m.toX == null) return false; m.toX += arrow[0]; m.toY += arrow[1]; at = { x: m.toX, y: m.toY }; }
        else if (ds.beat) { const m = b.marks.find((x) => x.id === ds.beat); const pt = m && m.path[Number(ds.i)]; if (!pt) return false; pt.x += arrow[0]; pt.y += arrow[1]; at = pt; }
        else { if (!b.axis) return false; b.axis['x' + ds.axis] += arrow[0]; b.axis['y' + ds.axis] += arrow[1]; at = { x: b.axis['x' + ds.axis], y: b.axis['y' + ds.axis] }; }
      }, { focus });
      if (at) keepInView(B, at.x, at.y);
    } else if (ds.beat && (e.key === 'Delete' || e.key === 'Backspace')) {
      removeBeat(B, ds.beat, Number(ds.i));
    } else return;
    e.preventDefault();
    return;
  }

  const id = ds.mark || ds.piece;
  const item = findItem(block, id);
  if (!item) return;
  if (!isSelected(B, id)) select(B, [id]);
  else S.sel.primary = id;
  const ids = [...selectedIn(B)];
  if (arrow) {
    commit(B, (b) => {
      for (const it of b.marks.concat(b.set)) if (ids.includes(it.id)) { it.x += arrow[0]; it.y += arrow[1]; }
    }, { focus: itemSel(B, id) });
    keepInView(B, item.x + arrow[0], item.y + arrow[1]);
  } else if ((e.key === '[' || e.key === ']') && !(ds.mark && item.kind === 'track')) {
    commit(B, (b) => { const it = findItem(b, id); if (it) it.rot += e.key === ']' ? 15 : -15; }, { focus: itemSel(B, id) });
  } else if (e.key === 'Delete' || e.key === 'Backspace') {
    removeSelected(B);
  } else return;
  e.preventDefault();
});

/* Card-wide keys: undo, redo, duplicate, copy, paste, select all, snap,
   tools. Not inside a field, where they belong to the field. */
delegate(document, 'keydown', '.vz-blk', (e, card) => {
  const B = card.dataset.block;
  if (isField(e.target)) return;
  const mod = e.ctrlKey || e.metaKey;
  const k = e.key.toLowerCase();
  if (mod && k === 'z') { if (e.shiftKey) doRedo(B); else doUndo(B); }
  else if (mod && k === 'y') doRedo(B);
  else if (mod && k === 'd') duplicateSelected(B);
  else if (mod && k === 'c') { if (!copySelected(B)) return; }
  else if (mod && k === 'v') { if (!paste(B)) return; }
  else if (mod && k === 'a') {
    const b = Shots.getBlock(B);
    if (!b) return;
    select(B, b.marks.concat(b.set).map((it) => it.id));
    redrawCard(B, `.vz-map[data-block="${esc(B)}"]`);
  } else if (!mod && !e.altKey && k === 'g') toggleSnap(B);
  else if (!mod && !e.altKey && (k === 'v' || k === 'm' || k === 'l')) setTool(B, k === 'm' ? 'move' : k === 'l' ? 'axis' : 'select');
  else if (e.key === 'Escape' && (S.sel.ids.size || toolOf(B) !== 'select')) {
    select(B, []); S.tools.delete(B);
    redrawCard(B, `.vz-map[data-block="${esc(B)}"]`);
  } else return;
  e.preventDefault();
});

/* ---- the operations ---------------------------------------------- */
/** A selector that finds the element that has the focus again after its
    card is redrawn, or '' when the focus is not in this card. */
function focusSelectorOf(el, B) {
  if (!el || !el.closest || !el.closest(`.vz-blk[data-block="${esc(B)}"]`)) return '';
  const d = el.dataset || {};
  if (d.mark) return itemSel(B, d.mark);
  if (d.piece) return itemSel(B, d.piece);
  if (d.action) return `[data-block="${esc(B)}"] [data-action="${d.action}"]` + (d.tool ? `[data-tool="${d.tool}"]` : '');
  return `.vz-map[data-block="${esc(B)}"]`;
}
function setTool(B, tool) {
  /* A shot's diagram has no line of its own: the floor's is the line. */
  if (tool === 'axis') { const b = Shots.getBlock(B); if (b && b.shotId) return; }
  if (tool === 'select') S.tools.delete(B); else S.tools.set(B, tool);
  redrawCard(B, focusSelectorOf(document.activeElement, B) || `[data-block="${esc(B)}"] [data-action="blk-tool"][data-tool="${tool}"]`);
}
function toggleSnap(B) {
  S.snap.set(B, !snapOf(B));
  redrawCard(B, focusSelectorOf(document.activeElement, B) || `[data-block="${esc(B)}"] [data-action="blk-snap"]`);
}
function doUndo(B) {
  const cur = Shots.getBlock(B);
  const prev = History.undo(cur);
  if (!prev) return;
  const saved = Shots.replaceBlock(prev);
  pruneSelection(saved);
  afterWrite(B, cur, saved, { focus: `[data-block="${esc(B)}"] [data-action="blk-undo"]` });
  focusFallback(B, 'blk-undo');
}
function doRedo(B) {
  const cur = Shots.getBlock(B);
  const next = History.redo(cur);
  if (!next) return;
  const saved = Shots.replaceBlock(next);
  pruneSelection(saved);
  afterWrite(B, cur, saved, { focus: `[data-block="${esc(B)}"] [data-action="blk-redo"]` });
  focusFallback(B, 'blk-redo');
}
/* A disabled button cannot hold the focus: after the last undo, the
   focus goes to the map rather than falling to <body>. */
function focusFallback(B, action) {
  const btn = document.querySelector(`[data-block="${esc(B)}"] [data-action="${action}"]`);
  if (btn && btn.disabled) focusIn(`.vz-map[data-block="${esc(B)}"]`);
}
function pruneSelection(block) {
  if (!block || S.sel.blockId !== block.id) return;
  const live = new Set(block.marks.concat(block.set).map((it) => it.id));
  select(block.id, [...S.sel.ids].filter((id) => live.has(id)));
}

function duplicateSelected(B) {
  const ids = [...selectedIn(B)];
  if (!ids.length) return;
  const block = Shots.getBlock(B);
  if (!block) return;
  History.record(block);
  const made = Shots.duplicateMarks(B, ids.filter((id) => !isPiece(block, id)));
  /* The set lives on the floor, never copied onto a shot's diagram. */
  const pieces = block.shotId ? [] : (block.set || []).filter((p) => ids.includes(p.id));
  const madePieces = pieces.map((p) => { const { id, ...rest } = p; return Shots.addSetPiece(B, p.kind, { ...rest, x: p.x + 4, y: p.y + 4 }); }).filter(Boolean);
  const newIds = made.map((m) => m.id).concat(madePieces.map((p) => p.id));
  select(B, newIds);
  afterWrite(B, block, Shots.getBlock(B), { focus: newIds.length ? itemSel(B, newIds[newIds.length - 1]) : '' });
}
function copySelected(B) {
  const ids = selectedIn(B);
  const block = Shots.getBlock(B);
  if (!ids.size || !block) return false;
  S.clipboard = {
    from: B, ids: [...ids],
    marks: block.marks.filter((m) => ids.has(m.id)),
    set: block.set.filter((p) => ids.has(p.id))
  };
  StudioUI.toast('Copied ' + plural(ids.size, 'item', 'items') + '.', { type: 'info' });
  return true;
}
function paste(B) {
  const c = S.clipboard;
  if (!c || !(c.marks.length || c.set.length)) return false;
  const block = Shots.getBlock(B);
  if (!block) return false;
  /* The set lives on the floor plan, never copied into a shot's diagram
     (a copy there would drift from the floor's): a set piece on the
     clipboard is skipped on a shot diagram, and the toast says so. */
  const skipSet = !!block.shotId && c.set.length > 0;
  if (skipSet && !c.marks.length) {
    StudioUI.toast('Set pieces live on the floor plan, so they were not pasted into this shot\u2019s diagram.', { type: 'info' });
    return true;
  }
  History.record(block);
  let made = [];
  if (c.from === B && c.marks.every((m) => block.marks.some((x) => x.id === m.id))) {
    made = Shots.duplicateMarks(B, c.marks.map((m) => m.id));
  } else {
    for (const m of c.marks) { const { id, ...rest } = Shots.offsetMark(m, 4, 4); made.push(Shots.addMark(B, m.kind, rest)); }
  }
  const pieces = skipSet ? [] : c.set.map((p) => { const { id, ...rest } = p; return Shots.addSetPiece(B, p.kind, { ...rest, x: p.x + 4, y: p.y + 4 }); });
  const newIds = made.concat(pieces).filter(Boolean).map((x) => x.id);
  select(B, newIds);
  afterWrite(B, block, Shots.getBlock(B), { focus: newIds.length ? itemSel(B, newIds[newIds.length - 1]) : '' });
  if (skipSet) StudioUI.toast('Pasted the marks. Set pieces live on the floor plan, so they were left out of this shot\u2019s diagram.', { type: 'info' });
  return true;
}

/* One way to remove, whether by the Remove button or the Delete key:
   the key used to remove a mark silently, with no toast and so no way
   back. The toast's Undo puts back exactly what this removed, into the
   map as it is THEN — never an older snapshot over later edits. */
function removeSelected(B) {
  const block = Shots.getBlock(B);
  if (!block) return;
  const ids = selectedIn(B);
  const marks = block.marks.filter((m) => ids.has(m.id));
  const set = block.set.filter((p) => ids.has(p.id));
  if (!marks.length && !set.length) return;
  select(B, []);
  commit(B, (b) => {
    b.marks = b.marks.filter((m) => !ids.has(m.id));
    b.set = b.set.filter((p) => !ids.has(p.id));
  }, { focus: `[data-block="${esc(B)}"] .vz-blk-tools .k-btn` });
  const one = marks.length + set.length === 1;
  const what = one ? (marks[0] ? (marks[0].label || marks[0].kind) : (set[0].label || SET_LABEL[set[0].kind] || 'the piece').toLowerCase())
    : plural(marks.length + set.length, 'item', 'items');
  StudioUI.toast('Removed ' + what + '.', {
    action: 'Undo',
    onAction: () => {
      commit(B, (b) => {
        const haveM = new Set(b.marks.map((m) => m.id)), haveP = new Set(b.set.map((p) => p.id));
        b.marks.push(...marks.filter((m) => !haveM.has(m.id)));
        b.set.push(...set.filter((p) => !haveP.has(p.id)));
      }, { focus: (marks[0] || set[0]) ? itemSel(B, (marks[0] || set[0]).id) : '' });
    }
  });
}
function removeBeat(B, markId, i) {
  commit(B, (b) => {
    const m = b.marks.find((x) => x.id === markId);
    if (!m || !m.path[i]) return false;
    m.path.splice(i, 1);
  }, { focus: itemSel(B, markId) });
}

/* ---- clicks ------------------------------------------------------ */
delegate(document, 'change', '[data-blk-scene]', (e, el) => { S.pickedScene = el.value; S.pickedShot = ''; S.rerender(); });
delegate(document, 'change', '[data-blk-shot]', (e, el) => { S.pickedShot = el.value; S.rerender('[data-blk-shot]'); });
/* A shot's diagram is made here, on a press — never by opening the view. */
delegate(document, 'click', '[data-action="blk-shot-start"]', () => {
  const b = S.pickedShot && Shots.ensureShotBlock(S.pickedShot);
  if (!b) return;
  select(b.id, []);
  S.snap.set(b.id, true);
  S.rerender(`[data-block="${esc(b.id)}"] [data-action="blk-add-mark"][data-kind="camera"]`);
});
delegate(document, 'click', '[data-action="blk-split"]', (e, el) => {
  const id = blockIdOf(el);
  const snap = Shots.splitBlock(id);
  if (!snap) {
    StudioUI.toast('No shot of this scene names these cameras yet. Link each shot to its camera in the Shot List (or give it the camera’s name as its setup), then split.', { type: 'info' });
    return;
  }
  S.rerender(`[data-block="${esc(id)}"] .vz-blk-name`);
  try {
    StudioUI.toast('Split into ' + plural(snap.matched, 'shot diagram', 'shot diagrams') + '.'
      + (snap.unmatched ? ' ' + plural(snap.unmatched, 'camera matched', 'cameras matched') + ' no shot and stayed on the floor plan.' : ''), {
      action: 'Undo',
      onAction: () => {
        const r = Shots.undoBlocking(snap);
        S.rerender();
        if (r.kept) StudioUI.toast(plural(r.kept, 'diagram has', 'diagrams have') + ' changed since and ' + (r.kept === 1 ? 'was' : 'were') + ' kept.', { type: 'info' });
      }
    });
  } catch (err) { /* chrome may not be up */ }
});
delegate(document, 'click', '[data-action="blk-add"]', () => {
  if (!S.pickedScene) return;
  const b = Shots.addBlock(S.pickedScene);
  select(b.id, []);
  S.snap.set(b.id, true);   // a new setup snaps; see state.js
  S.rerender(`[data-block="${esc(b.id)}"] .vz-blk-name`);
  // The default name is a suggestion: select it so typing replaces it.
  const nameBox = document.querySelector(`[data-block="${esc(b.id)}"] .vz-blk-name`);
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
  S.rerender(near ? `[data-block="${esc(near.dataset.block)}"] .vz-blk-name` : '[data-action="blk-add"]');
  // Undo, not confirm: the toast carries the way back.
  try {
    StudioUI.toast('Deleted the setup “' + (was.name || 'setup') + '”.', {
      action: 'Undo',
      onAction: () => { Shots.restoreBlock(was, at); S.rerender(); }
    });
  } catch (err) { /* chrome may not be up */ }
});
delegate(document, 'click', '[data-action="blk-add-mark"]', (e, el) => {
  const B = blockIdOf(el);
  const before = Shots.getBlock(B);
  if (!before) return;
  History.record(before);
  const m = Shots.addMark(B, el.dataset.kind);
  if (!m) return;
  select(B, [m.id]);
  afterWrite(B, before, Shots.getBlock(B), { focus: itemSel(B, m.id) });
});
delegate(document, 'click', '[data-action="blk-add-set"]', (e, el) => {
  const B = blockIdOf(el);
  const before = Shots.getBlock(B);
  if (!before) return;
  History.record(before);
  const p = Shots.addSetPiece(B, el.dataset.kind);
  if (!p) return;
  select(B, [p.id]);
  redrawCard(B, itemSel(B, p.id));
});
delegate(document, 'click', '[data-action="blk-template"]', (e, el) => {
  const B = blockIdOf(el);
  let added = 0;
  commit(B, (b) => {
    const next = withTemplate(b, el.dataset.template);
    if (!next) return false;
    added = next.marks.length - b.marks.length + next.set.length - b.set.length;
    Object.assign(b, next);
  }, { focus: `[data-block="${esc(B)}"] [data-action="blk-undo"]` });
  S.drawers.delete(B);
  redrawCard(B, `[data-block="${esc(B)}"] [data-action="blk-undo"]`);
  if (added) StudioUI.toast('Added the layout: ' + plural(added, 'item', 'items') + '. Undo takes it off.', { type: 'info' });
});
delegate(document, 'click', '[data-action="blk-tool"]', (e, el) => setTool(blockIdOf(el), el.dataset.tool));
delegate(document, 'click', '[data-action="blk-drawer"]', (e, el) => {
  const B = blockIdOf(el);
  const want = el.dataset.drawer;
  if ((S.drawers.get(B) || '') === want) S.drawers.delete(B); else S.drawers.set(B, want);
  redrawCard(B, `[data-block="${esc(B)}"] [data-action="blk-drawer"][data-drawer="${want}"]`);
});
delegate(document, 'click', '[data-action="blk-snap"]', (e, el) => toggleSnap(blockIdOf(el)));
delegate(document, 'click', '[data-action="blk-undo"]', (e, el) => doUndo(blockIdOf(el)));
delegate(document, 'click', '[data-action="blk-redo"]', (e, el) => doRedo(blockIdOf(el)));
delegate(document, 'click', '[data-action="blk-dup"]', (e, el) => duplicateSelected(blockIdOf(el)));
delegate(document, 'click', '[data-action="blk-axis-clear"]', (e, el) => {
  const B = blockIdOf(el);
  commit(B, (b) => { if (!b.axis) return false; b.axis = null; }, { focus: `.vz-map[data-block="${esc(B)}"]` });
});
delegate(document, 'click', '[data-action="blk-png"]', async (e, el) => {
  const B = blockIdOf(el);
  const block = Shots.getBlock(B);
  const map = cardOf(B) && cardOf(B).querySelector('.vz-map');
  if (!block || !map) return;
  const ok = await exportPNG(map, { name: block.name, scene: sceneLabel(block.sceneId) });
  StudioUI.toast(ok ? 'Saved the map as a PNG.' : 'Could not draw the picture in this browser.', { type: ok ? 'info' : 'error' });
});
delegate(document, 'click', '[data-action="blk-pdf"]', (e, el) => {
  const block = Shots.getBlock(blockIdOf(el));
  if (!block) return;
  exportBlockPDF({ map: drawReadOnly(block, { idPrefix: 'p' }), key: mapKey(block), name: block.name, note: block.note, scene: sceneLabel(block.sceneId) });
});

delegate(document, 'change', '[data-block-field]', (e, el) => {
  const id = blockIdOf(el);
  if (el.dataset.blockField === 'widthM') {
    /* An unusable width is said out loud and NOT stored, so the field and
       the map never disagree about whether a scale exists. */
    const err = Shots.floorWidthError(el.value);
    const hintEl = el.closest('.vz-blk-width') && el.closest('.vz-blk-width').querySelector('.k-field-hint');
    el.toggleAttribute('aria-invalid', !!err);
    if (err) el.setAttribute('aria-invalid', 'true');
    if (hintEl) hintEl.classList.toggle('is-error', !!err);
    if (err) { if (hintEl) hintEl.textContent = err; return; }
  }
  const before = Shots.getBlock(id);
  if (before) History.record(before);
  const b = Shots.updateBlock(id, { [el.dataset.blockField]: el.value });
  /* The floor width changes what the map prints (the distances), so the
     map and the hint under the field are redrawn IN PLACE: a full
     re-render on `change` would destroy the element Tab is moving to. */
  if (!b) return;
  redrawMap(id);
  if (el.dataset.blockField !== 'widthM') return;
  const hint = el.closest('.vz-blk') && el.closest('.vz-blk').querySelector('.vz-blk-width .k-field-hint');
  if (hint) hint.textContent = blockScale(b) ? WIDTH_SET : WIDTH_UNSET;
});

const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());
const DEFAULT_ACTOR = /^Actor \d+$/;

/* The inspector's fields are patched IN PLACE (map only): a card
   redraw on `change` would destroy the element Tab is moving to. */
delegate(document, 'change', '[data-mark-field]', (e, el) => {
  const B = blockIdOf(el);
  const markId = S.sel.blockId === B ? S.sel.primary : '';
  if (!markId) return;
  const f = el.dataset.markField;
  let label = null;
  const saved = commit(B, (b) => {
    const m = b.marks.find((x) => x.id === markId);
    if (!m) return false;
    if (f === 'curve') m.curve = el.checked;
    else if (f === 'rot') m.rot = Number(el.value) || 0;
    else if (f === 'charId') {
      m.charId = el.value;
      // Naming the actor after the character, unless somebody named them.
      const c = el.value && characters().find((x) => x.id === el.value);
      if (c && (!m.label || DEFAULT_ACTOR.test(m.label))) { m.label = titleCase(c.name); label = m.label; }
    } else m[f] = el.value;
  }, { how: 'map' });
  const m = saved && saved.marks.find((x) => x.id === markId);
  if (!m) return;
  const card = cardOf(B);
  if (f === 'rot') el.value = m.rot;
  if (label != null && card) { const lab = card.querySelector('.vz-blk-label'); if (lab) lab.value = label; }
  const grp = card && card.querySelector('.vz-blk-sel');
  if (grp) {
    const kindEl = grp.querySelector('.k-eyebrow-muted');
    grp.setAttribute('aria-label', 'Selected: ' + (m.label || (kindEl ? kindEl.textContent : m.kind)));
  }
  if (f === 'charId' && card) {
    const fld = card.querySelector('.vz-blk-char');
    if (fld) {
      [...fld.classList].filter((c) => /^vz-ch-\d$/.test(c)).forEach((c) => fld.classList.remove(c));
      const hues = huesOf(characters());
      if (m.charId && hues.has(m.charId)) fld.classList.add('vz-ch-' + hues.get(m.charId));
    }
  }
});
delegate(document, 'change', '[data-piece-field]', (e, el) => {
  const B = blockIdOf(el);
  const pieceId = S.sel.blockId === B ? S.sel.primary : '';
  if (!pieceId) return;
  const f = el.dataset.pieceField;
  const before = Shots.getBlock(B);
  const k = before && blockScale(before);
  const saved = commit(B, (b) => {
    const p = b.set.find((x) => x.id === pieceId);
    if (!p) return false;
    if (f === 'w' || f === 'h') { const v = Number(el.value); if (!Number.isFinite(v) || v <= 0) return false; p[f] = k ? v / k : v; }
    else if (f === 'rot') p.rot = Number(el.value) || 0;
    else p[f] = el.value;
  }, { how: 'map' });
  const p = saved && saved.set.find((x) => x.id === pieceId);
  if (!p) return;
  if (f === 'rot') el.value = p.rot;
  if (f === 'w' || f === 'h') el.value = k ? Math.round(p[f] * k * 10) / 10 : p[f];
});
delegate(document, 'change', '[data-beat-field]', (e, el) => {
  const B = blockIdOf(el);
  const markId = S.sel.blockId === B ? S.sel.primary : '';
  const i = Number(el.dataset.beatField);
  commit(B, (b) => {
    const m = b.marks.find((x) => x.id === markId);
    if (!m || !m.path[i]) return false;
    m.path[i].beat = el.value;
  }, { how: 'map' });
});
delegate(document, 'click', '[data-action="mk-beat-del"]', (e, el) => {
  const B = blockIdOf(el);
  if (S.sel.blockId === B && S.sel.primary) removeBeat(B, S.sel.primary, Number(el.dataset.i));
});
delegate(document, 'click', '[data-action="mk-turn"]', (e, el) => {
  const B = blockIdOf(el) || S.sel.blockId;
  const id = S.sel.primary;
  commit(B, (b) => { const it = findItem(b, id); if (!it) return false; it.rot += Number(el.dataset.by); },
    { focus: `[data-block="${esc(B)}"] [data-action="mk-turn"][data-by="${el.dataset.by}"]` });
});
delegate(document, 'click', '[data-action="mk-move-add"]', (e, el) => {
  const B = blockIdOf(el) || S.sel.blockId;
  const id = S.sel.primary;
  commit(B, (b) => {
    const m = b.marks.find((x) => x.id === id);
    if (!m) return false;
    const to = clampPoint(m.x + 14, m.y - 10);
    m.toX = to.x; m.toY = to.y;
  }, { focus: `[data-block="${esc(B)}"] [data-handle="${esc(id)}"]` });
});
delegate(document, 'click', '[data-action="mk-move-clear"]', (e, el) => {
  const B = blockIdOf(el) || S.sel.blockId;
  const id = S.sel.primary;
  commit(B, (b) => { const m = b.marks.find((x) => x.id === id); if (!m) return false; m.toX = null; m.toY = null; m.path = []; },
    { focus: itemSel(B, id) });
});
delegate(document, 'click', '[data-action="mk-del"]', (e, el) => removeSelected(blockIdOf(el) || S.sel.blockId));
