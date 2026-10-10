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
  // Additive, and absent unless the numbers were ever locked.
  const numbering = normaliseNumbering(parsed.numbering);
  if (numbering) out.numbering = numbering;
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
    /* A locked script's new headings take their letters HERE, at the
       save, and the in-memory doc keeps them — so a number is decided
       once, by the save a person's edit caused, and never on a read. */
    if (doc.numbering && doc.numbering.locked) {
      doc.numbering = settleNumbering(doc.elements || [], doc.numbering);
      blob.numbering = doc.numbering;
    }
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
      /* `liveId` is the id the element had in the live script when the
         snapshot was taken. It is NOT the snapshot's id (that stays
         fresh, for the reason restoreElements() gives) — it is what
         lets src/lib/script-diff.js say "this line was edited" rather
         than "one line removed, one added" when two revisions, or a
         revision and the live script, are compared. A revision taken
         before the field existed has none, and the diff falls back to
         aligning text. */
      const copy = { id: uid(), type: e.type, text: String(e.text ?? '') };
      if (e.id) copy.liveId = String(e.id);
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

/* ---- locked scene numbers ------------------------------------
   Unlocked, a scene's number is its position: the Nth heading is
   scene N, on screen, in the PDF and in the Breakdown. That is right
   while a script is being written and wrong the day it is scheduled —
   a call sheet, the sides and a stripboard all say "scene 12", and an
   inserted scene that renumbered 12 to 13 makes every one of those
   papers point at the wrong scene.

   So a production LOCKS the numbers. From then on:
     · a heading inserted after 12 is 12A, the next one after that 12B
       (not 12AA — nobody on a floor says it); one inserted before
       scene 1 is A1, the next B1;
     · a heading deleted leaves its number behind as OMITTED, printed
       where the scene was ("12  OMITTED"), so 11 is still followed by
       12 on paper and nobody hunts for a missing scene;
     · a moved heading keeps its number.

   STORED INSIDE THE SCRIPT BLOB as `numbering`, absent until a script
   is first locked (no new key, and an old blob is byte-identical
   across a load and a save):

     numbering: { locked: true, at: ISO, ids: { [headingId]: { n, t } } }

   `ids` is the record: every number ever handed out, keyed by the
   heading it was handed to, with that heading's text as of the last
   save (`t`). An entry whose heading is gone IS the omitted scene — no
   second list. `t` is how a cut-and-paste (a new id, the same words)
   gets its number back, the same rule scene-sync.js uses for a move.

   ONE FUNCTION decides every number: `sceneNumbers()`. The page view,
   the PDF, the text export, the Breakdown's rows (through
   scene-sync.js) and the save all ask it, so no two of them can
   disagree about what scene 12A is. A heading new since the last save
   gets a PROVISIONAL number from it, and `settleNumbering()` — called
   by saveScript(), at a save a person's edit caused — writes that same
   number into the record, so what was on screen is what is kept.

   KNOWN EDGE, accepted: a second insert into a gap with no letter left
   in order (one between 12 and an existing 12A) takes the next FREE
   letter, 12B, so the gap prints 12, 12B, 12A. Unique and stable beats
   ordered-but-renumbered, which is the one thing a lock forbids.
   Unlocking is the way to tidy it, and unlocking renumbers. */
const SN_RE = /^([A-Z]*)(\d+)([A-Z]*)$/;
const LEAD_NUMBER = /^([A-Z]?\d+[A-Z]{0,2})[.)]?\s+(?=\S)/i;
const snNorm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

/** "12A" -> { pre: '', d: 12, suf: 'A' }; "A1" -> { pre: 'A', d: 1, suf: '' }; else null. */
export function parseSceneNumber(n) {
  const m = SN_RE.exec(String(n ?? '').trim().toUpperCase());
  return m ? { pre: m[1], d: Number(m[2]), suf: m[3] } : null;
}

/** Script order of two scene numbers: A1 < B1 < 1 < 1A < 1B < 2. */
export function compareSceneNumbers(a, b) {
  const A = parseSceneNumber(a), B = parseSceneNumber(b);
  if (!A || !B) return A ? -1 : B ? 1 : String(a).localeCompare(String(b));
  if (A.d !== B.d) return A.d - B.d;
  const rank = (x) => (x.pre ? 0 : x.suf ? 2 : 1);
  if (rank(A) !== rank(B)) return rank(A) - rank(B);
  const la = A.pre || A.suf, lb = B.pre || B.suf;
  return la.length - lb.length || (la < lb ? -1 : la > lb ? 1 : 0);
}

/** '' -> A, A -> B, Z -> AA, AZ -> BA. */
function nextLetters(s) {
  if (!s) return 'A';
  const c = s.split('');
  for (let i = c.length - 1; i >= 0; i--) {
    if (c[i] !== 'Z') { c[i] = String.fromCharCode(c[i].charCodeAt(0) + 1); return c.join(''); }
    c[i] = 'A';
  }
  return 'A' + c.join('');
}

/** The script's headings, the way the paginator and scene-sync count
    them: a `scene` element with text. */
function snHeadings(elements) {
  const out = [];
  for (const el of elements || []) {
    if (el && el.type === 'scene' && String(el.text ?? '').trim()) out.push(el);
  }
  return out;
}

/** The number a heading's own text carries ("12A INT. …"), or ''. */
function textNumber(text) {
  const m = LEAD_NUMBER.exec(String(text ?? '').trim());
  return m && parseSceneNumber(m[1]) ? m[1].toUpperCase() : '';
}

export function normaliseNumbering(raw) {
  if (!raw || typeof raw !== 'object' || raw.locked !== true) return null;
  const ids = {};
  const src = raw.ids && typeof raw.ids === 'object' ? raw.ids : {};
  for (const [id, e] of Object.entries(src)) {
    const n = String((e && e.n) ?? '').trim().toUpperCase();
    if (id && n) ids[id] = { n, t: String((e && e.t) ?? '') };
  }
  return { locked: true, at: String(raw.at || nowISO()), ids };
}

export const isNumberingLocked = (numbering) => !!(numbering && numbering.locked === true);

/**
 * Every scene number as the script reads now. PURE.
 *   → { locked, byId: Map(headingId → number),
 *       omitted: [{ number, before: headingId | null }],   null = at the end
 *       moved: Map(newHeadingId → oldEntryId),             a cut-and-paste
 *       fresh: [headingId] }                               new since the last save
 * Unlocked, the number is the position, as it always was.
 */
export function sceneNumbers(elements, numbering) {
  const heads = snHeadings(elements);
  const out = { locked: false, byId: new Map(), omitted: [], moved: new Map(), fresh: [] };
  if (!isNumberingLocked(numbering)) {
    heads.forEach((h, i) => out.byId.set(h.id, String(i + 1)));
    return out;
  }
  out.locked = true;
  const ids = numbering.ids || {};
  const taken = new Set(Object.values(ids).map((e) => String(e.n).toUpperCase()));
  const claimed = new Set();                        // entry keys in use
  const present = new Set(heads.map((h) => h.id));

  // 1. the heading still has its number
  for (const h of heads) {
    if (ids[h.id] && !out.byId.has(h.id)) { out.byId.set(h.id, ids[h.id].n); claimed.add(h.id); }
  }
  // 2. a heading that came back under a new id, with the same words
  const orphans = Object.keys(ids).filter((k) => !present.has(k))
    .sort((a, b) => compareSceneNumbers(ids[a].n, ids[b].n));
  if (orphans.length) {
    for (const h of heads) {
      if (out.byId.has(h.id)) continue;
      const key = snNorm(h.text);
      const o = orphans.find((k) => !claimed.has(k) && snNorm(ids[k].t) === key);
      if (!o) continue;
      claimed.add(o);
      out.byId.set(h.id, ids[o].n);
      out.moved.set(h.id, o);
    }
  }
  // 3. new headings: the number the text carries if it is free, else a letter
  heads.forEach((h, k) => {
    if (out.byId.has(h.id)) return;
    out.fresh.push(h.id);
    let n = textNumber(h.text);
    if (n && taken.has(n)) n = '';
    if (!n) {
      let prev = '';
      for (let j = k - 1; j >= 0 && !prev; j--) prev = out.byId.get(heads[j].id) || '';
      let next = '';
      for (let j = k + 1; j < heads.length && !next; j++) next = out.byId.get(heads[j].id) || '';
      n = letterAfter(prev, next, taken);
    }
    taken.add(n);
    out.byId.set(h.id, n);
  });
  // 4. what is left of the record is omitted, placed by its number
  if (orphans.length) {
    const order = heads.map((h) => out.byId.get(h.id));
    for (const k of orphans) {
      if (claimed.has(k)) continue;
      const n = ids[k].n;
      const at = order.findIndex((m) => compareSceneNumbers(m, n) > 0);
      out.omitted.push({ number: n, before: at < 0 ? null : heads[at].id });
    }
  }
  return out;
}

/** The number a heading inserted between `prev` and `next` takes. */
function letterAfter(prev, next, taken) {
  const free = (make, start) => {
    let s = start;
    for (let guard = 0; guard < 18278 && taken.has(make(s)); guard++) s = nextLetters(s);
    return make(s);
  };
  const P = parseSceneNumber(prev);
  if (P && P.pre) return free((s) => s + P.d, nextLetters(P.pre));          // A1 → B1
  if (P) return free((s) => P.d + s, nextLetters(P.suf));                   // 12 → 12A, 12A → 12B
  if (prev) return free((s) => prev.toUpperCase() + s, 'A');                // a number nobody parses
  const N = parseSceneNumber(next);
  if (N) return free((s) => s + N.d, 'A');                                  // before 1 → A1
  // Nothing numbered anywhere: plain integers.
  let i = 1;
  while (taken.has(String(i))) i++;
  return String(i);
}

/**
 * Lock the numbers. `preset` — Map(headingId → number), the numbers the
 * Breakdown's rows carry (an imported file's, for one) — wins when it
 * numbers every heading uniquely and in order;
 * else the numbers the headings' own text carries, when every one does,
 * uniquely; else the positions, which is what the page view and the
 * PDF were already showing.
 */
export function lockNumbering(elements, preset) {
  const heads = snHeadings(elements);
  const unique = (list) => list.every(Boolean)
    && new Set(list.map((n) => n.toUpperCase())).size === list.length;
  let nums = null;
  if (preset && typeof preset.get === 'function') {
    const list = heads.map((h) => String(preset.get(h.id) || '').trim().toUpperCase());
    /* …and only when they run in script order. Rows numbered by an
       import read 47, 48, 48A, 49 and are locked as they are; rows an
       unlocked sync numbered "next free" (1, 2, 6, 3) are not a
       numbering anybody issued, and the positions win. */
    const ascending = list.every((n, i) => !i || compareSceneNumbers(list[i - 1], n) < 0);
    if (heads.length && unique(list) && ascending && list.every((n) => parseSceneNumber(n))) nums = list;
  }
  if (!nums) {
    const list = heads.map((h) => textNumber(h.text));
    if (heads.length && unique(list)) nums = list;
  }
  if (!nums) nums = heads.map((h, i) => String(i + 1));
  const ids = {};
  heads.forEach((h, i) => { ids[h.id] = { n: nums[i], t: snNorm(h.text) }; });
  return { locked: true, at: nowISO(), ids };
}

/** The record after a save: every heading's number (the provisional
    ones made permanent), moved entries re-keyed to the new id, current
    text noted, omitted entries kept. PURE — returns a new object. */
export function settleNumbering(elements, numbering) {
  if (!isNumberingLocked(numbering)) return numbering;
  const res = sceneNumbers(elements, numbering);
  const ids = {};
  const movedFrom = new Set(res.moved.values());
  for (const [k, e] of Object.entries(numbering.ids || {})) {
    if (!movedFrom.has(k)) ids[k] = { n: e.n, t: e.t };
  }
  for (const h of snHeadings(elements)) ids[h.id] = { n: res.byId.get(h.id), t: snNorm(h.text) };
  return { locked: true, at: numbering.at, ids };
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

/** One page is roughly one minute of screen time. Printed as minutes,
 *  and as hours and minutes from an hour up: "106:30" beside "on
 *  screen" read as a hundred and six hours (UX audit L29), and a
 *  page-a-minute estimate has no business quoting seconds anyway. */
export function formatRuntime(pages) {
  const mins = Math.round(Math.max(0, Number(pages) || 0));
  if (mins < 60) return mins + ' min';
  return Math.floor(mins / 60) + 'h ' + String(mins % 60).padStart(2, '0') + 'm';
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
/* A line of Tamil the importer would take for a character cue: short, no
   lowercase Latin, not ending like a sentence. Mirrors tamilCueOk() in
   script-import.js, which this module cannot import (it imports us). */
const TAMIL_CUE_SHAPE = (l) => /[஀-௿]/.test(l) && !/[a-z]/.test(l)
  && l.split(/\s+/).filter(Boolean).length <= 3 && l.length <= 30 && !/[.!?।…]$/.test(l);

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
    default: {
      /* Action the importer (src/lib/script-import.js) would misread is
         FORCED with `!`: capitals (a cue), a short Tamil line (a Tamil
         cue), or a first character that means something in Fountain —
         # section, = synopsis or page break, @ cue, > transition,
         . heading, ~ lyric, ! itself. The importer strips ONE leading
         `!` from EVERY line of a forced block, so when any line needs it
         every line gets one — a block half forced would leak the mark. */
      const lines = t.split('\n');
      const needs = (line) => {
        const l = line.trim();
        if (!l) return false;
        if (l === l.toUpperCase() && /[A-Z]/.test(l)) return true;
        if (TAMIL_CUE_SHAPE(l)) return true;
        if (SLUG_START.test(l)) return true;
        return /^(#|=|@|>|~|!)/.test(l) || (l[0] === '.' && l[1] !== '.');
      };
      return lines.some(needs) ? lines.map((line) => '!' + line) : lines;
    }
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
  sceneNumbers, lockNumbering, settleNumbering, normaliseNumbering, compareSceneNumbers,
  parseSceneNumber, isNumberingLocked,
  elementLines, totalLines, pageCount, formatPages, formatRuntime, wordCount,
  dualPairs, canPairDual, contdOffer, withContd, cueSpeaker, CONTD_RE, EXTENSIONS,
  TITLE_FIELDS, normaliseTitlePage, hasTitlePage,
  toFountain, toFDX, slugify, projectTitle
};
