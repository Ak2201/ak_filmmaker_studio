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
import { elementLines, LINES_PER_PAGE } from './script.js';

export const FORMATS = [
  { id: 'fountain', label: 'Fountain', ext: ['.fountain', '.spmd'] },
  { id: 'text',     label: 'Screenplay text', ext: ['.txt'] },
  { id: 'fdx',      label: 'Final Draft', ext: ['.fdx'] }
];

export const ACCEPT = '.fountain,.spmd,.txt,.fdx,.xml,text/plain';

/** Which parser a file wants. The extension decides, and the
    content breaks the tie when there isn't one — a .txt that
    opens with an XML declaration is a Final Draft file somebody
    renamed, and guessing right costs nothing. */
export function detectFormat(filename, text) {
  const name = String(filename || '').toLowerCase();
  const head = String(text || '').slice(0, 400);
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
const SLUG_RE   = /^(INT|EXT|EST|I\/E|INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT)[.\s]/i;
const TRANS_RE  = /^(FADE (IN|OUT|TO)|CUT TO|SMASH CUT|MATCH CUT|DISSOLVE TO|WIPE TO|IRIS (IN|OUT)|TIME CUT|INTERCUT|BACK TO|JUMP CUT|FADE TO BLACK)\b/i;
const ENDS_TO   = /\bTO:\s*$/;
const CUE_OK    = /^[^a-z]*$/;                       // no lowercase letters at all
const CUE_TAIL  = /\s*\((V\.?O\.?|O\.?S\.?|O\.?C\.?|CONT'?D|CONTINUED|SUBTITLED|FILTERED|PRE-?LAP)\)\s*$/i;
const PAGE_NO   = /^\s*\d+[.)]?\s*$/;
const MORE_LINE = /^\s*\(\s*MORE\s*\)\s*$/i;
const CONTINUED = /^\s*\(?\s*CONTINUED\s*\)?\s*$/i;

const isUpperish = (s) => {
  const t = String(s).replace(CUE_TAIL, '').trim();
  return !!t && CUE_OK.test(t) && /[A-Z஀-௿]/.test(t);
};

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
function parseFountain(raw) {
  const warnings = [];
  const skipped = { notes: 0, sections: 0, titlePage: 0 };

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
  if (lines.length && /^[A-Za-z][A-Za-z ]*:/.test(lines[0])) {
    for (; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) { i++; break; }
      const m = line.match(/^([A-Za-z][A-Za-z ]*):\s*(.*)$/);
      if (!m) break;
      meta[m[1].trim().toLowerCase()] = m[2].trim();
      skipped.titlePage++;
    }
  }

  const elements = [];
  const push = (type, t) => {
    const clean = String(t).trim();
    if (!clean) return;
    elements.push(blankElement({ type, text: clean }));
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

    if (first.startsWith('#')) { skipped.sections += b.length; continue; }   // section heading
    if (first.startsWith('=') && !first.startsWith('==')) { skipped.sections += b.length; continue; } // synopsis

    // --- forced ---
    if (first.startsWith('.') && !first.startsWith('..')) {
      push('scene', first.slice(1));
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    if (first.startsWith('!')) { push('action', b.map((l) => l.replace(/^!/, '')).join('\n')); continue; }
    if (first.startsWith('>')) {
      const centred = /<\s*$/.test(first);
      const body = first.replace(/^>\s*/, '').replace(/\s*<\s*$/, '');
      push(centred ? 'action' : 'transition', body);
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    if (first.startsWith('@')) { speech(b, first.replace(/^@/, ''), push); continue; }

    // --- inferred ---
    if (SLUG_RE.test(first)) {
      push('scene', first);
      restAsAction(b.slice(1), push, warnings);
      continue;
    }
    if (b.length === 1 && (TRANS_RE.test(first) || (isUpperish(first) && ENDS_TO.test(first)))) {
      push('transition', first);
      continue;
    }
    if (b.length > 1 && isUpperish(first) && !ENDS_TO.test(first)) {
      speech(b, first, push);
      continue;
    }
    if (b.length === 1 && isUpperish(first) && !ENDS_TO.test(first)) {
      /* An all-caps single line with nothing under it is action
         that shouts — a title card, a sign. Fountain says a cue
         needs something after it, so this is action, and the
         count says we made a judgement. */
      push('action', first);
      warnings.push('“' + first.slice(0, 48) + '” was read as action, not a character cue — nothing followed it.');
      continue;
    }
    push('action', b.join('\n'));
  }

  return { elements, meta, warnings, skipped };
}

/** The lines under a forced slug or transition in the same block.
    Rare, and always action. */
function restAsAction(rest, push, warnings) {
  const body = rest.map((l) => l.trim()).filter(Boolean).join('\n');
  if (!body) return;
  push('action', body);
  warnings.push('Lines under a scene heading with no blank line between them were read as action.');
}

/** A speech block: the cue, then parentheticals and dialogue. */
function speech(b, cueLine, push) {
  push('character', cueLine.replace(/\s*\^\s*$/, ''));   // ^ is dual dialogue
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
   ------------------------------------------------------------ */
function parseText(raw) {
  const warnings = [];
  const skipped = { pageNumbers: 0, more: 0, continued: 0, titlePage: 0 };
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
    skipped.titlePage = text.slice(0, ff).split('\n').filter((l) => l.trim()).length;
    text = text.slice(ff);
    if (skipped.titlePage) {
      warnings.push(skipped.titlePage + ' title-page line(s) before the first page break '
        + 'were read as front matter, not as script.');
    }
  }
  const lines = text.replace(/\f/g, '\n').split('\n');

  const rows = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) { rows.push(null); continue; }              // a blank is a separator
    if (PAGE_NO.test(line)) { skipped.pageNumbers++; continue; }
    if (MORE_LINE.test(line)) { skipped.more++; continue; }
    if (CONTINUED.test(line)) { skipped.continued++; continue; }
    const indent = line.match(/^ */)[0].length;
    rows.push({ indent, text: t });
  }

  const classify = (row, prev) => {
    const { indent, text } = row;
    if (SLUG_RE.test(text)) return 'scene';
    if (TRANS_RE.test(text) && indent < 6) return 'transition';
    if (isUpperish(text) && (ENDS_TO.test(text) || indent >= 40)) return 'transition';
    if (/^\(.*\)$/.test(text) && indent >= 8) return 'paren';
    if (indent >= 18 && isUpperish(text)) return 'character';
    if (indent >= 6) {
      // Under a cue or a parenthetical, an indented line is speech.
      if (prev === 'character' || prev === 'paren' || prev === 'dialogue') return 'dialogue';
      return indent >= 18 ? 'character' : 'dialogue';
    }
    return 'action';
  };

  const elements = [];
  let open = null;                                       // { type, lines[] }
  const close = () => {
    if (!open) return;
    const joined = (open.type === 'scene' || open.type === 'character' || open.type === 'transition')
      ? open.lines.join(' ')
      : open.lines.join(' ');
    elements.push(blankElement({ type: open.type, text: joined.replace(/\s+/g, ' ').trim() }));
    open = null;
  };

  let prevType = null;
  for (const row of rows) {
    if (!row) { close(); prevType = null; continue; }
    const type = classify(row, prevType);
    /* A cue and its parenthetical and its dialogue sit under each
       other with no blank line, so a change of kind ends the
       element even mid-block. Same kind continues it, which is
       how a wrapped paragraph comes back as one paragraph. */
    if (open && open.type !== type) close();
    if (!open) open = { type, lines: [] };
    open.lines.push(row.text.replace(CUE_TAIL_ONLY_CONTD, ''));
    prevType = type;
    /* A cue is always one line. Anything after it is the speech. */
    if (type === 'scene' || type === 'character' || type === 'transition' || type === 'paren') close();
  }
  close();

  if (skipped.pageNumbers) {
    warnings.push(skipped.pageNumbers + ' page number line(s) were recognised and skipped.');
  }
  return { elements, meta: {}, warnings, skipped };
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
   ------------------------------------------------------------ */
const FDX_TYPE = {
  'scene heading': 'scene',
  'action': 'action',
  'character': 'character',
  'parenthetical': 'paren',
  'dialogue': 'dialogue',
  'transition': 'transition',
  'shot': 'action',
  'general': 'action'
};

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

  const title = xml.querySelector('TitlePage Text');
  if (title && title.textContent.trim()) meta.title = title.textContent.trim();

  const paras = xml.querySelectorAll('Content > Paragraph');
  if (!paras.length) {
    return { elements: [], meta, warnings: ['No screenplay content found in that Final Draft file.'], skipped, fatal: true };
  }

  for (const p of paras) {
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
    elements.push(blankElement({ type, text }));
  }
  if (skipped.unknown) {
    warnings.push(skipped.unknown + ' paragraph(s) of a kind this studio has no element for were kept as action.');
  }
  return { elements, meta, warnings, skipped };
}

/* ------------------------------------------------------------
   SLUG LINES → SCENE ROWS
   ------------------------------------------------------------
   The scene model is what the breakdown, the stripboard, the
   reports and the budget read. Filling it is the half of the
   import that makes the rest of the studio work.

     · number   the leading or trailing number in the slug, if
                the script carries one; otherwise the ordinal.
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
const TIME_SYNONYM = {
  MORNING: 'DAY', AFTERNOON: 'DAY', NOON: 'DAY', 'LATE DAY': 'DAY',
  EVENING: 'NIGHT', 'LATE NIGHT': 'NIGHT', MIDNIGHT: 'NIGHT',
  SUNRISE: 'DAWN', SUNSET: 'DUSK', MAGIC_HOUR: 'DUSK', CONTINUOUS: 'CONTINUOUS'
};

export function parseSlug(slug) {
  let text = String(slug || '').trim().replace(/\s+/g, ' ');
  const out = { number: '', intExt: 'INT', dayNight: 'DAY', location: '', guessedTime: false };

  // A leading or trailing scene number, as Final Draft writes it.
  const lead = text.match(/^(\d+[A-Za-z]?)[.\s]+(?=(INT|EXT|EST|I\/E))/i);
  if (lead) { out.number = lead[1]; text = text.slice(lead[0].length).trim(); }
  const tail = text.match(/\s+(\d+[A-Za-z]?)\s*$/);
  if (tail && !out.number) { out.number = tail[1]; text = text.slice(0, tail.index).trim(); }

  const ie = text.match(/^(INT\.?\s*\/\s*EXT|EXT\.?\s*\/\s*INT|I\s*\/\s*E|INT|EXT|EST)\b\.?/i);
  if (ie) {
    const token = ie[1].toUpperCase().replace(/\s|\./g, '');
    out.intExt = (token === 'INT' || token === 'EST') ? 'INT'
      : token === 'EXT' ? 'EXT' : 'INT/EXT';
    if (!INT_EXT.includes(out.intExt)) out.intExt = 'INT';
    text = text.slice(ie[0].length).trim();
  }

  // The time of day is what follows the last dash.
  const dash = text.lastIndexOf(' - ') >= 0 ? text.lastIndexOf(' - ')
    : Math.max(text.lastIndexOf(' — '), text.lastIndexOf(' – '));
  if (dash >= 0) {
    const tail2 = text.slice(dash + 3).trim().toUpperCase().replace(/[.]+$/, '');
    const mapped = DAY_NIGHT.includes(tail2) ? tail2 : TIME_SYNONYM[tail2];
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

/** Cut the element list at every scene heading, the same way
    src/lib/ai.js does. One derivation, two callers. */
export function sliceScenes(elements) {
  const out = [];
  let current = null;
  for (const el of elements) {
    if (el.type === 'scene') { current = { heading: el.text, elements: [] }; out.push(current); continue; }
    if (!current) continue;                        // anything before the first slug is a preamble
    current.elements.push(el);
  }
  return out;
}

export function scenesFrom(elements) {
  const slices = sliceScenes(elements);
  const rows = [];
  let guessed = 0;
  slices.forEach((slice, i) => {
    const parsed = parseSlug(slice.heading);
    if (parsed.guessedTime) guessed++;
    const lines = slice.elements.reduce((n, el) => n + elementLines(el), 0)
      + elementLines({ type: 'scene', text: slice.heading });
    const eighths = Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8));
    const firstAction = slice.elements.find((el) => el.type === 'action');
    rows.push(blankScene({
      number: parsed.number || String(i + 1),
      intExt: parsed.intExt,
      dayNight: parsed.dayNight,
      location: parsed.location,
      eighths,
      synopsis: firstAction ? String(firstAction.text).replace(/\s+/g, ' ').trim().slice(0, 180) : ''
    }));
  });
  return { rows, guessed };
}

/* ------------------------------------------------------------
   THE PLAN
   ------------------------------------------------------------
   One entry point. Returns everything the preview needs and
   nothing is written.
   ------------------------------------------------------------ */
export function parseScript(raw, filename) {
  const format = detectFormat(filename, raw);
  const parser = format === 'fdx' ? parseFDX : format === 'text' ? parseText : parseFountain;
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

  const { rows, guessed } = scenesFrom(elements);
  const lines = elements.reduce((n, el) => n + elementLines(el), 0);
  const warnings = (result.warnings || []).slice();
  if (guessed) {
    warnings.push(guessed + ' slug line(s) had no time of day this studio recognises — those scenes default to DAY.');
  }
  if (!elements.length && !result.fatal) {
    warnings.push('Nothing in that file looked like a screenplay.');
  }

  return {
    format,
    meta: result.meta || {},
    elements,
    scenes: rows,
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
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('That file could not be read.'));
    reader.readAsText(file);
  });
}

export default {
  FORMATS, ACCEPT, detectFormat, parseScript, parseSlug, scenesFrom, sliceScenes, readFile
};
