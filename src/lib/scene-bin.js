/* ============================================================
   THE SCENE BIN — where a scene goes before it is gone
   ------------------------------------------------------------
   docs/BLUEPRINT-REALIGN-PLAN.md, revision 3, §1d. Owner's decision:
   a scene heading removed from the script takes its scene AND
   everything hung on it out of every page at once, into a bin, from
   which it can be restored; "Delete for good" and "Empty bin" delete
   permanently after a confirm that names the counts; nothing is ever
   purged on a timer.

   ONE CASCADE FOR EVERY PATH. The script's deletions
   (src/lib/scene-sync.js) and a scene deleted by hand on the
   Breakdown (removeScene() in src/lib/scenes.js) both come here, so
   neither orphans a shot again. What a scene owns, confirmed by a
   grep of `sceneId` across src/lib, src/pages and src/ui:

     ON THE ROW ITSELF (so they travel with the row, nothing to do):
       shootDay   the stripboard's day placement (stripboard.js)
       shotState  the shoot day's mark (shootday.js)
       songId     the song link (songs.js reads it; songs own no ids)
       beatId     the outline link (beat-board.js)
     IN OTHER MODELS (taken out here, put back on restore):
       shots      fms_shots_v1 .shots[].sceneId       (shots.js)
       frames     fms_shots_v1 .frames[].shotId → those shots
       blocks     fms_shots_v1 .blocks[].sceneId      (shots.js)
       call sheets fms_contacts_v1 .callSheets[].sceneIds (contacts.js)
       edit log   fms_edit_v1 .scenes[sceneId], .pickups[].sceneId
     READS ONLY (nothing stored, nothing to cascade):
       ai.js, readiness.js, screenplay-analysis.js, shotlist-export.js,
       pages/edit.js, pages/contacts.js, pages/visualize.js (through
       shots.js), pages/short.js (`sceneIdx`, a different thing).
     NOT CASCADED, ON PURPOSE:
       scriptgen.js's job keeps `scenes[].sceneId` as the key it hands
       the model for a batch. It is a cursor over a run already in
       flight, not a link the scene owns, and rewriting a job's list
       under it would make Resume skip or repeat scenes.
       Lookbook boards and their entries belong to no scene.
       hub.js writes sceneIds only when it seeds the sample.

   STORAGE CONTRACT. `fms_scene_bin_v1` is a new PER-PROJECT key, in
   SCOPED_KEYS (store.js), PROJECT_KEYS (backup.js) and ALL_KEYS
   (hub.js), and in cloud.js's LOCAL_ONLY beside fms_write_goals_v1,
   because the `project_data.scope` CHECK does not list it yet.

   RAW, AND RESTORED BYTE FOR BYTE. Every dependent is taken out as
   the stored object, with its position, and put back at that
   position — so bin-then-restore leaves each key's JSON exactly as it
   was. Entries are restored newest first when several go back at
   once, which is what makes the recorded positions line up.

   NOTHING HERE WRITES ON A READ, and nothing runs on a timer.
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import { rawScenes, writeRawScenes } from './scenes.js';
import * as Shots from './shots.js';
import * as Contacts from './contacts.js';
import * as Edit from './editlog.js';

export const BIN_KEY = 'fms_scene_bin_v1';

let seq = 0;
const uid = () => 'bin_' + Date.now().toString(36) + (seq++).toString(36)
  + Math.random().toString(36).slice(2, 6);

function readBin() {
  let raw = null;
  try { raw = localStorage.getItem(BIN_KEY); } catch (e) { /* private mode */ }
  if (!raw) return { entries: [] };
  try {
    const p = JSON.parse(raw);
    return { entries: Array.isArray(p && p.entries) ? p.entries.filter((e) => e && e.scene && e.scene.row) : [] };
  } catch (e) {
    return { entries: [] };
  }
}

function writeBin(data) {
  try {
    if (!data.entries.length) localStorage.removeItem(BIN_KEY);
    else localStorage.setItem(BIN_KEY, JSON.stringify(data));
    return true;
  } catch (e) { return false; }
}

/** Every entry, oldest first. */
export function listBin() {
  return readBin().entries;
}

/** What an entry holds, as numbers a confirm can name. */
export function entryCounts(entry) {
  const e = entry || {};
  const row = (e.scene && e.scene.row) || {};
  const cutNotes = ((e.edit && e.edit.notes) || []).length;
  return {
    ...(cutNotes ? { cutNotes } : {}),
    shots: (e.shots || []).length,
    frames: (e.frames || []).length,
    blocks: (e.blocks || []).length,
    sheets: (e.sheets || []).length,
    pickups: ((e.edit && e.edit.pickups) || []).length,
    edit: !!(e.edit && e.edit.scene),
    day: Number(row.shootDay) || 0
  };
}

/** "Scene 12: 6 shots, 4 frames, Day 3" — the words a confirm uses. */
export function describeEntry(entry) {
  const row = (entry && entry.scene && entry.scene.row) || {};
  const c = entryCounts(entry);
  const name = 'Scene ' + (row.number || '?');
  const bits = [];
  const n = (k, word) => { if (k) bits.push(k + ' ' + word + (k === 1 ? '' : 's')); };
  n(c.shots, 'shot');
  n(c.frames, 'frame');
  n(c.blocks, 'blocking diagram');
  if (c.day) bits.push('Day ' + c.day);
  n(c.sheets, 'call sheet');
  n(c.pickups, 'pick-up');
  n(c.cutNotes || 0, 'cut note');
  if (c.edit) bits.push('an edit note');
  return bits.length ? name + ': ' + bits.join(', ') : name;
}

/**
 * Take a scene and every dependent out of every model, into one bin
 * entry. Returns the entry, or null when no such scene exists.
 *   opts.reason   'script' (its heading left the script) or 'hand'
 *   opts.heading  the heading text it had, for restore-by-retyping
 */
/* WHERE A SCENE GOES BACK. A bare array index only holds when entries come
   back newest-first (the later bins shifted everything under it). Each entry
   also records `vindex`, its place in the list AS IF every scene still in the
   bin were in it; a restore rebuilds that list from the rows plus the bin and
   counts only the rows actually present before it, so any restore order lands
   a scene among its neighbours. */
function virtualIds(rows, entries) {
  const ids = rows.filter(Boolean).map((s) => s.id);
  for (const e of entries) {
    const id = e && e.scene && e.scene.row && e.scene.row.id;
    if (!id || ids.includes(id) || typeof e.scene.vindex !== 'number') continue;
    ids.splice(Math.min(e.scene.vindex, ids.length), 0, id);
  }
  return ids;
}

export function binScene(sceneId, opts = {}) {
  const rows = rawScenes();
  const index = rows.findIndex((s) => s && s.id === sceneId);
  if (index < 0) return null;
  const row = rows[index];
  const vindex = virtualIds(rows, readBin().entries).indexOf(sceneId);
  const shots = Shots.takeSceneOut(sceneId);
  const sheets = Contacts.takeSceneOut(sceneId);
  const edit = Edit.takeSceneOut(sceneId);
  const entry = {
    id: uid(),
    binnedAt: new Date().toISOString(),
    reason: opts.reason === 'script' ? 'script' : 'hand',
    heading: String(opts.heading || ''),
    scene: { index, row, vindex },
    shots: shots.shots,
    frames: shots.frames,
    blocks: shots.blocks,
    sheets,
    edit
  };
  /* KEEP BEFORE YOU DELETE. The bin entry used to be written LAST, after
     the row and every dependent had already left their models, and its
     write result was ignored — so a refused write (both tiers full, or
     the bin key a stub the overflow tier cannot read: the proxy's
     setItem answers false and never throws) deleted the scene, its
     shots, frames, sheet placements and edit notes with nothing left to
     restore from. The entry is written and READ BACK first; only then
     does the row leave the list. If the bin cannot hold it, everything
     the takes removed is put back and nothing is binned. */
  const bin = readBin();
  bin.entries.push(entry);
  const kept = writeBin(bin) && readBin().entries.some((e) => e.id === entry.id);
  if (!kept) {
    Shots.putSceneBack({ shots: entry.shots, frames: entry.frames, blocks: entry.blocks });
    Contacts.putSceneBack(sceneId, entry.sheets);
    Edit.putSceneBack(sceneId, entry.edit);
    return null;
  }
  rows.splice(index, 1);
  writeRawScenes(rows);
  return entry;
}

/**
 * Put an entry back: the row at its old position, and every dependent
 * where it was. `opts.patch` is merged onto the row on the way back
 * (the sync relinks a moved heading this way; the Breakdown clears
 * `scriptElId` when the heading is no longer in the script, so the
 * next sync does not bin it again). Returns the restored row, or null.
 */
export function restoreFromBin(entryId, opts = {}) {
  const bin = readBin();
  const at = bin.entries.findIndex((e) => e.id === entryId);
  if (at < 0) return null;
  const entry = bin.entries[at];
  const rows = rawScenes();
  const sceneId = entry.scene.row.id;
  if (!rows.some((s) => s && s.id === sceneId)) {
    const row = opts.patch ? { ...entry.scene.row, ...opts.patch, id: sceneId } : entry.scene.row;
    let at2 = Math.min(entry.scene.index, rows.length);
    if (typeof entry.scene.vindex === 'number') {
      const virt = virtualIds(rows, bin.entries);
      const present = new Set(rows.filter(Boolean).map((s) => s.id));
      const pos = virt.indexOf(sceneId);
      if (pos >= 0) at2 = virt.slice(0, pos).filter((id) => present.has(id)).length;
    }
    rows.splice(at2, 0, row);
    writeRawScenes(rows);
  }
  Shots.putSceneBack({ shots: entry.shots, frames: entry.frames, blocks: entry.blocks });
  Contacts.putSceneBack(sceneId, entry.sheets);
  Edit.putSceneBack(sceneId, entry.edit);
  bin.entries.splice(at, 1);
  writeBin(bin);
  return rawScenes().find((s) => s && s.id === sceneId) || null;
}

/** Restore several at once, newest first, so recorded positions hold. */
export function restoreMany(entryIds, optsFor) {
  const order = listBin().map((e) => e.id);
  const ids = [...new Set(entryIds || [])]
    .sort((a, b) => order.indexOf(b) - order.indexOf(a));
  return ids.map((id) => restoreFromBin(id, optsFor ? optsFor(id) : {})).filter(Boolean);
}

/** Delete one entry for good. Its dependents already left every model
    when it was binned, so dropping the entry is all that remains. */
export function deleteBinEntry(entryId) {
  const bin = readBin();
  const before = bin.entries.length;
  bin.entries = bin.entries.filter((e) => e.id !== entryId);
  if (bin.entries.length !== before) writeBin(bin);
  return before - bin.entries.length;
}

/** Delete every entry for good. */
export function emptyBin() {
  const n = readBin().entries.length;
  if (n) writeBin({ entries: [] });
  return n;
}

/**
 * Undo an add: take scenes created moments ago back out through the
 * bin, so anything hung on them in between (a shot, a call-sheet row,
 * a pick-up) is not orphaned. An entry that gathered nothing is not
 * kept — there is nothing in it to restore that the script does not
 * already hold. Returns how many scenes left the list.
 */
export function unaddScenes(ids) {
  let n = 0;
  for (const id of ids) {
    const e = binScene(id, { reason: 'hand' });
    if (!e) continue;
    n++;
    const c = entryCounts(e);
    if (!c.shots && !c.frames && !c.blocks && !c.sheets && !c.pickups && !c.edit && !c.cutNotes) deleteBinEntry(e.id);
  }
  return n;
}

/** Totals for a confirm over the whole bin. */
export function binTotals(entries) {
  return (entries || listBin()).reduce((t, e) => {
    const c = entryCounts(e);
    t.scenes++; t.shots += c.shots; t.frames += c.frames; t.sheets += c.sheets;
    return t;
  }, { scenes: 0, shots: 0, frames: 0, sheets: 0 });
}

export default {
  BIN_KEY, listBin, entryCounts, describeEntry, binScene, restoreFromBin,
  restoreMany, deleteBinEntry, emptyBin, binTotals, unaddScenes
};
