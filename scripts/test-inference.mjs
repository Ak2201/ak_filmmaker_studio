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
eq(cr('>Fade out', 'action'), { type: 'transition', text: 'Fade out' }, '> transition');
eq(cr('>THE END<', 'action'), null, 'centered');
eq(cr('RAVI', 'dialogue'), null, 'only action');
eq(cr('INT. HOUSE', 'action'), null, 'scene prefix not a cue');

// never fight the user
const els = [{ id: 'a', type: 'action', text: 'int. x' }, { id: 'b', type: 'action', text: 'int. y' }];
const ed = { getElements: () => els, setElementType: (i, t) => { els[i].type = t; inf.noteTypeChange(els[i].id); } };
const inf = createInference(ed);
eq(inf.onInput(0, null), true, 'auto-applies');
eq(els[0].type, 'scene', 'typed');
inf.noteTypeChange('b');                  // the writer chose
eq(inf.onInput(1, null), false, 'explicit line left alone');
eq(els[1].type, 'action', 'still action');
console.log(`test-inference: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
