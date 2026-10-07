/* ============================================================
   TEST — the Write page's keyboard (src/lib/write-keys.js), in Node
   ------------------------------------------------------------
   Phase 2 of docs/SCREENPLAY-WRITER-PLAN.md. The two presets' digit
   maps, the Return and Tab flow, the empty-element cycle, a custom
   Return choice, the prefs merge that must not clobber the format
   guide's fields, and resolveKey() for every shortcut. Run against
   BOTH the six types script.js ships today and the seven it has once
   `shot` lands, because the module must work either way.
   ============================================================ */
import { mem } from './node-seams.mjs';

const K = await import('../src/lib/write-keys.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

const SIX = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition'];
const SEVEN = [...SIX, 'shot'];
const ev = (patch) => ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...patch });
const alt = (n) => ev({ key: String(n), code: 'Digit' + n, altKey: true });

/* ---- digit maps --------------------------------------------- */
eq(K.digitMap('finaldraft', SEVEN),
  { 1: 'scene', 2: 'action', 3: 'character', 4: 'paren', 5: 'dialogue', 6: 'transition', 7: 'shot' },
  'Final Draft digits, with shot');
eq(K.digitMap('celtx', SEVEN),
  { 1: 'scene', 2: 'action', 3: 'character', 4: 'dialogue', 5: 'paren', 6: 'transition', 7: 'shot', 8: 'action' },
  'Celtx digits, General aliased to action');
eq(K.digitMap('finaldraft', SIX),
  { 1: 'scene', 2: 'action', 3: 'character', 4: 'paren', 5: 'dialogue', 6: 'transition' },
  'Final Draft without shot: 7 unbound');
eq(K.digitMap('celtx', SIX)[7], undefined, 'Celtx without shot: 7 unbound');
eq(K.digitMap('celtx', SIX)[8], 'action', 'Celtx 8 still General → action without shot');
eq(K.digitMap('nonsense', SIX)[4], 'paren', 'an unknown preset falls back to Final Draft');

/* every digit, through resolveKey, both presets */
for (const preset of ['finaldraft', 'celtx']) {
  const map = K.digitMap(preset, SEVEN);
  for (let n = 1; n <= 9; n++) {
    const prefs = K.parsePrefs(JSON.stringify({ keys: { preset } }));
    const got = K.resolveKey(alt(n), { type: 'action', empty: false, prefs, known: SEVEN, ctrlDigits: false });
    eq(got, map[n] ? { kind: 'type', type: map[n] } : null, `${preset} Alt+${n}`);
    // Option on a Mac rewrites e.key; the code is what counts.
    const mac = K.resolveKey(ev({ key: '¡', code: 'Digit' + n, altKey: true }), { type: 'action', empty: false, prefs, known: SEVEN });
    eq(mac, map[n] ? { kind: 'type', type: map[n] } : null, `${preset} Option+${n} with a rewritten e.key`);
    const ctl = ev({ key: String(n), code: 'Digit' + n, ctrlKey: true });
    eq(K.resolveKey(ctl, { type: 'action', empty: false, prefs, known: SEVEN, ctrlDigits: false }), null,
      `${preset} Ctrl+${n} left to the browser by default`);
    eq(K.resolveKey(ctl, { type: 'action', empty: false, prefs, known: SEVEN, ctrlDigits: true }),
      map[n] ? { kind: 'type', type: map[n] } : null, `${preset} Ctrl+${n} taken when ctrlDigits`);
    eq(K.resolveKey(ev({ key: String(n), code: 'Digit' + n, metaKey: true }), { type: 'action', empty: false, prefs, known: SEVEN, ctrlDigits: true }),
      map[n] ? { kind: 'type', type: map[n] } : null, `${preset} Cmd+${n} taken when ctrlDigits`);
  }
}

/* ---- Return ------------------------------------------------- */
const RET = { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene', shot: 'action' };
const fd = K.parsePrefs(null);
for (const [from, to] of Object.entries(RET)) {
  eq(K.resolveKey(ev({ key: 'Enter' }), { type: from, empty: false, prefs: fd, known: SEVEN }),
    { kind: 'return', op: 'insert', type: to }, `Return after ${from}`);
}
eq(K.returnNext('shot', fd, SIX), 'action', 'Return after an unknown type is action');
eq(K.returnTable(fd, SIX), { scene: 'action', action: 'action', character: 'dialogue', paren: 'dialogue', dialogue: 'action', transition: 'scene' }, 'Return table, six types');
eq(K.resolveKey(ev({ key: 'Enter', shiftKey: true }), { type: 'action', empty: false, prefs: fd, known: SIX }), null, 'Shift+Return is a line break, not ours');

/* empty element: cycle in place, in the PRESET's order */
eq(K.cycleOrder('finaldraft', SEVEN), ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'], 'FD cycle order');
eq(K.cycleOrder('celtx', SEVEN), ['scene', 'action', 'character', 'dialogue', 'paren', 'transition', 'shot'], 'Celtx cycle order, General de-duplicated');
eq(K.cycleOrder('finaldraft', SIX), SIX, 'FD cycle without shot');
eq(K.resolveKey(ev({ key: 'Enter' }), { type: 'action', empty: true, prefs: fd, known: SIX }), { kind: 'return', op: 'change', type: 'character' }, 'empty action cycles to character');
eq(K.cycleNext('transition', 'finaldraft', SIX), 'scene', 'cycle wraps without shot');
eq(K.cycleNext('transition', 'finaldraft', SEVEN), 'shot', 'cycle reaches shot when it exists');
eq(K.cycleNext('character', 'celtx', SIX), 'dialogue', 'Celtx: character → dialogue');
eq(K.cycleNext('character', 'finaldraft', SIX), 'paren', 'FD: character → paren');

/* ---- Tab ---------------------------------------------------- */
const tab = (type, empty, shift) => K.resolveKey(ev({ key: 'Tab', shiftKey: !!shift }), { type, empty, prefs: fd, known: SIX });
eq(tab('action', true), { kind: 'tab', op: 'change', type: 'character' }, 'Tab: empty action → character');
eq(tab('action', false), null, 'Tab: filled action is not ours (focus moves on)');
eq(tab('character', false), { kind: 'tab', op: 'insert', type: 'paren' }, 'Tab: character → paren');
eq(tab('character', true), { kind: 'tab', op: 'change', type: 'transition' }, 'Tab: empty character → transition');
eq(tab('paren', false), { kind: 'tab', op: 'insert', type: 'dialogue' }, 'Tab: paren → dialogue');
eq(tab('paren', true), { kind: 'tab', op: 'change', type: 'dialogue' }, 'Tab: empty paren becomes dialogue');
eq(tab('dialogue', false), { kind: 'tab', op: 'insert', type: 'paren' }, 'Tab: dialogue → paren');
eq(tab('scene', false), null, 'Tab: scene heading not ours');
eq(tab('transition', true), null, 'Tab: transition not ours');
eq(tab('character', true, true), { kind: 'tab', op: 'change', type: 'action' }, 'Shift+Tab: character → action');
eq(tab('transition', true, true), { kind: 'tab', op: 'change', type: 'character' }, 'Shift+Tab: transition → character');
eq(tab('paren', false, true), { kind: 'tab', op: 'change', type: 'character' }, 'Shift+Tab: paren → character');
eq(tab('dialogue', false, true), { kind: 'tab', op: 'change', type: 'paren' }, 'Shift+Tab: dialogue → paren');
eq(tab('action', false, true), null, 'Shift+Tab: action not ours');

/* ---- the other shortcuts ------------------------------------ */
const ctx = { type: 'character', empty: false, prefs: fd, known: SIX };
eq(K.resolveKey(ev({ key: 'd', code: 'KeyD', altKey: true }), ctx), { kind: 'dual' }, 'Alt+D dual');
eq(K.resolveKey(ev({ key: '∂', code: 'KeyD', altKey: true }), ctx), { kind: 'dual' }, 'Option+D dual (Mac e.key)');
eq(K.resolveKey(ev({ key: 'd', code: 'KeyD', ctrlKey: true }), ctx), null, 'Ctrl+D stays the theme cycle');
eq(K.resolveKey(ev({ key: 'K', code: 'KeyK', ctrlKey: true, shiftKey: true }), ctx), { kind: 'note' }, 'Ctrl+Shift+K note');
eq(K.resolveKey(ev({ key: 'k', code: 'KeyK', metaKey: true, shiftKey: true }), ctx), { kind: 'note' }, 'Cmd+Shift+K note');
eq(K.resolveKey(ev({ key: 'S', code: 'KeyS', ctrlKey: true, shiftKey: true }), ctx), { kind: 'navigator' }, 'Ctrl+Shift+S navigator');
eq(K.resolveKey(ev({ key: 'F', code: 'KeyF', ctrlKey: true, shiftKey: true }), ctx), null, 'Ctrl+Shift+F is focus mode\'s, not ours');
eq(K.resolveKey(ev({ key: 'k', code: 'KeyK', ctrlKey: true }), ctx), null, 'Ctrl+K is the palette\'s');
eq(K.resolveKey(ev({ key: 'a', code: 'KeyA' }), ctx), null, 'a letter is not ours');

/* ---- custom Return + prefs merge ---------------------------- */
mem.clear();
mem.set(K.WRITE_PREFS_KEY, JSON.stringify({ guide: { hints: false }, keys: { preset: 'finaldraft' } }));
let p = K.saveWritePrefs({ preset: 'celtx' });
eq(p.preset, 'celtx', 'preset saved');
p = K.saveWritePrefs({ returnNext: { dialogue: 'character' } });
eq(K.returnNext('dialogue', p, SIX), 'character', 'custom Return: dialogue → character');
eq(K.resolveKey(ev({ key: 'Enter' }), { type: 'dialogue', empty: false, prefs: p, known: SIX }),
  { kind: 'return', op: 'insert', type: 'character' }, 'resolveKey honours the custom Return');
eq(K.returnNext('scene', p, SIX), 'action', 'other Returns keep the default');
let stored = JSON.parse(mem.get(K.WRITE_PREFS_KEY));
eq(stored.guide, { hints: false }, 'the format guide\'s field survives every write');
eq(stored.keys, { preset: 'celtx', ctrlDigits: false, returnNext: { dialogue: 'character' } }, 'stored keys hold only what changed');
p = K.saveWritePrefs({ returnNext: { dialogue: 'action' } });
stored = JSON.parse(mem.get(K.WRITE_PREFS_KEY));
eq(stored.keys.returnNext, undefined, 'choosing the default again drops the override');
eq(stored.guide, { hints: false }, 'still not clobbered');
p = K.saveWritePrefs({ returnNext: { scene: 'shot' } });
eq(K.returnNext('scene', p, SIX), 'action', 'a custom Return to an unknown type falls back to the default');
eq(K.returnNext('scene', p, SEVEN), 'shot', '…and takes effect once shot exists');
eq(K.parsePrefs('{not json').preset, 'finaldraft', 'corrupt prefs read as defaults');
eq(K.parsePrefs('[1,2]').preset, 'finaldraft', 'an array reads as defaults');
eq(K.mergePrefs('{"keys":{"preset":"celtx"},"x":1}', { ctrlDigits: true }), '{"keys":{"preset":"celtx","ctrlDigits":true},"x":1}', 'merge keeps unknown top-level fields');
const before = mem.get(K.WRITE_PREFS_KEY);
K.loadWritePrefs();
eq(mem.get(K.WRITE_PREFS_KEY), before, 'loading writes nothing');

/* ---- the sheet rows ----------------------------------------- */
const rows = K.shortcutRows(K.parsePrefs('{"keys":{"preset":"celtx"}}'), SIX, false);
eq(rows.preset, 'Celtx', 'sheet names the preset');
ok(rows.rows[3].label === 'Dialogue', 'Celtx sheet row 4 is Dialogue');
ok(rows.rows[6].off === true, 'shot row is marked off without shot');
ok(/as Action/.test(rows.rows[7].label), 'General row says it writes Action');

/* ---- SmartType's pure half (src/ui/smarttype.js) ----------- */
const ST = await import('../src/ui/smarttype.js');
const els = [
  { id: 'a', type: 'scene', text: 'INT. POLICE STATION - NIGHT' },
  { id: 'b', type: 'character', text: 'MARAN' },
  { id: 'c', type: 'character', text: 'ANBU (V.O.)' },
  { id: 'd', type: 'character', text: "MARAN (CONT'D)" },
  { id: 'e', type: 'scene', text: 'EXT. ENGINEERING COLLEGE - QUAD - DUSK' },
  { id: 'f', type: 'scene', text: 'INT. POLICE STATION - DAY' },
  { id: 'g', type: 'character', text: 'MA' }
];
const ix = ST.createIndex();
ix.ensure(els);
const labels = (r) => r.items.map((i) => i.label);
eq(ST.parseHeading('EXT. ENGINEERING COLLEGE - QUAD - DUSK'), { intro: 'EXT.', location: 'ENGINEERING COLLEGE - QUAD', time: 'DUSK' }, 'heading: last separator starts the time');
eq(ST.parseHeading('INT. HALL - DAY (2014)').time, 'DAY', 'heading: a year after the time is not part of it');
eq(ST.cueName("MARAN (CONT'D)"), 'MARAN', 'cue name drops the extension');
eq(labels(ST.suggest('scene', 'i', ix)), ['INT.', 'INT./EXT.'], 'scene: intros');
eq(labels(ST.suggest('scene', '', ix)), [], 'scene: nothing on an empty line (Return keeps cycling)');
eq(labels(ST.suggest('scene', 'INT. ', ix)), ['POLICE STATION', 'ENGINEERING COLLEGE - QUAD'], 'scene: learned locations, most used first');
eq(ST.suggest('scene', 'int. po', ix).items[0].value, 'INT. POLICE STATION - ', 'scene: a location accepts with the separator');
eq(ST.suggest('scene', 'int. po', ix).items[0].chain, true, 'scene: and chains to the time');
eq(labels(ST.suggest('scene', 'INT. POLICE STATION - ', ix)).slice(0, 3), ['DAY', 'NIGHT', 'CONTINUOUS'], 'scene: times after " - "');
eq(ST.suggest('scene', 'INT. POLICE STATION - ni', ix).items[0].value, 'INT. POLICE STATION - NIGHT', 'scene: time by prefix');
eq(labels(ST.suggest('scene', 'EXT. ENGINEERING COLLEGE - Q', ix)), ['ENGINEERING COLLEGE - QUAD'], 'scene: a location with a dash in it still matches');
ok(ST.suggest('scene', 'INT. POLICE STATION - DAY', ix).exact, 'scene: a complete time is exact (no pre-selection)');
eq(labels(ST.suggest('character', 'ma', ix, 'g')), ['MARAN'], 'cue: names by prefix, own cue excluded');
eq(labels(ST.suggest('character', 'ma', ix, 'zz')), ['MARAN'], 'cue: "MA" itself never offered (it is not longer than typed)');
eq(labels(ST.suggest('character', '', ix)), [], 'cue: nothing on empty');
const names = ix.ranked('name');
eq(names[0], 'MARAN', 'cue: most frequent first');
ok(ST.suggest('character', 'MARAN', ix).exact, 'cue: a known name typed in full is exact, so Return goes to dialogue');
eq(labels(ST.suggest('character', 'MARAN ', ix)).slice(-4), ['(V.O.)', '(O.S.)', '(O.C.)', "(CONT'D)"], 'cue: extensions after a known name');
eq(ST.suggest('character', 'MARAN (o', ix).items.map((i) => i.value), ['MARAN (O.S.)', 'MARAN (O.C.)'], 'cue: extension by prefix');
eq(labels(ST.suggest('transition', 'c', ix)), ['CUT TO:'], 'transition: CUT TO:');
eq(labels(ST.suggest('transition', 'f', ix)), ['FADE OUT.', 'FADE IN:'], 'transition: FADE');
eq(labels(ST.suggest('action', 'MA', ix)), [], 'action: no suggestions');
// incremental: an edit moves one contribution, a deletion needs invalidate()
els[1].text = 'MARANAN'; ix.noteEdit(els[1]);
eq(ix.ranked('name').includes('MARANAN'), true, 'noteEdit adds the new name');
eq(ix.ranked('name').filter((n) => n === 'MARAN').length, 1, 'and keeps MARAN while another cue has it');
// cost on the 2,361-element sample
const sample = (await import('../src/data/sample.dragon.script.json')).default.elements.map((e, i) => ({ id: 's' + i, ...e }));
const big = ST.createIndex();
let t0 = performance.now();
big.ensure(sample);
const build = performance.now() - t0;
t0 = performance.now();
for (let i = 0; i < 200; i++) ST.suggest('character', 'ra', big, 's1');
/* The Characters list's names come after the script's own cues, and a
   name a cue already says is not offered twice. */
{
  const base = labels(ST.suggest('character', 'ma', ix, 'g', null));
  eq(labels(ST.suggest('character', 'ma', ix, 'g', ['MALINI', 'maran'])), base.concat(['MALINI']), 'cue: Characters-list names after the cues, no duplicates');
  ok(base.length && !base.includes('MALINI'), 'cue: no extra names is the old behaviour');
}
{
  const sheet = K.shortcutRows(K.parsePrefs(null), SIX, false).rows;
  ok(sheet.some((r) => r.keys.includes('Alt/⌥ T') && /Tamil typing/.test(r.label)), 'the sheet documents Alt+T, Tamil typing');
  const taken = sheet.filter((r) => r.keys.includes('Alt/⌥ T'));
  eq(taken.length, 1, 'Alt+T is bound once');
  ok(!K.resolveKey({ key: 't', code: 'KeyT', altKey: true }, { type: 'dialogue', empty: false, known: SIX }), 'Alt+T is not a write-keys binding (tamil-type.js owns it)');
}
const per = (performance.now() - t0) / 200;
ok(build < 50, 'index build on the sample ' + build.toFixed(1) + 'ms');
ok(per < 5, 'one suggestion on the sample ' + per.toFixed(2) + 'ms');
console.log(`  smarttype on the sample: build ${build.toFixed(1)}ms, a suggestion ${per.toFixed(2)}ms`);

console.log(`test:keys — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
