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
import FRAMEWORKS from '../data/frameworks.json';

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
           marks: [], tension: {}, logline: '', updatedAt: 0 };
}

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

const regionAt = (pos) =>
  (PACING.regions.find((r) => pos >= r.from && pos < r.to) || PACING.regions[PACING.regions.length - 1]).label;
const pct = (x) => `${Math.round(x * 100)}%`;

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
      const r1 = regionAt(a.pos), r2 = regionAt(b.pos);
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
  heat.forEach((w, i) => {
    const edge = i === 0 || i === n - 1;
    if (w.tension <= PACING.lowTension && !(edge && !run.length)) run.push(w); else close();
  });
  close();

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

/* ---- Idea Vault --------------------------------------------- */

export function listVault() {
  const v = read(VAULT_KEY, []);
  return Array.isArray(v) ? v.filter((x) => x && typeof x.snippet === 'string') : [];
}
function saveVault(items) { return write(VAULT_KEY, items); }

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
