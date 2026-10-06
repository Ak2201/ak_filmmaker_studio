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
import { harvestKeys } from '../lib/blueprint-fields.js';
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
import { readiness } from '../lib/readiness.js';

import featureData from '../data/steps.feature.json';
import prodData from '../data/steps.production.json';
import shortData from '../data/steps.short.json';

const app = document.getElementById('app');

/* Storage keys, spelled exactly as store.js's SCOPED_KEYS spells them.
   These are read-only here; not one line of this file writes to them. */
const FEATURE_KEY = 'fms_filmmaker_combined_v1';
const SHORT_KEY = 'fms_shortfilm_blueprint_v1';
const LIB_CALC_KEY = 'fms_library_calc_v1';
const ACTIVITY_KEY = 'fms_studio_activity_v1';

/* ============================================================
   THE BLUEPRINTS, AS A FIELD LIST
   ------------------------------------------------------------
   Derived from src/data, never hand-listed — the same rule that put
   the steps in JSON in the first place. Two sources of field names:

     `key` properties, on the asks and checklist items the renderer
     builds from structured blocks, and

     data-key attributes inside `raw` blocks — the elements the
     extractors could not model, re-inserted verbatim. There are 145
     of those on the feature blueprint alone, and a count that
     ignored them would report a filled project as a third done.
   ============================================================ */
/* harvestKeys moved to src/lib/blueprint-fields.js — hub.js needed
   the same derivation to stop reporting 11 saved fields as 100%
   complete, and two copies of a denominator is how the two pages
   disagreed in the first place. */

/* The short film's five beats live in their own array and are rendered
   by the `beatviz` block inside step 4. Attributing them to that step
   is what makes "what's next" point at the step the user would open. */
const hasBlock = (step, type) => (step.blocks || []).some((b) => b.type === type);

function stepFields(step, blueprintId) {
  const keys = harvestKeys(step, new Set());
  if (blueprintId === 'short' && hasBlock(step, 'beatviz')) {
    harvestKeys(shortData.beats, keys);
  }
  return keys;
}

function buildPhase(label, hue, steps, blueprintId, href) {
  return {
    label,
    hue,
    href,
    steps: steps.map((s) => ({
      id: s.id,
      num: s.num,
      title: String(s.titlePlain || s.title || '').replace(/<[^>]*>/g, '').replace(/\.$/, ''),
      deck: String(s.deck || '').replace(/<[^>]*>/g, ''),
      keys: stepFields(s, blueprintId)
    }))
  };
}

/* Production and Post are rendered on feature.html too — feature.js
   imports steps.production.json — so every href here is that page. */
const BLUEPRINTS = {
  feature: {
    id: 'feature',
    label: 'Feature Blueprint',
    href: 'feature.html',
    storeKey: FEATURE_KEY,
    phases: [
      buildPhase('Story', 'feature', featureData.vol1, 'feature', 'feature.html'),
      buildPhase('Pre-production', 'visualize', featureData.vol2, 'feature', 'feature.html'),
      buildPhase('Production', 'shoot', prodData.production, 'feature', 'feature.html'),
      buildPhase('Post-production', 'plan', prodData.post, 'feature', 'feature.html')
    ]
  },
  short: {
    id: 'short',
    label: 'Short Blueprint',
    href: 'short.html',
    storeKey: SHORT_KEY,
    phases: [buildPhase('Eleven steps', 'shorts', shortData.steps, 'short', 'short.html')]
  }
};

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

/** feature.js's definition, and it has to stay feature.js's definition. */
function isFilled(value) {
  if (value === true) return true;
  if (typeof value === 'string') return value.trim().length > 0;
  return false;
}

function countFields(keys, data) {
  let done = 0;
  for (const k of keys) if (isFilled(data[k])) done++;
  return done;
}

function blueprintProgress(blueprint, data) {
  const phases = blueprint.phases.map((phase) => {
    const steps = phase.steps.map((step) => {
      const total = step.keys.size;
      const done = countFields(step.keys, data);
      return { ...step, total, done };
    });
    const total = steps.reduce((n, s) => n + s.total, 0);
    const done = steps.reduce((n, s) => n + s.done, 0);
    return { ...phase, steps, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  });
  const total = phases.reduce((n, p) => n + p.total, 0);
  const done = phases.reduce((n, p) => n + p.done, 0);
  return {
    blueprint, phases, total, done,
    pct: total ? Math.round((done / total) * 100) : 0
  };
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
    boards: Shots.listBoards().length
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

   Returns null when there are no scenes: a wall of green saying
   nothing is wrong with nothing is the most misleading answer this
   page could give. */
function renderReadiness() {
  const r = readiness();
  if (!r.hasFilm) return null;

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

/* ---- header ----------------------------------------------------- */
function renderHead(snap) {
  const head = h('header.bd-head');
  head.append(
    h('p.bd-eyebrow', {
      text: 'Dashboard · ' + (FORMAT_LABEL[snap.project.format] || 'Project')
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
      'You have ' + snap.days.length + ' shoot day' + (snap.days.length === 1 ? '' : 's') + '; the calculator can start from them.',
      'library.html#budget'
    ]);
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

/* ---- blueprint progress ------------------------------------------ */
function phaseRow(phase) {
  const row = h('div.db-phase.hue-' + phase.hue);
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
      : 'Nothing costed yet', 'library.html#budget', 'plan')
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
        ? h('span.db-proj-flag', { text: 'OPEN' })
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

/* ---- recent ------------------------------------------------------ */
function renderActivity() {
  const entries = recentActivity(6);
  if (!entries.length) return null;
  const sec = section('recent', 'Recent', 'What moved lately.',
    'Logged by the studio as you work. This project only.');
  const list = h('ol.db-log');
  for (const e of entries) {
    const line = h('li.db-log-row');
    const what = h('span.db-log-what', { text: String(e.what || e.where || 'Edited') });
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
      how('3', 'The rates', 'What things actually cost in Chennai, and a calculator that reads your shoot days.', 'library.html#budget', 'Open the budget')
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
        h('p.bd-eyebrow', { text: 'Dashboard' }),
        h('h1.bd-title', { text: 'Nothing open.' }),
        h('p.bd-deck', {
          text: 'The dashboard reports on the project you have open. There is not '
              + 'one, so there is nothing to report.'
        })
      ]),
      renderNoProject()
    );
  } else {
    const snap = snapshot(project);
    main.append(renderHead(snap));
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
    const activity = renderActivity();
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

render();
