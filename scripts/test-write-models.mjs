/* ============================================================
   test:write-models — the screenplay pages' pure logic, in Node
   ------------------------------------------------------------
   src/lib/write-format.js, write-model.js, screenplay-model.js and
   screenplay-drafts-model.js hold what write.js, screenplay.js and
   drafts.js used to work out inline. These checks pin the sentences
   and numbers they produced, so a later edit to a model cannot change
   what the pages say without a test noticing. No browser.
   ============================================================ */
import { mem } from './node-seams.mjs';   // FIRST: store.js stubbed, JSON as modules, localStorage in memory
import assert from 'node:assert/strict';
void mem;

const F = await import('../src/lib/write-format.js');
const W = await import('../src/lib/write-model.js');
const S = await import('../src/lib/screenplay-model.js');
const D = await import('../src/lib/screenplay-drafts-model.js');
const P = await import('../src/lib/write-prefs.js');
const Keys = (await import('../src/lib/write-keys.js')).default;

let n = 0;
const ok = (name, fn) => { fn(); n++; };

ok('formatStamp', () => {
  const iso = new Date(2026, 8, 28, 14, 5).toISOString();
  assert.equal(F.formatStamp(iso, true), '28 Sep 2026, 14:05');
  assert.equal(F.formatStamp(iso), '28 Sep 2026');
  assert.equal(F.prettyStamp('nope'), '—');
  assert.equal(F.titlePlaceholder('date', 'X', new Date(2026, 0, 2)), '2 Jan 2026');
  assert.equal(F.titlePlaceholder('title', 'My Film'), 'My Film');
});

ok('pageAnchors / pageViewLayout / omittedPlacements', () => {
  const pages = [
    [{ id: 'a', sceneNo: '1' }, { id: 'b' }],
    [{ id: 'b', cont: true }, { omitted: true, sceneNo: '2' }, { id: 'c', sceneNo: '3' }],
    [{ omitted: true, sceneNo: '4' }]
  ];
  const L = W.pageViewLayout(pages);
  assert.deepEqual(L.anchors[1], { id: 'b', split: true });
  assert.equal(L.anchors[2], null);
  assert.equal(L.pageOf.get('c'), 1);
  assert.equal(L.sceneNo.get('a'), '1');
  assert.deepEqual(W.omittedPlacements(pages), [['c', ['2']], [null, ['4']]]);
  assert.equal(W.pvWhereText({ total: 3, pageOf: L.pageOf, focusId: 'c', elements: [] }), 'Printed page 2 of 3');
  assert.equal(W.pvWhereText({ total: 0, pageOf: L.pageOf, focusId: null, elements: [] }), 'Paginating…');
  assert.equal(W.pvWhereText({ total: 1, pageOf: new Map(), focusId: null, elements: [] }), '1 printed page');
});

ok('synopsis loading', () => {
  assert.equal(W.prosify('  one\n  two\n\n\n three '), 'one two\n\nthree');
  assert.equal(W.synopsisFromText('   ', 'f.txt'), null);
  const p = W.synopsisFromText('word '.repeat(2000), '');
  assert.equal(p.name, 'that file');
  assert.ok(p.kept <= W.SYN_LIMIT && p.read > p.kept);
  assert.equal(W.synopsisLoadNote(p).warn, true);
  assert.match(W.synopsisPendingText(p, 12), /There are already 12 characters/);
});

ok('generator and questions', () => {
  assert.equal(W.genStage({ beats: [], scenes: [], cursor: 0 }), 'synopsis');
  assert.equal(W.genStage({ beats: [1], scenes: [1], cursor: 1 }), 'done');
  assert.equal(W.genLang('zz').id, 'ta-dialogue');
  assert.equal(W.genFailState({ name: 'AbortError' }).aborted, true);
  assert.equal(W.importReplaceQuestion({ replaceScript: false, replaceScenes: false, elementCount: 3, sceneCount: 2 }), null);
  assert.match(W.importReplaceQuestion({ replaceScript: true, replaceScenes: true, elementCount: 1, sceneCount: 2 }),
    /^Replace 1 element of screenplay and 2 scenes\?/);
  assert.equal(W.importDoneMessage({ elements: 4, scenes: 1, renumbered: 0 }),
    'Imported 4 elements and 1 scene. The breakdown and the stripboard have them now.');
  assert.equal(W.sceneNumberNote({ numbering: {} }), '');
});

ok('screenplay model', () => {
  assert.equal(S.scenePosText(null, 0), 'No scenes yet');
  assert.equal(S.scenePosText({ scene: 2 }, 5), 'Scene 2 of 5');
  assert.equal(S.shotsSummary([{ movement: 'Pan' }, { movement: 'Pan' }, {}]), '3 shots · Pan 2');
  assert.equal(S.shotsSummary([]), 'No shots planned');
  assert.equal(S.targetPagesFor({ minutes: 0 }, 'Short film'), 15);
  assert.equal(S.targetPagesFor({ minutes: 0 }, ''), 110);
  assert.equal(S.targetDeltaText(100, 90), '10 min over');
  assert.equal(S.isBlankScript([{ text: ' ' }]), true);
  assert.equal(S.showStartHint([{ text: '' }, { text: '' }]), false);
  assert.equal(S.importDoneText({ elements: 2, scenes: 1 }), 'Imported 2 lines and 1 scene. Next: Screenplay Analysis.');
  // QA: a replace import binned the Breakdown's rows and said nothing
  assert.match(S.importDoneText({ elements: 4, scenes: 2, binned: 1 }), /earlier scene is in its bin/);
  assert.match(S.importReplaceBody(3), /3 scenes go to its bin/);
  // QA r3: singular counts read singular.
  assert.equal(S.importDoneText({ elements: 1, scenes: 1, binned: 1 }),
    'Imported 1 line and 1 scene. The Breakdown’s earlier scene is in its bin, with its shots and notes; restore any you want from there. Next: Screenplay Analysis.');
  assert.match(S.importReplaceBody(1), /scene goes to its bin, with its shots/);
  assert.match(S.importReplaceBody(3), /with their shots/);
  assert.match(S.importReadText('', { format: 'fountain', elements: [{}], pages: 1, scenes: [] }), /: 1 line, /);
  assert.equal(S.importReplaceBody(0), 'A draft of the current one is saved first, so it can be restored.');
});

ok('drafts model', () => {
  const d = { label: 'Draft 2', colour: { name: 'Blue' }, savedAt: new Date(2026, 9, 1, 9, 3).toISOString(), pages: 1, lines: 2 };
  assert.equal(D.draftMetaText(d), '1 Oct 2026, 09:03 · 1 page · 2 lines');
  assert.equal(D.restoreDialogSpec(d, true, 'Draft 3').choices[0].label, 'Save as Draft 3, then restore');
  assert.equal(D.draftPdfMeta(d, 'T').revision, 'Blue — Draft 2');
});

ok('write prefs read-merge-write', () => {
  localStorage.setItem('fms_write_prefs_v1', JSON.stringify({ keys: 'x' }));
  P.writeWritePrefs({ focusDim: false });
  assert.deepEqual(JSON.parse(localStorage.getItem('fms_write_prefs_v1')), { keys: 'x', focusDim: false });
  assert.equal(P.writeHintsOn(), true);
  P.setWriteHints(false);
  assert.equal(P.writeHintsOn(), false);
  P.setWriteHints(true);
  assert.deepEqual(JSON.parse(localStorage.getItem('fms_write_prefs_v1')), { keys: 'x', focusDim: false });
  localStorage.setItem('fms_write_prefs_v1', '[1]');
  assert.deepEqual(P.readWritePrefs(), {});
});

ok('chipTypes follows the preset digits (QA: chip 4 was Dialogue while Alt+4 set Paren)', () => {
  const known = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'];
  const ids = S.chipTypes('finaldraft', known).map((c) => c.id);
  assert.deepEqual(ids, ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot']);
  const dm = Keys.digitMap('finaldraft', known);
  ids.forEach((id, i) => { if (dm[String(i + 1)]) assert.equal(dm[String(i + 1)], id, 'chip ' + (i + 1) + ' is Alt+' + (i + 1)); });
  assert.equal(S.chipTypes('finaldraft', known).find((c) => c.id === 'transition').label, 'Trans');
});

console.log('✓ write models: ' + n + ' groups');
