#!/usr/bin/env node
/* The story lane's AI tasks, pure half, in Node, no browser:
   src/lib/ai-story-model.js (docs/AI-EVERYWHERE.md sections 9 and 10).
   Run: node scripts/test-ai-story.mjs */
import * as M from '../src/lib/ai-story-model.js';

let fail = 0, pass = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '\n      ' + JSON.stringify(extra) : '')); }
}
const J = (x) => JSON.stringify(x);

/* ---- 9. character-arcs ---------------------------------------- */
console.log('character-arcs');
const views = [
  { id: 'bp:protagonist', name: 'Anbu', role: 'protagonist', want: 'Money', need: 'Home', arc: '', arcStart: '', arcEnd: '', phone: '9999' },
  { id: 'ch_1', name: 'Meena', role: 'ally', want: '', need: '', arc: 'typed', arcStart: 'typed', arcEnd: 'typed' },   // nothing empty
  { id: 'ch_2', name: 'Ravi', role: '', arc: 'typed arc', arcStart: '', arcEnd: '' },
  { id: 'cue:BOSS', name: 'BOSS', derived: true },
  { id: 'ch_3', name: '', arc: '' }
];
const scenes = [{ number: '1', intExt: 'INT', location: 'House', synopsis: 'Anbu counts coins.' }, { number: '2', synopsis: '' }];
const f = M.arcsFacts({ views, steps: [{ text: 'Anbu loses the job' }, { text: '' }], scenes, slugOf: (s) => s.intExt + ' ' + s.location });
ok(f.characters.map((c) => c.characterId).join() === 'bp:protagonist,ch_2', 'only named characters with an empty arc field are sent', f.characters.map((c) => c.characterId));
ok(J(f.characters[1].empty) === '["arcStart","arcEnd"]', 'the empty fields are listed', f.characters[1].empty);
ok(!J(f).includes('9999') && !('phone' in f.characters[0]), 'nothing from contacts leaves');
ok(f.beats.length === 1 && f.scenes.length === 1 && f.scenes[0].slug === 'INT House', 'steps and scenes are the story the writer wrote; blanks left out');
const sch = M.arcsSchema();
ok(sch.additionalProperties === false && sch.required.includes('arcs') && sch.properties.arcs.items.required.length === 4, 'schema is strict, every field required');
ok(M.arcsPrompt(f, 'REFINE').endsWith('REFINE') && M.arcsPrompt(f).includes('"bp:protagonist"'), 'prompt carries the facts and the refine text');

const r = M.readArcs({ arcs: [
  { characterId: 'bp:protagonist', arc: 'Learns to stay', arcStart: 'Alone', arcEnd: 'Home' },
  { characterId: 'ch_2', arc: 'would overwrite', arcStart: 'Careless', arcEnd: '' },   // arc was typed: not offered
  { characterId: 'ghost', arc: 'x', arcStart: 'x', arcEnd: 'x' },                       // never sent
  { characterId: 'ch_1', arc: 'x', arcStart: 'x', arcEnd: 'x' },                         // not sent (nothing empty)
  { characterId: 'bp:protagonist', arc: 'dup', arcStart: 'dup', arcEnd: 'dup' }          // duplicate
] }, f);
ok(r.items.length === 2 && r.dropped === 3, 'unknown ids and duplicates are dropped and counted', { n: r.items.length, d: r.dropped });
ok(r.items[0].id === 'cbp:protagonist' && J(Object.keys(r.items[0].fields)) === '["arc","arcStart","arcEnd"]', 'item id is c<characterId>');
ok(J(r.items[1].fields) === '{"arcStart":"Careless"}', 'a field that was not empty at Run is never offered', r.items[1].fields);
ok(M.readArcs('nonsense', f).items.length === 0 && M.readArcs({ arcs: [{ characterId: 'ch_2' }] }, f).items.length === 0, 'junk and empty replies yield nothing');
ok(M.readArcs({ arcs: [{ characterId: 'bp:protagonist', arc: 'x'.repeat(2000), arcStart: '', arcEnd: '' }] }, f).items[0].fields.arc.length === 600, 'text is clipped');

const now = { 'bp:protagonist': { arc: '', arcStart: 'TYPED SINCE', arcEnd: '' }, ch_2: null };
const plan = M.planArcWrites(r.items, (id) => now[id] || null);
ok(J(plan.writes.map((w) => w.field)) === '["arc","arcEnd"]' && plan.skipped === 2, 'a field filled since Run is skipped and counted; a gone character is skipped', plan);
const u = M.planArcUndo(plan.writes, (id, fld) => (fld === 'arc' ? 'Learns to stay' : 'EDITED by the writer'));
ok(J(u.blank) === '[{"characterId":"bp:protagonist","field":"arc"}]' && u.kept === 1, 'undo blanks only what still reads what was written', u);
ok(M.planArcUndo(plan.writes, () => null).blank.length === 0, 'undo leaves a deleted character alone');

/* ---- 10. script-cleanup --------------------------------------- */
console.log('script-cleanup');
ok(M.sameWords('ANBU: Hello, there.', 'Anbu\nHello there') && M.sameWords("INT. HOUSE - DAY", 'int house day'), 'case, spacing and cue punctuation are ignored');
ok(!M.sameWords('Hello there', 'Hello there friend') && !M.sameWords('Hello there', 'There hello') && !M.sameWords('Hello there', 'Hi there'), 'added, reordered or reworded words differ');
ok(M.sameWords('Don’t go', "don't go") && !M.sameWords("don't", 'dont'), 'an apostrophe inside a word is part of it');
ok(M.sameWords('வணக்கம் அன்பு', 'வணக்கம்\nஅன்பு'), 'Tamil words keep their vowel signs');
const sel = { ids: ['a', 'b'], text: 'INT. HOUSE - DAY\nAnbu: Hello there.' };
const facts = M.cleanupFacts(sel, [{ type: 'action', text: '1' }, { type: 'scene', text: '2' }, { type: 'character', text: '3' }]);
ok(facts.above.map((e) => e.text).join() === '2,3' && !facts.tooLong && !facts.empty, 'two lines above ride along, nothing else');
ok(M.cleanupFacts({ ids: ['a'], text: 'x'.repeat(M.CLEANUP_MAX_CHARS + 1) }).tooLong && M.cleanupFacts({ ids: [], text: '  ' }).empty, 'over 20,000 characters is refused; empty is empty');
const p = M.cleanupPrompt(facts, 'REFINE');
ok(p.includes('<<<BLOCK') && p.includes('Anbu: Hello there.') && p.endsWith('REFINE') && p.includes('[character] 3'), 'prompt shows the block, the context and the refine text');
const cs = M.cleanupSchema();
ok(cs.additionalProperties === false && cs.properties.elements.items.properties.type.enum.length === 6, 'schema: six types, strict');

const good = M.readCleanup({ elements: [
  { type: 'scene', text: 'INT. HOUSE - DAY' }, { type: 'character', text: 'ANBU' }, { type: 'dialogue', text: 'Hello there.' }, { type: 'bogus', text: '' }
] }, facts);
ok(good.items.length === 3 && !good.rejected && good.items[0].id === 'e0' && good.items[0].detail === 'Scene heading' && good.items[1].type === 'character', 'a faithful reply becomes items e0.. with a type label', good);
const reword = M.readCleanup({ elements: [{ type: 'scene', text: 'INT. HOUSE - DAY' }, { type: 'dialogue', text: 'Hello, friend.' }] }, facts);
ok(reword.items.length === 0 && /formatting, not editing/.test(reword.rejected), 'a rewording reply is rejected whole', reword);
const cut = M.readCleanup({ elements: [{ type: 'scene', text: 'INT. HOUSE - DAY' }] }, facts);
ok(cut.items.length === 0 && cut.rejected, 'a reply that drops words is rejected');
ok(M.readCleanup({ elements: [] }, facts).rejected && M.readCleanup(null, facts).rejected, 'nothing usable is said');
ok(M.readCleanup({ elements: [{ type: 'weird', text: 'INT. HOUSE - DAY' }, { type: 'action', text: 'Anbu: Hello there.' }] }, facts).items[0].type === 'action', 'an unknown type reads as action');

const sneaky = M.readCleanup({ elements: [{ type: 'character', text: 'RAVI' }, { type: 'dialogue', text: "WAIT WHAT!!! i didn't say that call 555 1234" }] },
  { text: "RAVI: Wait, what? I didn't say that. Call 555-1234.", above: [] });
ok(sneaky.items.length === 0 && /formatting, not editing/.test(sneaky.rejected), 'inner punctuation changes are not formatting');
const keep = M.readCleanup({ elements: [{ type: 'character', text: 'RAVI' }, { type: 'dialogue', text: 'WAIT, WHAT? i didnt'.replace('didnt', "didn't") }] },
  { text: "Ravi: Wait, what? I didn't", above: [] });
ok(keep.items.length === 2 && keep.items[1].text === "Wait, what? I didn't" && keep.items[0].text === 'Ravi', "accepted cleanup writes the writer's own case and punctuation");
const pl = M.cleanupPlan([good.items[0], good.items[2]], good.items);
ok(J(pl.map((x) => x.type)) === '["scene","action","dialogue"]' && pl.map((x) => x.text).join('|') === 'INT. HOUSE - DAY|Anbu|Hello there.', 'an unticked line keeps its words as plain action');

const E = (id, type, text) => ({ id, type, text });
const doc = [E('x', 'action', 'above1'), E('y', 'action', 'above2'), E('a', 'action', 'one'), E('b', 'action', 'two'), E('z', 'action', 'below')];
const snap = { block: [E('a', 'action', 'one'), E('b', 'action', 'two')], above: [E('x', 'action', 'above1'), E('y', 'action', 'above2')], below: E('z', 'action', 'below') };
ok(M.blockStillThere(doc, snap).at === 2, 'an unchanged block is found where it was');
ok(M.blockStillThere(doc.map((e) => (e.id === 'b' ? { ...e, text: 'edited' } : e)), snap).at === -1, 'a block line edited since Run: nothing is written');
ok(M.blockStillThere(doc.map((e) => (e.id === 'y' ? { ...e, text: 'edited' } : e)), snap).at === -1, 'a line above edited since Run: nothing is written');
ok(M.blockStillThere(doc.map((e) => (e.id === 'z' ? { ...e, type: 'scene' } : e)), snap).at === -1, 'the line below changed since Run: nothing is written');
ok(M.blockStillThere([doc[0], doc[1], doc[2], E('n', 'action', 'new'), doc[3], doc[4]], snap).at === -1, 'a line inserted inside the block: nothing is written');
ok(M.blockStillThere(doc.slice(0, 4), { ...snap, below: E('z', 'action', 'below') }).at === -1, 'the line below deleted: nothing is written');
ok(M.blockStillThere([...doc, E('w', 'action', 'late')], { ...snap, below: null }).at === -1, 'something appended below a block that had nothing below: refused');
const wrote = [E('n1', 'scene', 'INT.'), E('n2', 'action', 'text')];
ok(M.addedStillThere([E('q', 'action', 'k'), ...wrote], wrote).at === 1, 'undo finds the added lines');
ok(M.addedStillThere([E('q', 'action', 'k'), wrote[0], { ...wrote[1], text: 'edited' }], wrote).at === -1, 'undo refuses lines edited since');
ok(M.addedStillThere([E('q', 'action', 'k')], wrote).at === -1, 'undo says so when the lines are gone');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
