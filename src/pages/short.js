/* ============================================================
   SHORT FILM BLUEPRINT — page entry for short.html
   ------------------------------------------------------------
   The legacy page was 2,725 lines of HTML with a 700-line inline
   <script> at the bottom and ~30 inline onclick= handlers. This
   module is the whole page: it renders the chrome, the cover, the
   eleven steps (from src/data/steps.short.json), the five-beat
   visualiser (from the same file's `beats`), the festival grid
   (from src/data/festivals.json) and the glossary, then runs the
   behaviour that was in that inline script.

   WHAT IS DELIBERATELY UNCHANGED
   ------------------------------------------------------------
   Every `data-key` is byte-identical to the legacy page. That is
   the storage contract: a user who opens this build finds the work
   they typed into the old one. All 106 of them, in the same order.

   The `escAttr` ordering fix is preserved (see escAttr below) and
   `toggleDark` still delegates to StudioUI.cycleTheme().

   WHAT CHANGED, AND WHY
   ------------------------------------------------------------
   1. Zero inline handlers. Everything is one delegated listener
      per event type, dispatching on [data-action] / [data-change].
      Authored `raw` blocks in src/data still carry onclick= (that
      file is frozen), so `adoptInlineHandlers()` rewrites them into
      data-action at render time and strips the attribute — nothing
      inline survives into the live DOM.
   2. The scene map is persisted ONCE, as `_sceneMap`. It used to be
      written twice — as that array AND as flat `sm_<n>_<field>`
      keys — and because row numbers renumber on reload, the flat
      keys accumulated forever. See migrateFlatSceneKeys().
   3. loadData() no longer trusts an empty saved array (see MIN_*).
   4. collectScriptData() runs once per save cycle, not three times.
   ============================================================ */

/* Store FIRST and on purpose: it patches Storage.prototype so every
   localStorage read below is scoped to the current project. Read the
   load-order banner in src/lib/store.js before moving this line. */
import '../lib/store.js';

import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/print.css';

import StudioUI from '../ui/chrome.js';
import '../lib/cloud.js';

import { h, delegate } from '../lib/dom.js';
import { renderSteps } from '../ui/steps.js';

import shortData from '../data/steps.short.json';
import festivalData from '../data/festivals.json';

// ============================================================
// CONSTANTS
// ============================================================
const STORAGE_KEY = 'arunak_shortfilm_blueprint_v1';
const PREF_KEY    = 'arunak_shortfilm_prefs_v1';

// Industry rule of thumb: one formatted screenplay page ≈ 210 words
// ≈ one minute of screen time.
const WORDS_PER_PAGE = 210;

// A returning user used to be able to end up with a scene table of
// zero rows and no way to add one, because `[]` is truthy. These are
// the floors that loadData() enforces instead.
const MIN_SCENE_ROWS    = 5;
const MIN_SCRIPT_SCENES = 1;

// Every writable field carries a data-key — and so does every checklist
// <li>. Scanning them together was a latent crash: loadData() assigned a
// saved boolean to `li.value`, which is a NUMBER on HTMLLIElement, and the
// next `(el.value || '').trim()` threw — killing progress, badges, the
// logline counter, the page counter and the preview for anyone who had
// ticked a single checklist box. Fields are matched by tag now; the
// checklist is scanned separately, exactly as it always was.
const FIELD_SELECTOR = 'input[data-key], textarea[data-key], select[data-key]';

const SCENE_FIELDS = ['slug', 'who', 'what', 'beat', 'pages'];
const SCENE_BEATS  = ['Setup', 'Disturb', 'Escalate', 'Turn', 'Image'];

const { steps: STEPS, beats: BEATS } = shortData;

let statusEl = null;
let saveTimer = null;

// ============================================================
// UTIL — escaping
// ============================================================
function escHTML(s) {
  return String(s || '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}
function escAttr(s) {
  // `&` MUST be escaped first. Escaping `"` first turned every quote into
  // &quot;, and the following &-pass then turned that into &amp;quot; — so a
  // quote mark in your script grew by 4 characters on every single save.
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ============================================================
// RENDER — chrome
// ============================================================
function jumpOptions() {
  // The jump list used to be a hand-maintained copy of the step list
  // that drifted from it. It derives now, so it cannot.
  return STEPS.map((s) => ({
    value: s.id,
    label: `${s.num} · ${(s.titlePlain || s.title.replace(/<[^>]+>/g, '')).replace(/\.$/, '')}`
  }));
}

function renderToolbar() {
  const jumper = h('select.step-jumper', {
    id: 'stepJumper',
    'data-change': 'jump-step',
    title: 'Jump to any step',
    'aria-label': 'Jump to a step'
  }, [
    h('option', { value: '', text: 'JUMP TO…' }),
    h('option', { value: 'top', text: '↑ Cover' }),
    ...jumpOptions().map((o) => h('option', { value: o.value, text: o.label })),
    h('option', { value: 'glossary', text: '→ Glossary' })
  ]);

  return h('div.toolbar', {}, [
    h('span.brand', { text: 'SHORT FILM · CURATED BY ARUNAK' }),
    h('a.studio-proj-link', {
      href: 'index.html', id: 'studioProjLink',
      title: 'Back to Studio · current project'
    }, [
      h('span.spl-arrow', { text: '←' }),
      h('span.spl-label', { id: 'studioProjLabel', text: 'STUDIO' })
    ]),
    h('div.progress-meter', { title: 'Overall completion' }, [
      h('div.progress-bar', {}, [h('div.progress-fill', { id: 'progressFill', style: 'width:0%;' })]),
      h('span.progress-text', { id: 'progressText', text: '0%' })
    ]),
    jumper,
    h('button.btn.icon-btn', {
      id: 'darkBtn', 'data-action': 'toggle-dark',
      title: 'Toggle theme', 'aria-label': 'Toggle theme', text: '◐'
    }),
    h('span.save-status', { id: 'saveStatus', role: 'status', text: '●  ready' }),
    h('button.btn', { 'data-action': 'print', text: 'PRINT' }),
    h('button.btn', { 'data-action': 'export-json', text: 'JSON' }),
    h('button.btn', { 'data-action': 'export-fountain', text: 'FOUNTAIN' }),
    h('button.btn', { 'data-action': 'import-json', text: 'IMPORT' }),
    h('button.btn.danger', { 'data-action': 'reset', text: 'RESET' }),
    h('a.tb-link.gold', { href: 'index.html', title: 'Back to the Studio hub', text: '⌂ HUB' }),
    h('a.tb-link', { href: 'feature.html', title: 'Open the feature blueprint', text: 'FEATURE ↗' }),
    h('a.tb-link', { href: 'library.html', title: 'Open the library', text: 'LIBRARY ↗' }),
    h('input', {
      type: 'file', id: 'importFile', accept: '.json',
      hidden: true, 'data-change': 'import-file', 'aria-label': 'Import blueprint JSON'
    })
  ]);
}

// ============================================================
// RENDER — cover / how-to
// ============================================================
const COVER_FIELDS = [
  { key: 'meta_title',   label: 'Project title',   placeholder: 'Untitled short' },
  { key: 'meta_writer',  label: 'Writer / Director', placeholder: 'Your name' },
  { key: 'meta_started', label: 'Started on',      placeholder: 'DD / MM / YYYY' },
  { key: 'meta_runtime', label: 'Target runtime',  placeholder: 'e.g. 8 min' }
];

function renderCover() {
  return h('section.cover', { id: 'top' }, [
    h('div', {}, [
      h('div.cover-mark', { text: 'A focused guide for the short form' }),
      h('h1.cover-title', { html: 'The <span class="light">Short Film</span><br>Blueprint.' }),
      h('p.cover-sub', {
        text: 'Eleven steps from a single image to a festival-ready short. '
            + 'Includes a structured script editor, Fountain-format export, and AI prompt generator. '
            + 'For films under 30 minutes.'
      }),
      h('div.vol-stamps', {}, [
        h('span.vol-stamp.blue', { text: 'SHORT FILM · 11 STEPS' }),
        h('span.vol-stamp.faded', { text: 'VOL I FEATURE · STORY' }),
        h('span.vol-stamp.faded', { text: 'VOL II FEATURE · PRE-PROD' })
      ]),
      h('div.meta-grid', {}, COVER_FIELDS.map((f) => h('div.meta-field', {}, [
        // The legacy <label> was not associated with its input, so every
        // cover field was unlabelled to a screen reader.
        h('label', { for: `f_${f.key}`, text: f.label }),
        h('input', { id: `f_${f.key}`, type: 'text', 'data-key': f.key, placeholder: f.placeholder })
      ])))
    ]),
    h('div', {}, [h('span.cover-byline', { html: 'CURATED BY <span>ARUNAK</span>' })])
  ]);
}

const HOW_TO_PROSE = [
  'A short film isn\'t a short feature. It\'s a different form, with different rules. Where a '
  + 'feature gives the audience two hours to settle into the world, a short has to land in three '
  + 'minutes — sometimes one. The whole craft is in <strong>compression</strong>: one moment, one '
  + 'turn, one final image that earns the runtime.',
  'Work through the eleven steps in order. Step 7 is where you actually write the script — the '
  + 'structured editor formats it like a real screenplay and Step 8 exports it as <em>Fountain</em> '
  + '(the universal screenplay format that imports into Final Draft, WriterDuet, Highland, and most '
  + 'other apps). The whole thing saves locally to your browser; click JSON to back up.'
];

const VS_CARDS = [
  {
    cls: 'vs-card', title: 'SHORT FILM', items: [
      'One central moment — a turn, a reveal, a small but decisive change',
      'One protagonist with one want',
      'One or two locations',
      '5–30 minutes (festival sweet spot is 8–15)',
      'Ends on a single image that contains the meaning',
      'Festival calling card — your "business card" as a director'
    ]
  },
  {
    cls: 'vs-card feature', title: 'FEATURE FILM', items: [
      'Multiple moments / acts — a full character arc',
      'Protagonist + antagonist + supporting cast',
      'Multiple locations',
      '90–180 minutes',
      'Ends on a transformed character',
      'A theatrical / OTT product to be sold and distributed'
    ]
  }
];

function renderHowTo() {
  return h('section.how-to', {}, [
    h('div.label', { text: 'HOW TO USE THIS BLUEPRINT' }),
    h('h2', { html: 'One <em>idea</em>, told <em>cleanly.</em>' }),
    ...HOW_TO_PROSE.map((p) => h('p', { html: p })),
    h('div.sf-vs-feature', {}, VS_CARDS.map((c) => h(`div.${c.cls.split(' ').join('.')}`, {}, [
      h('h4', { text: c.title }),
      h('ul', {}, c.items.map((i) => h('li', { text: i })))
    ])))
  ]);
}

// ============================================================
// RENDER — five-beat visualiser (from steps.short.json `beats`)
// ============================================================
const SVG_NS = 'http://www.w3.org/2000/svg';

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v);
  return el;
}

/**
 * The legacy page hard-coded this SVG — five circles, five labels and
 * one hand-tuned path — next to a `beats` array that already carried
 * every coordinate. Now the array is the only source.
 */
const BEAT_W = 800, BEAT_H = 200;

function renderBeatViz() {
  const W = BEAT_W, H = BEAT_H, AXIS_Y = 100;
  const svg = svgEl('svg', {
    viewBox: `0 0 ${W} ${H}`, xmlns: SVG_NS,
    role: 'img',
    'aria-label': `The ${BEATS.length}-beat shape of a short film: `
      + BEATS.map((b) => `${b.num} ${b.name}`).join(', ')
  });

  // .beat-axis is stroked from var(--rule) in widgets.css. The legacy
  // markup hard-coded a translucent brown here, which is both a raw
  // colour outside tokens.css and theme-blind — it did not move between
  // paper, sepia and ink.
  svg.append(svgEl('line', { x1: 0, y1: AXIS_Y, x2: W, y2: AXIS_Y, class: 'beat-axis' }));

  // Anchor the curve to both edges at the height of the first/last beat,
  // then run a quadratic through every beat dot.
  const dots = BEATS.map((b) => [b.svg.dotX, b.svg.dotY]);
  const pts = [[0, dots[0][1]], ...dots, [W, dots[dots.length - 1][1]]];
  let d = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const [x, y] = pts[i];
    const [nx, ny] = pts[i + 1];
    d += ` Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2}`;
  }
  d += ` L ${pts[pts.length - 1][0]} ${pts[pts.length - 1][1]}`;
  svg.append(svgEl('path', { class: 'beat-line', d }));

  for (const b of BEATS) {
    const dot = svgEl('circle', {
      class: 'beat-dot', cx: b.svg.dotX, cy: b.svg.dotY, r: 5,
      'data-beat-key': b.key, tabindex: '0', role: 'button',
      'aria-label': `Beat ${b.num} · ${b.name} — jump to this field`
    });
    // The stylesheet has always given .beat-dot `cursor:pointer` and a
    // `.filled` state. Nothing ever set either. They do something now.
    svg.append(dot);

    const label = svgEl('text', {
      class: 'beat-label', x: b.svg.labelX, y: b.svg.labelY, 'text-anchor': 'middle'
    });
    label.textContent = b.svg.label;
    svg.append(label);
  }
  // The dots carry an aria-label for screen readers; sighted users got
  // nothing on hover. The feature blueprint has had a tooltip all along
  // and .beat-tooltip is already styled — short just never used it.
  return h('div.beat-viz', {}, [svg, h('div.beat-tooltip')]);
}

/** Fill in the dots whose beat field has been written. */
function refreshBeatDots() {
  document.querySelectorAll('.beat-viz .beat-dot[data-beat-key]').forEach((dot) => {
    const field = document.querySelector(`[data-key="${dot.dataset.beatKey}"]`);
    dot.classList.toggle('filled', !!(field && (field.value || '').trim()));
  });
}

// ============================================================
// RENDER — festivals (from festivals.json)
// ============================================================
function renderFestivals() {
  return h('div.fest-grid', {}, festivalData.festivals.map((f) => h(`div.fest-card.t${f.tier}`, {}, [
    h('div.tier', { text: f.tierLabel }),
    h('h4', { text: f.name }),
    h('p', { text: f.description }),
    h('p.req', { text: f.req })
  ])));
}

// ============================================================
// RENDER — glossary / final page
// ============================================================
const GLOSSARY = [
  {
    cat: 'SCREENPLAY FORMAT', items: [
      ['SLUG LINE', 'The header above each scene. Format: INT. or EXT. — LOCATION — TIME OF DAY. INT. = interior, EXT. = exterior. Always ALL CAPS.'],
      ['ACTION', 'Description of what happens, in present tense, third person. No camera directions in the script unless absolutely necessary.'],
      ['PARENTHETICAL', 'A short instruction below a character name in italics, e.g. <em>(whispering)</em>. Use sparingly — actors hate them.'],
      ['FADE IN / FADE OUT', 'The opening and closing of the script. FADE IN: at the start, FADE OUT. at the end. Optional but traditional.'],
      ['O.S. / O.C. / V.O.', 'Off Screen, Off Camera, Voice Over. Different effects: O.S. = in the scene but unseen; V.O. = narrating from outside.'],
      ['FOUNTAIN', 'A plain-text screenplay format using markdown-like rules. Universal — opens in every pro screenwriting app. The export format used by this blueprint.'],
      ['FINAL DRAFT', 'The most common professional screenwriting software. Imports Fountain. Often required by festivals and producers.'],
      ['HIGHLAND / WRITERDUET / FADE IN', 'Final Draft alternatives. All open Fountain files. Highland is Mac-only; WriterDuet is web-based; Fade In is cross-platform.']
    ]
  },
  {
    cat: 'PRODUCTION', items: [
      ['CALL SHEET', 'The day\'s plan distributed to cast and crew. Times, locations, scenes to shoot, contact info. The 1st AD\'s main artifact.'],
      ['RECCE', 'Location scouting. A "tech recce" is when DOP, sound, art and director walk the location pre-shoot to plan everything practically.'],
      ['ROLL CAMERA', 'The director\'s call to start a take. Followed by ACTION, then CUT.'],
      ['DCP', 'Digital Cinema Package — the professional theatrical screening format. Most major festivals require a DCP for projection. Costs ₹3K–₹15K to produce.'],
      ['PRORES', 'Apple\'s professional video codec. ProRes 422 HQ or 4444 are the festival-standard delivery formats alongside DCP.'],
      ['H.264 / H.265', 'Common compressed video codecs. H.264 in MP4 is the standard online preview format for festival submissions via FilmFreeway.'],
      ['1st AD', 'First Assistant Director. Runs the floor. Calls "rolling," manages the schedule, protects the director\'s time. Critical role even on a 2-day short.'],
      ['DOP / DP', 'Director of Photography / Cinematographer. Designs the look with the director. On a short, often also operates the camera.']
    ]
  },
  {
    cat: 'FESTIVAL &amp; SUBMISSION', items: [
      ['FILMFREEWAY', 'The dominant submission platform. Most festivals (~80%) accept submissions through it. One profile, one upload, many submissions.'],
      ['OSCAR-QUALIFYING', 'Festivals whose top awards make a short eligible for Academy Award consideration. Cannes, Sundance, Tribeca, SXSW, etc.'],
      ['WORLD PREMIERE / INTL PREMIERE / NORTH AMERICAN PREMIERE', 'Festival hierarchy. Tier-1 festivals usually require world or country-tier premiere status. Posting on YouTube counts as a world premiere — and disqualifies you.'],
      ['SCREENING FEE', 'Some festivals pay filmmakers a small honorarium for screening. ₹0 to ~$500 typical.'],
      ['PRESS KIT / EPK', 'Electronic Press Kit. Includes synopsis, director\'s bio, film stills, poster, technical specs. Festivals require this with submission.'],
      ['SAG / GUILD', 'U.S. actor unions. Most Indian shorts are non-union; relevant only if hiring U.S. talent.']
    ]
  },
  {
    cat: 'CRAFT TERMS', items: [
      ['SHOWING vs. TELLING', '"Show, don\'t tell." A short film should reveal character through action and image, not exposition. Cut "as you know" dialogue ruthlessly.'],
      ['SETUP / PAYOFF', 'An object, line, or detail introduced early ("setup") that returns later with new meaning ("payoff"). Compressed in shorts; often only one or two pairs.'],
      ['SUBTEXT', 'What the scene is REALLY about, beneath what\'s being said. The best short film dialogue has subtext that lands harder than the surface meaning.'],
      ['TURN', 'The single moment in a short where everything pivots. The midpoint of a feature in spirit; in a short, it\'s almost the whole film.'],
      ['FINAL IMAGE', 'The last frame the audience sees. In a short film, this image must contain the meaning. If your film could lose its final image, you don\'t have a final image yet.']
    ]
  }
];

function renderGlossary() {
  const section = h('section.glossary', { id: 'glossary' }, [
    h('h2', { html: 'The <em>Short Film Glossary.</em>' }),
    h('p.deck', {
      text: 'Every term used in this blueprint that a first-time filmmaker might not know. '
          + 'Bookmark; you\'ll come back when you hit a new collaborator\'s vocabulary.'
    })
  ]);
  for (const group of GLOSSARY) {
    section.append(h('div.gloss-cat', { html: group.cat }));
    section.append(h('div.gloss-list', {}, group.items.map(([term, def]) =>
      h('dl.gloss-item', {}, [h('dt', { text: term }), h('dd', { html: def })])
    )));
  }
  return section;
}

function renderFinalPage() {
  return h('section.final-page', {}, [
    h('p.quote', {
      html: '"The best short films are not short stories.<br>They are single, indivisible moments'
          + '<br>caught at their exact temperature."'
    }),
    h('div.signature', { html: 'THE SHORT FILM BLUEPRINT · CURATED BY <span>ARUNAK</span>' })
  ]);
}

// ============================================================
// RENDER — inline-handler adoption
// ------------------------------------------------------------
// src/data is frozen, and some authored `raw` blocks in it still
// carry onclick="fn(arg)". Rather than leave inline handlers in the
// live DOM (they need `unsafe-inline` and a global function of that
// name), rewrite each one into the data-action it maps to.
// ============================================================
const ADOPTED_HANDLERS = {
  addSceneMapRow:  'scenemap-add',
  addScriptScene:  'script-add-scene',
  rebuildPreview:  'preview-refresh',
  copyFountain:    'copy-fountain',
  copyPlainText:   'copy-plain',
  clearScript:     'clear-script',
  buildAIPrompt:   'ai-prompt',
  copyAIPrompt:    'copy-ai-prompt',
  exportFountain:  'export-fountain',
  exportPlainTxt:  'export-txt',
  printScriptOnly: 'print-script'
};

function adoptInlineHandlers(root) {
  root.querySelectorAll('[onclick], [onchange]').forEach((el) => {
    for (const attr of ['onclick', 'onchange']) {
      const src = el.getAttribute(attr);
      if (src == null) continue;
      el.removeAttribute(attr);
      const m = String(src).trim().match(/^([A-Za-z_$][\w$]*)\s*\(\s*(.*?)\s*\)\s*;?$/);
      const action = m && ADOPTED_HANDLERS[m[1]];
      if (!action) {
        console.warn('[short] dropped an inline handler with no data-action mapping:', src);
        continue;
      }
      el.setAttribute(attr === 'onclick' ? 'data-action' : 'data-change', action);
      const arg = m[2].replace(/^['"]|['"]$/g, '');
      if (arg) el.setAttribute('data-arg', arg);
    }
  });
}

// ============================================================
// RENDER — the page
// ============================================================
function render() {
  const app = document.getElementById('app');
  const main = h('main', { id: 'main' });

  main.append(renderCover(), renderHowTo());

  const stepHost = document.createElement('div');
  // `badge` in steps.short.json is an object ({step, initial}); the shared
  // renderer treats step.badge as an authored HTML string, so handing it
  // over verbatim stringifies to "[object Object]" in the page. Render the
  // badges here instead, where the legacy markup put them — inside
  // .step-header, after .step-time — and keep the renderer out of it.
  // beatviz / festgrid are views of data that lives elsewhere (the
  // `beats` array, festivals.json). The page owns those renderers; the
  // shared module stays out of page data.
  renderSteps(stepHost, STEPS.map(({ badge, ...rest }) => rest), {
    beatviz: renderBeatViz,
    festgrid: renderFestivals
  });
  for (const step of STEPS) {
    if (!step.badge) continue;
    const header = stepHost.querySelector(`#${step.id} .step-header`);
    if (!header) continue;
    header.append(h('div.step-badge', {
      'data-step': step.badge.step ?? step.num,
      text: step.badge.initial ?? 'EMPTY'
    }));
  }

  adoptInlineHandlers(stepHost);
  main.append(...stepHost.childNodes);

  main.append(renderGlossary(), renderFinalPage());

  app.replaceChildren(renderToolbar(), main);
  injectScriptOnlyPrintCSS();

  statusEl = document.getElementById('saveStatus');
}

// ============================================================
// SCRIPT-ONLY PRINT MODE
// ------------------------------------------------------------
// Ported from the legacy inline <style>. The selectors walk one level
// deeper now, because the steps live inside <main> rather than being
// direct children of <body>.
// ============================================================
function injectScriptOnlyPrintCSS() {
  if (document.getElementById('script-only-print-css')) return;
  const style = document.createElement('style');
  style.id = 'script-only-print-css';
  style.textContent = `
    @media print {
      body.script-only-print > *:not(#app) { display: none !important; }
      body.script-only-print #app > *:not(main) { display: none !important; }
      body.script-only-print main > *:not(.step) { display: none !important; }
      body.script-only-print main > .step:not(#step-08) { display: none !important; }
      body.script-only-print #step-08 > *:not(.script-preview) { display: none !important; }
      body.script-only-print .script-preview {
        background: white !important; color: black !important;
        box-shadow: none !important; border: none !important;
        padding: 0 !important; max-width: none !important;
      }
    }
  `;
  document.head.appendChild(style);
}

// ============================================================
// DATA SAVE / LOAD
// ============================================================
function saveData() {
  const data = {};
  document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
    const k = el.getAttribute('data-key');
    if (el.type === 'checkbox') data[k] = !!el.checked;
    else data[k] = el.value || '';
  });
  // The scene map and the script are arrays, not flat keys. This is the
  // only place either is written — see the header note on bug (a).
  const script = collectScriptData();
  data._sceneMap = collectSceneMapData();
  data._script = script;
  // checked checklist items
  document.querySelectorAll('.step-check li').forEach((li) => {
    const k = li.getAttribute('data-key');
    if (k) data[k] = li.classList.contains('done');
  });
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  flashStatus('●  saved');
  updateProgress();
  updateAllBadges();
  updateLoglineCount();
  updatePageCounter(script);
  rebuildPreview(script);
  refreshBeatDots();
}

/**
 * Bug (a), the returning-user half: earlier builds wrote the scene map
 * twice, and because row numbers renumber on every reload the flat
 * `sm_<n>_<field>` keys piled up in storage forever. Lift whatever is
 * in them into rows, and drop them — the caller re-saves, so they never
 * come back.
 */
function migrateFlatSceneKeys(data) {
  const byIndex = new Map();
  let found = false;
  for (const key of Object.keys(data)) {
    const m = key.match(/^sm_(\d+)_(.+)$/);
    if (!m || !SCENE_FIELDS.includes(m[2])) continue;
    found = true;
    const idx = parseInt(m[1], 10);
    if (!byIndex.has(idx)) byIndex.set(idx, {});
    byIndex.get(idx)[m[2]] = data[key];
    delete data[key];
  }
  if (!found) return null;
  const rows = [...byIndex.keys()].sort((a, b) => a - b)
    .map((i) => byIndex.get(i))
    .filter((row) => Object.values(row).some((v) => String(v || '').trim()));
  return { rows };
}

function loadData() {
  let data = {};
  try { data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); } catch (e) {}

  const migrated = migrateFlatSceneKeys(data);

  document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
    const k = el.getAttribute('data-key');
    if (data[k] === undefined) return;
    if (el.type === 'checkbox') el.checked = !!data[k];
    else el.value = data[k];
  });
  // checklist
  document.querySelectorAll('.step-check li').forEach((li) => {
    const k = li.getAttribute('data-key');
    if (k && data[k]) setChecked(li, true);
  });

  // scene map — `[]` used to be truthy here, which left a returning user
  // staring at a table with no rows and no way to add one.
  let sceneRows = Array.isArray(data._sceneMap) ? data._sceneMap : null;
  if ((!sceneRows || !sceneRows.length) && migrated && migrated.rows.length) {
    sceneRows = migrated.rows;
  }
  if (sceneRows && sceneRows.length) sceneRows.forEach((row) => addSceneMapRow(1, row));
  if (!document.querySelectorAll('#sceneMapBody tr').length) addSceneMapRow(MIN_SCENE_ROWS);

  // script — same trap, same floor
  const scriptScenes = Array.isArray(data._script) ? data._script : null;
  if (scriptScenes && scriptScenes.length) scriptScenes.forEach((scene) => addScriptScene(scene));
  if (!document.querySelectorAll('#scriptScenes .scene-block').length) {
    for (let i = 0; i < MIN_SCRIPT_SCENES; i++) addScriptScene();
  }

  if (migrated) {
    // Write the cleaned object straight back, so the stale keys are gone
    // even if the user never types another character.
    saveData();
    return;
  }

  const script = collectScriptData();
  updateProgress();
  updateAllBadges();
  updateLoglineCount();
  updatePageCounter(script);
  rebuildPreview(script);
  refreshBeatDots();
}

function flashStatus(msg) {
  if (!statusEl) return;
  statusEl.textContent = msg;
  clearTimeout(flashStatus._t);
  flashStatus._t = setTimeout(() => { statusEl.textContent = '●  ready'; }, 1500);
}
function debouncedSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveData, 600);
}

// ============================================================
// CHECKLIST
// ============================================================
function setChecked(li, done) {
  li.classList.toggle('done', done);
  // steps.js renders these with role="checkbox" aria-checked="false";
  // keep the ARIA state honest instead of leaving it stuck at false.
  li.setAttribute('aria-checked', done ? 'true' : 'false');
}
function toggleCheck(li) {
  setChecked(li, !li.classList.contains('done'));
  saveData();
}

// ============================================================
// PROGRESS
// ============================================================
function updateProgress() {
  let total = 0, filled = 0;
  document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
    if (el.type === 'checkbox') return;
    total++;
    if ((el.value || '').trim().length > 0) filled++;
  });
  document.querySelectorAll('.step-check li').forEach((li) => {
    total++;
    if (li.classList.contains('done')) filled++;
  });
  const pct = total > 0 ? Math.round((filled / total) * 100) : 0;
  document.getElementById('progressFill').style.width = pct + '%';
  document.getElementById('progressText').textContent = pct + '%';
}

function updateAllBadges() {
  document.querySelectorAll('.step-badge[data-step]').forEach((badge) => {
    const step = badge.closest('.step');
    if (!step) return;
    let total = 0, filled = 0;
    step.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
      if (el.type === 'checkbox') return;
      total++;
      if ((el.value || '').trim().length > 0) filled++;
    });
    step.querySelectorAll('.step-check li').forEach((li) => {
      total++;
      if (li.classList.contains('done')) filled++;
    });
    badge.classList.remove('empty', 'partial', 'complete');
    if (total === 0) { badge.classList.add('empty'); badge.textContent = 'EMPTY'; return; }
    const ratio = filled / total;
    if (ratio === 0) { badge.classList.add('empty'); badge.textContent = 'EMPTY'; }
    else if (ratio < 1) { badge.classList.add('partial'); badge.textContent = 'IN PROGRESS · ' + Math.round(ratio * 100) + '%'; }
    else { badge.classList.add('complete'); badge.textContent = 'COMPLETE'; }
  });
}

// ============================================================
// LOGLINE WORD COUNT
// ============================================================
function updateLoglineCount() {
  const el = document.querySelector('[data-key="s2_log_final"]');
  const out = document.getElementById('logline-count');
  if (!el || !out) return;
  const words = (el.value || '').trim().split(/\s+/).filter(Boolean).length;
  out.textContent = words + ' / 25 words';
  out.style.color = words > 25 ? 'var(--warn)' : 'var(--muted)';
}

// ============================================================
// SCENE MAP
// ------------------------------------------------------------
// Rows carry `data-field`, not `data-key`. The row number is display
// only: it is renumbered on every add/duplicate/delete, so it can no
// longer disagree with the row's position or leak into storage.
// ============================================================
function buildSceneMapRow(prefill) {
  const tr = document.createElement('tr');
  const data = prefill || {};
  tr.innerHTML = `
    <td class="num">01</td>
    <td><input type="text" data-field="slug" aria-label="Slug line" placeholder="INT. APARTMENT - DAY" value="${escAttr(data.slug)}"></td>
    <td><input type="text" data-field="who" aria-label="Who is in the scene" placeholder="Ravi, Maya" value="${escAttr(data.who)}"></td>
    <td><textarea data-field="what" aria-label="What happens" placeholder="What happens. End on a different value than start.">${escHTML(data.what)}</textarea></td>
    <td><select data-field="beat" aria-label="Beat">
      <option value="">—</option>
      ${SCENE_BEATS.map((b) => `<option${data.beat === b ? ' selected' : ''}>${b}</option>`).join('')}
    </select></td>
    <td><input type="text" data-field="pages" aria-label="Pages" placeholder="0.5" value="${escAttr(data.pages)}" style="width:60px;"></td>
    <td class="row-ctrl">
      <button class="row-ctrl-btn" data-action="scenemap-duplicate" title="Duplicate" aria-label="Duplicate this scene">⎘</button>
      <button class="row-ctrl-btn del" data-action="scenemap-delete" title="Delete" aria-label="Delete this scene">✕</button>
    </td>
  `;
  return tr;
}

function renumberSceneMap() {
  document.querySelectorAll('#sceneMapBody tr').forEach((tr, i) => {
    const cell = tr.querySelector('td.num');
    if (cell) cell.textContent = String(i + 1).padStart(2, '0');
  });
}

function addSceneMapRow(n = 1, prefill) {
  const body = document.getElementById('sceneMapBody');
  if (!body) return;
  if (Array.isArray(prefill)) { prefill.forEach((p) => addSceneMapRow(1, p)); return; }
  for (let i = 0; i < n; i++) body.appendChild(buildSceneMapRow(prefill));
  renumberSceneMap();
}

function rowValues(tr) {
  const row = {};
  tr.querySelectorAll('[data-field]').forEach((el) => { row[el.getAttribute('data-field')] = el.value; });
  return row;
}

function duplicateSceneMapRow(tr) {
  tr.after(buildSceneMapRow(rowValues(tr)));
  renumberSceneMap();
  saveData();
}
function deleteSceneMapRow(tr) {
  if (!confirm('Delete this scene from the map?')) return;
  tr.remove();
  renumberSceneMap();
  saveData();
}
function collectSceneMapData() {
  const rows = [];
  document.querySelectorAll('#sceneMapBody tr').forEach((tr) => rows.push(rowValues(tr)));
  return rows;
}

// ============================================================
// SCRIPT EDITOR
// ============================================================
// `scriptSceneCount` is a uid source for the dialogue containers, not
// a display number — the SCENE NN tags are renumbered by position.
let scriptSceneUid = 0;

function addScriptScene(prefill) {
  const data = prefill || { slug: '', action: '', dialogues: [] };
  const idx = ++scriptSceneUid;
  const div = document.createElement('div');
  div.className = 'scene-block';
  div.dataset.sceneIdx = idx;
  div.innerHTML = `
    <div class="scene-header">
      <span class="scene-tag">SCENE 01</span>
      <input type="text" class="slug" aria-label="Slug line" placeholder="INT. APARTMENT - DAY" value="${escAttr(data.slug)}">
      <button class="row-ctrl-btn del" data-action="script-remove-scene" data-index="${idx}" title="Delete this scene" aria-label="Delete this scene">✕</button>
    </div>
    <span class="action-label">ACTION</span>
    <textarea class="action" aria-label="Action" placeholder="Describe what happens. Present tense. Third person. No camera directions unless essential.">${escHTML(data.action)}</textarea>
    <div class="dialogues" id="dialogues_${idx}"></div>
    <button class="add-dialogue-btn" data-action="add-dialogue" data-index="${idx}">+ ADD DIALOGUE</button>
  `;
  document.getElementById('scriptScenes').appendChild(div);
  if (Array.isArray(data.dialogues)) data.dialogues.forEach((d) => addDialogue(idx, d));
  renumberScriptScenes();
}

function renumberScriptScenes() {
  document.querySelectorAll('#scriptScenes .scene-block').forEach((block, i) => {
    const tag = block.querySelector('.scene-tag');
    if (tag) tag.textContent = 'SCENE ' + String(i + 1).padStart(2, '0');
  });
}

function addDialogue(sceneIdx, prefill) {
  const data = prefill || { character: '', parenthetical: '', line: '' };
  const wrap = document.getElementById('dialogues_' + sceneIdx);
  if (!wrap) return;
  const div = document.createElement('div');
  div.className = 'dialogue-block';
  div.innerHTML = `
    <div class="dlg-row">
      <input type="text" class="character" aria-label="Character name" placeholder="CHARACTER NAME" value="${escAttr(data.character)}">
      <textarea class="line" aria-label="Dialogue line" placeholder="The dialogue line.">${escHTML(data.line)}</textarea>
      <button class="row-ctrl-btn del" data-action="remove-dialogue" title="Delete" aria-label="Delete this dialogue">✕</button>
    </div>
    <div class="paren">
      <input type="text" class="parenthetical" aria-label="Parenthetical" placeholder="(parenthetical, optional — e.g. whispering, off-screen)" value="${escAttr(data.parenthetical)}">
    </div>
  `;
  wrap.appendChild(div);
}

function removeScriptScene(idx) {
  if (!confirm('Delete this whole scene from the script?')) return;
  const block = document.querySelector(`.scene-block[data-scene-idx="${idx}"]`);
  if (block) block.remove();
  renumberScriptScenes();
  saveData();
}

function collectScriptData() {
  const scenes = [];
  document.querySelectorAll('#scriptScenes .scene-block').forEach((block) => {
    const slug = block.querySelector('input.slug').value || '';
    const action = block.querySelector('textarea.action').value || '';
    const dialogues = [];
    block.querySelectorAll('.dialogue-block').forEach((d) => {
      dialogues.push({
        character: d.querySelector('input.character').value || '',
        parenthetical: d.querySelector('input.parenthetical').value || '',
        line: d.querySelector('textarea.line').value || ''
      });
    });
    scenes.push({ slug, action, dialogues });
  });
  return scenes;
}

function clearScript() {
  if (!confirm('Clear ALL scenes from the script? This cannot be undone unless you exported JSON.')) return;
  document.getElementById('scriptScenes').innerHTML = '';
  scriptSceneUid = 0;
  addScriptScene();
  saveData();
}

// ============================================================
// FORMATTED PREVIEW + PAGE COUNT
// ------------------------------------------------------------
// Both used to call collectScriptData() themselves — so one keystroke
// walked the whole script three times (saveData, updatePageCounter,
// rebuildPreview). The save cycle collects once and passes it down;
// the standalone callers (the REFRESH PREVIEW button) still work.
// ============================================================
function rebuildPreview(scenes = collectScriptData()) {
  const preview = document.getElementById('scriptPreview');
  if (!preview) return;
  if (scenes.length === 0 || (scenes.length === 1 && !scenes[0].slug && !scenes[0].action)) {
    preview.innerHTML = '<div class="sp-empty">Add scenes and dialogue in Step 7 to see the formatted preview here.</div>';
    return;
  }
  const data = collectFieldData();
  const title = (data.meta_title || 'Untitled Short').toUpperCase();
  const writer = data.meta_writer || '';
  let html = '<div class="sp-title">';
  html += '<div class="sp-title-main">' + escHTML(title) + '</div>';
  if (writer) html += '<div class="sp-title-byline">written by<br>' + escHTML(writer) + '</div>';
  html += '</div>';
  html += '<div class="sp-fade">FADE IN:</div>';
  scenes.forEach((scene) => {
    if (scene.slug) html += '<div class="sp-slug">' + escHTML(scene.slug.toUpperCase()) + '</div>';
    if (scene.action) html += '<div class="sp-action">' + escHTML(scene.action) + '</div>';
    scene.dialogues.forEach((d) => {
      if (!d.character && !d.line) return;
      if (d.character) html += '<div class="sp-character">' + escHTML(d.character.toUpperCase()) + '</div>';
      if (d.parenthetical) html += '<div class="sp-paren">(' + escHTML(d.parenthetical.replace(/^\(|\)$/g, '')) + ')</div>';
      if (d.line) html += '<div class="sp-dialogue">' + escHTML(d.line) + '</div>';
    });
  });
  html += '<div class="sp-fade">FADE OUT.</div>';
  preview.innerHTML = html;
}

function updatePageCounter(scenes = collectScriptData()) {
  let words = 0;
  scenes.forEach((scene) => {
    if (scene.slug) words += scene.slug.split(/\s+/).filter(Boolean).length;
    if (scene.action) words += scene.action.split(/\s+/).filter(Boolean).length;
    scene.dialogues.forEach((d) => {
      if (d.character) words += 2; // weighted higher (centered, takes a line)
      if (d.line) words += d.line.split(/\s+/).filter(Boolean).length;
    });
  });
  // ~210 words per formatted page (industry rule of thumb)
  const pages = Math.round((words / WORDS_PER_PAGE) * 10) / 10;
  const minutes = Math.floor(pages);
  const seconds = Math.round((pages - minutes) * 60);
  document.getElementById('totalWords').textContent = words.toLocaleString();
  document.getElementById('totalPages').textContent = pages.toFixed(1);
  document.getElementById('totalRuntime').textContent = minutes + ':' + String(seconds).padStart(2, '0');
  const status = document.getElementById('runtimeStatus');
  const target = parseRuntime(document.querySelector('[data-key="meta_runtime"]')?.value || '');
  if (target && pages > 0) {
    const diff = pages - target;
    if (Math.abs(diff) < 1) { status.textContent = 'on target'; status.className = 'pc-status ok'; }
    else if (diff > 0) { status.textContent = 'long by ' + diff.toFixed(1) + ' pages'; status.className = 'pc-status warn'; }
    else { status.textContent = 'short by ' + Math.abs(diff).toFixed(1) + ' pages'; status.className = 'pc-status warn'; }
  } else if (pages > 30) {
    status.textContent = 'feature territory'; status.className = 'pc-status warn';
  } else {
    status.textContent = pages > 0 ? 'enter target runtime' : 'enter scenes below'; status.className = 'pc-status';
  }
}

function parseRuntime(s) {
  if (!s) return null;
  const m = s.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : null;
}

// ============================================================
// FOUNTAIN / PLAIN TEXT EXPORT
// ============================================================
function buildFountain() {
  const data = collectFieldData();
  const scenes = collectScriptData();
  let out = '';
  out += 'Title: ' + (data.meta_title || 'Untitled Short') + '\n';
  out += 'Author: ' + (data.meta_writer || '') + '\n';
  if (data.meta_started) out += 'Draft date: ' + data.meta_started + '\n';
  out += '\n';
  out += '====\n\n';
  out += 'FADE IN:\n\n';
  scenes.forEach((scene) => {
    if (scene.slug) out += scene.slug.toUpperCase().trim() + '\n\n';
    if (scene.action) out += scene.action.trim() + '\n\n';
    scene.dialogues.forEach((d) => {
      if (!d.character && !d.line) return;
      if (d.character) out += d.character.toUpperCase().trim() + '\n';
      if (d.parenthetical) {
        let p = d.parenthetical.trim();
        if (!p.startsWith('(')) p = '(' + p;
        if (!p.endsWith(')')) p = p + ')';
        out += p + '\n';
      }
      if (d.line) out += d.line.trim() + '\n';
      out += '\n';
    });
  });
  out += 'FADE OUT.\n';
  return out;
}

function downloadFile(text, filename, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}
function slugTitle() {
  const data = collectFieldData();
  return (data.meta_title || 'short').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'short';
}

function exportFountain() {
  downloadFile(buildFountain(), slugTitle() + '.fountain', 'text/plain');
  flashStatus('●  exported .fountain');
}
function copyFountain() {
  copyToClipboard(buildFountain(), '●  fountain copied');
}

function buildPlainText() {
  const data = collectFieldData();
  const scenes = collectScriptData();
  let out = '';
  out += (data.meta_title || 'UNTITLED').toUpperCase() + '\n';
  if (data.meta_writer) out += 'by ' + data.meta_writer + '\n';
  out += '\n';
  out += 'FADE IN:\n\n';
  scenes.forEach((scene) => {
    if (scene.slug) out += scene.slug.toUpperCase().trim() + '\n\n';
    if (scene.action) out += scene.action.trim() + '\n\n';
    scene.dialogues.forEach((d) => {
      if (!d.character && !d.line) return;
      if (d.character) out += '                    ' + d.character.toUpperCase().trim() + '\n';
      if (d.parenthetical) out += '              (' + d.parenthetical.replace(/^\(|\)$/g, '').trim() + ')\n';
      if (d.line) out += '          ' + d.line.trim() + '\n';
      out += '\n';
    });
  });
  out += 'FADE OUT.\n';
  return out;
}
function copyPlainText() { copyToClipboard(buildPlainText(), '●  plain text copied'); }
function exportPlainTxt() {
  downloadFile(buildPlainText(), slugTitle() + '.txt', 'text/plain');
  flashStatus('●  exported .txt');
}

function copyToClipboard(text, msg) {
  function fallback() {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); flashStatus(msg || '●  copied'); } catch (e) {}
    document.body.removeChild(ta);
  }
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => flashStatus(msg || '●  copied')).catch(fallback);
  } else fallback();
}

// ============================================================
// AI PROMPT GENERATOR
// ============================================================
function buildAIPrompt(kind) {
  const d = collectFieldData();
  const fb = (v, def) => (v && v.length ? v : def || '[fill in the blueprint]');
  let prompt = '';

  if (kind === 'scene') {
    prompt = `You are a screenwriter helping me write a single scene of a short film. Write ONE scene, in standard screenplay format, ~1 page (~210 words).

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final, fb(d.s2_log2, d.s2_log1))}
Theme: The film argues that — ${fb(d.b5_image, 'see beat 5 / final image')}.

PROTAGONIST
Name: ${fb(d.s3_name)}
Want: ${fb(d.s3_want)}
Obstacle: ${fb(d.s3_obstacle)}

WORLD
Location: ${fb(d.s5_loc)}
Time/weather: ${fb(d.s5_time)}
Sensory anchors: ${fb(d.s5_anchors)}
Rules of the world: ${fb(d.s5_rules)}

THE SCENE TO WRITE
[Describe the specific scene you want generated here. E.g. "the moment the protagonist first realizes their daughter doesn't trust them — set in their kitchen, mid-afternoon."]

CONSTRAINTS
- Standard screenplay format (slug line, action, dialogue).
- Present tense, third person.
- No camera directions unless essential.
- Keep dialogue spare — show, don't tell.
- ~1 page total (max 250 words).
- End the scene on a different value-charge than it started (positive→negative or vice versa).
- Match the tone of the world: ${fb(d.s5_time, 'realist')}.

Write only the scene. No commentary.`;
  } else if (kind === 'dialogue') {
    prompt = `You are a screenwriter helping me find the right dialogue for a moment in a short film. Write 4–8 lines of exchange between two characters.

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final)}

PROTAGONIST
${fb(d.s3_name)} — wants ${fb(d.s3_want)}, blocked by ${fb(d.s3_obstacle)}.

OTHER CHARACTER
[Describe — name, relationship, what THEY want in this moment.]

THE MOMENT
[Describe the dramatic situation: what just happened, what's at stake, what each character is trying to get from the other.]

CONSTRAINTS
- Each line under 15 words.
- Subtext over text — they say one thing, mean another.
- No exposition, no "as you know" dialogue.
- One of them lies; one of them notices.
- End on a beat — a silence, a look, a small action.
- Standard screenplay format (CHARACTER NAME above line).

Write only the dialogue exchange. No commentary.`;
  } else { // feedback
    prompt = `You are a script editor giving structural feedback on a short film. Read the script below and answer the FOUR questions at the end.

PROJECT
Title: ${fb(d.meta_title, 'Untitled Short')}
Logline: ${fb(d.s2_log_final)}
Target runtime: ${fb(d.meta_runtime, '~10 min')}
Protagonist's want: ${fb(d.s3_want)}
The 5 beats:
1. Setup — ${fb(d.b1_setup)}
2. Disturbance — ${fb(d.b2_disturb)}
3. Escalation — ${fb(d.b3_escalate)}
4. Turn — ${fb(d.b4_turn)}
5. Image — ${fb(d.b5_image)}

SCRIPT
${buildPlainText()}

QUESTIONS
1. Does the script earn its runtime, or does any scene stall?
2. Is the protagonist's want concrete and visible throughout?
3. Does the turn (Beat 4) actually change something, or is it just a reveal?
4. Does the final image (last frame) hold the meaning of the whole film?

Be specific. Quote scenes by their slug lines. Be honest, not nice.`;
  }
  document.getElementById('aiPrompt').value = prompt;
}

function copyAIPrompt() {
  const ta = document.getElementById('aiPrompt');
  if (!ta.value) { alert('Build a prompt first.'); return; }
  copyToClipboard(ta.value, '●  AI prompt copied');
}

// ============================================================
// EXPORTS / IMPORTS
// ============================================================
function collectFieldData() {
  const data = {};
  document.querySelectorAll(FIELD_SELECTOR).forEach((el) => {
    const k = el.getAttribute('data-key');
    if (el.type === 'checkbox') data[k] = !!el.checked;
    else data[k] = (el.value || '').trim();
  });
  return data;
}

function exportData() {
  saveData();
  const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  const t = (data.meta_title || 'short').replace(/[^a-z0-9]/gi, '_').toLowerCase() || 'short';
  downloadFile(JSON.stringify(data, null, 2), 'arunak_short_' + t + '.json', 'application/json');
  flashStatus('●  exported');
}

function importData() { document.getElementById('importFile').click(); }

function handleImport(e) {
  const file = e.target.files[0];
  if (!file) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      if (!confirm('Import will REPLACE your current data. Continue?')) return;
      localStorage.setItem(STORAGE_KEY, ev.target.result);
      // Clear DOM and reload
      document.getElementById('sceneMapBody').innerHTML = '';
      document.getElementById('scriptScenes').innerHTML = '';
      scriptSceneUid = 0;
      loadData();
      flashStatus('●  imported');
    } catch (err) { alert('Import failed: ' + err.message); }
  };
  r.readAsText(file);
  e.target.value = '';
}

function resetData() {
  if (!confirm('Erase ALL your data and start fresh? This cannot be undone unless you exported JSON first.')) return;
  if (!confirm('Are you SURE? Last chance.')) return;
  localStorage.removeItem(STORAGE_KEY);
  location.reload();
}

function printScriptOnly() {
  document.body.classList.add('script-only-print');
  setTimeout(() => {
    window.print();
    setTimeout(() => document.body.classList.remove('script-only-print'), 300);
  }, 100);
}

// ============================================================
// PREFERENCES (DARK MODE)
// ============================================================
function toggleDark() {
  // studio-ui.js owns a 3-state theme (paper / sepia / ink) on its own key.
  // Toggling `body.dark` locally desynced the two: the class flipped but the
  // shared layer re-applied its stored theme on the next load. Delegate.
  if (StudioUI && StudioUI.cycleTheme) { StudioUI.cycleTheme(); return; }
  document.body.classList.toggle('dark');
  const dark = document.body.classList.contains('dark');
  localStorage.setItem(PREF_KEY, JSON.stringify({ dark }));
  document.getElementById('darkBtn').textContent = dark ? '☀' : '◐';
}

function loadPrefs() {
  // Legacy path only — StudioUI's loadTheme() runs after this and is the
  // authority whenever the shared chrome is present.
  try {
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p.dark) document.body.classList.add('dark');
    document.getElementById('darkBtn').textContent =
      document.body.classList.contains('dark') ? '☀' : '◐';
  } catch (e) {}
}

// ============================================================
// STEP JUMPER
// ============================================================
function jumpToStep(target) {
  if (!target) return;
  const el = target === 'top' ? document.querySelector('.cover') : document.getElementById(target);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  document.getElementById('stepJumper').value = '';
}

// ============================================================
// EVENT WIRING — one delegated listener per event type.
// The legacy page had ~30 inline handlers; a page with any of them
// cannot run under a Content-Security-Policy worth having.
// ============================================================
const CLICK_ACTIONS = {
  'toggle-dark':         () => toggleDark(),
  'print':               () => window.print(),
  'export-json':         () => exportData(),
  'import-json':         () => importData(),
  'reset':               () => resetData(),
  'scenemap-add':        (e, el) => { addSceneMapRow(parseInt(el.dataset.arg, 10) || 1); saveData(); },
  'scenemap-duplicate':  (e, el) => duplicateSceneMapRow(el.closest('tr')),
  'scenemap-delete':     (e, el) => deleteSceneMapRow(el.closest('tr')),
  'script-add-scene':    () => { addScriptScene(); saveData(); },
  'script-remove-scene': (e, el) => removeScriptScene(el.dataset.index),
  'add-dialogue':        (e, el) => { addDialogue(el.dataset.index); saveData(); },
  'remove-dialogue':     (e, el) => { el.closest('.dialogue-block').remove(); saveData(); },
  'preview-refresh':     () => rebuildPreview(),
  'clear-script':        () => clearScript(),
  'copy-fountain':       () => copyFountain(),
  'copy-plain':          () => copyPlainText(),
  'export-fountain':     () => exportFountain(),
  'export-txt':          () => exportPlainTxt(),
  'print-script':        () => printScriptOnly(),
  'ai-prompt':           (e, el) => buildAIPrompt(el.dataset.arg),
  'copy-ai-prompt':      () => copyAIPrompt()
};

const CHANGE_ACTIONS = {
  'jump-step':   (e, el) => jumpToStep(el.value),
  'import-file': (e) => handleImport(e)
};

function wireEvents() {
  delegate(document, 'click', '[data-action]', (e, el) => {
    const fn = CLICK_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(e, el);
  });

  delegate(document, 'change', '[data-change]', (e, el) => {
    const fn = CHANGE_ACTIONS[el.dataset.change];
    if (fn) fn(e, el);
  });

  // Beat dots: the stylesheet always promised these were clickable.
  const jumpToBeat = (el) => {
    const field = document.querySelector(`[data-key="${el.dataset.beatKey}"]`);
    if (!field) return;
    field.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => field.focus(), 280);
  };
  const showBeatTip = (dot) => {
    const viz = dot.closest('.beat-viz');
    const tip = viz && viz.querySelector('.beat-tooltip');
    const beat = BEATS.find((b) => b.key === dot.dataset.beatKey);
    if (!tip || !beat) return;
    const field = document.querySelector(`[data-key="${beat.key}"]`);
    const written = ((field && field.value) || '').trim();
    tip.replaceChildren(
      h('div.beat-tip-head', {
        text: `BEAT ${beat.num} · ${beat.name.toUpperCase()} · ${beat.percentage}`
      }),
      h('div', { text: written.length > 140 ? written.slice(0, 140) + '…' : (written || 'Not yet written.') })
    );
    // Map the dot's viewBox coordinates onto the rendered SVG box.
    const svgBox = viz.querySelector('svg').getBoundingClientRect();
    const vizBox = viz.getBoundingClientRect();
    const x = (Number(dot.getAttribute('cx')) / BEAT_W) * svgBox.width + (svgBox.left - vizBox.left);
    const y = (Number(dot.getAttribute('cy')) / BEAT_H) * svgBox.height + (svgBox.top - vizBox.top);
    tip.style.left = Math.max(0, Math.min(x - 120, vizBox.width - 240)) + 'px';
    tip.style.top = Math.max(0, y - tip.offsetHeight - 14) + 'px';
    tip.classList.add('show');
  };
  const hideBeatTip = (dot) => {
    const viz = dot.closest('.beat-viz');
    const tip = viz && viz.querySelector('.beat-tooltip');
    if (tip) tip.classList.remove('show');
  };
  // mouseenter/focus do not bubble, so delegation uses their bubbling twins.
  delegate(document, 'mouseover', '.beat-viz .beat-dot[data-beat-key]', (e, el) => showBeatTip(el));
  delegate(document, 'mouseout',  '.beat-viz .beat-dot[data-beat-key]', (e, el) => hideBeatTip(el));
  delegate(document, 'focusin',   '.beat-viz .beat-dot[data-beat-key]', (e, el) => showBeatTip(el));
  delegate(document, 'focusout',  '.beat-viz .beat-dot[data-beat-key]', (e, el) => hideBeatTip(el));
  delegate(document, 'click', '.beat-viz .beat-dot[data-beat-key]', (e, el) => jumpToBeat(el));
  delegate(document, 'keydown', '.beat-viz .beat-dot[data-beat-key]', (e, el) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpToBeat(el); }
  });

  // Checklist items
  delegate(document, 'click', '.step-check li', (e, li) => toggleCheck(li));
  delegate(document, 'keydown', '.step-check li', (e, li) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleCheck(li); }
  });

  document.addEventListener('input', (e) => {
    if (e.target.matches('[data-key]') || e.target.closest('#sceneMapBody, #scriptScenes')) {
      debouncedSave();
    }
  });
  document.addEventListener('change', (e) => {
    if (e.target.matches('[data-key]') || e.target.closest('#sceneMapBody, #scriptScenes')) {
      debouncedSave();
    }
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') { e.preventDefault(); saveData(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'd') { e.preventDefault(); toggleDark(); }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); document.getElementById('stepJumper').focus(); }
  });
}

// ============================================================
// INIT — render, then the legacy boot order.
// ============================================================
render();
wireEvents();
loadPrefs();
loadData();
updateProgress();

// chrome.js runs its auto-init at import time, when #app is still empty,
// so every piece of it that needs rendered markup has to be called again
// here. The other three pages already did this; short.js did not, which
// is why it had no step rail, no reading progress, no saved-field flash
// and 18 inputs announcing nothing to a screen reader.
//
// buildBeatVisualizer() is deliberately absent: it keys off
// [data-key="b01"] and draws the feature's 15-beat Save-the-Cat curve.
// The short film has its own five-beat model (b1_setup … b5_image), so
// the visualiser would be permanently dead code on this page rather than
// merely inactive. A short-form equivalent would be a new renderer, not
// this call.
function reinitChrome() {
  try {
    StudioUI.injectReadingProgress();
    StudioUI.buildStepRail();
    StudioUI.wireGlossaryPopovers();
    StudioUI.wireFieldSavedFlash();
    StudioUI.autoAriaLabels();
    StudioUI.polishEmptyStates();
    const toolbar = document.querySelector('.toolbar');
    if (toolbar) StudioUI.attachSignInPill(toolbar);
    if (window.matchMedia('(max-width: 720px)').matches) StudioUI.attachMobileActionBar();
  } catch (e) {
    // The chrome extras are a polish layer; none of them is a reason to
    // take down a page the user has writing in.
    console.warn('[short] chrome re-init', e);
  }
}
reinitChrome();
