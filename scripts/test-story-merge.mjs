/* ============================================================
   TEST — merging two copies of one story (src/lib/story-merge.js),
   in Node: the shared beat sheet behind the co-editing switch (§49).
   Edits to different steps both survive; the later `u` wins one step;
   a delete needs base to prove it and never beats a later edit; no
   base deletes nothing; when both changed the synopsis, both texts are
   kept; marks union and re-anchor; scalars follow the side that
   changed them; a merge is idempotent and never drops a field it does
   not know. Plus the stamps story.js writes.

       node scripts/test-story-merge.mjs   (or: npm run test:story-merge)
   ============================================================ */
import { mem as ls } from './node-seams.mjs';
const M = await import('../src/lib/story-merge.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const clone = (x) => JSON.parse(JSON.stringify(x));

const st = (id, text, u = 1, beat = 'save_the_cat:catalyst') => ({ id, beat, text, u });
const texts = (s) => s.outline.map((x) => x.text);
const base = {
  v: 1, source: 'Ravi loses the shop. He fights back.', sourceName: '', framework: 'save_the_cat',
  marks: [{ id: 'm1', start: 0, end: 18, text: 'Ravi loses the shop', tags: { save_the_cat: 'catalyst' }, origin: 'manual', rationale: '', u: 1 }],
  tension: { 'save_the_cat:catalyst': 6 }, logline: 'A grocer fights a chain.', idea: 'Shops', framework2: undefined,
  outline: [st('a', 'Ravi opens the shop.'), st('b', 'The chain arrives.'), st('c', 'Ravi fights back.')],
  updatedAt: 1, conflicts: ['person'], conflictLine: 'Ravi v. the chain', frameworkChosen: true,
  outlineLockedAt: '', genre: 'drama', audience: '', budgetTier: '', comps: [{ title: 'Kaaka Muttai', year: '2014', why: 'city' }]
};
delete base.framework2;

/* 1 different steps, two people */
{
  const mine = clone(base); mine.outline[0] = st('a', 'Ravi opens the shop at dawn.', 10);
  const theirs = clone(base); theirs.outline[2] = st('c', 'Ravi fights back, and loses.', 12);
  const m = M.mergeStory(mine, theirs, base);
  eq(texts(m), ['Ravi opens the shop at dawn.', 'The chain arrives.', 'Ravi fights back, and loses.'], '1  edits to different steps both survive');
  eq(texts(M.mergeStory(mine, theirs, null)), texts(m), '1  and without a base too');
}
/* 2 the same step: later u wins */
{
  const mine = clone(base); mine.outline[1] = st('b', 'Mine.', 20);
  const theirs = clone(base); theirs.outline[1] = st('b', 'Theirs.', 15);
  eq(texts(M.mergeStory(mine, theirs, base))[1], 'Mine.', '2  the same step: the later edit wins (mine)');
  theirs.outline[1].u = 25;
  eq(texts(M.mergeStory(mine, theirs, base))[1], 'Theirs.', '2  the same step: the later edit wins (theirs)');
}
/* 3 new steps on both sides, in place */
{
  const mine = clone(base); mine.outline.splice(1, 0, st('m', 'A brick through the window.', 30));
  const theirs = clone(base); theirs.outline.push(st('t', 'The shop reopens.', 31, 'save_the_cat:finale'));
  eq(texts(M.mergeStory(mine, theirs, base)), ['Ravi opens the shop.', 'A brick through the window.', 'The chain arrives.', 'Ravi fights back.', 'The shop reopens.'],
    '3  new steps on both sides are kept, each where it was written');
}
/* 4 deletes */
{
  const theirs = clone(base); theirs.outline.splice(1, 1);
  eq(texts(M.mergeStory(clone(base), theirs, base)), ['Ravi opens the shop.', 'Ravi fights back.'], '4  a step they deleted (base proves it) goes');
  eq(texts(M.mergeStory(clone(base), theirs, null)).length, 3, '4  no base: nothing is deleted');
  const mine = clone(base); mine.outline[1] = st('b', 'The chain arrives, early.', 40);
  eq(texts(M.mergeStory(mine, theirs, base)), ['Ravi opens the shop.', 'The chain arrives, early.', 'Ravi fights back.'], '4  a step edited here after they deleted it is kept');
  const mineDel = clone(base); mineDel.outline.splice(0, 1);
  eq(texts(M.mergeStory(mineDel, clone(base), base)), ['The chain arrives.', 'Ravi fights back.'], '4  a step deleted here stays deleted when they did not touch it');
}
/* 5 the synopsis prose */
{
  const mine = clone(base); mine.source = 'Ravi loses the shop. He fights back, alone.';
  const theirs = clone(base); theirs.source = 'Ravi loses the shop. He fights back with the street.';
  const m = M.mergeStory(mine, theirs, base, { now: 99 });
  eq(m.source, theirs.source, '5  both changed the synopsis: the arriving text is the synopsis');
  eq((m.sourceConflicts || []).map((c) => c.text), [mine.source], '5  and this side\'s text is kept, not lost');
  ok(m.sourceConflicts && m.sourceConflicts[0].at === 99 && /^sc-/.test(m.sourceConflicts[0].id), '5  the kept text carries when and an id');
  const onlyMine = M.mergeStory(mine, clone(base), base);
  eq(onlyMine.source, mine.source, '5  only this side changed it: this side\'s text');
  ok(!(onlyMine.sourceConflicts || []).length, '5  and nothing is kept as a conflict');
  eq(M.mergeStory(clone(base), theirs, base).source, theirs.source, '5  only they changed it: theirs, no conflict');
  ok(!(M.mergeStory(clone(base), theirs, base).sourceConflicts || []).length, '5  (no conflict kept)');
  const nb = M.mergeStory(mine, theirs, null, { now: 5 });
  eq([nb.source, (nb.sourceConflicts || []).map((c) => c.text)], [theirs.source, [mine.source]], '5  no base and they differ: theirs, mine kept');
  const empty = clone(base); empty.source = '';
  ok(!(M.mergeStory(empty, theirs, null).sourceConflicts || []).length, '5  an empty synopsis here is not kept as a conflict');
  // Twice: one entry, not two; and the kept copy survives the next arrival.
  const again = M.mergeStory(m, theirs, base);
  eq((again.sourceConflicts || []).length, 1, '5  merged again: still one kept text');
  const later = clone(theirs); later.logline = 'New logline';
  eq((M.mergeStory(m, later, theirs).sourceConflicts || []).map((c) => c.text), [mine.source], '5  the kept text survives a later arrival');
  // Dismissed on the other device (base had it): gone here too.
  const b2 = clone(m), r2 = clone(m); r2.sourceConflicts = [];
  ok(!(M.mergeStory(clone(m), r2, b2).sourceConflicts || []).length, '5  a kept text dismissed over there is dismissed here');
}
/* 6 marks */
{
  const mine = clone(base);
  mine.marks.push({ id: 'm2', start: 21, end: 36, text: 'He fights back', tags: { save_the_cat: 'finale' }, origin: 'manual', rationale: '', u: 50 });
  const theirs = clone(base);
  theirs.source = 'Before it all: Ravi loses the shop. He fights back.';
  theirs.marks[0] = { ...theirs.marks[0], tags: { save_the_cat: 'setup' }, u: 60 };
  theirs.marks.push({ id: 'm3', start: 0, end: 6, text: 'Before', tags: {}, origin: 'manual', rationale: '', u: 55 });
  const m = M.mergeStory(mine, theirs, base);
  eq(m.marks.map((x) => x.id), ['m3', 'm1', 'm2'], '6  marks union by id, sorted by start');
  eq(m.marks.find((x) => x.id === 'm1').tags, { save_the_cat: 'setup' }, '6  the newer edit of a mark wins');
  const m1 = m.marks.find((x) => x.id === 'm1'), m2 = m.marks.find((x) => x.id === 'm2');
  eq(m.source.slice(m1.start, m1.end), 'Ravi loses the shop', '6  a mark is re-anchored in the merged synopsis');
  eq(m.source.slice(m2.start, m2.end), 'He fights back', '6  and so is the one only this side had');
  const gone = clone(base); gone.marks = [];
  eq(M.mergeStory(clone(base), gone, base).marks.length, 0, '6  a mark removed over there (base proves it) goes');
  eq(M.mergeStory(clone(base), gone, null).marks.length, 1, '6  no base: kept');
  const detached = clone(base); detached.source = 'Something else entirely.';
  const d = M.mergeStory(detached, detached, base).marks[0];
  eq([d.start, d.end], [0, 18], '6  a detached mark keeps its stored offsets');
}
/* 7 scalars, tension, sets */
{
  const mine = clone(base); mine.logline = 'A grocer refuses to sell.'; mine.tension['save_the_cat:midpoint'] = 8;
  mine.conflicts = ['person', 'society']; mine.genre = 'drama';
  const theirs = clone(base); theirs.genre = 'thriller'; theirs.tension['save_the_cat:catalyst'] = 9;
  theirs.comps = [...base.comps, { title: 'Visaranai', year: '2015', why: 'fear' }]; theirs.conflicts = [];
  const m = M.mergeStory(mine, theirs, base);
  eq(m.logline, mine.logline, '7  a scalar only this side changed: this side');
  eq(m.genre, 'thriller', '7  a scalar only they changed: theirs');
  eq(m.tension, { 'save_the_cat:catalyst': 9, 'save_the_cat:midpoint': 8 }, '7  tension merges per key');
  eq(m.conflicts, ['society'], '7  conflicts: their removal and my addition both hold');
  eq(m.comps.map((c) => c.title), ['Kaaka Muttai', 'Visaranai'], '7  comps union');
  const both = clone(base); both.logline = 'Mine'; const both2 = clone(base); both2.logline = 'Theirs';
  eq(M.mergeStory(both, both2, base).logline, 'Theirs', '7  both changed a scalar: the arriving copy');
  eq(M.mergeStory(both, both2, null).logline, 'Theirs', '7  no base: the arriving copy');
}
/* 8 idempotent, canonical, unknown fields */
{
  const mine = clone(base); mine.outline[0] = st('a', 'Dawn.', 10); mine.source = 'Mine.'; mine.futureField = { keep: 1 };
  const theirs = clone(base); theirs.outline.push(st('t', 'End.', 11)); theirs.source = 'Theirs.'; theirs.serverOnly = 'x';
  const once = M.mergeStory(mine, theirs, base, { now: 7 });
  const twice = M.mergeStory(once, theirs, base, { now: 8 });
  eq(twice, once, '8  merging the result again changes nothing');
  eq(once.futureField, { keep: 1 }, '8  a field this build does not know, local only, is carried');
  eq(once.serverOnly, 'x', '8  and one only the arriving copy has');
  const raw = M.mergeStoryRaw(JSON.stringify(theirs), theirs, null);
  eq(M.mergeStoryRaw(raw, theirs, null), raw, '8  a copy merged with itself is unchanged (canonical text)');
  eq(M.mergeStoryRaw('{}', theirs, null), raw, '8  the arrival\'s canonical form is what an empty local merges to');
  eq(M.mergeStoryRaw('not json', theirs, base), M.mergeStoryRaw('{}', theirs, base), '8  unreadable local text reads as empty, never throws');
  const step = clone(base); step.outline[0].color = 'rose'; step.outline[0].u = 70;
  eq(M.mergeStory(step, clone(base), base).outline[0].color, 'rose', '8  a step\'s own new field (a colour) travels with the step');
}

/* 9 the stamps story.js writes (and the save stamping what changed) */
{
  const S = await import('../src/lib/story.js');
  const s = S.blankStory();
  const t0 = Date.now();
  const a = S.addOutlineStep(s, { beat: 'save_the_cat:catalyst', text: 'One' });
  ok(a.u >= t0, '9  addOutlineStep stamps the step');
  const b = S.addOutlineStep(s, { beat: 'save_the_cat:catalyst', text: 'Two' });
  a.u = 1; b.u = 1;
  S.updateOutlineStep(s, a.id, { text: 'One' });
  eq(a.u, 1, '9  an update that changes nothing leaves the stamp');
  S.updateOutlineStep(s, a.id, { text: 'One, edited' });
  ok(a.u > 1, '9  updateOutlineStep stamps a real change');
  b.u = 1; S.moveOutlineStep(s, b.id, { delta: -1 });
  ok(b.u > 1, '9  moveOutlineStep stamps the moved step');
  b.u = 1; S.moveOutlineStep(s, b.id, { beat: 'save_the_cat:midpoint' });
  ok(b.u > 1, '9  filing under another beat stamps it');
  s.source = 'Ravi loses the shop.';
  const m = S.addMark(s, { start: 0, end: 4, fw: 'save_the_cat', beat: 'catalyst' });
  ok(m.u >= t0, '9  addMark stamps the mark');
  m.u = 1; S.tagMark(s, m.id, 'save_the_cat', 'setup');
  ok(m.u > 1, '9  tagMark stamps it');
  S.saveStory(s);
  const stored = () => JSON.parse(ls.get('fms_story_v1'));
  const u0 = stored().outline.map((x) => x.u);
  S.saveStory(S.loadStory());
  eq(stored().outline.map((x) => x.u), u0, '9  a save that changes nothing keeps every stamp');
  { const raw = stored(); raw.outline[0].u = 1000; ls.set('fms_story_v1', JSON.stringify(raw)); }
  const back = S.loadStory();
  const was0 = back.outline[0].u;
  back.outline[0].text = 'Changed by a writer that does not stamp';
  S.saveStory(back);
  ok(was0 === 1000 && stored().outline[0].u >= t0 && stored().outline[0].text.startsWith('Changed by'), '9  the save stamps a step changed without a stamp');
  const stale = S.loadStory();
  const fresh = S.loadStory(); fresh.outline[1].text = 'Newer, synced in'; fresh.outline[1].u = Date.now() + 60000;
  S.saveStory(fresh);
  const staleU = stale.outline[1].u;
  stale.outline[1].text = 'Stale copy'; S.saveStory(stale);
  eq(stored().outline[1].u, staleU, '9  a stale page save keeps its old stamp, so the newer copy wins the next merge');
  // Kept texts on the story
  const k = S.loadStory();
  k.source = 'Now'; k.sourceConflicts = [{ id: 'sc-1', at: 1, u: 1, text: 'Before' }, { id: 'sc-2', at: 1, u: 1, text: 'Now' }];
  eq(S.sourceConflicts(k).map((c) => c.id), ['sc-1'], '9  a kept text equal to the synopsis is not offered');
  ok(S.useSourceConflict(k, 'sc-1') && k.source === 'Before', '9  "Use this text" makes it the synopsis');
  ok(S.sourceConflicts(k).some((c) => c.text === 'Now'), '9  and the text it replaced is kept, so the choice can be made back');
  const gone = S.dismissSourceConflict(k, S.sourceConflicts(k)[0].id);
  ok(gone && !S.sourceConflicts(k).length, '9  Dismiss lets it go and hands it back for an Undo');
}

console.log(`${fail ? '✗' : '✓'} test-story-merge: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
