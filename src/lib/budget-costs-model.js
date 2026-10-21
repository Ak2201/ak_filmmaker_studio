/* ============================================================
   BUDGET COSTS MODEL — what the cost tabs read, read once
   ------------------------------------------------------------
   src/ui/budget-costs.js draws petty cash, actuals, crew payments,
   the top sheet and the wage table. Everything those views READ is
   gathered here: the contacts and call sheets, the shoot calendar,
   the estimate's lines and the cost report src/lib/costs.js derives
   from them, and each crew member's account. Nothing here touches
   the DOM, and nothing here writes; every write is still a costs.js
   call the view makes.
   ============================================================ */
import { INR, fmtINR, fmtMoney, parseAmount } from './money.js';
import C from './costs.js';
import { listContacts, listCallSheets } from './contacts.js';
import { calendarDays } from './locations.js';
import wages from '../data/wages.fefsi.json';

/* The budget's currency, as of the last costContext() — which every
   render calls first, so the formatters below always print the
   currency of the figures they are printing. 'INR' until then. */
let shown = 'INR';
/** The currency the cost tabs are showing: 'INR' | 'USD'. */
export const shownCurrency = () => shown;
/** The currency's sign, for field labels: '₹' or '$'. */
export const sym = () => (shown === 'USD' ? '$' : '₹');

/** A budget figure, exact, with a real minus for a negative. A rupee
    figure is exactly what it always was. */
export const rs = (n) => (shown === 'USD'
  ? fmtMoney(n, 'USD')
  : rupees(n));
/** A RUPEE figure whatever the budget is in: the FEFSI wage table's
    published bata is a rupee figure and must never wear a dollar sign. */
export const rupees = (n) => (n < 0 ? '−₹ ' : '₹ ') + INR.format(Math.round(Math.abs(n || 0)));
/** The glance-sized magnitude (fmtINR for rupees). */
export const glance = (n) => (shown === 'USD' ? fmtMoney(n, 'USD', true) : fmtINR(n));
/** Parse a typed figure in the budget's currency (parseNum for rupees). */
export const amountOf = (s) => parseAmount(s, shown);
/** A percentage, or a dash for none. */
export const pct = (n) => (n === null || n === undefined ? '—' : n + '%');
/** Today as the wall-clock 'YYYY-MM-DD' a date field holds. */
export const today = () => {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};
/** The label of `id` in a list of `{ id, label }`, else the id itself. */
export const label = (list, id) => (list.find((x) => x.id === id) || {}).label || id;

/** Everything a render reads, read once. */
export function costContext() {
  let contacts = [], sheets = [], days = [];
  shown = C.budgetCurrency();
  try { contacts = listContacts(); } catch (e) { /* none */ }
  try { sheets = listCallSheets(); } catch (e) { /* none */ }
  try { days = calendarDays(); } catch (e) { /* none */ }
  const all = C.readAll();
  const lines = C.estimateLines(C.readCalc(), all.lines);
  const byId = new Map(contacts.map((c) => [c.id, c]));
  const nameOf = (id) => (byId.has(id) ? byId.get(id).name || 'Unnamed contact' : id);
  const lineById = new Map(lines.map((l) => [l.id, l]));
  const lineName = (id) => (lineById.has(id) ? lineById.get(id).name : id ? 'A line no longer in the estimate' : '');
  const expenses = C.listExpenses();
  const floats = C.listFloats();
  const crew = C.listCrew();
  const payments = C.listPayments();
  const settings = C.getSettings();
  const report = C.costReport({ lines, expenses, crew, payments, contacts, contingencyPct: settings.contingencyPct });
  return { contacts, sheets, days, lines, byId, nameOf, lineName, expenses, floats, crew, payments, settings, report, overrides: all.wageOverrides };
}

/** One crew member's record, payments, derived days and account. */
export function crewAccountFor(ctx, c) {
  const rec = ctx.crew[c.id] || C.getCrew(c.id);
  const paid = ctx.payments.filter((p) => p.contactId === c.id);
  const derived = C.derivedDays(c, ctx.days, ctx.sheets);
  return { rec, paid, derived, acct: C.crewAccount(rec, paid, derived) };
}

/** The wage rows to offer for a department: the first row, then the
    department's own; every row when the department has none. */
export function wageHintRows(ctx, department) {
  const rows = C.wageRows(wages, ctx.overrides);
  const own = rows.filter((r) => r.department === department);
  return own.length ? [rows[0], ...own] : rows;
}

export default { rs, rupees, glance, amountOf, sym, shownCurrency, pct, today, label, costContext, crewAccountFor, wageHintRows };
