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
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, { formatEighths, totalEighths } from '../lib/scenes.js';
import Locations, { PERMISSIONS, MEDIA_KINDS } from '../lib/locations.js';

const app = document.getElementById('app');

const permById = Object.fromEntries(PERMISSIONS.map((p) => [p.id, p]));
const permOf = (id) => permById[id] || PERMISSIONS[0];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/* '2026-01-12' → '12 January 2026'. Built by hand from the string, the
   same way contacts.js does it: a shoot date is a wall-clock day, and
   parsing it into an instant is how it lands a timezone away. */
function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

/* The weekday IS worth computing — a shoot day that lands on a Sunday
   costs a different amount. UTC throughout so the arithmetic cannot
   drift across a date boundary. */
function weekdayOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? '' : WEEKDAYS[d.getUTCDay()];
}

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);
const pagesOf = (e) => formatEighths(e) + ' ' + (e === 8 ? 'page' : 'pages');
const slugOf = (scene) => scene.intExt + '. ' + (Locations.locationName(scene) || 'Location TBC')
  + ' — ' + scene.dayNight;

/* ---- header -------------------------------------------------- */
function renderHeader(scenes, days, locs, media) {
  const dated = days.filter((d) => d.date).length;
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Plan · dates, places, references' }),
    h('h1.bd-title', { text: 'Calendar & Locations.' }),
    h('p.bd-deck', {
      text: 'The schedule already exists — the stripboard made it. This page puts '
          + 'real dates on those shoot days, keeps a recce record for every place '
          + 'the script names, and indexes the reference material you have '
          + 'gathered. Not one scene is typed again here.'
    }),
    h('div.bd-stats', {}, [
      stat(String(days.length), days.length === 1 ? 'shoot day' : 'shoot days'),
      stat(String(dated), dated === 1 ? 'date set' : 'dates set'),
      stat(String(locs.length), locs.length === 1 ? 'location' : 'locations'),
      stat(String(media.length), media.length === 1 ? 'reference' : 'references')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state -------------------------------
   The same shape as breakdown.js and stripboard.js: an empty module
   explains what it is for rather than showing a blank grid. It cannot
   offer "add a day" or "add a location", because neither is a thing
   you add here — one is a scene's shootDay and the other is a scene's
   location. So it points at the two pages that do own them. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▦', 'aria-hidden': 'true' }),
    h('h2', { text: 'A calendar needs a schedule first' }),
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
      h('a.btn.primary.bd-cta', { href: 'breakdown.html#scenes', text: 'Add the scenes  →' }),
      h('a.btn.pl-alt.bd-cta', { href: 'stripboard.html#stripboard', text: 'Schedule them  →' })
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
    h('h2.bd-h2', { text: 'Shooting calendar' }),
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
    }), h('a.btn.pl-jump', { href: 'stripboard.html#stripboard', text: 'Go to the stripboard  →' }));
  } else {
    // A date used by two shoot days is almost always a slip, and the
    // only place it is visible is here. Counted once, read per card.
    const clashes = new Map();
    days.filter((d) => d.date).forEach((d) => clashes.set(d.date, (clashes.get(d.date) || 0) + 1));
    days.forEach((d) => wrap.append(renderDay(d, clashes)));
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
      h('a.btn.pl-jump', { href: 'stripboard.html#stripboard', text: 'Schedule them  →' })
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
    h('span.pl-day-when', { text: dayWhen(entry, clashes) }),
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

function dayWhen(entry, clashes) {
  if (!entry.date) return 'No date yet';
  const parts = [weekdayOf(entry.date), prettyDate(entry.date)].filter(Boolean);
  const shared = clashes && clashes.get(entry.date) > 1;
  return parts.join(' · ') + (shared ? ' · shared with another day' : '');
}

function dayTable(entry) {
  const table = h('table.scene-table.pl-table');
  const thead = h('thead');
  const hr = h('tr');
  ['Sc', 'I/E', 'Location', 'Time', 'Pages', 'What happens'].forEach((label) =>
    hr.append(h('th', { scope: 'col', text: label })));
  thead.append(hr);

  const tbody = h('tbody');
  entry.scenes.forEach((scene, i) => {
    const tr = h('tr');
    tr.append(
      h('td.num', { text: scene.number || String(i + 1) }),
      h('td.pl-ie', { text: scene.intExt }),
      h('td', { text: Locations.locationName(scene) || 'Location TBC' }),
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
    h('span.pl-orphan-date', { text: [weekdayOf(o.date), prettyDate(o.date)].filter(Boolean).join(' · ') || o.date }),
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
    }), h('a.btn.pl-jump', { href: 'breakdown.html#scenes', text: 'Go to the breakdown  →' }));
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
    locs.forEach((loc) => wrap.append(renderLocation(loc)));
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
      h('a.btn.pl-jump', { href: 'breakdown.html#scenes', text: 'Go to the breakdown  →' })
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

  const grid = h('div.pl-recce');
  grid.append(
    labelled('Address', textField('address', loc.recce.address, 'Where the van goes — a pin, a landmark, a street')),
    labelled('Who to ask', textField('contact', loc.recce.contact, 'Owner, caretaker, office — and a number')),
    labelled('Permission', permSelect(loc.recce.permission)),
    labelled('Best time of day', textField('bestTime', loc.recce.bestTime, 'Before 9am · after the market closes · golden hour')),
    labelled('Power', textField('power', loc.recce.power, 'Mains on site? How far is the point? Genny needed?')),
    labelled('Parking', textField('parking', loc.recce.parking, 'Where the unit parks, and how far the carry is')),
    labelled('Toilets', textField('toilets', loc.recce.toilets, 'On site, next door, or bring one')),
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

function labelled(label, control) {
  return h('label.pl-field', {}, [h('span.pl-flabel', { text: label }), control]);
}

function textField(name, value, placeholder) {
  const el = h('input.pl-input', {
    type: 'text', placeholder, 'data-recce-field': name,
    'aria-label': placeholder
  });
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
    h('h2.bd-h2', { text: 'Reference material' }),
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

  wrap.append(h('button.btn.pl-add', {
    type: 'button', 'data-action': 'media-add', text: '+  Add a reference'
  }));
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

/** Only an http(s) link is offered as clickable. Anything else — a
    drive path, a note to self — is stored and shown, but this app is
    not going to pretend it can open it. */
function isOpenable(url) {
  return /^https?:\/\/\S+$/i.test(String(url || '').trim());
}
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
  const options = MEDIA_KINDS.includes(value) || !value ? MEDIA_KINDS : [...MEDIA_KINDS, value];
  options.forEach((k) => {
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
  const seen = new Set();
  const add = (val, label) => {
    seen.add(val);
    const opt = h('option', { value: val, text: label });
    if (val === value) opt.selected = true;
    sel.append(opt);
  };
  add('', 'Not linked');
  Locations.locationIndex(scenes).forEach((l) => add(Locations.locationLink(l.name), l.name));
  Locations.calendarDays(scenes).forEach((d) => add(Locations.dayLink(d.day), 'Day ' + d.day));
  // A token pointing at something that has gone stays selectable and
  // says so, rather than silently resetting the user's choice to none.
  if (value && !seen.has(value)) add(value, (Locations.linkLabel(value, scenes) || value) + ' — no longer in the script');
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
function refreshCalendar(focusDay) {
  const old = document.getElementById('calendar');
  if (!old) return;
  old.replaceWith(renderCalendar(Scenes.listScenes()));
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

delegate(document, 'change', '[data-day-field="date"]', (e, el) => {
  const day = dayOf(el);
  if (!day) return;
  Locations.setDayDate(day, el.value);
  // The clash warning and the weekday are both derived from the whole
  // set of dates, so the section is the smallest honest unit to repaint.
  refreshCalendar(day);
});

delegate(document, 'click', '[data-action="day-clear"]', (e, el) => {
  const day = dayOf(el);
  if (!day) return;
  Locations.setDayDate(day, '');
  refreshCalendar();
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

delegate(document, 'click', '[data-action="recce-del"]', (e, el) => {
  const key = locKeyOf(el);
  if (!key) return;
  if (!confirm('Discard the recce notes for "' + key + '"? No scene points at this place any more, and this cannot be undone.')) return;
  Locations.removeRecce(key);
  render();
});

delegate(document, 'click', '[data-action="media-add"]', () => {
  Locations.addMedia();
  render();
  const last = document.querySelector('.pl-media:last-of-type .pl-media-title');
  if (last) last.focus();
});

delegate(document, 'click', '[data-action="media-del"]', (e, el) => {
  const id = mediaIdOf(el);
  if (!id) return;
  const item = Locations.listMedia().find((m) => m.id === id);
  const label = item && item.title ? ' "' + item.title + '"' : '';
  if (!confirm('Remove the reference' + label + '? The file itself is wherever you keep it and is untouched.')) return;
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
