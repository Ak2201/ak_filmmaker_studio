/* ============================================================
   THE STAGE GUIDE — the blueprint's questions, inside the stage
   ------------------------------------------------------------
   The two blueprints (feature.html, short.html) are no longer
   separate destinations. Each stage page carries its own part of
   them as a "Guide" section attached to the open project:

       mountStageGuide(host, { stage })

   appends `<section id="guide" data-tab-label="Guide" data-tab-ignore hidden>` to `host`
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
import PATHS from '../data/story-paths.json';
import { h } from '../lib/dom.js';
import '../styles/stage-guide.css';
import '../styles/blueprint-kit.css';

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
    .map(([k, v]) => {
      const ns = k.slice(0, k.indexOf(':'));
      const id = k.slice(k.indexOf(':') + 1);
      return { ns, id, kind: STEP_ID.test(id) ? 'step' : 'interlude', format: fmt, short: v.short || '' };
    });
}

/* ---- what the Story page already asks ------------------------------
   The Story stage's path (src/data/story-paths.json) draws the
   blueprint's questions INLINE, step by step, so the Guide under it
   leaves those out — a question is on the page once. Only the Story
   stage is filtered; every other stage's Guide is whole. */
const absorbedBy = (format) => {
  const out = new Set();
  for (const p of PATHS[formatKey(format)] || []) {
    for (const a of p.absorbs || []) { const m = /^([a-z]+:[a-z0-9-]+)(?:#.*)?$/.exec(a); if (m) out.add(m[1]); }
  }
  return out;
};

/** guideSteps(), minus the steps the Story path asks inline (Story stage
 *  only). What the Guide section draws. */
export function guideStepsLeft(stage, format) {
  const all = guideSteps(stage, format);
  if (stage !== 'story') return all;
  const gone = absorbedBy(format);
  return all.filter((it) => !gone.has(it.ns + ':' + it.id));
}

/* ---- the part covers' fields --------------------------------------
   The spec is plain data in src/lib/cover-fields.js (shared with the
   project dashboard's Title page, which edits the Story stage's cover
   through the same keys since 19 Oct 2026); re-exported here, where the
   tests and every older caller read it. */
import { COVER_FIELDS, SHORT_COVER_FIELDS, coverFields as coverFieldsOf } from '../lib/cover-fields.js';
export { COVER_FIELDS, SHORT_COVER_FIELDS };

/** The cover fields at the top of a stage's guide, derived from the
 *  `parts` block of the sidecar (feature) — [] when there are none. */
export function coverFields(stage, format) {
  return coverFieldsOf(stage, formatKey(format));
}

/* ---- the section ---------------------------------------------------- */

const TITLES = {
  story: 'Story', screenplay: 'Screenplay', preprod: 'Pre-Production',
  production: 'Production', post: 'Post-Production'
};

function openProject() {
  try { return (Store.currentProject && Store.currentProject()) || null; } catch (e) { return null; }
}

/* The body module keeps a pending debounced write; a stage page
   re-renders on its own events, and a re-mount must not drop the
   last keystroke. */
let flushLast = null;
/* And lets go of its global listeners and observers (renders do not
   reuse the section, so each mount's must not outlive it). */
let detachLast = null;
/* The body module, once it has loaded: a later mount renders from it in the
   same tick instead of showing the placeholder and swapping. */
let bodyMod = null;

/**
 * Append the Guide section for `stage` to `host`. Returns the section.
 * Safe to call on every render of the page: it flushes the previous
 * instance's unsaved answer first.
 */
export function mountStageGuide(host, { stage } = {}) {
  if (!host || !STAGE_IDS.includes(stage)) return null;
  if (flushLast) { try { flushLast(); } catch (e) { /* nothing pending */ } flushLast = null; }
  if (detachLast) { try { detachLast(); } catch (e) { /* already gone */ } detachLast = null; }
  const ac = new AbortController();
  const { signal } = ac;
  let inst = null;
  let io = null;
  detachLast = () => { ac.abort(); if (io) io.disconnect(); if (inst && inst.abort) inst.abort(); };

  const project = openProject();
  const fmt = formatKey(project && project.format);
  const section = h('section#guide.sg', { 'data-tab-label': 'Guide', 'data-tab-ignore': 'true', 'data-stage': stage, hidden: true }, [
    h('header.sg-head', {}, [
      h('p.sg-eyebrow', { text: 'Guide · ' + TITLES[stage] }),
      h('h2.sg-title', { text: stage === 'story' ? 'The cover sheet.' : 'The questions for this stage.' })
    ])
  ]);
  host.append(section);
  /* A deep link (#guide: navigation, blueprint-route, deliverables) opens
     the hidden guide; story does this itself (screenplay also does, harmlessly). */
  if (stage !== 'story') {
    const sync = () => {
      if (!section.isConnected) { ac.abort(); return; }
      const on = location.hash === '#guide';
      if (section.hidden === on) section.hidden = !on;
      if (on) section.scrollIntoView({ behavior: 'instant', block: 'start' });
    };
    sync();
    addEventListener('hashchange', sync, { signal });
  }

  /* No project: the section stays (it is a nav target) with its heading
     only. The red NO PROJECT OPEN banner above the page already says so
     and links to the hub (owner, 11 Oct 2026: say it once). */
  if (!project) return section;

  const items = guideStepsLeft(stage, fmt);
  const cover = coverFields(stage, fmt);
  if (!items.length && !cover.length) {
    section.append(h('p.sg-empty', { text: 'This stage has no blueprint questions.' }));
    return section;
  }

  section.append(h('p.sg-deck', {
    text: stage === 'story'
      ? 'Every question the ' + (fmt === 'short' ? 'Short Film' : 'Feature') + ' Blueprint asks for the story is answered in the path above, once. What is left here is the film’s cover sheet for “' + (project.title || 'this film') + '”: its title, writer and draft, the same answers the project dashboard’s Title page edits.'
      : 'These are the ' + (fmt === 'short' ? 'Short Film' : 'Feature') + ' Blueprint’s questions for '
      + TITLES[stage].toLowerCase() + ', answered here for “' + (project.title || 'this film')
      + '”. Your answers are the blueprint’s own — the same ones, saved in the same place.'
  }));
  const body = h('div.sg-body', { 'aria-live': 'polite' }, bodyMod ? [] : [
    h('p.sg-loading', { text: 'Loading the questions…' })
  ]);
  section.append(body);
  if (bodyMod) {
    try {
      inst = bodyMod.renderGuide(body, { stage, format: fmt, items, fields: cover, stepper: true });
      flushLast = inst && inst.flush;
      return section;
    } catch (e) { console.warn('[stage-guide] sync render failed', e); }
  }

  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    import('./stage-guide-body.js').then((m) => {
      bodyMod = m;
      if (!body.isConnected || signal.aborted) return;
      inst = m.renderGuide(body, { stage, format: fmt, items, fields: cover, stepper: true });
      flushLast = inst && inst.flush;
    }).catch((e) => {
      started = false;
      console.warn('[stage-guide] could not load', e);
      body.replaceChildren(h('p.sg-empty', { text: 'The guide could not load. Reload the page to try again.' }));
    });
  };

  /* HIDDEN BUT ALIVE (Celtx simplification). The section is out of the tab
     strip (data-tab-ignore) and `hidden`, so nothing observes it and the
     visibility trigger below would never fire — yet the blueprint's
     answers (their data-keys) must still be in the DOM for verify's
     key-union and for the merge-write. So the body is mounted now. */
  if (section.hidden) { start(); return section; }

  /* Near the screen, or asked for by the hash, or the tab shown. */
  const wanted = () => (location.hash || '') === '#guide';
  if (wanted() || typeof IntersectionObserver === 'undefined') { start(); return section; }
  io = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) { io.disconnect(); start(); }
  }, { rootMargin: '600px 0px' });
  io.observe(section);
  const onHash = () => {
    if (!section.isConnected) { removeEventListener('hashchange', onHash); return; }
    if (wanted()) { io.disconnect(); removeEventListener('hashchange', onHash); start(); }
  };
  addEventListener('hashchange', onHash, { signal });
  return section;
}

export default { STAGE_IDS, guideSteps, guideStepsLeft, coverFields, mountStageGuide, formatKey };
