/* ============================================================
   BEAT STEP <-> SCENE SYNC, and beat colours — in Node
   ------------------------------------------------------------
   src/lib/step-scene-sync.js is pure: every plan() case, the adopt
   rule for pairs sent before the baseline existed (the old 280-cut
   counts as agreeing), the beat rule. Then story.js against the real
   scenes.js and scene-bin.js over an in-memory localStorage: the send
   writes the whole text, reconcileStepScenes() carries an edit either
   way and writes NOTHING when the two agree, a conflict is left alone,
   a binned scene is reported, resolve + restore, the board's beat
   follows only inside the outline's beat sheet, setStepColor.

       node scripts/test-step-sync.mjs   (or: npm run test:step-sync)
   ============================================================ */
import { mem } from './node-seams.mjs';

const Sync = await import('../src/lib/step-scene-sync.js');
const S = await import('../src/lib/story.js');
const Scenes = (await import('../src/lib/scenes.js')).default;
const Bin = await import('../src/lib/scene-bin.js');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- plan(), pure ------------------------------------------- */
const P = Sync.plan;
eq(P({ id: 'a', text: 'x' }, null), null, 'a step with no link: nothing');
eq(P({ id: 'a', text: 'x', sceneId: 's' }, null), 'gone', 'a link to no scene: gone');
eq(P({ text: 'Ravi  opens\nthe shop', sceneId: 's', synced: 'Ravi opens the shop' }, { synopsis: ' Ravi opens the shop ' }), 'same', 'whitespace is not a change');
eq(P({ text: 'Ravi opens the shop at dawn', sceneId: 's', synced: 'Ravi opens the shop' }, { synopsis: 'Ravi opens the shop' }), 'push', 'the step changed: push');
eq(P({ text: 'Ravi opens the shop', sceneId: 's', synced: 'Ravi opens the shop' }, { synopsis: 'Ravi sells the shop' }), 'pull', 'the scene changed: pull');
eq(P({ text: 'A', sceneId: 's', synced: 'B' }, { synopsis: 'C' }), 'conflict', 'both changed: conflict');
eq(P({ text: 'A', sceneId: 's', synced: 'B' }, { synopsis: 'A' }), 'same', 'both changed to the same words: same');
eq(P({ text: 'A', sceneId: 's' }, { synopsis: 'A' }), 'adopt', 'no baseline, agreeing: adopt');
eq(P({ text: 'A', sceneId: 's' }, { synopsis: 'B' }), 'conflict', 'no baseline, differing: conflict (nothing is guessed)');
const long = 'word '.repeat(90).trim();   // 449 characters
const cut = long.slice(0, 277).trimEnd() + '…';
eq(Sync.oldCut(long), cut, 'oldCut is the old send’s cut');
eq(P({ text: long, sceneId: 's' }, { synopsis: cut }), 'adopt', 'an old 280-cut pair adopts');
eq(P({ text: long, sceneId: 's', synced: Sync.norm(long) }, { synopsis: cut }), 'same', 'and stays agreeing after');
eq(P({ text: long + ' more', sceneId: 's', synced: Sync.norm(long) }, { synopsis: cut }), 'push', 'an edit to the step of a 280-cut pair pushes');
eq(P({ text: long, sceneId: 's', synced: Sync.norm(long) }, { synopsis: 'Rewritten.' }), 'pull', 'an edit to the scene of a 280-cut pair pulls');
eq(Sync.planBeat({ sceneId: 's', beat: 'f:a' }, { beatId: 'f:a' }), 'adopt', 'beat: no baseline, adopt');
eq(Sync.planBeat({ sceneId: 's', beat: 'f:a', syncedBeat: 'f:a' }, { beatId: 'g:z' }), 'same', 'beat: the step did not move, the scene may sit anywhere');
eq(Sync.planBeat({ sceneId: 's', beat: 'f:b', syncedBeat: 'f:a' }, { beatId: 'f:a' }), 'push', 'beat: the step moved, the scene follows');

/* ---- story.js against the real scene list ------------------- */
const api = { ...Scenes, listBin: Bin.listBin };
const K = (b) => 'save_the_cat:' + b;
mem.clear();
const story0 = S.blankStory();
story0.frameworkChosen = true; story0.framework = 'save_the_cat';
const a = S.addOutlineStep(story0, { beat: K('catalyst'), text: 'The chain   arrives in town.' });
const b = S.addOutlineStep(story0, { beat: K('midpoint'), text: long });
const c = S.addOutlineStep(story0, { beat: K('finale'), text: 'Ravi fights back.' });
S.saveStory(story0);
const sent = S.loadStory();
const ids = S.sendOutlineToScenes(sent, api, { only: [a.id, b.id] });
eq(ids.length, 2, 'send: `only` sends just those steps');
S.saveStory(sent);
const byStep = (id) => S.loadStory().outline.find((x) => x.id === id);
const sceneOf = (id) => Scenes.listScenes().find((x) => x.id === byStep(id).sceneId);
eq(sceneOf(b.id).synopsis, long, 'send: the whole text, no 280 cut');
eq(sceneOf(a.id).synopsis, 'The chain arrives in town.', 'send: whitespace collapsed');
eq([byStep(a.id).synced, byStep(a.id).syncedBeat], ['The chain arrives in town.', K('catalyst')], 'send: the baseline is recorded');

const snapshot = () => JSON.stringify([...mem.entries()].sort());
let before = snapshot();
let r = S.reconcileStepScenes(api);
ok(!r.wrote && snapshot() === before, 'reconcile: nothing differs, nothing is written');

{ const s = S.loadStory(); S.updateOutlineStep(s, a.id, { text: 'The chain arrives, loud.' }); S.saveStory(s); }
r = S.reconcileStepScenes(api);
eq([r.pushed, sceneOf(a.id).synopsis, byStep(a.id).synced], [1, 'The chain arrives, loud.', 'The chain arrives, loud.'], 'reconcile: a step edit reaches its scene');
before = snapshot();
ok(!S.reconcileStepScenes(api).wrote && snapshot() === before, 'reconcile: and a second run writes nothing');

Scenes.updateScene(sceneOf(a.id).id, { synopsis: 'The chain opens next door.' });
r = S.reconcileStepScenes(api);
eq([r.pulled, byStep(a.id).text], [1, 'The chain opens next door.'], 'reconcile: a scene edit reaches its step');

{ const s = S.loadStory(); S.updateOutlineStep(s, a.id, { text: 'Mine.' }); S.saveStory(s); }
Scenes.updateScene(sceneOf(a.id).id, { synopsis: 'Theirs.' });
before = snapshot();
r = S.reconcileStepScenes(api);
eq(r.conflicts.map((x) => x.stepId), [a.id], 'reconcile: both edited is a conflict');
ok(snapshot() === before, 'reconcile: and a conflict writes nothing');
eq(S.linkStates(S.loadStory(), Scenes.listScenes(), api).get(a.id).action, 'conflict', 'linkStates: the conflict, read only');
const snap = S.resolveStepScene(api, a.id, 'scene');
eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Theirs.', 'Theirs.'], 'resolve: use the scene’s text');
ok(S.restoreStepScene(api, snap), 'restore: Undo');
eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Mine.', 'Theirs.'], 'restore: both sides back as they were');
eq(S.reconcileStepScenes(api).conflicts.length, 1, 'restore: and the conflict stands again');
const snap2 = S.resolveStepScene(api, a.id, 'step');
eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Mine.', 'Mine.'], 'resolve: send mine to the scene');
S.restoreStepScene(api, snap2);
eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Mine.', 'Theirs.'], 'restore: the scene’s text back too');
S.resolveStepScene(api, a.id, 'step');

/* the old 280-cut pair: adopted without touching either side */
{
  const s = S.loadStory();
  const st = s.outline.find((x) => x.id === b.id);
  delete st.synced; delete st.syncedBeat;
  S.saveStory(s);
  Scenes.updateScene(st.sceneId, { synopsis: cut });
}
const synBefore = sceneOf(b.id).synopsis, textBefore = byStep(b.id).text;
r = S.reconcileStepScenes(api);
eq([sceneOf(b.id).synopsis, byStep(b.id).text, r.pushed, r.pulled], [synBefore, textBefore, 0, 0], 'adopt: neither side is rewritten');
eq(byStep(b.id).synced, Sync.norm(long), 'adopt: only the baseline is recorded');
before = snapshot();
ok(!S.reconcileStepScenes(api).wrote && snapshot() === before, 'adopt: then nothing more is written');

/* the beat follows */
{ const s = S.loadStory(); S.moveOutlineStep(s, a.id, { beat: K('fun_and_games') }); S.saveStory(s); }
S.reconcileStepScenes(api);
eq(sceneOf(a.id).beatId, K('fun_and_games'), 'beat: a re-filed step carries its scene');
ok(S.followSceneBeat(sceneOf(a.id).id, K('bad_guys_close_in')), 'board: a scene re-filed in this beat sheet moves its step');
eq(byStep(a.id).beat, K('bad_guys_close_in'), 'board: the step is under the new beat');
Scenes.updateScene(sceneOf(a.id).id, { beatId: 'story_circle:you' });
ok(!S.followSceneBeat(sceneOf(a.id).id, 'story_circle:you'), 'board: a beat of another beat sheet leaves the step');
eq(byStep(a.id).beat, K('bad_guys_close_in'), 'board: the step stays');
before = snapshot();
ok(!S.reconcileStepScenes(api).wrote && snapshot() === before, 'board: and reconcile does not drag the scene back');

/* a binned scene */
Scenes.removeScene(sceneOf(b.id).id);
r = S.reconcileStepScenes(api);
eq(r.gone.map((g) => [g.stepId, g.binned]), [[b.id, true]], 'gone: a binned scene is reported, in the bin');
eq(S.linkStates(S.loadStory(), Scenes.listScenes(), api).get(b.id), { action: 'gone', sceneId: byStep(b.id).sceneId, binned: true }, 'linkStates: gone, binned');
{ const s = S.loadStory(); eq(S.sendOutlineToScenes(s, api, { only: [b.id] }).length, 1, 'Send again: a new scene'); S.saveStory(s); }
eq(sceneOf(b.id).synopsis, long, 'Send again: the whole text');

/* colours */
{
  const s = S.loadStory();
  ok(S.setStepColor(s, c.id, 'pink') && S.stepColor(s.outline.find((x) => x.id === c.id)) === 'pink', 'colour: set');
  S.setStepColor(s, c.id, '#ff0000');
  eq(S.stepColor(s.outline.find((x) => x.id === c.id)), '', 'colour: a hex is never a colour, it clears');
  S.setStepColor(s, a.id, 'blue');
  S.setStepColor(s, c.id, '');
  ok(!('color' in s.outline.find((x) => x.id === c.id)), 'colour: \'\' clears');
  S.saveStory(s);
  const m = S.stepsByScene(S.loadStory());
  eq(S.stepColor(m.get(sceneOf(a.id).id)), 'blue', 'colour: looked up from the scene, never copied onto it');
  ok(!('color' in sceneOf(a.id)), 'colour: the scene carries none');
  ok(S.setStepColor(s, 'nope', 'pink') === null, 'colour: an unknown step');
}

/* the baseline is not an edit: recording it keeps the step's stamp */
{
  const s = S.loadStory();
  const st = s.outline.find((x) => x.id === a.id);
  const u0 = st.u;
  st.synced = 'something else';
  S.saveStory(s);
  eq(byStep(a.id).u, u0, 'stamp: a baseline-only change does not restamp the step');
}

console.log(`${fail ? '✗' : '✓'} test-step-sync: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
