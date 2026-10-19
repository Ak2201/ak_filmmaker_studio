/* ============================================================
   TEST — merging two copies of one screenplay (src/lib/script-merge.js),
   in Node. Concurrent edits to different lines both survive; the later
   edit of one line wins; insertions on both sides are kept, in place;
   a delete is honoured only when base proves it, and never over a
   later edit; no base never deletes; drafts and documents union; the
   title page and numbering follow the side that changed them; merging
   is idempotent and a copy merged with itself is unchanged.
   ============================================================ */
const M = await import('../src/lib/script-merge.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

const e = (id, text, u = 1, type = 'action') => ({ id, type, text, u });
const texts = (d) => d.elements.map((x) => x.text);
const base = { elements: [e('h', 'INT. FLAT - NIGHT', 1, 'scene'), e('a', 'Ravi paces.'), e('c', 'RAVI', 1, 'character'), e('d', 'Not tonight.', 1, 'dialogue')], revisions: [], documents: [] };
const clone = (x) => JSON.parse(JSON.stringify(x));

// Two people, two different lines.
{
  const mine = clone(base); mine.elements[1] = e('a', 'Ravi paces, faster.', 10);
  const theirs = clone(base); theirs.elements[3] = e('d', 'Not tonight, Meera.', 12, 'dialogue');
  eq(texts(M.mergeScript(mine, theirs, base)), ['INT. FLAT - NIGHT', 'Ravi paces, faster.', 'RAVI', 'Not tonight, Meera.'], 'edits to different lines both survive');
  eq(texts(M.mergeScript(mine, theirs, null)), ['INT. FLAT - NIGHT', 'Ravi paces, faster.', 'RAVI', 'Not tonight, Meera.'], 'and without a base too');
}
// The same line, twice.
{
  const mine = clone(base); mine.elements[1] = e('a', 'Mine.', 20);
  const theirs = clone(base); theirs.elements[1] = e('a', 'Theirs.', 15);
  eq(texts(M.mergeScript(mine, theirs, base))[1], 'Mine.', 'the same line: the later edit wins (mine, later)');
  theirs.elements[1].u = 25;
  eq(texts(M.mergeScript(mine, theirs, base))[1], 'Theirs.', 'the same line: the later edit wins (theirs, later)');
}
// Insertions on both sides, in place.
{
  const mine = clone(base); mine.elements.splice(2, 0, e('m1', 'A door slams.', 30));
  const theirs = clone(base); theirs.elements.push(e('t1', 'CUT TO:', 31, 'transition'));
  eq(texts(M.mergeScript(mine, theirs, base)), ['INT. FLAT - NIGHT', 'Ravi paces.', 'A door slams.', 'RAVI', 'Not tonight.', 'CUT TO:'], 'insertions on both sides are kept, each where it was written');
  const first = clone(base); first.elements.unshift(e('m0', 'BLACK.', 30));
  eq(texts(M.mergeScript(first, base, base))[0], 'BLACK.', 'a line inserted at the very top stays at the top');
}
// Deletes.
{
  const theirs = clone(base); theirs.elements.splice(1, 1);             // they cut "Ravi paces."
  eq(texts(M.mergeScript(clone(base), theirs, base)), ['INT. FLAT - NIGHT', 'RAVI', 'Not tonight.'], 'a delete on their side is honoured when base proves it');
  const mine = clone(base); mine.elements[1] = e('a', 'Ravi paces, then stops.', 40);
  eq(texts(M.mergeScript(mine, theirs, base))[1], 'Ravi paces, then stops.', 'but never over a later edit here');
  eq(texts(M.mergeScript(clone(base), theirs, null)).length, 4, 'with no base nothing is deleted');
  const mineCut = clone(base); mineCut.elements.splice(3, 1);           // I cut the speech
  eq(texts(M.mergeScript(mineCut, clone(base), base)), ['INT. FLAT - NIGHT', 'Ravi paces.', 'RAVI'], 'a delete on my side is honoured too');
  const theirsEdit = clone(base); theirsEdit.elements[3] = e('d', 'Not tonight, Meera.', 50, 'dialogue');
  eq(texts(M.mergeScript(mineCut, theirsEdit, base))[3], 'Not tonight, Meera.', 'unless they edited it after');
}
// The rest of the script.
{
  const mine = { ...clone(base), revisions: [{ id: 'r1', name: 'Draft 1', date: '2026-10-01' }], documents: [{ id: 'd1', title: 'Notes', updated: '2026-10-02' }] };
  const theirs = { ...clone(base), revisions: [{ id: 'r2', name: 'Draft 2', date: '2026-10-03' }], documents: [{ id: 'd1', title: 'Notes v2', updated: '2026-10-04' }] };
  const m = M.mergeScript(mine, theirs, base);
  eq(m.revisions.map((r) => r.id), ['r1', 'r2'], 'drafts from both sides, in date order');
  eq(m.documents[0].title, 'Notes v2', 'a document: the newer one wins');
  const tpMine = { ...clone(base), titlePage: { title: 'Kite' } };
  eq(M.mergeScript(tpMine, clone(base), base).titlePage, { title: 'Kite' }, 'the title page follows the side that changed it');
  const nbTheirs = { ...clone(base), numbering: { locked: true, at: 'x', ids: {} } };
  eq(M.mergeScript(clone(base), nbTheirs, base).numbering, { locked: true, at: 'x', ids: {} }, 'and so do locked numbers');
}
// Properties.
{
  const mine = clone(base); mine.elements[1] = e('a', 'Ravi paces, faster.', 10); mine.elements.push(e('m9', 'FADE OUT.', 11, 'transition'));
  const theirs = clone(base); theirs.elements[0] = e('h', 'INT. FLAT - DAY', 12, 'scene');
  const once = M.mergeScript(mine, theirs, base);
  eq(M.mergeScript(once, theirs, theirs), once, 'merging again with the same arrival changes nothing');
  eq(M.mergeScript(base, base, base), { elements: base.elements, revisions: [], documents: [] }, 'a copy merged with itself is itself');
  eq(JSON.parse(M.mergeScriptRaw('{}', base, null)).elements.length, 4, 'an empty local copy takes the arrival whole (the raw form)');
  ok(typeof M.mergeScriptRaw(JSON.stringify(mine), theirs, base) === 'string', 'the raw form returns JSON text');
}

console.log((fail ? '✗' : '✓') + ' test-merge: ' + pass + ' passed, ' + fail + ' failed');
if (fail) process.exit(1);
