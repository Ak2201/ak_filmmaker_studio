/* ============================================================
   SCREENPLAY EXPORT — the element list as an actual screenplay
   ------------------------------------------------------------
   src/lib/script.js owns the model: six element types and a line
   count. This module owns the one thing the model deliberately
   does not — what the script looks like on paper.

   WHY A PAGINATOR AND NOT JUST CSS. The page geometry already
   lived in styles/pdf.css and it was right: 12pt Courier, a 1.5in
   gutter, a 6in text block, the six indents. What CSS could not
   do is the three things that make a printed screenplay a
   screenplay rather than a long column:

     · a page number, top right. Blink implements neither the
       `@page` margin boxes nor `counter(page)` outside them —
       src/lib/pdf.js has the measurements — so a page number has
       to be a real element, which means something has to know
       where the pages are.
     · (MORE) / (CONT'D) when a speech breaks across a page. No
       stylesheet can write two words that only exist because of
       where a break landed.
     · not orphaning a slug line at the foot of a page.

   All three need the same answer: which element lands on which
   page. A monospaced face at a fixed size makes that answer exact
   rather than a guess — 12pt Courier is 10 characters to the inch
   and 6 lines to the inch — so this file lays the document out
   itself and hands the browser pages that are already decided.

   ONE GEOMETRY, TWO RENDERERS. `paginate()` is the whole of the
   format. `buildDocument()` turns its pages into DOM for the
   print pipeline; `toText()` turns the same pages into a plain
   text file with real spaces. Neither knows the format — if they
   disagree, only one of them is wrong, and it is not the format.

   NO COLOURS, NO SHAPES. Everything visual is in styles/pdf.css
   and styles/write.css. The only literals here are character
   counts, which are the format itself.
   ============================================================ */
import { h } from './dom.js';
import { ELEMENT_TYPE_IDS } from './script.js';

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
  transition: { indent: 0,  width: 60, upper: true,  blankBefore: 1, align: 'right' }
};
export const geometryOf = (type) => GEOMETRY[type] || GEOMETRY.action;

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

     { type, lines: [...], blankBefore, contd, more }

   `contd` marks a cue this module wrote because a speech carried
   over; `more` marks the (MORE) that was left at the foot of the
   page it carried over from. Neither exists in the model — they
   are properties of where the break landed, and storing them
   would be a second representation that the next edit invalidates.
   ------------------------------------------------------------ */
export function paginate(elements) {
  const pages = [];
  let page = [];
  let used = 0;
  let speaker = '';          // whose speech we are inside, for (CONT'D)

  const flush = () => { if (page.length) { pages.push(page); } page = []; used = 0; };

  const place = (row, cost) => { page.push(row); used += cost; };

  for (const el of (elements || [])) {
    const type = GEOMETRY[el && el.type] ? el.type : 'action';
    const text = printedText(el);
    if (!text) continue;                 // a blank element is a gap, not a beat
    const geom = GEOMETRY[type];
    const lines = wrapText(text, geom.width);

    if (type === 'character') speaker = text;
    if (type === 'scene' || type === 'transition' || type === 'action') speaker = '';

    const gap = page.length ? geom.blankBefore : 0;
    const need = gap + lines.length;

    /* A slug line and a cue may not be the LAST thing on a page.
       styles/pdf.css asks the browser for `break-after: avoid` on
       both, and a browser honouring that request would move the
       line itself — onto a page this module had already filled to
       its last line, overflowing it and producing a blank sheet.
       Reserving one line here means the stylesheet never has to
       act, and nothing can overflow. */
    const reserve = (type === 'scene' || type === 'character') ? 1 : 0;

    if (used + need + reserve <= BODY_LINES) { place({ type, lines, blankBefore: gap }, need); continue; }

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
      /* Terminates: every turn either places the whole remainder
         and breaks, or places at least MIN_SPLIT lines of it, or
         flushes a page that had something on it. A flushed empty
         page resets `used` to 0, which makes `room` the full body
         and the next turn places. */
      for (;;) {
        if (used + lead + rest.length <= BODY_LINES) {
          place({ type, lines: rest, blankBefore: lead }, lead + rest.length);
          break;
        }
        // One line held back for the (MORE) that goes under a
        // broken speech. Not counting it is how a page comes out
        // one line too tall and the browser adds a blank sheet.
        const room = BODY_LINES - used - lead - (speech ? 1 : 0);
        if (room < MIN_SPLIT || rest.length - room < MIN_SPLIT) { flush(); lead = 0; continue; }

        place({ type, lines: rest.slice(0, room), blankBefore: lead }, lead + room);
        if (speech) page.push({ type: 'more', lines: ['(MORE)'], blankBefore: 0 });
        flush();
        lead = 0;
        rest = rest.slice(room);
        if (speech && speaker) {
          page.push({
            type: 'character', blankBefore: 0, contd: true,
            lines: wrapText(speaker + " (CONT'D)", GEOMETRY.character.width)
          });
          used += 1;
        }
      }
      continue;
    }

    flush();
    /* A cue that moved to the next page on its own leaves its
       speech behind it — that is fine, the speech follows on the
       same page. What must not happen is the cue carrying a
       (CONT'D) it did not earn. */
    place({ type, lines, blankBefore: 0 }, lines.length);
  }
  flush();
  return pages;
}

/* ------------------------------------------------------------
   THE PAGE NUMBER
   ------------------------------------------------------------
   The title page is not numbered and neither is the first page of
   the script — that is the convention, and it is why the numbers
   a reader sees start at 2. The blank header line is still
   rendered on page one so every page has the same text box.
   ------------------------------------------------------------ */
export const pageNumber = (i) => (i === 0 ? '' : String(i + 1) + '.');

/* ------------------------------------------------------------
   RENDERER 1 — DOM, for the print pipeline
   ------------------------------------------------------------ */
const PRINT_CLASS = {
  scene: 'wr-pr-scene',
  action: 'wr-pr-action',
  character: 'wr-pr-character',
  paren: 'wr-pr-paren',
  dialogue: 'wr-pr-dialogue',
  transition: 'wr-pr-transition',
  more: 'wr-pr-more'
};

/**
 * The screenplay as a document.
 *   meta: { title, revision, subtitle }
 * Returns a detached `div.wr-print`. write.js appends it for the
 * duration of one print job and throws it away on afterprint — a
 * second copy of the script living in the DOM is the "one
 * representation per thing" rule broken, and it would be the copy
 * that goes stale.
 */
export function buildDocument(doc, meta = {}) {
  const root = h('div.wr-print');

  root.append(h('div.wr-pr.wr-pr-title', {}, [
    h('b', { text: String(meta.title || 'Untitled') }),
    h('span', { text: 'Screenplay' }),
    h('span', { text: String(meta.revision || meta.subtitle || '') })
  ]));

  const pages = paginate((doc && doc.elements) || []);
  pages.forEach((rows, i) => {
    const sheet = h('section.wr-pg');
    sheet.append(h('div.wr-pg-num', { text: pageNumber(i) }));
    for (const row of rows) {
      const cls = PRINT_CLASS[row.type] || PRINT_CLASS.action;
      const p = h('p.wr-pr.' + cls + (row.blankBefore === 2 ? '.wr-pr-gap2' : ''), {
        text: row.lines.join('\n')
      });
      if (row.contd) p.classList.add('wr-pr-contd');
      if (row.blankBefore === 0 && row.type !== 'more') p.classList.add('wr-pr-tight');
      sheet.append(p);
    }
    root.append(sheet);
  });

  /* An empty script still gets a title page. It does not get a
     blank numbered sheet behind it, which reads as a bug. */
  return root;
}

/** How many sheets the script prints on, title page excluded. */
export function sheetCount(elements) {
  return paginate(elements).length;
}

/* ------------------------------------------------------------
   RENDERER 2 — plain text, with real spaces
   ------------------------------------------------------------
   The same pages, indented with spaces at the same character
   counts, so the file opens correctly in anything that can show a
   monospaced face. This is what "the formatted script" means as a
   file rather than as a PDF — and unlike the Fountain export it is
   not markup a reader has to render first.
   ------------------------------------------------------------ */
const pad = (n) => ' '.repeat(Math.max(0, n));
const TEXT_WIDTH = 60;

function textRow(row) {
  const geom = row.type === 'more' ? GEOMETRY.paren : geometryOf(row.type);
  return row.lines.map((line) => {
    if (geom.align === 'right') return pad(Math.max(0, TEXT_WIDTH - line.length)) + line;
    return pad(geom.indent) + line;
  });
}

export function toText(doc, meta = {}) {
  const title = String(meta.title || 'Untitled');
  const out = [];

  // The title page, centred on the 60-character measure.
  const centre = (s) => pad(Math.max(0, Math.round((TEXT_WIDTH - s.length) / 2))) + s;
  out.push('', '', '', '', '', '', '', '', '', '');
  out.push(centre(title.toUpperCase()));
  out.push('', '');
  out.push(centre('Screenplay'));
  if (meta.author) { out.push(''); out.push(centre('by')); out.push(''); out.push(centre(String(meta.author))); }
  if (meta.revision) { out.push('', ''); out.push(centre(String(meta.revision))); }
  if (meta.date) { out.push(''); out.push(centre(String(meta.date))); }

  const pages = paginate((doc && doc.elements) || []);
  pages.forEach((rows, i) => {
    out.push('\f');                                  // a real page break
    const num = pageNumber(i);
    out.push(num ? pad(Math.max(0, TEXT_WIDTH - num.length)) + num : '');
    out.push('');
    rows.forEach((row, j) => {
      for (let b = 0; b < (j === 0 ? 0 : row.blankBefore); b++) out.push('');
      out.push(...textRow(row));
    });
  });

  /* No FADE OUT. is appended. Whether the script ends on one is a
     transition element the writer either typed or did not, and a
     file that adds one grows a second copy every time it is
     exported, imported and exported again. */
  return out.join('\n') + '\n';
}

export default {
  GEOMETRY, geometryOf, PAGE_LINES, BODY_LINES,
  wrapText, printedText, paginate, pageNumber,
  buildDocument, sheetCount, toText
};
