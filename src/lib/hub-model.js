/* ============================================================
   HUB MODEL — the hub page's own derivations
   ------------------------------------------------------------
   Moved out of src/pages/hub.js and src/pages/hub/project-cards.js when
   the hub's view and logic were split (docs/ARCHITECTURE.md). The page
   keeps the markup, the events and its in-memory view state (the
   filter, the sort, the search term) and hands them in here.

   Nothing here touches the DOM. Storage goes through the proxy
   (src/lib/prefs.js) or, where a project that is NOT open has to be
   reached, through store.js's raw readers — exactly as before.
   ============================================================ */
import Store from './store.js';
import { fmtMoney } from './money.js';
import { esc } from './dom.js';
import { STAGES, stageOfStep } from './journey.js';
import { readActivityLog, saveActivityLog, capLog } from './hub-activity.js';
import {
  FEATURE_KEY, SHORT_KEY, FEATURE_URL, SHORT_URL, PROJECT_HOME_URL, LIBRARY_URL
} from './hub-keys.js';

import featureData from '../data/steps.feature.json';
import shortData   from '../data/steps.short.json';
import prodData    from '../data/steps.production.json';
import films       from '../data/films.json';
import directors   from '../data/directors.json';
import rules       from '../data/rules.json';
import watchlist   from '../data/watchlist.json';

// ============================================================
// PAGES — the new filenames, and a map off the old ones.
// ============================================================
const RENAMED = {
  'arunak-filmmaker-blueprint.html': FEATURE_URL,
  'arunak-shortfilm-blueprint.html': SHORT_URL,
  'arunak-filmmaker-library.html':   LIBRARY_URL
};

/** Activity rows saved by the legacy hub point at the old files. */
export function rewriteUrl(url) {
  if (!url) return url;
  for (const [oldName, newName] of Object.entries(RENAMED)) {
    if (url.startsWith(oldName)) return newName + url.slice(oldName.length);
  }
  return url;
}

// ============================================================
// DATA — flattened once, read by search, index and stats.
// ============================================================
/* All four phases. This was vol1+vol2 and stayed that way when
   Production and Post-production were added, which quietly left eight
   steps out of the search index, out of the step count on the cover
   and out of the door tag — findable only by scrolling. */
export const FEATURE_STEPS = [
  ...featureData.vol1, ...featureData.vol2,
  ...prodData.production, ...prodData.post
];
/* The five stages, not the four 2023 phases. A step's stage comes from
   journey.js (the steps.stages.json sidecar when present), so the search
   snippet, the master index and the journey strip all file step 11 under
   Screenplay rather than three of them under Story. */
const PHASE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
export const stageName = (ns, step) => PHASE_NAME[stageOfStep(ns, step.id)] || 'Story';
export const SHORT_STEPS = shortData.steps;

const WATCH_FILMS = watchlist.reduce((n, w) => n + (w.films ? w.films.length : 0), 0);

// ------------------------------------------------------------
// ANCHORS — the only hand-kept links left. These are page
// sections with no row in src/data behind them; everything else
// on this page is generated from the JSON.
// ------------------------------------------------------------
export const ANCHORS = {
  feature: [
    { label: 'Treatment Ladder', hash: '#treatment-ladder', snippet: 'Logline → synopsis → one-pager → treatment → step outline' },
    { label: 'Auto Pitch Deck',  hash: '#pitch-deck',       snippet: '10 slides built from your blueprint data — exports as .pptx' },
    { label: 'Sync & backup',    hash: '#sync-section',     snippet: 'Keep your blueprint in step across devices' },
    { label: 'Full Glossary',    hash: '#glossary',         snippet: 'Camera, lens, lighting, sound and post-production terms' }
  ],
  shorts: [
    { label: 'Fountain Export',      hash: '#step-08', snippet: 'Plain-text screenplay — Final Draft, Highland, WriterDuet' },
    { label: 'AI Prompt Generator',  hash: '#step-08', snippet: 'Build prompts for scene, dialogue or feedback' },
    { label: 'Glossary (Shorts)',    hash: '#glossary', snippet: 'Screenplay, production, festival and craft terms' }
  ],
  library: [
    { label: `${films.length} Films Analyzed`,     hash: '#films',     num: 'I',   snippet: 'One extractable lesson per film' },
    { label: `${directors.length} Director Archetypes`, hash: '#directors', num: 'II',  snippet: 'Ten voices to study as schools of filmmaking' },
    { label: `${rules.length} Rules of Thumb`,     hash: '#rules',     num: 'III', snippet: 'Craft maxims, attributed where the source is known' },
    { label: 'Equipment Calculator',               hash: '', href: 'budget.html#estimate', num: 'IV',  snippet: 'Build a kit on the Budget page — Chennai 2024-25 rate ranges, a daily total' },
    { label: `${WATCH_FILMS}-Film Watch List`,     hash: '#watch',     num: 'V',   snippet: 'Three films to study per blueprint step' }
  ]
};

// ------------------------------------------------------------
// MASTER INDEX — same source, grouped for the page.
// Both blueprints are grouped by the five STAGES, one part each,
// with the step → stage mapping read from journey.js (which reads
// the steps.stages.json sidecar) — not from step ranges typed here.
// A stage a blueprint has no step in (the short has no Production
// step) simply has no group.
// ------------------------------------------------------------
export function stageParts(ns, steps) {
  return STAGES.map((st) => ({
    stage: st,
    label: 'PART ' + st.part + ' · ' + st.label.toUpperCase(),
    steps: steps.filter((s) => stageOfStep(ns, s.id) === st.id)
  })).filter((p) => p.steps.length);
}
export const FEATURE_PARTS = stageParts('feature', FEATURE_STEPS);
export const SHORT_PARTS = stageParts('short', SHORT_STEPS);

// ============================================================
// GREETING
// ============================================================
/** The greeting line's markup (escaped), for this hour and this desk. */
export function greetingHTML(hour, projects, cur) {
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning'
              : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  if (projects.length === 0) {
    return greet + '. <strong>The desk is empty</strong> — what are we making?';
  } else if (cur) {
    return greet + '. Active project: <strong>' + esc(cur.title) + '</strong> · ' + projects.length + ' total.';
  }
  return greet + '. <strong>' + projects.length + ' project' + (projects.length === 1 ? '' : 's') +
         ' on the desk.</strong> Pick one to keep working.';
}

// ============================================================
// ACTIVITY — what moved since the last look
// ============================================================
/**
 * Diff the blueprints' status against the log's last snapshot, add a
 * line for each thing that moved, and store the new snapshot.
 * @param {{f:object, s:object, l:object}} st  the three statuses
 */
export function detectActivity({ f, s, l }) {
  const log  = readActivityLog();
  const last = log.lastSnap || {};
  const now = {
    fp: f.pct, ft: f.title, fs: f.lastEditedStep,
    sp: s.pct, st: s.title, ss: s.lastEditedStep,
    lc: l.count, lt: l.total
  };
  const arr = Array.isArray(log.entries) ? log.entries : [];

  if (last.fp !== undefined) {
    if (now.ft && now.ft !== last.ft) {
      arr.unshift({ ts: Date.now(), where: 'feat', what: 'Feature title set: "' + now.ft + '"', url: PROJECT_HOME_URL });
    }
    if (now.fp > (last.fp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'feat',
        what: 'Feature progress: ' + (last.fp || 0) + '% → ' + now.fp + '%' + (now.fs ? ' (' + now.fs + ')' : ''),
        url: PROJECT_HOME_URL });
    }
    if (now.st && now.st !== last.st) {
      arr.unshift({ ts: Date.now(), where: 'short', what: 'Short title set: "' + now.st + '"', url: PROJECT_HOME_URL });
    }
    if (now.sp > (last.sp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'short',
        what: 'Short progress: ' + (last.sp || 0) + '% → ' + now.sp + '%' + (now.ss ? ' (' + now.ss + ')' : ''),
        url: PROJECT_HOME_URL });
    }
    if (now.lc > (last.lc || 0)) {
      arr.unshift({ ts: Date.now(), where: 'lib',
        // The budget's own currency (hub-status.js returns it with the
        // total): a dollar budget once logged as '₹ 9k'. And it is the
        // line-item budget estimate, not an equipment list.
        what: 'Budget estimate: ' + (last.lc || 0) + ' → ' + now.lc + ' lines (' + fmtMoney(now.lt, l.currency, true) + ')',
        url: 'budget.html#estimate' });
    }
  }
  log.entries = capLog(arr);
  log.lastSnap = now;
  saveActivityLog(log);
}

// ============================================================
// PROJECTS
// ============================================================
/** Copy every scoped blob of project `fromId` into project `toId`,
 *  bypassing the proxy (neither has to be the open one). */
export function copyProjectData(fromId, toId) {
  Store.SCOPED_KEYS.forEach(k => {
    const v = Store.rawGet(k + '__' + fromId);
    if (v) Store.rawSet(k + '__' + toId, v);
  });
}

/* A project's blueprint blob, by its format, bypassing the proxy —
   the cards speak about projects that are not open. */
export function projectBlob(p) {
  try {
    const key = (p.format === 'short' ? SHORT_KEY : FEATURE_KEY) + '__' + p.id;
    const data = JSON.parse(Store.rawGet(key) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (e) { return {}; }
}

/** The grid's filter, search and sort, applied to a copy of the list.
 *  @param {{filter:string, search:string, sort:string}} view */
export function applyProjectFilters(projects, { filter, search, sort }) {
  let arr = projects.slice();
  if (filter !== 'all') arr = arr.filter(p => p.format === filter);
  if (search) {
    arr = arr.filter(p => (p.title || '').toLowerCase().indexOf(search) >= 0);
  }
  if (sort === 'alpha') {
    arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (sort === 'oldest') {
    arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } else {
    arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return arr;
}

/** The switcher's order: most recently edited first. */
export function byRecent(projects) {
  return projects.slice().sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
}

export default {
  rewriteUrl, FEATURE_STEPS, SHORT_STEPS, stageName, ANCHORS, stageParts, FEATURE_PARTS, SHORT_PARTS,
  greetingHTML, detectActivity, copyProjectData, projectBlob, applyProjectFilters, byRecent
};
