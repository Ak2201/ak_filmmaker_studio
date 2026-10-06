/* ============================================================
   SCREENPLAY ANALYSIS — screen time, cast matrix, auto-tagging
   ------------------------------------------------------------
   src/lib/screenplay-analysis.js in Node, no browser:

       node scripts/test-screenplay.mjs   (or: npm run test:screenplay)

   Includes the PRD's performance requirement (§6): a 120-page
   .fountain ingested, parsed, scene-split, estimated and auto-tagged
   inside 1200ms. The fixture is generated, not committed.
   ============================================================ */
import { mem } from './node-seams.mjs';
void mem;

const A = await import('../src/lib/screenplay-analysis.js');
const { parseScript } = await import('../src/lib/script-import.js');
const { pageCount } = await import('../src/lib/script.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const el = (type, text) => ({ type, text });
const script = [
  el('action', 'FADE IN:'),
  el('scene', 'INT. TEA STALL - DAY'),
  el('action', 'Steam off a kettle. RAVI, 30s, counts coins on the counter. His phone RINGS.'),
  el('character', 'RAVI'),
  el('dialogue', 'Not today. I said not today.'),
  el('character', 'MEENA (O.S.)'),
  el('dialogue', 'Then when?'),
  el('scene', 'EXT. HIGHWAY - NIGHT'),
  el('action', 'A police jeep chases an auto. The auto crashes into a lorry.'),
  el('action', 'Ravi falls. A siren.'),
  el('scene', 'INT. RAVI HOUSE - NIGHT'),
  el('character', "RAVI (CONT'D)"),
  el('dialogue', 'Meena?'),
  el('character', 'MEENA'),
  el('dialogue', 'Here.'),
  el('character', 'KUMAR'),
  el('dialogue', 'And me.')
];
const scenes = [
  { id: 's1', number: '1', intExt: 'INT', location: 'Tea stall', dayNight: 'DAY', eighths: 4, elements: { cast: ['Ravi'], props: ['Kettle'] } },
  { id: 's2', number: '2', intExt: 'EXT', location: 'Highway', dayNight: 'NIGHT', eighths: 8, elements: {} },
  { id: 's3', number: '3', intExt: 'INT', location: 'Ravi house', dayNight: 'NIGHT', eighths: 2, elements: { cast: ['Meena'] } },
  { id: 's4', number: '4', intExt: 'INT', location: "Lakshmi's flat", dayNight: 'DAY', eighths: 8, elements: { cast: ['Lakshmi'] } }
];

/* ---- slicing and pairing ---- */
eq(A.sliceScript(script).map((s) => s.heading), ['INT. TEA STALL - DAY', 'EXT. HIGHWAY - NIGHT', 'INT. RAVI HOUSE - NIGHT'], 'script cut at headings; preamble dropped');
const paired = A.pairScenes(scenes, script);
eq(paired.map((p) => p.slice && p.slice.heading), ['INT. TEA STALL - DAY', 'EXT. HIGHWAY - NIGHT', 'INT. RAVI HOUSE - NIGHT', null], 'each row pairs with the heading naming its place; a row with none gets none');
eq(paired.map((p) => p.how), ['heading', 'heading', 'heading', null], 'pairs say how they were made');

/* H3: ONE slicer. ai.js's name for it must be the same function, so the
   AI shot division can never again send scene N the preamble or scene
   N-1's pages. */
/* ai.js cannot be imported here (store.js is stubbed and it needs
   rawGet), so the guarantee is checked in the source: ai.js aliases the
   one slicer, and visualize.js asks matchScenes() instead of cutting the
   script itself. A third copy that keeps the preamble is the bug. */
{
  const { readFileSync } = await import('node:fs');
  const src = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const ai = src('src/lib/ai.js'), vz = src('src/pages/visualize.js');
  ok(/import \{ sliceScript \} from '\.\/screenplay-analysis\.js'/.test(ai) && /export const sliceScriptByScene = sliceScript;/.test(ai), 'ai.js sliceScriptByScene is an alias of the one slicer');
  ok(!/type === 'scene'/.test(ai.slice(ai.indexOf('MATCHING THE SCRIPT'), ai.indexOf('export function sceneScriptText'))), 'ai.js carries no slicer of its own');
  ok(/matchScenes\(scenes, script\.elements\)/.test(vz) && !/el\.type === 'scene'/.test(vz), 'visualize.js pairs through matchScenes() and slices nothing itself');
}
eq(A.sliceScript(script)[0].elements.map((e) => e.text).slice(0, 1), ['Steam off a kettle. RAVI, 30s, counts coins on the counter. His phone RINGS.'], 'scene 1 text starts after its own heading, not with the preamble');
ok(!A.sliceScript(script).some((s) => s.elements.some((e) => e.text === 'FADE IN:')), 'the preamble belongs to no slice');

/* H4: pairing is by content, so a delete or a move keeps each row's text. */
{
  const deleted = scenes.filter((s) => s.id !== 's2');
  eq(A.pairScenes(deleted, script).map((p) => p.slice && p.slice.heading), ['INT. TEA STALL - DAY', 'INT. RAVI HOUSE - NIGHT', null], 'deleting scene 2 does not shift scene 3 onto the highway');
  const moved = [scenes[1], scenes[0], scenes[2], scenes[3]];
  eq(A.pairScenes(moved, script).map((p) => [p.scene.id, p.slice && p.slice.heading]),
    [['s2', 'EXT. HIGHWAY - NIGHT'], ['s1', 'INT. TEA STALL - DAY'], ['s3', 'INT. RAVI HOUSE - NIGHT'], ['s4', null]], 'moving scene 1 down keeps its own heading');
  const m = A.matchScenes(deleted, script);
  eq(m.unmatchedScenes.map((s) => s.id), ['s4'], 'unmatched scene rows are reported');
  eq(m.unmatchedHeadings.map((s) => s.heading), ['EXT. HIGHWAY - NIGHT'], 'unmatched headings are reported');
  const said = A.describeMatch(m).join(' ');
  ok(/1 scene has no matching heading in the script \(scene 4\)/.test(said), 'the report says which scene: ' + said);
  ok(/1 heading in the script has no scene row: EXT\. HIGHWAY - NIGHT/.test(said), 'the report names the orphan heading');
  eq(A.describeMatch(A.matchScenes(scenes.slice(0, 3), script)), [], 'nothing to report when every row and heading paired');
  eq(A.describeMatch(A.matchScenes(scenes, [])), [], 'no script, no report');
  // Screen time and the cast matrix read the same join.
  const st2 = A.screenTime(moved, script);
  eq(st2.rows.map((r) => r.heading), ['EXT. HIGHWAY - NIGHT', 'INT. TEA STALL - DAY', 'INT. RAVI HOUSE - NIGHT', ''], 'screen time follows the moved rows');
  const cm2 = A.castMatrix(deleted, script);
  eq(cm2.density.map((d) => d.count), [2, 3, 1], 'cast matrix follows the deleted row');
  // ADD ALL's input: suggestions follow the join too.
  eq(A.suggestAll(moved, script).map((r) => [r.scene.id, r.how]), [['s2', 'heading'], ['s1', 'heading'], ['s3', 'heading']], 'suggestions follow the moved rows');
}

/* Normalisation: case, punctuation, a year, a scene number, synonyms. */
eq(A.headingParts("12 INT. RAGAVAN'S HOUSE, VILLIVAKKAM - MORNING (2014) 12"), { ie: 'INT', place: 'RAGAVANS HOUSE VILLIVAKKAM', time: 'DAY', number: '12' }, 'heading parts');
eq(A.headingParts('INT./EXT. CAR - NIGHT').ie, 'INT/EXT', 'INT./EXT. folds');
eq(A.sceneParts({ intExt: 'EXT', location: 'Engineering college — front block', dayNight: 'DAY' }).place,
  A.headingParts('EXT. ENGINEERING COLLEGE - FRONT BLOCK - DAY').place, 'an em dash in the row and a hyphen in the heading are the same place');

/* A place that occurs twice is settled by number, and a guess is labelled. */
{
  const rep = [
    el('scene', 'INT. CANTEEN - DAY'), el('action', 'First.'),
    el('scene', 'EXT. QUAD - DAY'), el('action', 'Between.'),
    el('scene', 'INT. CANTEEN - DAY'), el('action', 'Second.')
  ];
  const rows = [
    { id: 'c2', number: '3', intExt: 'INT', location: 'Canteen', dayNight: 'DAY' },
    { id: 'c1', number: '1', intExt: 'INT', location: 'Canteen', dayNight: 'DAY' }
  ];
  eq(A.pairScenes(rows, rep).map((p) => p.slice.elements[0].text), ['Second.', 'First.'], 'a repeated place is settled by scene number, not order');
  // Unnumbered and unequal: ambiguous, so nothing is guessed.
  const amb = A.matchScenes([{ id: 'x', number: '', intExt: 'INT', location: 'Canteen', dayNight: 'DAY' }], rep);
  eq(amb.pairs[0].slice, null, 'one unnumbered canteen against two canteen headings is left unmatched');
  // A renamed row between two matched neighbours is paired by position, and says so.
  const ren = [
    { id: 'a', number: '1', intExt: 'INT', location: 'Canteen', dayNight: 'DAY' },
    { id: 'b', number: '2', intExt: 'EXT', location: 'The big lawn', dayNight: 'DAY' },
    { id: 'c', number: '3', intExt: 'INT', location: 'Canteen', dayNight: 'DAY' }
  ];
  const rm2 = A.matchScenes(ren, rep);
  eq(rm2.pairs.map((p) => p.how), ['heading', 'position', 'heading'], 'a renamed row in an intact run is a position guess');
  ok(!A.isConfident('position') && A.isConfident('heading') && A.isConfident('location'), 'only heading and location pairs are confident');
  ok(/paired by position only/.test(A.describeMatch(rm2).join(' ')), 'a position guess is reported');
}

/* ADD ALL's undo removes exactly what it added. */
{
  const S = await import('../src/lib/scenes.js');
  S.saveScenes([{ ...S.blankScene({ id: 'u1' }), elements: { props: ['Kettle'] } }]);
  const added = S.tagMany([
    { sceneId: 'u1', category: 'props', name: 'kettle' },
    { sceneId: 'u1', category: 'props', name: 'Phone' },
    { sceneId: 'u1', category: 'cast', name: 'Ravi' }
  ]);
  eq(added.map((t) => t.name), ['Phone', 'Ravi'], 'tagMany reports only what it added (kettle was already there)');
  S.tagElement('u1', 'props', 'Coins');
  eq(S.untagMany(added), 2, 'untagMany removes the two it added');
  eq(S.listScenes()[0].elements, { props: ['Kettle', 'Coins'], cast: [] }, 'and leaves the tags a person made');
}

/* ---- screen time ---- */
const st = A.screenTime(scenes, script);
eq(st.rows.map((r) => r.method), ['script', 'script', 'script', 'eighths'], 'script text when present, eighths otherwise');
eq(st.rows[3].seconds, 60, 'a full page with no script text is a minute');
ok(st.rows[0].dialogueWords === 8 && st.rows[0].speeches === 2, 'dialogue words and speeches counted');
const terse = A.estimateSlice({ elements: [el('action', 'He runs. She turns. The door. Silence.')] });
const prose = A.estimateSlice({ elements: [el('action', 'He runs down the long corridor past the doors and turns at the end where she waits.')] });
ok(terse.seconds >= prose.seconds - 1, 'terse action plays at least as long as one long sentence of more words');
const talk = A.estimateSlice({ elements: [el('character', 'A'), el('dialogue', Array(60).fill('word').join(' '))] });
ok(talk.seconds >= 22 && talk.seconds <= 30, `60 words of dialogue is ~25s at ~155 wpm (got ${talk.seconds})`);
eq(st.total, st.rows.reduce((n, r) => n + r.seconds, 0), 'total is the sum of the rows');
eq(A.formatDuration(75), '1:15', 'mm:ss');
eq(A.formatDuration(3725), '1h 02m', 'hours');

/* A realistic page: ~55 lines of mixed action and dialogue lands near a minute. */
const page = [];
for (let i = 0; i < 6; i++) {
  page.push(el('action', 'Ravi crosses to the window and looks down at the street below, where the jeep is waiting.'));
  page.push(el('character', 'RAVI'), el('dialogue', 'They found us. I told you they would find us before the morning.'));
  page.push(el('character', 'MEENA'), el('dialogue', 'Then we leave now.'));
}
const pg = A.estimateSlice({ elements: page });
const pgPages = pageCount([el('scene', 'INT. X - DAY'), ...page]);
const ratio = pg.seconds / (pgPages * 60);
ok(ratio > 0.8 && ratio < 1.25, `a mixed page stays within 20% of a page a minute (${pg.seconds}s for ${pgPages.toFixed(2)} pages)`);

/* ---- cast matrix ---- */
const cm = A.castMatrix(scenes, script);
const names = cm.characters.map((c) => c.name);
ok(names.includes('Ravi') && names.includes('Meena') && names.includes('KUMAR') && names.includes('Lakshmi'), 'union of tagged cast and script cues: ' + names.join(','));
eq(cm.characters.find((c) => c.name === 'Ravi').scenes.size, 2, "RAVI (CONT'D) is Ravi; tagged + cue in two scenes");
eq(cm.characters.find((c) => c.name === 'Meena').scenes.size, 2, 'MEENA (O.S.) is Meena');
const rm = cm.interactions.find((x) => [x.a.name, x.b.name].sort().join() === 'Meena,Ravi');
eq(rm && rm.shared, 2, 'Ravi and Meena share two scenes');
eq(cm.density.map((d) => d.count), [2, 0, 3, 1], 'cast per scene');
ok(cm.density[2].high === true && cm.density[0].high === false, 'the three-hander is flagged dense (threshold ' + cm.threshold + ')');

/* ---- suggestions ---- */
const sug = A.suggestElements(scenes[0], paired[0].slice);
eq(sug.cast.map((x) => x.name), ['Meena'], 'cast suggestions skip the tagged Ravi (cue and caps intro), keep Meena');
eq(sug.props.map((x) => x.name), ['coins', 'phone'], 'props: kettle already tagged; coins and phone suggested');
eq(sug.sound.map((x) => x.name), ['rings'], 'a capitalised sound cue is suggested');
ok(sug.props[0].from.includes('phone RINGS'), 'a suggestion carries the line it came from');
const s2 = A.suggestElements(scenes[1], paired[1].slice);
eq(s2.vehicles.map((x) => x.name).sort(), ['auto', 'lorry', 'police jeep'], 'vehicles, longest phrase first ("police jeep" not "jeep")');
eq(s2.stunts.map((x) => x.name).sort(), ['chases', 'crashes', 'falls'], 'stunts');
ok(s2.sound.some((x) => x.name === 'siren'), 'lower-case sound word');
eq(A.suggestElements({ elements: {} }, { elements: [el('action', 'He wears a scarf and runs a business.')] }).vehicles, [], 'whole words only: scarf is not car, business is not bus');
eq(A.suggestAll(scenes, script).length, 3, 'suggestAll returns only scenes with suggestions');

/* ---- PRD §6: 120 pages inside 1200ms ---- */
const lines = ['Title: Perf', '', 'FADE IN:', ''];
let n = 0;
while (lines.length < 120 * 55) {
  n++;
  lines.push(`${n % 2 ? 'INT' : 'EXT'}. LOCATION ${n} - ${n % 3 ? 'DAY' : 'NIGHT'}`, '');
  lines.push('RAVI, 30s, crosses to the window. A police jeep waits below; his phone RINGS.', '');
  lines.push('RAVI', 'They found us. I told you they would.', '');
  lines.push('MEENA', '(quietly)', 'Then we leave now, before the siren.', '');
  lines.push('Meena grabs the bag and the certificate. They run for the auto.', '');
}
const fountain = lines.join('\n');
const t0 = performance.now();
const parsed = parseScript(fountain, 'perf.fountain');
const rows = parsed.scenes.rows || parsed.scenes;
const t1 = performance.now();
const tagged = A.suggestAll(rows, parsed.elements);
const time = A.screenTime(rows, parsed.elements);
const matrix = A.castMatrix(rows, parsed.elements);
const t2 = performance.now();
ok(parsed.pages >= 115, `fixture is ~120 pages (got ${parsed.pages})`);
ok(tagged.length === rows.length && time.rows.length === rows.length && matrix.characters.length >= 2, 'every scene analysed');
const ms = Math.round(t2 - t0);
ok(ms < 1200, `120-page parse + tag + estimate in ${ms}ms (budget 1200ms; parse ${Math.round(t1 - t0)}ms)`);

console.log(`${fail ? '✗' : '✓'} screenplay analysis: ${pass} passed, ${fail} failed (120 pages in ${ms}ms)`);
process.exit(fail ? 1 : 0);
