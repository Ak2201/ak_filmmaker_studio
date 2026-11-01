/* ============================================================
   BLOCKING — the tool palette, the toolbar and the inspector
   (src/ui/blocking/tools.js)
   ------------------------------------------------------------
   DOM builders only: each takes a block (and what to derive from) and
   returns elements. Every control is a kit button or field carrying a
   data-action / data-*-field; the handlers live in editor.js, bound once
   on `document` (no inline handlers: the CSP forbids them).

   EVERY TOOL IS A LABELLED BUTTON. The palette's modes say which is on
   with aria-pressed, never with colour alone. The two drawers (Set
   pieces, Templates) open IN FLOW below the tool strip rather than as
   a floating menu, because on a phone the strip scrolls sideways and a
   menu inside a sideways-scrolling strip is clipped to nothing — the
   trap that broke the stage menus on phones.
   ============================================================ */
import { h } from '../../lib/dom.js';
import { BLOCK_KINDS, SET_KINDS, blockScale, axisSides, getBlock } from '../../lib/shots.js';
import { button, buttonGroup, field as kitField, badge } from '../kit/index.js';
import { aiPill } from '../ai-pill.js';
import { S, Z_MIN, Z_MAX, viewOf, toolOf, snapOf, selectedIn } from './state.js';
import { TEMPLATES } from './templates.js';
import { canUndo, canRedo, record as recordHistory } from './history.js';
import { beatPrefixes } from './draw.js';

export const KIND_ICON = { actor: 'person', camera: 'videocam', track: 'timeline', light: 'lightbulb', mark: 'place' };
export const SET_ICON = {
  wall: 'horizontal_rule', door: 'door_front', window: 'window', table: 'table_restaurant', chair: 'chair',
  sofa: 'weekend', bed: 'bed', counter: 'countertops', car: 'directions_car', stairs: 'stairs', prop: 'inventory_2'
};
export const SET_LABEL = {
  wall: 'Wall', door: 'Door', window: 'Window', table: 'Table', chair: 'Chair', sofa: 'Sofa', bed: 'Bed',
  counter: 'Counter', car: 'Car', stairs: 'Stairs', prop: 'Prop'
};
const MODES = [
  { id: 'select', label: 'Select', icon: 'near_me', key: 'V', hint: 'Pick, drag, Shift-click or drag a box to select several' },
  { id: 'move', label: 'Move', icon: 'route', key: 'M', hint: 'Drag out from an actor or camera to draw its move; click the floor to add the next beat' },
  { id: 'axis', label: '180° line', icon: 'straighten', key: 'L', hint: 'Drag across the floor to draw the line of action' }
];

/** The one-line hint for the tool in hand, printed under the map. */
export const modeHint = (tool) => (MODES.find((m) => m.id === tool) || MODES[0]).hint + '.';

export const zoomLabel = (z) => (Math.round(z * 10) / 10) + '×';
export const WIDTH_SET = 'Distances are drawn to this scale: camera to each actor, and each track’s length.';
export const WIDTH_UNSET = 'Say how wide this floor is and the map prints camera-to-actor distances and track lengths.';

/* ---- the palette (left) ---------------------------------------- */
export function palette(block) {
  const tool = toolOf(block.id);
  const drawer = S.drawers.get(block.id) || '';
  const tools = h('div.vz-blk-tools', { role: 'group', 'aria-label': 'Tools' });
  for (const m of MODES) {
    tools.append(button({ label: m.label, icon: m.icon, size: 'sm', action: 'blk-tool', class: 'vz-tool vz-tool-mode',
      title: m.hint + ' (' + m.key + ')', attrs: { 'data-tool': m.id, 'aria-pressed': String(tool === m.id) } }));
  }
  tools.append(h('span.vz-tool-sep', { 'aria-hidden': 'true' }));
  for (const k of BLOCK_KINDS) {
    tools.append(button({ label: k.label, icon: KIND_ICON[k.id] || 'add', size: 'sm', action: 'blk-add-mark', class: 'vz-tool',
      title: 'Add ' + k.label.toLowerCase(), attrs: { 'data-kind': k.id } }));
  }
  tools.append(h('span.vz-tool-sep', { 'aria-hidden': 'true' }));
  tools.append(button({ label: 'Set pieces', icon: 'chair', iconAfter: drawer === 'set' ? 'expand_less' : 'expand_more', size: 'sm',
    action: 'blk-drawer', class: 'vz-tool', attrs: { 'data-drawer': 'set', 'aria-expanded': String(drawer === 'set'), 'aria-controls': 'vzdr-' + block.id } }));
  tools.append(button({ label: 'Templates', icon: 'dashboard_customize', iconAfter: drawer === 'templates' ? 'expand_less' : 'expand_more', size: 'sm',
    action: 'blk-drawer', class: 'vz-tool', attrs: { 'data-drawer': 'templates', 'aria-expanded': String(drawer === 'templates'), 'aria-controls': 'vzdr-' + block.id } }));

  const wrap = h('div.vz-blk-palette', {}, [tools]);
  if (drawer) {
    const items = drawer === 'set'
      ? SET_KINDS.map((k) => button({ label: SET_LABEL[k], icon: SET_ICON[k], size: 'sm', action: 'blk-add-set', class: 'vz-drawer-btn', attrs: { 'data-kind': k } }))
      : TEMPLATES.map((t) => button({ label: t.label, icon: t.icon, size: 'sm', action: 'blk-template', class: 'vz-drawer-btn', attrs: { 'data-template': t.id } }));
    wrap.append(h('div.vz-blk-drawer', { id: 'vzdr-' + block.id, role: 'group', 'aria-label': drawer === 'set' ? 'Add a set piece' : 'Add a starting layout' }, [
      h('p.vz-drawer-h', { text: drawer === 'set' ? 'Add a set piece' : 'Add a layout — it adds to the map, Undo takes it off' }),
      h('div.vz-drawer-grid', {}, items)
    ]));
  }
  return wrap;
}

/* ---- the toolbar (above the canvas) ------------------------------ */
export function toolbar(block) {
  const z = viewOf(block.id).z;
  const snap = snapOf(block.id);
  return h('div.vz-blk-bar', { role: 'toolbar', 'aria-label': 'Map' }, [
    buttonGroup([
      button({ label: 'Undo', icon: 'undo', iconOnly: true, size: 'sm', action: 'blk-undo', disabled: !canUndo(block.id), title: 'Undo (Ctrl+Z)' }),
      button({ label: 'Redo', icon: 'redo', iconOnly: true, size: 'sm', action: 'blk-redo', disabled: !canRedo(block.id), title: 'Redo (Ctrl+Shift+Z)' })
    ], { label: 'History' }),
    button({ label: 'Snap', icon: 'grid_4x4', size: 'sm', action: 'blk-snap', class: 'vz-snap', title: 'Snap to the grid (G)',
      attrs: { 'aria-pressed': String(snap) } }),
    h('div.vz-blk-view', { role: 'group', 'aria-label': 'Zoom the map' }, [
      buttonGroup([
        button({ label: 'Zoom out', icon: 'zoom_out', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z <= Z_MIN, attrs: { 'data-by': 'out' } }),
        button({ label: 'Zoom in', icon: 'zoom_in', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z >= Z_MAX, attrs: { 'data-by': 'in' } }),
        button({ label: 'Fit the whole floor', icon: 'fit_screen', iconOnly: true, size: 'sm', action: 'blk-zoom', disabled: z <= Z_MIN, attrs: { 'data-by': 'fit' } })
      ], { label: 'Zoom' }),
      h('span.vz-blk-zoomread.k-mono', { text: zoomLabel(z), 'aria-live': 'polite' })
    ]),
    h('span.vz-blk-bar-gap'),
    buttonGroup([
      button({ label: 'PNG', icon: 'image', size: 'sm', action: 'blk-png', title: 'Save this map as a picture' }),
      button({ label: 'PDF', icon: 'picture_as_pdf', size: 'sm', action: 'blk-pdf', title: 'Print this setup' })
    ], { label: 'Export' }),
    aiPill({ label: 'Enhance', tasks: ['blocking-enhance'], ctx: () => ({ sceneId: block.sceneId, blockId: block.id,
      /* An AI write is a step in the editor's own Undo, like a hand edit:
         without it one Ctrl+Z reverted the AI change AND the edit before. */
      before: (id) => { const cur = getBlock(id); if (cur) recordHistory(cur); },
      after: () => S.rerender() }) })
  ]);
}

/* ---- the key and the line's warning (under the canvas) ------------ */
export function mapKey(block) {
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
  const pieces = (block.set || []).length;
  if (pieces) key.append(h('li.vz-key-set', {}, [h('span.vz-key-swatch', { 'aria-hidden': 'true' }), h('span', { text: 'Set × ' + pieces })]));
  if (block.axis) key.append(h('li.vz-key-axis', {}, [h('span.vz-key-swatch', { 'aria-hidden': 'true' }), h('span', { text: '180° line' })]));
  return key.childNodes.length ? key : null;
}

export function axisWarning(block) {
  const sides = axisSides(block);
  if (!sides.crossed) return null;
  const name = (id) => (block.marks.find((m) => m.id === id) || {}).label || 'a camera';
  const few = sides.left.length <= sides.right.length ? sides.left : sides.right;
  return h('p.vz-axis-msg', { role: 'status' }, [
    badge({ label: 'Crosses the line', tone: 'warn', dot: true }),
    h('span', { text: ' ' + few.map(name).join(', ') + (few.length === 1 ? ' stands' : ' stand')
      + ' on the other side of the 180° line from the other cameras. Cutting between them flips screen direction.' })
  ]);
}

/* ---- the inspector (right) --------------------------------------- */
const titleCase = (s) => String(s || '').toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (m, a, b) => a + b.toUpperCase());

function units(block) {
  const k = blockScale(block);
  return k ? { addon: 'm', to: (u) => Math.round(u * k * 10) / 10, from: (v) => v / k } : { addon: 'units', to: (u) => u, from: (v) => v };
}

function turnGroup() {
  return buttonGroup([
    button({ label: 'Turn 15 degrees left', icon: 'rotate_left', iconOnly: true, size: 'sm', action: 'mk-turn', attrs: { 'data-by': '-15' } }),
    button({ label: 'Turn 15 degrees right', icon: 'rotate_right', iconOnly: true, size: 'sm', action: 'mk-turn', attrs: { 'data-by': '15' } })
  ], { label: 'Turn' });
}

const eyebrow = (a, b) => h('p.k-eyebrow', {}, [h('span', { text: a }), h('span.k-eyebrow-sep', { text: '/', 'aria-hidden': 'true' }), h('span.k-eyebrow-muted', { text: b })]);

function markPanel(block, m, chars, hues) {
  const kind = (BLOCK_KINDS.find((k) => k.id === m.kind) || { label: m.kind }).label;
  const grp = h('div.vz-blk-sel', { role: 'group', 'aria-label': 'Selected: ' + (m.label || kind) }, [
    eyebrow('Selected', kind),
    h('div.k-control.vz-blk-labelbox', {}, [
      h('input.k-input.vz-blk-label', { type: 'text', value: m.label, placeholder: 'Label', 'data-mark-field': 'label', 'aria-label': 'Label of the selected mark' })
    ])
  ]);
  const acts = h('div.vz-blk-selacts');
  if (m.kind !== 'track') {
    acts.append(turnGroup(), h('div.k-control.k-control--mono.vz-blk-rot', {}, [
      h('input.k-input', { type: 'number', min: 0, max: 359, step: 15, value: m.rot, 'data-mark-field': 'rot', 'aria-label': 'Facing, in degrees (0 faces up the map)' }),
      h('span.vz-blk-addon', { text: '°', 'aria-hidden': 'true' })
    ]));
  }
  grp.append(acts);
  if (m.kind === 'actor') {
    const opts = [{ value: '', label: chars.length ? 'No character' : 'No characters yet' }]
      .concat(chars.map((c) => ({ value: c.id, label: titleCase(c.name) || 'Unnamed' })));
    const f = kitField({ kind: 'select', label: 'Character', value: m.charId, options: opts, class: 'vz-blk-char',
      hint: chars.length ? 'Colours the actor and their walk.' : 'Characters come from the Story stage.',
      attrs: { 'data-mark-field': 'charId', 'aria-label': 'Character this actor plays' } });
    if (m.charId && hues.has(m.charId)) f.classList.add('vz-ch-' + hues.get(m.charId));
    grp.append(f);
  }
  if (m.kind !== 'track') {
    if (m.toX == null) {
      grp.append(h('div.vz-blk-selacts', {}, [button({ label: 'Add a move', icon: 'arrow_forward', size: 'sm', action: 'mk-move-add' })]));
    } else {
      const pre = beatPrefixes(block).get(m.id) || 'A';
      const list = h('ol.vz-beats-list', { 'aria-label': 'The walk, beat by beat' }, [
        h('li', {}, [h('span.vz-beat-chip', { text: pre + '1' }), h('span.vz-beat-what', { text: 'Starts here' })]),
        h('li', {}, [h('span.vz-beat-chip', { text: pre + '2' }), h('span.vz-beat-what', { text: 'First stop' })])
      ]);
      (m.path || []).forEach((b, i) => {
        list.append(h('li', {}, [
          h('span.vz-beat-chip', { text: pre + (i + 3) }),
          h('div.k-control.vz-beat-input', {}, [h('input.k-input', { type: 'text', value: b.beat, placeholder: 'What happens here', 'data-beat-field': String(i), 'aria-label': 'Beat ' + pre + (i + 3) })]),
          button({ label: 'Remove beat ' + pre + (i + 3), icon: 'close', iconOnly: true, size: 'sm', action: 'mk-beat-del', attrs: { 'data-i': String(i) } })
        ]));
      });
      grp.append(h('div.vz-blk-walk', {}, [
        h('p.vz-blk-sub', { text: 'Walk' }),
        list,
        h('label.vz-blk-check', {}, [
          h('input', { type: 'checkbox', 'data-mark-field': 'curve', checked: m.curve ? true : null }),
          h('span', { text: 'Curve the walk' })
        ]),
        h('p.vz-blk-hint', { text: 'With Move on, click the floor to add the next beat. Drag a beat to move it.' }),
        h('div.vz-blk-selacts', {}, [button({ label: 'Clear the move', icon: 'close', size: 'sm', action: 'mk-move-clear' })])
      ]));
    }
  }
  grp.append(h('div.vz-blk-selacts', {}, [
    button({ label: 'Duplicate', icon: 'content_copy', size: 'sm', action: 'blk-dup', title: 'Duplicate (Ctrl+D)' }),
    button({ label: 'Remove mark', icon: 'delete', size: 'sm', variant: 'danger', action: 'mk-del' })
  ]));
  return grp;
}

function piecePanel(block, p) {
  const u = units(block);
  const size = (key, label, max) => h('div.vz-blk-size', {}, [
    h('label.k-field-label', { for: 'vzsz-' + key + '-' + p.id, text: label }),
    h('div.k-control.k-control--mono', {}, [
      h('input.k-input', { id: 'vzsz-' + key + '-' + p.id, type: 'number', min: 0.1, step: 0.5, max, value: u.to(p[key]), 'data-piece-field': key }),
      h('span.vz-blk-addon', { text: u.addon, 'aria-hidden': 'true' })
    ])
  ]);
  return h('div.vz-blk-sel', { role: 'group', 'aria-label': 'Selected: ' + (p.label || SET_LABEL[p.kind]) }, [
    eyebrow('Selected', SET_LABEL[p.kind] || 'Set piece'),
    h('div.k-control.vz-blk-labelbox', {}, [
      h('input.k-input.vz-blk-label', { type: 'text', value: p.label, placeholder: 'Label (optional)', 'data-piece-field': 'label', 'aria-label': 'Label of the selected set piece' })
    ]),
    h('div.vz-blk-selacts', {}, [
      turnGroup(),
      h('div.k-control.k-control--mono.vz-blk-rot', {}, [
        h('input.k-input', { type: 'number', min: 0, max: 359, step: 15, value: p.rot, 'data-piece-field': 'rot', 'aria-label': 'Turn, in degrees' }),
        h('span.vz-blk-addon', { text: '°', 'aria-hidden': 'true' })
      ])
    ]),
    h('div.vz-blk-sizes', {}, [size('w', 'Width', 100), size('h', 'Depth', 70)]),
    h('div.vz-blk-selacts', {}, [
      button({ label: 'Duplicate', icon: 'content_copy', size: 'sm', action: 'blk-dup', title: 'Duplicate (Ctrl+D)' }),
      button({ label: 'Remove piece', icon: 'delete', size: 'sm', variant: 'danger', action: 'mk-del' })
    ])
  ]);
}

export function inspector(block, { chars = [], hues = new Map() } = {}) {
  const side = h('div.vz-blk-side');
  const ids = selectedIn(block.id);
  const primary = S.sel.blockId === block.id ? S.sel.primary : '';
  const m = block.marks.find((x) => x.id === primary);
  const p = !m && (block.set || []).find((x) => x.id === primary);
  if (ids.size > 1) {
    side.append(h('div.vz-blk-sel', { role: 'group', 'aria-label': ids.size + ' selected' }, [
      eyebrow('Selected', ids.size + ' items'),
      h('p.vz-blk-hint', { text: 'The arrow keys and a drag move them together.' }),
      h('div.vz-blk-selacts', {}, [
        button({ label: 'Duplicate', icon: 'content_copy', size: 'sm', action: 'blk-dup', title: 'Duplicate (Ctrl+D)' }),
        button({ label: 'Remove ' + ids.size, icon: 'delete', size: 'sm', variant: 'danger', action: 'mk-del' })
      ])
    ]));
  } else if (m) side.append(markPanel(block, m, chars, hues));
  else if (p) side.append(piecePanel(block, p));
  else if (block.marks.length || (block.set || []).length) {
    side.append(h('p.vz-blk-hint', { text: 'Pick a mark or a set piece to name it, turn it or give it a move.' }));
  } else {
    side.append(h('p.vz-blk-hint', { text: 'Start from a template, or add actors and a camera from the tools.' }));
  }

  const setup = h('div.vz-blk-setup', { role: 'group', 'aria-label': 'This setup' });
  setup.append(kitField({
    kind: 'mono', label: 'Floor width', addon: 'm', value: block.widthM, placeholder: 'e.g. 12',
    class: 'vz-blk-width',
    hint: blockScale(block) ? WIDTH_SET : WIDTH_UNSET,
    attrs: { 'data-block-field': 'widthM', inputmode: 'decimal', 'aria-label': 'Floor width in metres' }
  }));
  setup.append(h('div.vz-blk-axis', {}, block.axis
    ? [h('p.vz-blk-sub', { text: '180° line' }),
      h('p.vz-blk-hint', { text: 'Keep every camera of this setup on one side of it. Drag its ends to move it.' }),
      button({ label: 'Clear the line', icon: 'close', size: 'sm', action: 'blk-axis-clear' })]
    : [h('p.vz-blk-sub', { text: '180° line' }),
      h('p.vz-blk-hint', { text: 'Pick the 180° line tool and drag across the floor between the actors.' })]));
  setup.append(kitField({
    kind: 'textarea', rows: 3, label: 'Crew note', value: block.note,
    placeholder: 'A note for the crew — what the move is, where the light comes from…',
    class: 'vz-blk-notefield',
    attrs: { 'data-block-field': 'note', 'aria-label': 'Note on this setup', class: 'vz-blk-note' }
  }));
  side.append(setup);
  return side;
}
