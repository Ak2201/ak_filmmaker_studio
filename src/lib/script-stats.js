/* ============================================================
   SCRIPT STATISTICS — the Screenplay Writer's Statistics panel
   ------------------------------------------------------------
   PURE, and stores nothing: every figure is derived from the element
   list each time the panel opens, like the cast matrix and the caret
   strip, so it can never disagree with the page. Nothing here reads or
   writes storage.

   PAGES ARE THE REAL PAGINATION when the caller hands in `pages` — the
   output of the PDF's own paginator (screenplay-export.js paginateDoc,
   the same pass the page view draws its breaks from). Then the page
   count is the number of printed pages and a scene's length is the
   lines it really takes, in eighths. Without `pages` (the typesetter
   not loaded yet) both fall back to script.js's line estimate, the one
   the status strip has always used, and `paginated` says so.

   INT/EXT and DAY/NIGHT come from the heading through script-import.js
   parseSlug(), the parser the Breakdown's rows are filled by, so the
   split here is the split the Breakdown shows. A heading with no time
   of day counts as "unstated", never as DAY (parseSlug guesses DAY for
   a row; a count must not).

   DIALOGUE SHARE is words of dialogue (and lyrics) under each
   character's cues, over all dialogue words. Extensions — (V.O.),
   (CONT'D), the dual-dialogue caret — are not part of who speaks
   (script-index.js baseName()).
   ============================================================ */
import { wordCount, elementLines, totalLines, LINES_PER_PAGE } from './script.js';
import { parseSlug } from './script-import.js';
import { baseName } from './script-index.js';
import { pageIndex, BODY_LINES } from './paginate.js';

const SPOKEN = new Set(['dialogue', 'lyrics']);
const HAS_IE = /^(?:[A-Z]?\d+[A-Z]?[.)]?\s+)?(INT|EXT|EST|I\s*\/\s*E|உள்|வெளி)/i;

/** Lines used on each page of a pagination (the last page's fill). */
function usedLines(rows) {
  let used = 0;
  (rows || []).forEach((row, j) => {
    used += (j === 0 ? 0 : (row.blankBefore || 0)) + ((row.lines && row.lines.length) || 0);
  });
  return used;
}

/** Eighths of a page, at least 1 for a scene that prints anything. */
const eighths = (lines, perPage) => (lines > 0 ? Math.max(1, Math.round((lines / perPage) * 8)) : 0);

/**
 * @param {Array} elements  the script's elements
 * @param {{pages?: Array}} [opts]  paginate()'s pages, when loaded
 * @returns {{
 *   words, pages, paginated, scenes, elements,
 *   intExt: {INT, EXT, 'INT/EXT', unstated},
 *   dayNight: {DAY, NIGHT, DAWN, DUSK, CONTINUOUS, unstated},
 *   dialogueWords, actionWords,
 *   speakers: [{ name, words, speeches, share }],   // share 0..1, most words first
 *   longest: [{ id, n, heading, eighths, lines }]  // up to 5, longest first
 * }}
 */
export function scriptStatistics(elements, opts = {}) {
  const list = (Array.isArray(elements) ? elements : []).filter(Boolean);
  const pages = Array.isArray(opts.pages) && opts.pages.length ? opts.pages : null;
  const out = {
    words: 0, pages: 0, paginated: !!pages, scenes: 0, elements: list.length,
    intExt: { INT: 0, EXT: 0, 'INT/EXT': 0, unstated: 0 },
    dayNight: { DAY: 0, NIGHT: 0, DAWN: 0, DUSK: 0, CONTINUOUS: 0, unstated: 0 },
    dialogueWords: 0, actionWords: 0, speakers: [], longest: []
  };
  const written = list.some((e) => String(e.text || '').trim());
  const by = new Map();
  let speaker = null;
  const scenes = [];
  let cur = null;
  list.forEach((e, i) => {
    const w = wordCount(e.text);
    out.words += w;
    if (e.type === 'scene') {
      out.scenes++;
      const text = String(e.text || '').split('\n').find((l) => l.trim()) || '';
      const p = parseSlug(text);
      if (HAS_IE.test(text.trim())) out.intExt[p.intExt in out.intExt ? p.intExt : 'INT']++;
      else out.intExt.unstated++;
      if (!p.guessedTime && p.dayNight in out.dayNight) out.dayNight[p.dayNight]++;
      else out.dayNight.unstated++;
      if (cur) cur.end = i;                      // the open scene ends here
      cur = { id: e.id, n: out.scenes, heading: text.trim() || '(untitled heading)', start: i, end: list.length };
      scenes.push(cur);
      speaker = null;
      return;
    }
    if (e.type === 'act' && cur) { cur.end = i; cur = null; }
    if (e.type === 'character') {
      const name = baseName(e.text);
      speaker = name || null;
      if (name && !by.has(name)) by.set(name, { name, words: 0, speeches: 0, order: by.size });
      return;
    }
    if (SPOKEN.has(e.type)) {
      out.dialogueWords += w;
      if (speaker) { const s = by.get(speaker); s.words += w; if (e.type === 'dialogue') s.speeches++; }
      return;
    }
    if (e.type === 'paren') return;              // direction inside a speech
    speaker = null;
    if (e.type === 'action') out.actionWords += w;
  });

  out.speakers = [...by.values()]
    .filter((s) => s.words > 0)
    .sort((a, b) => b.words - a.words || a.order - b.order)
    .map(({ order, ...s }) => ({ ...s, share: out.dialogueWords ? s.words / out.dialogueWords : 0 }));

  /* Pages and scene lengths. */
  let lengthOf;
  if (pages) {
    out.pages = written ? pages.length : 0;
    const idx = pageIndex(pages);
    const abs = (id) => { const at = idx.get(id); return at ? at.page * BODY_LINES + at.line : null; };
    const endAbs = (pages.length - 1) * BODY_LINES + usedLines(pages[pages.length - 1]);
    /* The first printed element at or after index k: an element that
       prints nothing (a blank line) has no place on a page. */
    const firstAt = (k, stop) => {
      for (let i = k; i < stop; i++) { const a = abs(list[i].id); if (a != null) return a; }
      return null;
    };
    lengthOf = (sc) => {
      const a = firstAt(sc.start, sc.end);
      if (a == null) return 0;
      const b = firstAt(sc.end, list.length);
      return Math.max(0, (b == null ? endAbs : b) - a);
    };
    out.longest = scenes.map((sc) => {
      const lines = lengthOf(sc);
      return { id: sc.id, n: sc.n, heading: sc.heading, lines, eighths: eighths(lines, BODY_LINES) };
    });
  } else {
    out.pages = written ? Math.round((totalLines(list) / LINES_PER_PAGE) * 10) / 10 : 0;
    out.longest = scenes.map((sc) => {
      let lines = 0;
      for (let i = sc.start; i < sc.end; i++) lines += elementLines(list[i]);
      return { id: sc.id, n: sc.n, heading: sc.heading, lines, eighths: eighths(lines, LINES_PER_PAGE) };
    });
  }
  out.longest = out.longest
    .filter((s) => s.lines > 0)
    .sort((a, b) => b.lines - a.lines || a.n - b.n)
    .slice(0, opts.longest || 5);
  return out;
}

/** "1 4/8" style page length from eighths. */
export function formatEighths(n) {
  const whole = Math.floor(n / 8);
  const rest = n % 8;
  if (!rest) return String(whole);
  return (whole ? whole + ' ' : '') + rest + '/8';
}

/** A share 0..1 as a whole percentage, "<1%" for a sliver. */
export function formatShare(x) {
  if (!(x > 0)) return '0%';
  const p = Math.round(x * 100);
  return p < 1 ? '<1%' : p + '%';
}

export default { scriptStatistics, formatEighths, formatShare };
