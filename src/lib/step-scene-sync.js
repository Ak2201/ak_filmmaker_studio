/* ============================================================
   BEAT STEP <-> SCENE — what to do with one linked pair
   ------------------------------------------------------------
   A Beat Sheet step that was sent to the Screenplay carries
   `sceneId`; the scene stores no step id. While the two still agree
   with what they last agreed on, an edit on either side is carried to
   the other (owner, 24 Oct 2026: "both ways, and nothing is ever
   overwritten silently"). When BOTH changed, nothing is written: each
   side is offered the other's text.

   THE BASELINE lives on the step: `synced` is the text (whitespace
   collapsed) both sides last agreed on, `syncedBeat` the beat, and
   `syncedWas` the baseline before the last one. A step sent before the
   baseline existed has none of them:
     - its scene holds the same text: ADOPTED, the baseline is recorded
       and nothing else is written;
     - its scene holds the old send's 280-character cut of it ("…" on
       the end): PUSHED, so the scene gets the full text before anybody
       edits the cut (an edit to the cut, pulled, would shrink the step
       to it);
     - anything else (a sample's step prose, a breakdown's "Sc 1 — SLUG"
       line): APART, left out of the sync. They never agreed, so neither
       side's text is offered over the other's.

   A SCENE BEHIND, not edited. The story and the scenes are two rows, so
   a collaborator's step edit can arrive here before the scene it was
   pushed to. The step then holds its new baseline and the scene the one
   before it (`syncedWas`): that is the scene behind, and it is pushed —
   never read as "the scene changed", which pulled the old text back
   over the newer step and sent the two pages round in a loop.
   ONLY UNTIL THIS PAGE HAS SEEN THE SCENE CATCH UP (`opts.caughtUp`,
   which story.js keeps in memory per page): after that, a scene holding
   the older words again was EDITED back to them here (a revert, or
   Ctrl+Z in the Scene List), and is pulled like any other edit (QA
   round 2: the revert was pushed over, silently).

   plan(step, scene, { caughtUp }?) ->
     'same'      nothing to carry (the baseline may still need writing)
     'push'      the step changed; the scene still holds the baseline
     'pull'      the scene changed; the step still holds the baseline
     'conflict'  both changed, differently
     'adopt'     an older pair with no baseline that agrees
     'apart'     an older pair with no baseline that never agreed
     'gone'      the scene is in the bin, or missing
   and null for a step that links nothing.

   PURE: imports nothing. story.js reconcileStepScenes() applies it.
   ============================================================ */

export const norm = (t) => String(t == null ? '' : t).replace(/\s+/g, ' ').trim();

/** The synopsis the old send wrote for a step's text. */
export const oldCut = (t) => {
  const x = norm(t);
  return x.length > 280 ? x.slice(0, 277).trimEnd() + '…' : x;
};

/** Does a scene's synopsis agree with a step text? Equal, or the old cut of it. */
export const sceneAgrees = (synopsis, text) => {
  const s = norm(synopsis);
  return s === norm(text) || s === oldCut(text);
};

const hasBase = (step) => typeof (step && step.synced) === 'string';

export function plan(step, scene, opts = {}) {
  if (!step || !step.sceneId) return null;
  if (!scene) return 'gone';
  const text = norm(step.text), syn = norm(scene.synopsis);
  if (!hasBase(step)) {
    if (syn === text) return 'adopt';
    return syn === oldCut(text) ? 'push' : 'apart';
  }
  const base = norm(step.synced);
  const stepSame = text === base;
  if (syn === text) return 'same';                     // in step (or both moved to the same words)
  /* A scene whose synopsis was just emptied (often mid-edit, about to be
     retyped) never blanks the step: that would erase the only other copy of
     the writing with no way back. The pair simply differs until it is filled. */
  if (!syn && text) return 'same';
  /* The scene still holds the baseline, its old cut, or the baseline
     before it: it was not edited, so it takes the step's text. */
  const behind = syn === base || syn === oldCut(base)
    || (!opts.caughtUp && typeof step.syncedWas === 'string' && sceneAgrees(syn, step.syncedWas));
  if (behind) return 'push';
  if (stepSame) return 'pull';
  return 'conflict';
}

/** The beat: a step re-filed since the last sync carries its scene with
 *  it. 'push' (set the scene's beatId), 'adopt' (record the baseline
 *  only) or 'same'. A scene re-filed on the board moves its step there
 *  and then (story.js followSceneBeat), so the scene side needs no rule. */
export function planBeat(step, scene) {
  if (!step || !step.sceneId || !scene) return null;
  if (typeof step.syncedBeat !== 'string') return 'adopt';
  if (step.beat === step.syncedBeat) return 'same';
  return scene.beatId === step.beat ? 'adopt' : 'push';
}

export default { norm, oldCut, sceneAgrees, plan, planBeat };
