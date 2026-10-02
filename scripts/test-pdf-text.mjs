/* ============================================================
   PDF TEXT EXTRACTION — the regression test
   ------------------------------------------------------------
   src/lib/pdf-text.js has no library under it, so it has to earn
   trust some other way. This builds real PDFs — the fixtures are
   generated, not committed as binaries nobody can read a diff of
   — and asserts that a screenplay comes back out of each one with
   its COLUMNS intact, because the columns are the element types.

   It runs in Node with no browser and no dependencies:
   DecompressionStream is native. ~1s.

       node scripts/test-pdf-text.mjs      (or: npm run test:pdf)

   Two bugs were found by writing it, and both were the kind a
   hand-wave would have shipped:

   1. DecompressionStream throws on ANY trailing byte, and the PDF
      specification says the EOL before `endstream` is not part of
      the stream — so every writer emits one and nothing
      compressed decoded at all. That is every real PDF.
   2. A Type0 / Identity-H font takes two-byte codes. The first
      version of the fixture generator wrote one-byte literals
      under one, which made the extractor look wrong when it was
      correctly refusing a file no writer produces.

   The refusals are tested as carefully as the successes. A text
   extractor that half-works produces mojibake, and mojibake
   imported into somebody's script is worse than an import that
   declined — so "encrypted", "scanned" and "not a PDF" each have
   to come back with a sentence a person can act on.
   ============================================================ */
import { buildPDF, screenplayOps } from './pdf-fixtures/make-pdf.mjs';
import { extractLayoutText } from '../src/lib/pdf-text.js';

const SCRIPT = [
  ['action', 'FADE IN:'], ['blank'],
  ['action', 'INT. TEA STALL - DAY'], ['blank'],
  ['action', 'Steam off a kettle. RAVI, 30s, counts coins on the counter.'], ['blank'],
  ['character', 'RAVI'],
  ['paren', '(not looking up)'],
  ['dialogue', 'One more and I close.'], ['blank'],
  ['action', 'The door opens.'], ['blank'],
  ['character', 'MEENA'],
  ['dialogue', 'Then make it two.'], ['blank'],
  ['transition', 'CUT TO:'], ['blank'],
  ['action', 'EXT. BEACH ROAD - NIGHT'], ['blank'],
  ['action', 'Ravi walks. The sea is loud and invisible.']
];

let pass = 0, fail = 0;
const ok = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ok   ' + name); }
  else { fail++; console.log('  FAIL ' + name + (detail ? '\n       ' + detail : '')); }
};

async function run(label, pdf, expectFatal) {
  console.log('\n' + label);
  const r = await extractLayoutText(pdf.buffer.slice(pdf.byteOffset, pdf.byteOffset + pdf.byteLength));
  if (expectFatal) {
    ok('refused with a reason', !!r.fatal, 'got: ' + JSON.stringify(r.fatal));
    if (r.fatal) console.log('       → ' + r.fatal.slice(0, 96) + '…');
    return r;
  }
  ok('no fatal', !r.fatal, r.fatal || '');
  if (r.fatal) return r;
  const lines = r.text.split('\n').filter(l => l.trim());
  /* Match the WHOLE line, not a substring: "RAVI" also appears
     inside the action line above the cue, and a substring test
     silently measured that one instead. */
  const col = (needle) => { const l = lines.find(x => x.trim() === needle); return l ? l.match(/^ */)[0].length : -1; };
  const A = 'Steam off a kettle. RAVI, 30s, counts coins on the counter.';
  ok('slug at the margin (15)', col('INT. TEA STALL - DAY') === 15, 'got ' + col('INT. TEA STALL - DAY'));
  ok('action at the margin (15)', col(A) === 15, 'got ' + col(A));
  ok('dialogue at 25', col('One more and I close.') === 25, 'got ' + col('One more and I close.'));
  ok('parenthetical at 31', col('(not looking up)') === 31, 'got ' + col('(not looking up)'));
  ok('character cue at 37', col('RAVI') === 37, 'got ' + col('RAVI'));
  ok('long action line survived whole', r.text.includes(A), '');
  ok('closing line intact', r.text.includes('The sea is loud and invisible.'), '');
  ok('both scenes present',
    r.text.includes('INT. TEA STALL - DAY') && r.text.includes('EXT. BEACH ROAD - NIGHT'), '');
  return r;
}

const ops = [screenplayOps(SCRIPT)];
await run('1. uncompressed, simple font', buildPDF(ops));
await run('2. FlateDecode content stream', buildPDF(ops, { compress: true }));
await run('3. objects packed in an ObjStm (what macOS Quartz emits)', buildPDF(ops, { compress: true, objstm: true }));
await run('4. Type0 / Identity-H with a ToUnicode CMap',
  buildPDF([screenplayOps(SCRIPT, { twoByte: true })], { compress: true, toUnicode: true }));

console.log('\n5. three pages, in order');
const multi = await extractLayoutText((() => {
  const b = buildPDF([
    screenplayOps([['action', 'INT. ONE - DAY']]),
    screenplayOps([['action', 'INT. TWO - DAY']]),
    screenplayOps([['action', 'INT. THREE - DAY']])
  ], { compress: true });
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
})());
ok('no fatal', !multi.fatal, multi.fatal || '');
if (!multi.fatal) {
  const order = ['ONE', 'TWO', 'THREE'].map(n => multi.text.indexOf(n));
  ok('pages in document order', order[0] < order[1] && order[1] < order[2], JSON.stringify(order));
  ok('page count reported', multi.pages === 3, 'got ' + multi.pages);
  ok('form feed between pages', (multi.text.match(/\f/g) || []).length === 2, '');
}

await run('6. encrypted', buildPDF(ops, { encrypt: true }), true);
await run('7. a scan — no text at all', buildPDF(ops, { noText: true }), true);
await run('8. not a PDF', Buffer.from('this is a text file, not a pdf'), true);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
