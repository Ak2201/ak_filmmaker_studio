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
  const BASE = P.STEPS.filter((s) => !s.lockOnly);
  eq(plan.map((s) => s.id), BASE.map((s) => s.id), 'plan lists every step in order (the lock-only steps only with lock: true)');
  eq(plan.find((s) => s.id === 'scenes').todo, headings, 'plan: every heading is still to become a scene');
  ok(snapshot() === before, 'planPipeline writes nothing');

  const seen = [];
  const res = await run({ onStep: (st) => seen.push(st.id + ':' + st.status) });
  eq(seen.filter((x) => x.endsWith(':running')).length, BASE.length, 'onStep: a running call per step');
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

/* ---- QA r4: the step details say what is true ------------------ */
{
  seed([
    { type: 'scene', text: 'EXT. ROAD - DAY' }, { type: 'action', text: 'A jeep roars past. Ravi grabs a lantern.' },
    { type: 'character', text: 'RAVI' }, { type: 'dialogue', text: 'Go.' },
    { type: 'scene', text: 'INT. HUT - NIGHT' }, { type: 'action', text: 'Meena lights the lamp.' },
    { type: 'character', text: 'MEENA' }, { type: 'dialogue', text: 'Wait.' }
  ]);
  const res = await run();
  const ch = step(res, 'characters');
  ok(!/already in the Story Bible/.test(ch.detail) && /none of the new ones speaks in more than one scene/.test(ch.detail),
    'characters: an empty Bible is not claimed to hold them — got ' + JSON.stringify(ch.detail));
  const pr = step(res, 'props');
  ok(!/\b1 (vehicles|props|animals|stunts)\b/.test(pr.detail || ''), 'props: one of a kind is singular — got ' + JSON.stringify(pr.detail));
}


/* ---- 9. the lock's seven (lock: true) -------------------------------- */
const LOCKED = [
  E('scene', 'EXT. COLLEGE GATE - DAY'),
  E('action', 'Forty STUDENTS (40) crowd the bus stop. A TRUCK idles by the gate. Ravi waits.'),
  E('character', 'RAVI'), E('dialogue', 'Late again.'), E('character', 'MEENA'), E('dialogue', 'Always.'),
  E('scene', 'INT. CHAI SHOP - NIGHT'),
  E('action', 'A crowd of fifty cheers. Ravi lifts a glass. They crowd the door.'),
  E('character', 'RAVI'), E('dialogue', 'One tea.'), E('character', 'MEENA'), E('dialogue', 'Two.')
];
const LOCK_CALC = { ci_1_item: 'DOP', ci_1_rate: '20000' };
const contactsOf = () => JSON.parse(mem.get('fms_contacts_v1') || '{}');
seed(LOCKED, { [CALC_KEY]: LOCK_CALC });
{
  const plain = P.planPipeline();
  eq(plain.some((s) => s.lockOnly || ['synopsis', 'extras', 'tags'].includes(s.id)), false, 'lock: a plan without lock shows no lock-only row');
  const pre = P.planPipeline({ lock: true });
  eq(pre.map((s) => s.id), P.STEPS.map((s) => s.id), 'lock: plan lists all fifteen steps in order');
  ok(/once the scenes exist/.test(pre.find((s) => s.id === 'synopsis').note), 'lock: pre-run rows say they are made once the scenes exist');
  ok(pre.find((s) => s.id === 'tags').byCategory && typeof pre.find((s) => s.id === 'tags').byCategory === 'object', 'lock: tags row carries byCategory');

  const before = snapshot();
  const first = await run({ lock: true });
  ok(first.steps.length === P.STEPS.length, 'lock: every step ran');
  for (const id of ['synopsis', 'extras', 'tags', 'castcontacts', 'recce', 'sheets', 'budgetlines']) eq(step(first, id).count, step(first, id).wrote, 'lock: ' + id + ' count === wrote');
  const rows = Scenes.listScenes();
  eq(rows[0].synopsis, 'Forty STUDENTS (40) crowd the bus stop.', 'lock: synopsis is the first sentence of the first action line');
  ok((rows[0].elements.extras || []).includes('Students (40)'), 'lock: STUDENTS (40) tagged as Students (40) — ' + JSON.stringify(rows[0].elements.extras));
  eq((rows[0].elements.extras || []).length, 1, 'lock: a counted line yields no bare noun beside it');
  ok((rows[1].elements.extras || []).includes('Crowd (50)'), 'lock: a crowd of fifty is Crowd (50) — ' + JSON.stringify(rows[1].elements.extras));
  ok((rows[0].elements.vehicles || []).length > 0, 'lock: the truck is tagged as a vehicle');
  ok(first.summary.synopses === 2 && first.summary.tagged > 0, 'lock: summary counts what this run wrote');
  ok(/^.*scene/.test(first.summary.text), 'lock: summary text — ' + first.summary.text);
  ok(/tagged at the lock/.test(step(first, 'props').detail), 'lock: props says how many were tagged at the lock — ' + step(first, 'props').detail);
  ok(contactsOf().contacts.some((c) => c.name === 'To be cast'), 'lock: a To be cast contact was made');
  ok((contactsOf().callSheets || []).length >= 1, 'lock: a draft call sheet was made');
  const budgetRows = Object.keys(JSON.parse(mem.get(CALC_KEY))).filter((k) => /_custom$/.test(k));
  ok(budgetRows.length >= 1, 'lock: budget lines added');
  ok(!Object.keys(JSON.parse(mem.get(CALC_KEY))).some((k) => /^ci_(?!1_)\d+_rate$/.test(k)), 'lock: no rate is written on a new line');
  eq(JSON.parse(mem.get(CALC_KEY)).ci_1_rate, '20000', 'lock: a typed budget row is untouched');

  const mid = snapshot();
  const again = await run({ lock: true });
  eq(again.wrote, 0, 'lock: second run wrote 0');
  ok(snapshot() === mid, 'lock: second run left storage byte-identical');
  for (const id of ['synopsis', 'extras', 'tags', 'castcontacts', 'recce', 'sheets', 'budgetlines']) ok(step(again, id).status !== 'done', 'lock: second run, ' + id + ' not done');
  eq(again.summary.contacts + again.summary.sheets + again.summary.budgetLines + again.summary.synopses, 0, 'lock: second-run summary fields are 0');

  first.undo();
  ok(snapshot() === before, 'lock: undo restores storage byte for byte');
}
/* typed work survives a run, and a surgical undo keeps a later edit */
seed(LOCKED, { [CALC_KEY]: { ...LOCK_CALC, ci_2_custom: 'Unit shoot days', ci_2_days: '9' } });
{
  await run({ only: ['scenes'] });
  const [a] = Scenes.listScenes();
  Scenes.updateScene(a.id, { synopsis: 'My own line.' });
  Scenes.tagElement(a.id, 'extras', 'Students');
  mem.set('fms_contacts_v1', JSON.stringify({ contacts: [{ id: 'c_mine', name: 'Priya', role: 'Meena', department: 'Cast', phone: '', email: '', notes: '' }], callSheets: [] }));
  const res = await run({ lock: true });
  const rows = Scenes.listScenes();
  eq(rows[0].synopsis, 'My own line.', 'lock: a typed synopsis survives');
  eq((rows[0].elements.extras || []), ['Students'], 'lock: a typed extras item stops a second Students (40)');
  ok(contactsOf().contacts.some((c) => c.id === 'c_mine' && c.name === 'Priya'), 'lock: a typed contact survives');
  ok(!contactsOf().contacts.some((c) => c.role === 'Meena' && c.id !== 'c_mine'), 'lock: a speaker a contact claims gets no second contact');
  eq(Object.keys(JSON.parse(mem.get(CALC_KEY))).filter((k) => /_custom$/.test(k) && JSON.parse(mem.get(CALC_KEY))[k] === 'Unit shoot days').length, 1, 'lock: a typed budget row blocks its line');
  eq(JSON.parse(mem.get(CALC_KEY)).ci_2_days, '9', 'lock: …and keeps its own days');
  Scenes.updateScene(rows[1].id, { synopsis: rows[1].synopsis + ' (edited)' });
  res.undo();
  const after = Scenes.listScenes();
  eq(after[0].synopsis, 'My own line.', 'lock: surgical undo keeps a typed synopsis');
  ok(/\(edited\)$/.test(after[1].synopsis), 'lock: surgical undo keeps a synopsis edited after the run');
  ok(contactsOf().contacts.some((c) => c.id === 'c_mine'), 'lock: surgical undo keeps the typed contact');
}

console.log(`\ntest:pipeline — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
