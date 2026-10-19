/* ============================================================
   TEST — screenplay → Word (.docx), in Node
   (src/lib/screenplay-docx.js over src/lib/zip-write.js).
   The CRC is the standard one; an INDEPENDENT reader (Python's
   zipfile, which checks every CRC) opens the archive; the parts Word
   needs are there; every element is a named-style paragraph at its
   indent; and the file comes back through our own importer with the
   same types and words, title page and Tamil included.
   ============================================================ */
import './node-seams.mjs';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

const Z = await import('../src/lib/zip-write.js');
const X = await import('../src/lib/screenplay-docx.js');
const D = await import('../src/lib/docx-text.js');
const I = await import('../src/lib/script-import.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

eq(Z.crc32(new TextEncoder().encode('123456789')).toString(16), 'cbf43926', 'CRC-32 is the standard one');

const el = (type, text, extra = {}) => ({ id: type + text.length, type, text, ...extra });
const doc = {
  elements: [
    el('scene', 'int. hostel room - night'),
    el('action', 'Arun stares at the board & the clock.'),
    el('character', 'arun'),
    el('paren', 'quietly'),
    el('dialogue', 'நான் முடிப்பேன். I will finish this.'),
    el('transition', 'cut to:'),
    el('scene', 'EXT. ROOF - DAWN'),
    el('shot', 'close on the kite'),
    el('action', '')
  ],
  titlePage: { title: 'Kite', credit: 'Written by', author: 'A. Writer', source: '', draft: 'First draft', date: '19 Oct 2026', contact: 'a@example.com' }
};
const bytes = X.toDOCX(doc, { title: 'Kite' });
ok(bytes instanceof Uint8Array && bytes.length > 1000, 'toDOCX returns the file\'s bytes');
eq(Array.from(X.toDOCX(doc, { title: 'Kite' })).length, bytes.length, 'the same script writes the same bytes');

// An independent reader: Python's zipfile checks every CRC.
const dir = mkdtempSync(join(tmpdir(), 'fms-docx-'));
const file = join(dir, 'kite.docx');
writeFileSync(file, bytes);
let names = [];
try {
  const out = execFileSync('python3', ['-I', '-c', 'import sys,zipfile\nz=zipfile.ZipFile(sys.argv[1])\nbad=z.testzip()\nprint("BAD" if bad else "OK")\nprint("\\n".join(z.namelist()))', file]).toString().trim().split('\n');
  ok(out[0] === 'OK', 'Python\'s zipfile opens it and every CRC checks');
  names = out.slice(1);
} catch (e) {
  ok(false, 'Python\'s zipfile could not open it: ' + e.message);
}
for (const part of ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels']) {
  ok(names.includes(part), 'the archive has ' + part);
}

// What Word will see.
const res = await D.extractDocxParagraphs(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length));
ok(!res.fatal, 'our reader opens it');
const paras = (res.paras || []).filter((p) => p.text.trim());
const body = paras.filter((p) => p.style !== 'Title Page' && p.style !== 'Normal');
eq(body.map((p) => p.style), ['Scene Heading', 'Action', 'Character', 'Parenthetical', 'Dialogue', 'Transition', 'Scene Heading', 'Shot'],
  'each element is a paragraph in its named style; an empty element writes nothing');
eq(body.map((p) => p.text).slice(0, 5), ['INT. HOSTEL ROOM - NIGHT', 'Arun stares at the board & the clock.', 'ARUN', '(quietly)', 'நான் முடிப்பேன். I will finish this.'],
  'the text is printed as on the page: capitals, brackets, entities and Tamil');
ok(paras.some((p) => p.text === 'KITE') && paras.some((p) => p.text === 'A. Writer'), 'the title page is there');
ok((res.paras || []).some((p) => p.pageBreak), 'the script starts on a new page after the title page');

// The style sheet sets the indents GEOMETRY gives (144 twips a character).
const zipText = new TextDecoder().decode(bytes);
ok(/w:styleId="Character"[\s\S]*?<w:ind w:left="3168"/.test(zipText), 'Character sits 22 characters in (3168 twips)');
ok(/w:styleId="Dialogue"[\s\S]*?<w:ind w:left="1440" w:right="2160"/.test(zipText), 'Dialogue sits 10 in, 35 wide');
ok(/w:styleId="Transition"[\s\S]*?<w:jc w:val="right"\/>/.test(zipText), 'a transition is right-aligned');
ok(/<w:pgMar [^>]*w:left="2160"/.test(zipText) && /<w:pgSz w:w="12240" w:h="15840"\/>/.test(zipText), 'US Letter with a 1.5in gutter');
ok(/w:rFonts w:ascii="Courier New"/.test(zipText), 'set in Courier New, which every machine with Word has');

// The round trip through our own importer.
const laid = I.docxScreenplayText(res.paras);
const back = I.parseScript(laid.text, 'kite.docx');
eq(back.elements.map((e) => e.type + ':' + e.text), [
  'scene:INT. HOSTEL ROOM - NIGHT', 'action:Arun stares at the board & the clock.', 'character:ARUN', 'paren:quietly',
  'dialogue:நான் முடிப்பேன். I will finish this.', 'transition:CUT TO:', 'scene:EXT. ROOF - DAWN', 'shot:CLOSE ON THE KITE'
], 'export → import gives back every element, by type, without the title page');

console.log((fail ? '✗' : '✓') + ' test-docx: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
