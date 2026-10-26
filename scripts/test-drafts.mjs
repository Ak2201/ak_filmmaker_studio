/* DRAFTS — src/lib/drafts.js in Node. node scripts/test-drafts.mjs (npm run test:drafts) */
import { mem } from './node-seams.mjs';

const Script = await import('../src/lib/script.js');
const D = await import('../src/lib/drafts.js');
const Typeset = await import('../src/lib/screenplay-export.js');
const { blankElement } = Script;

let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.error('FAIL ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a));

const els = (...t) => t.map((x, i) => blankElement({ type: i % 2 ? 'action' : 'scene', text: x }));
const doc = { elements: els('INT. ROOM - DAY', 'He waits.'), revisions: [], documents: [] };

ok(D.listDrafts(doc).length === 0 && D.latestDraft(doc) === null, 'no drafts yet');
ok(D.changedSinceDraft(doc) === true, 'written, no draft: changed');
ok(D.changedSinceDraft({ elements: [], revisions: [] }) === false, 'empty, no draft: not changed');

const d1 = D.saveNewDraft(doc, { note: ' first pass ' });
eq([d1.name, d1.number, d1.note, d1.colour.name], ['Draft 1', 1, 'first pass', 'White'], 'draft 1');
ok(D.changedSinceDraft(doc) === false, 'unchanged right after saving');
doc.elements[1].text = 'He waits. Longer.';
ok(D.changedSinceDraft(doc) === true, 'edit detected');
const d2 = D.saveNewDraft(doc);
eq([d2.name, d2.colour.name], ['Draft 2', 'Blue'], 'draft 2 takes the next colour');
eq(D.listDrafts(doc).map((d) => d.number), [2, 1], 'newest first');
ok(D.latestDraft(doc).id === d2.id, 'latest');
ok(d1.rev.elements[0].id !== doc.elements[0].id, 'snapshot ids are fresh');

// Update overwrites the snapshot, keeps number and position.
doc.elements.push(blankElement({ type: 'action', text: 'More.' }));
ok(D.changedSinceDraft(doc), 'changed again');
const u = D.updateDraft(doc, d2.id, { note: 'with more' });
eq([u.number, u.note, doc.revisions.length], [2, 'with more', 2], 'update in place');
ok(!D.changedSinceDraft(doc), 'unchanged after update');
ok(D.updateDraft(doc, 'nope') === null, 'unknown id');

// Title page: part of "changed" once the draft carries one; snapshotted.
doc.titlePage = Script.normaliseTitlePage({ title: 'BLUE', author: 'A. Writer' });
ok(D.changedSinceDraft(doc) === true, 'a title page added after the draft counts as a change');
const legacy = { elements: els('A'), titlePage: { title: 'X' }, revisions: [{ id: 'l', name: 'Old', date: '2026-01-01T00:00:00Z', elements: els('A') }] };
ok(D.changedSinceDraft(legacy) === false, 'an old draft without a title page snapshot ignores the title page');
D.updateDraft(doc, d2.id);
ok(doc.revisions[1].titlePage.title === 'BLUE', 'title page snapshotted');
doc.titlePage.title = 'RED';
ok(D.changedSinceDraft(doc), 'title page change counts once snapshotted');

// Restore: elements and title page come back, with fresh ids.
const before = doc.elements.length;
ok(D.restoreDraft(doc, d1.id) && doc.elements.length === 2 && before === 3, 'restore draft 1');
ok(doc.elements[1].text === 'He waits.', 'restored text');
ok(D.restoreDraft(doc, 'nope') === false, 'restore unknown');
ok(D.changedSinceDraft(doc), 'restored copy differs from the latest draft (2)');

// Numbering after a gap, and old entries.
const old = { elements: els('A', 'b'), revisions: [{ id: 'o1', name: 'Second draft', date: '2026-01-01T00:00:00Z', elements: els('A') }, { id: 'o2', name: 'x', date: '2026-02-01T00:00:00Z', elements: els('A', 'b') }], documents: [] };
const L = D.listDrafts(old);
eq([L[0].number, L[1].label], [2, 'Second draft'], 'old entries numbered by position, keep names');
eq(D.saveNewDraft(old).name, 'Draft 3', 'next after old entries');

// Round trip through the blob keeps the optional fields and nothing else.
Script.saveScript(doc);
const back = Script.loadScript();
eq([back.revisions[1].number, back.revisions[1].titlePage.title, back.revisions[0].note], [2, 'BLUE', 'first pass'], 'blob round trip');
const raw = JSON.parse(mem.get(Script.SCRIPT_KEY));
ok(!('colour' in raw.revisions[0]), 'colour is not stored');
const plain = { elements: [], revisions: [{ id: 'p', name: 'Old', date: '2026-01-01T00:00:00.000Z', elements: [] }], documents: [] };
mem.set(Script.SCRIPT_KEY, JSON.stringify(plain));
Script.saveScript(Script.loadScript());
eq(Object.keys(JSON.parse(mem.get(Script.SCRIPT_KEY)).revisions[0]).sort(), ['date', 'elements', 'id', 'name'], 'old revision gains no fields');

// Stable hash; ids ignored.
ok(D.hashElements(els('a', 'b')) === D.hashElements(els('a', 'b')), 'hash stable across ids');
ok(D.hashElements(els('a', 'b')) !== D.hashElements(els('a', 'c')), 'hash differs');

// A draft prints identically every time.
const dd = D.draftDocument(doc, d2.id);
const a = JSON.stringify(Typeset.paginateDoc(dd)), b = JSON.stringify(Typeset.paginateDoc(D.draftDocument(doc, d2.id)));
ok(a === b && a.length > 10, 'same draft, same pages');
ok(D.draftDocument(doc, 'nope') === null, 'draftDocument unknown');

/* Restore keeps a locked numbering. restoreElements() renews every id,
   and the lock keys on ids, so it used to be DELETED — the scene lock,
   every OMITTED number and the page lock gone, under a dialog that said
   "nothing is lost". Each snapshot line records the id it had live
   (`liveId`); the lock is re-keyed through it. */
{
  const E = [];
  for (let s = 1; s <= 5; s++) {
    E.push(blankElement({ type: 'scene', text: 'INT. ROOM ' + s + ' - DAY' }));
    E.push(blankElement({ type: 'action', text: 'Scene ' + s + ' happens.' }));
  }
  const ld = { elements: E, revisions: [], documents: [] };
  ld.numbering = Script.lockNumbering(E);                 // 1..5
  // Delete scene 3 (OMITTED), insert one after 4 (4A).
  ld.elements = E.filter((x) => x.text !== 'INT. ROOM 3 - DAY');
  const i4 = ld.elements.findIndex((x) => x.text === 'Scene 4 happens.') + 1;
  ld.elements.splice(i4, 0, blankElement({ type: 'scene', text: 'INT. NEW - NIGHT' }));
  ld.numbering = Script.settleNumbering(ld.elements, ld.numbering);
  ld.numbering.pages = Typeset.lockPages(ld, '2026-10-21T00:00:00.000Z');
  const numsOf = (d) => {
    const r = Script.sceneNumbers(d.elements, d.numbering);
    return { heads: d.elements.filter((x) => x.type === 'scene').map((x) => r.byId.get(x.id)), omitted: r.omitted.map((o) => o.number) };
  };
  const want = numsOf(ld);
  eq(want, { heads: ['1', '2', '4', '4A', '5'], omitted: ['3'] }, 'fixture: 1 2 4 4A 5, 3 omitted');
  const pagesBefore = Typeset.pageNumbersDoc(ld);
  const dl = D.saveNewDraft(ld);
  ld.elements[1].text = 'Scratch edit.';
  ok(D.restoreDraft(ld, dl.id), 'restore the latest draft over a locked script');
  ok(ld.numbering && ld.numbering.locked === true, 'the scene lock survives the restore');
  eq(numsOf(ld), want, 'every heading keeps its locked number and 3 is still OMITTED');
  ok(Object.keys(ld.numbering.ids).every((k) => !ld.elements.some((x) => x.id === k) || ld.elements.find((x) => x.id === k).type === 'scene'), 'the record keys on the restored ids');
  ok(ld.numbering.pages && ld.numbering.pages.locked === true, 'the page lock survives too');
  ok(ld.numbering.pages.starts.every((st) => !st.id || ld.elements.some((x) => x.id === st.id)), 'and its starts name restored elements');
  eq(Typeset.pageNumbersDoc(ld), pagesBefore, 'the pages read as they did when locked');
  // A draft from before this lock: its headings come back by their words.
  const unl = { elements: els('INT. A - DAY', 'x', 'INT. B - DAY', 'y'), revisions: [], documents: [] };
  const dOld = D.saveNewDraft(unl);
  unl.numbering = Script.lockNumbering(unl.elements);
  unl.revisions[0].elements.forEach((e) => { delete e.liveId; });
  D.restoreDraft(unl, dOld.id);
  eq(numsOf(unl), { heads: ['1', '2'], omitted: [] }, 'a draft with no liveId: numbers matched by heading text');
  // Unlocked stays unlocked.
  const free = { elements: els('INT. A - DAY', 'x'), revisions: [], documents: [] };
  const dFree = D.saveNewDraft(free);
  D.restoreDraft(free, dFree.id);
  ok(!('numbering' in free), 'no lock, none invented');
}

/* A side copy the sync kept by itself is never the current draft (QA:
   "From another device" became Current and Update overwrote it). */
{
  const Inc = await import('../src/lib/script-incoming.js');
  const mine = { elements: els('INT. A - DAY', 'Mine.'), revisions: [], documents: [] };
  const theirs = { elements: els('INT. A - DAY', 'Theirs.'), revisions: [] };
  const kept = Inc.keepBoth(mine, theirs, Inc.ARRIVAL_PREFIX + '21:09');
  eq(kept.revisions.length, 1, 'the arrival is kept as a revision');
  ok(D.latestDraft(kept) === null, 'an arrival alone is not the current draft');
  ok(D.changedSinceDraft(kept) === true, 'and the working copy reads as changed since no draft');
  ok(D.listDrafts(kept).length === 1, 'the arrival is still listed');
  const real = D.saveNewDraft(kept);
  eq(real.name, 'Draft 1', 'the first real draft is Draft 1, not Draft 2');
  const again = Inc.keepBoth(kept, theirs, Inc.ARRIVAL_PREFIX + '21:20');
  ok(D.latestDraft(again).id === real.id, 'a later arrival does not displace the real current draft');
  const yours = Inc.takeTheirs(again, theirs, Inc.YOURS_PREFIX + '21:21');
  ok(D.latestDraft(yours).id === real.id, '"Your version" is a side copy too');
}

console.log(fails ? fails + ' FAILED of ' + n : 'drafts: all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
