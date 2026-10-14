/* The budget page's header figures: src/lib/costs.js budgetKpis(), Node only. */
import { mem } from './node-seams.mjs';
const C = await import('../src/lib/costs.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} - got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
mem.delete('fms_costs_v1');

eq(C.budgetKpis(undefined).approved, 0, 'no report reads as zero, never throws');
const lines = C.estimateLines({ ci_1_item: 'Camera', ci_1_days: '10', ci_1_rate: '10000' }, {});
eq(lines.length, 1, 'one estimate line');
let k = C.budgetKpis(C.costReport({ lines, expenses: [], contingencyPct: 10 }));
eq([k.approved, k.actual, k.remaining, k.over, k.pctUsed], [110000, 0, 110000, false, 0], '1,00,000 + 10% contingency = 1,10,000 approved, nothing spent');
eq(k.contingency, { pct: 10, pool: 10000, used: 0, left: 10000 }, 'contingency pool untouched');

const e = (amount) => ({ amount, gstPct: 0, category: 'misc', line: lines[0].id });
k = C.budgetKpis(C.costReport({ lines, expenses: [e(50000)], contingencyPct: 10 }));
eq([k.actual, k.remaining, k.pctUsed, k.over], [50000, 60000, 45, false], 'half spent');
k = C.budgetKpis(C.costReport({ lines, expenses: [e(105000)], contingencyPct: 10 }));
eq([k.remaining, k.over, k.contingency.used, k.contingency.left], [5000, false, 5000, 5000], 'overspend inside estimate+contingency eats the pool, not the ceiling');
k = C.budgetKpis(C.costReport({ lines, expenses: [e(125000)], contingencyPct: 10 }));
eq([k.remaining, k.over, k.contingency.used, k.contingency.left], [-15000, true, 10000, 0], 'beyond the ceiling is negative and flagged; pool capped');
console.log(`test:budget-kpis - ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
