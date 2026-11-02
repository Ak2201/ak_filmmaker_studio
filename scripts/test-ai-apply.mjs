/* ============================================================
   test:ai-apply — what the Desk's breakdown-side tasks WRITE on
   Accept, in Node, against a faked model (scripts/fake-ai.mjs). No key,
   no network, no browser. ai-tasks.js runs for real over an in-memory
   localStorage; the model replies are canned.

   Proves, per task:
     shot-draft      drafted shots land in shots.js with rig and setup
                     filled, flagged ai; the CSV header does not move;
                     Undo removes exactly those shots
     scene-notes     a note is APPENDED to a typed readerNote as a line
                     marked "AI (Scene notes):" (scenes.js
                     appendSceneNotes, shared with the read-only
                     tools), never written over it; cutCandidate is only
                     raised when unset; a position-only pair is used
                     when the writer's scene number agrees and left out
                     (and counted) when it does not; Undo restores the
                     exact previous values; unknown row fields survive
     breakdown-tags  an unknown category and a position-only scene are
                     left out and COUNTED in the done note even when
                     something was tagged; Undo removes only what it added
     genre-comps     tone and budgetWhy land on the story beside genre,
                     budget tier and comps; a typed audience is kept;
                     story.js reads both new fields back; Undo restores
     draft-changes, cert-read, day-wrap-summary (the lane reads)
                     Run writes nothing and returns points; Accept keeps
                     them as sticky notes (a wrap point naming ONE of the
                     day's scenes goes on that row's note, appended);
                     Undo leaves the notes board and the scene list as
                     they were
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
        'export const onWriteElsewhere = () => () => {};' +
        'export const flushStorage = () => {};' +
        // Any other Store method (drive-sync.js subscribes at import) is a no-op.
        'export default new Proxy({}, { get: () => () => {} });'), shortCircuit: true };
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

const { installFakeFetch } = await import('./fake-ai.mjs');
const AI = await import('../src/lib/ai.js');
const Scenes = await import('../src/lib/scenes.js');
const Shots = await import('../src/lib/shots.js');
const Story = await import('../src/lib/story.js');
const X = await import('../src/lib/shotlist-export.js');
const T = await import('../src/lib/ai-tasks.js');
const tasks = {};
T.registerAll((t) => { tasks[t.id] = t; });

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), m + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const throws = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

/* ---- the script and the breakdown -------------------------------- */
let n = 0;
const E = (type, text, extra) => ({ id: 'e' + (++n), type, text, ...(extra || {}) });
const els = [
  E('scene', 'INT. ANBU HOUSE - NIGHT', { sceneNumber: '1' }),
  E('action', 'Anbu counts coins on the floor. The ceiling fan ticks.'),
  E('scene', 'EXT. BUS STAND - DAY', { sceneNumber: '2' }),
  E('action', 'A crowd waits. Anbu holds one red bag, looking back once.'),
  E('scene', 'EXT. TEMPLE - DAY', { sceneNumber: '3' }),
  E('action', 'Bells. Anbu lights a lamp and does not pray.')
];
const ctxEls = () => els;
const seedScenes = () => {
  Scenes.saveScenes([
    // heading match; the writer typed a note and already flagged it
    Scenes.blankScene({ id: 'r1', number: '1', intExt: 'INT', location: 'ANBU HOUSE', dayNight: 'NIGHT', readerNote: 'Typed by me.', cutCandidate: true }),
    // a different place: paired by POSITION only, but the number agrees
    Scenes.blankScene({ id: 'r2', number: '2', intExt: 'EXT', location: 'MARKET', dayNight: 'DAY', zzz: 'a later build’s field' }),
    // position only, and the number disagrees: a guess, left out
    Scenes.blankScene({ id: 'r3', number: '9', intExt: 'EXT', location: 'BEACH', dayNight: 'DAY' })
  ]);
};
mem.set('fms_script_v1', JSON.stringify({ elements: els }));

AI.setProvider('anthropic');
AI.setKey('sk-ant-TESTTESTTESTTESTTEST');
installFakeFetch(async (req) => {
  const u = req.user;
  if (/into a shot division/.test(u)) {
    const ids = [...u.matchAll(/sceneId: (\S+)/g)].map((m) => m[1]);
    return { scenes: ids.map((id) => ({ sceneId: id, shots: [
      { size: 'WS', angle: 'eye level', movement: 'static', lens: '24mm', rig: 'Key from window, sticks', setup: 'Setup 1', description: 'The room, Anbu on the floor.' },
      { size: 'CU', angle: 'eye level', movement: 'static', lens: '85mm', rig: '', setup: 'Setup 2', description: 'The coins.', extra: 'not a field' }
    ] })) };
  }
  if (/Write ONE note for EVERY scene/.test(u)) {
    return { notes: [
      { scene: '1', note: 'Establishes want.', cut: false, quote: 'Anbu counts coins on the floor.' },
      { scene: '2', note: 'The leaving.', cut: true, quote: 'A crowd waits.' },
      { scene: '3', note: 'A held beat.', cut: true, quote: 'Anbu lights a lamp' }
    ] };
  }
  if (/what changed between two drafts/.test(u)) {
    return { summary: 'A cigarette was added.', scenes: [{ heading: 'INT. ANBU HOUSE - NIGHT', change: 'Anbu now lights a cigarette.' }, { heading: 'INT. INVENTED', change: 'x' }],
      watch: ['The lighter must be on the table in scene 1.'] };
  }
  if (/certification rules/.test(u)) {
    return { read: 'Mostly clean.', rules: [{ ruleId: 'tobacco', why: 'A health warning is needed.' }, { ruleId: 'madeup', why: 'x' }],
      questions: ['Is the cigarette needed?'] };
  }
  if (/Place the screenplay/.test(u)) {
    return { genre: 'Drama', subgenres: ['Migration'], tone: 'quiet, aching', budgetTier: 'low',
      budgetWhy: 'Three locations, no night exteriors.', audience: 'Somebody else',
      comps: [{ title: 'Alpha', year: '2010', why: 'a' }, { title: 'Beta', year: '', why: 'b' }],
      evidence: [] };
  }
  return {};
});

/* ---- shot-draft ---------------------------------------------------- */
{
  seedScenes();
  const before = Shots.listShots().length;
  let afterIds = null;
  const ctx = { sceneIds: ['r1'], after: (ids) => { afterIds = ids; } };
  const res = await tasks['shot-draft'].run('', { ctx });
  eq(res.items.length, 2, 'shot-draft: two drafted shots offered');
  ok(/Key from window/.test(res.items[0].detail) && /Setup 1/.test(res.items[0].detail), 'shot-draft: the row shows rig and setup before Accept');
  ok(Shots.listShots().length === before, 'shot-draft: nothing written before Accept');
  const undo = tasks['shot-draft'].apply(res.items, ctx);
  const made = Shots.listShots().filter((s) => s.sceneId === 'r1');
  eq(made.map((s) => [s.size, s.lens, s.rig, s.setup, s.ai]), [['WS', '24mm', 'Key from window, sticks', 'Setup 1', true], ['CU', '85mm', '', 'Setup 2', true]],
    'shot-draft: size, lens, rig and setup land on the shot, flagged ai');
  ok(!('extra' in made[1]), 'shot-draft: a field the shot model does not have is not written');
  eq(afterIds && afterIds.length, 2, 'shot-draft: the page is told which shots were made');
  eq(X.CSV_HEADER.slice(0, 18), ['Scene', 'Slug', 'Int/Ext', 'Time', 'Location', 'Scene pages', 'Shot', 'Size', 'Angle', 'Movement', 'Lens', 'Lighting / rig', 'Camera', 'What we see', 'Status', 'Drafted by', 'Setup', 'Minutes'],
    'shot-draft: the CSV header is the fixed one');
  const csv = X.toCSV('all').slice(1).split('\r\n');
  eq(csv[0], X.CSV_HEADER.map((c) => '"' + c + '"').join(','), 'shot-draft: the export still opens with that header');
  ok(csv.some((l) => /Key from window, sticks/.test(l) && /Setup 1/.test(l)), 'shot-draft: the drafted rig and setup reach the CSV');
  undo();
  eq(Shots.listShots().length, before, 'shot-draft: Undo removes exactly the drafted shots');
}

/* ---- scene-notes --------------------------------------------------- */
{
  seedScenes();
  let afters = 0;
  const ctx = { elements: ctxEls, title: 'T', after: () => { afters++; } };
  const res = await tasks['scene-notes'].run('', { ctx });
  eq(res.items.length, 3, 'scene-notes: one note per scene offered');
  const raw0 = mem.get('fms_scenes_v1');
  const undo = tasks['scene-notes'].apply(res.items, ctx, res);
  const by = Object.fromEntries(Scenes.listScenes().map((s) => [s.id, s]));
  eq(by.r1.readerNote, 'Typed by me.\nAI (Scene notes): Establishes want.', 'scene-notes: appended to the typed note, marked AI');
  eq(by.r1.cutCandidate, true, 'scene-notes: a flag already set is not cleared by a "keep" note');
  eq(by.r2.readerNote, 'AI (Scene notes): The leaving.', 'scene-notes: a position pair whose scene number agrees takes its note');
  eq(by.r2.cutCandidate, true, 'scene-notes: an unset flag is raised');
  eq(by.r2.zzz, 'a later build’s field', 'scene-notes: an unknown row field survives the write');
  eq([by.r3.readerNote, by.r3.cutCandidate], ['', false], 'scene-notes: a position pair whose number disagrees is left alone');
  ok(typeof undo === 'function' && /1 note left out/.test(undo.note || ''), 'scene-notes: what was left out is said — ' + undo.note);
  ok(afters === 1, 'scene-notes: the page redraws once');
  undo();
  eq(JSON.parse(mem.get('fms_scenes_v1')).scenes.map((s) => [s.id, s.readerNote, s.cutCandidate]),
    JSON.parse(raw0).scenes.map((s) => [s.id, s.readerNote, s.cutCandidate]), 'scene-notes: Undo restores the exact previous values');
  // Undo takes out only what it added: a person's edit after Accept stays.
  {
    const u2 = tasks['scene-notes'].apply([res.items[0]], ctx, res);
    const rows = JSON.parse(mem.get('fms_scenes_v1'));
    rows.scenes.find((s) => s.id === 'r1').readerNote += '\nMy later thought.';
    mem.set('fms_scenes_v1', JSON.stringify(rows));
    u2();
    eq(Scenes.listScenes().find((s) => s.id === 'r1').readerNote, 'Typed by me.\nMy later thought.', 'scene-notes: Undo keeps an edit made after Accept');
    rows.scenes.find((s) => s.id === 'r1').readerNote = 'Typed by me.';
    mem.set('fms_scenes_v1', JSON.stringify(rows));
  }
  // A second Accept of the same note adds nothing twice.
  tasks['scene-notes'].apply([res.items[0]], ctx, res);
  const e = await throws(() => tasks['scene-notes'].apply([res.items[0]], ctx, res));
  ok(e && /already on their scenes/.test(e.message), 'scene-notes: the same note twice is refused, not doubled');
  eq(Scenes.listScenes().find((s) => s.id === 'r1').readerNote, 'Typed by me.\nAI (Scene notes): Establishes want.', 'scene-notes: …and the note is unchanged');
  const only = await throws(() => tasks['scene-notes'].apply([res.items[2]], ctx, res));
  ok(only && /position only/.test(only.message), 'scene-notes: only an unmatched scene ticked fails, saying why');
}

/* ---- breakdown-tags ------------------------------------------------ */
{
  seedScenes();
  const ctx = { elements: ctxEls, after: () => {} };
  const items = [
    { i: 0, scene: '1', category: 'props', name: 'coins' },
    { i: 1, scene: '2', category: 'props', name: 'red bag' },
    { i: 2, scene: '3', category: 'props', name: 'lamp' },          // position only, number disagrees
    { i: 0, scene: '1', category: 'dragons', name: 'a dragon' }       // not a category
  ];
  const undo = tasks['breakdown-tags'].apply(items, ctx);
  const by = Object.fromEntries(Scenes.listScenes().map((s) => [s.id, s]));
  eq(by.r1.elements.props, ['coins'], 'breakdown-tags: a heading-matched scene is tagged');
  eq(by.r2.elements.props, ['red bag'], 'breakdown-tags: a number-corroborated scene is tagged');
  eq(by.r3.elements.props || [], [], 'breakdown-tags: the guessed scene is not');
  ok(!('dragons' in by.r1.elements), 'breakdown-tags: an unknown category opens no bucket');
  ok(/2 elements tagged/.test(undo.note) && /1 element left out: the scene is matched by position only/.test(undo.note)
    && /1 element left out: not a breakdown category/.test(undo.note), 'breakdown-tags: a partial Accept says what it left out — ' + undo.note);
  undo();
  ok(Scenes.listScenes().every((s) => !(s.elements.props || []).length), 'breakdown-tags: Undo removes exactly what it added');
  const e = await throws(() => tasks['breakdown-tags'].apply([items[2], items[3]], ctx));
  ok(e && /Nothing was tagged/.test(e.message) && /position only/.test(e.message) && /not a breakdown category/.test(e.message),
    'breakdown-tags: nothing tagged says every reason — ' + (e && e.message));
}

/* ---- genre-comps --------------------------------------------------- */
{
  let story = { ...Story.blankStory(), audience: 'Typed audience' };
  const ctx = { elements: ctxEls, title: 'T', getStory: () => JSON.parse(JSON.stringify(story)), commit: (s) => { story = s; } };
  const res = await tasks['genre-comps'].run('', { ctx });
  ok(/tone: quiet, aching/.test(res.note), 'genre-comps: the tone is shown before Accept');
  const undo = tasks['genre-comps'].apply(res.items.slice(0, 1), ctx, res);
  eq([story.genre, story.tone, story.budgetTier, story.budgetWhy, story.audience, story.comps.map((c) => c.title)],
    ['Drama / Migration', 'quiet, aching', 'low', 'Three locations, no night exteriors.', 'Typed audience', ['Alpha']],
    'genre-comps: tone and budgetWhy land beside genre, tier and the ticked comps; a typed audience is kept');
  Story.saveStory(story);
  const back = Story.loadStory();
  eq([back.tone, back.budgetWhy], ['quiet, aching', 'Three locations, no night exteriors.'], 'story.js reads tone and budgetWhy back');
  eq([Story.blankStory().tone, Story.blankStory().budgetWhy], ['', ''], 'story.js: a blank story has both, empty');
  undo();
  eq([story.genre, story.tone, story.budgetWhy, story.comps], ['', '', '', []], 'genre-comps: Undo restores the story as it was');
}

/* ---- read tools keep notes: a positional number never picks a row ---- */
{
  // No scene numbers typed; a scene inserted second. Its positional "2"
  // must not land on the scene list's row numbered 2 (ROAD).
  let k = 0;
  const X = (type, text) => ({ id: 'q' + (++k), type, text });
  const els2 = [X('scene', 'INT. KITCHEN - DAY'), X('action', 'Eggs.'), X('scene', 'INT. ATTIC - NIGHT'), X('action', 'Dust.'), X('scene', 'EXT. ROAD - DAY'), X('action', 'Cars.')];
  const raw = mem.get('fms_script_v1');
  mem.set('fms_script_v1', JSON.stringify({ elements: els2 }));
  Scenes.saveScenes([
    Scenes.blankScene({ id: 'k1', number: '1', intExt: 'INT', location: 'KITCHEN', dayNight: 'DAY' }),
    Scenes.blankScene({ id: 'k2', number: '2', intExt: 'EXT', location: 'ROAD', dayNight: 'DAY' })
  ]);
  const ctx = { elements: () => els2 };
  const u = tasks['tension-notes'].apply([{ id: 't0', text: 'x', keep: 'Attic sags', where: 'Sc 2', scene: { sceneId: '', n: '2', heading: 'INT. ATTIC - NIGHT' } }], ctx);
  eq(Scenes.listScenes().map((s) => s.readerNote), ['', ''], 'keep notes: a positional scene number never puts a note on another row');
  ok(/sticky note/.test(u.said), 'keep notes: the unmatched point became a sticky note — ' + u.said);
  u();
  const it = [{ id: 't1', text: 'x', keep: 'Kitchen drags', where: 'Sc 1', scene: { sceneId: 'k1', n: '1' } }];
  const u1 = tasks['tension-notes'].apply(it, ctx);
  ok(/saved 1 note on the scene list \(Sc 1\)/.test(u1.said), 'keep notes: first Accept says it saved — ' + u1.said);
  const e2 = await throws(() => tasks['tension-notes'].apply(it, ctx));
  ok(e2 && /already on its scene/.test(e2.message), 'keep notes: the same point again says it is already there, with no empty Undo — ' + (e2 && e2.message));
  const u3 = tasks['tension-notes'].apply([...it, { id: 't2', text: 'y', keep: 'Kitchen fridge hums', scene: { sceneId: 'k1' } }], ctx);
  ok(/saved 1 note/.test(u3.said) && /1 note was already there/.test(u3.said), 'keep notes: the toast counts what was written and what was already there — ' + u3.said);
  u3(); u1();
  mem.set('fms_script_v1', raw);
}

/* ---- the lane reads keep notes (draft-changes, cert-read, day-wrap) ---- */
{
  const PM = await import('../src/lib/ai-post-model.js');
  const vaultNow = () => Story.listVault().map((x) => x.id).join();
  seedScenes();
  const v0 = vaultNow(), s0 = JSON.stringify(Scenes.listScenes());
  const older = els.slice(0, 2);
  const newer = [els[0], { id: 'zz', type: 'action', text: 'Anbu lights a cigarette.' }, ...els.slice(1, 2)];
  const ctxD = { olderId: 'a', newerId: 'b', compare: () => ({ older, newer, olderLabel: 'Draft 1', newerLabel: 'The script now' }) };
  ok(!!tasks['draft-changes'].apply, 'draft-changes: registration gives the read an apply (keepAs)');
  const rd = await tasks['draft-changes'].run('', { ctx: ctxD });
  eq(rd.items.map((i) => i.id), ['sum', 'sc0', 'w0'], 'draft-changes: summary, the one known scene and the watch line are points; the invented scene is not');
  eq([vaultNow(), JSON.stringify(Scenes.listScenes())], [v0, s0], 'draft-changes: Run writes nothing');
  const ud = tasks['draft-changes'].apply(rd.items, ctxD, rd);
  const notes = Story.listVault().filter((x) => /^AI \(Draft changes\)/.test(x.snippet));
  eq(notes.length, 3, 'draft-changes: Accept keeps three sticky notes');
  ok(notes.some((n) => /INT\. ANBU HOUSE - NIGHT — Anbu now lights a cigarette\./.test(n.snippet)), 'draft-changes: a scene point is headed with its heading, never put on a row (two drafts, not the open script)');
  eq(JSON.stringify(Scenes.listScenes()), s0, 'draft-changes: the scene list is untouched');
  ok(/saved 3 sticky notes/.test(ud.said), 'draft-changes: the toast says what was saved — ' + ud.said);
  ud();
  eq(vaultNow(), v0, 'draft-changes: Undo takes out exactly those notes');

  mem.set('fms_script_v1', JSON.stringify({ elements: [...els, E('action', 'He smokes a cigarette and coughs.')] }));
  const rc = await tasks['cert-read'].run('', {});
  eq(rc.items.map((i) => i.id), ['r0', 'q0'], 'cert-read: the real rule and the question are points; the made-up rule is not');
  const uc = tasks['cert-read'].apply(rc.items, {}, rc);
  ok(Story.listVault().some((n) => /^AI \(Certification read\): Certification \[tobacco\] .+ — A health warning is needed\./.test(n.snippet)), 'cert-read: a rule point names its rule on the sticky note');
  uc();
  eq(vaultNow(), v0, 'cert-read: Undo takes out exactly those notes');
  mem.set('fms_script_v1', JSON.stringify({ elements: els }));

  /* day-wrap: the reply as readWrap checked it, the items as run() builds them. */
  const byNumber = new Map([['1', 'r1'], ['2', 'r2']]);
  const rw = PM.readWrap({ summary: 'Scene 1 was shot.', owed: ['Scene 2 is part shot.', 'Scenes 1 and 2 need wild sound.'], tomorrow: ['Pick up Scene 2.'] }, ['1', '2']);
  const wi = PM.wrapItems(rw, { day: '1', byNumber });
  eq(wi.map((i) => [i.id, i.scene ? i.scene.sceneId : '']), [['sum', ''], ['o0', 'r2'], ['o1', ''], ['t0', 'r2']],
    'day-wrap: a point naming ONE scene of the day carries its row; two scenes, none');
  const uw = tasks['day-wrap-summary'].apply(wi, {}, { items: wi });
  const r1 = Scenes.listScenes().find((x) => x.id === 'r1'), r2 = Scenes.listScenes().find((x) => x.id === 'r2');
  eq(r1.readerNote, 'Typed by me.', 'day-wrap: a typed note on another scene is untouched');
  eq(r2.readerNote, 'AI (Wrap summary): Scene 2 is part shot.\nAI (Wrap summary): Pick up Scene 2.', 'day-wrap: the scene\'s points are appended to its note, marked AI');
  ok(/saved 2 notes on the scene list \(Sc 2\) and 2 sticky notes/.test(uw.said), 'day-wrap: the toast says where each went — ' + uw.said);
  uw();
  eq([vaultNow(), JSON.stringify(Scenes.listScenes())], [v0, s0], 'day-wrap: Undo restores the notes board and the scene list exactly');
  const dup = new Map([['1', '']]);
  ok(!PM.wrapItems({ summary: '', owed: ['Scene 1 is owed.'], tomorrow: [] }, { day: '1', byNumber: dup })[0].scene, 'day-wrap: a number two rows share picks no row');
}

console.log('test:ai-apply — ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
