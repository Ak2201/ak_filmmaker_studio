/* ============================================================
   STORY — the Story stage's workspace (PRD 2.0 §4.5, plan rev. 3 §1)
   ------------------------------------------------------------
   A story is written along a PATH, and the path is on the PAGE: every
   step is a section, one under another, with a row of links above them
   (no tabs, no drop-downs — the owner's rule). There are TWO paths,
   one per project format, in src/data/story-paths.json:

     feature  Idea · Logline · Story Bible · Scene order · Step outline ·
              Setups & payoffs · Timeline · Synopsis & treatment ·
              Lock the outline · To the Screenplay
     short    Seed · Logline · Character · World · Conflict · Scene order ·
              Step outline · Synopsis · Lock the outline · To the Screenplay

   so a short film never meets the feature's road with steps missing.
   Beats & Pacing and the Pitch deck follow as ordinary sections, then
   the Guide (the film's cover sheet).

   EACH QUESTION IS ASKED ONCE. The blueprint's steps are drawn INLINE
   inside the path step that owns them (the story-paths.json `absorbs`
   lists), through the same renderer and the same merge-write the Stage
   Guide uses, so an answer is the blueprint's own and the Guide no
   longer repeats them. The Story Bible's cards draw the blueprint's
   character / stakes / theme / world fields (src/ui/story-bible.js).

   NO FORMAT IS CHOSEN FIRST. The outline is laid out against the
   format's suggestion until the writer picks a beat sheet in Scene
   order — and the script can be written without ever doing so.

   GUIDED, NOT GATED. Every step is reachable at any time, and the old
   ways in stay: the sample, a synopsis you already have, or a file. NO
   STEP IS MANDATORY: a tick only means "has something in it". Which
   step is lit is in memory (and in the address bar as #path-<id>; the
   old #path-N numbers still land on the step they always did); what is
   DONE is derived from the story, never stored. The one thing stored
   about the path itself is the outline lock (`outlineLockedAt`).

   WHAT THE PAGE HOLDS IN MEMORY AND NOTHING ELSE: the lit path step,
   whether the synopsis is being edited or tagged, which beat card is
   lit, the one-level Undo of a synopsis build, the last send to the
   Screenplay, AI suggestions not yet added, and the AI job in flight.
   None of that is a fact about the film, and `verify` asserts zero idle
   localStorage writes.

   OFFSETS. The tagging pane renders the synopsis as text nodes and
   <mark> elements and nothing else, under `white-space: pre-wrap`, so
   the character offset of a selection is the length of a Range from
   the pane's start to the selection — the same string the model
   indexes. Add any other node to that pane and every new tag lands in
   the wrong place.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/ai.css';
import '../styles/story.css';
import '../styles/pdf.css';

import Store from '../lib/store.js';
import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput, preservingFocus } from '../lib/autosave.js';
import * as Story from '../lib/story.js';
import Scenes from '../lib/scenes.js';
import Pitch from '../lib/pitch-deck.js';
/* The import, the sample, the exports, the blueprint's beat fields and
   the curve are shared with the blueprints' Part I panels, so they live
   in src/lib/story-io.js and src/ui/story-kit.js and this page uses
   them from there — one copy each. */
import IO from '../lib/story-io.js';
import { renderHeat as kitHeat, renderFlags as kitFlags, importSynopsis } from '../ui/story-kit.js';
import { renderLoglineWorkshop } from '../ui/logline-workshop.js';   // AI logline check + variants
import { learn } from '../ui/learn.js';
import { onFavChange, favStudy, favSlug, loadFavStudiesSoon } from '../ui/fav-film.js';
import { renderBibleBody, wireBible, rewireNotes, shortShowsCard } from '../ui/story-bible.js';
import { mountStageGuide } from '../ui/stage-guide.js';

const app = document.getElementById('app');

/* The feature blueprint, READ ONLY here (src/lib/story-io.js): the path
   offers its step 01/02 answers for the idea and the logline, and shows
   its step 08 answers beside the Save the Cat! beats — through
   IO.blueprintBeatText(), the one table of which field holds which beat. */

let mode = null;          // 'edit' | 'tag' — null means "decide from the data"
let litBeat = '';         // the beat card whose passages are illuminated
let flashMark = '';       // a mark to scroll to after the next render
let pathStep = null;      // the lit path step's id, or null = derive from the story
let landStep = '';        // a step to scroll to after the next draw (a link, a hash)
let reland = '';          // the step a link landed on: the blueprint hosts above it grow when they load, so land again then
let started = false;      // the start cards were answered this visit
let undoBuild = null;     // one level: the synopsis before the last build
let lastSend = null;      // the scene ids the last send created
let focusStep = '';       // an outline step whose field takes focus next
let AI = null, Panelm = null, aiJob = null, aiStatus = '', aiError = '';
let sugg = {};            // beat key → [suggested text]
let suggJob = null;       // { key, ctrl, status } — one at a time
let suggFail = null;      // { key, error } — shown on that beat until the next try

/* The story as the page sees it: the framework in force is the writer's
   choice once made, else the format's suggestion — never a toolbar
   select. (A save writes that value back, which changes nothing the
   writer chose: `frameworkChosen` is what says whether they did.) */
const story = () => { const s = Story.loadStory(); s.framework = Story.effectiveFramework(s, fmt()); return s; };
const pct = (x) => Math.round(x * 100) + '%';
const scenes = () => { try { return Scenes.listScenes(); } catch (e) { return []; } };
const isEmpty = IO.isEmptyStory;
const projectFormat = () => { try { const p = Store.currentProject && Store.currentProject(); return (p && p.format) || ''; } catch (e) { return ''; } };
const fmt = () => (projectFormat() === 'short' ? 'short' : 'feature');
const pathNow = () => Story.pathFor(fmt());
const stepNow = (id) => Story.pathStepById(id, fmt());
const suggestedFw = () => Story.suggestedFramework(fmt());
const progress = (s) => Story.pathProgress(s, { scenes: scenes(), format: fmt() });
const blueprint = () => IO.readBlueprint('feature');
const bpText = (v) => (typeof v === 'string' ? v.trim() : '');
const bpIdea = () => (fmt() === 'feature' ? bpText(blueprint().s1_whatif) : '');
const bpLogline = () => { if (fmt() !== 'feature') return ''; const b = blueprint(); return bpText(b.s2_log_final) || bpText(b.s2_log2) || bpText(b.s2_log1); };

/* ---- persistence ---------------------------------------------- */

function commit(s, { rerender = true } = {}) {
  Story.saveStory(s);
  if (rerender) render();
}

/* A text field's `change` fires on blur, and blur fires on the
   POINTERDOWN of whatever was clicked next. Redrawing there replaces
   that button before its click arrives, so typing an idea and pressing
   NEXT took two presses. So a field's change saves at once and, while a
   pointer is down, holds the redraw until the click has landed. A Tab
   away redraws at once; preservingFocus() puts the focus back. */
let pointerDown = false, held = false;
document.addEventListener('pointerdown', () => { pointerDown = true; }, true);
document.addEventListener('pointerup', () => {
  pointerDown = false;
  if (held) setTimeout(() => { if (held) { held = false; render(); } }, 0);
}, true);
function commitField(s) {
  Story.saveStory(s);
  if (pointerDown) held = true; else render();
}

/* ---- the ways in (FR-402) ------------------------------------ */

function renderModes() {
  const sec = h('section.st-modes', { 'aria-label': 'Start the story' });
  const card = (eyebrow, title, body, control) =>
    h('div.st-mode', {}, [h('p.bd-eyebrow', { text: eyebrow }), h('h2.st-mode-title', { text: title }),
      h('p.st-mode-body', { text: body }), control]);
  sec.append(card('Sample', 'Start from Dragon.',
    'The sample project’s story: its idea, logline, a Save the Cat! step outline and the synopsis built from it, ready to tag. A quick way to see what the path, the matrix and the curve do.',
    h('button.btn', { type: 'button', 'data-st': 'sample', text: 'USE THE SAMPLE' })));
  sec.append(card('New', 'Start with the idea.',
    'A guided path: the idea, a logline, the people and the world, a scene order, then a step outline. Every step is on this page; start anywhere. The synopsis can be built from the outline when you get there.',
    h('button.btn.primary', { type: 'button', 'data-st': 'new', text: 'START THE PATH' })));
  sec.append(card('Skip ahead', 'I already have a synopsis.',
    'Paste it and go straight to tagging it against a structure. Every step of the path stays a click away above.',
    h('button.btn', { type: 'button', 'data-st': 'have-synopsis', text: 'PASTE A SYNOPSIS' })));
  const drop = h('label.st-drop', {}, [
    h('span', { text: 'Drop a .docx, .pdf or .txt here, or choose a file' }),
    h('input.st-file', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'data-st-field': 'file' })
  ]);
  sec.append(card('Import', 'Bring a file.',
    'A synopsis or treatment from Word, a PDF or plain text. Nothing is changed until you see it here.', drop));
  return sec;
}

/* The favourite film is chosen in Settings (and shown here only as the
   film the examples are told in, with a link). A change made there
   reaches this page on its next load; the films arriving here ('' —
   nothing was picked) only fill the examples in. */
onFavChange((slug) => (slug ? render() : fillExamples()));

/* ---- the path stepper ---------------------------------------- */

function currentStep(s) {
  return pathStep || Story.defaultPathStep(s, { scenes: scenes(), format: fmt() });
}

/* The row of links above the steps. Every step is on the page below;
   a link scrolls to its step. The lit one is where you last went (or
   where the story is up to). */
function renderStepper(s, cur) {
  const nav = h('nav.st-path', { 'aria-label': 'Story path' });
  const ol = h('ol.st-path-list');
  for (const p of progress(s)) {
    const on = p.id === cur;
    const b = h('button.st-path-tab' + (on ? '.is-on' : '') + (p.done ? '.is-done' : ''), {
      /* data-step is the step's STABLE NUMBER (story-paths.json `n`): the
         blueprint drawer reads it from the current tab to know which
         blueprint steps this path step answers. data-path is the id. */
      type: 'button', 'data-st': 'path', 'data-path': p.id, 'data-step': p.n, 'aria-current': on ? 'step' : null
    }, [
      h('span.st-path-n', { text: String(p.pos) }),
      h('span.st-path-label', { text: p.label }),
      h('span.st-path-state', { text: p.done ? (p.detail ? 'Done · ' + p.detail : 'Done') : 'To do' })
    ]);
    ol.append(h('li', {}, [b]));
  }
  nav.append(ol);
  return nav;
}

/* The words under every step's title are explained with the favourite
   film, in a closed box (src/ui/learn.js — null for a topic with no
   content yet, so it is filtered before append). */
const LEARN_TOPIC = { idea: 'idea', logline: 'logline', bible: 'story-bible', character: 'character', world: 'world', conflict: 'conflict', structure: 'beat-sheet', outline: 'step-outline', synopsis: 'synopsis', screenplay: 'screenplay' };
const learnBox = (topic) => {
  let el = null;
  try { el = learn(topic); } catch (e) { el = null; }   // no film given: the project's favourite
  return el;
};
/* A Bible or blueprint write changes which steps have something in
   them, and the page is not redrawn for a field (that would cost the
   caret): the stepper's ticks are replaced in place instead. */
function refreshStepper() {
  const old = document.querySelector('nav.st-path');
  if (!old) return;
  const s = story();
  old.replaceWith(renderStepper(s, currentStep(s)));
}
/* A Bible write changes what the blueprint's derived views (the relationship
   map) and the stepper's ticks read: refresh both, in place. */
wireBible({ getStory: story, saved: () => { refreshStepper(); pullBlueprintHosts(); }, film: favSlug, rerender: render });

const stepHead = (id, title, lead) => [
  h('p.bd-eyebrow', { text: 'Step ' + stepNow(id).pos + ' of ' + pathNow().length }),
  h('h2.bd-h2', { text: title }),
  lead ? h('p.bd-sub', { text: lead }) : null,
  learnBox(LEARN_TOPIC[id])
].filter(Boolean);
/* Next suggests the first step AFTER this one with nothing in it; it is
   a suggestion and never a gate (the stepper reaches any step). */
const nextBtn = (s, id) => {
  const nx = Story.suggestNext(progress(s), id);
  if (!nx) return null;
  return h('div.st-step-nav', {}, [
    h('button.btn.primary', { type: 'button', 'data-st': 'path', 'data-path': nx.id, text: 'NEXT: ' + nx.label.toUpperCase() })
  ]);
};
/* A film's own words for a step (the favourite film, chosen in Settings).
   The films are imported a moment after first paint (fav-film.js), so the
   box is drawn empty and FILLED IN PLACE when they land: a redraw of the
   whole page would re-mount the shell, which writes its rail state, and a
   page that writes while idle fails the gate's save-loop check. */
const EXAMPLE_OF = { idea: (st) => st.concept && st.concept.premise, logline: (st) => st.logline && st.logline.line };
function exampleParts(kind) {
  const st = favStudy();
  const text = st && EXAMPLE_OF[kind](st);
  if (!text) return [];
  return [
    h('p.st-example', {}, [h('span.st-example-k', { text: st.meta.title + ': ' }), '“' + text + '”']),
    /* The favourite film is a Settings choice, not a control on this page. */
    h('p.st-example-from', {}, ['Examples from ' + st.meta.title + ' · ', h('a', { href: 'settings.html#favourite', text: 'change in Settings' })])
  ];
}
const exampleBox = (kind) => h('div.st-example-wrap', { 'data-example': kind }, exampleParts(kind));
function fillExamples() {
  document.querySelectorAll('[data-example]').forEach((el) => el.replaceChildren(...exampleParts(el.getAttribute('data-example'))));
}

/* A blank project's first step, once the start cards have been
   answered or skipped (a #path-1 link, ?start=new, the stepper): the
   same three ways in, in one line above the empty field, so nobody
   meets a bare textarea and wonders. Derived from the story on every
   render, hidden the moment any field has text, stored nowhere. The
   import is the same control the bar carries; the sample is the one
   the start cards offer. */
function renderWaysIn() {
  return h('div.st-offer.st-ways', { role: 'group', 'aria-label': 'Three ways in' }, [
    h('p.st-offer-text', {}, [
      h('span.st-example-k', { text: 'Three ways in: ' }),
      'start from an idea below, paste a synopsis you already have, or import one from a .docx or .txt file. '
      + 'Or open the sample film to see a finished one.'
    ]),
    h('button.btn.primary', { type: 'button', 'data-st': 'ways-idea', text: 'START FROM AN IDEA' }),
    h('button.btn', { type: 'button', 'data-st': 'have-synopsis', text: 'PASTE A SYNOPSIS' }),
    h('label.btn.st-import', {}, [
      h('span', { text: 'IMPORT A .DOCX OR .TXT' }),
      h('input.st-file', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf', 'data-st-field': 'file', 'aria-label': 'Import a synopsis from a .docx, .txt or .pdf file' })
    ]),
    h('button.btn', { type: 'button', 'data-st': 'sample', text: 'OPEN THE SAMPLE FILM' })
  ]);
}

/* ---- the blueprint's questions, drawn inline -----------------------
   A path step that absorbs blueprint questions (story-paths.json) gets a
   HOST: one element per block of questions, drawn once by the stage
   guide's own renderer (src/ui/stage-guide-body.js — same fields, same
   data-keys, same merge-write into the blueprint's blob) and kept for
   the life of the page. The page redraws often (a framework pick, a step
   added); a host is re-attached, never rebuilt, so a half-typed answer
   and the caret survive, and a pending write is never dropped. The
   renderer is fetched once, right after the first draw — it is the same
   chunk the Guide would fetch, and it is the only way these keys reach
   the page. */
const bpHosts = new Map();   // key -> { items, el, node, started, inst }
function bpBlock(key, items, wrap) {
  if (!items || !items.length) return null;
  let r = bpHosts.get(key);
  if (!r) {
    const el = h('div.st-bp', { 'data-bp': key }, [h('p.sg-loading', { text: 'Loading the questions…' })]);
    r = { items, el, node: wrap ? wrap(el) : el, started: false, inst: null };
    bpHosts.set(key, r);
  }
  return r.node;
}
const stepItems = (id) => Story.absorbItems(stepNow(id).absorbs, fmt());
const bpSteps = (id, wrap) => bpBlock(id, stepItems(id).steps, wrap);
const sub = (title, lead) => [h('h3.st-sub', { text: title }), lead ? h('p.st-muted', { text: lead }) : null].filter(Boolean);
/* Element.append(null) inserts the text "null" (CLAUDE.md): filter first. */
const put = (el, ...kids) => { el.append(...kids.flat().filter(Boolean)); return el; };

let bpSaveTimer = 0;
function startBlueprintHosts() {
  const todo = [...bpHosts.values()].filter((r) => !r.started);
  if (!todo.length) return;
  todo.forEach((r) => { r.started = true; });
  import('../ui/stage-guide-body.js').then((m) => {
    for (const r of todo) {
      try {
        const inst = m.renderGuide(r.el, { stage: 'story', format: fmt(), items: r.items, fields: [] });
        r.inst = inst;
      } catch (e) { console.warn('[story] blueprint step failed', r.items, e); }
    }
    rewireNotes();      // the Bible's pencils point at the whole document again
    refreshStepper();   // the answers read from the blueprint tick their steps
    if (reland) {       // a link landed above blocks that were still loading: land again, unless the reader has moved
      const el = document.getElementById('path-' + reland);
      if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
    }
  }).catch((e) => {
    todo.forEach((r) => { r.started = false; });
    console.warn('[story] the blueprint questions could not load', e);
  });
}
/* Re-read the blueprint into every host (a write made by the Bible cards
   changes what a derived view in a host draws). A host with a write
   waiting is left alone: its own answer is the newer. */
let pullTimer = 0;
function pullBlueprintHosts() {
  clearTimeout(pullTimer);
  pullTimer = setTimeout(() => { for (const r of bpHosts.values()) { if (r.inst && r.inst.pull) { try { r.inst.pull(); } catch (e) { /* not drawn yet */ } } } }, 500);
}

/* A blueprint answer typed in a host: its steps' ticks, a moment after. */
function watchBlueprintInput() {
  const note = (e) => {
    if (!e.target.closest || !e.target.closest('.st-bp')) return;
    clearTimeout(bpSaveTimer);
    bpSaveTimer = setTimeout(refreshStepper, 700);
  };
  document.addEventListener('input', note);
  document.addEventListener('change', note);
  document.addEventListener('click', (e) => { if (e.target.closest && e.target.closest('.st-bp .step-check li')) note(e); });
}
watchBlueprintInput();

/* ---- 1 · the idea ------------------------------------------------ */

function renderIdea(s) {
  const short = fmt() === 'short';
  const sec = h('section#path-idea.st-step.glossary-scope', { 'data-path': 'idea', 'aria-label': short ? 'The seed' : 'The idea' }, stepHead('idea', short ? 'The seed' : 'The idea',
    short
      ? 'What is the film, in a sentence or two? A single image, a moment, a question. A short film is one thing; nothing here is final.'
      : 'What is the film, in a sentence or two? A “what if”, an image, a question that will not leave you alone. Nothing here is final.'));
  // Only when the start cards are NOT on the page: two copies of the same offer is noise.
  if (isEmpty(s) && started) sec.append(renderWaysIn());
  sec.append(h('label.st-label', { for: 'stIdea', text: short ? 'Your seed' : 'Your idea' }));
  const ta = h('textarea#stIdea.st-text', { rows: 3, 'data-st-field': 'idea', spellcheck: 'true' });
  ta.value = s.idea;
  sec.append(ta);
  const bpi = bpIdea();
  if (!s.idea.trim() && bpi) sec.append(offerBlueprint('idea', 'Feature blueprint, step 01', bpi));
  put(sec, exampleBox('idea'),
    sub(short ? 'The seed, the image, why you' : 'Your spark', short
      ? 'The blueprint’s own questions for a seed. Answer what you can.'
      : 'The blueprint’s own questions for an idea: the what-if, the image and why it has to be you.'),
    bpSteps('idea'), nextBtn(s, 'idea'));
  return sec;
}

/* ---- 2 · the logline ---------------------------------------------- */

function renderLogline(s) {
  const sec = h('section#path-logline.st-step.glossary-scope', { 'data-path': 'logline', 'aria-label': 'The logline' }, stepHead('logline', 'The logline',
    'One sentence: who the story is about, what they want, what stands in the way, and what it costs if they fail.'));
  sec.append(h('label.st-label', { for: 'stLogline', text: 'Your logline' }));
  const ta = h('textarea#stLogline.st-text', { rows: 3, 'data-st-field': 'logline', spellcheck: 'true' });
  ta.value = s.logline;
  sec.append(ta);
  const bpl = bpLogline();
  if (!s.logline.trim() && bpl) sec.append(offerBlueprint('logline', 'Feature blueprint, step 02', bpl));
  put(sec, exampleBox('logline'),
    renderLoglineWorkshop(s, { AI, Panelm, getStory: story, rerender: render, format: projectFormat, setLogline: (t) => { const x = story(); x.logline = t; commit(x); } }),
    sub('Drafts, then the final one', 'Write it three ways — a first go, a sharper one, the one you will use — then keep the best as your logline above.'),
    bpSteps('logline'),
    earlierLadder('logline', 'Earlier version of your logline (treatment ladder, rung 1)',
      [h('button.btn', { type: 'button', 'data-st': 'use-lad1', text: 'USE THIS AS MY LOGLINE' })]),
    nextBtn(s, 'logline'));
  return sec;
}

/* The treatment ladder's rungs a step takes, in a closed "earlier answers"
   box (an answer a person wrote in the blueprint stays one click away,
   in the one place it is asked) — or open, under its own heading. */
function earlierLadder(id, title, extra = [], { open = false } = {}) {
  const g = stepItems(id);
  if (!g.ladder) return null;
  return bpBlock(id + ':ladder', [g.ladder], (el) => {
    if (open) return h('div.st-ladder', {}, [h('h3.st-sub', { text: title }), el, ...extra]);
    return h('details.st-earlier', {}, [h('summary', { text: title }), el, ...extra]);
  });
}

function offerBlueprint(field, where, text) {
  return h('div.st-offer', {}, [
    h('p.st-offer-text', {}, [h('span.st-example-k', { text: where + ': ' }), '“' + (text.length > 240 ? text.slice(0, 237) + '…' : text) + '”']),
    h('button.btn', { type: 'button', 'data-st': 'use-bp', 'data-field': field, text: 'USE MY BLUEPRINT ANSWER' })
  ]);
}

/* A format's tension convention as a small curve: one line, the
   accent's deep tone, no fill colour carrying meaning. */
function miniCurve(fw) {
  const ns = 'http://www.w3.org/2000/svg';
  const W = 120, H = 36, pad = 3;
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('class', 'st-mini');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const beats = [...fw.beats].sort((a, b) => a.at - b.at);
  const pts = beats.map((b) => [pad + b.at * (W - pad * 2), H - pad - ((b.tension - 1) / 9) * (H - pad * 2)]);
  const area = document.createElementNS(ns, 'polygon');
  area.setAttribute('points', [[pts[0][0], H - pad], ...pts, [pts[pts.length - 1][0], H - pad]].map((p) => p.join(',')).join(' '));
  area.setAttribute('class', 'st-mini-area');
  const line = document.createElementNS(ns, 'polyline');
  line.setAttribute('points', pts.map((p) => p.join(',')).join(' '));
  line.setAttribute('class', 'st-mini-line');
  svg.append(area, line);
  for (const p of pts) {
    const c = document.createElementNS(ns, 'circle');
    c.setAttribute('cx', p[0]); c.setAttribute('cy', p[1]); c.setAttribute('r', 1.8);
    c.setAttribute('class', 'st-mini-dot');
    svg.append(c);
  }
  return svg;
}

function renderStructure(s) {
  const short = fmt() === 'short';
  const sec = h('section#path-structure.st-step.glossary-scope', { 'data-path': 'structure', 'aria-label': 'Scene order' }, stepHead('structure', 'Scene order',
    'The order your story’s big moments come in — pick a beat sheet to lay them out. You do not have to: the outline and the script work without one.'));
  sec.append(h('p.st-muted', {
    text: 'Every format is here. The suggestion is only a suggestion, and switching later is a view change: your steps keep the beat they were written under, and anything that does not fit the new format is listed rather than lost.'
  }));
  const grid = h('div.st-fw-grid');
  const sug = suggestedFw();
  for (const f of Story.frameworks()) {
    const on = s.frameworkChosen && f.id === s.framework;
    const peak = [...f.beats].sort((a, b) => b.tension - a.tension)[0];
    grid.append(h('button.st-fw' + (on ? '.is-on' : ''), {
      type: 'button', 'data-st': 'pick-fw', 'data-fw': f.id, 'aria-pressed': String(on)
    }, [
      h('span.st-fw-top', {}, [
        h('span.st-fw-name', { text: f.label }),
        f.id === sug ? h('span.st-badge', { text: 'Suggested' }) : null,
        on ? h('span.st-badge.is-on', { text: 'In use' }) : null
      ]),
      h('span.st-fw-count', { text: f.beats.length + ' beats · peaks at ' + peak.label }),
      miniCurve(f),
      h('span.st-fw-suits', { text: f.suits || f.blurb || '' })
    ]));
  }
  sec.append(grid);
  if (!s.frameworkChosen) {
    sec.append(h('p.st-using', { role: 'status', text: 'Using ' + Story.frameworkById(s.framework).label + ' until you choose a scene order.' }));
  }
  put(sec,
    sub(short ? 'Your five beats' : 'Your beat notes', short
      ? 'One line for each of the short film’s five beats, and the test it has to pass.'
      : 'The fifteen beats, in your own words. They show beside the matching beat in the step outline.'),
    bpSteps('structure'), nextBtn(s, 'structure'));
  return sec;
}

/* ---- 3 · the Story Bible (src/ui/story-bible.js) -------------- */

const BIBLE_STEP = {
  bible: ['Story Bible', 'The facts of your film in one place: who is in it, what it is fought over, what is at stake, what it is about and where it happens. Fill what you know; none of it is required.'],
  character: ['Character', 'Who is the film about? Their name, what they want, what stands in their way, and the turn that changes everything. Add anyone else who matters.'],
  world: ['World', 'Where and when it happens, and the few rules of the place. A short film has room for one location done well.'],
  conflict: ['Conflict', 'What the film is fought over, and against what. Pick every kind that applies, then say it in one line.']
};
function renderBible(s, id = 'bible') {
  const [title, lead] = BIBLE_STEP[id];
  const sec = h('section#path-' + id + '.st-step.glossary-scope', { 'data-path': id, 'aria-label': title }, stepHead(id, title, lead));
  let cards = stepNow(id).cards.slice();
  /* A short film never sees a feature-only card (stakes, theme) — unless
     the feature keys behind it already hold an answer, so nothing written
     is hidden. */
  if (fmt() === 'short' && id === 'conflict') cards = cards.concat(['stakes', 'theme'].filter(shortShowsCard));
  sec.append(renderBibleBody({ cards, format: fmt() }));
  /* The blueprint's own notes for these steps (formula, craft, examples, the
     relationship map) and its "before moving on" checklists — everything
     but the questions, which the cards above ask. */
  put(sec, bpSteps(id, (el) => {
    el.classList.add('st-bp-notes');
    return h('details.st-earlier', {}, [h('summary', { text: 'The blueprint’s notes and checklist for this step' }), el]);
  }), nextBtn(s, id));
  return sec;
}

/* ---- 4 · the step outline ------------------------------------ */

function renderOutline(s) {
  const o = Story.outlineByBeat(s, s.framework);
  const fw = o.fw;
  const locked = !!s.outlineLockedAt;
  const sec = h('section#path-outline.st-step.glossary-scope', { 'data-path': 'outline', 'aria-label': 'Step outline' }, stepHead('outline', 'Step outline · ' + fw.label,
    'A numbered list of what happens, beat by beat. One or two lines a step. Add, reorder and move steps between beats as the story finds its shape.'));
  if (!s.frameworkChosen) {
    sec.append(h('p.st-using', {}, [
      'Using ' + fw.label + ' until you choose a scene order. ',
      h('button.st-link', { type: 'button', 'data-st': 'path', 'data-path': 'structure', text: 'Choose one' })
    ]));
  }
  if (locked) {
    sec.append(h('p.st-locked', { role: 'status' }, [
      h('strong', { text: 'Locked ' + lockedWhen(s.outlineLockedAt) + '. ' }),
      'The outline is read-only. ',
      h('button.st-link', { type: 'button', 'data-st': 'unlock', text: 'Unlock to edit' })
    ]));
  }
  sec.append(h('p.st-coverage', { role: 'status' }, [
    h('strong', { text: `${o.covered} of ${o.beatsTotal} beats have a step` }),
    ` · ${o.withText} step${o.withText === 1 ? '' : 's'} written` + (o.unplaced.length ? ` · ${o.unplaced.length} not placed in this format` : '')
  ]));
  if (!locked) sec.append(renderSuggestGate(s));
  const bp = fw.id === 'save_the_cat' && fmt() === 'feature' ? blueprint() : null;
  const canSuggest = !!(Panelm && Panelm.hasKey()) && !locked;
  const beatOpts = (sel) => {
    const opts = [h('option', { value: '', text: 'Move to beat…' })];
    fw.beats.forEach((b) => opts.push(h('option', { value: Story.qualifyBeat(fw.id, b.id), text: b.label, selected: Story.qualifyBeat(fw.id, b.id) === sel })));
    return opts;
  };
  const list = h('ol.st-ol-beats');
  let act = null;
  for (const r of o.beats) {
    const li = h('li.st-ol-beat' + (r.steps.length ? '' : '.is-empty'), { 'data-beat-card': r.key });
    const head = h('div.st-ol-head', {}, [
      h('h3.st-ol-name', { text: r.beat.label }),
      h('span.st-beat-at', { text: (r.act !== act ? 'Act ' + r.act + ' · ' : '') + '~' + pct(r.beat.at) })
    ]);
    act = r.act;
    li.append(head);
    li.append(h('p.st-beat-prompt', { text: r.beat.prompt }));
    if (bp) {
      const v = IO.blueprintBeatText('feature', r.beat.id, bp);
      if (v) li.append(h('p.st-ol-bp', {}, [h('span.st-example-k', { text: 'Your blueprint, step 08: ' }), '“' + v + '”']));
    }
    if (r.steps.length) {
      const ol = h('ol.st-ol-steps', { start: String(r.steps[0].n) });
      r.steps.forEach((st, i) => ol.append(renderStepRow(st, beatOpts(st.beat), i === 0, i === r.steps.length - 1, false, locked)));
      li.append(ol);
    }
    const acts = h('div.st-ol-actions');
    if (!locked) acts.append(h('button.btn', { type: 'button', 'data-st': 'step-add', 'data-beat': r.key, text: 'ADD A STEP' }));
    if (canSuggest) {
      const busy = suggJob && suggJob.key === r.key;
      acts.append(busy
        ? h('button.btn', { type: 'button', 'data-st': 'sugg-stop', text: 'STOP' })
        : h('button.btn', { type: 'button', 'data-st': 'sugg-run', 'data-beat': r.key, disabled: !!suggJob, text: 'SUGGEST STEPS FOR THIS BEAT' }));
    }
    if (acts.children.length) li.append(acts);
    if (suggJob && suggJob.key === r.key && Panelm) li.append(Panelm.statusLine(suggJob.status || 'Starting…'));
    if (suggFail && suggFail.key === r.key && Panelm) li.append(Panelm.errorLine(suggFail.error));
    const got = sugg[r.key];
    if (got && got.length) {
      const ul = h('ul.st-sugg', { 'aria-label': 'Suggested steps for ' + r.beat.label });
      got.forEach((t, i) => ul.append(h('li.st-sugg-item', {}, [
        h('span.st-sugg-text', { text: t }),
        h('button.btn', { type: 'button', 'data-st': 'sugg-add', 'data-beat': r.key, 'data-i': i, text: 'ADD' })
      ])));
      ul.append(h('li.st-sugg-item', {}, [h('button.btn.st-x', { type: 'button', 'data-st': 'sugg-clear', 'data-beat': r.key, text: 'DISMISS SUGGESTIONS' })]));
      li.append(ul);
    }
    list.append(li);
  }
  sec.append(list);

  if (o.unplaced.length) {
    const un = h('section.st-unplaced', { 'aria-label': 'Not placed in this format' });
    un.append(h('h3.st-ol-name', { text: 'Not placed in ' + fw.short }));
    un.append(h('p.st-muted', { text: 'These steps were written under another format. They are kept as they are; file them under a beat here, or switch the format back to see them where they were.' }));
    if (o.unplaced.some((u) => u.suggest) && !locked) {
      un.append(h('button.btn', { type: 'button', 'data-st': 'file-all', text: 'FILE ALL BY POSITION' }));
    }
    const ol = h('ol.st-ol-steps', { start: String(o.unplaced[0].n) });
    o.unplaced.forEach((st) => {
      const row = renderStepRow(st, beatOpts(''), true, true, true, locked);
      const meta = h('p.st-ol-from', { text: st.from ? 'Written under ' + st.from.fw.short + ': ' + st.from.beat.label : 'Written under a beat that no longer exists' });
      row.insertBefore(meta, row.children[1] || null);
      if (st.suggest && !locked) {
        row.querySelector('.st-ol-ctl').prepend(h('button.btn', { type: 'button', 'data-st': 'step-file', 'data-step': st.id, text: 'FILE UNDER ' + st.suggest.label.toUpperCase() }));
      }
      ol.append(row);
    });
    un.append(ol);
    sec.append(un);
  }
  put(sec, earlierLadder('outline', 'Earlier step outline (free text, treatment ladder rung 5)',
    [h('p.st-muted', { text: 'The numbered outline above is the one the synopsis and the screenplay read. This is the free-text version from the blueprint, kept as you wrote it.' })]),
    nextBtn(s, 'outline'));
  return sec;
}

const lockedWhen = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : 'on ' + d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) + ' at ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
};

function renderStepRow(st, opts, first, last, unplaced = false, locked = false) {
  const li = h('li.st-ol-step', { 'data-step-row': st.id });
  const fid = 'stStep_' + st.id;
  li.append(h('label.st-ol-n', { for: fid, text: 'Step ' + st.n }));
  const ta = h('textarea#' + fid + '.st-text.st-ol-text', { rows: 2, 'data-st-field': 'step-text', 'data-step': st.id, placeholder: 'What happens?', readonly: locked ? '' : null });
  ta.value = st.text;
  li.append(ta);
  if (locked) return li;
  const ctl = h('div.st-ol-ctl');
  if (!unplaced) {
    ctl.append(h('button.btn.st-x', { type: 'button', 'data-st': 'step-up', 'data-step': st.id, disabled: first, 'aria-label': 'Move step ' + st.n + ' up', text: 'UP' }));
    ctl.append(h('button.btn.st-x', { type: 'button', 'data-st': 'step-down', 'data-step': st.id, disabled: last, 'aria-label': 'Move step ' + st.n + ' down', text: 'DOWN' }));
  }
  ctl.append(h('select.st-retag', { 'data-st-field': 'step-beat', 'data-step': st.id, 'aria-label': 'Move step ' + st.n + ' to another beat' }, opts));
  ctl.append(h('button.btn.st-x', { type: 'button', 'data-st': 'step-del', 'data-step': st.id, 'aria-label': 'Remove step ' + st.n, text: 'REMOVE' }));
  li.append(ctl);
  return li;
}

/* The AI half of the outline, optional and last. With a key: the key
   bar and what is sent, once, and a button on every beat. Without:
   the key form inside a closed disclosure, so the outline is not
   pushed down the page by an obstacle nobody asked to clear. */
function renderSuggestGate(s) {
  if (!Panelm) return null;
  if (Panelm.hasKey()) {
    const kg = Panelm.keyGate('Suggesting steps');
    return h('div.st-sugg-gate', {}, [kg, Panelm.keyBar(),
      Panelm.disclose('Your idea, logline, synopsis, the steps written so far and the names of the ' + Story.frameworkById(s.framework).short + ' beats. Nothing else.')]);
  }
  const det = h('details.st-sugg-gate');
  det.append(h('summary', { text: 'Suggest steps with AI (optional)' }));
  const kg = Panelm.keyGate('Suggesting steps');
  if (kg) det.append(kg);
  return det;
}

/* ---- 5 · the synopsis ---------------------------------------- */

function renderBlueprintStep(s, id, title, lead, subTitle) {
  const sec = h('section#path-' + id + '.st-step.glossary-scope', { 'data-path': id, 'aria-label': title }, stepHead(id, title, lead));
  put(sec, bpSteps(id), nextBtn(s, id));
  return sec;
}

/* ---- the lock ----------------------------------------------------- */

function renderLock(s) {
  const locked = !!s.outlineLockedAt;
  const o = Story.outlineByBeat(s, s.framework);
  const sec = h('section#path-lock.st-step.glossary-scope', { 'data-path': 'lock', 'aria-label': 'Lock the outline' }, stepHead('lock', 'Lock the outline',
    'When the step outline says what you mean, lock it. A lock is a promise to yourself that the outline is finished: it stops taking edits until you unlock it, and the path counts as done. Nothing else changes, and you can unlock at any time.'));
  sec.append(h('p.st-coverage', { role: 'status' }, [
    h('strong', { text: locked ? 'Locked ' + lockedWhen(s.outlineLockedAt) : 'Not locked' }),
    ` · ${o.withText} step${o.withText === 1 ? '' : 's'} written · ${o.covered} of ${o.beatsTotal} beats have a step`
  ]));
  const row = h('div.st-build');
  if (locked) {
    row.append(h('button.btn', { type: 'button', 'data-st': 'unlock', text: 'UNLOCK THE OUTLINE' }));
  } else {
    /* Never disabled: this section is drawn before the step typed a moment ago
       is saved and redrawn, and a button that is disabled at pointer-down
       cannot be clicked. The click checks. */
    row.append(h('button.btn.primary', { type: 'button', 'data-st': 'lock', text: 'LOCK THE OUTLINE' }));
    if (!o.withText) row.append(h('span.st-muted', { text: 'Write a step or two in the step outline first.' }));
  }
  sec.append(row);
  put(sec, nextBtn(s, 'lock'));
  return sec;
}

function renderSynopsisStep(s) {
  const short = fmt() === 'short';
  const sec = h('section#path-synopsis.st-step.glossary-scope', { 'data-path': 'synopsis', 'aria-label': 'Synopsis' }, stepHead('synopsis', short ? 'Synopsis' : 'Synopsis & treatment',
    'The story as prose. Build it from the outline — one paragraph per act, every step tagged with its beat — or write and tag your own.'));
  const o = Story.outlineByBeat(s, s.framework);
  const row = h('div.st-build');
  if (o.withText) {
    row.append(h('button.btn' + (s.source.trim() ? '' : '.primary'), { type: 'button', 'data-st': 'build',
      text: s.source.trim() ? 'REBUILD FROM THE OUTLINE' : 'BUILD MY SYNOPSIS FROM THE OUTLINE' }));
  }
  if (undoBuild) row.append(h('button.btn', { type: 'button', 'data-st': 'build-undo', text: 'UNDO THE BUILD' }));
  if (row.children.length) sec.append(row);
  sec.append(h('p#stWhere.st-where', { 'aria-live': 'polite', text: s.source.trim()
    ? 'Place the caret or select a passage to see where you are against ' + Story.frameworkById(s.framework).short + '.'
    : '' }));
  sec.append(h('div.st-panes', {}, [renderSource(s), renderMatrix(s)]));
  put(sec, earlierLadder('synopsis', 'From synopsis to treatment', [], { open: true }), nextBtn(s, 'synopsis'));
  return sec;
}

/* ---- 6 · to the Screenplay ----------------------------------- */

function renderScreenplay(s) {
  const sec = h('section#path-screenplay.st-step.glossary-scope', { 'data-path': 'screenplay', 'aria-label': 'To the Screenplay' }, stepHead('screenplay', 'To the Screenplay',
    'One placeholder scene per step, each linked to its beat, so Write’s Outline, the Breakdown and the Stripboard have the shape of the story before a page is written. Nothing already in the scene list is changed.'));
  sec.append(h('p.st-muted', { text: 'None of this is required before you write. A scene order, an outline and a lock are all optional: open Write whenever you like and start on the first page.' }));
  const live = new Set(scenes().map((x) => x.id));
  const written = s.outline.filter((x) => x.text.trim());
  const sent = written.filter((x) => x.sceneId && live.has(x.sceneId)).length;
  const todo = written.length - sent;
  sec.append(h('p.st-coverage', { role: 'status' }, [
    h('strong', { text: `${todo} step${todo === 1 ? '' : 's'} to send` }),
    ` · ${sent} already ha${sent === 1 ? 's' : 've'} a scene · ${written.length} written`
  ]));
  const row = h('div.st-build');
  row.append(h('button.btn.primary', { type: 'button', 'data-st': 'send', disabled: !todo, text: 'SEND THE OUTLINE TO SCREENPLAY' }));
  if (lastSend && lastSend.length) row.append(h('button.btn', { type: 'button', 'data-st': 'send-undo', text: 'UNDO THE SEND' }));
  row.append(h('a.btn', { href: 'write.html#outline', text: 'OPEN THE OUTLINE IN WRITE' }));
  sec.append(row);
  if (!written.length) sec.append(h('p.st-muted', { text: 'Write a step or two in the step outline first.' }));
  return sec;
}

/* ---- the heatmap (FR-505) -------------------------------------
   Drawn by src/ui/story-kit.js, which the blueprints' Part I shares;
   here it is interactive — a bar or a flag jumps into the synopsis. */

const renderHeat = (s) => kitHeat(s, { interactive: true });
const renderFlags = (s) => kitFlags(s, { interactive: true });

/* ---- the two panes (FR-502) ----------------------------------- */

function renderSource(s) {
  const pane = h('section.st-pane.st-src-pane', { 'aria-label': 'Source synopsis' });
  const head = h('div.st-pane-head');
  head.append(h('h3.bd-h2', { text: 'Synopsis' }));
  const toggle = h('div.st-toggle', { role: 'group', 'aria-label': 'Synopsis mode' });
  [['tag', 'TAG'], ['edit', 'EDIT']].forEach(([id, label]) => toggle.append(h('button.btn' + (mode === id ? '.is-on' : ''), {
    type: 'button', 'data-st': 'mode', 'data-mode': id, 'aria-pressed': String(mode === id), text: label })));
  head.append(toggle);
  pane.append(head);

  if (mode === 'edit') {
    pane.append(h('label.st-label', { for: 'stSource', text: 'Write or paste the synopsis. Highlights follow their passage when you edit around them.' }));
    pane.append(h('textarea#stSource.st-text', { rows: 18, 'data-st-field': 'source', spellcheck: 'true' }, []));
    pane.querySelector('textarea').value = s.source;
    return pane;
  }

  const fw = Story.frameworkById(s.framework);
  const bar = h('div.st-tagbar');
  bar.append(h('label', { for: 'stTagBeat', text: 'Select text, then tag it as' }));
  const sel = h('select#stTagBeat');
  fw.beats.forEach((b) => sel.append(h('option', { value: b.id, text: b.label })));
  if (litBeat && fw.beats.some((b) => b.id === litBeat)) sel.value = litBeat;
  bar.append(sel);
  bar.append(h('button#stTagBtn.btn.primary', { type: 'button', 'data-st': 'tag', disabled: true, text: 'TAG SELECTION' }));
  pane.append(bar);

  const src = h('div#stSrc.st-src', { tabindex: '0', 'aria-label': 'Synopsis — select a passage to tag it' });
  const len = s.source.length;
  let at = 0;
  const live = Story.anchor(s).filter((m) => !m.detached).sort((a, b) => a.start - b.start);
  for (const m of live) {
    if (m.start < at) continue;        // overlapping passages: the earlier one draws
    if (m.start > at) src.append(document.createTextNode(s.source.slice(at, m.start)));
    const r = Story.beatOf(m, s.framework, len);
    const mk = h('mark.st-mark' + (r.inferred ? '.is-inferred' : '') + (litBeat && r.beat && r.beat.id === litBeat ? '.is-lit' : ''), {
      'data-mark': m.id, 'data-beat': r.beat ? r.beat.id : '',
      title: (r.beat ? r.beat.label : '') + (r.inferred ? ' (placed by position)' : '')
    });
    mk.textContent = s.source.slice(m.start, m.end);
    src.append(mk);
    at = m.end;
  }
  if (at < len) src.append(document.createTextNode(s.source.slice(at)));
  pane.append(src);
  return pane;
}

function renderMatrix(s) {
  const pane = h('section.st-pane.st-matrix', { 'aria-label': 'Beat matrix' });
  const fw = Story.frameworkById(s.framework);
  pane.append(h('div.st-pane-head', {}, [h('h3.bd-h2', { text: fw.label })]));
  pane.append(h('p.bd-sub', { text: fw.blurb }));
  const list = h('ol.st-beats');
  for (const row of Story.matrix(s)) {
    const b = row.beat;
    const li = h('li.st-beat' + (litBeat === b.id ? '.is-lit' : '') + (row.marks.length ? '' : '.is-empty'), { 'data-beat-card': b.id });
    const top = h('div.st-beat-top');
    top.append(h('button.st-beat-name', { type: 'button', 'data-st': 'light', 'data-beat': b.id,
      'aria-pressed': String(litBeat === b.id), text: b.label }));
    top.append(h('span.st-beat-at', { text: '~' + pct(b.at) }));
    const tid = 'stT_' + b.id;
    top.append(h('label.st-beat-tlabel', { for: tid, text: 'Tension' }));
    const ti = h('input#' + tid + '.st-beat-t', { type: 'number', min: 1, max: 10, step: 1,
      'data-st-field': 'tension', 'data-beat': b.id, value: String(row.tension) });
    top.append(ti);
    li.append(top);
    li.append(h('p.st-beat-prompt', { text: b.prompt }));
    if (row.marks.length) {
      const ul = h('ul.st-beat-marks');
      for (const m of row.marks) {
        const mi = h('li.st-beat-mark');
        mi.append(h('button.st-quote', { type: 'button', 'data-st': 'goto-mark', 'data-mark': m.id,
          text: '“' + (m.text.length > 160 ? m.text.slice(0, 157) + '…' : m.text) + '”' }));
        const meta = h('div.st-beat-meta');
        if (m.inferred) meta.append(h('span.st-badge', { text: 'placed by position' }));
        if (m.origin === 'ai') meta.append(h('span.st-badge', { text: 'drafted by AI' }));
        if (m.origin === 'outline') meta.append(h('span.st-badge', { text: 'from the outline' }));
        const rs = h('select.st-retag', { 'data-st-field': 'retag', 'data-mark': m.id, 'aria-label': 'Move this passage to another beat' });
        rs.append(h('option', { value: '', text: m.inferred ? 'Tag as…' : 'Untag (place by position)' }));
        fw.beats.forEach((x) => rs.append(h('option', { value: x.id, text: x.label, selected: !m.inferred && x.id === b.id })));
        if (m.inferred) rs.value = '';
        meta.append(rs);
        meta.append(h('button.btn.st-x', { type: 'button', 'data-st': 'unmark', 'data-mark': m.id, 'aria-label': 'Remove this highlight', text: 'REMOVE' }));
        mi.append(meta);
        if (m.rationale) mi.append(h('p.st-why', { text: m.rationale }));
        ul.append(mi);
      }
      li.append(ul);
    }
    list.append(li);
  }
  pane.append(list);
  return pane;
}

/* ---- AI (FR-504) ---------------------------------------------- */

function renderAI(s) {
  const sec = h('div.st-ai');
  sec.append(h('h2.bd-h2', { text: 'Map the beats with AI' }));
  sec.append(h('p.bd-sub', { text: 'The model quotes the passage it thinks performs each beat. A quote that is not word for word in your synopsis is dropped and counted, and a passage you already tagged in this framework is never moved.' }));
  if (!Panelm) { sec.append(h('p.st-muted', { text: 'Checking for a key…' })); return sec; }
  const kg = Panelm.keyGate('Mapping');
  if (kg) { sec.append(kg); if (kg.dataset.blocking === 'true') return sec; }
  sec.append(Panelm.keyBar());
  if (!s.source.trim()) {
    sec.append(Panelm.gate('No synopsis yet.', 'Write, paste or import one first; the model reads only what is on this page.', null));
    return sec;
  }
  sec.append(Panelm.disclose('The synopsis on this page and the names of the ' + Story.frameworkById(s.framework).short + ' beats. Nothing else.'));
  const row = h('div.st-ai-row');
  if (aiJob) row.append(h('button.btn', { type: 'button', 'data-st': 'ai-stop', text: 'STOP' }));
  else row.append(h('button.btn.primary', { type: 'button', 'data-st': 'ai-run', text: 'MAP ' + Story.frameworkById(s.framework).short.toUpperCase() + ' BEATS' }));
  sec.append(row);
  if (aiStatus) sec.append(Panelm.statusLine(aiStatus));
  if (aiError) sec.append(Panelm.errorLine(aiError));
  return sec;
}

async function primeAI() {
  try {
    const [a, p] = await Promise.all([import('../lib/ai.js'), import('../ui/ai-panel.js')]);
    AI = a; Panelm = p;
    Panelm.wireAIPanel();
    Panelm.onAIChange(() => render());
    render();
  } catch (e) { console.warn('[story] ai', e); }
}

async function runAI() {
  const s = story();
  const fw = Story.frameworkById(s.framework);
  aiError = ''; aiStatus = 'Starting…';
  aiJob = new AbortController();
  render();
  try {
    const res = await AI.draftBeatMap({ synopsis: s.source, framework: fw },
      { signal: aiJob.signal, onStatus: (t) => { aiStatus = t; const el = document.querySelector('.st-ai .ai-status'); if (el) el.textContent = t; } });
    const fresh = story();
    const { added, dropped } = Story.applyBeatMap(fresh, fw.id, res.rows);
    Story.saveStory(fresh);
    aiStatus = `${added} passage${added === 1 ? '' : 's'} tagged` +
      (dropped ? `; ${dropped} quote${dropped === 1 ? ' was' : 's were'} not word for word in the synopsis and ${dropped === 1 ? 'was' : 'were'} dropped` : '') +
      (res.truncated ? '. The reply was cut short, so some beats may be missing.' : '.');
  } catch (e) {
    aiStatus = '';
    aiError = e && e.code === 'aborted' ? 'Stopped. Nothing was changed.' : (e && e.message) || 'The request failed.';
  } finally {
    aiJob = null;
    render();
  }
}

/* Suggestions are SHOWN, never written: each is added by its own click,
   so a model can offer a step but only the writer puts one in. */
async function runSuggest(key) {
  if (!AI || suggJob) return;
  const s = story();
  const p = Story.resolveBeatKey(key);
  if (!p) return;
  suggFail = null;
  suggJob = { key, ctrl: new AbortController(), status: 'Starting…' };
  render();
  try {
    const res = await AI.draftOutlineSteps({
      idea: s.idea, logline: s.logline, synopsis: s.source, format: projectFormat(),
      framework: p.fw, beat: p.beat, steps: Story.stepsInOrder(s).map((x) => ({ beat: x.beat, text: x.text }))
    }, { signal: suggJob.ctrl.signal, onStatus: (t) => {
      if (suggJob) suggJob.status = t;
      const el = document.querySelector(`[data-beat-card="${CSS.escape(key)}"] .ai-status`); if (el) el.textContent = t;
    } });
    sugg[key] = res.steps;
  } catch (e) {
    suggFail = { key, error: e && e.code === 'aborted' ? 'Stopped. Nothing was suggested.' : (e && e.message) || 'The request failed.' };
  } finally {
    suggJob = null;
    render();
  }
}

/* ---- the pitch deck (FR-605) --------------------------------
   One button. What goes in is listed beside it, read from the same
   models the deck reads, so nobody prints a deck to find out what is
   in it. */
function renderPitch() {
  const sec = h('section#pitch.st-section.st-pitch', { 'aria-label': 'Pitch deck' });
  sec.append(h('h2.bd-h2', { text: 'Pitch deck' }));
  sec.append(h('p.bd-sub', { text: 'A landscape PDF compiled from this project: the logline, this synopsis, the tagged beats, the characters, key scenes and the numbers. A slide with nothing to say is left out.' }));
  let d = null;
  try { d = Pitch.collectPitch(); } catch (e) { d = null; }
  const have = d ? [
    d.logline && 'logline', d.synopsis && 'synopsis', d.beats.length && `${d.beats.length} beats`,
    d.characters.length && `${d.characters.length} characters`, d.keyScenes.length && `${d.keyScenes.length} key scenes`,
    d.numbers.length && 'production numbers'
  ].filter(Boolean) : [];
  sec.append(h('p.st-muted', { text: have.length ? 'In the deck: ' + have.join(' · ') + '.' : 'Nothing to pitch yet — add a synopsis or a logline first.' }));
  sec.append(h('button.btn.primary', { type: 'button', 'data-st': 'pitch', disabled: !have.length, text: 'EXPORT PITCH DECK (PDF)' }));
  return sec;
}

/* ---- Beats & Pacing -------------------------------------------
   A section of the page like any other (it used to be a tab). Map-with-AI
   sits inside it: it tags the synopsis against the beats, which is what
   the curve above it reads. The Idea Vault is not on this page any more
   (vault.html). */
function renderPacing(s) {
  const sec = h('section#pacing.st-section.st-pacing', { 'aria-label': 'Beats and pacing' });
  sec.append(h('h2.bd-h2', { text: 'Beats & pacing' }));
  if (s.source.trim()) { const heat = renderHeat(s); if (heat) sec.append(heat); sec.append(renderFlags(s)); }
  else sec.append(h('p.st-muted', { text: 'The tension curve draws once there is a synopsis — build one from the outline, or write your own.' }));
  sec.append(h('div#ai-map.st-ai-panel', {}, [renderAI(s)]));
  return sec;
}

/* ---- the page ------------------------------------------------- */

/* Re-entrancy guard. Removing a focused textarea fires `change` on
   blur, from INSIDE replaceChildren, and that handler renders. A nested
   replaceChildren then finds its old children already gone and throws.
   So a render requested during a render is queued, not run. */
let rendering = false, again = false;
function render() {
  held = false;
  if (rendering) { again = true; return; }
  rendering = true;
  /* A redraw under a field the user is working in (a tension score
     stepped with the arrows) keeps the focus — preservingFocus() — AND
     keeps the field where it was on screen. The swap of the whole page
     let the browser re-anchor the scroll, so each ArrowUp drifted the
     page by a few dozen pixels (UX audit M1). */
  const was = document.activeElement;
  const wasId = was && was.id && /^(INPUT|TEXTAREA|SELECT)$/.test(was.tagName) && app.contains(was) ? was.id : '';
  const top0 = wasId ? was.getBoundingClientRect().top : 0;
  try { preservingFocus(draw); } finally {
    if (wasId) {
      const now = document.activeElement;
      if (now && now.id === wasId) {
        const dy = now.getBoundingClientRect().top - top0;
        if (dy) window.scrollBy({ top: dy, behavior: 'instant' });   // not the page's smooth scroll
      }
    }
    rendering = false;
    if (again) { again = false; render(); }
  }
}

function draw() {
  const s = story();
  if (mode === null) mode = s.source.trim() ? 'tag' : 'edit';
  const cur = currentStep(s);
  const cards = isEmpty(s) && !started;
  const main = h('main#main.st-main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Story · beats & pacing' }),
    h('h1.bd-title', { text: 'Story.' }),
    h('p.bd-deck', { text: fmt() === 'short'
      ? 'From a seed to a step outline to a synopsis. Everything a short film needs is on this page: the character, the world, the conflict, the order of the beats.'
      : 'From an idea to a step outline to a synopsis, against the beat sheet of your choice. Everything is on this page, in order; tag the passages that turn the story and watch where the tension sags.' })
  ]));

  if (cards) main.append(renderModes());

  const bar = h('div.st-bar');
  // One import control on screen at a time: the card's, while it shows.
  if (!cards) {
    bar.append(h('label.btn.st-import', {}, [
      h('span', { text: 'IMPORT' }),
      h('input.st-file', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf', 'data-st-field': 'file', 'aria-label': 'Import a synopsis file' })
    ]));
  }
  bar.append(h('button.btn', { type: 'button', 'data-st': 'export-txt', disabled: !IO.canExportSynopsis(s), text: 'SYNOPSIS .TXT' }));
  bar.append(h('button.btn', { type: 'button', 'data-st': 'export-md', disabled: !IO.canExportOutline(s), text: 'OUTLINE .MD' }));
  if (s.source.trim() || s.marks.length) {
    bar.append(h('button.btn.danger', { type: 'button', 'data-st': 'clear', text: 'START OVER' }));
  }
  main.append(bar);

  main.append(renderStepper(s, cur));
  /* EVERY STEP IS ON THE PAGE, in the project's own path. */
  const panels = {
    idea: renderIdea, logline: renderLogline, structure: renderStructure, outline: renderOutline,
    synopsis: renderSynopsisStep, screenplay: renderScreenplay, lock: renderLock,
    bible: (x) => renderBible(x, 'bible'), character: (x) => renderBible(x, 'character'),
    world: (x) => renderBible(x, 'world'), conflict: (x) => renderBible(x, 'conflict'),
    setups: (x) => renderBlueprintStep(x, 'setups', 'Setups & payoffs',
      'What you plant early and pay off late. A setup nobody notices is the best kind; list the ones you know about.'),
    timeline: (x) => renderBlueprintStep(x, 'timeline', 'Timeline',
      'The order things happen in the world, against the order the audience sees them. Only needed if the film jumps around.')
  };
  for (const p of pathNow()) { const draw1 = panels[p.id]; if (draw1) main.append(draw1(s)); }
  main.append(renderPacing(s));
  main.append(renderPitch());
  app.replaceChildren(main);
  after();
}

function after() {
  mountStageGuide(document.getElementById('main'), { stage: 'story' });   // what the path leaves: the cover sheet
  startBlueprintHosts();   // the blueprint's questions, inline in the steps that own them
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[story] chrome', e); }
  if (flashMark) {
    const el = document.querySelector(`.st-mark[data-mark="${CSS.escape(flashMark)}"]`);
    flashMark = '';
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-flash'); }
  }
  if (focusStep) {
    const el = document.getElementById('stStep_' + focusStep);
    focusStep = '';
    if (el) { el.focus(); el.scrollIntoView({ block: 'center' }); }
  }
  if (landStep) {
    const el = document.getElementById('path-' + landStep);
    landStep = '';
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

/* A path step id, from an id or (for any caller that still holds one)
   an old step number; a step this project's path does not have (a link
   to the feature's Setups on a short film) lands on the path's first. */
function stepId(x) {
  const path = pathNow();
  if (path.some((p) => p.id === x)) return x;
  const byN = path.find((p) => p.n === Number(x));
  return byN ? byN.id : path[0].id;
}

/* Going to a step: light it, put it in the address bar and scroll to it.
   Every step is already on the page, so nothing is redrawn — except the
   start cards, which this answers. */
function goStep(x, { scroll = true } = {}) {
  pathStep = stepId(x);
  history.replaceState(null, '', location.pathname + location.search + '#path-' + pathStep);
  if (!started) { started = true; landStep = scroll ? pathStep : ''; render(); return; }
  refreshStepper();
  if (scroll) {
    const el = document.getElementById('path-' + pathStep);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}

/* ---- where you are (rev. 3 §1b) ------------------------------- */

function whereText(fwId, pos) {
  const w = Story.whereAt(fwId, pos);
  let t = `You are at ${pct(w.pos)} of the synopsis — nearest beat ${w.nearest.label}, conventionally around ${pct(w.nearest.at)}`;
  if (w.next && w.next.id !== w.nearest.id) t += `; ${w.next.label} is expected around ${pct(w.next.at)}`;
  return t + '.';
}
function updateWhere() {
  const out = document.getElementById('stWhere');
  if (!out) return;
  const s = story();
  const ta = document.getElementById('stSource');
  if (ta && document.activeElement === ta) {
    const len = ta.value.length;
    if (len) out.textContent = whereText(s.framework, ta.selectionStart / len);
    return;
  }
  const o = selectionOffsets(true);
  if (o && s.source.length) out.textContent = whereText(s.framework, ((o.start + o.end) / 2) / s.source.length);
}
['keyup', 'click', 'select'].forEach((t) => document.addEventListener(t, (e) => {
  if (e.target && e.target.id === 'stSource') updateWhere();
}));

/* ---- export --------------------------------------------------- */

/* src/lib/story-io.js: the same downloads the blueprints offer. */

/* ---- import --------------------------------------------------- */

/* Reading the file, the replace confirm and the write are
   importSynopsis() in src/ui/story-kit.js — the blueprints' Part I
   cover imports through the same function. */
async function importFile(file) {
  const r = await importSynopsis(file);
  if (!r) return;
  mode = 'tag';
  started = true;
  pathStep = 'synopsis';
  landStep = 'synopsis';
  render();
  StudioUI.toast(IO.importedSentence(r));
}

/* ---- the sample ----------------------------------------------- */

/* The sample's story: IO.sampleStory() (src/lib/story-io.js). */
const sampleStory = IO.sampleStory;

async function useSample() {
  const cur = story();
  if (!isEmpty(cur) && !window.confirm('Replace the story on this page with the Dragon sample? Your idea, logline, outline and synopsis here are replaced. The Idea Vault is kept.')) return;
  const s = await sampleStory();
  s.frameworkChosen = true;   // the sample's outline is laid out under its own format
  mode = 'tag'; started = true; litBeat = '';
  pathStep = s.outline.length ? 'outline' : 'synopsis';
  landStep = pathStep;
  undoBuild = null; lastSend = null; sugg = {};
  history.replaceState(null, '', location.pathname + location.search + '#path-' + pathStep);
  commit(s);
}

/* ---- events — delegated, no inline handlers ------------------- */

function selectionOffsets(quiet) {
  const root = document.getElementById('stSrc');
  const sel = window.getSelection();
  if (!root || !sel || sel.rangeCount === 0) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const off = (node, o) => { const x = document.createRange(); x.selectNodeContents(root); x.setEnd(node, o); return x.toString().length; };
  let start = off(r.startContainer, r.startOffset), end = off(r.endContainer, r.endOffset);
  if (quiet) return { start, end };
  if (sel.isCollapsed) return null;
  const src = story().source;
  // Trim whitespace at the edges so a sloppy drag still tags the words.
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
  return end > start ? { start, end } : null;
}

document.addEventListener('selectionchange', () => {
  const btn = document.getElementById('stTagBtn');
  if (btn) btn.disabled = !selectionOffsets();
  updateWhere();
});

function sendToScreenplay() {
  const s = story();
  const ids = Story.sendOutlineToScenes(s, Scenes, { fwId: s.framework });
  if (!ids.length) { StudioUI.toast('Every written step already has a scene.'); return; }
  lastSend = ids;
  commit(s);
  StudioUI.toast(`${ids.length} placeholder scene${ids.length === 1 ? '' : 's'} added to the scene list.`, {
    action: 'UNDO', onAction: undoSend
  });
}
function undoSend() {
  if (!lastSend || !lastSend.length) return;
  const s = story();
  const n = Story.undoSendOutline(s, lastSend, Scenes);
  lastSend = null;
  commit(s);
  StudioUI.toast(`${n} placeholder scene${n === 1 ? '' : 's'} removed. Nothing else in the scene list was touched.`);
}

delegate(document, 'click', '[data-st]', (e, el) => {
  const act = el.getAttribute('data-st');
  const s = story();
  if (act === 'sample') {
    useSample();
  } else if (act === 'new') {
    started = true;
    goStep('idea');
    const ta = document.getElementById('stIdea'); if (ta) ta.focus();
  } else if (act === 'ways-idea') {
    const ta = document.getElementById('stIdea'); if (ta) { ta.focus(); ta.scrollIntoView({ block: 'center' }); }
  } else if (act === 'have-synopsis') {
    started = true; mode = 'edit';
    pathStep = 'synopsis';
    goStep('synopsis');
    const ta = document.getElementById('stSource'); if (ta) ta.focus();
  } else if (act === 'path') {
    goStep(el.getAttribute('data-path') || el.getAttribute('data-step'));
  } else if (act === 'use-lad1') {
    const f = document.querySelector('[data-key="lad_1_logline"]');
    const v = f ? String(f.value || '').trim() : '';
    if (!v) { StudioUI.toast('Nothing written in that earlier version yet.'); return; }
    s.logline = v;
    commit(s);
  } else if (act === 'lock' || act === 'unlock') {
    if (act === 'lock' && !Story.outlineByBeat(s, s.framework).withText) {
      StudioUI.toast('Write a step or two in the step outline first, then lock it.');
      return;
    }
    Story.setOutlineLock(s, act === 'lock');
    commit(s);
    StudioUI.toast(act === 'lock' ? 'Outline locked. The path is finalised; unlock any time to edit.' : 'Outline unlocked.');
  } else if (act === 'use-bp') {
    const f = el.getAttribute('data-field');
    if (f === 'idea') s.idea = bpIdea(); else if (f === 'logline') s.logline = bpLogline();
    commit(s);
  } else if (act === 'pick-fw') {
    s.framework = el.getAttribute('data-fw'); s.frameworkChosen = true; litBeat = '';
    commit(s);
    StudioUI.toast(`Scene order: ${Story.frameworkById(s.framework).label}.`);
  } else if (act === 'step-add') {
    const st = Story.addOutlineStep(s, { beat: el.getAttribute('data-beat') });
    if (st) { focusStep = st.id; commit(s); }
  } else if (act === 'step-up' || act === 'step-down') {
    if (Story.moveOutlineStep(s, el.getAttribute('data-step'), { delta: act === 'step-up' ? -1 : 1 })) commit(s);
  } else if (act === 'step-del') {
    const id = el.getAttribute('data-step');
    const i = s.outline.findIndex((x) => x.id === id);
    const gone = s.outline[i];
    if (!gone) return;
    Story.removeOutlineStep(s, id);
    commit(s);
    StudioUI.toast('Step removed.', { action: 'UNDO', onAction: () => {
      const back = story(); back.outline.splice(Math.min(i, back.outline.length), 0, gone); commit(back);
    } });
  } else if (act === 'step-file') {
    if (Story.fileUnplaced(s, s.framework, [el.getAttribute('data-step')])) commit(s);
  } else if (act === 'file-all') {
    const n = Story.fileUnplaced(s, s.framework);
    if (n) { commit(s); StudioUI.toast(`${n} step${n === 1 ? '' : 's'} filed under the nearest ${Story.frameworkById(s.framework).short} beat.`); }
  } else if (act === 'sugg-run') {
    runSuggest(el.getAttribute('data-beat'));
  } else if (act === 'sugg-stop') {
    if (suggJob && suggJob.ctrl) suggJob.ctrl.abort();
  } else if (act === 'sugg-add') {
    const key = el.getAttribute('data-beat');
    const i = Number(el.getAttribute('data-i'));
    const text = (sugg[key] || [])[i];
    if (!text) return;
    Story.addOutlineStep(s, { beat: key, text });
    sugg[key] = sugg[key].filter((_, k) => k !== i);
    commit(s);
  } else if (act === 'sugg-clear') {
    delete sugg[el.getAttribute('data-beat')];
    render();
  } else if (act === 'build') {
    if (s.source.trim() && !window.confirm('Rebuild the synopsis from the outline? The synopsis on this page is replaced; highlights you made by hand are kept where their words still appear. You can undo this once.')) return;
    undoBuild = Story.buildSynopsisFromOutline(s, s.framework);
    mode = 'tag';
    commit(s);
    StudioUI.toast('Synopsis built from the outline — every step tagged with its beat.', { action: 'UNDO', onAction: () => {
      if (!undoBuild) return; const back = story(); Story.restoreSynopsis(back, undoBuild); undoBuild = null; commit(back);
    } });
  } else if (act === 'build-undo') {
    if (!undoBuild) return;
    Story.restoreSynopsis(s, undoBuild);
    undoBuild = null;
    if (!s.source.trim()) mode = 'edit';
    commit(s);
  } else if (act === 'send') {
    sendToScreenplay();
  } else if (act === 'send-undo') {
    undoSend();
  } else if (act === 'export-txt') {
    IO.exportSynopsis(s);
  } else if (act === 'export-md') {
    IO.exportOutline(s);
  } else if (act === 'mode') {
    mode = el.getAttribute('data-mode'); render();
  } else if (act === 'tag') {
    const o = selectionOffsets();
    if (!o) return;
    if (s.marks.some((m) => m.start < o.end && m.end > o.start)) {
      StudioUI.toast('That overlaps a passage already tagged. Remove that highlight first, or select different words.', { type: 'error' });
      return;
    }
    const beat = document.getElementById('stTagBeat').value;
    const m = Story.addMark(s, { ...o, fw: s.framework, beat });
    window.getSelection().removeAllRanges();
    litBeat = beat;
    commit(s);
    if (m) StudioUI.toast(`Tagged as ${Story.beatById(s.framework, beat).label}.`);
  } else if (act === 'light') {
    const b = el.getAttribute('data-beat');
    litBeat = litBeat === b ? '' : b;
    const first = litBeat && Story.matrix(s).find((r) => r.beat.id === litBeat);
    if (first && first.marks[0]) { flashMark = first.marks[0].id; if (mode !== 'tag') mode = 'tag'; }
    render();
  } else if (act === 'goto-mark') {
    flashMark = el.getAttribute('data-mark');
    if (mode !== 'tag') mode = 'tag';
    render();
  } else if (act === 'goto' || act === 'heat') {
    const from = Number(el.getAttribute('data-from'));
    if (mode !== 'tag') mode = 'tag';
    if (currentStep(s) !== 'synopsis') { pathStep = 'synopsis'; started = true; }
    render();
    scrollToOffset(from);
  } else if (act === 'unmark') {
    Story.removeMark(s, el.getAttribute('data-mark'));
    commit(s);
  } else if (act === 'clear') {
    if (!window.confirm('Clear the synopsis, every highlight and every tension score on this page? The idea, the logline, the step outline and the Idea Vault are kept.')) return;
    s.source = ''; s.sourceName = ''; s.marks = []; s.tension = {};
    mode = null; litBeat = ''; undoBuild = null;
    commit(s);
  } else if (act === 'pitch') {
    if (!Pitch.exportPitchPDF()) StudioUI.toast('Nothing to put in a deck yet.', { type: 'error' });
  } else if (act === 'ai-run') {
    if (AI) runAI();
  } else if (act === 'ai-stop') {
    if (aiJob) aiJob.abort();
  }
});

// (the tabs under the editor are gone: every section is on the page)
function scrollToOffset(from) {
  const root = document.getElementById('stSrc');
  if (!root || !Number.isFinite(from)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0, node;
  while ((node = walker.nextNode())) {
    if (seen + node.length > from) {
      const r = document.createRange();
      r.setStart(node, Math.max(0, from - seen)); r.collapse(true);
      const rect = r.getBoundingClientRect();
      window.scrollBy({ top: rect.top - window.innerHeight / 3 });
      const host = node.parentElement && node.parentElement.closest('.st-mark');
      if (host) host.classList.add('is-flash');
      return;
    }
    seen += node.length;
  }
}

delegate(document, 'change', '[data-st-field]', (e, el) => {
  const f = el.getAttribute('data-st-field');
  const s = story();
  if (f === 'file') {
    const file = el.files && el.files[0];
    el.value = '';
    importFile(file);
  } else if (f === 'source') {
    s.source = el.value;
    commitField(s);
  } else if (f === 'idea' || f === 'logline') {
    s[f] = el.value;
    commitField(s);
  } else if (f === 'step-text') {
    Story.updateOutlineStep(s, el.getAttribute('data-step'), { text: el.value });
    commitField(s);
  } else if (f === 'step-beat') {
    if (el.value && Story.moveOutlineStep(s, el.getAttribute('data-step'), { beat: el.value })) commit(s);
  } else if (f === 'tension') {
    Story.setTension(s, s.framework, el.getAttribute('data-beat'), el.value);
    commit(s);
  } else if (f === 'retag') {
    Story.tagMark(s, el.getAttribute('data-mark'), s.framework, el.value);
    commit(s);
  }
});

// Typing saves without redrawing — a redraw would steal the caret.
// saveOnInput() debounces it AND flushes it on pagehide / hidden: the
// bare 600ms timer this replaced lost the last keystrokes to a reload
// or a closed tab (UX audit H10).
saveOnInput('textarea[data-st-field="source"]', (el) => {
  const s = story(); s.source = el.value; Story.saveStory(s);
}, 600);
saveOnInput('textarea[data-st-field="idea"], textarea[data-st-field="logline"]', (el) => {
  const s = story(); s[el.getAttribute('data-st-field')] = el.value; Story.saveStory(s);
}, 600);
saveOnInput('textarea[data-st-field="step-text"]', (el) => {
  const s = story(); Story.updateOutlineStep(s, el.getAttribute('data-step'), { text: el.value }); Story.saveStory(s);
}, 600);

// Drag and drop onto the import card. A FILE dropped anywhere else on
// the page is refused rather than left to the browser, which would open
// it in place of the studio (UX audit L28). Text dragged into a field is
// not a file and still drops as usual.
const carriesFiles = (e) => !!(e.dataTransfer && [...(e.dataTransfer.types || [])].includes('Files'));
document.addEventListener('dragover', (e) => {
  const d = e.target.closest && e.target.closest('.st-drop');
  if (d) { e.preventDefault(); d.classList.add('is-over'); }
  else if (carriesFiles(e)) { e.preventDefault(); e.dataTransfer.dropEffect = 'none'; }
});
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('.st-drop'); if (d) d.classList.remove('is-over'); });
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest('.st-drop');
  if (!d) { if (carriesFiles(e)) e.preventDefault(); return; }
  e.preventDefault();
  d.classList.remove('is-over');
  importFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
});


/* The address bar: #path-<id> lights a path step and lands on it (#path-N,
   the form every link before the Story Bible used, lands on the step it
   always did; a step this project's path does not have lands on its first).
   Every other fragment (#pacing, #ai-map, #pitch, #guide) is a plain
   section of the page. */
function readHash() {
  const hash = (location.hash || '').replace(/^#/, '');
  const id = Story.pathStepFromHash(hash, fmt());
  if (id) { pathStep = id; started = true; landStep = id; reland = id; return true; }
  return false;
}
/* The reader taking over ends the second landing. */
['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, () => { reland = ''; }, { passive: true, capture: true }));
addEventListener('hashchange', () => {
  if (readHash()) { render(); return; }
  const el = document.getElementById((location.hash || '').replace(/^#/, ''));
  if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
});

/* ?start= from the extension panel's ways in (FR-402). Read once and
   stripped, so a reload does not repeat it. A file picker cannot be
   opened without a click, so "import" scrolls to the drop card instead. */
const START = new URLSearchParams(location.search).get('start');
if (START) history.replaceState(null, '', location.pathname + location.hash);
/* An old blueprint link — story.html?step=feature/step-07#guide — lands on
   the path step that asks that step now, not on the Guide's cover. */
{
  const m = /^(feature|short)\/(step-\d+|treatment-ladder)$/.exec(new URLSearchParams(location.search).get('step') || '');
  const id = m && m[1] === fmt() ? Story.pathStepForBlueprint(fmt(), m[2]) : '';
  if (id) {
    /* A real navigation to the clean address, not a replaceState: the
       shell lands on the fragment it was loaded with (#guide, which this
       page draws at the bottom), and only a fresh load lands on this one. */
    location.replace(location.pathname + '#path-' + id);
  }
}
readHash();

render();
loadFavStudiesSoon();   // the examples' films, once the page has settled
primeAI();
if (START === 'sample' && !story().source.trim() && !story().outline.length) useSample();
else if (START === 'new') { started = true; goStep('idea'); const ta = document.getElementById('stIdea'); if (ta) ta.focus(); }
if (START === 'import') { const d = document.querySelector('.st-drop, .st-import'); if (d) d.scrollIntoView({ block: 'center' }); }
/* A fragment that names a plain section (#pitch, #pacing, #ai-map): the
   page is drawn by script, so the browser's own landing found nothing. */
{
  const frag = (location.hash || '').replace(/^#/, '');
  if (frag && frag !== 'guide' && !Story.pathStepFromHash(frag, fmt())) {
    const el = document.getElementById(frag);
    if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
  }
}
