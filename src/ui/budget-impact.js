/* ============================================================
   SCHEDULE IMPACT AND BUDGET VERSIONS — two tabs of the budget
   ------------------------------------------------------------
   Script, schedule and budget move together; until now the only
   thread between the last two was a button that copied a day count
   into the estimator once. These two tabs make the link visible
   without storing a second copy of anything:

     #schedule  what a shoot day costs, which estimator lines scale
                with the shoot length, and a what-if: tick scenes to
                cut and see the days that actually disappear.
     #versions  lock the budget as it stands, then compare any later
                state to it.

   SCHEDULE IMPACT STORES NOTHING (src/lib/schedule-impact.js is pure;
   which scenes are ticked is module state for this visit). The only
   write is the per-line "scales with shoot days" setting, which lives
   in the costs blob beside the line's department. VERSIONS are the
   one thing stored, as snapshots inside that same blob.

   A SAVING IS NOT A SHARE. Cutting one scene of three on a day saves
   nothing — the day still shoots. The table says so, and shows the
   apportioned share of that day's cost separately and labelled as a
   share, because a figure that reads like a saving and is not one is
   how a schedule gets cut for money that was never there.

   THE ROLE LENS IS A SHORTCUT, NOT A PERMISSION. Producer, line
   producer and first AD each start somewhere different; the buttons
   jump to that tab. Nothing is hidden from anybody.
   ============================================================ */
import { h } from '../lib/dom.js';
/* rs prints in the budget's own currency (budget-costs-model.js); it was a
   second copy of the rupee formatter here, which a dollar budget exposed. */
import { rs } from '../lib/budget-costs-model.js';
import C from '../lib/costs.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Impact from '../lib/schedule-impact.js';
import { button, statCard, statStrip, emptyState } from './kit/index.js';

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const stat = (value, text) => statCard({ label: text, value });
/* Kit builders, local to these two tabs: a panel, a kit table in its
   scrolling frame, an empty state with its route. */
function card(spec, attrs, title, children, meta) {
  const el = h(spec, attrs);
  el.classList.add('cx-card', 'k-panel');
  if (title) el.append(h('div.k-panel-head', {}, [h('h3.cx-h3.k-panel-title', { text: title }), meta ? h('div.k-panel-meta', {}, [].concat(meta)) : null]));
  el.append(h('div.k-panel-body.cx-card-body', {}, children));
  return el;
}
const ktable = (cols, rows, numFrom) => h('div.cx-scroll.k-table-wrap', {}, [h('table.cx-table.k-table', {}, [
  h('thead', {}, [h('tr', {}, cols.map((x, i) => h('th', { scope: 'col', class: i >= numFrom ? 'num k-num' : null, text: x })))]),
  h('tbody', {}, rows)
])]);
const numTd = (text) => h('td.num.k-num.k-mono', { text });
const empty = (text, href, cta) => emptyState({ class: 'cx-empty', icon: 'inbox', body: text, actions: [button({ label: cta, href, size: 'sm', icon: 'arrow_forward' })] });

let host = { refresh: () => {}, toast: () => {} };
const cut = new Set();          // scene ids ticked for the what-if; this visit only
let compareId = '';             // the version being compared to now; this visit only

export function bindImpact(api) { host = { ...host, ...api }; }

function scenesNow() {
  try { return Scenes.listScenes(); } catch (e) { return []; }
}
const sceneName = (s) => (s.number ? 'Sc ' + s.number + ' · ' : '') + ([s.intExt, s.location, s.dayNight].filter(Boolean).join(' · ') || 'Scene');

/* ---- the lens ---------------------------------------------------- */
const LENSES = [
  { id: 'producer', label: 'Producer', href: '#topsheet', hint: 'Top sheet: above and below the line, contingency, grand total' },
  { id: 'lp', label: 'Line producer', href: '#actuals', hint: 'Cost report: estimate against spend, line by line' },
  { id: 'ad', label: '1st AD', href: '#schedule', hint: 'Schedule impact: days, pages and what a cut really saves' }
];
function lensRow() {
  return h('p.cx-lens', {}, [
    h('span.cx-flabel', { text: 'Start where you work' }),
    ...LENSES.map((l) => button({ label: l.label, href: l.href, title: l.hint, size: 'sm', variant: 'ghost' }))
  ]);
}

/* ============================================================
   SCHEDULE IMPACT
   ============================================================ */
export function renderSchedule(ctx) {
  const scenes = scenesNow();
  const days = Impact.scheduleDays(scenes);
  const dayCount = days.length;
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Schedule impact' }),
    h('p.cx-deck', { text: 'What a shoot day costs, worked from the lines you priced per day, and what cutting a scene would really save. Nothing here is stored except which lines you mark as scaling with the shoot.' }),
    lensRow()
  ])];

  if (!scenes.length) {
    out.push(empty('No scenes yet. Break the script down and give scenes a shoot day on the stripboard; this tab then works out what the schedule costs.',
      './stripboard.html#stripboard', 'Go to the stripboard'));
    return out;
  }
  if (!dayCount) {
    out.push(empty((scenes.length === 1 ? 'The scene has no shoot day yet.' : 'None of the ' + scenes.length + ' scenes have a shoot day yet.')
      + ' Assign days on the stripboard and the cost of a day appears here.',
      './stripboard.html#stripboard', 'Schedule on the stripboard'));
    return out;
  }

  const lines = ctx.lines;
  const { perDay, scalingIds } = Impact.perDayCost(lines, dayCount);
  const unscheduled = scenes.length - days.reduce((n, d) => n + d.scenes.length, 0);
  out.push(statStrip([
    stat(String(dayCount), dayCount === 1 ? 'shoot day' : 'shoot days'),
    stat(String(unscheduled), 'unscheduled'),
    stat(rs(perDay), 'a shoot day costs'),
    stat(plural(scalingIds.length, 'line', 'lines'), 'scale with the shoot'),
    stat(rs(ctx.report.totals.estimate), 'estimate')
  ], { class: 'cx-stats' }));
  if (!perDay) {
    out.push(h('p.cx-hint', { text: 'No estimator line is priced at exactly ' + dayCount + ' days, so no line is taken to scale with the shoot yet. Mark the lines below that do (crew, camera package, transport) and the figures follow.' }));
  }

  // Which lines scale: automatic unless the person says otherwise.
  const scaleRows = lines.filter((l) => l.rate > 0);
  if (scaleRows.length) {
    out.push(h('details.cx-card.cx-more.k-panel.cx-scales', {}, [
      h('summary', { text: 'Which lines scale with the shoot · ' + scalingIds.length + ' of ' + scaleRows.length }),
      h('div.k-panel-body.cx-card-body', {}, [
        h('p.cx-hint', { text: 'Automatic takes a line priced at exactly ' + dayCount + ' days as scaling. Override it where that is wrong: a lens package for the whole shoot scales, a one-day stunt does not.' }),
        ktable(['Line', 'Days', 'Rate', 'Treat as'], scaleRows.map((l) => {
          const mode = l.scales === true ? 'scales' : l.scales === false ? 'fixed' : '';
          const sel = h('select', { 'data-cx-field': 'line-scales', 'data-id': l.id, 'data-fk': 'sc:' + l.id, 'aria-label': 'Does ' + l.name + ' scale with the shoot' }, [
            h('option', { value: '', text: 'Automatic · ' + (scalingIds.includes(l.id) ? 'scales' : 'fixed') }),
            h('option', { value: 'scales', text: 'Scales with shoot days' }),
            h('option', { value: 'fixed', text: 'Fixed cost' })
          ]);
          sel.value = mode;
          return h('tr', {}, [h('th', { scope: 'row', text: l.name }), numTd(String(l.days)), numTd(rs(l.rate)), h('td', {}, [h('div.k-control.k-select', {}, [sel])])]);
        }), 1)
      ])
    ]));
  }

  // The days.
  out.push(card('div.cx-days', {}, 'The shoot days', [
    ktable(['Day', 'Scenes', 'Pages', 'Day cost'], days.map((d) => h('tr', {}, [
      h('th.k-mono', { scope: 'row', text: 'Day ' + d.day }), numTd(String(d.scenes.length)),
      numTd(formatEighths(d.eighths)), numTd(rs(perDay))
    ])), 1)
  ], h('span.k-mono', { text: plural(dayCount, 'day', 'days') })));

  // The what-if.
  const all = Impact.whatIfAll(scenes, perDay);
  const byId = new Map(all.map((w) => [w.sceneId, w]));
  const picked = [...cut].filter((id) => byId.has(id));
  const many = Impact.whatIfCutMany(picked, scenes, perDay);
  const projected = Impact.projectedEstimate({ estimate: ctx.report.totals.estimate, perDay, fromDays: dayCount, toDays: dayCount - many.freedDays.length });
  const rowsEl = scenes.map((s) => {
    const w = byId.get(s.id);
    const note = !w.day ? 'not scheduled'
      : w.freesDay ? 'frees Day ' + w.day + ' — saves ' + rs(w.saves)
      : 'Day ' + w.day + ' still shoots (' + plural(w.othersOnDay, 'other scene', 'other scenes') + ') — a share of ' + rs(w.apportioned) + ', not a saving';
    return h('tr', { class: cut.has(s.id) ? 'is-cut' : null }, [
      h('td', {}, [h('label.k-check', {}, [h('input', { type: 'checkbox', 'data-cx': 'impact-cut', 'data-id': s.id, 'data-fk': 'cut:' + s.id, checked: cut.has(s.id) ? true : null, 'aria-label': 'Cut ' + sceneName(s) })])]),
      h('td', { text: sceneName(s) }), numTd(formatEighths(Number(s.eighths) || 0)), h('td', { text: note })
    ]);
  });
  out.push(card('div.cx-cut', {}, 'If we cut…', [
    h('p.cx-hint', { text: 'Tick scenes. A day is saved only when every scene on it is ticked.' }),
    h('div.cx-scroll.k-table-wrap', {}, [h('table.cx-table.k-table', {}, [
      h('thead', {}, [h('tr', {}, ['Cut', 'Scene', 'Pages', 'What it does alone'].map((x, i) => h('th', { scope: 'col', class: i === 2 ? 'num k-num' : null, text: x })))]),
      h('tbody', {}, rowsEl)
    ])]),
    h('p.cx-result', { role: 'status' }, [
      picked.length
        ? h('strong', { text: plural(picked.length, 'scene', 'scenes') + ' cut: ' + (many.freedDays.length ? 'frees ' + plural(many.freedDays.length, 'day', 'days') + ' (' + many.freedDays.map((d) => 'Day ' + d).join(', ') + '), saving ' + rs(many.saves) + '. Estimate ' + rs(ctx.report.totals.estimate) + ' → ' + rs(projected) + '.' : 'frees no shoot day, so the estimate does not move.') })
        : h('span', { text: 'Nothing ticked.' })
    ]),
    picked.length ? h('div.cx-actions', {}, [button({ label: 'Clear', icon: 'close', size: 'sm', attrs: { 'data-cx': 'impact-clear', 'data-fk': 'cut:clear' } })]) : null
  ]));
  return out;
}

/* ============================================================
   VERSIONS
   ============================================================ */
const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10); };

function versionCard(v, ctx) {
  const open = compareId === v.id;
  const card = h('article.cx-card.cx-version.k-panel', { 'data-id': v.id }, [
    h('div.cx-v-head.k-panel-head', {}, [
      h('strong.k-panel-title', { text: v.name }), h('span.cx-hint.k-mono', { text: ' locked ' + when(v.lockedAt) }),
      h('span.cx-v-total.k-mono', { text: rs(v.grand) + (v.days ? ' · ' + plural(v.days, 'day', 'days') : '') })
    ])
  ]);
  const body = h('div.k-panel-body.cx-card-body', {}, [
    v.note ? h('p.cx-hint', { text: v.note }) : null,
    h('div.cx-actions', {}, [
      button({ label: open ? 'Hide comparison' : 'Compare with now', icon: 'sync_alt', size: 'sm', attrs: { 'data-cx': 'version-compare', 'data-id': v.id, 'data-fk': 'v:c:' + v.id, 'aria-expanded': String(open) } }),
      button({ label: 'Delete', icon: 'delete', size: 'sm', variant: 'danger', attrs: { 'data-cx': 'version-del', 'data-id': v.id, 'data-fk': 'v:d:' + v.id } })
    ])
  ]);
  card.append(body);
  if (open) {
    const cmp = C.compareVersion(v, ctx.lines, ctx.report.totals.estimateWithContingency);
    const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + rs(Math.abs(n)).replace(/^−/, '');
    body.append(h('div.cx-v-cmp', {}, [
      h('p', {}, [h('strong', { text: 'Estimate then ' + rs(cmp.total.then) + ', now ' + rs(cmp.total.now) + ' — ' + (cmp.total.delta ? sign(cmp.total.delta) : 'no change') + '.' })]),
      cmp.grand && cmp.grand.delta ? h('p', {}, [h('strong', { text: 'With contingency then ' + rs(cmp.grand.then) + ', now ' + rs(cmp.grand.now) + ' — ' + sign(cmp.grand.delta) + '.' })]) : null,
      cmp.depts.length ? ktable(['Department', 'Then', 'Now', 'Change'], cmp.depts.map((d) => h('tr', {}, [
        h('th', { scope: 'row', text: d.label }), numTd(rs(d.then)), numTd(rs(d.now)), numTd(d.delta ? sign(d.delta) : '—')
      ])), 1) : null,
      cmp.lines.added.length ? h('p.cx-hint', { text: 'Added since: ' + cmp.lines.added.map((l) => l.name).join(', ') }) : null,
      cmp.lines.removed.length ? h('p.cx-hint', { text: 'Removed since: ' + cmp.lines.removed.map((l) => l.name).join(', ') }) : null,
      cmp.lines.changed.length ? h('p.cx-hint', { text: 'Repriced: ' + cmp.lines.changed.map((l) => l.name + ' (' + sign(l.delta) + ')').join(', ') }) : null
    ].filter(Boolean)));
  }
  return card;
}

export function renderVersions(ctx) {
  const out = [h('div.cx-intro', {}, [
    h('h2.cx-h2', { text: 'Versions' }),
    h('p.cx-deck', { text: 'Lock the budget as it stands — before a schedule change, before the financier sees it — and compare any later state against it. A locked version never changes; delete it if you no longer want it.' }),
    lensRow()
  ])];
  if (!ctx.lines.length) {
    out.push(empty('No priced lines yet. Price the estimate, then lock a version of it here.', '#estimate', 'Go to the estimate'));
    return out;
  }
  const inp = (name, placeholder, fk) => h('div.k-control', {}, [h('input.k-input', { name, type: 'text', placeholder, 'data-fk': fk })]);
  out.push(card('form.cx-form', { 'data-cx-form': 'version' }, 'Lock a version', [
    h('div.cx-quick-row', {}, [
      h('label.cx-field.k-field', {}, [h('span.cx-flabel.k-field-label', { text: 'Name' }), inp('name', 'Pre-schedule lock', 'v:name')]),
      h('label.cx-field.k-field', {}, [h('span.cx-flabel.k-field-label', { text: 'Note' }), inp('note', 'Why you are locking it', 'v:note')])
    ]),
    h('div.cx-actions', {}, [
      button({ label: 'Lock this budget · ' + rs(ctx.report.totals.estimateWithContingency), icon: 'lock', variant: 'primary', pill: true, type: 'submit', attrs: { 'data-fk': 'v:lock' } })
    ])
  ]));
  const list = C.listVersions();
  if (!list.length) out.push(h('p.cx-hint', { text: 'Nothing locked yet.' }));
  list.slice().reverse().forEach((v) => out.push(versionCard(v, ctx)));
  return out;
}

/* ---- actions and forms, merged into budget-costs.js ------------- */

export const impactActions = {
  'impact-cut': (el) => { if (cut.has(el.dataset.id)) cut.delete(el.dataset.id); else cut.add(el.dataset.id); host.refresh(); },
  'impact-clear': () => { cut.clear(); host.refresh(); },
  'version-compare': (el) => { compareId = compareId === el.dataset.id ? '' : el.dataset.id; host.refresh(); },
  'version-del': (el) => {
    const list = C.listVersions();
    const index = list.findIndex((x) => x.id === el.dataset.id);
    const gone = list[index];
    if (!gone) return;
    C.removeVersion(gone.id);
    if (compareId === gone.id) compareId = '';
    host.refresh();
    host.toast('Deleted “' + gone.name + '”.', { action: 'UNDO', onAction: () => { C.restoreVersion(gone, index); host.refresh(); } });
  }
};

export const impactForms = {
  version(form, ctx) {
    const f = new FormData(form);
    const days = Impact.scheduleDays(scenesNow()).length;
    const snapshot = C.snapshotBudget({ lines: ctx.lines, report: ctx.report, days });
    const v = C.lockVersion({ name: String(f.get('name') || '').trim(), note: String(f.get('note') || '').trim(), snapshot });
    host.refresh();
    host.toast('Locked “' + v.name + '” at ' + rs(v.grand) + '.', { type: 'success' });
  }
};
