/* ============================================================
   AI POST MODEL — the pure half of the on-set and post Desk tasks
   ------------------------------------------------------------
   docs/AI-EVERYWHERE.md tasks 5 to 8: draft-changes, day-wrap-summary,
   edit-notes, cert-read. Everything a task DECIDES lives here so
   scripts/test-ai-post.mjs runs it in Node with no browser: the facts
   a prompt carries (and the cap on them), the schemas, the checks on a
   model's reply (ids and scene numbers it was never sent are dropped),
   the blanks-only merge and its undo guard, and the text a read-only
   result shows.

   No import, no storage, no document. The facts are plain data the
   task module reads from the models and hands in; what leaves the
   browser is exactly what these builders print, and the Desk shows it
   before the first send.
   ============================================================ */

const str = (s) => String(s == null ? '' : s);
/** Text held to a length and one line break style. */
export const clip = (s, n) => str(s).replace(/\r\n?/g, '\n').trim().slice(0, n);
const oneLine = (s, n) => str(s).replace(/\s+/g, ' ').trim().slice(0, n);
/** A heading or number as a comparison key: case and spacing ignored. */
export const norm = (s) => str(s).replace(/\s+/g, ' ').trim().toLowerCase();
const strings = (list, n, len) => (Array.isArray(list) ? list : [])
  .map((x) => oneLine(x, len)).filter(Boolean).slice(0, n);

export const CHANGES_CAP = 12000;
export const NOTE_MAX = 280;
export const NOTHING = 'Changed nothing.';

/* ---- 5. draft-changes ------------------------------------------ */

const TYPE_TAG = { scene: 'heading', action: 'action', character: 'cue', dialogue: 'dialogue', paren: 'paren', transition: 'transition' };
const tagOf = (el) => TYPE_TAG[el && el.type] || 'line';

/** One group's lines: only what changed, as the text the page shows. */
function groupLines(group) {
  const out = [];
  for (const o of group.ops || []) {
    if (o.op === 'same') continue;
    if (o.op === 'changed') out.push('  changed (' + tagOf(o.b) + '): "' + oneLine(o.a && o.a.text, 300) + '" -> "' + oneLine(o.b && o.b.text, 300) + '"');
    else if (o.op === 'moved') out.push('  moved (' + tagOf(o.b) + '): "' + oneLine(o.b && o.b.text, 300) + '"');
    else if (o.op === 'added') out.push('  added (' + tagOf(o.b) + '): "' + oneLine(o.b && o.b.text, 300) + '"');
    else if (o.op === 'removed') out.push('  removed (' + tagOf(o.a) + '): "' + oneLine(o.a && o.a.text, 300) + '"');
  }
  return out;
}

const countWords = (c) => ['changed', 'moved', 'added', 'removed']
  .filter((k) => c && c[k]).map((k) => c[k] + ' ' + k).join(', ') || 'no change';

/**
 * The facts of a comparison, reduced from groupByScene()'s output to
 * per-scene counts and the changed lines' text, held to `cap` chars.
 *   → { text, headings: [what the model may name], truncated, omitted }
 * `headings` is only the scenes whose block is in the text.
 */
export function changeFacts({ groups = [], stats = null, olderLabel = 'Older draft', newerLabel = 'Newer draft', cap = CHANGES_CAP } = {}) {
  const head = ['Older: ' + oneLine(olderLabel, 80), 'Newer: ' + oneLine(newerLabel, 80)];
  if (stats) head.push('Totals: ' + countWords(stats));
  let text = head.join('\n');
  const headings = [];
  let omitted = 0;
  let truncated = false;
  groups.forEach((g, i) => {
    if (truncated) { omitted++; return; }
    const title = g.heading ? 'Scene "' + oneLine(g.heading, 120) + '"' : 'Before the first scene heading';
    let block = '\n\n' + title + ' (' + countWords(g.counts) + '):\n' + groupLines(g).join('\n');
    if (text.length + block.length > cap) {
      truncated = true;
      const room = cap - text.length;
      if (room > 200) { block = block.slice(0, room); text += block; if (g.heading) headings.push(oneLine(g.heading, 120)); }
      else omitted++;
      return;
    }
    text += block;
    if (g.heading) headings.push(oneLine(g.heading, 120));
  });
  if (truncated) {
    text += '\n\n[Cut here to stay under ' + cap + ' characters; '
      + omitted + (omitted === 1 ? ' more scene' : ' more scenes') + ' with changes are not shown.]';
  }
  return { text, headings, truncated, omitted };
}

export const CHANGES_SYSTEM = 'You are a script supervisor comparing two drafts of a screenplay from a list of what changed between them. '
  + 'You summarise what changed, scene by scene, in plain words, from ONLY the lines you are given. You never invent a change, a scene or a line. '
  + 'You name scenes exactly as their headings are written in the list. You change nothing; this is a read.';

export const CHANGES_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    scenes: { type: 'array', items: { type: 'object', properties: { heading: { type: 'string' }, change: { type: 'string' } }, required: ['heading', 'change'], additionalProperties: false } },
    watch: { type: 'array', items: { type: 'string' } }
  },
  required: ['summary', 'scenes', 'watch'],
  additionalProperties: false
};

export function changesUser(facts, refine = '') {
  return 'Here is what changed between two drafts of the script.\n\n' + facts.text
    + '\n\nWrite: a short summary of what changed overall; one line for each scene that changed, naming it by its heading as written above; '
    + 'and a few things the writer, the director or the script supervisor should watch for (continuity, a cue that now has no reply, a prop that moved). '
    + 'Use only the lines above.' + (refine ? '\n\n' + refine : '');
}

/** The model's reply held to what was sent: a scene heading not in the
    list is dropped and counted. */
export function readChanges(parsed, headings = []) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const known = new Set(headings.map(norm));
  let dropped = 0;
  const scenes = [];
  for (const s of Array.isArray(p.scenes) ? p.scenes : []) {
    const heading = oneLine(s && s.heading, 120);
    const change = oneLine(s && s.change, 400);
    if (!heading || !change) continue;
    if (!known.has(norm(heading))) { dropped++; continue; }
    scenes.push({ heading, change });
  }
  return { summary: clip(p.summary, 1200), scenes, watch: strings(p.watch, 8, 300), dropped };
}

const model = (m) => (m ? '\n\nRead by ' + m + '.' : '');

export function changesText(res, { model: m, truncated = false, omitted = 0 } = {}) {
  const out = [];
  if (res.summary) out.push(res.summary);
  if (res.scenes.length) out.push('Scene by scene\n' + res.scenes.map((s) => '- ' + s.heading + ': ' + s.change).join('\n'));
  if (res.watch.length) out.push('Worth watching\n' + res.watch.map((w) => '- ' + w).join('\n'));
  if (truncated) out.push('Only the first part of the changes fit in one request'
    + (omitted ? ' (' + omitted + (omitted === 1 ? ' scene' : ' scenes') + ' were left out)' : '') + ', so this does not cover every change.');
  if (res.dropped) out.push(res.dropped + (res.dropped === 1 ? ' line' : ' lines') + ' about a scene that is not in the comparison was left out.');
  return out.join('\n\n') + model(m) + '\n\n' + NOTHING;
}

/* ---- 6. day-wrap-summary ---------------------------------------- */

/** The scene number a sentence names: "Scene 12", "Sc. 4A", "scenes 3, 5 and 7". */
export function sceneNumbersIn(text) {
  const found = [];
  const re = /\b(?:scenes?|sc\.?)\s*#?\s*([0-9]+[a-z]?(?:\s*(?:,|and|&)\s*[0-9]+[a-z]?)*)/gi;
  let m;
  while ((m = re.exec(str(text)))) {
    for (const n of m[1].split(/\s*(?:,|and|&)\s*/i)) if (n) found.push(n.trim().toUpperCase());
  }
  return found;
}
const namesOnly = (text, known) => sceneNumbersIn(text).every((n) => known.has(n));

/**
 * The day's facts. `scenes` are already reduced:
 * [{ id, number, slug, shotState, takes, circled, floorNote }].
 */
export function wrapFacts({ day, scenes = [] } = {}) {
  const rows = scenes.map((s) => ({
    number: str(s.number), slug: oneLine(s.slug, 120), state: s.shotState || 'not marked',
    takes: Number(s.takes) || 0, circled: Number(s.circled) || 0, floorNote: clip(s.floorNote, 300)
  }));
  const by = (st) => rows.filter((r) => r.state === st).length;
  const totals = {
    scenes: rows.length, shot: by('shot'), part: by('part'), dropped: by('dropped'),
    notMarked: rows.filter((r) => r.state === 'not marked').length,
    takes: rows.reduce((n, r) => n + r.takes, 0), circled: rows.reduce((n, r) => n + r.circled, 0)
  };
  const lines = ['Shoot day ' + str(day), 'Totals: ' + JSON.stringify(totals), 'Scenes:'];
  rows.forEach((r) => lines.push('- ' + JSON.stringify(r)));
  return { text: lines.join('\n'), numbers: rows.map((r) => str(r.number).toUpperCase()).filter(Boolean), totals };
}

export const WRAP_SYSTEM = 'You are an assistant director writing the end-of-day wrap note for a film shoot from the day’s marks. '
  + 'You use ONLY the scenes, states, take counts and floor notes you are given. You name scenes as "Scene N" with the numbers given and never mention a scene that is not in the list. '
  + 'No crew, no names, no contacts. You change nothing; this is a read.';

export const WRAP_SCHEMA = {
  type: 'object',
  properties: { summary: { type: 'string' }, owed: { type: 'array', items: { type: 'string' } }, tomorrow: { type: 'array', items: { type: 'string' } } },
  required: ['summary', 'owed', 'tomorrow'],
  additionalProperties: false
};

export function wrapUser(facts, refine = '') {
  return 'Here is the shoot day as the set marked it.\n\n' + facts.text
    + '\n\nWrite a short wrap summary of the day; what is still owed (scenes not shot, part-shot, or marked in a floor note); '
    + 'and what tomorrow should pick up. Use only this.' + (refine ? '\n\n' + refine : '');
}

/** A sentence naming a scene that was not sent is cut; a list item that
    does is dropped. Both are counted. */
export function readWrap(parsed, numbers = []) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const known = new Set(numbers.map((n) => str(n).toUpperCase()));
  let dropped = 0;
  const sentences = clip(p.summary, 1500).split(/(?<=[.!?])\s+/).filter(Boolean);
  const summary = sentences.filter((s) => { if (namesOnly(s, known)) return true; dropped++; return false; }).join(' ');
  const keep = (list) => strings(list, 10, 300).filter((x) => { if (namesOnly(x, known)) return true; dropped++; return false; });
  return { summary, owed: keep(p.owed), tomorrow: keep(p.tomorrow), dropped };
}

export function wrapText(res, { model: m } = {}) {
  const out = [];
  if (res.summary) out.push(res.summary);
  if (res.owed.length) out.push('Still owed\n' + res.owed.map((x) => '- ' + x).join('\n'));
  if (res.tomorrow.length) out.push('Tomorrow\n' + res.tomorrow.map((x) => '- ' + x).join('\n'));
  if (res.dropped) out.push(res.dropped + (res.dropped === 1 ? ' line' : ' lines') + ' about a scene that is not on this day was left out.');
  return out.join('\n\n') + model(m) + '\n\n' + NOTHING;
}

/* ---- 7. edit-notes ----------------------------------------------- */

/**
 * rows: [{ id, number, slug, cut, set, note, pickups: [text], seconds, floorNote }];
 * cuts: the cut versions' names. The note the editor already wrote is
 * shown as context and never edited: the model is asked for the
 * scenes whose `note` is empty.
 */
export function editFacts({ rows = [], cuts = [] } = {}) {
  const lines = ['Cut versions: ' + (cuts.length ? cuts.map((c) => oneLine(c, 60)).join('; ') : 'none yet'), 'Scenes:'];
  const sent = [];
  rows.forEach((r) => {
    const o = {
      id: str(r.id), number: str(r.number), slug: oneLine(r.slug, 120), cut: r.cut || 'not set', set: r.set || 'none',
      note: clip(r.note, 160), hasNote: !!str(r.note).trim(),
      pickupsOwed: strings(r.pickups, 5, 120), seconds: Number(r.seconds) || 0, floorNote: clip(r.floorNote, 240)
    };
    sent.push(o.id);
    lines.push('- ' + JSON.stringify(o));
  });
  return { text: lines.join('\n'), ids: sent, empty: rows.filter((r) => !str(r.note).trim()).map((r) => str(r.id)) };
}

export const EDIT_SYSTEM = 'You are a film editor’s assistant drafting short per-scene edit notes (what to look for in the cut) from the log of what the set got. '
  + 'You use ONLY the facts given: the scene’s cut state, what the set got, pick-ups owed, runtime and the floor note. You cannot see the cut, so you never describe footage. '
  + 'Write a note ONLY for scenes whose hasNote is false, using the scene’s id exactly as given. Each note is one or two plain sentences, at most 280 characters.';

export const EDIT_SCHEMA = {
  type: 'object',
  properties: { notes: { type: 'array', items: { type: 'object', properties: { sceneId: { type: 'string' }, note: { type: 'string' } }, required: ['sceneId', 'note'], additionalProperties: false } } },
  required: ['notes'],
  additionalProperties: false
};

export function editUser(facts, refine = '') {
  return 'Here is the edit log.\n\n' + facts.text
    + '\n\nDraft a note for each scene whose hasNote is false and where the facts give you something useful to say. Skip a scene if there is nothing to say.'
    + (refine ? '\n\n' + refine : '');
}

/** Items for the tick list. Ids not sent, scenes that already have a
    note, duplicates and empty notes are dropped. */
export function readEditNotes(parsed, { ids = [], empty = [], rows = [] } = {}) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const sent = new Set(ids), blank = new Set(empty), seen = new Set();
  const byId = new Map(rows.map((r) => [str(r.id), r]));
  const items = [];
  let dropped = 0;
  for (const n of Array.isArray(p.notes) ? p.notes : []) {
    const id = str(n && n.sceneId);
    const note = oneLine(n && n.note, NOTE_MAX);
    if (!id || !note || !sent.has(id) || !blank.has(id) || seen.has(id)) { dropped++; continue; }
    seen.add(id);
    const r = byId.get(id) || {};
    items.push({ id: 's' + id, sceneId: id, note, text: 'Scene ' + (str(r.number) || '?') + (r.slug ? ' · ' + r.slug : ''), detail: note });
  }
  return { items, dropped };
}

/**
 * Blanks only. `current` is the edit row's note as it is NOW (re-read
 * inside apply()). → { write: bool, skipped: bool }.
 */
export function canFill(current) { return !str(current).trim(); }

/** Undo: restore '' only when the note is still exactly what was written. */
export function canUndo(current, written) { return str(current) === str(written); }

/* ---- 8. cert-read ------------------------------------------------ */

const NUM_CAP = 40;

/**
 * report: Cbfc.certificationReport(). ratings: the rules JSON's
 * ratings [{id,label,means}]. Per fired rule: id, label, kind, tiers
 * and scene numbers only. No script text and no dialogue.
 */
export function certFacts(report, ratings = []) {
  const fired = (report.byRule || []).map((b) => ({
    ruleId: b.rule.id, label: b.rule.label, kind: b.kind, tiers: b.tiers || {},
    scenes: (b.scenes || []).map((r) => str(r.number)).slice(0, NUM_CAP)
  }));
  const hint = report.hint || {};
  const meaning = (ratings.find((r) => r.id === hint.rating) || {}).means || '';
  const body = {
    ratingHint: { rating: hint.rating || '', label: ((ratings.find((r) => r.id === hint.rating) || {}).label) || hint.rating || '', means: meaning,
      reasons: (hint.reasons || []).map((x) => ({ ruleId: x.ruleId, label: x.label, tier: x.tier, scenes: x.scenes })) },
    ratings: ratings.map((r) => ({ id: r.id, label: r.label, means: r.means })),
    firedRules: fired,
    scanned: report.scanned || {}
  };
  return { text: JSON.stringify(body, null, 2), ruleIds: fired.map((f) => f.ruleId), fired: fired.length };
}

export const CERT_SYSTEM = 'You help an Indian filmmaker prepare for CBFC certification by explaining which certification rules a word-search of their script flagged. '
  + 'Everything you say is a HINT and not advice: the word search misses things and flags things that are fine, and the Board certifies the finished film as a whole, not this app. '
  + 'You never state what the Board will decide and you never give legal advice. You use ONLY the rules, tiers and scene numbers given, and you name a rule only by its ruleId from the list. '
  + 'You have not seen any script text.';

export const CERT_SCHEMA = {
  type: 'object',
  properties: {
    read: { type: 'string' },
    rules: { type: 'array', items: { type: 'object', properties: { ruleId: { type: 'string' }, why: { type: 'string' } }, required: ['ruleId', 'why'], additionalProperties: false } },
    questions: { type: 'array', items: { type: 'string' } }
  },
  required: ['read', 'rules', 'questions'],
  additionalProperties: false
};

export function certUser(facts, refine = '') {
  return 'A word search flagged these certification rules in a script. This is a hint and not advice, and not the Board’s decision.\n\n' + facts.text
    + '\n\nWrite a short plain-language read of where the film stands and why; for the rules that matter most, one line each on why the flag may matter (name the rule by its ruleId); '
    + 'and the questions the filmmaker should answer before applying. Say plainly that this is a hint and not advice.' + (refine ? '\n\n' + refine : '');
}

/** Rule ids that exist in cbfc-rules.json only; others dropped. A
    [bracketed] id in the prose that is not a rule is unwrapped. */
export function readCert(parsed, ruleById) {
  const p = parsed && typeof parsed === 'object' ? parsed : {};
  const exists = (id) => !!(id && ruleById(id));
  let dropped = 0;
  const seen = new Set();
  const rules = [];
  for (const r of Array.isArray(p.rules) ? p.rules : []) {
    const ruleId = str(r && r.ruleId).trim();
    const why = oneLine(r && r.why, 400);
    if (!exists(ruleId) || !why || seen.has(ruleId)) { dropped++; continue; }
    seen.add(ruleId);
    rules.push({ ruleId, why });
  }
  const scrub = (s) => s.replace(/\[([a-z][a-z0-9_-]*)\]/gi, (m, id) => (exists(id) ? '[' + id + ']' : id));
  return { read: scrub(clip(p.read, 1500)), rules, questions: strings(p.questions, 8, 300).map(scrub), dropped };
}

export const HINT_LINE = 'This is a hint, not advice, and not the Board’s decision.';

export function certText(res, ruleById, disclaimer, { model: m } = {}) {
  const out = [];
  if (res.read) out.push(res.read);
  if (res.rules.length) {
    out.push('Rules worth a look\n' + res.rules.map((r) => '- [' + r.ruleId + '] ' + ((ruleById(r.ruleId) || {}).label || '') + ': ' + r.why).join('\n'));
  }
  if (res.questions.length) out.push('Questions to answer before applying\n' + res.questions.map((q) => '- ' + q).join('\n'));
  if (res.dropped) out.push(res.dropped + (res.dropped === 1 ? ' rule' : ' rules') + ' the model named that is not in the rule list was left out.');
  out.push(HINT_LINE + '\n' + str(disclaimer));
  return out.join('\n\n') + model(m) + '\n\n' + NOTHING;
}

export default {
  clip, norm, changeFacts, changesUser, readChanges, changesText, sceneNumbersIn, wrapFacts, wrapUser, readWrap, wrapText,
  editFacts, editUser, readEditNotes, canFill, canUndo, certFacts, certUser, readCert, certText
};
