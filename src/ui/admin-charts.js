/* ============================================================
   ADMIN CHARTS — hand-rolled inline SVG, no library
   ------------------------------------------------------------
   sparkline(values, opts)            a 14-point trend for a tile
   bar(items, opts)                   horizontal bars, one per label
   funnel(steps, opts)                stepped bars with drop-off %
   heatGrid({rows, cols, values}, o)  module x week intensity
   retention({cohorts, periods}, o)   cohort retention triangle

   COLOUR. Nothing here names a colour: strokes are currentColor and
   fills are CSS classes in admin.css that read tokens. A mark's meaning
   is carried by its position and its label, never by colour alone.

   AT: grid cells are role=img with the tooltip text as their name (focusable
   marks are never inside aria-hidden); bar and funnel lists are real text, so
   their table twin is aria-hidden rather than read twice.

   EVERY CHART HAS A TEXT TWIN. Each returns a <figure> holding the SVG
   (aria-hidden: it is a picture of the table) and a visually hidden
   <table> with the same numbers, so a screen reader gets the data and
   not a description of shapes.

   TOOLTIPS ON FOCUS AS WELL AS HOVER. A mark carries data-tip; one
   shared tooltip element, positioned from the mark's own rectangle,
   follows pointer-enter and focus. Marks in a grid are a roving
   tabindex (one Tab stop, arrows move) so a heat grid is not 300 stops.

   MOTION. None: the charts are drawn, not animated.
   ============================================================ */
import { h } from '../lib/dom.js';

const NS = 'http://www.w3.org/2000/svg';
function svg(tag, attrs = {}, kids = []) {
  const el = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) el.setAttribute(k, String(v));
  for (const c of [].concat(kids)) if (c) el.append(c);
  return el;
}
const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const fmt = (v) => (Number.isInteger(v) ? v.toLocaleString() : (Math.round(v * 10) / 10).toLocaleString());

/** The visually hidden table every chart carries. */
function twin(caption, head, rows, hidden) {
  return h('table.visually-hidden', { 'aria-hidden': hidden ? 'true' : null }, [
    h('caption', { text: caption }),
    h('thead', {}, [h('tr', {}, head.map((t) => h('th', { scope: 'col', text: t })))]),
    h('tbody', {}, rows.map((r) => h('tr', {}, r.map((c, i) => h(i === 0 ? 'th' : 'td', { scope: i === 0 ? 'row' : null, text: String(c) }))))
    )
  ]);
}
function figure(cls, label, graphic, table, extra) {
  return h('figure.adc.' + cls, { role: 'group', 'aria-label': label }, [graphic, table, extra]);
}

/* ---- sparkline ---------------------------------------------------- */

export function sparkline(values = [], { label = 'Trend', width = 120, height = 32, labels, unit = '' } = {}) {
  const v = values.map(num);
  const W = width, H = height, pad = 3;
  if (v.length < 2) {
    return figure('adc-spark', label, svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, [svg('line', { x1: pad, x2: W - pad, y1: H / 2, y2: H / 2, class: 'adc-base' })]),
      twin(label, ['Point', 'Value'], v.map((x, i) => [labels ? labels[i] : i + 1, x])));
  }
  const lo = Math.min(...v), hi = Math.max(...v), span = hi - lo || 1;
  const x = (i) => pad + (i * (W - pad * 2)) / (v.length - 1);
  const y = (n) => H - pad - ((n - lo) / span) * (H - pad * 2);
  const pts = v.map((n, i) => [x(i), y(n)]);
  const d = pts.map(([px, py], i) => (i ? 'L' : 'M') + px.toFixed(1) + ' ' + py.toFixed(1)).join(' ');
  const area = d + ` L${x(v.length - 1).toFixed(1)} ${H - pad} L${x(0).toFixed(1)} ${H - pad} Z`;
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true', preserveAspectRatio: 'none' }, [
    svg('path', { d: area, class: 'adc-area' }),
    svg('path', { d, class: 'adc-line', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'vector-effect': 'non-scaling-stroke' }),
    svg('circle', { cx: pts[pts.length - 1][0], cy: pts[pts.length - 1][1], r: 2.5, class: 'adc-dot' }),
    /* one invisible hit column per point, so hover finds the nearest day */
    ...v.map((n, i) => svg('rect', {
      x: (x(i) - (W - pad * 2) / (v.length - 1) / 2).toFixed(1), y: 0, width: ((W - pad * 2) / (v.length - 1)).toFixed(1), height: H,
      class: 'adc-hit', 'data-tip': `${labels ? labels[i] + ': ' : ''}${fmt(n)}${unit}`
    }))
  ]);
  const fig = figure('adc-spark', label, g, twin(label, ['Point', 'Value'], v.map((n, i) => [labels ? labels[i] : i + 1, n])));
  /* The picture is not in the tab order (it is aria-hidden), so the
     figure itself takes focus and tips its latest value. */
  fig.setAttribute('tabindex', '0');
  fig.dataset.tipFocus = `${label}: latest ${fmt(v[v.length - 1])}${unit} (low ${fmt(lo)}, high ${fmt(hi)})`;
  return fig;
}

/* ---- bar ---------------------------------------------------------- */

/** items: [{label, value, note}] */
export function bar(items = [], { label = 'Bars', unit = '', max, format = fmt } = {}) {
  const hiV = max || Math.max(1, ...items.map((i) => num(i.value)));
  const rows = items.map((it) => {
    const pct = Math.max(0, Math.min(100, (num(it.value) / hiV) * 100));
    const fill = h('span.adc-bar-fill');
    fill.style.width = pct + '%';
    return h('li.adc-bar-r', { tabindex: '0', 'data-tip': `${it.label}: ${format(num(it.value))}${unit}${it.note ? ' · ' + it.note : ''}` }, [
      h('span.adc-bar-l', { text: it.label, title: it.label }),
      h('span.adc-bar-t', { 'aria-hidden': 'true' }, [fill]),
      h('span.adc-bar-v', { text: format(num(it.value)) + unit })
    ]);
  });
  const list = h('ol.adc-bars', {}, rows);
  return figure('adc-barwrap', label, list, twin(label, ['Label', 'Value'], items.map((i) => [i.label, format(num(i.value)) + unit]), true));
}

/* ---- stepped funnel ----------------------------------------------- */

/** steps: [{label, value}] in order. Each bar is a share of the first;
 *  between steps, the drop-off from the one before. */
export function funnel(steps = [], { label = 'Funnel' } = {}) {
  const top = Math.max(1, num(steps[0] && steps[0].value));
  const rows = steps.map((s, i) => {
    const val = num(s.value);
    const prev = i ? num(steps[i - 1].value) : val;
    const keep = prev ? Math.round((val / prev) * 100) : 0;
    const drop = i ? 100 - keep : 0;
    const fill = h('span.adc-fn-fill');
    fill.style.width = Math.max(1, (val / top) * 100) + '%';
    return h('li.adc-fn-r', { tabindex: '0', 'data-tip': `${s.label}: ${fmt(val)}${i ? ` · ${keep}% of ${steps[i - 1].label}, ${drop}% dropped` : ''}` }, [
      h('span.adc-fn-l', { text: s.label }),
      h('span.adc-fn-t', { 'aria-hidden': 'true' }, [fill]),
      h('span.adc-fn-v', { text: fmt(val) }),
      h('span.adc-fn-d', { text: i ? `−${drop}%` : '' })
    ]);
  });
  return figure('adc-funnel', label, h('ol.adc-fn', {}, rows),
    twin(label, ['Step', 'Count', 'Share of previous step'], steps.map((s, i) => [s.label, num(s.value), i ? Math.round((num(s.value) / (num(steps[i - 1].value) || 1)) * 100) + '%' : '100%']), true));
}

/* ---- heat grid and retention triangle (roving tabindex) ----------- */

function grid({ rowLabels, colLabels, cell, cls, label, caption, cellW = 26, cellH = 22, labelW = 120, head = 22, text }) {
  const W = labelW + colLabels.length * cellW, H = head + rowLabels.length * cellH;
  const g = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'adc-grid', role: 'presentation' });
  colLabels.forEach((c, j) => g.append(svg('text', { x: labelW + j * cellW + cellW / 2, y: head - 8, class: 'adc-axis', 'text-anchor': 'middle' }, [document.createTextNode(String(c))])));
  rowLabels.forEach((r, i) => {
    g.append(svg('text', { x: labelW - 8, y: head + i * cellH + cellH / 2 + 4, class: 'adc-axis', 'text-anchor': 'end' }, [document.createTextNode(String(r).length > 18 ? String(r).slice(0, 17) + '…' : String(r))]));
    colLabels.forEach((c, j) => {
      const m = cell(i, j);
      if (!m) return;
      const rect = svg('rect', {
        x: labelW + j * cellW + 1, y: head + i * cellH + 1, width: cellW - 2, height: cellH - 2, rx: 3,
        class: cls, 'fill-opacity': Math.max(0.06, Math.min(0.55, m.level)).toFixed(2),
        tabindex: i === 0 && j === 0 ? '0' : '-1', role: 'img', 'aria-label': m.tip, 'data-tip': m.tip, 'data-r': i, 'data-c': j
      });
      g.append(rect);
      if (text && m.text != null) g.append(svg('text', { x: labelW + j * cellW + cellW / 2, y: head + i * cellH + cellH / 2 + 4, class: 'adc-cell-t', 'text-anchor': 'middle', 'pointer-events': 'none' }, [document.createTextNode(String(m.text))]));
    });
  });
  const wrap = h('div.adc-scroll', { role: 'application', 'aria-label': label + '. Arrow keys move between cells.' }, [g]);
  return wrap;
}

/** values[r][c] — raw counts. Intensity is each cell against the grid's maximum. */
export function heatGrid({ rows = [], cols = [], values = [] } = {}, { label = 'Heat grid', unit = '' } = {}) {
  const hi = Math.max(1, ...values.flat().map(num));
  const wrap = grid({
    rowLabels: rows, colLabels: cols, cls: 'adc-cell', label,
    cell: (i, j) => { const n = num(values[i] && values[i][j]); return { level: n / hi * 0.55, tip: `${rows[i]} · ${cols[j]}: ${fmt(n)}${unit}` }; }
  });
  return figure('adc-heat', label, wrap, twin(label, ['', ...cols.map(String)], rows.map((r, i) => [r, ...cols.map((c, j) => num(values[i] && values[i][j]))])));
}

/** cohorts: [{label, size, values:[% retained per period, period 0 first]}] — a triangle:
 *  later cohorts have fewer periods, and the missing ones are simply not drawn. */
export function retention({ cohorts = [], periods } = {}, { label = 'Retention' } = {}) {
  const P = periods || Math.max(1, ...cohorts.map((c) => (c.values || []).length));
  const cols = Array.from({ length: P }, (_, j) => 'W' + j);
  const wrap = grid({
    rowLabels: cohorts.map((c) => c.label), colLabels: cols, cls: 'adc-cell', label, cellW: 38, labelW: 130, text: true,
    cell: (i, j) => {
      const v = cohorts[i].values && cohorts[i].values[j];
      if (v == null) return null;
      return { level: num(v) / 100 * 0.55, text: Math.round(num(v)), tip: `${cohorts[i].label} · week ${j}: ${fmt(num(v))}%${cohorts[i].size ? ` of ${fmt(cohorts[i].size)}` : ''}` };
    }
  });
  return figure('adc-retention', label, wrap, twin(label, ['Cohort', 'Size', ...cols], cohorts.map((c) => [c.label, c.size == null ? '' : c.size, ...cols.map((_, j) => (c.values && c.values[j] != null ? Math.round(num(c.values[j])) + '%' : ''))])));
}

/* ---- the one tooltip, and roving arrows --------------------------- */

let tip = null;
function tipEl() {
  if (!tip) { tip = h('div.adc-tip', { role: 'tooltip', hidden: '' }); document.body.append(tip); }
  return tip;
}
function showTip(target, text) {
  if (!text) return;
  const t = tipEl();
  t.textContent = text;
  t.hidden = false;
  const r = target.getBoundingClientRect();
  const tw = t.offsetWidth, th = t.offsetHeight;
  let left = r.left + r.width / 2 - tw / 2;
  left = Math.max(8, Math.min(left, window.innerWidth - tw - 8));
  let top = r.top - th - 8;
  if (top < 8) top = r.bottom + 8;
  t.style.left = left + 'px';
  t.style.top = top + 'px';
}
const hideTip = () => { if (tip) tip.hidden = true; };
const tipText = (el) => el.dataset.tip || el.dataset.tipFocus || '';

if (typeof document !== 'undefined') {
  document.addEventListener('pointerover', (e) => {
    const el = e.target.closest && e.target.closest('[data-tip]');
    if (el && el.closest('.adc')) showTip(el, el.dataset.tip); else hideTip();
  });
  document.addEventListener('pointerleave', hideTip, true);
  document.addEventListener('focusin', (e) => {
    const el = e.target.closest && e.target.closest('.adc [data-tip], .adc[data-tip-focus]');
    if (el) showTip(el, tipText(el)); else hideTip();
  });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideTip();
    const cell = e.target && e.target.matches && e.target.matches('.adc-grid [data-r]') ? e.target : null;
    if (!cell) return;
    const dr = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : 0;
    const dc = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!dr && !dc) return;
    e.preventDefault();
    const svgEl = cell.closest('svg');
    const next = svgEl.querySelector(`[data-r="${+cell.dataset.r + dr}"][data-c="${+cell.dataset.c + dc}"]`);
    if (!next) return;
    cell.setAttribute('tabindex', '-1');
    next.setAttribute('tabindex', '0');
    next.focus();
  });
}

export default { sparkline, bar, funnel, heatGrid, retention };
