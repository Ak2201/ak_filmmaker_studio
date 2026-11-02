/* ============================================================
   AI HISTORY — REVERT: take a run back from the History, carefully
   ------------------------------------------------------------
   docs/AI-FAST-HARNESS.md B5. Applies ai-history.js revertPlan()
   through the owning models, one write per model:
     a record the run CREATED   → removed
     fields the run FILLED      → blanked, and the run's stamp dropped
   and only while the record still hashes to what the run wrote. The
   plan is made from a FRESH read, not from the list the screen holds, so
   an edit made since the list was drawn is seen. Nothing edited is ever
   touched; the caller says how many stayed. An append or a replace is
   never undone from here (the old value was not stored). No document, no
   dialog: the UI asks first (src/ui/ai-history-view.js, dialog.js).

   Returns { reverted, kept, notUndoable }.
   ============================================================ */
import * as Shots from './shots.js';
import * as Scenes from './scenes.js';
import * as Script from './script.js';
import * as Story from './story.js';
import * as Chars from './characters.js';
import * as Contacts from './contacts.js';
import * as Loc from './locations.js';
import * as Edit from './editlog.js';
import { revertPlan } from './ai-history.js';
import { readProjectAI } from './ai-history-read.js';
import { unstampFill } from './ai-stamp.js';

/* What "blank" means for a field a run filled. */
const BLANK = { cutCandidate: false, shootDay: 0, alts: [], loglineAlts: [], comps: [], marks: [], set: [], axis: null };
const blankOf = (f) => (f in BLANK ? (Array.isArray(BLANK[f]) ? [] : BLANK[f]) : '');

/* A record with the fields blanked and this run's stamp dropped. */
function blanked(rec, fields, run) {
  const out = { ...rec };
  for (const f of fields) out[f] = blankOf(f);
  const left = unstampFill(out, run);
  if (left.aiFill) out.aiFill = left.aiFill; else delete out.aiFill;
  return out;
}

const groupBy = (items) => {
  const m = new Map();
  for (const it of items) { if (!m.has(it.kind)) m.set(it.kind, []); m.get(it.kind).push(it); }
  return m;
};

/** Revert these entries (as a screen holds them). */
export function revertEntries(list) {
  const want = new Set((list || []).map((e) => e.key));
  const fresh = readProjectAI().filter((e) => want.has(e.key));
  const plan = revertPlan(fresh);
  let reverted = 0;
  let kept = plan.kept;
  const rm = groupBy(plan.remove);
  const bl = groupBy(plan.blank);
  const ids = (kind) => new Set((rm.get(kind) || []).map((x) => x.id));
  const fillOf = (kind) => new Map((bl.get(kind) || []).map((x) => [x.id, x]));

  /* shots (and their camera links) */
  if (rm.has('shot') || bl.has('shot')) {
    const gone = ids('shot');
    const fills = fillOf('shot');
    const frames = Shots.listFrames();
    const blocks = Shots.listBlocks();
    const hung = (id) => frames.some((f) => f.shotId === id) || blocks.some((b) => b.shotId === id);
    const next = [];
    for (const s of Shots.listShots()) {
      if (gone.has(s.id)) {
        if (hung(s.id)) { kept += 1; next.push(s); } else reverted += 1;
        continue;
      }
      const f = fills.get(s.id);
      if (f) { next.push(blanked(s, f.fields, f.run)); reverted += 1; } else next.push(s);
    }
    Shots.saveShots(next);
  }
  if (rm.has('frame')) {
    const gone = ids('frame');
    const left = Shots.listFrames().filter((f) => !gone.has(f.id));
    reverted += Shots.listFrames().length - left.length;
    Shots.saveFrames(left);
  }
  if (rm.has('block')) {
    const gone = ids('block');
    const all = Shots.listBlocks();
    const left = all.filter((b) => !gone.has(b.id));
    reverted += all.length - left.length;
    Shots.saveBlocks(left);
  }
  /* scenes: only fills (a flag the run raised) — a scene row is never removed from here */
  if (bl.has('scene')) {
    const fills = fillOf('scene');
    Scenes.saveScenes(Scenes.listScenes().map((s) => {
      const f = fills.get(s.id);
      if (!f) return s;
      reverted += 1;
      return blanked(s, f.fields, f.run);
    }));
  }
  /* the story: root fills, steps, marks */
  if (rm.has('step') || rm.has('mark') || bl.has('story') || bl.has('step')) {
    const story = Story.loadStory();
    const goneSteps = ids('step');
    const goneMarks = ids('mark');
    const storyFill = fillOf('story').get('story');
    const stepFills = fillOf('step');
    const before = story.outline.length + story.marks.length;
    story.outline = story.outline.filter((s) => !goneSteps.has(s.id)).map((s) => {
      const f = stepFills.get(s.id);
      if (!f) return s;
      reverted += 1;
      return blanked(s, f.fields, f.run);
    });
    story.marks = story.marks.filter((m) => !goneMarks.has(m.id));
    reverted += before - (story.outline.length + story.marks.length);
    if (storyFill) {
      const b = blanked(story, storyFill.fields, storyFill.run);
      for (const f of storyFill.fields) story[f] = b[f];
      if (b.aiFill) story.aiFill = b.aiFill; else delete story.aiFill;
      reverted += 1;
    }
    Story.saveStory(story);
  }
  /* sticky notes */
  if (rm.has('note')) {
    const gone = [...ids('note')];
    const had = Story.listVault().length;
    Story.removeManyFromVault(gone);
    reverted += had - Story.listVault().length;
  }
  /* characters */
  if (rm.has('character') || bl.has('character')) {
    const gone = ids('character');
    const fills = fillOf('character');
    const all = Chars.loadCharacters();
    const left = [];
    for (const c of all) {
      if (gone.has(c.id)) { reverted += 1; continue; }
      const f = fills.get(c.id);
      if (f) { left.push(blanked(c, f.fields, f.run)); reverted += 1; } else left.push(c);
    }
    Chars.saveCharacters(left);
  }
  /* documents (coverage, audience test) */
  if (rm.has('document')) {
    const gone = ids('document');
    const doc = Script.loadScript();
    const left = doc.documents.filter((d) => !gone.has(d.id));
    reverted += doc.documents.length - left.length;
    doc.documents = left;
    Script.saveScript(doc);
  }
  /* call sheets, recce cards, edit notes: fills */
  if (bl.has('callsheet')) {
    for (const [id, f] of fillOf('callsheet')) {
      const cur = Contacts.listCallSheets().find((s) => s.id === id);
      if (!cur) continue;
      const b = blanked(cur, f.fields, f.run);
      const patch = {};
      for (const k of f.fields) patch[k] = b[k];
      patch.aiFill = b.aiFill;
      Contacts.updateCallSheet(id, patch);
      reverted += 1;
    }
  }
  if (bl.has('recce')) {
    for (const [name, f] of fillOf('recce')) {
      const cur = Loc.getRecce(name);
      if (!cur || !Array.isArray(cur.aiFill)) continue;
      const b = blanked(cur, f.fields, f.run);
      const patch = {};
      for (const k of f.fields) patch[k] = b[k];
      patch.aiFill = b.aiFill;
      Loc.setRecce(name, patch);
      reverted += 1;
    }
  }
  if (bl.has('edit')) {
    for (const [sceneId, f] of fillOf('edit')) {
      const cur = Edit.sceneEdit(sceneId);
      const b = blanked(cur, f.fields, f.run);
      const patch = {};
      for (const k of f.fields) patch[k] = b[k];
      patch.aiFill = b.aiFill;
      Edit.setSceneEdit(sceneId, patch);
      reverted += 1;
    }
  }
  return { reverted, kept, notUndoable: plan.notUndoable };
}

/** Revert everything one run wrote (`run` is the group's run id). */
export function revertRun(run) {
  return revertEntries(readProjectAI().filter((e) => e.run === run));
}

export default { revertEntries, revertRun };
