/* ============================================================
   BEAT STEP <-> SCENE SYNC, and beat colours — in Node
   ------------------------------------------------------------
   src/lib/step-scene-sync.js is pure: every plan() case, the rules for
   pairs sent before the baseline existed (agreeing: adopted; the old
   280-cut: the full text pushed; anything else: apart), a scene BEHIND
   a baseline that arrived (pushed, never pulled), the beat rule. Then story.js against the real
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
eq(P({ text: 'A', sceneId: 's' }, { synopsis: 'B' }), 'apart', 'no baseline, differing: apart (they never agreed; nothing is offered over either)');
const long = 'word '.repeat(90).trim();   // 449 characters
const cut = long.slice(0, 277).trimEnd() + '…';
eq(Sync.oldCut(long), cut, 'oldCut is the old send’s cut');
eq(P({ text: long, sceneId: 's' }, { synopsis: cut }), 'push', 'an old 280-cut pair: the scene gets the full text');
eq(P({ text: long, sceneId: 's', synced: Sync.norm(long) }, { synopsis: cut }), 'push', 'and so does one adopted before that rule (the scene still holds the cut)');
eq(P({ text: 'B', sceneId: 's', synced: 'B', syncedWas: 'A' }, { synopsis: 'A' }), 'push', 'a scene holding the baseline before: behind, pushed (never pulled)');
eq(P({ text: 'C', sceneId: 's', synced: 'B', syncedWas: 'A' }, { synopsis: 'A' }), 'push', 'behind, and the step moved on again: still pushed');
eq(P({ text: 'B', sceneId: 's', synced: 'B', syncedWas: 'A' }, { synopsis: 'D' }), 'pull', 'a scene holding new words: pulled as before');
eq(P({ text: 'B', sceneId: 's', synced: 'B', syncedWas: 'A' }, { synopsis: 'A' }, { caughtUp: true }), 'pull', 'once this page saw the scene catch up, the older words are an edit: pulled');
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
/* Undo keeps what was typed after the resolve (breakdown QA r2) */
{
  const sn = S.resolveStepScene(api, a.id, 'step');
  Scenes.updateScene(sceneOf(a.id).id, { synopsis: 'Later edit by me.' });
  S.reconcileStepScenes(api);
  eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Later edit by me.', 'Later edit by me.'], 'later: the edit reached both sides');
  eq(S.restoreStepScene(api, sn), false, 'later: Undo has nothing it may put back');
  eq([byStep(a.id).text, sceneOf(a.id).synopsis], ['Later edit by me.', 'Later edit by me.'], 'later: Undo does not wipe the later writing');
}
S.resolveStepScene(api, a.id, 'step');

/* the old 280-cut pair: the scene gets the full text, so an edit to it
   later can never shrink the step to the cut (QA round 1, T1) */
{
  const s = S.loadStory();
  const st = s.outline.find((x) => x.id === b.id);
  delete st.synced; delete st.syncedBeat;
  S.saveStory(s);
  Scenes.updateScene(st.sceneId, { synopsis: cut });
}
const textBefore = byStep(b.id).text;
r = S.reconcileStepScenes(api);
eq([sceneOf(b.id).synopsis, byStep(b.id).text, r.pushed, r.pulled], [Sync.norm(long), textBefore, 1, 0], 'old cut: the scene gets the full text, the step is untouched');
eq(byStep(b.id).synced, Sync.norm(long), 'old cut: the baseline is the full text');
Scenes.updateScene(sceneOf(b.id).id, { synopsis: 'The big ' + sceneOf(b.id).synopsis });
S.reconcileStepScenes(api);
eq(byStep(b.id).text, 'The big ' + Sync.norm(long), 'old cut: a later scene edit keeps the whole step');
{ const s = S.loadStory(); S.updateOutlineStep(s, b.id, { text: long }); S.saveStory(s); }
S.reconcileStepScenes(api);
/* and one adopted under the earlier rule (baseline set, scene still the cut) */
{
  const s = S.loadStory();
  s.outline.find((x) => x.id === b.id).synced = Sync.norm(long);
  S.saveStory(s);
  Scenes.updateScene(sceneOf(b.id).id, { synopsis: cut });
}
S.reconcileStepScenes(api);
eq(sceneOf(b.id).synopsis, Sync.norm(long), 'old cut, already adopted: the scene is put right');
before = snapshot();
ok(!S.reconcileStepScenes(api).wrote && snapshot() === before, 'old cut: then nothing more is written');

/* a pair that never agreed (a sample's prose, a breakdown's "Sc 1 — SLUG"
   step): apart. Nothing written, no conflict, either way (QA round 1). */
{
  const s = S.loadStory();
  const st = s.outline.find((x) => x.id === b.id);
  delete st.synced; delete st.syncedWas; st.text = 'Sc 2 — INT. SHOP — DAY: the shelves. (Ravi)';
  S.saveStory(s);
}
before = snapshot();
r = S.reconcileStepScenes(api);
eq([r.conflicts.length, r.pushed, r.pulled], [0, 0, 0], 'apart: no conflict, nothing carried');
ok(!('synced' in byStep(b.id)) && sceneOf(b.id).synopsis === Sync.norm(long), 'apart: neither side touched, no baseline');
eq(S.linkStates(S.loadStory(), Scenes.listScenes(), api).get(b.id).action, 'apart', 'linkStates: apart (no note)');
{ const s = S.loadStory(); S.updateOutlineStep(s, b.id, { text: long }); S.saveStory(s); }
S.reconcileStepScenes(api);
eq(byStep(b.id).synced, Sync.norm(long), 'apart: once they agree, adopted');

/* a step baseline that ARRIVED ahead of its scene (two rows, two
   arrivals): the scene is behind and takes the step's text; the step
   is never put back (QA round 1, the push loop). */
{
  const s = S.loadStory();
  const st = s.outline.find((x) => x.id === b.id);
  // what a collaborator's push leaves on the step: text = baseline = NEW, the baseline before = the scene's
  st.syncedWas = st.synced; st.text = long + ' Ravi refuses to sell.'; st.synced = Sync.norm(st.text);
  S.saveStory(s);
}
const uArrived = byStep(b.id).u;
r = S.reconcileStepScenes(api);
eq([r.pulled, byStep(b.id).text, sceneOf(b.id).synopsis], [0, long + ' Ravi refuses to sell.', Sync.norm(long + ' Ravi refuses to sell.')], 'arrival: the scene catches up, the step keeps the new text');
eq(byStep(b.id).u, uArrived, 'arrival: the step is not restamped (no push back)');
before = snapshot();
ok(!S.reconcileStepScenes(api).wrote && snapshot() === before, 'arrival: settled in one pass');

/* A REVERT ON THIS PAGE IS AN EDIT (QA round 2): once the scene was seen
   at the new baseline, the words before it are pulled into the step,
   never pushed over (and so never lost on reload, nor to Ctrl+Z). */
{
  const was = Sync.norm(long);
  Scenes.updateScene(sceneOf(b.id).id, { synopsis: was });
  r = S.reconcileStepScenes(api);
  eq([r.pushed, r.pulled, byStep(b.id).text, sceneOf(b.id).synopsis], [0, 1, was, was], 'revert: a scene set back to the baseline before is pulled, not overwritten');
  { const s = S.loadStory(); S.updateOutlineStep(s, b.id, { text: 'Version B.' }); S.saveStory(s); }
  r = S.reconcileStepScenes(api);
  eq([r.pushed, byStep(b.id).syncedWas], [1, was], 'revert: a step edit pushed (the baseline before is kept)');
  Scenes.updateScene(sceneOf(b.id).id, { synopsis: was });
  r = S.reconcileStepScenes(api);
  eq([r.pushed, r.pulled, r.conflicts.length, byStep(b.id).text, sceneOf(b.id).synopsis], [0, 1, 0, was, was], 'revert: then the scene put back to the old words: pulled');
}

/* a LOCKED outline: a scene edit is shown, never written into the step */
{
  const s = S.loadStory(); s.outlineLockedAt = '2026-10-01T00:00:00.000Z'; S.saveStory(s);
  const textNow = byStep(b.id).text;
  Scenes.updateScene(sceneOf(b.id).id, { synopsis: 'Scene side edit' });
  r = S.reconcileStepScenes(api);
  eq([byStep(b.id).text, r.pulled, r.conflicts.map((x) => x.stepId)], [textNow, 0, [b.id]], 'lock: the step keeps its text; shown as differing');
  eq(S.linkStates(S.loadStory(), Scenes.listScenes(), api).get(b.id).action, 'conflict', 'lock: linkStates says so');
  eq(S.resolveStepScene(api, b.id, 'scene'), null, 'lock: "use the scene’s text" is refused');
  eq(byStep(b.id).text, textNow, 'lock: the step is unchanged');
  const sid = sceneOf(b.id).id, beat0 = byStep(b.id).beat;
  ok(!S.followSceneBeat(sid, K('finale')), 'lock: a scene re-filed on the board does not move its step');
  eq(byStep(b.id).beat, beat0, 'lock: the step stays under its beat');
  ok(S.resolveStepScene(api, b.id, 'step'), 'lock: "send mine to the scene" still works');
  eq(sceneOf(b.id).synopsis, Sync.norm(textNow), 'lock: the scene has the step’s text');
  const s2 = S.loadStory(); s2.outlineLockedAt = ''; S.saveStory(s2);
}

/* the samples: every linked step is apart or agreeing, no conflict */
for (const name of ['dragon', 'darkknight']) {
  const story = JSON.parse((await import('node:fs')).readFileSync(new URL(`../src/data/sample.${name}.story.json`, import.meta.url), 'utf8')).story;
  const prefix = story.outline.find((st) => st.sceneId).sceneId.replace(/-sc-.*$/, '');
  const scenes = JSON.parse((await import('node:fs')).readFileSync(new URL(`../src/data/sample.${name}.json`, import.meta.url), 'utf8')).scenes
    .map((sc) => ({ ...sc, id: prefix + '-sc-' + sc.number }));   // the id the sample loader gives each (hub-sample.js)
  const acts = [...S.linkStates(story, scenes, {}).values()].map((l) => l.action);
  ok(acts.length > 0 && !acts.includes('conflict'), `sample ${name}: ${acts.length} linked steps, none a conflict (${[...new Set(acts)]})`);
}

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
eq(sceneOf(b.id).synopsis, Sync.norm(byStep(b.id).text), 'Send again: the whole text');

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
