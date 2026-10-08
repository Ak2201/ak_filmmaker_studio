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

/* ============================================================
   THE DAY'S OWN RECORDS — src/lib/dpr.js (DPR, banners, kit,
   the one-liner), all inside fms_locations_v1, no new key.
   ============================================================ */
const D = (await import('../src/lib/dpr.js')).default;

/* ---- byte-identity: an unused record is no record ------------- */
seed();
L.setDayDate(1, '2026-11-02');
const plain = mem.get('fms_locations_v1');
eq(Object.keys(JSON.parse(plain)), ['days', 'recces', 'media', 'order'], 'no dpr / banners / kit / prefs in a blob that never used them');
D.saveDPR(1, { crewCall: '07:00' });
ok(JSON.parse(mem.get('fms_locations_v1')).dpr['1'].crewCall === '07:00', 'a DPR lands inside fms_locations_v1 under dpr["1"]');
D.saveDPR(1, { crewCall: '' });
eq(mem.get('fms_locations_v1'), plain, 'emptying the only DPR field deletes the record and the collection — byte-identical again');
ok(![...mem.keys()].some((k) => /dpr|kit|banner/i.test(k)), 'no new storage key was created');

/* ---- times --------------------------------------------------- */
eq([D.toMinutes('07:30'), D.toMinutes('7:05'), D.toMinutes('25:00'), D.toMinutes('')], [450, 425, null, null], 'toMinutes');
eq([D.span('07:00', '19:30'), D.span('18:00', '06:00'), D.span('', '1:00')], [750, 720, null], 'span, across midnight for a night shoot');
eq([D.formatMinutes(750), D.formatMinutes(45), D.formatMinutes(null)], ['12h 30m', '45m', '—'], 'formatMinutes');

/* ---- the DPR: stored half ------------------------------------- */
seed();
L.setDayDate(1, '2026-11-02');
D.saveDPR(1, { crewCall: '07:00', firstShot: '08:15', lunchIn: '13:00', lunchOut: '13:45', wrap: '19:00', cameraWrap: '18:40', setups: '22', weather: 'Clear, 34°', bogus: 'x' });
const dl = D.addDelay(1, { reason: 'Light', minutes: '25' });
D.addDelay(1, { reason: 'Cast late', minutes: '40' });
D.addIncident(1, { what: 'Grip cut a finger', action: 'First aid on set' });
const dprRec = D.getDPR(1);
eq([dprRec.crewCall, dprRec.setups, dprRec.delays.length, dprRec.incidents.length], ['07:00', '22', 2, 1], 'times, setups, delays and incidents read back');
ok(!('bogus' in JSON.parse(mem.get('fms_locations_v1')).dpr['1']), 'unknown fields are not stored');
D.updateDelay(1, dl.id, { minutes: '30' });
eq(D.getDPR(1).delays.map((x) => x.minutes), ['30', '40'], 'updateDelay');
D.removeDelay(1, dl.id);
eq(D.getDPR(1).delays.map((x) => x.reason), ['Cast late'], 'removeDelay');
eq(D.getDPR(2).crewCall, '', 'a day with no DPR reads as blank');

/* ---- the DPR: derived half reads the set's marks, never writes them */
seed();
L.setDayDate(1, '2026-11-02');
Scenes.updateScene('s1', { eighths: 8, shotState: 'shot', shotAt: '2026-11-02T06:30:00' });
Scenes.updateScene('s2', { eighths: 4, shotState: 'part', shotAt: '2026-11-02T08:00:00' });
Scenes.updateScene('s3', { eighths: 12 });
Scenes.updateScene('s4', { eighths: 3, shotState: 'shot', shotAt: '2026-11-02T10:00:00' });   // day 2's scene, picked up on day 1's date
D.saveDPR(1, { crewCall: '07:00', firstShot: '08:00', lunchIn: '13:00', lunchOut: '14:00', wrap: '19:00' });
D.addDelay(1, { minutes: '15' }); D.addDelay(1, { minutes: 'x' });
const scenesBefore = mem.get('fms_scenes_v1');
const sum = D.dprSummary(1);
eq([sum.planned.length, sum.shot.length, sum.part.length, sum.unmarked.length], [3, 1, 1, 1], 'planned vs shot from shotState');
eq([sum.pagesPlanned, sum.pagesShot, sum.pagesPart], ['3', '1', '4/8'], 'pages planned, shot and part');
eq(ids(sum.pickups), ['s4'], 'a scene from another day marked on this day\'s date is a pickup');
eq([sum.delayMinutes, sum.dayMinutes, sum.lunchMinutes, sum.workMinutes, sum.callToFirstShot], [15, 720, 60, 660, 60], 'delay total, day length, lunch, worked, call to first shot');
eq(mem.get('fms_scenes_v1'), scenesBefore, 'deriving the DPR wrote nothing to the scenes');
L.setDayDate(1, '');
eq(D.dprSummary(1).pickups, [], 'no date, no pickups — they are only knowable by date');

/* ---- banners -------------------------------------------------- */
seed();
const mv = D.addBanner(1, { kind: 'move', from: 'L1', to: 'L2', after: 's1' });
const top = D.addBanner(1, { kind: 'note', text: 'Unit call 6am' });
const off = D.addBanner(1, { kind: 'holiday', text: 'Sunday' });
eq([top.after, off.after], ['', D.AFTER_DAY], 'a note defaults to the top of the day, a holiday to after it');
const lay = () => D.layoutDay(L.orderedDayScenes(1), D.listBanners(1)).map((x) => x.type === 'scene' ? x.scene.id : x.banner.kind);
eq(lay(), ['note', 's1', 'move', 's2', 's3', 'holiday'], 'layoutDay: top, after its scene, end');
L.placeScene('s1', 1, { after: 's3' });
eq(lay(), ['note', 's2', 's3', 's1', 'move', 'holiday'], 'a move anchored to a scene travels with that scene when the strips are re-ordered');
L.placeScene('s1', 2);
eq(lay(), ['note', 's2', 's3', 'move', 'holiday'], 'its scene left the day: the banner falls to the end rather than vanishing');
eq(D.bannerText(mv), 'Company move: L1 → L2', 'bannerText');
D.updateBanner(1, mv.id, { to: 'L9', text: '40 min' });
eq(D.bannerText(D.listBanners(1)[0]), 'Company move: L1 → L9 — 40 min', 'updateBanner');
D.removeBanner(1, top.id); D.removeBanner(1, mv.id); D.removeBanner(1, off.id);
ok(!('banners' in JSON.parse(mem.get('fms_locations_v1'))), 'removing the last banner removes the collection');
eq(D.impliedMoves(L.orderedDayScenes(1)).map((m) => m.from + '>' + m.to), ['L2>L3'], 'impliedMoves: where consecutive locations differ');
ok(L.dayOrder(1).every((id) => !/^bn_/.test(id)), 'banners never enter the order lists');

/* ---- load ----------------------------------------------------- */
eq(D.pageTarget(), 39, 'default target 4 7/8 pages');
eq([D.dayLoad(40).over, D.dayLoad(39).over, D.dayLoad(20, 16).over], [true, false, true], 'dayLoad');
D.setPageTarget(32);
eq(D.pageTarget(), 32, 'a configured target');
ok(JSON.parse(mem.get('fms_locations_v1')).prefs.pageTarget === 32, 'stored as prefs.pageTarget inside the same blob');
D.setPageTarget(39);
ok(!('prefs' in JSON.parse(mem.get('fms_locations_v1'))), 'setting it back to the default removes the preference');
eq([D.estimateHours(0), Math.round(D.estimateHours(39 / 8 * 60) * 10) / 10], [null, 12], 'estimateHours: the target\'s screen time is one working day');

/* ---- kit ------------------------------------------------------ */
eq(['ARRI Alexa 35', 'Cooke S4 lens kit', 'Aputure 600D Pro', 'Dolly + 30ft track', 'Sound recordist + kit',
    'Generator 30 KVA', 'Blackmagic 6K Pro', 'Production van', 'DOP', 'Camera car', 'Period costumes x 12', 'Hero props'].map(D.classifyEquipment),
   ['camera', 'camera', 'lighting', 'grip', 'sound', 'lighting', 'camera', '', '', 'grip', 'costume', 'art'], 'classifyEquipment');
const blob = { ci_1_item: 'ARRI Alexa 35', ci_1_days: '18', ci_2_item: 'DOP', ci_3_item: 'Other (custom)', ci_3_custom: 'Haze machine light kit', ci_10_item: 'Dolly + 30ft track', ci_4_item: '' };
eq(D.calcLines(blob).map((l) => l.item), ['ARRI Alexa 35', 'DOP', 'Haze machine light kit', 'Dolly + 30ft track'], 'calcLines: row order, custom names win, blanks and "Other" dropped');
seed();
mem.set('fms_library_calc_v1', JSON.stringify(blob));
const calcBefore = mem.get('fms_library_calc_v1');
eq(D.seedKitFromCalc(1), 3, 'seeded three kit lines (DOP is crew, not kit)');
eq(D.seedKitFromCalc(1), 0, 'seeding twice adds nothing');
eq(mem.get('fms_library_calc_v1'), calcBefore, 'the estimator is read, never written');
const kit = D.getKit(1);
eq([kit.camera.length, kit.lighting.length, kit.grip.length, kit.art.length], [1, 1, 1, 0], 'into their departments');
D.updateKitItem(1, kit.camera[0].id, { pickup: true, vendor: 'Prime Focus', qty: '2' });
eq(D.kitTally(D.getKit(1)), { items: 3, picked: 1, back: 0 }, 'kitTally');
eq(D.copyKit(1, 2), 3, 'copy to the next day');
const k2 = D.getKit(2);
eq([k2.camera[0].vendor, k2.camera[0].qty, k2.camera[0].pickup, k2.camera[0].id !== kit.camera[0].id], ['Prime Focus', '2', false, true], 'a copy keeps qty and vendor, clears the ticks, gets new ids');
D.addKitItem(2, 'costume', { item: 'Saree x 3' });
ok(D.addKitItem(2, 'catering', { item: 'x' }) === null, 'an unknown department is refused');
D.removeKitItem(2, k2.camera[0].id);
eq(D.getKit(2).camera.length, 0, 'removeKitItem');
mem.delete('fms_library_calc_v1');
mem.set('fms_locations_v1', JSON.stringify({ days: {}, recces: {}, media: [], order: {}, kit: { 1: [1, 2], 2: { camera: 'x', grip: [{ item: 'Slider', pickup: 'yes' }] } }, dpr: [], banners: { 1: 'x' } }));
eq([D.getKit(1).camera, D.getKit(2).camera, D.getKit(2).grip[0].pickup, D.getDPR(1).crewCall, D.listBanners(1)], [[], [], false, '', []], 'corrupt collections read as empty, a non-boolean tick reads unticked');

/* ---- the one-liner -------------------------------------------- */
seed();
Scenes.updateScene('s2', { elements: { cast: ['A1', 'B'] } });
Scenes.updateScene('s3', { elements: { cast: ['A1'] } });
L.setDayDate(2, '2026-11-03');
D.addBanner(1, { kind: 'move', from: 'L1', to: 'L2', after: 's1' });
D.addBanner(1, { kind: 'holiday' });
const cn = D.castNumbers(Scenes.listScenes());
eq(cn.legend.map((c) => c.number + ':' + c.name), ['1:A1', '2:B', '3:A4', '4:A5'], 'cast numbers: most scenes first, ties by first appearance');
const one = D.oneLiner();
eq(one.days.map((d) => [d.day, d.date, d.pages]), [[1, '', '3'], [2, '2026-11-03', '1']], 'a banner per day, a page total per day');
eq(one.days[0].items.map((x) => x.type === 'scene' ? x.number + '[' + x.cast.join(',') + ']' : x.banner.kind), ['1[1]', 'move', '2[1,2]', '3[1]', 'holiday'], 'one line per scene with cast numbers, banners in place');
eq(one.unscheduled.map((x) => x.number), ['5'], 'the unscheduled scenes follow');
eq(Object.keys(one.days[0].items[0]).sort().join(','), 'cast,dayNight,eighths,intExt,number,pages,scene,slug,type', 'each line carries I/E, D/N, slug, pages and cast');

console.log(`test:stripboard — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
