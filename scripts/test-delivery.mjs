/* ============================================================
   TEST — certification flags and the dialogue list, in Node
   ------------------------------------------------------------
       node scripts/test-delivery.mjs   (or: npm run test:delivery)

   src/lib/cbfc.js and src/lib/dialogue-list.js are pure, so both
   are asserted here with no browser: every rule in cbfc-rules.json
   cites a source and a date, each rule fires on a case it must and
   stays quiet on a case it must not, the rating hint is the highest
   tier that fired, and the dialogue list's CSV and SRT are the shape
   a spreadsheet and a subtitling tool open. The Dragon sample is run
   through both, with a time budget.
   ============================================================ */
import { mem } from './node-seams.mjs';
void mem;

const C = await import('../src/lib/cbfc.js');
const L = await import('../src/lib/dialogue-list.js');
const RULES = (await import('../src/data/cbfc-rules.json')).default;
const SAMPLE = (await import('../src/data/sample.dragon.script.json')).default;
const DRAGON = (await import('../src/data/sample.dragon.json')).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const el = (type, text) => ({ type, text });
const scene = (id, patch = {}) => ({ id, number: id.replace(/\D/g, ''), intExt: 'INT', dayNight: 'DAY', location: 'ROOM ' + id, synopsis: '', eighths: 8, elements: {}, ...patch });

/* ---- the rules file is honest -------------------------------- */
ok(RULES.rules.length >= 10, 'ten or more rules');
for (const r of RULES.rules) {
  ok(r.source && r.checked && /^\d{4}-\d{2}-\d{2}$/.test(r.checked), `${r.id} cites a source and a checked date`);
  ok(Array.isArray(r.sourceUrls) && r.sourceUrls.length && r.sourceUrls.every((u) => /^https:\/\//.test(u)), `${r.id} names where it was read`);
  ok(['requirement', 'review', 'caution'].includes(r.kind), `${r.id} has a kind`);
  ok(['official', 'secondary', 'uncertain'].includes(r.confidence), `${r.id} says how sure it is`);
  ok(r.tiers.every((t) => t.hint === null || C.RATINGS.includes(t.hint)), `${r.id}: every hint is a real category`);
  ok(r.tiers.every((t) => Array.isArray(t.ta)), `${r.id}: every tier carries a romanised Tamil list, even if empty`);
}
eq(C.RATINGS, ['U', 'UA 7+', 'UA 13+', 'UA 16+', 'A'], 'the 2024 categories, lowest first');
ok(/hint|guess/i.test(C.DISCLAIMER) && /not legal advice/i.test(C.DISCLAIMER), 'the disclaimer says it is a guess and not advice');
ok(['tobacco', 'alcohol', 'animals', 'violence', 'sexual', 'language', 'community', 'realnames', 'emblems', 'children', 'drugs']
  .every((id) => C.ruleById(id)), 'every asked-for category has a rule');

/* ---- matching ----------------------------------------------- */
const re = C.termsRegex(['stab*', 'dead body', 'கொலை']);
ok(re.test('He stabbed him.'), 'a * takes any ending'); re.lastIndex = 0;
re.lastIndex = 0;
ok(re.test('The dead\nbody lies there'), 'a phrase matches across a line break'); re.lastIndex = 0;
ok(re.test('அவன் கொலை செய்தான்'), 'Tamil script matches as a whole word'); re.lastIndex = 0;
ok(!C.termsRegex(['cat']).test('a category'), 'whole words only');
ok(!C.termsRegex(['kolai']).test('kolaiyaali'), 'no * means no ending');
eq(C.agesIn('MEENA, 9, at the gate. RAVI, 30s, behind her. YOUNG RAGAVAN (17).').map((a) => [a.name, a.age]),
  [['MEENA', 9], ['YOUNG RAGAVAN', 17]], 'ages read from cast introductions; 30s is not an age');

const flagsOf = (els, sc = [scene('s1')]) => C.certificationReport(sc, els).rows[0].flags;
const has = (els, id, sc) => flagsOf(els, sc).some((f) => f.ruleId === id);
const HEAD = el('scene', 'INT. ROOM S1 - DAY');

/* [rule, must flag, must not] */
const CASES = [
  ['tobacco', [HEAD, el('action', 'He lights a cigarette and stares.')], [HEAD, el('action', 'Smoke rises from the kettle.')]],
  ['tobacco', [HEAD, el('action', 'Oru beedi pudikkiran.')], [HEAD, el('character', 'RAVI'), el('dialogue', 'Cigarette vaangitu vaa.')]],
  ['drugs', [HEAD, el('action', 'A packet of ganja on the table.')], [HEAD, el('action', 'A packet of biscuits.')]],
  ['alcohol', [HEAD, el('character', 'MANI'), el('dialogue', 'Sarakku adikkalaam vaa.')], [HEAD, el('action', 'He drinks his tea.')]],
  ['animals', [HEAD, el('action', 'A dog sleeps under the bench.')], [HEAD, el('character', 'RAVI'), el('dialogue', 'Naaye! Po da.')]],
  ['violence', [HEAD, el('action', 'He stabs the man twice.')], [HEAD, el('action', 'He hands over the punchline of the joke.')]],
  ['sexual', [HEAD, el('action', 'They kiss.')], [HEAD, el('action', 'They shake hands.')]],
  ['language', [HEAD, el('character', 'RAVI'), el('dialogue', 'Dei loosu, enna pannura?')], [HEAD, el('character', 'RAVI'), el('dialogue', 'Dei, enna pannura?')]],
  ['community', [HEAD, el('character', 'RAVI'), el('dialogue', 'Enna jaathi nee?')], [HEAD, el('character', 'RAVI'), el('dialogue', 'Enna paeru nee?')]],
  ['realnames', [HEAD, el('action', 'A board: APOLLO HOSPITAL.')], [HEAD, el('action', 'A board: GOVERNMENT HOSPITAL.')]],
  ['realnames', [el('scene', "INT. ST. MARY'S COLLEGE - DAY")], [el('scene', 'INT. ENGINEERING COLLEGE - DAY')]],
  ['emblems', [HEAD, el('action', 'A police constable at the gate.')], [HEAD, el('action', 'A watchman at the gate.')]],
  ['children', [HEAD, el('action', 'MEENA, 9, waits at the gate.')], [HEAD, el('action', 'MEENA, 29, waits at the gate.')]],
  ['children', [HEAD, el('action', 'A small boy plays cricket.')], [HEAD, el('action', 'The college boys play cricket.')]]
];
for (const [rule, yes, no] of CASES) {
  ok(has(yes, rule), `${rule} fires on: ${yes.map((e) => e.text).join(' / ')}`);
  ok(!has(no, rule), `${rule} stays quiet on: ${no.map((e) => e.text).join(' / ')}`);
}
ok(has([], 'animals', [scene('s1', { elements: { animals: ['Bullock'] } })]), 'a breakdown tag under Animals flags animals by itself');
ok(has([], 'tobacco', [scene('s1', { synopsis: 'Ravi smoking on the terrace.' })]), 'a scene row with no script is read from its synopsis');

/* children: the hazard only counts beside a child, and an adolescent is a review */
const kid = flagsOf([HEAD, el('action', 'MEENA, 9, runs across the traffic.')]).find((f) => f.ruleId === 'children');
ok(kid && kid.kind === 'requirement' && kid.tiers.includes('hazard'), 'a child beside a hazard is a requirement with the hazard noted');
ok(!has([HEAD, el('action', 'He runs across the traffic.')], 'children'), 'a hazard with no child flags nothing');
const teen = flagsOf([HEAD, el('action', 'YOUNG RAGAVAN, 17, at the back.')]).find((f) => f.ruleId === 'children');
ok(teen && teen.kind === 'review' && teen.tiers.join() === 'adolescent', 'a 17-year-old is flagged for review, not as needing the DM permission');

/* evidence */
const ev = flagsOf([HEAD, el('action', 'He lights a cigarette and stares.')]).find((f) => f.ruleId === 'tobacco');
ok(/cigarette/i.test(ev.hits[0].term) && ev.hits[0].type === 'action' && /stares/.test(ev.hits[0].from), 'each hit carries its term, its type and its line');

/* ---- the rating hint ----------------------------------------- */
const hint = (els) => C.certificationReport([scene('s1')], els).hint;
eq(hint([HEAD, el('action', 'Ravi reads the paper.')]).rating, 'U', 'nothing: U');
eq(hint([HEAD, el('action', 'He lights a cigarette.')]).rating, 'U', 'tobacco alone does not move the category');
eq(hint([HEAD, el('action', 'A fight breaks out.')]).rating, 'UA 7+', 'mild violence: UA 7+');
eq(hint([HEAD, el('action', 'A fight. Blood on the floor.')]).rating, 'UA 13+', 'the highest tier wins');
eq(hint([HEAD, el('action', 'They undress.')]).rating, 'A', 'explicit content: A');
const h2 = hint([HEAD, el('action', 'Blood on the floor.')]);
ok(h2.basis === 'heuristic' && h2.reasons[0].ruleId === 'violence' && h2.disclaimer === C.DISCLAIMER, 'the hint says why and carries its disclaimer');

/* ---- the join and the unmatched ------------------------------ */
const rep = C.certificationReport([scene('s1', { location: 'ROOM S1' })], [el('scene', 'INT. ROOM S1 - DAY'), el('action', 'Calm.'), el('scene', 'EXT. ROAD - NIGHT'), el('action', 'He stabs him.')]);
eq(rep.rows.length, 2, 'a heading with no scene row is still a row');
ok(rep.rows[1].scene === null && rep.rows[1].flags.some((f) => f.ruleId === 'violence'), 'and it is scanned');
eq(rep.byRule.map((b) => b.rule.id), ['violence'], 'byRule lists only the rules that fired');

/* ---- Dragon, with a budget ----------------------------------- */
const dScenes = DRAGON.scenes.map((s, i) => ({ id: 'd' + i, elements: {}, ...s }));
const t0 = performance.now();
const dr = C.certificationReport(dScenes, SAMPLE.elements);
const ms = Math.round(performance.now() - t0);
ok(ms < 600, `the Dragon sample scanned in ${ms}ms (budget 600)`);
eq(dr.scanned.scenes, dScenes.length, 'every Dragon scene is read');
ok(dr.rows.find((r) => r.number === '1').flags.some((f) => f.ruleId === 'children' && f.tiers.includes('adolescent')), 'Dragon scene 1: Young Ragavan, 17, is flagged for review');
ok(C.RATINGS.includes(dr.hint.rating), 'Dragon gets a hint: ' + dr.hint.rating);

/* ---- dialogue list -------------------------------------------- */
const script = [
  el('character', 'NARRATOR (V.O.)'), el('dialogue', 'Before anything.'),
  el('scene', 'INT. TEA STALL - DAY'),
  el('action', 'Steam.'),
  el('character', "RAVI (CONT'D)"), el('paren', '(quietly)'), el('dialogue', 'Oru tea, "strong", please.'),
  el('paren', '(beat)'), el('dialogue', 'Illa — rendu.'),
  el('action', 'He pays.'),
  el('dialogue', 'An orphan line.'),
  el('scene', 'EXT. ROAD - NIGHT'),
  el('character', 'MEENA ^'), el('dialogue', '=SUM(A1)\n\nLine two.')
];
const dl = L.dialogueRows(script, [scene('s7', { number: '7', location: 'TEA STALL' }), scene('s9', { number: '9', intExt: 'EXT', dayNight: 'NIGHT', location: 'ROAD' })]);
eq(dl.rows.length, 5, 'every dialogue element is a row, including above the first heading');
eq(dl.rows.map((r) => r.scene), ['', '7', '7', '7', '9'], 'scene numbers come from the matched scene rows');
eq(dl.rows.map((r) => r.character), ['NARRATOR (V.O.)', 'RAVI', 'RAVI', '', 'MEENA'], 'speakers: V.O. kept, CONT\'D and ^ dropped, action ends a speech');
eq(dl.rows.map((r) => r.parenthetical), ['', 'quietly', 'beat', '', ''], 'parentheticals attach to the next line');
eq(dl.rows.map((r) => r.n), [1, 2, 3, 4, 5], 'numbered from 1');
ok(dl.rows.every((r) => r.english === ''), 'the English column is empty');
eq(L.dialogueRows(script).rows.map((r) => r.scene), ['', '1', '1', '1', '2'], 'without scene rows, the heading position numbers them');

const csv = L.toCSV(dl);
ok(csv.startsWith('﻿'), 'CSV starts with a byte-order mark');
const lines = csv.slice(1).split('\r\n');
eq(lines[0], 'No.,Reel (est.),Scene,Slug line,Character,Parenthetical,Dialogue — Tamil,Dialogue — English', 'CSV header');
ok(lines[2].includes('"Oru tea, ""strong"", please."'), 'a comma and quotes are quoted RFC-4180 style: ' + lines[2]);
ok(csv.includes(`"'=SUM(A1)`), 'a formula-looking line is defused with an apostrophe');
eq(L.csvField('- wait'), '- wait', 'a dash followed by a space is dialogue, not a formula');
eq(L.csvField('-1+1'), "'-1+1", 'a dash followed by a digit is defused');

const srt = L.toSRT(dl);
const cues = srt.trim().split(/\r\n\r\n/);
eq(cues.length, 5, 'one SRT cue per line');
eq(cues[1].split('\r\n'), ['2', L.BLANK_TIMECODE, 'Oru tea, "strong", please.'], 'a cue is number, blank timecode, text');
ok(!/\r\n\r\n/.test(cues[4]) && cues[4].endsWith('=SUM(A1)\r\nLine two.'), 'a blank line inside a line is folded so it cannot end the cue');
eq(L.BLANK_TIMECODE, '00:00:00,000 --> 00:00:00,000', 'the blank timecode is the SRT shape');
ok(L.toSRT(dl, { speakers: true }).includes('RAVI: Oru tea'), 'speakers can be prefixed on request');

/* reels: estimated from screen time, breaking between scenes */
const long = [];
for (let i = 0; i < 40; i++) {
  long.push(el('scene', `INT. ROOM ${i} - DAY`), el('action', 'A long silence. '.repeat(60)), el('character', 'RAVI'), el('dialogue', 'Line ' + i + '.'));
}
const reels = L.dialogueRows(long).rows.map((r) => r.reel);
ok(reels[0] === 1 && reels[reels.length - 1] > 1 && reels.every((r, i) => i === 0 || r >= reels[i - 1]), 'reels start at 1 and only go up: ' + [...new Set(reels)].join(','));

const t1 = performance.now();
const dd = L.dialogueRows(SAMPLE.elements, dScenes);
const ms2 = Math.round(performance.now() - t1);
ok(dd.rows.length > 100 && ms2 < 600, `Dragon: ${dd.rows.length} lines in ${ms2}ms`);
ok(dd.rows[0].character === 'YOUNG RAGAVAN' && dd.rows[0].line === 'Nandri, sir.' && dd.rows[0].scene === '1', 'Dragon line 1 is Young Ragavan in scene 1');
eq(dd.reels, Math.max(...dd.rows.map((r) => r.reel)), 'reels is the last reel');

console.log(`${fail ? '✗' : '✓'} test:delivery — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
