/* ============================================================
   THE STAGE GUIDE — the blueprint's questions, inside the stage
   ------------------------------------------------------------
   The two blueprints (feature.html, short.html) are no longer
   separate destinations. Each stage page carries its own part of
   them as a "Guide" section attached to the open project:

       mountStageGuide(host, { stage })

   appends `<section id="guide" data-tab-label="Guide">` to `host`
   (always — with no project it says so and links to the hub), and
   guideSteps(stage, format) answers "which blueprint steps are in
   this stage" as plain data, for the section, the tests and any
   redirect that needs it.

   THE MAP IS DERIVED, NEVER LISTED. src/data/steps.stages.json maps
   every `<ns>:<id>` to a stage; this file only filters it. A step
   added to the sidecar appears in its stage with no edit here. The
   one thing written down is WHERE an interlude sits (two ids that
   are not steps and so have no number to sort by) — placement, not
   membership.

   ONE BLOB, ONE SAVE PATH. The answers stay in
   fms_filmmaker_combined_v1 / fms_shortfilm_blueprint_v1 and are
   written only through src/lib/blueprint-store.js writeFields(), a
   merge-write of the keys the person touched. The blueprint pages
   rebuild their whole blob from their own fields; this never does.

   TWO HALVES. This is the light one: the section's frame, the map
   and the cover-field spec — JSON and a few functions, safe to
   import in Node. The step records, renderStep() and the widgets are
   in stage-guide-body.js, fetched when the section is near the
   screen, so a stage page's first paint does not download both
   blueprints (the drawer's rule, src/ui/blueprint-drawer.js).
   ============================================================ */
import Store from '../lib/store.js';
import STAGES from '../data/steps.stages.json';
import { h } from '../lib/dom.js';
import '../styles/stage-guide.css';

export const STAGE_IDS = ['story', 'screenplay', 'preprod', 'production', 'post'];

const STEPS = STAGES.steps || {};
const list = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

/* Interludes are not steps: they hold no number, so they carry no
   sort key of their own. Each sits after the step it always sat
   after on feature.html (the AFTER table in src/pages/feature.js). */
const AFTER = {
  'feature:treatment-ladder': 'step-02',
  'feature:write-the-draft': 'step-12'
};

const STEP_ID = /^step-(\d+)$/;

function sortKey(k) {
  const id = k.slice(k.indexOf(':') + 1);
  const m = STEP_ID.exec(id);
  if (m) return +m[1] * 10;
  const anchor = AFTER[k] && STEP_ID.exec(AFTER[k]);
  return anchor ? +anchor[1] * 10 + 5 : 9999;
}

/** 'short' → the short film's blueprint; anything else → the feature's. */
export function formatKey(format) { return format === 'short' ? 'short' : 'feature'; }

/**
 * The blueprint steps in `stage` for this format, in order, as
 * `{ ns, id, kind, format }`. `kind` is 'step' or 'interlude'.
 * A step whose `stage` is a list (the short's step 09) is in each.
 * Pure: reads the sidecar only.
 */
export function guideSteps(stage, format) {
  const fmt = formatKey(format);
  const mine = fmt === 'short'
    ? (ns) => ns === 'short'
    : (ns) => ns === 'feature' || ns === 'production';
  return Object.entries(STEPS)
    .filter(([k, v]) => mine(k.slice(0, k.indexOf(':'))) && list(v.stage).includes(stage))
    .sort((a, b) => sortKey(a[0]) - sortKey(b[0]))
    .map(([k]) => {
      const ns = k.slice(0, k.indexOf(':'));
      const id = k.slice(k.indexOf(':') + 1);
      return { ns, id, kind: STEP_ID.test(id) ? 'step' : 'interlude', format: fmt };
    });
}

/* ---- the part covers' fields --------------------------------------
   A cover holds saved fields (v1_*, v2_*, p3_*, p4_* — somebody's
   writing). The covers' markup is a string inside feature.js, which
   is a page, not a module, so the fields are restated here: key,
   label and placeholder. scripts/test-stage-guide.mjs reads feature.js
   and short.js and fails if any key here has stopped existing there.
   The cover ids are the ones steps.stages.json `parts` names. */
const GENRES = ['Drama', 'Romance', 'Thriller', 'Crime / Noir', 'Comedy', 'Action', 'Horror',
  'Sci-Fi', 'Fantasy', 'Family', 'Coming-of-Age', 'Biopic', 'Documentary', 'Anthology',
  'Experimental', 'Other'];

export const COVER_FIELDS = {
  'vol-1': [
    { key: 'meta_title', label: 'Project title', placeholder: 'Untitled film' },
    { key: 'meta_writer', label: 'Writer / Director', placeholder: 'Your name' },
    { key: 'meta_started', label: 'Started on', placeholder: 'DD / MM / YYYY' },
    { key: 'meta_stage', label: 'Stage', placeholder: 'Story / Screenplay / Pre-prod…' },
    { key: 'v1_title', label: 'Working title', placeholder: 'Untitled film' },
    { key: 'v1_genre', label: 'Genre', options: GENRES, empty: 'Pick a genre...' },
    { key: 'v1_draft', label: 'Draft', placeholder: '01 — Treatment' }
  ],
  'part-2': [],
  'vol-2': [
    { key: 'v2_director', label: 'Director' },
    { key: 'v2_producer', label: 'Producer' },
    { key: 'v2_start', label: 'Pre-prod start', placeholder: 'DD / MM / YYYY' },
    { key: 'v2_shoot', label: 'Target shoot start', placeholder: 'DD / MM / YYYY' },
    { key: 'v2_budget', label: 'Estimated budget' }
  ],
  'phase-3': [
    { key: 'p3_start', label: 'First day of shoot', placeholder: 'DD / MM / YYYY' },
    { key: 'p3_days', label: 'Shoot days planned', placeholder: 'e.g. 28' },
    { key: 'p3_ad', label: '1st AD' },
    { key: 'p3_base', label: 'Unit base', placeholder: 'Chennai, Madurai…' }
  ],
  'phase-4': [
    { key: 'p4_editor', label: 'Editor' },
    { key: 'p4_sound', label: 'Sound designer' },
    { key: 'p4_music', label: 'Composer' },
    { key: 'p4_lock', label: 'Target lock date', placeholder: 'DD / MM / YYYY' }
  ]
};

/* The short film has one cover, not five; its fields sit with the
   first stage. */
export const SHORT_COVER_FIELDS = [
  { key: 'meta_title', label: 'Project title', placeholder: 'Untitled short' },
  { key: 'meta_writer', label: 'Writer / Director', placeholder: 'Your name' },
  { key: 'meta_started', label: 'Started on', placeholder: 'DD / MM / YYYY' },
  { key: 'meta_runtime', label: 'Target runtime', placeholder: 'e.g. 8 min' }
];

/** The cover fields at the top of a stage's guide, derived from the
 *  `parts` block of the sidecar (feature) — [] when there are none. */
export function coverFields(stage, format) {
  if (formatKey(format) === 'short') return stage === 'story' ? SHORT_COVER_FIELDS : [];
  const part = list((STAGES.parts || {}).feature).find((p) => p.stage === stage);
  return (part && COVER_FIELDS[part.cover]) || [];
}

/* ---- the section ---------------------------------------------------- */

const TITLES = {
  story: 'Story', screenplay: 'Screenplay', preprod: 'Pre-production',
  production: 'Production', post: 'Post-production'
};

function openProject() {
  try { return (Store.currentProject && Store.currentProject()) || null; } catch (e) { return null; }
}

/* The body module keeps a pending debounced write; a stage page
   re-renders on its own events, and a re-mount must not drop the
   last keystroke. */
let flushLast = null;

/**
 * Append the Guide section for `stage` to `host`. Returns the section.
 * Safe to call on every render of the page: it flushes the previous
 * instance's unsaved answer first.
 */
export function mountStageGuide(host, { stage } = {}) {
  if (!host || !STAGE_IDS.includes(stage)) return null;
  if (flushLast) { try { flushLast(); } catch (e) { /* nothing pending */ } flushLast = null; }

  const project = openProject();
  const fmt = formatKey(project && project.format);
  const section = h('section#guide.sg', { 'data-tab-label': 'Guide', 'data-stage': stage }, [
    h('header.sg-head', {}, [
      h('p.sg-eyebrow', { text: 'Guide · ' + TITLES[stage] }),
      h('h2.sg-title', { text: 'The questions for this stage.' })
    ])
  ]);
  host.append(section);

  if (!project) {
    section.append(h('p.sg-empty', {}, [
      'Open a project to answer these. ',
      h('a', { href: 'index.html', text: 'Choose or start one on the hub →' })
    ]));
    return section;
  }

  const items = guideSteps(stage, fmt);
  if (!items.length) {
    section.append(h('p.sg-empty', { text: 'This stage has no blueprint questions.' }));
    return section;
  }

  section.append(h('p.sg-deck', {
    text: 'These are the ' + (fmt === 'short' ? 'Short Film' : 'Feature') + ' Blueprint’s questions for '
      + TITLES[stage].toLowerCase() + ', answered here for “' + (project.title || 'this film')
      + '”. Your answers are the blueprint’s own — the same ones, saved in the same place.'
  }));
  const body = h('div.sg-body', { 'aria-live': 'polite' }, [
    h('p.sg-loading', { text: 'Loading the questions…' })
  ]);
  section.append(body);

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    import('./stage-guide-body.js').then((m) => {
      if (!body.isConnected) return;
      const inst = m.renderGuide(body, { stage, format: fmt, items, fields: coverFields(stage, fmt) });
      flushLast = inst && inst.flush;
    }).catch((e) => {
      started = false;
      console.warn('[stage-guide] could not load', e);
      body.replaceChildren(h('p.sg-empty', { text: 'The guide could not load. Reload the page to try again.' }));
    });
  };

  /* Near the screen, or asked for by the hash, or the tab shown. */
  const wanted = () => (location.hash || '') === '#guide';
  if (wanted() || typeof IntersectionObserver === 'undefined') { start(); return section; }
  const io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  const onHash = () => {
    if (!section.isConnected) { removeEventListener('hashchange', onHash); return; }
    if (wanted()) { io.disconnect(); removeEventListener('hashchange', onHash); start(); }
  };
  addEventListener('hashchange', onHash);
  return section;
}

export default { STAGE_IDS, guideSteps, coverFields, mountStageGuide, formatKey };
