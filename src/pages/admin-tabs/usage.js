/* ============================================================
   ADMIN TAB — Usage (usage, #usage)
   ------------------------------------------------------------
   Which tools are opened and which features are used, from the daily
   COUNTERS schema §43 keeps (bump_usage, written by src/lib/usage.js).
   admin_usage(p_days) answers; nothing here reads a person.

   WHAT THESE NUMBERS ARE, SAID ON THE PAGE:
     - counts of opens and uses by signed-in people who have not turned
       counting off in Settings -> Privacy. Signed-out use, and anyone who
       opted out, is not in them, so every figure is a FLOOR.
     - "active" is people who sent at least one batch in the last 24 / 48
       hours. A weekly figure is not available BY DESIGN: it would need an
       account id kept for a week, which a counter table exists to avoid.
     - a limit hit records THAT a limit was met and the plan, not which
       limit, and never whose.

   The heat grid sums the per-day counts into weeks (Monday-first, the
   server's days are Asia/Kolkata); the first week may be partial, and its
   label says "from <day>". Every chart is a hand-drawn SVG with a table
   twin (src/ui/admin-charts.js).

   State is module-level; ctx.rerender() redraws. The range picker and
   refresh are delegated on [data-us-*] — no inline handlers.
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { allModules } from '../../lib/navmodel.js';
import { emptyState, errorState, skeleton, kpi, pill, dataTable, absTime, relTime } from '../../ui/admin-kit.js';
import { sparkline, bar, heatGrid } from '../../ui/admin-charts.js';
import { slot, load, reset } from './_rpc.js';

const S = { days: 30, usage: slot(), ctx: null };
const RANGES = [7, 30, 90];
const n = (v) => (Number(v) || 0).toLocaleString();

const FEATURE_LABEL = {
  script_import: 'Script imported', export_pdf: 'PDF exported', export_docx: 'Word file exported',
  ai_call: 'AI request answered', drive_connect: 'Google Drive connected', limit_hit: 'Plan limit met',
  share_created: 'Share link created', screening_pass_used: 'Screening pass used'
};
const PLAN_ORDER = ['free', 'starter', 'indie', 'pro'];
const PLAN_NAME = { free: 'No plan', starter: 'Basic', indie: 'Intermediate', pro: 'Pro' };
const planName = (p) => PLAN_NAME[p] || p;

let _labels = null;
function moduleLabel(id) {
  if (!_labels) { _labels = {}; try { for (const m of allModules()) _labels[m.id] = m.label; } catch (e) { /* the id is the fallback */ } }
  return _labels[id] || id;
}

/** Day strings -> Monday-start weeks: [{ label, idx:[day indexes] }]. */
function weeksOf(days) {
  const out = [];
  let cur = null;
  days.forEach((ds, i) => {
    const d = new Date(ds + 'T00:00:00');
    const monday = new Date(d); monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const key = monday.toISOString().slice(0, 10);
    if (!cur || cur.key !== key) {
      cur = { key, idx: [], label: monday.getDate() + '/' + (monday.getMonth() + 1) };
      out.push(cur);
    }
    cur.idx.push(i);
  });
    return out;
}

const sum = (a) => a.reduce((t, v) => t + (Number(v) || 0), 0);

function rangePicker() {
  return h('div.us-bar', { role: 'group', 'aria-label': 'Range' }, [
    h('span.ad-meta', { text: 'Range' }),
    ...RANGES.map((d) => h('button.ad-chip', { type: 'button', 'data-us-days': String(d), 'aria-pressed': String(S.days === d), text: d + ' days' })),
    h('span.us-spacer'),
    S.usage.phase === 'loading' || S.usage.refreshing ? h('span.ad-meta', { text: 'Counting…' })
      : S.usage.at ? h('span.ad-meta', { title: absTime(S.usage.at), text: 'Counted ' + relTime(S.usage.at) }) : null,
    h('button.btn.ad-refresh', { type: 'button', 'data-us-refresh': '', disabled: S.usage.phase === 'loading' || S.usage.refreshing ? '' : null, text: 'REFRESH' })
  ]);
}

function activeBlock(d) {
  const a = d.active_users || {};
  const events = sum((d.daily_total || []).map((x) => x.events));
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Who is here' }),
    h('div.ad-stats.ad-kpis', {}, [
      kpi({ label: 'Active, last 24 hours', value: n(a.last_24h), title: 'People who sent at least one batch of counts in the last 24 hours' }),
      kpi({ label: 'Active, last 48 hours', value: n(a.last_48h) }),
      kpi({ label: `Counted events, ${S.days} days`, value: n(events) }),
      kpi({ label: 'Counting began', value: d.tracking_began ? new Date(d.tracking_began + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'Not yet' })
    ]),
    h('p.ad-meta', { text: 'A weekly active figure is not available, by design: it would need an account id kept for a week, and these counters keep none. Every figure here counts signed-in people who have not turned counting off, so it is a floor, not the whole audience.' }),
    a.source ? h('p.ad-meta', { text: 'Source: ' + a.source + '.' }) : null
  ]);
}

function heatBlock(d, mods) {
  const weeks = weeksOf(d.days || []);
  const rows = mods.map((m) => moduleLabel(m.id));
  const values = mods.map((m) => weeks.map((w) => sum(w.idx.map((i) => (m.by_day || [])[i]))));
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Opens by module and week' }),
    h('p.ad-meta', { text: 'Darker is more opens. Columns are weeks, labelled by the Monday they start (day/month); the first and last may be partial.' }),
    mods.length ? heatGrid({ rows, cols: weeks.map((w) => w.label), values }, { label: 'Module opens by week', unit: ' opens' })
      : emptyState({ title: 'No modules in the list', body: 'The server returned no module names.' })
  ]);
}

function modulesTable(mods) {
  const cols = [
    { key: 'label', label: 'Module', render: (m) => moduleLabel(m.id), title: (m) => m.name },
    { key: 'opens', label: `Opens (${S.days}d)`, align: 'end', render: (m) => n(m.opens) },
    { key: 'spark', label: 'Trend', render: (m) => sparkline(m.by_day || [], { label: moduleLabel(m.id) + ' opens per day', width: 110, height: 26 }) },
    { key: 'last', label: 'Last opened', render: (m) => (m.last_opened ? new Date(m.last_opened + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' }) : 'never') }
  ];
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Every module' }),
    dataTable({ columns: cols, rows: mods, rowId: (m) => m.id, caption: `${mods.length} modules, most opened first`,
      empty: { title: 'No modules', body: 'Nothing to list.' } })
  ]);
}

function unusedBlock(d, mods) {
  const dead = d.dead_modules || [];
  const began = d.tracking_began ? new Date(d.tracking_began + 'T00:00:00') : null;
  const young = !began || (Date.now() - began.getTime()) < 14 * 86400000;
  const body = [
    h('p.ad-meta', { text: 'Modules with no counted open in the last 14 days. These counts come only from signed-in people who have not turned counting off, so a module listed here may still be used by someone who is not counted.' })
  ];
  if (young) body.push(h('p.ad-meta.us-warn', { text: began ? `Counting began ${began.toLocaleDateString(undefined, { dateStyle: 'medium' })}, under 14 days ago: every quiet module is expected to look unused until then.` : 'Nothing has been counted yet, so every module looks unused.' }));
  body.push(dead.length
    ? h('ul.us-chips', {}, dead.map((id) => h('li.us-chip', { title: 'module_open:' + id, text: moduleLabel(id) })))
    : emptyState({ title: 'Every module was opened', body: 'All modules have at least one counted open in the last 14 days.', stamp: true, icon: '✓' }));
  return h('div.ad-card', {}, [h('h3.ad-card-h', { text: `Unused for 14 days (${dead.length} of ${mods.length})` }), ...body]);
}

function adoptionBlock(d) {
  const feats = (d.features || []).filter((f) => f.name !== 'limit_hit');
  const plans = PLAN_ORDER.filter((p) => feats.some((f) => (f.by_plan || {})[p] != null));
  for (const f of feats) for (const p of Object.keys(f.by_plan || {})) if (!plans.includes(p)) plans.push(p);
  const cols = [
    { key: 'name', label: 'Feature', render: (f) => FEATURE_LABEL[f.name] || f.name },
    { key: 'total', label: `Uses (${S.days}d)`, align: 'end', render: (f) => n(f.total) },
    ...plans.map((p) => ({ key: p, label: planName(p), align: 'end', render: (f) => n((f.by_plan || {})[p] || 0) })),
    { key: 'spark', label: 'Trend', render: (f) => sparkline(f.by_day || [], { label: (FEATURE_LABEL[f.name] || f.name) + ' per day', width: 100, height: 24 }) }
  ];
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Feature use by plan' }),
    h('p.ad-meta', { text: 'How many times each feature was used, split by the plan of the person using it. Uses, not people: one person using a feature ten times is ten.' }),
    dataTable({ columns: cols, rows: feats, rowId: (f) => f.name, caption: `${feats.length} features`, empty: { title: 'No feature names', body: 'The server returned none.' } })
  ]);
}

function limitBlock(d) {
  const f = (d.features || []).find((x) => x.name === 'limit_hit') || { total: 0, by_plan: {} };
  const items = Object.entries(f.by_plan || {}).map(([p, v]) => ({ label: planName(p), value: Number(v) || 0 })).sort((a, b) => b.value - a.value);
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Limit hits, by plan' }),
    h('p.ad-meta', { text: 'How often a plan limit stopped someone, ranked by plan. It records that a limit was met and the plan; not which limit, and not who.' }),
    h('div.ad-kpi-row', {}, [pill(`${n(f.total)} in ${S.days} days`, f.total ? 'warn' : 'neutral'), f.by_day && f.by_day.length > 1 ? sparkline(f.by_day, { label: 'Limit hits per day', width: 140, height: 28 }) : null]),
    items.length ? bar(items, { label: 'Limit hits by plan', unit: '' })
      : emptyState({ title: 'No limit was hit', body: `Nothing counted in the last ${S.days} days.`, stamp: true, icon: '✓' })
  ]);
}

export function render(ctx) {
  S.ctx = ctx;
  load(ctx, S.usage, 'admin_usage', { p_days: S.days }, 'd' + S.days);
  const root = h('div.us-root', {}, [rangePicker()]);
  if (S.usage.phase === 'error') {
    root.append(errorState({ title: 'Usage could not load', why: S.usage.error, onRetry: () => { reset(S.usage); ctx.rerender(); } }));
    return root;
  }
  if (S.usage.phase !== 'ok' || !S.usage.data) { root.append(skeleton({ kind: 'kpi' }), skeleton({ kind: 'block', count: 2 })); return root; }
  const d = S.usage.data;
  const mods = d.modules || [];
  root.append(activeBlock(d), h('div.ad-cols', {}, [unusedBlock(d, mods), limitBlock(d)]), heatBlock(d, mods), modulesTable(mods), adoptionBlock(d));
  return root;
}

delegate(document, 'click', '[data-us-days]', (e, el) => {
  const d = Number(el.dataset.usDays);
  if (!RANGES.includes(d) || d === S.days) return;
  S.days = d;
  if (S.ctx) S.ctx.rerender();
});
delegate(document, 'click', '[data-us-refresh]', () => { reset(S.usage); if (S.ctx) S.ctx.rerender(); });

export default { render };
