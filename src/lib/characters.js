/* ============================================================
   CHARACTERS — the people in the script, as data
   ------------------------------------------------------------
   Two sources, and the line between them is the whole design.

   THE SCRIPT'S CUES ARE THE TRUTH ABOUT WHO SPEAKS. A character the
   writer has never described still exists the moment a cue names
   them, and is listed — DERIVED, every time, from the elements. A
   derived row is never written anywhere: it is a reading of the
   script, and a stored copy of a reading is wrong the first time the
   script is edited (readiness.js, screenplay-analysis.js).

   WHAT THE WRITER SAYS ABOUT THEM IS STORED. Age, want, need, arc,
   voice notes, aliases and the cast contact are work nobody can
   derive, so they live under `fms_characters_v1` (per project:
   SCOPED_KEYS in store.js, PROJECT_KEYS in backup.js, ALL_KEYS in
   hub.js; SCOPE_BY_KEY in cloud.js as scope `characters`, which
   schema section 24 adds). A derived row becomes a stored one the first time the
   writer types something into it — never before.

   NEVER AUTO-DELETED. A stored character whose cues have all gone
   (renamed, cut, not written yet) stays, and says it has no lines.
   Deleting somebody's notes because a scene was cut is the outcome
   this app refuses everywhere else.

   THE JOIN is by name: a cue's speaker (script.js cueSpeaker — no
   extensions, no (CONT'D), upper case) against a character's name
   and every alias, normalised the same way. An alias is how "ANBU"
   and "ANBUSELVAN" are one person on the list and in the table read.

   RENAME is the one operation here that touches the script, and it
   is a PLAN first: renamePlan() says which cues would change, and
   the page shows that count before anything is written. applyPlan()
   returns its own undo. Extensions survive: "ANBU (V.O.) (CONT'D)"
   renamed to RAVI is "RAVI (V.O.) (CONT'D)". Dual dialogue is a flag
   on a cue, not a copy of its name, so a renamed pair stays a pair.

   Pure apart from load/save, which take the storage to use so
   `npm run test:screenplay` can run all of it in Node.
   ============================================================ */
import { cueSpeaker } from './script.js';
import { DIALOGUE_WPS } from './screenplay-analysis.js';

export const CHARACTERS_KEY = 'fms_characters_v1';

/* The fields the writer fills in, in the order the card shows them.
   Strings all, so a card never has to guard for a missing one. */
export const CHARACTER_FIELDS = ['age', 'want', 'need', 'arc', 'voice'];

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** A name as the join compares it. */
export const normName = (s) => cueSpeaker(s);

export function blankCharacter(patch = {}) {
  const c = { id: uid(), name: '', aliases: [], age: '', want: '', need: '', arc: '', voice: '', contactId: '', ...patch };
  c.name = normName(c.name);
  c.aliases = Array.isArray(c.aliases)
    ? [...new Set(c.aliases.map(normName).filter((a) => a && a !== c.name))]
    : [];
  for (const f of CHARACTER_FIELDS) c[f] = String(c[f] ?? '');
  c.contactId = String(c.contactId ?? '');
  return c;
}

/** Aliases as typed in one field: "ANBU, ANBUSELVAN". */
export function parseAliases(text) {
  return String(text || '').split(/[,;\n]/).map(normName).filter(Boolean);
}

/* ---- storage ------------------------------------------------ */

export function loadCharacters(storage = globalThis.localStorage) {
  let raw = null;
  try { raw = storage && storage.getItem(CHARACTERS_KEY); } catch (e) { /* private mode */ }
  if (!raw) return [];
  let v = null;
  try { v = JSON.parse(raw); } catch (e) { return []; }
  const list = Array.isArray(v) ? v : (v && Array.isArray(v.characters) ? v.characters : []);
  return list.filter((c) => c && typeof c === 'object' && typeof c.id === 'string')
    .map((c) => blankCharacter(c));
}

/** Writes the list. An EMPTY list removes the key, so a studio that
    never described anybody carries no key at all. */
export function saveCharacters(list, storage = globalThis.localStorage) {
  try {
    if (!list || !list.length) { storage.removeItem(CHARACTERS_KEY); return true; }
    storage.setItem(CHARACTERS_KEY, JSON.stringify(list.map((c) => blankCharacter(c))));
    return true;
  } catch (e) { return false; }
}

/* ---- the cues ---------------------------------------------- */

/** Every speaker the script's cues name, in order of first cue:
    Map(name -> { cues, first }). One pass. */
export function cueSpeakers(elements) {
  const out = new Map();
  (elements || []).forEach((el, i) => {
    if (!el || el.type !== 'character') return;
    const n = cueSpeaker(el.text);
    if (!n) return;
    const r = out.get(n);
    if (r) r.cues++;
    else out.set(n, { cues: 1, first: i });
  });
  return out;
}

/** Which stored character a speaker belongs to: name first, then any
    alias. Returns the character or null. */
export function ownerOf(list, speaker) {
  const n = normName(speaker);
  if (!n) return null;
  return (list || []).find((c) => c.name === n) || (list || []).find((c) => c.aliases.includes(n)) || null;
}

/** The list the page shows: every stored character (with the cue
    count its name and aliases earn) followed by every speaker no
    stored character claims, as a DERIVED row. Stored rows keep their
    stored order; derived ones follow in the order they first speak.
    Returns [{ ...character, derived, cues, names: [speakers] }]. */
export function mergeWithCues(list, elements) {
  const speakers = cueSpeakers(elements);
  const stored = (list || []).map((c) => ({ ...c, derived: false, cues: 0, names: [] }));
  const derived = [];
  for (const [name, r] of speakers) {
    const own = ownerOf(stored, name);
    if (own) { own.cues += r.cues; own.names.push(name); continue; }
    derived.push({ ...blankCharacter({ name }), id: 'cue:' + name, derived: true, cues: r.cues, names: [name], first: r.first });
  }
  derived.sort((a, b) => a.first - b.first);
  derived.forEach((d) => { delete d.first; });
  return stored.concat(derived);
}

/** Adopt a derived row into the stored list (the writer has typed into
    it). Returns the stored character; the list is mutated. */
export function adopt(list, name) {
  const n = normName(name);
  const have = ownerOf(list, n);
  if (have) return have;
  const c = blankCharacter({ name: n });
  list.push(c);
  return c;
}

/* ---- rename -------------------------------------------------- */

/* A cue is its name, then whatever follows: extensions in brackets,
   the dual mark. Split at the first "(" or "^". */
function splitCue(text) {
  const t = String(text ?? '');
  const m = /[(^]/.exec(t);
  const at = m ? m.index : t.length;
  return { name: t.slice(0, at).trim(), rest: t.slice(at).trim() };
}

/** What a rename would do, without doing it.
    `from` is a speaker name or a list of them (a character's name and
    its aliases); `to` the new name. Returns
    { to, changes: [{ id, index, before, after }], cues, scenes, merges }
    where `merges` is true when another speaker already uses `to`. */
export function renamePlan(elements, from, to) {
  const names = new Set((Array.isArray(from) ? from : [from]).map(normName).filter(Boolean));
  const target = normName(to);
  const changes = [];
  const scenes = new Set();
  let scene = -1;
  let merges = false;
  (elements || []).forEach((el, i) => {
    if (!el) return;
    if (el.type === 'scene') { scene = i; return; }
    if (el.type !== 'character') return;
    const who = cueSpeaker(el.text);
    if (!who) return;
    if (!names.has(who)) { if (who === target) merges = true; return; }
    if (!target) return;
    const { rest } = splitCue(el.text);
    const after = rest ? target + ' ' + rest : target;
    if (after === el.text) return;
    changes.push({ id: el.id, index: i, before: el.text, after });
    scenes.add(scene);
  });
  return { to: target, changes, cues: changes.length, scenes: scenes.size, merges };
}

/** Apply a plan to `elements` (mutated, matched by id so a plan made a
    moment ago still lands if a line moved). Returns the undo: the same
    shape with before/after swapped, which applyPlan() also takes. */
export function applyPlan(elements, plan) {
  const byId = new Map((elements || []).map((el) => [el && el.id, el]));
  const done = [];
  for (const c of (plan && plan.changes) || []) {
    const el = c.id != null ? byId.get(c.id) : elements[c.index];
    if (!el || el.text !== c.before) continue;
    el.text = c.after;
    done.push({ id: c.id, index: c.index, before: c.after, after: c.before });
  }
  return { to: '', changes: done, cues: done.length, scenes: 0, merges: false };
}

/** The stored side of a rename: the character takes the new name and
    loses it as an alias; the old name is NOT kept as an alias, because
    no cue says it any more. Mutates and returns the character. */
export function renameCharacter(c, to) {
  const n = normName(to);
  if (!c || !n) return c;
  c.name = n;
  c.aliases = c.aliases.filter((a) => a !== n);
  return c;
}

/* ---- the table read ------------------------------------------ */

const wordsIn = (t) => (String(t || '').match(/[\p{L}\p{N}'’-]+/gu) || []).length;

/** Per speaker: speeches, words, estimated speaking seconds, scenes,
    and every speech with its context — the scene heading and the
    speech it answers. `list` (optional) folds aliases into their
    character, so "ANBU" and "ANBUSELVAN" read as one part.

    Returns { rows: [{ name, speeches, lines, words, seconds, scenes,
    sides: [{ scene, heading, cue, paren, text, prevCue, prevText }] }],
    totalWords } — rows by words spoken, most first. A "speech" is one
    cue's run of dialogue; "lines" counts the dialogue elements in it
    (a speech broken by a parenthetical is one speech of two lines). */
export function tableRead(elements, list = []) {
  const rows = new Map();
  const rowOf = (speaker) => {
    const own = ownerOf(list, speaker);
    const name = own ? own.name : speaker;
    let r = rows.get(name);
    if (!r) { r = { name, speeches: 0, lines: 0, words: 0, seconds: 0, scenes: new Set(), sides: [] }; rows.set(name, r); }
    return r;
  };
  let heading = '';
  let sceneNo = 0;
  let cur = null;          // the speech being read
  let prev = null;         // the speech before it, for context
  const close = () => { if (cur && cur.text.length) prev = cur; cur = null; };
  for (const el of elements || []) {
    if (!el) continue;
    const t = String(el.text ?? '').trim();
    if (el.type === 'scene') { close(); prev = null; if (t) { heading = t; sceneNo++; } continue; }
    if (el.type === 'character') {
      close();
      const who = cueSpeaker(t);
      if (!who) continue;
      const row = rowOf(who);
      cur = { row, cue: t, paren: [], text: [], heading, scene: sceneNo };
      continue;
    }
    if (!cur) continue;
    if (el.type === 'paren') { if (t) cur.paren.push(t); continue; }
    if (el.type === 'dialogue') {
      if (!t) continue;
      const r = cur.row;
      if (!cur.text.length) {
        r.speeches++;
        r.scenes.add(cur.scene);
        r.sides.push(cur.side = {
          scene: cur.scene, heading: cur.heading, cue: cur.cue, paren: '', text: '',
          prevCue: prev ? prev.cue : '', prevText: prev ? prev.text.join(' ') : ''
        });
      }
      cur.text.push(t);
      r.lines++;
      const w = wordsIn(t);
      r.words += w;
      r.seconds += w / DIALOGUE_WPS;
      cur.side.text = cur.text.join('\n');
      cur.side.paren = cur.paren.join(' ');
      continue;
    }
    close();               // action, transition, shot: the speech is over
  }
  close();
  const out = [...rows.values()].filter((r) => r.speeches)
    .map((r) => ({ ...r, scenes: r.scenes.size, seconds: Math.round(r.seconds) }));
  out.sort((a, b) => b.words - a.words || a.name.localeCompare(b.name));
  return { rows: out, totalWords: out.reduce((n, r) => n + r.words, 0) };
}

/** "4.5 min", from seconds — a table read is planned in minutes. */
export function speakingMinutes(seconds) {
  const m = Math.max(0, Number(seconds) || 0) / 60;
  return (m < 10 ? Math.round(m * 10) / 10 : Math.round(m)) + ' min';
}

export default {
  CHARACTERS_KEY, CHARACTER_FIELDS, blankCharacter, parseAliases, loadCharacters, saveCharacters,
  cueSpeakers, ownerOf, mergeWithCues, adopt, renamePlan, applyPlan, renameCharacter,
  tableRead, speakingMinutes, normName
};
