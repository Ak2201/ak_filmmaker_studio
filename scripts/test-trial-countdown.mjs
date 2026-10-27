// countdown(): the sidebar's live clock. Pure, no browser.
import { countdown, timeLeft, ago } from '../src/lib/trial-time.js';
let bad = 0;
const eq = (got, want, label) => {
  if (got !== want) { bad++; console.log('FAIL', label, JSON.stringify(got), '!=', JSON.stringify(want)); }
  else console.log('ok  ', label, got);
};
const S = 1000, M = 60 * S, H = 60 * M, D = 24 * H;
eq(countdown(28 * M + 41 * S), '28:41', '28:41');
eq(countdown(59 * M + 59 * S), '59:59', 'top of the minutes form');
eq(countdown(H), '1:00:00', 'one hour exactly');
eq(countdown(5 * H + 12 * M + 9 * S), '5:12:09', '5:12:09');
eq(countdown(D - S), '23:59:59', 'top of the hours form');
eq(countdown(D), '1d 0h', 'one day exactly');
eq(countdown(6 * D + 4 * H + 59 * M), '6d 4h', '6d 4h');
eq(countdown(0), '0:00', 'zero');
eq(countdown(-5000), '0:00', 'negative');
eq(countdown(NaN), '0:00', 'NaN');
eq(countdown(1), '0:01', 'a millisecond rounds up to a second');
eq(countdown(9 * M + 5 * S), '9:05', 'seconds are padded, minutes are not');
eq(timeLeft(30 * M), '30 minutes', 'timeLeft unchanged (words)');
eq(timeLeft(90 * M), '1 h 30 min', 'timeLeft unchanged (hours)');
// ago(): the takeover prompt's "last seen" (QA, 26 Oct 2026: it said "1 seconds ago").
eq(ago(1), '1 second ago', 'one second is singular');
eq(ago(0), '0 seconds ago', 'zero seconds');
eq(ago(59), '59 seconds ago', '59 seconds');
eq(ago(60), '1 minute ago', 'one minute');
eq(ago(7200), '2 hours ago', 'two hours, not 120 minutes');
eq(ago(3600), '1 hour ago', 'one hour');
eq(ago(90000), '1 day ago', 'a day, not 1500 minutes');
eq(ago(-3), '0 seconds ago', 'a clock skew is never negative');
if (bad) { console.log(bad + ' failed'); process.exit(1); }
console.log('all passed');
