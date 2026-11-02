/* ============================================================
   PAGINATE — src/lib/paginate.js
   ------------------------------------------------------------
   The screenplay format as arithmetic: the geometry, the wrap, and
   paginate(elements, opts), which says which element lands on which
   page. Pure — no DOM, no storage — so it runs in Node (test:paginate)
   and in the Screenplay Writer's live page view as well as in the
   print pipeline.

   WHY IT LEFT screenplay-export.js. That module renders (it builds
   DOM through dom.js). The editor needs only the answer, and it needs
   it on the page it is typing in, so the answer moved to a module of
   its own that both import. screenplay-export.js re-exports every
   name that used to live here, so no caller changed, and test:paginate
   holds SHA-256s of the exports taken before the move: the move
   changed no byte of any page.

   The long reasoning for every rule below stayed with the rule.
   ============================================================ */
import { isActEndText } from './act-line.js';
import { ELEMENT_TYPE_IDS, dualPairs, CONTD_RE, contdOffer, withContd } from './script.js';

const pad = (n) => ' '.repeat(Math.max(0, n));

/* ------------------------------------------------------------
   THE GEOMETRY
   ------------------------------------------------------------
   `indent` and `width` are in characters, measured from the left
   edge of the TEXT BLOCK — the sheet's 1.5in gutter is the page
   setup's job (SETUPS.screenplay in src/lib/pdf.js) and is not
   counted twice here. At 12pt Courier one character is 0.1in, so
   a character count and an inch measurement are the same number
   with the point moved.

     type         from sheet edge   = 1.5in gutter + indent
     scene               1.5in        0ch,  60ch wide  (the 6in block)
     action              1.5in        0ch,  60ch
     character           3.7in       22ch,  38ch
     parenthetical       3.1in       16ch,  28ch
     dialogue            2.5in       10ch,  35ch
     transition          right-aligned in the 60ch block
     centered, act       centred in the 60ch block; lyrics at dialogue's indent

   These are the same numbers styles/pdf.css paints, deliberately:
   a paginator that wraps at a different measure than the renderer
   produces a page that overflows by one line, silently, on the
   pages where a block happened to be near the edge.

   `blankBefore` is the blank line the format puts above an
   element. Dialogue and parentheticals get none — they sit hard
   under the cue — and a slug line gets two. src/lib/script.js's
   LAYOUT table says the same thing for the page count.
   ------------------------------------------------------------ */
export const GEOMETRY = {
  scene:      { indent: 0,  width: 60, upper: true,  blankBefore: 2, align: 'left' },
  action:     { indent: 0,  width: 60, upper: false, blankBefore: 1, align: 'left' },
  character:  { indent: 22, width: 38, upper: true,  blankBefore: 1, align: 'left' },
  paren:      { indent: 16, width: 28, upper: false, blankBefore: 0, align: 'left' },
  dialogue:   { indent: 10, width: 35, upper: false, blankBefore: 0, align: 'left' },
  transition: { indent: 0,  width: 60, upper: true,  blankBefore: 1, align: 'right' },
  /* A shot sits where a slug line sits, in capitals, but it is not a
     heading: not bold, one blank line above it rather than two, and no
     scene number in either margin. */
  shot:       { indent: 0,  width: 60, upper: true,  blankBefore: 1, align: 'left' },
  /* L3: the three elements Final Draft has and this editor lacked.
     Centered is a line of action set on the middle of the 60ch block
     (a title card, a sign). Lyrics sit where dialogue sits, in italics.
     An act break is centred capitals, underlined; a NEW act starts a
     page (see isActStart) and "END OF ACT" closes the one before. */
  centered:   { indent: 0,  width: 60, upper: false, blankBefore: 1, align: 'center' },
  lyrics:     { indent: 10, width: 35, upper: false, blankBefore: 1, align: 'left', italic: true },
  act:        { indent: 0,  width: 60, upper: true,  blankBefore: 2, align: 'center', underline: true }
};
/** "END OF ACT ONE" closes an act; any other act line ("ACT TWO",
    "NEW ACT") opens one, and an opening act starts a new page. */
export const isActEnd = isActEndText;
export const isActStart = (el) => !!el && el.type === 'act' && !isActEnd(el.text);
export const geometryOf = (type) => GEOMETRY[type] || GEOMETRY.action;

/* ------------------------------------------------------------
   DUAL DIALOGUE — two half-measure columns
   ------------------------------------------------------------
   Inside the 60ch block: the left column starts at 0, the right at
   31ch, each 29ch wide at most. Within a column the speech keeps its
   shape — the cue indented, the parenthetical less so, the dialogue
   flush — at roughly half the full measure, which is how Final Draft
   sets a dual block. src/lib/script.js's DUAL_LAYOUT counts lines at
   the same widths. */
export const DUAL = {
  offset: 31,
  character: { indent: 6, width: 22 },
  paren:     { indent: 2, width: 24 },
  dialogue:  { indent: 0, width: 27 }
};

/* Every element type the model knows has to have a geometry, or an
   element silently prints as action. Checked here rather than
   discovered on someone's title page. */
const MISSING = ELEMENT_TYPE_IDS.filter((id) => !GEOMETRY[id]);
if (MISSING.length) {
  console.warn('[screenplay] no geometry for element type(s):', MISSING.join(', '));
}

/* ------------------------------------------------------------
   THE PAGE
   ------------------------------------------------------------
   US Letter is 11in tall. SETUPS.screenplay takes 1in off the top
   and 22mm (0.866in) off the foot, leaving 9.13in — 54 lines at 6
   to the inch. Two of them are the page number and the blank line
   under it, on every page, so the geometry does not change when a
   page happens to be unnumbered.

   This is NOT script.js's LINES_PER_PAGE. That constant is 55 and
   it is the industry approximation the page COUNT is quoted in;
   this one is how many lines physically fit in the box this
   document is printed in. They are two different questions and
   tying them together would mean a page-setup change silently
   moved everybody's page count.
   ------------------------------------------------------------ */
export const PAGE_LINES = 54;
const HEADER_LINES = 2;
export const BODY_LINES = PAGE_LINES - HEADER_LINES;

/* A speech may only be broken with at least this many lines left
   behind and this many carried over. Two is the usual house rule,
   and it is what `widows`/`orphans: 2` in the stylesheet asks for. */
const MIN_SPLIT = 2;

/* ------------------------------------------------------------
   WRAPPING
   ------------------------------------------------------------ */
/** Break `text` into lines of at most `width` characters, honouring
    the line breaks the writer typed. A word longer than the measure
    is cut rather than allowed to run off the sheet — a URL in an
    action line is rare and a page that is 14 characters too wide is
    not something a reader can work around. */
export function wrapText(text, width) {
  const out = [];
  for (const para of String(text ?? '').split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (let word of words) {
      while (word.length > width) {
        if (line) { out.push(line); line = ''; }
        out.push(word.slice(0, width));
        word = word.slice(width);
      }
      if (!line) line = word;
      else if (line.length + 1 + word.length <= width) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out.length ? out : [''];
}

/** The text as it is printed, before it is wrapped: a parenthetical
    wears the brackets it is written without, and the uppercase types
    are uppercased here rather than by `text-transform`, so the plain
    text file and the PDF say the same thing. */
export function printedText(el) {
  const type = GEOMETRY[el && el.type] ? el.type : 'action';
  let text = String((el && el.text) ?? '').trim();
  if (!text) return '';
  if (type === 'paren' && !/^\(.*\)$/.test(text)) text = '(' + text + ')';
  if (GEOMETRY[type].upper) text = text.toUpperCase();
  return text;
}

/* ------------------------------------------------------------
   PAGINATION
   ------------------------------------------------------------
   Walks the element list once and returns pages. A page is a list
   of rows; a row is one already-wrapped block ready to be painted
   or printed:

     { type, lines: [...], blankBefore, contd, more, id, cont, sceneNo }

   `contd` marks a cue this module wrote because a speech carried
   over; `more` marks the (MORE) that was left at the foot of the
   page it carried over from. Neither exists in the model — they
   are properties of where the break landed, and storing them
   would be a second representation that the next edit invalidates.

   `id` is the element the row was cut from and `cont` says the row
   is the second (or later) piece of a block that broke across a
   page. They exist for the editor's page view, which draws its page
   breaks from THIS function rather than from a second estimate — so
   the page count on screen and the sheets in the PDF agree because
   they are one computation, not because two were tuned to match.
   `sceneNo` is the heading's ordinal, for the margin numbers.

   A dual-dialogue pair is ONE row, `type: 'dual'`, with `cols` (the
   two speeches, each a list of { type, lines }) and `lines` (the
   two columns set side by side as text). Its height is the taller
   column, and it is never split: a pair that does not fit moves to
   the next page whole. One taller than a whole page is set as two
   ordinary speeches instead, because the alternative is a block
   that runs off the sheet.
   ------------------------------------------------------------ */

/** The two sides of a dual pair, wrapped at the half measure, or null
    when either side has no cue to print (it then prints as ordinary
    speeches). */
function dualBlock(els, pair) {
  const side = (a, b) => {
    const rows = [];
    for (let k = a; k <= b; k++) {
      const el = els[k];
      const text = printedText(el);
      if (!text) continue;
      const geom = DUAL[el.type] || DUAL.dialogue;
      rows.push({ type: DUAL[el.type] ? el.type : 'dialogue', id: el.id, lines: wrapText(text, geom.width) });
    }
    return rows;
  };
  const left = side(pair.left[0], pair.left[1]);
  const right = side(pair.right[0], pair.right[1]);
  if (!left.length || !right.length || left[0].type !== 'character' || right[0].type !== 'character') return null;
  const flat = (rows) => rows.flatMap((r) => r.lines.map((l) => pad(DUAL[r.type].indent) + l));
  const L = flat(left);
  const R = flat(right);
  const height = Math.max(L.length, R.length);
  const lines = [];
  for (let r = 0; r < height; r++) {
    lines.push(((L[r] || '').padEnd(DUAL.offset) + (R[r] || '')).replace(/\s+$/, ''));
  }
  return { cols: [left, right], lines, height, ids: [...left, ...right].map((r) => r.id) };
}

/** A typed (CONT'D) on the cue is not repeated by the one a page
    break adds. "RAVI (CONT'D)" breaking over a page carries over as
    "RAVI (CONT'D)", not "RAVI (CONT'D) (CONT'D)". */
const contdCue = (speaker) => String(speaker).replace(CONTD_RE, ' ').replace(/\s+/g, ' ').trim() + " (CONT'D)";

/* LOCKED NUMBERS AND OMITTED SCENES. `opts.numbers` is what
   sceneNumbers() in src/lib/script.js says (paginateDoc() passes it):
   each heading's `sceneNo` comes from it, and every OMITTED number is
   set as a row of its own where the scene used to be — a slug-shaped
   row with no element behind it (`id: null`, `omitted: true`), which
   costs the same two blank lines and one line of text a heading does.
   It changes where pages break, which is exactly why it has to be in
   here and not painted on afterwards: the page view and the PDF take
   their breaks from this function, so they agree about it. Without
   `opts.numbers` the number is the heading's position, as before. */
/* ------------------------------------------------------------
   AUTOMATIC (CONT'D) — Final Draft's returning speaker
   ------------------------------------------------------------
   A character who speaks again in the same scene with only action
   between the two speeches is printed "RAVI (CONT'D)". The rule is
   script.js's contdOffer() — the same one the editor's "+ CONT'D"
   button is offered by — so the button and the automatic mark can
   never disagree about who qualifies. A cue that already says CONT'D
   is left alone (contdOffer is false for it), so the mark is never
   doubled.

   It is DISPLAY AND PRINT ONLY. The element's text is never touched:
   the writer's words are what they typed, and turning the setting off
   (Settings → Preferences, `autoContd` in fms_studio_prefs_v1) takes
   every automatic mark away again — which a mark written into the
   text could never do. The right half of a dual pair is skipped; a
   pair is printed as its own block.

   Indices, not ids: an element list read from an import may carry no
   ids, and the paginator walks by index anyway. */
export function autoContdIndices(elements) {
  const els = elements || [];
  const out = new Set();
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    if (el && el.type === 'character' && el.dual !== true && contdOffer(els, i)) out.add(i);
  }
  return out;
}

/* `opts.autoContd: true` turns the automatic (CONT'D) on (above). Off
   unless asked for: a caller that passes nothing gets exactly the
   pages it got before the option existed (test:paginate's GOLDEN). */
export function paginate(elements, opts = {}) {
  const els = elements || [];
  const nums = opts && opts.numbers;
  const autoSet = opts && opts.autoContd === true ? autoContdIndices(els) : null;
  /* LOCKED PAGES: a page starts before each of these element ids, as it
     did the day the pages were locked (pageNumbersDoc below numbers
     them). Material added since then overflows into A-pages instead of
     moving every later page. `breakAfter` (id → K) is the same promise
     for a page that began part-way through an element: that element
     broke K times when it was locked, and if it now breaks fewer (an
     edit above let more of it fit), the page that held its tail starts
     at the next element that prints rather than being swallowed by the
     page before. Both apply only to elements that print — a blanked
     element puts nothing on the page, so a break before it would start
     a page with nothing of its own. */
  const breakBefore = opts && opts.breakBefore instanceof Set ? opts.breakBefore : null;
  const breakAfter = opts && opts.breakAfter instanceof Map ? opts.breakAfter : null;
  let pendingBreak = false;  // breakAfter fired: break before the next printed element
  const byId = nums && nums.byId instanceof Map ? nums.byId : null;
  const omitBefore = new Map();
  const omitEnd = [];
  for (const o of (nums && nums.omitted) || []) {
    if (o.before) omitBefore.set(o.before, [...(omitBefore.get(o.before) || []), o.number]);
    else omitEnd.push(o.number);
  }
  const pairs = els.some((e) => e && e.dual === true)
    ? new Map(dualPairs(els).map((p) => [p.left[0], p]))
    : null;
  const pages = [];
  let page = [];
  let used = 0;
  let speaker = '';          // whose speech we are inside, for (CONT'D)
  let sceneNo = 0;

  const flush = () => { if (page.length) { pages.push(page); } page = []; used = 0; };

  const place = (row, cost) => { page.push(row); used += cost; };

  /* An omitted scene moves whole, like a slug line, and keeps the one
     line a slug line reserves under itself. */
  const placeOmitted = (number) => {
    speaker = '';
    const row = { type: 'scene', omitted: true, id: null, lines: ['OMITTED'], sceneNo: String(number) };
    const gap = page.length ? GEOMETRY.scene.blankBefore : 0;
    if (used + gap + 1 + 1 <= BODY_LINES) { place({ ...row, blankBefore: gap }, gap + 1); return; }
    flush();
    place({ ...row, blankBefore: 0 }, 1);
  };

  for (let idx = 0; idx < els.length; idx++) {
    const el = els[idx];
    /* An OMITTED row anchored here stands where its scene stood, which
       is BEFORE this element: on the page before a locked break, not at
       the top of the locked page (whose lines it would push into an
       A-page that nothing on it earned). When it did NOT fit there it
       has already begun a page of its own, and that page IS the locked
       one: pageStarts() recorded it as starting at this element, because
       an OMITTED row has no id. Breaking again would set the OMITTED row
       alone on a lettered page (1A) the moment the pages were locked,
       with no edit — so a page holding only OMITTED rows takes no
       locked break. */
    if (omitBefore.size && el && omitBefore.has(el.id)) omitBefore.get(el.id).forEach(placeOmitted);
    if ((breakBefore || breakAfter) && el && printedText(el)) {
      if ((pendingBreak || (breakBefore && breakBefore.has(el.id)))
        && page.length && !page.every((r) => r.omitted === true)) flush();
      pendingBreak = false;
    }
    let pieces = 0;          // page breaks inside this element
    const pair = pairs && pairs.get(idx);
    if (pair) {
      const block = dualBlock(els, pair);
      if (block && block.height <= BODY_LINES) {
        speaker = '';
        if (page.length && used + 1 + block.height > BODY_LINES) flush();
        const gap = page.length ? 1 : 0;
        place({ type: 'dual', id: els[pair.left[0]].id, ids: block.ids, cols: block.cols,
          lines: block.lines, blankBefore: gap }, gap + block.height);
        idx = pair.right[1];
        if (breakAfter && breakAfter.has(els[pair.left[0]].id)) pendingBreak = true;
        continue;
      }
    }

    const type = GEOMETRY[el && el.type] ? el.type : 'action';
    let text = printedText(el);
    if (!text) continue;                 // a blank element is a gap, not a beat
    const auto = !!autoSet && autoSet.has(idx);
    if (auto) text = withContd(text);    // the print's, never the element's
    const geom = GEOMETRY[type];
    /* A new act starts a page — flushed here, before the cost is
       counted, so the gap above it is 0 on the fresh page. */
    if (isActStart(el) && page.length && !page.every((r) => r.omitted === true)) { flush(); speaker = ''; }
    const lines = wrapText(text, geom.width);
    const id = el && el.id;
    const extra = type === 'scene'
      ? { sceneNo: (byId && byId.get(id)) || String(sceneNo + 1) }
      : auto ? { autoContd: true } : null;
    if (type === 'scene') sceneNo++;

    if (type === 'character') speaker = text;
    if (type === 'scene' || type === 'transition' || type === 'action' || type === 'shot'
      || type === 'centered' || type === 'act') speaker = '';

    const gap = page.length ? geom.blankBefore : 0;
    const need = gap + lines.length;

    /* A slug line and a cue may not be the LAST thing on a page.
       styles/pdf.css asks the browser for `break-after: avoid` on
       both, and a browser honouring that request would move the
       line itself — onto a page this module had already filled to
       its last line, overflowing it and producing a blank sheet.
       Reserving one line here means the stylesheet never has to
       act, and nothing can overflow. */
    const reserve = (type === 'scene' || type === 'character' || type === 'shot') ? 1 : 0;

    if (used + need + reserve <= BODY_LINES) {
      place({ type, lines, blankBefore: gap, id, ...extra }, need);
      if (breakAfter && breakAfter.has(id)) pendingBreak = true;
      continue;
    }

    /* A speech and an action block are the two worth breaking; a
       speech gets the two words the format has for it. Everything
       else moves whole — an orphaned slug line at the foot of a
       page is the defect a 1st AD notices first, and a two-line
       cue split down the middle is not a thing that exists.

       A block longer than a whole page goes through the splitter
       whatever its type, because the alternative is a page that
       silently runs off the bottom of the sheet. */
    const splittable = type === 'dialogue' || type === 'action' || lines.length > BODY_LINES;
    if (splittable) {
      const speech = type === 'dialogue';
      let rest = lines;
      let lead = gap;
      let piece = 0;
      /* Terminates: every turn either places the whole remainder
         and breaks, or places at least MIN_SPLIT lines of it, or
         flushes a page that had something on it. A flushed empty
         page resets `used` to 0, which makes `room` the full body
         and the next turn places. */
      for (;;) {
        if (used + lead + rest.length <= BODY_LINES) {
          place({ type, lines: rest, blankBefore: lead, id, ...(piece ? { cont: true } : extra) }, lead + rest.length);
          break;
        }
        // One line held back for the (MORE) that goes under a
        // broken speech. Not counting it is how a page comes out
        // one line too tall and the browser adds a blank sheet.
        const room = BODY_LINES - used - lead - (speech ? 1 : 0);
        if (room < MIN_SPLIT || rest.length - room < MIN_SPLIT) { flush(); lead = 0; continue; }

        place({ type, lines: rest.slice(0, room), blankBefore: lead, id, ...(piece ? { cont: true } : extra) }, lead + room);
        piece++;
        pieces = piece;
        if (speech) page.push({ type: 'more', lines: ['(MORE)'], blankBefore: 0 });
        flush();
        lead = 0;
        rest = rest.slice(room);
        if (speech && speaker) {
          page.push({
            type: 'character', blankBefore: 0, contd: true,
            lines: wrapText(contdCue(speaker), GEOMETRY.character.width)
          });
          used += 1;
        }
      }
      if (breakAfter && breakAfter.has(id) && pieces < breakAfter.get(id)) pendingBreak = true;
      continue;
    }

    flush();
    /* A cue that moved to the next page on its own leaves its
       speech behind it — that is fine, the speech follows on the
       same page. What must not happen is the cue carrying a
       (CONT'D) it did not earn. */
    place({ type, lines, blankBefore: 0, id, ...extra }, lines.length);
    if (breakAfter && breakAfter.has(id)) pendingBreak = true;
  }
  omitEnd.forEach(placeOmitted);
  flush();
  return pages;
}

/* ------------------------------------------------------------
   WHERE EACH ELEMENT LANDS — for the caret strip
   ------------------------------------------------------------
   id → { page, line }: the 0-based page an element STARTS on and how
   many body lines of that page stand above it (the blank lines the
   format puts over it included). A dual pair maps every id in it to
   the pair's row; a split element is mapped by its first piece. Built
   once per pagination, at idle, so a caret move is a Map lookup and
   never a re-pagination (src/lib/caret-position.js). */
export function pageIndex(pages) {
  const out = new Map();
  (pages || []).forEach((rows, p) => {
    let used = 0;
    rows.forEach((row, j) => {
      const gap = j === 0 ? 0 : (row.blankBefore || 0);
      const at = { page: p, line: used + gap };
      if (!row.cont) {
        for (const id of (row.ids || [row.id])) if (id && !out.has(id)) out.set(id, at);
      }
      used += gap + ((row.lines && row.lines.length) || 0);
    });
  });
  return out;
}
