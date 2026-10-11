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

console.log(fails ? fails + ' FAILED of ' + n : 'drafts: all ' + n + ' checks passed');
process.exit(fails ? 1 : 0);
