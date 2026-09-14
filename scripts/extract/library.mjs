#!/usr/bin/env node
/**
 * library.mjs — deterministic extractor for legacy/arunak-filmmaker-library.html
 *
 * Writes into src/data/:
 *   films.json                 22 analysed films
 *   directors.json             10 director archetypes
 *   rules.json                 50 craft rules
 *   watchlist.json             24 blueprint steps × 3 films = 72
 *   rates.chennai.2024.json    6 cost tables + calculator presets
 *
 * Contract: scripts/extract/SCHEMA.md
 *   - inline markup (<em>/<strong>/<code>/<br>) is preserved as an HTML string
 *   - .tn / .tanglish spans are lifted out of their parent into `tanglish`
 *   - nothing is dropped; anything unmodelled is kept as { type:"raw", html }
 *   - whitespace collapsed to single spaces, then trimmed
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHTML } from 'linkedom';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '../..');
const SRC = resolve(ROOT, 'legacy/arunak-filmmaker-library.html');
const OUT = resolve(ROOT, 'src/data');

/* ------------------------------------------------------------------ utils */

const norm = (s) =>
  String(s ?? '')
    .replace(/ /g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** innerHTML with whitespace collapsed — inline markup kept verbatim. */
const html = (el) => (el ? norm(el.innerHTML) : '');

/** visible text with whitespace collapsed. */
const text = (el) => (el ? norm(el.textContent) : '');

/**
 * Visible text with an explicit boundary between sibling nodes. `textContent`
 * concatenates adjacent elements with no separator ("STRUCTUREDUAL HERO"),
 * which the JSON side never reproduces; this makes both sides tokenise alike.
 * Used only by the self-check.
 */
function visibleText(node) {
  if (!node) return '';
  if (node.nodeType === 3) return String(node.data || '');
  if (node.nodeType !== 1) return '';
  if (node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return '';
  return [...node.childNodes].map(visibleText).join(' ');
}

/**
 * Pull every .tn / .tanglish out of `el` (detaching them), returning the
 * joined Tanglish text. Mutates the DOM, so call before reading innerHTML.
 */
function liftTanglish(el) {
  if (!el) return '';
  const spans = [...el.querySelectorAll('.tn, .tanglish')];
  const parts = spans.map((s) => {
    const t = norm(s.textContent);
    s.remove();
    return t;
  });
  return parts.filter(Boolean).join(' ');
}

/** add `key` to `obj` only when the value is a non-empty string. */
function put(obj, key, value) {
  if (typeof value === 'string' ? value.length > 0 : value != null) obj[key] = value;
  return obj;
}

/* --------------------------------------------------------------- numbers */

const MULT = [
  [/^(cr|crore|crores)$/i, 1e7],
  [/^(l|lakh|lakhs|lac|lacs)$/i, 1e5],
  [/^k$/i, 1e3],
];

function multOf(token) {
  for (const [re, m] of MULT) if (re.test(token)) return m;
  return null;
}

/** "15 L" -> { n: 15, mult: 1e5 } ; "40,000" -> { n: 40000, mult: null } */
function parseAmount(part) {
  const s = norm(part).replace(/₹/g, ' ').trim();
  const m = s.match(/^([\d.,]+)\s*([A-Za-z]*)$/);
  if (!m) return null;
  const n = parseFloat(m[1].replace(/,/g, ''));
  if (!Number.isFinite(n)) return null;
  const mult = m[2] ? multOf(m[2]) : null;
  if (m[2] && mult === null) return null; // unknown suffix -> ambiguous
  return { n, mult };
}

/**
 * Parse a printed rate into integer low/high where unambiguous, else null.
 * Handles "40,000 – 55,000", "₹2 – 5 L flat", "₹15 L – 2 Cr flat",
 * "₹15 – 30 K/day", "3,000 – 5,000 each", "500 – 1,000".
 * A bare-number side inherits the multiplier of the side that has one.
 */
function parseRange(raw) {
  let s = norm(raw)
    .replace(/₹/g, ' ')
    .replace(/\/\s*[A-Za-z]+/g, ' ') // "/day", "/shot"
    .replace(/\b(flat|each|per\s+\w+)\b/gi, ' ')
    .replace(/\+/g, ' ')
    .trim();

  const parts = s.split(/\s*[–—]\s*|\s+-\s+/).map(norm).filter(Boolean);

  if (parts.length === 1) {
    const a = parseAmount(parts[0]);
    if (!a) return { low: null, high: null };
    const v = Math.round(a.n * (a.mult ?? 1));
    return { low: v, high: v };
  }
  if (parts.length !== 2) return { low: null, high: null };

  const a = parseAmount(parts[0]);
  const b = parseAmount(parts[1]);
  if (!a || !b) return { low: null, high: null };

  const shared = a.mult ?? b.mult ?? 1;
  const low = Math.round(a.n * (a.mult ?? shared));
  const high = Math.round(b.n * (b.mult ?? shared));
  return { low, high };
}

/** unit for a row: explicit "/day"-style suffix, else "flat", else the column's. */
function unitOf(raw, headerUnit) {
  const m = norm(raw).match(/\/\s*([A-Za-z]+)\s*$/);
  if (m) return m[1].toLowerCase();
  if (/\bflat\s*$/i.test(raw)) return 'flat';
  return headerUnit || null;
}

/** "Rate (₹/day)" -> "day" ; "Rate" -> null */
function headerUnitOf(th) {
  const m = norm(th).match(/\(([^)]*)\)/);
  if (!m) return null;
  const inner = m[1].replace(/₹/g, '').replace(/^\//, '').trim();
  return inner ? inner.toLowerCase() : null;
}

/* ------------------------------------------------------------------ parse */

const source = readFileSync(SRC, 'utf8');
const { document } = parseHTML(source);

/* keep pristine element lists for the self-check BEFORE we mutate anything */
const vtext = (el) => norm(visibleText(el));
const originalRegions = {
  films: vtext(document.querySelector('.films-grid')),
  directors: [...document.querySelectorAll('.director-card')].map(vtext).join(' '),
  rules: vtext(document.querySelector('.rules-grid')),
  watchlist: [...document.querySelectorAll('.watch-step')].map(vtext).join(' '),
  rates: [...document.querySelectorAll('.disclaimer, .equip-block, .calc-block')]
    .map(vtext)
    .join(' '),
};

/* ---------------------------------------------------------------- 1 films */

function extractFilms() {
  return [...document.querySelectorAll('.film-card')].map((card) => {
    const metaRaw = text(card.querySelector('.meta'));
    const parts = metaRaw.split('·').map(norm).filter(Boolean);
    const yearPart = parts[0] && /^\d{4}$/.test(parts[0]) ? parts.shift() : null;

    const lessonEl = card.querySelector('.lesson');
    const tanglish = liftTanglish(lessonEl);

    const film = {};
    put(film, 'title', text(card.querySelector('h3')));
    if (yearPart) film.year = Number(yearPart);
    put(film, 'director', text(card.querySelector('.director')));
    if (parts.length) film.genres = parts;
    const tags = [...card.querySelectorAll('.tag')].map(text).filter(Boolean);
    if (tags.length) film.tags = tags;
    put(film, 'meta', metaRaw);
    put(film, 'lesson', html(lessonEl));
    put(film, 'tanglish', tanglish);
    return film;
  });
}

/* ------------------------------------------------------------ 2 directors */

function extractDirectors() {
  return [...document.querySelectorAll('.director-card')].map((card) => {
    const eraRaw = text(card.querySelector('.era'));
    const eraBits = eraRaw.split('·').map(norm).filter(Boolean);
    // "1986 – PRESENT · ROMANCE / EPIC"
    const years = eraBits.length > 1 ? eraBits[0] : null;
    const archetype = eraBits.length > 1 ? eraBits.slice(1).join(' · ') : eraRaw;

    const traits = [];
    const dl = card.querySelector('dl.traits, .traits');
    if (dl) {
      const kids = [...dl.children];
      for (let i = 0; i < kids.length; i++) {
        if (kids[i].tagName !== 'DT') continue;
        const term = text(kids[i]);
        const dd = kids[i + 1] && kids[i + 1].tagName === 'DD' ? kids[i + 1] : null;
        traits.push({ term, value: html(dd) });
      }
    }
    const traitOf = (re) => (traits.find((t) => re.test(t.term)) || {}).value || '';

    const studyEl = card.querySelector('.study');
    const study = studyEl
      ? {
          label: text(studyEl.querySelector('.lab')),
          body: html(studyEl.querySelector('p')),
        }
      : null;

    const tanglish = liftTanglish(card);

    const d = {};
    put(d, 'name', text(card.querySelector('h3')));
    put(d, 'archetype', archetype);
    put(d, 'years', years);
    put(d, 'era', eraRaw);
    d.traits = traits;
    put(d, 'signature', traitOf(/^signature$/i));
    put(d, 'watch', traitOf(/^watch\s*for$/i));
    if (study) d.study = study;
    put(d, 'tanglish', tanglish);
    return d;
  });
}

/* ---------------------------------------------------------------- 3 rules */

function extractRules() {
  return [...document.querySelectorAll('.rule-card')].map((card, i) => {
    const r = { n: i + 1 };
    put(r, 'text', html(card.querySelector('.rule-text')));
    put(r, 'attribution', text(card.querySelector('.attrib')));
    return r;
  });
}

/* ------------------------------------------------------------ 4 watchlist */

function extractWatchlist() {
  const ROMAN = { I: 1, II: 2, III: 3, IV: 4, V: 5 };
  return [...document.querySelectorAll('.watch-step')].map((block) => {
    const tag = text(block.querySelector('.step-tag'));
    const label = norm(tag.replace(/[↗↖→›»]+\s*$/, ''));

    const href = (block.querySelector('a[href*="#step-"]') || {}).getAttribute
      ? block.querySelector('a[href*="#step-"]').getAttribute('href')
      : '';
    const hash = (href.match(/#(step-\d+)/) || [])[1] || null;
    const num = (label.match(/STEP\s+(\d+)/i) || [])[1] || null;
    const step = hash || (num ? `step-${num}` : null);

    const volRoman = (label.match(/VOL\s+([IVX]+)/i) || [])[1];
    const vol = volRoman ? ROMAN[volRoman.toUpperCase()] ?? null : null;

    const films = [...block.querySelectorAll('.watch-film')].map((f) => {
      const titleRaw = text(f.querySelector('.title'));
      const m = titleRaw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
      const entry = {};
      put(entry, 'title', m ? norm(m[1]) : titleRaw);
      if (m) entry.year = norm(m[2]);
      put(entry, 'why', html(f.querySelector('.why')));
      return entry;
    });

    const out = {};
    put(out, 'step', step);
    if (vol != null) out.vol = vol;
    put(out, 'label', label);
    put(out, 'heading', html(block.querySelector('h4')));
    out.films = films;
    return out;
  });
}

/* ---------------------------------------------------------------- 5 rates */

function slug(s) {
  return norm(s)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractRates() {
  const disclaimer = document.querySelector('.disclaimer');
  const sections = [...document.querySelectorAll('.equip-block')].map((block) => {
    const heading = text(block.querySelector('h3'));
    const table = block.querySelector('table.equip-table, table');
    const columns = [...(table ? table.querySelectorAll('thead th') : [])].map(text);
    const headerUnit = columns.length > 1 ? headerUnitOf(columns[1]) : null;

    const rows = [...(table ? table.querySelectorAll('tbody tr') : [])].map((tr) => {
      const cells = [...tr.children];
      const item = text(cells[0]);
      const raw = text(cells[1]);
      const note = text(cells[2]);
      const { low, high } = parseRange(raw);
      const row = { item, unit: unitOf(raw, headerUnit), low, high, raw };
      if (/\beach\s*$/i.test(raw)) row.per = 'each';
      put(row, 'note', note);
      return row;
    });

    const s = { id: slug(heading), heading };
    put(s, 'note', text(block.querySelector('.hint')));
    if (columns.length) s.columns = columns;
    s.rows = rows;
    return s;
  });

  // The cost calculator is a bespoke widget — kept raw per SCHEMA.md rule 1.
  const calc = document.querySelector('.calc-block');

  // PRESET_ITEMS lives in the page's own inline <script>.
  const presets = extractPresets();

  const out = {
    asOf: '2024-25',
    currency: 'INR',
  };
  put(out, 'noteLabel', text(disclaimer && disclaimer.querySelector('.label')));
  put(out, 'note', html(disclaimer && disclaimer.querySelector('p')));
  out.sections = sections;
  out.presets = presets;
  if (calc) out.widgets = [{ type: 'raw', html: norm(calc.outerHTML) }];
  return out;
}

function extractPresets() {
  const scripts = [...document.querySelectorAll('script')]
    .map((s) => s.textContent || '')
    .filter((t) => t.includes('PRESET_ITEMS'));
  if (!scripts.length) throw new Error('PRESET_ITEMS not found in page scripts');
  const body = scripts[0];
  const m = body.match(/const\s+PRESET_ITEMS\s*=\s*(\[[\s\S]*?\])\s*;/);
  if (!m) throw new Error('PRESET_ITEMS array literal did not match');
  const arr = JSON.parse(m[1]); // double-quoted string list -> valid JSON
  if (!Array.isArray(arr) || !arr.length) throw new Error('PRESET_ITEMS parsed empty');
  return arr;
}

/* ------------------------------------------------------------- self-check */

/**
 * Every whitespace-separated token containing at least one alphanumeric,
 * with enclosing punctuation trimmed. "(1999)" and "1999" are the same word:
 * the watch list prints "Magnolia (1999)" and we store title + year apart.
 */
function tokens(s) {
  return norm(String(s))
    .split(' ')
    .map((t) => t.replace(/^[^\p{L}\p{N}₹]+|[^\p{L}\p{N}%]+$/gu, ''))
    .filter((t) => t && /[\p{L}\p{N}]/u.test(t));
}

/** strip tags from any JSON value tree, returning one flat text blob */
function jsonText(value) {
  const buf = [];
  const walk = (v) => {
    if (v == null) return;
    if (typeof v === 'string') buf.push(v.replace(/<[^>]*>/g, ' '));
    else if (typeof v === 'number' || typeof v === 'boolean') buf.push(String(v));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(value);
  return norm(buf.join(' '));
}

/** multiset token coverage of `original` by `produced` */
function coverage(originalStr, producedStr) {
  const have = new Map();
  for (const t of tokens(producedStr)) have.set(t, (have.get(t) || 0) + 1);
  const orig = tokens(originalStr);
  const missing = [];
  let hit = 0;
  for (const t of orig) {
    const n = have.get(t) || 0;
    if (n > 0) {
      have.set(t, n - 1);
      hit++;
    } else missing.push(t);
  }
  return {
    total: orig.length,
    hit,
    pct: orig.length ? (hit / orig.length) * 100 : 100,
    missing,
  };
}

/* ------------------------------------------------------------------- main */

const films = extractFilms();
const directors = extractDirectors();
const rules = extractRules();
const watchlist = extractWatchlist();
const rates = extractRates();

mkdirSync(OUT, { recursive: true });
const write = (name, data) =>
  writeFileSync(resolve(OUT, name), JSON.stringify(data, null, 2) + '\n', 'utf8');

write('films.json', films);
write('directors.json', directors);
write('rules.json', rules);
write('watchlist.json', watchlist);
write('rates.chennai.2024.json', rates);

/* re-read from disk, exactly as a consumer would */
const read = (name) => JSON.parse(readFileSync(resolve(OUT, name), 'utf8'));
const produced = {
  films: read('films.json'),
  directors: read('directors.json'),
  rules: read('rules.json'),
  watchlist: read('watchlist.json'),
  rates: read('rates.chennai.2024.json'),
};

const watchFilmCount = produced.watchlist.reduce((n, s) => n + s.films.length, 0);
const rateRowCount = produced.rates.sections.reduce((n, s) => n + s.rows.length, 0);
const traitCount = produced.directors.reduce((n, d) => n + d.traits.length, 0);

const domCounts = {
  films: document.querySelectorAll('.film-card').length,
  directors: document.querySelectorAll('.director-card').length,
  rules: document.querySelectorAll('.rule-card').length,
  steps: document.querySelectorAll('.watch-step').length,
  watchFilms: document.querySelectorAll('.watch-film').length,
  equipBlocks: document.querySelectorAll('.equip-block').length,
  equipRows: document.querySelectorAll('.equip-table tbody tr').length,
  traits: document.querySelectorAll('.director-card .traits dd').length,
};

console.log(
  `films: ${produced.films.length}/${domCounts.films}   ` +
    `directors: ${produced.directors.length}/${domCounts.directors}   ` +
    `traits: ${traitCount}/${domCounts.traits}   ` +
    `rules: ${produced.rules.length}/${domCounts.rules}`
);
console.log(
  `watch steps: ${produced.watchlist.length}/${domCounts.steps}   ` +
    `watch films: ${watchFilmCount}/${domCounts.watchFilms}   ` +
    `rate tables: ${produced.rates.sections.length}/${domCounts.equipBlocks}   ` +
    `rate rows: ${rateRowCount}/${domCounts.equipRows}   ` +
    `presets: ${produced.rates.presets.length}   ` +
    `raw blocks: ${(produced.rates.widgets || []).length}`
);

const unparsed = [];
for (const s of produced.rates.sections)
  for (const r of s.rows)
    if (r.low === null || r.high === null) unparsed.push(`${s.id}/${r.item}: ${r.raw}`);
console.log(`rate cells with null low/high: ${unparsed.length}${unparsed.length ? ' → ' + unparsed.join(' | ') : ''}`);

let totalHit = 0;
let totalAll = 0;
const allMissing = [];
for (const key of Object.keys(originalRegions)) {
  const c = coverage(originalRegions[key], jsonText(produced[key]));
  totalHit += c.hit;
  totalAll += c.total;
  if (c.missing.length) allMissing.push(...c.missing);
  const miss = c.missing.length ? `  (missing: "${c.missing.join(' ').slice(0, 120)}")` : '';
  console.log(`${key} coverage: ${c.pct.toFixed(2)}%  ${c.hit}/${c.total}${miss}`);
}
const totalPct = totalAll ? (totalHit / totalAll) * 100 : 100;
console.log(
  `text coverage: ${totalPct.toFixed(2)}%  ${totalHit}/${totalAll}` +
    (allMissing.length ? `  (missing: "${allMissing.join(' ').slice(0, 120)}")` : '')
);

if (totalPct < 99) {
  console.error(`\nFAIL: coverage ${totalPct.toFixed(2)}% is below the 99% floor.`);
  process.exit(1);
}
