/* ============================================================
   PLAN — the shooting calendar, the locations, the media index
   ------------------------------------------------------------
   Three more views of the ONE scene model (src/lib/scenes.js), plus
   the thin layer of its own that src/lib/locations.js owns. Scenes
   are READ here and never written: the breakdown owns what a scene
   is, the stripboard owns which day it falls on, and this page owns
   what date that day is, what the place is like, and where the
   reference material lives.

   That division is the whole design. A calendar that stored its own
   copy of "scene 14 is on day 3" would disagree with the stripboard
   the first time somebody moved a strip, and the user would have no
   way to tell which of the two was lying.

   WHAT THIS PAGE WRITES, IN FULL:
     · one date per shoot day number
     · one recce record per location NAME
     · a list of links the user pasted
   Nothing else. No scene, no page count, no cast list, no schedule.

   MEDIA IS AN INDEX, NOT A STORE, and the section says so on its
   face rather than in a tooltip. There is no server and no file
   storage in a local-first static app; a page that showed an upload
   button would be promising something it cannot do, and the first
   50MB of stills would take the whole project's localStorage down
   with it. Saying the limit out loud is cheaper than a user finding
   it out with their recce photographs.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/plan.css';

import StudioUI from '../ui/chrome.js';
import { filmPrefs } from '../lib/pdf.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import { pageHeader, statStrip, button } from '../ui/kit/index.js';
import { saveOnInput } from '../lib/autosave.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Locations, { PERMISSIONS } from '../lib/locations.js';
import Geo from '../lib/recce-geo.js';
import {
  permOf, prettyDate, weekdayOf, plural, pagesOf, slugOf, dateClashes, datedCount, dayWhen,
  orphanDateLabel, locationLight, lightTimes, lightFlagText, pinRefusal, dateReady, dateUnchanged,
  isOpenable, kindOptions, linkOptions, mediaLabel
} from '../lib/plan-model.js';
import { askDanger } from '../ui/dialog.js';
import { isDisabledEverywhere } from '../lib/plan-gate.js';

/* The film's date style (region), for the dates this page prints. */
const prefsNow = () => { try { return filmPrefs(); } catch (e) { return null; } };
const app = document.getElementById('app');

/* ---- header -------------------------------------------------- */
function renderHeader(scenes, days, locs, media) {
  const dated = datedCount(days);
  const head = pageHeader({
    class: 'bd-head',
    eyebrow: 'Plan \u00b7 dates, places, references',
    title: 'Locations & Shoot Calendar',
    sub: 'The schedule already exists \u2014 the stripboard made it. This page puts '
       + 'real dates on those shoot days, keeps a recce record for every place '
       + 'the script names, and indexes the reference material you have '
       + 'gathered. Not one scene is typed again here.',
    /* Stripboard, day out of days, calendar and locations read as one
       scheduling workspace: this is the way back to the board. */
    actions: [
      button({ label: '\u2190 Stripboard & DOOD', variant: 'secondary', size: 'sm', href: 'stripboard.html#stripboard', class: 'pl-back-sb' })
    ]
  });
  /* No scenes: a dash, as the stripboard prints, never a "0" that
     claims an empty schedule has been counted (item 48). */
  const none = !scenes.length;
  head.append(statStrip([
    { value: none ? '' : String(days.length), label: days.length === 1 ? 'shoot day' : 'shoot days', note: none ? 'no scenes yet' : '', class: 'pl-kpi-days' },
    { value: none ? '' : String(dated), label: dated === 1 ? 'date set' : 'dates set', attrs: { 'data-pl-dated': '' } },
    { value: none ? '' : String(locs.length), label: locs.length === 1 ? 'location' : 'locations' },
    /* The reference index is the Media module, off for every plan. */
    isDisabledEverywhere('media') ? null : { value: String(media.length), label: media.length === 1 ? 'reference' : 'references' }
  ].filter(Boolean), { label: 'The plan in figures' }));
  return head;
}

/* ---- the teaching empty state -------------------------------
   The same shape as breakdown.js and stripboard.js: an empty module
   explains what it is for rather than showing a blank grid. It cannot
   offer "add a day" or "add a location", because neither is a thing
   you add here — one is a scene's shootDay and the other is a scene's
   location. So it points at the two pages that do own them. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▦', 'aria-hidden': 'true' }),
    h('h2', { text: 'The Shoot Calendar needs a schedule first' }),
    h('p', {
      text: 'This page does not hold a schedule of its own. A shoot day is a number '
          + 'on a scene, and a location is the place typed on a scene — so both arrive '
          + 'here the moment they exist, and neither is ever typed twice.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Break the script down', 'List the scenes with INT/EXT, time, location and length. That is the breakdown page.'),
      how('2', 'Schedule them', 'Group the strips and hand each group a shoot day. That is the stripboard.'),
      how('3', 'Come back here', 'Put a real date on each day, write the recce up, and file the reference links.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why it works this way' }),
      h('span', {
        text: ' A production that keeps its dates in one document and its schedule '
            + 'in another spends the shoot reconciling them. Here the day numbers '
            + 'come from the board and only the dates live on this page, so the two '
            + 'cannot disagree.'
      })
    ]),
    h('div.pl-empty-acts', {}, [
      button({ href: 'breakdown.html#scenes', label: 'Add the scenes', iconAfter: 'arrow_forward', variant: 'primary', pill: true, class: 'bd-cta' }),
      button({ href: 'stripboard.html#stripboard', label: 'Schedule them', iconAfter: 'arrow_forward', class: 'bd-cta' })
    ])
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ============================================================
   1. THE CALENDAR
   ============================================================ */

function renderCalendar(scenes) {
  const wrap = h('section#calendar.pl-cal');
  wrap.append(
    h('h2.bd-h2', { text: 'Shoot Calendar' }),
    h('p.bd-sub', {
      text: 'One card per shoot day, in order, straight off the board. The date is '
          + 'the only thing this page saves — the scenes, the pages and the cast on '
          + 'each day are read back from the breakdown every time you open it.'
    })
  );

  if (!scenes.length) {
    wrap.append(renderEmpty());
    return wrap;
  }

  const days = Locations.calendarDays(scenes);
  const loose = Locations.unscheduledScenes(scenes);

  if (!days.length) {
    wrap.append(h('p.bd-none', {
      text: 'None of the ' + plural(scenes.length, 'scene', 'scenes') + ' has a shoot day yet. '
          + 'Give a strip a day on the stripboard — or use "Schedule by location" there — '
          + 'and the calendar fills itself in.'
    }), button({ href: 'stripboard.html#stripboard', label: 'Go to the stripboard', iconAfter: 'arrow_forward', class: 'pl-jump' }));
  } else {
    // A date used by two shoot days is almost always a slip, and the
    // only place it is visible is here. Counted once, read per card.
    const clashes = dateClashes(days);
    const grid = h('div.pl-days');
    days.forEach((d) => grid.append(renderDay(d, clashes)));
    wrap.append(grid);
  }

  const orphans = Locations.orphanDays(scenes);
  if (orphans.length) wrap.append(renderOrphanDays(orphans));

  if (loose.length) {
    wrap.append(h('div.pl-loose', {}, [
      h('h3.pl-loose-head', { text: plural(loose.length, 'scene', 'scenes') + ' not on any day' }),
      h('p.pl-loose-note', {
        text: 'They are in the script and they are counted in the page total, but no '
            + 'day carries them yet. Scheduling happens on the stripboard.'
      }),
      h('div.pl-chips', {}, loose.map((s) => h('span.pl-chip', {
        text: 'Sc ' + (s.number || '—'), title: slugOf(s)
      }))),
      button({ href: 'stripboard.html#stripboard', label: 'Schedule them', iconAfter: 'arrow_forward', class: 'pl-jump' })
    ]));
  }
  return wrap;
}

function renderDay(entry, clashes) {
  const card = h('article.pl-day', { 'data-day': String(entry.day) });

  card.append(h('div.pl-day-head', {}, [
    h('span.pl-day-no', { text: 'Day ' + entry.day }),
    h('label.pl-day-date', {}, [
      h('span.pl-flabel', { text: 'Date' }),
      dateInput(entry)
    ]),
    h('span.pl-day-when', { text: dayWhen(entry, clashes, prefsNow()) }),
    h('span.pl-day-meta', {
      text: plural(entry.scenes.length, 'scene', 'scenes') + ' · ' + pagesOf(entry.eighths)
    })
  ]));

  if (entry.locations.length) {
    card.append(h('div.pl-day-row', {}, [
      h('span.pl-rowlab', { text: entry.locations.length === 1 ? 'Location' : 'Locations' }),
      h('div.pl-chips', {}, entry.locations.map((n) => h('span.pl-chip.is-loc', { text: n })))
    ]));
  }
  card.append(h('div.pl-day-row', {}, [
    h('span.pl-rowlab', { text: 'Cast' }),
    entry.cast.length
      ? h('div.pl-chips', {}, entry.cast.map((n) => h('span.pl-chip', { text: n })))
      : h('span.pl-none-inline', {
        text: 'No cast tagged on these scenes — tag them in the breakdown and they appear here.'
      })
  ]));

  card.append(dayTable(entry));
  return card;
}

/** The date field. The one control on the calendar that writes. */
function dateInput(entry) {
  const input = h('input.pl-date', {
    type: 'date',
    'data-day-field': 'date',
    'aria-label': 'Calendar date for shoot day ' + entry.day
  });
  input.value = entry.date || '';
  return input;
}

function dayTable(entry) {
  /* .scene-table scrolls sideways when it must, so it is focusable and
     named for a keyboard reader. Below 720px plan.css drops I/E and
     Location (the card's chips already say where) so it rarely does. */
  const table = h('table.scene-table.pl-table', { tabindex: '0', 'aria-label': 'Scenes on shoot day ' + entry.day });
  const thead = h('thead');
  const hr = h('tr');
  [['Sc'], ['I/E', 'pl-ie'], ['Location', 'pl-where'], ['Time'], ['Pages'], ['What happens']].forEach(([label, cls]) =>
    hr.append(h('th', { scope: 'col', text: label, ...(cls ? { class: cls } : {}) })));
  thead.append(hr);

  const tbody = h('tbody');
  entry.scenes.forEach((scene, i) => {
    const tr = h('tr');
    tr.append(
      h('td.num', { text: scene.number || String(i + 1) }),
      h('td.pl-ie', { text: scene.intExt }),
      h('td.pl-where', { text: Locations.locationName(scene) || 'Location TBC' }),
      h('td.pl-tod', { text: scene.dayNight }),
      h('td.pl-pages', { text: formatEighths(scene.eighths) }),
      h('td.pl-what', { text: scene.synopsis || '—' })
    );
    tbody.append(tr);
  });
  table.append(thead, tbody);
  return table;
}

/* A date left behind by a day that no longer has scenes. Shown rather
   than swept: it may be the only record that the unit is booked. */
function renderOrphanDays(orphans) {
  const block = h('div.pl-orphans');
  block.append(
    h('h3.pl-loose-head', { text: 'Dates with no scenes' }),
    h('p.pl-loose-note', {
      text: 'These shoot days had scenes when the date was set and do not now. '
          + 'Nothing was deleted for you — clear a date once you are sure.'
    })
  );
  orphans.forEach((o) => block.append(h('div.pl-orphan', { 'data-day': String(o.day) }, [
    h('span.pl-chip', { text: 'Day ' + o.day }),
    h('span.pl-orphan-date', { text: orphanDateLabel(o, prefsNow()) }),
    h('button.bd-icon.is-danger', {
      type: 'button', 'data-action': 'day-clear',
      title: 'Clear this date', 'aria-label': 'Clear the date on shoot day ' + o.day, text: '✕'
    })
  ])));
  return block;
}

/* ============================================================
   2. LOCATIONS
   ============================================================ */

function renderLocations(scenes) {
  const wrap = h('section#locations.pl-locs');
  wrap.append(
    h('h2.bd-h2', { text: 'Locations' }),
    h('p.bd-sub', {
      text: 'Every place the script names, derived from the scenes — there is no '
          + '"add a location" here, because a location is where a scene happens. '
          + 'What this page keeps is the recce: how to get in, who to ask, and what '
          + 'is missing when you do.'
    })
  );

  if (!scenes.length) {
    wrap.append(h('p.bd-none', {
      text: 'No scenes yet, so no locations. Type a place on a scene in the breakdown '
          + 'and a recce card appears here with the scenes already attached.'
    }), button({ href: 'breakdown.html#scenes', label: 'Go to the breakdown', iconAfter: 'arrow_forward', class: 'pl-jump' }));
    return wrap;
  }

  const locs = Locations.locationIndex(scenes);
  const unplaced = Locations.unplacedScenes(scenes);

  if (!locs.length) {
    wrap.append(h('p.bd-none', {
      text: 'None of the ' + plural(scenes.length, 'scene', 'scenes') + ' has a location typed on it '
          + 'yet. Fill in the location field on a scene and its recce card appears here.'
    }));
  } else {
    const grid = h('div.pl-loc-grid');
    locs.forEach((loc) => grid.append(renderLocation(loc)));
    wrap.append(grid);
  }

  if (unplaced.length) {
    wrap.append(h('div.pl-loose', {}, [
      h('h3.pl-loose-head', { text: plural(unplaced.length, 'scene', 'scenes') + ' with no location' }),
      h('p.pl-loose-note', {
        text: 'A scene with no place cannot be scouted, scheduled by location or put on '
            + 'a call sheet. The field is on the scene, in the breakdown.'
      }),
      h('div.pl-chips', {}, unplaced.map((s) => h('span.pl-chip', {
        text: 'Sc ' + (s.number || '—'),
        title: s.synopsis || slugOf(s)
      }))),
      button({ href: 'breakdown.html#scenes', label: 'Go to the breakdown', iconAfter: 'arrow_forward', class: 'pl-jump' })
    ]));
  }

  const orphans = Locations.orphanRecces(scenes);
  if (orphans.length) wrap.append(renderOrphanRecces(orphans));
  return wrap;
}

function renderLocation(loc) {
  const perm = permOf(loc.recce.permission);
  const card = h('article.pl-loc.hue-plan.perm-' + perm.tone, {
    'data-loc': loc.key, 'data-locname': loc.name
  });

  card.append(h('div.pl-loc-head', {}, [
    h('h3.pl-loc-name', { text: loc.name }),
    h('span.pl-perm-chip', { text: perm.label }),
    h('span.pl-loc-meta', {
      text: plural(loc.scenes.length, 'scene', 'scenes') + ' · ' + pagesOf(loc.eighths)
    })
  ]));

  const dayChips = h('div.pl-chips');
  loc.days.forEach((d) => dayChips.append(h('span.pl-chip.is-day', { text: 'Day ' + d })));
  if (loc.unscheduled) {
    dayChips.append(h('span.pl-chip.is-open', {
      text: plural(loc.unscheduled, 'scene', 'scenes') + ' unscheduled'
    }));
  }
  card.append(h('div.pl-day-row', {}, [
    h('span.pl-rowlab', { text: 'Days' }),
    loc.days.length || loc.unscheduled
      ? dayChips
      : h('span.pl-none-inline', { text: 'Not on the board yet.' })
  ]));

  card.append(renderLight(loc));

  const grid = h('div.pl-recce');
  grid.append(
    labelled('Address', textField('address', loc.recce.address, 'Where the van goes — a pin, a landmark, a street')),
    labelled('Who to ask', textField('contact', loc.recce.contact, 'Owner, caretaker, office — and a number')),
    labelled('Permission', permSelect(loc.recce.permission)),
    labelled('Best time of day', textField('bestTime', loc.recce.bestTime, 'Before 9am · after the market closes · golden hour')),
    labelled('Power', textField('power', loc.recce.power, 'Mains on site? How far is the point? Genny needed?')),
    labelled('Parking', textField('parking', loc.recce.parking, 'Where the unit parks, and how far the carry is')),
    labelled('Toilets', textField('toilets', loc.recce.toilets, 'On site, next door, or bring one')),
    labelled('Map pin', pinField(loc.recce)),
    labelled('Nearest hospital', textField('hospital', loc.recce.hospital, 'Name, distance, casualty phone')),
    labelled('Nearest police station', textField('police', loc.recce.police, 'Station, and its number')),
    labelled('Cost', textField('cost', loc.recce.cost, 'Per day, plus whatever they actually meant'))
  );
  card.append(grid);

  const notes = h('textarea.pl-notes', {
    rows: '2',
    placeholder: 'Anything the recce turned up — noise, light, neighbours, the stairs.',
    'data-recce-field': 'notes',
    'aria-label': 'Recce notes for ' + loc.name
  });
  notes.value = loc.recce.notes;
  card.append(labelled('Notes', notes));

  card.append(h('div.pl-loc-scenes', {}, [
    h('span.pl-rowlab', { text: 'Scenes here' }),
    h('div.pl-chips', {}, loc.scenes.map((s) => h('span.pl-chip', {
      text: 'Sc ' + (s.number || '—') + ' · ' + s.intExt + ' ' + s.dayNight,
      title: s.synopsis || slugOf(s)
    })))
  ]));
  return card;
}

/* ---- the light on a recce card ---------------------------------
   The figures are locationLight() in src/lib/plan-model.js — derived on
   render, stored nowhere. A location with no pin gets no times and no
   guess: the pin field is a few rows down. */
function renderLight(loc) {
  const wrap = h('div.pl-light');
  const { out, days } = locationLight(loc);
  if (!days.length) return wrap;
  const anyDate = days.some((d) => d.date);
  if (!out.pinned) {
    if (anyDate) wrap.append(h('p.pl-light-note', { text: 'Add a map pin below to see sunrise and sunset on this location’s shoot days.' }));
    return wrap;
  }
  if (!out.rows.length) {
    wrap.append(h('p.pl-light-note', { text: 'Give this location’s shoot days a date above, and its sunrise and sunset appear here.' }));
    return wrap;
  }
  wrap.append(h('span.pl-rowlab', { text: 'Daylight' }));
  const list = h('ul.pl-light-list');
  out.rows.forEach((r) => {
    const li = h('li.pl-light-row', { 'data-light-day': String(r.day) }, [
      h('strong', { text: 'Day ' + r.day + ' · ' + weekdayOf(r.date).slice(0, 3) + ' ' + prettyDate(r.date, prefsNow()) }),
      h('span.pl-light-times', { text: lightTimes(r.light) })
    ]);
    if (r.flag) {
      li.append(h('p.pl-light-flag', {
        role: 'note',
        text: lightFlagText(r.day, r.flag)
      }));
    }
    list.append(li);
  });
  wrap.append(list);
  return wrap;
}

/* Repaint every card's light block in place: a date or a pin changed
   somewhere else on the page, and rebuilding the cards would take the
   caret out of whatever field is being typed in. */
function patchLight() {
  const scenes = Scenes.listScenes();
  const index = new Map(Locations.locationIndex(scenes).map((l) => [l.key, l]));
  document.querySelectorAll('.pl-loc[data-loc]').forEach((card) => {
    const loc = index.get(card.dataset.loc);
    const old = card.querySelector('.pl-light');
    if (loc && old) old.replaceWith(renderLight(loc));
  });
}

function labelled(label, control) {
  const kids = [h('span.pl-flabel', { text: label }), control];
  /* A one-line input cannot wrap on paper and prints its placeholder when
     empty, so a recce answer was cut mid-sentence and an example printed
     as a fact. Print shows this mirror instead (plan.css, section 6);
     it is kept in step by the `mirrorPrint` listeners below. */
  if (control.classList && control.classList.contains('pl-input')) {
    kids.push(h('span.pl-print', { 'aria-hidden': 'true', text: control.value }));
  }
  return h('label.pl-field', {}, kids);
}
/* Keep a field's print mirror equal to what is typed. */
const mirrorPrint = (e, el) => {
  const m = el.nextElementSibling;
  if (m && m.classList.contains('pl-print')) m.textContent = el.value;
};
delegate(document, 'input', '.pl-input', mirrorPrint);
delegate(document, 'change', '.pl-input', mirrorPrint);

function pinField(recce) {
  const pin = Geo.coordsOf(recce);
  const el = h('input.pl-input', {
    type: 'text', placeholder: 'Paste a Google Maps link, or 13.0827, 80.2707',
    'data-recce-geo': '1', 'aria-label': 'Map pin: a Maps link or latitude and longitude'
  });
  el.value = pin ? pin.lat + ', ' + pin.lng : '';
  return el;
}

function textField(name, value, placeholder) {
  const el = h('input.pl-input', {
    type: 'text', placeholder, 'data-recce-field': name
  });
  /* No aria-label: the wrapping label.pl-field names it. A placeholder
     as the accessible name hid the visible label (WCAG 2.5.3). */
  el.value = value || '';
  return el;
}

function permSelect(value) {
  const sel = h('select.pl-sel', {
    'data-recce-field': 'permission', 'aria-label': 'Permission status'
  });
  PERMISSIONS.forEach((p) => {
    const opt = h('option', { value: p.id, text: p.label });
    if (p.id === value) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

function renderOrphanRecces(orphans) {
  const block = h('div.pl-orphans');
  block.append(
    h('h3.pl-loose-head', { text: 'Recce notes with no scenes' }),
    h('p.pl-loose-note', {
      text: 'No scene names these places any more — they were renamed in the breakdown, '
          + 'or their last scene went. The notes were kept rather than quietly dropped; '
          + 'rename the scene back to recover them, or discard them here.'
    })
  );
  orphans.forEach((o) => block.append(h('div.pl-orphan', { 'data-loc': o.key }, [
    h('span.pl-chip.is-loc', { text: o.key }),
    h('span.pl-orphan-date', { text: o.recce.address || o.recce.contact || permOf(o.recce.permission).label }),
    h('button.bd-icon.is-danger', {
      type: 'button', 'data-action': 'recce-del',
      title: 'Discard these notes', 'aria-label': 'Discard the recce notes for ' + o.key, text: '✕'
    })
  ])));
  return block;
}

/* ============================================================
   3. MEDIA — an index, and it says so
   ============================================================ */

function renderMedia(scenes, media) {
  const wrap = h('section#media.pl-media-sec');
  wrap.append(
    h('h2.bd-h2', { text: 'Reference Media' }),
    h('p.bd-sub', {
      text: 'Recce photographs, a lookbook, a location video, the sound reference — '
          + 'wherever they already live, listed in one place and attached to the day '
          + 'or the location they belong to.'
    }),
    honestNote()
  );

  if (!media.length) {
    wrap.append(h('p.bd-none', {
      text: 'Nothing indexed yet. Paste the link to a folder of recce photographs, or '
          + 'to the lookbook, give it a title, and say which location or which day it '
          + 'belongs to.'
    }));
  } else {
    media.forEach((item) => wrap.append(renderMediaItem(item, scenes)));
  }

  wrap.append(button({ label: '+  Add a reference', action: 'media-add', class: 'pl-add' }));
  return wrap;
}

/* The limit, in plain words, on the page rather than in a tooltip. */
function honestNote() {
  return h('div.pl-honest', {}, [
    h('p.bd-eyebrow', { text: 'What this is, and what it is not' }),
    h('p', {
      text: 'The studio runs entirely in this browser. There is no server behind it and '
          + 'nowhere for a file to go, so nothing here uploads and nothing is copied. '
          + 'Your photographs and cuts stay wherever you already keep them — a drive, a '
          + 'phone, a folder on the edit machine, a shared link.'
    }),
    h('p', {
      text: 'What is saved is the title, the link, the kind and your note. This is an '
          + 'index of where the material is, not a store of the material itself, and a '
          + 'link that stops working is a link you will have to fix at the source.'
    })
  ]);
}

function renderMediaItem(item, scenes) {
  const card = h('article.pl-media', { 'data-media': item.id });

  const title = h('input.pl-media-title', {
    type: 'text', placeholder: 'What is it? — "Perambur house, recce 12 Jan"',
    'data-media-field': 'title', 'aria-label': 'Reference title'
  });
  title.value = item.title;

  card.append(h('div.pl-media-bar', {}, [
    title,
    kindSelect(item.kind),
    linkSelect(item.linkedTo, scenes),
    h('button.bd-icon.is-danger', {
      type: 'button', 'data-action': 'media-del',
      title: 'Remove this reference', 'aria-label': 'Remove this reference', text: '✕'
    })
  ]));

  const url = h('input.pl-media-url', {
    type: 'url', placeholder: 'https://… or the path where the file lives',
    'data-media-field': 'url', 'aria-label': 'Link to the material'
  });
  url.value = item.url;
  card.append(h('div.pl-media-link', {}, [url, openLink(item.url)]));

  const notes = h('input.pl-media-notes', {
    type: 'text', placeholder: 'Note — what to look at, who shot it, what it is for',
    'data-media-field': 'notes', 'aria-label': 'Note on this reference'
  });
  notes.value = item.notes;
  card.append(notes);
  return card;
}

/* Only an http(s) link is offered as clickable (isOpenable, plan-model.js). */
function openLink(url) {
  const ok = isOpenable(url);
  const a = h('a.pl-media-open', {
    href: ok ? String(url).trim() : '#',
    target: '_blank', rel: 'noopener noreferrer',
    text: 'Open  ↗'
  });
  if (!ok) { a.hidden = true; a.removeAttribute('href'); }
  return a;
}

function kindSelect(value) {
  const sel = h('select.pl-sel', { 'data-media-field': 'kind', 'aria-label': 'Kind of material' });
  kindOptions(value).forEach((k) => {
    const opt = h('option', { value: k, text: k });
    if (k === value) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

/** What this reference is about. Stores a token — 'loc:<key>' or
    'day:<n>' — never a copy of the name, so renaming a location in
    the breakdown renames it on every link that points at it. */
function linkSelect(value, scenes) {
  const sel = h('select.pl-sel', { 'data-media-field': 'linkedTo', 'aria-label': 'What this belongs to' });
  // A token pointing at something that has gone stays selectable and
  // says so, rather than silently resetting the user's choice to none.
  linkOptions(value, scenes).forEach((o) => {
    const opt = h('option', { value: o.value, text: o.label });
    if (o.value === value) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

/* ---- render --------------------------------------------------- */
function render() {
  const scenes = Scenes.listScenes();
  const media = Locations.listMedia();
  const days = scenes.length ? Locations.calendarDays(scenes) : [];
  const locs = scenes.length ? Locations.locationIndex(scenes) : [];

  const main = h('main', { id: 'main' });
  main.append(
    renderHeader(scenes, days, locs, media),
    renderCalendar(scenes),
    renderLocations(scenes),
    renderMedia(scenes, media)
  );

  app.replaceChildren(main);
  mountShell();
  // Chrome initialises at import time, when #app is still empty — the
  // trap short.js fell into. Re-init after every render.
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[plan] chrome', e); }
}

/* Repaint one section. A full render on every keystroke-committing
   change would be correct and unpleasant: it throws away the caret
   and, on a date field, the open picker. */
let refreshing = false;
function refreshCalendar(focusDay) {
  const old = document.getElementById('calendar');
  // Replacing the section blurs whatever was focused inside it, and a
  // blur can land back here. A node that has already left the tree
  // cannot be replaced, so the nested call stands down (UX audit H6).
  if (!old || !old.isConnected || !old.parentNode || refreshing) return;
  refreshing = true;
  try { old.replaceWith(renderCalendar(Scenes.listScenes())); }
  finally { refreshing = false; }
  if (focusDay) {
    const next = document.querySelector('.pl-day[data-day="' + focusDay + '"] .pl-date');
    if (next) next.focus();
  }
  try { StudioUI.autoAriaLabels(); } catch (e) { /* chrome may not be up */ }
}

/* ---- events — delegated, no inline handlers -------------------
   NOTHING below runs during a render, which is what keeps the
   four-seconds-of-idle assertion in `npm run verify` honest: every
   localStorage write on this page is on the far side of a user
   gesture. */
const dayOf = (el) => parseInt(el.closest('[data-day]')?.dataset.day, 10) || 0;
const locNameOf = (el) => el.closest('[data-locname]')?.dataset.locname || '';
const locKeyOf = (el) => el.closest('[data-loc]')?.dataset.loc || '';
const mediaIdOf = (el) => el.closest('[data-media]')?.dataset.media || '';

/* The date field (UX audit H6). A typed date is three segments, and
   Chromium fires `change` after EVERY segment once the field holds a
   value — so the old handler, which saved and rebuilt the calendar on
   each one, replaced the input under the caret, put the caret back on
   the month and read the next digits as a new month: typing 03152026
   stored 2024-06-12, and the blur from the replaced node re-entered
   the rebuild and threw.

   So the input is never rebuilt while it is being typed in. A value is
   saved only when it is a complete date (a year still being typed
   reads as 0002, 0020, 0202 on the way to 2026 and is not one), an
   empty value only once the field is left, and what depends on the
   dates — each card's weekday and clash note, the "dates set" count —
   is patched in place around it. */
function commitDate(el, leaving) {
  const day = dayOf(el);
  if (!day) return;
  const value = el.value || '';
  if (!dateReady(value, leaving)) return;
  if (dateUnchanged(day, value)) return;
  Locations.setDayDate(day, value);
  patchCalendarDates();
  patchLight();
}

function patchCalendarDates() {
  const days = Locations.calendarDays(Scenes.listScenes());
  const clashes = dateClashes(days);
  days.forEach((d) => {
    const when = document.querySelector('.pl-day[data-day="' + d.day + '"] .pl-day-when');
    if (when) when.textContent = dayWhen(d, clashes, prefsNow());
  });
  const dated = datedCount(days);
  document.querySelectorAll('.bd-head [data-pl-dated]').forEach((st) => {
    st.querySelector('.k-stat-value').textContent = String(dated);
    st.querySelector('.k-stat-label').textContent = dated === 1 ? 'date set' : 'dates set';
  });
}

delegate(document, 'change', '[data-day-field="date"]', (e, el) => {
  commitDate(el, document.activeElement !== el);
});
delegate(document, 'focusout', '[data-day-field="date"]', (e, el) => commitDate(el, true));
delegate(document, 'keydown', '[data-day-field="date"]', (e, el) => {
  if (e.key === 'Enter') commitDate(el, true);
});

delegate(document, 'click', '[data-action="day-clear"]', (e, el) => {
  const day = dayOf(el);
  if (!day) return;
  const was = Locations.dayDate(day);
  /* The next orphan row, else the first date box: focus stays on the
     calendar rather than falling to <body> with the row it was on. */
  const rows = [...document.querySelectorAll('.pl-orphan[data-day]')];
  const at = rows.indexOf(el.closest('.pl-orphan'));
  const nb = rows[at + 1] || rows[at - 1];
  const nextDay = nb ? nb.dataset.day : '';
  Locations.setDayDate(day, '');
  refreshCalendar();
  patchLight();
  const focusFirst = (sels) => { for (const q of sels) { const n = document.querySelector(q); if (n) { n.focus(); return; } } };
  focusFirst([nextDay ? '.pl-orphan[data-day="' + nextDay + '"] [data-action="day-clear"]' : '', '#calendar .pl-date'].filter(Boolean));
  if (was) StudioUI.toast('Cleared the date on Day ' + day + '.', {
    action: 'Undo',
    onAction: () => {
      Locations.setDayDate(day, was);
      refreshCalendar();
      patchLight();
      focusFirst(['.pl-orphan[data-day="' + day + '"] [data-action="day-clear"]']);
      StudioUI.toast('Put the date on Day ' + day + ' back.');
    }
  });
});

delegate(document, 'change', '[data-recce-field]', (e, el) => {
  const name = locNameOf(el);
  if (!name) return;
  const key = el.dataset.recceField;
  Locations.setRecce(name, { [key]: el.value });
  // Permission is the only recce field anything else reads. Swap the
  // card's tone class in place rather than rebuilding eight inputs
  // the user may be halfway through.
  if (key !== 'permission') return;
  const card = el.closest('.pl-loc');
  if (!card) return;
  const perm = permOf(el.value);
  PERMISSIONS.forEach((p) => card.classList.remove('perm-' + p.tone));
  card.classList.add('perm-' + perm.tone);
  const chip = card.querySelector('.pl-perm-chip');
  if (chip) chip.textContent = perm.label;
});

/* Typed text saves as it is typed, not only when the field is left —
   a reload or a closed tab used to take it (UX audit H10). The store
   write only; the in-place patches stay on `change`. */
delegate(document, 'change', '[data-recce-geo]', (e, el) => {
  const name = locNameOf(el);
  if (!name) return;
  const text = el.value.trim();
  if (!text) { Locations.setRecce(name, { lat: '', lng: '' }); el.removeAttribute('aria-invalid'); patchLight(); return; }
  const at = Geo.parseLatLng(text);
  if (!at) {
    el.setAttribute('aria-invalid', 'true');
    el.title = pinRefusal(text);
    return;
  }
  el.removeAttribute('aria-invalid'); el.removeAttribute('title');
  Locations.setRecce(name, { lat: String(at.lat), lng: String(at.lng) });
  el.value = at.lat + ', ' + at.lng;
  patchLight();
});

saveOnInput('[data-recce-field]', (el) => {
  const name = locNameOf(el);
  if (name) Locations.setRecce(name, { [el.dataset.recceField]: el.value });
});
saveOnInput('[data-media-field]', (el) => {
  const id = mediaIdOf(el);
  if (id) Locations.updateMedia(id, { [el.dataset.mediaField]: el.value });
});

delegate(document, 'click', '[data-action="recce-del"]', async (e, el) => {
  const key = locKeyOf(el);
  if (!key) return;
  if (!await askDanger('Discard the recce notes for "' + key + '"? No scene points at this place any more, and this cannot be undone.')) return;
  Locations.removeRecce(key);
  render();
});

delegate(document, 'click', '[data-action="media-add"]', () => {
  Locations.addMedia();
  render();
  const last = document.querySelector('.pl-media:last-of-type .pl-media-title');
  if (last) last.focus();
});

delegate(document, 'click', '[data-action="media-del"]', async (e, el) => {
  const id = mediaIdOf(el);
  if (!id) return;
  const label = mediaLabel(id);
  if (!await askDanger('Remove the reference' + label + '? The file itself is wherever you keep it and is untouched.')) return;
  Locations.removeMedia(id);
  render();
});

delegate(document, 'change', '[data-media-field]', (e, el) => {
  const id = mediaIdOf(el);
  if (!id) return;
  Locations.updateMedia(id, { [el.dataset.mediaField]: el.value });
  // The Open link is the only thing derived from a media field. Fix it
  // where it stands; nothing else on the card needs rebuilding.
  if (el.dataset.mediaField !== 'url') return;
  const card = el.closest('.pl-media');
  const link = card && card.querySelector('.pl-media-open');
  if (link) link.replaceWith(openLink(el.value));
});

render();
