/* ============================================================
   THE SCRIPT ANALYSIS MODEL — src/lib/script-analysis-model.js
   ------------------------------------------------------------
   Pure, so asserted in Node on a fixture and on the Dragon sample:
     · one row per heading, in order, with pages, position and act;
     · tension is the story.js lexical read per scene, the convention
       beside it, a peak, a smoothed line, and slack flags that fire on
       a run of quiet scenes and not on an even script;
     · pacing: buckets add up, acts add up, long runs are relative to
       the script's own median;
     · cast: first/last scene, scenes shared;
     · structure: every beat of the framework with a target page and
       the scene on it;
     · the AI prompt names every scene, and the reader drops notes on
       scenes that do not exist;
     · nothing is written to storage.

       node scripts/test-analysis.mjs   (or: npm run test:analysis)
   ============================================================ */
import { mem } from './node-seams.mjs';
import { readFileSync } from 'node:fs';

const A = await import('../src/lib/script-analysis-model.js');
const { frameworkById } = await import('../src/lib/story.js');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const E = (type, text, id) => ({ id: id || Math.random().toString(36).slice(2), type, text });

/* ---- a small fixture -------------------------------------------- */
const calm = 'He pours the tea. The kettle sings. Morning light on the wall, and the street outside is slow and kind today.';
const hot = 'Gun! He fights. Blood. They chase him. Kill him! Danger, fear, a scream. He escapes the trap.';
const els = [];
for (let n = 1; n <= 8; n++) {
  els.push(E('scene', (n % 2 ? 'INT. HOUSE' : 'EXT. STREET') + ' - ' + (n % 3 ? 'DAY' : 'NIGHT'), 'h' + n));
  els.push(E('action', n >= 7 ? hot : calm));
  els.push(E('character', n % 2 ? 'RAVI' : 'MEENA'));
  els.push(E('dialogue', n >= 7 ? 'Run!' : 'Good morning.'));
  if (n === 4 || n === 8) { els.push(E('character', 'RAVI (V.O.)')); els.push(E('dialogue', 'Again.')); }
}
mem.clear();
const before = JSON.stringify([...mem.entries()]);
const a = A.analyseScript({ elements: els, scenes: [{ id: 's3', number: '3A', scriptElId: 'h3' }] });
ok(JSON.stringify([...mem.entries()]) === before, 'analyseScript writes nothing');
eq(a.scenes.length, 8, 'one row per heading');
eq(a.scenes.map((r) => r.number), ['1', '2', '3A', '4', '5', '6', '7', '8'], 'numbers: the scene row\'s own, else the order');
ok(a.scenes.every((r, i) => i === 0 || r.pos > a.scenes[i - 1].pos), 'positions rise through the script');
ok(a.scenes[0].region === 'Act 1' && a.scenes[7].region === 'Act 3', 'acts by position');
eq(a.totals.eighths, a.scenes.reduce((n, r) => n + r.eighths, 0), 'total eighths add up');
ok(a.totals.seconds > 0, 'screen time is estimated');

const t = a.tension;
ok(a.scenes[7].tension > a.scenes[0].tension, 'a conflict scene reads higher than a calm one');
ok(t.peak && Number(t.peak.number) >= 7, 'the peak is in the last scenes (' + (t.peak && t.peak.number) + ')');
ok(t.points.every((p) => Number.isFinite(p.expected)), 'every point carries the convention');
ok(t.points.every((p) => p.smooth != null), 'a smoothed value per scene');
ok(t.flags.some((f) => f.kind === 'slack'), 'a run of calm scenes is flagged slack');
ok(!t.flags.some((f) => f.kind === 'peak'), 'no early-peak flag when the peak is late');

const p = a.pacing;
eq(p.buckets.reduce((n, b) => n + b.count, 0), 8, 'length buckets add up to the scenes');
eq(p.acts.reduce((n, x) => n + x.scenes, 0), 8, 'acts add up to the scenes');
ok(p.longLine >= 16, 'long is at least two pages');
ok(['even', 'varied', 'very uneven'].includes(p.rhythm), 'a rhythm word');

const c = a.cast;
const ravi = c.characters.find((x) => x.name === 'RAVI');
eq(ravi && ravi.scenes, 6, 'RAVI is in his six scenes (V.O. folds into the name)');
eq(ravi.first, '1', 'RAVI first appears in scene 1');
ok(c.together.some((x) => [x.a, x.b].sort().join() === 'MEENA,RAVI'), 'shared scenes are counted');

const s = a.structure;
eq(s.beats.length, frameworkById(a.framework).beats.length, 'every beat of the framework');
ok(s.beats.every((b) => b.targetPage >= 1 && b.scene), 'each beat has a target page and the scene on it');

/* ---- an even script raises no slack ------------------------------- */
const even = [];
for (let n = 1; n <= 10; n++) { even.push(E('scene', 'INT. ROOM ' + n + ' - DAY')); even.push(E('action', calm)); }
const ev = A.analyseScript({ elements: even });
ok(!ev.tension.flags.some((f) => f.kind === 'slack'), 'an even script is not called slack against itself');
ok(ev.tension.flags.some((f) => f.kind === 'flat'), 'but it is called flat');
ok(!ev.pacing.flags.some((f) => f.kind === 'long-run'), 'scenes of one length are no long run');

/* ---- empty ----------------------------------------------------------- */
const none = A.analyseScript({ elements: [E('action', 'Notes.')] });
eq(none.scenes.length, 0, 'no headings: no rows');
eq(none.tension.flags, [], 'no headings: no flags');

/* ---- the AI action's two pure halves -------------------------------- */
const prompt = A.buildTensionNotesPrompt(a, { title: 'Fixture' });
ok(a.scenes.every((r) => prompt.includes('\n' + r.number + ' | ')), 'the prompt lists every scene');
ok(/RAVI \| /.test(prompt), 'the prompt lists the cast');
const read = A.readTensionNotes({ summary: 'Builds late.', notes: [
  { kind: 'tension', scene: '7', note: 'The chase lifts it.' },
  { kind: 'arc', scene: '99', note: 'Not a scene.' },
  { kind: 'arc', scene: '3A', character: 'ravi', note: 'Ravi goes quiet.' }
] }, a);
eq(read.notes.length, 2, 'a note on a scene that does not exist is dropped');
eq(read.dropped, 1, '…and counted');
eq(read.notes[1].character, 'RAVI', 'a character is matched by name');
ok(/Nothing was changed/.test(A.tensionNotesText(read)), 'the read text says it changed nothing');
ok(A.tensionNotesSchema().required.includes('notes'), 'a schema for the reply');

/* ---- the Dragon sample ------------------------------------------------ */
const dragon = JSON.parse(readFileSync(new URL('../src/data/sample.dragon.script.json', import.meta.url), 'utf8'));
const d = A.analyseScript({ elements: dragon.elements, format: 'feature' });
const heads = dragon.elements.filter((e) => e.type === 'scene' && String(e.text).trim()).length;
eq(d.scenes.length, heads, 'Dragon: one row per heading');
ok(d.cast.characters.length >= 8, 'Dragon: the cast (' + d.cast.characters.length + ')');
ok(d.totals.seconds > 3600, 'Dragon: over an hour on screen');
ok(!d.pacing.flags.some((f) => f.kind === 'long-run' && f.to - f.from > 20), 'Dragon: no "long run" covering the whole script');

console.log(`\ntest:analysis — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
