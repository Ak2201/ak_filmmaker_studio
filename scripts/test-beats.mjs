/* ============================================================
   BEAT OUTLINE — beats joined to scenes and the script, in Node
   ------------------------------------------------------------
   src/lib/beat-outline.js decides which beat a scene sits under,
   what the coverage meter says, where "Draft a scene for this beat"
   puts its row and its two lines, and which heading a margin marker
   hangs on. All of it is arithmetic a page renders plausibly while
   being wrong, so it is asserted here against the Dragon sample.

       node scripts/test-beats.mjs      (or: npm run test:beats)
   ============================================================ */
import { mem } from './node-seams.mjs';

const B = (await import('../src/lib/beat-outline.js')).default;
const S = await import('../src/lib/story.js');
const { elementLines, LINES_PER_PAGE } = await import('../src/lib/script.js');
const { blankScene } = await import('../src/lib/scenes.js');
const sample = (await import('../src/data/sample.dragon.json')).default;
const script = (await import('../src/data/sample.dragon.script.json')).default;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; } else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const near = (a, b, msg, tol = 1e-9) => ok(Math.abs(a - b) <= tol, `${msg} — got ${a}, want ${b}`);

/* ---- the field ------------------------------------------------ */
eq(blankScene().beatId, '', 'blankScene carries beatId ""');
eq({ ...blankScene(), ...{ id: 'x', number: '1' } }.beatId, '', 'an old row read through the blank gets beatId ""');

/* ---- ids ------------------------------------------------------ */
eq(B.qualify('save_the_cat', 'midpoint'), 'save_the_cat:midpoint', 'qualify');
eq(B.parseBeatId('save_the_cat:midpoint'), { fw: 'save_the_cat', beat: 'midpoint' }, 'parse');
eq([B.parseBeatId(''), B.parseBeatId('midpoint'), B.parseBeatId(':x'), B.parseBeatId('x:')], [null, null, null, null], 'parse refuses unqualified ids');

const r1 = B.resolveBeat('three_act:midpoint', 'three_act');
ok(r1 && r1.beat.id === 'midpoint' && !r1.inferred, 'a link in the active framework resolves exactly');
const r2 = B.resolveBeat('save_the_cat:all_is_lost', 'three_act');
ok(r2 && r2.inferred && r2.beat.id === 'plot_point_2' && r2.from.beat.id === 'all_is_lost',
  'a link in another framework lands on the nearest beat by position, flagged inferred');
eq(B.resolveBeat('three_act:nope', 'three_act'), null, 'an unknown beat resolves to nothing');
eq(B.resolveBeat('nope:midpoint', 'three_act'), null, 'an unknown framework resolves to nothing');
eq(B.resolveBeat('midpoint', 'three_act'), null, 'a bare beat id is not a link');

/* ---- acts ----------------------------------------------------- */
eq(B.actShares(), { 1: 0.25, 2: 0.5, 3: 0.25 }, 'act shares summed from pacing.regions');
for (const fw of S.frameworks()) {
  const acts = B.actsOf(fw.id);
  // Most formats are three acts; Freytag is five, Kishōtenketsu four,
  // the Interval structure two. The acts must be exactly the ones the
  // framework's own pacing regions name, and their shares must sum to 1.
  const regionActs = [...new Set(S.regionsOf(fw.id).map((r) => Number(/(\d+)/.exec(r.label)[1])))];
  eq(acts.map((a) => a.act), regionActs, `${fw.id}: acts match its pacing regions`);
  const shareSum = Object.values(B.actShares(fw.id)).reduce((t, x) => t + x, 0);
  ok(Math.abs(shareSum - 1) < 1e-9, `${fw.id}: act shares sum to 1`);
  eq(acts.reduce((n, a) => n + a.beats.length, 0), fw.beats.length, `${fw.id}: every beat in exactly one act`);
  eq(acts.flatMap((a) => a.beats.map((b) => b.id)), fw.beats.map((b) => b.id), `${fw.id}: beats keep framework order`);
}
eq(B.actsOf('three_act').map((a) => a.beats.length), [3, 2, 2], 'three-act: 3 / 2 / 2 beats');
eq(B.actsOf('save_the_cat').map((a) => a.beats.length), [6, 6, 3], 'Save the Cat!: 6 / 6 / 3 beats');

/* ---- the sample, unlinked ------------------------------------ */
const freshScenes = () => sample.scenes.map((s, i) => blankScene({ ...s, id: 'sc' + i }));
const elements = script.elements.map((e, i) => ({ id: 'e' + i, type: e.type, text: e.text }));
const story = { ...S.blankStory(), source: sample.blueprint.lad_2_synopsis };

const memBefore = JSON.stringify([...mem.entries()]);
let scenes = freshScenes();
let o = B.outline({ story, scenes, elements });
let cov = B.coverage(o);
eq(o.fw.id, 'three_act', 'the story\'s framework is the board\'s');
eq(o.spans.length, 36, 'one span per sample scene');
ok(o.spans.every((s) => s.how === 'heading' && s.source === 'script'), 'every sample scene matched its heading');

// Pages, independently: heading to next heading, lines over 55.
const heads = elements.map((e, i) => (e.type === 'scene' && e.text.trim() ? i : -1)).filter((i) => i >= 0);
const indep = heads.map((h0, k) => {
  const end = k + 1 < heads.length ? heads[k + 1] : elements.length;
  let n = 0; for (let i = h0; i < end; i++) n += elementLines(elements[i]);
  return n / LINES_PER_PAGE;
});
near(cov.totalPages, indep.reduce((a, b) => a + b, 0), 'total pages = the script\'s own line count / 55', 1e-9);
const { pageCount } = await import('../src/lib/script.js');
near(cov.totalPages, pageCount(elements), 'within a page of the editor\'s own count (the preamble above scene 1 belongs to no scene)', 0.5);
near(Math.round(cov.totalPages * 10) / 10, 106.2, 'the sample\'s scenes are 106.2 pages', 0.001);
eq([cov.beatsCovered, cov.beatsTotal, cov.unassigned, cov.linkedPages], [0, 7, 36, 0], 'unlinked: 0/7 beats, 36 unassigned, 0 pages linked');
eq(cov.acts.map((a) => a.status), ['none', 'none', 'none'], 'unlinked: no act share is measurable');
eq(cov.checks.filter((c) => c.kind === 'beat' && !c.ok).length, 7, 'every beat reports it has no scene');
ok(cov.checks.some((c) => c.text === 'Midpoint has no scene yet'), '"Midpoint has no scene yet" is said');
eq(cov.checks.length, 10, 'passed and failed checks are all listed (7 beats + 3 acts)');

/* ---- the sample, linked by position -------------------------- */
// Each scene to the beat nearest its midpoint in the script.
let acc = 0;
const total = indep.reduce((a, b) => a + b, 0);
scenes = freshScenes().map((s, i) => {
  const mid = (acc + indep[i] / 2) / total; acc += indep[i];
  return { ...s, beatId: B.qualify('three_act', S.nearestBeat('three_act', mid).id) };
});
o = B.outline({ story, scenes, elements });
cov = B.coverage(o);
const perBeat = o.acts.flatMap((a) => a.beats.map((b) => b.scenes.length));
eq(perBeat, [4, 4, 7, 9, 7, 3, 2], 'scenes per three-act beat, by position');
eq([cov.beatsCovered, cov.unassigned], [7, 0], 'linked: 7/7 beats, nothing unassigned');
near(cov.linkedPages, total, 'linked pages = every page', 1e-9);
// Act shares, independently.
const actOfBeat = { setup: 1, inciting: 1, plot_point_1: 1, midpoint: 2, plot_point_2: 2, climax: 3, resolution: 3 };
const actPages = { 1: 0, 2: 0, 3: 0 };
scenes.forEach((s, i) => { actPages[actOfBeat[s.beatId.split(':')[1]]] += indep[i]; });
cov.acts.forEach((a) => near(a.actual, actPages[a.act] / total, `${a.label} share = its pages / linked pages`, 1e-9));
eq(cov.acts.map((a) => Math.round(a.actual * 100)), [38, 46, 16], 'act shares on the sample, rounded');
eq(cov.acts.map((a) => a.status), ['over', 'ok', 'under'], 'linked by nearest beat, act one runs long and act three short');
ok(cov.checks.some((c) => c.text === 'Act One runs 38% of the linked pages against about 25% — over its share'), 'the over-share sentence');
ok(cov.checks.some((c) => c.text === 'Act Two runs 46% of the linked pages against about 50% — on pace'), 'the on-pace sentence (a passed check is listed)');
eq(cov.checks.filter((c) => c.kind === 'beat').every((c) => c.ok), true, 'every beat check passes on the linked sample');
ok(cov.checks.some((c) => c.text === 'Midpoint has 9 scenes'), '"Midpoint has 9 scenes"');

// Over / under: put everything but one scene in act one.
const lop = scenes.map((s, i) => ({ ...s, beatId: i === 35 ? 'three_act:climax' : 'three_act:setup' }));
const lc = B.coverage(B.outline({ story, scenes: lop, elements }));
eq(lc.acts.map((a) => a.status), ['over', 'under', 'under'], 'a lopsided outline is over in act one, under in two and three');
eq(lc.checks.filter((c) => !c.ok).length, 5 + 3, '5 empty beats and 3 off-pace acts reported');

/* ---- firstScenes / markers ------------------------------------ */
const firsts = B.firstScenes(o);
eq(firsts.length, 7, 'a first scene per beat');
eq(firsts.find((f) => f.key === 'three_act:midpoint').scene.number, scenes.find((s) => s.beatId === 'three_act:midpoint').number, 'midpoint marker on its first scene in scene order');
ok(firsts.every((f) => f.headingId && elements.find((e) => e.id === f.headingId).type === 'scene'), 'every marker hangs on a scene heading element');

/* ---- framework switch is a view change ----------------------- */
const sw = scenes.map((s) => ({ ...s }));
sw[0].beatId = 'save_the_cat:opening_image';
const snap = JSON.stringify(sw);
const oc = B.outline({ story: { ...story, framework: 'story_circle' }, scenes: sw, elements });
eq(JSON.stringify(sw), snap, 'deriving the outline writes nothing to the rows');
const you = oc.acts[0].beats.find((b) => b.beat.id === 'you');
ok(you.scenes.some((sp) => sp.scene.id === 'sc0' && sp.inferred && sp.from.beat.id === 'opening_image'), 'a Save the Cat! link shows under the Story Circle\'s nearest beat, inferred');
const back = B.outline({ story: { ...story, framework: 'save_the_cat' }, scenes: sw, elements });
ok(back.acts[0].beats[0].scenes.some((sp) => sp.scene.id === 'sc0' && !sp.inferred), 'and switching back finds it exactly');
eq(JSON.stringify([...mem.entries()]), memBefore, 'nothing in beat-outline touched storage');

/* ---- reorder and delete -------------------------------------- */
const re = scenes.slice(); [re[3], re[20]] = [re[20], re[3]];
const ro = B.outline({ story, scenes: re, elements });
eq(ro.acts.flatMap((a) => a.beats.map((b) => b.scenes.length)), perBeat, 'reordering the scene list keeps every link');
ok(ro.spans.every((s) => s.how), 'and every row still finds its heading');
const del = scenes.filter((s) => s.beatId !== 'three_act:resolution');
const dc = B.coverage(B.outline({ story, scenes: del, elements }));
eq([dc.beatsCovered, dc.checks.find((c) => c.key === 'three_act:resolution').text], [6, 'Resolution has no scene yet'], 'deleting a beat\'s only scene uncovers it');

/* ---- drafting into the sample -------------------------------- */
function apply(plan, scenesIn, elsIn, n) {
  const row = blankScene({ ...plan.scene, id: 'new' + n });
  const sc = scenesIn.slice(); sc.splice(plan.sceneIndex, 0, row);
  const add = plan.elements.map((e, k) => ({ id: 'n' + n + '_' + k, ...e }));
  const el = elsIn.slice();
  el.splice(plan.elementIndex < 0 ? el.length : plan.elementIndex, 0, ...add);
  return { sc, el, row, add };
}
const mp = B.draftPlan(o, 'three_act:midpoint', scenes);
const lastMid = Math.max(...scenes.map((s, i) => (actOfBeat[s.beatId.split(':')[1]] <= 2 && ['setup', 'inciting', 'plot_point_1', 'midpoint'].includes(s.beatId.split(':')[1]) ? i : -1)));
eq(mp.sceneIndex, lastMid + 1, 'the drafted row goes after the last scene of this beat or an earlier one');
eq(mp.elementIndex, heads[lastMid + 1], 'its lines go at the start of the next scene\'s heading');
eq(mp.elements.map((e) => e.type), ['scene', 'action'], 'a heading prompt and one action line');
eq(mp.elements[0].text, B.HEADING_PROMPT, 'the heading is a prompt to overwrite');
eq(mp.scene.beatId, 'three_act:midpoint', 'the row is linked to the beat');
eq(mp.scene.number, '37', 'numbered after the highest existing number');
eq(mp.elements[1].text, S.beatById('three_act', 'midpoint').prompt, 'with no tagged passage, the action line is the beat\'s own prompt');

const d1 = apply(mp, scenes, elements, 1);
const o1 = B.outline({ story, scenes: d1.sc, elements: d1.el });
const sp1 = o1.spans.find((s) => s.scene.id === 'new1');
eq(sp1.headingId, 'n1_0', 'the drafted row is joined to the heading drafted with it');
ok(o1.spans.every((s) => s.how), 'every other row still finds its heading');
eq(B.coverage(o1).checks.find((c) => c.key === 'three_act:midpoint').text, 'Midpoint has 10 scenes', 'the midpoint now counts it');
// Undo: remove exactly what was added.
const undoSc = d1.sc.filter((s) => s.id !== 'new1');
const undoEl = d1.el.filter((e) => !d1.add.some((a) => a.id === e.id));
eq(JSON.stringify(undoSc), JSON.stringify(scenes), 'undo leaves the scene list exactly as it was');
eq(JSON.stringify(undoEl), JSON.stringify(elements), 'undo leaves the script exactly as it was');

/* ---- the beat's own words ------------------------------------ */
const src = sample.blueprint.lad_2_synopsis;
const tagged = { ...S.blankStory(), source: src };
const pick = src.slice(0, Math.min(120, src.length));
S.addMark(tagged, { start: 0, end: pick.length, fw: 'three_act', beat: 'resolution' });
const ot = B.outline({ story: tagged, scenes: [], elements: [] });
const res = ot.acts[2].beats.find((b) => b.beat.id === 'resolution');
eq(res.marks.length, 1, 'a tagged passage sits on its beat');
eq(B.draftPlan(ot, 'three_act:resolution', []).elements[1].text, pick.trim(), 'the action line carries the tagged passage');

/* ---- an empty project, drafted out of order ------------------ */
let es = [], ee = [];
const step = (key, n) => {
  const ob = B.outline({ story, scenes: es, elements: ee });
  const p = B.draftPlan(ob, key, es);
  const r = apply(p, es, ee, n); es = r.sc; ee = r.el;
};
step('three_act:setup', 1);
step('three_act:climax', 2);
step('three_act:midpoint', 3);
step('three_act:setup', 4);
eq(es.map((s) => s.beatId.split(':')[1]), ['setup', 'setup', 'midpoint', 'climax'], 'scene list in beat order whatever order they were drafted in');
eq(ee.filter((e) => e.type === 'scene').map((e) => e.id), ['n1_0', 'n4_0', 'n3_0', 'n2_0'], 'script headings in the same order');
const oe = B.outline({ story, scenes: es, elements: ee });
eq(oe.spans.map((s) => s.headingId), ['n1_0', 'n4_0', 'n3_0', 'n2_0'], 'each placeholder row joins its own heading');
eq(es.map((s) => s.number), ['1', '4', '3', '2'], 'numbers are never reused');
const ce = B.coverage(oe);
eq([ce.beatsCovered, ce.beatsTotal], [3, 7], '3 of 7 beats covered');
eq(B.firstScenes(oe).map((f) => f.headingId), ['n1_0', 'n3_0', 'n2_0'], 'markers on setup\'s first, midpoint, climax');

console.log(`test:beats — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
