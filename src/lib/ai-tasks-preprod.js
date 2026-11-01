/* ============================================================
   AI TASKS — Pre-production: stripboard, locations, budget, call sheets
   ------------------------------------------------------------
   One lane's Desk tasks (docs/AI-EVERYWHERE.md sections 1 to 4).
   Registered by ai-tasks.js, which spreads TASKS into ALL_TASKS and
   awaits load() before the Desk asks any task for its input (input() is
   called synchronously, so every model it reads must be loaded by then).
   Helpers: ./ai-task-kit.js. Models load lazily inside load(); never
   import ai.js, a page or a ui file at the top of this module. The
   decisions (schemas, prompts, checks, blanks-only merges, undo guards)
   are ./ai-preprod-model.js's, pure.

     shoot-order       ctx { say?, after? }                  stripboard.html
     recce-notes       ctx { locationName?, say?, after? }   plan.html#locations
     budget-estimate   ctx { say?, after? }                  budget.html
     callsheet-notes   ctx { sheetId, facts(), offerUnit?(text), say?, after? }
                                                            contacts.html#call-sheets

   Every task builds its prompt in ONE function that input() and run()
   share, so what the Desk shows before the first send is what is sent.
   run() only reads and asks. apply() is the only writer: it re-reads the
   data as it is NOW, writes blanks or new records through the owning
   model, and returns an undo that restores only what it wrote.
   ============================================================ */
import { ai, resolve, call, fail, plural, remember, recall, refineText } from './ai-task-kit.js';
import * as M from './ai-preprod-model.js';

let ScenesM = null, LocM = null, ContactsM = null, BudgetM = null, CostsM = null, LineIds = null,
  ScriptM = null, WA = null, Region = null, RatesIN = null, RatesUS = null;
let loading = null;

/** Resolve once every model this lane's tasks read has loaded. */
export const load = () => {
  if (!loading) {
    loading = Promise.all([
      import('./scenes.js'), import('./locations.js'), import('./contacts.js'), import('./budget-model.js'),
      import('./costs.js'), import('./budget-line-ids.js'), import('./script.js'), import('./callsheet-text.js'),
      import('./film-region.js'), import('../data/rates.chennai.2024.json'), import('../data/rates.us.json')
    ]).then(([sc, lo, co, bu, cs, li, sp, wa, rg, rin, rus]) => {
      ScenesM = sc; LocM = lo; ContactsM = co; BudgetM = bu; CostsM = cs; LineIds = li; ScriptM = sp; WA = wa; Region = rg;
      RatesIN = rin.default || rin; RatesUS = rus.default || rus;
      return true;
    }).catch((e) => { loading = null; throw e; });
  }
  return loading;
};

/** What a model reply costs the writer to read: a count line, never a claim. */
const sentence = (...parts) => parts.filter(Boolean).join(' ');
const cut = (n, what) => (n ? plural(n, what + ' was', what + 's were') + ' not usable and left out.' : '');

async function ask(system, user, schema, { onStatus, signal, maxTokens = 6000 } = {}) {
  const { parsed, truncated } = await (await ai()).callModelForTask({
    system, user, schema, maxTokens, effort: 'medium', onStatus, signal
  });
  return { parsed, truncated };
}

/* ============================================================
   1. shoot-order
   ============================================================ */
const shootFacts = () => M.shootOrderFacts(ScenesM.listScenes(), { pageTarget: (LocM.schedulePrefs() || {}).pageTarget || 0 });

const shootOrderTask = {
  id: 'shoot-order',
  label: 'Suggest day order',
  kind: 'list',
  editable: false,
  identity() { return 'shoot-order'; },
  input() {
    try {
      const f = shootFacts();
      return f.scenes.length ? M.shootOrderPrompt(f) : 'There are no scenes the board can move yet.';
    } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine } = {}) {
    await load();
    const f = shootFacts();
    if (!f.scenes.length) fail('There are no scenes to place: every scene is either shot or on a day that has begun shooting. Nothing was changed.');
    const { parsed, truncated } = await ask(M.SHOOT_ORDER_SYSTEM,
      M.shootOrderPrompt(f, refineText(refine, M.shootOrderPrevious)), M.shootOrderSchema(), { onStatus, signal });
    const res = M.readShootOrder(parsed, f);
    if (!res.items.length) fail('The model came back with no usable days. Nothing was changed.');
    const placed = res.items.reduce((n, i) => n + i.sceneIds.length, 0);
    const note = sentence(
      'A model’s suggestion for ' + plural(placed, 'scene', 'scenes') + ' over ' + plural(res.items.length, 'day', 'days')
        + '; tick the days you want. Days that have begun shooting and scenes already shot are never moved.',
      res.note, cut(res.dropped, 'scene id'), truncated ? 'The reply was cut short, so some days may be missing.' : '');
    return remember('shoot-order', { items: res.items, note }, {});
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
    if (!records.length) { call(c.say, sentence('Nothing needed to move.', skipped ? plural(skipped, 'scene was', 'scenes were') + ' skipped (shot, or on a day that has begun shooting).' : '')); return null; }
    call(c.say, sentence(plural(records.length, 'scene', 'scenes') + ' placed.',
      skipped ? plural(skipped, 'scene was', 'scenes were') + ' skipped: shot, or on a day that has begun shooting.' : ''));
    call(c.after);
    return () => {
      let back = 0, stale = 0;
      for (const r of records.slice().reverse()) { if (LocM.undoIsCurrent(r) && LocM.undoPlace(r)) back += 1; else stale += 1; }
      call(c.say, sentence(plural(back, 'scene', 'scenes') + ' put back.',
        stale ? plural(stale, 'move', 'moves') + ' left as they are: the board has changed since.' : ''));
      call(c.after);
    };
  }
};

/* ============================================================
   2. recce-notes
   ============================================================ */
const recceFacts = (c) => M.recceFacts(LocM.locationIndex(ScenesM.listScenes()), { only: c.locationName || '' });
const recceNone = (c) => (c.locationName
  ? 'The recce card for ' + c.locationName + ' already has text in every field this can fill, or the place is not in the script.'
  : 'Every place already has text in the recce fields this can fill, or no scene names a location yet.');

const recceTask = {
  id: 'recce-notes',
  label: 'Recce ideas',
  kind: 'list',
  editable: false,
  identity(ctx) { return 'recce:' + String(resolve(ctx).locationName || '*'); },
  input(ctx) {
    const c = resolve(ctx);
    try { const f = recceFacts(c); return f.places.length ? M.reccePrompt(f) : recceNone(c); } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await load();
    const c = resolve(ctx);
    const f = recceFacts(c);
    if (!f.places.length) fail(recceNone(c) + ' Nothing was changed.');
    const { parsed, truncated } = await ask(M.RECCE_SYSTEM, M.reccePrompt(f, refineText(refine, M.reccePrevious)), M.recceSchema(), { onStatus, signal });
    const res = M.readRecce(parsed, f);
    if (!res.items.length) fail('The model came back with nothing usable for these places. Nothing was changed.');
    const note = sentence(
      'A model’s suggestion: these are things to check on the visit, written as "To check:", not findings. '
        + 'Only blank recce fields are filled; address, contact, permission, cost, pin, hospital and police are never touched.',
      cut(res.dropped, 'line'), truncated ? 'The reply was cut short, so some places may be missing.' : '');
    return remember('recce-notes', { items: res.items, note }, {});
  },
  apply(selected, ctx) {
    const c = resolve(ctx);
    const { writes, skipped } = M.planRecceWrites(selected, (n) => LocM.getRecce(n));
    if (!writes.length) { call(c.say, skipped ? plural(skipped, 'field was', 'fields were') + ' filled in since the run, so nothing was written.' : 'Nothing to write.'); return null; }
    for (const w of writes) LocM.setRecce(w.name, w.patch);
    const n = writes.reduce((a, w) => a + Object.keys(w.patch).length, 0);
    call(c.say, sentence(plural(n, 'recce field', 'recce fields') + ' filled across ' + plural(writes.length, 'place', 'places') + '.',
      skipped ? plural(skipped, 'field was', 'fields were') + ' filled in since the run and left as typed.' : ''));
    call(c.after);
    return () => {
      const { blank, kept } = M.planRecceUndo(writes, (name) => LocM.getRecce(name));
      for (const b of blank) LocM.setRecce(b.name, b.patch);
      call(c.say, kept ? plural(kept, 'field was', 'fields were') + ' edited since and left as typed.' : 'The recce fields are blank again.');
      call(c.after);
    };
  }
};

/* ============================================================
   3. budget-estimate
   ============================================================ */
function safeCalc() { try { return BudgetM.readCalcData() || {}; } catch (e) { return null; } }

function budgetFacts() {
  let elements = [];
  try { elements = ScriptM.loadScript().elements || []; } catch (e) { elements = []; }
  let region = '';
  try { region = Region.filmRegion().region || ''; } catch (e) { region = ''; }
  return M.budgetFacts({
    schedule: BudgetM.scheduleFacts(), scenes: ScenesM.listScenes(), scriptElements: elements, region,
    currency: BudgetM.budgetCurrency(), presets: BudgetM.PRESET_ITEMS, data: safeCalc() || {}
  });
}

/** The rate card's per-day band for a preset line, in the budget's currency. */
function bandOf(name, currency) {
  const key = CostsM.rowKey(name);
  if (currency === 'USD') {
    const row = (RatesUS.rows || []).find((r) => CostsM.norm(r.item) === key);
    return row ? BudgetM.usBand(row) : null;
  }
  for (const sec of RatesIN.sections || []) {
    const row = (sec.rows || []).find((r) => CostsM.norm(r.item) === key);
    if (row && row.low > 0 && row.high > 0) return { low: row.low, high: row.high };
  }
  return null;
}

const NO_SCENES = 'There are no scenes yet, so there is no schedule to estimate from. Break the script down first.';

const budgetTask = {
  id: 'budget-estimate',
  label: 'Estimate from my schedule',
  kind: 'list',
  editable: false,
  identity() { return 'budget-estimate'; },
  input() {
    try { const f = budgetFacts(); return f.schedule.scenes ? M.budgetPrompt(f) : NO_SCENES; } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine } = {}) {
    await load();
    const f = budgetFacts();
    if (!f.schedule.scenes) fail(NO_SCENES);
    const { parsed, truncated } = await ask(M.BUDGET_SYSTEM, M.budgetPrompt(f, refineText(refine, M.budgetPrevious)), M.budgetSchema(), { onStatus, signal });
    const res = M.readBudget(parsed, f, (n) => bandOf(n, f.currency));
    if (!res.items.length) fail('The model came back with no new lines to add. Nothing was changed.');
    const flagged = res.items.filter((i) => i.outOfBand).length;
    const note = sentence(
      'A model’s first-pass estimate, not a quote. Ticked lines are added as new rows; no existing line is changed.',
      flagged ? plural(flagged, 'rate sits', 'rates sit') + ' outside the rate card’s band and is flagged.' : '',
      res.duplicates ? plural(res.duplicates, 'line was', 'lines were') + ' already on the sheet and left out.' : '',
      cut(res.dropped, 'line'), res.note, truncated ? 'The reply was cut short, so some lines may be missing.' : '');
    return remember('budget-estimate', { items: res.items, note }, {});
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
   4. callsheet-notes
   ============================================================ */
const sheetNow = (id) => (ContactsM.listCallSheets().find((s) => s.id === id) || null);

function callsheetJob(c) {
  const raw = call(c.facts);
  if (!raw || !c.sheetId) fail('Pick a call sheet first.');
  const facts = M.callsheetFacts(raw);
  return { facts, example: WA.unitMessage(facts, WA.WA_LIMIT) };
}

const callsheetTask = {
  id: 'callsheet-notes',
  label: 'Draft notes',
  kind: 'text',
  editable: false,
  identity(ctx) { return 'sheet:' + String(resolve(ctx).sheetId || ''); },
  input(ctx) {
    try { const j = callsheetJob(resolve(ctx)); return M.callsheetPrompt(j.facts, j.example); } catch (e) { return (e && e.message) || ''; }
  },
  async run(input, { onStatus, signal, refine, ctx } = {}) {
    await load();
    const c = resolve(ctx);
    const j = callsheetJob(c);
    const sheet = sheetNow(c.sheetId);
    if (!sheet) fail('That call sheet has been deleted. Nothing was changed.');
    if (String(sheet.notes || '').trim()) fail('Notes are already written on this sheet, so there is nothing to fill. Clear them first if you want a draft. Nothing was changed.');
    const { parsed } = await ask(M.CALLSHEET_SYSTEM,
      M.callsheetPrompt(j.facts, j.example, refineText(refine, (p) => ({ notes: p && p.proposed || '', unitMessage: (p && p.unit) || '' }))),
      M.callsheetSchema(), { onStatus, signal, maxTokens: 3000 });
    const res = M.readCallsheet(parsed, WA.WA_LIMIT);
    if (!res.notes) fail('The reply held no notes. Nothing was changed.');
    const note = 'A model’s draft from the sheet’s facts only; check it before the day. Accept fills the notes box and keeps no other copy. '
      + (res.unitMessage ? 'Unit message to copy (not stored): ' + res.unitMessage : '');
    return remember('callsheet-notes', { original: '', proposed: res.notes, note, unit: res.unitMessage }, { sheetId: c.sheetId, unit: res.unitMessage });
  },
  apply(selected, ctx, result) {
    const c = resolve(ctx);
    const mem = recall('callsheet-notes', result) || { sheetId: c.sheetId, unit: '' };
    const sheet = sheetNow(mem.sheetId);
    if (!sheet) fail('That call sheet has been deleted. Nothing was changed.');
    const w = M.callsheetWrite(selected, sheet.notes);
    if (!w.write) { call(c.say, w.why === 'filled' ? 'Notes were written on the sheet since the run, so nothing was changed.' : 'Nothing to write.'); return null; }
    ContactsM.updateCallSheet(mem.sheetId, { notes: w.write });
    call(c.say, 'Notes added to the call sheet.');
    if (mem.unit) call(c.offerUnit, mem.unit);
    call(c.after);
    return () => {
      const now = sheetNow(mem.sheetId);
      if (!now) { call(c.say, 'That call sheet has been deleted. Nothing to undo.'); return; }
      if (!M.callsheetUndo(w.write, now.notes)) { call(c.say, 'The notes were edited since and are left as they are.'); return; }
      ContactsM.updateCallSheet(mem.sheetId, { notes: '' });
      call(c.say, 'The notes are blank again.');
      call(c.after);
    };
  }
};

export const TASKS = [shootOrderTask, recceTask, budgetTask, callsheetTask];
export default { TASKS, load };
