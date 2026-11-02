/* ============================================================
   PAGINATE — src/lib/paginate.js in Node, no browser
   ------------------------------------------------------------
       node scripts/test-paginate.mjs   (or: npm run test:paginate)

   1. THE REFACTOR MOVED NOTHING. paginate() left screenplay-export.js
      for src/lib/paginate.js so the editor's live pages and the PDF
      share one pure function. The exports must be byte-identical to
      what they were before the move: GOLDEN below holds SHA-256s of
      the paginator's rows and of toText() over fixed fixtures, taken
      from the code BEFORE the move (commit 65be68a). A hash that
      changes is a page that moved for somebody, and is a failure
      unless the change to the format is deliberate — then recapture
      with `node scripts/test-paginate.mjs --capture` and say why.
   2. Break positions, (MORE) / (CONT'D) on a split speech.
   3. Automatic (CONT'D) for a returning speaker (Final Draft): only
      action between, same scene, display and export only — never in
      the element's text.
   ============================================================ */
import { mem } from './node-seams.mjs';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseHTML } from 'linkedom';
void mem;
/* buildDocument() builds DOM: a linkedom document stands in. */
const { document: linkDoc } = parseHTML('<!doctype html><html><body></body></html>');
globalThis.document = linkDoc;
globalThis.Node = linkDoc.defaultView ? linkDoc.defaultView.Node : class {};

const X = await import('../src/lib/screenplay-export.js');
const S = await import('../src/lib/script.js');
const { parseScript } = await import('../src/lib/script-import.js');
let P = null;
try { P = await import('../src/lib/paginate.js'); } catch (e) { /* before the move */ }

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const sha = (s) => createHash('sha256').update(s).digest('hex').slice(0, 24);

/* ---- the fixtures: deterministic ids, so the hashes are stable ---- */
const sampleRaw = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8')).elements;
const sample = sampleRaw.map((e, i) => ({ ...e, id: 's' + i }));

const perfLines = ['Title: Perf', '', 'FADE IN:', ''];
for (let n = 1; perfLines.length < 120 * 55; n++) {
  perfLines.push(`${n % 2 ? 'INT' : 'EXT'}. LOCATION ${n} - ${n % 3 ? 'DAY' : 'NIGHT'}`, '');
  perfLines.push('RAVI, 30s, crosses to the window. A police jeep waits below; his phone RINGS.', '');
  perfLines.push('RAVI', 'They found us. I told you they would. ' + 'And they will again, and again, and again. '.repeat(n % 7), '');
  perfLines.push('MEENA', '(quietly)', 'Then we leave now, before the siren.', '');
  perfLines.push('Meena grabs the bag and the certificate. They run for the auto.', '');
}
const perf = parseScript(perfLines.join('\n'), 'perf.fountain').elements.map((e, i) => ({ type: e.type, text: e.text, ...(e.dual ? { dual: true } : {}), id: 'p' + i }));

const lockedBase = { elements: sample, numbering: S.lockNumbering(sample) };
const lock = X.lockPages(lockedBase, '2026-10-19T10:00:00.000Z');
const lockedDoc = { elements: sample, numbering: { ...lockedBase.numbering, pages: lock } };
const p2 = X.pageStarts(X.paginateDoc(lockedDoc))[1];
const at = sample.findIndex((e) => e.id === p2.id) + 1;
const added = Array.from({ length: 40 }, (_, k) => ({ id: 'a' + k, type: 'action', text: 'An added line of action, long enough to take a few lines on the page, number ' + k + '.' }));
const grown = { ...lockedDoc, elements: [...sample.slice(0, at), ...added, ...sample.slice(at)] };

const FIX = {
  sample: { elements: sample },
  perf: { elements: perf },
  locked: lockedDoc,
  grown
};

function golden() {
  const out = {};
  for (const [k, doc] of Object.entries(FIX)) {
    const pages = X.paginateDoc(doc);
    out[k + '.rows'] = sha(JSON.stringify(pages));
    out[k + '.labels'] = sha(JSON.stringify(X.pageNumbersDoc(doc, pages)));
    out[k + '.text'] = sha(X.toText(doc, { title: 'Golden', author: 'A', date: '2026-10-19' }));
    out[k + '.pdf'] = sha(X.buildDocument(doc, { title: 'Golden', sceneNumbers: true }).outerHTML);
  }
  return out;
}

if (process.argv.includes('--capture')) {
  console.log(JSON.stringify(golden(), null, 2));
  process.exit(0);
}

/* Taken from the code before the move (65be68a), with autoContd off —
   which is what every caller that passes no option gets. RECAPTURED on
   fd/parity (2 Nov 2026), deliberately: keep-with-next (flushCarry in
   paginate.js) moves a slug line, shot, cue or parenthetical that was
   left alone at the foot of a page over with what follows it, as Final
   Draft does. The page labels did not change; section 6 below pins the
   rule itself. */
const GOLDEN = {
  "sample.rows": "d58e9294c9d44f864f647c3d",
  "sample.labels": "3dda03f08ae91ecc6fbbddaf",
  "sample.text": "efd0c95dc648da8b0b0e7768",
  "sample.pdf": "bf69b21044a5a895cc00ad9f",
  "perf.rows": "74a2dfe6504f4c0d93aa8478",
  "perf.labels": "7f3b0d91f607a68c5003fa88",
  "perf.text": "843a0024d0a98db85d99d839",
  "perf.pdf": "f99423aacfba5e340cc8bc46",
  "locked.rows": "d58e9294c9d44f864f647c3d",
  "locked.labels": "3dda03f08ae91ecc6fbbddaf",
  "locked.text": "efd0c95dc648da8b0b0e7768",
  "locked.pdf": "bf69b21044a5a895cc00ad9f",
  "grown.rows": "d4a2eb3d716dfdf437525a37",
  "grown.labels": "fe5d8c6b5634687423bea29e",
  "grown.text": "42cf83ad3c4fd09b244d5207",
  "grown.pdf": "57da54398783f8929ef1266c"
};

{
  const now = golden();
  for (const k of Object.keys(GOLDEN)) eq(now[k], GOLDEN[k], 'byte-identical after the move: ' + k);
}

ok(P && typeof P.paginate === 'function', 'src/lib/paginate.js exports paginate()');
ok(P && X.paginate === P.paginate && X.wrapText === P.wrapText && X.GEOMETRY === P.GEOMETRY,
  'screenplay-export.js re-exports the SAME functions (one paginator, not two)');
{
  const src = readFileSync(new URL('../src/lib/paginate.js', import.meta.url), 'utf8');
  ok(!/from '\.\/dom\.js'|document\.|localStorage/.test(src), 'paginate.js is pure: no DOM, no storage');
  const ex = readFileSync(new URL('../src/lib/screenplay-export.js', import.meta.url), 'utf8');
  ok(!/function paginate\(|const MIN_SPLIT|function wrapText/.test(ex), 'screenplay-export.js carries no second copy of the paginator');
}

/* ---- 2. break positions, (MORE) and (CONT'D) on a split speech ---- */
const E = (() => { let k = 0; return (type, text, extra) => ({ id: 'e' + (++k), type, text, ...(extra || {}) }); })();
const fill = (n) => Array.from({ length: n }, (_, i) => E('action', 'Line of action number ' + i + '.'));
{
  // 22 one-line actions: the first costs 1 line, each later one 2 (a blank above):
  // 43 of the 52 body lines, the cue makes 45, and a 12-line speech must break.
  const pre = fill(22);
  const words = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');
  const cue = E('character', 'RAVI');
  const dia = E('dialogue', words);
  const pages = P.paginate([...pre, cue, dia, E('action', 'After.')]);
  eq(pages.length, 2, 'a speech that does not fit spills onto a second page');
  const p0 = pages[0], p1 = pages[1];
  const last = p0[p0.length - 1];
  eq(last.type, 'more', 'the first page ends with the (MORE)');
  eq(last.lines, ['(MORE)'], '…which reads (MORE)');
  eq(p0[p0.length - 2].id, dia.id, 'and the speech\'s first piece is above it');
  eq(p1[0].type, 'character', 'the next page opens with a cue');
  ok(p1[0].contd === true, 'that cue is the paginator\'s own (contd), not an element');
  eq(p1[0].lines, ["RAVI (CONT'D)"], 'reading "RAVI (CONT\'D)"');
  ok(p1[1].id === dia.id && p1[1].cont === true, 'the rest of the speech follows, marked cont');
  const used = (rows) => rows.reduce((n, r, j) => n + (j ? r.blankBefore : 0) + r.lines.length, 0);
  ok(pages.every((rows) => used(rows) <= X.BODY_LINES), 'no page is taller than the body (' + pages.map(used).join(', ') + ' ≤ ' + X.BODY_LINES + ')');
  const pi = P.pageIndex(pages);
  eq(pi.get(dia.id).page, 0, 'pageIndex: a split speech is indexed by its first piece');
  eq(pi.get(pre[0].id), { page: 0, line: 0 }, 'pageIndex: the first element is at the top of page 1');
  eq(pi.get(pre[1].id).line, 2, 'pageIndex: the blank line above an action counts');
  const after = pages[1].find((r) => r.type === 'action');
  eq(pi.get(after.id).page, 1, 'pageIndex: an element on page 2 says page 2');

  // A typed (CONT'D) is not doubled by the one a break adds.
  const pages2 = P.paginate([...fill(22), E('character', "RAVI (CONT'D)"), E('dialogue', words)]);
  eq(pages2[1][0].lines, ["RAVI (CONT'D)"], 'a typed (CONT\'D) carries over once, not twice');

  // An action block breaks with no (MORE) and no cue.
  const big = E('action', Array.from({ length: 120 }, (_, i) => 'act' + i).join(' '));
  const pages3 = P.paginate([...fill(24), big]);
  ok(!pages3.flat().some((r) => r.type === 'more' || r.contd), 'a broken action block gets no (MORE) and no (CONT\'D)');
  ok(pages3[1][0].id === big.id && pages3[1][0].cont === true, 'its tail opens the next page');

  // A slug line is never the last thing on a page.
  const slug = E('scene', 'INT. HOUSE - DAY');
  const pages4 = P.paginate([...fill(25), slug, E('action', 'Something happens here.')]);
  ok(pages4[0][pages4[0].length - 1].id !== slug.id, 'a scene heading is not orphaned at the foot of a page');
}

/* ---- 3. the automatic (CONT'D) ---- */
{
  const s1 = [
    E('scene', 'INT. TEA STALL - DAY'),
    E('character', 'RAVI'), E('dialogue', 'One tea.'),
    E('action', 'He counts coins.'),
    E('character', 'RAVI'), E('dialogue', 'Make it two.'),                 // returns after action: CONT'D
    E('character', 'MEENA'), E('dialogue', 'Fine.'),
    E('character', 'RAVI'), E('dialogue', 'Good.'),                        // another speaker between: no
    E('action', 'Silence.'),
    E('character', "RAVI (CONT'D)"), E('dialogue', 'Typed.'),            // typed already: not doubled
    E('scene', 'EXT. ROAD - NIGHT'),
    E('character', 'RAVI'), E('dialogue', 'New scene.'),                   // a slug between: no
    E('transition', 'CUT TO:'),
    E('character', 'RAVI'), E('dialogue', 'After a cut.'),                 // a transition between: no
    E('action', 'He sits.'),
    E('character', 'RAVI (V.O.)'), E('dialogue', 'Still me.')            // extension kept, CONT'D after it
  ];
  const before = JSON.stringify(s1);
  const cues = (pages) => pages.flat().filter((r) => r.type === 'character' && !r.contd).map((r) => r.lines.join(' '));
  eq(cues(P.paginate(s1)), ['RAVI', 'RAVI', 'MEENA', 'RAVI', "RAVI (CONT'D)", 'RAVI', 'RAVI', 'RAVI (V.O.)'],
    'off (the default): every cue prints as typed');
  const on = P.paginate(s1, { autoContd: true });
  eq(cues(on), ['RAVI', "RAVI (CONT'D)", 'MEENA', 'RAVI', "RAVI (CONT'D)", 'RAVI', 'RAVI', "RAVI (V.O.) (CONT'D)"],
    'on: only a return after action, in the same scene, gets (CONT\'D) — once, after any extension');
  eq(on.flat().filter((r) => r.autoContd).map((r) => r.id), [s1[4].id, s1[20].id], 'the automatic rows are marked autoContd');
  ok(JSON.stringify(s1) === before, 'the elements are not touched — the mark is never written into their text');
  eq([...P.autoContdIndices(s1)], [4, 20], 'autoContdIndices agrees with the paginator');
  ok([...P.autoContdIndices(s1)].every((i) => S.contdOffer(s1, i)), 'and with the editor\'s "+ CONT\'D" offer (one rule)');

  // A dual pair's right cue is skipped.
  const dual = [E('scene', 'INT. A - DAY'), E('character', 'RAVI'), E('dialogue', 'Hi.'), E('action', 'Beat.'),
    E('character', 'RAVI'), E('dialogue', 'Me.'), E('character', 'MEENA', { dual: true }), E('dialogue', 'Her.')];
  ok(!P.autoContdIndices(dual).has(6), 'the right half of a dual pair takes no automatic (CONT\'D)');

  // Through the doc paths: toText and buildDocument with meta.autoContd.
  const doc = { elements: s1 };
  ok(X.toText(doc, { title: 'T', autoContd: true }).includes("RAVI (CONT'D)\n"), 'toText prints the automatic (CONT\'D) when asked');
  ok(!/RAVI \(CONT'D\)\n\s*Make it two/.test(X.toText(doc, { title: 'T' })), 'and not when not');
  const html = X.buildDocument(doc, { title: 'T', autoContd: true }).outerHTML;
  ok((html.match(/CONT'D/g) || []).length === 3, 'the PDF document carries the two automatic marks and the typed one');
  ok(X.paginateDoc(doc, { autoContd: true }).flat().some((r) => r.autoContd), 'paginateDoc passes the option through');

  // A split speech by a returning speaker carries one (CONT'D), not two.
  const words = Array.from({ length: 60 }, (_, i) => 'word' + i).join(' ');
  const sp = [...fill(18), E('character', 'RAVI'), E('dialogue', 'First.'), E('action', 'Beat.'), E('character', 'RAVI'), E('dialogue', words)];
  const pg = P.paginate(sp, { autoContd: true });
  const top = pg[1].find((r) => r.contd);
  eq(top && top.lines, ["RAVI (CONT'D)"], 'a returning speaker whose speech breaks carries over as one (CONT\'D)');
}

/* ---- 4. the caret on real pages (src/lib/caret-position.js) ---- */
{
  const CP = await import('../src/lib/caret-position.js');
  const els = sample.slice(0, 400);
  const pages = X.paginate(els);
  const labels = X.pageNumbersDoc({ elements: els }, pages);
  const index = P.pageIndex(pages);
  const target = pages[3].find((r) => r.id && !r.cont);
  const pos = CP.caretPosition(els, target.id, { index, labels });
  eq(pos.page, 4, 'the caret strip names the PDF\'s page for a line on sheet 4');
  eq(CP.formatCaretPage(pos).startsWith('p. 4'), true, 'formatted "p. 4…"');
  const fresh = [...els.slice(0, 50), { id: 'new1', type: 'action', text: 'Just typed.' }, ...els.slice(50)];
  const pf = CP.caretPosition(fresh, 'new1', { index, labels });
  eq(pf.page, index.get(els[49].id).page + 1, 'a line not yet paginated takes the page of the nearest line above it');
  const est = CP.caretPosition(els, target.id);
  ok(est && est.pageLabel === '', 'without pages the old estimate stands (no label)');
  eq(CP.caretPosition(els, target.id, { index, labels: labels.map((l, i) => (i === 3 ? '3A' : l)) }).pageLabel, '3A',
    'a locked page label (3A) is what the strip prints');
}

/* ---- 5. cost: never per keystroke, but cheap enough at idle ---- */
{
  const t = performance.now();
  for (let k = 0; k < 5; k++) { const pg = P.paginate(perf, { autoContd: true }); P.pageIndex(pg); }
  const ms = (performance.now() - t) / 5;
  ok(ms < 80, `paginate + pageIndex with automatic (CONT'D) on the 120-page script in ${ms.toFixed(1)}ms (budget 80ms, run at idle)`);
  const pages = X.paginate(perf);
  ok(pages.length >= 110, `the perf fixture is about 120 sheets (got ${pages.length})`);
}

/* ---- 6. keep with next: no slug line or cue alone at a page foot ---- */
{
  const keep = new Set(['scene', 'shot', 'character', 'paren']);
  const height = (pg) => pg.reduce((n, r, j) => n + (j ? r.blankBefore || 0 : 0) + r.lines.length, 0);
  for (const [name, els] of [['sample', sample], ['perf', perf]]) {
    const pages = X.paginate(els);
    const orphans = pages.slice(0, -1).map((pg, i) => [i + 1, pg[pg.length - 1]]).filter(([, r]) => keep.has(r.type) && !r.omitted);
    eq(orphans.map(([n, r]) => n + ':' + r.type), [], `${name}: no page ends in a slug line, shot, cue or parenthetical`);
    const cueless = pages.map((pg, i) => [i + 1, pg[0]]).filter(([, r]) => (r.type === 'dialogue' || r.type === 'paren') && !r.cont);
    eq(cueless.map(([n]) => n), [], `${name}: no page opens on a speech without its cue`);
    eq(pages.filter((pg) => height(pg) > X.BODY_LINES).length, 0, `${name}: carrying never overfills a page`);
  }
  // The finding's case: a cue on the last free lines, a short speech that cannot split there.
  const els = [...fill(25), E('character', 'RAGAVAN'), E('dialogue', 'Rendu. Moonu. Naalu. Anju. Aaru. Ezhu. Ettu. Onbadhu. Pathu. Pathinonnu.')];
  const pages = X.paginate(els);
  const p2 = pages[1] || [];
  ok(pages[0][pages[0].length - 1].type === 'action' && p2[0] && p2[0].type === 'character' && p2[0].blankBefore === 0 && p2[1].type === 'dialogue',
    'a cue whose one-line speech moves goes with it, at the top of the next page');
  const els2 = [...fill(24), E('scene', 'EXT. COLLEGE - DAY'), E('action', 'Two lines of action that wrap past the sixty character measure of the page.')];
  const q = X.paginate(els2);
  ok(q[0][q[0].length - 1].type === 'action' && q[1][0].type === 'scene' && q[1][1].type === 'action',
    'a slug line whose short action moves goes with it');
}

console.log(`${fail ? '✗' : '✓'} paginate: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
