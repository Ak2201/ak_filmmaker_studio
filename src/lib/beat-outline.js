/* ============================================================
   BEAT OUTLINE — the Story page's beats joined to the scene list
   and the screenplay
   ------------------------------------------------------------
   PURE. Every function takes the story, the scene rows and the script
   elements as arguments and returns a new value; nothing here reads
   or writes storage, so the Outline tab, its coverage meter and the
   editor's margin markers are all derived at render time and stored
   nowhere (the readiness.js rule in CLAUDE.md). The ONE stored fact
   is `scene.beatId`, written by the page on a user action only.

   THE LINK IS FRAMEWORK-QUALIFIED: 'save_the_cat:midpoint', the same
   `<framework>:<beat>` shape the Story page's tension overrides use.
   A bare 'midpoint' would silently re-point when somebody switched
   the Story page from Save the Cat! to Three-Act, because both have a
   midpoint and only one of them is the beat the writer meant. A link
   into a framework that is NOT the active one is shown under the
   nearest active beat by position — `inferred`, with where it came
   from — exactly as story.js treats a passage tagged in another
   framework. Switching framework is a view change, never a write, and
   switching back finds every link where it was left.

   THE SCRIPT SIDE is joined through matchScenes() in
   screenplay-analysis.js — the one join between scene rows and script
   headings — never by position on its own here, so a scene's pages,
   its heading row in the editor and where a new beat's scenes go into
   the script all agree with what reports and visualize already think.
   ============================================================ */
import { frameworkById, matrix, PACING } from './story.js';
import { matchScenes } from './screenplay-analysis.js';
import { elementLines, LINES_PER_PAGE } from './script.js';

/* How far an act may drift from its conventional share of the pages
   before the meter says so. Read from frameworks.json's pacing block
   (data, rule 2); the fallback only covers a file that predates it. */
export const SHARE_TOLERANCE = Number.isFinite(PACING && PACING.actShareTolerance)
  ? PACING.actShareTolerance : 0.08;

/** The placeholder heading a drafted scene opens with: a PROMPT to be
 *  overwritten, in the editor's own placeholder wording. */
export const HEADING_PROMPT = 'INT. LOCATION — DAY';

/* ---- ids ----------------------------------------------------- */
export const qualify = (fwId, beatId) => (fwId && beatId ? fwId + ':' + beatId : '');

/** 'save_the_cat:midpoint' → { fw, beat }; anything else → null. */
export function parseBeatId(id) {
  const s = String(id || '');
  const i = s.indexOf(':');
  if (i <= 0 || i === s.length - 1) return null;
  return { fw: s.slice(0, i), beat: s.slice(i + 1) };
}

const fwExists = (id) => frameworkById(id).id === id;
const beatIn = (fwId, beatId) => (frameworkById(fwId).beats || []).find((b) => b.id === beatId) || null;

function nearest(fwId, at) {
  let best = null, d = Infinity;
  for (const b of frameworkById(fwId).beats) {
    const dd = Math.abs(b.at - at);
    if (dd < d) { d = dd; best = b; }
  }
  return best;
}

/** Where a stored link lands in the ACTIVE framework.
 *  { beat, inferred, from } or null when the link names nothing. */
export function resolveBeat(beatId, fwId) {
  const p = parseBeatId(beatId);
  if (!p || !fwExists(p.fw)) return null;
  const own = beatIn(p.fw, p.beat);
  if (!own) return null;
  if (p.fw === fwId) return { beat: own, inferred: false, from: null };
  const b = nearest(fwId, own.at);
  return b ? { beat: b, inferred: true, from: { fw: frameworkById(p.fw), beat: own } } : null;
}

/* ---- acts ------------------------------------------------------
   A beat's act is `act` in frameworks.json. The act's conventional
   share of the pages comes from pacing.regions — "Act 1" 0–0.25,
   "Act 2A" and "Act 2B" summing to 0.5, "Act 3" 0.75–1 — read by the
   digit in each region's label, so a region added there moves the
   share here with no edit. A beat with no `act` falls into the act
   whose regions cover its position. */
function regionAct(label) {
  const m = /(\d+)/.exec(String(label || ''));
  return m ? Number(m[1]) : 0;
}
export function actShares() {
  const out = {};
  for (const r of (PACING && PACING.regions) || []) {
    const a = regionAct(r.label);
    if (!a) continue;
    out[a] = (out[a] || 0) + (Number(r.to) - Number(r.from));
  }
  return out;
}
function actAt(pos) {
  for (const r of (PACING && PACING.regions) || []) {
    if (pos >= r.from && pos < r.to) return regionAct(r.label) || 1;
  }
  return pos < 0.25 ? 1 : pos < 0.75 ? 2 : 3;
}
const ACT_WORD = { 1: 'One', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five' };
export const actLabel = (n) => 'Act ' + (ACT_WORD[n] || n);

/** The active framework's acts, each with its beats in order. */
export function actsOf(fwId) {
  const fw = frameworkById(fwId);
  const shares = actShares();
  const acts = new Map();
  for (const b of fw.beats) {
    const a = Number.isFinite(b.act) ? b.act : actAt(b.at);
    if (!acts.has(a)) acts.set(a, { act: a, label: actLabel(a), share: shares[a] || 0, beats: [] });
    acts.get(a).beats.push(b);
  }
  return [...acts.values()].sort((x, y) => x.act - y.act);
}

/* ---- the script side ------------------------------------------ */

/** Index into `elements` of each heading sliceScript() counts — a
 *  `scene` element with text, in order. slice.index is into this. */
export function headingIndexes(elements) {
  const out = [];
  (elements || []).forEach((el, i) => {
    if (el && el.type === 'scene' && String(el.text ?? '').trim()) out.push(i);
  });
  return out;
}

/** Per scene row: its script slice (heading element index, the end of
 *  its run, its pages) or its own eighths when nothing matched. */
export function sceneSpans(scenes, elements) {
  const els = elements || [];
  const heads = headingIndexes(els);
  const { pairs } = matchScenes(scenes || [], els);
  return pairs.map((p) => {
    if (!p.slice) {
      const e = Number(p.scene.eighths) || 0;
      return { scene: p.scene, how: null, start: -1, end: -1, headingId: '', pages: e / 8, source: 'eighths' };
    }
    const start = heads[p.slice.index];
    const end = p.slice.index + 1 < heads.length ? heads[p.slice.index + 1] : els.length;
    let lines = 0;
    for (let i = start; i < end; i++) lines += elementLines(els[i]);
    return {
      scene: p.scene, how: p.how, start, end,
      headingId: els[start] ? els[start].id : '',
      pages: lines / LINES_PER_PAGE, source: 'script'
    };
  });
}

/* ---- the outline ---------------------------------------------- */

/** Everything the Outline tab draws, derived.
 *    acts[].beats[] = { beat, key, tension, marks, scenes: [span…] }
 *    unassigned     = spans with no (resolvable) beatId
 *  `story` is loadStory()'s shape; `fwId` defaults to its framework. */
export function outline({ story, scenes, elements, fwId } = {}) {
  const st = story || { source: '', marks: [], tension: {}, framework: '' };
  const fw = frameworkById(fwId || st.framework);
  const rows = scenes || [];
  const spans = sceneSpans(rows, elements);
  const mx = new Map(matrix({ ...st, marks: st.marks || [], tension: st.tension || {} }, fw.id)
    .map((r) => [r.beat.id, r]));
  const byBeat = new Map(fw.beats.map((b) => [b.id, []]));
  const unassigned = [];
  spans.forEach((sp, index) => {
    const r = resolveBeat(sp.scene.beatId, fw.id);
    const row = { ...sp, index, inferred: !!(r && r.inferred), from: r ? r.from : null };
    if (r) byBeat.get(r.beat.id).push(row); else unassigned.push(row);
  });
  const acts = actsOf(fw.id).map((a) => ({
    ...a,
    beats: a.beats.map((b) => {
      const m = mx.get(b.id);
      return {
        beat: b,
        key: qualify(fw.id, b.id),
        tension: m ? m.tension : b.tension,
        marks: m ? m.marks : [],
        scenes: byBeat.get(b.id)
      };
    })
  }));
  return { fw, acts, unassigned, spans };
}

/* ---- coverage --------------------------------------------------
   Two kinds of check, both rendered PASSED as well as failed — a list
   of only failures reads the same whether the outline is clean or the
   check stopped running (readiness.js, CLAUDE.md):
     beat   every beat has at least one scene;
     act    each act's share of the pages linked to a beat sits within
            SHARE_TOLERANCE of its conventional share.
   The act check needs pages to compare, so with nothing linked it is
   reported as not yet measurable rather than as passed. */
const pct = (x) => Math.round(x * 100) + '%';
export function coverage(o) {
  const checks = [];
  const beats = o.acts.flatMap((a) => a.beats);
  for (const b of beats) {
    const n = b.scenes.length;
    checks.push({
      kind: 'beat', key: b.key, ok: n > 0,
      text: n ? b.beat.label + ' has ' + n + (n === 1 ? ' scene' : ' scenes')
              : b.beat.label + ' has no scene yet'
    });
  }
  const linkedPages = o.acts.reduce((t, a) =>
    t + a.beats.reduce((u, b) => u + b.scenes.reduce((v, s) => v + s.pages, 0), 0), 0);
  const totalPages = o.spans.reduce((t, s) => t + s.pages, 0);
  const acts = o.acts.map((a) => {
    const pages = a.beats.reduce((u, b) => u + b.scenes.reduce((v, s) => v + s.pages, 0), 0);
    const actual = linkedPages ? pages / linkedPages : 0;
    let status = 'none';
    if (linkedPages) {
      status = actual > a.share + SHARE_TOLERANCE ? 'over'
        : actual < a.share - SHARE_TOLERANCE ? 'under' : 'ok';
    }
    return { act: a.act, label: a.label, expected: a.share, actual, pages, status };
  });
  for (const a of acts) {
    checks.push({
      kind: 'act', key: 'act:' + a.act, ok: a.status === 'ok', status: a.status,
      text: a.status === 'none'
        ? a.label + ': no pages linked to a beat yet (expected about ' + pct(a.expected) + ')'
        : a.label + ' runs ' + pct(a.actual) + ' of the linked pages against about '
          + pct(a.expected) + (a.status === 'ok' ? ' — on pace'
            : a.status === 'over' ? ' — over its share' : ' — under its share')
    });
  }
  const covered = beats.filter((b) => b.scenes.length).length;
  return {
    checks, acts,
    beatsTotal: beats.length, beatsCovered: covered,
    linkedPages, totalPages,
    unassigned: o.unassigned.length
  };
}

/* ---- navigator -------------------------------------------------- */

/** Per beat with a scene: the first one in scene order, and the script
 *  heading element it opens on ('' when the row matched no heading). */
export function firstScenes(o) {
  const out = [];
  for (const a of o.acts) for (const b of a.beats) {
    if (!b.scenes.length) continue;
    const first = b.scenes.reduce((x, y) => (y.index < x.index ? y : x));
    out.push({ key: b.key, beat: b.beat, act: a.act, scene: first.scene, headingId: first.headingId });
  }
  return out;
}

/* ---- drafting placeholder scenes for a beat ---------------------
   Where they go: after the last scene of this beat or any beat before
   it (by beat order in the active framework), else before the first
   scene of a later beat, else at the end. The same rule for the scene
   list and for the script, each against its own order. */
export function insertionPoint(o, key) {
  const order = o.acts.flatMap((a) => a.beats.map((b) => b.key));
  const k = order.indexOf(key);
  if (k < 0) return { sceneIndex: o.spans.length, elementIndex: -1 };
  const linked = [];
  o.acts.forEach((a) => a.beats.forEach((b) => {
    const pos = order.indexOf(b.key);
    for (const s of b.scenes) linked.push({ pos, s });
  }));
  const before = linked.filter((x) => x.pos <= k).map((x) => x.s);
  const after = linked.filter((x) => x.pos > k).map((x) => x.s);

  let sceneIndex = o.spans.length;
  if (before.length) sceneIndex = Math.max(...before.map((s) => s.index)) + 1;
  else if (after.length) sceneIndex = Math.min(...after.map((s) => s.index));

  let elementIndex = -1;   // -1 = the end of the script
  const bm = before.filter((s) => s.start >= 0);
  const am = after.filter((s) => s.start >= 0);
  if (bm.length) elementIndex = Math.max(...bm.map((s) => s.end));
  else if (am.length) elementIndex = Math.min(...am.map((s) => s.start));
  return { sceneIndex, elementIndex };
}

/** The beat's own words: the passages tagged to it on the Story page,
 *  else the framework's prompt for the beat. */
export function beatWords(b) {
  const tagged = (b.marks || []).filter((m) => !m.inferred).map((m) => m.text.trim()).filter(Boolean);
  const any = tagged.length ? tagged : (b.marks || []).map((m) => m.text.trim()).filter(Boolean);
  return any.length ? any.join(' ') : b.beat.prompt || b.beat.label;
}

/** What one click on "Draft scenes for this beat" adds: one scene row
 *  and a heading + action pair, with where each goes. Pure: the page
 *  turns this into rows and elements and is the only thing that saves. */
export function draftPlan(o, key, scenes) {
  const b = o.acts.flatMap((a) => a.beats).find((x) => x.key === key);
  if (!b) return null;
  const words = beatWords(b);
  const elements = [
    { type: 'scene', text: HEADING_PROMPT },
    { type: 'action', text: words }
  ];
  const lines = elements.reduce((n, el) => n + elementLines(el), 0);
  const nums = (scenes || []).map((s) => parseInt(s.number, 10)).filter(Number.isFinite);
  const number = String((nums.length ? Math.max(...nums) : 0) + 1);
  const synopsis = words.length > 280 ? words.slice(0, 277).trimEnd() + '…' : words;
  return {
    beat: b.beat,
    key,
    scene: { number, intExt: 'INT', dayNight: 'DAY', location: '', synopsis, beatId: key,
             eighths: Math.max(1, Math.round((lines / LINES_PER_PAGE) * 8)) },
    elements,
    ...insertionPoint(o, key)
  };
}

export default {
  SHARE_TOLERANCE, HEADING_PROMPT, qualify, parseBeatId, resolveBeat, actShares, actLabel,
  actsOf, headingIndexes, sceneSpans, outline, coverage, firstScenes, insertionPoint,
  beatWords, draftPlan
};
