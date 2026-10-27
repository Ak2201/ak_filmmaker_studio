/* ============================================================
   DASHBOARD — where the open project actually stands
   ------------------------------------------------------------
   A LANDING PAGE, not another editor. Nothing here is stored that
   another model does not own: the one thing typed here is the Title
   page (the blueprint's own cover keys, through blueprint-store's
   merge-write; see renderTitlePage), and every number on this page is
   derived, on render, from the models that already own it —

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
import Store, { setProjectSubtitle } from '../lib/store.js';
import { stageHueClass, favouriteOf } from '../lib/journey.js';
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
import { h, commitMain, delegate } from '../lib/dom.js';
import { reveal } from '../lib/motion.js';
import { renderLauncher } from '../ui/launcher.js';
import { statStrip, badge, meter, button, buttonGroup, eyebrow as kEyebrow, panel as kPanel, askText, pageHeader, field } from '../ui/kit/index.js';
/* The Title page: the Story stage's cover fields, the blueprint's own keys
   (src/lib/cover-fields.js), written through the merge-write. */
import { readFields, writeFields, blobKey } from '../lib/blueprint-store.js';
import { coverFields, coverNs } from '../lib/cover-fields.js';
import { paperField } from '../ui/paper-field.js';
import { preservingFocus } from '../lib/autosave.js';
import { filmRegion, setFilmRegion } from '../lib/film-region.js';   // = region.js currentProjectPrefs / setProjectRegion; film-region.js says why
import '../ui/india-content.js';   // the India-only switch follows this film's region

import { formatEighths } from '../lib/scenes.js';
import { formatPages } from '../lib/script.js';
/* Derived, never stored — see the header of readiness.js. */
import { readiness } from '../lib/readiness.js';
import PlanGate from '../lib/plan-gate.js';
import { getDriveStatus, push as drivePush } from '../lib/drive-sync.js';
import { dprSummary } from '../lib/dpr.js';
import { planName } from '../lib/plans.js';
/* Every number on this page, derived: the snapshot, the dates, the
   readiness order, the activity lines (docs/ARCHITECTURE.md). */
import {
  snapshot, relTime, sceneTagged, nextDatedDay, nextShootNote, crewCastNote, nextShootLine,
  weekDays, coveredSceneIds, dayDetail, sortChecks, readinessDeck, WHY, continueTarget,
  planLine, recentEntries, pathFactLine, when
} from '../lib/dashboard-model.js';


const app = document.getElementById('app');

/* ============================================================
   THE BLUEPRINTS, READING WHAT IS STORED, THE SNAPSHOT
   ------------------------------------------------------------
   src/lib/dashboard-model.js: the field list grouped by stage (from
   journey.js, so the journey strip, the hub's cards and this page count
   one way), the budget rows and the activity log (read-only, through the
   proxy, so this project's), and the snapshot — every number this page
   shows, in one object. parseNum / INR / the short rupee format come from
   src/lib/money.js there; this file used to carry its own copy.
   ============================================================ */
const FORMAT_LABEL = {
  feature: 'Feature film',
  short: 'Short film',
  documentary: 'Documentary',
  musicvideo: 'Music video',
  adfilm: 'Ad film'
};

/* ============================================================
   PIECES
   ============================================================ */
/* A figure for the KPI strip: the kit's stat card (JetBrains Mono value). */
const stat = (value, unit, label, note) => ({ label, value, unit: value === '\u2014' ? '' : unit, note: note || '' });

/* The strip's second line (sceneTagged, nextShootNote, crewCastNote) is
   derived in src/lib/dashboard-model.js, each left out when there is
   nothing real to say. */

function section(id, eyebrow, title, deck) {
  const sec = h('section.db-sec', { id, 'data-reveal': '' });
  // No eyebrow when it would only repeat the heading ("Title page" over "The title page").
  if (eyebrow) sec.append(kEyebrow(eyebrow));
  sec.append(h('h2.bd-h2', { text: title }));
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
  const deck = readinessDeck(r);

  const sec = section('readiness', 'Derived from your scenes · nothing to tick',
    'Could you shoot tomorrow?', deck);
  const nPass = r.checks.filter((c) => c.passed).length;
  if (r.checks.length) {
    const pct = Math.round((nPass / r.checks.length) * 100);
    sec.querySelector('.bd-h2').after(badge({ label: pct + '% ready', tone: pct === 100 ? 'ok' : r.blockers ? 'danger' : 'warn', class: 'db-pct' }));
  }

  /* Failures first and blockers above gaps, because the order IS the
     advice. Passed checks are still SHOWN, as evidence the question
     was asked — but as one compact row of ticks under the work, so
     five green cards no longer outweigh the two things to do. */
  const sorted = sortChecks(r.checks);
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
/* The dates (localDay, daysFromToday, when) are src/lib/dashboard-model.js. */

/* A desk tile is the kit's panel: eyebrow in the header, the title
   (an h2, so the heading order holds) opening the body. Callers append
   to tb(tile), the panel's body. */
function tile(id, eyebrow, title) {
  const t = kPanel({ eyebrow, class: 'db-tile', attrs: { 'aria-labelledby': 'dbt-' + id } });
  tb(t).append(h('h2.db-tile-h', { id: 'dbt-' + id, text: title }));
  return t;
}
const tb = (t) => t.querySelector('.k-panel-body');

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
/* WHY, the suggestion's reason, is src/lib/dashboard-model.js. */

function renderContinue(snap) {
  /* THIS PROJECT ONLY (owner, 11 Oct 2026): it used to suggest the most
     recently edited OTHER film. Switching films is the home page's job. */
  const tl = tile('continue', 'Continue', 'Pick up where you left off');
  tl.classList.add('db-up');
  const t = continueTarget(snap);
  tb(tl).append(h('p.db-tile-line', { id: 'resume', text: t.what + (t.ts ? ' · edited ' + relTime(t.ts) : '') }));
  /* How far the stage you are in has got, from the same figures the stage
     cards print. Tools is the measured one; with nothing to count it is left out. */
  const cur = snap.journey && snap.journey.stages.find((x) => x.id === snap.journey.current);
  if (cur && cur.tools.total) {
    const m = meter({ label: cur.label + ' · ' + cur.tools.done + ' of ' + cur.tools.total + ' done', value: cur.tools.pct, max: 100, hue: stageHueClass(cur.hue), class: 'db-up-meter' });
    tb(tl).append(m);
    if (cur.tools.note) tb(tl).append(h('p.db-tile-line', { text: cur.tools.note }));
  }
  tb(tl).append(
    button({ label: 'Continue', variant: 'primary', size: 'lg', iconAfter: 'arrow_forward', href: t.href, class: 'db-big', attrs: { 'aria-label': 'Continue: ' + t.what } })
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
    acts.append(button({ label: 'Go to ' + sugState.label, href: sugState.href, iconAfter: 'arrow_forward', attrs: { 'aria-label': 'Go to ' + sugState.label } }));
    const nx = snap.journey && snap.journey.next;
    if (nx && nx.href && nx.label) {
      acts.append(h('a.db-gap-link', { href: nx.href, text: 'Next step: ' + nx.label }));
    }
    box.append(acts);
  } else {
    box.append(h('p.db-none', { text: 'Every stage is done. Open any card to review it.' }));
  }
  tb(tl).append(box);
  return tl;
}

function renderReadyTile() {
  const tl = tile('ready', 'Readiness', 'Three things to do');
  tl.classList.add('db-ready');
  const r = readiness();
  if (!r.hasFilm) {
    tb(tl).append(
      h('p.db-tile-line', { text: 'No scenes yet, so nothing to check.' }),
      h('ul.db-acts', {}, [h('li', {}, [
        h('a.db-gap-link', { href: 'breakdown.html', text: 'Add the scenes' }),
        h('span.db-gap-why', { text: 'Readiness is derived from them.' })
      ])])
    );
    return tl;
  }

  const sorted = sortChecks(r.checks);
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
  tb(tl).append(
    h('p.db-score', {}, [h('strong', { text: pass + '/' + total }), h('span', { text: 'checks pass' })]),
    seg,
    h('p.db-tile-line', { text: 'Readiness: ' + label })
  );

  const todo = sorted.filter((c) => !c.passed).slice(0, 3);
  const ul = h('ul.db-acts');
  if (!todo.length) {
    ul.append(h('li', {}, [h('span.db-gap-why', { text: 'Every readiness check passes.' })]));
  } else {
    todo.forEach((c) => ul.append(h('li.db-fix.' + (c.severity === 'blocker' ? 'is-blocker' : 'is-gap'), {}, [
      h('span.db-fix-dot', { 'aria-hidden': 'true' }),
      h('span.db-fix-body', {}, [
        h('span.db-fix-label', { text: c.label }),
        h('span.db-gap-why', { text: c.hint })
      ]),
      h('span.db-fix-n', { text: String(c.count), 'aria-label': c.count + ' affected' }),
      h('a.db-fix-go', { href: c.where || 'dashboard.html#readiness', 'aria-label': 'Fix it: ' + c.label, text: 'Fix it \u2192' })
    ])));
  }
  tb(tl).append(ul, h('a.db-link.db-tile-more', { href: '#readiness', text: 'See every check ↓' }));
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
function renderWeek(snap) {
  const tl = tile('week', 'This week', 'Shoot days and call sheets');
  tb(tl).append(h('p.db-tile-line.db-strong', { text: nextShootLine(snap) }));
  const covered = coveredSceneIds(snap.sheets);
  /* The next dated day, in full: where, when the crew is called, and the
     call sheet itself. Each line shows only what a record really holds. */
  const nx = nextDatedDay(snap);
  if (nx) {
    const { places, sheet } = dayDetail(snap, nx.d);
    const dl = h('dl.db-facts');
    const fact = (k, v) => dl.append(h('dt', { text: k }), h('dd', { text: v }));
    if (places.length) fact('Location', places.slice(0, 2).join(' · ') + (places.length > 2 ? ' +' + (places.length - 2) : ''));
    if (sheet && sheet.generalCall) fact('Crew call', sheet.generalCall);
    if (dl.children.length) tb(tl).append(dl);
    tb(tl).append(sheet
      ? h('a.db-link', { href: 'contacts.html#call-sheets', text: 'View call sheet' + (sheet.title ? ' · ' + sheet.title : '') + ' \u2192' })
      : h('a.db-link', { href: 'contacts.html#call-sheets', text: 'Make a call sheet for day ' + nx.d.day + ' \u2192' }));
  }
  tb(tl).append(h('nav.db-trio', { 'aria-label': 'Shortcuts' }, [
    h('a.db-trio-i', { href: 'breakdown.html', text: 'Breakdown' }),
    h('a.db-trio-i', { href: 'stripboard.html', text: 'Stripboard' }),
    h('a.db-trio-i', { href: 'visualize.html', text: 'Visualise' })
  ]));
  const rows = weekDays(snap);
  if (!rows.length) {
    tb(tl).append(h('p.db-tile-line', { text: snap.datedDays
      ? 'No shoot day falls in the next seven days.' : 'No shoot day has a date yet.' }),
      h('a.db-gap-link', { href: 'plan.html#calendar', text: 'Open the Shoot Calendar' }));
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
  tb(tl).append(ul);
  return tl;
}

function renderPlanTile() {
  const tl = tile('plan', 'Plan', 'Your plan');
  const cp = PlanGate.currentPlan();
  const name = cp.planName || (cp.plan ? planName(cp.plan) : '');
  const line = planLine(cp, name);
  tb(tl).append(
    h('p.db-tile-line', { text: line }),
    button({ label: name && cp.plan !== 'free' ? 'Manage plan' : 'See plans', href: 'purchase.html', class: 'db-tile-go', attrs: { 'aria-label': 'Plans and upgrade' } })
  );
  return tl;
}

function renderBackupTile() {
  const tl = tile('backup', 'Backup', 'Is your work safe?');
  let st = null;
  try { st = getDriveStatus(); } catch (e) { /* a status is not a transfer */ }
  const on = !!(st && st.connected);
  tb(tl).append(h('p.db-tile-line.db-state' + (on ? '.is-on' : '.is-off'), {}, [
    h('span.db-dot', { 'aria-hidden': 'true' }),
    txt(on
      ? 'Google Drive: connected' + (st.syncedAt ? ', last synced ' + relTime(st.syncedAt) : ', not yet synced') + '.'
      : 'Google Drive: not connected.')
  ]));
  tb(tl).append(h('p.db-tile-line', { text: 'Everything lives in this browser. A backup file is the only other copy unless Drive is on; '
    + 'this page cannot see when you last exported one.' }));
  if (on) tb(tl).append(button({ label: 'Sync now', icon: 'cloud_sync', attrs: { 'data-action': 'drive-sync', 'aria-label': 'Sync to Google Drive now' } }));
  tb(tl).append(button({ label: 'Export a backup', href: 'index.html', class: 'db-tile-go', attrs: { 'aria-label': 'Export a backup, from the studio home page' } }));
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
  /* The project's own block, under the page's header (ONE PAGE FRAME:
     the h1 is the page's name on every page; the film's title is the
     first thing under it, as an h2). */
  const head = h('header.db-head', { 'aria-label': 'This project' });
  const j = snap.journey;
  head.append(
    h('div.db-chips', {}, [
      badge({ label: FORMAT_LABEL[p.format] || 'Project', tag: true, tone: 'info' }),
      badge({ label: 'Project dashboard', tag: true }),
      j ? badge({ label: 'Stage: ' + j.currentLabel, tag: true }) : null
    ]),
    h('h2.bd-title.k-project-title.db-project-title', { text: p.title }),
    h('p.db-slate', { id: 'slate' }, p.subtitle ? [
      h('span.db-slate-k', { text: 'Slate' }), h('span.db-slate-v', { text: p.subtitle }), txt(' · '),
      h('button.db-link.db-slate-edit', { type: 'button', 'data-action': 'slate-edit', text: 'change' })
    ] : [
      h('button.db-link.db-slate-edit', { type: 'button', 'data-action': 'slate-edit', text: 'Add a subtitle' })
    ]),
    h('p.bd-deck', {
      text: 'Five stages, in any order, each read from what you have already made. '
          + 'Nothing is mandatory: with a screenplay in hand, start straight in Pre-Production.'
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
    const sc = snap.scenes.length;
    head.append(statStrip([
      stat(String(sc), sc === 1 ? 'scene' : 'scenes', 'Scenes', sc ? sceneTagged(snap) + ' broken down' : ''),
      stat(formatEighths(snap.eighths), snap.eighths === 8 ? 'page' : 'pages', 'Page count',
        snap.scriptPages ? formatPages(snap.scriptPages) + ' script pp' : ''),
      stat(snap.days.length ? String(snap.days.length) : '\u2014', snap.days.length === 1 ? 'day' : 'days', 'Shoot days',
        nextShootNote(snap)),
      stat(snap.contacts.length ? String(snap.contacts.length) : '\u2014', 'people', 'Crew & cast', crewCastNote(snap)),
      stat(snap.boardedShots ? String(snap.boardedShots) : '\u2014', 'shots', 'Boarded shots',
        snap.shots.length ? snap.shots.length + ' shots planned' : ''),
      // The live estimator's sum: nothing is locked, and contingency is
      // not in it (the budget page's Total budget adds it). It once
      // said 'Locked budget' while budget.html said 'Nothing locked yet'.
      stat(snap.budget.lines ? snap.budget.short : '\u2014', '', 'Budget estimate',
        snap.budget.lines ? snap.budget.lines + ' line item' + (snap.budget.lines === 1 ? '' : 's') + ', before contingency' : '')
    ], { class: 'db-stats', label: 'This film in numbers' }));
  }
  return head;
}

/* ---- the title page -----------------------------------------------
   The film's cover sheet — title, writer, draft (and, on a feature, the
   working title, genre and stage) — moved here from the Story page on
   19 Oct 2026 (owner). The ONE thing this page types into, and it
   invents no state for it: the fields carry the blueprint's own
   data-keys (meta_*, v1_*), read from and written to the blueprint's
   blob through src/lib/blueprint-store.js writeFields(), the merge-write
   that leaves every other answer in the blob alone. story.html keeps its
   copy of the cover hidden (#guide), on another page, so there are never
   two live inputs for one key in one document. Nothing is written until
   somebody types: the idle-write check still holds. */
/* Why two titles and what "Stage" means here: the cover holds both,
   and with no hint the pair read as a duplicate and Stage as the
   studio's own stage badge. Labels only; every data-key is unchanged. */
const TP_HINTS = {
  v1_title: 'If different from the project title',
  meta_stage: 'Where the film is: Story, Screenplay, Pre-production…'
};

/* PROJECT TITLE is the project's name (store.js's AUTO TITLE BRIDGE
   ties meta_title to it on the blueprints, but it binds once, ~100ms
   after DOMContentLoaded, before this card exists). An empty stored
   title shows the project's name, written nowhere until it is edited;
   a changed one renames the project (saveProjectTitle below). */
function tpValue(key, stored, project) {
  const v = typeof stored === 'string' ? stored : '';
  return key === 'meta_title' && !v.trim() ? ((project && project.title) || '') : v;
}

function renderTitlePage(project) {
  const fmt = coverNs(project.format);
  const fields = coverFields('story', fmt);
  const sec = section('title-page', null, 'The title page',
    (fmt === 'short' ? 'What heads this film’s title page: its title, writer, start date and runtime.' : 'What heads this film’s title page: its title, writer, genre and draft.')
    + ' Change it here.');
  sec.classList.add('db-title-page');
  if (!fields.length) return sec;
  const vals = readFields(fmt, fields.map((f) => f.key));
  const grid = h('div.db-tp-grid');
  for (const f of fields) {
    const v = tpValue(f.key, vals[f.key], project);
    const attrs = { 'data-key': f.key, 'data-tp-ns': fmt };
    const hint = TP_HINTS[f.key] || '';
    grid.append(f.options
      ? field({ kind: 'select', id: 'tp_' + f.key, label: f.label, value: v, attrs, hint,
        /* A saved genre the list does not name (typed in an older
           version, or the sample's) stays an option: otherwise the
           select showed a blank box and a change would drop the answer. */
        options: [{ value: '', label: f.empty || 'Choose…' },
          ...(v && !f.options.includes(v) ? [{ value: v, label: v }] : []),
          ...f.options.map((o) => ({ value: o, label: o }))] })
      : field({ id: 'tp_' + f.key, label: f.label, value: v, placeholder: f.key === 'meta_stage' ? '' : (f.placeholder || ''), attrs, hint }));
  }
  /* A title page is writing: its text fields are paper (owner, 20 Oct
     2026). The genre select stays a control, and a date, a count, a
     runtime or a budget stays dark — the same rule the blueprint keeps. */
  for (const el of grid.querySelectorAll('input[data-key]')) {
    if (!TP_NOT_PROSE.has(el.dataset.key)) paperField(el);
  }
  sec.append(grid);
  sec.append(renderRegionRow(project));
  return sec;
}

/* Where the film is being made (docs/US-MARKET-PLAN.md §A3). On the
   project's ENTRY, beside its title and format — no data-key, no new
   storage key. Set on a click only (setFilmRegion), never on load. */
function renderRegionRow(project) {
  const pp = filmRegion(project.id);
  const now = pp.explicit ? pp.region : '';
  const opt = (id, label, title) => button({
    label, title, size: 'sm', variant: now === id ? 'primary' : 'secondary', action: 'tp-region',
    attrs: { 'data-region': id, 'aria-pressed': now === id ? 'true' : 'false' }
  });
  return h('div.db-tp-region', {}, [
    h('span.db-tp-region-label', { id: 'tpRegionLabel', text: 'Where is this film being made?' }),
    buttonGroup([
      opt('IN', 'India', 'Rupees, A4 and Indian dates on the paperwork, with the India-only checks.'),
      opt('INT', 'Elsewhere', 'US dollars, US Letter and US dates on the paperwork; the India-only material is hidden.')
    ], { label: 'Where is this film being made?' }),
    h('p.db-tp-region-note', { text: !pp.explicit
      ? 'Not set: this film started before films had a region, so its paperwork stays in rupees on A4 and its India-only material follows this device. Pick one to set it.'
      : pp.region === 'IN'
        ? 'India: rupees, A4 and Indian dates on the paperwork, with the certification checks and the Tamil help.'
        : 'Elsewhere: US dollars, US Letter and US dates on the paperwork. The India-only material is hidden on this film\u2019s pages, never deleted.' })
  ]);
}
delegate(app, 'click', '[data-action="tp-region"]', (e, el) => {
  const p = Store.currentProject();
  if (!p) return;
  const region = el.getAttribute('data-region');
  if (!setFilmRegion(region, p.id)) { StudioUI.toastError('The film\u2019s region could not be changed.'); return; }
  render();
  /* The redraw replaced the pressed button: the keyboard stays on it. */
  const again = app.querySelector('[data-action="tp-region"][data-region="' + CSS.escape(region) + '"]');
  if (again) again.focus({ preventScroll: true });
});

/* Title page keys that are a date, a number or money, not writing. */
const TP_NOT_PROSE = new Set(['meta_started', 'meta_runtime', 'v2_start', 'v2_shoot',
  'v2_budget', 'p3_start', 'p3_days', 'p4_lock']);

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

/* The kit's meter, in the stage's own hue (the li carries the hue class). */
function stageMeter(label, pct, value, hasTotal) {
  const m = meter({ label, value: Math.max(0, Math.min(100, pct || 0)), max: 100, hue: 'st-hue', show: false });
  m.classList.add('st-meter');
  const read = h('b.k-meter-read', { text: value });
  m.querySelector('.k-meter-row').append(read);
  return m;
}

function stageCard(s, suggested, js, current) {
  const li = h('li.st-card.' + stageHueClass(s.hue) + '.st-' + s.status.id + (suggested ? '.is-suggested' : ''),
    { id: 'stage-' + s.id });
  li.append(h('div.st-head', {}, [
    h('span.st-part', { text: 'Part ' + s.part }),
    s.status.id === 'done' ? badge({ label: 'Done', tone: 'ok', dot: true })
      : s.status.id === 'doing' ? badge({ label: 'In progress', tone: 'info', dot: true }) : null,
    /* The writer's own lock (outline locked / scene numbers locked), never inferred. */
    s.locked ? badge({ label: 'Locked', tone: 'ok', icon: 'lock', title: s.id === 'story' ? 'The step outline is locked' : 'The scene numbers are locked' }) : null,
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
  /* No href: every module of the stage is switched off (journey.js
     stageHref), so there is nothing to open and no button is drawn. */
  if (s.href) acts.append(button({
    label: GO[s.status.id], variant: suggested ? 'primary' : 'secondary', iconAfter: 'arrow_forward',
    href: s.href, class: 'st-go',
    attrs: { 'aria-label': GO[s.status.id] + ' ' + s.label + ' — ' + s.status.label }
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
  if (j) {
    const at = snap.states.findIndex((x) => x.id === j.current);
    if (at >= 0) sec.querySelector('.bd-h2').after(badge({ label: j.complete ? 'All ' + snap.states.length + ' stages in hand' : 'Step ' + (at + 1) + ' of ' + snap.states.length, tag: true, class: 'db-step-n' }));
  }
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
    group('Breakdown', [
      chainCard(n(snap.scenes.length), 'Scenes', 'Breakdown — the one place a scene is typed', 'breakdown.html', 'shorts'),
      chainCard(formatEighths(snap.eighths), 'Scene pages', 'Length in eighths, from the breakdown', 'breakdown.html', 'shorts'),
      chainCard(n(snap.elements), 'Elements tagged', 'Cast, props, wardrobe, vehicles', 'breakdown.html#elements', 'shorts'),
      chainCard(formatPages(snap.scriptPages), 'Screenplay pages', 'Written in the editor · ' + n(snap.revisions) + ' draft' + (snap.revisions === 1 ? '' : 's') + ' saved', 'screenplay.html', 'library')
    ]),
    group('Plan & Schedule', [
      chainCard(n(snap.locationCount), 'Locations', 'Distinct places named on a scene', 'plan.html#locations', 'plan'),
      chainCard(n(snap.days.length), 'Shoot days', snap.unscheduled.length
        ? snap.unscheduled.length + ' scene' + (snap.unscheduled.length === 1 ? '' : 's') + ' still unscheduled'
        : 'Every scene has a day', 'stripboard.html', 'shoot'),
      chainCard(n(snap.datedDays), 'Dated days', 'Shoot days with a real date against them', 'plan.html#calendar', 'plan'),
      chainCard(snap.budget.short, 'Budget', snap.budget.lines
        ? snap.budget.exact + ' across ' + snap.budget.lines + ' line item' + (snap.budget.lines === 1 ? '' : 's')
        : 'Nothing costed yet', 'budget.html', 'plan')
    ]),
    group('Budget & People', [
      chainCard(n(snap.contacts.length), 'Cast & Crew', 'Cast and crew, by department', 'contacts.html', 'shoot'),
      chainCard(n(snap.sheets.length), 'Call sheets', 'Built from the day, the scenes and the people', 'contacts.html#call-sheets', 'shoot')
    ]),
    group('Visualise', [
      chainCard(n(snap.shots.length), 'Shots', 'Shot list, hung off the scenes', 'visualize.html', 'visualize'),
      chainCard(n(snap.boards), 'Storyboards', 'Frames, in order', 'visualize.html#storyboard', 'visualize')
    ])
  );
  return sec;
}

/* ---- recent ------------------------------------------------------
   TWO sources, both read-only, and the copy says which: the hub's log
   and the shoot day's own marks (`shotAt`, written by shoot.html),
   merged in src/lib/dashboard-model.js (recentEntries). */
function renderActivity(scenes) {
  const entries = recentEntries(scenes);
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
      button({ label: 'Pick or start a project', href: 'index.html', variant: 'primary', pill: true, iconAfter: 'arrow_forward', class: 'bd-cta' }),
      button({ label: 'Look around the library first', href: 'library.html' })
    ])
  ]));
  return wrap;
}

/* ============================================================
   RENDER
   ============================================================ */
let revealed = false;
/* Open the closed 'Project overview' when the hash names something inside it. */
function openOverviewFor(hash) {
  const id = String(hash || '').replace(/^#/, '');
  if (!id) return;
  const el = document.getElementById(id);
  const det = el && el.closest('details.db-overview');
  if (det && !det.open) det.open = true;
}
window.addEventListener('hashchange', () => openOverviewFor(location.hash));

function render() {
  const project = Store.currentProject();
  const main = h('main.db-main.k-page', { id: 'main' });
  main.append(pageHeader({
    eyebrow: ['Studio', 'Dashboard'],
    title: 'Dashboard',
    sub: 'Where a film stands across story, screenplay, pre-production, production '
       + 'and post — read from the project you have open.',
    class: 'bd-head'
  }));

  if (!project) {
    main.append(
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
    /* The launcher is the project home and leads; everything the dashboard
       used to open with sits under a closed disclosure. Every node stays in
       the DOM (verify reads innerHTML and data-keys), ids intact. */
    const overview = h('details.db-overview', {}, [
      h('summary.db-overview-sum', { text: 'Project overview' }),
      renderFocus(snap), renderStages(snap),
      h('div.db-body', {}, [col, renderDesk(snap)])
    ]);
    main.append(renderHead(snap), renderLauncher(), renderTitlePage(project), overview);
  }

  /* The path line is applied whether or not the swap happened: a skipped
     swap leaves last time's DOM, whose path fact may have gone stale. */
  const painted = commitMain(app, main, mountShell);
  if (project) { loadPath(); refreshTitleFields(); }
  if (!painted) return;
  /* A link INTO the overview (#readiness, #resume...) has to open it: a
     closed <details> hides its target, so the jump would land on nothing. */
  openOverviewFor(location.hash);
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

/* ---- the Pre-production card says where on the path ---------------
   "Step 3 of 11 · next: Vision & look". journey.js is first paint and
   pure for Node, so it never imports the path model; this page loads
   src/lib/preprod-path.js after the first render and patches the card.
   The card already reads correctly without it (journey.js's own facts),
   so a slow or failed import changes nothing. The line is derived at
   patch time and stored nowhere; render() rebuilds the card on every
   store event, so the patch is re-applied after each one. */
let pathModule = null;      // the loaded module, once
let pathLoading = false;

function patchPathFact() {
  const card = document.getElementById('stage-preprod');
  const facts = card && card.querySelector('.st-facts');
  if (!facts || !pathModule) return;
  const old = facts.querySelector('.st-path-fact');
  if (old) old.remove();
  let line = '';
  try {
    line = pathFactLine(pathModule);
    if (!line) return;
  } catch (e) { return; }
  facts.prepend(h('li.st-path-fact', { text: line }));
}

function loadPath() {
  if (pathModule) { patchPathFact(); return; }
  if (pathLoading) return;
  pathLoading = true;
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 200));
  idle(() => {
    import('../lib/preprod-path.js')
      .then((m) => { pathModule = m; patchPathFact(); })
      .catch((e) => { pathLoading = false; console.warn('[dashboard] path', e); });
  });
}

/* ---- events — delegated, no inline handlers ---------------------- */
/* setCurrentProject notifies 'current:changed', and the subscriber
   below is what re-renders. Calling render() here as well would draw
   the page twice for one click. */

/* The project changed under us — switched here, or renamed on the hub. */
delegate(app, 'click', '[data-action="slate-edit"]', async () => {
  const p = Store.currentProject();
  if (!p) return;
  const v = await askText({ title: 'Project subtitle', body: 'One line under the title, for example the stage you are in. Leave it empty to remove it.',
    value: p.subtitle || '', placeholder: 'Principal photography prep', confirm: 'Save' });
  if (v === null || v === undefined) return;
  setProjectSubtitle(v, p.id);
});
/* The Title page: each keystroke is written at once (a debounced write
   could be dropped by a redraw that a store event causes mid-word), and
   only the key that was typed — writeFields() merges it into the blob. */
const saveTitleField = (e, el) => {
  const ns = el.getAttribute('data-tp-ns');
  const key = el.getAttribute('data-key');
  if (!ns || !key) return;
  const patch = { [key]: el.value };
  /* feature.js syncTitleAcrossCovers(): the two titles are twins, and
     typing one fills the other when the other was empty — and it keeps
     FOLLOWING for the rest of that typing (data-tp-follows). Checking
     "is the twin empty" on every keystroke copied the first letter and
     then stopped: Title "The Kettle", Working title "T". Typing in the
     twin itself ends the following. */
  delete el.dataset.tpFollows;
  const twin = key === 'meta_title' ? 'v1_title' : key === 'v1_title' ? 'meta_title' : null;
  const t = twin && app.querySelector('[data-tp-ns][data-key="' + twin + '"]');
  if (t && t.dataset.tpFollows === key) { t.value = el.value; patch[twin] = el.value; }
  else if (t && el.value) {
    const stored = readFields(ns, [twin])[twin];
    if (t.value === '' && !(typeof stored === 'string' && stored)) { t.value = el.value; patch[twin] = el.value; t.dataset.tpFollows = key; }
  }
  if (!writeFields(ns, patch)) StudioUI.toastError('That was not saved: this browser refused the write.');
};
/* A <select> fires BOTH input and change; inputs take `input`, the
   select takes `change` only, so one pick is one write. */
delegate(app, 'input', 'input[data-tp-ns][data-key], textarea[data-tp-ns][data-key]', saveTitleField);
delegate(app, 'change', 'select[data-tp-ns][data-key]', saveTitleField);
/* On commit (blur), not per keystroke: a rename re-renders the page —
   one task later, once a Tab has landed on the next field, so the
   redraw keeps THAT field (preservingFocus) instead of the one left. */
delegate(app, 'change', 'input[data-tp-ns][data-key="meta_title"]', (e, el) => {
  const p = Store.currentProject();
  const v = el.value.trim();
  if (p && v && v !== p.title) setTimeout(() => Store.updateProject(p.id, { title: v }), 0);
  /* A film always has a name: a blank is refused, the field goes back to it
     and the blank saved by the typing is overwritten, so the page never shows
     a state a reload would undo. */
  else if (p && !v && p.title) {
    el.value = p.title;
    writeFields(el.getAttribute('data-tp-ns'), { meta_title: p.title });
    StudioUI.toast('A film needs a title, so the title page keeps “' + p.title + '”.');
  }
});

/* The fields' values are PROPERTIES, which never reach innerHTML, so
   commitMain's signature cannot see a stored value change and may keep
   the old DOM. After every render, and whenever the blob changes under
   us (another tab, a cloud or Drive pull, coming back to the tab), the
   fields are re-read from the store — all but the one being typed in,
   so a stale value is never shown and then written over a newer one. */
function refreshTitleFields() {
  const els = [...app.querySelectorAll('[data-tp-ns][data-key]')];
  if (!els.length) return;
  const ns = els[0].getAttribute('data-tp-ns');
  const vals = readFields(ns, els.map((el) => el.getAttribute('data-key')));
  const active = document.activeElement;
  for (const el of els) {
    if (el === active) continue;
    const want = tpValue(el.getAttribute('data-key'), vals[el.getAttribute('data-key')], Store.currentProject());
    if (el.value !== want) el.value = want;
  }
}
addEventListener('storage', (e) => {
  const el = app.querySelector('[data-tp-ns]');
  if (el && (!e.key || e.key.indexOf(blobKey(el.getAttribute('data-tp-ns'))) === 0)) refreshTitleFields();
});
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refreshTitleFields(); });
Store.subscribe('cloud:synced', () => refreshTitleFields());
Store.subscribe('cloud:restored', () => refreshTitleFields());

let syncing = false;
delegate(app, 'click', '[data-action="drive-sync"]', async (e, el) => {
  if (syncing) return;
  syncing = true; el.disabled = true;
  try {
    /* push() never rejects: a stale token, a moved remote or a plan
       refusal RESOLVE with ok:false and nothing uploaded. Read it. */
    const r = await drivePush();
    if (r && r.ok) StudioUI.toast('Synced to Google Drive.');
    else {
      const why = {
        conflict: 'Drive has a newer copy, so nothing was uploaded. Open Settings to choose which one to keep.',
        plan: 'Drive backup is not in this plan, so nothing was uploaded.',
        'not-connected': 'Drive is not connected, so nothing was uploaded.'
      }[r && r.reason];
      let detail = '';
      try { detail = getDriveStatus().detail || ''; } catch (e) { /* the status is only wording */ }
      StudioUI.toastError(why || ('Nothing was uploaded. ' + (detail || 'Drive did not answer.')), { duration: 6000 });
    }
  }
  catch (err) { StudioUI.toastError((err && err.message) || 'Drive did not answer.', { duration: 6000 }); }
  finally { syncing = false; render(); }
});

Store.subscribe('current:changed', () => render());
/* A rename from the Title page fires this while Tab is moving to the
   next field: keep that field (and its caret) through the redraw. */
Store.subscribe('project:meta', () => preservingFocus(render));
Store.subscribe('plan:changed', () => render());

render();
