/* KIT · METER / PROGRESS
   meter({ label, value, max, tone, hue, show, size })
     tone   'ok' | 'warn' | 'danger' (default: the violet accent)
     hue    a hue class ('hue-plan', 'sh-ph-story' …) — the fill takes --hue
     show   the right-hand readout: 'pct' (default) | 'ratio' | false
   setMeter(el, value, max) — update in place (no rebuild). */
import { h, cx, kids, attrs } from './util.js';

const pct = (v, m) => {
  const max = Number(m) > 0 ? Number(m) : 100;
  return Math.max(0, Math.min(100, (Number(v) || 0) / max * 100));
};

export function meter(o = {}) {
  const el = h('div', { class: cx('k-meter', o.tone && 'k-meter--' + o.tone, o.hue && 'k-meter--hue', o.hue, o.size === 'lg' && 'k-meter--lg', o.class) });
  const track = h('div.k-meter-track', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(Number(o.max) > 0 ? o.max : 100) });
  if (o.label) track.setAttribute('aria-label', o.label);
  track.append(h('div.k-meter-fill'));
  if (o.label || o.show !== false) {
    el.append(kids(h('div.k-meter-row'), [h('span', { text: o.label || '' }), o.show === false ? null : h('b.k-meter-read')]));
  }
  el.append(track);
  el.dataset.show = o.show === false ? '' : (o.show || 'pct');
  setMeter(el, o.value, o.max);
  return attrs(el, o.attrs);
}

export function setMeter(el, value, max) {
  if (!el) return;
  const p = pct(value, max);
  el.style.setProperty('--k-pct', p.toFixed(1) + '%');
  const track = el.querySelector('.k-meter-track');
  if (track) {
    track.setAttribute('aria-valuenow', String(Number(value) || 0));
    if (Number(max) > 0) track.setAttribute('aria-valuemax', String(max));
  }
  const read = el.querySelector('.k-meter-read');
  if (read) read.textContent = el.dataset.show === 'ratio' ? (Number(value) || 0) + ' / ' + (Number(max) || 100) : Math.round(p) + '%';
}
