/* ============================================================
   SHOOT DAY — the page you hold on the floor
   ------------------------------------------------------------
   Read src/lib/shootday.js first; it owns every decision about
   what a day IS. This file arranges one day and takes the taps.

   IT IS DESIGNED AT 390px AND WIDENS, which is the opposite way
   round from every other page here. The others are desks; this is
   a phone held in one hand on a location in Chennai with a unit
   waiting. So the controls are big, the scene heading is the
   largest thing on the row, and nothing important sits behind a
   menu.

   WHY IT IS ITS OWN PAGE. The schedule lives on the stripboard and
   the call sheet lives in reports, and both are planning surfaces —
   wide tables you read sitting down. Putting "today" on either
   would mean a phone-shaped job inside a desk-shaped layout, and
   the thing you need at 6am would be three taps down a page about
   something else.

   THE WRITE IS THE POINT. Every other scene-derived view reads.
   This one marks a scene shot, which is the production answering
   the plan — see the header of shootday.js for why that is one
   field rather than a new model.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/shoot.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, { SHOT_STATES, formatEighths } from '../lib/scenes.js';
import Locations from '../lib/locations.js';
import Shoot from '../lib/shootday.js';
import Contacts from '../lib/contacts.js';
import Sun from '../lib/sun.js';
import DPR from '../lib/dpr.js';
import Geo from '../lib/recce-geo.js';
import { mountStageGuide } from '../ui/stage-guide.js';
import Shots from '../lib/shots.js';
import { pageHeader, statCard, statStrip, meter, button, chip, field, panel } from '../ui/kit/index.js';
import { sym } from '../ui/kit/util.js';

const app = document.getElementById('app');

/* The open day. Held in memory only: which day somebody is looking
   at is not a fact about the film, and `verify` asserts zero idle
   localStorage writes — a page that persisted its own scroll
   position would trip it, correctly. */
let openDay = null;
let rosterFilter = 'all';   // 'all' | 'incomplete' — the roster's view, never stored
/* The floor note being edited, and what has been typed into it so far.
   Memory only: a draft is not a fact about the film until Save, and a
   re-render caused by a tap on another card must not lose it. */
let noteOpen = '';
const noteDraft = new Map();

/* ---- pieces -------------------------------------------------- */

function slug(s) {
  const parts = [s.intExt, s.location || 'NO LOCATION'].filter(Boolean).join(' ');
  return parts + (s.dayNight ? ' — ' + s.dayNight : '');
}

function castChips(scene) {
  const cast = Locations.castOf(scene);
  if (!cast.length) return h('p.sd-cast.is-none', { text: 'No cast tagged' });
  const wrap = h('p.sd-cast', {}, [h('span.sd-k', { text: 'Cast' })]);
  cast.forEach((n) => wrap.append(h('span.sd-chip', { text: n })));
  return wrap;
}

/* The breakdown element ids that have a kit chip hue. The rest print
   as a neutral chip with the category name in its title. */
const CHIP_CAT = { props: 'props', setdressing: 'dressing', vehicles: 'vehicles', stunts: 'stunts',
  sfx: 'sfx', vfx: 'vfx', sound: 'sound', animals: 'animals' };

/* What the scene needs on the floor: the breakdown's tagged elements
   and the shot list's coverage (src/lib/shootday.js sceneNeeds). A
   scene with nothing tagged and no shots shows nothing, rather than a
   row of "none". */
function needsBlock(scene, ctx) {
  const n = Shoot.sceneNeeds(scene, ctx.shots, Shots.sceneCameras(scene.id, ctx.blocksOf(scene.id)));
  const facts = [];
  if (n.setups) facts.push(['Setups', n.setupsDone + ' of ' + n.setups + ' ticked']);
  if (n.cameras.length) facts.push(['Cameras', n.cameras.join(', ')]);
  if (n.lenses.length) facts.push(['Lenses', n.lenses.join(', ')]);
  if (n.rigs.length) facts.push(['Rig', n.rigs.join(', ')]);
  if (!n.tags.length && !facts.length) return null;
  const box = h('div.sd-needs');
  if (n.tags.length) {
    box.append(h('div.sd-needs-tags.k-chip-row', { 'aria-label': 'Tagged in the breakdown' },
      n.tags.map((t) => chip({ label: t.name, category: CHIP_CAT[t.cat], attrs: { title: t.label } }))));
  }
  if (facts.length) {
    box.append(h('dl.sd-needs-facts', {}, facts.map(([k, v]) =>
      h('div', {}, [h('dt.sd-k', { text: k }), h('dd', { text: v })]))));
  }
  return box;
}

/* The floor note: read as a box with the note in it, edited in place.
   Nothing is written until Save; Cancel and a re-render keep the
   draft only in memory. */
function noteBlock(scene) {
  const note = Shoot.floorNoteOf(scene);
  const id = scene.id;
  if (noteOpen === id) {
    const f = field({
      kind: 'textarea', label: 'Floor note', meta: 'Scene ' + (scene.number || '—'),
      value: noteDraft.has(id) ? noteDraft.get(id) : note,
      placeholder: 'What the floor needs to remember: an insert still owed, a continuity point, the take to print',
      rows: 3,
      attrs: { 'data-shoot-note': id, maxlength: String(Shoot.FLOOR_NOTE_MAX) }
    });
    return h('div.sd-note.is-edit', {}, [f, h('div.sd-note-row', {}, [
      button({ label: 'Save note', variant: 'primary', size: 'sm', attrs: { 'data-shoot-action': 'note-save', 'data-scene': id } }),
      button({ label: 'Cancel', variant: 'ghost', size: 'sm', attrs: { 'data-shoot-action': 'note-cancel', 'data-scene': id } })
    ])]);
  }
  if (note) {
    return h('div.sd-note', {}, [
      h('p.sd-note-text', {}, [sym('sticky_note_2'), h('strong', { text: 'Floor note: ' }), h('span', { text: note })]),
      button({ label: 'Edit note', variant: 'ghost', size: 'sm', icon: 'edit_note',
        attrs: { 'data-shoot-action': 'note-edit', 'data-scene': id, 'aria-label': 'Edit the floor note for scene ' + (scene.number || '') } })
    ]);
  }
  return h('div.sd-note.is-empty', {}, [
    button({ label: 'Add floor note', variant: 'ghost', size: 'sm', icon: 'edit_note',
      attrs: { 'data-shoot-action': 'note-edit', 'data-scene': id, 'aria-label': 'Add a floor note for scene ' + (scene.number || '') } })
  ]);
}

const STATE_WORD = { shot: 'Shot', part: 'Part-shot', dropped: 'Dropped' };

/* The takes line and its controls. Every number is read off the
   scene's own `takes` field (src/lib/shootday.js); a scene with none
   logged says so. A circled take is a marked chip AND a word, never
   colour alone. */
function takesBlock(scene) {
  const takes = Shoot.takesOf(scene);
  const box = h('div.sd-takes');
  box.append(h('p.sd-takes-line', {}, [
    h('span.sd-k', { text: 'Takes logged' }),
    h('strong', { text: Shoot.takesLine(scene) || 'none yet' })
  ]));
  const row = h('div.sd-take-row', { role: 'group', 'aria-label': 'Takes for scene ' + (scene.number || '') });
  takes.forEach((t) => row.append(h('button.sd-take' + (t.circled ? '.is-circled' : ''), {
    type: 'button', 'data-shoot-action': 'circle', 'data-scene': scene.id, 'data-take': String(t.n),
    'aria-pressed': String(t.circled),
    title: t.circled ? 'Take ' + t.n + ' is circled. Press to un-circle.' : 'Circle take ' + t.n,
    text: 'T' + t.n + (t.circled ? ' ●' : '')
  })));
  row.append(h('button.k-btn.k-btn--sm.sd-take-add', {
    type: 'button', 'data-shoot-action': 'take', 'data-scene': scene.id, text: '+ Take'
  }));
  if (takes.length) {
    row.append(h('button.k-btn.k-btn--ghost.k-btn--sm.sd-take-undo', {
      type: 'button', 'data-shoot-action': 'untake', 'data-scene': scene.id,
      'aria-label': 'Remove take ' + takes[takes.length - 1].n, text: 'Undo'
    }));
  }
  box.append(row);
  return box;
}

function sceneCard(scene, ctx, next) {
  const late = ctx.late;
  const state = scene.shotState || '';
  const card = h('article.sd-card' + (state ? '.is-' + state : '') + (next ? '.is-next' : ''), { 'data-scene': scene.id });

  /* Mobile prototype 3: the scene number and the state on one line,
     the slug under it at full width, then pages and cast. */
  const head = h('div.sd-head');
  head.append(h('span.sd-num', { text: 'Scene ' + (scene.number || '—') }));
  head.append(h('span.sd-pill' + (state ? '.is-' + state : next ? '.is-next' : '.is-up'), {
    text: state ? STATE_WORD[state] : next ? 'Next up' : 'Upcoming'
  }));
  card.append(head);
  card.append(h('h3.sd-slug', { text: slug(scene) }));
  card.append(h('p.sd-line', {}, [
    h('span.sd-pgs', { text: formatEighths(scene.eighths || 0) + ' pages' }),
    scene.pageNumber ? h('span.sd-pgs', { text: 'p. ' + scene.pageNumber }) : null
  ].filter(Boolean)));

  /* Words, not a colour: this exterior is planned into a day that
     wraps after the light has gone. */
  if (late && late.has(scene.id)) {
    card.append(h('p.sd-flag', {}, [sym('warning'), h('span', { text: 'Exterior · needs the light — shoot before sunset' })]));
  }
  if (String(scene.synopsis || '').trim()) {
    card.append(h('p.sd-syn', { text: scene.synopsis }));
  }
  card.append(castChips(scene));
  const needs = needsBlock(scene, ctx);
  if (needs) card.append(needs);
  /* Part-shot is the commonest outcome of a day, and the card says
     what it means and how it ends: the rest is owed, and Shot closes
     it. (The prototypes' "Resume strike" is this same toggle.) */
  if (state === 'part') {
    card.append(h('p.sd-hint', { text: 'Part-shot — the rest is still owed. Mark it Shot once the pick-ups are in the can.' }));
  } else if (state === 'dropped') {
    card.append(h('p.sd-hint', { text: 'Dropped on the floor. Tap Dropped again to bring it back.' }));
  }
  card.append(noteBlock(scene));
  card.append(takesBlock(scene));

  /* One row of big targets. `aria-pressed` rather than a disabled
     button for the active one, because the state IS the control:
     tapping the live state again clears it, which is how somebody
     undoes a mis-tap without hunting for a reset. */
  const row = h('div.sd-actions', { role: 'group', 'aria-label': 'Mark scene ' + (scene.number || '') });
  SHOT_STATES.forEach((st) => {
    row.append(h('button.k-btn.k-btn--lg.sd-btn.sd-' + st.id + (state === st.id ? '.is-on' : ''), {
      type: 'button',
      'data-shoot-action': 'mark',
      'data-scene': scene.id,
      'data-state': state === st.id ? '' : st.id,
      'aria-pressed': String(state === st.id),
      text: st.label
    }));
  });
  card.append(row);
  return card;
}

/* ---- the page ------------------------------------------------ */

/* An empty page says where the missing thing is made, as a link —
   a sentence naming the stripboard with no way to reach it is a
   dead end on a phone, where the band has scrolled away. */
function renderEmpty(reason, link) {
  const main = h('main#main.sd-main');
  main.append(pageHeader({
    eyebrow: ['Shoot', 'Today'], title: 'Shoot day.', sub: reason,
    actions: link ? [button({ label: link.label, href: link.href })] : []
  }));
  return main;
}

/* "2024-02-12" is how the date is stored, not how anybody reads it.
   Built from the parts rather than `new Date(iso)`, which reads a
   bare ISO date as UTC midnight and prints the day before west of
   Greenwich. Anything that is not a date prints as typed. */
function niceDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return String(iso || '');
  const d = new Date(+m[1], +m[2] - 1, +m[3]);
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}

/* `focus` is a selector for the control to hand focus back to: a
   full render replaces the button that was pressed, and without it
   focus falls to <body> and the next Tab starts from the top of the
   page — the pattern visualize.js's render() set. */
function render(focus) {
  const scenes = Scenes.listScenes();
  if (!scenes.length) {
    app.replaceChildren(renderEmpty(
      'No scenes yet. Break the script down first and the day builds itself — '
      + 'this page is a view of the scene list, not a second copy of it.',
      { href: 'breakdown.html#scenes', label: 'Open the Scene List →' }));
    after();
    return;
  }

  const all = Shoot.days(scenes);
  if (!all.length) {
    app.replaceChildren(renderEmpty(
      'No scene is on a shoot day yet. Put them on days in the stripboard and '
      + 'they appear here, in the order you scheduled them.',
      { href: 'stripboard.html#stripboard', label: 'Open the stripboard →' }));
    after();
    return;
  }

  if (openDay === null || !all.some((d) => d.day === openDay)) openDay = Shoot.pickDay(scenes);
  const day = all.find((d) => d.day === openDay) || all[0];
  const overall = Shoot.overall(scenes);

  const main = h('main#main.sd-main');

  /* "today" only when it is: pickDay() falls back to the first day
     with work left, and an eyebrow calling a February date "today"
     in October is the page lying about the one thing it is for. */
  const isToday = String(day.date || '').slice(0, 10) === Shoot.toISODate(new Date());
  const currentDay = Shoot.pickDay(scenes);
  const sheet = Shoot.sheetsForDay(day.day, Contacts.listCallSheets(), scenes)[0];
  const rec = DPR.getDPR(day.day);
  const crewCall = rec.crewCall || (sheet && sheet.generalCall) || '';
  const plannedWrap = DPR.laterWrap(sheet && sheet.wrap, rec.wrap);
  const wrap = Shoot.wrapEstimate({
    plannedWrap, crewCall, eighths: day.eighthsTotal,
    target: DPR.pageTarget(), dayHours: DPR.DAY_HOURS
  });
  const lit = lightFor(day);

  /* Mobile prototype 3 (the floor monitor that matched the data):
     one hero card holding the day, its date and place, and the four
     figures, with the call sheet a tap away. Widened on a desk, the
     card keeps its order and the figures sit four across. */
  const hero = h('section.sd-hero', { 'aria-label': 'Today' });
  const pad = (n) => String(n).padStart(2, '0');
  const titleBox = pageHeader({
    class: 'sd-hero-t',
    eyebrow: ['Shoot', isToday ? 'Today' : null, 'Day ' + pad(day.day) + ' of ' + pad(all.length)].filter(Boolean),
    title: 'Day ' + pad(day.day) + '.',
    sub: day.date ? niceDate(day.date) : 'This day has no date yet — set one on the Plan’s calendar and the page can find it on the morning.',
    meta: isToday ? [h('span.sd-live', {}, [h('span.sd-dot.is-live', { 'aria-hidden': 'true' }), h('span', { text: 'Today' })])] : [],
    actions: [sheet
      ? button({ label: 'View call sheet', icon: 'description', href: 'contacts.html#call-sheets',
          attrs: { title: 'Open ' + (sheet.title || 'the call sheet') + ' on Call sheets' } })
      : button({ label: 'Make the call sheet', icon: 'description', variant: 'ghost', href: 'contacts.html#call-sheets' })]
  });
  const kpi = (label, value, of, fill, sub) => {
    const c = statCard({ label, value, unit: of || '', note: sub || '' });
    if (fill !== null) c.append(meter({ label: '', value: Math.round(fill * 100), max: 100, show: false, attrs: { 'aria-label': label } }));
    return c;
  };
  const total = day.scenes.length;
  const kpis = statStrip([
    kpi('Scenes shot', String(day.done), '/ ' + total, total ? day.done / total : 0,
      day.remaining ? day.remaining + ' left today' : 'none left today'),
    kpi('Pages shot', day.pagesDone, '/ ' + day.pagesTotal, day.eighthsTotal ? day.eighthsDone / day.eighthsTotal : 0),
    /* The whole film, not the day: shot or dropped over every scene. */
    kpi('In the can', String(overall.done), '/ ' + overall.scenes, overall.scenes ? overall.done / overall.scenes : 0,
      overall.pagesDone + ' of ' + overall.pagesTotal + ' pages, film total'),
    kpi('Wrap estimate', wrap.time || '—', wrap.time && lit ? lit.light.zone : '', null,
      wrap.kind === 'planned' ? 'planned wrap' : wrap.kind === 'estimate' ? 'estimated from call and pages' : 'no call or wrap set yet')
  ], { class: 'sd-kpis', label: 'Day figures' });
  hero.append(titleBox, kpis);
  if (day.locations.length) {
    hero.append(h('p.sd-where', {}, [sym('place'), h('span', { text: day.locations.join(' · ') })]));
  }
  main.append(hero);

  /* Day switcher. Every day, not a prev/next pair: an AD jumping to
     Friday should not tap through Wednesday. Each day carries its date
     when it has one; on a phone the strip is one line that scrolls,
     parked on the open day. */
  const nav = h('nav.sd-days', { 'aria-label': 'Shoot days' });
  nav.append(h('div.sd-days-h', {}, [
    h('span.sd-k', { text: 'Shooting days' }),
    h('span.sd-k.sd-days-of', { text: 'Day ' + pad(day.day) + ' / ' + pad(all.length) })
  ]));
  const track = h('div.sd-days-track');
  all.forEach((d) => {
    const cur = d.day === currentDay;
    const today = String(d.date || '').slice(0, 10) === Shoot.toISODate(new Date());
    track.append(h('button.k-btn.k-btn--sm.sd-day' + (d.day === day.day ? '.is-on' : '')
                 + (d.complete ? '.is-done' : '') + (cur ? '.is-current' : ''), {
      type: 'button',
      'data-shoot-action': 'day',
      'data-day': String(d.day),
      'aria-current': d.day === day.day ? 'true' : 'false',
      title: (d.complete ? 'Day ' + d.day + ' is wrapped' : cur ? 'Day ' + d.day + ' — the day the page opens on' : 'Day ' + d.day)
        + (d.date ? ' · ' + niceDate(d.date) : '')
    }, [
      d.date ? h('span.sd-day-d', { text: shortDate(d.date) }) : null,
      h('span.sd-day-n', {}, [
        h('span', { text: 'D' + d.day }),
        d.complete ? h('span.sd-day-m', { 'aria-label': 'wrapped', text: '✓' }) : null,
        !d.complete && (today || cur) ? h('span.sd-day-m.is-cur', { text: today ? 'today' : 'current' }) : null
      ].filter(Boolean))
    ].filter(Boolean)));
  });
  nav.append(track);
  main.append(nav);

  const sun = renderSun(day, scenes, { lit, crewCall, rec, plannedWrap, wrap, isToday });
  main.append(sun.node);
  const help = renderHelp(day);
  if (help) main.append(help);

  const list = h('section.sd-roster', { 'aria-label': 'Scene strike roster' });
  const incomplete = day.scenes.filter((x) => x.shotState !== 'shot' && x.shotState !== 'dropped');
  if (rosterFilter === 'incomplete' && !incomplete.length) rosterFilter = 'all';
  const shown = rosterFilter === 'incomplete' ? incomplete : day.scenes;
  const nextId = incomplete.length ? incomplete[0].id : '';
  list.append(h('div.sd-roster-h', {}, [
    h('h2.sd-roster-t', { text: isToday ? "Today's stripboard order" : 'Day ' + day.day + ' · stripboard order' }),
    h('div.sd-filter', { role: 'group', 'aria-label': 'Filter scenes' }, [
      h('span.sd-k', { text: 'Filter' }),
      ...[['all', 'All (' + day.scenes.length + ')'], ['incomplete', 'Incomplete (' + incomplete.length + ')']].map(([id, label]) =>
        h('button.k-btn.k-btn--sm.sd-fbtn' + (rosterFilter === id ? '.is-on' : ''), {
          type: 'button', 'data-shoot-action': 'filter', 'data-filter': id,
          'aria-pressed': String(rosterFilter === id), text: label
        }))
    ])
  ]));
  const cards = h('div.sd-list');
  const blocks = Shots.listBlocks();
  const ctx = {
    late: sun.late,
    shots: Shots.listShots(),
    blocksOf: (id) => blocks.filter((b) => b.sceneId === id)
  };
  shown.forEach((x) => cards.append(sceneCard(x, ctx, x.id === nextId)));
  list.append(cards);
  main.append(list);

  /* The day answers the plan here; the report on it is written on
     reports.html (src/lib/dpr.js), which reads these marks back. */
  main.append(h('p.sd-dpr', {}, [
    button({ label: 'End of day → DPR', variant: 'primary', pill: true, href: 'reports.html?day=' + day.day + '#dpr' }),
    button({ label: 'Next: Edit Log →', href: 'edit.html#log' })
  ]));

  app.replaceChildren(main);
  /* Park the phone's one-line day strip on the open day. scrollLeft on
     the strip itself, never scrollIntoView, which would move the page. */
  const on = track.querySelector('.sd-day.is-on');
  if (on && track.scrollWidth > track.clientWidth) {
    track.scrollLeft = Math.max(0, on.offsetLeft - track.offsetLeft - (track.clientWidth - on.offsetWidth) / 2);
  }
  after(focus);
}

/* "12 Feb" — the day strip's date, built from the parts like niceDate. */
function shortDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''));
  if (!m) return '';
  return new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/* ---- the nearest help -----------------------------------------
   The recce's hospital and police lines for the day's locations, as
   the call sheet prints them, with a Call button where the line holds
   a number. No distance: none is stored. A day whose locations have
   nothing noted says where it is written, because on a floor the
   missing hospital is the thing to notice. */
function renderHelp(day) {
  if (!day.locations.length) return null;
  const places = day.locations.map((name) => ({ name, recce: Locations.getRecce(name) }));
  const help = Shoot.nearestHelp(places);
  const body = [];
  if (!help.length) {
    body.push(h('p.sd-sun-note', {}, [
      h('span', { text: 'No hospital or police station noted for ' + day.locations.join(' or ') + '. ' }),
      h('a', { href: 'contacts.html#call-sheets', text: 'Add them under Route & safety →' })
    ]));
  } else {
    const multi = help.length > 1 || day.locations.length > 1;
    help.forEach((p) => {
      const rows = h('ul.sd-help-list', { 'aria-label': 'Nearest help for ' + p.name });
      p.rows.forEach((r) => rows.append(h('li.sd-help-row', {}, [
        sym(r.kind === 'hospital' ? 'local_hospital' : 'local_police'),
        h('div.sd-help-t', {}, [
          h('span.sd-k', { text: r.kind === 'hospital' ? 'Nearest hospital' : 'Nearest police' }),
          h('span.sd-help-v', { text: r.text })
        ]),
        r.tel ? button({ label: 'Call', icon: 'call', size: 'sm', href: 'tel:' + r.tel,
          attrs: { 'aria-label': 'Call ' + (r.kind === 'hospital' ? 'the hospital' : 'the police') + ' on ' + r.tel } }) : null
      ].filter(Boolean))));
      body.push(multi ? h('div.sd-help-place', {}, [h('p.sd-help-loc', { text: p.name }), rows]) : rows);
    });
  }
  return panel({ class: 'sd-help', eyebrow: 'Safety', title: 'Nearest help', body });
}

function deviceOffsetOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTimezoneOffset() : new Date().getTimezoneOffset();
}

/** The day's light and the place it is for; null when the day has no date. */
function lightFor(day) {
  if (!day.date) return null;
  const places = day.locations.map((name) => ({ name, recce: Locations.getRecce(name) }));
  const place = Geo.placeFor(places);
  const light = Sun.daylight(day.date, place, { deviceOffset: deviceOffsetOn(day.date) });
  return light ? { light, place } : null;
}

const mins = (t) => Sun.minutesOf(String(t || '').slice(0, 5));
const rangeOf = (span) => {
  const m = /^(\d{2}:\d{2})–(\d{2}:\d{2})$/.exec(span || '');
  return m ? [mins(m[1]), mins(m[2])] : null;
};
const pct = (v) => (Math.round(v * 1000) / 10) + '%';

/* The solar timeline: the day's bar, drawn from sunrise, sunset and the
   two golden-hour spans of src/lib/sun.js, with the crew call and the
   wrap placed on it when somebody has written them down. Nothing on it
   is invented: an absent time is an absent tick. The window is the call
   (or an hour before sunrise) to the wrap (or two hours after sunset),
   widened to whole hours. */
function timeline(light, ctx) {
  const rise = light.sunriseMinutes, set = light.sunsetMinutes;
  const call = mins(ctx.crewCall), wrapM = mins(ctx.wrap.time);
  const from = Math.floor(Math.min(call == null ? rise - 60 : call, rise - 60) / 60) * 60;
  const to = Math.ceil(Math.max(wrapM == null ? set + 120 : wrapM, set + 60) / 60) * 60;
  const span = to - from;
  const at = (m) => (m - from) / span;
  const gAm = rangeOf(light.goldenAm), gPm = rangeOf(light.goldenPm);
  const cuts = [from, rise];
  if (gAm) cuts.push(Math.min(gAm[1], set));
  if (gPm) cuts.push(gPm[0]);
  if (gPm) cuts.push(gPm[1]);
  cuts.push(set, to);
  const segs = [];
  const seg = (a, b, cls, label) => { if (b > a) segs.push({ a, b, cls, label }); };
  seg(from, rise, 'is-dark', 'Before sunrise');
  if (gAm) { seg(rise, gAm[1], 'is-gold', 'Golden hour, morning'); seg(gAm[1], gPm ? gPm[0] : set, 'is-day', 'Daylight'); }
  else seg(rise, gPm ? gPm[0] : set, 'is-day', 'Daylight');
  if (gPm) { seg(gPm[0], Math.min(gPm[1], to), 'is-gold', 'Golden hour, evening'); seg(Math.min(gPm[1], to), set, 'is-day', 'Daylight'); }
  seg(set, to, 'is-dark', 'After sunset');
  const bar = h('div.sd-tl', { role: 'img', 'aria-label':
    'Daylight from ' + clockOf(from) + ' to ' + clockOf(to % 1440) + ': sunrise ' + light.sunrise + ', sunset ' + light.sunset }, segs.map((s) =>
    h('div.sd-tl-seg.' + s.cls, { style: 'width:' + pct((s.b - s.a) / span), title: s.label })));
  const ticks = h('div.sd-tl-ticks');
  const tick = (m, text, cls) => {
    if (m == null) return;
    const t = at(m);
    if (t < 0 || t > 1) return;
    ticks.append(h('span.sd-tl-tick' + (cls ? '.' + cls : '') + (t > 0.82 ? '.is-r' : t < 0.18 ? '.is-l' : ''),
      { style: 'left:' + pct(t), text }));
  };
  tick(call, clockOf(call) + ' call', 'is-call');
  tick(wrapM, clockOf(wrapM) + ' wrap', 'is-wrap');
  if (ctx.isToday) {
    const d = new Date();
    const now = d.getHours() * 60 + d.getMinutes();
    if (now >= from && now <= to) tick(now, '▲ now ' + clockOf(now), 'is-now');
  }
  return h('div.sd-tl-wrap', {}, [bar, ticks]);
}
const clockOf = (m) => Sun.clock(m);

/* ---- the light ------------------------------------------------
   Sunrise, sunset and golden hour for the day's date at its first
   pinned location (src/lib/sun.js, offline). Chennai stands in, and
   says so, for a location with no pin. The sunset flag reads the
   planned wrap off the day's call sheet or DPR — a time somebody wrote
   down — and never guesses one. */
function renderSun(day, scenes, ctx) {
  const node = h('section.sd-sun', { 'aria-label': 'Daylight and the day\'s times' });
  const late = new Set();
  const lit = ctx.lit;
  if (!lit) {
    node.append(h('p.sd-sun-note', { text: day.date ? 'The light for this date could not be worked out.' : 'Sunrise and sunset appear once this day has a date.' }));
    node.append(timesRow(day, ctx));
    return { node, late };
  }
  const { light, place } = lit;
  const first = day.locations[0];

  const panel = h('div.sd-solar');
  panel.append(h('div.sd-solar-h', {}, [
    h('span.sd-panel-t', { text: 'Solar engine & daylight horizon' }),
    h('span.sd-solar-loc', {
      text: place.fallback
        ? 'Chennai default (' + light.zone + ')' + (first ? ' — ' + first + ' has no map pin yet' : '')
        : place.name + ' · ' + place.lat.toFixed(4) + '°, ' + place.lng.toFixed(4) + '° · ' + light.zone
    })
  ]));
  const cell = (label, value, cls) => h('div.sd-sun-cell' + (cls ? '.' + cls : ''), {}, [h('dt', { text: label }), h('dd', { text: value || '—' })]);
  panel.append(h('dl.sd-sun-row', {}, [
    cell('Sunrise', light.sunrise),
    cell('Golden · am', light.goldenAm, 'is-gold'),
    cell('Golden · pm', light.goldenPm, 'is-gold'),
    cell('Sunset', light.sunset)
  ]));
  panel.append(timeline(light, ctx));
  if (place.fallback && first && 'geolocation' in navigator) {
    panel.append(h('button.btn.sd-sun-btn', {
      type: 'button', 'data-shoot-action': 'locate', 'data-loc': first,
      text: 'Pin ' + first + ' where this phone is'
    }));
  }
  node.append(panel, timesRow(day, ctx));

  if (ctx.plannedWrap && Sun.isPastSunset(ctx.plannedWrap, light)) {
    const ext = day.scenes.filter((s) => Sun.needsDaylight(s) && s.shotState !== 'shot' && s.shotState !== 'dropped');
    ext.forEach((s) => late.add(s.id));
    node.append(h('p.sd-flag', { role: 'note' }, [
      h('strong', { text: 'Post-sunset wrap. ' }),
      h('span', { text: 'Wrap ' + ctx.plannedWrap + ' is after sunset (' + light.sunset + ').'
        + (ext.length
          ? ' ' + ext.length + (ext.length === 1 ? ' exterior scene needs' : ' exterior scenes need')
            + ' the light: ' + ext.map((s) => s.number || '—').join(', ') + '.'
          : ' No exterior left to shoot today.') })
    ]));
  }
  return { node, late };
}

/* Crew call, first shot, lunch and wrap, read off the day's DPR
   (src/lib/dpr.js) with the call sheet's general call and planned wrap
   standing in for a DPR not yet filled. A time nobody has written is
   an em dash and a link to where it is written. */
function timesRow(day, ctx) {
  const { rec, crewCall, plannedWrap } = ctx;
  const lunch = rec.lunchIn && rec.lunchOut ? rec.lunchIn + '–' + rec.lunchOut : rec.lunchIn || rec.lunchOut || '';
  const cells = [
    ['Crew call', crewCall],
    ['First shot', rec.firstShot],
    ['Lunch break', lunch],
    ['Wrap', plannedWrap || rec.cameraWrap]
  ];
  const row = h('dl.sd-times');
  cells.forEach(([k, v]) => row.append(h('div.sd-time', {}, [
    h('dt', { text: k }), h('dd' + (v ? '' : '.is-none'), { text: v || '—' })
  ])));
  const any = cells.some(([, v]) => v);
  return h('div.sd-times-wrap', {}, [
    row,
    any ? null : h('p.sd-sun-note', {}, [
      h('span', { text: 'Times come from the DPR and the call sheet. ' }),
      h('a', { href: 'reports.html?day=' + day.day + '#dpr', text: 'Set them on the DPR →' })
    ])
  ].filter(Boolean));
}

function after(focus) {
  if (focus) {
    const node = document.querySelector(focus);
    if (node) node.focus();
  }
  /* The blueprint's production questions, answered here (src/ui/stage-guide.js). */
  mountStageGuide(document.getElementById('main'), { stage: 'production' });
  mountShell();
  /* Chrome initialises at import time when #app is still empty, so
     every page re-inits after its own render — the omission that
     left short.js without a step rail for a long time. */
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[shoot] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------ */
delegate(document, 'click', '[data-shoot-action]', (e, el) => {
  const act = el.getAttribute('data-shoot-action');
  if (act === 'day') {
    openDay = parseInt(el.getAttribute('data-day'), 10);
    render('[data-shoot-action="day"][data-day="' + openDay + '"]');
    return;
  }
  if (act === 'filter') {
    rosterFilter = el.getAttribute('data-filter') === 'incomplete' ? 'incomplete' : 'all';
    render('[data-shoot-action="filter"][data-filter="' + rosterFilter + '"]');
    return;
  }
  if (act === 'note-edit' || act === 'note-cancel' || act === 'note-save') {
    const id = el.getAttribute('data-scene');
    const sel = (a) => '[data-shoot-action="' + a + '"][data-scene="' + CSS.escape(id) + '"]';
    if (act === 'note-edit') {
      noteOpen = id;
      render('[data-shoot-note="' + CSS.escape(id) + '"]');
      return;
    }
    if (act === 'note-save') {
      const box = document.querySelector('[data-shoot-note="' + CSS.escape(id) + '"]');
      const was = Shoot.floorNoteOf(Scenes.listScenes().find((x) => x.id === id));
      const saved = Shoot.setFloorNote(id, box ? box.value : noteDraft.get(id));
      if (saved && Shoot.floorNoteOf(saved) !== was) StudioUI.toast(Shoot.floorNoteOf(saved) ? 'Floor note saved.' : 'Floor note cleared.');
    }
    noteOpen = '';
    noteDraft.delete(id);
    render(sel('note-edit'));
    return;
  }
  if (act === 'take' || act === 'untake' || act === 'circle') {
    const id = el.getAttribute('data-scene');
    if (act === 'take') Shoot.logTake(id);
    else if (act === 'untake') Shoot.undoTake(id);
    else Shoot.circleTake(id, el.getAttribute('data-take'));
    /* The same button on the same scene: an undo with one take left is gone, so fall back to + Take. */
    const sel = (a, extra) => '[data-shoot-action="' + a + '"][data-scene="' + CSS.escape(id) + '"]' + (extra || '');
    render(act === 'circle' ? sel('circle', '[data-take="' + el.getAttribute('data-take') + '"]')
      : act === 'untake' ? sel('untake') + ',' + sel('take') : sel('take'));
    return;
  }
  if (act === 'locate') {
    const name = el.getAttribute('data-loc');
    if (!name || !('geolocation' in navigator)) return;
    el.disabled = true;
    navigator.geolocation.getCurrentPosition((pos) => {
      const r = (n) => String(Math.round(n * 1e6) / 1e6);
      Locations.setRecce(name, { lat: r(pos.coords.latitude), lng: r(pos.coords.longitude) });
      StudioUI.toast(name + ' pinned here, to about ' + Math.round(pos.coords.accuracy || 0) + ' m.');
      render();
    }, (err) => {
      el.disabled = false;
      StudioUI.toast(err && err.code === 1
        ? 'Location permission was refused. Paste a Maps link on the call sheet instead.'
        : 'This phone could not find where it is. Paste a Maps link on the call sheet instead.');
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
    return;
  }
  if (act === 'mark') {
    const id = el.getAttribute('data-scene');
    const btn = [...el.classList].find((c) => /^sd-(?!btn$)/.test(c));
    Shoot.mark(id, el.getAttribute('data-state') || '');
    /* The same state's button on the same scene: its data-state has
       flipped, so it is found by scene and class, not by state. */
    render('[data-shoot-action="mark"][data-scene="' + CSS.escape(id) + '"]' + (btn ? '.' + btn : ''));
  }
});

/* A note being typed survives a re-render caused by a tap elsewhere. */
delegate(document, 'input', '[data-shoot-note]', (e, el) => {
  noteDraft.set(el.getAttribute('data-shoot-note'), el.value);
});

render();
