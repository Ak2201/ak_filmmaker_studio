/* ============================================================
   READ AS A CHARACTER — one role's lines, the rest of the page dimmed
   ------------------------------------------------------------
   Idea 16 of docs/SCREENPLAY-WRITER-PLAN.md. For an actor running
   their part, and for a writer checking that a voice holds.

   PURELY A VIEW. Nothing here writes to storage or to the script
   model; the only state is the chosen name, in this module's memory.
   It reads the page the editor already drew, because the editor
   (src/pages/write.js) keeps its document in a closure and patches
   rows in place — so the DOM is the one copy of "what is on the page
   right now" that this module can see without a second model.

   HOW A ROW KNOWS IT BELONGS. One walk over the rows, in order:
   a character cue names the speaker (cueName() from
   screenplay-analysis.js — the same normaliser the cast matrix uses,
   so "RAGAVAN (V.O.)" and "RAGAVAN (CONT'D)" are one person); the
   parentheticals and dialogue under it are theirs; anything else
   ends the speech. The row gets `data-ra="cue"` or `data-ra="line"`
   and `#wr-page.is-read-as` dims every row without one.

   KEEPING UP WITH EDITS WITHOUT COSTING A KEYSTROKE. The editor
   patches rows (Return adds one; delete and move touch two), so a
   MutationObserver on the page's child lists marks the reading
   stale, as does typing into a cue or changing a row's type. The
   walk itself runs on idle — never inside the keystroke — and only
   touches an attribute whose value changed. A row inserted between
   walks carries no attribute and reads as dimmed for that moment,
   which is the right default for a line nobody has said yet.

   The bar this lives in (`.wr-xa`, under the page gauge) is created
   here and re-created whenever write.js re-renders; dictation
   (./dictation.js) mounts into the same bar.
   ============================================================ */
import { h } from '../lib/dom.js';
import { cueName } from '../lib/screenplay-analysis.js';
import { mountDictation } from './dictation.js';
import '../styles/write-extras-a.css';

const app = document.getElementById('app');

/* ---- in-memory state (never stored) ------------------------- */
let chosen = '';          // a cueName(), or '' for off
let highlight = true;
let at = -1;              // index into `lines` of the line last jumped to
let stale = true;
let reading = { names: [], byName: new Map() };
let lines = [];           // rows of the chosen character's dialogue, in order
let marked = [];          // every row this module has put a data-ra on
let idleTask = 0;

/* ---- the walk ----------------------------------------------- */
const TYPES = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition'];
function rowType(row) {
  const cl = row.classList;
  for (const t of TYPES) if (cl.contains('t-' + t)) return t;
  return '';
}
function rowText(row) {
  const ta = row.querySelector('.wr-text');
  return ta ? ta.value : '';
}

/** Rows in page order, without querying 30,000 nodes. */
function rows() {
  const page = document.getElementById('wr-page');
  const out = [];
  if (!page) return out;
  for (const run of page.children) {
    for (const n of run.children) if (n.tagName === 'ARTICLE' && n.hasAttribute('data-el')) out.push(n);
  }
  return out;
}

/** One pass: who speaks each row, and per name the lines and scenes.
    Exported for the probe and for anybody who wants the same reading. */
export function readRows(list) {
  const byName = new Map();
  const owner = new Array(list.length).fill('');
  const role = new Array(list.length).fill('');
  let speaker = '';
  let scene = 0;
  for (let i = 0; i < list.length; i++) {
    const type = rowType(list[i]);
    if (type === 'scene') { scene++; speaker = ''; continue; }
    if (type === 'character') {
      speaker = cueName(rowText(list[i]));
      if (!speaker) continue;
      owner[i] = speaker; role[i] = 'cue';
      if (!byName.has(speaker)) byName.set(speaker, { name: speaker, lines: 0, cues: 0, scenes: new Set() });
      byName.get(speaker).cues++;
      continue;
    }
    if ((type === 'paren' || type === 'dialogue') && speaker) {
      owner[i] = speaker; role[i] = 'line';
      const rec = byName.get(speaker);
      if (type === 'dialogue') { rec.lines++; rec.scenes.add(scene); }
      continue;
    }
    speaker = '';
  }
  const names = Array.from(byName.values())
    .sort((a, b) => b.lines - a.lines || a.name.localeCompare(b.name));
  return { names, byName, owner, role };
}

function setData(node, value) {
  if (value) { if (node.getAttribute('data-ra') !== value) node.setAttribute('data-ra', value); }
  else if (node.hasAttribute('data-ra')) node.removeAttribute('data-ra');
}

function recompute() {
  idleTask = 0;
  stale = false;
  const list = rows();
  const r = readRows(list);
  reading = r;
  if (chosen && !r.byName.has(chosen)) chosen = '';

  const next = [];
  lines = [];
  if (chosen) {
    for (let i = 0; i < list.length; i++) {
      if (r.owner[i] !== chosen) continue;
      next.push(list[i]);
      setData(list[i], r.role[i]);
      if (r.role[i] === 'line' && rowType(list[i]) === 'dialogue') lines.push(list[i]);
    }
  }
  // Clear only rows that had a mark and no longer earn one.
  const keep = new Set(next);
  for (const n of marked) if (!keep.has(n)) setData(n, '');
  marked = next;
  if (at >= lines.length) at = lines.length - 1;
  paint();
}

function schedule() {
  stale = true;
  if (idleTask) return;
  idleTask = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(recompute, { timeout: 600 })
    : setTimeout(recompute, 120);
}
function freshen() {
  if (!stale) return;
  if (idleTask) {
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(idleTask);
    clearTimeout(idleTask);
    idleTask = 0;
  }
  recompute();
}

/* ---- the control -------------------------------------------- */
let ui = null;   // { group, select, prev, next, hl, count }

function buildGroup() {
  const select = h('select.wr-xa-select', {
    id: 'wr-ra-pick',
    'aria-label': 'Read as a character',
    title: 'Dim every line except one character’s. With a character chosen, n and p jump between their lines.'
  });
  const hl = h('input', { type: 'checkbox', id: 'wr-ra-hl', checked: true });
  const prev = h('button.btn.wr-xa-btn', {
    type: 'button', 'data-ra-nav': '-1', disabled: true,
    'aria-label': 'Previous line of this character', title: 'Previous line (p)', text: '‹ Prev'
  });
  const next = h('button.btn.wr-xa-btn', {
    type: 'button', 'data-ra-nav': '1', disabled: true,
    'aria-label': 'Next line of this character', title: 'Next line (n)', text: 'Next ›'
  });
  const count = h('span.wr-xa-count', { role: 'status', 'aria-live': 'polite', id: 'wr-ra-count' });
  const group = h('div.wr-xa-group.wr-ra', { role: 'group', 'aria-label': 'Read as a character' }, [
    h('label.wr-xa-lab', { for: 'wr-ra-pick', text: 'Read as' }),
    select,
    h('label.wr-xa-check', { for: 'wr-ra-hl' }, [hl, h('span', { text: 'Highlight' })]),
    prev, next, count
  ]);

  select.addEventListener('focus', freshen);
  select.addEventListener('pointerdown', freshen);
  select.addEventListener('change', () => choose(select.value));
  hl.addEventListener('change', () => { highlight = hl.checked; paint(); });
  prev.addEventListener('click', () => jump(-1));
  next.addEventListener('click', () => jump(1));
  group.addEventListener('keydown', (e) => {
    if (!chosen || e.altKey || e.ctrlKey || e.metaKey) return;
    const k = e.key.toLowerCase();
    if (k !== 'n' && k !== 'p') return;
    if (e.target === hl) return;
    e.preventDefault();
    jump(k === 'n' ? 1 : -1);
  });
  return { group, select, prev, next, hl, count };
}

function fillOptions() {
  const { select } = ui;
  const want = [['', 'Everyone (off)']].concat(
    reading.names.map((n) => [n.name, n.name + ' · ' + n.lines]));
  const same = select.options.length === want.length
    && want.every(([v, t], i) => select.options[i].value === v && select.options[i].textContent === t);
  if (!same) {
    select.replaceChildren(...want.map(([v, t]) => h('option', { value: v, text: t })));
  }
  if (select.value !== chosen) select.value = chosen;
  select.disabled = reading.names.length === 0;
}

function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

function paint() {
  const page = document.getElementById('wr-page');
  if (page) {
    page.classList.toggle('is-read-as', !!chosen);
    page.classList.toggle('ra-hl', !!chosen && highlight);
  }
  if (!ui) return;
  fillOptions();
  const rec = chosen ? reading.byName.get(chosen) : null;
  ui.prev.disabled = !rec || !lines.length;
  ui.next.disabled = !rec || !lines.length;
  ui.hl.disabled = !rec;
  let msg = '';
  if (rec) {
    msg = chosen + ': ' + plural(rec.lines, 'line', 'lines') + ', ' + plural(rec.scenes.size, 'scene', 'scenes');
    if (at >= 0 && lines.length) msg += ' · line ' + (at + 1) + ' of ' + lines.length;
  } else if (!reading.names.length) {
    msg = 'No character cues yet';
  }
  if (ui.count.textContent !== msg) ui.count.textContent = msg;
}

function clearCurrent() {
  const cur = document.querySelector('#wr-page [data-ra-current]');
  if (cur) cur.removeAttribute('data-ra-current');
}

function choose(name) {
  freshen();
  chosen = reading.byName.has(name) ? name : '';
  at = -1;
  clearCurrent();
  stale = true;
  recompute();
}

function jump(delta) {
  freshen();
  if (!chosen || !lines.length) return;
  if (at < 0) {
    // The first jump goes to the nearest line from where the reader is.
    const mid = innerHeight / 2;
    let idx = lines.findIndex((r) => r.getBoundingClientRect().top >= mid - 4);
    if (idx < 0) idx = lines.length;
    at = delta > 0 ? Math.min(idx, lines.length - 1) : Math.max(idx - 1, 0);
  } else {
    at = (at + delta + lines.length) % lines.length;
  }
  const row = lines[at];
  clearCurrent();
  row.setAttribute('data-ra-current', '');
  // A run off screen is skipped by content-visibility and sized as a
  // placeholder; one instant scroll lays it out, the second lands true.
  row.scrollIntoView({ block: 'center', behavior: 'instant' });
  requestAnimationFrame(() => row.scrollIntoView({ block: 'center', behavior: 'instant' }));
  paint();
}

/* ---- mounting, and staying mounted -------------------------- */
let pageObs = null;
let observedPage = null;

/** The shared bar under the gauge. Exported so dictation can find it. */
export function extrasBar() {
  const section = document.getElementById('screenplay');
  const gauge = section && section.querySelector(':scope > .wr-bar');
  if (!gauge) return null;
  let bar = section.querySelector(':scope > .wr-xa');
  if (!bar) {
    bar = h('div.wr-xa', { 'aria-label': 'Reading and dictation' });
    gauge.after(bar);
  }
  return bar;
}

function mount() {
  const page = document.getElementById('wr-page');
  if (page !== observedPage) {
    if (pageObs) pageObs.disconnect();
    observedPage = page;
    marked = [];
    lines = [];
    at = -1;
    if (page) {
      pageObs = pageObs || new MutationObserver(schedule);
      pageObs.observe(page, { childList: true, subtree: true });
    }
    schedule();
  }
  const bar = extrasBar();
  if (!bar) return;
  if (!ui || !ui.group.isConnected || ui.group.parentElement !== bar) {
    ui = ui || buildGroup();
    bar.prepend(ui.group);
  }
  mountDictation(bar);
  paint();
}

/* Typing in a cue renames a speaker; changing a row's type can move a
   whole speech. Neither is a child-list mutation, so they are told
   here. Dialogue text is not watched: it never changes who speaks. */
document.addEventListener('input', (e) => {
  const t = e.target;
  if (t && t.classList && t.classList.contains('wr-text') && t.closest('.wr-el.t-character')) schedule();
}, true);
document.addEventListener('change', (e) => {
  const t = e.target;
  if (t && t.matches && t.matches('select[data-el-field="type"]')) schedule();
}, true);

if (app) {
  // write.js replaces <main> on every full render; the bar goes with it.
  new MutationObserver(mount).observe(app, { childList: true });
  mount();
}

export default { readRows, extrasBar };
