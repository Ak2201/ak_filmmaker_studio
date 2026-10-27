/* ============================================================
   STORY STAGE — the model and the .docx reader, in Node
   ------------------------------------------------------------
   src/lib/story.js decides which beat a passage belongs to, where a
   highlight lives after the synopsis is edited, and what the heatmap
   flags. None of that needs a browser, and all of it is the kind of
   arithmetic a page renders "plausibly" while being wrong — so it is
   asserted here, ~0.2s, no dependencies.

       node scripts/test-story.mjs      (or: npm run test:story)

   The two seams (store.js and JSON imports) are in node-seams.mjs.
   ============================================================ */
import { zip } from './lib/zip-fixture.mjs';
import { mem } from './node-seams.mjs';

const S = await import('../src/lib/story.js');
const { extractDocxText, documentXmlToText } = await import('../src/lib/docx-text.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- frameworks -------------------------------------------- */
const fws = S.frameworks();
// Every format is offered (plan rev. 3 §1a). The first three ids are
// storage keys in tagged marks and scene beatIds, so they stay first.
eq(fws.map((f) => f.id), ['three_act', 'save_the_cat', 'story_circle', 'heros_journey', 'seven_point', 'freytag',
  'fichtean', 'kishotenketsu', 'sequence', 'interval', 'short_five'], 'eleven frameworks, the original three first');
eq(fws.map((f) => f.beats.length), [7, 15, 8, 12, 7, 5, 6, 4, 8, 9, 5], 'beat counts per format');
eq(S.frameworkById('save_the_cat').beats.length, 15, 'Save the Cat! has 15 beats');
eq(S.frameworkById('story_circle').beats.length, 8, 'Story Circle has 8 steps');
eq(S.frameworkById('story_circle').label, 'Story Circle (Dan Harmon)', 'the Story Circle is not called the Hero’s Journey');
eq(S.frameworkById('nope').id, 'three_act', 'unknown framework falls back to the default');
ok(new Set(fws.map((f) => f.id)).size === fws.length, 'framework ids unique');
for (const f of fws) {
  const ids = f.beats.map((b) => b.id);
  ok(new Set(ids).size === ids.length, `${f.id}: beat ids unique`);
  ok(f.beats.every((b) => b.at >= 0 && b.at <= 1 && b.tension >= 1 && b.tension <= 10), `${f.id}: at in 0..1, tension in 1..10`);
  ok(f.beats.every((b, i) => i === 0 || b.at > f.beats[i - 1].at), `${f.id}: at strictly increasing`);
  ok(f.beats.every((b) => b.label && b.prompt && Number.isInteger(b.act)), `${f.id}: every beat has a label, a prompt and an act`);
  ok(f.label && f.short && f.suits, `${f.id}: label, short and suits`);
  const rs = f.pacing && f.pacing.regions;
  ok(Array.isArray(rs) && rs.length >= 2, `${f.id}: pacing regions present`);
  ok(rs && rs[0].from === 0 && rs[rs.length - 1].to === 1 && rs.every((r, i) => i === 0 || r.from === rs[i - 1].to),
    `${f.id}: pacing regions tile 0..1`);
  ok(rs && rs.every((r) => /\d/.test(r.label)), `${f.id}: every region label carries its act number`);
  const regionActs = new Set(rs.map((r) => Number(/(\d+)/.exec(r.label)[1])));
  ok(f.beats.every((b) => regionActs.has(b.act)), `${f.id}: every beat's act has a region`);
  eq(S.regionsOf(f.id), rs, `${f.id}: regionsOf reads the framework's own split`);
}
// short_five is the short blueprint's step 04, named identically.
{
  const { readFileSync } = await import('node:fs');
  const short = JSON.parse(readFileSync(new URL('../src/data/steps.short.json', import.meta.url), 'utf8'));
  const s4 = JSON.stringify(short.steps.find((x) => x.id === 'step-04'));
  const named = [...s4.matchAll(/<h4>([^<]+)<\\?\/h4>/g)].map((m) => m[1]);
  eq(S.frameworkById('short_five').beats.map((b) => b.label), named, 'short_five matches the short blueprint step 04, beat for beat');
}

/* ---- marks, tags and the framework switch ------------------ */
const para = (s, n) => Array(n).fill(s).join(' ');
const calm = para('Meena walks to the market and buys vegetables for the family.', 6);
const mid = 'At the temple Meena discovers the letter that proves her brother was framed.';
const end = 'In the final fight the brother escapes the police trap and kills the man who betrayed him.';
const source = [calm, mid, calm, end, calm].join('\n\n');
const story = { ...S.blankStory(), source };

const midAt = source.indexOf(mid);
const m1 = S.addMark(story, { start: midAt, end: midAt + mid.length, fw: 'save_the_cat', beat: 'midpoint' });
ok(m1 && m1.text === mid, 'addMark stores the passage text');
eq(S.beatOf(m1, 'save_the_cat', source.length), { beat: S.beatById('save_the_cat', 'midpoint'), inferred: false }, 'hand tag wins in its framework');
const inf = S.beatOf(m1, 'story_circle', source.length);
ok(inf.inferred && inf.beat, 'untagged framework infers a beat by position');
const pos = S.positionOf(m1, source.length);
eq(inf.beat.id, S.nearestBeat('story_circle', pos).id, 'inferred beat is the nearest by position');

// Switching and switching back is a view change: nothing is written.
const before = JSON.stringify(story);
S.matrix(story, 'story_circle'); S.matrix(story, 'three_act'); S.matrix(story, 'save_the_cat');
eq(JSON.stringify(story), before, 'rendering other frameworks writes nothing to the story');
const mx = S.matrix(story, 'save_the_cat');
eq(mx.find((r) => r.beat.id === 'midpoint').marks.map((m) => m.id), [m1.id], 'matrix puts the mark on its tagged beat');
eq(mx.reduce((n, r) => n + r.marks.length, 0), 1, 'each mark appears on exactly one beat');

/* ---- anchoring after an edit -------------------------------- */
const edited = { ...story, source: 'A NEW FIRST LINE THAT SHIFTS EVERYTHING.\n' + source };
const [a1] = S.anchor(edited);
ok(!a1.detached && edited.source.slice(a1.start, a1.end) === mid, 'anchor re-finds a passage after text is inserted above it');
eq(story.marks[0].start, midAt, 'anchor does not mutate the stored mark');
const cut = { ...story, source: source.replace(mid, '') };
ok(S.anchor(cut)[0].detached, 'a passage removed from the synopsis is detached, not re-pointed');
ok(S.pacingFlags(cut, 'save_the_cat').some((f) => f.kind === 'detached'), 'a detached passage is flagged');

/* ---- tension, heatmap, flags --------------------------------- */
ok(S.lexicalTension(end) > S.lexicalTension(calm), 'conflict vocabulary reads hotter than errands');
eq(S.lexicalTension(''), null, 'no words, no estimate');
eq(S.expectedAt('three_act', 0.5), S.beatById('three_act', 'midpoint').tension, 'expected curve passes through each beat');
S.setTension(story, 'save_the_cat', 'midpoint', 42);
eq(S.tensionOf(story, 'save_the_cat', S.beatById('save_the_cat', 'midpoint')), 10, 'tension is clamped to 10');
S.setTension(story, 'save_the_cat', 'midpoint', '');
eq(S.tensionOf(story, 'save_the_cat', S.beatById('save_the_cat', 'midpoint')), 7, 'clearing a tension restores the convention');

const heat = S.heatmap(story, 'save_the_cat');
eq(heat.length, S.PACING.windows, 'heatmap has one slice per window');
ok(heat.some((w) => !w.estimated) && heat.some((w) => w.estimated), 'covered slices use the beat; the rest are estimated');

const slack = { ...S.blankStory(), source: para('He sits. He thinks about the rain and the old house by the river for a while.', 60) };
const sf = S.pacingFlags(slack, 'three_act');
ok(sf.some((f) => f.kind === 'slack' && /Act/.test(f.text)), 'a long flat synopsis is flagged as slack, with its act named');

// Too short to slice: an eight-word synopsis gets no slack note (M27).
const tiny = { ...S.blankStory(), source: 'He sits. He waits. Nothing at all happens.' };
ok(S.tooShortForPacing(tiny), 'an eight-word synopsis is too short for pacing');
ok(!S.pacingFlags(tiny, 'three_act').some((f) => f.kind === 'slack'), 'an eight-word synopsis is not flagged as slack');
ok(!S.tooShortForPacing(slack), 'a long synopsis is long enough for pacing');

// A hand tag far from its convention is a placement note.
const early = { ...S.blankStory(), source };
const at0 = source.indexOf('Meena walks');
S.addMark(early, { start: at0, end: at0 + 20, fw: 'three_act', beat: 'climax' });
ok(S.pacingFlags(early, 'three_act').some((f) => f.kind === 'placement' && /Climax/.test(f.text)), 'climax in the first pages is flagged');

/* ---- AI beat map: quotes, never offsets --------------------- */
const ai = { ...S.blankStory(), source };
const r = S.applyBeatMap(ai, 'three_act', [
  { beat: 'midpoint', quote: mid, rationale: 'the reveal', tension: 8 },
  { beat: 'climax', quote: 'the brother escapes the police trap', tension: 10 },
  { beat: 'climax', quote: 'a sentence that is nowhere in the synopsis' },
  { beat: 'not_a_beat', quote: mid },
  { beat: 'setup', quote: '' }
]);
eq(r, { added: 2, dropped: 3 }, 'invented quotes, unknown beats and blanks are dropped and counted');
eq(ai.marks.map((m) => m.tags.three_act).sort(), ['climax', 'midpoint'], 'verbatim quotes become tagged marks');
eq(S.tensionOf(ai, 'three_act', S.beatById('three_act', 'midpoint')), 8, 'a model tension is applied');
const r2 = S.applyBeatMap(ai, 'three_act', [{ beat: 'setup', quote: mid }]);
eq(r2.added, 0, 'a model never overwrites a passage already tagged in this framework');

/* ---- persistence and the vault ------------------------------ */
ok(S.saveStory(story), 'saveStory writes');
const back = S.loadStory();
eq(back.marks.length, 1, 'loadStory reads the marks back');
mem.set(S.STORY_KEY, JSON.stringify({ source: 'old row' }));
const legacy = S.loadStory();
ok(Array.isArray(legacy.marks) && legacy.framework === 'three_act', 'a row missing fields reads back with defaults');
mem.set(S.STORY_KEY, '{not json');
eq(S.loadStory().source, '', 'a corrupt row reads as a blank story rather than throwing');

const v1 = S.addToVault({ snippet: '  A headline worth a film  ', url: 'https://example.com/a', id: 'clip1' });
ok(v1 && v1.snippet === 'A headline worth a film', 'vault trims and stores a clip');
eq(S.addToVault({ snippet: 'again', id: 'clip1' }), null, 'a clip delivered twice is stored once');
eq(S.addToVault({ snippet: '   ' }), null, 'an empty clip is refused');
ok(S.updateVault('clip1', { beat: 'three_act:midpoint' }) && S.listVault()[0].beat === 'three_act:midpoint', 'a clip can be pinned to a beat');
ok(S.removeFromVault('clip1') && S.listVault().length === 0, 'a clip can be removed');

/* ---- the step outline (plan rev. 3 §1) --------------------- */
// An old blob — written before the outline existed — loads blank.
mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: 'An old synopsis.', marks: [], framework: 'save_the_cat' }));
const old = S.loadStory();
eq([old.outline, old.idea], [[], ''], 'an old blob with no outline or idea loads them blank');
eq(old.source, 'An old synopsis.', 'and keeps what it had');
mem.set(S.STORY_KEY, JSON.stringify({ outline: [{ id: 'a', beat: 'save_the_cat:midpoint', text: 'x' }, { nope: 1 }, null] }));
eq(S.loadStory().outline.map((x) => x.id), ['a'], 'malformed outline rows are dropped on read');

const os = { ...S.blankStory(), framework: 'save_the_cat' };
const K = (b) => 'save_the_cat:' + b;
const st1 = S.addOutlineStep(os, { beat: K('opening_image'), text: 'Meena wakes before the market opens.' });
const st2 = S.addOutlineStep(os, { beat: K('midpoint'), text: 'At the temple she finds the letter.' });
const st3 = S.addOutlineStep(os, { beat: K('opening_image'), text: 'Her brother is already gone.' });
S.addOutlineStep(os, { beat: K('finale'), text: 'She walks into the police station with it!' });
eq(S.addOutlineStep(os, { beat: 'midpoint' }), null, 'a bare beat id is refused');
let ob = S.outlineByBeat(os, 'save_the_cat');
eq(ob.beats[0].steps.map((x) => [x.id, x.n]), [[st1.id, 1], [st3.id, 2]], 'steps group under their beat, numbered in order');
eq(ob.beats.find((r) => r.beat.id === 'midpoint').steps[0].n, 3, 'numbering runs 1..N across the outline');
eq([ob.covered, ob.beatsTotal, ob.withText, ob.unplaced.length], [3, 15, 4, 0], 'coverage: 3 of 15 beats have a step');
ok(S.moveOutlineStep(os, st3.id, { delta: -1 }), 'move up within a beat');
eq(S.outlineByBeat(os).beats[0].steps.map((x) => x.id), [st3.id, st1.id], 'reordered');
ok(!S.moveOutlineStep(os, st3.id, { delta: -1 }), 'the first step cannot move further up');
ok(S.moveOutlineStep(os, st1.id, { beat: K('midpoint'), at: 0 }), 'move to another beat, at a position');
eq(S.outlineByBeat(os).beats.find((r) => r.beat.id === 'midpoint').steps.map((x) => x.id), [st1.id, st2.id], 'landed first under the new beat');
ok(S.moveOutlineStep(os, st1.id, { beat: K('opening_image') }), 'and back');
eq(S.updateOutlineStep(os, st3.id, { text: 'Her brother is already gone, and so is the money.' }).text, 'Her brother is already gone, and so is the money.', 'edit a step');
const tmp = S.addOutlineStep(os, { beat: K('debate'), text: 'temp' });
ok(S.removeOutlineStep(os, tmp.id) && !os.outline.some((x) => x.id === tmp.id), 'remove a step');

// Switching format is a view change: nothing is lost, nothing written.
const beforeSwitch = JSON.stringify(os);
const hj = S.outlineByBeat(os, 'heros_journey');
eq(hj.unplaced.length, 4, 'in another format every step is listed as not placed');
eq(hj.total, 4, 'and still numbered');
ok(hj.unplaced.every((u) => u.from && u.suggest), 'each knows where it was written and its nearest beat here');
eq(hj.unplaced.find((u) => u.id === st2.id).suggest.id, 'ordeal', 'Save the Cat midpoint is nearest the Ordeal');
S.outlineByBeat(os, 'interval'); S.stepsInOrder(os, 'interval');
eq(JSON.stringify(os), beforeSwitch, 'viewing other formats writes nothing');
eq(S.outlineByBeat(os, 'save_the_cat').unplaced.length, 0, 'switching back finds every step where it was');
const cp = JSON.parse(beforeSwitch);
eq(S.fileUnplaced(cp, 'interval'), 4, 'file-all re-files every step by position, on request');
eq(S.outlineByBeat(cp, 'interval').unplaced.length, 0, 'after filing, none unplaced');

// Build the synopsis: one paragraph per act, marks verbatim at offsets.
os.source = 'A synopsis written by hand.';
os.marks = [];
S.addMark(os, { start: 0, end: 11, fw: 'save_the_cat', beat: 'setup' });
const snapBefore = JSON.stringify({ source: os.source, sourceName: os.sourceName, marks: os.marks });
const snap = S.buildSynopsisFromOutline(os, 'save_the_cat');
eq(JSON.stringify(snap), snapBefore, 'the build returns an exact snapshot of what it replaced');
const paras = os.source.split('\n\n');
eq(paras.length, 3, 'one paragraph per act (acts 1, 2 and 3 have steps)');
eq(paras[0], 'Her brother is already gone, and so is the money. Meena wakes before the market opens.', 'act one in outline order');
const om = os.marks.filter((m) => m.origin === 'outline');
eq(om.length, 4, 'one outline mark per written step');
ok(om.every((m) => os.source.slice(m.start, m.end) === m.text), 'every outline mark is verbatim at its offsets');
ok(om.every((m) => os.outline.find((x) => x.id === m.step).text.trim() === m.text), 'each mark is its step’s exact text');
eq(om.find((m) => m.step === st2.id).tags, { save_the_cat: 'midpoint' }, 'each mark is tagged with its step’s beat');
eq(os.marks.filter((m) => m.origin !== 'outline').length, 1, 'a hand-made mark is kept through a build');
const mxb = S.matrix(os, 'save_the_cat').filter((r) => r.marks.some((m) => !m.inferred && m.origin === 'outline')).map((r) => r.beat.id);
eq(mxb, ['opening_image', 'midpoint', 'finale'], 'the matrix lights the three beats the outline used');
// Rebuild replaces the outline marks rather than doubling them.
S.buildSynopsisFromOutline(os, 'save_the_cat');
eq(os.marks.filter((m) => m.origin === 'outline').length, 4, 'a rebuild does not double the outline marks');
ok(S.restoreSynopsis(os, snap), 'restore');
eq(JSON.stringify({ source: os.source, sourceName: os.sourceName, marks: os.marks }), snapBefore, 'Undo restores source and marks exactly');
// Building in another framework keeps each step's own tag.
const other = JSON.parse(beforeSwitch);
S.buildSynopsisFromOutline(other, 'interval');
ok(other.marks.every((m) => other.source.slice(m.start, m.end) === m.text && m.tags.save_the_cat), 'a build in another format still tags each step under its own beat');

// The hand-off: add-only, and Undo removes only what it added.
function fakeScenes(rows) {
  let list = rows.map((r) => ({ ...r }));
  let n = 0;
  return {
    listScenes: () => list.map((r) => ({ ...r })),
    saveScenes: (all) => { list = all.map((r) => ({ ...r })); return true; },
    addScene: (patch) => { const sc = { id: 'new' + (++n), number: String(list.length + 1), ...patch }; list.push(sc); return { ...sc }; },
    removeScene: (id) => { list = list.filter((r) => r.id !== id); return list; },
    _raw: () => list
  };
}
const handMade = [
  { id: 'h1', number: '1', synopsis: 'Hand scene one', beatId: 'save_the_cat:opening_image' },
  { id: 'h2', number: '2', synopsis: 'Hand scene two', beatId: '' },
  { id: 'h3', number: '3', synopsis: 'Hand scene three', beatId: 'save_the_cat:final_image' }
];
const api = fakeScenes(handMade);
const sendStory = JSON.parse(beforeSwitch);
S.addOutlineStep(sendStory, { beat: K('debate'), text: '   ' });   // empty: never sent
const ids = S.sendOutlineToScenes(sendStory, api, { fwId: 'save_the_cat' });
eq(ids.length, 4, 'one scene per written step');
const after = api._raw();
eq(after.filter((r) => r.id.startsWith('h')), handMade, 'existing scenes are untouched, field for field, and keep their order');
ok(ids.every((id) => after.find((r) => r.id === id).beatId.startsWith('save_the_cat:')), 'each new scene carries its step’s beat');
ok(after.map((r) => r.id).indexOf(ids[0]) > after.map((r) => r.id).indexOf('h1'), 'opening-image scenes land after the hand-made opening-image scene');
ok(after.map((r) => r.id).indexOf('h3') === after.length - 1, 'a final-image scene stays last');
ok(sendStory.outline.filter((x) => x.text.trim()).every((x) => ids.includes(x.sceneId)), 'each step records its scene');
eq(S.sendOutlineToScenes(sendStory, api).length, 0, 'sending twice adds nothing');
eq(S.undoSendOutline(sendStory, ids, api), 4, 'Undo removes the four');
eq(api._raw(), handMade, 'and leaves exactly the hand-made scenes');
ok(sendStory.outline.every((x) => !x.sceneId), 'and unlinks the steps');
// A step whose scene was deleted elsewhere is sent again.
const again = S.sendOutlineToScenes(sendStory, api);
api.removeScene(again[0]);
eq(S.sendOutlineToScenes(sendStory, api).length, 1, 'a step whose scene is gone is sent again');

// The path, derived — one per format, never mixed. FOUR steps for both
// formats since 19 Oct 2026 (owner): Idea · Characters & world · Beat Sheet · Synopsis.
const FOUR = ['idea', 'bible', 'outline', 'synopsis'];
const FEATURE_PATH = FOUR, SHORT_PATH = FOUR;
const pp = S.pathProgress({ ...S.blankStory(), logline: 'x' }, { scenes: [] });
eq(pp.map((p) => p.id), FEATURE_PATH, 'the feature path: Idea, Characters & world, Beat Sheet, Synopsis');
eq(pp.map((p) => p.label), ['Idea', 'Characters & world', 'Beat Sheet', 'Synopsis'], 'the feature path labels');
eq(pp.map((p) => p.pos), [1, 2, 3, 4], 'four places in the feature line');
eq(pp.map((p) => p.n), [1, 7, 4, 5], 'each keeps its stable number (1 idea, 7 bible, 4 outline, 5 synopsis)');
eq(pp.map((p) => p.done), [true, false, false, false], 'the path reads what is filled (a logline alone fills the Idea step)');
eq(pp[0].detail, 'logline', 'and says what is in it');
const sp = S.pathProgress({ ...S.blankStory(), logline: 'x' }, { scenes: [], format: 'short' });
eq(sp.map((p) => p.id), SHORT_PATH, 'the short path: the same four steps');
eq(sp.map((p) => p.label), ['Idea', 'Characters & world', 'Beat Sheet', 'Synopsis'], 'the short path labels');
eq(S.pathFor('short').find((p) => p.id === 'bible').cards, ['characters', 'world', 'conflict'], 'a short film’s Characters & world shows its three cards');
eq(S.pathFor('feature').find((p) => p.id === 'bible').cards, ['characters', 'conflict', 'stakes', 'theme', 'world'], 'a feature’s shows all five');
eq(S.pathFor('short').find((p) => p.id === 'outline').absorbs, ['short:step-04'], 'a short film’s Beat Sheet asks the short blueprint’s beats');
eq(S.pathFor('feature').find((p) => p.id === 'outline').absorbs, ['feature:step-08', 'feature:step-09', 'feature:step-10', 'feature:treatment-ladder#lad_5_outline'],
  'a feature’s Beat Sheet asks step 08, Timeline (09), Setups & payoffs (10) and the free-text outline, in closed boxes');
eq(S.pathFor('feature').find((p) => p.id === 'idea').absorbs, ['feature:step-01', 'feature:step-02', 'feature:treatment-ladder#lad_1_logline'], 'the Idea step asks step 01, step 02 and ladder rung 1');
eq(S.pathFor('short').map((p) => p.id), SHORT_PATH, 'pathFor(short)');
eq(S.pathFor('feature').map((p) => p.id), FEATURE_PATH, 'pathFor(feature)');
eq(S.pathFor(undefined).map((p) => p.id), FEATURE_PATH, 'anything that is not short is the feature path');
eq(S.PATH.map((p) => p.id), FEATURE_PATH, 'PATH (the export every old caller reads) is the feature path');
eq(S.defaultPathStep(S.blankStory()), 'idea', 'a new story opens on the idea');
eq(S.defaultPathStep({ ...S.blankStory(), idea: 'i', logline: 'l' }), 'bible', 'idea and logline filled: Characters & world is the first empty step');
eq(S.defaultPathStep({ ...S.blankStory(), idea: 'i', logline: 'l' }, { format: 'short' }), 'bible', 'the same on a short film');
eq(S.defaultPathStep({ ...S.blankStory(), source: 'x' }), 'synopsis', 'a story with a synopsis opens on the synopsis');

/* The Beat Sheet's state: done once a step is written; a beat sheet chosen
   with nothing under it is "doing"; the lock and the send are its detail. */
{
  const chosen = S.pathProgress({ ...S.blankStory(), framework: 'three_act', frameworkChosen: true }, { scenes: [] }).find((p) => p.id === 'outline');
  eq([chosen.done, chosen.doing, chosen.detail], [false, true, S.frameworkById('three_act').short], 'a beat sheet chosen, no step yet: started, not done');
  const st = { ...S.blankStory(), framework: 'three_act', frameworkChosen: true, outline: [{ id: 'a', beat: 'three_act:setup', text: 'A dragon hatches.', sceneId: 'sc1' }] };
  const one = S.pathProgress(st, { scenes: [{ id: 'sc1' }] }).find((p) => p.id === 'outline');
  eq([one.done, one.doing], [true, false], 'a written step: done');
  ok(/^1 step · 1 of 7 beats · 1 sent$/.test(one.detail), 'its detail counts the steps, the beats and what was sent — got ' + one.detail);
  const locked = S.pathProgress({ ...st, outlineLockedAt: '2026-10-11T10:00:00.000Z' }, { scenes: [] }).find((p) => p.id === 'outline');
  ok(/ · locked$/.test(locked.detail), 'a locked outline says so — got ' + locked.detail);
  const syn = S.pathProgress({ ...S.blankStory(), source: 'one two three', marks: [{ id: 'm', start: 0, end: 3, fw: 'three_act', beat: 'setup' }] }, { scenes: [] }).find((p) => p.id === 'synopsis');
  eq([syn.done, syn.detail], [true, '3 words · 1 tagged'], 'the synopsis counts its words and its tagged passages');
}

/* No step is mandatory; Next suggests the first EMPTY step after this one. */
{
  const base = S.pathProgress({ ...S.blankStory(), idea: 'i', logline: 'l', source: 's' }, { scenes: [] });
  eq(S.suggestNext(base, 'idea').id, 'bible', 'Next from the Idea offers the empty Characters & world');
  eq(S.suggestNext(base, 'bible').id, 'outline', 'Next from Characters & world offers the Beat Sheet');
  const skip = base.map((p) => (p.id === 'outline' ? { ...p, done: true } : p));
  eq(S.suggestNext(skip, 'idea').id, 'bible', 'the first empty step after the current one');
  const all = base.map((p) => ({ ...p, done: true }));
  eq(S.suggestNext(all, 'idea').id, 'bible', 'every later step filled: simply the step after');
  eq(S.suggestNext(base, 'synopsis'), null, 'nothing after the last step (the Screenplay Writer is the next stage, not a step)');
}

/* EVERY OLD LINK LANDS ON ITS NEW HOME, never on step 1 by default:
   each retired number (#path-2 … #path-13) and each retired id, in both
   formats (story-paths.json `aliases`). */
{
  const HOME = {
    1: 'idea', 2: 'idea', 3: 'outline', 4: 'outline', 5: 'synopsis', 6: 'outline', 7: 'bible',
    8: 'outline', 9: 'outline', 10: 'outline', 11: 'bible', 12: 'bible', 13: 'bible',
    idea: 'idea', logline: 'idea', seed: 'idea', bible: 'bible', character: 'bible', world: 'bible', conflict: 'bible',
    structure: 'outline', outline: 'outline', setups: 'outline', timeline: 'outline', lock: 'outline', screenplay: 'outline',
    synopsis: 'synopsis', pacing: 'synopsis'
  };
  for (const fmt of ['feature', 'short']) {
    const got = Object.fromEntries(Object.keys(HOME).map((k) => [k, S.pathStepFromHash('#path-' + k, fmt)]));
    eq(got, HOME, `${fmt}: every old #path-N and #path-<id> lands on the step that holds it now`);
    const retired = Object.keys(HOME).filter((k) => !S.pathFor(fmt).some((p) => p.id === k || String(p.n) === k));
    eq(retired.filter((k) => S.pathAlias(k, fmt) !== HOME[k]), [], `${fmt}: pathAlias names the same home for every retired id and number (${retired.length})`);
    eq(S.pathFor(fmt).map((p) => S.pathAlias(p.id, fmt)), ['', '', '', ''], `${fmt}: a live step is not an alias`);
  }
  /* the aliases name only steps that exist, in both formats */
  const PATHS = JSON.parse((await import('node:fs')).readFileSync(new URL('../src/data/story-paths.json', import.meta.url), 'utf8'));
  for (const fmt of ['feature', 'short']) {
    const ids = PATHS[fmt].map((p) => p.id);
    eq(Object.entries(PATHS.aliases[fmt]).filter(([, to]) => !ids.includes(to)).map(([k]) => k), [], `${fmt}: every alias names a live step`);
    eq(Object.keys(PATHS.aliases[fmt]).filter((k) => ids.includes(k) || PATHS[fmt].some((p) => String(p.n) === k)), [], `${fmt}: no alias shadows a live step or number`);
  }
  eq(S.pathAlias('nope'), '', 'something no path ever had is not an alias');
  eq([S.pathStepFromHash('path-99'), S.pathStepFromHash('path-nope')], ['idea', 'idea'], 'only an unknown path step lands on the first step');
  eq(S.pathStepFromHash('vault'), '', 'a hash that is not a path hash names no step');
  eq(S.pathStepFromHash('pitch'), '', 'a section hash names no step');
  eq(S.PATH.find((p) => p.id === 'outline').n, 4, 'the stable number of the outline is still 4 (the blueprint drawer keys on it)');
  eq(new Set(S.PATH.map((p) => p.n)).size, S.PATH.length, 'no two path steps share a number');
  eq(S.pathStepForBlueprint('feature', 'step-09'), 'outline', 'an old ?step=feature/step-09 link (Timeline) lands on the Beat Sheet');
  eq(S.pathStepForBlueprint('feature', 'step-02'), 'idea', 'and step 02 (the logline) on the Idea');
}

/* The scene order is chosen in the Beat Sheet's picker — never first. */
eq(S.blankStory().frameworkChosen, false, 'a blank story has chosen no scene order');
eq(S.suggestedFramework('feature'), 'save_the_cat', 'a feature is laid out against Save the Cat until one is chosen');
eq(S.suggestedFramework('short'), 'short_five', 'a short film against the Short Five');
eq(S.effectiveFramework(S.blankStory(), 'short'), 'short_five', 'an unchosen story reads as the format’s suggestion');
eq(S.effectiveFramework({ ...S.blankStory(), framework: 'story_circle', frameworkChosen: true }, 'feature'), 'story_circle', 'a chosen one wins on a feature');
eq(S.effectiveFramework({ ...S.blankStory(), framework: 'save_the_cat', frameworkChosen: true }, 'short'), 'short_five', 'a short film is always the five beats (owner, 23 Oct 2026), whatever it chose before');
{
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: '', marks: [], tension: {}, framework: 'three_act' }));
  eq(S.loadStory().frameworkChosen, false, 'a story saved with the default and nothing laid out against it has chosen none');
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: '', marks: [], tension: {}, framework: 'story_circle' }));
  eq(S.loadStory().frameworkChosen, true, 'a story saved with another format chose it (the old toolbar select)');
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: '', marks: [], tension: {}, framework: 'three_act', outline: [{ id: 'a', beat: 'three_act:setup', text: 'x' }] }));
  eq(S.loadStory().frameworkChosen, true, 'a story with steps written under a format has chosen it');
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: '', marks: [], tension: {}, framework: 'three_act', frameworkChosen: false, outline: [{ id: 'a', beat: 'three_act:setup', text: 'x' }] }));
  eq(S.loadStory().frameworkChosen, false, 'an explicit false is believed');
  mem.delete(S.STORY_KEY);
}

/* Lock the outline: a stored ISO time, blank by default, cleared by Unlock. */
eq(S.blankStory().outlineLockedAt, '', 'a blank story’s outline is not locked');
{
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: 'x', marks: [], tension: {}, framework: 'three_act' }));
  eq(S.loadStory().outlineLockedAt, '', 'a story saved before the lock existed reads back ""');
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: 'x', marks: [], tension: {}, framework: 'three_act', outlineLockedAt: 42 }));
  eq(S.loadStory().outlineLockedAt, '', 'a non-string lock reads back ""');
  mem.delete(S.STORY_KEY);
  const lk = S.blankStory();
  const at = S.setOutlineLock(lk, true, new Date('2026-10-11T10:00:00Z'));
  eq(at, '2026-10-11T10:00:00.000Z', 'Lock stores the time as ISO');
  S.saveStory(lk);
  eq(S.loadStory().outlineLockedAt, '2026-10-11T10:00:00.000Z', 'and it survives a reload');
  eq(S.pathProgress(S.loadStory(), { scenes: [] }).find((p) => p.id === 'outline').detail, 'locked', 'a locked outline is the Beat Sheet’s detail (the lock is a toggle on it, not a step)');
  eq(S.pathProgress(S.loadStory(), { scenes: [], format: 'short' }).find((p) => p.id === 'outline').detail, 'locked', 'on a short film too');
  eq(S.setOutlineLock(lk, false), '', 'Unlock clears it');
  S.saveStory(lk);
  eq(S.pathProgress(S.loadStory(), { scenes: [] }).find((p) => p.id === 'outline').detail, '', 'and the detail goes');
  mem.delete(S.STORY_KEY);
}

/* The Story Bible's two story-level fields. */
eq([S.blankStory().conflicts, S.blankStory().conflictLine], [[], ''], 'a blank story has no conflicts');
{
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: 'x', marks: [], tension: {}, framework: 'three_act' }));
  const old = S.loadStory();
  eq([old.conflicts, old.conflictLine], [[], ''], 'a story saved before the Bible reads back conflicts [] and conflictLine ""');
  mem.set(S.STORY_KEY, JSON.stringify({ v: 1, source: '', conflicts: ['self', 'time', 'self', 7], conflictLine: 'A cop v his past' }));
  const withC = S.loadStory();
  eq([withC.conflicts, withC.conflictLine], [['self', 'time'], 'A cop v his past'], 'conflicts round-trip, de-duplicated and strings only');
  mem.delete(S.STORY_KEY);
}
const w = S.whereAt('save_the_cat', 0.38);
eq([w.nearest.id, w.next.id], ['fun_and_games', 'midpoint'], 'where you are: 38% is Fun and Games, Midpoint next');

// Exports.
const md = S.outlineMarkdown(os, 'save_the_cat', { title: 'Meena' });
ok(md.startsWith('# Meena — Beat sheet and step outline') && md.includes('### Midpoint') && md.includes('3. At the temple she finds the letter.'),
  'the outline .md names the format, the beats and the numbered steps');
ok(S.outlineMarkdown(JSON.parse(beforeSwitch), 'interval').includes('## Not placed in this format'), 'the .md lists steps not placed in the format');
eq(S.synopsisText({ source: '  hello  ' }), 'hello\n', 'synopsis .txt');

// The sample story: verbatim marks, every step on a Save the Cat beat.
{
  const { readFileSync } = await import('node:fs');
  const file = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.story.json', import.meta.url), 'utf8'));
  const ds = file.story;
  ok(/reconstruction/i.test(file._about), 'the sample story says it is a reconstruction');
  ok(ds.outline.length >= 36 && ds.idea && ds.logline, 'the sample has an idea, a logline and a full outline');
  ok(ds.marks.every((m) => ds.source.slice(m.start, m.end) === m.text), 'the sample synopsis marks are verbatim at their offsets');
  eq(S.outlineByBeat(ds, 'save_the_cat').covered, 15, 'the sample outline covers all fifteen beats');
  const rebuilt = JSON.parse(JSON.stringify(ds));
  S.buildSynopsisFromOutline(rebuilt, 'save_the_cat');
  eq(rebuilt.source, ds.source, 'the sample synopsis is exactly what the outline builds');
  eq(new Set(ds.outline.filter((x) => x.sceneId).map((x) => x.sceneId)).size, 36, 'the sample steps name all 36 sample scenes');
}

/* ---- .docx --------------------------------------------------- */
const DOC = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>DRAGON</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Ragavan &amp; his </w:t></w:r><w:r><w:t>&quot;friends&quot;</w:t></w:r><w:r><w:tab/><w:t>cheat.</w:t></w:r></w:p>
<w:p><w:r><w:delText>deleted words</w:delText><w:t>Kept</w:t><w:br/><w:t>after break</w:t></w:r></w:p>
<w:p/><w:p><w:r><w:t>&#x0BA4;&#x0BAE;&#x0BBF;&#x0BB4;&#x0BCD;</w:t></w:r></w:p>
</w:body></w:document>`;
const want = 'DRAGON\nRagavan & his "friends"\tcheat.\nKept\nafter break\n\nதமிழ்';
eq(documentXmlToText(DOC), want, 'WordprocessingML: runs, entities, tabs, breaks, no deleted text, Tamil');
eq(documentXmlToText('<w:body><w:p><w:pPr><w:tabs><w:tab w:val="left" w:pos="720"/></w:tabs></w:pPr><w:r><w:t>Line one</w:t></w:r><w:r><w:br w:type="textWrapping"/><w:t>Line two</w:t></w:r></w:p><w:p><w:r><w:t>A</w:t><w:br w:type="page"/><w:t>B</w:t></w:r></w:p></w:body>'),
  'Line one\nLine two\nA\nB', 'a break with attributes is still a break; a tab stop is not a tab');
for (const method of [8, 0]) {
  const buf = zip([['[Content_Types].xml', '<Types/>', 0], ['word/document.xml', DOC, method]]);
  const res = await extractDocxText(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  eq(res.text, want, `docx round trip, ${method === 8 ? 'deflated' : 'stored'}`);
}
const noBody = zip([['word/other.xml', '<x/>', 8]]);
ok(/No document body/.test((await extractDocxText(noBody.buffer.slice(noBody.byteOffset, noBody.byteOffset + noBody.length))).fatal), 'a zip without document.xml is refused with a sentence');
ok(/not a \.docx/.test((await extractDocxText(new TextEncoder().encode('plain text').buffer)).fatal), 'a non-zip is refused');
const ole = new Uint8Array([0xd0, 0xcf, 0x11, 0xe0, 0, 0, 0, 0]);
ok(/password-protected/.test((await extractDocxText(ole.buffer)).fatal), 'an encrypted/OLE file is refused by name');

/* ---- docStarter: the Write page's starting drafts ---- */
{
  const empty = S.blankStory();
  eq(S.docStarter(empty, 'One-Pager'), '', 'an empty story starts no draft');
  eq(S.docStarter({ ...empty, logline: 'A liar gets caught.' }, 'Notes'), '', 'only the three kinds get a draft');
  const st = { ...empty, logline: 'A college topper fakes his way into a job.', source: 'Ragavan lies.\n\nHe is caught.' };
  const op = S.docStarter(st, 'One-Pager', { title: 'Dragon' });
  ok(/^DRAGON/.test(op) && /LOGLINE\nA college topper/.test(op) && /SYNOPSIS\nRagavan lies\./.test(op), 'one-pager: title, logline, synopsis');
  ok(/COMPARABLE FILMS/.test(op), 'one-pager leaves the headings a writer fills in');
  eq(S.docStarter(st, 'Synopsis'), 'Ragavan lies.\n\nHe is caught.', 'synopsis is the Story synopsis');
  const tr = S.docStarter({ ...st }, 'Treatment', { title: 'Dragon' });
  ok(tr.startsWith('A college topper') && /He is caught/.test(tr), 'treatment: logline, then the synopsis when there is no outline');
  const withOutline = { ...empty, logline: 'L.' };
  S.addOutlineStep(withOutline, { beat: S.qualifyBeat(withOutline.framework, S.frameworkById(withOutline.framework).beats[0].id), text: 'He opens a fake file.' });
  const tr2 = S.docStarter(withOutline, 'Treatment');
  ok(/Beat sheet and step outline/.test(tr2) && /He opens a fake file/.test(tr2), 'treatment uses outlineMarkdown() when there is an outline');
  eq(S.docStarter(withOutline, 'Synopsis'), 'He opens a fake file.', 'synopsis falls back to the outline as prose');
  const long = { ...empty, source: Array.from({ length: 6 }, (_, i) => ('word' + i + ' ').repeat(80).trim()).join('\n\n') };
  const w = (S.docStarter(long, 'One-Pager').match(/\S+/g) || []).length;
  ok(w < 300, 'the one-pager keeps the synopsis to about 250 words — got ' + w);
  const before = JSON.stringify(st);
  S.docStarter(st, 'Treatment'); S.docStarter(st, 'One-Pager');
  eq(JSON.stringify(st), before, 'docStarter reads and never writes');
}

// A clipping's source is a link only when it is http(s) (security follow-up, §51).
eq(S.clipSourceHost('https://example.com/a?b=1'), 'example.com', 'clipSourceHost: an https source shows its host');
eq(S.clipSourceHost('http://news.example.org/x'), 'news.example.org', 'clipSourceHost: an http source shows its host');
eq(S.clipSourceHost('javascript://example.com/%0aalert(1)'), '', 'clipSourceHost: a javascript: URL with a host is not a link');
eq(S.clipSourceHost('data:text/html,<b>x</b>'), '', 'clipSourceHost: a data: URL is not a link');
eq(S.clipSourceHost(''), '', 'clipSourceHost: no URL, no link');

/* ---- a sample over the writer's work; Build's undo (audit bugs 21, 22) ---- */
{
  const IO = (await import('../src/lib/story-io.js')).default;
  // Only the Conflict card and the market fields filled in: the start-card
  // test calls that empty, and a sample used to wipe all of it unasked.
  const cur = S.blankStory();
  cur.conflicts = ['inner']; cur.conflictLine = 'She cannot forgive herself.';
  cur.genre = 'Thriller'; cur.audience = 'Adults'; cur.budgetTier = 'low'; cur.comps = ['Drishyam'];
  const smp = await IO.sampleStory();
  const out = IO.sampleOver(cur, smp);
  eq(IO.KEPT_ON_SAMPLE.map((k) => out[k]), IO.KEPT_ON_SAMPLE.map((k) => cur[k]), 'sampleOver keeps the conflict answers, genre, audience, budget tier and comps');
  eq(out.source, smp.source, 'sampleOver takes the sample\'s synopsis');
  eq(out.outline.length, smp.outline.length, 'sampleOver takes the sample\'s outline');
  const blankOut = IO.sampleOver(S.blankStory(), { ...smp, genre: 'Fantasy' });
  eq(blankOut.genre, 'Fantasy', 'sampleOver: a blank kept field takes the sample\'s value');
  out.comps.push('x'); eq(cur.comps, ['Drishyam'], 'sampleOver copies, never shares, a kept array');
  ok(!IO.sampleReplacesWork(cur), 'kept fields alone ask no question (nothing they hold is replaced)');
  const t = S.blankStory(); t.tension = { b1: 7 };
  ok(IO.sampleReplacesWork(t), 'hand-set tension alone is work a sample replaces — it asks');
  const l = S.blankStory(); l.outlineLockedAt = '2026-10-21T00:00:00Z';
  ok(IO.sampleReplacesWork(l), 'an outline lock is work a sample replaces');
  const i = S.blankStory(); i.idea = 'x';
  ok(IO.sampleReplacesWork(i), 'an idea is work a sample replaces');

  // Build, keep writing, then press the still-live UNDO.
  const st = S.blankStory();
  st.outline = [{ id: 's1', beat: 'setup', text: 'A girl finds a dragon.' }, { id: 's2', beat: 'climax', text: 'They fly.' }];
  st.source = 'My own draft.';
  const snap = S.buildSynopsisFromOutline(st, st.framework);
  const undo = IO.buildUndo(snap, st);
  ok(IO.buildUndoClean(undo, st), 'straight after a build the undo loses nothing');
  const later = JSON.parse(JSON.stringify(st));
  later.source += '\n\nThree new paragraphs the writer typed after the build.';
  ok(!IO.buildUndoClean(undo, later), 'synopsis typed after the build makes the undo ask first');
  const tagged = JSON.parse(JSON.stringify(st));
  tagged.marks.push({ id: 'mx', text: 'They fly.', beat: 'climax', start: 0, end: 9 });
  ok(!IO.buildUndoClean(undo, tagged), 'a highlight made after the build makes the undo ask first');
  const scored = JSON.parse(JSON.stringify(st)); scored.tension = { climax: 9 };
  ok(IO.buildUndoClean(undo, scored), 'a tension score is not in the snapshot, so it does not make the undo ask');
  ok(!IO.buildUndoClean(null, st), 'no undo, nothing clean to undo');
  S.restoreSynopsis(st, undo.snap);
  eq(st.source, 'My own draft.', 'the undo still puts back the pre-build synopsis');
}


/* QA 26 Oct 2026: a dropped file skips the input's accept list, so the
   reader itself must refuse what it cannot read (a PNG was saved as the
   synopsis, 24,000 characters of bytes). */
{
  const IO = (await import('../src/lib/story-io.js')).default;
  const rd = async (name, type, body) => { try { return (await IO.readSynopsisFile(new File([body], name, { type }))).text; } catch (e) { return 'ERR:' + e.message; } };
  eq(await rd('notes.txt', 'text/plain', 'A man.\r\nA dog.'), 'A man.\nA dog.', 'a .txt is read as text');
  eq(await rd('notes.md', '', '# Idea'), '# Idea', 'a .md is read as text');
  ok(/^ERR:poster\.png is not a file the synopsis can read/.test(await rd('poster.png', 'image/png', '\x89PNG\r\n')), 'a .png is refused, not read as text');
  ok(/^ERR:old\.rtf is not/.test(await rd('old.rtf', 'application/rtf', '{\\rtf1 hello}')), 'an .rtf is refused, not imported as raw markup');
  ok(/^ERR:/.test(await rd('script.doc', 'application/msword', 'x')), 'an old .doc is refused');
}

/* QA r3: a Windows-1252 .txt is decoded, not stored as U+FFFD. */
{
  const IO = (await import('../src/lib/story-io.js')).default;
  const cp = Uint8Array.from([0x52,0x61,0x76,0x69,0x92,0x73,0x20,0x97,0x20,0x43,0x61,0x66,0xE9]);
  const r = await IO.readSynopsisFile(new File([cp], 'cp1252.txt', { type: 'text/plain' }));
  eq(r.text, 'Ravi\u2019s \u2014 Caf\u00E9', 'a cp1252 .txt keeps its curly quote, dash and accent');
  const u8 = await IO.readSynopsisFile(new File([new TextEncoder().encode('Café \u2014 ok')], 'u8.txt', { type: 'text/plain' }));
  eq(u8.text, 'Caf\u00E9 \u2014 ok', 'a UTF-8 .txt is untouched');
  const bom = await IO.readSynopsisFile(new File([Uint8Array.from([0xEF,0xBB,0xBF,0x68,0x69])], 'b.txt', { type: 'text/plain' }));
  eq(bom.text, 'hi', 'a UTF-8 BOM is dropped');
  const u16 = await IO.readSynopsisFile(new File([Uint8Array.from([0xFF,0xFE,0x68,0,0x69,0])], 'w.txt', { type: 'text/plain' }));
  eq(u16.text, 'hi', 'a UTF-16 .txt is read');
  const NL = await import('../src/lib/note-label.js');
  eq(NL.noteLabel(' Your   idea ✎'), 'Add a private note on: Your idea', 'a pencil names its field');
  eq(NL.noteLabel(''), NL.NOTE_TITLE, 'no label falls back to the generic sentence');
  eq(S.VAULT_MAX, 4000, 'the clipping limit is one constant');
}

/* Review of bugs 21 and 22: the second sample loader, and a synopsis
   save still on its debounce when the Build undo commits. */
{
  const IO = (await import('../src/lib/story-io.js')).default;
  const q = IO.sampleQuestion('Dragon', 'the Story page');
  ok(/highlights and tension scores/.test(q) && /conflict answers, genre, audience and comps are kept/.test(q),
    'the sample confirmation names what is replaced and what is kept');

  // Both loaders must share the guard, the merge and the wording; the
  // blueprints' story kit used to ask only when isEmptyStory() was
  // false and saved the bare sample over the writer's conflict answers.
  const { readFileSync } = await import('node:fs');
  const src = (f) => readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const fnBody = (text, name) => { const i = text.indexOf('async function ' + name + '('); return i < 0 ? '' : text.slice(i, text.indexOf('\n}\n', i)); };
  for (const f of ['src/ui/story-kit.js', 'src/pages/story.js']) {
    const body = fnBody(src(f), 'useSample');
    ok(/IO\.sampleReplacesWork\(/.test(body), f + ': useSample asks on sampleReplacesWork()');
    ok(/IO\.sampleOver\(/.test(body), f + ': useSample keeps the writer\'s fields through sampleOver()');
    ok(/IO\.sampleQuestion\(/.test(body), f + ': useSample asks the shared confirmation');
    ok(!/isEmptyStory\(/.test(body), f + ': useSample no longer guards on isEmptyStory() alone');
  }
  const undoBody = fnBody(src('src/pages/story.js'), 'undoTheBuild');
  ok(undoBody.indexOf('flushAutosave()') > -1 && undoBody.indexOf('flushAutosave()') < undoBody.indexOf('restoreSynopsis'),
    'undoTheBuild flushes pending typing before it restores');

  // The race itself, on the real autosave module with a minimal DOM.
  const listeners = {};
  const on = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  globalThis.document = { addEventListener: on, contains: () => true, visibilityState: 'visible' };
  globalThis.addEventListener = globalThis.addEventListener || on;
  const AS = await import('../src/lib/autosave.js');
  let stored = 'built synopsis';
  const ta = { tagName: 'TEXTAREA', value: '', closest: () => ta };
  AS.saveOnInput('textarea', (el) => { stored = el.value; }, 30);
  const type = (v) => { ta.value = v; for (const fn of listeners.input || []) fn({ target: ta }); };
  const tick = (ms) => new Promise((r) => setTimeout(r, ms));

  type('typed after the build');          // no flush: the old order
  stored = 'pre-build synopsis';          // the undo commits
  await tick(60);
  eq(stored, 'typed after the build', 'repro: a pending save fires after the undo and writes over it');

  type('typed after the build, again');   // flush first: the fixed order
  AS.flushAutosave();
  eq(stored, 'typed after the build, again', 'the flush puts the pending text in storage, where the undo compares it');
  stored = 'pre-build synopsis';
  await tick(60);
  eq(stored, 'pre-build synopsis', 'after a flush no pending save can land on the restored synopsis');
}

console.log(`${fail ? '✗' : '✓'} story model + docx: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
