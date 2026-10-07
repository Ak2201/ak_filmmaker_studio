/* ============================================================
   TEST — the two Post-Production models, in Node, no browser
   ------------------------------------------------------------
   editlog.js and deliverables.js are mostly derivation over models
   that already exist (scenes, shots, festivals), plus one small key
   each. Derivation is the part a browser run cannot see failing —
   the page renders a number either way — so the rules are asserted
   here against hand-built scenes. The seams are the same two every
   Node test uses (node-seams.mjs): store.js becomes a no-op and
   localStorage an in-memory Map.
   ============================================================ */
import { mem } from './node-seams.mjs';

const E = await import('../src/lib/editlog.js');
const D = await import('../src/lib/deliverables.js');
const F = await import('../src/lib/festivals.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a));

const scene = (id, patch) => ({ id, number: id.replace(/\D/g, ''), intExt: 'INT', dayNight: 'DAY',
  location: 'Room ' + id, synopsis: '', eighths: 8, elements: {}, shotState: '', shotAt: '', ...patch });

/* ---- edit log: the verdict ---------------------------------- */
mem.clear();
const scenes = [
  scene('s1', { shotState: 'shot' }),                 // in the can
  scene('s2', { shotState: 'part', eighths: 4 }),     // pick-ups owed
  scene('s3', { shotState: '' }),                     // not shot
  scene('s4', { shotState: 'dropped' }),              // dropped on the day
  scene('s5', { shotState: 'shot' }),                 // shot, will be cut out
  scene('s6', { shotState: 'dropped' })               // dropped, cut still wants it
];
const shots = [
  { id: 'a', sceneId: 's1', done: true },
  { id: 'b', sceneId: 's1', done: true },
  { id: 'c', sceneId: 's5', done: false }
];
E.setSceneEdit('s5', { cut: 'out', note: 'Lost in the assembly' });
E.setSceneEdit('s6', { cut: 'in' });
E.setSceneEdit('s1', { cut: 'locked' });
const cov = E.coverage(scenes, shots, E.loadEdit());

eq(cov.counts.scenes, 6, 'every scene gets a row');
eq(cov.counts.need, 4, 'the cut needs the scenes not cut out and not dropped, plus the dropped one it claims');
eq(cov.counts.inCan, 1, 'one scene is fully in the can');
eq(cov.counts.owed, 3, 'part, unshot and the claimed-but-dropped scene are owed');
eq(cov.counts.conflicts, 1, 'a dropped scene the cut has is a conflict');
eq(cov.counts.waste, 1, 'a shot scene cut out is waste');
eq(cov.counts.locked, 1, 'locked counts');
eq(cov.pages.inCan, '1', 'pages in the can is one page');
eq(cov.pages.need, '3 4/8', 'pages the cut needs: 8 + 4 + 8 + 8 eighths');
ok(!cov.ready, 'not ready to lock while anything is owed');

const r5 = cov.rows.find((r) => r.scene.id === 's5');
ok(!r5.need && !r5.owed && r5.waste, 'a cut-out scene is not needed, not owed, and is waste when it was shot');
ok(r5.setupsOpen, 'unticked setups are still reported on a cut-out scene');
const r1 = cov.rows.find((r) => r.scene.id === 's1');
ok(!r1.setupsOpen && r1.got === 'full', 'all setups ticked and marked shot reads as full');

/* The set's word is final: marked shot with setups unticked is in
   the can, and the open setups are a note rather than a debt. */
const cov2 = E.coverage([scene('x', { shotState: 'shot' })], [{ id: 'q', sceneId: 'x', done: false }], { scenes: {}, pickups: [] });
eq(cov2.counts.owed, 0, 'marked shot with setups unticked is not owed');
eq(cov2.counts.inCan, 1, 'it is in the can on the set’s word');
ok(cov2.rows[0].setupsOpen, 'and the open setups are still reported');
ok(cov2.ready, 'so the film can lock');

/* Clean film: ready. */
const cov3 = E.coverage([scene('y', { shotState: 'shot' })], [], { scenes: {}, pickups: [] });
ok(cov3.ready, 'everything the cut needs in the can and no conflicts is ready to lock');
ok(!E.coverage([], [], { scenes: {}, pickups: [] }).ready, 'no scenes is not ready');

/* An open pick-up is owed, whoever typed it (UX audit M12). */
const pk = (id, sceneId, done) => ({ id, sceneId, what: 'an insert', done, at: '' });
const cov4 = E.coverage([scene('y', { shotState: 'shot' })], [], { scenes: {}, pickups: [pk('a', 'y', false)] });
ok(!cov4.ready, 'an open pick-up keeps the film from reading ready to lock');
ok(E.coverage([scene('y', { shotState: 'shot' })], [], { scenes: {}, pickups: [pk('a', 'y', true)] }).ready,
  'a done pick-up does not');
const cov5 = E.coverage([scene('y', { shotState: 'shot' })], [], { scenes: {}, pickups: [pk('b', 'gone', false), pk('c', 'y', false)] });
eq(cov5.orphans.map((p) => p.id).join(), 'b', 'a pick-up on a scene no longer in the list is returned as an orphan');

/* ---- edit log: storage shape --------------------------------- */
E.setSceneEdit('s1', { cut: '', note: '' });
ok(!('s1' in E.loadEdit().scenes), 'a scene with nothing said about it is not stored');
E.setSceneEdit('s2', { cut: 'nonsense' });
eq(E.sceneEdit('s2').cut, '', 'an unknown cut state falls back rather than being stored');
const p = E.addPickup('s2', '  the insert of the letter ');
eq(p.what, 'the insert of the letter', 'a pick-up is trimmed');
eq(E.addPickup('s2', '   '), null, 'a blank pick-up is refused');
E.updatePickup(p.id, { done: true });
ok(E.listPickups().find((x) => x.id === p.id).done, 'a pick-up can be ticked');
E.removePickup(p.id);
eq(E.listPickups().length, 0, 'and removed');
mem.set('fms_edit_v1', '{"scenes":[1,2],"pickups":{"a":1}}');
eq(E.loadEdit(), { scenes: {}, pickups: [] }, 'a wrong-shaped blob reads as empty, not as a throw');
mem.set('fms_edit_v1', 'not json');
eq(E.loadEdit(), { scenes: {}, pickups: [] }, 'corrupt JSON reads as empty');

/* ---- edit log: the pick-up text ------------------------------ */
mem.clear();
E.addPickup('s2', 'A wide of the door');
const txt = E.pickupText(E.coverage(scenes, shots, E.loadEdit()));
ok(/NOT YET SHOT[\s\S]*Sc 3/.test(txt), 'the text lists the unshot scene');
ok(/PART SHOT[\s\S]*Sc 2/.test(txt), 'the text lists the part-shot scene');
ok(/FROM THE SUITE[\s\S]*A wide of the door/.test(txt), 'the text lists the editor’s pick-up');
ok(!/Sc 5/.test(txt), 'a cut-out scene is owed nothing');

/* ---- deliverables: the catalogue and the states --------------- */
mem.clear();
const all = D.listItems('feature');
ok(all.length > 20, 'the catalogue has a real list');
ok(all.every((i) => i.state === 'todo'), 'everything starts as to do');
ok(new Set(all.map((i) => i.id)).size === all.length, 'catalogue ids are unique');
ok(all.some((i) => i.id === 'cbfc') && all.some((i) => i.id === 'dcp') && all.some((i) => i.id === 'subs_en'),
   'the censor certificate, the DCP and the subtitles are on it');

let prog = D.progress(all);
eq(prog.done, 0, 'nothing done yet');
eq(prog.total, all.length, 'everything counts until marked not needed');

D.setItemState('dcp', { state: 'done' });
D.setItemState('mix_51', { state: 'na', note: 'stereo film' });
D.setItemState('subs_en', { state: 'doing' });
prog = D.progress(D.listItems('feature'));
eq(prog.done, 1, 'one done');
eq(prog.doing, 1, 'one in progress');
eq(prog.skipped, 1, 'one not needed');
eq(prog.total, all.length - 1, 'not-needed leaves the denominator');
ok(!prog.complete, 'not complete');

D.setItemState('dcp', { state: 'todo' });
ok(!('dcp' in D.loadDeliverables().items), 'the default state is not stored');
D.setItemState('dcp', { state: 'bogus' });
eq(D.itemState('dcp').state, 'todo', 'an unknown state falls back');

const c = D.addCustom('  4K HDR master ', 'release');
ok(c && c.label === '4K HDR master' && c.when === 'release', 'a custom item is trimmed and keeps its asker');
eq(D.addCustom('', 'release'), null, 'a blank custom item is refused');
ok(D.listItems('feature').some((i) => i.id === c.id && i.custom), 'a custom item is listed with the rest');
D.setItemState(c.id, { state: 'done' });
D.removeCustom(c.id);
ok(!D.listItems('feature').some((i) => i.id === c.id), 'a removed custom item is gone');
ok(!(c.id in D.loadDeliverables().items), 'and its state with it');

mem.set('fms_deliverables_v1', '[]');
eq(D.loadDeliverables(), { items: {}, custom: [] }, 'a wrong-shaped blob reads as empty');

/* ---- deliverables: what the festivals ask for ----------------- */
mem.clear();
const dcpFest = F.catalogueEntries().find((f) => /dcp/i.test(f.format || ''));
ok(dcpFest, 'the festival catalogue records at least one DCP format');
const unknownFest = F.catalogueEntries().find((f) => !f.format);
const subs = [
  F.blankSubmission({ festival: dcpFest.name, status: 'target' }),
  F.blankSubmission({ festival: unknownFest.name, status: 'submitted' }),
  F.blankSubmission({ festival: 'A festival nobody listed', status: 'target' }),
  F.blankSubmission({ festival: dcpFest.name, status: 'rejected' }),
  F.blankSubmission({ festival: '', status: 'target' })
];
const reqs = D.requirements(subs);
eq(reqs.length, 3, 'rejected and blank submissions ask for nothing; the rest are listed');
const r0 = reqs.find((r) => r.festival === dcpFest.name);
ok(r0.needs.includes('dcp'), 'a DCP festival needs the DCP item');
ok(reqs.find((r) => r.festival === unknownFest.name).known, 'a catalogue festival with no format is still known');
ok(!reqs.find((r) => r.festival === 'A festival nobody listed').known, 'a festival off the catalogue is marked unknown');
const asked = D.askedBy(reqs);
ok(Array.isArray(asked.dcp) && asked.dcp[0] === dcpFest.name, 'askedBy names the festival behind the DCP');
eq(D.requirements([]).length, 0, 'no submissions, no requirements');

console.log(`\n${fail ? '✗' : '✓'} test:post — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
