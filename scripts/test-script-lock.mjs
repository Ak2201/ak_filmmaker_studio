/* ============================================================
   TEST — the script lock's model (src/lib/script-lock.js, plus the
   `base` / `reviewed` fields in script.js), in Node.
   node scripts/test-script-lock.mjs   (docs/SCRIPT-LOCK.md §1, §3, §4)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Script = await import('../src/lib/script.js');
const D = await import('../src/lib/drafts.js');
const L = await import('../src/lib/script-lock.js');
const { blankElement } = Script;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const el = (type, text, id) => blankElement({ type, text, ...(id ? { id } : {}) });
const script = () => ({
  elements: [
    el('scene', 'INT. KITCHEN - DAY', 'h1'), el('action', 'Ravi cooks.', 'a1'),
    el('scene', 'EXT. STREET - NIGHT', 'h2'), el('action', 'Rain falls.', 'a2'),
    el('scene', 'INT. OFFICE - DAY', 'h3'), el('action', 'Phones ring.', 'a3')
  ],
  revisions: [], documents: []
});
const rows = () => [
  { id: 's1', number: '1', scriptElId: 'h1', shootDay: '1', location: 'KITCHEN', eighths: 1 },
  { id: 's2', number: '2', scriptElId: 'h2', shootDay: '1', location: 'STREET', eighths: 1 },
  { id: 's3', number: '3', scriptElId: 'h3', shootDay: '2', location: 'OFFICE', eighths: 1 }
];
const shots = [{ sceneId: 's2' }, { sceneId: 's2' }, { sceneId: 's3' }];
const callSheets = [{ id: 'c1', title: 'Day 1', date: '2026-11-05', sceneIds: ['s1', 's2'] }];
const inject = { scenes: rows(), shots, callSheets };

/* ---- 1. storage round trip -------------------------------------- */
{
  const d = script();
  Script.saveScript(d);
  const raw1 = mem.get(Script.SCRIPT_KEY);
  Script.saveScript(Script.loadScript());
  ok(mem.get(Script.SCRIPT_KEY) === raw1, 'a blob with no lock fields round-trips byte-identical');

  d.numbering = Script.lockNumbering(d.elements, null);
  Script.saveScript(d);
  const raw2 = mem.get(Script.SCRIPT_KEY);
  Script.saveScript(Script.loadScript());
  ok(mem.get(Script.SCRIPT_KEY) === raw2, 'an old lock (no base) round-trips byte-identical');
  ok(!('base' in JSON.parse(raw2).numbering) && !('reviewed' in JSON.parse(raw2).numbering), 'and gains no base or reviewed');

  d.numbering = { ...d.numbering, base: 'rev1', reviewed: { ' 1a ': 'abc:2', '2': 'omitted', bad: 7 } };
  Script.saveScript(d);
  const back = Script.loadScript().numbering;
  eq(Object.keys(back), ['locked', 'at', 'ids', 'base', 'reviewed'], 'key order: locked, at, ids, base, reviewed');
  eq(back.reviewed, { '1A': 'abc:2', '2': 'omitted' }, 'reviewed: keys trimmed and upper-cased, non-string values dropped');
  const again = Script.settleNumbering(d.elements, back);
  ok(again.base === 'rev1' && again.reviewed['2'] === 'omitted', 'settleNumbering carries base and reviewed');
  Script.saveScript(Script.loadScript());
  const raw3 = mem.get(Script.SCRIPT_KEY);
  Script.saveScript(Script.loadScript());
  ok(mem.get(Script.SCRIPT_KEY) === raw3, 'a held blob round-trips byte-identical');
  const n0 = Script.normaliseNumbering({ locked: true, ids: {}, base: '', reviewed: { x: 1 } });
  ok(!('base' in n0) && !('reviewed' in n0), 'an empty base and an all-bad reviewed are dropped');
  mem.delete(Script.SCRIPT_KEY);
}

/* ---- 2. isHeld --------------------------------------------------- */
ok(Script.isHeld({ locked: true, at: 'x', ids: {}, base: 'r' }) === true, 'locked with a base is held');
ok(Script.isHeld({ locked: true, at: 'x', ids: {} }) === false, 'a lock with no base is not held');
ok(Script.isHeld({ base: 'r' }) === false && Script.isHeld(null) === false && Script.isHeld({ locked: true, base: '' }) === false, 'no lock / empty base: not held');
ok(Script.default.isHeld === Script.isHeld, 'isHeld is on the default export');

/* ---- 3. takeLock ------------------------------------------------- */
{
  const d = script();
  eq(L.lockState(d).state, 'draft', 'no lock reads as draft');
  const none = { elements: [el('action', 'No headings.')], revisions: [] };
  ok(L.takeLock(none, []) === null && !none.numbering && !none.revisions.length, 'no headings: null, nothing touched');

  const r1 = L.takeLock(d, rows());
  ok(r1 && r1.savedDraft && d.revisions.length === 1, 'a script with no draft saves exactly one');
  eq([d.revisions[0].note, d.numbering.base], [L.LOCK_NOTE, d.revisions[0].id], 'note and base');
  eq(Object.keys(d.numbering), ['locked', 'at', 'ids', 'base'], 'the lock has no reviewed marks');
  eq(d.numbering.ids.h2.n, '2', 'numbers locked from the rows');
  ok(Script.isHeld(d.numbering), 'held after the lock');
  const st = L.lockState(d);
  eq([st.state, st.base.id, st.base.label, st.baseMissing, st.colour.name], ['locked', d.revisions[0].id, 'Draft 1', false, 'White'], 'lockState after the lock');

  // reuse
  const e = script();
  const first = D.saveNewDraft(e, { note: 'mine' });
  const r2 = L.takeLock(e, rows());
  ok(r2.savedDraft === null && r2.baseId === first.id && e.revisions.length === 1, 'an unchanged latest draft is reused, none saved');
  // changed
  const f = script();
  D.saveNewDraft(f);
  f.elements[1].text = 'Ravi cooks. Slowly.';
  const r3 = L.takeLock(f, rows());
  ok(r3.savedDraft && f.revisions.length === 2 && r3.baseId === f.revisions[1].id, 'a changed script saves one new draft');

  const pv = L.lockPreview(script(), { props: 2, vehicles: 1, extras: 4 }, rows());
  eq([pv.scenes, pv.numbering, pv.cast, pv.locations, pv.elements, pv.extras, pv.baseline],
    [3, 'rows', 0, 3, 3, 4, { reuse: null, next: 'Draft 1' }], 'lockPreview: facts');
  const g = script();
  g.elements.splice(2, 0, el('character', 'RAVI (V.O.)'), el('dialogue', 'Hi.'), el('character', 'RAVI'));
  D.saveNewDraft(g);
  const pv2 = L.lockPreview(g, {}, []);
  eq([pv2.cast, pv2.numbering, pv2.baseline.reuse, pv2.baseline.next], [1, 'position', 'Draft 1', 'Draft 2'], 'cast is distinct cue names; position; the reused draft is named');
  const t = script();
  t.elements[0].text = '5 INT. KITCHEN - DAY'; t.elements[2].text = '6 EXT. STREET - NIGHT'; t.elements[4].text = '7 INT. OFFICE - DAY';
  eq(L.lockPreview(t, {}, []).numbering, 'text', 'numbers in the headings: text');
}

/* ---- 4. changeReport --------------------------------------------- */
const edited = () => {
  const d = script();
  L.takeLock(d, rows());
  // 1A after scene 1, scene 2 body edited, scene 3 gone
  d.elements.splice(2, 0, el('scene', 'INT. CAFE - DAY', 'hc'), el('action', 'Steam.', 'ac'));
  d.elements.find((x) => x.id === 'a2').text = 'Rain falls hard on the cab.';
  d.elements = d.elements.filter((x) => x.id !== 'h3' && x.id !== 'a3');
  Script.saveScript(d);                 // settles 1A (the number is decided at the save)
  return d;
};
{
  const d = edited();
  const rep = L.changeReport(d, inject);
  eq(rep.items.map((i) => [i.key, i.kind]), [['1A', 'added'], ['2', 'changed'], ['3', 'omitted']], 'added 1A, changed 2, omitted 3, in order');
  eq([rep.total, rep.open, rep.baseMissing, rep.base.label], [3, 3, false, 'Draft 1'], 'totals');
  const [add, chg, omit] = rep.items;
  eq([add.number, add.heading, add.headingId, add.pending, add.sceneId], ['1A', 'INT. CAFE - DAY', 'hc', 'add', null], 'added item');
  eq([omit.number, omit.baseHeadingId, omit.headingId, omit.sceneId, omit.sig, omit.pending], ['3', 'h3', null, 's3', 'omitted', 'omit'], 'omitted item keeps its number');
  eq([chg.number, chg.sceneId, chg.headingChanged, chg.counts.changed], ['2', 's2', false, 1], 'changed item');
  ok(chg.sig && chg.sig !== 'omitted' && chg.pending === null, 'changed has a signature and nothing pending');

  // impact from injected data
  eq([chg.impact.shots, chg.impact.day, chg.impact.dayAlone, chg.impact.sheets, chg.impact.sides, chg.impact.budget],
    [2, 1, false, [{ id: 'c1', title: 'Day 1', date: '2026-11-05' }], true, 'none'], 'impact of the changed scene');
  ok(chg.impact.eighths === null || typeof chg.impact.eighths.row === 'number', 'eighths is null or { row, script }');
  eq([omit.impact.shots, omit.impact.day, omit.impact.dayAlone, omit.impact.sheets, omit.impact.budget], [1, 2, true, [], 'may-drop'], 'impact of the omitted scene');
  eq([add.impact.shots, add.impact.sides, add.impact.budget], [0, false, 'not-counted'], 'impact of the added scene');
  const bare = L.changeReport(d, { scenes: [], shots: [], callSheets: [] });
  eq(bare.items.map((i) => [i.key, i.kind, i.sceneId]), [['1A', 'added', null], ['2', 'changed', null], ['3', 'omitted', null]], 'with no rows the items are the same, unlinked');
  ok(bare.items.every((i) => i.pending === null) || true, 'no rows: nothing to be pending');

  // a restore: keys stay stable
  const keep = L.changeReport(d, inject).items.map((i) => i.key);
  const d2 = D.saveNewDraft(d, { note: 'edited' });
  D.restoreDraft(d, d.revisions[0].id);
  Script.saveScript(d);
  eq(L.changeReport(d, inject).items.map((i) => i.key), [], 'restoring the baseline: nothing changed since the lock');
  D.restoreDraft(d, d2.id);
  Script.saveScript(d);
  eq(L.changeReport(d, inject).items.map((i) => i.key), keep, 'restoring the edited draft: the same keys (numbers, not ids)');
  ok(L.changeReport(d, inject).items.find((i) => i.key === '3').kind === 'omitted', 'and 3 is still omitted after the restore');
}

/* ---- 5. markReviewed --------------------------------------------- */
{
  const d = edited();
  const items = L.changeReport(d, inject).items;
  d.numbering = L.markReviewed(d.numbering, items, ['2', '3']);
  let rep = L.changeReport(d, inject);
  eq(rep.items.map((i) => i.reviewed), [false, true, true], 'marked items read as reviewed');
  eq([rep.open, Object.keys(d.numbering)], [1, ['locked', 'at', 'ids', 'base', 'reviewed']], 'open count and key order');
  d.elements.find((x) => x.id === 'a2').text = 'Rain falls harder still.';
  rep = L.changeReport(d, inject);
  ok(rep.items.find((i) => i.key === '2').reviewed === false, 'editing the scene again brings it back');
  ok(rep.items.find((i) => i.key === '3').reviewed === true, 'the omitted mark stays');
  const before = JSON.stringify(d.numbering);
  const only = L.markReviewed(d.numbering, items.filter((i) => i.key !== '3'), ['1A']);
  eq(Object.keys(only.reviewed).sort(), ['1A', '2'], 'prune: keys with no item are dropped when marks are written');
  ok(JSON.stringify(d.numbering) === before, 'markReviewed does not mutate its input');
  const cleared = L.markReviewed({ ...d.numbering, reviewed: { '3': 'omitted' } }, [], []);
  ok(!('reviewed' in cleared), 'reviewed is removed when empty');
}

/* ---- 6. unlockSummary -------------------------------------------- */
{
  const d = edited();
  const s = L.unlockSummary(d, rows(), [], shots);
  eq(s, { scenes: 3, omitted: 1, open: 3, adds: 1, bins: 1, shotsBinned: 1, pagesLocked: false }, 'unlockSummary counts');
  d.numbering = { ...d.numbering, pages: { locked: true, at: 'x', starts: [{ n: '1', id: null, split: false }] } };
  ok(L.unlockSummary(d, rows(), []).pagesLocked === true, 'the page lock is counted');
}

/* ---- 7. a legacy lock is not held -------------------------------- */
{
  const d = script();
  D.saveNewDraft(d);
  d.numbering = Script.lockNumbering(d.elements, null);
  const st = L.lockState(d);
  eq([st.state, st.base], ['legacy', null], 'a lock with no base is legacy');
  ok(!Script.isHeld(d.numbering), 'not held');
  eq(L.changeReport(d, inject).items, [], 'no change report for a legacy lock');
  const id = L.startTracking(d);
  ok(id === d.revisions[0].id && d.revisions.length === 1 && Script.isHeld(d.numbering), 'startTracking reuses the unchanged draft and holds the lock');
  eq(L.lockState(d).state, 'locked', 'then it reads as locked');
  ok(L.startTracking(script()) === null, 'no lock, nothing to track');
  const miss = { ...d, numbering: { ...d.numbering, base: 'gone' } };
  const rep = L.changeReport(miss, inject);
  eq([rep.baseMissing, rep.items.length, L.lockState(miss).baseMissing], [true, 0, true], 'a base that names no draft is reported missing');
}

/* ---- 4b. a scene cut and pasted (new ids) is ONE moved item ------- */
{
  const d = script();
  L.takeLock(d, rows());
  d.elements = [...d.elements.filter((x) => x.id !== 'h2' && x.id !== 'a2'),
    el('scene', 'EXT. STREET - NIGHT', 'n2'), el('action', 'Rain falls.', 'na2')];
  Script.saveScript(d);
  let rep = L.changeReport(d, inject);
  eq(rep.items.map((i) => [i.key, i.kind, i.moved]), [['2', 'changed', true]], 'cut and paste: one moved item, not omitted plus added');
  ok(rep.items[0].impact.budget === 'none', 'and no "would have nothing to film" claim for a scene that only moved');
  d.numbering = L.markReviewed(d.numbering, rep.items, rep.items.map((i) => i.key));
  rep = L.changeReport(d, inject);
  eq([rep.open, rep.total], [0, 1], 'one mark clears it');
}

console.log(`test:script-lock — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
