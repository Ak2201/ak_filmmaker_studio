/* ============================================================
   TEST — blocking diagrams (src/lib/shots.js), in Node
   ------------------------------------------------------------
       node scripts/test-blocking.mjs   (or: npm run test:blocking)
   ============================================================ */
import { mem } from './node-seams.mjs';

const S = await import('../src/lib/shots.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const reset = () => mem.delete('fms_shots_v1');

/* ---- clampPoint ------------------------------------------------- */
eq(S.clampPoint(-5, 999), { x: 0, y: S.BLOCK_H }, 'clamps into the map');
eq(S.clampPoint(150, -1), { x: S.BLOCK_W, y: 0 }, 'clamps the other corner');
eq(S.clampPoint(12.34, 56.78), { x: 12.3, y: 56.8 }, 'rounds to a tenth');
eq(S.clampPoint('abc', undefined), { x: 50, y: 35 }, 'junk falls back to the centre');
eq(S.clampPoint('20', '10'), { x: 20, y: 10 }, 'numeric strings are accepted');
ok(S.SHOT_LENSES.includes('35mm') && S.SHOT_LENSES.length > 5, 'SHOT_LENSES lists focal lengths');

/* ---- blank / add ------------------------------------------------ */
reset();
eq(S.listBlocks(), [], 'no blocks to start');
const b1 = S.addBlock('sc1');
const b2 = S.addBlock('sc1');
const b3 = S.addBlock('sc2');
eq([b1.name, b2.name, b3.name], ['Setup 1', 'Setup 2', 'Setup 1'], 'setups number per scene');
eq(S.blocksOfScene('sc1').map((b) => b.id), [b1.id, b2.id], 'blocksOfScene filters by scene, in order');
eq(S.blocksOfScene('nope'), [], 'blocksOfScene of an unknown scene is empty');
ok(S.blankBlock().id !== S.blankBlock().id, 'blocks get unique ids');

/* ---- addMark: labels and stagger -------------------------------- */
const a1 = S.addMark(b1.id, 'actor');
const a2 = S.addMark(b1.id, 'actor');
const c1 = S.addMark(b1.id, 'camera');
const c2 = S.addMark(b1.id, 'camera');
const k1 = S.addMark(b1.id, 'mark');
eq([a1.label, a2.label, c1.label, c2.label, k1.label], ['Actor 1', 'Actor 2', 'Cam A', 'Cam B', 'Mark 1'], 'labels count per kind');
const pts = [a1, a2, c1, c2, k1].map((m) => m.x + ',' + m.y);
eq(new Set(pts).size, 5, 'new marks are staggered, none on top of another');
ok([a1, a2, c1, c2, k1].every((m) => m.x >= 0 && m.x <= 100 && m.y >= 0 && m.y <= 70), 'all marks land inside the map');
eq(S.addMark('nope', 'actor'), null, 'addMark on a missing block is null');
eq(S.addMark(b1.id, 'actor', { label: 'Ravi' }).label, 'Ravi', 'an explicit label wins');

/* ---- cleaned on read -------------------------------------------- */
reset();
mem.set('fms_shots_v1', JSON.stringify({
  shots: [], frames: [], boards: [],
  blocks: [{
    id: 'bk1', sceneId: 's', name: 'n', note: '', marks: [
      { id: 'm1', kind: 'banana', x: 500, y: -4, rot: 725, toX: 10, toY: null },
      { id: 'm2', kind: 'camera', x: 10.26, y: 20, rot: -90, toX: 'x', toY: 5 },
      { id: 'm3', kind: 'mark', x: 1, y: 2, rot: 359.6, toX: 150, toY: 33.33 },
      { id: 'm4', kind: 'actor', x: 1, y: 2, rot: 'junk' }
    ]
  }, null]
}));
{
  const [blk] = S.listBlocks().filter(Boolean).slice(0, 1);
  const [m1, m2, m3, m4] = blk.marks;
  eq(m1.kind, 'actor', 'a bad kind becomes actor');
  eq([m1.x, m1.y], [100, 0], 'out-of-range position is clamped on read');
  eq(m1.rot, 5, 'rot 725 normalises to 5');
  eq([m1.toX, m1.toY], [null, null], 'a half-set move endpoint clears both');
  eq(m2.rot, 270, 'rot -90 normalises to 270');
  eq([m2.toX, m2.toY], [null, null], 'a non-numeric endpoint clears both');
  eq(m2.x, 10.3, 'position rounds to a tenth on read');
  eq(m3.rot, 0, 'rot 359.6 rounds to 360 and wraps to 0');
  eq([m3.toX, m3.toY], [100, 33.3], 'a full endpoint is clamped and rounded');
  eq(m4.rot, 0, 'junk rot is 0');
  eq([m4.toX, m4.toY], [null, null], 'an absent move stays null');
}

/* ---- updateBlock cannot overwrite marks ------------------------- */
reset();
const u = S.addBlock('s1');
const um = S.addMark(u.id, 'actor');
const upd = S.updateBlock(u.id, { name: 'Renamed', note: 'hi', marks: [], id: 'hijack', sceneId: 's1' });
eq([upd.name, upd.note, upd.id], ['Renamed', 'hi', u.id], 'updateBlock edits fields and keeps the id');
eq(upd.marks.map((m) => m.id), [um.id], 'updateBlock cannot overwrite marks');
eq(S.listBlocks()[0].marks.length, 1, '…also in storage');
eq(S.updateBlock('nope', { name: 'x' }), null, 'updateBlock on a missing id is null');

/* ---- updateMark ------------------------------------------------- */
const um2 = S.updateMark(u.id, um.id, { x: 999, rot: 450, toX: 30, toY: 40, id: 'hijack' });
eq([um2.id, um2.x, um2.rot, um2.toX, um2.toY], [um.id, 100, 90, 30, 40], 'updateMark cleans and keeps the id');
eq(S.updateMark(u.id, 'nope', {}), null, 'updateMark on a missing mark is null');
eq(S.updateMark('nope', um.id, {}), null, 'updateMark on a missing block is null');

/* ---- remove ----------------------------------------------------- */
const extra = S.addMark(u.id, 'mark');
const after = S.removeMark(u.id, um.id);
eq(after.marks.map((m) => m.id), [extra.id], 'removeMark removes just that mark');
eq(S.removeMark('nope', um.id), null, 'removeMark on a missing block is null');
const other = S.addBlock('s2');
const left = S.removeBlock(u.id);
eq(left.map((b) => b.id), [other.id], 'removeBlock removes just that block');
eq(S.listBlocks().map((b) => b.id), [other.id], '…in storage');

/* ---- shots/frames/boards writes keep blocks --------------------- */
S.addShot('s2', { description: 'x' });
S.addBoard({ name: 'B' });
eq(S.listBlocks().length, 1, 'adding a shot and a board keeps blocks');

console.log(`test:blocking — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
