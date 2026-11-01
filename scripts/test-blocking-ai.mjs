#!/usr/bin/env node
/* ============================================================
   TEST — AI blocking's pure half (src/lib/blocking-ai-model.js), in Node
   ------------------------------------------------------------
       node scripts/test-blocking-ai.mjs   (or: npm run test:blocking-ai)

   No browser and no provider: every check on a model's reply (clamps,
   unknown kinds, charIds, caps, enhance ops), the prompts and schemas,
   applyBlockOps, and that the vocabulary agrees with shots.js. The two
   Desk tasks are checked to be registered in ai-tasks.js by id.
   ============================================================ */
import { readFileSync } from 'node:fs';
import { mem } from './node-seams.mjs';

const M = await import('../src/lib/blocking-ai-model.js');
const S = await import('../src/lib/shots.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const throwsMalformed = (fn, m) => {
  try { fn(); ok(false, m + ' (did not throw)'); }
  catch (e) { ok(e && e.kind === 'malformed' && !(e instanceof TypeError) && /nothing/i.test(e.message), m + ' — ' + (e && e.message)); }
};
void mem;

/* ---- the vocabulary agrees with shots.js ------------------------ */
eq(M.BLOCK_W, S.BLOCK_W, 'BLOCK_W matches shots.js');
eq(M.BLOCK_H, S.BLOCK_H, 'BLOCK_H matches shots.js');
eq(M.MARK_KINDS.slice(), S.BLOCK_KINDS.map((k) => k.id), 'MARK_KINDS match shots.js BLOCK_KINDS');
if (Array.isArray(S.SET_KINDS)) eq(M.SET_KINDS.slice(), S.SET_KINDS.map((k) => (typeof k === 'string' ? k : k.id)), 'SET_KINDS match shots.js');
else ok(M.SET_KINDS.length === 11 && M.SET_KINDS.at(-1) === 'prop', 'SET_KINDS fallback is the contract list (shots.js has none yet)');
if (S.BLOCK_WIDTH_MAX_M) eq(M.WIDTH_MAX_M, S.BLOCK_WIDTH_MAX_M, 'WIDTH_MAX_M matches shots.js');

/* ---- marks ------------------------------------------------------- */
const chars = ['ch1', 'ch2'];
let m = M.cleanAIMark({ kind: 'actor', label: ' MEENA ', x: -10, y: 999, rot: 450, hasMove: true, toX: 150, toY: -5,
  path: [{ x: 20, y: 20, beat: 'she hears the door' }], curve: true, charId: 'ch1' }, { charIds: chars });
eq([m.x, m.y, m.rot, m.toX, m.toY], [0, 70, 90, 100, 0], 'mark: coordinates clamped into the map, rot wrapped');
eq(m.label, 'MEENA', 'mark: label trimmed');
eq(m.charId, 'ch1', 'mark: a supplied charId is kept');
eq(m.path, [{ x: 20, y: 20, beat: 'she hears the door' }], 'mark: path kept after the first leg');
ok(m.curve === true, 'mark: curve kept on a move');
eq(M.cleanAIMark({ kind: 'actor', x: 1, y: 1, charId: 'nobody' }, { charIds: chars }).charId, '', 'mark: an unknown charId is dropped');
eq(M.cleanAIMark({ kind: 'camera', x: 1, y: 1, charId: 'ch1' }, { charIds: chars }).charId, '', 'mark: only an actor carries a charId');
eq(M.cleanAIMark({ kind: 'dragon', x: 1, y: 1 }), null, 'mark: an unknown kind is dropped');
eq(M.cleanAIMark('junk'), null, 'mark: a non-object is dropped');
m = M.cleanAIMark({ kind: 'actor', x: 'abc', y: null, rot: 'x' });
eq([m.x, m.y, m.rot, m.toX], [50, 35, 0, null], 'mark: junk numbers fall back to the centre, no move');
m = M.cleanAIMark({ kind: 'actor', x: 12.345, y: 6.789, hasMove: false, toX: 0, toY: 0, path: [], curve: true });
eq([m.x, m.y, m.toX, m.toY, m.curve], [12.3, 6.8, null, null, false], 'mark: hasMove false means no move, no curve; rounded to a tenth');
m = M.cleanAIMark({ kind: 'actor', x: 10, y: 10, hasMove: false, path: [{ x: 30, y: 30, beat: 'a' }, { x: 40, y: 40, beat: 'b' }] });
eq([m.toX, m.toY, m.path.length, m.path[0].beat], [30, 30, 1, 'b'], 'mark: stops with no first leg — the first stop becomes the leg');
m = M.cleanAIMark({ kind: 'actor', x: 10, y: 10, hasMove: true, toX: 20, toY: 20,
  path: Array.from({ length: 10 }, (_, i) => ({ x: i, y: i, beat: 'b' + i })) });
eq(m.path.length, M.MAX_BEATS, 'mark: path capped at MAX_BEATS');
m = M.cleanAIMark({ kind: 'track', x: 10, y: 10, hasMove: false, path: [{ x: 1, y: 1, beat: '' }] });
eq([m.toX, m.toY, m.path], [34, 10, []], 'track: always two ends, never a path');

/* ---- set pieces and the axis ------------------------------------- */
let p = M.cleanAIPiece({ kind: 'table', label: 'Dining', x: 200, y: -3, w: 0, h: 500, rot: -90 });
eq([p.kind, p.x, p.y, p.w, p.h, p.rot], ['table', 100, 0, 1, 70, 270], 'piece: clamped, w/h within 1..map, rot wrapped');
eq(M.cleanAIPiece({ kind: 'spaceship', x: 1, y: 1, w: 2, h: 2 }).kind, 'prop', 'piece: unknown kind → prop');
eq(M.cleanAIPiece(null), null, 'piece: junk dropped');
eq(M.cleanAIAxis({ on: true, x1: -1, y1: 10, x2: 120, y2: 10 }), { x1: 0, y1: 10, x2: 100, y2: 10 }, 'axis: clamped');
eq(M.cleanAIAxis({ on: false, x1: 0, y1: 0, x2: 10, y2: 10 }), null, 'axis: on false is no line');
eq(M.cleanAIAxis({ on: true, x1: 5, y1: 5, x2: 5, y2: 5 }), null, 'axis: zero length is no line');
eq(M.cleanAIAxis({ on: true, x1: 'a', y1: 5, x2: 5, y2: 5 }), null, 'axis: junk is no line');
eq([M.cleanWidth(6), M.cleanWidth('7,25'), M.cleanWidth(0), M.cleanWidth(9999), M.cleanWidth('x')], ['6', '7.3', '', '', ''], 'widthM: typed text or blank');

/* ---- a draft: ONE floor, ONE diagram per shot (1 Nov 2026) ---------- */
const many = (n, f) => Array.from({ length: n }, (_, i) => f(i));
const cam = (label, x, y, o = {}) => ({ kind: 'camera', label, x, y, rot: 0, hasMove: false, toX: 0, toY: 0, path: [], curve: false, charId: '', ...o });
const act = (label, x, y, o = {}) => ({ kind: 'actor', label, x, y, rot: 0, hasMove: false, toX: 0, toY: 0, path: [], curve: false, charId: '', ...o });
const SHOT_IDS = ['sh1', 'sh2', 'sh3'];
const d = M.cleanDraft({
  floor: {
    name: 'Kitchen', note: 'Two-hander at the table.', widthM: 6,
    set: many(30, (i) => ({ kind: i === 0 ? 'nope' : 'chair', label: '', x: i, y: i, w: 3, h: 3, rot: 0 })).concat(['junk']),
    axis: { on: true, x1: 10, y1: 35, x2: 90, y2: 35 }
  },
  actors: [act('MEENA', 30, 30, { charId: 'ch1' }), cam('Stray', 1, 1), { kind: 'ghost' }],
  shots: [
    { shotId: 'sh1', number: '1', note: 'Master', marks: [cam('Cam A', 50, 60), cam('Cam B', 20, 60), act('MEENA', 30, 30, { charId: 'ch1' })] },
    { shotId: 'sh2', number: '2', note: 'Single', marks: [act('RAVI', 70, 30, { charId: 'ch2' })] },
    { shotId: 'nope', number: '9', note: '', marks: [cam('Cam X', 5, 5)] },
    { shotId: 'sh1', number: '1', note: 'again', marks: [cam('Cam A', 50, 60)] },
    { shotId: 'sh3', number: '3', note: 'Over', marks: [cam('Cam C', 40, 55, { hasMove: true, toX: 45, toY: 50 }), act('RAVI', 70, 30, { charId: 'ch2' })] }
  ]
}, { charIds: chars, shotIds: SHOT_IDS });
eq(d.floor.set.length, M.MAX_SET, 'draft: floor set capped at MAX_SET');
eq(d.floor.set[0].kind, 'prop', 'draft: unknown set kind became prop');
eq([d.floor.name, d.floor.widthM, !!d.floor.axis], ['Kitchen', '6', true], 'draft: floor name, width, axis');
eq(d.actors.map((m) => m.label), ['MEENA'], 'draft: floor actors kept; a camera with no shot and an unknown kind dropped');
eq(d.shots.map((s) => s.shotId), ['sh1', 'sh3'], 'draft: shots kept only for offered ids, once each, and only with a camera');
eq(d.shots[0].marks.filter((m) => m.kind === 'camera').map((m) => m.label), ['Cam A'], 'draft: exactly ONE camera per shot (the second dropped)');
eq(d.shots[0].marks.length, 2, 'draft: the shot keeps its actor');
eq(d.shots[1].marks[0].toX, 45, 'draft: a camera move is kept');
eq(d.dropped, 6 + 1 + 2 + 1 + 1 + 1 + 1, 'draft: dropped counted (six over the cap, junk, stray camera + ghost, second camera, cameraless shot, unknown id, duplicate id)');
throwsMalformed(() => M.cleanDraft(null), 'draft: null reply → clear malformed error');
throwsMalformed(() => M.cleanDraft('not json'), 'draft: a string → clear malformed error');
throwsMalformed(() => M.cleanDraft({ floor: {}, actors: [], shots: 'x' }), 'draft: shots not an array → malformed');
throwsMalformed(() => M.cleanDraft({ marks: [cam('A', 1, 1)] }), 'draft: the OLD one-map shape is refused, not half-read');
throwsMalformed(() => M.cleanDraft({ floor: {}, actors: [], shots: [{ shotId: 'zz', marks: [cam('A', 1, 1)] }] }, { shotIds: SHOT_IDS }), 'draft: nothing usable → malformed');
const lean = M.cleanDraft({ shots: [{ shotId: 'sh2', marks: [cam('A', 5, 5)] }] }, { shotIds: SHOT_IDS });
eq([lean.floor.set, lean.floor.axis, lean.floor.name, lean.floor.widthM, lean.actors], [[], null, '', '', []], 'draft: missing optional parts read as empty');
const floorOnly = M.cleanDraft({ floor: { set: [{ kind: 'wall', x: 50, y: 1, w: 100, h: 1 }] }, actors: [], shots: [] });
eq([floorOnly.floor.set.length, floorOnly.shots.length], [1, 0], 'draft: a scene with no shots can still get its floor');

/* ---- Desk items and picking --------------------------------------- */
const items = M.draftItems(d, { charName: (id) => (id === 'ch2' ? 'RAVI' : ''), shotLabel: (id) => (id === 'sh1' ? '#1 WS' : '') });
eq(items.map((it) => it.id), ['floor', 'shot:sh1', 'shot:sh3'], 'items: the floor, then one per shot');
ok(items.every((it) => it.id && it.text), 'items: each has an id and a text');
ok(items[1].text.includes('#1 WS') && items[1].text.includes('Cam A'), 'items: a shot names itself and its one camera');
ok(items[2].detail.includes('RAVI'), 'items: a shot lists its actors');
ok(/24 set pieces/.test(items[0].text) && /180°/.test(items[0].text), 'items: the floor says what it holds');
const picked = M.pickDraft(d, [{ id: 'floor' }, { id: 'shot:sh3' }]);
eq([!!picked.floor, picked.floor.actors.length, picked.shots.map((s) => s.shotId)], [true, 1, ['sh3']], 'pickDraft: only the ticked parts');
const none = M.pickDraft(d, []);
eq([none.floor, none.shots.length], [null, 0], 'pickDraft: nothing ticked, nothing picked');

/* ---- planDraftApply: fill, never overwrite ------------------------- */
{
  let n = 0;
  const make = { block: (p) => ({ id: 'bk' + (++n), shotId: '', name: '', note: '', widthM: '', marks: [], set: [], axis: null, ...p }),
    mark: (p) => ({ id: 'mk' + (++n), ...p }), piece: (p) => ({ id: 'st' + (++n), ...p }) };
  const shotsRec = { sh1: { id: 'sh1', number: '1', cam: '' }, sh3: { id: 'sh3', number: '3', cam: 'typed-cam' } };
  const all = M.pickDraft(d, [{ id: 'floor' }, { id: 'shot:sh1' }, { id: 'shot:sh3' }]);
  // No floor, no shot diagrams yet.
  let plan = M.planDraftApply(all, { sceneId: 'sc1', shotOf: (id) => shotsRec[id] || null, floorName: 'Floor plan', make });
  eq(plan.blocks.map((b) => [b.shotId, b.name]), [['', 'Kitchen'], ['sh1', 'Shot 1'], ['sh3', 'Shot 3']], 'plan: a new floor and one diagram per shot');
  eq(plan.blocks[0].set.length, M.MAX_SET, 'plan: the new floor holds the set');
  ok(plan.blocks.slice(1).every((b) => b.marks.filter((m) => m.kind === 'camera').length === 1 && !b.set.length && !b.axis), 'plan: each shot diagram has ONE camera and no set or line');
  eq(plan.cams.map((c) => c.id), ['sh1'], 'plan: shot.cam filled only where blank (sh3 names a camera already)');
  eq(plan.cams[0].cam, plan.blocks[1].marks.find((m) => m.kind === 'camera').id, 'plan: the link is the new camera mark\'s id');
  // A floor already there, a shot diagram a person drew, an empty one.
  const floor = { id: 'F', sceneId: 'sc1', shotId: '', name: 'Mine', note: 'typed', widthM: '', marks: [{ id: 'a1', kind: 'actor', x: 1, y: 1 }],
    set: [{ id: 'p1', kind: 'chair', x: 1, y: 1, w: 3, h: 3, rot: 0 }], axis: null };
  const drawn = { id: 'D', sceneId: 'sc1', shotId: 'sh1', name: 'Shot 1', marks: [{ id: 'x', kind: 'camera', x: 9, y: 9 }], set: [], axis: null };
  const empty = { id: 'E', sceneId: 'sc1', shotId: 'sh3', name: 'Shot 3 (mine)', note: '', marks: [], set: [], axis: null };
  const byShot = { sh1: drawn, sh3: empty };
  const floorBefore = JSON.stringify(floor);
  plan = M.planDraftApply(all, { sceneId: 'sc1', floor, blockOfShot: (id) => byShot[id] || null, shotOf: (id) => shotsRec[id] || null, make });
  eq(JSON.stringify(floor), floorBefore, 'plan: the stored floor object is not mutated');
  const nf = plan.blocks.find((b) => b.id === 'F');
  eq([nf.name, nf.note, nf.widthM, !!nf.axis], ['Mine', 'typed', '6', true], 'plan: floor name and note kept, blank width and line filled');
  ok(nf.set.some((p) => p.id === 'p1') && nf.set.length === 1 + M.MAX_SET - 3, 'plan: the person\'s piece kept; a same-kind piece within 3 units not added twice');
  eq(nf.marks.map((m) => m.id), ['a1'], 'plan: the floor already has actors, so none are added');
  eq(plan.skipped, ['sh1'], 'plan: a shot diagram a person drew is SKIPPED');
  const ne = plan.blocks.find((b) => b.id === 'E');
  eq([ne.name, ne.marks.length, ne.shotId], ['Shot 3 (mine)', 2, 'sh3'], 'plan: an EMPTY shot diagram is filled in place, its name kept');
  // Nothing new for the floor → not written.
  const full = { ...nf };
  plan = M.planDraftApply(M.pickDraft(d, [{ id: 'floor' }]), { sceneId: 'sc1', floor: full, make });
  eq(plan.blocks.length, 0, 'plan: a floor that already has it all is not rewritten (idempotent)');
  eq(M.planDraftApply(M.pickDraft(d, [{ id: 'shot:sh1' }]), { sceneId: 'sc1', shotOf: () => null, make }).skipped, ['sh1'], 'plan: a shot deleted since is skipped');
}

/* ---- the whole Accept against shots.js, with a faked model reply ---- */
{
  mem.delete('fms_shots_v1');
  mem.set('fms_shots_v1', JSON.stringify({ shots: [], frames: [], boards: [], blocks: [], futureTop: { keep: 1 } }));
  const s1 = S.addShot('scA', { size: 'WS', lens: '24mm' });
  const s2 = S.addShot('scA', { size: 'CU', lens: '85mm' });
  const reply = {
    floor: { name: 'Hall', note: '', widthM: 8, set: [{ kind: 'door', label: 'Front', x: 0, y: 30, w: 1.2, h: 7, rot: 0 }], axis: { on: true, x1: 10, y1: 30, x2: 90, y2: 30 } },
    actors: [act('MEENA', 40, 30)],
    shots: [
      { shotId: s1.id, number: '1', note: 'Master', marks: [cam('Cam A', 50, 60), act('MEENA', 40, 30)] },
      { shotId: s2.id, number: '2', note: 'Close', marks: [cam('Cam B', 45, 45), act('MEENA', 40, 32)] }
    ]
  };
  const draft = M.cleanDraft(reply, { shotIds: [s1.id, s2.id] });
  const pickAll = M.pickDraft(draft, M.draftItems(draft));
  const blocks = S.listBlocks(), shots = S.listShots();
  const plan = M.planDraftApply(pickAll, { sceneId: 'scA', floor: S.floorOf('scA', blocks), blockOfShot: (id) => S.blockOfShot(id, blocks),
    shotOf: (id) => shots.find((x) => x.id === id) || null, floorName: 'Floor plan', make: { block: S.blankBlock, mark: S.blankMark, piece: S.blankSetPiece } });
  const snap = S.writeBlocking({ blocks: plan.blocks, cams: plan.cams });
  eq(S.blocksOfScene('scA').length, 3, 'accept: one floor and two shot diagrams on the scene');
  const fl = S.floorOf('scA');
  ok(fl && fl.set.length === 1 && fl.axis && !fl.marks.some((m) => m.kind === 'camera'), 'accept: the floor holds the set and line, no camera');
  const b1 = S.blockOfShot(s1.id), b2 = S.blockOfShot(s2.id);
  eq([b1.marks.filter((m) => m.kind === 'camera').length, b2.marks.filter((m) => m.kind === 'camera').length], [1, 1], 'accept: each shot diagram has ONE camera');
  const after = S.listShots();
  eq(after.find((x) => x.id === s1.id).cam, b1.marks.find((m) => m.kind === 'camera').id, 'accept: shot 1 linked to its camera');
  ok(S.camOf(after.find((x) => x.id === s2.id)) && S.camOf(after.find((x) => x.id === s2.id)).blockId === b2.id, 'accept: camOf finds a camera on a shot diagram');
  eq(S.sceneCameras('scA').length, 2, 'accept: sceneCameras reads across the shot diagrams');
  ok(JSON.parse(mem.get('fms_shots_v1')).futureTop.keep === 1, 'accept: an unknown top-level field rides through the write');
  // Undo: everything back.
  const r = S.undoBlocking(snap);
  eq([S.blocksOfScene('scA').length, S.listShots().every((x) => !x.cam), r.kept], [0, true, 0], 'undo: the diagrams gone and the links blank again');
  // Undo keeps what was edited since.
  const snap2 = S.writeBlocking({ blocks: M.planDraftApply(pickAll, { sceneId: 'scA', shotOf: (id) => S.listShots().find((x) => x.id === id), make: { block: S.blankBlock, mark: S.blankMark, piece: S.blankSetPiece } }).blocks });
  const edited = S.blockOfShot(s1.id);
  S.updateBlock(edited.id, { note: 'my note' });
  const r2 = S.undoBlocking(snap2);
  eq([r2.reverted, r2.kept, !!S.blockOfShot(s1.id), !!S.blockOfShot(s2.id)], [2, 1, true, false], 'undo: a diagram edited since is kept, the rest reverted');
  mem.delete('fms_shots_v1');
}

/* ---- enhance ------------------------------------------------------ */
const block = {
  id: 'bk1', sceneId: 'sc1', name: 'Setup 1', note: '', widthM: '6',
  marks: [
    { id: 'mkA', kind: 'actor', label: 'MEENA', x: 30, y: 30, rot: 90, toX: null, toY: null, path: [], curve: false, charId: 'ch1' },
    { id: 'mkC', kind: 'camera', label: 'Cam A', x: 50, y: 60, rot: 0, toX: null, toY: null, path: [], curve: false, charId: '' }
  ],
  set: [{ id: 'st1', kind: 'table', label: '', x: 50, y: 30, w: 10, h: 6, rot: 0 }],
  axis: null
};
const sug = (o) => ({ text: '', why: '', markId: '', mark: { kind: 'actor', x: 0, y: 0 }, piece: { kind: 'prop', x: 0, y: 0, w: 1, h: 1 }, axis: { on: false, x1: 0, y1: 0, x2: 0, y2: 0 }, ...o });
const e = M.cleanEnhance({
  note: 'Mostly sound.',
  suggestions: [
    sug({ type: 'add-mark', text: 'Add a single on Meena', why: 'Her turn needs it', mark: { kind: 'camera', label: 'Cam B', x: 20, y: 60, rot: 0, hasMove: false } }),
    sug({ type: 'update-mark', markId: 'mkC', mark: { kind: 'actor', label: 'Cam A', x: 45, y: 60, rot: 0, hasMove: false, charId: 'ch1' } }),
    sug({ type: 'update-mark', markId: 'mkA', mark: { kind: 'actor', label: 'MEENA', x: 30, y: 30, rot: 90, hasMove: false, charId: 'ch1' } }),
    sug({ type: 'remove-mark', markId: 'ghost' }),
    sug({ type: 'remove-mark', markId: 'mkA' }),
    sug({ type: 'remove-mark', markId: 'mkA' }),
    sug({ type: 'add-set', piece: { kind: 'door', label: 'Kitchen', x: 0, y: 30, w: 1, h: 8, rot: 0 } }),
    sug({ type: 'set-axis', axis: { on: true, x1: 10, y1: 30, x2: 90, y2: 30 } }),
    sug({ type: 'set-axis', axis: { on: false } }),
    sug({ type: 'explode' }),
    'junk'
  ]
}, { block, charIds: chars });
const types = e.items.map((it) => it.op.type);
eq(types, ['add-mark', 'update-mark', 'remove-mark', 'add-set', 'set-axis'], 'enhance: valid ops kept in order');
const upd = e.items[1].op;
eq([upd.id, upd.patch], ['mkC', { x: 45 }], 'enhance: update is a patch of what changed; kind and charId stay a camera\'s');
ok(e.items.every((it) => it.text), 'enhance: every item has a text (a plain one when the model gave none)');
eq(e.items[0].detail, 'Her turn needs it', 'enhance: the reason is the detail');
eq(e.dropped, 6, 'enhance: dropped = no-op update, unknown id, duplicate, axis-off with no axis, bad type, junk');
eq(e.note, 'Mostly sound.', 'enhance: the note');
const capped = M.cleanEnhance({ note: '', suggestions: many(20, (i) => sug({ type: 'add-set', piece: { kind: 'chair', x: i, y: i, w: 2, h: 2, rot: 0 } })) }, { block });
eq(capped.items.length, M.MAX_OPS, 'enhance: suggestions capped at MAX_OPS');
eq(M.cleanEnhance({ suggestions: [] }, { block }).items, [], 'enhance: an empty list is an honest answer');
throwsMalformed(() => M.cleanEnhance(null, { block }), 'enhance: null reply → malformed');
throwsMalformed(() => M.cleanEnhance({ suggestions: 'x' }, { block }), 'enhance: suggestions not an array → malformed');
eq(M.cleanEnhance({ suggestions: [sug({ type: 'remove-mark', markId: 'mkA' })] }, {}).items, [], 'enhance: no block → nothing names a mark');

/* ---- applyBlockOps ------------------------------------------------ */
const before = JSON.stringify(block);
const { block: after, applied } = M.applyBlockOps(block, e.items.map((it) => it.op));
eq(JSON.stringify(block), before, 'apply: the original block is untouched (it is the undo)');
eq(applied, 5, 'apply: five ops applied');
eq(after.marks.map((x) => x.label), ['Cam A', 'Cam B'], 'apply: Meena removed, Cam B added');
eq(after.marks.find((x) => x.id === 'mkC').x, 45, 'apply: Cam A moved');
ok(after.marks[1].id && after.marks[1].id !== 'mkC', 'apply: a new mark gets a fresh id');
eq(after.set.map((x) => x.kind), ['table', 'door'], 'apply: the door added');
eq(after.axis, { x1: 10, y1: 30, x2: 90, y2: 30 }, 'apply: the line set');
eq(M.applyBlockOps(after, [{ type: 'set-axis', axis: null }]).block.axis, null, 'apply: set-axis null removes the line');
eq(M.applyBlockOps(block, [{ type: 'update-mark', id: 'gone', patch: { x: 1 } }, { type: 'remove-mark', id: 'gone' }, null]).applied, 0, 'apply: ops naming a missing mark are skipped');
const made = M.applyBlockOps({ marks: [] }, [{ type: 'add-mark', mark: { kind: 'actor', x: 1, y: 1 } }], { makeMark: (q) => ({ id: 'given', ...q }) });
eq(made.block.marks[0].id, 'given', 'apply: makeMark gives ids (shots.js blankMark in the app)');
eq(M.applyBlockOps(null, []).block.marks, [], 'apply: no block → an empty one, not a crash');

/* ---- prompts and schemas ----------------------------------------- */
const job = { sceneId: 'sc1', number: '4', slug: 'INT. KITCHEN — NIGHT', synopsis: 'Meena waits.',
  characters: [{ id: 'ch1', name: 'MEENA' }, { id: '', name: 'RAVI' }],
  shots: [{ number: '4A', size: 'WS', lens: '24mm', setup: 'Cam A', description: 'The kitchen' }],
  setups: ['Setup 1: 1 actor, 1 camera (Cam A)'], script: 'INT. KITCHEN - NIGHT\nMeena waits.', prompt: 'She enters from the yard.' };
const dp = M.buildDraftPrompt(job);
ok(dp.includes('ch1 — MEENA') && dp.includes('24mm') && dp.includes('She enters from the yard.') && dp.includes('Setup 1'), 'draft prompt: characters with ids, lenses, the director\'s ask, existing setups');
eq(M.buildDraftPrompt({ ...job, user: 'EDITED BOX', refine: 'Previous answer: …' }), 'EDITED BOX\n\nPrevious answer: …', 'draft prompt: an edited box is sent as is, refine appended');
const ep = M.buildEnhancePrompt({ ...job, block });
ok(ep.includes('mkA actor "MEENA"') && ep.includes('st1 table'), 'enhance prompt: the diagram with its ids');
ok(M.DRAFT_SYSTEM.includes('180°') && /master/i.test(M.DRAFT_SYSTEM) && M.DRAFT_SYSTEM.includes('top'), 'system: the craft and the map');
const ds = M.draftSchema(['ch1'], ['sh1', 'sh2']);
const shotMark = ds.properties.shots.items.properties.marks.items.properties;
eq(shotMark.kind.enum, M.MARK_KINDS.slice(), 'schema: mark kinds enum');
eq(shotMark.charId.enum, ['', 'ch1'], 'schema: charId pinned to the offered ids');
eq(ds.properties.actors.items.properties.charId.enum, ['', 'ch1'], 'schema: floor actors pinned to the offered ids');
eq(ds.properties.floor.properties.set.items.properties.kind.enum, M.SET_KINDS.slice(), 'schema: set kinds enum');
eq(ds.properties.shots.items.properties.shotId.enum, ['sh1', 'sh2'], 'schema: shotId pinned to the shot ids sent');
ok(!('marks' in ds.properties) && !('set' in ds.properties.shots.items.properties), 'schema: no one-map marks, and no set on a shot');
eq(M.enhanceSchema([], [], { shot: true }).properties.suggestions.items.properties.type.enum, M.SHOT_OP_TYPES.slice(), 'schema: a shot diagram\'s review offers no set or line ops');
ok(M.DRAFT_SYSTEM.includes('ONE FLOOR, ONE DIAGRAM PER SHOT') && /exactly ONE camera/.test(M.DRAFT_SYSTEM), 'system: the floor is shared, one camera per shot');
ok(/FLOOR PLAN/.test(M.ENHANCE_SYSTEM) && /one camera/.test(M.ENHANCE_SYSTEM), 'system: enhance knows floor vs shot diagram');
{
  const fp = M.buildEnhancePrompt({ ...job, block: { ...block, shotId: 'sh1', name: 'Shot 1' }, floor: block });
  ok(fp.includes('THE FLOOR') && fp.includes('reference only') && fp.includes('THE DIAGRAM of Shot 1'), 'enhance prompt: a shot is reviewed over its floor');
  const dp2 = M.buildDraftPrompt({ ...job, shots: [{ id: 'sh9', number: '4A' }] });
  ok(dp2.includes('id sh9') && /one diagram per listed shot/.test(dp2), 'draft prompt: shot ids are sent');
  const es2 = M.cleanEnhance({ note: '', suggestions: [sug({ type: 'add-set', piece: { kind: 'door', x: 1, y: 1, w: 1, h: 5 } }), sug({ type: 'set-axis', axis: { on: true, x1: 0, y1: 0, x2: 9, y2: 9 } }), sug({ type: 'remove-mark', markId: 'mkA' })] }, { block, shot: true });
  eq([es2.items.map((i) => i.op.type), es2.dropped], [['remove-mark'], 2], 'enhance: set and line ops dropped on a shot diagram');
}
const strict = (sc) => sc && typeof sc === 'object' && (sc.type !== 'object' || (sc.additionalProperties === false
  && JSON.stringify(Object.keys(sc.properties).sort()) === JSON.stringify(sc.required.slice().sort())
  && Object.values(sc.properties).every(strict))) && (sc.type !== 'array' || strict(sc.items));
ok(strict(ds), 'schema: draft — every object closed and fully required');
ok(strict(M.draftSchema([], [])), 'schema: a scene with no shots still gets a closed schema');
const es = M.enhanceSchema(['ch1'], ['mkA', 'mkC']);
ok(strict(es), 'schema: enhance — every object closed and fully required');
eq(es.properties.suggestions.items.properties.markId.enum, ['', 'mkA', 'mkC'], 'schema: markId pinned to the block\'s marks');
eq(es.properties.suggestions.items.properties.type.enum, M.OP_TYPES.slice(), 'schema: op types');

/* ---- undoBlockOps: an Undo restores only what it wrote ------------ */
{
  const before = { id: 'b1', marks: [{ id: 'm1', x: 1, y: 1 }, { id: 'm2', x: 2, y: 2 }, { id: 'm3', x: 3, y: 3 }], set: [], axis: null };
  const after = { id: 'b1', marks: [{ id: 'm1', x: 9, y: 9 }, { id: 'm2', x: 2, y: 2 }, { id: 'm4', x: 4, y: 4 }], set: [{ id: 's1', kind: 'table' }], axis: { x1: 0, y1: 0, x2: 1, y2: 1 } };
  let u = M.undoBlockOps(before, after, after);
  eq(u.block.marks.map((x) => x.id + ':' + x.x), ['m1:1', 'm2:2', 'm3:3'], 'undo: update, add and remove all reversed when untouched');
  eq([u.block.set.length, u.block.axis, u.reverted, u.kept], [0, null, 5, 0], 'undo: added piece removed, axis restored');
  const edited = JSON.parse(JSON.stringify(after));
  edited.marks[0].x = 50; edited.marks[2].label = 'MEENA'; edited.marks.push({ id: 'm9', x: 7, y: 7 });
  edited.axis = { x1: 5, y1: 5, x2: 6, y2: 6 };
  u = M.undoBlockOps(before, after, edited);
  eq(u.block.marks.map((x) => x.id + ':' + x.x), ['m1:50', 'm2:2', 'm3:3', 'm4:4', 'm9:7'], 'undo: hand edits after Accept survive');
  eq([u.block.set.length, u.block.axis.x1, u.reverted, u.kept], [0, 5, 2, 3], 'undo: edited mark, edited added mark and edited axis kept');
  u = M.undoBlockOps(before, after, { id: 'b1', marks: [{ id: 'm1', x: 9, y: 9, label: '', k: 1 }].map(({ k, ...r }) => r), set: [], axis: null });
  ok(u.kept >= 1, 'undo: a field order or extra field counts as an edit, not a crash');
  u = M.undoBlockOps(before, after, { id: 'b1', marks: [{ y: 9, x: 9, id: 'm1' }], set: [], axis: { y2: 1, x2: 1, y1: 0, x1: 0 } });
  eq([u.block.marks[0].x, u.block.axis], [1, null], 'undo: key order does not make a mark look edited');
}

/* ---- registration (by source; ai-tasks.js needs the browser to load) */
const tasksSrc = readFileSync(new URL('../src/lib/ai-tasks.js', import.meta.url), 'utf8');
ok(/id: 'blocking-draft'/.test(tasksSrc) && /id: 'blocking-enhance'/.test(tasksSrc), 'ai-tasks: both tasks defined');
ok(/blockingDraftTask, blockingEnhanceTask\]/.test(tasksSrc), 'ai-tasks: both in ALL_TASKS');
const aiSrc = readFileSync(new URL('../src/lib/ai.js', import.meta.url), 'utf8');
ok(/export async function draftBlocking/.test(aiSrc) && /export async function enhanceBlocking/.test(aiSrc), 'ai.js: draftBlocking and enhanceBlocking exported');
const modelSrc = readFileSync(new URL('../src/lib/blocking-ai-model.js', import.meta.url), 'utf8');
ok(!/^\s*import\b/m.test(modelSrc), 'blocking-ai-model.js stays pure: it imports nothing');

console.log(`test-blocking-ai: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
