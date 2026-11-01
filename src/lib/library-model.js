/* ============================================================
   LIBRARY-MODEL — the Library page's derivations, without the page
   ------------------------------------------------------------
   src/pages/library.js draws the shelves; this file is every number
   and every join the page states (docs/ARCHITECTURE.md):

     counts       films, directors, rules, watch-list steps and films,
                  rate tables, studies, dissections — all array.length
     numWord      "fifty rules" that still read as English when the
                  JSON gains a row
     rate card    its age, the provenance line, the 2026 check layer
                  joined to the 2024-25 rows (and what failed to join)
     rails        the "in this tab" index per shelf
     terminology  sorting, the alias index and the search text

   Pure: no `document`, no storage, no src/ui import. The data arrays
   are passed in, so this can be read in Node against fixtures.
   ============================================================ */

import { filmId, directorId, rateTableId, watchId, STAGES, stageLabel } from './library-search.js';

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'];

export const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

/** "Fifty rules of thumb" has to still read like English when the
 *  JSON gains a rule. Words below 100, digits above. */
export function numWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return UNITS[n];
  const t = TENS[Math.floor(n / 10)];
  const u = n % 10;
  return u ? `${t}-${UNITS[u]}` : t;
}
export const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Every number the page says out loud, from the arrays it draws.
 * `studies` and `dissections` are the lists (listStudies(), listShipped()).
 */
export function libraryCounts({ films, directors, rules, watchlist, featureSteps, productionSteps, rates, studies, dissections }) {
  const N_STEPS = watchlist.length;
  const N_WATCHFILMS = watchlist.reduce((n, s) => n + s.films.length, 0);
  return {
    N_FILMS: films.length,
    N_DIRECTORS: directors.length,
    N_RULES: rules.length,
    N_STEPS,
    /* The watch list covers the writing half only (steps 01-24); the
       Feature Blueprint itself runs on through production and post. */
    N_BLUEPRINT: featureSteps.vol1.length + featureSteps.vol2.length +
                 productionSteps.production.length + productionSteps.post.length,
    N_WATCHFILMS,
    N_TABLES: rates.sections.length,
    N_STUDIES: studies.length,
    N_DISSECTED: dissections.length,
    /* Films-per-step is a fact about the data, not a constant. */
    FILMS_PER_STEP: Math.round(N_WATCHFILMS / Math.max(1, N_STEPS))
  };
}

/* ---- rate provenance ---------------------------------------- */
/** Years since the rate card's own year, or null if not yet a year. */
export function rateAge(asOf, nowYear = new Date().getFullYear()) {
  const firstYear = parseInt(String(asOf).match(/\d{4}/)?.[0] ?? '', 10);
  if (!firstYear || nowYear <= firstYear) return null;
  return nowYear - firstYear;
}

export function provenanceLine(asOf, nowYear) {
  const age = rateAge(asOf, nowYear);
  if (!age) return `Rate card as of ${asOf}.`;
  const span = age === 1 ? 'about a year old' : `about ${numWord(age)} years old`;
  return `Rate card as of ${asOf} — ${span}. Most of these figures have not been ` +
         `updated since; treat them as historical and re-quote before you budget.`;
}

/* ---- the 2026 check layer ----------------------------------- */
export const CONFIDENCE_LABEL = {
  checked: 'Checked',
  corroborating: 'Context',
  stale: 'Not updated'
};

/**
 * The check overlay, keyed by section id then by the row's `item`
 * string (a rate row has no id). Nothing is dropped on a miss —
 * `orphans()` returns what no row claimed.
 */
export function rateChecksIndex(rateChecks) {
  const bySection = new Map();
  for (const row of (rateChecks.rows || [])) {
    if (!bySection.has(row.section)) bySection.set(row.section, []);
    bySection.get(row.section).push(row);
  }
  const inSection = (sectionId) => bySection.get(sectionId) || [];
  return {
    inSection,
    checksFor: (sectionId, item) => inSection(sectionId).filter((c) => c.item === item),
    anyChecked: (sectionId) => inSection(sectionId).some((c) => c.confidence === 'checked'),
    orphans: (sectionId, matched) => inSection(sectionId).filter((c) => !matched.has(c)),
    sourceOf: (id) => (rateChecks.sources || {})[id] || null
  };
}

/* ---- the "in this tab" rail ---------------------------------- */
export function railItems(sectionId, { films, directors, rates, watchlist }) {
  switch (sectionId) {
    case 'films': return films.map((f) => ({ id: filmId(f.title), label: f.title }));
    case 'directors': return directors.map((d) => ({ id: directorId(d.name), label: d.name }));
    case 'equipment': return rates.sections.map((s) => ({ id: rateTableId(s.id), label: s.heading }));
    case 'watch': return watchlist.map((w) => ({ id: watchId(w.step), label: w.label }));
    case 'glossary': return STAGES.map((s) => ({ id: 'terms-' + s.id, label: s.label }));
    default: return [];
  }
}

/* ---- film terminology ---------------------------------------- */
export function termSortKey(t) { return String(t.term).toLowerCase().replace(/^[^a-z0-9]+/, ''); }

/** The glossary's terms, sorted, with a lower-case name+alias index. */
export function indexTerms(g) {
  const terms = (g.terms || []).slice().sort((a, b) => termSortKey(a).localeCompare(termSortKey(b)));
  const byName = new Map();
  for (const t of terms) {
    byName.set(String(t.term).toLowerCase(), t);
    for (const a of t.aliases || []) if (!byName.has(String(a).toLowerCase())) byName.set(String(a).toLowerCase(), t);
  }
  return { terms, byName };
}

/** The terms of one stage, in index order. */
export function termsInStage(terms, stageId) {
  return terms.filter((t) => t.stage === stageId);
}

/** A term's see-also names that resolve to a term in the index. */
export function seeAlso(t, byName) {
  return (t.seeAlso || []).filter((n) => byName.has(String(n).toLowerCase()));
}

/** The lower-case text the in-tab filter matches a term card against. */
export function termSearchText(t) {
  return [
    t.term, (t.aliases || []).join(' '), t.def, t.tanglish,
    ...(t.examples || []).map((e) => e.note), stageLabel(t.stage)
  ].filter(Boolean).join(' ').toLowerCase();
}
