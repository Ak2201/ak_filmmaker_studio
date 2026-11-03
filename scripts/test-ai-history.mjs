#!/usr/bin/env node
/* ============================================================
   test:ai-history — the AI history stamp (docs/AI-FAST-HARNESS.md B)
   ------------------------------------------------------------
       node scripts/test-ai-history.mjs   (npm run test:ai-history)
   (The backup round trip is its own process: test-ai-history-backup.mjs.)

   No browser, no provider, no key. store.js is an in-memory map and every
   Accept is called with a hand-built or faked reply, exactly as
   test:ai-writing does. Asserted:

     · the stamp: shape, aiHash stable across key order and changed by a
       hashed field, unchanged by a move, legacy `ai: true`, the aiFill
       cap of 8, one entry per run per mode, unstamp
     · the pure history model: collectAI, groupByRun, filterAI, stageOf,
       revertPlan (an unchanged `new` is removed, an edited one kept, a
       `fill` blanked, append / replace / legacy never undoable, a scene
       row or script line never removed from here)
     · a ROUND TRIP through every read path keeps `ai` and `aiFill`
       byte for byte: shots, blocks, marks, frames, scenes, elements,
       documents, revisions, the story root, steps, marks, sticky notes,
       characters, call sheets, recce cards, the edit log, both mergers
     · EVERY apply site of the table in section B3, run with a `meta`,
       writes records whose stamp carries meta.run (and the Undo takes
       the stamp away with the words)
     · History Undo (revertEntries): removes unchanged, keeps edited,
       blanks a fill, says how many stayed
     · ANTI-ROT: every registered task with an apply is in the stamped
       set or the named exceptions below, so a new task without a stamp
       fails this file.
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
        'export const onWriteElsewhere = () => () => {};' +
        'export const flushStorage = () => {};' +
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

const { readFileSync } = await import('node:fs');
const Stamp = await import('../src/lib/ai-stamp.js');
const H = await import('../src/lib/ai-history.js');
const Read = await import('../src/lib/ai-history-read.js');
const Revert = await import('../src/lib/ai-history-revert.js');
const Tasks = await import('../src/lib/ai-tasks.js');
const Shots = await import('../src/lib/shots.js');
const Scenes = await import('../src/lib/scenes.js');
const Script = await import('../src/lib/script.js');
const StoryM = await import('../src/lib/story.js');
const Chars = await import('../src/lib/characters.js');
const Contacts = await import('../src/lib/contacts.js');
const Loc = await import('../src/lib/locations.js');
const Edit = await import('../src/lib/editlog.js');
const Gen = await import('../src/lib/scriptgen.js');
const Ports = await import('../src/lib/ports.js');
const AI = await import('../src/lib/ai.js');
const BlockAI = await import('../src/lib/blocking-ai-model.js');
const { mergeElements } = await import('../src/lib/script-merge.js');
const { mergeStory } = await import('../src/lib/story-merge.js');
const { installFakeFetch } = await import('./fake-ai.mjs');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} — got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const withMemo = (result, memo) => Object.defineProperty(result, 'memo', { value: memo, enumerable: false });
const clone = (x) => JSON.parse(JSON.stringify(x));
const meta = (task, run) => ({ task, model: 'model-x', run, at: '2026-11-02T10:00:00.000Z' });

AI.setProvider('anthropic'); AI.setKey('sk-ant-HISTORYTESTKEY00000001');
const reg = new Map();
await Tasks.registerAll((t) => reg.set(t.id, t));
const STAMPED = new Set();       // task ids this file saw stamp
const note = (id) => STAMPED.add(id);

/* ============================================================
   1. the stamp
   ============================================================ */
{
  const m = meta('shot-draft', 'air_1');
  const shot = Shots.blankShot({ sceneId: 's1', size: 'WS', description: 'The room.' });
  const st = Stamp.stampAI('shot', shot, m);
  eq(Object.keys(st.ai).sort(), ['at', 'h', 'model', 'run', 'task'], 'stamp: { task, model, run, at, h }');
  eq([st.ai.task, st.ai.model, st.ai.run, st.ai.at], ['shot-draft', 'model-x', 'air_1', m.at], 'stamp: carries the meta');
  ok(/^[0-9a-f]{8}$/.test(st.ai.h), 'stamp: h is 8 hex digits');
  ok(!('ai' in shot) || shot.ai === false, 'stamp: the input record is not mutated');
  const a = Stamp.aiHash('shot', { size: 'WS', angle: 'eye level', description: 'x' });
  const b = Stamp.aiHash('shot', { description: 'x', angle: 'eye level', size: 'WS' });
  eq(a, b, 'hash: stable across key order');
  ok(Stamp.aiHash('shot', { ...shot, description: 'Different.' }) !== Stamp.aiHash('shot', shot), 'hash: changed by a hashed field');
  eq(Stamp.aiHash('shot', { ...shot, number: '9', sceneId: 'other' }), Stamp.aiHash('shot', shot), 'hash: a move (number, scene) is not an edit');
  eq(Stamp.aiHash('shot', { ...shot, aiFill: [1], ai: { h: 'zz' } }), Stamp.aiHash('shot', shot), 'hash: the stamp itself is not hashed');
  ok(Stamp.aiHash('element', { type: 'action', text: 'x' }) !== Stamp.aiHash('element', { type: 'dialogue', text: 'x' }), 'hash: a type change is an edit');
  eq(Stamp.aiHash('shot', { size: 'WS', description: undefined }), Stamp.aiHash('shot', { size: 'WS' }), 'hash: undefined reads as absent');
  ok(!Stamp.isEdited('shot', st, st.ai), 'edited: false straight after the write');
  ok(Stamp.isEdited('shot', { ...st, description: 'Typed after.' }, st.ai), 'edited: true once a hashed field differs');
  ok(!Stamp.isEdited('shot', { ...st, number: '4' }, st.ai), 'edited: a renumber is not an edit');

  const legacy = Stamp.readStamp({ ai: true });
  eq([legacy.created.legacy, legacy.created.task, legacy.created.run], [true, 'shot-draft', ''], 'legacy: ai:true reads as an earlier shot-draft with no run');
  ok(!Stamp.isEdited('shot', { ai: true }, legacy.created), 'legacy: never reported edited (nothing to compare)');
  eq(Stamp.readStamp(null), { created: null, fills: [] }, 'readStamp: null never throws');
  eq(Stamp.readStamp({ ai: 'garbage', aiFill: 'garbage' }), { created: null, fills: [] }, 'readStamp: garbage reads as none');
  eq(Stamp.readStamp({ ai: false }).created, null, 'readStamp: the blank shot ai:false is no stamp');

  let rec = { id: 'x', notes: 'a' };
  for (let i = 0; i < 11; i++) rec = Stamp.stampFill('callsheet', rec, meta('t' + i, 'run' + i), ['notes'], 'fill');
  eq(rec.aiFill.length, Stamp.FILL_CAP, 'aiFill: capped at 8');
  eq(rec.aiFill[rec.aiFill.length - 1].run, 'run10', 'aiFill: newest last, oldest dropped');
  let two = Stamp.stampFill('element', { id: 'e', alts: ['a'] }, meta('voice-check', 'r1'), ['alts'], 'append');
  two = Stamp.stampFill('element', { ...two, alts: ['a', 'b'] }, meta('voice-check', 'r1'), ['alts'], 'append');
  eq(two.aiFill.length, 1, 'aiFill: one run, one mode, ONE entry (a second take widens it)');
  eq(two.aiFill[0].h, Stamp.aiHash('element', two, ['alts']), 'aiFill: the entry hashes the field as it stands after the second take');
  const un = Stamp.unstampFill(two, 'r1');
  ok(!('aiFill' in un), 'unstampFill: the last entry removes the key');
  eq(Stamp.unstampFill(two, 'nope'), two, 'unstampFill: another run changes nothing');
  const sp = Stamp.stamper(meta('t', 'run-sp'));
  eq([sp.run, sp.create('shot', { id: 'a', size: 'WS' }).ai.run, sp.fill('shot', { id: 'a' }, ['cam'], 'fill').aiFill[0].run], ['run-sp', 'run-sp', 'run-sp'], 'stamper: create / fill carry the run');
  ok(!('aiFill' in sp.drop(sp.fill('shot', { id: 'a' }, ['cam'], 'fill'))), 'stamper: drop takes the run\'s fill away');
  eq(Stamp.metaOf('x', undefined).task, 'x', 'metaOf: a missing meta is made for the task');
  ok(/./.test(Stamp.metaOf('x', {}).run), 'metaOf: …with a run id');
  eq(Stamp.metaOf('x', { run: 'r', task: 'y', at: 'A' }, 'mm'), { task: 'y', model: 'mm', run: 'r', at: 'A' }, 'metaOf: a Desk meta is kept (model falls back to the result\'s)');
}

/* the models that sit on pages' first paint import NO stamp code (their pages are at their byte
   budgets): a lazy caller hands them a stamper. This pins that. */
{
  for (const f of ['scenes.js', 'shots.js', 'scriptgen.js']) {
    const src = readFileSync(new URL('../src/lib/' + f, import.meta.url), 'utf8');
    ok(!/from '\.\/ai-stamp\.js'/.test(src), f + ': no static import of ai-stamp.js (it takes a stamper)');
  }
  const badge = readFileSync(new URL('../src/ui/ai-badge.js', import.meta.url), 'utf8');
  ok(!/ai-stamp|ai-history|\.css/.test(badge.replace(/\/\*[\s\S]*?\*\//g, '')), 'ai-badge.js (first paint) imports no stamp, history or stylesheet code; the words and the style are a lazy chunk');
}

/* ============================================================
   2. the pure history model
   ============================================================ */
{
  const at = (n) => '2026-11-0' + n + 'T10:00:00.000Z';
  const mk = (kind, rec, task, run, n) => Stamp.stampAI(kind, rec, { task, model: 'm', run, at: at(n) });
  const s1 = mk('shot', Shots.blankShot({ id: 'sh1', number: '1', description: 'one' }), 'shot-draft', 'R1', 1);
  const s2 = mk('shot', Shots.blankShot({ id: 'sh2', number: '2', description: 'two' }), 'shot-draft', 'R1', 1);
  const s2e = { ...s2, description: 'two, edited' };
  const el = mk('element', Script.blankElement({ id: 'el1', type: 'action', text: 'A line.' }), 'gen-batch', 'R2', 2);
  const sc = Stamp.stampFill('scene', Scenes.blankScene({ id: 'sc1', number: '3', readerNote: 'N' }), { task: 'scene-notes', model: 'm', run: 'R3', at: at(3) }, ['readerNote'], 'append');
  const sc2 = Stamp.stampFill(Scenes.blankScene ? 'scene' : 'scene', { ...Scenes.blankScene({ id: 'sc2', number: '4', cutCandidate: true }) }, { task: 'scene-notes', model: 'm', run: 'R3', at: at(3) }, ['cutCandidate'], 'fill');
  const created = mk('scene', Scenes.blankScene({ id: 'sc3', number: '5', location: 'Hall' }), 'gen-scenes', 'R4', 4);
  const legacyShot = Shots.blankShot({ id: 'shL', ai: true, description: 'old' });
  const both = Stamp.stampFill('shot', mk('shot', Shots.blankShot({ id: 'shB', description: 'b' }), 'shot-draft', 'R1', 1),
    { task: 'blocking-draft', model: 'm', run: 'R5', at: at(5) }, ['cam'], 'fill');
  const sources = { shots: [s1, s2e, legacyShot, both], scenes: [sc, sc2, created], elements: [el], notes: [{ id: 'n1', kind: 'note', snippet: 'plain' }] };
  const es = H.collectAI(sources);
  const by = (k) => es.find((e) => e.key === k);
  eq(es.filter((e) => e.run === 'R1').length, 3, 'collect: three entries for run R1 (two shots and the shot it created that was later filled)');
  ok(by('shot:sh1:new:R1').undoable && !by('shot:sh1:new:R1').edited, 'collect: an untouched created record is undoable');
  ok(by('shot:sh2:new:R1').edited && !by('shot:sh2:new:R1').undoable, 'collect: an edited one is marked edited and not undoable');
  ok(by('shot:shL:new:legacy').legacy && !by('shot:shL:new:legacy').undoable && !by('shot:shL:new:legacy').edited, 'collect: a legacy ai:true shot is listed, never undoable');
  ok(!by('shot:shB:new:R1').undoable, 'collect: a record another run has filled is not removed from History (it would take their fill)');
  ok(by('shot:shB:fill:R5').undoable && by('shot:shB:fill:R5').mode === 'fill', 'collect: a fill of unchanged fields is undoable');
  ok(by('scene:sc1:append:R3').mode === 'append' && !by('scene:sc1:append:R3').undoable, 'collect: an append is listed and never undoable');
  ok(by('scene:sc2:fill:R3').undoable, 'collect: a fill (a flag the run raised) is undoable');
  ok(!by('scene:sc3:new:R4').undoable, 'collect: a scene row the generator wrote is not removed from History (it is tied to the job)');
  ok(!by('element:el1:new:R2').undoable, 'collect: a script line the generator wrote is not removed from History either');
  eq(es.length, 9, 'collect: an unstamped note adds nothing');
  eq(by('shot:sh1:new:R1').href, 'visualize.html#shot-list', 'href: a shot lands on the shot list');
  eq(by('element:el1:new:R2').href, 'screenplay.html#line-el1', 'href: a script line lands on its row');
  ok(es.every((e) => e.href && e.label && e.stage), 'every entry has an href, a label and a stage');
  eq(H.stageOf('shot-draft'), 'preprod', 'stageOf: shot-draft is pre-production');
  eq([H.stageOf('gen-batch'), H.stageOf('logline'), H.stageOf('day-wrap-summary'), H.stageOf('edit-notes'), H.stageOf('???')], ['screenplay', 'story', 'production', 'post', 'other'], 'stageOf: the five stages, and other');

  const groups = H.groupByRun(es);
  eq(groups.map((g) => g.run), ['R5', 'R4', 'R3', 'R2', 'R1', ''].filter((r) => groups.some((g) => g.run === r)), 'groupByRun: newest first');
  const r1 = groups.find((g) => g.run === 'R1');
  eq([r1.count, r1.edited, r1.stage, r1.task], [3, 1, 'preprod', 'shot-draft'], 'groupByRun: count, edited count, stage, task');
  ok(groups.find((g) => g.legacy && g.task === 'shot-draft'), 'groupByRun: the legacy drafts are one group of their own');
  eq(H.filterAI(es, { stage: 'screenplay' }).every((e) => e.stage === 'screenplay'), true, 'filterAI: by stage');
  eq(H.filterAI(es, { task: 'shot-draft' }).length, 4, 'filterAI: by task');
  eq(H.filterAI(es, { edited: true }).map((e) => e.key), ['shot:sh2:new:R1'], 'filterAI: edited only');

  const plan = H.revertPlan(es.filter((e) => e.run === 'R1' || e.run === 'R3' || e.run === 'R5'));
  eq(plan.remove.map((x) => x.id), ['sh1'], 'revertPlan: only the unchanged created shot is removed');
  eq(plan.blank.map((x) => [x.kind, x.id, x.fields]), [['shot', 'shB', ['cam']], ['scene', 'sc2', ['cutCandidate']]], 'revertPlan: a fill is blanked, naming the fields');
  eq(plan.notUndoable, 1, 'revertPlan: the append is counted as not undoable');
  eq([plan.kept, plan.held], [1, 1], 'revertPlan: the edited shot is "changed" (kept); the one a later run filled is held, not called changed');
  const sup = H.collectAI({ scenes: [Stamp.stampFill('scene', Stamp.stampFill('scene', Scenes.blankScene({ id: 'q', cutCandidate: true }), { task: 'a', run: 'A', at: at(1) }, ['cutCandidate'], 'fill'), { task: 'b', run: 'B', at: at(2) }, ['cutCandidate'], 'fill')] });
  ok(sup.find((e) => e.run === 'A').superseded && !sup.find((e) => e.run === 'A').undoable && !sup.find((e) => e.run === 'A').edited, 'collect: an older fill a later run filled again is superseded (history, not an undo, not "edited")');
  ok(sup.find((e) => e.run === 'B').undoable, 'collect: the newest fill is undoable');
  eq(H.collectAI(null), [], 'collect: nothing in, nothing out');
}

/* ============================================================
   3. a round trip through every read path
   ============================================================ */
const sameStamp = (a, b, m) => {
  eq(a && a.ai, b && b.ai, m + ': ai survives');
  eq(a && a.aiFill, b && b.aiFill, m + ': aiFill survives');
};
{
  const m = meta('shot-draft', 'RT'), f = meta('scene-notes', 'RF');
  const wf = (kind, rec) => Stamp.stampFill(kind, Stamp.stampAI(kind, rec, m), f, ['x'], 'fill');
  // shots, frames, blocks (+ marks)
  mem.clear();
  const shot = wf('shot', Shots.blankShot({ id: 'sh1', sceneId: 's1', description: 'd' }));
  const frame = wf('frame', Shots.blankFrame({ id: 'fr1', shotId: 'sh1' }));
  const mark = { ...Shots.blankMark({ id: 'mk1', kind: 'actor', x: 10, y: 10 }), ai: { task: 't', run: 'r', at: 'a', h: 'h' } };
  const block = wf('block', Shots.blankBlock({ id: 'bk1', sceneId: 's1', marks: [mark] }));
  Shots.saveShots([shot]); Shots.saveFrames([frame]); Shots.saveBlocks([block]);
  sameStamp(Shots.listShots()[0], shot, 'shots');
  sameStamp(Shots.listFrames()[0], frame, 'frames');
  sameStamp(Shots.listBlocks()[0], block, 'blocks');
  eq(Shots.listBlocks()[0].marks[0].ai, mark.ai, 'marks: an unknown field on a mark survives cleanMark');
  // scenes
  Scenes.saveScenes([wf('scene', Scenes.blankScene({ id: 'sc1' }))]);
  sameStamp(Scenes.listScenes()[0], wf('scene', Scenes.blankScene({ id: 'sc1' })), 'scenes');
  // script: elements, documents, revisions
  const el = wf('element', Script.blankElement({ id: 'e1', type: 'action', text: 'T' }));
  const doc = wf('document', Script.blankDocument({ id: 'd1', title: 'Cov' }));
  const rev = Script.makeRevision([el], 'snap');
  Script.saveScript({ elements: [el], revisions: [rev], documents: [doc] });
  const back = Script.loadScript();
  sameStamp(back.elements[0], el, 'script elements');
  sameStamp(back.documents[0], doc, 'script documents');
  /* DELIBERATE DEVIATION from docs/AI-FAST-HARNESS.md B4: a revision snapshot
     copies every line of the script, so carrying the stamp into it would
     roughly triple each draft's size in a store that already has a quota.
     The live lines keep their stamps; a restored draft's lines read as the
     writer's own. */
  ok(!('ai' in back.revisions[0].elements[0]) && !('aiFill' in back.revisions[0].elements[0]), 'a revision snapshot stays lean: it does not copy the stamps (quota)');
  // story root, steps, marks, vault
  const story = StoryM.blankStory();
  story.outline = [wf('step', { id: 'st1', beat: 'save_the_cat:setup', text: 'S' })];
  story.marks = [wf('mark', { id: 'mk', start: 0, end: 3, text: 'abc', tags: {}, origin: 'ai', rationale: '' })];
  story.source = 'abc def';
  Object.assign(story, wf('story', story));
  StoryM.saveStory(story);
  const sb = StoryM.loadStory();
  sameStamp(sb, story, 'the story root');
  sameStamp(sb.outline[0], story.outline[0], 'story steps');
  sameStamp(sb.marks[0], story.marks[0], 'story marks');
  const note = wf('note', { id: 'nt1', kind: 'note', snippet: 'n', color: 'yellow', beat: '', sceneId: '', at: 1 });
  StoryM.addNoteToVault(note);
  sameStamp(StoryM.listVault()[0], note, 'sticky notes');
  // characters, call sheets, recce, edit log
  Chars.saveCharacters([wf('character', Chars.blankCharacter({ id: 'ch1', name: 'Anbu' }))]);
  sameStamp(Chars.loadCharacters()[0], wf('character', Chars.blankCharacter({ id: 'ch1', name: 'Anbu' })), 'characters');
  Contacts.saveCallSheets([wf('callsheet', Contacts.blankCallSheet({ id: 'cs1' }))]);
  sameStamp(Contacts.listCallSheets()[0], wf('callsheet', Contacts.blankCallSheet({ id: 'cs1' })), 'call sheets');
  Loc.setRecce('Hall', { notes: 'n' });
  Loc.setRecce('Hall', { ai: m, aiFill: [{ task: 'recce-notes', run: 'RF', at: 'a', h: 'h', fields: ['notes'], mode: 'fill' }] });
  eq(Loc.getRecce('Hall').aiFill[0].run, 'RF', 'recce cards');
  Scenes.saveScenes([Scenes.blankScene({ id: 'scH', location: 'Hall' })]);
  eq(Read.readSources().recce.find((r) => /hall/i.test(r.name)).ai.run, 'RT', 'recce cards: the history read carries them (through locationIndex)');
  Edit.setSceneEdit('sc1', { note: 'n', aiFill: [{ task: 'edit-notes', run: 'RF', at: 'a', h: 'h', fields: ['note'], mode: 'fill' }] });
  eq(Edit.sceneEdit('sc1').aiFill[0].run, 'RF', 'the edit log');
  // the mergers carry the stamps and make no conflict of them
  const L = [el], R = [{ ...el, u: 5 }];
  const merged = mergeElements(L, R, null);
  sameStamp(merged[0], el, 'script-merge: a merged line');
  const ms = mergeStory({ ...story, aiFill: [{ run: 'L' }] }, { ...story, aiFill: [{ run: 'L' }, { run: 'R' }] }, null);
  eq(ms.aiFill.map((x) => x.run), ['L', 'R'], 'story-merge: aiFill rides the merge');
  eq(ms.outline[0].ai, story.outline[0].ai, 'story-merge: a step keeps its stamp');
  ok(!('sourceConflicts' in ms) || ms.sourceConflicts.length === 0, 'story-merge: a stamp difference alone is no conflict');
  // exporters ignore the fields
  const expSrc = ['screenplay-export.js', 'screenplay-docx.js', 'script-import.js', 'shotlist-export.js'].map((f) => readFileSync(new URL('../src/lib/' + f, import.meta.url), 'utf8')).join('\n');
  ok(!/aiFill|\.ai\.(task|run|h)\b/.test(expSrc), 'exporters: none prints the stamp');
}

/* ============================================================
   4. every apply site writes a stamp carrying meta.run
   ============================================================ */
const runOf = (rec) => { const s = Stamp.readStamp(rec); return s.created ? s.created.run : (s.fills[0] && s.fills[0].run); };
const hasRun = (rec, run) => { const s = Stamp.readStamp(rec); return (s.created && s.created.run === run) || s.fills.some((f) => f.run === run); };
const freshStudio = () => { mem.clear(); AI.setProvider('anthropic'); AI.setKey('sk-ant-HISTORYTESTKEY00000001'); };

/* ---- shot-draft ---- */
{
  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1' })]);
  const t = reg.get('shot-draft');
  const mt = meta('shot-draft', 'run-shot');
  const items = [{ sceneId: 'r1', draft: { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: '', setup: 'S1', description: 'The room.' } },
    { sceneId: 'r1', draft: { size: 'CU', angle: 'low', movement: 'static', description: 'The coins.' } }];
  let afterIds = null;
  const undo = t.apply(items, { after: (ids) => { afterIds = ids; } }, { model: 'mm' }, mt);
  const made = Shots.listShots();
  eq(made.length, 2, 'shot-draft: two shots');
  ok(made.every((s) => s.ai && s.ai.run === 'run-shot' && s.ai.task === 'shot-draft' && s.ai.model === 'model-x'), 'shot-draft: every shot carries meta.run / task / model');
  ok(made.every((s) => !Stamp.isEdited('shot', s, s.ai)), 'shot-draft: unedited straight after the write (the hash is of the shot as read back)');
  ok(made.every((s) => !!s.ai), 'shot-draft: shot.ai stays truthy for visualize.js and the CSV');
  Shots.updateShot(made[0].id, { description: 'Typed.' });
  ok(Stamp.isEdited('shot', Shots.listShots()[0], Shots.listShots()[0].ai), 'shot-draft: a typed word marks the shot edited');
  Shots.updateShot(made[0].id, { number: '9' });
  ok(!Stamp.isEdited('shot', { ...Shots.listShots()[0], description: 'The room.' }, Shots.listShots()[0].ai), 'shot-draft: a renumber is not an edit');
  undo();
  eq(Shots.listShots().length, 0, 'shot-draft: Undo removes the shots (and their stamps)');
  // without a Desk meta (a direct caller) the stamp is still made
  t.apply(items.slice(0, 1), {}, null, undefined);
  ok(Shots.listShots()[0].ai && Shots.listShots()[0].ai.run, 'shot-draft: no meta from the Desk → aiMeta fallback, still stamped');
  note('shot-draft');
}

/* ---- scene-notes, breakdown-tags, and the keepNotes reads ---- */
{
  freshStudio();
  let n = 0;
  const E = (type, text, extra) => ({ id: 'e' + (++n), type, text, ...(extra || {}) });
  const els = [E('scene', 'INT. ANBU HOUSE - NIGHT', { sceneNumber: '1' }), E('action', 'Anbu counts coins on the floor.')];
  Script.saveScript({ elements: els, revisions: [], documents: [] });
  const seed = () => Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1', intExt: 'INT', location: 'ANBU HOUSE', dayNight: 'NIGHT' })]);
  seed();
  const ctx = { elements: () => els, after: () => {} };
  const sn = reg.get('scene-notes');
  const undo = sn.apply([{ i: 0, note: 'Establishes want.', cut: true, scene: '1' }], ctx, null, meta('scene-notes', 'run-sn'));
  let row = Scenes.listScenes()[0];
  const st = Stamp.readStamp(row);
  eq(st.fills.map((f) => [f.run, f.mode, f.fields]), [['run-sn', 'append', ['readerNote']], ['run-sn', 'fill', ['cutCandidate']]], 'scene-notes: an append of the note and a fill of the flag, one run');
  ok(st.fills.every((f) => !Stamp.isEdited('scene', row, f)), 'scene-notes: neither reads edited straight away');
  undo();
  row = Scenes.listScenes()[0];
  ok(!('aiFill' in row) && row.readerNote === '' && row.cutCandidate === false, 'scene-notes: Undo takes the words, the flag and the stamp');
  note('scene-notes');

  /* the writer typed after the AI line, then Undo: the AI text is gone, so is its stamp */
  seed();
  const undo2 = sn.apply([{ i: 0, note: 'Establishes want.', scene: '1' }], ctx, null, meta('scene-notes', 'run-sn2'));
  Scenes.saveScenes(Scenes.listScenes().map((r) => ({ ...r, readerNote: r.readerNote + '\nMy own line.' })));
  undo2();
  row = Scenes.listScenes()[0];
  ok(row.readerNote.includes('My own line.') && !row.readerNote.includes('Establishes want.'), 'scene-notes: Undo past a later typed line takes only the AI text');
  ok(!('aiFill' in row), 'scene-notes: …and no stamp is left on a note with no AI text');

  /* a run that filled AND appended: reverting the fill from the History keeps the append's stamp */
  {
    let r = Stamp.stampFill('scene', Scenes.blankScene({ id: 'z', cutCandidate: true, readerNote: 'AI.' }), { task: 't', run: 'RZ', at: '2026-11-01T10:00:00.000Z' }, ['cutCandidate'], 'fill');
    r = Stamp.stampFill('scene', r, { task: 't', run: 'RZ', at: '2026-11-01T10:00:00.000Z' }, ['readerNote'], 'append');
    const left = Stamp.unstampFill(r, 'RZ', { mode: 'fill', fields: ['cutCandidate'] });
    eq(left.aiFill.map((f) => f.mode), ['append'], 'unstampFill: reverting the fill leaves the append\'s stamp');
    eq(Stamp.unstampFill(r, 'RZ') === r || !('aiFill' in Stamp.unstampFill(r, 'RZ')), true, 'unstampFill: with no filter it still drops the whole run');
  }

  seed();
  const tg = reg.get('breakdown-tags');
  const tundo = tg.apply([{ i: 0, category: 'props', name: 'Coin' }], ctx, null, meta('breakdown-tags', 'run-tg'));
  row = Scenes.listScenes()[0];
  ok(hasRun(row, 'run-tg') && row.aiFill[0].fields[0] === 'elements' && row.aiFill[0].mode === 'append', 'breakdown-tags: an append on the scene\'s elements');
  tundo();
  ok(!('aiFill' in Scenes.listScenes()[0]), 'breakdown-tags: Undo takes the stamp with the tag');
  note('breakdown-tags');

  // the keepNotes reads: a point on a scene's note, a point as a sticky note
  for (const id of ['beat-critique', 'tension-notes', 'audience-quick', 'audience-ask', 'draft-changes', 'day-wrap-summary', 'cert-read']) {
    seed(); StoryM.saveVault ? null : null;
    mem.delete('fms_idea_vault_v1');
    const t = reg.get(id);
    const mm = meta(id, 'run-' + id);
    const undoK = t.apply([{ id: 'a', text: 'On the scene.', keep: 'On the scene.', scene: { sceneId: 'r1' } },
      { id: 'b', text: 'A sticky one.', keep: 'A sticky one.', where: 'Beat 1', scene: null }], {}, null, mm);
    const sr = Scenes.listScenes()[0];
    const vault = StoryM.listVault();
    ok(hasRun(sr, 'run-' + id) && sr.aiFill[0].mode === 'append', id + ': the scene\'s note carries an append stamp');
    ok(vault.length === 1 && vault[0].ai && vault[0].ai.run === 'run-' + id && vault[0].ai.task === id && vault[0].from === 'ai', id + ': the sticky note carries the created stamp (and keeps from:"ai")');
    ok(!Stamp.isEdited('note', vault[0], vault[0].ai), id + ': the note is unedited at first');
    undoK();
    ok(!('aiFill' in Scenes.listScenes()[0]) && StoryM.listVault().length === 0, id + ': Undo takes the stamp, the note and the line');
    note(id);
  }
}

/* ---- story-steps, story-map, scene-story ---- */
{
  freshStudio();
  const s0 = StoryM.blankStory(); s0.source = 'Meena runs a tea stall. A key arrives.'; StoryM.saveStory(s0);
  const t = reg.get('story-steps');
  const undo = t.apply([{ id: 's0', text: 'Meena opens the stall.' }], { beatKey: 'save_the_cat:setup' }, null, meta('story-steps', 'run-ss'));
  let s = StoryM.loadStory();
  eq(s.outline.length, 1, 'story-steps: one step');
  ok(s.outline[0].ai && s.outline[0].ai.run === 'run-ss' && !Stamp.isEdited('step', s.outline[0], s.outline[0].ai), 'story-steps: the step carries the stamp, unedited');
  undo();
  eq(StoryM.loadStory().outline.length, 0, 'story-steps: Undo removes the step');
  note('story-steps');

  const fw = StoryM.frameworkById('save_the_cat');
  const beat = fw.beats[0].id;
  const tm = reg.get('story-map');
  const undoM = tm.apply([{ id: 'r0', row: { beat, quote: 'Meena runs a tea stall.', rationale: 'r', tension: 3 } }], {}, withMemo({}, { fwId: 'save_the_cat', rows: [] }), meta('story-map', 'run-sm'));
  s = StoryM.loadStory();
  ok(s.marks.length === 1 && s.marks[0].ai && s.marks[0].ai.run === 'run-sm', 'story-map: the new passage carries the stamp');
  ok(!Stamp.isEdited('mark', s.marks[0], s.marks[0].ai), 'story-map: unedited at first');
  // a second run tags a passage that already exists: an append, not a new record
  const mid = s.marks[0].id;
  const undoM2 = tm.apply([{ id: 'r0', row: { beat: fw.beats[1].id, quote: 'Meena runs a tea stall.' } }], {}, withMemo({}, { fwId: 'other_fw', rows: [] }), meta('story-map', 'run-sm2'));
  void undoM2;
  undoM();
  ok(StoryM.loadStory().marks.length <= 1, 'story-map: Undo of the first run does not touch the later run');
  note('story-map');

  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1' })]);
  const ts = reg.get('scene-story');
  const undoS = ts.apply([{ sceneId: 'r1', beat: 'save_the_cat:setup', text: 'Anbu counts coins.' }], {}, null, meta('scene-story', 'run-sst'));
  s = StoryM.loadStory();
  ok(s.outline.length === 1 && s.outline[0].sceneId === 'r1' && s.outline[0].ai && s.outline[0].ai.run === 'run-sst', 'scene-story: the step carries the stamp and its scene link');
  undoS();
  eq(StoryM.loadStory().outline.length, 0, 'scene-story: Undo removes it');
  note('scene-story');
}

/* ---- synopsis-script ---- */
{
  freshStudio();
  Gen.save({ ...Gen.load(), format: 'feature' });
  const s0 = StoryM.blankStory();
  const empty = StoryM.addOutlineStep(s0, { beat: 'save_the_cat:catalyst', text: '' });
  StoryM.saveStory(s0);
  const vocab = await Gen.beatVocabulary();
  const t = reg.get('synopsis-script');
  const undo = t.apply([{ id: 'set-up', text: 'Meena runs a tea stall.' }, { id: 'catalyst', text: 'A key arrives.' }], {},
    withMemo({ items: [] }, { synopsis: 'A synopsis.', logline: 'The model logline.', model: 'mm', vocab }), meta('synopsis-script', 'run-syn'));
  const s = StoryM.loadStory();
  ok(hasRun(s, 'run-syn') && s.aiFill[0].fields[0] === 'logline' && s.aiFill[0].mode === 'fill', 'synopsis-script: the story root carries a fill of the logline');
  ok(!Stamp.isEdited('story', s, s.aiFill[0]), 'synopsis-script: the logline fill is unedited');
  const filled = s.outline.find((x) => x.id === empty.id);
  ok(filled.aiFill && filled.aiFill[0].run === 'run-syn' && filled.aiFill[0].mode === 'fill', 'synopsis-script: a blank step it filled carries a fill');
  const made = s.outline.filter((x) => x.ai && x.ai.run === 'run-syn');
  ok(made.length >= 1, 'synopsis-script: a step it made carries the created stamp');
  undo();
  const back = StoryM.loadStory();
  ok(!('aiFill' in back) && back.logline === '', 'synopsis-script: Undo clears the logline and its stamp');
  ok(!('aiFill' in back.outline.find((x) => x.id === empty.id)), 'synopsis-script: …and the filled step\'s stamp');
  /* kept cards of a stopped run carry no memory: an earlier run's must not be written */
  let threw = false;
  try { t.apply([{ id: 'set-up', text: 'x' }], {}, { items: [] }, meta('synopsis-script', 'run-syn2')); } catch (e) { threw = true; }
  ok(threw, 'synopsis-script: a result with no memory of its own fails ("run it first"), never the last run\'s');
  note('synopsis-script');
}

/* ---- gen-scenes, gen-batch ---- */
{
  freshStudio();
  Gen.save({ ...Gen.load(), stage: 'beats', beats: [{ id: 'catalyst', label: 'Catalyst', happens: 'x' }] });
  const t = reg.get('gen-scenes');
  const props = [{ intExt: 'INT', location: 'Stall', dayNight: 'DAY', synopsis: 'One.', eighths: 8, cast: ['Meena'], beat: 'catalyst' }];
  const undo = t.apply(props.map((p, i) => ({ id: 'p' + i, proposal: p, model: 'mm' })), { patch: () => ({}), replaceScenes: () => false }, null, meta('gen-scenes', 'run-gs'));
  const rows = Scenes.listScenes();
  ok(rows.length === 1 && rows[0].ai && rows[0].ai.run === 'run-gs' && rows[0].ai.task === 'gen-scenes', 'gen-scenes: the scene row carries the stamp');
  ok(!Stamp.isEdited('scene', rows[0], rows[0].ai), 'gen-scenes: unedited at first (hash of the row as read back)');
  const ch = Chars.loadCharacters();
  ok(ch.length === 1 && ch[0].ai && ch[0].ai.run === 'run-gs' && !Stamp.isEdited('character', ch[0], ch[0].ai), 'gen-scenes: a character it CREATED carries the stamp, unedited');
  Chars.saveCharacters(ch.map((c) => ({ ...c, want: 'Money' })));
  ok(Stamp.isEdited('character', Chars.loadCharacters()[0], Chars.loadCharacters()[0].ai), 'gen-scenes: a card the writer fills in reads edited');
  undo();
  eq(Scenes.listScenes().length, 0, 'gen-scenes: Undo takes the rows back');
  note('gen-scenes');

  freshStudio();
  Script.saveScript({ elements: [], revisions: [], documents: [] });
  const sc = (n) => ({ sceneId: 'g' + n, slug: 'INT. ROOM ' + n + ' - DAY', synopsis: 'S' + n });
  Gen.save({ ...Gen.load(), stage: 'pages', cursor: 0, scenes: [1, 2].map(sc) });
  const els = (n) => [{ type: 'scene', text: 'INT. ROOM ' + n + ' - DAY' }, { type: 'action', text: 'Body ' + n + '.' }];
  const draft = { cursor: 0, batch: [1, 2].map(sc), byScene: { g1: els(1), g2: els(2) }, model: 'mm', truncated: false };
  const tb = reg.get('gen-batch');
  const undoB = tb.apply([{ id: 'g1', draft }, { id: 'g2', draft }], {}, null, meta('gen-batch', 'run-gb'));
  const lines = Script.loadScript().elements;
  eq(lines.length, 4, 'gen-batch: four lines');
  ok(lines.every((e) => e.ai && e.ai.run === 'run-gb' && e.ai.task === 'gen-batch' && !Stamp.isEdited('element', e, e.ai)), 'gen-batch: every appended line carries the stamp, unedited');
  ok(lines.every((e) => e.type === 'scene' || e.type === 'action'), 'gen-batch: the line text and type are exactly the drafted ones');
  const typed = Script.loadScript(); typed.elements[1].text = 'Body 1, retyped.'; Script.saveScript(typed);
  ok(Stamp.isEdited('element', Script.loadScript().elements[1], Script.loadScript().elements[1].ai), 'gen-batch: a retyped line reads edited');
  /* QA r2 K: a line edited since Accept makes the Undo refuse and change
     nothing, rather than take the writer's retyped words back. */
  undoB();
  eq(Script.loadScript().elements.length, 4, 'gen-batch: Undo refuses after a retype and keeps every line');
  note('gen-batch');
}

/* ---- dialogue-pass, voice-check, logline, genre-comps ---- */
{
  const undoFetch = installFakeFetch(async (req) => {
    if (/--- THE SPEECH TO WORK ON ---/.test(req.user)) return { keep: 'Plain.', options: [{ text: 'The bus is late.', note: 'Shorter.' }, { text: 'That bus. Late.', note: 'Clipped.' }] };
    throw new Error('fake-ai: unrecognised prompt');
  });
  AI.setProvider('anthropic'); AI.setKey('sk-ant-HISTORYTESTKEY00000001');
  const doc = { elements: [{ id: 'a1', type: 'scene', text: 'INT. TEA STALL - DAY' }, { id: 'a2', type: 'character', text: 'MEENA' },
    { id: 'a3', type: 'dialogue', text: 'The bus is late again, like every single day.' }] };
  const ctx = { getDoc: () => doc, save: () => {}, render: () => {}, elId: 'a3' };
  const t = reg.get('dialogue-pass');
  const r = await t.run(t.input(ctx), { ctx });
  const undo = t.apply(r.proposed, ctx, r, meta('dialogue-pass', 'run-dp'));
  const el = doc.elements[2];
  const f = Stamp.readStamp(el).fills;
  eq(f.map((x) => [x.run, x.mode, x.fields]), [['run-dp', 'replace', ['text', 'alts']]], 'dialogue-pass: a REPLACE of the text (and an append of the takes) on the line');
  ok(!Stamp.isEdited('element', el, f[0]), 'dialogue-pass: unedited straight after');
  el.text = 'Typed over it.';
  ok(Stamp.isEdited('element', el, f[0]), 'dialogue-pass: a retype reads edited');
  el.text = 'The bus is late.';
  undo();
  ok(!('aiFill' in doc.elements[2]), 'dialogue-pass: Undo takes the stamp with the words');
  undoFetch();
  note('dialogue-pass');

  // voice-check through the Coverage tab's own ports (ui/coverage.js stamps in the same two calls)
  const covSrc = readFileSync(new URL('../src/ui/coverage.js', import.meta.url), 'utf8');
  ok(/ai\.fill\('element', el, \['alts'\], 'append'\)/.test(covSrc) && /ai\.drop\(el\)/.test(covSrc) && !/from '\.\.\/lib\/ai-stamp\.js'/.test(covSrc), 'voice-check: ui/coverage.js stamps a take as an append and Undo drops it, through the run\'s stamper (source), importing no stamp code');
  const lines = [{ id: 'v1', type: 'dialogue', text: 'Go now.' }];
  Ports.setPort('addTake', (id, text, ai) => {
    const e = lines.find((x) => x.id === id); if (!e) return 'gone';
    e.alts = (e.alts || []).concat(text);
    if (ai) e.aiFill = ai.fill('element', e, ['alts'], 'append').aiFill;   // the same calls as ui/coverage.js addTake
    return 'ok';
  });
  Ports.setPort('removeTake', (id, text, ai) => {
    const e = lines.find((x) => x.id === id); if (!e) return;
    e.alts = e.alts.filter((x) => x !== text); if (!e.alts.length) delete e.alts;
    if (ai) { const n = ai.drop(e); if (n.aiFill) e.aiFill = n.aiFill; else delete e.aiFill; }
  });
  const tv = reg.get('voice-check');
  const undoV = tv.apply([{ elId: 'v1', rewrite: 'Leave.' }, { elId: 'v1', rewrite: 'Run.' }], {}, null, meta('voice-check', 'run-vc'));
  eq(lines[0].aiFill.map((x) => [x.run, x.mode, x.fields]), [['run-vc', 'append', ['alts']]], 'voice-check: ONE append entry for the run, naming alts');
  ok(!Stamp.isEdited('element', lines[0], lines[0].aiFill[0]), 'voice-check: unedited at first');
  undoV();
  ok(!('aiFill' in lines[0]) && !('alts' in lines[0]), 'voice-check: Undo takes the takes and the stamp');
  note('voice-check');
}
{
  freshStudio();
  let st = StoryM.blankStory(); st.logline = 'Mine.'; StoryM.saveStory(st);
  const t = reg.get('logline');
  const get = () => StoryM.loadStory();
  const ctx = { getLogline: () => get().logline, getStory: get,
    setLogline: (x) => { const s = get(); s.logline = x; StoryM.saveStory(s); },
    setLoglineAlts: (list) => { const s = get(); s.loglineAlts = list; StoryM.saveStory(s); } };
  const undo = t.apply([{ id: 'v0', text: 'V0.' }, { id: 'v1', text: 'V1.' }], ctx, null, meta('logline', 'run-lg'));
  const s = get();
  eq(s.aiFill.map((x) => [x.run, x.mode, x.fields]), [['run-lg', 'replace', ['logline']], ['run-lg', 'append', ['loglineAlts']]], 'logline: a replace of the logline and an append of the alternates');
  undo();
  ok(!('aiFill' in get()) && get().logline === 'Mine.', 'logline: Undo restores the words and drops the stamp');
  note('logline');

  freshStudio();
  const s1 = StoryM.blankStory(); StoryM.saveStory(s1);
  const g = reg.get('genre-comps');
  const res = { genre: 'Drama', subgenres: ['Migration'], tone: 'quiet', budgetTier: 'low', budgetWhy: 'Three locations.', audience: 'Festival', comps: [], model: 'mm' };
  const undoG = g.apply([{ title: 'Alpha', year: '2010', why: 'a' }], {}, withMemo({ items: [] }, { res }), meta('genre-comps', 'run-gc'));
  const sg = StoryM.loadStory();
  const gf = Stamp.readStamp(sg).fills;
  eq(gf.map((x) => [x.run, x.mode]), [['run-gc', 'fill']], 'genre-comps: over a blank story it is a FILL');
  ok(['genre', 'tone', 'budgetTier', 'budgetWhy', 'audience', 'comps'].every((k) => gf[0].fields.includes(k)), 'genre-comps: it names every field it wrote');
  ok(!Stamp.isEdited('story', sg, gf[0]), 'genre-comps: unedited at first');
  undoG();
  ok(!('aiFill' in StoryM.loadStory()), 'genre-comps: Undo restores the story, stamp and all');
  note('genre-comps');
}

/* ---- coverage, audience-test (a document in the script blob) ---- */
{
  freshStudio();
  const undoFetch = installFakeFetch(async (req) => {
    const u = req.user;
    if (/--- SCENE \S+ ---/.test(u)) { const ns = [...u.matchAll(/--- SCENE (\S+) ---/g)].map((x) => x[1]); return { scenes: ns.map((n) => ({ scene: n, summary: 'Scene ' + n + '.' })), evidence: [] }; }
    if (/Write the coverage/.test(u)) {
      const pt = (note2) => ({ scene: '1', quote: 'Meena pours tea at the stall.', note: note2 });
      return { logline: 'L.', premise: { assessment: 'p', points: [pt('first note')] }, structure: { assessment: 's', actBreaks: [], points: [] },
        character: { protagonist: 'MEENA', want: 'w', need: 'n', assessment: 'c', points: [] }, dialogue: { assessment: 'd', points: [] },
        pacing: { assessment: 'p', points: [] }, marketability: { assessment: 'm', points: [] }, verdict: 'pass', verdictWhy: 'why.' };
    }
    throw new Error('fake-ai: unrecognised prompt');
  });
  const els = [{ id: 'k1', type: 'scene', text: 'INT. TEA STALL - DAY' }, { id: 'k2', type: 'action', text: 'Meena pours tea at the stall.' }];
  const cdoc = { elements: els.map((e) => ({ ...e })), documents: [] };
  let saves = 0;
  const cctx = { getDoc: () => cdoc, save: () => { saves++; }, title: 'Tea' };
  const cov = reg.get('coverage');
  const v = await cov.run('', { ctx: cctx });
  const undo = cov.apply(v.items, cctx, v, meta('coverage', 'run-cov'));
  const d = cdoc.documents.find((x) => x.coverage);
  ok(d && d.ai && d.ai.run === 'run-cov' && d.ai.task === 'coverage' && d.ai.model === 'model-x', 'coverage: the document carries the stamp');
  ok(!Stamp.isEdited('document', d, d.ai), 'coverage: unedited at first');
  undo();
  ok(!cdoc.documents.some((x) => x.ai), 'coverage: Undo puts the checkpoint back (or removes the document), and the stamp is gone either way');
  undoFetch();
  note('coverage');

  const AudS = await import('../src/lib/audience-store.js');
  void AudS;
  const adoc = { elements: [], documents: [] };
  const actx = { getDoc: () => adoc, save: () => {} };
  const at = reg.get('audience-test');
  const res = { sig: 'sg', model: 'mm', at: '2026-11-02T10:00:00.000Z', panel: [], verdicts: {}, moments: [], mean: [], order: [], slumps: [], splits: [], notes: [], requests: 1, scenes: 1, truncated: false };
  let undoA = null, err = null;
  try { undoA = at.apply([], actx, withMemo({ items: [] }, { sig: 'sg', checkpoint: null, res }), meta('audience-test', 'run-aud')); } catch (e) { err = e; }
  ok(!err && adoc.documents.length === 1 && adoc.documents[0].ai && adoc.documents[0].ai.run === 'run-aud', 'audience-test: the document carries the stamp' + (err ? ' — ' + err.message : ''));
  if (undoA) { undoA(); ok(adoc.documents.length === 0, 'audience-test: Undo removes it'); }
  note('audience-test');
}

/* ---- board-frames (Drive-bound: the stamp expression, and the wiring by source) ---- */
{
  freshStudio();
  const src = readFileSync(new URL('../src/lib/ai-tasks.js', import.meta.url), 'utf8');
  ok(/stampAI\('frame', ShotsM\.blankFrame\(\{ ref: DriveM\.driveRef\(meta\.id\)/.test(src), 'board-frames: apply stamps each frame it adds (source)');
  const { shotId: _s, ...frame } = Stamp.stampAI('frame', Shots.blankFrame({ ref: 'drive:abc', caption: '' }), meta('board-frames', 'run-bf'));
  const made = Shots.addFrame('sh1', frame);
  const back = Shots.listFrames()[0];
  ok(back.id === made.id && back.ai && back.ai.run === 'run-bf' && !Stamp.isEdited('frame', back, back.ai), 'board-frames: the frame reads back stamped and unedited');
  note('board-frames');
}

/* ---- blocking-draft, blocking-enhance ---- */
{
  freshStudio();
  Shots.saveShots([]);
  const s1 = Shots.addShot('scA', { size: 'WS' });
  const act = (label, x, y) => ({ kind: 'actor', label, x, y, rot: 0 });
  const cam = (label, x, y) => ({ kind: 'camera', label, x, y, rot: 0, hasMove: false });
  const reply = { floor: { name: 'Hall', note: '', widthM: 8, set: [{ kind: 'door', label: 'Front', x: 0, y: 30, w: 1.2, h: 7, rot: 0 }], axis: { on: true, x1: 10, y1: 30, x2: 90, y2: 30 } },
    actors: [act('MEENA', 40, 30)], shots: [{ shotId: s1.id, number: '1', note: 'Master', marks: [cam('Cam A', 50, 60), act('MEENA', 40, 30)] }] };
  const draft = BlockAI.cleanDraft(reply, { shotIds: [s1.id] });
  const items = BlockAI.draftItems(draft);
  const t = reg.get('blocking-draft');
  const undo = t.apply(items, {}, withMemo({ items }, { sceneId: 'scA', draft }), meta('blocking-draft', 'run-bd'));
  const blocks = Shots.listBlocks();
  eq(blocks.length, 2, 'blocking-draft: a floor plan and a shot diagram');
  ok(blocks.every((b) => b.ai && b.ai.run === 'run-bd' && b.ai.task === 'blocking-draft' && !Stamp.isEdited('block', b, b.ai)), 'blocking-draft: both blocks carry the created stamp, unedited');
  const shot = Shots.listShots()[0];
  ok(shot.cam && Stamp.readStamp(shot).fills.some((f) => f.run === 'run-bd' && f.fields[0] === 'cam' && f.mode === 'fill'), 'blocking-draft: the camera link it filled on the shot is a fill');
  const b0 = blocks.find((b) => b.shotId);
  Shots.updateBlock(b0.id, { name: 'Renamed' });
  ok(Stamp.isEdited('block', Shots.getBlock(b0.id), Shots.getBlock(b0.id).ai), 'blocking-draft: a rename reads edited');
  undo();
  ok(Shots.listBlocks().length === 1 && Shots.listBlocks()[0].id === b0.id, 'blocking-draft: Undo keeps the diagram edited since, removes the other');
  ok(Shots.listShots()[0].cam && Stamp.readStamp(Shots.listShots()[0]).fills.length === 1, 'blocking-draft: …and keeps the camera link of a diagram it keeps, with its stamp (one unit)');
  // an untouched run is taken back whole, the camera-link stamp with it
  freshStudio();
  Shots.saveShots([]);
  const s2 = Shots.addShot('scA', { size: 'WS' });
  const draft2 = BlockAI.cleanDraft({ ...reply, shots: [{ ...reply.shots[0], shotId: s2.id }] }, { shotIds: [s2.id] });
  const items2 = BlockAI.draftItems(draft2);
  const undo2 = t.apply(items2, {}, withMemo({ items: items2 }, { sceneId: 'scA', draft: draft2 }), meta('blocking-draft', 'run-bd2'));
  ok(Shots.listShots()[0].cam && hasRun(Shots.listShots()[0], 'run-bd2'), 'blocking-draft: (second run) the link and its stamp are written');
  undo2();
  ok(Shots.listBlocks().length === 0 && !Shots.listShots()[0].cam && !('aiFill' in Shots.listShots()[0]), 'blocking-draft: an untouched run is undone whole, the camera-link stamp with it');
  note('blocking-draft');

  freshStudio();
  const block = Shots.cleanBlock({ id: 'bk1', sceneId: 'sc1', name: 'Setup 1', widthM: '6',
    marks: [{ id: 'mkA', kind: 'actor', label: 'MEENA', x: 30, y: 30, rot: 90, toX: null, toY: null, path: [], curve: false, charId: 'ch1' }], set: [], axis: null });
  Shots.saveBlocks([block]);
  const sug = (o) => ({ text: '', why: '', markId: '', mark: { kind: 'actor', x: 0, y: 0 }, piece: { kind: 'prop', x: 0, y: 0, w: 1, h: 1 }, axis: { on: false, x1: 0, y1: 0, x2: 0, y2: 0 }, ...o });
  const e = BlockAI.cleanEnhance({ note: '', suggestions: [sug({ type: 'add-set', piece: { kind: 'door', label: 'Kitchen', x: 0, y: 30, w: 1, h: 8, rot: 0 } })] }, { block });
  const te = reg.get('blocking-enhance');
  const undoE = te.apply(e.items, {}, withMemo({ items: e.items }, { blockId: 'bk1' }), meta('blocking-enhance', 'run-be'));
  const nb = Shots.getBlock('bk1');
  eq(nb.aiFill.map((x) => [x.run, x.mode, x.fields]), [['run-be', 'replace', ['marks', 'set', 'axis']]], 'blocking-enhance: a REPLACE on the diagram');
  ok(!Stamp.isEdited('block', nb, nb.aiFill[0]), 'blocking-enhance: unedited at first');
  undoE();
  ok(!('aiFill' in Shots.getBlock('bk1')) && Shots.getBlock('bk1').set.length === 0, 'blocking-enhance: Undo restores the set and drops the stamp');
  note('blocking-enhance');
}

/* ---- the lane tasks: pre-production ---- */
{
  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'c', number: '3', shootDay: 0 }), Scenes.blankScene({ id: 'd', number: '4', shootDay: 0 })]);
  const t = reg.get('shoot-order');
  const undo = t.apply([{ id: 'd3', day: 3, sceneIds: ['d', 'c'] }], {}, null, meta('shoot-order', 'run-so'));
  const rows = Scenes.listScenes();
  ok(rows.every((r) => r.shootDay === 3 && hasRun(r, 'run-so') && r.aiFill[0].mode === 'replace' && r.aiFill[0].fields[0] === 'shootDay'), 'shoot-order: a scene whose DAY changed carries a replace stamp (never undone from History)');
  undo();
  ok(Scenes.listScenes().every((r) => r.shootDay === 0 && !('aiFill' in r)), 'shoot-order: the toast Undo moves the scene back and takes the stamp');
  // a placement that only reorders a day the scene is already on changes the locations `order` list (ids), not a record: NOT stamped
  Scenes.saveScenes([Scenes.blankScene({ id: 'c', number: '3', shootDay: 2 }), Scenes.blankScene({ id: 'd', number: '4', shootDay: 2 })]);
  Loc.setDayOrder && Loc.setDayOrder(2, ['c', 'd']);
  t.apply([{ id: 'd2', day: 2, sceneIds: ['d', 'c'] }], {}, null, meta('shoot-order', 'run-so2'));
  ok(Scenes.listScenes().every((r) => !hasRun(r, 'run-so2')), 'shoot-order: a pure reorder inside a day changes only the order list (ids), so nothing is stamped (the named case)');
  note('shoot-order');

  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'x', number: '1', location: 'Perambur house' })]);
  const rt = reg.get('recce-notes');
  const undoR = rt.apply([{ name: 'Perambur house', fields: { notes: 'To check: the road noise.', parking: 'To check: where the van goes.' } }], {}, null, meta('recce-notes', 'run-rn'));
  const recceOf = () => Loc.locationIndex(Scenes.listScenes())[0].recce;
  const card = recceOf();
  eq(Stamp.readStamp(card).fills.map((x) => [x.run, x.mode, x.fields.sort()]), [['run-rn', 'fill', ['notes', 'parking']]], 'recce-notes: a fill of the blank fields on the card');
  ok(!Stamp.isEdited('recce', card, Stamp.readStamp(card).fills[0]), 'recce-notes: unedited at first');
  undoR();
  ok(!('aiFill' in recceOf()) && recceOf().notes === '', 'recce-notes: Undo blanks the fields and drops the stamp');
  note('recce-notes');

  freshStudio();
  Contacts.saveCallSheets([Contacts.blankCallSheet({ id: 'cs1', title: 'Day 1' })]);
  const ct = reg.get('callsheet-notes');
  const undoC = ct.apply('Bring umbrellas.', { sheetId: 'cs1' }, withMemo({}, { sheetId: 'cs1', unit: '' }), meta('callsheet-notes', 'run-cn'));
  const sheet = Contacts.listCallSheets()[0];
  eq([sheet.notes, sheet.aiFill && sheet.aiFill.map((x) => [x.run, x.mode, x.fields])], ['Bring umbrellas.', [['run-cn', 'fill', ['notes']]]], 'callsheet-notes: a fill of the notes box');
  undoC();
  ok(!('aiFill' in Contacts.listCallSheets()[0]) && Contacts.listCallSheets()[0].notes === '', 'callsheet-notes: Undo blanks the notes and drops the stamp');
  note('callsheet-notes');
}

/* ---- budget-estimate: the ONE documented exception ---- */
{
  const src = readFileSync(new URL('../src/lib/ai-tasks-preprod.js', import.meta.url), 'utf8');
  const ui = readFileSync(new URL('../src/ui/budget.js', import.meta.url), 'utf8');
  ok(/NOT STAMPED — the one named exception/.test(src), 'budget-estimate: the exception is written where its apply is');
  ok(/function saveCalc\(\) \{\s*const data = \{\};\s*document\.querySelectorAll\('#calcRows \[data-key\]'\)/.test(ui), 'budget-estimate: the reason still holds — saveCalc() rebuilds the blob from the page inputs, so a ci_<n>_ai key would be dropped');
  note('budget-estimate');
}

/* ---- the lane tasks: post, story ---- */
{
  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1' })]);
  const t = reg.get('edit-notes');
  const undo = t.apply([{ sceneId: 'r1', note: 'Tighten the entrance.' }], {}, withMemo({ items: [] }, {}), meta('edit-notes', 'run-en'));
  const rec = Edit.sceneEdit('r1');
  eq(rec.aiFill.map((x) => [x.run, x.mode, x.fields]), [['run-en', 'fill', ['note']]], 'edit-notes: a fill of the scene\'s edit note');
  undo();
  ok(!('aiFill' in Edit.sceneEdit('r1')) && Edit.sceneEdit('r1').note === '', 'edit-notes: Undo blanks the note and drops the stamp');
  note('edit-notes');

  freshStudio();
  const chars = [Chars.blankCharacter({ id: 'ch1', name: 'MEENA' }), Chars.blankCharacter({ id: 'ch2', name: 'RAVI', arc: 'Mine.' })];
  Chars.saveCharacters(chars);
  const ca = reg.get('character-arcs');
  const cctx = { list: () => Chars.loadCharacters(), save: () => {}, rerender: () => {} };
  let lst = Chars.loadCharacters();
  const cctx2 = { list: () => lst, save: () => { Chars.saveCharacters(lst); }, rerender: () => {} };
  void cctx;
  const undoCA = ca.apply([{ characterId: 'ch1', fields: { arc: 'She learns to leave.', arcStart: 'Stays', arcEnd: 'Goes' } }], cctx2, null, meta('character-arcs', 'run-ca'));
  const m1 = Chars.loadCharacters().find((c) => c.id === 'ch1');
  ok(m1.arc === 'She learns to leave.' && hasRun(m1, 'run-ca'), 'character-arcs: the card carries the stamp');
  eq(m1.aiFill.map((x) => [x.run, x.mode]), [['run-ca', 'fill']], 'character-arcs: one fill entry for the run');
  ok(['arc', 'arcStart', 'arcEnd'].every((k) => m1.aiFill[0].fields.includes(k)) && !Stamp.isEdited('character', m1, m1.aiFill[0]), 'character-arcs: it names the fields it filled, unedited');
  ok(!hasRun(Chars.loadCharacters().find((c) => c.id === 'ch2'), 'run-ca'), 'character-arcs: a card nobody filled is not stamped');
  lst = Chars.loadCharacters();
  undoCA();
  ok(!('aiFill' in Chars.loadCharacters().find((c) => c.id === 'ch1')), 'character-arcs: Undo blanks the fields and drops the stamp');
  note('character-arcs');

  freshStudio();
  const orig = [{ id: 'u1', type: 'action', text: 'Meena enters the stall quickly.' }, { id: 'u2', type: 'action', text: 'She sits' }];
  const doc = { elements: clone(orig) };
  const tc = reg.get('script-cleanup');
  const snap = { block: clone(orig), above: [], below: null };
  const items = [{ id: 'x0', text: 'Meena enters the stall quickly.' }, { id: 'x1', text: 'She sits.' }];
  const all = [{ id: 'x0', type: 'action', text: 'Meena enters the stall quickly.' }, { id: 'x1', type: 'dialogue', text: 'She sits.' }];
  const cc = { getDoc: () => doc, save: () => {}, render: () => {}, after: () => {}, say: () => {},
    setType: (id, type) => { const e = doc.elements.find((x) => x.id === id); if (e) e.type = type; } };
  const undoCl = tc.apply(items, cc, withMemo({ items: all }, { snap, originals: clone(orig) }), meta('script-cleanup', 'run-cl'));
  const els2 = doc.elements;
  const kept = els2.find((e) => e.id === 'u1');
  const fresh = els2.filter((e) => e.ai && e.ai.run === 'run-cl');
  ok(kept && !kept.ai, 'script-cleanup: a line that came back unchanged keeps its element and is NOT stamped');
  ok(fresh.length === 1 && !Stamp.isEdited('element', fresh[0], fresh[0].ai), 'script-cleanup: the new line is stamped, unedited, after its type change');
  void undoCl;
  note('script-cleanup');
}

/* ============================================================
   5. History Undo, from a fresh read
   ============================================================ */
{
  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1' })]);
  const t = reg.get('shot-draft');
  const items = [1, 2, 3].map((n) => ({ sceneId: 'r1', draft: { size: 'WS', angle: 'eye level', movement: 'static', description: 'Shot ' + n } }));
  t.apply(items, {}, null, meta('shot-draft', 'run-h'));
  const second = Shots.listShots()[1];
  Shots.updateShot(second.id, { description: 'I rewrote this one.' });
  const entries = Read.readProjectAI();
  const g = H.groupByRun(entries).find((x) => x.run === 'run-h');
  eq([g.count, g.edited, g.undoable], [3, 1, 2], 'history: three shots, one edited, two undoable');
  // an edit made AFTER the list was drawn is seen: the revert re-reads
  const third = Shots.listShots()[2];
  Shots.updateShot(third.id, { description: 'Typed after the list was drawn.' });
  const r = Revert.revertEntries(g.items);
  eq([r.reverted, r.kept], [1, 2], 'history Undo: removed the one still unchanged, kept both edited (the later edit was seen), said both numbers');
  eq(Shots.listShots().map((s) => s.description), ['I rewrote this one.', 'Typed after the list was drawn.'], 'history Undo: only the unchanged shot is gone');
  ok(Shots.listShots().every((s) => s.ai), 'history Undo: the edited shots keep their stamp');

  // a fill is blanked (and its stamp dropped) only while unchanged
  freshStudio();
  Contacts.saveCallSheets([Contacts.blankCallSheet({ id: 'cs1' }), Contacts.blankCallSheet({ id: 'cs2' })]);
  const ct = reg.get('callsheet-notes');
  ct.apply('Notes one.', { sheetId: 'cs1' }, withMemo({}, { sheetId: 'cs1', unit: '' }), meta('callsheet-notes', 'run-f1'));
  ct.apply('Notes two.', { sheetId: 'cs2' }, withMemo({}, { sheetId: 'cs2', unit: '' }), meta('callsheet-notes', 'run-f2'));
  Contacts.updateCallSheet('cs2', { notes: 'Notes two, edited.' });
  const all = Read.readProjectAI();
  const rf = Revert.revertEntries(all.filter((e) => e.task === 'callsheet-notes'));
  eq([rf.reverted, rf.kept], [1, 1], 'history Undo: one fill blanked, the edited one kept');
  const sheets = Contacts.listCallSheets();
  eq([sheets[0].notes, 'aiFill' in sheets[0], sheets[1].notes, 'aiFill' in sheets[1]], ['', false, 'Notes two, edited.', true], 'history Undo: blank + stamp dropped / edited kept with its stamp');

  // append and replace are never undone
  freshStudio();
  Scenes.saveScenes([Scenes.blankScene({ id: 'r1', number: '1' })]);
  reg.get('beat-critique').apply([{ id: 'a', text: 'T.', keep: 'T.', scene: { sceneId: 'r1' } }], {}, null, meta('beat-critique', 'run-ap'));
  const rap = Revert.revertRun('run-ap');
  eq([rap.reverted, rap.notUndoable], [0, 1], 'history Undo: an append is not undone from History (it says so)');
  ok(Scenes.listScenes()[0].readerNote.includes('T.'), 'history Undo: the note is still on the scene');

  // a scene row and a script line the generator wrote are kept
  freshStudio();
  Gen.save({ ...Gen.load(), stage: 'beats', beats: [{ id: 'catalyst', label: 'Catalyst', happens: 'x' }] });
  reg.get('gen-scenes').apply([{ id: 'p0', proposal: { intExt: 'INT', location: 'Stall', dayNight: 'DAY', synopsis: 'One.', eighths: 8, cast: [], beat: 'catalyst' }, model: 'm' }], { patch: () => ({}), replaceScenes: () => false }, null, meta('gen-scenes', 'run-gen'));
  const rg = Revert.revertRun('run-gen');
  eq([rg.reverted, Scenes.listScenes().length], [0, 1], 'history Undo: a scene row the generator wrote is not removed from History');
}

/* ============================================================
   6. ANTI-ROT: a task with an apply that is not stamped fails here
   ============================================================ */
{
  const EXCEPTIONS = {
    'budget-estimate': 'ci_<n>_* rows are rebuilt from the page inputs on every save (src/ui/budget.js saveCalc), so a stamp key would be dropped'
  };
  const withApply = [...reg.values()].filter((t) => typeof t.apply === 'function').map((t) => t.id);
  const unstamped = withApply.filter((id) => !STAMPED.has(id) && !(id in EXCEPTIONS));
  eq(unstamped, [], 'anti-rot: every registered task with an apply is stamped (or a named exception) — a new task needs a stamp, a row in section B3 and a block in this file');
  ok(withApply.length >= 30, 'anti-rot: the registry is read (' + withApply.length + ' tasks with an apply)');
  eq([...STAMPED].filter((id) => !withApply.includes(id)), [], 'anti-rot: this file stamps nothing that no longer exists');
  // every task id is known to the history's stage map (no "other" stage for a shipped task)
  eq(withApply.filter((id) => H.stageOf(id) === 'other'), [], 'anti-rot: every task with an apply has a stage in ai-history.js');
  eq(withApply.filter((id) => H.taskName(id) === id), [], 'anti-rot: …and a name');
}

console.log(`test:ai-history — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
