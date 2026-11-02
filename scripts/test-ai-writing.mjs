#!/usr/bin/env node
/* ============================================================
   test:ai-writing — the writing tools land in the studio's models
   ------------------------------------------------------------
       node scripts/test-ai-writing.mjs   (or: npm run test:ai-writing)

   No browser and no provider. The Desk tasks are loaded through
   ai-tasks.js registerAll() (the test:audience seam: store.js is an
   in-memory map) and every Accept is called with a FAKED reply —
   through the fake fetch for the dialogue pass, as a hand-built result
   for the rest. Asserted, per task:
     · dialogue-pass  option 1 is the line; versions 2..n become the
                      line's alternate takes (`alts`); Undo restores the
                      line and removes exactly those takes;
     · logline        the first ticked variant is the logline, the other
                      ticked ones go to story.loglineAlts; Undo;
     · synopsis-script the story's logline and Save the Cat steps are
                      filled where BLANK only; a written beat and a typed
                      logline are untouched; a short gets no steps; Undo
                      keeps anything typed since;
     · gen-scenes     each row keeps its beatId; cast joined to the
                      Characters records (alias → the record's name), a
                      record made only for an unknown name, none renamed;
                      Undo removes only the untouched records it made;
     · gen-batch      an unticked (or missing) scene is NOT skipped: the
                      cursor moves past the written ones only, and the
                      unticked scene is next in line; a batch that wrote
                      nothing changes nothing;
     · voice-check    with no addTake port the Accept says the Coverage
                      view must be open (never "no longer in the script").
   ============================================================ */
import { register } from 'node:module';

const mem = new Map();
globalThis.__fakeMem = mem;
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => mem.set(k, String(v)),
  removeItem: (k) => mem.delete(k)
};
register('data:text/javascript,' + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec.endsWith('/store.js') || spec === './store.js')
      return { url: 'data:text/javascript,' + encodeURIComponent(
        'const m = globalThis.__fakeMem;' +
        'export const rawGet = (k) => (m.has(k) ? m.get(k) : null);' +
        'export const rawSet = (k, v) => { m.set(k, String(v)); return true; };' +
        'export const rawRemove = (k) => { m.delete(k); return true; };' +
        'export const projectFav = () => null;' +
        'export default new Proxy({}, { get: (t, k) => (k === "then" ? undefined : () => null) });'), shortCircuit: true };
    if (spec.endsWith('.css'))
      return { url: 'data:text/javascript,export default {}', shortCircuit: true };
    return next(spec, ctx);
  }
  export async function load(url, ctx, next) {
    if (url.endsWith('.json')) {
      const { readFileSync } = await import('node:fs');
      return { format: 'module', source: 'export default ' + readFileSync(new URL(url), 'utf8'), shortCircuit: true };
    }
    return next(url, ctx);
  }
`), import.meta.url);

const W = await import('../src/lib/ai-writing-apply.js');
const AI = await import('../src/lib/ai.js');
const Tasks = await import('../src/lib/ai-tasks.js');
const StoryM = await import('../src/lib/story.js');
const ScenesM = await import('../src/lib/scenes.js');
const Script = await import('../src/lib/script.js');
const Gen = await import('../src/lib/scriptgen.js');
const Chars = await import('../src/lib/characters.js');
const Ports = await import('../src/lib/ports.js');
const { installFakeFetch } = await import('./fake-ai.mjs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const throws = (fn, re, m) => { let e = null; try { fn(); } catch (x) { e = x; } ok(e && re.test(e.message), m + (e ? ' — ' + e.message : ' (did not throw)')); };
const withMemo = (result, memo) => Object.defineProperty(result, 'memo', { value: memo, enumerable: false });

const reg = new Map();
await Tasks.registerAll((t) => reg.set(t.id, t));

/* ---- the pure helpers ---------------------------------------- */
{
  const el = { type: 'dialogue', text: 'Go.', alts: ['Leave.'] };
  eq(W.addTakes(el, ['Go.', ' Leave. ', '', 'Run!', 'Run!']), ['Run!'], 'addTakes: skips the line, a kept take, blanks and repeats');
  eq(el.alts, ['Leave.', 'Run!'], 'addTakes: appends beside the writer\'s takes');
  W.removeTakes(el, ['Run!']);
  eq(el.alts, ['Leave.'], 'removeTakes: removes only what was added');
  const e2 = { type: 'dialogue', text: 'x' };
  W.removeTakes(e2, W.addTakes(e2, ['y']));
  ok(!('alts' in e2), 'removeTakes: an emptied list is removed, not left []');
  const stc = StoryM.frameworkById('save_the_cat');
  eq([W.storyBeatKey('set-up', stc), W.storyBeatKey('break-into-two', stc), W.storyBeatKey('nope', stc)],
    ['save_the_cat:setup', 'save_the_cat:break_into_two', ''], 'storyBeatKey: studies.json spellings meet the framework\'s; unknown is blank');
  eq(W.addLoglineAlts(['A'], ['A', 'B', '', 'L'], 'L'), { list: ['A', 'B'], added: ['B'] }, 'addLoglineAlts: skips kept, blank and the logline itself');
  eq(W.removeLoglineAlts(['A', 'B'], ['B']), ['A'], 'removeLoglineAlts');
}

/* ---- dialogue-pass, through the fake provider ------------------- */
{
  const undoFetch = installFakeFetch(async (req) => {
    if (/--- THE SPEECH TO WORK ON ---/.test(req.user)) {
      return { keep: 'Plain.', options: [{ text: 'The bus is late.', note: 'Shorter.' },
        { text: 'Late again, the bus.', note: 'Rhythm.' }, { text: 'That bus. Late.', note: 'Clipped.' }] };
    }
    throw new Error('fake-ai: unrecognised prompt');
  });
  AI.setProvider('anthropic'); AI.setKey('sk-ant-WRITINGTESTKEY0000000001');
  const doc = { elements: [
    { id: 'a1', type: 'scene', text: 'INT. TEA STALL - DAY' },
    { id: 'a2', type: 'character', text: 'MEENA' },
    { id: 'a3', type: 'dialogue', text: 'The bus is late again, like every single day.', alts: ['Mine, typed.'] }
  ] };
  let saves = 0;
  const ctx = { getDoc: () => doc, save: () => { saves++; }, render: () => {}, elId: 'a3' };
  const t = reg.get('dialogue-pass');
  const r = await t.run(t.input(ctx), { ctx });
  ok(/alternate takes/.test(r.note), 'dialogue: the note says the other versions are kept as takes');
  const undo = t.apply(r.proposed, ctx, r);
  eq(doc.elements[2].text, 'The bus is late.', 'dialogue: option 1 is the line, as before');
  eq(doc.elements[2].alts, ['Mine, typed.', 'Late again, the bus.', 'That bus. Late.'], 'dialogue: versions 2 and 3 are takes beside the writer\'s own');
  ok(saves === 1 && typeof undo === 'function', 'dialogue: one save, an Undo');
  undo();
  eq([doc.elements[2].text, doc.elements[2].alts], ['The bus is late again, like every single day.', ['Mine, typed.']], 'dialogue: Undo restores the line and removes exactly the added takes');
  ok(!('aiPass' in doc.elements[2]), 'dialogue: Undo removes the pass mark');
  undoFetch();
}

/* ---- logline ------------------------------------------------------ */
{
  let st = StoryM.blankStory();
  st.logline = 'Mine.';
  st.loglineAlts = ['Kept before.'];
  const ctx = {
    getLogline: () => st.logline, getStory: () => st,
    setLogline: (x) => { st = { ...st, logline: x }; },
    setLoglineAlts: (list) => { st = { ...st, loglineAlts: list }; }
  };
  const t = reg.get('logline');
  const undo = t.apply([{ id: 'v0', text: 'V0.' }, { id: 'v2', text: 'V2.' }, { id: 'v3', text: 'Kept before.' }], ctx);
  eq([st.logline, st.loglineAlts], ['V0.', ['Kept before.', 'V2.']], 'logline: first ticked is the logline, the others are alternates (no repeats)');
  undo();
  eq([st.logline, st.loglineAlts], ['Mine.', ['Kept before.']], 'logline: Undo restores the logline and only the added alternates');
  let plain = 'Old.';
  const u2 = t.apply([{ text: 'A.' }, { text: 'B.' }], { getLogline: () => plain, setLogline: (x) => { plain = x; } });
  ok(plain === 'A.' && typeof u2 === 'function', 'logline: a caller without setLoglineAlts still applies the logline');
  const s2 = StoryM.blankStory();
  s2.loglineAlts = ['x'];
  mem.set(StoryM.STORY_KEY, JSON.stringify(s2));
  eq(StoryM.loadStory().loglineAlts, ['x'], 'logline: loglineAlts survives loadStory (pass-through field)');
  mem.delete(StoryM.STORY_KEY);
}

/* ---- synopsis-script: the story filled where blank -------------- */
{
  const t = reg.get('synopsis-script');
  const vocab = await Gen.beatVocabulary();
  const pick = (id) => vocab.find((b) => b.id === id);
  const runResult = (logline) => withMemo({ items: [] }, { synopsis: 'A synopsis.', logline, model: 'm', vocab });
  const items = [{ id: 'set-up', text: 'Meena runs a tea stall.' }, { id: 'catalyst', text: 'A key arrives.' }, { id: 'midpoint', text: 'She opens the door.' }];
  ok(items.every((i) => pick(i.id)), 'synopsis: the vocabulary has the beats the test uses');

  // A feature with a typed setup step, an empty catalyst step and no logline.
  mem.clear();
  Gen.save({ ...Gen.load(), format: 'feature' });
  const s = StoryM.blankStory();
  const typed = StoryM.addOutlineStep(s, { beat: 'save_the_cat:setup', text: 'My own setup.' });
  const empty = StoryM.addOutlineStep(s, { beat: 'save_the_cat:catalyst', text: '' });
  StoryM.saveStory(s);
  const undo = t.apply(items, {}, runResult('The model logline.'));
  const after = StoryM.loadStory();
  eq(after.logline, 'The model logline.', 'synopsis: a blank logline is filled');
  eq(after.outline.find((x) => x.id === typed.id).text, 'My own setup.', 'synopsis: a written step is never replaced');
  eq(after.outline.find((x) => x.id === empty.id).text, 'A key arrives.', 'synopsis: an empty step on the beat is filled');
  const mid = after.outline.filter((x) => x.beat === 'save_the_cat:midpoint');
  eq(mid.map((x) => x.text), ['She opens the door.'], 'synopsis: a beat with no step gets one');
  eq(after.outline.filter((x) => x.beat === 'save_the_cat:setup').length, 1, 'synopsis: no second step under a written beat');
  eq(Gen.load().stage, 'beats', 'synopsis: the job still moves to the beat sheet');
  // The writer types into the new midpoint step before pressing Undo.
  const typedLater = StoryM.loadStory();
  typedLater.outline.find((x) => x.beat === 'save_the_cat:midpoint').text = 'She opens the door, slowly.';
  StoryM.saveStory(typedLater);
  undo();
  const back = StoryM.loadStory();
  eq(back.logline, '', 'synopsis: Undo clears the logline it filled');
  eq(back.outline.find((x) => x.id === empty.id).text, '', 'synopsis: Undo empties the step it filled');
  eq(back.outline.filter((x) => x.beat === 'save_the_cat:midpoint').map((x) => x.text), ['She opens the door, slowly.'], 'synopsis: Undo keeps a step the writer typed into since');
  eq(Gen.load().stage, 'synopsis', 'synopsis: Undo restores the job');

  // A typed logline is never replaced.
  mem.clear();
  const s3 = StoryM.blankStory(); s3.logline = 'Typed logline.'; StoryM.saveStory(s3);
  t.apply(items, {}, runResult('The model logline.'));
  eq(StoryM.loadStory().logline, 'Typed logline.', 'synopsis: a typed logline is left alone');

  // A short film: the logline only, no Save the Cat steps.
  mem.clear();
  Gen.save({ ...Gen.load(), format: 'short' });
  t.apply(items, {}, runResult('Short logline.'));
  const sh = StoryM.loadStory();
  eq([sh.logline, sh.outline.length], ['Short logline.', 0], 'synopsis: a short gets the logline and no steps');

  // A locked outline is not written.
  mem.clear();
  const s4 = StoryM.blankStory(); s4.outlineLockedAt = new Date().toISOString(); StoryM.saveStory(s4);
  t.apply(items, {}, runResult(''));
  eq(StoryM.loadStory().outline.length, 0, 'synopsis: a locked outline gets no steps');
}

/* ---- gen-scenes: beat on the row, cast joined to Characters ------ */
{
  mem.clear();
  Chars.saveCharacters([Chars.blankCharacter({ name: 'Anbu', aliases: ['ANBUSELVAN'], want: 'Home' })]);
  Gen.save({ ...Gen.load(), stage: 'beats', beats: [{ id: 'catalyst', label: 'Catalyst', happens: 'x' }] });
  const t = reg.get('gen-scenes');
  const props = [
    { intExt: 'INT', location: 'Stall', dayNight: 'DAY', synopsis: 'One.', eighths: 8, cast: ['Anbuselvan', 'Meena'], beat: 'catalyst' },
    { intExt: 'EXT', location: 'Road', dayNight: 'NIGHT', synopsis: 'Two.', eighths: 4, cast: ['meena', 'Ravi'], beat: 'no-such-beat' }
  ];
  const undo = t.apply(props.map((p, i) => ({ id: 'p' + i, proposal: p, model: 'm' })), { patch: () => ({}), replaceScenes: () => false });
  const rows = ScenesM.listScenes();
  eq(rows.map((r) => r.beatId), ['save_the_cat:catalyst', ''], 'gen-scenes: each row keeps its beat (unknown → blank)');
  eq(rows.map((r) => r.elements.cast), [['ANBU', 'MEENA'], ['MEENA', 'RAVI']], 'gen-scenes: an alias resolves to the record\'s name; one spelling per person');
  const list = Chars.loadCharacters();
  eq(list.map((c) => c.name), ['ANBU', 'MEENA', 'RAVI'], 'gen-scenes: one record per unknown name, none twice');
  eq([list[0].name, list[0].want, list[0].aliases], ['ANBU', 'Home', ['ANBUSELVAN']], 'gen-scenes: the existing record is not renamed or edited');
  eq(Gen.load().scenes.map((s) => s.cast), [['ANBU', 'MEENA'], ['MEENA', 'RAVI']], 'gen-scenes: the job carries the joined cast for stage 3');
  // The writer fills in Ravi's card before pressing Undo.
  const edited = Chars.loadCharacters();
  edited.find((c) => c.name === 'RAVI').want = 'Money';
  Chars.saveCharacters(edited);
  undo();
  eq(ScenesM.listScenes().length, 0, 'gen-scenes: Undo restores the scene list');
  eq(Chars.loadCharacters().map((c) => c.name), ['ANBU', 'RAVI'], 'gen-scenes: Undo removes the untouched record it made, keeps an edited one and the old one');
}

/* ---- gen-batch: an unticked scene is not skipped for good ------- */
{
  mem.clear();
  Script.saveScript({ elements: [], revisions: [], documents: [] });
  const sc = (n) => ({ sceneId: 'g' + n, slug: 'INT. ROOM ' + n + ' - DAY', synopsis: 'S' + n });
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, scenes: [1, 2, 3, 4, 5].map(sc) });
  const els = (n) => [{ type: 'scene', text: 'INT. ROOM ' + n + ' - DAY' }, { type: 'action', text: 'Body ' + n + '.' }];
  const draft = { cursor: 0, batch: [1, 2, 3, 4].map(sc), byScene: { g1: els(1), g2: els(2), g3: els(3) }, model: 'm', truncated: false };
  const t = reg.get('gen-batch');
  const undo = t.apply([{ id: 'g1', draft }, { id: 'g3', draft }], {});
  const job = Gen.load();
  eq(job.cursor, 2, 'gen-batch: the cursor moves past the two written scenes only');
  eq(job.scenes.map((s) => s.sceneId), ['g1', 'g3', 'g2', 'g4', 'g5'], 'gen-batch: written first, then the unticked and the missing one, next in line');
  eq(Script.loadScript().elements.map((e) => e.text), ['INT. ROOM 1 - DAY', 'Body 1.', 'INT. ROOM 3 - DAY', 'Body 3.'], 'gen-batch: only the ticked scenes are written');
  const nextBatch = job.scenes.slice(job.cursor, job.cursor + Gen.BATCH_SIZE).map((s) => s.sceneId);
  eq(nextBatch, ['g2', 'g4', 'g5'], 'gen-batch: the next batch asks for the unticked scene again');
  undo();
  eq([Gen.load().cursor, Gen.load().scenes.map((s) => s.sceneId), Script.loadScript().elements.length], [0, ['g1', 'g2', 'g3', 'g4', 'g5'], 0], 'gen-batch: Undo restores the job and the script');
  const none = Gen.applyBatch({ ...draft, byScene: {} }, null);
  eq([none.wrote, Gen.load().cursor, Script.loadScript().elements.length], [0, 0, 0], 'gen-batch: a batch that wrote nothing moves nothing (the bulk run stops on it)');
  const done = Gen.applyBatch({ cursor: 0, batch: [1, 2, 3, 4].map(sc), byScene: { g1: els(1), g2: els(2), g3: els(3), g4: els(4) }, model: 'm' }, null);
  eq([done.wrote, Gen.load().cursor, Gen.load().scenes.map((s) => s.sceneId)], [4, 4, ['g1', 'g2', 'g3', 'g4', 'g5']], 'gen-batch: a whole batch written keeps the order and moves past it');
}

/* ---- the bulk run keeps an undo and stops on an empty batch ----- */
{
  const { readFileSync } = await import('node:fs');
  const Wr = readFileSync(new URL('../src/pages/write.js', import.meta.url), 'utf8');
  const run = Wr.slice(Wr.indexOf('async function genRun('), Wr.indexOf('function offerRunUndo('));
  ok(/if \(res\.wrote && !firstUndo\) firstUndo = res\.undo;/.test(run) && /offerRunUndo\(firstUndo, wroteAny\)/.test(run), 'write.js: the bulk run keeps the first batch\'s undo and offers it once');
  ok(/if \(!d\.done && !res\.wrote\) \{/.test(run), 'write.js: the bulk run stops on a batch that wrote nothing');
  ok(/!== left\)/.test(Wr.slice(Wr.indexOf('function offerRunUndo('))), 'write.js: the run\'s Undo refuses once the screenplay has changed since');
}

/* ---- voice-check without the Coverage view ---------------------- */
{
  const t = reg.get('voice-check');
  ok(!Ports.hasPort('addTake'), '(sanity) no view registered addTake here');
  throws(() => t.apply([{ elId: 'x', rewrite: 'y' }], {}), /Coverage view has to be open/, 'voice-check: a missing port says the Coverage view must be open');
  Ports.setPort('addTake', () => 'gone');
  Ports.setPort('removeTake', () => {});
  throws(() => t.apply([{ elId: 'x', rewrite: 'y' }], {}), /no longer in the script/, 'voice-check: with the view open, a truly gone line still says so');
}

console.log(`test:ai-writing — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
