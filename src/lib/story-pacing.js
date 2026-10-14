/* ============================================================
   STORY PACING — the Beats & pacing section's three views, derived
   ------------------------------------------------------------
   PURE. story.html#pacing draws a beat-level tension curve, an
   intensity distribution and a deck of beat cards. Every number on
   them comes from what is already stored —

     fms_story_v1     the marks (tagged passages) and the tension a
                      person set by hand (story.tension), read through
                      story.js;
     fms_scenes_v1    each scene's `beatId`, joined to
     fms_script_v1    the screenplay's headings by beat-outline.js —

   and NOTHING HERE WRITES. The curve, the distribution and the deck
   are recomputed on every render and stored nowhere (the readiness.js
   rule in CLAUDE.md): two stored opinions about one synopsis disagree
   the first time one of them is edited.

   WHAT CANNOT BE MEASURED IS LEFT OUT, never guessed. A page target
   needs a length to be a fraction of; with no scene and no script it
   is null and the card shows the beat's conventional position as a
   percentage instead. A beat no scene serves has no "opens on" page
   and no script link.
   ============================================================ */
import * as Story from './story.js';
import Outline from './beat-outline.js';

/** Above this a slice reads as high intensity; the low line is
 *  frameworks.json's own `pacing.lowTension`, the one the slack flags
 *  already use. */
export const HIGH_TENSION = 7;
const lowLine = () => (Story.PACING && Number.isFinite(Story.PACING.lowTension) ? Story.PACING.lowTension : 3.5);

const tKey = (fwId, beatId) => `${fwId}:${beatId}`;

/** The region (act) label a position falls in, for the framework. */
export function regionLabel(fwId, pos) {
  const rs = Story.regionsOf(fwId);
  return (rs.find((r) => pos >= r.from && pos < r.to) || rs[rs.length - 1]).label;
}

/** The curve: one point per beat of the framework, in position order.
 *    at          where the beat sits, 0..1 — the mean position of the
 *                passages tagged to it BY HAND when there are any (the
 *                story's own placement), else the convention;
 *    placed      'tagged' | 'convention'
 *    tension     tensionOf() — the hand score, else the convention
 *    expected    the framework's conventional tension
 *    overridden  a person set this beat's score
 *  Inferred (position-placed) marks do not move a beat: by
 *  construction they sit nearest it already. */
export function tensionCurve(story, fwId = story && story.framework) {
  const st = story || Story.blankStory();
  const fw = Story.frameworkById(fwId);
  const len = (st.source || '').length;
  const live = len ? Story.anchor({ ...st, marks: st.marks || [] }).filter((m) => !m.detached) : [];
  return fw.beats.map((b, i) => {
    const mine = live.filter((m) => m.tags && m.tags[fw.id] === b.id);
    const at = mine.length
      ? mine.reduce((t, m) => t + Story.positionOf(m, len), 0) / mine.length
      : b.at;
    const v = st.tension && st.tension[tKey(fw.id, b.id)];
    return {
      n: i + 1, beat: b, at, conventionAt: b.at,
      placed: mine.length ? 'tagged' : 'convention',
      tension: Story.tensionOf({ tension: st.tension || {} }, fw.id, b),
      expected: b.tension,
      overridden: Number.isFinite(v),
      region: regionLabel(fw.id, b.at)
    };
  }).sort((a, b) => a.at - b.at || a.n - b.n);
}

/** Intensity level of one tension score: 'low' | 'mid' | 'high'. */
export function levelOf(t) {
  return t <= lowLine() ? 'low' : t >= HIGH_TENSION ? 'high' : 'mid';
}

/** The distribution: the heatmap's slices (story.heatmap — the same
 *  data the slack flags read), each with its level, plus the share of
 *  the story at each level and how much of it is estimated from the
 *  words rather than a tagged beat. [] slices for an empty synopsis. */
export function intensity(story, fwId = story && story.framework) {
  const slices = Story.heatmap(story, fwId).map((w) => ({ ...w, level: levelOf(w.tension) }));
  const n = slices.length;
  const count = (lv) => slices.filter((w) => w.level === lv).length;
  const share = n ? { low: count('low') / n, mid: count('mid') / n, high: count('high') / n } : { low: 0, mid: 0, high: 0 };
  const peak = n ? slices.reduce((a, b) => (b.tension > a.tension ? b : a)) : null;
  return {
    slices, share, peak,
    estimated: slices.filter((w) => w.estimated).length,
    lowLine: lowLine(), highLine: HIGH_TENSION
  };
}

/** The deck: one card per beat in framework order.
 *    pageTarget   the beat's conventional position × the film's length
 *                 in pages, or null when no length is known
 *    pages        { total, source: 'script' | 'scenes' | null }
 *    opensOn      page the first scene linked to this beat starts on
 *    scenes       how many scene rows serve the beat
 *    href         screenplay.html#line-<heading> for that first scene
 *                 when it matched a script heading, else null
 *    passage      the first passage tagged to the beat by hand, else
 *                 the first one placed there by position (inferred) */
export function beatDeck({ story, scenes = [], elements = [], fwId } = {}) {
  const st = story || Story.blankStory();
  const fw = Story.frameworkById(fwId || st.framework);
  const o = Outline.outline({ story: st, scenes, elements, fwId: fw.id });
  const total = o.spans.reduce((t, s) => t + (Number(s.pages) || 0), 0);
  const source = !o.spans.length ? null : o.spans.some((s) => s.source === 'script') ? 'script' : 'scenes';
  // Where each span opens, in scene order.
  const startOf = new Map();
  let run = 0;
  o.spans.forEach((sp) => { startOf.set(sp.scene.id, run + 1); run += Number(sp.pages) || 0; });
  const curve = new Map(tensionCurve(st, fw.id).map((p) => [p.beat.id, p]));
  const out = [];
  let n = 0;
  for (const a of o.acts) {
    for (const b of a.beats) {
      n = fw.beats.indexOf(b.beat) + 1;
      const first = b.scenes.length ? b.scenes.reduce((x, y) => (y.index < x.index ? y : x)) : null;
      const marks = b.marks || [];
      const passage = marks.find((m) => !m.inferred) || marks[0] || null;
      const p = curve.get(b.beat.id);
      out.push({
        n, beat: b.beat, key: b.key,
        act: a.act, actLabel: a.label, region: regionLabel(fw.id, b.beat.at),
        conventionAt: b.beat.at, at: p ? p.at : b.beat.at, placed: p ? p.placed : 'convention',
        tension: b.tension, expected: b.beat.tension, overridden: !!(p && p.overridden),
        pageTarget: total > 0 ? Math.max(1, Math.round(b.beat.at * total)) : null,
        opensOn: first ? Math.floor(startOf.get(first.scene.id) || 1) : null,
        scenes: b.scenes.length,
        sceneNumber: first ? String(first.scene.number || '') : '',
        href: first && first.headingId ? 'screenplay.html#line-' + encodeURIComponent(first.headingId) : null,
        passage: passage ? { id: passage.id, text: passage.text, inferred: !!passage.inferred, start: passage.start } : null,
        marks: marks.length
      });
    }
  }
  out.sort((x, y) => x.n - y.n);
  return { fw, beats: out, pages: { total, source } };
}

/** A smooth path through points (Catmull-Rom as cubic Béziers), for
 *  the curve. `pts` are [x, y] in drawing units; returns an SVG `d`.
 *  Control points are clamped to the band the two ends span so the
 *  line never overshoots past 0 or 10 between two beats. */
export function smoothPath(pts) {
  if (!pts.length) return '';
  const f = (v) => Math.round(v * 10) / 10;
  if (pts.length === 1) return `M${f(pts[0][0])},${f(pts[0][1])}`;
  let d = `M${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
    const lo = Math.min(p1[1], p2[1]), hi = Math.max(p1[1], p2[1]);
    const cl = (y) => Math.min(hi, Math.max(lo, y));
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, cl(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, cl(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d;
}

export default { tensionCurve, intensity, beatDeck, levelOf, smoothPath, regionLabel, HIGH_TENSION };
