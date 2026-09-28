/* ============================================================
   BREAKDOWN — scene list, tagging and the element index
   ------------------------------------------------------------
   Three views of ONE scene model (src/lib/scenes.js). Nothing here
   stores a second copy of anything: the element index is derived on
   every render, because two copies drift within a day.

   This page is also where the new visual language starts — generous
   spacing, one clear action per row, colour carrying meaning instead
   of decorating. The old pages put twelve small buttons in a strip and
   made the user read every one.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, {
  INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, formatEighths, totalEighths
} from '../lib/scenes.js';

const app = document.getElementById('app');
const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/* ---- header ------------------------------------------------ */
function renderHeader(scenes) {
  const eighths = totalEighths(scenes);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Breakdown · one scene model, three views' }),
    h('h1.bd-title', { text: 'Scene Breakdown.' }),
    h('p.bd-deck', {
      text: 'Every scene once — INT/EXT, time, location, length. The stripboard, '
          + 'the sides, the shot list and the call sheet all read from this, so it '
          + 'is the only place any of it gets typed.'
    }),
    h('div.bd-stats', {}, [
      stat(String(scenes.length), scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(eighths), eighths === 8 ? 'page' : 'pages'),
      stat(String(Scenes.elementIndex().length), 'elements'),
      stat(String(new Set(scenes.map((s) => s.location).filter(Boolean)).size), 'locations')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state ------------------------------
   StudioBinder's best idea: an empty module explains itself instead of
   showing a blank grid. Anchored in the four films like the glossary. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◍', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with the scenes' }),
    h('p', {
      text: 'A scene is one continuous action, in one place, at one time. '
          + 'When the place or the time changes, the scene changes — that is the '
          + 'whole rule, and it is what makes everything downstream possible.'
    }),
    h('div.bd-how', {}, [
      how('1', 'List them', 'Number, INT or EXT, day or night, where, and one line of what happens.'),
      how('2', 'Measure them', 'Length in eighths of a page. Eight eighths is one page, and one page is roughly one minute.'),
      how('3', 'Tag them', 'Cast, props, wardrobe, vehicles. Tag once here and every report builds itself.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Por Thozhil' }),
      h('span', {
        text: ' opens on an interior, day, a police station — one location, one '
            + 'continuous action. The moment the investigation moves outside, that '
            + 'is a new scene, a new line here, and eventually a different shoot day.'
      })
    ]),
    h('button.btn.primary.bd-cta', { type: 'button', 'data-action': 'scene-add', text: '+  Add the first scene' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- one scene ---------------------------------------------- */
function renderScene(scene, i, total) {
  const card = h('article.bd-scene', { 'data-scene': scene.id });

  card.append(h('div.bd-scene-bar', {}, [
    h('span.bd-scene-no', { text: scene.number || String(i + 1) }),
    field('input.bd-slug', {
      type: 'text', value: scene.location, placeholder: 'Location — where are we?',
      'data-scene-field': 'location', 'aria-label': 'Scene location'
    }),
    select(INT_EXT, scene.intExt, 'intExt', 'Interior or exterior'),
    select(DAY_NIGHT, scene.dayNight, 'dayNight', 'Time of day'),
    h('label.bd-eighths', {}, [
      h('span', { text: 'eighths' }),
      field('input', {
        type: 'number', min: '0', max: '80', step: '1', value: String(scene.eighths),
        'data-scene-field': 'eighths', 'aria-label': 'Length in eighths of a page'
      })
    ]),
    h('span.bd-pages', { text: formatEighths(scene.eighths) }),
    h('div.bd-scene-acts', {}, [
      iconBtn('↑', 'scene-up',   'Move earlier', i === 0),
      iconBtn('↓', 'scene-down', 'Move later',   i === total - 1),
      iconBtn('✕', 'scene-del',  'Delete scene', false, true)
    ])
  ]));

  card.append(field('textarea.bd-synopsis', {
    rows: '2', placeholder: 'What happens in this scene?',
    'data-scene-field': 'synopsis', 'aria-label': 'Scene synopsis'
  }, scene.synopsis));

  const tags = h('div.bd-tags');
  for (const cat of ELEMENT_CATEGORIES) {
    const names = scene.elements[cat.id] || [];
    if (!names.length) continue;
    for (const name of names) {
      const chip = h(`span.bd-chip.hue-${cat.hue}`, { title: cat.label });
      chip.append(
        h('span.bd-chip-cat', { text: cat.label }),
        h('span.bd-chip-name', { text: name }),
        h('button.bd-chip-x', {
          type: 'button', 'data-action': 'el-remove',
          'data-cat': cat.id, 'data-name': name,
          'aria-label': `Remove ${name} from ${cat.label}`, text: '✕'
        })
      );
      tags.append(chip);
    }
  }
  const adder = h('div.bd-add-el');
  const sel = h('select.bd-add-cat', { 'aria-label': 'Element category' });
  ELEMENT_CATEGORIES.forEach((c) => sel.append(h('option', { value: c.id, text: c.label })));
  adder.append(sel, h('input.bd-add-name', {
    type: 'text', placeholder: 'Tag an element — name it, press Enter',
    'data-action-key': 'el-add', 'aria-label': 'Element name'
  }));
  tags.append(adder);
  card.append(tags);
  return card;
}

function field(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}
function select(options, value, fieldName, label) {
  const s = h('select.bd-sel', { 'data-scene-field': fieldName, 'aria-label': label });
  options.forEach((o) => {
    const opt = h('option', { value: o, text: o });
    if (o === value) opt.selected = true;
    s.append(opt);
  });
  return s;
}
function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

/* ---- element index ------------------------------------------ */
function renderElements() {
  const index = Scenes.elementIndex();
  const wrap = h('section.bd-elements', { id: 'elements' });
  wrap.append(h('h2.bd-h2', { text: 'Elements' }),
              h('p.bd-sub', { text: 'Derived from the tags above. Nothing here is typed twice.' }));
  if (!index.length) {
    wrap.append(h('p.bd-none', { text: 'No elements tagged yet. Tag one on any scene and it appears here, with every scene it touches.' }));
    return wrap;
  }
  const grid = h('div.bd-el-grid');
  for (const item of index) {
    const cat = catById[item.category] || { label: item.category, hue: 'feature' };
    grid.append(h(`div.bd-el.hue-${cat.hue}`, {}, [
      h('span.bd-el-cat', { text: cat.label }),
      h('strong.bd-el-name', { text: item.name }),
      h('span.bd-el-scenes', {
        text: item.scenes.length === 1
          ? `scene ${item.scenes[0].number}`
          : `${item.scenes.length} scenes · ${item.scenes.map((s) => s.number).join(', ')}`
      })
    ]));
  }
  wrap.append(grid);
  return wrap;
}

/* ---- render ------------------------------------------------- */
function render() {
  const scenes = Scenes.listScenes();
  const main = h('main', { id: 'main' });
  main.append(renderHeader(scenes));

  if (!scenes.length) {
    main.append(renderEmpty());
  } else {
    const list = h('section.bd-list', { id: 'scenes' });
    scenes.forEach((s, i) => list.append(renderScene(s, i, scenes.length)));
    list.append(h('button.btn.bd-add', { type: 'button', 'data-action': 'scene-add', text: '+  Add scene' }));
    main.append(list, renderElements());
  }

  app.replaceChildren(main);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[breakdown] chrome', e); }
}

/* ---- events — delegated, no inline handlers ----------------- */
const sceneIdOf = (el) => el.closest('[data-scene]')?.dataset.scene;

delegate(document, 'click', '[data-action="scene-add"]', () => {
  Scenes.addScene();
  render();
  const last = document.querySelector('.bd-scene:last-of-type .bd-slug');
  if (last) last.focus();
});
delegate(document, 'click', '[data-action="scene-up"]',   (e, el) => { Scenes.moveScene(sceneIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="scene-down"]', (e, el) => { Scenes.moveScene(sceneIdOf(el),  1); render(); });
delegate(document, 'click', '[data-action="scene-del"]',  (e, el) => {
  const id = sceneIdOf(el);
  const scene = Scenes.listScenes().find((s) => s.id === id);
  const label = scene && (scene.location || scene.synopsis) ? ` "${(scene.location || scene.synopsis).slice(0, 40)}"` : '';
  if (!confirm(`Delete scene${label}? Its tagged elements go with it.`)) return;
  Scenes.removeScene(id);
  render();
});
delegate(document, 'click', '[data-action="el-remove"]', (e, el) => {
  Scenes.untagElement(sceneIdOf(el), el.dataset.cat, el.dataset.name);
  render();
});

// Field edits save on change rather than per keystroke; the scene model
// is small but re-rendering the page on every character would be silly.
delegate(document, 'change', '[data-scene-field]', (e, el) => {
  const id = sceneIdOf(el);
  const key = el.dataset.sceneField;
  const value = key === 'eighths' ? Math.max(0, parseInt(el.value, 10) || 0) : el.value;
  Scenes.updateScene(id, { [key]: value });
  if (key === 'eighths') render();
});
delegate(document, 'keydown', '[data-action-key="el-add"]', (e, el) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const cat = el.previousElementSibling.value;
  if (!el.value.trim()) return;
  Scenes.tagElement(sceneIdOf(el), cat, el.value);
  render();
});

render();
