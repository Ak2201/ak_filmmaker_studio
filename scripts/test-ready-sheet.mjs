/* ============================================================
   THE READY-TO-SHOOT SHEET — src/lib/ready-sheet.js, in Node
   ------------------------------------------------------------
   The pure half of the one-page PDF: ordering (blockers first), the
   caps a page needs, dates without a timezone, the budget block that is
   OMITTED when there is no figure, and the permission list.

       node scripts/test-ready-sheet.mjs
   ============================================================ */
import { readySheet, verdict, dateLabel, rupees, LIMITS } from '../src/lib/ready-sheet.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const chk = (id, severity, label, items, passed = !items.length) => ({ id, severity, label, hint: 'h', items, count: items.length, passed });
const report = {
  hasFilm: true, ready: false, blockers: 1, gaps: 2,
  checks: [
    chk('a', 'gap', 'No call sheet', ['Day 1', 'Day 2']),
    chk('b', 'blocker', 'No date', ['Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7', 'Day 8', 'Day 9']),
    chk('c', 'gap', 'Cast', ['Meena']),
    chk('d', 'blocker', 'Refused', [])
  ]
};

eq(dateLabel('2026-01-15'), 'Thu 15 Jan 2026', 'dateLabel');
eq(dateLabel('2026-02-31'), '', 'a 31 February is not a date');
eq(dateLabel(''), '', 'blank date');
eq(rupees(1234567), '₹ 12,34,567', 'rupees, Indian grouping');

eq(verdict({ hasFilm: false }), 'No scenes yet, so there is nothing to check.', 'verdict with no film');
eq(verdict({ hasFilm: true, ready: true }), 'Every check passes.', 'verdict when ready');
ok(/^Not ready to shoot: 1 blocker and 2 gaps\.$/.test(verdict(report)), 'verdict names blockers and gaps: ' + verdict(report));
ok(/^Ready, with gaps: 1 gap\.$/.test(verdict({ hasFilm: true, blockers: 0, gaps: 1 })), 'gaps only');

const days = [
  { day: 1, date: '2026-01-14', scenes: [1, 2, 3], eighths: 20, locations: ['Kitchen', 'Street'] },
  { day: 2, date: '', scenes: [4], eighths: 8, locations: ['Temple'] }
];
const locations = [
  { name: 'Kitchen', recce: { permission: 'approved' } },
  { name: 'Street', recce: { permission: 'requested' } },
  { name: 'Temple', recce: { permission: 'refused' } },
  { name: 'Roof', recce: { permission: '' } }
];
const s = readySheet({ title: 'Dragon', report, days, unscheduled: 2, budget: { total: 2500000, contingencyPct: 10 }, locations, asOf: '12 Oct 2026' });
eq(s.attention.map((a) => a.label), ['No date', 'No call sheet', 'Cast'], 'failing checks only, blockers first, passes left out');
eq(s.attention[0].items.length, LIMITS.items, 'a long item list is capped');
eq(s.attention[0].more, 4, 'and says how many it left out');
eq(s.passed, ['Refused'], 'a passing check is folded into the passed line');
eq(s.schedule.rows[0], { day: 1, date: 'Wed 14 Jan 2026', scenes: 3, pages: '2 4/8', places: 'Kitchen, Street' }, 'a schedule row');
eq(s.schedule.rows[1].date, '', 'an undated day has no date');
eq([s.schedule.totalDays, s.schedule.dated, s.schedule.unscheduled], [2, 1, 2], 'schedule counts');
eq(s.budget, { total: '₹ 25,00,000', contingencyPct: 10 }, 'the budget block');
eq(s.permissions.rows.map((p) => [p.name, p.status]), [['Street', 'Asked, no answer yet'], ['Temple', 'Refused'], ['Roof', 'Not asked yet']], 'every place that is not approved, with its status');
eq(s.title, 'Dragon', 'title');

// A dollar budget prints dollars (fix-money r1): the sheet used to stamp
// '₹' on the dollar total. The PDF's collector must pass the currency.
eq(readySheet({ title: 'X', report, days, budget: { total: 3000, contingencyPct: 0, currency: 'USD' }, locations }).budget,
  { total: '$3,000', contingencyPct: 0 }, 'a USD budget prints in dollars');
eq(readySheet({ title: 'X', report, days, budget: { total: 3000, currency: 'INR' }, locations }).budget.total, '₹ 3,000', 'an INR budget still prints rupees');
{
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../src/lib/ready-pdf.js', import.meta.url), 'utf8');
  eq(/currency:\s*Costs\.budgetCurrency\(\)/.test(src), true, 'ready-pdf.js passes the budget currency to the sheet');
}
eq(readySheet({ title: 'X', report, days, budget: null, locations }).budget, null, 'no budget: the block is omitted');
eq(readySheet({ title: 'X', report, days, budget: { total: 0 }, locations }).budget, null, 'a zero budget is no budget');
const many = Array.from({ length: 20 }, (_, i) => ({ day: i + 1, date: '', scenes: [], eighths: 0, locations: [] }));
const big = readySheet({ title: 'X', report, days: many, locations: [] });
eq([big.schedule.rows.length, big.schedule.more], [LIMITS.days, 20 - LIMITS.days], 'a long schedule is capped and counted');
eq(readySheet({ title: '', report: { hasFilm: false, checks: [] } }).title, 'Untitled film', 'an unnamed film has a name');
eq(readySheet({}).attention, [], 'no input at all does not throw');

console.log(`\n  ready-sheet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
