/* ============================================================
   THE FILMMAKER'S LIBRARY — page entry
   ------------------------------------------------------------
   The legacy page (legacy/arunak-filmmaker-library.html) was
   1,559 lines of hand-written markup: 22 film cards, 10 director
   cards, 50 rule cards, 6 rate tables and 24 watch-list blocks,
   all typed out by hand, plus a cover whose table of contents
   quoted counts ("22 films", "50 rules", "72-film watch list")
   that nothing kept honest. Editing the data meant editing the
   prose in five places and hoping.

   Everything below renders from src/data/*.json instead, and
   every count on the page is `array.length`. The cover blurb,
   the TOC lines, the section-head counters and the deck prose
   cannot disagree with the cards, because they are the same
   number.

   ⚠️  LOAD ORDER — store.js FIRST.
   It patches Storage.prototype so `arunak_library_calc_v1` is
   scoped to the current project. The calculator's load/save must
   run after that patch is installed. See the banner in
   src/lib/store.js.
   ============================================================ */

import '../lib/store.js';

import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/print.css';

import StudioUI from '../ui/chrome.js';
import { h, delegate } from '../lib/dom.js';

import films from '../data/films.json';
import directors from '../data/directors.json';
import rules from '../data/rules.json';
import watchlist from '../data/watchlist.json';
import rates from '../data/rates.chennai.2024.json';

/* ============================================================
   DERIVED COUNTS — the single source for every number the page
   says out loud.
   ============================================================ */
const N_FILMS      = films.length;
const N_DIRECTORS  = directors.length;
const N_RULES      = rules.length;
const N_STEPS      = watchlist.length;
const N_WATCHFILMS = watchlist.reduce((n, s) => n + s.films.length, 0);
const N_TABLES     = rates.sections.length;
/* Films-per-step is a fact about the data, not a constant: if a
   step ever carried four, the deck would say four. */
const FILMS_PER_STEP = Math.round(N_WATCHFILMS / Math.max(1, N_STEPS));

const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];

const UNITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven',
  'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy',
  'eighty', 'ninety'];

/** "Fifty rules of thumb" has to still read like English when the
 *  JSON gains a rule. Words below 100, digits above. */
function numWord(n) {
  if (!Number.isInteger(n) || n < 0 || n > 99) return String(n);
  if (n < 20) return UNITS[n];
  const t = TENS[Math.floor(n / 10)];
  const u = n % 10;
  return u ? `${t}-${UNITS[u]}` : t;
}
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);

/* ---- rate provenance --------------------------------------
   The rate card is a snapshot, and the snapshot has a date. A
   reader pricing a shoot against it is entitled to know how old
   it is, computed now rather than asserted once and left to rot. */
function rateAge() {
  const firstYear = parseInt(String(rates.asOf).match(/\d{4}/)?.[0] ?? '', 10);
  const now = new Date().getFullYear();
  if (!firstYear || now <= firstYear) return null;
  return now - firstYear;
}
function provenanceLine() {
  const age = rateAge();
  const asOf = rates.asOf;
  if (!age) return `Rate card as of ${asOf}.`;
  const span = age === 1 ? 'about a year old' : `about ${numWord(age)} years old`;
  return `Rate card as of ${asOf} — ${span}. These figures have not been ` +
         `updated since; treat them as historical and re-quote before you budget.`;
}

/* ============================================================
   SECTIONS — one list drives the toolbar nav, the cover TOC and
   the five section heads. Three copies became one.
   ============================================================ */
const SECTIONS = [
  {
    id: 'films',
    nav: 'FILMS',
    title: 'The Tamil Cinema <em>Craft Library.</em>',
    tocTitle: 'Tamil Cinema Craft Library',
    tocDesc: `${N_FILMS} films, what to learn from each`,
    count: `${N_FILMS} FILMS`,
    deck: `${cap(numWord(N_FILMS))} films, mostly Tamil with a few Malayalam ` +
          `neighbours. For each one, the single craft lesson worth taking. ` +
          `Not reviews — extractable techniques you can apply to your own work.`,
    body: renderFilms
  },
  {
    id: 'directors',
    nav: 'DIRECTORS',
    title: 'Director <em>Archetypes.</em>',
    tocTitle: 'Director Archetypes',
    tocDesc: `${N_DIRECTORS} voices to study`,
    count: `${N_DIRECTORS} ARCHETYPES`,
    deck: `${cap(numWord(N_DIRECTORS))} directors whose grammar is distinct ` +
          `enough to study as schools of filmmaking. For each: the signature ` +
          `traits, the film to start with, and a Tanglish gloss on what makes ` +
          `them unique.`,
    body: renderDirectors
  },
  {
    id: 'rules',
    nav: 'RULES',
    title: `${cap(numWord(N_RULES))} <em>Rules of Thumb.</em>`,
    tocTitle: `${N_RULES} Rules of Thumb`,
    tocDesc: 'Craft maxims, attributed',
    count: `${N_RULES} RULES`,
    deck: `Craft maxims, attributed where the source is known. Treat them as ` +
          `starting points, not laws — every great film breaks at least one.`,
    body: renderRules
  },
  {
    id: 'equipment',
    nav: 'EQUIPMENT',
    title: 'Equipment &amp; <em>Cost Estimator.</em>',
    tocTitle: 'Equipment & Cost Estimator',
    tocDesc: `Chennai ${rates.asOf} indicative ranges`,
    count: `${N_TABLES} RATE TABLES · ${rates.asOf}`,
    deck: `Indicative daily rental ranges, Chennai market, ${rates.asOf}, in ` +
          `${numWord(N_TABLES)} tables. Use the calculator at the bottom to ` +
          `estimate kit cost for your shoot. Rates fluctuate; verify with ` +
          `vendors before locking your budget.`,
    body: renderEquipment
  },
  {
    id: 'watch',
    nav: 'WATCH LIST',
    title: 'Watch List <em>per Step.</em>',
    tocTitle: 'Watch List per Step',
    tocDesc: `${FILMS_PER_STEP} films for each of ${N_STEPS} blueprint steps`,
    count: `${N_WATCHFILMS} FILMS · ${N_STEPS} STEPS`,
    deck: `For every one of the ${N_STEPS} blueprint steps, ${numWord(FILMS_PER_STEP)} ` +
          `films to study for that exact craft concept. ${N_WATCHFILMS} films total. ` +
          `Watch them with the step's question in mind — the films will teach you ` +
          `more than the blueprint can.`,
    body: renderWatchlist
  }
];

/* ============================================================
   CHROME
   ============================================================ */
function renderToolbar() {
  return h('header.toolbar', { role: 'banner' }, [
    h('span.brand', { text: 'CURATED BY ARUNAK · LIBRARY · COMPANION' }),
    h('a#studioProjLink.studio-proj-link', {
      href: 'index.html',
      title: 'Back to Studio · current project'
    }, [
      h('span.spl-arrow', { text: '←', 'aria-hidden': 'true' }),
      h('span#studioProjLabel.spl-label', { text: 'STUDIO' })
    ]),
    h('a.tb-link.gold', { href: 'index.html', text: '⌂ HUB' }),
    h('a.nav-link', { href: 'feature.html', text: 'FEATURE ↗' }),
    h('a.nav-link', { href: 'short.html', text: 'SHORTS ↗' }),
    h('nav.nav-jump', { 'aria-label': 'Library sections' },
      SECTIONS.map((s) => h('a.nav-link', { href: `#${s.id}`, text: s.nav }))),
    // No inline onclick anywhere on this page — see wireActions().
    h('button#darkBtn.btn.icon-btn', {
      type: 'button',
      'data-action': 'theme',
      title: 'Cycle theme (paper → sepia → ink)',
      'aria-label': 'Cycle theme',
      text: '◐'
    }),
    h('button.btn', { type: 'button', 'data-action': 'print', text: 'PRINT' })
  ]);
}

/* ============================================================
   COVER
   ============================================================ */
function renderCover() {
  const blurb =
    `A curated reference: ${N_FILMS} Tamil & Indian films analyzed for craft, ` +
    `${N_DIRECTORS} director archetypes, ${N_RULES} craft rules, equipment cost ` +
    `ranges (Chennai ${rates.asOf}), and a ${N_WATCHFILMS}-film watch list mapped ` +
    `to every step of the blueprint.`;

  return h('section.cover', {}, [
    h('div', {}, [
      h('div.cover-mark', { text: 'A reference companion to The Filmmaker\'s Blueprint' }),
      h('h1.cover-title', {}, [
        'The ', h('span.light', { text: 'Filmmaker\'s' }), h('br'), 'Library.'
      ]),
      h('p.cover-sub', { text: blurb }),
      h('nav.cover-toc', { 'aria-label': 'Contents' },
        SECTIONS.map((s, i) => h('a.toc-item', { href: `#${s.id}` }, [
          h('span.num', { text: `SECTION ${ROMAN[i + 1] || i + 1}` }),
          h('span.title', { text: s.tocTitle }),
          h('span.desc', { text: s.tocDesc })
        ])))
    ]),
    h('div', {}, [
      h('span.cover-byline', {}, ['CURATED BY ', h('span', { text: 'ARUNAK' })])
    ])
  ]);
}

function renderSectionHead(section, i) {
  return h('section.section-head', { id: section.id }, [
    h('div.left', {}, [
      h('div.label', { text: `SECTION ${ROMAN[i + 1] || i + 1}` }),
      h('h2', { html: section.title }),
      h('p.deck', { text: section.deck })
    ]),
    // The count is read off the same array the cards come from,
    // so the header can never claim a number the body doesn't have.
    h('div.right', { text: section.count })
  ]);
}

/* ============================================================
   SECTION I — FILMS
   ============================================================ */
function renderFilms() {
  return h('section.section-body', {}, [
    h('div.films-grid', {}, films.map((f) => h('article.film-card', {}, [
      h('div.meta', { text: f.meta }),
      h('h3', { text: f.title }),
      h('div.director', { text: f.director }),
      h('div.tags', {}, (f.tags || []).map((t) => h('span.tag', { text: t }))),
      h('p.lesson', { html: f.lesson }, [
        f.tanglish ? h('span.tn', { html: f.tanglish }) : null
      ])
    ])))
  ]);
}

/* ============================================================
   SECTION II — DIRECTORS
   ============================================================ */
function renderDirectors() {
  return h('section.section-body', {}, directors.map((d) => {
    const traits = h('dl.traits');
    for (const t of d.traits || []) {
      traits.append(h('dt', { text: t.term }), h('dd', { text: t.value }));
    }
    return h('article.director-card', {}, [
      h('div.name-row', {}, [
        h('h3', { text: d.name }),
        h('span.era', { text: d.era })
      ]),
      traits,
      d.study ? h('div.study', {}, [
        h('div.lab', { text: d.study.label }),
        h('p', { html: d.study.body })
      ]) : null,
      d.tanglish ? h('span.tn', { html: d.tanglish }) : null
    ]);
  }));
}

/* ============================================================
   SECTION III — RULES
   ------------------------------------------------------------
   The numbers are a CSS counter on .rules-grid, so they follow
   the rendered order rather than a hand-typed `n`. The data's
   own `n` rides along as data-n for anyone diffing.
   ============================================================ */
function renderRules() {
  return h('section.section-body', {}, [
    h('div.rules-grid', {}, rules.map((r) => h('div.rule-card', { 'data-n': r.n }, [
      h('p.rule-text', { text: r.text }),
      h('p.attrib', { text: r.attribution })
    ])))
  ]);
}

/* ============================================================
   SECTION IV — EQUIPMENT & COST ESTIMATOR
   ============================================================ */
function renderEquipment() {
  const body = h('section.section-body');

  body.append(h('div.disclaimer', {}, [
    h('div.label', { text: rates.noteLabel }),
    h('p', { html: rates.note }),
    h('p.hint', { text: provenanceLine() })
  ]));

  for (const sec of rates.sections) {
    const block = h('div.equip-block', { id: `rates-${sec.id}` }, [
      h('h3', { text: sec.heading })
    ]);
    if (sec.note) block.append(h('p.hint', { text: sec.note }));
    // Provenance sits with each table, not only in the disclaimer
    // three screens up — that is where the eye actually is.
    block.append(h('p.hint', { text: `Rates as of ${rates.asOf}. Not updated since.` }));

    const table = h('table.equip-table', {}, [
      h('caption.visually-hidden', {
        text: `${sec.heading} — indicative Chennai rates, ${rates.asOf}`
      }),
      h('thead', {}, [
        h('tr', {}, (sec.columns || []).map((c) => h('th', { scope: 'col', text: c })))
      ]),
      h('tbody', {}, (sec.rows || []).map((r) => h('tr', {}, [
        h('td.item', { text: r.item }),
        // `raw` is the rate exactly as published. Nothing here is
        // recomputed, re-inflated or otherwise invented.
        h('td.rate', { text: r.raw }),
        h('td.note', { text: r.note || '' })
      ])))
    ]);
    // Wide table, narrow phone: the table scrolls, the page doesn't.
    block.append(h('div.table-wrap', {}, [table]));
    body.append(block);
  }

  body.append(renderCalculator());
  return body;
}

/* ============================================================
   THE CALCULATOR
   ------------------------------------------------------------
   Ported from the legacy inline script (lines ~1428–1559 of
   legacy/arunak-filmmaker-library.html). The storage key and the
   `ci_<n>_item|days|rate` data-key shape are unchanged, byte for
   byte — people have saved estimates behind them.

   What changed, deliberately:
     1. There is now a custom-name input. The select's first
        option has always read "Pick item or type below…" and
        offered "Other (custom)", but there was nothing to type
        into: the affordance was advertised and absent. It saves
        under a new `ci_<n>_custom` key, which old data simply
        does not have (and new data survives an old reader,
        because the legacy loader ignores keys it can't place).
     2. Subtotals and the grand total print the exact rupee
        figure. fmtINR() rounds ≥ ₹1,000 to whole thousands, so a
        ₹4,600 line read "₹ 5k" — a 400-rupee lie in a budgeting
        tool. fmtINR survives for the one place space demands it:
        the ≈ magnitude next to the grand total's caption.
     3. Every field has a real <label>. They are screen-reader-only
        at desk widths (the .calc-row.head strip labels the columns
        there) and become visible below 820px, where that strip is
        display:none and the three boxes were unlabelled entirely.
     4. No inline onchange/oninput/onclick. One delegated listener.
   ============================================================ */
const CALC_KEY = 'arunak_library_calc_v1';
const PREF_KEY = 'arunak_library_prefs_v1';
const PRESET_ITEMS = rates.presets;

let calcCount = 0;

/* Published ranges, keyed loosely enough to survive punctuation
   differences between the preset list and the rate tables. Used
   only to SHOW the card's own figure next to a picked item —
   never to fill a number in on the user's behalf. */
const RATE_BY_ITEM = (() => {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, '');
  const map = new Map();
  for (const sec of rates.sections) {
    for (const row of sec.rows || []) {
      if (!map.has(norm(row.item))) map.set(norm(row.item), row);
    }
  }
  return { get: (name) => map.get(norm(name)) || null };
})();

/** Legacy behaviour, unchanged: "2.5", "1,20,000", "₹18k", "2L". */
function parseNum(s) {
  if (!s) return 0;
  s = String(s).toLowerCase().replace(/[,\s₹$]/g, '').replace(/rs\.?/g, '');
  let m = 1;
  // Suffixes must be ANCHORED to the end. The old test was /l|lakh|lac/,
  // which matched a bare "l" ANYWHERE — so "1 lens day" parsed as 1 lakh.
  if (/(cr|crore)$/.test(s))        { m = 10000000; s = s.replace(/(crore|cr)$/, ''); }
  else if (/(lakh|lac|l)$/.test(s)) { m = 100000;   s = s.replace(/(lakh|lac|l)$/, ''); }
  else if (/k$/.test(s))            { m = 1000;     s = s.replace(/k$/, ''); }
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n * m;
}

/** Abbreviated — lossy by design. Glanceable magnitude only. */
function fmtINR(n) {
  if (n === 0) return '₹ 0';
  if (n >= 10000000) return '₹ ' + (n / 10000000).toFixed(2).replace(/\.?0+$/, '') + ' Cr';
  if (n >= 100000) return '₹ ' + (n / 100000).toFixed(2).replace(/\.?0+$/, '') + ' L';
  if (n >= 1000) return '₹ ' + Math.round(n / 1000) + 'k';
  return '₹ ' + Math.round(n);
}

const INR = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
/** Exact, Indian grouping: ₹ 54,000 / ₹ 1,25,00,000. */
function fmtINRExact(n) {
  if (!n) return '₹ 0';
  return '₹ ' + INR.format(Math.round(n));
}

/** The item this row is actually about: custom name wins, then preset. */
function rowItemName(row) {
  const custom = row.querySelector('[data-key$="_custom"]');
  const select = row.querySelector('[data-key$="_item"]');
  const typed = custom && custom.value.trim();
  if (typed) return typed;
  const picked = select && select.value.trim();
  if (picked && picked !== 'Other (custom)') return picked;
  return '';
}

function buildCalcRow(idx) {
  const ids = {
    item:   `ci_${idx}_item`,
    custom: `ci_${idx}_custom`,
    days:   `ci_${idx}_days`,
    rate:   `ci_${idx}_rate`
  };

  const select = h('select', { id: ids.item, 'data-key': ids.item }, [
    h('option', { value: '', text: 'Pick item or type below…' }),
    ...PRESET_ITEMS.map((i) => h('option', { value: i, text: i }))
  ]);

  const itemCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.item, text: 'Item' }),
    select,
    h('label.calc-label', { for: ids.custom, text: 'Custom item name' }),
    h('input', {
      id: ids.custom, type: 'text', 'data-key': ids.custom,
      placeholder: 'or type your own…', autocomplete: 'off'
    })
  ]);

  const daysCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.days, text: 'Days' }),
    h('input', {
      id: ids.days, type: 'text', inputmode: 'decimal',
      'data-key': ids.days, placeholder: 'Days', autocomplete: 'off'
    })
  ]);

  const rateCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.rate, text: 'Rate (₹ per day)' }),
    h('input', {
      id: ids.rate, type: 'text', inputmode: 'decimal',
      'data-key': ids.rate, placeholder: '₹/day', autocomplete: 'off'
    }),
    h('span.calc-note', { 'data-role': 'card-rate' })
  ]);

  // The subtotal is output, not a field, so its caption is a plain
  // <span> rather than a <label for> — but it hides and shows with
  // the others, so the phone layout never shows a bare number box.
  const totalCell = h('div.calc-cell', {}, [
    h('span.calc-label', { text: 'Subtotal' }),
    h('span.total-cell', { id: `ci_${idx}_subtotal`, text: '₹ 0' })
  ]);

  return h('div.calc-row', { 'data-row': String(idx) }, [
    itemCell, daysCell, rateCell, totalCell
  ]);
}

/** Build n rows at once, then recalculate and save ONCE. */
function addCalcRow(n = 1) {
  const wrap = document.getElementById('calcRows');
  if (!wrap) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    calcCount++;
    frag.append(buildCalcRow(calcCount));
  }
  wrap.append(frag);
  updateCalc();
  saveCalc();
}

function updateCalc() {
  let total = 0;
  let count = 0;

  document.querySelectorAll('#calcRows .calc-row').forEach((row) => {
    const days = parseNum(row.querySelector('[data-key$="_days"]').value);
    const rate = parseNum(row.querySelector('[data-key$="_rate"]').value);
    const sub = days * rate;

    const subEl = row.querySelector('.total-cell');
    subEl.textContent = fmtINRExact(sub);

    // The item the row is about is now part of the row's meaning:
    // it names the subtotal for assistive tech and shows the rate
    // card's own figure for the picked item, when there is one.
    const name = rowItemName(row);
    row.dataset.item = name;
    subEl.setAttribute('aria-label',
      name ? `Subtotal for ${name}: ${fmtINRExact(sub)}` : `Subtotal: ${fmtINRExact(sub)}`);

    const noteEl = row.querySelector('[data-role="card-rate"]');
    const card = name ? RATE_BY_ITEM.get(name) : null;
    noteEl.textContent = card ? `Rate card ${rates.asOf}: ${card.raw}` : '';

    if (sub > 0) count++;
    total += sub;
  });

  const out = document.getElementById('calcTotal');
  if (!out) return;
  const caption = `across ${count} line item${count !== 1 ? 's' : ''}` +
    // fmtINR's one surviving job: a glance-sized magnitude in a
    // caption that has no room for eight digits.
    (total >= 100000 ? ` · ≈${fmtINR(total)}` : '');
  out.replaceChildren(
    document.createTextNode(fmtINRExact(total) + ' '),
    h('span', { text: caption })
  );
}

function saveCalc() {
  const data = {};
  document.querySelectorAll('#calcRows [data-key]').forEach((el) => {
    data[el.getAttribute('data-key')] = el.value;
  });
  try { localStorage.setItem(CALC_KEY, JSON.stringify(data)); } catch (e) {}
}

function loadCalc() {
  try {
    const data = JSON.parse(localStorage.getItem(CALC_KEY) || '{}');
    let max = 0;
    Object.keys(data).forEach((k) => {
      const m = k.match(/^ci_(\d+)_/);
      if (m) max = Math.max(max, +m[1]);
    });
    const targetRows = Math.max(max, 5);
    // addCalcRow(n) builds n rows and recalculates ONCE. Calling it in a loop
    // ran a full DOM sweep + a localStorage write per row on every page load.
    addCalcRow(targetRows);
    const wrap = document.getElementById('calcRows');
    Object.keys(data).forEach((k) => {
      const el = wrap && wrap.querySelector(`[data-key="${k}"]`);
      if (el) el.value = data[k];
    });
    updateCalc();
  } catch (e) {}
}

function resetCalc() {
  if (!confirm('Clear all calculator rows?')) return;
  try { localStorage.removeItem(CALC_KEY); } catch (e) {}
  const wrap = document.getElementById('calcRows');
  if (wrap) wrap.replaceChildren();
  calcCount = 0;
  addCalcRow(5);
}

function renderCalculator() {
  return h('div.calc-block', {}, [
    h('h3', { text: 'Quick Cost Estimator' }),
    h('p.hint', {
      text: 'Add line items, set days × daily rate, get a running total. ' +
            'Saves to your browser only. Click PRINT to keep a hard copy.'
    }),
    // Column captions for the desk layout. Each field carries its
    // own <label> too, so this strip is decoration to a screen
    // reader and is hidden from it rather than read twice.
    h('div.calc-row.head', { 'aria-hidden': 'true' }, [
      h('span', { text: 'Item' }),
      h('span', { text: 'Days' }),
      h('span', { text: 'Rate (₹/day)' }),
      h('span', { text: 'Subtotal' })
    ]),
    h('div#calcRows'),
    h('div.calc-actions', {}, [
      h('button.mini-btn', { type: 'button', 'data-action': 'add-row', text: '+ ADD ITEM' }),
      h('button.mini-btn', { type: 'button', 'data-action': 'add-5', text: '+ ADD 5' }),
      h('button.mini-btn.danger', { type: 'button', 'data-action': 'reset', text: 'RESET' })
    ]),
    h('div.calc-grand', {}, [
      h('span.lab', { text: 'GRAND TOTAL' }),
      h('span#calcTotal.total', { 'aria-live': 'polite' }, [
        '₹ 0 ', h('span', { text: 'across 0 line items' })
      ])
    ])
  ]);
}

/* ============================================================
   SECTION V — WATCH LIST
   ============================================================ */
function renderWatchlist() {
  return h('section.section-body', {}, watchlist.map((step) => h('div.watch-step', {
    'data-vol': step.vol
  }, [
    // Was a <div class="step-tag"> inside an <a> carrying four
    // inline styles. One element, no inline style, still a link.
    h('a.step-tag', {
      href: `feature.html#${step.step}`,
      title: 'Jump to this step in the blueprint',
      text: `${step.label} ↗`
    }),
    h('h4', { text: step.heading }),
    h('div.watch-films', {}, (step.films || []).map((f) => h('div.watch-film', {}, [
      h('span.title', { text: `${f.title} (${f.year})` }),
      h('span.why', { text: f.why })
    ])))
  ])));
}

/* ============================================================
   FINAL PAGE
   ============================================================ */
function renderFinal() {
  return h('section.final-page', {}, [
    h('p.quote', {}, [
      '"Watch films like a director, not an audience.', h('br'),
      'Then write films like an audience, not a director."'
    ]),
    h('div.signature', {}, ['THE FILMMAKER\'S LIBRARY · CURATED BY ', h('span', { text: 'ARUNAK' })])
  ]);
}

/* ============================================================
   ACTIONS — one delegated listener, zero inline handlers.
   ============================================================ */
function toggleDark() {
  // Delegate to the shared 3-state theme in src/ui/chrome.js — local
  // toggling desynced the page class from StudioUI's stored theme.
  StudioUI.cycleTheme();
}

const ACTIONS = {
  theme: toggleDark,
  print: () => window.print(),
  'add-row': () => addCalcRow(1),
  'add-5': () => addCalcRow(5),
  reset: resetCalc
};

function wireActions(root) {
  delegate(root, 'click', '[data-action]', (e, el) => {
    const fn = ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn();
  });

  // Typing in a row, or picking a preset, recalculates and saves.
  delegate(root, 'input', '.calc-row [data-key]', () => { updateCalc(); saveCalc(); });
  delegate(root, 'change', '.calc-row select[data-key]', () => { updateCalc(); saveCalc(); });
}

/* ============================================================
   THEME — carry the legacy per-page dark pref forward.
   ============================================================ */
function adoptLegacyDarkPref() {
  try {
    if (localStorage.getItem('arunak_studio_theme_v1')) return; // already chosen
    const p = JSON.parse(localStorage.getItem(PREF_KEY) || '{}');
    if (p && p.dark) StudioUI.applyTheme('ink');
  } catch (e) {}
}
function syncThemeButton() {
  const theme = document.body.classList.contains('sepia') ? 'sepia'
              : document.body.classList.contains('dark') ? 'ink'
              : 'paper';
  // applyTheme also updates #darkBtn's glyph, which did not exist
  // when StudioUI ran its own boot.
  StudioUI.applyTheme(theme);
}

/* ============================================================
   BOOT
   ============================================================ */
function render() {
  const app = document.getElementById('app');
  if (!app) return;

  const toolbar = renderToolbar();

  // The toolbar is site chrome, not document content: it sits
  // before <main> so the skip link actually skips it.
  const main = h('main#main', { role: 'main' });
  main.append(renderCover());
  SECTIONS.forEach((s, i) => {
    main.append(renderSectionHead(s, i));
    main.append(s.body());
  });
  main.append(renderFinal());

  app.replaceChildren(toolbar, main);

  wireActions(app);
  adoptLegacyDarkPref();
  syncThemeButton();
  loadCalc();

  // StudioUI boots before this module renders, so the bits of it
  // that look for page furniture get a second, explicit call.
  try {
    StudioUI.attachSignInPill(toolbar);
    StudioUI.autoAriaLabels();
    // The craft rules and film notes are exactly where a term needs
    // explaining; .section-body is in the tagger's scope.
    StudioUI.wireGlossaryPopovers();
  } catch (e) { /* cloud/chrome extras are optional */ }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', render);
} else {
  render();
}
