/* ============================================================
   NAME-AWARE SPELLING — the script's own names, as pure functions
   ------------------------------------------------------------
   WHAT A TEXTAREA CAN DO, MEASURED AGAINST CHROMIUM'S API RATHER THAN
   WISHED. The line is a <textarea>. The browser's spellchecker has two
   switches for it — the `spellcheck` attribute (the whole field, on or
   off) and `lang` (which dictionary) — and NO per-word ignore list: a
   textarea has no spans to wrap a known name in, a contenteditable
   would (and would cost the whole editor's model), and Chrome's custom
   dictionary is the user's own, never a page's. A lang hint does not
   help: a Tanglish name is wrong in every dictionary there is.

   So the editor does the two things the platform allows, and this file
   supplies the logic for both:

     1. Lines that are NAMES switch the checker OFF — a character cue, a
        scene heading (its place), a transition, a shot. Nothing on such
        a line is prose, and a red wave under every cue is the noise that
        teaches a writer to ignore the red waves that matter.
        `spellcheckFor(type)`.
     2. For the names inside prose (action, dialogue), where the checker
        stays on, the script itself is the dictionary: `nameSuspects()`
        reads the cues as the truth about spelling and lists words that
        are one or two letters from a cast name and used far less than
        it — "Preethy" beside twenty PREETHI cues. The writer reviews
        each (a Check names sheet, src/ui/name-check.js) and "Fix every
        instance" is the existing Find and replace (script-replace.js
        replaceAll, whole word), applied as ONE undo step.

   A suspect is a SUGGESTION: never applied by itself, and a name that
   really is two people (Rani and Ravi) is dismissed with Ignore. Only
   single-word names are compared: "MR. RAO" has no one-word spelling
   to be near.
   ============================================================ */
import { replaceAll } from './script-replace.js';

/** Types whose line is a name or an address, not prose. */
const NO_SPELL = new Set(['scene', 'character', 'transition', 'shot', 'act']);
export const spellcheckFor = (type) => !NO_SPELL.has(type);

/** A cue's speaker: extensions and the dual mark dropped, upper case. */
export function cueKey(text) {
  return String(text ?? '').replace(/\([^)]*\)/g, ' ').replace(/\^/g, ' ').replace(/\s+/g, ' ').trim().toUpperCase();
}

const LETTERS = /[\p{L}\p{M}'’\-]+/gu;
const oneWord = (s) => /^[\p{L}\p{M}'’\-]+$/u.test(s);

/** Each cast name (a cue, upper case) with how many cues carry it. */
export function castCounts(elements, extra = []) {
  const m = new Map();
  for (const el of elements || []) {
    if (!el || el.type !== 'character') continue;
    const n = cueKey(el.text);
    if (n) m.set(n, (m.get(n) || 0) + 1);
  }
  // Names the Characters page knows count once: they are the truth too.
  for (const n of extra || []) {
    const k = cueKey(n);
    if (k && !m.has(k)) m.set(k, 1);
  }
  return m;
}

/** The words of a scene heading that are its PLACE (not INT./EXT. or a
    time of day), as typed, for the "known words" list. */
export function placeWords(text) {
  const t = String(text ?? '').replace(/^\s*(?:int\.?\/ext\.?|i\/e\.?|int\.|ext\.|est\.)\s*/i, '');
  const place = t.split(/\s+-\s+/)[0];
  return (place.match(LETTERS) || []).filter((w) => w.length > 1);
}

/** Every spelling the script itself vouches for, lower case: its cast
    and its heading places. The Check names sheet lists them. */
export function knownWords(elements, extra = []) {
  const set = new Set();
  for (const n of castCounts(elements, extra).keys()) for (const w of n.match(LETTERS) || []) set.add(w.toLowerCase());
  for (const el of elements || []) if (el && el.type === 'scene') for (const w of placeWords(el.text)) set.add(w.toLowerCase());
  return set;
}

/** Edit distance, stopping early once it passes `max`. */
export function distance(a, b, max = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      cur.push(v);
      if (v < best) best = v;
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}

const titleCase = (s) => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();

/** Words that are probably a cast name misspelt:
    [{ wrong, right, count, ids }] — `wrong` as the script spells it (one
    spelling per entry, lower case), `right` the cast name in Title case,
    `count` its occurrences, `ids` the lines holding it. Most-used first.
    `ignore` is a Set of "wrong" words the writer dismissed. */
export function nameSuspects(elements, extra = [], ignore = new Set()) {
  const cast = castCounts(elements, extra);
  const right = [...cast.entries()].filter(([n, c]) => oneWord(n) && n.length >= 4 && c >= 2);
  if (!right.length) return [];
  const known = knownWords(elements, extra);
  // How often each candidate word occurs: as a cue, and as a capitalised word in prose.
  const seen = new Map();   // lower -> { count, ids:Set, upperAsCue }
  const bump = (w, id) => {
    const k = w.toLowerCase();
    const r = seen.get(k) || { count: 0, ids: new Set() };
    r.count++;
    r.ids.add(id);
    seen.set(k, r);
  };
  for (const el of elements || []) {
    if (!el) continue;
    if (el.type === 'character') {
      const n = cueKey(el.text);
      if (oneWord(n)) bump(n, el.id);
    } else if (el.type === 'action' || el.type === 'dialogue' || el.type === 'paren' || el.type === 'lyrics') {
      for (const w of String(el.text ?? '').match(LETTERS) || []) {
        // A proper-noun-shaped word: starts with a capital or is all capitals.
        if (w.length >= 4 && w[0] === w[0].toUpperCase() && w[0] !== w[0].toLowerCase()) bump(w, el.id);
      }
    }
  }
  const out = [];
  for (const [word, info] of seen) {
    if (ignore.has(word)) continue;
    // A word the script vouches for (another cast name, a place) is not a typo.
    const vouched = cast.has(word.toUpperCase()) && (cast.get(word.toUpperCase()) >= 2) || (known.has(word) && !cast.has(word.toUpperCase()));
    if (vouched) continue;
    let best = null;
    for (const [n, c] of right) {
      const lower = n.toLowerCase();
      if (lower === word || lower[0] !== word[0]) continue;
      const max = n.length >= 6 ? 2 : 1;
      const d = distance(word, lower, max);
      if (d > max) continue;
      if (info.count * 2 > c) continue;     // the "wrong" one must be rare next to the cast name
      if (!best || d < best.d || (d === best.d && c > best.c)) best = { n, c, d };
    }
    if (best) out.push({ wrong: word, right: titleCase(best.n), count: info.count, ids: [...info.ids] });
  }
  return out.sort((a, b) => b.count - a.count || a.wrong.localeCompare(b.wrong));
}

/** "Fix every instance": the changes that replace `wrong` with `right`
    as a whole word in every line, case kept as the replace does (a cue
    in capitals stays in capitals). { changes: [{ id, before, after }], count }.
    Nothing is modified; the editor applies it as one undo step. */
export function fixInstances(elements, wrong, right) {
  return replaceAll(elements, wrong, titleCase(String(right ?? '')), { wholeWord: true });
}

export default { spellcheckFor, cueKey, castCounts, placeWords, knownWords, distance, nameSuspects, fixInstances };
