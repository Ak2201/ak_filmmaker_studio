/* ============================================================
   WRITE MODEL — the arithmetic and the sentences of write.html
   ------------------------------------------------------------
   Everything src/pages/write.js used to work out for itself that
   does not need the DOM: dates, the synopsis loader's reading and
   clipping, the generator's stage, the page view's layout from the
   paginator's pages, the import and restore questions, the shot
   counts at each heading. The page keeps building the DOM, wiring
   events and holding view state, and asks here (docs/ARCHITECTURE.md).

   Pure: no `document`, no storage, no view imports. Every input is a
   parameter, so each function answers the same thing in Node.
   ============================================================ */
import { revisionColour, wordCount } from './script.js';
import { matchScenes } from './screenplay-analysis.js';
import { basicJobs } from './shot-rules.js';
import { formatStamp, prettyStamp, TITLE_LABELS, titlePlaceholder, pageAnchors } from './write-format.js';

/* The import-free pieces the Screenplay Writer and Drafts share, so
   neither of those pages pulls screenplay-analysis.js in statically. */
export { formatStamp, prettyStamp, TITLE_LABELS, titlePlaceholder, pageAnchors };

export const titlePageStateText = (on) => (on ? 'Page 1 of the PDF' : 'Empty — the PDF opens on a plain title');

/* ---- import --------------------------------------------------- */
export const TYPE_ORDER = ['scene', 'action', 'character', 'paren', 'dialogue', 'transition', 'shot'];

/** Where the scene numbers came from, in one sentence. A number is
    what the stripboard, the sides and the call sheet call a scene,
    so a script that says 47 and a studio that says 12 is the one
    import failure that still looks like it worked. The parser
    ranks its three sources; this only reports which ones it used. */
export function sceneNumberNote(plan) {
  const n = (plan && plan.numbering) || {};
  const carried = (n.fromFile || 0) + (n.fromHeading || 0);
  const ordinal = n.ordinal || 0;
  if (!carried) {
    return ordinal
      ? 'That file carries no scene numbers, so the scenes are numbered by their position — 1 upwards.'
      : '';
  }
  const source = n.fromFile && n.fromHeading ? 'the file and from the headings'
    : n.fromFile ? 'the file’s own scene numbers' : 'the headings';
  if (!ordinal) {
    return 'All ' + carried + ' scene numbers come from ' + source
      + ' — the script’s numbering is kept, letters and all.';
  }
  return carried + ' scene number(s) come from ' + source + '; the remaining ' + ordinal
    + ' heading(s) carry none and are numbered by their position, skipping anything already used.';
}

/** The last gate before an import replaces anything: the question,
    naming what is about to go, or null when nothing is replaced. */
export function importReplaceQuestion({ replaceScript, replaceScenes, elementCount, sceneCount }) {
  const losing = [];
  if (replaceScript && elementCount) {
    losing.push(elementCount + (elementCount === 1 ? ' element' : ' elements') + ' of screenplay');
  }
  if (replaceScenes && sceneCount) {
    losing.push(sceneCount + (sceneCount === 1 ? ' scene' : ' scenes'));
  }
  if (!losing.length) return null;
  return 'Replace ' + losing.join(' and ') + '?\n\n'
    + (replaceScript && elementCount
      ? 'A revision of the current screenplay is taken first, so it can be restored.\n\n'
      : '')
    + (replaceScenes && sceneCount
      ? 'The old scenes go to the Breakdown’s bin with their shots, and can be restored from there.'
      : '');
}

/** What an import did, as the toast says it. `done` is
    commitImportedScript()'s answer. */
export function importDoneMessage(done) {
  return 'Imported ' + done.elements + ' elements and ' + done.scenes
    + (done.scenes === 1 ? ' scene' : ' scenes')
    + (done.renumbered ? ' · ' + done.renumbered + ' renumbered to avoid a clash' : '')
    + '. The breakdown and the stripboard have them now.';
}

/* ---- loading a synopsis off the disk -------------------------- */
/* The field's ceiling, stated once and in one place. It is the
   textarea's own maxlength: about two or three pages of prose, which
   is a synopsis, and roughly one request's worth of input for a beat
   sheet. A forty-page treatment is not a synopsis, and the ONE thing
   that must not happen is keeping its first sixth without saying so. */
export const SYN_LIMIT = 6000;

export const countFmt = (n) => Number(n).toLocaleString('en-IN');

/** A document's text as paragraphs.

    A PDF arrives from pdf-text.js as INDENTED lines, because in a
    screenplay the indentation is the element type. In a synopsis it
    is nothing — it is where the margin happened to be — so the
    leading space comes off, a single newline inside a paragraph
    becomes a space, and a blank line stays a paragraph break. */
export function prosify(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/([^\n])\n(?!\n)/g, '$1 ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Cut to `limit`, at a word boundary rather than through a word. */
export function clipTo(text, limit) {
  if (text.length <= limit) return text;
  const hard = text.slice(0, limit);
  const space = hard.lastIndexOf(' ');
  return (space > limit - 400 ? hard.slice(0, space) : hard).trimEnd();
}

/** A file's text as a pending synopsis load — { name, text, read,
    kept } — or null when there was no text in it. */
export function synopsisFromText(raw, fileName) {
  const prose = prosify(String(raw));
  if (!prose) return null;
  const kept = clipTo(prose, SYN_LIMIT);
  return { name: fileName || 'that file', text: kept, read: prose.length, kept: kept.length };
}

/** What a load did, in the real numbers: { warn, text }. */
export function synopsisLoadNote(p) {
  const cut = p.kept < p.read;
  return {
    warn: cut,
    text: cut
      ? 'Loaded ' + countFmt(p.kept) + ' of ' + countFmt(p.read) + ' characters from “'
        + p.name + '” — the rest was NOT kept. The field holds '
        + countFmt(SYN_LIMIT) + ' characters, which is a synopsis rather than a '
        + 'treatment. The file on your disk is untouched, so if the part that '
        + 'matters was at the end, trim it there and load it again.'
      : 'Loaded all ' + countFmt(p.read) + ' characters from “' + p.name + '”.'
  };
}

/** The question over a load that would replace writing already in
    the field (`existingLength` characters of it). */
export function synopsisPendingText(p, existingLength) {
  const cut = p.kept < p.read;
  return '“' + p.name + '” read as ' + countFmt(p.kept)
    + (cut ? ' of ' + countFmt(p.read) : '') + ' characters'
    + (cut ? ', the rest over the ' + countFmt(SYN_LIMIT) + '-character limit' : '')
    + '. There are already ' + countFmt(existingLength)
    + ' characters in the synopsis field, and replacing them cannot be undone '
    + 'from here.';
}

/* ---- the generator -------------------------------------------- */
export const GEN_FORMATS = [
  { id: 'feature', label: 'Feature', hint: 'about 100 pages' },
  { id: 'short', label: 'Short', hint: 'about 15 pages' }
];

/* Mirrored from SCRIPT_LANGS in ai.js so the panel renders before the
   model code loads. ai.js stays the authority — it is what the prompt
   is built from — and the ids are what tie the two together. */
export const GEN_LANGS = [
  { id: 'ta-dialogue', label: 'Tamil dialogue · English slugs and action',
    hint: 'what Tamil crews shoot from, and the page count stays exact', exact: true },
  { id: 'tanglish', label: 'Tanglish throughout',
    hint: 'romanised Tamil; fits the Courier grid', exact: true },
  { id: 'ta-full', label: 'Tamil throughout',
    hint: 'action in Tamil too — the page count becomes an estimate', exact: false },
  { id: 'en', label: 'English', hint: '', exact: true }
];
export const genLang = (id) => GEN_LANGS.find((l) => l.id === id) || GEN_LANGS[0];

/** Which of the three stages a generation job is at. */
export function genStage(gen) {
  if (!gen.beats.length) return 'synopsis';
  if (!gen.scenes.length) return 'beats';
  return gen.cursor >= gen.scenes.length ? 'done' : 'pages';
}

/** One place that turns a thrown thing into the generator's status
    and error lines, so the three stages cannot disagree about what a
    401 means. Answers { status?, error, aborted }. */
export function genFailState(err) {
  if (err && (err.kind === 'aborted' || err.name === 'AbortError')) {
    return { aborted: true, status: '', error: 'Stopped. Everything already written is kept.' };
  }
  return { aborted: false, error: (err && err.message) || 'Something went wrong, and nothing was changed.' };
}

/* ---- revisions and documents ---------------------------------- */
/** "White — Second draft", or '' if no revision has been issued. */
export function currentRevision(doc) {
  if (!doc.revisions.length) return '';
  const i = doc.revisions.length - 1;
  return revisionColour(i).name + ' — ' + doc.revisions[i].name;
}

/** The typesetter's header for an export made now. */
export function exportMeta(doc, projectTitle, now = new Date()) {
  return {
    title: projectTitle,
    revision: currentRevision(doc),
    subtitle: prettyStamp(now.toISOString()),
    date: now.toISOString().slice(0, 10)
  };
}

/** The restore question, saying what it is about to throw away. */
export function restoreQuestion(colourName, rev, currentCount) {
  return `Restore the ${colourName} revision — “${rev.name}”?\n\n`
    + `The screenplay on screen (${currentCount} `
    + `${currentCount === 1 ? 'element' : 'elements'}) is replaced by this `
    + `snapshot (${rev.elements.length} ${rev.elements.length === 1 ? 'element' : 'elements'}). `
    + 'Snapshot the current pages first if you want to keep them.';
}

/** A document card's meta line: words and when it was last changed. */
export function docMetaText(d) {
  const words = wordCount(d.body);
  return words + (words === 1 ? ' word' : ' words') + ' · ' + prettyStamp(d.updated);
}

/* ---- the page view -------------------------------------------- */
/** The page view's layout from the paginator's pages: the page each
    element starts on, each heading's printed scene number, and the
    page-start anchors. */
export function pageViewLayout(pages) {
  const pageOf = new Map();
  const sceneNo = new Map();
  pages.forEach((rows, p) => {
    for (const r of rows) {
      for (const id of (r.ids || (r.id ? [r.id] : []))) if (!pageOf.has(id)) pageOf.set(id, p);
      if (r.sceneNo && r.id && !r.cont) sceneNo.set(r.id, r.sceneNo);
    }
  });
  return { pageOf, sceneNo, anchors: pageAnchors(pages) };
}

/** A locked script's OMITTED scenes, grouped by the element each
    group sits before: [[anchorId | null, numbers[]], …], null meaning
    after the last row. */
export function omittedPlacements(pages) {
  const want = [];
  let pending = [];
  for (const rows of pages) {
    for (const r of rows) {
      if (r.omitted) { pending.push(r.sceneNo); continue; }
      if (pending.length && r.id && !r.cont) { want.push([r.id, pending]); pending = []; }
    }
  }
  if (pending.length) want.push([null, pending]);
  return want;
}

/** "Printed page N of M" for the line the caret is in. A blank
    element prints nothing; it is on the page of the line before it. */
export function pvWhereText({ total, pageOf, focusId, elements }) {
  if (!total) return 'Paginating…';
  let p = focusId ? pageOf.get(focusId) : undefined;
  if (p === undefined && focusId) {
    for (let k = elements.findIndex((e) => e.id === focusId); k >= 0 && p === undefined; k--) p = pageOf.get(elements[k].id);
  }
  /* "printed": these are the PDF's sheets, which run longer than the
     55-lines-a-page count in the stats (page breaks, MORE/CONT'D, a
     scene kept off a page foot). Both are right; they measure two
     things, and an unlabelled 115 beside an unlabelled 106.5 read as
     a bug. */
  return p === undefined
    ? total + (total === 1 ? ' printed page' : ' printed pages')
    : 'Printed page ' + (p + 1) + ' of ' + total;
}

/* ---- script → shot list --------------------------------------- */
/** The label over each scene heading: Map(headingElementId →
    { text, none }). The slicer drops empty headings, so slice k is
    the k-th heading with text — the same walk sliceScript() makes.
    `getScenes` / `getShots` are read only when there is a heading.
    Throws what they or matchScenes throw; the caller decides what that
    means. */
export function shotCountLabels(elements, getScenes, getShots) {
  const out = new Map();
  const headIds = [];
  for (const el of elements) if (el.type === 'scene' && String(el.text ?? '').trim()) headIds.push(el.id);
  if (!headIds.length) return out;
  const m = matchScenes(getScenes(), elements);
  const shots = getShots();
  const counted = new Map();
  for (const s of shots) counted.set(s.sceneId, (counted.get(s.sceneId) || 0) + 1);
  const sceneAt = new Map();
  for (const p of m.pairs) if (p.slice) sceneAt.set(p.slice.index, p.scene);
  for (const sl of m.slices) {
    const id = headIds[sl.index];
    const scene = sceneAt.get(sl.index);
    const n = scene ? counted.get(scene.id) || 0 : 0;
    const text = !scene ? 'Not in the Breakdown yet'
      : 'Sc ' + (scene.number || '—') + ' · ' + (n ? n + (n === 1 ? ' shot' : ' shots') : 'no shots yet');
    out.set(id, { text, none: !!(scene && !n) });
  }
  return out;
}

/** The shot-division jobs for every confidently matched scene that
    has no shots yet. */
export function uncoveredShotJobs(scenes, shots, elements) {
  const covered = new Set(shots.map((s) => s.sceneId));
  const open = new Set(scenes.filter((s) => !covered.has(s.id)).map((s) => s.id));
  return basicJobs(scenes, elements, { only: open, confidentOnly: true });
}
