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

const app = document.getElementById('app');

/* The open day. Held in memory only: which day somebody is looking
   at is not a fact about the film, and `verify` asserts zero idle
   localStorage writes — a page that persisted its own scroll
   position would trip it, correctly. */
let openDay = null;

/* ---- pieces -------------------------------------------------- */

function slug(s) {
  const parts = [s.intExt, s.location || 'NO LOCATION'].filter(Boolean).join(' ');
  return parts + (s.dayNight ? ' — ' + s.dayNight : '');
}

function castChips(scene) {
  const cast = Locations.castOf(scene);
  if (!cast.length) return h('p.sd-cast.is-none', { text: 'No cast tagged' });
  const wrap = h('p.sd-cast');
  cast.forEach((n) => wrap.append(h('span.sd-chip', { text: n })));
  return wrap;
}

function sceneCard(scene) {
  const state = scene.shotState || '';
  const card = h('article.sd-card' + (state ? '.is-' + state : ''));

  const head = h('div.sd-head');
  head.append(h('span.sd-num', { text: scene.number || '—' }));
  head.append(h('h3.sd-slug', { text: slug(scene) }));
  card.append(head);

  const meta = h('p.sd-meta');
  meta.append(h('span', { text: formatEighths(scene.eighths || 0) + ' pages' }));
  if (state) meta.append(h('span.sd-state', { text: Scenes.shotLabel(state) }));
  card.append(meta);

  if (String(scene.synopsis || '').trim()) {
    card.append(h('p.sd-syn', { text: scene.synopsis }));
  }
  card.append(castChips(scene));

  /* One row of big targets. `aria-pressed` rather than a disabled
     button for the active one, because the state IS the control:
     tapping the live state again clears it, which is how somebody
     undoes a mis-tap without hunting for a reset. */
  const row = h('div.sd-actions', { role: 'group', 'aria-label': 'Mark scene ' + (scene.number || '') });
  SHOT_STATES.forEach((s) => {
    row.append(h('button.btn.sd-btn.sd-' + s.id + (state === s.id ? '.is-on' : ''), {
      type: 'button',
      'data-shoot-action': 'mark',
      'data-scene': scene.id,
      'data-state': state === s.id ? '' : s.id,
      'aria-pressed': String(state === s.id),
      text: s.label
    }));
  });
  card.append(row);
  return card;
}

/* ---- the page ------------------------------------------------ */

function renderEmpty(reason) {
  const main = h('main#main.sd-main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Shoot · today' }),
    h('h1.bd-title', { text: 'Shoot day.' }),
    h('p.bd-deck', { text: reason })
  ]));
  return main;
}

function render() {
  const scenes = Scenes.listScenes();
  if (!scenes.length) {
    app.replaceChildren(renderEmpty(
      'No scenes yet. Break the script down first and the day builds itself — '
      + 'this page is a view of the scene list, not a second copy of it.'));
    after();
    return;
  }

  const all = Shoot.days(scenes);
  if (!all.length) {
    app.replaceChildren(renderEmpty(
      'No scene is on a shoot day yet. Put them on days in the stripboard and '
      + 'they appear here, in the order you scheduled them.'));
    after();
    return;
  }

  if (openDay === null || !all.some((d) => d.day === openDay)) openDay = Shoot.pickDay(scenes);
  const day = all.find((d) => d.day === openDay) || all[0];
  const overall = Shoot.overall(scenes);

  const main = h('main#main.sd-main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Shoot · today' }),
    h('h1.bd-title', { text: 'Day ' + day.day + '.' }),
    h('p.bd-deck', {
      text: day.date
        ? day.date
        : 'This day has no date yet — set one in the stripboard and the page can find it on the morning.'
    })
  ]));

  /* The two numbers somebody actually wants: how much of today is
     done, and how much of the film is. Pages rather than scene
     counts, because a schedule is built in eighths. */
  const stats = h('div.sd-stats');
  stats.append(h('div.sd-stat', {}, [
    h('strong', { text: day.done + ' / ' + day.scenes.length }),
    h('span', { text: 'scenes today' })
  ]));
  stats.append(h('div.sd-stat', {}, [
    h('strong', { text: day.pagesDone + ' / ' + day.pagesTotal }),
    h('span', { text: 'pages today' })
  ]));
  stats.append(h('div.sd-stat', {}, [
    h('strong', { text: overall.done + ' / ' + overall.scenes }),
    h('span', { text: 'scenes in the film' })
  ]));
  main.append(stats);

  if (day.locations.length) {
    main.append(h('p.sd-where', { text: day.locations.join(' · ') }));
  }

  /* Day switcher. Every day, not a prev/next pair: an AD jumping to
     Friday should not tap through Wednesday. */
  const nav = h('nav.sd-days', { 'aria-label': 'Shoot days' });
  all.forEach((d) => {
    nav.append(h('button.btn.sd-day' + (d.day === day.day ? '.is-on' : '')
                 + (d.complete ? '.is-done' : ''), {
      type: 'button',
      'data-shoot-action': 'day',
      'data-day': String(d.day),
      'aria-current': d.day === day.day ? 'true' : 'false',
      text: 'D' + d.day
    }));
  });
  main.append(nav);

  const list = h('div.sd-list');
  day.scenes.forEach((s) => list.append(sceneCard(s)));
  main.append(list);

  app.replaceChildren(main);
  after();
}

function after() {
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
    render();
    return;
  }
  if (act === 'mark') {
    Shoot.mark(el.getAttribute('data-scene'), el.getAttribute('data-state') || '');
    render();
  }
});

render();
