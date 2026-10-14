/* KIT · PAGE HEADER — mono eyebrow, Space Grotesk title, actions
   pageHeader({ eyebrow, title, sub, actions, meta, level, id })
     eyebrow  a string, or an array of crumbs joined with " / "
     actions  nodes (usually kit buttons) on the right
     meta     nodes (usually badges) under the title
     level    heading level, 1 by default
   projectTitle(text) — the project's own name in the editorial serif
   italic: the one heading that may use it. */
import { h, cx, kids, attrs } from './util.js';

export function eyebrow(parts, o = {}) {
  const list = [].concat(parts == null ? [] : parts).filter((x) => x !== null && x !== undefined && x !== '');
  const el = h('p', { class: cx('k-eyebrow', o.class) });
  list.forEach((p, i) => {
    if (i) el.append(h('span.k-eyebrow-sep', { text: '/', 'aria-hidden': 'true' }));
    el.append(p instanceof Node ? p : h(i ? 'span.k-eyebrow-muted' : 'span', { text: String(p) }));
  });
  return el;
}

export function pageHeader(o = {}) {
  const el = h('header', { class: cx('k-page-head', o.class) });
  if (o.id) el.id = o.id;
  const main = h('div.k-page-head-main');
  const tag = 'h' + Math.min(6, Math.max(1, Number(o.level) || 1));
  kids(main, [
    o.eyebrow ? eyebrow(o.eyebrow) : null,
    o.title != null ? h(tag + '.k-page-title', { text: String(o.title) }) : null,
    o.sub ? h('p.k-page-sub', { text: o.sub }) : null,
    o.meta && o.meta.length ? kids(h('div.k-page-meta'), o.meta) : null
  ]);
  el.append(main);
  if (o.actions && [].concat(o.actions).some(Boolean)) el.append(kids(h('div.k-page-actions'), o.actions));
  return attrs(el, o.attrs);
}

export function projectTitle(text, o = {}) {
  return attrs(h((o.tag || 'h2') + '.k-project-title', { text: String(text || '') }), o.attrs);
}
