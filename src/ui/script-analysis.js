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
     · the last kept AUDIENCE TEST, if there is one, drawn over the
       tension curve (below — docs/AUDIENCE-TEST-PLAN.md §7);
     · and behind the AI pill, "Notes on tension and arcs" (the Desk
       task 'tension-notes'), the coverage report and the audience
       test — a read, never a write, on the writer's own key and plan.

   Built only when the tab is opened, so the editor's first paint and
   verify's idle-write check see none of it. Charts are inline SVG for
   the lines and HTML for every word (crisp at 390px), coloured from
   tokens through the stylesheets — no colour is written here.
   ============================================================ */
import '../styles/story-pacing.css';
import '../styles/script-analysis.css';
import { h } from '../lib/dom.js';
import { beatBasisText } from '../lib/beat-basis.js';
import { analyseScript, pagesOf, readableName, sceneSpan } from '../lib/script-analysis-model.js';
import { smoothPath } from '../lib/story-pacing.js';
import { formatDuration } from '../lib/screenplay-analysis.js';
import { listScenes } from '../lib/scenes.js';
import { loadStory, frameworkById } from '../lib/story.js';
import { coverageStore, VERDICT_WORD, stamp } from '../lib/coverage-store.js';
import { audienceStore } from '../lib/audience-store.js';
import { SIMULATED_LINE, SCORE_MIN, SCORE_MAX } from '../lib/audience-model.js';
import { currentProject } from '../lib/store.js';
import { panel, statStrip, table, notice, button, emptyState } from './kit/index.js';
import { aiPill } from './ai-pill.js';

const NS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const pct = (x) => Math.round(x * 100) + '%';
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const title = readableName;

function format() {
  try { const p = currentProject(); return p && p.format === 'short' ? 'short' : 'feature'; } catch (e) { return 'feature'; }
}

/* ---- the audience test, over the curve ------------------------------
   docs/AUDIENCE-TEST-PLAN.md §7. The newest KEPT audience test (a Notes
   document in the script blob, src/lib/audience-store.js) is drawn on
   the tension chart: the panel's mean score per scene as a second line,
   each viewer as a thin line the writer can switch on, walkouts marked
   on the scene axis, and ONE focusable scrubber that reads out every
   viewer's moment at the scene under the pointer or the arrow keys —
   one tab stop rather than one per scene, because a feature has a
   hundred of them.

   DERIVED AT RENDER TIME, STORED NOWHERE. Which viewer lines are on is
   held in memory for this page only (VIEWERS_ON), never in storage: a
   toggled line is not worth a key in a contract that holds months of
   people's work — the command palette's recents follow the same rule.

   THE EARLIER-DRAFT STATE NEVER HIDES THE RUN. A test read one draft
   and the script moves on. When the stored `sig` is not this draft's
   scriptSignature, the chart says "from an earlier draft" and keeps
   drawing it. The signature lives in ai.js, which this view does not
   load with the tab: it is imported only when there is a test to
   label.

   SCENES ARE PLACED BY WHAT THE TEST READ, NEVER BY THIS DRAFT'S
   NUMBERS. The test numbers scenes by their place in the script
   (coverageScenes), while a.scenes carries the Scene List's numbers,
   and an unlocked script gives an inserted heading the next number
   above the highest — so "Sc 5" in the test and "Sc 5" here can be two
   different scenes with every number still present. A run keeps each
   scene's heading as it read it (`headings`, from runAudienceTest), and
   placement follows those: the same headings in the same count place
   scene i at this draft's scene i; otherwise each is matched to this
   draft by heading, in order; and if any cannot be, the run is laid
   out evenly. The read-out names a scene by the STORED heading, so an
   earlier draft's reactions are never paired with this draft's scene.
   When the headings differ the "earlier draft" label shows at once,
   without waiting for the signature.

   ITS SCALE IS ITS OWN (−2 to +2, the right-hand axis). The panel's
   score and the rules' 1–10 estimate are two different readings, and
   the chart does not pretend one is the other. Every surface carries
   the "simulated" line (plan §2).
   ------------------------------------------------------------------ */
const VIEWERS_ON = new Set();
const KIND_WORD = { hooked: 'Hooked', moved: 'Moved', lost: 'Lost', bored: 'Bored', walkout: 'Walked out' };
const signed = (v) => (v == null ? '—' : v > 0 ? '+' + v : v < 0 ? '−' + Math.abs(v) : '0');

/* How many dash patterns tell the viewer lines apart (script-analysis.css
   .sa-aud-viewer.is-s0 … is-s5, and the matching chip swatches). */
const STROKES = 6;
const normHead = (s) => String(s || '').trim().replace(/\s+/g, ' ').toUpperCase();

/**
 * Where each scene of a kept test sits in this draft.
 * Returns { place: [index into rows] | null (lay out evenly),
 *           same (this draft has the scenes the test read, in order),
 *           stored: [the heading the test read, or ''] }.
 */
function placeScenes(r, order, rows) {
  const byN = new Map((Array.isArray(r.headings) ? r.headings : [])
    .filter((x) => x && x.n != null).map((x) => [String(x.n), String(x.heading || '')]));
  const stored = byN.size ? order.map((n) => byN.get(n) || '') : [];
  if (!stored.length) {
    /* A run kept before headings were stored: only the same count can
       be placed, scene i at scene i, and the signature labels it. */
    const ok = order.length === rows.length && rows.length > 0;
    return { place: ok ? order.map((_, i) => i) : null, same: ok, stored };
  }
  if (order.length === rows.length && stored.every((hd, i) => normHead(hd) === normHead(rows[i].heading))) {
    return { place: order.map((_, i) => i), same: true, stored };
  }
  const place = [];
  let from = 0;
  for (const hd of stored) {
    const want = normHead(hd);
    let j = from;
    while (j < rows.length && (!want || normHead(rows[j].heading) !== want)) j++;
    if (j >= rows.length) return { place: null, same: false, stored };
    place.push(j);
    from = j + 1;
  }
  return { place, same: false, stored };
}

/** The newest kept audience test, or null. A document whose shape is
    not a finished run is not drawn (it is still in the Documents tab). */
function audienceRun(getDoc) {
  let d = null;
  try { d = audienceStore(typeof getDoc === 'function' ? getDoc : () => null, () => {}).latest(); } catch (e) { d = null; }
  const r = d && d.audience;
  if (!r || !Array.isArray(r.order) || !r.order.length || !Array.isArray(r.panel) || !r.panel.length
    || !Array.isArray(r.mean) || !r.curves || typeof r.curves !== 'object') return null;
  return { doc: d, r };
}

/** Straight segments through the scored scenes; a gap (null) breaks
    the line rather than drawing a score nobody gave. */
function brokenPath(xy) {
  let d = '';
  let run = [];
  const flush = () => {
    if (run.length === 1) d += `M${run[0][0].toFixed(1)},${run[0][1].toFixed(1)} l0.01,0 `;
    else if (run.length) d += run.map((p, k) => (k ? 'L' : 'M') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ') + ' ';
    run = [];
  };
  for (const p of xy) { if (p) run.push(p); else flush(); }
  flush();
  return d.trim();
}
function smoothBroken(xy) {
  const out = [];
  let run = [];
  const flush = () => { if (run.length === 1) out.push(brokenPath(run)); else if (run.length) out.push(smoothPath(run)); run = []; };
  for (const p of xy) { if (p) run.push(p); else flush(); }
  flush();
  return out.join(' ');
}

/**
 * Everything the audience test adds to the tension chart.
 * aud { doc, r } (audienceRun), a (analyseScript), geometry { W, H, X },
 * elements (the script in memory, for the earlier-draft check).
 * Returns { svg: [nodes], plot: [nodes], axis, legend: [nodes], block }.
 */
function audienceLayer(aud, a, { W, H, X }, elements) {
  const { doc, r } = aud;
  const panelOf = r.panel.filter((p) => p && p.id && Array.isArray(r.curves[p.id]));
  const order = r.order.map(String);
  const { place, same, stored } = placeScenes(r, order, a.scenes);
  const pos = order.map((n, i) => (place ? a.scenes[place[i]].pos : order.length > 1 ? i / (order.length - 1) : 0.5));
  const headingAt = (i) => stored[i] || (same && place ? a.scenes[place[i]].heading : '');
  const YA = (v) => H - ((v - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * H;
  const walks = r.walkouts && typeof r.walkouts === 'object' ? r.walkouts : {};
  const outIndex = (id) => (walks[id] ? order.indexOf(String(walks[id])) : -1);

  /* the lines */
  const g = svgEl('g', { class: 'sa-aud' });
  g.append(svgEl('line', { x1: 0, x2: W, y1: YA(0), y2: YA(0), class: 'sa-aud-zero' }));
  const viewerPaths = new Map();
  /* Each viewer's line has its own dash pattern (one of STROKES, by
     panel order), and its chip carries the same pattern as a swatch, so
     two lines switched on can be told apart without a second colour.
     Hovering or focusing a chip also brings that one line forward. */
  const strokeOf = (k) => 'is-s' + (k % STROKES);
  panelOf.forEach((p, k) => {
    const xy = r.curves[p.id].map((v, i) => (v == null ? null : [X(pos[i]), YA(v)]));
    const on = VIEWERS_ON.has(doc.id + ':' + p.id);
    const path = svgEl('path', { d: brokenPath(xy), class: 'sa-aud-viewer ' + strokeOf(k), 'data-viewer': p.id, visibility: on ? 'visible' : 'hidden' });
    viewerPaths.set(p.id, path);
    g.append(path);
  });
  g.append(svgEl('path', { d: smoothBroken(r.mean.map((v, i) => (v == null ? null : [X(pos[i]), YA(v)]))), class: 'sa-aud-mean' }));

  /* walkouts on the scene axis, one mark per scene however many left there */
  const walkAt = new Map();
  for (const p of panelOf) {
    const i = outIndex(p.id);
    if (i < 0) continue;
    if (!walkAt.has(i)) walkAt.set(i, []);
    walkAt.get(i).push(p.label);
  }
  const walkMarks = h('div.sa-walks', { 'aria-hidden': 'true' });
  for (const [i, who] of walkAt) {
    const m = h('span.sa-walk', { title: who.join(', ') + ' walked out at Sc ' + order[i] });
    m.style.left = (pos[i] * 100).toFixed(2) + '%';
    if (who.length > 1) m.append(h('span.sa-walk-n', { text: String(who.length) }));
    walkMarks.append(m);
  }

  /* the scrubber: one slider over the plot, pointer and arrow keys */
  const cursor = h('span.sa-aud-cursor', { 'aria-hidden': 'true', hidden: true });
  const scrub = h('div.sa-aud-scrub', {
    role: 'slider', tabindex: '0', 'aria-label': 'Audience test, scene by scene',
    'aria-valuemin': '1', 'aria-valuemax': String(order.length), 'aria-valuenow': '1',
    'aria-valuetext': 'Point at a scene, or use the arrow keys', 'aria-controls': 'saAudRead'
  });
  const read = h('div#saAudRead.sa-aud-read', { 'aria-live': 'polite' }, [
    h('p.sa-aud-hint', { text: 'Point at a scene on the chart, or focus it and use the arrow keys, to read what each viewer felt there.' })
  ]);
  let at = -1;
  const show = (i) => {
    i = Math.max(0, Math.min(order.length - 1, i));
    if (i === at) return;
    at = i;
    const n = order[i];
    const heading = headingAt(i);
    cursor.hidden = false;
    cursor.style.left = (pos[i] * 100).toFixed(2) + '%';
    const text = 'Scene ' + n + ', panel mean ' + signed(r.mean[i]);
    scrub.setAttribute('aria-valuenow', String(i + 1));
    scrub.setAttribute('aria-valuetext', text);
    const rows = panelOf.map((p) => {
      const v = r.curves[p.id][i];
      const oi = outIndex(p.id);
      const gone = oi >= 0 && i > oi;
      const m = (r.moments || []).find((x) => x && x.viewer === p.id && String(x.scene) === n);
      return h('li.sa-aud-row' + (gone ? '.is-gone' : ''), {}, [
        h('span.sa-aud-name', { text: p.label }),
        h('span.sa-aud-score' + (v > 0 ? '.is-up' : v < 0 ? '.is-down' : ''), { text: gone ? 'left' : signed(v) }),
        m ? h('span.sa-aud-moment', {}, [h('b', { text: (KIND_WORD[m.kind] || m.kind) + ': ' }), m.note || '', m.quote ? h('q', { text: m.quote }) : null])
          : h('span.sa-aud-moment.is-quiet', { text: gone ? 'Walked out at Sc ' + walks[p.id] : '' })
      ]);
    });
    read.replaceChildren(
      h('p.sa-aud-at', {}, [h('b', { text: 'Sc ' + n }), heading ? ' ' + title(heading) : '', h('span', { text: ' · panel mean ' + signed(r.mean[i]) })]),
      h('ul.sa-aud-rows', {}, rows)
    );
  };
  const nearest = (f) => {
    let best = 0;
    for (let i = 1; i < pos.length; i++) if (Math.abs(pos[i] - f) < Math.abs(pos[best] - f)) best = i;
    return best;
  };
  const fromPointer = (e) => {
    const box = scrub.getBoundingClientRect();
    if (box.width > 0) show(nearest((e.clientX - box.left) / box.width));
  };
  scrub.addEventListener('pointermove', fromPointer);
  scrub.addEventListener('pointerdown', fromPointer);
  scrub.addEventListener('focus', () => { if (at < 0) show(0); });
  scrub.addEventListener('keydown', (e) => {
    const step = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 5, PageDown: -5 }[e.key];
    if (step) { e.preventDefault(); show((at < 0 ? 0 : at) + step); }
    else if (e.key === 'Home') { e.preventDefault(); at = -1; show(0); }
    else if (e.key === 'End') { e.preventDefault(); show(order.length - 1); }
  });

  /* the right-hand scale */
  const axis = h('div.pc-axis.sa-aud-axis', { 'aria-hidden': 'true' }, ['+2', '0', '−2'].map((v) => h('span', { text: v })));

  /* the block under the chart: what it is, the toggles, the read-out */
  const draft = h('span.sa-aud-draft', { hidden: !(stored.length && !same), text: 'from an earlier draft' });
  if (r.sig && draft.hidden) {
    import('../lib/ai.js').then((m) => { if (m.scriptSignature(elements || []) !== r.sig) draft.hidden = false; }).catch(() => { /* unlabelled, still drawn */ });
  }
  const toggles = h('div.sa-aud-who', { role: 'group', 'aria-label': 'Show a viewer’s own line' }, panelOf.map((p, k) => {
    const box = h('input', { type: 'checkbox', 'data-viewer': p.id, checked: VIEWERS_ON.has(doc.id + ':' + p.id) ? true : null });
    box.addEventListener('change', () => {
      const k = doc.id + ':' + p.id;
      if (box.checked) VIEWERS_ON.add(k); else VIEWERS_ON.delete(k);
      const path = viewerPaths.get(p.id);
      if (path) path.setAttribute('visibility', box.checked ? 'visible' : 'hidden');
    });
    const out = walks[p.id];
    const chip = h('label.sa-aud-chip', {}, [box, h('span.sa-aud-swatch.' + strokeOf(k), { 'aria-hidden': 'true' }), h('span', { text: p.label + (out ? ' · out at Sc ' + out : '') })]);
    const hi = (on) => { const path = viewerPaths.get(p.id); if (path) path.classList.toggle('is-hi', on); };
    chip.addEventListener('pointerenter', () => hi(true));
    chip.addEventListener('pointerleave', () => hi(false));
    box.addEventListener('focus', () => hi(true));
    box.addEventListener('blur', () => hi(false));
    return chip;
  }));
  const outs = panelOf.filter((p) => walks[p.id]);
  const n = panelOf.length;
  const block = h('div.sa-aud-block', {}, [
    h('p.sa-aud-meta', {}, [
      h('b', { text: 'Audience test' }),
      h('span', { text: ' · ' + plural(n, 'simulated viewer') + ' · ' + stamp(r.at) + (r.model ? ' · ' + r.model : '') }),
      draft
    ]),
    h('p.pc-note', { text: SIMULATED_LINE + (r.agreed ? ' The panel barely disagreed, so treat this as one reader’s view rather than ' + n + '.' : '') }),
    toggles,
    outs.length
      ? h('p.sa-note', { text: 'Walked out: ' + outs.map((p) => p.label + ' at Sc ' + walks[p.id]).join(' · ') + '.' })
      : h('p.sa-note', { text: 'Nobody on the panel walked out.' }),
    read
  ]);

  return {
    svg: [g],
    plot: [walkMarks, cursor, scrub],
    axis,
    legend: [h('span.pc-key.sa-key-aud', { text: 'Simulated panel, mean (right scale, −2 to +2)' })],
    block,
    desc: ' The solid second line is a simulated audience test of ' + plural(n, 'viewer') + ', scored from −2 to +2.'
  };
}

/* ---- the audience test with no tension curve to sit on ------------
   Plan §6: a kept run is labelled, never hidden. When this draft cannot
   carry a tension curve (fewer than two scenes with words in them, or no
   headings at all), the run is drawn on its own chart — its scale on the
   right as always, the scenes placed the same way (placeScenes), which
   with nothing to match means evenly, with "from an earlier draft" on it. */
function audienceOnly(aud, a, elements) {
  const W = 1000, H = 240;
  const X = (pos) => pos * W;
  const layer = audienceLayer(aud, a, { W, H, X }, elements);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pc-curve-svg', role: 'img', 'aria-labelledby': 'saCurveT saCurveD' });
  const tt = svgEl('title', { id: 'saCurveT' }); tt.textContent = 'A kept audience test, scene by scene';
  const dd = svgEl('desc', { id: 'saCurveD' }); dd.textContent = layer.desc.trim();
  svg.append(tt, dd);
  for (const at of [0.25, 0.5, 0.75]) svg.append(svgEl('line', { x1: X(at), x2: X(at), y1: 0, y2: H, class: 'pc-act-line' }));
  svg.append(...layer.svg);
  const plot = h('div.pc-plot.sa-plot', {}, [svg, ...layer.plot]);
  return [
    h('div.pc-chart.sa-chart-aud-only', {}, [plot, layer.axis]),
    h('div.pc-legend', {}, layer.legend),
    layer.block
  ];
}

/* ---- the tension curve ------------------------------------------- */
function tensionPanel(a, aud, elements) {
  const t = a.tension;
  const pts = t.points.filter((p) => p.value != null);
  if (pts.length < 2) {
    return panel({ eyebrow: ['Tension', 'scene by scene'], body: [h('p.sa-none', { text: a.scenes.length
      ? 'Not enough written in the scenes to read a curve yet: a curve needs at least two scenes with action or dialogue.'
      : 'This draft has no scene headings, so there is no tension curve to read.' }),
    ...(aud ? audienceOnly(aud, a, elements) : [])] });
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
  const layer = aud ? audienceLayer(aud, a, { W, H, X }, elements) : null;
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pc-curve-svg', role: 'img', 'aria-labelledby': 'saCurveT saCurveD' });
  const tt = svgEl('title', { id: 'saCurveT' }); tt.textContent = 'Estimated tension in every scene of the script';
  const dd = svgEl('desc', { id: 'saCurveD' });
  dd.textContent = pts.length + ' scenes. Mean ' + t.mean + ', spread ' + t.spread + (t.peak ? '. Peak in scene ' + t.peak.number + ' at ' + t.peak.value : '') + '. The dashed line is the ' + frameworkById(a.framework).short + ' convention.' + (layer ? layer.desc : '');
  svg.append(tt, dd);
  if (t.lowLine > lo && t.lowLine < hi) svg.append(svgEl('line', { x1: 0, x2: W, y1: Y(t.lowLine), y2: Y(t.lowLine), class: 'pc-grid pc-grid-low' }));
  svg.append(svgEl('line', { x1: 0, x2: W, y1: Y((lo + hi) / 2), y2: Y((lo + hi) / 2), class: 'pc-grid' }));
  for (const at of [0.25, 0.5, 0.75]) svg.append(svgEl('line', { x1: X(at), x2: X(at), y1: 0, y2: H, class: 'pc-act-line' }));
  const smooth = t.points.filter((p) => p.smooth != null).map((p) => [X(p.pos), Y(p.smooth)]);
  const line = smoothPath(smooth);
  if (smooth.length) svg.append(svgEl('path', { d: `${line} L${smooth[smooth.length - 1][0]},${H} L${smooth[0][0]},${H} Z`, class: 'pc-area' }));
  svg.append(svgEl('path', { d: smoothPath(t.points.map((p) => [X(p.pos), Y(p.expected)])), class: 'pc-conv' }));
  svg.append(svgEl('path', { d: line, class: 'pc-line' }));
  if (layer) svg.append(...layer.svg);

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
  if (layer) plot.append(...layer.plot);
  const axis = h('div.pc-axis', { 'aria-hidden': 'true' }, [String(hi), String((lo + hi) / 2), String(lo)].map((v) => h('span', { text: v })));
  const legend = h('div.pc-legend', {}, [
    h('span.pc-key.pc-key-line', { text: 'This script (three-scene average)' }),
    h('span.pc-key.pc-key-conv', { text: frameworkById(a.framework).short + ' convention' }),
    h('span.pc-key.sa-key-dot', { text: 'A scene' }),
    ...(layer ? layer.legend : [])
  ]);
  const flags = t.flags.length
    ? h('ul.sa-flags', {}, t.flags.map((f) => h('li.sa-flag.is-' + f.level, { text: f.text })))
    : h('p.sa-note', { text: 'No long low stretch, and the tension builds the way the convention expects.' });
  return panel({
    eyebrow: ['Tension', 'scene by scene'],
    meta: 'Mean ' + t.mean + ' · spread ' + t.spread,
    body: [h('div.pc-chart' + (layer ? '.sa-chart-aud' : ''), {}, [axis, plot, layer ? layer.axis : null].filter(Boolean)), legend, layer ? layer.block : null, flags,
      h('p.pc-note', { text: 'An ESTIMATE read off the words of each scene — conflict, short sentences, exclamations — on a 1–10 scale, the same reading the Story page uses on a synopsis. For a reader’s judgement, use Notes on tension and arcs in the AI menu.' })].filter(Boolean)
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
    body: [t, h('p.pc-note.sa-basis', { text: beatBasisText(s.basis) }), h('p.pc-note', { text: 'Where each beat of ' + s.framework.label + ' conventionally falls, as a page of this script, and the scene that is on that page. Link scenes to beats on the Story page and it also says where each beat really opens.' })]
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
      h('span.sa-cast-n', { text: plural(p.scenes, 'scene') + ' · ' + sceneSpan(p.first, p.last) }),
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
  const a = analyseScript({ elements, scenes, story, format: format(), targetPages: typeof opts.getTargetPages === 'function' ? opts.getTargetPages() : 0 });
  const ai = aiPill({
    label: 'AI',
    tasks: [{ id: 'tension-notes', label: 'Notes on tension and arcs' }, { id: 'coverage', label: 'Coverage report' }, { id: 'scene-notes', label: 'Scene notes' }, { id: 'audience-test', label: 'Audience test' }],
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
    /* A kept audience test still shows (plan §6): it is labelled as from
       an earlier draft, never hidden because this one has no headings. */
    const aud = audienceRun(opts.getDoc);
    return h('div.sa', {}, [head, emptyState({ icon: 'assessment', title: 'No scenes to analyse yet', body: 'Write or import a screenplay with scene headings (INT. or EXT.) and the analysis reads it here.' }),
      aud ? tensionPanel(a, aud, elements) : null].filter(Boolean));
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
  return h('div.sa', {}, [head, stats, tensionPanel(a, audienceRun(opts.getDoc), elements), pacingPanel(a), structurePanel(a), castPanel(a), coveragePanel(opts.getDoc), storyNote].filter(Boolean));
}

export default { renderAnalysis };
