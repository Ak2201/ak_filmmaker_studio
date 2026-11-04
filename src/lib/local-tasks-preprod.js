/* ============================================================
   LOCAL TASKS — Pre-production, no AI (docs/RULES-BREAKDOWN.md lane A)
   ------------------------------------------------------------
   Four Desk tasks that need no key and no Pro plan, each the rules twin
   of an AI task and registered by local-tasks.js (a spread in
   LOCAL_TASKS). Every run() calls a PURE function in rules-preprod.js
   over facts read from the owning models; every apply() writes through
   the plan/undo helpers the AI task already uses (ai-preprod-model.js,
   locations.js, contacts.js, budget-model.js), minus the history stamp:
   a record written by rules is never marked as AI's.

     shoot-order-rules      ctx { say?, after? }                stripboard.html
     recce-notes-rules      ctx { locationName?, say?, after? } plan.html#locations
     budget-estimate-rules  ctx { midpoint?, say?, after? }      budget.html
     callsheet-notes-rules  ctx { sheetId, facts(), sceneIds?(), say?, after? }
                                                                 contacts.html#call-sheets

   Nothing is written before Accept; an apply writes blanks or new
   records only and answers an exact Undo that keeps later edits (or
   null when it wrote nothing). A second run on unchanged data proposes
   nothing. LIGHT: local-tasks.js imports this statically, so every
   model is a dynamic import inside ready(); input() is synchronous and
   returns a fixed sentence. NO STORAGE KEY of its own.
   ============================================================ */
let R = null, M = null, ScenesM = null, LocM = null, ContactsM = null, BudgetM = null, CostsM = null, LineIds = null,
  ScriptM = null, Region = null, RatesIN = null, RatesUS = null, Sun = null, Geo = null, DPR = null, Cbfc = null, SA = null;
let readyP = null;

export function ready() {
  if (!readyP) {
    readyP = Promise.all([
      import('./rules-preprod.js'), import('./ai-preprod-model.js'), import('./scenes.js'), import('./locations.js'),
      import('./contacts.js'), import('./budget-model.js'), import('./costs.js'), import('./budget-line-ids.js'),
      import('./script.js'), import('./film-region.js').catch(() => null), import('../data/rates.chennai.2024.json'), import('../data/rates.us.json'),
      import('./sun.js'), import('./recce-geo.js'), import('./dpr.js'), import('./cbfc.js'), import('./screenplay-analysis.js')
    ]).then(([r, m, sc, lo, co, bu, cs, li, sp, rg, rin, rus, su, ge, dp, cb, sa]) => {
      R = r; M = m; ScenesM = sc; LocM = lo; ContactsM = co; BudgetM = bu; CostsM = cs; LineIds = li; ScriptM = sp; Region = rg;
      RatesIN = rin.default || rin; RatesUS = rus.default || rus;
      Sun = su.default || su; Geo = ge.default || ge; DPR = dp.default || dp; Cbfc = cb; SA = sa;
      return true;
    }).catch((e) => { readyP = null; throw e; });
  }
  return readyP;
}

const resolve = (ctx) => {
  let c = ctx;
  if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
  return (c && typeof c === 'object') ? c : {};
};
const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
const fail = (msg) => { const e = new Error(msg); e.kind = 'nocontent'; throw e; };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const sentence = (...parts) => parts.filter(Boolean).join(' ');
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/[^\p{L}\p{M}\p{N}]/gu, '');

/* ============================================================
   1. shoot-order-rules
   ============================================================ */
const shootFacts = () => M.shootOrderFacts(ScenesM.listScenes(), { pageTarget: (LocM.schedulePrefs() || {}).pageTarget || 0 });

/** Is every scene of this day already where the plan puts it? Then there is nothing to move. */
function inPlace(item, all) {
  const order = LocM.orderedDayScenes(item.day, all).map((s) => s.id);
  return item.sceneIds.every((id, i) => {
    const s = all.find((x) => x.id === id);
    return s && LocM.shootDayOf(s) === item.day && order[i] === id;
  });
}

const shootOrderRules = {
  id: 'shoot-order-rules',
  label: 'Plan shoot days',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The scenes the board may move (not shot, not on a day that has begun shooting): their place, day or night, '
      + 'INT or EXT, cast, song and length. Places go longest first, nights after days, exteriors before interiors, '
      + 'a song’s scenes together, up to the page target a day.';
  },
  async run() {
    await ready();
    const f = shootFacts();
    if (!f.scenes.length) fail('There are no scenes to place: every scene is either shot or on a day that has begun shooting. Nothing was changed.');
    const target = (LocM.schedulePrefs() || {}).pageTarget || DPR.DEFAULT_PAGE_TARGET;
    const res = R.proposeShootOrder(f, { pageTarget: target });
    const all = ScenesM.listScenes();
    const items = res.items.filter((i) => !inPlace(i, all));
    if (!items.length) fail('The board already matches the rules’ plan, so there is nothing to move. Nothing was changed.');
    return { items, note: sentence(res.note, 'Tick the days you want. Nothing moves until you accept.') };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const { moves, skipped } = M.planPlacements(selected, ScenesM.listScenes());
    const records = [];
    for (const m of moves) {
      const all = ScenesM.listScenes();
      const scene = all.find((s) => s.id === m.sceneId);
      const order = LocM.orderedDayScenes(m.day, all).map((s) => s.id);
      if (scene && LocM.shootDayOf(scene) === m.day && order[m.index] === m.sceneId) continue;   // already there
      const rec = LocM.placeScene(m.sceneId, m.day, { index: m.index });
      if (rec) records.push(rec);
    }
    const skip = skipped ? plural(skipped, 'scene was', 'scenes were') + ' skipped: shot, or on a day that has begun shooting.' : '';
    if (!records.length) { call(c.say, sentence('Nothing needed to move.', skip)); return null; }
    call(c.say, sentence(plural(records.length, 'scene', 'scenes') + ' placed.', skip));
    call(c.after);
    return () => {
      let back = 0, stale = 0;
      for (const r of records.slice().reverse()) {
        if (LocM.undoIsCurrent(r) && LocM.undoPlace(r)) back += 1; else stale += 1;
      }
      call(c.say, sentence(plural(back, 'scene', 'scenes') + ' put back.',
        stale ? plural(stale, 'move', 'moves') + ' left as they are: the board has changed since.' : ''));
      call(c.after);
    };
  }
};

/* ============================================================
   2. recce-notes-rules
   ============================================================ */
const RECCE_LABEL = { notes: 'Notes', bestTime: 'Best time', power: 'Power', parking: 'Parking', toilets: 'Toilets' };

/** The day's light at a place, calculated from its pin and the first dated shoot day there (never a forecast). */
function lightAt(place) {
  const coords = Geo.coordsOf(place.recce);
  if (!coords) return null;
  for (const day of place.days || []) {
    const date = LocM.dayDate(day);
    if (!date) continue;
    const l = Sun.daylight(date, coords, { deviceOffset: Sun.deviceOffsetOn(date) });
    if (l) return { day, sunrise: l.sunrise, sunset: l.sunset };
  }
  return null;
}

const recceRules = {
  id: 'recce-notes-rules',
  label: 'Recce checklist',
  kind: 'list',
  editable: false,
  local: true,
  input(ctx) {
    const c = resolve(ctx);
    return 'The scenes shot ' + (c.locationName ? 'at ' + c.locationName : 'at each place') + ': their day or night, INT or EXT, '
      + 'tagged vehicles, power-hungry tags, the size of any crowd and the day’s load. Only blank recce fields get a '
      + '"To check:" line, and only when one of those facts calls for it.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const want = norm(c.locationName || '');
    const places = LocM.locationIndex(ScenesM.listScenes()).filter((p) => !want || norm(p.name) === want);
    if (!places.length) fail((c.locationName ? 'No scene names ' + c.locationName + '.' : 'No scene names a location yet.') + ' Nothing was changed.');
    const res = R.proposeRecce(places, { light: lightAt });
    const items = res.items.map((i) => ({ ...i, detail: 'Fills the ' + RECCE_LABEL[i.field] + ' field' }));
    if (!items.length) fail('Every recce field the rules can fill already has text, or nothing in the script calls for a check there. Nothing was changed.');
    return {
      items,
      note: 'Things to check on the visit, drawn from the scene tags and the schedule, written as "To check:", not findings. '
        + 'Only blank recce fields are filled; address, contact, permission, cost, pin, hospital and police are never touched.'
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const by = new Map();
    for (const it of selected || []) {
      if (!by.has(it.location)) by.set(it.location, { name: it.location, fields: {} });
      by.get(it.location).fields[it.field] = it.text;
    }
    const { writes, skipped } = M.planRecceWrites([...by.values()], (n) => LocM.getRecce(n));
    if (!writes.length) { call(c.say, skipped ? plural(skipped, 'field was', 'fields were') + ' filled in since the run, so nothing was written.' : 'Nothing to write.'); return null; }
    const had = new Map(writes.map((w) => [w.name, LocM.hasRecce(w.name)]));
    for (const w of writes) LocM.setRecce(w.name, w.patch);
    const n = writes.reduce((a, w) => a + Object.keys(w.patch).length, 0);
    call(c.say, sentence(plural(n, 'recce field', 'recce fields') + ' filled across ' + plural(writes.length, 'place', 'places') + '.',
      skipped ? plural(skipped, 'field was', 'fields were') + ' filled in since the run and left as typed.' : ''));
    call(c.after);
    return () => {
      const { blank, kept } = M.planRecceUndo(writes, (name) => LocM.getRecce(name));
      for (const b of blank) {
        LocM.setRecce(b.name, b.patch);
        // a card this run created and nothing else has touched goes away whole, so the board reads as before
        if (!had.get(b.name) && JSON.stringify(LocM.getRecce(b.name)) === JSON.stringify(LocM.blankRecce())) LocM.removeRecce(b.name);
      }
      call(c.say, kept ? plural(kept, 'field was', 'fields were') + ' edited since and left as typed.' : 'The recce fields are blank again.');
      call(c.after);
    };
  }
};

/* ============================================================
   3. budget-estimate-rules
   ============================================================ */
function safeCalc() { try { return BudgetM.readCalcData() || {}; } catch (e) { return null; } }
const NO_SCENES = 'There are no scenes yet, so there is no schedule to draft lines from. Break the script down first.';

const budgetRules = {
  id: 'budget-estimate-rules',
  label: 'Budget lines from the schedule',
  kind: 'list',
  editable: false,
  local: true,
  input(ctx) {
    const mid = !!resolve(ctx).midpoint;
    return 'Your schedule (shoot days, night scenes, vehicles, stunts, effects), the speaking cast, background and locations in the '
      + 'breakdown, and the rate card. Each new line gets its days from the schedule; the rate is '
      + (mid ? 'the rate card’s midpoint where a band exists (an estimate, not a quote).' : 'left blank, with the rate card’s band shown.');
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const schedule = BudgetM.scheduleFacts();
    if (!schedule.totalScenes) fail(NO_SCENES);
    let elements = [];
    try { elements = ScriptM.loadScript().elements || []; } catch (e) { elements = []; }
    let region = '';
    try { region = (Region && Region.filmRegion().region) || ''; } catch (e) { region = ''; }
    const data = safeCalc() || {};
    const res = R.proposeBudget({
      schedule, scenes: ScenesM.listScenes(), elements, presets: BudgetM.PRESET_ITEMS,
      rates: { india: RatesIN, us: RatesUS }, rowKey: CostsM.rowKey, region, currency: BudgetM.budgetCurrency(),
      existing: M.existingLineNames(data), midpoint: !!c.midpoint
    });
    if (!res.items.length) fail('Every line the schedule calls for is already on the sheet. Nothing was changed.');
    return { items: res.items, note: res.note };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const data = safeCalc();
    if (!data) fail('The saved estimate could not be read, so nothing was added.');
    let costs = {};
    try { costs = CostsM.readAll() || {}; } catch (e) { costs = {}; }
    const first = M.firstFreeRow(BudgetM.maxRowIndex(data), LineIds.highestLineIndex(data, costs));
    const { rows, skipped } = M.planBudgetRows(selected, data, first);
    if (!rows.length) { call(c.say, 'Every ticked line is already on the sheet. Nothing was added.'); return null; }
    const add = Object.assign({}, ...rows.map((r) => r.keys));
    BudgetM.saveCalcData({ ...data, ...add });
    const back = safeCalc() || {};
    if (!Object.entries(add).every(([k, v]) => String(back[k] ?? '') === String(v))) fail('The browser refused the write. Nothing was changed.');
    call(c.say, sentence(plural(rows.length, 'line', 'lines') + ' added to the estimate.',
      skipped ? plural(skipped, 'line was', 'lines were') + ' already on the sheet and skipped.' : ''));
    call(c.after);
    return () => {
      const now = safeCalc();
      if (!now) { call(c.say, 'The estimate could not be read. Nothing was undone.'); return; }
      let refMax = 0;
      try { refMax = LineIds.highestLineIndex({}, CostsM.readAll() || {}); } catch (e) { refMax = 0; }
      const { remove, kept } = M.planBudgetUndo(rows, now, refMax);
      if (remove.length) { const next = { ...now }; remove.forEach((k) => { delete next[k]; }); BudgetM.saveCalcData(next); }
      call(c.say, sentence(remove.length ? plural(remove.length / 4, 'line', 'lines') + ' taken out.' : 'No line was taken out.',
        kept ? plural(kept, 'line was', 'lines were') + ' edited or used in the costs since and left in.' : ''));
      call(c.after);
    };
  }
};

/* ============================================================
   4. callsheet-notes-rules
   ============================================================ */
const sheetNow = (id) => (ContactsM.listCallSheets().find((s) => s.id === id) || null);

/** The sheet's scenes as rows: by id when the page names them, else by the printed number. */
function sheetRows(c, facts) {
  const all = ScenesM.listScenes();
  const ids = call(c.sceneIds);
  if (Array.isArray(ids) && ids.length) return ids.map((id) => all.find((s) => s.id === id)).filter(Boolean);
  return (facts.scenes || []).map((s) => all.find((x) => String(x.number || '').trim() === String(s.number || '').trim())).filter(Boolean);
}

function notesFacts(c) {
  const facts = call(c.facts);
  if (!facts || !c.sheetId) fail('Pick a call sheet first.');
  const rows = sheetRows(c, facts);
  const cat = (s, k) => ((s.elements && s.elements[k]) || []).map(String).filter(Boolean);
  const tagsByScene = {};
  for (const s of rows) {
    const n = String(s.number || '').trim();
    if (!n) continue;
    tagsByScene[n] = { dayNight: s.dayNight, intExt: s.intExt, vehicles: cat(s, 'vehicles'), animals: cat(s, 'animals'), stunts: cat(s, 'stunts'), sfx: cat(s, 'sfx') };
  }
  // child artists: an age in a capitalised cast introduction, read from the scene's own script text
  const under = (Cbfc.ruleById('children') || {}).childAgeUnder || 14;
  let elements = [];
  try { elements = ScriptM.loadScript().elements || []; } catch (e) { elements = []; }
  const slices = new Map(SA.matchScenes(ScenesM.listScenes(), elements).pairs.map((p) => [p.scene.id, SA.isConfident(p.how) ? p.slice : null]));
  const ages = {};
  for (const s of rows) {
    const n = String(s.number || '').trim();
    if (!n) continue;
    const found = [];
    for (const t of Cbfc.sceneTexts(s, slices.get(s.id) || null)) {
      for (const a of Cbfc.agesIn(t.text)) if (a.age < under && !found.some((f) => f.name === a.name)) found.push({ name: a.name, age: a.age });
    }
    if (found.length) ages[n] = found;
  }
  // company moves the day's order implies, named by scene number
  const moves = DPR.impliedMoves(rows).map((m) => {
    const after = rows.find((s) => s.id === m.after);
    return { from: m.from, to: m.to, after: after ? String(after.number || '').trim() || '—' : '—' };
  });
  return { facts, tagsByScene, ages, moves };
}

const callsheetRules = {
  id: 'callsheet-notes-rules',
  label: 'Call sheet notes',
  kind: 'list',
  editable: false,
  local: true,
  input() {
    return 'The sheet’s own facts: sunrise and sunset, wrap, the scenes on the day (night, exterior, vehicles, animals, stunts, '
      + 'effects), company moves, any child artist named in the script and the page total. One line per fact; nothing else is added.';
  },
  async run(input, { ctx } = {}) {
    await ready();
    const c = resolve(ctx);
    const j = notesFacts(c);
    const sheet = sheetNow(c.sheetId);
    if (!sheet) fail('That call sheet has been deleted. Nothing was changed.');
    if (String(sheet.notes || '').trim()) fail('Notes are already written on this sheet, so there is nothing to fill. Clear them first if you want a draft. Nothing was changed.');
    const res = R.proposeCallsheetNotes(j.facts, { tagsByScene: j.tagsByScene, ages: j.ages, moves: j.moves });
    if (!res.notes.length) fail('This sheet has no scenes or light facts to write notes from yet. Nothing was changed.');
    return {
      items: res.notes.map((text, i) => ({ id: 'n' + i, text })),
      note: 'One line for each fact on the sheet; untick any you do not want. Accept fills the empty notes box and nothing else.'
        + (res.dropped ? ' ' + plural(res.dropped, 'line was', 'lines were') + ' left out to fit the box.' : '')
    };
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const sheet = sheetNow(c.sheetId);
    if (!sheet) fail('That call sheet has been deleted. Nothing was changed.');
    const w = M.callsheetWrite((selected || []).map((i) => i.text).join('\n'), sheet.notes);
    if (!w.write) { call(c.say, w.why === 'filled' ? 'Notes were written on the sheet since the run, so nothing was changed.' : 'Nothing to write.'); return null; }
    ContactsM.updateCallSheet(c.sheetId, { notes: w.write });
    call(c.say, 'Notes added to the call sheet.');
    call(c.after);
    return () => {
      const now = sheetNow(c.sheetId);
      if (!now) { call(c.say, 'That call sheet has been deleted. Nothing to undo.'); return; }
      if (!M.callsheetUndo(w.write, now.notes)) { call(c.say, 'The notes were edited since and are left as they are.'); return; }
      ContactsM.updateCallSheet(c.sheetId, { notes: '' });
      call(c.say, 'The notes are blank again.');
      call(c.after);
    };
  }
};

export const RULES_TASKS_PREPROD = [shootOrderRules, recceRules, budgetRules, callsheetRules];
export default { ready, RULES_TASKS_PREPROD };
