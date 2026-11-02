/* TEST — the centered / lyrics / act element types (L3), in Node:
   model, Fountain and FDX round trips, the text and PDF layout, the Word
   styles, the new-page-before-an-act rule and the page count.
       node scripts/test-elements.mjs   (npm run test:elements) */
import './node-seams.mjs';
const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;
const S = await import('../src/lib/script.js');
const X = await import('../src/lib/screenplay-export.js');
const F = await import('../src/lib/screenplay-fdx.js');
const D = await import('../src/lib/screenplay-docx.js');
const { parseScript } = await import('../src/lib/script-import.js');
const K = await import('../src/lib/write-keys.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
let n = 0;
const el = (type, text) => S.blankElement({ id: 'x' + (++n), type, text });
const shape = (els) => els.filter((e) => e.text.trim()).map((e) => [e.type, e.text]);

/* ---- the model ---------------------------------------------------- */
for (const t of ['centered', 'lyrics', 'act']) {
  ok(S.ELEMENT_TYPE_IDS.includes(t), t + ' is an element type');
  eq(S.blankElement({ type: t }).type, t, t + ' survives blankElement');
}
eq(S.NEXT_TYPE.act, 'scene', 'Return after an act gives a scene heading');
eq(S.blankElement({ type: 'bogus' }).type, 'action', 'unknown types still become action');
eq(K.returnNext('lyrics', {}, S.ELEMENT_TYPE_IDS), 'action', 'preset: Return after lyrics');
ok(Object.values(K.digitMap('finaldraft', S.ELEMENT_TYPE_IDS)).includes('lyrics'), 'Alt+digit reaches lyrics');
ok(Object.values(K.digitMap('finaldraft', S.ELEMENT_TYPE_IDS)).includes('centered'), 'Alt+digit reaches centered');
ok(K.cycleOrder('finaldraft', S.ELEMENT_TYPE_IDS).includes('act'), 'the type cycle reaches act');
ok(X.geometryOf('lyrics').italic === true && X.geometryOf('act').underline === true, 'geometry for the new types');
eq(S.elementLines(el('lyrics', 'x'.repeat(70))), 1 + 2, 'lyrics wrap at the dialogue measure');

const doc = { elements: [
  el('scene', 'INT. HALL - DAY'),
  el('centered', 'ONE WEEK LATER'),
  el('action', 'He sings.'),
  el('lyrics', 'Row, row, row your boat\nGently down the stream'),
  el('act', 'END OF ACT ONE'),
  el('act', 'ACT TWO'),
  el('scene', 'EXT. ROAD - NIGHT'),
  el('action', 'Rain.')
] };

/* ---- Fountain round trip ------------------------------------------ */
const fn = S.toFountain(doc, { title: 'T' });
ok(/^> ONE WEEK LATER <$/m.test(fn), 'fountain: >centered<');
ok(/^~Row, row, row your boat\n~Gently down the stream$/m.test(fn), 'fountain: ~lyrics per line');
ok(/^END OF ACT ONE$/m.test(fn) && /^ACT TWO$/m.test(fn), 'fountain: act lines plain');
eq(shape(parseScript(fn, 'a.fountain').elements), shape(doc.elements), 'fountain round trip keeps every type and word');
eq(parseScript('INT. A - DAY\n\n>THE END<\n', 'a.fountain').elements.map((e) => e.type), ['scene', 'centered'], 'fountain: >x< is centered, not action');
eq(parseScript('Act one of the play starts.\n', 'a.fountain').elements[0].type, 'action', 'fountain: a sentence about acts is action');
const odd = S.toFountain({ elements: [el('act', 'INTERMISSION')] }, {});
eq(parseScript(odd, 'a.fountain').elements.map((e) => [e.type, e.text]), [['centered', 'INTERMISSION']], 'fountain: an unusual act line goes out centered');

/* ---- FDX round trip ------------------------------------------------ */
const fdx = F.toFDX(doc, { title: 'T' });
ok(/<Paragraph[^>]*Type="General"[^>]*>/.test(fdx) && /Alignment="Center"/.test(fdx), 'fdx: centered is General, Center');
ok(/Type="Lyrics"/.test(fdx), 'fdx: Lyrics');
ok(/Type="End of Act"/.test(fdx) && /<Paragraph[^>]*Type="New Act"[^>]*StartsNewPage="Yes"/.test(fdx), 'fdx: End of Act / New Act, a new act starts a page');
eq(shape(parseScript(fdx, 'a.fdx').elements), shape(doc.elements), 'fdx round trip keeps every type and word');

/* ---- layout: text, pages, Word --------------------------------------- */
const txt = X.toText(doc, { title: 'T' });
const line = (w) => txt.split('\n').find((l) => l.includes(w));
eq(line('ONE WEEK LATER').indexOf('O'), Math.floor((60 - 'ONE WEEK LATER'.length) / 2), 'text: centered sits on the middle of the measure');
eq(line('Row, row').indexOf('R'), 10, 'text: lyrics sit at dialogue indent');
const pages = X.paginateDoc(doc);
const actPage = pages.findIndex((p) => p.some((r) => r.type === 'act' && r.lines[0] === 'ACT TWO'));
ok(actPage > 0 && pages[actPage][0].type === 'act', 'pdf: ACT TWO opens a new page');
ok(pages[actPage - 1].some((r) => r.lines[0] === 'END OF ACT ONE'), 'pdf: END OF ACT ONE stays on the page it closes');
eq(pages[actPage][0].blankBefore, 0, 'pdf: no gap above the first row of a page');
const docx = Buffer.from(D.toDOCX(doc, {})).toString('latin1');
ok(docx.includes('w:val="Lyrics"') && docx.includes('w:val="Centered"') && docx.includes('w:val="NewAct"'), 'docx: styles named');
ok(docx.includes('<w:pageBreakBefore/>'), 'docx: a new act starts a page');
ok(S.pageCount(doc.elements) > 0, 'page count handles the new types');
eq(S.sceneNumbers(doc.elements).byId.size, 2, 'only the two scene headings take numbers');

console.log((fail ? '✗' : '✓') + ' new element types: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
