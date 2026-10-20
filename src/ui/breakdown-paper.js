/* ============================================================
   THE PAPER BREAKDOWN — breakdown.html#breakdown, "Scene Breakdown"
   ------------------------------------------------------------
   How a script has always been broken down: the scene on a white page
   in screenplay format, every element marked in its category's colour
   (the industry code — cast red, props violet, …), and the scene's
   breakdown sheet beside it, box by box. Select words on the page and
   tag them; click a mark to move or remove it; the dotted marks are
   what the script suggests and one click takes them.

   VIEW ONLY. What is marked and where comes from
   src/lib/breakdown-paper.js, which derives it from the scene's tags
   and the script on every render — nothing about a highlight is
   stored. The one write is the tag itself, through scenes.js, and the
   page re-renders after it (ctx.refresh) so every other tab agrees.

   The sheet carries `data-scene`, so the page's own handlers work on it
   unchanged: `el-remove` (a name's ×) and `[data-scene-field]` (the
   description), with their autosave.

   ALWAYS RENDERS with its id, whatever exists (CLAUDE.md: a nav target
   must not depend on data existing).
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Scenes from '../lib/scenes.js';
import {
  paperScenes, needlesFor, markText, cueTag, cleanSelection, guessCategory,
  taggedAs, sheetData, sheetCategories, categoryOf, headingOf
} from '../lib/breakdown-paper.js';
import { exportPDF, projectTitle } from '../lib/pdf.js';

/* Memory only: which scene is open, whether the marks show. A reload
   opens the first scene, which is what an AD expects of a fresh pass. */
const P = { id: null, marks: true, sugg: true, last: '' };
let CTX = { refresh: () => {}, toast: () => {} };

/* A re-render rebuilds the page under the reader. Keep the bar where it
   was on screen, so stepping to the next scene or tagging a word does
   not throw the page back to the stat strip. */
function refresh() {
  const bar = document.querySelector('#breakdown .bdp-bar');
  const y0 = bar ? bar.getBoundingClientRect().top : null;
  CTX.refresh();
  const after = document.querySelector('#breakdown .bdp-bar');
  if (y0 !== null && after) {
    const dy = after.getBoundingClientRect().top - y0;
    if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' });
  }
}
let PAIRS = [];

/* One key per category, from its name, so a tagger can work without
   looking: C cast, T stunts, B background, E effects (SFX), P props… */
const KEYS = { cast: 'c', stunts: 't', extras: 'b', sfx: 'e', props: 'p', vehicles: 'v', animals: 'a',
  wardrobe: 'w', makeup: 'm', sound: 's', setdressing: 'd', vfx: 'x', special: 'q' };

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

function current() {
  if (!PAIRS.length) return null;
  return PAIRS.find((p) => p.scene.id === P.id) || PAIRS[0];
}

/* ---- the page -------------------------------------------------- */

function markRun(seg) {
  if (!seg.cat) return document.createTextNode(seg.text);
  const cat = categoryOf(seg.cat);
  const sug = seg.kind === 'sug';
  return h('mark.bdp-mark.hue-' + cat.hue + (sug ? '.is-sug' : ''), {
    tabindex: '0',
    role: 'button',
    'data-action': sug ? 'bdp-accept' : 'bdp-mark',
    'data-cat': seg.cat,
    'data-name': seg.name,
    title: sug ? 'Suggested ' + cat.label + ': click to tag' : cat.label + ': click to change or remove',
    'aria-label': (sug ? 'Suggested ' : '') + cat.label + ': ' + seg.text
  }, [seg.text]);
}

function lineOf(el, needles) {
  const type = el.type || 'action';
  const line = h('div.bdp-el.t-' + type, { 'data-type': type });
  const text = String(el.text || '');
  if (type === 'character') {
    const n = cueTag(null, text, needles);
    line.append(n ? markRun({ text, cat: n.cat, name: n.name, kind: n.kind }) : text);
    return line;
  }
  if (!needles.length) { line.textContent = text; return line; }
  for (const seg of markText(text, needles)) line.append(markRun(seg));
  return line;
}

function renderPage(pair, needles) {
  const { scene, slice } = pair;
  const no = String(scene.number || pair.index + 1);
  const page = h('article.bdp-page', { 'aria-label': 'Scene ' + no + ' on the page', 'data-scene-page': scene.id });
  if (!P.marks) page.classList.add('no-marks');
  page.append(h('div.bdp-el.t-scene', {}, [
    h('span.bdp-no.is-l', { text: no, 'aria-hidden': 'true' }),
    h('span.bdp-heading', { text: slice ? slice.heading.toUpperCase() : headingOf(scene) }),
    h('span.bdp-no.is-r', { text: no, 'aria-hidden': 'true' })
  ]));
  if (!slice) {
    page.append(h('p.bdp-noscript', {}, [
      'No script text is joined to this scene, so there is nothing to mark on the page. Tag it on the sheet, or ',
      h('a', { href: 'screenplay.html', text: 'write it in the Screenplay Writer' }),
      '.'
    ]));
    if (scene.synopsis) page.append(h('div.bdp-el.t-action', { text: scene.synopsis }));
    return page;
  }
  const els = slice.elements.filter((e) => String(e.text || '').trim());
  if (!els.length) page.append(h('p.bdp-noscript', { text: 'This scene has a heading and nothing under it yet.' }));
  for (const el of els) page.append(lineOf(el, needles));
  return page;
}

/* ---- the sheet -------------------------------------------------- */

function cell(label, value, cls) {
  return h('div.bdp-cell' + (cls ? '.' + cls : ''), {}, [
    h('span.bdp-cell-k', { text: label }),
    h('span.bdp-cell-v', { text: value || '—' })
  ]);
}

function box(b, sceneId, editable) {
  const wrap = h('section.bdp-box.hue-' + b.hue, { 'data-cat': b.id, 'aria-label': b.label });
  wrap.append(h('header.bdp-box-head', {}, [
    b.mark ? h('span.bdp-box-mark', { text: b.mark, 'aria-hidden': 'true' }) : null,
    h('span.bdp-box-label', { text: b.label }),
    b.names.length ? h('span.bdp-box-n', { text: String(b.names.length) }) : null
  ]));
  const list = h('ul.bdp-box-list');
  for (const name of b.names) {
    list.append(h('li', {}, [
      h('span.bdp-box-name', { text: name }),
      editable ? h('button.bdp-x', {
        type: 'button', 'data-action': 'el-remove', 'data-cat': b.id, 'data-name': name,
        'aria-label': 'Remove ' + name + ' from ' + b.label, title: 'Remove', text: '×'
      }) : null
    ]));
  }
  wrap.append(list);
  if (editable) {
    wrap.append(h('input.bdp-add', {
      type: 'text', 'data-cat': b.id, 'data-scene-id': sceneId, maxlength: '80',
      placeholder: '+ Add', 'aria-label': 'Add to ' + b.label, autocomplete: 'off'
    }));
  }
  return wrap;
}

export function renderSheet(pair, total, opts = {}) {
  const { scene, slice } = pair;
  const d = sheetData(scene, slice, pair.index, total);
  const editable = opts.editable !== false;
  const form = h('div.bdp-form', { 'data-scene': scene.id, 'aria-label': 'Breakdown sheet, scene ' + d.number });
  form.append(h('header.bdp-form-head', {}, [
    h('div', {}, [
      h('div.bdp-form-title', { text: 'Breakdown sheet' }),
      h('div.bdp-form-film', { text: opts.project || projectTitle() })
    ]),
    h('div.bdp-form-sheet', {}, [h('span.bdp-cell-k', { text: 'Sheet' }), h('span', { text: d.sheet })])
  ]));
  form.append(h('div.bdp-cells', {}, [
    cell('Scene', d.number, 'is-scene'),
    cell('Int / Ext', d.intExt),
    cell('Day / Night', d.dayNight),
    cell('Pages', d.pages),
    cell('Script page', d.page)
  ]));
  form.append(h('div.bdp-cells.is-one', {}, [cell('Set / location', d.location)]));
  const desc = h('div.bdp-cell.is-desc', {}, [h('label.bdp-cell-k', { text: 'Description', for: 'bdp-desc-' + scene.id })]);
  if (editable) {
    desc.append(h('textarea.bdp-desc', {
      id: 'bdp-desc-' + scene.id, rows: '2', 'data-scene-field': 'synopsis',
      placeholder: 'One line: what happens in this scene'
    }, [d.synopsis]));
  } else {
    desc.append(h('span.bdp-cell-v', { text: d.synopsis || '—' }));
  }
  form.append(desc);
  const boxes = h('div.bdp-boxes');
  for (const b of d.boxes) {
    if (!editable && !b.names.length) continue;
    boxes.append(box(b, scene.id, editable));
  }
  form.append(boxes);
  return form;
}

/* ---- the bar ---------------------------------------------------- */

function sceneLabel(p) {
  const s = p.scene;
  return (s.number || p.index + 1) + '  ' + [s.intExt, s.location || 'Untitled', s.dayNight].filter(Boolean).join(' · ');
}

function renderBar(pair) {
  const i = pair.index;
  const sel = h('select.bdp-pick', { 'aria-label': 'Scene to break down', 'data-action': 'bdp-pick' });
  for (const p of PAIRS) {
    const o = h('option', { value: p.scene.id, text: sceneLabel(p) });
    if (p === pair) o.selected = true;
    sel.append(o);
  }
  const toggle = (key, label) => h('label.bdp-toggle', {}, [
    h('input', { type: 'checkbox', 'data-action': 'bdp-opt', 'data-opt': key, checked: P[key] ? true : null }),
    h('span', { text: label })
  ]);
  return h('div.bdp-bar', {}, [
    h('div.bdp-nav', {}, [
      h('button.bdp-step', { type: 'button', 'data-action': 'bdp-prev', disabled: i === 0 ? true : null, 'aria-label': 'Previous scene', title: 'Previous scene ( [ )', text: '‹' }),
      sel,
      h('button.bdp-step', { type: 'button', 'data-action': 'bdp-next', disabled: i === PAIRS.length - 1 ? true : null, 'aria-label': 'Next scene', title: 'Next scene ( ] )', text: '›' }),
      h('span.bdp-count', { text: 'Scene ' + (i + 1) + ' of ' + PAIRS.length })
    ]),
    h('div.bdp-opts', {}, [
      toggle('marks', 'Colour marks'),
      toggle('sugg', 'Suggestions'),
      h('button.k-btn.k-btn--secondary.k-btn--sm.bdp-tosheet', { type: 'button', 'data-action': 'bdp-tosheet', text: 'Sheet ↓' }),
      h('button.k-btn.k-btn--secondary.k-btn--sm.bdp-print', { type: 'button', 'data-action': 'bdp-print', text: 'Print sheets' })
    ])
  ]);
}

function renderLegend(pair) {
  const els = pair.scene.elements || {};
  return h('ul.bdp-legend', { 'aria-label': 'Colour code' }, sheetCategories().map((c) => {
    const n = (els[c.id] || []).length;
    return h('li.bdp-leg.hue-' + c.hue + (n ? '.has' : ''), { title: c.label + ' — key ' + KEYS[c.id].toUpperCase() }, [
      h('span.bdp-leg-sw', { 'aria-hidden': 'true' }),
      h('span', { text: c.label }),
      n ? h('span.bdp-leg-n', { text: String(n) }) : null
    ]);
  }));
}

function renderScenesRail(pair) {
  const list = h('ol.bdp-rail', { 'aria-label': 'Scenes' });
  for (const p of PAIRS) {
    const s = p.scene;
    const n = Object.values(s.elements || {}).reduce((a, l) => a + (l || []).length, 0);
    const tod = /NIGHT|DUSK/.test(s.dayNight) ? 'night' : 'day';
    list.append(h('li', {}, [h('button.bdp-rail-item.is-' + (s.intExt === 'EXT' ? 'ext' : 'int') + '.is-' + tod + (p === pair ? '.is-on' : ''), {
      type: 'button', 'data-action': 'bdp-go', 'data-id': s.id, 'aria-current': p === pair ? 'true' : null
    }, [
      h('span.bdp-rail-no', { text: String(s.number || p.index + 1) }),
      h('span.bdp-rail-what', {}, [
        h('span.bdp-rail-loc', { text: s.location || 'Untitled' }),
        h('span.bdp-rail-sub', { text: [s.intExt, s.dayNight].filter(Boolean).join(' · ') + (n ? ' · ' + plural(n, 'tag') : ' · untagged') })
      ])
    ])]));
  }
  return list;
}

/* ---- the section ------------------------------------------------ */

/** The section. `scenes` is listScenes(), `elements` the script's. */
export function renderPaperBreakdown(scenes, elements, ctx = {}) {
  CTX = { ...CTX, ...ctx };
  PAIRS = paperScenes(scenes, elements);
  const wrap = h('section.bdp', { id: 'breakdown', 'data-tab-label': 'Scene Breakdown', 'data-tab-icon': 'ink_highlighter',
    'data-tab-hint': 'The script on the page, marked in the colour code, with each scene’s breakdown sheet.' });
  wrap.append(h('div.bdp-intro', {}, [
    h('h2.bdp-title', { text: 'Scene breakdown' }),
    h('p.bdp-sub', { text: 'Select words on the page to tag them. Each category has its industry colour; the dotted marks are what the script suggests — click one to take it.' })
  ]));
  const pair = current();
  if (!pair) {
    wrap.append(h('div.bdp-empty', {}, [
      h('p', { text: 'No scenes yet. Break the screenplay into scenes first, and every scene opens here on the page, ready to mark.' }),
      h('div.bdp-empty-go', {}, [
        h('a.k-btn.k-btn--primary', { href: '#overview', text: 'Break down the whole script' }),
        h('a.k-btn.k-btn--secondary', { href: 'screenplay.html', text: 'Open the Screenplay Writer' })
      ])
    ]));
    return wrap;
  }
  P.id = pair.scene.id;
  const needles = needlesFor(pair.scene, pair.slice, { suggest: P.sugg });
  wrap.append(renderBar(pair), renderLegend(pair));
  wrap.append(h('div.bdp-grid', {}, [
    renderScenesRail(pair),
    h('div.bdp-paper', {}, [renderPage(pair, needles)]),
    h('aside.bdp-sheet', { 'aria-label': 'Breakdown sheet' }, [renderSheet(pair, PAIRS.length, { project: CTX.project })])
  ]));
  wrap.append(h('div.bdp-tagger', { hidden: true, role: 'dialog', 'aria-label': 'Tag the selection' }));
  wrap.append(h('p.bdp-live.visually-hidden', { 'aria-live': 'polite' }));
  return wrap;
}

/* ---- the tag menu ----------------------------------------------- */

const T = { text: '', mode: '', cat: '', name: '', type: '' };

function tagger() { return document.querySelector('#breakdown .bdp-tagger'); }

function closeTagger(restore) {
  const t = tagger();
  if (t && !t.hidden) {
    t.hidden = true;
    t.replaceChildren();
    if (restore && T.from && document.contains(T.from)) T.from.focus({ preventScroll: true });
  }
  T.mode = ''; T.from = null;
}

function openTagger(rect, opts) {
  const t = tagger();
  const host = document.getElementById('breakdown');
  if (!t || !host) return;
  Object.assign(T, opts);
  const hostR = host.getBoundingClientRect();
  t.replaceChildren();
  const editing = T.mode === 'edit';
  t.append(h('div.bdp-tg-head', {}, [
    h('span.bdp-tg-what', { text: '“' + (editing ? T.name : T.text) + '”' }),
    h('span.bdp-tg-hint', { text: editing ? 'Move to' : 'Tag as' })
  ]));
  const pick = editing ? T.cat : guessCategory(T.text, T.type, P.last);
  const list = h('div.bdp-tg-list', { role: 'menu' });
  for (const c of sheetCategories()) {
    if (editing && c.id === T.cat) continue;
    list.append(h('button.bdp-tg-item.hue-' + c.hue + (c.id === pick ? '.is-pick' : ''), {
      type: 'button', role: 'menuitem', 'data-action': 'bdp-tg', 'data-cat': c.id
    }, [
      h('span.bdp-leg-sw', { 'aria-hidden': 'true' }),
      h('span.bdp-tg-label', { text: c.label }),
      h('kbd', { text: KEYS[c.id].toUpperCase() })
    ]));
  }
  t.append(list);
  if (editing) t.append(h('button.bdp-tg-remove', { type: 'button', 'data-action': 'bdp-untag', text: 'Remove tag' }));
  t.hidden = false;
  /* Under the selection, kept inside the section and the viewport. */
  const w = Math.min(t.offsetWidth || 280, hostR.width);
  let left = rect.left - hostR.left;
  left = Math.max(0, Math.min(left, hostR.width - w));
  let top = rect.bottom - hostR.top + 8;
  const room = window.innerHeight - rect.bottom;
  if (room < (t.offsetHeight || 320) + 16 && rect.top - hostR.top > (t.offsetHeight || 320)) top = rect.top - hostR.top - (t.offsetHeight || 320) - 8;
  t.style.left = left + 'px';
  t.style.top = top + 'px';
  const first = t.querySelector('.is-pick') || t.querySelector('.bdp-tg-item');
  if (first) first.focus({ preventScroll: true });
}

function say(text) {
  const live = document.querySelector('#breakdown .bdp-live');
  if (live) live.textContent = text;
}

function doTag(cat) {
  const pair = current();
  if (!pair) return;
  const id = pair.scene.id;
  const c = categoryOf(cat);
  if (T.mode === 'edit') {
    Scenes.untagElement(id, T.cat, T.name);
    Scenes.tagElement(id, cat, T.name);
    closeTagger();
    P.last = cat;
    refresh();
    CTX.toast('Moved ' + T.name + ' to ' + c.label + '.');
    return;
  }
  const name = cleanSelection(T.text);
  if (!name) { closeTagger(); return; }
  const had = taggedAs(pair.scene, name);
  const added = Scenes.tagMany([{ sceneId: id, category: cat, name }]);
  closeTagger();
  P.last = cat;
  try { window.getSelection().removeAllRanges(); } catch (e) { /* nothing selected */ }
  refresh();
  if (!added.length) { CTX.toast(name + ' is already on this scene’s ' + c.label + '.', { type: 'info' }); return; }
  say('Tagged ' + name + ' as ' + c.label);
  CTX.toast('Tagged ' + name + ' as ' + c.label + (had && had !== cat ? ' (it is also under ' + categoryOf(had).label + ')' : '') + '.', {
    action: 'Undo', onAction: () => { Scenes.untagMany(added); refresh(); }
  });
}

/* A selection inside the page opens the menu. Read on mouseup / keyup
   (Shift+arrows) / touchend, after the browser has settled the range. */
function fromSelection(e) {
  if (e && e.target && e.target.closest && e.target.closest('.bdp-tagger')) return;
  const sel = window.getSelection && window.getSelection();
  if (!sel || sel.isCollapsed || !sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const page = document.querySelector('#breakdown .bdp-page');
  if (!page || !page.contains(range.commonAncestorContainer)) return;
  const text = cleanSelection(sel.toString());
  if (!text) return;
  const lineEl = (range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement).closest('.bdp-el');
  const rect = range.getBoundingClientRect();
  openTagger(rect, { mode: 'new', text, type: lineEl ? lineEl.dataset.type : '', from: null });
}

let wired = false;
/** Wire the section's events once; the section itself is rebuilt by
 *  every render, so everything is delegated from the document. */
export function wirePaperBreakdown() {
  if (wired) return;
  wired = true;
  const go = (id) => {
    P.id = id; closeTagger(); refresh();
    /* A new scene starts at its heading: if the reader had scrolled
       down the last one, bring the top of the page back into view. */
    const grid = document.querySelector('#breakdown .bdp-grid');
    const off = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-offset')) || 0;
    if (grid && grid.getBoundingClientRect().top < off) {
      const bar = document.querySelector('#breakdown .bdp-bar');
      (bar || grid).scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  };
  const step = (d) => {
    const pair = current();
    if (!pair) return;
    const next = PAIRS[pair.index + d];
    if (next) {
      go(next.scene.id);
      const b = document.querySelector('#breakdown [data-action="bdp-' + (d < 0 ? 'prev' : 'next') + '"]');
      if (b && !b.disabled) b.focus({ preventScroll: true });
      else { const s = document.querySelector('#breakdown .bdp-pick'); if (s) s.focus({ preventScroll: true }); }
    }
  };
  delegate(document, 'click', '[data-action="bdp-prev"]', () => step(-1));
  delegate(document, 'click', '[data-action="bdp-next"]', () => step(1));
  delegate(document, 'click', '[data-action="bdp-go"]', (e, el) => {
    go(el.dataset.id);
    const b = document.querySelector('#breakdown .bdp-rail-item.is-on');
    if (b) b.focus({ preventScroll: true });
  });
  delegate(document, 'change', '[data-action="bdp-pick"]', (e, el) => {
    go(el.value);
    const s = document.querySelector('#breakdown .bdp-pick');
    if (s) s.focus({ preventScroll: true });
  });
  delegate(document, 'change', '[data-action="bdp-opt"]', (e, el) => {
    P[el.dataset.opt] = el.checked;
    refresh();
    const again = document.querySelector('#breakdown [data-action="bdp-opt"][data-opt="' + el.dataset.opt + '"]');
    if (again) again.focus({ preventScroll: true });
  });
  delegate(document, 'click', '[data-action="bdp-tg"]', (e, el) => doTag(el.dataset.cat));
  delegate(document, 'click', '[data-action="bdp-untag"]', () => {
    const pair = current();
    if (!pair) return;
    const { cat, name } = T;
    Scenes.untagElement(pair.scene.id, cat, name);
    closeTagger();
    refresh();
    CTX.toast('Removed ' + name + ' from ' + categoryOf(cat).label + '.', {
      action: 'Undo', onAction: () => { Scenes.tagElement(pair.scene.id, cat, name); refresh(); }
    });
  });
  const editMark = (el) => {
    openTagger(el.getBoundingClientRect(), { mode: 'edit', cat: el.dataset.cat, name: el.dataset.name, text: el.textContent, from: el });
  };
  const acceptMark = (el) => {
    T.mode = 'new'; T.text = el.dataset.name;
    doTag(el.dataset.cat);
  };
  delegate(document, 'click', '[data-action="bdp-mark"]', (e, el) => {
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) return;   // a drag that started on a mark is a selection
    editMark(el);
  });
  delegate(document, 'click', '[data-action="bdp-accept"]', (e, el) => {
    const sel = window.getSelection && window.getSelection();
    if (sel && !sel.isCollapsed) return;
    acceptMark(el);
  });
  delegate(document, 'keydown', '.bdp-mark', (e, el) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (el.dataset.action === 'bdp-accept') acceptMark(el); else editMark(el);
  });
  delegate(document, 'keydown', '.bdp-add', (e, el) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const name = cleanSelection(el.value);
    if (!name) return;
    const sceneId = el.dataset.sceneId;
    const cat = el.dataset.cat;
    const added = Scenes.tagMany([{ sceneId, category: cat, name }]);
    P.last = cat;
    refresh();
    const again = document.querySelector('#breakdown .bdp-add[data-cat="' + cat + '"]');
    if (again) again.focus({ preventScroll: true });
    if (!added.length) CTX.toast(name + ' is already on this scene’s ' + categoryOf(cat).label + '.', { type: 'info' });
    else say('Added ' + name + ' to ' + categoryOf(cat).label);
  });
  delegate(document, 'click', '[data-action="bdp-print"]', () => printSheets());
  delegate(document, 'click', '[data-action="bdp-tosheet"]', () => {
    const f = document.querySelector('#breakdown .bdp-form');
    if (f) f.scrollIntoView({ block: 'start', behavior: 'instant' });
    const first = f && f.querySelector('.bdp-desc');
    if (first) first.focus({ preventScroll: true });
  });

  document.addEventListener('mouseup', (e) => setTimeout(() => fromSelection(e), 0));
  document.addEventListener('touchend', (e) => setTimeout(() => fromSelection(e), 250));
  document.addEventListener('keyup', (e) => { if (e.shiftKey && /^Arrow|^Home$|^End$/.test(e.key)) fromSelection(e); });
  document.addEventListener('mousedown', (e) => {
    const t = tagger();
    if (t && !t.hidden && !t.contains(e.target)) closeTagger();
  });
  document.addEventListener('keydown', (e) => {
    const t = tagger();
    if (t && !t.hidden) {
      if (e.key === 'Escape') { e.preventDefault(); closeTagger(true); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const k = e.key.toLowerCase();
      const cat = Object.keys(KEYS).find((c) => KEYS[c] === k);
      if (cat && !(T.mode === 'edit' && cat === T.cat)) { e.preventDefault(); doTag(cat); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const items = [...t.querySelectorAll('button')];
        const at = items.indexOf(document.activeElement);
        const next = items[(at + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        if (next) { e.preventDefault(); next.focus(); }
      }
      return;
    }
    /* [ and ] step through the scenes while the page is the open tab
       and focus is not in a field. */
    if ((e.key === '[' || e.key === ']') && !e.ctrlKey && !e.metaKey && !e.altKey) {
      const sec = document.getElementById('breakdown');
      const a = document.activeElement;
      if (!sec || sec.hidden || (a && a.closest && a.closest('input, textarea, select, [contenteditable]'))) return;
      e.preventDefault();
      step(e.key === '[' ? -1 : 1);
    }
  });
}

/* ---- print: every scene's sheet, one to a page ------------------ */

function printSheets() {
  if (!PAIRS.length) { CTX.toast('No scenes to print yet.', { type: 'info' }); return; }
  let host = null;
  exportPDF({
    scope: 'bdsheets',
    label: 'Breakdown sheets',
    before: () => {
      host = h('div', { id: 'bdp-print' });
      const project = projectTitle();
      for (const p of PAIRS) host.append(renderSheet(p, PAIRS.length, { editable: false, project }));
      document.body.append(host);
    },
    after: () => { if (host) host.remove(); }
  });
}

export default { renderPaperBreakdown, wirePaperBreakdown, renderSheet };
