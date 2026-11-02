/* ============================================================
   TEST — production features of the Screenplay Writer, in Node:
     · revision mode's change marks (src/lib/script-production.js)
     · A-scenes and A-pages under a lock (script.js, screenplay-export.js)
     · fit to page arithmetic (src/lib/fit-page.js, paginate's bodyLines)
     · the writer's scene / location / character reports
   node scripts/test-production.mjs   (npm run test:production)
   ============================================================ */
import { mem } from './node-seams.mjs';
void mem;

const Script = await import('../src/lib/script.js');
const X = await import('../src/lib/screenplay-export.js');
const F = await import('../src/lib/fit-page.js');
const P = await import('../src/lib/script-production.js');
const L = await import('../src/lib/script-lock.js');
const { blankElement } = Script;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const el = (type, text, id) => blankElement({ type, text, ...(id ? { id } : {}) });

const script = () => ({
  elements: [
    el('scene', 'INT. KITCHEN - DAY', 'h1'), el('action', 'Ravi cooks.', 'a1'),
    el('character', 'RAVI', 'c1'), el('dialogue', 'Where is the salt?', 'd1'),
    el('scene', 'EXT. STREET - NIGHT', 'h2'), el('action', 'Rain falls.', 'a2'),
    el('character', 'MEENA (O.S.)', 'c2'), el('dialogue', 'Come inside.', 'd2'),
    el('scene', 'INT. KITCHEN - NIGHT', 'h3'), el('action', 'Phones ring.', 'a3'),
    el('character', 'RAVI', 'c3'), el('dialogue', 'Hello?', 'd3')
  ],
  revisions: [], documents: []
});

/* ---- 1. revision marks ------------------------------------------ */
{
  const d = script();
  eq(P.revisionMarks(d), null, 'no lock: no marks');
  d.numbering = Script.lockNumbering(d.elements, null);
  eq(P.revisionMarks(d), null, 'a legacy lock (no base) is not held: no marks');

  const d2 = script();
  L.takeLock(d2, []);
  ok(Script.isHeld(d2.numbering), 'takeLock holds the script');
  const m0 = P.revisionMarks(d2, '2026-11-02T10:00:00.000Z');
  ok(m0 && m0.ids.size === 0, 'held, unchanged: no marked line');
  eq(m0.colour.name, 'White', 'unchanged: the colour is the locked draft\'s own (White)');

  d2.elements[3] = { ...d2.elements[3], text: 'Where is the pepper?' };   // d1 changed
  d2.elements.splice(6, 0, el('action', 'Thunder.', 'new1'));             // added
  const m1 = P.revisionMarks(d2, '2026-11-02T10:00:00.000Z');
  ok(m1.ids.has('d1'), 'a changed line is marked');
  ok(m1.ids.has('new1'), 'an added line is marked');
  ok(!m1.ids.has('a1') && !m1.ids.has('h2'), 'an untouched line is not');
  eq(m1.colour.name, 'Blue', 'changes since the lock are the NEXT colour: Blue');
  eq(m1.header, 'Blue Revision · 2 Nov 2026', 'the PDF header names the colour and the date');

  // a deletion marks the line that now stands in its place
  const d3 = script();
  L.takeLock(d3, []);
  d3.elements.splice(1, 1);   // a1 gone
  const m3 = P.revisionMarks(d3);
  ok(m3.ids.has('c1'), 'a removed line marks the next printed line');

  // issuing the revision as a draft keeps its colour and takes its date
  const D = await import('../src/lib/drafts.js');
  const issued = D.saveNewDraft(d2, { note: 'Blue pages' });
  ok(!!issued, 'a draft can be issued after the lock');
  const m2 = P.revisionMarks(d2);
  eq(m2.colour.name, 'Blue', 'the issued draft is this issue: still Blue');
  ok(m2.ids.has('d1'), 'and the marks are still against the locked script');

  // the PDF prints the asterisk and the header on the revised page only
  const node = { ids: m1.ids, label: m1.header, swatch: m1.colour.swatch };
  const txt = X.toText(d2, { title: 'T', marks: node });
  ok(/Blue Revision · 2 Nov 2026/.test(txt), 'text export: the revised page carries the header');
  ok(/\s\*$/m.test(txt), 'text export: an asterisk in the right margin');
  eq(X.revisedPages(d2, m1.ids), [0], 'the marked lines are on page 1');
}

/* ---- 2. A-scenes and A-pages ------------------------------------ */
{
  const d = script();
  d.numbering = Script.lockNumbering(d.elements, null);
  // a new scene between locked 1 and 2
  d.elements.splice(4, 0, el('scene', 'INT. HALL - DAY', 'hx'), el('action', 'A door.', 'ax'));
  d.numbering = Script.settleNumbering(d.elements, d.numbering);
  const nums = Script.sceneNumbers(d.elements, d.numbering).byId;
  eq([nums.get('h1'), nums.get('hx'), nums.get('h2'), nums.get('h3')], ['1', '1A', '2', '3'], 'a scene added between 1 and 2 is 1A; 2 and 3 keep their numbers');
  d.elements.splice(6, 0, el('scene', 'INT. STAIRS - DAY', 'hy'));
  d.numbering = Script.settleNumbering(d.elements, d.numbering);
  eq(Script.sceneNumbers(d.elements, d.numbering).byId.get('hy'), '1B', 'the next one between them is 1B');
  // a scene number never moves once settled
  const settled = Script.settleNumbering(d.elements, d.numbering);
  eq(settled.ids, d.numbering.ids, 'settling again changes nothing');

  // pages: a long script, pages locked, then material added on page 1
  const long = { elements: [], revisions: [], documents: [] };
  for (let i = 0; i < 12; i++) {
    long.elements.push(el('scene', 'INT. ROOM ' + i + ' - DAY', 'H' + i));
    for (let k = 0; k < 6; k++) long.elements.push(el('action', 'Line ' + i + '.' + k + ' of a scene that goes on long enough to wrap onto a second line of the page.', 'A' + i + '_' + k));
  }
  long.numbering = Script.lockNumbering(long.elements, null);
  long.numbering.pages = X.lockPages(long);
  const before = X.pageNumbersDoc(long);
  eq(before, before.map((_, i) => String(i + 1)), 'locked pages start as 1..n');
  // add a page's worth on page 1
  const add = [];
  for (let k = 0; k < 20; k++) add.push(el('action', 'New material ' + k + ' that also runs long enough to take two lines on the page.', 'N' + k));
  long.elements.splice(2, 0, ...add);
  const after = X.pageNumbersDoc(long);
  ok(after.includes('1A'), 'new material on page 1 makes page 1A, got ' + after.join(','));
  eq(after[after.length - 1], before[before.length - 1], 'the last page keeps its number: nothing after was renumbered');
  ok(after.includes('2') && after.indexOf('2') > after.indexOf('1A'), 'page 2 still exists after 1A');
}

/* ---- 3. fit to page --------------------------------------------- */
{
  const B = X.BODY_LINES;
  eq(F.normaliseCheat(9), F.MAX_CHEAT_LINES, 'a cheat is clamped to the ceiling');
  eq(F.normaliseCheat(-2), 0, 'and never negative');
  eq(F.normaliseCheat({ lines: '2' }), 2, 'an object with lines reads');
  eq(F.MAX_CHEAT_LINES, 4, 'the ceiling is 3 margin lines + 1 spacing line');
  const g1 = F.cheatGeometry(1, B);
  eq([g1.marginLines, g1.spacingLines, g1.bodyLines], [1, 0, B + 1], 'one line comes from the margins first');
  ok(Math.abs(g1.marginIn - 1 / 12) < 1e-9, '1 line = 1/12in off the top and the bottom');
  const g3 = F.cheatGeometry(3, B);
  ok(Math.abs(g3.marginIn - 0.25) < 1e-9, 'three lines = the full 0.25in a side, no more');
  eq(g3.lineHeight, 1, 'margins alone leave the leading untouched');
  const g4 = F.cheatGeometry(4, B);
  eq([g4.marginLines, g4.spacingLines], [3, 1], 'the fourth line is the leading');
  const page = B + 2 + 3;
  ok(Math.abs(g4.lineHeight - page / (page + 1)) < 1e-12, 'leading = L/(L+1) of a line');
  ok(g4.lineHeight > 0.98, 'the leading never tightens past ~2%');
  // the physical page still adds up: (lines) × leading fits the shaved box
  const boxIn = 9.134 + 2 * g4.marginIn;
  ok((B + 2 + g4.lines) * (1 / 6) * g4.lineHeight <= boxIn + 1e-6, 'the cheated page fits the shaved box');
  eq(F.shaveMargin('25.4mm 25.4mm 22mm 38.1mm', 6.35), '19.05mm 25.4mm 15.65mm 38.1mm', 'shaveMargin moves top and bottom, never the gutter');
  eq(F.shaveMargin('1in 1in', 5), '1in 1in', 'a margin it cannot read is left alone');

  // the arithmetic against the real paginator: never more pages, text untouched
  const doc = { elements: [], revisions: [], documents: [] };
  for (let i = 0; i < 120; i++) {
    doc.elements.push(el('scene', 'INT. PLACE ' + i + ' - DAY', 'S' + i));
    doc.elements.push(el('action', 'Something happens here that takes a couple of lines to say properly on the page.', 'T' + i));
    doc.elements.push(el('character', 'RAVI', 'R' + i));
    doc.elements.push(el('dialogue', 'A line of dialogue that runs across two lines of the narrow column.', 'Q' + i));
  }
  const snapshot = JSON.stringify(doc.elements);
  const opts = F.fitOptions((body) => X.paginateDoc(doc, { bodyLines: body }).length, B);
  eq(opts.length, 5, 'five options, none to four lines');
  eq(opts[0].saved, 0, 'no cheat saves nothing');
  ok(opts.every((o, i) => i === 0 || o.pages <= opts[i - 1].pages), 'more lines never print more pages');
  ok(opts[4].pages < opts[0].pages, 'the full cheat saves a page on a long script (' + opts[0].pages + ' → ' + opts[4].pages + ')');
  const best = F.bestFit(opts);
  ok(best && best.pages === opts[4].pages && opts.filter((o) => o.lines < best.lines).every((o) => o.pages > best.pages), 'bestFit is the smallest cheat reaching the fewest pages');
  ok(JSON.stringify(doc.elements) === snapshot, 'fitting never changes the text');
  // the print is built with the same pages
  const meta = { cheat: 2 };
  const pagesCheat = X.paginateDoc(doc, { bodyLines: B + 2 });
  ok(X.paginateDoc(doc).length >= pagesCheat.length, 'paginateDoc honours bodyLines');
  ok(X.paginate(doc.elements, { bodyLines: 999 }).length === X.paginate(doc.elements, { bodyLines: B + 4 }).length, 'paginate clamps a wild bodyLines');
  void meta;
}

/* ---- 4. reports -------------------------------------------------- */
{
  const d = script();
  const pages = X.paginateDoc(d);
  const labels = X.pageNumbersDoc(d, pages);
  const scenes = P.sceneReport(pages, labels, X.BODY_LINES);
  eq(scenes.map((s) => s.number), ['1', '2', '3'], 'scene report: one row per scene, numbered');
  eq(scenes[0].heading, 'INT. KITCHEN - DAY', 'scene report: the heading');
  eq(scenes[0].page, '1', 'scene report: the page it starts on');
  ok(scenes.every((s) => s.eighths >= 1 && /\/8|^\d+$/.test(s.length)), 'scene report: a length in eighths');
  eq(scenes[1].cast, ['MEENA'], 'scene report: the cast who speak, extensions dropped');
  const locs = P.locationReport(scenes);
  const kitchen = locs.find((l) => l.place === 'KITCHEN');
  ok(kitchen && kitchen.scenes === 2 && kitchen.times.includes('DAY') && kitchen.times.includes('NIGHT'), 'location report: KITCHEN twice, day and night');
  eq(kitchen.numbers, ['1', '3'], 'location report: its scene numbers');
  const chars = P.characterReport(pages, labels);
  eq(chars.map((c) => [c.name, c.scenes, c.speeches, c.pages]), [['RAVI', 2, 2, 1], ['MEENA', 1, 1, 1]], 'character report: scenes, speeches, pages');
  // a locked script's A-scene shows its letter in the report
  d.numbering = Script.lockNumbering(d.elements, null);
  d.elements.splice(4, 0, el('scene', 'INT. HALL - DAY', 'hx'));
  d.numbering = Script.settleNumbering(d.elements, d.numbering);
  const p2 = X.paginateDoc(d);
  eq(P.sceneReport(p2, X.pageNumbersDoc(d, p2), X.BODY_LINES).map((s) => s.number), ['1', '1A', '2', '3'], 'scene report: a locked script reads 1A');
  eq(P.revDate('nope'), '', 'revDate: not a date is empty');
}

console.log(`test:production — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
