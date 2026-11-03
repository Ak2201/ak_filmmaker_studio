/* ============================================================
   AI HISTORY — the list, in the Desk's History tab and on the dashboard
   ------------------------------------------------------------
   docs/AI-FAST-HARNESS.md B6. `mountHistory(el, { compact, filters })`
   draws this project's AI-made items GROUPED BY RUN, newest first, each
   run with its tool, model and time, links to the items, how many have
   changed since, and an Undo when anything in it is unchanged.

   READS ONLY until the Undo is pressed: opening it, filtering it and
   drawing it write nothing (the idle-write check). The Undo asks first
   through dialog.js and says both numbers: how many it took back and
   how many stay because they changed since. It never touches an edited
   item; an append or a rewrite is listed and cannot be undone from here
   (the old value was not stored). After an Undo the page is reloaded:
   a page holds its own copy of the story, the script or the shot list,
   and a later save of that copy would put the undone words back.

   LAZY: the models are imported at the first draw, so nothing here is in
   any page's first paint.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { ask } from './dialog.js';
import { segmented, selectSegment } from './kit/index.js';
import { groupByRun, filterAI, revertPlan, taskName, kindLabel, STAGE_LABELS, STAGE_ORDER } from '../lib/ai-history.js';
import '../styles/ai-history.css';

const SHOWN = 5;
const MODE_WORD = { new: '', fill: 'filled in', append: 'added to', replace: 'rewritten' };

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const stamp = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};

function itemRow(e) {
  const state = e.legacy ? 'earlier draft' : e.edited ? 'changed since' : e.superseded ? 'filled again later' : '';
  return h('li.aih-item', {}, [
    h('a', { href: e.href, text: e.label }),
    h('span.aih-kind', { text: [kindLabel(e.kind), MODE_WORD[e.mode]].filter(Boolean).join(' · ') }),
    state ? h('span.aih-state' + (e.edited ? '.is-edited' : ''), { text: state }) : null
  ]);
}

function runCard(g, labelOf) {
  const name = (g.legacy ? 'Earlier AI drafts — ' : '') + (labelOf(g.task) || taskName(g.task));
  const items = g.items;
  const head = items.slice(0, SHOWN);
  const rest = items.slice(SHOWN);
  const notUndoable = items.filter((e) => e.mode === 'append' || e.mode === 'replace' || e.legacy).length;
  const kids = [
    h('div.aih-run-head', {}, [
      h('h3.aih-run-title', { text: name }),
      h('p.aih-run-meta', { text: [g.model, g.at ? stamp(g.at) : '', plural(g.count, 'item', 'items'),
        g.edited ? g.edited + ' changed since' : ''].filter(Boolean).join(' · ') })
    ]),
    h('ul.aih-items', {}, head.map(itemRow))
  ];
  if (rest.length) {
    kids.push(h('details.aih-more-d', {}, [
      h('summary', { text: 'and ' + plural(rest.length, 'more', 'more') }),
      h('ul.aih-items', {}, rest.map(itemRow))
    ]));
  }
  const act = [];
  if (g.undoable) {
    act.push(h('button.btn.k-btn.k-btn--secondary', {
      type: 'button', 'data-action': 'ai-hist-undo', 'data-run': g.run || '', 'data-task': g.run ? '' : g.task,
      text: 'Undo ' + g.undoable
    }));
  }
  if (notUndoable) {
    act.push(h('p.aih-note', { text: plural(notUndoable, 'item was', 'items were') + ' added to or rewritten, so '
      + (notUndoable === 1 ? 'it cannot' : 'they cannot') + ' be undone from here.' }));
  }
  if (act.length) kids.push(h('div.aih-actions', {}, act));
  return h('li.aih-run', { 'data-run': g.run || '' }, kids);
}

/** Draw the history into `el`. Returns { refresh() }.
    opts { compact, filters, labelOf(task) → string, reload() }. */
export function mountHistory(el, opts = {}) {
  const labelOf = typeof opts.labelOf === 'function' ? opts.labelOf : () => '';
  const state = { stage: '', task: '', entries: [], loaded: false };
  const root = h('div.aih' + (opts.compact ? '.is-compact' : ''), { 'data-aih': '' });
  const filters = h('div.aih-filters');
  const list = h('ul.aih-runs');
  const status = h('p.aih-status', { role: 'status', hidden: true });
  root.append(...(opts.filters ? [filters] : []), status, list);
  el.replaceChildren(root);

  const drawFilters = () => {
    if (!opts.filters) return;
    const stages = STAGE_ORDER.filter((s) => state.entries.some((e) => e.stage === s));
    const tasks = [...new Set(filterAI(state.entries, { stage: state.stage || undefined }).map((e) => e.task))];
    const seg = segmented({ name: 'aih-stage', label: 'Filter by stage', value: state.stage, action: 'ai-hist-stage',
      options: [{ value: '', label: 'All' }, ...stages.map((s) => ({ value: s, label: STAGE_LABELS[s] }))] });
    const sel = h('select.aih-task', { 'aria-label': 'Filter by tool', 'data-action': 'ai-hist-task' },
      [h('option', { value: '', text: 'All tools' }), ...tasks.map((t) => h('option', { value: t, text: labelOf(t) || taskName(t) }))]);
    sel.value = tasks.includes(state.task) ? state.task : '';
    filters.replaceChildren(seg, sel);
    selectSegment(seg, state.stage);
  };

  const draw = () => {
    const shown = filterAI(state.entries, { stage: state.stage || undefined, task: state.task || undefined });
    const groups = groupByRun(shown);
    list.replaceChildren(...(groups.length
      ? groups.map((g) => runCard(g, labelOf))
      : [h('li.aih-empty', { text: state.entries.length
        ? 'Nothing matches that filter.' : 'Nothing in this film was drafted by AI yet.' })]));
  };

  async function refresh() {
    try {
      const { readProjectAI } = await import('../lib/ai-history-read.js');
      state.entries = readProjectAI();
    } catch (e) {
      state.entries = [];
      status.hidden = false;
      status.textContent = 'The history could not be read.';
    }
    state.loaded = true;
    drawFilters();
    draw();
  }

  delegate(root, 'click', '[data-action="ai-hist-stage"]', (e, btn) => {
    state.stage = btn.dataset.value || '';
    state.task = '';
    drawFilters();
    draw();
  });
  delegate(root, 'change', '[data-action="ai-hist-task"]', (e, sel) => { state.task = sel.value; draw(); });

  delegate(root, 'click', '[data-action="ai-hist-undo"]', async (e, btn) => {
    const run = btn.dataset.run || '';
    const group = groupByRun(state.entries).find((g) => (run ? g.run === run : (!g.run && g.task === btn.dataset.task)));
    if (!group) return;
    const plan = revertPlan(group.items);
    const n = plan.remove.length + plan.blank.length;
    if (!n) return;
    const stay = plan.kept;
    const cannot = plan.notUndoable + plan.held;
    const body = [
      stay ? plural(stay, 'item you have changed stays', 'items you have changed stay') + ' as ' + (stay === 1 ? 'it is.' : 'they are.') : '',
      cannot ? plural(cannot, 'item', 'items') + ' cannot be undone from here and ' + (cannot === 1 ? 'stays' : 'stay') + ' as ' + (cannot === 1 ? 'it is.' : 'they are.') : ''
    ].filter(Boolean).join(' ');
    const yes = await ask({ title: 'Undo ' + plural(n, 'AI-written item', 'AI-written items') + ' from this run?', body, confirm: 'Undo', cancel: 'Keep them' });
    if (!yes) return;
    btn.disabled = true;
    try {
      const { revertEntries } = await import('../lib/ai-history-revert.js');
      const r = revertEntries(group.items);
      status.hidden = false;
      status.textContent = 'Undid ' + plural(r.reverted, 'item', 'items') + '. ' + (r.kept ? plural(r.kept, 'item', 'items') + ' stayed because ' + (r.kept === 1 ? 'it was' : 'they were') + ' changed since. ' : '')
        + 'Reloading the page so it matches.';
      await refresh();
      status.hidden = false;
      const reload = typeof opts.reload === 'function' ? opts.reload : () => { window.location.reload(); };
      window.setTimeout(reload, 1400);
    } catch (err) {
      btn.disabled = false;
      status.hidden = false;
      status.textContent = 'Nothing was undone: ' + String((err && err.message) || 'the history could not be written').slice(0, 140);
    }
  });

  refresh();
  return { refresh };
}

export default { mountHistory };
