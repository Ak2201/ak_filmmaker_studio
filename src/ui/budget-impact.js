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
import { INR } from '../lib/money.js';
import C from '../lib/costs.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Impact from '../lib/schedule-impact.js';

const rs = (n) => (n < 0 ? '−₹ ' : '₹ ') + INR.format(Math.round(Math.abs(n || 0)));
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const stat = (value, text) => h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text })]);

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
    ...LENSES.map((l) => h('a.btn', { href: l.href, title: l.hint, text: l.label }))
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
    out.push(h('div.cx-empty', {}, [h('p', { text: 'No scenes yet. Break the script down and give scenes a shoot day on the stripboard; this tab then works out what the schedule costs.' }),
      h('a.mini-btn', { href: './stripboard.html#stripboard', text: 'GO TO THE STRIPBOARD' })]));
    return out;
  }
  if (!dayCount) {
    out.push(h('div.cx-empty', {}, [h('p', { text: 'None of the ' + plural(scenes.length, 'scene', 'scenes') + ' has a shoot day yet. Assign days on the stripboard and the cost of a day appears here.' }),
      h('a.mini-btn', { href: './stripboard.html#stripboard', text: 'SCHEDULE ON THE STRIPBOARD' })]));
    return out;
  }

  const lines = ctx.lines;
  const { perDay, scalingIds } = Impact.perDayCost(lines, dayCount);
  const unscheduled = scenes.length - days.reduce((n, d) => n + d.scenes.length, 0);
  out.push(h('div.bd-stats', {}, [
    stat(String(dayCount), dayCount === 1 ? 'shoot day' : 'shoot days'),
    stat(String(unscheduled), 'unscheduled'),
    stat(rs(perDay), 'a shoot day costs'),
    stat(plural(scalingIds.length, 'line', 'lines'), 'scale with the shoot'),
    stat(rs(ctx.report.totals.estimate), 'estimate')
  ]));
  if (!perDay) {
    out.push(h('p.cx-hint', { text: 'No estimator line is priced at exactly ' + dayCount + ' days, so no line is taken to scale with the shoot yet. Mark the lines below that do (crew, camera package, transport) and the figures follow.' }));
  }

  // Which lines scale: automatic unless the person says otherwise.
  const scaleRows = lines.filter((l) => l.rate > 0);
  if (scaleRows.length) {
    out.push(h('details.cx-card', {}, [
      h('summary', { text: 'Which lines scale with the shoot · ' + scalingIds.length + ' of ' + scaleRows.length }),
      h('p.cx-hint', { text: 'Automatic takes a line priced at exactly ' + dayCount + ' days as scaling. Override it where that is wrong: a lens package for the whole shoot scales, a one-day stunt does not.' }),
      h('table.scene-table.cx-table', {}, [
        h('thead', {}, [h('tr', {}, ['Line', 'Days', 'Rate', 'Treat as'].map((x) => h('th', { text: x })))]),
        h('tbody', {}, scaleRows.map((l) => {
          const mode = l.scales === true ? 'scales' : l.scales === false ? 'fixed' : '';
          const sel = h('select', { 'data-cx-field': 'line-scales', 'data-id': l.id, 'data-fk': 'sc:' + l.id, 'aria-label': 'Does ' + l.name + ' scale with the shoot' }, [
            h('option', { value: '', text: 'Automatic · ' + (scalingIds.includes(l.id) ? 'scales' : 'fixed') }),
            h('option', { value: 'scales', text: 'Scales with shoot days' }),
            h('option', { value: 'fixed', text: 'Fixed cost' })
          ]);
          sel.value = mode;
          return h('tr', {}, [h('td', { text: l.name }), h('td', { text: String(l.days) }), h('td', { text: rs(l.rate) }), h('td', {}, [sel])]);
        }))
      ])
    ]));
  }

  // The days.
  out.push(h('div.cx-card', {}, [
    h('h3.cx-h3', { text: 'The shoot days' }),
    h('table.scene-table.cx-table', {}, [
      h('thead', {}, [h('tr', {}, ['Day', 'Scenes', 'Pages', 'Day cost'].map((x) => h('th', { text: x })))]),
      h('tbody', {}, days.map((d) => h('tr', {}, [
        h('td', { text: 'Day ' + d.day }), h('td', { text: String(d.scenes.length) }),
        h('td', { text: formatEighths(d.eighths) }), h('td', { text: rs(perDay) })
      ])))
    ])
  ]));

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
    return h('tr', {}, [
      h('td', {}, [h('input', { type: 'checkbox', 'data-cx': 'impact-cut', 'data-id': s.id, 'data-fk': 'cut:' + s.id, checked: cut.has(s.id) ? true : null, 'aria-label': 'Cut ' + sceneName(s) })]),
      h('td', { text: sceneName(s) }), h('td', { text: formatEighths(Number(s.eighths) || 0) }), h('td', { text: note })
    ]);
  });
  out.push(h('div.cx-card', {}, [
    h('h3.cx-h3', { text: 'If we cut…' }),
    h('p.cx-hint', { text: 'Tick scenes. A day is saved only when every scene on it is ticked.' }),
    h('table.scene-table.cx-table', {}, [
      h('thead', {}, [h('tr', {}, ['Cut', 'Scene', 'Pages', 'What it does alone'].map((x) => h('th', { text: x })))]),
      h('tbody', {}, rowsEl)
    ]),
    h('p.cx-result', { role: 'status' }, [
      picked.length
        ? h('strong', { text: plural(picked.length, 'scene', 'scenes') + ' cut: ' + (many.freedDays.length ? 'frees ' + plural(many.freedDays.length, 'day', 'days') + ' (' + many.freedDays.map((d) => 'Day ' + d).join(', ') + '), saving ' + rs(many.saves) + '. Estimate ' + rs(ctx.report.totals.estimate) + ' → ' + rs(projected) + '.' : 'frees no shoot day, so the estimate does not move.') })
        : h('span', { text: 'Nothing ticked.' })
    ]),
    picked.length ? h('button.btn', { type: 'button', 'data-cx': 'impact-clear', 'data-fk': 'cut:clear', text: 'CLEAR' }) : null
  ]));
  return out;
}

/* ============================================================
   VERSIONS
   ============================================================ */
const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toISOString().slice(0, 10); };

function versionCard(v, ctx) {
  const open = compareId === v.id;
  const card = h('article.cx-card.cx-version', { 'data-id': v.id }, [
    h('div.cx-v-head', {}, [
      h('strong', { text: v.name }), h('span.cx-hint', { text: ' locked ' + when(v.lockedAt) }),
      h('span.cx-v-total', { text: rs(v.grand) + (v.days ? ' · ' + plural(v.days, 'day', 'days') : '') })
    ]),
    v.note ? h('p.cx-hint', { text: v.note }) : null,
    h('div.cx-actions', {}, [
      h('button.btn', { type: 'button', 'data-cx': 'version-compare', 'data-id': v.id, 'data-fk': 'v:c:' + v.id, 'aria-expanded': String(open), text: open ? 'HIDE COMPARISON' : 'COMPARE WITH NOW' }),
      h('button.btn.danger', { type: 'button', 'data-cx': 'version-del', 'data-id': v.id, 'data-fk': 'v:d:' + v.id, text: 'DELETE' })
    ])
  ]);
  if (open) {
    const cmp = C.compareVersion(v, ctx.lines);
    const sign = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + rs(Math.abs(n)).replace(/^−/, '');
    card.append(h('div.cx-v-cmp', {}, [
      h('p', {}, [h('strong', { text: 'Estimate then ' + rs(cmp.total.then) + ', now ' + rs(cmp.total.now) + ' — ' + (cmp.total.delta ? sign(cmp.total.delta) : 'no change') + '.' })]),
      cmp.depts.length ? h('table.scene-table.cx-table', {}, [
        h('thead', {}, [h('tr', {}, ['Department', 'Then', 'Now', 'Change'].map((x) => h('th', { text: x })))]),
        h('tbody', {}, cmp.depts.map((d) => h('tr', {}, [h('td', { text: d.label }), h('td', { text: rs(d.then) }), h('td', { text: rs(d.now) }), h('td', { text: d.delta ? sign(d.delta) : '—' })])))
      ]) : null,
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
    out.push(h('div.cx-empty', {}, [h('p', { text: 'No priced lines yet. Price the estimate, then lock a version of it here.' }), h('a.mini-btn', { href: '#estimate', text: 'GO TO THE ESTIMATE' })]));
    return out;
  }
  out.push(h('form.cx-card.cx-form', { 'data-cx-form': 'version' }, [
    h('label.cx-field', {}, [h('span.cx-flabel', { text: 'Name' }), h('input', { name: 'name', type: 'text', placeholder: 'Pre-schedule lock', 'data-fk': 'v:name' })]),
    h('label.cx-field', {}, [h('span.cx-flabel', { text: 'Note' }), h('input', { name: 'note', type: 'text', placeholder: 'Why you are locking it', 'data-fk': 'v:note' })]),
    h('button.btn.primary', { type: 'submit', 'data-fk': 'v:lock', text: 'LOCK THIS BUDGET · ' + rs(ctx.report.totals.estimateWithContingency) })
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
