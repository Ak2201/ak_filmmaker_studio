/* ============================================================
   SCRIPT OVERVIEW — the first tab of breakdown.html (#script)
   ------------------------------------------------------------
   "Screenplay Analysis": what the script is made of, read straight off
   the typed elements, plus the outline (scene list and the beat
   board) and the characters panel that used to live on write.html.

   DERIVED ONLY. Nothing here writes; the counts come from
   sliceScript()/headingParts() on the script, so they are right
   BEFORE the breakdown has ever been run. The cast matrix needs scene
   rows (castMatrix reads their tags), so it appears once scenes
   exist and says so until then. The only writes are the beat board's
   and the characters panel's own, through the page's save path.

   ALWAYS RENDERS, with its id, whatever exists — a nav target must
   not depend on data existing (CLAUDE.md). Empty state inside.
   ============================================================ */
import { h } from '../lib/dom.js';
import { loadScript, pageCount, formatPages, formatRuntime, elementLines } from '../lib/script.js';
import {
  sliceScript, headingParts, castMatrix, cueName, formatDuration, titleCase,
  DIALOGUE_WPS, SPEAKER_BEAT, HEADING_SECONDS
} from '../lib/screenplay-analysis.js';
/* The beat board and the characters panel are lazy: they are most of
   this tab's weight and breakdown.html's first paint should not carry
   them. Placeholders render now; hydrateScriptParts() fills them. */

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const words = (t) => String(t || '').split(/\s+/).filter(Boolean).length;
const cell = (text, cls) => h('td' + (cls ? '.' + cls : ''), { text: String(text ?? '') });
function table(head, rows, label) {
  return h('div.bdo-scroll', { role: 'region', 'aria-label': label, tabindex: '0' }, [
    h('table.bdo-table', {}, [
      h('thead', {}, [h('tr', {}, head.map((t) => h('th', { scope: 'col', text: t })))]),
      h('tbody', {}, rows)
    ])
  ]);
}

/** Everything the overview shows, from the elements alone. Pure. */
export function deriveScript(elements) {
  const els = elements || [];
  const slices = sliceScript(els);
  const intExt = {}, dayNight = {}, places = new Map(), chars = new Map();
  const scenes = slices.map((s, i) => {
    const p = headingParts(s.heading);
    const lines = elementLines({ type: 'scene', text: s.heading }) + s.elements.reduce((n, e) => n + elementLines(e), 0);
    let seconds = HEADING_SECONDS;
    let cue = '';
    for (const e of s.elements) {
      if (e.type === 'character') {
        cue = cueName(e.text);
        if (cue) {
          if (!chars.has(cue)) chars.set(cue, { name: cue, scenes: new Set(), speeches: 0, seconds: 0 });
          const c = chars.get(cue);
          c.scenes.add(i); c.speeches++; c.seconds += SPEAKER_BEAT;
        }
      } else if (e.type === 'dialogue' && cue) {
        chars.get(cue).seconds += words(e.text) / DIALOGUE_WPS;
      } else if (e.type !== 'paren') cue = '';
    }
    intExt[p.ie || '—'] = (intExt[p.ie || '—'] || 0) + 1;
    const dn = p.time === 'DAY' || p.time === 'NIGHT' ? p.time : (p.time || '—');
    dayNight[dn] = (dayNight[dn] || 0) + 1;
    if (p.place) places.set(p.place, (places.get(p.place) || 0) + 1);
    return { n: i + 1, heading: s.heading, ie: p.ie, place: p.place, time: p.time, lines, pages: lines / 55, seconds };
  });
  const characters = [...chars.values()]
    .map((c) => ({ name: c.name, scenes: c.scenes.size, speeches: c.speeches, seconds: Math.round(c.seconds) }))
    .sort((a, b) => b.seconds - a.seconds || a.name.localeCompare(b.name));
  const locations = [...places.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  return { scenes, characters, locations, intExt, dayNight, pages: pageCount(els) };
}

const counts = (o) => Object.entries(o).map(([k, v]) => k + ' ' + v).join(' · ') || '—';

function overviewPart(d, scenesRows, els) {
  const wrap = h('div.so-part', { id: 'script-overview' });
  const card = (v, l) => h('div.bd-stat', {}, [h('strong', { text: String(v) }), h('span', { text: l })]);
  wrap.append(
    h('h3.bd-h3', { text: 'Overview' }),
    h('div.bd-stats.bdo-totals', {}, [
      card(formatPages(d.pages), 'pages'),
      card('≈ ' + formatRuntime(d.pages), 'runtime'),
      card(d.scenes.length, d.scenes.length === 1 ? 'scene' : 'scenes'),
      card(counts(d.intExt), 'INT / EXT'),
      card(counts(d.dayNight), 'day / night'),
      card(d.characters.length, d.characters.length === 1 ? 'speaking role' : 'speaking roles'),
      card(d.locations.length, d.locations.length === 1 ? 'location' : 'locations')
    ])
  );
  if (d.characters.length) {
    wrap.append(h('h4.bd-h4', { text: 'Screen time per character' }),
      table(['Character', 'Scenes', 'Speeches', 'Dialogue time'], d.characters.map((c) => h('tr', {}, [
        cell(titleCase(c.name.toLowerCase()), 'bdo-name'), cell(c.scenes), cell(c.speeches), cell(formatDuration(c.seconds))
      ])), 'Screen time per character'));
  }
  if (d.locations.length) {
    wrap.append(h('h4.bd-h4', { text: 'Locations' }),
      table(['Location', 'Scenes'], d.locations.map((l) => h('tr', {}, [cell(titleCase(l.name.toLowerCase()), 'bdo-name'), cell(l.count)])), 'Locations'));
  }
  if (scenesRows.length) {
    const cm = castMatrix(scenesRows, els);
    wrap.append(h('h4.bd-h4', { text: 'Cast matrix' }),
      table(['Character', 'Scenes', 'Lines'], cm.characters.slice(0, 30).map((c) => h('tr', {}, [
        cell(titleCase(String(c.name).toLowerCase()), 'bdo-name'), cell(c.scenes.size), cell(c.lines || '—')
      ])), 'Cast matrix, characters by scenes'),
      h('p.bd-sub', { text: 'The full characters-by-scenes grid is on Reports.' }),
      h('p.bdo-onward', {}, [h('a.btn', { href: 'reports.html#screentime', text: 'Screen time by scene' }), h('a.btn', { href: 'reports.html', text: 'Reports' })]));
  } else {
    wrap.append(h('p.bd-sub', { text: 'The cast matrix appears once the breakdown has been run: it counts who is tagged in each scene as well as who speaks.' }));
  }
  return wrap;
}

function outlinePart(d) {
  const wrap = h('div.so-part', { id: 'script-outline' });
  wrap.append(h('h3.bd-h3', { text: 'Outline' }));
  if (!d.scenes.length) {
    wrap.append(h('p.bd-none', { text: 'No scene headings yet. The outline is built from the headings in the script.' }));
  } else {
    wrap.append(table(['#', 'Heading', 'Page length'], d.scenes.map((s) => h('tr', {}, [
      cell(s.n, 'bdo-num'), cell(s.heading), cell(formatPages(Math.round(s.pages * 8) / 8) + ' pp')
    ])), 'Scene outline'));
  }
  if (d.scenes.length) wrap.append(h('div.so-lazy', { 'data-so-lazy': 'outline' }));
  return wrap;
}

/** The section. `scenes` is listScenes(); `opts.from` is the ?from value. */
export function renderScriptOverview(scenes, opts = {}) {
  const wrap = h('section.bd-script', { id: 'script', 'data-tab-label': 'Screenplay Analysis' });
  let els = [];
  try { els = loadScript().elements; } catch (e) { /* no script */ }
  const d = deriveScript(els);
  const hasScript = d.scenes.length > 0;
  wrap.append(
    h('h2.bd-h2', { text: 'Screenplay Analysis' }),
    h('p.bd-sub', { text: 'What the script is made of, worked out from its pages. Nothing here is typed twice: change the script and this follows.' }),
    h('p.bdo-onward', {}, [
      hasScript ? h('button.btn.primary.bd-cta', { type: 'button', 'data-action': 'run-breakdown-script', text: scenes.length ? 'Run breakdown again' : 'Run breakdown' }) : null,
      h('a.btn', { href: 'screenplay.html', text: 'Back to the Screenplay Writer' }),
      hasScript ? h('a.btn', { href: 'write.html?stay=1#coverage', text: 'AI coverage report' }) : null
    ].filter(Boolean)),
    h('p.bdo-status', { role: 'status', 'aria-live': 'polite', 'data-so-status': '', text: '' })
  );
  if (opts.from === 'script' && hasScript) {
    wrap.append(h('p.so-hint', { role: 'note', text: scenes.length
      ? 'You came from the Screenplay Writer. If the script changed, run the breakdown again to bring the scenes up to date.'
      : 'You came from the Screenplay Writer. Run the breakdown to turn its scene headings into scenes you can schedule and budget.' }));
  }
  if (!hasScript) {
    wrap.append(h('p.bd-none', { text: 'No screenplay yet. Write one in the Screenplay Writer or use Import Screenplay, and this fills in.' }));
  }
  wrap.append(...[overviewPart(d, scenes, els), outlinePart(d), hasScript ? h('div.so-part', { id: 'script-characters' }, [h('h3.bd-h3', { text: 'Characters' }), h('div.so-lazy', { 'data-so-lazy': 'characters' })]) : null].filter(Boolean));   // append(null) prints "null"
  return wrap;
}

let wired = null;
/** Fills the lazy parts of #script. `wire(bb, ch)` runs once, with the two
    modules, so the page can hand them its doc and save path. */
export function hydrateScriptParts(wire) {
  if (!document.querySelector('[data-so-lazy]')) return Promise.resolve();
  wired = wired || Promise.all([import('./beat-board.js'), import('./characters-panel.js')])
    .then(([bb, ch]) => { try { wire(bb, ch); } catch (e) { console.warn('[script-overview] wire', e); } return [bb, ch]; });
  return wired.then(([bb, ch]) => {
    const o = document.querySelector('[data-so-lazy="outline"]');
    if (o) o.replaceWith(bb.renderOutline());
    const c = document.querySelector('[data-so-lazy="characters"]');
    if (c) c.replaceWith(ch.renderCharacters());
  }).catch((e) => console.warn('[script-overview] lazy parts', e));
}

export default { renderScriptOverview, deriveScript, hydrateScriptParts };
