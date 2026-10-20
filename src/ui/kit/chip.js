/* KIT · CHIP — one breakdown element, coloured by its category
   chip({ label, category, count, showCategory, removable, action, value })
     category   cast | props | vehicles | sound | stunts | vfx | animals |
                sfx | dressing | extras | wardrobe | makeup | special
                → the .hue-el-* class in tokens.css
     removable  adds a × button with data-action=`action` and
                data-value=`value` (the page's delegate() removes it)
   The category NAME can be printed (showCategory) because identity is
   never colour alone; when it is not, it is the chip's title. */
import { h, cx, kids, attrs } from './util.js';

export const CATEGORIES = ['cast', 'props', 'vehicles', 'sound', 'stunts', 'vfx', 'animals', 'sfx', 'dressing', 'extras', 'wardrobe', 'makeup', 'special'];

export function chip(o = {}) {
  const cat = CATEGORIES.includes(o.category) ? o.category : null;
  const el = h('span', { class: cx('k-chip', cat && 'hue-el-' + cat, o.class) });
  if (cat && !o.showCategory) el.title = cat;
  kids(el, [
    h('span.k-chip-dot', { 'aria-hidden': 'true' }),
    o.showCategory && cat ? h('span.k-chip-cat', { text: cat }) : null,
    h('span.k-chip-label', { text: o.label || '' }),
    o.count != null ? h('span.k-chip-count', { text: String(o.count) }) : null,
    o.removable ? h('button.k-chip-x', {
      type: 'button', 'aria-label': 'Remove ' + (o.label || ''), text: '×',
      'data-action': o.action || 'chip-remove', 'data-value': o.value != null ? String(o.value) : (o.label || '')
    }) : null
  ]);
  return attrs(el, o.attrs);
}
