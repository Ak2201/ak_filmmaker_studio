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
eq(A.suggestElements({ elements: {} }, { elements: [el('character', "RAGAVAN'S FATHER")] }).cast.map((x) => x.name), ["Ragavan's Father"], 'a cue with a possessive is title-cased without a capital after the apostrophe');
eq(['mary-jane', "o'brien", 'dr. kumar (old)'].map(A.titleCase), ['Mary-Jane', "O'Brien", 'Dr. Kumar (Old)'], 'title case: hyphens, O\' prefixes, brackets');
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

/* ============================================================
   THE FORMAT ENGINE (docs/SCREENPLAY-WRITER-PLAN.md, phase 1):
   the shot element, dual dialogue, (CONT'D), the title page, and the
   page view and the PDF agreeing because they are one paginator.
   ============================================================ */
{
  const S = await import('../src/lib/script.js');
  const X = await import('../src/lib/screenplay-export.js');
  const { readFileSync } = await import('node:fs');
  const { DOMParser } = await import('linkedom');
  globalThis.DOMParser = DOMParser;
  const sample = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8')).elements;
  const id = (() => { let k = 0; return () => 'e' + (++k); })();
  const E = (type, text, extra) => ({ id: id(), type, text, ...(extra || {}) });

  /* ---- an old script is unchanged ---- */
  const oldBlob = JSON.stringify({
    elements: sample.map((e, i) => ({ id: 'old' + i, type: e.type, text: e.text })),
    revisions: [{ id: 'r1', name: 'Draft', date: '2026-01-01T00:00:00.000Z', elements: [{ id: 'x', type: 'action', text: 'A' }] }],
    documents: [{ id: 'd1', title: 'T', kind: 'Notes', body: 'B', updated: '2026-01-01T00:00:00.000Z' }]
  });
  mem.set(S.SCRIPT_KEY, oldBlob);
  S.saveScript(S.loadScript());
  ok(mem.get(S.SCRIPT_KEY) === oldBlob, 'a script with no shot, no dual and no title page is byte-identical after load + save');
  eq(sample.length, 2361, 'the sample still has 2,361 elements');
  eq(S.pageCount(sample), 106.5, 'the sample still counts 106.5 pages');
  eq(X.sheetCount(sample), 115, 'the sample still prints on 115 sheets');

  /* ---- the shot ---- */
  eq(S.ELEMENT_TYPE_IDS, ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'], 'shot is the seventh type, added last');
  eq(S.NEXT_TYPE.shot, 'action', 'Return after a shot gives action');
  const shotScript = [E('scene', 'INT. A - DAY'), E('action', 'He waits.'), E('shot', 'close on the knife'), E('action', 'It shines.'), E('scene', 'EXT. B - NIGHT'), E('action', 'Rain.')];
  const sl = A.sliceScript(shotScript);
  eq(sl.map((s) => s.heading), ['INT. A - DAY', 'EXT. B - NIGHT'], 'a shot does not open a scene');
  eq(sl[0].elements.map((e) => e.type), ['action', 'shot', 'action'], 'a shot stays inside its scene');
  ok(A.estimateSlice(sl[0]).seconds > A.estimateSlice({ elements: [sl[0].elements[0], sl[0].elements[2]] }).seconds, 'a shot takes screen time like an action beat');
  const shotPages = X.paginate(shotScript);
  const shotRow = shotPages[0].find((r) => r.type === 'shot');
  eq(shotRow && shotRow.lines, ['CLOSE ON THE KNIFE'], 'a shot prints in capitals');
  ok(shotRow && !shotRow.sceneNo, 'a shot takes no scene number');
  eq(shotPages[0].filter((r) => r.sceneNo).map((r) => r.sceneNo), ['1', '2'], 'headings are numbered 1, 2 around it');
  eq(S.elementLines(E('shot', 'X')), 2, 'a shot counts its blank line and its text');
  const shotFountain = S.toFountain({ elements: shotScript }, { title: 'T', date: '2026-10-06' });
  ok(/\nCLOSE ON THE KNIFE\n/.test(shotFountain), 'Fountain writes a shot plain, with no forcing !');
  eq(parseScript(shotFountain, 'x.fountain').elements.map((e) => e.type), shotScript.map((e) => e.type), 'Fountain round trip keeps the shot');
  eq(parseScript(X.toText({ elements: shotScript }, { title: 'T' }), 'x.txt').elements.map((e) => e.type), shotScript.map((e) => e.type), 'screenplay text round trip keeps the shot');
  eq(parseScript('INT. A - DAY\n\nTHE DOOR OPENS.\n', 'x.fountain').elements.map((e) => e.type), ['scene', 'action'], 'capitals without a shot word stay action');
  // The sample has no shot, and must not grow one on a text round trip.
  const rt = parseScript(X.toText({ elements: sample }, { title: 'T' }), 'x.txt').elements;
  ok(!rt.some((e) => e.type === 'shot'), 'the sample read back from its own text export has no invented shot');

  /* ---- dual dialogue ---- */
  const dual = [
    E('scene', 'INT. TEA STALL - NIGHT'),
    E('character', 'RAVI'), E('dialogue', 'We are not doing this tonight. Not here, not in front of everyone.'),
    E('character', 'MEENA', { dual: true }), E('paren', 'over him'), E('dialogue', 'Then when?'),
    E('action', 'The kettle screams.'),
    E('character', 'RAVI'), E('dialogue', 'Turn it off.')
  ];
  eq(S.dualPairs(dual), [{ left: [1, 2], right: [3, 5] }], 'the flagged cue pairs with the speech directly above');
  eq(S.dualPairs([E('action', 'x'), E('character', 'A', { dual: true }), E('dialogue', 'y')]), [], 'a flag with no speech above pairs with nothing');
  ok(!('dual' in S.blankElement({ type: 'action', text: 'x', dual: true })), 'only a cue may carry the flag');
  ok(S.canPairDual(dual, 3) && !S.canPairDual(dual, 7), 'canPairDual: yes under a speech, no under action');
  const flat = dual.map((e) => ({ ...e, dual: undefined }));
  ok(S.totalLines(dual) < S.totalLines(flat), 'a dual block counts its taller column, not both');
  const dPages = X.paginate(dual);
  const dRow = dPages[0].find((r) => r.type === 'dual');
  ok(dRow && dRow.cols.length === 2 && dRow.cols[0][0].type === 'character' && dRow.cols[1].length === 3, 'paginate makes one two-column row');
  eq(dRow.lines.length, Math.max(dRow.cols[0].reduce((n, r) => n + r.lines.length, 0), dRow.cols[1].reduce((n, r) => n + r.lines.length, 0)), "the block's height is its taller column");
  ok(dRow.lines.every((l) => l.length <= 60), 'both columns fit the 60-character block');
  // a pair that would straddle a page moves whole
  const filler = Array.from({ length: 24 }, (_, k) => E('action', 'Line ' + k + '.'));
  const tall = [E('scene', 'INT. X - DAY'), ...filler, ...dual.slice(1, 6)];
  const tp2 = X.paginate(tall);
  ok(tp2.length === 2 && tp2[1][0].type === 'dual' && !tp2[0].some((r) => r.type === 'dual'), 'a pair that does not fit moves to the next page whole');
  const df = S.toFountain({ elements: dual }, { title: 'T', date: '2026-10-06' });
  ok(/\nMEENA \^\n/.test(df), 'Fountain marks the second cue with ^');
  const dfBack = parseScript(df, 'x.fountain').elements;
  eq(dfBack.map((e) => [e.type, e.text, !!e.dual]), dual.map((e) => [e.type, e.text, !!e.dual]), 'Fountain round trip keeps the pair');
  const fdx = S.toFDX({ elements: [...shotScript.slice(0, 3), ...dual.slice(1)] }, { title: 'Kettle' });
  ok(/<Paragraph>\s*<DualDialogue>[\s\S]*<\/DualDialogue>\s*<\/Paragraph>/.test(fdx) && /Type="Shot"/.test(fdx), '.fdx export writes a DualDialogue and a Shot');
  const fdxBack = parseScript(fdx, 'x.fdx');
  eq(fdxBack.elements.map((e) => [e.type, e.text, !!e.dual]), [...shotScript.slice(0, 3), ...dual.slice(1)].map((e) => [e.type, e.text, !!e.dual]), '.fdx export -> import round-trips shots and the pair');
  ok(!fdxBack.elements.some((e) => e.text === 'KETTLE'), "the .fdx title page does not leak into the script");

  /* ---- (CONT'D) ---- */
  ok(S.contdOffer(dual, 7), "offered: RAVI again after action, in the same scene (he spoke in the pair)");
  const cs = [E('scene', 'INT. A - DAY'), E('character', 'RAVI'), E('dialogue', 'One.'), E('action', 'He sits.'), E('character', 'RAVI (V.O.)'), E('dialogue', 'Two.')];
  ok(S.contdOffer(cs, 4), 'offered through an extension: RAVI (V.O.) is RAVI');
  ok(!S.contdOffer([...cs.slice(0, 4), E('character', "RAVI (CONT'D)")], 4), 'not offered when it is already typed');
  ok(!S.contdOffer([cs[0], cs[1], cs[2], E('character', 'RAVI')], 3), 'not offered with no action between (that is one speech)');
  ok(!S.contdOffer([cs[0], cs[1], cs[2], E('scene', 'EXT. B - DAY'), E('action', 'x'), E('character', 'RAVI')], 5), 'not offered across a scene heading');
  ok(!S.contdOffer([cs[0], cs[1], cs[2], cs[3], E('character', 'MEENA')], 4), 'not offered for a different speaker');
  eq(S.withContd('RAVI (V.O.)'), "RAVI (V.O.) (CONT'D)", "(CONT'D) goes after any other extension");
  eq(S.withContd("RAVI (CONT'D)"), "RAVI (CONT'D)", 'never twice');
  // the page break's own (CONT'D) does not double a typed one
  const longSpeech = Array.from({ length: 30 }, () => 'This is a long speech that goes on.').join(' ');
  const brk = [E('scene', 'INT. A - DAY'), ...Array.from({ length: 20 }, (_, k) => E('action', 'Beat ' + k + '.')), E('character', "RAVI (CONT'D)"), E('dialogue', longSpeech)];
  const bp = X.paginate(brk);
  const carried = bp.find((p, i) => i > 0 && p[0].contd);
  ok(!!carried, 'a long speech breaks across the page with a carried cue');
  eq(carried && carried[0].lines, ["RAVI (CONT'D)"], "a typed (CONT'D) is not doubled at the break");
  ok(bp.some((p) => p.some((r) => r.type === 'more')), '(MORE) is left at the foot');

  /* ---- the title page ---- */
  ok(!S.hasTitlePage(undefined) && !S.hasTitlePage(S.normaliseTitlePage({})), 'an empty title page is no title page');
  mem.set(S.SCRIPT_KEY, oldBlob);
  const withTp = S.loadScript();
  withTp.titlePage = S.normaliseTitlePage({});
  S.saveScript(withTp);
  ok(!JSON.parse(mem.get(S.SCRIPT_KEY)).titlePage, 'an empty title page is not stored');
  withTp.titlePage.title = 'Dragon';
  withTp.titlePage.author = 'A. Writer';
  withTp.titlePage.contact = 'a@example.com\n+91 98400 00000';
  S.saveScript(withTp);
  eq(S.loadScript().titlePage.contact, 'a@example.com\n+91 98400 00000', 'a filled title page round-trips through the blob');
  const tpTxt = X.toText({ elements: shotScript, titlePage: withTp.titlePage }, { title: 'P' });
  const front = tpTxt.split('\f')[0];
  ok(/DRAGON/.test(front) && /Written by/.test(front) && /A\. Writer/.test(front) && /a@example\.com/.test(front), 'the text export opens on the structured title page');
  ok(front.split('\n').length <= X.PAGE_LINES, 'the title page fits one page');
  const tpF = S.toFountain({ elements: shotScript, titlePage: withTp.titlePage }, { title: 'P', date: '2026-10-06' });
  ok(/^Title: Dragon\nCredit: Written by|^Title: Dragon\nAuthor: A\. Writer/.test(tpF) && /Contact: a@example\.com\n   \+91 98400 00000/.test(tpF), 'Fountain writes the title page, a multi-line value indented');
  const tpBack = parseScript(tpF, 'x.fountain');
  eq(tpBack.titlePage && tpBack.titlePage.contact, 'a@example.com\n+91 98400 00000', 'Fountain import reads a run-on title-page value');
  eq(tpBack.elements.map((e) => e.type), shotScript.map((e) => e.type), 'and the run-on line does not fall into the script');
  const tpFdx = parseScript(S.toFDX({ elements: shotScript, titlePage: { ...withTp.titlePage, draft: 'Second Draft' } }), 'x.fdx').titlePage;
  ok(tpFdx && tpFdx.title === 'DRAGON' && tpFdx.author === 'A. Writer' && tpFdx.draft === 'Second Draft' && tpFdx.contact === 'a@example.com\n+91 98400 00000', '.fdx title page round-trips: ' + JSON.stringify(tpFdx));

  /* ---- page view and PDF: one paginator ---- */
  const pages = X.paginate(sample.map((e, i) => ({ id: 's' + i, ...e })));
  eq(pages.length, X.sheetCount(sample), 'sheetCount is paginate().length');
  eq(X.toText({ elements: sample }, { title: 'T' }).split('\f').length - 1, pages.length, 'the text export has one form feed per paginated page');
  ok(pages.slice(1).every((p) => p.some((r) => r.id)), 'every page after the first starts at a known element, so the page view can mark it');
  const wsrc = readFileSync(new URL('../src/pages/write.js', import.meta.url), 'utf8');
  ok(/Typeset\.paginate\(doc\.elements\)/.test(wsrc), "write.js's page view reads the PDF's own paginate()");
  ok(!/function paginate|BODY_LINES|PAGE_LINES/.test(wsrc), 'write.js carries no paginator of its own');
  const t3 = performance.now();
  for (let k = 0; k < 5; k++) X.paginate(sample);
  const pms = (performance.now() - t3) / 5;
  ok(pms < 50, `paginate() on the 2,361-element sample in ${pms.toFixed(1)}ms (budget 50ms, run at idle)`);
}

console.log(`${fail ? '✗' : '✓'} screenplay analysis: ${pass} passed, ${fail} failed (120 pages in ${ms}ms)`);
process.exit(fail ? 1 : 0);
