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
// `localStorage.getItem('arunak_…')` scopes to the current project.
// Modules evaluate in import order; anything that reads localStorage
// before this line would read the wrong (unscoped) keys.
import { parseNum } from '../lib/money.js';
import { featureKeys, shortKeys, progressAgainst } from '../lib/blueprint-fields.js';
import Store from '../lib/store.js';
import { mountShell } from '../ui/shell.js';
import { wireActionBar } from '../ui/actionbar.js';
import { renderLauncher } from '../ui/launcher.js';

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

// ============================================================
// STORAGE KEYS — byte-identical to the legacy hub. Do not touch.
// ============================================================
const PREF_KEY     = 'arunak_studio_prefs_v1';
const FEATURE_KEY  = 'arunak_filmmaker_combined_v1';
const SHORT_KEY    = 'arunak_shortfilm_blueprint_v1';
const LIB_CALC_KEY = 'arunak_library_calc_v1';
const FEAT_PREFS   = 'arunak_filmmaker_prefs_v1';
const SHORT_PREFS  = 'arunak_shortfilm_prefs_v1';
const LIB_PREFS    = 'arunak_library_prefs_v1';
const SYNC_CFG     = 'arunak_supabase_cfg_v1';
const NOTE_PREFIX  = 'arunak_note_';
const ACTIVITY_KEY = 'arunak_studio_activity_v1';
const SCENES_KEY   = 'arunak_scenes_v1';
const CONTACTS_KEY = 'arunak_contacts_v1';
const SHOTS_KEY    = 'arunak_shots_v1';
const SCRIPT_KEY   = 'arunak_script_v1';
const LOCS_KEY     = 'arunak_locations_v1';
const BENCH_KEY    = 'arunak_workbench_v1';
const DISSECT_KEY  = 'arunak_dissect_v1';

const ALL_KEYS = [
  FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY,
  FEAT_PREFS, SHORT_PREFS, LIB_PREFS,
  PREF_KEY, SYNC_CFG, ACTIVITY_KEY, SCENES_KEY, CONTACTS_KEY,
  SHOTS_KEY, SCRIPT_KEY, LOCS_KEY, BENCH_KEY, DISSECT_KEY
];

/* Backup field name -> storage key, for the keys store.js namespaces
   per project (its SCOPED_KEYS). Everything here exists once PER
   PROJECT; reading it through localStorage would silently give you only
   the active one, which is exactly the bug this map exists to kill. */
const PROJECT_KEYS = {
  feature_blueprint: FEATURE_KEY,
  short_blueprint:   SHORT_KEY,
  library_calc:      LIB_CALC_KEY,
  feature_prefs:     FEAT_PREFS,
  short_prefs:       SHORT_PREFS,
  library_prefs:     LIB_PREFS,
  activity_log:      ACTIVITY_KEY,
  scenes:            SCENES_KEY,
  contacts:          CONTACTS_KEY,
  shots:             SHOTS_KEY,
  script:            SCRIPT_KEY,
  locations:         LOCS_KEY,
  workbench:         BENCH_KEY,
  dissect:           DISSECT_KEY
};

/* Deliberately NOT per project: the theme is a device preference and the
   Supabase config is account-level. Both are global in store.js too. */
const GLOBAL_KEYS = {
  studio_prefs: PREF_KEY,
  sync_config:  SYNC_CFG
};

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
    { label: 'Real-time Sync',   hash: '#sync-section',     snippet: 'Optional Supabase backend — sync across devices' },
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
function fmtINR(n) {
  if (!n) return '₹ 0';
  if (n >= 10000000) return '₹ ' + (n / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 100000)   return '₹ ' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (n >= 1000)     return '₹ ' + Math.round(n / 1000) + 'k';
  return '₹ ' + Math.round(n);
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
  return h('div.toolbar', {
    html: `
      <span class="brand">CURATED BY ARUNAK · STUDIO</span>
      <a class="nav-link" href="#projects">PROJECTS</a>
      <a class="nav-link" href="#doors">BLUEPRINTS</a>
      <a class="nav-link" href="#start">START</a>
      <a class="nav-link" href="#tools">TOOLS</a>
      <a class="nav-link" href="#index">INDEX</a>
      <a class="nav-link" href="#activity">ACTIVITY</a>
      <div class="switcher-wrap">
        <button class="project-switcher empty" id="projectSwitcherBtn"
                data-action="toggle-switcher" title="Switch project" aria-haspopup="true" aria-expanded="false">
          <span class="ps-label" id="projectSwitcherLabel">— NO PROJECT —</span>
          <span class="ps-caret" aria-hidden="true">▾</span>
        </button>
        <div class="switcher-dropdown" id="switcherDropdown"></div>
      </div>
      <button class="btn icon-btn" data-action="toggle-theme" id="darkBtn" title="Theme — paper, sepia, ink">◐</button>
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

        <h1>The <span class="light">Filmmaker's</span><br>Studio.</h1>

        <p class="hero-deck">Three companion blueprints, one reference library. Build a <em>feature</em>, draft a <em class="s">short</em>, study the <em class="g">craft</em> — all from one desk.</p>

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
          <span class="search-icon" aria-hidden="true">⌘ K</span>
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
            <h4>Load the Por Thozhil sample</h4>
            <p>Open the Feature Blueprint, click <strong>SAMPLE</strong> in the toolbar. Loads a fully filled blueprint based on the 2023 Tamil thriller.</p>
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
            <p>Combined JSON of all blueprints, prefs, comments. One file, full backup.</p>
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
            <div class="tool-icon">↻</div><h5>Real-time Sync</h5>
            <p>Optional Supabase backend for syncing across devices.</p>
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
        <div class="file-list">
          <p>PAGES IN THIS STUDIO:</p>
          <p>
            <code>index.html</code> this hub<br>
            <code>${FEATURE_URL}</code> feature, Vol I &amp; II<br>
            <code>${SHORT_URL}</code> short film blueprint<br>
            <code>${LIBRARY_URL}</code> reference companion
          </p>
          <p class="note">Installable, and it keeps working with no network once loaded.</p>
        </div>
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
  const cur = document.body.classList.contains('sepia') ? 'sepia'
            : document.body.classList.contains('dark') ? 'ink'
            : 'paper';
  darkBtn.textContent = cur === 'ink' ? '☀' : (cur === 'sepia' ? '◉' : '◐');
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
    project: "The Filmmaker's Studio",
    label: 'Studio overview',
    title: "The Filmmaker's Studio — overview",
    subtitle: [
      projects.length + (projects.length === 1 ? ' project' : ' projects'),
      open && open.title ? 'open: ' + open.title : ''
    ].filter(Boolean).join(' · ')
  });
}

function exportAll() {
  /* v2: EVERY project, not just the active one.
     v1 read the scoped keys straight off localStorage, so the storage
     proxy quietly resolved them to whichever project happened to be
     open. The file said "full studio backup" and contained one film. */
  const projects = Store.listProjects();
  const all = {
    _exported: new Date().toISOString(),
    _from: "The Filmmaker's Studio",
    _curator: 'Arunak',
    _version: 2,
    projects,
    currentProject: Store.currentProjectId() || null,
    data: {},
    global: {},
    notes: {}
  };

  // Read each project's namespaced keys directly. Switching the active
  // project to read them would fire change events and bump updatedAt on
  // every project just for taking a backup.
  const readBucket = (suffix) => {
    const bucket = {};
    Object.keys(PROJECT_KEYS).forEach((name) => {
      const raw = Store.rawGet(PROJECT_KEYS[name] + suffix);
      if (raw == null) return;
      try { bucket[name] = JSON.parse(raw); } catch (e) { /* skip corrupt */ }
    });
    return bucket;
  };
  projects.forEach((p) => { all.data[p.id] = readBucket('__' + p.id); });

  // A studio that never created a project still has unsuffixed data.
  if (!projects.length) {
    const legacy = readBucket('');
    if (Object.keys(legacy).length) all.data._unfiled = legacy;
  }

  Object.keys(GLOBAL_KEYS).forEach((n) => { all.global[n] = parseStorage(GLOBAL_KEYS[n]); });

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) all.notes[k] = localStorage.getItem(k);
  }

  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = 'arunak_studio_backup_' + date + '.json';
  a.click();
  URL.revokeObjectURL(url);
  const n = projects.length;
  logActivity('studio', 'Exported full studio backup — ' + n + ' project' + (n === 1 ? '' : 's'));
}

function importAll() { $('#importAllFile').click(); }

function handleImportAll(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const all = JSON.parse(ev.target.result);
      if (!all._from || !all._from.includes('Studio')) {
        if (!confirm('This file does not look like a Studio backup. Try anyway?')) return;
      }
      const done = (all._version >= 2 && all.data) ? importV2(all) : importV1(all);
      if (!done) return;
      alert('✓ ' + done + ' Refreshing…');
      location.reload();
    } catch (err) {
      alert('Import failed: ' + err.message);
    }
  };
  r.readAsText(file);
  e.target.value = '';
}

/* v2 — a whole studio. Additive by design: an import never deletes or
   overwrites a project you already have. A backup restored onto an empty
   machine comes back with its original ids and titles; restored onto a
   machine that still has the originals, the incoming copies arrive
   alongside, marked, so nobody loses a draft to a filename collision. */
function importV2(all) {
  const incoming = Array.isArray(all.projects) ? all.projects : [];
  const unfiled  = all.data._unfiled;
  const total    = incoming.length + (unfiled ? 1 : 0);
  if (!total) { alert('That backup contains no projects.'); return null; }

  if (!confirm('Import ' + total + ' project' + (total === 1 ? '' : 's') +
               ' into this studio?\n\nNothing you already have is deleted or ' +
               'overwritten — the imported work is added alongside it.')) return null;

  const taken = Store.listProjects().map((p) => p.id);
  let added = 0;

  const restore = (meta, bucket) => {
    const clash = taken.indexOf(meta.id) >= 0;
    const created = Store.createProject({
      id:     clash ? undefined : meta.id,
      title:  (meta.title || 'Imported Project') + (clash ? ' (imported)' : ''),
      format: meta.format
    });
    Object.keys(PROJECT_KEYS).forEach((name) => {
      if (bucket[name] === undefined) return;
      Store.rawSet(PROJECT_KEYS[name] + '__' + created.id, JSON.stringify(bucket[name]));
    });
    taken.push(created.id);
    added++;
  };

  incoming.forEach((p) => restore(p, all.data[p.id] || {}));
  if (unfiled) restore({ title: 'Imported Project', format: 'feature' }, unfiled);

  // Globals and notes are studio-wide; last write wins, as before.
  if (all.global) {
    Object.keys(GLOBAL_KEYS).forEach((n) => {
      if (all.global[n] !== undefined) localStorage.setItem(GLOBAL_KEYS[n], JSON.stringify(all.global[n]));
    });
  }
  if (all.notes) Object.keys(all.notes).forEach((k) => localStorage.setItem(k, all.notes[k]));

  logActivity('studio', 'Imported ' + added + ' project' + (added === 1 ? '' : 's'));
  return 'Imported ' + added + ' project' + (added === 1 ? '' : 's') + '.';
}

/* v1 — a single project's worth of data, with no project identity in the
   file. Keeps working exactly as it did, including the warning that it
   lands on top of whatever is currently open. */
function importV1(all) {
  if (!Store.currentProjectId()) {
    const tryTitle =
      (all.feature_blueprint && (all.feature_blueprint.meta_title || all.feature_blueprint.v1_title)) ||
      (all.short_blueprint && all.short_blueprint.meta_title) ||
      'Imported Project';
    Store.createProject({ title: tryTitle, format: 'feature' });
  } else if (!confirm('This is an older single-project backup. It will REPLACE the data in ' +
                      'the active project ("' + Store.currentProject().title + '"). Continue?' +
                      '\n\nTip: cancel and create a new project first if you want to keep the current one.')) {
    return null;
  }
  if (all.feature_blueprint) localStorage.setItem(FEATURE_KEY, JSON.stringify(all.feature_blueprint));
  if (all.short_blueprint)   localStorage.setItem(SHORT_KEY, JSON.stringify(all.short_blueprint));
  if (all.library_calc)      localStorage.setItem(LIB_CALC_KEY, JSON.stringify(all.library_calc));
  if (all.feature_prefs)     localStorage.setItem(FEAT_PREFS, JSON.stringify(all.feature_prefs));
  if (all.short_prefs)       localStorage.setItem(SHORT_PREFS, JSON.stringify(all.short_prefs));
  if (all.library_prefs)     localStorage.setItem(LIB_PREFS, JSON.stringify(all.library_prefs));
  if (all.studio_prefs)      localStorage.setItem(PREF_KEY, JSON.stringify(all.studio_prefs));
  if (all.sync_config)       localStorage.setItem(SYNC_CFG, JSON.stringify(all.sync_config));
  if (all.activity_log)      localStorage.setItem(ACTIVITY_KEY, JSON.stringify(all.activity_log));
  if (all.notes) Object.keys(all.notes).forEach((k) => localStorage.setItem(k, all.notes[k]));
  return 'Studio data imported.';
}

function resetAll() {
  /* This said "erases EVERYTHING" and then called removeItem for each
     scoped key — which the storage proxy resolved to the ACTIVE project
     only. Other projects survived a wipe the user was told was total.
     Now it means what it says: every project, then the globals. */
  const projects = Store.listProjects();
  const n = projects.length;
  if (!confirm('This erases EVERYTHING — ' + n + ' project' + (n === 1 ? '' : 's') +
               ', both blueprints, library calc, all prefs, all comments. ' +
               'EXPORT first if you want to keep anything.\n\nContinue?')) return;
  if (!confirm('Are you absolutely sure? This cannot be undone.')) return;

  // deleteProject already wipes that project's namespaced keys, using
  // store.js's own SCOPED_KEYS as the authority. Don't re-list them here.
  projects.forEach((p) => Store.deleteProject(p.id));

  // Anything still unsuffixed (a studio that predates projects), then globals.
  ALL_KEYS.forEach((k) => Store.rawRemove(k));

  const toRemove = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k && k.startsWith(NOTE_PREFIX)) toRemove.push(k);
  }
  toRemove.forEach((k) => localStorage.removeItem(k));

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
      h('span.pc-open', { style: 'color: var(--accent)', text: 'open →' })
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
    h('div.eps-deck', { text: 'Twenty-two modules for writing, planning and shooting a film — script to call sheet. Everything you write stays in this browser unless you sign in.' })
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
  panel.append(h('div.eps-fine', { text: 'The sample is a real project you can edit or delete — it just arrives with a few fields filled in.' }));
  return panel;
}

/* A small, honest demo: enough filled in that the blueprint, the scene
   list, the stripboard and the budget all have something to show, and
   little enough that it reads as a starting point rather than a finished
   film. The content is invented for this purpose. */

const SAMPLE_TITLE = 'Sample — The Last Bus';

const SAMPLE_FIELDS = {
  s1_whatif:    'What if the last bus out of a town only stops for people who have decided never to come back?',
  s1_why_me:    'I grew up on the 6:40 from Ambattur. I know what that queue sounds like at night.',
  s1_image:     'A conductor tearing a ticket in the dark, lit only by the fare box.',
  s2_log1:      'A night-shift conductor discovers his last passenger has no destination.',
  s2_log_final: 'On the last bus out of a dying mill town, a conductor counting his final week finds a passenger who will not name a stop — and realises the route only ends for one of them.',
  s3_theme:     'You cannot leave a place you have not forgiven.',
  s3_ext:       'Does he get out of the town?',
  s3_int:       'Does he stop measuring his life in other people\'s departures?',
  s7_era:       'Present day',
  s7_location:  'A mill town on the Chennai–Tiruvallur road',
  s7_duration:  'One night, 9pm to dawn'
};

const SAMPLE_SCENES = [
  { number: '1',  intExt: 'INT', dayNight: 'NIGHT', location: 'Bus depot office', eighths: 6,
    synopsis: 'Raghu signs the night register. The supervisor does not look up.', shootDay: '1' },
  { number: '2',  intExt: 'EXT', dayNight: 'NIGHT', location: 'Depot forecourt', eighths: 10,
    synopsis: 'The 11:40 pulls out with four passengers. One of them has no bag.', shootDay: '1' },
  { number: '3',  intExt: 'INT', dayNight: 'NIGHT', location: 'Bus — moving', eighths: 14,
    synopsis: 'Raghu works the aisle. The passenger without a bag refuses to name a stop.', shootDay: '2' },
  { number: '4',  intExt: 'EXT', dayNight: 'DAWN', location: 'Level crossing', eighths: 8,
    synopsis: 'The bus waits at a closed gate. Nobody gets off.', shootDay: '2' }
];

function openSampleProject() {
  const project = Store.createProject({ title: SAMPLE_TITLE, format: 'feature' });
  // createProject() has already made this the current project, so the
  // storage proxy scopes both writes below to it.
  try {
    localStorage.setItem('arunak_filmmaker_combined_v1', JSON.stringify(SAMPLE_FIELDS));
    localStorage.setItem('arunak_scenes_v1', JSON.stringify({
      scenes: SAMPLE_SCENES.map((s, i) => ({
        id: 'sample-' + (i + 1), pageNumber: '', elements: {}, ...s
      }))
    }));
  } catch (e) { /* private mode — the project itself still exists */ }
  Store.notify('projects:changed', { reason: 'sample', project });
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast('Sample project open. Four scenes, a logline and a theme — edit or delete any of it.',
      { type: 'ok', duration: 6000 });
  }
}

function renderProjects() {
  const grid = $('#projectsGrid');
  const toolbar = $('#projectsToolbar');
  if (!grid) return;
  const projects  = Store.listProjects();
  const currentId = Store.currentProjectId();

  if (toolbar) toolbar.hidden = projects.length < 2;

  grid.textContent = '';

  if (projects.length === 0) {
    grid.append(renderFirstRun());
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
  grid.append(h('div.project-card.new-card', {
    tabindex: '0', role: 'button', 'data-action': 'new-project', 'aria-label': 'Create new project'
  }, [
    h('div.pc-plus', { 'aria-hidden': 'true', text: '+' }),
    h('div.pc-cta', { text: 'NEW PROJECT' })
  ]));
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
  const projects = Store.listProjects();
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
  dd.append(h('div.sd-new', { 'data-action': 'new-project', role: 'button', tabindex: '0', text: '+ NEW PROJECT' }));
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
    'All data is local-only — saved to this browser\'s localStorage on this domain.\n\n' +
    'To move to a new browser: EXPORT here, then IMPORT in the new browser.\n\n' +
    'Incognito mode does NOT save data between sessions.'),
  'refresh-activity':      () => refreshActivity(),
  'clear-activity':        () => clearActivity(),
  'new-project':           () => openProjectModal(),
  'sample-project':        () => openSampleProject(),
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

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      const inp = $('#searchInput');
      if (inp) { inp.focus(); inp.select(); }
    }
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
    if (e.key === 'arunak_studio_projects_v1' || e.key === 'arunak_studio_current_project_v1') {
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
