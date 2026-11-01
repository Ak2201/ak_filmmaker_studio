import { h } from '../../lib/dom.js';
import { cx } from './util.js';
import { GOOGLE_LABEL, googleMarkAttrs } from '../../lib/google-button.js';

/* kGoogleBtn — THE sign-in button (one way in). Builds on k-btn
   --secondary; the G is public/google-g.svg and is never recoloured.
   Below 720px a `.gbtn--mark` button shows only the G (kit.css); the
   label stays in the DOM for assistive tech. */
export function kGoogleBtn(o = {}) {
  const size = o.size || 'md';
  const el = h('button', {
    class: cx('k-btn', 'k-btn--secondary', 'gbtn', size !== 'md' && 'k-btn--' + size, o.block && 'k-btn--block', o.markOnPhone && 'gbtn--mark', o.class),
    type: 'button',
  });
  if (o.action !== false) el.dataset.authAction = o.action || 'google';
  el.append(h('img', { ...googleMarkAttrs }), h('span.gbtn-l', { text: o.label || GOOGLE_LABEL }));
  if (o.attrs) for (const [k, v] of Object.entries(o.attrs)) el.setAttribute(k, v);
  return el;
}
