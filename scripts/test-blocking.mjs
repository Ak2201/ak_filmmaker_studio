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
{
  /* QA fix: after a delete, the next mark takes the first FREE label
     and spot, never a count (which repeated "Actor 2" on top of Cam B). */
  const bq = S.addBlock('scq');
  const q = ['actor', 'actor', 'camera', 'camera'].map((k) => S.addMark(bq.id, k));
  S.removeMark(bq.id, q[0].id);
  const nx = S.addMark(bq.id, 'actor');
  const marks = S.blocksOfScene('scq')[0].marks;
  eq(marks.map((m) => m.label), ['Actor 2', 'Cam A', 'Cam B', 'Actor 1'], 'a mark after a delete takes the free label');
  eq(new Set(marks.map((m) => m.x + ',' + m.y)).size, marks.length, 'and a free spot, not one a mark still holds');
  S.removeMark(bq.id, q[2].id);
  eq(S.addMark(bq.id, 'camera').label, 'Cam A', 'a free camera letter is reused');
  eq(nx.x + ',' + nx.y, '22,18', 'the freed first spot is the one reused');
  S.removeBlock(bq.id);
}
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

/* ---- tracks, lights, the floor's scale (14 Oct 2026) ----------- */
reset();
{
  const b = S.addBlock('sc9');
  eq(S.listBlocks()[0].widthM, '', 'a new block has no floor width');
  const t1 = S.addMark(b.id, 'track');
  const l1 = S.addMark(b.id, 'light');
  const l2 = S.addMark(b.id, 'light');
  eq([t1.kind, t1.label, l1.label, l2.label], ['track', 'Track 1', 'Light 1', 'Light 2'], 'track and light are kinds with their own labels');
  ok(t1.toX != null && t1.toY != null, 'a track is born with two ends');
  eq(S.updateMark(b.id, t1.id, { toX: null, toY: null }).toX != null, true, 'a track cannot lose its far end');
  eq(S.listBlocks()[0].marks.find((m) => m.id === l1.id).toX, null, 'a light has no move until given one');

  // old data: a block written before widthM existed reads back with it blank
  mem.set('fms_shots_v1', JSON.stringify({ shots: [], frames: [], boards: [], blocks: [
    { id: 'old', sceneId: 's', name: 'n', note: '', marks: [{ id: 'q', kind: 'track', x: 90, y: 10 }] }
  ] }));
  const old = S.listBlocks()[0];
  eq(old.widthM, '', 'an old block reads back with widthM blank');
  eq([old.marks[0].toX, old.marks[0].toY], [100, 10], 'an old track with no end gets one, clamped to the map');

  // scale and callouts
  eq(S.blockScale({ widthM: '' }), null, 'no width, no scale');
  eq(S.blockScale({ widthM: '0' }), null, 'zero width, no scale');
  eq(S.blockScale({ widthM: '-4' }), null, 'negative width, no scale');
  eq(S.blockScale({ widthM: 'wide' }), null, 'words, no scale');
  eq(S.floorWidthError('-3') !== '', true, 'negative width is refused with a message');
  eq(S.floorWidthError('0') !== '', true, 'zero width is refused');
  eq(S.floorWidthError('abc') !== '', true, 'words are refused');
  eq(S.floorWidthError('100000') !== '', true, 'a 100 km floor is refused');
  eq(S.floorWidthError('12,5'), '', 'a decimal comma is fine');
  eq(S.floorWidthError(''), '', 'blank means not said yet');
  eq(S.blockScale({ widthM: '10' }), 0.1, '10 m across 100 units is 0.1 m a unit');
  eq(S.blockScale({ widthM: '12,5' }), 0.125, 'a decimal comma is read');
  const blk = { widthM: '', marks: [
    { id: 'c', kind: 'camera', x: 0, y: 0 }, { id: 'a', kind: 'actor', x: 30, y: 40 },
    { id: 'z', kind: 'actor', x: 0, y: 10 }, { id: 'k', kind: 'mark', x: 5, y: 5 },
    { id: 't', kind: 'track', x: 10, y: 60, toX: 40, toY: 60 }, { id: 'l', kind: 'light', x: 90, y: 5 }
  ] };
  eq(S.blockCallouts(blk), [], 'no callouts without a floor width');
  const co = S.blockCallouts({ ...blk, widthM: '20' });
  eq(co.map((c) => c.kind + ':' + c.from + '>' + c.to + '=' + c.metres), ['reach:c>a=10', 'reach:c>z=2', 'track:t>t=6'],
    'camera→actor reach and track length, in metres; marks and lights are not measured');
  eq([co[0].x, co[0].y], [15, 20], 'a callout sits at the midpoint');
  eq(S.formatMetres(3.456), '3.5 m', 'metres print to a tenth');
  eq(S.formatMetres(NaN), '', 'a non-number prints nothing');
  eq(S.updateBlock('old', { widthM: '8' }).widthM, '8', 'widthM is an ordinary block field');
}

/* ---- shot status and coverage ----------------------------------- */
eq(S.shotStatus({ done: true }).id, 'can', 'done is in the can');
eq(S.shotStatus({ done: false }).label, 'To shoot', 'not done is to shoot');
eq(S.coverageOf([{ done: true, lens: '35mm' }, { done: false, lens: ' 35mm ' }, { done: false, lens: '' }]),
  { setups: 3, done: 1, open: 2, lenses: ['35mm'] }, 'coverageOf counts setups, done, open and distinct lenses');
eq(S.coverageOf([]), { setups: 0, done: 0, open: 0, lenses: [] }, 'an empty scene covers nothing');

/* ---- rig and camera link ---------------------------------------- */
reset();
eq([S.blankShot().rig, S.blankShot().cam], ['', ''], 'a blank shot has no rig and no camera');
{
  const bl = S.addBlock('scx');
  const camA = S.addMark(bl.id, 'camera'), camB = S.addMark(bl.id, 'camera');
  S.addMark(bl.id, 'actor');
  eq(S.sceneCameras('scx').map((c) => c.name), ['Cam A', 'Cam B'], 'cameras of a scene, labelled off the map');
  eq(S.sceneCameras('none'), [], 'no cameras for an unmapped scene');
  const bl2 = S.addBlock('scx'); S.addMark(bl2.id, 'camera');
  eq(S.sceneCameras('scx').map((c) => c.name), ['Setup 1 · Cam A', 'Setup 1 · Cam B', 'Setup 2 · Cam A'], 'two setups with cameras prefix the setup name');
  const s1 = S.addShot('scx', { rig: 'Gimbal', cam: camA.id });
  const s2 = S.addShot('scx', { cam: camA.id });
  S.addShot('scx');
  const list = S.listShots();
  eq(S.camOf(list[0])?.id, camA.id, 'camOf resolves the linked mark');
  eq(S.camOf(list[2]), null, 'an unlinked shot has no camera');
  eq(S.shotsOfCamera(camA.id, list).map((x) => x.id), [s1.id, s2.id], 'shotsOfCamera is the reverse link');
  eq(S.shotsOfCamera(camB.id, list), [], 'a camera nobody points at has no shots');
  eq(S.shotsOfCamera('', list), [], 'an empty id matches nothing');
  S.removeMark(bl.id, camA.id);
  eq(S.camOf(S.listShots()[0]), null, 'a deleted camera mark reads as no camera, not a stale label');
  eq(S.listShots()[0].rig, 'Gimbal', '…and the rig survives');
  // a shot stored before the fields existed
  mem.set('fms_shots_v1', JSON.stringify({ shots: [{ id: 'old', sceneId: 'scx', size: 'MS' }] }));
  eq([S.listShots()[0].rig, S.listShots()[0].cam], ['', ''], 'an older stored shot reads back with empty rig and cam');
}


/* ---- the blocking studio's contract (1 Nov 2026) ------------------ */
reset();
{
  // An OLD diagram: toX/toY only, no set, no axis, no path. Reading it
  // changes no stored byte, and every field it had reads back as before.
  const oldRaw = JSON.stringify({ shots: [], frames: [], boards: [], blocks: [
    { id: 'ob', sceneId: 's', name: 'Old', note: 'n', widthM: '10', marks: [
      { id: 'a', kind: 'actor', label: 'Ravi', x: 10, y: 20, rot: 90, toX: 30, toY: 40 },
      { id: 'c', kind: 'camera', label: 'Cam A', x: 50, y: 60, rot: 0, toX: null, toY: null },
      { id: 't', kind: 'track', label: 'Track 1', x: 5, y: 5, rot: 0, toX: 25, toY: 5 }
    ] }
  ] });
  mem.set('fms_shots_v1', oldRaw);
  const ob = S.listBlocks()[0];
  eq(mem.get('fms_shots_v1'), oldRaw, 'reading an old diagram writes nothing: the stored bytes are unchanged');
  const pick = (m) => ({ id: m.id, kind: m.kind, label: m.label, x: m.x, y: m.y, rot: m.rot, toX: m.toX, toY: m.toY });
  eq(ob.marks.map(pick), JSON.parse(oldRaw).blocks[0].marks, 'an old diagram\'s marks read back field for field');
  eq([ob.name, ob.note, ob.widthM], ['Old', 'n', '10'], 'its block fields too');
  eq([ob.set, ob.axis], [[], null], 'an old block reads back unfurnished and with no line');
  eq(ob.marks.map((m) => [m.path, m.curve, m.charId]), [[[], false, ''], [[], false, ''], [[], false, '']], 'old marks: no path, straight, no character');
  ok(!('set' in JSON.parse(mem.get('fms_shots_v1')).blocks[0]), 'no field is written into storage by a read');
}
{
  // set pieces: cleaning
  const sp = S.cleanSetPiece({ id: 'p1', kind: 'spaceship', x: 120, y: -3, w: 0.2, h: 500, rot: -30, label: 7, extra: 'kept' });
  eq([sp.kind, sp.x, sp.y, sp.w, sp.h, sp.rot, sp.label], ['prop', 100, 0, 1, 70, 330, '7'], 'a set piece is clamped: unknown kind is a prop, size 1..map, rot wrapped');
  eq(sp.extra, 'kept', 'an unknown field on a set piece rides along');
  const sp2 = S.cleanSetPiece({ kind: 'table', x: 12.345, y: 6.789, w: 14.26, h: 'x', rot: 359.7 });
  eq([sp2.x, sp2.y, sp2.w, sp2.h, sp2.rot], [12.3, 6.8, 14.3, S.SET_SIZE.table[1], 0], 'rounded to a tenth; a junk size takes the kind\'s default');
  ok(typeof sp2.id === 'string' && sp2.id.length > 4, 'a piece without an id gets one');
  eq(S.SET_KINDS, ['wall', 'door', 'window', 'table', 'chair', 'sofa', 'bed', 'counter', 'car', 'stairs', 'prop'], 'SET_KINDS is the contract');
  eq(S.blankSetPiece().kind, 'prop', 'a blank piece is a prop');
  // axis cleaning
  eq(S.cleanAxis({ x1: -5, y1: 10, x2: 200, y2: 80 }), { x1: 0, y1: 10, x2: 100, y2: 70 }, 'the axis is clamped to the map');
  eq(S.cleanAxis({ x1: 5, y1: 5, x2: 5, y2: 5 }), null, 'a zero-length axis is no axis');
  eq(S.cleanAxis({ x1: 'a', y1: 1, x2: 2, y2: 3 }), null, 'a junk axis is no axis');
  eq(S.cleanAxis(null), null, 'null stays null');
  // path cleaning, on read
  mem.set('fms_shots_v1', JSON.stringify({ blocks: [{ id: 'pb', sceneId: 's', marks: [
    { id: 'm1', kind: 'actor', x: 10, y: 10, toX: 20, toY: 20, curve: 'yes', charId: 5,
      path: [{ x: 30, y: 30, beat: 'sits' }, null, { x: 'q', y: 2 }, { x: 999, y: 40.04, beat: 9 }] },
    { id: 'm2', kind: 'actor', x: 10, y: 10, toX: null, toY: null, path: [{ x: 3, y: 3 }], curve: true },
    { id: 'm3', kind: 'track', x: 10, y: 10, toX: 30, toY: 10, path: [{ x: 3, y: 3 }] },
    { id: 'm4', kind: 'camera', x: 10, y: 10, toX: 15, toY: 15, path: 'nope', charId: 'ch_1' }
  ], set: [{ id: 's1', kind: 'door', x: 1, y: 1 }, null, 'x'], axis: { x1: 0, y1: 35, x2: 100, y2: 35 } }] }));
  const pb = S.listBlocks()[0];
  const [m1, m2, m3, m4] = pb.marks;
  eq(m1.path, [{ x: 30, y: 30, beat: 'sits' }, { x: 100, y: 40, beat: '9' }], 'path beats are clamped, rounded and junk beats dropped');
  eq([m1.curve, m1.charId], [false, ''], 'curve is a real boolean; charId a string');
  eq([m2.path, m2.curve], [[], true], 'no first leg, no beats after it');
  eq(m3.path, [], 'a track has no path');
  eq([m4.path, m4.charId], [[], 'ch_1'], 'a non-array path is empty; a string charId is kept');
  eq(pb.set.map((p) => [p.id, p.kind, p.w, p.h]), [['s1', 'door', ...S.SET_SIZE.door]], 'set pieces are cleaned and junk entries dropped');
  eq(pb.axis, { x1: 0, y1: 35, x2: 100, y2: 35 }, 'the axis reads back');
  const many = Array.from({ length: 40 }, (_, i) => ({ x: i, y: 1 }));
  S.updateMark('pb', 'm1', { path: many });
  eq(S.getBlock('pb').marks[0].path.length, S.PATH_MAX, 'a path is capped at PATH_MAX beats');
}
reset();
{
  // set CRUD, axis, getBlock
  const b = S.addBlock('sc');
  eq([S.getBlock(b.id).set, S.getBlock(b.id).axis], [[], null], 'a new block has no set and no line');
  eq(S.getBlock('nope'), null, 'getBlock of a missing id is null');
  const t = S.addSetPiece(b.id, 'table', { label: 'Dinner' });
  const c = S.addSetPiece(b.id, 'banana');
  eq([t.kind, t.w, t.h, t.label, c.kind], ['table', ...S.SET_SIZE.table, 'Dinner', 'prop'], 'addSetPiece takes the kind\'s size; unknown kind is a prop');
  ok(t.x !== c.x || t.y !== c.y, 'two pieces are born apart');
  eq(S.addSetPiece('nope', 'table'), null, 'addSetPiece on a missing block is null');
  const u = S.updateSetPiece(b.id, t.id, { w: 500, rot: 370, id: 'hijack' });
  eq([u.id, u.w, u.rot], [t.id, 100, 10], 'updateSetPiece cleans and keeps the id');
  eq(S.updateSetPiece(b.id, 'nope', {}), null, 'updateSetPiece on a missing piece is null');
  eq(S.removeSetPiece(b.id, c.id).set.map((p) => p.id), [t.id], 'removeSetPiece removes just that piece');
  eq(S.setAxis(b.id, { x1: 10, y1: 10, x2: 90, y2: 60 }), { x1: 10, y1: 10, x2: 90, y2: 60 }, 'setAxis stores the line');
  eq(S.setAxis(b.id, null), null, 'setAxis(null) clears it');
  eq(S.getBlock(b.id).axis, null, '…in storage');
  eq(S.setAxis('nope', null), undefined, 'setAxis on a missing block is undefined');
  const up = S.updateBlock(b.id, { set: [], name: 'X' });
  eq([up.name, up.set.length], ['X', 1], 'updateBlock cannot overwrite the set');
  // replaceBlock: whole block, cleaned; inserts when absent
  const snap = S.getBlock(b.id);
  S.addMark(b.id, 'actor');
  const back = S.replaceBlock(snap);
  eq(back.marks.length, 0, 'replaceBlock puts a snapshot back (undo)');
  eq(S.getBlock(b.id).set.map((p) => p.id), [t.id], '…set included');
  const fresh = S.replaceBlock({ id: 'new1', sceneId: 'sc', name: 'AI', marks: [{ kind: 'zebra', x: 500, y: 1, path: [{ x: 1, y: 1 }] }], set: [{ kind: 'bed' }], axis: { x1: 0, y1: 0, x2: 0, y2: 0 } });
  eq([fresh.marks[0].kind, fresh.marks[0].x, fresh.marks[0].path, fresh.set[0].kind, fresh.axis], ['actor', 100, [], 'bed', null], 'replaceBlock cleans every mark, piece and the axis');
  eq(S.blocksOfScene('sc').map((x) => x.id), [b.id, 'new1'], 'replaceBlock inserts an absent block at the end');
  eq(S.replaceBlock(null), null, 'replaceBlock(null) is null');
  eq(S.replaceBlock({ name: 'no id' }), null, 'replaceBlock without an id is null');
}
reset();
{
  // duplicateMarks
  const b = S.addBlock('sd');
  const a = S.addMark(b.id, 'actor', { label: 'Ravi', x: 10, y: 10, toX: 20, toY: 20, path: [{ x: 30, y: 30, beat: 'sits' }], charId: 'ch1' });
  const a2 = S.addMark(b.id, 'actor');
  const cam = S.addMark(b.id, 'camera');
  const made = S.duplicateMarks(b.id, [a.id, a2.id, cam.id]);
  eq(made.length, 3, 'three copies');
  ok(made.every((m) => ![a.id, a2.id, cam.id].includes(m.id)), 'copies get new ids');
  eq([made[0].label, made[0].x, made[0].y, made[0].toX, made[0].toY, made[0].path, made[0].charId],
    ['Ravi', 14, 14, 24, 24, [{ x: 34, y: 34, beat: 'sits' }], 'ch1'], 'a copy is offset with its move and beats; a typed name is kept');
  eq([made[1].label, made[2].label], ['Actor 2', 'Cam B'], 'a default name takes the next free one');
  eq(S.getBlock(b.id).marks.length, 6, 'copies are stored');
  eq(S.duplicateMarks(b.id, [cam.id], -100, 0)[0].x, 0, 'a copy is clamped to the map');
  eq(S.duplicateMarks(b.id, ['nope']), [], 'nothing to copy, nothing made');
  eq(S.duplicateMarks('nope', [a.id]), [], 'a missing block makes nothing');
}
{
  // derived: lens → field of view, the 180-degree line
  eq(S.lensFov('35mm'), 39.2, '35mm is about 39 degrees on Super 35');
  ok(S.lensFov('18mm') > S.lensFov('50mm') && S.lensFov('50mm') > S.lensFov('135mm'), 'wider lens, wider field');
  eq(S.lensFov('24-70mm'), S.lensFov('24mm'), 'a zoom range reads its wide end');
  eq([S.lensFov('zoom'), S.lensFov(''), S.lensFov(null)], [null, null, null], 'no focal length, no field');
  const shots = [{ id: '1', cam: 'k', lens: '85mm' }, { id: '2', cam: 'k', lens: '35mm' }, { id: '3', cam: 'x', lens: '14mm' }];
  eq(S.cameraFov('k', shots), S.lensFov('35mm'), 'a camera draws its widest linked lens');
  eq(S.cameraFov('none', shots), null, 'an unlinked camera has no derived field');
  const blk = { axis: { x1: 0, y1: 35, x2: 100, y2: 35 }, marks: [
    { id: 'c1', kind: 'camera', x: 50, y: 10 }, { id: 'c2', kind: 'camera', x: 20, y: 60 },
    { id: 'c3', kind: 'camera', x: 70, y: 35.2 }, { id: 'a', kind: 'actor', x: 50, y: 50 }] };
  const sides = S.axisSides(blk);
  eq([sides.left, sides.right, sides.on, sides.crossed], [['c1'], ['c2'], ['c3'], true], 'cameras on opposite sides of the line cross it');
  eq(S.axisSides({ ...blk, marks: blk.marks.filter((m) => m.id !== 'c2') }).crossed, false, 'one side only is fine');
  eq(S.axisSides({ marks: blk.marks }).crossed, false, 'no line, no warning');
}

/* ---- per-shot blocking: one floor, one diagram per shot (1 Nov 2026) -- */
{
  reset();
  mem.set('fms_shots_v1', JSON.stringify({ shots: [], frames: [], boards: [], blocks: [], newerTop: [1, 2] }));
  eq(S.blankBlock().shotId, '', 'a block is the floor (shotId "") by default');
  eq(S.cleanBlock({ id: 'x', shotId: 7 }).shotId, '', 'a non-string shotId reads back as the floor');
  const sA = S.addShot('scS', { setup: 'Cam B' });
  const sB = S.addShot('scS', {});
  const sC = S.addShot('scS', {});
  eq([S.floorOf('scS'), S.blockOfShot(sA.id)], [null, null], 'no floor and no diagram until something is drawn');
  const writesBefore = mem.get('fms_shots_v1');
  S.floorOf('scS'); S.blockOfShot(sA.id); S.sceneAxisSides('scS'); S.planSplit(null, S.listShots(), S.listBlocks());
  eq(mem.get('fms_shots_v1'), writesBefore, 'the readers never write (the idle-write check)');

  // A legacy COMBINED setup: three cameras, one rail, two actors.
  const legacy = S.addBlock('scS', { name: 'Setup 1' });
  const a1 = S.addMark(legacy.id, 'actor', { label: 'Meena', x: 30, y: 30, charId: 'ch1', futureField: 'keep' });
  const a2 = S.addMark(legacy.id, 'actor', { label: 'Ravi', x: 70, y: 30 });
  const cA = S.addMark(legacy.id, 'camera', { label: 'Cam A', x: 50, y: 60 });
  const cB = S.addMark(legacy.id, 'camera', { label: 'Cam B', x: 20, y: 60 });
  const cC = S.addMark(legacy.id, 'camera', { label: 'Cam C', x: 80, y: 10 });
  const rail = S.addMark(legacy.id, 'track', { x: 40, y: 60, toX: 60, toY: 60 });
  S.setAxis(legacy.id, { x1: 0, y1: 40, x2: 100, y2: 40 });
  S.updateShot(sB.id, { cam: cA.id });   // linked by id
  // sA matches Cam B by its setup name; Cam C matches nothing.
  eq(S.floorOf('scS').id, legacy.id, 'an older setup with no shotId IS the floor');
  ok(S.sceneAxisSides('scS').crossed, 'the scene-wide 180° check sees Cam C across the line');

  const snap = S.splitBlock(legacy.id);
  eq([snap.matched, snap.unmatched], [2, 1], 'split: two cameras found their shots, one did not');
  const floor = S.floorOf('scS');
  eq(floor.id, legacy.id, 'split: the original block stays, as the floor');
  eq(floor.marks.map((m) => m.label).sort(), ['Cam C', 'Meena', 'Ravi'], 'split: matched cameras and their rail left the floor; actors and the unmatched camera stayed');
  ok(!!floor.axis, 'split: the line stays on the floor');
  const dB = S.blockOfShot(sB.id), dA = S.blockOfShot(sA.id);
  eq([dB.name, dB.shotId, dB.sceneId], ['Shot 2', sB.id, 'scS'], 'split: a diagram per matched shot, named for it');
  eq(dB.marks.filter((m) => m.kind === 'camera').map((m) => m.id), [cA.id], 'split: shot 2 got Cam A, moved with its id');
  ok(dB.marks.some((m) => m.id === rail.id), 'split: the rail Cam A rides went with it');
  eq(dA.marks.filter((m) => m.kind === 'camera').map((m) => m.id), [cB.id], 'split: shot 1 got Cam B by setup name');
  const copies = dA.marks.filter((m) => m.kind === 'actor');
  eq(copies.map((m) => m.label), ['Meena', 'Ravi'], 'split: actors are COPIED into each shot diagram');
  ok(copies.every((m) => m.id !== a1.id && m.id !== a2.id), 'split: the copies have new ids');
  eq(copies[0].futureField, 'keep', 'split: an unknown field on a mark rides through');
  eq(S.listShots().find((s) => s.id === sA.id).cam, cB.id, 'split: shot 1 is now linked to Cam B (it was blank)');
  eq(S.listShots().find((s) => s.id === sB.id).cam, cA.id, 'split: shot 2 keeps its link');
  eq(S.blockOfShot(sC.id), null, 'split: an unmatched shot gets nothing');
  eq(JSON.parse(mem.get('fms_shots_v1')).newerTop, [1, 2], 'split: an unknown top-level field rides through');
  eq(S.sceneCameras('scS').length, 3, 'sceneCameras reads the floor and every shot diagram');
  eq(S.camOf(S.listShots().find((s) => s.id === sA.id)).blockId, dA.id, 'camOf finds a camera on a shot diagram');
  eq(S.shotsOfCamera(cA.id).map((s) => s.id), [sB.id], 'shotsOfCamera still works by id');
  ok(S.sceneAxisSides('scS').crossed, 'the 180° check still sees across the shot diagrams after the split');
  eq(S.splitBlock(legacy.id), null, 'split again: one camera left, nothing to split (idempotent)');
  eq(S.splitBlock(dA.id), null, 'a shot diagram is never split');

  // Undo puts it all back.
  const r = S.undoBlocking(snap);
  eq([r.reverted, r.kept], [4, 0], 'undo split: the floor, two diagrams and one link reverted');
  eq(S.blocksOfScene('scS').length, 1, 'undo split: only the original setup is left');
  eq(S.getBlock(legacy.id).marks.length, 6, 'undo split: every mark is back on it');
  eq(S.listShots().find((s) => s.id === sA.id).cam, '', 'undo split: the filled link is blank again');
  eq(S.listShots().find((s) => s.id === sB.id).cam, cA.id, 'undo split: a link the person made stays');

  // Undo keeps an edit made since.
  const snap2 = S.splitBlock(legacy.id);
  S.updateBlock(S.blockOfShot(sA.id).id, { note: 'typed after' });
  const r2 = S.undoBlocking(snap2);
  ok(r2.kept >= 1 && S.blockOfShot(sA.id).note === 'typed after', 'undo split: a diagram edited since is kept');

  // ensureShotBlock: only on a press, idempotent, never for a missing shot.
  const made = S.ensureShotBlock(sC.id);
  eq([made.shotId, made.name, made.marks.length], [sC.id, 'Shot 3', 0], 'ensureShotBlock makes an empty diagram named for the shot');
  eq(S.ensureShotBlock(sC.id).id, made.id, 'ensureShotBlock again returns the same diagram');
  eq(S.ensureShotBlock('nope'), null, 'ensureShotBlock of a missing shot is null');

  // Deleting a shot leaves its diagram, as an orphan the floor view lists.
  S.removeShot(sC.id);
  ok(!!S.getBlock(made.id), 'removeShot leaves the shot\'s diagram (drawn work is never a side effect)');
  ok(S.isOrphanBlock(S.getBlock(made.id)), 'and it reads as an orphan');
  ok(!S.isOrphanBlock(S.floorOf('scS')), 'the floor is never an orphan');

  // writeBlocking fills cam only where blank.
  const s4 = S.addShot('scS', { cam: 'typed' });
  const w = S.writeBlocking({ cams: [{ id: s4.id, cam: 'ai-cam' }] });
  eq([w.cams.length, S.listShots().find((s) => s.id === s4.id).cam], [0, 'typed'], 'writeBlocking never overwrites a shot\'s camera');
  reset();
}

console.log(`test:blocking — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
