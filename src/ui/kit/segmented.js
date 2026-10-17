/* KIT · SEGMENTED CONTROL
   segmented({ label, options, value, name, quiet, action })
     options  [{ value, label, icon? }]
     value    the selected option's value
     action   data-action on each button (default 'seg') — the page's
              delegate() reads data-value and calls selectSegment()
     quiet    the raised-surface variant instead of the accent fill
     sticky   stays under the pinned band while the view scrolls (a
              view switcher); full width below 720px
   selectSegment(root, value) — move the selection (aria-pressed)
   wireSegmented(root, onChange) — one delegated click listener on
     `root` for every [data-k-seg] inside it; calls onChange(value, seg)
     and dispatches a bubbling 'k-seg-change' event. */
import { h, sym, cx, kids, attrs } from './util.js';
import { delegate } from '../../lib/dom.js';

export function segmented(o = {}) {
  const el = h('div', { class: cx('k-seg', o.quiet && 'k-seg--quiet', o.sticky && 'k-seg--sticky', o.class), role: 'group' });
  el.dataset.kSeg = o.name || '';
  if (o.label) el.setAttribute('aria-label', o.label);
  for (const opt of o.options || []) {
    const b = h('button.k-seg-btn', { type: 'button', 'data-value': String(opt.value), 'aria-pressed': String(String(opt.value) === String(o.value)) });
    b.dataset.action = o.action || 'seg';
    kids(b, [sym(opt.icon), h('span', { text: opt.label })]);
    el.append(b);
  }
  return attrs(el, o.attrs);
}

export function selectSegment(seg, value) {
  if (!seg) return;
  seg.querySelectorAll('.k-seg-btn').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.value === String(value))));
}

export function wireSegmented(root, onChange) {
  delegate(root, 'click', '[data-k-seg] .k-seg-btn', (e, btn) => {
    const seg = btn.closest('[data-k-seg]');
    if (btn.getAttribute('aria-pressed') === 'true') return;
    selectSegment(seg, btn.dataset.value);
    if (onChange) onChange(btn.dataset.value, seg);
    seg.dispatchEvent(new CustomEvent('k-seg-change', { bubbles: true, detail: { value: btn.dataset.value, name: seg.dataset.kSeg } }));
  });
}
