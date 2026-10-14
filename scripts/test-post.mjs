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
eq(E.loadEdit(), { scenes: {}, pickups: [], cuts: [], dayLinks: {} }, 'a wrong-shaped blob reads as empty, not as a throw');
mem.set('fms_edit_v1', 'not json');
eq(E.loadEdit(), { scenes: {}, pickups: [], cuts: [], dayLinks: {} }, 'corrupt JSON reads as empty');

/* ---- edit log: the pick-up text ------------------------------ */
mem.clear();
E.addPickup('s2', 'A wide of the door');
const txt = E.pickupText(E.coverage(scenes, shots, E.loadEdit()));
ok(/NOT YET SHOT[\s\S]*Sc 3/.test(txt), 'the text lists the unshot scene');
ok(/PART SHOT[\s\S]*Sc 2/.test(txt), 'the text lists the part-shot scene');
ok(/FROM THE SUITE[\s\S]*A wide of the door/.test(txt), 'the text lists the editor’s pick-up');
ok(!/Sc 5/.test(txt), 'a cut-out scene is owed nothing');

/* ---- edit log: timecodes, cut versions, links ------------------ */
const P = E.parseTimecode;
[['42', 42], ['0', 0], ['0:42', 42], ['1:05', 65], ['90:00', 5400], ['1:02:03', 3723], ['01:02:03:24', 3723],
 [' 2:30 ', 150], [42, 42]].forEach(([i, o]) => eq(P(i), o, 'parseTimecode ' + JSON.stringify(i)));
['', 'abc', '-5', '1:75', '1:61:00', '1:02:61', '1.5', '1::2', '1:2:3:4:5', '12:xx', null, undefined, -1, 1.5, '999999999']
  .forEach((i) => eq(P(i), null, 'parseTimecode refuses ' + JSON.stringify(i)));
[[0, '0:00'], [42, '0:42'], [65, '1:05'], [3599, '59:59'], [3600, '1:00:00'], [3723, '1:02:03'], [-4, '0:00'], ['x', '0:00']]
  .forEach(([i, o]) => eq(E.formatTimecode(i), o, 'formatTimecode ' + i));
ok([0, 7, 59, 60, 3599, 3600, 36000].every((n) => P(E.formatTimecode(n)) === n), 'format then parse round-trips');

mem.clear();
const cutA = E.addCut({ name: ' Assembly ', date: '2026-10-01' });
eq(cutA.name, 'Assembly', 'a cut name is trimmed');
eq(E.addCut({ name: '  ' }), null, 'a nameless cut is refused');
const cutB = E.addCut({ name: 'Rough cut v1', date: 'not a date' });
eq(cutB.date.length, 10, 'a bad date falls back to today');
const cutC = E.addCut({ name: 'Fine cut' });
eq(E.listCuts().map((c) => c.name), ['Assembly', 'Rough cut v1', 'Fine cut'], 'cuts keep creation order');

eq(E.addCutNote(cutA.id, { tc: 'garbage', text: 'x' }), null, 'a note with a timecode that does not parse is refused');
eq(E.addCutNote(cutA.id, { tc: '0:10', text: '  ' }), null, 'a note with no text is refused');
eq(E.addCutNote('nope', { tc: '0:10', text: 'x' }), null, 'a note on a missing cut is refused');
const n1 = E.addCutNote(cutA.id, { tc: '1:30', sceneId: 's2', text: 'Trim the pause' });
const n2 = E.addCutNote(cutA.id, { tc: '0:42', sceneId: 's1', text: 'Swap the take' });
const n3 = E.addCutNote(cutA.id, { tc: 42, text: 'Second at the same time' });
const n4 = E.addCutNote(cutA.id, { tc: '1:02:00', text: 'Late' });
eq(E.listCuts()[0].notes.map((n) => n.id), [n2.id, n3.id, n1.id, n4.id], 'notes read back by timecode, then creation order');
E.updateCutNote(cutA.id, n1.id, { tc: '0:05' });
eq(E.listCuts()[0].notes[0].id, n1.id, 'editing a timecode re-sorts');
E.updateCutNote(cutA.id, n1.id, { tc: 'junk', text: '' });
eq(E.listCuts()[0].notes[0].tc, 5, 'an unparseable timecode edit is ignored, not stored');
eq(E.listCuts()[0].notes[0].text, 'Trim the pause', 'and so is a blank text edit');
E.updateCutNote(cutA.id, n2.id, { done: true });
ok(E.listCuts()[0].notes.find((n) => n.id === n2.id).done, 'a note can be ticked');

/* the other fields survive every write (the readAll-drop trap) */
E.addPickup('s1', 'a wide');
E.setSceneEdit('s1', { cut: 'locked', note: 'keep' });
E.addDayLink(3, { url: 'https://drive.google.com/d/day3' });
E.addCutLink(cutA.id, { url: 'https://frame.io/x/1', label: 'Review' });
let blob = JSON.parse(mem.get('fms_edit_v1'));
ok(blob.cuts.length === 3 && blob.cuts[0].notes.length === 4, 'saving pick-ups, a scene note and links drops no cut or note');
ok(blob.dayLinks['3'].length === 1 && blob.pickups.length === 1 && blob.scenes.s1.cut === 'locked', 'and no day link, pick-up or scene row');
E.removePickup(E.listPickups()[0].id);
E.setSceneEdit('s1', { note: 'again' });
E.updatePickup('nope', {});
blob = JSON.parse(mem.get('fms_edit_v1'));
ok(blob.cuts.length === 3 && blob.dayLinks['3'], 'a pick-up remove and a scene write keep cuts and day links');
E.addCutNote(cutA.id, { tc: '9', text: 'late addition' });
ok(JSON.parse(mem.get('fms_edit_v1')).scenes.s1.note === 'again' && JSON.parse(mem.get('fms_edit_v1')).dayLinks['3'], 'a note write keeps scenes and day links');

/* links: scene, day, cut — unsafe refused */
const bad = E.addSceneLink('s1', { url: 'javascript:alert(1)' });
ok(!bad.added && bad.why, 'a javascript: link is refused with a reason');
ok(!E.addDayLink(3, { url: 'data:text/html,hi' }).added, 'a data: link is refused on a day');
ok(!E.addCutLink(cutA.id, { url: 'ftp://x/y' }).added, 'a non-http link is refused on a cut');
ok(E.addSceneLink('s1', { url: 'https://dropbox.com/s/1', label: 'Day 2 dailies' }).added, 'a safe scene link is added');
eq(E.sceneEdit('s1').links.map((l) => l.kind), ['dropbox'], 'its service is guessed from the host');
ok(!E.addSceneLink('s1', { url: 'https://dropbox.com/s/1' }).added, 'a duplicate is refused');
const lid = E.sceneEdit('s1').links[0].id;
E.removeSceneLink('s1', lid);
eq(E.sceneEdit('s1').links, [], 'a scene link is removed');
eq(E.sceneEdit('s1').note, 'again', 'and the note beside it stays');
E.addSceneLink('s9', { url: 'https://dropbox.com/s/9' });
E.removeSceneLink('s9', E.sceneEdit('s9').links[0].id);
ok(!('s9' in E.loadEdit().scenes), 'a scene row holding only links is not kept once they are gone');
const dl = E.dayLinks(3);
eq(dl.length, 1, 'a day holds its links');
E.removeDayLink(3, dl[0].id);
ok(!('3' in E.loadEdit().dayLinks) && !('dayLinks' in JSON.parse(mem.get('fms_edit_v1'))), 'an emptied day leaves no key behind');
eq(E.addDayLink(0, { url: 'https://a.com/' }).added, null, 'day 0 is not a day');
mem.set('fms_edit_v1', JSON.stringify({ scenes: { s1: { cut: 'in', note: '', links: [{ url: 'javascript:x' }, { url: 'https://a.com/z' }] } }, pickups: [],
  cuts: [{ id: 'c1', name: 'X', links: [{ url: 'data:x' }], notes: [{ id: 'n', tc: -3, text: 't' }, null] }], dayLinks: { '2': [{ url: 'vbscript:x' }], zz: [{ url: 'https://a.com/' }] } }));
const dirty = E.loadEdit();
eq(dirty.scenes.s1.links.map((l) => l.url), ['https://a.com/z'], 'unsafe stored scene links drop on read');
eq([dirty.cuts[0].links.length, dirty.cuts[0].notes[0].tc], [0, 0], 'unsafe cut links drop and a negative stored tc clamps');
eq(dirty.dayLinks, {}, 'unsafe or malformed day links drop on read');

/* cut CRUD, undo at the same position */
mem.clear();
const k1 = E.addCut({ name: 'One', date: '2026-01-01' }), k2 = E.addCut({ name: 'Two', date: '2026-01-02' }), k3 = E.addCut({ name: 'Three', date: '2026-01-03' });
E.addCutNote(k2.id, { tc: '0:03', text: 'keep me' });
E.addCutLink(k2.id, { url: 'https://frame.io/a' });
E.updateCut(k2.id, { name: 'Two b', note: 'n', notes: [] });
eq(E.listCuts()[1].notes.length, 1, 'updateCut cannot replace the notes list');
eq(E.updateCut(k2.id, { name: '  ' }).name, 'Two b', 'a blank rename keeps the name');
const before2 = JSON.stringify(E.listCuts()[1]);
const at2 = E.listCuts().findIndex((c) => c.id === k2.id);
E.removeCut(k2.id);
eq(E.listCuts().map((c) => c.name), ['One', 'Three'], 'a cut is removed');
E.restoreCut(JSON.parse(before2), at2);
eq(E.listCuts().map((c) => c.name), ['One', 'Two b', 'Three'], 'Undo puts the cut back at the same position');
eq(JSON.stringify(E.listCuts()[1]), before2, 'with its notes and links intact');
eq(E.restoreCut(JSON.parse(before2), 0), null, 'a double Undo adds nothing');
const nn = E.listCuts()[1].notes[0];
E.removeCutNote(k2.id, nn.id);
eq(E.listCuts()[1].notes, [], 'a note is removed');
E.restoreCutNote(k2.id, nn, 0);
eq(E.listCuts()[1].notes.map((n) => n.id), [nn.id], 'and restored');

/* cutNotesText */
const tcut = { name: 'Assembly', date: '2026-10-01', notes: [
  { id: 'a', tc: 90, sceneId: 's2', text: 'Trim the pause', done: false },
  { id: 'b', tc: 42, sceneId: 's12', text: 'Swap the take', done: true },
  { id: 'c', tc: 12, sceneId: '', text: 'Open on the wide', done: false }] };
const lab = (id) => (id === 's12' ? 'Sc 12' : id === 's2' ? 'Sc 2' : '');
eq(E.cutNotesText(tcut, lab).split('\n'), ['Assembly · 2026-10-01', '', '0:12  Open on the wide', '1:30  Sc 2 — Trim the pause', '',
  '[done] 0:42  Sc 12 — Swap the take'], 'notes text: open first in time order, done marked after');
eq(E.cutNotesText({ name: 'Empty', notes: [] }), 'Empty\n\nNo notes.', 'an empty cut says so');
eq(E.cutNotesText({ name: 'N', notes: [{ id: 'x', tc: 3725, sceneId: 'gone', text: 't' }] }, () => '').split('\n')[2], '1:02:05  t', 'a vanished scene leaves its label out');

/* scene bin: cut notes leave with their scene and return byte-identical */
mem.clear();
const bc = E.addCut({ name: 'Assembly', date: '2026-10-01' });
E.addCutNote(bc.id, { tc: '0:10', sceneId: 's1', text: 'one' });
E.addCutNote(bc.id, { tc: '0:20', sceneId: 'sX', text: 'other scene' });
E.addCutNote(bc.id, { tc: '0:30', sceneId: 's1', text: 'two' });
E.addCutNote(bc.id, { tc: '0:40', text: 'no scene' });
E.setSceneEdit('s1', { cut: 'in', note: 'n' });
E.addPickup('s1', 'insert');
E.addDayLink(2, { url: 'https://a.com/d' });
const bytes0 = mem.get('fms_edit_v1');
const snap = E.takeSceneOut('s1');
eq(snap.notes.map((n) => n.row.text), ['one', 'two'], 'the bin takes the notes that name the scene');
const mid = JSON.parse(mem.get('fms_edit_v1'));
eq(mid.cuts[0].notes.map((n) => n.text), ['other scene', 'no scene'], 'other notes stay');
ok(mid.dayLinks['2'], 'the bin keeps day links');
E.putSceneBack('s1', JSON.parse(JSON.stringify(snap)));
eq(mem.get('fms_edit_v1'), bytes0, 'restoring puts back byte-identical JSON');
mem.clear();
E.setSceneEdit('s1', { cut: 'in' });
eq(Object.keys(E.takeSceneOut('s1')), ['scene', 'pickups'], 'with no notes the snapshot is the shape it always was');
const Bin = await import('../src/lib/scene-bin.js');
eq(Bin.entryCounts({ scene: { row: {} }, edit: { scene: null, pickups: [], notes: [{}, {}] } }).cutNotes, 2, 'entryCounts counts cut notes');
ok(/2 cut notes/.test(Bin.describeEntry({ scene: { row: { number: '4' } }, edit: { pickups: [], notes: [{}, {}] } })), 'describeEntry names them');
eq(Bin.describeEntry({ scene: { row: { number: '4' } }, shots: [1], edit: { pickups: [] } }), 'Scene 4: 1 shot', 'describeEntry is unchanged without them');
eq(Object.keys(Bin.entryCounts({ scene: { row: {} } })), ['shots', 'frames', 'blocks', 'sheets', 'pickups', 'edit', 'day'], 'entryCounts keys are unchanged without cut notes');
mem.clear();

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

/* ---- edit log: sync flag, target, running time, CSV --------- */
mem.clear();
E.setTargetMin(95);
eq(E.getTargetMin(), 95, 'the target length reads back');
E.setSceneEdit('s1', { cut: 'in', note: '=SUM(1)', sync: true });
eq(E.getTargetMin(), 95, 'a scene write keeps the target');
ok(E.sceneEdit('s1').sync === true, 'the sync flag is stored on the scene row');
E.setSceneEdit('s1', { sync: false, cut: '', note: '' });
ok(!('s1' in JSON.parse(mem.get('fms_edit_v1')).scenes), 'a row with nothing left is not stored');
eq(E.setTargetMin(0), 0, 'a zero target clears');
ok(!('targetMin' in JSON.parse(mem.get('fms_edit_v1') || '{}')), 'no target stores no field');
E.setSceneEdit('s1', { cut: 'in', note: '=SUM(1)', sync: true });
E.setSceneEdit('s2', { cut: 'locked' });
const rtScenes = [scene('s1', { shotState: 'shot', songId: 'g1' }), scene('s2', { shotState: 'part' }), scene('s3')];
const rtCov = E.coverage(rtScenes, [], E.loadEdit());
const secs = { s1: 100, s2: 60, s3: 500 };
eq(E.cutRunTime(rtCov, secs, []).seconds, 160, 'only In-the-cut and Locked scenes add up');
eq(E.cutRunTime(rtCov, secs, [{ id: 'g1', seconds: 240 }]).seconds, 300, 'a timed song replaces its scene, once');
eq(E.cutRunTime(rtCov, secs, [{ id: 'g1', seconds: 0 }]).songsUntimed, 1, 'an untimed song is counted and keeps the estimate');
const csv = E.toCSV(rtCov, secs);
ok(csv.split('\r\n')[0] === E.CSV_HEADER.map((c) => '"' + c + '"').join(','), 'the CSV opens with its header');
ok(csv.includes('"\'=SUM(1)"'), 'a formula-looking note is neutralised');
eq(csv.trim().split('\r\n').length, 4, 'one row per scene plus the header');
mem.clear();

/* ---- deliverables: the optional streamer groups ------------- */
mem.clear();
const CAT = (await import('../src/data/deliverables.json')).default;
const optional = CAT.groups.filter((g) => g.optional);
ok(optional.length >= 5, 'the catalogue carries the streamer groups');
ok(optional.every((g) => g.source && g.checked && Array.isArray(g.sourceUrls)), 'every optional group cites a source and a checked date');
ok(optional.filter((g) => g.published === false).every((g) => /no public delivery specification/i.test(g.blurb)), 'a template group says it has no published spec');
const allIds = CAT.groups.flatMap((g) => g.items.map((i) => i.id));
eq(allIds.length, new Set(allIds).size, 'every catalogue id is unique — they are storage keys');
ok(['master_prores', 'subs_en', 'dialogue_list', 'cbfc', 'press_kit'].every((id) => allIds.includes(id)), 'the original ids are all still there');
const before = D.listItems('feature').length;
ok(!D.listItems('feature').some((i) => i.id.startsWith('nf_')), 'a streamer group is off until switched on');
eq(D.setGroupOn('ott_netflix', true), ['ott_netflix'], 'switching Netflix on');
const nf = CAT.groups.find((g) => g.id === 'ott_netflix').items.length;
eq(D.listItems('feature').length, before + nf, 'its items join the list');
D.setItemState('nf_imf', { state: 'done' });
eq(D.groupsOn(), ['ott_netflix'], 'an item write keeps the groups that are on');
D.addCustom('Something else', 'release');
eq(D.groupsOn(), ['ott_netflix'], 'and so does adding a custom line');
eq(D.setGroupOn('not_a_group', true), ['ott_netflix'], 'an unknown group cannot be switched on');
eq(D.setGroupOn('ott_netflix', false), [], 'switching it off');
ok(!('groupsOn' in JSON.parse(mem.get('fms_deliverables_v1'))), 'nothing switched on stores no field');
eq(D.itemState('nf_imf').state, 'done', 'switching a group off keeps the state of its items');
ok(D.optionalGroups().every((g) => g.on === false), 'optionalGroups reports each one off');
ok(CAT.groups.find((g) => g.id === 'text').items.filter((i) => i.tool === 'dialogue-list').length === 4, 'the subtitle rows link to the dialogue list');
mem.clear();

console.log(`\n${fail ? '✗' : '✓'} test:post — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
