/* KIT · EMPTY STATE
   emptyState({ icon, title, body, actions })
   The place a list says it has nothing yet AND what to do about it —
   never just "No data". */
import { h, sym, cx, kids, attrs } from './util.js';

export function emptyState(o = {}) {
  const el = h('div', { class: cx('k-empty', o.class) });
  kids(el, [
    sym(o.icon || 'inbox', 'k-empty-icon'),
    o.title ? h('p.k-empty-title', { text: o.title }) : null,
    o.body ? h('p.k-empty-body', { text: o.body }) : null,
    o.actions && [].concat(o.actions).some(Boolean) ? kids(h('div.k-empty-actions'), o.actions) : null
  ]);
  return attrs(el, o.attrs);
}
