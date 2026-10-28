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
import { parseAmount, fmtMoney, fmtINR } from '../lib/money.js';
import {
  PRESET_ITEMS, readCalcData, saveCalcData, clearCalcData, maxRowIndex, rescuedCustomNames,
  rateHintParts, itemNameOf, totalCaption, useDaysMessage, rowEquation,
  scheduleFacts, scheduleHint, songDaysHint,
  budgetCurrency, setBudgetCurrency, currencyMismatch, fmtExact, currencySign
} from '../lib/budget-model.js';
import C, { readAll as readCosts, calcHasContent, costsHasContent, projectCurrency } from '../lib/costs.js';
import { highestLineIndex, rowSpan } from '../lib/budget-line-ids.js';
import { ask, askDanger } from './dialog.js';
import { brandPrint } from './footer.js';   // CORE: the "Made with" line on a plain print
import { revealTarget } from './tabs.js';
import { button, badge, sym } from './kit/index.js';

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
/* The key, the presets and the rate hint live in src/lib/budget-model.js. */
let calcCount = 0;

/* THE BUDGET'S CURRENCY, read once per render (budgetCurrency() in
   budget-model.js; the rule is in costs.js). 'INR' draws, parses and
   prints exactly what this page always did; 'USD' swaps the sign, the
   parser (money.js parseAmount) and the rate hints (rates.us.json). */
let cur = 'INR';
const sign = () => currencySign(cur);
const money = (n) => fmtExact(n, cur);
const amount = (s) => parseAmount(s, cur);

/** The item this row is actually about: custom name wins, then preset. */
function rowItemName(row) {
  const custom = row.querySelector('[data-key$="_custom"]');
  const select = row.querySelector('[data-key$="_item"]');
  return itemNameOf(custom && custom.value, select && select.value);
}

/* Every row's fields read the same, so a screen reader hears 'Days' five
   times; a visually hidden ', line N' names the row (idx is 1-based). */
const rowHint = (idx) => h('span.visually-hidden', { text: ', line ' + idx });

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

  /* Each native control sits in the kit's `.k-control` frame (the
     border, the focus ring, the select chevron); the control itself
     and its data-key are exactly what they were. Days and rate are
     figures, so their frames are the mono variant. */
  const frame = (el, mono) => {
    if (el.tagName !== 'SELECT') el.classList.add('k-input');
    return h('div.k-control' + (el.tagName === 'SELECT' ? '.k-select' : '') + (mono ? '.k-control--mono' : ''), {}, [el]);
  };

  const itemCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.item }, ['Item', rowHint(idx)]),
    frame(select),
    h('label.calc-label', { for: ids.custom }, ['Custom item name', rowHint(idx)]),
    frame(h('input', {
      id: ids.custom, type: 'text', 'data-key': ids.custom,
      placeholder: 'or type your own…', autocomplete: 'off'
    }))
  ]);

  const daysCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.days }, ['Days', rowHint(idx)]),
    frame(h('input', {
      id: ids.days, type: 'text', inputmode: 'decimal',
      'data-key': ids.days, placeholder: 'Days', autocomplete: 'off'
    }), true)
  ]);

  const rateCell = h('div.calc-cell', {}, [
    h('label.calc-label', { for: ids.rate }, ['Rate (' + sign() + ' per day)', rowHint(idx)]),
    frame(h('input', {
      id: ids.rate, type: 'text', inputmode: 'decimal',
      'data-key': ids.rate, placeholder: sign() + '/day', autocomplete: 'off'
    }), true),
    h('span.calc-note', { 'data-role': 'card-rate' })
  ]);

  // The subtotal is output, not a field, so its caption is a plain
  // <span> rather than a <label for> — but it hides and shows with
  // the others, so the phone layout never shows a bare number box.
  const totalCell = h('div.calc-cell', {}, [
    h('span.calc-label', { text: 'Subtotal' }),
    h('span.total-cell.k-mono', { id: `ci_${idx}_subtotal`, text: money(0) }),
    /* days × rate, spelled out: the phone's card drops the column
       captions, so the sum behind the figure is said once, here.
       Derived from the two fields every update; hidden when empty and
       at desk widths, where the columns already show both. */
    h('span.calc-eq.k-mono', { 'data-role': 'calc-eq', 'aria-hidden': 'true' })
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
  const first = frag.firstElementChild;
  wrap.append(frag);
  updateCalc();
  if (persist) saveCalc();
  return first;
}

/* A row added from a button lands at the foot of a long list — the
   header's "New cost line" is 2,000px above it, and may be pressed from
   another tab — so nothing seemed to happen. The new row's item field
   takes the focus and comes into view. */
function focusNewRow(row) {
  if (!row) return;
  revealTarget('calcRows');
  const field = row.querySelector('select, input');
  if (field) field.focus({ preventScroll: true });
  row.scrollIntoView({ block: 'center', behavior: 'instant' });
}

function updateCalc() {
  let total = 0;
  let count = 0;

  document.querySelectorAll('#calcRows .calc-row').forEach((row) => {
    const dEl = row.querySelector('[data-key$="_days"]');
    const rEl = row.querySelector('[data-key$="_rate"]');
    const rawDays = amount(dEl.value);
    const rawRate = amount(rEl.value);
    // A negative figure is flagged and counts as nothing (costs.js reads it the same way).
    dEl.setAttribute('aria-invalid', rawDays < 0 ? 'true' : 'false');
    rEl.setAttribute('aria-invalid', rawRate < 0 ? 'true' : 'false');
    const days = Math.max(0, rawDays);
    const rate = Math.max(0, rawRate);
    const sub = days * rate;
    row.toggleAttribute('data-blank', !sub && !rowItemName(row));

    const subEl = row.querySelector('.total-cell');
    subEl.textContent = money(sub);

    // The item the row is about is now part of the row's meaning:
    // it names the subtotal for assistive tech and shows the rate
    // card's own figure for the picked item, when there is one.
    const name = rowItemName(row);
    row.dataset.item = name;
    subEl.setAttribute('aria-label',
      name ? `Subtotal for ${name}: ${money(sub)}` : `Subtotal: ${money(sub)}`);

    const eqEl = row.querySelector('[data-role="calc-eq"]');
    if (eqEl) eqEl.textContent = rowEquation(days, rate, money);

    /* The hint names where the figure came from; a re-checked one
       links the page it was read off (rateHintParts). Rebuilt only
       when it changes, so typing a rate does not churn the link. */
    const noteEl = row.querySelector('[data-role="card-rate"]');
    const hint = rateHintParts(name, cur);
    const sig = hint.text + '|' + (hint.source ? hint.source.url : '');
    if (noteEl.dataset.sig !== sig) {
      noteEl.dataset.sig = sig;
      noteEl.replaceChildren(...(hint.text ? [hint.text] : []), ...(hint.source ? [
        ' · ',
        h('a', { href: hint.source.url, target: '_blank', rel: 'noopener noreferrer', text: 'source' })
      ] : []));
    }

    if (sub > 0) count++;
    total += sub;
  });

  // The panel head's count: priced lines, counted, not rows on screen.
  const badgeEl = document.getElementById('calcLines');
  if (badgeEl) badgeEl.lastChild.textContent = count + (count === 1 ? ' priced line' : ' priced lines');

  const out = document.getElementById('calcTotal');
  if (!out) return;
  const caption = totalCaption(total, count, cur === 'USD' ? (n) => fmtMoney(n, 'USD', true) : fmtINR);
  out.replaceChildren(
    document.createTextNode(money(total) + ' '),
    h('span', { text: caption })
  );
}

function saveCalc() {
  const data = {};
  document.querySelectorAll('#calcRows [data-key]').forEach((el) => {
    data[el.getAttribute('data-key')] = el.value;
  });
  saveCalcData(data);
}

function loadCalc() {
  try {
    const data = readCalcData();   // throws on a corrupt blob, which the catch below swallows
    // Rows are drawn from the blob's LOWEST row number, not from 1: after
    // a reset the rows start above every id ever used (see resetCalc), and
    // drawing empty rows 1..n here would hand those ids out again. A blob
    // that starts at ci_1 — every estimate saved before this — draws as
    // it always did. maxRowIndex is still the top of the span.
    const span = rowSpan(data, 5);
    const targetRows = Math.max(span.count, maxRowIndex(data) - span.start + 1);
    calcCount = span.start - 1;
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
    const rescued = rescuedCustomNames(data, presets);

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

async function resetCalc() {
  if (!await askDanger('Clear all calculator rows?')) return;
  // A row number is a line's identity in fms_costs_v1 (expenses, crew,
  // department moves, locked versions). Counting from 1 again would bind
  // the old camera spend to whatever new item lands in row 3, so the new
  // rows start above every id either blob names. Read BEFORE clearing.
  let high = 0;
  try { high = highestLineIndex(readCalcData(), readCosts()); } catch (e) { high = calcCount; }
  clearCalcData();
  /* A cleared estimate is a new budget, and a new budget follows the
     film. When that moves its currency, every label on the page is
     wrong, so the page is drawn again rather than patched. */
  if (budgetCurrency() !== cur) { location.reload(); return; }
  const wrap = document.getElementById('calcRows');
  if (wrap) wrap.replaceChildren();
  calcCount = Math.max(high, calcCount);
  addCalcRow(5);
  // The cost tabs, header figures and petty-cash lines read the cleared blob now.
  document.dispatchEvent(new CustomEvent('budget:calc-cleared'));
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
/* scheduleFacts() is src/lib/budget-model.js's. */

/* THE PIPELINE CONNECTOR — the stripboard's facts as one band: a kit
   panel with an accent rule, the four counts as mono facts, and the
   one action. `calc-block` stays on it because print.css lays the
   estimate out for paper by that name. */
function connector(body) {
  return h('div.calc-block.calc-schedule.k-panel.bud-link', {}, [
    h('span.bud-link-icon', { 'aria-hidden': 'true' }, [sym('calendar_month')]),
    h('div.bud-link-copy', {}, [
      h('p.k-eyebrow', { text: 'Live from the stripboard' }),
      h('h3.bud-link-title', { text: 'From your schedule' })
    ]),
    ...body
  ]);
}
const fact = (value, label) => h('div.bud-fact', {}, [h('dt', { text: label }), h('dd.k-mono', { text: value })]);

function renderScheduleLink() {
  const f = scheduleFacts();

  if (!f.totalScenes) {
    return connector([
      h('p.hint', {
        text: 'No scenes yet. Break the script down first and this fills itself in — '
            + 'the estimator can then use your real shoot-day count instead of a guess.'
      }),
      h('div.calc-actions', {}, [button({ label: 'Go to the breakdown', icon: 'arrow_forward', href: './breakdown.html#scenes', size: 'sm' })])
    ]);
  }

  const facts = h('dl.bud-facts', {}, [
    fact(String(f.days), 'shoot days'),
    fact(String(f.totalScenes), 'scenes'),
    fact(f.pages, 'pages'),
    fact(String(f.locations), 'locations')
  ]);

  if (!f.days) {
    return connector([
      facts,
      h('p.hint', {
        text: 'None of these scenes has a shoot day yet. Assign days on the stripboard '
            + 'and the estimator can use the real count.'
      }),
      h('div.calc-actions', {}, [button({ label: 'Schedule on the stripboard', icon: 'arrow_forward', href: './stripboard.html#stripboard', size: 'sm' })])
    ]);
  }

  const hints = [h('p.hint', { text: scheduleHint(f) })];

  /* Song days are listed separately rather than folded in silently,
     because the number they change is the one the whole estimate
     scales on, and a day count that grew without saying why is a day
     count nobody trusts. */
  if (f.songDaysUncounted) hints.push(h('p.hint', { text: songDaysHint(f) }));
  return connector([
    facts,
    h('div.calc-actions', {}, [
      button({
        label: 'Use ' + f.totalDays + ' days in the estimate', icon: 'sync_alt', size: 'sm',
        action: 'use-shoot-days', attrs: { 'data-days': String(f.totalDays) }
      })
    ]),
    ...hints
  ]);
}

/* THE CURRENCY NOTE — only when the budget's currency is not the
   film's AND the budget has money in it (an empty budget simply
   follows the film). A budget is never converted or relabelled by a
   change of region; this is the one deliberate way to relabel it, and
   it changes the LABEL only: 25,000 stays 25,000. Returns null (which
   h() skips) when there is nothing to say, so a rupee budget on an
   Indian film draws exactly what it always did. */
function currencyNote() {
  const film = projectCurrency();
  let hasMoney = false;
  try { hasMoney = calcHasContent(readCalcData()) || costsHasContent(C.readAll()); } catch (e) { hasMoney = false; }
  const text = currencyMismatch(cur, film, hasMoney);
  if (!text) return null;
  return h('div.bud-cur', { role: 'note' }, [
    h('p.hint', { text }),
    button({
      label: 'Label this budget in ' + currencySign(film), icon: 'sync_alt', size: 'sm', variant: 'ghost',
      action: 'budget-currency', attrs: { 'data-cur': film }
    })
  ]);
}

function renderCalculator() {
  const head = h('div.k-panel-head', {}, [
    h('h3.k-panel-title', { text: 'Quick Cost Estimator' }),
    h('div.k-panel-meta', {}, [badge({ label: '0 priced lines', tag: true, attrs: { id: 'calcLines' } })])
  ]);
  return h('div.calc-block.k-panel.bud-est', {}, [
    head,
    h('div.k-panel-body.bud-est-body', {}, [
      h('p.hint', {
        text: 'Add line items, set days × daily rate, get a running total. ' +
              'Saves in this browser, and with the rest of the project when you are ' +
              'signed in and syncing. Click PRINT to keep a hard copy.'
        /* It said "Saves to your browser only", which stopped being true
           when fms_library_calc_v1 got the `library` sync scope (cloud.js
           SCOPE_BY_KEY): for a signed-in member it reaches the project's
           server copy like every other module. */
        /* The copy has said "Click PRINT" since the legacy page, and the
           page had no PRINT button — the legacy one lived on the library
           toolbar and did not move with the estimator. print.css already
           lays the calculator out for paper, so the button is the fix. */
      }),
      /* WHO SEES IT. The estimate (`library` scope) and the cost tabs
         (`costs`) are project_data rows, and pd_select admits anyone
         has_project_access(…, 'view') admits: the owner, an unexpired
         collaborator at ANY role (a view link included) and the
         owner/admin of the project's account; pd_write needs 'edit'.
         screening_open() returns story/feature/short/scenes only.
         Schema §55 adds the owner's "Keep the budget private" switch
         (budget-privacy-ui.js puts it right after this line): on, the
         two budget scopes need the owner or an edit link (not even an
         organisation admin). The blueprint's budget answers sit in the
         'feature' / 'short' scopes, which a screening pass does open,
         so the sentence says they are not covered. Said here because a budget is the one module people assume is
         private and is not. */
      /* Behind a disclosure since 28 Oct 2026 (one sentence of
         essentials on screen); the summary names the question so a
         reader who wants it finds it, and the words are unchanged. */
      h('details.bud-who', {}, [h('summary', { text: 'Who can see this budget?' }), h('p.hint', {
        text: 'Once it syncs, anyone you share this project with can see the budget, '
            + 'a view-only link included, and only an edit link lets them change it, '
            + 'unless you keep the budget private: then only you and people with an '
            + 'edit link can see it. A screening pass does not show it. Figures typed '
            + 'into the blueprint\u2019s budget questions are not part of this page '
            + 'and stay visible to anyone you share the film with, a screening pass included.'
      })]),
      currencyNote(),
      // Column captions for the desk layout. Each field carries its
      // own <label> too, so this strip is decoration to a screen
      // reader and is hidden from it rather than read twice.
      h('div.calc-row.head', { 'aria-hidden': 'true' }, [
        h('span', { text: 'Item' }),
        h('span', { text: 'Days' }),
        h('span', { text: 'Rate (' + sign() + '/day)' }),
        h('span', { text: 'Subtotal' })
      ]),
      h('div#calcRows'),
      h('div.calc-actions', {}, [
        button({ label: 'Add item', icon: 'add', size: 'sm', action: 'add-row' }),
        button({ label: 'Add 5', icon: 'add', size: 'sm', action: 'add-5' }),
        h('span.bud-spacer', { 'aria-hidden': 'true' }),
        button({ label: 'Print', icon: 'print', size: 'sm', variant: 'ghost', action: 'print' }),
        button({ label: 'Reset', icon: 'restart_alt', size: 'sm', variant: 'danger', action: 'reset' })
      ])
    ]),
    h('div.calc-grand', {}, [
      h('span.lab', { text: 'ESTIMATE TOTAL' }),
      h('span#calcTotal.total', { 'aria-live': 'polite' }, [
        money(0) + ' ', h('span', { text: 'across 0 line items' })
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
  cur = budgetCurrency();
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
  'add-row': () => focusNewRow(addCalcRow(1)),
  'add-5': () => focusNewRow(addCalcRow(5)),
  reset: resetCalc,
  print: () => { const off = brandPrint(); try { window.print(); } finally { setTimeout(off, 1000); } },
  'budget-currency': async (el) => {
    const want = el && el.dataset ? el.dataset.cur : '';
    if (!want || want === cur) return;
    const ok = await ask({
      title: 'Label this budget in ' + currencySign(want) + '?',
      body: 'Every figure keeps its number and only the currency sign changes: '
        + money(25000) + ' becomes ' + fmtExact(25000, want) + '. Nothing is converted. A figure typed with a suffix (1.5L, 2cr, 2m, 1.5k) is written out in full first, so it keeps its number.',
      confirm: 'Relabel'
    });
    if (!ok || !setBudgetCurrency(want)) return;
    location.reload();
  },
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
    const msg = useDaysMessage(fields.length, filled, kept, days);
    if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, { type: 'info', duration: 4000 });
  }
};

export default { renderBudget, initBudget, BUDGET_ACTIONS };
