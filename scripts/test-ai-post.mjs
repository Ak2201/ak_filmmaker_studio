#!/usr/bin/env node
/* The on-set and post Desk tasks' pure half, in Node, no browser:
   src/lib/ai-post-model.js (docs/AI-EVERYWHERE.md, tasks 5 to 8). */
import { mem } from './node-seams.mjs';   // the JSON-import seam cbfc.js needs in Node
void mem;
const M = await import('../src/lib/ai-post-model.js');
const { diffElements, groupByScene } = await import('../src/lib/script-diff.js');
const { certificationReport, ruleById, DISCLAIMER } = await import('../src/lib/cbfc.js');
const rules = (await import('../src/data/cbfc-rules.json')).default;

let fail = 0, pass = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}

console.log('draft-changes');
const el = (id, type, text) => ({ id, type, text });
const A = [el('1', 'scene', 'INT. HOUSE - NIGHT'), el('2', 'action', 'Anbu counts coins.'), el('3', 'scene', 'EXT. BUS STAND - DAY'), el('4', 'action', 'A bus arrives.')];
const B = [el('1', 'scene', 'INT. HOUSE - NIGHT'), el('2', 'action', 'Anbu counts coins slowly.'), el('5', 'action', 'A dog barks.'), el('3', 'scene', 'EXT. BUS STAND - DAY')];
const diff = diffElements(A, B);
const f = M.changeFacts({ groups: groupByScene(diff), stats: diff.stats, olderLabel: 'Draft 1', newerLabel: 'The script now' });
ok(/Older: Draft 1/.test(f.text) && /Scene "INT\. HOUSE - NIGHT"/.test(f.text), 'facts name both drafts and the scene', f.text);
ok(f.headings.includes('INT. HOUSE - NIGHT'), 'headings sent are listed');
const big = Array.from({ length: 40 }, (_, i) => ({
  heading: 'SCENE ' + i, counts: { added: 1 }, ops: [{ op: 'added', a: null, b: el('x' + i, 'action', 'y'.repeat(900)) }]
}));
const capped = M.changeFacts({ groups: big, cap: 12000 });
ok(capped.text.length <= 12000 + 200 && capped.truncated && /Cut here/.test(capped.text) && capped.omitted > 0, 'facts are capped at 12,000 chars with a note', capped.text.length);
const r1 = M.readChanges({ summary: 'S', scenes: [{ heading: 'int. house - night', change: 'slower' }, { heading: 'INT. INVENTED', change: 'x' }], watch: ['a', ''] }, f.headings);
ok(r1.scenes.length === 1 && r1.dropped === 1 && r1.watch.length === 1, 'a heading that was not sent is dropped', JSON.stringify(r1));
const t1 = M.changesText(r1, { model: 'm' });
ok(t1.endsWith('Changed nothing.') && /Read by m\./.test(t1), 'the text ends "Changed nothing."');

console.log('day-wrap-summary');
const wf = M.wrapFacts({ day: 3, scenes: [
  { number: '12', slug: 'INT. A', shotState: 'shot', takes: 4, circled: 1, floorNote: 'fast' },
  { number: '14A', slug: 'EXT. B', shotState: 'not marked', takes: 0, circled: 0 }] });
ok(wf.totals.shot === 1 && wf.totals.notMarked === 1 && wf.totals.takes === 4, 'totals come from the marks');
ok(!/phone|@/.test(wf.text), 'no contact data in the facts');
const rw = M.readWrap({ summary: 'Scene 12 was shot. Scene 99 slipped. Good day.', owed: ['Scene 14A is not shot', 'Scene 7 needs a pick-up'], tomorrow: ['Pick up Scenes 14A and 12'] }, wf.numbers);
ok(rw.summary === 'Scene 12 was shot. Good day.', 'a sentence naming an unsent scene is cut', rw.summary);
ok(rw.owed.length === 1 && rw.tomorrow.length === 1 && rw.dropped === 2, 'an item naming an unsent scene is dropped', JSON.stringify(rw));
ok(M.sceneNumbersIn('Sc. 4A, scenes 3, 5 and 7').join() === '4A,3,5,7', 'scene numbers are read from prose');
ok(M.wrapText(rw).endsWith('Changed nothing.'), 'wrap text ends "Changed nothing."');

console.log('edit-notes');
const rows = [
  { id: 'a', number: '1', slug: 'INT. A', note: '', cut: 'In', set: 'full', pickups: [], seconds: 30 },
  { id: 'b', number: '2', slug: 'INT. B', note: 'typed by the editor', cut: '', set: 'part', pickups: ['insert'] },
  { id: 'c', number: '3', slug: 'INT. C', note: '', cut: '', set: 'none', pickups: [] }];
const ef = M.editFacts({ rows, cuts: ['Rough cut'] });
ok(ef.empty.join() === 'a,c' && ef.ids.length === 3, 'only blank scenes are the targets');
const re = M.readEditNotes({ notes: [
  { sceneId: 'a', note: 'x'.repeat(400) }, { sceneId: 'b', note: 'overwrite!' }, { sceneId: 'zz', note: 'ghost' },
  { sceneId: 'c', note: 'ok\nline' }, { sceneId: 'c', note: 'dup' }] }, { ids: ef.ids, empty: ef.empty, rows });
ok(re.items.length === 2 && re.dropped === 3, 'unknown ids, scenes with a note and duplicates are dropped', JSON.stringify(re));
ok(re.items[0].note.length === 280 && re.items[1].note === 'ok line' && re.items[0].id === 'sa', 'notes are clipped to 280, one line; ids are s<sceneId>');
ok(M.canFill('') && M.canFill('  ') && !M.canFill('typed'), 'fill only where the note is empty now');
ok(M.canUndo('same', 'same') && !M.canUndo('edited', 'same'), 'undo only while the note is as written');

console.log('cert-read');
const report = certificationReport(
  [{ id: 's1', number: '5', intExt: 'INT.', location: 'BAR', dayNight: 'NIGHT', synopsis: 'He lights a cigarette and smokes.', elements: {} }], []);
const cf = M.certFacts(report, rules.ratings);
ok(cf.fired >= 1 && cf.ruleIds.includes('tobacco'), 'the fired rule is in the facts', cf.text.slice(0, 200));
ok(!/cigarette/.test(cf.text), 'no script or synopsis text is sent');
const rc = M.readCert({ read: 'See [tobacco] and [madeup].', rules: [{ ruleId: 'tobacco', why: 'warning needed' }, { ruleId: 'nope', why: 'x' }], questions: ['q'] }, ruleById);
ok(rc.rules.length === 1 && rc.dropped === 1 && rc.read === 'See [tobacco] and madeup.', 'a rule id not in cbfc-rules.json is dropped, a bad [id] unwrapped', JSON.stringify(rc));
const ct = M.certText(rc, ruleById, DISCLAIMER, { model: 'm' });
ok(ct.includes(DISCLAIMER) && /hint, not advice/i.test(ct) && /\[tobacco\]/.test(ct) && ct.endsWith('Changed nothing.'), 'the DISCLAIMER is appended verbatim; ids print as [tobacco]');
ok(/not advice/i.test(M.CERT_SYSTEM) && /not advice/i.test(M.certUser(cf)), 'the prompt says it is a hint and not advice');

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
