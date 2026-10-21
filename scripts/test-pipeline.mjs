/* ============================================================
   THE SCRIPT PIPELINE — src/lib/script-pipeline.js
   ------------------------------------------------------------
   "Break down everything", asserted in Node on the Dragon sample's
   screenplay (src/data/sample.dragon.script.json) and a small fixture:
     · a run fills every step: scene rows, cast tags, bible rows,
       shots, proposed days, budget days; props are SUGGESTIONS only;
     · a second run writes nothing — storage is byte-identical;
     · a user's edit survives a re-run: an edited shot, a tag added by
       hand, a scene's own day, an estimate line's own days;
     · only blanks are filled: a scene with shots gets no rule shots;
     · undo restores storage EXACTLY (byte for byte, absent keys absent);
     · undo after a later edit is surgical: the edit is kept, the run's
       writes go;
     · planPipeline() reads what is blank and writes nothing;
     · proposeDays() keeps a day under the page target.

       node scripts/test-pipeline.mjs   (or: npm run test:pipeline)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const P = await import('../src/lib/script-pipeline.js');
const Scenes = await import('../src/lib/scenes.js');
const Shots = await import('../src/lib/shots.js');
const { loadCharacters } = await import('../src/lib/characters.js');
const { blankElement, SCRIPT_KEY } = await import('../src/lib/script.js');
const { CALC_KEY } = await import('../src/lib/costs.js');
const { shootDayOf } = await import('../src/lib/locations.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const snapshot = () => JSON.stringify([...mem.entries()].sort());
const seed = (elements, extra = {}) => {
  mem.clear();
  mem.set(SCRIPT_KEY, JSON.stringify({ elements: elements.map((e, i) => blankElement({ id: 'e' + i, ...e })) }));
  for (const [k, v] of Object.entries(extra)) mem.set(k, typeof v === 'string' ? v : JSON.stringify(v));
};
const step = (res, id) => res.steps.find((s) => s.id === id) || {};
const run = (o = {}) => P.runPipeline({ yield: false, ...o });

const dragon = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8'));
const headings = dragon.elements.filter((e) => e.type === 'scene' && String(e.text).trim()).length;
const CALC = { ci_1_item: 'DOP', ci_1_rate: '20000', ci_2_custom: 'Production van', ci_2_rate: '4500', ci_2_days: '3', ci_3_days: '' };

/* ---- 1. a run, start to end ------------------------------------ */
seed(dragon.elements, { [CALC_KEY]: CALC });
{
  const plan = P.planPipeline();
  const before = snapshot();
  eq(plan.map((s) => s.id), P.STEPS.map((s) => s.id), 'plan lists every step in order');
  eq(plan.find((s) => s.id === 'scenes').todo, headings, 'plan: every heading is still to become a scene');
  ok(snapshot() === before, 'planPipeline writes nothing');

  const seen = [];
  const res = await run({ onStep: (st) => seen.push(st.id + ':' + st.status) });
  eq(seen.filter((x) => x.endsWith(':running')).length, P.STEPS.length, 'onStep: a running call per step');
  const scenes = Scenes.listScenes();
  eq(scenes.length, headings, 'every heading is a scene row');
  ok(scenes.every((s) => s.scriptElId), 'every row is linked to its heading');
  ok(scenes.some((s) => (s.elements.cast || []).length), 'cast is tagged from cues');
  ok(scenes.every((s) => !(s.elements.props || []).length), 'props are NOT tagged (suggestions only)');
  ok(step(res, 'props').count > 0 && step(res, 'props').wrote === 0, 'props: suggestions counted, nothing written');
  ok(loadCharacters().length >= 5, 'recurring speakers joined the Story Bible (' + loadCharacters().length + ')');
  const shots = Shots.listShots();
  ok(shots.length > headings, 'a shot division for the scenes (' + shots.length + ' shots)');
  ok(shots.every((s) => s.rules === true), 'every proposed shot is marked as rules');
  ok(scenes.every((s) => shootDayOf(s) > 0), 'every scene got a proposed day');
  const calc = JSON.parse(mem.get(CALC_KEY));
  eq(calc.ci_1_days, String(step(res, 'days').count), 'a blank budget line took the shoot length');
  eq(calc.ci_2_days, '3', 'a budget line with days kept them');
  ok(!('ci_3_days' in calc) || calc.ci_3_days === '', 'a row with no item and no rate is not a line');
  ok(step(res, 'analysis').status === 'derived' && step(res, 'analysis').wrote === 0, 'analysis is derived');
  ok(/scenes?/.test(res.summary.text) && /shots?/.test(res.summary.text) && /suggested/.test(res.summary.text), 'summary sentence: ' + res.summary.text);
  eq(res.summary.scenes, headings, 'summary counts the scenes');

  const after = P.planPipeline();
  for (const id of ['scenes', 'characters', 'shots', 'days', 'budget']) eq(after.find((s) => s.id === id).todo, 0, 'plan after the run: nothing blank for ' + id);

  /* ---- 2. a second run writes nothing ---------------------------- */
  const s1 = snapshot();
  const again = await run();
  eq(again.wrote, 0, 'second run: wrote 0');
  ok(snapshot() === s1, 'second run: storage byte-identical');
  ok(again.steps.every((s) => s.status !== 'done'), 'second run: no step reports done');
  eq(again.undo(), 0, 'undo of a run that wrote nothing reverses nothing');
  ok(snapshot() === s1, '…and changes nothing');

  /* ---- 3. a user edit survives a re-run -------------------------- */
  const first = Shots.listShots()[0];
  Shots.updateShot(first.id, { description: 'MY OWN WIDE — edited by hand' });
  const sc = Scenes.listScenes()[0];
  Scenes.tagElement(sc.id, 'props', 'Grandfather clock');
  Scenes.updateScene(Scenes.listScenes()[1].id, { shootDay: 99 });
  const edited = JSON.parse(mem.get(CALC_KEY)); edited.ci_1_days = '7'; mem.set(CALC_KEY, JSON.stringify(edited));
  const s2 = snapshot();
  const third = await run();
  eq(third.wrote, 0, 're-run after edits: wrote 0');
  ok(snapshot() === s2, 're-run after edits: storage byte-identical');
  eq(Shots.listShots().find((s) => s.id === first.id).description, 'MY OWN WIDE — edited by hand', 'the edited shot survives');
  ok((Scenes.listScenes()[0].elements.props || []).includes('Grandfather clock'), 'the hand tag survives');
  eq(Scenes.listScenes()[1].shootDay, 99, 'a moved day survives');
  eq(JSON.parse(mem.get(CALC_KEY)).ci_1_days, '7', 'an edited budget day survives');

  /* a place, time and number typed on a linked row survive a re-run
     (the scenes step fills blanks; it does not re-read the heading) */
  const row0 = Scenes.listScenes()[0];
  Scenes.updateScene(row0.id, { location: 'MY OWN PLACE', dayNight: 'NIGHT', number: '1A' });
  const s3 = snapshot();
  const fourth = await run();
  const kept = Scenes.listScenes().find((x) => x.id === row0.id);
  eq([kept.location, kept.dayNight, kept.number], ['MY OWN PLACE', 'NIGHT', '1A'], 'a re-run keeps the place, time and number typed on a linked scene');
  eq(fourth.wrote, 0, 're-run after a scene edit: wrote 0');
  ok(snapshot() === s3, 're-run after a scene edit: storage byte-identical');
  eq(fourth.undoable, false, 're-run that changed nothing offers no Undo');

  /* undo of the FIRST run, after the edits: surgical, edits kept */
  res.undo();
  eq(Shots.listShots().map((s) => s.id), [], 'surgical undo: the rule shots (and the edited one, which the run made) are gone');
  ok(Scenes.listScenes().length === 0, 'surgical undo: the rows the run added are gone (to the bin)');
  eq(loadCharacters().length, 0, 'surgical undo: the bible rows the run added are gone');
  eq(JSON.parse(mem.get(CALC_KEY)).ci_1_days, '7', 'surgical undo: the hand-edited budget day is kept');
}

/* ---- 4. undo restores storage exactly ------------------------------ */
seed(dragon.elements, { [CALC_KEY]: CALC });
{
  const before = snapshot();
  const res = await run();
  ok(res.wrote > 0, 'fresh run wrote something');
  eq(res.undoable, true, 'a run that changed storage offers Undo');
  ok(snapshot() !== before, 'storage changed');
  const n = res.undo();
  ok(n >= 5, 'undo reversed the writing steps (' + n + ')');
  ok(snapshot() === before, 'undo restores storage exactly (byte for byte, absent keys absent)');
  eq(res.undo(), 0, 'a second undo does nothing');
}

/* ---- 5. surgical undo keeps a later edit --------------------------- */
seed(dragon.elements, { [CALC_KEY]: CALC });
{
  const res = await run();
  const scene = Scenes.listScenes()[2];
  const mine = Shots.addShot(scene.id, { description: 'Added by hand after the run' });
  const c = JSON.parse(mem.get(CALC_KEY)); c.ci_2_rate = '5000'; mem.set(CALC_KEY, JSON.stringify(c));
  res.undo();
  eq(Shots.listShots().map((s) => s.description), ['Added by hand after the run'], 'surgical undo: a shot added afterwards is kept, the run\'s are gone');
  const calc = JSON.parse(mem.get(CALC_KEY));
  eq(calc.ci_2_rate, '5000', 'surgical undo: a rate edited afterwards is kept');
  ok(!calc.ci_1_days, 'surgical undo: the day the run filled is blank again');
  void mine;
}

/* ---- 6. only blanks: existing work steers the run -------------------- */
const E = (type, text) => ({ type, text });
const FIVE = [
  E('scene', 'INT. CHAI SHOP - DAY'), E('action', 'RAVI, 30s, wipes a glass. A TRUCK idles outside, a KNIFE on the counter.'),
  E('character', 'RAVI'), E('dialogue', 'One tea. Only one.'), E('character', 'MEENA'), E('dialogue', 'Then two.'),
  E('scene', 'EXT. BUS STAND - NIGHT'), E('action', 'Rain. Meena runs.'), E('character', 'MEENA (O.S.)'), E('dialogue', 'Wait!'),
  E('scene', 'INT. CHAI SHOP - NIGHT'), E('character', 'RAVI'), E('dialogue', 'You came back.'), E('character', 'MEENA'), E('dialogue', 'For the tea.'),
  E('scene', 'EXT. ROOFTOP - DAY'), E('action', 'Empty. Nobody speaks.')
];
seed(FIVE);
{
  const first = await run({ only: ['scenes'] });
  eq(step(first, 'scenes').status, 'done', 'only: the scenes step alone');
  eq(first.steps.length, 1, 'only: one step');
  const [a, b] = Scenes.listScenes();
  Shots.addShot(a.id, { description: 'My master' });
  Scenes.updateScene(b.id, { shootDay: 4 });
  const res = await run();
  const shots = Shots.listShots();
  eq(shots.filter((s) => s.sceneId === a.id).map((s) => s.description), ['My master'], 'a scene with a shot gets no rule shots');
  ok(shots.some((s) => s.sceneId !== a.id && s.rules), 'the other scenes do');
  eq(Scenes.listScenes()[1].shootDay, 4, 'a scheduled scene keeps its day');
  ok(Scenes.listScenes().filter((s) => s.id !== b.id).every((s) => shootDayOf(s) > 4), 'proposed days follow the last day in use');
  eq(step(res, 'budget').status, 'nothing', 'no estimate lines: the budget step has nothing to do');
  eq(loadCharacters().map((c) => c.name).sort(), ['MEENA', 'RAVI'], 'speakers in two scenes join the bible');
}

/* ---- 6b. a revised draft: rows that lost their heading are never binned
   by the pipeline (binning takes shots and sheets with it) ------------ */
seed(dragon.elements);
{
  await run({ only: ['scenes', 'shots'] });
  const was = Scenes.listScenes().length;
  const doc = JSON.parse(mem.get(SCRIPT_KEY));
  let k = 0;
  doc.elements = doc.elements.map((e, i) => {
    const out = { ...e, id: 'r' + i };
    if (e.type === 'scene' && String(e.text).trim() && (k++ % 2)) out.text = e.text + ' X';
    return out;
  });
  mem.set(SCRIPT_KEY, JSON.stringify(doc));
  const before = snapshot();
  const res = await run({ only: ['scenes'] });
  const st = step(res, 'scenes');
  eq(st.status, 'skipped', 'revised draft: the scenes step refuses rather than bin');
  ok(/lost their heading/.test(st.detail || ''), 'revised draft: the step says why — ' + st.detail);
  eq(Scenes.listScenes().length, was, 'revised draft: no row added, none binned');
  ok(snapshot() === before, 'revised draft: storage untouched');
  eq(res.undoable, false, 'revised draft: nothing to undo');
}

/* ---- 7. no headings ------------------------------------------------- */
seed([E('action', 'Notes to self. No scene yet.')]);
{
  const before = snapshot();
  const res = await run();
  eq(step(res, 'scenes').status, 'skipped', 'no headings: the scenes step is skipped');
  eq(res.wrote, 0, 'no headings: nothing written');
  ok(snapshot() === before, 'no headings: storage untouched');
}

/* ---- 8. proposeDays ------------------------------------------------- */
{
  const rows = [
    { id: 'a', location: 'House', eighths: 30 }, { id: 'b', location: 'House', eighths: 20 },
    { id: 'c', location: 'Street', eighths: 4 }, { id: 'd', location: '', eighths: 8 }, { id: 'e', location: 'House', eighths: 8, shootDay: 2 }
  ].map((r) => Scenes.blankScene(r));
  const { plan, days } = P.proposeDays(rows, { target: 39, startAt: 3 });
  eq(plan.map((p) => p.id + p.day).join(' '), 'a3 b4 c4 d4', 'proposeDays: by place, longest first, capped, from day 3, scheduled scenes left out');
  eq(days, 2, 'proposeDays: two days');
}

console.log(`\ntest:pipeline — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
