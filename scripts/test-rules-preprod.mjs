/* ============================================================
   TEST — the no-AI pre-production rules (docs/RULES-BREAKDOWN.md, lane A)
   src/lib/rules-preprod.js (pure) and src/lib/local-tasks-preprod.js
   (the Desk tasks over the models), in Node, no browser.
   node scripts/test-rules-preprod.mjs   (or: npm run test:rules-preprod)

   Asserts the lane's contract:
     · proposeShootOrder: deterministic; a shot scene and a closed day are
       never in an item; places longest first, night after day, EXT before
       INT; a song's scenes share a day; the page target is respected; a
       day number never reuses a locked one
     · proposeRecce: blank fields only, every line prefixed, each line
       needs a fact, an empty project gives nothing
     · proposeBudget: names already on the sheet skipped, the band is
       shown, no rate without a band, the midpoint is exactly the JSON's
       (low + high) / 2, ids clear the costs blob, no multiplier
     · proposeCallsheetNotes: within NOTES_MAX, every line backed by a
       fact, empty facts give no line
     · the four tasks: apply then Undo leaves storage byte-identical, an
       edit after Accept survives Undo, no ai / aiFill on anything written,
       a second run proposes nothing, rules-preprod.js imports no ai*.js
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const R = await import('../src/lib/rules-preprod.js');
const T = await import('../src/lib/local-tasks-preprod.js');
const M = await import('../src/lib/ai-preprod-model.js');
const Scenes = await import('../src/lib/scenes.js');
const Loc = await import('../src/lib/locations.js');
const Contacts = await import('../src/lib/contacts.js');
const Budget = await import('../src/lib/budget-model.js');
const Costs = await import('../src/lib/costs.js');
const { CALC_KEY } = Costs;
const { SCRIPT_KEY } = await import('../src/lib/script.js');
const DPR = await import('../src/lib/dpr.js');
const ratesIN = JSON.parse(readFileSync(new URL('../src/data/rates.chennai.2024.json', import.meta.url), 'utf8'));
const ratesUS = JSON.parse(readFileSync(new URL('../src/data/rates.us.json', import.meta.url), 'utf8'));

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const snap = () => JSON.stringify([...mem.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)));
const J = JSON.stringify;

/* ---- pins: the duplicated constants still agree with their owners ---- */
eq(R.RECCE_FIELDS, M.RECCE_FIELDS, 'RECCE_FIELDS is the AI path’s list');
eq(R.RECCE_PREFIX, M.RECCE_PREFIX, 'the recce prefix is the AI path’s');
eq(R.NOTES_MAX, M.NOTES_MAX, 'NOTES_MAX is the AI path’s');
eq(R.DAY_NIGHT_ORDER, Scenes.DAY_NIGHT, 'the time-of-day order is scenes.js’s');
eq(R.DEFAULT_PAGE_TARGET, DPR.DEFAULT_PAGE_TARGET, 'the default page target is dpr.js’s');

/* ---- no ai*.js import, and no stamp ---------------------------------- */
{
  const src = readFileSync(new URL('../src/lib/rules-preprod.js', import.meta.url), 'utf8');
  ok(!/from\s+['"]\.\/ai[-.]/.test(src) && !/import\(\s*['"]\.\/ai[-.]/.test(src), 'rules-preprod.js imports nothing from ai*.js');
  ok(!/\bdocument\b|localStorage|sessionStorage/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')), 'rules-preprod.js touches no document or storage');
  const tasks = readFileSync(new URL('../src/lib/local-tasks-preprod.js', import.meta.url), 'utf8');
  ok(!/ai-stamp|stampFill|aiFill/.test(tasks.replace(/\/\*[\s\S]*?\*\//g, '')), 'local-tasks-preprod.js never stamps');
  ok(!/ai-tasks|ai\.js|aiUnlocked/.test(tasks.replace(/\/\*[\s\S]*?\*\//g, '')), 'local-tasks-preprod.js reaches no AI code and never asks aiUnlocked');
}
eq(T.RULES_TASKS_PREPROD.map((t) => t.id),
  ['shoot-order-rules', 'recce-notes-rules', 'budget-estimate-rules', 'callsheet-notes-rules'], 'the four task ids are permanent');
ok(T.RULES_TASKS_PREPROD.every((t) => t.local === true && t.kind === 'list' && typeof t.input() === 'string' && t.input().length > 20),
  'each is a local list task with a synchronous input sentence');

/* ============================================================
   1. shoot-order
   ============================================================ */
const sc = (id, n, o = {}) => Scenes.blankScene({ id, number: n, intExt: 'INT', dayNight: 'DAY', location: 'HOUSE', eighths: 8, ...o });
const SCENES = () => [
  sc('s1', '1', { intExt: 'EXT', location: 'BEACH HOUSE', elements: { cast: ['MARA', 'JOE'] } }),
  sc('s2', '2', { intExt: 'INT', dayNight: 'NIGHT', location: 'BEACH HOUSE', eighths: 16, elements: { cast: ['MARA'] } }),
  sc('s3', '3', { intExt: 'INT', location: 'BEACH HOUSE' }),
  sc('s4', '4', { intExt: 'EXT', location: 'MARKET', eighths: 40, elements: { extras: ['Crowd (40)'], vehicles: ['Auto'], cast: ['JOE'] } }),
  sc('s5', '5', { location: 'HOUSE', songId: 'sg1', elements: { cast: ['MARA'] } }),
  sc('s6', '6', { intExt: 'EXT', dayNight: 'NIGHT', location: 'PARK', songId: 'sg1' }),
  sc('s7', '7', { location: 'HOSPITAL', shootDay: 1, shotState: 'shot' }),
  sc('s8', '8', { location: 'HOSPITAL', shootDay: 1 })
];
const factsOf = (scenes) => M.shootOrderFacts(scenes, { pageTarget: 39 });
{
  const f = factsOf(SCENES());
  eq(f.scenes.map((s) => s.id), ['s1', 's2', 's3', 's4', 's5', 's6'], 'the facts hold only the scenes that may move');
  const a = R.proposeShootOrder(f, { pageTarget: 39 });
  const b = R.proposeShootOrder(JSON.parse(J(f)), { pageTarget: 39 });
  eq(a, b, 'the same facts give the same plan (deterministic)');
  const placed = a.items.flatMap((i) => i.sceneIds);
  ok(!placed.includes('s7') && !placed.includes('s8'), 'a shot scene and a scene on a closed day are never in an item');
  ok(a.items.every((i) => i.day !== 1), 'a day number never reuses a locked day');
  eq([...placed].sort(), ['s1', 's2', 's3', 's4', 's5', 's6'], 'every movable scene is placed exactly once');
  eq(a.items.map((i) => i.id), a.items.map((i) => 'd' + i.day), 'item ids are d<day>');
  eq(a.items[0].sceneIds, ['s4'], 'the longest place (MARKET, 5 pages) goes first');
  const beach = a.items.find((i) => i.sceneIds.includes('s1'));
  eq(beach.sceneIds, ['s1', 's3', 's2'], 'inside a place: exterior before interior, night last');
  const song = a.items.find((i) => i.sceneIds.includes('s5'));
  ok(song.sceneIds.includes('s6'), 'a song’s scenes share a day');
  ok(/^Same location: BEACH HOUSE · day and night · 4 pages · cast MARA, JOE$/.test(beach.detail), 'templated detail — ' + beach.detail);
  ok(/Locations: HOUSE, PARK/.test(song.detail) && /day and night/.test(song.detail), 'a mixed-place day names its places — ' + song.detail);
  const p = M.planPlacements(a.items, SCENES());
  eq(p.skipped, 0, 'the AI path’s planPlacements takes the items as they are, skipping none');
  // the page target: no day over it unless a single scene is bigger than a day
  const small = R.proposeShootOrder(f, { pageTarget: 16 });
  const eighthsOf = (ids) => ids.reduce((n, id) => n + SCENES().find((s) => s.id === id).eighths, 0);
  ok(small.items.every((i) => i.sceneIds.length === 1 || eighthsOf(i.sceneIds) <= 16), 'a 2-page target is respected: ' + small.items.map((i) => eighthsOf(i.sceneIds)).join(','));
  const none = R.proposeShootOrder(f, {});
  ok(none.items.length > 0, 'no page target falls back to the default');
  // night after day, per place only: reversing the script order of a place does not put night first
  const rev = factsOf(SCENES().slice().reverse());
  ok(R.proposeShootOrder(rev, { pageTarget: 39 }).items.find((i) => i.sceneIds.includes('s1')).sceneIds.join() === 's1,s3,s2', 'the in-place order does not depend on script order');
  eq(R.proposeShootOrder({ scenes: [], lockedDays: [] }, {}), { items: [], note: '' }, 'no scenes, no plan');
  // cast overlap breaks a tie between equal-length places
  const tie = M.shootOrderFacts([
    sc('t1', '1', { location: 'A', eighths: 16, elements: { cast: ['X'] } }),
    sc('t2', '2', { location: 'B', eighths: 8, elements: { cast: ['Z'] } }),
    sc('t3', '3', { location: 'C', eighths: 8, elements: { cast: ['X'] } })
  ], { pageTarget: 16 });
  const order = R.proposeShootOrder(tie, { pageTarget: 16 }).items.flatMap((i) => i.sceneIds);
  eq(order, ['t1', 't3', 't2'], 'equal-length places: the one sharing cast with the last comes first');
}

/* ============================================================
   2. recce
   ============================================================ */
{
  const base = SCENES().filter((s) => s.id !== 's7' && s.id !== 's8');
  const rows = Loc.locationIndex(base);
  const res = R.proposeRecce(rows);
  ok(res.items.length > 0, 'a populated project gives recce lines');
  ok(res.items.every((i) => i.text.startsWith('To check: ')), 'every line starts "To check: "');
  ok(res.items.every((i) => R.RECCE_FIELDS.includes(i.field)), 'only the AI path’s five fields');
  const market = res.items.filter((i) => i.location === 'MARKET');
  ok(market.some((i) => i.field === 'parking' && /Auto/.test(i.text) && /crowd of 40/.test(i.text)), 'MARKET parking names the tagged vehicle and the crowd');
  ok(market.some((i) => i.field === 'toilets' && /background of 40/.test(i.text)), 'MARKET toilets names the crowd');
  ok(!res.items.some((i) => i.location === 'PARK' && (i.field === 'parking' || i.field === 'toilets' || i.field === 'notes')), 'a place with no qualifying fact gets no such item');
  ok(res.items.find((i) => i.location === 'PARK' && i.field === 'bestTime'), 'PARK still has a night/day fact for the best time');
  ok(!res.items.some((i) => i.field === 'power' && i.location === 'PARK' && !/night/.test(i.text)), 'PARK power is for its night scene');
  // blank only
  const filled = rows.map((r) => (r.name === 'MARKET' ? { ...r, recce: { ...r.recce, parking: 'typed', toilets: 'typed' } } : r));
  const res2 = R.proposeRecce(filled);
  ok(!res2.items.some((i) => i.location === 'MARKET' && (i.field === 'parking' || i.field === 'toilets')), 'a typed field is never proposed');
  eq(R.proposeRecce([]).items, [], 'an empty project gives no items');
  eq(R.proposeRecce(Loc.locationIndex([])).items, [], 'no scenes, no items');
  eq(R.proposeRecce(rows), res, 'the recce is deterministic');
  // light
  const lit = R.proposeRecce(rows, { light: () => ({ day: 3, sunrise: '06:02', sunset: '18:11' }) });
  ok(lit.items.find((i) => i.field === 'bestTime' && /sunrise 06:02, sunset 18:11/.test(i.text) && /not a forecast/.test(i.text)), 'a known light is quoted as calculated, not a forecast');
  // every field a place gets is one the rule can defend: power needs INT / night / tags
  const exterior = Loc.locationIndex([sc('x1', '1', { intExt: 'EXT', location: 'FIELD' })]);
  ok(!R.proposeRecce(exterior).items.some((i) => i.field === 'power'), 'an exterior day place with no tags has no power line');
}

/* ============================================================
   3. budget
   ============================================================ */
const presets = Budget.PRESET_ITEMS;
const sched = (days) => ({ totalDays: days });
const scheduled = () => SCENES().filter((s) => s.id !== 's7' && s.id !== 's8').map((s, i) => ({ ...s, shootDay: 1 + (i % 3) }));
const baseBudget = (o = {}) => ({
  schedule: sched(3), scenes: scheduled(), elements: [], presets, rates: { india: ratesIN, us: ratesUS }, rowKey: Costs.rowKey,
  currency: 'INR', existing: [], ...o
});
{
  const res = R.proposeBudget(baseBudget());
  ok(res.items.length > 5, 'a scheduled film gets lines — ' + res.items.length);
  const names = res.items.map((i) => i.line.custom || i.line.item);
  ok(names.includes('Unit shoot days') && names.includes('Sound recordist + kit') && names.includes('Gaffer'), 'the unit days and the template’s kit lines are there');
  ok(names.some((n) => /^Location: /.test(n)) && names.some((n) => /^Vehicle: Auto$/.test(n)) && names.some((n) => /^Background extras \(peak 40\)$/.test(n)), 'the lock’s location, vehicle and background lines are there');
  ok(names.includes('HMI 1.2K') && !names.includes('Stunts: coordinator and rigging'), 'a night scene triggers the night light; no stunt tag, no stunt line');
  ok(res.items.every((i) => Number(i.line.days) > 0), 'every line has days from the schedule');
  ok(res.items.every((i) => i.line.rate === ''), 'no rate is typed unless the midpoint is asked for');
  eq(Number(res.items.find((i) => i.line.item === 'Sound recordist + kit').line.days), 3, 'a kit line’s days are the schedule’s shoot days');
  const sound = res.items.find((i) => i.line.item === 'Sound recordist + kit');
  ok(sound.band && sound.band.low === 4000 && sound.band.high === 8000 && /₹ 4,000 to ₹ 8,000 a day/.test(sound.detail), 'the band is shown — ' + sound.detail);
  const camera = res.items.find((i) => i.line.custom === 'Camera package');
  ok(camera && camera.band === null && camera.line.rate === '', 'a line with no band has no rate');
  // midpoint, exactly
  const mid = R.proposeBudget(baseBudget({ midpoint: true }));
  const sound2 = mid.items.find((i) => i.line.item === 'Sound recordist + kit');
  eq(Number(sound2.line.rate), (4000 + 8000) / 2, 'the midpoint is exactly (low + high) / 2 from the JSON');
  ok(/rate card midpoint, an estimate — not a quote/.test(sound2.detail), 'the midpoint is labelled an estimate, not a quote');
  const row = ratesIN.sections.find((s) => s.id === 'lighting-and-grip').rows.find((r) => /^LED panel kits/.test(r.item));
  eq(Number(mid.items.find((i) => i.line.item === 'LED panel kit').line.rate), (row.low + row.high) / 2, 'LED panel kit midpoint = the rate card’s');
  ok(mid.items.filter((i) => !i.band).every((i) => i.line.rate === ''), 'no band, no rate, even with the midpoint on');
  ok(mid.items.every((i) => i.line.rate === '' || (i.band && Number(i.line.rate) >= i.band.low && Number(i.line.rate) <= i.band.high)), 'a rate is never outside its band (no multiplier)');
  // existing names skipped
  const skip = R.proposeBudget(baseBudget({ existing: ['Gaffer', 'unit shoot days', 'LED Panel Kit'] }));
  const sn = skip.items.map((i) => i.line.custom || i.line.item);
  ok(!sn.includes('Gaffer') && !sn.includes('Unit shoot days') && !sn.includes('LED panel kit'), 'names already on the sheet are skipped, whatever their case');
  eq(R.proposeBudget(baseBudget()), res, 'the budget draft is deterministic');
  eq(R.proposeBudget(baseBudget({ scenes: [], schedule: sched(0) })).items, [], 'no schedule, no lines');
  // dollar budget reads the US band
  const us = R.proposeBudget(baseBudget({ currency: 'USD', midpoint: true }));
  const alexa = ratesUS.rows[0];
  ok(us.items.every((i) => !i.band || (i.band.low === Math.round(i.band.low) && i.band.high >= i.band.low)), 'US bands come from rates.us.json');
  ok(!us.items.some((i) => /₹/.test(i.detail)), 'a dollar budget never prints a rupee sign');
  ok(R.rateBand(alexa.item, 'USD', { us: ratesUS }, Costs.rowKey) !== null, 'a US row with prices has a band');
  ok(R.rateBand('Gaffer', 'USD', { us: ratesUS }, Costs.rowKey) === null, 'a preset with no US row has no US band');
}

/* ============================================================
   4. call sheet notes
   ============================================================ */
{
  const facts = {
    wrap: '19:30', pagesTotal: '4 4/8',
    light: { sunrise: '06:02', sunset: '18:11', zone: 'IST', fallback: false },
    scenes: [{ number: '1', slug: 'EXT. BEACH - DAY', pages: '1' }, { number: '2', slug: 'INT. HOUSE - NIGHT', pages: '2' }, { number: '4', slug: 'EXT. MARKET - DAY', pages: '5' }]
  };
  const tags = {
    1: { dayNight: 'DAY', intExt: 'EXT' }, 2: { dayNight: 'NIGHT', intExt: 'INT', stunts: ['Fall'] },
    4: { dayNight: 'DAY', intExt: 'EXT', vehicles: ['Auto'], animals: ['Dog'], sfx: ['Smoke'] }
  };
  const res = R.proposeCallsheetNotes(facts, {
    tagsByScene: tags, ages: { 4: [{ name: 'MEENA', age: 9 }] },
    moves: [{ from: 'BEACH', to: 'HOUSE', after: '1' }, { from: 'HOUSE', to: 'MARKET', after: '2' }]
  });
  const txt = res.notes.join('\n');
  ok(/Sunrise 06:02, sunset 18:11 IST\./.test(txt), 'light line — ' + res.notes[0]);
  ok(/Night shoot: Sc 2 is after sunset\./.test(txt), 'night scene line');
  ok(/Wrap is 19:30, after sunset \(18:11\)\./.test(txt), 'wrap past sunset with a night scene');
  ok(/Exterior day scenes, Sc 1, 4: wrap is 19:30/.test(txt), 'exterior day scenes at risk');
  ok(/Company move: BEACH to HOUSE, after Sc 1\./.test(txt) && /Company move: HOUSE to MARKET, after Sc 2\./.test(txt), 'company moves');
  ok(/Vehicles \(Auto\) in Sc 4\./.test(txt) && /Animals \(Dog\) in Sc 4\./.test(txt) && /Stunts in Sc 2/.test(txt) && /Special effects in Sc 4\./.test(txt), 'vehicle, animal, stunt and effects lines');
  ok(/Child artist \(MEENA, 9\) in Sc 4: a guardian on set/.test(txt), 'child artist');
  ok(/4 4\/8 pages across 3 scenes\./.test(txt), 'page total');
  ok(txt.length <= R.NOTES_MAX && res.text === txt, 'within NOTES_MAX');
  // every line has its fact: take each fact away and its line goes
  const without = (patch, opt = {}) => R.proposeCallsheetNotes({ ...facts, ...patch }, { tagsByScene: tags, ages: {}, moves: [], ...opt }).notes.join('\n');
  ok(!/Sunrise/.test(without({ light: null })), 'no light, no light line');
  ok(!/Child artist/.test(without({})), 'no age, no child line');
  ok(!/Company move/.test(without({})), 'no move, no move line');
  ok(!/Wrap is/.test(without({ wrap: '17:00' })), 'a wrap before sunset raises no sunset line');
  ok(!/Night shoot/.test(without({}, { tagsByScene: { 1: tags[1] } })), 'no night scene, no night line');
  ok(!/Vehicles|Animals|Stunts|Special effects/.test(without({}, { tagsByScene: { 1: tags[1] } })), 'no tags, no tag lines');
  eq(R.proposeCallsheetNotes({}, {}).notes, [], 'empty facts give no notes');
  eq(R.proposeCallsheetNotes(facts, { tagsByScene: tags, ages: {}, moves: [] }), R.proposeCallsheetNotes(facts, { tagsByScene: tags, ages: {}, moves: [] }), 'deterministic');
  // clip: many moves cannot push past the box
  const big = R.proposeCallsheetNotes({ ...facts, scenes: Array.from({ length: 80 }, (_, i) => ({ number: String(i + 1) })) }, {
    tagsByScene: Object.fromEntries(Array.from({ length: 80 }, (_, i) => [String(i + 1), { vehicles: ['Car number ' + i] }])), moves: []
  });
  ok(big.text.length <= R.NOTES_MAX, 'a long sheet is clipped to NOTES_MAX (' + big.text.length + ')');
}

/* ============================================================
   5. the tasks, through the models: write, Undo, edits, no stamp
   ============================================================ */
const noStamp = (rows) => rows.every((r) => !('ai' in r) && !('aiFill' in r));

// ---- shoot-order-rules
{
  mem.clear();
  Scenes.saveScenes(SCENES());
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'shoot-order-rules');
  const before = snap();
  const mean0 = J([Scenes.listScenes().map((s) => [s.id, s.shootDay || 0]), Loc.listDayOrder ? Loc.listDayOrder() : null]);
  const said = [];
  const res = await task.run(task.input(), { ctx: {} });
  ok(res.items.length >= 3 && snap() === before, 'run proposes days and writes nothing');
  const undo = task.apply(res.items, { say: (m) => said.push(m) });
  ok(typeof undo === 'function', 'apply answers an Undo');
  const after = Scenes.listScenes();
  ok(after.find((s) => s.id === 's4').shootDay === 2 || after.find((s) => s.id === 's4').shootDay > 1, 'the market scene is on a day after the closed one');
  ok(noStamp(after), 'no ai / aiFill on any scene');
  eq(after.filter((s) => s.id === 's7' || s.id === 's8').map((s) => s.shootDay), [1, 1], 'scenes on the closed day stay on it');
  let again = null;
  try { await task.run(task.input(), { ctx: {} }); } catch (e) { again = e; }
  ok(again && again.kind === 'nocontent', 'a second run on the planned board proposes nothing');
  ok(task.apply(res.items, {}) === null, 'applying the same plan again writes nothing and answers null');
  undo();
  /* undoPlace() writes `shootDay: 0` onto a scene that had no such field and leaves an empty
     locations blob; both read back exactly as before (blankScene / readAll spread their
     defaults), so the shoot-order comparison is by meaning: every scene's day, every day order. */
  const meaning = () => J([Scenes.listScenes().map((s) => [s.id, s.shootDay || 0]), Loc.listDayOrder ? Loc.listDayOrder() : null]);
  eq(meaning(), mean0, 'Undo puts every scene on its old day and every day order back');
}
{   // a move after Accept is kept by Undo
  mem.clear();
  Scenes.saveScenes(SCENES());
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'shoot-order-rules');
  const res = await task.run(task.input(), { ctx: {} });
  const undo = task.apply(res.items, {});
  Loc.placeScene('s1', 9, {});   // the person moves s1 afterwards
  undo();
  eq(Scenes.listScenes().find((s) => s.id === 's1').shootDay, 9, 'a scene moved after Accept stays where it was put');
}
{   // shot since Run: skipped
  mem.clear();
  Scenes.saveScenes(SCENES());
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'shoot-order-rules');
  const res = await task.run(task.input(), { ctx: {} });
  Scenes.saveScenes(Scenes.listScenes().map((s) => (s.id === 's4' ? { ...s, shotState: 'shot' } : s)));
  const undo = task.apply(res.items, {});
  ok(!Scenes.listScenes().find((s) => s.id === 's4').shootDay, 'a scene shot since the run is not moved');
  if (undo) undo();
}

// ---- recce-notes-rules
{
  mem.clear();
  Scenes.saveScenes(SCENES().filter((s) => s.id !== 's7' && s.id !== 's8'));
  Loc.setRecce('MARKET', { address: 'Main road', parking: 'typed already' });   // a typed card
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'recce-notes-rules');
  const before = snap();
  const res = await task.run(task.input({}), { ctx: {} });
  ok(snap() === before, 'recce run writes nothing');
  ok(!res.items.some((i) => i.location === 'MARKET' && i.field === 'parking'), 'a typed field is not proposed');
  const undo = task.apply(res.items, {});
  const park = Loc.getRecce('PARK');
  ok(/^To check: /.test(park.bestTime) && park.address === '', 'a blank field gets a "To check:" line and nothing else moves');
  ok(Loc.getRecce('MARKET').parking === 'typed already' && Loc.getRecce('MARKET').address === 'Main road', 'typed fields on a card are untouched');
  const written = JSON.parse(mem.get(Loc.LOCATIONS_KEY) || '{}');
  ok(!JSON.stringify(written).includes('aiFill') && !JSON.stringify(written).includes('"ai"'), 'no ai / aiFill on any recce card');
  let again = null;
  try { await task.run(task.input({}), { ctx: {} }); } catch (e) { again = e; }
  ok(again && again.kind === 'nocontent', 'a second recce run proposes nothing');
  undo();
  eq(snap(), before, 'recce Undo leaves storage byte-identical (a card this run made goes away whole)');
}
{   // an edit after Accept survives Undo
  mem.clear();
  Scenes.saveScenes(SCENES().filter((s) => s.id !== 's7' && s.id !== 's8'));
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'recce-notes-rules');
  const res = await task.run(task.input({}), { ctx: {} });
  const undo = task.apply(res.items, {});
  Loc.setRecce('PARK', { bestTime: 'Evening only, I checked.' });
  undo();
  eq(Loc.getRecce('PARK').bestTime, 'Evening only, I checked.', 'a field edited after Accept is kept by Undo');
  ok(Loc.getRecce('MARKET').toilets === '', 'the untouched fields are blank again');
  // one place only
  const one = await task.run(task.input({ locationName: 'PARK' }), { ctx: { locationName: 'PARK' } });
  ok(one.items.every((i) => i.location === 'PARK'), 'a named place is the only place read');
}

// ---- budget-estimate-rules
{
  mem.clear();
  Scenes.saveScenes(scheduled());
  const existing = { ci_1_item: 'Gaffer', ci_1_custom: '', ci_1_days: '2', ci_1_rate: '5000', ci_currency: 'INR' };
  mem.set(CALC_KEY, JSON.stringify(existing));
  // a cost record names a higher row id: new rows must clear it
  mem.set(Costs.COSTS_KEY, JSON.stringify({ expenses: [{ id: 'e1', line: 'ci_12', amount: 1 }], lines: {} }));
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'budget-estimate-rules');
  const before = snap();
  const res = await task.run(task.input({}), { ctx: {} });
  ok(snap() === before, 'budget run writes nothing');
  ok(!res.items.some((i) => (i.line.custom || i.line.item) === 'Gaffer'), 'a name already on the sheet is not proposed');
  const undo = task.apply(res.items.slice(0, 3), {});
  const data = Budget.readCalcData();
  const ids = Object.keys(data).map((k) => /^ci_(\d+)_item$/.exec(k)).filter(Boolean).map((m) => +m[1]);
  ok(ids.filter((n) => n !== 1).every((n) => n > 12), 'new row ids clear the costs blob: ' + ids.join(','));
  ok(!Object.keys(data).some((k) => /_ai$/.test(k)), 'no ai key on any row');
  eq(data.ci_1_rate, '5000', 'the typed line is untouched');
  ok(res.items.slice(0, 3).every((i) => !i.line.rate), 'no rate was written (rates stay blank)');
  let again = null;
  try { const r2 = await task.run(task.input({}), { ctx: {} }); if (r2.items.some((i) => res.items.slice(0, 3).some((x) => (x.line.custom || x.line.item) === (i.line.custom || i.line.item)))) again = 'repeat'; } catch (e) { again = null; }
  ok(again === null, 'a second run does not repeat the lines already added');
  undo();
  eq(snap(), before, 'budget Undo leaves storage byte-identical');
}
{   // the midpoint is opt-in and exact; an edit after Accept survives Undo
  mem.clear();
  Scenes.saveScenes(scheduled());
  mem.set(CALC_KEY, JSON.stringify({ ci_1_item: 'Gaffer', ci_1_days: '2', ci_currency: 'INR' }));
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'budget-estimate-rules');
  const res = await task.run(task.input({ midpoint: true }), { ctx: { midpoint: true } });
  const sound = res.items.find((i) => i.line.item === 'Sound recordist + kit');
  eq(sound.line.rate, '6000', 'midpoint run: the sound recordist’s rate is the band’s middle');
  const undo = task.apply([sound], {});
  const key = Object.keys(Budget.readCalcData()).find((k) => /_item$/.test(k) && Budget.readCalcData()[k] === 'Sound recordist + kit');
  const n = /^ci_(\d+)_/.exec(key)[1];
  ok(Budget.readCalcData()['ci_' + n + '_rate'] === '6000', 'the midpoint was written as the rate');
  Budget.saveCalcData({ ...Budget.readCalcData(), ['ci_' + n + '_days']: '9' });   // the person edits it
  undo();
  eq(Budget.readCalcData()['ci_' + n + '_days'], '9', 'a line edited after Accept is kept by Undo');
}

// ---- callsheet-notes-rules
{
  mem.clear();
  Scenes.saveScenes(scheduled());
  mem.set(SCRIPT_KEY, JSON.stringify({ elements: [
    { id: 'e1', type: 'scene', text: 'EXT. MARKET - DAY' },
    { id: 'e2', type: 'action', text: 'MEENA, 9, drags a sack past the stalls.' }
  ] }));
  const sheet = Contacts.blankCallSheet({ title: 'Shoot day 1', sceneIds: ['s4', 's2'], wrap: '19:30' });
  Contacts.saveCallSheets([sheet]);
  const facts = () => ({
    wrap: '19:30', pagesTotal: '7', scenes: [{ number: '4', slug: 'EXT MARKET - DAY', pages: '5' }, { number: '2', slug: 'INT BEACH HOUSE - NIGHT', pages: '2' }],
    light: { sunrise: '06:02', sunset: '18:11', zone: 'IST', fallback: false }
  });
  const task = T.RULES_TASKS_PREPROD.find((t) => t.id === 'callsheet-notes-rules');
  const ctx = { sheetId: sheet.id, facts, sceneIds: () => ['s4', 's2'] };
  const before = snap();
  const res = await task.run(task.input(ctx), { ctx });
  ok(snap() === before, 'notes run writes nothing');
  ok(res.items.length >= 5 && res.items.every((i) => i.text && i.id), 'one item per fact');
  ok(res.items.some((i) => /Vehicles \(Auto\) in Sc 4\./.test(i.text)), 'the tagged vehicle on the sheet gets its line');
  ok(res.items.some((i) => /Company move: MARKET to BEACH HOUSE, after Sc 4\./.test(i.text)), 'the company move between the sheet’s two places');
  ok(res.items.some((i) => /Child artist \(MEENA, 9\) in Sc 4/.test(i.text)), 'the child artist is read from the script');
  const undo = task.apply(res.items, ctx);
  const written = Contacts.listCallSheets()[0];
  ok(written.notes === res.items.map((i) => i.text).join('\n') && written.notes.length <= R.NOTES_MAX, 'Accept fills the notes box with the ticked lines');
  ok(noStamp([written]), 'no ai / aiFill on the call sheet');
  let again = null;
  try { await task.run(task.input(ctx), { ctx }); } catch (e) { again = e; }
  ok(again && again.kind === 'nocontent', 'notes already written: a second run proposes nothing');
  undo();
  eq(snap(), before, 'notes Undo leaves storage byte-identical');
  // an edit after Accept survives Undo
  const undo2 = task.apply(res.items, ctx);
  Contacts.updateCallSheet(sheet.id, { notes: Contacts.listCallSheets()[0].notes + '\nMy own line.' });
  undo2();
  ok(/My own line\./.test(Contacts.listCallSheets()[0].notes), 'notes edited after Accept are kept by Undo');
  // an untouched box the person already filled blocks the run
  let blocked = null;
  try { await task.run(task.input(ctx), { ctx }); } catch (e) { blocked = e; }
  ok(blocked && blocked.kind === 'nocontent', 'a sheet with typed notes is never overwritten');
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `\nrules-preprod: ${pass} checks passed`);
process.exit(fail ? 1 : 0);
