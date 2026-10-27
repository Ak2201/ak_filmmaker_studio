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
import { button } from './kit/index.js';
import { aiPill } from './ai-pill.js';   // light: the model code loads at the click
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
    cell(s.intExt, 'bdo-num'),
    cell(s.location || 'Unassigned', 'bdo-wide'),
    cell(s.dayNight, 'bdo-num'),
    cell(formatEighths(Number(s.eighths) || 0), 'bdo-num'),
    cell(((s.elements && s.elements.cast) || []).join(', ') || '—', 'bdo-wide')
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
  wrap.append(h('p.bdo-onward', {}, [button({ label: 'Open Characters & world on the Story page', href: 'story.html#path-bible', iconAfter: 'arrow_forward' })]));
  return wrap;
}

function locationsView(sum) {
  const rows = sum.locations.map((l) => h('tr', {}, [
    cell(l.name, 'bdo-name'),
    cell(counts(l.intExt), 'bdo-num'),
    cell(counts(l.dayNight), 'bdo-num'),
    cell(l.scenes.join(', '), 'bdo-wide'),
    cell(l.pages, 'bdo-num')
  ]));
  return table(['Location', 'INT / EXT', 'Day / night', 'Scenes', 'Pages'], rows, 'Locations');
}

/** DAY / NIGHT, and a third figure only when other times (dusk, dawn,
 *  continuous) exist, so the tile always adds up to the scene count. */
export function dayNightCard(t, card) {
  const day = t.dayNight.DAY || 0, night = t.dayNight.NIGHT || 0;
  const other = Object.keys(t.dayNight).reduce((n, k) => n + (k === 'DAY' || k === 'NIGHT' ? 0 : t.dayNight[k] || 0), 0);
  return other ? card(day + ' / ' + night + ' / ' + other, 'day / night / other') : card(day + ' / ' + night, 'day / night');
}
function totalsView(sum) {
  const t = sum.totals;
  const card = (value, label) => h('div.bd-stat', {}, [h('strong', { text: String(value) }), h('span', { text: label })]);
  return h('div.bd-stats.bdo-totals', {}, [
    card(t.scenes, t.scenes === 1 ? 'scene' : 'scenes'),
    card(t.pages, 'pages'),
    card((t.intExt.INT || 0) + ' / ' + (t.intExt.EXT || 0), 'INT / EXT'),
    dayNightCard(t, card),
    card(t.nightPages, 'night pages'),
    card(t.cast, 'cast'),
    card(t.locations, t.locations === 1 ? 'location' : 'locations'),
    card(t.runtime, 'screen time')
  ]);
}

/* ---- the starting buttons ---------------------------------- */
/* The page hands over what happens around the run (its toast, its
   repaint), once; the AI pill's ctx reads it at the click. */
let hooksFor = () => ({});
export const setFlowHooks = (fn) => { hooksFor = typeof fn === 'function' ? fn : () => ({}); };

/** "Breakdown with AI": a pill whose ctx loads breakdown-flow.js (and
 *  through it the Desk) only when pressed. `refreshTab` is the hash the
 *  page repaints on. */
export function breakdownAiPill(refreshTab) {
  return aiPill({
    label: 'Breakdown with AI',
    tasks: [{ id: 'shot-draft', label: 'Breakdown with AI' }],
    ctx: async () => {
      const flow = await import('./breakdown-flow.js');
      return flow.aiBreakdownCtx(hooksFor(refreshTab))();
    }
  });
}

function startBlock({ scriptPages, hasScript, hasScenes }) {
  const row = h('div.bdo-start');
  if (hasScript) {
    row.append(
      /* Once the script is broken down the result is the page and a
         re-run is the secondary act; before, the run IS the page.
         "Break down everything" is the whole run by rules, one Undo
         (src/lib/script-pipeline.js); Manual breakdown is the run plus
         the shot and story reviews. */
      button({
        variant: hasScenes ? 'secondary' : 'primary', pill: !hasScenes, action: 'run-pipeline', class: hasScenes ? '' : 'bd-cta',
        icon: 'auto_awesome', label: 'Break down everything',
        title: `Scenes, cast, characters, locations, props, shots, days and budget days from my script (${formatPages(scriptPages)} pages)`
      }),
      button({
        variant: 'secondary', action: 'run-breakdown',
        label: 'Manual breakdown',
        title: hasScenes ? 'Break down the whole script again' : `Break down my script (${formatPages(scriptPages)} pages)`
      }),
      breakdownAiPill('#overview')
    );
  }
  if (!hasScenes || !hasScript) {
    row.append(h('label' + (hasScript ? '.k-btn' : '.k-btn.k-btn--primary.k-btn--pill.bd-cta') + '.bdo-upload', {}, [
      h('span', { text: 'Upload a script' }),
      h('input.bdo-file', {
        type: 'file', 'data-action': 'bd-upload', 'aria-label': 'Upload a script file',
        /* Parser.ACCEPT (script-import.js) is a lazy chunk this panel does
           not load; npm run test:accept fails when this falls behind it. */
        accept: '.fountain,.spmd,.txt,.md,.fdx,.xml,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document'
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

  /* The explainer. The learn() disclosure beside the heading says what a
     breakdown IS; this paragraph says what the two buttons DO, so the
     two no longer repeat each other. */
  const how = h('p.bd-sub', {
    text: 'A breakdown lists everything each scene needs — who is in it, where it happens, '
      + 'inside or outside, day or night, and how long it runs — so a production can '
      + 'plan the shoot. Break down everything does the whole run at once by rules — scenes, cast, characters, locations, '
      + 'suggested props, a shot division, proposed shooting days and the budget\u2019s days — filling only what is blank, with one Undo. '
      + 'Manual breakdown reads your script from the first page to the last, '
      + 'fills in every scene, character and location, then proposes shots and a story outline by rules. '
      + 'Breakdown with AI does the same and asks your own model for the shots and the story. '
      + 'Either way you review each proposal before anything is kept, and it can be run again whenever the script changes.'
  });
  const start = startBlock({ scriptPages: pageCount(els), hasScript, hasScenes });
  const statusLine = h('p.bdo-status', { role: 'status', 'aria-live': 'polite', text: status });

  wrap.append(h('div.bdo-title', {}, [
    h('h2.bd-h2', { text: 'Break down the whole script' }),
    h('span.bdo-learn', { 'data-learn': 'breakdown' })
  ]));
  if (!hasScenes) {
    /* Empty: the state first, then the one thing to do, then how it works. */
    if (!hasScript) {
      wrap.append(h('p.bd-none', {
        text: 'No script yet. Upload a Fountain, Final Draft, Word, PDF or text file and it is read straight into scenes — '
          + 'or write one in the Screenplay Writer, even five pages is enough.'
      }));
    }
    wrap.append(start, statusLine, how);
    return wrap;
  }
  wrap.append(statusLine);
  if (hasScript) {
    /* Already broken down, the whole run still fills what is blank:
       shots for new scenes, days for unscheduled ones, budget days. */
    wrap.append(h('div.bdo-everything', {}, [
      h('p.bdo-everything-copy', { text: 'Fill in whatever is still blank — shots, shooting days, budget days, new characters — from the script, by rules.' }),
      button({ label: 'Break down everything', icon: 'auto_awesome', variant: 'secondary', size: 'sm', action: 'run-pipeline' })
    ]));
  }

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
  /* Already broken down: the result leads, and running it again is a
     closed disclosure under it rather than the page's first ask. */
  wrap.append(h('details.bdo-rerun', {}, [
    h('summary', { text: hasScript ? 'Run the breakdown again' : 'Upload a script to break down' }),
    how,
    start
  ]));
  wrap.append(h('p.bdo-onward', {}, [
    h('span', { text: 'Next: ' }),
    button({ label: 'Schedule it on the Stripboard', href: 'stripboard.html', variant: 'primary', iconAfter: 'arrow_forward' }),
    h('span.bdo-learn', { 'data-learn': 'stripboard' }),
    button({ label: 'Production Reports', href: 'reports.html', variant: 'secondary' }),
    button({ label: 'Plan', href: 'plan.html', variant: 'secondary' })
  ]));
  return wrap;
}

/** Say something in the status line without a full render. */
export function say(text) {
  const el = document.querySelector('.bdo-status');
  if (el) el.textContent = text;
}
