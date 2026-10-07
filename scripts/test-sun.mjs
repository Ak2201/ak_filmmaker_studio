/* ============================================================
   THE SUN — src/lib/sun.js, in Node, no browser
   ------------------------------------------------------------
   Sunrise, sunset and golden hour for Chennai (13.0827 N, 80.2707 E)
   on five dates across the year, against reference values computed
   independently with the `astral` Python library (3.x), which
   implements the same NOAA solar equations — sunrise/sunset at the
   sun's centre at -0.833°, golden hour between -4° and +6°. Tolerance
   is ±2 minutes; the run reports the largest miss it saw.

   Also: the wall clock (IST inside India, the device's offset outside
   it), the polar-day null, the "HH:MM" reader, the past-sunset flag
   (raised only on a time that exists) and the daylight test on scenes.

       node scripts/test-sun.mjs   (or: npm run test:sun)
   ============================================================ */
import Sun from '../src/lib/sun.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* astral 3.2, Observer(13.0827, 80.2707), tz = UTC+05:30. Seconds
   kept where astral gave them, so the tolerance is honest. */
const CHENNAI_REF = [
  { date: '2026-01-15', sunrise: '06:35:18', sunset: '18:01:16', am: ['06:20', '07:04'], pm: ['17:31', '18:15'] },
  { date: '2026-03-20', sunrise: '06:13:27', sunset: '18:19:33', am: ['05:59', '06:40'], pm: ['17:52', '18:33'] },
  { date: '2026-06-21', sunrise: '05:43:57', sunset: '18:37:25', am: ['05:29', '06:13'], pm: ['18:07', '18:52'] },
  { date: '2026-09-23', sunrise: '05:58:14', sunset: '18:04:20', am: ['05:44', '06:25'], pm: ['17:37', '18:17'] },
  { date: '2026-12-21', sunrise: '06:26:20', sunset: '17:47:25', am: ['06:11', '06:56'], pm: ['17:17', '18:02'] }
];
const toMin = (s) => { const [h, m, sec = 0] = s.split(':').map(Number); return h * 60 + m + sec / 60; };
const IST = 330;
let worst = 0;
const near = (got, want, msg) => {
  const d = Math.abs(got - want);
  worst = Math.max(worst, d);
  ok(d <= 2, `${msg} — got ${Sun.clock(got)}, want ${Sun.clock(want)} (off ${d.toFixed(2)} min)`);
};

for (const ref of CHENNAI_REF) {
  const t = Sun.sunTimes(ref.date, Sun.CHENNAI.lat, Sun.CHENNAI.lng);
  ok(t !== null, ref.date + ' computes');
  near(t.sunrise + IST, toMin(ref.sunrise), ref.date + ' sunrise');
  near(t.sunset + IST, toMin(ref.sunset), ref.date + ' sunset');
  near(t.goldenAm[0] + IST, toMin(ref.am[0]), ref.date + ' golden am start');
  near(t.goldenAm[1] + IST, toMin(ref.am[1]), ref.date + ' golden am end');
  near(t.goldenPm[0] + IST, toMin(ref.pm[0]), ref.date + ' golden pm start');
  near(t.goldenPm[1] + IST, toMin(ref.pm[1]), ref.date + ' golden pm end');
  ok(t.sunrise < t.noon && t.noon < t.sunset, ref.date + ' noon between sunrise and sunset');
}

/* daylight(): strings, IST, and the minutes the flag compares */
const jan = Sun.daylight('2026-01-15', Sun.CHENNAI);
eq(jan.zone, 'IST', 'Chennai reads as IST without asking the device');
eq(jan.sunrise, '06:35', 'daylight sunrise string');
ok(/^06:2\d–07:0\d$/.test(jan.goldenAm), 'golden am span string: ' + jan.goldenAm);
ok(Math.abs(jan.sunsetMinutes - toMin('18:01:16')) <= 2, 'sunsetMinutes is local');

/* outside India: the device's offset (getTimezoneOffset is minutes WEST) */
const london = Sun.daylight('2026-06-21', { lat: 51.5074, lng: -0.1278 }, { deviceOffset: -60 });
eq(london.zone, 'this device’s time', 'outside India the label says whose clock');
ok(Math.abs(Sun.minutesOf(london.sunrise) - toMin('04:43')) <= 2, 'London midsummer sunrise ~04:43 BST: ' + london.sunrise);
ok(Math.abs(Sun.minutesOf(london.sunset) - toMin('21:21')) <= 2, 'London midsummer sunset ~21:21 BST: ' + london.sunset);

/* polar day: no sunrise, no fiction */
const svalbard = Sun.sunTimes('2026-06-21', 78.22, 15.65);
eq([svalbard.sunrise, svalbard.sunset], [null, null], 'midnight sun: sunrise and sunset are null');
eq(Sun.daylight('2026-06-21', { lat: 78.22, lng: 15.65 }, { deviceOffset: -120 }).sunset, '', 'and print as empty');

/* bad input */
eq(Sun.sunTimes('not a date', 13, 80), null, 'unreadable date');
eq(Sun.sunTimes('2026-02-31', 13, 80), null, '31 February refused, not rolled into March');
ok(Sun.sunTimes('2028-02-29', 13, 80) !== null, '29 February in a leap year');
ok(Sun.sunTimes('2026-13-01', 13, 80) === null, 'month 13 refused');
eq(Sun.sunTimes('2026-01-15', 95, 80), null, 'latitude out of range');
eq(Sun.daylight('2026-01-15', { lat: '', lng: '' }), null, 'blank place');

/* the clock and the time reader */
eq(Sun.clock(395), '06:35', 'clock');
eq(Sun.clock(-10), '23:50', 'clock wraps below zero');
eq(Sun.clock(null), '', 'clock of null');
eq(Sun.minutesOf('18:40'), 1120, 'minutesOf');
eq(Sun.minutesOf('7:05'), 425, 'minutesOf one-digit hour');
eq(Sun.minutesOf(''), null, 'minutesOf blank');
eq(Sun.minutesOf('25:00'), null, 'minutesOf out of range');
eq(Sun.atOffset(1430, 330), 320, 'atOffset wraps past midnight');

/* the flag: only on a time that exists */
ok(Sun.isPastSunset('18:30', jan), '18:30 is after an 18:01 sunset');
ok(!Sun.isPastSunset('17:30', jan), '17:30 is not');
ok(!Sun.isPastSunset('', jan), 'no wrap typed → no flag');
ok(!Sun.isPastSunset('19:00', null), 'no light → no flag');

/* which scenes need daylight */
ok(Sun.needsDaylight({ intExt: 'EXT', dayNight: 'DAY' }), 'EXT DAY');
ok(Sun.needsDaylight({ intExt: 'INT/EXT', dayNight: 'MORNING' }), 'INT/EXT counts');
ok(!Sun.needsDaylight({ intExt: 'EXT', dayNight: 'NIGHT' }), 'EXT NIGHT does not');
ok(!Sun.needsDaylight({ intExt: 'INT', dayNight: 'DAY' }), 'INT does not');

/* Julian Day sanity: J2000.0 is 2451545.0 at noon, so midnight is .5 earlier */
eq(Sun.julianDay('2000-01-01'), 2451544.5, 'julianDay of 2000-01-01');

console.log(`\n  sun: ${pass} passed, ${fail} failed · largest miss ${worst.toFixed(2)} min`);
process.exit(fail ? 1 : 0);
