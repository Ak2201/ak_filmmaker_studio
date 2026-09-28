/* ============================================================
   THE SCRIPT MODEL
   ------------------------------------------------------------
   One representation of the Write phase: the screenplay itself, the
   coloured revision history taken from it, and the free-form
   production documents that sit beside it. Same argument as
   src/lib/scenes.js — three views of one model beats three islands
   that agree for a week and then drift.

   STORAGE CONTRACT. `arunak_script_v1` is already registered in the
   four places a new key has to be registered in:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/pages/hub.js — included in backups
     3. ALL_KEYS in src/pages/hub.js     — cleared by reset
     4. the scope check in supabase-schema.sql — allowed to sync
   Nothing here registers it again; this file only reads and writes it.

   NOTHING IN HERE WRITES ON A READ. `loadScript()` shape-guarantees
   what it found and hands it back — it never repairs the stored blob
   in passing. A load that also saves is how a page ends up writing to
   localStorage while the user is doing nothing, which is the save-loop
   defect CLAUDE.md names and which `npm run verify` asserts against.
   The page owns the document in memory, mutates it, and decides when
   to persist.

   ONE REPRESENTATION PER THING. A revision's colour is NOT stored: it
   is the revision's position in the list, and the industry order is
   fixed, so storing it would be a second copy that renumbering breaks.
   Page count, word count and the element counts are likewise derived
   on every read. What IS stored twice, deliberately, is a revision's
   copy of the elements — that is the whole point of a snapshot, and a
   snapshot that shared structure with the live script would not be one.
   ============================================================ */
import Store from './store.js';

export const SCRIPT_KEY = 'arunak_script_v1';

/* ---- screenplay elements -----------------------------------
   The six element types every screenwriting application has, in the
   order the Tab key walks them. `short` is what the editor prints in
   its narrow type column; `label` is what a screen reader says. */
export const ELEMENT_TYPES = [
  { id: 'scene',      label: 'Scene Heading',  short: 'SCENE' },
  { id: 'action',     label: 'Action',         short: 'ACTION' },
  { id: 'character',  label: 'Character',      short: 'CHAR' },
  { id: 'paren',      label: 'Parenthetical',  short: 'PAREN' },
  { id: 'dialogue',   label: 'Dialogue',       short: 'DIALOG' },
  { id: 'transition', label: 'Transition',     short: 'TRANS' }
];
export const ELEMENT_TYPE_IDS = ELEMENT_TYPES.map((t) => t.id);
const typeById = Object.fromEntries(ELEMENT_TYPES.map((t) => [t.id, t]));
export const typeLabel = (id) => (typeById[id] || typeById.action).label;

/** What pressing Return at the end of an element gives you next.
    Final Draft's mapping, which is the one writers' hands know. */
export const NEXT_TYPE = {
  scene: 'action',
  action: 'action',
  character: 'dialogue',
  paren: 'dialogue',
  dialogue: 'action',
  transition: 'scene'
};

/* ---- the industry revision order ---------------------------
   White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry.
   Nine, and then the set repeats as Double White, Double Blue, … —
   which is the real convention, not a fallback invented here.

   `swatch` is a CLASS SUFFIX, not a colour. write.css maps each one
   to a token, because a hex literal in this file would be a colour
   living outside tokens.css, and it would be the wrong colour in three
   of the four themes. The NAME is what a production office says out
   loud and what this app shows; the swatch is only an indication. */
export const REVISION_COLOURS = [
  { name: 'White',     swatch: 'white' },
  { name: 'Blue',      swatch: 'blue' },
  { name: 'Pink',      swatch: 'pink' },
  { name: 'Yellow',    swatch: 'yellow' },
  { name: 'Green',     swatch: 'green' },
  { name: 'Goldenrod', swatch: 'goldenrod' },
  { name: 'Buff',      swatch: 'buff' },
  { name: 'Salmon',    swatch: 'salmon' },
  { name: 'Cherry',    swatch: 'cherry' }
];
const CYCLE_PREFIX = ['', 'Double ', 'Triple ', 'Quadruple '];

/** The Nth revision's colour, N counting from zero. Derived, never stored. */
export function revisionColour(index) {
  const i = Math.max(0, Math.floor(Number(index) || 0));
  const base = REVISION_COLOURS[i % REVISION_COLOURS.length];
  const cycle = Math.floor(i / REVISION_COLOURS.length);
  // `??`, not `||`. The first cycle's prefix is the empty string, and an
  // empty string is falsy — with `||` the very first revision came out
  // as "x1 White" instead of "White".
  const prefix = CYCLE_PREFIX[cycle] ?? `x${cycle + 1} `;
  return { name: prefix + base.name, swatch: base.swatch, cycle };
}

/* ---- production documents ---------------------------------- */
export const DOC_KINDS = [
  'Treatment',
  "Director's Statement",
  'One-Pager',
  'Synopsis',
  'Character Bible',
  'Notes'
];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'w_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

const nowISO = () => new Date().toISOString();

/* ---- shapes ------------------------------------------------
   Every field present, so no caller ever guards for undefined. */
export function blankElement(patch = {}) {
  const el = { id: uid(), type: 'action', text: '', ...patch };
  if (!ELEMENT_TYPE_IDS.includes(el.type)) el.type = 'action';
  el.text = String(el.text ?? '');
  return el;
}

export function blankDocument(patch = {}) {
  return {
    id: uid(),
    title: '',
    kind: DOC_KINDS[0],
    body: '',
    updated: nowISO(),
    ...patch
  };
}

export function blankScript() {
  return { elements: [], revisions: [], documents: [] };
}

/* ---- load / save -------------------------------------------
   `Array.isArray` on all three lists. An empty array is truthy and a
   stored `null` is not an array; both have already cost this project a
   page that rendered zero rows with no way to add one. */
export function loadScript() {
  let raw = null;
  try { raw = localStorage.getItem(SCRIPT_KEY); } catch (e) { /* private mode */ }
  if (!raw) return blankScript();
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return blankScript(); }
  if (!parsed || typeof parsed !== 'object') return blankScript();
  return {
    elements: Array.isArray(parsed.elements) ? parsed.elements.map((e) => blankElement(e)) : [],
    revisions: Array.isArray(parsed.revisions) ? parsed.revisions.map(normaliseRevision) : [],
    documents: Array.isArray(parsed.documents) ? parsed.documents.map((d) => blankDocument(d)) : []
  };
}

function normaliseRevision(rev) {
  const r = rev && typeof rev === 'object' ? rev : {};
  return {
    id: r.id || uid(),
    name: String(r.name ?? '').trim() || 'Untitled revision',
    date: r.date || nowISO(),
    elements: Array.isArray(r.elements) ? r.elements.map((e) => blankElement(e)) : []
  };
}

export function saveScript(doc) {
  try {
    localStorage.setItem(SCRIPT_KEY, JSON.stringify({
      elements: doc.elements || [],
      revisions: doc.revisions || [],
      documents: doc.documents || []
    }));
    return true;
  } catch (e) {
    return false;
  }
}

/* ---- revisions ---------------------------------------------
   A snapshot is a deep copy taken at a moment. Structural sharing
   would make "restore" a no-op the first time the live script changed,
   which is the opposite of what a revision is for. */
export function makeRevision(elements, name) {
  return {
    id: uid(),
    name: String(name ?? '').trim() || 'Draft',
    date: nowISO(),
    elements: (elements || []).map((e) => ({ id: uid(), type: e.type, text: String(e.text ?? '') }))
  };
}

/** A restored revision gets fresh element ids: the live script and the
    snapshot are now two lists, and sharing ids between them would make
    a later edit look like it belonged to both. */
export function restoreElements(rev) {
  return (rev && Array.isArray(rev.elements) ? rev.elements : [])
    .map((e) => blankElement({ type: e.type, text: e.text }));
}

/* ---- the page count ----------------------------------------
   The industry approximation: a screenplay page is 55 lines of 12pt
   Courier, and each element type occupies a fixed measure on it.
   `before` is the blank line the format puts above an element —
   dialogue and parentheticals get none, because they sit hard under
   the character cue.

   Counting lines beats counting words. The 210-words-a-page rule the
   short blueprint uses is fine for prose-heavy drafts and wrong by a
   third on a page of one-word exchanges, which is exactly the page a
   writer wants a count for. */
export const LINES_PER_PAGE = 55;

const LAYOUT = {
  scene:      { width: 61, before: 2 },
  action:     { width: 61, before: 1 },
  character:  { width: 38, before: 1 },
  paren:      { width: 25, before: 0 },
  dialogue:   { width: 35, before: 0 },
  transition: { width: 61, before: 1 }
};

export function elementLines(el) {
  const spec = LAYOUT[el && el.type] || LAYOUT.action;
  const text = String((el && el.text) ?? '');
  const body = text.split('\n').reduce(
    (n, line) => n + Math.max(1, Math.ceil(line.length / spec.width)), 0);
  return spec.before + body;
}

export function totalLines(elements) {
  return (elements || []).reduce((n, el) => n + elementLines(el), 0);
}

/** Pages as a fractional number. 0 elements is 0 pages, not 0.1. */
export function pageCount(elements) {
  const lines = totalLines(elements);
  if (!lines) return 0;
  return Math.round((lines / LINES_PER_PAGE) * 10) / 10;
}

export function formatPages(pages) {
  const n = Number(pages) || 0;
  return n ? n.toFixed(1) : '0';
}

/** One page is roughly one minute of screen time. */
export function formatRuntime(pages) {
  const n = Math.max(0, Number(pages) || 0);
  const mins = Math.floor(n);
  const secs = Math.round((n - mins) * 60);
  return mins + ':' + String(secs).padStart(2, '0');
}

export function wordCount(text) {
  return String(text ?? '').split(/\s+/).filter(Boolean).length;
}

/* ---- Fountain export ---------------------------------------
   Plain text, standard Fountain. Same conventions as the short
   blueprint's `buildFountain()` — a title page, FADE IN:, uppercase
   slug lines and cues, a blank line between elements and none inside a
   dialogue block — with the forcing characters that a typed element
   list makes both possible and necessary.

   Fountain infers an element's type from how the line LOOKS. The short
   blueprint could rely on that because its scene slugs came out of a
   field called "slug". Here the user has already said what each element
   is, so where the text would be guessed wrong we say it outright:
     .  forces a scene heading    @  forces a character cue
     !  forces action             >  forces a transition
   This is what makes a Tamil character name survive the round trip;
   without `@`, "மணி" is not uppercase Latin and imports as action. */
const SLUG_START = /^(INT|EXT|EST|I\/E|INT\.?\/EXT)[.\s]/i;
const PLAIN_CUE  = /^[A-Z0-9 .'’#()\-]+$/;
const ENDS_IN_TO = /TO:$/;

function fountainBlock(type, text) {
  const t = text.trim();
  switch (type) {
    case 'scene': {
      const up = t.toUpperCase();
      return [SLUG_START.test(up) ? up : '.' + up];
    }
    case 'character': {
      const up = t.toUpperCase();
      return [PLAIN_CUE.test(up) ? up : '@' + up];
    }
    case 'paren': {
      let p = t.replace(/^\(+|\)+$/g, '').trim();
      return p ? ['(' + p + ')'] : [];
    }
    case 'dialogue':
      return t.split('\n');
    case 'transition': {
      const up = t.toUpperCase();
      return [ENDS_IN_TO.test(up) ? up : '> ' + up];
    }
    default:
      // Action that happens to be all caps would import as a character
      // cue. `!` is the forcing character for action; it costs nothing
      // on the lines that did not need it because we only add it there.
      return t.split('\n').map((line) => {
        const l = line.trim();
        return (l && l === l.toUpperCase() && /[A-Z]/.test(l)) ? '!' + line : line;
      });
  }
}

const GLUED = new Set(['paren', 'dialogue']);
const CUE_ISH = new Set(['character', 'paren', 'dialogue']);

export function toFountain(doc, meta = {}) {
  const head = [];
  head.push('Title: ' + (String(meta.title || '').trim() || 'Untitled'));
  if (meta.author) head.push('Author: ' + meta.author);
  head.push('Draft date: ' + (meta.date || new Date().toISOString().slice(0, 10)));
  if (meta.revision) head.push('Revision: ' + meta.revision);

  const body = [];
  let prev = null;
  for (const el of (doc && doc.elements) || []) {
    const text = String(el.text ?? '').trim();
    if (!text) continue;
    const lines = fountainBlock(el.type, text);
    if (!lines.length) continue;
    const glue = GLUED.has(el.type) && CUE_ISH.has(prev);
    if (body.length && !glue) body.push('');
    body.push(...lines);
    prev = el.type;
  }

  const out = head.concat(['', 'FADE IN:', '']);
  if (body.length) out.push(...body, '');
  out.push('FADE OUT.');
  return out.join('\n') + '\n';
}

/** A filename stem. Same shape as the short blueprint's `slugTitle()`. */
export function slugify(s, fallback) {
  return String(s || '').replace(/[^a-z0-9]+/gi, '_').replace(/^_+|_+$/g, '').toLowerCase()
    || fallback;
}

/** The open project's title, for the title page and the filename. */
export function projectTitle() {
  try {
    const p = Store && Store.currentProject && Store.currentProject();
    if (p && p.title) return p.title;
  } catch (e) { /* no project yet */ }
  return 'Untitled';
}

export default {
  SCRIPT_KEY, ELEMENT_TYPES, ELEMENT_TYPE_IDS, NEXT_TYPE, REVISION_COLOURS, DOC_KINDS,
  LINES_PER_PAGE, typeLabel, revisionColour,
  blankElement, blankDocument, blankScript, loadScript, saveScript,
  makeRevision, restoreElements,
  elementLines, totalLines, pageCount, formatPages, formatRuntime, wordCount,
  toFountain, slugify, projectTitle
};
