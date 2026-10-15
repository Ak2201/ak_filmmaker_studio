/* ============================================================
   DASHBOARD MODEL — every number the dashboard shows, derived
   ------------------------------------------------------------
   Moved out of src/pages/dashboard.js when the view and the logic were
   split (docs/ARCHITECTURE.md). The page builds the DOM from what these
   return; nothing here draws and nothing here writes.

   Every read goes through the storage proxy (src/lib/prefs.js), so it
   is the OPEN project's copy of each scoped key — which is exactly
   right for a page about one film.

   The blueprint field list, the step-to-stage mapping and the "filled"
   rule live in src/lib/journey.js; this file only adapts its answer to
   the shape the dashboard's renderers read.
   ============================================================ */
import { BLUEPRINT, guideProgress, journey, stageStates, suggestNext, lastWorked } from './journey.js';
import { parseNum, fmtINR, INR } from './money.js';
import Scenes, { totalEighths } from './scenes.js';
import Locations from './locations.js';
import Contacts from './contacts.js';
import Shots from './shots.js';
import { loadScript, pageCount } from './script.js';
import { sceneLabel } from './readiness.js';
import { readText } from './prefs.js';
import { LIB_CALC_KEY, ACTIVITY_KEY } from './hub-keys.js';

/* ============================================================
   THE BLUEPRINTS, AS A FIELD LIST — grouped by STAGE
   ------------------------------------------------------------
   The adapter keeps the shape every renderer reads: phases → steps,
   each with done/total by FIELD.
   ============================================================ */
export const BLUEPRINTS = { feature: BLUEPRINT.feature, short: BLUEPRINT.short };

export function blueprintProgress(blueprint, data) {
  const g = guideProgress(blueprint.id, data);
  const phases = g.stages.filter((st) => st.steps.length).map((st) => ({
    id: st.id,
    label: 'Part ' + st.part + ' · ' + st.label,
    hue: st.hue,
    href: blueprint.href,
    steps: st.steps.map((step) => ({ ...step, total: step.fieldsTotal, done: step.fieldsDone })),
    total: st.fields.total,
    done: st.fields.done,
    pct: st.pct
  }));
  return { blueprint, phases, total: g.fields.total, done: g.fields.done, pct: g.pct };
}

/* ============================================================
   READING WHAT IS STORED
   ============================================================ */

/** The open project's copy of a scoped key, through the proxy. */
export function readBlob(key) {
  const raw = readText(key, null);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}

/* Two figures, because a number card is 190px wide and eight digits in
   the display face wrap onto two lines there. The card face gets the
   glanceable magnitude; the exact rupee figure goes in the note under
   it, so nothing is hidden. */
const fmtShort = fmtINR;

export function budgetStatus() {
  const calc = readBlob(LIB_CALC_KEY);
  const rows = {};
  for (const k of Object.keys(calc)) {
    const m = /^ci_(\d+)_(\w+)$/.exec(k);
    if (!m) continue;
    rows[m[1]] = rows[m[1]] || {};
    rows[m[1]][m[2]] = calc[k];
  }
  let lines = 0, total = 0;
  for (const row of Object.values(rows)) {
    const sub = parseNum(row.days) * parseNum(row.rate);
    if (sub > 0) { lines++; total += sub; }
  }
  return {
    lines, total,
    short: total ? fmtShort(total) : '₹ 0',
    exact: '₹ ' + INR.format(Math.round(total))
  };
}

/* ---- recent activity -------------------------------------------
   Already written by the hub under a key store.js scopes per project,
   so this is the open project's history and nobody else's. */
export function recentActivity(limit) {
  const log = readBlob(ACTIVITY_KEY);
  const entries = Array.isArray(log.entries) ? log.entries : [];
  return entries.slice(0, limit);
}

export function relTime(ts) {
  const then = typeof ts === 'number' ? ts : Date.parse(ts);
  if (!Number.isFinite(then)) return '';
  const sec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
  if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
  const days = Math.floor(sec / 86400);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

/* ============================================================
   THE SNAPSHOT — every number this page shows, in one object
   ============================================================ */
export function snapshot(project) {
  const primary = BLUEPRINTS[project.format === 'short' ? 'short' : 'feature'];
  const secondary = primary.id === 'feature' ? BLUEPRINTS.short : BLUEPRINTS.feature;

  const main = blueprintProgress(primary, readBlob(primary.storeKey));
  const other = blueprintProgress(secondary, readBlob(secondary.storeKey));

  const scenes = Scenes.listScenes();
  const days = Locations.calendarDays(scenes);
  const unscheduled = Locations.unscheduledScenes(scenes);
  const contacts = Contacts.listContacts();
  const sheets = Contacts.listCallSheets();
  const shots = Shots.listShots();
  const script = loadScript();
  const budget = budgetStatus();

  const locationCount = new Set(
    scenes.map((s) => String(s.location || '').trim().toLowerCase()).filter(Boolean)
  ).size;
  const scriptPages = pageCount(script.elements);
  const datedDays = days.filter((d) => d.date).length;

  const snap = {
    project, main, other,
    scenes, days, unscheduled, contacts, sheets, shots, script, budget,
    locationCount, scriptPages, datedDays,
    eighths: totalEighths(scenes),
    elements: Scenes.elementIndex().length,
    docs: (script.documents || []).length,
    revisions: (script.revisions || []).length,
    boards: Shots.listBoards().length,
    /* A shot is boarded when a storyboard frame hangs off it. */
    boardedShots: new Set(Shots.listFrames().map((f) => f && f.shotId).filter(Boolean)).size,
    /* Derived like everything else here — journey.js stores nothing. */
    journey: journey(project),
    states: stageStates(project)
  };
  snap.suggest = suggestNext(snap.states);
  snap.resume = lastWorked(snap.states);

  /* "Nothing here yet" has to mean nothing ANYWHERE, or a project with
     four scenes and no prose gets told it is empty. */
  snap.isEmpty =
    main.done === 0 && other.done === 0 && scenes.length === 0 &&
    contacts.length === 0 && shots.length === 0 &&
    (script.elements || []).length === 0 && budget.lines === 0;

  return snap;
}

/* ============================================================
   DATES — shoot days against today
   ============================================================ */
const MS_DAY = 86400000;

/** 'YYYY-MM-DD' as a LOCAL midnight; null when it is not a date. */
export function localDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
export function daysFromToday(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((date - t) / MS_DAY);
}
export function when(n) {
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
}

/** The snapshot's dated days, each with how far from today it is. */
function datedFromToday(snap) {
  return snap.days.map((d) => ({ d, date: localDay(d.date) })).filter((x) => x.date)
    .map((x) => ({ ...x, n: daysFromToday(x.date) }));
}

/* The strip's second line, each one derived from a model and left out
   when there is nothing real to say (owner, 14 Oct 2026: no figure the
   page cannot measure). */
export function sceneTagged(snap) {
  return snap.scenes.filter((s) => Object.values(s.elements || {}).some((v) => Array.isArray(v) && v.length)).length;
}
export function nextDatedDay(snap) {
  return datedFromToday(snap).filter((x) => x.n >= 0).sort((a, b) => a.n - b.n)[0] || null;
}
export function nextShootNote(snap) {
  const nx = nextDatedDay(snap);
  return nx ? 'Day ' + nx.d.day + ' ' + (nx.n === 0 ? 'today' : nx.n === 1 ? 'tomorrow' : 'in ' + nx.n + ' days')
    : snap.datedDays ? '' : snap.days.length ? 'No dates yet' : '';
}
export function crewCastNote(snap) {
  const cast = snap.contacts.filter((c) => c.department === 'Cast').length;
  const crew = snap.contacts.length - cast;
  return cast && crew ? cast + ' cast · ' + crew + ' crew' : '';
}

/** "Next shoot: day 3 · in 2 days", or what is missing instead. */
export function nextShootLine(snap) {
  const upcoming = nextDatedDay(snap);
  return upcoming ? 'Next shoot: day ' + upcoming.d.day + ' · ' + when(upcoming.n)
    : snap.days.length ? 'Shoot countdown: no upcoming dated day.' : 'Shoot countdown: no shoot days planned yet.';
}

/** The dated days from yesterday to a week out, soonest first. */
export function weekDays(snap) {
  return datedFromToday(snap).filter((x) => x.n >= -1 && x.n <= 7)
    .sort((a, b) => a.n - b.n);
}

/** The scene ids any call sheet already covers. */
export function coveredSceneIds(sheets) {
  const covered = new Set();
  sheets.forEach((cs) => (cs.sceneIds || []).forEach((id) => covered.add(id)));
  return covered;
}

/** For the next dated day: its distinct locations and the call sheet
 *  that covers one of its scenes (if any). */
export function dayDetail(snap, day) {
  const places = [...new Set(day.scenes.map((x) => String(x.location || '').trim()).filter(Boolean))];
  const sheet = snap.sheets.find((cs) => (cs.sceneIds || []).some((id) => day.scenes.some((x) => x.id === id)));
  return { places, sheet };
}

/* ============================================================
   READINESS — ordered, because the order IS the advice
   ============================================================ */
/** Failures first and blockers above gaps; more affected first. */
export function sortChecks(checks) {
  const rank = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  return checks.slice().sort((a, b) => rank(a) - rank(b) || b.count - a.count);
}

/** The readiness section's one-line summary. */
export function readinessDeck(r) {
  return r.blockers
    ? r.blockers + ' thing' + (r.blockers === 1 ? '' : 's') + ' would stop a shoot day, and '
      + r.gaps + ' more will cost you one.'
    : r.gaps
      ? 'Nothing blocks a shoot day. ' + r.gaps + ' thing'
        + (r.gaps === 1 ? ' is' : 's are') + ' still missing.'
      : 'Every check passes. Nothing here is missing.';
}

/* ============================================================
   WHAT NOW
   ============================================================ */
export const WHY = {
  start: 'Nothing started yet, so the story is a natural first step.',
  continue: 'Work is under way here.',
  next: 'Everything started is finished; this is the earliest stage not started.'
};

/** Where "Continue" goes: the newest log line, unless it points into a
 *  blueprint, else the stage last worked in / suggested / first. */
export function continueTarget(snap) {
  const log = recentActivity(1)[0];
  if (log && log.url && !/^(feature|short)\.html/.test(log.url)) {
    return { href: log.url, what: String(log.what || 'where you left off'), ts: log.ts };
  }
  const pick = snap.resume || snap.states.find((x) => snap.suggest && x.id === snap.suggest.id) || snap.states[0];
  return { href: pick.href, what: pick.label, ts: snap.resume ? snap.resume.at : null };
}

/** The plan tile's line, from PlanGate.currentPlan() and the plan's name. */
export function planLine(cp, name) {
  /* 'free' is the "no plan" state, never a plan to name (owner, 11 Oct
     2026): it is the free trial, or nothing bought yet. */
  return !name ? 'Not signed in — working locally on this device'
    : cp.plan !== 'free' ? name + ' plan'
    : cp.reason === 'granted' ? 'Access given by the studio'
    : cp.reason === 'trial' ? 'Free trial'
    : cp.reason === 'free' ? 'Free to use right now'
    : 'No plan yet';
}

/* ============================================================
   RECENT — the log plus the shoot day's own marks
   ============================================================ */
/* TWO sources, both read-only. The hub's log (fms_studio_activity_v1)
   only records blueprint progress, the equipment list and backups — it
   does not see scene, contact or script edits. The second source is the
   shoot day's own marks: `shotAt` on a scene, written by shoot.html. No
   other model carries a per-record timestamp. */
export function derivedActivity(scenes) {
  const out = [];
  for (const sc of scenes) {
    if (!sc.shotAt || (sc.shotState !== 'shot' && sc.shotState !== 'part')) continue;
    out.push({
      ts: Date.parse(sc.shotAt),
      what: sceneLabel(sc) + (sc.shotState === 'part' ? ' partly shot' : ' marked shot'),
      url: 'shoot.html'
    });
  }
  return out.filter((e) => Number.isFinite(e.ts));
}

/** The eight newest lines across both sources. */
export function recentEntries(scenes) {
  const logged = recentActivity(12).map((e) => ({
    ts: typeof e.ts === 'number' ? e.ts : Date.parse(e.ts),
    what: String(e.what || e.where || 'Edited'), url: e.url
  }));
  return logged.concat(derivedActivity(scenes))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => b.ts - a.ts).slice(0, 8);
}

/** The Pre-production card's path line, from src/lib/preprod-path.js
 *  (passed in: it is a lazy chunk). '' when there is nothing to say. */
export function pathFactLine(pathModule) {
  const steps = pathModule.pathSteps();
  const next = pathModule.nextStep(steps);
  if (!next) return '';
  return steps.every((s) => s.state === 'done')
    ? 'All ' + steps.length + ' steps done'
    : 'Step ' + next.n + ' of ' + steps.length + ' · next: ' + next.label;
}

export default {
  BLUEPRINTS, blueprintProgress, readBlob, budgetStatus, recentActivity, relTime, snapshot,
  localDay, daysFromToday, when, sceneTagged, nextDatedDay, nextShootNote, crewCastNote,
  nextShootLine, weekDays, coveredSceneIds, dayDetail, sortChecks, readinessDeck, WHY,
  continueTarget, planLine, derivedActivity, recentEntries, pathFactLine
};
