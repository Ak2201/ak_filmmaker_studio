/* ============================================================
   JOURNEY STRIP — the five stages, where you are, one next move
   ------------------------------------------------------------
   A view of src/lib/journey.js and nothing else. It reads, it never
   writes — the hub and the dashboard both render it on load, and a
   strip that remembered being looked at would trip verify's
   idle-write check, correctly.

   LIST SEMANTICS. The stages are an ordered list because their order
   is the film's order; the current one carries aria-current="step",
   which is the ARIA value for "this is where you are in a process".
   Each meter is role="img" with its whole sentence as the label,
   because a bar with no text is invisible to a screen reader and two
   numbers with no unit are meaningless to everybody.

   HUE. Each stage is drawn in its own phase hue through the
   .sh-ph-<id> class — the family tokens.css defines for phases. The
   hue FILLS the meter and the "you are here" tag; as TEXT it is
   --hue-deep, which tokens.css resolves to the right value for the
   page ground in each theme. A fill is not a text colour.
   ============================================================ */
import { h } from '../lib/dom.js';
import { journey, stageHueClass } from '../lib/journey.js';
import '../styles/journey.css';

/* One meter: a bar (role="img", its whole sentence as the label) and
   the short figure beside it. The figure and the bar always measure
   the same thing, so the two can never disagree on sight. */
function meter(kind, has, pct, figure, sentence) {
  return h('div.js-meter', {}, [
    h('span.js-meter-lab', { text: kind, 'aria-hidden': 'true' }),
    h('span.js-bar', { role: 'img', 'aria-label': sentence }, [
      h('span.js-fill', { style: 'width:' + (has ? Math.max(0, Math.min(100, pct)) : 0) + '%' })
    ]),
    h('span.js-meter-val', { text: has ? figure : '—', 'aria-hidden': 'true' })
  ]);
}

function stageItem(s, isCurrent, complete) {
  const li = h('li.js-stage.' + stageHueClass(s.hue) + (isCurrent ? '.is-current' : ''));
  if (isCurrent) li.setAttribute('aria-current', 'step');
  const head = h('div.js-stage-head', {}, [
    h('span.js-part', { text: 'Part ' + s.part }),
    isCurrent ? h('span.js-here', { text: complete ? 'All done' : 'You are here' }) : null
  ]);
  /* Guide: how much of this stage's blueprint part is WRITTEN, by
     field — a percentage, because a step counts as complete only at
     100% (the blueprint's own badge rule) and "0/3 steps" on a part
     that is 86% written reads as nothing done. The complete-step count
     is in the spoken label. Tools: checks in place, as a count. */
  const g = s.guide;
  const gHas = g.fields.total > 0;
  const gPct = gHas ? Math.round((g.fields.done / g.fields.total) * 100) : 0;
  const guideMeter = meter('Guide', gHas, gPct, gPct + '%',
    s.label + ' guide: ' + (gHas
      ? gPct + ' per cent written, ' + g.done + ' of ' + g.total + ' blueprint steps complete'
      : 'no blueprint steps in this part'));
  const t = s.tools;
  const toolsMeter = meter('Tools', t.total > 0, t.pct, t.done + '/' + t.total,
    s.label + ' tools: ' + (t.total > 0 ? t.done + ' of ' + t.total + ' in place' : 'nothing to measure yet'));
  li.append(head, h('strong.js-name', { text: s.label }), guideMeter, toolsMeter);
  if (t.note) li.append(h('p.js-note', { text: t.note }));
  return li;
}

/**
 * The strip for the open project, or null when none is open.
 * @param {object} project  Store.currentProject()
 * @param {object} [opts]   { heading: false } drops the eyebrow;
 *                          { journey } reuses an answer already derived
 */
export function renderJourneyStrip(project, opts = {}) {
  const j = opts.journey || (project ? journey(project) : null);
  if (!j) return null;

  const wrap = h('div.js-strip', { 'data-journey': j.current });
  if (opts.heading !== false) {
    wrap.append(h('p.js-eyebrow', { text: 'The journey · ' + j.blueprint.label + ' beside the tools' }));
  }
  const list = h('ol.js-stages', { 'aria-label': 'The ' + j.stages.length + ' stages of this film' });
  j.stages.forEach((s) => list.append(stageItem(s, s.id === j.current, j.complete)));
  wrap.append(list);

  const cur = j.stages.find((s) => s.id === j.current);
  wrap.append(h('div.js-next.' + stageHueClass(cur.hue), {}, [
    h('div.js-next-body', {}, [
      h('span.js-next-lab', { text: (j.complete ? 'Every stage is in · ' : 'Next · ') + cur.label }),
      h('strong.js-next-title', { text: j.next.label })
    ]),
    h('a.btn.primary.js-next-go', { href: j.next.href, 'aria-label': 'Next: ' + j.next.label, text: 'Next  →' })
  ]));
  return wrap;
}

export default { renderJourneyStrip };
