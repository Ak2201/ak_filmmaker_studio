/* ============================================================
   SCHEDULE IMPACT — src/lib/schedule-impact.js, in Node
   ------------------------------------------------------------
   Asserted: a lone scene frees its day; one of two does not and
   apportions by eighths; cutting both frees it; unscheduled
   scenes; the scaling heuristic and both overrides; zero lines,
   zero days, NaN eighths, rounding; no input is mutated.

       node scripts/test-impact.mjs   (or: npm run test:impact)
   ============================================================ */
const I = await import('../src/lib/schedule-impact.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const deepFreeze = (o) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.values(o).forEach(deepFreeze); } return o; };

const scenes = deepFreeze([
  { id: 'a', shootDay: '1', eighths: 8 },
  { id: 'b', shootDay: 2, eighths: 3 },
  { id: 'c', shootDay: 2, eighths: 1 },
  { id: 'd', shootDay: '', eighths: 4 },
  { id: 'e', shootDay: 'x', eighths: NaN },
  { id: 'f', shootDay: 3 }
]);

/* dayOf */
eq(I.dayOf({ shootDay: '3' }), 3, 'dayOf parses strings');
eq(I.dayOf({ shootDay: 0 }), 0, 'dayOf 0');
eq(I.dayOf({ shootDay: -2 }), 0, 'dayOf negative');
eq(I.dayOf({}), 0, 'dayOf missing');
eq(I.dayOf(null), 0, 'dayOf null');

/* scheduleDays */
const sd = I.scheduleDays(scenes);
eq(sd.map((d) => d.day), [1, 2, 3], 'days ascending, scheduled only');
eq(sd[1].eighths, 4, 'eighths summed');
eq(sd[2].eighths, 0, 'missing eighths is 0');
eq(sd[1].scenes.map((s) => s.id), ['b', 'c'], 'scenes grouped');
eq(I.scheduleDays([]), [], 'empty schedule');
eq(I.scheduleDays(undefined), [], 'undefined schedule');
eq(I.scheduleDays([{ id: 'n', shootDay: 1, eighths: NaN }])[0].eighths, 0, 'NaN eighths treated as 0');

/* isScaling */
ok(I.isScaling({ scales: true, days: 1, rate: 0 }, 5) === true, 'scales:true wins');
ok(I.isScaling({ scales: false, days: 5, rate: 100 }, 5) === false, 'scales:false wins');
ok(I.isScaling({ days: 5, rate: 100 }, 5) === true, 'heuristic: days === dayCount');
ok(I.isScaling({ scales: null, days: '5', rate: '100' }, 5) === true, 'heuristic with strings and null');
ok(I.isScaling({ days: 4, rate: 100 }, 5) === false, 'heuristic: different days');
ok(I.isScaling({ days: 5, rate: 0 }, 5) === false, 'heuristic: zero rate');
ok(I.isScaling({ days: 0, rate: 100 }, 0) === false, 'heuristic: zero dayCount');

/* perDayCost */
const lines = deepFreeze([
  { id: 'l1', days: 5, rate: 1000 },
  { id: 'l2', days: 5, rate: 250.5 },
  { id: 'l3', days: 2, rate: 9999 },
  { id: 'l4', days: 2, rate: 500, scales: true },
  { id: 'l5', days: 5, rate: 700, scales: false }
]);
const pc = I.perDayCost(lines, 5);
eq(pc.scalingIds, ['l1', 'l2', 'l4'], 'scaling ids');
eq(pc.perDay, 1750.5, 'perDay sums rates');
eq(pc.total, 8752.5, 'total = perDay * dayCount');
eq(I.perDayCost([{ id: 'x', days: 3, rate: 10 }], 5), { perDay: 0, scalingIds: [], total: 0 }, 'zero scaling lines');
eq(I.perDayCost([], 5), { perDay: 0, scalingIds: [], total: 0 }, 'no lines');
eq(I.perDayCost(undefined, 5).perDay, 0, 'undefined lines');
const z = I.perDayCost(lines, 0);
eq(z.scalingIds, ['l4'], 'zero dayCount: only explicit scales');
eq(z.total, 0, 'zero dayCount: total 0');
eq(I.perDayCost([{ id: 'r', rate: 0.1, scales: true }, { id: 's', rate: 0.2, scales: true }], 3).perDay, 0.3, 'perDay rounded to 2dp');

/* whatIfCut */
const cutA = I.whatIfCut(scenes[0], scenes, 1000);
eq(cutA, { sceneId: 'a', day: 1, freesDay: true, saves: 1000, apportioned: 1000, dayEighths: 8, othersOnDay: 0 }, 'lone scene frees its day');
const cutB = I.whatIfCut(scenes[1], scenes, 1000);
eq(cutB.freesDay, false, 'one of two does not free');
eq(cutB.saves, 0, 'no saving when day stays');
eq(cutB.apportioned, 750, 'apportioned 3/4');
eq(cutB.othersOnDay, 1, 'others on day');
eq(cutB.dayEighths, 4, 'day eighths');
eq(I.whatIfCut(scenes[2], scenes, 1000).apportioned, 250, 'apportioned 1/4');
eq(I.whatIfCut(scenes[2], scenes, 100.555).apportioned, 25.14, 'apportioned rounded 2dp');
const cutD = I.whatIfCut(scenes[3], scenes, 1000);
eq(cutD, { sceneId: 'd', day: 0, freesDay: false, saves: 0, apportioned: 0, dayEighths: 0, othersOnDay: 0 }, 'unscheduled scene');
const cutF = I.whatIfCut(scenes[5], scenes, 1000);
ok(cutF.freesDay && cutF.saves === 1000, 'lone scene with missing eighths still frees');
eq(cutF.apportioned, 0, 'zero dayEighths apportions 0');

/* whatIfAll */
const all = I.whatIfAll(scenes, 1000);
eq(all.map((r) => r.sceneId), ['a', 'b', 'c', 'd', 'e', 'f'], 'whatIfAll keeps scene order');
eq(all.map((r) => r.freesDay), [true, false, false, false, false, true], 'whatIfAll frees');
eq(I.whatIfAll([], 1000), [], 'whatIfAll empty');

/* whatIfCutMany */
eq(I.whatIfCutMany(['b', 'c'], scenes, 1000), { days: 1, saves: 1000, freedDays: [2] }, 'cutting both frees the day');
eq(I.whatIfCutMany(['b'], scenes, 1000), { days: 0, saves: 0, freedDays: [] }, 'cutting one of two frees nothing');
eq(I.whatIfCutMany(['a', 'b', 'c', 'f'], scenes, 500), { days: 3, saves: 1500, freedDays: [1, 2, 3] }, 'all days freed');
eq(I.whatIfCutMany(['d'], scenes, 1000), { days: 0, saves: 0, freedDays: [] }, 'unscheduled frees nothing');
eq(I.whatIfCutMany([], scenes, 1000).days, 0, 'empty set');

/* projectedEstimate */
eq(I.projectedEstimate({ estimate: 10000, perDay: 1000, fromDays: 5, toDays: 4 }), 9000, 'one day shorter');
eq(I.projectedEstimate({ estimate: 10000, perDay: 1000, fromDays: 5, toDays: 7 }), 12000, 'two days longer');
eq(I.projectedEstimate({ estimate: 500, perDay: 1000, fromDays: 5, toDays: 3 }), 0, 'never below 0');
eq(I.projectedEstimate({ estimate: 100, perDay: 0.333, fromDays: 0, toDays: 1 }), 100.33, 'rounded 2dp');

/* default export carries the same surface */
for (const k of ['dayOf', 'scheduleDays', 'isScaling', 'perDayCost', 'whatIfCut', 'whatIfAll', 'whatIfCutMany', 'projectedEstimate']) {
  ok(I.default[k] === I[k], `default export has ${k}`);
}

/* Frozen inputs: every call above ran on deep-frozen data (strict mode
   would have thrown on a write). Run once more explicitly. */
let threw = false;
try {
  I.scheduleDays(scenes); I.perDayCost(lines, 5); I.whatIfAll(scenes, 1); I.whatIfCutMany(['a'], scenes, 1);
} catch (e) { threw = true; }
ok(!threw, 'no function mutates its (frozen) inputs');
ok(scenes.length === 6 && scenes[0].shootDay === '1', 'inputs unchanged');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
