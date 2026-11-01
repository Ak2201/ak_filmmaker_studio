/* ============================================================
   TEST — the lock's extract (src/lib/lock-extract.js) and its seeds
   (src/lib/lock-seed.js), in Node, on scripts/fixtures/lock-extract.script.json.
   node scripts/test-lock-extract.mjs   (or: npm run test:lock-extract)

   Asserts docs/LOCK-EXTRACT.md §1–§2:
     · firstSentence trims at the first sentence and at 140 characters;
     · extras on the street: "Students (40)" and "Crowd (50)", never a bare
       "Crowd" from "They crowd the door"; a typed "Students" blocks its line;
     · synopses fill only blanks; a second plan is empty; undo keeps an edit;
     · cast contacts, recce cards, call sheets and budget lines: each seed
       writes once, a second seed writes nothing, a typed record blocks its
       line, and every undo removes only what is still unedited.
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const P = await import('../src/lib/lock-extract.js');
const S = await import('../src/lib/lock-seed.js');
const Scenes = await import('../src/lib/scenes.js');
const { SCRIPT_KEY } = await import('../src/lib/script.js');
const { CALC_KEY } = await import('../src/lib/costs.js');
const { LOCATIONS_KEY } = await import('../src/lib/locations.js');
const { CONTACTS_KEY, blankContact, listContacts, saveContacts, listCallSheets, saveCallSheets } = await import('../src/lib/contacts.js');
const { sliceScript } = await import('../src/lib/screenplay-analysis.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

const ELEMENTS = JSON.parse(readFileSync(new URL('./fixtures/lock-extract.script.json', import.meta.url), 'utf8')).elements;

/* Three scenes, each linked to its heading by id (the exact link). The street
   has a typed "Students" in its extras; the bus is shot on day 2. */
const SCENES = () => [
  Scenes.blankScene({ id: 'sc_kitchen', number: '1', scriptElId: 'e0', intExt: 'INT', dayNight: 'NIGHT', location: 'KITCHEN', shootDay: 1 }),
  Scenes.blankScene({ id: 'sc_street', number: '2', scriptElId: 'e4', intExt: 'EXT', dayNight: 'DAY', location: 'STREET', shootDay: 1, elements: { extras: ['Students'] } }),
  Scenes.blankScene({ id: 'sc_bus', number: '3', scriptElId: 'e8', intExt: 'INT', dayNight: 'DAY', location: 'BUS', shootDay: 2 })
];

/** A clean store: the script, the three scenes, and whatever the test adds. */
function fresh({ contacts, calc } = {}) {
  mem.clear();
  mem.set(SCRIPT_KEY, JSON.stringify({ elements: ELEMENTS }));
  Scenes.saveScenes(SCENES());
  if (contacts) saveContacts(contacts);
  if (calc) mem.set(CALC_KEY, JSON.stringify(calc));
}
const scenes = () => Scenes.listScenes();
const elements = ELEMENTS;
const byScene = (rows, id) => rows.filter((r) => r.sceneId === id);
const sliceOf = (id) => sliceScript(elements).find((s) => s.id === id);

/* ---- 1. firstSentence ------------------------------------------ */
eq(P.firstSentence('Maya, 20s, pours tea. A kettle whistles.'), 'Maya, 20s, pours tea.', 'firstSentence stops at the first sentence');
eq(P.firstSentence('  spaced   out\n text  '), 'spaced out text', 'firstSentence collapses whitespace');
eq(P.firstSentence(''), '', 'firstSentence of nothing is nothing');
{
  const long = ('word ').repeat(60).trim();
  const r = P.firstSentence(long, 140);
  ok(r.endsWith('…'), 'a long line ends on an ellipsis');
  ok(r.length <= 140 && r.length > 100, 'a long line is cut under 140 characters (' + r.length + ')');
  ok(!/\s…$/.test(r), 'the cut lands on a word boundary');
}

/* ---- 2. extractExtras, the street slice ------------------------ */
{
  const ex = P.extractExtras(sliceOf('e4'));
  const students = ex.find((x) => x.noun === 'students');
  const crowd = ex.find((x) => x.noun === 'crowd');
  ok(students && students.text === 'Students (40)' && students.count === 40, 'street: "STUDENTS (40)" reads Students (40), count 40 — got ' + JSON.stringify(students));
  ok(crowd && crowd.text === 'Crowd (50)' && crowd.count === 50, 'street: "A crowd of fifty" reads Crowd (50) — got ' + JSON.stringify(crowd));
  ok(!ex.some((x) => x.text === 'Crowd'), 'street: no bare Crowd from "They crowd the door"');
  eq(ex.length, 2, 'street: exactly the two crowd items');
}
eq(P.extractExtras({ elements: [{ type: 'action', text: 'They crowd the door.' }] }), [], 'a bare verb "crowd" yields nothing');
eq(P.extractExtras({ elements: [{ type: 'action', text: 'The crowd turns.' }] }).map((x) => x.text), ['Crowd'], 'an article before "crowd" makes it a noun');
eq(P.extractExtras(sliceOf('e0')), [], 'the kitchen has no extras');

/* ---- 3. planExtras and the tag counts -------------------------- */
{
  fresh();
  const plan = P.planExtras(scenes(), elements);
  eq(plan.map((p) => [p.sceneId, p.name]), [['sc_street', 'Crowd (50)']], 'planExtras: a typed "Students" blocks Students (40); Crowd (50) is planned');
  eq(P.planExtras(scenes(), elements), plan, 'planExtras is read-only (same answer twice)');
  const tags = P.planTags(scenes(), elements, ['extras', 'cast']);
  eq(tags, [], 'planTags never plans extras or cast');
  const vehicles = P.planTags(scenes(), elements, ['vehicles']).filter((t) => t.category === 'vehicles');
  ok(vehicles.some((t) => t.sceneId === 'sc_street' && /bus|bicycle/i.test(t.name)), 'planTags: the street bus or bicycle is a vehicle suggestion');
  ok(P.planTags(scenes(), elements).every((t) => t.category !== 'extras' && t.category !== 'cast'), 'planTags (all): no extras, no cast');
  const counts = P.tagCountsByCategory(scenes(), elements);
  eq(counts.extras, 1, 'tagCountsByCategory: one extras item to tick');
  ok((counts.vehicles || 0) >= 1, 'tagCountsByCategory: vehicles counted');
}

/* ---- 4. synopses ----------------------------------------------- */
{
  fresh();
  const rows = scenes();
  rows.find((s) => s.id === 'sc_bus').synopsis = 'Typed by me.';
  Scenes.saveScenes(rows);

  const plan = P.planSynopses(scenes(), elements);
  eq(plan.map((p) => p.sceneId + '|' + p.text), [
    'sc_kitchen|Maya, 20s, pours tea.',
    'sc_street|Forty STUDENTS (40) crowd the stop.'
  ], 'planSynopses: the blank scenes get their first sentence; the typed one is left out');

  const written = P.applySynopses(plan);
  eq(written.length, 2, 'applySynopses writes both blanks');
  eq(P.planSynopses(scenes(), elements), [], 'a second plan after the write is empty');
  eq(P.applySynopses(plan), [], 'a second apply writes nothing');

  const edit = scenes();
  edit.find((s) => s.id === 'sc_kitchen').synopsis = 'Mine now.';
  Scenes.saveScenes(edit);
  eq(P.undoSynopses(written), 1, 'undoSynopses removes only the unedited synopsis');
  const after = scenes();
  eq(after.find((s) => s.id === 'sc_kitchen').synopsis, 'Mine now.', 'undo keeps the person-edited synopsis');
  eq(after.find((s) => s.id === 'sc_street').synopsis, '', 'undo blanks the unedited one');
  eq(after.find((s) => s.id === 'sc_bus').synopsis, 'Typed by me.', 'undo never touches a typed synopsis');
}

/* ---- 5. cast contacts ------------------------------------------ */
{
  fresh();
  const r = S.seedCastContacts({ scenes: scenes(), elements });
  eq(r.made.length, 1, 'seedCastContacts: one contact for Maya');
  eq(r.made[0] && r.made[0].role, 'Maya', 'the contact carries the role Maya');
  eq(r.made[0] && r.made[0].name, 'To be cast', 'the contact is named To be cast');
  eq(listContacts().length, 1, 'the contact is stored');
  eq(S.seedCastContacts({ scenes: scenes(), elements }).made, [], 'a second seed makes no contact');
  eq(listContacts().length, 1, 'still one contact after the second seed');

  const c = listContacts()[0];
  saveContacts([{ ...c, phone: '555-0100' }]);
  eq(S.undoCastContacts(r.made), 0, 'undoCastContacts keeps a contact a person has edited');
  eq(listContacts().length, 1, 'the edited contact is still there');

  fresh();
  const again = S.seedCastContacts({ scenes: scenes(), elements });
  eq(S.undoCastContacts(again.made), 1, 'undoCastContacts removes an unedited contact');
  eq(listContacts().length, 0, 'no contacts after the undo');
}
{
  fresh({ contacts: [blankContact({ name: 'Priya Rao', role: 'MAYA', department: 'Cast' })] });
  eq(S.seedCastContacts({ scenes: scenes(), elements }).made, [], 'an existing contact whose role is MAYA blocks the seed');
  eq(listContacts().length, 1, 'the existing contact is untouched');
  eq(S.planCastContacts({ scenes: scenes(), elements }), 0, 'planCastContacts agrees: nothing to add');
}

/* ---- 6. recce cards -------------------------------------------- */
{
  fresh();
  const r = S.seedRecce(scenes());
  eq(r.made.length, 3, 'seedRecce: one card per location');
  const stored = JSON.parse(mem.get(LOCATIONS_KEY) || '{}');
  const keys = Object.keys(stored.recces || {});
  eq(keys.length, 3, 'three recce keys stored');
  ok(keys.every((k) => k === k.toLowerCase()), 'recce keys are lower case: ' + keys.join(', '));
  eq(stored.recces[r.made.find((m) => m.name === 'KITCHEN').key].bestTime, 'Night', 'the kitchen card says Night');
  eq(S.planRecce(scenes()), 0, 'planRecce: nothing left after the seed');
  eq(S.seedRecce(scenes()).made, [], 'a second seed makes no card');

  const edit = JSON.parse(mem.get(LOCATIONS_KEY));
  edit.recces[r.made.find((m) => m.name === 'STREET').key].notes = 'Shade by noon';
  mem.set(LOCATIONS_KEY, JSON.stringify(edit));
  eq(S.undoRecce(r.made), 2, 'undoRecce removes the two unedited cards only');
  const left = JSON.parse(mem.get(LOCATIONS_KEY)).recces;
  eq(Object.keys(left), [r.made.find((m) => m.name === 'STREET').key], 'the edited street card remains');
}

/* ---- 7. call sheets -------------------------------------------- */
{
  fresh();
  const r = S.seedCallSheets(scenes());
  eq(r.made.length, 2, 'seedCallSheets: one sheet per shoot day');
  eq(r.made.map((m) => m.day), [1, 2], 'the sheets are for days 1 and 2');
  eq(r.made[0].sheet.title, 'Shoot day 1', 'the day 1 sheet is titled');
  eq(r.made[0].sheet.sceneIds, ['sc_kitchen', 'sc_street'], 'day 1 carries its two scenes');
  eq(r.made[1].sheet.sceneIds, ['sc_bus'], 'day 2 carries the bus');
  eq(S.seedCallSheets(scenes()).made, [], 'a second seed makes no sheet');
  eq(S.planCallSheets(scenes()), 0, 'planCallSheets: nothing left');

  const sheets = listCallSheets();
  const second = sheets.find((s) => s.id === r.made[1].id);
  saveCallSheets(sheets.map((s) => (s.id === second.id ? { ...s, notes: 'Moved to 7am' } : s)));
  eq(S.undoCallSheets(r.made), 1, 'undoCallSheets removes the unedited day 1 sheet only');
  eq(listCallSheets().map((s) => s.id), [second.id], 'the edited day 2 sheet remains');
}

/* ---- 8. budget lines ------------------------------------------- */
const TYPED = { ci_1_item: 'DOP', ci_1_rate: '20000', ci_2_custom: 'Production van', ci_2_rate: '4500', ci_2_days: '3' };
{
  fresh({ calc: TYPED });
  const r = S.seedBudgetLines({ scenes: scenes(), elements });
  ok(r.made.length >= 2, 'seedBudgetLines: lines are added (' + r.made.length + ')');
  ok(r.made.some((m) => m.custom === 'Unit shoot days'), 'a Unit shoot days line is added');
  ok(['INR', 'USD'].includes(r.currency), 'the currency is one of the two the estimate knows');
  const calc = JSON.parse(mem.get(CALC_KEY));
  ok(r.made.every((m) => m.n > 2), 'new rows take indexes above the highest existing row');
  ok(r.made.every((m) => !('ci_' + m.n + '_rate' in calc)), 'new rows carry no rate key');
  ok(calc.ci_1_item === 'DOP' && calc.ci_1_rate === '20000', 'a typed DOP row is untouched');
  ok(calc.ci_2_custom === 'Production van' && calc.ci_2_rate === '4500' && calc.ci_2_days === '3', 'the typed van row is untouched');
  eq(S.seedBudgetLines({ scenes: scenes(), elements }).made, [], 'a second seed adds no line');
  eq(S.planBudgetLines({ scenes: scenes(), elements }), 0, 'planBudgetLines: nothing left');

  const edited = JSON.parse(mem.get(CALC_KEY));
  edited['ci_' + r.made[0].n + '_days'] = '99';
  mem.set(CALC_KEY, JSON.stringify(edited));
  eq(S.undoBudgetLines(r.made), r.made.length - 1, 'undoBudgetLines keeps the line a person changed');
  const left = JSON.parse(mem.get(CALC_KEY));
  ok(left['ci_' + r.made[0].n + '_custom'] === r.made[0].custom, 'the changed line is still there');
  ok(left.ci_1_item === 'DOP', 'the typed row survives the undo');
}
{
  fresh({ calc: TYPED });
  const r = S.seedBudgetLines({ scenes: scenes(), elements });
  eq(S.undoBudgetLines(r.made), r.made.length, 'undoBudgetLines removes every unedited line');
  const calc = JSON.parse(mem.get(CALC_KEY));
  ok(r.made.every((m) => !('ci_' + m.n + '_custom' in calc)), 'the removed rows have no keys left');
  ok(calc.ci_1_item === 'DOP' && calc.ci_2_rate === '4500', 'the typed rows are exactly as they were');
}

/* ---- 9. repairs: retired ids, position guesses, edited sheets, readiness ---- */
{
  const { COSTS_KEY } = await import('../src/lib/costs.js');
  fresh();
  mem.set(COSTS_KEY, JSON.stringify({ lines: { ci_1: { dept: 'camera' } }, expenses: [{ line: 'ci_2', amount: '50000' }] }));
  const r = S.seedBudgetLines({ scenes: scenes(), elements });
  ok(r.made.length > 0 && r.made.every((m) => m.n >= 3), 'budget rows start above ids the cost blob retired (' + r.made.map((m) => m.n) + ')');
}
{
  fresh();
  const rows = scenes();
  rows[1] = { ...rows[1], scriptElId: '', location: 'TEMPLE' };   // pairs with a heading by position only
  const { matchScenes } = await import('../src/lib/screenplay-analysis.js');
  eq(matchScenes(rows, elements).pairs.map((p) => p.how), ['heading', 'position', 'heading'], 'fixture: the middle scene is a position-only pair');
  eq(S.seedCastContacts({ scenes: rows, elements }).made.map((m) => m.role), ['Maya'], 'a speaker heard only in a position-only pair gets no contact');
  ok(!S.seedBudgetLines({ scenes: rows, elements }).made.some((m) => /Stranger/i.test(m.custom)), 'and no Cast: line');
}
{
  fresh();
  const cc = S.seedCastContacts({ scenes: scenes(), elements });
  const sh = S.seedCallSheets(scenes());
  const id = cc.made[0].id;
  const sheets = listCallSheets();
  saveCallSheets(sheets.map((x, i) => (i === 0 ? { ...x, calls: { ...x.calls, [id]: '06:30' } } : x)));
  S.undoCallSheets(sh.made);
  eq(S.undoCastContacts(cc.made), 0, 'undo keeps a placeholder a kept call sheet still names');
  eq(listCallSheets().some((x) => x.calls && x.calls[id] === '06:30'), true, 'the typed call time survives the undo');
}
{
  fresh();
  const { readiness } = await import('../src/lib/readiness.js');
  const gap = () => (readiness().checks || []).find((c) => c.id === 'cast-uncast');
  const withCast = scenes();
  withCast[0] = { ...withCast[0], elements: { ...withCast[0].elements, cast: ['Maya'] } };
  Scenes.saveScenes(withCast);
  const before = gap();
  ok(before && before.count === 1, 'fixture: Maya is uncast before the seed');
  S.seedCastContacts({ scenes: scenes(), elements });
  ok(before && gap() && gap().count === before.count, 'a To be cast placeholder does not clear the cast-uncast gap');
}

console.log(`lock-extract: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
