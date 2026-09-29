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

import { h, fromHTML, delegate } from '../lib/dom.js';
import SIDECAR from '../data/steps.tanglish.json';
import { currentLang, onLangChange, langToggle, setLang } from '../lib/lang.js';

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

/** Prose element carrying an optional trailing gloss. */
function prose(tag, html, tanglish, glossCls = 'tn') {
  const el = h(tag, { html });
  const g = gloss(tanglish, glossCls);
  if (g) el.append(g);
  return el;
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
  raw: (b) => fromHTML(b.html)
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
export function renderStep(step, extra, ns) {
  const section = h('section.step', { id: step.id });
  if (step.vol === 2) section.classList.add('vol-2');

  section.append(h('div.step-header', {}, [
    h('div.step-num', { text: step.num }),
    h('div.step-title', { html: step.title }),
    step.time ? h('div.step-time', { text: step.time }) : null
  ]));

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
    label: `${s.vol ? `VOL ${s.vol === 2 ? 'II' : 'I'} · ` : ''}STEP ${s.num} — ${s.titlePlain || ''}`.trim()
  }));
}

/** Every data-key a step owns, in order — used by export and progress. */
export function stepKeys(step) {
  const keys = [];
  for (const b of step.blocks || []) {
    if (b.type === 'asks') keys.push(...(b.items || []).map((a) => a.key));
    else if (b.type === 'check') keys.push(...(b.items || []).map((i) => i.key));
    else if (b.type === 'raw') {
      for (const m of String(b.html).matchAll(/data-key="([^"]+)"/g)) keys.push(m[1]);
    }
  }
  return keys;
}

/** Field keys only (excludes checklist booleans) — for progress and export. */
export function stepFieldKeys(step) {
  return stepKeys(step).filter((k) => !k.startsWith('ck_'));
}
