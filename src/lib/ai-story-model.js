/* ============================================================
   AI STORY MODEL — the pure half of the two story-lane Desk tasks
   ------------------------------------------------------------
   docs/AI-EVERYWHERE.md sections 9 and 10: `character-arcs` and
   `script-cleanup`. Everything here is a DECISION and nothing here
   touches a document, storage or the network, so
   scripts/test-ai-story.mjs runs it in Node: the schemas, the facts
   that leave the browser, a reply checked against what was sent, the
   blanks-only merge, the word-keep check and the undo guards.
   ai-tasks-story.js wires these to the models that own the data.

   Two rules that run through both:
     - a model that names an id we did not send is dropped;
     - what the writer typed is never overwritten. An arc field is
       filled only while it is empty NOW; a cleaned-up block keeps the
       writer's words, so a reply that rewords is refused.
   ============================================================ */

const ARC_FIELDS = ['arc', 'arcStart', 'arcEnd'];
const ARC_LABEL = { arc: 'Arc', arcStart: 'Starts', arcEnd: 'Ends' };
const ARC_MAX = { arc: 600, arcStart: 300, arcEnd: 300 };
export const ARC_FIELD_NAMES = ARC_FIELDS;

const clipText = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
const blank = (v) => !String(v == null ? '' : v).trim();
const oneLine = (s, n) => clipText(s, n).replace(/\s+/g, ' ');

/* ============================================================
   9. character-arcs
   ============================================================ */
export const ARCS_SYSTEM =
  'You are a story editor helping a filmmaker describe how each character changes. You are given the characters '
  + 'the writer has described, the beat sheet steps and the scene synopses the writer wrote. For each character '
  + 'you write only the arc fields listed as empty for that character: "arc" is how they change across the whole '
  + 'film, "arcStart" is who they are at the start, "arcEnd" is who they are at the end. Write one or two plain '
  + 'sentences each, from what the writer wrote. Do not invent plot, names or events that are not there; if the '
  + 'material does not say, write less. You use only the character ids you are given.';

export function arcsSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['arcs'],
    properties: {
      arcs: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['characterId', 'arc', 'arcStart', 'arcEnd'],
          properties: {
            characterId: { type: 'string', description: 'the characterId exactly as given' },
            arc: { type: 'string', description: 'how they change across the film; empty string if not asked' },
            arcStart: { type: 'string', description: 'who they are at the start; empty string if not asked' },
            arcEnd: { type: 'string', description: 'who they are at the end; empty string if not asked' }
          }
        }
      }
    }
  };
}

/**
 * The facts that leave the browser for character-arcs.
 *   views    characters.js views (stored + the blueprint's virtual ones)
 *   steps    the beat sheet's steps in reading order ({text})
 *   scenes   scenes.js rows
 *   slugOf   (scene) -> its slug line
 * Only a character with a name and at least one empty arc field is sent,
 * and only its name, role, want, need and the three arc fields. Nothing
 * from contacts. Steps and scenes are the story the writer wrote.
 */
export function arcsFacts({ views = [], steps = [], scenes = [], slugOf = () => '' } = {}) {
  const characters = [];
  for (const v of views || []) {
    if (!v || v.derived || blank(v.name) || blank(v.id)) continue;
    const empty = ARC_FIELDS.filter((f) => blank(v[f]));
    if (!empty.length) continue;
    characters.push({
      characterId: String(v.id),
      name: oneLine(v.name, 80),
      role: String(v.role || ''),
      want: oneLine(v.want, 300),
      need: oneLine(v.need, 300),
      arc: oneLine(v.arc, 300),
      arcStart: oneLine(v.arcStart, 200),
      arcEnd: oneLine(v.arcEnd, 200),
      empty
    });
  }
  const beats = (steps || []).map((s) => oneLine(s && s.text, 300)).filter(Boolean).slice(0, 80);
  const sceneRows = (scenes || []).map((s) => ({
    number: String((s && s.number) || '').trim(),
    slug: oneLine(slugOf(s), 120),
    synopsis: oneLine(s && s.synopsis, 240)
  })).filter((s) => s.synopsis).slice(0, 120);
  return { characters, beats, scenes: sceneRows };
}

export function arcsPrompt(facts, refine = '') {
  const L = [];
  L.push('For each character below, write ONLY the arc fields named in its "empty" list. Leave every other field as an empty string. '
    + 'Use what the beat sheet and the scenes say; where they say nothing about a character, keep it short rather than guess.');
  L.push('Characters, the beat sheet steps and the scenes the writer wrote (JSON):');
  L.push(JSON.stringify(facts));
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

/** The part of the previous answer a refinement re-sends. */
export function arcsPrevious(previous) {
  if (previous && Array.isArray(previous.items)) {
    return previous.items.map((it) => ({ characterId: it.characterId, ...(it.fields || {}) }));
  }
  return previous;
}

/**
 * A reply, checked against what was sent. Dropped: a characterId not sent,
 * a duplicate, a field that was not empty at Run (it would not be written),
 * a field the model left blank. A character with nothing usable left is
 * dropped and counted.
 * @returns {{items:{id,text,detail,characterId,fields}[], dropped:number}}
 */
export function readArcs(parsed, facts) {
  const sent = new Map(((facts && facts.characters) || []).map((c) => [c.characterId, c]));
  const seen = new Set();
  const items = [];
  let dropped = 0;
  const arr = parsed && typeof parsed === 'object' && Array.isArray(parsed.arcs) ? parsed.arcs : [];
  for (const a of arr) {
    const id = a && typeof a === 'object' ? String(a.characterId == null ? '' : a.characterId) : '';
    const c = sent.get(id);
    if (!c || seen.has(id)) { dropped += 1; continue; }
    seen.add(id);
    const fields = {};
    for (const f of c.empty) {
      const v = clipText(a[f], ARC_MAX[f]);
      if (v) fields[f] = v;
    }
    const keys = ARC_FIELDS.filter((f) => fields[f]);
    if (!keys.length) { dropped += 1; continue; }
    items.push({
      id: 'c' + id,
      text: c.name + ': ' + keys.map((f) => ARC_LABEL[f].toLowerCase()).join(', '),
      detail: keys.map((f) => ARC_LABEL[f] + ': ' + fields[f]).join('\n'),
      characterId: id,
      fields
    });
  }
  return { items, dropped };
}

/**
 * What Accept writes, against the characters as they are NOW. A field that
 * has text now is skipped and counted; a character that is gone is skipped.
 *   selected   the ticked items (readArcs shape)
 *   nowOf      (characterId) -> the current view, or null
 * @returns {{writes:{characterId, field, value}[], skipped:number}}
 */
export function planArcWrites(selected, nowOf) {
  const writes = [];
  let skipped = 0;
  for (const it of selected || []) {
    if (!it || !it.fields) continue;
    const v = nowOf(it.characterId);
    for (const f of ARC_FIELDS) {
      if (!Object.prototype.hasOwnProperty.call(it.fields, f)) continue;
      if (!v || !blank(v[f])) { skipped += 1; continue; }
      writes.push({ characterId: it.characterId, field: f, value: String(it.fields[f]) });
    }
  }
  return { writes, skipped };
}

/**
 * The undo: blank exactly the fields written that still read what was
 * written. `valueOf(characterId, field)` is the value now (null when the
 * character is gone).
 * @returns {{blank:{characterId, field}[], kept:number}}
 */
export function planArcUndo(written, valueOf) {
  const out = [];
  let kept = 0;
  for (const w of written || []) {
    const now = valueOf(w.characterId, w.field);
    if (now != null && String(now) === String(w.value)) out.push({ characterId: w.characterId, field: w.field });
    else kept += 1;
  }
  return { blank: out, kept };
}

/* ============================================================
   10. script-cleanup
   ============================================================ */
export const CLEANUP_MAX_CHARS = 20000;
export const CLEANUP_TYPES = ['scene', 'action', 'character', 'dialogue', 'paren', 'transition'];
const TYPE_LABEL = { scene: 'Scene heading', action: 'Action', character: 'Character', dialogue: 'Dialogue', paren: 'Parenthetical', transition: 'Transition' };
export const cleanupTypeLabel = (t) => TYPE_LABEL[t] || t;

export const CLEANUP_SYSTEM =
  'You are a screenplay formatter. You are given a block of text the writer pasted or selected in a screenplay, '
  + 'and the lines above it for context only. You split it into screenplay elements and give each one a type: '
  + 'scene (a heading such as INT. HOUSE - DAY), action, character (a speaker\'s name cue), dialogue, paren (a '
  + 'parenthetical) or transition (such as CUT TO:). You format; you do not edit. Keep every word the writer wrote, '
  + 'in the same order. Do not add, remove, reword or reorder words. You may drop a colon after a name cue and '
  + 'the brackets around a parenthetical, which the format supplies itself. Output only the block, not the context lines.';

export function cleanupSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['elements'],
    properties: {
      elements: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['type', 'text'],
          properties: {
            type: { type: 'string', enum: CLEANUP_TYPES },
            text: { type: 'string', description: 'the element text, the writer\'s own words' }
          }
        }
      }
    }
  };
}

/**
 * The facts that leave the browser for script-cleanup: the block and the
 * (up to) two lines above it. Nothing else from the script.
 *   selection  { ids, text } from the page
 *   above      [{type, text}] the elements above the block, nearest last
 * @returns {{text:string, above:{type,text}[], tooLong:boolean, empty:boolean}}
 */
export function cleanupFacts(selection, above = []) {
  const text = String((selection && selection.text) || '').replace(/\r\n?/g, '\n');
  const ctxLines = (above || []).slice(-2).map((e) => ({ type: String((e && e.type) || ''), text: clipText(e && e.text, 400) }));
  return { text, above: ctxLines, tooLong: text.length > CLEANUP_MAX_CHARS, empty: !text.trim() };
}

export function cleanupPrompt(facts, refine = '') {
  const L = [];
  L.push('Format the block between the markers into screenplay elements. Keep every word, in order.');
  if (facts.above.length) {
    L.push('', 'The lines above it (context only, do not output them):');
    facts.above.forEach((e) => L.push('[' + e.type + '] ' + e.text));
  }
  L.push('', '<<<BLOCK', facts.text, 'BLOCK>>>');
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

export const cleanupPrevious = (previous) => (previous && Array.isArray(previous.items)
  ? previous.items.map((it) => ({ type: it.type, text: it.rawText != null ? it.rawText : it.text }))
  : previous);

const EDGE = /^[^\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+$/gu;
const tokenKey = (t) => t.normalize('NFC').replace(/[‘’ʼ]/g, "'").toLowerCase().replace(EDGE, '');
const rawTokens = (text) => String(text == null ? '' : text).split(/\s+/).filter(Boolean);

/** The words of a text as the keep-check compares them: case, spacing and
    punctuation at a word's EDGES (a cue's colon, a parenthetical's
    brackets, a heading's full stop) are ignored. Punctuation inside a word
    ("555-1234", "didn't") is part of it, so a reply that rewrites it is
    not formatting. */
export function wordsOf(text) {
  return rawTokens(text).map(tokenKey).filter(Boolean);
}

/** True when the two texts hold the same words in the same order. */
export function sameWords(a, b) {
  const x = wordsOf(a), y = wordsOf(b);
  return x.length === y.length && x.every((w, i) => w === y[i]);
}

/** Give each proposed element the WRITER's own tokens, in order (the model's
    case and punctuation are never written). Assumes sameWords already held.
    A cue's trailing colon is the one thing dropped. */
function writersWords(original, els) {
  const toks = rawTokens(original);
  let at = 0;
  return els.map((e) => {
    let n = wordsOf(e.text).length;
    const mine = [];
    while (at < toks.length) {
      if (tokenKey(toks[at])) { if (n === 0) break; n -= 1; }
      mine.push(toks[at]); at += 1;
    }
    let text = mine.join(' ');
    if (e.type === 'character') text = text.replace(/\s*:\s*$/, '');
    return text;
  });
}

/**
 * A reply, checked. The whole reply is refused when its words are not the
 * input's ("this is formatting, not editing") or when nothing usable came
 * back. An element with an unknown type is read as action (its words are
 * still the writer's); an element with no text is dropped.
 * @returns {{items:{id,text,detail,type,rawText}[], rejected:string}}
 */
export function readCleanup(parsed, facts) {
  const arr = parsed && typeof parsed === 'object' && Array.isArray(parsed.elements) ? parsed.elements : [];
  const els = [];
  for (const e of arr) {
    if (!e || typeof e !== 'object') continue;
    const text = String(e.text == null ? '' : e.text).replace(/\r\n?/g, '\n').trim();
    if (!text) continue;
    els.push({ type: CLEANUP_TYPES.includes(e.type) ? e.type : 'action', text });
  }
  if (!els.length) return { items: [], rejected: 'The model came back with nothing to format.' };
  if (!sameWords(facts.text, els.map((e) => e.text).join('\n'))) {
    return { items: [], rejected: 'The model changed the wording, and this is formatting, not editing. Nothing was changed.' };
  }
  const mine = writersWords(facts.text, els);
  return {
    items: els.map((e, i) => ({ id: 'e' + i, text: mine[i], detail: cleanupTypeLabel(e.type), type: e.type, rawText: e.text })),
    rejected: ''
  };
}

/**
 * The elements Accept writes. A ticked item takes its proposed type; an
 * unticked one keeps its words as a plain action line (the writer's words
 * are never dropped by unticking). `selected` are the ticked items, `all`
 * the shown ones in order.
 * @returns {{type:string, text:string}[]}
 */
export function cleanupPlan(selected, all) {
  const on = new Set((selected || []).map((x) => x.id));
  return (all || []).map((x) => ({ type: on.has(x.id) ? x.type : 'action', text: x.text }));
}

const sig = (e) => JSON.stringify([e.type, e.text]);

/**
 * Is the script still as it was at Run? The block must be there, in
 * order, contiguous, each element as it was; and the lines around it
 * (the two above, the one below) must be unchanged. Returns the start
 * index of the block, or -1 with a reason.
 *   elements  doc.elements now
 *   snap      { block:[{id,type,text}], above:[{id,type,text}], below:{id,type,text}|null }
 */
export function blockStillThere(elements, snap) {
  const list = elements || [];
  if (!snap || !snap.block || !snap.block.length) return { at: -1, why: 'There is no block to replace.' };
  const at = list.findIndex((e) => e.id === snap.block[0].id);
  if (at < 0) return { at: -1, why: 'The selected lines are no longer in the script.' };
  for (let i = 0; i < snap.block.length; i++) {
    const e = list[at + i];
    if (!e || e.id !== snap.block[i].id || sig(e) !== sig(snap.block[i])) return { at: -1, why: 'The selected lines have changed since the clean-up ran.' };
  }
  const above = snap.above || [];
  for (let k = 0; k < above.length; k++) {
    const e = list[at - above.length + k];
    if (!e || e.id !== above[k].id || sig(e) !== sig(above[k])) return { at: -1, why: 'The lines above the selection have changed since the clean-up ran.' };
  }
  if (snap.below) {
    const e = list[at + snap.block.length];
    if (!e || e.id !== snap.below.id || sig(e) !== sig(snap.below)) return { at: -1, why: 'The line below the selection has changed since the clean-up ran.' };
  } else if (list[at + snap.block.length]) {
    return { at: -1, why: 'The script has changed below the selection since the clean-up ran.' };
  }
  return { at, why: '' };
}

/**
 * Can the undo put the block back? The added elements must still be there,
 * contiguous, as written. Returns where they start, or -1 with a reason.
 *   written  [{id,type,text}] what Accept put in
 */
export function addedStillThere(elements, written) {
  const list = elements || [];
  if (!written || !written.length) return { at: -1, why: 'Nothing was written.' };
  const at = list.findIndex((e) => e.id === written[0].id);
  if (at < 0) return { at: -1, why: 'The cleaned-up lines are no longer in the script.' };
  for (let i = 0; i < written.length; i++) {
    const e = list[at + i];
    if (!e || e.id !== written[i].id || sig(e) !== sig(written[i])) return { at: -1, why: 'The cleaned-up lines have been edited since.' };
  }
  return { at, why: '' };
}

export default {
  ARC_FIELD_NAMES, ARCS_SYSTEM, arcsSchema, arcsFacts, arcsPrompt, arcsPrevious, readArcs, planArcWrites, planArcUndo,
  CLEANUP_MAX_CHARS, CLEANUP_TYPES, CLEANUP_SYSTEM, cleanupSchema, cleanupFacts, cleanupPrompt, cleanupPrevious,
  wordsOf, sameWords, readCleanup, cleanupPlan, blockStillThere, addedStillThere, cleanupTypeLabel
};
