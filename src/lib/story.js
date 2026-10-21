/* ============================================================
   STORY — a synopsis, the passages in it that are beats, and the
   tension those beats carry
   ------------------------------------------------------------
   The Story stage's model. story.html is its only page today; the
   extension's side panel and the screening room read it too, which is
   why none of this lives in the page.

   WHAT IS STORED: the synopsis text, the MARKS (a highlighted passage
   plus the beat it was tagged with, per framework), and any tension a
   person or the model set by hand. That is all.

   WHAT IS DERIVED, and must stay derived:
     - a mark's beat in a framework it was never tagged in. A passage
       tagged "Midpoint" in Save the Cat! has a POSITION in the
       synopsis; in the Story Circle it belongs to whichever beat sits
       nearest that position. Computed on read, so switching framework
       is a view change and never a write — and switching back finds
       every hand-made tag exactly where it was left. (PRD FR-503:
       "re-evaluates the mapping while preserving highlighted text
       linkages".)
     - a mark's offsets after the synopsis was edited. Offsets drift the
       moment anyone types above them, so `anchor()` re-finds the
       passage by its text, nearest the old position. A passage that is
       no longer in the synopsis is reported DETACHED rather than
       silently re-pointed at whatever now sits at those offsets.
     - the heatmap and its pacing flags. Same rule as readiness.js: two
       stored opinions about one synopsis disagree the first time one
       of them is edited.

   ONE KEY PER THING. `fms_story_v1` holds the story; the Idea Vault
   is `fms_idea_vault_v1`, because clips arrive from outside the page
   (the extension's context menu) and must not race a save of the
   synopsis for the same blob.
   ============================================================ */

import './store.js';   // must evaluate before anything reads localStorage
import Store from './store.js';
import FRAMEWORKS from '../data/frameworks.json';
import BIBLE from '../data/story-bible.json';
import PATHS from '../data/story-paths.json';
import { readFields } from './blueprint-store.js';

export const STORY_KEY = 'fms_story_v1';
export const VAULT_KEY = 'fms_idea_vault_v1';

export const frameworks = () => FRAMEWORKS.frameworks;
export const frameworkById = (id) =>
  FRAMEWORKS.frameworks.find((f) => f.id === id) ||
  FRAMEWORKS.frameworks.find((f) => f.id === FRAMEWORKS.default);
export const beatById = (fwId, beatId) =>
  (frameworkById(fwId).beats || []).find((b) => b.id === beatId) || null;
export const PACING = FRAMEWORKS.pacing;

const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

export function blankStory() {
  return { v: 1, source: '', sourceName: '', framework: FRAMEWORKS.default,
           marks: [], tension: {}, logline: '', idea: '', outline: [], updatedAt: 0,
           /* the Story Bible's two story-level fields: which kinds of conflict
              (ids from story-bible.json `conflicts`) and the one-line version.
              A story written before they existed reads back [] and ''. */
           conflicts: [], conflictLine: '',
           /* Which beat sheet the writer CHOSE, in Scene order. Until they do,
              the outline is laid out against the format's suggestion
              (suggestedFramework) and the page says so. */
           frameworkChosen: false,
           /* When the writer locked the step outline ('' = open). A lock
              only means "finalised": nothing downstream reads it, and
              Unlock clears it. ISO time. A story written before it
              existed reads back ''. */
           outlineLockedAt: '',
           /* Where the film sits in the market. Written by the Desk's genre
              task on Accept, or typed; `audience` also steers coverage's
              marketability section ('' = its long-standing default).
              Fields spread under older rows, so no migration. */
           genre: '', audience: '', budgetTier: '', comps: [] };
}

/** A framework's own act split (frameworks.json `pacing.regions`), else
 *  the file-wide one. Each label carries its act number. */
export const regionsOf = (fwId) => {
  const r = frameworkById(fwId).pacing && frameworkById(fwId).pacing.regions;
  return Array.isArray(r) && r.length ? r : PACING.regions;
};

/* ---- storage ------------------------------------------------ */

function read(key, fallback) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { /* private mode */ }
  if (!raw) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); return true; }
  catch (e) { return false; }
}

export function loadStory() {
  const s = read(STORY_KEY, null);
  if (!s || typeof s !== 'object') return blankStory();
  // Spread the blank under the stored row so a story written before a
  // field existed reads back with that field's default — the pattern
  // listScenes() set, and the reason no migration exists here.
  const out = { ...blankStory(), ...s };
  out.marks = Array.isArray(s.marks) ? s.marks.filter((m) => m && typeof m.text === 'string') : [];
  out.tension = s.tension && typeof s.tension === 'object' ? s.tension : {};
  out.outline = Array.isArray(s.outline)
    ? s.outline.filter((x) => x && typeof x.id === 'string' && typeof x.beat === 'string')
        .map((x) => ({ ...x, text: typeof x.text === 'string' ? x.text : '' }))
    : [];
  out.idea = typeof s.idea === 'string' ? s.idea : '';
  out.conflicts = Array.isArray(s.conflicts) ? [...new Set(s.conflicts.filter((x) => typeof x === 'string'))] : [];
  out.conflictLine = typeof s.conflictLine === 'string' ? s.conflictLine : '';
  out.outlineLockedAt = typeof s.outlineLockedAt === 'string' ? s.outlineLockedAt : '';
  for (const k of ['genre', 'audience', 'budgetTier']) out[k] = typeof s[k] === 'string' ? s[k] : '';
  out.comps = Array.isArray(s.comps)
    ? s.comps.filter((x) => x && typeof x.title === 'string' && x.title.trim())
        .map((x) => ({ title: x.title, year: typeof x.year === 'string' ? x.year : '', why: typeof x.why === 'string' ? x.why : '' }))
    : [];
  /* A story written before the choice was recorded: a format that is not
     the default, or any step or tag laid out under it, was chosen. */
  out.frameworkChosen = typeof s.frameworkChosen === 'boolean'
    ? s.frameworkChosen
    : (out.framework !== FRAMEWORKS.default || out.outline.length > 0 || out.marks.length > 0);
  return out;
}

export function saveStory(story) {
  story.updatedAt = Date.now();
  return write(STORY_KEY, story);
}

/* ---- marks --------------------------------------------------- */

export function addMark(story, { start, end, fw, beat, origin = 'manual', rationale = '' }) {
  const text = story.source.slice(start, end);
  if (!text.trim()) return null;
  const m = { id: uid(), start, end, text, tags: {}, origin, rationale };
  if (fw && beat) m.tags[fw] = beat;
  story.marks.push(m);
  story.marks.sort((a, b) => a.start - b.start);
  return m;
}

export function tagMark(story, markId, fw, beat) {
  const m = story.marks.find((x) => x.id === markId);
  if (!m) return false;
  if (beat) m.tags[fw] = beat; else delete m.tags[fw];
  return true;
}

export function removeMark(story, markId) {
  const i = story.marks.findIndex((x) => x.id === markId);
  if (i < 0) return false;
  story.marks.splice(i, 1);
  return true;
}

/** Re-find every mark in the current synopsis. Returns NEW objects with
 *  live offsets and a `detached` flag; the stored marks are not touched,
 *  so a passage cut by mistake comes back when it is pasted back. */
export function anchor(story) {
  const src = story.source || '';
  return story.marks.map((m) => {
    if (src.slice(m.start, m.end) === m.text) return { ...m, detached: false };
    let best = -1, bestDist = Infinity, at = src.indexOf(m.text);
    while (at !== -1) {
      const d = Math.abs(at - m.start);
      if (d < bestDist) { best = at; bestDist = d; }
      at = src.indexOf(m.text, at + 1);
    }
    return best < 0
      ? { ...m, detached: true }
      : { ...m, start: best, end: best + m.text.length, detached: false };
  });
}

/** Where a mark sits in the story, 0..1, by its midpoint. */
export const positionOf = (m, len) =>
  len ? Math.min(1, Math.max(0, ((m.start + m.end) / 2) / len)) : 0;

/** The beat nearest a position in a framework. */
export function nearestBeat(fwId, pos) {
  let best = null, d = Infinity;
  for (const b of frameworkById(fwId).beats) {
    const dd = Math.abs(b.at - pos);
    if (dd < d) { d = dd; best = b; }
  }
  return best;
}

/** A mark's beat in a framework: the hand-made tag if there is one,
 *  otherwise the nearest beat by position — flagged `inferred` so the
 *  UI can say which is which. A tag naming a beat the framework no
 *  longer has falls back to inference rather than vanishing. */
export function beatOf(m, fwId, len) {
  const tagged = m.tags && m.tags[fwId];
  if (tagged && beatById(fwId, tagged)) return { beat: beatById(fwId, tagged), inferred: false };
  return { beat: nearestBeat(fwId, positionOf(m, len)), inferred: true };
}

/** The beat matrix: every beat of the framework with the marks it holds,
 *  in story order. */
export function matrix(story, fwId = story.framework) {
  const len = (story.source || '').length;
  const live = anchor(story).filter((m) => !m.detached);
  return frameworkById(fwId).beats.map((b) => ({
    beat: b,
    tension: tensionOf(story, fwId, b),
    marks: live
      .map((m) => ({ m, r: beatOf(m, fwId, len) }))
      .filter((x) => x.r.beat && x.r.beat.id === b.id)
      .map((x) => ({ ...x.m, inferred: x.r.inferred }))
  }));
}

/* ---- tension ------------------------------------------------- */

const tKey = (fwId, beatId) => `${fwId}:${beatId}`;
/** A beat's tension: the score somebody set, else the convention. */
export const tensionOf = (story, fwId, beat) => {
  const v = story.tension[tKey(fwId, beat.id)];
  return Number.isFinite(v) ? v : beat.tension;
};
export function setTension(story, fwId, beatId, value) {
  // '' and null CLEAR the override. Number('') is 0, which is finite,
  // so without this an emptied field would save a tension of 1.
  const n = value === '' || value == null ? NaN : Math.round(Number(value));
  if (!Number.isFinite(n)) delete story.tension[tKey(fwId, beatId)];
  else story.tension[tKey(fwId, beatId)] = Math.min(10, Math.max(1, n));
}

/* The text-only estimate, for stretches no beat covers. Deliberately
   crude and labelled as such on the page: conflict vocabulary per
   hundred words, plus short sentences reading as tempo. It exists so
   an untagged synopsis still draws a curve worth arguing with, not to
   grade anybody's writing. English and romanised Tamil both, because
   that is how synopses here are written. */
const CONFLICT = new Set((
  'kill killed kills murder murdered dead death die dies dying blood fight fights fought ' +
  'attack attacks attacked chase chases chased threat threatens threatened betray betrays ' +
  'betrayed betrayal lose loses lost fear afraid escape escapes escaped trap trapped ' +
  'gun guns knife bomb war enemy enemies revenge danger dangerous desperate scream screams ' +
  'secret secrets lie lies lied arrest arrested police crash crashes explodes explosion ' +
  'kidnap kidnapped hostage confront confronts confrontation collapse collapses fails ' +
  'failure deadline steal stole stolen ruin ruined destroy destroys destroyed ' +
  'sandai kolai rattham bayam thurogam'
).split(/\s+/));

export function lexicalTension(text) {
  const words = (text.toLowerCase().match(/[a-z஀-௿']+/g) || []);
  if (!words.length) return null;
  let hits = 0;
  for (const w of words) if (CONFLICT.has(w)) hits++;
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim()).length || 1;
  const avgLen = words.length / sentences;
  const density = (hits / words.length) * 100;           // per 100 words
  const tempo = avgLen < 10 ? 1.5 : avgLen < 16 ? 0.75 : 0;
  const bangs = Math.min(1, (text.match(/!/g) || []).length * 0.25);
  return Math.min(10, Math.max(1, 2 + density * 1.6 + tempo + bangs));
}

/** Expected tension at a position: the framework's convention, linearly
 *  interpolated between beats. */
export function expectedAt(fwId, pos) {
  const beats = [...frameworkById(fwId).beats].sort((a, b) => a.at - b.at);
  if (pos <= beats[0].at) return beats[0].tension;
  for (let i = 1; i < beats.length; i++) {
    const a = beats[i - 1], b = beats[i];
    if (pos <= b.at) {
      const t = b.at === a.at ? 1 : (pos - a.at) / (b.at - a.at);
      return a.tension + (b.tension - a.tension) * t;
    }
  }
  return beats[beats.length - 1].tension;
}

/** The heatmap: `PACING.windows` equal slices of the synopsis. A slice a
 *  mark covers takes that mark's beat tension (a decision); otherwise the
 *  text estimate (a guess), flagged `estimated`. */
export function heatmap(story, fwId = story.framework) {
  const src = story.source || '';
  const len = src.length;
  const n = PACING.windows;
  if (!len) return [];
  const live = anchor(story).filter((m) => !m.detached);
  const out = [];
  for (let i = 0; i < n; i++) {
    const a = Math.floor((i / n) * len), b = Math.floor(((i + 1) / n) * len);
    const mid = (a + b) / 2;
    const covering = live.filter((m) => m.start <= b && m.end >= a)
      .sort((x, y) => Math.abs((x.start + x.end) / 2 - mid) - Math.abs((y.start + y.end) / 2 - mid))[0];
    const pos = (i + 0.5) / n;
    let tension, estimated = false, beat = null;
    if (covering) {
      beat = beatOf(covering, fwId, len).beat;
      tension = tensionOf(story, fwId, beat);
    } else {
      const lex = lexicalTension(src.slice(a, b));
      tension = lex == null ? expectedAt(fwId, pos) : lex;
      estimated = true;
    }
    out.push({ i, from: a, to: b, pos, tension, expected: expectedAt(fwId, pos), estimated, beat });
  }
  return out;
}

const regionAt = (pos, fwId) => {
  const rs = regionsOf(fwId);
  return (rs.find((r) => pos >= r.from && pos < r.to) || rs[rs.length - 1]).label;
};
const pct = (x) => `${Math.round(x * 100)}%`;

/** Words in the synopsis, and whether there are enough of them for the
 *  slack notes to mean anything (UX audit M27: an eight-word synopsis
 *  was cut into 24 slices and "flagged" as slack). */
export function wordCount(text) {
  const m = String(text || '').match(/\S+/g);
  return m ? m.length : 0;
}
export function tooShortForPacing(story) {
  return wordCount(story && story.source) < (PACING.minWords || 0);
}

/** Pacing flags, derived from the heatmap and the matrix. Each is
 *  `{ kind, level, text, from?, to? }`; `from`/`to` are character
 *  offsets so a flag can scroll the synopsis to the stretch it means. */
export function pacingFlags(story, fwId = story.framework) {
  const flags = [];
  const heat = heatmap(story, fwId);
  if (!heat.length) return flags;
  const n = heat.length;
  const minWin = Math.max(2, Math.ceil(PACING.minRun * n));
  // Slack stretches. The first and last slices are exempt from STARTING
  // a run: a quiet opening image and a quiet final image are the
  // convention, not a sag.
  let run = [];
  const close = () => {
    if (run.length >= minWin) {
      const a = run[0], b = run[run.length - 1];
      const r1 = regionAt(a.pos, fwId), r2 = regionAt(b.pos, fwId);
      const est = run.filter((w) => w.estimated).length;
      flags.push({
        kind: 'slack', level: 'warn',
        text: `Low tension from ${pct(a.pos - 0.5 / n)} to ${pct(b.pos + 0.5 / n)} of the story ` +
              `(${r1 === r2 ? r1 : r1 + ' to ' + r2}) — ${run.length} of ${n} slices at or under ${PACING.lowTension}` +
              (est === run.length ? ', all estimated from the text; tag the beats here to replace the guess.' :
               est ? `, ${est} of them estimated from the text.` : '.'),
        from: a.from, to: b.to
      });
    }
    run = [];
  };
  // Too short to slice: no slack note at all, rather than one read off
  // fragments of words. The hand-tag notes below still apply.
  if (!tooShortForPacing(story)) {
    heat.forEach((w, i) => {
      const edge = i === 0 || i === n - 1;
      if (w.tension <= PACING.lowTension && !(edge && !run.length)) run.push(w); else close();
    });
    close();
  }

  // Beats far from where the framework expects them. Only hand-made tags
  // can be "misplaced"; an inferred beat is by construction the nearest.
  const len = (story.source || '').length;
  for (const m of anchor(story)) {
    if (m.detached) continue;
    const r = beatOf(m, fwId, len);
    if (r.inferred || !r.beat) continue;
    const pos = positionOf(m, len);
    if (Math.abs(pos - r.beat.at) >= 0.2) {
      flags.push({
        kind: 'placement', level: 'info',
        text: `${r.beat.label} lands at ${pct(pos)} — conventionally around ${pct(r.beat.at)}.`,
        from: m.start, to: m.end
      });
    }
  }

  // Beats nothing is tagged with, in this framework, by hand.
  const tagged = new Set(story.marks.map((m) => m.tags && m.tags[fwId]).filter(Boolean));
  const missing = frameworkById(fwId).beats.filter((b) => !tagged.has(b.id));
  if (story.marks.length && missing.length) {
    flags.push({
      kind: 'missing', level: 'info',
      text: `Not tagged by hand in ${frameworkById(fwId).short}: ${missing.map((b) => b.label).join(', ')}.`
    });
  }
  const detached = anchor(story).filter((m) => m.detached).length;
  if (detached) {
    flags.push({ kind: 'detached', level: 'warn',
      text: `${detached} highlighted passage${detached === 1 ? ' is' : 's are'} no longer in the synopsis. ` +
            `Paste the text back to restore ${detached === 1 ? 'it' : 'them'}, or remove ${detached === 1 ? 'it' : 'them'}.` });
  }
  return flags;
}

/* ---- AI beat map -------------------------------------------- */

/** Apply a model's beat map. The model returns QUOTES, never offsets —
 *  a language model counting characters is a model inventing numbers —
 *  and a quote that is not word for word in the synopsis is dropped and
 *  counted, the same rule the dialogue pass enforces: a model cannot
 *  tell a writer they wrote something they did not.
 *  Returns { added, dropped }. Existing hand-made tags in this framework
 *  are never overwritten. */
export function applyBeatMap(story, fwId, rows) {
  let added = 0, dropped = 0;
  const src = story.source || '';
  for (const r of rows || []) {
    const beat = beatById(fwId, r && r.beat);
    const quote = (r && typeof r.quote === 'string') ? r.quote.trim() : '';
    if (!beat || !quote) { dropped++; continue; }
    const at = src.indexOf(quote);
    if (at < 0) { dropped++; continue; }
    const end = at + quote.length;
    const clash = story.marks.find((m) => m.start < end && m.end > at && m.tags[fwId]);
    if (clash) continue;
    const same = story.marks.find((m) => m.start === at && m.end === end);
    const m = same || addMark(story, { start: at, end, origin: 'ai', rationale: String(r.rationale || '') });
    if (!m) { dropped++; continue; }
    m.tags[fwId] = beat.id;
    if (!same) m.rationale = String(r.rationale || '').slice(0, 400);
    if (Number.isFinite(Number(r.tension))) setTension(story, fwId, beat.id, r.tension);
    added++;
  }
  return { added, dropped };
}

/* ---- the step outline (plan revision 3, §1) -------------------
   A numbered list of story events under each beat. STORED: the steps
   themselves, `{ id, beat, text, sceneId? }`, in `story.outline`, in
   the same key as everything else here. The beat is FRAMEWORK-
   QUALIFIED ('save_the_cat:midpoint'), the shape beat-outline.js and
   scene.beatId already use, so switching the format on the page is a
   view change: a step whose beat is not in the format on screen is
   listed as NOT PLACED IN THIS FORMAT, with the nearest beat by
   position offered, and is never dropped. Switching back finds it
   where it was.

   DERIVED: the numbering (1..N across the outline, in beat order),
   the coverage, the grouping by beat and by act, and which path step
   the page is on. None of it is stored.

   This half is pure apart from the story object it is handed. The
   scene list is reached only through the `api` argument (listScenes /
   addScene / removeScene / saveScenes from scenes.js), so it runs in
   Node against a fake and never reaches for another module's key. */

export const qualifyBeat = (fwId, beatId) => (fwId && beatId ? fwId + ':' + beatId : '');

/** 'save_the_cat:midpoint' → { fw, beat }; anything else → null. The
 *  same rule as parseBeatId() in beat-outline.js. */
export function parseBeat(key) {
  const s = String(key || '');
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { fw: s.slice(0, i), beat: s.slice(i + 1) };
}

/** A qualified key resolved EXACTLY — no fallback to the default
 *  framework, unlike frameworkById(). { fw, beat } or null. */
export function resolveBeatKey(key) {
  const p = parseBeat(key);
  if (!p) return null;
  const fw = FRAMEWORKS.frameworks.find((f) => f.id === p.fw);
  const beat = fw && fw.beats.find((b) => b.id === p.beat);
  return beat ? { fw, beat } : null;
}

const actOfBeat = (fwId, b) => {
  if (Number.isFinite(b.act)) return b.act;
  const rs = regionsOf(fwId);
  const r = rs.find((x) => b.at >= x.from && b.at < x.to) || rs[rs.length - 1];
  const m = /(\d+)/.exec(String(r.label || ''));
  return m ? Number(m[1]) : 1;
};

function ensureOutline(story) {
  if (!Array.isArray(story.outline)) story.outline = [];
  return story.outline;
}

/* Insert `step` among the steps of its beat: before the `at`-th one
   when given, else after the last. A beat with no steps yet takes the
   end of the array — the array order matters only WITHIN a beat,
   because the display groups by beat. */
function placeStep(list, step, at) {
  const same = [];
  list.forEach((x, i) => { if (x.beat === step.beat) same.push(i); });
  if (Number.isInteger(at) && at >= 0 && at < same.length) list.splice(same[at], 0, step);
  else if (same.length) list.splice(same[same.length - 1] + 1, 0, step);
  else list.push(step);
}

/** Add a step under a beat. Returns the step, or null for no beat. */
export function addOutlineStep(story, { beat, text = '', at } = {}) {
  if (!parseBeat(beat)) return null;
  const list = ensureOutline(story);
  const step = { id: uid(), beat: String(beat), text: String(text || '') };
  placeStep(list, step, at);
  return step;
}

/** Patch a step's text (or beat — prefer moveOutlineStep for that).
 *  The id is not patchable. Returns the step or null. */
export function updateOutlineStep(story, id, patch = {}) {
  const st = ensureOutline(story).find((x) => x.id === id);
  if (!st) return null;
  if (typeof patch.text === 'string') st.text = patch.text;
  if (patch.beat && parseBeat(patch.beat)) st.beat = String(patch.beat);
  if ('sceneId' in patch) { if (patch.sceneId) st.sceneId = String(patch.sceneId); else delete st.sceneId; }
  return st;
}

export function removeOutlineStep(story, id) {
  const list = ensureOutline(story);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  list.splice(i, 1);
  return true;
}

/** Reorder or re-file a step.
 *    { delta: -1 | 1 }  swap with the neighbouring step of the same beat
 *    { beat, at? }      move under another beat (to its end, or before
 *                       its `at`-th step)
 *    { at }             move to position `at` within its own beat
 *  Returns true when anything moved. */
export function moveOutlineStep(story, id, { delta, beat, at } = {}) {
  const list = ensureOutline(story);
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return false;
  const st = list[i];
  if (beat && beat !== st.beat) {
    if (!parseBeat(beat)) return false;
    list.splice(i, 1);
    st.beat = String(beat);
    placeStep(list, st, at);
    return true;
  }
  const same = [];
  list.forEach((x, k) => { if (x.beat === st.beat) same.push(k); });
  const me = same.indexOf(i);
  if (Number.isInteger(delta) && delta) {
    const j = me + delta;
    if (j < 0 || j >= same.length) return false;
    const k = same[j];
    [list[i], list[k]] = [list[k], list[i]];
    return true;
  }
  if (Number.isInteger(at) && at !== me) {
    list.splice(i, 1);
    placeStep(list, st, at);
    return true;
  }
  return false;
}

/** The outline as the page draws it, in a framework.
 *    beats[]   = { beat, key, act, steps: [step + n] }
 *    unplaced  = steps whose beat is not in this framework, each with
 *                `from` ({ fw, beat } it was written under, or null)
 *                and `suggest` (the nearest beat here by position)
 *    total, withText, covered (beats with a written step), beatsTotal
 *  Numbering runs 1..N across the beats in order, then the unplaced. */
export function outlineByBeat(story, fwId = story && story.framework) {
  const fw = frameworkById(fwId);
  const beats = fw.beats.map((b) => ({ beat: b, key: qualifyBeat(fw.id, b.id), act: actOfBeat(fw.id, b), steps: [] }));
  const byKey = new Map(beats.map((r) => [r.key, r]));
  const unplaced = [];
  for (const st of (story && story.outline) || []) {
    const row = byKey.get(st.beat);
    if (row) { row.steps.push({ ...st }); continue; }
    const from = resolveBeatKey(st.beat);
    unplaced.push({ ...st, from, suggest: from ? nearestBeat(fw.id, from.beat.at) : null });
  }
  let n = 0;
  beats.forEach((r) => r.steps.forEach((s) => { s.n = ++n; }));
  unplaced.forEach((s) => { s.n = ++n; });
  const written = (s) => String(s.text || '').trim();
  return {
    fw, beats, unplaced,
    total: n,
    withText: beats.reduce((t, r) => t + r.steps.filter(written).length, 0) + unplaced.filter(written).length,
    covered: beats.filter((r) => r.steps.some(written)).length,
    beatsTotal: beats.length
  };
}

/** Every step in reading order for a framework: beat by beat, each
 *  unplaced step after the steps of the beat it is nearest to, and a
 *  step that resolves nowhere at the end. Each carries `act`. */
export function stepsInOrder(story, fwId = story && story.framework) {
  const o = outlineByBeat(story, fwId);
  const lost = [];
  const near = new Map();
  for (const u of o.unplaced) {
    if (u.suggest) { if (!near.has(u.suggest.id)) near.set(u.suggest.id, []); near.get(u.suggest.id).push(u); }
    else lost.push(u);
  }
  const out = [];
  for (const r of o.beats) {
    for (const s of r.steps) out.push({ ...s, act: r.act, placed: true });
    for (const s of near.get(r.beat.id) || []) out.push({ ...s, act: r.act, placed: false });
  }
  const lastAct = o.beats.length ? o.beats[o.beats.length - 1].act : 1;
  for (const s of lost) out.push({ ...s, act: lastAct, placed: false });
  return out;
}

/** File every unplaced step under its nearest beat in `fwId`. A user
 *  action — never called on render. Returns how many moved. */
export function fileUnplaced(story, fwId = story.framework, ids = null) {
  let moved = 0;
  for (const u of outlineByBeat(story, fwId).unplaced) {
    if (!u.suggest || (ids && !ids.includes(u.id))) continue;
    if (moveOutlineStep(story, u.id, { beat: qualifyBeat(frameworkById(fwId).id, u.suggest.id) })) moved++;
  }
  return moved;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Assemble the synopsis from the outline: one paragraph per act,
 *  each step's text verbatim, and a mark on each step's exact span
 *  (origin 'outline', tagged with the step's own beat in its own
 *  framework) so the matrix and the curve light up at once.
 *
 *  Marks a previous build made are replaced; marks a person made are
 *  kept (and re-anchor or detach as after any edit). Returns the undo
 *  snapshot { source, sourceName, marks } — hand it to
 *  restoreSynopsis() to put everything back exactly. */
export function buildSynopsisFromOutline(story, fwId = story.framework) {
  const snapshot = { source: story.source || '', sourceName: story.sourceName || '', marks: clone(story.marks || []) };
  const steps = stepsInOrder(story, fwId).filter((s) => String(s.text || '').trim());
  const paras = [];
  for (const s of steps) {
    const last = paras[paras.length - 1];
    if (last && last.act === s.act) last.steps.push(s); else paras.push({ act: s.act, steps: [s] });
  }
  let source = '';
  const spans = [];
  paras.forEach((p, pi) => {
    if (pi) source += '\n\n';
    p.steps.forEach((s, si) => {
      if (si) source += ' ';
      const text = String(s.text).trim().replace(/\s*\n\s*/g, ' ');
      spans.push({ start: source.length, end: source.length + text.length, step: s });
      source += text;
    });
  });
  story.source = source;
  story.sourceName = 'Built from the step outline';
  story.marks = (story.marks || []).filter((m) => m.origin !== 'outline');
  for (const sp of spans) {
    const r = resolveBeatKey(sp.step.beat);
    const m = addMark(story, { start: sp.start, end: sp.end, fw: r ? r.fw.id : '', beat: r ? r.beat.id : '', origin: 'outline' });
    if (m) m.step = sp.step.id;
  }
  return snapshot;
}

/** Put back what buildSynopsisFromOutline() replaced. */
export function restoreSynopsis(story, snapshot) {
  if (!snapshot) return false;
  story.source = String(snapshot.source || '');
  story.sourceName = String(snapshot.sourceName || '');
  story.marks = clone(snapshot.marks || []);
  return true;
}

/* ---- the hand-off to the Screenplay -------------------------- */

const beatPos = (key) => { const r = resolveBeatKey(key); return r ? r.beat.at : null; };

/** One placeholder scene per written step that has no live scene yet,
 *  `beatId` set to the step's beat, the step's text as the synopsis.
 *  ADD-ONLY: an existing scene is never edited, and the order of the
 *  existing rows among themselves never changes. Each new row goes
 *  after the last scene whose beat sits at or before its own, else
 *  before the first one after it, else at the end — the rule
 *  insertionPoint() in beat-outline.js keeps for "Draft scenes for this
 *  beat". Records `sceneId` on each step and returns the new ids,
 *  which is what undoSendOutline() takes.
 *
 *  `api` is scenes.js's default export (or anything shaped like it):
 *  listScenes, addScene, and saveScenes for the placement. */
export function sendOutlineToScenes(story, api, { fwId = story.framework } = {}) {
  const existing = api.listScenes ? api.listScenes() : [];
  const live = new Set(existing.map((s) => s.id));
  const todo = stepsInOrder(story, fwId)
    .filter((s) => String(s.text || '').trim() && !(s.sceneId && live.has(s.sceneId)));
  if (!todo.length) return [];
  const nums = existing.map((s) => parseInt(s.number, 10)).filter(Number.isFinite);
  let num = nums.length ? Math.max(...nums) : 0;
  const created = [];
  for (const s of todo) {
    const text = String(s.text).trim().replace(/\s+/g, ' ');
    const sc = api.addScene({
      number: String(++num), intExt: 'INT', dayNight: 'DAY', location: '',
      synopsis: text.length > 280 ? text.slice(0, 277).trimEnd() + '…' : text,
      beatId: s.beat, eighths: 8
    });
    if (!sc || !sc.id) continue;
    created.push(sc.id);
    const real = story.outline.find((x) => x.id === s.id);
    if (real) real.sceneId = sc.id;
  }
  if (created.length && api.listScenes && api.saveScenes) {
    const fresh = new Set(created);
    const all = api.listScenes();
    const base = all.filter((s) => !fresh.has(s.id));
    for (const id of created) {
      const sc = all.find((s) => s.id === id);
      if (!sc) continue;
      const p = beatPos(sc.beatId);
      let at = base.length;
      if (p != null) {
        let lastLe = -1, firstGt = -1;
        base.forEach((x, i) => {
          const q = beatPos(x.beatId);
          if (q == null) return;
          if (q <= p) lastLe = i; else if (firstGt < 0) firstGt = i;
        });
        if (lastLe >= 0) at = lastLe + 1; else if (firstGt >= 0) at = firstGt;
      }
      base.splice(at, 0, sc);
    }
    api.saveScenes(base);
  }
  return created;
}

/** Undo a send: removes exactly the scenes it created, and clears the
 *  link on the steps that pointed at them. Returns how many went. */
export function undoSendOutline(story, ids, api) {
  const gone = new Set(ids || []);
  if (!gone.size) return 0;
  const live = new Set((api.listScenes ? api.listScenes() : []).map((s) => s.id));
  let n = 0;
  for (const id of gone) {
    if (api.listScenes && !live.has(id)) continue;
    api.removeScene(id);
    n++;
  }
  for (const st of story.outline || []) if (st.sceneId && gone.has(st.sceneId)) delete st.sceneId;
  return n;
}

/* ---- the path (derived, never stored) ------------------------ */

/* NO STEP IS MANDATORY. The order is a suggestion: every step is on the
   page at once, a tick only means "this has something in it", and Next
   offers the first EMPTY step after the one you are on.

   TWO PATHS. src/data/story-paths.json holds one road per project
   format — a short film's is not a feature's with steps missing, and
   the page never mixes them. PATH is the feature's (what every caller
   that never named a format has always seen); pathFor(format) is the
   one to use.

   `n` is the step's STABLE NUMBER — what `#path-N` links and the
   blueprint drawer's `steps.stages.json` mapping were written against
   (1 idea, 4 outline, 5 synopsis, 7 bible; the retired numbers land
   through story-paths.json `aliases`, see pathAlias). It is not the
   step's place in the line: that is `pos`. */
const buildPath = (rows) => rows.map((p, i) => ({ ...p, cards: p.cards || [], absorbs: p.absorbs || [], pos: i + 1 }));
const PATH_BY_FORMAT = { feature: buildPath(PATHS.feature), short: buildPath(PATHS.short) };
export const PATH = PATH_BY_FORMAT.feature;

/** 'short' for a short-film project, else 'feature'. */
export const pathFormat = (format) => (format === 'short' ? 'short' : 'feature');
/** The path for a project format: 'short' → the short film's road,
    anything else → the feature's. */
export const pathFor = (format) => PATH_BY_FORMAT[pathFormat(format)];
export const pathStepById = (id, format = 'feature') => pathFor(format).find((p) => p.id === id) || null;

/** The framework the outline is laid out against for a format until the
    writer chooses one in Scene order. */
export const suggestedFramework = (format) => (pathFormat(format) === 'short' ? 'short_five' : 'save_the_cat');
/** The framework in force: the writer's choice once made, else the
    format's suggestion. */
export const effectiveFramework = (story, format) =>
  (story && story.frameworkChosen ? frameworkById(story.framework).id : suggestedFramework(format));

/** The step a RETIRED step id or number lands on now (story-paths.json
    `aliases`: 2 logline, 3 structure, 6 screenplay, 8 setups, 9 timeline,
    10 lock, 11-13 the short film's old Bible steps, and ids such as
    `pacing`), or '' when `x` is not a retired one. Since the four-step
    path (19 Oct 2026) every old link lands where its question is asked. */
export function pathAlias(x, format = 'feature') {
  const aliases = (PATHS.aliases || {})[pathFormat(format)] || {};
  const k = String(x == null ? '' : x).replace(/^#?path-/, '');
  const to = Object.prototype.hasOwnProperty.call(aliases, k) ? aliases[k] : '';
  return to && pathFor(format).some((p) => p.id === to) ? to : '';
}

/** A path step id from whatever a link carries: `path-<id>` (the form
    the page writes), `path-<N>` (the stable numbers) or a RETIRED id or
    number (pathAlias). '' when the hash is not a path hash at all; the
    format's FIRST step only when it names nothing this path ever had. */
export function pathStepFromHash(hash, format = 'feature') {
  const m = /^#?path-([a-z][a-z0-9_-]*|\d+)$/.exec(String(hash || ''));
  if (!m) return '';
  const path = pathFor(format);
  if (/^\d+$/.test(m[1])) {
    const p = path.find((x) => x.n === Number(m[1]));
    if (p) return p.id;
  } else if (path.some((x) => x.id === m[1])) return m[1];
  return pathAlias(m[1], format) || path[0].id;
}

/** "<ns>:<id>[#part]" → { ns, id, part, raw } for the absorbs lists. */
export function parseAbsorb(raw) {
  const m = /^([a-z]+):([a-z0-9-]+)(?:#([a-z0-9_]+))?$/.exec(String(raw));
  return m ? { ns: m[1], id: m[2], part: m[3] || '', raw: String(raw) } : null;
}

/** The `renderGuide` items for one path step's `absorbs`: { steps: the
    whole steps and checklist-only steps, in order; ladder: the treatment
    ladder narrowed to just the rungs the step takes, or null }. Pure. */
export function absorbItems(absorbs, format) {
  const fmt = pathFormat(format);
  const steps = [];
  const rungs = [];
  for (const raw of absorbs || []) {
    const x = parseAbsorb(raw);
    if (!x) continue;
    if (x.id === 'treatment-ladder') { if (x.part) rungs.push(x.part); continue; }
    steps.push({ ns: x.ns, id: x.id, kind: 'step', format: fmt, ...(x.part === 'rest' ? { only: 'rest' } : {}) });
  }
  const ladder = rungs.length ? { ns: 'feature', id: 'treatment-ladder', kind: 'interlude', format: fmt, rungs } : null;
  return { steps, ladder };
}

/** The path step that asks a blueprint step now: for the old
    `story.html?step=<format>/<id>#guide` links (src/lib/blueprint-route.js),
    which land on the step instead of at the Guide's cover. '' when no
    path step takes it. */
export function pathStepForBlueprint(format, id) {
  const ns = pathFormat(format);
  for (const p of pathFor(format)) {
    if (p.absorbs.some((a) => { const x = parseAbsorb(a); return x && x.ns === ns && x.id === id; })) return p.id;
  }
  return '';
}

/* ---- the Story Bible, as far as the path needs to know -------- */

const projectIsShort = () => {
  try { const p = Store && Store.currentProject && Store.currentProject(); return !!(p && p.format === 'short'); }
  catch (e) { return false; }
};
const nonBlank = (v) => typeof v === 'string' && v.trim() !== '';

/** The blueprint fields a card shows, in order: [{ ns, key, label,
    placeholder, rows, learn }]. A short film uses the short blueprint's
    key where there is one and falls back to the feature blueprint's for
    the rest (story-bible.json `map` and `fallback`). */
export function bibleFields(cardId, format = 'feature') {
  const m = BIBLE.map[cardId];
  if (!m) return [];
  const out = [];
  const add = (ns, key) => out.push({ ns, key, ...(BIBLE.fields[key] || { label: key }) });
  if (format === 'short' && (m.short || []).length) {
    m.short.forEach((k) => add('short', k));
    (BIBLE.fallback[cardId] || []).forEach((k) => add('feature', k));
  } else {
    m.feature.forEach((k) => add('feature', k));
  }
  return out;
}

/** Which Bible cards hold something. Derived from what is stored where
    it is stored — the story model (conflict), the blueprint blobs
    (stakes, theme, world and the protagonist/antagonist/ally answers)
    and the characters list — never from a flag. */
export function bibleStatus(story) {
  const s = story || blankStory();
  const format = projectIsShort() ? 'short' : 'feature';
  const anyIn = (pairs) => {
    const by = { feature: [], short: [] };
    pairs.forEach(({ ns, key }) => by[ns].push(key));
    return ['feature', 'short'].some((ns) => by[ns].length && Object.values(readFields(ns, by[ns])).some(nonBlank));
  };
  // every key the character slots read, in this project's format
  const slotPairs = [];
  for (const [role, sl] of Object.entries(BIBLE.slots)) {
    if (role.startsWith('_')) continue;
    const fields = Object.fromEntries(Object.entries(sl.fields).map(([f, k]) => [f, { ns: 'feature', key: k }]));
    if (format === 'short') for (const [f, k] of Object.entries(sl.short || {})) fields[f] = { ns: 'short', key: k };
    slotPairs.push(...Object.values(fields));
    for (const x of sl.extras.feature || []) slotPairs.push({ ns: 'feature', key: x.key });
    if (format === 'short') for (const x of sl.extras.short || []) slotPairs.push({ ns: 'short', key: x.key });
  }
  let stored = false;
  try {
    const raw = JSON.parse(localStorage.getItem('fms_characters_v1') || 'null');
    const list = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.characters) ? raw.characters : []);
    const textual = ['name', 'age', 'want', 'need', 'arc', 'voice', 'look', 'stakes', 'fear', 'lie', 'flaw', 'strength',
      'wound', 'secret', 'arcStart', 'arcEnd'];
    stored = list.some((c) => c && typeof c === 'object' && (textual.some((f) => nonBlank(c[f]))
      || (Array.isArray(c.relationships) && c.relationships.some((r) => r && (nonBlank(r.who) || nonBlank(r.how))))));
  } catch (e) { /* unreadable: not filled */ }
  const cards = {
    characters: stored || anyIn(slotPairs),
    conflict: (s.conflicts || []).length > 0 || nonBlank(s.conflictLine),
    stakes: anyIn(bibleFields('stakes', format)),
    theme: anyIn(bibleFields('theme', format)),
    world: anyIn(bibleFields('world', format))
  };
  const count = Object.values(cards).filter(Boolean).length;
  return { cards, count, total: Object.keys(cards).length, any: count > 0 };
}

const blueprintHas = (ns, keys) => {
  try { return Object.values(readFields(ns, keys)).some(nonBlank); } catch (e) { return false; }
};
/* Every blueprint key a path step's own absorbs list names — for a whole
   step the keys its content carries, which only the blueprint JSON knows;
   a step's filled-ness therefore reads the keys the page asks for it. */
const range15 = Array.from({ length: 15 }, (_, i) => 'b' + String(i + 1).padStart(2, '0'));
const STEP_KEYS = {
  feature: {
    idea: ['s1_whatif', 's1_why_me', 's1_image', 's2_log1', 's2_log2', 's2_log_final', 'lad_1_logline'],
    outline: [...range15, 'lad_5_outline', 's9_chrono', 's9_screen', 's9_why',
      ...Array.from({ length: 5 }, (_, i) => ['s10_setup_' + (i + 1), 's10_pay_' + (i + 1)]).flat()],
    synopsis: ['lad_2_synopsis', 'lad_3_onepager', 'lad_4_treatment']
  },
  short: {
    idea: ['s1_seed', 's1_image', 's1_why', 's2_log1', 's2_log2', 's2_log_final'],
    outline: ['b1_setup', 'b2_disturb', 'b3_escalate', 'b4_turn', 'b5_image', 's4_test']
  }
};

/** Which path steps are filled, from the story, the blueprint answers
    each one asks inline, and the scene rows. `format` defaults to the
    open project's. Four steps since 19 Oct 2026: the Beat Sheet is done
    once a step is written (a beat sheet chosen with nothing under it yet
    is `doing`), and its lock and its send to the Screenplay are detail. */
export function pathProgress(story, { scenes = [], format } = {}) {
  const s = story || blankStory();
  const fmt = pathFormat(format || (projectIsShort() ? 'short' : 'feature'));
  const fw = effectiveFramework(s, fmt);
  const o = outlineByBeat(s, fw);
  const live = new Set((scenes || []).map((x) => x.id));
  const sent = (s.outline || []).filter((x) => x.sceneId && live.has(x.sceneId)).length;
  const bible = bibleStatus(s);
  const keys = STEP_KEYS[fmt];
  const bp = (id) => !!(keys[id] && blueprintHas(fmt, keys[id]));
  const idea = !!String(s.idea || '').trim(), logline = !!String(s.logline || '').trim();
  /* a short film's Bible step shows three cards, a feature's all five; a
     short also shows stakes and theme when (and only when) they hold the
     feature blueprint's answer (story-bible.js shortShowsCard), so those
     count exactly when they are on the page and the tick and the
     "n of N" always agree */
  const cardIds = fmt === 'short'
    ? ['characters', 'world', 'conflict', ...['stakes', 'theme'].filter((c) => bible.cards[c])]
    : Object.keys(bible.cards);
  const cardsIn = cardIds.filter((c) => bible.cards[c]).length;
  const locked = !!String(s.outlineLockedAt || '').trim();
  const words = (String(s.source || '').match(/\S+/g) || []).length;
  const tagged = (s.marks || []).length;
  const done = {
    idea: idea || logline || bp('idea'),
    bible: cardsIn > 0,   /* the cards this format's step shows */
    outline: o.withText > 0 || bp('outline'),
    synopsis: words > 0 || bp('synopsis')
  };
  const doing = { outline: !done.outline && (!!s.frameworkChosen || tagged > 0) };
  const detail = {
    idea: idea && logline ? 'idea and logline' : idea ? 'idea, no logline yet' : logline ? 'logline' : '',
    bible: cardsIn ? `${cardsIn} of ${cardIds.length} cards` : '',
    outline: [
      o.withText ? `${o.withText} step${o.withText === 1 ? '' : 's'} · ${o.covered} of ${o.beatsTotal} beats` : (s.frameworkChosen ? frameworkById(fw).short : ''),
      locked ? 'locked' : '',
      sent ? `${sent} sent` : ''
    ].filter(Boolean).join(' · '),
    synopsis: words ? `${words} words` + (tagged ? ` · ${tagged} tagged` : '') : ''
  };
  return pathFor(fmt).map((p) => ({ ...p, done: !!done[p.id], doing: !!doing[p.id], detail: detail[p.id] || '' }));
}

/** What "Next" offers from `cur`: the first step AFTER it with nothing
    in it yet; when every later step has something, simply the step
    after. null at the end of the line. A suggestion, never a gate. */
export function suggestNext(progress, cur) {
  const i = progress.findIndex((p) => p.id === cur);
  const after = progress.slice(i + 1);
  return after.find((p) => !p.done) || after[0] || null;
}

/** The step a story should open on when nothing asked for one (an id):
    the synopsis once there is one, so a returning writer lands on their
    editor; else the first early step not yet filled. */
export function defaultPathStep(story, opts = {}) {
  const s = story || blankStory();
  const p = pathProgress(s, opts);
  const ids = p.map((x) => x.id);
  if (String(s.source || '').trim() && ids.includes('synopsis')) return 'synopsis';
  if (p.find((x) => x.id === 'outline').done) return 'outline';
  const early = ids.slice(0, ids.indexOf('outline'));
  const first = p.filter((x) => early.includes(x.id)).find((x) => !x.done);
  return first ? first.id : 'outline';
}

/** Lock the step outline (now, as ISO) or unlock it. Mutates `story`. */
export function setOutlineLock(story, locked, at = new Date()) {
  story.outlineLockedAt = locked ? new Date(at).toISOString() : '';
  return story.outlineLockedAt;
}

/** "Where am I" for a position in the synopsis (0..1): the nearest
 *  beat, the next beat still ahead, and the convention's tension. */
export function whereAt(fwId, pos) {
  const p = Math.min(1, Math.max(0, Number(pos) || 0));
  const beats = [...frameworkById(fwId).beats].sort((a, b) => a.at - b.at);
  return { pos: p, nearest: nearestBeat(fwId, p), next: beats.find((b) => b.at > p + 0.005) || null, expected: expectedAt(fwId, p) };
}

/* ---- exports -------------------------------------------------- */

const pc = (x) => Math.round(x * 100) + '%';

export function synopsisText(story) {
  return String((story && story.source) || '').trim() + '\n';
}

/** The beat sheet and step outline as Markdown: the format, every
 *  beat with its prompt and its numbered steps, the steps not placed
 *  in this format, and the passages tagged in the synopsis. */
export function outlineMarkdown(story, fwId = story && story.framework, { title = '' } = {}) {
  const s = story || blankStory();
  const o = outlineByBeat(s, fwId);
  const L = [];
  L.push('# ' + (title ? title + ' — ' : '') + 'Beat sheet and step outline', '');
  L.push('**Format:** ' + o.fw.label + ' (' + o.fw.beats.length + ' beats)', '');
  if (String(s.idea || '').trim()) L.push('**Idea:** ' + s.idea.trim(), '');
  if (String(s.logline || '').trim()) L.push('**Logline:** ' + s.logline.trim(), '');
  L.push('**Coverage:** ' + o.covered + ' of ' + o.beatsTotal + ' beats have a step.', '');
  let act = null;
  for (const r of o.beats) {
    if (r.act !== act) { act = r.act; L.push('## Act ' + act, ''); }
    L.push('### ' + r.beat.label + ' (around ' + pc(r.beat.at) + ')', '', '_' + r.beat.prompt + '_', '');
    const st = r.steps.filter((x) => String(x.text || '').trim());
    if (st.length) { st.forEach((x) => L.push(x.n + '. ' + x.text.trim().replace(/\s*\n\s*/g, ' '))); L.push(''); }
    else L.push('(no step yet)', '');
  }
  const un = o.unplaced.filter((x) => String(x.text || '').trim());
  if (un.length) {
    L.push('## Not placed in this format', '');
    un.forEach((x) => L.push(x.n + '. ' + x.text.trim().replace(/\s*\n\s*/g, ' ') +
      (x.from ? ' — written under ' + x.from.fw.short + ': ' + x.from.beat.label : '')));
    L.push('');
  }
  const mx = matrix(s, o.fw.id).filter((r) => r.marks.length);
  if (mx.length) {
    L.push('## Tagged passages in the synopsis', '');
    for (const r of mx) for (const m of r.marks) {
      L.push('- **' + r.beat.label + '**' + (m.inferred ? ' (placed by position)' : '') + ': “' + m.text.replace(/\s*\n\s*/g, ' ') + '”');
    }
    L.push('');
  }
  return L.join('\n');
}

/* ---- starting drafts for the Write page's documents ----------
   A READ HELPER. The One-Pager, the Treatment and the Synopsis on
   write.html open with a first draft built from this story when, and
   only when, the document is still empty. The draft is shown in the
   editor and is NOT saved: it becomes the writer's text the moment
   they type into it, and until then it is re-derived on every open,
   so it is never a stale copy of the story. Returns '' when the story
   has nothing to start from — an empty draft is no draft. */
export const STARTER_KINDS = ['One-Pager', 'Treatment', 'Synopsis'];

export function docStarter(story, kind, { title = '' } = {}) {
  if (!STARTER_KINDS.includes(kind)) return '';
  const s = story || blankStory();
  const logline = String(s.logline || '').trim();
  const idea = String(s.idea || '').trim();
  const syn = String(s.source || '').trim();
  const o = outlineByBeat(s, s.framework);
  const hasOutline = o.withText > 0;
  if (!logline && !syn && !hasOutline && !idea) return '';
  const steps = () => stepsInOrder(s, s.framework)
    .filter((x) => String(x.text || '').trim());
  /* The outline as prose, one paragraph per act: what a synopsis or a
     treatment is when there is no written synopsis yet. */
  const outlineProse = () => {
    const paras = [];
    for (const st of steps()) {
      const last = paras[paras.length - 1];
      const t = String(st.text).trim().replace(/\s*\n\s*/g, ' ');
      if (last && last.act === st.act) last.text += ' ' + t; else paras.push({ act: st.act, text: t });
    }
    return paras.map((p) => p.text).join('\n\n');
  };
  if (kind === 'Synopsis') {
    return syn ? synopsisText(s).trim() : (hasOutline ? outlineProse() : logline || idea);
  }
  if (kind === 'One-Pager') {
    const L = [];
    if (title) L.push(title.toUpperCase(), '');
    if (logline) L.push('LOGLINE', logline, '');
    else if (idea) L.push('THE IDEA', idea, '');
    const body = syn || (hasOutline ? outlineProse() : '');
    if (body) {
      // A one-pager carries the short synopsis: the first paragraphs
      // up to about 250 words, never a sentence cut in half.
      const out = [];
      let n = 0;
      for (const para of body.split(/\n\s*\n/)) {
        const w = (para.match(/\S+/g) || []).length;
        if (out.length && n + w > 250) break;
        out.push(para.trim());
        n += w;
      }
      L.push('SYNOPSIS', out.join('\n\n'), '');
    }
    L.push('TONE', '', 'COMPARABLE FILMS', '', 'WHY NOW', '');
    return L.join('\n').trim() + '\n';
  }
  // Treatment: the logline, then the beat sheet and step outline.
  const L = [];
  if (logline) L.push(logline, '');
  if (hasOutline) L.push(outlineMarkdown(s, s.framework, { title }));
  else if (syn) L.push(synopsisText(s).trim());
  else if (idea) L.push(idea);
  return L.join('\n').trim() + '\n';
}

/* ---- Idea Vault --------------------------------------------- */

export function listVault() {
  const v = read(VAULT_KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.snippet === 'string') : [];
}
function saveVault(items) { return write(VAULT_KEY, items); }

/** The host to show for a clipping's source, or '' when it should not be
 *  a link at all. Only http(s): a vault syncs with the project, so an
 *  editor could store `javascript://host/%0a…`, which has a hostname and
 *  would otherwise be drawn as a clickable link. */
export function clipSourceHost(url) {
  const s = String(url || '');
  if (!/^https?:\/\//i.test(s)) return '';
  try { return new URL(s).hostname; } catch (e) { return ''; }
}

export function addToVault({ snippet, url = '', title = '', at = Date.now(), id } = {}) {
  const text = String(snippet || '').trim();
  if (!text) return null;
  const items = listVault();
  // The extension may deliver the same clip twice (a retry after the
  // side panel reloaded); its id makes the second delivery a no-op.
  if (id && items.some((x) => x.id === id)) return null;
  const item = { id: id || uid(), snippet: text.slice(0, 4000), url: String(url).slice(0, 2000),
                 title: String(title).slice(0, 300), at, beat: '' };
  items.unshift(item);
  saveVault(items);
  return item;
}
export function updateVault(id, patch) {
  const items = listVault();
  const it = items.find((x) => x.id === id);
  if (!it) return false;
  Object.assign(it, patch);
  return saveVault(items);
}
export function removeFromVault(id) {
  const items = listVault();
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) return false;
  items.splice(i, 1);
  return saveVault(items);
}
