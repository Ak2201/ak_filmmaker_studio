/* ============================================================
   THE STRIPBOARD'S ORDER — assignment and the order within a day
   ------------------------------------------------------------
   src/lib/locations.js gained the second thing the board writes:
   WHERE on a shoot day a strip sits. Asserted here, in Node, with
   no browser:
     · a day with no list renders in script order — the no-migration
       guarantee — and the stored blob is byte-identical to before;
     · placeScene() assigns the day through the scene (shootDay) and
       keeps both days' lists in step; before / after / index / end;
     · undoPlace() puts the scene, both days and both lists back;
     · nudgeScene() moves one place and stops at the ends;
     · an id in a list with no scene on that day is ignored on read
       and dropped on the next write; a scene missing from the list
       falls in after the listed ones;
     · calendarDays() — what shoot.html, the Plan calendar and the
       readiness check read — carries the order;
     · clearDayOrders() leaves days, recces and media alone;
     · a corrupt `order` collection reads as empty.

       node scripts/test-stripboard.mjs   (or: npm run test:stripboard)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Scenes = (await import('../src/lib/scenes.js')).default;
const L = await import('../src/lib/locations.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const reset = () => { mem.delete('fms_scenes_v1'); mem.delete('fms_locations_v1'); };
const ids = (list) => list.map((s) => s.id);
const dayIds = (d) => ids(L.orderedDayScenes(d));

/* Five scenes, numbered 1..5 in script order; 1, 2, 3 on day 1; 4 on day 2; 5 unscheduled. */
function seed() {
  reset();
  const rows = [];
  for (let i = 1; i <= 5; i++) {
    rows.push(Scenes.addScene({ id: 's' + i, number: String(i), location: 'L' + i, shootDay: i <= 3 ? 1 : i === 4 ? 2 : 0, elements: { cast: ['A' + i] } }));
  }
  return rows;
}

/* ---- no list: script order, and nothing written -------------- */
seed();
L.setDayDate(1, '2026-11-02');
const before = mem.get('fms_locations_v1');
eq(dayIds(1), ['s1', 's2', 's3'], 'a day with no order list is in script order');
eq(dayIds(2), ['s4'], 'one scene, one day');
eq(dayIds(0), ['s5'], 'day 0 answers the unscheduled scenes');
eq(L.dayOrder(1), [], 'no list stored');
eq(L.calendarDays().map((d) => [d.day, ids(d.scenes)]), [[1, ['s1', 's2', 's3']], [2, ['s4']]], 'calendarDays() reads the same order');
eq(mem.get('fms_locations_v1'), before, 'reading wrote nothing');
eq(JSON.parse(before), { days: { 1: '2026-11-02' }, recces: {}, media: [] , order: {} }, 'the blob carries an empty order map beside the three collections');

/* ---- orderByList, pure --------------------------------------- */
const sc = (id) => ({ id });
eq(ids(L.orderByList([sc('a'), sc('b'), sc('c')], [])), ['a', 'b', 'c'], 'empty list is the identity');
eq(ids(L.orderByList([sc('a'), sc('b'), sc('c')], ['c', 'a'])), ['c', 'a', 'b'], 'listed first in list order, then the rest in script order');
eq(ids(L.orderByList([sc('a'), sc('b')], ['zz', 'b', 'b'])), ['b', 'a'], 'an unknown id is skipped; a repeated id counts once');
eq(ids(L.orderByList([], ['a'])), [], 'no scenes, no output');

/* ---- placeScene within a day ---------------------------------- */
seed();
let rec = L.placeScene('s3', 1, { before: 's1' });
eq(dayIds(1), ['s3', 's1', 's2'], 'before: s3 lands in front of s1');
eq(L.dayOrder(1), ['s3', 's1', 's2'], 'the whole day is written, so later reads are stable');
eq([rec.fromDay, rec.toDay, rec.index, rec.fromOrder, rec.toOrder], [1, 1, 0, [], []], 'the record holds both days and both lists as they were');
eq(Scenes.listScenes().find((s) => s.id === 's3').shootDay, 1, 'the scene\'s day is unchanged');
ok(L.undoPlace(rec), 'undo answers true');
eq(dayIds(1), ['s1', 's2', 's3'], 'undo restores script order');
eq(L.dayOrder(1), [], '…and the list is gone again, not stored as []');

rec = L.placeScene('s1', 1, { after: 's3' });
eq(dayIds(1), ['s2', 's3', 's1'], 'after: s1 lands behind s3');
rec = L.placeScene('s3', 1, { index: 0 });
eq(dayIds(1), ['s3', 's2', 's1'], 'index 0 is the top');
rec = L.placeScene('s3', 1);
eq(dayIds(1), ['s2', 's1', 's3'], 'no place means the end');
rec = L.placeScene('s2', 1, { index: 99 });
eq(dayIds(1), ['s1', 's3', 's2'], 'an index past the end clamps to the end');
rec = L.placeScene('s1', 1, { before: 'nope' });
eq(dayIds(1), ['s3', 's2', 's1'], 'an anchor that is not on the day falls back to the end');

/* ---- placeScene across days ----------------------------------- */
seed();
L.placeScene('s3', 1, { before: 's1' });                 // day 1: s3 s1 s2
rec = L.placeScene('s1', 2, { before: 's4' });
eq(Scenes.listScenes().find((s) => s.id === 's1').shootDay, 2, 'moving to another day writes shootDay on the scene');
eq(dayIds(1), ['s3', 's2'], 'the scene left day 1\'s list');
eq(dayIds(2), ['s1', 's4'], '…and sits where it was dropped on day 2');
eq(L.dayOrder(1), ['s3', 's2'], 'day 1\'s stored list no longer names it');
eq([rec.fromDay, rec.toDay, rec.fromOrder, rec.toOrder], [1, 2, ['s3', 's1', 's2'], []], 'the record');
ok(L.undoPlace(rec), 'undo across days');
eq(Scenes.listScenes().find((s) => s.id === 's1').shootDay, 1, 'undo puts the day back on the scene');
eq([dayIds(1), dayIds(2)], [['s3', 's1', 's2'], ['s4']], 'undo puts both racks back');
eq([L.dayOrder(1), L.dayOrder(2)], [['s3', 's1', 's2'], []], '…and both stored lists');

rec = L.placeScene('s5', 3);
eq(Scenes.listScenes().find((s) => s.id === 's5').shootDay, 3, 'an unscheduled scene dropped on a new day is scheduled');
eq(L.calendarDays().map((d) => d.day), [1, 2, 3], 'the new day exists');
eq(L.dayOrder(3), ['s5'], 'with a one-entry list');
rec = L.placeScene('s5', 0);
eq(Scenes.listScenes().find((s) => s.id === 's5').shootDay, 0, 'dropping on "not scheduled" unschedules');
eq(L.dayOrder(3), [], 'day 3\'s list is gone');
eq(L.calendarDays().map((d) => d.day), [1, 2], 'and so is the day');
ok(L.undoPlace(rec), 'undo an unschedule');
eq([Scenes.listScenes().find((s) => s.id === 's5').shootDay, L.dayOrder(3)], [3, ['s5']], 'back on day 3');

eq(L.placeScene('ghost', 1), null, 'a scene that does not exist places nothing');
eq(L.undoPlace(null), false, 'undoing nothing is false');

/* ---- nudgeScene ----------------------------------------------- */
seed();
eq(L.nudgeScene('s1', -1), null, 'the top strip cannot go up');
eq(L.nudgeScene('s3', 1), null, 'the bottom strip cannot go down');
eq(L.nudgeScene('s5', 1), null, 'an unscheduled scene has no day to move within');
rec = L.nudgeScene('s2', -1);
eq(dayIds(1), ['s2', 's1', 's3'], 'up one');
rec = L.nudgeScene('s2', 1);
eq(dayIds(1), ['s1', 's2', 's3'], 'down one');
rec = L.nudgeScene('s1', 1);
eq(dayIds(1), ['s2', 's1', 's3'], 'down from the top');
L.undoPlace(rec);
eq(dayIds(1), ['s1', 's2', 's3'], 'undo a nudge');

/* ---- stale and missing ids ------------------------------------ */
seed();
L.setDayOrder(1, ['s3', 'gone', 's1']);
eq(dayIds(1), ['s3', 's1', 's2'], 'a stale id is ignored; the unlisted s2 falls in after');
L.placeScene('s2', 1, { index: 0 });
eq(L.dayOrder(1), ['s2', 's3', 's1'], 'the next write to the day drops the stale id and names every scene');
Scenes.updateScene('s4', { shootDay: 1 });               // the breakdown, or an import, put s4 on day 1 behind the board's back
eq(dayIds(1), ['s2', 's3', 's1', 's4'], 'a scene that arrived on the day by another path is last');
eq(L.setDayOrder(0, ['s1']), false, 'day 0 takes no list');
eq(L.setDayOrder(1, []), true, 'an empty list is accepted');
eq(L.dayOrder(1), [], '…and deletes the entry');

/* ---- calendarDays carries the order for every reader ---------- */
seed();
L.placeScene('s3', 1, { before: 's1' });
const cal = L.calendarDays();
eq(ids(cal[0].scenes), ['s3', 's1', 's2'], 'calendarDays(): day 1 in shooting order');
eq(cal[0].cast, ['A3', 'A1', 'A2'], 'the day\'s cast follows the same order');
eq(cal[0].eighths, 24, 'and the pages are unchanged by it');
const Shoot = await import('../src/lib/shootday.js');
eq(ids(Shoot.detail(1).scenes), ['s3', 's1', 's2'], 'shootday.detail() — what shoot.html lists — sees the order');

/* ---- clearDayOrders leaves the rest alone --------------------- */
seed();
L.setDayDate(1, '2026-11-02');
L.setRecce('L1', { address: 'here' });
L.addMedia({ title: 'ref' });
L.placeScene('s3', 1, { before: 's1' });
ok(L.clearDayOrders(), 'clearDayOrders writes');
eq(L.listDayOrder(), {}, 'no lists left');
eq(dayIds(1), ['s1', 's2', 's3'], 'script order again');
eq([L.dayDate(1), L.getRecce('L1').address, L.listMedia().length], ['2026-11-02', 'here', 1], 'dates, recces and media untouched');

/* ---- a corrupt order collection ------------------------------- */
seed();
mem.set('fms_locations_v1', JSON.stringify({ days: {}, recces: {}, media: [], order: [1, 2] }));
eq(L.listDayOrder(), {}, 'an array where the map should be reads as empty');
mem.set('fms_locations_v1', JSON.stringify({ days: {}, recces: {}, media: [], order: { 1: 's1', 2: [3, 's2', ''], x: ['s1'], 0: ['s1'] } }));
eq(L.listDayOrder(), { 2: ['s2'] }, 'a non-array value, a non-string id, a non-day key and day 0 are all dropped');
eq(dayIds(1), ['s1', 's2', 's3'], 'and the day still renders');

console.log(`test:stripboard — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
