/* ============================================================
   THE FILMMAKER'S STUDIO — HUB  (entry for index.html)
   ------------------------------------------------------------
   Port of the inline <script> that used to live at the bottom of
   legacy/index.html. Behaviour is unchanged where it counts:

     • EVERY storage key is byte-identical to the legacy hub.
       Users have saved work under these exact strings; the list
       in STORAGE below is the contract and must not drift.
     • The export/import JSON keeps its legacy field names, so a
       backup taken from the old page still imports here.

   Two things are deliberately better than the original:

     1. The global search index and the master index were two
        hand-written lists of steps, films and directors — 130
        literal rows that had already drifted from the pages they
        linked to (the legacy index was missing three steps and
        pointed two links at anchors that no longer existed).
        Both are now DERIVED from src/data/*.json, so they cannot
        drift from what the blueprint pages actually render.
        Only page-level anchors that have no data behind them
        (#treatment-ladder, #pitch-deck, #glossary …) are still
        listed by hand, in ANCHORS below.

     2. Links point at the new page filenames — feature.html,
        short.html, library.html. Activity entries written by the
        legacy hub carry the old `arunak-*.html` URLs, so they are
        remapped at render time (see rewriteUrl) rather than
        rewritten in storage.

   ZERO inline handlers: every interaction is a `data-action`
   attribute serviced by one delegate() listener per event type,
   so the page runs under a strict CSP.
   ============================================================ */

// ⚠ store.js FIRST — it patches Storage.prototype so that every
// `localStorage.getItem('fms_…')` scopes to the current project.
// Modules evaluate in import order; anything that reads localStorage
// before this line would read the wrong (unscoped) keys.
import { parseNum, fmtINR } from '../lib/money.js';
import { featureKeys, shortKeys, progressAgainst } from '../lib/blueprint-fields.js';
import Store from '../lib/store.js';
import {
  NOTE_PREFIX, buildBackup, downloadBackup, applyBackup, backupShape
} from '../lib/backup.js';
import { DRIVE_STATE_KEY } from '../lib/drive-sync.js';
import { mountShell } from '../ui/shell.js';
import { wireActionBar } from '../ui/actionbar.js';
import { renderLauncher, BUILT_MODULE_COUNT } from '../ui/launcher.js';

import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import '../lib/cloud.js';
import { registerSW, onInstallAvailable, promptInstall } from '../lib/pwa.js';
import { h, esc, delegate } from '../lib/dom.js';
import PDF from '../lib/pdf.js';

import featureData from '../data/steps.feature.json';
import shortData   from '../data/steps.short.json';
import films       from '../data/films.json';
import directors   from '../data/directors.json';
import rules       from '../data/rules.json';
import watchlist   from '../data/watchlist.json';
import festivals   from '../data/festivals.json';
import prodData    from '../data/steps.production.json';
import sample      from '../data/sample.dragon.json';
/* The plan's say over the hub (schema section 18 `features`, read by
   src/lib/plan-gate.js): `sample_only` shows the Dragon sample and no
   other project; `new_projects` off hides every way of making one.
   Nothing is deleted or moved — a film the plan hides is still on the
   device and reappears when the plan includes it. */
import PlanGate    from '../lib/plan-gate.js';

/* The sample project writes through the same models every page reads,
   so the ids and key shapes it produces cannot drift from the ones the
   app expects. `formatEighths` and `locationKey` are imported rather
   than re-implemented for that reason — a second copy of either is a
   second representation, and CLAUDE.md is explicit about the cost. */
import { formatEighths } from '../lib/scenes.js';
import { locationKey, locationLink } from '../lib/locations.js';


/* The theme toggle's tooltip, derived from the list it describes.
   It read "Theme — paper, sepia, ink" on three pages long after sepia
   was dropped and the order reversed: three hand-written copies of
   StudioUI.themeOrder(), which is the thing they were describing. */
function themeTitle() {
  const order = (StudioUI.themeOrder && StudioUI.themeOrder()) || [];
  return order.length ? 'Theme — ' + order.join(', ') : 'Theme';
}
// ============================================================
// STORAGE KEYS — byte-identical to the legacy hub. Do not touch.
// ============================================================
const PREF_KEY     = 'fms_studio_prefs_v1';
const FEATURE_KEY  = 'fms_filmmaker_combined_v1';
const SHORT_KEY    = 'fms_shortfilm_blueprint_v1';
const LIB_CALC_KEY = 'fms_library_calc_v1';
const FEAT_PREFS   = 'fms_filmmaker_prefs_v1';
const SHORT_PREFS  = 'fms_shortfilm_prefs_v1';
const LIB_PREFS    = 'fms_library_prefs_v1';
/* Named here but deliberately in no list on this page: see the note
   at the end of ALL_KEYS for why reset must not wipe it. */
const SYNC_CFG     = 'fms_supabase_cfg_v1';  // eslint-disable-line no-unused-vars
/* NOTE_PREFIX is imported from lib/backup.js rather than restated:
   a note's key is the one thing a backup file stores raw, so the
   prefix the exporter walks and the prefix reset sweeps have to be
   the same string by construction. */
const ACTIVITY_KEY = 'fms_studio_activity_v1';
const SCENES_KEY   = 'fms_scenes_v1';
const CONTACTS_KEY = 'fms_contacts_v1';
const SHOTS_KEY    = 'fms_shots_v1';
const SCRIPT_KEY   = 'fms_script_v1';
const LOCS_KEY     = 'fms_locations_v1';
const BENCH_KEY    = 'fms_workbench_v1';
const DISSECT_KEY  = 'fms_dissect_v1';
const FESTIVALS_KEY = 'fms_festivals_v1';
const SCRIPTGEN_KEY = 'fms_scriptgen_v1';
const SONGS_KEY     = 'fms_songs_v1';
const STORY_KEY     = 'fms_story_v1';
const VAULT_KEY     = 'fms_idea_vault_v1';
const EDIT_KEY      = 'fms_edit_v1';
const DELIVER_KEY   = 'fms_deliverables_v1';
/* The device-lock handle (src/lib/gate.js). In this reset list so a
   wiped studio forgets which session it held; deliberately NOT in
   GLOBAL_KEYS, for the reason the Drive pointer is not. */
const DEVICE_SESSION_KEY = 'fms_device_session_v1';
/* The invite code this browser entered with (src/lib/gate.js), same
   treatment and same reasons: a wiped studio forgets it, a backup
   never carries it. */
const CODE_PASS_KEY = 'fms_invite_code_v1';

const ALL_KEYS = [
  FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY,
  FEAT_PREFS, SHORT_PREFS, LIB_PREFS,
  PREF_KEY, ACTIVITY_KEY, SCENES_KEY, CONTACTS_KEY,
  SHOTS_KEY, SCRIPT_KEY, LOCS_KEY, BENCH_KEY, DISSECT_KEY, FESTIVALS_KEY,
  SCRIPTGEN_KEY, SONGS_KEY, STORY_KEY, VAULT_KEY, EDIT_KEY, DELIVER_KEY, DEVICE_SESSION_KEY, CODE_PASS_KEY,
  /* The Drive pointer, so "reset everything" also DISCONNECTS Drive.
     Without it a wiped studio stays connected to a file full of
     work, and the next keystroke pushes the empty studio over it.
     The Drive FILE is not touched by anything here — reconnecting
     finds it again and offers it back. Not the same decision as
     fms_ai_key_v1, which stays out of this list on purpose: that
     one is a credential, this one is a pointer at the work. */
  DRIVE_STATE_KEY
  /* SYNC_CFG (fms_supabase_cfg_v1) WAS in this list and deliberately
     is not any more. It holds {url, key} — WHICH Supabase project this
     browser talks to — and that is a DESTINATION, not work and not a
     pointer at work the way the Drive key above is. Wiping it never
     protected anything: reset is local-only, purgeProjectEverywhere()
     makes no cloud call, so the account's own copy survived either
     way. All the wipe achieved was making somebody re-fetch a project
     URL and a long anon key from a dashboard to reach work that had
     never gone anywhere.

     Keeping it is only safe BECAUSE reset now signs out — see
     resetAll(). Keeping the config and leaving the session alone
     would have been worse than either: the supabase-js session lives
     under `sb-<ref>-auth-token`, which is not an `fms_` key and
     nothing in this file has ever touched, so the next load would
     have pulled every account project straight back down and refilled
     a studio the user had just been told twice could not be
     recovered. */
];

/* PROJECT_KEYS and GLOBAL_KEYS used to be declared here. They are the
   BACKUP FORMAT'S schema — the map from a field name in the file to a
   storage key on disk — and the file now has a second reader (Drive
   sync) as well as a second writer, so they live in src/lib/backup.js
   with the builder and the applier that use them. Imported rather than
   restated: two copies of this map is two backup formats that agree
   until the day somebody adds a module to one of them.

   ALL_KEYS stayed above, because that one is the RESET list and reset
   belongs to this page. */

// ============================================================
// PAGES — the new filenames, and a map off the old ones.
// ============================================================
const FEATURE_URL = 'feature.html';
const SHORT_URL   = 'short.html';
const LIBRARY_URL = 'library.html';

const RENAMED = {
  'arunak-filmmaker-blueprint.html': FEATURE_URL,
  'arunak-shortfilm-blueprint.html': SHORT_URL,
  'arunak-filmmaker-library.html':   LIBRARY_URL
};

/** Activity rows saved by the legacy hub point at the old files. */
function rewriteUrl(url) {
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
const FEATURE_STEPS = [
  ...featureData.vol1, ...featureData.vol2,
  ...prodData.production, ...prodData.post
];
const PHASE_NAME = { 1: 'Story', 2: 'Pre-production', 3: 'Production', 4: 'Post-production' };
const SHORT_STEPS   = shortData.steps;

/** Strip authored markup so data HTML can be used as plain text. */
function plain(s) {
  return String(s ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
function clip(s, n = 104) {
  const t = plain(s);
  return t.length > n ? t.slice(0, n - 1).replace(/[\s,;·]+$/, '') + '…' : t;
}
/** "The Spark." → "The Spark" */
function title(s) { return plain(s).replace(/\.$/, ''); }

const WATCH_FILMS = watchlist.reduce((n, w) => n + (w.films ? w.films.length : 0), 0);

const STATS = [
  { num: FEATURE_STEPS.length, lab: 'Feature steps', cls: ''  },
  { num: SHORT_STEPS.length,   lab: 'Short steps',   cls: 's' },
  { num: films.length,         lab: 'Films analyzed', cls: 'l' },
  { num: directors.length,     lab: 'Directors',     cls: 'l' },
  { num: rules.length,         lab: 'Craft rules',   cls: 'l' },
  { num: WATCH_FILMS,          lab: 'Watch list',    cls: 'g' }
];

// ------------------------------------------------------------
// ANCHORS — the only hand-kept links left. These are page
// sections with no row in src/data behind them; everything else
// on this page is generated from the JSON.
// ------------------------------------------------------------
const ANCHORS = {
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
    { label: 'Equipment Calculator',               hash: '#equipment', num: 'IV',  snippet: 'Chennai 2024-25 rate ranges — build a kit, get a daily total' },
    { label: `${WATCH_FILMS}-Film Watch List`,     hash: '#watch',     num: 'V',   snippet: 'Three films to study per blueprint step' }
  ]
};

// ------------------------------------------------------------
// SEARCH INDEX — derived, never hand-written.
// ------------------------------------------------------------
const SEARCH_INDEX = [
  ...FEATURE_STEPS.map(s => ({
    kind: 'feature',
    label: `${s.num} · ${title(s.titlePlain || s.title)}`,
    snippet: `${PHASE_NAME[s.vol] || 'Story'} · ${clip(s.deck)}`,
    url: `${FEATURE_URL}#${s.id}`
  })),
  ...ANCHORS.feature.map(a => ({
    kind: 'feature', label: a.label, snippet: a.snippet, url: FEATURE_URL + a.hash
  })),
  ...SHORT_STEPS.map(s => ({
    kind: 'shorts',
    label: `${s.num} · ${title(s.titlePlain || s.title)}`,
    snippet: clip(s.deck),
    url: `${SHORT_URL}#${s.id}`
  })),
  ...(shortData.beats || []).map(b => ({
    kind: 'shorts',
    label: `Beat ${b.num} · ${b.name}`,
    snippet: `${b.positionLabel || ''} ${clip(b.description || b.summary)}`.trim(),
    url: `${SHORT_URL}#step-04`
  })),
  ...ANCHORS.shorts.map(a => ({
    kind: 'shorts', label: a.label, snippet: a.snippet, url: SHORT_URL + a.hash
  })),
  ...films.map(f => ({
    kind: 'library',
    label: `${f.title} (${f.year})`,
    snippet: `${f.director} · ${clip(f.lesson)}`,
    url: `${LIBRARY_URL}#films`
  })),
  ...directors.map(d => ({
    kind: 'library',
    label: d.name,
    snippet: `${d.archetype} · ${clip(d.signature)}`,
    url: `${LIBRARY_URL}#directors`
  })),
  ...rules.map(r => ({
    kind: 'library',
    label: `Rule ${r.n} · ${clip(r.text, 48)}`,
    snippet: `${plain(r.text)} — ${r.attribution}`,
    url: `${LIBRARY_URL}#rules`
  })),
  ...watchlist.map(w => ({
    kind: 'library',
    label: `Watch list · ${w.heading}`,
    snippet: `${w.label} · ${w.films.map(f => f.title).join(' · ')}`,
    url: `${LIBRARY_URL}#watch`
  })),
  ...(festivals.festivals || []).map(f => ({
    kind: 'shorts',
    label: f.name,
    snippet: `Tier ${f.tier} · ${f.country} · ${clip(f.description)}`,
    url: `${SHORT_URL}#step-10`
  })),
  ...ANCHORS.library.map(a => ({
    kind: 'library', label: a.label, snippet: a.snippet, url: LIBRARY_URL + a.hash
  }))
];

// ------------------------------------------------------------
// MASTER INDEX — same source, grouped for the page.
// The short blueprint's JSON carries no phase grouping, so the
// three phases are expressed as step ranges here (the one place
// that knowledge lives).
// ------------------------------------------------------------
const SHORT_PHASES = [
  { label: 'PRE-SCRIPT', from: 1,  to: 5  },
  { label: 'SCRIPT',     from: 6,  to: 8  },
  { label: 'PRODUCTION', from: 9,  to: 11 }
];

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out;
}

// ============================================================
// SMALL UTILITIES (ported verbatim)
// ============================================================
function parseStorage(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch (e) { return {}; }
}
function relTime(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff / 60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff / 3600000) + 'h ago';
  if (diff < 604800000) return Math.floor(diff / 86400000) + 'd ago';
  const d = new Date(ts);
  return (d.getMonth() + 1) + '/' + d.getDate();
}
function fmtRelDate(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  return relTime(t);
}
const $ = (sel) => document.querySelector(sel);

// ============================================================
// MARKUP
// ============================================================
function toolbarMarkup() {
  /* NO WORDMARK. "Arunak" used to sit at the head of this strip,
     beside a breadcrumb one row above it that already read
     "Studio › …" — the same information twice, in the one place on the
     page where space is permanent. The colophon's byline at the foot
     of the page is where the curator's name belongs.

     The six section links below are still built here and are still
     this page's own. shell.js lifts them into an "on this page" menu
     on the end of the breadcrumb; see buildPageNav() in shell.js for
     why they are discovered there rather than declared. */
  return h('div.toolbar', {
    html: `
      <a class="nav-link" href="#projects">Projects</a>
      <a class="nav-link" href="#doors">Blueprints</a>
      <a class="nav-link" href="#start">Start</a>
      <a class="nav-link" href="#tools">Tools</a>
      <a class="nav-link" href="#index">Index</a>
      <a class="nav-link" href="#activity">Activity</a>
      <div class="switcher-wrap">
        <button class="project-switcher empty" id="projectSwitcherBtn"
                data-action="toggle-switcher" title="Switch project" aria-haspopup="true" aria-expanded="false">
          <span class="ps-label" id="projectSwitcherLabel">— NO PROJECT —</span>
          <span class="ps-caret" aria-hidden="true">▾</span>
        </button>
        <div class="switcher-dropdown" id="switcherDropdown"></div>
      </div>
      <button class="btn icon-btn" data-action="toggle-theme" id="darkBtn" title="${themeTitle()}">◐</button>
      <button class="btn" data-action="install-app" id="installBtn" title="Install the Studio as an app" hidden>⇣ INSTALL</button>
      <div class="tb-menu align-right" data-tb-backup>
        <button class="btn tb-menu-btn" type="button" data-action="tb-menu-toggle"
                aria-expanded="false" aria-haspopup="true" aria-controls="tbm-backup">
          <span>Backup</span><span class="tb-caret" aria-hidden="true">▾</span>
        </button>
        <div class="tb-menu-panel" id="tbm-backup" hidden role="menu">
          <button class="tb-item" type="button" data-action="export-all" role="menuitem"
                  title="Every project, not just the open one">
            <span class="tb-item-label">Export everything</span><span class="tb-item-hint">.json</span>
          </button>
          <button class="tb-item" type="button" data-action="import-all" role="menuitem">
            <span class="tb-item-label">Import a backup</span>
          </button>
          <button class="tb-item" type="button" data-action="pdf-overview" role="menuitem"
                  title="The studio overview as a paginated A4 document">
            <span class="tb-item-label">Studio overview</span><span class="tb-item-hint">.pdf</span>
          </button>
          <div class="tb-sep" role="separator"></div>
          <button class="tb-item is-danger" type="button" data-action="reset-all" role="menuitem">
            <span class="tb-item-label">Erase everything</span>
          </button>
        </div>
      </div>
      <input type="file" id="importAllFile" accept=".json" class="visually-hidden" data-action="import-file" aria-label="Import a studio backup">
      <div class="toolbar-stripe" aria-hidden="true"></div>`
  });
}

function heroMarkup() {
  const stats = STATS.map(s =>
    `<div class="hero-stat${s.cls ? ' ' + s.cls : ''}"><div class="num">${s.num}</div><div class="lab">${esc(s.lab)}</div></div>`
  ).join('');
  return h('section#top.hero', {
    html: `
      <div class="hero-inner">
        <div class="hero-top">
          <span class="hero-vol">A working desk for the working filmmaker</span>
          <span class="hero-edition">EDITION 01 · CHENNAI · MMXXVI</span>
        </div>

        <h1><span class="light">FilmMaker</span><br>Studio.</h1>

        <p class="hero-deck">Three companion blueprints, one reference library. Build a <em>feature</em>, draft a <em class="s">short</em>, study the <em class="g">craft</em> — all from one desk.</p>

        <!-- Two destinations, one of them filled. Both are sections of
             this page that the toolbar already links to, so this adds a
             pair of buttons rather than a pair of pages: the hub's own
             nav is a row of six quiet links and nothing in the hero
             said what to do first. One CTA per view is the rule in
             modules.css, which is why only the first is .primary. -->
        <div class="hero-cta">
          <a class="btn primary" href="#doors">Explore the blueprints<span class="arrow" aria-hidden="true">→</span></a>
          <a class="btn" href="#start">How it works</a>
        </div>

        <div class="resume-card" id="resumeCard">
          <div class="lab">PICK UP WHERE YOU LEFT OFF</div>
          <!-- No inline colour here. This element carried an inline
               "color: var(--panel-ink)" as a stopgap until editorial.css
               grew a rule for .resume-card h2. That rule now exists and
               reads the SKIN's slab ink, and an inline style beats every
               stylesheet, so the stopgap had quietly become the bug:
               light panel ink on a light slab, under every skin whose
               slab is light. (No backticks in this comment — the markup
               around it is a JS template literal, and a stray one ends
               the string. That mistake cost a silent build failure and
               four phantom findings measured against a stale dist.) -->
          <h2 id="resumeTitle">—</h2>
          <p class="resume-meta" id="resumeBody">—</p>
          <div class="resume-actions" id="resumeActions"></div>
        </div>

        <div class="search-wrap">
          <!-- .search-field exists so the dropdown anchors to the INPUT.
               Anchored to .search-wrap, top:100% put the results below
               the whole block INCLUDING the hint line underneath, so a
               floating panel with a shadow rendered as a flat list a
               row further down than it should be. -->
          <div class="search-field">
          <input type="search" class="search-input" id="searchInput"
                 placeholder="Search steps, films, directors, glossary terms…"
                 autocomplete="off" spellcheck="false"
                 aria-label="Search the studio" role="combobox" aria-expanded="false"
                 aria-controls="searchResults" data-action="search">
          <span class="search-icon" aria-hidden="true">/</span>
          <div class="search-results" id="searchResults" role="listbox" aria-label="Search results"></div>
          </div>
          <p class="search-tip">Try <kbd>logline</kbd> · <kbd>vetrimaaran</kbd> · <kbd>fountain</kbd> · <kbd>festival</kbd> · <kbd>budget</kbd></p>
        </div>

        <div class="hero-stats">${stats}</div>
      </div>`
  });
}

function projectsMarkup() {
  return h('section#projects.projects-section', {
    html: `
      <div class="projects-inner">
        <div class="projects-head">
          <div>
            <div class="lab">SECTION 0 · YOUR PROJECTS</div>
            <h2>Your <em>projects.</em></h2>
            <p class="greeting-block" id="hubGreeting">A working desk for the working filmmaker.</p>
            <p class="deck">Every script, every blueprint lives under a project. Create one, then everything you fill in across all three blueprints saves under it. Switch between them anytime.</p>
          </div>
          <button class="btn primary" data-action="new-project">+ NEW PROJECT</button>
        </div>

        <!-- Standing control for device projects an account has not
             taken yet. Empty and hidden in the device namespace, which
             is every state npm run verify can reach. renderAdoptNotice() -->
        <div id="adoptNotice" hidden></div>

        <div class="projects-toolbar" id="projectsToolbar" hidden>
          <input type="search" class="projects-search" id="projectsSearch"
                 placeholder="Search projects by name…" data-action="filter-projects"
                 aria-label="Search projects by name">
          <div class="projects-filter" id="projectsFilter" role="group" aria-label="Filter projects by format">
            <button data-fmt="all" class="active" data-action="set-filter">ALL</button>
            <button data-fmt="feature" data-action="set-filter">FEATURE</button>
            <button data-fmt="short" data-action="set-filter">SHORT</button>
            <button data-fmt="documentary" data-action="set-filter">DOC</button>
            <button data-fmt="musicvideo" data-action="set-filter">MV</button>
            <button data-fmt="adfilm" data-action="set-filter">AD</button>
          </div>
          <select class="projects-sort" id="projectsSort" data-action="sort-projects" aria-label="Sort projects by">
            <option value="recent">↻ RECENT</option>
            <option value="alpha">A → Z</option>
            <option value="oldest">OLDEST</option>
          </select>
        </div>

        <div class="projects-grid" id="projectsGrid"></div>
      </div>`
  });
}

function doorsMarkup() {
  const featQl = [
    ['SPARK', '#step-01'], ['TREATMENT', '#treatment-ladder'],
    ['PITCH', '#pitch-deck'], ['SYNC', '#sync-section'], ['GLOSSARY', '#glossary']
  ];
  const shortQl = [
    ['SEED', '#step-01'], ['5 BEATS', '#step-04'],
    ['SCRIPT', '#step-07'], ['FESTIVALS', '#step-10'], ['GLOSSARY', '#glossary']
  ];
  const libQl = ANCHORS.library.map(a => [a.hash.slice(1).toUpperCase(), a.hash]);
  const ql = (base, pairs) =>
    pairs.map(([t, hash]) => `<a class="ql" href="${base}${hash}">${esc(t)}</a>`).join('');

  return h('section#doors.section', {
    html: `
      <div class="section-inner">
        <div class="section-head">
          <div class="left">
            <div class="label">SECTION I · THE BLUEPRINTS</div>
            <h2>Three <em class="f">doors.</em> <em class="s">Pick</em> a <em class="g">path.</em></h2>
            <p class="deck">Each blueprint is a self-contained working tool. Open one, work in it, save (data lives in your browser). Cross-link freely. Use EXPORT in the toolbar to back everything up at once.</p>
          </div>
          <div class="right">3 BLUEPRINTS</div>
        </div>

        <div class="doors">
          <div class="door">
            <div class="door-tag"><span class="door-num-circle">I</span> 4 PHASES · ${FEATURE_STEPS.length} STEPS</div>
            <h3>Feature Film<br><span class="light">Blueprint.</span></h3>
            <p class="door-sub">From the first "what if?" to "ROLL CAMERA." Story (Vol I) and Pre-Production (Vol II) joined into one continuous tool.</p>
            <ul class="door-contents">
              <li>Story: ${featureData.vol1.length} steps from spark to scene list</li>
              <li>Pre-prod: ${featureData.vol2.length} steps to tech recce</li>
              <li>Treatment Ladder, Pitch Deck, Sync</li>
              <li>HOD sign-off, Tanglish glosses</li>
            </ul>
            <div class="door-status">
              <div class="status-row"><span class="status-label">Project</span><span class="status-value" id="feat-title">—</span></div>
              <div class="status-row"><span class="status-label">Stage</span><span class="status-value" id="feat-stage">—</span></div>
              <div class="status-row"><span class="status-label">Progress</span><span class="status-value" id="feat-progress">0%</span></div>
              <div class="progress-track"><div class="progress-fill-bar" id="feat-bar" style="width:0%"></div></div>
            </div>
            <div class="door-quicklinks">${ql(FEATURE_URL, featQl)}</div>
            <a class="door-cta" href="${FEATURE_URL}"><span>OPEN BLUEPRINT</span><span class="arrow">→</span></a>
          </div>

          <div class="door shorts">
            <div class="door-tag"><span class="door-num-circle">II</span> ${SHORT_STEPS.length} STEPS · WITH SCRIPT EDITOR</div>
            <h3>Short Film<br><span class="light">Blueprint.</span></h3>
            <p class="door-sub">For films under 30 minutes. Compressed structure, structured script editor, Fountain export, festival strategy.</p>
            <ul class="door-contents">
              <li>${(shortData.beats || []).length}-Beat structure: Setup → Image</li>
              <li>Live screenplay editor with page count</li>
              <li>Fountain export (Final Draft, Highland)</li>
              <li>AI prompt generator + ${(festivals.festivals || []).length} festivals</li>
            </ul>
            <div class="door-status">
              <div class="status-row"><span class="status-label">Project</span><span class="status-value" id="short-title">—</span></div>
              <div class="status-row"><span class="status-label">Runtime</span><span class="status-value" id="short-runtime">—</span></div>
              <div class="status-row"><span class="status-label">Progress</span><span class="status-value" id="short-progress">0%</span></div>
              <div class="progress-track"><div class="progress-fill-bar" id="short-bar" style="width:0%"></div></div>
            </div>
            <div class="door-quicklinks">${ql(SHORT_URL, shortQl)}</div>
            <a class="door-cta" href="${SHORT_URL}"><span>OPEN BLUEPRINT</span><span class="arrow">→</span></a>
          </div>

          <div class="door library">
            <div class="door-tag"><span class="door-num-circle">III</span> REFERENCE COMPANION</div>
            <h3>The Filmmaker's<br><span class="light">Library.</span></h3>
            <p class="door-sub">A curated reference: Tamil &amp; Indian films analyzed for craft, director archetypes, rules of thumb, equipment costs, watch list.</p>
            <ul class="door-contents">
              <li>${films.length} films, one extractable lesson each</li>
              <li>${directors.length} director archetypes</li>
              <li>${rules.length} craft rules + equipment calculator</li>
              <li>${WATCH_FILMS}-film watch list, mapped to each step</li>
            </ul>
            <div class="door-status">
              <div class="status-row"><span class="status-label">Equipment</span><span class="status-value" id="lib-calc">empty</span></div>
              <div class="status-row"><span class="status-label">Total / day</span><span class="status-value" id="lib-total">—</span></div>
              <div class="status-row"><span class="status-label">Type</span><span class="status-value">read-only ref</span></div>
            </div>
            <div class="door-quicklinks">${ql(LIBRARY_URL, libQl)}</div>
            <a class="door-cta" href="${LIBRARY_URL}"><span>OPEN LIBRARY</span><span class="arrow">→</span></a>
          </div>
        </div>
      </div>`
  });
}

function startMarkup() {
  return h('section#start.section.alt', {
    html: `
      <div class="section-inner">
        <div class="section-head">
          <div class="left">
            <div class="label">SECTION II · WHERE TO START</div>
            <h2>What are you <em class="f">trying to make?</em></h2>
            <p class="deck">If this is your first time here, pick the path that matches what's ahead. The blueprints are designed to be standalone — no order required.</p>
          </div>
          <div class="right">4 PATHS</div>
        </div>

        <div class="start-grid">
          <a class="start-card f" href="${FEATURE_URL}">
            <div class="question">PATH A · I want to make a feature</div>
            <h4>Feature Blueprint</h4>
            <p>Begin at Step 01: The Spark. Work through Vol I (Story) until you have a locked scene list, then continue into Vol II (Pre-Production).</p>
            <span class="arrow">OPEN  →</span>
          </a>
          <a class="start-card s" href="${SHORT_URL}">
            <div class="question">PATH B · I want to make a short</div>
            <h4>Short Film Blueprint</h4>
            <p>${SHORT_STEPS.length} steps for films under 30 minutes. Includes structured script editor and Fountain export. 4–8 weeks from idea to lock.</p>
            <span class="arrow">OPEN  →</span>
          </a>
          <a class="start-card l" href="${LIBRARY_URL}">
            <div class="question">PATH C · I want to study craft</div>
            <h4>Open the Library</h4>
            <p>${films.length} films analyzed for craft, ${directors.length} director archetypes, ${rules.length} rules of thumb, ${WATCH_FILMS}-film watch list. Read in any order.</p>
            <span class="arrow">OPEN  →</span>
          </a>
          <a class="start-card" href="${FEATURE_URL}">
            <div class="question">PATH D · I want a complete example</div>
            <h4>Load the ${esc(sample.title)} sample</h4>
            <p>Open the Feature Blueprint, click <strong>SAMPLE</strong> in the toolbar. Loads a fully filled blueprint for a ${sampleDays()}-day feature — or take the whole project, ${sample.scenes.length} scenes and a unit list included, from the projects panel. The worked examples inside the steps are still based on <em>Dragon</em>, <em>Vikram Vedha</em>, <em>96</em> and the 2023 Tamil thriller <em>Por Thozhil</em>.</p>
            <span class="arrow">OPEN  →</span>
          </a>
        </div>
      </div>`
  });
}

function toolsMarkup() {
  return h('section#tools.section', {
    html: `
      <div class="section-inner">
        <div class="section-head">
          <div class="left">
            <div class="label">SECTION III · TOOLS &amp; UTILITIES</div>
            <h2>Studio <em class="g">tools.</em></h2>
            <p class="deck">Cross-blueprint utilities and quick-jumps to commonly used features. Backup, restore, print, or jump straight to a tool.</p>
          </div>
          <div class="right">10 TOOLS</div>
        </div>

        <div class="tools-grid">
          <button class="tool-card" data-action="export-all">
            <div class="tool-icon">↓</div><h5>Export everything</h5>
            <p>Every project, preference and comment in one backup file.</p>
          </button>
          <button class="tool-card" data-action="import-all">
            <div class="tool-icon">↑</div><h5>Import everything</h5>
            <p>Restore from a previous backup. Replaces all current data.</p>
          </button>
          <button class="tool-card" data-action="print-hub">
            <div class="tool-icon">⎙</div><h5>Print this hub</h5>
            <p>Snapshot of the studio overview. Each blueprint has its own print mode.</p>
          </button>
          <button class="tool-card" data-action="reset-all">
            <div class="tool-icon">⌫</div><h5>Reset everything</h5>
            <p>Erase all studio data. Export first if you want to keep anything.</p>
          </button>
          <a class="tool-card f" href="${FEATURE_URL}#pitch-deck">
            <div class="tool-icon">▦</div><h5>Auto Pitch Deck</h5>
            <p>10 slides built from your filled fields. Inside the Feature Blueprint. Exports as .pptx.</p>
          </a>
          <a class="tool-card" href="${LIBRARY_URL}#equipment">
            <div class="tool-icon">₹</div><h5>Equipment Calculator</h5>
            <p>Chennai 2024-25 rate ranges. Build a kit, get a daily-rate total.</p>
          </a>
          <a class="tool-card s" href="${SHORT_URL}#step-08">
            <div class="tool-icon">.fnt</div><h5>Fountain Export</h5>
            <p>Export your short as Fountain — opens in Final Draft, Highland.</p>
          </a>
          <a class="tool-card f" href="${FEATURE_URL}#sync-section">
            <div class="tool-icon">↻</div><h5>Sync &amp; backup</h5>
            <p>Sign in to keep your projects in step across devices.</p>
          </a>
          <a class="tool-card s" href="${SHORT_URL}#step-08">
            <div class="tool-icon">AI</div><h5>AI Prompt Generator</h5>
            <p>Build prompts for Claude / ChatGPT from your blueprint data.</p>
          </a>
          <a class="tool-card" href="${LIBRARY_URL}#watch">
            <div class="tool-icon">▶</div><h5>Watch List by Step</h5>
            <p>Three films to study per blueprint step. ${WATCH_FILMS} films total.</p>
          </a>
        </div>

        <div class="data-card">
          <div class="left">
            <div class="lab">YOUR DATA</div>
            <p id="storageBytes">Computing storage…</p>
          </div>
          <div class="right">
            <button class="mb" data-action="export-all">DOWNLOAD BACKUP</button>
            <button class="mb" data-action="privacy-note">PRIVACY NOTE</button>
          </div>
        </div>
      </div>`
  });
}

// ---- master index, built from the same JSON the pages render ----
function tocItem(base, hash, num, label, check) {
  return `<li><a href="${base}${hash}"><span class="num">${esc(num)}</span>${esc(label)}` +
         (check ? `<span class="check" data-tcheck="${esc(check)}">✓</span>` : '') +
         `</a></li>`;
}
function tocGroup(label, items) {
  return `<div class="toc-group"><div class="toc-group-label">${esc(label)}</div><ul class="toc-list">${items.join('')}</ul></div>`;
}

function indexMarkup() {
  const featVol1 = tocGroup('VOL I · STORY', featureData.vol1.map(s =>
    tocItem(FEATURE_URL, '#' + s.id, s.num, title(s.titlePlain || s.title), 'feat-' + s.num)));
  const featVol2 = tocGroup('VOL II · PRE-PRODUCTION', featureData.vol2.map(s =>
    tocItem(FEATURE_URL, '#' + s.id, s.num, title(s.titlePlain || s.title), 'feat-' + s.num)));
  const featExtras = tocGroup('EXTRAS', ANCHORS.feature.map(a =>
    tocItem(FEATURE_URL, a.hash, '··', a.label)));

  const shortGroups = SHORT_PHASES.map(ph => tocGroup(ph.label,
    SHORT_STEPS
      .filter(s => { const n = parseInt(s.num, 10); return n >= ph.from && n <= ph.to; })
      .map(s => tocItem(SHORT_URL, '#' + s.id, s.num, title(s.titlePlain || s.title), 'short-' + s.num))
  )).join('');
  const shortExtras = tocGroup('EXTRAS', ANCHORS.shorts.map(a =>
    tocItem(SHORT_URL, a.hash, '··', a.label)));

  const libSections = tocGroup('SECTIONS', ANCHORS.library.map(a =>
    tocItem(LIBRARY_URL, a.hash, a.num, a.label)));
  const libFilms = tocGroup('FILMS ANALYZED', chunk(films.map(f => f.title), 3).map(row =>
    tocItem(LIBRARY_URL, '#films', '··', row.join(' · '))));
  const libDirectors = tocGroup('DIRECTORS', chunk(directors.map(d => d.name), 2).map(row =>
    tocItem(LIBRARY_URL, '#directors', '··', row.join(' · '))));

  const stepCount = FEATURE_STEPS.length + SHORT_STEPS.length;

  return h('section#index.section.dark-bg', {
    html: `
      <div class="section-inner">
        <div class="section-head">
          <div class="left">
            <div class="label">SECTION IV · MASTER INDEX</div>
            <h2>The full <em class="g">index.</em></h2>
            <p class="deck">Every step and section across all three documents, in one place. Items with a <strong>✓</strong> are complete in your data, <strong>◐</strong> means started. Click any to jump straight in.</p>
          </div>
          <div class="right">${stepCount} STEPS · ${ANCHORS.library.length} LIBRARY SECTIONS</div>
        </div>

        <div class="index-grid">
          <div class="index-col">
            <h4>Feature Blueprint</h4>
            <p class="sub">Vols I &amp; II · ${FEATURE_STEPS.length} steps</p>
            ${featVol1}${featVol2}${featExtras}
          </div>
          <div class="index-col shorts">
            <h4>Short Blueprint</h4>
            <p class="sub">${SHORT_STEPS.length} steps · with script editor</p>
            ${shortGroups}${shortExtras}
          </div>
          <div class="index-col library">
            <h4>The Library</h4>
            <p class="sub">Reference companion · ${ANCHORS.library.length} sections</p>
            ${libSections}${libFilms}${libDirectors}
          </div>
        </div>
      </div>`
  });
}

function activityMarkup() {
  return h('section#activity.section.alt', {
    html: `
      <div class="section-inner">
        <div class="section-head">
          <div class="left">
            <div class="label">SECTION V · ACTIVITY LOG</div>
            <h2>What you've <em class="f">touched.</em></h2>
            <p class="deck">A timeline of your recent edits across all three blueprints. Updates whenever you save in any blueprint. Click an entry to jump back.</p>
          </div>
          <div class="right" id="activityCount">0 ENTRIES</div>
        </div>

        <div class="activity-list" id="activityList">
          <div class="activity-empty">No activity yet. Open a blueprint and start filling things in. Activity updates whenever you save.</div>
        </div>

        <div class="activity-actions">
          <button class="mini-btn" data-action="refresh-activity">↻ REFRESH</button>
          <button class="mini-btn danger" data-action="clear-activity">CLEAR LOG</button>
        </div>
      </div>`
  });
}

function finalMarkup() {
  return h('section.final-page', {
    html: `
      <div class="final-inner">
        <p class="quote">"A studio is not a building. It is the pattern of <span class="feature">attention</span>, <span class="shorts">decisions</span>, and <span class="library">study</span> a working filmmaker keeps."</p>
        <div class="signature">THE FILMMAKER'S STUDIO · CURATED BY <span>ARUNAK</span></div>
      </div>`
  });
}

function modalMarkup() {
  return h('div#projectModal.modal-overlay', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'pmHeading',
    html: `
      <form class="modal" id="projectForm">
        <button type="button" class="modal-close" data-action="close-project-modal" title="Close" aria-label="Close">×</button>
        <h3 id="pmHeading">New <em>project.</em></h3>
        <p class="deck">A project is the home for one film. Title and format. You can change the title later — format stays.</p>

        <label for="pmTitle">PROJECT TITLE</label>
        <input type="text" id="pmTitle" placeholder="e.g. Por Thozhil, Untitled Thriller…" maxlength="120" required>

        <label for="pmFormat">FORMAT</label>
        <select id="pmFormat">
          <option value="feature">Feature film</option>
          <option value="short">Short film</option>
          <option value="documentary">Documentary</option>
          <option value="musicvideo">Music video</option>
          <option value="adfilm">Ad film</option>
        </select>

        <div class="modal-actions">
          <button type="button" class="mbtn" data-action="close-project-modal">CANCEL</button>
          <button type="submit" class="mbtn primary" id="pmSubmit">CREATE</button>
        </div>
      </form>`
  });
}

function render() {
  const app = document.getElementById('app');
  if (!app) throw new Error('#app not found');
  const main = h('main#main');
  main.append(
    heroMarkup(), projectsMarkup(),
    // The map before the detail: the launcher answers "what is in here
    // and where do I go", the doors that follow answer "how far am I in
    // the three I actually use". Different questions, and the map is
    // the one a new arrival needs first.
    renderLauncher(), doorsMarkup(),
    startMarkup(), toolsMarkup(), indexMarkup(),
    activityMarkup(), finalMarkup()
  );
  app.append(toolbarMarkup(), main, modalMarkup());
}

// ============================================================
// THEME
// ============================================================
function toggleDark() {
  StudioUI.cycleTheme();
}
function syncThemeIcon() {
  const darkBtn = document.getElementById('darkBtn');
  if (!darkBtn) return;
  const cur = document.body.classList.contains('dark') ? 'ink' : 'paper';
  darkBtn.textContent = cur === 'ink' ? '☀' : '◐';
}

// ============================================================
// GREETING
// ============================================================
function renderGreeting() {
  const el = document.getElementById('hubGreeting');
  if (!el) return;
  const projects = Store.listProjects();
  const cur = Store.currentProject();
  const hour = new Date().getHours();
  const greet = hour < 5 ? 'Working late' : hour < 12 ? 'Good morning'
              : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Working late';
  if (projects.length === 0) {
    el.innerHTML = greet + '. <strong>The desk is empty</strong> — what are we making?';
  } else if (cur) {
    el.innerHTML = greet + '. Active project: <strong>' + esc(cur.title) + '</strong> · ' + projects.length + ' total.';
  } else {
    el.innerHTML = greet + '. <strong>' + projects.length + ' project' + (projects.length === 1 ? '' : 's') +
                   ' on the desk.</strong> Pick one to keep working.';
  }
}

// ============================================================
// PROGRESS — read straight out of each blueprint's local data
// ============================================================
function computeFeatureStatus() {
  const data = parseStorage(FEATURE_KEY);
  const keys = Object.keys(data);
  if (keys.length === 0) return { pct: 0, title: '', stage: 'not started', stepsDone: {}, lastEditedStep: null };
  let total = 0, filled = 0;
  const stepsDone = {};
  keys.forEach(k => {
    if (k.startsWith('fc_v1_')) { stepsDone['feat-' + k.slice(6)] = !!data[k]; }
    if (k.startsWith('fc_v2_')) {
      const n = parseInt(k.slice(6), 10);
      if (!isNaN(n)) stepsDone['feat-' + String(n + 12).padStart(2, '0')] = !!data[k];
    }
    const m1 = k.match(/^s(\d+)_/);
    const m2 = k.match(/^v2s(\d+)_/);
    const b  = k.match(/^b(\d+)$/);
    if (m1 && data[k] && String(data[k]).trim()) {
      const n = String(m1[1]).padStart(2, '0');
      stepsDone['feat-' + n] = stepsDone['feat-' + n] || 'partial';
    }
    if (m2 && data[k] && String(data[k]).trim()) {
      const n = String(parseInt(m2[1], 10) + 12).padStart(2, '0');
      stepsDone['feat-' + n] = stepsDone['feat-' + n] || 'partial';
    }
    if (b && data[k] && String(data[k]).trim()) stepsDone['feat-08'] = stepsDone['feat-08'] || 'partial';

  });
  /* The denominator is the fields the blueprint DECLARES, not the
     keys that happen to be saved. Counting the saved blob meant a
     project with eleven filled fields read 100% complete, and the
     resume card offered it as "ready to shoot" while the dashboard
     said 3% for the same data. See src/lib/blueprint-fields.js. */
  const prog = progressAgainst(featureKeys(), data);
  total = prog.total; filled = prog.done;
  const pct = prog.pct;
  let stage = 'not started';
  if (pct > 0 && pct < 25) stage = 'Vol I early';
  else if (pct < 50) stage = 'Vol I · Story';
  else if (pct < 80) stage = 'Vol II · Pre-prod';
  else if (pct < 100) stage = 'Final lock';
  else stage = 'ready to shoot';
  let lastStepNum = null;
  Object.keys(stepsDone).forEach(k => {
    const match = k.match(/feat-(\d+)/);
    if (!match) return;
    const n = parseInt(match[1], 10);
    if (lastStepNum === null || n > lastStepNum) lastStepNum = n;
  });
  return {
    pct,
    title: data.meta_title || data.v1_title || '',
    stage,
    stepsDone,
    lastEditedStep: lastStepNum ? 'step-' + String(lastStepNum).padStart(2, '0') : null
  };
}

function computeShortStatus() {
  const data = parseStorage(SHORT_KEY);
  const keys = Object.keys(data);
  if (keys.length === 0) return { pct: 0, title: '', runtime: '', stepsDone: {}, lastEditedStep: null };
  let total = 0, filled = 0;
  const stepsDone = {};
  keys.forEach(k => {
    const m  = k.match(/^s(\d+)_/);
    const cm = k.match(/^ck_s(\d+)_/);
    const bm = k.match(/^b(\d+)_/);
    const pm = k.match(/^p_/);
    const lm = k.match(/^ck_lock_/);
    if (m && data[k] && String(data[k]).trim()) {
      const n = String(m[1]).padStart(2, '0');
      stepsDone['short-' + n] = stepsDone['short-' + n] || 'partial';
    }
    if (cm && data[k] === true) {
      const n = String(cm[1]).padStart(2, '0');
      stepsDone['short-' + n] = true;
    }
    if (bm && data[k] && String(data[k]).trim()) stepsDone['short-04'] = stepsDone['short-04'] || 'partial';
    if (pm && data[k] && String(data[k]).trim()) stepsDone['short-09'] = stepsDone['short-09'] || 'partial';
    if (lm && data[k] === true) stepsDone['short-11'] = true;

    if (k.startsWith('_')) {
      if (k === '_sceneMap' && Array.isArray(data[k])) {
        data[k].forEach(row => {
          Object.values(row).forEach(v => { total++; if (v && String(v).trim()) filled++; });
        });
        if (data[k].some(r => Object.values(r).some(v => v && String(v).trim()))) {
          stepsDone['short-06'] = stepsDone['short-06'] || 'partial';
        }
      }
      if (k === '_script' && Array.isArray(data[k])) {
        data[k].forEach(scene => {
          total++; if (scene.slug) filled++;
          total++; if (scene.action) filled++;
          (scene.dialogues || []).forEach(d => { total++; if (d.line) filled++; });
        });
        if (data[k].some(s => s.slug || s.action || (s.dialogues || []).some(d => d.line))) {
          stepsDone['short-07'] = stepsDone['short-07'] || 'partial';
        }
      }
      return;
    }
  });
  /* Same correction as the feature blueprint: the static fields are
     counted against what the SHORT blueprint declares, not against
     what happens to be saved. The dynamic rows above (script scenes,
     dialogue lines) genuinely have no fixed denominator and keep
     adding to both sides, which is the short editor's own scoring. */
  {
    const st = progressAgainst(shortKeys(), data);
    total += st.total; filled += st.done;
  }
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  let lastStepNum = null;
  Object.keys(stepsDone).forEach(k => {
    const match = k.match(/short-(\d+)/);
    if (!match) return;
    const n = parseInt(match[1], 10);
    if (lastStepNum === null || n > lastStepNum) lastStepNum = n;
  });
  return {
    pct,
    title: data.meta_title || '',
    runtime: data.meta_runtime || '',
    stepsDone,
    lastEditedStep: lastStepNum ? 'step-' + String(lastStepNum).padStart(2, '0') : null
  };
}

function computeLibraryStatus() {
  const calc = parseStorage(LIB_CALC_KEY);
  const seenRows = {};
  Object.keys(calc).forEach(k => {
    const m = k.match(/^ci_(\d+)_(\w+)$/);
    if (!m) return;
    seenRows[m[1]] = seenRows[m[1]] || {};
    seenRows[m[1]][m[2]] = calc[k];
  });
  let count = 0, total = 0;
  Object.keys(seenRows).forEach(idx => {
    const r = seenRows[idx];
    // Was three unanchored suffix tests, the trap CLAUDE.md names:
    // `cr` matched "crew", a bare `l` matched "lens", `k` matched
    // "bank". library.js was fixed years-of-commits ago and this copy
    // never was, so the hub's budget figure and the calculator's
    // could disagree about identical data. One parser now, in lib.
    const days = parseNum(r.days);
    const rate = parseNum(r.rate);
    const sub = days * rate;
    if (sub > 0) { count++; total += sub; }
  });
  return { count, total };
}

// ============================================================
// STATUS RENDER
// ============================================================
let lastFeatStatus, lastShortStatus, lastLibStatus;

function updateStatus() {
  const f = computeFeatureStatus(); lastFeatStatus = f;
  $('#feat-title').textContent    = f.title || '—';
  $('#feat-stage').textContent    = f.stage || '—';
  $('#feat-progress').textContent = f.pct + '%';
  $('#feat-bar').style.width      = f.pct + '%';

  const s = computeShortStatus(); lastShortStatus = s;
  $('#short-title').textContent    = s.title || '—';
  $('#short-runtime').textContent  = s.runtime || '—';
  $('#short-progress').textContent = s.pct + '%';
  $('#short-bar').style.width      = s.pct + '%';

  const l = computeLibraryStatus(); lastLibStatus = l;
  $('#lib-calc').textContent  = l.count > 0 ? (l.count + ' items') : 'empty';
  $('#lib-total').textContent = l.total > 0 ? fmtINR(l.total) : '—';

  let bytes = 0, noteCount = 0;
  ALL_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) bytes += v.length;
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(NOTE_PREFIX)) {
      noteCount++;
      bytes += (localStorage.getItem(key) || '').length;
    }
  }
  const kb = (bytes / 1024).toFixed(1);
  const parts = [];
  if (f.pct > 0 || f.title) parts.push('feature blueprint');
  if (s.pct > 0 || s.title) parts.push('short blueprint');
  if (l.count > 0) parts.push('equipment list (' + l.count + ' items)');
  if (noteCount > 0) parts.push(noteCount + ' private notes');
  const summary = parts.length
    ? 'Tracked: ' + parts.join(', ') + '. '
    : 'No projects yet — open a blueprint to start. ';
  $('#storageBytes').textContent = summary + 'Total local storage: ' + kb + ' KB.';

  updateResume(f, s);
  updateIndexChecks(f, s);
}

function resumeBtn(href, label, alt) {
  return h('a', { href, class: 'resume-btn' + (alt ? ' alt' : ''), text: label });
}

function updateResume(f, s) {
  const card    = $('#resumeCard');
  const heading = $('#resumeTitle');
  const body    = $('#resumeBody');
  const actions = $('#resumeActions');
  actions.textContent = '';

  const featActive  = f.pct > 0 || f.title;
  const shortActive = s.pct > 0 || s.title;
  if (!featActive && !shortActive) { card.classList.remove('has-data'); return; }
  card.classList.add('has-data');

  const primary = ((f.pct >= s.pct && featActive) || !shortActive) ? 'feature' : 'short';

  if (primary === 'feature') {
    heading.textContent = f.title || 'Untitled feature';
    body.innerHTML = '<strong>' + esc(f.stage) + '</strong> · ' + f.pct + '% complete' +
      (f.lastEditedStep ? ' · last touched <strong>' + esc(f.lastEditedStep) + '</strong>' : '');
    actions.append(resumeBtn(FEATURE_URL + (f.lastEditedStep ? '#' + f.lastEditedStep : ''), 'CONTINUE FEATURE  →'));
    if (shortActive) {
      actions.append(resumeBtn(SHORT_URL + (s.lastEditedStep ? '#' + s.lastEditedStep : ''), '→ Switch to Short', true));
    }
  } else {
    heading.textContent = s.title || 'Untitled short';
    body.innerHTML = (s.runtime ? '<strong>' + esc(s.runtime) + '</strong> · ' : '') + s.pct + '% complete' +
      (s.lastEditedStep ? ' · last touched <strong>' + esc(s.lastEditedStep) + '</strong>' : '');
    actions.append(resumeBtn(SHORT_URL + (s.lastEditedStep ? '#' + s.lastEditedStep : ''), 'CONTINUE SHORT  →'));
    if (featActive) {
      actions.append(resumeBtn(FEATURE_URL + (f.lastEditedStep ? '#' + f.lastEditedStep : ''), '→ Switch to Feature', true));
    }
  }
}

function updateIndexChecks(f, s) {
  document.querySelectorAll('[data-tcheck]').forEach(el => {
    const k = el.getAttribute('data-tcheck');
    const isComplete = f.stepsDone[k] === true || s.stepsDone[k] === true;
    const isPartial  = f.stepsDone[k] || s.stepsDone[k];
    el.classList.toggle('done', !!isPartial);
    if (isComplete) { el.textContent = '✓'; el.style.opacity = ''; }
    else if (isPartial) { el.textContent = '◐'; el.style.opacity = '0.6'; }
    else { el.textContent = '✓'; el.style.opacity = ''; }
  });
}

// ============================================================
// GLOBAL SEARCH
// ============================================================
let activeSearchIdx = -1;
let visibleResults = [];

const KIND_LABEL = { feature: 'FEATURE BLUEPRINT', shorts: 'SHORT BLUEPRINT', library: 'LIBRARY' };

function performSearch(raw) {
  const results = $('#searchResults');
  const input = $('#searchInput');
  const q = String(raw || '').trim().toLowerCase();
  activeSearchIdx = -1;
  if (!q) {
    results.classList.remove('open');
    results.textContent = '';
    visibleResults = [];
    if (input) input.setAttribute('aria-expanded', 'false');
    return;
  }
  const tokens = q.split(/\s+/);
  const matches = SEARCH_INDEX.map(item => {
    const text = (item.label + ' ' + item.snippet + ' ' + item.kind).toLowerCase();
    let score = 0;
    tokens.forEach(t => {
      if (text.includes(t)) score++;
      if (item.label.toLowerCase().includes(t)) score += 2;
    });
    return { item, score };
  }).filter(r => r.score >= tokens.length).sort((a, b) => b.score - a.score).slice(0, 12);

  visibleResults = matches.map(m => m.item);
  if (input) input.setAttribute('aria-expanded', 'true');

  if (!matches.length) {
    results.innerHTML = '<div class="search-empty">No results. Try simpler words — "logline", "vetrimaaran", "fountain".</div>';
    results.classList.add('open');
    return;
  }
  const re = new RegExp('(' + tokens.map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'gi');
  results.innerHTML = matches.map((m, i) => {
    const it = m.item;
    const labelHL = esc(it.label).replace(re, '<mark>$1</mark>');
    const snipHL  = esc(it.snippet).replace(re, '<mark>$1</mark>');
    return '<a href="' + esc(it.url) + '" class="search-result r-' + esc(it.kind) + '" role="option" data-idx="' + i + '">' +
      '<div class="kind">' + (KIND_LABEL[it.kind] || 'STUDIO') + '</div>' +
      '<h5>' + labelHL + '</h5>' +
      '<p>' + snipHL + '</p>' +
    '</a>';
  }).join('');
  results.classList.add('open');
}

function searchKey(e) {
  const results = $('#searchResults');
  if (!results || !results.classList.contains('open')) return;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSearchIdx = Math.min(activeSearchIdx + 1, visibleResults.length - 1);
    highlightActiveResult();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSearchIdx = Math.max(activeSearchIdx - 1, 0);
    highlightActiveResult();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    const target = visibleResults[activeSearchIdx >= 0 ? activeSearchIdx : 0];
    if (target) window.location.href = target.url;
  } else if (e.key === 'Escape') {
    e.preventDefault();
    e.target.value = '';
    performSearch('');
    e.target.blur();
  }
}
function highlightActiveResult() {
  const els = document.querySelectorAll('.search-result');
  els.forEach((el, i) => el.classList.toggle('active', i === activeSearchIdx));
  if (activeSearchIdx >= 0 && els[activeSearchIdx]) {
    els[activeSearchIdx].scrollIntoView({ block: 'nearest' });
  }
}

// ============================================================
// EXPORT / IMPORT / RESET  (cross-blueprint)
// ============================================================

/* The overview, as paper, beside the JSON. The two are not
   alternatives: the JSON is the backup — the only one a local-first
   app has — and a PDF of it would be useless for restoring anything.
   This is the other half, the thing you hand somebody: what is in the
   studio, how far each blueprint has got, and where to find the rest.

   Deliberately NOT called a backup, and deliberately below the two
   that are, so that nobody reaches for it at the moment they most
   need the JSON. */
function exportOverviewPDF() {
  const projects = Store.listProjects();
  const open = Store.currentProject();
  PDF.exportPDF({
    scope: 'overview',
    project: "FilmMakerStudio",
    label: 'Studio overview',
    title: "FilmMakerStudio — overview",
    subtitle: [
      projects.length + (projects.length === 1 ? ' project' : ' projects'),
      open && open.title ? 'open: ' + open.title : ''
    ].filter(Boolean).join(' · ')
  });
}

/* THE DOWNLOAD, and only the download. The object it writes to disk
   is built by buildBackup() in src/lib/backup.js, which is also what
   Drive uploads — one builder, so the file a user emails themselves
   and the file in their Drive cannot drift apart. The long note that
   used to live here, about listAllProjects and about the importer not
   carrying `ns` across, moved there with the code it explains. */
function exportAll() {
  const n = downloadBackup();
  logActivity('studio', 'Exported full studio backup — ' + n + ' project' + (n === 1 ? '' : 's'));
}

function importAll() { $('#importAllFile').click(); }

/* READING A FILE OFF DISK, and only that. What the parsed object
   MEANS — v1 or v2, which projects land, how a colliding id is
   handled, how a pre-rename note key is mapped forward — is
   applyBackup() in src/lib/backup.js, because Drive restores the
   same object and two appliers is two sets of rules for one file.

   The prompts stay here. `confirm` is passed in rather than called
   there: what to ask a person is the page's business, and a library
   that opens a modal is a library you cannot call from a sync. */
function handleImportAll(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const all = JSON.parse(ev.target.result);
      if (!backupShape(all).looksOurs) {
        if (!confirm('This file does not look like a Studio backup. Try anyway?')) return;
      }
      const res = applyBackup(all, { mode: 'merge', confirm: (q) => confirm(q) });
      if (!res.ok) { if (res.message) alert(res.message); return; }
      if (res.added || res.replaced) {
        logActivity('studio', 'Imported ' + res.added + ' project' + (res.added === 1 ? '' : 's'));
      }
      /* FLUSH BEFORE THE DIALOG, NOT JUST BEFORE THE RELOAD.

         A restored screenplay is over the overflow threshold, so
         applyBackup() has only STARTED its write when it returns. The
         alert then blocks the event loop the IndexedDB transaction
         needs and the reload destroys the connection, and the script
         is gone — proved, through this exact path. Both halves have
         to wait: holding the dialog longer made it worse, not better,
         so moving the flush after it would not have been enough. */
      Store.flushStorage().then(() => {
        alert('✓ ' + res.message + ' Refreshing…');
        location.reload();
      });
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

async function resetAll() {
  /* This said "erases EVERYTHING" and then called removeItem for each
     scoped key — which the storage proxy resolved to the ACTIVE project
     only. Other projects survived a wipe the user was told was total.
     Now it means what it says: every project, then the globals.

     The account namespace put the same trap back: listProjects()
     AND deleteProject() are both namespace-scoped, so this promised
     to erase everything while leaving every account-only project on
     disk. purgeProjectEverywhere() is the namespace-blind form and
     exists for exactly this one caller. */
  const projects = Store.listAllProjects();
  const n = projects.length;
  /* Say what is kept as well as what goes. The two sentences below are
     the only place a user is told that an ACCOUNT's copy is a separate
     thing from this device's — and getting that wrong in either
     direction is the worst kind of bug this dialog can have. */
  const c      = window.StudioCloud;
  const signed = !!(c && c.getSession && c.getSession());
  if (!confirm('This erases EVERYTHING on this device — ' + n + ' project' + (n === 1 ? '' : 's') +
               ', both blueprints, library calc, all prefs, all comments. ' +
               'EXPORT first if you want to keep anything.\n\nContinue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.' +
               (signed
                 ? '\n\nYou will be signed out. Projects already in your account stay there — ' +
                   'this clears the device, not the account. Sign in again to bring them back.'
                 : '') +
               '')) return;

  // deleteProject already wipes that project's namespaced keys, using
  // store.js's own SCOPED_KEYS as the authority. Don't re-list them here.
  projects.forEach((p) => Store.purgeProjectEverywhere(p.id));

  // Anything still unsuffixed (a studio that predates projects), then globals.
  ALL_KEYS.forEach((k) => Store.rawRemove(k));
  // The per-namespace open-project pointers. ALL_KEYS knows the bare
  // name; an account pointer is `…@<uid>`, which it has never heard of,
  // so a wipe left one behind aiming at a project that no longer exists.
  Store.currentPointerKeys().forEach((k) => Store.rawRemove(k));

  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));

  /* AFTER the purge, never before. signOut() ends with
     Store.setAccount(null), which SCHEDULES A RELOAD — run it first
     and the page can come back before the wipe has finished.

     Signing out is what makes keeping SYNC_CFG safe (see ALL_KEYS).
     Leave the session alive and the next load pulls the account's
     projects straight back down, which would make both confirmations
     above untrue. The session is not an `fms_` key — supabase-js keeps
     it under `sb-<ref>-auth-token` — so nothing above can clear it and
     only this call can.

     Purging first is also safe from the sync side: every write above
     goes through rawRemove, which bypasses the storage proxy and so
     emits no `saved` event for the cloud subscriber to push. */
  if (signed) {
    try { await c.signOut(); }
    catch (e) { console.warn('[reset] sign-out', e); }
  }

  // Same reason as the import path above: removals clear IndexedDB
  // records too, and the reload must not outrun them.
  await Store.flushStorage();
  alert('All studio data cleared — ' + n + ' project' + (n === 1 ? '' : 's') + ' removed. Refreshing…');
  location.reload();
}

// ============================================================
// ACTIVITY LOG
// ============================================================
const ACTIVITY_LIMIT = 30;

function logActivity(where, what, url) {
  const log = parseStorage(ACTIVITY_KEY);
  const arr = Array.isArray(log.entries) ? log.entries : [];
  arr.unshift({ ts: Date.now(), where, what, url });
  log.entries = arr.slice(0, ACTIVITY_LIMIT);
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
  renderActivity();
}

function detectActivity() {
  const log  = parseStorage(ACTIVITY_KEY);
  const last = log.lastSnap || {};
  const f = lastFeatStatus  || computeFeatureStatus();
  const s = lastShortStatus || computeShortStatus();
  const l = lastLibStatus   || computeLibraryStatus();
  const now = {
    fp: f.pct, ft: f.title, fs: f.lastEditedStep,
    sp: s.pct, st: s.title, ss: s.lastEditedStep,
    lc: l.count, lt: l.total
  };
  const arr = Array.isArray(log.entries) ? log.entries : [];

  if (last.fp !== undefined) {
    if (now.ft && now.ft !== last.ft) {
      arr.unshift({ ts: Date.now(), where: 'feat', what: 'Feature title set: "' + now.ft + '"', url: FEATURE_URL });
    }
    if (now.fp > (last.fp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'feat',
        what: 'Feature progress: ' + (last.fp || 0) + '% → ' + now.fp + '%' + (now.fs ? ' (' + now.fs + ')' : ''),
        url: FEATURE_URL + (now.fs ? '#' + now.fs : '') });
    }
    if (now.st && now.st !== last.st) {
      arr.unshift({ ts: Date.now(), where: 'short', what: 'Short title set: "' + now.st + '"', url: SHORT_URL });
    }
    if (now.sp > (last.sp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'short',
        what: 'Short progress: ' + (last.sp || 0) + '% → ' + now.sp + '%' + (now.ss ? ' (' + now.ss + ')' : ''),
        url: SHORT_URL + (now.ss ? '#' + now.ss : '') });
    }
    if (now.lc > (last.lc || 0)) {
      arr.unshift({ ts: Date.now(), where: 'lib',
        what: 'Equipment list: ' + (last.lc || 0) + ' → ' + now.lc + ' items (' + fmtINR(now.lt) + ')',
        url: LIBRARY_URL + '#equipment' });
    }
  }
  log.entries = arr.slice(0, ACTIVITY_LIMIT);
  log.lastSnap = now;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
}

const WHERE_CLASS = { feat: 'feat', short: 'short', lib: 'lib' };
const WHERE_LABEL = { feat: 'FEATURE', short: 'SHORT', lib: 'LIBRARY' };

function renderActivity() {
  const log = parseStorage(ACTIVITY_KEY);
  const arr = Array.isArray(log.entries) ? log.entries : [];
  const container = $('#activityList');
  $('#activityCount').textContent = arr.length + ' ENTR' + (arr.length === 1 ? 'Y' : 'IES');
  container.textContent = '';

  if (!arr.length) {
    container.append(h('div.activity-empty', {
      text: 'No activity yet. Open a blueprint and start filling things in. Activity updates whenever you save.'
    }));
    return;
  }

  arr.forEach(e => {
    const inner = [
      h('span.when', { text: relTime(e.ts) }),
      h('span', { class: 'where ' + (WHERE_CLASS[e.where] || 'studio'), text: WHERE_LABEL[e.where] || 'STUDIO' }),
      h('span.what', { text: e.what })
    ];
    const url = rewriteUrl(e.url);
    container.append(h('div.activity-row', {}, url ? [h('a', { href: url }, inner)] : inner));
  });
}

function refreshActivity() { updateStatus(); detectActivity(); renderActivity(); }

function clearActivity() {
  if (!confirm('Clear the activity log? (Your blueprint data is not affected.)')) return;
  const log = parseStorage(ACTIVITY_KEY);
  log.entries = [];
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
  renderActivity();
}

// ============================================================
// PROJECTS — list, create, switch, rename, duplicate, delete
// ============================================================
const FORMAT_LABELS = {
  feature: 'FEATURE FILM',
  short: 'SHORT FILM',
  documentary: 'DOCUMENTARY',
  musicvideo: 'MUSIC VIDEO',
  adfilm: 'AD FILM'
};

let projectFilter = 'all';
let projectSort = 'recent';
let projectSearchTerm = '';

function applyProjectFilters(projects) {
  let arr = projects.slice();
  if (projectFilter !== 'all') arr = arr.filter(p => p.format === projectFilter);
  if (projectSearchTerm) {
    arr = arr.filter(p => (p.title || '').toLowerCase().indexOf(projectSearchTerm) >= 0);
  }
  if (projectSort === 'alpha') {
    arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (projectSort === 'oldest') {
    arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } else {
    arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return arr;
}

function projectProgress(p) {
  try {
    const featRaw  = Store.rawGet(FEATURE_KEY + '__' + p.id);
    const shortRaw = Store.rawGet(SHORT_KEY + '__' + p.id);
    const data = JSON.parse(featRaw || shortRaw || '{}');
    const keys = Object.keys(data);
    if (!keys.length) return 0;
    let total = 0, filled = 0;
    keys.forEach(k => {
      const v = data[k];
      if (typeof v === 'string') { total++; if (v.trim()) filled++; }
      else if (v === true) { total++; filled++; }
      else if (v === false) total++;
    });
    return total > 0 ? Math.round((filled / total) * 100) : 0;
  } catch (e) { return 0; }
}

function progressLabel(pct) {
  if (pct === 0)   return 'EMPTY';
  if (pct < 25)    return 'EARLY DRAFT';
  if (pct < 50)    return 'DRAFTING';
  if (pct < 80)    return 'PRE-PROD';
  if (pct < 100)   return 'NEAR LOCK';
  return 'READY';
}

function projectCard(p, currentId) {
  const active = p.id === currentId;
  const pct = projectProgress(p);
  const card = h('div', {
    class: 'project-card' + (active ? ' active' : '') + ' format-' + p.format,
    tabindex: '0', role: 'button',
    'data-action': 'switch-project', 'data-id': p.id,
    'aria-label': 'Open project ' + p.title
  }, [
    h('div.pc-actions', {}, [
      h('button', { 'data-action': 'rename-project', 'data-id': p.id, 'aria-label': 'Rename project', title: 'Rename', text: '✎' }),
      h('button', { 'data-action': 'duplicate-project', 'data-id': p.id, 'aria-label': 'Duplicate project', title: 'Duplicate', text: '⎘' }),
      h('button', { 'data-action': 'delete-project', 'data-id': p.id, 'aria-label': 'Delete project', title: 'Delete', text: '×' })
    ]),
    h('button.pc-share', { 'data-action': 'share-project', 'data-id': p.id, 'aria-label': 'Share project', title: 'Share', text: '↗ SHARE' }),
    h('div.pc-format', {
      text: (FORMAT_LABELS[p.format] || String(p.format).toUpperCase()) +
            (active ? ' · ACTIVE' : '') + ' · ' + progressLabel(pct)
    }),
    h('div.pc-title', { title: 'Double-click to rename', 'data-dblaction': 'rename-project', 'data-id': p.id, text: p.title }),
    h('div.pc-meta', {}, [
      h('span', { text: pct + '% · edited ' + fmtRelDate(p.updatedAt) }),
      // The stylesheet has no rule for this one span; the legacy page
      // coloured it inline too, and it reads the accent token rather
      // than a hex, so it still follows the theme.
      h('span.pc-open', { style: 'color: var(--accent-deep)', text: 'open →' })
    ])
  ]);
  return card;
}

/* ------------------------------------------------------------
   FIRST RUN — what a stranger sees before anything is saved.

   Three jobs, in this order: say what the studio is in one line,
   let them look at something real without committing, and only then
   ask for a project. The ask used to come first, as a modal, which
   is why it is now the last thing on the panel rather than the first
   thing on the screen.
   ------------------------------------------------------------ */

const TOUR = [
  { href: 'library.html', label: 'Craft library',  note: 'Rules, directors, rates — no project needed' },
  { href: 'study.html',   label: 'Case studies',   note: 'Four films, beat by beat' },
  { href: 'dissect.html', label: 'Dissection',     note: 'A feature taken apart sequence by sequence' }
];

function renderFirstRun() {
  const panel = h('div.empty-projects-state', {}, [
    h('div.eps-icon', { text: '🎬', 'aria-hidden': 'true' }),
    h('div.eps-title', { text: 'A blank desk.' }),
    // DERIVED, not written. This sentence said "Twenty-two" while
    // navigation.json held twenty-four, one line away from the launcher's
    // own correct reduce over the same file — the hand-written list
    // invariant 2 exists to stop. A digit rather than a spelled word on
    // purpose: the alternative is a number-to-words helper for one
    // caller, and this panel already prints a derived digit further
    // down ("a feature, 36 scenes").
    //
    // The BUILT count, not the total. This is a promise, made to
    // somebody who has not committed anything yet, with no qualifier
    // beside it — so it has to be what they can open today, not what
    // the map lists. The launcher may quote the total because it
    // prints "N OF M BUILT" right next to it; this cannot.
    h('div.eps-deck', {
      text: BUILT_MODULE_COUNT + ' modules for writing, planning and shooting a film — '
          + 'script to call sheet. Everything you write stays in this browser '
          + 'unless you sign in.'
    })
  ]);

  const tour = h('div.eps-tour');
  tour.append(h('div.eps-tour-head', { text: 'Have a look around first' }));
  TOUR.forEach((t) => {
    const a = h('a.eps-tour-item', { href: t.href });
    a.append(h('span.eps-tour-label', { text: t.label }),
             h('span.eps-tour-note', { text: t.note }));
    tour.append(a);
  });
  panel.append(tour);

  panel.append(h('div.eps-actions', {}, [
    h('button.btn.primary', { 'data-action': 'new-project', text: '+ CREATE FIRST PROJECT' }),
    h('button.btn', { 'data-action': 'sample-project', text: 'OPEN A SAMPLE PROJECT' })
  ]));
  panel.append(h('div.eps-fine', {
    text: 'The sample is a real project you can edit or delete — it just arrives with a few '
        + 'hundred fields filled in: a feature, ' + samplePages() + ' pages of script, the '
        + sample.scenes.length + ' scenes broken down from them, a crew and a budget, '
        + 'so every module has something to show.'
  }));
  return panel;
}

/* ------------------------------------------------------------
   THE SAMPLE PROJECT — Dragon, a feature.

   ONE sample. There were two: a four-scene "Sample — Dragon" seeded
   here, and a separate Por Thozhil field dump inside feature.js with
   its own copy fetched from a root JSON file. Two samples are two
   answers to "what does a filled studio look like", and the short one
   could not fill a single downstream module — four scenes across two
   shoot days gave the stripboard two strips, the day out of days two
   columns and the estimator nothing worth deriving from.

   It is a feature: 36 scenes, 105 pages, 18 shoot days, 17
   locations, 12 speaking parts and 29 people on the unit list, so the
   breakdown, stripboard, day out of days, call sheet, contacts,
   visualize, write, plan, budget and dashboard all have something
   real to render.

   THE CONTENT IS NOT HERE. It is src/data/sample.dragon.json —
   invariant 2, content lives in the data files. This function is the
   only thing that knows how to WRITE it, and it writes through the
   same key shapes the app reads back:

     fms_filmmaker_combined_v1   the blueprint blob, field → value
     fms_scenes_v1               { scenes: [...] }        scenes.js
     fms_contacts_v1             { contacts, callSheets } contacts.js
     fms_locations_v1            { days, recces, media }  locations.js
     fms_shots_v1                { shots, frames, boards } shots.js
     fms_script_v1               { elements, revisions, documents }
     fms_library_calc_v1         ci_<n>_item|days|rate    ui/budget.js

   Every one of those is in SCOPED_KEYS, and createProject() has
   already made the new project current, so the storage proxy suffixes
   all seven writes with its id. Nothing here goes near rawSet.

   ONE REPRESENTATION PER THING. Scene ids are DERIVED from the scene
   number; the data file refers to a scene by number and never writes
   an id. Shoot days, locations, cast, page counts and a call sheet's
   date are likewise never listed in the file — they are what the
   scene rows and the calendar already say. The blueprint's own legacy
   scene/cast/location tables (sl_*, cast_*, loc_*) are left empty on
   purpose: filling them would be the scene list stored twice, which
   is the stranded-key trap by another name.
   ------------------------------------------------------------ */

const SAMPLE_TITLE = sample.title;

const sampleSceneId   = (number) => 'dragon-sc-' + String(number);
const sampleContactId = (i)      => 'dragon-c-' + (i + 1);
const sampleShotId    = (scene, number) => 'dragon-sh-' + scene + '-' + number;

/** Pages per day as the schedule step's <select> words it. Assigning a
    value that is not one of its options silently blanks the field —
    the select trap src/ui/budget.js documents — so this maps the
    derived figure onto the vocabulary that exists. */
const PAGES_PER_DAY_BANDS = [
  [1.5, '~1 page (heavy production)'],
  [2.5, '~2 pages (standard prestige)'],
  [3.5, '~3 pages (mainstream)'],
  [4.5, '~4 pages (TV / fast-paced)'],
  [Infinity, '~5+ pages (indie / low-budget)']
];

function sampleScenes() {
  return sample.scenes.map((s) => ({ ...s, id: sampleSceneId(s.number) }));
}

/* The two figures the hub quotes about the sample, derived from the
   scene rows so the prose cannot drift from the board. Function
   declarations, because the "where to start" markup is built before
   this section in source order and reads them. */
function sampleDays() {
  return new Set(sample.scenes
    .map((s) => parseInt(s.shootDay, 10))
    .filter((n) => Number.isFinite(n) && n > 0)).size;
}

function samplePages() {
  return formatEighths(sample.scenes.reduce((a, s) => a + (Number(s.eighths) || 0), 0));
}

/** The blueprint blob: the written answers, the ticked checklists, and
    the four figures that are DERIVED from the schedule rather than
    typed beside it, so the paperwork cannot disagree with the board. */
function sampleBlueprint(scenes) {
  const fields = { ...sample.blueprint };
  fields.meta_title = sample.title;
  fields.v1_title   = sample.title;

  const days = sampleDays();
  const eighths = scenes.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const perDay = days ? (eighths / 8) / days : 0;

  fields.p3_days     = String(days);
  fields.v2s11_days  = String(days);
  fields.v2s11_pages = (PAGES_PER_DAY_BANDS.find(([max]) => perDay < max) || [])[1] || '';
  fields.v2_shoot    = days + ' days · ' + formatEighths(eighths) + ' pages';

  for (const key of sample.blueprintChecks) fields[key] = true;
  return fields;
}

function sampleContacts() {
  return sample.contacts.map((c, i) => ({ ...c, id: sampleContactId(i) }));
}

/** A call sheet holds ids, never copies — contacts.js is explicit
    about it — and its date comes off the shoot-day calendar rather
    than being written down a second time. */
function sampleCallSheets(contacts) {
  const idByName = new Map(contacts.map((c) => [c.name, c.id]));
  return sample.callSheets.map((cs, i) => ({
    id: 'dragon-cs-' + (i + 1),
    title: cs.title,
    date: sample.days[String(cs.day)] || '',
    generalCall: cs.generalCall,
    location: cs.location,
    notes: cs.notes,
    sceneIds: (cs.sceneNumbers || []).map(sampleSceneId),
    calls: Object.fromEntries(Object.entries(cs.calls || {})
      .map(([name, time]) => [idByName.get(name), time])
      .filter(([id]) => Boolean(id)))
  }));
}

/** Recces are filed under locations.js's normalised key and media
    under its `loc:` link token, both derived from the location name a
    scene already carries. */
function sampleLocations() {
  const recces = {};
  for (const [name, rec] of Object.entries(sample.recces)) recces[locationKey(name)] = rec;
  return {
    days: { ...sample.days },
    recces,
    media: sample.media.map((m, i) => ({
      id: 'dragon-md-' + (i + 1),
      title: m.title,
      url: m.url || '',
      kind: m.kind,
      notes: m.notes || '',
      linkedTo: m.linkedTo ? locationLink(m.linkedTo) : ''
    }))
  };
}

function sampleShots() {
  const shots = sample.shots.map((s) => ({
    id: sampleShotId(s.scene, s.number),
    sceneId: sampleSceneId(s.scene),
    number: s.number,
    size: s.size,
    angle: s.angle,
    movement: s.movement,
    lens: s.lens,
    description: s.description,
    done: false,
    ai: false
  }));
  const frames = sample.frames.map((f, i) => ({
    id: 'dragon-fr-' + (i + 1),
    shotId: sampleShotId(f.scene, f.shotNumber),
    caption: f.caption,
    ref: f.ref
  }));
  const boards = sample.boards.map((b, i) => ({
    id: 'dragon-bd-' + (i + 1),
    name: b.name,
    note: b.note || '',
    entries: (b.entries || []).map((e, j) => ({
      id: 'dragon-bd-' + (i + 1) + '-en-' + (j + 1),
      title: e.title, ref: e.ref || '', why: e.why || ''
    }))
  }));
  return { shots, frames, boards };
}

/* `elements` is passed in rather than read off `sample`, because the
   105 pages live in their own file and arrive by dynamic import — see
   openSampleProject(). An empty array is a legitimate argument: the
   project is still worth having without the screenplay. */
function sampleScript(elements) {
  const now = new Date().toISOString();
  return {
    elements: (elements || []).map((e, i) => ({
      id: 'dragon-el-' + (i + 1), type: e.type, text: e.text
    })),
    // No revision history: a snapshot the user did not take is a
    // fiction, and restoring one would silently replace their draft.
    revisions: [],
    documents: sample.script.documents.map((d, i) => ({
      id: 'dragon-doc-' + (i + 1),
      title: d.title, kind: d.kind, body: d.body, updated: now
    }))
  };
}

/** The estimator stores one flat field per cell, `ci_<n>_item|days|rate`,
    1-indexed. Unchanged shape on purpose — invariant 1. */
function sampleCalc() {
  const data = {};
  sample.calc.forEach((row, i) => {
    const n = i + 1;
    data['ci_' + n + '_item']   = row.item;
    data['ci_' + n + '_custom'] = '';
    data['ci_' + n + '_days']   = row.days;
    data['ci_' + n + '_rate']   = row.rate;
  });
  return data;
}

/* THE SCREENPLAY IS A LAZY CHUNK, and the await happens before the
   first write rather than beside it.

   sample.dragon.json is a static import, so every byte of it is in the
   hub's first paint whether or not anybody ever loads the sample. The
   36 scenes' pages are ~105 pages of screenplay — far more than the
   rest of the file put together — and they are needed only after a
   click, which is exactly the shape palette.js already uses for its
   content index and vite.config keeps Supabase and pptxgenjs in.

   Awaiting it FIRST keeps the seed below a single synchronous pass:
   an import that fails (offline, before the chunk was ever cached)
   leaves a project with everything but its pages, rather than a
   project half-written. */
function sampleFailed(err) {
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast('Could not open the sample project. ' + (err && err.message ? err.message : ''),
                   { type: 'error' });
  }
}

async function openSampleProject() {
  let pages = [];
  try {
    pages = (await import('../data/sample.dragon.script.json')).default.elements || [];
  } catch (e) { /* no pages; every other model below still seeds */ }

  const project = Store.createProject({ title: SAMPLE_TITLE, format: 'feature' });
  // createProject() has already made this the current project, so the
  // storage proxy scopes every write below to it.
  const scenes   = sampleScenes();
  const contacts = sampleContacts();
  try {
    localStorage.setItem(FEATURE_KEY,  JSON.stringify(sampleBlueprint(scenes)));
    localStorage.setItem(SCENES_KEY,   JSON.stringify({ scenes }));
    localStorage.setItem(CONTACTS_KEY, JSON.stringify({
      contacts, callSheets: sampleCallSheets(contacts)
    }));
    localStorage.setItem(LOCS_KEY,     JSON.stringify(sampleLocations()));
    localStorage.setItem(SHOTS_KEY,    JSON.stringify(sampleShots()));
    localStorage.setItem(SCRIPT_KEY,   JSON.stringify(sampleScript(pages)));
    localStorage.setItem(LIB_CALC_KEY, JSON.stringify(sampleCalc()));
  } catch (e) { /* private mode — the project itself still exists */ }
  Store.notify('projects:changed', { reason: 'sample', project });
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast(
      sample.title + ' is open — ' + scenes.length + ' scenes, ' + samplePages()
      + ' pages, ' + sampleDays() + ' shoot days, ' + contacts.length
      + ' on the unit list'
      + (pages.length ? ', and the script they were broken down from' : '')
      + '. Edit or delete any of it.',
      { type: 'ok', duration: 6000 });
  }
}

/* ------------------------------------------------------------
   DEVICE PROJECTS, INSIDE AN ACCOUNT — the standing control.

   cloud.js offers this ONCE, on a first sign-in. A one-shot offer is
   not a control: dismiss it, or write a film next month while signed
   out, and there was no way left in the whole app to bring that work
   into the account. This panel is the way, and it is deliberately NOT
   dismissible — it is answered by acting, and it takes itself off the
   page the moment `listAdoptableProjects()` comes back empty.

   THE GATE IS THE STORE'S ANSWER, never a page-local copy of it.
   `listAdoptableProjects()` returns [] in the device namespace, so
   "is somebody signed in" and "is there anything to bring in" are one
   question, asked once, of the only file that knows. A page-local
   mirror of "am I signed in" is exactly what goes stale — the AI key
   bar stopped keeping one for this reason.

   THE WORDING IS LOAD-BEARING. An earlier version of this flow said
   UPLOAD ALL. Both halves of that were wrong: nothing is uploaded
   (membership is a local `ns` field — the server is not involved) and
   nothing moves. `adoptDeviceProjects()` ADDS the account to each
   entry's `ns`, so there is ONE copy of the data listed in TWO
   namespaces, and signing out still finds it. "Move" and "upload"
   both promise something the storage model does not do, and a backup
   that turned out to hold one film is what this studio's history says
   those promises cost.
   ------------------------------------------------------------ */

/** Who the projects would become reachable as. The account id lives in
    `fms_studio_account_v1`, but the id is not a thing a person
    recognises, so the email comes off the live session and "this
    account" is the honest fallback when it cannot be read. */
function adoptAccountLabel() {
  try {
    const email = window.StudioCloud && StudioCloud.getUserEmail && StudioCloud.getUserEmail();
    return email || 'this account';
  } catch (e) { return 'this account'; }
}

function renderAdoptNotice() {
  const host = $('#adoptNotice');
  if (!host) return;

  const adoptable = Store.listAdoptableProjects();
  host.textContent = '';
  host.hidden = adoptable.length === 0;
  if (!adoptable.length) return;

  const n   = adoptable.length;
  const one = n === 1;

  const panel = h('div.adopt-panel', {
    role: 'region', 'aria-label': 'Projects on this device only'
  }, [
    h('div.adopt-eyebrow', { text: 'ON THIS DEVICE ONLY' }),
    h('div.adopt-title', {
      text: one
        ? 'One project is on this device and not in this account.'
        : n + ' projects are on this device and not in this account.'
    }),
    h('p.adopt-deck', {
      text: 'Nothing is copied and nothing is taken away. '
          + (one ? 'It stays' : 'They stay') + ' on this device, in this browser, exactly where '
          + (one ? 'it is' : 'they are') + ' — and also become reachable while you are signed in as '
          + adoptAccountLabel() + '. One copy of the work, listed in both places: sign out and '
          + (one ? 'it is' : 'they are') + ' still here.'
    })
  ]);

  /* REQUIREMENT, not decoration: say which films, by name, BEFORE
     doing it. "3 projects" is a number somebody has to trust; three
     titles are a number they can check. */
  panel.append(h('div.adopt-affects', {
    text: one ? 'This affects one project:' : 'This affects all ' + n + ' of them:'
  }));
  const list = h('ul.adopt-list');
  adoptable.forEach((p) => list.append(h('li.adopt-item', {}, [
    h('span.adopt-name', { text: p.title }),
    h('span.adopt-fmt',  { text: FORMAT_LABELS[p.format] || String(p.format).toUpperCase() })
  ])));
  panel.append(list);

  panel.append(h('div.adopt-actions', {}, [
    h('button.btn.primary', {
      'data-action': 'adopt-device-projects',
      text: one ? 'ADD IT TO THIS ACCOUNT' : 'ADD ALL ' + n + ' TO THIS ACCOUNT'
    })
  ]));
  panel.append(h('div.adopt-fine', {
    text: 'A film can belong to this device and to one account. To put one into a '
        + 'different account, download a backup here and import it there.'
  }));

  host.append(panel);
}

function adoptDeviceProjectsNow() {
  const taken = Store.adoptDeviceProjects();
  if (!taken.length) { renderAdoptNotice(); return; }

  logActivity('studio', taken.length === 1
    ? 'Added "' + taken[0].title + '" to ' + adoptAccountLabel()
    : 'Added ' + taken.length + ' device projects to ' + adoptAccountLabel(), '#projects');

  StudioUI.toastSuccess(
    (taken.length === 1 ? '"' + taken[0].title + '" is' : taken.length + ' projects are')
    + ' now in ' + adoptAccountLabel() + ' — and still on this device.',
    { duration: 5000 });

  /* adoptDeviceProjects() notifies projects:changed, which init()'s
     subscription already turns into renderProjects(). Re-rendering
     here as well is not belt-and-braces: it is what makes the result
     visible WITHOUT A MANUAL RELOAD even if this page is ever mounted
     without that subscription, and renderProjects() is idempotent. */
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  renderGreeting();
}

function renderProjects() {
  const grid = $('#projectsGrid');
  const toolbar = $('#projectsToolbar');
  /* One call site, so every path that already re-renders the grid —
     projects:changed, current:changed, a cross-tab storage event,
     adoption itself — refreshes the panel too, and none of them has
     to know it exists. */
  renderAdoptNotice();
  if (!grid) return;
  const sampleOnly = PlanGate.sampleOnly();
  const projects  = sampleOnly ? Store.listProjects().filter((p) => p.title === SAMPLE_TITLE) : Store.listProjects();
  const currentId = Store.currentProjectId();

  if (toolbar) toolbar.hidden = projects.length < 2;

  grid.textContent = '';
  applyPlanToControls();

  if (projects.length === 0) {
    grid.append(sampleOnly ? renderSampleOnly() : renderFirstRun());
    return;
  }

  const filtered = applyProjectFilters(projects);

  if (filtered.length === 0) {
    grid.append(h('div.empty-projects-state', {}, [
      h('div.eps-title', { text: 'No projects match.' }),
      h('div.eps-deck', { text: 'Try a different filter or clear your search.' }),
      h('button.btn', { 'data-action': 'reset-project-filters', text: 'RESET FILTERS' })
    ]));
    return;
  }

  filtered.forEach(p => grid.append(projectCard(p, currentId)));
  if (PlanGate.allowed('new_projects')) {
    grid.append(h('div.project-card.new-card', {
      tabindex: '0', role: 'button', 'data-action': 'new-project', 'aria-label': 'Create new project'
    }, [
      h('div.pc-plus', { 'aria-hidden': 'true', text: '+' }),
      h('div.pc-cta', { text: 'NEW PROJECT' })
    ]));
  } else if (sampleOnly) {
    grid.append(h('p.pc-plan-note', { text: 'Your plan opens the sample project. A paid plan adds films of your own.' }));
  }
}

/* The free tier's hub: the sample, and the way up. */
function renderSampleOnly() {
  return h('div.empty-projects-state', {}, [
    h('div.eps-title', { text: 'Open the ' + SAMPLE_TITLE + ' sample.' }),
    h('div.eps-deck', { text: 'Your plan opens the sample project — ' + sample.scenes.length + ' scenes, a crew, a budget and a schedule to explore in every module. A paid plan adds films of your own.' }),
    h('div.iv-actions', {}, [
      h('button.btn.primary', { 'data-action': 'sample-project', text: 'OPEN THE SAMPLE' }),
      h('a.btn', { href: 'settings.html#plan', text: 'SEE PLANS' })
    ])
  ]);
}

/* Every way of making a project, hidden together or shown together:
   the head button, the backups menu's import, the tool cards. Hidden,
   not removed — the controls are markup the verify gate counts. */
function applyPlanToControls() {
  const can = PlanGate.allowed('new_projects');
  document.querySelectorAll('[data-action="new-project"], [data-action="import-all"], [data-action="duplicate-project"]').forEach((el) => {
    if (el.classList.contains('new-card')) return;   // drawn conditionally above
    el.hidden = !can;
  });
}

function resetProjectFilters() {
  projectFilter = 'all';
  projectSearchTerm = '';
  projectSort = 'recent';
  document.querySelectorAll('#projectsFilter button').forEach(b =>
    b.classList.toggle('active', b.dataset.fmt === 'all'));
  const search = $('#projectsSearch'); if (search) search.value = '';
  const sort = $('#projectsSort');     if (sort) sort.value = 'recent';
  renderProjects();
}

function shareProject(id) {
  if (StudioUI && StudioUI.openShareDialog) StudioUI.openShareDialog(id);
  else alert('Sharing requires the cloud module — please configure it from Settings.');
}

function duplicateProject(id) {
  const p = Store.getProject(id);
  if (!p) return;
  const copy = Store.createProject({ title: p.title + ' (copy)', format: p.format });
  Store.SCOPED_KEYS.forEach(k => {
    const v = Store.rawGet(k + '__' + id);
    if (v) Store.rawSet(k + '__' + copy.id, v);
  });
  Store.updateProject(copy.id, { title: copy.title });
  StudioUI.toastSuccess('Project duplicated.');
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
}

function renderProjectSwitcher() {
  const projects = PlanGate.sampleOnly() ? Store.listProjects().filter((p) => p.title === SAMPLE_TITLE) : Store.listProjects();
  const current  = Store.currentProject();
  const btn   = $('#projectSwitcherBtn');
  const label = $('#projectSwitcherLabel');
  const dd    = $('#switcherDropdown');
  if (!btn || !label || !dd) return;

  if (current) {
    btn.classList.remove('empty');
    label.textContent = current.title;
  } else {
    btn.classList.add('empty');
    label.textContent = projects.length ? 'PICK A PROJECT' : '— NO PROJECT —';
  }

  dd.textContent = '';
  projects.slice()
    .sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''))
    .forEach(p => {
      dd.append(h('div', {
        class: 'sd-item' + (current && p.id === current.id ? ' active' : ''),
        'data-action': 'switch-project', 'data-id': p.id, role: 'button', tabindex: '0'
      }, [
        h('div.sd-title', { text: p.title }),
        h('div.sd-meta', { text: (FORMAT_LABELS[p.format] || p.format) + ' · edited ' + fmtRelDate(p.updatedAt) })
      ]));
    });
  if (PlanGate.allowed('new_projects')) dd.append(h('div.sd-new', { 'data-action': 'new-project', role: 'button', tabindex: '0', text: '+ NEW PROJECT' }));
}

function toggleProjectSwitcher() {
  const dd = $('#switcherDropdown');
  const btn = $('#projectSwitcherBtn');
  if (!dd) return;
  const open = dd.classList.toggle('show');
  if (btn) btn.setAttribute('aria-expanded', String(open));
  if (open) renderProjectSwitcher();
}
function closeProjectSwitcher() {
  const dd = $('#switcherDropdown');
  const btn = $('#projectSwitcherBtn');
  if (dd) dd.classList.remove('show');
  if (btn) btn.setAttribute('aria-expanded', 'false');
}

function openProjectModal(editId) {
  if (!editId && !PlanGate.allowed('new_projects')) {
    StudioUI.toastInfo('Your plan does not add new projects. See plans on Settings.');
    return;
  }
  closeProjectSwitcher();
  const overlay     = $('#projectModal');
  const titleInput  = $('#pmTitle');
  const formatInput = $('#pmFormat');
  const heading     = $('#pmHeading');
  const submit      = $('#pmSubmit');
  if (editId) {
    const p = Store.getProject(editId);
    if (!p) return;
    heading.innerHTML = 'Rename <em>project.</em>';
    titleInput.value = p.title;
    formatInput.value = p.format;
    formatInput.disabled = true;
    submit.textContent = 'SAVE';
    submit.dataset.editId = editId;
  } else {
    heading.innerHTML = 'New <em>project.</em>';
    titleInput.value = '';
    formatInput.value = 'feature';
    formatInput.disabled = false;
    submit.textContent = 'CREATE';
    delete submit.dataset.editId;
  }
  overlay.classList.add('show');
  setTimeout(() => titleInput.focus(), 50);
}

function closeProjectModal() {
  $('#projectModal').classList.remove('show');
}

function submitProjectModal(e) {
  if (e) e.preventDefault();
  const titleValue = $('#pmTitle').value.trim();
  const format = $('#pmFormat').value;
  if (!titleValue) { alert('Give your project a title.'); return; }
  const submit = $('#pmSubmit');
  const editId = submit.dataset.editId;
  if (editId) {
    Store.updateProject(editId, { title: titleValue });
    logActivity('studio', 'Project renamed: "' + titleValue + '"', '#projects');
    StudioUI.toastSuccess('Renamed to "' + titleValue + '"');
  } else {
    Store.createProject({ title: titleValue, format });
    logActivity('studio', 'Project created: "' + titleValue + '" (' + format + ')', '#projects');
    StudioUI.toastSuccess('Project "' + titleValue + '" created.');
  }
  closeProjectModal();
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  renderGreeting();
}

function switchToProject(id) {
  if (!id) return;
  if (Store.currentProjectId() === id) { closeProjectSwitcher(); return; }
  Store.setCurrentProject(id);
  const p = Store.getProject(id);
  if (p) {
    logActivity('studio', 'Switched to project: "' + p.title + '"', '#projects');
    StudioUI.toast('Switched to "' + p.title + '"', { type: 'info', duration: 1600 });
  }
  closeProjectSwitcher();
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  refreshActivity();
  renderGreeting();
}

function deleteProjectConfirm(id) {
  const p = Store.getProject(id);
  if (!p) return;
  if (!confirm('Delete project "' + p.title + '"?\n\nAll blueprint data inside it will also be deleted. This cannot be undone.')) return;
  Store.deleteProject(id);
  logActivity('studio', 'Project deleted: "' + p.title + '"', '#projects');
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
}

// ============================================================
// EVENT WIRING — one delegated listener per event type.
// There is not a single inline handler on this page.
// ============================================================
const CLICK_ACTIONS = {
  'toggle-theme':          () => { toggleDark(); syncThemeIcon(); },
  'install-app':           () => promptInstall(),
  'export-all':            () => exportAll(),
  'import-all':            () => importAll(),
  'print-hub':             () => window.print(),
  'pdf-overview':          () => exportOverviewPDF(),
  'reset-all':             () => resetAll(),
  'privacy-note':          () => alert(
    'Your work is saved in this browser, on this device.\n\n' +
    'To move to a new browser: EXPORT here, then IMPORT in the new browser.\n\n' +
    'Incognito mode does NOT save data between sessions.'),
  'refresh-activity':      () => refreshActivity(),
  'clear-activity':        () => clearActivity(),
  'new-project':           () => openProjectModal(),
  /* openSampleProject() is async now, so a throw here would be an
     unhandled rejection rather than an error the click surfaces —
     and `verify` asserts zero console errors, which is the wrong
     place to find out. */
  'sample-project':        () => { openSampleProject().catch(sampleFailed); },
  'adopt-device-projects': () => adoptDeviceProjectsNow(),
  'close-project-modal':   () => closeProjectModal(),
  'toggle-switcher':       () => toggleProjectSwitcher(),
  'switch-project':        (el) => switchToProject(el.dataset.id),
  'rename-project':        (el) => openProjectModal(el.dataset.id),
  'duplicate-project':     (el) => duplicateProject(el.dataset.id),
  'delete-project':        (el) => deleteProjectConfirm(el.dataset.id),
  'share-project':         (el) => shareProject(el.dataset.id),
  'reset-project-filters': () => resetProjectFilters(),
  'set-filter':            (el) => {
    projectFilter = el.dataset.fmt;
    document.querySelectorAll('#projectsFilter button').forEach(b => b.classList.remove('active'));
    el.classList.add('active');
    renderProjects();
  }
};

function wireEvents() {
  const app = document.getElementById('app');

  // `delegate` resolves to the INNERMOST matching element, so the
  // rename/duplicate/delete buttons inside a project card win over
  // the card's own switch-project action without any stopPropagation.
  delegate(app, 'click', '[data-action]', (e, el) => {
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  delegate(app, 'keydown', '[data-action][role="button"], [data-action][tabindex]', (e, el) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });

  delegate(app, 'dblclick', '[data-dblaction="rename-project"]', (e, el) => {
    e.preventDefault();
    e.stopPropagation();
    openProjectModal(el.dataset.id);
  });

  delegate(app, 'input', '#searchInput', (e) => performSearch(e.target.value));
  delegate(app, 'keydown', '#searchInput', (e) => searchKey(e));
  delegate(app, 'input', '#projectsSearch', (e) => {
    projectSearchTerm = (e.target.value || '').toLowerCase();
    renderProjects();
  });
  delegate(app, 'change', '#projectsSort', (e) => {
    projectSort = e.target.value;
    renderProjects();
  });
  delegate(app, 'change', '#importAllFile', (e) => handleImportAll(e));
  delegate(app, 'submit', '#projectForm', (e) => submitProjectModal(e));
  delegate(app, 'click', '#projectModal', (e, el) => {
    if (e.target === el) closeProjectModal();
  });

  // Click-away closes the search results and the switcher dropdown.
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.search-wrap')) {
      const r = $('#searchResults');
      if (r) r.classList.remove('open');
    }
    if (!e.target.closest('.switcher-wrap')) closeProjectSwitcher();
  });

  /* ⌘K USED TO LIVE HERE AND NO LONGER DOES.

     This field searches CONTENT — steps, films, directors, glossary
     terms. The command palette in src/ui/palette.js searches the
     STUDIO — modules, scenes, people, projects, settings — and it is
     bound to ⌘K on every page in the app, including this one. Two
     different indexes answering one key, on one page, is worse than
     either: you press it and get whichever handler was registered
     first, and here both were, so it opened the palette AND focused
     the field behind the palette's scrim.

     So the key goes to the palette, which is the answer that is the
     same everywhere, and this field keeps `/` — already bound in
     chrome.js, already in the shortcut sheet, and the convention for
     "search this page" since the first browser that had one. The
     badge beside the field says `/` now; it said ⌘ K, which after
     the palette landed was a label making a promise the page could
     not keep. */
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeProjectModal();
      closeProjectSwitcher();
    }
  });
}

// ============================================================
// INIT
// ============================================================
function init() {
  render();
  wireEvents();

  // The shared chrome auto-inits on import, before this page has any
  // DOM — so the pieces that need our markup are attached here.
  mountShell();
  wireActionBar();
  const toolbar = document.querySelector('.toolbar');
  if (toolbar) StudioUI.attachSignInPill(toolbar);
  StudioUI.wireGlossaryPopovers();
  StudioUI.autoAriaLabels();
  StudioUI.polishEmptyStates();
  syncThemeIcon();
  // Swaps the ◐ cycle button for the Appearance menu (theme + design).
  // After this the button is gone, which is why syncThemeIcon() runs first.
  StudioUI.upgradeThemeButton(toolbar);

  renderGreeting();
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  detectActivity();
  renderActivity();

  // FIRST RUN. This used to open the new-project modal on a 300ms timer:
  // a stranger's first sight of the studio was a dialog demanding a title
  // for a film, in front of a page they had not been allowed to read yet.
  // The modal is now something you choose. renderProjects() puts a real
  // first-run panel in the empty grid instead — what this is, three
  // things to try, and a sample project for people who would rather look
  // at a filled studio than an empty one.

  Store.subscribe('projects:changed', () => { renderProjects(); renderProjectSwitcher(); renderGreeting(); });
Store.subscribe('plan:changed', () => { renderProjects(); renderProjectSwitcher(); });
  Store.subscribe('current:changed',  () => { renderProjects(); renderProjectSwitcher(); updateStatus(); renderGreeting(); });

  window.addEventListener('focus', () => { updateStatus(); detectActivity(); renderActivity(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { updateStatus(); detectActivity(); renderActivity(); }
  });
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    const baseKey = e.key.split('__')[0];
    if ([FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY].includes(baseKey)) {
      setTimeout(() => { updateStatus(); detectActivity(); renderActivity(); }, 200);
    }
    // The open-project pointer is per namespace: bare on the device,
    // `…@<uid>` inside an account. Matching only the bare name meant a
    // cross-tab project switch never re-rendered while signed in.
    if (e.key === 'fms_studio_projects_v1' ||
        (e.key || '').startsWith('fms_studio_current_project_v1')) {
      renderProjects();
      renderProjectSwitcher();
    }
  });

  // PWA — registration is a no-op under `vite dev`; the install
  // button stays hidden unless the browser offers a prompt.
  registerSW();
  onInstallAvailable((available) => {
    const btn = document.getElementById('installBtn');
    if (btn) btn.hidden = !available;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
