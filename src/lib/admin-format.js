/* ============================================================
   ADMIN FORMAT — the console's words for times, counts and cells
   ------------------------------------------------------------
   Pure: a value in, a string out. No DOM, no storage, no network, so
   the console's tabs, its kit (src/ui/admin-kit.js) and a Node test all
   agree about what "3h ago" or "2d" means.
   ============================================================ */

/** The full local date and time, for title=; '' when there is none. */
export function absTime(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** "just now", "3h ago", "in 2d"; a date past 30 days; '—' for nothing. */
export function relTime(ts, now = Date.now()) {
  if (!ts) return '—';
  const t = new Date(ts).getTime();
  if (Number.isNaN(t)) return '—';
  const s = Math.round((now - t) / 1000);
  const f = s < 0 ? 'in ' : '';
  const a = Math.abs(s);
  const sfx = s < 0 ? '' : ' ago';
  if (a < 45) return s < 0 ? 'in a moment' : 'just now';
  if (a < 3600) return `${f}${Math.round(a / 60)}m${sfx}`;
  if (a < 86400) return `${f}${Math.round(a / 3600)}h${sfx}`;
  if (a < 86400 * 30) return `${f}${Math.round(a / 86400)}d${sfx}`;
  return new Date(t).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

/** 90 -> "2m", 7300 -> "2h", 200000 -> "2d". */
export function duration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}

/** "set_billing_settings" -> "Set billing settings". */
export function humanAction(a) {
  const t = String(a || '').replace(/[_:]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Unknown action';
}

/** A CSV cell. A cell that begins with = + - @ is prefixed so a spreadsheet does not run it. */
export function csvCell(v) {
  let s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/* ---- the Overview's formatters (src/pages/admin.js, ctx.fmt) ------- */

export const fmtDate = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { dateStyle: 'medium' }) : '—');
export const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const fmtTime = (ts) => (ts ? new Date(ts).toLocaleTimeString(undefined, { timeStyle: 'short' }) : '');
/** A count in this browser's grouping; anything unreadable is 0. */
export const n = (v) => (Number(v) || 0).toLocaleString();
export const num0 = (v) => Number(v) || 0;
/** "3 films", "1 film". */
export const plural = (v, one, many) => `${n(v)} ${Number(v) === 1 ? one : many}`;

/** Bytes as B / KB / MB / GB (Sync & storage's scale). */
export function fmtBytes(b) {
  const v = Number(b) || 0;
  if (v < 1024) return v + ' B';
  if (v < 1048576) return (v / 1024).toFixed(v < 10240 ? 1 : 0) + ' KB';
  if (v < 1073741824) return (v / 1048576).toFixed(v < 10485760 ? 1 : 0) + ' MB';
  return (v / 1073741824).toFixed(2) + ' GB';
}

export default { absTime, relTime, duration, humanAction, csvCell, fmtDate, fmtWhen, fmtTime, n, num0, plural, fmtBytes };
