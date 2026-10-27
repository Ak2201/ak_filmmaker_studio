/* ============================================================
   test:budget-usd — a budget in US dollars (BUDGET-USD, 21 Oct 2026)
   ------------------------------------------------------------
   No browser. Proves:
     · money.js: parseAmount(s,'INR') IS parseNum, fmtMoney(n,'INR')
       is the rupee figure the budget always printed; the dollar half
       keeps the whole-string suffix rule.
     · the budget's currency: a legacy estimate (money, no field) reads
       INR and is SAVED BACK WITHOUT a field; an empty estimate takes
       the film's currency at its first row and keeps it after the film
       changes region; the cost record pins the same way.
     · every `ci_<n>_…` reader ignores `ci_currency`.
     · rates.us.json: every row sourced and dated, prices present, no
       invented figure, no "union rate" wording; the hint prints the
       range AND the prices it was derived from; a rupee hint is
       unchanged.

       node scripts/test-budget-usd.mjs   (or: npm run test:budget-usd)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

// node-seams serves store.js as this module; the same URL is the same
// instance, so the test can say which film is open.
const Store = (await import('data:text/javascript,export default {}')).default;
const M = await import('../src/lib/money.js');
const C = await import('../src/lib/costs.js');
const B = await import('../src/lib/budget-model.js');
const BCM = await import('../src/lib/budget-costs-model.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const CALC = 'fms_library_calc_v1';
const COSTS = 'fms_costs_v1';
const film = (region) => { Store.currentProject = () => (region === null ? null : { id: 'p1', title: 'T', region }); };
const reset = () => { mem.delete(CALC); mem.delete(COSTS); };

/* ---- money.js ------------------------------------------------- */
const samples = ['', '0', '25,000', 'Rs. 25000', '25k', '1.5 lakh', '2 cr', '₹3L', '5 thousand',
  '1500 per roll', '1 lens day', 'crew 500', 'bank 200', '3 days', '$2,000', '2m', '12.5', 'abc', null, undefined];
for (const s of samples) eq(M.parseAmount(s, 'INR'), M.parseNum(s), `parseAmount(${JSON.stringify(s)}, INR) is parseNum`);
for (const s of samples) eq(M.parseAmount(s), M.parseNum(s), `parseAmount(${JSON.stringify(s)}) with no currency is parseNum`);

const usd = [
  ['$2,000', 2000], ['2000', 2000], ['1.5k', 1500], ['1.5K', 1500], ['2m', 2000000], ['2 mn', 2000000],
  ['1.25 million', 1250000], ['5 thousand', 5000], ['US$ 750', 750], ['750 USD', 750], ['usd750', 750],
  ['500 per roll', 500], ['3 mins', 3], ['1.5k/day', 1500], ['$500 per day', 500], ['2 thousands', 2000], ['1 lens day', 1], ['1.5l', 1.5], ['2cr', 2], ['crew 500', 0], ['', 0], [null, 0], ['$37.50', 37.5]
];
for (const [s, want] of usd) eq(M.parseAmount(s, 'USD'), want, `parseAmount(${JSON.stringify(s)}, USD)`);

for (const n of [0, 1, 999, 4600, 54000, 12500000, 2565000.4]) {
  eq(M.fmtMoney(n, 'INR'), B.fmtINRExact(n), `fmtMoney(${n}, INR) is the budget's exact rupee figure`);
  eq(M.fmtMoney(n, 'INR', true), M.fmtINR(n), `fmtMoney(${n}, INR, short) is fmtINR`);
}
eq(M.fmtMoney(-4600, 'INR'), '−₹ 4,600', 'a negative rupee figure has a real minus');
eq(M.fmtMoney(12500, 'USD'), '$12,500', 'dollars, exact');
eq(M.fmtMoney(0, 'USD'), '$0', 'zero dollars');
eq(M.fmtMoney(-750, 'USD'), '−$750', 'a negative dollar figure has a real minus');
eq(M.fmtMoney(1250000, 'USD', true), '$1.25M', 'a short million');
eq(M.fmtMoney(45200, 'USD', true), '$45k', 'a short thousand');
eq(M.fmtMoney(820, 'USD', true), '$820', 'a short hundreds');

// The four rupee exports did not move.
const moneySrc = readFileSync(new URL('../src/lib/money.js', import.meta.url), 'utf8');
ok(moneySrc.includes("export default { parseNum, fmtINR, INR, USD };"), 'money.js default export is unchanged');
ok(moneySrc.includes("const parts = s.match(/^(\\d*\\.?\\d+)(crores?|cr|lakhs?|lacs?|l|thousands?|thou|k)?(?:(?:\\/|per)[a-z]+)?$/);"), 'the lakh/crore whole-string rule is untouched');
ok(moneySrc.indexOf('BUDGET-USD') > moneySrc.indexOf('export const USD'), 'the dollar half sits after every rupee export');

/* ---- the budget's currency ------------------------------------- */
eq(C.resolveCurrency({ calc: {}, costs: {}, project: 'USD' }), 'USD', 'an empty budget follows the film');
eq(C.resolveCurrency({ calc: { ci_1_rate: '5000' }, costs: {}, project: 'USD' }), 'INR', 'a legacy estimate is INR whatever the film');
eq(C.resolveCurrency({ calc: { ci_1_rate: '' , ci_2_item: '' }, costs: {}, project: 'USD' }), 'USD', 'blank rows are not money');
eq(C.resolveCurrency({ calc: { ci_1_rate: '5', ci_currency: 'USD' }, project: 'INR' }), 'USD', 'the stored word wins');
eq(C.resolveCurrency({ calc: {}, costs: { settings: { currency: 'USD' } }, project: 'INR' }), 'USD', 'the cost record speaks when the estimate does not');
eq(C.resolveCurrency({ calc: {}, costs: { expenses: [{ amount: 1 }], settings: {} }, project: 'USD' }), 'INR', 'legacy costs are INR');
eq(C.resolveCurrency({ calc: { ci_currency: 'usd' } }), 'USD', 'the word is normalised');
eq(C.resolveCurrency({ calc: { ci_currency: 'EUR' }, project: 'INR' }), 'INR', 'an unknown word is ignored');

// A legacy estimate reads back and saves back exactly.
reset(); film('INT');
const legacy = { ci_1_item: 'ARRI Alexa Mini', ci_1_custom: '', ci_1_days: '3', ci_1_rate: '25,000' };
mem.set(CALC, JSON.stringify(legacy));
eq(B.budgetCurrency(), 'INR', 'a legacy estimate on a US film is still INR');
B.saveCalcData({ ...legacy, ci_1_days: '4' });
eq(JSON.parse(mem.get(CALC)), { ...legacy, ci_1_days: '4' }, 'saving a legacy estimate adds no field');
eq(C.estimateLines(JSON.parse(mem.get(CALC)))[0].estimate, 100000, 'and it parses as rupees');

// A new estimate on a US film is in dollars from its first row, and stays so.
reset(); film('INT');
eq(B.budgetCurrency(), 'USD', 'an empty budget on a US film is USD');
B.saveCalcData({ ci_1_item: '', ci_1_custom: '', ci_1_days: '', ci_1_rate: '' });
ok(!('ci_currency' in JSON.parse(mem.get(CALC))), 'empty rows do not fix the currency');
B.saveCalcData({ ci_1_item: 'RED Komodo', ci_1_custom: '', ci_1_days: '2', ci_1_rate: '1.5k' });
eq(JSON.parse(mem.get(CALC)).ci_currency, 'USD', 'the first row fixes USD');
B.saveCalcData({ ci_1_item: 'RED Komodo', ci_1_custom: '', ci_1_days: '3', ci_1_rate: '2m' });
eq(JSON.parse(mem.get(CALC)).ci_currency, 'USD', 'a later save that does not name it keeps it');
eq(C.estimateLines(JSON.parse(mem.get(CALC)))[0].rate, 2000000, 'a dollar estimate parses "2m" as two million');
film('IN');
eq(B.budgetCurrency(), 'USD', 'moving the film to India does not relabel the budget');
eq(B.currencyMismatch('USD', 'INR', true), 'This budget is in $, the film is set to India (rupees). Nothing was converted.', 'the mismatch is said');
eq(B.currencyMismatch('INR', 'USD', true), 'This budget is in ₹, the film is set to Elsewhere (US dollars). Nothing was converted.', 'both ways');
eq(B.currencyMismatch('INR', 'USD', false), '', 'an empty budget has no mismatch');
eq(B.currencyMismatch('INR', 'INR', true), '', 'agreeing currencies say nothing');
ok(B.setBudgetCurrency('INR'), 'the deliberate switch');
eq(JSON.parse(mem.get(CALC)).ci_currency, 'INR', 'relabels the estimate');
eq(M.parseAmount(JSON.parse(mem.get(CALC)).ci_1_rate, 'INR'), 2000000, 'and keeps the figure\'s number ("2m" is written out, since ₹ would read it as 2)');
eq(C.getSettings().currency, 'INR', 'and relabels the cost record');
ok(!B.setBudgetCurrency('EUR'), 'an unknown currency is refused');

// An Indian film's new budget is pinned INR; nothing else changes.
reset(); film('IN');
B.saveCalcData({ ci_1_item: 'DOP', ci_1_custom: '', ci_1_days: '1', ci_1_rate: '1.5 lakh' });
eq(JSON.parse(mem.get(CALC)).ci_currency, 'INR', 'an Indian film fixes INR');
eq(C.estimateLines(JSON.parse(mem.get(CALC)))[0].rate, 150000, 'and lakh still means lakh');

// No film open: INR.
reset(); film(null);
eq(B.budgetCurrency(), 'INR', 'no film open reads INR');

// The cost record pins on its first money, and not before.
reset(); film('INT');
C.setSettings({ contingencyPct: 5 });
eq(C.getSettings().currency, '', 'a setting is not money');
C.addExpense({ amount: 120, date: '2026-10-21' });
eq(C.getSettings().currency, 'USD', 'the first expense on a US film fixes USD');
eq(C.getSettings().contingencyPct, 5, 'and keeps the other settings');
film('IN');
C.addExpense({ amount: 80 });
eq(C.getSettings().currency, 'USD', 'a later expense does not move it');
eq(B.budgetCurrency(), 'USD', 'the cost record decides an empty estimate');

// Legacy costs stay without a field.
reset(); film('INT');
const legacyCosts = { expenses: [{ id: 'x1', amount: 500 }], floats: [], crew: {}, payments: [], lines: {}, settings: { contingencyPct: 10 }, wageOverrides: {}, versions: [] };
mem.set(COSTS, JSON.stringify(legacyCosts));
C.addFloat({ amount: 1000, to: 'Ravi' });
ok(!('currency' in JSON.parse(mem.get(COSTS)).settings), 'legacy costs gain no currency field');
eq(B.budgetCurrency(), 'INR', 'and read as INR');

// The cost tabs' formatters follow the last context.
reset(); film('INT');
B.saveCalcData({ ci_1_item: 'Sony FX6', ci_1_custom: '', ci_1_days: '2', ci_1_rate: '91' });
BCM.costContext();
eq(BCM.shownCurrency(), 'USD', 'costContext reads the budget currency');
eq(BCM.rs(1234), '$1,234', 'rs prints dollars');
eq(BCM.amountOf('1.5k'), 1500, 'amountOf parses dollars');
eq(BCM.sym(), '$', 'labels say $');
eq(BCM.rupees(1234), '₹ 1,234', 'a published FEFSI figure stays in rupees in a dollar budget');
reset(); film('IN');
BCM.costContext();
eq(BCM.rs(-1234), '−₹ 1,234', 'rs prints rupees exactly as before');
eq(BCM.glance(250000), M.fmtINR(250000), 'glance is fmtINR for rupees');

/* ---- every ci_<n> reader ignores ci_currency ------------------- */
const blob = { ci_currency: 'USD', ci_2_item: 'DOP', ci_2_rate: '100', ci_2_days: '1' };
eq(B.maxRowIndex(blob), 2, 'maxRowIndex ignores ci_currency');
eq(B.rescuedCustomNames(blob), {}, 'rescuedCustomNames ignores ci_currency');
eq(C.estimateLines(blob).length, 1, 'estimateLines ignores ci_currency');
for (const f of ['src/lib/hub-status.js', 'src/lib/dashboard-model.js', 'src/lib/launcher-model.js', 'src/lib/dpr.js', 'src/lib/preprod-path.js']) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const res = [...src.matchAll(/\/\^ci_\(\\d\+\)_[^/]*\//g)].map((m) => m[0]);
  ok(res.length > 0, f + ' reads ci_ rows with a digit pattern');
  for (const r of res) ok(!new RegExp(r.slice(1, -1)).test('ci_currency'), f + ' ' + r + ' does not match ci_currency');
}

/* ---- rates.us.json ---------------------------------------------- */
const us = JSON.parse(readFileSync(new URL('../src/data/rates.us.json', import.meta.url), 'utf8'));
const raw = readFileSync(new URL('../src/data/rates.us.json', import.meta.url), 'utf8');
ok(!/union rate/i.test(raw.replace(/not union rates/gi, '')), 'rates.us.json never calls a figure a union rate');
ok(Array.isArray(us.rows) && us.rows.length > 0, 'rates.us.json has rows');
const presets = new Set(B.PRESET_ITEMS);
for (const r of us.rows) {
  ok(presets.has(r.item), r.item + ' is a preset the estimator offers');
  ok(!!(us.sources[r.source] && us.sources[r.source].url), r.item + ' names a known source');
  ok(/^https:\/\//.test(r.url || ''), r.item + ' carries the page it came from');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(r.lastChecked || ''), r.item + ' carries a lastChecked date');
  ok(r.prices && r.prices['3'] > 0 && r.prices['7'] > 0, r.item + ' carries the published 3- and 7-day prices');
  ok(!('low' in r) && !('high' in r) && !('raw' in r), r.item + ' has no typed band (it is derived)');
  const b = B.usBand(r);
  ok(b && b.low <= b.high, r.item + ' derives a range');
}
const mini = us.rows.find((r) => r.item === 'ARRI Alexa Mini');
eq(B.usBand(mini), { low: 149, high: 244 }, 'the Alexa Mini range is 1045/7 to 732/3');
const hint = B.rateHint('ARRI Alexa Mini', 'USD');
ok(hint.includes('$149 – $244/day') && hint.includes('$732 for 3 days') && hint.includes('$1,045 for 7') && hint.includes('checked 2026-10-21'),
  'the US hint prints the range and the prices behind it — got ' + hint);
eq(B.rateHint('DOP', 'USD'), '', 'a role with no sourced US figure shows none');
eq(B.rateHint('ARRI Alexa Mini', 'INR'), B.rateHint('ARRI Alexa Mini'), 'a rupee hint is unchanged');
eq(B.rateProvenance('INR'), B.rateProvenance(), 'the rupee provenance line is unchanged');
ok(B.rateProvenance('USD').includes(us.rows.length + ' presets carry a US range'), 'the US provenance line is counted from the file');
ok(!/[0-9]+[,.]?[0-9]*\s*(lakh|cr)/i.test(B.rateProvenance('USD')), 'the US provenance line quotes no rupee figure');


/* ---- the relabel keeps every NUMBER (review fix, 22 Oct 2026) ------ */
{
  const rows = { ci_1_item: 'DOP', ci_1_days: '10', ci_1_rate: '1.5L', ci_2_days: '2', ci_2_rate: '2cr', ci_3_days: '1', ci_3_rate: '25,000', ci_4_rate: '' };
  const out = B.relabelRows(rows, 'INR', 'USD');
  eq(M.parseAmount(out.ci_1_rate, 'USD'), 150000, '1.5L relabelled to $ keeps 1,50,000');
  eq(M.parseAmount(out.ci_2_rate, 'USD'), 20000000, '2cr relabelled to $ keeps 2,00,00,000');
  eq(out.ci_3_rate, '25,000', 'a figure both parsers agree on is left as typed');
  eq(out.ci_1_item, 'DOP', 'the item is not touched');
  eq(out.ci_4_rate, '', 'an empty field stays empty');
  const back = B.relabelRows({ ci_1_days: '1', ci_1_rate: '2m', ci_2_rate: '1.5k' }, 'USD', 'INR');
  eq(M.parseAmount(back.ci_1_rate, 'INR'), 2000000, '2m relabelled to ₹ keeps 2,000,000');
  eq(M.parseAmount(back.ci_2_rate, 'INR'), 1500, '1.5k relabelled to ₹ keeps 1,500 either way');
  reset(); film('IN');
  mem.set(CALC, JSON.stringify({ ci_1_days: '10', ci_1_rate: '1.5L' }));
  const before = C.estimateLines(JSON.parse(mem.get(CALC))).reduce((n, l) => n + l.estimate, 0);
  ok(B.setBudgetCurrency('USD'), 'setBudgetCurrency answers true');
  const after = C.estimateLines(JSON.parse(mem.get(CALC))).reduce((n, l) => n + l.estimate, 0);
  eq(after, before, 'the stored total is the same number after the relabel');
  eq(JSON.parse(mem.get(CALC)).ci_currency, 'USD', 'and the label moved');
  reset();
}

/* ---- the hub and dashboard read the budget's currency like the budget page ---- */
{
  const H = await import('../src/lib/hub-status.js');
  const BC = await import('../src/lib/budget-currency.js');
  const cases = [
    [{}, null, { region: 'INT' }], [{}, null, { region: 'IN' }], [{}, null, {}], [{}, null, null],
    [{ ci_1_rate: '5' }, null, { region: 'INT' }], [{ ci_currency: 'USD', ci_1_rate: '5' }, null, { region: 'IN' }],
    [{}, { settings: { currency: 'USD' }, expenses: [] }, { region: 'IN' }], [{}, { settings: {}, expenses: [{ amount: 5 }] }, { region: 'INT' }]
  ];
  for (const [calc, costs, entry] of cases) {
    const proj = entry ? (entry.region === 'INT' ? 'USD' : 'INR') : '';
    eq(BC.calcCurrency(calc, costs, entry), C.resolveCurrency({ calc, costs, project: proj }),
      `calcCurrency agrees with resolveCurrency for ${JSON.stringify([calc, costs, entry])}`);
  }
  reset(); film('INT');
  mem.set(CALC, JSON.stringify({ ci_currency: 'USD', ci_1_days: '1', ci_1_rate: '2m' }));
  const l = H.computeLibraryStatus();
  eq([l.total, l.currency], [2000000, 'USD'], 'the hub\'s Library card parses a dollar budget with the dollar parser');
  reset(); film('IN');
  mem.set(CALC, JSON.stringify({ ci_1_days: '2', ci_1_rate: '1.5L' }));
  eq(H.computeLibraryStatus().total, 300000, 'and a rupee budget exactly as before');
  reset();
}

// fix-money r1: the row's 'days × rate' line keeps a fractional day.
eq(B.rowEquation(2.5, 25000, (n) => M.fmtMoney(n, 'INR')), '2.5 d × ₹ 25,000', 'a fractional day is not rounded in the equation');
eq(B.rowEquation(3, 1500, (n) => M.fmtMoney(n, 'USD')), '3 d × $1,500', 'a whole day reads as before');
eq(B.rowEquation(0, 1500, String), '', 'no days, no equation');

// fix-money r3: cents survive, small totals are exact, a tiny spend is not 0%, negatives are not money.
eq([M.fmtMoney(12.99, 'USD'), M.fmtMoney(0.5, 'USD'), M.fmtMoney(16.9, 'USD'), M.fmtMoney(4, 'USD'), M.fmtMoney(-3.75, 'USD')], ['$12.99', '$0.50', '$16.90', '$4', '\u2212$3.75'], 'a dollar bill keeps its cents; a whole figure prints as before');
eq(M.fmtMoney(1250.5, 'INR'), '\u20b9 1,251', 'a rupee figure is still whole rupees');
reset(); film('INT'); BCM.costContext();
eq([BCM.glance(1200), BCM.glance(45000), BCM.glance(250000)], ['$1,200', '$45,000', '$250k'], 'the header shows a small dollar total exactly');
reset(); film('IN'); BCM.costContext();
eq([BCM.glance(1200), BCM.glance(1499), BCM.glance(250000)], ['\u20b9 1,200', '\u20b9 1,499', '\u20b9 2.5 L'], 'the header shows a small rupee total exactly, lakhs as before');
eq([BCM.pct(0, 5000), BCM.pct(0, 0), BCM.pct(12, 5), BCM.pct(null)], ['<1%', '0%', '12%', '\u2014'], 'a non-zero spend that rounds to 0 reads <1%');
reset(); film('IN');
mem.set(CALC, JSON.stringify({ ci_1_days: '10', ci_1_rate: '1000', ci_2_days: '-5', ci_2_rate: '-1000' }));
const H = await import('../src/lib/hub-status.js');
eq(H.computeLibraryStatus().total, 10000, 'the hub counts a negative-times-negative line as nothing');
const DM = await import('../src/lib/dashboard-model.js');
eq(DM.budgetStatus().total, 10000, 'the dashboard counts it as nothing too');
reset();

console.log(`test:budget-usd — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
