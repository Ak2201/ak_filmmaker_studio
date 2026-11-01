/* ============================================================
   SCENE SYNC AND THE BIN — the script drives the scenes, in Node
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md revision 3 §1d. src/lib/scene-sync.js
   turns a script and a scene list into a plan (pure), and
   src/lib/scene-bin.js takes a scene and every dependent out of every
   model and puts them back. Asserted here:
     · add / edit / delete headings give the right plan;
     · a cut-and-paste is a move, not a delete;
     · restore puts the scene, its shots, frames, strip slot, call
       sheet places and edit-log notes back BYTE-IDENTICAL;
     · emptying the bin leaves no sceneId orphan in any model;
     · unlinked, hand-made rows are never touched;
     · an empty script bins nothing; a mass removal is flagged;
     · removeScene() goes through the same cascade.

       node scripts/test-sync.mjs      (or: npm run test:sync)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Sync = await import('../src/lib/scene-sync.js');
const Bin = await import('../src/lib/scene-bin.js');
const Scenes = (await import('../src/lib/scenes.js')).default;
const Shots = await import('../src/lib/shots.js');
const Contacts = await import('../src/lib/contacts.js');
const Edit = await import('../src/lib/editlog.js');
const { blankElement } = await import('../src/lib/script.js');
const script = (await import('../src/data/sample.dragon.script.json')).default;
const sample = (await import('../src/data/sample.dragon.json')).default;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const KEYS = ['fms_scenes_v1', 'fms_shots_v1', 'fms_contacts_v1', 'fms_edit_v1', 'fms_scene_bin_v1'];
const snap = () => Object.fromEntries(KEYS.map((k) => [k, mem.has(k) ? mem.get(k) : null]));
const reset = () => KEYS.forEach((k) => mem.delete(k));
const el = (type, text, id) => blankElement({ type, text, ...(id ? { id } : {}) });

/* ---- the field ------------------------------------------------ */
eq(Scenes.blankScene().scriptElId, '', 'blankScene carries scriptElId ""');
eq({ ...Scenes.blankScene(), id: 'x' }.scriptElId, '', 'an old row read through the blank gets ""');

/* ---- headings -------------------------------------------------- */
const base = () => [
  el('scene', 'INT. KITCHEN - DAY', 'h1'),
  el('action', 'Ravi cooks.'),
  el('scene', 'EXT. STREET - NIGHT', 'h2'),
  el('action', 'Rain.'),
  el('scene', '12 INT. OFFICE - DAY', 'h3'),
  el('action', 'Phones.')
];
eq(Sync.headingsOf(base()).map((h) => h.id), ['h1', 'h2', 'h3'], 'headingsOf: three headings in order');
eq(Sync.headingsOf([el('scene', '   '), el('action', 'x')]), [], 'an empty heading is not a heading');
eq(Sync.headingFields('12 INT. OFFICE - DAY'), { location: 'OFFICE', intExt: 'INT', dayNight: 'DAY', number: '12' }, 'fields from a numbered heading');
eq(Sync.headingFields('KITCHEN'), { location: 'KITCHEN' }, 'a bare place says nothing about INT/EXT or time');
eq(Sync.headingFields('INT. KITCHEN - DAY\n\nMara pours tea.\n\nMARA\nNot now.').location, 'KITCHEN',
  'a heading with line breaks in it reads only its first line (QA: a pasted scene became the location)');

/* ---- a fresh script: everything is new --------------------------- */
let plan = Sync.reconcile(base(), [], {});
eq(plan.add.map((a) => a.row.location), ['KITCHEN', 'STREET', 'OFFICE'], 'three new headings → three adds');
eq(plan.add.map((a) => a.row.number), ['1', '2', '12'], 'numbers: next free, and the heading\'s own');
eq(plan.add.map((a) => a.row.scriptElId), ['h1', 'h2', 'h3'], 'each add is linked to its heading');
eq([plan.add[1].row.intExt, plan.add[1].row.dayNight], ['EXT', 'NIGHT'], 'INT/EXT and time parsed');
eq([plan.bin.length, plan.update.length, plan.restore.length], [0, 0, 0], 'nothing else');

/* ---- apply, then edit / add / delete ---------------------------- */
reset();
let res = Sync.syncScript(base()).result;
eq(res.added.length, 3, 'syncScript adds three rows');
let rows = Scenes.listScenes();
eq(rows.map((s) => s.scriptElId), ['h1', 'h2', 'h3'], 'stored in script order');
// a person's work on scene 1
Scenes.updateScene(rows[0].id, { synopsis: 'Ravi cooks for Kavya.', eighths: 13, elements: { cast: ['RAVI'] }, shootDay: 2 });
const prev = Sync.headingMap(base());

let els = base();
els[0].text = 'INT. KITCHEN - NIGHT';
plan = Sync.reconcile(els, Scenes.listScenes(), { prev });
eq(plan.update, [{ id: rows[0].id, patch: { dayNight: 'NIGHT' } }], 'an edited heading updates only the field it changed');
Sync.applySync(plan);
const s1 = Scenes.listScenes()[0];
eq([s1.dayNight, s1.synopsis, s1.eighths, s1.elements.cast, s1.shootDay], ['NIGHT', 'Ravi cooks for Kavya.', 13, ['RAVI'], 2], 'synopsis, eighths, cast and day survive the edit');

plan = Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(els) });
ok(Sync.isEmptyPlan(plan), 'an unchanged script plans nothing');

els = base(); els[0].text = 'INT. KITCHEN - NIGHT';
els.splice(4, 0, el('scene', 'INT. CAR - DAY', 'h9'), el('action', 'Driving.'));
plan = Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(base().map((e, i) => (i === 0 ? { ...e, text: 'INT. KITCHEN - NIGHT' } : e))) });
eq(plan.add.map((a) => [a.headingId, a.after && a.after.id]), [['h9', rows[1].id]], 'a new heading is added after the row of the heading above it');
Sync.applySync(plan);
eq(Scenes.listScenes().map((s) => s.location), ['KITCHEN', 'STREET', 'CAR', 'OFFICE'], 'placed in script order');
eq(Scenes.listScenes()[2].number, '13', 'numbered after the highest in use');

/* ---- prev limits adds to NEW headings ---------------------------- */
const pre = [el('scene', 'INT. HALL - DAY', 'p1')];
plan = Sync.reconcile(pre, [], { prev: Sync.headingMap(pre) });
eq(plan.add.length, 0, 'a heading that was already there at the last sync is not auto-added (the banner offers it)');

/* ---- hand-made rows are never touched ---------------------------- */
reset();
const hand = Scenes.addScene({ location: 'ROOFTOP', synopsis: 'mine' });
const handRaw = mem.get('fms_scenes_v1');
plan = Sync.reconcile(base(), Scenes.listScenes(), {});
eq([plan.update.length, plan.bin.length], [0, 0], 'a script with no matching heading leaves an unlinked row alone');
Sync.applySync({ ...plan, add: [] });
eq(mem.get('fms_scenes_v1'), handRaw, '…byte for byte');
plan = Sync.reconcile([el('scene', 'EXT. ROOFTOP - DAY', 'r1')], Scenes.listScenes(), {});
eq(plan.update, [{ id: hand.id, patch: { scriptElId: 'r1' } }], 'a confident match LINKS an unlinked row and writes nothing else');
eq(plan.add.length, 0, '…instead of adding a duplicate');

/* ---- empty script and mass guards -------------------------------- */
reset();
Sync.syncScript(base());
plan = Sync.reconcile([], Scenes.listScenes(), { prev: Sync.headingMap(base()) });
ok(plan.empty && !plan.bin.length, 'an empty script bins nothing');
plan = Sync.reconcile([el('action', 'only action')], Scenes.listScenes(), { prev: Sync.headingMap(base()) });
ok(plan.empty && !plan.bin.length, 'a script with no headings bins nothing');
plan = Sync.reconcile([el('scene', 'INT. KITCHEN - DAY', 'h1')], Scenes.listScenes(), { prev: Sync.headingMap(base()) });
eq([plan.bin.length, plan.mass], [2, false], 'two of three removed: binned, not flagged');
const many = Array.from({ length: 6 }, (_, i) => el('scene', 'INT. ROOM ' + (i + 1) + ' - DAY', 'm' + i));
reset();
Sync.syncScript(many);
plan = Sync.reconcile(many.slice(0, 2), Scenes.listScenes(), { prev: Sync.headingMap(many) });
eq([plan.bin.length, plan.mass], [4, true], 'four of six removed in one save: applied, and flagged mass');

/* ---- cut and paste is a move ------------------------------------- */
reset();
Sync.syncScript(base());
rows = Scenes.listScenes();
Shots.addShot(rows[1].id, { description: 'wide' });
els = base();
const cut = els.splice(2, 2);                           // STREET heading + action
els.push(el('scene', cut[0].text, 'h2b'), el('action', cut[1].text));   // pasted: a new id
plan = Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(base()) });
eq([plan.bin.length, plan.add.length], [0, 0], 'cut-and-paste bins nothing and adds nothing');
eq(plan.update, [{ id: rows[1].id, patch: { scriptElId: 'h2b' } }], '…it relinks the row to the pasted heading');
Sync.applySync(plan);
eq(Shots.listShots().filter((s) => s.sceneId === rows[1].id).length, 1, '…and the shots stay');

/* ---- bin and restore, byte-identical ----------------------------- */
reset();
Sync.syncScript(base());
rows = Scenes.listScenes();
const target = rows[1];
Scenes.updateScene(target.id, { shootDay: 3, shotState: 'part', songId: 'song1' });
Scenes.updateScene(rows[2].id, { shootDay: 3 });
const a1 = Shots.addShot(rows[0].id, { description: 'other scene' });
const t1 = Shots.addShot(target.id, { description: 'wide' });
const a2 = Shots.addShot(rows[2].id, { description: 'office' });
const t2 = Shots.addShot(target.id, { description: 'close' });
Shots.addFrame(a1.id, { caption: 'f-a1' });
Shots.addFrame(t1.id, { caption: 'f-t1' });
Shots.addFrame(t2.id, { caption: 'f-t2a' });
Shots.addFrame(a2.id, { caption: 'f-a2' });
Shots.addFrame(t2.id, { caption: 'f-t2b' });
Shots.addBoard({ name: 'Palette' });
const c1 = Contacts.addCallSheet({ sceneIds: [rows[0].id, target.id, rows[2].id] });
Contacts.addCallSheet({ sceneIds: [rows[2].id] });
Contacts.addContact({ name: 'A' });
Edit.setSceneEdit(rows[0].id, { cut: 'in' });
Edit.setSceneEdit(target.id, { cut: 'locked', note: 'keep' });
Edit.setSceneEdit(rows[2].id, { note: 'trim' });
Edit.addPickup(target.id, 'insert of the key');
Edit.addPickup(rows[0].id, 'wide');
const before = snap();

els = base(); els.splice(2, 2);                         // delete the STREET heading
plan = Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(base()) });
eq(plan.bin, [{ sceneId: target.id, heading: 'EXT. STREET - NIGHT' }], 'a deleted heading bins its row');
res = Sync.applySync(plan);
const entry = res.binned[0];
eq(Bin.entryCounts(entry), { shots: 2, frames: 3, blocks: 0, sheets: 1, pickups: 1, edit: true, day: 3 }, 'the entry holds 2 shots, 3 frames, 1 sheet, 1 pick-up, the edit note and Day 3');
eq(Bin.describeEntry(entry), 'Scene 2: 2 shots, 3 frames, Day 3, 1 call sheet, 1 pick-up, an edit note', 'the confirm\'s words');
ok(!Scenes.listScenes().some((s) => s.id === target.id), 'the row is gone from the scene list');
ok(!Shots.listShots().some((s) => s.sceneId === target.id), '…its shots from the shot list');
ok(!Shots.listFrames().some((f) => f.shotId === t1.id || f.shotId === t2.id), '…its frames from the storyboard');
ok(!Contacts.listCallSheets().some((cs) => cs.sceneIds.includes(target.id)), '…its place from every call sheet');
ok(!(target.id in Edit.loadEdit().scenes) && !Edit.listPickups().some((p) => p.sceneId === target.id), '…its edit note and pick-ups');
eq(Shots.listBoards().length, 1, 'lookbook boards belong to no scene and stay');
eq(Contacts.listCallSheets().find((cs) => cs.id === c1.id).sceneIds, [rows[0].id, rows[2].id], 'the other scenes stay on the sheet, in order');

// Ctrl+Z in the field: the same heading id comes back
plan = Sync.reconcile(base(), Scenes.listScenes(), { prev: Sync.headingMap(els), bin: Bin.listBin() });
eq(plan.restore.map((r) => [r.entryId, r.headingId, r.patch]), [[entry.id, 'h2', {}]], 'the heading id coming back restores its entry');
eq([plan.add.length, plan.bin.length], [0, 0], '…and adds nothing');
Sync.applySync(plan);
const after = snap();
for (const k of KEYS.slice(0, 4)) eq(after[k], before[k], `restore is byte-identical: ${k}`);
eq(after.fms_scene_bin_v1, null, 'the bin is empty again (the key is removed, not left as [])');

// retyping the same heading in a NEW element restores too
Sync.applySync(Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(base()) }));
const retyped = base(); retyped[2] = el('scene', 'ext. street - night', 'h2new');
plan = Sync.reconcile(retyped, Scenes.listScenes(), { prev: Sync.headingMap(els), bin: Bin.listBin() });
eq(plan.restore.map((r) => r.patch), [{ scriptElId: 'h2new' }], 'the same heading typed again restores, relinked to the new element');
Sync.applySync(plan);
eq(Scenes.listScenes().find((s) => s.id === target.id).scriptElId, 'h2new', '…linked');
eq(Shots.listShots().filter((s) => s.sceneId === target.id).length, 2, '…with its shots');

/* ---- a hand deletion goes through the same cascade --------------- */
Scenes.removeScene(target.id);
const handEntry = Bin.listBin()[0];
eq([handEntry.reason, Bin.entryCounts(handEntry).shots], ['hand', 2], 'removeScene() bins the row with its shots');
plan = Sync.reconcile(retyped, Scenes.listScenes(), { prev: Sync.headingMap(retyped), bin: Bin.listBin() });
eq([plan.restore.length, plan.add.length], [0, 0], 'a hand-binned row is never restored by the sync');

/* ---- empty bin: no orphan anywhere ------------------------------- */
els = base(); els.splice(4, 2);                         // delete OFFICE too
Sync.applySync(Sync.reconcile(els, Scenes.listScenes(), { prev: Sync.headingMap(retyped) }));
eq(Bin.listBin().length, 2, 'two entries in the bin');
eq(Bin.binTotals(), { scenes: 2, shots: 3, frames: 4, sheets: 3 }, 'binTotals names what Empty bin would delete');
eq(Bin.emptyBin(), 2, 'emptyBin deletes both');
const live = new Set(Scenes.listScenes().map((s) => s.id));
const liveShots = new Set(Shots.listShots().map((s) => s.id));
ok(Shots.listShots().every((s) => live.has(s.sceneId)), 'no shot points at a missing scene');
ok(Shots.listFrames().every((f) => liveShots.has(f.shotId)), 'no frame points at a missing shot');
ok(Contacts.listCallSheets().every((cs) => cs.sceneIds.every((id) => live.has(id))), 'no call sheet lists a missing scene');
ok(Object.keys(Edit.loadEdit().scenes).every((id) => live.has(id)), 'no edit note for a missing scene');
ok(Edit.listPickups().every((p) => live.has(p.sceneId)), 'no pick-up for a missing scene');
eq(mem.has('fms_scene_bin_v1'), false, 'the bin key is gone');

/* ---- deleteBinEntry --------------------------------------------- */
reset();
Sync.syncScript(base());
const d = Scenes.listScenes()[0];
Scenes.removeScene(d.id);
const de = Bin.listBin()[0];
eq(Bin.deleteBinEntry('nope'), 0, 'deleting an unknown entry deletes nothing');
eq(Bin.deleteBinEntry(de.id), 1, 'deleteBinEntry deletes one');
eq(Bin.restoreFromBin(de.id), null, 'a deleted entry cannot be restored');

/* ---- the Dragon sample: linking an existing project -------------- */
reset();
const rowsD = sample.scenes || (sample.data && sample.data.scenes) || [];
if (rowsD.length) {
  Scenes.saveScenes(rowsD.map((r) => Scenes.blankScene(r)));
  const elsD = script.elements.map((e) => blankElement(e));   // the hub gives each an id when it seeds
  const t0 = Date.now();
  plan = Sync.reconcile(elsD, Scenes.listScenes(), { prev: Sync.headingMap(elsD) });
  const ms = Date.now() - t0;
  const links = plan.update.filter((u) => u.patch.scriptElId).length;
  ok(links >= Math.floor(rowsD.length * 0.8), `the Dragon sample links most of its ${rowsD.length} rows on first sync (got ${links})`);
  eq([plan.add.length, plan.bin.length], [0, 0], '…and adds and bins nothing');
  ok(plan.update.every((u) => Object.keys(u.patch).join() === 'scriptElId'), '…writing nothing but the link');
  ok(ms < 500, `reconcile on 2,361 elements in ${ms}ms`);
} else {
  ok(false, 'the Dragon sample has scene rows to link');
}

/* ---- measureEighths: the script's length, again ----------------- */
reset();
{
  const els = [el('scene', 'INT. HALL - DAY', 'h1'), el('action', 'A long room. ' + 'Dust settles on the floor. '.repeat(30), 'a1'), el('scene', 'EXT. ROAD - NIGHT', 'h2'), el('action', 'Rain.', 'a2')];
  Scenes.saveScenes([
    Scenes.blankScene({ number: '1', intExt: 'INT', location: 'HALL', dayNight: 'DAY', eighths: 1 }),
    Scenes.blankScene({ number: '2', intExt: 'EXT', location: 'ROAD', dayNight: 'NIGHT', eighths: 1 })
  ]);
  const ch = Sync.measureEighths(els, Scenes.listScenes());
  eq(ch.length, 1, 'only the scene whose length moved is reported');
  ok(ch[0] && ch[0].to > ch[0].from && ch[0].from === 1, 'the long scene grows past its stale 1/8');
  eq(Sync.measureEighths(els, Scenes.listScenes().map((r) => ({ ...r, eighths: ch[0] ? (r.id === ch[0].sceneId ? ch[0].to : r.eighths) : r.eighths }))), [], 'once applied, nothing is left to measure');
  eq(Sync.measureEighths([], Scenes.listScenes()), [], 'an empty script measures nothing');
}

/* ---- blocking diagrams ride the bin ------------------------------ */
reset();
Sync.syncScript(base());
{
  const rs = Scenes.listScenes();
  const tg = rs[1];
  const bA = Shots.addBlock(rs[0].id, { name: 'other' });
  const bT1 = Shots.addBlock(tg.id);
  Shots.addMark(bT1.id, 'actor'); Shots.addMark(bT1.id, 'camera', { toX: 20, toY: 30 });
  const bC = Shots.addBlock(rs[2].id, { name: 'office' });
  const bT2 = Shots.addBlock(tg.id, { note: 'second setup' });
  const sh = Shots.addShot(tg.id, { description: 'wide' });
  Shots.addFrame(sh.id, { caption: 'f' });
  Shots.addBoard({ name: 'B' });
  const rawBlocks = () => JSON.parse(mem.get('fms_shots_v1')).blocks;
  const rawOf = (id) => JSON.stringify(rawBlocks().find((b) => b.id === id));
  const beforeShots = mem.get('fms_shots_v1');
  const rawT1 = rawOf(bT1.id), rawT2 = rawOf(bT2.id);

  // saving shots / frames / boards must never drop blocks (the readAll trap)
  const n0 = rawBlocks().length;
  Shots.addShot(rs[0].id, { description: 'x' });
  Shots.saveShots(Shots.listShots());
  Shots.addFrame(sh.id, { caption: 'g' });
  Shots.saveFrames(Shots.listFrames());
  Shots.addBoard({ name: 'B2' });
  eq(rawBlocks().length, n0, 'saving shots, frames and boards never drops blocks');
  // put the file back to the pre-noise bytes so restore can be compared
  mem.set('fms_shots_v1', beforeShots);

  const e = Bin.binScene(tg.id, { reason: 'hand' });
  eq(Bin.entryCounts(e).blocks, 2, 'entryCounts().blocks counts the scene\'s diagrams');
  ok(/2 blocking diagrams/.test(Bin.describeEntry(e)), 'describeEntry says "2 blocking diagrams": ' + Bin.describeEntry(e));
  ok(!rawBlocks().some((b) => b.sceneId === tg.id), 'blocks leave fms_shots_v1 when the scene is binned');
  eq(rawBlocks().map((b) => b.id).sort(), [bA.id, bC.id].sort(), 'other scenes\' blocks stay');
  eq(Shots.blocksOfScene(tg.id), [], 'blocksOfScene is empty while binned');

  Bin.restoreFromBin(e.id);
  eq(rawOf(bT1.id), rawT1, 'restore puts block 1 back byte-identical');
  eq(rawOf(bT2.id), rawT2, 'restore puts block 2 back byte-identical');
  eq(mem.get('fms_shots_v1'), beforeShots, 'the whole shots blob is byte-identical after restore');

  // one block alone: singular wording
  const e1 = Bin.binScene(rs[2].id, { reason: 'hand' });
  ok(/1 blocking diagram(?!s)/.test(Bin.describeEntry(e1)), 'one diagram reads singular: ' + Bin.describeEntry(e1));
  Bin.restoreFromBin(e1.id);

  // delete / empty leave no block with that sceneId
  const e2 = Bin.binScene(tg.id, { reason: 'hand' });
  Bin.deleteBinEntry(e2.id);
  ok(!rawBlocks().some((b) => b.sceneId === tg.id), 'deleteBinEntry leaves no block for the scene');
  const e3 = Bin.binScene(rs[0].id, { reason: 'hand' });
  Bin.emptyBin();
  ok(!rawBlocks().some((b) => b.sceneId === rs[0].id), 'emptyBin leaves no block for the scene');
  void e3;

  // removeScene goes through the same cascade
  reset();
  Sync.syncScript(base());
  const r2 = Scenes.listScenes();
  Shots.addBlock(r2[0].id);
  Scenes.removeScene(r2[0].id);
  eq(Bin.entryCounts(Bin.listBin()[0]).blocks, 1, 'removeScene bins the scene\'s diagram too');
  ok(!Shots.listBlocks().some((b) => b.sceneId === r2[0].id), '…out of the live list');
  // a block-only scene is not dropped by unaddScenes
  reset();
  Sync.syncScript(base());
  const r3 = Scenes.listScenes();
  Shots.addBlock(r3[1].id);
  Bin.unaddScenes([r3[1].id]);
  eq(Bin.listBin().length, 1, 'unaddScenes keeps an entry that holds only a blocking diagram');

  // restoring in ANY order puts each scene among its neighbours
  for (const order of [[0, 1, 2], [2, 1, 0], [1, 0, 2], [1, 2, 0]]) {
    reset();
    const ids = ['a', 'b', 'c', 'd', 'e'];
    Scenes.saveScenes(ids.map((id, i) => ({ ...Scenes.blankScene(), id, number: String(i + 1) })));
    const bins = ['b', 'c', 'd'].map((id) => Bin.binScene(id, { reason: 'hand' }));
    order.forEach((k) => Bin.restoreFromBin(bins[k].id));
    eq(Scenes.listScenes().map((s) => s.id), ids, 'restore order ' + order + ' keeps the scene order');
  }
}

/* ---- held mode (docs/SCRIPT-LOCK.md §3) ------------------------------ */
{
  const SS = await import('../src/lib/script.js');
  const rowsOf = (...hs) => hs.map((h, i) => ({ ...Scenes.blankScene(), id: 'r' + (i + 1), number: String(i + 1), scriptElId: h, location: 'X' + i }));
  const lock = (els) => SS.lockNumbering(els, null);
  const els0 = base();
  const num = lock(els0);
  const rows0 = rowsOf('h1', 'h2', 'h3');

  eq(Sync.reconcile(els0, rows0, {}).pending, { add: [], omit: [] }, 'unheld plans always carry an empty pending');
  const dropped = els0.filter((e) => e.id !== 'h2' && e.type !== 'action' || (e.type === 'action' && e.text !== 'Rain.'));
  const unheld = Sync.reconcile(dropped, rows0, { numbering: num });
  eq(unheld.bin.map((b) => b.sceneId), ['r2'], 'unheld: a gone heading bins its row (unchanged)');
  const heldPlan = Sync.reconcile(dropped, rows0, { numbering: num, held: true });
  eq([heldPlan.bin, heldPlan.add, heldPlan.restore], [[], [], []], 'held: no bin, no add, no restore');
  eq(heldPlan.pending.omit, [{ sceneId: 'r2', heading: '', number: '2' }], 'held: the gone heading is pending.omit with its number');
  ok(Sync.reconcile(dropped, rows0, { numbering: num, held: true, keepLinked: true }).bin.length === 0, 'held with keepLinked: still no bin');
  ok(Sync.reconcile(dropped, rows0, { held: true }).bin.length === 1, 'held is not inferred: with no lock the sync is today\'s');

  // a new heading is pending.add, with its locked letter
  const withNew = els0.slice(); withNew.splice(2, 0, el('scene', 'INT. CAFE - DAY', 'hn'), el('action', 'Steam.'));
  const numNew = SS.settleNumbering(withNew, num);
  const unheldAdd = Sync.reconcile(withNew, rows0, { numbering: numNew });
  const heldAdd = Sync.reconcile(withNew, rows0, { numbering: numNew, held: true });
  eq(unheldAdd.add.map((a) => a.headingId), ['hn'], 'unheld: a new heading adds a row');
  eq([heldAdd.add, heldAdd.pending.add], [[], [{ headingId: 'hn', text: 'INT. CAFE - DAY', number: '1A' }]], 'held: it is pending.add instead');

  // restores do not come back by themselves
  const binned = [{ id: 'be1', reason: 'script', heading: 'INT. CAFE - DAY', scene: { row: { id: 'rx', scriptElId: 'hn' } } }];
  eq(Sync.reconcile(withNew, rows0, { numbering: numNew, held: true, bin: binned }).restore, [], 'held: step 4 is skipped');
  eq(Sync.reconcile(withNew, rows0, { numbering: numNew, bin: binned }).restore.map((r) => r.entryId), ['be1'], 'unheld: the restore still happens');

  // the number relink: a restore re-keyed the headings and changed no number
  const renamed = els0.map((e) => (e.type === 'scene' ? { ...e, id: 'n' + e.id, text: e.text + ' (REVISED)' } : e));
  // the lock re-keyed through liveId, as restoreDraft does; the headings' words have changed
  const numRe = { ...num, ids: Object.fromEntries(Object.entries(num.ids).map(([k, v]) => ['n' + k, { ...v }])) };
  const relink = Sync.reconcile(renamed, rows0, { numbering: numRe, held: true });
  eq(relink.update.map((u) => [u.id, u.patch.scriptElId]).sort(), [['r1', 'nh1'], ['r2', 'nh2'], ['r3', 'nh3']], 'held: rows relink to the heading carrying their locked number, words changed');
  eq([relink.pending.omit, relink.bin], [[], []], 'and nothing is omitted');
  eq(Sync.reconcile(renamed, rows0, { numbering: numRe }).bin.map((b) => b.sceneId).sort(), ['r1', 'r2', 'r3'], 'unheld: the same change bins all three (unchanged)');

  // plan subsets and the apply
  const plan = Sync.reconcile(withNew, rows0, { numbering: numNew, keepLinked: true, bin: [] });
  const sub = Sync.planFor(plan, { headingId: 'hn' });
  eq([sub.add.map((a) => a.headingId), sub.bin, sub.restore, sub.mass], [['hn'], [], [], false], 'planFor: the add for that heading only');
  const gone = Sync.reconcile(dropped, rows0, { numbering: num, keepLinked: true });
  const subBin = Sync.planFor(gone, { sceneId: 'r2' });
  eq([subBin.bin.map((b) => b.sceneId), subBin.add], [['r2'], []], 'planFor: the bin entry for that scene');
  eq(Sync.planFor(gone, { sceneId: 'nope' }).bin, [], 'planFor: an unknown scene selects nothing');
  eq(Sync.planFor(gone, {}).add, [], 'planFor: an empty selection selects nothing');

  reset();
  Scenes.saveScenes(rowsOf('h1', 'h2', 'h3'));
  const res = Sync.applyFor(withNew, numNew, { headingId: 'hn' });
  eq([res.added.length, res.added[0] && res.added[0].number, Scenes.listScenes().length], [1, '1A', 4], 'applyFor adds the one row, numbered by the lock');
  const res2 = Sync.applyFor(dropped, num, { sceneId: 'r2' });
  eq([res2.binned.length, Bin.listBin().length, Scenes.listScenes().some((x) => x.id === 'r2')], [1, 1, false], 'applyFor bins the one scene through the bin');
  eq(Sync.headingPatch('INT. CAFE - DAY', { location: 'X', intExt: 'EXT', dayNight: 'DAY', number: '' }), { intExt: 'INT', location: 'CAFE' }, 'headingPatch: only the differing fields');
  reset();
}

console.log(`test:sync — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
