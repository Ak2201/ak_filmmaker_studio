/* ============================================================
   BREAKDOWN — the page's logic, without the page
   ------------------------------------------------------------
   Everything src/pages/breakdown.js used to work out for itself that
   does not need the DOM: the header's figures, duplicate and locked
   scene numbers, where a scene stands, the scene list's search and
   filter rules, the Auto-Tag tags a press would write, the bin's
   counts, the whole-script run's sentence, and how a typed field
   value is read. Pure where it can be; where it reads the script or
   the scene model it says so in its name and calls the same lib
   functions the page did. Nothing here touches `document`
   (docs/ARCHITECTURE.md, rule L2) or imports the view (L1).
   ============================================================ */
import { ELEMENT_CATEGORIES } from './scenes.js';
import Scenes from './scenes.js';
import { shootDayOf } from './locations.js';
import { loadScript, isNumberingLocked, sceneNumbers } from './script.js';
import { suggestAll, isConfident, SUGGEST_CATEGORIES } from './screenplay-analysis.js';

/* ---- the header's figures ------------------------------------
   Counted from the scene model on render. `idx` is
   Scenes.elementIndex(), `songCount` the number of songs. */
export function breakdownFigures(scenes, idx, songCount) {
  return {
    scenes: scenes.length,
    elements: idx.length,
    cats: new Set(idx.map((e) => e.category)).size,
    locs: new Set(scenes.map((s) => String(s.location || '').trim().toLowerCase()).filter(Boolean)).size,
    ints: scenes.filter((s) => s.intExt === 'INT').length,
    exts: scenes.filter((s) => s.intExt === 'EXT').length,
    songs: songCount,
    cast: idx.filter((e) => e.category === 'cast').length
  };
}

/* ---- scene numbers -------------------------------------------- */
/** Whether Write has locked the scene numbers, and which are OMITTED. */
export function readNumberLock() {
  try {
    const s = loadScript();
    if (!isNumberingLocked(s.numbering)) return { locked: false, omitted: [] };
    return { locked: true, omitted: sceneNumbers(s.elements, s.numbering).omitted.map((o) => o.number) };
  } catch (e) { return { locked: false, omitted: [] }; }
}
export const numberKey = (n) => String(n || '').trim().toUpperCase();
/** The numbers more than one scene carries, upper-cased. */
export function dupNumbers(scenes) {
  const seen = new Set(), dup = new Set();
  for (const s of scenes) {
    const k = numberKey(s.number);
    if (!k) continue;
    if (seen.has(k)) dup.add(k); else seen.add(k);
  }
  return dup;
}

/* Eight shoot-day colours, from the phase and category hues in tokens.css
   (scene-list.css maps slot -> token). Day N uses slot ((N - 1) mod 8) + 1. */
export const daySlot = (day) => ((day - 1) % 8) + 1;

/** Where a scene stands, from the fields it already has. Nothing stored. */
export function sceneStatus(scene) {
  if (scene.shotState === 'shot')    return { id: 'shot', label: 'Shot' };
  if (scene.shotState === 'part')    return { id: 'part', label: 'Part shot' };
  if (scene.shotState === 'dropped') return { id: 'dropped', label: 'Dropped' };
  const day = shootDayOf(scene);
  if (day) return { id: 'scheduled', label: 'Day ' + day };
  const tags = ELEMENT_CATEGORIES.reduce((n, c) => n + (scene.elements[c.id] || []).length, 0);
  if (tags) return { id: 'tagged', label: 'Tagged' };
  return { id: 'untagged', label: 'Untagged' };
}
/* Where a scene stands, as a kit badge tone. Derived, nothing stored. */
export const STATUS_TONE = { shot: 'ok', part: 'warn', dropped: 'danger', scheduled: 'info', tagged: 'info', untagged: null };

export function castSummary(scene) {
  const names = scene.elements.cast || [];
  if (!names.length) return '';
  return names.slice(0, 2).join(', ') + (names.length > 2 ? ' +' + (names.length - 2) : '');
}
/** Everything a scene row can be found by, lower-cased, in one string. */
export const searchText = (scene) => [scene.number, scene.location, scene.synopsis, scene.intExt, scene.dayNight]
  .concat(...ELEMENT_CATEGORIES.map((c) => scene.elements[c.id] || [])).join(' ').toLowerCase();

/* ---- search, filters and saved filters ------------------------
   `f` is the filter: { q, ie, dn, st }. */
export const PRESET_KEYS = ['q', 'ie', 'dn', 'st'];
export const STATUS_LABELS = { untagged: 'Untagged', tagged: 'Tagged', scheduled: 'Scheduled', shot: 'Shot', part: 'Part shot', dropped: 'Dropped' };
export const filterActive = (f) => !!(f.q.trim() || f.ie || f.dn || f.st);
export function describeFilter(f) {
  const bits = [];
  if (f.ie) bits.push(f.ie);
  if (f.dn) bits.push(f.dn.toLowerCase());
  if (f.st) bits.push((STATUS_LABELS[f.st] || f.st).toLowerCase());
  if (f.q && f.q.trim()) bits.push('“' + f.q.trim() + '”');
  return bits.join(' · ') || 'every scene';
}
/** Does the saved filter `p` say exactly what the filter `f` says now? */
export const presetMatches = (p, f) => PRESET_KEYS.every((k) => String(p[k] || '').trim().toLowerCase() === String(f[k] || '').trim().toLowerCase());
/** Does one row pass the filter? `row` is { find, ie, dn, st } — the
 *  row's search text, INT/EXT, time and status id. */
export function rowMatches(f, row) {
  const q = f.q.trim().toLowerCase();
  return (!q || row.find.includes(q)) && (!f.ie || row.ie === f.ie)
    && (!f.dn || row.dn === f.dn) && (!f.st || row.st === f.st);
}
/** The scene list's count line. */
export const filterCountText = (shown, total) =>
  (shown === total ? total + (total === 1 ? ' scene' : ' scenes') : shown + ' of ' + total + ' scenes');

/* ---- Auto-Tag ---------------------------------------------------
   ADD ALL takes only the five categories whose lists are tight. The
   looser ones (furniture, clothing, crowds) are one chip at a time. */
export const BULK_CATS = ['cast', 'props', 'vehicles', 'stunts', 'sound'];
/** The tags a suggestion press would write. `sceneIds` null means ADD
 *  ALL, which acts ONLY on scenes matched to a heading by content. */
export function suggestionTags(scenes, elements, sceneIds) {
  const rows = suggestAll(scenes, elements)
    .filter((r) => (sceneIds ? sceneIds.includes(r.scene.id) : isConfident(r.how)));
  const cats = sceneIds ? SUGGEST_CATEGORIES : BULK_CATS;
  const tags = [];
  for (const r of rows) for (const cat of cats) for (const sug of r.suggestions[cat]) {
    tags.push({ sceneId: r.scene.id, category: cat, name: sug.name });
  }
  return tags;
}
/** Write the suggestions through the one tag writer; returns exactly the
 *  tags written, so an Undo removes those and nothing else. */
export function applySuggestions(sceneIds) {
  return Scenes.tagMany(suggestionTags(Scenes.listScenes(), loadScript().elements, sceneIds));
}

/* ---- the bin ---------------------------------------------------- */
/** What one bin entry holds, as the words its row prints. `c` is
 *  Bin.entryCounts(entry). */
export function binEntryBits(c) {
  const bits = [];
  if (c.shots) bits.push(`${c.shots} shot${c.shots === 1 ? '' : 's'}`);
  if (c.frames) bits.push(`${c.frames} frame${c.frames === 1 ? '' : 's'}`);
  if (c.blocks) bits.push(`${c.blocks} blocking diagram${c.blocks === 1 ? '' : 's'}`);
  if (c.cutNotes) bits.push(`${c.cutNotes} cut note${c.cutNotes === 1 ? '' : 's'}`);
  if (c.day) bits.push(`Day ${c.day}`);
  if (c.sheets) bits.push(`${c.sheets} call sheet${c.sheets === 1 ? '' : 's'}`);
  if (!bits.length) bits.push('nothing attached');
  return bits;
}
/** What "Empty bin" will delete, in words. `t` is Bin.binTotals(). */
export function binTotalsBits(t) {
  const bits = [`${t.scenes} scene${t.scenes === 1 ? '' : 's'}`];
  if (t.shots) bits.push(`${t.shots} shot${t.shots === 1 ? '' : 's'}`);
  if (t.frames) bits.push(`${t.frames} frame${t.frames === 1 ? '' : 's'}`);
  if (t.sheets) bits.push(`${t.sheets} call-sheet place${t.sheets === 1 ? '' : 's'}`);
  return bits;
}
/* headingInScript() lives in script.js now: the Story page's "Send
   again" restores a binned scene by the same rule. */
export { headingInScript } from './script.js';

/* ---- typed values --------------------------------------------- */
/** A scene field's value as stored, from what the control holds. */
/** The most a typed length can be: the box's own max (ten pages). */
export const EIGHTHS_MAX = 80;
export const sceneFieldValue = (key, raw) => key === 'eighths'
  ? Math.min(EIGHTHS_MAX, Math.max(0, parseInt(raw, 10) || 0))
  : key === 'number' ? raw.trim() : raw;
/** A song field's value as stored, from what the control holds. */
export function songFieldValue(key, raw) {
  if (key === 'days') return Math.max(0, parseFloat(raw) || 0);
  if (key === 'dancers') return Math.max(0, parseInt(raw, 10) || 0);
  return raw;
}

/* ---- the whole-script breakdown ------------------------------ */
/** The sentence a run of the breakdown reports. */
export function runSaid(res) {
  const a = res.applied, t = res.totals;
  return a.empty
    ? 'The script has no scene headings yet, so there was nothing to break down.'
    : 'Broke down ' + t.scenes + (t.scenes === 1 ? ' scene' : ' scenes') + ', '
      + res.characters.length + (res.characters.length === 1 ? ' character' : ' characters') + ' and '
      + t.locations + (t.locations === 1 ? ' location' : ' locations') + '.'
      + (a.castTagged ? ' Tagged ' + a.castTagged + ' cast from the dialogue cues.' : '');
}
