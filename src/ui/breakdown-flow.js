/* ============================================================
   BREAKDOWN FLOW — Manual breakdown and Breakdown with AI
   ------------------------------------------------------------
   docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md, phases 1–2. Both modes do
   the same three things, and only the source of the proposals differs:

     1. runBreakdown()  scene rows, cast tags, locations, totals — the
                        run the page has always made (its own toast and
                        Undo, through `onRun`);
     2. shots           review first, in the Desk's tick list:
                        Manual → 'shot-basic' (rules, src/lib/local-tasks.js)
                        AI     → 'shot-draft' (the model, src/lib/ai-tasks.js)
     3. story           one outline step per scene, under its beat,
                        linked by sceneId, opened by step 2's
                        after(madeIds) — and only when it made some:
                        Manual → 'story-basic'   AI → 'scene-story'

   OWNER'S DECISIONS, kept here:
     · nothing is kept until the writer accepts (both modes);
     · a scene that already has shots (or a story step) is ASKED about,
       each time, with the scenes named — skip them or add alongside.
       The default (Escape, the scrim, "Skip them") is skip, which is
       what makes a re-run propose for the NEW scenes only;
     · Skip in the shots review ends the chain; Accept moves on;
     · AI stays Pro + own key: the AI half is a ctx for the AI pill
       (aiPill({ tasks: ['shot-draft'], ctx: aiBreakdownCtx(…) })), so
       the pill's locked / nokey states stand in front of it, and the
       breakdown does not run behind a Desk that only says "add a key".

   EXPORTS
     manualBreakdown(opts)    run + shot-basic → story-basic
     aiBreakdownCtx(opts)     the ctx function for the AI pill
     breakdownWithAI(opts)    the same chain opened without a pill
   opts { run?() → runBreakdown's result (default: runBreakdown()),
          onRun?(result)  the page's render, straight after the run,
          announce?(result)  the page's toast, once the reviews END —
                          not over the existing-shots question or the
                          Desk, which on a phone sit where toasts do,
          refresh?(madeIds)  repaint after an Accept or an Undo }

   No storage key, nothing on first paint beyond this file: the models
   and the Desk are dynamic imports.
   ============================================================ */
import { runBreakdown } from '../lib/breakdown-run.js';
import { hasKey } from '../lib/ai-providers.js';
import { ask } from './dialog.js';
import StudioUI from './chrome.js';

const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

let mods = null;
function models() {
  if (!mods) {
    mods = Promise.all([
      import('../lib/scenes.js'), import('../lib/shots.js'), import('../lib/story.js'), import('../lib/breakdown-extras.js')
    ]).then(([sc, sh, st, bx]) => ({ Scenes: sc, Shots: sh, Story: st, Extras: bx }))
      .catch((e) => { mods = null; throw e; });
  }
  return mods;
}

const desk = () => import('./ai-desk.js');
const later = (fn) => setTimeout(fn, 0);   // after the Desk has closed on Accept

/* The run's own announcement waits for the chain of reviews to end
   (owner follow-up, 14 Oct 2026): on a phone the "Broke down …" toast
   sat over the existing-shots question and the Desk's sheet. One
   chain at a time; `next` is set while a hand-over to the story
   review is on its way, so the shots review closing does not count. */
let chain = null;
function startChain(opts, res) {
  if (chain) chain.done();
  const c = { next: false, said: false };
  const onClose = () => setTimeout(() => { if (chain === c && !c.next) c.done(); }, 0);
  c.done = () => {
    window.removeEventListener('ai-desk:closed', onClose);
    if (chain === c) chain = null;
    if (c.said) return;
    c.said = true;
    call(opts && opts.announce, res);
  };
  window.addEventListener('ai-desk:closed', onClose);
  chain = c;
  return c;
}
const endChain = () => { if (chain) chain.done(); };

/** Run the breakdown and hand the result to the page. null when it
 *  could not run or the script has no headings (the page has said so). */
function runStep(opts) {
  let res;
  try { res = (opts && typeof opts.run === 'function') ? opts.run() : runBreakdown(); }
  catch (e) {
    console.warn('[breakdown-flow] run', e);
    StudioUI.toast('The breakdown could not run on this script.', { type: 'error' });
    return null;
  }
  call(opts && opts.onRun, res);
  const c = startChain(opts, res);
  if (!res || (res.applied && res.applied.empty)) { c.done(); return null; }
  return res;
}

/**
 * The scenes to propose for: all of them, less those `have` names
 * unless the writer chooses to add alongside. `what` is the plural
 * noun for the dialog ("shots", "story steps").
 */
async function targets(scenes, have, what) {
  const { Extras } = await models();
  const { fresh, existing } = Extras.splitExisting(scenes, have);
  if (!existing.length) return fresh;
  const all = existing.length === scenes.length;
  const add = await ask({
    eyebrow: 'Breakdown',
    title: plural(existing.length, 'scene already has ' + what, 'scenes already have ' + what),
    body: Extras.sceneList(existing) + (existing.length === 1 ? ' already has ' : ' already have ') + what + '. '
      + 'Skip ' + (existing.length === 1 ? 'it' : 'them') + (all ? '' : ' and propose for the ' + plural(fresh.length, 'new scene', 'new scenes') + ' only')
      + ', or add the new proposals alongside what is there? Nothing is replaced either way.',
    confirm: 'Add alongside',
    cancel: all ? 'Skip' : 'Skip them'
  });
  return add ? scenes.slice() : fresh;
}

/** The story review's ctx, or null when no scene is left to file. */
async function storyCtx(opts) {
  const { Scenes, Story, Extras } = await models();
  const scenes = Scenes.listScenes();
  const list = await targets(scenes, Extras.scenesWithSteps(Story.loadStory()), 'story steps');
  if (!list.length) {
    if (scenes.length) StudioUI.toast('Every scene already has a story step, so there is nothing new to file.');
    return null;
  }
  return { sceneIds: list.map((s) => s.id), after: (made) => call(opts && opts.refresh, made) };
}

async function openStory(taskId, opts) {
  let c = null;
  try { c = await storyCtx(opts); }
  finally { if (chain) chain.next = false; }
  if (!c) { endChain(); return; }
  const D = await desk();
  await D.openDesk(taskId, c);
  if (!document.documentElement.classList.contains('ai-desk-open')) endChain();   // it did not open
}

/** The shots review's ctx for `storyTask`, a hand-over straight to the
 *  story review when no scene needs shots, or null for neither. */
async function shotsCtx(storyTask, opts) {
  const { Scenes, Shots, Extras } = await models();
  const scenes = Scenes.listScenes();
  const list = await targets(scenes, Extras.scenesWithShots(Shots.listShots()), 'shots');
  if (!list.length) {
    const c = await storyCtx(opts);
    return c ? { ...c, task: storyTask } : null;
  }
  return {
    sceneIds: list.map((s) => s.id),
    after: (made) => {
      call(opts && opts.refresh, made);
      if (made && made.length) {
        if (chain) chain.next = true;   // the story review follows; this close is not the end
        later(() => openStory(storyTask, opts));   // Undo hands [] and opens nothing
      }
    }
  };
}

/** Manual breakdown: the run, then the rules' shots, then the story —
 *  each a review the writer accepts or skips. No key, no plan. */
export async function manualBreakdown(opts = {}) {
  const res = runStep(opts);
  if (!res) return null;
  let c;
  try { c = await shotsCtx('story-basic', opts); }
  catch (e) { endChain(); console.warn('[breakdown-flow] manual', e); StudioUI.toast('The shot and story proposals could not load. Reload the page and try again.', { type: 'error' }); return res; }
  if (!c) { endChain(); return res; }
  const D = await desk();
  await D.openDesk(c.task || 'shot-basic', c);
  if (!document.documentElement.classList.contains('ai-desk-open')) endChain();   // it did not open
  return res;
}

/**
 * The ctx function for the "Breakdown with AI" pill (task 'shot-draft').
 * The Desk calls it at the click — after the pill's plan check — and it
 * runs the breakdown only when a key is there to use: without one the
 * Desk shows its "add your key" step and nothing has been written.
 */
export function aiBreakdownCtx(opts = {}) {
  return async () => {
    if (!hasKey()) return {};
    const res = runStep(opts);
    if (!res) return { cancel: true };
    try {
      const c = await shotsCtx('scene-story', opts);
      if (!c) endChain();
      /* the Desk opens on this ctx; if it never does (a hand-over the
         plan refuses), nothing closes, so say the run after a beat */
      else setTimeout(() => { if (!document.documentElement.classList.contains('ai-desk-open')) endChain(); }, 0);
      return c || { cancel: true };
    } catch (e) {
      endChain();
      console.warn('[breakdown-flow] ai', e);
      StudioUI.toast('The AI review could not load. Reload the page and try again.', { type: 'error' });
      return { cancel: true };
    }
  };
}

/** The AI chain without a pill (the Desk's own plan check applies). */
export async function breakdownWithAI(opts = {}) {
  const D = await desk();
  return D.openDesk('shot-draft', aiBreakdownCtx(opts));
}

export default { manualBreakdown, aiBreakdownCtx, breakdownWithAI };
