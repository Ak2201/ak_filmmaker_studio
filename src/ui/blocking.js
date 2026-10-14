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
   ============================================================ */
import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';
import Shots, { BLOCK_W, BLOCK_H, BLOCK_KINDS, clampPoint } from '../lib/shots.js';

const NS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}, kids = []) => {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) el.setAttribute(k, String(v));
  for (const c of kids) if (c) el.append(c);
  return el;
};

let pickedScene = '';          // scene id for both sections
let sel = { blockId: '', markId: '' };
let rerender = () => {};

const slugOf = (scene) =>
  [scene.intExt, scene.location, scene.dayNight].filter(Boolean).join(' · ') || 'Scene';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

function pickScene(scenes) {
  if (!scenes.some((s) => s.id === pickedScene)) {
    const withBlock = new Set(Shots.listBlocks().map((b) => b.sceneId));
    pickedScene = (scenes.find((s) => withBlock.has(s.id)) || scenes[0] || {}).id || '';
  }
  return scenes.find((s) => s.id === pickedScene) || null;
}

function scenePicker(scenes, name) {
  const sel_ = h('select.bd-sel.vz-blk-scene', { 'data-blk-scene': name, 'aria-label': 'Scene' });
  scenes.forEach((s) => {
    const o = h('option', { value: s.id, text: (s.number ? s.number + ' · ' : '') + slugOf(s) });
    if (s.id === pickedScene) o.selected = true;
    sel_.append(o);
  });
  return sel_;
}

/* ---- the map ---------------------------------------------------
   One drawing function for the editor and the read-only board, so the
   two cannot disagree about what a mark looks like. */
function drawMark(m, { editable, selected }) {
  const g = svg('g', {
    class: 'vz-mk vz-mk-' + m.kind + (selected ? ' is-selected' : ''),
    'data-mark': m.id,
    transform: `translate(${m.x} ${m.y})`
  });
  if (editable) {
    g.setAttribute('tabindex', '0');
    g.setAttribute('role', 'button');
    g.setAttribute('aria-label', `${m.label || m.kind}, ${m.kind}. Arrow keys move it, [ and ] turn it.`);
  }
  const body = svg('g', { transform: `rotate(${m.rot})` });
  if (m.kind === 'camera') {
    body.append(svg('polygon', { class: 'vz-mk-shape', points: '-2.6,2.2 2.6,2.2 0,-3.6' }),
      svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: -5, y2: -11 }),
      svg('line', { class: 'vz-mk-fov', x1: 0, y1: -3.6, x2: 5, y2: -11 }));
  } else if (m.kind === 'mark') {
    body.append(svg('path', { class: 'vz-mk-shape', d: 'M-1.8,0 L0,-1.8 L1.8,0 L0,1.8 Z' }));
  } else {
    body.append(svg('circle', { class: 'vz-mk-shape', r: 2.4 }),
      svg('line', { class: 'vz-mk-face', x1: 0, y1: -2.4, x2: 0, y2: -4.4 }));
  }
  g.append(body, svg('text', { class: 'vz-mk-label', y: 6.4, 'text-anchor': 'middle' }));
  g.lastChild.textContent = m.label || '';
  return g;
}

export function drawBlock(block, { editable = false } = {}) {
  const root = svg('svg', {
    class: 'vz-map' + (editable ? ' is-editable' : ''),
    viewBox: `0 0 ${BLOCK_W} ${BLOCK_H}`,
    role: 'img',
    'aria-label': `Overhead map "${block.name || 'setup'}": ${plural(block.marks.length, 'mark', 'marks')}`,
    'data-block': block.id
  });
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
  // Moves first, so every mark draws over its own line.
  for (const m of block.marks) {
    if (m.toX == null) continue;
    root.append(svg('line', {
      class: 'vz-mk-move vz-mk-move-' + m.kind,
      x1: m.x, y1: m.y, x2: m.toX, y2: m.toY, 'marker-end': `url(#vzarrow-${block.id})`
    }));
  }
  for (const m of block.marks) {
    root.append(drawMark(m, { editable, selected: editable && sel.markId === m.id && sel.blockId === block.id }));
  }
  if (editable && sel.blockId === block.id) {
    const m = block.marks.find((x) => x.id === sel.markId);
    if (m && m.toX != null) {
      root.append(svg('circle', { class: 'vz-mk-handle', 'data-handle': m.id, cx: m.toX, cy: m.toY, r: 2.2, tabindex: 0, role: 'button',
        'aria-label': `End of ${m.label || m.kind}'s move. Arrow keys move it.` }));
    }
  }
  return root;
}

/* ---- the blocking section -------------------------------------- */
function renderBlockCard(block) {
  const card = h('article.vz-blk', { 'data-block': block.id });
  card.append(h('div.vz-blk-head', {}, [
    h('input.vz-blk-name', { type: 'text', value: block.name, placeholder: 'Setup name', 'data-block-field': 'name', 'aria-label': 'Setup name' }),
    h('button.btn.danger', { type: 'button', 'data-action': 'blk-del', text: 'Delete setup' })
  ]));
  card.append(h('div.vz-blk-tools', {}, BLOCK_KINDS.map((k) =>
    h('button.btn', { type: 'button', 'data-action': 'blk-add-mark', 'data-kind': k.id, text: '+ ' + k.label }))));
  card.append(drawBlock(block, { editable: true }));

  const m = sel.blockId === block.id ? block.marks.find((x) => x.id === sel.markId) : null;
  if (m) {
    card.append(h('div.vz-blk-sel', {}, [
      h('input.vz-blk-label', { type: 'text', value: m.label, placeholder: 'Label', 'data-mark-field': 'label', 'aria-label': 'Label of the selected mark' }),
      h('button.btn', { type: 'button', 'data-action': 'mk-turn', 'data-by': '-15', 'aria-label': 'Turn 15 degrees left', text: '↺' }),
      h('button.btn', { type: 'button', 'data-action': 'mk-turn', 'data-by': '15', 'aria-label': 'Turn 15 degrees right', text: '↻' }),
      m.toX == null
        ? h('button.btn', { type: 'button', 'data-action': 'mk-move-add', text: 'Add a move' })
        : h('button.btn', { type: 'button', 'data-action': 'mk-move-clear', text: 'Clear the move' }),
      h('button.btn.danger', { type: 'button', 'data-action': 'mk-del', text: 'Remove mark' })
    ]));
  } else if (block.marks.length) {
    card.append(h('p.vz-blk-hint', { text: 'Pick a mark to name it, turn it or give it a move.' }));
  }
  card.append(h('input.vz-blk-note', { type: 'text', value: block.note, placeholder: 'A note for the crew — what the move is, where the light comes from…', 'data-block-field': 'note', 'aria-label': 'Note on this setup' }));
  return card;
}

export function renderBlocking(scenes, redraw) {
  rerender = redraw;
  const wrap = h('section.vz-blocking', { id: 'blocking' });
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
    h('label', {}, [h('span', { text: 'scene ' }), scenePicker(scenes, 'blocking')]),
    h('button.btn.bd-cta', { type: 'button', 'data-action': 'blk-add', text: '+  Add a setup' })
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

export function renderSceneBoard(scenes, shots, frames, scriptElements, pairs, redraw) {
  rerender = redraw;
  const wrap = h('section.vz-sceneboard', { id: 'scene-board' });
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
    h('label', {}, [h('span', { text: 'scene ' }), scenePicker(scenes, 'board')]),
    h('button.btn', { type: 'button', 'data-action': 'board-print', text: 'Print this board' })
  ]));

  const sheet = h('div.vz-sb');
  sheet.append(h('header.vz-sb-head', {}, [
    h('span.vz-scene-no', { text: scene.number || '—' }),
    h('span.vz-scene-slug', { text: slugOf(scene) }),
    h('span.vz-scene-count', { text: plural(Number(scene.eighths) || 0, 'eighth', 'eighths') })
  ]));
  if (scene.synopsis) sheet.append(h('p.vz-sb-syn', { text: scene.synopsis }));
  if (scene.readerNote) sheet.append(h('p.vz-sb-syn', { text: 'Reader note: ' + scene.readerNote }));

  // The script, as the model has it.
  const pair = (pairs || []).find((p) => p.scene.id === scene.id && p.slice);
  const col = h('div.vz-sb-col');
  col.append(h('h3.vz-sb-h', { text: 'Script' }));
  if (pair && pair.slice.elements.length) {
    const lines = h('div.vz-sb-script');
    pair.slice.elements.slice(0, 60).forEach((el) => {
      const t = String(el.text || '').trim();
      if (t) lines.append(h('p.vz-sb-el.vz-sb-' + (EL_LABEL[el.type] || 'action'), { text: t }));
    });
    if (pair.slice.elements.length > 60) lines.append(h('p.vz-sb-more', { text: '…' }));
    col.append(lines);
  } else {
    col.append(h('p.bd-none', { text: 'No script text is matched to this scene.' }));
  }
  sheet.append(col);

  // The shots.
  const mine = shots.filter((s) => s.sceneId === scene.id);
  const shotCol = h('div.vz-sb-col');
  shotCol.append(h('h3.vz-sb-h', { text: 'Shots · ' + mine.length }));
  if (mine.length) {
    const t = h('table.scene-table.vz-sb-table');
    t.append(h('thead', {}, [h('tr', {}, ['#', 'Size', 'Angle', 'Move', 'Lens', 'What we see'].map((x) => h('th', { text: x })))]));
    t.append(h('tbody', {}, mine.map((s, i) => h('tr' + (s.done ? '.is-done' : ''), {}, [
      s.number || String(i + 1), s.size, s.angle, s.movement, s.lens || '—', s.description || ''
    ].map((x) => h('td', { text: x }))))));
    shotCol.append(t);
  } else shotCol.append(h('p.bd-none', { text: 'No shots yet for this scene.' }));
  sheet.append(shotCol);

  // The storyboard frames, in shot order.
  const byShot = Shots.framesByShot();
  const fr = mine.flatMap((s) => (byShot.get(s.id) || []).map((f) => ({ f, s })));
  const frCol = h('div.vz-sb-col');
  frCol.append(h('h3.vz-sb-h', { text: 'Frames · ' + fr.length }));
  if (fr.length) {
    frCol.append(h('ol.vz-sb-frames', {}, fr.map(({ f, s }) =>
      h('li', {}, [h('strong', { text: 'Shot ' + (s.number || '?') + ' ' }), h('span', { text: f.caption || f.ref || 'untitled frame' })]))));
  } else frCol.append(h('p.bd-none', { text: 'No frames drawn for this scene.' }));
  sheet.append(frCol);

  // The maps, read-only.
  const blocks = Shots.blocksOfScene(scene.id);
  const mapCol = h('div.vz-sb-col.vz-sb-maps');
  mapCol.append(h('h3.vz-sb-h', { text: 'Blocking · ' + blocks.length }));
  if (blocks.length) {
    blocks.forEach((b) => mapCol.append(h('figure.vz-sb-map', {}, [
      drawBlock(b), h('figcaption', { text: [b.name, b.note].filter(Boolean).join(' — ') })
    ])));
  } else mapCol.append(h('p.bd-none', { text: 'No maps for this scene. Add one under Blocking.' }));
  sheet.append(mapCol);

  wrap.append(sheet);
  return wrap;
}

/* ---- events ----------------------------------------------------- */
const blockIdOf = (el) => { const n = el.closest('[data-block]'); return n ? n.dataset.block : ''; };

function toMap(svgEl, e) {
  const r = svgEl.getBoundingClientRect();
  return clampPoint(((e.clientX - r.left) / r.width) * BLOCK_W, ((e.clientY - r.top) / r.height) * BLOCK_H);
}

let drag = null;
document.addEventListener('pointerdown', (e) => {
  const handle = e.target.closest && e.target.closest('.vz-map.is-editable [data-handle]');
  const mk = !handle && e.target.closest && e.target.closest('.vz-map.is-editable [data-mark]');
  if (!handle && !mk) return;
  const root = (handle || mk).closest('.vz-map');
  const blockId = root.dataset.block;
  const markId = (handle || mk).dataset.handle || (handle || mk).dataset.mark;
  drag = { root, blockId, markId, node: handle || mk, end: !!handle, moved: false };
  sel = { blockId, markId };
  try { (handle || mk).setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ }
  e.preventDefault();
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  drag.moved = true;
  const p = toMap(drag.root, e);
  drag.at = p;
  if (drag.end) { drag.node.setAttribute('cx', p.x); drag.node.setAttribute('cy', p.y); }
  else drag.node.setAttribute('transform', `translate(${p.x} ${p.y})`);
});
const finish = () => {
  if (!drag) return;
  const d = drag; drag = null;
  if (d.moved && d.at) {
    Shots.updateMark(d.blockId, d.markId, d.end ? { toX: d.at.x, toY: d.at.y } : { x: d.at.x, y: d.at.y });
  }
  rerender(`[data-block="${CSS.escape(d.blockId)}"] [data-mark="${CSS.escape(d.markId)}"]`);
};
document.addEventListener('pointerup', finish);
document.addEventListener('pointercancel', finish);

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
  } else if (!end && (e.key === '[' || e.key === ']')) {
    Shots.updateMark(blockId, markId, { rot: m.rot + (e.key === ']' ? 15 : -15) });
  } else if (!end && (e.key === 'Delete' || e.key === 'Backspace')) {
    Shots.removeMark(blockId, markId);
    sel = { blockId, markId: '' };
    rerender(`[data-block="${CSS.escape(blockId)}"] .vz-blk-tools .btn`);
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
});
delegate(document, 'click', '[data-action="blk-del"]', (e, el) => {
  const id = blockIdOf(el);
  const was = Shots.listBlocks().find((b) => b.id === id);
  if (!was) return;
  Shots.removeBlock(id);
  rerender();
  // Undo, not confirm: the toast carries the way back.
  try {
    StudioUI.toast('Deleted the setup “' + (was.name || 'setup') + '”.', {
      action: 'Undo',
      onAction: () => { Shots.saveBlocks(Shots.listBlocks().concat([was])); rerender(); }
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
  Shots.updateBlock(blockIdOf(el), { [el.dataset.blockField]: el.value });
});
delegate(document, 'change', '[data-mark-field]', (e, el) => {
  Shots.updateMark(sel.blockId, sel.markId, { [el.dataset.markField]: el.value });
  rerender();
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
delegate(document, 'click', '[data-action="mk-del"]', () => {
  const b = sel.blockId;
  const was = Shots.listBlocks().find((x) => x.id === b)?.marks.find((x) => x.id === sel.markId);
  Shots.removeMark(b, sel.markId);
  sel = { blockId: b, markId: '' };
  rerender(`[data-block="${CSS.escape(b)}"] .vz-blk-tools .btn`);
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
});
delegate(document, 'click', '[data-action="board-print"]', () => { window.print(); });
