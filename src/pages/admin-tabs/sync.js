/* ============================================================
   ADMIN TAB — Sync & storage (sync, #sync)
   ------------------------------------------------------------
   How fresh each account's sync is, how much it stores, whether the
   client and the database agree about which kinds of data may be saved,
   what refused writes the clients have reported, and who is near a plan
   limit. Reads admin_sync_overview() and admin_limit_pressure() (schema
   §44); changes nothing.

   THE SCOPE DIFF is the point of this tab. The §37 incident was the
   client mapping a scope (`write_goals`) the database's CHECK still
   refused, so every save answered 23514 and queued — code ahead of the
   database. This tab compares the scope names the CLIENT can write (the
   keys of StudioCloud.KEY_BY_SCOPE, read from the code that is running)
   with the scopes the project_data CHECK ALLOWS (read from pg_constraint
   by the RPC), and says so loudly when the client is ahead.

   LIMIT PRESSURE IS A REPORT. There is no "send an upgrade nudge" button:
   the owner decided on 12 Oct 2026 that the console sends no mail. The
   `enforced` flag is shown as the server gave it (it is
   purchases_required()); and storage has no enforcement at all today, so
   it is labelled a heads-up.

   An account row opens the customer drawer: ctx.go('people', {user}).
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { emptyState, errorState, skeleton, kpi, pill, meter, dataTable, absTime, relTime } from '../../ui/admin-kit.js';
import { sparkline, bar } from '../../ui/admin-charts.js';
import { slot, load, reset } from './_rpc.js';
import { n } from '../../lib/admin-format.js';
import { fmtBytes, METRIC, CODE, clientScopes as scopesOf, scopeDiff as diffScopes, syncBuckets, refusalsByCode, refusalsPerDay, metersOver } from '../../lib/admin-sync-model.js';

export { fmtBytes };

const S = { overview: slot(), pressure: slot(), ctx: null };

/** The scope names the running client can write. */
function clientScopes(ctx) {
  return scopesOf((ctx.cloud && ctx.cloud.KEY_BY_SCOPE) || {});
}

function head() {
  const busy = S.overview.phase === 'loading' || S.pressure.phase === 'loading' || S.overview.refreshing || S.pressure.refreshing;
  return h('div.us-bar', {}, [
    h('span.us-spacer'),
    busy ? h('span.ad-meta', { text: 'Checking…' })
      : S.overview.at ? h('span.ad-meta', { title: absTime(S.overview.at), text: 'Checked ' + relTime(S.overview.at) }) : null,
    h('button.btn.ad-refresh', { type: 'button', 'data-sy-refresh': '', disabled: busy ? '' : null, text: 'Refresh' })
  ]);
}

function scopeDiff(ctx, d) {
  const { client, allowed, ahead, unknownToClient, inUseBad, reportBad } = diffScopes(clientScopes(ctx), d);
  const card = h('div.ad-card' + (ahead.length ? '.us-alarm' : ''), {}, [h('h3.ad-card-h', { text: 'Client and database agree on scopes?' })]);
  if (!allowed.length) {
    card.append(errorState({ title: 'The database did not list its allowed scopes', why: 'admin_sync_overview() returned no scopes from the project_data CHECK constraint, so the comparison cannot be made.' }));
    return card;
  }
  if (ahead.length) {
    card.append(h('div.us-loud', { role: 'alert' }, [
      h('p.us-loud-h', { text: 'Client ahead of database' }),
      h('p', { text: `This build can save ${ahead.length === 1 ? 'a kind of data' : ahead.length + ' kinds of data'} that the database refuses: ${ahead.join(', ')}. Every save of ${ahead.length === 1 ? 'it' : 'them'} fails (23514) and waits in the person's queue. Run the schema section that widens the project_data scope CHECK before this build goes live.` })
    ]));
  } else {
    card.append(h('p.ad-meta', {}, [pill('In step', 'ok', { dot: true }), ` All ${client.length} scopes this build can save are allowed by the database.`]));
  }
  if (inUseBad.length) card.append(h('p.ad-meta.us-warn', { text: 'Rows already stored under a scope the CHECK no longer lists: ' + inUseBad.join(', ') + '.' }));
  if (reportBad.length) card.append(h('p.ad-meta.us-warn', { text: 'The error counter lists scopes the CHECK does not allow: ' + reportBad.join(', ') + '.' }));
  card.append(h('p.ad-meta', { text: `Client: ${client.length} scopes (read from the code running in this tab). Database CHECK: ${allowed.length}.` + (unknownToClient.length ? ` The database also allows ${unknownToClient.join(', ')}, which this build does not save.` : '') }));
  return card;
}

function bucketsBlock(d) {
  const items = syncBuckets(d);
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'When did members last sync?' }),
    h('p.ad-meta', { text: `${n(d.members)} active members, by the newest save that reached their account. "Never synced" includes people who simply work on one device.` }),
    bar(items, { label: 'Members by last sync' })
  ]);
}

function topAccounts(ctx, d) {
  const rows = d.top_accounts || [];
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Largest accounts' }),
    dataTable({
      caption: `Top ${rows.length} by stored size. Open a row for the customer.`, rows, rowId: (r) => r.user_id,
      onActivate: (r) => ctx.go('people', { user: r.user_id }),
      columns: [
        { key: 'email', label: 'Account', render: (r) => r.email || r.user_id },
        { key: 'films', label: 'Films', align: 'end', render: (r) => n(r.films) },
        { key: 'rows', label: 'Rows', align: 'end', render: (r) => n(r.rows) },
        { key: 'bytes', label: 'Stored', align: 'end', render: (r) => fmtBytes(r.bytes) },
        { key: 'last', label: 'Last sync', render: (r) => (r.last_sync ? h('time', { title: absTime(r.last_sync), text: relTime(r.last_sync) }) : 'never') }
      ],
      empty: { title: 'No accounts have synced anything', body: 'There are no projects on the database yet.' }
    })
  ]);
}

function scopeTable(d) {
  const allowed = d.allowed_scopes || [];
  const rows = d.per_scope || [];
  return h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Rows per scope' }),
    dataTable({
      caption: `${n(d.project_data && d.project_data.rows)} rows, ${fmtBytes(d.project_data && d.project_data.bytes)} in all (logical size of the stored JSON)`, rows, rowId: (r) => r.scope,
      columns: [
        { key: 'scope', label: 'Scope', render: (r) => (allowed.includes(r.scope) ? r.scope : h('span', {}, [r.scope + ' ', pill('not allowed', 'danger')])) },
        { key: 'rows', label: 'Rows', align: 'end', render: (r) => n(r.rows) },
        { key: 'bytes', label: 'Stored', align: 'end', render: (r) => fmtBytes(r.bytes) },
        { key: 'last', label: 'Last write', render: (r) => (r.last_write ? h('time', { title: absTime(r.last_write), text: relTime(r.last_write) }) : '—') }
      ],
      empty: { title: 'Nothing stored yet', body: 'project_data has no rows.' }
    })
  ]);
}

function errorsBlock(d) {
  const e = d.errors || {};
  const rows = e.by_scope_code || [];
  const items = refusalsByCode(rows);
  const days = refusalsPerDay(e);
  const card = h('div.ad-card', {}, [
    h('h3.ad-card-h', { text: 'Refused saves reported by browsers' }),
    h('p.ad-meta', { text: `Since ${e.since || 'two weeks ago'}. Browsers report only the kind of data and the refusal code, once per page load, and not at all if the person turned counting off; so this is a floor.` }),
    h('div.ad-kpi-row', {}, [pill(`${n(e.total)} reported`, e.total ? 'warn' : 'ok'), days.length > 1 ? sparkline(days, { label: 'Refused saves per day', width: 140, height: 28 }) : null])
  ]);
  if ((e.on_scopes_not_allowed || []).length) {
    card.append(h('p.ad-meta.us-warn', { text: 'Refusals on scopes the CHECK does not allow: ' + e.on_scopes_not_allowed.map((x) => `${x.scope} (${n(x.count)})`).join(', ') + '.' }));
  }
  if (!rows.length) { card.append(emptyState({ title: 'No refused saves reported', body: 'Nothing has been refused in the last two weeks, or nobody reporting has met a refusal.', stamp: true, icon: '✓' })); return card; }
  card.append(bar(items, { label: 'Refusals by code' }));
  card.append(dataTable({
    caption: 'By kind of data and code', rows, rowId: (r) => r.scope + r.code,
    columns: [
      { key: 'scope', label: 'Scope' },
      { key: 'code', label: 'Code', render: (r) => r.code, title: (r) => CODE[r.code] || '' },
      { key: 'count', label: 'Count', align: 'end', render: (r) => n(r.count) }
    ]
  }));
  return card;
}

function pressureBlock(ctx) {
  const p = S.pressure;
  const card = h('div.ad-card', {}, [h('h3.ad-card-h', { text: 'Near a limit' })]);
  if (p.phase === 'error') { card.append(errorState({ title: 'Limit pressure could not load', why: p.error, onRetry: () => { reset(p); ctx.rerender(); } })); return card; }
  if (p.phase !== 'ok' || !p.data) { card.append(skeleton({ kind: 'rows', count: 3 })); return card; }
  const d = p.data;
  card.append(h('div.ad-kpi-row', {}, [
    d.enforced ? pill('Limits are enforced', 'warn', { dot: true, title: 'purchases_required() is on: the database refuses writes past a cap' })
      : pill('Limits are not enforced', 'neutral', { dot: true, title: 'purchases_required() is off: nobody is walled or capped yet' }),
    h('span.ad-meta', { text: `${n(d.count)} ${d.count === 1 ? 'account is' : 'accounts are'} at ${d.threshold_pct || 80}% or more of a cap` })
  ]));
  card.append(h('p.ad-meta', { text: (d.enforced ? 'Past a film, share or seat cap the database refuses the write.' : 'Purchases are not required, so no one is capped today: this is a view of who would be.') + ' Storage is never enforced by anything yet, so a full storage meter is a heads-up only. This is a report: the console sends nothing to these people.' }));
  const rows = d.accounts || [];
  card.append(dataTable({
    caption: `Heaviest first${d.count > rows.length ? `, ${rows.length} of ${n(d.count)} shown` : ''}. Open a row for the customer.`, rows, rowId: (r) => r.user_id,
    onActivate: (r) => ctx.go('people', { user: r.user_id }),
    columns: [
      { key: 'email', label: 'Account', render: (r) => r.email || r.user_id },
      { key: 'plan', label: 'Plan', render: (r) => r.plan_name || r.plan },
      { key: 'max', label: 'Fullest', align: 'end', render: (r) => `${Math.round(Number(r.max_pct) || 0)}%` },
      { key: 'm', label: 'Meters', render: (r) => h('div.sy-meters', {}, metersOver(r, d.threshold_pct).map((m) => {
        const bytes = m.key === 'storage_bytes';
        return meter({ value: Number(m.used) || 0, max: Number(m.cap) || 0, label: METRIC[m.key] || m.key, format: bytes ? fmtBytes : undefined });
      })) }
    ],
    empty: { title: 'Nobody is near a limit', body: 'No account is at or above the threshold.' }
  }));
  return card;
}

export function render(ctx) {
  S.ctx = ctx;
  load(ctx, S.overview, 'admin_sync_overview', {});
  load(ctx, S.pressure, 'admin_limit_pressure', {});
  const root = h('div.us-root', {}, [head()]);
  const o = S.overview;
  if (o.phase === 'error') {
    root.append(errorState({ title: 'Sync health could not load', why: o.error, onRetry: () => { reset(o); ctx.rerender(); } }), pressureBlock(ctx));
    return root;
  }
  if (o.phase !== 'ok' || !o.data) { root.append(skeleton({ kind: 'kpi' }), skeleton({ kind: 'block', count: 2 })); return root; }
  const d = o.data;
  const pd = d.project_data || {};
  root.append(
    h('div.ad-stats.ad-kpis', {}, [
      kpi({ label: 'Members', value: n(d.members) }),
      kpi({ label: 'Accounts with synced work', value: n(pd.accounts_with_data) }),
      kpi({ label: 'Stored rows', value: n(pd.rows) }),
      kpi({ label: 'Stored in all', value: fmtBytes(pd.bytes), title: 'Logical size of the stored JSON, not the compressed size on disk' }),
      kpi({ label: 'Refused saves, 14 days', value: n((d.errors || {}).total), attention: (d.errors || {}).total > 0 })
    ]),
    scopeDiff(ctx, d),
    h('div.ad-cols', {}, [bucketsBlock(d), errorsBlock(d)]),
    topAccounts(ctx, d), scopeTable(d), pressureBlock(ctx)
  );
  return root;
}

delegate(document, 'click', '[data-sy-refresh]', () => { reset(S.overview); reset(S.pressure); if (S.ctx) S.ctx.rerender(); });

export default { render };
