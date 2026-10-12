/* ============================================================
   ADMIN TAB — Audit log (audit, #audit)
   ------------------------------------------------------------
   Who changed what, and when. One read, admin_list_audit(), keyset-paged
   by `next_before`; the log itself is append-only on the server
   (schema §40) and this tab never writes to it.

   FILTERS map one to one onto the RPC's parameters:
     actor   -> p_actor   (an id, or part of an e-mail)
     action  -> p_action  (a PREFIX: "set_" finds every set_* action)
     target  -> p_target  (an id, "kind:id", or a person's user id)
     from/to -> p_from / p_to (whole days, in this browser's time zone)
   The target filter is also a link: `#audit?target=<id>` (the Overview's
   activity feed, and every row's "Everything about this target").

   TWO VIEWS of the same rows: a timeline, and a table that is the
   accessible fallback. EXPORT CSV is client-side, of exactly the rows
   loaded — nothing the RPC did not return.

   A failed load SAYS WHY with Retry; it never renders an empty list,
   which would read as "nobody did anything".

   Also exported for the Overview: ensureRecent() / recentState() — the
   last 15 rows, loaded once and shared.
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { timeline, diff, dataTable, emptyState, errorState, skeleton, pill, hashParts, absTime } from '../../ui/admin-kit.js';
import { callRpc, humanAction, csvCell } from './rpc.js';

const PAGE = 50;
const BLANK = { actor: '', action: '', target: '', from: '', to: '' };
const S = { f: { ...BLANK }, rows: [], hasMore: false, next: null, phase: 'idle', error: '', view: 'timeline', more: false, at: 0 };
const R = { phase: 'idle', rows: [], error: '', at: 0 };
let ctxRef = null;
let seq = 0;
/* Always asynchronous and coalesced: load() is started from inside render(),
   and a synchronous rerender there would re-enter the page's own render. */
let queued = false;
const again = () => {
  if (queued) return;
  queued = true;
  setTimeout(() => { queued = false; if (ctxRef && ctxRef.rerender) ctxRef.rerender(); }, 0);
};
const filtered = () => Object.values(S.f).some(Boolean);

function argsFor(f, extra) {
  const a = { p_limit: PAGE };
  if (f.actor) a.p_actor = f.actor;
  if (f.action) a.p_action = f.action;
  if (f.target) a.p_target = f.target;
  if (f.from) { const d = new Date(f.from + 'T00:00:00'); if (!Number.isNaN(d.getTime())) a.p_from = d.toISOString(); }
  if (f.to) { const d = new Date(f.to + 'T23:59:59.999'); if (!Number.isNaN(d.getTime())) a.p_to = d.toISOString(); }
  return { ...a, ...(extra || {}) };
}

async function load({ more = false } = {}) {
  const mine = ++seq;
  if (more) S.more = true; else { S.phase = 'loading'; S.error = ''; S.rows = []; S.next = null; S.hasMore = false; }
  again();
  try {
    const out = await callRpc(ctxRef && ctxRef.cloud, 'admin_list_audit', argsFor(S.f, more && S.next ? { p_before: S.next } : null));
    if (mine !== seq) return;
    const rows = Array.isArray(out && out.rows) ? out.rows : [];
    S.rows = more ? S.rows.concat(rows) : rows;
    S.hasMore = !!(out && out.has_more);
    S.next = (out && out.next_before) || null;
    S.phase = 'ok'; S.error = ''; S.at = Date.now();
  } catch (e) {
    if (mine !== seq) return;
    if (!more) S.phase = 'error';
    S.error = e.message || 'The server did not say why.';
  }
  S.more = false;
  again();
}

/* ---- recent rows, for the Overview ------------------------------- */

export function recentState() { return R; }
export async function loadRecent(ctx) {
  if (ctx) ctxRef = ctx;
  if (R.phase === 'loading') return;
  R.phase = 'loading';
  try {
    const out = await callRpc(ctxRef && ctxRef.cloud, 'admin_list_audit', { p_limit: 15 });
    R.rows = Array.isArray(out && out.rows) ? out.rows : [];
    R.phase = 'ok'; R.error = ''; R.at = Date.now();
  } catch (e) { R.phase = 'error'; R.error = e.message || 'The server did not say why.'; }
  again();
}
export function ensureRecent(ctx) { if (R.phase === 'idle') loadRecent(ctx); }
export function reloadRecent(ctx) { R.phase = 'idle'; loadRecent(ctx); }

/** A short line for one audit row, shared with the Overview feed. */
export function rowTitle(r) {
  return h('span', {}, [h('strong', { text: humanAction(r.action) }), ' by ', r.actor_email || (r.actor ? String(r.actor).slice(0, 8) : 'unknown')]);
}
export const rowTarget = (r) => `${r.target_kind || '?'} · ${r.target_id || '?'}`;
export const rowTone = (r) => (/reset|terminate|revoke|delete|refund/i.test(r.action || '') ? 'warn' : null);

/* ---- the hash, the filters --------------------------------------- */

function fromHash() {
  const { tab, params } = hashParts();
  if (tab !== 'audit') return;
  const f = { ...S.f };
  let changed = false;
  for (const k of ['actor', 'action', 'target']) {
    const v = params.get(k);
    if (v !== null && v !== f[k]) { f[k] = v; changed = true; }
  }
  if (changed) { S.f = f; S.phase = 'idle'; }
  if (S.phase === 'idle' && ctxRef) load();
}
function writeFilters() {
  const p = {};
  for (const k of ['actor', 'action', 'target']) if (S.f[k]) p[k] = S.f[k];
  if (ctxRef && ctxRef.go) ctxRef.go('audit', p);
}

/* ---- drawing ------------------------------------------------------ */

function filterForm() {
  const field = (id, name, label, type, ph) => h('div.ad-fld', {}, [
    h('label', { for: id, text: label }),
    h('input', { id, name, type: type || 'text', value: S.f[name] || '', placeholder: ph || null, autocomplete: 'off' })
  ]);
  return h('form.ad-audit-f', { 'data-audit-form': '', role: 'search', 'aria-label': 'Filter the audit log' }, [
    field('adAuditActor', 'actor', 'Actor', 'text', 'e-mail or id'),
    field('adAuditAction', 'action', 'Action starts with', 'text', 'e.g. set_'),
    field('adAuditTarget', 'target', 'Target', 'text', 'id, kind:id or user id'),
    field('adAuditFrom', 'from', 'From', 'date'),
    field('adAuditTo', 'to', 'To', 'date'),
    h('div.ad-fld-b', {}, [
      h('button.btn.primary', { type: 'submit', text: 'APPLY' }),
      h('button.btn', { type: 'button', 'data-action': 'audit-clear', disabled: filtered() ? null : '', text: 'CLEAR' })
    ])
  ]);
}

function rowBody(r) {
  const parts = [h('p.ad-tl-s', {}, [h('code', { text: rowTarget(r) }), r.note ? ' — ' + r.note : ''])];
  if (r.before != null || r.after != null) {
    const d = h('details.ad-audit-d', {}, [h('summary', { text: 'Before and after' }), diff(r.before, r.after)]);
    parts.push(d);
  }
  return h('div.ad-audit-b', {}, parts);
}

function targetButton(r) {
  return h('button.ad-chip', { type: 'button', 'data-action': 'audit-target', 'data-target': r.target_id || '', title: 'Show every row about this target', text: 'Everything about this target' });
}

function timelineView() {
  return timeline(S.rows.map((r) => ({
    at: r.at, tone: rowTone(r), title: rowTitle(r), sub: rowBody(r), target: targetButton(r)
  })));
}

function tableView() {
  return dataTable({
    caption: `${S.rows.length} row${S.rows.length === 1 ? '' : 's'} loaded`,
    columns: [
      { key: 'at', label: 'When', render: (r) => h('time', { datetime: r.at, title: absTime(r.at), text: absTime(r.at) }) },
      { key: 'actor_email', label: 'Actor', render: (r) => r.actor_email || (r.actor ? String(r.actor).slice(0, 8) : '—') },
      { key: 'action', label: 'Action', render: (r) => humanAction(r.action) },
      { key: 'target_id', label: 'Target', render: (r) => rowTarget(r) },
      { key: 'note', label: 'Note' },
      { key: 'x', label: '', render: (r) => targetButton(r) }
    ],
    rows: S.rows,
    empty: emptyState({ title: 'No rows' })
  });
}

export function render(ctx) {
  ctxRef = ctx;
  fromHash();
  if (S.phase === 'idle' && hashParts().tab === 'audit') load();

  const root = h('div.ad-audit', {}, [filterForm()]);
  const tools = h('div.ad-audit-t', {}, [
    h('span.ad-meta', { text: S.phase === 'ok' ? `${S.rows.length} row${S.rows.length === 1 ? '' : 's'} loaded${S.hasMore ? ', more available' : ''}${filtered() ? ' (filtered)' : ''}` : '' }),
    h('span.ad-audit-tt', {}, [
      h('button.ad-chip', { type: 'button', 'data-action': 'audit-view', 'data-view': 'timeline', 'aria-pressed': String(S.view === 'timeline'), text: 'Timeline' }),
      h('button.ad-chip', { type: 'button', 'data-action': 'audit-view', 'data-view': 'table', 'aria-pressed': String(S.view === 'table'), text: 'Table' }),
      h('button.ad-chip', { type: 'button', 'data-action': 'audit-export', disabled: S.rows.length ? null : '', title: 'Download the rows loaded here as CSV', text: 'Export CSV' })
    ])
  ]);
  root.append(tools);

  if (S.phase === 'loading' || S.phase === 'idle') root.append(skeleton({ kind: 'rows', count: 4 }));
  else if (S.phase === 'error') root.append(errorState({ title: 'The audit log could not load', why: S.error, onRetry: () => load() }));
  else if (!S.rows.length) {
    root.append(emptyState({
      title: filtered() ? 'No rows match these filters' : 'No admin action has been recorded yet',
      body: filtered() ? 'Clear a filter to widen the search.' : 'Every admin write lands here, with a before and an after.',
      stamp: 'Checked', icon: '◷',
      action: filtered() ? { label: 'CLEAR FILTERS', onClick: () => clearAll() } : null
    }));
  } else {
    root.append(S.view === 'table' ? tableView() : timelineView());
    if (S.error) root.append(errorState({ title: 'More rows could not load', why: S.error, onRetry: () => load({ more: true }) }));
    if (S.hasMore) root.append(h('div.ad-audit-m', {}, [h('button.btn', { type: 'button', 'data-action': 'audit-more', disabled: S.more ? '' : null, text: S.more ? 'LOADING…' : 'LOAD MORE' })]));
  }
  root.append(h('p.ad-meta', {}, [pill('Append-only', 'neutral', { title: 'The server refuses any update or delete of an audit row' }), ' Times are in this browser’s time zone.']));
  return root;
}

function clearAll() {
  S.f = { ...BLANK };
  load();
  writeFilters();
}

function exportCsv() {
  if (!S.rows.length) return;
  const cols = ['at', 'actor', 'actor_email', 'action', 'target_kind', 'target_id', 'note', 'before', 'after'];
  const lines = [cols.join(',')].concat(S.rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'audit-log-' + new Date().toISOString().slice(0, 10) + '.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* ---- handlers: delegated, once, on document ---------------------- */

delegate(document, 'submit', 'form[data-audit-form]', (e, form) => {
  e.preventDefault();
  const fd = new FormData(form);
  S.f = Object.fromEntries(Object.keys(BLANK).map((k) => [k, String(fd.get(k) || '').trim()]));
  load();
  writeFilters();
});
delegate(document, 'click', '[data-action="audit-clear"]', clearAll);
delegate(document, 'click', '[data-action="audit-more"]', () => load({ more: true }));
delegate(document, 'click', '[data-action="audit-export"]', exportCsv);
delegate(document, 'click', '[data-action="audit-view"]', (e, el) => { S.view = el.dataset.view === 'table' ? 'table' : 'timeline'; again(); });
delegate(document, 'click', '[data-action="audit-target"]', (e, el) => {
  const t = el.dataset.target;
  if (!t) return;
  S.f = { ...BLANK, target: t };
  load();
  writeFilters();
  const top = document.getElementById('audit');
  if (top && top.scrollIntoView) top.scrollIntoView({ block: 'start', behavior: 'instant' });
});
window.addEventListener('hashchange', fromHash);

export function badge() { return null; }
export default { render, badge };
