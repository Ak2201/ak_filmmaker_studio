/* ============================================================
   THE GUIDE INSIDE EACH TOOL — "Blueprint step 16" on the module
   page, and a drawer with that step's question and your answer
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3 §5 (rev. 2 §5.3). The
   blueprints say "Do this in Visualize › Shot List"; this is the
   other direction. A module page that some blueprint step names in
   its `tools` (src/data/steps.stages.json) gets a small pill in its
   header. The pill opens a side drawer — a bottom sheet on a phone —
   with the step's title, its prompt and its fields, editable where
   you are.

   THE MAPPING IS REVERSED AT RUNTIME, never written down twice. Each
   step's `tools` resolve to hrefs through src/ui/step-stages.js
   (navigation.json, by module id), and the pill shows the steps
   whose href is this page and, on a tabbed page, this tab. A module
   added to a step's tools in the sidecar grows a pill with no edit
   here.

   WHICH BLUEPRINT. A short-format project reads the short's steps;
   every other format reads the feature's (01–24 `feature`, 25–32
   `production`), which is the blueprint the hub opens for them.

   ONE RENDERER, ONE BLOB, ONE SAVE PATH. The fields come out of
   renderStep() in src/ui/steps.js — the same function the blueprint
   page draws them with — so every control carries the data-key the
   blueprint reads back, and the four tables' rows come from
   src/ui/blueprint-rows.js, which feature.js builds its own rows
   with. Saving is READ-MERGE-WRITE of the blueprint's own key
   through the storage proxy (scoped to the open project, which is
   also what touches `updatedAt` and tells cloud.js a save happened),
   writing only the keys this drawer changed. Values are stored the
   way each page's saveData() stores them: the feature writes
   `el.value` for every control but a checkbox (a boolean) and
   `classList.contains('checked')` for a checklist item; the short
   writes `!!checked` for a checkbox
   and the `done` class for a checklist item. There is no second copy
   and no new key.

   WHAT IS LEFT ON THE BLUEPRINT. Long craft notes and examples (the
   drawer is a working surface; "Open in the blueprint" is one click),
   the derived widgets that need the page's code to draw (pacing
   chart, character map, budget bar), the row controls (reorder,
   duplicate and delete belong to the page that owns the numbering)
   and the short's scene map and script editor, which are arrays the
   short page owns whole. The drawer says so where it leaves one out.

   NOTHING ON LOAD WRITES. The pill and the drawer read; a write
   happens only on input in the drawer — the idle-write assertion in
   verify is watching every page this mounts on.

   DIALOG SEMANTICS: role="dialog" + aria-modal, focus moved in and
   trapped, Esc closes, focus returns to the pill that opened it.
   ============================================================ */
import Store from '../lib/store.js';
import { h, delegate } from '../lib/dom.js';
import STEPS from '../data/steps.feature.json';
import PROD from '../data/steps.production.json';
import SHORT from '../data/steps.short.json';
import { renderStep } from './steps.js';
import { stageInfo, resolveTool } from './step-stages.js';
import { ROW_BUILDERS, ROW_PREFIX } from './blueprint-rows.js';
import '../styles/blueprint-drawer.css';

const BLUEPRINTS = {
  feature: {
    key: 'fms_filmmaker_combined_v1',
    page: 'feature.html',
    name: 'Feature Blueprint',
    checkedClass: 'checked',
    steps: () => [
      ...STEPS.vol1.map((step) => ({ ns: 'feature', step })),
      ...STEPS.vol2.map((step) => ({ ns: 'feature', step })),
      ...PROD.production.map((step) => ({ ns: 'production', step })),
      ...PROD.post.map((step) => ({ ns: 'production', step }))
    ],
    /* feature.js saveData(): `el.value`, except a checkbox (the HOD
       sign-offs), which is a boolean — its .value is "on" either way.
       Loading reads `true`/"true" as ticked and a legacy "on" as not;
       see savedTick() in feature.js. */
    read: (el) => (el.type === 'checkbox' ? !!el.checked : el.value),
    tick: (v) => v === true || v === 'true'
  },
  short: {
    key: 'fms_shortfilm_blueprint_v1',
    page: 'short.html',
    name: 'Short Film Blueprint',
    checkedClass: 'done',
    steps: () => SHORT.steps.map((step) => ({ ns: 'short', step })),
    /* short.js saveData(): a checkbox is a boolean, the rest a string. */
    read: (el) => (el.type === 'checkbox' ? !!el.checked : el.value || ''),
    tick: (v) => !!v
  }
};

/* Blocks the drawer draws. The rest stay on the blueprint (see the
   header). `raw` is filtered further below. */
const KEEP = new Set(['formula', 'hint', 'asks', 'check', 'raw']);
const TABLE_IDS = Object.keys(ROW_BUILDERS);
const MIN_ROWS = 3;
const SAVE_MS = 400;

/* ---- where am I ----------------------------------------------- */

function pageName() {
  try {
    const last = (location.pathname.split('/').pop() || '').toLowerCase();
    if (!last) return 'index.html';
    return last.endsWith('.html') ? last : last + '.html';
  } catch (e) { return ''; }
}

function blueprintFor() {
  let fmt = 'feature';
  try { const p = Store.currentProject(); if (p && p.format === 'short') fmt = 'short'; } catch (e) { /* no store */ }
  return fmt;
}

const splitHref = (href) => {
  const [file, frag = ''] = String(href || '').split('#');
  return { file: file.toLowerCase(), frag };
};

/** The tab on screen: a `section[id]` in main that is not hidden,
 *  when the page is tabbed (src/ui/tabs.js marks them tabpanel). */
function visibleTab() {
  const panels = [...document.querySelectorAll('main section[role="tabpanel"][id]')];
  if (!panels.length) return null;
  return panels.find((s) => !s.hidden) || null;
}

/**
 * The blueprint steps whose tools land on this page (and tab), in
 * blueprint order, each as `{ ns, step }`. Pure reading.
 */
const ROWS = new Map();
/* Everything in a blueprint that lands on `page`, with the fragments
   it lands on. Depends on the page alone, so it is worked out once. */
function rowsFor(fmt, page) {
  const key = fmt + '|' + page;
  if (ROWS.has(key)) return ROWS.get(key);
  const rows = [];
  for (const entry of BLUEPRINTS[fmt].steps()) {
    const info = stageInfo(entry.ns, entry.step.id);
    if (!info || !info.tools.length) continue;
    const frags = info.tools.map(resolveTool).filter(Boolean).map((t) => splitHref(t.href))
      .filter((t) => t.file === page).map((t) => t.frag);
    if (frags.length) rows.push({ ...entry, frags });
  }
  ROWS.set(key, rows);
  return rows;
}

export function stepsHere(fmt = blueprintFor(), page = pageName()) {
  const rows = rowsFor(fmt, page);
  if (!rows.length) return [];
  const tab = visibleTab();
  if (tab) {
    /* A tabbed page: the steps whose tool is THIS tab, or an element
       inside it, or the page as a whole. */
    return rows.filter((r) => r.frags.some((frag) => {
      if (!frag || frag === tab.id) return true;
      const el = document.getElementById(frag);
      return !!(el && tab.contains(el));
    }));
  }
  /* Untabbed: the hash names a module, else the page's own module
     (the href with no fragment), else everything on it. */
  const hash = (location.hash || '').replace(/^#/, '');
  const byHash = hash ? rows.filter((r) => r.frags.includes(hash)) : [];
  if (byHash.length) return byHash;
  const own = rows.filter((r) => r.frags.includes(''));
  return own.length ? own : rows;
}

const titleOf = (step) => step.titlePlain || String(step.title || '').replace(/<[^>]+>/g, '');
const plainTitle = (step) => titleOf(step).replace(/[.\s]+$/, '');

/* ---- the pill ------------------------------------------------- */

let lastSig = '';
let opener = null;

function pillLabel(here) {
  if (here.length === 1) return 'Blueprint step ' + here[0].step.num + ' · ' + plainTitle(here[0].step);
  return 'Blueprint steps ' + here.map((r) => r.step.num).join(', ');
}

function pillHost() {
  const main = document.querySelector('main') || document.getElementById('app');
  if (!main) return null;
  const head = main.querySelector('header.bd-head');
  return head || main;
}

function ensurePill() {
  if (typeof document === 'undefined') return;
  const here = stepsHere();
  const sig = here.map((r) => r.ns + ':' + r.step.id).join('|');
  const old = document.querySelector('.bpd-pill');
  if (!here.length) { if (old) old.remove(); lastSig = sig; return; }
  const host = pillHost();
  if (!host) return;
  if (old && host.contains(old) && sig === lastSig) return;
  if (old) old.remove();
  lastSig = sig;
  const bp = BLUEPRINTS[blueprintFor()];
  const pill = h('button.bpd-pill', {
    type: 'button',
    'data-bpd': 'open',
    'aria-haspopup': 'dialog',
    title: 'Open this step of the ' + bp.name + ' here, beside the tool'
  }, [
    h('span.bpd-pill-mark', { 'aria-hidden': 'true', text: '◧' }),
    h('span.bpd-pill-text', { text: pillLabel(here) })
  ]);
  const eyebrow = host.matches('header') ? host.querySelector('.bd-eyebrow') : null;
  if (eyebrow) eyebrow.after(pill); else host.prepend(pill);
}

/* ---- the drawer ----------------------------------------------- */

let drawer = null;
let current = null;            // { fmt, here, index }
let pending = {};
let saveTimer = null;

function readBlob(key) {
  try { const v = JSON.parse(localStorage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}

/** Read the blueprint's blob, lay this drawer's changes over it, write
 *  it back — through the proxy, so it is the open project's blob and
 *  the save is announced exactly as the page's own is. */
function flush() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!current || !Object.keys(pending).length) return;
  const bp = BLUEPRINTS[current.fmt];
  const blob = readBlob(bp.key);
  Object.assign(blob, pending);
  pending = {};
  try { localStorage.setItem(bp.key, JSON.stringify(blob)); } catch (e) { /* the proxy reports a refused write */ }
}

function queue(key, value) {
  pending[key] = value;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_MS);
}

/** Which raw blocks the drawer can draw: ones holding fields, or one
 *  of the four tables. `left` collects what stays on the blueprint. */
function filterBlocks(step) {
  let left = false;
  const blocks = (step.blocks || []).filter((b) => {
    if (!KEEP.has(b.type)) return false;
    if (b.type !== 'raw') return true;
    const html = String(b.html || '');
    if (/data-key=/.test(html)) return true;
    if (TABLE_IDS.some((id) => html.includes('id="' + id + '"'))) return true;
    if (/<tbody|<textarea|id="script/i.test(html)) left = true;
    return false;
  });
  return { blocks, left };
}

function renderBody(entry, fmt) {
  const bp = BLUEPRINTS[fmt];
  const { blocks, left } = filterBlocks(entry.step);
  const section = renderStep({ ...entry.step, blocks, badge: null }, null, entry.ns);
  section.classList.add('bpd-step');
  section.querySelectorAll('.st-stage-row, .st-why, .row-actions, .step-badge').forEach((el) => el.remove());

  /* No inline handlers on a module page (the CSP would refuse them
     and verify counts them), and no id that could collide with the
     page's own. */
  section.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });

  /* The tables: rows from the shared builders, as many as are saved. */
  const blob = readBlob(bp.key);
  for (const id of TABLE_IDS) {
    const body = section.querySelector('#' + id);
    if (!body) continue;
    const prefix = ROW_PREFIX[id];
    const re = new RegExp('^' + prefix + '_(\\d+)_');
    let count = 0;
    Object.keys(blob).forEach((k) => { const m = k.match(re); if (m) count = Math.max(count, +m[1]); });
    const n = Math.max(count, MIN_ROWS);
    for (let i = 1; i <= n; i++) body.append(ROW_BUILDERS[id](i));
    body.querySelectorAll('td.row-ctrl').forEach((td) => td.remove());
    const table = body.closest('table');
    if (table) {
      const wrap = h('div.bpd-table');
      table.replaceWith(wrap);
      wrap.append(table);
      wrap.after(h('div.bpd-table-actions', {}, [
        h('button.btn.bpd-add-row', { type: 'button', 'data-bpd': 'add-row', 'data-bpd-table': id, text: '+ Add a row' }),
        h('span.bpd-note', { text: 'Reorder, duplicate or delete rows in the blueprint.' })
      ]));
    }
  }

  section.querySelectorAll('[id]').forEach((el) => {
    el.setAttribute('data-bpd-id', el.id);
    el.id = 'bpd-' + el.id;
  });
  section.querySelectorAll('label[for]').forEach((l) => l.setAttribute('for', 'bpd-' + l.getAttribute('for')));

  fillValues(section, bp, blob);

  if (left) {
    section.append(h('p.bpd-note', { text: 'Part of this step is a table or editor the blueprint page draws itself; it is edited there.' }));
  }
  return section;
}

function fillValues(root, bp, blob) {
  root.querySelectorAll('[data-key]').forEach((el) => {
    const k = el.getAttribute('data-key');
    const has = blob[k] !== undefined;
    if (el.tagName === 'LI') {
      const on = has && !!blob[k];
      el.classList.toggle(bp.checkedClass, on);
      el.setAttribute('aria-checked', on ? 'true' : 'false');
      return;
    }
    if (!has) return;
    if (el.type === 'checkbox') el.checked = bp.tick(blob[k]);
    else el.value = blob[k];
  });
}

function buildDrawer() {
  const box = h('div.bpd-overlay', { hidden: true }, [
    h('div.bpd-scrim', { 'data-bpd': 'close', 'aria-hidden': 'true' }),
    h('aside.bpd', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'bpdTitle', tabindex: '-1' }, [
      h('div.bpd-head', {}, [
        h('div.bpd-head-text', {}, [
          h('p.bpd-eyebrow', { id: 'bpdEyebrow' }),
          h('h2.bpd-title', { id: 'bpdTitle' })
        ]),
        h('button.btn.bpd-close', { type: 'button', 'data-bpd': 'close', 'aria-label': 'Close the blueprint step', text: '✕' })
      ]),
      h('div.bpd-tabs', { role: 'tablist', 'aria-label': 'Blueprint steps for this tool' }),
      h('div.bpd-body', { role: 'tabpanel', 'aria-labelledby': 'bpdTitle' }),
      h('div.bpd-foot', {}, [
        h('span.bpd-saved', { role: 'status', 'aria-live': 'polite' }),
        h('a.btn.bpd-open', { href: '#', text: 'Open in the blueprint →' })
      ])
    ])
  ]);
  document.body.append(box);
  return box;
}

function show(index) {
  if (!current) return;
  flush();
  current.index = index;
  const entry = current.here[index];
  const bp = BLUEPRINTS[current.fmt];
  drawer.querySelector('#bpdEyebrow').textContent = bp.name.toUpperCase() + ' · STEP ' + entry.step.num;
  drawer.querySelector('#bpdTitle').textContent = plainTitle(entry.step);
  const tabs = drawer.querySelector('.bpd-tabs');
  tabs.hidden = current.here.length < 2;
  tabs.replaceChildren(...current.here.map((r, i) => h('button.bpd-tab', {
    type: 'button', role: 'tab', 'data-bpd': 'tab', 'data-bpd-i': String(i),
    'aria-selected': String(i === index), tabindex: i === index ? '0' : '-1',
    text: 'Step ' + r.step.num + ' · ' + plainTitle(r.step)
  })));
  const body = drawer.querySelector('.bpd-body');
  body.replaceChildren(renderBody(entry, current.fmt));
  body.scrollTop = 0;
  drawer.querySelector('.bpd-open').setAttribute('href', bp.page + '#' + entry.step.id);
  drawer.querySelector('.bpd-saved').textContent = '';
}

export function openDrawer(from) {
  const here = stepsHere();
  if (!here.length) return;
  if (!drawer) drawer = buildDrawer();
  opener = from || document.querySelector('.bpd-pill');
  current = { fmt: blueprintFor(), here, index: 0 };
  pending = {};
  show(0);
  drawer.hidden = false;
  document.documentElement.classList.add('bpd-is-open');
  const first = drawer.querySelector('.bpd-body input, .bpd-body textarea, .bpd-body select, .bpd-body li[data-key]');
  (first || drawer.querySelector('.bpd')).focus({ preventScroll: true });
}

export function closeDrawer() {
  if (!drawer || drawer.hidden) return;
  flush();
  drawer.hidden = true;
  document.documentElement.classList.remove('bpd-is-open');
  current = null;
  /* The header may have been redrawn while the drawer was open; the
     pill then is a new element. */
  const back = opener && opener.isConnected ? opener : document.querySelector('.bpd-pill');
  opener = null;
  if (back) back.focus({ preventScroll: true });
}

function focusables() {
  return [...drawer.querySelectorAll('.bpd a[href], .bpd button:not([disabled]), .bpd input:not([disabled]), .bpd select, .bpd textarea, .bpd [tabindex="0"]')]
    .filter((el) => !el.closest('[hidden]') && el.offsetParent !== null);
}

function onKey(e) {
  if (!drawer || drawer.hidden) return;
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeDrawer(); return; }
  if (e.key === 'Tab') {
    const list = focusables();
    if (!list.length) return;
    const first = list[0];
    const last = list[list.length - 1];
    if (e.shiftKey && (document.activeElement === first || !drawer.contains(document.activeElement))) {
      e.preventDefault(); last.focus();
    } else if (!e.shiftKey && (document.activeElement === last || !drawer.contains(document.activeElement))) {
      e.preventDefault(); first.focus();
    }
    return;
  }
  const tab = e.target.closest && e.target.closest('.bpd-tab');
  if (tab && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) {
    e.preventDefault();
    const n = current.here.length;
    const i = (current.index + (e.key === 'ArrowRight' ? 1 : -1) + n) % n;
    show(i);
    const t = drawer.querySelector(`.bpd-tab[data-bpd-i="${i}"]`);
    if (t) t.focus();
  }
}

function toggleCheck(li) {
  const bp = BLUEPRINTS[current.fmt];
  const on = !li.classList.contains(bp.checkedClass);
  li.classList.toggle(bp.checkedClass, on);
  li.setAttribute('aria-checked', on ? 'true' : 'false');
  queue(li.getAttribute('data-key'), on);
  flush();
  said();
}

function said() {
  const s = drawer && drawer.querySelector('.bpd-saved');
  if (s) s.textContent = 'Saved to the blueprint';
}

function onField(e) {
  if (!current || !drawer || !drawer.contains(e.target)) return;
  const el = e.target;
  if (!el.matches('input[data-key], textarea[data-key], select[data-key]')) return;
  const bp = BLUEPRINTS[current.fmt];
  const k = el.getAttribute('data-key');
  queue(k, bp.read(el));
  /* The palette's colour well and its read-only hex mirror are saved
     together on the blueprint (updatePalette() keeps them in step);
     the drawer keeps them in step the same way. */
  const m = /^palette_c\d$/.test(k) && drawer.querySelector(`[data-key="${k}_hex"]`);
  if (m) { m.value = el.value; queue(k + '_hex', el.value); }
  said();
}

let wired = false;
function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  delegate(document, 'click', '[data-bpd]', (e, el) => {
    const act = el.getAttribute('data-bpd');
    if (act === 'open') openDrawer(el);
    else if (act === 'close') closeDrawer();
    else if (act === 'tab') show(+el.getAttribute('data-bpd-i'));
    else if (act === 'add-row' && current) {
      const body = drawer.querySelector('[data-bpd-id="' + el.getAttribute('data-bpd-table') + '"]');
      if (!body) return;
      const id = el.getAttribute('data-bpd-table');
      const row = ROW_BUILDERS[id](body.querySelectorAll('tr').length + 1);
      row.querySelectorAll('td.row-ctrl').forEach((td) => td.remove());
      body.append(row);
      const f = row.querySelector('input, textarea, select');
      if (f) f.focus();
    }
  });
  delegate(document, 'click', '.bpd li[data-key]', (e, li) => { if (current) toggleCheck(li); });
  delegate(document, 'keydown', '.bpd li[data-key]', (e, li) => {
    if (current && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); toggleCheck(li); }
  });
  document.addEventListener('input', onField);
  document.addEventListener('change', onField);
  document.addEventListener('keydown', onKey, true);
  addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  addEventListener('hashchange', () => setTimeout(ensurePill, 0));
  try { Store.subscribe('current:changed', () => { closeDrawer(); ensurePill(); }); } catch (e) { /* ignore */ }

  /* Pages redraw their header (and tabs.js re-applies) after a model
     change; the pill follows. Throttled, and a no-op when the pill
     is already where it belongs, so its own insertion settles it. */
  let queued = false;
  const mo = new MutationObserver((records) => {
    if (queued) return;
    if (drawer && records.every((r) => drawer.contains(r.target))) return;
    queued = true;
    setTimeout(() => { queued = false; ensurePill(); }, 60);
  });
  mo.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden'] });
  ensurePill();
}

/** Mount once per page. Pages with no blueprint step pointing at them
 *  get nothing — not even the observer. */
export function mountBlueprintDrawer() {
  if (typeof document === 'undefined') return;
  const page = pageName();
  if (page === 'feature.html' || page === 'short.html') return;
  const any = ['feature', 'short'].some((f) => stepsHereAnyTab(f, page));
  if (!any) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire);
  else wire();
}

/* Does ANY step (on any tab) point at this page, for either blueprint?
   Decides whether to wire at all. */
function stepsHereAnyTab(fmt, page) {
  return rowsFor(fmt, page).length > 0;
}

if (typeof document !== 'undefined') mountBlueprintDrawer();

export default { mountBlueprintDrawer, openDrawer, closeDrawer, stepsHere };
