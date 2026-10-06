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
import { deflateRawSync } from 'node:zlib';
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

// The path, derived.
const pp = S.pathProgress({ ...S.blankStory(), logline: 'x' }, { scenes: [] });
eq(pp.map((p) => p.done), [false, true, false, false, false, false], 'the path reads what is filled');
eq(S.defaultPathStep(S.blankStory()), 1, 'a new story opens on step 1');
eq(S.defaultPathStep({ ...S.blankStory(), source: 'x' }), 5, 'a story with a synopsis opens on the synopsis');
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
function zip(files) {
  const enc = new TextEncoder();
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, text, method] of files) {
    const raw = enc.encode(text);
    const data = method === 8 ? deflateRawSync(raw) : raw;
    const n = enc.encode(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(method, 8);
    lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(n.length, 26);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(method, 10);
    ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    locals.push(lh, n, data); centrals.push(ch, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8); eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
const DOC = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>DRAGON</w:t></w:r></w:p>
<w:p><w:r><w:t xml:space="preserve">Ragavan &amp; his </w:t></w:r><w:r><w:t>&quot;friends&quot;</w:t></w:r><w:r><w:tab/><w:t>cheat.</w:t></w:r></w:p>
<w:p><w:r><w:delText>deleted words</w:delText><w:t>Kept</w:t><w:br/><w:t>after break</w:t></w:r></w:p>
<w:p/><w:p><w:r><w:t>&#x0BA4;&#x0BAE;&#x0BBF;&#x0BB4;&#x0BCD;</w:t></w:r></w:p>
</w:body></w:document>`;
const want = 'DRAGON\nRagavan & his "friends"\tcheat.\nKept\nafter break\n\nதமிழ்';
eq(documentXmlToText(DOC), want, 'WordprocessingML: runs, entities, tabs, breaks, no deleted text, Tamil');
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

console.log(`${fail ? '✗' : '✓'} story model + docx: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
