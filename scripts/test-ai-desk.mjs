#!/usr/bin/env node
/* The AI Desk's pure halves, in Node, no browser:
   src/lib/ai-diff.js (line diff → hunks, mergeHunks) and
   src/lib/ai-refine.js (refineBlock / withRefine, re-exported by ai.js). */
import { diffLines, mergeHunks, normalise } from '../src/lib/ai-diff.js';
import { refineBlock, withRefine } from '../src/lib/ai-refine.js';
import { readFileSync } from 'node:fs';

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
