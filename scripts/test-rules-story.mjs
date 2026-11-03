#!/usr/bin/env node
/* The story lane's no-AI twins, in Node, no browser:
   src/lib/rules-story.js (pure) and src/lib/local-tasks-story.js (the
   Desk tasks over it). docs/RULES-BREAKDOWN.md Lane C.
   Run: node scripts/test-rules-story.mjs  (npm run test:rules-story) */
import { mem } from './node-seams.mjs';
import fs from 'node:fs';
void mem;
const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

const R = await import('../src/lib/rules-story.js');
const Model = await import('../src/lib/ai-story-model.js');
const T = await import('../src/lib/local-tasks-story.js');

let pass = 0, fail = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra !== undefined ? '\n      ' + JSON.stringify(extra) : '')); }
}
const J = (x) => JSON.stringify(x);
const words = (s) => Model.wordsOf(s).join(' ');

/* ---- the layer: no AI import, no AI stamp -------------------- */
console.log('layer');
for (const f of ['src/lib/rules-story.js', 'src/lib/local-tasks-story.js']) {
  const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const imports = [...src.matchAll(/(?:from|import\()\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const bad = imports.filter((i) => /(^|\/)ai\.js$|ai-tasks|ai-stamp|ai-panel|ai-desk/.test(i));
  ok(!bad.length, f + ' imports nothing from ai.js, ai-tasks*.js, ai-stamp.js', bad);
  ok(!/aiFill|stampAI|\bai:\s/.test(src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), f + ' never writes ai or aiFill');
}
if (typeof document !== 'undefined') ok(false, 'rules-story ran with no document');

/* ---- C1. cleanupSplit --------------------------------------- */
console.log('cleanup');
const el = (id, type, text) => ({ id, type, text });
const lump = `INT. KITCHEN - NIGHT
Mara pours tea. The kettle SCREAMS.
MARA
(quietly)
You came back.
JOE
I did.
CUT TO:
EXT. STREET - DAY
THE CAR SPEEDS PAST AND DOES NOT STOP.`;
const r1 = R.cleanupSplit({ block: [el('a', 'action', lump)] });
ok(!r1.rejected && r1.items.length >= 9, 'a pasted lump is cut into lines', r1.items.map((i) => i.type));
ok(words(r1.items.map((i) => i.text).join('\n')) === words(lump), 'every word kept, in order');
const types = r1.items.map((i) => i.type).join();
ok(types === 'scene,action,character,paren,dialogue,character,dialogue,transition,scene,action', 'slug, cue, paren, dialogue, transition and an ALL-CAPS action line are typed', types);
ok(r1.items.find((i) => /^THE CAR/.test(i.text)).type === 'action', 'an ALL-CAPS sentence stays action, not a cue');
ok(r1.items.find((i) => i.type === 'transition').text === 'CUT TO:', 'CUT TO: is a transition, not the end of the dialogue above');
ok(r1.changed === r1.items.length && !r1.items.some((i) => i.keepId), 'nothing of a one-element lump is "unchanged"');
ok(r1.items.every((i) => !('ai' in i) && !('aiFill' in i)), 'no ai / aiFill on an item');

const lines = [el('s', 'scene', 'INT. KITCHEN - NIGHT'), el('c', 'character', 'MARA'), el('d', 'dialogue', 'You came back.')];
const r2 = R.cleanupSplit({ block: lines });
ok(r2.changed === 0 && r2.items.every((i) => i.keepId), 'already-typed lines come back unchanged with their ids', r2.items);
ok(J(r2.items.map((i) => [i.keepId, i.type])) === J([['s', 'scene'], ['c', 'character'], ['d', 'dialogue']]), 'ids and types of unchanged lines are the original ones');

const mixed = [el('s', 'scene', 'INT. KITCHEN - NIGHT'), el('x', 'action', 'MARA\nYou came back.\nJOE\nI did.')];
const r3 = R.cleanupSplit({ block: mixed });
ok(r3.items[0].keepId === 's' && r3.items[0].type === 'scene', 'the unchanged heading keeps its id');
ok(r3.items.slice(1).map((i) => i.type).join() === 'character,dialogue,character,dialogue' && r3.changed === 4, 'the lump under it is cut', r3.items.map((i) => i.type));

const longRun = Array.from({ length: 95 }, (_, i) => 'word' + i).join(' ');
const r4 = R.cleanupSplit({ block: [el('l', 'action', longRun)] });
ok(r4.changed === 0 || r4.left.length === 1, 'a long run with no cue is reported as left whole', { changed: r4.changed, left: r4.left.length });
ok(r4.items.length === 1 && r4.items[0].keepId === 'l', 'and keeps its own element');

/* the gate: a changed word is refused, exactly as the AI path refuses it */
const gate = Model.readCleanup({ elements: [{ type: 'action', text: 'You came home.' }] }, { text: 'You came back.' });
ok(gate.rejected && !gate.items.length, 'the shared gate refuses a changed word');
const numbered = R.cleanupSplit({ block: [el('n', 'action', '12. INT. KITCHEN - NIGHT\nMara pours tea.')] });
ok(numbered.rejected ? !numbered.items.length : words(numbered.items.map((i) => i.text).join(' ')) === words('12. INT. KITCHEN - NIGHT\nMara pours tea.'),
  'a parser that would drop a word is refused whole, or keeps every word');
ok(R.cleanupSplit({ block: [] }).items.length === 0 && R.cleanupSplit({ block: [el('e', 'action', '  ')] }).items.length === 0, 'an empty selection proposes nothing');
const huge = R.cleanupSplit({ block: [el('h', 'action', 'a '.repeat(Model.CLEANUP_MAX_CHARS))] });
ok(huge.tooLong && !huge.items.length, 'too long a block is refused');
ok(J(R.cleanupSplit({ block: [el('a', 'action', lump)] })) === J(r1), 'deterministic: the same input is the same output');

/* ---- the cleanup task: apply and undo ----------------------- */
console.log('cleanup task');
const task = (id) => T.RULES_TASKS_STORY.find((t) => t.id === id);
ok(T.RULES_TASKS_STORY.map((t) => t.id).join() === 'script-cleanup-rules,logline-rules,voice-check-rules', 'three task ids, permanent');
ok(T.RULES_TASKS_STORY.every((t) => t.local === true && t.kind === 'list' && t.editable === false), 'each is a local list task');
ok(T.RULES_TASKS_STORY.every((t) => typeof t.input() === 'string' && t.input().length > 20), 'input() is synchronous and needs no model');

const doc = { elements: [el('p0', 'scene', 'INT. HALL - DAY'), el('lump', 'action', lump), el('p2', 'action', 'Later.')] };
const calls = { types: [], saves: 0, renders: 0, said: [] };
const ctx = {
  getDoc: () => doc, getSelection: () => ({ ids: ['lump'] }),
  setType: (id, type) => { calls.types.push([id, type]); doc.elements.find((e) => e.id === id).type = type; },
  save: () => { calls.saves++; }, render: () => { calls.renders++; }, after: () => {}, say: (m) => calls.said.push(m)
};
const before = clone(doc.elements);
function clone(x) { return JSON.parse(JSON.stringify(x)); }
const ct = task('script-cleanup-rules');
const res = await ct.run(ct.input(ctx), { ctx });
ok(res.items.length >= 9 && /formatting, not editing/.test(res.note), 'run() proposes the lines', res.note);
ok(J(doc.elements) === J(before) && !calls.saves, 'nothing is written before Accept');
const undo = ct.apply(res.items, ctx, res);
ok(typeof undo === 'function', 'Accept returns an undo');
ok(doc.elements.length === 2 + res.items.length && doc.elements[0].id === 'p0' && doc.elements.at(-1).id === 'p2', 'the block is replaced in place, the lines around it untouched');
ok(doc.elements.slice(1, -1).map((e) => e.type).join() === res.items.map((i) => i.type).join(), 'types set through setType', doc.elements.map((e) => e.type));
ok(calls.types.length > 0 && calls.types.every(([, t]) => t !== 'action'), 'setType was the path for every change of type');
ok(doc.elements.every((e) => !('ai' in e) && !('aiFill' in e)), 'no new element carries ai or aiFill');
ok(words(doc.elements.slice(1, -1).map((e) => e.text).join(' ')) === words(lump), 'the writer’s words survive Accept');
undo();
ok(J(doc.elements) === J(before), 'Undo puts the original lines back exactly');

/* an edit after Accept is not undone over */
const undo2 = ct.apply(res.items, ctx, res);
doc.elements[2].text = 'You came back, Mara.';
const edited = J(doc.elements);
undo2();
ok(J(doc.elements) === edited && calls.said.at(-1).includes('edited'), 'Undo leaves a line edited since, and says so', calls.said.at(-1));
doc.elements.splice(0, doc.elements.length, ...clone(before));

/* a changed script is refused */
const res2 = await ct.run(ct.input(ctx), { ctx });
doc.elements[1].text = lump + ' extra';
let threw = null;
try { ct.apply(res2.items, ctx, res2); } catch (e) { threw = e; }
ok(threw && threw.kind === 'nocontent' && /changed/.test(threw.message), 'Accept refuses when the selected lines changed since Run', threw && threw.message);
doc.elements[1].text = lump;

/* untick keeps the words as action */
const res3 = await ct.run(ct.input(ctx), { ctx });
ct.apply(res3.items.slice(1), ctx, res3);
ok(doc.elements[1].type === 'action' && doc.elements[1].text === res3.items[0].text, 'an unticked line keeps its words as plain action');
doc.elements.splice(0, doc.elements.length, ...clone(before));

/* an unchanged line keeps its id, even when unticked */
const doc2 = { elements: [el('k1', 'scene', 'INT. A - DAY'), el('k2', 'action', 'MARA\nHello there.')] };
const ctx2 = { ...ctx, getDoc: () => doc2, getSelection: () => ({ ids: ['k1', 'k2'] }), setType: (id, t) => { doc2.elements.find((e) => e.id === id).type = t; } };
const res4 = await ct.run(ct.input(ctx2), { ctx: ctx2 });
ct.apply(res4.items.filter((i) => !i.keepId), ctx2, res4);
ok(doc2.elements[0].id === 'k1' && doc2.elements[0].type === 'scene', 'an unchanged heading keeps its element and type though unticked');
let none = null;
const doc3 = { elements: [el('q1', 'scene', 'INT. A - DAY'), el('q2', 'character', 'MARA'), el('q3', 'dialogue', 'Hello there.')] };
const ctx3 = { ...ctx, getDoc: () => doc3, getSelection: () => ({ ids: ['q1', 'q2', 'q3'] }) };
try { await ct.run(ct.input(ctx3), { ctx: ctx3 }); } catch (e) { none = e; }
ok(none && none.kind === 'nocontent', 'a block that already reads right says so (nocontent), and writes nothing', none && none.message);
let nosel = null;
try { await ct.run('', { ctx: { ...ctx, getSelection: () => null } }); } catch (e) { nosel = e; }
ok(nosel && nosel.kind === 'nocontent', 'no selection is a nocontent refusal');

/* ---- C2. loglineCheck --------------------------------------- */
console.log('logline');
const GOOD = 'A disgraced detective must find her missing son before the storm floods the island, but the only witness is the man who ruined her.';
const g = R.loglineCheck(GOOD, { names: [] });
const part = (c, p) => c.check.find((x) => x.part === p);
ok(['length', 'sentence', 'protagonist', 'goal', 'obstacle', 'stakes', 'names', 'phrase', 'question'].every((p) => part(g, p)), 'the checklist has every part');
ok(g.check.every((c) => typeof c.part === 'string' && typeof c.label === 'string' && typeof c.present === 'boolean' && typeof c.found === 'string' && typeof c.note === 'string' && typeof c.words === 'number'),
  'rows have the AI check shape: part, label, present, found, note (and words)');
ok(g.check.every((c) => !('score' in c)) && !('score' in g), 'a checklist, never a score');
ok(g.check.filter((c) => c.checked !== false).every((c) => c.present), 'a good logline passes every point', g.check.filter((c) => !c.present));
ok(part(g, 'protagonist').found === 'detective' && /^must find/.test(part(g, 'goal').found) && /^but/.test(part(g, 'obstacle').found), 'found is the writer’s own words', g.check.map((c) => c.found));
ok(g.check.every((c) => !c.found || GOOD.includes(c.found)), 'every found span is a verbatim substring of the logline');
ok(part(g, 'length').words === g.words && g.words === 24, 'word count', g.words);
const named = R.loglineCheck('Mara must find her son before the storm.', { names: ['Mara'] });
ok(part(named, 'protagonist').found === 'Mara', 'a character name counts as the protagonist');

const BAD = 'This is a story about two people called Anbu, Meena, Ravi and Joe. Will they ever find out?';
const b = R.loglineCheck(BAD, { names: [] });
const sh = R.loglineCheck('Mara runs home.', {});
ok(!part(sh, 'length').present && /short/.test(part(sh, 'length').note) && part(sh, 'length').words === 3, 'too short');
ok(!part(b, 'sentence').present && part(b, 'sentence').found === 'Will they ever find out?', 'two sentences');
ok(!part(b, 'phrase').present && part(b, 'phrase').found.toLowerCase() === 'this is a story', 'announcing the story is found', part(b, 'phrase'));
ok(!part(b, 'question').present, 'a question is found');
ok(!part(b, 'names').present && part(b, 'names').found.split(', ').length === 4, 'four proper names', part(b, 'names').found);
ok(!part(b, 'goal').present && !part(b, 'stakes').present, 'no goal or stakes found');
ok(R.loglineCheck('', {}).check.length === 0, 'an empty logline has no rows');
const ta = R.loglineCheck('ஒரு இளம் பெண் தன் தந்தையைத் தேடுகிறாள், ஆனால் காவல் துறை தடுக்கிறது.', {});
ok(part(ta, 'goal').checked === false && part(ta, 'length') && part(ta, 'question').present, 'a Tamil logline: word lists say they were not checked, the rest is checked');
ok(J(R.loglineCheck(GOOD, { names: [] })) === J(g), 'deterministic');

/* ---- C3. voiceStats ----------------------------------------- */
console.log('voice');
let n = 0;
const sp = (who, text) => [el('c' + n, 'character', who), el('d' + n++, 'dialogue', text)];
const els = [el('h', 'scene', 'INT. HOUSE - DAY')];
const MARA = ['Tea?', 'No.', 'Why now?', 'Go.', 'Stay!', 'Sit down.', 'Fine.', 'Again?'];
MARA.forEach((t) => els.push(...sp('MARA', t)));
els.push(...sp('MARA (V.O.)', 'I remember the winter of the long river and the grey boats that came after midnight, and I remember how nobody ever spoke of it again at all.'));
['Boss, the lorry is late again.', 'Boss, I told you already.', 'Boss, where is the money?', 'Boss, the lorry broke down.', 'Boss, listen to me.', 'Boss, it is done.'].forEach((t) => els.push(...sp('JOE', t)));
els.push(...sp('MARA', 'Boss, the lorry is late again and the money is gone.'));
const v = R.voiceStats(els, 'mara');
ok(v.enough && v.lines === 10 && v.character === 'MARA', 'the extension (V.O.) is the same speaker; case does not matter', { lines: v.lines });
ok(v.stats.max > 20 && v.stats.questions > 0 && v.stats.exclaims > 0, 'length, question and exclamation rates measured', v.stats);
ok(v.flags.some((f) => f.kind === 'length' && /^Measured:/.test(f.why)), 'the long speech is flagged, worded "Measured"', v.flags);
ok(v.flags.some((f) => f.kind === 'borrowed' && /JOE/.test(f.why)), 'a line in another speaker’s vocabulary is flagged', v.flags);
ok(v.flags.every((f) => !/wrong|should|bad/i.test(f.why)), 'flags measure, they do not judge');
ok(v.overlap[0].name === 'JOE' && v.overlap[0].percent >= 0, 'vocabulary overlap against another speaker');
ok(Array.isArray(v.signature) && v.signature.every((s) => s.count >= 2), 'signature words come from repeated words');
ok(J(R.voiceStats(els, 'mara')) === J(v), 'deterministic');
const few = R.voiceStats(els, 'JOE', { minLines: 8 });
ok(!few.enough && /too few lines to measure/.test(few.message) && !few.flags, 'below the minimum it says "too few lines to measure"', few.message);
ok(!R.voiceStats(els, 'NOBODY').enough && /no lines/.test(R.voiceStats(els, 'NOBODY').message), 'an unknown speaker has no lines');
ok(R.voiceStats(els, 'JOE', { minLines: 6 }).enough, 'the minimum is the caller’s to set');

/* ---- the two read tasks keep one sticky note ---------------- */
console.log('reads');
const StoryM = await import('../src/lib/story.js');
const lt = task('logline-rules');
const lctx = { getLogline: () => GOOD, names: () => [] };
const lres = await lt.run(lt.input(lctx), { ctx: lctx });
ok(lres.items.length === g.check.length && lres.items.every((i) => i.text), 'one item per checklist row');
const vaultBefore = J(StoryM.listVault());
ok(lt.apply([], lctx, lres) === null, 'nothing ticked writes nothing (null)');
const lundo = lt.apply(lres.items, lctx, lres);
const kept = StoryM.listVault().filter((x) => x.from === 'rules');
ok(typeof lundo === 'function' && kept.length === 1 && kept[0].kind === 'note', 'Accept keeps ONE sticky note, from "rules"', kept);
ok(!('ai' in kept[0]) && !('aiFill' in kept[0]), 'the note is not AI-stamped');
ok(lt.apply(lres.items, lctx, lres) === null && StoryM.listVault().filter((x) => x.from === 'rules').length === 1, 'a second Accept on the same read writes nothing');
lundo();
ok(J(StoryM.listVault()) === vaultBefore, 'Undo removes exactly that note');
const lundo2 = lt.apply(lres.items, lctx, lres);
const rec = StoryM.listVault().find((x) => x.from === 'rules');
StoryM.updateVault(rec.id, { snippet: rec.snippet + ' (mine)' });
lundo2();
ok(StoryM.listVault().some((x) => x.id === rec.id), 'a note edited since is left on the board by Undo');
StoryM.removeManyFromVault([rec.id]);
let empty = null;
try { await lt.run('', { ctx: { getLogline: () => '  ' } }); } catch (e) { empty = e; }
ok(empty && empty.kind === 'nocontent', 'an empty logline is a nocontent refusal');

const vt = task('voice-check-rules');
const vctx = { character: 'MARA', elements: () => els };
const vres = await vt.run(vt.input(vctx), { ctx: vctx });
ok(vres.items[0].id === 'profile' && vres.items.length === 1 + v.flags.length, 'a profile first, then each flag', vres.items.map((i) => i.id));
ok(/Rewrites and a judgement of voice need Enhance with AI/.test(vres.note), 'the note leaves rewrites to the AI');
let fewErr = null;
try { await vt.run('', { ctx: { character: 'JOE', elements: () => els.slice(0, 5) } }); } catch (e) { fewErr = e; }
ok(fewErr && fewErr.kind === 'nocontent' && /too few lines to measure/.test(fewErr.message), 'too few lines is a refusal in the Desk', fewErr && fewErr.message);
const vundo = vt.apply(vres.items, vctx, vres);
ok(typeof vundo === 'function' && StoryM.listVault().filter((x) => x.from === 'rules').length === 1, 'the voice read keeps one note');
vundo();
ok(!StoryM.listVault().some((x) => x.from === 'rules'), 'and Undo removes it');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
