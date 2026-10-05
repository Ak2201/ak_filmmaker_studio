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
eq(fws.map((f) => f.id), ['three_act', 'save_the_cat', 'story_circle'], 'three frameworks, default order');
eq(S.frameworkById('save_the_cat').beats.length, 15, 'Save the Cat! has 15 beats');
eq(S.frameworkById('story_circle').beats.length, 8, 'Story Circle has 8 steps');
eq(S.frameworkById('nope').id, 'three_act', 'unknown framework falls back to the default');
for (const f of fws) {
  const ids = f.beats.map((b) => b.id);
  ok(new Set(ids).size === ids.length, `${f.id}: beat ids unique`);
  ok(f.beats.every((b) => b.at >= 0 && b.at <= 1 && b.tension >= 1 && b.tension <= 10), `${f.id}: at in 0..1, tension in 1..10`);
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
