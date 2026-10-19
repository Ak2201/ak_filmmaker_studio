/* ============================================================
   STORY PAGE MODEL — the derivations story.html draws
   ------------------------------------------------------------
   Everything on the Story page that does not need the DOM: which
   format the project is, the story as the page sees it (with the
   framework in force), the step menu's groups, the figures under the
   synopsis, the "where you are" sentence, the tagging pane's runs of
   text and marks, the offsets a selection trims to, the counts beside
   the send to the Screenplay, the pitch deck's contents and the
   addresses the page is opened with. src/pages/story.js builds the
   screen from these and keeps only view state.

   NOT src/lib/story.js. That file is the story MODEL (synopsis, marks,
   tension, the outline) and is shared with the blueprints; this one is
   only what the Story page derives from it. It stores nothing: every
   write is still the page calling Story.saveStory().
   ============================================================ */
import Store from './store.js';
import * as Story from './story.js';
import Scenes from './scenes.js';
import Pitch from './pitch-deck.js';
import IO from './story-io.js';
import { loadScript } from './script.js';
import { loadCharacters } from './characters.js';
import { screenTime, formatDuration } from './screenplay-analysis.js';

/* ---- the project ------------------------------------------------- */

/** The open project's format ('short', 'feature', or ''), never a throw. */
export const projectFormat = () => { try { const p = Store.currentProject && Store.currentProject(); return (p && p.format) || ''; } catch (e) { return ''; } };
/** The path the page follows: 'short' or 'feature'. */
export const storyFormat = () => (projectFormat() === 'short' ? 'short' : 'feature');

/* The story as the page sees it: the framework in force is the writer's
   choice once made, else the format's suggestion — never a toolbar
   select. (A save writes that value back, which changes nothing the
   writer chose: `frameworkChosen` is what says whether they did.) */
export function pageStory(format) {
  const s = Story.loadStory();
  s.framework = Story.effectiveFramework(s, format);
  return s;
}

export const pct = (x) => Math.round(x * 100) + '%';
/** The scene list, or [] when it cannot be read. */
export const safeScenes = () => { try { return Scenes.listScenes(); } catch (e) { return []; } };

/* ---- the feature blueprint, READ ONLY ------------------------------
   The path offers its step 01/02 answers for the idea and the logline. */
const bpText = (v) => (typeof v === 'string' ? v.trim() : '');
export const blueprintIdea = (format) => (format === 'feature' ? bpText(IO.readBlueprint('feature').s1_whatif) : '');
export function blueprintLogline(format) {
  if (format !== 'feature') return '';
  const b = IO.readBlueprint('feature');
  return bpText(b.s2_log_final) || bpText(b.s2_log2) || bpText(b.s2_log1);
}

/* ---- the step menu --------------------------------------------------
   The path's four steps (progress ticks them) and then, only when the
   console switches it on, the Pitch deck under Tools — which has no
   done-state, so it carries no tick. Beats & pacing is inside the
   Synopsis step and the cover sheet is the project dashboard's Title
   page since 19 Oct 2026; their sections are not menu rows. An item's id
   is the PANEL's element id (path-<id>, or pitch). */
export const EXTRAS = [
  { id: 'pitch', label: 'Pitch deck' }
];
export const STEP_ICON = {
  idea: 'lightbulb', bible: 'menu_book', outline: 'list', synopsis: 'description'
};
export const EXTRA_META = {
  pitch: { icon: 'slideshow', hint: 'A pitch deck built from the story so far.' }
};
export const bareOf = (pid) => String(pid).replace(/^path-/, '');
export const isExtra = (id) => EXTRAS.some((x) => x.id === id);

/** The section menu's groups, from Story.pathProgress()'s rows. */
export function menuGroups(progress) {
  const groups = [];
  for (const p of progress) {
    const label = p.group || '';
    let g = groups[groups.length - 1];
    if (!g || g.label !== label) { g = { label, items: [] }; groups.push(g); }
    g.items.push({
      id: 'path-' + p.id, label: p.label, icon: STEP_ICON[p.id] || '', done: !!p.done, doing: !p.done && !!p.doing,
      hint: p.done ? (p.detail ? 'Done · ' + p.detail : 'Done') : p.doing ? (p.detail ? 'Started · ' + p.detail : 'Started') : 'To do', n: p.n
    });
  }
  /* How many of a group's steps are done, beside its name. */
  for (const g of groups) {
    if (g.label && g.items.length) g.label += ' · ' + g.items.filter((i) => i.done).length + '/' + g.items.length;
  }
  groups.push({ label: 'Tools', items: EXTRAS.map((x) => ({ id: x.id, label: x.label, icon: EXTRA_META[x.id].icon, hint: EXTRA_META[x.id].hint })) });
  return groups;
}

/** A path step id, from an id, a stable number or a RETIRED id or number
    (story-paths.json `aliases`: #path-6 is the Beat Sheet's Send now); only
    something this path never had lands on the path's first step. */
export function resolveStepId(x, path, format = 'feature') {
  if (path.some((p) => p.id === x)) return x;
  const byN = path.find((p) => p.n === Number(x));
  if (byN) return byN.id;
  return Story.pathAlias(x, format) || path[0].id;
}

/* Where inside its new step a RETIRED step's link lands (an element id on
   the page), so #path-lock reaches the lock toggle and #path-setups opens
   the Setups & payoffs box rather than the top of the Beat Sheet. Keyed
   by the old id AND its stable number. Page ids, not storage. */
const LEGACY_SPOT = {
  logline: 'logline', structure: 'st-fw-pick', setups: 'st-more-setups', timeline: 'st-more-timeline',
  lock: 'stLockRow', screenplay: 'stHandoff', pacing: 'pacing'
};
const LEGACY_N = { 2: 'logline', 3: 'structure', 6: 'screenplay', 8: 'setups', 9: 'timeline', 10: 'lock' };
/** The element a retired path hash lands on inside its new step, or ''. */
export function legacySpot(hash) {
  const m = /^#?path-([a-z][a-z0-9_-]*|\d+)$/.exec(String(hash || ''));
  if (!m) return '';
  const id = /^\d+$/.test(m[1]) ? LEGACY_N[m[1]] : m[1];
  return (id && LEGACY_SPOT[id]) || '';
}

/* ---- small text ------------------------------------------------------ */

/** A quote cut to `max` characters with an ellipsis. */
export const clip = (text, max) => (text.length > max ? text.slice(0, max - 3) + '…' : text);

/** 'on 12 Oct 2026 at 14:05', or '' for a date that does not parse. */
export const lockedWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : 'on ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

/** The beat a format's tension peaks at. */
export const peakBeat = (fw) => [...fw.beats].sort((a, b) => b.tension - a.tension)[0];

/* A format's tension convention as a small curve: the points of the
   line and of the area under it, in a W×H box. */
export function miniCurvePoints(fw, W, H, pad) {
  const beats = [...fw.beats].sort((a, b) => a.at - b.at);
  const pts = beats.map((b) => [pad + b.at * (W - pad * 2), H - pad - ((b.tension - 1) / 9) * (H - pad * 2)]);
  return {
    pts,
    area: [[pts[0][0], H - pad], ...pts, [pts[pts.length - 1][0], H - pad]].map((p) => p.join(',')).join(' '),
    line: pts.map((p) => p.join(',')).join(' ')
  };
}

/* ---- the models the deck and the figures read ---------------------- */

export function deckContext() {
  let scenesNow = [], elementsNow = [];
  try { scenesNow = Scenes.listScenes(); } catch (e) { scenesNow = []; }
  try { elementsNow = loadScript().elements || []; } catch (e) { elementsNow = []; }
  return { scenes: scenesNow, elements: elementsNow };
}
export function characterCount() {
  try { return loadCharacters().length; } catch (e) { return 0; }
}

/* Four figures under the synopsis, each measured: the words on the page,
   the passages tagged, the scenes in the list and the screen time those
   scenes work out to (the Screenplay Analysis's own estimate). */
export function synopsisFigures(s) {
  const words = s.source.trim().split(/\s+/).filter(Boolean).length;
  const ctx = deckContext();
  const cards = [
    { label: 'Words', value: String(words) },
    { label: 'Passages tagged', value: String(s.marks.length), note: s.marks.length ? '' : 'none yet' }
  ];
  if (ctx.scenes.length) {
    cards.push({ label: 'Scenes in the list', value: String(ctx.scenes.length) });
    let sec = 0;
    try { sec = screenTime(ctx.scenes, ctx.elements).total; } catch (e) { sec = 0; }
    if (sec) cards.push({ label: 'Est. screen time', value: formatDuration(sec), note: 'from the script and scene list' });
  }
  return cards;
}

/** The outline against the scene list: written steps, how many already
    have a live scene, and how many are left to send. */
export function sendCounts(s, sceneList) {
  const live = new Set(sceneList.map((x) => x.id));
  const written = s.outline.filter((x) => x.text.trim());
  const sent = written.filter((x) => x.sceneId && live.has(x.sceneId)).length;
  return { written: written.length, sent, todo: written.length - sent };
}

/** What the pitch deck would hold, as words ([] when nothing). */
export function pitchContents() {
  let d = null;
  try { d = Pitch.collectPitch(); } catch (e) { d = null; }
  return d ? [
    d.logline && 'logline', d.synopsis && 'synopsis', d.beats.length && `${d.beats.length} beats`,
    d.characters.length && `${d.characters.length} characters`, d.keyScenes.length && `${d.keyScenes.length} key scenes`,
    d.numbers.length && 'production numbers'
  ].filter(Boolean) : [];
}

/* ---- the tagging pane ----------------------------------------------
   The synopsis as runs: plain text, and marks with their beat. The pane
   draws exactly these and nothing else, so a selection's character
   offset is the model's offset. Overlapping passages: the earlier one
   draws. */
export function sourceSegments(s, litBeat) {
  const out = [];
  const len = s.source.length;
  let at = 0;
  const live = Story.anchor(s).filter((m) => !m.detached).sort((a, b) => a.start - b.start);
  for (const m of live) {
    if (m.start < at) continue;
    if (m.start > at) out.push({ text: s.source.slice(at, m.start) });
    const r = Story.beatOf(m, s.framework, len);
    out.push({
      mark: m.id,
      beat: r.beat ? r.beat.id : '',
      inferred: !!r.inferred,
      lit: !!(litBeat && r.beat && r.beat.id === litBeat),
      title: (r.beat ? r.beat.label : '') + (r.inferred ? ' (placed by position)' : ''),
      text: s.source.slice(m.start, m.end)
    });
    at = m.end;
  }
  if (at < len) out.push({ text: s.source.slice(at) });
  return out;
}

/** Trim whitespace at a selection's edges so a sloppy drag still tags
    the words; null when nothing is left. */
export function trimSelection(src, start, end) {
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
  return end > start ? { start, end } : null;
}

/** Whether a selection overlaps a passage already tagged. */
export const overlapsMark = (marks, o) => marks.some((m) => m.start < o.end && m.end > o.start);

/* ---- where you are (rev. 3 §1b) ------------------------------------ */
export function whereText(fwId, pos) {
  const w = Story.whereAt(fwId, pos);
  let t = `You are at ${pct(w.pos)} of the synopsis — nearest beat ${w.nearest.label}, conventionally around ${pct(w.nearest.at)}`;
  if (w.next && w.next.id !== w.nearest.id) t += `; ${w.next.label} is expected around ${pct(w.next.at)}`;
  return t + '.';
}

/* ---- the address the page is opened with --------------------------- */

/** An old blueprint link — ?step=feature/step-07 — as the path step that
    asks that step now, or ''. */
export function blueprintStepFromSearch(search, format) {
  const m = /^(feature|short)\/(step-\d+|treatment-ladder)$/.exec(new URLSearchParams(search).get('step') || '');
  return m && m[1] === format ? Story.pathStepForBlueprint(format, m[2]) : '';
}

/** ?start=sample is the default sample; ?start=sample-<id> is that one.
    Returns the regex match (null when START is not a sample). */
export const startSample = (start) => /^sample(?:-([a-z]+))?$/.exec(start || '');
