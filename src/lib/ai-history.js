/* ============================================================
   AI HISTORY — what AI wrote in this film, DERIVED from the stamps
   ------------------------------------------------------------
   docs/AI-FAST-HARNESS.md B5. Pure: no storage, no document, no clock.
   Hand it the records already read (ai-history-read.js does the
   reading) and it gives back entries, runs and a revert plan. NOTHING
   here is stored: delete this file's output and the next call makes it
   again from the stamps on the records (ai-stamp.js).

   An ENTRY is one stamp on one record:
     { key, kind, id, label, stage, task, model, run, at,
       mode: 'new' | 'fill' | 'append' | 'replace',
       fields, edited, legacy, superseded, href, undoable }

   `edited` = the AI-written content differs from what the run wrote
   (hash compare, never written). A record changed by another AI run
   reads the same way: it is not what this run wrote any more.
   `superseded` = a later run filled the same fields of the same record;
   the older entry is history, not an undo (its words are gone).
   `undoable` = mode 'new' or 'fill', unchanged since, not legacy, not
   superseded. An append or a replace is listed and NEVER undone from
   History: the old value was not stored and will not be (the toast
   Undo is exact for as long as it lives).
   ============================================================ */
import { readStamp, isEdited } from './ai-stamp.js';

/* Which stage of the film each task belongs to, for the filters. */
const STAGES = {
  story: ['story-steps', 'story-map', 'scene-story', 'synopsis-script', 'logline', 'genre-comps', 'character-arcs',
    'beat-critique', 'tension-notes', 'audience-quick'],
  screenplay: ['gen-scenes', 'gen-batch', 'dialogue-pass', 'voice-check', 'script-cleanup', 'coverage', 'audience-test',
    'audience-ask'],
  preprod: ['shot-draft', 'breakdown-tags', 'scene-notes', 'board-frames', 'blocking-draft', 'blocking-enhance',
    'shoot-order', 'recce-notes', 'budget-estimate', 'callsheet-notes', 'cert-read'],
  production: ['day-wrap-summary'],
  post: ['edit-notes', 'draft-changes']
};
const STAGE_OF = new Map();
for (const [stage, tasks] of Object.entries(STAGES)) for (const t of tasks) STAGE_OF.set(t, stage);

export const STAGE_LABELS = { story: 'Story', screenplay: 'Screenplay', preprod: 'Pre-production', production: 'Production', post: 'Post-production', other: 'Other' };
export const STAGE_ORDER = ['story', 'screenplay', 'preprod', 'production', 'post', 'other'];

/* The words a person knows each task by (the Desk's labels are verbs; a
   history line names the thing). An unknown id is prettified, never blank. */
const TASK_NAMES = {
  'coverage': 'Coverage', 'dialogue-pass': 'Dialogue pass', 'beat-critique': 'Beat critique', 'story-steps': 'Story steps',
  'story-map': 'Synopsis map', 'shot-draft': 'Shot division', 'scene-story': 'Scene story', 'synopsis-script': 'Beat sheet',
  'gen-scenes': 'Scene list', 'gen-batch': 'Screenplay pages', 'voice-check': 'Voice check', 'logline': 'Logline',
  'genre-comps': 'Genre and comps', 'scene-notes': 'Scene notes', 'breakdown-tags': 'Breakdown tags', 'board-frames': 'Storyboard frames',
  'tension-notes': 'Tension notes', 'audience-test': 'Audience test', 'audience-quick': 'Audience test (story)',
  'audience-ask': 'Audience question', 'blocking-draft': 'Blocking', 'blocking-enhance': 'Blocking suggestions',
  'shoot-order': 'Shoot order', 'recce-notes': 'Recce ideas', 'budget-estimate': 'Budget estimate', 'callsheet-notes': 'Call sheet notes',
  'draft-changes': 'Draft changes', 'day-wrap-summary': 'Day wrap', 'edit-notes': 'Edit notes', 'cert-read': 'Certification read',
  'character-arcs': 'Character arcs', 'script-cleanup': 'Script clean-up'
};
export const taskName = (task) => TASK_NAMES[task] || String(task || 'AI').replace(/[-_]+/g, ' ').replace(/^./, (c) => c.toUpperCase());

/** 'story' | 'screenplay' | 'preprod' | 'production' | 'post' ('other' for a task this file has not met). */
export const stageOf = (task) => STAGE_OF.get(String(task || '')) || 'other';

/* Where a record lives. Every target is a fragment that exists in every
   state of its page (the nav-target trap in CLAUDE.md), never one that
   renders only when the record does. */
const HREF = {
  shot: () => 'visualize.html#shot-list',
  scene: () => 'breakdown.html#scenes',
  element: (id) => 'screenplay.html#line-' + id,
  step: () => 'story.html#path-outline',
  mark: () => 'story.html#path-synopsis',
  story: () => 'story.html#path-idea',
  character: () => 'story.html#path-bible',
  note: () => 'vault.html#vault',
  frame: () => 'visualize.html#storyboard',
  block: () => 'visualize.html#blocking',
  callsheet: () => 'contacts.html#call-sheets',
  recce: () => 'plan.html#locations',
  document: () => 'screenplay.html#analysis',
  edit: () => 'edit.html#log',
  budgetRow: () => 'budget.html'
};
export const hrefOf = (kind, id) => (HREF[kind] || (() => ''))(id);

const KIND_LABEL = {
  shot: 'Shot', scene: 'Scene', element: 'Script line', step: 'Story step', mark: 'Synopsis passage', story: 'Story',
  character: 'Character', note: 'Sticky note', frame: 'Storyboard frame', block: 'Blocking diagram', callsheet: 'Call sheet',
  recce: 'Recce card', document: 'Document', edit: 'Edit note', budgetRow: 'Budget line'
};
export const kindLabel = (kind) => KIND_LABEL[kind] || 'Item';

const clip = (s, n = 70) => { const t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

/* How each kind of record is named in a list. Always a string. */
const LABEL = {
  shot: (r) => 'Shot ' + (String(r.number || '').trim() || '?') + (r.description ? ' · ' + clip(r.description, 50) : ''),
  scene: (r) => 'Sc ' + (String(r.number || '').trim() || '?') + ' · ' + clip([r.intExt, r.location].filter(Boolean).join(' ') || 'Scene'),
  element: (r) => clip(r.text) || 'Script line',
  step: (r) => clip(r.text) || 'Story step',
  mark: (r) => clip(r.text) || 'Synopsis passage',
  story: (r) => clip(r.logline) || 'The story',
  character: (r) => clip(r.name) || 'Character',
  note: (r) => clip(r.snippet) || 'Sticky note',
  frame: (r) => clip(r.action || r.caption) || 'Storyboard frame',
  block: (r) => clip(r.name) || 'Blocking diagram',
  callsheet: (r) => clip(r.title || r.date) || 'Call sheet',
  recce: (r) => clip(r.name) || 'Recce card',
  document: (r) => clip(r.title) || 'Document',
  edit: (r) => 'Edit note · ' + (clip(r.label) || 'scene'),
  budgetRow: (r) => clip(r.item) || 'Budget line'
};
const labelOf = (kind, r) => { try { return (LABEL[kind] || (() => ''))(r) || kindLabel(kind); } catch (e) { return kindLabel(kind); } };

/* sources key → kind (the order here is the order a run lists its items) */
const SOURCES = [
  ['shots', 'shot'], ['scenes', 'scene'], ['elements', 'element'], ['documents', 'document'], ['story', 'story'],
  ['steps', 'step'], ['marks', 'mark'], ['characters', 'character'], ['notes', 'note'], ['frames', 'frame'],
  ['blocks', 'block'], ['callsheets', 'callsheet'], ['recce', 'recce'], ['budgetRows', 'budgetRow'], ['edits', 'edit']
];

/* A record the History never REMOVES, even unchanged: a scene row or a
   script line written by the generation stages is tied to the job's
   cursor and scene list (scriptgen.js), so taking it out from here would
   leave the job saying it was written. The Undo toast after that Accept
   restores the job with the rows and stays the way back. They are listed,
   badged and linked all the same. */
const KEEPS = new Set(['scene', 'element']);

const overlaps = (a, b) => !a.length || !b.length || a.some((f) => b.includes(f));

/** Every stamp on every record, as entries (newest run first within a record is not promised: use groupByRun). */
export function collectAI(sources) {
  const out = [];
  const src = sources && typeof sources === 'object' ? sources : {};
  for (const [name, kind] of SOURCES) {
    const raw = src[name];
    const list = Array.isArray(raw) ? raw : (raw && typeof raw === 'object' ? [raw] : []);
    for (const rec of list) {
      if (!rec || typeof rec !== 'object') continue;
      const id = String(rec.id != null ? rec.id : (rec.name != null ? rec.name : (rec.sceneId != null ? rec.sceneId : kind)));
      const st = readStamp(rec);
      const label = labelOf(kind, rec);
      const href = hrefOf(kind, id);
      if (st.created) {
        const c = st.created;
        const edited = !c.legacy && isEdited(kind, rec, c);
        out.push({
          key: kind + ':' + id + ':new:' + (c.run || 'legacy'), kind, id, label, stage: stageOf(c.task), task: c.task, model: c.model,
          run: c.run, at: c.at, mode: 'new', fields: [], edited, legacy: !!c.legacy, superseded: false, href,
          /* Taking the record away would also take a LATER run's fill with
             it, so a record another run has filled stays. */
          undoable: !c.legacy && !edited && !!c.run && !KEEPS.has(kind) && !st.fills.some((f) => f.run !== c.run)
        });
      }
      st.fills.forEach((f, i) => {
        const later = st.fills.slice(i + 1).some((g) => overlaps(f.fields, g.fields));
        const edited = !later && isEdited(kind, rec, f);
        out.push({
          key: kind + ':' + id + ':' + f.mode + ':' + f.run, kind, id, label, stage: stageOf(f.task), task: f.task, model: f.model,
          run: f.run, at: f.at, mode: f.mode, fields: f.fields.slice(), edited, legacy: false, superseded: later, href,
          undoable: (f.mode === 'fill') && !edited && !later && !!f.run
        });
      });
    }
  }
  return out;
}

const byAtDesc = (a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0);

/** The entries grouped by the run that made them, newest first. A legacy
    stamp has no run: those are one group per task, "earlier drafts". */
export function groupByRun(entries) {
  const groups = new Map();
  for (const e of entries || []) {
    const k = e.run || ('legacy:' + e.task);
    let g = groups.get(k);
    if (!g) {
      g = { run: e.run || '', task: e.task, model: e.model, at: e.at, stage: e.stage, legacy: !!e.legacy, count: 0, edited: 0, undoable: 0, items: [] };
      groups.set(k, g);
    }
    g.items.push(e);
    g.count += 1;
    if (e.edited) g.edited += 1;
    if (e.undoable) g.undoable += 1;
    if (e.at && (!g.at || e.at < g.at)) g.at = e.at;   // a run's time is when it started writing
  }
  return [...groups.values()].sort(byAtDesc);
}

/** { stage, task, edited } — each optional; `edited: true` keeps only changed ones, `false` only untouched. */
export function filterAI(entries, { stage, task, edited } = {}) {
  return (entries || []).filter((e) => (!stage || e.stage === stage) && (!task || e.task === task)
    && (edited == null || !!e.edited === !!edited));
}

/** What undoing these entries would do.
    { remove: [{kind,id,run}], blank: [{kind,id,fields,run}], kept, notUndoable }
    kept = changed since the run, left as they are;
    held = NOT changed but left anyway (scene rows and script lines, which the
           generation job owns; a record a later run filled again);
    notUndoable = append / replace / earlier drafts: listed, never undone from here. */
export function revertPlan(entries) {
  const plan = { remove: [], blank: [], kept: 0, held: 0, notUndoable: 0 };
  for (const e of entries || []) {
    if (e.mode === 'append' || e.mode === 'replace' || e.legacy || !e.run) { plan.notUndoable += 1; continue; }
    if (!e.undoable) { if (e.edited) plan.kept += 1; else plan.held += 1; continue; }
    if (e.mode === 'new') plan.remove.push({ kind: e.kind, id: e.id, run: e.run });
    else plan.blank.push({ kind: e.kind, id: e.id, fields: e.fields.slice(), run: e.run });
  }
  return plan;
}

export default { collectAI, groupByRun, filterAI, stageOf, revertPlan, hrefOf, kindLabel, taskName, STAGE_LABELS, STAGE_ORDER };
