/* ============================================================
   TEST — the writing helpers' pure halves, in Node (wave 2, L5)
   ------------------------------------------------------------
   read-aloud.js   which lines are read, by whom; voice assignment
   macros.js       the key, the list's parsing, a macro's plan
   dictation-model spoken "new line" and marks, and what ends a line
   name-spell.js   suspects, the fix as ONE replaceAll, spellcheck types
   No speechSynthesis, no microphone, no DOM.
   ============================================================ */
import { mem } from './node-seams.mjs';   // eslint-disable-line no-unused-vars

const RA = await import('../src/lib/read-aloud.js');
const MC = await import('../src/lib/macros.js');
const DM = await import('../src/lib/dictation-model.js');
const NS = await import('../src/lib/name-spell.js');
const Keys = await import('../src/lib/write-keys.js');

let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.error('  ✗', msg); } };
const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), msg + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));

const script = () => [
  { id: 's1', type: 'scene', text: 'INT. KITCHEN - DAY' },
  { id: 'a1', type: 'action', text: 'Preethi stirs the pot.' },
  { id: 'c1', type: 'character', text: 'PREETHI' },
  { id: 'p1', type: 'paren', text: '(whispering)' },
  { id: 'd1', type: 'dialogue', text: 'He is late again.' },
  { id: 'c2', type: 'character', text: 'RAVI (CONT\'D)' },
  { id: 'd2', type: 'dialogue', text: 'I know.' },
  { id: 'a2', type: 'action', text: 'A door slams.' },
  { id: 'd3', type: 'dialogue', text: 'Orphan line.' },
  { id: 's2', type: 'scene', text: 'EXT. ROAD - NIGHT' },
  { id: 'a3', type: 'action', text: 'Rain.' },
  { id: 'c3', type: 'character', text: 'PREETHI' },
  { id: 'd4', type: 'dialogue', text: 'Where are you?' }
];

/* ---- read aloud: what is read -------------------------------- */
{
  const u = RA.utterancesFor(script(), { scope: 'all' });
  eq(u.map((x) => x.id), ['s1', 'a1', 'p1', 'd1', 'd2', 'a2', 'd3', 's2', 'a3', 'd4'], 'all: cues are never read; everything else is, in order');
  eq(u.find((x) => x.id === 'd1'), { id: 'd1', index: 4, role: 'speaker', speaker: 'PREETHI', text: 'He is late again.' }, 'dialogue belongs to its cue');
  eq(u.find((x) => x.id === 'd2').speaker, 'RAVI', "a cue's (CONT'D) is not part of the speaker");
  eq(u.find((x) => x.id === 'p1'), { id: 'p1', index: 3, role: 'narrator', speaker: '', text: 'whispering' }, 'a parenthetical is narrated, without its brackets');
  eq(u.find((x) => x.id === 'd3').role, 'narrator', 'dialogue after action with no cue is the narrator\'s');
  eq(RA.utterancesFor(script(), { scope: 'all', skipParens: true }).some((x) => x.id === 'p1'), false, 'skip parentheticals');
  eq(RA.utterancesFor(script(), { scope: 'scene', from: 4 }).map((x) => x.id), ['s1', 'a1', 'p1', 'd1', 'd2', 'a2', 'd3'], 'scene: back to the heading, up to the next one');
  eq(RA.utterancesFor(script(), { scope: 'scene', from: 12 }).map((x) => x.id), ['s2', 'a3', 'd4'], 'the last scene runs to the end');
  const mid = RA.utterancesFor(script(), { scope: 'cursor', from: 4 });
  eq(mid[0].id, 'd1', 'cursor: starts at the caret line');
  eq(mid[0].speaker, 'PREETHI', 'a read that starts mid-speech knows whose it is');
  eq(RA.utterancesFor([], {}), [], 'an empty script reads nothing');
  eq(RA.utterancesFor([{ id: 'x', type: 'dialogue', text: '   ' }], { scope: 'all' }), [], 'blank lines are skipped');
  eq(RA.castOf(script()), ['PREETHI', 'RAVI'], 'the cast, once each, in order');
}

/* ---- read aloud: chunks -------------------------------------- */
{
  eq(RA.chunk('Short. Two sentences!'), ['Short. Two sentences!'], 'short text is one chunk');
  const long = ('Word '.repeat(30) + 'end. ').repeat(4);
  const c = RA.chunk(long, 220);
  ok(c.length >= 2 && c.every((x) => x.length <= 220), 'long text is cut under the limit: ' + c.map((x) => x.length));
  eq(c.join(' ').replace(/\s+/g, ' '), long.replace(/\s+/g, ' ').trim(), 'nothing is lost in the cut');
  eq(RA.chunk('x'.repeat(500), 200).every((x) => x.length <= 200), true, 'a word longer than the limit is still cut');
  eq(RA.chunk('   '), [], 'blank is no chunk');
}

/* ---- read aloud: voices -------------------------------------- */
{
  const V = (n, lang) => ({ voiceURI: 'uri:' + n, name: n, lang });
  const voices = [V('Alex', 'en-US'), V('Priya', 'en-IN'), V('Daniel', 'en-GB'), V('Karen', 'en-AU'), V('Kanya', 'ta-IN'), V('Anna', 'de-DE')];
  eq(RA.pickNarrator(voices, 'en-IN').name, 'Priya', 'the narrator speaks the exact language when it can');
  eq(RA.pickNarrator(voices, 'en-ZA').lang.startsWith('en'), true, 'else the language');
  eq(RA.pickNarrator(voices, 'ta').name, 'Kanya', 'a bare language code');
  eq(RA.pickNarrator(voices, 'en-IN', 'uri:Anna').name, 'Anna', "the writer's pick wins while it is listed");
  eq(RA.pickNarrator(voices, 'en-IN', 'uri:gone').name, 'Priya', 'a pick the browser no longer lists is ignored');
  eq(RA.pickNarrator([], 'en'), null, 'no voices, no narrator');

  const names = ['RAVI', 'PREETHI', 'MEERA'];
  const a = RA.assignVoices(names, voices, {}, 'uri:Priya');
  eq(Object.keys(a).sort(), ['MEERA', 'PREETHI', 'RAVI'], 'a voice for every name');
  ok(Object.values(a).every((u) => u !== 'uri:Priya'), 'the narrator is not also a character');
  ok(Object.values(a).every((u) => voices.find((v) => v.voiceURI === u).lang.startsWith('en')), "characters take voices in the narrator's language");
  eq(new Set(Object.values(a)).size, 3, 'no two characters share while voices remain');
  eq(RA.assignVoices(['PREETHI', 'RAVI', 'MEERA'], voices, {}, 'uri:Priya'), a, 'the same cast gets the same voices, whatever the order given');
  const picked = RA.assignVoices(names, voices, { RAVI: 'uri:Anna', MEERA: 'uri:gone' }, 'uri:Priya');
  eq(picked.RAVI, 'uri:Anna', 'a chosen voice is kept');
  ok(picked.MEERA !== 'uri:gone', 'a chosen voice that is gone falls back to automatic');
  ok(picked.PREETHI !== 'uri:Anna', 'an automatic voice avoids the one the writer chose');
  const many = RA.assignVoices(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'], voices, {}, 'uri:Priya');
  eq(Object.keys(many).length, 8, 'more characters than voices still all get one');
  eq(RA.assignVoices(['A'], [], {}, ''), {}, 'no voices, no assignment');
  eq(RA.parseReadPrefs(null), { skipParens: false, narrator: '', voices: {}, rate: 1 }, 'prefs default');
  eq(RA.parseReadPrefs({ skipParens: true, voices: { A: 'x', B: 5 }, rate: 9, junk: 1 }), { skipParens: true, narrator: '', voices: { A: 'x' }, rate: 1 }, 'prefs are cleaned');
}

/* ---- macros -------------------------------------------------- */
{
  const ev = (patch) => ({ key: '', code: '', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, ...patch });
  eq(MC.macroSlotOf(ev({ code: 'Digit3', altKey: true, shiftKey: true, key: '#' })), 3, 'Alt+Shift+3');
  eq(MC.macroSlotOf(ev({ code: 'Digit3', altKey: true, shiftKey: true, key: '£' })), 3, 'Option+Shift+3 with a rewritten key, by code');
  eq(MC.macroSlotOf(ev({ code: 'Numpad7', altKey: true, shiftKey: true })), 7, 'the numpad');
  eq(MC.macroSlotOf(ev({ code: 'Digit3', altKey: true })), 0, 'Alt+3 alone is the element type, not a macro');
  eq(MC.macroSlotOf(ev({ code: 'Digit3', ctrlKey: true, shiftKey: true })), 0, 'Ctrl+Shift+3 is left to the browser');
  eq(MC.macroSlotOf(ev({ code: 'Digit3', ctrlKey: true, altKey: true, shiftKey: true })), 0, 'Ctrl+Alt+Shift is AltGr on many layouts: not ours');
  eq(MC.macroSlotOf(ev({ code: 'Digit0', altKey: true, shiftKey: true })), 0, '0 is not a slot');
  // through resolveKey, where the editor asks
  const prefs = Keys.parsePrefs(null);
  const known = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'];
  const ctx = { type: 'action', empty: false, prefs, known, ctrlDigits: false };
  eq(Keys.resolveKey(ev({ code: 'Digit2', altKey: true, shiftKey: true }), ctx), { kind: 'macro', slot: 2 }, 'resolveKey: Alt+Shift+2 is macro 2');
  eq(Keys.resolveKey(ev({ code: 'Digit2', altKey: true }), ctx), { kind: 'type', type: 'action' }, 'resolveKey: Alt+2 is still the type');

  eq(MC.parseMacros(undefined), MC.DEFAULT_MACROS, 'no pref is the defaults');
  eq(MC.parseMacros('junk'), MC.DEFAULT_MACROS, 'a pref that is not a list is the defaults');
  eq(MC.parseMacros([]), [], 'an empty list stays empty');
  eq(MC.storableMacros(MC.DEFAULT_MACROS), undefined, 'the defaults store nothing');
  eq(MC.storableMacros([]), [], 'cleared macros store an empty list');
  const dirty = MC.parseMacros([
    { slot: 2, label: ' x ', text: 'Hi', where: 'caret' },
    { slot: 2, text: 'dup' },
    { slot: 12, text: 'out of range' },
    { slot: 3, text: '   ' },
    { slot: 4, text: 'NEW', where: 'new', type: 'bogus' },
    { slot: 5, text: 'T', where: 'new', type: 'transition' },
    { slot: 6, text: 'E', where: 'nope', type: 'paren' },
    null, 7
  ]);
  eq(dirty, [
    { slot: 2, label: 'x', text: 'Hi', where: 'caret', type: '' },
    { slot: 4, label: 'NEW', text: 'NEW', where: 'new', type: 'action' },
    { slot: 5, label: 'T', text: 'T', where: 'new', type: 'transition' },
    { slot: 6, label: 'E', text: 'E', where: 'caret', type: '' }
  ], 'parse: one per slot, blank and out-of-range dropped, targets repaired to something writable');

  const D = MC.DEFAULT_MACROS;
  const by = (n) => MC.macroForSlot(D, n);
  eq(MC.planMacro(by(1), { type: 'dialogue', text: 'Hello.' }, null), { op: 'new', type: 'paren', text: '(beat)', convert: false }, '(beat) after a speech is a new parenthetical');
  eq(MC.planMacro(by(1), { type: 'dialogue', text: '' }, null).convert, true, 'on an empty line the line becomes it');
  eq(MC.planMacro(by(2), { type: 'scene', text: 'INT. KITCHEN - DAY' }, null), { op: 'edit', text: 'INT. KITCHEN - CONTINUOUS', caret: 25 }, 'CONTINUOUS replaces the time of day');
  eq(MC.planMacro(by(2), { type: 'scene', text: 'INT. KITCHEN' }, null).text, 'INT. KITCHEN - CONTINUOUS', 'CONTINUOUS joins a heading with none');
  eq(MC.planMacro(by(2), { type: 'scene', text: 'INT. KITCHEN - CONTINUOUS' }, null).text, 'INT. KITCHEN - CONTINUOUS', 'it never doubles');
  eq(MC.planMacro(by(2), { type: 'scene', text: 'INT. BAR - BACK ROOM' }, null).text, 'INT. BAR - BACK ROOM - CONTINUOUS', 'a dash that is part of the place stays');
  eq(MC.planMacro(by(4), { type: 'character', text: 'PREETHI' }, null).text, 'PREETHI (V.O.)', '(V.O.) on a cue');
  eq(MC.planMacro(by(3), { type: 'action', text: 'x' }, null), { op: 'new', type: 'transition', text: 'CUT TO:', convert: false }, 'CUT TO: is a new transition');
  const caretMacro = { slot: 1, label: 'n', text: 'XX', where: 'caret', type: '' };
  eq(MC.planMacro(caretMacro, { type: 'action', text: 'abcdef' }, { start: 2, end: 4 }), { op: 'edit', text: 'abXXef', caret: 4 }, 'caret macro replaces the selection');
  eq(MC.planMacro(caretMacro, { type: 'action', text: 'abc' }, null).text, 'abcXX', 'no caret: at the end');
  eq(MC.planMacro(null, { type: 'action', text: '' }, null), null, 'no macro, no plan');
}

/* ---- dictation ----------------------------------------------- */
{
  eq(DM.splitSpoken(''), [], 'nothing heard');
  eq(DM.splitSpoken('Preethi says hello'), [{ text: 'Preethi says hello', newLine: false }], 'plain speech is one part');
  eq(DM.splitSpoken('new line'), [{ text: '', newLine: true }], 'the command alone');
  eq(DM.splitSpoken('New line.'), [{ text: '', newLine: true }], 'the recogniser\'s own full stop does not hide it');
  eq(DM.splitSpoken('Preethi says hello new line'), [{ text: 'Preethi says hello', newLine: true }], 'a trailing command ends the line');
  eq(DM.splitSpoken('next line she smiles'), [{ text: '', newLine: true }, { text: 'she smiles', newLine: false }], 'a leading command ends the line before');
  eq(DM.splitSpoken('she draws a new line of chalk').length, 1, 'a "new line" in the middle of a sentence is words');
  eq(DM.splitSpoken('hello comma world question mark'), [{ text: 'hello, world?', newLine: false }], 'marks');
  eq(DM.splitSpoken('a period drama'), [{ text: 'a period drama', newLine: false }], '"period" mid-phrase is a word');
  eq(DM.splitSpoken('well period'), [{ text: 'well.', newLine: false }], '"period" last is the mark');
  eq(DM.splitSpoken('new line', 'ta-IN'), [{ text: 'new line', newLine: false }], 'other languages are inserted as heard');
  eq(DM.shouldBreak({ text: 'x', newLine: true }, () => false), true, 'a spoken break always breaks');
  eq(DM.shouldBreak({ text: 'PREETHI says hi', newLine: false }, (t) => /says/.test(t)), true, 'a pause breaks when the auto-format has work');
  eq(DM.shouldBreak({ text: 'prose', newLine: false }, () => false), false, 'a pause in plain prose does not');
  eq(DM.dictationSupported(), false, 'no recogniser in Node');
  ok(DM.DICTATION_NOTICE.body.includes('Google'), 'the notice says the audio goes to Google');
}

/* ---- the inference hook the dictation asks -------------------- */
{
  const { createInference } = await import('../src/ui/script-editor/inference.js');
  const list = [{ id: 'a', type: 'action', text: '' }];
  const inf = createInference({ getElements: () => list, setElementType: () => {}, names: () => ['PREETHI'] });
  eq(inf.wouldFormat(0, 'Preethi says hello'), true, 'a speech written as prose would be formatted');
  eq(inf.wouldFormat(0, 'She walks to the door'), false, 'plain action would not');
  eq(inf.wouldFormat(0, 'CUT TO:'), true, 'a transition would');
  eq(inf.wouldFormat(0, ''), false, 'an empty line would not');
  list[0].text = 'Preethi says hello';
  eq(list[0].text, 'Preethi says hello', 'asking changes nothing');
}

/* ---- names --------------------------------------------------- */
{
  const els = () => [
    { id: 's1', type: 'scene', text: 'INT. KITCHEN - DAY' },
    ...Array.from({ length: 6 }, (_, i) => [
      { id: 'c' + i, type: 'character', text: 'PREETHI' },
      { id: 'd' + i, type: 'dialogue', text: 'Ravi, where is the key?' }
    ]).flat(),
    { id: 'a1', type: 'action', text: 'Preethy looks at the kitchen. PREETHY sighs. Preethi nods.' },
    { id: 'a2', type: 'action', text: 'Ravi waits.' },
    { id: 'c9', type: 'character', text: 'PREETHY' },
    { id: 'd9', type: 'dialogue', text: 'Fine.' },
    ...Array.from({ length: 3 }, (_, i) => ({ id: 'rc' + i, type: 'character', text: 'RAVI' }))
  ];
  eq(NS.spellcheckFor('character'), false, 'no spellcheck on a cue');
  eq(NS.spellcheckFor('scene'), false, 'none on a heading');
  eq(NS.spellcheckFor('transition'), false, 'none on a transition');
  eq(NS.spellcheckFor('dialogue'), true, 'dialogue keeps it');
  eq(NS.spellcheckFor('action'), true, 'action keeps it');
  eq(NS.placeWords('INT. BIG KITCHEN - DAY'), ['BIG', 'KITCHEN'], 'a heading\'s place words');
  ok(NS.knownWords(els()).has('kitchen') && NS.knownWords(els()).has('preethi'), 'known words: places and cast');
  eq(NS.distance('preethy', 'preethi'), 1, 'distance 1');
  eq(NS.distance('abc', 'xyz', 2), 3, 'distance stops past the limit');
  const s = NS.nameSuspects(els());
  eq(s.length, 1, 'one suspect: ' + JSON.stringify(s));
  eq([s[0].wrong, s[0].right, s[0].count], ['preethy', 'Preethi', 3], 'preethy is probably Preethi, in 3 places (prose twice, one cue)');
  eq(NS.nameSuspects(els(), [], new Set(['preethy'])), [], 'an ignored word is not suggested again');
  ok(!NS.nameSuspects(els()).some((x) => x.wrong === 'kitchen' || x.wrong === 'ravi'), 'places and cast are never suspects');
  // Two real, different, well-used names are not each other's typo.
  const two = [
    ...Array.from({ length: 4 }, (_, i) => ({ id: 'a' + i, type: 'character', text: 'RAVI' })),
    ...Array.from({ length: 4 }, (_, i) => ({ id: 'b' + i, type: 'character', text: 'RAVIN' }))
  ];
  eq(NS.nameSuspects(two), [], 'two well-used similar names are two people');
  const before = JSON.stringify(els());
  const fix = NS.fixInstances(els(), 'preethy', 'Preethi');
  eq(fix.count, 3, 'fix: three matches');
  eq(fix.changes.find((c) => c.id === 'a1').after, 'Preethi looks at the kitchen. PREETHI sighs. Preethi nods.', 'case is kept: Title in prose, capitals in a caps word');
  eq(fix.changes.find((c) => c.id === 'c9').after, 'PREETHI', 'a cue stays in capitals');
  ok(!fix.changes.some((c) => c.id === 'a2'), 'untouched lines are not in the change list');
  eq(JSON.stringify(els()), before, 'fix modifies nothing');
  eq(NS.fixInstances(els(), 'pree', 'X').count, 0, 'whole word only');
}

console.log(`test:helpers — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
