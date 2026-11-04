#!/usr/bin/env node
/* ============================================================
   test:rules-post — the no-AI twins of the on-set and post reads
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md, lane B. In Node, no browser, no network,
   no key: src/lib/rules-post.js (pure), rules-notes.js (keepRuleNotes)
   and the five `local: true` Desk tasks in local-tasks-post.js, run for
   real over an in-memory localStorage.

   Proves: each pure function on fixtures (two drafts with add / cut /
   move / heading change, a day with every shot state, edit rows with and
   without facts, a report with three fired rules, a script with a slack
   run); only the listed scenes are named; edit notes are blank-only and
   re-read at apply; keepRuleNotes round-trips exactly (same-skip, a
   later edit survives Undo); nothing written carries ai / aiFill or
   from: 'ai'; a re-run is the same list and a second Accept writes
   nothing; and the lane imports no ai*.js.
   ============================================================ */
import { register } from 'node:module';
import fs from 'node:fs';

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
        'export const onWriteElsewhere = () => () => {};' +
        'export const flushStorage = () => {};' +
        'export default new Proxy({}, { get: () => () => {} });'), shortCircuit: true };
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

const R = await import('../src/lib/rules-post.js');
const { keepRuleNotes } = await import('../src/lib/rules-notes.js');
const { LOCAL_TASKS } = await import('../src/lib/local-tasks.js');
const { RULES_TASKS_POST, RULES_POST_IDS } = await import('../src/lib/local-tasks-post.js');
const Scenes = await import('../src/lib/scenes.js');
const Story = await import('../src/lib/story.js');
const Edit = await import('../src/lib/editlog.js');
const { diffElements, groupByScene } = await import('../src/lib/script-diff.js');
const Cbfc = await import('../src/lib/cbfc.js');
const SA = await import('../src/lib/script-analysis-model.js');
const PM = await import('../src/lib/ai-post-model.js');   // the AI twin's own constants: the numbers must agree

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const section = (s) => console.log(s);
/* An emptied array is the same as an absent key: the vault writes '[]' back. */
const snap = () => JSON.stringify([...mem.entries()].filter(([, v]) => v !== '[]').sort());
const task = (id) => LOCAL_TASKS.find((t) => t.id === id);

/* ---- registration -------------------------------------------------- */
section('registration');
eq(RULES_POST_IDS, ['draft-changes-rules', 'day-wrap-summary-rules', 'edit-notes-rules', 'cert-read-rules', 'tension-notes-rules'], 'the five ids are permanent');
ok(RULES_TASKS_POST.every((t) => LOCAL_TASKS.includes(t)), 'local-tasks.js spreads every one');
ok(RULES_TASKS_POST.every((t) => t.local === true && t.kind === 'list' && t.editable === false), 'each is a local list task');
ok(RULES_TASKS_POST.every((t) => typeof t.input() === 'string' && t.input().length > 40), 'input() is synchronous and a fixed sentence');
ok(R.NOTE_MAX === PM.NOTE_MAX && R.HINT_LINE === PM.HINT_LINE, 'NOTE_MAX and HINT_LINE equal the AI twin\'s');
ok(R.sceneNumbersIn('Sc. 4A, scenes 3, 5 and 7').join() === PM.sceneNumbersIn('Sc. 4A, scenes 3, 5 and 7').join(), 'sceneNumbersIn reads like the AI twin\'s');

/* ---- B1 summariseChanges ------------------------------------------ */
section('draft-changes-rules');
const el = (id, type, text) => ({ id, type, text });
const A = [
  el('s1', 'scene', 'INT. HOUSE - NIGHT'), el('a2', 'action', 'Mara counts coins.'), el('c3', 'character', 'MARA'),
  el('d4', 'dialogue', 'We are short.'), el('c5', 'character', 'JOE'), el('d6', 'dialogue', 'Not again.'),
  el('s7', 'scene', 'EXT. BEACH - DAY'), el('a8', 'action', 'Waves.'),
  el('s9', 'scene', 'INT. SHOP - DAY'), el('a10', 'action', 'A shopkeeper yawns.'), el('c11', 'character', 'SHOPKEEPER'), el('d12', 'dialogue', 'Closed.'),
  el('s13', 'scene', 'EXT. ROAD - DAY'), el('a14', 'action', 'A bus passes.')
];
const B = [
  el('s1', 'scene', 'INT. HOUSE - NIGHT'), el('a2', 'action', 'Mara counts coins.'),
  el('a15', 'action', 'A coin drops.'), el('a16', 'action', 'Joe looks away.'), el('c3', 'character', 'MARA'),
  el('d4', 'dialogue', 'We are very short.'), el('c5', 'character', 'JOE'), el('d6', 'dialogue', 'Not again.'),
  el('s13', 'scene', 'EXT. ROAD - DAY'), el('a14', 'action', 'A bus passes.'),
  el('s7', 'scene', 'EXT. BEACH - NIGHT'), el('a8', 'action', 'Waves.'),
  el('s20', 'scene', 'INT. CAR - DAY'), el('a21', 'action', 'Dev drives.'), el('c22', 'character', 'DEV'), el('d23', 'dialogue', 'Left here.')
];
const diff = diffElements(A, B);
const summ = () => R.summariseChanges({ groups: groupByScene(diff), stats: diff.stats, before: A, after: B, olderLabel: 'Draft 1', newerLabel: 'Draft 2' });
const sm = summ();
const by = (id) => sm.items.find((i) => i.id === id);
const texts = sm.items.map((i) => i.keep).join('\n');
console.log(sm.items.map((i) => '    ' + i.id + ' | ' + i.keep).join('\n'));
ok(sm.items[0].id === 'sum' && /lines? added/.test(sm.items[0].keep), 'the first item is the overall count');
ok(/Scene 1 \(INT\. HOUSE - NIGHT\): 2 lines added, 1 changed; dialogue changed for MARA\./.test(texts), 'a scene: counts and the speaker whose dialogue changed');
ok(/Older draft scene 3 \(INT\. SHOP - DAY\): scene cut, 3 lines with it\./.test(texts), 'a whole scene cut is said as one');
ok(/INT\. CAR - DAY\): new scene, 3 lines\./.test(texts), 'a whole scene added is said as one');
ok(/heading changed \(time DAY to NIGHT\)/.test(texts), 'a heading change names the field and both values');
ok(/moved from scene \d to scene \d/.test(texts), 'a scene that moved says from and to');
ok(/New speaking characters: DEV; no longer speaking: SHOPKEEPER\./.test(texts), 'new and lost speakers');
ok(/length about [\d.]+ pages to about [\d.]+/.test(by('sum').keep), 'the page delta is in the overall line');
ok(sm.items.every((i) => !i.sceneId), 'no item names a scene row: a draft\'s places are not the script\'s numbers');
ok(sm.items.every((i) => i.where === 'Draft 1 → Draft 2'), 'every item is headed with the two drafts');
ok(!/consider|should|improve|works|better|weak/i.test(texts), 'counts and names only: no opinion words');
eq(summ(), sm, 're-run: the same list');
const sameDiff = diffElements(A, A);
eq(R.summariseChanges({ groups: groupByScene(sameDiff), stats: sameDiff.stats, before: A, after: A }).items, [], 'two equal drafts: no items');

/* ---- B2 wrapNote --------------------------------------------------- */
section('day-wrap-summary-rules');
const day = { day: 4, scenes: [
  { id: 'w1', number: '12', slug: 'INT. KITCHEN — DAY', shotState: 'shot', takes: 9, circled: 3, floorNote: 'Light held until 4' },
  { id: 'w2', number: '13', slug: 'EXT. YARD — DAY', shotState: 'part', takes: 4, circled: 1, floorNote: '' },
  { id: 'w3', number: '14A', slug: 'INT. HALL — NIGHT', shotState: 'dropped', takes: 0, circled: 0, floorNote: 'Dropped: see Scene 99 for the reason' },
  { id: 'w4', number: '15', slug: 'INT. ROOF — DAY', shotState: '', takes: 10, circled: 5, floorNote: '' }
] };
const next = { day: 5, scenes: [{ id: 'n1', number: '16', slug: 'EXT. LAKE — DAY' }, { id: 'n2', number: '17', slug: 'EXT. LAKE — DUSK' }] };
const wn = R.wrapNote(day, { nextDay: next });
const wby = (id) => wn.items.find((i) => i.id === id);
eq(wby('sum').keep, 'Day 4: 4 planned, 1 shot, 1 part, 1 dropped, 1 not marked; 23 takes, 9 circled.', 'the summary line from the marks');
eq(wn.items.filter((i) => i.id[0] === 'o').map((i) => i.sceneId), ['w2', 'w3', 'w4'], 'owed: part, dropped and not marked, each with its row');
ok(wby('o' + 'w2').keep === 'Scene 13 (EXT. YARD — DAY): part shot, pick-ups owed.', 'a part-shot scene is owed pick-ups');
ok(wby('fw1').keep === 'Floor note, Scene 12: “Light held until 4”' && wby('fw1').sceneId === 'w1', 'a floor note is carried verbatim, on its scene');
ok(/Day 5: Scene 16 \(EXT\. LAKE — DAY\); Scene 17/.test(wby('tom').keep) && /carried from Day 4 \(part shot\): Scene 13/.test(wby('tom').keep), 'tomorrow: the next day\'s scenes in order, plus the carried part-shot scene');
const known = new Set(['12', '13', '14A', '15', '16', '17']);
const generated = wn.items.filter((i) => !i.floor);
ok(generated.every((i) => R.sceneNumbersIn(i.keep).every((n) => known.has(n))), 'only scenes on the day or the next day are named (a floor note is the writer\'s own words)');
ok(wby('f' + 'w3').keep.includes('Scene 99'), 'a floor note is never edited, even when it names another scene');
eq(R.wrapNote(day, { nextDay: next }), wn, 're-run: the same list');
eq(R.wrapNote({ day: 6, scenes: [{ id: 'z', number: '1', slug: 'A', shotState: 'shot', takes: 0, circled: 0, floorNote: '' }] }).items.map((i) => i.id), ['sum'], 'a fully shot last day: only the summary');

/* ---- B3 editNotes -------------------------------------------------- */
section('edit-notes-rules');
const long = 'x'.repeat(400);
const rows = [
  { id: 'e1', number: '1', slug: 'INT. A', state: 'shot', takes: 3, circled: 1, pickups: [], floorNote: '', cutId: 'in', cut: 'In the cut', seconds: 80, note: '' },
  { id: 'e2', number: '2', slug: 'INT. B', state: 'part', takes: 0, circled: 0, pickups: ['insert of keys', 'wide'], floorNote: 'rain', cutId: '', cut: '', seconds: 0, note: '' },
  { id: 'e3', number: '3', slug: 'INT. C', state: 'shot', takes: 5, circled: 2, pickups: [], floorNote: '', cutId: '', cut: '', seconds: 0, note: 'typed by the editor' },
  { id: 'e4', number: '4', slug: 'INT. D', state: '', takes: 0, circled: 0, pickups: [], floorNote: '', cutId: 'in', cut: 'In the cut', seconds: 50, note: '' },
  { id: 'e5', number: '5', slug: 'INT. E', state: 'dropped', takes: 0, circled: 0, pickups: [], floorNote: long, cutId: '', cut: '', seconds: 0, note: '  ' },
  { id: 'e6', number: '6', slug: 'INT. F', state: 'shot', takes: 12, circled: 4, pickups: ['p'.repeat(60), 'q'.repeat(60), 'r'.repeat(60), 's'], floorNote: long, cutId: 'in', cut: 'In the cut', seconds: 90, note: '' }
];
const en = R.editNotes(rows, { cutRun: { seconds: 130, scenes: 2 }, targetMin: 90 });
eq(en.items.map((i) => i.sceneId), ['e1', 'e2', 'e5', 'e6'], 'only blank-noted scenes WITH a fact: e3 has a note, e4 has no fact');
eq(en.items[0].note, 'The set marked it shot. 3 takes logged, 1 circled. Cut status: In the cut. About 1:20 on screen by the page count.', 'a note is the facts, in a fixed order');
eq(en.items[1].note, 'The set got part of it. Pick-ups owed: insert of keys; wide. Floor note: “rain”', 'part shot: the pick-ups and the floor note word for word');
ok(en.items.every((i) => i.note.length <= R.NOTE_MAX && i.id === 's' + i.sceneId), 'every note is within 280 and ids are s<sceneId>');
ok(en.items[2].note.length <= R.NOTE_MAX && /^The set dropped it\. Floor note: “x+”$/.test(en.items[2].note), 'a floor note is quoted whole while it fits (held to 240)');
ok(en.items[3].note.length <= R.NOTE_MAX && /Pick-ups owed: p+; q+; r+; and 1 more\./.test(en.items[3].note) && !/Floor note/.test(en.items[3].note), 'a crowded note stays within 280: the pick-ups stay, a floor note that no longer fits is left out whole');
ok(/In the cut: 2 scenes, about 2:10 by the script’s estimate \(target 90 min\)\./.test(en.note), 'the film\'s cut run time is in the list note');
ok(!/footage|looks|performance|beautiful/i.test(en.items.map((i) => i.note).join(' ')), 'no note describes footage');
ok(R.canFill('') && R.canFill('  ') && !R.canFill('typed') && R.canUndo('a', 'a') && !R.canUndo('b', 'a'), 'canFill / canUndo');
eq(R.editNotes(rows, { cutRun: { seconds: 130, scenes: 2 }, targetMin: 90 }), en, 're-run: the same list');

/* ---- B4 certRead --------------------------------------------------- */
section('cert-read-rules');
const certEls = [
  el('h1', 'scene', 'INT. BAR - NIGHT'), el('h2', 'action', 'He lights a cigarette and pours a whisky.'),
  el('h3', 'scene', 'EXT. FIELD - DAY'), el('h4', 'action', 'A trained elephant walks past. A child of 8 years old waves.'),
  el('h5', 'scene', 'INT. ROOM - DAY'), el('h6', 'action', 'He takes a drag of a cigarette, then smokes again.')
];
const report = Cbfc.certificationReport([], certEls);
const fired = report.byRule.map((b) => b.rule.id);
console.log('    fired:', fired.join(','), '| hint', report.hint.rating);
ok(report.byRule.length >= 3, 'the fixture fires at least three rules');
const cr = R.certRead(report, { disclaimer: Cbfc.DISCLAIMER });
ok(cr.items[0].id === 'hint' && cr.items[0].keep.startsWith('Hint: ' + report.hint.rating + ' — ') && cr.items[0].keep.endsWith(R.HINT_LINE), 'the hint leads, with HINT_LINE');
ok(cr.items[0].detail.includes(Cbfc.DISCLAIMER) && cr.note.includes(Cbfc.DISCLAIMER) && cr.note.includes(R.HINT_LINE), 'DISCLAIMER and HINT_LINE are on the read');
for (const b of report.byRule) {
  const it = cr.items.find((i) => i.id === 'r' + b.rule.id);
  ok(it && it.detail.includes(b.rule.what) && it.detail.includes('Source: ' + b.rule.source) && it.detail.includes('checked ' + b.rule.checked), b.rule.id + ': its own text, source and checked date');
  ok(it && /\(Sc [\d, ]+\)/.test(it.text), b.rule.id + ': its scene numbers');
  const q = cr.items.find((i) => i.id === 'q' + b.rule.id);
  ok(q && b.rule.do.every((d) => q.detail.includes('In place? ' + d)), b.rule.id + ': every do-item is a question, word for word');
}
ok(/Sc 1/.test(cr.items.find((i) => i.id === 'rtobacco').text), 'tobacco: scene 1 is named');
ok(cr.items.every((i) => !i.sceneId), 'certification points are sticky notes, never put on a scene');
const quiet = R.certRead(Cbfc.certificationReport([], [el('q1', 'scene', 'INT. A - DAY'), el('q2', 'action', 'Quiet.')]), {});
eq(quiet.fired, 0, 'a script nothing fired on: zero rules');
eq(R.certRead(report, { disclaimer: Cbfc.DISCLAIMER }), cr, 're-run: the same list');

/* ---- B5 tensionNotes ----------------------------------------------- */
section('tension-notes-rules');
const rowsT = Array.from({ length: 20 }, (_, i) => ({ i, number: String(i + 1), sceneId: i === 5 ? 'sc6' : '', cast: i < 4 || i >= 15 ? ['MARA', 'JOE'] : ['JOE'] }));
const aT = {
  scenes: rowsT,
  tension: { flags: [
    { kind: 'slack', level: 'warn', from: 5, to: 10, text: 'Scenes 6 to 11 (Act 2A) read as low tension for 6 scenes in a row.' },
    { kind: 'peak', level: 'info', from: 2, to: 2, text: 'The highest-tension scene (3) is in the first half, at 15% of the script. Most structures build to a peak near the end.' },
    { kind: 'flat', level: 'info', text: 'Tension varies little from scene to scene (spread 0.5 on a 1–10 scale): the read sees one register throughout.' }] },
  pacing: { flags: [{ kind: 'long-run', level: 'info', from: 12, to: 14, text: '3 long scenes in a row (13 to 15), each over 2 pages.' }] },
  cast: { characters: [{ name: 'MARA', scenes: 9, share: 0.45 }, { name: 'JOE', scenes: 20, share: 1 }, { name: 'MINOR', scenes: 1, share: 0.05 }] }
};
const tn = R.tensionNotes(aT);
console.log(tn.items.map((i) => '    ' + i.id + ' | ' + i.keep + (i.sceneId ? ' [' + i.sceneId + ']' : '')).join('\n'));
ok(tn.items.every((i) => i.keep.startsWith('Measured: ')), 'every note is worded "Measured: …"');
eq(tn.items.filter((i) => i.sceneId).map((i) => i.sceneId), ['sc6'], 'a flag on a linked scene carries its row; the rest are sticky');
ok(tn.items.some((i) => i.id === 'l0' && /MARA \(in 9 of 20 scenes\) does not appear for 11 scenes in a row, Sc 5 to 15\./.test(i.keep)), 'a lead absent over a long run is a note');
ok(!tn.items.some((i) => /MINOR|JOE/.test(i.keep) && i.id[0] === 'l'), 'a minor part and a lead who is never absent make no note');
eq(R.tensionNotes({ scenes: rowsT, tension: { flags: [] }, pacing: { flags: [] }, cast: { characters: [] } }).items, [], 'nothing measured: no items');
eq(R.tensionNotes(aT), tn, 're-run: the same list');
/* a real analysis over a script with a calm middle, through the real model */
{
  const heavy = 'He screams and smashes the door. She slaps him, blood and a gun, a threat, a fight!';
  const calm = 'She waters the plants. Quiet morning. Tea.';
  const real = [];
  for (let i = 0; i < 24; i++) {
    real.push(el('rs' + i, 'scene', 'INT. PLACE ' + i + ' - DAY'));
    real.push(el('ra' + i, 'action', i < 6 || i >= 18 ? heavy : calm));
    if (i < 6 || i >= 18) { real.push(el('rc' + i, 'character', 'MARA')); real.push(el('rd' + i, 'dialogue', 'No!')); }
  }
  const a = SA.analyseScript({ elements: real, scenes: [], format: 'feature' });
  const rt = R.tensionNotes(a);
  console.log('    real script flags:', [...(a.tension.flags || []), ...(a.pacing.flags || [])].map((f) => f.kind).join(',') || '(none)', '| items', rt.items.length);
  ok(rt.items.length > 0 && rt.items.every((i) => i.keep.startsWith('Measured: ')), 'a real analysed script with a calm run gives measured notes');
  ok(rt.items.some((i) => i.id[0] === 'l' && /MARA/.test(i.keep)), 'the real lead absent over the calm middle is found');
  eq(R.tensionNotes(SA.analyseScript({ elements: real, scenes: [], format: 'feature' })), rt, 'real: re-run gives the same list');
}

/* ---- keepRuleNotes -------------------------------------------------- */
section('keepRuleNotes');
const seedScenes = () => Scenes.saveScenes([
  Scenes.blankScene({ id: 'r1', number: '1', intExt: 'INT', location: 'HOUSE', dayNight: 'DAY', readerNote: 'Typed by me.' }),
  Scenes.blankScene({ id: 'r2', number: '2', intExt: 'EXT', location: 'BEACH', dayNight: 'DAY' })
]);
seedScenes();
const s0 = snap();
const items = [
  { id: 'a', sceneId: 'r1', keep: 'Measured: one.' },
  { id: 'b', sceneId: 'r2', keep: 'Measured: two.' },
  { id: 'c', where: 'Cast', keep: 'Measured: sticky.' },
  { id: 'd', sceneId: 'gone', where: 'Day 4 — owed', keep: 'Measured: its scene was deleted.' }
];
const said = [];
let afters = 0;
const undo = keepRuleNotes(items, { label: 'Test', after: () => { afters++; }, say: (m) => said.push(m) });
ok(typeof undo === 'function', 'a write returns an Undo');
eq(Scenes.listScenes().find((s) => s.id === 'r1').readerNote, 'Typed by me.\nRules (Test): Measured: one.', 'appended to a typed note, marked Rules (Test)');
eq(Scenes.listScenes().find((s) => s.id === 'r2').readerNote, 'Rules (Test): Measured: two.', 'a blank note gets the line');
const vault = Story.listVault();
eq(vault.length, 2, 'two sticky notes: the plain one and the one whose scene was deleted');
ok(vault.every((n) => n.from === 'rules' && !('ai' in n) && !('aiFill' in n)), 'sticky notes are from "rules" and carry no ai stamp');
ok(vault.some((n) => n.snippet === 'Rules (Test): Cast — Measured: sticky.') && vault.some((n) => n.snippet === 'Rules (Test): Day 4 — owed — Measured: its scene was deleted.'), 'a sticky note is headed with its where');
ok(/Test: saved 2 notes on the scene list \(Sc 1, Sc 2\) and 2 sticky notes on the notes board\./.test(undo.said), 'the toast says what was written — ' + undo.said);
ok(afters === 1, 'after() ran once');
const s1 = snap();
ok(!/"ai"|aiFill|"from":"ai"/.test(s1), 'nothing in storage carries ai, aiFill or from: ai');
/* a later edit survives Undo */
Scenes.saveScenes(Scenes.listScenes().map((s) => (s.id === 'r1' ? { ...s, readerNote: s.readerNote + '\nAdded later by hand.' } : s)));
/* the same list again writes nothing */
const said2 = [];
eq(keepRuleNotes(items, { label: 'Test', say: (m) => said2.push(m) }), null, 'a second Accept of the same list returns null');
ok(/already/.test(said2[0] || ''), 'and says why — ' + said2[0]);
/* a sticky note the writer edited after Accept survives Undo */
{
  const v = Story.listVault();
  const mine = v.find((n) => /sticky/.test(n.snippet));
  const edited = v.map((n) => (n.id === mine.id ? { ...n, snippet: n.snippet + ' (my edit)' } : n));
  mem.set([...mem.keys()].find((k) => /idea_vault/.test(k)), JSON.stringify(edited));
}
undo();
ok(Story.listVault().length === 1 && /my edit/.test(Story.listVault()[0].snippet), 'Undo keeps a sticky note edited since Accept');
{ const k = [...mem.keys()].find((x) => /idea_vault/.test(x)); mem.set(k, JSON.stringify(Story.listVault().filter((n) => !/my edit/.test(n.snippet)))); }
eq(Scenes.listScenes().find((s) => s.id === 'r1').readerNote, 'Typed by me.\nAdded later by hand.', 'Undo removes only its own line: a later edit is kept');
eq(Story.listVault().length, 0, 'Undo removes exactly the sticky notes it made (the edited one was kept and cleared by the test)');
eq(Scenes.listScenes().find((s) => s.id === 'r2').readerNote, '', 'and blanks the note it filled');
/* clean round trip, byte for byte */
seedScenes();
const sB = snap();
const u2 = keepRuleNotes(items, { label: 'Test' });
u2();
eq(snap(), sB, 'apply then Undo leaves storage byte-identical');
const said3 = [];
eq(keepRuleNotes([], { label: 'Test', say: (m) => said3.push(m) }), null, 'nothing ticked returns null');
ok(/Nothing is ticked/.test(said3[0] || ''), 'and says so');
void s0;

/* ---- the tasks, for real ------------------------------------------ */
section('the five tasks over storage');
mem.clear();
seedScenes();
mem.set('fms_script_v1', JSON.stringify({ elements: B }));

/* draft-changes-rules */
{
  const t = task('draft-changes-rules');
  const ctx = { olderId: 'a', newerId: 'b', compare: () => ({ older: A, newer: B, olderLabel: 'Draft 1', newerLabel: 'The script now' }) };
  const before = snap();
  const r1 = await t.run('', { ctx });
  eq(snap(), before, 'draft-changes: Run writes nothing');
  eq(await t.run('', { ctx }), r1, 'draft-changes: re-run is the same list');
  const err = await t.run('', { ctx: { olderId: 'a', newerId: 'a', compare: () => ({ older: A, newer: B }) } }).catch((e) => e);
  ok(err && err.kind === 'nocontent', 'draft-changes: the same draft twice fails as nocontent');
  const err2 = await t.run('', { ctx: { olderId: 'a', newerId: 'b', compare: () => ({ older: A, newer: A }) } }).catch((e) => e);
  ok(err2 && err2.kind === 'nocontent' && /same thing/.test(err2.message), 'draft-changes: equal drafts say so');
  const undo = t.apply(r1.items, ctx, r1);
  ok(Story.listVault().length === r1.items.length && Story.listVault().every((n) => n.from === 'rules' && /^Rules \(Draft changes\): Draft 1 → The script now — /.test(n.snippet)), 'draft-changes: Accept keeps every point as a sticky note headed with the two drafts');
  undo();
  eq(snap(), before, 'draft-changes: Undo restores storage exactly');
}

/* day-wrap-summary-rules */
{
  Scenes.saveScenes([
    Scenes.blankScene({ id: 'k1', number: '1', location: 'KITCHEN', shootDay: 1, shotState: 'shot', takes: [{ n: 1, circled: true, note: '', at: '' }, { n: 2, circled: false, note: '', at: '' }], floorNote: 'Fast light' }),
    Scenes.blankScene({ id: 'k2', number: '2', location: 'YARD', shootDay: 1, shotState: 'part' }),
    Scenes.blankScene({ id: 'k3', number: '3', location: 'LAKE', shootDay: 2 }),
    Scenes.blankScene({ id: 'k4', number: '4', location: 'ROOF', shootDay: 3 })
  ]);
  const t = task('day-wrap-summary-rules');
  const ctx = { day: 1 };
  const before = snap();
  const r1 = await t.run('', { ctx });
  eq(snap(), before, 'wrap: Run writes nothing');
  eq(r1.items.map((i) => i.id), ['sum', 'ok2', 'fk1', 'tom'], 'wrap: summary, the part-shot scene owed, the floor note, tomorrow');
  ok(/Day 2: Scene 3/.test(r1.items.find((i) => i.id === 'tom').keep) && !/Scene 4/.test(r1.items.map((i) => i.keep).join(' ')), 'wrap: tomorrow is Day 2 only; Day 3\'s scene is not named');
  eq(await t.run('', { ctx }), r1, 'wrap: re-run is the same list');
  const err = await t.run('', { ctx: { day: 9 } }).catch((e) => e);
  ok(err && err.kind === 'nocontent', 'wrap: an empty day fails as nocontent');
  const undo = t.apply(r1.items, ctx, r1);
  const sc = Scenes.listScenes();
  ok(/Rules \(Wrap note\): Floor note, Scene 1: “Fast light”/.test(sc.find((s) => s.id === 'k1').readerNote), 'wrap: a floor note goes on its own scene, marked Rules');
  ok(/Rules \(Wrap note\): Scene 2 .*part shot, pick-ups owed/.test(sc.find((s) => s.id === 'k2').readerNote), 'wrap: the owed scene gets its line');
  ok(Story.listVault().length === 2 && Story.listVault().every((n) => n.from === 'rules'), 'wrap: the summary and tomorrow are sticky notes');
  ok(!/"ai"|aiFill/.test(snap()), 'wrap: nothing is AI-stamped');
  eq(t.apply(r1.items, ctx, r1), null, 'wrap: a second Accept writes nothing');
  undo();
  eq(snap(), before, 'wrap: Undo restores storage exactly');
}

/* edit-notes-rules */
{
  Scenes.saveScenes([
    Scenes.blankScene({ id: 'x1', number: '1', location: 'A', shotState: 'shot', takes: [{ n: 1, circled: true, note: '', at: '' }] }),
    Scenes.blankScene({ id: 'x2', number: '2', location: 'B', shotState: 'part' }),
    Scenes.blankScene({ id: 'x3', number: '3', location: 'C' })
  ]);
  Edit.setSceneEdit('x2', { note: 'Typed by the editor' });
  const t = task('edit-notes-rules');
  const before = snap();
  const r1 = await t.run('', { ctx: { secondsOf: () => ({}) } });
  eq(snap(), before, 'edit: Run writes nothing');
  eq(r1.items.map((i) => i.sceneId), ['x1'], 'edit: x2 has a note and x3 has no fact');
  eq(await t.run('', { ctx: { secondsOf: () => ({}) } }), r1, 'edit: re-run is the same list');
  Edit.setSceneEdit('x1', { note: 'Typed between the list and Accept' });
  const said = [];
  eq(t.apply(r1.items, { say: (m) => said.push(m) }, r1), null, 'edit: a note typed since is not overwritten, nothing written returns null');
  ok(/skipped/.test(said[0] || ''), 'edit: and the toast says it was skipped — ' + said[0]);
  eq(Edit.sceneEdit('x1').note, 'Typed between the list and Accept', 'edit: the typed note is intact');
  Edit.setSceneEdit('x1', { note: '' });
  const mid = snap();
  const undo = t.apply(r1.items, { say: () => {} }, r1);
  eq(Edit.sceneEdit('x1').note, r1.items[0].note, 'edit: Accept fills the blank note');
  ok(!/"ai"|aiFill/.test(snap()), 'edit: no ai / aiFill on the edit log');
  eq(t.apply(r1.items, { say: () => {} }, r1), null, 'edit: a second Accept writes nothing (the note is no longer blank)');
  undo();
  eq(snap(), mid, 'edit: Undo blanks it, storage byte-identical');
  Edit.setSceneEdit('x1', { note: r1.items[0].note });
  const undo2 = t.apply([], {}, r1);
  void undo2;
  const u3 = t.apply(r1.items, {}, r1);
  eq(u3, null, 'edit: nothing blank, nothing written');
  Edit.setSceneEdit('x1', { note: '' });
  const u4 = t.apply(r1.items, {}, r1);
  Edit.setSceneEdit('x1', { note: r1.items[0].note + ' Edited since.' });
  u4();
  eq(Edit.sceneEdit('x1').note, r1.items[0].note + ' Edited since.', 'edit: Undo leaves a note edited since as written');
  Edit.setSceneEdit('x1', { note: 'x' });
  Edit.setSceneEdit('x3', { note: 'y' });
  const err = await t.run('', { ctx: {} }).catch((e) => e);
  ok(err && err.kind === 'nocontent', 'edit: nothing blank to fill fails as nocontent');
}

/* cert-read-rules */
{
  Scenes.saveScenes([]);
  mem.set('fms_script_v1', JSON.stringify({ elements: certEls }));
  const t = task('cert-read-rules');
  const before = snap();
  const r1 = await t.run('', {});
  eq(snap(), before, 'cert: Run writes nothing');
  ok(r1.items[0].id === 'hint' && /tobacco/i.test(r1.items.map((i) => i.text).join(' ')), 'cert: the read of the real script');
  const undo = t.apply(r1.items, {}, r1);
  ok(Story.listVault().length === r1.items.length && Story.listVault().every((n) => n.from === 'rules' && /^Rules \(Certification read\): Certification — /.test(n.snippet)), 'cert: every point is a sticky note, from rules');
  eq(t.apply(r1.items, {}, r1), null, 'cert: a second Accept writes nothing');
  undo();
  eq(snap(), before, 'cert: Undo restores storage exactly');
  mem.set('fms_script_v1', JSON.stringify({ elements: [el('c1', 'scene', 'INT. A - DAY'), el('c2', 'action', 'Quiet.')] }));
  const err = await t.run('', {}).catch((e) => e);
  ok(err && err.kind === 'nocontent', 'cert: nothing flagged fails as nocontent');
}

/* tension-notes-rules */
{
  const heavy = 'He screams and smashes the door. She slaps him, blood and a gun, a threat, a fight!';
  const calm = 'She waters the plants. Quiet morning. Tea.';
  const real = [];
  for (let i = 0; i < 24; i++) {
    real.push(el('rs' + i, 'scene', 'INT. PLACE ' + i + ' - DAY'));
    real.push(el('ra' + i, 'action', i < 6 || i >= 18 ? heavy : calm));
    if (i < 6 || i >= 18) { real.push(el('rc' + i, 'character', 'MARA')); real.push(el('rd' + i, 'dialogue', 'No!')); }
  }
  mem.set('fms_script_v1', JSON.stringify({ elements: real }));
  Scenes.saveScenes([]);
  const t = task('tension-notes-rules');
  const before = snap();
  const ctx = { elements: () => real };
  const r1 = await t.run('', { ctx });
  eq(snap(), before, 'tension: Run writes nothing');
  eq(await t.run('', { ctx }), r1, 'tension: re-run is the same list');
  const undo = t.apply(r1.items, ctx, r1);
  ok(Story.listVault().length > 0 && Story.listVault().every((n) => n.from === 'rules' && /^Rules \(Measured tension\): /.test(n.snippet)), 'tension: unlinked scenes make sticky notes, from rules');
  eq(t.apply(r1.items, ctx, r1), null, 'tension: a second Accept writes nothing');
  undo();
  eq(snap(), before, 'tension: Undo restores storage exactly');
  const err = await t.run('', { ctx: { elements: () => [] } }).catch((e) => e);
  ok(err && err.kind === 'nocontent', 'tension: no scene headings fails as nocontent');
}

/* ---- the lane stays off the AI ------------------------------------ */
section('no ai import');
for (const f of ['src/lib/rules-post.js', 'src/lib/rules-notes.js', 'src/lib/local-tasks-post.js']) {
  const src = fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const imports = [...src.matchAll(/(?:from\s+|import\s*\(\s*)['"]([^'"]+)['"]/g)].map((m) => m[1]);
  const bad = imports.filter((i) => /(^|\/)ai[-.]/.test(i) || /\/ai\.js$/.test(i));
  ok(bad.length === 0, f + ' imports no ai*.js' + (bad.length ? ' — ' + bad.join(', ') : ''));
  ok(!/\baiUnlocked\b|stampAI|stampFill/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), f + ' never reads aiUnlocked or stamps');
}
ok(!/\bdocument\b/.test(fs.readFileSync(new URL('../src/lib/rules-post.js', import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')), 'rules-post.js touches no document');

console.log('\n' + (fail ? 'FAILED' : 'ok') + ' — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
