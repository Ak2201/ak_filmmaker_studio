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
void mem;

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

console.log(`\ntest:shots — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
