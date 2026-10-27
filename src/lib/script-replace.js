/* FIND AND REPLACE in the screenplay — the model half. Pure: elements
   in, matches or changes out. Nothing here touches storage or the DOM;
   the page applies a change (src/ui/script-replace-bar.js).

   Only an element's `text` is searched or rewritten, never its type: a
   type changes through setElementType and nowhere else, and an id is
   never touched, so notes, alternate takes and scene links keyed by it
   survive a replace.

   Two choices worth knowing:
   - A whole word is bounded by anything that is not a letter, digit or
     underscore in ANY script (\p{L}\p{N}), because \b is ASCII-only and
     would treat every Tamil letter as a boundary.
   - Without Match case, a match written in capitals is replaced in
     capitals: renaming "Ravi" to "Arun" must also turn the cue RAVI into
     ARUN, not "Arun", or every cue of the character breaks. A match
     that only STARTS with a capital gives the replacement a capital first
     letter ("Kitchen?" -> "Hall?"), the way a word processor does. */

/** A string as a literal inside a RegExp. Shared by the other text matchers
   (cbfc, breakdown-paper, screenplay-analysis); this module imports nothing. */
export const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The search as a RegExp, or null when there is nothing to search. */
export function searchRegExp(query, opts = {}) {
  const q = String(query || '');
  if (!q) return null;
  let src = escapeRe(q);
  if (opts.wholeWord) src = '(?<![\\p{L}\\p{N}_])' + src + '(?![\\p{L}\\p{N}_])';
  return new RegExp(src, 'gu' + (opts.matchCase ? '' : 'i'));
}

/** Every match, in script order: [{ id, index, start, end }]. */
export function findMatches(elements, query, opts = {}) {
  const re = searchRegExp(query, opts);
  const out = [];
  if (!re) return out;
  (elements || []).forEach((el, index) => {
    const text = String((el && el.text) || '');
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      if (!m[0].length) { re.lastIndex++; continue; }
      out.push({ id: el.id, index, start: m.index, end: m.index + m[0].length });
    }
  });
  return out;
}

const isCaps = (s) => /\p{L}/u.test(s) && s === s.toUpperCase() && s !== s.toLowerCase();

/** The replacement for one matched string. */
export function replacementFor(matched, replacement, opts = {}) {
  const r = String(replacement == null ? '' : replacement);
  if (opts.matchCase) return r;
  if (isCaps(matched)) return r.toUpperCase();
  // A match that opens with a capital ("Kitchen?" at the start of a line)
  // keeps it, so a sentence does not start in lower case after a replace.
  const first = String(matched).charAt(0);
  if (first && first !== first.toLowerCase()) return r.charAt(0).toUpperCase() + r.slice(1);
  return r;
}

/** Replace every match. Returns { changes: [{ id, before, after }], count }.
    `elements` is not modified. */
export function replaceAll(elements, query, replacement, opts = {}) {
  const re = searchRegExp(query, opts);
  const changes = [];
  let count = 0;
  if (!re) return { changes, count };
  for (const el of elements || []) {
    const before = String((el && el.text) || '');
    const after = before.replace(re, (m) => { count++; return replacementFor(m, replacement, opts); });
    if (after !== before) changes.push({ id: el.id, before, after });
  }
  return { changes, count };
}

/** Replace the one match `hit` ({ id, start, end } from findMatches).
    Returns { id, before, after } or null when the text no longer holds
    the match there (it was edited since the search). */
export function replaceOne(elements, hit, query, replacement, opts = {}) {
  const el = (elements || []).find((e) => e && e.id === hit.id);
  if (!el) return null;
  const before = String(el.text || '');
  const re = searchRegExp(query, opts);
  if (!re) return null;
  re.lastIndex = hit.start;
  const m = re.exec(before);
  if (!m || m.index !== hit.start || m.index + m[0].length !== hit.end) return null;
  const after = before.slice(0, hit.start) + replacementFor(m[0], replacement, opts) + before.slice(hit.end);
  return { id: el.id, before, after };
}

export default { searchRegExp, findMatches, replaceAll, replaceOne, replacementFor };
