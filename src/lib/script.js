/* ============================================================
   THE SCRIPT MODEL
   ------------------------------------------------------------
   One representation of the Write phase: the screenplay itself, the
   coloured revision history taken from it, and the free-form
   production documents that sit beside it. Same argument as
   src/lib/scenes.js — three views of one model beats three islands
   that agree for a week and then drift.

   STORAGE CONTRACT. `fms_script_v1` is already registered in the
   four places a new key has to be registered in:
     1. SCOPED_KEYS in src/lib/store.js  — namespaced per project
     2. PROJECT_KEYS in src/lib/backup.js — included in backups
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

export const SCRIPT_KEY = 'fms_script_v1';

/* ---- screenplay elements -----------------------------------
   The element types every screenwriting application has, in the
   order the Tab key walks them. `short` is what the editor prints in
   its narrow type column; `label` is what a screen reader says.

   `shot` is the seventh and it was ADDED, not slotted in: it goes
   last so the six ids keep their positions, and a script written
   before it existed has no shot in it and reads back exactly as it
   was stored. A shot (CLOSE ON, ANGLE ON, POV, INSERT) is flush left
   in capitals like a slug line, and it is NOT a scene — it opens no
   scene, takes no scene number and cuts no slice. Every consumer that
   asks "is this a new scene" asks `type === 'scene'`, which a shot is
   not, so that half needed no change anywhere. */
export const ELEMENT_TYPES = [
  { id: 'scene',      label: 'Scene Heading',  short: 'SCENE' },
  { id: 'action',     label: 'Action',         short: 'ACTION' },
  { id: 'character',  label: 'Character',      short: 'CHAR' },
  { id: 'paren',      label: 'Parenthetical',  short: 'PAREN' },
  { id: 'dialogue',   label: 'Dialogue',       short: 'DIALOG' },
  { id: 'transition', label: 'Transition',     short: 'TRANS' },
  { id: 'shot',       label: 'Shot',           short: 'SHOT' }
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
  transition: 'scene',
  shot: 'action'
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
  /* `dual` means one thing — "this cue is the RIGHT-hand speech of a
     dual-dialogue pair" — and only a character cue can carry it. Any
     other value is dropped rather than kept as a second meaning. An
     element that never had the field gets none, so an old script is
     byte-identical after a load and a save. */
  if ('dual' in el && !(el.dual === true && el.type === 'character')) delete el.dual;
  return el;
}

/* ---- dual dialogue -------------------------------------------
   A FLAG ON THE SECOND CUE, not a new element type and not a group
   object. Fountain marks the second speaker with a trailing `^` and
   that is the same decision: the pair is the speech the flagged cue
   opens (it and the parentheticals and dialogue under it) plus the
   speech immediately above it. Nothing else is stored. Which elements
   form the pair is DERIVED here, every time, because a stored pairing
   would be wrong the first time a line was inserted between them.

   A flag with no speech directly above it pairs with nothing and the
   cue simply prints as an ordinary one — it is never an error, and a
   later edit that puts a speech above it makes the pair appear. */
const SPEECH_BODY = new Set(['paren', 'dialogue']);

/** [{ left: [i0, i1], right: [j0, j1] }] — inclusive index ranges into
    `elements`. A cue is in at most one pair; a third flagged cue in a
    row starts no triple. */
export function dualPairs(elements) {
  const els = elements || [];
  const out = [];
  let usedTo = -1;                       // last index claimed by a pair
  for (let j = 1; j < els.length; j++) {
    const r = els[j];
    if (!r || r.type !== 'character' || r.dual !== true) continue;
    let k = j - 1;
    while (k >= 0 && els[k] && SPEECH_BODY.has(els[k].type)) k--;
    if (k < 0 || k <= usedTo || !els[k] || els[k].type !== 'character') continue;
    let m = j;
    while (m + 1 < els.length && els[m + 1] && SPEECH_BODY.has(els[m + 1].type)) m++;
    out.push({ left: [k, j - 1], right: [j, m] });
    usedTo = m;
  }
  return out;
}

/** Can the cue at `i` be made the right-hand side of a pair? Only when
    a speech sits directly above it. The page asks before it flags. */
export function canPairDual(elements, i) {
  const els = elements || [];
  if (!els[i] || els[i].type !== 'character') return false;
  let k = i - 1;
  while (k >= 0 && els[k] && SPEECH_BODY.has(els[k].type)) k--;
  return k >= 0 && !!els[k] && els[k].type === 'character';
}

/* ---- character extensions and (CONT'D) ----------------------
   (V.O.), (O.S.), (O.C.) and (CONT'D) are TEXT on the cue, as they
   are in every screenplay file format — nothing about them is stored
   apart from the words. What this adds is the one the writer usually
   forgets: the same character speaking again after a stretch of
   action inside the same scene takes (CONT'D). It is OFFERED, never
   written: `contdOffer()` says whether a cue qualifies and the page
   shows a one-click button. */
export const CONTD_RE = /\(\s*CONT['’]?D\s*\)/i;
export const EXTENSIONS = ['V.O.', 'O.S.', 'O.C.', "CONT'D"];

/** A cue's speaker, without its extensions: "RAVI (V.O.) (CONT'D)" -> "RAVI". */
export function cueSpeaker(text) {
  return String(text ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\^/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

/** True when the cue at `i` should be offered (CONT'D): the previous
    speech in the same scene is the same speaker, and only action (or a
    shot) stands between them. A cue that already says CONT'D, a blank
    cue, and a speaker separated by a slug line are all false. */
export function contdOffer(elements, i) {
  const els = elements || [];
  const me = els[i];
  if (!me || me.type !== 'character' || CONTD_RE.test(me.text)) return false;
  const who = cueSpeaker(me.text);
  if (!who) return false;
  let sawAction = false;
  for (let k = i - 1; k >= 0; k--) {
    const el = els[k];
    if (!el) return false;
    const t = String(el.text ?? '').trim();
    if (el.type === 'action' || el.type === 'shot') { if (t) sawAction = true; continue; }
    if (!t) continue;                                // a blank line is no line
    if (el.type === 'dialogue' || el.type === 'paren') {
      if (!sawAction) return false;                  // the same speech, not a return to it
      for (let c = k - 1; c >= 0; c--) {
        const cue = els[c];
        if (!cue) return false;
        if (cue.type === 'character') {
          if (cueSpeaker(cue.text) === who) return true;
          /* The right half of a dual pair: the left speaker spoke too,
             at the same moment, so either one returning continues. */
          if (cue.dual !== true || !canPairDual(els, c)) return false;
          let l = c - 1;
          while (l >= 0 && SPEECH_BODY.has(els[l].type)) l--;
          return cueSpeaker(els[l].text) === who;
        }
        if (!SPEECH_BODY.has(cue.type)) return false;
      }
      return false;
    }
    return false;                                    // scene, transition, another cue
  }
  return false;
}

/** The cue with (CONT'D) added in the conventional place: after any
    other extension, separated by one space. */
export function withContd(text) {
  const t = String(text ?? '').trim();
  if (!t || CONTD_RE.test(t)) return t;
  return t + " (CONT'D)";
}

/* ---- the title page --------------------------------------------
   Stored INSIDE the script blob as `titlePage`, and only when there
   is something in it. A new key would need registering in five
   places and a schema change before it could sync; a field inside a
   blob that already syncs needs neither. A script that has never had
   a title page has no `titlePage` field at all, which is what keeps
   an old blob byte-identical across a load and a save. */
export const TITLE_FIELDS = ['title', 'credit', 'author', 'source', 'draft', 'date', 'contact'];

export function normaliseTitlePage(tp) {
  const src = tp && typeof tp === 'object' ? tp : {};
  const out = {};
  for (const f of TITLE_FIELDS) out[f] = String(src[f] ?? '');
  return out;
}

export function hasTitlePage(tp) {
  return !!tp && typeof tp === 'object' && TITLE_FIELDS.some((f) => String(tp[f] ?? '').trim());
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
  const out = {
    elements: Array.isArray(parsed.elements) ? parsed.elements.map((e) => blankElement(e)) : [],
    revisions: Array.isArray(parsed.revisions) ? parsed.revisions.map(normaliseRevision) : [],
    documents: Array.isArray(parsed.documents) ? parsed.documents.map((d) => blankDocument(d)) : []
  };
  if (parsed.titlePage && typeof parsed.titlePage === 'object') {
    out.titlePage = normaliseTitlePage(parsed.titlePage);
  }
  return out;
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
    const blob = {
      elements: doc.elements || [],
      revisions: doc.revisions || [],
      documents: doc.documents || []
    };
    // Additive, and absent unless filled in; see TITLE_FIELDS above.
    if (hasTitlePage(doc.titlePage)) blob.titlePage = normaliseTitlePage(doc.titlePage);
    localStorage.setItem(SCRIPT_KEY, JSON.stringify(blob));
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
    elements: (elements || []).map((e) => {
      const copy = { id: uid(), type: e.type, text: String(e.text ?? '') };
      if (e.dual === true && e.type === 'character') copy.dual = true;
      return copy;
    })
  };
}

/** A restored revision gets fresh element ids: the live script and the
    snapshot are now two lists, and sharing ids between them would make
    a later edit look like it belonged to both. */
export function restoreElements(rev) {
  return (rev && Array.isArray(rev.elements) ? rev.elements : [])
    .map((e) => blankElement(e.dual === true
      ? { type: e.type, text: e.text, dual: true }
      : { type: e.type, text: e.text }));
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
  transition: { width: 61, before: 1 },
  shot:       { width: 61, before: 1 }
};

/* The two half-measure columns of a dual-dialogue block. Same
   proportions as screenplay-export.js's DUAL table. */
const DUAL_LAYOUT = {
  character: { width: 22 },
  paren:     { width: 24 },
  dialogue:  { width: 27 }
};

const bodyLines = (text, width) => String(text ?? '').split('\n').reduce(
  (n, line) => n + Math.max(1, Math.ceil(line.length / width)), 0);

export function elementLines(el) {
  const spec = LAYOUT[el && el.type] || LAYOUT.action;
  return spec.before + bodyLines(el && el.text, spec.width);
}

/** A dual-dialogue block costs its blank line and its TALLER column:
    the two speeches sit side by side, so they share their lines. */
function dualLines(elements, pair) {
  const col = (a, b) => {
    let n = 0;
    for (let i = a; i <= b; i++) {
      const el = elements[i];
      n += bodyLines(el.text, (DUAL_LAYOUT[el.type] || DUAL_LAYOUT.dialogue).width);
    }
    return n;
  };
  return 1 + Math.max(col(pair.left[0], pair.left[1]), col(pair.right[0], pair.right[1]));
}

export function totalLines(elements) {
  const els = elements || [];
  // The common case — no dual dialogue anywhere — pays for one scan.
  const pairs = els.some((e) => e && e.dual === true) ? dualPairs(els) : [];
  if (!pairs.length) return els.reduce((n, el) => n + elementLines(el), 0);
  const at = new Map(pairs.map((p) => [p.left[0], p]));
  let n = 0;
  for (let i = 0; i < els.length; i++) {
    const p = at.get(i);
    if (p) { n += dualLines(els, p); i = p.right[1]; continue; }
    n += elementLines(els[i]);
  }
  return n;
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
    case 'shot':
      /* Fountain has no shot element and no forcing character for one.
         A shot goes out as what it looks like on the page — one line,
         flush left, in capitals, with NO `!` — because that is the
         shape script-import.js reads back as a shot when it opens with
         a shot word (CLOSE ON, ANGLE ON, POV, INSERT…). A shot that
         does not comes back as action, and keeps every word. */
      return [t.toUpperCase().replace(/\n+/g, ' ')];
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

/** A title-page value as Fountain wants a multi-line one: the first
    line after the key, every further line indented three spaces. */
const fountainValue = (v) => String(v).trim().split('\n').map((l) => l.trim()).filter(Boolean).join('\n   ');

export function toFountain(doc, meta = {}) {
  const head = [];
  const tp = doc && hasTitlePage(doc.titlePage) ? doc.titlePage : null;
  head.push('Title: ' + fountainValue(String((tp && tp.title) || meta.title || '').trim() || 'Untitled'));
  if (tp && tp.credit.trim()) head.push('Credit: ' + fountainValue(tp.credit));
  const author = (tp && tp.author.trim()) || meta.author;
  if (author) head.push('Author: ' + fountainValue(author));
  if (tp && tp.source.trim()) head.push('Source: ' + fountainValue(tp.source));
  if (tp && tp.draft.trim()) head.push('Draft: ' + fountainValue(tp.draft));
  head.push('Draft date: ' + ((tp && tp.date.trim()) || meta.date || new Date().toISOString().slice(0, 10)));
  if (tp && tp.contact.trim()) head.push('Contact: ' + fountainValue(tp.contact));
  if (meta.revision) head.push('Revision: ' + meta.revision);

  const els = (doc && doc.elements) || [];
  // `^` only on a cue that really is the right half of a pair.
  const caret = new Set(dualPairs(els).map((p) => p.right[0]));

  const body = [];
  let prev = null;
  for (let i = 0; i < els.length; i++) {
    const el = els[i];
    const text = String(el.text ?? '').trim();
    if (!text) continue;
    const lines = fountainBlock(el.type, text);
    if (!lines.length) continue;
    if (caret.has(i)) lines[0] += ' ^';
    const glue = GLUED.has(el.type) && CUE_ISH.has(prev);
    if (body.length && !glue) body.push('');
    body.push(...lines);
    prev = el.type;
  }

  /* NO BOOKENDS ARE INVENTED. This used to emit `FADE IN:` and
     `FADE OUT.` unconditionally, and since the importer reads them
     back as transition elements — correctly, a real script may open
     on one — every export/import round trip grew the script by two.
     Measured 0 -> 2 -> 4 over two passes: a writer who exported to
     Fountain and came back twice ended up with four transitions they
     never typed.

     screenplay-export.js's toText() already refuses to do this and
     says why in as many words ("a file that adds one grows a second
     copy every time it is exported, imported and exported again").
     One exporter followed the rule and the other did not, which is
     the shape of bug this codebase keeps paying for. Whether the
     script opens on FADE IN: is an element the writer either typed
     or did not. */
  const out = head.slice();
  if (body.length) out.push('', ...body);
  return out.join('\n') + '\n';
}

/* ---- Final Draft (.fdx) export ------------------------------
   The inverse of PARSER 3 in script-import.js, and the reason it
   lives beside toFountain rather than in the typesetter: it is a
   description of the elements, not of a page. Element types map one
   to one onto Final Draft's paragraph types — that is the point of a
   typed element list — and a dual-dialogue pair goes out the way
   Final Draft writes one, as a single <Paragraph> holding a
   <DualDialogue> with both speeches inside it.

   A parenthetical is stored without its brackets and Final Draft
   stores it with them, so they go on here and come off on import. */
const FDX_TYPE_OUT = {
  scene: 'Scene Heading', action: 'Action', character: 'Character',
  paren: 'Parenthetical', dialogue: 'Dialogue', transition: 'Transition', shot: 'Shot'
};
const xmlEsc = (s) => String(s ?? '').replace(/[&<>"']/g, (m) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
}[m]));

function fdxParagraph(el, pad) {
  let text = String(el.text ?? '').trim();
  if (el.type === 'paren' && !/^\(.*\)$/.test(text)) text = '(' + text + ')';
  return pad + '<Paragraph Type="' + (FDX_TYPE_OUT[el.type] || 'Action') + '">'
    + '<Text>' + xmlEsc(text) + '</Text></Paragraph>';
}

export function toFDX(doc, meta = {}) {
  const els = (doc && doc.elements) || [];
  const pairs = new Map(dualPairs(els).map((p) => [p.left[0], p]));
  const out = [
    '<?xml version="1.0" encoding="UTF-8" standalone="no" ?>',
    '<FinalDraft DocumentType="Script" Template="No" Version="5">',
    '  <Content>'
  ];
  for (let i = 0; i < els.length; i++) {
    const pair = pairs.get(i);
    if (pair) {
      out.push('    <Paragraph>', '      <DualDialogue>');
      for (let k = pair.left[0]; k <= pair.right[1]; k++) {
        if (String(els[k].text ?? '').trim()) out.push(fdxParagraph(els[k], '        '));
      }
      out.push('      </DualDialogue>', '    </Paragraph>');
      i = pair.right[1];
      continue;
    }
    if (!String(els[i].text ?? '').trim()) continue;
    out.push(fdxParagraph(els[i], '    '));
  }
  out.push('  </Content>');

  /* The title page: Final Draft keeps it as its own <Content>, centred
     lines then the contact block bottom left. Read back by the
     importer, which takes the first line as the title. */
  const tp = doc && hasTitlePage(doc.titlePage) ? doc.titlePage : null;
  const title = String((tp && tp.title) || meta.title || '').trim() || 'Untitled';
  const centred = [title.toUpperCase()];
  if (tp) {
    if (tp.credit.trim() || tp.author.trim()) centred.push('', tp.credit.trim() || 'Written by', '', tp.author.trim());
    if (tp.source.trim()) centred.push('', tp.source.trim());
  } else if (meta.author) centred.push('', 'Written by', '', String(meta.author));
  const para = (t, align) => '      <Paragraph Alignment="' + align + '" Type="Action">'
    + '<Text>' + xmlEsc(t) + '</Text></Paragraph>';
  out.push('  <TitlePage>', '    <Content>');
  centred.forEach((t) => out.push(para(t, 'Center')));
  if (tp) {
    for (const line of [tp.draft, tp.date].map((s) => s.trim()).filter(Boolean)) out.push(para(line, 'Right'));
    for (const line of tp.contact.split('\n').map((s) => s.trim()).filter(Boolean)) out.push(para(line, 'Left'));
  }
  out.push('    </Content>', '  </TitlePage>', '</FinalDraft>');
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
  dualPairs, canPairDual, contdOffer, withContd, cueSpeaker, CONTD_RE, EXTENSIONS,
  TITLE_FIELDS, normaliseTitlePage, hasTitlePage,
  toFountain, toFDX, slugify, projectTitle
};
