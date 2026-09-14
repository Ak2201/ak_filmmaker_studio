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

import { h, fromHTML } from '../lib/dom.js';

/* ---- gloss ------------------------------------------------
   Tanglish was extracted out of its parent prose. Put it back
   as the trailing span the stylesheet expects. `cls` differs by
   block type in the original ('tn' inside formula/craft/why,
   'tanglish' inside examples) and the CSS distinguishes them,
   so the caller passes the right one rather than us guessing. */
function gloss(text, cls = 'tn') {
  return text ? h(`span.${cls}`, { html: text }) : null;
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
export function renderStep(step, extra) {
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

  if (step.deck) section.append(prose('p.step-deck', step.deck, step.deckTanglish));

  for (const block of step.blocks || []) {
    const fn = (extra && extra[block.type]) || BLOCKS[block.type];
    if (!fn) {
      // Never silently drop. An unknown type is a data bug, and
      // we want it loud in dev and harmless in production.
      console.warn('[steps] unknown block type:', block.type, block);
      continue;
    }
    section.append(fn(block));
  }
  return section;
}

/** Render a list of steps into `host`, replacing its contents. */
export function renderSteps(host, steps, extra) {
  const frag = document.createDocumentFragment();
  for (const s of steps) frag.append(renderStep(s, extra));
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
