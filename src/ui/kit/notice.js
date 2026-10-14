/* KIT · NOTICE / BANNER
   notice({ tone, title, body, icon, action, banner, live })
     tone    'info' (default) | 'warn' | 'danger' | 'ok'
     title   the mono caps line (SAFETY VERIFICATION NOTE:)
     body    text or nodes
     action  a node (usually a kit button) on the right
     banner  full-bleed, no side radius
     live    true: role=status (or role=alert for danger) — for a notice
             that appears in response to something, not one in the markup */
import { h, sym, cx, kids, attrs } from './util.js';

const ICON = { info: 'info', warn: 'warning', danger: 'error', ok: 'check_circle' };

export function notice(o = {}) {
  const tone = ['warn', 'danger', 'ok'].includes(o.tone) ? o.tone : 'info';
  const el = h('div', { class: cx('k-notice', tone !== 'info' && 'k-notice--' + tone, o.banner && 'k-notice--banner', o.class) });
  if (o.live) el.setAttribute('role', tone === 'danger' ? 'alert' : 'status');
  const body = o.body == null ? null : (o.body instanceof Node ? kids(h('div.k-notice-body'), o.body) : h('p.k-notice-body', { text: String(o.body) }));
  kids(el, [
    o.icon === false ? h('span') : sym(o.icon || ICON[tone], 'k-notice-icon'),
    o.title ? h('p.k-notice-title', { text: o.title }) : null,
    body,
    o.action ? kids(h('div.k-notice-act'), o.action) : null
  ]);
  return attrs(el, o.attrs);
}
