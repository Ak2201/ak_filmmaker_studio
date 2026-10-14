/* KIT · STRIP — one stripboard row, and the banner between days
   strip({ tod, intExt, scene, slug, pages, cast, day, selected, action,
           menuAction, id, attrs })
     tod      DAY / NIGHT / DUSK / DAWN (or a slug's time) → the 3px
              telemetry stripe and the tag colour (.hue-day …)
     intExt   INT / EXT / INT/EXT → the tag reads 'D-EXT', 'N-INT' …
     scene    the scene number (SC 42A)
     pages    integer EIGHTHS (8 = one page), printed 1 3/8
     cast     a string (1, 4, 7 (SW)) or an array of ids
     day      a node or text for the day badge (DAY 4)
     action   data-action on the row (select / open); the row is a
              focusable group, not a button, so it can hold buttons
     menuAction  data-action of the trailing ⋮ button (omit for none)
   stripBanner({ label, icon }) — END OF SHOOT DAY 04 — 08H 15M
   stripList(strips) — the vertical rack. */
import { h, sym, cx, kids, attrs } from './util.js';
import { todKey } from './badge.js';
import { formatEighths } from '../../lib/sample-figures.js';

const TOD_LETTER = { day: 'D', night: 'N', dusk: 'DUSK', dawn: 'DAWN' };

export function strip(o = {}) {
  const key = todKey(o.tod);
  const el = h('div', { class: cx('k-strip', key && 'hue-' + key, o.selected && 'is-selected', o.class), role: 'group' });
  if (o.id) el.id = o.id;
  if (o.action) { el.dataset.action = o.action; el.tabIndex = 0; }
  const ie = String(o.intExt || '').trim().toUpperCase().replace(/\.$/, '');
  const letter = key ? TOD_LETTER[key] : '';
  const tagText = key === 'dusk' || key === 'dawn' ? letter : [letter, ie].filter(Boolean).join('-');
  const cast = Array.isArray(o.cast) ? o.cast.join(', ') : o.cast;
  el.setAttribute('aria-label', ['Scene ' + (o.scene || ''), ie, o.slug, o.tod].filter(Boolean).join(', '));
  kids(el, [
    h('span.k-strip-grip', { 'aria-hidden': 'true', text: '⠿' }),
    h('span.k-strip-tag', { text: tagText || '—' }),
    h('span.k-strip-sc', { text: o.scene ? 'SC ' + o.scene : '' }),
    h('span.k-strip-slug', { text: o.slug || '' }),
    kids(h('span.k-strip-meta'), [
      o.pages != null ? kids(h('span'), ['Pages: ', h('b', { text: formatEighths(o.pages) })]) : null,
      cast ? kids(h('span'), ['Cast: ', h('b', { text: String(cast) })]) : null
    ]),
    kids(h('span.k-strip-end'), [
      o.day ? (o.day instanceof Node ? o.day : h('span.k-badge.k-badge--tag', { text: String(o.day) })) : null,
      o.menuAction ? h('button.k-btn.k-btn--ghost.k-btn--sm.k-btn--icon', { type: 'button', 'data-action': o.menuAction, 'aria-label': 'Scene actions' }, [sym('more_vert')]) : null
    ])
  ]);
  return attrs(el, o.attrs);
}

export function stripBanner(o = {}) {
  const el = h('div.k-strip-banner', { role: 'separator' });
  el.setAttribute('aria-label', o.label || '');
  el.append(kids(h('span.k-strip-banner-pill'), [sym(o.icon || 'event'), h('span', { text: o.label || '' })]));
  return attrs(el, o.attrs);
}

export function stripList(items, o = {}) {
  const el = h('div', { class: cx('k-strip-list', o.class) });
  if (o.label) el.setAttribute('aria-label', o.label);
  return kids(el, items);
}
