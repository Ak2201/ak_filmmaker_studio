/* ============================================================
   THE PAPER BREAKDOWN — the model behind breakdown.html#breakdown
   ------------------------------------------------------------
   The way a 1st AD has always broken a script down: the scene on a
   page, every element underlined in its category's colour, and a
   breakdown sheet beside it. This module is the half with no screen:
   which script slice belongs to which scene row, where the tagged
   names fall in the text, and what the sheet's boxes say.

   DERIVED ONLY. A highlight is not stored anywhere — it is found by
   matching the scene's own tags against its own text on every render,
   so a tag added on the Scene List or by Auto-Tag lights up here with
   nothing to keep in step, and untagging clears it. The one write the
   page makes is the tag itself, through scenes.js.

   Pure: no document, no storage (test:layers).
   ============================================================ */
import { ELEMENT_CATEGORIES, formatEighths } from './scenes.js';
import { pairScenes, suggestElements, cueName } from './screenplay-analysis.js';
import { escapeRe as escRe } from './script-replace.js';

/* The order the boxes sit on an industry breakdown sheet: the people
   first (cast, stunts, background), then what the art and effects
   departments supply, then sound, equipment and the rest. A different
   order from ELEMENT_CATEGORIES on purpose — that one is the order
   the index lists, this one is the paper form's. */
export const SHEET_ORDER = ['cast', 'stunts', 'extras', 'sfx', 'props', 'vehicles', 'animals',
  'wardrobe', 'makeup', 'sound', 'setdressing', 'vfx', 'special'];

const CAT = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));
export const sheetCategories = () => SHEET_ORDER.map((id) => CAT[id]).filter(Boolean);
export const categoryOf = (id) => CAT[id] || null;

/** Scene rows paired with their script slices, in scene order. */
export function paperScenes(scenes, elements) {
  const pairs = pairScenes(scenes || [], elements || []);
  return pairs.map((p, i) => ({ ...p, index: i }));
}

/* A tagged name as it is likely to appear in the text: "Candidates (60)"
   is written as candidates, "Ragavan's father" may be cued RAGAVAN'S
   FATHER. Case is folded at match time. */
const strip = (name) => String(name || '').replace(/\s*\(\s*\d+\s*\)\s*$/, '').trim();

/** What to look for in this scene's text: its tags, and (optionally)
 *  the script's suggestions that are not tagged yet. Longest first, so
 *  "police jeep" wins over "jeep". */
export function needlesFor(scene, slice, opts = {}) {
  const out = [];
  const seen = new Set();
  const push = (cat, name, kind) => {
    const n = strip(name);
    if (n.length < 2) return;
    const k = n.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ needle: n, key: k, cat, name, kind });
  };
  const els = (scene && scene.elements) || {};
  for (const c of ELEMENT_CATEGORIES) for (const name of els[c.id] || []) push(c.id, name, 'tag');
  if (opts.suggest && slice) {
    const sug = suggestElements(scene, slice);
    for (const [cat, list] of Object.entries(sug)) for (const s of list) push(cat, s.name, 'sug');
  }
  return out.sort((a, b) => b.needle.length - a.needle.length);
}

/** One line of script text cut into plain runs and marked runs.
 *  A match must stand on word edges (letters and digits in any
 *  script), so "Anbu" does not light up inside "Anbumani". */
export function markText(text, needles) {
  const t = String(text || '');
  if (!t || !needles || !needles.length) return [{ text: t }];
  const re = new RegExp('(?<![\\p{L}\\p{N}])(' + needles.map((n) => escRe(n.needle)).join('|') + ')(?![\\p{L}\\p{N}])', 'giu');
  const byKey = new Map(needles.map((n) => [n.key, n]));
  const out = [];
  let at = 0;
  let m;
  while ((m = re.exec(t))) {
    if (m.index > at) out.push({ text: t.slice(at, m.index) });
    const n = byKey.get(m[1].toLowerCase());
    out.push(n ? { text: m[1], cat: n.cat, name: n.name, kind: n.kind } : { text: m[1] });
    at = m.index + m[1].length;
    if (!m[1].length) re.lastIndex++;
  }
  if (at < t.length) out.push({ text: t.slice(at) });
  return out;
}

/** A character cue is a cast member by definition: which tag (or
 *  suggestion) it is, compared on the cue form. Null when neither. */
export function cueTag(scene, text, needles) {
  const cue = cueName(text);
  if (!cue) return null;
  for (const n of needles || []) {
    if (n.cat === 'cast' && cueName(n.needle) === cue) return n;
  }
  return null;
}

/** A selection turned into an element name: whitespace folded, the
 *  punctuation a drag picks up at either end dropped, capped. Empty
 *  when nothing usable is left. */
export function cleanSelection(s) {
  return String(s || '')
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N})]+$/gu, '')
    .trim()
    .slice(0, 80);
}

/** The category a selection most likely belongs to, to pre-select in
 *  the tag menu: a cue or a name typed in capitals is cast; otherwise
 *  the last category used (the AD tagging every prop in a scene). */
export function guessCategory(text, elementType, last) {
  if (elementType === 'character') return 'cast';
  const t = String(text || '').trim();
  if (t.length > 1 && /\p{L}/u.test(t) && t === t.toUpperCase()) return 'cast';
  return CAT[last] ? last : 'props';
}

/** Which category already holds this name on the scene, if any. */
export function taggedAs(scene, name) {
  const k = strip(name).toLowerCase();
  for (const c of ELEMENT_CATEGORIES) {
    if (((scene && scene.elements && scene.elements[c.id]) || []).some((n) => strip(n).toLowerCase() === k)) return c.id;
  }
  return '';
}

/** Everything the breakdown sheet prints for one scene. */
export function sheetData(scene, slice, index, total) {
  const els = (scene && scene.elements) || {};
  return {
    sheet: (index + 1) + ' of ' + total,
    number: String(scene.number || index + 1),
    intExt: scene.intExt || '',
    dayNight: scene.dayNight || '',
    location: scene.location || '',
    pages: formatEighths(scene.eighths),
    page: String(scene.pageNumber || ''),
    synopsis: scene.synopsis || '',
    heading: slice ? slice.heading : headingOf(scene),
    boxes: sheetCategories().map((c) => ({ ...c, names: (els[c.id] || []).slice() })),
    tagged: ELEMENT_CATEGORIES.reduce((n, c) => n + (els[c.id] || []).length, 0)
  };
}

/** A scene heading as it is printed on the page, from a row with no
 *  script behind it. */
export function headingOf(scene) {
  const ie = scene.intExt ? scene.intExt + '.' : '';
  return [ie, (scene.location || 'UNTITLED').toUpperCase(), scene.dayNight ? '- ' + scene.dayNight : ''].filter(Boolean).join(' ');
}

export default { SHEET_ORDER, sheetCategories, categoryOf, paperScenes, needlesFor, markText, cueTag, cleanSelection, guessCategory, taggedAs, sheetData, headingOf };
