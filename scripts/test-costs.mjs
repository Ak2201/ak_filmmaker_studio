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
eq(C.readAll(), { expenses: [], floats: [], crew: {}, payments: [], lines: {}, settings: {}, wageOverrides: {}, versions: [] }, 'empty key reads as eight empty collections');
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

/* floats and payments: Undo restores the exact row (same id, same place) */
{
  const f1 = C.addFloat({ to: 'c-a', amount: '100' }), f2 = C.addFloat({ to: 'c-b', amount: '200' }), f3 = C.addFloat({ to: 'c-c', amount: '300' });
  const fi = C.listFloats().findIndex((x) => x.id === f2.id);
  const fgone = C.removeFloat(f2.id);
  eq(fgone.id, f2.id, 'removeFloat returns the row');
  C.restoreFloat(fgone, fi);
  const fids = C.listFloats().map((x) => x.id);
  eq(fids.slice(-3), [f1.id, f2.id, f3.id], 'a float comes back in its place with its id');
  const p1 = C.addPayment({ contactId: 'c-a', amount: '10' }), p2 = C.addPayment({ contactId: 'c-a', amount: '20' }), p3 = C.addPayment({ contactId: 'c-a', amount: '30' });
  const pi = C.listPayments().findIndex((x) => x.id === p2.id);
  const pgone = C.removePayment(p2.id);
  eq(pgone.id, p2.id, 'removePayment returns the row');
  C.restorePayment(pgone, pi);
  eq(C.listPayments().map((x) => x.id).slice(-3), [p1.id, p2.id, p3.id], 'a payment comes back in its place with its id');
  C.restorePayment(pgone, 0);
  eq(C.listPayments().filter((x) => x.id === p2.id).length, 1, 'restoring twice never duplicates a row');
  for (const f of [f1, f2, f3]) C.removeFloat(f.id);
  for (const p of [p1, p2, p3]) C.removePayment(p.id);
}

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
// fix-money r1: a dollar budget's CSVs name the currency on every money
// column; a rupee budget's headers are byte-identical to before.
eq(C.budgetCSV(rep, 'USD').split('\r\n')[0], 'Account,Description,Amount,Units,Rate (USD),Subtotal (USD)', 'USD budget CSV names its currency');
eq(C.budgetCSV(rep, 'INR'), C.budgetCSV(rep), 'an INR budget CSV is unchanged');
eq(C.actualsCSV(rep, 'USD').split('\r\n')[0], 'Account,Description,Estimate (USD),Actual (incl. GST) (USD),Actual (excl. GST) (USD),GST (USD),TDS withheld (USD),Variance (USD),% used', 'USD actuals CSV names its currency');
ok(C.actualsCSV(rep).startsWith('Account,Description,Estimate,Actual (incl. GST),'), 'INR actuals headers unchanged');
ok(C.expensesCSV([], undefined, undefined, 'USD').startsWith('Date,Shoot day,Budget line,Category,Amount (incl. GST) (USD),GST %,GST (USD),'), 'USD expenses CSV names its currency');
ok(C.expensesCSV([]).startsWith('Date,Shoot day,Budget line,Category,Amount (incl. GST),GST %,GST,'), 'INR expenses headers unchanged');
eq(C.expensesCSV([], undefined, undefined, undefined, false).split('\r\n')[0], 'Date,Shoot day,Budget line,Category,Amount,Vendor,Paid by,Method,Note,Receipt', 'film abroad: expenses CSV drops GST %, GST, GSTIN');
eq(C.actualsCSV(rep, undefined, false).split('\r\n')[0], 'Account,Description,Estimate,Actual,Variance,% used', 'film abroad: actuals CSV drops excl. GST, GST, TDS');
eq(C.actualsCSV(rep, undefined, true), C.actualsCSV(rep), 'India film: actuals CSV unchanged');

/* ---- locked versions, scales ----------------------------------- */
reset();
mem.set(KEY, JSON.stringify({ expenses: [], crew: {} }));
eq(C.listVersions(), [], 'an old blob without versions reads back []');
const vcalc = { ci_1_custom: 'Camera kit', ci_1_days: '10', ci_1_rate: '1000', ci_2_custom: 'Unit food', ci_2_days: '5', ci_2_rate: '200', ci_3_custom: 'Gone line', ci_3_days: '1', ci_3_rate: '500' };
const vlines = C.estimateLines(vcalc);
const vrep = C.costReport({ lines: vlines, contingencyPct: 10 });
const snap = C.snapshotBudget({ lines: vlines, report: vrep, days: 12 });
eq([snap.estimate, snap.contingency, snap.grand, snap.days, snap.atl + snap.btl], [11500, 1150, 12650, 12, 11500], 'snapshotBudget totals from the report and top sheet');
eq(Object.keys(snap.lines[0]), ['id', 'name', 'dept', 'days', 'rate', 'estimate'], 'snapshot line shape');
const v1 = C.lockVersion({ note: 'first', snapshot: snap });
eq(v1.name, 'Budget v1', 'default name');
ok(!Number.isNaN(Date.parse(v1.lockedAt)), 'lockedAt is an ISO date');
snap.lines[0].estimate = 1; snap.lines.push({ id: 'zz' }); snap.estimate = 0;
eq([C.listVersions()[0].lines[0].estimate, C.listVersions()[0].lines.length, C.listVersions()[0].estimate], [10000, 3, 11500], 'snapshot not aliased: mutating the source after locking changes nothing');
const v2 = C.lockVersion({ name: 'Locked 2', snapshot: C.snapshotBudget({ lines: vlines, report: vrep, days: 0 }) });
eq(C.listVersions().map((v) => v.name), ['Budget v1', 'Locked 2'], 'listed oldest first');
C.addExpense({ amount: 100 });
eq(C.listVersions().length, 2, 'THE TRAP: saving an expense does not drop versions');
C.setLineDept('ci_1', 'cast'); C.setSettings({ contingencyPct: 5 }); C.addFloat({ amount: 5 });
eq(C.listVersions().length, 2, 'other writes keep versions too');
const gone = C.removeVersion(v1.id);
eq(C.listVersions().map((v) => v.id), [v2.id], 'removed');
C.restoreVersion(gone, 0); C.restoreVersion(gone, 0);
eq(C.listVersions().map((v) => v.id), [v1.id, v2.id], 'restored at the same index, idempotent on id');
eq(typeof C.updateVersion, 'undefined', 'no update function: locked means immutable');
const nowLines = [
  { id: 'ci_1', name: 'Camera kit', dept: 'camera', days: 12, rate: 1000 },   // changed +2000
  { id: 'ci_2', name: 'Unit food', dept: 'food', days: 5, rate: 200 },        // same
  { id: 'ci_4', name: 'New line', dept: 'cast', days: 1, rate: 300 }           // added; ci_3 removed
];
const frozen = JSON.stringify([C.listVersions()[0], nowLines]);
const cmp = C.compareVersion(C.listVersions()[0], nowLines);
eq(JSON.stringify([C.listVersions()[0], nowLines]), frozen, 'compareVersion mutates nothing');
eq(cmp.total, { then: 11500, now: 13300, delta: 1800 }, 'compare total');
eq(cmp.lines.added.map((l) => l.id), ['ci_4'], 'added');
eq(cmp.lines.removed.map((l) => l.id), ['ci_3'], 'removed');
eq(cmp.lines.changed, [{ id: 'ci_1', name: 'Camera kit', then: 10000, now: 12000, delta: 2000 }], 'changed');
eq(cmp.depts.map((d) => [d.id, d.then, d.now, d.delta]), [['cast', 0, 300, 300], ['camera', 10000, 12000, 2000], ['food', 1000, 1000, 0], ['other', 500, 0, -500]], 'dept deltas, labelled, only non-zero depts');
ok(cmp.depts.every((d) => d.label), 'depts carry DEPTS labels');
reset();
C.setLineScales('ci_1', true);
eq(C.readAll().lines, { ci_1: { scales: true } }, 'scales alone is stored');
C.setLineDept('ci_1', 'camera');
eq(C.readAll().lines, { ci_1: { scales: true, dept: 'camera' } }, 'setting dept keeps scales');
C.setLineScales('ci_1', false);
eq(C.readAll().lines.ci_1, { scales: false, dept: 'camera' }, 'false is a value, and keeps dept');
C.setLineDept('ci_1', '');
eq(C.readAll().lines, { ci_1: { scales: false } }, 'clearing dept keeps scales');
C.setLineDept('ci_2', 'cast'); C.setLineScales('ci_2', true);
eq(C.readAll().lines.ci_2, { dept: 'cast', scales: true }, 'dept first then scales keeps both');
C.setLineScales('ci_2', null);
eq(C.readAll().lines.ci_2, { dept: 'cast' }, 'null clears scales only');
C.setLineScales('ci_1', null);
eq(C.readAll().lines, { ci_2: { dept: 'cast' } }, 'an entry with nothing left is removed');
const sl = C.estimateLines(vcalc, { ci_1: { scales: true }, ci_2: { scales: false, dept: 'food' } });
eq(sl.map((l) => l.scales), [true, false, null], 'estimateLines carries scales (null when unset)');
const srep = C.costReport({ lines: sl });
eq(srep.depts.flatMap((d) => d.lines).filter((l) => !l.unbudgeted).map((l) => l.scales).sort(), [false, null, true].sort(), 'report lines pass scales through');

/* ---- reset never re-issues a line id (audit bug 20) ----------
   ci_3 is the ARRI with spend, a crew line, a department move and a
   locked version. Reset, then a new estimate whose third row is
   Catering. Counting from 1 again (the old resetCalc) binds the camera
   spend to Catering; starting above the high-water mark leaves it
   "not on a budget line", which is what costs.js promises. */
{
  reset();
  const L = await import('../src/lib/budget-line-ids.js');
  const before = { ci_1_item: 'Director', ci_1_days: '10', ci_1_rate: '5000',
    ci_2_item: '', ci_2_days: '', ci_2_rate: '',
    ci_3_item: '', ci_3_custom: 'ARRI Alexa 35', ci_3_days: '10', ci_3_rate: '25000' };
  C.addExpense({ category: 'misc', amount: '40000', line: 'ci_3' });
  C.setLineDept('ci_3', 'camera');
  C.setCrew('c-dop', { fee: '1 lakh', line: 'ci_4' });
  const snap = C.snapshotBudget({ lines: C.estimateLines(before) });
  C.lockVersion({ name: 'v1', snapshot: snap });
  const costs = C.readAll();
  eq(L.highestLineIndex(before, costs), 4, 'high-water reads the calc blob AND every cost reference (crew on ci_4)');
  eq(L.highestLineIndex({}, { versions: [{ lines: [{ id: 'ci_9' }] }] }), 9, 'a locked version alone sets the mark');
  eq(L.highestLineIndex({}, {}), 0, 'nothing used yet → 0');
  eq(L.highestLineIndex('junk', null), 0, 'junk blobs read as nothing');
  const rowAt = (start, n, item) => ({ [`ci_${start + n}_custom`]: item, [`ci_${start + n}_days`]: '10', [`ci_${start + n}_rate`]: '2000' });
  const catering = (start) => ({ ...rowAt(start, 1, 'Tea'), ...rowAt(start, 2, 'Lunch'), ...rowAt(start, 3, 'Catering') });
  const lineOf = (calc, name) => C.costReport({ lines: C.estimateLines(calc, costs.lines), expenses: costs.expenses })
    .depts.flatMap((d) => d.lines).find((l) => l.name === name);
  // The bug, reproduced: row 3 after a count-from-zero reset IS ci_3.
  const old = lineOf(catering(0), 'Catering');
  ok(old.actual === 40000 && old.dept === 'camera', 'reproduced: counting from 1 binds the ARRI spend and dept to Catering');
  // The fix: rows start above the mark.
  const base = L.highestLineIndex(before, costs);
  const fixed = catering(base);
  const cat = lineOf(fixed, 'Catering');
  eq([cat.id, cat.actual, cat.dept], ['ci_7', 0, 'food'], 'after reset Catering is a fresh id with no inherited spend or dept');
  const loose = C.costReport({ lines: C.estimateLines(fixed, costs.lines), expenses: costs.expenses })
    .depts.flatMap((d) => d.lines).find((l) => l.unbudgeted);
  eq(loose && loose.actual, 40000, 'the camera spend shows as not on a budget line, never dropped');
  const cmp = C.compareVersion(C.readAll().versions[0], C.estimateLines(fixed));
  ok(JSON.stringify(cmp).includes('ARRI Alexa 35'), 'the comparison still names the removed ARRI line');
  // Reload draws the span the blob holds, not 1..max.
  eq(L.rowSpan(fixed), { start: 5, count: 5 }, 'a post-reset blob draws from its lowest row');
  eq(L.rowSpan(before), { start: 1, count: 5 }, 'an existing blob from ci_1 draws exactly as before');
  eq(L.rowSpan({ ci_1_item: '', ci_12_rate: '1' }), { start: 1, count: 12 }, 'existing ids are all kept on screen');
  eq(L.rowSpan({}), { start: 1, count: 5 }, 'a new estimate starts at ci_1');
}

/* ---- QA round 2 (Budget & money) ------------------------------ */
{
  reset();
  // A negative days/rate is not a price: it counts as nothing.
  const neg = C.estimateLines({ ci_1_custom: 'Discount', ci_1_days: '1', ci_1_rate: '-5000', ci_2_custom: 'Camera', ci_2_days: '2', ci_2_rate: '1000' });
  eq(neg.map((l) => l.estimate), [0, 2000], 'a negative rate prices at 0, never off the budget');
  const r0 = C.costReport({ lines: neg, expenses: [] });
  eq(C.budgetKpis(r0).over, false, 'nothing spent is never over budget');
  // The top sheet lists only departments that have an estimate.
  const loose = C.costReport({ lines: C.estimateLines({ ci_1_custom: 'Camera', ci_1_days: '1', ci_1_rate: '1000' }),
    expenses: [{ id: 'x1', amount: 2800, category: 'food', line: '' }] });
  const food = C.topSheet(loose).groups.flatMap((g) => g.depts).filter((d) => !d.estimate);
  eq(food.length, 0, 'the top sheet drops a department that has only unbudgeted spend');
  // Comparing a locked version shows a contingency move.
  const lines = C.estimateLines({ ci_1_custom: 'Camera', ci_1_days: '10', ci_1_rate: '1000' });
  const snap = C.snapshotBudget({ lines, report: C.costReport({ lines, expenses: [], settings: { contingencyPct: 10 } }), days: 0 });
  const v = C.lockVersion({ name: 'v1', note: '', snapshot: snap });
  const cmp = C.compareVersion(v, lines, 12000);
  eq([cmp.total.delta, cmp.grand.then, cmp.grand.now, cmp.grand.delta], [0, v.grand, 12000, 12000 - v.grand], 'a contingency move shows in the comparison');
  reset();
}

reset();
console.log(`test:costs — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
