/* ============================================================
   STRIPBOARD + DAY OUT OF DAYS
   ------------------------------------------------------------
   Two more views of the ONE scene model (src/lib/scenes.js). Nothing
   here stores a second copy of a scene, a location or a cast name:
   the strips are scenes, the cast rows are Scenes.elementIndex()
   filtered to `cast`, and the only thing this page ever writes is a
   single integer per scene — `shootDay` — through Scenes.updateScene.

   TWO KINDS OF ORDER, AND WHY ONLY ONE OF THEM IS SAVED.

   A physical stripboard is a rack of strips you pull out and re-slot:
   you gather every strip in one location so you shoot it in one go.
   That is a VIEW. The script order is the scene model's order, and it
   is what the breakdown, the sides and the page count all read. If
   sorting the board rewrote the model, a producer who looked at the
   board grouped by location would silently renumber their script.

   So grouping lives in memory (`view.group`) and is thrown away on
   reload — deliberately not persisted, because a new localStorage key
   has to be registered in four places (see the storage contract at the
   top of scenes.js) and a sort order is not worth a storage contract.
   The SCHEDULE — which scenes are shot on which day — is real
   production data, so that goes on the scene.

   THE ORDER WITHIN A DAY IS THE SCHEDULE TOO, and it is the second
   thing this page writes (UX audit L31). In the Shoot day grouping a
   strip can be dragged — by its handle, with pointer events, so a
   finger works as well as a mouse — up and down its day or onto
   another day, and the place it lands is kept: `order` inside
   fms_locations_v1, through Locations.placeScene(), which also writes
   the day onto the scene through the same updateScene() the picker
   has always used. No new key. A day with no list renders in script
   order, exactly as before. The shoot day, the Plan calendar and the
   call sheet's schedule line all read it back through calendarDays().

   Drag-only is a WCAG failure, so every move has a second route: the
   handle is a menu (up, down, top, bottom), Alt+↑/↓ moves the focused
   strip within its day, and the shoot-day picker is "move to day".
   Every move is announced in a live region and offers UNDO in a toast.

   COLOUR. The paper board codes a strip by time of day, and this one
   does too, from the kit's time-of-day tokens (.hue-day / -night /
   -dusk / -dawn → --strip-*). INT vs EXT is carried by a tag instead —
   filled for exterior, outlined for interior — one dimension per
   channel. Green and amber are status in this palette, and the board
   only uses them for status: the over-target badge, the shot mark.

   THE KIT (14 Oct 2026). Header, stat strip, controls panel,
   segmented group-by, buttons, badges, cast chips, the implied
   company-move banner, the DOOD codes and the grid's table classes
   are src/ui/kit components; stripboard.css is layout only. The
   "Lock production draft" action at the top is the screenplay's own
   scene-number lock — see the section above the events.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/stripboard.css';
import '../styles/print.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import { isDisabledEverywhere } from '../lib/plan-gate.js';
import PDF from '../lib/pdf.js';
import { paperDate } from '../lib/paper-date.js';
import { brandPrint } from '../ui/footer.js';   // CORE: the "Made with" line on a plain print
import Scenes, { ELEMENT_CATEGORIES, formatEighths, totalEighths } from '../lib/scenes.js';
import Locations from '../lib/locations.js';
import * as Songs from '../lib/songs.js';
import DPR from '../lib/dpr.js';
import Contacts from '../lib/contacts.js';
import { sheetsForDay } from '../lib/shootday.js';
import Board from '../lib/board-stats.js';
import {
  CAST, GROUPINGS, shootDayOf, castOf, locationOf, shootDays, groupScenes as groupBy, localDate as localDateIn, dayMonth, todayISO,
  daysNote as daysNoteFor, runtimeNote, screenTimeByDay, uncoveredMoves, nextUncoveredMove,
  doodRows as doodRowsFor, LONG, describeMove as moveSentence, scheduleByLocation,
  sceneHeadings, latestDraft, lockPreset, boardSummary, boardCsv, doodCsv
} from '../lib/stripboard-model.js';
import {
  pageHeader, statStrip, statCard, meter, button, badge, chip, todBadge, todKey, doodCode,
  segmented, panel, stripBanner, emptyState, eyebrow, sym, ask, askDanger, tell
} from '../ui/kit/index.js';

const app = document.getElementById('app');
const castCat = ELEMENT_CATEGORIES.find((c) => c.id === CAST) || { id: CAST, label: 'Cast', hue: 'feature' };

/* The board's dates follow the FILM's style (an Indian film reads
   "Mon, 27 Oct 2025", a US one "Mon, Oct 27, 2025"): the board is
   paperwork and prints. Derived on every call, stored nowhere. */
const filmPrefs = () => PDF.filmPrefs();
const localDate = (iso) => localDateIn(iso, filmPrefs());

/* View state. Not persisted — see the header. */
const view = { group: 'script', matrix: false };

/* The groupings, the readers (shootDayOf, locationOf, shootDays) and
   every derivation below live in src/lib/stripboard-model.js. */

/* ---- header --------------------------------------------------
   The kit's page header. `.bd-head` stays on it: the module column,
   and pdf.css hides it from both exports. Four figures, every one
   counted from the scene model on render; a figure with nothing behind
   it prints a dash rather than a zero that reads as a fact. */
function renderHeader(scenes, rows) {
  const days = shootDays(scenes);
  const unscheduled = scenes.filter((s) => !shootDayOf(s)).length;
  const placed = scenes.length - unscheduled;
  const eighths = totalEighths(scenes);
  /* The parity pass's derived notes (14 Oct 2026): the average a day,
     the calendar the dated days span, who works today. Each is counted
     from the model on render (src/lib/board-stats.js) and drops out
     when there is nothing behind it. */
  const pace = Board.pace(scenes);
  const cal = scenes.length ? Locations.calendarDays(scenes) : [];
  const span = Board.calendarSpan(cal);
  const today = Board.dayOnDate(cal, todayISO());
  const head = pageHeader({
    class: 'bd-head sb-head',
    eyebrow: ['Stripboard', 'The schedule'],
    title: 'Stripboard',
    sub: 'One strip per scene, straight from the breakdown. Group them the way '
       + 'you will shoot them — everything in one location together, every night '
       + 'exterior together — then hand each group a shoot day. The day out of '
       + 'days below builds itself from that.',
    /* The shoot calendar lives on the Plan (owner, 14 Oct 2026): this
       page links to it rather than drawing a second, read-only copy. */
    actions: [
      button({ label: 'Shoot calendar & locations', iconAfter: 'arrow_forward', variant: 'secondary', size: 'sm', href: 'plan.html#calendar', class: 'sb-cal-plan' }),
      h('div.sb-lock-host', {}, [lockButton(!scenes.length)])
    ]
  });
  const strips = statCard({
    label: 'Strips', value: scenes.length ? String(scenes.length) : '—',
    unit: scenes.length ? (scenes.length === 1 ? 'strip' : 'strips') : '',
    note: 'one per scene'
  });
  if (scenes.length) {
    strips.append(meter({
      label: 'Scheduled', value: placed, max: scenes.length, show: 'ratio',
      tone: placed === scenes.length ? 'ok' : null
    }));
  }
  const daysNote = daysNoteFor(days.length, span);
  const cards = [
    strips,
    statCard({
      label: 'Script pages', value: scenes.length ? formatEighths(eighths) : '—',
      unit: scenes.length ? (eighths === 8 ? 'page' : 'pages') : '',
      note: pace ? `avg ${formatEighths(pace.avg)} pp / shoot day` : (scenes.length ? 'no shoot days yet' : ''),
      class: 'sb-kpi-pages'
    }),
    statCard({
      label: 'Shoot days', value: days.length ? String(days.length) : '—',
      unit: days.length ? (days.length === 1 ? 'day' : 'days') : '',
      note: daysNote,
      class: 'sb-kpi-days'
    }),
    /* "0 strips · all placed" on a board with no scenes claimed a
       finished schedule that does not exist. No scenes: a dash, and
       where the strips come from. */
    statCard({
      label: 'Unscheduled', value: scenes.length ? String(unscheduled) : '—',
      unit: scenes.length ? (unscheduled === 1 ? 'strip' : 'strips') : '',
      note: !scenes.length ? 'no scenes yet' : unscheduled ? 'still to place' : 'all placed',
      noteTone: scenes.length ? (unscheduled ? 'warn' : 'ok') : null,
      class: scenes.length ? '' : 'is-empty'
    })
  ];
  if (rows && rows.length) {
    const working = today ? today.cast.length : 0;
    cards.push(statCard({
      label: 'Cast on DOOD', value: String(rows.length),
      unit: rows.length === 1 ? 'performer' : 'performers',
      note: today ? `${working} working today · Day ${today.day}` : 'from the cast tags',
      noteTone: today && working ? 'ok' : null,
      class: 'sb-kpi-cast'
    }));
  }
  const strip = statStrip(cards, { class: 'sb-kpis', label: 'The board in figures' });
  head.append(strip);
  if (scenes.length) fillRuntime(strip);
  return head;
}

/* Est. runtime — the script's screen time plus the songs' lengths,
   the same estimate Reports draws (screenplay-analysis.js). Appended
   only when the script can be measured: a board with no screenplay
   has no runtime to show, and a zero would read as a fact. The target
   is Reports' target runtime, the one shared field (owner, 14 Oct
   2026), with the Edit Log's own older value as the fallback. All
   dynamic imports, so none of it is in the first paint. */
function fillRuntime(strip) {
  Promise.all([
    import('../lib/screenplay-analysis.js'), import('../lib/script.js'),
    import('../lib/songs.js'), import('../lib/target-runtime.js')
  ]).then(([A, S, Sg, T]) => {
    if (!strip.isConnected) return;
    const scenes = Scenes.listScenes();
    const st = A.default.screenTime(scenes, S.loadScript().elements);
    if (!st || !st.fromScript) return;
    const songs = Sg.listSongs().map((x) => ({ id: x.id, seconds: Sg.durationSeconds(x) }));
    // the ONE target: the helper the screenplay and the Edit Log read
    const target = T.targetRuntime().minutes;
    const est = A.default.runtimeEstimate(st, songs, { targetSeconds: target * 60 });
    if (!est.total) return;
    const mins = Math.max(1, A.default.runtimeMinutes(est.total));
    const { note, tone } = runtimeNote(mins, target);
    strip.append(statCard({
      label: 'Est. runtime', value: String(mins), unit: 'min', note, noteTone: tone,
      class: 'sb-kpi-runtime',
      attrs: { title: 'Screen time read off the screenplay, plus the songs’ recorded lengths. An estimate; the target is set in Reports.' }
    }));
  }).catch((e) => console.warn('[stripboard] runtime', e));
}

/* ---- the teaching empty state -------------------------------
   Same shape as the breakdown's: an empty module explains what it is
   for rather than showing a blank rack. It cannot offer "add a strip",
   because a strip is not a thing you add here — it is a scene. */
function renderEmpty() {
  return h('div.bd-empty.sb-empty', {}, [
    emptyState({
      icon: 'timeline',
      title: 'The board needs scenes first',
      body: 'A stripboard is not a second document — it is the scene list stood on '
          + 'its side. Every strip here is one scene from the breakdown, so there is '
          + 'nothing to type on this page that you have not already typed once.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Break the script down', 'List the scenes with INT/EXT, time, location and length. That is the breakdown page.'),
      how('2', 'Tag the cast', 'Who is in each scene. The day out of days is built entirely from those tags.'),
      how('3', 'Come back and schedule', 'Group the strips by location, hand each group a day, and the schedule is done.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why it works this way' }),
      h('span', {
        text: ' A scene that moves on the board must not move in the script. '
            + 'Grouping here is a way of looking; the only thing the board writes '
            + 'back to a scene is the day you shoot it.'
      })
    ]),
    h('div.sb-empty-cta', {}, [
      button({ label: 'Go to the breakdown', iconAfter: 'arrow_forward', variant: 'primary', href: 'breakdown.html#scenes', class: 'bd-cta' })
    ])
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* Songs, indexed by id, read once per grouping pass rather than once
   per scene — groupScenes runs over every strip on the board. */
let _songCache = null;
const songById = () => (_songCache || (_songCache = Object.fromEntries(
  Songs.listSongs().map((sg) => [sg.id, sg])
)));

/* ---- grouping — a view, never a write ------------------------ */
const groupScenes = (scenes, mode) => groupBy(scenes, mode, { songsById: mode === 'song' ? songById() : {} });

/* ---- one strip -----------------------------------------------
   The kit's strip language: a card with the time-of-day hue as its
   3px left rule and a faint wash, the hue class (.hue-day / -night /
   -dusk / -dawn) set on the strip so every badge inside reads the same
   --hue. CONTINUOUS (or anything that is not a time of day) has no
   hue and keeps the neutral rule — the word still says what it is. */
function renderStrip(scene, maxDay, movable) {
  const tod = todKey(scene.dayNight);
  const strip = h('article.sb-strip' + (tod ? '.hue-' + tod : '.is-neutral') + (movable ? '.has-grip' : ''), { 'data-scene': scene.id });

  if (movable) strip.append(moveHandle(scene));
  const ie = String(scene.intExt || '').toUpperCase();
  const slug = h('span.sb-slug', {}, [h('span.sb-loc', { text: locationOf(scene) || 'Location not set' })]);
  if (scene.synopsis) slug.append(h('span.sb-synopsis', { text: scene.synopsis, title: scene.synopsis }));
  strip.append(
    h('span.sb-no', { text: scene.number || '—' }),
    h('span.sb-ie.k-badge.k-badge--tag' + (ie === 'INT' ? '' : '.is-ext'), { text: scene.intExt }),
    slug,
    todTag(scene.dayNight),
    h('span.sb-pages', {
      text: formatEighths(scene.eighths) + ' pp',
      title: `${scene.eighths} eighths of a page`
    }),
    dayPicker(scene, maxDay)
  );

  const cast = castOf(scene);
  const row = h('div.sb-cast');
  /* What the floor said, read from shoot.html's mark — the board is
     the plan, and a plan that cannot see which strips are already in
     the can gets rescheduled around scenes that are done (UX audit
     L15). Read only; the mark is written on the shoot day. */
  const st = scene.shotState || '';
  if (st) {
    const tone = st === 'shot' ? 'ok' : st === 'part' ? 'warn' : null;
    /* A link only while Shoot Day can be opened; switched off, the mark
       is still a fact about the strip, so it stays, as plain text. */
    const toShoot = !isDisabledEverywhere('shoot-day');
    row.append(h((toShoot ? 'a' : 'span') + '.sb-shot.is-' + st + '.k-badge' + (tone ? '.k-badge--' + tone : ''), {
      href: toShoot ? 'shoot.html' : null, title: toShoot ? 'Marked on the shoot day — change it there' : 'Marked on the shoot day',
      text: st === 'part' ? 'Part shot' : Scenes.shotLabel(st)
    }));
  }
  if (!cast.length) {
    row.append(h('span.sb-cast-none', { text: 'No cast tagged — this scene is invisible to the day out of days.' }));
  } else {
    row.append(h('span.sb-cast-lab', { text: castCat.label }));
    cast.forEach((name) => row.append(chip({ label: name, category: CAST, class: 'sb-cast-chip' })));
  }
  /* Filled by fillHours() when the script measures this scene. */
  row.append(h('span.sb-est', { 'data-hours-scene': scene.id }));
  strip.append(row);
  return strip;
}

/* The time of day as a kit badge, with the class print and the
   legend read. Not a hue for CONTINUOUS: todBadge() makes that a
   neutral tag. */
function todTag(tod) {
  const el = todBadge(tod, { label: String(tod || '').toUpperCase() || '—', icon: false });
  el.classList.add('sb-tod');
  return el;
}

/* The handle. One control, two routes: drag it (pointer events, see
   the drag section below) or press it for a menu that moves the
   strip without a pointer. The menu is the action bar's — arrow keys,
   Home/End, focus returned to the button — because `role="menu"` is
   a promise and actionbar.js is where it is kept. */
function moveHandle(scene) {
  const n = scene.number || '';
  const scheduled = shootDayOf(scene) > 0;
  const items = scheduled ? [
    { label: 'Move up',        action: 'sb-move', hint: 'Alt+↑' },
    { label: 'Move down',      action: 'sb-move', hint: 'Alt+↓' },
    '---',
    { label: 'Move to top of day',    action: 'sb-move' },
    { label: 'Move to bottom of day', action: 'sb-move' }
  ] : [{ label: 'Pick a shoot day to place this strip', action: 'sb-move-focus' }];
  const menu = actionMenu('⠿', items, {
    compact: true,
    ariaLabel: scheduled
      ? `Move scene ${n}: drag it, or open for up, down, top and bottom`
      : `Scene ${n} is not scheduled: drag it onto a day, or pick one`
  });
  menu.classList.add('sb-grip');
  menu.querySelector('.tb-menu-btn').classList.add('sb-grip-btn');
  const dirs = ['up', 'down', 'top', 'bottom'];
  menu.querySelectorAll('[data-action="sb-move"]').forEach((b, i) => b.setAttribute('data-dir', dirs[i]));
  return menu;
}

/** Scheduling control. Writes the day — through placeScene(), so the
    strip lands at the end of the day it moves to and leaves the list
    of the day it came from. A kit select (.k-control.k-select). */
function dayPicker(scene, maxDay) {
  const current = shootDayOf(scene);
  const wrap = h('label.sb-day');
  // "Shoot day", not "Day": the strip already carries a DAY/NIGHT, and
  // two labels reading DAY on one strip meant two different things.
  wrap.append(h('span.sb-day-lab.visually-hidden', { text: 'Shoot day' }));
  const sel = h('select.sb-day-sel.k-input', {
    'data-strip-field': 'shootDay',
    'aria-label': `Shoot day for scene ${scene.number || ''}`.trim()
  });
  const none = h('option', { value: '0', text: '—' });
  if (!current) none.selected = true;
  sel.append(none);
  // Existing days, plus exactly one beyond the last: enough to start a
  // new day without a separate "add a day" control that would need its
  // own empty state.
  for (let d = 1; d <= Math.max(maxDay + 1, current + 1); d += 1) {
    const opt = h('option', { value: String(d), text: d > maxDay ? `Day ${d} · new` : `Day ${d}` });
    if (d === current) opt.selected = true;
    sel.append(opt);
  }
  wrap.append(h('span.k-control.k-select.sb-day-ctl', {}, [sel]));
  return wrap;
}

/* ---- the board ----------------------------------------------- */

/* The controls: one kit panel. Grouping is a view, so it is a
   segmented toggle, not a form; the scheduling actions and the export
   sit at its right; the colour key and the page target under it. */
function renderControls() {
  const seg = segmented({
    label: 'Group strips by', name: 'sb-group', value: view.group, action: 'sb-group',
    /* "Song" only while the Songs module exists for somebody. */
    options: GROUPINGS.filter((g) => g.id !== 'song' || !isDisabledEverywhere('songs'))
      .map((g) => ({ value: g.id, label: g.label }))
  });
  seg.querySelectorAll('.k-seg-btn').forEach((b) => {
    b.dataset.group = b.dataset.value;
    b.classList.add('sb-seg-btn');
  });
  /* The board and the day out of days are two documents, and both
     are wider than they are tall — so both go out landscape. The
     export sits in a named menu beside the two scheduling actions
     rather than as two more buttons on the row. */
  const exportMenu = actionMenu('Export', [
    { label: 'Stripboard as PDF',      action: 'pdf-board', hint: 'landscape' },
    { label: 'Day Out of Days as PDF', action: 'pdf-dood',  hint: 'landscape' },
    '---',
    { label: 'Stripboard as CSV',      action: 'csv-board', hint: 'shoot order' },
    { label: 'Day Out of Days as CSV', action: 'csv-dood',  hint: 'cast × days' },
    '---',
    { label: 'Print this page',        action: 'sb-print' }
  ], { align: 'right' });
  exportMenu.querySelector('.tb-menu-btn').classList.add('k-btn', 'k-btn--secondary');
  const controls = h('div.sb-controls', {}, [
    h('div.sb-seg', {}, [h('span.sb-seg-lab', { text: 'Group by', 'aria-hidden': 'true' }), seg]),
    h('div.sb-acts.pdf-menu-host', {}, [
      button({ label: 'Schedule by location', icon: 'auto_awesome', action: 'sb-auto', class: 'sb-btn' }),
      exportMenu,
      /* The destructive one stands apart from the action it undoes (it
         sat touching "Schedule by location"). It stays pressable when no
         strip has a day: a disabled button cannot take focus or show its
         reason, so the press says why instead. It still asks before
         clearing. */
      button({
        label: 'Clear days', variant: 'danger', action: 'sb-clear', class: 'sb-btn is-danger sb-clear',
        title: 'Take the shoot day off every strip; the scenes themselves are untouched'
      })
    ])
  ]);
  return panel({ class: 'sb-controls-panel', body: [controls, legend()] });
}

function renderBoard(scenes) {
  const wrap = h('section.sb-board', { id: 'stripboard' });
  wrap.append(
    h('h2.bd-h2', { text: 'Stripboard' }),
    h('p.bd-sub', {
      text: 'Grouping is how you are looking at the board, not how the script reads — '
          + 'the scene order in the breakdown never moves.'
    }),
    renderControls()
  );

  const byDay = view.group === 'day';
  if (byDay) {
    wrap.append(h('p.sb-hint', {
      text: 'Drag a strip by its handle to change its place in the day or drop it on '
          + 'another day — the order you set here is the order the shoot day and the '
          + 'call sheet read. Without a mouse: Alt+↑ and Alt+↓ move the strip you are '
          + 'on, the handle opens a Move menu, and the shoot-day picker moves it to '
          + 'another day.'
    }));
  }

  const maxDay = shootDays(scenes).reduce((a, b) => Math.max(a, b), 0);
  const target = DPR.pageTarget();
  const banners = byDay ? DPR.allBanners() : {};
  const calDays = new Map(byDay ? Locations.calendarDays(scenes).map((d) => [d.day, d]) : []);
  const sheets = byDay ? Contacts.listCallSheets() : [];
  let hasUnscheduled = false;
  for (const group of groupScenes(scenes, view.group)) {
    const eighths = totalEighths(group.scenes);
    const section = h('div.sb-group');
    const isDay = byDay && group.key !== Infinity;
    const title = h('div.sb-group-title', {}, [h('h3.sb-group-name', { text: group.label })]);
    const facts = h('div.sb-group-facts', {}, [
      h('span.sb-group-meta.k-badge', {
        text: `${group.scenes.length} ${group.scenes.length === 1 ? 'scene' : 'scenes'} · ${formatEighths(eighths)} ${eighths === 8 ? 'page' : 'pages'}`
      })
    ]);
    const head = h('div.sb-group-head', {}, [title, facts]);
    if (isDay) {
      const cal = calDays.get(group.key);
      const dated = cal && localDate(cal.date);
      if (dated) title.append(h('span.sb-group-date', { text: dated }));
      if (group.scenes.length && group.scenes.every((sc) => sc.dayNight === 'NIGHT')) {
        const nb = todBadge('NIGHT', { label: 'Night shoot' });
        nb.classList.add('sb-night-badge');
        facts.append(nb);
      }
      /* The day's call, where one is written down: the DPR's crew call,
         else the day's call sheet. Nothing is shown when neither has one. */
      const call = dayCallFor(group.key, scenes, sheets);
      if (call) {
        facts.append(badge({
          label: 'Call ' + call, icon: 'schedule', tag: true, class: 'sb-call',
          title: 'Crew call for Day ' + group.key + ', from the production report or the call sheet'
        }));
      }
      facts.append(...dayLoadBits(group.key, eighths, target));
      const tail = h('div.sb-group-tail');
      if (cal && cal.locations && cal.locations.length) {
        tail.append(h('span.sb-group-locs', { title: 'Locations: ' + cal.locations.join(', ') }, [
          sym('place'), h('span', { text: 'Locations: ' + cal.locations.join(', ') })
        ]));
      }
      tail.append(bannerMenu(group.key));
      head.append(tail);
    }
    section.append(head);
    /* In the day grouping every rack names its day, so a drop knows
       where it landed; "Not scheduled yet" is day 0 and a drop there
       takes the strip off the schedule. */
    const rack = h('div.sb-rack', byDay ? { 'data-day': String(group.key === Infinity ? 0 : group.key) } : {});
    if (byDay && group.key === Infinity) hasUnscheduled = true;
    if (isDay) {
      const dayBanners = banners[String(group.key)] || [];
      /* The company moves the day IMPLIES — a change of location
         between two consecutive strips — drawn as the kit's move
         banner wherever the AD has not written one. Derived on render
         and stored nowhere; "+ Banner → Company move" writes the real
         one (pre-filled with this same From → To). */
      const implied = uncoveredMoves(group.scenes, dayBanners);
      /* Banners sit between the strips they were written between —
         anchored to a scene, so dragging strips about keeps them. */
      for (const it of DPR.layoutDay(group.scenes, dayBanners)) {
        if (it.type === 'scene') {
          rack.append(renderStrip(it.scene, maxDay, byDay));
          const m = implied.get(it.scene.id);
          if (m) rack.append(impliedMove(m));
        } else {
          rack.append(renderBanner(it.banner, group.key, group.scenes));
        }
      }
    } else {
      group.scenes.forEach((s) => rack.append(renderStrip(s, maxDay, byDay)));
    }
    section.append(rack);
    wrap.append(section);
  }
  fillHours();

  if (byDay) {
    /* Two targets that exist before anything is on them — a new day,
       and (when every strip is scheduled) the way off the schedule.
       The same reason the picker offers "N · new": starting a day
       must not need its own control with its own empty state. */
    wrap.append(dropZone(maxDay + 1, `Drop a strip here to start Day ${maxDay + 1}`));
    if (!hasUnscheduled) wrap.append(dropZone(0, 'Drop a strip here to take it off the schedule'));
  }
  return wrap;
}

function impliedMove(m) {
  const el = stripBanner({ label: `Company move · ${m.from} → ${m.to}`, icon: 'local_shipping' });
  el.classList.add('sb-implied');
  el.dataset.after = m.after;
  el.title = 'The location changes here. Add a Company move banner to the day to note how long it takes and what travels.';
  return el;
}

/* ---- banners and the day's load ----------------------------------
   Day-level strips — a company move, a travel or holding day, a note —
   stored in fms_locations_v1 (src/lib/dpr.js); none of them is a scene
   and none of them is written to one. The load warning is derived: the
   day's pages against a target the AD sets (4 7/8 by default, an
   honest indie day), plus an hours estimate when the script gives the
   screen-time model something to read. */
function dayLoadBits(day, eighths, target) {
  const load = DPR.dayLoad(eighths, target);
  const out = [];
  if (load.over) {
    out.push(badge({
      label: `Over target · ${formatEighths(eighths)} / ${formatEighths(target)} pp`,
      tone: 'danger', icon: 'warning', class: 'sb-load is-over',
      title: `The day carries ${formatEighths(eighths)} pages against a target of ${formatEighths(target)}.`
    }));
  }
  out.push(h('span.sb-group-hours', { 'data-hours-day': String(day) }));
  return out;
}

function loadTargetControl() {
  const target = DPR.pageTarget();
  const sel = h('select.sb-day-sel.k-input', { 'data-action': 'sb-target', id: 'sb-target' });
  for (let e = 16; e <= 64; e += 1) {
    const opt = h('option', { value: String(e), text: formatEighths(e) + ' pp' + (e === DPR.DEFAULT_PAGE_TARGET ? ' · default' : '') });
    if (e === target) opt.selected = true;
    sel.append(opt);
  }
  if (target < 16 || target > 64) {
    const opt = h('option', { value: String(target), text: formatEighths(target) + ' pp' });
    opt.selected = true;
    sel.append(opt);
  }
  return h('div.sb-target', {}, [
    h('label.sb-day-lab', { for: 'sb-target', text: 'Pages per day warning' }),
    h('span.k-control.k-select.sb-target-ctl', {}, [sel])
  ]);
}
/* Screen time is a dynamic import: the model and the script reader are
   not in this page's first paint, and a board without a script never
   needs them. Filled in place, so no render is triggered by it. */
let _hours = null;
const EST_TITLE = () => 'Estimated from the script’s screen time at your page target, '
  + `assuming a ${DPR.DAY_HOURS}-hour day. An estimate built on an estimate.`;
function fillHours() {
  const paint = ({ byDay, byScene }) => {
    document.querySelectorAll('[data-hours-day]').forEach((el) => {
      const sec = byDay.get(Number(el.dataset.hoursDay));
      const hrs = DPR.estimateHours(sec, DPR.pageTarget());
      el.textContent = hrs == null ? '' : `≈ ${hrs.toFixed(1)} h to shoot`;
      el.classList.toggle('is-over', hrs != null && hrs > DPR.DAY_HOURS);
      el.title = hrs == null ? '' : EST_TITLE();
    });
    /* The same estimate per strip (the mobile prototype's "Est: 3h
       15m"), only for a scene the script actually measures, and
       always labelled as an estimate. */
    document.querySelectorAll('[data-hours-scene]').forEach((el) => {
      const hrs = DPR.estimateHours(byScene.get(el.dataset.hoursScene), DPR.pageTarget());
      const said = Board.formatHours(hrs);
      el.textContent = said ? said + ' est.' : '';
      el.title = said ? 'Shoot time for this scene. ' + EST_TITLE() : '';
    });
  };
  /* A microtask, not now: fillHours() runs inside renderBoard(), before
     render() has put the new board in the document, so a synchronous
     paint from the cache found nothing and every re-render (a group
     change, a move) lost its hours. */
  if (_hours) { Promise.resolve().then(() => paint(_hours())); return; }
  Promise.all([import('../lib/screenplay-analysis.js'), import('../lib/script.js')])
    .then(([A, S]) => {
      _hours = () => screenTimeByDay(A.default.screenTime(Scenes.listScenes(), S.loadScript().elements));
      paint(_hours());
    })
    .catch((e) => console.warn('[stripboard] screen time', e));
}

/* The day's call, through the one rule shoot.html reads it by. */
function dayCallFor(day, scenes, sheets) {
  return Board.dayCall(DPR.getDPR(day), sheetsForDay(day, sheets, scenes));
}

function bannerMenu(day) {
  const menu = actionMenu('+ Banner', DPR.BANNER_KINDS.map((k) => ({ label: k.label, action: 'sb-banner-add' })), {
    align: 'right', ariaLabel: `Add a banner to Day ${day}: a company move, travel day, holding day or note`
  });
  menu.classList.add('sb-banner-menu');
  menu.querySelector('.tb-menu-btn').classList.add('k-btn', 'k-btn--secondary', 'k-btn--sm');
  menu.querySelectorAll('[data-action="sb-banner-add"]').forEach((b, i) => {
    b.setAttribute('data-kind', DPR.BANNER_KINDS[i].id);
    b.setAttribute('data-day', String(day));
  });
  return menu;
}

const BANNER_HINT = {
  move: 'How long, what travels',
  travel: 'Where to, how',
  holiday: 'Why: Sunday, festival, holding for weather',
  note: 'Anything the unit should know'
};
const BANNER_ICON = { move: 'local_shipping', travel: 'local_shipping', holiday: 'event', note: 'info' };

function renderBanner(b, day, dayScenes) {
  const el = h('div.sb-banner.is-' + b.kind, { 'data-banner': b.id, 'data-day': String(day), role: 'group', 'aria-label': DPR.bannerText(b) });
  el.append(h('span.sb-banner-kind', {}, [sym(BANNER_ICON[b.kind] || 'info'), h('span', { text: DPR.bannerLabel(b.kind) })]));
  const field = (name, label, value, ph) => {
    const input = h('input.sb-banner-in.k-input', { type: 'text', placeholder: ph || '', 'data-banner-field': name, 'aria-label': label });
    input.value = value || '';
    return h('span.k-control.sb-banner-ctl.is-' + name, {}, [input]);
  };
  if (b.kind === 'move') {
    el.append(h('span.sb-banner-route', {}, [
      field('from', 'Company move from', b.from, 'From'),
      h('span', { text: '→', 'aria-hidden': 'true' }),
      field('to', 'Company move to', b.to, 'To')
    ]));
  }
  el.append(field('text', DPR.bannerLabel(b.kind) + ' note', b.text, BANNER_HINT[b.kind]));
  const pos = h('select.sb-day-sel.k-input', { 'data-banner-field': 'after', 'aria-label': 'Where this banner sits in the day' });
  const opts = [['', 'Top of the day']]
    .concat(dayScenes.map((s) => [s.id, `After scene ${s.number || '—'}`]))
    .concat([[DPR.AFTER_DAY, 'After the day']]);
  const known = opts.some(([v]) => v === b.after);
  for (const [v, t] of opts) {
    const o = h('option', { value: v, text: t });
    if (v === b.after || (!known && v === DPR.AFTER_DAY)) o.selected = true;
    pos.append(o);
  }
  el.append(h('span.k-control.k-select.sb-banner-pos', {}, [pos]), button({
    label: 'Remove', variant: 'danger', size: 'sm', action: 'sb-banner-remove', class: 'sb-btn is-danger',
    attrs: { 'aria-label': 'Remove this banner' }
  }));
  return el;
}

const dropZone = (day, label) =>
  h('div.sb-dropzone', { 'data-day': String(day), text: label });

/* The colour key, in kit badges: the four times of day that carry a
   hue, CONTINUOUS as the neutral tag it renders as, and the two
   INT/EXT tags. The pacing threshold sits at its right in every
   grouping; the warning it drives is drawn on the day headers. */
function legend() {
  const l = h('div.sb-legend', { role: 'group', 'aria-label': 'Strip colour key' });
  l.append(h('span.sb-legend-lab', { text: 'Time legend' }));
  ['DAY', 'DAWN', 'DUSK', 'NIGHT', 'CONTINUOUS'].forEach((t) => {
    const b = todBadge(t, { label: t });
    b.classList.add('sb-legend-item');
    l.append(b);
  });
  l.append(h('span.sb-legend-item.sb-legend-ie', {}, [
    h('span.sb-ie.k-badge.k-badge--tag.is-ext', { text: 'EXT' }),
    h('span', { text: 'filled badge is exterior' })
  ]));
  l.append(h('span.sb-legend-item.sb-legend-ie', {}, [
    h('span.sb-ie.k-badge.k-badge--tag', { text: 'INT' }),
    h('span', { text: 'outline badge is interior' })
  ]));
  const t = loadTargetControl();
  t.classList.add('sb-legend-target');
  l.append(t);
  return l;
}

/* ---- day out of days -----------------------------------------
   The classic grid: cast down the side, shoot days across the top.
   SW on the first day a performer works, W on every working day after
   it, H on a day inside their span that they do NOT work (they are on
   hold and still being paid — that is the whole reason this report
   exists), WF on the last. SWF when the whole part is one day.

   Every value is computed here and none of it is stored. Move a scene
   to another day and the entire grid is different, which is exactly
   why nobody should be maintaining it by hand in a spreadsheet. */
const doodRows = (scenes, days) => doodRowsFor(scenes, days, Scenes.elementIndex());

/* The DOOD key, as the kit's own codes, so the legend and the cells
   cannot drift apart. */
function doodKey() {
  const k = h('div.sb-dood-key', { role: 'group', 'aria-label': 'Day out of days key' });
  k.append(h('span.sb-legend-lab', { text: 'Key' }));
  [['SW', 'Start work'], ['W', 'Work'], ['H', 'Hold'], ['WF', 'Work finish'], ['SWF', 'One day only']].forEach(([c, t]) => {
    k.append(h('span.sb-dood-key-item', {}, [doodCode(c), h('span', { text: t })]));
  });
  return k;
}

function doodExportMenu() {
  const m = actionMenu('Export', [
    { label: 'Day Out of Days as PDF', action: 'pdf-dood', hint: 'landscape' },
    { label: 'Day Out of Days as CSV', action: 'csv-dood', hint: 'cast × days' },
    '---',
    { label: 'Print this page',        action: 'sb-print' }
  ], { align: 'right' });
  m.querySelector('.tb-menu-btn').classList.add('k-btn', 'k-btn--secondary');
  return h('div.sb-dood-export.pdf-menu-host', {}, [m]);
}

function renderDood(scenes) {
  const wrap = h('section.sb-dood', { id: 'dood' });
  const days = shootDays(scenes);
  const rows = doodRows(scenes, days);
  wrap.append(h('div.sb-dood-head', {}, [
    h('div', {}, [
      eyebrow(['Day out of days', castCat.label]),
      h('h2.bd-h2', { text: 'Day Out of Days' }),
      h('p.bd-sub', {
        text: 'Who is needed, and on which day. Built from the cast tags and the days '
            + 'assigned on the Stripboard tab — there is nothing to fill in here.'
      })
    ]),
    rows.length && days.length ? doodKey() : null,
    /* The board's Export menu sits in the other tab's controls, which
       are hidden here, so this tab carries its own. */
    rows.length && days.length ? doodExportMenu() : null
  ].filter(Boolean)));

  if (!rows.length) {
    wrap.append(h('p.bd-none', {
      text: 'No cast tagged yet. Tag a performer on any scene in the breakdown and a row appears here, '
          + 'with every day they work, hold and finish.'
    }));
    return wrap;
  }
  if (!days.length) {
    wrap.append(h('p.bd-none', {
      text: 'No shoot days assigned yet. Give a strip a day on the Stripboard tab — or use "Schedule by location" there — '
          + 'and the grid fills itself in.'
    }));
    return wrap;
  }

  /* The day's calendar date, where the Plan has one — the column
     header carries it, and the column for TODAY is tinted. Read from
     calendarDays(); nothing is dated that the AD did not date. */
  const dateOf = new Map(Locations.calendarDays(scenes).map((d) => [d.day, d.date]));
  const today = todayISO();

  /* A real table, in the kit's table classes (k-table, sticky first
     column, centred figures). Built by hand rather than through
     table(), because each cell's class is its own DOOD state — the
     print sheet reads .sb-cell.is-hold. */
  const scroll = h('div.k-table-wrap.sb-dood-scroll', { role: 'region', 'aria-label': 'Day out of days grid', tabindex: '0' });
  const table = h('table.k-table.k-table--sticky-first.k-table--center.sb-grid');
  const thead = h('thead');
  const hr = h('tr');
  hr.append(h('th.sb-grid-name', { scope: 'col', text: castCat.label }));
  days.forEach((d) => {
    const iso = String(dateOf.get(d) || '').slice(0, 10);
    const dated = localDate(iso);
    const th = h('th.sb-grid-day' + (iso && iso === today ? '.is-col-today' : ''), { scope: 'col', title: dated ? `Day ${d} · ${dated}` : `Day ${d}` }, [
      h('span.sb-grid-dnum', { text: 'D' + d })
    ]);
    if (dated) th.append(h('span.sb-grid-ddate', { text: dayMonth(iso, filmPrefs()) }));
    hr.append(th);
  });
  hr.append(
    h('th.sb-grid-tot', { scope: 'col', title: 'Days worked', text: 'W' }),
    h('th.sb-grid-tot', { scope: 'col', title: 'Days on hold', text: 'H' }),
    h('th.sb-grid-tot', { scope: 'col', title: 'Days from start to finish — the days the part is on the payroll', text: 'Total' })
  );
  thead.append(hr);

  const todayIdx = days.findIndex((d) => String(dateOf.get(d) || '').slice(0, 10) === today);
  const tbody = h('tbody');
  for (const row of rows) {
    const tr = h('tr');
    tr.append(h('th.sb-grid-name', { scope: 'row' }, [
      h('strong', { text: row.name }),
      h('span.sb-grid-sub', { text: `${row.scenes} ${row.scenes === 1 ? 'scene' : 'scenes'}` })
    ]));
    row.cells.forEach((c, i) => {
      const td = h(`td.sb-cell.is-${c.kind}` + (i === todayIdx ? '.is-col-today' : ''), {
        title: c.mark ? `Day ${c.day} · ${LONG[c.kind]}` : `Day ${c.day} · not needed`
      });
      td.append(doodCode(c.mark, { title: td.title }));
      tr.append(td);
    });
    tr.append(
      h('td.sb-grid-tot.k-num', { text: String(row.work) }),
      h('td.sb-grid-tot.k-num.sb-grid-hold', { text: String(row.hold) }),
      h('td.sb-grid-tot.k-num', { text: String(row.span) })
    );
    tbody.append(tr);
  }
  table.append(thead, tbody);
  scroll.append(table);
  /* Below 720px the grid is a sideways scroll a thumb cannot read, so
     the phone leads with one card per performer (the same rows, the
     same cells) and keeps the full grid one tap away. Both are in the
     DOM at every width; the stylesheet picks, and view.matrix (memory
     only, like the grouping) says which one a phone is showing. */
  wrap.classList.toggle('is-matrix', !!view.matrix);
  wrap.append(
    h('div.sb-dood-switch', {}, [
      button({
        label: view.matrix ? 'Show cast cards' : 'Show full matrix',
        icon: view.matrix ? 'view_agenda' : 'grid_on', variant: 'secondary', size: 'sm',
        action: 'sb-dood-matrix', class: 'sb-dood-toggle',
        attrs: { 'aria-pressed': view.matrix ? 'true' : 'false' }
      })
    ]),
    doodCards(rows, days, dateOf, today)
  );
  wrap.append(scroll, h('p.sb-note', {
    text: 'SW starts work · W works · H is held between two working days · WF finishes · '
        + 'SWF is a single-day part. Scenes with no shoot day are not counted.'
  }));
  return wrap;
}

/* One card per performer — doodRows() again, nothing recounted: the
   number is the row's place (most working days first, the order the
   grid prints), the W / H figures and the span are the grid's totals,
   and the cells are the grid's cells. */
function doodCards(rows, days, dateOf, today) {
  const list = h('ol.sb-dood-cards', { 'aria-label': 'Day out of days, one card per performer' });
  rows.forEach((row, i) => {
    const cells = h('div.sb-dc-days', { role: 'list', 'aria-label': `${row.name}, day by day` });
    row.cells.forEach((c) => {
      const iso = String(dateOf.get(c.day) || '').slice(0, 10);
      const said = c.mark ? `Day ${c.day} · ${LONG[c.kind]}` : `Day ${c.day} · not needed`;
      cells.append(h('span.sb-dc-day.is-' + c.kind + (iso && iso === today ? '.is-today' : ''), { role: 'listitem', title: said }, [
        h('span.sb-dc-dnum', { text: 'D' + c.day, 'aria-hidden': 'true' }),
        doodCode(c.mark, { title: said })
      ]));
    });
    list.append(h('li.sb-dc', {}, [
      h('div.sb-dc-head', {}, [
        h('span.sb-dc-idx.k-mono', { text: String(i + 1).padStart(2, '0'), 'aria-hidden': 'true' }),
        h('div.sb-dc-who', {}, [
          h('strong.sb-dc-name', { text: row.name }),
          h('span.sb-dc-sub', { text: `${row.scenes} ${row.scenes === 1 ? 'scene' : 'scenes'}` })
        ]),
        h('div.sb-dc-tot', {}, [
          h('span.sb-dc-wh.k-num', {}, [
            h('span', { text: `${row.work} W` }), h('span', { text: ' · ', 'aria-hidden': 'true' }),
            h('span.sb-dc-h', { text: `${row.hold} H` })
          ]),
          h('span.sb-dc-span', { text: row.span ? `${row.span} ${row.span === 1 ? 'day' : 'days'} span` : 'not on a shoot day' })
        ])
      ]),
      cells
    ]));
  });
  return list;
}

/* ---- render --------------------------------------------------- */
function render() {
  // Dropped every render, not every page load. A cache that outlives
  // the data it mirrors is the thing that goes stale and then lies —
  // visualize.js kept a page-local copy of "does a key exist" and it
  // was wrong the moment the key changed anywhere else.
  _songCache = null;
  const scenes = Scenes.listScenes();
  const main = h('main', { id: 'main' });
  const castRows = scenes.length ? doodRows(scenes, shootDays(scenes)) : [];
  main.append(renderHeader(scenes, castRows));

  /* #stripboard and #dood are nav destinations (navigation.json), so
     they have to exist before any scene does — otherwise the phase
     menu resolves to nothing on exactly the studio that has never
     seen this page. See the note in breakdown.js's render(). */
  if (!scenes.length) {
    main.append(
      h('section.sb-board', { id: 'stripboard' }, [renderEmpty()]),
      h('section.sb-dood', { id: 'dood' }, [
        h('h2.bd-h2', { text: 'Day Out of Days' }),
        h('p.bd-sub', {
          text: 'Who is needed, and on which day. It builds itself from the cast '
              + 'tags and the shoot days on the Stripboard tab, so there is nothing to '
              + 'fill in here and nothing to show until there are scenes.'
        })
      ])
    );
  } else {
    main.append(renderBoard(scenes), renderDood(scenes));
  }

  app.replaceChildren(main);
  mountShell();
  wireActionBar();
  fillLock();
  // Chrome initialises at import time, when #app is still empty — the
  // trap short.js fell into. Re-init after every render.
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[stripboard] chrome', e); }
}

/* ---- Lock production draft -------------------------------------
   The owner's TYPE-TO-CONFIRM lock (14 Oct 2026). It is NOT a second
   mechanism: it is the screenplay's existing scene-number lock —
   `numbering` inside the script blob (src/lib/script.js,
   lockNumbering / saveScript), with the Breakdown's rows renumbered
   to match through scene-sync's applyNumbers() — exactly what the
   "Lock scene numbers" button in the revision tools does. No new key.
   From the lock on, an inserted scene is 12A, a deleted one stays as
   OMITTED and a moved one keeps its number, so the strips, the sides
   and the call sheets keep pointing at the same scene.

   UNLOCK DRAFT sits beside it (owner, hand-off Q3, 14 Oct 2026). It is
   the revision tools' own unlock — `numbering` deleted from the script
   blob, the Breakdown's rows renumbered by position through
   applyNumbers(doc.elements, null) — and, because it renumbers every
   scene, it asks first through dialog.js's askDanger. The revision
   tools keep their copy and stay linked: Manage numbering opens it on
   drafts.html#numbering, beside the drafts it numbers.

   The DRAFT badge names the latest numbered draft — the newest entry
   in the script blob's `revisions`, which is what drafts.html lists —
   and is absent when there is none: nothing is named that was not.

   script.js and scene-sync.js are dynamic imports: neither is in this
   page's first paint (fillHours() loads script.js the same way). */
const scriptLib = () => Promise.all([import('../lib/script.js'), import('../lib/scene-sync.js')]);

/* With no scenes there is nothing to number, so the filled CTA is not
   drawn at all (the empty board already points at the Breakdown). A
   disabled button would explain itself only in a tooltip that keyboard,
   screen-reader and touch users never get. Returns null then: filter
   before a native append. */
function lockButton(empty = !Scenes.listScenes().length) {
  if (empty) return null;
  return button({
    label: 'Lock production draft', variant: 'primary', pill: true, icon: 'lock',
    action: 'sb-lock', class: 'sb-lock-btn',
    title: 'Freeze the scene numbers, so every strip, side and call sheet keeps pointing at the same scene'
  });
}

/* After a render: when the numbers are already locked, the header
   says so instead of offering the lock. Filled in place; no storage
   is written here. */
function fillLock() {
  scriptLib().then(([S]) => {
    const host = document.querySelector('.sb-lock-host');
    if (!host) return;
    const doc = S.loadScript();
    const { latest, count } = latestDraft(doc);
    const draft = latest && String(latest.name || '').trim()
      ? badge({
          label: 'Draft · ' + String(latest.name).trim(), tag: true, class: 'sb-draft',
          title: `The latest numbered draft (${count} in all), from Drafts`
        })
      : null;
    if (!S.isNumberingLocked(doc.numbering)) {
      if (draft) host.replaceChildren(...[draft, lockButton()].filter(Boolean));
      return;
    }
    /* The film's date style, as every other date on this page. */
    const stamp = paperDate(doc.numbering.at, filmPrefs(), 'medium');
    host.replaceChildren(...[
      draft,
      badge({
        label: 'Draft locked' + (stamp ? ' · ' + stamp : ''), tone: 'ok', icon: 'lock', class: 'sb-lock-state',
        title: 'Scene numbers are frozen: inserts take letters (12A), deletions stay as OMITTED.'
      }),
      button({
        label: 'Unlock draft', icon: 'lock_open', variant: 'secondary', size: 'sm', action: 'sb-unlock', class: 'sb-unlock-btn',
        title: 'Unfreeze the scene numbers. Every scene is renumbered by position.'
      }),
      button({ label: 'Manage numbering', href: 'drafts.html#numbering', variant: 'ghost', size: 'sm', class: 'sb-lock-manage' })
    ].filter(Boolean));
  }).catch((e) => console.warn('[stripboard] lock state', e));
}

delegate(document, 'click', '[data-action="sb-unlock"]', async () => {
  let S, Sync;
  try { [S, Sync] = await scriptLib(); } catch (e) {
    toast('The script tools could not be loaded. Check the connection and try again.', { type: 'error' });
    return;
  }
  const before = S.loadScript();
  if (!S.isNumberingLocked(before.numbering)) { render(); return; }
  const res = S.sceneNumbers(before.elements, before.numbering);
  const omitted = res.omitted.length;
  const ok = await askDanger({
    eyebrow: 'Production draft', icon: 'lock_open',
    title: 'Unlock the production draft',
    body: `Every scene is renumbered by its position, 1 to ${res.byId.size} — lettered inserts `
        + 'like 12A become whole numbers'
        + (omitted ? `, and the ${omitted} OMITTED ${omitted === 1 ? 'placeholder goes' : 'placeholders go'}` : '')
        + '. The Breakdown, the strips and the call sheets follow.\n\n'
        + 'Pages already handed out will no longer match. Cancel keeps the numbers locked.',
    confirm: 'Unlock and renumber'
  });
  if (!ok) return;
  /* Re-read after the dialog, as the lock does. */
  const doc = S.loadScript();
  if (!S.isNumberingLocked(doc.numbering)) { render(); return; }
  delete doc.numbering;
  if (!S.saveScript(doc)) {
    toast('The unlock could not be saved: the browser refused the write. Nothing changed.', { type: 'error' });
    return;
  }
  let moved = 0;
  try { moved = Sync.applyNumbers(doc.elements, null); } catch (e) { console.warn('[stripboard] numbers', e); }
  render();
  const said = 'Production draft unlocked: scenes renumbered by position.'
    + (moved ? ` ${moved} ${moved === 1 ? 'strip' : 'strips'} renumbered.` : '');
  announce(said);
  toast(said, { type: 'success' });
  document.querySelector('.sb-lock-btn')?.focus();
});

delegate(document, 'click', '[data-action="sb-dood-matrix"]', () => {
  view.matrix = !view.matrix;
  render();
  document.querySelector('.sb-dood-toggle')?.focus({ preventScroll: true });
});

delegate(document, 'click', '[data-action="sb-lock"]', async () => {
  let S, Sync;
  try { [S, Sync] = await scriptLib(); } catch (e) {
    toast('The script tools could not be loaded. Check the connection and try again.', { type: 'error' });
    return;
  }
  const before = S.loadScript();
  if (S.isNumberingLocked(before.numbering)) { fillLock(); return; }
  const heads = sceneHeadings(before);
  if (!heads) {
    await tell({
      eyebrow: 'Production draft', icon: 'lock', title: 'Nothing to lock yet',
      body: 'Scene numbers lock on the screenplay’s scene headings, and this project’s '
          + 'screenplay has none yet. Write or import it first; the strips then carry '
          + 'the locked numbers.'
    });
    return;
  }
  const ok = await ask({
    eyebrow: 'Production draft', icon: 'lock', tone: 'warn',
    title: 'Lock the production draft',
    body: `This freezes the numbers of all ${heads} ${heads === 1 ? 'scene' : 'scenes'} as they read now.\n\n`
        + 'From then on a scene inserted after 12 is 12A, a deleted scene stays on the page as '
        + 'OMITTED, and a moved scene keeps its number — so the strips, the sides and the call '
        + 'sheets keep pointing at the same scene.',
    notice: { tone: 'info', title: 'Unlocking renumbers', body: 'It can be unlocked later here, with Unlock draft beside the lock, and unlocking renumbers every scene by position.' },
    confirm: 'Lock numbering',
    typeToConfirm: 'LOCK'
  });
  if (!ok) return;
  /* Re-read after the dialog: the script may have been saved in
     another tab while it was open. */
  const doc = S.loadScript();
  if (S.isNumberingLocked(doc.numbering)) { render(); return; }
  /* An imported shooting script's numbers live on the Breakdown's
     rows (the importer never puts them in the element text). When
     every heading's row carries one, they are what is locked — the
     same preset the revision tools build. */
  let preset = new Map();
  try { preset = lockPreset(Scenes.listScenes()); } catch (e) { /* no scenes */ }
  doc.numbering = S.lockNumbering(doc.elements, preset);
  if (!S.saveScript(doc)) {
    toast('The lock could not be saved: the browser refused the write. Nothing changed.', { type: 'error' });
    return;
  }
  let moved = 0;
  try { moved = Sync.applyNumbers(doc.elements, doc.numbering); } catch (e) { console.warn('[stripboard] numbers', e); }
  render();
  const n = Object.keys(doc.numbering.ids).length;
  const said = `Production draft locked: ${n} ${n === 1 ? 'scene number' : 'scene numbers'} frozen.`
    + (moved ? ` ${moved} ${moved === 1 ? 'strip' : 'strips'} renumbered to match.` : '');
  announce(said);
  toast(said, { type: 'success' });
});

/* ---- events — delegated, no inline handlers ------------------- */
const sceneIdOf = (el) => el.closest('[data-scene]')?.dataset.scene;

delegate(document, 'click', '[data-action="sb-group"]', (e, el) => {
  view.group = el.dataset.group;
  render();
});

delegate(document, 'change', '[data-strip-field="shootDay"]', (e, el) => {
  const day = Math.max(0, parseInt(el.value, 10) || 0);
  const id = sceneIdOf(el);
  const rec = Locations.placeScene(id, day);
  render();
  if (rec && rec.fromDay !== rec.toDay) afterMove(rec, { focus: 'select' });
});

delegate(document, 'change', '[data-action="sb-target"]', (e, el) => {
  DPR.setPageTarget(parseInt(el.value, 10));
  render();
  document.getElementById('sb-target')?.focus();
});

delegate(document, 'click', '[data-action="sb-banner-add"]', (e, el) => {
  const day = parseInt(el.dataset.day, 10);
  const kind = el.dataset.kind;
  const patch = { kind };
  if (kind === 'move') {
    /* The first change of location on the day that no move covers yet
       — the move the AD was about to type. */
    const next = nextUncoveredMove(Locations.orderedDayScenes(day), DPR.listBanners(day));
    if (next) Object.assign(patch, next);
  }
  const b = DPR.addBanner(day, patch);
  render();
  announce(`${DPR.bannerLabel(kind)} added to Day ${day}.`);
  const host = document.querySelector(`.sb-banner[data-banner="${CSS.escape(b.id)}"]`);
  const first = host && host.querySelector('input, select');
  if (first) first.focus();
});

delegate(document, 'change', '[data-banner-field]', (e, el) => {
  const host = el.closest('.sb-banner');
  if (!host) return;
  const day = parseInt(host.dataset.day, 10);
  const id = host.dataset.banner;
  DPR.updateBanner(day, id, { [el.dataset.bannerField]: el.value });
  if (el.dataset.bannerField === 'after') {
    render();
    const again = document.querySelector(`.sb-banner[data-banner="${CSS.escape(id)}"] [data-banner-field="after"]`);
    if (again) again.focus();
  }
});

delegate(document, 'click', '[data-action="sb-banner-remove"]', (e, el) => {
  const host = el.closest('.sb-banner');
  const day = parseInt(host.dataset.day, 10);
  const gone = DPR.listBanners(day).find((b) => b.id === host.dataset.banner);
  if (!gone) return;
  DPR.removeBanner(day, gone.id);
  render();
  /* The Remove button was rebuilt, so focus fell to <body>: land on the day's + Banner. */
  const add = document.querySelector(`[data-action="sb-banner-add"][data-day="${day}"]`);
  const addBtn = add && add.closest('.sb-banner-menu') && add.closest('.sb-banner-menu').querySelector('.tb-menu-btn');
  if (addBtn) addBtn.focus();
  const said = `${DPR.bannerLabel(gone.kind)} removed from Day ${day}.`;
  announce(said);
  toast(said, { action: 'UNDO', onAction: () => { DPR.addBanner(day, gone); render(); announce('Undone.'); } });
});

/* ---- moving a strip: the shared tail -------------------------
   Every route — a drop, the menu, Alt+arrows, the picker — ends
   here: say what happened where a screen reader hears it, offer to
   take it back, and put the focus back on the strip that moved so a
   keyboard user is not dropped at the top of the page. */
function describeMove(rec) {
  const scene = Scenes.listScenes().find((s) => s.id === rec.sceneId);
  return moveSentence(rec, scene, rec.toDay ? Locations.orderedDayScenes(rec.toDay).length : 0);
}

/* Only the LATEST move can be undone. A toast with an action never
   times out, so without this every move left its own UNDO on screen,
   and pressing an old one wrote that move's whole before-lists back
   over everything done since. The previous move toast is dismissed
   when a new move, a clear or a re-schedule happens; undoPlace() also
   refuses a record the board no longer matches, for the toast that is
   still somehow on screen. */
let moveToast = null;
function dropMoveToast() {
  if (moveToast) { try { moveToast.dismiss(); } catch (e) { /* already gone */ } }
  moveToast = null;
}

function afterMove(rec, opts = {}) {
  if (!rec) return;
  const said = describeMove(rec);
  announce(said);
  focusStrip(rec.sceneId, opts.focus);
  dropMoveToast();
  const mine = toast(said, {
    action: 'UNDO',
    onAction: () => {
      if (moveToast === mine) moveToast = null;
      if (!Locations.undoPlace(rec)) {
        const msg = 'The board has changed since that move, so it was not undone. Nothing was changed.';
        toast(msg);
        announce(msg);
        return;
      }
      render();
      announce('Undone.');
      focusStrip(rec.sceneId, opts.focus);
    }
  });
  moveToast = mine;
}

/* role="status" rather than toggling aria-live on something that
   already exists: see the toast note in chrome.js. Created once, kept
   outside <main>, because render() replaces <main> and a live region
   that is re-created is a live region several readers never hear. */
function announce(text) {
  let live = document.getElementById('sbLive');
  if (!live) {
    live = h('div#sbLive.visually-hidden', { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
    document.body.append(live);
  }
  live.textContent = '';
  // Two writes, a frame apart, so the same sentence twice is still read.
  requestAnimationFrame(() => { live.textContent = text; });
}

function focusStrip(id, which) {
  const strip = document.querySelector(`.sb-strip[data-scene="${CSS.escape(id)}"]`);
  if (!strip) return;
  const el = strip.querySelector(which === 'select' ? '.sb-day-sel' : '.sb-grip-btn') || strip.querySelector('.sb-day-sel');
  if (el) el.focus({ preventScroll: true });
  strip.scrollIntoView({ block: 'nearest' });
}

/* The menu on the handle. `data-dir` is stamped by moveHandle(). */
delegate(document, 'click', '[data-action="sb-move"]', (e, el) => {
  const id = sceneIdOf(el);
  const dir = el.dataset.dir;
  const scene = Scenes.listScenes().find((s) => s.id === id);
  const day = scene ? shootDayOf(scene) : 0;
  if (!scene || !day) return;
  let rec = null;
  if (dir === 'up' || dir === 'down') rec = Locations.nudgeScene(id, dir === 'up' ? -1 : 1);
  else if (dir === 'top') rec = Locations.placeScene(id, day, { index: 0 });
  else if (dir === 'bottom') rec = Locations.placeScene(id, day);
  if (!rec) { announce(dir === 'up' || dir === 'top' ? 'Already at the top of the day.' : 'Already at the bottom of the day.'); return; }
  render();
  afterMove(rec);
});
delegate(document, 'click', '[data-action="sb-move-focus"]', (e, el) => {
  const sel = el.closest('.sb-strip')?.querySelector('.sb-day-sel');
  if (sel) sel.focus();
});

/* Alt+↑ / Alt+↓ on anything inside a strip, in the day grouping.
   Alt rather than a bare arrow, because the arrows already mean
   something inside the shoot-day <select>. */
document.addEventListener('keydown', (e) => {
  if (!e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
  if (view.group !== 'day') return;
  const strip = e.target && e.target.closest && e.target.closest('.sb-strip');
  if (!strip) return;
  e.preventDefault();
  const id = strip.dataset.scene;
  const rec = Locations.nudgeScene(id, e.key === 'ArrowUp' ? -1 : 1);
  if (!rec) { announce(e.key === 'ArrowUp' ? 'Already at the top of the day.' : 'Already at the bottom of the day.'); return; }
  const which = e.target.classList && e.target.classList.contains('sb-day-sel') ? 'select' : 'grip';
  render();
  afterMove(rec, { focus: which });
});

/* ---- drag ------------------------------------------------------
   Pointer events, not HTML5 drag-and-drop: the DnD API does not fire
   on a phone, and a stripboard that cannot be rearranged with a
   thumb is a desk tool pretending. The handle has touch-action: none
   so the browser does not scroll instead of dragging.

   Nothing moves in the DOM until the drop. The strip under the
   pointer dims and shrinks (the scale is multiplied by --motion, so
   a reduced-motion reader sees the dim and no movement), a line
   shows where it would land, a tag follows the pointer saying what is
   being moved, and the racks and drop zones light as targets. Esc,
   or a pointercancel, puts everything back and writes nothing. A
   press that never travels six pixels is a click, which opens the
   menu as usual. */
const drag = { pending: null, active: false, at: null, line: null, tag: null, over: null, suppressClick: false };
const DRAG_START_PX = 6;

delegate(document, 'pointerdown', '.sb-strip .sb-grip-btn', (e, grip) => {
  if (view.group !== 'day' || e.button !== 0) return;
  const strip = grip.closest('.sb-strip');
  drag.pending = { grip, strip, id: strip.dataset.scene, x: e.clientX, y: e.clientY, pointerId: e.pointerId };
  try { grip.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointer */ }
});

function beginDrag(e) {
  const p = drag.pending;
  drag.active = true;
  drag.suppressClick = true;
  p.strip.classList.add('is-dragging');
  document.body.classList.add('sb-is-dragging');
  drag.line = h('div.sb-drop-line', { 'aria-hidden': 'true' });
  const scene = Scenes.listScenes().find((s) => s.id === p.id);
  drag.tag = h('div.sb-drag-tag', { 'aria-hidden': 'true', text: `Scene ${(scene && scene.number) || ''}`.trim() });
  document.body.append(drag.tag);
  announce(`Dragging scene ${(scene && scene.number) || ''}. Release on a day, or press Escape to cancel.`);
  updateDrag(e);
}

function setOver(el) {
  if (drag.over === el) return;
  if (drag.over) drag.over.classList.remove('is-over');
  drag.over = el;
  if (el) el.classList.add('is-over');
}

function updateDrag(e) {
  const p = drag.pending;
  drag.tag.style.left = e.clientX + 'px';
  drag.tag.style.top = e.clientY + 'px';

  /* Near an edge, nudge the page — a long board is taller than any
     viewport, and a drag that cannot reach Day 14 is not a drag. */
  const edge = 72, vh = window.innerHeight;
  if (e.clientY < edge) window.scrollBy(0, -Math.ceil((edge - e.clientY) / 4));
  else if (e.clientY > vh - edge) window.scrollBy(0, Math.ceil((e.clientY - (vh - edge)) / 4));

  const under = document.elementFromPoint(e.clientX, e.clientY);
  const strip = under && under.closest('.sb-strip:not(.is-dragging)');
  const rack = under && under.closest('.sb-rack[data-day]');
  const zone = under && under.closest('.sb-dropzone[data-day]');

  if (strip && strip.closest('.sb-rack[data-day]')) {
    const r = strip.getBoundingClientRect();
    const before = e.clientY < r.top + r.height / 2;
    const day = parseInt(strip.closest('.sb-rack').dataset.day, 10);
    if (before) strip.before(drag.line); else strip.after(drag.line);
    drag.at = { day, [before ? 'before' : 'after']: strip.dataset.scene };
    setOver(strip.closest('.sb-rack'));
  } else if (rack) {
    rack.append(drag.line);
    drag.at = { day: parseInt(rack.dataset.day, 10) };
    setOver(rack);
  } else if (zone) {
    drag.line.remove();
    drag.at = { day: parseInt(zone.dataset.day, 10) };
    setOver(zone);
  } else {
    drag.line.remove();
    drag.at = null;
    setOver(null);
  }
  /* The line right beside the strip being dragged is the strip's own
     place: no target, so nothing is written for a drop there. */
  if (drag.line.isConnected
      && (drag.line.previousElementSibling === p.strip || drag.line.nextElementSibling === p.strip)) {
    drag.at = null;
    drag.line.remove();
  }
  p.strip.classList.toggle('is-droppable', !!drag.at);
}

/* `drop` false is a cancel. The click guard is lifted on a timer:
   the click a pointerup produces is dispatched in the same task,
   before any timer runs, so a drag's own click is still eaten — and a
   drag whose render replaced the handle before that click could
   land (so no click ever came) does not go on eating the next real
   one. The first version did, and swallowed the UNDO in the toast. */
function endDrag({ drop }) {
  const p = drag.pending;
  if (!p) return;
  const at = drop ? drag.at : null;
  setTimeout(() => { drag.suppressClick = false; }, 0);
  if (drag.active) {
    try { p.grip.releasePointerCapture(p.pointerId); } catch (err) { /* already released */ }
    p.strip.classList.remove('is-dragging', 'is-droppable');
    document.body.classList.remove('sb-is-dragging');
    if (drag.line) drag.line.remove();
    if (drag.tag) drag.tag.remove();
    setOver(null);
  }
  const wasActive = drag.active;
  drag.pending = null; drag.active = false; drag.at = null; drag.line = null; drag.tag = null;
  if (!wasActive) return;
  if (!at) { announce('Drag cancelled. Nothing moved.'); return; }
  const rec = Locations.placeScene(p.id, at.day, { before: at.before, after: at.after });
  render();
  afterMove(rec);
}

document.addEventListener('pointermove', (e) => {
  const p = drag.pending;
  if (!p || e.pointerId !== p.pointerId) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - p.x, e.clientY - p.y) < DRAG_START_PX) return;
    beginDrag(e);
    return;
  }
  e.preventDefault();
  updateDrag(e);
});
document.addEventListener('pointerup', (e) => {
  if (drag.pending && e.pointerId === drag.pending.pointerId) endDrag({ drop: true });
});
document.addEventListener('pointercancel', (e) => {
  if (drag.pending && e.pointerId === drag.pending.pointerId) endDrag({ drop: false });
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && drag.active) { e.preventDefault(); endDrag({ drop: false }); }
});
/* The click that follows a drag's pointerup would open the menu. */
document.addEventListener('click', (e) => {
  if (!drag.suppressClick) return;
  drag.suppressClick = false;
  e.preventDefault();
  e.stopPropagation();
}, true);
/* A long press on a touch handle must not open the context menu. */
document.addEventListener('contextmenu', (e) => {
  if (drag.pending && e.target.closest && e.target.closest('.sb-grip-btn')) e.preventDefault();
});

/* Schedule by location: the first pass a 1st AD does by hand. Scenes
   in one place are shot together, in script order, and each place
   becomes a day. It is a starting point, not a schedule — which is
   why it says so before it overwrites anything. */
/* The undo of a schedule rewrite (Clear days, Schedule by location): in
   memory only, no new key. `before` is every scene's day and every per-day
   order list, read through the models that write them; `after` is what the
   rewrite just left, so Undo can tell whether the board has changed since
   and refuse rather than write the old schedule over newer work. */
const snapshotSchedule = () => ({
  days: Scenes.listScenes().map((s) => ({ id: s.id, day: shootDayOf(s) })),
  orders: Locations.listDayOrder()
});
/* render() rebuilds the toolbar, so the control that opened the dialog is a
   new element: hand focus back to it, as Escape does. */
const refocus = (action) => {
  const el = document.querySelector(`[data-action="${action}"]`);
  if (el && typeof el.focus === 'function') el.focus();
};
function undoableToast(said, before, after, bannerAction, undone) {
  announce(said);
  /* Actionable, so it stays until dismissed (see the toast note in chrome.js),
     and it is the board's latest undo: the next move, clear or re-schedule
     dismisses it through dropMoveToast(). */
  const mine = toast(said, {
    action: 'UNDO',
    onAction: () => {
      if (moveToast === mine) moveToast = null;
      const now = new Map(Scenes.listScenes().map((s) => [s.id, s]));
      const moved = after.days.some((d) => now.has(d.id) && shootDayOf(now.get(d.id)) !== d.day)
        || JSON.stringify(Locations.listDayOrder()) !== JSON.stringify(after.orders);
      if (moved) {
        const msg = 'The board has changed since, so it was not undone. Nothing was changed.';
        toast(msg);
        announce(msg);
        return;
      }
      before.days.forEach((d) => { if (now.has(d.id)) Scenes.updateScene(d.id, { shootDay: d.day }); });
      Locations.clearDayOrders();
      Object.entries(before.orders).forEach(([day, ids]) => Locations.setDayOrder(day, ids));
      render();
      refocus(bannerAction);
      announce(undone);
    }
  });
  moveToast = mine;
}

/* Schedule by location: the first pass a 1st AD does by hand. Scenes
   in one place are shot together, in script order, and each place
   becomes a day. It is a starting point, not a schedule — which is
   why it says so before it overwrites anything, and why the overwrite
   can be undone. */
delegate(document, 'click', '[data-action="sb-auto"]', async () => {
  const scenes = Scenes.listScenes();
  if (!scenes.length) return;
  const already = scenes.filter((s) => shootDayOf(s)).length;
  if (already && !await askDanger({
    title: `Re-schedule ${already === 1 ? 'the scene that has' : `the ${already} scenes that have`} a shoot day?`,
    body: 'Every scene is moved to a day by location and the per-day order is lost. Undo brings the old schedule back.',
    confirm: 'Re-schedule'
  })) return;

  dropMoveToast();
  const before = snapshotSchedule();
  const { plan, days } = scheduleByLocation(scenes);
  for (const p of plan) Scenes.updateScene(p.id, { shootDay: p.day });
  // A fresh schedule starts in script order within each day.
  Locations.clearDayOrders();
  view.group = 'day';
  render();
  refocus('sb-auto');
  undoableToast(`Scheduled into ${days} ${days === 1 ? 'day' : 'days'}, one per location.`,
    before, snapshotSchedule(), 'sb-auto', 'Undone. The old schedule is back.');
});

delegate(document, 'click', '[data-action="sb-clear"]', async () => {
  const scenes = Scenes.listScenes().filter((s) => shootDayOf(s));
  if (!scenes.length) { toast('No strip has a shoot day yet, so there is nothing to clear.'); return; }
  const n = scenes.length;
  if (!await askDanger({
    title: `Clear the shoot day from ${n} ${n === 1 ? 'scene' : 'scenes'}?`,
    body: 'Every strip goes back to unscheduled and the per-day order is lost. The scenes themselves are untouched.',
    confirm: 'Clear days'
  })) return;
  dropMoveToast();
  const before = snapshotSchedule();
  scenes.forEach((s) => Scenes.updateScene(s.id, { shootDay: 0 }));
  // No days, no order within them: a list for a day nothing is on is stranded data.
  Locations.clearDayOrders();
  render();
  refocus('sb-clear');
  undoableToast(`Cleared the shoot day from ${n} ${n === 1 ? 'scene' : 'scenes'}.`,
    before, snapshotSchedule(), 'sb-clear', 'Undone. The shoot days are back.');
});

/* ---- PDF -----------------------------------------------------
   Landscape, one document at a time. Neither of these two had any
   print rules at all before — a board printed with the app rail
   down the side and the shoot-day select as an empty box — so the
   whole treatment lives in styles/pdf.css. */
/* The subtitle is boardSummary() (src/lib/stripboard-model.js). */

delegate(document, 'click', '[data-action="pdf-board"]', () => {
  PDF.exportPDF({ scope: 'board', subtitle: boardSummary(Scenes.listScenes()) });
});

delegate(document, 'click', '[data-action="pdf-dood"]', () => {
  PDF.exportPDF({ scope: 'dood', subtitle: boardSummary(Scenes.listScenes()) });
});

delegate(document, 'click', '[data-action="sb-print"]', () => { const off = brandPrint(); try { window.print(); } finally { setTimeout(off, 1000); } });

/* ---- CSV -----------------------------------------------------
   The board in SHOOT order (each day as the AD ordered it, the
   unscheduled strips last) and the day out of days as a cast × days
   grid, built by stripboard-model.js the way the breakdown builds its
   element index. Same plan capability as the PDFs: an export. */
const csvDates = (scenes) => new Map(Locations.calendarDays(scenes).map((d) => [d.day, d.date]));
/* The download, by hand: story-io.js has the same five lines and
   brings story.js and the samples with it — 11KB of this page's first
   paint for a click. The filename is the film's, as the breakdown's is. */
const fileSlug = () => (PDF.projectTitle() || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
function saveFile(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

delegate(document, 'click', '[data-action="csv-board"]', () => {
  const scenes = Scenes.listScenes();
  if (!scenes.length) { toast('Nothing to export yet.'); return; }
  saveFile(fileSlug() + '-stripboard.csv',
    boardCsv(groupBy(scenes, 'day'), { dateOf: csvDates(scenes), prefs: filmPrefs() }), 'text/csv;charset=utf-8');
});

delegate(document, 'click', '[data-action="csv-dood"]', () => {
  const scenes = Scenes.listScenes();
  const days = shootDays(scenes);
  const rows = scenes.length ? doodRows(scenes, days) : [];
  if (!rows.length || !days.length) { toast('Nothing to export yet — schedule a scene with cast on a shoot day first.'); return; }
  saveFile(fileSlug() + '-day-out-of-days.csv',
    doodCsv(rows, days, { dateOf: csvDates(scenes), prefs: filmPrefs() }), 'text/csv;charset=utf-8');
});

/* Returns the toast's handle ({ dismiss }) or null. */
function toast(message, opts) {
  try { return StudioUI.toast(message, Object.assign({ type: 'info' }, opts || {})) || null; } catch (e) { /* chrome may not be up */ return null; }
}

render();
