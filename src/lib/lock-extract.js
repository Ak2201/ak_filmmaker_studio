/* ============================================================
   LOCK EXTRACT — what a locked script says, read by rules
   ------------------------------------------------------------
   Phase 2 of the lock (docs/LOCK-EXTRACT.md). Pure reads over the
   script's pages and the scene rows, plus the two writers that go
   through the models that own the data (Scenes.tagMany, and the
   scene's own `synopsis` field).

     synopsis   the first action line's first sentence, only where the
                row's synopsis is blank
     extras     crowd words in action lines, with the count when stated
                ("STUDENTS (40)", "180 students", "a crowd of fifty")
     tags       Auto-Tag's suggestions of the ticked categories, minus
                cast (the scenes step tags cast) and extras (above)

   RULES. Only a CONFIDENT scene/heading pair is read (isConfident):
   a position-only guess never writes. A write fills a blank or adds a
   tag; it never edits what a person typed. "Has one already" is read
   from storage, never from a marker, so a re-run plans nothing.

   LOGIC ONLY (test:layers): no document, no view import.
   ============================================================ */
import lexicon from '../data/element-lexicon.json';
import { firstAction } from './breakdown-extras.js';
import { listScenes, saveScenes } from './scenes.js';
import { matchScenes, isConfident, suggestAll, titleCase } from './screenplay-analysis.js';

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/* ---- synopsis -------------------------------------------------- */

/** The text up to the first . ! or ? followed by a space or the end;
 *  over `max`, cut at the last word boundary and end on an ellipsis. */
export function firstSentence(text, max = 140) {
  const t = clean(text);
  if (!t) return '';
  const m = t.match(/^.*?[.!?](?=\s|$)/);
  const s = m ? m[0] : t;
  if (s.length <= max) return s;
  const cut = s.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  const base = (sp > 0 ? cut.slice(0, sp) : cut).replace(/[\s,;:.\-–—]+$/, '');
  return base + '…';
}

/** A scene's one-line synopsis from its script pages: the first action line's first sentence. */
export function synopsisFor(slice) {
  return firstSentence(firstAction(slice), 140);
}

/** The confident pairs only (a guess by position never writes). */
const confident = (scenes, elements) => matchScenes(scenes, elements).pairs.filter((p) => p.slice && isConfident(p.how));

/** Synopses for scenes whose synopsis is blank: [{ sceneId, text }]. */
export function planSynopses(scenes, elements) {
  const out = [];
  for (const { scene, slice } of confident(scenes, elements)) {
    if (String(scene.synopsis ?? '').trim()) continue;
    const text = synopsisFor(slice);
    if (text) out.push({ sceneId: scene.id, text });
  }
  return out;
}

/** Write them, re-reading first: only where the synopsis is still blank. Returns what was written. */
export function applySynopses(items) {
  const scenes = listScenes();
  const byId = new Map(scenes.map((s) => [s.id, s]));
  const written = [];
  for (const it of items || []) {
    const s = byId.get(it.sceneId);
    if (!s || !it.text || String(s.synopsis ?? '').trim()) continue;
    s.synopsis = it.text;
    written.push({ sceneId: s.id, text: it.text });
  }
  if (written.length) saveScenes(scenes);
  return written;
}

/** Take back exactly those, only where the synopsis still equals the written text. */
export function undoSynopses(written) {
  const scenes = listScenes();
  const byId = new Map(scenes.map((s) => [s.id, s]));
  let n = 0;
  for (const w of written || []) {
    const s = byId.get(w.sceneId);
    if (!s || s.synopsis !== w.text) continue;
    s.synopsis = '';
    n++;
  }
  if (n) saveScenes(scenes);
  return n;
}

/* ---- extras ---------------------------------------------------- */

const NOUNS = (lexicon.extras || []).map((w) => String(w).toLowerCase());
const NOUN_SET = new Set(NOUNS);
/* The lexicon's own pairs: a plural folds to its singular only when the
   singular is in the list too (the rule Auto-Tag uses). */
const FOLD = new Map();
for (const w of NOUN_SET) {
  if (w.endsWith('es') && NOUN_SET.has(w.slice(0, -2))) FOLD.set(w, w.slice(0, -2));
  else if (w.endsWith('s') && NOUN_SET.has(w.slice(0, -1))) FOLD.set(w, w.slice(0, -1));
}
const fold = (w) => FOLD.get(w) || w;
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const NOUN_RE = [...NOUNS].sort((a, b) => b.length - a.length).map(escRe).join('|');
const CROWDY = new Set(['crowd', 'crowds', 'mob']);

const UNITS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19 };
const TENS = { twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
const U_RE = Object.keys(UNITS).join('|');
const T_RE = Object.keys(TENS).join('|');
const NW = `(?:a\\s+dozen|a\\s+couple\\s+of|(?:(?:${U_RE})\\s+)?hundred|a\\s+hundred|(?:${T_RE})(?:[-\\s](?:${U_RE.split('|').slice(0, 9).join('|')}))?|${U_RE})`;

function wordsToNumber(w) {
  const t = clean(w).toLowerCase().replace(/-/g, ' ');
  if (t === 'a dozen') return 12;
  if (t === 'a couple of') return 2;
  if (t === 'hundred' || t === 'a hundred') return 100;
  const h = t.match(/^(\w+) hundred$/);
  if (h && UNITS[h[1]]) return UNITS[h[1]] * 100;
  const parts = t.split(' ');
  if (TENS[parts[0]]) return TENS[parts[0]] + (parts[1] ? UNITS[parts[1]] || 0 : 0);
  return UNITS[t] || null;
}
const toCount = (s) => (/^\d/.test(s) ? Number(String(s).replace(/,/g, '')) : wordsToNumber(s));

/* Words that may sit between a count and its noun ("40 angry students")
   but never articles or joiners, which would carry the number to
   something else ("3 PM the crowd"). */
const GAP = `(?:(?!(?:the|a|an|and|at|in|on|to|from|with|of|pm|am)\\b)[\\p{L}'’-]+\\s+){0,2}?`;
const RE_PAREN = new RegExp(`\\b(${NOUN_RE})\\s*\\(\\s*(\\d[\\d,]*)\\s*\\)`, 'giu');
const RE_DIGIT = new RegExp(`(?<![\\d,.])(\\d[\\d,]*)\\s+${GAP}(${NOUN_RE})\\b`, 'giu');
const RE_WORD = new RegExp(`\\b(${NW})\\s+${GAP}(${NOUN_RE})\\b`, 'giu');
const RE_CROWD_OF = new RegExp(`\\b(crowds?|mob)\\s+of\\s+(\\d[\\d,]*|${NW})\\b`, 'giu');
const RE_BARE = new RegExp(`\\b(${NOUN_RE})\\b`, 'giu');
const LEAD = /(?:^|\s)(?:a|an|the|of|large|small|big|huge|noisy|angry|cheering|thin|whole)\s+$/i;

const actionLines = (slice) => ((slice && slice.elements) || [])
  .filter((e) => e.type === 'action').map((e) => clean(e.text)).filter(Boolean);

/** Crowd and background nouns in a scene's action lines, one per noun
 *  (the highest stated count wins), in the order they first appear. */
export function extractExtras(slice) {
  const found = new Map();   // folded noun -> item
  const note = (written, count, from) => {
    const key = fold(String(written).toLowerCase());
    const cur = found.get(key);
    if (cur) {
      if (count != null && (cur.count == null || count > cur.count)) { cur.count = count; cur.text = titleCase(cur.written) + ' (' + count + ')'; }
      return;
    }
    const w = String(written).toLowerCase();
    found.set(key, { noun: key, count, text: titleCase(w) + (count != null ? ' (' + count + ')' : ''), from: from.slice(0, 160), written: w });
  };
  for (const line of actionLines(slice)) {
    let counted = 0;
    const take = (re, nounAt, countAt) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(line))) {
        const n = toCount(m[countAt]);
        if (!n) continue;
        note(m[nounAt], n, line); counted++;
      }
    };
    take(RE_PAREN, 1, 2);
    take(RE_DIGIT, 2, 1);
    take(RE_WORD, 2, 1);
    take(RE_CROWD_OF, 1, 2);
    if (counted) continue;
    RE_BARE.lastIndex = 0;
    let m;
    while ((m = RE_BARE.exec(line))) {
      const w = m[1];
      if (CROWDY.has(w.toLowerCase())) {
        const caps = w === w.toUpperCase();
        if (!caps && !LEAD.test(line.slice(0, m.index) + ' ')) continue;
      }
      note(w, null, line);
    }
  }
  return [...found.values()].map(({ written, ...it }) => it);
}

const wordsOfTag = (n) => ' ' + String(n).toLowerCase().replace(/\(.*?\)/g, ' ')
  .split(/[^\p{L}\p{N}'’]+/u).filter(Boolean).map(fold).join(' ') + ' ';

/** Extras to tag: [{ sceneId, category: 'extras', name, count }]. A scene whose
 *  extras already name the noun (a typed "Students") gets nothing for it. */
export function planExtras(scenes, elements) {
  const out = [];
  for (const { scene, slice } of confident(scenes, elements)) {
    const have = ((scene.elements && scene.elements.extras) || []).map(wordsOfTag);
    for (const it of extractExtras(slice)) {
      const w = wordsOfTag(it.noun);
      if (have.some((t) => t.includes(w))) continue;
      out.push({ sceneId: scene.id, category: 'extras', name: it.text, count: it.count });
    }
  }
  return out;
}

/* ---- tags ------------------------------------------------------ */

/** Auto-Tag's suggestions on confident pairs, only the ticked categories
 *  (undefined = all), never cast (the scenes step) or extras (above). */
export function planTags(scenes, elements, categories) {
  const want = Array.isArray(categories) ? new Set(categories) : null;
  const out = [];
  for (const r of suggestAll(scenes, elements)) {
    if (!isConfident(r.how)) continue;
    for (const [cat, list] of Object.entries(r.suggestions)) {
      if (cat === 'cast' || cat === 'extras' || (want && !want.has(cat))) continue;
      for (const s of list) out.push({ sceneId: r.scene.id, category: cat, name: s.name });
    }
  }
  return out;
}

/** What each category would add: planTags(all) plus planExtras, for the lock sheet's ticks. */
export function tagCountsByCategory(scenes, elements) {
  const by = {};
  for (const t of planTags(scenes, elements)) by[t.category] = (by[t.category] || 0) + 1;
  const ex = planExtras(scenes, elements).length;
  if (ex) by.extras = ex;
  return by;
}

export default { firstSentence, synopsisFor, extractExtras, planSynopses, applySynopses, undoSynopses, planExtras, planTags, tagCountsByCategory };
