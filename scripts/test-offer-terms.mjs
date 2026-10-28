#!/usr/bin/env node
/* test:offer-terms — src/lib/offer-terms.js. An auto-renew line always
   says how often and "cancel anytime"; a one-time line says it does not
   renew; an unknown mode says neither. */
import fs from 'node:fs';
import { readMode, offerTerms, everyText, forText, cancelledText, renewsText, CANCEL_AT_MANDATE } from '../src/lib/offer-terms.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

ok(readMode('once') === 'once' && readMode('renew') === 'renew', 'modes read');
for (const bad of [null, undefined, '', 'yes', 1, 'RENEW']) ok(readMode(bad) === null, 'unknown mode ' + JSON.stringify(bad));

const r = offerTerms('renew', '₹99', 'pass', 7);
ok(r.renews === true && r.line === '₹99 every 7 days · renews until you cancel · cancel anytime', 'renew pass: ' + r.line);
ok(/cancel anytime/.test(r.short) && /every 7 days/.test(r.short), 'renew chip: ' + r.short);
const y = offerTerms('renew', '₹599', 'year');
ok(y.line === '₹599 every year · renews until you cancel · cancel anytime', 'renew year: ' + y.line);

const o = offerTerms('once', '₹49', 'pass', 7);
ok(o.renews === false && o.line === '₹49 for 7 days · one payment, nothing renews', 'once pass: ' + o.line);
ok(offerTerms('once', '₹599', 'year').line === '₹599 for a year · one payment, nothing renews', 'once year');

const u = offerTerms(undefined, '₹49', 'pass', 7);
ok(u.renews === null && u.line === '₹49 for 7 days' && u.short === '', 'unknown mode says neither renew nor once: ' + u.line);
ok(!/renew|once|one payment/i.test(u.line), 'unknown mode never guesses');

/* every renew line carries cancel anytime; every once line says nothing renews */
for (const [per, d] of [['pass', 1], ['pass', 7], ['pass', 14], ['year', null]]) {
  ok(/cancel anytime/.test(offerTerms('renew', '₹1', per, d).line), 'renew ' + per + ' ' + d + ' says cancel anytime');
  ok(/nothing renews/.test(offerTerms('once', '₹1', per, d).line), 'once ' + per + ' ' + d + ' says nothing renews');
}
ok(everyText('pass', 1) === 'every day' && forText('pass', 1) === 'for 1 day', 'singular day');
ok(offerTerms('renew', '₹1', 'pass', 0).renews === null, 'no length, no renewal claim');
ok(cancelledText('3 Nov 2026') === 'Auto-pay off · access until 3 Nov 2026', 'cancelled text');
ok(renewsText('3 Nov 2026', '₹99') === 'Renews 3 Nov 2026 · ₹99', 'renews text');
ok(/Razorpay mandate e-mail/.test(CANCEL_AT_MANDATE) && /bank \/ UPI app/.test(CANCEL_AT_MANDATE) && !/Settings/.test(CANCEL_AT_MANDATE), 'cancel is at the mandate, never in the app');

const src = fs.readFileSync(new URL('../src/lib/offer-terms.js', import.meta.url), 'utf8');
ok(!/^\s*import\s/m.test(src), 'offer-terms.js imports nothing (startlib)');

console.log((fail ? '✗' : '✓') + ' offer terms: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
