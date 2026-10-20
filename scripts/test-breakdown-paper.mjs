/* The paper breakdown's derivations, in Node: node scripts/test-breakdown-paper.mjs
   (src/lib/breakdown-paper.js — what is marked on the page and what the
   sheet says; nothing about a mark is stored). */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';
void mem;
const M = await import('../src/lib/breakdown-paper.js');
const { ELEMENT_CATEGORIES } = await import('../src/lib/scenes.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} - got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

// every category is on the sheet exactly once, in the industry order
eq(M.SHEET_ORDER.slice().sort(), ELEMENT_CATEGORIES.map((c) => c.id).sort(), 'the sheet carries every category once');
eq(M.SHEET_ORDER.slice(0, 3), ['cast', 'stunts', 'extras'], 'people first on the sheet');
ok(ELEMENT_CATEGORIES.every((c) => /^el-/.test(c.hue)), 'every category reads an el-* hue (the colour code)');
const css = readFileSync(new URL('../src/styles/tokens.css', import.meta.url), 'utf8');
ok(ELEMENT_CATEGORIES.every((c) => css.includes('.hue-' + c.hue + ' {')), 'every category hue class exists in tokens.css');

const scene = { id: 's1', number: '4', intExt: 'INT', dayNight: 'NIGHT', location: 'Canteen', eighths: 12, pageNumber: '7', synopsis: 'Tea.',
  elements: { cast: ['Ravi', 'Meena'], props: ['Steel tumbler'], extras: ['Students (40)'] } };
const needles = M.needlesFor(scene, null);
eq(needles.map((n) => n.needle), ['Steel tumbler', 'Students', 'Meena', 'Ravi'], 'longest first, count stripped');

const segs = M.markText('Ravi lifts the steel tumbler; RAVIKUMAR watches the students.', needles);
eq(segs.filter((s) => s.cat).map((s) => [s.text, s.cat]), [['Ravi', 'cast'], ['steel tumbler', 'props'], ['students', 'extras']], 'case-folded matches on word edges');
ok(!segs.some((s) => s.cat && s.text === 'RAVIKUMAR'), 'no match inside a longer name');
eq(segs.map((s) => s.text).join(''), 'Ravi lifts the steel tumbler; RAVIKUMAR watches the students.', 'the runs rebuild the line exactly');
eq(M.markText('nothing here', needles), [{ text: 'nothing here' }], 'a line with no match is one run');
eq(M.markText('x', []), [{ text: 'x' }], 'no needles, one run');
const tamil = M.markText('மீனா enters with Meena', M.needlesFor({ elements: { cast: ['மீனா'] } }, null));
eq(tamil.filter((s) => s.cat).map((s) => s.text), ['மீனா'], 'a name in Tamil script is marked');

eq(M.cueTag(null, 'MEENA (V.O.)', needles) && M.cueTag(null, 'MEENA (V.O.)', needles).name, 'Meena', 'a cue is its cast tag');
eq(M.cueTag(null, 'STRANGER', needles), null, 'an untagged cue is not');

eq(M.cleanSelection('  “the  steel\ntumbler,”  '), 'the steel tumbler', 'selection folded and trimmed of punctuation');
eq(M.cleanSelection('...'), '', 'punctuation alone is nothing');
eq(M.cleanSelection('Students (40)'), 'Students (40)', 'a closing bracket survives');
eq(M.guessCategory('RAVI', 'action', ''), 'cast', 'capitals read as cast');
eq(M.guessCategory('tumbler', 'action', 'sound'), 'sound', 'otherwise the last category used');
eq(M.guessCategory('x', 'character', 'props'), 'cast', 'a cue is cast');
eq(M.taggedAs(scene, 'students'), 'extras', 'taggedAs ignores case and the count');
eq(M.taggedAs(scene, 'nobody'), '', 'taggedAs: not tagged');

const d = M.sheetData(scene, null, 2, 9);
eq([d.sheet, d.number, d.pages, d.page, d.heading, d.tagged], ['3 of 9', '4', '1 4/8', '7', 'INT. CANTEEN - NIGHT', 4], 'sheet header');
eq(d.boxes.length, ELEMENT_CATEGORIES.length, 'a box per category');
eq(d.boxes.find((b) => b.id === 'props').names, ['Steel tumbler'], 'box names');
ok(d.boxes.find((b) => b.id === 'wardrobe').mark === '◯', 'wardrobe carries its paper mark');

// against the Dragon sample: every scene row pairs with a slice, and a tag lights up
const dragon = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8'));
const els = dragon.elements || dragon.script?.elements || [];
const rows = [{ id: 'a', number: '1', intExt: 'INT', dayNight: 'DAY', location: 'School assembly hall, Ashok Nagar', elements: { extras: ['Students (180)'] } }];
const pairs = M.paperScenes(rows, els);
ok(pairs[0] && pairs[0].slice && /ASSEMBLY HALL/i.test(pairs[0].slice.heading), 'a row pairs with its script slice');
const lit = pairs[0].slice.elements.flatMap((e) => M.markText(e.text, M.needlesFor(rows[0], pairs[0].slice))).filter((s) => s.cat === 'extras');
ok(lit.length > 0, 'the tagged background lights up in its scene');
const withSug = M.needlesFor(rows[0], pairs[0].slice, { suggest: true });
ok(withSug.some((n) => n.kind === 'sug'), 'suggestions join the needles when asked');
ok(withSug.filter((n) => n.kind === 'tag').length === 1, 'and the tag stays a tag');

console.log(`breakdown-paper: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
