/* ============================================================
   BREAKDOWN EXTRAS — shots and story steps PROPOSED from the scenes
   ------------------------------------------------------------
   docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md, phase 1. The breakdown
   (src/lib/breakdown-run.js) makes scene rows, cast tags, locations
   and totals. This module is the half that comes after it: from the
   scene rows and the script it PROPOSES

     · a shot division per scene — the basic rules in
       src/lib/shot-rules.js (basicJobs → basicShotDivisionSync), every
       draft marked `rules: true`, the provenance field blankShot()
       already declares;
     · one outline step per scene — the scene's synopsis if the writer
       typed one, else the first action line of its script slice, with
       its number, slug and cast — filed under the beat it sits nearest
       (story.js nearestBeat, by the scene's place in the page count)
       and linked by `sceneId`, the field outline steps already carry.

   PURE, AND IT WRITES NOTHING. Every function takes the data it reads
   as arguments (scenes, elements, shots, story) and returns a value.
   The owner's decision is REVIEW FIRST: these proposals are shown in
   the AI Desk's tick list (the non-AI tasks `shot-basic` and
   `story-basic` in src/lib/local-tasks.js) and nothing reaches storage
   until the writer presses Accept. The two append helpers at the foot
   build the NEW record lists for that Accept; the caller saves them.

   NO NEW KEY. Shots go in `fms_shots_v1` as ordinary shots; steps go
   in `story.outline` as ordinary steps with `sceneId` — both fields
   that exist today.

   ONLY NEW SCENES. A re-run proposes for the scenes that have nothing
   yet: `scenesWithShots()` and `scenesWithSteps()` say which scenes
   already have something, and `splitExisting()` divides a target list
   so the caller can ask (dialog.js, never a native confirm) whether to
   skip those or add alongside.

   Node-tested by scripts/test-breakdown-extras.mjs (test:breakdown-extras).
   ============================================================ */
import { basicJobs, basicShotDivisionSync } from './shot-rules.js';
import { blankShot } from './shots.js';
import { matchScenes, cueName, titleCase } from './screenplay-analysis.js';
import { frameworkById, nearestBeat, qualifyBeat, resolveBeatKey, addOutlineStep, removeOutlineStep } from './story.js';

const textOf = (el) => String((el && el.text) ?? '').trim();
const oneLine = (s, max) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
};

/** The slug as the studio prints it: "INT. CHAI SHOP — DAY". */
export const sceneSlug = (s) =>
  (s.intExt || 'INT') + '. ' + (String(s.location || '').trim().toUpperCase() || 'LOCATION TBC') + ' — ' + (s.dayNight || 'DAY');

const numLabel = (s) => 'Sc ' + (String(s.number || '').trim() || '—');

/* ---- what already exists ------------------------------------- */

/** Scene ids that have at least one shot. */
export function scenesWithShots(shots) {
  return new Set((shots || []).filter((s) => s && s.sceneId).map((s) => String(s.sceneId)));
}

/** Scene ids that at least one outline step is linked to. */
export function scenesWithSteps(story) {
  return new Set(((story && story.outline) || []).filter((s) => s && s.sceneId).map((s) => String(s.sceneId)));
}

/** Divide `scenes` into those with nothing yet and those `have` names.
 *  { fresh: [scene], existing: [scene] }, each in the order given. */
export function splitExisting(scenes, have) {
  const fresh = [], existing = [];
  for (const s of scenes || []) (have.has(String(s.id)) ? existing : fresh).push(s);
  return { fresh, existing };
}

/** "Sc 3, 5 and 7" — the scenes a prompt names. A long list is cut
 *  and says how many more there are. */
export function sceneList(scenes, max = 12) {
  const n = (scenes || []).map((s) => String(s.number || '').trim() || '—');
  if (!n.length) return '';
  if (n.length > max) return 'Sc ' + n.slice(0, max).join(', ') + ' and ' + (n.length - max) + ' more';
  if (n.length === 1) return 'Sc ' + n[0];
  return 'Sc ' + n.slice(0, -1).join(', ') + ' and ' + n[n.length - 1];
}

/* ---- shots ---------------------------------------------------- */

/**
 * Shot proposals for `scenes` (default every scene), from the script.
 * Returns
 *   { items: [{ id, sceneId, draft, text, detail }],
 *     scenes: number of scenes that got shots,
 *     noScript: [scene] — scenes with no script slice to read }
 * `draft` is a shot patch for blankShot()/addShot(), marked rules: true.
 */
export function proposeShots({ scenes, elements, only = null } = {}) {
  const rows = scenes || [];
  const want = only ? new Set([...only].map(String)) : null;
  const target = want ? rows.filter((s) => want.has(String(s.id))) : rows;
  const jobs = basicJobs(rows, elements || [], { only: new Set(target.map((s) => s.id)) });
  const withJob = new Set(jobs.map((j) => String(j.sceneId)));
  const res = basicShotDivisionSync(jobs);
  const byId = new Map(rows.map((s) => [String(s.id), s]));
  const items = [];
  for (const [sceneId, list] of res.byScene) {
    const scene = byId.get(String(sceneId)) || {};
    list.forEach((d, i) => items.push({
      id: sceneId + '#' + i,
      sceneId: String(sceneId),
      draft: { ...d, rules: true },
      text: numLabel(scene) + ' · ' + d.description,
      detail: [d.size, d.angle, d.movement, d.lens].filter(Boolean).join(' · ')
    }));
  }
  return {
    items,
    scenes: res.byScene.size,
    noScript: target.filter((s) => !withJob.has(String(s.id)))
  };
}

/**
 * The shot list after appending the chosen drafts. Each new shot is
 * numbered after the shots its scene already has, as addShot() numbers
 * one, so a second run never renumbers anything. Pure: returns
 * { shots: the whole new list, made: [new ids] }.
 */
export function appendShots(existing, chosen) {
  const shots = (existing || []).slice();
  /* One past the highest number in the scene, not count + 1: after a
     delete the count falls below the top number and count + 1 handed
     out a number a shot already had (scenes.js addScene, audit M26). */
  const top = new Map();
  for (const s of shots) {
    const k = String(s.sceneId);
    top.set(k, Math.max(top.get(k) || 0, parseInt(s && s.number, 10) || 0));
  }
  const made = [];
  for (const it of chosen || []) {
    if (!it || !it.sceneId || !it.draft) continue;
    const k = String(it.sceneId);
    const n = (top.get(k) || 0) + 1;
    top.set(k, n);
    const shot = blankShot({ sceneId: k, number: String(n), ...it.draft });
    shots.push(shot);
    made.push(shot.id);
  }
  return { shots, made };
}

/* ---- story ---------------------------------------------------- */

/** The cast a scene is tagged with, else the cues its slice names. */
function castOf(scene, slice) {
  const tagged = (scene.elements && scene.elements.cast) || [];
  if (tagged.length) return tagged.slice();
  const seen = new Map();
  for (const el of (slice && slice.elements) || []) {
    if (el.type !== 'character') continue;
    const k = cueName(el.text);
    if (k && !seen.has(k)) seen.set(k, titleCase(k.toLowerCase()));
  }
  return [...seen.values()];
}

/** The first action line of a slice, or ''. */
export function firstAction(slice) {
  const el = ((slice && slice.elements) || []).find((e) => e.type === 'action' && textOf(e));
  return el ? textOf(el) : '';
}

/**
 * Where each scene sits in the film, 0..1: the midpoint of its pages
 * in the running page count (eighths), or of its place in the order
 * when no scene carries a length. Map<sceneId, pos>.
 */
export function scenePositions(scenes) {
  const rows = scenes || [];
  const len = rows.map((s) => { const e = Number(s.eighths); return Number.isFinite(e) && e > 0 ? e : 0; });
  const total = len.reduce((a, b) => a + b, 0);
  const out = new Map();
  let at = 0;
  rows.forEach((s, i) => {
    if (total > 0) { out.set(String(s.id), (at + len[i] / 2) / total); at += len[i]; }
    else out.set(String(s.id), rows.length ? (i + 0.5) / rows.length : 0);
  });
  return out;
}

/**
 * The qualified beat a scene's step is filed under in framework `fwId`:
 * the scene's own `beatId` when it names a beat of this framework; a
 * beat of ANOTHER framework is carried across by its position; else the
 * beat nearest the scene's place in the page count.
 */
export function beatForScene(scene, pos, fwId) {
  const fw = frameworkById(fwId);
  const own = resolveBeatKey(scene && scene.beatId);
  if (own && own.fw.id === fw.id) return qualifyBeat(fw.id, own.beat.id);
  const at = own ? own.beat.at : pos;
  const b = nearestBeat(fw.id, Number.isFinite(at) ? at : 0);
  return b ? qualifyBeat(fw.id, b.id) : '';
}

/** The step text for one scene: what happens, then who is in it. */
export function stepText(scene, slice) {
  const what = oneLine(scene.synopsis, 400) || oneLine(firstAction(slice), 400);
  const cast = castOf(scene, slice);
  const head = numLabel(scene) + ' — ' + sceneSlug(scene);
  return head + (what ? ': ' + what : '') + (cast.length ? ' (' + cast.join(', ') + ')' : '');
}

/**
 * Outline-step proposals, one per scene in `only` (default every
 * scene), filed under the nearest beat of framework `fwId`.
 * Returns { items: [{ id, sceneId, beat, text, detail }], framework }.
 * A scene with neither a synopsis, an action line nor a cast still
 * gets a step — its number and slug are real data, and a step the
 * writer can fill in beats a gap in the outline.
 */
export function proposeStory({ scenes, elements, fwId, only = null } = {}) {
  const rows = scenes || [];
  const fw = frameworkById(fwId);
  const want = only ? new Set([...only].map(String)) : null;
  const slices = new Map(matchScenes(rows, elements || []).pairs.map((p) => [String(p.scene.id), p.slice]));
  const pos = scenePositions(rows);
  const labelOf = new Map(fw.beats.map((b) => [qualifyBeat(fw.id, b.id), b.label]));
  const items = [];
  for (const scene of rows) {
    const id = String(scene.id);
    if (want && !want.has(id)) continue;
    const beat = beatForScene(scene, pos.get(id), fw.id);
    if (!beat) continue;
    items.push({
      id: 'st:' + id,
      sceneId: id,
      beat,
      text: stepText(scene, slices.get(id) || null),
      detail: 'Under ' + (labelOf.get(beat) || beat) + ' · ' + fw.short
    });
  }
  return { items, framework: { id: fw.id, label: fw.label, short: fw.short } };
}

/**
 * File the chosen steps into `story.outline` (the object handed in, as
 * every story.js helper works), each under its beat and linked to its
 * scene by `sceneId`. Returns the new step ids, which is what
 * removeSteps() takes. The caller saves the story.
 */
export function appendSteps(story, chosen) {
  const made = [];
  for (const it of chosen || []) {
    if (!it || !it.sceneId || !String(it.text || '').trim()) continue;
    const st = addOutlineStep(story, { beat: it.beat, text: String(it.text).trim() });
    if (!st) continue;
    st.sceneId = String(it.sceneId);
    made.push(st.id);
  }
  return made;
}

/** Undo appendSteps(): removes exactly those step ids. Returns how many went. */
export function removeSteps(story, ids) {
  let n = 0;
  for (const id of ids || []) if (removeOutlineStep(story, id)) n++;
  return n;
}

export default {
  sceneSlug, scenesWithShots, scenesWithSteps, splitExisting, sceneList,
  proposeShots, appendShots, firstAction, scenePositions, beatForScene, stepText, proposeStory, appendSteps, removeSteps
};
