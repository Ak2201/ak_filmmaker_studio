/* ============================================================
   TEST — the basic shot breakdown (src/lib/shot-rules.js), in Node
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, Revision 3, §1c. No browser, no
   key, no network:

       node scripts/test-shots.mjs   (or: npm run test:shots)

   Runs the rules over the Dragon sample (36 scenes, 2,361 elements)
   and over small hand-made scenes, and asserts:
     - every scene with script gets between 2 and 12 shots;
     - a two-hander gets an OTS on each speaker;
     - an explicit CLOSE ON element becomes a CU;
     - the result has the same shape as draftShotDivision()'s — the
       same top-level keys and, per shot, the same fields, read out of
       src/lib/ai.js's own source so the two cannot drift apart;
     - an empty scene produces nothing;
     - only values from SHOT_SIZES / SHOT_ANGLES / SHOT_MOVEMENTS;
     - the same input gives the same output, twice.
   DUMP=1 prints the division for the first scenes.
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const R = await import('../src/lib/shot-rules.js');
const { SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS, blankShot } = await import('../src/lib/shots.js');
const { default: sample } = await import('../src/data/sample.dragon.json');
const { default: script } = await import('../src/data/sample.dragon.script.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const SIZES = new Set(SHOT_SIZES.map((s) => s.id));
const legal = (s) => SIZES.has(s.size) && SHOT_ANGLES.includes(s.angle) && SHOT_MOVEMENTS.includes(s.movement);

/* ---- the AI draft's shape, from ai.js itself ------------------ */
const aiSrc = readFileSync(new URL('../src/lib/ai.js', import.meta.url), 'utf8');
const fn = aiSrc.slice(aiSrc.indexOf('export async function draftShotDivision'));
const mapBlock = fn.slice(fn.indexOf('.map((s) => ({'), fn.indexOf('}))', fn.indexOf('.map((s) => ({')));
const AI_FIELDS = [...mapBlock.matchAll(/^\s*(\w+):/gm)].map((m) => m[1]).sort();
const retLine = fn.match(/return \{ ([^}]+) \};/);
const AI_RESULT = retLine ? retLine[1].split(',').map((x) => x.trim()).sort() : [];
ok(AI_FIELDS.length >= 5, 'read the draft fields out of ai.js: ' + AI_FIELDS.join(','));
eq(AI_RESULT, ['byScene', 'model', 'truncated'], 'read the result keys out of ai.js');

/* ---- the sample ------------------------------------------------ */
const scenes = sample.scenes.map((s, i) => ({ id: 'sc' + (i + 1), ...s }));
const elements = script.elements;
const jobs = R.basicJobs(scenes, elements);
ok(jobs.length === 36, 'every sample scene finds its slice — got ' + jobs.length);
ok(jobs.every((j) => Array.isArray(j.elements) && j.elements.length), 'jobs carry the slice ELEMENTS, not flattened text');

const res = await R.basicShotDivision(jobs);
eq(Object.keys(res).sort(), AI_RESULT, 'result keys match draftShotDivision()');
ok(res.byScene instanceof Map, 'byScene is a Map');
eq(res.truncated, false, 'never truncated');
eq(res.model, 'basic rules', 'model names the rules');
ok(res.byScene.size === 36, 'every scene with script got shots — ' + res.byScene.size);

let total = 0;
for (const [id, list] of res.byScene) {
  total += list.length;
  ok(list.length >= 2 && list.length <= 12, `scene ${id}: 2–12 shots, got ${list.length}`);
  ok(list.length <= R.capFor(jobs.find((j) => j.sceneId === id)), `scene ${id}: within its eighths cap`);
  for (const s of list) {
    eq(Object.keys(s).sort(), AI_FIELDS, `scene ${id}: shot fields match the AI draft`);
    ok(legal(s), `scene ${id}: only vocabulary values — ${s.size}/${s.angle}/${s.movement}`);
    ok(typeof s.description === 'string' && s.description.length > 0 && s.description.length <= 400, `scene ${id}: a description`);
  }
  ok(/^(Establishing|Master)\b/.test(list[0].description) && list[0].size === 'WS', `scene ${id}: opens on a WS master`);
}
const ext = jobs.find((j) => /^EXT/i.test(j.heading));
ok(/^Establishing/.test(res.byScene.get(ext.sceneId)[0].description), 'an EXT heading opens on "Establishing"');
const int = jobs.find((j) => /^INT/i.test(j.heading));
ok(/^Master/.test(res.byScene.get(int.sceneId)[0].description), 'an INT heading opens on a master');
ok(total > 36 * 2, 'a real division, not the floor everywhere — ' + total + ' shots');

/* Every shot drops into blankShot() unchanged: the record contract. */
const one = res.byScene.values().next().value[0];
const rec = blankShot({ sceneId: 'x', ...one, rules: true });
ok(rec.rules === true && rec.ai === false && rec.size === one.size, 'a draft spreads into blankShot() with rules:true');
eq(blankShot().rules, false, 'blankShot() declares rules: false');

/* Deterministic. */
const again = await R.basicShotDivision(R.basicJobs(scenes, elements));
eq(JSON.stringify([...again.byScene]), JSON.stringify([...res.byScene]), 'same script in, same shots out');

if (process.env.DUMP) {
  for (const [id, list] of [...res.byScene].slice(0, Number(process.env.DUMP) || 4)) {
    const j = jobs.find((x) => x.sceneId === id);
    console.log('--', id, j.heading, '(' + j.eighths + '/8, cap ' + R.capFor(j) + ')');
    for (const s of list) console.log('   ', s.size.padEnd(4), s.angle.padEnd(9), s.movement.padEnd(8), s.lens.padEnd(11), s.description);
  }
}

/* ---- hand-made scenes ----------------------------------------- */
const el = (type, text) => ({ type, text });
const job = (id, elements, extra = {}) => ({ sceneId: id, number: id, slug: '', eighths: 8, synopsis: '', heading: 'INT. FLAT - NIGHT', elements, ...extra });

// A two-hander.
const two = R.shotsForScene(job('t', [
  el('action', 'PRIYA waits by the door. RAGAVAN comes in late.'),
  el('character', 'PRIYA'), el('dialogue', 'You said seven.'),
  el('character', 'RAGAVAN'), el('dialogue', 'I said seven-ish.'),
  el('character', 'PRIYA'), el('dialogue', 'It is ten.')
]));
const ots = two.filter((s) => /^OTS on/.test(s.description));
eq(ots.length, 2, 'two-hander: two OTS setups');
ok(ots.some((s) => /^OTS on PRIYA, over RAGAVAN's shoulder/.test(s.description))
  && ots.some((s) => /^OTS on RAGAVAN, over PRIYA's shoulder/.test(s.description)), 'two-hander: an OTS on each speaker, naming the other');

// A single speaker.
const solo = R.shotsForScene(job('s', [el('action', 'He sits.'), el('character', 'KUMAR'), el('dialogue', 'Nobody is coming.')]));
ok(solo.some((s) => s.size === 'MCU' && /^MCU on KUMAR/.test(s.description)), 'single speaker: MCU');

// Three speakers.
const three = R.shotsForScene(job('g', [
  el('character', 'A'), el('dialogue', 'One.'),
  el('character', 'BEE'), el('dialogue', 'Two.'),
  el('character', 'CEE'), el('dialogue', 'Three.')
], { eighths: 16 }));
ok(three.some((s) => /^Group MS/.test(s.description) && s.size === 'MS'), 'three speakers: a group MS');
eq(three.filter((s) => /^Single on/.test(s.description)).length, 3, 'three speakers: a single each');

// Explicit shot elements and capital cues in action.
const cues = R.shotsForScene(job('c', [
  el('action', 'The office.'),
  el('shot', 'CLOSE ON the certificate'),
  el('action', 'INSERT — the seal, pressed.'),
  el('shot', "RAGAVAN'S POV — the notice board"),
  el('shot', 'AERIAL over the campus'),
  el('shot', 'extreme close up on his eye'),
  el('action', 'Close to the window, he waits.')
], { eighths: 24 }));
const find = (re) => cues.find((s) => re.test(s.description));
ok(find(/certificate/) && find(/certificate/).size === 'CU', 'CLOSE ON → CU');
ok(find(/seal/) && find(/seal/).size === 'ECU' && /^Insert/.test(find(/seal/).description), 'INSERT in an action line → ECU insert');
ok(find(/notice board/) && /POV/.test(find(/notice board/).description) && find(/notice board/).angle === 'eye level', 'POV → an eye-level POV');
const aer = find(/campus/);
ok(aer && aer.angle === 'overhead' && aer.movement === 'drone', 'AERIAL → overhead drone');
ok(find(/his eye/) && find(/his eye/).size === 'ECU', 'a lower-case shot element is still read');
ok(!find(/window/), 'prose "Close to the window" is not a shot cue');

// Movement and looks.
const act = R.shotsForScene(job('m', [
  el('action', 'RAGAVAN runs down the corridor.'),
  el('action', 'Two boys fight over the bag.'),
  el('action', 'DEEPA looks at the screen.')
], { eighths: 16 }));
ok(act.some((s) => s.movement === 'track' && /RAGAVAN/.test(s.description)), 'runs → tracking, naming who');
ok(act.some((s) => s.movement === 'handheld'), 'fight → handheld');
ok(act.some((s) => /^POV — (what DEEPA sees|from "DEEPA looks)/.test(s.description)), 'looks at → POV');

// Props from the auto-tagger become inserts, capped at two.
const props = R.shotsForScene(job('p', [
  el('action', 'A phone on the table, a laptop, a file and a wallet.')
], { eighths: 24 }));
const ins = props.filter((s) => /^Insert — the /.test(s.description));
ok(ins.length >= 1 && ins.length <= 2, 'props → at most two inserts — got ' + ins.length);

// The clamp.
const long = [];
for (let i = 0; i < 30; i++) long.push(el('shot', 'CLOSE ON object ' + i));
eq(R.shotsForScene(job('l', long, { eighths: 400 })).length, 12, 'never more than 12');
eq(R.shotsForScene(job('l2', long, { eighths: 1 })).length, R.capFor({ eighths: 1 }), 'a short scene is clamped by its eighths');
ok(R.shotsForScene(job('f', [el('action', 'Rain.')], { eighths: 1 })).length === 2, 'never fewer than 2');

// Nothing to read, nothing made.
eq(R.shotsForScene(job('e', [])), [], 'empty scene → no shots');
eq(R.shotsForScene(job('e2', [el('transition', 'CUT TO:'), el('action', '   ')])), [], 'only a transition → no shots');
const empty = await R.basicShotDivision([job('e', []), job('t', [el('action', 'He waits.')])]);
ok(!empty.byScene.has('e') && empty.byScene.has('t'), 'an empty scene has no entry in byScene');
eq((await R.basicShotDivision([])).byScene.size, 0, 'no jobs → empty Map');

// O.S. and V.O. cues get no coverage of their own.
const os = R.shotsForScene(job('o', [
  el('character', 'MEENA (O.S.)'), el('dialogue', 'Where are you?'),
  el('character', 'RAVI'), el('dialogue', 'Here.')
]));
ok(!os.some((s) => /MEENA/.test(s.description) && /^(OTS|MCU)/.test(s.description)), 'an off-screen voice gets no setup');

// Confident only: a pair matched by position is left out of a bulk job list.
const guessed = [{ id: 'a', intExt: 'INT', location: 'Flat', dayNight: 'NIGHT' }, { id: 'b', intExt: 'INT', location: 'Renamed', dayNight: 'DAY' }, { id: 'c', intExt: 'EXT', location: 'Road', dayNight: 'DAY' }];
const gEls = [el('scene', 'INT. FLAT - NIGHT'), el('action', 'x'), el('scene', 'INT. OFFICE - DAY'), el('action', 'y'), el('scene', 'EXT. ROAD - DAY'), el('action', 'z')];
eq(R.basicJobs(guessed, gEls).map((j) => j.sceneId), ['a', 'b', 'c'], 'all pairs by default');
eq(R.basicJobs(guessed, gEls, { confidentOnly: true }).map((j) => j.sceneId), ['a', 'c'], 'confidentOnly drops a positional guess');
eq(R.basicJobs(guessed, gEls, { only: new Set(['c']) }).map((j) => j.sceneId), ['c'], 'only limits to the picked scenes');

/* ---- passthrough: what a newer build wrote survives this one ---- */
{
  const M = await import('../src/lib/shots.js');
  mem.set(M.SHOTS_KEY, JSON.stringify({
    shots: [{ id: 'p1', sceneId: 'z', number: '1', future: 'keep me' }],
    frames: [{ id: 'pf1', shotId: 'p1', caption: 'x', futureFrame: 7 }],
    boards: [], blocks: [],
    futureTop: { a: 1 }
  }));
  M.updateShot('p1', { description: 'edited' });
  M.addFrame('p1', { caption: 'second' });
  M.saveBoards([]);
  const back = JSON.parse(mem.get(M.SHOTS_KEY));
  eq(back.futureTop, { a: 1 }, 'passthrough: an unknown TOP-LEVEL field survives a save');
  eq(back.shots[0].future, 'keep me', 'passthrough: an unknown SHOT field survives a save');
  eq(back.frames[0].futureFrame, 7, 'passthrough: an unknown FRAME field survives a save');
  eq(back.shots[0].description, 'edited', 'passthrough: the edit itself landed');
  M.removeShot('p1');
  eq(JSON.parse(mem.get(M.SHOTS_KEY)).futureTop, { a: 1 }, 'passthrough: removeShot keeps the unknown top-level field');
  mem.set(M.SHOTS_KEY, '[1,2]');
  eq(M.listShots(), [], 'a stored array (not an object) reads as empty, not as indices');
  mem.delete(M.SHOTS_KEY);
}

/* ---- the shot-list revamp: order, numbers, time, setups, frames ---- */
{
  const M = await import('../src/lib/shots.js');
  mem.delete(M.SHOTS_KEY);
  const b = M.blankShot();
  eq([b.mins, b.setup, b.numLocked], ['', '', false], 'blankShot declares mins, setup, numLocked');
  const f0 = M.blankFrame();
  eq([f0.action, f0.dialogue, f0.camera], ['', '', ''], 'blankFrame declares action, dialogue, camera');
  // An old stored shot reads back with the new defaults (no migration).
  mem.set(M.SHOTS_KEY, JSON.stringify({ shots: [{ id: 'old', sceneId: 'A', number: '1' }], frames: [{ id: 'of', shotId: 'old', caption: 'He turns.' }] }));
  eq([M.listShots()[0].mins, M.listShots()[0].numLocked], ['', false], 'an old shot reads back with the new fields blank');
  const of = M.listFrames()[0];
  eq(M.frameAction(of), 'He turns.', 'an old frame shows its caption as the action');
  M.updateFrame('of', M.actionPatch('She turns.'));
  const of2 = JSON.parse(mem.get(M.SHOTS_KEY)).frames[0];
  eq([of2.action, of2.caption], ['She turns.', ''], 'editing the action MOVES the caption, it does not copy it');
  eq(M.frameAction(M.listFrames()[0]), 'She turns.', 'the action reads back');

  // Interleaved scenes: reorder must keep the other scene's shots in place.
  mem.delete(M.SHOTS_KEY);
  const a1 = M.addShot('A'), b1 = M.addShot('B'), a2 = M.addShot('A'), a3 = M.addShot('A'), b2 = M.addShot('B');
  eq(M.listShots().map((s) => s.id), [a1.id, b1.id, a2.id, a3.id, b2.id], 'setup: five shots over two scenes');
  M.reorderShots('A', [a3.id, a1.id, a2.id]);
  eq(M.listShots().map((s) => s.id), [a3.id, b1.id, a1.id, a2.id, b2.id], 'reorderShots keeps scene B in its slots');
  M.reorderShots('A', [a2.id, 'nope', b1.id]);
  eq(M.listShots().filter((s) => s.sceneId === 'A').map((s) => s.id), [a2.id, a3.id, a1.id], 'unknown and foreign ids are ignored; the rest follow in order');
  eq(M.listShots().filter((s) => s.sceneId === 'B').map((s) => s.id), [b1.id, b2.id], 'scene B never moved');
  const before = mem.get(M.SHOTS_KEY);
  M.reorderShots('A', [a2.id, a3.id, a1.id]);
  ok(mem.get(M.SHOTS_KEY) === before, 'a reorder that changes nothing writes nothing');

  // Auto-number: unlocked shots renumber; a locked number and a "4A" stay.
  eq(M.listShots().filter((s) => s.sceneId === 'A').map((s) => s.number), ['2', '3', '1'], 'numbers travelled with their shots');
  eq(M.autoNumber('A'), 3, 'autoNumber renumbers the three');
  eq(M.listShots().filter((s) => s.sceneId === 'A').map((s) => s.number), ['1', '2', '3'], 'in list order');
  M.updateShot(a3.id, { number: '2', numLocked: true });   // the middle one is locked at 2
  M.reorderShots('A', [a3.id, a2.id, a1.id]);
  M.autoNumber('A');
  eq(M.listShots().filter((s) => s.sceneId === 'A').map((s) => s.number), ['2', '1', '3'], 'a locked number keeps its value and its number is skipped');
  M.updateShot(a1.id, { number: '4A' });
  ok(M.isLockedNumber(M.listShots().find((s) => s.id === a1.id)), 'a number like 4A counts as the writer\'s own');
  M.autoNumber('A');
  eq(M.listShots().find((s) => s.id === a1.id).number, '4A', 'autoNumber leaves 4A alone');
  eq(M.autoNumbers([{ id: 'x', number: '1' }, { id: 'y', number: '2' }]), [], 'nothing to change, nothing returned');
  eq(M.autoNumber('B'), 0, 'scene B already reads 1, 2');
  // A move renumbers only a scene already in auto order (review fix):
  // hand-typed 12, 13, 14 or a gap 1, 2, 5 read as the writer's own.
  ok(!M.isAutoOrdered([{ id: 'a', number: '12' }, { id: 'b', number: '13' }, { id: 'c', number: '14' }]), 'isAutoOrdered: 12, 13, 14 typed by hand is not auto order');
  ok(!M.isAutoOrdered([{ id: 'a', number: '1' }, { id: 'b', number: '2' }, { id: 'c', number: '5' }]), 'isAutoOrdered: a gap is not auto order');
  ok(M.isAutoOrdered([{ id: 'a', number: '1' }, { id: 'b', number: '' }, { id: 'c', number: '4A' }]), 'isAutoOrdered: ordinals, blanks and a 4A are');
  ok(M.sceneAutoOrdered('B'), 'sceneAutoOrdered reads the stored scene');
  ok(M.DEFAULT_COLUMNS.includes('rig'), 'DEFAULT_COLUMNS shows Light / rig (review fix)');
  eq(M.cleanColumns(M.DEFAULT_COLUMNS), M.DEFAULT_COLUMNS, 'DEFAULT_COLUMNS is in table order');

  // Time.
  const mins = (v) => M.shotMinutes({ mins: v });
  eq([mins(''), mins('12'), mins('7.5'), mins('20 min'), mins('1h 30'), mins('2 hrs'), mins('1:30'), mins('about 10'), mins('10 lens'), mins('-5')],
    [0, 12, 7.5, 20, 90, 120, 90, 0, 0, 0], 'shotMinutes reads whole strings only');
  M.updateShot(a1.id, { mins: '15' }); M.updateShot(a2.id, { mins: '1h' }); M.updateShot(b1.id, { mins: '20' });
  const tA = M.minutesOf(M.listShots().filter((s) => s.sceneId === 'A'));
  eq(tA, { total: 75, timed: 2, count: 3 }, 'minutesOf totals a scene and counts what is timed');
  eq([M.formatMinutes(75), M.formatMinutes(45), M.formatMinutes(120), M.formatMinutes(0)], ['1 h 15 min', '45 min', '2 h', ''], 'formatMinutes');
  const days = M.minutesByDay([{ id: 'A', shootDay: 2 }, { id: 'B', shootDay: '2' }, { id: 'C', shootDay: 0 }]);
  eq([...days.keys()], [2], 'per day: only scheduled days');
  eq(days.get(2), { total: 95, timed: 3, count: 5, scenes: 2 }, 'per day: both scenes on day 2 summed');

  // Setups: own words first, else the blocking camera's name.
  const cams = [{ id: 'cA', name: 'Cam A' }];
  eq(M.setupOf({ setup: ' Wide ', cam: 'cA' }, cams), 'Wide', 'setupOf: the shot\'s own words win');
  eq(M.setupOf({ setup: '', cam: 'cA' }, cams), 'Cam A', 'setupOf: defaults from the camera link');
  eq(M.setupOf({ setup: '', cam: 'gone' }, cams), '', 'setupOf: a dead camera id is no setup');
  const g = M.groupBySetup([{ id: 1, setup: 'B' }, { id: 2, cam: 'cA' }, { id: 3 }, { id: 4, setup: 'B' }], cams);
  eq(g.map((x) => [x.label, x.shots.map((s) => s.id)]), [['B', [1, 4]], ['Cam A', [2]], ['', [3]]], 'groupBySetup: first-seen order, unset last');
  mem.delete(M.SHOTS_KEY);
}

/* ---- the export's columns (shotlist-export.js), in Node ---- */
{
  const M = await import('../src/lib/shots.js');
  const Sc = await import('../src/lib/scenes.js');
  const X = await import('../src/lib/shotlist-export.js');
  mem.delete(M.SHOTS_KEY);
  Sc.saveScenes([{ id: 'S1', number: '1', intExt: 'INT', location: 'FLAT', dayNight: 'NIGHT', eighths: 8 }]);
  M.addShot('S1', { description: 'He waits, "late"', lens: '35mm', mins: '12', setup: 'Wide' });
  M.addShot('S1', { description: 'Close', done: true });
  const raw = X.toCSV('all');
  ok(raw.startsWith('\uFEFF"Scene"'), 'the CSV opens with a UTF-8 BOM, so Excel reads em-dashes and Tamil (QA fix)');
  const full = raw.slice(1).split('\r\n');
  eq(full[0], X.CSV_HEADER.map((c) => '"' + c + '"').join(','), 'no columns: the CSV header is CSV_HEADER');
  eq(X.CSV_HEADER.slice(0, 16), ['Scene', 'Slug', 'Int/Ext', 'Time', 'Location', 'Scene pages', 'Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Lighting / rig', 'Camera', 'What we see', 'Status', 'Drafted by'], 'the old sixteen columns keep their old positions (review fix)');
  eq(X.CSV_HEADER.slice(16), ['Setup', 'Minutes'], 'new columns are appended after them');
  ok(full[1].endsWith('"you","Wide","12"'), 'fixed-schema row carries setup and minutes at the end — ' + full[1]);
  eq(full.length, 4, 'two rows and the trailing CRLF');
  const pick = X.toCSV('all', { columns: ['description', 'mins', 'lens', 'bogus'] }).slice(1).split('\r\n');
  eq(pick[0], '"Scene","Slug","Int/Ext","Time","Location","Scene pages","Shot","Lens","Minutes","What we see","Drafted by"', 'columns: scene head, shot, chosen columns in TABLE order, unknown dropped');
  ok(pick[1].endsWith('"35mm","12","He waits, ""late""","you"'), 'columns: values follow, quotes doubled — ' + pick[1]);
  const st = X.toCSV('all', { columns: ['setup', 'done'] }).slice(1).split('\r\n');
  ok(/"Setup","Camera","Status"/.test(st[0]) && /"Wide","","to shoot"/.test(st[1]) && /"in the can"/.test(st[2]), 'setup brings camera; done prints the status');
  eq(X.summarise('all').minutes, 12, 'summarise counts the minutes');
  eq(X.layoutOf('grid6'), 'grid6', 'a known layout reads back');
  eq(X.layoutOf('nope'), 'list', 'an unknown layout is the list');
  const shots = M.listShots();
  M.addFrame(shots[0].id, { action: 'A' }); M.addFrame(shots[0].id, { action: 'B' });
  const panels = X.panelsOf({ shots });
  eq(panels.map((p) => [p.shot.id === shots[0].id, p.frame ? M.frameAction(p.frame) : null]), [[true, 'A'], [true, 'B'], [false, null]], 'panelsOf: a panel per frame, an empty one for a shot with none');
  // The image ZIP: only drive: refs, named by scene, shot and frame letter.
  M.addFrame(shots[0].id, { ref: 'drive:FILEaaaaaaaa' });
  M.addFrame(shots[1].id, { ref: 'https://example.com/x.png' });
  M.addFrame(shots[1].id, { ref: 'drive:FILEbbbbbbbb' });
  M.addFrame(shots[1].id, { ref: 'drive:../../etc' });
  eq(X.frameFiles('all').map((f) => [f.fileId, f.stem]), [['FILEaaaaaaaa', 'scene-1/shot-1c'], ['FILEbbbbbbbb', 'scene-1/shot-2b']], 'frameFiles: drive refs only, named scene/shot+letter');
  eq([X.extFor('image/png'), X.extFor('image/jpeg'), X.extFor('')], ['.png', '.jpg', '.jpg'], 'extFor');
  const Z = await import('../src/lib/zip-write.js');
  const zip = Z.zipStore([['scene-1/shot-1c.png', new Uint8Array([1, 2, 3])]]);
  ok(zip[0] === 0x50 && zip[1] === 0x4b && zip.length > 30, 'zipStore makes an archive of the picture bytes');
  mem.delete(M.SHOTS_KEY); mem.delete(Sc.SCENES_KEY);
}

/* ---- QA fixes: a filtered move, and the draft undo ------------ */
{
  const M = await import('../src/lib/shots.js');
  const V = await import('../src/lib/visualize-model.js');
  mem.delete(M.SHOTS_KEY);
  const [a, b, c, d] = ['1', '2', '3', '4'].map((n) => M.addShot('Q', { number: n }));
  M.updateShot(b.id, { done: true });
  const todo = (s) => !s.done;
  M.moveShot(c.id, -1, todo);
  const order = () => M.listShots().filter((s) => s.sceneId === 'Q').map((s) => s.number);
  eq(order(), ['3', '1', '2', '4'], 'a filtered move steps over the hidden shot to the next visible one');
  M.moveShot(c.id, -1, todo);
  eq(order(), ['3', '1', '2', '4'], 'nothing visible above: the move does nothing');
  M.moveShot(a.id, 1, todo);
  eq(order(), ['3', '2', '4', '1'], 'down past a hidden shot lands after the next visible one');
  M.moveShot(d.id, 1);
  eq(order(), ['3', '2', '1', '4'], 'unfiltered, a move is still the plain swap');

  mem.delete(M.SHOTS_KEY);
  const keep = M.addShot('Q', { description: 'mine' });
  const made = ['x', 'y', 'z'].map((t) => M.addShot('Q', { description: t, rules: true }).id);
  const snap = V.draftSnapshot(made);
  M.updateShot(made[0], { description: 'MY OWN EDIT' });
  M.addFrame(made[1], {});
  M.updateShot(made[2], { number: '7' });          // a renumber is not an edit
  const r = V.removeShotIds(made, snap);
  eq(r, { removed: [made[2]], kept: [made[0], made[1]] }, 'undo keeps a drafted shot that was edited or framed since');
  eq(M.listShots().map((s) => s.id), [keep.id, made[0], made[1]], 'only the untouched drafted shot goes');
  const ids = new Set(M.listShots().map((s) => s.id));
  ok(M.listFrames().every((f) => ids.has(f.shotId)), 'no frame is left pointing at a removed shot');
  const q = M.addShot('Q', { number: '4', description: 'The front block held two beats after he leaves frame. Then more.' });
  eq(V.shotDeleteQuestion(q.id), 'Delete shot 4 “The front block held two beats after he…”?', 'the delete confirm names the shot and cuts on a word with an ellipsis');
  eq(V.shotDeleteQuestion(M.addShot('Q', { number: '5' }).id), 'Delete shot 5?', 'no description: still the shot number');
  mem.delete(M.SHOTS_KEY);
}

/* ---- visual QA round 2: formula cells, minutes, numbers, setup names ---- */
{
  const M = await import('../src/lib/shots.js');
  const Sc = await import('../src/lib/scenes.js');
  const X = await import('../src/lib/shotlist-export.js');
  mem.delete(M.SHOTS_KEY);
  Sc.saveScenes([{ id: 'S1', number: '1', intExt: 'INT', location: 'FLAT', dayNight: 'NIGHT', eighths: 8 }]);
  M.addShot('S1', { description: '=HYPERLINK("http://x","click")' });
  const cells = X.toCSV('all').slice(1).split('\r\n')[1];
  ok(cells.includes('"\'=HYPERLINK(""http://x"",""click"")"'), 'a description starting with = is written as text, not a formula — ' + cells);
  ok(!/(^|,)"=/.test(cells), 'no CSV cell opens with a bare =');
  mem.delete(M.SHOTS_KEY);

  eq(['', '12', '7.5', '1h 30', '1:30', '20 min'].map(M.minutesProblem), ['', '', '', '', '', ''], 'readable estimates raise no problem');
  ok(['abc', '-5', '90000', '1:75'].every((t) => M.minutesProblem(t)), 'abc, -5, 90000 and 1:75 are named as problems');
  eq(M.shotMinutes({ mins: '1h 30' }), 90, 'shotMinutes still reads 1h 30');
  eq(M.shotMinutes({ mins: 'abc' }), 0, 'shotMinutes still reads unreadable text as 0');

  eq([...M.duplicateNumbers([{ number: '1' }, { number: '2' }, { number: '3' }, { number: '1' }])], ['1'], 'duplicateNumbers names the shared number');
  eq([...M.duplicateNumbers([{ number: '4a' }, { number: '4A' }, { number: '' }, { number: '' }])], ['4A'], 'case-insensitive; blanks never clash');

  mem.delete(M.SHOTS_KEY);
  const b1 = M.addBlock('S1'), b2 = M.addBlock('S1'), b3 = M.addBlock('S1');
  eq([b1.name, b2.name, b3.name], ['Setup 1', 'Setup 2', 'Setup 3'], 'diagrams are Setup 1..3');
  const idx = M.listBlocks().findIndex((b) => b.id === b1.id);
  M.removeBlock(b1.id);
  eq(M.addBlock('S1').name, 'Setup 1', 'a new diagram takes the first free name, not a repeat of Setup 2');
  M.removeBlock(M.listBlocks().pop().id);
  M.restoreBlock(b1, idx);
  eq(M.listBlocks().map((b) => b.name), ['Setup 1', 'Setup 2', 'Setup 3'], 'restoreBlock puts the diagram back at its old place');
  mem.delete(M.SHOTS_KEY);
}

console.log(`\ntest:shots — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
