/* ============================================================
   STEP RENDERER
   ------------------------------------------------------------
   Renders a step object from src/data/steps.*.json into the DOM.

   The single most important property of this file: the markup it
   produces is byte-equivalent in STRUCTURE to what the legacy
   pages hand-wrote. Same tags, same class names, same data-key
   attributes, same order. That is what lets the existing page
   behaviour (saveData/loadData/updateProgress/search/print) keep
   working untouched, and what lets us verify the migration by
   diffing rendered text against the originals.

   The 24 feature steps used to exist in three places — the
   markup, the jump dropdown, and exportMarkdown(). Now they
   exist once, as data, and all three read from here.
   ============================================================ */

import { videoSlot } from './video-slots.js';
import { stepKey } from '../lib/video-keys.js';
import { h, fromHTML, delegate } from '../lib/dom.js';
import SIDECAR from '../data/steps.tanglish.json';
import PRIORITY from '../data/steps.priority.json';
import COPY from '../data/steps.copy.json';
import { currentLang, onLangChange, langToggle, setLang } from '../lib/lang.js';
/* Which of the five stages a step is in, and where in the app it is
   done. Its own module because it reads the scene, script and
   contact models for the live readouts, and this one should not. */
import { stageInfo, stageRow, partLabel } from './step-stages.js';

/* ---- gloss ------------------------------------------------
   Tanglish was extracted out of its parent prose. Put it back
   as the trailing span the stylesheet expects. `cls` differs by
   block type in the original ('tn' inside formula/craft/why,
   'tanglish' inside examples) and the CSS distinguishes them,
   so the caller passes the right one rather than us guessing. */
function gloss(text, cls = 'tn') {
  return text ? h(`span.${cls}`, { html: text }) : null;
}

/* ============================================================
   TANGLISH FOR THE STEPS
   ------------------------------------------------------------
   Two different things share the word "tanglish" in this file and
   confusing them would be a mess, so:

   A GLOSS (b.tanglish, rendered as a trailing .tn span) is a short
   companion line for a formula or a craft note. It is shown in BOTH
   languages, always, because that is what it has always done and a
   one-line gloss costs nothing.

   A FULL TRANSLATION (src/data/steps.tanglish.json) is a whole
   paragraph standing in for the English one. Showing both would
   double the length of all 43 steps, so it REPLACES rather than
   accompanies, and only in Tanglish mode.

   WHY IT SWAPS IN PLACE AND DOES NOT RE-RENDER. A step is full of
   <input data-key> fields holding the user's writing. Re-rendering
   the tree to change a language would throw away anything typed
   since the last autosave. So the language swap touches prose nodes
   only, found by data-tl-* markers, and never rebuilds a step.
   ============================================================ */

const EN = new Map();   // marker key -> the English original

function deckKey(ns, step) { return ns ? ns + ':' + step.id : null; }

/** Swap every marked prose node to the current language, in place. */
function paintLang() {
  const tl = currentLang() === 'tl';
  document.querySelectorAll('[data-tl-deck]').forEach((el) => {
    const key = el.getAttribute('data-tl-deck');
    const alt = SIDECAR.decks[key];
    const en = EN.get('deck:' + key);
    if (!alt || en == null) return;
    el.innerHTML = tl ? alt : en;
  });
  document.querySelectorAll('[data-tl-why]').forEach((el) => {
    const key = el.getAttribute('data-tl-why');
    const [k, i] = [key.slice(0, key.lastIndexOf(':')), +key.slice(key.lastIndexOf(':') + 1)];
    const alt = (SIDECAR.why[k] || [])[i];
    const en = EN.get('why:' + key);
    if (!alt || en == null) return;
    el.innerHTML = tl ? alt : en;
  });
}

onLangChange(paintLang);

// The control is rendered by lib/lang.js and bound once here, so a
// page only has to decide WHERE it goes, not how it works.
if (typeof document !== 'undefined') {
  delegate(document, 'click', '[data-action="set-lang"]', (e, btn) => setLang(btn.dataset.lang));
}

/* The switch, mounted once per page rather than once per steps host
   — feature.js calls renderSteps() four times and four identical
   language toggles down one page would be absurd. It governs every
   marked node on the page, so it belongs above all of them. */
export function mountStepsLang(before, ns) {
  if (!before || document.querySelector('.steps-lang')) return null;
  const keys = Object.keys(SIDECAR.decks).filter((k) => k.startsWith(ns + ':'));
  if (!keys.length) return null;   // nothing translated — no control
  const wrap = h('div.steps-lang');
  wrap.append(langToggle({
    hint: 'Switches the step explanations. Field labels, step names and'
        + ' your own writing are untouched.'
  }));
  before.parentNode.insertBefore(wrap, before);
  return wrap;
}

/* ============================================================
   WHICH STEPS MATTER FIRST
   ------------------------------------------------------------
   CLAUDE.md open item 8. A new project opens on step 01 of 32
   with nothing saying which of them are load-bearing, and the
   note is explicit that this is a steps problem rather than a
   hub one — so the answer lives here, beside the renderer.

   IT IS DATA. src/data/steps.priority.json names a SPINE (an
   ordered shortest path to a blueprint you could show somebody)
   and, per step, the thing in the app that READS its answers.
   Nothing in this file lists a step: the marks, the ranks, the
   counts and the path panel are all derived from that file
   crossed with the steps actually rendered. Invariant 2, and
   the same reason the jump menu stopped being hand-written.

   A SIDECAR for the same reason the Tanglish one is: two of the
   three step files are regenerated by `npm run extract`, so a
   flag written into them does not survive, and splitting the
   fact across two files by whether the file happens to be
   generated is how the two halves drift.

   IT REMOVES NOTHING. Every one of the 32 steps is still on the
   page, in the order it has always been in, and the spine
   filter is off until somebody asks for it. The completionist
   is not being managed.

   AN ORPHAN KEY IS LOUD, NOT SILENT. A step that is renumbered
   or dropped leaves a key here pointing at nothing, and the
   symptom would otherwise be invisible — that step simply stops
   being on the spine and the count quietly reads 9 of 32. So
   the keys are checked against what actually rendered, once,
   and reported. `console.warn`, not `error`: a data gap should
   be shouted at a developer, not fail a user's page.
   ============================================================ */

/** "ns:id" → { n, total, note }, in the order the data lists them. */
const SPINE = new Map();
(function indexSpine() {
  const list = Array.isArray(PRIORITY.spine) ? PRIORITY.spine : [];
  list.forEach((entry, i) => {
    const key = entry && typeof entry === 'object' ? entry.step : entry;
    if (!key) return;
    SPINE.set(String(key), {
      n: i + 1,
      total: list.length,
      note: (entry && entry.note) || ''
    });
  });
})();

const UNLOCKS = (PRIORITY.unlocks && typeof PRIORITY.unlocks === 'object')
  ? PRIORITY.unlocks : {};

const prioKey = (ns, step) => (ns ? ns + ':' + (step.id || step) : null);

/** Where a step sits on the spine, or null if it is not on it. */
export function spineRank(ns, step) {
  const key = prioKey(ns, step);
  return (key && SPINE.get(key)) || null;
}

/** What in the app reads this step's answers, or ''. */
export function stepUnlocks(ns, step) {
  const key = prioKey(ns, step);
  return (key && UNLOCKS[key]) || '';
}

/**
 * The spine, resolved against the steps a page actually rendered.
 *
 *   groups  [{ ns, steps }]  — the namespaces on this page, in page order
 *
 * Returns the spine entries IN SPINE ORDER, each carrying the step
 * object it matched. A spine key that matches no rendered step is
 * dropped from the path and reported — a path with a dead rung in it
 * is worse than a shorter one.
 */
export function spinePath(groups) {
  const found = [];
  const seen = new Set();
  for (const { ns, steps } of groups || []) {
    for (const step of steps || []) {
      const key = prioKey(ns, step);
      const rank = key && SPINE.get(key);
      if (!rank || seen.has(key)) continue;
      seen.add(key);
      found.push({ key, ns, step, ...rank });
    }
  }
  found.sort((a, b) => a.n - b.n);

  const missing = [...SPINE.keys()].filter((k) => !seen.has(k));
  const strayUnlock = Object.keys(UNLOCKS).filter((k) => {
    const ns = k.slice(0, k.indexOf(':'));
    return (groups || []).some((g) => g.ns === ns)
      && !(groups || []).some((g) => g.ns === ns
        && (g.steps || []).some((s) => prioKey(ns, s) === k));
  });
  if (missing.length || strayUnlock.length) {
    console.warn('[steps] steps.priority.json addresses steps that did not render:',
      [...missing, ...strayUnlock].join(', '));
  }
  return found;
}

/**
 * The "start here" panel, mounted once per page, above everything it
 * describes. Every number in it is derived: the length of the spine,
 * the number of steps on the page, the step numbers and the titles.
 *
 *   before  the node to insert in front of
 *   groups  [{ ns, steps }] — the same shape spinePath() takes
 *
 * Returns the panel, or null when this page has no spine at all
 * (short.html), which is the same rule mountStepsLang() follows: no
 * data for this namespace, no control.
 */
export function mountStepsPath(before, groups) {
  if (!before || document.querySelector('.st-path')) return null;
  const path = spinePath(groups);
  if (!path.length) return null;

  const all = (groups || []).reduce((n, g) => n + (g.steps || []).length, 0);

  const wrap = h('section.st-path', { id: 'start-here', 'aria-label': 'Where to start' });
  wrap.append(
    h('p.st-path-eyebrow', { text: 'START HERE' }),
    h('h2.st-path-title', { text: 'The spine.' }),
    h('p.st-path-deck', {
      text: 'There are ' + all + ' steps below and they are in the order you do them, '
          + 'not the order they matter. These ' + path.length + ' are the shortest path '
          + 'to a blueprint you could put in front of somebody: fill only these and the '
          + 'pitch deck builds, the scene list feeds the breakdown, and the numbers add '
          + 'up. The other ' + (all - path.length) + ' are not optional — they are later.'
    })
  );

  const list = h('ol.st-path-list');
  for (const rung of path) {
    const item = h('li.st-path-item', { 'data-path-step': rung.step.id });
    item.append(...[
      h('span.st-path-tick', { 'data-path-tick': rung.step.id, text: '○', 'aria-hidden': 'true' }),
      h('a.st-path-link', { href: '#' + rung.step.id }, [
        h('span.st-path-num', { text: rung.step.num }),
        h('span.st-path-name', {
          text: (rung.step.titlePlain || String(rung.step.title).replace(/<[^>]+>/g, ''))
            .replace(/\.$/, '')
        })
      ]),
      rung.note ? h('span.st-path-note', { text: rung.note }) : null
    ].filter(Boolean));   // a native append() prints null as "null"
    list.append(item);
  }
  wrap.append(list);

  wrap.append(h('div.st-path-acts', {}, [
    h('button.btn.primary', {
      type: 'button', 'data-action': 'toggleSpineOnly',
      'aria-pressed': 'false',
      text: 'Show only these ' + path.length
    }),
    h('span.st-path-hint', {
      'data-path-hint': '',
      text: 'Nothing is deleted or hidden on disk — this only narrows what is on screen, '
          + 'and every one of the ' + all + ' steps keeps whatever you have written in it.'
    })
  ]));

  before.parentNode.insertBefore(wrap, before);
  return wrap;
}

/** Prose element carrying an optional trailing gloss. */
function prose(tag, html, tanglish, glossCls = 'tn') {
  const el = h(tag, { html });
  const g = gloss(tanglish, glossCls);
  if (g) el.append(g);
  return el;
}

/* An inline style beats every stylesheet — and some of these inline
   styles live in CONTENT, not in code.

   `raw` blocks are markup the extractors could not model, re-inserted
   verbatim from the 2023 pages. A few of them paint text with
   `color:var(--accent)`, which is a FILL: on short.html one heading
   rendered at 4.45:1 that way. It cannot be fixed where it is
   written, because src/data/steps.*.json is REGENERATED by
   `npm run extract` from legacy/, and legacy/ must never be edited.
   A stylesheet cannot reach it either, short of !important.

   So it is normalised on the way in, which survives re-extraction.
   Only the `color` property is touched: a border or a background
   painted with a raw hue is decoration and is left exactly as it is.
   ------------------------------------------------------------ */
const INLINE_HUE_RE = /(^|[;"'{]\s*|\s)color:\s*var\(--(accent|hue|feature|shorts|library|visualize|plan|shoot|ok|warn)\)/g;

function normaliseInlineHue(html) {
  if (typeof html !== 'string') return html;
  return html.replace(INLINE_HUE_RE, (_, lead, token) => `${lead}color:var(--${token}-deep)`);
}

/* ---- block renderers -------------------------------------- */

const BLOCKS = {
  formula: (b) => h('div.formula-box', {}, [
    h('div.label', { text: b.label || 'FORMULA' }),
    prose('div.eq', b.eq, b.tanglish)
  ]),

  craft: (b) => h('div.por-thozil', {}, [
    h('div.label', { text: b.label || 'POR THOZHIL · CRAFT LESSON' }),
    b.trade ? h('div.trade', { text: b.trade }) : null,
    prose('p', b.body, b.tanglish)
  ]),

  why: (b) => h('div.why-this', {}, [
    h('div.label', { text: b.label || 'WHY THIS MATTERS' }),
    prose('p', b.body, b.tanglish)
  ]),

  hint: (b) => prose('div.hint', b.body, b.tanglish),

  examples: (b) => h('div.examples', {}, (b.items || []).map((ex) =>
    h(ex.alt ? 'div.example.alt' : 'div.example', {}, [
      ex.heading ? h('h5', { text: ex.heading }) : null,
      ex.label ? h('div.ex-label', { text: ex.label }) : null,
      prose('p', ex.body, ex.tanglish, 'tanglish')
    ])
  )),

  asks: (b) => {
    // Each ask is its own .ask div in the original, not a wrapper
    // around the group — so return a fragment, not a container.
    const frag = document.createDocumentFragment();
    for (const a of b.items || []) frag.append(renderAsk(a));
    return frag;
  },

  check: (b) => h('div.step-check', {}, [
    h('h4', { text: b.heading || 'BEFORE MOVING ON' }),
    h('ul', {}, (b.items || []).map((it) =>
      h('li', { 'data-key': it.key, html: it.text, role: 'checkbox', tabindex: '0', 'aria-checked': 'false' })
    ))
  ]),

  // Bespoke widgets the extractors could not model. Re-inserted
  // verbatim, which is why nothing was lost in the migration.
  // Each one is a candidate for promotion to a real component.
  raw: (b) => fromHTML(normaliseInlineHue(b.html))
};

function renderAsk(a) {
  const wrap = h('div.ask');
  const id = `f_${a.key}`;

  if (a.label) {
    // Was a <span class="ask-label"> with no association to its
    // input — every field on every page was unlabelled to a
    // screen reader. Same look, now a real <label for>.
    wrap.append(h('label.ask-label', { for: id, html: a.label }));
  }
  if (a.hint) wrap.append(h('div.hint', { html: a.hint }));

  let field;
  if (a.kind === 'select') {
    field = h('select', { id, 'data-key': a.key });
    if (a.placeholder) field.append(h('option', { value: '', text: a.placeholder }));
    for (const o of a.options || []) {
      field.append(typeof o === 'string'
        ? h('option', { text: o })
        : h('option', { value: o.value, text: o.label ?? o.value }));
    }
  } else if (a.kind === 'input') {
    field = h('input', {
      id, type: a.inputType || 'text', 'data-key': a.key,
      placeholder: a.placeholder, readonly: a.readonly
    });
  } else {
    field = h('textarea', {
      id, 'data-key': a.key, placeholder: a.placeholder,
      rows: a.rows, readonly: a.readonly
    });
  }
  if (a.size) field.classList.add(a.size);
  wrap.append(field);

  for (const extra of a.extras || []) wrap.append(fromHTML(extra));
  return wrap;
}

/* ---- step ------------------------------------------------- */

/* `extra` lets a page supply renderers for block types only it knows
   about — the five-beat visualiser, the festival grid — without this
   shared module importing a page's data. Page renderers win over BLOCKS
   so a page can also override a shared one. */
/* ============================================================
   ENGLISH COPY OVERRIDES
   ------------------------------------------------------------
   steps.feature.json and steps.short.json are REGENERATED by
   `npm run extract` from legacy/, so a sentence corrected in them is
   correct until the next extraction and then quietly is not.
   src/data/steps.copy.json carries those corrections where extract
   cannot reach them; see its own notes for why this is preferred to
   teaching the extractor to rewrite prose.

   APPLIED BEFORE RENDER, and that is the whole reason it is a step
   patch rather than a DOM pass. The English text is what paintLang()
   stores in EN and restores when the reader toggles back out of
   Tanglish — so an override written into the DOM afterwards would
   survive exactly until the first toggle, and then the sentence it
   replaced would come back. Patching the step means every consumer
   downstream (the rendered node, the EN map, the export) sees one
   English.

   Returns the step untouched when there is nothing to override, so
   the common path allocates nothing. */
function applyCopy(ns, step) {
  const key = deckKey(ns, step);
  const patch = key && COPY.steps && COPY.steps[key];
  if (!patch) return step;

  const out = { ...step };
  if (patch.deck) out.deck = patch.deck;
  if (patch.why) {
    /* Counted the same way renderStep() counts them below — by the
       index of the why block among the why blocks, not among all
       blocks — so the key in the JSON means what a reader would
       assume it means. */
    let n = 0;
    out.blocks = (step.blocks || []).map((b) => {
      if (b.type !== 'why') return b;
      const alt = patch.why[String(n++)];
      return alt ? { ...b, body: alt } : b;
    });
  }
  return out;
}

export function renderStep(step, extra, ns) {
  step = applyCopy(ns, step);
  const section = h('section.step', { id: step.id });
  if (step.vol === 2) section.classList.add('vol-2');

  /* The spine mark goes in the HEADER, between the title and the
     progress badge, because that is the one line of a step a reader
     always sees — a marker further down is a marker they meet after
     they have already decided to skip. `.is-spine` on the section is
     what the spine-only filter keys off, so the class and the chip
     come from the same lookup and cannot disagree. */
  const rank = spineRank(ns, step);
  if (rank) section.classList.add('is-spine');

  section.append(h('div.step-header', {}, [
    h('div.step-num', { text: step.num }),
    h('div.step-title', { html: step.title }),
    rank
      ? h('span.st-spine-chip', {
        title: rank.note || 'One of the steps that produce a usable blueprint',
        text: 'ESSENTIAL · ' + rank.n + ' of ' + rank.total
      })
      : null,
    step.time ? h('div.step-time', { text: step.time }) : null
  ]));

  /* THE STAGE ROW — the chip, "Do this in…" and a live readout, from
     src/data/steps.stages.json (docs/BLUEPRINT-REALIGN-PLAN.md rev 3
     §3). Directly under the header, before anything a reader skims
     past. `data-part-label` is what the step rail groups by, so the
     rail and the chip read one lookup and cannot disagree. */
  const stage = stageInfo(ns, step.id);
  if (stage) section.setAttribute('data-part-label', partLabel(stage));
  const stageEl = stageRow(ns, step.id);
  if (stageEl) section.append(stageEl);

  /* What reads this step's answers. Shown for every step that feeds
     something, spine or not — "you can do this later" and "nothing
     downstream is waiting on this" are different facts and a reader
     needs both. */
  const feeds = stepUnlocks(ns, step);
  if (rank || feeds) {
    section.append(h('p.st-why', {}, [
      rank ? h('strong.st-why-lead', { text: rank.note }) : null,
      feeds
        ? h('span.st-why-feeds', {}, [
          h('span.st-why-label', { text: 'FEEDS' }),
          h('span', { text: feeds })
        ])
        : null
    ]));
  }

  // The progress badge belongs in the header, beside the step number —
  // that is where the legacy markup put it. Two shapes reach us: the
  // short-film extractor emits an object, the feature one a raw string.
  // Rendering an object through fromHTML() printed "[object Object]".
  if (step.badge) {
    const b = step.badge;
    section.firstChild.append(
      typeof b === 'string'
        ? fromHTML(b)
        : h('span.step-badge', { 'data-step': b.step ?? step.num, text: b.initial ?? 'EMPTY' })
    );
  }

  if (step.deck) {
    const key = deckKey(ns, step);
    const alt = key && SIDECAR.decks[key];
    const el = prose('p.step-deck', step.deck, alt ? null : step.deckTanglish);
    if (alt) {
      // A full translation exists, so the short gloss is dropped in
      // favour of it and the node is marked for in-place swapping.
      EN.set('deck:' + key, step.deck);
      el.setAttribute('data-tl-deck', key);
      if (currentLang() === 'tl') el.innerHTML = alt;
    }
    section.append(el);
  }

  let whyN = 0;
  for (const block of step.blocks || []) {
    const fn = (extra && extra[block.type]) || BLOCKS[block.type];
    if (!fn) {
      // Never silently drop. An unknown type is a data bug, and
      // we want it loud in dev and harmless in production.
      console.warn('[steps] unknown block type:', block.type, block);
      continue;
    }
    const el = fn(block);
    if (block.type === 'why') {
      const key = deckKey(ns, step);
      const idx = whyN++;
      const alt = key && (SIDECAR.why[key] || [])[idx];
      const body = alt && el.querySelector('p');
      if (body) {
        const mark = key + ':' + idx;
        EN.set('why:' + mark, block.body);
        body.setAttribute('data-tl-why', mark);
        if (currentLang() === 'tl') body.innerHTML = alt;
      }
    }
    section.append(el);
  }
  // An empty slot; video-slots.js fills it only if an approved video joins
  // this step (videos.json is never written into the step JSON).
  if (ns && step.id) section.append(videoSlot(stepKey(ns, step.id)));
  return section;
}

/** Render a list of steps into `host`, replacing its contents. */
export function renderSteps(host, steps, extra, ns) {
  const frag = document.createDocumentFragment();
  for (const s of steps) frag.append(renderStep(s, extra, ns));
  host.replaceChildren(frag);
  return host;
}

/* ---- derived views ----------------------------------------
   Everything below used to be a hand-maintained copy of the step
   list. They now derive, so they cannot drift. */

/** Options for the "jump to step" select. */
export function stepIndex(steps) {
  return steps.map((s) => ({
    id: s.id,
    num: s.num,
    vol: s.vol,
    title: s.titlePlain || s.title.replace(/<[^>]+>/g, ''),
    label: `STEP ${s.num} — ${s.titlePlain || ''}`.trim()
  }));
}

/* The key derivation moved to src/lib/step-keys.js when a second,
   non-rendering reader appeared (src/lib/blueprint-context.js, which gathers a
   step's answers as context for a model). It is re-exported from here
   because this is where every page already imports it from, and a
   gratuitous import change is a diff nobody can read. One
   implementation, two importable homes — not two implementations. */
export { stepKeys, stepFieldKeys } from '../lib/step-keys.js';

/* The stage helpers, re-exported for the two pages so they import the
   step machinery from one place. */
export {
  stageInfo, stageRow, partLabel, partsOf, partHeading, idsInPart,
  refreshReadouts, watchReadouts, roman, numberWord, capitalise
} from './step-stages.js';
