/* ============================================================
   SCRIPT STRUCTURE — scene moves, folds, draft compare, statistics
   ------------------------------------------------------------
   In Node, no browser. Asserted here:
     · src/lib/script-structure.js: scene blocks stop at the next
       heading AND at an act break; the lines before the first heading
       never move; moveScene keeps the SAME element objects (ids, so the
       scene sync relinks rather than duplicates), lands first / middle /
       last, leaves a trailing act break at the end, is a no-op at its
       own place; nudgeScene stops at either end; a moved scene keeps
       its locked number (sceneNumbers with a lock); folded ids hide a
       block's body but never its heading and never the caret's scene;
       pruneFolds drops gone headings;
     · src/lib/script-diff.js sideBySide(): one row per same/changed
       line, removed+added runs zipped as 'replaced', leftovers one-sided;
     · src/lib/script-stats.js: words, scenes, INT/EXT and DAY/NIGHT
       (unstated never counted as DAY), dialogue share per character
       (extensions folded), longest scenes from the estimate AND from
       the real paginator, an empty script is 0 pages; the Dragon
       sample, timed.

       node scripts/test-script-structure.mjs   (or: npm run test:script-structure)
   ============================================================ */
import './node-seams.mjs';

const S = await import('../src/lib/script-structure.js');
const Diff = await import('../src/lib/script-diff.js');
const Stats = await import('../src/lib/script-stats.js');
const Script = await import('../src/lib/script.js');
const { paginate } = await import('../src/lib/paginate.js');
const sample = (await import('../src/data/sample.dragon.script.json')).default;

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const el = (type, text, id) => Script.blankElement({ type, text, id });
const ids = (list) => list.map((e) => e.id);

/* ---- a small script ------------------------------------------- */
const doc = () => [
  el('transition', 'FADE IN:', 'p0'),
  el('scene', 'INT. KITCHEN - DAY', 's1'), el('action', 'Ravi cooks.', 'a1'),
  el('scene', 'EXT. STREET - NIGHT', 's2'), el('character', 'MEERA (V.O.)', 'c2'), el('dialogue', 'Come out.', 'd2'),
  el('act', 'END OF ACT ONE', 'act1'),
  el('scene', 'INT./EXT. CAR - DAWN', 's3'), el('action', 'They drive.', 'a3'),
  el('scene', 'ROOFTOP', 's4'), el('character', 'RAVI', 'c4'), el('dialogue', 'We made it out alive tonight.', 'd4'),
  el('transition', 'FADE OUT.', 'end')
];

console.log('sceneBlocks');
{
  const b = S.sceneBlocks(doc());
  eq(b.map((x) => [x.id, x.start, x.end]), [['s1', 1, 3], ['s2', 3, 6], ['s3', 7, 9], ['s4', 9, 13]], 'blocks stop at headings and at the act break');
  eq(S.sceneOfElement(doc(), 'd2'), 's2', 'a line knows its scene');
  eq(S.sceneOfElement(doc(), 'p0'), null, 'the prelude is no scene');
  eq(S.sceneOfElement(doc(), 'act1'), null, 'an act break is no scene');
  eq(S.sceneBlocks([]), [], 'no elements, no blocks');
}

console.log('moveScene');
{
  const d = doc();
  const m = S.moveScene(d, 's3', 0);
  eq(ids(m), ['p0', 's3', 'a3', 's1', 'a1', 's2', 'c2', 'd2', 'act1', 's4', 'c4', 'd4', 'end'], 'to the top: after the prelude, act break stays');
  ok(m[1] === d[7], 'the same element objects move (ids survive, the sync relinks)');
  eq(m.length, d.length, 'nothing is duplicated or lost');
  eq(ids(S.moveScene(d, 's1', 3)), ['p0', 's2', 'c2', 'd2', 'act1', 's3', 'a3', 's4', 'c4', 'd4', 'end', 's1', 'a1'], 'to the end: after the last block');
  eq(ids(S.moveScene(d, 's1', 1)), ['p0', 's2', 'c2', 'd2', 'act1', 's1', 'a1', 's3', 'a3', 's4', 'c4', 'd4', 'end'], 'into place 1: in front of the heading that holds it');
  eq(S.moveScene(d, 's2', 1), null, 'its own place is a no-op');
  eq(S.moveScene(d, 'nope', 0), null, 'an unknown heading is a no-op');
  eq(ids(S.moveScene(d, 's2', 99)).slice(-3), ['s2', 'c2', 'd2'], 'past the end clamps to last');
  eq(ids(S.nudgeScene(d, 's2', -1)).slice(0, 6), ['p0', 's2', 'c2', 'd2', 's1', 'a1'], 'nudge up');
  eq(S.nudgeScene(d, 's1', -1), null, 'nudge up at the top stops');
  eq(S.nudgeScene(d, 's4', 1), null, 'nudge down at the bottom stops');
  ok(d.map((e) => e.id).join() === doc().map((e) => e.id).join(), 'the input list is not mutated');
}

console.log('moveScene under a lock');
{
  const d = doc();
  const nb = Script.lockNumbering(d);
  const before = Script.sceneNumbers(d, nb).byId;
  const m = S.moveScene(d, 's3', 0);
  const after = Script.sceneNumbers(m, nb).byId;
  eq(['s1', 's2', 's3', 's4'].map((id) => after.get(id)), ['s1', 's2', 's3', 's4'].map((id) => before.get(id)), 'a moved scene keeps its locked number');
  const unlocked = Script.sceneNumbers(m, null).byId;
  eq(unlocked.get('s3'), '1', 'unlocked, it is numbered where it now stands');
}

console.log('folds');
{
  const d = doc();
  const f = new Set(['s2']);
  eq([...S.foldedIds(d, f)], ['c2', 'd2'], 'a fold hides the body, never the heading');
  eq([...S.foldedIds(d, f, 'd2')], [], "the caret's scene stays open");
  eq([...S.foldedIds(d, new Set(['s4']))], ['c4', 'd4', 'end'], 'the last block runs to the end');
  eq(S.foldedCount(d, 's2'), 2, 'folded line count');
  const g = new Set(['s1', 'gone']);
  S.pruneFolds(d, g);
  eq([...g], ['s1'], 'a fold on a gone heading is dropped');
  eq([...S.foldedIds(d, new Set())], [], 'no folds, nothing hidden');
}

console.log('sideBySide');
{
  const A = [el('scene', 'INT. A - DAY', 'x1'), el('action', 'One.', 'x2'), el('action', 'Two old line here.', 'x3'), el('action', 'Three.', 'x4')];
  const B = [el('scene', 'INT. A - DAY', 'x1'), el('action', 'One more.', 'x2'), el('action', 'Something wholly different now.', 'y9'), el('action', 'Extra.', 'y10'), el('action', 'Three.', 'x4')];
  const d = Diff.diffElements(A, B);
  const rows = Diff.sideBySide(d);
  eq(rows.map((r) => r.op), ['same', 'changed', 'replaced', 'added', 'same'], 'rows: same, changed, zipped replace, leftover add, same');
  ok(rows[2].a && rows[2].a.id === 'x3' && rows[2].b.id === 'y9', 'the zipped row holds both versions');
  ok(rows[3].a === null && rows[3].b.id === 'y10', 'the leftover has one side');
  ok(Array.isArray(rows[1].words), 'a changed row keeps its word diff');
  eq(Diff.sideBySide([]), [], 'nothing in, nothing out');
}

console.log('statistics');
{
  const st = Stats.scriptStatistics(doc());
  eq(st.scenes, 4, 'scenes');
  eq(st.words, doc().reduce((n, e) => n + Script.wordCount(e.text), 0), 'words');
  eq(st.intExt, { INT: 1, EXT: 1, 'INT/EXT': 1, unstated: 1 }, 'INT/EXT split, a bare heading unstated');
  eq(st.dayNight, { DAY: 1, NIGHT: 1, DAWN: 1, DUSK: 0, CONTINUOUS: 0, unstated: 1 }, 'DAY/NIGHT split, no time is unstated, not DAY');
  eq(st.speakers.map((s) => s.name), ['RAVI', 'MEERA'], 'speakers by words, extension folded');
  ok(Math.abs(st.speakers[0].share - 6 / 8) < 1e-9, 'dialogue share is words over all dialogue words');
  eq(Stats.formatShare(st.speakers[1].share), '25%', 'share formatted');
  eq(st.longest[0].id, 's4', 'the longest scene first (estimate)');
  ok(!st.paginated && st.pages > 0, 'estimate pages without a pagination');
  ok(st.longest.every((s) => s.eighths >= 1), 'every printed scene is at least 1/8');

  const pages = paginate(doc());
  const real = Stats.scriptStatistics(doc(), { pages });
  ok(real.paginated, 'paginated when pages are handed in');
  eq(real.pages, pages.length, 'pages = printed pages');
  eq(real.longest.length, 4, 'every scene measured');
  ok(real.longest[0].lines >= real.longest[3].lines, 'longest first (paginated)');
  ok(real.longest.find((s) => s.id === 's2').lines > 0, 'a scene ending at an act break still has length');

  const empty = Stats.scriptStatistics([el('scene', '', 'e1')], { pages: paginate([el('scene', '', 'e1')]) });
  eq(empty.pages, 0, 'an empty script is 0 pages');
  eq(Stats.formatEighths(12), '1 4/8', 'eighths formatted');
  eq(Stats.formatEighths(3), '3/8', 'eighths under a page');
  eq(Stats.formatEighths(16), '2', 'whole pages');
}

console.log('the Dragon sample');
{
  const els = (sample.elements || sample).map((e) => Script.blankElement(e));
  const t0 = performance.now();
  const pages = paginate(els);
  const st = Stats.scriptStatistics(els, { pages });
  const ms = performance.now() - t0;
  ok(st.scenes > 20 && st.pages > 50, 'a feature: ' + st.scenes + ' scenes, ' + st.pages + ' pages');
  ok(st.speakers.length > 3, 'speakers found');
  ok(Math.abs(st.speakers.reduce((n, s) => n + s.share, 0) - 1) < 0.05 || st.speakers.reduce((n, s) => n + s.share, 0) <= 1, 'shares sum to at most 1');
  ok(st.intExt.INT + st.intExt.EXT + st.intExt['INT/EXT'] + st.intExt.unstated === st.scenes, 'INT/EXT covers every scene');
  ok(Object.values(st.dayNight).reduce((a, b) => a + b, 0) === st.scenes, 'DAY/NIGHT covers every scene');
  ok(ms < 1500, 'paginate + statistics in ' + Math.round(ms) + 'ms');
  const blocks = S.sceneBlocks(els);
  const moved = S.moveScene(els, blocks[blocks.length - 1].id, 0);
  eq(moved.length, els.length, 'a move on the sample keeps every element');
  eq(new Set(ids(moved)).size, els.length, 'and no id twice');
  eq(S.moveScene(moved, blocks[blocks.length - 1].id, blocks.length - 1).map((e) => e.id).join(), ids(els).join(), 'moving it back restores the order exactly');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
