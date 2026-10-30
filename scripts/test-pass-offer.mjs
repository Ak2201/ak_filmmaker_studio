#!/usr/bin/env node
/* test:pass — src/lib/pass-offer.js, the launch pass's pure model.
   The scarcity must be true: the countdown runs on the server's clock,
   fails closed on any missing field, and closes at zero or at the cap. */
import fs from 'node:fs';
import { readPass, passState, serverNowOf, offerFlags, countdownText, passPrice, passLength, leftText } from '../src/lib/pass-offer.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const NOW = Date.parse('2026-10-27T10:00:00Z');
const base = { open: true, amount_paise: 4900, days: 7, plan: 'pro', ends_at: '2026-10-30T10:00:00Z', cap: null, left: null, now: '2026-10-27T10:00:00Z' };

/* fails closed */
for (const bad of [null, undefined, [], 'x', {}, { ...base, amount_paise: 0 }, { ...base, days: null }, { ...base, amount_paise: '4900' }])
  ok(passState(bad, NOW).state === 'none', 'no usable offer for ' + JSON.stringify(bad));
ok(passState({ ...base, open: false }, NOW).state === 'closed', 'open:false is closed');
ok(passState({ ...base, open: 'true' }, NOW).state === 'closed', 'open must be the boolean true');

/* open, with a countdown */
const st = passState(base, NOW);
ok(st.state === 'open' && st.msLeft === 3 * 86400000, 'three days left on the server clock');
ok(countdownText(st.msLeft) === '3d 00:00:00', 'countdown text "3d 00:00:00": ' + countdownText(st.msLeft));
ok(countdownText(3723000) === '01:02:03', 'under a day has no "d"');
ok(countdownText(0) === '' && countdownText(null) === '', 'nothing to count is empty');

/* the visitor's clock cannot move the deadline */
const skew = passState(base, NOW + 5 * 86400000, NOW + 5 * 86400000);   // visitor clock 5 days fast, read just now
ok(skew.state === 'open' && skew.msLeft === 3 * 86400000, 'a fast local clock still shows the server countdown');
const later = passState(base, NOW + 3600000, NOW);                      // an hour after the reading
ok(later.msLeft === 3 * 86400000 - 3600000, 'the countdown advances with elapsed local time');
ok(passState(base, NOW + 3 * 86400000, NOW).state === 'closed', 'at zero the offer is closed');

/* no deadline: no timer */
const nod = passState({ ...base, ends_at: null }, NOW);
ok(nod.state === 'open' && nod.msLeft === null, 'no deadline, no timer');

/* the cap */
const capped = passState({ ...base, cap: 500, left: 312 }, NOW);
ok(capped.left === 312 && leftText(capped) === '312 of 500 left', 'the real remaining count');
ok(passState({ ...base, cap: 500, left: 0 }, NOW).state === 'closed', 'none left is closed');
ok(leftText(st) === '', 'no cap, no count');

/* display */
const p = readPass(base);
ok(passPrice(p) === '₹49' && passLength(p) === '7 days', 'price and length: ' + passPrice(p) + ' / ' + passLength(p));
ok(passPrice(readPass({ ...base, amount_paise: 9900 })) === '₹99', 'the console can make it ₹99');
ok(passLength(readPass({ ...base, days: 1 })) === '1 day', 'one day is singular');

/* the server's clock and the reply's switches, read here only */
ok(serverNowOf(base, NOW, NOW + 5000) === NOW + 5000 && serverNowOf({ ...base, now: '2026-10-27T13:00:00Z' }, NOW, NOW) === NOW + 3 * 3600e3, 'serverNowOf: the block\'s now plus the local time since it arrived');
ok(serverNowOf({ ...base, now: undefined }, NOW, NOW) === null && serverNowOf(null, NOW, NOW) === null && serverNowOf(base, NaN, NOW) === null, 'serverNowOf: no usable now is null, never the local clock');
ok(serverNowOf(base, NOW, NOW - 1000) === NOW, 'serverNowOf: a clock that ran backwards adds nothing');
const fl = offerFlags({ purchase_required: false, trial_enabled: true }), f0 = offerFlags(null), fs1 = offerFlags({ purchase_required: 'false', trial_enabled: 'true' });
ok(fl.off === true && fl.trialOpen === true && f0.off === false && f0.trialOpen === false && fs1.off === false && fs1.trialOpen === false, 'offerFlags: only the booleans count; anything else is not off and no trial');

/* import-free (startlib) */
const src = fs.readFileSync(new URL('../src/lib/pass-offer.js', import.meta.url), 'utf8');
ok(!/^\s*import\s/m.test(src), 'pass-offer.js imports nothing (startlib)');

console.log((fail ? '✗' : '✓') + ' pass offer: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
