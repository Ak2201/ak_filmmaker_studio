/* ============================================================
   THE BUDGET — the estimator, as its own thing
   ------------------------------------------------------------
   This lived inside library.js, rendered at the foot of the craft
   library under the Chennai rate tables. That was never quite right
   and the navigation said so out loud: navigation.json listed Budget
   under the PLAN phase pointing at `library.html#calculator`, and no
   element in the app has ever had `id="calculator"`. Clicking Budget
   dropped you at the top of a reference page with no explanation.

   So it moves here, and the library keeps the rate tables and gains
   a link. One representation of one thing: the calculator is not
   rendered in two places sharing one storage key, which would have
   been two DOM trees writing over each other.

   WHAT DELIBERATELY DID NOT CHANGE. `fms_library_calc_v1` and the
   `ci_<n>_item|days|rate|custom` data-key shape are byte-for-byte
   what they were. People have saved estimates behind those strings;
   invariant 1 says they are a contract, and moving a page is not a
   reason to break it. The key keeps its `library` name for the same
   reason — renaming it would orphan every saved estimate, and that
   is a migration, not a rename.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import rates from '../data/rates.chennai.2024.json';
import rateChecks from '../data/rates.chennai.checks.json';
import Scenes, { formatEighths, totalEighths } from '../lib/scenes.js';
import * as Songs from '../lib/songs.js';
import { parseNum, fmtINR, INR } from '../lib/money.js';
import { norm, rowKey } from '../lib/costs.js';

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
const CALC_KEY = 'fms_library_calc_v1';
const PRESET_ITEMS = rates.presets;

let calcCount = 0;

/* Published ranges, keyed loosely enough to survive punctuation
   differences between the preset list and the rate tables. Used
   only to SHOW the card's own figure next to a picked item —
   never to fill a number in on the user's behalf. */
/* THE RATE HINT, AND WHY IT READS TWO FILES.

   rates.chennai.2024.json is the 2024-25 card. A later pass verified
   part of it against a real Chennai rental house and wrote the
   findings to rates.chennai.checks.json, tagging each row `checked`
   or `corroborating` with a source and a date. The library shows
   those; this estimator did not, because it imported the base file
   and nothing else.

   That is the same fault this codebase keeps paying for — one fact,
   two sources, and the stale one on the page people act on. The
   library would say a body was re-checked at 25,000 while the
   calculator beside it still suggested the 2024-25 band.

   A CHECKED row wins. A `corroborating` one does not: it is a second
   vendor agreeing roughly, not a verification, and presenting it as
   one would overstate what was actually confirmed. Anything with no
   overlay row keeps the base figure and keeps saying 2024-25, which
   is honest — most of the card has never been re-checked and the
   page should not imply otherwise. */


const CHECKED_BY_ITEM = (() => {
  const map = new Map();
  for (const row of rateChecks.rows || []) {
    if (row.confidence !== 'checked') continue;
    if (!row.raw) continue;
    if (!map.has(norm(row.item))) map.set(norm(row.item), row);
  }
  return map;
})();

/* `stale` does not mean "an old number". It means somebody went
   looking for a current Chennai rate for this item in the re-check
   pass and did not find one published anywhere — the caveat on each
   row says so in as many words, and the 2024-25 figure stands.

   That absence is information. CLAUDE.md's rates item makes the
   argument for the crew rates and it holds here: a producer is
   better served by "we looked and there is nothing to quote" than by
   a two-year-old number shown as though nobody had asked. The
   library already labels these NOT UPDATED; the estimator was
   showing the figure alone, which is the same fact told less
   honestly. */
const STALE_ITEMS = new Set(
  (rateChecks.rows || [])
    .filter((r) => r.confidence === 'stale')
    .map((r) => norm(r.item))
);

/* THE PRESET NAMES ARE NOT THE TABLE'S NAMES — "Canon C500 II" against
   the table's "Canon C500 Mark II". The map from one to the other,
   PRESET_ROW, and the rowKey() built on it moved to src/lib/costs.js,
   because the cost report needs the same map to put a preset line in
   its rate-card section, and two copies of one map is the drift the
   trap list is about. Nothing about the hint changed. */
const RATE_BY_ITEM = (() => {
  const map = new Map();
  for (const sec of rates.sections) {
    for (const row of sec.rows || []) {
      if (!map.has(norm(row.item))) map.set(norm(row.item), row);
    }
  }
  return { get: (name) => map.get(rowKey(name)) || null };
})();

/* How far BELOW the 2024-25 band a checked figure sits, as a
   multiple, or '' when the two roughly agree.

   The band's LOW end is the fair comparison: if the vendor figure
   clears that, there is nothing to warn about. parseNum takes the
   number at the front of "25,000 – 35,000", which is that low end —
   money.js's whole-string rule, and the reason this needs no second
   parser of its own. */
function bandGap(card, checked) {
  const low = parseNum(card.raw);
  const now = Number(checked.value);
  if (!low || !now || low <= now * 1.5) return '';
  const x = low / now;
  return x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
}

/** The rate hint for a line: BOTH figures, when the card has one. */
/* A CHECKED figure joins the card's band, it does not replace it.

   This returned the checked figure alone, which is precisely the
   trap CLAUDE.md's rates item names two paragraphs above the line
   that asked for this file to read the overlay at all: the 2026
   vendor figures run about 3x BELOW the 2024-25 ranges — Alexa Mini
   at 8,000 against a 25,000–35,000 band, Komodo at 4,500 against
   15,000–22,000 — probably body-versus-package, but unconfirmed. A
   hint showing only the lower one anchors the user to it on the
   single biggest line in a shoot.

   It never autofilled, which is the only reason this was a
   misleading note and not a wrong total. The library had it right
   already, because it renders the check rows BESIDE the card row
   rather than over it. The estimator is the page people actually
   type numbers into, and it was the one replacing. */
function rateHint(name) {
  if (!name) return '';
  const key = rowKey(name);
  const card = RATE_BY_ITEM.get(name);
  const checked = CHECKED_BY_ITEM.get(key);

  if (checked) {
    const head = `Checked ${checked.checked}: ${checked.raw}`;
    if (!card) return head;
    const both = `${head} · card ${rates.asOf} said ${card.raw}`;
    const gap = bandGap(card, checked);
    return gap
      ? `${both} — about ${gap}x more. The checked figure is one vendor's list `
        + `price and may be body-only; budget the band until you have confirmed `
        + `what it includes.`
      : both;
  }

  if (!card) return '';
  return STALE_ITEMS.has(key)
    ? `Rate card ${rates.asOf}: ${card.raw} · no current Chennai rate found`
    : `Rate card ${rates.asOf}: ${card.raw}`;
}

/** Legacy behaviour, unchanged: "2.5", "1,20,000", "₹18k", "2L". */
/* parseNum / fmtINR / INR moved to src/lib/money.js — hub.js had a
   second, still-unanchored copy of this parser and the dashboard now
   makes three. The anchoring rule and the trap it guards are
   documented there. */
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
/* `persist` exists because LOADING MUST NEVER WRITE.

   This function ends by saving, which is right when a person clicks
   ADD ROW — the new empty line should survive a reload. It was
   catastrophic from loadCalc(), which called it BEFORE putting the
   saved values back on the page: the save wrote the freshly built
   EMPTY rows straight over fms_library_calc_v1, and the restore that
   followed only ever touched the DOM. So the page looked correct and
   storage did not. Open budget.html, touch nothing, navigate away,
   and the estimate was gone on the next load — the figures came back
   only if you happened to edit a field, because that is what wrote
   the DOM back.

   Found while seeding a sample project: the dashboard read
   "₹ 25,65,000 across 12 line items" before visiting the budget page
   and "₹ 0 · Nothing costed yet" after it.

   The idle-write assertion in `verify` cannot see this. It measures
   four seconds of QUIET AFTER LOAD, and this write happens during
   load, inside the same turn that builds the rows. */
function addCalcRow(n = 1, persist = true) {
  const wrap = document.getElementById('calcRows');
  if (!wrap) return;
  const frag = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    calcCount++;
    frag.append(buildCalcRow(calcCount));
  }
  wrap.append(frag);
  updateCalc();
  if (persist) saveCalc();
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
    noteEl.textContent = rateHint(name);

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
    // persist:false because the rows are EMPTY at this point and the saved
    // values go on below — saving here overwrote them. See addCalcRow.
    addCalcRow(targetRows, false);
    const wrap = document.getElementById('calcRows');
    if (!wrap) return;

    /* ASSIGNING TO A <select> IS NOT LIKE ASSIGNING TO AN <input>.
       `el.value = x` on a select with no matching <option> silently
       sets it to '' — no throw, no warning. The item field IS a
       select, built from the 52 Chennai presets, so any saved item
       that is not one of them landed as blank and the next save
       wrote that blank straight back over the stored name. Days and
       rate survived, because they are plain inputs; only the label
       of the line was destroyed, which is the part that says what
       you were paying for.

       The custom-name field is exactly the right home for those, so
       an unrecognised item is rescued into it rather than dropped.
       Verified against a real case: "Bolex reversal stock - 3 rolls"
       used to come back empty and now round-trips. */
    const presets = new Set(PRESET_ITEMS);
    const rescued = {};
    Object.keys(data).forEach((k) => {
      const m = k.match(/^ci_(\d+)_item$/);
      const v = data[k];
      if (!m || !v || presets.has(v)) return;
      rescued[`ci_${m[1]}_custom`] = v;
    });

    Object.keys(data).forEach((k) => {
      const el = wrap.querySelector(`[data-key="${k}"]`);
      if (!el) return;
      // A rescued name owns its custom field, unless the user had
      // already typed something there — their text wins.
      if (rescued[k] && !String(data[k] || '').trim()) { el.value = rescued[k]; return; }
      if (/^ci_\d+_item$/.test(k) && el.tagName === 'SELECT' && !presets.has(data[k])) return;
      el.value = data[k];
    });
    Object.keys(rescued).forEach((k) => {
      const el = wrap.querySelector(`[data-key="${k}"]`);
      if (el && !String(el.value || '').trim()) el.value = rescued[k];
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

/* ------------------------------------------------------------
   THE SCHEDULE → BUDGET LINK
   ------------------------------------------------------------
   The estimator has always asked "how many days?" and left the user
   to know. The stripboard already knows: scenes carry an integer
   shootDay, and the scene model carries locations and page eighths.
   Until now those were two islands — you could add a shoot day on the
   stripboard and the number in the calculator would not move, which
   made the schedule a drawing rather than a plan.

   Derived on every render, stored nowhere. The scene model is the one
   representation; a copy of the day count in the calculator's own
   storage would be the second, and the two would disagree by the end
   of the week.
   ------------------------------------------------------------ */
function scheduleFacts() {
  let scenes = [];
  try { scenes = Scenes.listScenes(); } catch (e) { scenes = []; }
  const dayOf = (s) => { const n = parseInt(s.shootDay, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
  const scheduled = scenes.filter((s) => dayOf(s) > 0);
  const days = new Set(scheduled.map(dayOf));
  /* Song days the scene count CANNOT see.
     A song is usually planned long before its scenes exist, so its
     days live on the song row. Counting every song's days on top of
     the scene-derived total would double-count any song whose scenes
     ARE already on the board, so only songs with no scheduled scenes
     contribute. Without this a four-song film budgets its shoot
     several days short and nothing on the page says why. */
  let songs = [];
  try { songs = Songs.listSongs(); } catch (e) { songs = []; }
  let songDaysUncounted = 0;
  let songsUncounted = 0;
  for (const sg of songs) {
    const f = Songs.songFacts(sg, scenes);
    if (f.scriptDays > 0) continue;        // already inside days.size
    if (f.plannedDays > 0) {
      songDaysUncounted += f.plannedDays;
      songsUncounted += 1;
    }
  }

  return {
    totalScenes: scenes.length,
    scheduled: scheduled.length,
    unscheduled: scenes.length - scheduled.length,
    days: days.size,
    locations: new Set(scenes.map((s) => (s.location || '').trim()).filter(Boolean)).size,
    pages: formatEighths(totalEighths(scenes)),
    songCount: songs.length,
    songDaysUncounted,
    songsUncounted,
    // what the estimate should actually use
    totalDays: days.size + songDaysUncounted
  };
}

function renderScheduleLink() {
  const f = scheduleFacts();
  const box = h('div.calc-block.calc-schedule');
  box.append(h('h3', { text: 'From your schedule' }));

  if (!f.totalScenes) {
    box.append(h('p.hint', {
      text: 'No scenes yet. Break the script down first and this fills itself in — '
          + 'the estimator can then use your real shoot-day count instead of a guess.'
    }));
    box.append(h('a.mini-btn', { href: './breakdown.html#scenes', text: 'GO TO THE BREAKDOWN' }));
    return box;
  }

  box.append(h('div.bd-stats', {}, [
    h('div.bd-stat', {}, [h('strong', { text: String(f.days) }), h('span', { text: 'shoot days' })]),
    h('div.bd-stat', {}, [h('strong', { text: String(f.totalScenes) }), h('span', { text: 'scenes' })]),
    h('div.bd-stat', {}, [h('strong', { text: f.pages }), h('span', { text: 'pages' })]),
    h('div.bd-stat', {}, [h('strong', { text: String(f.locations) }), h('span', { text: 'locations' })])
  ]));

  if (!f.days) {
    box.append(h('p.hint', {
      text: 'None of these scenes has a shoot day yet. Assign days on the stripboard '
          + 'and the estimator can use the real count.'
    }));
    box.append(h('a.mini-btn', { href: './stripboard.html#stripboard', text: 'SCHEDULE ON THE STRIPBOARD' }));
    return box;
  }

  box.append(h('p.hint', {
    text: f.unscheduled
      ? f.days + ' scheduled day' + (f.days === 1 ? '' : 's') + ', with ' + f.unscheduled
        + ' scene' + (f.unscheduled === 1 ? '' : 's') + ' still unscheduled — so this is a floor, not the final count.'
      : 'Every scene has a day. This is your shoot length.'
  }));

  /* Song days are listed separately rather than folded in silently,
     because the number they change is the one the whole estimate
     scales on, and a day count that grew without saying why is a day
     count nobody trusts. */
  if (f.songDaysUncounted) {
    box.append(h('p.hint', {
      text: 'Plus ' + f.songDaysUncounted
        + (f.songDaysUncounted === 1 ? ' day' : ' days') + ' for '
        + f.songsUncounted + (f.songsUncounted === 1 ? ' song' : ' songs')
        + ' whose scenes are not on the board yet. Songs are planned before their '
        + 'scenes exist, so the scene count cannot see those days — '
        + f.totalDays + ' is the figure to budget.'
    }));
  }
  box.append(h('div.calc-actions', {}, [
    h('button.mini-btn', {
      type: 'button', 'data-action': 'use-shoot-days', 'data-days': String(f.totalDays),
      text: 'USE ' + f.totalDays + ' DAYS IN THE ESTIMATE'
    })
  ]));
  return box;
}

function renderCalculator() {
  return h('div.calc-block', {}, [
    h('h3', { text: 'Quick Cost Estimator' }),
    h('p.hint', {
      text: 'Add line items, set days × daily rate, get a running total. ' +
            'Saves to your browser only. Click PRINT to keep a hard copy.'
      /* The copy has said "Click PRINT" since the legacy page, and the
         page had no PRINT button — the legacy one lived on the library
         toolbar and did not move with the estimator. print.css already
         lays the calculator out for paper, so the button is the fix. */
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
      h('button.mini-btn', { type: 'button', 'data-action': 'print', text: 'PRINT' }),
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


/* ------------------------------------------------------------
   THE PUBLIC SURFACE
   ------------------------------------------------------------
   Two calls, because the order matters and getting it wrong is
   silent: the rows have to exist in the DOM before loadCalc() can
   put saved values into them.
   ------------------------------------------------------------ */

/** The estimator and the schedule link, as one block. */
export function renderBudget() {
  const frag = document.createDocumentFragment();
  frag.append(renderScheduleLink());
  frag.append(renderCalculator());
  return frag;
}

/** Fill it from storage and wire it. Call AFTER renderBudget() is in the page. */
export function initBudget(root) {
  loadCalc();
  delegate(root, 'click', '[data-action]', (e, el) => {
    const fn = BUDGET_ACTIONS[el.dataset.action];
    if (!fn) return;
    e.preventDefault();
    fn(el, e);
  });
  // Recompute on every keystroke, save on every change. The save is
  // the debounced one inside saveCalc(); this is not the save loop.
  delegate(root, 'input', '.calc-row [data-key]', () => { updateCalc(); saveCalc(); });
  delegate(root, 'change', '.calc-row select[data-key]', () => { updateCalc(); saveCalc(); });
}

export const BUDGET_ACTIONS = {
  'add-row': () => addCalcRow(1),
  'add-5': () => addCalcRow(5),
  reset: resetCalc,
  print: () => window.print(),
  'use-shoot-days': (el) => {
    const days = parseInt(el && el.dataset ? el.dataset.days : '', 10);
    if (!Number.isFinite(days) || days <= 0) return;
    /* Fill EMPTY day fields only. A line already priced at three days
       is someone's decision — a schedule that silently overwrote it
       would be worse than no link at all. Rows that were set by hand
       are reported as left alone rather than quietly skipped. */
    /* ...and only on LINES. The page opens with five blank rows, and
       filling those turned "USE 18 DAYS" into five nameless lines at
       18 days that the toast then counted as lines set. A row is a
       line once it names an item or carries a rate; a blank one is
       left blank, and counted as nothing. */
    const rows = [...document.querySelectorAll('#calcRows .calc-row')].filter((row) => {
      const rate = row.querySelector('[data-key$="_rate"]');
      return rowItemName(row) || (rate && String(rate.value).trim());
    });
    const fields = rows.map((row) => row.querySelector('[data-key$="_days"]')).filter(Boolean);
    let filled = 0, kept = 0;
    fields.forEach((f) => {
      if (String(f.value).trim()) { kept++; return; }
      f.value = String(days);
      f.dispatchEvent(new Event('input', { bubbles: true }));
      filled++;
    });
    updateCalc();
    saveCalc();
    const msg = !fields.length
      ? 'Pick an item or set a rate on a line first, then this fills its days.'
      : filled
        ? filled + ' line' + (filled === 1 ? '' : 's') + ' set to ' + days + ' days'
          + (kept ? '; ' + kept + (kept === 1 ? ' you had already set was' : ' you had already set were') + ' left alone.' : '.')
        : 'Every line already has days set — nothing was overwritten.';
    if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, { type: 'info', duration: 4000 });
  }
};

export default { renderBudget, initBudget, BUDGET_ACTIONS };
