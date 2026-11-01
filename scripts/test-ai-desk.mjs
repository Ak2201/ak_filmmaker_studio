#!/usr/bin/env node
/* The AI Desk's pure halves, in Node, no browser:
   src/lib/ai-diff.js (line diff → hunks, mergeHunks) and
   src/lib/ai-refine.js (refineBlock / withRefine, re-exported by ai.js). */
import { diffLines, mergeHunks, normalise } from '../src/lib/ai-diff.js';
import { refineBlock, withRefine } from '../src/lib/ai-refine.js';
import { readFileSync } from 'node:fs';
import { listenSay, acceptNote, undoNote } from '../src/lib/ai-desk-outcome.js';
import { resolve as kitResolve, call as kitCall } from '../src/lib/ai-task-kit.js';

let fail = 0, pass = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
const ids = (hs) => hs.map((h) => h.id);

console.log('ai-diff');
const A = ['INT. HOUSE - NIGHT', '', 'Meena waits.', 'MEENA', 'Where were you?', 'RAVI', 'Out.', ''].join('\n');
ok(diffLines(A, A).length === 0, 'identical text → 0 hunks');

const B1 = A.replace('Where were you?', 'You are late.');
const h1 = diffLines(A, B1);
ok(h1.length === 1 && h1[0].removed[0] === 'Where were you?' && h1[0].added[0] === 'You are late.',
  'one changed line → 1 hunk', JSON.stringify(h1));
ok(h1[0].before === 'MEENA', 'the hunk carries the line above it as context');

const B = ['EXT. HOUSE - NIGHT', '', 'Meena waits.', 'She checks the clock.', 'MEENA', 'You are late.', 'RAVI', 'Out.', ''].join('\n');
const hs = diffLines(A, B);
ok(hs.length === 3, 'three separate edits → 3 hunks', JSON.stringify(hs));
ok(mergeHunks(A, hs, ids(hs)) === B, 'accepting every hunk reproduces proposed exactly');
ok(mergeHunks(A, hs, []) === A, 'accepting none reproduces original exactly');
const sub = mergeHunks(A, hs, [hs[0].id, hs[2].id]);
const want = ['EXT. HOUSE - NIGHT', '', 'Meena waits.', 'MEENA', 'You are late.', 'RAVI', 'Out.', ''].join('\n');
ok(sub === want, 'accepting a subset applies only those hunks', JSON.stringify(sub));
const only2 = mergeHunks(A, hs, [hs[1].id]);
ok(only2.includes('She checks the clock.') && only2.startsWith('INT.') && only2.includes('Where were you?'),
  'accepting only the insertion inserts it and nothing else');

const sp = diffLines('one\ntwo\nthree', 'ONE\ntwo\nTHREE');
ok(sp.length === 2, 'lines 0 and 2 changed around an unchanged line → 2 hunks, not merged');

const crlfA = A.replace(/\n/g, '\r\n');
ok(diffLines(crlfA, A).length === 0, 'CRLF original against LF proposed → 0 hunks');
const crlfB = B.replace(/\n/g, '\r\n');
ok(mergeHunks(crlfA, diffLines(crlfA, crlfB), ids(diffLines(crlfA, crlfB))) === normalise(crlfB),
  'CRLF in, LF out, and all-accepted equals normalised proposed');
ok(normalise('a\rb\r\nc') === 'a\nb\nc', 'lone CR and CRLF both become LF');

ok(mergeHunks('', diffLines('', 'new'), ids(diffLines('', 'new'))) === 'new', 'empty original, all accepted');
ok(mergeHunks('old', diffLines('old', ''), ids(diffLines('old', ''))) === '', 'everything removed, all accepted');

// randomized round trip: all / none / every single hunk
let rt = true;
const words = ['a', 'b', 'c', 'd', 'e', ''];
let seed = 7;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
for (let t = 0; t < 300 && rt; t++) {
  const mk = () => Array.from({ length: Math.floor(rnd() * 12) }, () => words[Math.floor(rnd() * words.length)]).join('\n');
  const o = mk(), p = mk();
  const d = diffLines(o, p);
  if (mergeHunks(o, d, ids(d)) !== p || mergeHunks(o, d, []) !== o) { rt = false; console.log('      at', JSON.stringify({ o, p })); }
  for (const hk of d) {
    const once = mergeHunks(o, d, [hk.id]);
    const back = mergeHunks(once, diffLines(once, p), ids(diffLines(once, p)));
    if (back !== p) { rt = false; break; }
  }
}
ok(rt, '300 random pairs: all → proposed, none → original, any single hunk stays mergeable');

console.log('ai-refine');
const prev = { original: 'x', proposed: 'Where were you, Ravi?' };
const blk = refineBlock({ previous: prev, instructions: ['Shorter', 'Keep my wording'] });
ok(blk.includes(JSON.stringify(prev, null, 2)), 'refineBlock contains the previous JSON');
ok(/\n1\. Shorter\n2\. Keep my wording\n/.test(blk), 'refineBlock numbers the instructions in order');
ok(/same JSON shape/.test(blk), 'refineBlock asks for the same JSON shape');
ok(refineBlock({}) === '', 'nothing to refine → empty block');
const p0 = { system: 'S', user: 'U' };
ok(withRefine(p0, undefined) === p0, 'withRefine with no refine leaves the prompt unchanged');
const p1 = withRefine(p0, { previous: prev, instructions: ['More tension'] });
ok(p1.system === 'S' && p1.user.startsWith('U') && p1.user.includes('1. More tension'),
  'withRefine keeps the system prompt and appends to the user message');

const aiSrc = readFileSync(new URL('../src/lib/ai.js', import.meta.url), 'utf8');
ok(/export \{ refineBlock, withRefine \} from '\.\/ai-refine\.js'/.test(aiSrc), 'ai.js re-exports refineBlock');

console.log('ai-desk-outcome (no second toast that contradicts the task)');
{
  // A lane task the way ai-tasks-preprod.js writes one: say, then null.
  const said = [];
  const pageCtx = () => ({ say: (m) => said.push(m), sheetId: 's1' });
  const nothing = { apply(sel, ctx) { const c = kitResolve(ctx); kitCall(c.say, '4 fields were filled in since the run, so nothing was written.'); return null; } };
  let l = listenSay(pageCtx);
  const r1 = nothing.apply([], l.ctx);
  ok(r1 === null && l.spoke() && said.length === 1, 'the page\'s say still reaches the page through the wrapped ctx');
  ok(acceptNote(r1, l.spoke(), 'Recce ideas') === null, 'a task that said "nothing was written" gets no "applied." after it');
  ok(l.ctx().sheetId === 's1', 'other ctx fields read through unchanged');

  // A silent null (ai-tasks.js returns null when nothing was written).
  l = listenSay({});
  const n = acceptNote(null, l.spoke(), 'Logline');
  ok(n && n.type === 'info' && /nothing was changed/.test(n.text) && !/applied/.test(n.text), 'a silent null says nothing was changed, never "applied."');
  ok(acceptNote(undefined, false, 'X').text === 'X: applied.', 'a write with no undo still says applied');

  // An undo that refuses because the text was edited since (callsheet-notes).
  said.length = 0;
  const notes = { v: '' };
  const writer = { apply(sel, ctx) {
    const c = kitResolve(ctx); notes.v = 'AI notes'; kitCall(c.say, 'Notes added to the call sheet.');
    return () => { if (notes.v !== 'AI notes') { kitCall(c.say, 'The notes were edited since and are left as they are.'); return; } notes.v = ''; };
  } };
  l = listenSay(pageCtx);
  const undo = writer.apply([], l.ctx);
  notes.v = 'I rewrote these';
  l.reset();
  const ur = undo();
  ok(undoNote(ur, l.spoke()) === null && notes.v === 'I rewrote these', 'a refused undo is not followed by "Undone."');
  l.reset();
  notes.v = 'AI notes';
  ok(undoNote(undo(), l.spoke()) === 'Undone.' && notes.v === '', 'a silent undo that worked still says Undone.');
  ok(undoNote(false, false) === null, 'an undo returning false refused: no "Undone."');

  const deskSrc = readFileSync(new URL('../src/ui/ai-desk.js', import.meta.url), 'utf8');
  ok(/task\.apply\(selected, heard\.ctx/.test(deskSrc) && /undoNote\(/.test(deskSrc) && /acceptNote\(/.test(deskSrc)
    && !/toastSuccess\(label \+ ': applied\.'\)/.test(deskSrc) && !/then\(\(\) => StudioUI\.toast\('Undone\./.test(deskSrc),
    'ai-desk.js routes Accept and Undo toasts through ai-desk-outcome.js');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
