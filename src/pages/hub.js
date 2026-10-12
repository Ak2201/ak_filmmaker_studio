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
import { fmtINR } from '../lib/money.js';
import Store from '../lib/store.js';
import { mountShell } from '../ui/shell.js';
import { holdFocus, releaseFocus } from '../ui/modal-focus.js';
import { wireActionBar } from '../ui/actionbar.js';
/* The five stages and where the open film is in them — derived, stored
   nowhere. See src/lib/journey.js. */
import { STAGES, stageOfStep, journey } from '../lib/journey.js';
import { renderJourneyStrip } from '../ui/journey-strip.js';

import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/pdf.css';
import '../styles/motion.css';
import '../styles/hub-doors.css';

import StudioUI from '../ui/chrome.js';
import '../lib/cloud.js';
import { registerSW, onInstallAvailable, promptInstall } from '../lib/pwa.js';
import { h, esc, delegate } from '../lib/dom.js';
import { reveal, spotlight } from '../lib/motion.js';

import featureData from '../data/steps.feature.json';
import shortData   from '../data/steps.short.json';
import films       from '../data/films.json';
import directors   from '../data/directors.json';
import rules       from '../data/rules.json';
import watchlist   from '../data/watchlist.json';
import festivals   from '../data/festivals.json';
import prodData    from '../data/steps.production.json';
import { DEFAULT_SAMPLE, sampleById, isSampleTitle } from '../lib/samples.js';
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

/* THE SPLIT (7 Oct 2026). hub.js was 2,600 lines; four views moved to
   src/pages/hub/ with their behaviour byte for byte — the first-run
   panel, the project grid, the Backup menu, the resume/progress cards —
   plus util.js for the strings they share. This file is the
   composition: the markup, the search, the activity log, the sample
   writer, the project actions and the event wiring. ALL_KEYS stays
   here because it is the RESET list (CLAUDE.md). */
import {
  FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY,
  FEATURE_URL, SHORT_URL, DASHBOARD_URL, LIBRARY_URL,
  FORMAT_LABELS, plain, clip, title, parseStorage, relTime, fmtRelDate, $
} from './hub/util.js';
import { BRAND } from '../lib/brand.js';   // rule 8: the name lives in brand.json
import { ALL_KEYS, ACTIVITY_KEY, SCENES_KEY, CONTACTS_KEY, SHOTS_KEY, SCRIPT_KEY, LOCS_KEY } from './hub/all-keys.js';
import { ask, tell } from '../ui/dialog.js';
import { createResumeCards } from './hub/resume-cards.js';
import { sampleDays, samplePages, welcomeCard } from './hub/first-run.js';
import {
  renderProjects, renderAdoptNotice, applyPlanToControls, resetProjectFilters,
  setProjectFilter, setProjectSearch, setProjectSort,
  /* Used by the three sentences this file writes after adopting. It was
     exported and never imported, so every one of them threw
     `adoptAccountLabel is not defined` — the toast that confirms the
     adoption, and the line that says the work is in both places. The
     adoption itself had already happened, so the symptom was a silent
     failure to tell anybody about it. prove:adoption could not see it
     while the proof was running signed out. */
  adoptAccountLabel
} from './hub/project-cards.js';


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
/* The five stages, not the four 2023 phases. A step's stage comes from
   journey.js (the steps.stages.json sidecar when present), so the search
   snippet, the master index and the journey strip all file step 11 under
   Screenplay rather than three of them under Story. */
const PHASE_NAME = Object.fromEntries(STAGES.map((s) => [s.id, s.label]));
const stageName = (ns, step) => PHASE_NAME[stageOfStep(ns, step.id)] || 'Story';
const SHORT_STEPS   = shortData.steps;


const WATCH_FILMS = watchlist.reduce((n, w) => n + (w.films ? w.films.length : 0), 0);



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
function stageParts(ns, steps) {
  return STAGES.map((st) => ({
    stage: st,
    label: 'PART ' + st.part + ' · ' + st.label.toUpperCase(),
    steps: steps.filter((s) => stageOfStep(ns, s.id) === st.id)
  })).filter((p) => p.steps.length);
}
const FEATURE_PARTS = stageParts('feature', FEATURE_STEPS);
const SHORT_PARTS = stageParts('short', SHORT_STEPS);



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
  /* The project switcher, theme, Backup and the account pill are NOT here any
     more: the shell band's right-hand zone carries the same four on every
     page (shell.js buildStudioTools), so the hub is no longer different. */
  return h('div.toolbar', {
    html: `
      <a class="nav-link" href="#projects">Projects</a>
      <button class="btn" data-action="install-app" id="installBtn" title="Install the Studio as an app" hidden>⇣ INSTALL</button>
      <div class="toolbar-stripe" aria-hidden="true"></div>`
  });
}

function heroMarkup() {
  /* HOME LOST ITS TITLE BLOCK, ITS TOUR INVITE AND ITS CLOSING QUOTE (owner,
     12 Oct 2026: "remove a section in home"). The tour lives in Settings →
     Preferences → Help and the first-week checklist below; the name is in
     the band. The page's h1 is now the projects heading.

     THE HERO IS THE PROJECT LIST (owner, 11 Oct 2026). With projects it
     is the Continue cards and "+ New project"; with none, renderProjects()
     draws the three doors in the same place. Everything about a film —
     where it is, the stages, the modules — lives on its dashboard. */
  return h('section#top.hero', {
    html: `
      <div class="hero-inner">
        <div id="heroProjects"></div>
      </div>`
  });
}

function projectsMarkup() {
  const sec = h('section#projects.projects-section', {
    html: `
      <div class="projects-inner">
        <div class="projects-head">
          <div>
            <div class="lab">PROJECTS · ONE PER FILM</div>
            <h1 id="projectsHeading">Continue <em>where you left off.</em></h1>
            <p class="greeting-block" id="hubGreeting">A working desk for the working filmmaker.</p>
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
            <!-- DOC / MV / AD buttons are added by renderProjects() only when such projects exist. -->
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
  return sec;
}

let lastJourney = null;
/* The hub no longer DRAWS the journey (it is the dashboard's), but the
   project cards and the resume helpers still read the open project's
   journey, so it is computed here and cached. Reads only. */
function renderJourney() {
  const project = Store.currentProject();
  lastJourney = project ? journey(project) : null;
  return lastJourney;
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
  const hero = heroMarkup();
  // The project list IS the hero: the section nests inside it.
  hero.querySelector('#heroProjects').replaceWith(projectsMarkup());
  main.append(hero);
  app.append(toolbarMarkup(), main, modalMarkup());
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
// PROGRESS, THE RESUME CARD, THE STORAGE SUMMARY — src/pages/hub/resume-cards.js
// ============================================================
const resume = createResumeCards({
  allKeys: ALL_KEYS,
  renderJourney,
  currentJourney: () => lastJourney,
  featureSteps: FEATURE_STEPS,
  shortSteps: SHORT_STEPS
});
const { updateStatus, computeFeatureStatus, computeShortStatus, computeLibraryStatus } = resume;

// ============================================================
// EXPORT / IMPORT / RESET — src/pages/hub/backup-menu.js
// ============================================================

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
}

function detectActivity() {
  const log  = parseStorage(ACTIVITY_KEY);
  const last = log.lastSnap || {};
  const f = resume.lastStatus().f || computeFeatureStatus();
  const s = resume.lastStatus().s || computeShortStatus();
  const l = resume.lastStatus().l || computeLibraryStatus();
  const now = {
    fp: f.pct, ft: f.title, fs: f.lastEditedStep,
    sp: s.pct, st: s.title, ss: s.lastEditedStep,
    lc: l.count, lt: l.total
  };
  const arr = Array.isArray(log.entries) ? log.entries : [];

  if (last.fp !== undefined) {
    if (now.ft && now.ft !== last.ft) {
      arr.unshift({ ts: Date.now(), where: 'feat', what: 'Feature title set: "' + now.ft + '"', url: DASHBOARD_URL });
    }
    if (now.fp > (last.fp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'feat',
        what: 'Feature progress: ' + (last.fp || 0) + '% → ' + now.fp + '%' + (now.fs ? ' (' + now.fs + ')' : ''),
        url: DASHBOARD_URL });
    }
    if (now.st && now.st !== last.st) {
      arr.unshift({ ts: Date.now(), where: 'short', what: 'Short title set: "' + now.st + '"', url: DASHBOARD_URL });
    }
    if (now.sp > (last.sp || 0)) {
      arr.unshift({ ts: Date.now(), where: 'short',
        what: 'Short progress: ' + (last.sp || 0) + '% → ' + now.sp + '%' + (now.ss ? ' (' + now.ss + ')' : ''),
        url: DASHBOARD_URL });
    }
    if (now.lc > (last.lc || 0)) {
      arr.unshift({ ts: Date.now(), where: 'lib',
        what: 'Equipment list: ' + (last.lc || 0) + ' → ' + now.lc + ' items (' + fmtINR(now.lt) + ')',
        url: 'budget.html#estimate' });
    }
  }
  log.entries = arr.slice(0, ACTIVITY_LIMIT);
  log.lastSnap = now;
  localStorage.setItem(ACTIVITY_KEY, JSON.stringify(log));
}

// ============================================================
// PROJECTS — the grid and its cards are src/pages/hub/project-cards.js,
// the first-run and sample-only panels src/pages/hub/first-run.js.
// What stays here is create, switch, rename, duplicate, delete: the
// actions, which re-render the switcher, the status and the greeting.
// ============================================================

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

/* Every builder below takes the sample object from src/lib/samples.js
   and prefixes its ids with the sample's own id, so Dragon's stay
   dragon-sc-<n> byte for byte and a second sample cannot collide. */
const sampleSceneId   = (sample, number) => sample.id + '-sc-' + String(number);
const sampleContactId = (sample, i)      => sample.id + '-c-' + (i + 1);
const sampleShotId    = (sample, scene, number) => sample.id + '-sh-' + scene + '-' + number;

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

function sampleScenes(sample) {
  return sample.data.scenes.map((s) => ({ ...s, id: sampleSceneId(sample, s.number) }));
}

/** The blueprint blob: the written answers, the ticked checklists, and
    the four figures that are DERIVED from the schedule rather than
    typed beside it, so the paperwork cannot disagree with the board. */
function sampleBlueprint(sample, scenes) {
  const fields = { ...sample.data.blueprint };
  fields.meta_title = sample.title;
  fields.v1_title   = sample.title;

  const days = sampleDays(sample.data);
  const eighths = scenes.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const perDay = days ? (eighths / 8) / days : 0;

  fields.p3_days     = String(days);
  fields.v2s11_days  = String(days);
  fields.v2s11_pages = (PAGES_PER_DAY_BANDS.find(([max]) => perDay < max) || [])[1] || '';
  fields.v2_shoot    = days + ' days · ' + formatEighths(eighths) + ' pages';

  for (const key of sample.data.blueprintChecks) fields[key] = true;
  return fields;
}

function sampleContacts(sample) {
  return sample.data.contacts.map((c, i) => ({ ...c, id: sampleContactId(sample, i) }));
}

/** A call sheet holds ids, never copies — contacts.js is explicit
    about it — and its date comes off the shoot-day calendar rather
    than being written down a second time. */
function sampleCallSheets(sample, contacts) {
  const idByName = new Map(contacts.map((c) => [c.name, c.id]));
  return sample.data.callSheets.map((cs, i) => ({
    id: sample.id + '-cs-' + (i + 1),
    title: cs.title,
    date: sample.data.days[String(cs.day)] || '',
    generalCall: cs.generalCall,
    location: cs.location,
    notes: cs.notes,
    sceneIds: (cs.sceneNumbers || []).map((n) => sampleSceneId(sample, n)),
    calls: Object.fromEntries(Object.entries(cs.calls || {})
      .map(([name, time]) => [idByName.get(name), time])
      .filter(([id]) => Boolean(id)))
  }));
}

/** Recces are filed under locations.js's normalised key and media
    under its `loc:` link token, both derived from the location name a
    scene already carries. */
function sampleLocations(sample) {
  const recces = {};
  for (const [name, rec] of Object.entries(sample.data.recces)) recces[locationKey(name)] = rec;
  return {
    days: { ...sample.data.days },
    recces,
    media: sample.data.media.map((m, i) => ({
      id: sample.id + '-md-' + (i + 1),
      title: m.title,
      url: m.url || '',
      kind: m.kind,
      notes: m.notes || '',
      linkedTo: m.linkedTo ? locationLink(m.linkedTo) : ''
    }))
  };
}

function sampleShots(sample) {
  const shots = sample.data.shots.map((s) => ({
    id: sampleShotId(sample, s.scene, s.number),
    sceneId: sampleSceneId(sample, s.scene),
    number: s.number,
    size: s.size,
    angle: s.angle,
    movement: s.movement,
    lens: s.lens,
    description: s.description,
    done: false,
    ai: false
  }));
  const frames = sample.data.frames.map((f, i) => ({
    id: sample.id + '-fr-' + (i + 1),
    shotId: sampleShotId(sample, f.scene, f.shotNumber),
    caption: f.caption,
    ref: f.ref
  }));
  const boards = sample.data.boards.map((b, i) => ({
    id: sample.id + '-bd-' + (i + 1),
    name: b.name,
    note: b.note || '',
    entries: (b.entries || []).map((e, j) => ({
      id: sample.id + '-bd-' + (i + 1) + '-en-' + (j + 1),
      title: e.title, ref: e.ref || '', why: e.why || ''
    }))
  }));
  return { shots, frames, boards };
}

/* `elements` is passed in rather than read off `sample`, because the
   105 pages live in their own file and arrive by dynamic import — see
   openSampleProject(). An empty array is a legitimate argument: the
   project is still worth having without the screenplay. */
function sampleScript(sample, elements) {
  const now = new Date().toISOString();
  return {
    elements: (elements || []).map((e, i) => ({
      id: sample.id + '-el-' + (i + 1), type: e.type, text: e.text
    })),
    // No revision history: a snapshot the user did not take is a
    // fiction, and restoring one would silently replace their draft.
    revisions: [],
    documents: sample.data.script.documents.map((d, i) => ({
      id: sample.id + '-doc-' + (i + 1),
      title: d.title, kind: d.kind, body: d.body, updated: now
    }))
  };
}

/** The estimator stores one flat field per cell, `ci_<n>_item|days|rate`,
    1-indexed. Unchanged shape on purpose — invariant 1. */
function sampleCalc(sample) {
  const data = {};
  sample.data.calc.forEach((row, i) => {
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
/* start.html's "See it on a real film" link is index.html?sample=1: the
   same action as the OPEN THE SAMPLE button, reached by URL. The
   parameter is consumed (replaceState, so a reload does not seed a
   second copy), and a sample that already exists in this namespace is
   OPENED rather than duplicated. Under the site gate a stranger never
   reaches this — the redirect to invite.html drops the query, which is
   the correct answer today. */
function openSampleFromURL() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return; }
  /* ?sample=1 is Dragon (start.html's link); ?sample=<id> is that one. */
  const want = params.get('sample');
  const sample = want === '1' ? sampleById(DEFAULT_SAMPLE) : sampleById(want);
  if (!sample) return;
  params.delete('sample');
  const q = params.toString();
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* ignore */ }
  const existing = Store.listProjects().find((p) => p.title === sample.title);
  if (existing) {
    if (Store.currentProjectId() !== existing.id) Store.setCurrentProject(existing.id);
    return;
  }
  openSampleProject(sample.id).catch(sampleFailed);
}

/* §30. A TRIAL IS THIRTY MINUTES; NONE OF THEM SHOULD GO ON FINDING
   THE DOOR. A new account signs in, lands here, and — because the free
   plan's features are sample_only — sees a grid filtered to a sample
   project that does not exist yet, with renderSampleOnly()'s single
   button in it. That button is correct and it should still be there;
   it just should not be the first thing a stopwatch is spent on.

   So when the server says a trial is RUNNING and this namespace holds
   nothing at all, the sample opens itself. Three guards, each load-
   bearing:
     - trial only. A paying member's empty studio is an empty studio on
       purpose, and seeding it would be putting a film they did not ask
       for into their list.
     - zero projects. Never on top of somebody's own work.
     - once per load, and it awaits the existing lazy import() rather
       than reaching past it: `sample.dragon.script-*` is a named
       first-paint budget failure, so it must stay behind the dynamic
       boundary openSampleProject() already draws. */
let sampleAutoTried = false;
function openSampleForTrial() {
  const go = () => {
    if (sampleAutoTried) return;
    const e = PlanGate.entitlement();
    if (e.reason !== 'trial') return;          // 'unknown' included: never guess
    if (Store.listAllProjects().length) return;
    sampleAutoTried = true;
    openSampleProject(DEFAULT_SAMPLE).then(() => {
      renderProjects();
      renderProjectSwitcher();
    }).catch(sampleFailed);
  };
  go();
  /* billing_status() lands a round trip after first paint, so the
     answer above is usually 'unknown' on the first call. */
  Store.subscribe('plan:changed', go);
}

function sampleFailed(err) {
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast('Could not open the sample project. ' + (err && err.message ? err.message : ''),
                   { type: 'error' });
  }
}

async function openSampleProject(id = DEFAULT_SAMPLE) {
  const meta = sampleById(id) || sampleById(DEFAULT_SAMPLE);
  /* The registry holds no data at first paint; the builders below take
     the entry with its main JSON attached as `data`. */
  const sample = { ...meta, data: (await meta.loadData()).default };
  let pages = [];
  try {
    pages = (await sample.loadScript()).default.elements || [];
  } catch (e) { /* no pages; every other model below still seeds */ }
  // The sample's story (idea, logline, step outline, synopsis): the same
  // lazy shape, and its steps name the sample's scene ids.
  let story = null;
  try { story = (await sample.loadStory()).default.story; } catch (e) { /* no story */ }

  const project = Store.createProject({ title: sample.title, format: sample.format });
  // createProject() has already made this the current project, so the
  // storage proxy scopes every write below to it.
  const scenes   = sampleScenes(sample);
  // Each scene takes the beat of the outline step written for it.
  if (story) for (const st of story.outline) { const sc = scenes.find((x) => x.id === st.sceneId); if (sc && !sc.beatId) sc.beatId = st.beat; }
  const contacts = sampleContacts(sample);
  try {
    localStorage.setItem(FEATURE_KEY,  JSON.stringify(sampleBlueprint(sample, scenes)));
    localStorage.setItem(SCENES_KEY,   JSON.stringify({ scenes }));
    localStorage.setItem(CONTACTS_KEY, JSON.stringify({
      contacts, callSheets: sampleCallSheets(sample, contacts)
    }));
    localStorage.setItem(LOCS_KEY,     JSON.stringify(sampleLocations(sample)));
    localStorage.setItem(SHOTS_KEY,    JSON.stringify(sampleShots(sample)));
    localStorage.setItem(SCRIPT_KEY,   JSON.stringify(sampleScript(sample, pages)));
    localStorage.setItem(LIB_CALC_KEY, JSON.stringify(sampleCalc(sample)));
    if (story) localStorage.setItem('fms_story_v1', JSON.stringify(story));
  } catch (e) { /* private mode — the project itself still exists */ }
  Store.notify('projects:changed', { reason: 'sample', project });
  if (window.StudioUI && StudioUI.toast) {
    StudioUI.toast(
      sample.title + ' is open — ' + scenes.length + ' scenes, ' + samplePages(sample.data)
      + ' pages, ' + sampleDays(sample.data) + ' shoot days, ' + contacts.length
      + ' on the unit list'
      + (pages.length ? ', and the script they were broken down from' : '')
      + '. Edit or delete any of it.',
      { type: 'success', duration: 6000 });   // 'ok' is not a toast type; it fell back to the plain gilt rule
  }
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

function shareProject(id) {
  if (StudioUI && StudioUI.openShareDialog) StudioUI.openShareDialog(id);
  else tell({ body: 'Sharing requires the cloud module — please configure it from Settings.' });
}

/* renderProjects() rebuilds the cards, so the control that opened a
   dialog or acted is gone by the time the action lands; focus would fall
   to <body>. Put it on the same control on the new card (or, if the card
   is gone, the first card / the new-project card). */
function refocusProjectControl(action, id) {
  const sel = id ? '[data-action="' + action + '"][data-id="' + id + '"]' : '';
  const el = (sel && document.querySelector(sel))
    || document.querySelector('.project-card[data-action="switch-project"]')
    || document.querySelector('.pc-new[data-action="new-project"], [data-action="new-project"]');
  if (el && typeof el.focus === 'function') el.focus();
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
  refocusProjectControl('duplicate-project', id);
}

function renderProjectSwitcher() {
  const projects = PlanGate.sampleOnly() ? Store.listProjects().filter((p) => isSampleTitle(p.title)) : Store.listProjects();
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

function openProjectModal(editId, format) {
  if (!editId && !PlanGate.allowed('new_projects')) {
    StudioUI.toastInfo('Your plan does not add new projects. See plans.', {
      action: 'See plans',
      onAction: () => { location.href = 'purchase.html'; }
    });
    return;
  }
  closeProjectSwitcher();
  // One creation path: a new project is the setup sheet. This modal is
  // the rename dialog now.
  if (!editId) { import('../ui/project-setup.js').then((m) => m.openProjectSetup({ format: format || 'feature' })); return; }
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
  holdFocus(overlay);   // Tab stays in the form; closing gives focus back
  setTimeout(() => titleInput.focus(), 50);
}

function closeProjectModal() {
  const overlay = $('#projectModal');
  overlay.classList.remove('show');
  releaseFocus(overlay);
}

function submitProjectModal(e) {
  if (e) e.preventDefault();
  const titleValue = $('#pmTitle').value.trim();
  const format = $('#pmFormat').value;
  if (!titleValue) { tell({ body: 'Give your project a title.' }); return; }
  const submit = $('#pmSubmit');
  const editId = submit.dataset.editId;
  if (editId) {
    Store.updateProject(editId, { title: titleValue });
    logActivity('studio', 'Project renamed: "' + titleValue + '"', '#projects');
    StudioUI.toastSuccess('Renamed to "' + titleValue + '"');
  } else {
    Store.createProject({ title: titleValue, format, adopt: true });  // unfiled work moves in: store.js adoptUnfiled()
    logActivity('studio', 'Project created: "' + titleValue + '" (' + format + ')', '#projects');
    StudioUI.toastSuccess('Project "' + titleValue + '" created.');
  }
  closeProjectModal();
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  renderGreeting();
  if (editId) refocusProjectControl('rename-project', editId);
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
  detectActivity();
  renderGreeting();
}

async function deleteProjectConfirm(id) {
  const p = Store.getProject(id);
  if (!p) return;
  const ok = await ask({
    title: 'Delete project "' + p.title + '"?',
    body: 'All blueprint data inside it will also be deleted. This cannot be undone.',
    confirm: 'DELETE', danger: true
  });
  if (!ok) return;
  Store.deleteProject(id);
  logActivity('studio', 'Project deleted: "' + p.title + '"', '#projects');
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  refocusProjectControl('delete-project', null);
}

// ============================================================
// EVENT WIRING — one delegated listener per event type.
// There is not a single inline handler on this page.
// ============================================================
const CLICK_ACTIONS = {
  'install-app':           () => promptInstall(),
  'new-project':           () => openProjectModal(),
  'start-feature':         () => openProjectModal(null, 'feature'),
  'start-short':           () => openProjectModal(null, 'short'),
  /* openSampleProject() is async now, so a throw here would be an
     unhandled rejection rather than an error the click surfaces —
     and `verify` asserts zero console errors, which is the wrong
     place to find out. */
  'sample-project':        (el) => { openSampleProject(el && el.dataset && el.dataset.sample).catch(sampleFailed); },
  'adopt-device-projects': () => adoptDeviceProjectsNow(),
  'close-project-modal':   () => closeProjectModal(),
  'switch-project':        (el) => switchToProject(el.dataset.id),
  // The card's "open →": make it the open project, then go to it.
  // setCurrentProject() is a synchronous pointer write, so the page
  // that loads next already reads this project.
  'open-project':          (el) => {
    if (Store.currentProjectId() !== el.dataset.id) Store.setCurrentProject(el.dataset.id);
    location.href = el.getAttribute('href');
  },
  'rename-project':        (el) => openProjectModal(el.dataset.id),
  'duplicate-project':     (el) => duplicateProject(el.dataset.id),
  'delete-project':        (el) => deleteProjectConfirm(el.dataset.id),
  'share-project':         (el) => shareProject(el.dataset.id),
  'reset-project-filters': () => resetProjectFilters(),
  'set-filter':            (el) => {
    setProjectFilter(el.dataset.fmt);
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
  const onAction = (e, el) => {
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  };
  delegate(app, 'click', '[data-action]', onAction);
  /* On a phone the band's tools (project switcher, Backup menu) are
     BORROWED into the Tools sheet, which is a child of <body>, outside
     #app — so the delegate above never saw them and the switcher did
     nothing. The sheet answers to the same actions. */
  delegate(document.body, 'click', '.mn-overlay [data-action]', onAction);

  delegate(app, 'keydown', '[data-action][role="button"], [data-action][tabindex]', (e, el) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    /* A real control INSIDE a role=button card (rename, share, open)
       answers its own key. Without this, Enter on the card's rename
       button reached the card, switched project, and the
       preventDefault swallowed the button's own click. */
    const inner = e.target.closest('button, a[href], input, select, textarea');
    if (inner && inner !== el && el.contains(inner)) return;
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

  delegate(app, 'input', '#projectsSearch', (e) => {
    setProjectSearch((e.target.value || '').toLowerCase());
    renderProjects();
  });
  delegate(app, 'change', '#projectsSort', (e) => {
    setProjectSort(e.target.value);
    renderProjects();
  });
  delegate(app, 'submit', '#projectForm', (e) => submitProjectModal(e));
  delegate(app, 'click', '#projectModal', (e, el) => {
    if (e.target === el) closeProjectModal();
  });

  // Click-away closes the search results and the switcher dropdown.
  document.addEventListener('click', (e) => {
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
/* Motion: once per element. The grid re-renders on every project change,
   so each host is flagged and a re-render only decorates what is new. */
function decorateMotion() {
  document.querySelectorAll('.door, .start-card, .tool-card, .project-card').forEach((el) => {
    if (el.dataset.moFx) return;
    el.dataset.moFx = '1';
    spotlight(el);
  });
}

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

  renderGreeting();
  renderProjects();
  renderProjectSwitcher();
  updateStatus();
  detectActivity();
  openSampleFromURL();
  openSampleForTrial();
  try {
    const wc = welcomeCard();
    const pj = document.getElementById('projects');
    if (wc && pj && pj.parentNode) pj.before(wc);
  } catch (e) { /* the welcome is a convenience */ }

  decorateMotion();
  reveal(document);
  let fxRaf = 0;
  new MutationObserver(() => {
    if (fxRaf) return;
    fxRaf = requestAnimationFrame(() => { fxRaf = 0; decorateMotion(); });
  }).observe(document.getElementById('main') || document.body, { childList: true, subtree: true });

  // FIRST RUN. This used to open the new-project modal on a 300ms timer:
  // a stranger's first sight of the studio was a dialog demanding a title
  // for a film, in front of a page they had not been allowed to read yet.
  // The modal is now something you choose. renderProjects() puts a real
  // first-run panel in the empty grid instead — what this is, three
  // things to try, and a sample project for people who would rather look
  // at a filled studio than an empty one.

  /* updateStatus() too: the sample (and an import) write the blueprint
     AFTER createProject() has switched to it, so without it the card
     re-rendered at 69% while the resume card and the door beside it
     still read the empty project they were drawn for — 0% and "—". */
  Store.subscribe('projects:changed', () => { renderProjects(); renderProjectSwitcher(); updateStatus(); renderGreeting(); });
Store.subscribe('plan:changed', () => { renderProjects(); renderProjectSwitcher(); });
  Store.subscribe('current:changed',  () => { renderProjects(); renderProjectSwitcher(); updateStatus(); renderGreeting(); });

  window.addEventListener('focus', () => { updateStatus(); detectActivity(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { updateStatus(); detectActivity(); }
  });
  window.addEventListener('storage', (e) => {
    if (!e.key) return;
    const baseKey = e.key.split('__')[0];
    if ([FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY].includes(baseKey)) {
      setTimeout(() => { updateStatus(); detectActivity(); }, 200);
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
