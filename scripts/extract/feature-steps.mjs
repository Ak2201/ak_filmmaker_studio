#!/usr/bin/env node
// feature-steps.mjs — deterministic extractor.
//
//   legacy/arunak-filmmaker-blueprint.html  ->  src/data/steps.feature.json
//
// Contract: scripts/extract/SCHEMA.md
//   1. Nothing is lost. Anything unrecognised becomes { type: "raw", html }.
//   2. Order is preserved. `blocks` is one flat array in DOM order.
//   3. data-key values are copied byte-for-byte — they are the storage
//      contract with every user's existing saved work.
//
// Run: node scripts/extract/feature-steps.mjs

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const SOURCE = resolve(ROOT, 'legacy', 'arunak-filmmaker-blueprint.html');
const OUTPUT = resolve(ROOT, 'src', 'data', 'steps.feature.json');

// ---------------------------------------------------------------- utilities

/** Collapse every run of whitespace (nbsp included) to one space, then trim. */
const norm = (s) => String(s ?? '').replace(/[\s ]+/g, ' ').trim();

/** A detached clone, so we never mutate the parsed original document. */
const clone = (el) => el.cloneNode(true);

const TANGLISH_SEL = '.tn, .tanglish';

/**
 * Inner HTML of `el` with the Tanglish spans lifted out.
 * Returns { html, tanglish } — `tanglish` is undefined when there is none.
 * Inline markup (<em>, <strong>, <code>, <br>) is kept on both sides.
 */
function splitTanglish(el) {
  if (!el) return { html: '' };
  const copy = clone(el);
  const spans = [...copy.querySelectorAll(TANGLISH_SEL)];
  const parts = [];
  for (const span of spans) {
    parts.push(norm(span.innerHTML));
    span.remove();
  }
  const out = { html: norm(copy.innerHTML) };
  const tanglish = norm(parts.join(' '));
  if (tanglish) out.tanglish = tanglish;
  return out;
}

/** Plain visible text of an element with Tanglish removed. */
function plainNoTanglish(el) {
  if (!el) return '';
  const copy = clone(el);
  for (const span of [...copy.querySelectorAll(TANGLISH_SEL)]) span.remove();
  return norm(copy.textContent);
}

const hasClass = (el, name) => el.nodeType === 1 && el.classList.contains(name);

/** Every element child that is neither the ask label nor the ask's own control. */
function askExtras(ask, control) {
  return [...ask.children].filter(
    (child) => child !== control && !hasClass(child, 'ask-label')
  );
}

// ------------------------------------------------------------ block parsers

function formulaBlock(el) {
  const { html, tanglish } = splitTanglish(el.querySelector('.eq'));
  const block = {
    type: 'formula',
    label: norm(el.querySelector('.label')?.textContent),
    eq: html,
  };
  if (tanglish) block.tanglish = tanglish;
  return block;
}

function craftBlock(el) {
  const { html, tanglish } = splitTanglish(el.querySelector('p'));
  const block = {
    type: 'craft',
    label: norm(el.querySelector('.label')?.textContent),
    trade: norm(el.querySelector('.trade')?.textContent),
    body: html,
  };
  if (tanglish) block.tanglish = tanglish;
  return block;
}

function whyBlock(el) {
  const { html, tanglish } = splitTanglish(el.querySelector('p'));
  const block = {
    type: 'why',
    label: norm(el.querySelector('.label')?.textContent),
    body: html,
  };
  if (tanglish) block.tanglish = tanglish;
  return block;
}

/**
 * `.examples` -> { type: "examples", items: [...] }.
 * If the container ever holds something other than `.example` children we
 * refuse to guess and keep the whole container raw, so nothing is lost.
 */
function examplesBlock(el) {
  const children = [...el.children];
  if (!children.length || !children.every((c) => hasClass(c, 'example'))) {
    return rawBlock(el);
  }
  const items = children.map((ex) => {
    const { html, tanglish } = splitTanglish(ex.querySelector('p'));
    const item = {
      label: norm(ex.querySelector('.ex-label')?.textContent),
      body: html,
    };
    if (tanglish) item.tanglish = tanglish;
    if (ex.classList.contains('alt')) item.alt = true;
    return item;
  });
  return { type: 'examples', items };
}

function hintBlock(el) {
  const { html, tanglish } = splitTanglish(el);
  const block = { type: 'hint', body: html };
  if (tanglish) block.tanglish = tanglish;
  return block;
}

function checkBlock(el) {
  const items = [...el.querySelectorAll('li')].map((li) => ({
    // data-key VERBATIM — never normalised, renumbered or renamed.
    key: li.getAttribute('data-key'),
    text: splitTanglish(li).html,
  }));
  const block = {
    type: 'check',
    heading: norm(el.querySelector('h4')?.textContent),
    items,
  };
  const tanglish = [...el.querySelectorAll(TANGLISH_SEL)]
    .map((s) => norm(s.innerHTML))
    .filter(Boolean)
    .join(' ');
  if (tanglish) block.tanglish = tanglish;
  return block;
}

/** One `.ask` -> one item of an `asks` block. */
function askItem(ask, control) {
  const tag = control.tagName.toLowerCase();
  const kind = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'input';

  const item = {
    // data-key VERBATIM.
    key: control.getAttribute('data-key'),
    label: norm(ask.querySelector('.ask-label')?.textContent),
  };

  let placeholder = control.getAttribute('placeholder');

  if (kind === 'select') {
    const options = [];
    for (const opt of control.querySelectorAll('option')) {
      const text = norm(opt.textContent);
      // `<option value="">` is the unselected prompt, not a real choice:
      // keeping it in `options` would make it selectable and would rewrite
      // its stored value from "" to its own label.
      if (!placeholder && opt.getAttribute('value') === '') placeholder = text;
      else options.push(text);
    }
    item.kind = kind;
    item.size = control.classList.contains('lg') ? 'lg' : null;
    if (placeholder != null) item.placeholder = placeholder;
    item.options = options;
    return item;
  }

  if (placeholder != null) item.placeholder = placeholder;
  item.kind = kind;
  item.size = control.classList.contains('lg') ? 'lg' : null;
  return item;
}

function rawBlock(el) {
  return { type: 'raw', html: el.outerHTML };
}

// --------------------------------------------------------------- step parser

function parseStep(section, vol) {
  const header = section.querySelector('.step-header');
  const num = norm(header?.querySelector('.step-num')?.textContent);
  const titleEl = header?.querySelector('.step-title');
  const timeEl = header?.querySelector('.step-time');

  const step = {
    // studio-ui.js derives the anchor at runtime as 'step-' + padded number;
    // we bake the same id in so existing #step-NN links keep working.
    id: 'step-' + String(parseInt(num, 10)).padStart(2, '0'),
    vol,
    num,
    title: norm(titleEl?.innerHTML),
    titlePlain: norm(titleEl?.textContent),
    time: norm(timeEl?.textContent),
    deck: '',
    blocks: [],
  };

  const blocks = step.blocks;
  let pendingAsks = [];

  const flushAsks = () => {
    if (pendingAsks.length) {
      blocks.push({ type: 'asks', items: pendingAsks });
      pendingAsks = [];
    }
  };

  let deckSeen = false;

  for (const el of section.children) {
    if (el === header) continue;

    if (!deckSeen && hasClass(el, 'step-deck')) {
      const { html, tanglish } = splitTanglish(el);
      step.deck = html;
      if (tanglish) step.deckTanglish = tanglish;
      deckSeen = true;
      continue;
    }

    if (hasClass(el, 'ask')) {
      const control = el.querySelector('textarea, input, select');
      if (!control || !control.getAttribute('data-key')) {
        // Not an ask we understand — keep it whole rather than guess.
        flushAsks();
        blocks.push(rawBlock(el));
        continue;
      }
      pendingAsks.push(askItem(el, control));

      // An `.ask` that also wraps a bespoke widget (Step 15's palette picker):
      // close the run here and emit the widget raw, so DOM order survives and
      // the widget's own data-keys are preserved byte-for-byte inside `html`.
      const extras = askExtras(el, control);
      if (extras.length) {
        flushAsks();
        for (const extra of extras) blocks.push(rawBlock(extra));
      }
      continue;
    }

    flushAsks();

    if (hasClass(el, 'formula-box')) blocks.push(formulaBlock(el));
    else if (hasClass(el, 'por-thozil')) blocks.push(craftBlock(el));
    else if (hasClass(el, 'why-this')) blocks.push(whyBlock(el));
    else if (hasClass(el, 'examples')) blocks.push(examplesBlock(el));
    else if (hasClass(el, 'hint')) blocks.push(hintBlock(el));
    else if (hasClass(el, 'step-check')) blocks.push(checkBlock(el));
    else blocks.push(rawBlock(el));
  }

  flushAsks();
  return step;
}

// ------------------------------------------------------------------- extract

const html = readFileSync(SOURCE, 'utf8');
const { document } = parseHTML(html);

const sections = [...document.querySelectorAll('section.step')];
const data = { vol1: [], vol2: [] };

for (const section of sections) {
  const vol = section.classList.contains('vol-2') ? 2 : 1;
  (vol === 2 ? data.vol2 : data.vol1).push(parseStep(section, vol));
}

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, JSON.stringify(data, null, 2) + '\n', 'utf8');

// ---------------------------------------------------------------- self-check
// Re-read what we wrote and compare normalised visible text (all HTML tags
// stripped, whitespace collapsed) against the same region of the original.

const written = JSON.parse(readFileSync(OUTPUT, 'utf8'));
const steps = [...written.vol1, ...written.vol2];

// A throwaway document used purely to turn HTML strings back into plain text
// (this also decodes entities the same way the browser would).
const { document: sandbox } = parseHTML('<!doctype html><body><div id="box"></div>');
const box = sandbox.getElementById('box');

// Tags become a space, not nothing: two adjacent elements ("…[specific
// world]" followed by its Tanglish span) must not fuse into one word on one
// side of the comparison and stay two words on the other. Entities are then
// decoded by round-tripping through the sandbox, so both sides read as text.
const stripTags = (s) => {
  box.innerHTML = String(s).replace(/<[^>]*>/g, ' ');
  return box.textContent;
};

/** Every string value in the JSON tree, in document order. */
function collectStrings(node, out = []) {
  if (typeof node === 'string') out.push(node);
  else if (Array.isArray(node)) for (const v of node) collectStrings(v, out);
  else if (node && typeof node === 'object') for (const v of Object.values(node)) collectStrings(v, out);
  return out;
}

const words = (s) => norm(s).split(' ').filter(Boolean);

/**
 * Greedy in-order match of `want` against `have`. Returns the number matched
 * and the runs of consecutive words that could not be found.
 */
function matchWords(want, have) {
  const missingRuns = [];
  let j = 0;
  let matched = 0;
  let run = [];
  for (const w of want) {
    let k = j;
    while (k < have.length && have[k] !== w) k++;
    if (k < have.length) {
      matched++;
      j = k + 1;
      if (run.length) { missingRuns.push(run.join(' ')); run = []; }
    } else {
      run.push(w);
    }
  }
  if (run.length) missingRuns.push(run.join(' '));
  return { matched, missingRuns };
}

// Compare step by step, never document-wide: a word must be found inside the
// SAME step's JSON, so text that merely reappears somewhere else in the
// document can never paper over a real drop.
let totalWords = 0;
let totalMatched = 0;
const missingRuns = [];
for (let i = 0; i < sections.length; i++) {
  const want = words(stripTags(sections[i].outerHTML));
  const have = words(collectStrings(steps[i]).map(stripTags).join(' \n '));
  const { matched, missingRuns: gaps } = matchWords(want, have);
  totalWords += want.length;
  totalMatched += matched;
  for (const g of gaps) missingRuns.push(`step ${steps[i].num}: ${g}`);
}

const coverage = totalWords ? (totalMatched / totalWords) * 100 : 100;

// ------ structural counts, measured against the original document ----------

const count = (sel) => sections.reduce((n, s) => n + s.querySelectorAll(sel).length, 0);

const askItemsOut = steps.reduce(
  (n, s) => n + s.blocks.filter((b) => b.type === 'asks').reduce((m, b) => m + b.items.length, 0), 0);
const asksExpected = count('.ask');
const checksOut = steps.reduce((n, s) => n + s.blocks.filter((b) => b.type === 'check').length, 0);
const checksExpected = count('.step-check');
const rawOut = steps.reduce((n, s) => n + s.blocks.filter((b) => b.type === 'raw').length, 0);

// data-key survival: every key in the original's step sections must appear in
// the JSON, either as a structured `key` or verbatim inside a raw html string.
const originalKeys = sections.flatMap((s) =>
  [...s.querySelectorAll('[data-key]')].map((el) => el.getAttribute('data-key')));
const jsonBlob = JSON.stringify(written);
const structuredKeys = new Set();
for (const step of steps) {
  for (const b of step.blocks) {
    if (b.type === 'asks' || b.type === 'check') for (const it of b.items) structuredKeys.add(it.key);
  }
}
const lostKeys = originalKeys.filter(
  (k) => !structuredKeys.has(k) && !jsonBlob.includes(`data-key=\\"${k}\\"`));

const rawClasses = new Map();
for (const step of steps) {
  for (const b of step.blocks) {
    if (b.type !== 'raw') continue;
    box.innerHTML = b.html;
    const cls = box.firstElementChild?.getAttribute('class') || `<${box.firstElementChild?.tagName.toLowerCase()}>`;
    rawClasses.set(cls, (rawClasses.get(cls) || 0) + 1);
  }
}

const missText = missingRuns.join(' / ');
console.log(
  `steps: ${steps.length}/${sections.length}   ` +
  `asks: ${askItemsOut}/${asksExpected}   ` +
  `checks: ${checksOut}/${checksExpected}   ` +
  `raw blocks: ${rawOut}`
);
console.log(
  `text coverage: ${coverage.toFixed(1)}%` +
  (missText ? `  (missing: "${missText.slice(0, 120)}")` : '  (missing: none)')
);
console.log(
  `data-keys: ${originalKeys.length - lostKeys.length}/${originalKeys.length} preserved` +
  (lostKeys.length ? `  (lost: ${lostKeys.slice(0, 5).join(', ')})` : '')
);
console.log(
  'raw block classes: ' +
  [...rawClasses.entries()].sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ×${n}`).join(', ')
);
console.log(`wrote ${OUTPUT}  (vol1: ${written.vol1.length}, vol2: ${written.vol2.length})`);

if (coverage < 99 || lostKeys.length) process.exitCode = 1;
