/* ============================================================
   TEST — screenplay → Final Draft (.fdx), in Node
   (src/lib/screenplay-fdx.js, read back by src/lib/script-import.js).

       node scripts/test-fdx.mjs   (or: npm run test:fdx)

   Every element type, Tamil, dual dialogue, the title page, locked
   scene numbers and locked pages, revision marks and the layout blocks
   Final Draft writes. Every file is checked twice for well-formedness:
   by the importer's own parser (linkedom, as the other import tests
   use) and by an INDEPENDENT strict XML parser (Python's expat), since
   linkedom forgives what Final Draft will not.
   ============================================================ */
import './node-seams.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';

const { DOMParser } = await import('linkedom');
globalThis.DOMParser = DOMParser;

const F = await import('../src/lib/screenplay-fdx.js');
const S = await import('../src/lib/script.js');
const X = await import('../src/lib/screenplay-export.js');
const { parseScript } = await import('../src/lib/script-import.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

/* Strict well-formedness, outside linkedom. Python's expat refuses
   an unescaped ampersand, a control character, a bad nesting. */
let strictAvailable = true;
function strictXml(xml, label) {
  if (!strictAvailable) return;
  try {
    execFileSync('python3', ['-c', 'import sys, xml.dom.minidom as m; m.parseString(sys.stdin.buffer.read())'], { input: Buffer.from(xml, 'utf8'), stdio: ['pipe', 'ignore', 'pipe'] });
    ok(true, label);
  } catch (e) {
    if (e.code === 'ENOENT') { strictAvailable = false; console.log('  (python3 not found: the strict XML check is skipped)'); return; }
    ok(false, label + ' — ' + String(e.stderr || e.message).trim().split('\n').pop());
  }
}

let n = 0;
const el = (type, text, extra = {}) => ({ id: 'e' + (++n), type, text, ...extra });
const shape = (els) => els.map((e) => [e.type, e.text, !!e.dual]);
const printed = (els) => els.filter((e) => String(e.text ?? '').trim());

/* ---- every element type, Tamil, dual dialogue -------------------- */
const elements = [
  el('transition', 'FADE IN:'),
  el('scene', 'INT. HOSTEL ROOM - NIGHT'),
  el('action', 'Arun stares at the board & the clock. <Nothing> moves. "Again," he says.'),
  el('character', 'ARUN (V.O.)'),
  el('paren', 'quietly'),
  el('dialogue', 'நான் முடிப்பேன். I will finish this.'),
  el('action', ''),                                  // a blank line prints nothing
  el('shot', 'CLOSE ON the kite'),
  el('character', 'MEENA'),
  el('dialogue', 'இப்போ இல்லை.'),
  el('character', 'RAVI', { dual: true }),
  el('paren', 'over her'),
  el('dialogue', 'Now. Right now.'),
  el('action', 'They both stop.'),
  el('transition', 'CUT TO:'),
  el('scene', 'EXT. ROOF - DAWN'),
  el('action', "A line with a vertical\u000Btab and a form\u000Cfeed in it, and Meena's apostrophe."),
  el('character', "MEENA (CONT'D)"),
  el('dialogue', 'Line one\nline two.')
];
const titlePage = { title: 'Kite', credit: 'Written by', author: 'A. Writer', source: 'Based on a story by K. Teller',
  draft: 'First Draft', date: '21 Oct 2026', contact: 'a@example.com\n+91 98400 00000' };
const doc = { elements, titlePage };
const fdx = F.toFDX(doc, { title: 'Ignored when the title page has one' });

strictXml(fdx, 'the full document is well-formed XML');
ok(fdx.startsWith('<?xml version="1.0" encoding="UTF-8"'), 'declares UTF-8');
ok(/<FinalDraft DocumentType="Script" Template="No" Version="5">/.test(fdx), 'the FinalDraft root');
ok(fdx.includes('நான் முடிப்பேன்'), 'Tamil is written as characters, not mangled');
ok(!/[\u000B\u000C]/.test(fdx), 'XML-illegal control characters are stripped');
ok(fdx.includes('&amp; the clock. &lt;Nothing&gt;') && fdx.includes('&quot;Again,&quot;'), 'markup characters are escaped');
ok(/<Paragraph Type="Parenthetical"><Text>\(quietly\)<\/Text>/.test(fdx), 'a parenthetical wears its brackets in the file');
ok(fdx.includes('<Text>Arun stares'), 'text is written as typed (capitals come from the element settings)');

const back = parseScript(fdx, 'kite.fdx');
ok(!back.fatal, 'the importer accepts it');
eq(back.format, 'fdx', 'detected as Final Draft');
const want = printed(elements).map((e) => ({ ...e, text: e.text.replace(/[\u000B\u000C]/g, '') }));
eq(shape(back.elements), shape(want), 'export → import keeps every element type, its text and the dual flag');
eq(back.skipped.dual, 1, 'one dual-dialogue pair comes back as one');
eq(back.skipped.unknown, 0, 'no paragraph of an unknown kind');
ok(!back.elements.some((e) => /KITE|Written by|a@example\.com/.test(e.text)), 'the title page does not leak into the script');
ok(!back.elements.some((e) => e.text === '.'), 'the header page number does not leak into the script');
ok(back.titlePage && back.titlePage.title === 'KITE' && back.titlePage.author === 'A. Writer'
  && back.titlePage.credit === 'Written by' && back.titlePage.source === titlePage.source
  && back.titlePage.draft === 'First Draft' && back.titlePage.contact === titlePage.contact,
  'the title page round-trips: ' + JSON.stringify(back.titlePage));

/* A second pass changes nothing: export(import(export(x))) === export(import(x)). */
const again = F.toFDX({ elements: back.elements, titlePage: back.titlePage }, {});
const back2 = parseScript(again, 'kite.fdx');
eq(shape(back2.elements), shape(back.elements), 'a second round trip is stable (nothing grows, nothing is lost)');

/* ---- the dual-dialogue structure Final Draft writes -------------- */
const dd = fdx.match(/<Paragraph>\s*<DualDialogue>([\s\S]*?)<\/DualDialogue>\s*<\/Paragraph>/);
ok(!!dd, 'a pair is one <Paragraph> holding a <DualDialogue>');
eq(dd ? (dd[1].match(/Type="Character"/g) || []).length : 0, 2, 'both cues are inside the pair');
ok(dd && dd[1].includes('இப்போ இல்லை') && dd[1].includes('Now. Right now.'), 'both speeches are inside the pair');

/* ---- layout: US Letter, standard margins, element settings ------- */
ok(/<PageSize Height="11\.00" Width="8\.50"\/>/.test(fdx), 'US Letter page size');
ok(/<PageLayout[^>]*TopMargin="72"[^>]*>/.test(fdx) && /BottomMargin="72"/.test(fdx), '1in top and bottom margins');
for (const [type, left, right] of [['Scene Heading', '1.50', '7.50'], ['Action', '1.50', '7.50'],
  ['Character', '3.70', '7.50'], ['Parenthetical', '3.10', '5.90'], ['Dialogue', '2.50', '6.00'], ['Transition', '1.50', '7.50'], ['Shot', '1.50', '7.50']]) {
  const block = (fdx.match(new RegExp('<ElementSettings Type="' + type + '">([\\s\\S]*?)</ElementSettings>')) || [])[1] || '';
  ok(block.includes('LeftIndent="' + left + '"') && block.includes('RightIndent="' + right + '"'), type + ' at ' + left + '–' + right + 'in, as the PDF paints it');
}
ok(/<ElementSettings Type="Transition">[\s\S]*?Alignment="Right"/.test(fdx), 'a transition is right-aligned');
ok(/<ElementSettings Type="Scene Heading">[\s\S]*?Style="AllCaps"/.test(fdx), 'a scene heading is set in capitals');
ok(/<ElementSettings Type="Character">[\s\S]*?ReturnKey="Dialogue"/.test(fdx), 'Return after a cue gives dialogue, as in the editor');
ok(/<HeaderAndFooter[^>]*HeaderFirstPage="No"[^>]*HeaderVisible="Yes"[\s\S]*?<DynamicLabel Type="Page #"\/>/.test(fdx), 'page numbers in the header, not on page 1');

/* ---- SmartType ---------------------------------------------------- */
const st = F.smartTypeLists(elements);
eq(st.characters, ['ARUN', 'MEENA', 'RAVI'], 'SmartType characters are the speakers, without extensions');
ok(st.extensions.includes('(V.O.)') && st.extensions.includes("(CONT'D)"), 'SmartType extensions');
eq(st.locations, ['HOSTEL ROOM', 'ROOF'], 'SmartType locations from the headings');
ok(st.times.includes('NIGHT') && st.times.includes('DAWN'), 'SmartType times, the script\'s own included');
ok(st.intros.includes('INT. ') && st.intros.includes('EXT. '), 'SmartType scene intros');
ok(st.transitions.includes('CUT TO:') && st.transitions.includes('FADE IN:'), 'SmartType transitions');
ok(/<SmartType>[\s\S]*<Character>MEENA<\/Character>[\s\S]*<\/SmartType>/.test(fdx), 'SmartType is written into the file');
ok(/<SceneIntros Separator="\. ">/.test(fdx) && /<Times Separator=" - ">/.test(fdx), 'SmartType separators');

/* ---- no title page: the plain one --------------------------------- */
const plain = F.toFDX({ elements: elements.slice(0, 6) }, { title: 'Untitled Kite', author: 'B. Writer' });
strictXml(plain, 'a script without a title page is well-formed');
const plainBack = parseScript(plain, 'x.fdx');
ok(plainBack.titlePage && plainBack.titlePage.title === 'UNTITLED KITE' && plainBack.titlePage.author === 'B. Writer', 'with no title page, the project title and meta.author make one');
eq(shape(plainBack.elements), shape(printed(elements.slice(0, 6))), 'and the script is unchanged');

/* ---- scene numbers ------------------------------------------------ */
ok(!/Type="Scene Heading" Number=/.test(fdx), 'an UNLOCKED script writes no scene numbers (writing one would freeze it)');
eq(back.elements.filter((e) => e.type === 'scene').map((e) => e.sceneNumber || ''), ['', ''], 'and none come back');

const numbered = [
  el('scene', 'INT. A - DAY'), el('action', 'One.'),
  el('scene', 'INT. B - DAY'), el('action', 'Two.'),
  el('scene', 'INT. C - NIGHT'), el('action', 'Three.')
];
const locked = { elements: numbered, numbering: S.lockNumbering(numbered) };
// Insert a scene between 1 and 2, delete scene 3: 1, 1A, 2 and 3 OMITTED.
const inserted = el('scene', 'EXT. A YARD - DAY');
const lockedEls = [numbered[0], numbered[1], inserted, el('action', 'Inserted.'), numbered[2], numbered[3]];
const lockedDoc = { elements: lockedEls, numbering: locked.numbering };
const lfdx = F.toFDX(lockedDoc, { title: 'Numbers' });
strictXml(lfdx, 'a locked script is well-formed');
eq([...lfdx.matchAll(/Type="Scene Heading" Number="([^"]+)"/g)].map((m) => m[1]), ['1', '1A', '2'], 'locked numbers travel as Final Draft\'s Number attribute, an insert as 1A');
ok(!/OMITTED/.test(lfdx), 'an omitted scene writes no OMITTED heading (it would import as a scene)');
const lback = parseScript(lfdx, 'n.fdx');
eq(lback.elements.filter((e) => e.type === 'scene').map((e) => e.sceneNumber), ['1', '1A', '2'], 'the importer reads the locked numbers back');
eq(lback.scenes.map((r) => r.number), ['1', '1A', '2'], 'and the scene rows keep them');

/* ---- locked pages -------------------------------------------------- */
const sample = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8')).elements
  .map((e, i) => ({ id: 's' + i, type: e.type, text: e.text, ...(e.dual ? { dual: true } : {}) }));
const longDoc = { elements: sample, numbering: S.lockNumbering(sample) };
const unlockedPages = F.toFDX(longDoc, {});
ok(!/StartsNewPage="Yes"/.test(unlockedPages), 'locked scenes without locked pages force no page breaks');
longDoc.numbering.pages = X.lockPages(longDoc);
const starts = X.pageStarts(X.paginateDoc(longDoc)).slice(1).filter((s) => s.id && !s.split).map((s) => s.id);
ok(starts.length > 3, 'the sample runs to several locked pages (' + (starts.length + 1) + ')');
const pfdx = F.toFDX(longDoc, {});
strictXml(pfdx, 'a page-locked script is well-formed');
const forced = (pfdx.match(/StartsNewPage="Yes"/g) || []).length;
const firstOf = new Set(sample.map((e) => e.id));
ok(forced > 0 && forced <= starts.length, 'each locked page that opens on a whole element starts a new page in the file (' + forced + ' of ' + starts.length + ')');
ok(starts.every((id) => firstOf.has(id)), 'every locked start names an element of the script');
const pback = parseScript(pfdx, 'p.fdx');
/* The sample stores a few parentheticals WITH their brackets; the
   model's convention (and the importer's) is without, so compare that. */
const bare = (els) => els.map((e) => (e.type === 'paren' ? { ...e, text: e.text.replace(/^\(+\s*|\s*\)+$/g, '').trim() } : e));
eq(shape(pback.elements), shape(bare(printed(sample))), 'the Dragon sample round-trips whole through .fdx');

/* ---- revision marks ------------------------------------------------ */
const changed = [elements[2].id, elements[11].id];
const rfdx = F.toFDX(doc, { marks: { ids: new Set(changed), name: 'Blue' } });
strictXml(rfdx, 'a marked script is well-formed');
eq((rfdx.match(/<Text RevisionID="1">/g) || []).length, 2, 'each changed paragraph carries the revision set');
ok(/<Revisions ActiveSet="1"[^>]*>\s*<Revision FullRevision="No" ID="1" Mark="\*" Name="Blue"\/>/.test(rfdx), 'the set is declared, with its asterisk and its colour name');
ok(!/RevisionID|<Revisions/.test(fdx), 'without marks, no revision is claimed');
eq(shape(parseScript(rfdx, 'r.fdx').elements), shape(back.elements), 'marks do not change what comes back');

/* ---- ScriptNote stays out of the script (QA r4) ------------------- */
{
  const noteFdx = '<?xml version="1.0" encoding="UTF-8"?><FinalDraft DocumentType="Script" Template="No" Version="5"><Content>'
    + '<Paragraph Type="Scene Heading"><Text>INT. ROOM - DAY</Text></Paragraph>'
    + '<Paragraph Type="Action"><Text>Line with</Text><Text> runs</Text><ScriptNote ID="1"><Paragraph><Text>a note</Text></Paragraph></ScriptNote></Paragraph>'
    + '<Paragraph Type="Action"><ScriptNote ID="2"><Paragraph><Text>only a note</Text></Paragraph></ScriptNote></Paragraph>'
    + '</Content></FinalDraft>';
  const r = parseScript(noteFdx, 'n.fdx');
  eq(r.elements.map((e) => e.text), ['INT. ROOM - DAY', 'Line with runs'], 'a ScriptNote is not read into the line, and a note-only paragraph is no line');
  ok(r.warnings.some((w) => /2 Final Draft script note/.test(w)), 'the preview says the notes were left out — got ' + JSON.stringify(r.warnings));
}

/* ---- one writer, loaded at the press ------------------------------- */
ok(!('toFDX' in S), 'script.js no longer carries a second .fdx writer');
const srcFiles = [];
(function walk(dir) {
  for (const f of readdirSync(dir)) {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) walk(p);
    else if (p.endsWith('.js')) srcFiles.push(p);
  }
})(new URL('../src', import.meta.url).pathname);
const staticImporters = srcFiles.filter((p) => /^\s*import[^;(]*from\s*['"][^'"]*screenplay-fdx\.js['"]/m.test(readFileSync(p, 'utf8')));
eq(staticImporters, [], 'nothing imports screenplay-fdx.js statically (it is loaded at the press)');
const lazy = srcFiles.filter((p) => /import\(\s*['"][^'"]*screenplay-fdx\.js['"]\s*\)/.test(readFileSync(p, 'utf8'))).map((p) => p.split('/src/')[1]).sort();
eq(lazy, ['pages/screenplay.js', 'pages/write.js'], 'the Screenplay Writer and the Write page both offer it');

console.log((fail ? '✗' : '✓') + ' fdx export: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
