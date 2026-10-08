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
import Store, { rawGet } from '../lib/store.js';
import { BLUEPRINT, guideProgress, stageHueClass, journey } from '../lib/journey.js';
import { renderJourneyStrip } from '../ui/journey-strip.js';
import { parseNum, fmtINR, INR } from '../lib/money.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/dashboard.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';

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

/** A named project's copy, bypassing the proxy. See the header note. */
function readBlobFor(key, projectId) {
  const raw = rawGet(key + '__' + projectId);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) { return {}; }
}


/** The first step that is not finished. Null when every field is in. */
function firstUnfinished(progress) {
  for (const phase of progress.phases) {
    for (const step of phase.steps) {
      if (step.total && step.done < step.total) return { phase, step };
    }
  }
  return null;
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
    journey: journey(project)
  };

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
  const sec = h('section.db-sec', { id });
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

  const list = h('ul.rd-list');
  /* Failures first and blockers above gaps, because the order IS the
     advice. Passed checks keep their place at the bottom as evidence
     the question was asked. */
  const rank = (c) => (c.passed ? 2 : c.severity === 'blocker' ? 0 : 1);
  r.checks.slice().sort((a, b) => rank(a) - rank(b) || b.count - a.count)
    .forEach((c) => list.append(readinessRow(c)));
  sec.append(list);

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
  if (log && log.url) return { href: log.url, what: String(log.what || 'where you left off'), ts: log.ts };
  const next = firstUnfinished(snap.main);
  if (next) {
    return { href: snap.main.blueprint.href + '#' + next.step.id,
      what: 'Step ' + next.step.num + ' · ' + next.step.title, ts: null };
  }
  if (snap.journey && snap.journey.next) return { href: snap.journey.next.href, what: snap.journey.next.label, ts: null };
  return { href: snap.main.blueprint.href, what: snap.main.blueprint.label, ts: null };
}

function renderContinue(snap, projects) {
  const latest = projects.slice().sort((a, b) => Date.parse(b.updatedAt || 0) - Date.parse(a.updatedAt || 0))[0];
  const tl = tile('continue', 'Continue', 'Pick up where you left off');
  tl.classList.add('db-tile-wide');
  if (latest && latest.id !== snap.project.id) {
    tl.append(
      h('p.db-tile-line', { text: 'You last edited \u201c' + latest.title + '\u201d, ' + relTime(latest.updatedAt)
        + '. \u201c' + snap.project.title + '\u201d is the one open now.' }),
      h('button.btn.primary.db-big', {
        type: 'button', 'data-action': 'open-project', 'data-project': latest.id,
        'aria-label': 'Open ' + latest.title, text: 'Open \u201c' + latest.title + '\u201d  \u2192'
      })
    );
    return tl;
  }
  const t = continueTarget(snap);
  tl.append(
    h('p.db-tile-line', { text: t.what + (t.ts ? ' \u00b7 ' + relTime(t.ts) : '') }),
    h('a.btn.primary.db-big', { href: t.href, 'aria-label': 'Continue: ' + t.what, text: 'Continue  \u2192' })
  );
  return tl;
}

function renderProjectTile(snap) {
  const tl = tile('project', FORMAT_LABEL[snap.project.format] || 'Project', snap.project.title);
  const j = snap.journey;
  tl.append(h('p.db-tile-line', { text: 'Stage: ' + (j ? j.currentLabel : 'Story') }));
  const r = readiness();
  if (!r.hasFilm) {
    tl.append(h('p.db-tile-line', { text: 'Readiness: no scenes yet, so nothing to check.' }));
  } else {
    const pass = r.checks.filter((c) => c.passed);
    tl.append(h('p.db-tile-line', {
      text: 'Readiness: ' + pass.length + ' of ' + r.checks.length + ' checks pass \u00b7 '
        + r.blockers + ' blocker' + (r.blockers === 1 ? '' : 's') + ', ' + r.gaps + ' gap' + (r.gaps === 1 ? '' : 's')
    }));
    const ul = h('ul.db-tick');
    r.checks.forEach((c) => ul.append(h('li' + (c.passed ? '.is-pass' : '.is-fail'), {
      text: (c.passed ? '\u2713 ' : '\u2022 ') + c.label
    })));
    tl.append(ul);
  }
  const upcoming = snap.days.map((d) => ({ d, date: localDay(d.date) })).filter((x) => x.date)
    .map((x) => ({ ...x, n: daysFromToday(x.date) })).filter((x) => x.n >= 0).sort((a, b) => a.n - b.n)[0];
  tl.append(h('p.db-tile-line', {
    text: upcoming ? 'Next shoot: day ' + upcoming.d.day + ' \u00b7 ' + when(upcoming.n)
      : snap.days.length ? 'Shoot countdown: no upcoming dated day.' : 'Shoot countdown: no shoot days planned yet.'
  }));
  return tl;
}

function renderActions(snap) {
  const tl = tile('actions', 'Next', 'Three things to do');
  const r = readiness();
  const rank = (c) => (c.severity === 'blocker' ? 0 : 1);
  const todo = r.checks.filter((c) => !c.passed).sort((a, b) => rank(a) - rank(b) || b.count - a.count).slice(0, 3);
  const ul = h('ul.db-acts');
  if (!r.hasFilm) {
    ul.append(h('li', {}, [h('a.db-gap-link', { href: 'breakdown.html', text: 'Add the scenes' }),
      h('span.db-gap-why', { text: 'Readiness is derived from them.' })]));
  } else if (!todo.length) {
    ul.append(h('li', {}, [h('span.db-gap-why', { text: 'Every readiness check passes.' })]));
  } else {
    todo.forEach((c) => ul.append(h('li', {}, [
      h('a.db-gap-link', { href: c.where || 'dashboard.html#readiness', text: c.label + ' \u2014 ' + c.count }),
      h('span.db-gap-why', { text: c.hint })
    ])));
  }
  tl.append(ul);
  return tl;
}

function renderWeek(snap) {
  const tl = tile('week', 'This week', 'Shoot days and call sheets');
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
      dpr = ' \u00b7 report ' + (rec && (rec.crewCall || rec.wrap) ? 'started' : 'not started');
    }
    ul.append(h('li', {}, [
      h('a.db-gap-link', { href: sheet ? 'contacts.html#call-sheets' : 'reports.html#sides',
        text: 'Day ' + x.d.day + ' \u00b7 ' + when(x.n) }),
      h('span.db-gap-why', { text: x.d.scenes.length + ' scene' + (x.d.scenes.length === 1 ? '' : 's')
        + ' \u00b7 ' + (sheet ? 'call sheet made' : 'no call sheet') + dpr })
    ]));
  }
  tl.append(ul);
  return tl;
}

function renderPlanTile(projects) {
  const tl = tile('plan', 'Plan & usage', 'Your plan');
  const cp = PlanGate.currentPlan();
  const name = cp.planName || (cp.plan ? planName(cp.plan) : '');
  tl.append(
    h('p.db-tile-line', { text: name ? name + ' plan' : 'Not signed in \u2014 working locally on this device' }),
    h('p.db-tile-line', { text: projects.length + ' project' + (projects.length === 1 ? '' : 's')
      + ' here. The plan sets how many you can keep; Settings shows what yours allows.' }),
    h('a.btn.db-tile-go', { href: 'settings.html#plan', 'aria-label': 'Plans and upgrade, in Settings',
      text: name && cp.plan !== 'free' ? 'Manage plan' : 'See plans' })
  );
  return tl;
}

function renderBackupTile() {
  const tl = tile('backup', 'Backup', 'Is your work safe?');
  let st = null;
  try { st = getDriveStatus(); } catch (e) { /* a status is not a transfer */ }
  tl.append(h('p.db-tile-line', { text: st && st.connected
    ? 'Google Drive: connected' + (st.syncedAt ? ', last synced ' + relTime(st.syncedAt) : ', not yet synced') + '.'
    : 'Google Drive: not connected.' }));
  tl.append(h('p.db-tile-line', { text: 'Everything lives in this browser. A backup file is the only other copy unless Drive is on; '
    + 'this page cannot see when you last exported one.' }));
  tl.append(h('a.btn.db-tile-go', { href: 'index.html', 'aria-label': 'Export a backup, from the studio home page', text: 'Export a backup' }));
  return tl;
}

function renderDesk(snap, projects) {
  const sec = h('section.db-desk', { id: 'desk', 'aria-label': 'Today\u2019s desk' });
  sec.append(renderContinue(snap, projects), renderProjectTile(snap), renderActions(snap),
    renderWeek(snap), renderPlanTile(projects), renderBackupTile());
  return sec;
}

/* ---- header ----------------------------------------------------- */
function renderHead(snap) {
  const head = h('header.bd-head');
  head.append(
    h('p.bd-eyebrow', {
      text: 'Today\u2019s desk \u00b7 ' + (FORMAT_LABEL[snap.project.format] || 'Project')
    }),
    h('h1.bd-title', { text: snap.project.title }),
    h('p.bd-deck', {
      text: 'Where this project stands today. Every figure below is read from what '
          + 'you have already written — nothing on this page is typed, and nothing '
          + 'on it is stored.'
    })
  );
  if (!snap.isEmpty) {
    head.append(h('div.bd-stats', {}, [
      stat(snap.main.pct + '%', snap.main.blueprint.label),
      stat(String(snap.scenes.length), snap.scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(snap.eighths), snap.eighths === 8 ? 'page' : 'pages'),
      stat(String(snap.days.length), snap.days.length === 1 ? 'shoot day' : 'shoot days'),
      stat(String(snap.contacts.length), 'people')
    ]));
  }
  return head;
}

/* ---- what's next -------------------------------------------------
   One primary move, then the honest list of gaps. A gap is only shown
   when it is real: a project with no scenes is not nagged about
   unscheduled ones. */
function renderNext(snap) {
  const sec = section('next', 'What is next', 'The next thing to do.',
    'One step, then whatever else is genuinely missing.');

  const next = firstUnfinished(snap.main);
  if (next) {
    const { phase, step } = next;
    sec.append(h('div.db-next', {}, [
      h('span.db-next-num', { text: step.num }),
      h('div.db-next-body', {}, [
        h('p.db-next-where', { text: snap.main.blueprint.label + ' · ' + phase.label }),
        h('strong.db-next-title', { text: step.title }),
        h('p.db-next-deck', { text: step.deck }),
        h('p.db-next-count', {
          text: step.done + ' of ' + step.total + ' field' + (step.total === 1 ? '' : 's')
              + ' filled on this step'
        })
      ]),
      h('a.btn.primary.db-next-go', {
        href: snap.main.blueprint.href + '#' + step.id,
        text: 'Open step ' + step.num + '  →'
      })
    ]));
  } else if (snap.journey && !snap.journey.complete) {
    /* The blueprint is written; the journey still has a move. Its
       next is the stage's first missing tool check — the work the
       blueprint cannot do for you. */
    const j = snap.journey;
    sec.append(h('div.db-next', {}, [
      h('span.db-next-num', { text: '✓' }),
      h('div.db-next-body', {}, [
        h('p.db-next-where', { text: 'Every blueprint field is filled · ' + j.currentLabel }),
        h('strong.db-next-title', { text: j.next.label }),
        h('p.db-next-deck', {
          text: 'All ' + snap.main.total + ' fields of the blueprint have something in '
              + 'them. What is left is the work the blueprint cannot do for you.'
        })
      ]),
      h('a.btn.primary.db-next-go', { href: j.next.href, text: 'Go  →' })
    ]));
  } else {
    sec.append(h('div.db-next', {}, [
      h('span.db-next-num', { text: '✓' }),
      h('div.db-next-body', {}, [
        h('p.db-next-where', { text: snap.main.blueprint.label }),
        h('strong.db-next-title', { text: 'Every field is filled' }),
        h('p.db-next-deck', {
          text: 'All ' + snap.main.total + ' fields of the blueprint have something in '
              + 'them. What is left is the work the blueprint cannot do for you.'
        })
      ]),
      h('a.btn.primary.db-next-go', { href: snap.main.blueprint.href, text: 'Reread it  →' })
    ]));
  }

  const gaps = [];
  if (!snap.scenes.length) {
    gaps.push(['No scenes yet', 'The breakdown is where the stripboard, the reports and the call sheets come from.', 'breakdown.html']);
  }
  if (snap.scenes.length && snap.unscheduled.length) {
    gaps.push([
      snap.unscheduled.length + ' scene' + (snap.unscheduled.length === 1 ? '' : 's') + ' with no shoot day',
      'Put them on the stripboard and the day out of days builds itself.',
      'stripboard.html'
    ]);
  }
  if (snap.days.length && snap.datedDays < snap.days.length) {
    gaps.push([
      (snap.days.length - snap.datedDays) + ' shoot day' + (snap.days.length - snap.datedDays === 1 ? '' : 's') + ' with no date',
      'A day without a date cannot appear on a call sheet.',
      'plan.html#calendar'
    ]);
  }
  if (snap.scenes.length && !snap.contacts.length) {
    gaps.push(['Nobody in the contacts book', 'Cast and crew, by department — the call sheet reads from it.', 'contacts.html']);
  }
  if (snap.scenes.length && !snap.shots.length) {
    gaps.push(['No shots listed', 'The shot list hangs off the scenes you already have.', 'visualize.html']);
  }
  if (snap.days.length && !snap.budget.lines) {
    gaps.push([
      'The budget is empty',
      'You have ' + snap.days.length + ' shoot day' + (snap.days.length === 1 ? '' : 's') + '; the estimator can start from them.',
      'budget.html'
    ]);
  }

  /* Nothing on the list above is missing, but the journey may still
     know the stage's next move (a logline, a title page, the cut). It
     is the fallback, never an addition to a real list of gaps. */
  if (!gaps.length && snap.journey && !snap.journey.complete && next) {
    const j = snap.journey;
    gaps.push([j.next.label, 'The next move in ' + j.currentLabel + ', from the journey above.', j.next.href]);
  }

  if (gaps.length) {
    const list = h('ul.db-gaps');
    for (const [title, why, href] of gaps) {
      list.append(h('li.db-gap', {}, [
        h('a.db-gap-link', { href, text: title }),
        h('span.db-gap-why', { text: why })
      ]));
    }
    sec.append(list);
  } else {
    sec.append(h('p.db-none', {
      text: 'Nothing else is obviously missing — scenes, days, dates, people, '
          + 'shots and a budget are all in place.'
    }));
  }
  return sec;
}

/* ---- the journey -------------------------------------------------
   Five stages, the guide beside the tools, one next move. The strip
   is src/ui/journey-strip.js, shared with the hub. */
function renderJourney(project, j) {
  const sec = section('journey', 'The journey', 'Where the film is.',
    'Each stage shows two things: how much of its blueprint part is written '
    + '(Guide) and how much of the real work is in place (Tools).');
  const strip = renderJourneyStrip(project, { heading: false, journey: j });
  if (strip) sec.append(strip);
  return sec;
}

/* ---- blueprint progress ------------------------------------------ */
function phaseRow(phase) {
  const row = h('div.db-phase.' + stageHueClass(phase.id));
  const remaining = phase.steps.filter((s) => s.total && s.done < s.total).length;
  row.append(
    h('div.db-phase-head', {}, [
      h('strong.db-phase-label', { text: phase.label }),
      h('span.db-phase-pct', { text: phase.pct + '%' })
    ]),
    h('div.db-bar', {
      role: 'img',
      'aria-label': phase.label + ': ' + phase.pct + ' per cent of '
        + phase.total + ' fields filled'
    }, [h('span.db-bar-fill', { style: 'width:' + phase.pct + '%' })]),
    h('p.db-phase-meta', {
      text: phase.done + ' of ' + phase.total + ' fields · '
          + (remaining
            ? remaining + ' of ' + phase.steps.length + ' steps still open'
            : 'all ' + phase.steps.length + ' steps complete')
    })
  );
  return row;
}

function renderBlueprint(snap) {
  /* The scope is stated rather than implied. The blueprint page counts
     its own cover fields and scores the scene, shot, cast and location
     tables by the row; this page counts the fields the STEPS declare,
     because those are the ones src/data knows about and a hand-written
     list of the rest would be wrong by the second change. Same rule for
     what "filled" means, different denominator — so say which. */
  const sec = section('blueprint', 'The blueprint', 'Written so far.',
    'A field counts when it has something in it, which is the rule the '
    + 'blueprint uses for its own step badges. Counted across the fields the '
    + 'steps declare — not the cover, and not the scene, shot, cast and '
    + 'location tables, which the blueprint scores by the row.');
  const grid = h('div.db-phases');
  snap.main.phases.forEach((p) => grid.append(phaseRow(p)));
  sec.append(grid);

  sec.append(h('p.db-foot', {
    text: snap.main.done + ' of ' + snap.main.total + ' fields across '
        + snap.main.phases.reduce((n, p) => n + p.steps.length, 0) + ' steps.'
  }));

  /* The other blueprint is mentioned only when it holds something. A
     feature project does not need an empty short-film row. */
  if (snap.other.done > 0) {
    sec.append(h('p.db-foot', {}, [
      document.createTextNode('This project also has work in the '),
      h('a.db-link', { href: snap.other.blueprint.href, text: snap.other.blueprint.label }),
      document.createTextNode(' — ' + snap.other.done + ' of ' + snap.other.total
        + ' fields, ' + snap.other.pct + '%.')
    ]));
  }
  return sec;
}

/* ---- the production chain ---------------------------------------- */
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
  const grid = h('div.db-grid');
  const n = (v) => String(v);

  grid.append(
    chainCard(n(snap.scenes.length), 'Scenes', 'Breakdown — the one place a scene is typed', 'breakdown.html', 'shorts'),
    chainCard(formatEighths(snap.eighths), 'Scene pages', 'Length in eighths, from the breakdown', 'breakdown.html', 'shorts'),
    chainCard(n(snap.elements), 'Elements tagged', 'Cast, props, wardrobe, vehicles', 'breakdown.html#elements', 'shorts'),
    chainCard(n(snap.locationCount), 'Locations', 'Distinct places named on a scene', 'plan.html#locations', 'plan'),
    chainCard(n(snap.days.length), 'Shoot days', snap.unscheduled.length
      ? snap.unscheduled.length + ' scene' + (snap.unscheduled.length === 1 ? '' : 's') + ' still unscheduled'
      : 'Every scene has a day', 'stripboard.html', 'shoot'),
    chainCard(n(snap.datedDays), 'Dated days', 'Shoot days with a real date against them', 'plan.html#calendar', 'plan'),
    chainCard(n(snap.contacts.length), 'People', 'Cast and crew, by department', 'contacts.html', 'shoot'),
    chainCard(n(snap.sheets.length), 'Call sheets', 'Built from the day, the scenes and the people', 'contacts.html#call-sheets', 'shoot'),
    chainCard(n(snap.shots.length), 'Shots', 'Shot list, hung off the scenes', 'visualize.html', 'visualize'),
    chainCard(n(snap.boards), 'Storyboards', 'Frames, in order', 'visualize.html#storyboard', 'visualize'),
    chainCard(formatPages(snap.scriptPages), 'Screenplay pages', 'Written in the editor · ' + n(snap.revisions) + ' revision' + (snap.revisions === 1 ? '' : 's') + ' saved', 'write.html', 'library'),
    chainCard(snap.budget.short, 'Budget', snap.budget.lines
      ? snap.budget.exact + ' across ' + snap.budget.lines + ' line item' + (snap.budget.lines === 1 ? '' : 's')
      : 'Nothing costed yet', 'budget.html', 'plan')
  );
  sec.append(grid);
  return sec;
}

/* ---- projects ----------------------------------------------------
   The one section that is studio-wide, and therefore the one section
   that must not read through the storage proxy. Each row's progress
   comes from rawGet(key + '__' + id). */
function renderProjects(projects, current) {
  const sec = section('projects', 'The studio',
    projects.length === 1 ? 'One project on the desk.' : projects.length + ' projects on the desk.',
    'Switching here changes what every other page in the studio is looking at.');

  const list = h('div.db-projects');
  for (const p of projects) {
    const bp = BLUEPRINTS[p.format === 'short' ? 'short' : 'feature'];
    const prog = blueprintProgress(bp, readBlobFor(bp.storeKey, p.id));
    const isOpen = current && p.id === current.id;
    const row = h('div.db-proj' + (isOpen ? '.is-open' : ''));
    row.append(
      h('div.db-proj-body', {}, [
        h('strong.db-proj-title', { text: p.title }),
        h('span.db-proj-meta', {
          text: (FORMAT_LABEL[p.format] || p.format) + ' · ' + prog.pct + '% of '
              + bp.label.toLowerCase() + ' · edited ' + relTime(p.updatedAt)
        })
      ]),
      isOpen
        /* A status, not a control (UX audit L25): the bordered pill
           beside the OPEN buttons of the other rows read as one more. */
        ? h('span.db-proj-flag', { text: 'Open now' })
        : h('button.btn.db-proj-open', {
            type: 'button', 'data-action': 'open-project', 'data-project': p.id,
            text: 'Open'
          })
    );
    list.append(row);
  }
  sec.append(list);
  sec.append(h('p.db-foot', {}, [
    document.createTextNode('New projects, backups and the reset live on the '),
    h('a.db-link', { href: 'index.html', text: 'studio home page' }),
    document.createTextNode('.')
  ]));
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
function how(n, title, body, href, cta) {
  return h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body }),
    h('a.db-link', { href, text: cta + ' →' })
  ]);
}

function renderNoProject() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◴', 'aria-hidden': 'true' }),
    h('h2', { text: 'No project is open' }),
    h('p', {
      text: 'The dashboard reports on one film at a time. Start a project, or '
          + 'open one, and its progress appears here.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Start a film', 'Name it and pick a format. It takes one line, and you can rename it later.', 'index.html', 'Studio home'),
      how('2', 'Or look around first', 'The library needs no project at all — four films taken apart, the craft rules, the Chennai rates.', 'library.html', 'Open the library'),
      how('3', 'Or read the blueprint', 'Thirty-two steps from the spark to delivery. Reading costs nothing.', 'feature.html', 'Open the blueprint')
    ]),
    h('div.db-cta-row', {}, [
      h('a.btn.primary.bd-cta', { href: 'index.html', text: 'Go to the studio  →' })
    ])
  ]);
}

function renderFirstRun(project) {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◴', 'aria-hidden': 'true' }),
    h('h2', { text: 'Nothing written yet' }),
    h('p', {
      text: '“' + project.title + '” exists and that is all it does so far. There '
          + 'is no honest progress to report, so here is where the first hour '
          + 'usually goes instead.'
    }),
    h('div.bd-how', {}, [
      how('1', 'The spark', 'One "what if", in your own words. It is the only step that cannot be derived from another.', 'feature.html#step-01', 'Open step 01'),
      how('2', 'The scenes', 'If the story is already in your head, list the scenes — the stripboard, the reports and the call sheets all read from that one list.', 'breakdown.html', 'Open the breakdown'),
      how('3', 'The rates', 'What things actually cost in Chennai, and an estimator that reads your shoot days.', 'budget.html', 'Open the budget')
    ]),
    h('div.db-cta-row', {}, [
      h('a.btn.primary.bd-cta', { href: 'feature.html#step-01', text: 'Start at the spark  →' })
    ])
  ]);
}

/* ============================================================
   RENDER
   ============================================================ */
function render() {
  const project = Store.currentProject();
  const projects = Store.listProjects();
  const main = h('main', { id: 'main' });

  if (!project) {
    main.append(
      h('header.bd-head', {}, [
        h('p.bd-eyebrow', { text: 'Studio' }),
        h('h1.bd-title', { text: 'Dashboard.' }),
        h('p.bd-deck', {
          text: 'Where a film stands: its blueprint, its scenes, its schedule and '
              + 'what is still missing — read from the project you have open.'
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
    main.append(renderHead(snap), renderDesk(snap, projects));
    /* After the stat tiles and before everything else, empty project
       included: "you are in Story, write the logline" is the most
       useful thing this page can say to a film with nothing in it. */
    main.append(renderJourney(project, snap.journey));
    if (snap.isEmpty) {
      main.append(renderFirstRun(project));
    } else {
      main.append(renderNext(snap), renderBlueprint(snap), renderChain(snap));
    }
    /* OUTSIDE the isEmpty branch on purpose. `isEmpty` asks whether
       the BLUEPRINT has been filled in, and readiness asks about the
       SCENES — a producer who imported a script and has not answered
       a single blueprint step is exactly who this is for, and the
       first version hid it from them. renderReadiness() returns null
       when there are no scenes, which is the condition that actually
       governs it. */
    const ready = renderReadiness();
    if (ready) main.append(ready);
    main.append(renderProjects(projects, project));
    const activity = renderActivity(snap.scenes);
    if (activity) main.append(activity);
  }

  app.replaceChildren(main);
  mountShell();
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
delegate(document, 'click', '[data-action="open-project"]', (e, el) => {
  const id = el.dataset.project;
  if (!id) return;
  Store.setCurrentProject(id);
  const heading = document.querySelector('.bd-title');
  if (heading) heading.scrollIntoView({ block: 'start' });
});

/* The project changed under us — switched here, or renamed on the hub. */
Store.subscribe('current:changed', () => render());
Store.subscribe('project:meta', () => render());
Store.subscribe('plan:changed', () => render());

render();
