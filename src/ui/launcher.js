/* ============================================================
   THE LAUNCHER — every module, by phase, on one page
   ------------------------------------------------------------
   This is the piece that lets the top bar stay small.

   StudioBinder's project overview is a launcher grid: a row per
   phase, a coloured phase tile, then a tile per module. That is how
   their 70px rail and 60px bar get away with listing four things and
   five — the complete map is one page, not permanent chrome. The
   arrangement is theirs; the hues, type and wording are this app's.

   It is built from src/data/navigation.json like the rest of the
   shell, so a module added there appears here with no edit. Three
   things it says that a grid of links does not:

   1. THE ICON. Each phase and each module carries a `icon` glyph in
      navigation.json — geometric and typographic, never emoji,
      because the studio is printed matter and a colour emoji is
      somebody else's UI pasted in. Rendered aria-hidden: it is a
      second read of the label, not a replacement for it.

   2. WHAT IS IN IT. Every tile reports the state of the real model
      behind it — scenes.js, shots.js, script.js, contacts.js,
      locations.js and the two blueprint blobs — so the map tells you
      where the work IS, not only where the pages are. Nothing here
      is a stored count: the whole snapshot is read once per render
      and every number is derived from it, which is the same rule
      that keeps the step list in JSON. A module with no probe simply
      renders no state line rather than inventing one.

      Reads only. The launcher must never write during a render: the
      idle-write assertion in verify is watching, and a map is not a
      thing that should change what it maps.

   3. WHERE YOU ARE. The page is matched back against the IA — the
      global rail entries as well as the phase modules — so the head
      says "YOU ARE HERE · Breakdown → Scene List" and the matching
      tile carries a hue rule, a THIS PAGE marker and aria-current.
      This is the launcher's other job. The complaint that started
      the rebuild was not "I cannot find the module", it was "I do
      not know where I am", and a map that does not show your own
      position answers the first question only.

   `status` is printed rather than hidden: a map that quietly showed
   equal tiles would be a lie the first click exposes. A planned tile
   is a <button> carrying data-action="module-planned", which
   shell.js already binds globally — it says what the module will do
   instead of navigating nowhere. No new handler, and nothing here
   knows what a toast is.
   ============================================================ */
import nav from '../data/navigation.json';
import { h } from '../lib/dom.js';
import { listScenes, elementIndex } from '../lib/scenes.js';
import { listShots, listFrames, listBoards, countEntries } from '../lib/shots.js';
import { loadScript, pageCount, formatPages } from '../lib/script.js';
import { listContacts, listCallSheets } from '../lib/contacts.js';
import { locationIndex, listMedia, listDayDates, shootDayOf, castOf } from '../lib/locations.js';
import '../styles/launcher.css';

const TOTAL = nav.phases.reduce((n, p) => n + p.modules.length, 0);
const BUILT = nav.phases.reduce(
  (n, p) => n + p.modules.filter((m) => m.status === 'built').length, 0);

/* The three blueprint-era blobs have no model module of their own —
   they are field bags read by the page that owns them. The strings
   are the same ones in store.js SCOPED_KEYS and hub.js, which is the
   existing precedent for naming them at the point of use. They are
   read here and never written; if one is ever renamed under a
   migration, this file reports "not started" rather than losing
   anything. */
const FEATURE_KEY = 'fms_filmmaker_combined_v1';
const SHORT_KEY   = 'fms_shortfilm_blueprint_v1';
const LIB_CALC_KEY = 'fms_library_calc_v1';
const DISSECT_KEY  = 'fms_dissect_v1';
const WORKBENCH_KEY = 'fms_workbench_v1';

/* ------------------------------------------------------------
   READING THE STUDIO
   ------------------------------------------------------------
   One snapshot per render. Every read is wrapped: a corrupt blob or
   a browser with storage switched off must cost the tile its state
   line, never the page — the console-error assertion is one of the
   things verify fails on, and the hub is the page a lost user lands
   on first.
   ------------------------------------------------------------ */

function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function blob(key) {
  return safe(() => {
    const raw = localStorage.getItem(key);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, {});
}

/** Does this stored value represent something the user actually wrote? */
function written(v) {
  if (v === true) return true;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(written);
  if (v && typeof v === 'object') return Object.values(v).some(written);
  return false;
}

/** How many distinct blueprint steps have anything in them.
    `map` turns a key prefix into a step ordinal; Volume II of the
    feature starts at 13, which is why it carries an offset. */
function stepsTouched(bag, map) {
  const seen = new Set();
  for (const [k, v] of Object.entries(bag)) {
    if (!written(v)) continue;
    for (const [re, offset] of map) {
      const m = k.match(re);
      if (m) { seen.add(parseInt(m[1], 10) + offset); break; }
    }
  }
  return seen.size;
}

/** Budget rows are flat `ci_<row>_<field>` keys; count the rows with
    anything on them rather than the keys, which over-counts by three. */
function costedRows(bag) {
  const rows = new Set();
  for (const [k, v] of Object.entries(bag)) {
    const m = k.match(/^ci_(\d+)_/);
    if (m && written(v)) rows.add(m[1]);
  }
  return rows.size;
}

function snapshot() {
  const scenes = safe(listScenes, []);
  const script = safe(loadScript, { elements: [], revisions: [], documents: [] });
  const dissect = safe(() => blob(DISSECT_KEY).mine, null) || {};
  const days = new Set(scenes.map(shootDayOf).filter(Boolean));
  const cast = new Set();
  scenes.forEach((s) => castOf(s).forEach((c) => cast.add(String(c).toLowerCase())));

  return {
    scenes,
    days,
    cast,
    tagged: scenes.filter((s) => Object.values(s.elements || {}).some((v) => v && v.length)).length,
    elements: safe(elementIndex, []).length,
    shots: safe(listShots, []).length,
    frames: safe(listFrames, []).length,
    boards: safe(listBoards, []),
    script,
    pages: safe(() => pageCount(script.elements), 0),
    contacts: safe(listContacts, []).length,
    callSheets: safe(listCallSheets, []).length,
    media: safe(listMedia, []).length,
    locations: safe(() => locationIndex(scenes), []).length,
    dates: Object.keys(safe(listDayDates, {})).length,
    feature: stepsTouched(blob(FEATURE_KEY), [[/^s(\d+)_/, 0], [/^v2s(\d+)_/, 12], [/^fc_v1_(\d+)/, 0], [/^fc_v2_(\d+)/, 12]]),
    short: stepsTouched(blob(SHORT_KEY), [[/^s(\d+)_/, 0], [/^ck_s(\d+)_/, 0]]),
    costed: costedRows(blob(LIB_CALC_KEY)),
    sequences: Array.isArray(dissect.sequences) ? dissect.sequences.length : 0,
    dissectStarted: written(dissect.thesis) || written(dissect.title) || written(dissect.engine),
    studied: Object.values(blob(WORKBENCH_KEY)).filter(written).length
  };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* A state is { kind, text }. `work` means this module holds something
   of the user's; `empty` means it is waiting; `ref` means it is
   reference material and emptiness is not a state it can be in. Three
   kinds rather than a boolean, because "no festivals saved" would be
   a nonsense thing to say about the glossary. */
const work = (text) => ({ kind: 'work', text });
const empty = (text) => ({ kind: 'empty', text });
const ref = (text) => ({ kind: 'ref', text });

/* Keyed by the module id in navigation.json. A module with no entry
   renders without a state line — honest silence rather than a
   confident "0", which for half of these would be wrong. */
const PROBES = {
  'feature-blueprint': (s) => (s.feature ? work(plural(s.feature, 'step started', 'steps started')) : empty('not started')),
  'short-blueprint':   (s) => (s.short ? work(plural(s.short, 'step started', 'steps started')) : empty('not started')),
  glossary:            () => ref('reference'),
  'case-studies':      (s) => (s.studied ? work(plural(s.studied, 'film worked', 'films worked')) : ref('reference · no notes yet')),
  dissection:          (s) => (s.sequences ? work(plural(s.sequences, 'sequence mapped', 'sequences mapped'))
                              : s.dissectStarted ? work('started') : empty('not started')),

  screenplay: (s) => (s.pages ? work(formatPages(s.pages) + ' pages written') : empty('no pages yet')),
  revisions:  (s) => (s.script.revisions.length ? work(plural(s.script.revisions.length, 'revision saved', 'revisions saved')) : empty('no revisions yet')),
  docs:       (s) => (s.script.documents.length ? work(plural(s.script.documents.length, 'document', 'documents')) : empty('no documents yet')),

  'scene-list': (s) => (s.scenes.length ? work(plural(s.scenes.length, 'scene', 'scenes')) : empty('no scenes yet')),
  breakdowns:   (s) => (s.tagged ? work(`${s.tagged} of ${s.scenes.length} tagged`)
                       : s.scenes.length ? empty('nothing tagged yet') : empty('needs scenes first')),
  elements:     (s) => (s.elements ? work(plural(s.elements, 'element', 'elements')) : empty('no elements yet')),
  stripboard:   (s) => (s.days.size ? work(plural(s.days.size, 'shoot day', 'shoot days'))
                       : s.scenes.length ? empty('not scheduled yet') : empty('needs scenes first')),
  sides:        (s) => (s.days.size ? work(plural(s.days.size, 'day of sides', 'days of sides')) : empty('needs a schedule')),
  reports:      (s) => (s.scenes.length ? work(plural(s.scenes.length, 'scene to report', 'scenes to report')) : empty('nothing to report yet')),

  'shot-list': (s) => (s.shots ? work(plural(s.shots, 'shot', 'shots')) : empty('no shots yet')),
  storyboard:  (s) => (s.frames ? work(plural(s.frames, 'frame', 'frames')) : empty('no frames yet')),
  lookbook:    (s) => {
    const entries = safe(() => countEntries(s.boards), 0);
    if (!s.boards.length) return empty('no boards yet');
    return work(`${plural(s.boards.length, 'board', 'boards')} · ${plural(entries, 'image', 'images')}`);
  },

  budget:   (s) => (s.costed ? work(plural(s.costed, 'line costed', 'lines costed')) : empty('nothing costed yet')),
  contacts: (s) => (s.contacts ? work(plural(s.contacts, 'contact', 'contacts')) : empty('no contacts yet')),
  calendar: (s) => (s.dates ? work(plural(s.dates, 'day dated', 'days dated'))
                   : s.days.size ? empty('no dates set') : empty('needs a schedule')),
  media:    (s) => (s.media ? work(plural(s.media, 'file', 'files')) : empty('no files yet')),

  locations:     (s) => (s.locations ? work(plural(s.locations, 'location', 'locations')) : empty('no locations yet')),
  'call-sheets': (s) => (s.callSheets ? work(plural(s.callSheets, 'call sheet', 'call sheets')) : empty('none yet')),
  dood:          (s) => (s.cast.size ? work(plural(s.cast.size, 'cast member', 'cast members')) : empty('no cast tagged'))
};

function stateOf(m, snap) {
  const probe = PROBES[m.id];
  if (!probe) return null;
  return safe(() => probe(snap), null);
}

/* ------------------------------------------------------------
   WHERE AM I
   ------------------------------------------------------------
   Same question shell.js answers for the phase bar, asked again
   here because the launcher is the surface with room to answer it in
   words. Two differences: the global rail entries count as places too
   (the hub is somewhere, and "nowhere on the map" is a worse answer
   than "Home"), and the filename is compared with `.html` stripped so
   the clean URLs that vercel.json and netlify.toml serve match as
   well as the built filenames do.
   ------------------------------------------------------------ */

const base = (p) => String(p || '').split('/').pop().toLowerCase().replace(/\.html$/, '') || 'index';

function whereAmI() {
  const here = base(location.pathname);
  const hash = location.hash;

  // A module whose fragment matches too — the exact answer.
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (!m.href) continue;
      const [file, frag] = m.href.split('#');
      if (base(file) !== here) continue;
      if (frag && '#' + frag !== hash) continue;
      return { phase, module: m };
    }
  }
  // No fragment match: the first module on this page still tells the
  // user which phase they are standing in, which is most of the answer.
  for (const phase of nav.phases) {
    for (const m of phase.modules) {
      if (m.href && base(m.href.split('#')[0]) === here) return { phase, module: m };
    }
  }
  for (const g of nav.global) {
    if (g.href && base(g.href) === here) return { phase: null, module: null, global: g };
  }
  return { phase: null, module: null };
}

/* ------------------------------------------------------------
   THE MARKUP
   ------------------------------------------------------------ */

function moduleTile(m, snap, at) {
  const planned = m.status === 'planned';
  const isHere = !!(at.module && at.module.id === m.id);
  const cls = '.lx-mod'
    + (planned ? '.is-planned' : '')
    + (m.status === 'partial' ? '.is-partial' : '')
    + (isHere ? '.is-here' : '');
  const el = h(planned ? `button${cls}` : `a${cls}`, planned
    ? { type: 'button', 'data-action': 'module-planned', 'data-module': m.id }
    : { href: m.href });
  if (isHere && !planned) el.setAttribute('aria-current', 'page');

  if (m.icon) el.append(h('span.lx-mod-icon', { text: m.icon, 'aria-hidden': 'true' }));
  el.append(
    h('span.lx-mod-label', { text: m.label }),
    h('span.lx-mod-purpose', { text: m.purpose })
  );

  const state = stateOf(m, snap);
  if (state) el.append(h(`span.lx-mod-state.is-${state.kind}`, { text: state.text }));

  if (m.status !== 'built') {
    el.append(h('span.lx-flag', { text: m.status === 'partial' ? 'PARTIAL' : 'SOON' }));
  }
  if (isHere) el.append(h('span.lx-mod-here', { text: 'THIS PAGE' }));

  const item = h('li.lx-mod-cell');
  item.append(el);
  return item;
}

function phaseRow(phase, snap, at) {
  const isHere = !!(at.phase && at.phase.id === phase.id);
  const row = h(`div.lx-row.sh-ph-${phase.hue}` + (isHere ? '.is-here' : ''));
  const built = phase.modules.filter((m) => m.status === 'built').length;
  const withWork = phase.modules.filter((m) => {
    const s = stateOf(m, snap);
    return s && s.kind === 'work';
  }).length;

  const tile = h('div.lx-phase');
  if (phase.icon) tile.append(h('span.lx-phase-icon', { text: phase.icon, 'aria-hidden': 'true' }));
  tile.append(
    h('span.lx-phase-label', { text: phase.label }),
    h('span.lx-phase-blurb', { text: phase.blurb }),
    h('span.lx-phase-count', { text: `${built} of ${phase.modules.length} ready` }),
    h('span.lx-phase-work', { text: withWork ? `${withWork} with work` : 'nothing here yet' })
  );

  const mods = h('ul.lx-mods', { 'aria-label': phase.label + ' modules' });
  phase.modules.forEach((m) => mods.append(moduleTile(m, snap, at)));

  row.append(tile, mods);
  return row;
}

/** The launcher section, ready to append to the hub. */
export function renderLauncher() {
  const snap = safe(snapshot, {});
  const at = safe(whereAmI, { phase: null, module: null });

  const sec = h('section#modules.section', { 'aria-labelledby': 'lxHeading' });
  const inner = h('div.section-inner');

  const worked = nav.phases.reduce((n, p) => n + p.modules.filter((m) => {
    const s = stateOf(m, snap);
    return s && s.kind === 'work';
  }).length, 0);

  const head = h('div.section-head');
  head.append(
    h('div.left', {}, [
      h('div.label', { text: 'THE MAP · EVERY MODULE BY PHASE' }),
      h('h2#lxHeading', {}, [
        document.createTextNode('Six phases, '),
        h('em', { text: `${TOTAL} modules.` })
      ]),
      h('p.deck', {
        text: 'A film moves through these in order, and so does the studio. '
            + 'Open any module directly; the ones still to come say so rather '
            + 'than pretending.'
      })
    ]),
    h('div.right', {}, [
      h('div', { text: `${BUILT} OF ${TOTAL} BUILT` }),
      h('div.lx-worked', { text: `${worked} HOLD WORK` }),
      hereLine(at)
    ])
  );

  const grid = h('nav.lx-grid', { 'aria-label': 'Every module, by phase' });
  nav.phases.forEach((p) => grid.append(phaseRow(p, snap, at)));

  inner.append(head, grid);
  sec.append(inner);
  return sec;
}

/** "YOU ARE HERE · Breakdown → Scene List", or the honest short
    version on a page that is not a module. */
function hereLine(at) {
  let trail = '';
  if (at.module) trail = at.phase.label + ' → ' + at.module.label;
  else if (at.global) trail = at.global.label;
  if (!trail) return null;
  const el = h('div.lx-here-line');
  el.append(
    h('span.lx-here-tag', { text: 'YOU ARE HERE' }),
    h('span.lx-here-trail', { text: trail })
  );
  return el;
}

export default { renderLauncher };
