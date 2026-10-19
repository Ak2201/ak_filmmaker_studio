/* ============================================================
   TEST — every script file picker accepts what the importer reads.
   The pickers render before script-import.js (a lazy chunk) loads, so
   each carries its own `accept` literal; a literal that falls behind
   ACCEPT makes a format unpickable while it is still importable (the
   Breakdown's picker missed .docx for exactly this reason).
   ============================================================ */
import { readFileSync } from 'node:fs';
import './node-seams.mjs';
const { ACCEPT } = await import('../src/lib/script-import.js');

const PICKERS = ['src/ui/breakdown-overview.js', 'src/pages/write.js', 'src/pages/screenplay.js'];
const want = ACCEPT.split(',');
let pass = 0, fail = 0;
for (const f of PICKERS) {
  const src = readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const lits = [...src.matchAll(/accept:\s*'([^']*\.fountain[^']*)'/g)].map((m) => m[1].split(','));
  if (!lits.length) { fail++; console.error('  ✗', f, 'has no script picker literal'); continue; }
  for (const lit of lits) {
    const missing = want.filter((x) => !lit.includes(x));
    if (missing.length) { fail++; console.error('  ✗', f, 'accept is missing', missing.join(' ')); } else pass++;
  }
}
console.log((fail ? '✗' : '✓') + ' test-accept: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
