/* ============================================================
   LOCAL TASKS, POST — the no-AI twins of the on-set and post reads
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md, lane B. `local: true` Desk tasks (the shape
   local-tasks.js uses): no key step, no Pro gate, no provider
   disclosure, no chat; the list builds the moment the Desk opens, from
   current data, on this device. Each run() calls a PURE function in
   rules-post.js; each apply() writes through the AI twin's own safe
   path (rules-notes.js keepRuleNotes, or editlog setSceneEdit), never
   stamped as AI.

     draft-changes-rules       ctx { olderId, newerId, compare() }
     day-wrap-summary-rules    ctx { day, after?, say? }
     edit-notes-rules          ctx { secondsOf?(), after?, say? }
     cert-read-rules           ctx { after?, say? }
     tension-notes-rules       ctx { elements?, getDoc?, after?, say? }

   Ids are permanent: a ctx may name them.

   LIGHT. local-tasks.js imports this file statically (the Desk
   registers its tasks at evaluation), so it imports NOTHING at the
   top: every model is a dynamic import in ready(). input() is
   synchronous and returns a fixed sentence, because the Desk awaits
   only local-tasks.js's own ready() before it asks for it. NO STORAGE
   KEY; no ai*.js import.
   ============================================================ */
let Diff = null, ScenesM = null, Shoot = null, Edit = null, Cbfc = null, ScriptM = null;
let SA = null, StoryM = null, Store = null, Songs = null, EditModel = null, R = null, Keep = null;
let readyP = null;

export function ready() {
  if (!readyP) {
    readyP = Promise.all([
      import('./script-diff.js'), import('./scenes.js'), import('./shootday.js'), import('./editlog.js'),
      import('./cbfc.js'), import('./script.js'), import('./script-analysis-model.js'), import('./story.js'),
      import('./store.js'), import('./songs.js'), import('./edit-model.js'), import('./rules-post.js'), import('./rules-notes.js')
    ]).then(([d, sc, sh, ed, cb, sp, sa, st, so, sg, em, r, k]) => {
      Diff = d; ScenesM = sc; Shoot = sh; Edit = ed; Cbfc = cb; ScriptM = sp; SA = sa; StoryM = st;
      Store = so.default || so; Songs = sg; EditModel = em; R = r; Keep = k;
      return true;
    }).catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}

const resolve = (ctx) => {
  let c = ctx;
  if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
  return (c && typeof c === 'object') ? c : {};
};
const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const fail = (msg) => { const e = new Error(msg); e.kind = 'nocontent'; throw e; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const slugOf = (scene) => [scene.intExt, scene.location || 'Location TBC'].filter(Boolean).join('. ')
  + (scene.dayNight ? ' — ' + scene.dayNight : '');
const keep = (label) => (selected, ctx) => {
  const c = resolve(ctx);
  return Keep.keepRuleNotes(selected, { label, after: c.after, say: c.say });
};

/* ---- draft-changes-rules ---------------------------------------- */
const draftChanges = {
  id: 'draft-changes-rules',
  label: 'Summarise changes',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The two drafts you picked, compared line by line on this device: lines added, cut, changed and moved in '
      + 'each scene, a heading that changed, scenes added, cut or moved, new or lost speaking characters and the page count. '
      + 'Counts and quoted names only.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const cmp = typeof c.compare === 'function' ? c.compare() : null;
    if (!cmp || !Array.isArray(cmp.older) || !Array.isArray(cmp.newer)) fail('Pick two drafts to compare first.');
    if (c.olderId && c.olderId === c.newerId) fail('Pick two different drafts to compare.');
    const diff = Diff.diffElements(cmp.older, cmp.newer);
    if (Diff.isUnchanged(diff)) fail('These two drafts say the same thing, so there is nothing to summarise.');
    const res = R.summariseChanges({ groups: Diff.groupByScene(diff), stats: diff.stats, before: cmp.older, after: cmp.newer,
      olderLabel: cmp.olderLabel, newerLabel: cmp.newerLabel });
    if (!res.items.length) fail('No change could be put into words, so nothing is shown.');
    return res;
  },
  apply: keep('Draft changes')
};

/* ---- day-wrap-summary-rules ------------------------------------- */
const dayWrap = {
  id: 'day-wrap-summary-rules',
  label: 'Wrap note',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The shoot day’s scenes as the set marked them: how many were shot, part shot or dropped, the takes logged and '
      + 'circled, each floor note word for word, and what the next day on the stripboard holds.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const all = Shoot.days();
    const d = all.find((x) => x.day === Number(c.day));
    if (!d || !d.scenes.length) fail('That shoot day has no scenes to wrap.');
    const scenes = d.scenes.map((s) => {
      const takes = Shoot.takesOf(s);
      return { id: s.id, number: s.number, slug: slugOf(s), shotState: s.shotState || '',
        takes: takes.length, circled: takes.filter((t) => t.circled).length, floorNote: Shoot.floorNoteOf(s) };
    });
    const nx = all.filter((x) => x.day > d.day && x.scenes.length).sort((a, b) => a.day - b.day)[0] || null;
    const nextDay = nx ? { day: nx.day, scenes: nx.scenes.map((s) => ({ id: s.id, number: s.number, slug: slugOf(s) })) } : null;
    return R.wrapNote({ day: d.day, scenes }, { nextDay });
  },
  apply: keep('Wrap note')
};

/* ---- edit-notes-rules ------------------------------------------- */
function editRows(c) {
  const scenes = ScenesM.listScenes();
  if (!scenes.length) fail('There are no scenes yet, so there is nothing to note.');
  const data = Edit.loadEdit();
  const cov = Edit.coverage(scenes, null, data);
  let seconds = {};
  try { seconds = call(c.secondsOf) || (EditModel ? EditModel.secondsByScene(scenes) : {}); } catch (e) { seconds = {}; }
  const owed = new Map();
  Edit.listPickups(data).filter((p) => !p.done).forEach((p) => {
    if (!owed.has(p.sceneId)) owed.set(p.sceneId, []);
    owed.get(p.sceneId).push(p.what);
  });
  const rows = cov.rows.map((r) => {
    const takes = Shoot.takesOf(r.scene);
    return {
      id: r.scene.id, number: r.scene.number, slug: slugOf(r.scene), state: r.scene.shotState || '',
      takes: takes.length, circled: takes.filter((t) => t.circled).length,
      cutId: r.edit.cut || '', cut: r.edit.cut ? Edit.cutLabel(r.edit.cut) : '', note: r.edit.note,
      pickups: owed.get(r.scene.id) || [], seconds: seconds[r.scene.id] || 0, floorNote: Shoot.floorNoteOf(r.scene)
    };
  });
  const run = Object.keys(seconds).length
    ? Edit.cutRunTime(cov, seconds, Songs.listSongs().map((x) => ({ id: x.id, seconds: Songs.durationSeconds(x) }))) : null;
  return { rows, run };
}

const editNotes = {
  id: 'edit-notes-rules',
  label: 'Edit notes',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'For each scene whose edit note is blank: what the set got (shot, part, dropped), the takes logged and circled, '
      + 'the pick-ups owed, the floor note word for word and, for a scene in the cut, its estimated time on screen. '
      + 'A scene that already has a note is never touched, and no note describes footage.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const { rows, run } = editRows(resolve(ctx));
    if (!rows.some((r) => R.canFill(r.note))) fail('Every scene already has an edit note, so there is nothing to fill.');
    const res = R.editNotes(rows, { cutRun: run, targetMin: Songs.getTargetMinutes() });
    if (!res.items.length) fail('No blank-noted scene has anything logged yet (no set state, takes, pick-ups or floor note), so there are no notes to draft.');
    return res;
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const wrote = [];
    let skipped = 0;
    for (const it of selected || []) {
      if (!it || !it.sceneId || !it.note) continue;
      /* Blank NOW: a note typed between the list and Accept is not overwritten. */
      if (!R.canFill(Edit.sceneEdit(it.sceneId).note)) { skipped++; continue; }
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
        if (R.canUndo(Edit.sceneEdit(w.sceneId).note, w.note)) { Edit.setSceneEdit(w.sceneId, { note: '' }); reverted++; } else kept++;
      }
      call(c.say, (reverted ? plural(reverted, 'edit note', 'edit notes') + ' taken back.' : 'Nothing to take back.')
        + (kept ? ' ' + plural(kept, 'note was', 'notes were') + ' edited since and left as written.' : ''));
      call(c.after);
    };
  }
};

/* ---- cert-read-rules -------------------------------------------- */
const certRead = {
  id: 'cert-read-rules',
  label: 'Certification read',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The certification word search’s own result: the rating hint, each rule that fired with its scene numbers, '
      + 'the rule’s own text with its source and the date it was checked, and what the rule asks you to have in place, '
      + 'as questions. A hint, not advice.';
  },
  async run() {
    await ready();
    const scenes = ScenesM.listScenes();
    const elements = ScriptM.loadScript().elements;
    if (!scenes.length && !elements.some((e) => e.type === 'scene')) fail('There are no scenes and no script yet, so there is nothing to read.');
    const report = Cbfc.certificationReport(scenes, elements);
    if (!report.byRule.length) fail('The word search flagged nothing, so there is nothing to read.');
    return R.certRead(report, { disclaimer: Cbfc.DISCLAIMER });
  },
  apply: keep('Certification read')
};

/* ---- tension-notes-rules ---------------------------------------- */
function scriptElements(c) {
  const live = call(c.elements);
  if (Array.isArray(live)) return live;
  const d = call(c.getDoc);
  if (d && Array.isArray(d.elements)) return d.elements;
  try { return ScriptM.loadScript().elements || []; } catch (e) { return []; }
}

const tension = {
  id: 'tension-notes-rules',
  label: 'Measured notes',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The Script analysis tab’s own measurements, turned into notes: a run of low-tension scenes, a peak early in the script, '
      + 'a calmer ending, very even tension, long or very short runs of scenes, and a lead who is absent for a long run. '
      + 'Each is worded as a measurement, with its numbers.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const els = scriptElements(c);
    let format = 'feature';
    try { const p = Store.currentProject && Store.currentProject(); if (p && p.format === 'short') format = 'short'; } catch (e) { /* default */ }
    let story = null;
    try { story = StoryM.loadStory(); } catch (e) { story = null; }
    const a = SA.analyseScript({ elements: els, scenes: ScenesM.listScenes(), story, format });
    if (!a.scenes.length) fail('This script has no scene headings yet, so there is nothing to measure.');
    const res = R.tensionNotes(a);
    if (!res.items.length) fail('Nothing measured crossed a threshold, so there are no notes to keep.');
    return res;
  },
  apply: keep('Measured tension')
};

export const RULES_TASKS_POST = [draftChanges, dayWrap, editNotes, certRead, tension];
export const RULES_POST_IDS = RULES_TASKS_POST.map((t) => t.id);
export default { ready, RULES_TASKS_POST, RULES_POST_IDS };
