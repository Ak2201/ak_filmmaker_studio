/* ============================================================
   THE GUIDE DRAWER'S HEAVY HALF — the full step records and the
   renderer that draws one inside the drawer
   ------------------------------------------------------------
   src/ui/blueprint-drawer.js (the pill, the dialog, the save path)
   reaches this module through `import()` the first time a pill is
   clicked. Everything that needs both blueprints' step JSON lives
   here, so a module page that shows a pill and never opens it never
   downloads the blueprints: the pill is labelled from the build-time
   index (`virtual:fms-step-index`, see vite.config.js), and the
   records with their blocks and fields arrive with this chunk.

   ONE RENDERER, ONE BLOB, ONE SAVE PATH — unchanged. The fields come
   out of renderStep() in src/ui/steps.js, the same function the
   blueprint page draws them with, so every control carries the
   data-key the blueprint reads back; the four tables' rows come from
   src/ui/blueprint-rows.js. Reading and writing the blob stays in the
   light half; this module is handed the blob and returns a section.

   The namespaces and the order match the index: vol1 and vol2 are
   `feature`, production and post are `production`, the short's steps
   are `short`.
   ============================================================ */
import { h } from '../lib/dom.js';
import STEPS from '../data/steps.feature.json';
import PROD from '../data/steps.production.json';
import SHORT from '../data/steps.short.json';
import { renderStep } from './steps.js';
import { ROW_BUILDERS, ROW_PREFIX } from './blueprint-rows.js';

/* Blocks the drawer draws. The rest stay on the blueprint (see the
   header of blueprint-drawer.js). `raw` is filtered further below. */
const KEEP = new Set(['formula', 'hint', 'asks', 'check', 'raw']);
const TABLE_IDS = Object.keys(ROW_BUILDERS);
const MIN_ROWS = 3;

let FULL = null;
function index() {
  if (FULL) return FULL;
  FULL = new Map();
  const put = (ns, list) => { for (const step of list || []) FULL.set(ns + ':' + step.id, step); };
  put('feature', STEPS.vol1);
  put('feature', STEPS.vol2);
  put('production', PROD.production);
  put('production', PROD.post);
  put('short', SHORT.steps);
  return FULL;
}

/** The complete step record for `<ns>:<id>`, or null. */
export function fullStep(ns, id) {
  return index().get(ns + ':' + id) || null;
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

/** A table row for the drawer: the shared builder's row, minus the
 *  reorder/duplicate/delete cell the blueprint page owns. */
export function buildRow(id, n) {
  const row = ROW_BUILDERS[id](n);
  row.querySelectorAll('td.row-ctrl').forEach((td) => td.remove());
  return row;
}

/**
 * The drawer's body for one step: `entry` is `{ ns, step }` (the step
 * may be the index's light record — the full one is looked up here),
 * `bp` the blueprint spec (key, checkedClass, tick) and `blob` the
 * blueprint's stored values.
 */
export function renderBody(entry, bp, blob) {
  const step = fullStep(entry.ns, entry.step.id) || entry.step;
  const { blocks, left } = filterBlocks(step);
  const section = renderStep({ ...step, blocks, badge: null }, null, entry.ns);
  section.classList.add('bpd-step');
  section.querySelectorAll('.st-stage-row, .st-why, .row-actions, .step-badge').forEach((el) => el.remove());

  /* No inline handlers on a module page (the CSP would refuse them
     and verify counts them), and no id that could collide with the
     page's own. */
  section.querySelectorAll('*').forEach((el) => {
    for (const a of [...el.attributes]) if (/^on/i.test(a.name)) el.removeAttribute(a.name);
  });

  /* The tables: rows from the shared builders, as many as are saved. */
  for (const id of TABLE_IDS) {
    const body = section.querySelector('#' + id);
    if (!body) continue;
    const prefix = ROW_PREFIX[id];
    const re = new RegExp('^' + prefix + '_(\\d+)_');
    let count = 0;
    Object.keys(blob).forEach((k) => { const m = k.match(re); if (m) count = Math.max(count, +m[1]); });
    const n = Math.max(count, MIN_ROWS);
    for (let i = 1; i <= n; i++) body.append(buildRow(id, i));
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

export default { fullStep, renderBody, buildRow };
