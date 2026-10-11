/* ============================================================
   SCRIPT IMPORT — the inverse of the export
   ------------------------------------------------------------
   CLAUDE.md open item 4: "Export exists; import does not, so the
   tool can't be used on a project in flight." Somebody with a
   finished draft cannot adopt this studio at all, which makes
   this the one missing piece that decides whether the rest of it
   is reachable.

   WHAT "THE REQUIRED SPACE" MEANS. A script that lands in one
   textarea has not been imported, it has been pasted. An import
   fills the two models the rest of the app is a view of:

     · src/lib/script.js  — typed elements. Six kinds of line,
       each knowing which kind it is, so the page count, the
       screenplay PDF and the Fountain export all work on it.
     · src/lib/scenes.js  — a scene row per slug line, with
       INT/EXT, time of day, location, number and length. This
       is what the breakdown, the stripboard, the day out of
       days, the reports and the budget all read. An import that
       fills the screenplay and leaves the scene list empty has
       done half the job and the half nobody notices.

   THIS MODULE WRITES NOTHING. `parseScript()` returns a plan;
   the page shows it and the user chooses. Every decision that
   touches stored work — replace or append, take a revision
   first — is made by src/pages/write.js after a click. A parser
   that saves is a parser that cannot be previewed.

   NOTHING LEAVES THE BROWSER. A dropped file is read with
   FileReader. There is no upload and no network call anywhere in
   this file.

   NO LINE IS EVER DROPPED. A line the parser cannot classify
   becomes action and is counted in `warnings`. Losing a line of
   somebody's script quietly is the worst thing this file could
   do, and "it was probably a page number" is not a good enough
   reason to do it — the only lines discarded are the ones we can
   name (page numbers, (MORE), Fountain notes and boneyard), and
   each discard is counted so the total adds up in the preview.
   ============================================================ */
import { blankElement } from './script.js';
import { INT_EXT, DAY_NIGHT, blankScene } from './scenes.js';
import { elementLines, totalLines, LINES_PER_PAGE } from './script.js';
import { sliceScript } from './screenplay-analysis.js';

export const FORMATS = [
  { id: 'fountain', label: 'Fountain', ext: ['.fountain', '.spmd'] },
  { id: 'text',     label: 'Screenplay text', ext: ['.txt'] },
  { id: 'fdx',      label: 'Final Draft', ext: ['.fdx'] },
  /* The one a script actually arrives as. It has no parser of its
     own: src/lib/pdf-text.js turns the page back into indented
     text and PARSER 2 reads it, because a PDF's columns and a
     screenplay text file's columns are the same columns. Two
     classifiers for one layout would be two places to disagree. */
  { id: 'pdf',      label: 'PDF screenplay', ext: ['.pdf'] }
];

/* The file picker's `accept`. write.js sets the attribute from this
   once the parser has loaded — it renders before the lazy import
   resolves, so it starts with a literal and is corrected. This is
   the source; the literal there is a first guess. */
export const ACCEPT = '.fountain,.spmd,.txt,.fdx,.xml,.pdf,text/plain,application/pdf';

/** Which parser a file wants. The extension decides, and the
    content breaks the tie when there isn't one — a .txt that
    opens with an XML declaration is a Final Draft file somebody
    renamed, and guessing right costs nothing. */
export function detectFormat(filename, text) {
  const name = String(filename || '').toLowerCase();
  const head = String(text || '').slice(0, 400);
  /* A PDF is decided by the name and by its header, and never by
     its content: by the time this is called the bytes have already
     been turned into indented text by pdf-text.js, so the content
     test would say "screenplay text" and the preview would claim
     the wrong source. */
  if (name.endsWith('.pdf') || /^%PDF-/.test(head)) return 'pdf';
  if (/^\s*<\?xml/.test(head) && /FinalDraft/i.test(head)) return 'fdx';
  if (name.endsWith('.fdx') || name.endsWith('.xml')) return 'fdx';
  if (name.endsWith('.fountain') || name.endsWith('.spmd')) return 'fountain';
  if (name.endsWith('.txt')) return looksIndented(head) ? 'text' : 'fountain';
  // A paste has no filename. Indentation is the tell: a Fountain
  // file is flush left by definition, a screenplay text file is not.
  return looksIndented(String(text || '')) ? 'text' : 'fountain';
}

function looksIndented(text) {
  const lines = String(text || '').split('\n').filter((l) => l.trim());
  if (!lines.length) return false;
  const indented = lines.filter((l) => /^ {6,}\S/.test(l)).length;
  return indented / lines.length > 0.15;
}

/* ------------------------------------------------------------
   SHARED VOCABULARY
   ------------------------------------------------------------ */
/* A slug line may wear its scene number on the front. Final Draft's
   own text export writes "12  INT. KITCHEN - DAY  12", and a script
   that has been through a production office almost always does.
   Without the optional prefix that line matches nothing, is not a
   scene heading, and the scene it opens does not exist in the
   breakdown — the number was the reason the line stopped looking
   like a slug. `parseSlug` takes the number off again.

   The prefix is digits with at most one letter on either side (12,
   12A, A12), and it must be followed by INT/EXT — which is what
   keeps "5 EXTREMELY LOUD" out: EXT there is followed by R. */
const SCENE_NO  = String.raw`[A-Za-z]?\d+[A-Za-z]?`;
const SLUG_RE   = new RegExp(
  '^(?:' + SCENE_NO + '[.)]?\\s+)?(INT|EXT|EST|I\\/E|INT\\.?\\s*\\/\\s*EXT|EXT\\.?\\s*\\/\\s*INT|உள்|வெளி)[.\\s]', 'i');
/* Case-SENSITIVE on purpose: "Back to the car she runs." and "Cut to the
   chase…" are action. A transition is capitals — see isTransitionLine. */
const TRANS_RE  = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|DISSOLVE TO|WIPE TO|IRIS (IN|OUT)|TIME CUT|INTERCUT|BACK TO|JUMP CUT|FADE TO BLACK)\b/;
/* A shot, recognised by the words it opens with. Neither Fountain nor
   a plain text file has a shot element, so a one-line, flush-left,
   all-capitals line that STARTS with one of these is read as a shot
   and anything else in capitals stays action. The list is the camera
   vocabulary a writer actually types, not every term of art — a line
   that is not on it loses nothing, it just comes back as action. */
const SHOT_RE   = /^(CLOSE ON|CLOSE UP|CLOSE-UP|CLOSER ON|EXTREME CLOSE|ECU\b|ANGLE ON|ANOTHER ANGLE|NEW ANGLE|REVERSE ANGLE|REVERSE ON|WIDE ON|WIDE SHOT|WIDER|MEDIUM SHOT|TWO SHOT|TWO-SHOT|OVER THE SHOULDER|OTS\b|POV\b|.{1,40}'S POV\b|INSERT\b|BACK ON|ON THE\b|AERIAL|TRACKING|MOVING SHOT|ESTABLISHING|UNDERWATER|HIGH ANGLE|LOW ANGLE|FAVOU?RING|PUSH IN|PULL BACK|SERIES OF SHOTS|MONTAGE)/;
const isShotLine = (t) => SHOT_RE.test(t) && isUpperish(t) && !ENDS_TO.test(t) && !/^\(/.test(t);
const ENDS_TO   = /\bTO:\s*$/;
const CUE_OK    = /^[^a-z]*$/;                       // no lowercase letters at all
/* Any parenthetical extension on a cue — (V.O.), (O.S.), (whispering),
   and several in a row. The extension is the writer's, so its case is too. */
const EXT_TAIL  = /(?:\s*\([^()]*\))+\s*$/;
const PAGE_NO   = /^\s*\d+[.)]?\s*$/;
const MORE_LINE = /^\s*\(\s*MORE\s*\)\s*$/i;
/* Page furniture, in the forms it actually appears in: CONTINUED,
   (CONTINUED), CONTINUED: and (CONTINUED:). The trailing colon is
   what Final Draft's own text export writes at the foot of a page
   and it was not matched, so one line of furniture per page came
   through as an action line. */
const CONTINUED = /^\s*\(?\s*(?:CONTINUED|CONT['’]?D)\s*:?\s*(?:\(\s*\d+\s*\)|\d+)?\s*\)?\s*:?\s*$/i;
/* A revision header at the top of a revised page: "Blue Rev. 03/04/26",
   "Pink Revised 03/05/26", or a bare "Rev. 03/04/26". It is page
   furniture, never a character. A bare "Revised plans lie on the
   table." is NOT matched — the colour or a date has to be there. */
const REV_HEADER = /^(?:(?:white|blue|pink|yellow|green|goldenrod|buff|salmon|cherry|tan|gray|grey|ivory)\s+rev(?:\.|ision|ised)?\b.{0,30}|rev(?:\.|ision|ised)\s+\d[\d/.\-\s]*|revised\s{0,4}(?:\d+[.)]?)?)$/i;

const TAMIL = /[஀-௿]/;
/* A Tamil cue is not uppercase Latin, so "no lowercase letters" proves
   nothing about it — every Tamil sentence passes. The shape has to
   stand in: a name is short and does not end like a sentence. */
const tamilCueOk = (t) => t.split(/\s+/).filter(Boolean).length <= 3
  && t.length <= 30 && !/[.!?।…]$/.test(t);

const isUpperish = (s) => {
  const t = String(s).replace(EXT_TAIL, '').trim();
  if (!t || !CUE_OK.test(t) || !/[A-Z஀-௿]/.test(t)) return false;
  return TAMIL.test(t) ? tamilCueOk(t) : true;
};

/** A transition is CAPITALS, and either ends in TO: or opens with a
    known one (FADE OUT., CUT TO BLACK.) and stays short. */
const isTransitionLine = (t) => {
  const s = String(t).trim();
  return !/[a-z]/.test(s) && s.split(/\s+/).length <= 6
    && (ENDS_TO.test(s) || TRANS_RE.test(s));
};

/** Could this line be a cue on its own — capitals, an optional
    extension and `^`, not a heading, transition or sentence? */
function isCueLine(line) {
  const t = String(line).trim().replace(/\s*\^\s*$/, '');
  const base = t.replace(EXT_TAIL, '').trim();
  if (!base || base.length > 40 || SLUG_RE.test(t) || isTransitionLine(t)) return false;
  if (/[.!?:]$/.test(base) && !/^(MR|MRS|MS|DR|ST|JR|SR)\.$/.test(base.split(' ').pop())) return false;
  return isUpperish(t);
}

/* A Tamil cue is not uppercase Latin and never will be —
   `CUE_OK` passes it because it contains no lowercase letters,
   which is the only test that works across both scripts. The
   Fountain exporter in script.js forces such a cue with `@` for
   exactly this reason, and the parser below honours that first. */

/* ------------------------------------------------------------
   PARSER 1 — FOUNTAIN
   ------------------------------------------------------------
   The subset that real files and this app's own exporter use.
   `.` `!` `@` `>` are the forcing characters and are checked
   before any heuristic, because that is what forcing means.
   ------------------------------------------------------------ */
const TITLE_KEYS = new Set(['title', 'credit', 'author', 'authors', 'source', 'draft date',
  'date', 'contact', 'copyright', 'notes', 'revision', 'draft', 'written by']);

function parseFountain(raw) {
  const warnings = [];
  const skipped = { notes: 0, sections: 0, titlePage: 0, pageBreaks: 0 };

  let text = String(raw || '').replace(/\r\n?/g, '\n');
  // Boneyard and notes are comments, not script.
  text = text.replace(/\/\*[\s\S]*?\*\//g, (m) => { skipped.notes += m.split('\n').length; return ''; });
  text = text.replace(/\[\[[\s\S]*?\]\]/g, () => { skipped.notes += 1; return ''; });

  const lines = text.split('\n');

  /* The title page is the run of `Key: value` lines before the
     first blank line. It is metadata, not script — it is counted
     and reported, never silently eaten. */
  const meta = {};
  let i = 0;
  /* Only a KNOWN title key opens a title page. "FADE IN:" matches the
     shape of `Key: value` and used to be eaten as one. */
  const firstKey = (lines[0] || '').match(/^([A-Za-z][A-Za-z ]*):/);
  if (firstKey && TITLE_KEYS.has(firstKey[1].trim().toLowerCase())) {
    let last = null;
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { i++; break; }
      /* A value may run on: Fountain indents every further line of a
         multi-line value (a contact block, two authors). Without this
         the second line stopped the title page and fell into the
         script as its first action line. */
      if (last && /^(\s{2,}|\t)\S/.test(line)) {
        meta[last] = (meta[last] ? meta[last] + '\n' : '') + line.trim();
        skipped.titlePage++;
        continue;
      }
      const m = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
      if (!m) break;
      last = m[1].trim().toLowerCase();
      meta[last] = m[2].trim();
      skipped.titlePage++;
    }
  }

  const elements = [];
  const push = (type, t, extra) => {
    const clean = String(t).trim();
    if (!clean) return;
    elements.push(blankElement({ type, text: clean, ...(extra || {}) }));
  };

  // Blocks are separated by blank lines; a block may hold a whole
  // speech (cue, parenthetical, dialogue) with no blank line in it.
  const blocks = [];
  let block = [];
  for (; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { if (block.length) blocks.push(block); block = []; continue; }
    block.push(line);
  }
  if (block.length) blocks.push(block);

  for (const b of blocks) {
    const first = b[0].trim();

    /* A section is `#` followed by a space or more `#`; "#1 on the list"
       is action. `===` alone is a page break; `= text` a synopsis. */
    if (/^#+(\s|$)/.test(first)) { skipped.sections += b.length; continue; }
    if (/^={3,}\s*$/.test(first)) { skipped.pageBreaks += b.length; continue; }
    if (/^=(\s|$)/.test(first)) { skipped.sections += b.length; continue; }

    // --- forced ---
    if (first.startsWith('.') && !first.startsWith('..')) {
      push('scene', first.slice(1));
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    // Every `!` is one line's forcing mark, not just the block's first.
    if (first.startsWith('!')) { push('action', b.map((l) => l.trim().replace(/^!/, '')).join('\n')); continue; }
    if (first.startsWith('>')) {
      const centred = /<\s*$/.test(first);
      const body = first.replace(/^>\s*/, '').replace(/\s*<\s*$/, '');
      push(centred ? 'action' : 'transition', body);
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    if (first.startsWith('@') && nameLike(first.slice(1)) && (b.length > 1 || first.length <= 40)) {
      emitSpeech(b, first.slice(1), push);
      continue;
    }

    // --- inferred ---
    if (SLUG_RE.test(first)) {
      push('scene', first);
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    if (b.length === 1 && isTransitionLine(first)) {
      push('transition', first);
      continue;
    }
    if (b.length > 1 && isUpperish(first) && !ENDS_TO.test(first)) {
      emitSpeech(b, first, push);
      continue;
    }
    if (b.length === 1 && isShotLine(first)) { push('shot', first); continue; }
    if (b.length === 1 && isUpperish(first) && !ENDS_TO.test(first)) {
      /* An all-caps single line with nothing under it is action
         that shouts — a title card, a sign. Fountain says a cue
         needs something after it, so this is action, and the
         count says we made a judgement. */
      push('action', first);
      warnings.push('“' + first.slice(0, 48) + '” was read as action, not a character cue — nothing followed it.');
      continue;
    }
    if (emitMixed(b, push, warnings)) continue;
    push('action', b.join('\n'));
  }

  return { elements, meta, warnings, skipped };
}

/** The lines under a forced slug or transition in the same block.
    Rare, and always action — unless they are a pasted script with no
    blank lines in it, in which case the cues are found in them. */
function restAsAction(rest, push, warnings) {
  const lines = rest.map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return;
  if (emitMixed(lines, push, warnings)) return;
  push('action', lines.join('\n'));
  warnings.push('Lines under a scene heading with no blank line between them were read as action.');
}

/** "@name" is a cue only when it looks like a name: a letter first,
    short, no sentence ending. "@home is where the heart is, he says." is
    a line of action that happens to begin with an @. */
function nameLike(s) {
  const t = String(s).trim().replace(/\s*\^\s*$/, '').replace(EXT_TAIL, '').trim();
  return t.length > 0 && t.length <= 40 && /^[\p{L}\p{N}]/u.test(t)
    && !/[.!?।]$/.test(t) && t.split(/\s+/).length <= 5;
}

/** Does line j of a block open a speech? A cue-shaped line with a
    mixed-case (or parenthetical) line under it, or a forced @ one. */
function cueAt(lines, j) {
  const t = lines[j].trim();
  const next = (lines[j + 1] || '').trim();
  if (!next) return false;
  if (t.startsWith('@')) return nameLike(t.slice(1));
  return isCueLine(t) && !TAMIL.test(t) && (/[a-z]/.test(next) || /^\(.*\)$/.test(next));
}

/** A block with cue-shaped lines INSIDE it — a script pasted with no
    blank lines — is walked line by line: before a cue is action, a cue
    opens speech, speech runs to the next cue or heading. Returns false
    (and emits nothing) when the block has none, so every ordinary block
    keeps the rules it had. */
function emitMixed(lines, push, warnings) {
  let any = false;
  for (let j = 0; j < lines.length; j++) if (cueAt(lines, j)) { any = true; break; }
  if (!any) return false;
  let mode = 'action';
  let buf = [];
  const flush = () => {
    if (buf.length) push(mode === 'speech' ? 'dialogue' : 'action', buf.join('\n'));
    buf = [];
  };
  for (let j = 0; j < lines.length; j++) {
    const t = lines[j].trim();
    if (cueAt(lines, j)) {
      flush();
      const raw = t.replace(/^@/, '');
      const dual = /\^\s*$/.test(raw);
      push('character', raw.replace(/\s*\^\s*$/, ''), dual ? { dual: true } : null);
      mode = 'speech';
      continue;
    }
    if (SLUG_RE.test(t)) { flush(); push('scene', t); mode = 'action'; continue; }
    if (mode === 'speech' && /^\(.*\)$/.test(t)) { flush(); push('paren', t); continue; }
    buf.push(t);
  }
  flush();
  warnings.push('A block with no blank lines in it held cues and dialogue; they were split apart by their shape.');
  return true;
}

/** A speech block, or — when it holds a second cue or a heading with no
    blank line before it — the mixed walk. */
function emitSpeech(b, cueLine, push) {
  const lines = b.map((l, k) => (k === 0 ? cueLine : l));
  let inner = false;
  for (let j = 1; j < lines.length; j++) {
    if (cueAt(lines, j) || SLUG_RE.test(lines[j].trim())) { inner = true; break; }
  }
  if (inner) {
    const w = [];
    // Force the first line to be read as a cue: emitMixed tests it like any other.
    const first = lines[0].trim();
    lines[0] = '@' + first;
    if (emitMixed(lines, push, w)) return;
  }
  speech(b, cueLine, push);
}

/** A speech block: the cue, then parentheticals and dialogue. */
function speech(b, cueLine, push) {
  /* A trailing ^ is Fountain's dual-dialogue mark: this speech sits
     beside the one before it. It becomes the `dual` flag on the cue
     (src/lib/script.js) and comes off the text. */
  const dual = /\^\s*$/.test(cueLine);
  push('character', cueLine.replace(/\s*\^\s*$/, ''), dual ? { dual: true } : null);
  let buffer = [];
  const flush = () => { if (buffer.length) { push('dialogue', buffer.join('\n')); buffer = []; } };
  for (const line of b.slice(1)) {
    const t = line.trim();
    if (!t) continue;
    if (/^\(.*\)$/.test(t)) { flush(); push('paren', t); continue; }
    buffer.push(t);
  }
  flush();
}

/* ------------------------------------------------------------
   PARSER 2 — SCREENPLAY TEXT
   ------------------------------------------------------------
   Indentation is the format. A plain screenplay text file puts a
   cue at column 22, a parenthetical at 16, dialogue at 10 and
   action at 0 — the same columns src/lib/screenplay-export.js
   writes, because they are the same columns Courier has always
   had. So the parser classifies line by line on the indent and
   then REJOINS consecutive lines of one kind, which is what
   undoes the wrap the exporter applied.

   THE LEFT MARGIN IS NOT ALWAYS COLUMN ZERO. This studio's text
   export writes action flush left, because the sheet's 1.5in
   gutter belongs to the page setup. Plenty of other applications
   bake the gutter into the file, so every line arrives 10 or 15
   spaces further right — and to a parser reading absolute columns
   that file is a screenplay with no action in it at all, because
   action at column 15 tests as dialogue and dialogue at 25 tests
   as a character cue. The whole document comes back as one long
   conversation.

   The slug lines say where the margin is. They are flush against
   it in every layout there has ever been, and this parser can
   recognise one by its words rather than its position, so the most
   common slug indent IS column zero and every other indent is read
   relative to it. A file already flush left measures zero and
   nothing changes — our own export round-trips byte for byte
   either way. A file with no recognisable slug line is left alone
   rather than shifted on a guess.

   WHAT IS STILL A GUESS. Everything else here. The columns below
   are the common ones, not a standard: a script typed with a
   two-space dialogue indent, or one whose cues are not uppercase,
   or a novel someone saved as .txt, will come back with lines of
   the wrong type. They will all come back — nothing is dropped —
   and the type of any line can be changed in the editor. This
   parser is a good first pass over a plain text file, and calling
   it more than that would be a lie a user finds out about on page
   forty.
   ------------------------------------------------------------ */
function parseText(raw) {
  const warnings = [];
  const skipped = { pageNumbers: 0, more: 0, continued: 0, titlePage: 0, revisions: 0 };
  let text = String(raw || '').replace(/\r\n?/g, '\n');

  /* A title page is centred, which to an indent-based parser looks
     exactly like a column of character cues — and that is how the
     studio's own text export came back, with UNTITLED and the draft
     date as two people who never speak.

     The form feed settles it. A screenplay text file that has page
     breaks starts its first page after the first one, so everything
     before it is front matter. A file with no form feeds is left
     entirely alone: guessing at a title page in a file that may not
     have one is how the first line of somebody's script disappears. */
  const ff = text.indexOf('\f');
  if (ff >= 0) {
    const front = text.slice(0, ff);
    if (looksLikeTitlePage(front)) {
      skipped.titlePage = front.split('\n').filter((l) => l.trim()).length;
      text = text.slice(ff);
      if (skipped.titlePage) {
        warnings.push(skipped.titlePage + ' title-page line(s) before the first page break '
          + 'were read as front matter, not as script.');
      }
    }
  }

  /* A page break, a page number, (MORE), CONTINUED and a revision header
     are all furniture. They are dropped, but each leaves a `pb` marker so
     a speech the break cut in two can be put back together. */
  const rows = [];
  for (let line of text.split('\n')) {
    if (line.includes('\f')) { rows.push({ pb: true }); line = line.replace(/\f/g, ''); if (!line.trim()) { rows.push(null); continue; } }
    const t = line.trim();
    if (!t) { rows.push(null); continue; }              // a blank is a separator
    if (PAGE_NO.test(line)) { skipped.pageNumbers++; rows.push({ pb: true }); continue; }
    if (MORE_LINE.test(line)) { skipped.more++; rows.push({ pb: true }); continue; }
    if (CONTINUED.test(line)) { skipped.continued++; rows.push({ pb: true }); continue; }
    if (REV_HEADER.test(t)) { skipped.revisions++; rows.push({ pb: true }); continue; }
    const indent = line.match(/^ */)[0].length;
    rows.push({ indent, text: t });
  }

  /* Re-origin on the slug lines, then every column below is read
     from the page's own left margin rather than from the file's. */
  const margin = leftMargin(rows);
  if (margin) {
    for (const row of rows) { if (row && !row.pb) row.indent = Math.max(0, row.indent - margin); }
    warnings.push('Every line in that file sits ' + margin + ' spaces in from the left. '
      + 'The scene headings were taken as the left margin and the other indents read from there.');
  }

  const classify = (row, prev) => {
    const { indent, text } = row;
    if (SLUG_RE.test(text)) return 'scene';
    if (isTransitionLine(text) && indent < 6) return 'transition';
    if (isUpperish(text) && (ENDS_TO.test(text) || indent >= 40)) return 'transition';
    if (indent < 6 && isShotLine(text)) return 'shot';
    if (/^\(.*\)$/.test(text) && indent >= 8) return 'paren';
    if (indent >= 18 && isUpperish(text)) return 'character';
    if (indent >= 6) {
      // Under a cue or a parenthetical, an indented line is speech.
      if (prev === 'character' || prev === 'paren' || prev === 'dialogue') return 'dialogue';
      /* Only a short, name-shaped Tamil line can be a cue; a sentence at
         cue indent is a centred line of something, never a speaker. */
      return indent >= 18 && !TAMIL.test(text) ? 'character' : 'dialogue';
    }
    return 'action';
  };

  const elements = [];
  let open = null;                                       // { type, lines[], dual, contd, breakBefore }
  let rejoin = false;
  const speakerOf = (t) => String(t).replace(/\s*\([^)]*\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();
  /* Is the last thing said, before a page break, by this speaker? */
  const sameSpeakerAsLast = (name) => {
    let k = elements.length - 1;
    if (k < 0 || (elements[k].type !== 'dialogue' && elements[k].type !== 'paren')) return false;
    while (k >= 0 && (elements[k].type === 'dialogue' || elements[k].type === 'paren')) k--;
    return k >= 0 && elements[k].type === 'character' && speakerOf(elements[k].text) === speakerOf(name);
  };
  const close = () => {
    if (!open) return;
    const text = open.lines.join(' ').replace(/\s+/g, ' ').trim();
    const o = open;
    open = null;
    /* (CONT'D) is the page break's own mark on a cue. When the same
       speaker was talking just before the break, this is the rest of
       THAT speech: the cue is dropped and the dialogue rejoined. */
    if (o.type === 'character' && o.contd && o.breakBefore && sameSpeakerAsLast(text)) {
      rejoin = true;
      return;
    }
    const merge = rejoin && o.type === 'dialogue' && elements.length && elements[elements.length - 1].type === 'dialogue';
    rejoin = false;
    if (merge) {
      const last = elements[elements.length - 1];
      elements[elements.length - 1] = blankElement({ type: 'dialogue', text: last.text + ' ' + text });
      return;
    }
    elements.push(blankElement(o.type === 'character' && o.dual ? { type: o.type, text, dual: true } : { type: o.type, text }));
  };

  let prevType = null;
  let pendingBreak = false;
  for (const row of pairDual(rows)) {
    if (!row) { close(); prevType = null; continue; }
    if (row.pb) { pendingBreak = true; continue; }
    const type = classify(row, prevType);
    /* A cue and its parenthetical and its dialogue sit under each
       other with no blank line, so a change of kind ends the
       element even mid-block. Same kind continues it, which is
       how a wrapped paragraph comes back as one paragraph. */
    if (open && (open.type !== type || row.dual)) close();
    if (!open) open = { type, lines: [], dual: !!row.dual, contd: false, breakBefore: pendingBreak };
    pendingBreak = false;
    // (CONT'D) belongs to a cue; on any other line it is the writer's words.
    if (type === 'character' && CUE_TAIL_ONLY_CONTD.test(row.text)) open.contd = true;
    open.lines.push(type === 'character' ? row.text.replace(CUE_TAIL_ONLY_CONTD, '') : row.text);
    prevType = type;
    /* A cue is always one line. Anything after it is the speech. */
    if (type === 'scene' || type === 'character' || type === 'transition' || type === 'paren' || type === 'shot') close();
  }
  close();

  if (skipped.pageNumbers) {
    warnings.push(skipped.pageNumbers + ' page number line(s) were recognised and skipped.');
  }
  if (skipped.more || skipped.continued) {
    warnings.push((skipped.more + skipped.continued) + ' page-break line(s) — (MORE) and CONTINUED — '
      + 'were recognised and skipped; the speeches they interrupted were rejoined.');
  }
  return { elements, meta: {}, warnings, skipped };
}

/** Is what precedes the first form feed a title page? Only when it has
    no scene heading, no cue with speech under it, and is mostly short
    centred lines or the words a title page uses. Page 1 of a script that
    simply has a form feed after it is script. */
function looksLikeTitlePage(front) {
  const lines = front.split('\n').filter((l) => l.trim());
  if (!lines.length) return false;
  if (lines.some((l) => SLUG_RE.test(l.trim()) || isTransitionLine(l.trim()))) return false;
  const ind = (l) => l.match(/^ */)[0].length;
  for (let i = 0; i < lines.length - 1; i++) {
    const t = lines[i].trim();
    if (isUpperish(t) && ind(lines[i]) >= 18 && ind(lines[i + 1]) >= 6 && ind(lines[i + 1]) < ind(lines[i])
      && /[a-z]/.test(lines[i + 1]) && /[.,!?]\s*$/.test(lines[i + 1])) return false;
  }
  const TITLEISH = /\b(written by|screenplay|teleplay|story by|based on|draft|copyright|contact|revision|rev\.|by)\b|©|\d{4}|@/i;
  const titleish = lines.filter((l) => ind(l) >= 10 || TITLEISH.test(l) || /^[^a-z]+$/.test(l.trim())).length;
  return lines.length <= 30 && titleish / lines.length >= 0.5
    && lines.every((l) => l.trim().length <= 70);
}

/** Two cues side by side on one line — "JOHN        MARY", three or more
    spaces between — are a dual-dialogue pair, and the speech under them
    is two columns on the same lines. Rewrites that group of rows as the
    two speeches it is: left first, right second with `dual` set.
    Everything else passes through untouched. */
function pairDual(rows) {
  const out = [];
  const cols = (row) => {
    const parts = [];
    const re = /\S+(?:\s{1,2}\S+)*/g;
    let m;
    while ((m = re.exec(row.text))) parts.push({ col: row.indent + m.index, text: m[0] });
    return parts;
  };
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const head = row && !row.pb && row.indent >= 6 ? cols(row) : null;
    if (!head || head.length !== 2 || !head.every((p) => p.text.length <= 36 && !SLUG_RE.test(p.text) && !isTransitionLine(p.text) && isUpperish(p.text))) {
      out.push(row);
      continue;
    }
    const mid = (head[0].col + head[1].col) / 2 - 12;
    const left = [{ indent: 20, text: head[0].text }];
    const right = [{ indent: 20, text: head[1].text, dual: true }];
    let j = i + 1;
    for (; j < rows.length && rows[j] && !rows[j].pb; j++) {
      const parts = cols(rows[j]);
      if (parts.length < 2 && rows[j].indent < 6) break;
      const put = (side, p) => side.push({ indent: /^\(.*\)$/.test(p.text) ? 16 : 10, text: p.text });
      if (parts.length >= 2) { put(left, parts[0]); put(right, parts[parts.length - 1]); }
      else put(parts[0].col >= mid ? right : left, parts[0]);
    }
    out.push(...left, ...right);
    i = j - 1;
  }
  return out;
}

/** Where the page's left margin is, in columns, measured from the
    scene headings — which sit on it in every layout. The most
    common slug indent wins, so one stray heading cannot move the
    whole document; a file with no recognisable heading, or one
    whose headings are already flush left, measures 0 and the
    caller changes nothing.

    Capped at 30. Past that the "margin" is not a margin, it is a
    centred title page or a file this parser has misread, and
    shifting a whole script by 40 columns on that reading would
    turn every action line into dialogue — the exact failure this
    is here to prevent, inverted. */
const MAX_MARGIN = 30;
function leftMargin(rows) {
  const counts = new Map();
  for (const row of rows) {
    if (!row || row.pb || !SLUG_RE.test(row.text)) continue;
    counts.set(row.indent, (counts.get(row.indent) || 0) + 1);
  }
  if (!counts.size) return 0;
  let best = 0;
  let bestN = 0;
  for (const [indent, n] of counts) {
    // A tie goes to the smaller indent: the margin is the leftmost
    // column the headings agree on, never further right than one.
    if (n > bestN || (n === bestN && indent < best)) { best = indent; bestN = n; }
  }
  return best > 0 && best <= MAX_MARGIN ? best : 0;
}

/* Only (CONT'D) is stripped from a cue — (V.O.) and (O.S.) are
   performance instructions and belong to the writer. */
const CUE_TAIL_ONLY_CONTD = /\s*\(\s*CONT'?D\s*\)\s*$/i;

/* ------------------------------------------------------------
   PARSER 3 — FINAL DRAFT (.fdx)
   ------------------------------------------------------------
   An .fdx is XML, and a browser already has an XML parser, so
   this costs no dependency at all: `DOMParser` reads
   <Paragraph Type="…"><Text>…</Text></Paragraph> and the Type
   attribute is the element type, already decided by whoever
   wrote the script. That makes it the most reliable of the three
   parsers here and the only one that does not guess.

   THE SCENE NUMBER IS AN ATTRIBUTE, NOT TEXT. Final Draft keeps a
   locked scene number on the paragraph —
   <Paragraph Type="Scene Heading" Number="12"> — and leaves the
   heading text itself as "INT. KITCHEN - DAY". Reading only the
   text therefore gives every scene its ordinal, so a script whose
   writer says scene 47 arrives in this studio as scene 12, and the
   stripboard, the sides, the call sheet and the shot list all
   inherit the wrong one. Two vocabularies on one production is a
   worse failure than a missed import, because it looks like it
   worked.

   Numbers are STRINGS. Real files carry 12A (an insert cut in
   after 12) and A12 (one cut in before it); `Number(x)` on either
   is NaN, and `parseInt` silently turns A12 into nothing and 12A
   into 12. Nothing here coerces.
   ------------------------------------------------------------ */
const FDX_TYPE = {
  'scene heading': 'scene',
  'action': 'action',
  'character': 'character',
  'parenthetical': 'paren',
  'dialogue': 'dialogue',
  'transition': 'transition',
  'shot': 'shot',
  'general': 'action'
};

/** The locked scene number Final Draft wrote on this paragraph, as
    the string it is, or ''. `Number` on the Paragraph is where the
    format puts it; `SceneProperties` is checked second because a
    couple of other applications that write .fdx put it there and
    reading one more attribute costs nothing. Whitespace only, or an
    attribute that is absent, is not a number. */
function fdxNumber(p) {
  const direct = String(p.getAttribute('Number') || '').trim();
  if (direct) return direct;
  const props = p.querySelector('SceneProperties');
  if (props) {
    const nested = String(props.getAttribute('Number') || props.getAttribute('SceneNumber') || '').trim();
    if (nested) return nested;
  }
  return '';
}

function parseFDX(raw) {
  const warnings = [];
  const skipped = { unknown: 0 };
  const elements = [];
  const meta = {};

  let xml = null;
  try {
    xml = new DOMParser().parseFromString(String(raw || ''), 'application/xml');
  } catch (e) {
    return { elements: [], meta, warnings: ['That file could not be read as XML.'], skipped, fatal: true };
  }
  if (!xml || xml.querySelector('parsererror')) {
    return { elements: [], meta, warnings: ['That file is not valid Final Draft XML.'], skipped, fatal: true };
  }

  Object.assign(meta, fdxTitlePage(xml));

  /* The SCRIPT's Content is the one directly under <FinalDraft>. The
     title page has a <Content> of its own, and `Content > Paragraph`
     across the whole document read its lines in as the first elements
     of the script. */
  const root = xml.documentElement;
  const body = root && Array.from(root.children || []).find((n) => n.tagName === 'Content');
  const paras = body ? Array.from(body.children).filter((n) => n.tagName === 'Paragraph') : [];
  if (!paras.length) {
    return { elements: [], meta, warnings: ['No screenplay content found in that Final Draft file.'], skipped, fatal: true };
  }

  let duals = 0;
  for (const p of paras) {
    /* DUAL DIALOGUE. Final Draft writes a pair as ONE paragraph that
       holds a <DualDialogue>, with both speeches inside it as ordinary
       paragraphs. They come in as the two speeches they are, and the
       second cue carries the `dual` flag. */
    const dd = Array.from(p.children || []).find((n) => n.tagName === 'DualDialogue');
    if (dd) {
      let cues = 0;
      for (const q of Array.from(dd.children).filter((n) => n.tagName === 'Paragraph')) {
        const k = String(q.getAttribute('Type') || '').trim().toLowerCase();
        const t = Array.from(q.querySelectorAll('Text')).map((x) => x.textContent).join('').trim();
        if (!t) continue;
        const ty = FDX_TYPE[k] || 'action';
        if (!FDX_TYPE[k]) skipped.unknown++;
        if (ty === 'character') cues++;
        elements.push(blankElement(ty === 'character' && cues === 2 ? { type: ty, text: t, dual: true } : { type: ty, text: t }));
      }
      if (cues >= 2) duals++;
      continue;
    }
    const kind = String(p.getAttribute('Type') || '').trim().toLowerCase();
    const text = Array.from(p.querySelectorAll('Text')).map((t) => t.textContent).join('').trim();
    if (!text) continue;
    const type = FDX_TYPE[kind];
    if (!type) {
      // Never dropped — it becomes action and is counted.
      skipped.unknown++;
      elements.push(blankElement({ type: 'action', text }));
      continue;
    }
    if (type === 'scene') {
      /* `sceneNumber` rides on the element only as far as
         `scenesFrom`, which is in this module. It is never stored:
         src/pages/write.js rebuilds every incoming element with
         `blankElement({ type, text })` before it saves, so the
         script model keeps its two fields and the number lives in
         the scene model, where the stripboard reads it. One
         representation per thing. */
      const number = fdxNumber(p);
      elements.push(number
        ? blankElement({ type, text, sceneNumber: number })
        : blankElement({ type, text }));
      continue;
    }
    elements.push(blankElement({ type, text }));
  }
  if (skipped.unknown) {
    warnings.push(skipped.unknown + ' paragraph(s) of a kind this studio has no element for were kept as action.');
  }
  skipped.dual = duals;
  return { elements, meta, warnings, skipped };
}

/** Final Draft's title page, as the same fields the Fountain title
    page gives: the first centred line is the title, "Written by" (or
    "by") is the credit and the line after it the writer, "Based on…"
    the source; a right-aligned line is the draft or the date, and the
    left-aligned lines are the contact block. Read, never guessed past:
    a line none of these describe is left out of the fields. */
function fdxTitlePage(xml) {
  const meta = {};
  const tp = xml.querySelector('TitlePage');
  if (!tp) return meta;
  const lines = Array.from(tp.querySelectorAll('Paragraph')).map((p) => ({
    align: String(p.getAttribute('Alignment') || '').toLowerCase(),
    text: Array.from(p.querySelectorAll('Text')).map((t) => t.textContent).join('').trim()
  })).filter((l) => l.text);
  if (!lines.length) return meta;
  const contact = [];
  const right = [];
  let expectAuthor = false;
  for (const l of lines) {
    if (l.align === 'left') { contact.push(l.text); continue; }
    if (l.align === 'right') { right.push(l.text); continue; }
    if (!meta.title) { meta.title = l.text; continue; }
    if (/^(written\s+)?by$|^(screenplay|story|teleplay)\s+by$/i.test(l.text)) { meta.credit = l.text; expectAuthor = true; continue; }
    if (expectAuthor && !meta.author) { meta.author = l.text; expectAuthor = false; continue; }
    if (/^based on/i.test(l.text)) { meta.source = l.text; continue; }
  }
  if (contact.length) meta.contact = contact.join('\n');
  const isDate = (t) => /\d{4}|\d{1,2}[/.-]\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec/i.test(t);
  for (const r of right) {
    if (!meta['draft date'] && isDate(r) && !/draft/i.test(r)) meta['draft date'] = r;
    else if (!meta.draft) meta.draft = r;
  }
  return meta;
}

/** The title page a file carried, as the script model's `titlePage`
    fields, or null when it carried nothing but a title. Fountain's
    keys and the .fdx reader above meet here, so write.js reads one
    shape whichever format it was. */
export function titlePageFromMeta(meta) {
  const m = meta || {};
  const tp = {
    title: String(m.title || '').trim(),
    credit: String(m.credit || '').trim(),
    author: String(m.author || m.authors || m['written by'] || '').trim(),
    source: String(m.source || '').trim(),
    draft: String(m.draft || m.revision || '').trim(),
    date: String(m['draft date'] || m.date || '').trim(),
    contact: String(m.contact || '').trim()
  };
  const more = ['credit', 'author', 'source', 'draft', 'contact'].some((k) => tp[k]);
  return more ? tp : null;
}

/* ------------------------------------------------------------
   SLUG LINES → SCENE ROWS
   ------------------------------------------------------------
   The scene model is what the breakdown, the stripboard, the
   reports and the budget read. Filling it is the half of the
   import that makes the rest of the studio work.

     · number   the scene number the file locked (.fdx), else the
                leading or trailing number in the slug, else the
                heading's position. Ranked, never coerced to an
                integer, and never handed to two scenes at once —
                see the note on `scenesFrom`.
     · intExt   matched against scenes.js's own vocabulary.
     · dayNight likewise, with the common synonyms mapped and
                everything else left at the default and counted.
     · location what is between the two.
     · eighths  DERIVED from the script: the scene's elements in
                lines, over 55 to the page, times 8. This is a
                measurement of the pages that were imported, not
                a guess, and it is what makes a stripboard and a
                budget work the moment the import finishes.
     · synopsis the scene's first action line. A 1st AD writes
                the same sentence; the preview says where it came
                from so nobody mistakes it for their own.
   ------------------------------------------------------------ */
/* What follows the last dash, mapped to the scene model's own
   vocabulary (scenes.js DAY_NIGHT: DAY NIGHT DAWN DUSK CONTINUOUS).
   LATER / SAME / MOMENTS LATER say the scene runs on from the one
   before, which is what CONTINUOUS means here. A word on this list is
   a TIME and never part of the place. */
const TIME_SYNONYM = {
  MORNING: 'DAY', AFTERNOON: 'DAY', NOON: 'DAY', 'LATE DAY': 'DAY', DAYTIME: 'DAY', 'EARLY MORNING': 'DAWN',
  EVENING: 'NIGHT', 'LATE NIGHT': 'NIGHT', MIDNIGHT: 'NIGHT', NIGHTTIME: 'NIGHT',
  SUNRISE: 'DAWN', SUNSET: 'DUSK', 'MAGIC HOUR': 'DUSK', MAGIC_HOUR: 'DUSK', TWILIGHT: 'DUSK',
  CONTINUOUS: 'CONTINUOUS', LATER: 'CONTINUOUS', SAME: 'CONTINUOUS', 'SAME TIME': 'CONTINUOUS',
  'MOMENTS LATER': 'CONTINUOUS', 'A MOMENT LATER': 'CONTINUOUS', 'LATER THAT DAY': 'CONTINUOUS',
  'LATER THAT NIGHT': 'CONTINUOUS', 'MOMENTS EARLIER': 'CONTINUOUS',
  // Tamil
  'பகல்': 'DAY', 'காலை': 'DAY', 'மதியம்': 'DAY', 'மாலை': 'DUSK', 'இரவு': 'NIGHT', 'அதிகாலை': 'DAWN'
};
const timeOf = (w) => {
  const k = String(w || '').trim().toUpperCase().replace(/[.]+$/, '');
  return DAY_NIGHT.includes(k) ? k : (TIME_SYNONYM[k] || '');
};
const TIME_WORDS = [...DAY_NIGHT, ...Object.keys(TIME_SYNONYM)]
  .sort((a, b) => b.length - a.length)
  .map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  .join('|');
// "… - DAY 12": a scene number after the time of day.
const TAIL_AFTER_TIME = new RegExp('^(.*\\s[-—–]\\s*(?:' + TIME_WORDS + '))\\s+(\\d+[A-Za-z]?)\\s*$', 'i');

export function parseSlug(slug) {
  let text = String(slug || '').trim().replace(/\s+/g, ' ');
  const out = { number: '', intExt: 'INT', dayNight: 'DAY', location: '', guessedTime: false };

  /* A leading or trailing scene number, as Final Draft writes it.
     The leading form is anchored by the INT/EXT that has to follow
     it, so it can safely take the lettered numbers a production
     office uses — 12A for an insert, A12 for one that came before
     12. */
  const lead = text.match(new RegExp('^(' + SCENE_NO + ')[.)]?[\\s]+(?=(INT|EXT|EST|I\\/E|உள்|வெளி))', 'i'));
  if (lead) { out.number = lead[1]; text = text.slice(lead[0].length).trim(); }

  /* Fountain's own number: "INT. KITCHEN - DAY #12#" / "#12A#". */
  const fnt = text.match(/\s*#([A-Za-z0-9.\-]+)#\s*$/);
  if (fnt) { if (!out.number) out.number = fnt[1]; text = text.slice(0, fnt.index).trim(); }

  /* A bare trailing number is a scene number only where it cannot be part
     of the place: after the time of day ("… - DAY 12"), or when the same
     number also leads the heading ("12 INT. KITCHEN - DAY 12"). "EXT.
     HIGHWAY 66 - DAY" and "INT. APARTMENT 4B - NIGHT" keep their numbers
     — they are the address, and the old rule ate them. */
  const after = text.match(TAIL_AFTER_TIME);
  if (after) {
    if (!out.number) out.number = after[2];
    text = after[1].trim();
  } else if (out.number) {
    const same = text.match(/\s+(\d+[A-Za-z]?)\s*$/);
    if (same && same[1].toUpperCase() === out.number.toUpperCase()) text = text.slice(0, same.index).trim();
  }

  const ie = text.match(/^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST|உள்|வெளி)(?![A-Za-z])\.?/i);
  if (ie) {
    const token = ie[1].toUpperCase().replace(/\s|\./g, '');
    // EST. is an establishing shot — of the OUTSIDE.
    out.intExt = (token === 'INT' || token === 'உள்') ? 'INT'
      : (token === 'EXT' || token === 'EST' || token === 'வெளி') ? 'EXT' : 'INT/EXT';
    if (!INT_EXT.includes(out.intExt)) out.intExt = 'INT';
    text = text.slice(ie[0].length).trim();
  }

  // The time of day is what follows the last dash.
  const dash = text.lastIndexOf(' - ') >= 0 ? text.lastIndexOf(' - ')
    : Math.max(text.lastIndexOf(' — '), text.lastIndexOf(' – '));
  if (dash >= 0) {
    const tail2 = text.slice(dash + 3).trim().toUpperCase().replace(/[.]+$/, '');
    const mapped = timeOf(tail2);
    if (mapped) out.dayNight = mapped;
    else out.guessedTime = true;
    out.location = text.slice(0, dash).trim();
    if (!mapped && tail2) out.location = text.trim();   // not a time — it was part of the place
  } else {
    out.location = text.trim();
    out.guessedTime = true;
  }
  out.location = out.location.replace(/^[-—–\s]+|[-—–\s]+$/g, '');
  return out;
}

/** Cut the element list at every scene heading. THE ONE SLICER lives
    in src/lib/screenplay-analysis.js (sliceScript); this name is kept
    for the importer's callers and is the same function, not a copy.
    `number` is the scene number the FILE carried on the heading — only
    .fdx has somewhere to put one that is not the text — and is '' for
    the other two parsers.

    The importer used to carry its own loop here, which differed from
    the shared one on RAW arrays only: it kept an empty element and let
    a blank heading open a scene, and left the heading untrimmed. No
    parser in this file emits either — every element is trimmed and
    non-empty before it gets here, which scripts/test-import.mjs pins
    on fixtures built for exactly those inputs — so folding it changed
    nothing an import produces (docs/KNOWN-ISSUES.md §6). On a raw
    array handed straight to scenesFrom(), a blank heading is now no
    heading, which is also how src/lib/scene-sync.js counts them. */
export const sliceScenes = sliceScript;

/* THE SCENE NUMBER HAS THREE SOURCES AND THEY ARE RANKED.

     1. the file's own attribute  (.fdx Number="12")
     2. a number inside the heading text ("12  INT. KITCHEN - DAY")
     3. the heading's position in the script

   1 beats 2 because a Final Draft file that carries both is a file
   whose writer locked the numbers and then moved a scene; the
   locked one is the one on the call sheet. 2 beats 3 because a
   number somebody typed is still a decision and an ordinal is not.

   WHAT A HALF-NUMBERED FILE DOES. Every number the script carries
   is reserved BEFORE a single ordinal is handed out, so a fallback
   can never take a number that belongs to a real scene further
   down. Doing this in one pass — number as you go — is how the
   writer's scene 1 at the bottom of the file loses its number to
   the unnumbered scene at the top. The fallbacks are positions,
   skipped forward past anything reserved, and the preview says how
   many there were: inventing 13 because the scene above it was 12
   would be this module guessing at a production's numbering, which
   is not information it has. */
export function scenesFrom(elements) {
  const slices = sliceScenes(elements);
  let guessed = 0;
  const numbering = { fromFile: 0, fromHeading: 0, ordinal: 0, conflicted: 0, duplicated: 0 };

  // Pass 1 — what the script says, before anything is invented.
  const draft = slices.map((slice) => {
    const parsed = parseSlug(slice.heading);
    if (parsed.guessedTime) guessed++;
    const fromFile = String(slice.number || '').trim();
    const inHeading = String(parsed.number || '').trim();
    if (fromFile && inHeading && fromFile.toUpperCase() !== inHeading.toUpperCase()) numbering.conflicted++;
    if (fromFile) numbering.fromFile++;
    else if (inHeading) numbering.fromHeading++;
    return { slice, parsed, number: fromFile || inHeading };
  });

  // Pass 2 — reserve them all, and keep the first of any repeat.
  const taken = new Set();
  for (const row of draft) {
    const key = row.number.toUpperCase();
    if (!key) continue;
    if (taken.has(key)) { row.number = ''; numbering.duplicated++; continue; }
    taken.add(key);
  }

  // Pass 3 — the rows, with positions filling the gaps.
  let next = 1;
  const rows = draft.map((row, i) => {
    let number = row.number;
    if (!number) {
      next = Math.max(next, i + 1);
      while (taken.has(String(next))) next++;
      number = String(next);
      taken.add(number);
      next++;
      numbering.ordinal++;
    }
    const { slice, parsed } = row;
    const lines = totalLines(slice.elements)
      + elementLines({ type: 'scene', text: slice.heading });
    const eighths = Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8));
    const firstAction = slice.elements.find((el) => el.type === 'action');
    return blankScene({
      number,
      intExt: parsed.intExt,
      dayNight: parsed.dayNight,
      location: parsed.location,
      eighths,
      synopsis: firstAction ? String(firstAction.text).replace(/\s+/g, ' ').trim().slice(0, 180) : ''
    });
  });
  return { rows, guessed, numbering };
}

/* ------------------------------------------------------------
   THE PLAN
   ------------------------------------------------------------
   One entry point. Returns everything the preview needs and
   nothing is written.
   ------------------------------------------------------------ */
export function parseScript(raw, filename) {
  const format = detectFormat(filename, raw);
  const parser = format === 'fdx' ? parseFDX
    : (format === 'text' || format === 'pdf') ? parseText
    : parseFountain;
  const result = parser(raw);

  /* A parenthetical is STORED without its brackets and WEARS them
     on paper — that is the editor's convention and what
     src/lib/screenplay-export.js re-adds when it typesets. Every
     file format writes them, so they come off here. Without this
     the Fountain round trip comes back one element different, and
     three imports in a row would give you "(((quietly)))". */
  const elements = (result.elements || []).map((el) => {
    if (el.type !== 'paren') return el;
    const stripped = String(el.text).replace(/^\(+\s*|\s*\)+$/g, '').trim();
    return stripped ? blankElement({ type: 'paren', text: stripped }) : el;
  });
  const counts = {};
  for (const el of elements) counts[el.type] = (counts[el.type] || 0) + 1;

  const { rows, guessed, numbering } = scenesFrom(elements);
  const lines = totalLines(elements);
  const warnings = (result.warnings || []).slice();
  /* Anything the PDF extractor had to say comes first: it is about
     the FILE, and the parser's warnings are about the script. A
     reader working out whether to accept an import wants "three
     characters would not decode" before "two slug lines had no
     time of day". */
  if (raw && raw.pdfWarnings) warnings.unshift(...raw.pdfWarnings);

  /* Where the scene numbers came from is said out loud, because the
     stripboard, the sides and the call sheet all key off them and a
     silent renumber is the one import failure that still looks like
     a success. */
  const carried = numbering.fromFile + numbering.fromHeading;
  if (carried && numbering.ordinal) {
    warnings.push(numbering.ordinal + ' of ' + rows.length + ' scene heading(s) carried no number — '
      + 'those scenes are numbered by their position, skipping any number the script already uses. '
      + 'The other ' + carried + ' keep the number the script gave them.');
  }
  if (numbering.conflicted) {
    warnings.push(numbering.conflicted + ' heading(s) had one scene number in the file and a different '
      + 'one in the heading text — the file’s own number was kept.');
  }
  if (numbering.duplicated) {
    warnings.push(numbering.duplicated + ' scene number(s) appeared twice in that script — the second '
      + 'scene was numbered by its position instead, so no two scenes share a number.');
  }
  if (guessed) {
    warnings.push(guessed + ' slug line(s) had no time of day this studio recognises — those scenes default to DAY.');
  }
  if (!elements.length && !result.fatal) {
    warnings.push('Nothing in that file looked like a screenplay.');
  }

  return {
    format,
    /* The label travels WITH the plan, derived from FORMATS, because
       the alternative is what was there: write.js carried its own
       `fdx ? 'Final Draft' : text ? 'screenplay text' : 'Fountain'`
       ternary, so a fourth format did not get a wrong label — it got
       the LAST one, silently, and a PDF import announced itself as
       Fountain. A list of the formats that exist, written out a
       second time, is a list that is wrong by the next format. */
    formatLabel: (FORMATS.find((f) => f.id === format) || {}).label || format,
    meta: result.meta || {},
    // The file's title page as the script model's fields, or null.
    titlePage: titlePageFromMeta(result.meta),
    elements,
    scenes: rows,
    numbering,
    counts,
    lines,
    pages: Math.round((lines / LINES_PER_PAGE) * 10) / 10,
    warnings,
    skipped: result.skipped || {},
    fatal: !!result.fatal || (!elements.length)
  };
}

/** Read a File without uploading it anywhere. */
export function readFile(file) {
  if (isPDF(file)) return readPDF(file);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsText(file);
  });
}

function isPDF(file) {
  const name = String((file && file.name) || '').toLowerCase();
  return name.endsWith('.pdf') || (file && file.type === 'application/pdf');
}

/* A PDF is bytes, not text, so it takes the other FileReader call
   and a pass through src/lib/pdf-text.js first. That module is
   imported HERE and dynamically: an import of a .fountain file
   should not pay for a PDF reader it will never call, and this
   module is itself already behind a dynamic import in write.js.

   The extractor's refusals are the useful part. It can tell a
   scan from a script and a subset font from a readable one, and
   each refusal is a sentence saying what to do instead — so they
   are thrown with that sentence as the message rather than
   collapsed into "could not be read". The two call sites in
   write.js print err.message. */
async function readPDF(file) {
  const buffer = await file.arrayBuffer();
  let extract;
  try {
    ({ extractLayoutText: extract } = await import('./pdf-text.js'));
  } catch (e) {
    throw new Error('The PDF reader could not be loaded.');
  }
  const result = await extract(buffer);
  if (result.fatal) throw new Error(result.fatal);
  /* The extractor's own warnings ride along on the string so
     parseScript can surface them with the parser's. A side channel
     on a String object is ugly; a second return shape for one of
     four formats would be uglier, and this keeps readFile's
     contract — it still resolves to the text of the file. */
  const text = new String(result.text);
  text.pdfWarnings = result.warnings;
  text.pdfPages = result.pages;
  return text;
}

export default {
  FORMATS, ACCEPT, detectFormat, parseScript, parseSlug, scenesFrom, sliceScenes, readFile,
  titlePageFromMeta
};
