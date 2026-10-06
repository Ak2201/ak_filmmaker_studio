/* ============================================================
   FORMAT RULES — the screenplay format, as checks
   ------------------------------------------------------------
   Phase 3 of docs/SCREENPLAY-WRITER-PLAN.md. Pure: no DOM, no
   storage, nothing written. It takes the script's element list —
   the `{ type, text }` objects src/lib/script.js stores — and
   returns what a script reader would flag:

       [{ index, ruleId, severity, message, why }]

   The copy and the lists (which prefixes, which times of day, the
   transitions that do not end in TO:) are content in
   src/data/format-rules.json, rule 2 of CLAUDE.md. What is here is
   only how each one is tested.

   FOUR DECISIONS THAT KEEP IT QUIET, because a guide that flags a
   correct page is a guide people switch off:

   - AN UNKNOWN TYPE IS NEUTRAL. Phase 1 adds a `shot` element and
     there will be others. A type this file does not know is never
     flagged, and it never makes a neighbour wrong either: dialogue
     under a shot is not "dialogue with no speaker", it is something
     this file has no opinion about.
   - AN EMPTY ELEMENT IS NEVER FLAGGED. It is a line somebody is
     about to write.
   - CASE RULES ONLY SEE LATIN LETTERS. A cue or a heading in Tamil
     script has no capitals to get wrong, and dialogue — Tanglish or
     anything else — has no case rule at all.
   - THE PAGE METRIC IS script.js's OWN. An action block's lines and
     a scene's pages are counted with `elementLines()`, so "over four
     lines" means what the page count means by a line.
   ============================================================ */
import RULES from '../data/format-rules.json';
import { elementLines, LINES_PER_PAGE } from './script.js';

export const KNOWN_TYPES = new Set(['scene', 'action', 'character', 'paren', 'dialogue', 'transition']);

const RULE_BY_ID = Object.fromEntries(RULES.rules.map((r) => [r.id, r]));
export const RULE_IDS = RULES.rules.map((r) => r.id);
export const LIMITS = RULES.limits;

const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/* A heading prefix: INT. / EXT. / INT./EXT. / I/E / EST., with or
   without the full stop, followed by a space or the end. Case-blind,
   because the editor shows the heading in capitals whatever was
   typed and the export uppercases it. */
const PREFIX_RE = new RegExp('^(?:' + RULES.prefixes
  .map((p) => reEsc(p).replace(/\\\./g, '\\.?').replace(/\\\//g, '\\s*\\/\\s*'))
  .join('|') + ')(?=\\s|$)', 'i');

/* The time of day: the last dash-separated part of the heading, or
   the last words of it, after any trailing "(2014)" or "(FLASHBACK)"
   is set aside. Whole words, so INT. DAYCARE is not a DAY. */
const TIMES = RULES.times.map((t) => t.toUpperCase()).sort((a, b) => b.length - a.length);
const TIME_AT_END = new RegExp('(?:^|[\\s\\-–—.,/])(?:' + TIMES.map(reEsc).join('|') + ')\\.?$');
const TIME_ONLY = new RegExp('^(?:' + TIMES.map(reEsc).join('|') + ')\\.?$');
const SEGMENT_SPLIT = /\s+[-–—]+\s+|\s*[–—]+\s*|\s+-\s*|\s*-\s+/;

const NO_TO = new Set(RULES.transitionsWithoutTo.map((t) => t.toUpperCase()));

const hasLatin = (s) => /[A-Za-z]/.test(s);
const hasLower = (s) => /[a-z]/.test(s);

/** The body lines of an element on the page — its total less the
    blank line(s) the format puts above it — by script.js's metric. */
export function bodyLines(el) {
  return elementLines(el) - (elementLines({ type: el.type, text: '' }) - 1);
}

/** A cue's speaker, without its extensions: "RAVI (CONT'D)" → RAVI. */
export function speakerOf(text) {
  return String(text ?? '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\^\s*$/, '')          // Fountain's dual-dialogue caret
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}
const hasContd = (text) => /\(\s*CONT['’]?D\s*\)|\(\s*CONTINUED\s*\)/i.test(String(text ?? ''));

/** True when a heading carries a time of day. */
export function headingHasTime(text) {
  const up = String(text ?? '').trim().toUpperCase()
    .replace(/(\s*\([^)]*\))+\s*$/, '')    // DAY (2014) → DAY
    .trim();
  if (!up) return false;
  if (TIME_AT_END.test(up)) return true;
  const parts = up.split(SEGMENT_SPLIT).map((p) => p.replace(/\s*\([^)]*\)\s*/g, ' ').trim());
  return parts.slice(1).some((p) => TIME_ONLY.test(p));
}

export function headingHasPrefix(text) {
  return PREFIX_RE.test(String(text ?? '').trim());
}

function finding(index, ruleId) {
  const r = RULE_BY_ID[ruleId];
  return { index, ruleId, severity: r.severity, message: r.message, why: r.why };
}

/* ---- context ------------------------------------------------
   The few things a rule needs beyond its own element. Built once per
   check from the whole list, which is a single pass even for a
   feature (2,361 elements on the sample). */
function context(elements) {
  const cast = new Set();
  for (const el of elements) {
    if (el && el.type === 'character' && el.text) {
      const s = speakerOf(el.text);
      if (s) { cast.add(s); cast.add(s.split(' ')[0]); }
    }
  }
  return { cast };
}

/* ---- one element -------------------------------------------- */
function checkOne(elements, i, ctx, out) {
  const el = elements[i];
  if (!el || !KNOWN_TYPES.has(el.type)) return;
  const text = String(el.text ?? '');
  const t = text.trim();
  if (!t) return;

  switch (el.type) {
    case 'scene': {
      if (!hasLatin(t)) break;                         // a Tamil-script heading: no opinion
      if (!headingHasPrefix(t)) out.push(finding(i, 'heading-prefix'));
      if (!headingHasTime(t)) out.push(finding(i, 'heading-time'));
      const pages = scenePages(elements, i);
      if (pages > LIMITS.scenePages) out.push(finding(i, 'scene-long'));
      break;
    }
    case 'action':
      if (bodyLines(el) > LIMITS.actionLines) out.push(finding(i, 'action-long'));
      break;
    case 'character': {
      // Extensions like (V.O.) are part of the cue and capitals too;
      // only the Latin letters are judged.
      if (hasLower(t.replace(/\^\s*$/, ''))) out.push(finding(i, 'cue-caps'));
      const prev = previousCueInScene(elements, i);
      if (prev !== null && !hasContd(t)
          && speakerOf(elements[prev].text) === speakerOf(t)
          && actionBetween(elements, prev, i)) {
        out.push(finding(i, 'contd'));
      }
      break;
    }
    case 'paren': {
      if (!(t.startsWith('(') && t.endsWith(')'))) out.push(finding(i, 'paren-closed'));
      if (bodyLines({ type: 'paren', text: t.startsWith('(') ? t : '(' + t + ')' }) > LIMITS.parenLines) {
        out.push(finding(i, 'paren-long'));
      }
      const inner = t.replace(/^\(+\s*/, '');
      const first = (inner.match(/^[^\s,;:.)]+/) || [''])[0];
      // A capital start is fine when the word is a name in this script
      // (to Anbu is lower case; "Anbu, softly" starts with a name) or an
      // abbreviation in capitals (V.O., O.S.).
      if (/^[A-Z]/.test(first) && hasLower(first)
          && !ctx.cast.has(first.toUpperCase().replace(/['’]S$/, ''))
          && !ctx.cast.has(first.toUpperCase())) {
        out.push(finding(i, 'paren-capital'));
      }
      break;
    }
    case 'dialogue':
      if (speakerMissing(elements, i)) out.push(finding(i, 'dialogue-speaker'));
      break;
    case 'transition': {
      const up = t.toUpperCase();
      if (hasLower(t)) out.push(finding(i, 'transition-caps'));
      if (!/TO:$/.test(up) && !NO_TO.has(up)) out.push(finding(i, 'transition-to'));
      break;
    }
    default:
  }
}

/* Dialogue needs a cue above it. Walk back over parentheticals and
   dialogue (a speech may be split across elements); a cue is the
   answer, an unknown type is "no opinion", anything else is a miss. */
function speakerMissing(elements, i) {
  for (let k = i - 1; k >= 0; k--) {
    const e = elements[k];
    if (!e) continue;
    if (e.type === 'character') return false;
    if (e.type === 'paren' || e.type === 'dialogue') continue;
    if (!KNOWN_TYPES.has(e.type)) return false;
    return true;
  }
  return true;
}

/* The cue before this one in the same scene, or null. */
function previousCueInScene(elements, i) {
  for (let k = i - 1; k >= 0; k--) {
    const e = elements[k];
    if (!e) continue;
    if (e.type === 'scene' || e.type === 'transition') return null;
    if (e.type === 'character' && String(e.text ?? '').trim()) return k;
  }
  return null;
}

/* Only action between two cues: the case (CONT'D) exists for. A
   different speaker in between is a conversation, not a continuation —
   that is caught because the previous cue is then that other speaker. */
function actionBetween(elements, from, to) {
  let action = false;
  for (let k = from + 1; k < to; k++) {
    const e = elements[k];
    if (!e) continue;
    if (e.type === 'action' && String(e.text ?? '').trim()) action = true;
    else if (!KNOWN_TYPES.has(e.type)) return false;   // a shot between: no opinion
  }
  return action;
}

/** A scene's length in pages, from its heading at `i` to the next. */
export function scenePages(elements, i) {
  let lines = 0;
  for (let k = i; k < elements.length; k++) {
    const e = elements[k];
    if (k > i && e && e.type === 'scene') break;
    if (e && KNOWN_TYPES.has(e.type)) lines += elementLines(e);
  }
  return lines / LINES_PER_PAGE;
}

/** The scene heading index an element belongs to, or -1 before the first. */
export function sceneStartOf(elements, i) {
  for (let k = Math.min(i, elements.length - 1); k >= 0; k--) {
    if (elements[k] && elements[k].type === 'scene') return k;
  }
  return -1;
}

/* ---- the public checks -------------------------------------- */

/** Every finding in the script, in element order. */
export function checkScript(elements) {
  const list = Array.isArray(elements) ? elements : [];
  const ctx = context(list);
  const out = [];
  for (let i = 0; i < list.length; i++) checkOne(list, i, ctx, out);
  return out;
}

/** Findings for the elements at `indices` only — the live check, which
    looks at the line being written and its neighbours. A change to an
    element can also change its scene's length, so the scene's heading
    is included whenever one of its lines is. */
export function checkAround(elements, indices) {
  const list = Array.isArray(elements) ? elements : [];
  const ctx = context(list);
  const want = new Set();
  for (const i of indices || []) {
    if (i < 0 || i >= list.length) continue;
    want.add(i);
    const s = sceneStartOf(list, i);
    if (s >= 0) want.add(s);
  }
  const out = [];
  for (const i of Array.from(want).sort((a, b) => a - b)) checkOne(list, i, ctx, out);
  return out;
}

export function ruleById(id) { return RULE_BY_ID[id] || null; }

export default { checkScript, checkAround, ruleById, RULE_IDS, KNOWN_TYPES, LIMITS };
