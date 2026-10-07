/* ============================================================
   TANGLISH — romanised Tamil help for the Write page
   ------------------------------------------------------------
   Two pure functions over text, and nothing else. It stores nothing
   and reads nothing from storage: the word index is learned from the
   script handed in, at the moment it is asked for, the same way
   screenplay-analysis.js reads the script rather than keeping a copy.

   1. wordIndex(elements) / suggest(index, prefix)
      The words THIS script's characters actually say, ranked by how
      often they say them. A word that also turns up in the action
      lines and slugs is treated as English and left out: action is
      written in English on a Tamil unit's script (CLAUDE.md, open
      item 8), so "door" in a speech is not a Tanglish word worth
      offering, and "sollunga" is.

   2. toTamil(text)
      A compact, rule-based transliteration of romanised Tamil into
      Tamil script, for a PREVIEW ONLY. It is approximate by
      construction — romanised Tamil has no standard spelling, and
      "n" is ந, ன or ண depending on a word nobody wrote down. The
      conventions it follows are the common chat ones:
        th/dh = த   t/d = ட   N = ண   L = ள   R = ற   zh = ழ
        aa = ா      ee/ii = ீ  oo/uu = ூ  ae/E = ே  oa/O = ோ  ai = ை
      A capital at the start of a word is sentence case and is read as
      lower case; a capital anywhere else is a deliberate letter.

   THE PREVIEW IS NEVER WRITTEN INTO THE SCRIPT BY ITSELF. The page
   count is arithmetic on a fixed-width Courier grid (CLAUDE.md,
   `--f-script` and open item 8), so nothing here ever turns a line the
   writer typed in Roman letters into Tamil script behind their back.

   Two things the WRITER may choose, each a keystroke or a click and
   each limited to the speech:
     - Tamil typing (src/ui/tamil-type.js): an opt-in mode in which a
       romanised word typed into a dialogue or parenthetical line is
       offered in Tamil script and committed with Space or Return. That
       is the 'ta-dialogue' register of SCRIPT_LANGS in ai.js — Tamil
       dialogue under English slugs and action — which is the register
       whose page count stays exact, because the structural elements
       (headings, action, cues) stay on the Latin grid.
     - "Keep as Tamil take" (src/ui/alt-lines.js): the Tamil rendering
       stored as an ALTERNATE take of a dialogue line. The line in use
       stays exactly what the writer typed.
   Action, headings, cues and transitions are never offered Tamil.
   ============================================================ */

/* ---- 1. the word index ------------------------------------- */

const WORD = /[A-Za-z]+/g;
const MIN_LEN = 3;
const MIN_COUNT = 2;

/** A frequency index of the words spoken in `elements`.
 *  Returns { words: [{ word, count }] sorted by count, best: Map }
 *  where `best` maps every lower-case prefix (2+ letters) to the most
 *  frequent word that starts with it. Pure; O(total letters). */
export function wordIndex(elements) {
  const spoken = new Map();     // key -> { count, forms: Map(form -> n) }
  const elsewhere = new Map();  // key -> count, in action / slugs / cues
  for (const el of elements || []) {
    if (!el) continue;
    const text = String(el.text ?? '');
    if (!text) continue;
    const isSpeech = el.type === 'dialogue';
    const matches = text.match(WORD);
    if (!matches) continue;
    for (const w of matches) {
      if (w.length < MIN_LEN) continue;
      const key = w.toLowerCase();
      if (!isSpeech) { elsewhere.set(key, (elsewhere.get(key) || 0) + 1); continue; }
      let rec = spoken.get(key);
      if (!rec) { rec = { count: 0, forms: new Map() }; spoken.set(key, rec); }
      rec.count++;
      // Sentence case is not a spelling: "Naan" and "naan" are one form.
      const form = w[0].toLowerCase() + w.slice(1);
      rec.forms.set(form, (rec.forms.get(form) || 0) + 1);
    }
  }
  const words = [];
  for (const [key, rec] of spoken) {
    if (rec.count < MIN_COUNT) continue;
    if ((elsewhere.get(key) || 0) >= rec.count) continue;   // English, most likely
    let form = key, best = 0;
    for (const [f, n] of rec.forms) if (n > best) { best = n; form = f; }
    words.push({ word: form, count: rec.count });
  }
  words.sort((a, b) => b.count - a.count || a.word.localeCompare(b.word));
  const best = new Map();
  for (const { word } of words) {
    const key = word.toLowerCase();
    for (let n = 2; n < key.length; n++) {
      const p = key.slice(0, n);
      if (!best.has(p)) best.set(p, word);   // words are in rank order
    }
  }
  return { words, best };
}

/** The completion for a typed prefix, or ''. It must add at least two
 *  letters — offering "illa" for "ill" is a chip that costs more to
 *  read than the letter it saves. The case of the first letter follows
 *  what was typed, so a speech that opens "Kal…" gets "Kalyanam". */
export function suggest(index, prefix) {
  const p = String(prefix || '');
  if (!index || p.length < 2 || !/^[A-Za-z]+$/.test(p)) return '';
  const word = index.best.get(p.toLowerCase());
  if (!word || word.length < p.length + 2) return '';
  const first = p[0] === p[0].toUpperCase() ? word[0].toUpperCase() : word[0];
  return first + word.slice(1);
}

/** The partial word that ends at `caret` in `text`, if the caret is at
 *  the END of a word (the next character is not a letter). */
export function wordBefore(text, caret) {
  const t = String(text || '');
  const c = Math.max(0, Math.min(t.length, caret ?? t.length));
  if (c < t.length && /[A-Za-z]/.test(t[c])) return { start: c, word: '' };
  let s = c;
  while (s > 0 && /[A-Za-z]/.test(t[s - 1])) s--;
  return { start: s, word: t.slice(s, c) };
}

/* ---- 2. the transliterator --------------------------------- */

/* Vowels: [independent letter, sign after a consonant]. */
const V = {
  a: ['அ', ''], aa: ['ஆ', 'ா'], i: ['இ', 'ி'], ii: ['ஈ', 'ீ'],
  u: ['உ', 'ு'], uu: ['ஊ', 'ூ'], e: ['எ', 'ெ'], E: ['ஏ', 'ே'],
  ai: ['ஐ', 'ை'], o: ['ஒ', 'ொ'], O: ['ஓ', 'ோ'], au: ['ஔ', 'ௌ']
};
/* Spellings of each vowel, longest first. */
const VOWELS = [
  ['aa', 'aa'], ['ai', 'ai'], ['au', 'au'], ['ae', 'E'], ['ee', 'ii'], ['ii', 'ii'],
  ['oo', 'uu'], ['uu', 'uu'], ['oa', 'O'], ['ei', 'ai'],
  ['A', 'aa'], ['I', 'ii'], ['U', 'uu'], ['E', 'E'], ['O', 'O'],
  ['a', 'a'], ['i', 'i'], ['u', 'u'], ['e', 'e'], ['o', 'o']
];
const PULLI = '்';

/* Consonant spellings, longest first. A value is the run of base
   consonants the spelling stands for; the vowel that follows lands on
   the last of them and every other one takes a pulli. `n` is resolved
   by position below, so it is not in this table. */
const CONS = [
  ['ksh', ['க', 'ஷ']],
  ['ndr', ['ன', 'ற']], ['nth', ['ந', 'த']], ['ndh', ['ந', 'த']],
  ['zh', ['ழ']], ['ng', ['ங', 'க']], ['nj', ['ஞ', 'ச']], ['ny', ['ஞ']],
  ['nd', ['ண', 'ட']], ['nt', ['ண', 'ட']], ['nn', ['ன', 'ன']], ['nr', ['ன', 'ற']],
  ['ch', ['ச']], ['sh', ['ஷ']], ['th', ['த']], ['dh', ['த']],
  ['kh', ['க']], ['gh', ['க']], ['bh', ['ப']], ['ph', ['ஃப']], ['tr', ['ற', 'ற']],
  ['k', ['க']], ['g', ['க']], ['c', ['ச']], ['s', ['ச']], ['S', ['ஸ']],
  ['j', ['ஜ']], ['t', ['ட']], ['T', ['ட']], ['d', ['ட']], ['D', ['ட']],
  ['N', ['ண']], ['p', ['ப']], ['b', ['ப']], ['f', ['ஃப']], ['m', ['ம']],
  ['y', ['ய']], ['r', ['ர']], ['R', ['ற']], ['l', ['ல']], ['L', ['ள']],
  ['v', ['வ']], ['w', ['வ']], ['h', ['ஹ']], ['z', ['ழ']], ['x', ['க', 'ஸ']], ['q', ['க']]
];

function at(word, i, list) {
  for (const [spell, val] of list) {
    if (word.startsWith(spell, i)) return [spell, val];
  }
  return null;
}

/** One romanised word (letters only) to Tamil script. */
export function wordToTamil(raw) {
  if (!raw) return '';
  // Sentence case: a capital first letter is not a deliberate one.
  const word = raw[0].toLowerCase() + raw.slice(1);
  let out = '';
  let i = 0;
  while (i < word.length) {
    const initial = i === 0;
    let cons = null;
    let len = 0;
    if (word[i] === 'n' && !word.startsWith('ndr', i) && !word.startsWith('nth', i)
        && !word.startsWith('ndh', i) && !/^n[gjydtnr]/.test(word.slice(i, i + 2))) {
      // A bare n: ந at the start of a word, ன inside it.
      cons = [initial ? 'ந' : 'ன'];
      len = 1;
    } else {
      const c = at(word, i, CONS);
      if (c) {
        cons = c[1].slice();
        len = c[0].length;
        if (c[0] === 'tr' && initial) cons = ['ட', 'ர'];   // a loan word: "train"
        if (c[0] === 'nn' && initial) cons = ['ந', 'ன'];
      }
    }
    if (cons) {
      i += len;
      const v = at(word, i, VOWELS);
      // "ng" with nothing after it is the nasal alone: "thong", not "thongk".
      if (!v && cons.length === 2 && cons[0] === 'ங' && i >= word.length) cons = ['ங'];
      const body = cons.map((c, k) => (k < cons.length - 1 ? c + PULLI : c)).join('');
      if (v) { out += body + V[v[1]][1]; i += v[0].length; }
      else out += body + PULLI;
      continue;
    }
    const v = at(word, i, VOWELS);
    if (v) { out += V[v[1]][0]; i += v[0].length; continue; }
    out += word[i];   // unreachable for letters, kept for safety
    i++;
  }
  return out;
}

/** Tamil-script candidates for one romanised word, best first, at most
 *  `max`, no duplicates. The first is wordToTamil's reading. The rest
 *  are the readings the chat convention leaves open — a lower-case
 *  n, l or r that the writer may have meant as ண, ள or ற — made by
 *  reading ONE of them as its capital. Pure and small: a word is a
 *  handful of letters, so this is a few dozen wordToTamil calls at
 *  most, cheap enough for every keystroke. */
export function tamilCandidates(raw, max = 4) {
  const w = String(raw || '');
  if (!/^[A-Za-z]+$/.test(w)) return [];
  const out = [wordToTamil(w)];
  const flips = { n: 'N', l: 'L', r: 'R' };
  // Not the first letter: a capital there is read as sentence case.
  for (let i = 1; i < w.length && out.length < max; i++) {
    const to = flips[w[i]];
    if (!to) continue;
    const t = wordToTamil(w.slice(0, i) + to + w.slice(i + 1));
    if (!out.includes(t)) out.push(t);
  }
  return out;
}

/** Any text: every run of Latin letters is transliterated, everything
 *  else (spaces, punctuation, digits, hyphens) passes through. */
export function toTamil(text) {
  return String(text ?? '').replace(WORD, (w) => wordToTamil(w));
}

/** True when `text` has a Latin letter a Tamil rendering would change. */
export const hasLatin = (text) => /[A-Za-z]/.test(String(text ?? ''));

export default { wordIndex, suggest, wordBefore, wordToTamil, toTamil, tamilCandidates, hasLatin };
