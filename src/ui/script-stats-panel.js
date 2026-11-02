/* ============================================================
   SCRIPT STATISTICS PANEL — the Screenplay Writer's ⋯ › Statistics
   ------------------------------------------------------------
   One pop-up (src/ui/explainer.js's frame: the kit modal above 720px,
   the phone sheet below), built when it opens from
   src/lib/script-stats.js. Stores nothing and writes nothing: closing
   it throws the figures away, and opening it again derives them again
   from the script as it is then. Loaded at the click, so the editor's
   first paint carries none of it.

   Pages are the PDF paginator's (screenplay-export.js paginateDoc, the
   pass the page view draws its breaks from), so "pages" here is the
   number the PDF will have; until the typesetter loads, the line
   estimate stands in and the panel says so.
   ============================================================ */
import { h } from '../lib/dom.js';
import { meter } from './kit/index.js';
import { openExplainer } from './explainer.js';
import { scriptStatistics, formatEighths, formatShare } from '../lib/script-stats.js';
import '../styles/script-tools.css';

const MAX_SPEAKERS = 12;
const plural = (n, one, many) => n.toLocaleString() + ' ' + (n === 1 ? one : (many || one + 's'));

function split(title, counts, labels) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return h('section.sst-sec', { 'aria-label': title }, [
    h('h4.sst-h', { text: title }),
    ...labels.filter(([k]) => counts[k] || k !== 'unstated').map(([k, label]) =>
      meter({ label: label + ' · ' + counts[k], value: counts[k], max: total || 1 }))
  ]);
}

/** Fill `body` with the statistics of `doc` (pages from `typeset`, the
    loaded screenplay-export.js module, when there is one). */
export function renderStats(body, doc, { typeset = null, autoContd = false } = {}) {
  let pages = null;
  try { pages = typeset ? typeset.paginateDoc(doc, { autoContd }) : null; } catch (e) { pages = null; }
  const st = scriptStatistics(doc.elements, { pages });
  const facts = h('dl.sst-facts', {}, [
    ['Words', st.words.toLocaleString()],
    ['Pages', st.paginated ? String(st.pages) : '≈ ' + st.pages],
    ['Scenes', String(st.scenes)],
    ['Speaking characters', String(st.speakers.length)],
    ['Dialogue', formatShare(st.words ? st.dialogueWords / st.words : 0) + ' of the words']
  ].flatMap(([k, v]) => [h('dt', { text: k }), h('dd', { text: v })]));
  const parts = [facts];
  if (!st.paginated) parts.push(h('p.sst-note', { text: 'Pages are estimated until the page layout has loaded.' }));
  if (!st.scenes && !st.words) {
    parts.push(h('p.sst-note', { text: 'Nothing written yet. Start with a scene heading: INT. or EXT.' }));
    body.replaceChildren(...parts);
    return st;
  }
  parts.push(
    split('Interior and exterior', st.intExt, [['INT', 'INT'], ['EXT', 'EXT'], ['INT/EXT', 'INT/EXT'], ['unstated', 'Not stated']]),
    split('Time of day', st.dayNight, [['DAY', 'Day'], ['NIGHT', 'Night'], ['DAWN', 'Dawn'], ['DUSK', 'Dusk'], ['CONTINUOUS', 'Continuous'], ['unstated', 'Not stated']])
  );
  if (st.speakers.length) {
    const shown = st.speakers.slice(0, MAX_SPEAKERS);
    parts.push(h('section.sst-sec', { 'aria-label': 'Dialogue share' }, [
      h('h4.sst-h', { text: 'Dialogue share' }),
      h('table.sst-table', {}, [
        h('thead', {}, [h('tr', {}, [h('th', { scope: 'col', text: 'Character' }), h('th', { scope: 'col', text: 'Words' }), h('th', { scope: 'col', text: 'Speeches' }), h('th', { scope: 'col', text: 'Share' })])]),
        h('tbody', {}, shown.map((s) => h('tr', {}, [
          h('th', { scope: 'row', text: s.name }),
          h('td', { text: s.words.toLocaleString() }),
          h('td', { text: String(s.speeches) }),
          h('td', { text: formatShare(s.share) })
        ])))
      ]),
      st.speakers.length > shown.length
        ? h('p.sst-note', { text: 'And ' + plural(st.speakers.length - shown.length, 'more character') + ' with fewer words.' })
        : null
    ].filter(Boolean)));
  }
  if (st.longest.length) {
    parts.push(h('section.sst-sec', { 'aria-label': 'Longest scenes' }, [
      h('h4.sst-h', { text: 'Longest scenes' }),
      h('ol.sst-long', {}, st.longest.map((s) => h('li', {}, [
        h('span.sst-n', { text: String(s.n) }),
        h('span.sst-slug', { text: s.heading }),
        h('span.sst-len', { text: formatEighths(s.eighths) + (s.eighths > 8 ? ' pages' : ' page') })
      ])))
    ]));
  }
  body.replaceChildren(...parts);
  return st;
}

export function openStats({ doc, typeset = null, autoContd = false, returnTo = null } = {}) {
  return openExplainer({
    title: 'Statistics',
    eyebrow: 'Screenplay',
    returnTo,
    build: (body) => { renderStats(body, doc, { typeset, autoContd }); }
  });
}

export default { openStats, renderStats };
