/* ============================================================
   AI WRITING APPLY — the pure halves of the writing tools' Accept
   ------------------------------------------------------------
   What the Desk's writing tasks (dialogue-pass, logline,
   synopsis-script, gen-scenes) need to land a model's answer in the
   studio's own models without retyping, and to take exactly that
   back out again on Undo. Pure: imports nothing, touches no storage,
   so it runs in Node (test:ai-writing) and in any chunk.

   THE TWO RULES EVERY FUNCTION HERE KEEPS
     - Fill, never overwrite. A take, an alternate, a step or a name a
       person typed is never replaced; what the model offers is ADDED
       beside it, or written only where the field is blank.
     - Undo removes what THIS apply added and nothing else, and only
       while it is still the way the apply left it: a take the writer
       has since chosen as the line, a step they have typed into, a
       character card they have filled in — each is theirs now, and
       an Undo pressed later must not delete their work with it.
   ============================================================ */

const str = (x) => (typeof x === 'string' ? x : '');
const clean = (t) => String(t ?? '').trim();

/* ---- alternate takes on a dialogue line ----------------------
   The shape src/ui/alt-lines.js owns: `alts` is an array of strings on
   the dialogue element and only `text` is the line in use. */
export const takesOf = (el) => (el && Array.isArray(el.alts) ? el.alts.filter((t) => typeof t === 'string') : []);

/** Add each text as a take of `el` unless it is blank, the line in use,
    or already a take. Mutates `el`; returns the texts actually added. */
export function addTakes(el, texts) {
  if (!el) return [];
  const takes = takesOf(el);
  const added = [];
  for (const raw of texts || []) {
    const t = clean(raw);
    if (!t || t === clean(el.text) || takes.includes(t)) continue;
    takes.push(t);
    added.push(t);
  }
  if (added.length) el.alts = takes;
  return added;
}

/** Remove exactly the takes `added` put there (the last copy of each,
    as coverage.js removeTake does). A take no longer in the list (the
    writer chose it, or deleted it) is left alone. Mutates `el`. */
export function removeTakes(el, added) {
  if (!el) return 0;
  const takes = takesOf(el);
  let n = 0;
  for (const t of added || []) {
    const k = takes.lastIndexOf(t);
    if (k < 0) continue;
    takes.splice(k, 1);
    n++;
  }
  if (takes.length) el.alts = takes; else delete el.alts;
  return n;
}

/* ---- logline alternates --------------------------------------
   `loglineAlts` on the story: strings, the variants a writer ticked
   beside the one they took. An additive field (story.js loadStory
   spreads the stored row; story-merge.js carries any field it does not
   know), so no key and no migration. */
export const loglineAltsOf = (story) =>
  (Array.isArray(story && story.loglineAlts) ? story.loglineAlts.filter((t) => typeof t === 'string' && t.trim()) : []);

/** The list after adding `texts`, skipping blanks, `logline` itself
    and anything already kept. { list, added }. Pure. */
export function addLoglineAlts(current, texts, logline = '') {
  const list = (current || []).filter((t) => typeof t === 'string' && t.trim());
  const added = [];
  for (const raw of texts || []) {
    const t = clean(raw);
    if (!t || t === clean(logline) || list.includes(t)) continue;
    list.push(t);
    added.push(t);
  }
  return { list, added };
}

/** `current` without the entries `added` put there. Pure. */
export function removeLoglineAlts(current, added) {
  const list = (current || []).slice();
  for (const t of added || []) {
    const k = list.lastIndexOf(t);
    if (k >= 0) list.splice(k, 1);
  }
  return list;
}

/* ---- the scriptgen beat vocabulary → a story beat key --------
   scriptgen's beats come from studies.json ('set-up', 'break-into-two')
   while the story's frameworks spell the same beats 'setup',
   'break_into_two'. Compared with everything but letters and digits
   removed, so the two spellings meet without a hand-written table that
   would be wrong by the next rename. '' when the framework has no such
   beat — a beat that cannot be placed is not guessed at. */
const bare = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
export function storyBeatKey(vocabId, fw) {
  if (!fw || !Array.isArray(fw.beats) || !vocabId) return '';
  const b = fw.beats.find((x) => bare(x.id) === bare(vocabId));
  return b ? fw.id + ':' + b.id : '';
}

/* ---- the story, filled where blank (synopsis → beat sheet) ----
   `beats` is [{ key, text }] with qualified keys. A beat with a written
   step is left alone; a beat whose steps are all empty has its first
   empty step filled; a beat with no step gets one. `addStep(story,
   {beat, text})` is story.js addOutlineStep (injected, so this file
   stays pure). Returns the record Undo needs:
     { logline: bool, filled: [{id, text}], added: [{id, text}] } */
export function fillStoryBlanks(story, { logline = '', beats = [], steps = true } = {}, addStep) {
  const wrote = { logline: false, filled: [], added: [] };
  if (!story) return wrote;
  if (clean(logline) && !clean(story.logline)) { story.logline = clean(logline); wrote.logline = true; }
  if (!steps || typeof addStep !== 'function') return wrote;
  if (!Array.isArray(story.outline)) story.outline = [];
  for (const b of beats || []) {
    const text = clean(b && b.text);
    if (!b || !b.key || !text) continue;
    const on = story.outline.filter((x) => x && x.beat === b.key);
    if (on.some((x) => clean(x.text))) continue;
    const empty = on[0];
    if (empty) { empty.text = text; wrote.filled.push({ id: empty.id, text }); continue; }
    const st = addStep(story, { beat: b.key, text });
    if (st) wrote.added.push({ id: st.id, text });
  }
  return wrote;
}

/** Take back what fillStoryBlanks wrote, where it is still as written.
    Returns how many pieces were left because the writer changed them. */
export function undoStoryFill(story, wrote, logline = '') {
  let kept = 0;
  if (!story || !wrote) return kept;
  if (wrote.logline) { if (clean(story.logline) === clean(logline)) story.logline = ''; else kept++; }
  const out = Array.isArray(story.outline) ? story.outline : [];
  for (const f of wrote.filled || []) {
    const st = out.find((x) => x && x.id === f.id);
    if (st && str(st.text) === f.text) st.text = ''; else if (st) kept++;
  }
  for (const a of wrote.added || []) {
    const i = out.findIndex((x) => x && x.id === a.id);
    if (i < 0) continue;
    if (str(out[i].text) === a.text && !out[i].sceneId) out.splice(i, 1); else kept++;
  }
  return kept;
}

/* ---- cast names → Characters records ---------------------------
   `chars` is characters.js { normName, ownerOf, blankCharacter }. A
   name a record claims (by name or alias) is written as that record's
   name, so the breakdown, the day out of days and the Characters page
   agree on one spelling; an unknown name gets a NEW record holding
   only the name. An existing record is never renamed or edited.
   Mutates `list`; returns { cast, created }. */
export function matchCast(list, names, chars) {
  const cast = [];
  const created = [];
  for (const raw of names || []) {
    const n = chars.normName(raw);
    if (!n) continue;
    let rec = chars.ownerOf(list, n);
    if (!rec) { rec = chars.blankCharacter({ name: n }); list.push(rec); created.push(rec.id); }
    if (!cast.includes(rec.name)) cast.push(rec.name);
  }
  return { cast, created };
}

/** A record matchCast made is still untouched: nothing but its name. */
export function untouchedCharacter(c, fields = []) {
  if (!c) return false;
  if ((c.aliases || []).length || (c.relationships || []).length || clean(c.contactId)) return false;
  return fields.every((f) => !clean(c[f]));
}

export default {
  takesOf, addTakes, removeTakes, loglineAltsOf, addLoglineAlts, removeLoglineAlts,
  storyBeatKey, fillStoryBlanks, undoStoryFill, matchCast, untouchedCharacter
};
