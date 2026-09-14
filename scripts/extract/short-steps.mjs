#!/usr/bin/env node
/**
 * short-steps.mjs — deterministic extractor for the Short Film Blueprint.
 *
 * Reads   legacy/arunak-shortfilm-blueprint.html   (never modified)
 * Writes  src/data/steps.short.json   { steps: [...11], beats: [...5] }
 *         src/data/festivals.json     { asOf: "2024", festivals: [...18] }
 *
 * Contract: scripts/extract/SCHEMA.md
 *   1. Nothing is lost — unrecognised elements become { type:"raw", html }.
 *   2. Order is preserved — `blocks` is one flat array in DOM order.
 *   3. data-key values are copied byte-for-byte.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const SRC = path.join(ROOT, 'legacy', 'arunak-shortfilm-blueprint.html');
const OUT_DIR = path.join(ROOT, 'src', 'data');
const OUT_STEPS = path.join(OUT_DIR, 'steps.short.json');
const OUT_FESTS = path.join(OUT_DIR, 'festivals.json');

const html = fs.readFileSync(SRC, 'utf8');
const { document } = parseHTML(html);

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Strip every tag from an HTML string, decoding entities the same way the source
 * document does, and treat every tag boundary as whitespace.
 *
 * The boundary rule matters: the original markup writes whole cards on one line
 * (`</div><h4>Cannes…`), so a naive textContent glues "OSCAR-QUALIFYING" to
 * "Cannes". Both sides of the self-check go through this one function, so the
 * comparison is apples to apples.
 */
const scratch = document.createElement('div');
function stripTags(htmlStr) {
  scratch.innerHTML = String(htmlStr ?? '').replace(/<[^>]*>/g, (m) => ` ${m} `);
  const t = scratch.textContent;
  scratch.innerHTML = '';
  return norm(t);
}

const TANGLISH_SEL = '.tn, .tanglish';

/**
 * Split an element into { html, tanglish }: the element's innerHTML with every
 * Tanglish span removed, plus the lifted Tanglish text. Never mutates the source
 * document — works on a clone.
 */
function liftTanglish(el) {
  const clone = el.cloneNode(true);
  const tn = [...clone.querySelectorAll(TANGLISH_SEL)];
  const tanglish = tn.map((n) => norm(n.textContent)).filter(Boolean).join(' ');
  tn.forEach((n) => n.remove());
  return { html: norm(clone.innerHTML), tanglish };
}

/** Paragraph bodies of a box (.formula / .why-box), Tanglish removed & lifted. */
function proseOf(el, skipSel = '.lab') {
  const clone = el.cloneNode(true);
  const tn = [...clone.querySelectorAll(TANGLISH_SEL)];
  const tanglish = tn.map((n) => norm(n.textContent)).filter(Boolean).join(' ');
  tn.forEach((n) => n.remove());
  if (skipSel) clone.querySelectorAll(skipSel).forEach((n) => n.remove());
  const paras = [...clone.children]
    .map((c) => norm(c.innerHTML))
    .filter(Boolean);
  // Elements that are not wrapped in a child tag (bare text) still count.
  const body = paras.length ? paras.join('<br><br>') : norm(clone.innerHTML);
  return { body, tanglish, paraCount: paras.length };
}

const setIf = (obj, key, val) => {
  if (val !== undefined && val !== null && val !== '') obj[key] = val;
  return obj;
};

const elementChildren = (el) => [...el.children];

const hasClass = (el, c) => el.classList && el.classList.contains(c);

/* ------------------------------------------------------------------ *
 * ask / control parsing
 * ------------------------------------------------------------------ */

const CONTROL_SEL = 'textarea, input, select';
const SIZE_CLASSES = new Set(['lg', 'sm', 'md', 'xl']);

function parseControl(ctrl) {
  const tag = ctrl.tagName.toLowerCase();
  const item = {};
  // data-key is the storage contract: verbatim, never normalised.
  const key = ctrl.getAttribute('data-key');
  if (key !== null) item.key = key;
  item.kind = tag === 'textarea' ? 'textarea' : tag === 'select' ? 'select' : 'input';
  if (tag === 'input') {
    const t = ctrl.getAttribute('type');
    if (t && t !== 'text') item.inputType = t;
  }
  const ph = ctrl.getAttribute('placeholder');
  if (ph !== null) item.placeholder = ph;
  const rows = ctrl.getAttribute('rows');
  if (rows !== null) item.rows = Number(rows);
  const cls = [...(ctrl.classList || [])];
  const size = cls.find((c) => SIZE_CLASSES.has(c)) || null;
  item.size = size;
  const otherCls = cls.filter((c) => !SIZE_CLASSES.has(c));
  if (otherCls.length) item.classes = otherCls;
  if (tag === 'select') {
    item.options = [...ctrl.querySelectorAll('option')].map((o) => ({
      value: o.getAttribute('value') ?? '',
      text: norm(o.textContent),
    }));
  }
  if (ctrl.hasAttribute('readonly')) item.readonly = true;
  if (ctrl.id) item.id = ctrl.id;
  return item;
}

const stats = {
  steps: 0,
  asks: 0,
  askBlocks: 0,
  checks: 0,
  checkItems: 0,
  formulas: 0,
  whys: 0,
  examples: 0,
  exampleItems: 0,
  raw: 0,
  dataKeys: [],
};
const rawClassTally = new Map();
const warnings = [];

function parseAsk(askEl) {
  const item = {};
  const consumed = new Set();

  const labelEl = askEl.querySelector(':scope > .ask-label');
  if (labelEl) {
    consumed.add(labelEl);
    const { html: h, tanglish } = liftTanglish(labelEl);
    item.label = h;
    setIf(item, 'labelTanglish', tanglish);
  }
  const hintEl = askEl.querySelector(':scope > .ask-hint');
  if (hintEl) {
    consumed.add(hintEl);
    const { html: h, tanglish } = liftTanglish(hintEl);
    item.hint = h;
    setIf(item, 'hintTanglish', tanglish);
  }

  const ctrl = askEl.querySelector(`:scope > ${CONTROL_SEL}`);
  if (ctrl) {
    consumed.add(ctrl);
    Object.assign(item, parseControl(ctrl));
  } else {
    item.size = null;
    warnings.push(`ask with no control: ${norm(askEl.textContent).slice(0, 60)}`);
  }

  // Anything else inside the .ask (bespoke widgets, counters) is kept verbatim.
  const extras = elementChildren(askEl)
    .filter((c) => !consumed.has(c))
    .map((c) => c.outerHTML);
  if (extras.length) item.extras = extras;

  const style = askEl.getAttribute('style');
  if (style) item.style = style;

  if (!('size' in item)) item.size = null;
  return item;
}

/* ------------------------------------------------------------------ *
 * block classification
 * ------------------------------------------------------------------ */

function rawBlock(el) {
  stats.raw += 1;
  const name =
    (el.getAttribute && el.getAttribute('class')) ||
    `<${el.tagName.toLowerCase()}>`;
  rawClassTally.set(name, (rawClassTally.get(name) || 0) + 1);
  return { type: 'raw', html: el.outerHTML };
}

function classifyBlock(el) {
  if (hasClass(el, 'formula')) {
    stats.formulas += 1;
    const lab = el.querySelector(':scope > .lab');
    const { body, tanglish } = proseOf(el, ':scope > .lab');
    const b = { type: 'formula', label: lab ? norm(lab.textContent) : null, eq: body };
    setIf(b, 'tanglish', tanglish);
    return b;
  }
  if (hasClass(el, 'why-box')) {
    stats.whys += 1;
    const lab = el.querySelector(':scope > .lab');
    const { body, tanglish } = proseOf(el, ':scope > .lab');
    const b = { type: 'why', label: lab ? norm(lab.textContent) : null, body };
    setIf(b, 'tanglish', tanglish);
    return b;
  }
  if (hasClass(el, 'craft')) {
    const lab = el.querySelector(':scope > .lab');
    const trade = el.querySelector(':scope > h5, :scope > h4');
    const { body, tanglish } = proseOf(el, ':scope > .lab, :scope > h5, :scope > h4');
    const b = {
      type: 'craft',
      label: lab ? norm(lab.textContent) : null,
      trade: trade ? norm(trade.textContent) : null,
      body,
    };
    setIf(b, 'tanglish', tanglish);
    return b;
  }
  if (hasClass(el, 'examples')) {
    stats.examples += 1;
    const items = [];
    for (const card of elementChildren(el)) {
      if (!hasClass(card, 'ex-card')) {
        warnings.push(`.examples child that is not .ex-card: ${card.outerHTML.slice(0, 80)}`);
        items.push({ raw: card.outerHTML });
        continue;
      }
      stats.exampleItems += 1;
      const meta = card.querySelector(':scope > .meta');
      const head = card.querySelector(':scope > h5, :scope > h4');
      const { body, tanglish } = proseOf(card, ':scope > .meta, :scope > h5, :scope > h4');
      const it = {};
      setIf(it, 'label', meta ? norm(meta.textContent) : null);
      if (head) it.heading = norm(head.innerHTML);
      it.body = body;
      setIf(it, 'tanglish', tanglish);
      if (hasClass(card, 'alt')) it.alt = true;
      items.push(it);
    }
    return { type: 'examples', items };
  }
  if (hasClass(el, 'hint')) {
    const { body, tanglish } = proseOf(el, null);
    const b = { type: 'hint', body };
    setIf(b, 'tanglish', tanglish);
    return b;
  }
  if (hasClass(el, 'step-check')) {
    stats.checks += 1;
    const h = el.querySelector(':scope > h4, :scope > h3, :scope > h5');
    const items = [];
    for (const li of el.querySelectorAll(':scope > ul > li')) {
      stats.checkItems += 1;
      const key = li.getAttribute('data-key'); // verbatim
      const { html: h2, tanglish } = liftTanglish(li);
      const it = {};
      if (key !== null) it.key = key;
      else warnings.push(`check item without data-key: ${norm(li.textContent).slice(0, 60)}`);
      it.text = h2;
      setIf(it, 'tanglish', tanglish);
      items.push(it);
    }
    // anything in the .step-check that is not the heading or the <ul>
    const extras = elementChildren(el)
      .filter((c) => c !== h && c.tagName.toLowerCase() !== 'ul')
      .map((c) => c.outerHTML);
    const b = { type: 'check', heading: h ? norm(h.textContent) : null, items };
    if (extras.length) b.extras = extras;
    return b;
  }
  return rawBlock(el);
}

/* ------------------------------------------------------------------ *
 * step parsing
 * ------------------------------------------------------------------ */

function parseStep(section) {
  stats.steps += 1;
  const step = { id: section.id || null };

  const header = section.querySelector(':scope > .step-header');
  const deckEl = section.querySelector(':scope > .step-deck');

  if (header) {
    const numEl = header.querySelector(':scope > .step-num');
    const titleEl = header.querySelector(':scope > .step-title');
    const timeEl = header.querySelector(':scope > .step-time');
    const badgeEl = header.querySelector(':scope > .step-badge');

    step.num = numEl ? norm(numEl.textContent) : null;
    if (titleEl) {
      const { html: h, tanglish } = liftTanglish(titleEl);
      step.title = h;
      step.titlePlain = norm(titleEl.textContent);
      setIf(step, 'titleTanglish', tanglish);
    }
    step.time = timeEl ? norm(timeEl.textContent) : null;
    if (badgeEl) {
      step.badge = {
        step: badgeEl.getAttribute('data-step'),
        initial: norm(badgeEl.textContent),
      };
    }
    const known = new Set([numEl, titleEl, timeEl, badgeEl].filter(Boolean));
    const extras = elementChildren(header).filter((c) => !known.has(c));
    if (extras.length) step.headerExtras = extras.map((c) => c.outerHTML);
  }

  if (deckEl) {
    const { html: h, tanglish } = liftTanglish(deckEl);
    step.deck = h;
    setIf(step, 'deckTanglish', tanglish);
  }

  const blocks = [];
  const kids = elementChildren(section);
  for (let i = 0; i < kids.length; i += 1) {
    const el = kids[i];
    if (el === header || el === deckEl) continue;

    if (hasClass(el, 'ask')) {
      // Collapse the whole run of consecutive .ask siblings into one block.
      const items = [];
      let j = i;
      while (j < kids.length && hasClass(kids[j], 'ask')) {
        items.push(parseAsk(kids[j]));
        stats.asks += 1;
        j += 1;
      }
      i = j - 1;
      stats.askBlocks += 1;
      blocks.push({ type: 'asks', items });
      continue;
    }
    blocks.push(classifyBlock(el));
  }

  step.blocks = blocks;
  return step;
}

const stepSections = [...document.querySelectorAll('section.step')];
const steps = stepSections.map(parseStep);

/* collect every data-key we emitted as a first-class field, plus every one
   that survives inside a raw block, so we can prove none were lost. */
const emittedKeys = new Set();
(function walk(v) {
  if (Array.isArray(v)) return v.forEach(walk);
  if (v && typeof v === 'object') {
    if (typeof v.key === 'string') emittedKeys.add(v.key);
    return Object.values(v).forEach(walk);
  }
  if (typeof v === 'string' && v.includes('data-key=')) {
    for (const m of v.matchAll(/data-key="([^"]*)"/g)) emittedKeys.add(m[1]);
  }
})(steps);

/* ------------------------------------------------------------------ *
 * beats — step 04
 * ------------------------------------------------------------------ */

function extractBeats() {
  const step4 = document.querySelector('#step-04');
  if (!step4) return [];

  const grid = step4.querySelector('.beat-grid');
  const viz = step4.querySelector('.beat-viz svg');
  const formula = step4.querySelector('.formula');

  // The FORMULA · 5 BEATS paragraph: one <br>-separated line per beat.
  const formulaLines = new Map();
  if (formula) {
    const p = [...formula.querySelectorAll(':scope > p')].find(
      (n) => !n.classList.contains('tn') && !n.classList.contains('tanglish'),
    );
    if (p) {
      for (const chunk of p.innerHTML.split(/<br\s*\/?>/i)) {
        const text = stripTags(chunk);
        const m = text.match(/^(\d+)\.\s*(.*)$/);
        if (m) formulaLines.set(Number(m[1]), m[2]);
      }
    }
  }

  // SVG: dots + labels, in document order. x is on a 0..800 viewBox.
  const vb = viz ? (viz.getAttribute('viewBox') || '0 0 800 200').split(/\s+/).map(Number) : null;
  const vizWidth = vb ? vb[2] : null;
  const dots = viz ? [...viz.querySelectorAll('circle.beat-dot')] : [];
  const labels = viz ? [...viz.querySelectorAll('text.beat-label')] : [];

  const cells = grid ? [...grid.querySelectorAll(':scope > .beat-cell')] : [];

  return cells.map((cell, idx) => {
    const posEl = cell.querySelector(':scope > .pos');
    const nameEl = cell.querySelector(':scope > h4, :scope > h5');
    const ctrl = cell.querySelector(CONTROL_SEL);

    const positionLabel = posEl ? norm(posEl.textContent) : null;
    // "BEAT 1 · ≤15%" → percentage "≤15%"
    const pct = positionLabel ? positionLabel.split('·').slice(1).join('·').trim() : null;

    const beat = {};
    const key = ctrl ? ctrl.getAttribute('data-key') : null; // verbatim
    beat.id = key || `beat-${idx + 1}`;
    if (key) beat.key = key;
    beat.num = idx + 1;
    beat.name = nameEl ? norm(nameEl.textContent) : null;
    setIf(beat, 'positionLabel', positionLabel);
    setIf(beat, 'percentage', pct);
    if (ctrl) {
      const ph = ctrl.getAttribute('placeholder');
      if (ph !== null) beat.description = ph;
    }
    const fl = formulaLines.get(idx + 1);
    if (fl) {
      beat.formulaLine = fl;
      const dash = fl.split(/\s+—\s+/);
      if (dash.length > 1) beat.summary = dash.slice(1).join(' — ').trim();
    }

    const dot = dots[idx];
    const lab = labels[idx];
    if (dot || lab) {
      const svg = {};
      if (lab) svg.label = norm(lab.textContent);
      if (dot) {
        svg.dotX = Number(dot.getAttribute('cx'));
        svg.dotY = Number(dot.getAttribute('cy'));
        if (vizWidth) svg.xPercent = Math.round((svg.dotX / vizWidth) * 1000) / 10;
      }
      if (lab) {
        svg.labelX = Number(lab.getAttribute('x'));
        svg.labelY = Number(lab.getAttribute('y'));
      }
      beat.svg = svg;
    }
    return beat;
  });
}

const beats = extractBeats();

/* ------------------------------------------------------------------ *
 * festivals — step 10
 * ------------------------------------------------------------------ */

/** Countries the page does not state. Stable geographic facts, never dates. */
const VENUE_COUNTRY = {
  'Cannes Court Métrage': 'France',
  'Sundance Shorts': 'USA',
  'Berlinale Shorts': 'Germany',
  'TIFF · Toronto': 'Canada',
  'SXSW Shorts': 'USA',
  'Locarno Pardi di domani': 'Switzerland',
  'Fantasia (Montreal)': 'Canada',
  'Vimeo Staff Picks': null,
  'Short of the Week': null,
};
const COUNTRY_WORDS = [
  ['France', 'France'],
  ['Spain', 'Spain'],
  ['Germany', 'Germany'],
  ['Canada', 'Canada'],
  ['Switzerland', 'Switzerland'],
];

function extractFestivals() {
  const step10 = document.querySelector('#step-10');
  if (!step10) return { festivals: [], sourceNote: null, feeByTier: {}, tierPremiereRule: {} };

  // Per-tier fee ranges as the page itself states them (submission-budget hint).
  const feeByTier = {};
  for (const hint of step10.querySelectorAll('.ask-hint')) {
    const t = norm(hint.textContent);
    if (!/Tier[- ]?1/i.test(t) || !/\$/.test(t)) continue;
    const m1 = t.match(/Tier[- ]?1[^$]*(\$[\d]+[–—-]\$[\d]+)/i);
    const m2 = t.match(/Tier[- ]?2[^$]*(\$[\d]+[–—-]\$[\d]+)/i);
    const m3 = t.match(/Tier[- ]?3[^$]*(\$[\d]+[–—-]\$[\d]+)/i);
    if (m1) feeByTier[1] = m1[1];
    if (m2) feeByTier[2] = m2[1];
    if (m3) feeByTier[3] = m3[1];
  }

  // Tier-1 premiere rule, taken from the page's own FORMULA paragraph.
  const tierPremiereRule = {};
  const fFormula = [...step10.querySelectorAll('.formula p')].map((p) => norm(p.textContent));
  for (const para of fFormula) {
    const sent = para.split(/(?<=\.)\s+/).find((s) => /premiere/i.test(s) && /first-screening|cannot have premiered/i.test(s));
    if (sent && !tierPremiereRule[1]) tierPremiereRule[1] = sent.trim();
  }

  const noteEl = [...step10.querySelectorAll(':scope > p')].find((p) =>
    /Deadlines and rules change/i.test(p.textContent),
  );
  const sourceNote = noteEl ? norm(noteEl.textContent) : null;

  const cards = [...step10.querySelectorAll('.fest-grid > .fest-card')];
  const festivals = cards.map((card) => {
    const cls = [...card.classList];
    const tierCls = cls.find((c) => /^t[123]$/.test(c));
    const tier = tierCls ? Number(tierCls.slice(1)) : null;

    const tierEl = card.querySelector(':scope > .tier');
    const tierLabel = tierEl ? norm(tierEl.textContent) : null;
    const tierNote = tierLabel
      ? tierLabel.split('·').slice(1).join('·').trim() || null
      : null;

    const nameEl = card.querySelector(':scope > h4, :scope > h5');
    const name = nameEl ? norm(nameEl.textContent) : null;

    const reqEl = card.querySelector(':scope > p.req');
    const req = reqEl ? norm(reqEl.textContent) : null;

    const descParas = [...card.querySelectorAll(':scope > p')]
      .filter((p) => p !== reqEl)
      .map((p) => norm(p.innerHTML))
      .filter(Boolean);
    const description = descParas.join('<br><br>') || null;
    const descText = stripTags(description || '');

    // --- parse the `.req` line, segment by segment ---
    let deadlineApprox = null;
    let format = null;
    let maxLength = null;
    let submitVia = null;
    const reqSegments = req ? req.split('·').map((s) => s.trim()).filter(Boolean) : [];
    for (const seg of reqSegments) {
      let m;
      if ((m = seg.match(/^Deadline:\s*(.+)$/i))) deadlineApprox = m[1].trim();
      else if ((m = seg.match(/^Format:\s*(.+)$/i))) format = m[1].trim();
      else if (/^Format varies$/i.test(seg)) format = 'varies';
      else if ((m = seg.match(/^Length\s*(.+)$/i))) maxLength = m[1].trim();
      else if (/^Various lengths accepted$/i.test(seg)) maxLength = 'various';
      else if (/^Submit/i.test(seg)) submitVia = seg;
      else if (/^No deadlines$/i.test(seg)) deadlineApprox = null;
      else submitVia = submitVia ? `${submitVia} · ${seg}` : seg;
    }
    const noDeadlines = reqSegments.some((s) => /^No deadlines$/i.test(s));

    // --- premiere rule: card-specific sentences first, then the tier rule ---
    const cardSentences = [descText, req || '']
      .join(' ')
      .split(/(?<=\.)\s+/)
      .map((s) => s.trim())
      .filter((s) => /premiere/i.test(s));
    let premiereRule = cardSentences.length ? cardSentences.join(' ') : null;
    if (!premiereRule && tier === 1 && tierPremiereRule[1]) premiereRule = tierPremiereRule[1];

    // --- country: page-stated wins; otherwise a static venue lookup ---
    let country = null;
    let countrySource = null;
    if (tierNote && /^USA$/i.test(tierNote)) {
      country = 'USA';
      countrySource = 'page';
    } else if (tierNote && /^INDIA$/i.test(tierNote)) {
      country = 'India';
      countrySource = 'page';
    } else {
      const hit = COUNTRY_WORDS.find(([w]) =>
        new RegExp(`\\b${w}\\b`, 'i').test(`${descText} ${name || ''}`),
      );
      if (hit) {
        country = hit[1];
        countrySource = 'page';
      } else if (name && Object.prototype.hasOwnProperty.call(VENUE_COUNTRY, name)) {
        country = VENUE_COUNTRY[name];
        countrySource = country ? 'lookup' : null;
      }
    }

    const f = {
      name,
      tier,
      tierLabel,
      country,
      deadlineApprox,
      premiereRule,
      feeRange: tier && feeByTier[tier] ? feeByTier[tier] : null,
    };
    setIf(f, 'countrySource', countrySource);
    setIf(f, 'tierNote', tierNote);
    setIf(f, 'description', description);
    setIf(f, 'format', format);
    setIf(f, 'maxLength', maxLength);
    setIf(f, 'submitVia', submitVia);
    if (noDeadlines) f.noDeadlines = true;
    setIf(f, 'req', req);
    return f;
  });

  return { festivals, sourceNote, feeByTier, tierPremiereRule };
}

const { festivals, sourceNote, feeByTier, tierPremiereRule } = extractFestivals();

/* ------------------------------------------------------------------ *
 * write
 * ------------------------------------------------------------------ */

fs.mkdirSync(OUT_DIR, { recursive: true });

const stepsDoc = { steps, beats };
fs.writeFileSync(OUT_STEPS, `${JSON.stringify(stepsDoc, null, 2)}\n`, 'utf8');

const festDoc = {
  asOf: '2024',
  source: 'legacy/arunak-shortfilm-blueprint.html · Step 10 — Festival Strategy',
  note:
    'Deadlines, formats and fee ranges are the original blueprint\'s undated approximations, ' +
    'reproduced verbatim. Nothing here has been updated or invented. ' +
    '`countrySource: "lookup"` marks the few venue countries the page does not state.',
  sourceNote,
  feeByTier,
  tierPremiereRule,
  festivals,
};
fs.writeFileSync(OUT_FESTS, `${JSON.stringify(festDoc, null, 2)}\n`, 'utf8');

/* ------------------------------------------------------------------ *
 * self-check — normalised visible text, JSON vs. original
 * ------------------------------------------------------------------ */

/** Every string value anywhere in a JSON value, tags stripped. */
function textOf(value) {
  const out = [];
  (function walk(v) {
    if (Array.isArray(v)) return v.forEach(walk);
    if (v && typeof v === 'object') return Object.values(v).forEach(walk);
    if (typeof v === 'string') out.push(stripTags(v));
    if (typeof v === 'number') out.push(String(v));
  })(value);
  return out.join(' ');
}

const words = (s) => norm(s).split(' ').filter(Boolean);

function multiset(list) {
  const m = new Map();
  for (const w of list) m.set(w, (m.get(w) || 0) + 1);
  return m;
}

function coverage(expectedText, actualText) {
  const exp = multiset(words(expectedText));
  const act = multiset(words(actualText));
  let total = 0;
  let found = 0;
  const missing = [];
  for (const [w, n] of exp) {
    total += n;
    const have = Math.min(n, act.get(w) || 0);
    found += have;
    if (have < n) missing.push({ word: w, n: n - have });
  }
  return { total, found, missing, pct: total ? (found / total) * 100 : 100 };
}

// Region compared: the eleven <section class="step"> elements.
const expectedByStep = stepSections.map((s) => stripTags(s.outerHTML));
const actualByStep = steps.map((s, i) => {
  // beats and festivals are derived FROM step 04 / step 10 — fold them in so the
  // check measures the whole output, not just `blocks`.
  let extra = '';
  if (s.id === 'step-04') extra = textOf(beats);
  if (s.id === 'step-10') extra = textOf(festDoc);
  return `${textOf(s)} ${extra}`;
});

let grandTotal = 0;
let grandFound = 0;
const perStep = [];
const allMissing = [];
for (let i = 0; i < steps.length; i += 1) {
  const c = coverage(expectedByStep[i], actualByStep[i]);
  grandTotal += c.total;
  grandFound += c.found;
  perStep.push({ id: steps[i].id, pct: c.pct, missing: c.missing });
  for (const m of c.missing) allMissing.push(`${steps[i].id}:${m.word}${m.n > 1 ? `×${m.n}` : ''}`);
}
const pct = grandTotal ? (grandFound / grandTotal) * 100 : 100;

// Festival-only check: card text vs. festivals.json
const festRegion = document.querySelector('#step-10 .fest-grid');
const festCov = festRegion
  ? coverage(stripTags(festRegion.outerHTML), textOf(festivals))
  : { pct: 100, missing: [] };

// data-key audit
const sourceKeys = stepSections.flatMap((s) =>
  [...s.querySelectorAll('[data-key]')].map((e) => e.getAttribute('data-key')),
);
const lostKeys = sourceKeys.filter((k) => !emittedKeys.has(k));

/* ------------------------------------------------------------------ *
 * report
 * ------------------------------------------------------------------ */

const rawClasses = [...rawClassTally.entries()].sort((a, b) => b[1] - a[1]);

console.log('');
console.log('short-steps.mjs → src/data/steps.short.json, src/data/festivals.json');
console.log('');
console.log(
  `steps: ${stats.steps}/${stepSections.length}   ` +
    `asks: ${stats.asks} in ${stats.askBlocks} blocks   ` +
    `checks: ${stats.checks}/${stats.steps} (${stats.checkItems} items)   ` +
    `raw blocks: ${stats.raw}`,
);
console.log(
  `formula: ${stats.formulas}   why: ${stats.whys}   ` +
    `examples: ${stats.examples} (${stats.exampleItems} cards)   ` +
    `beats: ${beats.length}   festivals: ${festivals.length}`,
);
console.log(
  `data-keys: ${new Set(sourceKeys).size} in source, ${lostKeys.length} lost` +
    (lostKeys.length ? ` → ${lostKeys.join(', ')}` : ' ✓'),
);
console.log('');
console.log(
  `text coverage: ${pct.toFixed(2)}%  (${grandFound}/${grandTotal} words)` +
    (allMissing.length
      ? `  (missing: "${allMissing.join(' ').slice(0, 120)}")`
      : '  (missing: none)'),
);
console.log(`festival text coverage: ${festCov.pct.toFixed(2)}%`);
console.log('');
for (const p of perStep) {
  if (p.pct < 100) {
    console.log(
      `  ${p.id}: ${p.pct.toFixed(2)}%  missing → ${p.missing
        .map((m) => m.word)
        .join(' ')
        .slice(0, 100)}`,
    );
  }
}
console.log('');
console.log('raw block classes left unpromoted:');
for (const [c, n] of rawClasses) console.log(`  ${n}×  ${c}`);
if (warnings.length) {
  console.log('');
  console.log('warnings:');
  warnings.forEach((w) => console.log(`  ! ${w}`));
}
console.log('');

if (pct < 99) {
  console.error(`FAIL: text coverage ${pct.toFixed(2)}% is below the 99% floor.`);
  process.exit(1);
}
if (lostKeys.length) {
  console.error(`FAIL: ${lostKeys.length} data-key(s) dropped.`);
  process.exit(1);
}
