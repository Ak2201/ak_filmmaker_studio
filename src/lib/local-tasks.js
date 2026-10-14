/* ============================================================
   LOCAL TASKS — Desk tasks that need no AI, no key and no plan
   ------------------------------------------------------------
   docs/NEXT-UI-REVAMP-PLAN-2026-10-14.md, phase 1: "Manual breakdown"
   is REVIEW FIRST, so its proposals are shown in the AI Desk's own
   tick list (Accept selected · Accept all · Skip, and an Undo toast),
   the list the AI path already uses — one review surface, two
   sources. The proposals come from src/lib/breakdown-extras.js, built
   on this device from the scene rows and the script; nothing is sent
   anywhere.

     shot-basic   ctx { sceneIds, after?(madeIds) }
                  the basic shot division (shot-rules.js), appended to
                  fms_shots_v1 marked `rules: true`
     story-basic  ctx { sceneIds, format?, after?(madeIds) }
                  one outline step per scene, filed under its nearest
                  beat in story.outline and linked by `sceneId`

   `local: true` is what tells the Desk (src/ui/ai-desk.js): no key
   step, no Pro gate, no "sent to <provider>" disclosure, no chat
   refinement (there is no model to refine), and the list builds the
   moment the Desk opens. Each task's run() is synchronous work behind
   a promise, so the Desk's one run path serves both kinds.

   LIGHT. ai-desk.js imports this file statically and registers the
   two tasks at its own evaluation; the models are dynamic imports in
   ready(), which the Desk awaits before it asks a task for its input.
   NO STORAGE KEY: the only memory is the module objects.
   ============================================================ */
let Extras = null, ScenesM = null, ScriptM = null, ShotsM = null, StoryM = null, Store = null;
let readyP = null;

export function ready() {
  if (!readyP) {
    readyP = Promise.all([
      import('./breakdown-extras.js'), import('./scenes.js'), import('./script.js'),
      import('./shots.js'), import('./story.js'), import('./store.js')
    ]).then(([bx, sc, sp, sh, st, so]) => {
      Extras = bx; ScenesM = sc; ScriptM = sp; ShotsM = sh; StoryM = st; Store = so.default || so;
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

function target(c) {
  const want = new Set([].concat(c.sceneIds || []).map(String));
  const all = ScenesM.listScenes();
  return { all, scenes: all.filter((s) => want.has(String(s.id))) };
}

function format(c) {
  const f = String(call(c.format) ?? c.format ?? '');
  if (f) return f === 'short' ? 'short' : 'feature';
  try { const p = Store.currentProject && Store.currentProject(); return p && p.format === 'short' ? 'short' : 'feature'; }
  catch (e) { return 'feature'; }
}

/* ---- shot-basic ------------------------------------------------ */
const shotBasic = {
  id: 'shot-basic',
  label: 'Shots from the script',
  kind: 'list',
  editable: false,
  local: true,
  input(ctx) {
    const { scenes } = target(resolve(ctx));
    if (!scenes.length) return 'No scenes to read. Run the breakdown first.';
    return 'The script pages of ' + plural(scenes.length, 'scene', 'scenes') + ' (' + Extras.sceneList(scenes)
      + '), read by the basic breakdown rules: a master or establishing shot, coverage on each speaker, '
      + 'and a close on what the action calls out.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const { all, scenes } = target(c);
    if (!scenes.length) fail('No scenes to read. Run the breakdown first.');
    const res = Extras.proposeShots({ scenes: all, elements: ScriptM.loadScript().elements, only: scenes.map((s) => s.id) });
    if (!res.items.length) fail('None of these scenes has script pages to read, so there are no shots to propose.');
    const note = plural(res.items.length, 'shot', 'shots') + ' across ' + plural(res.scenes, 'scene', 'scenes')
      + (res.noScript.length ? '. No script to read for ' + Extras.sceneList(res.noScript) + '.' : '.')
      + ' Nothing is kept until you accept.';
    return { items: res.items, note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const { shots, made } = Extras.appendShots(ShotsM.listShots(), selected);
    if (!made.length) return null;
    ShotsM.saveShots(shots);
    call(c.after, made);
    return () => {
      const gone = new Set(made);
      ShotsM.saveShots(ShotsM.listShots().filter((s) => !gone.has(s.id)));
      call(c.after, []);
    };
  }
};

/* ---- story-basic ----------------------------------------------- */
const storyBasic = {
  id: 'story-basic',
  label: 'Story steps from the scenes',
  kind: 'list',
  editable: false,
  local: true,
  input(ctx) {
    const c = resolve(ctx);
    const { scenes } = target(c);
    if (!scenes.length) return 'No scenes to read. Run the breakdown first.';
    const fw = StoryM.frameworkById(StoryM.effectiveFramework(StoryM.loadStory(), format(c)));
    return 'One outline step for each of ' + plural(scenes.length, 'scene', 'scenes') + ' (' + Extras.sceneList(scenes)
      + '): its number and slug, what happens (your synopsis, else the first action line) and who is in it, '
      + 'filed under the nearest ' + fw.label + ' beat by where the scene falls in the page count.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const { all, scenes } = target(c);
    if (!scenes.length) fail('No scenes to read. Run the breakdown first.');
    const fwId = StoryM.effectiveFramework(StoryM.loadStory(), format(c));
    const res = Extras.proposeStory({ scenes: all, elements: ScriptM.loadScript().elements, fwId, only: scenes.map((s) => s.id) });
    if (!res.items.length) fail('There were no scenes to file.');
    return {
      items: res.items,
      note: plural(res.items.length, 'step', 'steps') + ' against the ' + res.framework.label
        + ' beats. Each is linked to its scene; nothing is kept until you accept.'
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const s = StoryM.loadStory();
    const made = Extras.appendSteps(s, selected);
    if (!made.length) return null;
    StoryM.saveStory(s);
    call(c.after, made);
    return () => {
      const back = StoryM.loadStory();
      Extras.removeSteps(back, made);
      StoryM.saveStory(back);
      call(c.after, []);
    };
  }
};

export const LOCAL_TASKS = [shotBasic, storyBasic];
export const LOCAL_TASK_IDS = LOCAL_TASKS.map((t) => t.id);
export default { ready, LOCAL_TASKS, LOCAL_TASK_IDS };
