/* test:snippet — the palette's match-in-context (src/lib/text-snippet.js). */
import { snippetAround } from '../src/lib/text-snippet.js';
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (a === b) { pass++; console.log('  ✓ ' + m); } else { fail++; console.log('  ✗ ' + m + '\n      got ' + JSON.stringify(a) + '\n      want ' + JSON.stringify(b)); } };
const line = "The whole app's schedule, sides and budget are all derived from it.";
const at = line.indexOf('budget');
eq(snippetAround(line, at, 6), "…schedule, sides and budget are all derived from it.", 'a lead-in cut inside a word starts at the next word');
const long = 'Alpha beta budget gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi';
const s = snippetAround(long, long.indexOf('budget'), 6);
eq(s.endsWith('…'), true, 'a cut at the end is marked with an ellipsis: ' + s);
eq(/ [a-z]+…$/.test(s) && long.includes(s.slice(0, -1)) && long.split(' ').includes(s.slice(0, -1).split(' ').pop()), true, 'and ends on a whole word');
eq(snippetAround('Short budget line', 6, 6), 'Short budget line', 'a short line is whole, with no marks');
eq(snippetAround('budget', 0, 6), 'budget', 'a line that is the match');
console.log((fail ? '✗' : '✓') + ' snippet: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
