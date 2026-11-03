/* ============================================================
   RULES — STORY LANE: the no-AI twins of three Desk tasks
   ------------------------------------------------------------
   docs/RULES-BREAKDOWN.md, Lane C (item 88). PURE: no document, no
   storage, no network, and nothing from ai.js, ai-tasks*.js or
   ai-stamp.js (scripts/test-rules-story.mjs greps for it). The pure
   helpers of ai-story-model.js (the word-keep gate) are the one
   shared piece, so a rules clean-up and an AI clean-up are held to
   the same bar: not one of the writer's words may change.

     cleanupSplit(facts)      script-cleanup-rules   a pasted lump cut into
                              lines by the script's own parser, and typed
     loglineCheck(text,opts)  logline-rules          a checklist of the
                              writer's own words, never a score
     voiceStats(els,who,opts) voice-check-rules      what is MEASURED about
                              a speaker's lines, flags only

   Everything here is deterministic: the same input is the same output,
   with sort keys spelled out. Word lists live in
   src/data/logline-checks.json, not here.
   ============================================================ */
import { parseScript } from './script-import.js';
import { readCleanup, CLEANUP_TYPES, CLEANUP_MAX_CHARS } from './ai-story-model.js';
import LC from '../data/logline-checks.json';

const collapse = (s) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const LETTER = '\\p{L}\\p{M}\\p{N}';

/* ============================================================
   C1. script-cleanup-rules
   ============================================================ */
/** A block the parser hands back as ONE action or dialogue element this
    long is a lump the rules cannot read: a cue, a line of dialogue and
    action inside it look alike. It is kept whole and named. */
export const LEFT_WHOLE_WORDS = 80;

/* "CUT TO:" at the end of a run of lines with no blank line before it
   was read as the last words of the dialogue above it. Blank lines are
   not words, so the keep-check cannot object. */
function openTransitions(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    const s = line.trim();
    const trans = s && !/[a-z]/.test(s) && /\bTO:$/.test(s) && s.split(/\s+/).length <= 6;
    if (trans && out.length && out[out.length - 1].trim()) out.push('');
    out.push(line);
    if (trans) out.push('');
  }
  return out.join('\n');
}

/**
 * The selection cut into screenplay lines by the script's own parser.
 *   facts  { block: [{id, type, text}] }   the selected or pasted lines, in order
 * @returns {{items:{id,text,detail,type,rawText,keepId?}[], changed:number,
 *            left:string[], rejected:string, tooLong:boolean}}
 *   - the same gate as the AI path: a result whose words differ from the
 *     selection is refused whole (`rejected`);
 *   - a line that comes back with the writer's own text keeps its element
 *     (`keepId`) and its type: notes, comments and the co-editing merge
 *     are keyed by element id;
 *   - `left` names the blocks the parser had to leave whole.
 */
export function cleanupSplit(facts) {
  const block = ((facts && facts.block) || []).filter((e) => e && String(e.text || '').trim());
  const text = block.map((e) => e.text).join('\n');
  const none = { items: [], changed: 0, left: [], rejected: '', tooLong: false };
  if (!text.trim()) return none;
  if (text.length > CLEANUP_MAX_CHARS) return { ...none, tooLong: true };

  const parsed = parseScript(openTransitions(block.map((e) => String(e.text).replace(/\r\n?/g, '\n')).join('\n\n')));
  const els = (parsed.elements || []).map((e) => ({ type: CLEANUP_TYPES.includes(e.type) ? e.type : 'action', text: String(e.text || '') }));
  if (parsed.fatal || !els.length) return { ...none, rejected: 'The rules found no screenplay lines in that text. Nothing was changed.' };

  const res = readCleanup({ elements: els }, { text });
  if (res.rejected) {
    return { ...none, rejected: 'The rules would have changed the wording, and this is formatting, not editing. Nothing was changed.' };
  }

  const pool = block.slice();
  const left = [];
  const items = res.items.map((it) => {
    const k = pool.findIndex((e) => e && collapse(e.text) === collapse(it.text));
    if (k >= 0) {
      const own = pool[k]; pool[k] = null;
      const type = CLEANUP_TYPES.includes(own.type) ? own.type : it.type;
      return { ...it, type, keepId: own.id, detail: 'Unchanged · ' + typeLabel(type) };
    }
    if ((it.type === 'action' || it.type === 'dialogue') && it.text.split(/\s+/).length >= LEFT_WHOLE_WORDS) {
      left.push(it.text);
      return { ...it, detail: typeLabel(it.type) + ' · left whole' };
    }
    return it;
  });
  return { items, changed: items.filter((x) => !x.keepId).length, left, rejected: '', tooLong: false };
}

const TYPE_WORD = { scene: 'Scene heading', action: 'Action', character: 'Character', dialogue: 'Dialogue', paren: 'Parenthetical', transition: 'Transition' };
const typeLabel = (t) => TYPE_WORD[t] || t;

/* ============================================================
   C2. logline-rules
   ============================================================ */
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = (list) => [...list].sort((a, b) => b.length - a.length || (a < b ? -1 : 1)).map(esc).join('|');
const reOf = (list, flags = 'iu') => new RegExp('(?<![' + LETTER + '])(?:' + alt(list) + ')(?![' + LETTER + '])', flags);
const RE = {
  role: reOf(LC.roles), goal: reOf(LC.goal), obstacle: reOf(LC.obstacle), stakes: reOf(LC.stakes), phrase: reOf(LC.phrases)
};
const wordCount = (s) => (String(s).match(new RegExp('[' + LETTER + "]+(?:['’-][" + LETTER + ']+)*', 'gu')) || []).length;

/** The matched words plus up to `more` following words of the SAME clause,
    copied from the text as written (never reworded). */
function span(text, m, more) {
  const tail = new RegExp('^(?:[ \\t]+[' + LETTER + "]+(?:['’-][" + LETTER + ']+)*){0,' + more + '}', 'u');
  const rest = text.slice(m.index + m[0].length);
  return m[0] + (rest.match(tail) || [''])[0];
}

const latinShare = (t) => {
  const letters = String(t).match(/\p{L}/gu) || [];
  if (!letters.length) return 1;
  return letters.filter((c) => /\p{Script=Latin}/u.test(c)).length / letters.length;
};

/** Proper names as written: runs of capitalised words that do not open a
    sentence. A run is one name ("Mara Singh"). */
function properNames(text, extra) {
  const ignore = new Set(LC.properNameIgnore.concat(extra || []).map((s) => s.toLowerCase()));
  const found = [];
  const re = new RegExp('\\p{Lu}[' + LETTER + "'’-]*(?:[ \\t]+\\p{Lu}[" + LETTER + "'’-]*)*", 'gu');
  let m;
  while ((m = re.exec(text))) {
    const before = text.slice(0, m.index).trimEnd();
    const opens = !before || /[.!?…“"‘(]$/.test(before);
    const words = m[0].split(/[ \t]+/);
    const keep = opens ? words.slice(1) : words;   // the first word of a sentence is capitalised for the sentence
    const name = keep.filter((w) => !ignore.has(w.toLowerCase())).join(' ');
    if (name) found.push(name);
  }
  return [...new Set(found)];
}

/**
 * A checklist of the writer's OWN words, in the shape of the AI workshop's
 * `res.check` rows plus `words`: { part, label, present, found, note, words }.
 *   present  the point holds (for "no question" and "no 'a story about'"
 *            that means none was found)
 *   found    the exact words of the logline that carry it, or '' (for a
 *            point that failed because of words, those words)
 *   words    how many words `found` is (the word count for "length")
 * `checked: false` on a row means the rule cannot read this script.
 * Irony and variants stay with the AI workshop.
 * @param {string} text
 * @param {{names?: string[]}} [opts]  character names, so a name counts as the protagonist
 */
export function loglineCheck(text, { names = [] } = {}) {
  const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  const rows = [];
  const row = (part, label, present, found, note, checked = true) =>
    rows.push({ part, label, present: !!present, found: found || '', note: note || '', words: found ? wordCount(found) : 0, checked });
  if (!t) return { check: [], words: 0, latin: true };
  const n = wordCount(t);
  const band = LC.bands.words;
  const latin = latinShare(t) >= 0.5;
  const NA = 'Not checked: these word lists are English, and this logline is not.';

  row('length', 'Length', n >= band.min && n <= band.max, '',
    plural(n, 'word', 'words') + (n < band.min ? ', short of the ' + band.min + ' to ' + band.max + ' a logline usually takes'
      : n > band.max ? ', over the ' + band.min + ' to ' + band.max + ' a logline usually takes' : ', inside the usual ' + band.min + ' to ' + band.max));
  rows[0].words = n;

  const sentences = t.split(/(?<=[.!?…])\s+(?=\S)/).filter(Boolean);
  row('sentence', 'One sentence', sentences.length <= LC.bands.sentences.max, sentences.length > 1 ? sentences[1] : '',
    sentences.length <= LC.bands.sentences.max ? 'One sentence.' : plural(sentences.length, 'sentence', 'sentences') + '; a logline is one.');

  /* the protagonist: a character's name, else a role noun */
  const nameRe = (names || []).map((x) => String(x || '').trim()).filter(Boolean);
  let who = null;
  if (nameRe.length) {
    const m = new RegExp('(?<![' + LETTER + '])(?:' + alt(nameRe) + ')(?![' + LETTER + '])', 'iu').exec(t);
    if (m) who = m[0];
  }
  if (!who && latin) { const m = RE.role.exec(t); if (m) who = m[0]; }
  if (latin || who) row('protagonist', 'Protagonist', !!who, who, who ? 'A name or a role to follow.' : 'No character name or role found.');
  else row('protagonist', 'Protagonist', false, '', NA, false);

  const hit = (part, label, re, more, yes, no) => {
    if (!latin) { row(part, label, false, '', NA, false); return; }
    const m = re.exec(t);
    if (m) row(part, label, true, span(t, m, more), yes);
    else row(part, label, false, '', no);
  };
  const more = LC.bands.spanWords;
  hit('goal', 'Goal', RE.goal, more, 'A want, a need or a task.', 'No “must”, “wants to” or “has to” found.');
  hit('obstacle', 'Obstacle', RE.obstacle, more, 'A word that turns the story against them.', 'No “but”, “until” or “forced to” found.');
  hit('stakes', 'Stakes', RE.stakes, 2, 'Something that can be lost or won.', 'No word for what is lost or won found.');

  if (latin) {
    const pn = properNames(t, nameRe);
    const max = LC.bands.names.max;
    row('names', 'Few proper names', pn.length <= max, pn.length > max ? pn.join(', ') : '',
      pn.length <= max ? plural(pn.length, 'proper name', 'proper names') + '.' : plural(pn.length, 'proper name', 'proper names') + '; more than ' + max + ' is hard to hold in one line.');
  } else row('names', 'Few proper names', false, '', NA, false);

  const ph = latin ? RE.phrase.exec(t) : null;
  if (latin) row('phrase', 'Shows the story, does not announce it', !ph, ph ? ph[0] : '', ph ? 'Start with the person and what happens instead.' : 'No “a story about”.');
  else row('phrase', 'Shows the story, does not announce it', false, '', NA, false);

  const q = t.search(/\?/);
  row('question', 'A statement, not a question', q < 0, q < 0 ? '' : sentences.find((s) => s.includes('?')) || '?',
    q < 0 ? 'No question mark.' : 'A logline answers; it does not ask.');
  return { check: rows, words: n, latin };
}

/** The checklist as the lines a note or the Desk's tick list shows. */
export function loglineLines(check) {
  return (check || []).map((c) => (c.checked === false ? '· ' : c.present ? '✓ ' : '— ') + c.label + ': '
    + (c.found ? '“' + c.found + '”' + (c.present ? '' : ' — ' + c.note) : c.note));
}

/* ============================================================
   C3. voice-check-rules
   ============================================================ */
export const VOICE_MIN_LINES = 6;

/** A cue as a speaker's name: no extension, no colon, upper case. */
export const speakerOf = (text) => String(text == null ? '' : text)
  .replace(/\([^)]*\)/g, ' ').replace(/\^\s*$/, '').replace(/:\s*$/, '').replace(/\s+/g, ' ').trim().toUpperCase();

const tokens = (s) => (String(s).toLowerCase().replace(/[‘’ʼ]/g, "'")
  .match(new RegExp('[' + LETTER + "]+(?:'[" + LETTER + ']+)?', 'gu')) || []);

/** Every speaker's lines in script order: {id, scene, text, words}. Only
    dialogue elements count (a parenthetical belongs to no line). */
export function speakerLines(elements) {
  const by = new Map();
  let who = '', scene = '';
  for (const e of elements || []) {
    if (!e) continue;
    if (e.type === 'scene') { scene = collapse(e.text); who = ''; continue; }
    if (e.type === 'character') { who = speakerOf(e.text); continue; }
    if (e.type === 'paren') continue;
    if (e.type !== 'dialogue') { who = ''; continue; }
    if (!who) continue;
    const text = collapse(e.text);
    if (!text) continue;
    if (!by.has(who)) by.set(who, []);
    by.get(who).push({ id: e.id, scene, text, words: tokens(text) });
  }
  return by;
}

const r1 = (x) => Math.round(x * 10) / 10;
const pct = (x) => Math.round(x * 100);
const sorted = (arr, f) => arr.slice().sort((a, b) => {
  for (const k of f) { const x = k(a), y = k(b); if (x < y) return -1; if (x > y) return 1; }
  return 0;
});

function statsOf(lines) {
  const n = lines.length;
  const lens = lines.map((l) => l.words.length);
  const mean = lens.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(lens.reduce((a, b) => a + (b - mean) * (b - mean), 0) / n);
  return {
    lines: n, mean, sd, max: Math.max(...lens),
    questions: lines.filter((l) => l.text.includes('?')).length / n,
    exclaims: lines.filter((l) => l.text.includes('!')).length / n
  };
}
const counts = (lines) => {
  const m = new Map();
  for (const l of lines) for (const w of l.words) m.set(w, (m.get(w) || 0) + 1);
  return m;
};

/**
 * What can be MEASURED about one speaker's dialogue, against the others'.
 * Flags only: every flag says what was measured and nothing about whether
 * the line is wrong; rewriting stays with the AI check.
 * @param {object[]} elements  the script's elements
 * @param {string}   character the speaker, any case, extension or colon
 * @param {{minLines?: number}} [opts]
 * @returns {{enough:boolean, character, lines:number, minLines:number, message:string,
 *   stats?:{lines,mean,max,questions,exclaims}, signature?:{word,count}[],
 *   overlap?:{name,percent}[], flags?:{id,elId,scene,line,kind,why}[]}}
 */
export function voiceStats(elements, character, { minLines = VOICE_MIN_LINES } = {}) {
  const who = speakerOf(character);
  const by = speakerLines(elements);
  const mine = by.get(who) || [];
  const out = { enough: false, character: who, lines: mine.length, minLines, message: '' };
  if (!who) { out.message = 'Pick a character first.'; return out; }
  if (mine.length < minLines) {
    out.message = who + ' has ' + (mine.length ? plural(mine.length, 'line', 'lines') : 'no lines') + ': too few lines to measure a voice (it takes ' + minLines + ').';
    return out;
  }
  out.enough = true;
  const me = statsOf(mine);
  out.stats = { lines: me.lines, mean: r1(me.mean), max: me.max, questions: pct(me.questions), exclaims: pct(me.exclaims) };

  const names = [...by.keys()].sort();
  const bag = new Map(names.map((n) => [n, counts(by.get(n))]));
  const df = new Map();
  for (const m of bag.values()) for (const w of m.keys()) df.set(w, (df.get(w) || 0) + 1);
  const N = names.length;
  const mineBag = bag.get(who);
  out.signature = sorted([...mineBag].filter(([w, c]) => w.length >= 3 && c >= 2)
    .map(([w, c]) => ({ word: w, count: c, weight: c * Math.log(1 + N / df.get(w)) })),
  [(x) => -x.weight, (x) => x.word]).slice(0, 8).map(({ word, count }) => ({ word, count }));

  const mineSet = new Set(mineBag.keys());
  out.overlap = sorted(names.filter((n) => n !== who && by.get(n).length >= 3).map((n) => {
    const o = new Set(bag.get(n).keys());
    let both = 0;
    for (const w of mineSet) if (o.has(w)) both += 1;
    return { name: n, percent: pct(both / (mineSet.size + o.size - both)) };
  }), [(x) => -x.percent, (x) => x.name]).slice(0, 3);

  /* flags */
  const flags = [];
  const otherBag = new Map();   // word -> speaker with the most of it
  for (const n of names) {
    if (n === who) continue;
    for (const [w, c] of bag.get(n)) {
      const cur = otherBag.get(w);
      if (!cur || c > cur.c || (c === cur.c && n < cur.n)) otherBag.set(w, { n, c });
    }
  }
  for (const l of mine) {
    const nw = l.words.length;
    if (me.sd > 0 && nw >= me.mean + 2 * me.sd && nw - me.mean >= 8) {
      flags.push({
        id: 'f' + flags.length, elId: l.id, scene: l.scene, line: l.text, kind: 'length',
        why: 'Measured: ' + plural(nw, 'word', 'words') + ', against ' + r1(me.mean) + ' on average for ' + who + ' (the most otherwise is '
          + Math.max(...mine.filter((x) => x !== l).map((x) => x.words.length)) + ').'
      });
      continue;
    }
    const own = new Map();
    for (const w of l.words) own.set(w, (own.get(w) || 0) + 1);
    const cand = [...new Set(l.words)].filter((w) => w.length >= 4);
    const foreign = cand.filter((w) => mineBag.get(w) - own.get(w) <= 0 && otherBag.has(w));
    if (cand.length >= 4 && foreign.length >= 3 && foreign.length / cand.length >= 0.5) {
      const tally = new Map();
      for (const w of foreign) { const s = otherBag.get(w).n; tally.set(s, (tally.get(s) || 0) + 1); }
      const top = sorted([...tally], [(x) => -x[1], (x) => x[0]])[0][0];
      flags.push({
        id: 'f' + flags.length, elId: l.id, scene: l.scene, line: l.text, kind: 'borrowed',
        why: 'Measured: ' + foreign.length + ' of its ' + cand.length + ' longer words (' + foreign.slice(0, 4).join(', ')
          + ') appear nowhere else in ' + who + '’s lines, and ' + top + ' uses ' + (tally.get(top) === 1 ? 'one' : 'them') + '.'
      });
    }
  }
  out.flags = flags;
  return out;
}

export default { LEFT_WHOLE_WORDS, VOICE_MIN_LINES, cleanupSplit, loglineCheck, loglineLines, speakerOf, speakerLines, voiceStats };
