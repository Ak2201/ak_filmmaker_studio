/* KIT · PANEL — a card with a compact header
   panel({ eyebrow, title, meta, actions, body, foot, flush, id, tag })
     eyebrow  the mono label in the header (STANDARD ACTION CONTROLS)
     title    an optional Space Grotesk title beside / instead of it
     meta     text or nodes at the header's right (4 SPEC VARIANTS)
     body     nodes; flush removes the body padding (a table inside)
     foot     nodes for a right-aligned footer bar */
import { h, cx, kids, attrs } from './util.js';
import { eyebrow as eb } from './page-header.js';

export function panel(o = {}) {
  const el = h(o.tag || 'section', { class: cx('k-panel', o.flush && 'k-panel--flush', o.class) });
  if (o.id) el.id = o.id;
  if (o.eyebrow || o.title || o.meta || o.actions) {
    const head = h('div.k-panel-head');
    const titleId = o.title ? 'kp-' + Math.random().toString(36).slice(2, 8) : null;
    kids(head, [
      o.eyebrow ? eb(o.eyebrow) : null,
      o.title ? h('h3.k-panel-title', { id: titleId, text: o.title }) : null,
      o.meta || o.actions ? kids(h('div.k-panel-meta'), [].concat(o.meta || [], o.actions || [])) : null
    ]);
    if (titleId) el.setAttribute('aria-labelledby', titleId);
    el.append(head);
  }
  el.append(kids(h('div.k-panel-body'), o.body));
  if (o.foot) el.append(kids(h('div.k-panel-foot'), o.foot));
  return attrs(el, o.attrs);
}
