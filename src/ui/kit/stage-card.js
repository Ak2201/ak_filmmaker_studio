/* KIT · STAGE CARD — one of the five stages on a dashboard
   stageCard({ num, phase, title, body, status, progress, next, href,
               current, id })
     phase     story | screenplay | preprod | production | post → the
               .sh-ph-* hue class (top stripe, number, next-link colour)
     status    { label, tone } → a kit badge
     progress  { value, max, label } → a kit meter in the stage's hue
     next      the "suggested next" line (advice, never forced)
     href      the card becomes a link to the stage
     stacked   one row per stage (number square · title · status, then the
               meter): the mobile dashboard's lifecycle list, any width
   The card derives nothing: the caller passes what journey.js computed. */
import { h, sym, cx, kids, attrs } from './util.js';
import { badge } from './badge.js';
import { meter } from './meter.js';

const PHASES = ['story', 'screenplay', 'preprod', 'production', 'post'];

export function stageCard(o = {}) {
  const ph = PHASES.includes(o.phase) ? 'sh-ph-' + o.phase : null;
  const el = h(o.href ? 'a' : 'article', { class: cx('k-stage', ph, o.current && 'is-current', o.stacked && 'k-stage--stacked', o.class) });
  if (o.href) el.setAttribute('href', o.href);
  if (o.id) el.id = o.id;
  if (o.current) el.setAttribute('aria-current', 'step');
  const num = o.num != null ? String(o.num).padStart(2, '0') : null;
  kids(el, [
    kids(h('div.k-stage-top'), [
      num ? h('span.k-stage-num', { text: num }) : null,
      o.status ? badge({ label: o.status.label, tone: o.status.tone, dot: true }) : null
    ]),
    h('h3.k-stage-title', { text: o.title || '' }),
    o.body ? h('p.k-stage-body', { text: o.body }) : null,
    o.progress ? meter({ label: o.progress.label || 'Progress', value: o.progress.value, max: o.progress.max, hue: ph || undefined, show: o.progress.show }) : null,
    o.next ? kids(h('span.k-stage-next'), [h('span', { text: o.next }), sym('arrow_forward')]) : null
  ]);
  return attrs(el, o.attrs);
}
