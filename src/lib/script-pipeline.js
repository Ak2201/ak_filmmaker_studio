/* ============================================================
   SCRIPT PIPELINE — "start from the script, do everything on your own"
   ------------------------------------------------------------
   Owner, 20 Oct 2026: import a script and the studio covers it start
   to end — scenes, cast, characters, locations, props, shot division,
   a first schedule, the budget's days — by RULES, before any AI. The
   AI half (src/ui/pipeline-checklist.js "Enhance with AI") is the
   existing Desk tasks, review first, on the writer's own key.

   NOTHING NEW IS INVENTED HERE. Every step is a call into the model
   that already owns the thing:

     scenes      runBreakdown()            breakdown-run.js
                 (every heading a scene row, cast tagged from cues)
     characters  mergeWithCues() + adopt() characters.js — speakers
                 the bible does not hold yet, who speak in two scenes
                 or more, become bible rows (a name and nothing else)
     locations   locationIndex()           locations.js — derived
     props       suggestAll()              screenplay-analysis.js —
                 SUGGESTIONS for the Breakdown's review tab, never tags
     shots       proposeShots() + appendShots()  breakdown-extras.js
                 (shot-rules.js basicJobs → basicShotDivisionSync),
                 only for scenes with no shot at all
     days        locationIndex() order, placeScene()  locations.js —
                 unscheduled scenes only, grouped by place, a day
                 capped at dpr.js's page target, numbered after the
                 last day in use
     budget      readCalcData() / saveCalcData()  budget-model.js —
                 the shoot length into estimate lines whose days are
                 BLANK; a line that has days is somebody's decision
     analysis    castMatrix(), screenTime(), the tension read —
                 DERIVED, stored nowhere (script-analysis-model.js)

   THE LOCK'S SEVEN (docs/LOCK-EXTRACT.md, `lockOnly: true`): synopsis,
   extras, tags (lock-extract.js), castcontacts, recce, sheets,
   budgetlines (lock-seed.js). They run and plan ONLY when the caller
   passes `lock: true`; without it STEPS shown, summary and behaviour
   are exactly what they were. `categories` (undefined = all) is the
   writer's ticked element categories and governs extras and tags.

   THE RULES.
     · Each step writes only into BLANK places, so a second run writes
       nothing and a person's edit is never overwritten.
     · NO NEW STORAGE KEY. The writes land in the keys those models
       already own.
     · UNDO IS IN MEMORY, per run. Before a step writes, the raw values
       of the keys it may touch are read; after, again. Undo walks the
       steps backwards: a key still holding exactly what the step left
       goes back byte for byte (removed if it was absent); a key edited
       since falls back to the step's own surgical undo (untag what it
       tagged, bin the rows it added, drop the shots it made, unplace
       what it placed), so an undo never takes a later edit with it.

   LOGIC ONLY (test:layers): no document, no view import. Node-tested
   by scripts/test-pipeline.mjs (npm run test:pipeline).
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import { SCENES_KEY, listScenes, tagMany, untagMany, totalEighths, formatEighths } from './scenes.js';
import { BIN_KEY, unaddScenes } from './scene-bin.js';
import { loadScript, SCRIPT_KEY } from './script.js';
import { headingsOf } from './scene-sync.js';
import { runBreakdown } from './breakdown-run.js';
import { loadCharacters, saveCharacters, mergeWithCues, adopt, CHARACTERS_KEY } from './characters.js';
import { castMatrix, screenTime, suggestAll, cueName, formatDuration } from './screenplay-analysis.js';
import { locationIndex, placeScene, undoPlace, shootDayOf, LOCATIONS_KEY } from './locations.js';
import { listShots, saveShots, SHOTS_KEY } from './shots.js';
import { proposeShots, appendShots, scenesWithShots } from './breakdown-extras.js';
import { readCalcData, saveCalcData, scheduleFacts, CALC_KEY } from './budget-model.js';
import { pageTarget } from './dpr.js';
import { analyseScript } from './script-analysis-model.js';
import { CONTACTS_KEY } from './contacts.js';
import { planSynopses, applySynopses, undoSynopses, planExtras, planTags, tagCountsByCategory } from './lock-extract.js';
import {
  planCastContacts, seedCastContacts, undoCastContacts, planRecce, seedRecce, undoRecce,
  planCallSheets, seedCallSheets, undoCallSheets, planBudgetLines, seedBudgetLines, undoBudgetLines
} from './lock-seed.js';

/** A speaker the bible does not hold is adopted when they speak in at
 *  least this many scenes: the cast, not every waiter with one line. */
export const ADOPT_MIN_SCENES = 2;

export const STEPS = [
  { id: 'scenes', label: 'Scenes and cast', what: 'Every scene heading becomes a scene, and the people with lines in it are tagged as its cast.' },
  { id: 'characters', label: 'Characters', what: 'Speaking characters who appear in two scenes or more join the Story Bible.' },
  { id: 'synopsis', lockOnly: true, label: 'Scene synopses', what: 'Each scene with no synopsis takes the first sentence of its first action line.' },
  { id: 'extras', lockOnly: true, label: 'Background and extras', what: 'Crowd words in the action lines become background tags, with the count when the script states it.' },
  { id: 'tags', lockOnly: true, label: 'Pre-tagged elements', what: 'Props, vehicles, sound and the rest that the action lines call for are tagged on the scenes you left ticked.' },
  { id: 'locations', label: 'Locations', what: 'Every place the headings name, with its scenes and pages.' },
  { id: 'props', label: 'Props and elements', what: 'Props, vehicles, sound and the rest that the action lines call for, as suggestions to accept on the Breakdown.' },
  { id: 'shots', label: 'Shot division', what: 'A first shot list for every scene that has none, by the basic rules.' },
  { id: 'days', label: 'Shooting days', what: 'Scenes with no day are grouped by place into proposed days on the Stripboard.' },
  { id: 'castcontacts', lockOnly: true, label: 'Cast contacts', what: 'Each speaking character with no contact gets a "To be cast" row on Contacts.' },
  { id: 'recce', lockOnly: true, label: 'Recce cards', what: 'Each location with no recce card gets one, with the time of day its scenes need.' },
  { id: 'sheets', lockOnly: true, label: 'Draft call sheets', what: 'Each shooting day with no call sheet gets a draft, with its scenes and cast; every time stays blank.' },
  { id: 'budget', label: 'Budget days', what: 'Estimate lines with no days take the shoot length.' },
  { id: 'budgetlines', lockOnly: true, label: 'Budget lines', what: 'New estimate lines from the schedule and the Breakdown, with days filled and rates left blank.' },
  { id: 'analysis', label: 'Screen time, cast and tension', what: 'Read from the script and the scenes; nothing is stored.' }
];
const stepMeta = new Map(STEPS.map((s) => [s.id, s]));

/* A category id as words, singular for one ("1 vehicle", not
   "1 vehicles" — QA r4). Ids without an entry are already a mass noun. */
const CAT_WORDS = { props: ['prop', 'props'], vehicles: ['vehicle', 'vehicles'], animals: ['animal', 'animals'],
  stunts: ['stunt', 'stunts'], extras: ['background extra', 'background extras'], setdressing: ['set dressing', 'set dressing'],
  special: ['special equipment', 'special equipment'] };
const catCount = (k, n) => { const w = CAT_WORDS[k]; return n + ' ' + (w ? w[n === 1 ? 0 : 1] : k); };
const plural = (n, one, many) => n + ' ' + (n === 1 ? one : (many || one + 's'));
const tick = () => new Promise((r) => setTimeout(r, 0));

/* ---- raw reads, for the exact undo ---------------------------- */
const read = (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } };
function put(k, v) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { /* private mode */ }
}
const snap = (keys) => new Map(keys.map((k) => [k, read(k)]));

/* ---- what is still blank -------------------------------------- */

function elementsOf(opts) {
  if (opts && Array.isArray(opts.elements)) return { elements: opts.elements, numbering: opts.numbering };
  const doc = loadScript();
  return { elements: doc.elements || [], numbering: opts && opts.numbering !== undefined ? opts.numbering : doc.numbering };
}

/** Speakers no stored character claims, with the scenes they speak in. */
function freshSpeakers(elements, scenes) {
  const list = loadCharacters();
  const derived = mergeWithCues(list, elements).filter((c) => c.derived);
  const byKey = new Map(castMatrix(scenes, elements).characters.map((c) => [c.key, c]));
  return derived.map((c) => {
    const m = byKey.get(cueName(c.name));
    return { name: c.name, cues: c.cues, scenes: m ? m.scenes.size : 0 };
  });
}

function unscheduled(scenes) { return scenes.filter((s) => !shootDayOf(s)); }

/** Estimate lines (an item, a custom name or a rate) whose days are blank. */
function blankDayLines(data) {
  const rows = new Set();
  for (const k of Object.keys(data || {})) {
    const m = k.match(/^ci_(\d+)_(item|custom|rate)$/);
    if (m && String(data[k] ?? '').trim()) rows.add(m[1]);
  }
  return [...rows].filter((n) => !String((data || {})['ci_' + n + '_days'] ?? '').trim())
    .sort((a, b) => a - b);
}

/* The one count of element suggestions, by category (cast is the Story
   Bible's, not an element). planPipeline() and stepProps() both read it,
   and the lock's review sheet reads `byCategory` off the props row. */
function propTally(scenes, elements) {
  const byCategory = {};
  let n = 0;
  for (const r of suggestAll(scenes, elements)) {
    for (const [cat, list] of Object.entries(r.suggestions)) {
      if (cat === 'cast' || !list.length) continue;
      byCategory[cat] = (byCategory[cat] || 0) + list.length;
      n += list.length;
    }
  }
  return { n, byCategory };
}

/**
 * What a run would do now, step by step, without doing it.
 * [{ id, label, what, todo, note }] — `todo` is how many things are
 * still blank (0: nothing to do), `note` one plain line.
 */
export function planPipeline(opts = {}) {
  const { elements } = elementsOf(opts);
  const lock = !!opts.lock;
  const categories = Array.isArray(opts.categories) ? opts.categories : undefined;
  const heads = headingsOf(elements);
  const scenes = listScenes();
  const linked = new Set(scenes.map((s) => s.scriptElId).filter(Boolean));
  const out = [];
  const add = (id, todo, note, extra) => out.push({ ...stepMeta.get(id), todo, note, ...extra });

  const newHeads = heads.filter((x) => !linked.has(x.id)).length;
  add('scenes', newHeads, !heads.length ? 'The script has no scene headings yet.'
    : newHeads ? plural(newHeads, 'heading') + ' not in the Breakdown yet.' : 'Every heading is a scene already.');

  const fresh = freshSpeakers(elements, scenes).filter((c) => c.scenes >= ADOPT_MIN_SCENES);
  add('characters', fresh.length, fresh.length ? plural(fresh.length, 'speaking character') + ' not in the Story Bible yet.' : 'Every recurring speaker is in the Story Bible.');

  if (lock) {
    const later = 'Made once the scenes exist.';
    const some = scenes.length > 0;
    const syn = some ? planSynopses(scenes, elements).length : 0;
    add('synopsis', syn, !some ? later : syn ? plural(syn, 'scene') + ' with no synopsis.' : 'Every scene has a synopsis, or no action line to read one from.');
    const ext = some && (!categories || categories.includes('extras')) ? planExtras(scenes, elements).length : 0;
    add('extras', ext, !some ? later : ext ? plural(ext, 'background tag') + ' to add.' : 'No crowd words left to tag.');
    const tg = some ? planTags(scenes, elements, categories).length : 0;
    add('tags', tg, !some ? later : tg ? plural(tg, 'element') + ' to tag.' : 'No element left to tag.', { byCategory: some ? tagCountsByCategory(scenes, elements) : {} });
  }

  const places = locationIndex(scenes).length;
  add('locations', 0, scenes.length ? plural(places, 'location') + ' named so far.' : 'Read from the scenes once they exist.');

  const tally = scenes.length ? propTally(scenes, elements) : { n: 0, byCategory: {} };
  const props = tally.n;
  add('props', props, scenes.length ? plural(props, 'suggestion') + ' waiting for review.' : 'Read from the scenes once they exist.', { byCategory: tally.byCategory });

  const have = scenesWithShots(listShots());
  const noShots = scenes.filter((s) => !have.has(String(s.id))).length + (scenes.length ? 0 : heads.length);
  add('shots', noShots, noShots ? plural(noShots, 'scene') + ' without a shot.' : 'Every scene has shots.');

  const open = scenes.length ? unscheduled(scenes).length : heads.length;
  add('days', open, open ? plural(open, 'scene') + ' without a shooting day.' : 'Every scene has a day.');

  if (lock) {
    const later = 'Made once the scenes exist.';
    const some = scenes.length > 0;
    const n = (fn) => (some ? fn() : 0);
    const cc = n(() => planCastContacts({ scenes, elements }));
    add('castcontacts', cc, !some ? later : cc ? plural(cc, 'speaking character') + ' with no contact.' : 'Every speaker has a contact.');
    const rc = n(() => planRecce(scenes));
    add('recce', rc, !some ? later : rc ? plural(rc, 'location') + ' with no recce card.' : 'Every location has a recce card.');
    const cs = n(() => planCallSheets(scenes));
    add('sheets', cs, !some ? later : cs ? plural(cs, 'shooting day') + ' with no call sheet.' : 'Every shooting day has a sheet, or none is scheduled yet.');
  }

  let lines = [];
  try { lines = blankDayLines(readCalcData()); } catch (e) { lines = []; }
  add('budget', lines.length, lines.length ? plural(lines.length, 'estimate line') + ' with no days.' : 'No estimate line is waiting for days.');

  if (lock) {
    const bl = scenes.length ? planBudgetLines({ scenes, elements }) : 0;
    add('budgetlines', bl, !scenes.length ? 'Made once the scenes exist.' : bl ? plural(bl, 'budget line') + ' to add, rates left blank.' : 'Every line the schedule calls for is in the estimate, or no day is scheduled yet.');
  }

  add('analysis', 0, 'Derived on every view.');
  return out;
}

/* ---- the steps ------------------------------------------------ */

/* Each returns { status, wrote, count, detail, surgical() }.
   status 'done' (wrote something) | 'nothing' (nothing blank) |
   'derived' (read only) | 'skipped' (cannot run yet). */

function stepScenes(ctx) {
  if (!headingsOf(ctx.elements).length) return { status: 'skipped', wrote: 0, count: listScenes().length, detail: 'The script has no scene headings yet, so there is nothing to break down.' };
  const before = new Set(listScenes().map((s) => s.id));
  /* fillOnly: a linked row keeps the place, time and number somebody
     typed on the Breakdown, and a script that would send rows to the
     bin (or bring them back) is left for the scene sync, which says so
     with its own Undo — binning takes a scene's shots and sheets with
     it, and that is not filling a blank. */
  const res = runBreakdown({ elements: ctx.elements, numbering: ctx.numbering, fillOnly: true });
  const a = res.applied;
  if (a.refused) {
    const why = [];
    if (a.wouldBin) why.push(a.wouldBin === 1 ? '1 scene on the Breakdown has lost its heading in this script' : a.wouldBin + ' scenes on the Breakdown have lost their heading in this script');
    if (a.wouldRestore) why.push(plural(a.wouldRestore, 'heading') + ' would bring a scene back from the bin');
    return {
      status: 'skipped', wrote: 0, count: res.totals.scenes,
      detail: 'Nothing was changed: ' + why.join(', and ') + '. Manual breakdown on the Breakdown sorts that out (the bin keeps every scene, restorable); then run this again.'
    };
  }
  const addedIds = res.scenes.map((s) => s.id).filter((id) => !before.has(id));
  const renumbered = Math.max(0, a.scenesUpdated - a.scenesLinked);
  const wrote = addedIds.length + a.castTagged + a.scenesUpdated;
  const bits = [];
  if (addedIds.length) bits.push(plural(addedIds.length, 'scene') + ' added');
  if (a.scenesLinked) bits.push(a.scenesLinked === 1 ? '1 scene linked to its heading' : a.scenesLinked + ' scenes linked to their headings');
  if (renumbered) bits.push(renumbered === 1 ? '1 scene given its locked number' : renumbered + ' scenes given their locked numbers');
  if (a.castTagged) bits.push(plural(a.castTagged, 'cast tag'));
  return {
    status: wrote ? 'done' : 'nothing', wrote, count: res.totals.scenes,
    detail: (bits.length ? bits.join(', ') : 'Nothing new') + ' — ' + plural(res.totals.scenes, 'scene') + ', ' + res.totals.pages + ' pages.',
    surgical: () => { untagMany(a.tags); if (addedIds.length) unaddScenes(addedIds); }
  };
}

function stepCharacters(ctx) {
  const scenes = listScenes();
  const fresh = freshSpeakers(ctx.elements, scenes);
  const want = fresh.filter((c) => c.scenes >= ADOPT_MIN_SCENES);
  const total = mergeWithCues(loadCharacters(), ctx.elements).filter((c) => c.cues > 0).length;
  /* Say WHY nothing was added (QA r4): "every recurring one is already
     in the Story Bible" was printed over an empty Bible whenever nobody
     spoke in two scenes. */
  if (!want.length) {
    const why = !total ? 'No speaking characters yet.'
      : fresh.length ? plural(total, 'speaking character') + '; none of the new ones speaks in more than one scene, so none was added.'
        : plural(total, 'speaking character') + '; every one is already in the Story Bible.';
    return { status: 'nothing', wrote: 0, count: total, detail: why };
  }
  const list = loadCharacters();
  const made = [];
  for (const c of want) {
    const n = list.length;
    const row = adopt(list, c.name);
    if (list.length > n) made.push(row.id);
  }
  if (made.length) saveCharacters(list);
  return {
    status: made.length ? 'done' : 'nothing', wrote: made.length, count: total,
    detail: plural(total, 'speaking character') + '; ' + plural(made.length, 'character') + ' added to the Story Bible.',
    surgical: () => {
      const ids = new Set(made);
      saveCharacters(loadCharacters().filter((c) => !ids.has(c.id)));
    }
  };
}

function stepLocations() {
  const ix = locationIndex(listScenes());
  return { status: 'derived', wrote: 0, count: ix.length, detail: ix.length ? plural(ix.length, 'location') + ': ' + ix.slice(0, 4).map((l) => l.name).join(', ') + (ix.length > 4 ? '…' : '') + '.' : 'No location named yet.' };
}

function stepProps(ctx) {
  const { n, byCategory: byCat } = propTally(listScenes(), ctx.elements);
  const top = Object.entries(byCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => catCount(k, v));
  if (ctx.tagged) {
    return { status: 'derived', wrote: 0, count: n, byCategory: byCat, detail: ctx.tagged + ' tagged at the lock, ' + (n ? n + ' left to review on the Breakdown.' : 'nothing left to review.') };
  }
  return { status: 'derived', wrote: 0, count: n, byCategory: byCat, detail: n ? plural(n, 'suggestion') + ' (' + top.join(', ') + ') to accept or ignore on the Breakdown — nothing is tagged until you do.' : 'Nothing in the action lines calls for an element yet.' };
}

function stepShots(ctx) {
  const scenes = listScenes();
  const existing = listShots();
  const have = scenesWithShots(existing);
  const target = scenes.filter((s) => !have.has(String(s.id)));
  if (!target.length) return { status: 'nothing', wrote: 0, count: existing.length, detail: plural(existing.length, 'shot') + '; every scene already has some.' };
  const prop = proposeShots({ scenes, elements: ctx.elements, only: target.map((s) => s.id) });
  if (!prop.items.length) return { status: 'nothing', wrote: 0, count: existing.length, detail: 'No script pages to read for the scenes without shots.' };
  const { shots, made } = appendShots(existing, prop.items);
  saveShots(shots);
  return {
    status: 'done', wrote: made.length, count: shots.length,
    detail: plural(made.length, 'shot') + ' for ' + plural(prop.scenes, 'scene') + ', by the basic rules (marked as rules, edit freely).',
    surgical: () => { const ids = new Set(made); saveShots(listShots().filter((s) => !ids.has(s.id))); }
  };
}

/** Proposed days: unscheduled scenes by place (longest place first, the
 *  order a schedule is built in), script order inside a place, a day
 *  closed when the next scene would take it past the page target
 *  (dpr.js pageTarget(), the Stripboard's own day load). */
export function proposeDays(scenes, { target = pageTarget(), startAt = 1 } = {}) {
  const open = new Set(unscheduled(scenes).map((s) => s.id));
  const groups = locationIndex(scenes).map((l) => l.scenes.filter((s) => open.has(s.id)))
    .filter((g) => g.length);
  const nameless = scenes.filter((s) => open.has(s.id) && !String(s.location || '').trim());
  if (nameless.length) groups.push(nameless);
  const order = new Map(scenes.map((s, i) => [s.id, i]));
  const plan = [];
  /* Places follow each other on a day while it has room (two short
     places on one day is how a schedule saves money); a place that
     does not fit carries on onto the next day. */
  let day = startAt - 1;
  let load = Infinity;
  for (const g of groups) {
    g.sort((a, b) => order.get(a.id) - order.get(b.id));
    for (const s of g) {
      const e = Math.max(1, Number(s.eighths) || 0);
      if (load + e > target && load > 0) { day++; load = 0; }
      load += e;
      plan.push({ id: s.id, day });
    }
  }
  return { plan, days: plan.length ? day - startAt + 1 : 0 };
}

function stepDays() {
  const scenes = listScenes();
  const open = unscheduled(scenes);
  if (!scenes.length) return { status: 'skipped', wrote: 0, count: 0, detail: 'No scenes to schedule yet.' };
  if (!open.length) {
    const days = new Set(scenes.map(shootDayOf)).size;
    return { status: 'nothing', wrote: 0, count: days, detail: 'Every scene already has a shooting day.' };
  }
  const last = scenes.reduce((n, s) => Math.max(n, shootDayOf(s)), 0);
  const { plan, days } = proposeDays(scenes, { startAt: last + 1 });
  const records = [];
  for (const p of plan) { const r = placeScene(p.id, p.day); if (r) records.push(r); }
  const total = new Set(listScenes().map(shootDayOf).filter(Boolean)).size;
  return {
    status: records.length ? 'done' : 'nothing', wrote: records.length, count: total,
    detail: plural(records.length, 'scene') + ' proposed onto ' + plural(days, 'new day') + ', grouped by place, at most ' + formatEighths(pageTarget()) + ' pages a day. Move any of them on the Stripboard.',
    surgical: () => { for (const r of records.slice().reverse()) undoPlace(r); }
  };
}

function stepBudget() {
  let data;
  try { data = readCalcData(); } catch (e) { return { status: 'skipped', wrote: 0, count: 0, detail: 'The saved estimate could not be read, so it was left alone.' }; }
  const days = scheduleFacts().totalDays;
  const lines = blankDayLines(data);
  if (!days) return { status: 'skipped', wrote: 0, count: 0, detail: 'No shooting days yet, so there is nothing to put in the estimate.' };
  if (!lines.length) return { status: 'nothing', wrote: 0, count: days, detail: 'No estimate line is waiting for days (' + plural(days, 'shooting day') + ').' };
  const was = new Map(lines.map((n) => ['ci_' + n + '_days', Object.prototype.hasOwnProperty.call(data, 'ci_' + n + '_days') ? data['ci_' + n + '_days'] : undefined]));
  for (const k of was.keys()) data[k] = String(days);
  saveCalcData(data);
  return {
    status: 'done', wrote: lines.length, count: days,
    detail: plural(lines.length, 'estimate line') + ' set to ' + plural(days, 'day') + '; lines that had days were left alone.',
    surgical: () => {
      let cur;
      try { cur = readCalcData(); } catch (e) { return; }
      for (const [k, v] of was) {
        if (String(cur[k] ?? '') !== String(days)) continue;   // edited since: theirs now
        if (v === undefined) delete cur[k]; else cur[k] = v;
      }
      saveCalcData(cur);
    }
  };
}

function stepAnalysis(ctx) {
  const scenes = listScenes();
  const a = analyseScript({ elements: ctx.elements, scenes });
  const screen = screenTime(scenes, ctx.elements);
  const cast = castMatrix(scenes, ctx.elements);
  const peak = a.tension.peak;
  const bits = [];
  if (screen.total) bits.push('about ' + formatDuration(screen.total) + ' on screen');
  if (cast.characters.length) bits.push(plural(cast.characters.length, 'character') + ' across the scenes');
  if (peak) bits.push('tension peaks in scene ' + (peak.number || '—'));
  return { status: 'derived', wrote: 0, count: a.scenes.length, analysis: a, detail: bits.length ? bits.join(', ') + '.' : 'Nothing to read yet.' };
}

/* ---- the lock's seven ------------------------------------------ */

const wants = (ctx, cat) => !Array.isArray(ctx.categories) || ctx.categories.includes(cat);
const none = (detail) => ({ status: 'nothing', wrote: 0, count: 0, detail });
const noScenes = () => ({ status: 'skipped', wrote: 0, count: 0, detail: 'No scenes yet, so there is nothing to read.' });

function stepSynopsis(ctx) {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const written = applySynopses(planSynopses(scenes, ctx.elements));
  if (!written.length) return none('Every scene has a synopsis already, or no action line to read one from.');
  return {
    status: 'done', wrote: written.length, count: written.length,
    detail: plural(written.length, 'scene') + ' given a one-line synopsis from its first action line.',
    surgical: () => { undoSynopses(written); }
  };
}

function stepExtras(ctx) {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  if (!wants(ctx, 'extras')) return none('Background and extras was left unticked.');
  const written = tagMany(planExtras(scenes, ctx.elements).map(({ sceneId, category, name }) => ({ sceneId, category, name })));
  if (!written.length) return none('No crowd words left to tag.');
  return {
    status: 'done', wrote: written.length, count: written.length,
    detail: plural(written.length, 'background tag') + ' read from the action lines, with the count where the script states one.',
    surgical: () => { untagMany(written); }
  };
}

function stepTags(ctx) {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const written = tagMany(planTags(scenes, ctx.elements, ctx.categories));
  ctx.tagged = written.length;
  if (!written.length) return none('No element left to tag.');
  return {
    status: 'done', wrote: written.length, count: written.length,
    detail: plural(written.length, 'element') + ' tagged on the scenes, from the categories you left ticked.',
    surgical: () => { untagMany(written); }
  };
}

function stepCastContacts(ctx) {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const r = seedCastContacts({ scenes, elements: ctx.elements });
  const made = (r && r.made) || [];
  if (!made.length) return none('Every speaker already has a contact.');
  return {
    status: 'done', wrote: made.length, count: made.length,
    detail: plural(made.length, 'speaking character') + ' added to Contacts as "To be cast".',
    surgical: () => { undoCastContacts(made); }
  };
}

function stepRecce() {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const made = (seedRecce(scenes) || {}).made || [];
  if (!made.length) return none('Every location already has a recce card.');
  return {
    status: 'done', wrote: made.length, count: made.length,
    detail: plural(made.length, 'recce card') + ' started, with the time of day each location needs.',
    surgical: () => { undoRecce(made); }
  };
}

function stepSheets() {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const made = (seedCallSheets(scenes) || {}).made || [];
  if (!made.length) return none('Every shooting day has a call sheet, or none is scheduled yet.');
  return {
    status: 'done', wrote: made.length, count: made.length,
    detail: plural(made.length, 'call sheet') + ' drafted with scenes and cast; every time is left blank.',
    surgical: () => { undoCallSheets(made); }
  };
}

function stepBudgetLines(ctx) {
  const scenes = listScenes();
  if (!scenes.length) return noScenes();
  const made = (seedBudgetLines({ scenes, elements: ctx.elements }) || {}).made || [];
  if (!made.length) return none('Every line the schedule calls for is in the estimate, or no day is scheduled yet.');
  return {
    status: 'done', wrote: made.length, count: made.length,
    detail: plural(made.length, 'budget line') + ' added from the schedule and the Breakdown; rates are left blank.',
    surgical: () => { undoBudgetLines(made); }
  };
}

const RUN = {
  scenes: { keys: [SCENES_KEY, BIN_KEY], fn: stepScenes },
  characters: { keys: [CHARACTERS_KEY], fn: stepCharacters },
  synopsis: { keys: [SCENES_KEY], fn: stepSynopsis },
  extras: { keys: [SCENES_KEY], fn: stepExtras },
  tags: { keys: [SCENES_KEY], fn: stepTags },
  locations: { keys: [], fn: stepLocations },
  props: { keys: [], fn: stepProps },
  shots: { keys: [SHOTS_KEY], fn: stepShots },
  days: { keys: [SCENES_KEY, LOCATIONS_KEY], fn: stepDays },
  castcontacts: { keys: [CONTACTS_KEY], fn: stepCastContacts },
  recce: { keys: [LOCATIONS_KEY], fn: stepRecce },
  sheets: { keys: [CONTACTS_KEY], fn: stepSheets },
  budget: { keys: [CALC_KEY], fn: stepBudget },
  budgetlines: { keys: [CALC_KEY], fn: stepBudgetLines },
  analysis: { keys: [], fn: stepAnalysis }
};

/* ---- the run --------------------------------------------------- */

/**
 * Run every step in order. `onStep(step, index, steps)` is called as a
 * step starts (status 'running') and again when it ends. `only` limits
 * the run to some step ids. Resolves to
 *   { steps: [{ id, label, status, wrote, count, detail, changed, undo }],
 *     summary, wrote, undoable, undo() }
 * `undo()` reverses the whole run (last step first) and reports how
 * many steps it reversed. Nothing about the run is stored.
 */
export async function runPipeline(opts = {}) {
  const { elements, numbering } = elementsOf(opts);
  const only = opts.only ? new Set(opts.only) : null;
  const onStep = typeof opts.onStep === 'function' ? opts.onStep : () => {};
  const lock = !!opts.lock;
  const ctx = { elements, numbering, lock, categories: Array.isArray(opts.categories) ? opts.categories : undefined };
  const steps = STEPS.filter((s) => (lock || !s.lockOnly) && (!only || only.has(s.id))).map((s) => ({ ...s, status: 'waiting', wrote: 0, count: 0, detail: '' }));
  for (let i = 0; i < steps.length; i++) {
    const st = steps[i];
    st.status = 'running';
    try { onStep(st, i, steps); } catch (e) { /* the view */ }
    if (opts.yield !== false) await tick();
    const { keys, fn } = RUN[st.id];
    const before = snap(keys);
    let r;
    try { r = fn(ctx) || {}; }
    catch (e) {
      console.warn('[pipeline] ' + st.id, e);
      r = { status: 'error', wrote: 0, detail: 'This step could not run: ' + ((e && e.message) || 'unknown error') + '. The other steps carried on.' };
    }
    const after = snap(keys);
    const surgical = r.surgical;
    delete r.surgical;
    Object.assign(st, r);
    const changed = keys.filter((k) => before.get(k) !== after.get(k));
    st.changed = changed.length;
    st.undo = !changed.length ? () => false : () => {
      const clean = changed.every((k) => read(k) === after.get(k));
      if (clean) { for (const k of changed) put(k, before.get(k)); return true; }
      if (typeof surgical === 'function') { try { surgical(); } catch (e) { console.warn('[pipeline] undo ' + st.id, e); } }
      return true;
    };
    try { onStep(st, i, steps); } catch (e) { /* the view */ }
  }
  let undone = false;
  return {
    steps,
    wrote: steps.reduce((n, s) => n + (s.wrote || 0), 0),
    /* Undo is offered whenever a step changed a key, whatever it
       counted as written: a count can miss a write, a key cannot. */
    undoable: steps.some((s) => s.changed > 0),
    summary: summarizeRun(steps),
    undo() {
      if (undone) return 0;
      undone = true;
      let n = 0;
      for (const st of steps.slice().reverse()) if (st.undo && st.undo()) n++;
      return n;
    }
  };
}

/** The one-line summary: "42 scenes, 18 characters, 63 props suggested, 210 shots…". */
export function summarizeRun(steps) {
  const by = new Map((steps || []).map((s) => [s.id, s]));
  const c = (id) => (by.get(id) || {}).count || 0;
  const parts = [];
  if (by.has('scenes')) parts.push(plural(c('scenes'), 'scene'));
  if (by.has('characters')) parts.push(plural(c('characters'), 'character'));
  if (by.has('locations')) parts.push(plural(c('locations'), 'location'));
  if (by.has('props')) parts.push(c('props') + ' ' + (c('props') === 1 ? 'prop or element' : 'props and elements') + ' suggested');
  if (by.has('shots')) parts.push(plural(c('shots'), 'shot'));
  if (by.has('days')) parts.push(plural(c('days'), 'shooting day'));
  const w = (id) => (by.get(id) || {}).wrote || 0;
  if (w('castcontacts')) parts.push(plural(w('castcontacts'), 'cast contact') + ' to be cast');
  if (w('recce')) parts.push(plural(w('recce'), 'recce card'));
  if (w('sheets')) parts.push(plural(w('sheets'), 'call sheet'));
  if (w('budgetlines')) parts.push(plural(w('budgetlines'), 'budget line') + ' (rates blank)');
  const an = by.get('analysis');
  const runtime = an && an.analysis && an.analysis.totals.seconds ? formatDuration(an.analysis.totals.seconds) + ' estimated running time' : '';
  if (runtime) parts.push(runtime);
  return {
    text: parts.join(', ') + (parts.length ? '.' : ''),
    scenes: c('scenes'), characters: c('characters'), locations: c('locations'),
    props: c('props'), shots: c('shots'), days: c('days'),
    synopses: w('synopsis'), extras: w('extras'), tagged: w('tags'), contacts: w('castcontacts'),
    recces: w('recce'), sheets: w('sheets'), budgetLines: w('budgetlines'),
    pages: formatEighths(totalEighths(listScenes())), runtime
  };
}

export default { STEPS, planPipeline, runPipeline, summarizeRun, proposeDays, ADOPT_MIN_SCENES };
// SCRIPT_KEY is the script the steps read (elementsOf); exported for the view's storage listener.
export { SCRIPT_KEY };
