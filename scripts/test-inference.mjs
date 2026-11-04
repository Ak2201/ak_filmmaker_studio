/* TEST — typing inference (src/ui/script-editor/inference.js), in Node */
const { classifyInput: ci, classifyReturn: cr, createInference } = await import('../src/ui/script-editor/inference.js');
let pass = 0, fail = 0;
const eq = (a, b, m) => { if (JSON.stringify(a) === JSON.stringify(b)) pass++; else { fail++; console.error('  ✗', m, JSON.stringify(a), '!=', JSON.stringify(b)); } };

eq(ci('int. house - day', 'action'), { type: 'scene', text: 'int. house - day' }, 'int.');
eq(ci('EXT. ROAD', 'action')?.type, 'scene', 'EXT.');
eq(ci('INT./EXT. CAR', 'action')?.type, 'scene', 'INT./EXT.');
eq(ci('I/E. CAR', 'action')?.type, 'scene', 'I/E.');
eq(ci('Interesting turn', 'action'), null, 'no dot, no heading');
eq(ci('int. x', 'dialogue'), null, 'only in action');
eq(ci('.FLASHBACK', 'action'), { type: 'scene', text: 'FLASHBACK' }, 'dot forces scene');
eq(ci('...and then', 'action'), null, 'ellipsis stays');
eq(ci('..', 'action'), null, 'double dot');
eq(ci('@ravi', 'action'), { type: 'character', text: 'ravi' }, '@ forces character');
eq(cr('RAVI', 'action'), { type: 'character', text: 'RAVI' }, 'caps name');
eq(cr('RAVI (V.O.)', 'action')?.type, 'character', 'V.O. suffix');
eq(cr("MEERA (CONT'D)", 'action')?.type, 'character', "CONT'D suffix");
eq(cr('DR. K 2', 'action')?.type, 'character', 'digits, period');
eq(cr('ONE TWO THREE FOUR FIVE', 'action'), null, 'five words');
eq(cr('Ravi', 'action'), null, 'mixed case');
eq(cr('WAIT:', 'action'), null, 'colon');
eq(cr('CUT TO:', 'action')?.type, 'transition', 'TO:');
for (const t of ['FADE OUT.', 'FADE IN:', 'SMASH CUT:', 'CUT TO BLACK.', 'FADE TO BLACK.', 'MATCH CUT:', 'INTERCUT']) eq(cr(t, 'action')?.type, 'transition', t + ' is a transition (QA r4)');
for (const t of ['THE END', 'BLACK.', 'THE END.']) eq(cr(t, 'action'), null, t + ' stays action, never a cue (QA r4)');
eq(cr('FADE', 'action')?.type, 'character', 'a cue that merely starts like one is still a cue');
eq(cr('>Fade out', 'action'), { type: 'transition', text: 'Fade out' }, '> transition');
eq(cr('>THE END<', 'action'), { type: 'centered', text: 'THE END' }, '>x< is centered');
eq(ci('~la la la', 'action'), { type: 'lyrics', text: 'la la la' }, '~ forces lyrics');
for (const t of ['ACT ONE', 'ACT II', 'END OF ACT TWO', 'ACT 3', 'NEW ACT']) eq(cr(t, 'action')?.type, 'act', t + ' is an act break');
for (const t of ['ACT', 'Act one begins.']) eq(cr(t, 'action')?.type === 'act', false, t + ' is not an act break');
eq(cr('RAVI', 'dialogue'), null, 'only action');
eq(cr('INT. HOUSE', 'action'), null, 'scene prefix not a cue');

// never fight the user
const els = [{ id: 'a', type: 'action', text: 'int. x' }, { id: 'b', type: 'action', text: 'int. y' }];
const ed = { getElements: () => els, setElementType: (i, t) => { els[i].type = t; inf.noteTypeChange(els[i].id); } };
const inf = createInference(ed);
eq(inf.onInput(0, null), true, 'auto-applies');
eq(els[0].type, 'scene', 'typed');
inf.noteTypeChange('b');                  // the writer chose action by hand
eq(inf.onInput(1, null), true, 'a hand-chosen line is reformatted too (owner, 2 Nov)');
eq(els[1].type, 'scene', 'now a heading');
els[1].type = 'action'; inf.suppress('b');   // the writer undid that switch
eq(inf.onInput(1, null), false, 'an undone switch is left alone');
eq(els[1].type, 'action', 'still action');
/* ---- any line type (owner, 2 Nov 2026) ------------------------------ */
const { parseSaysLine: says, normaliseNames } = await import('../src/ui/script-editor/inference.js');
// headings: caps + space outside action
eq(ci('INT. HOUSE', 'dialogue')?.type, 'scene', 'caps INT. in a dialogue line becomes a heading');
eq(ci('EXT. ROAD', 'character')?.type, 'scene', 'caps EXT. in a cue line');
eq(ci('EST. CHENNAI', 'transition')?.type, 'scene', 'EST. in a transition line');
eq(ci('EST. CHENNAI', 'action')?.type, 'scene', 'EST. in action');
eq(ci('Est. 1990, the shop', 'action'), null, 'Est. in action is action');
eq(ci('Int. is short for interior', 'dialogue'), null, 'a speech mentioning Int. stays');
eq(ci('INT.', 'dialogue'), null, 'no space yet: wait');
eq(ci('EXT. ', 'dialogue'), null, 'the space alone does not switch a speech');
eq(ci('EXT. is the code for exterior', 'dialogue'), null, 'a speech opening with EXT. and a sentence stays');
eq(ci('EXT. I', 'dialogue'), null, 'one capital after the prefix may be the word "I": wait');
eq(ci('EXT. I t', 'dialogue'), null, 'and lower case after it keeps the speech');
eq(ci('EXT. RO', 'dialogue')?.type, 'scene', 'two capitals after the prefix: a heading');
eq(ci('INT. HOUSE', 'scene'), null, 'already a heading');
// transitions while typing
eq(ci('CUT TO:', 'action')?.type, 'transition', 'CUT TO: switches as it is typed');
eq(ci('CUT TO', 'action'), null, 'no colon yet');
eq(ci('DISSOLVE TO:', 'dialogue')?.type, 'transition', 'any caps TO: line, even in dialogue');
eq(ci('FADE OUT.', 'character')?.type, 'transition', 'FADE OUT. on a cue line');
eq(ci('FADE IN', 'action'), null, 'FADE IN without its colon may be FADE INTO');
eq(ci('FADE IN:', 'action')?.type, 'transition', 'FADE IN:');
eq(ci('SMASH CUT:', 'action')?.type, 'transition', 'SMASH CUT:');
eq(ci('FADE TO BLACK.', 'dialogue')?.type, 'transition', 'FADE TO BLACK.');
eq(ci('I said go TO:', 'dialogue'), null, 'a speech ending TO: is not caps: stays');
eq(ci('OK, CUT TO:', 'dialogue'), null, 'a comma is not a transition');
eq(ci('CUT TO:', 'transition'), null, 'already a transition');
eq(ci('INT. CUT TO:', 'scene'), null, 'a heading being typed never flips');
// parenthetical
eq(ci('(', 'dialogue', { was: '' }), { type: 'paren', text: '(' }, '( in an empty dialogue line');
eq(ci('(', 'action', { prevType: 'dialogue', was: '' })?.type, 'paren', '( after dialogue');
eq(ci('(', 'action', { prevType: 'character', was: '' })?.type, 'paren', '( after a cue');
eq(ci('(', 'action', { prevType: 'scene', was: '' }), null, '( after a heading stays action');
eq(ci('(Hello', 'dialogue', { was: 'Hello' }), null, '( put in front of a written speech is an edit');
eq(ci('(beat)', 'dialogue', { was: '' })?.type, 'paren', 'a whole paren typed into an empty line');
eq(ci('(', 'paren', { was: '' }), null, 'already a paren');
// Fountain marks still
eq(ci('.FLASHBACK', 'action'), { type: 'scene', text: 'FLASHBACK' }, 'dot still forces');
eq(ci('@ravi', 'action')?.type, 'character', '@ still forces');

// Return: known names on any line
const NAMES = ['PREETHI', 'RAVI', 'MR. RAO', 'ப்ரீத்தி'];
eq(cr('RAVI', 'dialogue', { names: NAMES })?.type, 'character', 'known name alone in a dialogue line');
eq(cr('Ravi', 'dialogue', { names: NAMES }), null, 'a speech calling "Ravi" stays');
eq(cr('Preethi', 'action', { names: NAMES }), { type: 'character', text: 'PREETHI' }, 'known name in action, upper-cased');
eq(cr('Preethi (v.o.)', 'action', { names: NAMES }), { type: 'character', text: 'PREETHI (V.O.)' }, 'with an extension');
eq(cr("RAVI (CONT'D)", 'paren', { names: NAMES })?.type, 'character', 'cont\'d on a paren line');
eq(cr('ப்ரீத்தி', 'dialogue', { names: NAMES })?.type, 'character', 'a Tamil name alone');
eq(cr('MEERA', 'dialogue', { names: NAMES }), null, 'an unknown caps word in dialogue stays');
eq(cr('MEERA', 'action', { names: NAMES })?.type, 'character', 'caps in action still a cue');
eq(cr('CUT TO:', 'dialogue')?.type, 'transition', 'Return: transition from dialogue');
eq(cr('INTERCUT', 'dialogue')?.type, 'transition', 'Return takes a transition without punctuation');
eq(cr('RAVI', 'character', { names: NAMES }), null, 'a cue is a cue');
eq(cr('INT. RAVI', 'scene', { names: NAMES }), null, 'a heading stays');
eq(cr('THE END', 'dialogue', { names: NAMES }), null, 'closing card');
eq(normaliseNames(['ravi (V.O.)', 'Ravi', 'mr. rao']), ['MR. RAO', 'RAVI'], 'names normalised, longest first');

// "X says"
eq(says('Preethi says hello there.', NAMES), { name: 'PREETHI', paren: '', dialogue: 'Hello there.' }, 'says');
eq(says('preethi said, "Where were you?"', NAMES), { name: 'PREETHI', paren: '', dialogue: 'Where were you?' }, 'said, quoted');
eq(says('Ravi asks her, why now?', NAMES), { name: 'RAVI', paren: '', dialogue: 'Why now?' }, 'asks her,');
eq(says('Ravi tells Preethi that the train is late.', NAMES), { name: 'RAVI', paren: '', dialogue: 'The train is late.' }, 'tells NAME that');
eq(says('Ravi replies: no.', NAMES), { name: 'RAVI', paren: '', dialogue: 'No.' }, 'replies:');
eq(says('Ravi answers to him "fine"', NAMES), { name: 'RAVI', paren: '', dialogue: 'Fine' }, 'answers to him');
eq(says('PREETHI: Where are you?', NAMES), { name: 'PREETHI', paren: '', dialogue: 'Where are you?' }, 'NAME:');
eq(says('Preethi whispers, come closer.', NAMES), { name: 'PREETHI', paren: '(whispering)', dialogue: 'Come closer.' }, 'whispers → (whispering)');
eq(says('Ravi shouts "Run!"', NAMES), { name: 'RAVI', paren: '(shouting)', dialogue: 'Run!' }, 'shouts → (shouting)');
eq(says('Ravi yells: stop', NAMES)?.paren, '(yelling)', 'yells');
eq(says('Ravi mutters, fine.', NAMES)?.paren, '(muttering)', 'mutters');
eq(says('Ravi murmurs, sleep.', NAMES)?.paren, '(murmuring)', 'murmurs');
eq(says('Ravi screams, no!', NAMES)?.paren, '(screaming)', 'screams');
eq(says('Preethi cries, "Why?"', NAMES)?.paren, '(crying)', 'cries');
eq(says('Mr. Rao says sit down.', NAMES)?.name, 'MR. RAO', 'a name with a dot');
eq(says('ப்ரீத்தி says வா.', NAMES), { name: 'ப்ரீத்தி', paren: '', dialogue: 'வா.' }, 'a Tamil name');
eq(says('ப்ரீத்தி: வா.', NAMES)?.name, 'ப்ரீத்தி', 'a Tamil name with a colon');
// negatives
eq(says('Preethi says nothing.', NAMES), null, 'says nothing is what she does');
eq(says('Preethi says.', NAMES), null, 'no words after the verb');
eq(says('Preethi says', NAMES), null, 'nothing after the verb');
eq(says('Preethi sayings are odd', NAMES), null, 'sayings is not says');
eq(says('Meera says hello', NAMES), null, 'unknown name');
eq(says('Preethis says hi', NAMES), null, 'a longer word is not the name');
eq(says('Preethi cries all night.', NAMES), null, 'a manner verb with bare words is action');
eq(says('Preethi whispers softly to Ravi', NAMES), null, 'whispers softly is action');
eq(says('Preethi walks in and says hi', NAMES), null, 'the verb must follow the name');
eq(says('Preethi says hi', []), null, 'no names known');
eq(says('Preethi:', NAMES), null, 'NAME: with nothing after');

// the hook: one step per switch, and an undone switch is left alone
const steps = [];
const els2 = [
  { id: 'c', type: 'character', text: 'RAVI' },
  { id: 'd', type: 'dialogue', text: 'CUT TO:' },
  { id: 'e', type: 'action', text: 'Ravi says go now.' }
];
let spoke = null;
const inf2 = createInference({
  getElements: () => els2,
  setElementType: (i, t) => { els2[i].type = t; inf2.noteTypeChange(els2[i].id); },
  names: () => ['RAVI'],
  step: (kind, fn, meta) => { steps.push({ kind, meta, before: JSON.stringify(els2) }); return fn(); },
  speak: (i, parsed) => { spoke = { i, parsed }; return i + 1; }
});
eq(inf2.onInput(1, null, 'CUT TO'), true, 'dialogue CUT TO: switches');
eq(els2[1].type, 'transition', 'now a transition');
eq(steps[0].meta, { auto: 'd' }, 'one auto step, marked with the line');
eq(JSON.parse(steps[0].before)[1], { id: 'd', type: 'dialogue', text: 'CUT TO:' }, 'the step starts from the line as typed');
inf2.suppress('d');
els2[1].type = 'dialogue';
eq(inf2.onInput(1, null, 'CUT TO'), false, 'an undone switch is not made again');
eq(inf2.onReturn(2, null), { type: 'dialogue', at: 3 }, 'Return on "Ravi says go now." speaks');
eq(spoke && spoke.parsed, { name: 'RAVI', paren: '', dialogue: 'Go now.' }, 'speak() gets the parse');
eq(steps[steps.length - 1].meta, { auto: 'e' }, 'the speech is one auto step');

// QA r6: a closing full stop is a sentence, not a cue.
eq(cr('SILENCE.', 'action'), null, 'r6: SILENCE. stays action');
eq(cr('A.', 'action'), null, 'r6: A. stays action');
eq(cr('DARKNESS.', 'action'), null, 'r6: DARKNESS. stays action');
eq(cr('J.D.', 'action')?.type, 'character', 'r6: an initialism is still a name');
eq(cr('SILENCE.', 'action', { names: ['SILENCE.'] })?.type, 'character', 'r6: a known name still wins');
console.log(`test-inference: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
