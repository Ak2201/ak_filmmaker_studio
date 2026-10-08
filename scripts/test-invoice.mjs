/* npm run test:invoice — the pure half of buyer invoices (src/lib/invoice.js). */
import { gstinValid, financialYear, invoiceNumber, normaliseGstin } from '../src/lib/invoice.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(a === b, `${m} — got ${a}, want ${b}`);

ok(gstinValid('27AAPFU0939F1ZV'), 'a valid GSTIN passes');
ok(gstinValid(' 27aapfu0939f1zv '), 'case and padding forgiven');
ok(!gstinValid('27AAPFU0939F1ZW'), 'wrong check character fails');
ok(!gstinValid('27AAPFU0939F1XV'), 'no Z fails');
ok(!gstinValid('00AAPFU0939F1ZV'), 'state 00 fails');
ok(!gstinValid('') && !gstinValid(null) && !gstinValid('27AAPFU0939F1Z'), 'empty/null/short fail');
// every single-character change to the check digit is caught
const base = '27AAPFU0939F1Z';
let accepted = 0;
for (const c of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ') if (gstinValid(base + c)) accepted++;
eq(accepted, 1, 'exactly one check character fits a body');
eq(normaliseGstin(' ab1 '), 'AB1', 'normalise');

eq(financialYear('2027-03-31T18:29:00Z'), '2026-27', '31 Mar 23:59 IST');
eq(financialYear('2027-03-31T18:30:00Z'), '2027-28', '1 Apr 00:00 IST');
eq(financialYear('2026-04-01T00:00:00+05:30'), '2026-27', '1 Apr 2026');
eq(financialYear('2026-01-15T12:00:00Z'), '2025-26', 'January belongs to the year before');
eq(financialYear(new Date('2099-12-31T00:00:00Z')), '2099-00', 'century suffix');
eq(invoiceNumber('2026-27', 123), 'FMS/2026-27/000123', 'number');
eq(invoiceNumber('2026-27', 1), 'FMS/2026-27/000001', 'padding');
eq(invoiceNumber('2026-27', 1234567), 'FMS/2026-27/1234567', 'overflow is not truncated');

console.log(`invoice: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
