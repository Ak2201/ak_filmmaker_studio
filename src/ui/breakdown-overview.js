/* ============================================================
   BREAKDOWN OVERVIEW — "the whole script, start to end"
   ------------------------------------------------------------
   The first tab of breakdown.html. Draws what src/lib/breakdown-run.js
   derives: Scenes · Characters · Locations · Totals, and the two ways
   to start — upload a script, or break down the one already written.

   Reading is free: summarize() writes nothing, so rendering this on
   every page render keeps the idle-write count at zero. The only writes
   are the buttons' (runBreakdown, commitImportedScript), and the page
   re-renders after them.

   The section id (#overview) is always present, empty state included —
   a nav target must not depend on data existing.
   ============================================================ */
import { h } from '../lib/dom.js';
import { formatEighths } from '../lib/scenes.js';
import { loadScript, pageCount, formatPages } from '../lib/script.js';
import { headingsOf } from '../lib/scene-sync.js';
import { summarize } from '../lib/breakdown-run.js';
import { titleCase } from '../lib/screenplay-analysis.js';

/* learn() belongs to another lane and may not exist yet. A glob names
   the file without requiring it: missing, it is an empty map and the
   page carries on; present, it loads on demand. */
const learnFiles = import.meta.glob('./learn.js');
export async function mountLearn(root) {
  const load = learnFiles['./learn.js'];
  if (!load) return;
  try {
    const mod = await load();
    const fn = mod.learn || mod.default;
    if (typeof fn !== 'function') return;
    for (const slot of root.querySelectorAll('[data-learn]')) {
      if (slot.childElementCount) continue;
      const el = fn(slot.dataset.learn);
      if (el) slot.append(el);
    }
  } catch (e) { /* the guide is a nicety, never the page */ }
}

const VIEWS = [
  { id: 'scenes', label: 'Scenes' },
  { id: 'characters', label: 'Characters' },
  { id: 'locations', label: 'Locations' },
  { id: 'totals', label: 'Totals' }
];
let view = 'scenes';
export const setView = (v) => { if (VIEWS.some((x) => x.id === v)) view = v; };

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
const counts = (o) => Object.entries(o || {}).map(([k, v]) => k + ' ' + v).join(' · ') || '—';
const cell = (text, cls) => h('td' + (cls ? '.' + cls : ''), { text: String(text ?? '') });
function table(head, rows, label) {
  return h('div.bdo-scroll', { role: 'region', 'aria-label': label, tabindex: '0' }, [
    h('table.bdo-table', {}, [
      h('thead', {}, [h('tr', {}, head.map((t) => h('th', { scope: 'col', text: t })))]),
      h('tbody', {}, rows)
    ])
  ]);
}

/* ---- the four views ---------------------------------------- */
function scenesView(sum) {
  const rows = sum.scenes.map((s) => h('tr', {}, [
    cell(s.number || '—', 'bdo-num'),
    cell(s.intExt),
    cell(s.location || 'Unassigned'),
    cell(s.dayNight),
    cell(formatEighths(Number(s.eighths) || 0)),
    cell(((s.elements && s.elements.cast) || []).join(', ') || '—')
  ]));
  return table(['#', 'INT/EXT', 'Location', 'Day / night', 'Pages', 'Cast'], rows, 'Scenes in script order');
}

function charactersView(sum) {
  const wrap = h('div.bdo-pane');
  if (!sum.characters.length) {
    wrap.append(h('p.bd-none', { text: 'No speaking characters found yet. A character is anyone with a cue in the script, so write or import some dialogue first.' }));
  } else {
    const rows = sum.characters.map((c) => h('tr', {}, [
      cell(titleCase(c.name.toLowerCase()), 'bdo-name'),
      cell(c.scenes.length ? plural(c.scenes.length, 'scene') + ' · ' + c.scenes.slice(0, 12).join(', ') + (c.scenes.length > 12 ? '…' : '') : '—'),
      cell(c.firstScene ? 'Scene ' + c.firstScene : '—'),
      cell(c.lines || '—'),
      cell(c.inBible ? 'In the bible' : 'From the script')
    ]));
    wrap.append(table(['Character', 'Scenes', 'First appears', 'Lines', ''], rows, 'Characters'));
  }
  wrap.append(h('p.bdo-onward', {}, [h('a.btn', { href: 'story.html#path-bible', text: 'Open the Character Bible' })]));
  return wrap;
}

function locationsView(sum) {
  const rows = sum.locations.map((l) => h('tr', {}, [
    cell(l.name, 'bdo-name'),
    cell(counts(l.intExt)),
    cell(counts(l.dayNight)),
    cell(l.scenes.join(', ')),
    cell(l.pages)
  ]));
  return table(['Location', 'INT / EXT', 'Day / night', 'Scenes', 'Pages'], rows, 'Locations');
}

function totalsView(sum) {
  const t = sum.totals;
  const card = (value, label) => h('div.bd-stat', {}, [h('strong', { text: String(value) }), h('span', { text: label })]);
  return h('div.bd-stats.bdo-totals', {}, [
    card(t.scenes, t.scenes === 1 ? 'scene' : 'scenes'),
    card(t.pages, 'pages'),
    card((t.intExt.INT || 0) + ' / ' + (t.intExt.EXT || 0), 'INT / EXT'),
    card((t.dayNight.DAY || 0) + ' / ' + (t.dayNight.NIGHT || 0), 'day / night'),
    card(t.nightPages, 'night pages'),
    card(t.cast, 'cast'),
    card(t.locations, t.locations === 1 ? 'location' : 'locations'),
    card(t.runtime, 'screen time')
  ]);
}

/* ---- the starting buttons ---------------------------------- */
function startBlock({ scriptPages, hasScript, hasScenes }) {
  const row = h('div.bdo-start');
  if (hasScript) {
    row.append(h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'run-breakdown',
      text: hasScenes ? 'Break down the whole script' : `Break down my script (${formatPages(scriptPages)} pages)`
    }));
  }
  if (!hasScenes || !hasScript) {
    row.append(h('label' + (hasScript ? '.btn' : '.btn.primary.bd-cta') + '.bdo-upload', {}, [
      h('span', { text: 'Upload a script' }),
      h('input.bdo-file', {
        type: 'file', 'data-action': 'bd-upload', 'aria-label': 'Upload a script file',
        accept: '.fountain,.fdx,.pdf,.txt,.md,.spmd,.xml,text/plain,application/pdf'
      })
    ]));
  }
  return row;
}

/** The section. `scenes` is listScenes(); `status` a line to announce. */
export function renderOverview(scenes, status = '') {
  const wrap = h('section.bd-overview', { id: 'overview', 'data-tab-label': 'Whole script' });
  let els = [];
  try { els = loadScript().elements; } catch (e) { /* no script */ }
  const hasScript = headingsOf(els).length > 0;
  const hasScenes = scenes.length > 0;

  wrap.append(
    h('h2.bd-h2', { text: 'Break down the whole script' }),
    h('span.bdo-learn', { 'data-learn': 'breakdown' }),
    h('p.bd-sub', {
      text: 'A breakdown lists everything each scene needs — who is in it, where it happens, '
        + 'inside or outside, day or night, and how long it runs — so a production can '
        + 'plan the shoot. One button reads your script from the first page to the last and '
        + 'fills in every scene, every character and every location. It can be run again whenever the script changes.'
    }),
    startBlock({ scriptPages: pageCount(els), hasScript, hasScenes }),
    h('p.bdo-status', { role: 'status', 'aria-live': 'polite', text: status })
  );
  if (!hasScript && !hasScenes) {
    wrap.append(h('p.bd-none', {
      text: 'No script yet. Upload a Fountain, Final Draft, PDF or text file and it is read straight into scenes — '
        + 'or write one on the Write page, even five pages is enough.'
    }));
  }
  if (!hasScenes) return wrap;

  const sum = summarize({ elements: els });
  const nav = h('div.bdo-seg', { role: 'tablist', 'aria-label': 'Breakdown summary' },
    VIEWS.map((v) => h('button.bdo-seg-btn', {
      type: 'button', role: 'tab', 'data-action': 'sum-view', 'data-view': v.id,
      id: 'bdo-tab-' + v.id, 'aria-controls': 'bdo-pane-' + v.id,
      'aria-selected': String(view === v.id), tabindex: view === v.id ? '0' : '-1',
      text: v.label + (v.id === 'characters' ? ' (' + sum.characters.length + ')'
        : v.id === 'locations' ? ' (' + sum.locations.length + ')'
        : v.id === 'scenes' ? ' (' + sum.scenes.length + ')' : '')
    })));
  wrap.append(nav);
  const builders = { scenes: scenesView, characters: charactersView, locations: locationsView, totals: totalsView };
  for (const v of VIEWS) {
    wrap.append(h('div.bdo-panel', {
      role: 'tabpanel', id: 'bdo-pane-' + v.id, 'aria-labelledby': 'bdo-tab-' + v.id, hidden: view !== v.id
    }, [builders[v.id](sum)]));
  }
  wrap.append(h('p.bdo-onward', {}, [
    h('span', { text: 'Next: ' }),
    h('a.btn', { href: 'stripboard.html', text: 'Schedule it on the Stripboard' }),
    h('span.bdo-learn', { 'data-learn': 'stripboard' }),
    h('a.btn', { href: 'reports.html', text: 'Reports' }),
    h('a.btn', { href: 'plan.html', text: 'Plan' })
  ]));
  return wrap;
}

/** Say something in the status line without a full render. */
export function say(text) {
  const el = document.querySelector('.bdo-status');
  if (el) el.textContent = text;
}
