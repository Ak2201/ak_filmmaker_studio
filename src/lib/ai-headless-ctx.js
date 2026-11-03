/* ============================================================
   AI HEADLESS CTX — a task's ctx with no page behind it
   ------------------------------------------------------------
   An AI Desk task reads its ctx from the page that opened it: the open
   document, the selected scenes, a toast to talk through. Run all
   (ai-run-all.js) runs tasks with no page open, and accepts their drafts
   later from a list, so each task gets a ctx built from the MODELS
   instead (scenes.js, shots.js, characters.js, contacts.js, locations.js,
   the stored script and story). Every task already falls back to the
   stored model where a ctx function is absent; this file supplies only
   what a task cannot find for itself:

     shot-draft       sceneIds (the plan's); after() is a no-op
     blocking-draft   sceneId; draftShots — the parent shot-draft's
                      DRAFT shots for this scene, ids 'draft:<n>', still
                      unaccepted (an accepted one is a real shot by then)
     board-frames     draftShots, the same, every scene
     budget-estimate  scenes — the stored list AS IF the parent's drafted
                      shoot order were accepted (planPlacements, pure)
     callsheet-notes  sheetId; facts() — the sheet's facts as
                      contacts.html builds them; offerUnit() keeps the unit
                      message for the caller instead of a toast
     character-arcs   list() / save() over ONE loaded list, so a run of
                      field writes lands on the list it then saves
     recce-notes      locationName '' (every place)

   Every ctx carries `said` (what the task said through ctx.say), which
   the run-all view shows in place of a toast, and `unit` (a call
   sheet's unit message). The same object serves run() and, at Accept,
   apply(); nothing here writes.

   headlessReady() must have resolved before headlessCtx() is called (the
   models are loaded once, lazily, the way ai-tasks.js loads its own).
   NO document, no storage key, no page import.
   ============================================================ */
import { draftShotId } from './ai-run-all-model.js';

let ScenesM = null, ShotsM = null, CharsM = null, ContactsM = null, ContactsX = null, PrepM = null, ScriptM = null, PDF = null;
let readyP = null;

/** Load every model a headless ctx reads (idempotent). */
export function headlessReady() {
  if (!readyP) {
    readyP = Promise.all([
      import('./scenes.js'), import('./shots.js'), import('./characters.js'), import('./contacts.js'),
      import('./contacts-model.js'), import('./ai-preprod-model.js'), import('./script.js'),
      /* the film's title and paper prefs, as contacts.html reads them; a
         build where pdf.js cannot load still gets the store's title */
      import('./pdf.js').catch(() => null)
    ]).then(([sc, sh, ch, co, cx, pm, sp, pdf]) => {
      ScenesM = sc; ShotsM = sh; CharsM = ch; ContactsM = co; ContactsX = cx; PrepM = pm; ScriptM = sp;
      PDF = pdf ? (pdf.default || pdf) : null;
      return true;
    }).catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}

const need = () => { if (!ScenesM) throw new Error('[ai-headless-ctx] call headlessReady() first'); };
const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

/** The parent result this node reads, when its draft is still READY
    (an accepted parent is in the models already; anything else is not). */
const readyParent = (parentsResults, taskId) => {
  for (const p of Object.values(parentsResults || {})) {
    if (p && p.taskId === taskId && p.status === 'ready' && p.result) return p;
  }
  return null;
};

/**
 * The drafted shots of a shot-draft result: one per item, id 'draft:<n>'
 * (n = the item's index), numbered after what the scene holds now, the
 * way shots.js addShot numbers them. Items already accepted (`made`
 * names them) are real shots and are left out. Pure over its inputs.
 */
export function draftShotsOf(result, { made = {}, shots = [] } = {}) {
  const items = isObj(result) && Array.isArray(result.items) ? result.items : [];
  const top = new Map();
  for (const s of shots) {
    const n = parseInt(s && s.number, 10) || 0;
    if (n > (top.get(s.sceneId) || 0)) top.set(s.sceneId, n);
  }
  const out = [];
  items.forEach((it, n) => {
    if (!it || !it.sceneId || !isObj(it.draft)) return;
    const id = draftShotId(n);
    if (made && made[id]) return;
    const next = (top.get(it.sceneId) || 0) + 1;
    top.set(it.sceneId, next);
    const d = it.draft;
    out.push({
      id, sceneId: String(it.sceneId), number: String(next), size: d.size || '', angle: d.angle || '',
      movement: d.movement || '', lens: d.lens || '', rig: d.rig || '', setup: d.setup || '', description: d.description || ''
    });
  });
  return out;
}

/** The scene list as if a drafted shoot order (its result's items) were
    accepted: each placed scene carries the drafted day. Pure. */
export function scenesAsIf(scenes, result, planPlacements) {
  const items = isObj(result) && Array.isArray(result.items) ? result.items : [];
  if (!items.length || typeof planPlacements !== 'function') return scenes;
  const { moves } = planPlacements(items, scenes);
  const day = new Map(moves.map((m) => [String(m.sceneId), m.day]));
  return scenes.map((s) => (day.has(String(s.id)) ? { ...s, shootDay: day.get(String(s.id)) } : s));
}

/**
 * headlessCtx(taskId, nodeCtx, { parentsResults }) → the ctx the task's
 * input / run / apply read. parentsResults: { [parentKey]: { taskId,
 * status, result, made } } (the parent drafts as stored).
 */
export function headlessCtx(taskId, nodeCtx = {}, { parentsResults = {} } = {}) {
  need();
  const said = [];
  const base = {
    ...(isObj(nodeCtx) ? nodeCtx : {}),
    said,
    unit: '',
    say: (m) => { if (m != null && String(m).trim()) said.push(String(m)); },
    after: () => {},
    render: () => {},
    rerender: () => {}
  };
  const shotParent = () => {
    const p = readyParent(parentsResults, 'shot-draft');
    return p ? draftShotsOf(p.result, { made: p.made || {}, shots: ShotsM.listShots() }) : [];
  };
  switch (taskId) {
    case 'blocking-draft': {
      const mine = shotParent().filter((s) => s.sceneId === String(base.sceneId || ''));
      base.draftShots = mine;
      base.prompt = String(base.prompt || '');
      break;
    }
    case 'board-frames':
      base.draftShots = shotParent();
      break;
    case 'budget-estimate': {
      const p = readyParent(parentsResults, 'shoot-order');
      if (p) base.scenes = scenesAsIf(ScenesM.listScenes(), p.result, PrepM.planPlacements);
      break;
    }
    case 'callsheet-notes': {
      const id = String(base.sheetId || '');
      const title = () => {
        try { if (PDF && PDF.projectTitle) return PDF.projectTitle(); } catch (e) { /* below */ }
        try { return ScriptM.projectTitle(); } catch (e) { return ''; }
      };
      const prefs = () => {
        try { if (PDF && PDF.filmPrefs) return PDF.filmPrefs(); } catch (e) { /* below */ }
        return { paper: 'A4', dateStyle: 'IN' };
      };
      base.facts = () => {
        const sh = ContactsM.listCallSheets().find((x) => x.id === id) || null;
        return sh ? ContactsX.factsOf(sh, ScenesM.listScenes(), title(), prefs()) : null;
      };
      base.offerUnit = (text) => { base.unit = String(text || ''); };
      break;
    }
    case 'character-arcs': {
      /* One list per operation: apply() writes field after field into
         list() and then saves; a fresh load per call would save a list
         that never saw the writes. apply() and its undo are synchronous,
         so the list is held until the operation's turn ends (or save()),
         never into the next one, which would save a stale list. */
      let held = null;
      base.list = () => {
        if (!held) { held = CharsM.loadCharacters(); queueMicrotask(() => { held = null; }); }
        return held;
      };
      base.save = () => { if (held) CharsM.saveCharacters(held); held = null; };
      break;
    }
    case 'recce-notes':
      base.locationName = String(base.locationName || '');
      break;
    default:
      break;
  }
  return base;
}

export default { headlessReady, headlessCtx, draftShotsOf, scenesAsIf };
