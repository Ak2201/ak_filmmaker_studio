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

   ONE GEOMETRY, TWO RENDERERS. `paginate()` (src/lib/paginate.js,
   re-exported here) is the whole of the format. `buildDocument()` turns its pages into DOM for the
   print pipeline; `toText()` turns the same pages into a plain
   text file with real spaces. Neither knows the format — if they
   disagree, only one of them is wrong, and it is not the format.

   NO COLOURS, NO SHAPES. Everything visual is in styles/pdf.css
   and styles/write.css. The only literals here are character
   counts, which are the format itself.
   ============================================================ */
import { h } from './dom.js';
import { hasTitlePage, sceneNumbers } from './script.js';
/* The geometry and the paginator live in src/lib/paginate.js (pure, so
   the editor's live page view and Node share it); every name is
   re-exported here so no caller had to change. */
import {
  GEOMETRY, geometryOf, DUAL, PAGE_LINES, BODY_LINES,
  wrapText, printedText, paginate, autoContdIndices, pageIndex
} from './paginate.js';
export {
  GEOMETRY, geometryOf, DUAL, PAGE_LINES, BODY_LINES,
  wrapText, printedText, paginate, autoContdIndices, pageIndex
};

/** The script's own pages: its elements, numbered the way its lock
    (if any) says. Every renderer here, and the editor's page view,
    paginates through this, so a locked script cannot print one set of
    numbers and show another.
    `opts.autoContd` is paginate()'s automatic (CONT'D) — the page view
    and the print pass the Settings choice; the page LOCK never does, so
    a locked page records the script as written. */
export function paginateDoc(doc, opts = {}) {
  const els = (doc && doc.elements) || [];
  const auto = opts && opts.autoContd === true ? { autoContd: true } : null;
  if (!doc || !doc.numbering || doc.numbering.locked !== true) return paginate(els, auto || undefined);
  const plan = lockPlan(doc);
  return paginate(els, {
    ...auto,
    numbers: sceneNumbers(els, doc.numbering),
    ...(plan ? { breakBefore: plan.breakBefore, breakAfter: plan.breakAfter } : {})
  });
}

/* ------------------------------------------------------------
   LOCKED PAGES (A-pages)
   ------------------------------------------------------------
   A shooting script's PAGES are locked as well as its scenes: a crew
   holding page 34 must be able to swap in a revised page 34, not find
   that a line added on page 12 has moved everything after it. So the
   day pages are locked, the element each page starts with is recorded
   (`numbering.pages`, inside the script blob beside the scene lock —
   no new key):

     pages: { locked: true, at: ISO, starts: [{ n: '1', id, split }, …] }

   `split` is a page that began part-way through a speech or an action
   block. One long element can begin several pages; which of them a
   start is follows from its ORDER among that element's split starts
   (the k-th one is the k-th page the element runs onto), so the shape
   needs no extra field and a lock written before this was understood
   reads the same way. From then on paginateDoc() breaks before every
   unsplit start, and pageNumbersDoc() names the pages:
     · a page that begins where a locked page began keeps its number —
       and a split page whose element now ends sooner (an edit above it
       let more fit) begins at the next printed element instead, and
       keeps its number there;
     · a start whose element no longer prints (its text blanked) hands
       its page to the next element that does;
     · the numbers that survive must still run in order: a start that
       now sits out of sequence (its scene was moved) is new material
       where it stands, gets a letter, and forces no break;
     · a page that overflows after a numbered one is 12A, then 12B;
     · a locked number that no longer begins any page is folded into
       the LAST page before the next surviving number, which prints as
       a range: 12-13, or 12B-13 after lettered pages. A missing 1 (or
       any number below the first that survives) folds onto the first
       page: 1-2.
   Labels never go backwards.
   ------------------------------------------------------------ */
export function pagesLock(doc) {
  const p = doc && doc.numbering && doc.numbering.locked === true ? doc.numbering.pages : null;
  return p && p.locked === true && Array.isArray(p.starts) && p.starts.length ? p : null;
}

/** Where each page begins: { id, split, k } of its first row with an
    element. `k` counts a split element's pages: the first page it runs
    onto is 1, the next 2 (0 for an unsplit start). */
export function pageStarts(pages) {
  const seen = new Map();
  return (pages || []).map((rows) => {
    const row = rows.find((r) => r && r.id);
    if (!row) return { id: null, split: false, k: 0 };
    if (!row.cont) return { id: row.id, split: false, k: 0 };
    const k = (seen.get(row.id) || 0) + 1;
    seen.set(row.id, k);
    return { id: row.id, split: true, k };
  });
}

/** A record of the pages as they stand, for numbering.pages. */
export function lockPages(doc, at = new Date().toISOString()) {
  const starts = pageStarts(paginateDoc(doc)).map((s, i) => ({ n: String(i + 1), id: s.id, split: s.split }));
  return { locked: true, at, starts };
}

const startKey = (id, split, k) => (split ? id + '|s|' + k : id);

/* What the lock means for the elements as they stand now: the breaks
   paginate() must keep and the key each locked number answers to.
   null when nothing is locked. PURE. */
function lockPlan(doc) {
  const lock = pagesLock(doc);
  if (!lock) return null;
  const els = (doc && doc.elements) || [];
  const at = new Map();
  els.forEach((e, i) => { if (e && e.id && !at.has(e.id)) at.set(e.id, i); });
  const recorded = new Set(lock.starts.filter((s) => s.id).map((s) => s.id));
  const prints = (i) => !!printedText(els[i]);
  const nextPrinted = (i) => { for (let j = i; j < els.length; j++) if (prints(j)) return j; return -1; };
  /* Each start that still names an element, with where it sits now. */
  const counts = new Map();
  const cands = [];
  for (const s of lock.starts) {
    const num = parseInt(s.n, 10);
    if (!s.id || !at.has(s.id) || !Number.isFinite(num)) continue;
    if (s.split) {
      const k = (counts.get(s.id) || 0) + 1;
      counts.set(s.id, k);
      cands.push({ n: s.n, num, split: true, id: s.id, k, pos: at.get(s.id), sub: k });
      continue;
    }
    // a blanked start: its page begins at the next element that prints,
    // unless that element begins a locked page of its own
    const j = nextPrinted(at.get(s.id));
    if (j < 0) continue;
    const id = els[j].id;
    if (id !== s.id && recorded.has(id)) continue;
    cands.push({ n: s.n, num, split: false, id, k: 0, pos: j, sub: 0 });
  }
  /* The numbers must still run in order down the script: keep the
     longest run of starts whose numbers increase with their position
     (a moved scene's start falls out of it). */
  cands.sort((x, y) => x.pos - y.pos || x.sub - y.sub);
  const len = cands.map(() => 1), prev = cands.map(() => -1);
  for (let i = 0; i < cands.length; i++) {
    for (let j = 0; j < i; j++) {
      if (cands[j].num < cands[i].num && len[j] + 1 > len[i]) { len[i] = len[j] + 1; prev[i] = j; }
    }
  }
  let best = -1;
  len.forEach((l, i) => { if (best < 0 || l > len[best]) best = i; });
  const kept = [];
  for (let i = best; i >= 0; i = prev[i]) kept.unshift(cands[i]);

  const keys = new Map();
  const breakBefore = new Set();
  const breakAfter = new Map();
  for (const c of kept) {
    keys.set(startKey(c.id, c.split, c.k), c.n);
    if (!c.split) { breakBefore.add(c.id); continue; }
    if (c.k !== counts.get(c.id)) continue;
    /* The element's last recorded page: if it now breaks fewer times,
       the page that held its tail begins at the next printed element. */
    breakAfter.set(c.id, c.k);
    const j = nextPrinted(c.pos + 1);
    if (j >= 0 && !recorded.has(els[j].id)) keys.set(startKey(els[j].id, false, 0), c.n);
  }
  return { lock, keys, breakBefore, breakAfter };
}

const pageLetter = (k) => {
  let s = '';
  for (let n = k; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
};

/**
 * Every page's number as a label ('1', '12A', '12-13'). PURE.
 * Without a page lock the label is the position, as it always was.
 */
export function pageNumbersDoc(doc, pages = paginateDoc(doc)) {
  const plan = lockPlan(doc);
  if (!plan) return pages.map((_, i) => String(i + 1));
  const starts = pageStarts(pages);
  const labels = [];
  const nums = [];                 // the locked number a page kept, or null
  let last = 0, cur = '1', letters = 0;
  starts.forEach((s, i) => {
    const n = s.id ? plan.keys.get(startKey(s.id, s.split, s.k)) : null;
    const num = n ? parseInt(n, 10) : NaN;
    if (n && num > last) { last = num; cur = n; letters = 0; labels.push(n); nums.push(num); return; }
    if (i === 0) { last = 1; labels.push('1'); nums.push(1); return; }
    letters++;
    labels.push(cur + pageLetter(letters));
    nums.push(null);
  });
  /* A locked number that no longer begins a page is folded into the
     last page before the next number that does — after its A-pages,
     so the labels still run forward: 12B-13, then 14. One below the
     first surviving number folds onto the first page: 1-2. */
  const have = new Set(nums.filter((x) => x !== null));
  const folds = new Map();         // page index → numbers folded into it
  for (const s of plan.lock.starts) {
    const m = parseInt(s.n, 10);
    if (!Number.isFinite(m) || have.has(m)) continue;
    have.add(m);
    const j = nums.findIndex((x) => x !== null && x > m);
    const t = j > 0 ? j - 1 : j === 0 ? 0 : labels.length - 1;
    if (t >= 0) folds.set(t, [...(folds.get(t) || []), m]);
  }
  folds.forEach((ms, t) => {
    const own = nums[t];
    if (own === null) { labels[t] = labels[t] + '-' + Math.max(...ms); return; }
    labels[t] = Math.min(own, ...ms) + '-' + Math.max(own, ...ms);
  });
  return labels;
}

/** The printed page number, a full stop after it. The first page is
    never numbered — that is the convention — and that holds when it
    carries a folded range too: a first page that is now 1-2 prints
    nothing, as page 1 did. */
export const pageLabelPrinted = (label, i) => (i === 0 || !label ? '' : String(label) + '.');

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
 *   meta: { title, revision, subtitle, sceneNumbers, autoContd }
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
  const pages = paginateDoc(doc, { autoContd: meta.autoContd === true });
  const labels = pageNumbersDoc(doc, pages);
  pages.forEach((rows, i) => {
    const revised = !!marked && rows.some((r) => rowMarked(r, marked));
    const sheet = h('section.wr-pg');
    if (revised) {
      sheet.classList.add('wr-pg-revised');
      if (meta.marks.tint && meta.marks.swatch) sheet.classList.add('wr-pg-tint', 'c-' + meta.marks.swatch);
      sheet.append(h('div.wr-pg-num.has-rev', {}, [
        h('span.wr-pg-rev', { text: String(meta.marks.label || 'Revised') }),
        h('span', { text: pageLabelPrinted(labels[i], i) })
      ]));
    } else {
      sheet.append(h('div.wr-pg-num', { text: pageLabelPrinted(labels[i], i) }));
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
  const pages = paginateDoc(doc, { autoContd: meta.autoContd === true });
  const labels = pageNumbersDoc(doc, pages);
  pages.forEach((rows, i) => {
    out.push('\f');                                  // a real page break
    const num = pageLabelPrinted(labels[i], i);
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
  pagesLock, pageStarts, lockPages, pageNumbersDoc, pageLabelPrinted,
  buildDocument, sheetCount, revisedPages, toText
};
