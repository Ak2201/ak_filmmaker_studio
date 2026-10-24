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
   collapsed) both sides last agreed on, `syncedBeat` the beat. A step
   sent before the baseline existed has neither, and is ADOPTED: the
   baseline is recorded and nothing else is written. The old send cut
   the synopsis to 280 characters ("…" on the end), so a scene still
   holding that cut of its step counts as agreeing with it, then and
   after.

   plan(step, scene) ->
     'same'      nothing to carry (the baseline may still need writing)
     'push'      the step changed; the scene still holds the baseline
     'pull'      the scene changed; the step still holds the baseline
     'conflict'  both changed, differently
     'adopt'     an older pair with no baseline that agrees
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

export function plan(step, scene) {
  if (!step || !step.sceneId) return null;
  if (!scene) return 'gone';
  const text = step.text, syn = scene.synopsis;
  if (!hasBase(step)) return sceneAgrees(syn, text) ? 'adopt' : 'conflict';
  const base = step.synced;
  const stepSame = norm(text) === norm(base);
  const sceneSame = sceneAgrees(syn, base);
  if (stepSame && sceneSame) return 'same';
  if (norm(syn) === norm(text)) return 'same';        // both moved to the same words
  if (sceneSame) return 'push';
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
