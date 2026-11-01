#!/usr/bin/env node
/* The pre-production AI tasks' pure half, in Node, no browser:
   src/lib/ai-preprod-model.js (docs/AI-EVERYWHERE.md sections 1 to 4).
   Schemas, the facts that leave the browser, id filtering, blanks-only
   merges and the undo guards. Run: node scripts/test-ai-preprod.mjs */
import * as M from '../src/lib/ai-preprod-model.js';

let fail = 0, pass = 0;
function ok(cond, name, extra) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.log('  ✗ ' + name + (extra ? '\n      ' + extra : '')); }
}
const J = (x) => JSON.stringify(x);

/* ---- 1. shoot-order -------------------------------------------- */
console.log('shoot-order');
const sc = (id, n, patch = {}) => ({ id, number: n, intExt: 'INT', location: 'House', dayNight: 'DAY', eighths: 8, shootDay: 0, shotState: '', elements: { cast: ['Anbu'] }, synopsis: 'SECRET PLOT', ...patch });
const scenes = [
  sc('a', '1', { shootDay: 1, shotState: 'shot' }),     // day 1 has begun shooting: closed
  sc('b', '2', { shootDay: 1 }),                          // sits on the closed day: not movable
  sc('c', '3', { shootDay: 2 }),
  sc('d', '4'),
  sc('e', '5', { songId: 'sg1', location: 'Beach' })
];
ok(J([...M.closedDays(scenes)]) === '[1]', 'a day holding a shot scene is closed');
const f = M.shootOrderFacts(scenes, { pageTarget: 24 });
ok(f.scenes.map((s) => s.id).join() === 'c,d,e', 'only scenes that may move are sent', J(f.scenes.map((s) => s.id)));
ok(J(f.lockedDays) === '[1]' && f.pageTargetEighths === 24, 'closed days and the page target ride along');
ok(!J(f).includes('SECRET PLOT') && f.scenes[2].songId === 'sg1' && f.scenes[0].cast[0] === 'Anbu', 'no synopsis is sent; cast labels and songId are');
ok(J(f.currentDays) === J([{ day: 2, sceneIds: ['c'] }]), 'the open days as they stand');
const s1 = M.shootOrderSchema();
ok(s1.additionalProperties === false && s1.required.includes('days') && s1.properties.days.items.required.length === 3, 'schema is strict, every field required');

const r1 = M.readShootOrder({
  days: [
    { day: 3, sceneIds: ['d', 'zzz', 'c'], why: 'Same house.' },   // zzz was never sent
    { day: 1, sceneIds: ['e'], why: 'locked day' },               // closed day
    { day: 2, sceneIds: ['c'], why: 'duplicate' },                // c already used
    { day: 3, sceneIds: ['e'], why: 'merged' },
    { day: 999, sceneIds: ['d'], why: 'out of range' }
  ], note: 'ok'
}, f);
ok(r1.items.length === 1 && r1.items[0].day === 3, 'one day survives', J(r1.items));
ok(J(r1.items[0].sceneIds) === '["d","c","e"]', 'unknown id, locked day, duplicate and out-of-range dropped; same day merged', J(r1.items[0].sceneIds));
ok(r1.items[0].text === 'Day 3: Sc 4, 3, 5' && r1.items[0].id === 'd3' && r1.items[0].detail === 'Same house.', 'item text, id and detail');
ok(r1.dropped >= 4, 'dropped ids are counted, not hidden', r1.dropped);
ok(M.readShootOrder('nonsense', f).items.length === 0, 'a non-object reply yields nothing');

const plan = M.planPlacements(r1.items, scenes);
ok(J(plan.moves.map((m) => [m.sceneId, m.day, m.index])) === '[["d",3,0],["c",3,1],["e",3,2]]', 'placements in proposal order', J(plan.moves));
const shotSince = scenes.map((s) => (s.id === 'd' ? { ...s, shotState: 'shot' } : s));
const plan2 = M.planPlacements(r1.items, shotSince);
ok(plan2.moves.every((m) => m.sceneId !== 'd') && plan2.skipped === 1, 'a scene shot since Run is skipped and counted', J(plan2));
const closedSince = scenes.map((s) => (s.id === 'c' ? { ...s, shotState: 'part' } : s));
ok(M.planPlacements(r1.items, closedSince).moves.length === 2, 'a scene shot since Run is never moved');
const toClosed = M.planPlacements([{ day: 2, sceneIds: ['d'] }], closedSince);
ok(toClosed.moves.length === 0 && toClosed.skipped === 1, 'nothing is placed on a day that has begun shooting');

/* ---- 2. recce-notes -------------------------------------------- */
console.log('recce-notes');
const places = [
  { name: 'Perambur house', scenes: [sc('x', '1', { synopsis: 'A'.repeat(500), location: 'Perambur house' })], recce: { address: '12 Secret St', contact: '9999', notes: '', bestTime: '', power: 'typed', parking: '', toilets: '', cost: '5000', hospital: 'H', lat: '1', lng: '2' } },
  { name: 'Beach', scenes: [], recce: { notes: 'a', bestTime: 'a', power: 'a', parking: 'a', toilets: 'a' } }
];
const rf = M.recceFacts(places);
ok(rf.places.length === 1 && rf.places[0].name === 'Perambur house', 'a place with nothing left to fill is not sent');
ok(J(rf.places[0].empty) === '["notes","bestTime","parking","toilets"]', 'only the empty fields are listed', J(rf.places[0].empty));
const wire = J(rf);
ok(!/Secret St|9999|5000|hospital|"lat"|"lng"|address|contact|cost/.test(wire), 'address, contact, cost, pin, hospital never leave', wire.slice(0, 200));
ok(rf.places[0].scenes[0].action.length === 240 && rf.places[0].scenes[0].castCount === 1, 'action clipped to 240 chars; cast is a count');
ok(M.recceFacts(places, { only: 'beach' }).places.length === 0 && M.recceFacts(places, { only: 'PERAMBUR HOUSE' }).places.length === 1, 'one named place, case-insensitive');

const rr = M.readRecce({
  places: [
    { name: 'perambur house', ideas: 'Listen for the road.', checklist: ['Best time: before 9am', 'Power: mains point near the door?', 'Parking - where does the van go', 'Toilets: next door?', 'Cost: 5000', 'rubbish'] },
    { name: 'Marina', ideas: 'x', checklist: [] }   // not sent
  ]
}, rf);
ok(rr.items.length === 1 && rr.items[0].name === 'Perambur house', 'a place not sent is dropped; the name maps back to ours', J(rr.items));
const fl = rr.items[0].fields;
ok(Object.keys(fl).sort().join() === 'bestTime,notes,parking,toilets', 'power (not empty) and cost/rubbish (not in the checklist) are dropped', J(fl));
ok(fl.notes.startsWith('To check: ') && fl.parking === 'To check: where does the van go', 'written as things to check');
const now = { 'Perambur house': { notes: '', bestTime: 'I typed this', parking: '', toilets: '' } };
const rw = M.planRecceWrites(rr.items, (n) => now[n]);
ok(!('bestTime' in rw.writes[0].patch) && rw.skipped === 1, 'a field filled since Run is skipped and counted', J(rw));
ok(Object.keys(rw.writes[0].patch).sort().join() === 'notes,parking,toilets', 'blanks only');
const after = { 'Perambur house': { notes: fl.notes, bestTime: 'I typed this', parking: 'I changed it', toilets: fl.toilets } };
const ru = M.planRecceUndo(rw.writes, (n) => after[n]);
ok(J(ru.blank[0].patch) === J({ notes: '', toilets: '' }) && ru.kept === 1, 'undo blanks only fields still as written', J(ru));

/* ---- 3. budget-estimate ---------------------------------------- */
console.log('budget-estimate');
const data = { ci_1_item: 'DOP', ci_1_custom: '', ci_1_days: '10', ci_1_rate: '50000', ci_2_item: '', ci_2_custom: 'Catering', ci_2_days: '10', ci_2_rate: '9000' };
const bf = M.budgetFacts({
  schedule: { totalScenes: 5, scheduled: 4, totalDays: 6, locations: 3, pages: '12 3/8' },
  scenes: [sc('a', '1', { elements: { cast: ['Anbu', 'Meena'], extras: ['Crowd', 'crowd'], vehicles: ['Auto'] } }), sc('b', '2', { elements: { cast: ['anbu'] } })],
  scriptElements: [{ type: 'character', text: 'ANBU (V.O.)' }, { type: 'character', text: 'MEENA' }, { type: 'character', text: 'ANBU' }, { type: 'action', text: 'X' }],
  region: 'IN', currency: 'INR', presets: ['DOP', 'Gaffer', 'Other (custom)'], data
});
ok(bf.castCount === 2 && bf.speakingParts === 2 && bf.extrasTags === 1 && bf.vehicleTags === 1, 'cast, speaking, extras and vehicles counted', J(bf));
ok(J(bf.alreadyOnTheSheet) === '["DOP","Catering"]' && !J(bf).includes('50000') && !J(bf).includes('9000'), 'existing line NAMES go, amounts never', J(bf.alreadyOnTheSheet));
ok(!bf.presetItems.includes('Other (custom)'), 'the "Other (custom)" preset is not offered');
const band = (n) => (n === 'Gaffer' ? { low: 3000, high: 5000 } : null);
const rb = M.readBudget({
  lines: [
    { item: 'gaffer', days: 6, rate: 9000, reason: 'Gaffer for the shoot.' },     // preset, outside band: flagged
    { item: 'DOP', days: 6, rate: 40000, reason: 'dup' },                         // on the sheet
    { item: 'Clapper loader', days: 6, rate: 2500, reason: 'Camera dept.' },      // custom
    { item: 'Clapper Loader', days: 3, rate: 2500, reason: 'again' },             // dup in batch
    { item: '', days: 1, rate: 1, reason: '' }, { item: 'Zero', days: 0, rate: 5, reason: '' },
    { item: 'Neg', days: 2, rate: -5, reason: '' }, { item: 'Huge', days: 999, rate: 5, reason: '' }
  ], note: 'No post.'
}, bf, band);
ok(rb.items.length === 2 && rb.duplicates === 2 && rb.dropped === 4, 'keep two; on-sheet and repeated names skipped; bad numbers dropped', J([rb.items.length, rb.duplicates, rb.dropped]));
ok(rb.items[0].line.item === 'Gaffer' && rb.items[0].outOfBand && /Outside the rate card/.test(rb.items[0].detail), 'a preset maps to its name; a rate outside the band is flagged, not dropped');
ok(rb.items[1].line.custom === 'Clapper loader' && rb.items[1].line.item === '' && rb.items[1].text === 'Clapper loader, 6 days', 'a non-preset goes to the custom field');
ok(M.firstFreeRow(2, 7) === 8 && M.firstFreeRow(9, 4) === 10, 'new rows start above every id either blob names');
const pr = M.planBudgetRows(rb.items.concat([{ line: { item: 'DOP', custom: '', days: '1', rate: '1' } }]), data, 8);
ok(pr.rows.length === 2 && pr.skipped === 1 && pr.rows[0].n === 8 && pr.rows[1].n === 9, 'rows from the first free number; a name on the sheet now is skipped');
ok(pr.rows[0].keys.ci_8_item === 'Gaffer' && pr.rows[0].keys.ci_8_rate === '9000' && pr.rows[1].keys.ci_9_custom === 'Clapper loader', 'ci_<n>_item|custom|days|rate');
ok(Object.keys(pr.rows[0].keys).every((k) => !(k in data)), 'no existing key is touched');
const written = { ...data, ...pr.rows[0].keys, ...pr.rows[1].keys };
let un = M.planBudgetUndo(pr.rows, written, 0);
ok(un.remove.length === 8 && un.kept === 0, 'undo removes exactly the written rows');
const edited = { ...written, ci_9_days: '99' };
un = M.planBudgetUndo(pr.rows, edited, 0);
ok(un.remove.length === 4 && un.kept === 1 && un.remove.every((k) => k.startsWith('ci_8_')), 'an edited row stays');
un = M.planBudgetUndo(pr.rows, written, 8);
ok(un.remove.length === 4 && un.remove.every((k) => k.startsWith('ci_9_')), 'a row the costs now name stays');

/* ---- 4. callsheet-notes ---------------------------------------- */
console.log('callsheet-notes');
const raw = {
  film: 'Dragon', title: 'Day 2', dayNumber: 2, date: 'Mon, 3 Nov', generalCall: '06:00', wrap: '19:00', location: 'Perambur house',
  mapUrl: 'https://maps/x', mapPlace: 'P', light: { sunrise: '06:01', sunset: '17:55', zone: 'IST', fallback: false },
  safety: [{ place: 'Perambur house', hospital: 'Apollo, 044 1234 5678', police: 'K4 station 100' }],
  scenes: [{ number: '3', slug: 'INT HOUSE — DAY', pages: '1' }], pagesTotal: '1', notes: 'old notes', calls: { c1: '05:00' }
};
const cf = M.callsheetFacts(raw);
const cw = J(cf);
ok(!/Apollo|1234|station|maps|old notes|05:00|calls/.test(cw), 'no map link, hospital or police text, notes or per-person calls', cw);
ok(J(cf.safetyPlaces) === '["Perambur house"]' && cf.light.sunrise === '06:01' && cf.scenes[0].slug === 'INT HOUSE — DAY', 'safety places only; light and scenes kept');
const ex = M.callsheetPrompt(cf, 'EXAMPLE');
ok(ex.includes('EXAMPLE') && ex.includes('"Dragon"'), 'the prompt shows the facts and the tone example');
const rc = M.readCallsheet({ notes: 'N'.repeat(2000), unitMessage: 'U'.repeat(9000) }, 3800);
ok(rc.notes.length === M.NOTES_MAX && rc.unitMessage.length === 3800, 'notes clipped to 800, unit message to WA_LIMIT');
ok(M.callsheetWrite('Bring water.', '').write === 'Bring water.', 'fills when empty now');
ok(M.callsheetWrite('Bring water.', '  typed ').why === 'filled' && M.callsheetWrite('', '').why === 'nothing', 'a non-empty box is never written; empty selection writes nothing');
ok(M.callsheetUndo('Bring water.', 'Bring water.') && !M.callsheetUndo('Bring water.', 'Bring water. Bring tea.'), 'undo only while the notes read as written');

{
  const odd = 'Old  Mill ' + 'x'.repeat(90);
  const f = M.recceFacts([{ name: odd, scenes: [], recce: {} }]);
  const r = M.readRecce({ places: [{ name: f.places[0].name, ideas: 'Check the road', checklist: [] }] }, f);
  ok(r.items.length === 1 && r.items[0].name === odd, 'a recce is filed under the card\'s own name, not the prompt copy');
  ok(!M.reccePrompt(f).includes('"exact"'), 'the exact name is not sent to the model');
}

console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
