/* ============================================================
   THE READY-TO-SHOOT SHEET — what the producer reads, as data
   ------------------------------------------------------------
   One A4 page about one film: the readiness checks (blockers and gaps
   first, passes folded into a line), the shoot days with their dates
   and weight, the budget figure when the estimator has one, and the
   places whose permission is still open.

   PURE. Everything arrives as arguments and a plain object leaves, so
   Node can test it (scripts/test-ready-sheet.mjs) and this file stores
   nothing and reads nothing. src/lib/ready-pdf.js collects the inputs
   from the models and draws the page; the checks themselves are
   src/lib/readiness.js's, passed in rather than re-derived (two
   opinions about one film disagree the first time one is edited).

   A page has a size, so every list is capped and says how many it left
   out. A block with nothing to say is OMITTED, never printed empty:
   no budget means no budget block, and no remark about it either.
   ============================================================ */
import { formatEighths } from './sample-figures.js';
import { INR, fmtMoney } from './money.js';

const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const LIMITS = Object.freeze({ attention: 9, items: 3, days: 10, permissions: 6 });

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const cap = (list, n) => ({ shown: list.slice(0, n), more: Math.max(0, list.length - n) });

/** '2026-01-15' → 'Thu 15 Jan 2026'. No Date in the local zone: a shoot
    date is a day on a wall calendar, and parsing it through a timezone
    is how it becomes yesterday. '' for anything else. */
export function dateLabel(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').trim());
  if (!m) return '';
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime()) || d.getUTCMonth() !== +m[2] - 1) return '';
  return DOW[d.getUTCDay()] + ' ' + (+m[3]) + ' ' + MON[+m[2] - 1] + ' ' + m[1];
}

/** A rupee figure, grouped the Indian way. */
export const rupees = (n) => '₹ ' + INR.format(Math.round(Number(n) || 0));

/** The first line a producer reads. */
export function verdict(report) {
  if (!report || !report.hasFilm) return 'No scenes yet, so there is nothing to check.';
  if (report.ready) return 'Every check passes.';
  const parts = [];
  if (report.blockers) parts.push(plural(report.blockers, 'blocker'));
  if (report.gaps) parts.push(plural(report.gaps, 'gap'));
  return (report.blockers ? 'Not ready to shoot: ' : 'Ready, with gaps: ') + parts.join(' and ') + '.';
}

/**
 * @param {object} a
 * @param {string} a.title          the film
 * @param {object} a.report         readiness() result
 * @param {Array}  a.days           calendarDays() — { day, date, scenes, eighths, locations }
 * @param {number} a.unscheduled    scenes with no shoot day
 * @param {object|null} a.budget    { total, contingencyPct, currency? } or null when the estimator is empty;
 *                                  `currency` is the budget's own (USD prints dollars, anything else rupees)
 * @param {Array}  a.locations      locationIndex() — { name, recce: { permission } }
 * @param {string} [a.asOf]         the printed date
 */
export function readySheet({ title, report, days = [], unscheduled = 0, budget = null, locations = [], asOf = '' } = {}) {
  const checks = (report && report.checks) || [];
  const open = checks.filter((c) => !c.passed)
    .sort((a, b) => (a.severity === 'blocker' ? 0 : 1) - (b.severity === 'blocker' ? 0 : 1));
  const attn = cap(open, LIMITS.attention);
  const attention = attn.shown.map((c) => {
    const it = cap(c.items || [], LIMITS.items);
    return {
      severity: c.severity, label: c.label, count: c.count || (c.items || []).length,
      hint: c.hint || '', items: it.shown, more: it.more
    };
  });
  const passed = checks.filter((c) => c.passed).map((c) => c.label);

  const dayRows = days.map((d) => ({
    day: d.day,
    date: dateLabel(d.date),
    scenes: (d.scenes || []).length,
    pages: formatEighths(d.eighths),
    places: (d.locations || []).join(', ')
  }));
  const dr = cap(dayRows, LIMITS.days);

  const perms = (locations || []).filter((l) => {
    const p = l.recce && l.recce.permission;
    return p !== 'approved';
  }).map((l) => {
    const p = (l.recce && l.recce.permission) || 'unknown';
    return {
      name: l.name,
      status: p === 'refused' ? 'Refused' : p === 'requested' ? 'Asked, no answer yet'
        : p === 'scouting' ? 'Scouting' : 'Not asked yet'
    };
  });
  const pr = cap(perms, LIMITS.permissions);

  const hasBudget = budget && Number(budget.total) > 0;
  return {
    title: String(title || 'Untitled film'),
    asOf,
    hasFilm: !!(report && report.hasFilm),
    verdict: verdict(report),
    attention,
    attentionMore: attn.more,
    passed,
    schedule: {
      totalDays: dayRows.length,
      dated: dayRows.filter((d) => d.date).length,
      rows: dr.shown,
      more: dr.more,
      unscheduled: Math.max(0, Number(unscheduled) || 0)
    },
    budget: hasBudget
      ? { total: fmtMoney(Math.round(Number(budget.total) || 0), budget.currency), contingencyPct: Number(budget.contingencyPct) || 0 }
      : null,
    permissions: { rows: pr.shown, more: pr.more, total: perms.length }
  };
}

export default { readySheet, verdict, dateLabel, rupees, LIMITS };
