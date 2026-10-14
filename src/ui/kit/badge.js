/* KIT · BADGE
   badge({ label, tone, dot, icon, tag, solid, title })
     tone   'neutral' (default) | 'ok' | 'warn' | 'danger' | 'info'
     dot    a leading status dot in the badge's colour
     tag    rectangular — an IDENTIFIER (INT/EXT, a scene number), not a state
   todBadge(tod, { label, icon })   DAY / NIGHT / DUSK / DAWN
   intExtBadge(value)               INT / EXT / INT/EXT, rectangular
   doodCode(code, { title })        SW / W / H / WF / D / '' (the empty dot)
   Letters are always printed: colour is never the only signal. */
import { h, sym, cx, kids, attrs } from './util.js';

export function badge(o = {}) {
  const tone = o.tone && o.tone !== 'neutral' ? 'k-badge--' + o.tone : null;
  const el = h('span', { class: cx('k-badge', tone, o.tag && 'k-badge--tag', o.solid && 'k-badge--solid', o.class) });
  if (o.title) el.title = o.title;
  kids(el, [o.dot ? h('span.k-badge-dot', { 'aria-hidden': 'true' }) : null, sym(o.icon), o.label]);
  return attrs(el, o.attrs);
}

/* The four times of day the stripboard colours, normalised from what a
   scene record or a slug line carries. Anything else (CONTINUOUS,
   LATER) is not a time of day and gets no hue. */
const TOD = {
  day: 'day', morning: 'day', afternoon: 'day', noon: 'day',
  night: 'night', evening: 'dusk', dusk: 'dusk', sunset: 'dusk', 'golden hour': 'dusk', 'magic hour': 'dusk',
  dawn: 'dawn', sunrise: 'dawn'
};
const TOD_ICON = { day: 'light_mode', night: 'dark_mode', dusk: 'wb_twilight', dawn: 'wb_twilight' };
export function todKey(value) {
  return TOD[String(value || '').trim().toLowerCase()] || null;
}

export function todBadge(tod, o = {}) {
  const key = todKey(tod);
  const label = o.label || String(tod || '').toUpperCase();
  if (!key) return badge({ label, tag: true });
  const el = badge({ label, icon: o.icon === false ? null : (o.icon || TOD_ICON[key]), class: cx('k-badge--tod', 'hue-' + key) });
  return attrs(el, o.attrs);
}

export function intExtBadge(value) {
  const v = String(value || '').trim().toUpperCase().replace(/\.$/, '');
  return badge({ label: v || '—', tag: true });
}

const DOOD = { SW: 'sw', W: 'w', H: 'h', WF: 'wf', D: 'd', SWF: 'sw' };
const DOOD_TITLE = { SW: 'Start work', W: 'Work', H: 'Hold', WF: 'Work finish', D: 'Drop', SWF: 'Start / work / finish' };
export function doodCode(code, o = {}) {
  const c = String(code || '').trim().toUpperCase();
  const mod = DOOD[c] || 'empty';
  const el = h('span', { class: cx('k-dood', 'k-dood--' + mod, o.class), text: c || '·' });
  el.title = o.title || DOOD_TITLE[c] || 'Not called';
  if (!c) el.setAttribute('aria-label', 'not called');
  return attrs(el, o.attrs);
}
