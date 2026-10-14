/* ============================================================
   STORY PACING VIEW — story.html#pacing's curve, intensity and deck
   ------------------------------------------------------------
   Three views of src/lib/story-pacing.js, which derives them from the
   stored story, scenes and script and writes nothing. These builders
   are pure DOM too: no storage, no listener — every control carries a
   `data-st` the page's own delegate() already handles, or the one new
   action `pc-beat` (a curve dot → its card in the deck).

   THE CURVE IS SVG FOR THE LINES AND HTML FOR EVERYTHING YOU READ OR
   PRESS. The SVG stretches to the panel (preserveAspectRatio none,
   non-scaling strokes), which would squash any text inside it, so the
   beat dots, the act labels and the axis are positioned HTML on top:
   crisp at 390px, real <button>s for the keyboard, one tab stop per
   beat. The SVG itself is role="img" with a <title> and <desc>.
   ============================================================ */
import '../styles/story-pacing.css';
import { h } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import Pacing from '../lib/story-pacing.js';
import { panel, badge, meter, button } from './kit/index.js';

const NS = 'http://www.w3.org/2000/svg';
const pct = (x) => Math.round(x * 100) + '%';
const two = (n) => String(n).padStart(2, '0');
const svgEl = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
const clip = (s, n) => { s = String(s || '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));

/* ---- 1. the narrative tension curve --------------------------- */

export function renderCurve(s) {
  const fw = Story.frameworkById(s.framework);
  const pts = Pacing.tensionCurve(s, fw.id);
  const regions = Story.regionsOf(fw.id);
  const W = 1000, H = 240;
  const X = (at) => at * W;
  const Y = (t) => H - (t / 10) * H;

  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: 'none', class: 'pc-curve-svg', role: 'img', 'aria-labelledby': 'pcCurveT pcCurveD' });
  const t = svgEl('title', { id: 'pcCurveT' }); t.textContent = `Narrative tension across the ${fw.short} beats`;
  const peak = pts.reduce((a, b) => (b.tension > a.tension ? b : a), pts[0]);
  const low = pts.reduce((a, b) => (b.tension < a.tension ? b : a), pts[0]);
  const d = svgEl('desc', { id: 'pcCurveD' });
  d.textContent = `${pts.length} beats, tension 0 to 10. Peak ${peak.beat.label} at ${peak.tension}, lowest ${low.beat.label} at ${low.tension}. ` +
    `${pts.filter((p) => p.overridden).length} scored by hand, ${pts.filter((p) => p.placed === 'tagged').length} placed by a tagged passage.`;
  svg.append(t, d);
  // Grid: the slack line and the high line, recessive.
  for (const v of [5]) svg.append(svgEl('line', { x1: 0, x2: W, y1: Y(v), y2: Y(v), class: 'pc-grid' }));
  svg.append(svgEl('line', { x1: 0, x2: W, y1: Y(Story.PACING.lowTension), y2: Y(Story.PACING.lowTension), class: 'pc-grid pc-grid-low' }));
  for (const r of regions.slice(1)) svg.append(svgEl('line', { x1: X(r.from), x2: X(r.from), y1: 0, y2: H, class: 'pc-act-line' }));

  const conv = [...pts].sort((a, b) => a.conventionAt - b.conventionAt).map((p) => [X(p.conventionAt), Y(p.expected)]);
  const mine = pts.map((p) => [X(p.at), Y(p.tension)]);
  const line = Pacing.smoothPath(mine);
  if (mine.length) {
    const area = `${line} L${mine[mine.length - 1][0]},${H} L${mine[0][0]},${H} Z`;
    svg.append(svgEl('path', { d: area, class: 'pc-area' }));
  }
  svg.append(svgEl('path', { d: Pacing.smoothPath(conv), class: 'pc-conv' }));
  svg.append(svgEl('path', { d: line, class: 'pc-line' }));

  const plot = h('div.pc-plot');
  plot.append(svg);
  // Act labels along the top.
  const acts = h('div.pc-acts', { 'aria-hidden': 'true' });
  regions.forEach((r) => {
    const sp = h('span', { text: r.label });
    sp.style.left = pct(r.from); sp.style.width = pct(r.to - r.from);
    acts.append(sp);
  });
  plot.append(acts);
  // The beat milestones: one button each.
  const dots = h('div.pc-dots', { role: 'group', 'aria-label': 'Beats on the curve — press one to open its card' });
  pts.forEach((p) => {
    const cls = 'button.pc-dot' + (p.overridden ? '.is-set' : '') + (p.placed === 'tagged' ? '.is-tagged' : '') +
      (p.tension >= Pacing.HIGH_TENSION ? '.is-high' : p.tension <= Story.PACING.lowTension ? '.is-low' : '');
    const b = h(cls, {
      type: 'button', 'data-st': 'pc-beat', 'data-beat': p.beat.id,
      'aria-label': `Beat ${p.n}, ${p.beat.label}: tension ${p.tension} of 10` +
        (p.overridden ? ', scored by hand' : ', the convention') +
        (p.placed === 'tagged' ? `, tagged at ${pct(p.at)} of the story` : `, conventionally at ${pct(p.at)}`)
    }, [h('span.pc-dot-tip', { 'aria-hidden': 'true', text: `${two(p.n)} ${p.beat.label} · ${p.tension}` })]);
    b.style.left = (p.at * 100).toFixed(2) + '%';
    b.style.top = ((1 - p.tension / 10) * 100).toFixed(2) + '%';
    dots.append(b);
  });
  plot.append(dots);

  const axis = h('div.pc-axis', { 'aria-hidden': 'true' }, ['10', '5', '0'].map((v) => h('span', { text: v })));
  const wrap = h('div.pc-chart', {}, [axis, plot]);

  const legend = h('div.pc-legend', {}, [
    h('span.pc-key.pc-key-line', { text: 'This story' }),
    h('span.pc-key.pc-key-conv', { text: `${fw.short} convention` }),
    h('span.pc-key.pc-key-set', { text: 'Scored by hand' }),
    h('span.pc-key.pc-key-tag', { text: 'Placed by a tagged passage' })
  ]);
  const tagged = pts.filter((p) => p.placed === 'tagged').length;
  return panel({
    class: 'pc-curve', eyebrow: ['Narrative tension curve', fw.short],
    meta: `Beats 1 to ${pts.length} · ${tagged} tagged`,
    body: [wrap, legend,
      h('p.pc-note', { text: 'A beat sits where its tagged passages are, or where the convention puts it. Its height is the tension you scored on its card — the convention until you do.' })]
  });
}

/* ---- 2. scene intensity --------------------------------------- */

export function renderIntensity(s) {
  const d = Pacing.intensity(s);
  if (!d.slices.length) return null;
  const n = d.slices.length;
  const strip = h('div.pc-heat', { role: 'group', 'aria-label': `Intensity in ${n} slices of the synopsis — press one to read it` });
  d.slices.forEach((w) => {
    const c = h('button.pc-cell.is-' + w.level + (w.estimated ? '.is-est' : ''), {
      type: 'button', 'data-st': 'heat', 'data-from': String(w.from),
      title: `${pct(w.pos)} — tension ${w.tension.toFixed(1)}` + (w.beat ? ` (${w.beat.label})` : ' (estimated from the text)'),
      'aria-label': `${pct(w.pos)} of the story: tension ${w.tension.toFixed(1)}, ${w.level}` + (w.beat ? `, ${w.beat.label}` : ', estimated')
    });
    c.style.setProperty('--pc-i', (0.15 + (w.tension / 10) * 0.85).toFixed(2));
    strip.append(c);
  });
  const dist = h('div.pc-dist', { role: 'img', 'aria-label':
    `Share of the story: ${pct(d.share.low)} low, ${pct(d.share.mid)} medium, ${pct(d.share.high)} high intensity` });
  [['low', 'Low'], ['mid', 'Medium'], ['high', 'High']].forEach(([k]) => {
    if (!d.share[k]) return;
    const seg = h('span.pc-dist-seg.is-' + k);
    seg.style.flexGrow = String(d.share[k]);
    dist.append(seg);
  });
  const keys = h('ul.pc-dist-keys', {}, [
    ['low', 'Low', `≤ ${d.lowLine}`], ['mid', 'Medium', ''], ['high', 'High', `≥ ${d.highLine}`]
  ].map(([k, label, rule]) => h('li.is-' + k, {}, [
    h('span.pc-swatch', { 'aria-hidden': 'true' }),
    h('span', { text: label + (rule ? ` (${rule})` : '') }),
    h('b.k-num', { text: pct(d.share[k]) })
  ])));
  return panel({
    class: 'pc-intensity', eyebrow: ['Scene intensity', 'distribution'],
    meta: d.estimated ? `${d.estimated} of ${n} slices estimated` : `${n} slices, all tagged`,
    body: [strip, h('div.pc-heat-ends', { 'aria-hidden': 'true' }, [h('span', { text: 'Opening' }), h('span', { text: 'Final image' })]), dist, keys]
  });
}

/* ---- 3. the beat deck ----------------------------------------- */

function card(b, pages) {
  const art = h('article.pc-card' + (b.passage ? '' : '.is-empty'), { id: 'pc-beat-' + b.beat.id, tabindex: '-1', 'aria-labelledby': 'pcBt_' + b.beat.id });
  const target = b.pageTarget != null
    ? badge({ label: `p. ${b.pageTarget}`, tag: true, title: `Conventionally ${pct(b.conventionAt)} of ${Math.round(pages.total)} pages` })
    : badge({ label: `~${pct(b.conventionAt)}`, tag: true, title: 'Conventional position in the story; no page count yet' });
  const head = h('div.pc-card-head', {}, [
    h('span.pc-num.k-mono', { 'aria-hidden': 'true', text: two(b.n) }),
    h('h3.pc-card-title', { id: 'pcBt_' + b.beat.id }, [h('span.visually-hidden', { text: `Beat ${b.n}: ` }), b.beat.label]),
    h('div.pc-card-tags', {}, [badge({ label: b.region, tag: true, class: 'pc-act' }), target])
  ]);
  art.append(head);
  art.append(meter({
    label: b.overridden ? 'Tension · scored' : 'Tension · convention', value: b.tension, max: 10, show: 'ratio',
    tone: b.tension >= Pacing.HIGH_TENSION ? 'danger' : b.tension <= Story.PACING.lowTension ? 'warn' : null,
    class: 'pc-meter'
  }));
  if (b.passage) {
    art.append(h('blockquote.pc-passage' + (b.passage.inferred ? '.is-inferred' : ''), {}, [
      h('p.pc-passage-eb.k-mono', { text: b.passage.inferred ? 'Passage · placed by position' : 'Tagged passage' }),
      h('p', { text: '“' + clip(b.passage.text, 240) + '”' })
    ]));
  } else {
    art.append(h('p.pc-prompt', { text: b.beat.prompt }));
  }
  const foot = h('div.pc-card-foot');
  foot.append(h('span.pc-scene.k-mono', { text: b.scenes
    ? (b.sceneNumber ? `Scene ${b.sceneNumber}` : plural(b.scenes, 'scene')) + (b.opensOn != null ? ` · opens p. ${b.opensOn}` : '') + (b.scenes > 1 && b.sceneNumber ? ` · ${plural(b.scenes, 'scene')}` : '')
    : 'No scene serves this beat yet' }));
  const acts = h('div.pc-card-acts');
  if (b.passage) acts.append(button({ label: 'In synopsis', variant: 'ghost', size: 'sm', icon: 'description', attrs: { 'data-st': 'goto', 'data-from': String(b.passage.start) } }));
  if (b.href) acts.append(button({ label: 'Open in script', variant: 'secondary', size: 'sm', icon: 'edit_note', href: b.href }));
  foot.append(acts);
  art.append(foot);
  return art;
}

export function renderDeck(s, { scenes = [], elements = [] } = {}) {
  const deck = Pacing.beatDeck({ story: s, scenes, elements });
  const n = deck.beats.length;
  const tagged = deck.beats.filter((b) => b.passage && !b.passage.inferred).length;
  const served = deck.beats.filter((b) => b.scenes).length;
  const sec = h('section.pc-deck', { 'aria-labelledby': 'pcDeckH' });
  const head = h('div.pc-deck-head', {}, [
    h('h3.pc-deck-title#pcDeckH', { text: `The ${n} beats` }),
    h('span.pc-deck-meta.k-mono', { text: `${tagged} of ${n} tagged · ${served} with a scene` +
      (deck.pages.total ? ` · ${Math.round(deck.pages.total)} pages ${deck.pages.source === 'script' ? 'in the script' : 'in the scene list'}` : '') })
  ]);
  sec.append(head);
  const list = h('div.pc-cards');
  deck.beats.forEach((b) => list.append(card(b, deck.pages)));
  sec.append(list);
  return sec;
}

export default { renderCurve, renderIntensity, renderDeck };
