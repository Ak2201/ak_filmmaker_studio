/* ============================================================
   SCRIPT ANALYSIS — screenplay.html#analysis
   ------------------------------------------------------------
   "Know how the script works." The view of
   src/lib/script-analysis-model.js, which derives everything from the
   script in memory and the stored scenes and story, and writes nothing:

     · the tension curve, scene by scene, with the framework's
       convention dashed beside it (the Story page's curve style,
       src/styles/story-pacing.css — the same chart, read off the
       script rather than the synopsis);
     · pacing from the spread of scene lengths, per act;
     · structure: each beat's conventional page and the scene on it;
     · the cast across the script: where each character enters,
       returns and leaves; who shares scenes;
     · the last AI coverage report, if there is one;
     · and behind the AI pill, "Notes on tension and arcs" (the Desk
       task 'tension-notes') and the coverage report — a read, never a
       write, on the writer's own key and plan.

   Built only when the tab is opened, so the editor's first paint and
   verify's idle-write check see none of it. Charts are inline SVG for
   the lines and HTML for every word (crisp at 390px), coloured from
   tokens through the stylesheets — no colour is written here.
   ============================================================ */
import '../styles/story-pacing.css';
import '../styles/script-analysis.css';
import { h } from '../lib/dom.js';
import { analyseScript, pagesOf } from '../lib/script-analysis-model.js';
import { smoothPath } from '../lib/story-pacing.js';
import { formatDuration } from '../lib/screenplay-analysis.js';
import { listScenes } from '../lib/scenes.js';
import { loadStory, frameworkById } from '../lib/story.js';
import { coverageStore, VERDICT_WORD, stamp } from '../lib/coverage-store.js';
import { currentProject } from '../lib/store.js';
import { panel, statStrip, table, notice, button, emptyState } from './kit/index.js';
import { aiPill } from './ai-pill.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const pct = (x) => Math.round(x * 100) + '%';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const title = (s) => String(s || '').toLowerCase().replace(/(^|[\s\-/(])(\p{L})/gu, (m, p, c) => p + c.toUpperCase());

function format() {
  try { const p = currentProject(); return p && p.format === 'short' ? 'short' : 'feature'; } catch (e) { return 'feature'; }
}

/* ---- the tension curve ------------------------------------------- */
function tensionPanel(a) {
  const t = a.tension;
  const pts = t.points.filter((p) => p.value != null);
  if (pts.length < 2) {
    return panel({ eyebrow: ['Tension', 'scene by scene'], body: [h('p.sa-none', { text: 'Not enough written in the scenes to read a curve yet: a curve needs at least two scenes with action or dialogue.' })] });
  }
  /* The read sits in a narrow band on a whole screenplay, so the axis
     is the script's own range (at least three points), labelled. */
  const vals = pts.map((p) => p.value).concat(pts.map((p) => p.expected));
  let lo = Math.max(0, Math.floor(Math.min(...vals) - 0.5));
  let hi = Math.min(10, Math.ceil(Math.max(...vals) + 0.5));
  if (hi - lo < 3) { const mid = (hi + lo) / 2; lo = Math.max(0, Math.floor(mid - 1.5)); hi = Math.min(10, lo + 3); }
  const W = 1000, H = 240;
  const X = (pos) => pos * W;
  const Y = (v) => H - ((v - lo) / (hi - lo)) * H;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pc-curve-svg', role: 'img', 'aria-labelledby': 'saCurveT saCurveD' });
  const tt = svgEl('title', { id: 'saCurveT' }); tt.textContent = 'Estimated tension in every scene of the script';
  const dd = svgEl('desc', { id: 'saCurveD' });
  dd.textContent = pts.length + ' scenes. Mean ' + t.mean + ', spread ' + t.spread + (t.peak ? '. Peak in scene ' + t.peak.number + ' at ' + t.peak.value : '') + '. The dashed line is the ' + frameworkById(a.framework).short + ' convention.';
  svg.append(tt, dd);
  if (t.lowLine > lo && t.lowLine < hi) svg.append(svgEl('line', { x1: 0, x2: W, y1: Y(t.lowLine), y2: Y(t.lowLine), class: 'pc-grid pc-grid-low' }));
  svg.append(svgEl('line', { x1: 0, x2: W, y1: Y((lo + hi) / 2), y2: Y((lo + hi) / 2), class: 'pc-grid' }));
  for (const at of [0.25, 0.5, 0.75]) svg.append(svgEl('line', { x1: X(at), x2: X(at), y1: 0, y2: H, class: 'pc-act-line' }));
  const smooth = t.points.filter((p) => p.smooth != null).map((p) => [X(p.pos), Y(p.smooth)]);
  const line = smoothPath(smooth);
  if (smooth.length) svg.append(svgEl('path', { d: `${line} L${smooth[smooth.length - 1][0]},${H} L${smooth[0][0]},${H} Z`, class: 'pc-area' }));
  svg.append(svgEl('path', { d: smoothPath(t.points.map((p) => [X(p.pos), Y(p.expected)])), class: 'pc-conv' }));
  svg.append(svgEl('path', { d: line, class: 'pc-line' }));

  const plot = h('div.pc-plot.sa-plot', {}, [svg]);
  const acts = h('div.pc-acts', { 'aria-hidden': 'true' });
  [['Act 1', 0, 0.25], ['Act 2A', 0.25, 0.5], ['Act 2B', 0.5, 0.75], ['Act 3', 0.75, 1]].forEach(([l, f, to]) => {
    const sp = h('span', { text: l }); sp.style.left = pct(f); sp.style.width = pct(to - f); acts.append(sp);
  });
  plot.append(acts);
  const dots = h('div.sa-dots', { 'aria-hidden': 'true' });
  for (const p of pts) {
    const d = h('span.sa-dot' + (p.level === 'high' ? '.is-high' : p.level === 'low' ? '.is-low' : '') + (t.peak && p.i === t.peak.i ? '.is-peak' : ''));
    d.style.left = (p.pos * 100).toFixed(2) + '%';
    d.style.top = ((1 - (p.value - lo) / (hi - lo)) * 100).toFixed(2) + '%';
    if (t.peak && p.i === t.peak.i) d.append(h('span.sa-dot-tip', { text: 'Sc ' + p.number + ' · ' + p.value }));
    dots.append(d);
  }
  plot.append(dots);
  const axis = h('div.pc-axis', { 'aria-hidden': 'true' }, [String(hi), String((lo + hi) / 2), String(lo)].map((v) => h('span', { text: v })));
  const legend = h('div.pc-legend', {}, [
    h('span.pc-key.pc-key-line', { text: 'This script (three-scene average)' }),
    h('span.pc-key.pc-key-conv', { text: frameworkById(a.framework).short + ' convention' }),
    h('span.pc-key.sa-key-dot', { text: 'A scene' })
  ]);
  const flags = t.flags.length
    ? h('ul.sa-flags', {}, t.flags.map((f) => h('li.sa-flag.is-' + f.level, { text: f.text })))
    : h('p.sa-note', { text: 'No long low stretch, and the tension builds the way the convention expects.' });
  return panel({
    eyebrow: ['Tension', 'scene by scene'],
    meta: 'Mean ' + t.mean + ' · spread ' + t.spread,
    body: [h('div.pc-chart', {}, [axis, plot]), legend, flags,
      h('p.pc-note', { text: 'An ESTIMATE read off the words of each scene — conflict, short sentences, exclamations — on a 1–10 scale, the same reading the Story page uses on a synopsis. For a reader’s judgement, use Notes on tension and arcs in the AI menu.' })]
  });
}

/* ---- pacing ---------------------------------------------------------- */
function pacingPanel(a) {
  const p = a.pacing;
  const rows = a.scenes;
  const max = Math.max(1, ...rows.map((r) => r.eighths));
  const W = 1000, H = 120;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'sa-bars-svg', role: 'img', 'aria-label': 'Scene lengths in script order: ' + plural(rows.length, 'scene') + ', median ' + p.medianPages + ' pages, longest ' + (p.longest ? p.longest.pages + ' (scene ' + p.longest.number + ')' : '—') });
  const bw = W / Math.max(1, rows.length);
  rows.forEach((r, i) => {
    const bh = Math.max(2, (r.eighths / max) * H);
    svg.append(svgEl('rect', { x: (i * bw + bw * 0.12).toFixed(1), y: (H - bh).toFixed(1), width: Math.max(1, bw * 0.76).toFixed(1), height: bh.toFixed(1), class: 'sa-bar' + (r.eighths > p.longLine ? ' is-long' : r.eighths <= 2 ? ' is-short' : '') }));
  });
  const bars = h('div.sa-bars', {}, [svg]);
  const ends = h('div.pc-heat-ends', { 'aria-hidden': 'true' }, [h('span', { text: 'Sc ' + (rows[0] ? rows[0].number : '') }), h('span', { text: 'Sc ' + (rows.length ? rows[rows.length - 1].number : '') })]);
  const dist = table({
    label: 'Scene lengths',
    columns: [{ key: 'label', label: 'Length' }, { key: 'count', label: 'Scenes', num: true }, { key: 'share', label: 'Share', num: true }],
    rows: p.buckets.map((b) => ({ label: b.label, count: b.count, share: rows.length ? pct(b.count / rows.length) : '—' }))
  });
  const acts = table({
    label: 'Acts',
    columns: [{ key: 'label', label: 'Act' }, { key: 'scenes', label: 'Scenes', num: true }, { key: 'pages', label: 'Pages', num: true }, { key: 'mean', label: 'Average scene', num: true }],
    rows: p.acts.map((x) => ({ label: x.label, scenes: x.scenes, pages: pagesOf(x.eighths), mean: x.scenes ? pagesOf(x.mean) : '—' }))
  });
  const said = p.rhythm === 'even' ? 'Scene lengths are even: most scenes run about the same.' : p.rhythm === 'varied' ? 'Scene lengths vary, long scenes set against short ones.' : 'Scene lengths are very uneven: a few long scenes carry much of the script.';
  return panel({
    eyebrow: ['Pacing', 'scene lengths'],
    meta: 'Median ' + p.medianPages + ' · longest ' + (p.longest ? p.longest.pages : '—'),
    body: [bars, ends,
      h('p.sa-note', { text: said + ' Pages are counted at 55 lines a page.' }),
      p.flags.length ? h('ul.sa-flags', {}, p.flags.map((f) => h('li.sa-flag.is-info', { text: f.text }))) : null,
      h('div.sa-two', {}, [dist, acts])].filter(Boolean)
  });
}

/* ---- structure ----------------------------------------------------- */
function structurePanel(a) {
  const s = a.structure;
  const rows = s.beats.map((b) => ({
    beat: b.label, at: pct(b.at), page: b.targetPage == null ? '—' : 'p. ' + b.targetPage,
    scene: b.scene ? 'Sc ' + b.scene : '—', heading: b.sceneHeading ? title(b.sceneHeading) : '',
    tension: b.tensionThere == null ? '—' : b.tensionThere + ' / ' + b.expected,
    opens: b.opensOn ? 'p. ' + b.opensOn + (b.drift ? ' (' + (b.drift > 0 ? '+' : '') + b.drift + ')' : '') : '—'
  }));
  /* Four columns fit a phone; the scene's heading rides as its tooltip,
     and "opens on" appears only once a scene is linked to a beat. */
  const cols = [
    { key: 'beat', label: 'Beat' }, { key: 'page', label: 'Page', num: true },
    { key: 'scene', label: 'Scene there', render: (r) => h('span', { text: r.scene, title: r.heading }) },
    { key: 'tension', label: 'Tension / expected', num: true }
  ];
  if (s.linked) cols.push({ key: 'opens', label: 'Linked opens', num: true });
  const t = table({ label: 'Beats against the pages', columns: cols, rows });
  return panel({
    eyebrow: ['Structure', s.framework.short],
    meta: s.pages + ' pages' + (s.linked ? ' · ' + plural(s.linked, 'beat') + ' linked to scenes' : ''),
    body: [t, h('p.pc-note', { text: 'Where each beat of ' + s.framework.label + ' conventionally falls, as a page of this script, and the scene that is on that page. Link scenes to beats on the Story page and it also says where each beat really opens.' })]
  });
}

/* ---- the cast ------------------------------------------------------ */
function castPanel(a) {
  const c = a.cast.characters.slice(0, 12);
  if (!c.length) return panel({ eyebrow: ['Cast', 'across the script'], body: [h('p.sa-none', { text: 'No character cues yet. A character is anyone with a cue in the script.' })] });
  const list = h('ol.sa-cast', { 'aria-label': 'Characters by number of scenes' });
  for (const p of c) {
    const strip = h('div.sa-track', { 'aria-hidden': 'true' });
    const span = h('span.sa-span'); span.style.left = pct(p.from); span.style.width = pct(Math.max(0.005, p.to - p.from)); strip.append(span);
    for (const n of p.numbers) {
      const r = a.scenes.find((x) => x.number === n);
      if (!r) continue;
      const tick = h('span.sa-tick'); tick.style.left = (r.pos * 100).toFixed(2) + '%'; strip.append(tick);
    }
    list.append(h('li.sa-cast-row', {}, [
      h('span.sa-cast-name', { text: title(p.name) }),
      h('span.sa-cast-n', { text: plural(p.scenes, 'scene') + ' · Sc ' + p.first + '–' + p.last }),
      strip
    ]));
  }
  const pairs = a.cast.together.slice(0, 5);
  return panel({
    eyebrow: ['Cast', 'across the script'],
    meta: plural(a.cast.characters.length, 'speaking character'),
    body: [list,
      pairs.length ? h('p.sa-note', { text: 'Most often together: ' + pairs.map((x) => title(x.a) + ' and ' + title(x.b) + ' (' + x.shared + ')').join(' · ') + '.' }) : null,
      h('p.pc-note', { text: 'Each line runs from a character’s first scene to their last; a tick is a scene they speak in. A long gap is an arc that goes quiet.' })].filter(Boolean)
  });
}

/* ---- AI coverage --------------------------------------------------- */
function coveragePanel(getDoc) {
  let done = [];
  try { done = coverageStore(getDoc, () => {}).done(); } catch (e) { done = []; }
  const last = done[done.length - 1];
  const body = [];
  if (last) {
    const r = (last.coverage.result && last.coverage.result.report) || {};
    body.push(h('p.sa-verdict', {}, [h('b', { text: VERDICT_WORD[r.verdict] || 'Report' }), h('span', { text: ' · ' + stamp(last.coverage.at) + (last.coverage.model ? ' · ' + last.coverage.model : '') })]));
    if (r.verdictWhy) body.push(h('p.sa-note', { text: r.verdictWhy }));
    if (r.logline) body.push(h('p.sa-note', { text: 'Logline as read: ' + r.logline }));
    body.push(button({ label: 'Read the full report', href: 'write.html?stay=1#coverage', size: 'sm', iconAfter: 'arrow_forward' }));
  } else {
    body.push(h('p.sa-none', { text: 'No AI coverage yet. A coverage report reads the whole script — premise, structure, character, dialogue, pacing — and every point quotes your pages. Run it from the AI menu above, on your own key.' }));
  }
  return panel({ eyebrow: ['AI coverage'], body });
}

/* ---- the whole tab ---------------------------------------------------- */

/** Build the tab's content. opts { getDoc, onBreakdown? } */
export function renderAnalysis(opts = {}) {
  const doc = typeof opts.getDoc === 'function' ? opts.getDoc() : null;
  const elements = (doc && doc.elements) || [];
  let story = null;
  try { story = loadStory(); } catch (e) { story = null; }
  const scenes = listScenes();
  const a = analyseScript({ elements, scenes, story, format: format() });
  const ai = aiPill({
    label: 'AI',
    tasks: [{ id: 'tension-notes', label: 'Notes on tension and arcs' }, { id: 'coverage', label: 'Coverage report' }, { id: 'scene-notes', label: 'Scene notes' }],
    ctx: () => ({ getDoc: opts.getDoc, save: opts.save, elements: () => ((opts.getDoc && opts.getDoc()) || {}).elements, after: () => { if (typeof opts.refresh === 'function') opts.refresh(); } })
  });
  const head = h('div.sa-head', {}, [
    h('div.sa-head-copy', {}, [
      h('h2.sa-title', { text: 'Script analysis' }),
      h('p.sa-sub', { text: 'How the script works, read from its pages by rules: tension, pacing, structure and the cast. Nothing here is stored or changed.' })
    ]),
    h('div.sa-head-acts', {}, [
      opts.onBreakdown ? button({ label: 'Break down everything', icon: 'auto_awesome', size: 'sm', action: 'sc-pipeline' }) : null,
      ai
    ].filter(Boolean))
  ]);
  if (!a.scenes.length) {
    return h('div.sa', {}, [head, emptyState({ icon: 'assessment', title: 'No scenes to analyse yet', body: 'Write or import a screenplay with scene headings (INT. or EXT.) and the analysis reads it here.' })]);
  }
  const stats = statStrip([
    { label: 'Scenes', value: a.totals.scenes, note: a.totals.pages + ' pages' },
    { label: 'Running time', value: formatDuration(a.totals.seconds), note: 'estimated' },
    { label: 'Characters', value: a.cast.characters.length, note: 'with a cue' },
    { label: 'Mean tension', value: a.tension.mean, note: 'estimated, 1–10' },
    { label: 'Rhythm', value: a.pacing.rhythm || '—', note: 'median ' + a.pacing.medianPages + ' pages' }
  ], { label: 'The script at a glance', class: 'sa-stats' });
  const storyNote = a.story
    ? notice({ tone: 'info', icon: 'timeline', title: 'Your Story page has its own curve', body: 'The tension you scored on the beats of your synopsis is on Story → Beats & pacing, beside this read of the pages.', action: button({ label: 'Open', href: 'story.html#pacing', size: 'sm' }) })
    : null;
  return h('div.sa', {}, [head, stats, tensionPanel(a), pacingPanel(a), structurePanel(a), castPanel(a), coveragePanel(opts.getDoc), storyNote].filter(Boolean));
}

export default { renderAnalysis };
