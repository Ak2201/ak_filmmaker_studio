/* ============================================================
   SCRIPTGEN — a synopsis becomes a script, in stages that resume
   ------------------------------------------------------------
   This module owns the JOB, not the writing. The writing lives
   where it always lived: script elements in `script.js`, scene
   rows in `scenes.js`. What is stored here is the paperwork —
   the synopsis, the agreed beats, the scene list, and a cursor
   saying how far down it the pages have been written.

   WHY A CURSOR IS THE WHOLE DESIGN. A Tamil feature is 60,000 to
   120,000 output tokens (see the note in ai.js). That is a dozen
   or more calls, over several minutes, any one of which can be
   stopped, rate-limited or lost to a closed laptop. If a run that
   dies at scene forty has to restart at scene one, the writer pays
   twice for thirty-nine scenes they already had. So every batch
   commits its pages and advances the cursor before the next one
   starts, and `resume()` is just "keep going from the cursor".

   NOTHING RUNS ON ITS OWN. There is no timer and no retry loop in
   here. `runNextBatch()` does exactly one batch and returns; the
   page decides whether to call it again. A module that keeps
   spending money after the user walked away would be a bug with a
   bill attached.

   WHAT IT WRITES, AND WHEN
     stage 2 commit -> the SCENE MODEL. Deliberately, and before any
       pages exist: the breakdown, stripboard, day-out-of-days,
       budget and reports all read scenes.js, so the studio is
       useful after stage 2 even if stage 3 is never run.
     stage 3 commit -> script elements, appended in scene order.
   A commit takes a REVISION first if there is anything to lose.
   That is the same rule script-import.js follows, for the same
   reason: this is a tool people keep months of work in.
   ============================================================ */

import './store.js';   // must evaluate before anything reads localStorage
import * as Script from './script.js';
import * as Scenes from './scenes.js';

/* ai.js and studies.js are imported DYNAMICALLY, inside the functions
   that need them, and that is a size decision rather than a style one.
   write.js keeps its whole AI surface lazy — "a reader who never
   clicks ◇ downloads none of the model code" — and this module is
   loaded eagerly so the page can render the job's progress. A static
   import here would pull ai.js into first paint and undo that, and
   studies.json carries four films' beat sheets to get fifteen beat
   names. The three static imports above are already in write.js's
   graph, so this module itself costs nothing. */
let _AI = null;
const ai = async () => (_AI || (_AI = await import('./ai.js')));

/* Thrown before ai.js has loaded, so it cannot be an AIError. The page
   renders `.message` and branches on `.kind`, which is all either type
   is used for. */
export class GenError extends Error {
  constructor(message, kind) { super(message); this.name = 'GenError'; this.kind = kind; }
}

/* The job state, and it is PER PROJECT.
   Registered in SCOPED_KEYS (store.js), PROJECT_KEYS and ALL_KEYS
   (hub.js), SCOPE_BY_KEY (cloud.js) and the `scope` CHECK constraint
   in supabase-schema.sql. Not GLOBAL_KEYS — that is for keys which
   exist once per device, and this is not one.

   SCOPED, NOT GLOBAL, AND THE REASON MATTERS. `scenes` below holds
   sceneIds belonging to one project's scene model. Stored globally —
   which is what rawGet/rawSet would have done, and what the first
   draft of this file did — switching projects and pressing Resume
   would write another film's scenes into this film's script, with a
   cursor that looks perfectly valid. Scoping is what makes Resume
   mean "this film". */
export const SCRIPTGEN_KEY = 'fms_scriptgen_v1';

export const STAGES = ['synopsis', 'beats', 'scenes', 'pages', 'done'];

/* How many scenes go in one stage-3 call. Four is a compromise with
   a reason on each side: fewer pays the context cost (logline,
   characters, neighbouring scenes) once per scene and loses the
   rhythm between consecutive scenes; more risks the 32,000-token
   ceiling, and a batch cut off at the ceiling is a batch nobody
   can use. Four scenes is about two pages of Tamil, which lands
   around 6,000-12,000 output tokens. */
export const BATCH_SIZE = 4;

const blank = () => ({
  stage: 'synopsis',
  synopsis: '',
  logline: '',
  format: 'feature',
  lang: 'ta-dialogue',
  target: 0,              // 0 = let the format decide
  beats: [],              // [{ id, happens }]
  scenes: [],             // [{ sceneId, slug, synopsis, eighths, cast, beat }]
  cursor: 0,              // how many of `scenes` have had pages written
  model: '',
  startedAt: '',
  truncations: 0          // batches the model cut off; shown, never hidden
});

/* ---- persistence -------------------------------------------
   Plain localStorage, so store.js's proxy suffixes the open
   project id and the job follows the film. Every list is
   Array.isArray-checked — an empty array is truthy and a stored
   null is not an array, and both have already cost this project a
   page that rendered zero rows with no way to add one. */
export function load() {
  let raw = null;
  try { raw = localStorage.getItem(SCRIPTGEN_KEY); } catch (e) { /* private mode */ }
  if (!raw) return blank();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return blank(); }
  if (!parsed || typeof parsed !== 'object') return blank();
  const job = { ...blank(), ...parsed };
  if (!STAGES.includes(job.stage)) job.stage = 'synopsis';
  job.beats = Array.isArray(parsed.beats) ? parsed.beats : [];
  job.scenes = Array.isArray(parsed.scenes) ? parsed.scenes : [];
  job.cursor = Math.max(0, Math.min(job.scenes.length, Number(job.cursor) || 0));
  job.truncations = Math.max(0, Number(job.truncations) || 0);
  return job;
}

export function save(job) {
  try { localStorage.setItem(SCRIPTGEN_KEY, JSON.stringify(job)); return true; }
  catch (e) { return false; }
}

export function clear() {
  try { localStorage.removeItem(SCRIPTGEN_KEY); return true; }
  catch (e) { return false; }
}

/** Is there a job worth offering to resume? */
export function inFlight(job) {
  const j = job || load();
  return j.stage === 'pages' && j.cursor < j.scenes.length;
}

export function progress(job) {
  const j = job || load();
  const total = j.scenes.length;
  return {
    total,
    done: j.cursor,
    left: Math.max(0, total - j.cursor),
    batches: total ? Math.ceil((total - j.cursor) / BATCH_SIZE) : 0,
    pct: total ? Math.round((j.cursor / total) * 100) : 0
  };
}

/* ---- the beat vocabulary -----------------------------------
   Derived, never listed. The fifteen beats live in
   src/data/studies.json and are what the app already teaches and
   renders; a second hand-written copy here would be wrong by the
   second edit.

   Async because studies.json is 100KB of four films' beat sheets and
   this needs fifteen names from it. The LABEL is then copied into the
   job, so rendering progress never loads the data file again — and a
   job stays readable even if the vocabulary is later renamed. */
export async function beatVocabulary() {
  const { getBeatSheetMethod } = await import('./studies.js');
  const method = getBeatSheetMethod('save-the-cat');
  const beats = (method && Array.isArray(method.beats)) ? method.beats : [];
  return beats.map((b) => ({
    id: String(b.id),
    label: String(b.label || b.id),
    pages: String(b.pages || ''),
    pct: Number(b.pct) || 0,
    function: String(b.function || '')
  }));
}

/* Read off the job, not looked up — see above. */
const beatLabel = (job, id) => {
  const found = (job.beats || []).find((b) => b.id === id);
  return found ? (found.label || id) : '';
};

/** The slug line a scene row prints, which is also what stage 3 is
    told to copy into its `scene` element. One function so the two
    can never drift. */
export function slugFor(scene) {
  const head = (scene.intExt || 'INT') + '. ' + (scene.location || '').toUpperCase();
  return head + ' - ' + (scene.dayNight || 'DAY');
}

/* ============================================================
   STAGE 1 — BEATS
   ============================================================ */
export async function runBeats(patch, { onStatus, signal } = {}) {
  const job = { ...load(), ...patch };
  const AI = await ai();
  const vocab = await beatVocabulary();
  const res = await AI.draftBeatSheet({
    synopsis: job.synopsis,
    format: job.format,
    lang: job.lang,
    beats: vocab
  }, { onStatus, signal });

  // Keep the vocabulary's order, not the reply's. The fifteen beats
  // are a sequence; a reply that returns them shuffled must not
  // shuffle the writer's document.
  job.beats = vocab
    .map((b) => ({ id: b.id, label: b.label, happens: res.byBeat.get(b.id) || '' }))
    .filter((b) => b.happens);
  job.logline = res.logline || job.logline;
  job.model = res.model || job.model;
  job.stage = 'beats';
  save(job);
  return { job, truncated: res.truncated, missing: vocab.length - job.beats.length };
}

/* ============================================================
   STAGE 2 — SCENES
   ------------------------------------------------------------
   Commits to the scene model. `replaceScenes` is the caller's
   decision and it is destructive, so it is a parameter rather
   than an inference: appending to an existing board and wiping it
   are different acts and the UI asks which.
   ============================================================ */
export async function runScenes(patch, { onStatus, signal, replaceScenes = false } = {}) {
  const job = { ...load(), ...patch };
  if (!job.beats.length) throw new GenError('Draft the beat sheet first.', 'nobeats');
  const AI = await ai();

  const labelled = job.beats.map((b) => ({
    id: b.id, label: beatLabel(job, b.id), happens: b.happens
  }));
  const res = await AI.draftSceneList({
    synopsis: job.synopsis,
    logline: job.logline,
    format: job.format,
    lang: job.lang,
    target: job.target,
    beats: labelled
  }, { onStatus, signal });

  /* Commit. Scene rows go in through blankScene() so a row this
     module writes is the same shape as a row the user typed — the
     breakdown reads `elements`, the stripboard reads `eighths`,
     and a row missing either is a row that renders wrong. */
  const existing = replaceScenes ? [] : Scenes.listScenes();
  const startNumber = existing.length;
  const rows = res.scenes.map((s, i) => Scenes.blankScene({
    number: String(startNumber + i + 1),
    intExt: s.intExt,
    dayNight: s.dayNight,
    location: s.location,
    synopsis: s.synopsis,
    eighths: s.eighths,
    // Cast lands in the breakdown's own vocabulary, so the element
    // index and the day-out-of-days see it without a second pass.
    elements: s.cast.length ? { cast: s.cast.slice() } : {}
  }));
  Scenes.saveScenes(existing.concat(rows));

  job.scenes = rows.map((r, i) => ({
    sceneId: r.id,
    slug: slugFor(r),
    synopsis: r.synopsis,
    eighths: r.eighths,
    cast: res.scenes[i].cast.slice(),
    beat: res.scenes[i].beat
  }));
  job.cursor = 0;
  job.model = res.model || job.model;
  job.stage = 'pages';
  job.startedAt = new Date().toISOString();
  save(job);
  return { job, truncated: res.truncated, scenes: rows.length };
}

/* ============================================================
   STAGE 3 — PAGES, ONE BATCH AT A TIME
   ------------------------------------------------------------
   Returns after one batch. The caller loops, so Stop means stop
   and a closed tab means stopped, not stopped-and-still-charging.
   ============================================================ */

/** Every character name seen so far, so the batch after the first
    spells them the way the batch before did. Gathered from the
    scene list's cast and from the elements already written — the
    second half matters, because a name the model invented in an
    action line is a name it will keep using. */
function knownCharacters(job) {
  const seen = new Set();
  for (let i = 0; i < job.cursor && i < job.scenes.length; i++) {
    for (const c of (job.scenes[i].cast || [])) seen.add(c);
  }
  const doc = Script.loadScript();
  for (const el of doc.elements) {
    if (el.type === 'character') {
      const name = String(el.text || '').trim().toUpperCase();
      if (name) seen.add(name.replace(/\s*\(.*\)$/, ''));
    }
  }
  return [...seen];
}

/**
 * Write the next batch and commit it.
 *
 * Resolves to { job, wrote, truncated, done }. `done` means the
 * cursor reached the end — there is nothing left to run.
 * Throws AIError on anything the user can act on; the cursor is
 * NOT advanced when it throws, so a retry redoes that batch only.
 */
export async function runNextBatch({ onStatus, signal } = {}) {
  const job = load();
  if (job.stage !== 'pages') throw new GenError('Lay out the scenes first.', 'nostage');
  if (job.cursor >= job.scenes.length) return { job, wrote: 0, truncated: false, done: true };
  const AI = await ai();

  const batch = job.scenes.slice(job.cursor, job.cursor + BATCH_SIZE);
  const before = job.scenes.slice(Math.max(0, job.cursor - 2), job.cursor);
  const after = job.scenes.slice(job.cursor + batch.length, job.cursor + batch.length + 2);

  const res = await AI.draftScenePages({
    lang: job.lang,
    logline: job.logline,
    format: job.format,
    characters: knownCharacters(job),
    scenes: batch.map((s) => ({
      sceneId: s.sceneId,
      slug: s.slug,
      synopsis: s.synopsis,
      eighths: s.eighths,
      cast: s.cast,
      beatLabel: beatLabel(job, s.beat)
    })),
    before: before.map((s) => ({ slug: s.slug, synopsis: s.synopsis })),
    after: after.map((s) => ({ slug: s.slug, synopsis: s.synopsis }))
  }, { onStatus, signal });

  /* Commit, in the batch's own scene order rather than the reply's,
     so a reply that returns scene 3 before scene 1 does not write
     the script out of order. */
  const doc = Script.loadScript();

  // A revision before the FIRST batch touches a non-empty script, and
  // only then: one revision per run, not one per batch, or a feature
  // would leave twenty-five of them behind.
  if (job.cursor === 0 && doc.elements.length) {
    doc.revisions.push(Script.makeRevision(doc.elements, 'Before generated draft'));
  }

  let wrote = 0;
  for (const s of batch) {
    const els = res.byScene.get(s.sceneId);
    if (!els || !els.length) continue;
    for (const el of els) {
      doc.elements.push(Script.blankElement({ type: el.type, text: el.text }));
    }
    wrote++;
  }
  Script.saveScript(doc);

  /* Advance past the whole batch, including any scene the reply
     skipped. The alternative — stopping at the first gap — turns one
     bad scene into a run that can never finish, and the gap is
     visible in the editor, where the writer can ask for that scene
     again. Silently looping forever is worse than a hole. */
  job.cursor += batch.length;
  if (res.truncated) job.truncations += 1;
  job.model = res.model || job.model;
  if (job.cursor >= job.scenes.length) job.stage = 'done';
  save(job);

  return {
    job,
    wrote,
    skipped: batch.length - wrote,
    truncated: res.truncated,
    done: job.cursor >= job.scenes.length
  };
}

/** Pages written so far, and whether that number is arithmetic or an
    estimate. `pagesAreExact` is false for Tamil-throughout, because
    the page grid is a fixed-width Latin one and no monospaced Tamil
    font exists — see SCRIPT_LANGS in ai.js. A number presented as
    exact when it is a guess is worse than a number labelled a guess. */
export function pageReport(job) {
  const j = job || load();
  const doc = Script.loadScript();
  /* The exactness rule is duplicated from SCRIPT_LANGS rather than
     imported, because this is called during render and importing
     ai.js to answer it would defeat the laziness this module is
     arranged around. One mode, named once: Tamil in the ACTION lines
     is what breaks the grid. */
  return {
    pages: Script.pageCount(doc.elements),
    exact: j.lang !== 'ta-full',
    elements: doc.elements.length
  };
}
