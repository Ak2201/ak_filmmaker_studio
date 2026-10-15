/* ============================================================
   ADMIN AUDIT MODEL — the audit log's filters, rows and CSV
   ------------------------------------------------------------
   Pure helpers for the Audit log tab (src/pages/admin-tabs/audit.js):
   which RPC arguments a set of filters means, how a row is named, and
   the text of the CSV export. Nothing here draws, stores or fetches.
   ============================================================ */
import { csvCell } from './admin-format.js';

/** Rows per page of admin_list_audit(). */
export const PAGE = 50;
/** The filter fields, empty. */
export const BLANK = { actor: '', action: '', target: '', from: '', to: '' };
/** The filters a deep link may carry (#audit?target=…). */
export const LINK_FILTERS = ['actor', 'action', 'target'];
/** The columns the CSV export writes, in order. */
export const CSV_COLUMNS = ['at', 'actor', 'actor_email', 'action', 'target_kind', 'target_id', 'note', 'before', 'after'];

/** Whether any filter is set. */
export const isFiltered = (f) => Object.values(f).some(Boolean);

/** Filters -> admin_list_audit() arguments. Dates are whole days in this
    browser's time zone; `extra` (a page cursor) is merged last. */
export function argsFor(f, extra) {
  const a = { p_limit: PAGE };
  if (f.actor) a.p_actor = f.actor;
  if (f.action) a.p_action = f.action;
  if (f.target) a.p_target = f.target;
  if (f.from) { const d = new Date(f.from + 'T00:00:00'); if (!Number.isNaN(d.getTime())) a.p_from = d.toISOString(); }
  if (f.to) { const d = new Date(f.to + 'T23:59:59.999'); if (!Number.isNaN(d.getTime())) a.p_to = d.toISOString(); }
  return { ...a, ...(extra || {}) };
}

/** The filters a hash's params change, or null when they change nothing.
    `get(k)` answers a param or null (URLSearchParams.get). */
export function filtersFromParams(current, get) {
  const f = { ...current };
  let changed = false;
  for (const k of LINK_FILTERS) {
    const v = get(k);
    if (v !== null && v !== f[k]) { f[k] = v; changed = true; }
  }
  return changed ? f : null;
}

/** The link-able filters that are set, as hash params. */
export function linkParams(f) {
  const p = {};
  for (const k of LINK_FILTERS) if (f[k]) p[k] = f[k];
  return p;
}

/** A submitted form's values (`get(k)` = FormData.get) as filters, trimmed. */
export const filtersFromForm = (get) => Object.fromEntries(Object.keys(BLANK).map((k) => [k, String(get(k) || '').trim()]));

/** Who did it: the e-mail, else the id's first 8 characters. */
export const actorLabel = (r, none = 'unknown') => r.actor_email || (r.actor ? String(r.actor).slice(0, 8) : none);
export const rowTarget = (r) => `${r.target_kind || '?'} · ${r.target_id || '?'}`;
export const rowTone = (r) => (/reset|terminate|revoke|delete|refund/i.test(r.action || '') ? 'warn' : null);

/** "3 rows loaded, more available (filtered)". */
export function loadedLine(count, hasMore, filtered) {
  return `${count} row${count === 1 ? '' : 's'} loaded${hasMore ? ', more available' : ''}${filtered ? ' (filtered)' : ''}`;
}

/** The CSV export of exactly these rows, CRLF line ends, header first. */
export function csvText(rows) {
  const cols = CSV_COLUMNS;
  const lines = [cols.join(',')].concat(rows.map((r) => cols.map((c) => csvCell(r[c])).join(',')));
  return lines.join('\r\n') + '\r\n';
}

/** "audit-log-2026-10-15.csv" for the day given. */
export const csvFileName = (now = new Date()) => 'audit-log-' + now.toISOString().slice(0, 10) + '.csv';

export default { PAGE, BLANK, LINK_FILTERS, CSV_COLUMNS, isFiltered, argsFor, filtersFromParams, linkParams, filtersFromForm, actorLabel, rowTarget, rowTone, loadedLine, csvText, csvFileName };
