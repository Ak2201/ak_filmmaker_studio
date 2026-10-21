/* ============================================================
   REVISIONS — compare, revised-page marks, locked scene numbers
   ------------------------------------------------------------
   In Node, no browser. Asserted here:
     · src/lib/script-diff.js: identity pairing via `liveId`, the text
       fallback for revisions without it, changed vs removed+added,
       moves, word-level pieces that rejoin into both lines, grouping
       by scene, the ids a revised page marks; the Dragon sample both
       ways, timed;
     · src/lib/script.js locked numbering: lock (positions, numbers in
       the text, an imported file's numbers), insert after / before /
       between, delete → OMITTED placed by number, move keeps the
       number, cut-and-paste by text, settle at save, unlock, the blob
       round trip and the absent-until-locked field;
     · src/lib/screenplay-export.js: OMITTED rows paginate, marks do not
       move a break, revisedPages() agrees with the diff; locked pages
       (A-pages): overflow letters, folded ranges, one element over
       several pages, a mid-speech page, a moved start, OMITTED at a
       locked break, a missing page 1, a blanked start;
     · src/lib/scene-sync.js: a locked script writes 12A into the row,
       an unlocked one is unchanged, numberPatches() renumbers.

       node scripts/test-revisions.mjs      (or: npm run test:revisions)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Script = await import('../src/lib/script.js');
const Diff = await import('../src/lib/script-diff.js');
const Typeset = await import('../src/lib/screenplay-export.js');
const Sync = await import('../src/lib/scene-sync.js');
const sample = (await import('../src/data/sample.dragon.script.json')).default;

const { blankElement, makeRevision, restoreElements, sceneNumbers, lockNumbering, settleNumbering } = Script;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const el = (type, text, id) => blankElement({ type, text, ...(id ? { id } : {}) });
const ops = (d) => d.ops.map((o) => o.op);
const nums = (els, nb) => { const r = sceneNumbers(els, nb); return els.filter((e) => r.byId.has(e.id)).map((e) => r.byId.get(e.id)); };

/* ================================================================
   1. THE DIFF
   ================================================================ */
const live = () => [
  el('scene', 'INT. KITCHEN - DAY', 'k1'),
  el('action', 'Ravi cooks in silence.', 'k2'),
  el('character', 'RAVI', 'k3'),
  el('dialogue', 'Where were you last night?', 'k4'),
  el('scene', 'EXT. STREET - NIGHT', 's1'),
  el('action', 'Rain on the tin roofs.', 's2')
];

// identity: a revision of the live script, then edits
{
  const before = live();
  const rev = makeRevision(before, 'White');
  ok(rev.elements.every((e, i) => e.liveId === before[i].id && e.id !== before[i].id), 'makeRevision records liveId and keeps a fresh id');
  const now = live();
  now[3].text = 'Where were you all night?';           // edit
  now.splice(5, 0, el('action', 'A dog barks.', 'new1'));  // add
  now.splice(1, 1);                                     // remove "Ravi cooks"
  const d = Diff.diffElements(rev.elements, now);
  eq(ops(d), ['same', 'removed', 'same', 'changed', 'same', 'added', 'same'], 'identity diff: same/removed/changed/added in order');
  eq(d.stats, { same: 4, changed: 1, moved: 0, added: 1, removed: 1 }, 'stats');
  const ch = d.ops.find((o) => o.op === 'changed');
  eq(ch.words.filter((w) => w.op !== 'same').map((w) => w.op + ':' + w.text.trim()), ['del:last', 'add:all'], 'word-level: "last" → "all"');
  eq(ch.words.filter((w) => w.op !== 'add').map((w) => w.text).join(''), 'Where were you last night?', 'word pieces rejoin into the older line');
  eq(ch.words.filter((w) => w.op !== 'del').map((w) => w.text).join(''), 'Where were you all night?', 'word pieces rejoin into the newer line');
  const marks = Diff.revisedIds(d);
  ok(marks.has('k4') && marks.has('new1'), 'revisedIds: the changed and the added line');
  ok(marks.has('k3'), 'revisedIds: a removal marks the line that now stands in its place');
  ok(!marks.has('k1') && !marks.has('s1'), 'revisedIds: untouched lines are not marked');
  // a line whose text was cleared prints nothing: it marks the next printed line
  const blank = live();
  blank[1].text = '';
  const mb = Diff.revisedIds(Diff.diffElements(rev.elements, blank));
  ok(!mb.has('k2') && mb.has('k3'), 'revisedIds: a cleared line marks the next printed line');

  // a heavy rewrite of an identified line is still CHANGED — identity wins
  const now2 = live();
  now2[1].text = 'Completely different words entirely.';
  const d2 = Diff.diffElements(rev.elements, now2);
  eq(ops(d2), ['same', 'changed', 'same', 'same', 'same', 'same'], 'identity: a rewrite of the same element is changed, not removed+added');

  // a type change
  const now3 = live();
  now3[1].type = 'shot';
  const d3 = Diff.diffElements(rev.elements, now3);
  ok(d3.ops[1].op === 'changed' && d3.ops[1].typeChanged, 'a type change is a change, and says so');
}

// moves
{
  const before = live();
  const rev = makeRevision(before, 'White');
  const now = live();
  const [street, rain] = now.splice(4, 2);
  now.unshift(street, rain);                            // street scene first
  const d = Diff.diffElements(rev.elements, now);
  eq(d.stats.removed + d.stats.added, 0, 'a move is not a remove + add');
  ok(d.stats.moved === 2 || d.stats.moved === 4, 'a moved scene: its lines are moved (got ' + d.stats.moved + ')');
  eq(d.ops.map((o) => o.b && o.b.id), now.map((e) => e.id), 'every newer element appears once, in the newer order');
}

// the text fallback: no liveId (an old revision, a restore)
{
  const old = live().map((e) => ({ id: 'old_' + e.id, type: e.type, text: e.text }));
  const now = restoreElements({ elements: old });       // fresh ids, nothing shared
  now[3].text = 'Where were you last evening?';
  now.splice(2, 0, el('action', 'The pressure cooker whistles.'));
  const d = Diff.diffElements(old, now);
  eq(ops(d), ['same', 'same', 'added', 'same', 'changed', 'same', 'same'], 'text fallback: alignment without ids');
  const empty = Diff.diffElements([], now);
  eq(empty.stats.added, now.length, 'against nothing, everything is added');
  ok(Diff.isUnchanged(Diff.diffElements(now, now.map((e) => ({ ...e })))), 'a list against itself is unchanged');
}

// repeated cues do not pull the alignment
{
  const A = [el('character', 'RAVI'), el('dialogue', 'One.'), el('character', 'RAVI'), el('dialogue', 'Two.'), el('character', 'RAVI'), el('dialogue', 'Three.')];
  const B = A.map((e) => ({ type: e.type, text: e.text, id: 'n' + Math.random() }));
  B.splice(2, 2);
  const d = Diff.diffElements(A, B);
  eq(d.stats, { same: 4, changed: 0, moved: 0, added: 0, removed: 2 }, 'removing a middle speech removes that speech only');
  eq(d.ops.filter((o) => o.op === 'removed').map((o) => o.a.text), ['RAVI', 'Two.'], 'the removed speech is the middle one');
}

// grouping
{
  const before = live();
  const rev = makeRevision(before, 'White');
  const now = live();
  now[5].text = 'Rain on the tin roofs, louder.';
  const g = Diff.groupByScene(Diff.diffElements(rev.elements, now));
  eq(g.map((x) => x.heading), ['EXT. STREET - NIGHT'], 'only the scene with a change is a group');
  eq(g[0].counts, { changed: 1, moved: 0, added: 0, removed: 0 }, 'its counts');
  eq(g[0].headingId, 's1', 'the group knows its heading');
  const all = Diff.groupByScene(Diff.diffElements(rev.elements, now), { all: true });
  eq(all.length, 2, 'opts.all keeps unchanged scenes');
  // a deleted scene is one group, opened by the heading only the older side has
  const cut = live().slice(0, 4);
  const g2 = Diff.groupByScene(Diff.diffElements(rev.elements, cut));
  eq(g2.map((x) => [x.heading, x.headingOp, x.counts.removed]), [['EXT. STREET - NIGHT', 'removed', 2]], 'a deleted scene reads as one removed group');
  // lines before the first heading
  const pre = [el('action', 'FADE IN:'), ...live()];
  const g3 = Diff.groupByScene(Diff.diffElements(rev.elements, pre));
  eq(g3[0].heading, '', 'lines before the first heading are a group with no heading');
}

// word diff and similarity edges
eq(Diff.wordDiff('', 'New line.'), [{ op: 'add', text: 'New line.' }], 'wordDiff: from nothing');
eq(Diff.wordDiff('a b', 'a b'), [{ op: 'same', text: 'a b' }], 'wordDiff: identical');
ok(Diff.similarity('the cat sat', 'the cat sat down') > 0.8, 'similarity: near lines are near');
ok(Diff.similarity('alpha beta', 'gamma delta') === 0, 'similarity: unrelated lines are 0');

// the Dragon sample, both ways, timed
{
  const S = sample.elements.map((e) => blankElement(e));
  const rev = makeRevision(S, 'White');
  const now = S.map((e) => ({ ...e }));
  now[100] = { ...now[100], text: now[100].text + ' Added words.' };
  now.splice(500, 3);
  now.splice(1200, 0, blankElement({ type: 'action', text: 'A brand new beat.' }));
  let t = performance.now();
  const d = Diff.diffElements(rev.elements, now);
  const tId = performance.now() - t;
  eq([d.stats.changed, d.stats.removed, d.stats.added], [1, 3, 1], 'sample by identity: 1 changed, 3 removed, 1 added');
  ok(tId < 200, `sample by identity diffs fast (${tId.toFixed(1)}ms)`);
  const anon = rev.elements.map((e) => ({ id: e.id, type: e.type, text: e.text }));   // no liveId
  t = performance.now();
  const d2 = Diff.diffElements(anon, now);
  const tText = performance.now() - t;
  eq([d2.stats.changed, d2.stats.removed, d2.stats.added], [1, 3, 1], 'sample by text alone: the same answer');
  ok(tText < 800, `sample by text diffs in bounded time (${tText.toFixed(1)}ms)`);
  console.log(`  sample (${S.length} elements): by id ${tId.toFixed(1)}ms, by text ${tText.toFixed(1)}ms`);
}

/* ================================================================
   2. LOCKED SCENE NUMBERS
   ================================================================ */
const script = () => [
  el('scene', 'INT. ONE - DAY', 'h1'), el('action', 'a'),
  el('scene', 'INT. TWO - DAY', 'h2'), el('action', 'b'),
  el('scene', 'INT. THREE - DAY', 'h3'), el('action', 'c'),
  el('scene', 'INT. FOUR - DAY', 'h4')
];
const at = (els, id) => els.findIndex((e) => e.id === id);

// unlocked = positions, and no `numbering` field
{
  const s = script();
  eq(nums(s, null), ['1', '2', '3', '4'], 'unlocked: positions');
  eq(sceneNumbers(s, { locked: false }).locked, false, 'locked:false is unlocked');
  mem.clear();
  Script.saveScript({ elements: s, revisions: [], documents: [] });
  ok(!('numbering' in JSON.parse(mem.get('fms_script_v1'))), 'an unlocked script stores no numbering field');
  ok(!('numbering' in Script.loadScript()), 'and loads none');
}

// lock, insert after
{
  const s = script();
  const nb = lockNumbering(s);
  eq(nums(s, nb), ['1', '2', '3', '4'], 'lock: the positions');
  s.splice(at(s, 'h2'), 0, el('scene', 'INT. ONE AND A HALF - DAY', 'x1'));     // after 1
  eq(nums(s, nb), ['1', '1A', '2', '3', '4'], 'insert after 1 → 1A, nothing renumbers');
  s.splice(at(s, 'h2'), 0, el('scene', 'INT. ONE AND THREE QUARTERS - DAY', 'x2')); // after 1A
  eq(nums(s, nb), ['1', '1A', '1B', '2', '3', '4'], 'insert after 1A, before 2 → 1B (never 1AA)');
  s.push(el('scene', 'EXT. LAST - NIGHT', 'x3'));
  eq(nums(s, nb).slice(-1), ['4A'], 'insert after the last scene → 4A');
  s.unshift(el('scene', 'EXT. PROLOGUE - DAY', 'x4'));
  eq(nums(s, nb)[0], 'A1', 'insert before scene 1 → A1');
  s.splice(1, 0, el('scene', 'EXT. PROLOGUE TWO - DAY', 'x5'));
  eq(nums(s, nb).slice(0, 3), ['A1', 'B1', '1'], 'insert between A1 and 1 → B1');
  // the provisional numbers settle unchanged
  const settled = settleNumbering(s, nb);
  eq(nums(s, settled), nums(s, nb), 'settle keeps exactly the provisional numbers');
  eq(sceneNumbers(s, settled).fresh, [], 'after settle nothing is fresh');
  // a later insert before 1A no longer moves 1A, because 1A is settled
  s.splice(at(s, 'x1'), 0, el('scene', 'INT. SQUEEZED - DAY', 'x6'));
  const r = sceneNumbers(s, settled);
  eq([r.byId.get('x1'), r.byId.get('x2')], ['1A', '1B'], 'a settled letter never moves');
  eq(r.byId.get('x6'), '1C', 'a gap with no letter left takes the next free one (documented edge)');
  ok(new Set(r.byId.values()).size === r.byId.size, 'every number unique');
}

// delete → OMITTED, placed by number; restore by id or by text
{
  const s = script();
  const nb = lockNumbering(s);
  const cut = s.filter((e) => e.id !== 'h2');
  const r = sceneNumbers(cut, nb);
  eq(nums(cut, nb), ['1', '3', '4'], 'delete 2: nothing renumbers');
  eq(r.omitted, [{ number: '2', before: 'h3' }], 'delete 2: OMITTED 2, placed before 3');
  const lastCut = s.filter((e) => e.id !== 'h4');
  eq(sceneNumbers(lastCut, nb).omitted, [{ number: '4', before: null }], 'delete the last: OMITTED at the end');
  // Ctrl+Z brings the id back
  eq(sceneNumbers(s, nb).omitted, [], 'the heading back under its id: no omission');
  // retyped with the same words, new id
  const retyped = cut.slice();
  retyped.splice(2, 0, el('scene', 'int. two -  day', 'new2'));
  const r2 = sceneNumbers(retyped, nb);
  eq([r2.byId.get('new2'), r2.omitted.length], ['2', 0], 'retyped with the same words: number 2 comes back');
  // settle re-keys the moved entry
  const st = settleNumbering(retyped, nb);
  ok(st.ids.new2 && st.ids.new2.n === '2' && !st.ids.h2, 'settle re-keys a cut-and-paste to the new id');
  // settle keeps an omitted entry
  const st2 = settleNumbering(cut, nb);
  ok(st2.ids.h2 && st2.ids.h2.n === '2', 'settle keeps the omitted number in the record');
  eq(sceneNumbers(cut, st2).omitted, [{ number: '2', before: 'h3' }], 'and it is still omitted after the save');
  // a NEW heading where 2 was takes 1A, not 2 — 2 is spoken for
  const fresh = cut.slice();
  fresh.splice(2, 0, el('scene', 'INT. SOMEWHERE ELSE - DAY', 'n'));
  eq(sceneNumbers(fresh, st2).byId.get('n'), '1A', 'a new heading never reuses an omitted number');
}

// move keeps the number
{
  const s = script();
  const nb = lockNumbering(s);
  const moved = [s[6], ...s.slice(0, 6)];                 // FOUR to the top
  eq(nums(moved, nb), ['4', '1', '2', '3'], 'a moved heading keeps its number');
  eq(sceneNumbers(moved, nb).omitted, [], 'and nothing is omitted');
}

// lock from the text's own numbers, and from an import's
{
  const t = [el('scene', '10 INT. A - DAY', 'a'), el('scene', '11 INT. B - DAY', 'b'), el('scene', '11A INT. C - DAY', 'c')];
  eq(nums(t, lockNumbering(t)), ['10', '11', '11A'], 'lock: every heading numbered in its text → those numbers');
  const half = [el('scene', '10 INT. A - DAY', 'a'), el('scene', 'INT. B - DAY', 'b')];
  eq(nums(half, lockNumbering(half)), ['1', '2'], 'lock: a half-numbered script locks positions');
  const dup = [el('scene', '5 INT. A - DAY', 'a'), el('scene', '5 INT. B - DAY', 'b')];
  eq(nums(dup, lockNumbering(dup)), ['1', '2'], 'lock: duplicate text numbers lock positions');
  const imp = script();
  const preset = new Map([['h1', '47'], ['h2', '48'], ['h3', '48A'], ['h4', '49']]);
  eq(nums(imp, lockNumbering(imp, preset)), ['47', '48', '48A', '49'], 'lock: an imported file\'s numbers');
  eq(nums(imp, lockNumbering(imp, new Map([['h1', '1'], ['h2', '2'], ['h3', '6'], ['h4', '3']]))), ['1', '2', '3', '4'],
    'lock: rows numbered out of order ("next free") lock positions instead');
  preset.delete('h4');
  eq(nums(imp, lockNumbering(imp, preset)), ['1', '2', '3', '4'], 'lock: a partial preset is not used');
  // a new heading whose text carries a free number keeps it
  const nb = lockNumbering(script());
  const s = script();
  s.splice(2, 0, el('scene', '7 INT. TYPED - DAY', 'ty'));
  eq(sceneNumbers(s, nb).byId.get('ty'), '7', 'locked: a new heading with a free number in its text keeps it');
  s[2].text = '3 INT. TYPED - DAY';
  eq(sceneNumbers(s, nb).byId.get('ty'), '1A', 'locked: a taken number in the text is not reused');
}

// import that replaces the script while locked
{
  const s = script();
  const nb = lockNumbering(s);
  const replaced = s.map((e) => ({ ...e, id: 'r_' + e.id }));   // every id new, same words
  replaced[4] = { ...replaced[4], text: 'INT. THREE, REWRITTEN - DAY' };
  const r = sceneNumbers(replaced, nb);
  eq([r.byId.get('r_h1'), r.byId.get('r_h2'), r.byId.get('r_h4')], ['1', '2', '4'], 'replace-import: same words keep their numbers');
  eq(r.byId.get('r_h3'), '2A', 'replace-import: a rewritten heading is new');
  eq(r.omitted, [{ number: '3', before: 'r_h4' }], 'replace-import: the heading that no longer exists is OMITTED');
}

// compare
{
  const cmp = Script.compareSceneNumbers;
  const order = ['A1', 'B1', '1', '1A', '1B', '2', '10', '10A', '10AA'];
  eq(order.slice().sort(cmp), order, 'compareSceneNumbers: A1 < B1 < 1 < 1A < 1B < 2 < 10 < 10A < 10AA');
  eq(Script.parseSceneNumber('12a'), { pre: '', d: 12, suf: 'A' }, 'parseSceneNumber upper-cases');
  eq(Script.parseSceneNumber('twelve'), null, 'parseSceneNumber: not a number');
}

// the blob: round trip, and unlock removes the field
{
  mem.clear();
  const s = script();
  const doc = { elements: s, revisions: [], documents: [], numbering: lockNumbering(s) };
  doc.elements.splice(2, 0, el('scene', 'INT. NEW - DAY', 'nn'));
  Script.saveScript(doc);
  eq(doc.numbering.ids.nn && doc.numbering.ids.nn.n, '1A', 'saveScript settles a new heading into the in-memory doc');
  const back = Script.loadScript();
  eq(nums(back.elements, back.numbering), ['1', '1A', '2', '3', '4'], 'the lock survives a save and a load');
  ok(Script.isNumberingLocked(back.numbering), 'isNumberingLocked');
  delete back.numbering;
  Script.saveScript(back);
  ok(!('numbering' in JSON.parse(mem.get('fms_script_v1'))), 'unlocking removes the field');
  eq(Script.normaliseNumbering({ locked: true, ids: { a: { n: ' 12a ' }, b: { n: '' } } }).ids, { a: { n: '12A', t: '' } }, 'normalise: trims, upper-cases, drops blanks');
  eq(Script.normaliseNumbering({ locked: false }), null, 'normalise: unlocked is nothing');
}

/* ================================================================
   3. THE PAGES
   ================================================================ */
{
  const s = script();
  const nb = lockNumbering(s);
  const cut = s.filter((e) => e.id !== 'h2');
  const pages = Typeset.paginateDoc({ elements: cut, numbering: nb });
  const rows = pages.flat();
  const omit = rows.filter((r) => r.omitted);
  eq(omit.map((r) => [r.sceneNo, r.lines[0]]), [['2', 'OMITTED']], 'paginate: one OMITTED row for scene 2');
  eq(rows.filter((r) => r.type === 'scene').map((r) => r.sceneNo), ['1', '2', '3', '4'], 'paginate: 1, OMITTED 2, 3, 4 in order');
  const text = Typeset.toText({ elements: cut, numbering: nb }, { title: 'T' });
  ok(/\n2  OMITTED\n/.test(text), 'text export prints "2  OMITTED"');
  const unlocked = Typeset.paginateDoc({ elements: cut }).flat();
  eq(unlocked.filter((r) => r.type === 'scene').map((r) => r.sceneNo), ['1', '2', '3'], 'unlocked: positions, no OMITTED');
  eq(Typeset.paginate(cut).flat().map((r) => r.sceneNo || ''), unlocked.map((r) => r.sceneNo || ''), 'paginateDoc unlocked is paginate');

  // the sample, locked with nothing changed, paginates exactly as unlocked
  const S = sample.elements.map((e) => blankElement(e));
  const a = Typeset.paginate(S);
  const b = Typeset.paginateDoc({ elements: S, numbering: lockNumbering(S) });
  eq(b.length, a.length, 'sample: a fresh lock moves no page break');
  eq(b.flat().map((r) => r.sceneNo || ''), a.flat().map((r) => r.sceneNo || ''), 'sample: a fresh lock prints the same numbers');

  // marks move no break, and land on the pages the diff says
  const rev = makeRevision(S, 'White');
  const now = S.map((e) => ({ ...e }));
  now[700] = { ...now[700], text: now[700].text + ' (revised)' };
  const ids = Diff.revisedIds(Diff.diffElements(rev.elements, now));
  const pg = Typeset.revisedPages({ elements: now }, ids);
  const expect = Typeset.paginate(now).findIndex((rows) => rows.some((r) => r.id === now[700].id));
  ok(pg.includes(expect), 'revisedPages: the page holding the edited line');
  ok(pg.length <= 2, 'revisedPages: only that page (or two, if it broke across)');
  const marked = Typeset.toText({ elements: now }, { title: 'T', marks: { ids, label: 'Blue Revision' } });
  const plain = Typeset.toText({ elements: now }, { title: 'T' });
  eq(marked.split('\f').length, plain.split('\f').length, 'marks change no page count');
  ok(marked.includes('Blue Revision  ') && (marked.match(/\*$/gm) || []).length >= 1, 'text export: header and asterisk on the revised page');
  ok(!plain.includes('Blue Revision'), 'no marks asked for, none printed');
}

/* ================================================================
   4. SCENE ROWS
   ================================================================ */
{
  const s = script();
  const rows = s.filter((e) => e.type === 'scene').map((h, i) => ({ id: 'row' + i, number: String(i + 1), scriptElId: h.id,
    location: h.text.replace(/^INT\. | - DAY$/g, ''), intExt: 'INT', dayNight: 'DAY' }));
  const nb = lockNumbering(s);
  const s2 = s.slice();
  s2.splice(2, 0, el('scene', 'INT. INSERTED - DAY', 'ins'));
  const prev = Sync.headingMap(s);
  const lockedPlan = Sync.reconcile(s2, rows, { prev, bin: [], numbering: nb });
  eq(lockedPlan.add.map((a) => a.row.number), ['1A'], 'locked: the new row is 1A');
  const plainPlan = Sync.reconcile(s2, rows, { prev, bin: [] });
  eq(plainPlan.add.map((a) => a.row.number), ['5'], 'unlocked: the new row is the next free integer, as before');
  // a linked row whose number disagrees with the lock is corrected
  const off = rows.map((r) => ({ ...r }));
  off[2].number = '99';
  const fix = Sync.reconcile(s, off, { prev: null, bin: [], numbering: nb });
  eq(fix.update.filter((u) => u.patch.number).map((u) => [u.id, u.patch.number]), [['row2', '3']], 'locked: a linked row is told its locked number');
  // the heading's text cannot move a locked number
  const typed = s.map((e) => ({ ...e }));
  typed[2] = { ...typed[2], text: '40 INT. TWO - DAY' };
  const tp = Sync.reconcile(typed, rows, { prev, bin: [], numbering: nb });
  ok(!tp.update.some((u) => u.patch.number), 'locked: a number typed into a heading does not renumber its row');
  // numberPatches: lock, then unlock-and-renumber
  const moved = [s[6], ...s.slice(0, 6)];
  eq(Sync.numberPatches(moved, rows, nb), [], 'locked and moved: rows keep their numbers');
  eq(Sync.numberPatches(moved, rows, null).map((p) => [p.id, p.patch.number]),
    [['row0', '2'], ['row1', '3'], ['row2', '4'], ['row3', '1']], 'unlock and renumber: rows follow the positions');
  const hand = [...rows, { id: 'hand', number: '7', scriptElId: '' }];
  ok(!Sync.numberPatches(moved, hand, null).some((p) => p.id === 'hand'), 'a hand-made row is never renumbered');
}

/* ================================================================
   5. THE REVISED-PAGE TINT
   ------------------------------------------------------------
   buildDocument() paints a revised sheet in the revision colour when
   marks.tint is on, and only then. A tint on a page that is not
   revised, or a tint that leaks onto every sheet, is the failure.
   ================================================================ */
{
  const { parseHTML } = await import('linkedom');
  const { document: linkDoc } = parseHTML('<!doctype html><html><body></body></html>');
  const hadDoc = 'document' in globalThis, hadNode = 'Node' in globalThis;
  globalThis.document = linkDoc;
  globalThis.Node = linkDoc.defaultView ? linkDoc.defaultView.Node : class {};
  try {
    const S = sample.elements.map((e) => blankElement(e));
    const rev = makeRevision(S, 'Blue');
    const now = S.map((e) => ({ ...e }));
    now[700] = { ...now[700], text: now[700].text + ' (revised)' };
    const ids = Diff.revisedIds(Diff.diffElements(rev.elements, now));
    const sheetsOf = (tint) => {
      const root = Typeset.buildDocument({ elements: now }, { title: 'T', marks: { ids, label: 'Blue Revision', swatch: 'blue', tint } });
      return [...root.querySelectorAll('section.wr-pg')];
    };
    const on = sheetsOf(true);
    const off = sheetsOf(false);
    const revisedOn = on.filter((s) => s.classList.contains('wr-pg-revised'));
    ok(revisedOn.length >= 1, 'tint: a revised sheet exists to tint');
    ok(revisedOn.every((s) => s.classList.contains('wr-pg-tint') && s.classList.contains('c-blue')),
      'tint on: every revised sheet carries wr-pg-tint and its colour class');
    ok(on.filter((s) => !s.classList.contains('wr-pg-revised')).every((s) => !s.classList.contains('wr-pg-tint')),
      'tint on: an unrevised sheet is not tinted');
    ok(off.every((s) => !s.classList.contains('wr-pg-tint')), 'tint off: no sheet is tinted');
    ok(off.filter((s) => s.classList.contains('wr-pg-revised')).length === revisedOn.length,
      'tint off: the revised sheets are still marked, just not tinted');
  } finally {
    if (!hadDoc) delete globalThis.document;
    if (!hadNode) delete globalThis.Node;
  }
}

/* ================================================================
   4. LOCKED PAGES (A-pages) — screenplay-export.js pagesLock
   ================================================================ */
{
  const S = sample.elements.map((e) => blankElement(e));
  const base = { elements: S, numbering: lockNumbering(S) };
  const before = Typeset.paginateDoc(base);
  const lock = Typeset.lockPages(base, '2026-10-19T10:00:00.000Z');
  eq(lock.starts.length, before.length, 'lockPages records one start per page');
  const doc = { elements: S, numbering: { ...base.numbering, pages: lock } };
  const locked = Typeset.paginateDoc(doc);
  eq(locked.length, before.length, 'a fresh page lock moves no page break');
  eq(Typeset.pageNumbersDoc(doc, locked), before.map((_, i) => String(i + 1)), 'and numbers the pages 1 to N');
  eq(Typeset.pageNumbersDoc({ elements: S }, before), before.map((_, i) => String(i + 1)), 'unlocked pages are numbered by position');

  // Insert a long passage on page 2: page 3 must still be page 3.
  const p2 = Typeset.pageStarts(locked)[1];
  const at = S.findIndex((e) => e.id === p2.id) + 1;
  const added = Array.from({ length: 40 }, (_, k) => el('action', 'An added line of action, long enough to take a few lines on the page, number ' + k + '.'));
  const grown = { ...doc, elements: [...S.slice(0, at), ...added, ...S.slice(at)] };
  const gp = Typeset.paginateDoc(grown);
  const gl = Typeset.pageNumbersDoc(grown, gp);
  ok(gl[1] === '2' && /^2A$/.test(gl[2]), 'material added on page 2 overflows into 2A', gl.slice(0, 6));
  const p3 = Typeset.pageStarts(locked)[2];
  const i3 = gl.indexOf('3');
  ok(i3 > 2 && Typeset.pageStarts(gp)[i3].id === p3.id, 'page 3 still begins where it did', { i3, labels: gl.slice(0, 6) });
  ok(gl.slice(i3).every((l, k) => !/[A-Z]/.test(l) || k === 0 || l.startsWith(gl[i3 + k - 1].replace(/[A-Z]+$/, ''))), 'and no later page is renumbered');
  eq(gl[gl.length - 1], String(before.length), 'the last page keeps its number');

  // Cut everything on page 3: page 2 is now 2-3.
  const starts = Typeset.pageStarts(locked);
  const from = S.findIndex((e) => e.id === starts[2].id), to = S.findIndex((e) => e.id === starts[3].id);
  const shrunk = { ...doc, elements: [...S.slice(0, from), ...S.slice(to)] };
  const sl = Typeset.pageNumbersDoc(shrunk);
  eq(sl.slice(0, 3), ['1', '2-3', '4'], 'a cut page folds into the one before: 2-3, then 4');

  // The printed label, and the text export carries it.
  eq([Typeset.pageLabelPrinted('1', 0), Typeset.pageLabelPrinted('2A', 2), Typeset.pageLabelPrinted('2-3', 1)], ['', '2A.', '2-3.'], 'printed labels: first page bare, a full stop after');
  ok(/\n\s+2A\.\n/.test(Typeset.toText(grown, { title: 'T' })), 'the text export prints 2A.');

  // Carried through load and save, never moved by a save.
  const norm = Script.normaliseNumbering(doc.numbering);
  eq(norm.pages.starts.length, lock.starts.length, 'normaliseNumbering keeps the page lock');
  eq(Script.settleNumbering(grown.elements, doc.numbering).pages, doc.numbering.pages, 'settleNumbering keeps it as it was');
  eq(Script.normalisePagesLock({ locked: true, starts: [] }), null, 'an empty page lock reads as unlocked');
  eq(Script.normalisePagesLock({ locked: 'yes', starts: [{ n: '1' }] }), null, 'a malformed one too');
  ok(Typeset.pagesLock({ elements: S, numbering: null }) === null, 'no scene lock, no page lock');
}

/* ================================================================
   5. LOCKED PAGES — the round-2 review, one case per finding
   ================================================================ */
{
  const lockDoc = (E) => {
    const base = { elements: E, numbering: lockNumbering(E) };
    return { elements: E, numbering: { ...base.numbering, pages: Typeset.lockPages(base, '2026-10-19T10:00:00.000Z') } };
  };
  const labels = (d) => Typeset.pageNumbersDoc(d);
  const words = (n) => Array.from({ length: n }, (_, i) => 'word' + (i % 10)).join(' ');
  /* Labels never go backwards: each page's first number (and letters)
     comes after the previous page's last. */
  const rank = (l) => { const m = /^(\d+)([A-Z]*)$/.exec(l); return m ? [+m[1], m[2].length, m[2]] : null; };
  const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0);
  const forward = (ls) => ls.every((l, i) => {
    if (!i) return true;
    const prev = ls[i - 1].split('-'), here = l.split('-');
    return cmp(rank(prev[prev.length - 1]), rank(here[0])) < 0;
  });
  // Twelve scenes of a heading and twelve one-line actions: two scenes a page.
  const twelve = () => {
    const E = [];
    for (let s = 1; s <= 12; s++) {
      E.push(el('scene', 'INT. ROOM ' + s + ' - DAY', 'h' + s));
      for (let i = 0; i < 12; i++) E.push(el('action', 'S' + s + ' l' + i, 'h' + s + 'a' + i));
    }
    return E;
  };
  const sceneOf = (E, hid) => E.filter((x) => x.id === hid || x.id.startsWith(hid + 'a'));
  const T12 = twelve();
  const D12 = lockDoc(T12);
  eq(D12.numbering.pages.starts.map((s) => s.id), ['h1', 'h3', 'h5', 'h7', 'h9', 'h11'], 'fixture: six pages, each begun by a heading');

  // #4 — one element over several page tops: each keeps its own number.
  {
    const E = [el('scene', 'INT. A - DAY', 's1'), el('action', 'One line.', 'a1'), el('action', words(1100), 'big'), el('scene', 'INT. B - DAY', 's2'), el('action', 'x', 'a2')];
    const d = lockDoc(E);
    eq(d.numbering.pages.starts.map((s) => s.id + (s.split ? '|s' : '')), ['s1', 'big|s', 'big|s'], 'a long action block begins two locked pages');
    eq(labels(d), ['1', '2', '3'], 'and each keeps its own number straight after locking');
    eq((Typeset.toText(d, { title: 'T' }).match(/^\s+\S+\.\s*$/gm) || []).map((x) => x.trim()), ['2.', '3.'], 'the text export prints 2. and 3.');
    const back = { ...d, numbering: Script.normaliseNumbering(d.numbering) };
    eq(labels(back), ['1', '2', '3'], 'the stored shape needs no new field: a normalised lock reads the same');
  }

  // #3 — a page that began mid-speech keeps its number when an edit above lets the speech fit.
  {
    const E = [el('scene', 'INT. A - DAY', 's1')];
    for (let i = 0; i < 22; i++) E.push(el('action', 'Line ' + i, 't' + i));
    E.push(el('character', 'RAVI', 'c1'), el('dialogue', words(40), 'd1'));
    for (let i = 22; i < 82; i++) E.push(el('action', 'Line ' + i, 't' + i));
    const d = lockDoc(E);
    eq(d.numbering.pages.starts.map((s) => s.id + (s.split ? '|s' : '')), ['s1', 'd1|s', 't46', 't72'], 'fixture: page 2 begins mid-speech');
    const e2 = { ...d, elements: E.filter((x) => x.id !== 't0') };
    eq(labels(e2), ['1', '2', '3', '4'], 'one line cut on page 1: no 1-2, no 1A');
    eq(Typeset.pageStarts(Typeset.paginateDoc(e2))[1].id, 't22', 'page 2 now begins with what followed the speech');
  }

  // #2 — a moved page start is new material where it lands, never its old number out of order.
  {
    const blk = sceneOf(T12, 'h11');
    const rest = T12.filter((x) => !blk.includes(x));
    const at = rest.findIndex((x) => x.id === 'h5');
    const m = { ...D12, elements: [...rest.slice(0, at), ...blk, ...rest.slice(at)] };
    const ls = labels(m);
    eq(ls, ['1', '2', '2A', '3', '4', '5', '5A-6'], 'scene 11 moved before page 3: it is 2A, not a 6 between 2 and 3');
    ok(forward(ls), 'and the labels run forward', ls);
    ok(!Typeset.paginateDoc(m).some((p, i) => i && p[0].id === 'h11' && ls[i] === '6'), 'no break is forced before the moved heading');
  }

  // #1 — an OMITTED row stays on the page its scene was cut from.
  {
    const cut = { ...D12, elements: T12.filter((x) => !sceneOf(T12, 'h6').includes(x)) };
    const pg = Typeset.paginateDoc(cut);
    eq(labels(cut), ['1', '2', '3', '4', '5', '6'], 'scene 6 cut from page 3: no page after it moves');
    eq([pg[3][0].id, pg[3][0].sceneNo], ['h7', '7'], 'page 4 still begins with scene 7');
    ok(pg[2].some((r) => r.omitted && r.sceneNo === '6'), 'and 6 OMITTED sits at the foot of page 3');
  }

  // #5 — a missing page 1 folds onto the first page, and a first page never prints its number.
  {
    // A cold open of action lines (no heading, so nothing is OMITTED), then the twelve scenes.
    const E = [...Array.from({ length: 40 }, (_, k) => el('action', 'Open ' + k, 'o' + k)), ...twelve()];
    const d = lockDoc(E);
    const p2 = E.findIndex((x) => x.id === d.numbering.pages.starts[1].id);
    const e5 = { ...d, elements: E.slice(p2) };
    const ls = labels(e5);
    eq(ls[0], '1-2', 'page 1 cut: the first page is 1-2, not 2');
    ok(forward(ls), 'and the labels run forward', ls);
    eq([Typeset.pageLabelPrinted('1-2', 0), Typeset.pageLabelPrinted('1', 0), Typeset.pageLabelPrinted('1-2', 1)], ['', '', '1-2.'], 'the first page prints no number, range or not');
    ok(!/^\s+1-2\.\s*$/m.test(Typeset.toText(e5, { title: 'T' })), 'the text export does not print 1-2.');
  }

  // #6 — a missing number folds after the lettered pages; a blanked start keeps its page.
  {
    const add = Array.from({ length: 30 }, (_, k) => el('action', 'Added line ' + k + ' of action that is long enough to wrap.', 'ad' + k));
    const at = T12.findIndex((x) => x.id === 'h3') + 1;
    const gone = new Set([...sceneOf(T12, 'h5'), ...sceneOf(T12, 'h6')]);
    const grown = [...T12.slice(0, at), ...add, ...T12.slice(at)];
    const la = labels({ ...D12, elements: grown.filter((x) => !gone.has(x)) });
    const i4 = la.indexOf('4');
    ok(i4 > 2 && /^2[A-Z]+-3$/.test(la[i4 - 1]) && la.slice(1, i4 - 1).every((l) => !l.includes('-')), 'page 3 cut, page 2 grown: the fold is on the last A-page (2B-3)', la);
    ok(forward(la), 'and the labels run forward', la);
    const blank = grown.map((x) => (x.id === 'h5' ? { ...x, text: '' } : x));
    const lb = labels({ ...D12, elements: blank });
    ok(lb.includes('3') && !lb.some((l) => l.includes('-')), "page 3's heading blanked: page 3 is still 3, nothing folded", lb);
    const i3 = lb.indexOf('3');
    eq((Typeset.pageStarts(Typeset.paginateDoc({ ...D12, elements: blank }))[i3] || {}).id, 'h5a0', 'and it begins with the first line that prints');
  }
}

/* ================================================================
   6. LOCKED PAGES — an OMITTED row that overflowed onto the locked page
   ================================================================
   A deleted scene's OMITTED row that did not fit at the foot of a page
   sat at the top of the next one. pageStarts() records that page as
   beginning at the heading after it (the OMITTED row has no id), so a
   lock taken with no edit must still give the same pages — not a
   lone 'OMITTED' page lettered 1A in front of them. Swept over the
   length of page 1, so the case where it fits at the foot is held too. */
{
  let fired = 0;
  for (let n = 18; n <= 30; n++) {
    const E = [el('scene', 'INT. A - DAY', 'sa')];
    for (let i = 0; i < n; i++) E.push(el('action', 'Line ' + i + '.', 'a' + i));
    E.push(el('scene', 'INT. B - DAY', 'sb'), el('scene', 'INT. C - DAY', 'sc'), el('action', 'C acts.', 'ca'));
    const numbering = lockNumbering(E);
    const cut = E.filter((x) => x.id !== 'sb');
    const plain = { elements: cut, numbering };
    const before = Typeset.paginateDoc(plain);
    const omitTop = before.length > 1 && before[1][0] && before[1][0].omitted === true;
    if (omitTop) fired++;
    const locked = { elements: cut, numbering: { ...numbering, pages: Typeset.lockPages(plain, '2026-10-21T00:00:00.000Z') } };
    const after = Typeset.paginateDoc(locked);
    eq(after.length, before.length, 'n=' + n + ': locking the pages with no edit keeps the page count');
    eq(Typeset.pageNumbersDoc(locked, after), before.map((_, i) => String(i + 1)), 'n=' + n + ': and numbers them 1 to N, no lettered page');
    eq(after.map((pg) => pg.filter((r) => r.omitted).length), before.map((pg) => pg.filter((r) => r.omitted).length), 'n=' + n + ': the OMITTED row stays on the page it was locked on');
  }
  ok(fired > 0, 'the sweep reaches the case where OMITTED tops page 2', { fired });
}

console.log(`test:revisions — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
