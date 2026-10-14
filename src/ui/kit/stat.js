/* KIT · STAT CARD + STAT STRIP
   statCard({ label, value, unit, note, noteTone, hue, id })
     value     printed in JetBrains Mono, tabular figures
     noteTone  'ok' | 'warn' | 'danger' colours the note line
     hue       a hue class (e.g. 'hue-plan', 'hue-day') draws a top stripe
   statStrip(cards | specs) — a responsive row of them */
import { h, cx, kids, attrs } from './util.js';

export function statCard(o = {}) {
  const el = h('div', { class: cx('k-stat', o.hue, o.class) });
  if (o.id) el.id = o.id;
  const value = h('span.k-stat-value', { text: o.value == null || o.value === '' ? '—' : String(o.value) });
  if (o.unit) value.append(h('span.k-stat-unit', { text: o.unit }));
  kids(el, [
    h('span.k-stat-label', { text: o.label || '' }),
    value,
    o.note ? h('span', { class: cx('k-stat-note', o.noteTone && 'is-' + o.noteTone), text: o.note }) : null
  ]);
  return attrs(el, o.attrs);
}

export function statStrip(items, o = {}) {
  const el = h('div', { class: cx('k-stat-strip', o.class) });
  if (o.label) { el.setAttribute('role', 'group'); el.setAttribute('aria-label', o.label); }
  return kids(el, (items || []).map((x) => (x instanceof Node ? x : statCard(x))));
}
