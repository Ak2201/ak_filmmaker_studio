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
import { stageHueClass } from '../lib/journey.js';
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
import { renderLauncher } from '../ui/launcher.js';
import { statStrip, badge, meter, button, buttonGroup, eyebrow as kEyebrow, askText, pageHeader, field } from '../ui/kit/index.js';
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
import { openChangelog, unseen as changelogUnseen, hasEntries as changelogHasEntries } from '../ui/changelog.js';
/* Every number on this page, derived: the snapshot, the readiness order,
   the Continue target (docs/ARCHITECTURE.md). */
import {
  snapshot, relTime, sceneTagged, nextShootNote, crewCastNote,
  sortChecks, readinessDeck, WHY, continueTarget
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
/* A figure for the KPI strip: the kit's stat card (Onest tabular value). */
const stat = (value, unit, label, note) => ({ label, value, unit: value === '\u2014' ? '' : unit, note: note || '' });

/* The strip's second line (sceneTagged, nextShootNote, crewCastNote) is
   derived in src/lib/dashboard-model.js, each left out when there is
   nothing real to say. */

function section(id, eyebrow, title, deck) {
  const sec = h('section.db-sec', { id });
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
    return section('readiness', 'Readiness',
      'Could you shoot tomorrow?',
      (Store.currentProject() ? 'Nothing to check yet. Once this film has scenes' : 'Nothing to check yet. Open a project and give it scenes')
      + ' — written, imported or broken down — and this becomes a list of what would stop a shoot day.');
  }

  const tone = r.blockers ? 'is-bad' : r.gaps ? 'is-warn' : 'is-ok';
  const deck = readinessDeck(r);

  const sec = section('readiness', 'Readiness',
    'Could you shoot tomorrow?', deck);
  const nPass = r.checks.filter((c) => c.passed).length;
  if (r.checks.length) {
    const pct = Math.round((nPass / r.checks.length) * 100);
    /* The heading and its score share one flex row; the eyebrow keeps
       its own line above (it ran into the heading as one word). */
    const h2 = sec.querySelector('.bd-h2');
    const row = h('div.db-sec-row');
    h2.replaceWith(row);
    row.append(h2, badge({ label: pct + '% ready', tone: pct === 100 ? 'ok' : r.blockers ? 'danger' : 'warn', class: 'db-pct' }));
  }

  /* Failures first and blockers above gaps, because the order IS the
     advice. Passed checks are still SHOWN, as evidence the question
     was asked — but inside ONE summary row that opens on demand
     (28 Oct 2026), so the dashboard stays about two screens. */
  const sorted = sortChecks(r.checks);
  const fails = sorted.filter((c) => !c.passed);
  const passes = sorted.filter((c) => c.passed);
  const more = h('details.db-more.rd-more', { 'data-more': 'ready' });
  more.append(h('summary.db-more-sum', {}, [
    h('span', { text: fails.length
      ? fails.length + (fails.length === 1 ? ' thing' : ' things') + ' to fix · Show'
      : 'Every check passes · Show' }),
    h('span.sym', { 'aria-hidden': 'true', text: 'expand_more' })
  ]));
  if (fails.length) {
    const list = h('ul.rd-list');
    fails.forEach((c) => list.append(readinessRow(c)));
    more.append(list);
  }
  if (passes.length) {
    more.append(h('p.rd-pass-h', { text: 'Passing \u00b7 ' + passes.length + ' of ' + r.checks.length }));
    const ul = h('ul.rd-pass');
    passes.forEach((c) => ul.append(h('li.rd-chip', {}, [
      h('span.rd-mark.sym', { 'aria-hidden': 'true', text: 'check' }),
      h('span', { text: c.label + ' — none' })
    ])));
    more.append(ul);
  }
  if (r.checks.length) sec.append(more);

  const dot = sec.querySelector('.bd-eyebrow');
  if (dot) dot.classList.add(tone);
  return sec;
}

function readinessRow(c) {
  const row = h('li.rd-row' + (c.passed ? '.is-pass'
    : c.severity === 'blocker' ? '.is-blocker' : '.is-gap'));

  row.append(c.passed ? h('span.rd-mark.sym', { 'aria-hidden': 'true', text: 'check' }) : h('span.rd-mark', { 'aria-hidden': 'true', text: '\u2022' }));

  const body = h('div.rd-body');
  body.append(h('p.rd-label', {
    text: c.passed ? c.label + ' — none' : c.label + ' — ' + c.count
  }));

  if (!c.passed) {
    /* Named, not counted. "3 scenes have no location" sends somebody
       hunting; naming them is the difference between a report and a
       task list. Capped because a brand-new import can fail a check
       on every scene it has. */
    const shown = c.items.slice(0, 5).join(' · ');
    const more  = c.items.length > 5 ? ' … and ' + (c.items.length - 5) + ' more' : '';
    body.append(h('p.rd-items', { text: shown + more }));
    body.append(h('p.rd-hint', { text: c.hint }));
    if (c.where) body.append(h('a.k-btn.k-btn--ghost.k-btn--sm.rd-go', { href: c.where, text: 'Fix it' }));
  }

  row.append(body);
  return row;
}

/* ============================================================
   ONE SCREEN (owner, 28 Oct 2026)
   ------------------------------------------------------------
   The dashboard used to open with the project block, then the
   launcher, then the title page, then a closed "Project overview"
   holding a focus row, the five stage cards, the production chain,
   the readiness list, recent activity and a desk of three tiles. Most
   of it said one thing twice: the chain's twelve numbers are the
   launcher's state lines, the stage cards are the launcher's rows, the
   desk's backup tile is the rail's Backup, its plan tile the account
   menu's Purchase, its week the Plan's calendar.

   What is left is one answer per question, top to bottom:
     who      the film's title, format and stage, and five figures
     what now ONE Continue card (with the suggestion inside it)
     where    the launcher, as a card grid
     ready?   the readiness list, which journey.js links to
     cover    the Title page, the one thing typed here

   THE IDS THE OLD PIECES CARRIED STAY RESOLVABLE, on the piece that
   answers the same question now — a nav target must not depend on a
   redesign (CLAUDE.md): #resume and #suggested on the Continue card,
   #focus on the hero, #stages on the launcher's section and #journey
   on its grid, #readiness on the readiness card, #title-page, #slate.
   ============================================================ */

function renderContinue(snap) {
  /* THIS PROJECT ONLY (owner, 11 Oct 2026): it used to suggest the most
     recently edited OTHER film. Switching films is the home page's job. */
  const card = h('section.db-continue', { 'aria-labelledby': 'dbContinueH' });
  const t = continueTarget(snap);
  card.append(
    kEyebrow('Continue'),
    h('h2.db-continue-h', { id: 'dbContinueH', text: t.what }),
    h('p.db-continue-line', { id: 'resume', text: t.ts ? 'Last edited ' + relTime(t.ts) : 'Pick up where you left off.' })
  );
  /* How far the stage you are in has got, from the same figures the
     launcher prints. Left out when there is nothing to count. */
  const cur = snap.journey && snap.journey.stages.find((x) => x.id === snap.journey.current);
  if (cur && cur.tools.total) {
    card.append(meter({ label: cur.label + ' · ' + cur.tools.done + ' of ' + cur.tools.total + ' done', value: cur.tools.pct, max: 100, class: 'db-continue-meter' }));
  }
  card.append(button({ label: 'Continue', variant: 'primary', size: 'lg', iconAfter: 'arrow_forward', href: t.href, class: 'db-big', attrs: { 'aria-label': 'Continue: ' + t.what } }));

  /* The suggestion, one line under the one action: it is advice, never
     a second primary button (journey.js: "Suggested next" is never forced). */
  const sug = snap.suggest;
  const sugState = sug && snap.states.find((s) => s.id === sug.id);
  /* Left out when it names the stage Continue is already in: the same
     advice twice. #suggested then sits on the card, so it resolves. */
  const same = !sugState || (snap.journey && sug.id === snap.journey.current);
  if (same) { card.id = 'suggested'; return card; }
  const box = h('p.db-next', { id: 'suggested' });
  if (sugState && sugState.href) {
    box.append(h('span.db-next-k', { text: 'Suggested next' }), ' ',
      h('a.db-link.' + stageHueClass(sugState.hue), { href: sugState.href, title: WHY[sug.why] || WHY.continue }, [
        h('span.db-dot', { 'aria-hidden': 'true' }), txt(sugState.label)
      ]));
  } else {
    box.append(txt('Every stage has work in it.'));
  }
  card.append(box);
  return card;
}

/* ---- header ----------------------------------------------------- */
const txt = (t) => document.createTextNode(t);

function renderHead(snap) {
  /* The project's own block, under the page's header (ONE PAGE FRAME:
     the h1 is the page's name on every page; the film's title is the
     first thing under it, as an h2). Format and stage as two quiet
     badges; the subtitle under the title. */
  const p = snap.project;
  const head = h('header.db-head', { 'aria-label': 'This project' });
  const j = snap.journey;
  head.append(
    h('div.db-chips', {}, [
      badge({ label: FORMAT_LABEL[p.format] || 'Project', tone: 'info' }),
      j ? badge({ label: 'Stage: ' + j.currentLabel }) : null
    ]),
    h('p.db-slate', { id: 'slate' }, p.subtitle ? [
      h('span.db-slate-v', { text: p.subtitle }), txt(' · '),
      h('button.db-link.db-slate-edit', { type: 'button', 'data-action': 'slate-edit', text: 'change' })
    ] : [
      h('button.db-link.db-slate-edit', { type: 'button', 'data-action': 'slate-edit', text: 'Add a subtitle' })
    ])
  );
  return head;
}

/* The figures: five, under the hero. The kit's stat card; each second
   line is derived in dashboard-model.js and left out when there is
   nothing real to say. */
function renderStats(snap) {
  if (snap.isEmpty) return null;
  const sc = snap.scenes.length;
  return statStrip([
    stat(String(sc), sc === 1 ? 'scene' : 'scenes', 'Scenes', sc ? sceneTagged(snap) + ' broken down' : ''),
    stat(formatEighths(snap.eighths), snap.eighths === 8 ? 'page' : 'pages', 'Page count',
      snap.scriptPages ? formatPages(snap.scriptPages) + ' script pp' : ''),
    stat(snap.days.length ? String(snap.days.length) : '—', snap.days.length === 1 ? 'day' : 'days', 'Shoot days',
      nextShootNote(snap)),
    stat(snap.contacts.length ? String(snap.contacts.length) : '—', 'people', 'Crew & cast', crewCastNote(snap)),
    // The live estimator's sum: nothing is locked, and contingency is
    // not in it (the budget page's Total budget adds it). It once
    // said 'Locked budget' while budget.html said 'Nothing locked yet'.
    stat(snap.budget.lines ? snap.budget.short : '—', '', 'Budget estimate',
      snap.budget.lines ? snap.budget.lines + ' line item' + (snap.budget.lines === 1 ? '' : 's') + ', before contingency' : '')
  ], { class: 'db-stats', label: 'This film in numbers' });
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
  const sec = section('title-page', null, 'Title page',
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


/* ---- empty states -------------------------------------------------
   Two different emptinesses, and conflating them was the old first-run
   bug: "no project at all" needs the hub, "a project with nothing in
   it" needs a first step. A wall of zeros answers neither. */
function renderNoProject() {
  const wrap = h('section.db-sec', { id: 'stages' });
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

/* ---- the member row: What's new, and the referral share ----------
   One slim row under the page's own cards. What's new is there only then
   (src/ui/changelog.js; it shows only while the list holds an entry;
   "New" is a READ of the prefs blob, written only when the drawer opens). The referral share appears only for a
   signed-in member whose code exists and is on (my_referral(), §22):
   signed out, before a first purchase, or on a database without §22 it
   is simply absent. growth.js and the panel are fetched only once
   somebody is signed in, so the signed-out page (verify) loads neither.
   The answer is held in memory for this page, keyed by the account. */
/* The link is growth-panels' referralLink(): /purchase?ref=, the page
   that READS ?ref= into its "Have a code?" box. /start?ref= (the "Made
   with" line's) carries the code nowhere until the attribution lane
   holds it for the tab, so a friend would reach checkout empty-handed. */
const ref = { uid: null, asked: false, data: null, panel: null, link: null };
function sessionUid() {
  try { const c = window.StudioCloud; const s = c && c.getSession && c.getSession(); return (s && s.user && s.user.id) || null; } catch (e) { return null; }
}
function wantReferral() {
  const uid = sessionUid();
  if (uid !== ref.uid) { ref.uid = uid; ref.asked = false; ref.data = null; }
  if (!uid || ref.asked) return;
  ref.asked = true;
  Promise.all([import('../lib/growth.js'), import('../ui/growth-panels.js')])
    .then(([G, P]) => G.myReferral().then((d) => { if (ref.uid !== uid) return; ref.data = d || null; ref.panel = P.referralShare; ref.link = P.referralLink; render(); }))
    .catch(() => { /* no §22, offline: no panel */ });
}
function renderMemberRow() {
  wantReferral();
  const row = h('div.db-member');
  /* Nothing to show while the list is empty (owner, 1 Nov 2026). */
  if (changelogHasEntries()) {
    const isNew = changelogUnseen();
    row.append(h('div.db-member-news', {}, [
      button({ label: 'What’s new', icon: 'auto_awesome', size: 'sm', action: 'db-whatsnew',
        attrs: { 'aria-label': isNew ? 'What’s new (new changes since you last looked)' : 'What’s new' } }),
      isNew ? badge({ label: 'New', tone: 'info' }) : null
    ].filter(Boolean)));
  }
  const d = ref.uid && ref.data;
  const share = d && ref.panel ? ref.panel(d, ref.link(d.code)) : null;
  if (share) row.append(share);
  return row.childNodes.length ? row : null;
}
delegate(document, 'click', '[data-action="db-whatsnew"]', (e, el) => {
  /* Opening marks it seen: take the "New" off in place. A redraw here
     would replace the button the drawer hands focus back to. */
  const tag = el.parentNode && el.parentNode.querySelector('.k-badge');
  if (tag) tag.remove();
  el.setAttribute('aria-label', 'What’s new');
  openChangelog(el);
});


/* ============================================================
   RENDER
   ============================================================ */


const OPEN_MORE = new Set();
function render() {
  const project = Store.currentProject();
  const main = h('main.db-main.k-page', { id: 'main' });
  main.append(pageHeader({
    /* ONE TITLE (28 Oct 2026): with a film open the h1 IS the film's
       title and "Dashboard" lives in the crumb; two near-equal headings
       ("Dashboard" over "Dragon") competed. */
    eyebrow: ['Studio', 'Dashboard'],
    title: project ? (project.title || 'Untitled') : 'Dashboard',
    sub: project ? null : 'Where this film stands, and where to go next.',
    class: 'bd-head'
  }));

  if (!project) {
    main.append(
      ...[renderNoProject(), renderMemberRow()].filter(Boolean),
      /* The id, even here: a link into #readiness followed with no
         project open must land on the section that says why it is
         empty, not on nothing. */
      renderReadiness()
    );
  } else {
    const snap = snapshot(project);
    /* who · what now, side by side on a desk; the figures under both */
    const hero = h('div.db-hero', { id: 'focus' }, [renderHead(snap), renderContinue(snap)]);
    /* The launcher IS the map of the stages, so it carries the ids the
       stage cards did (#stages on the section, #journey on its grid). */
    /* Every tool, behind one closed disclosure (28 Oct 2026): the rail
       already lists them, so the dashboard no longer repeats 26 tiles. */
    const tools = h('details.db-tools.db-more', { id: 'stages', 'data-more': 'tools' }, [
      h('summary.db-more-sum', {}, [h('span', { text: 'All tools for this film' }), h('span.sym', { 'aria-hidden': 'true', text: 'expand_more' })]),
      renderLauncher()
    ]);
    const grid = tools.querySelector('.lx-grid');
    if (grid) grid.id = 'journey';
    /* Readiness is OUTSIDE any isEmpty test on purpose: `isEmpty` asks
       whether the BLUEPRINT has been filled in, and readiness asks about
       the SCENES — a producer who imported a script and answered no step
       is exactly who it is for. Without scenes it renders the section's
       empty state, so #readiness always resolves. */
    /* The title page, under one closed "Project details" disclosure. */
    const details = h('details.db-more.db-details', { 'data-more': 'details' }, [
      h('summary.db-more-sum', {}, [h('span', { text: 'Project details and title page' }), h('span.sym', { 'aria-hidden': 'true', text: 'expand_more' })]),
      renderTitlePage(project)
    ]);
    main.append(hero, ...[renderStats(snap)].filter(Boolean), renderReadiness(), tools, details, ...[renderMemberRow()].filter(Boolean));
  }

  /* A disclosure the reader opened stays open across a re-render (in
     memory only; nothing is stored). */
  main.querySelectorAll('details[data-more]').forEach((d) => {
    if (OPEN_MORE.has(d.dataset.more)) d.open = true;
    d.addEventListener('toggle', () => { if (d.open) OPEN_MORE.add(d.dataset.more); else OPEN_MORE.delete(d.dataset.more); });
  });
  const painted = commitMain(app, main, mountShell);
  if (project) refreshTitleFields();
  if (!painted) return;
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


Store.subscribe('current:changed', () => render());
/* A rename from the Title page fires this while Tab is moving to the
   next field: keep that field (and its caret) through the redraw. */
Store.subscribe('project:meta', () => preservingFocus(render));
Store.subscribe('plan:changed', () => render());
Store.subscribe('gate:changed', () => render());   // signed in or out: the referral row follows the account

render();
