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
import { ELEMENT_TYPE_IDS, dualPairs, hasTitlePage, CONTD_RE, sceneNumbers } from './script.js';

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
  transition: { indent: 0,  width: 60, upper: true,  blankBefore: 1, align: 'right' },
  /* A shot sits where a slug line sits, in capitals, but it is not a
     heading: not bold, one blank line above it rather than two, and no
     scene number in either margin. */
  shot:       { indent: 0,  width: 60, upper: true,  blankBefore: 1, align: 'left' }
};
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
export function paginate(elements, opts = {}) {
  const els = elements || [];
  const nums = opts && opts.numbers;
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
    if (omitBefore.size && el && omitBefore.has(el.id)) omitBefore.get(el.id).forEach(placeOmitted);
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
        continue;
      }
    }

    const type = GEOMETRY[el && el.type] ? el.type : 'action';
    const text = printedText(el);
    if (!text) continue;                 // a blank element is a gap, not a beat
    const geom = GEOMETRY[type];
    const lines = wrapText(text, geom.width);
    const id = el && el.id;
    const extra = type === 'scene'
      ? { sceneNo: (byId && byId.get(id)) || String(sceneNo + 1) }
      : null;
    if (type === 'scene') sceneNo++;

    if (type === 'character') speaker = text;
    if (type === 'scene' || type === 'transition' || type === 'action' || type === 'shot') speaker = '';

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

    if (used + need + reserve <= BODY_LINES) { place({ type, lines, blankBefore: gap, id, ...extra }, need); continue; }

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
      continue;
    }

    flush();
    /* A cue that moved to the next page on its own leaves its
       speech behind it — that is fine, the speech follows on the
       same page. What must not happen is the cue carrying a
       (CONT'D) it did not earn. */
    place({ type, lines, blankBefore: 0, id, ...extra }, lines.length);
  }
  omitEnd.forEach(placeOmitted);
  flush();
  return pages;
}

/** The script's own pages: its elements, numbered the way its lock
    (if any) says. Every renderer here, and the editor's page view,
    paginates through this, so a locked script cannot print one set of
    numbers and show another. */
export function paginateDoc(doc) {
  const els = (doc && doc.elements) || [];
  if (!doc || !doc.numbering || doc.numbering.locked !== true) return paginate(els);
  return paginate(els, { numbers: sceneNumbers(els, doc.numbering) });
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
  shot: 'wr-pr-shot',
  more: 'wr-pr-more'
};

/* ------------------------------------------------------------
   THE TITLE PAGE
   ------------------------------------------------------------
   When the script carries a `titlePage` (src/lib/script.js), page 1
   is the industry layout: the title in capitals a third of the way
   down, the credit and the writer under it, the source material
   under that, the contact block bottom left and the draft and date
   bottom right. Unnumbered, like every title page. A script with no
   title page keeps the plain one this module always printed — the
   project's title, the word Screenplay and the revision — so an
   export nobody configured looks exactly as it did.
   ------------------------------------------------------------ */
export function titlePageOf(doc, meta = {}) {
  const tp = doc && hasTitlePage(doc.titlePage) ? doc.titlePage : null;
  if (!tp) return null;
  const v = (k) => String(tp[k] ?? '').trim();
  return {
    title: v('title') || String(meta.title || '').trim() || 'Untitled',
    credit: v('credit') || (v('author') ? 'Written by' : ''),
    author: v('author'),
    source: v('source'),
    draft: v('draft'),
    date: v('date'),
    contact: v('contact')
  };
}

function titleSheet(doc, meta) {
  const tp = titlePageOf(doc, meta);
  if (!tp) {
    return h('div.wr-pr.wr-pr-title', {}, [
      h('b', { text: String(meta.title || 'Untitled') }),
      h('span', { text: 'Screenplay' }),
      h('span', { text: String(meta.revision || meta.subtitle || '') })
    ]);
  }
  const main = h('div.wr-pr-tp-main', {}, [h('b.wr-pr-tp-title', { text: tp.title.toUpperCase() })]);
  if (tp.credit) main.append(h('p.wr-pr-tp-credit', { text: tp.credit }));
  if (tp.author) main.append(h('p.wr-pr-tp-author', { text: tp.author }));
  if (tp.source) main.append(h('p.wr-pr-tp-source', { text: tp.source }));
  return h('div.wr-pr.wr-pr-tp', {}, [
    main,
    h('div.wr-pr-tp-foot', {}, [
      h('p.wr-pr-tp-contact', { text: tp.contact }),
      h('p.wr-pr-tp-draft', { text: [tp.draft, tp.date].filter(Boolean).join('\n') })
    ])
  ]);
}

/* ------------------------------------------------------------
   REVISION MARKS
   ------------------------------------------------------------
   `meta.marks` — { ids, label, swatch, tint } — is the set of element
   ids that changed since the revision a person chose
   (src/lib/script-diff.js, revisedIds()), and how the pages that carry
   them are labelled. The industry convention, as a production office
   issues it:
     · an asterisk in the RIGHT margin beside every changed line;
     · each page that holds a change headed with the revision colour's
       name ("Blue Revision") beside the page number — and, when
       printed on coloured stock, the page itself in that colour, which
       `tint` stands in for on a PDF.
   Neither changes a single break: the asterisk sits in the margin and
   the header sits in the line the page number already reserves, so a
   marked PDF and an unmarked one paginate identically, and both agree
   with the page view. */
const markSet = (marks) => (marks && marks.ids
  ? (marks.ids instanceof Set ? marks.ids : new Set(marks.ids))
  : null);
const rowMarked = (row, set) => !!set
  && (row.ids ? row.ids.some((id) => set.has(id)) : !!(row.id && set.has(row.id)));

/** One row of a page, as DOM, for the print document. */
function rowNode(row, opts) {
  const node = rowNodeBare(row, opts);
  if (opts.marked && rowMarked(row, opts.marked)) {
    node.classList.add('wr-pr-revd');
    node.append(h('span.wr-pr-star', { text: '*', 'aria-label': 'revised' }));
  }
  return node;
}

function rowNodeBare(row, opts) {
  if (row.omitted) {
    /* "12  OMITTED". With the margins numbered the number is in them;
       without, it is the text, because an OMITTED with no number says
       nothing. */
    const p = h('p.wr-pr.wr-pr-scene.wr-pr-omitted' + (row.blankBefore === 2 ? '.wr-pr-gap2' : ''), {
      text: opts.sceneNumbers ? 'OMITTED' : row.sceneNo + '  OMITTED'
    });
    if (row.blankBefore === 0) p.classList.add('wr-pr-tight');
    if (opts.sceneNumbers) {
      p.classList.add('wr-pr-numbered');
      p.append(
        h('span.wr-pr-sn.wr-pr-sn-l', { text: row.sceneNo }),
        h('span.wr-pr-sn.wr-pr-sn-r', { text: row.sceneNo })
      );
    }
    return p;
  }
  if (row.type === 'dual') {
    const node = h('div.wr-pr.wr-pr-dual');
    for (const col of row.cols) {
      const c = h('div.wr-pr-dcol');
      for (const r of col) {
        c.append(h('p.wr-pr.wr-pr-tight.wr-pr-d-' + r.type, { text: r.lines.join('\n') }));
      }
      node.append(c);
    }
    if (row.blankBefore === 0) node.classList.add('wr-pr-tight');
    return node;
  }
  const cls = PRINT_CLASS[row.type] || PRINT_CLASS.action;
  const p = h('p.wr-pr.' + cls + (row.blankBefore === 2 ? '.wr-pr-gap2' : ''), {
    text: row.lines.join('\n')
  });
  if (row.contd) p.classList.add('wr-pr-contd');
  if (row.blankBefore === 0 && row.type !== 'more') p.classList.add('wr-pr-tight');
  /* Scene numbers in both margins, for a shooting script. Off unless
     asked for: a spec script carries none, and our own PDF read back
     through the importer would otherwise grow a number on every
     heading. A shot never has one — it is not a scene. */
  if (opts.sceneNumbers && row.sceneNo) {
    p.classList.add('wr-pr-numbered');
    p.append(
      h('span.wr-pr-sn.wr-pr-sn-l', { text: row.sceneNo }),
      h('span.wr-pr-sn.wr-pr-sn-r', { text: row.sceneNo })
    );
  }
  return p;
}

/**
 * The screenplay as a document.
 *   meta: { title, revision, subtitle, sceneNumbers }
 * Returns a detached `div.wr-print`. write.js appends it for the
 * duration of one print job and throws it away on afterprint — a
 * second copy of the script living in the DOM is the "one
 * representation per thing" rule broken, and it would be the copy
 * that goes stale.
 */
export function buildDocument(doc, meta = {}) {
  const root = h('div.wr-print');
  root.append(titleSheet(doc, meta));

  const marked = markSet(meta.marks);
  const opts = { sceneNumbers: !!meta.sceneNumbers, marked };
  const pages = paginateDoc(doc);
  pages.forEach((rows, i) => {
    const revised = !!marked && rows.some((r) => rowMarked(r, marked));
    const sheet = h('section.wr-pg');
    if (revised) {
      sheet.classList.add('wr-pg-revised');
      if (meta.marks.tint && meta.marks.swatch) sheet.classList.add('wr-pg-tint', 'c-' + meta.marks.swatch);
      sheet.append(h('div.wr-pg-num.has-rev', {}, [
        h('span.wr-pg-rev', { text: String(meta.marks.label || 'Revised') }),
        h('span', { text: pageNumber(i) })
      ]));
    } else {
      sheet.append(h('div.wr-pg-num', { text: pageNumber(i) }));
    }
    for (const row of rows) sheet.append(rowNode(row, opts));
    root.append(sheet);
  });

  /* An empty script still gets a title page. It does not get a
     blank numbered sheet behind it, which reads as a bug. */
  return root;
}

/** How many sheets the script prints on, title page excluded. Pass
    the whole doc to count a locked script's OMITTED rows too. */
export function sheetCount(elements, numbering) {
  return numbering ? paginateDoc({ elements, numbering }).length : paginate(elements).length;
}

/** Which pages (0-based) carry a revised line. For the export's
    summary, and for a test that the marks land where the diff says. */
export function revisedPages(doc, ids) {
  const set = markSet({ ids });
  const out = [];
  paginateDoc(doc).forEach((rows, i) => { if (rows.some((r) => rowMarked(r, set))) out.push(i); });
  return out;
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
  if (row.omitted) return [row.sceneNo + '  OMITTED'];
  if (row.type === 'dual') return row.lines.slice();
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
  const tp = titlePageOf(doc, meta);
  if (tp) {
    /* The same layout as the PDF's, in lines: the title about a third
       of the way down a 54-line page, the contact block at its foot. */
    out.push(...Array(16).fill(''));
    out.push(centre(tp.title.toUpperCase()));
    if (tp.credit) out.push('', '', centre(tp.credit));
    if (tp.author) out.push('', centre(tp.author));
    if (tp.source) out.push('', '', centre(tp.source));
    const foot = [];
    const contact = tp.contact ? tp.contact.split('\n') : [];
    const right = [tp.draft, tp.date].filter(Boolean);
    const n = Math.max(contact.length, right.length);
    for (let k = 0; k < n; k++) {
      const l = (contact[k] || '').trim();
      const r = right[k] || '';
      foot.push((l.padEnd(Math.max(l.length + 1, TEXT_WIDTH - r.length)) + r).replace(/\s+$/, ''));
    }
    while (out.length + foot.length < PAGE_LINES - 2) out.push('');
    out.push(...foot);
  } else {
    out.push('', '', '', '', '', '', '', '', '', '');
    out.push(centre(title.toUpperCase()));
    out.push('', '');
    out.push(centre('Screenplay'));
    if (meta.author) { out.push(''); out.push(centre('by')); out.push(''); out.push(centre(String(meta.author))); }
    if (meta.revision) { out.push('', ''); out.push(centre(String(meta.revision))); }
    if (meta.date) { out.push(''); out.push(centre(String(meta.date))); }
  }

  const marked = markSet(meta.marks);
  const pages = paginateDoc(doc);
  pages.forEach((rows, i) => {
    out.push('\f');                                  // a real page break
    const num = pageNumber(i);
    const rev = marked && rows.some((r) => rowMarked(r, marked)) ? String(meta.marks.label || 'Revised') : '';
    const head = rev ? rev + (num ? '  ' + num : '') : num;
    out.push(head ? pad(Math.max(0, TEXT_WIDTH - head.length)) + head : '');
    out.push('');
    rows.forEach((row, j) => {
      for (let b = 0; b < (j === 0 ? 0 : row.blankBefore); b++) out.push('');
      const lines = textRow(row);
      /* The asterisk, two columns right of the 60-character measure,
         on the first line of a revised block. */
      if (marked && rowMarked(row, marked) && lines.length) {
        lines[0] = lines[0].padEnd(TEXT_WIDTH + 2) + '*';
      }
      out.push(...lines);
    });
  });

  /* No FADE OUT. is appended. Whether the script ends on one is a
     transition element the writer either typed or did not, and a
     file that adds one grows a second copy every time it is
     exported, imported and exported again. */
  return out.join('\n') + '\n';
}

export default {
  GEOMETRY, geometryOf, DUAL, PAGE_LINES, BODY_LINES,
  wrapText, printedText, paginate, paginateDoc, pageNumber, titlePageOf,
  buildDocument, sheetCount, revisedPages, toText
};
