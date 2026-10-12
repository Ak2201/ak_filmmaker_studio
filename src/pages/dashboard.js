/* ============================================================
   DASHBOARD — where the open project actually stands
   ------------------------------------------------------------
   A LANDING PAGE, not another editor. Nothing here is typed and
   nothing here is stored: every number on this page is derived, on
   render, from the models that already own it —

     src/lib/scenes.js      scenes, eighths, locations, elements
     src/lib/locations.js   shoot days, unscheduled scenes
     src/lib/contacts.js    crew and cast, call sheets
     src/lib/shots.js       shots, frames, boards
     src/lib/script.js      screenplay pages
     src/data/steps.*.json  the blueprint field list
     fms_library_calc_v1 the budget rows
     fms_studio_activity_v1  what the hub already logs

   WHY IT STORES NOTHING. A dashboard is the most tempting place in
   an app to invent state — "last visited", "dismissed tips", a
   cached progress number. Each one would be a new localStorage key,
   and a new key here costs four registrations (SCOPED_KEYS in
   store.js, PROJECT_KEYS and ALL_KEYS in hub.js, the Supabase scope
   list) or it silently misbehaves. It would also write on load,
   which the idle-write assertion in `npm run verify` exists to
   catch. So: this page reads, and that is all it does. The only
   write it can make is one the user asks for by clicking a project
   in the switcher.

   WHY IT READS THE JSON FOR THE DENOMINATOR. Progress is filled
   fields over total fields, and the total is every field the
   blueprint declares — which lives in src/data, not in this page's
   DOM. The definition of *filled* is copied deliberately from
   feature.js's updateProgress(): a text field counts when it has a
   non-empty trimmed value, a checklist item counts when its stored
   value is `true`. Two pages disagreeing about one number is worse
   than either number being wrong.

   THE STUDIO-WIDE TRAP. store.js suffixes every SCOPED_KEY with the
   open project's id, so `localStorage.getItem(FEATURE_KEY)` is
   always THIS project. That is exactly right for everything above.
   It is exactly wrong for the project switcher, which has to speak
   about the others — so that one section goes through
   rawGet(key + '__' + id) and never through the proxy.
   ============================================================ */
import Store from '../lib/store.js';
import { BLUEPRINT, guideProgress, stageHueClass, journey, stageStates, suggestNext, lastWorked, favouriteOf } from '../lib/journey.js';
import { parseNum, fmtINR, INR } from '../lib/money.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/dashboard.css';
import '../styles/motion.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, commitMain } from '../lib/dom.js';
import { reveal } from '../lib/motion.js';
import { renderLauncher } from '../ui/launcher.js';

import Scenes, { formatEighths, totalEighths } from '../lib/scenes.js';
import Locations from '../lib/locations.js';
import Contacts from '../lib/contacts.js';
import Shots from '../lib/shots.js';
import { loadScript, pageCount, formatPages } from '../lib/script.js';
/* Derived, never stored — see the header of readiness.js. */
import { readiness, sceneLabel } from '../lib/readiness.js';
import PlanGate from '../lib/plan-gate.js';
import { getDriveStatus } from '../lib/drive-sync.js';
import { dprSummary } from '../lib/dpr.js';
import { planName } from '../lib/plans.js';


const app = document.getElementById('app');

/* Storage keys, spelled exactly as store.js's SCOPED_KEYS spells them.
   These are read-only here; not one line of this file writes to them. */
const LIB_CALC_KEY = 'fms_library_calc_v1';
const ACTIVITY_KEY = 'fms_studio_activity_v1';

/* ============================================================
   THE BLUEPRINTS, AS A FIELD LIST — grouped by STAGE now
   ------------------------------------------------------------
   The field list (both sources: `key` props and data-key attributes
   inside `raw` blocks), the step-to-stage mapping and the "filled"
   rule all live in src/lib/journey.js, which reads
   blueprint-fields.js — so the journey strip, the hub's cards and
   this page count one way. This used to be a local copy grouped by
   the four 2023 phases, which filed the scene list and the script
   lock under Story and disagreed with the five stages the rest of
   the studio is built on. The two blueprint keys are spelled once,
   in journey.js's BLUEPRINT table, and read-only here.

   The adapter keeps the shape every renderer below already reads:
   phases → steps, each with done/total by FIELD.
   ============================================================ */
const BLUEPRINTS = { feature: BLUEPRINT.feature, short: BLUEPRINT.short };

function blueprintProgress(blueprint, data) {
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
function readBlob(key) {
  let raw = null;
  try { raw = localStorage.getItem(key); } catch (e) { /* private mode */ }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}

/* parseNum / INR / the short rupee format all come from
   src/lib/money.js now. This file used to carry its own copy with a
   note saying "if this ever needs a third caller it should move into
   a lib" — it did, and the copy outlived the note. It was also the
   anchored-but-not-whole-string version, which still read
   "1500 per roll" as 15 crore. */


/* Two figures, because a number card is 190px wide and eight digits in
   the display face wrap onto two lines there. The card face gets the
   glanceable magnitude; the exact rupee figure goes in the note under
   it, so nothing is hidden. */
const fmtShort = fmtINR;

function budgetStatus() {
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
function recentActivity(limit) {
  const log = readBlob(ACTIVITY_KEY);
  const entries = Array.isArray(log.entries) ? log.entries : [];
  return entries.slice(0, limit);
}

function relTime(ts) {
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
const FORMAT_LABEL = {
  feature: 'Feature film',
  short: 'Short film',
  documentary: 'Documentary',
  musicvideo: 'Music video',
  adfilm: 'Ad film'
};

function snapshot(project) {
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
   PIECES
   ============================================================ */
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

function section(id, eyebrow, title, deck) {
  const sec = h('section.db-sec', { id, 'data-reveal': '' });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }), h('h2.bd-h2', { text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

/* ---- readiness --------------------------------------------------
   The whole section is derived at render time by readiness(); this
   function only arranges what it returns. No state, no storage, and
   no opinion about severity — that is decided in the model, where it
   can be read next to the data it judges.

   PASSED CHECKS ARE SHOWN, not filtered out. A list of only the
   failures reads identically whether the production is clean or the
   check silently stopped running, which is the trap the hue
   assertion in verify already names.

   With no scenes it renders the SECTION and no checks: a wall of
   green saying nothing is wrong with nothing is the most misleading
   answer this page could give, so the list is withheld — but the id
   is not. `journey.js` sends every failing check to
   `dashboard.html#readiness`, and a nav target must not depend on
   data existing (CLAUDE.md): the fragment sweep in verify found this
   id absent in the no-project and empty-project states, so a link
   followed after switching to an emptier film landed nowhere. The
   wrapper always renders; the empty state sits inside it. */
function renderReadiness() {
  const r = readiness();
  if (!r.hasFilm) {
    return section('readiness', 'Derived from your scenes · nothing to tick',
      'Could you shoot tomorrow?',
      (Store.currentProject() ? 'Nothing to check yet. Once this film has scenes' : 'Nothing to check yet. Open a project and give it scenes')
      + ' — written, imported or broken down — and this becomes a list of what would stop a shoot day.');
  }

  const tone = r.blockers ? 'is-bad' : r.gaps ? 'is-warn' : 'is-ok';
  const deck = r.blockers
    ? r.blockers + ' thing' + (r.blockers === 1 ? '' : 's') + ' would stop a shoot day, and '
      + r.gaps + ' more will cost you one.'
    : r.gaps
      ? 'Nothing blocks a shoot day. ' + r.gaps + ' thing'
        + (r.gaps === 1 ? ' is' : 's are') + ' still missing.'
      : 'Every check passes. Nothing here is missing.';

  const sec = section('readiness', 'Derived from your scenes · nothing to tick',
    'Could you shoot tomorrow?', deck);

  /* Failures first and blockers above gaps, because the order IS the
     advice. Passed checks are still SHOWN, as evidence the question
     was asked — but as one compact row of ticks under the work, so
     five green cards no longer outweigh the two things to do. */
  const rank = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  const sorted = r.checks.slice().sort((a, b) => rank(a) - rank(b) || b.count - a.count);
  const fails = sorted.filter((c) => !c.passed);
  const passes = sorted.filter((c) => c.passed);
  if (fails.length) {
    const list = h('ul.rd-list');
    fails.forEach((c) => list.append(readinessRow(c)));
    sec.append(list);
  }
  if (passes.length) {
    sec.append(h('p.rd-pass-h', { text: 'Passing \u00b7 ' + passes.length + ' of ' + r.checks.length }));
    const ul = h('ul.rd-pass');
    passes.forEach((c) => ul.append(h('li.rd-chip', {}, [
      h('span.rd-mark', { 'aria-hidden': 'true', text: '\u2713' }),
      h('span', { text: c.label + ' — none' })
    ])));
    sec.append(ul);
  }

  const dot = sec.querySelector('.bd-eyebrow');
  if (dot) dot.classList.add(tone);
  return sec;
}

function readinessRow(c) {
  const row = h('li.rd-row' + (c.passed ? '.is-pass'
    : c.severity === 'blocker' ? '.is-blocker' : '.is-gap'));

  row.append(h('span.rd-mark', { 'aria-hidden': 'true', text: c.passed ? '\u2713' : '\u2022' }));

  const body = h('div.rd-body');
  body.append(h('p.rd-label', {
    text: c.passed ? c.label + ' — none' : c.label + ' — ' + c.count
  }));

  if (!c.passed) {
    /* Named, not counted. "3 scenes have no location" sends somebody
       hunting; naming them is the difference between a report and a
       task list. Capped because a brand-new import can fail a check
       on every scene it has. */
    const shown = c.items.slice(0, 8).join(' · ');
    const more  = c.items.length > 8 ? ' … and ' + (c.items.length - 8) + ' more' : '';
    body.append(h('p.rd-items', { text: shown + more }));
    body.append(h('p.rd-hint', { text: c.hint }));
    if (c.where) body.append(h('a.rd-go', { href: c.where, text: 'Fix it \u2192' }));
  }

  row.append(body);
  return row;
}

/* ============================================================
   TODAY'S DESK
   ------------------------------------------------------------
   Six tiles, all derived on render and none stored. Where a figure
   does not exist on the client the tile says so rather than inventing
   one: the plan's project limit lives in the database (a trigger
   raises P0402), and no model records when a backup file was last
   exported, so neither is shown as a number. */
const MS_DAY = 86400000;

/** 'YYYY-MM-DD' as a LOCAL midnight; null when it is not a date. */
function localDay(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(str || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null;
}
function daysFromToday(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0);
  return Math.round((date - t) / MS_DAY);
}
function when(n) {
  return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n > 0 ? 'in ' + n + ' days' : Math.abs(n) + ' days ago';
}

function tile(id, eyebrow, title) {
  const t = h('section.db-tile', { 'aria-labelledby': 'dbt-' + id });
  t.append(h('p.db-tile-eyebrow', { text: eyebrow }), h('h2.db-tile-h', { id: 'dbt-' + id, text: title }));
  return t;
}

function continueTarget(snap) {
  const log = recentActivity(1)[0];
  if (log && log.url && !/^(feature|short)\.html/.test(log.url)) {
    return { href: log.url, what: String(log.what || 'where you left off'), ts: log.ts };
  }
  const pick = snap.resume || snap.states.find((x) => snap.suggest && x.id === snap.suggest.id) || snap.states[0];
  return { href: pick.href, what: pick.label, ts: snap.resume ? snap.resume.at : null };
}

/* ============================================================
   THE FOCUS ROW — one answer to "what now?", one to "how ready?"
   ------------------------------------------------------------
   The page used to say "go here next" five ways (a Continue tile, a
   suggested-next panel, a resume line, the journey strip's next step
   and the suggested stage card) and "how ready is it" three ways (a
   tick list on the project tile, "three things to do" and the full
   readiness section). The first card below holds every "next"; the
   second holds the readiness summary and links down to the full list.
   The ids the old pieces carried (#suggested, #resume) live on here.
   ============================================================ */
const WHY = {
  start: 'Nothing started yet, so the story is a natural first step.',
  continue: 'Work is under way here.',
  next: 'Everything started is finished; this is the earliest stage not started.'
};

function renderContinue(snap) {
  /* THIS PROJECT ONLY (owner, 11 Oct 2026): it used to suggest the most
     recently edited OTHER film. Switching films is the home page's job. */
  const tl = tile('continue', 'Continue', 'Pick up where you left off');
  tl.classList.add('db-up');
  const t = continueTarget(snap);
  tl.append(
    h('p.db-tile-line', { id: 'resume', text: t.what + (t.ts ? ' · edited ' + relTime(t.ts) : '') }),
    h('a.btn.primary.db-big', { href: t.href, 'aria-label': 'Continue: ' + t.what, text: 'Continue  →' })
  );

  const sug = snap.suggest;
  const sugState = sug && snap.states.find((s) => s.id === sug.id);
  const box = h('div.db-up-next', { id: 'suggested' });
  if (sugState) {
    box.append(
      h('p.db-tile-eyebrow', { text: 'Suggested next · only a suggestion' }),
      h('p.db-up-stage.' + stageHueClass(sugState.hue), {}, [
        h('span.db-dot', { 'aria-hidden': 'true' }),
        h('strong', { text: sugState.label })
      ]),
      h('p.db-tile-line', { text: WHY[sug.why] || WHY.continue })
    );
    const acts = h('div.db-up-acts');
    acts.append(h('a.btn', { href: sugState.href, 'aria-label': 'Go to ' + sugState.label, text: 'Go to ' + sugState.label + '  →' }));
    const nx = snap.journey && snap.journey.next;
    if (nx && nx.href && nx.label) {
      acts.append(h('a.db-gap-link', { href: nx.href, text: 'Next step: ' + nx.label }));
    }
    box.append(acts);
  } else {
    box.append(h('p.db-none', { text: 'Every stage is done. Open any card to review it.' }));
  }
  tl.append(box);
  return tl;
}

function renderReadyTile() {
  const tl = tile('ready', 'Readiness', 'Three things to do');
  tl.classList.add('db-ready');
  const r = readiness();
  if (!r.hasFilm) {
    tl.append(
      h('p.db-tile-line', { text: 'No scenes yet, so nothing to check.' }),
      h('ul.db-acts', {}, [h('li', {}, [
        h('a.db-gap-link', { href: 'breakdown.html', text: 'Add the scenes' }),
        h('span.db-gap-why', { text: 'Readiness is derived from them.' })
      ])])
    );
    return tl;
  }

  const rank = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  const sorted = r.checks.slice().sort((a, b) => rank(a) - rank(b) || b.count - a.count);
  const pass = sorted.filter((c) => c.passed).length;
  const total = sorted.length;

  /* The score is a number AND a word, and the bar under it repeats the
     list's own order — blockers, gaps, passes — one segment per check.
     The segments carry no text, so a fill colour is safe there; the
     counts beside them are ink. */
  const label = pass + ' of ' + total + ' checks pass · '
    + r.blockers + ' blocker' + (r.blockers === 1 ? '' : 's') + ', ' + r.gaps + ' gap' + (r.gaps === 1 ? '' : 's');
  const seg = h('div.db-seg', { role: 'img', 'aria-label': label });
  sorted.forEach((c) => seg.append(h('span.db-seg-i.' + (c.passed ? 'is-pass' : c.severity === 'blocker' ? 'is-blocker' : 'is-gap'))));
  tl.append(
    h('p.db-score', {}, [h('strong', { text: pass + '/' + total }), h('span', { text: 'checks pass' })]),
    seg,
    h('p.db-tile-line', { text: 'Readiness: ' + label })
  );

  const todo = sorted.filter((c) => !c.passed).slice(0, 3);
  const ul = h('ul.db-acts');
  if (!todo.length) {
    ul.append(h('li', {}, [h('span.db-gap-why', { text: 'Every readiness check passes.' })]));
  } else {
    todo.forEach((c) => ul.append(h('li.' + (c.severity === 'blocker' ? 'is-blocker' : 'is-gap'), {}, [
      h('a.db-gap-link', { href: c.where || 'dashboard.html#readiness', text: c.label + ' — ' + c.count }),
      h('span.db-gap-why', { text: c.hint })
    ])));
  }
  tl.append(ul, h('a.db-link.db-tile-more', { href: '#readiness', text: 'See every check ↓' }));
  return tl;
}

function renderFocus(snap) {
  const sec = h('section.db-focus', { id: 'focus', 'aria-label': 'Where to go next', 'data-reveal-group': '' });
  sec.append(renderContinue(snap), renderReadyTile());
  return sec;
}

/* ============================================================
   THE SIDE COLUMN — the calendar, the plan, the backup
   ============================================================ */
function nextShootLine(snap) {
  const upcoming = snap.days.map((d) => ({ d, date: localDay(d.date) })).filter((x) => x.date)
    .map((x) => ({ ...x, n: daysFromToday(x.date) })).filter((x) => x.n >= 0).sort((a, b) => a.n - b.n)[0];
  return upcoming ? 'Next shoot: day ' + upcoming.d.day + ' · ' + when(upcoming.n)
    : snap.days.length ? 'Shoot countdown: no upcoming dated day.' : 'Shoot countdown: no shoot days planned yet.';
}

function renderWeek(snap) {
  const tl = tile('week', 'This week', 'Shoot days and call sheets');
  tl.append(h('p.db-tile-line.db-strong', { text: nextShootLine(snap) }));
  const covered = new Set();
  snap.sheets.forEach((cs) => (cs.sceneIds || []).forEach((id) => covered.add(id)));
  const rows = snap.days.map((d) => ({ d, date: localDay(d.date) })).filter((x) => x.date)
    .map((x) => ({ ...x, n: daysFromToday(x.date) })).filter((x) => x.n >= -1 && x.n <= 7)
    .sort((a, b) => a.n - b.n);
  if (!rows.length) {
    tl.append(h('p.db-tile-line', { text: snap.datedDays
      ? 'No shoot day falls in the next seven days.' : 'No shoot day has a date yet.' }),
      h('a.db-gap-link', { href: 'plan.html#calendar', text: 'Open the calendar' }));
    return tl;
  }
  const ul = h('ul.db-acts');
  for (const x of rows) {
    const sheet = x.d.scenes.some((s) => covered.has(s.id));
    let dpr = '';
    if (x.n <= 0) {
      const rec = dprSummary(x.d.day, snap.scenes).record;
      dpr = ' · report ' + (rec && (rec.crewCall || rec.wrap) ? 'started' : 'not started');
    }
    ul.append(h('li', {}, [
      h('a.db-gap-link', { href: sheet ? 'contacts.html#call-sheets' : 'reports.html#sides',
        text: 'Day ' + x.d.day + ' · ' + when(x.n) }),
      h('span.db-gap-why', { text: x.d.scenes.length + ' scene' + (x.d.scenes.length === 1 ? '' : 's')
        + ' · ' + (sheet ? 'call sheet made' : 'no call sheet') + dpr })
    ]));
  }
  tl.append(ul);
  return tl;
}

function renderPlanTile() {
  const tl = tile('plan', 'Plan', 'Your plan');
  const cp = PlanGate.currentPlan();
  const name = cp.planName || (cp.plan ? planName(cp.plan) : '');
  /* 'free' is the "no plan" state, never a plan to name (owner, 11 Oct
     2026): it is the free trial, or nothing bought yet. */
  const line = !name ? 'Not signed in — working locally on this device'
    : cp.plan !== 'free' ? name + ' plan'
    : cp.reason === 'granted' ? 'Access given by the studio'
    : cp.reason === 'trial' ? 'Free trial'
    : cp.reason === 'free' ? 'Free to use right now'
    : 'No plan yet';
  tl.append(
    h('p.db-tile-line', { text: line }),
    h('a.btn.db-tile-go', { href: 'purchase.html', 'aria-label': 'Plans and upgrade',
      text: name && cp.plan !== 'free' ? 'Manage plan' : 'See plans' })
  );
  return tl;
}

function renderBackupTile() {
  const tl = tile('backup', 'Backup', 'Is your work safe?');
  let st = null;
  try { st = getDriveStatus(); } catch (e) { /* a status is not a transfer */ }
  const on = !!(st && st.connected);
  tl.append(h('p.db-tile-line.db-state' + (on ? '.is-on' : '.is-off'), {}, [
    h('span.db-dot', { 'aria-hidden': 'true' }),
    txt(on
      ? 'Google Drive: connected' + (st.syncedAt ? ', last synced ' + relTime(st.syncedAt) : ', not yet synced') + '.'
      : 'Google Drive: not connected.')
  ]));
  tl.append(h('p.db-tile-line', { text: 'Everything lives in this browser. A backup file is the only other copy unless Drive is on; '
    + 'this page cannot see when you last exported one.' }));
  tl.append(h('a.btn.db-tile-go', { href: 'index.html', 'aria-label': 'Export a backup, from the studio home page', text: 'Export a backup' }));
  return tl;
}

function renderDesk(snap) {
  const aside = h('aside.db-desk', { id: 'desk', 'data-reveal-group': '', 'aria-label': 'Today’s desk' });
  aside.append(renderWeek(snap), renderPlanTile(), renderBackupTile());
  return aside;
}

/* ---- header ----------------------------------------------------- */
const txt = (t) => document.createTextNode(t);

/* studies.js is four films' worth of data, so it is fetched only when a
   favourite is set, and the page redraws once it arrives. */
let studiesMod = null;
let studiesAsked = false;
function favTitle(slug) {
  if (!studiesMod) return '';
  const st = studiesMod.getStudy(slug);
  return (st && st.meta && st.meta.title) || '';
}

function renderHead(snap) {
  const p = snap.project;
  const fav = favouriteOf(p, favTitle);
  if (fav && !studiesMod && !studiesAsked) {
    studiesAsked = true;
    import('../lib/studies.js').then((m) => { studiesMod = m; render(); }).catch(() => { /* the slug stands in */ });
  }
  const head = h('header.bd-head.db-head');
  const j = snap.journey;
  head.append(
    h('p.bd-eyebrow', { text: (FORMAT_LABEL[p.format] || 'Project') + ' · Project dashboard'
      + (j ? ' · Stage: ' + j.currentLabel : '') }),
    h('h1.bd-title', { text: p.title }),
    h('p.bd-deck', {
      text: 'Five stages, in any order, each read from what you have already made. '
          + 'Nothing is mandatory: with a script in hand, start straight in Pre-production.'
    })
  );
  const favLine = h('p.st-fav', { id: 'favourite' });
  if (fav) {
    favLine.append(txt('Favourite film: '), h('strong', { text: fav.title }), txt(' · '),
      h('a.db-link', { href: 'settings.html#favourite', text: 'change' }));
  } else {
    favLine.append(txt('No favourite film chosen yet · '),
      h('a.db-link', { href: 'settings.html#favourite', text: 'choose one' }));
  }
  head.append(favLine);
  if (!snap.isEmpty) {
    head.append(h('div.bd-stats.db-stats', {}, [
      stat(String(snap.scenes.length), snap.scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(snap.eighths), snap.eighths === 8 ? 'page' : 'pages'),
      stat(String(snap.days.length), snap.days.length === 1 ? 'shoot day' : 'shoot days'),
      stat(String(snap.contacts.length), 'people'),
      stat(String(snap.shots.length), snap.shots.length === 1 ? 'shot' : 'shots'),
      stat(snap.budget.short, 'budget')
    ]));
  }
  return head;
}

/* ---- the five stage cards ----------------------------------------
   State is derived by journey.js stageStates(); this only arranges it.
   Status is a WORD plus a glyph, never colour alone. The ids always
   render: #stages and #stage-<id> exist with no data behind them.

   The journey strip used to sit under these as a second row of the
   same five stages, with the Guide and Tools meters. The meters moved
   INTO the cards, so each stage is said once; #journey is kept on the
   list, because a fragment target must not disappear with a redesign. */
const STATUS_GLYPH = { none: '○', doing: '◐', done: '●' };
const GO = { none: 'Start', doing: 'Continue', done: 'Open' };

function stageMeter(label, pct, value) {
  const v = Math.max(0, Math.min(100, pct || 0));
  return h('div.st-meter', {}, [
    h('span.st-meter-lab', { text: label }),
    h('span.db-bar', { 'aria-hidden': 'true' }, [h('span.db-bar-fill', { style: 'width:' + v + '%' })]),
    h('span.st-meter-val', { text: value })
  ]);
}

function stageCard(s, suggested, js, current) {
  const li = h('li.st-card.' + stageHueClass(s.hue) + '.st-' + s.status.id + (suggested ? '.is-suggested' : ''),
    { id: 'stage-' + s.id });
  li.append(h('div.st-head', {}, [
    h('span.st-part', { text: 'Part ' + s.part }),
    suggested ? h('span.st-sug', { text: 'Suggested next' })
      : current ? h('span.st-sug', { text: 'You are here' }) : null
  ]));
  li.append(h('h3.st-name', { text: s.label }));
  li.append(h('p.st-status', {}, [
    h('span.st-glyph', { text: STATUS_GLYPH[s.status.id], 'aria-hidden': 'true' }),
    h('span', { text: s.status.label })
  ]));
  if (js) {
    li.append(h('div.st-meters', {}, [
      stageMeter('Guide', js.guide.pct, js.guide.total ? js.guide.pct + '%' : '—'),
      stageMeter('Tools', js.tools.pct, js.tools.total ? js.tools.done + '/' + js.tools.total : '—')
    ]));
  }
  const facts = h('ul.st-facts');
  s.facts.forEach((f) => facts.append(h('li', { text: f })));
  li.append(facts);
  const acts = h('div.st-acts');
  acts.append(h('a.btn' + (suggested ? '.primary' : '') + '.st-go', {
    href: s.href,
    'aria-label': GO[s.status.id] + ' ' + s.label + ' — ' + s.status.label,
    text: GO[s.status.id] + '  →'
  }));
  if (s.start && s.status.id === 'none') {
    acts.append(h('a.db-link.st-alt', { href: s.start.href, text: s.start.label }));
  }
  li.append(acts);
  return li;
}

function renderStages(snap) {
  const sec = section('stages', 'The five stages', 'Where the film stands.');
  const sug = snap.suggest;
  const j = snap.journey;
  const list = h('ol.st-list', { id: 'journey', 'aria-label': 'The five stages of this film' });
  snap.states.forEach((s) => list.append(stageCard(s, !!sug && s.id === sug.id,
    j && j.stages.find((x) => x.id === s.id), !!j && j.current === s.id)));
  sec.append(list);

  sec.append(h('p.db-foot', {}, [
    txt('Guide is how much of the blueprint is answered; Tools is how much of the stage’s work exists. '
      + 'Prefer to be asked questions? '),
    h('a.db-link', { href: snap.main.blueprint.href, text: 'Guided questions' }),
    txt(' (' + snap.main.pct + '% answered) are a companion, not a step.')
  ]));
  return sec;
}

/* ---- the production chain ----------------------------------------
   Twelve numbers, now in four labelled groups, because twelve equal
   cards in a row read as twelve equal facts — and "scenes" and
   "storyboards" are not equally the spine of the film. */
function chainCard(number, label, note, href, hue) {
  return h('a.db-card.hue-' + hue, { href }, [
    h('strong.db-card-num', { text: number }),
    h('span.db-card-label', { text: label }),
    h('span.db-card-note', { text: note })
  ]);
}

function renderChain(snap) {
  const sec = section('chain', 'The chain', 'Scene to call sheet.',
    'One scene model, read by every module below. Move a scene and all of '
    + 'these move with it.');
  const n = (v) => String(v);
  const group = (title, cards) => h('div.db-chain-group', {}, [
    h('p.db-chain-h', { text: title }), h('div.db-grid', {}, cards)
  ]);

  sec.append(
    group('Break down', [
      chainCard(n(snap.scenes.length), 'Scenes', 'Breakdown — the one place a scene is typed', 'breakdown.html', 'shorts'),
      chainCard(formatEighths(snap.eighths), 'Scene pages', 'Length in eighths, from the breakdown', 'breakdown.html', 'shorts'),
      chainCard(n(snap.elements), 'Elements tagged', 'Cast, props, wardrobe, vehicles', 'breakdown.html#elements', 'shorts'),
      chainCard(formatPages(snap.scriptPages), 'Screenplay pages', 'Written in the editor · ' + n(snap.revisions) + ' revision' + (snap.revisions === 1 ? '' : 's') + ' saved', 'script.html', 'library')
    ]),
    group('Schedule', [
      chainCard(n(snap.locationCount), 'Locations', 'Distinct places named on a scene', 'plan.html#locations', 'plan'),
      chainCard(n(snap.days.length), 'Shoot days', snap.unscheduled.length
        ? snap.unscheduled.length + ' scene' + (snap.unscheduled.length === 1 ? '' : 's') + ' still unscheduled'
        : 'Every scene has a day', 'stripboard.html', 'shoot'),
      chainCard(n(snap.datedDays), 'Dated days', 'Shoot days with a real date against them', 'plan.html#calendar', 'plan'),
      chainCard(snap.budget.short, 'Budget', snap.budget.lines
        ? snap.budget.exact + ' across ' + snap.budget.lines + ' line item' + (snap.budget.lines === 1 ? '' : 's')
        : 'Nothing costed yet', 'budget.html', 'plan')
    ]),
    group('People', [
      chainCard(n(snap.contacts.length), 'People', 'Cast and crew, by department', 'contacts.html', 'shoot'),
      chainCard(n(snap.sheets.length), 'Call sheets', 'Built from the day, the scenes and the people', 'contacts.html#call-sheets', 'shoot')
    ]),
    group('See it', [
      chainCard(n(snap.shots.length), 'Shots', 'Shot list, hung off the scenes', 'visualize.html', 'visualize'),
      chainCard(n(snap.boards), 'Storyboards', 'Frames, in order', 'visualize.html#storyboard', 'visualize')
    ])
  );
  return sec;
}

/* ---- recent ------------------------------------------------------
   TWO sources, both read-only, and the copy says which. The hub's log
   (fms_studio_activity_v1) only records blueprint progress, the
   equipment list and backups — it does not see scene, contact or
   script edits, so this page does not claim it does. The second source
   is the shoot day's own marks: `shotAt` on a scene, written by
   shoot.html. No other model carries a per-record timestamp. */
function derivedActivity(scenes) {
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

function renderActivity(scenes) {
  const logged = recentActivity(12).map((e) => ({
    ts: typeof e.ts === 'number' ? e.ts : Date.parse(e.ts),
    what: String(e.what || e.where || 'Edited'), url: e.url
  }));
  const entries = logged.concat(derivedActivity(scenes))
    .filter((e) => Number.isFinite(e.ts))
    .sort((a, b) => b.ts - a.ts).slice(0, 8);
  if (!entries.length) return null;
  const sec = section('recent', 'Recent', 'What moved lately.',
    'Blueprint progress, equipment lists and backups from the studio log, plus scenes '
    + 'marked shot on set. Edits to scenes, people and the script are not logged. This project only.');
  const list = h('ol.db-log');
  for (const e of entries) {
    const line = h('li.db-log-row');
    const what = h('span.db-log-what', { text: e.what });
    line.append(
      e.url ? h('a.db-link', { href: e.url }, [what]) : what,
      h('span.db-log-when', { text: relTime(e.ts) })
    );
    list.append(line);
  }
  sec.append(list);
  return sec;
}

/* ---- empty states -------------------------------------------------
   Two different emptinesses, and conflating them was the old first-run
   bug: "no project at all" needs the hub, "a project with nothing in
   it" needs a first step. A wall of zeros answers neither. */
function renderNoProject() {
  const wrap = h('section.db-sec', { id: 'stages', 'data-reveal': '' });
  wrap.append(h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◴', 'aria-hidden': 'true' }),
    h('h2', { text: 'Pick or start a project' }),
    h('p', {
      text: 'The dashboard reports on one film at a time. Start a new project or open one '
          + 'of yours, and its five stages appear here.'
    }),
    h('div.db-cta-row', {}, [
      h('a.btn.primary.bd-cta', { href: 'index.html', text: 'Pick or start a project  →' }),
      h('a.btn', { href: 'library.html', text: 'Look around the library first' })
    ])
  ]));
  return wrap;
}

/* ============================================================
   RENDER
   ============================================================ */
let revealed = false;
function render() {
  const project = Store.currentProject();
  const main = h('main.db-main', { id: 'main' });

  if (!project) {
    main.append(
      h('header.bd-head', {}, [
        h('p.bd-eyebrow', { text: 'Studio' }),
        h('h1.bd-title', { text: 'Project dashboard' }),
        h('p.bd-deck', {
          text: 'Where a film stands across story, screenplay, pre-production, production '
              + 'and post — read from the project you have open.'
        })
      ]),
      renderNoProject(),
      /* The id, even here: a link into #readiness followed with no
         project open must land on the section that says why it is
         empty, not on nothing. */
      renderReadiness()
    );
  } else {
    const snap = snapshot(project);
    /* Stage-first: the five stages lead, with the suggestion; the desk
       tiles, the chain and the readiness checks sit below them. */
    /* Top to bottom: what to do now (focus), where each stage stands,
       then the detail in a main column with the calendar, plan and
       backup beside it, and the full module map last. */
    const col = h('div.db-col');
    if (!snap.isEmpty) col.append(renderChain(snap));
    /* OUTSIDE the isEmpty branch on purpose. `isEmpty` asks whether
       the BLUEPRINT has been filled in, and readiness asks about the
       SCENES — a producer who imported a script and has not answered
       a single blueprint step is exactly who this is for, and the
       first version hid it from them. Without scenes it renders the
       section's empty state, so #readiness always resolves. */
    col.append(renderReadiness());
    const activity = renderActivity(snap.scenes);
    if (activity) col.append(activity);
    main.append(renderHead(snap), renderFocus(snap), renderStages(snap),
      h('div.db-body', {}, [col, renderDesk(snap)]), renderLauncher());
  }

  if (!commitMain(app, main, mountShell)) return;
  /* Play once: render() runs on every store event, and a desk that
     re-faded on each edit would be noise. */
  if (!revealed) { revealed = true; reveal(main); }
  /* Chrome initialises at import time, when #app is still empty. Every
     page re-inits after its own render; this one has aria labels and
     glossary terms in its prose like the rest. */
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[dashboard] chrome', e); }
}

/* ---- events — delegated, no inline handlers ---------------------- */
/* setCurrentProject notifies 'current:changed', and the subscriber
   below is what re-renders. Calling render() here as well would draw
   the page twice for one click. */

/* The project changed under us — switched here, or renamed on the hub. */
Store.subscribe('current:changed', () => render());
Store.subscribe('project:meta', () => render());
Store.subscribe('plan:changed', () => render());

render();
