/* KIT · PANEL — a card with a compact header
   panel({ eyebrow, title, meta, actions, body, foot, flush, id, tag })
     eyebrow  the mono label in the header (STANDARD ACTION CONTROLS)
     title    an optional Space Grotesk title beside / instead of it
     meta     text or nodes at the header's right (4 SPEC VARIANTS)
     body     nodes; flush removes the body padding (a table inside)
     foot     nodes for a right-aligned footer bar
     collapsible  a native <details>: the head is its <summary>, so it
              opens by tap / Enter / Space with no script. open (default
              true) is the initial state; a closed body stays in the DOM.
              Its `actions` open the body instead of sitting in the
              head: a button inside a <summary> toggles the panel. */
import { h, cx, kids, attrs } from './util.js';
import { eyebrow as eb } from './page-header.js';

export function panel(o = {}) {
  const fold = !!o.collapsible;
  const el = h(fold ? 'details' : (o.tag || 'section'), { class: cx('k-panel', o.flush && 'k-panel--flush', fold && 'k-panel--collapsible', o.class) });
  if (o.id) el.id = o.id;
  if (fold && o.open !== false) el.open = true;
  if (fold || o.eyebrow || o.title || o.meta || o.actions) {
    const head = h(fold ? 'summary.k-panel-head' : 'div.k-panel-head');
    const titleId = o.title ? 'kp-' + Math.random().toString(36).slice(2, 8) : null;
    kids(head, [
      o.eyebrow ? eb(o.eyebrow) : null,
      o.title ? h('h3.k-panel-title', { id: titleId, text: o.title }) : null,
      o.meta || (o.actions && !fold) ? kids(h('div.k-panel-meta'), [].concat(o.meta || [], fold ? [] : (o.actions || []))) : null
    ]);
    if (titleId) el.setAttribute('aria-labelledby', titleId);
    el.append(head);
  }
  el.append(kids(h('div.k-panel-body'), [fold && o.actions ? kids(h('div.k-panel-tools'), o.actions) : null].concat(o.body == null ? [] : o.body)));
  if (o.foot) el.append(kids(h('div.k-panel-foot'), o.foot));
  return attrs(el, o.attrs);
}
