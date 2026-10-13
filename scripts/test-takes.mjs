/* ============================================================
   THE TAKES LOG — an optional field on the scene record
   ------------------------------------------------------------
   shoot.html logs takes per scene. They live on the scene as
   `takes`, the shotState/shotAt pattern: no new storage key, and
   an older row reads back []. Asserted here, in Node:
     · blankScene() carries takes: [] and a row stored without it reads [];
     · logTake numbers one past the highest, circleTake toggles,
       undoTake pops, and none touch shotState or another scene;
     · takesLine words the summary; cleanTakes survives a damaged blob;
     · wrapEstimate prefers a planned wrap, estimates only from a crew
       call, and shows nothing otherwise; timelineAt clamps;
     · the only localStorage key written is the scenes key.

       node scripts/test-takes.mjs   (or: npm run test:takes)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Scenes = (await import('../src/lib/scenes.js')).default;
const S = await import('../src/lib/shootday.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

mem.clear();
ok(Array.isArray(Scenes.blankScene().takes) && Scenes.blankScene().takes.length === 0, 'blankScene has takes: []');
Scenes.addScene({ id: 'a', number: '1', shootDay: 1 });
Scenes.addScene({ id: 'b', number: '2', shootDay: 1 });

// an older row, written before the field existed
mem.set('fms_scenes_v1', JSON.stringify({ scenes: [{ id: 'old', number: '9' }] }));
eq(Scenes.listScenes()[0].takes, [], 'a row stored without takes reads back []');
mem.clear();
Scenes.addScene({ id: 'a', number: '1', shootDay: 1, shotState: 'part' });
Scenes.addScene({ id: 'b', number: '2', shootDay: 1 });

S.logTake('a'); S.logTake('a', { note: 'wind on boom' }); S.logTake('a');
let a = Scenes.listScenes().find((s) => s.id === 'a');
eq(a.takes.map((t) => t.n), [1, 2, 3], 'takes number 1, 2, 3');
eq(a.takes[1].note, 'wind on boom', 'a note is kept');
eq(S.takesLine(a), '3 takes', 'summary without a circle');
S.circleTake('a', 3);
a = Scenes.listScenes().find((s) => s.id === 'a');
eq(S.takesLine(a), '3 takes (Take 3 circled)', 'one circled');
S.circleTake('a', 2);
eq(S.takesLine(Scenes.listScenes().find((s) => s.id === 'a')), '3 takes (Takes 2, 3 circled)', 'two circled');
S.circleTake('a', 2);
S.circleTake('a', 3);
eq(S.takesLine(Scenes.listScenes().find((s) => s.id === 'a')), '3 takes', 'circles toggle off');
S.undoTake('a');
a = Scenes.listScenes().find((s) => s.id === 'a');
eq(a.takes.map((t) => t.n), [1, 2], 'undo takes the last back off');
S.logTake('a');
eq(Scenes.listScenes().find((s) => s.id === 'a').takes.map((t) => t.n), [1, 2, 3], 'the next number follows the highest');
eq(Scenes.listScenes().find((s) => s.id === 'b').takes, [], 'another scene is untouched');
eq(a.shotState, 'part', 'logging a take never changes shotState');
eq(S.takesLine({}), '', 'no takes, no line');
ok(S.logTake('missing') === null, 'an unknown scene logs nothing');
eq([...mem.keys()], ['fms_scenes_v1'], 'only the scenes key was written');

eq(S.cleanTakes([{ n: 2, circled: 1 }, null, { n: 2 }, { n: 'x' }, { n: 0 }, { n: 1, note: 5 }]).map((t) => [t.n, t.circled, t.note]),
  [[1, false, '5'], [2, true, '']], 'cleanTakes drops damage, dedupes, sorts');
eq(S.cleanTakes('nope'), [], 'a non-array reads as empty');

eq(S.wrapEstimate({ plannedWrap: '20:30', crewCall: '06:00', eighths: 40, target: 39, dayHours: 12 }), { time: '20:30', kind: 'planned' }, 'planned wins');
eq(S.wrapEstimate({ crewCall: '06:00', eighths: 39, target: 39, dayHours: 12 }), { time: '18:00', kind: 'estimate' }, 'estimate from call + a day at the target');
eq(S.wrapEstimate({ crewCall: '06:00', eighths: 20, target: 39, dayHours: 12 }), { time: '12:09', kind: 'estimate' }, 'a lighter day wraps earlier')
eq(S.wrapEstimate({ eighths: 39, target: 39, dayHours: 12 }), { time: '', kind: '' }, 'no call, no estimate');
eq(S.timelineAt('12:00', 0, 1440), 0.5, 'timelineAt midpoint');
eq(S.timelineAt('05:00', 360, 1200), 0, 'timelineAt clamps low');
eq(S.timelineAt('xx', 0, 10), null, 'timelineAt rejects a non-time');

console.log(fail ? `\n✗ ${fail} failed, ${pass} passed` : `✓ takes: ${pass} checks`);
process.exit(fail ? 1 : 0);
