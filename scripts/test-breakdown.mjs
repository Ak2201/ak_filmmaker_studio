/* ============================================================
   THE WHOLE-SCRIPT BREAKDOWN — src/lib/breakdown-run.js
   ------------------------------------------------------------
   Asserted in Node, no browser, on the Dragon sample's screenplay and
   on a five-page fixture written here:
     · every heading becomes a scene row, linked by the heading's id,
       numbered in script order, INT/EXT and DAY/NIGHT as the heading
       says them;
     · cast is tagged from character CUES only (not from caps in
       action), props and the rest are NOT tagged;
     · characters carry their scenes and their first scene; locations
       carry INT/EXT and day/night counts; totals agree with the rows;
     · a second run changes nothing; undo removes only what it tagged;
     · summarize() writes nothing;
     · byLocation() (moved here from reports.js) still answers.

       node scripts/test-breakdown.mjs   (or: npm run test:breakdown)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const Scenes = (await import('../src/lib/scenes.js')).default;
const { runBreakdown, summarize } = await import('../src/lib/breakdown-run.js');
const { byLocation } = await import('../src/lib/locations.js');
const { blankElement, SCRIPT_KEY } = await import('../src/lib/script.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const wipe = () => mem.clear();
const seedScript = (elements) => {
  wipe();
  mem.set(SCRIPT_KEY, JSON.stringify({ elements: elements.map((e, i) => blankElement({ id: 'e' + i, ...e })) }));
};
const snapshot = () => JSON.stringify([...mem.entries()].sort());

/* ---- the five-page fixture ----------------------------------- */
const E = (type, text) => ({ type, text });
const FIVE = [
  E('scene', 'INT. CHAI SHOP - DAY'),
  E('action', 'RAVI, 30s, wipes a glass. A TRUCK idles outside, a KNIFE on the counter.'),
  E('character', 'RAVI'),
  E('dialogue', 'One tea. Only one.'),
  E('character', 'MEENA'),
  E('dialogue', 'Then two.'),
  E('scene', 'EXT. BUS STAND - NIGHT'),
  E('action', 'Rain. Meena runs.'),
  E('character', 'MEENA (O.S.)'),
  E('dialogue', 'Wait!'),
  E('scene', 'INT. CHAI SHOP - NIGHT'),
  E('character', 'RAVI'),
  E('dialogue', 'You came back.'),
  E('character', "RAVI (CONT'D)"),
  E('dialogue', 'Stay.'),
  E('scene', 'EXT. ROOFTOP - DAY'),
  E('action', 'Empty. Nobody speaks.')
];

seedScript(FIVE);
const before = snapshot();
const peek = summarize();
eq(snapshot(), before, 'summarize() wrote nothing');
eq(peek.scenes.length, 0, 'before a run there are no scene rows');

const r1 = runBreakdown();
eq(r1.scenes.length, 4, 'every heading is a scene row');
eq(r1.scenes.map((s) => s.number), ['1', '2', '3', '4'], 'numbers in script order');
eq(r1.scenes.map((s) => s.intExt), ['INT', 'EXT', 'INT', 'EXT'], 'INT/EXT from the heading');
eq(r1.scenes.map((s) => s.dayNight), ['DAY', 'NIGHT', 'NIGHT', 'DAY'], 'DAY/NIGHT from the heading');
eq(r1.scenes.map((s) => s.location), ['CHAI SHOP', 'BUS STAND', 'CHAI SHOP', 'ROOFTOP'], 'location from the heading');
ok(r1.scenes.every((s) => /^e\d+$/.test(s.scriptElId)), 'each row is linked to its heading element');
eq(r1.scenes.map((s) => s.scriptElId), ['e0', 'e6', 'e10', 'e15'], 'linked to the RIGHT headings');
eq(r1.applied.scenesAdded, 4, 'applied reports four new scenes');

const castOf = (n) => (r1.scenes.find((s) => s.number === n).elements.cast || []).slice().sort();
eq(castOf('1'), ['Meena', 'Ravi'], 'scene 1 cast from cues');
eq(castOf('2'), ['Meena'], 'scene 2 cast from the O.S. cue');
eq(castOf('3'), ['Ravi'], "scene 3 cast: CONT'D is not a second person");
eq(castOf('4'), [], 'a scene with no cues has no cast');
ok(r1.scenes.every((s) => !(s.elements.props || []).length && !(s.elements.vehicles || []).length),
  'props and vehicles stay suggestions: nothing tagged');
eq(r1.applied.castTagged, 4, 'four cast tags written');

const ravi = r1.characters.find((c) => c.name === 'RAVI');
const meena = r1.characters.find((c) => c.name === 'MEENA');
eq(ravi && ravi.scenes, ['1', '3'], 'RAVI scenes');
eq(ravi && ravi.firstScene, '1', 'RAVI first scene');
eq(meena && meena.scenes, ['1', '2'], 'MEENA scenes');
eq(meena && meena.firstScene, '1', 'MEENA first scene');
ok(ravi && ravi.lines === 3 && ravi.cues === 3, 'RAVI lines and cues: ' + JSON.stringify(ravi));
ok(!r1.characters.find((c) => c.name === 'TRUCK'), 'a prop in capitals is not a character');

const shop = r1.locations.find((l) => l.name === 'CHAI SHOP');
eq(shop.scenes, ['1', '3'], 'CHAI SHOP scenes');
eq(shop.intExt, { INT: 2 }, 'CHAI SHOP INT/EXT');
eq(shop.dayNight, { DAY: 1, NIGHT: 1 }, 'CHAI SHOP day/night split');
eq(r1.locations.length, 3, 'three places');

const t = r1.totals;
eq(t.scenes, 4, 'total scenes');
eq(t.intExt, { INT: 2, EXT: 2 }, 'INT/EXT totals');
eq(t.dayNight, { DAY: 2, NIGHT: 2 }, 'DAY/NIGHT totals');
eq(t.locations, 3, 'location total');
eq(t.cast, 2, 'cast total');
eq(t.eighths, r1.scenes.reduce((n, s) => n + s.eighths, 0), 'pages are the sum of the rows');
eq(t.nightEighths, r1.scenes.filter((s) => s.dayNight === 'NIGHT').reduce((n, s) => n + s.eighths, 0), 'night pages');
ok(t.screenSeconds > 0 && /\d/.test(t.runtime), 'a runtime estimate: ' + t.runtime);
eq(r1.locations.reduce((n, l) => n + l.count, 0), t.scenes, 'location counts add up to the scenes');
eq(r1.locations.reduce((n, l) => n + l.eighths, 0), t.eighths, 'location pages add up to the pages');

/* ---- idempotent ---------------------------------------------- */
const afterOne = snapshot();
const r2 = runBreakdown();
eq(snapshot(), afterOne, 'a second run changed nothing in storage');
eq([r2.applied.scenesAdded, r2.applied.scenesLinked, r2.applied.scenesUpdated, r2.applied.castTagged, r2.applied.binned], [0, 0, 0, 0, 0], 'a second run applies nothing');
eq(r2.totals, r1.totals, 'and the totals are the same');

/* ---- undo removes only what the run tagged ------------------- */
{
  const s2 = Scenes.listScenes().find((s) => s.number === '4');
  Scenes.tagElement(s2.id, 'cast', 'Extra Person');          // a person's own tag
  Scenes.tagElement(s2.id, 'props', 'Lantern');
  const manual = snapshot();
  const n = r1.applied.undo();
  eq(n, 4, 'undo takes the four tags back');
  const after = Scenes.listScenes();
  ok(after.every((s) => !['Ravi', 'Meena'].some((x) => (s.elements.cast || []).includes(x))), 'no cue cast left');
  eq(after.find((s) => s.number === '4').elements.cast, ['Extra Person'], 'a hand-made tag survives');
  eq(after.find((s) => s.number === '4').elements.props, ['Lantern'], 'and so does a prop');
  ok(manual !== snapshot(), 'undo did write');
  eq(after.length, 4, 'the scene rows stay');
}

/* ---- a script that grows: new heading, linked rows untouched -- */
{
  const doc = JSON.parse(mem.get(SCRIPT_KEY));
  doc.elements.push(blankElement({ id: 'x1', type: 'scene', text: 'INT. CHAI SHOP - DAY' }), blankElement({ id: 'x2', type: 'character', text: 'RAVI' }), blankElement({ id: 'x3', type: 'dialogue', text: 'Again.' }));
  mem.set(SCRIPT_KEY, JSON.stringify(doc));
  const r = runBreakdown();
  eq(r.scenes.length, 5, 'a new heading adds one row');
  eq(r.scenes.map((s) => s.number), ['1', '2', '3', '4', '5'], 'numbered 5');
  eq(r.applied.scenesAdded, 1, 'exactly one added');
  eq(r.characters.find((c) => c.name === 'RAVI').scenes, ['1', '3', '5'], 'RAVI now in scene 5 too');
}

/* ---- no headings is no script, not a wipe -------------------- */
{
  seedScript([E('action', 'Just an idea so far.')]);
  Scenes.addScene({ number: '1', location: 'BY HAND' });
  const r = runBreakdown();
  ok(r.applied.empty, 'no headings reads as empty');
  eq(r.scenes.length, 1, 'the hand-made scene stays');
}

/* ---- the Dragon sample --------------------------------------- */
{
  const dragon = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8'));
  seedScript(dragon.elements);
  const headings = dragon.elements.filter((e) => e.type === 'scene' && String(e.text).trim());
  const r = runBreakdown();
  eq(r.scenes.length, headings.length, `Dragon: every one of ${headings.length} headings is a scene`);
  eq(r.scenes.map((s) => s.scriptElId), headings.map((_, i) => 'e' + dragon.elements.indexOf(headings[i])), 'Dragon: scenes follow the script order');
  const ie = (h) => (/^\s*(?:\d+[A-Z]?[.)]?\s+)?(INT|EXT)/i.exec(h.text) || [])[1];
  eq(r.scenes.map((s) => s.intExt.slice(0, 3)), headings.map((h) => (ie(h) || 'INT').toUpperCase()), 'Dragon: INT/EXT follow the headings');
  eq(r.totals.intExt.INT + r.totals.intExt.EXT + (r.totals.intExt['INT/EXT'] || 0), r.scenes.length, 'Dragon: INT/EXT totals add up');
  eq(Object.values(r.totals.dayNight).reduce((a, b) => a + b, 0), r.scenes.length, 'Dragon: DAY/NIGHT totals add up');
  ok(r.totals.cast >= 3 && r.characters.length >= 3, 'Dragon: a cast came out (' + r.totals.cast + ')');
  ok(r.characters.every((c) => c.firstScene !== ''), 'Dragon: every listed character has a first scene');
  ok(r.locations.length >= 3, 'Dragon: locations found (' + r.locations.length + ')');
  eq(r.locations.reduce((n, l) => n + l.count, 0), r.scenes.length, 'Dragon: locations cover every scene');
  const once = snapshot();
  const again = runBreakdown();
  eq(snapshot(), once, 'Dragon: a second run changes nothing');
  eq(again.applied.castTagged, 0, 'Dragon: nothing re-tagged');
  const n = r.applied.undo();
  eq(n, r.applied.castTagged, 'Dragon: undo removes exactly the tags written (' + n + ')');
}

/* ---- byLocation, moved from reports.js ----------------------- */
{
  const rows = byLocation([
    { id: 'a', location: 'Hall', eighths: 8, intExt: 'INT', dayNight: 'DAY' },
    { id: 'b', location: 'hall ', eighths: 4, intExt: 'EXT', dayNight: 'NIGHT' },
    { id: 'c', location: '', eighths: 2, intExt: 'INT', dayNight: 'DAY' }
  ], new Map([['a', '1'], ['b', '2'], ['c', '3']]), 'Unassigned');
  eq(rows.map((r) => [r.name, r.count, r.eighths, r.numbers]), [['Hall', 2, 12, ['1', '2']], ['Unassigned', 1, 2, ['3']]], 'byLocation folds case, sorts longest first');
  eq(rows[0].ie, { INT: 1, EXT: 1 }, 'byLocation INT/EXT');
}

console.log(fail ? `\n${fail} FAILED, ${pass} passed` : `breakdown: ${pass} checks passed`);
process.exit(fail ? 1 : 0);
