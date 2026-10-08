/* ============================================================
   THE COST MODEL — src/lib/costs.js, in Node, no browser
   ------------------------------------------------------------
   Asserted:
     · one key, seven collections; a write to one leaves the rest
       byte-identical (the contacts.js lesson);
     · reading writes nothing, and a corrupt blob reads as empty;
     · typed money goes through parseNum ONCE, at the store — "1.5k"
       is stored as 1500, "1500 per roll" as 1500 (the money trap);
     · the estimator's lines are read from its own blob, blank rows
       skipped, departments derived (keyword before section) and
       overridable;
     · GST is split out of a tax-inclusive amount; TDS grosses a
       payment up to its cost;
     · float balances per person and overall, an office expense
       touching no float;
     · days worked: cast from the schedule by name or role, others
       from call sheets, an entered number always wins;
     · the cost report: per line and per department estimate, actual,
       variance, % used, over-budget flags, contingency, spend with no
       line kept (never dropped), and totals that add up;
     · the top sheet's ATL / BTL split and grand total;
     · the wage table: an expired table stays expired, an override
       shows over the published value and is removable;
     · the CSVs: Movie Magic columns, account numbers, a formula-looking
       description defused, negative numbers left numeric.

       node scripts/test-costs.mjs   (or: npm run test:costs)
   ============================================================ */
import { mem } from './node-seams.mjs';

const C = await import('../src/lib/costs.js');
const wages = (await import('../src/data/wages.fefsi.json', { with: { type: 'json' } })).default;

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const KEY = 'fms_costs_v1';
const reset = () => { mem.delete(KEY); mem.delete('fms_library_calc_v1'); };

/* ---- storage ------------------------------------------------- */
reset();
eq(C.readAll(), { expenses: [], floats: [], crew: {}, payments: [], lines: {}, settings: {}, wageOverrides: {} }, 'empty key reads as seven empty collections');
ok(!mem.has(KEY), 'reading wrote nothing');
mem.set(KEY, '{not json');
eq(C.listExpenses(), [], 'corrupt blob reads as empty');
mem.set(KEY, JSON.stringify({ expenses: {}, crew: [], floats: 'x' }));
eq([C.listExpenses(), C.listCrew(), C.listFloats()], [[], {}, []], 'wrong-shaped collections read as empty');
reset();

const e1 = C.addExpense({ date: '2026-11-02', shootDay: '1', category: 'food', amount: '1.5k', paidBy: 'c-ravi', method: 'upi', gstPct: 5, gstin: '33abcde1234f1z5' });
eq(e1.amount, 1500, '"1.5k" stored as 1500');
eq(e1.shootDay, 1, 'shoot day stored as an integer');
eq(e1.gstin, '33ABCDE1234F1Z5', 'GSTIN upper-cased');
ok(C.gstinLooksValid(e1.gstin), 'GSTIN shape accepted');
ok(!C.gstinLooksValid('33ABCDE1234'), 'short GSTIN rejected');
const e2 = C.addExpense({ category: 'props', amount: '1500 per roll', method: 'nonsense', gstPct: 7 });
eq([e2.amount, e2.method, e2.gstPct], [1500, 'cash', 0], '"1500 per roll" is 1500 (not 15 crore); bad method and GST rate fall back');
const e3 = C.addExpense({ category: 'crew 500', amount: 'crew 500' });
eq([e3.category, e3.amount], ['misc', 0], 'no leading number is 0, unknown category is misc');

const beforeFloats = JSON.stringify(C.readAll().expenses);
C.addFloat({ to: 'c-ravi', amount: '10,000', date: '2026-11-01' });
eq(JSON.stringify(C.readAll().expenses), beforeFloats, 'writing floats leaves expenses byte-identical');
C.setCrew('c-hero', { fee: '25k', feeType: 'day', tdsPct: 10 });
eq(C.listFloats().length, 1, 'writing crew leaves floats alone');
eq(C.getCrew('c-hero').fee, 25000, 'crew fee parsed once');
eq(C.getCrew('c-hero').days, '', 'days blank = derive');
C.setCrew('c-hero', { days: '0' });
eq(C.getCrew('c-hero').days, 0, 'a typed 0 is the person\'s word, not "derive"');
C.setCrew('c-hero', { days: '' });

const removed = C.removeExpense(e2.id);
eq(removed.id, e2.id, 'remove returns the row');
eq(C.listExpenses().map((x) => x.id), [e1.id, e3.id], 'removed');
C.restoreExpense(removed, 1);
eq(C.listExpenses().map((x) => x.id), [e1.id, e2.id, e3.id], 'undo puts it back where it was');
C.updateExpense(e3.id, { amount: '2L' });
eq(C.listExpenses()[2].amount, 200000, 'update parses too');
C.removeExpense(e3.id);

/* ---- estimate lines ------------------------------------------ */
const calc = {
  ci_1_item: 'ARRI Alexa 35', ci_1_custom: '', ci_1_days: '18', ci_1_rate: '30000',
  ci_2_item: '', ci_2_custom: '', ci_2_days: '', ci_2_rate: '',
  ci_3_item: 'DOP', ci_3_days: '20', ci_3_rate: '20k',
  ci_4_item: 'Other (custom)', ci_4_custom: 'Lead actor fee', ci_4_days: '1', ci_4_rate: '5L',
  ci_5_item: 'Production Designer', ci_5_days: '30', ci_5_rate: '8000',
  ci_6_item: 'Sound mix studio (Atmos)', ci_6_days: '5', ci_6_rate: '60000',
  ci_7_custom: 'Unit food', ci_7_days: '25', ci_7_rate: '12000',
  ci_8_item: 'Generator 30 KVA', ci_8_days: '18', ci_8_rate: '9000',
  ci_10_custom: 'Mystery line', ci_10_days: '1', ci_10_rate: '1000'
};
let lines = C.estimateLines(calc);
eq(lines.map((l) => l.id), ['ci_1', 'ci_3', 'ci_4', 'ci_5', 'ci_6', 'ci_7', 'ci_8', 'ci_10'], 'blank row skipped, gaps kept');
eq(lines.map((l) => l.dept), ['camera', 'camera', 'cast', 'art', 'post', 'food', 'transport', 'other'], 'departments derived: keyword before section');
eq(lines[1].estimate, 400000, '"20k" × 20 days');
eq(lines[2].estimate, 500000, '"5L" lump on one day');
eq(['1st AD', 'Director', 'Music director', 'Art director', 'Line producer', 'Producer', 'Camera car', 'DOP', 'Steadicam + operator', 'Unit tea'].map(C.defaultDept),
  ['crew', 'direction', 'post', 'art', 'crew', 'producers', 'transport', 'camera', 'lighting', 'food'], 'keyword departments: an AD is below the line, a director above');
eq(C.sectionOf('Cooke S4 lens kit'), 'lens-kits', 'a preset name finds its rate-card section through PRESET_ROW');
lines = C.estimateLines(calc, { ci_10: { dept: 'locations' }, ci_1: { dept: 'bogus' } });
eq([lines[7].dept, lines[7].deptSet, lines[0].dept], ['locations', true, 'camera'], 'a line\'s department is overridable; an unknown one is ignored');
C.setLineDept('ci_10', 'locations');
eq(C.readAll().lines, { ci_10: { dept: 'locations' } }, 'setLineDept stores');
C.setLineDept('ci_10', '');
eq(C.readAll().lines, {}, 'clearing returns to the derived default');

/* ---- GST and TDS --------------------------------------------- */
eq(C.gstSplit(1180, 18), { gross: 1180, tax: 180, net: 1000 }, 'GST split out of an inclusive amount');
eq(C.gstSplit(500, 0), { gross: 500, tax: 0, net: 500 }, 'no GST');
eq(C.paymentCost(9000, 10), { paid: 9000, tds: 1000, cost: 10000 }, 'TDS grosses a payment up');

/* ---- floats -------------------------------------------------- */
const names = { 'c-ravi': 'Ravi', 'c-meena': 'Meena' };
const fb = C.floatBalances(
  [{ to: 'c-ravi', amount: 10000 }, { to: 'c-ravi', amount: 5000 }, { to: 'c-meena', amount: 2000 }],
  [{ paidBy: 'c-ravi', amount: 12000 }, { paidBy: 'c-meena', amount: 2600 }, { paidBy: '', amount: 999 }, { paidBy: 'Driver Kumar', amount: 300 }],
  (id) => names[id]
);
eq(fb.people.map((p) => [p.name, p.issued, p.spent, p.balance]),
  [['Ravi', 15000, 12000, 3000], ['Meena', 2000, 2600, -600], ['Driver Kumar', 0, 300, -300]], 'per-person balances; a free-typed name works');
eq([fb.issued, fb.inHand, fb.owedBack, fb.office], [17000, 3000, 900, 999], 'overall: issued, in hand, owed back, office spend');

/* ---- days worked --------------------------------------------- */
const days = [{ day: 1, cast: ['RAGAVAN', 'KEERTHI'] }, { day: 2, cast: ['RAGAVAN'] }, { day: 3, cast: ['ragavan'] }, { day: 4, cast: ['MAYILVAAGANAM'] }];
const hero = { id: 'c-hero', name: 'Aravind Sekar', role: "RAGAVAN — 'Dragon'", department: 'Cast' };
eq(C.derivedDays(hero, days), { days: 3, source: 'schedule' }, 'cast days from the schedule, by role up to its dash, case-insensitive');
eq(C.derivedDays({ id: 'x', name: 'Keerthi', role: '', department: 'Cast' }, days).days, 1, 'cast by own name');
const sheets = [{ calls: { 'c-dop': '06:00' } }, { calls: { 'c-dop': '' } }, { calls: {} }];
eq(C.derivedDays({ id: 'c-dop', name: 'D', department: 'Camera' }, days, sheets), { days: 2, source: 'call sheets' }, 'crew days from call sheets; "" call counts');
eq(C.derivedDays({ id: 'c-none', name: 'N', department: 'Art' }, days, sheets), { days: 0, source: '' }, 'nothing to derive from');

let acct = C.crewAccount({ fee: 25000, tdsPct: 10 }, [{ amount: 20000 }, { amount: 10000 }], { days: 3, source: 'schedule' });
eq([acct.days, acct.daysSource, acct.gross, acct.tds, acct.net, acct.paid, acct.balance], [3, 'schedule', 75000, 7500, 67500, 30000, 37500], 'per-day fee × derived days, less TDS, less advances');
acct = C.crewAccount({ fee: 25000, days: 5 }, [], { days: 3, source: 'schedule' });
eq([acct.days, acct.daysSource, acct.gross], [5, 'entered', 125000], 'entered days win over the schedule');
acct = C.crewAccount({ fee: 300000, feeType: 'lump' }, [{ amount: 350000 }], { days: 9, source: 'schedule' });
eq([acct.gross, acct.balance], [300000, -50000], 'lump fee ignores days; overpaid shows negative');

/* ---- the cost report ----------------------------------------- */
const contacts = [hero, { id: 'c-dop', name: 'D', department: 'Camera' }, { id: 'c-art', name: 'A', department: 'Art' }];
const rep = C.costReport({
  lines: C.estimateLines(calc),
  expenses: [
    { line: 'ci_7', category: 'food', amount: 354000, gstPct: 18 },   // over the 3,00,000 estimate
    { line: 'ci_8', category: 'transport', amount: 50000, gstPct: 0 },
    { line: '', category: 'location', amount: 20000, gstPct: 0 },     // no line → Locations
    { line: 'ci_99', category: 'props', amount: 4000, gstPct: 5 }     // a line reset away → Art, kept
  ],
  crew: { 'c-hero': { line: 'ci_4', tdsPct: 10 }, 'c-dop': { line: '', tdsPct: 0 } },
  payments: [{ contactId: 'c-hero', amount: 90000 }, { contactId: 'c-dop', amount: 15000 }],
  contacts,
  contingencyPct: 10
});
const line = (id) => rep.depts.flatMap((d) => d.lines).find((l) => l.id === id);
eq([line('ci_7').actual, line('ci_7').actualNet, line('ci_7').gst, line('ci_7').over, line('ci_7').pctUsed], [354000, 300000, 54000, true, 118], 'food line: with and without GST, flagged over');
eq([line('ci_4').actual, line('ci_4').tds, line('ci_4').over, line('ci_4').variance], [100000, 10000, false, 400000], 'crew payment on its line, grossed up for TDS');
eq(line('unbudgeted:locations:spend').actual, 20000, 'spend with no line lands in its category\'s department');
eq(line('unbudgeted:art:spend').actual, 4000, 'spend on a vanished line is kept, not dropped');
eq(line('unbudgeted:camera:crew').actual, 15000, 'crew with no line lands in their department');
eq(line('unbudgeted:camera:crew').pctUsed, null, 'no estimate → % used is null, not Infinity');
ok(line('unbudgeted:camera:crew').over, 'unbudgeted spend is over by definition');
const T = rep.totals;
const estSum = C.estimateLines(calc).reduce((s, l) => s + l.estimate, 0);
eq(T.estimate, estSum, 'estimate total = sum of lines');
eq(T.contingency, Math.round(estSum * 0.1 * 100) / 100, 'contingency is a % of the estimate');
eq(T.actual, 354000 + 50000 + 20000 + 4000 + 100000 + 15000, 'actual total adds every rupee once');
eq(T.gst, 54000 + Math.round(4000 * 5 / 105 * 100) / 100, 'GST total');
eq(T.variance, Math.round((T.estimateWithContingency - T.actual) * 100) / 100, 'variance against estimate + contingency');
eq(rep.depts.map((d) => d.acct), ['1400', '2200', '2500', '2600', '2700', '2800', '3100', '4100'], 'departments in chart-of-accounts order, empty ones omitted');
eq(rep.depts.reduce((s, d) => s + d.actual, 0), T.actual, 'department actuals add to the total');

/* ---- top sheet ------------------------------------------------- */
const ts = C.topSheet(rep);
eq(ts.atl, 500000, 'ATL is the cast line');
eq(ts.atl + ts.btl, ts.subtotal, 'ATL + BTL = subtotal');
eq(ts.grand, T.estimateWithContingency, 'grand total includes contingency');
eq(ts.groups.map((g) => g.id), ['atl', 'btl', 'post', 'other'], 'four groups');

/* ---- wage table ------------------------------------------------ */
eq(wages.status, 'expired', 'the wage table ships EXPIRED');
ok(/expired/i.test(wages.statusNote) && /confirm/i.test(wages.statusNote), 'the status note says expired and confirm');
ok(wages.rows.every((r) => r.bata === null), 'no per-craft figure is invented');
ok(new Set(wages.rows.map((r) => r.id)).size === wages.rows.length, 'row ids unique (they are storage keys)');
ok(wages.validFrom && wages.validTo && wages.version, 'versioned');
C.setWageOverride('driver', { bata: '1,200', otRule: 'half bata per 2 hours' });
let wr = C.wageRows(wages, C.readAll().wageOverrides);
const drv = wr.find((r) => r.id === 'driver');
eq([drv.bata, drv.published.bata, drv.otRule, drv.overridden], [1200, null, 'half bata per 2 hours', ['bata', 'otRule']], 'override over the published value');
eq(wr[0].id, 'general', 'the reported general figure leads');
C.setWageOverride('driver', { bata: '', otRule: '' });
eq(C.readAll().wageOverrides, {}, 'clearing every field removes the override');

/* ---- CSV -------------------------------------------------------- */
const csv = C.budgetCSV(rep).split('\r\n');
eq(csv[0], 'Account,Description,Amount,Units,Rate,Subtotal', 'Movie Magic columns');
ok(csv.includes('1400,CAST,,,,500000'), 'department header row with its total');
ok(csv.includes('1400-01,Lead actor fee,1,Days,500000,500000'), 'account-numbered line');
ok(csv.some((r) => r.startsWith(',GRAND TOTAL')), 'grand total row');
ok(!csv.some((r) => /unbudgeted|not on a budget line/i.test(r)), 'the budget CSV holds only budgeted lines');
const act = C.actualsCSV(rep);
ok(/,-\d/.test(act), 'negative variance stays a bare number');
eq(C.toCSV([['=SUM(A1)', 'a,b', 'say "hi"']]), '"\'=SUM(A1)","a,b","say ""hi"""\r\n', 'formula defused, commas and quotes escaped');
const ex = C.expensesCSV([{ date: '2026-11-02', shootDay: 1, line: 'ci_7', category: 'food', amount: 1180, gstPct: 18, vendor: 'Saravana', gstin: '', paidBy: 'c-ravi', method: 'upi', note: '', receipt: '' }], () => 'Unit food', (id) => names[id]);
ok(ex.includes('2026-11-02,1,Unit food,Food,1180,18,180,Saravana,,Ravi,UPI'), 'expense CSV row');

reset();
console.log(`test:costs — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
