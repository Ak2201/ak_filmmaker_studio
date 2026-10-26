// parseNum / fmtINR: the cases CLAUDE.md names. Node, no browser.
import { parseNum, fmtINR, fmtMoney } from '../src/lib/money.js';
let bad = 0;
const eq = (name, got, want) => { if (got !== want) { bad++; console.error('FAIL', name, 'got', got, 'want', want); } };
eq('1500 per roll', parseNum('1500 per roll'), 1500);
eq('3 days', parseNum('3 days'), 3);
eq('crew 500', parseNum('crew 500'), 0);
eq('1 lens day', parseNum('1 lens day'), 1);
eq('1.5 lakh', parseNum('1.5 lakh'), 150000);
eq('3L', parseNum('₹3L'), 300000);
eq('2 cr', parseNum('2 cr'), 20000000);
eq('25k', parseNum('25k'), 25000);
eq('25,000', parseNum('25,000'), 25000);
eq('Rs. 25000', parseNum('Rs. 25000'), 25000);
eq('5 thousand', parseNum('5 thousand'), 5000);
eq('bank', parseNum('bank'), 0);
eq('empty', parseNum(''), 0);
// Plurals and rate tails (audit bug 19): whole-string still, so the
// "per roll" trap above must keep holding.
eq('2 lakhs', parseNum('2 lakhs'), 200000);
eq('1.5 Lakhs', parseNum('1.5 Lakhs'), 150000);
eq('2 crores', parseNum('2 crores'), 20000000);
eq('12 lacs', parseNum('12 lacs'), 1200000);
eq('10 thousands', parseNum('10 thousands'), 10000);
eq('25k/day', parseNum('25k/day'), 25000);
eq('2 lakh per day', parseNum('2 lakh per day'), 200000);
eq('1500/day', parseNum('1500/day'), 1500);
eq('INR 5000', parseNum('INR 5000'), 5000);
eq('5000 INR', parseNum('5000 INR'), 5000);
eq('1500 per roll again', parseNum('1500 per roll'), 1500);
eq('1 km per day', parseNum('1 km per day'), 1);
eq('10 crew per day', parseNum('10 crew per day'), 10);
eq('2 kits per day', parseNum('2 kits per day'), 2);
eq('3 rolls', parseNum('3 rolls'), 3);
eq('fmt 0', fmtINR(0), '₹ 0');
eq('fmt 4600', fmtINR(4600), '₹ 5k');
eq('fmt lakh', fmtINR(150000), '₹ 1.5 L');
eq('fmt cr', fmtINR(20000000), '₹ 2 Cr');
// fix-money r1: the Indian '/-' tail after a suffix ("Rs. 25,000/-").
eq('25k/-', parseNum('25k/-'), 25000);
eq('₹2.5L/-', parseNum('₹2.5L/-'), 250000);
eq('Rs. 25k/-', parseNum('Rs. 25k/-'), 25000);
eq('2,50,000/-', parseNum('2,50,000/-'), 250000);
eq('25000/=', parseNum('25000/='), 25000);
// fix-money r1: the short unit follows the ROUNDED figure.
eq('fmt 99,600', fmtINR(99600), '₹ 1 L');
eq('fmt 99,400', fmtINR(99400), '₹ 99k');
eq('fmt 99,99,999', fmtINR(9999999), '₹ 1 Cr');
eq('fmt 99,99,400', fmtINR(9999400), '₹ 99.99 L');
eq('fmt 999.6', fmtINR(999.6), '₹ 1k');
eq('fmt 12.35 Cr', fmtINR(123456789), '₹ 12.35 Cr');
eq('usd short 999,600', fmtMoney(999600, 'USD', true), '$1M');
eq('usd short 999,400', fmtMoney(999400, 'USD', true), '$999k');
eq('usd short 1.25M', fmtMoney(1250000, 'USD', true), '$1.25M');
if (bad) process.exit(1);
console.log('test-money: all passed');
