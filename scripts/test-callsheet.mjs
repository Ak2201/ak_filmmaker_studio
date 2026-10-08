/* ============================================================
   THE CALL SHEET'S MESSAGE AND ROUTE — in Node, no browser
   ------------------------------------------------------------
     · src/lib/callsheet-text.js — the phone → wa.me digits rule, the
       link, the unit and per-person messages, and the ~4000-character
       limit (scenes cut first with "+N more", then the notes);
     · src/lib/recce-geo.js — coordinates out of a pasted Maps link or
       a bare pair, the Chennai fallback, the Maps search link;
     · the new FIELDS — recce lat/lng/hospital/police, call sheet wrap —
       read back blank off records stored before they existed, so no
       migration exists;
     · shootday.sheetsForDay — which call sheet is a day's.

       node scripts/test-callsheet.mjs   (or: npm run test:callsheet)
   ============================================================ */
import { mem } from './node-seams.mjs';

const WA = (await import('../src/lib/callsheet-text.js')).default;
const Geo = (await import('../src/lib/recce-geo.js')).default;
const L = await import('../src/lib/locations.js');
const Contacts = (await import('../src/lib/contacts.js')).default;
const Scenes = (await import('../src/lib/scenes.js')).default;
const Shoot = (await import('../src/lib/shootday.js')).default;

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);

/* ---- phone → wa.me digits ------------------------------------ */
eq(WA.waDigits('+91 90000 10001'), '919000010001', '+91 with spaces');
eq(WA.waDigits('98400 12345'), '919840012345', 'bare 10-digit Indian mobile gains 91');
eq(WA.waDigits('098400-12345'), '919840012345', 'trunk 0 + mobile');
eq(WA.waDigits('0091 98400 12345'), '919840012345', '00 international prefix');
eq(WA.waDigits('+1 (415) 555-0100'), '14155550100', 'foreign number left alone');
eq(WA.waDigits('044 2345 6789'), '914423456789', 'Chennai STD landline: trunk 0 becomes 91');
eq(WA.waDigits('12345'), '', 'too short');
eq(WA.waDigits(''), '', 'blank');
eq(WA.waDigits(null), '', 'null');

/* ---- the link -------------------------------------------------- */
eq(WA.waLink('919840012345', 'a b&c'), 'https://wa.me/919840012345?text=a%20b%26c', 'link encodes the text');
eq(WA.waLink('', 'hi'), 'https://wa.me/?text=hi', 'no digits opens the chat picker');
ok(WA.waLink('91', 'தமிழ்').includes('%E0%AE'), 'Tamil text is UTF-8 encoded');

/* ---- the unit message ------------------------------------------ */
const facts = {
  film: 'Dragon',
  title: 'Dragon — Day 1',
  dayNumber: 1,
  date: '12 February 2024',
  generalCall: '06:00',
  wrap: '18:30',
  location: 'Engineering college — front block',
  mapUrl: 'https://www.google.com/maps/search/?api=1&query=12.92%2C80.12',
  light: { sunrise: '06:34', sunset: '18:16', zone: 'IST', fallback: false },
  scenes: [
    { number: '3', slug: 'EXT. Engineering college — DAY', pages: '1 2/8' },
    { number: '23', slug: 'INT. Classroom — DAY', pages: '4/8' }
  ],
  pagesTotal: '1 6/8',
  notes: 'Crane up before 07:00.'
};
const unit = WA.unitMessage(facts);
const lines = unit.split('\n');
eq(lines[0], '*Dragon — Day 1*', 'film not doubled when the title leads with it');
eq(lines[1], 'Day 1 · 12 February 2024', 'day and date');
ok(unit.includes('General call: 06:00'), 'general call');
ok(unit.includes('Planned wrap: 18:30'), 'wrap');
ok(unit.includes('Location: Engineering college — front block'), 'location');
ok(unit.includes('Map: https://www.google.com/maps/'), 'map link');
ok(unit.includes('Sunrise 06:34 · Sunset 18:16 (IST)'), 'sunrise and sunset');
ok(unit.includes('*Scenes (2 · 1 6/8 pages)*'), 'scene heading with total');
ok(unit.includes('3 · EXT. Engineering college — DAY · 1 2/8 pp'), 'scene line');
ok(unit.includes('*Notes*\nCrane up before 07:00.'), 'notes');
ok(!/\+\d+ more/.test(unit), 'nothing cut when it fits');

const titled = WA.unitMessage({ ...facts, title: 'Shoot day 4' });
eq(titled.split('\n')[0], '*Dragon — Shoot day 4*', 'film prefixed to a plain title');
const bare = WA.unitMessage({ scenes: [] });
ok(bare.startsWith('*Call sheet*') && bare.includes('General call: not set'), 'an empty sheet still reads');
const fallback = WA.unitMessage({ ...facts, light: { ...facts.light, fallback: true } });
ok(fallback.includes('for Chennai; the location has no pin yet'), 'the Chennai fallback says so');

/* ---- the limit --------------------------------------------------- */
const many = Array.from({ length: 200 }, (_, i) => ({
  number: String(i + 1), slug: 'EXT. A VERY LONG LOCATION NAME FOR TESTING, BLOCK ' + i + ' — DAY', pages: '1'
}));
const long = WA.unitMessage({ ...facts, scenes: many, notes: 'n'.repeat(500) });
ok(long.length <= WA.WA_LIMIT, 'long sheet fits the limit: ' + long.length);
const more = /\+(\d+) more/.exec(long);
ok(more, '"+N more" names the cut');
const shown = long.split('\n').filter((l) => /^\d+ · EXT\./.test(l)).length;
eq(shown + Number(more && more[1]), 200, 'shown + cut = every scene');
ok(long.includes('n'.repeat(500)), 'notes survive when cutting scenes was enough');
ok(long.includes('*Scenes (200'), 'heading still counts all 200');

const huge = WA.unitMessage({ ...facts, scenes: many, notes: 'x'.repeat(9000) });
ok(huge.length <= WA.WA_LIMIT, 'huge notes fit: ' + huge.length);
ok(/x…$/.test(huge), 'notes cut with an ellipsis');
ok(huge.includes('+200 more'), 'every scene cut before the notes are');
ok(huge.includes('General call: 06:00'), 'the facts are never cut');

/* ---- one person --------------------------------------------------- */
const p1 = WA.personMessage(facts, { name: 'Nivetha Balan', role: '1st AD', department: 'Direction', call: '05:30' });
ok(p1.includes('Nivetha, your call: *05:30*'), 'their own call, first name');
ok(p1.includes('Direction · 1st AD'), 'department and role');
ok(p1.indexOf('your call') < p1.indexOf('General call'), 'own call before the essentials');
ok(p1.includes('*Scenes (2'), 'same essentials');
const p2 = WA.personMessage(facts, { name: 'Ravi', department: 'Camera', call: '' });
ok(p2.includes('Ravi, your call: *06:00* (general call)'), 'blank call = the general call, said so');
const p3 = WA.personMessage({ ...facts, generalCall: '' }, { name: '', call: '' });
ok(p3.includes('Your call: the general call (time not set)'), 'no name, no time');
ok(WA.personMessage({ ...facts, scenes: many, notes: 'y'.repeat(9000) }, { name: 'A', call: '07:00' }).length <= WA.WA_LIMIT,
  'person message fits too');

/* ---- coordinates out of what is pasted ---------------------------- */
eq(Geo.parseLatLng('https://www.google.com/maps/@13.0827,80.2707,15z'), { lat: 13.0827, lng: 80.2707 }, '@lat,lng');
eq(Geo.parseLatLng('https://maps.google.com/?q=13.0418,80.2341'), { lat: 13.0418, lng: 80.2341 }, 'q=lat,lng');
eq(Geo.parseLatLng('https://www.google.com/maps/search/?api=1&query=12.9249%2C80.1000'), { lat: 12.9249, lng: 80.1 }, 'query= with %2C');
eq(Geo.parseLatLng('https://www.google.com/maps/place/X/@13.05,80.24,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d13.0512345!4d80.2398765'),
  { lat: 13.051235, lng: 80.239877 }, '!3d!4d pin beats the map centre');
eq(Geo.parseLatLng('13.0827, 80.2707'), { lat: 13.0827, lng: 80.2707 }, 'bare pair');
eq(Geo.parseLatLng('-33.8688 151.2093'), { lat: -33.8688, lng: 151.2093 }, 'bare pair, space, southern');
eq(Geo.parseLatLng('https://maps.app.goo.gl/AbCdEf123'), null, 'short link: no coordinates in it');
eq(Geo.parseLatLng('Tambaram, Chennai'), null, 'an address is not a pin');
eq(Geo.parseLatLng('@95.1,80.2'), null, 'out-of-range latitude refused');
eq(Geo.parseLatLng(''), null, 'blank');

eq(Geo.coordsOf({ lat: '13.08', lng: '80.27' }), { lat: 13.08, lng: 80.27 }, 'coordsOf reads strings');
eq(Geo.coordsOf({ lat: '', lng: '' }), null, 'blank is no pin, not 0,0');
eq(Geo.coordsOf({ lat: '0', lng: '0' }), { lat: 0, lng: 0 }, 'a typed 0,0 is a pin');
eq(Geo.coordsOf({ lat: 'abc', lng: '80' }), null, 'junk is no pin');

const fb = Geo.placeFor([{ name: 'A', recce: { lat: '', lng: '' } }]);
eq([fb.name, fb.fallback, fb.lat], ['Chennai', true, 13.0827], 'no pin anywhere → Chennai, flagged');
const pinned = Geo.placeFor([{ name: 'A', recce: {} }, { name: 'B', recce: { lat: '12.9', lng: '80.1' } }]);
eq([pinned.name, pinned.fallback, pinned.lat], ['B', false, 12.9], 'first pinned place in shooting order');

eq(Geo.mapsLink({ lat: '13.08', lng: '80.27', address: 'ignored' }),
  'https://www.google.com/maps/search/?api=1&query=13.08%2C80.27', 'coordinates win');
eq(Geo.mapsLink({ address: 'Tambaram, Chennai' }),
  'https://www.google.com/maps/search/?api=1&query=Tambaram%2C%20Chennai', 'then the address');
eq(Geo.recceMapsLink('Marina beach', {}), 'https://www.google.com/maps/search/?api=1&query=Marina%20beach', 'then the name');
eq(Geo.mapsLink({}), '', 'nothing to search for');

/* ---- the new fields, with no migration ---------------------------- */
mem.clear();
mem.set('fms_locations_v1', JSON.stringify({ days: {}, recces: { 'old place': { address: 'X', parking: 'P' } }, media: [], order: {} }));
const old = L.getRecce('Old place');
eq([old.address, old.parking, old.lat, old.lng, old.hospital, old.police], ['X', 'P', '', '', '', ''],
  'a recce stored before the fields reads back blank');
L.setRecce('Old place', { hospital: 'GH Tambaram · 044 0000 0000', lat: '12.92', lng: '80.12' });
const after = JSON.parse(mem.get('fms_locations_v1')).recces['old place'];
eq([after.address, after.hospital, after.lat], ['X', 'GH Tambaram · 044 0000 0000', '12.92'], 'the fields save beside the old ones');
eq(Object.keys(L.blankRecce()).filter((k) => ['lat', 'lng', 'hospital', 'police'].includes(k)).length, 4, 'blankRecce carries all four');

mem.set('fms_contacts_v1', JSON.stringify({ contacts: [], callSheets: [{ id: 'cs1', title: 'Old', sceneIds: [], calls: {} }] }));
eq(Contacts.listCallSheets()[0].wrap, '', 'a sheet stored before wrap reads back blank');
eq(Contacts.blankCallSheet().wrap, '', 'blankCallSheet carries wrap');

/* ---- which sheet is a day's ---------------------------------------- */
mem.clear();
const s1 = Scenes.addScene({ id: 'a', number: '1', shootDay: 1 });
const s2 = Scenes.addScene({ id: 'b', number: '2', shootDay: 1 });
const s3 = Scenes.addScene({ id: 'c', number: '3', shootDay: 2 });
const sheets = [
  { id: 'x', sceneIds: ['a', 'c'], wrap: '' },          // spans two days: nobody's
  { id: 'y', sceneIds: ['a'], wrap: '' },
  { id: 'z', sceneIds: ['b', 'a'], wrap: '19:00' },
  { id: 'e', sceneIds: [], wrap: '20:00' },              // no scenes: nobody's
  { id: 'g', sceneIds: ['ghost'], wrap: '' }             // only a deleted scene
];
const all = Scenes.listScenes();
eq(Shoot.sheetsForDay(1, sheets, all).map((s) => s.id), ['z', 'y'], 'day 1: sheets wholly on it, wrap first');
eq(Shoot.sheetsForDay(2, sheets, all).map((s) => s.id), [], 'day 2: none');
eq(Shoot.sheetsForDay(0, sheets, all), [], 'day 0 is no day');
ok(s1 && s2 && s3, 'scenes seeded');

console.log(`\n  callsheet: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
