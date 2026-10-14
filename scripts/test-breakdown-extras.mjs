/* ============================================================
   TEST — shots and story PROPOSED from the scenes
   (src/lib/breakdown-extras.js) and the AI half that files the
   story (draftSceneStory in src/lib/ai.js), in Node, no browser,
   no key, no network:

       node scripts/test-breakdown-extras.mjs
       (or: npm run test:breakdown-extras)

   Asserts, on a five-page fixture run through runBreakdown() and on
   the Dragon sample:
     · the proposal builders WRITE NOTHING (storage byte-identical);
     · shots: every draft is marked rules: true, ids are unique, the
       `only` filter holds, a scene with no script is reported, and
       appendShots() numbers after the shots a scene already has and
       leaves the list it was given alone;
     · story: one step per scene, each beat framework-qualified and
       real, filed in page order (beats never run backwards), the
       synopsis preferred to the first action line, the cast named, a
       scene's own beatId kept, another framework's beat carried across
       by position; appendSteps() links by sceneId and removeSteps()
       is an exact undo;
     · ONLY NEW SCENES: after accepting, nothing is fresh; a scene added
       to the script is the only one proposed;
     · draftSceneStory() against a faked model: an unknown sceneId and a
       second step for one scene are dropped, an unknown beat falls back
       to the job's own, the order is the writer's, and the prompt says
       what it sends.
   ============================================================ */
import { register } from 'node:module';

/* store.js becomes the raw accessors over an in-memory map (what
   ai-providers.js needs), and localStorage is the same map. */
const mem = new Map();
globalThis.__fakeMem = mem;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        'export const flushStorage = () => Promise.resolve();' +
        'export default {};'), shortCircuit: true };
    if (spec.endsWith('.css'))
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

const X = await import('../src/lib/breakdown-extras.js');
const Scenes = (await import('../src/lib/scenes.js')).default;
const Shots = await import('../src/lib/shots.js');
const Story = await import('../src/lib/story.js');
const { runBreakdown } = await import('../src/lib/breakdown-run.js');
const { blankElement, SCRIPT_KEY, loadScript } = await import('../src/lib/script.js');
const { default: sample } = await import('../src/data/sample.dragon.json');
const { default: dragon } = await import('../src/data/sample.dragon.script.json');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const snapshot = () => JSON.stringify([...mem.entries()].sort());

/* ---- the five-page fixture, through the real breakdown -------- */
const E = (type, text) => ({ type, text });
const FIVE = [
  E('scene', 'INT. CHAI SHOP - DAY'),
  E('action', 'RAVI, 30s, wipes a glass. A TRUCK idles outside.'),
  E('character', 'RAVI'), E('dialogue', 'One tea. Only one.'),
  E('character', 'MEENA'), E('dialogue', 'Then two.'),
  E('scene', 'EXT. BUS STAND - NIGHT'),
  E('action', 'Rain. Meena runs for the last bus.'),
  E('character', 'MEENA (O.S.)'), E('dialogue', 'Wait!'),
  E('scene', 'INT. CHAI SHOP - NIGHT'),
  E('action', 'Ravi alone. He pours two cups anyway.'),
  E('scene', 'EXT. BEACH - DAWN'),
  E('action', 'Meena on the sand, the bag at her feet.'),
  E('character', 'MEENA'), E('dialogue', 'I came back.'),
  E('character', 'RAVI'), E('dialogue', 'I know.')
];
const seed = (els) => {
  mem.clear();
  mem.set(SCRIPT_KEY, JSON.stringify({ elements: els.map((e, i) => blankElement({ id: 'e' + i, ...e })) }));
};
seed(FIVE);
runBreakdown();
let scenes = Scenes.listScenes();
eq(scenes.length, 4, 'the fixture breaks into four scenes');
const elements = loadScript().elements;

/* ---- pure: nothing written ------------------------------------ */
const before = snapshot();
const shotP = X.proposeShots({ scenes, elements });
const storyP = X.proposeStory({ scenes, elements, fwId: 'save_the_cat' });
X.scenesWithShots(Shots.listShots()); X.scenesWithSteps(Story.loadStory());
eq(snapshot(), before, 'the proposal builders write nothing');

/* ---- shots ---------------------------------------------------- */
ok(shotP.items.length >= 8, 'a real division for four scenes — ' + shotP.items.length + ' shots');
eq(shotP.scenes, 4, 'every scene with script got shots');
ok(shotP.items.every((it) => it.draft.rules === true && it.draft.ai !== true), 'every draft is marked rules: true, never ai');
eq(new Set(shotP.items.map((it) => it.id)).size, shotP.items.length, 'item ids are unique');
ok(shotP.items.every((it) => /^Sc \d+ · /.test(it.text) && it.detail), 'each item names its scene and carries size/angle/movement');
const only = X.proposeShots({ scenes, elements, only: [scenes[1].id] });
ok(only.items.length && only.items.every((it) => it.sceneId === scenes[1].id), 'the only filter holds');
const orphan = { id: 'ghost', number: '9', intExt: 'INT', location: 'NOWHERE', dayNight: 'DAY', eighths: 8, elements: {} };
const withGhost = X.proposeShots({ scenes: [...scenes, orphan], elements, only: ['ghost', scenes[0].id] });
eq(withGhost.noScript.map((s) => s.id), ['ghost'], 'a scene with no script slice is reported, not invented');

// appendShots numbers after what a scene already has, and copies.
const existing = [Shots.blankShot({ sceneId: scenes[0].id, number: '1' }), Shots.blankShot({ sceneId: scenes[0].id, number: '2' })];
const frozen = JSON.stringify(existing);
const picked = shotP.items.filter((it) => it.sceneId === scenes[0].id).slice(0, 2)
  .concat(shotP.items.filter((it) => it.sceneId === scenes[1].id).slice(0, 1));
const app = X.appendShots(existing, picked);
eq(JSON.stringify(existing), frozen, 'appendShots leaves the given list alone');
eq(app.made.length, 3, 'three shots made');
eq(app.shots.filter((s) => s.sceneId === scenes[0].id).map((s) => s.number), ['1', '2', '3', '4'], 'numbered after the scene’s own shots');
eq(app.shots.find((s) => s.sceneId === scenes[1].id).number, '1', 'a scene with none starts at 1');
ok(app.shots.filter((s) => app.made.includes(s.id)).every((s) => s.rules === true), 'the made shots keep rules: true');
eq(X.appendShots([], [{ sceneId: '', draft: {} }, null]).made, [], 'nothing without a scene or a draft');

/* ---- story ---------------------------------------------------- */
eq(storyP.items.length, 4, 'one step per scene');
eq(storyP.framework.id, 'save_the_cat', 'the framework asked for');
ok(storyP.items.every((it) => Story.resolveBeatKey(it.beat) && it.beat.startsWith('save_the_cat:')), 'every beat is qualified and real');
const at = storyP.items.map((it) => Story.resolveBeatKey(it.beat).beat.at);
ok(at.every((v, i) => i === 0 || v >= at[i - 1]), 'filed in page order — the beats never run backwards: ' + at.join(','));
ok(/^Sc 1 — INT\. CHAI SHOP — DAY: RAVI, 30s, wipes a glass/.test(storyP.items[0].text), 'number, slug and the first action line: ' + storyP.items[0].text);
ok(/\(Ravi, Meena\)$/.test(storyP.items[0].text), 'the cast is named: ' + storyP.items[0].text);
ok(/under|Under/.test(storyP.items[0].detail), 'the detail says which beat');

// The synopsis is preferred; the scene's own beatId kept; another framework's carried across.
Scenes.updateScene(scenes[2].id, { synopsis: 'Ravi waits for her anyway.', beatId: 'save_the_cat:dark_night' });
Scenes.updateScene(scenes[0].id, { beatId: 'three_act:resolution' });
scenes = Scenes.listScenes();
const s2 = X.proposeStory({ scenes, elements, fwId: 'save_the_cat' });
ok(/: Ravi waits for her anyway\./.test(s2.items[2].text), 'the writer’s synopsis beats the action line');
eq(s2.items[2].beat, 'save_the_cat:dark_night', 'a scene’s own beat in this framework is kept');
const resAt = Story.beatById('three_act', 'resolution').at;
eq(s2.items[0].beat, 'save_the_cat:' + Story.nearestBeat('save_the_cat', resAt).id, 'another framework’s beat is carried across by position');
const pos = X.scenePositions(scenes);
ok([...pos.values()].every((v, i, a) => v > 0 && v < 1 && (i === 0 || v > a[i - 1])), 'positions rise through the page count');
eq(X.scenePositions([{ id: 'a', eighths: 0 }, { id: 'b', eighths: 0 }]).get('b'), 0.75, 'no lengths: the order decides');

// appendSteps links by sceneId; removeSteps is exact.
let st = Story.loadStory();
const outline0 = JSON.stringify(st.outline);
const made = X.appendSteps(st, s2.items);
eq(made.length, 4, 'four steps filed');
ok(st.outline.every((x) => x.sceneId && Story.resolveBeatKey(x.beat)), 'each step is linked to its scene and under a real beat');
eq(st.outline.map((x) => x.sceneId).sort(), scenes.map((s) => s.id).sort(), 'one per scene');
X.removeSteps(st, made);
eq(JSON.stringify(st.outline), outline0, 'removeSteps puts the outline back exactly');

/* ---- only new scenes ------------------------------------------ */
st = Story.loadStory();
X.appendSteps(st, s2.items);
Story.saveStory(st);
Shots.saveShots(X.appendShots(Shots.listShots(), shotP.items).shots);
scenes = Scenes.listScenes();
const haveShots = X.scenesWithShots(Shots.listShots());
const haveSteps = X.scenesWithSteps(Story.loadStory());
eq(X.splitExisting(scenes, haveShots).fresh.length, 0, 'after accepting, no scene is fresh for shots');
eq(X.splitExisting(scenes, haveSteps).fresh.length, 0, 'after accepting, no scene is fresh for story');
const more = FIVE.concat([E('scene', 'EXT. TEMPLE - DAY'), E('action', 'Bells. They walk in together.')]);
mem.set(SCRIPT_KEY, JSON.stringify({ elements: more.map((e, i) => blankElement({ id: 'e' + i, ...e })) }));
runBreakdown();
scenes = Scenes.listScenes();
const fresh = X.splitExisting(scenes, X.scenesWithShots(Shots.listShots()));
eq(fresh.fresh.length, 1, 'a re-run finds only the new scene');
ok(/TEMPLE/.test(fresh.fresh[0].location.toUpperCase()), 'and it is the temple');
eq(fresh.existing.length, 4, 'the four with shots are the ones to ask about');
eq(X.splitExisting(scenes, X.scenesWithSteps(Story.loadStory())).fresh.map((s) => s.id), fresh.fresh.map((s) => s.id), 'the same scene is the only new one for story');
eq(X.sceneList(fresh.existing), 'Sc 1, 2, 3 and 4', 'the dialog names the scenes');
eq(X.sceneList([{ number: '7' }]), 'Sc 7', 'one scene');
ok(/and 3 more$/.test(X.sceneList(Array.from({ length: 15 }, (_, i) => ({ number: String(i + 1) })))), 'a long list says how many more');

/* ---- the Dragon sample, at scale ------------------------------ */
mem.clear();
const dScenes = sample.scenes.map((s, i) => ({ ...Scenes.blankScene(), id: 'sc' + (i + 1), ...s }));
const dSnap = snapshot();
const dShots = X.proposeShots({ scenes: dScenes, elements: dragon.elements });
const dStory = X.proposeStory({ scenes: dScenes, elements: dragon.elements, fwId: 'three_act' });
eq(snapshot(), dSnap, 'the sample: still nothing written');
eq(dShots.scenes, 36, 'the sample: every scene gets shots');
eq(dStory.items.length, dScenes.length, 'the sample: one step per scene');
ok(dStory.items.every((it) => it.text.length > 20 && it.text.length < 700), 'the sample: every step reads as a step');
const dAt = dStory.items.map((it) => Story.resolveBeatKey(it.beat).beat.at);
ok(dAt.every((v, i) => i === 0 || v >= dAt[i - 1]), 'the sample: in page order');
ok(new Set(dStory.items.map((it) => it.beat)).size >= 5, 'the sample: spread across the beats');

/* ---- the AI half: draftSceneStory against a faked model ------- */
const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');
AI.setProvider('anthropic');
AI.setKey('sk-ant-TESTTESTTESTTESTTEST');
const fw = Story.frameworkById('save_the_cat');
const job = {
  framework: { id: fw.id, label: fw.label, beats: fw.beats },
  scenes: [
    { sceneId: 'a', number: '1', slug: 'INT. CHAI SHOP — DAY', synopsis: '', script: 'RAVI wipes a glass.', beat: 'save_the_cat:opening_image' },
    { sceneId: 'b', number: '2', slug: 'EXT. BUS STAND — NIGHT', synopsis: 'Meena runs.', script: 'x'.repeat(5000), beat: 'save_the_cat:catalyst' }
  ],
  idea: 'Two people and a tea shop.', logline: ''
};
const prompt = AI.buildSceneStoryPrompt(job);
ok(/sceneId: a/.test(prompt) && /sceneId: b/.test(prompt), 'the prompt carries each scene id');
ok(/opening_image — Opening Image/.test(prompt), 'the prompt lists the beats by id and label');
ok(/the rest of the scene is not sent/.test(prompt) && prompt.length < 5000, 'a long scene is cut and says so');
let sent = null;
const restore = installFakeFetch(async (req) => {
  sent = req;
  return { steps: [
    { sceneId: 'b', beat: 'nonsense', text: 'Meena runs for the last bus and misses it.' },
    { sceneId: 'zz', beat: 'catalyst', text: 'A scene nobody offered.' },
    { sceneId: 'a', beat: 'setup', text: 'Ravi serves one tea.' },
    { sceneId: 'a', beat: 'debate', text: 'A second step for the same scene.' }
  ] };
});
const out = await AI.draftSceneStory(job);
restore();
ok(sent && /sceneId: a/.test(sent.user), 'the request is the prompt shown');
eq(out.steps.map((s) => s.sceneId), ['a', 'b'], 'unknown scene and second step dropped; the writer’s order');
eq(out.steps[0].beat, 'save_the_cat:setup', 'a beat the framework has is qualified');
eq(out.steps[1].beat, 'save_the_cat:catalyst', 'an unknown beat falls back to the job’s own');
let threw = '';
try { await AI.draftSceneStory({ ...job, scenes: [] }); } catch (e) { threw = e.kind || e.code || e.message; }
ok(threw, 'no scenes is refused, not sent');

console.log(`\ntest:breakdown-extras — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
