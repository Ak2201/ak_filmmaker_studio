/* KIT · BUTTON
   button({ label, variant, size, icon, iconOnly, pill, block, action,
            href, type, disabled, title, attrs })
     variant  'primary' | 'secondary' (default) | 'ghost' | 'danger'
     size     'sm' (28px) | 'md' (32px, default) | 'lg' (36px)
     iconOnly true: a square icon button; `label` becomes aria-label
     pill     true: the ONE primary CTA of a view (pills are not for rows)
     action   sets data-action (the page's delegate() does the work)
     href     renders an <a> instead of a <button>
   buttonGroup(buttons) — the compact icon-button tray. */
import { h, sym, cx, kids, attrs } from './util.js';

export function button(o = {}) {
  const variant = o.variant || 'secondary';
  const size = o.size || 'md';
  const cls = cx('k-btn', 'k-btn--' + variant, size !== 'md' && 'k-btn--' + size,
    o.iconOnly && 'k-btn--icon', o.pill && 'k-btn--pill', o.block && 'k-btn--block', o.class);
  const el = o.href
    ? h('a', { class: cls, href: o.href })
    : h('button', { class: cls, type: o.type || 'button' });
  if (o.action) el.dataset.action = o.action;
  if (o.disabled) {
    if (o.href) el.setAttribute('aria-disabled', 'true');
    else el.disabled = true;
  }
  if (o.title) el.title = o.title;
  if (o.iconOnly) {
    el.setAttribute('aria-label', o.label || o.title || o.icon || '');
    kids(el, sym(o.icon));
  } else {
    kids(el, [sym(o.icon), o.label ? h('span', { text: o.label }) : null, sym(o.iconAfter)]);
  }
  return attrs(el, o.attrs);
}

export function buttonGroup(buttons, o = {}) {
  const el = h('div.k-btn-group', { role: 'group' });
  if (o.label) el.setAttribute('aria-label', o.label);
  return kids(el, buttons);
}
