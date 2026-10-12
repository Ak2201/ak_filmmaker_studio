/* return-to.js's validator, in Node: what may be navigated to after
   sign-in. Run: node scripts/test-return-to.mjs */
import { cleanReturn } from '../src/lib/return-to.js';
let bad = 0;
const eq = (got, want, what) => { if (got !== want) { bad++; console.error('FAIL', what, JSON.stringify(got), '!=', JSON.stringify(want)); } };
for (const ok of ['plan.html', '/plan.html', 'plan.html#schedule', 'breakdown.html#elements']) eq(cleanReturn(ok), ok.replace(/^\//, ''), ok);
for (const no of ['', 'https://evil.com/x.html', '//evil.com/plan.html', '/\\evil.com', 'plan.html?x=1', 'a/b.html', 'javascript:alert(1)', 'plan.html#<x>',
                  'invite.html', 'start.html', 'index.html', 'arunak-library.html', 'plan', '..\\x.html', 'x.html#' + 'a'.repeat(80)]) eq(cleanReturn(no), '', no);
eq(cleanReturn(null), '', 'null');
if (bad) process.exit(1);
console.log('return-to: validator ok');
