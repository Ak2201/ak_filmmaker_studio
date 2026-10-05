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
  { id: 's1', number: '1', eighths: 4, elements: { cast: ['Ravi'], props: ['Kettle'] } },
  { id: 's2', number: '2', eighths: 8, elements: {} },
  { id: 's3', number: '3', eighths: 2, elements: { cast: ['Meena'] } },
  { id: 's4', number: '4', eighths: 8, elements: { cast: ['Lakshmi'] } }
];

/* ---- slicing and pairing ---- */
eq(A.sliceScript(script).map((s) => s.heading), ['INT. TEA STALL - DAY', 'EXT. HIGHWAY - NIGHT', 'INT. RAVI HOUSE - NIGHT'], 'script cut at headings; preamble dropped');
const paired = A.pairScenes(scenes, script);
eq(paired.map((p) => p.slice && p.slice.heading), ['INT. TEA STALL - DAY', 'EXT. HIGHWAY - NIGHT', 'INT. RAVI HOUSE - NIGHT', null], 'Nth heading pairs with Nth scene row; extra rows get none');

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
