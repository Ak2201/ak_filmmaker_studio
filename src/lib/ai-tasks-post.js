/* ============================================================
   AI TASKS — On set and after: drafts, shoot day, edit log, certification
   ------------------------------------------------------------
   One lane's Desk tasks (docs/AI-EVERYWHERE.md, tasks 5 to 8). Registered
   by ai-tasks.js, which spreads TASKS into ALL_TASKS and awaits load()
   before the Desk asks any task for its input (input() is called
   synchronously, so every model it reads must be loaded by then).
   Helpers: ./ai-task-kit.js. Models load lazily inside load(); never
   import ai.js, a page or a ui file at the top of this module.

     draft-changes      read   drafts.html, the compare selection
     day-wrap-summary   read   shoot.html, one day
     edit-notes         list   edit.html, EMPTY per-scene notes only
     cert-read          read   deliverables.html#certification

   The three reads change nothing at Run. Their points are also items
   (ai-post-model.js changesItems / wrapItems / certItems), and Accept
   keeps the ticked ones as notes through ai-tasks.js keepNotes (it sets
   their apply from `keepAs`; this lane cannot import ai-tasks.js, which
   imports it): a wrap point naming one scene of the day goes on that
   row's note, everything else is a sticky note; Undo removes exactly
   those. edit-notes writes the edit log: Accept fills a scene's edit note that is empty NOW (re-read
   in apply(), not at Run) through setSceneEdit; a note typed since is
   skipped and counted. Undo restores '' only where the note still
   equals what was written. The decisions are in ai-post-model.js.
   ============================================================ */
import { ai, resolve, call, fail, plural, remember, recall, refineText } from './ai-task-kit.js';
import * as M from './ai-post-model.js';

let Diff = null, ScenesM = null, Shoot = null, Edit = null, Cbfc = null, Rules = null, ScriptM = null;

/** Resolve once every model this lane's tasks read has loaded. */
export const load = async () => {
  if (Diff) return;
  const [d, s, sh, e, c, r, sc] = await Promise.all([
    import('./script-diff.js'), import('./scenes.js'), import('./shootday.js'), import('./editlog.js'),
    import('./cbfc.js'), import('../data/cbfc-rules.json'), import('./script.js')
  ]);
  Diff = d; ScenesM = s.default || s; Shoot = sh.default || sh; Edit = e.default || e;
  Cbfc = c.default || c; Rules = r.default || r; ScriptM = sc;
};

const slugOf = (scene) => [scene.intExt, scene.location || 'Location TBC'].filter(Boolean).join('. ')
  + (scene.dayNight ? ' — ' + scene.dayNight : '');

/* ---- 5. draft-changes ------------------------------------------- */
/* ctx { olderId, newerId, compare() → { older: elements[], newer: elements[],
         olderLabel, newerLabel } }. The page reads its own Compare
   selects at the click, so the two lists are the ones on screen. */
function changesJob(ctx) {
  const c = resolve(ctx);
  const cmp = typeof c.compare === 'function' ? c.compare() : null;
  if (!cmp || !Array.isArray(cmp.older) || !Array.isArray(cmp.newer)) fail('Pick two drafts to compare first.');
  if (c.olderId && c.olderId === c.newerId) fail('Pick two different drafts to compare.');
  const diff = Diff.diffElements(cmp.older, cmp.newer);
  if (Diff.isUnchanged(diff)) fail('These two drafts say the same thing, so there is nothing to summarise.');
  const facts = M.changeFacts({
    groups: Diff.groupByScene(diff), stats: diff.stats,
    olderLabel: cmp.olderLabel, newerLabel: cmp.newerLabel
  });
  return Object.assign(facts, { labels: { olderLabel: cmp.olderLabel, newerLabel: cmp.newerLabel } });
}

const draftChangesTask = {
  id: 'draft-changes',
  label: 'Summarise changes',
  kind: 'read',
  keepAs: 'Draft changes',
  editable: false,
  identity(ctx) { const c = resolve(ctx); return 'drafts:' + String(c.olderId || '') + '>' + String(c.newerId || ''); },
  input(ctx) {
    try { return changesJob(ctx).text; } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    const facts = changesJob(ctx);
    const { parsed, model, truncated } = await (await ai()).callModelForTask({
      system: M.CHANGES_SYSTEM, user: M.changesUser(facts, refineText(refine)), schema: M.CHANGES_SCHEMA,
      maxTokens: 3000, effort: 'medium', onStatus, signal
    });
    const res = M.readChanges(parsed, facts.headings);
    if (!res.summary && !res.scenes.length && !res.watch.length) fail('The reply held nothing usable, so nothing is shown.');
    return { text: M.changesText(res, { model, truncated: truncated || facts.truncated, omitted: facts.omitted }),
      items: M.changesItems(res, facts.labels) };
  }
};

/* ---- 6. day-wrap-summary ---------------------------------------- */
/* ctx { day }. Scenes, marks, take counts and floor notes only. */
function wrapJob(ctx) {
  const c = resolve(ctx);
  const d = Shoot.detail(c.day);
  if (!d || !d.scenes.length) fail('That shoot day has no scenes to wrap.');
  const scenes = d.scenes.map((s) => {
    const takes = Shoot.takesOf(s);
    return {
      id: s.id, number: s.number, slug: slugOf(s), shotState: s.shotState || '',
      takes: takes.length, circled: takes.filter((t) => t.circled).length, floorNote: Shoot.floorNoteOf(s)
    };
  });
  /* A number two rows of the day share names neither (keepNotes would
     guess), so it maps to nothing and the point becomes a sticky note. */
  const byNumber = new Map();
  for (const s of scenes) {
    const n = String(s.number || '').trim().toUpperCase();
    if (n) byNumber.set(n, byNumber.has(n) ? '' : s.id);
  }
  return Object.assign(M.wrapFacts({ day: d.day, scenes: scenes.map((s) => ({ ...s, shotState: s.shotState || 'not marked' })) }),
    { byNumber, day: d.day });
}

const dayWrapTask = {
  id: 'day-wrap-summary',
  label: 'Wrap summary',
  kind: 'read',
  keepAs: 'Wrap summary',
  editable: false,
  identity(ctx) { return 'day:' + String(resolve(ctx).day || ''); },
  input(ctx) {
    try { return wrapJob(ctx).text; } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    const facts = wrapJob(ctx);
    const { parsed, model } = await (await ai()).callModelForTask({
      system: M.WRAP_SYSTEM, user: M.wrapUser(facts, refineText(refine)), schema: M.WRAP_SCHEMA,
      maxTokens: 2000, effort: 'medium', onStatus, signal
    });
    const res = M.readWrap(parsed, facts.numbers);
    if (!res.summary && !res.owed.length && !res.tomorrow.length) fail('The reply held nothing usable, so nothing is shown.');
    return { text: M.wrapText(res, { model }), items: M.wrapItems(res, { day: facts.day, byNumber: facts.byNumber }) };
  }
};

/* ---- 7. edit-notes ----------------------------------------------- */
/* ctx { secondsOf?() → { sceneId: seconds }, after?(), say?(msg) }. */
function editJob(ctx) {
  const c = resolve(ctx);
  const scenes = ScenesM.listScenes();
  if (!scenes.length) fail('There are no scenes yet, so there is nothing to note.');
  const data = Edit.loadEdit();
  const cov = Edit.coverage(scenes, null, data);
  let seconds = {};
  try { seconds = call(c.secondsOf) || {}; } catch (e) { seconds = {}; }
  const owed = new Map();
  Edit.listPickups(data).filter((p) => !p.done).forEach((p) => {
    if (!owed.has(p.sceneId)) owed.set(p.sceneId, []);
    owed.get(p.sceneId).push(p.what);
  });
  const rows = cov.rows.map((r) => ({
    id: r.scene.id, number: r.scene.number, slug: slugOf(r.scene),
    cut: r.edit.cut ? Edit.cutLabel(r.edit.cut) : '', set: r.got, note: r.edit.note,
    pickups: owed.get(r.scene.id) || [], seconds: seconds[r.scene.id] || 0, floorNote: Shoot.floorNoteOf(r.scene)
  }));
  const facts = M.editFacts({ rows, cuts: Edit.listCuts(data).map((x) => x.name) });
  if (!facts.empty.length) fail('Every scene already has an edit note, so there is nothing to fill.');
  return { facts, rows };
}

const editNotesTask = {
  id: 'edit-notes',
  label: 'Edit notes',
  kind: 'list',
  editable: false,
  identity() { return 'edit-notes'; },
  input(ctx) {
    try { return editJob(ctx).facts.text; } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    const { facts, rows } = editJob(ctx);
    const { parsed, model, truncated } = await (await ai()).callModelForTask({
      system: M.EDIT_SYSTEM, user: M.editUser(facts, refineText(refine)), schema: M.EDIT_SCHEMA,
      maxTokens: 6000, effort: 'medium', onStatus, signal
    });
    const res = M.readEditNotes(parsed, { ids: facts.ids, empty: facts.empty, rows });
    if (!res.items.length) fail('The model came back with no usable notes. Nothing was changed.');
    const note = [
      'Notes for scenes that have none. A scene that already has a note is never touched.',
      res.dropped ? plural(res.dropped, 'note was', 'notes were') + ' not usable and left out.' : '',
      truncated ? 'The reply was cut short, so some scenes may be missing.' : '',
      model ? 'Drafted by ' + model + '.' : ''
    ].filter(Boolean).join(' ');
    return remember('edit-notes', { items: res.items, note }, {});
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    if (!recall('edit-notes', result)) fail('There are no notes to keep. Run it first.');
    const wrote = [];
    let skipped = 0;
    for (const it of selected || []) {
      if (!it || !it.sceneId || !it.note) continue;
      /* Blank NOW: a note typed between Run and Accept is not overwritten. */
      if (!M.canFill(Edit.sceneEdit(it.sceneId).note)) { skipped++; continue; }
      if (!ScenesM.listScenes().some((s) => s.id === it.sceneId)) { skipped++; continue; }
      Edit.setSceneEdit(it.sceneId, { note: it.note });
      wrote.push({ sceneId: it.sceneId, note: it.note });
    }
    call(c.say, (wrote.length ? plural(wrote.length, 'edit note', 'edit notes') + ' added.' : 'No edit notes were added.')
      + (skipped ? ' ' + plural(skipped, 'scene was', 'scenes were') + ' skipped: a note was written there since.' : ''));
    if (!wrote.length) return null;
    call(c.after);
    /* Undo blanks only the notes still exactly as written. */
    return () => {
      let reverted = 0, kept = 0;
      for (const w of wrote) {
        if (M.canUndo(Edit.sceneEdit(w.sceneId).note, w.note)) { Edit.setSceneEdit(w.sceneId, { note: '' }); reverted++; } else kept++;
      }
      call(c.say, (reverted ? plural(reverted, 'edit note', 'edit notes') + ' taken back.' : 'Nothing to take back.')
        + (kept ? ' ' + plural(kept, 'note was', 'notes were') + ' edited since and left as written.' : ''));
      call(c.after);
    };
  }
};

/* ---- 8. cert-read ------------------------------------------------ */
function certJob() {
  const scenes = ScenesM.listScenes();
  const elements = ScriptM.loadScript().elements;
  if (!scenes.length && !elements.some((e) => e.type === 'scene')) fail('There are no scenes and no script yet, so there is nothing to read.');
  const report = Cbfc.certificationReport(scenes, elements);
  const facts = M.certFacts(report, Rules.ratings || []);
  if (!facts.fired) fail('The word search flagged nothing, so there is nothing to read.');
  return facts;
}

const certReadTask = {
  id: 'cert-read',
  label: 'Certification read',
  kind: 'read',
  keepAs: 'Certification read',
  editable: false,
  identity() { return 'cert-read'; },
  input() {
    try { return 'Rule ids, scene numbers and the rating hint only. No script text and no dialogue.\n\n' + certJob().text; }
    catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine } = {}) {
    const facts = certJob();
    const { parsed, model } = await (await ai()).callModelForTask({
      system: M.CERT_SYSTEM, user: M.certUser(facts, refineText(refine)), schema: M.CERT_SCHEMA,
      maxTokens: 3000, effort: 'medium', onStatus, signal
    });
    const res = M.readCert(parsed, Cbfc.ruleById);
    if (!res.read && !res.rules.length && !res.questions.length) fail('The reply held nothing usable, so nothing is shown.');
    return { text: M.certText(res, Cbfc.ruleById, Cbfc.DISCLAIMER, { model }), items: M.certItems(res, Cbfc.ruleById) };
  }
};

export const TASKS = [draftChangesTask, dayWrapTask, editNotesTask, certReadTask];
export default { TASKS, load };
