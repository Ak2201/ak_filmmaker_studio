/* ============================================================
   THE BREAKDOWN, STRIPBOARD AND SHOOT-DAY MODELS — in Node
   ------------------------------------------------------------
   src/lib/breakdown-model.js, stripboard-model.js and shoot-model.js
   hold the logic those three pages used to keep inline. Asserted
   here with no browser: the scene-list filter and its sentences,
   duplicate numbers, the scene status, the Auto-Tag bulk rule's
   shape, the groupings and their order, the day out of days marks,
   the move sentence, schedule-by-location, the solar timeline's
   geometry and the late-wrap exteriors.

       node scripts/test-board-models.mjs
   ============================================================ */
import { mem } from './node-seams.mjs';

const B = await import('../src/lib/breakdown-model.js');
const S = await import('../src/lib/stripboard-model.js');
const D = await import('../src/lib/shoot-model.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
mem.clear();

const el = (o = {}) => ({ cast: [], props: [], ...o });
const sc = (id, o = {}) => ({ id, number: id, location: '', intExt: 'INT', dayNight: 'DAY', synopsis: '', elements: el(o.elements), ...o, elements: el(o.elements) });

/* ---- breakdown ---- */
eq([...B.dupNumbers([sc('1'), sc('2', { number: ' 1 ' }), sc('3', { number: '' }), sc('4', { number: '12a' }), sc('5', { number: '12A' })])],
  ['1', '12A'], 'dupNumbers upper-cases and trims');
eq(B.sceneStatus(sc('1', { shotState: 'part' })), { id: 'part', label: 'Part shot' }, 'status: part');
eq(B.sceneStatus(sc('1', { shootDay: 3 })), { id: 'scheduled', label: 'Day 3' }, 'status: scheduled');
eq(B.sceneStatus(sc('1', { elements: { props: ['gun'] } })), { id: 'tagged', label: 'Tagged' }, 'status: tagged');
eq(B.sceneStatus(sc('1')), { id: 'untagged', label: 'Untagged' }, 'status: untagged');
eq(B.daySlot(1), 1, 'day slot 1'); eq(B.daySlot(9), 1, 'day slot wraps at 8'); eq(B.daySlot(8), 8, 'day slot 8');
eq(B.castSummary(sc('1', { elements: { cast: ['A', 'B', 'C', 'D'] } })), 'A, B +2', 'cast summary');
const f = { q: '  Gun ', ie: 'EXT', dn: '', st: '' };
ok(B.filterActive(f), 'filter active');
ok(!B.filterActive({ q: '  ', ie: '', dn: '', st: '' }), 'blank filter is inactive');
eq(B.describeFilter(f), 'EXT · “Gun”', 'describe filter');
eq(B.describeFilter({ q: '', ie: '', dn: 'NIGHT', st: 'untagged' }), 'night · untagged', 'describe filter, time and status');
eq(B.describeFilter({ q: '', ie: '', dn: '', st: '' }), 'every scene', 'describe the empty filter');
ok(B.presetMatches({ q: 'gun', ie: 'ext' }, f), 'preset matches case- and space-blind');
ok(B.rowMatches(f, { find: 'a gun here', ie: 'EXT', dn: 'DAY', st: 'tagged' }), 'row matches');
ok(!B.rowMatches(f, { find: 'a gun here', ie: 'INT', dn: 'DAY', st: 'tagged' }), 'row ruled out by INT/EXT');
eq(B.filterCountText(3, 3), '3 scenes', 'count, all shown'); eq(B.filterCountText(1, 1), '1 scene', 'count, one');
eq(B.filterCountText(2, 5), '2 of 5 scenes', 'count, filtered');
eq(B.binEntryBits({}), ['nothing attached'], 'bin entry, empty');
eq(B.binEntryBits({ shots: 1, frames: 2, day: 4 }), ['1 shot', '2 frames', 'Day 4'], 'bin entry bits');
eq(B.binTotalsBits({ scenes: 1, sheets: 2 }), ['1 scene', '2 call-sheet places'], 'bin totals bits');
eq(B.sceneFieldValue('eighths', '-3'), 0, 'eighths floor at 0'); eq(B.sceneFieldValue('eighths', '12'), 12, 'eighths');
eq(B.sceneFieldValue('eighths', '500'), 80, 'eighths cap at the box max (80)'); eq(B.sceneFieldValue('eighths', '2.5'), 2, 'eighths are whole'); eq(B.EIGHTHS_MAX, 80, 'EIGHTHS_MAX is the box max');
eq(B.sceneFieldValue('number', ' 4A '), '4A', 'number trimmed'); eq(B.sceneFieldValue('location', ' x '), ' x ', 'other field as typed');
eq(B.songFieldValue('days', '1.5'), 1.5, 'song days'); eq(B.songFieldValue('dancers', 'x'), 0, 'song dancers');
eq(B.runSaid({ applied: { empty: true }, totals: {}, characters: [] }), 'The script has no scene headings yet, so there was nothing to break down.', 'run, empty');
eq(B.runSaid({ applied: { castTagged: 2 }, totals: { scenes: 1, locations: 2 }, characters: ['A'] }),
  'Broke down 1 scene, 1 character and 2 locations. Tagged 2 cast from the dialogue cues.', 'run sentence');
eq(B.breakdownFigures([sc('1', { location: 'A', intExt: 'EXT' }), sc('2', { location: ' a ' })],
  [{ category: 'cast' }, { category: 'props' }], 3),
  { scenes: 2, elements: 2, cats: 2, locs: 1, ints: 1, exts: 1, songs: 3, cast: 1 }, 'header figures');
eq(B.suggestionTags([], [], null), [], 'no scenes, no suggestions');

/* ---- stripboard ---- */
const board = [
  sc('1', { location: 'Beach', dayNight: 'NIGHT', intExt: 'EXT', shootDay: 2, elements: { cast: ['Ravi'] } }),
  sc('2', { location: 'house', dayNight: 'DAY', shootDay: 1, elements: { cast: ['Ravi', 'Meera'] } }),
  sc('3', { location: 'beach', dayNight: 'DAY', intExt: 'EXT', shootDay: 4, elements: { cast: ['Ravi'] } }),
  sc('4', { location: '', dayNight: 'DAWN', shootDay: '' })
];
eq(S.shootDays(board), [1, 2, 4], 'shoot days');
eq(S.groupScenes(board, 'location').map((g) => [g.label, g.scenes.map((x) => x.id)]),
  [['Beach', ['1', '3']], ['house', ['2']], ['Location not set', ['4']]], 'group by location');
eq(S.groupScenes(board, 'time').map((g) => g.label), ['INT · DAY', 'EXT · DAY', 'INT · DAWN', 'EXT · NIGHT'], 'group by time, ranked');
eq(S.groupScenes(board, 'day', { dayOrders: () => ({}) }).map((g) => g.label), ['Day 1', 'Day 2', 'Day 4', 'Not scheduled yet'], 'group by day');
eq(S.groupScenes(board, 'song', { songsById: {} }).map((g) => g.label), ['Not part of a song'], 'group by song');
const rows = S.doodRows(board, [1, 2, 3, 4], [
  { category: 'cast', name: 'Ravi', scenes: [board[0], board[1], board[2]] },
  { category: 'cast', name: 'Meera', scenes: [board[1]] },
  { category: 'props', name: 'gun', scenes: [board[0]] }
]);
eq(rows.map((r) => [r.name, r.work, r.hold, r.span, r.cells.map((c) => c.mark).join('/')]),
  [['Ravi', 3, 1, 4, 'SW/W/H/WF'], ['Meera', 1, 0, 1, 'SWF///']], 'day out of days');
eq(S.localDate('2025-10-27'), 'Mon 27 Oct 2025', 'local date'); eq(S.localDate('soon'), '', 'not a date');
eq(S.todayISO(new Date(2026, 0, 5)), '2026-01-05', 'today ISO');
eq(S.daysNote(0, null), '', 'no days, no note'); eq(S.daysNote(2, null), 'scheduled · no dates yet', 'undated note');
eq(S.daysNote(3, { dated: 2, total: 3, spanDays: 1, weeks: 1 }), '2 dated · 1 calendar day · 1 week', 'dated note');
eq(S.runtimeNote(100, 0), { note: 'estimated from the script', tone: null }, 'runtime, no target');
eq(S.runtimeNote(95, 100), { note: 'target 100 min · 5 under', tone: 'ok' }, 'runtime under');
eq(S.runtimeNote(110, 100), { note: 'target 100 min · 10 over', tone: 'warn' }, 'runtime over');
const st = S.screenTimeByDay({ fromScript: true, rows: [
  { method: 'script', seconds: 60, scene: board[0] }, { method: 'eighths', seconds: 99, scene: board[1] },
  { method: 'script', seconds: '30', scene: board[3] }] });
eq([[...st.byDay], [...st.byScene]], [[[2, 60]], [['1', 60], ['4', 30]]], 'screen time by day and scene');
eq(S.describeMove({ toDay: 0 }, board[0], 0), 'Scene 1 is off the schedule.', 'move off');
eq(S.describeMove({ fromDay: 2, toDay: 2, index: 0 }, board[0], 3), 'Scene 1 moved to position 1 of 3 on Day 2.', 'move within');
eq(S.describeMove({ fromDay: 1, toDay: 2, index: 1 }, undefined, 3), 'The scene moved to Day 2, position 2 of 3.', 'move across');
eq(S.scheduleByLocation(board), { plan: [{ id: '1', day: 1 }, { id: '2', day: 2 }, { id: '3', day: 1 }, { id: '4', day: 3 }], days: 3 }, 'schedule by location');
eq(S.sceneHeadings({ elements: [{ type: 'scene', text: 'INT. X' }, { type: 'scene', text: ' ' }, { type: 'action', text: 'a' }] }), 1, 'scene headings');
eq(S.latestDraft({ revisions: [{ name: 'a' }, { name: 'b' }] }), { latest: { name: 'b' }, count: 2 }, 'latest draft');
eq([...S.lockPreset([{ scriptElId: 'e1', number: 3 }, { scriptElId: 'e2', number: '' }])], [['e1', '3']], 'lock preset');
eq(S.boardSummary(board.map((x) => ({ ...x, eighths: 8 }))), '4 scenes · 4 pages · 3 shoot days', 'board summary');

/* ---- shoot day ---- */
eq(D.slug(sc('1', { intExt: 'EXT', location: 'Beach', dayNight: 'NIGHT' })), 'EXT Beach — NIGHT', 'slug');
eq(D.slug({ intExt: '', location: '', dayNight: '' }), 'NO LOCATION', 'slug, nothing set');
eq(D.needsFacts({ setups: 3, setupsDone: 1, cameras: ['A'], lenses: [], rigs: ['dolly'] }),
  [['Setups', '1 of 3 ticked'], ['Cameras', 'A'], ['Rig', 'dolly']], 'needs facts');
eq(D.timesCells({ lunchIn: '13:00', firstShot: '08:10', cameraWrap: '19:00' }, '07:00', ''),
  [['Crew call', '07:00'], ['First shot', '08:10'], ['Lunch break', '13:00'], ['Wrap', '19:00']], 'times row');
eq(D.wrapNote('planned'), 'planned wrap', 'wrap note');
eq(D.incompleteScenes([sc('1', { shotState: 'shot' }), sc('2', { shotState: 'part' }), sc('3')]).map((x) => x.id), ['2', '3'], 'incomplete');
const light = { sunriseMinutes: 360, sunsetMinutes: 1080, goldenAm: '06:00–07:00', goldenPm: '17:00–18:00', sunset: '18:00' };
const tl = D.timelinePlan(light, { crewCall: '06:30', wrapTime: '20:15', now: 600 });
eq([tl.from, tl.to, tl.span], [300, 1260, 960], 'timeline window');
eq(tl.segs.map((s) => s.cls + ':' + s.width), ['is-dark:6.3%', 'is-gold:6.3%', 'is-day:62.5%', 'is-gold:6.3%', 'is-dark:18.8%'], 'timeline segments');
eq(tl.ticks.map((t) => [t.text, t.cls, t.left, t.side]),
  [['06:30 call', 'is-call', '9.4%', '.is-l'], ['20:15 wrap', 'is-wrap', '95.3%', '.is-r'], ['▲ now 10:00', 'is-now', '31.3%', '']], 'timeline ticks');
eq(D.timelinePlan(light, { crewCall: '', wrapTime: '' }).ticks, [], 'no times, no ticks');
eq(D.lateExteriors([sc('1', { intExt: 'EXT' })], '', light), null, 'no wrap, no flag');
eq(D.lateExteriors([sc('1', { intExt: 'EXT' }), sc('2', { intExt: 'INT' }), sc('3', { intExt: 'EXT', shotState: 'shot' })], '19:30', light).map((x) => x.id), ['1'], 'late exteriors');

console.log(`board models: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
