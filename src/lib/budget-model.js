/* ============================================================
   BUDGET MODEL — the estimator's storage and its arithmetic
   ------------------------------------------------------------
   The view (src/ui/budget.js, src/pages/budget.js) draws the
   estimator; this file owns everything about it that needs no DOM:

     - the stored rows, under `fms_library_calc_v1` (the key itself is
       costs.js's CALC_KEY, one string for every reader). The
       `ci_<n>_item|custom|days|rate` shape is unchanged, byte for byte
       — people have saved estimates behind it.
     - the rate hint for a picked item, read from BOTH the 2024-25 card
       and the re-check overlay (see the long note at rateHint()).
     - the schedule's facts the estimator offers to use.
     - the provenance sentence the budget page prints over the tables.

   Storage goes through prefs.js, which goes through the same
   Storage.prototype the page always used, so store.js's project proxy
   scopes the key exactly as before.
   ============================================================ */
import { readText, writeJSON, removeKey } from './prefs.js';
import rates from '../data/rates.chennai.2024.json';
import rateChecks from '../data/rates.chennai.checks.json';
import Scenes, { formatEighths, totalEighths } from './scenes.js';
import * as Songs from './songs.js';
import { parseNum, INR, USD, fmtMoney } from './money.js';
import C, {
  norm, rowKey, CALC_KEY, CALC_CURRENCY, calcHasContent, resolveCurrency, projectCurrency,
  budgetCurrency as costsBudgetCurrency
} from './costs.js';
import { normaliseCurrency } from './region-core.js';
import usRates from '../data/rates.us.json';

export { CALC_KEY, CALC_CURRENCY };
export const PRESET_ITEMS = rates.presets;

/* ---- storage ------------------------------------------------- */

/** The saved rows as one flat object. THROWS on a stored value that is
    not JSON, as the estimator's loader always did: its caller wraps the
    whole restore in one try, and a corrupt blob restores nothing rather
    than half of something. */
export function readCalcData() {
  return JSON.parse(readText(CALC_KEY, null) || '{}');
}

/** Write the rows. A failed write is swallowed, as it always was.
    The budget's currency (`ci_currency`, see THE BUDGET'S CURRENCY in
    costs.js) rides along: a caller that did not name one keeps the
    stored word, and the first write that puts a figure into an empty
    estimate fixes it from the film. A legacy estimate (money, no word)
    is left without one, which reads as INR. */
export function saveCalcData(data) {
  writeJSON(CALC_KEY, withCurrency(data));
}

function withCurrency(data) {
  if (!data || typeof data !== 'object' || normaliseCurrency(data[CALC_CURRENCY])) return data;
  let prev = {};
  try { prev = readCalcData() || {}; } catch (e) { prev = {}; }
  const kept = normaliseCurrency(prev[CALC_CURRENCY]);
  if (kept) return { ...data, [CALC_CURRENCY]: kept };
  if (!calcHasContent(data) || calcHasContent(prev)) return data;
  return { ...data, [CALC_CURRENCY]: resolveCurrency({ calc: prev, costs: C.readAll(), project: projectCurrency() }) };
}

/** The open budget's currency: 'INR' | 'USD'. Reading never writes. */
export const budgetCurrency = costsBudgetCurrency;

/** Relabel the budget (BOTH records) as `cur`. The figures are not
    touched: nothing in the studio converts between currencies. A
    press only (the budget page's switch), never on load. */
export function setBudgetCurrency(cur) {
  const want = normaliseCurrency(cur);
  if (!want) return false;
  let data = {};
  try { data = readCalcData() || {}; } catch (e) { return false; }
  writeJSON(CALC_KEY, { ...data, [CALC_CURRENCY]: want });
  C.setSettings({ currency: want });
  return true;
}

/** The sentence when the budget's currency is not the film's, or ''.
    Only for a budget with money in it: an empty one simply follows the
    film. */
export function currencyMismatch(budgetCur, filmCur, hasMoney) {
  if (!hasMoney || !budgetCur || !filmCur || budgetCur === filmCur) return '';
  return budgetCur === 'INR'
    ? 'This budget is in ₹, the film is set to US. Nothing was converted.'
    : 'This budget is in $, the film is set to India. Nothing was converted.';
}

/** A figure in the budget's currency, exact. INR is fmtINRExact, unchanged. */
export const fmtExact = (n, cur) => (cur === 'USD' ? fmtMoney(n, 'USD') : fmtINRExact(n));
/** The currency's sign, for labels: '₹' or '$'. */
export const currencySign = (cur) => (cur === 'USD' ? '$' : '₹');

/** Forget every row (the estimator's Reset). */
export function clearCalcData() {
  removeKey(CALC_KEY);
}

/** The highest row number any saved key names (`ci_<n>_…`). */
export function maxRowIndex(data) {
  let max = 0;
  Object.keys(data).forEach((k) => {
    const m = k.match(/^ci_(\d+)_/);
    if (m) max = Math.max(max, +m[1]);
  });
  return max;
}

/** Saved item names that are not one of the presets, as the custom-name
    key they belong under: `{ ci_<n>_custom: name }`. The item field is a
    <select> of the presets, and assigning a value it has no <option> for
    silently blanks it — so an unrecognised name is rescued into the
    custom field rather than dropped (see loadCalc() in src/ui/budget.js). */
export function rescuedCustomNames(data, presets = new Set(PRESET_ITEMS)) {
  const rescued = {};
  Object.keys(data).forEach((k) => {
    const m = k.match(/^ci_(\d+)_item$/);
    const v = data[k];
    if (!m || !v || presets.has(v)) return;
    rescued[`ci_${m[1]}_custom`] = v;
  });
  return rescued;
}

/* ---- the rate hint -------------------------------------------- */

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
   PRESET_ROW, and the rowKey() built on it live in src/lib/costs.js,
   because the cost report needs the same map to put a preset line in
   its rate-card section, and two copies of one map is the drift the
   trap list is about. */
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
export function bandGap(card, checked) {
  const low = parseNum(card.raw);
  const now = Number(checked.value);
  if (!low || !now || low <= now * 1.5) return '';
  const x = low / now;
  return x >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, '');
}

/** The rate hint for a line: BOTH figures, when the card has one. */
/* A CHECKED figure joins the card's band, it does not replace it.

   This returned the checked figure alone, which is precisely the
   trap CLAUDE.md's rates item names: the 2026 vendor figures run
   about 3x BELOW the 2024-25 ranges — Alexa Mini at 8,000 against a
   25,000–35,000 band, Komodo at 4,500 against 15,000–22,000 —
   probably body-versus-package, but unconfirmed. A hint showing only
   the lower one anchors the user to it on the single biggest line in
   a shoot.

   It never autofilled, which is the only reason this was a
   misleading note and not a wrong total. The library had it right
   already, because it renders the check rows BESIDE the card row
   rather than over it. The estimator is the page people actually
   type numbers into, and it was the one replacing. */
export function rateHint(name, currency) {
  if (currency === 'USD') return usRateHint(name);
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

/* ---- the US figures (src/data/rates.us.json) --------------------
   Shown in place of the Chennai card when the budget is in dollars.
   Each row is one rental house's published 3-day and 7-day prices;
   the per-day RANGE is derived from them here (7-day ÷ 7 is the low
   end, 3-day ÷ 3 the high), never typed, and the hint prints both the
   range and the prices it came from. No row, no hint: an item with no
   sourced US figure shows nothing rather than a converted rupee one. */
const US_BY_ITEM = new Map((usRates.rows || []).map((r) => [norm(r.item), r]));
const usd = (n) => '$' + USD.format(Math.round(n));

/** The per-day range of a US row, or null when its prices are missing. */
export function usBand(row) {
  const p = (row && row.prices) || {};
  const week = Number(p['7']);
  const three = Number(p['3']);
  if (!(week > 0) || !(three > 0)) return null;
  return { low: Math.round(week / 7), high: Math.round(three / 3) };
}

/** The hint for a line in a dollar budget, or ''. */
export function usRateHint(name) {
  if (!name) return '';
  const row = US_BY_ITEM.get(norm(name));
  const band = usBand(row);
  if (!band) return '';
  const src = ((usRates.sources || {})[row.source] || {}).name || row.source;
  return `US range ${usd(band.low)} – ${usd(band.high)}/day · ${src} list price, checked `
    + `${row.lastChecked}: ${usd(row.prices['3'])} for 3 days, ${usd(row.prices['7'])} for 7 `
    + `(${row.listed}, no damage coverage). One rental house, not a quote.`;
}

/** Exact, Indian grouping: ₹ 54,000 / ₹ 1,25,00,000. fmtINR() rounds
    ≥ ₹1,000 to whole thousands, which is a lie in a budgeting tool. */
export function fmtINRExact(n) {
  if (!n) return '₹ 0';
  return '₹ ' + INR.format(Math.round(n));
}

/** The item a row is about, from its two fields' values: the custom
    name wins, then the picked preset ("Other (custom)" is no item). */
export function itemNameOf(custom, picked) {
  const typed = custom && custom.trim();
  if (typed) return typed;
  const p = picked && picked.trim();
  if (p && p !== 'Other (custom)') return p;
  return '';
}

/** The caption under the grand total. */
export function totalCaption(total, count, fmtINR) {
  return `across ${count} line item${count !== 1 ? 's' : ''}` +
    // fmtINR's one surviving job: a glance-sized magnitude in a
    // caption that has no room for eight digits.
    (total >= 100000 ? ` · ≈${fmtINR(total)}` : '');
}

/** The toast after "Use N days": what was filled and what was left. */
export function useDaysMessage(fieldCount, filled, kept, days) {
  return !fieldCount
    ? 'Pick an item or set a rate on a line first, then this fills its days.'
    : filled
      ? filled + ' line' + (filled === 1 ? '' : 's') + ' set to ' + days + ' days'
        + (kept ? '; ' + kept + (kept === 1 ? ' you had already set was' : ' you had already set were') + ' left alone.' : '.')
      : 'Every line already has days set — nothing was overwritten.';
}

/* ---- the schedule → budget link --------------------------------
   Derived on every render, stored nowhere. The scene model is the one
   representation; a copy of the day count in the calculator's own
   storage would be the second, and the two would disagree by the end
   of the week. */
export function scheduleFacts() {
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

/** The sentence under the schedule facts once some scenes have a day. */
export function scheduleHint(f) {
  return f.unscheduled
    ? f.days + ' scheduled day' + (f.days === 1 ? '' : 's') + ', with ' + f.unscheduled
      + ' scene' + (f.unscheduled === 1 ? '' : 's') + ' still unscheduled — so this is a floor, not the final count.'
    : 'Every scene has a day. This is your shoot length.';
}

/** The song-days sentence, or '' when no song adds a day. Listed
    separately rather than folded in silently: a day count that grew
    without saying why is a day count nobody trusts. */
export function songDaysHint(f) {
  if (!f.songDaysUncounted) return '';
  return 'Plus ' + f.songDaysUncounted
    + (f.songDaysUncounted === 1 ? ' day' : ' days') + ' for '
    + f.songsUncounted + (f.songsUncounted === 1 ? ' song' : ' songs')
    + ' whose scenes are not on the board yet. Songs are planned before their '
    + 'scenes exist, so the scene count cannot see those days — '
    + f.totalDays + ' is the figure to budget.';
}

/* ---- the page's head ------------------------------------------- */

/** How many saved budget versions costs.js holds; 0 when it cannot say. */
export function versionCount() {
  try { return C.listVersions().length; } catch (e) { return 0; }
}


/** Where the preset rates come from — counted from the overlay, not
    asserted. This line used to say every preset was 2024-25 full stop,
    which stopped being true the moment part of the card was re-checked
    against a Chennai rental house: the estimator shows those with their
    own date, so a blanket "all 2024-25" above it contradicted the hints
    underneath it. (rates.json calls it `asOf`, not `year`.) */
export function rateProvenance(currency) {
  if (currency === 'USD') return usRateProvenance();
  const rows = rateChecks.rows || [];
  const checked = rows.filter((r) => r.confidence === 'checked').length;
  const stale = rows.filter((r) => r.confidence === 'stale').length;

  let s = `Preset rates are Chennai ${rates.asOf}. `;
  if (checked) {
    s += `${checked} were re-checked on ${rateChecks.lastChecked} and are shown with that `
       + `date — next to the ${rates.asOf} band, not over it, because the checked `
       + `figures come in well under it and it is not settled why. `;
  }
  if (stale) {
    s += `${stale} more were looked for and found published nowhere, so the `
       + `${rates.asOf} figure stands and says so on the line. `;
  }
  return s + `They are a starting point for a line, not a quote — every one of `
           + `them is editable.`;
}

/** The provenance line for a dollar budget — counted from the file. */
export function usRateProvenance() {
  const rows = (usRates.rows || []).filter((r) => usBand(r));
  const names = [...new Set(rows.map((r) => ((usRates.sources || {})[r.source] || {}).name || r.source))];
  let s = 'This budget is in US dollars, so the Chennai card is not used. ';
  s += rows.length
    ? `${rows.length} preset${rows.length === 1 ? ' carries' : 's carry'} a US range, worked out from `
      + `${names.join(' and ')}'s published 3-day and 7-day rental prices (no damage coverage), `
      + `checked ${usRates.lastChecked}. The others, and every crew role, have no sourced US `
      + `figure, so their lines show none. `
    : 'No preset carries a sourced US figure yet, so the lines show none. ';
  return s + 'They are a starting point for a line, not a quote — every one of them is editable.';
}

export default {
  CALC_KEY, CALC_CURRENCY, PRESET_ITEMS, budgetCurrency, setBudgetCurrency, currencyMismatch, fmtExact, currencySign,
  usBand, usRateHint, usRateProvenance, readCalcData, saveCalcData, clearCalcData, maxRowIndex, rescuedCustomNames,
  bandGap, rateHint, fmtINRExact, itemNameOf, totalCaption, useDaysMessage,
  scheduleFacts, scheduleHint, songDaysHint, rateProvenance, versionCount
};
