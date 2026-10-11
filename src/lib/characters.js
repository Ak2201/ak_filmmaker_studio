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

   THE CHARACTER BIBLE adds fields (role, look, stakes, fear, lie,
   flaw, strength, wound, secret, arcStart, arcEnd, relationships) with
   no migration: blankCharacter() defaults them, so a record written
   before they existed reads back blank.

   NO FIELD IS STORED TWICE. The blueprints already ask about the
   protagonist (feature step 04, short step 03), the antagonist
   (step 05) and the ally, love interest and mentor (step 06). For the
   character holding one of those ROLES, the fields that have a
   blueprint key are READ AND WRITTEN IN THE BLUEPRINT BLOB through
   blueprint-store.js, and the record holds only what the blueprint has
   no key for. The key map is src/data/story-bible.json `slots`.
   `viewOf()` lays the blueprint's answers over a record for display;
   a VIEW is never saved (saveCharacters() takes records). A project
   whose blueprint already names a protagonist and whose roster has
   none shows a VIRTUAL protagonist card; it becomes a record on the
   first edit of a field the blueprint has no key for.

   Pure apart from load/save, which take the storage to use so
   `npm run test:screenplay` can run all of it in Node.
   ============================================================ */
import { cueSpeaker } from './script.js';
import { csvField } from './dialogue-list.js';
import { DIALOGUE_WPS } from './screenplay-analysis.js';
import { readFields, writeFields } from './blueprint-store.js';
import Store from './store.js';
import BIBLE from '../data/story-bible.json';

export const CHARACTERS_KEY = 'fms_characters_v1';

/* The fields the writer fills in. Strings all, so a card never has to
   guard for a missing one. The first five are the original record; the
   rest are the Character Bible's. The order a card SHOWS them in is
   story-bible.json `characterCard`, not this list. */
export const CHARACTER_FIELDS = ['age', 'want', 'need', 'arc', 'voice',
  'role', 'look', 'stakes', 'fear', 'lie', 'flaw', 'strength', 'wound', 'secret', 'arcStart', 'arcEnd'];
export const ROLES = BIBLE.characterRoles.map((r) => r.id);
export const roleLabel = (id) => (BIBLE.characterRoles.find((r) => r.id === id) || {}).label || '';

const uid = () =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : 'ch_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** A name as the join compares it. */
export const normName = (s) => cueSpeaker(s);

export function blankCharacter(patch = {}) {
  const c = { id: uid(), name: '', aliases: [], age: '', want: '', need: '', arc: '', voice: '', contactId: '',
    relationships: [], ...patch };
  c.name = normName(c.name);
  c.aliases = Array.isArray(c.aliases)
    ? [...new Set(c.aliases.map(normName).filter((a) => a && a !== c.name))]
    : [];
  for (const f of CHARACTER_FIELDS) c[f] = String(c[f] ?? '');
  if (!ROLES.includes(c.role)) c.role = '';
  c.relationships = Array.isArray(c.relationships)
    ? c.relationships.filter((r) => r && typeof r === 'object')
        .map((r) => ({ who: String(r.who ?? ''), how: String(r.how ?? '') }))
    : [];
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

/** The table read as a spreadsheet: one row per character — speeches,
    lines, words, estimated seconds and minutes, scenes. BOM first, like
    the dialogue list, so Excel reads it as UTF-8. */
export function tableReadCSV(read) {
  const head = ['Character', 'Speeches', 'Lines', 'Words', 'Est. seconds', 'Est. minutes', 'Scenes'];
  const lines = [head.map(csvField).join(',')];
  for (const r of (read && read.rows) || []) {
    lines.push([r.name, r.speeches, r.lines, r.words, r.seconds, Math.round(r.seconds / 6) / 10, r.scenes]
      .map(csvField).join(','));
  }
  return '\ufeff' + lines.join('\r\n') + '\r\n';
}

/* ---- the Character Bible: slots, views, roster ---------------- */

const SLOTS = Object.fromEntries(Object.entries(BIBLE.slots).filter(([k]) => !k.startsWith('_')));
export const SLOT_ROLES = Object.keys(SLOTS);
/* One of these at a time; the rest of the slot roles belong to the
   FIRST character holding them (ally, love interest and mentor can be
   several people, but the blueprint has one answer for each). */
export const UNIQUE_ROLES = ['protagonist', 'antagonist'];

const blank = (v) => !String(v ?? '').trim();

/** 'short' for a short-film project, else 'feature'. */
export function projectFormat() {
  try {
    const p = Store && Store.currentProject && Store.currentProject();
    return p && p.format === 'short' ? 'short' : 'feature';
  } catch (e) { return 'feature'; }
}

/** A blueprint's name field is a sentence in the short film ("Ravi, 38,
    divorced father — …"): the cue name is what comes before the first
    comma, dash or bracket. */
export function joinName(raw) {
  return normName(String(raw ?? '').split(/[,—–(\n]| - /)[0]);
}

/** For a role and a project format: { fields: {charField: {ns, key}},
    extras: [{ns, key, label, placeholder}] }, or null for a role the
    blueprint has no slot for. */
export function slotSpec(role, format = 'feature') {
  const s = SLOTS[role];
  if (!s) return null;
  const fields = {};
  for (const [f, key] of Object.entries(s.fields)) fields[f] = { ns: 'feature', key };
  const extras = (s.extras.feature || []).map((x) => ({ ns: 'feature', ...x }));
  if (format === 'short') {
    for (const [f, key] of Object.entries(s.short || {})) fields[f] = { ns: 'short', key };
    for (const x of s.extras.short || []) extras.push({ ns: 'short', ...x });
  }
  return { fields, extras };
}

/* One blob read per namespace; returns val(ns, key) -> string. */
function readSpec(spec) {
  const by = { feature: [], short: [] };
  for (const { ns, key } of Object.values(spec.fields)) by[ns].push(key);
  for (const { ns, key } of spec.extras) by[ns].push(key);
  const got = { feature: by.feature.length ? readFields('feature', by.feature) : {},
                short: by.short.length ? readFields('short', by.short) : {} };
  return (ns, key) => { const v = got[ns][key]; return typeof v === 'string' ? v : ''; };
}

/** The record that owns a role's blueprint slot: the first holder. */
export const slotOwner = (list, role) => (SLOTS[role] ? (list || []).find((c) => c.role === role) || null : null);
export const isSlotOwner = (list, c) => !!(c && SLOTS[c.role] && slotOwner(list, c.role) === c);

/** A record with the blueprint's answers laid over it, for DISPLAY.
    `backed` names the fields that live in the blueprint (a write goes
    there); `extras` are the slot's further prompts with their values.
    Never saved. A record that does not own a slot comes back as it is. */
export function viewOf(c, list, format = projectFormat()) {
  const v = { ...c, relationships: c.relationships.map((r) => ({ ...r })), backed: {}, extras: [], linked: false };
  if (!isSlotOwner(list, c)) return v;
  const spec = slotSpec(c.role, format);
  const val = readSpec(spec);
  v.linked = true;
  for (const [f, { ns, key }] of Object.entries(spec.fields)) {
    v.backed[f] = { ns, key };
    v[f] = val(ns, key);
  }
  v.extras = spec.extras.map((x) => ({ ...x, value: val(x.ns, x.key) }));
  if (v.backed.name) { v.nameRaw = v.name; v.name = joinName(v.name); }
  return v;
}

/** The blueprint's protagonist or antagonist, when no record holds that
    role: the answers as a view with `virtual: true`, or null. Also null
    when a stored character already goes by that name (that one is
    offered the role instead of a second card). */
export function virtualSlot(list, role, format = projectFormat()) {
  if (!UNIQUE_ROLES.includes(role) || (list || []).some((c) => c.role === role)) return null;
  const spec = slotSpec(role, format);
  const val = readSpec(spec);
  const nm = spec.fields.name;
  const raw = val(nm.ns, nm.key);
  if (blank(raw)) return null;
  const jn = joinName(raw);
  if (jn && ownerOf(list, jn)) return null;
  const v = { ...blankCharacter({ name: jn, role }), id: 'bp:' + role, virtual: true,
    backed: {}, extras: spec.extras.map((x) => ({ ...x, value: val(x.ns, x.key) })), linked: true, nameRaw: raw };
  for (const [f, { ns, key }] of Object.entries(spec.fields)) { v.backed[f] = { ns, key }; if (f !== 'name') v[f] = val(ns, key); }
  return v;
}

export const virtualProtagonist = (list, format) => virtualSlot(list, 'protagonist', format);

/** The views the page shows, before the cues are merged in: every stored
    record laid over by the blueprint, with the virtual protagonist and
    antagonist first when the blueprint names one nobody holds yet. */
export function characterViews(list, format = projectFormat()) {
  const views = (list || []).map((c) => viewOf(c, list, format));
  const virt = UNIQUE_ROLES.map((r) => virtualSlot(list, r, format)).filter(Boolean);
  return [...virt, ...views];
}

/** The view a card stands for, found again from what the card carries:
    its id (a record id, 'bp:<role>' for a virtual one, or
    'cue:NAME' for a derived speaker) and the name it was drawn under. */
export function viewFor(list, id, name = '', format = projectFormat()) {
  const c = (list || []).find((x) => x.id === id);
  if (c) return viewOf(c, list, format);
  if (/^bp:/.test(String(id))) { const vp = virtualSlot(list, String(id).slice(3), format); if (vp) return vp; }
  const n = normName(name || String(id || '').replace(/^cue:/, ''));
  const own = n && ownerOf(characterViews(list, format), n);
  if (own && !own.virtual) return own;
  return { ...blankCharacter({ name: n }), id: 'cue:' + n, derived: true, backed: {}, extras: [], linked: false };
}

/** The whole roster: the views, merged with the script's speakers
    (derived rows). Replaces mergeWithCues(list, elements) for callers
    that want the blueprint's answers in. */
export function buildRoster(list, elements, format = projectFormat()) {
  return mergeWithCues(characterViews(list, format), elements);
}

/* The stored record behind a view; creates it when the view was a
   virtual protagonist or a derived speaker (the list is mutated). */
function materialize(list, view) {
  if (view.virtual) {
    const c = blankCharacter({ role: view.role });
    list.push(c);
    return c;
  }
  if (view.derived) return adopt(list, view.name);
  return list.find((c) => c.id === view.id) || null;
}

/** Write one field of a character. A field the blueprint holds goes to
    the blueprint; the rest to the record, which a virtual or derived
    row first becomes. Returns { rec, listChanged } — listChanged says
    the stored list must be saved (a backed write does not touch it). */
export function setField(list, view, key, value) {
  const b = view.backed && view.backed[key];
  if (b) { writeFields(b.ns, { [b.key]: value }); return { rec: null, listChanged: false }; }
  const rec = materialize(list, view);
  if (!rec) return { rec: null, listChanged: false };
  if (key === 'aliases') rec.aliases = parseAliases(value).filter((a) => a !== rec.name);
  else if (key === 'name') renameCharacter(rec, value);
  else if (key === 'relationships') rec.relationships = blankCharacter({ relationships: value }).relationships;
  else if (key === 'contactId') rec.contactId = String(value ?? '');
  else if (CHARACTER_FIELDS.includes(key)) rec[key] = String(value ?? '');
  else return { rec, listChanged: false };
  return { rec, listChanged: true };
}

/** Write one of a slot's extra prompts (blueprint only). */
export function setExtra(extra, value) { return writeFields(extra.ns, { [extra.key]: value }); }

/* Snapshot a slot's blueprint answers into the record that is leaving
   it, where the record has none. The blueprint is left as it is. */
function releaseSlot(c, format) {
  const spec = slotSpec(c.role, format);
  if (!spec) return;
  const val = readSpec(spec);
  for (const [f, { ns, key }] of Object.entries(spec.fields)) {
    const bp = val(ns, key);
    if (f === 'name') { if (blank(c.name) && !blank(bp)) c.name = joinName(bp); }
    else if (blank(c[f]) && !blank(bp)) c[f] = bp;
  }
}

/* A record taking a slot: what it already holds for a backed field
   MOVES into the blueprint when the blueprint has nothing there, so the
   answer is stored once. Where both hold different words the blueprint
   keeps its own and the record's stay, unseen, until the role leaves. */
function takeSlot(c, format) {
  const spec = slotSpec(c.role, format);
  if (!spec) return;
  const val = readSpec(spec);
  for (const [f, { ns, key }] of Object.entries(spec.fields)) {
    if (blank(c[f])) continue;
    if (!blank(val(ns, key))) continue;
    if (writeFields(ns, { [key]: c[f] })) c[f] = '';
  }
}

/* Blank the slot's CHARACTER fields in the blueprint (not its extras),
   so a newcomer does not inherit the last holder's answers. Only ever
   called after those answers were copied onto the last holder. */
function clearSlotFields(role, format) {
  const spec = slotSpec(role, format);
  const byNs = { feature: {}, short: {} };
  for (const { ns, key } of Object.values(spec.fields)) byNs[ns][key] = '';
  for (const ns of ['feature', 'short']) if (Object.keys(byNs[ns]).length) writeFields(ns, byNs[ns]);
}

/* Who holds a unique role now: a record, or the blueprint's virtual
   protagonist. */
function currentHolder(list, role, format) {
  const rec = (list || []).find((c) => c.role === role);
  if (rec) return { rec };
  const vp = virtualSlot(list, role, format);
  if (vp) return { virtual: vp };
  return null;
}

/** Give a character a role. Only one protagonist and one antagonist:
    when another character holds the role, `confirm(message)` is asked
    and, on yes, that character's blueprint answers are copied onto
    their own record and the role moves. Returns { ok, rec, listChanged,
    moved } — ok false means the writer declined. */
export function assignRole(list, view, role, { format = projectFormat(), confirm = (m) => (globalThis.confirm ? globalThis.confirm(m) : true) } = {}) {
  const want = ROLES.includes(role) ? role : '';
  const no = { ok: false, rec: null, listChanged: false, moved: false };
  let holder = null;
  if (UNIQUE_ROLES.includes(want) && view.role !== want) {
    holder = currentHolder(list, want, format);
    if (holder && holder.rec && holder.rec.id === view.id) holder = null;
    if (holder) {
      const hv = holder.rec ? viewOf(holder.rec, list, format) : holder.virtual;
      const name = hv.name || 'The current ' + roleLabel(want).toLowerCase();
      const label = roleLabel(want).toLowerCase();
      if (!confirm(`${name} is your ${label} now. Make ${view.name || 'this character'} the ${label} instead?\n\n`
        + `${name}'s answers are kept on their own card. The blueprint's further prompts for the role stay with the role.`)) return no;
    }
  }
  const rec = materialize(list, view);
  if (!rec) return no;
  if (rec.role === want && !view.virtual) return { ok: true, rec, listChanged: false, moved: false };
  // Leaving a slot: the record keeps what the blueprint said for it.
  if (SLOTS[rec.role] && isSlotOwner(list, rec)) releaseSlot(rec, format);
  if (holder) {
    if (holder.rec) { releaseSlot(holder.rec, format); holder.rec.role = ''; }
    else {
      const old = blankCharacter({ name: holder.virtual.name });
      for (const f of Object.keys(holder.virtual.backed)) if (f !== 'name') old[f] = holder.virtual[f] || '';
      list.push(old);
    }
    clearSlotFields(want, format);
  }
  rec.role = want;
  if (SLOTS[want] && isSlotOwner(list, rec)) takeSlot(rec, format);
  return { ok: true, rec, listChanged: true, moved: !!holder };
}

/* ---- what the script says about each person (derived) ----------- */

/** Per cue name: where the person first speaks. One pass.
    Map(name -> { index, heading, sceneNo }). */
export function firstAppearances(elements) {
  const out = new Map();
  let heading = '', sceneNo = 0;
  (elements || []).forEach((el, i) => {
    if (!el) return;
    if (el.type === 'scene') { if (String(el.text || '').trim()) { heading = String(el.text).trim(); sceneNo++; } return; }
    if (el.type !== 'character') return;
    const n = cueSpeaker(el.text);
    if (n && !out.has(n)) out.set(n, { index: i, heading, sceneNo });
  });
  return out;
}

/** First appearance, scene count, speeches, lines and words for every
    view in `roster`, from the script (screenplay-analysis.js owns the
    arithmetic through tableRead). Returns Map(id -> stats); a person
    the script never names has no entry. Derived on every call, stored
    nowhere. */
export function rosterStats(roster, elements) {
  const out = new Map();
  if (!elements || !elements.length) return out;
  const read = tableRead(elements, roster);
  const first = firstAppearances(elements);
  for (const c of roster) {
    const names = [c.name, ...(c.aliases || [])].filter(Boolean);
    let f = null;
    for (const n of names) { const a = first.get(n); if (a && (!f || a.index < f.index)) f = a; }
    const row = read.rows.find((r) => r.name === c.name);
    if (!f && !row) continue;
    out.set(c.id, {
      first: f ? { heading: f.heading, sceneNo: f.sceneNo } : null,
      scenes: row ? row.scenes : 0, speeches: row ? row.speeches : 0,
      lines: row ? row.lines : 0, words: row ? row.words : 0, seconds: row ? row.seconds : 0
    });
  }
  return out;
}

export default {
  CHARACTERS_KEY, CHARACTER_FIELDS, ROLES, roleLabel, SLOT_ROLES, UNIQUE_ROLES, slotSpec, slotOwner, isSlotOwner,
  viewOf, viewFor, virtualSlot, virtualProtagonist, characterViews, buildRoster, setField, setExtra, assignRole, joinName, projectFormat,
  firstAppearances, rosterStats, blankCharacter, parseAliases, loadCharacters, saveCharacters,
  cueSpeakers, ownerOf, mergeWithCues, adopt, renamePlan, applyPlan, renameCharacter,
  tableRead, tableReadCSV, speakingMinutes, normName
};
