/* ============================================================
   WRITE SHORTCUTS — the keyboard panel, the scene navigator and the
   two shortcut sheets for write.html
   ------------------------------------------------------------
   Phase 2 of docs/SCREENPLAY-WRITER-PLAN.md. The decisions are in
   src/lib/write-keys.js; this file only shows them and changes them.

     keysPanel()      a <details> in the Screenplay section: the
                      preset, Ctrl/⌘+number in a browser tab, and each
                      element's Return-next (Final Draft's Format ›
                      Elements, in one small grid)
     openNavigator()  Ctrl/⌘+Shift+S: the scene headings, filtered as
                      you type, Return jumps
     printKeysheet()  the active preset's sheet, through the studio's
                      one print path (src/lib/pdf.js)
     publishSheet()   the `?` sheet's Write section, via
                      StudioUI.setPageShortcuts

   STORAGE. Only on a user's change, through saveWritePrefs(), which
   read-merge-writes `fms_write_prefs_v1` (the format guide shares
   it). Rendering reads; nothing here writes on render or idle.
   NO INLINE HANDLERS: listeners are attached to elements built here,
   or delegated by data-wk attributes.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';
import Keys, { PRESETS, TYPE_NAMES } from '../lib/write-keys.js';
import { characterIndex, nextCueOf, bookmarks } from '../lib/script-index.js';

const name = (t) => TYPE_NAMES[t] || t;

/** Is Ctrl/⌘+number free to take here? An installed app window and
    the extension's side panel have no tab strip to steal it from. */
export function ctrlDigitsFree() {
  try {
    if (globalThis.chrome && chrome.runtime && chrome.runtime.id) return true;
    return ['standalone', 'window-controls-overlay', 'minimal-ui']
      .some((m) => matchMedia('(display-mode: ' + m + ')').matches);
  } catch (e) { return false; }
}

let CFG = null;   // { known, getPrefs, setPrefs(prefs) }
let panelOpen = false;

export function configure(cfg) { CFG = cfg; }

function digitList(prefs) {
  const { rows } = Keys.shortcutRows(prefs, CFG.known, false);
  return h('ul.wk-digits', { 'aria-label': 'Element shortcuts for this preset' },
    rows.slice(0, Keys.getPreset(prefs.preset).digits.length).map((r, i) =>
      h('li' + (r.off ? '.is-off' : ''), {}, [h('kbd', { text: String(i + 1) }), ' ' + r.label])));
}

export function keysPanel() {
  const prefs = CFG.getPrefs();
  const free = ctrlDigitsFree();
  const presetSel = h('select', { 'data-wk': 'preset', 'aria-label': 'Keyboard preset' },
    PRESETS.map((p) => {
      const o = h('option', { value: p.id, text: p.label });
      if (p.id === prefs.preset) o.selected = true;
      return o;
    }));
  const ctrl = h('input', { type: 'checkbox', 'data-wk': 'ctrl' });
  ctrl.checked = prefs.ctrlDigits || free;
  if (free) ctrl.disabled = true;

  const table = Keys.returnTable(prefs, CFG.known);
  const flow = h('fieldset.wk-flow', {}, [h('legend', { text: 'Return after each element' })]);
  CFG.known.forEach((t) => {
    const sel = h('select', { 'data-wk': 'next', 'data-wk-type': t, 'aria-label': 'Return after ' + name(t) });
    CFG.known.forEach((n) => {
      const o = h('option', { value: n, text: name(n) });
      if (n === table[t]) o.selected = true;
      sel.append(o);
    });
    flow.append(h('label', {}, [h('span', { text: name(t) + ' →' }), sel]));
  });

  const det = h('details.wk-panel', { id: 'wr-keys' }, [
    h('summary', {}, ['Keyboard · ', h('strong', { 'data-wk-label': '', text: Keys.getPreset(prefs.preset).label }), ' preset']),
    h('div.wk-body', {}, [
      h('div.wk-row', {}, [
        h('label', {}, ['Preset ', presetSel]),
        h('label', {}, [ctrl, free
          ? 'Ctrl/⌘ + number is on (no browser tabs here)'
          : 'Also use Ctrl/⌘ + number in this browser tab']),
        h('button.btn', { type: 'button', 'data-wk': 'sheet', text: 'Shortcut sheet' }),
        h('button.btn', { type: 'button', 'data-wk': 'print', text: 'Print the sheet' })
      ]),
      h('div', { 'data-wk-digits': '' }, [digitList(prefs)]),
      h('p.wk-note', {
        text: 'Alt (Option on a Mac) + number sets the element type everywhere. '
            + 'Ctrl/⌘ + number also works in the installed app and the extension panel; '
            + 'in a browser tab it would take tab switching away while you type, so it is your choice. '
            + 'Return on an empty line cycles its type; Tab walks Character → Parenthetical → Dialogue; '
            + 'Esc then Tab leaves the screenplay.'
      }),
      flow
    ])
  ]);
  det.open = panelOpen;
  det.addEventListener('toggle', () => { panelOpen = det.open; });
  return det;
}

/** Bring the open panel and the `?` sheet in step after a change,
    without re-rendering the page. */
function refreshPanel(prefs) {
  const det = document.getElementById('wr-keys');
  if (det) {
    const lab = det.querySelector('[data-wk-label]');
    if (lab) lab.textContent = Keys.getPreset(prefs.preset).label;
    const host = det.querySelector('[data-wk-digits]');
    if (host) host.replaceChildren(digitList(prefs));
    const table = Keys.returnTable(prefs, CFG.known);
    det.querySelectorAll('select[data-wk="next"]').forEach((s) => { s.value = table[s.dataset.wkType]; });
  }
  publishSheet(prefs);
}

delegate(document, 'change', 'select[data-wk="preset"]', (e, sel) => {
  if (!CFG) return;
  refreshPanel(CFG.setPrefs({ preset: sel.value }));
});
delegate(document, 'change', 'input[data-wk="ctrl"]', (e, box) => {
  if (!CFG) return;
  refreshPanel(CFG.setPrefs({ ctrlDigits: box.checked }));
});
delegate(document, 'change', 'select[data-wk="next"]', (e, sel) => {
  if (!CFG) return;
  refreshPanel(CFG.setPrefs({ returnNext: { [sel.dataset.wkType]: sel.value } }));
});
delegate(document, 'click', '[data-wk="sheet"]', () => {
  if (window.StudioUI && StudioUI.openShortcutSheet) StudioUI.openShortcutSheet();
});
delegate(document, 'click', '[data-wk="print"]', () => printKeysheet());

/* ---- the sheets ----------------------------------------------- */
function sheetRows(prefs) {
  return Keys.shortcutRows(prefs, CFG.known, prefs.ctrlDigits || ctrlDigitsFree());
}

export function publishSheet(prefs) {
  if (!CFG || !window.StudioUI || !StudioUI.setPageShortcuts) return;
  const s = sheetRows(prefs || CFG.getPrefs());
  StudioUI.setPageShortcuts({
    title: 'Writing the screenplay — ' + s.preset + ' preset',
    rows: s.rows.filter((r) => !r.off).map((r) => ({ keys: r.keys, label: r.label }))
  });
}

export function printKeysheet() {
  if (!CFG) return;
  const s = sheetRows(CFG.getPrefs());
  const table = Keys.returnTable(CFG.getPrefs(), CFG.known);
  let node = null;
  PDF.exportPDF({
    scope: 'keysheet',
    label: 'Screenplay shortcuts',
    subtitle: s.preset + ' preset',
    title: PDF.projectTitle() + ' — Screenplay shortcuts',
    before: () => {
      node = h('section.wk-print', {}, [
        h('h2', { text: 'Screenplay shortcuts — ' + s.preset + ' preset' }),
        h('table', {}, [
          h('thead', {}, [h('tr', {}, [h('th', { text: 'Keys' }), h('th', { text: 'Does' })])]),
          h('tbody', {}, s.rows.map((r) => h('tr' + (r.off ? '.wk-print-off' : ''), {}, [
            h('td', {}, r.keys.map((k, i) => [i ? ' or ' : '', h('kbd', { text: k })]).flat()),
            h('td', { text: r.label })
          ])))
        ]),
        h('h2', { text: 'Return after each element' }),
        h('table', {}, [h('tbody', {}, CFG.known.map((t) =>
          h('tr', {}, [h('td', { text: name(t) }), h('td', { text: '→ ' + name(table[t]) })])))])
      ]);
      (document.getElementById('main') || document.body).append(node);
    },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

/* ---- the navigator: scenes, characters, bookmarks --------------
   A modal combobox: the filter field keeps focus, ↑/↓ move the
   highlighted row (aria-activedescendant), Return jumps, Esc puts the
   caret back where it was. Three lists, one control: Tab (Shift+Tab)
   or a click on the tab row swaps the list. Characters and bookmarks
   are DERIVED from the elements each time it opens (script-index.js).
   Choosing a character goes to THEIR NEXT CUE after the line the
   caret was in, wrapping round — so repeated Return walks the part. */
let nav = null;
const MODES = [
  ['scenes', 'Scenes', 'Filter scene headings'],
  ['characters', 'Characters', 'Filter characters'],
  ['bookmarks', 'Bookmarks', 'Filter bookmarks']
];
export function openNavigator({ elements, onJump, mode = 'scenes', fromId = null }) {
  closeNavigator();
  let cur = Math.max(0, MODES.findIndex((m) => m[0] === mode));
  const back = document.activeElement;
  const itemsFor = (kind) => {
    if (kind === 'characters') {
      return characterIndex(elements).map((c) => ({
        text: c.name,
        meta: c.speeches + (c.speeches === 1 ? ' line' : ' lines') + ' · ' + c.sceneCount + (c.sceneCount === 1 ? ' scene' : ' scenes')
          + ' · first in scene ' + (c.firstScene || '—'),
        key: c.name,
        target: () => nextCueOf(elements, c.name, fromId)
      }));
    }
    if (kind === 'bookmarks') {
      return bookmarks(elements).map((b) => ({
        text: b.text || '(empty line)', n: b.n, meta: 'scene ' + (b.scene || '—'), key: b.text, target: () => b.id
      }));
    }
    const out = [];
    elements.forEach((el) => { if (el.type === 'scene') { const n = out.length + 1; out.push({ n, text: el.text.trim() || '(untitled heading)', key: String(n), target: () => el.id }); } });
    return out;
  };
  const input = h('input', {
    type: 'search', autocomplete: 'off',
    role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'wk-nav-list', 'aria-autocomplete': 'list'
  });
  const list = h('ul', { id: 'wk-nav-list', role: 'listbox' });
  const note = h('p.wk-note', { 'aria-live': 'polite' });
  const tabs = h('div.wk-nav-modes', { role: 'tablist', 'aria-label': 'What to list' }, MODES.map(([id, label], i) =>
    h('button', { type: 'button', role: 'tab', tabindex: '-1', 'data-wk-mode': String(i), text: label })));
  const title = h('h2');
  const box = h('div.wk-nav', { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Navigator' }, [title, tabs, input, list, note]);
  const scrim = h('div.wk-nav-scrim', {}, [box]);
  let all = [];
  let shown = [];
  let active = 0;

  const paint = () => {
    const kind = MODES[cur][0];
    const q = input.value.trim().toUpperCase();
    shown = all.filter((s) => !q || s.text.toUpperCase().includes(q) || String(s.n) === q);
    active = Math.min(active, Math.max(0, shown.length - 1));
    list.setAttribute('aria-label', MODES[cur][1]);
    list.replaceChildren(...shown.map((s, i) => h('li' + (i === active ? '.is-active' : ''), {
      id: 'wk-nav-' + i, role: 'option', 'aria-selected': i === active ? 'true' : 'false', 'data-wk-i': String(i)
    }, [
      s.n != null ? h('span.wk-n', { text: String(s.n) }) : null,
      h('span.wk-t', { text: s.text }),
      s.meta ? h('span.wk-meta', { text: s.meta }) : null
    ].filter(Boolean))));
    if (shown.length) {
      input.setAttribute('aria-activedescendant', 'wk-nav-' + active);
      const node = list.children[active];
      if (node && node.scrollIntoView) node.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
    const hint = ' · ↑ ↓ to move, Return to jump, Tab for the next list, Esc to close';
    const empty = { scenes: 'No scene headings yet.', characters: 'No characters yet.', bookmarks: 'No bookmarks yet. Alt+B bookmarks the line you are in.' }[kind];
    note.textContent = all.length ? shown.length + ' of ' + all.length + ' ' + MODES[cur][1].toLowerCase() + hint : empty;
  };
  const setMode = (i) => {
    cur = (i + MODES.length) % MODES.length;
    all = itemsFor(MODES[cur][0]);
    active = 0;
    input.value = '';
    title.textContent = MODES[cur][1] + ' navigator';
    input.setAttribute('aria-label', MODES[cur][2]);
    input.placeholder = MODES[cur][2];
    tabs.querySelectorAll('[role="tab"]').forEach((b, k) => b.setAttribute('aria-selected', k === cur ? 'true' : 'false'));
    paint();
  };
  const go = (i) => {
    const s = shown[i];
    if (!s) return;
    const id = s.target();
    closeNavigator(false);
    if (id) onJump(id);
  };
  input.addEventListener('input', () => { active = 0; paint(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (!shown.length) return;
      active = (active + (e.key === 'ArrowDown' ? 1 : -1) + shown.length) % shown.length;
      paint();
    } else if (e.key === 'Enter') { e.preventDefault(); go(active); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeNavigator(true); }
    else if (e.key === 'Tab') { e.preventDefault(); setMode(cur + (e.shiftKey ? -1 : 1)); }   // modal: focus stays in the filter
  });
  list.addEventListener('pointerdown', (e) => {
    const li = e.target.closest('[data-wk-i]');
    if (!li) return;
    e.preventDefault();
    go(Number(li.dataset.wkI));
  });
  tabs.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-wk-mode]');
    if (!b) return;
    e.preventDefault();                       // the filter keeps focus
    setMode(Number(b.dataset.wkMode));
  });
  scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) closeNavigator(true); });
  nav = { scrim, back };
  document.body.append(scrim);
  setMode(cur);
  input.focus();
}

export function closeNavigator(restore) {
  if (!nav) return;
  const { scrim, back } = nav;
  nav = null;
  scrim.remove();
  if (restore && back && back.isConnected && back.focus) back.focus();
}

export default { configure, keysPanel, publishSheet, printKeysheet, openNavigator, closeNavigator, ctrlDigitsFree };
