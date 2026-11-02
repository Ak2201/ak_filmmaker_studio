/* ============================================================
   TEST — the Screenplay Writer's undo/redo history
   (src/lib/edit-history.js), in Node. No browser: the module is pure.
   Coalescing per burst, every kind of structural step, caret restore,
   structural sharing, the co-edit stamp, the limit, redo cleared by a
   new edit, and no-op steps skipped.
   ============================================================ */
const H = await import('../src/lib/edit-history.js');
const { createHistory, snapshotOf, restoreElements, sameElement } = H;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.error('  ✗', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

/* A tiny editor over the model, the way editor.js drives the stack. */
function rig(opts) {
  const doc = { elements: [{ id: 'a', type: 'action', text: '' }] };
  const h = createHistory(opts);
  let clock = 0;
  const snap = () => (prev) => snapshotOf(doc.elements, prev);
  const api = {
    doc, h,
    tick(ms) { clock += ms; },
    type(id, chars, caret) {
      for (const ch of chars) {
        const el = doc.elements.find((e) => e.id === id);
        h.record(snap(), { id, start: el.text.length, end: el.text.length },
          { kind: 'typing', key: id + ':ins', now: clock, moved: caret === 'moved' });
        caret = null;
        el.text += ch;
        clock += 50;
      }
    },
    step(kind, fn, caret = null, meta = null) { h.record(snap(), caret, { kind, meta }); fn(doc.elements); },
    undo() { const e = h.undo(snap(), null); if (e) doc.elements.splice(0, doc.elements.length, ...restoreElements(e.snap, doc.elements)); return e; },
    redo() { const e = h.redo(snap(), null); if (e) doc.elements.splice(0, doc.elements.length, ...restoreElements(e.snap, doc.elements)); return e; },
    texts: () => doc.elements.map((e) => e.type[0] + ':' + e.text)
  };
  return api;
}

/* ---- coalescing ---------------------------------------------- */
{
  const r = rig();
  r.type('a', 'Hello');
  eq(r.h.size().undo, 1, 'a burst of typing is one step');
  r.tick(2000);
  r.type('a', ' world');
  eq(r.h.size().undo, 2, 'a pause starts a new step');
  r.undo();
  eq(r.texts(), ['a:Hello'], 'undo takes back the second burst only');
  r.undo();
  eq(r.texts(), ['a:'], 'and then the first');
  eq(r.undo(), null, 'nothing left to undo');
  r.redo(); r.redo();
  eq(r.texts(), ['a:Hello world'], 'redo replays both');
}
{
  const r = rig();
  r.type('a', 'Hi');
  r.type('a', ' there', 'moved');
  eq(r.h.size().undo, 2, 'a caret move ends the burst');
}
{
  const r = rig();
  r.type('a', 'Hi');
  r.h.record(() => snapshotOf(r.doc.elements), null, { kind: 'typing', key: 'a:del', now: 0 });
  eq(r.h.size().undo, 2, 'switching from typing to deleting is a new step');
}

/* ---- structural steps ---------------------------------------- */
{
  const r = rig();
  r.type('a', 'He walks in and sits.');
  // a split (Return mid-line): text change + insert, one step
  r.step('split', (els) => { els[0].text = 'He walks in'; els.splice(1, 0, { id: 'b', type: 'action', text: 'and sits.' }); }, { id: 'a', start: 11, end: 11 });
  eq(r.texts(), ['a:He walks in', 'a:and sits.'], 'split made');
  const e = r.undo();
  eq(r.texts(), ['a:He walks in and sits.'], 'one undo joins the split back');
  eq(e.caret, { id: 'a', start: 11, end: 11 }, 'and gives back the caret where Return was pressed');
  r.redo();
  eq(r.texts(), ['a:He walks in', 'a:and sits.'], 'redo splits again, ids kept');
  eq(r.doc.elements[1].id, 'b', 'the split line keeps its id on redo (so its note stays)');
  // a join (Backspace at the start)
  r.step('join', (els) => { els[0].text = 'He walks in and sits.'; els.splice(1, 1); });
  r.undo();
  eq(r.texts(), ['a:He walks in', 'a:and sits.'], 'undo a join');
  // a type change, and the auto-format
  r.step('type', (els) => { els[1].type = 'dialogue'; });
  r.step('auto', (els) => { els[1].type = 'transition'; }, null, { auto: 'b' });
  const u = r.undo();
  eq(r.texts(), ['a:He walks in', 'd:and sits.'], 'undo the auto-format: the line exactly as typed');
  eq(u.meta, { auto: 'b' }, 'and the step says it was the formatter (so the editor stops re-inferring)');
  r.undo();
  eq(r.texts(), ['a:He walks in', 'a:and sits.'], 'undo the type change');
  // remove, move, dual, alternates
  r.step('remove', (els) => { els.splice(1, 1); });
  r.undo();
  eq(r.doc.elements.map((x) => x.id), ['a', 'b'], 'undo a removal: the line back where it was, with its id');
  r.step('move', (els) => { [els[0], els[1]] = [els[1], els[0]]; });
  r.undo();
  eq(r.doc.elements.map((x) => x.id), ['a', 'b'], 'undo a move');
  r.step('alts', (els) => { els[1].alts = ['and stands.']; els[1].text = 'and sits!'; });
  r.undo();
  ok(!('alts' in r.doc.elements[1]) && r.doc.elements[1].text === 'and sits.', 'undo a take swap: the alts field and the text');
}

/* ---- redo is cleared by a new edit ---------------------------- */
{
  const r = rig();
  r.type('a', 'One');
  r.undo();
  ok(r.h.canRedo(), 'redo available');
  r.type('a', 'Two');
  ok(!r.h.canRedo(), 'a new edit clears redo');
}

/* ---- no-op steps are skipped ---------------------------------- */
{
  const r = rig();
  r.type('a', 'X');
  r.step('type', () => {});                    // a checkpoint that changed nothing
  r.undo();
  eq(r.texts(), ['a:'], 'undo skips a step that changed nothing');
}

/* ---- the snapshot ----------------------------------------------- */
{
  const els = Array.from({ length: 3000 }, (_, i) => ({ id: 'e' + i, type: 'action', text: 'Line ' + i }));
  const s1 = snapshotOf(els, null);
  els[5].text = 'changed';
  const t0 = performance.now();
  const s2 = snapshotOf(els, s1);
  const ms = performance.now() - t0;
  ok(s2[4] === s1[4] && s2[6] === s1[6], 'unchanged elements are shared between snapshots');
  ok(s2[5] !== s1[5] && s2[5].text === 'changed', 'the changed one is copied');
  ok(Object.isFrozen(s2) && Object.isFrozen(s2[5]), 'snapshots are frozen');
  ok(ms < 50, `a 3,000-line snapshot is cheap (${ms.toFixed(1)}ms)`);
  els[5].text = 'again';
  ok(s2[5].text === 'changed', 'editing the model never edits history');
  const back = restoreElements(s1, els);
  back[0].text = 'edited after restore';
  ok(s1[0].text === 'Line 0', 'restored elements are fresh copies');
}
{
  // unknown fields ride along; the co-edit stamp is the CURRENT one
  const s = snapshotOf([{ id: 'x', type: 'dialogue', text: 'hi', u: 100, future: { a: 1 } }], null);
  const back = restoreElements(s, [{ id: 'x', type: 'dialogue', text: 'hello', u: 500 }]);
  eq(back[0], { id: 'x', type: 'dialogue', text: 'hi', u: 500, future: { a: 1 } }, 'unknown fields restored, u kept current');
  ok(sameElement({ id: 'x', text: 'a', u: 1 }, { id: 'x', text: 'a', u: 2 }), 'u alone is not a change');
}

/* ---- the limit and amendTop ----------------------------------- */
{
  const r = rig({ limit: 5 });
  for (let i = 0; i < 9; i++) r.step('insert', (els) => els.push({ id: 'n' + i, type: 'action', text: String(i) }));
  eq(r.h.size().undo, 5, 'the stack keeps the last `limit` steps');
  r.h.amendTop({ auto: 'n8' });
  eq(r.undo().meta, { auto: 'n8' }, 'amendTop marks the open step');
}

console.log(`test:history — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
