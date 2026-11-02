/* ============================================================
   AI PRE-PRODUCTION — the pure half of four Desk tasks
   ------------------------------------------------------------
   docs/AI-EVERYWHERE.md sections 1 to 4: 'shoot-order', 'recce-notes',
   'budget-estimate', 'callsheet-notes'. Everything that is a DECISION
   and needs no storage lives here so scripts/test-ai-preprod.mjs runs
   it in Node: the schemas, the prompts, the facts that leave the
   browser, the checks on a reply (an id we did not send is dropped),
   the blanks-only merges, and the undo guards. src/lib/ai-tasks-
   preprod.js does the reading and the writing through the owning
   models. No imports, no document, no storage.

   A "CLOSED" DAY. The board has no day lock of its own (the only lock
   it has is the screenplay's scene-number lock, which is about scene
   numbers, not days). A day the unit has begun shooting is the nearest
   thing: any scene on it carries a shotState. shoot-order treats such
   a day as locked: it sends nothing from it, accepts nothing for it,
   and moves nothing out of it. A scene with a shotState is never moved
   wherever it sits.
   ============================================================ */

const clipText = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);
const oneLine = (s, n) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, n);
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^a-z0-9]/g, '');
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const dayOf = (s) => { const n = parseInt(s && s.shootDay, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const castOf = (s) => [].concat((s && s.elements && s.elements.cast) || []).map((c) => oneLine(c, 60)).filter(Boolean);

/* ============================================================
   1. shoot-order
   ============================================================ */
export const SHOOT_ORDER_SYSTEM =
  'You are a first assistant director sequencing a low-budget shoot. You group scenes into shoot days '
  + 'to cut location moves and keep each day to a workable number of pages and cast. You use only the '
  + 'scene ids you are given, once each, and you give a short reason per day. You do not invent scenes.';

export function shootOrderSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['days', 'note'],
    properties: {
      days: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['day', 'sceneIds', 'why'],
          properties: {
            day: { type: 'integer', description: 'the shoot day number, 1 or more, from the days offered' },
            sceneIds: { type: 'array', items: { type: 'string' }, description: 'ids copied exactly from the scene list, in shooting order' },
            why: { type: 'string', description: 'one short sentence on why these scenes share the day' }
          }
        }
      },
      note: { type: 'string', description: 'one or two sentences on anything the scheduler should know' }
    }
  };
}

/** Days that hold a scene the unit has already begun to shoot. */
export function closedDays(scenes) {
  const out = new Set();
  for (const s of scenes || []) if (s && s.shotState && dayOf(s)) out.add(dayOf(s));
  return out;
}

/** A scene the order may move: not shot, and not sitting on a closed day. */
export function movable(scene, closed) {
  return !!scene && !scene.shotState && !closed.has(dayOf(scene));
}

/**
 * The facts: only scenes this task may move, a line per open day as it
 * stands, the closed days by number, the page target if one is set.
 * `maxDay` bounds the days a reply may name.
 */
export function shootOrderFacts(scenes, { pageTarget = 0 } = {}) {
  const all = scenes || [];
  const closed = closedDays(all);
  const mine = all.filter((s) => movable(s, closed));
  const open = new Map();
  for (const s of mine) {
    const d = dayOf(s);
    if (d) { if (!open.has(d)) open.set(d, []); open.get(d).push(String(s.id)); }
  }
  const usedMax = all.reduce((m, s) => Math.max(m, dayOf(s)), 0);
  const maxDay = Math.min(200, Math.max(usedMax, mine.length, 1));
  const eighths = (s) => { const n = Number(s.eighths); return Number.isFinite(n) && n > 0 ? n : 8; };
  const facts = {
    scenes: mine.map((s) => {
      const f = {
        id: String(s.id), number: oneLine(s.number, 12), intExt: oneLine(s.intExt, 8),
        location: oneLine(s.location, 80), dayNight: oneLine(s.dayNight, 12), cast: castOf(s).slice(0, 20), eighths: eighths(s)
      };
      if (s.songId) f.songId = String(s.songId);
      return f;
    }),
    currentDays: [...open.entries()].sort((a, b) => a[0] - b[0]).map(([day, sceneIds]) => ({ day, sceneIds })),
    lockedDays: [...closed].sort((a, b) => a - b),
    maxDay
  };
  if (pageTarget > 0) facts.pageTargetEighths = pageTarget;
  return facts;
}

export function shootOrderPrompt(facts, refine = '') {
  const L = [];
  L.push('Group these scenes into shoot days, using days 1 to ' + facts.maxDay + '. Put scenes at one location together, '
    + 'keep night scenes together, and keep each day near the page target when one is given (eighths of a page: 8 is one page).');
  L.push('Use every scene id once if you can. Never use a day listed in lockedDays. Give each day a one-sentence reason.');
  L.push('Scenes and the days they sit on now (JSON):');
  L.push(JSON.stringify(facts));
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

const sceneLabel = (s) => String(s.number || '').trim() || '—';

/**
 * A reply, checked against what was sent. Dropped: an id not sent, a
 * duplicate id, a day that is locked / not a whole number in range.
 * Days named twice merge into the first. Items are one per day, in day
 * order: { id: 'd<day>', text, detail, day, sceneIds }.
 */
export function readShootOrder(parsed, facts) {
  const byId = new Map(facts.scenes.map((s) => [s.id, s]));
  const locked = new Set(facts.lockedDays || []);
  const seen = new Set();
  const days = new Map();
  let dropped = 0;
  const list = isObj(parsed) && Array.isArray(parsed.days) ? parsed.days : [];
  for (const d of list) {
    const day = isObj(d) ? Number(d.day) : NaN;
    const ids = isObj(d) && Array.isArray(d.sceneIds) ? d.sceneIds : [];
    if (!Number.isInteger(day) || day < 1 || day > facts.maxDay || locked.has(day)) { dropped += ids.length || 1; continue; }
    for (const raw of ids) {
      const id = String(raw);
      if (!byId.has(id) || seen.has(id)) { dropped += 1; continue; }
      seen.add(id);
      if (!days.has(day)) days.set(day, { ids: [], why: '' });
      const row = days.get(day);
      row.ids.push(id);
      if (!row.why) row.why = oneLine(d.why, 300);
    }
  }
  const items = [...days.entries()].sort((a, b) => a[0] - b[0]).filter(([, r]) => r.ids.length).map(([day, r]) => ({
    id: 'd' + day,
    text: 'Day ' + day + ': Sc ' + r.ids.map((id) => sceneLabel(byId.get(id))).join(', '),
    detail: r.why,
    day, sceneIds: r.ids
  }));
  return { items, dropped, note: oneLine(isObj(parsed) ? parsed.note : '', 400) };
}

/** What a refine re-sends of the last answer: the answer's own shape. */
export const shootOrderPrevious = (prev) => ({
  days: ((prev && prev.items) || []).map((i) => ({ day: i.day, sceneIds: i.sceneIds, why: i.detail || '' })),
  note: (prev && prev.note) || ''
});

/**
 * Accept, planned against the board as it is NOW. Each ticked day in
 * order; a scene is skipped when it no longer exists, has been shot, is
 * on (or going to) a closed day. `index` is the scene's place in the
 * proposal for that day. Returns { moves: [{sceneId, day, index}], skipped }.
 */
export function planPlacements(items, scenesNow) {
  const all = scenesNow || [];
  const closed = closedDays(all);
  const byId = new Map(all.map((s) => [String(s.id), s]));
  const moves = [];
  let skipped = 0;
  for (const it of [...(items || [])].sort((a, b) => a.day - b.day)) {
    let index = 0;
    for (const id of it.sceneIds || []) {
      const s = byId.get(String(id));
      if (!s || !movable(s, closed) || closed.has(it.day)) { skipped += 1; continue; }
      moves.push({ sceneId: s.id, day: it.day, index });
      index += 1;
    }
  }
  return { moves, skipped };
}

/* ============================================================
   2. recce-notes
   ------------------------------------------------------------
   Written fields, and the only ones: notes, bestTime, power, parking,
   toilets. address, contact, permission, cost, lat, lng, hospital and
   police are never read into a prompt and never written.
   ============================================================ */
export const RECCE_FIELDS = ['notes', 'bestTime', 'power', 'parking', 'toilets'];
/** The fixed checklist: the model's lines start with one of these labels. */
export const RECCE_LABELS = { bestTime: 'Best time', power: 'Power', parking: 'Parking', toilets: 'Toilets' };
export const RECCE_PREFIX = 'To check: ';

export const RECCE_SYSTEM =
  'You are a location manager preparing recce checklists from a script breakdown. You write short things to '
  + 'CHECK or ASK on the visit, never findings: you have not seen the place, so you must not state what it has '
  + 'or lacks. You use only the location names you are given.';

export function recceSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['places'],
    properties: {
      places: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['name', 'ideas', 'checklist'],
          properties: {
            name: { type: 'string', description: 'the location name copied exactly from the list' },
            ideas: { type: 'string', description: 'two or three short things to look at or ask for the scenes shot here' },
            checklist: {
              type: 'array',
              items: { type: 'string', description: 'one line starting with "Best time:", "Power:", "Parking:" or "Toilets:", then what to check' },
              description: 'up to four lines, each starting with one of those labels, only for labels listed in "empty"'
            }
          }
        }
      }
    }
  };
}

const recceEmpty = (recce) => RECCE_FIELDS.filter((k) => !String((recce && recce[k]) || '').trim());

/**
 * One entry per location with something left to fill (all of `places`
 * when `only` is not named, else just that one), capped. `places` is
 * Locations.locationIndex(): { name, scenes[], recce }.
 */
export function recceFacts(places, { only = '', max = 12 } = {}) {
  const want = norm(only);
  const out = [];
  for (const p of places || []) {
    if (want && norm(p.name) !== want) continue;
    const empty = recceEmpty(p.recce);
    if (!empty.length) continue;
    out.push({
      name: oneLine(p.name, 80),
      /* the card's own name: the record is filed under it, never under the prompt's reworked copy */
      exact: String(p.name || ''),
      scenes: (p.scenes || []).slice(0, 8).map((s) => ({
        number: oneLine(s.number, 12), intExt: oneLine(s.intExt, 8), dayNight: oneLine(s.dayNight, 12),
        castCount: castOf(s).length, action: oneLine(s.synopsis, 240)
      })),
      empty
    });
    if (out.length >= max) break;
  }
  return { places: out };
}

export function reccePrompt(facts, refine = '') {
  const L = [];
  L.push('For each location below, write recce ideas for the scenes shot there and a checklist for the fields listed in "empty". '
    + 'Phrase everything as something to check or ask, not as a fact about the place.');
  L.push('Locations (JSON):');
  L.push(JSON.stringify(facts, (k, v) => (k === 'exact' ? undefined : v)));
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

const LABEL_RE = /^\s*(best\s*time|power|parking|toilets?)\s*[:\-–—]\s*(.+)$/i;
const LABEL_KEY = { besttime: 'bestTime', power: 'power', parking: 'parking', toilet: 'toilets', toilets: 'toilets' };
const prefixed = (t) => RECCE_PREFIX + oneLine(t, 240).replace(/^to check:\s*/i, '');

/** A reply, checked: a place not sent is dropped; a field not listed
    as empty is dropped; a line with no known label is dropped. */
export function readRecce(parsed, facts) {
  const sent = new Map(facts.places.map((p) => [norm(p.name), p]));
  const items = [];
  let dropped = 0;
  const seen = new Set();
  for (const p of (isObj(parsed) && Array.isArray(parsed.places)) ? parsed.places : []) {
    const src = isObj(p) ? sent.get(norm(p.name)) : null;
    if (!src || seen.has(norm(src.name))) { dropped += 1; continue; }
    seen.add(norm(src.name));
    const fields = {};
    const ideas = oneLine(p.ideas, 400);
    if (ideas && src.empty.includes('notes')) fields.notes = prefixed(ideas);
    for (const line of Array.isArray(p.checklist) ? p.checklist : []) {
      const m = LABEL_RE.exec(String(line));
      const key = m ? LABEL_KEY[m[1].toLowerCase().replace(/\s+/g, '')] : '';
      if (!key || !src.empty.includes(key) || fields[key]) { dropped += 1; continue; }
      fields[key] = prefixed(m[2]);
    }
    if (!Object.keys(fields).length) { dropped += 1; continue; }
    const lines = Object.entries(fields).map(([k, v]) => (k === 'notes' ? 'Notes' : RECCE_LABELS[k]) + ': ' + v);
    items.push({ id: 'p' + items.length, text: src.name, detail: lines.join('\n'), name: src.exact || src.name, fields });
  }
  return { items, dropped };
}

export const reccePrevious = (prev) => ({
  places: ((prev && prev.items) || []).map((i) => ({
    name: i.text, ideas: (i.fields.notes || '').replace(RECCE_PREFIX, ''),
    checklist: Object.entries(i.fields).filter(([k]) => k !== 'notes').map(([k, v]) => RECCE_LABELS[k] + ': ' + v.replace(RECCE_PREFIX, ''))
  }))
});

/**
 * Accept: per ticked place, only the fields that are blank NOW.
 * `recceNow(name)` reads the record. Returns { writes: [{name, patch}],
 * skipped } where skipped counts fields filled since Run.
 */
export function planRecceWrites(selected, recceNow) {
  const writes = [];
  let skipped = 0;
  for (const it of selected || []) {
    const now = recceNow(it.name) || {};
    const patch = {};
    for (const k of RECCE_FIELDS) {
      if (!(k in (it.fields || {}))) continue;
      if (String(now[k] || '').trim()) skipped += 1; else patch[k] = it.fields[k];
    }
    if (Object.keys(patch).length) writes.push({ name: it.name, patch });
  }
  return { writes, skipped };
}

/** Undo: the fields still exactly as written go back to ''; the rest stay. */
export function planRecceUndo(writes, recceNow) {
  const blank = [];
  let kept = 0;
  for (const w of writes || []) {
    const now = recceNow(w.name) || {};
    const patch = {};
    for (const [k, v] of Object.entries(w.patch)) {
      if (String(now[k] || '') === v) patch[k] = ''; else kept += 1;
    }
    if (Object.keys(patch).length) blank.push({ name: w.name, patch });
  }
  return { blank, kept };
}

/* ============================================================
   3. budget-estimate
   ============================================================ */
export const BUDGET_SYSTEM =
  'You are a line producer drafting a first-pass equipment and crew budget for a low-budget film from its '
  + 'schedule. You suggest lines as days times a daily rate in the budget’s currency. You prefer the '
  + 'preset item names when one fits. You do not repeat a line already on the sheet. Rates are estimates, not quotes.';

export function budgetSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['lines', 'note'],
    properties: {
      lines: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['item', 'days', 'rate', 'reason'],
          properties: {
            item: { type: 'string', description: 'a preset item name when one fits, else a short custom name' },
            days: { type: 'number', description: 'days the line is needed' },
            rate: { type: 'number', description: 'daily rate in the budget currency, a plain number' },
            reason: { type: 'string', description: 'the basis for the rate, one short sentence' }
          }
        }
      },
      note: { type: 'string', description: 'one or two sentences on what the estimate leaves out' }
    }
  };
}

const cue = (t) => String(t || '').replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim().toUpperCase();

/** Distinct tags a category carries across the scenes. */
export function tagCount(scenes, category) {
  const set = new Set();
  for (const s of scenes || []) for (const t of [].concat((s && s.elements && s.elements[category]) || [])) {
    const k = norm(t); if (k) set.add(k);
  }
  return set.size;
}

/** Speaking parts: distinct character cues in the script. */
export function speakingCount(elements) {
  const set = new Set();
  for (const e of elements || []) if (e && e.type === 'character') { const c = cue(e.text); if (c) set.add(c); }
  return set.size;
}

/** Names already on the sheet: custom name wins over the picked preset. */
export function existingLineNames(data) {
  const names = [];
  const idx = new Set();
  for (const k of Object.keys(data || {})) { const m = /^ci_(\d+)_(item|custom)$/.exec(k); if (m) idx.add(m[1]); }
  for (const n of idx) {
    const name = String((data['ci_' + n + '_custom'] || data['ci_' + n + '_item']) || '').trim();
    if (name) names.push(name);
  }
  return names;
}

/** facts: schedule (budget-model scheduleFacts()), counts, region, currency, presets, names on the sheet. */
export function budgetFacts({ schedule, scenes, scriptElements, region, currency, presets, data }) {
  const s = schedule || {};
  return {
    schedule: {
      scenes: s.totalScenes || 0, scheduledScenes: s.scheduled || 0, shootDays: s.totalDays || s.days || 0,
      locations: s.locations || 0, pages: String(s.pages || '')
    },
    castCount: tagCount(scenes, 'cast'),
    speakingParts: speakingCount(scriptElements),
    extrasTags: tagCount(scenes, 'extras'),
    vehicleTags: tagCount(scenes, 'vehicles'),
    region: region || '',
    currency: currency === 'USD' ? 'USD' : 'INR',
    presetItems: (presets || []).filter((p) => !/^other\b/i.test(p)),
    alreadyOnTheSheet: existingLineNames(data).slice(0, 80)
  };
}

export function budgetPrompt(facts, refine = '') {
  const L = [];
  L.push('Suggest budget lines (item, days, daily rate in ' + facts.currency + ') for this film from its schedule. '
    + 'Use a name from presetItems when one fits. Skip anything in alreadyOnTheSheet. Give a one-sentence basis for each rate.');
  L.push('The schedule (JSON):');
  L.push(JSON.stringify(facts));
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

const money = (n, cur) => (cur === 'USD' ? '$' : '₹') + Math.round(n * 100) / 100;
const numText = (n) => String(Math.round(n * 100) / 100);

/**
 * A reply, checked. A line needs a name, days in (0, 365] and a finite
 * rate above 0; others drop. A name already on the sheet or already
 * suggested drops. `bandOf(presetName)` → {low, high} | null. A rate
 * outside its band is FLAGGED in the detail, never dropped.
 */
export function readBudget(parsed, facts, bandOf = () => null) {
  const presetBy = new Map(facts.presetItems.map((p) => [norm(p), p]));
  const taken = new Set(facts.alreadyOnTheSheet.map(norm));
  const items = [];
  let dropped = 0, duplicates = 0;
  for (const l of (isObj(parsed) && Array.isArray(parsed.lines)) ? parsed.lines : []) {
    const name = isObj(l) ? oneLine(l.item, 80) : '';
    const days = isObj(l) ? Number(l.days) : NaN;
    const rate = isObj(l) ? Number(l.rate) : NaN;
    if (!name || !(days > 0) || days > 365 || !Number.isFinite(rate) || !(rate > 0)) { dropped += 1; continue; }
    const k = norm(name);
    if (taken.has(k)) { duplicates += 1; continue; }
    taken.add(k);
    const preset = presetBy.get(k) || '';
    const band = preset ? bandOf(preset) : null;
    const flag = band && (rate < band.low || rate > band.high)
      ? ' Outside the rate card’s band (' + money(band.low, facts.currency) + ' to ' + money(band.high, facts.currency) + ' a day): check it.'
      : (band ? '' : (preset ? '' : ' No rate card band to compare with.'));
    items.push({
      id: 'b' + items.length,
      text: (preset || name) + ', ' + numText(days) + (days === 1 ? ' day' : ' days'),
      detail: money(rate, facts.currency) + ' a day. ' + oneLine(l.reason, 240) + flag,
      line: { item: preset, custom: preset ? '' : name, days: numText(days), rate: numText(rate) },
      outOfBand: !!(band && (rate < band.low || rate > band.high))
    });
  }
  return { items, dropped, duplicates, note: oneLine(isObj(parsed) ? parsed.note : '', 400) };
}

export const budgetPrevious = (prev) => ({
  lines: ((prev && prev.items) || []).map((i) => ({
    item: i.line.item || i.line.custom, days: Number(i.line.days), rate: Number(i.line.rate), reason: i.detail
  })),
  note: (prev && prev.note) || ''
});

/**
 * Accept: new rows only, from `first` up. A name already on the sheet
 * (or earlier in this batch) is skipped. Returns { rows: [{n, keys}],
 * skipped } where keys are the four ci_<n>_… values.
 */
export function planBudgetRows(selected, data, first) {
  const taken = new Set(existingLineNames(data).map(norm));
  const rows = [];
  let skipped = 0, n = first;
  for (const it of selected || []) {
    const l = it.line || {};
    const name = l.custom || l.item;
    if (!name || taken.has(norm(name))) { skipped += 1; continue; }
    taken.add(norm(name));
    rows.push({
      n,
      keys: { ['ci_' + n + '_item']: l.item || '', ['ci_' + n + '_custom']: l.custom || '', ['ci_' + n + '_days']: l.days, ['ci_' + n + '_rate']: l.rate }
    });
    n += 1;
  }
  return { rows, skipped };
}

/** The next free row: above every id either blob names. */
export const firstFreeRow = (maxCalcRow, highestRef) => Math.max(maxCalcRow || 0, highestRef || 0) + 1;

/**
 * Undo: a written row goes only if all four of its keys still read as
 * written, and no cost record names a row at or above it (`refMax`).
 * Returns { remove: [keys...], kept }.
 */
export function planBudgetUndo(rows, data, refMax = 0) {
  const remove = [];
  let kept = 0;
  for (const r of rows || []) {
    const same = Object.entries(r.keys).every(([k, v]) => String((data || {})[k] ?? '') === String(v));
    if (!same || r.n <= refMax) { kept += 1; continue; }
    remove.push(...Object.keys(r.keys));
  }
  return { remove, kept };
}

/* ============================================================
   4. callsheet-notes
   ============================================================ */
export const NOTES_MAX = 800;
export const CALLSHEET_SYSTEM =
  'You write the notes line of a film call sheet and a short message for the unit’s group chat. You use '
  + 'only the facts given. You do not invent weather, people, phone numbers or places. The tone is plain and '
  + 'practical, like the example message.';

export function callsheetSchema() {
  return {
    type: 'object', additionalProperties: false, required: ['notes', 'unitMessage'],
    properties: {
      notes: { type: 'string', description: 'two to four plain lines for the sheet’s notes box: what the unit needs to know for the day' },
      unitMessage: { type: 'string', description: 'the message for the unit group, in the tone of the example' }
    }
  };
}

/** The facts as the page built them, minus everything personal or
    location-exact: no map link, no hospital or police text, no notes. */
export function callsheetFacts(f) {
  const x = f || {};
  const light = x.light && x.light.sunrise
    ? { sunrise: x.light.sunrise, sunset: x.light.sunset, zone: x.light.zone || '', fallback: !!x.light.fallback } : null;
  return {
    film: oneLine(x.film, 120), title: oneLine(x.title, 80), dayNumber: x.dayNumber || 0, date: oneLine(x.date, 40),
    generalCall: oneLine(x.generalCall, 20), wrap: oneLine(x.wrap, 20), location: oneLine(x.location, 120),
    scenes: (x.scenes || []).slice(0, 40).map((s) => ({ number: oneLine(s.number, 12), slug: oneLine(s.slug, 100), pages: oneLine(s.pages, 12) })),
    pagesTotal: oneLine(x.pagesTotal, 12),
    light,
    safetyPlaces: (x.safety || []).map((s) => oneLine(s && s.place, 80)).filter(Boolean).slice(0, 10)
  };
}

/** What shows and what goes: the facts, then the tone example. */
export function callsheetPrompt(facts, example, refine = '') {
  const L = [];
  L.push('Write notes for this call sheet and a unit message. The notes go in the sheet’s notes box (at most ' + NOTES_MAX + ' characters). '
    + 'The unit message is for the WhatsApp group; write it like the example, with the same facts.');
  L.push('The day (JSON):');
  L.push(JSON.stringify(facts));
  L.push('Example of the tone (the unit message as the app builds it today):');
  L.push(example);
  return L.join('\n') + (refine ? '\n\n' + refine : '');
}

/** The reply, held to its limits: notes to NOTES_MAX, message to `limit`. */
export function readCallsheet(parsed, limit) {
  const p = isObj(parsed) ? parsed : {};
  return { notes: clipText(p.notes, NOTES_MAX), unitMessage: clipText(p.unitMessage, limit) };
}

/** Accept: the notes only when the sheet's are empty now. */
export const callsheetWrite = (selected, notesNow) => {
  const text = String(selected == null ? '' : selected).trim();
  if (!text) return { write: '', why: 'nothing' };
  if (String(notesNow || '').trim()) return { write: '', why: 'filled' };
  return { write: clipText(text, NOTES_MAX), why: '' };
};

/** Undo: only while the notes still read exactly as written. */
export const callsheetUndo = (written, notesNow) => String(notesNow || '') === String(written || '');

export { plural, norm };
