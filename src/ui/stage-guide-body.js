/* ============================================================
   THE STAGE GUIDE'S HEAVY HALF — draws the steps, reads and
   writes the answers
   ------------------------------------------------------------
   Fetched by src/ui/stage-guide.js when the Guide section nears the
   screen. renderGuide(body, { stage, format, items, fields }) draws
   the stage's cover fields, then each step through renderStep() — the
   function the blueprint pages draw with, so every control carries
   the data-key the blueprint reads back — and wires the answers.

   READING. The blob is read with readAll() and poured into the
   fields the way the blueprint's own loadData() does it: a key the
   blob lacks is an EMPTY field (back to its markup default), a
   checklist <li> is toggled by class only and never gets `.value`
   (it is an ordinal — the trap in CLAUDE.md), a checkbox is ticked
   from the stored boolean.

   WRITING. Only on a person's own input/change/click, debounced
   400 ms, and only the keys they touched, through writeFields() —
   a merge. Nothing on load writes (verify's idle assertion), a
   redraw of the derived views never writes, and this file never
   rebuilds the blob: that is feature.js's and short.js's saveData(),
   and it deletes whatever its page does not render.

   VALUE CONVENTIONS are the blueprint's own (src/ui/blueprint-drawer.js
   BLUEPRINTS): the feature stores `el.value` and a checkbox as a
   boolean, a tick as the `checked` class; the short stores
   `el.value || ''`, a checkbox as a boolean, a tick as `done`.

   ANOTHER TAB. A `storage` event on the blueprint's key, or coming
   back to this tab, re-reads the blob into every field that is not
   being typed in and has no write waiting — the same rule
   feature.js / short.js watchBlobElsewhere() follow, so an answer
   given on the Story page shows on the next page without a reload.
   ============================================================ */
import { h } from '../lib/dom.js';
import { renderStep } from './steps.js';
import StudioUI from './chrome.js';
import { fullStep } from './blueprint-drawer-body.js';
import { ROW_BUILDERS, ROW_PREFIX } from './blueprint-rows.js';
import { readAll, writeFields, blobKey } from '../lib/blueprint-store.js';
import {
  classify, extraRenderers, interludeSection, drawDerived
} from './stage-guide-widgets.js';
import { mountComments, togglePanel, hasNote, paintBadges } from './comments.js';
import '../styles/steps-stages.css';

const SAVE_MS = 400;
const FIELD = 'input[data-key], textarea[data-key], select[data-key]';
const TABLE_IDS = Object.keys(ROW_BUILDERS);
/* feature.js loadData(): max(stored rows, 8) per table. */
const MIN_ROWS = 8;

const SPECS = {
  feature: {
    ns: 'feature', checkedClass: 'checked', page: 'feature.html',
    read: (el) => (el.type === 'checkbox' ? !!el.checked : el.value),
    tick: (v) => v === true || v === 'true'
  },
  short: {
    ns: 'short', checkedClass: 'done', page: 'short.html',
    read: (el) => (el.type === 'checkbox' ? !!el.checked : el.value || ''),
    tick: (v) => !!v
  }
};

/* What a field is when the blob has no key for it: its markup default. */
function resetToDefault(el) {
  if (el.tagName === 'SELECT') {
    const opts = Array.from(el.options);
    const d = opts.findIndex((o) => o.defaultSelected);
    el.selectedIndex = d >= 0 ? d : (opts.length ? 0 : -1);
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    el.checked = el.defaultChecked;
  } else {
    el.value = el.defaultValue;
  }
}

function coverBlock(fields) {
  if (!fields.length) return null;
  return h('div.sg-cover.meta-grid', {}, fields.map((f) => {
    const id = 'sg-cover-' + f.key;
    const control = f.options
      ? h('select', { id, 'data-key': f.key }, [
        h('option', { value: '', text: f.empty || '—' }),
        ...f.options.map((o) => h('option', { text: o }))
      ])
      : h('input', { id, type: 'text', 'data-key': f.key, placeholder: f.placeholder || null });
    return h('div.meta-field', {}, [h('label', { for: id, text: f.label }), control]);
  }));
}

function stepSection(item, ctx, extra) {
  if (item.kind === 'interlude') return interludeSection(item);
  const rec = fullStep(item.ns, item.id);
  if (!rec) return null;
  const step = classify({ ...rec, badge: null }, item.ns);
  const sec = renderStep(step, extra, item.ns);
  sec.querySelectorAll('.st-stage-row, .st-why, .row-actions, .step-badge').forEach((el) => el.remove());
  return sec;
}

/** Four tables: rows from the shared builders, as many as are saved. */
function fillTables(root, blob) {
  for (const id of TABLE_IDS) {
    const body = root.querySelector('[data-sg-id="' + id + '"]');
    if (!body) continue;
    const re = new RegExp('^' + ROW_PREFIX[id] + '_(\\d+)_');
    let count = 0;
    Object.keys(blob).forEach((k) => { const m = k.match(re); if (m) count = Math.max(count, +m[1]); });
    body.replaceChildren();
    for (let i = 1; i <= Math.max(count, MIN_ROWS); i++) body.append(buildRow(id, i));
    const table = body.closest('table');
    if (table && !table.parentElement.classList.contains('sg-table')) {
      const wrap = h('div.sg-table');
      table.replaceWith(wrap);
      wrap.append(table);
      wrap.after(h('div.sg-table-actions', {}, [
        h('button.btn', { type: 'button', 'data-sg': 'add-row', 'data-table': id, text: '+ Add a row' }),
        h('span.sg-note-inline', { text: 'Reorder, duplicate or delete rows in the full blueprint.' })
      ]));
    }
  }
}

function buildRow(id, n) {
  const row = ROW_BUILDERS[id](n);
  row.querySelectorAll('td.row-ctrl').forEach((td) => td.remove());
  return row;
}

export function renderGuide(body, { stage, format, items, fields }) {
  const spec = SPECS[format] || SPECS.feature;
  const extraCtx = {
    queue: (k, v) => queue(k, v),
    refresh: () => refreshDerived(),
    register: (w) => widgets.push(w)
  };
  const widgets = [];
  const extra = extraRenderers(extraCtx, spec.ns);

  const root = h('div.sg-steps');
  const cover = coverBlock(fields || []);
  if (cover) root.append(cover);
  for (const item of items) {
    let sec = null;
    try { sec = stepSection(item, extraCtx, extra); } catch (e) { console.warn('[stage-guide] step failed', item, e); }
    if (sec) root.append(sec);
  }

  /* No inline handlers (the CSP refuses them and verify counts them),
     and links that pointed at the blueprint's own anchors point at it
     instead of at nothing. */
  root.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });
  root.querySelectorAll('a[href^="#"]').forEach((a) => {
    const frag = a.getAttribute('href');
    if (frag.length > 1) a.setAttribute('href', spec.page + frag);
  });

  const blob0 = readAll(spec.ns);

  /* Ids: the page's own must stay unique, and the derived views find
     their elements by the id they had on the blueprint. */
  root.querySelectorAll('[id]').forEach((el) => {
    el.setAttribute('data-sg-id', el.id);
    el.id = 'sg-' + el.id;
  });
  root.querySelectorAll('label[for]').forEach((l) => l.setAttribute('for', 'sg-' + l.getAttribute('for')));
  fillTables(root, blob0);

  body.replaceChildren(root);

  /* The private-note toggles, as feature.js attachCommentButtons() draws
     them: same markup, same fms_note_ store. Feature only (short has none).
     Drawing a button writes nothing. */
  const attachComments = (scope) => {
    scope.querySelectorAll('.ask-label').forEach((label) => {
      if (label.querySelector('.comment-btn')) return;
      const ask = label.closest('.ask, .pp-ask');
      const field = ask && ask.querySelector('[data-key]');
      if (!field) return;
      const key = field.getAttribute('data-key');
      const btn = h('button.comment-btn', {
        type: 'button', title: 'Add a private note (saved on your device)', text: '✎',
        'data-key': 'comment_for_' + key, 'data-action': 'toggleCommentPanel', 'data-note-key': key
      });
      label.appendChild(btn);
      if (hasNote(key)) btn.classList.add('has-note');
    });
  };
  if (format !== 'short') {
    attachComments(root);
    root.addEventListener('click', (e) => {
      const btn = e.target.closest && e.target.closest('.comment-btn[data-note-key]');
      if (!btn || !root.contains(btn)) return;
      const ask = btn.closest('.ask, .pp-ask');
      if (ask) togglePanel(btn.getAttribute('data-note-key'), ask);
    });
    mountComments({
      scope: 'feature',
      notePrefix: 'fms_note_',
      onNoteChange: (key, has) => {
        const b = root.querySelector('.comment-btn[data-note-key="' + CSS.escape(key) + '"]');
        if (b) b.classList.toggle('has-note', has);
      }
    });
    paintBadges();
  }

  /* ---- reading ------------------------------------------------- */
  const getter = (blob) => (k) => {
    const el = root.querySelector('[data-key="' + k + '"]');
    if (el && el.tagName !== 'LI') return el.type === 'checkbox' ? el.checked : el.value;
    return blob[k];
  };

  function load(blob, { skip } = {}) {
    root.querySelectorAll('[data-key]').forEach((el) => {
      if (skip && skip(el)) return;
      const k = el.getAttribute('data-key');
      const has = blob[k] !== undefined;
      if (el.tagName === 'LI') {
        const on = has && !!blob[k];
        el.classList.toggle(spec.checkedClass, on);
        el.setAttribute('aria-checked', on ? 'true' : 'false');
        return;
      }
      if (el.type === 'checkbox') {
        if (has) el.checked = spec.tick(blob[k]); else resetToDefault(el);
        return;
      }
      if (has) el.value = blob[k]; else resetToDefault(el);
    });
  }

  function refreshDerived() {
    drawDerived(root, getter(readAll(spec.ns)));
  }

  /* ---- writing ------------------------------------------------- */
  let pending = {};
  let timer = null;

  function flush() {
    clearTimeout(timer); timer = null;
    const keys = Object.keys(pending);
    if (!keys.length) return;
    const patch = {};
    for (const k of keys) patch[k] = typeof pending[k] === 'function' ? pending[k]() : pending[k];
    pending = {};
    writeFields(spec.ns, patch);
  }

  function queue(key, value) {
    pending[key] = value;
    clearTimeout(timer);
    timer = setTimeout(flush, SAVE_MS);
  }

  const palette = /^palette_c([123])$/;
  function onField(el) {
    const k = el.getAttribute('data-key');
    queue(k, spec.read(el));
    /* feature.js syncTitleAcrossCovers(): fill the other title if empty. */
    const twin = k === 'meta_title' ? 'v1_title' : k === 'v1_title' ? 'meta_title' : null;
    const t = twin && root.querySelector('[data-key="' + twin + '"]');
    if (t && t.value === '' && el.value) { t.value = el.value; queue(twin, el.value); }
    const m = palette.exec(k);
    /* feature.js saves the hex mirrors with the colour; keep them in step. */
    if (m && root.querySelector('[data-key="palette_c' + m[1] + '_hex"]')) queue('palette_c' + m[1] + '_hex', el.value);
  }

  root.addEventListener('input', (e) => {
    const el = e.target.closest && e.target.closest(FIELD);
    if (!el || !root.contains(el) || el.type === 'checkbox') return;
    onField(el);
    refreshDerived();
  });
  root.addEventListener('change', (e) => {
    const el = e.target.closest && e.target.closest(FIELD);
    if (!el || !root.contains(el)) return;
    onField(el);
    refreshDerived();
  });

  const toggle = (li) => {
    const on = !li.classList.contains(spec.checkedClass);
    li.classList.toggle(spec.checkedClass, on);
    li.setAttribute('aria-checked', on ? 'true' : 'false');
    queue(li.getAttribute('data-key'), on);
  };
  root.addEventListener('click', (e) => {
    const li = e.target.closest && e.target.closest('.step-check li[data-key]');
    if (li && root.contains(li)) { toggle(li); return; }
    const add = e.target.closest && e.target.closest('[data-sg="add-row"]');
    if (add && root.contains(add)) {
      const id = add.getAttribute('data-table');
      const tbody = root.querySelector('[data-sg-id="' + id + '"]');
      if (!tbody) return;
      const re = new RegExp('^' + ROW_PREFIX[id] + '_(\\d+)_');
      let n = 0;
      tbody.querySelectorAll('[data-key]').forEach((el) => {
        const m = el.getAttribute('data-key').match(re); if (m) n = Math.max(n, +m[1]);
      });
      /* A blank row writes nothing until something is typed in it. */
      const row = buildRow(id, n + 1);
      row.querySelectorAll('[id]').forEach((el) => { el.setAttribute('data-sg-id', el.id); el.id = 'sg-' + el.id; });
      tbody.append(row);
    }
  });
  root.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    const li = e.target.closest && e.target.closest('.step-check li[data-key]');
    if (li && root.contains(li)) { e.preventDefault(); toggle(li); }
  });

  /* ---- first fill, and the other tab ----------------------------- */
  widgets.forEach((w) => w.load(blob0));
  load(blob0);
  drawDerived(root, getter(blob0));

  const pull = () => {
    if (!root.isConnected) return;
    if (Object.keys(pending).length) return;       /* a write is waiting: ours is newer */
    const blob = readAll(spec.ns);
    const active = document.activeElement;
    load(blob, { skip: (el) => el === active });
    widgets.forEach((w) => { if (!w.hasFocus()) w.load(blob); });
    drawDerived(root, getter(blob));
  };
  const onStorage = (e) => { if (e.key && e.key.indexOf(blobKey(spec.ns)) === 0) pull(); };
  const onVisible = () => { if (document.visibilityState === 'visible') pull(); };
  addEventListener('storage', onStorage);
  document.addEventListener('visibilitychange', onVisible);
  addEventListener('pagehide', flush);

  /* Chrome initialises at import time, when this was not on the page:
     glossary popovers and aria labels are wired after render. */
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[stage-guide] chrome', e); }

  return { root, flush, load, pull, stage };
}

export default { renderGuide };
