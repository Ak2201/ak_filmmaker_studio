/* Screen time and cast matrix CSV builders, in Node: node scripts/test-cast-export.mjs */
import './node-seams.mjs';
const M = await import('../src/lib/reports-model.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} - got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
ok(typeof M.screenTimeCSV === 'function' && typeof M.castMatrixCSV === 'function', 'builders exported');
const s1 = { id: 'a', number: '1', intExt: 'INT', location: 'KITCHEN', dayNight: 'DAY' };
const s2 = { id: 'b', number: '2', intExt: 'EXT', location: 'ROAD', dayNight: 'NIGHT' };
const numbers = new Map([['a', '1'], ['b', '2A']]);
const st = { rows: [
  { scene: s1, heading: 'INT. KITCHEN - DAY', method: 'script', how: 'heading', seconds: 65, byPage: 60, dialogueWords: 12 },
  { scene: s2, heading: '', method: 'eighths', byPage: 30, seconds: 30, dialogueWords: 0 }
] };
const t = M.screenTimeCSV(st, numbers);
ok(t.startsWith('﻿Scene,Slug line,Estimate (seconds),By pages (seconds),Dialogue words,Read from\r\n'), 'screen time header with BOM');
ok(t.includes('\r\n1,INT. KITCHEN - DAY,65,60,12,script\r\n'), 'script row, seconds as numbers');
ok(t.includes('\r\n2A,') && t.includes(',30,30,,page count\r\n'), 'page-count row, blank words, scene number from the map');
ok(t.endsWith('\r\n'), 'ends with CRLF');
eq(M.screenTimeCSV({ rows: [] }, numbers), '﻿Scene,Slug line,Estimate (seconds),By pages (seconds),Dialogue words,Read from\r\n', 'empty is the header');
const cm = {
  characters: [{ name: 'Ravi, "R"', scenes: new Set(['a', 'b']) }, { name: '=SUM(1)', scenes: new Set(['b']) }],
  density: [{ scene: s1, count: 1 }, { scene: s2, count: 2 }]
};
const c = M.castMatrixCSV(cm, numbers);
ok(c.startsWith('﻿Character,Scenes,1,2A\r\n'), 'matrix header: scene numbers across');
ok(c.includes('\r\n"Ravi, ""R""",2,1,1\r\n'), 'quotes a comma and a quote');
ok(c.includes("\r\n'=SUM(1),1,,1\r\n"), 'formula guarded, blank where absent');
ok(c.endsWith('\r\nCast called,,1,2\r\n'), 'last row counts the cast called');
console.log(`cast-export: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
