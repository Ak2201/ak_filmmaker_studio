/* ============================================================
   TEST — find and replace in the screenplay (src/lib/script-replace.js),
   in Node. Matches in script order, Match case, Whole word in any script
   (Tamil included, where \b would split every letter), capitals kept on
   a cue without Match case, ids and types never touched, the input never
   modified, and replaceOne refusing a match the text no longer holds.
   ============================================================ */
const R = await import('../src/lib/script-replace.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

const els = () => [
  { id: 'a', type: 'scene', text: 'INT. RAVI\'S FLAT - NIGHT' },
  { id: 'b', type: 'action', text: 'Ravi paces. Ravindra watches Ravi.' },
  { id: 'c', type: 'character', text: 'RAVI' },
  { id: 'd', type: 'dialogue', text: 'ரவி வந்தான். ரவிக்குமார் இல்லை.' },
  { id: 'e', type: 'action', text: '' }
];

// findMatches
eq(R.findMatches(els(), '').length, 0, 'empty query finds nothing');
eq(R.findMatches(els(), 'ravi').map((m) => m.id), ['a', 'b', 'b', 'b', 'c'], 'case-insensitive, script order, every occurrence');
eq(R.findMatches(els(), 'Ravi', { matchCase: true }).map((m) => m.id), ['b', 'b', 'b'], 'match case');
eq(R.findMatches(els(), 'ravi', { wholeWord: true }).map((m) => m.id), ['a', 'b', 'b', 'c'], 'whole word skips Ravindra');
eq(R.findMatches(els(), 'ரவி', { wholeWord: true }).length, 1, 'whole word in Tamil skips ரவிக்குமார்');
eq(R.findMatches(els(), 'ரவி').length, 2, 'without whole word, Tamil finds both');
eq(R.findMatches(els(), 'a.b').length, 0, 'the query is literal, not a pattern');
const m = R.findMatches(els(), 'Ravi', { matchCase: true })[0];
eq([m.start, m.end, m.index], [0, 4, 1], 'offsets and element index');

// replaceAll
const src = els();
const snapshot = JSON.stringify(src);
const r = R.replaceAll(src, 'ravi', 'Arun', { wholeWord: true });
eq(r.count, 4, 'replace all counts every replacement');
eq(r.changes.map((c) => c.id), ['a', 'b', 'c'], 'one change per element changed');
eq(r.changes.find((c) => c.id === 'a').after, 'INT. ARUN\'S FLAT - NIGHT', 'capitals kept in a heading');
eq(r.changes.find((c) => c.id === 'b').after, 'Arun paces. Ravindra watches Arun.', 'mixed case gets the replacement as typed');
eq(r.changes.find((c) => c.id === 'c').after, 'ARUN', 'a cue stays a cue');
eq(r.changes.find((c) => c.id === 'c').before, 'RAVI', 'before is kept for undo');
ok(JSON.stringify(src) === snapshot, 'the input elements are not modified');
eq(R.replaceAll(els(), 'Ravi', 'Arun', { matchCase: true }).changes.map((c) => c.after),
  ['Arun paces. Arunndra watches Arun.'], 'match case replaces as typed and leaves capitals alone');
eq(R.replaceAll(els(), 'Ravi', '$& $1', { matchCase: true, wholeWord: true }).changes[0].after,
  '$& $1 paces. Ravindra watches $& $1.', 'the replacement is literal ($ patterns are not expanded)');
eq(R.replaceAll(els(), 'nobody', 'x').count, 0, 'no match, no change');
eq(R.replaceAll(els(), 'ravi', 'Ravi Kumar', { wholeWord: true }).count, 4, 'a replacement containing the query does not loop');

// replaceOne
const hits = R.findMatches(els(), 'ravi', { wholeWord: true });
eq(R.replaceOne(els(), hits[2], 'ravi', 'Arun', { wholeWord: true }), { id: 'b', before: 'Ravi paces. Ravindra watches Ravi.', after: 'Ravi paces. Ravindra watches Arun.' }, 'replace one, the third hit');
const edited = els(); edited[1].text = 'Someone else now.';
eq(R.replaceOne(edited, hits[1], 'ravi', 'Arun', { wholeWord: true }), null, 'a stale hit is refused');
eq(R.replaceOne(els(), { id: 'zz', start: 0, end: 4 }, 'ravi', 'Arun'), null, 'an unknown id is refused');

// a leading capital is kept (QA: "Kitchen?" became "hall?")
eq(R.replaceAll([{ id: 'k', text: "Kitchen? Ravi's kitchen." }], 'kitchen', 'hall').changes[0].after,
  "Hall? Ravi's hall.", 'a match that starts with a capital keeps the capital');
eq(R.replaceAll([{ id: 'r', text: 'The roof.' }], 'the', 'a').changes[0].after, 'A roof.', 'a sentence start keeps its capital');
eq(R.replaceAll([{ id: 'r', text: 'The roof.' }], 'the', 'a', { matchCase: false }).count, 1, 'one match');

// types and ids
const t = R.replaceAll(els(), 'NIGHT', 'DAY');
ok(t.changes.every((c) => Object.keys(c).join() === 'id,before,after'), 'a change carries only id, before and after');

console.log((fail ? '✗' : '✓') + ' test-replace: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
