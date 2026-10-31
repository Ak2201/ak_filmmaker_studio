/* test:account-tour — src/lib/account-tour.js, in Node, no browser.
   The first-sign-in tour fails CLOSED: only an explicit "never started"
   is marked, and only an explicit "this call was first" starts it. */
import { parseTourStatus, parseMarkTour, isMissingFn, firstTourCheck } from '../src/lib/account-tour.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m); } };

ok(parseTourStatus({ started: false }) === false && parseTourStatus({ started: true }) === true, '{started} is read');
ok(parseTourStatus({ started: null }) === null, 'signed out ({started:null}) is unknown');
ok(parseTourStatus({ started_at: null, finished_at: null }) === false && parseTourStatus({ started_at: '2026-10-31T00:00:00Z' }) === true, '{started_at} is read');
ok(parseTourStatus([{ started: false }]) === false, 'a one-row set is read');
ok([null, undefined, 'x', 1, [], [{}, {}], {}].every((d) => parseTourStatus(d) === null), 'any other shape is unknown');
ok(parseMarkTour(true) === true && parseMarkTour(false) === false, 'a bare boolean mark');
ok(parseMarkTour({ started: true, first: true }) === true && parseMarkTour({ started: true, first: false }) === false, '{started, first} mark');
ok(parseMarkTour([{ mark_tour_started: true }]) === true, 'a one-row set named after the function');
ok([null, {}, 'true', 1].every((d) => parseMarkTour(d) === null), 'any other mark shape is unknown');
ok(isMissingFn({ code: 'PGRST202' }) && isMissingFn({ code: '42883' }) && !isMissingFn({ code: '42501' }) && !isMissingFn(null), 'missing function codes');

const fake = (answers) => {
  const calls = [];
  const rpc = async (name) => { calls.push(name); const a = answers[name]; if (a instanceof Error) throw a; return a; };
  return { rpc, calls };
};
const run = async (answers) => { const f = fake(answers); const r = await firstTourCheck(f.rpc); return { ...r, calls: f.calls }; };

let r = await run({ tour_status: { data: { started: false } }, mark_tour_started: { data: { started: true, first: true } } });
ok(r.start && r.settled && r.calls.join() === 'tour_status,mark_tour_started', 'never started → marked → starts');
r = await run({ tour_status: { data: { started: false } }, mark_tour_started: { data: { started: true, first: false } } });
ok(!r.start && r.settled, 'another device marked it first → does not start');
r = await run({ tour_status: { data: { started: true } } });
ok(!r.start && r.settled && r.calls.length === 1, 'already started → no mark, no start');
r = await run({ tour_status: { data: { started: null } } });
ok(!r.start && !r.settled && r.calls.length === 1, 'signed out → no mark, no start, asked again later');
r = await run({ tour_status: { data: null, error: { code: 'PGRST202', message: 'not found' } } });
ok(!r.start && r.settled && r.calls.length === 1, 'absent function → settled no, never marked');
r = await run({ tour_status: { data: null, error: { code: '500', message: 'boom' } } });
ok(!r.start && !r.settled && r.calls.length === 1, 'server error → no start, asked again');
r = await run({ tour_status: new Error('offline') });
ok(!r.start && !r.settled, 'a thrown fetch → no start');
r = await run({ tour_status: { data: { started: false } }, mark_tour_started: new Error('offline') });
ok(!r.start && !r.settled, 'the mark failing → no start');
r = await run({ tour_status: { data: { started: false } }, mark_tour_started: { data: 'weird' } });
ok(!r.start && !r.settled, 'an unrecognised mark → no start');
ok((await firstTourCheck(null)).start === false, 'no client → no start');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
