/* ============================================================
   CONTACTS — the unit list, and the call sheets built from it
   ------------------------------------------------------------
   Two views of ONE contact model (src/lib/contacts.js), plus a
   read-only view of the scene model (src/lib/scenes.js). Nothing
   here stores a second copy of anything: a call sheet holds scene
   ids and contact ids, and every name, number and slug line on the
   printed sheet is looked up at render time. Rename a person and
   every sheet they are on says the new name — which is the whole
   argument for the chain in CLAUDE.md open item 2.

   Scenes are READ here and never written. The breakdown owns them.

   The printed sheet is a separate block from the editing form
   (`.ct-doc` versus `.ct-edit`) because a call sheet on paper is a
   document, not a form with its widgets greyed out. Both are built
   from the same data in the same pass, so they cannot disagree.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/contacts.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import PDF from '../lib/pdf.js';
import Contacts, { DEPARTMENTS } from '../lib/contacts.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Locations from '../lib/locations.js';
import Sun from '../lib/sun.js';
import DPR from '../lib/dpr.js';
import Geo from '../lib/recce-geo.js';
import WA from '../lib/callsheet-text.js';

const app = document.getElementById('app');

/* A hue per department, so the rule down the side of a card carries
   data instead of decorating. Six hues, nine departments: the three
   that share are the ones nobody confuses on a unit list. */
const DEPT_HUE = {
  Cast: 'feature',
  Direction: 'plan',
  Camera: 'shorts',
  Sound: 'visualize',
  Art: 'library',
  Costume: 'shoot',
  Makeup: 'visualize',
  Production: 'plan',
  Post: 'shorts'
};
const hueOf = (dept) => DEPT_HUE[dept] || 'feature';

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

/** '2026-09-28' → '28 September 2026'. No Date object: a shoot day is a
    wall-clock date, and parsing it into an instant moves it a timezone. */
function prettyDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return iso || 'Date not set';
  return Number(m[3]) + ' ' + (MONTHS[Number(m[2]) - 1] || m[2]) + ' ' + m[1];
}

const slugOf = (scene) =>
  [scene.intExt, scene.location || 'Location TBC'].join('. ') + ' — ' + scene.dayNight;

/* ---- header ------------------------------------------------- */
function renderHeader(contacts, sheets) {
  const cast = contacts.filter((c) => c.department === 'Cast').length;
  const depts = new Set(contacts.map((c) => c.department).filter(Boolean)).size;
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Contacts · people, and the day they are called' }),
    h('h1.bd-title', { text: 'Cast & Crew.' }),
    h('p.bd-deck', {
      text: 'Everybody on the film, once, with a department and a number. '
          + 'The call sheets are built from this list and from the scenes '
          + 'in the breakdown — so a name is typed here and nowhere else.'
    }),
    h('div.bd-stats', {}, [
      stat(String(contacts.length), contacts.length === 1 ? 'person' : 'people'),
      stat(String(cast), cast === 1 ? 'in the cast' : 'in the cast'),
      stat(String(depts), depts === 1 ? 'department' : 'departments'),
      stat(String(sheets.length), sheets.length === 1 ? 'call sheet' : 'call sheets')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state ------------------------------
   An empty module explains itself instead of showing a blank grid,
   and is anchored in the films like the glossary. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◒', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with the people' }),
    h('p', {
      text: 'A unit list is one line per person: who they are, what they do, '
          + 'and how you reach them at eleven at night when the location falls '
          + 'through. Everything a production office does runs on this list.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Name them', 'Name, the role they play or the job they do, and the department they sit in.'),
      how('2', 'Reach them', 'One phone number and one email. The number is the one that matters on a shoot day.'),
      how('3', 'Call them', 'Build a call sheet, tick the scenes you are shooting, and give each person a time.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Kaaka Muttai' }),
      h('span', {
        text: ' was shot with two children who had never acted, which means the '
            + 'call sheet carried a guardian beside each of them. The list is not '
            + 'only the crew — it is everyone who has to be somewhere at a time.'
      })
    ]),
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'contact-add', text: '+  Add the first person'
    })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- one person --------------------------------------------- */
function renderContact(contact) {
  /* `c-<id>` is the command palette's target (contacts.html#c-…):
     tabs.js opens the tab that holds it and the resolver lands on the
     card, where a missing id used to land on the top of the page. */
  const card = h('article.ct-person.hue-' + hueOf(contact.department), {
    'data-contact': contact.id, id: 'c-' + contact.id
  });

  card.append(h('div.ct-person-bar', {}, [
    field('input.ct-name', {
      type: 'text', placeholder: 'Name', 'data-contact-field': 'name',
      'aria-label': 'Name'
    }, contact.name),
    field('input.ct-role', {
      type: 'text', placeholder: 'Role or job — "Ravi", "1st AC", "Line Producer"',
      'data-contact-field': 'role', 'aria-label': 'Role or job'
    }, contact.role),
    deptSelect(contact.department),
    h('div.ct-person-acts', {}, [
      iconBtn('✕', 'contact-del', 'Remove this person', false, true)
    ])
  ]));

  const phone = field('input.ct-phone', {
    type: 'tel', placeholder: '+91 …', 'data-contact-field': 'phone',
    'aria-label': 'Phone number'
  }, contact.phone);
  const email = field('input.ct-email', {
    type: 'email', placeholder: 'name@example.com', 'data-contact-field': 'email',
    'aria-label': 'Email address'
  }, contact.email);
  card.append(h('div.ct-person-reach', {}, [
    labelled('Phone', phone, checkReach(phone)),
    labelled('Email', email, checkReach(email)),
    labelled('Notes', field('input.ct-notes', {
      type: 'text', placeholder: 'Agent, dietary, travel — anything the office needs',
      'data-contact-field': 'notes', 'aria-label': 'Notes'
    }, contact.notes))
  ]));

  return card;
}

function labelled(label, control, hint) {
  return h('label.ct-fieldset', {}, [h('span.ct-flabel', { text: label }), control, hint || null]);
}

/* A number or an address that cannot be dialled or sent to is still
   SAVED — it may be half-typed, or the only thing anybody has — but
   it says so, rather than surfacing at eleven at night when the
   location falls through (UX audit L11). The email check is the
   browser's own; a phone wants six digits and only the characters a
   number is written with. */
const PHONE_OK = /^[+\d\s().\-\/]*$/;
function reachProblem(el) {
  const v = String(el.value || '').trim();
  if (!v) return '';
  if (el.type === 'email') return el.validity && el.validity.typeMismatch ? 'Not an email address' : '';
  const digits = (v.match(/\d/g) || []).length;
  return !PHONE_OK.test(v) || digits < 6 ? 'Not a number anyone can dial' : '';
}
/** Mark the field, and return (or update) the hint line under it. */
function checkReach(el, hint) {
  const problem = reachProblem(el);
  const line = hint || h('span.ct-invalid', { 'aria-live': 'polite' });
  if (!line.id) line.id = 'ct-inv-' + Math.random().toString(36).slice(2, 9);
  line.textContent = problem;
  line.hidden = !problem;
  if (problem) {
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', line.id);
  } else {
    el.removeAttribute('aria-invalid');
    el.removeAttribute('aria-describedby');
  }
  return line;
}

function deptSelect(value) {
  const s = h('select.ct-dept', {
    'data-contact-field': 'department', 'aria-label': 'Department'
  });
  const options = DEPARTMENTS.includes(value) || !value
    ? DEPARTMENTS
    : [...DEPARTMENTS, value];
  options.forEach((d) => {
    const opt = h('option', { value: d, text: d });
    if (d === value) opt.selected = true;
    s.append(opt);
  });
  return s;
}

function field(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}
function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

/* ---- the unit list ------------------------------------------ */
function renderPeople(contacts) {
  const wrap = h('section.ct-people', { id: 'contacts' });
  wrap.append(
    h('h2.bd-h2', { text: 'The unit list' }),
    h('p.bd-sub', { text: 'Grouped by department. The colour down the side is the department, nothing else.' })
  );

  if (!contacts.length) {
    wrap.append(renderEmpty());
    return wrap;
  }

  for (const group of Contacts.byDepartment()) {
    const block = h('div.ct-dept-block');
    block.append(h('div.ct-dept-head.hue-' + hueOf(group.department), {}, [
      h('span.ct-dept-name', { text: group.department }),
      h('span.ct-dept-count', {
        text: group.people.length + (group.people.length === 1 ? ' person' : ' people')
      })
    ]));
    group.people.forEach((c) => block.append(renderContact(c)));
    wrap.append(block);
  }

  wrap.append(h('button.btn.ct-add', {
    type: 'button', 'data-action': 'contact-add', text: '+  Add person'
  }));
  return wrap;
}

/* ---- call sheets -------------------------------------------- */
function renderSheets(sheets, contacts, scenes) {
  const wrap = h('section.ct-sheets', { id: 'call-sheets' });
  wrap.append(
    h('h2.bd-h2', { text: 'Call sheets' }),
    h('p.bd-sub', {
      text: 'One per shoot day. Tick the scenes you are shooting and the people '
          + 'you are calling; anyone without their own time is called at the '
          + 'general call. Print gives you the sheet on its own, on as few pages as it needs.'
    })
  );

  if (!contacts.length) {
    /* A link rather than "above": the unit list is another TAB, so
       a direction on the page pointed at nothing. */
    wrap.append(h('p.bd-none', {}, [
      'A call sheet calls people, so it needs the unit list first. Add somebody to ',
      h('a', { href: '#contacts', text: 'the unit list' }),
      ' and a shoot day becomes possible.'
    ]));
    return wrap;
  }

  if (!sheets.length) {
    wrap.append(h('p.bd-none', {
      text: 'No call sheets yet. One sheet is one shoot day: a date, a time, '
          + 'a place, the scenes, and who has to be there.'
    }));
  }

  sheets.forEach((sheet) => wrap.append(renderSheet(sheet, contacts, scenes)));
  wrap.append(h('button.btn.ct-add', {
    type: 'button', 'data-action': 'sheet-add', text: '+  New call sheet'
  }));
  return wrap;
}

/* ---- the schedule's word on a sheet's date -----------------
   A call sheet carries its own date, and the Plan calendar gives each
   shoot DAY a date; nothing tied the two, so they could disagree with
   neither saying so (UX audit M13). Neither copy is dropped — a sheet
   typed before the calendar existed keeps its date — but the sheet now
   reads the schedule through its scenes: if they all sit on one shoot
   day, that day's calendar date is shown beside the sheet's, a
   mismatch is named, and a sheet with no date of its own prints the
   schedule's. Derived on every render, stored nowhere. */
function scheduleOf(sheet, scenes) {
  const days = [...new Set(sheet.sceneIds
    .map((id) => scenes.find((s) => s.id === id))
    .filter(Boolean)
    .map((s) => Locations.shootDayOf(s))
    .filter((d) => d > 0))].sort((a, b) => a - b);
  if (days.length !== 1) return { days, day: 0, date: '' };
  return { days, day: days[0], date: Locations.dayDate(days[0]) };
}

function renderSchedLine(sheet, scenes) {
  const sc = scheduleOf(sheet, scenes);
  const line = h('p.ct-sched', { 'aria-live': 'polite' });
  if (!sc.days.length) { line.hidden = true; return line; }
  if (!sc.day) {
    line.append('These scenes are on days ' + sc.days.join(', ')
      + ' of the schedule, so the sheet’s date is the only one there is.');
    return line;
  }
  if (!sc.date) {
    line.append('These scenes are Day ' + sc.day + ' on the stripboard, which has no date yet — ',
      h('a', { href: 'plan.html#calendar', text: 'set it on the Plan calendar' }), '.');
    return line;
  }
  if (sheet.date === sc.date) {
    line.append('Day ' + sc.day + ' on the schedule — the same date.');
    return line;
  }
  line.classList.add(sheet.date ? 'is-warn' : 'is-info');
  line.append(sheet.date
    ? 'The schedule has Day ' + sc.day + ' on ' + prettyDate(sc.date) + ', not this date. '
    : 'Day ' + sc.day + ' on the schedule is ' + prettyDate(sc.date) + '. ');
  line.append(h('button.mini-btn', {
    type: 'button', 'data-action': 'sheet-sched-date', 'data-date': sc.date,
    text: sheet.date ? 'Use the schedule’s date' : 'Use that date'
  }));
  return line;
}

function renderSheet(sheet, contacts, scenes) {
  const card = h('article.ct-sheet', { 'data-sheet': sheet.id });
  card.append(renderSheetEdit(sheet, contacts, scenes));
  card.append(renderSheetDoc(sheet, contacts, scenes));
  return card;
}

function renderSheetEdit(sheet, contacts, scenes) {
  const edit = h('div.ct-edit');

  edit.append(h('div.ct-sheet-bar', {}, [
    field('input.ct-sheet-title', {
      type: 'text', placeholder: 'Shoot day', 'data-sheet-field': 'title',
      'aria-label': 'Call sheet title'
    }, sheet.title),
    h('div.ct-sheet-acts.pdf-menu-host', {}, [
      actionMenu('Export', [
        { label: 'Print this sheet', action: 'sheet-print' },
        { label: 'Save as PDF',      action: 'sheet-pdf', hint: 'this sheet only' }
      ], { align: 'right' }),
      iconBtn('✕', 'sheet-del', 'Delete this call sheet', false, true)
    ])
  ]));

  edit.append(h('div.ct-sheet-facts', {}, [
    labelled('Date', field('input', {
      type: 'date', 'data-sheet-field': 'date', 'aria-label': 'Shoot date'
    }, sheet.date)),
    labelled('General call', field('input', {
      type: 'time', 'data-sheet-field': 'generalCall', 'aria-label': 'General call time'
    }, sheet.generalCall)),
    labelled('Planned wrap', field('input', {
      type: 'time', 'data-sheet-field': 'wrap', 'aria-label': 'Planned wrap time'
    }, sheet.wrap)),
    labelled('Location', field('input', {
      type: 'text', placeholder: 'Unit base — where everybody reports',
      'data-sheet-field': 'location', 'aria-label': 'Location'
    }, sheet.location))
  ]));
  edit.append(renderSchedLine(sheet, scenes));
  edit.append(renderLight(sheet, scenes));

  edit.append(labelled('Notes', field('textarea.ct-sheet-notes', {
    rows: '2', placeholder: 'Weather, parking, nearest hospital, anything the day needs',
    'data-sheet-field': 'notes', 'aria-label': 'Call sheet notes'
  }, sheet.notes)));

  /* scenes — read from the scene model, never written to it */
  const sc = h('div.ct-pick');
  sc.append(h('h3.ct-pick-head', { text: 'Scenes this day' }));
  if (!scenes.length) {
    sc.append(h('p.ct-pick-none', {}, [
      'No scenes in the breakdown yet. ',
      h('a', { href: './breakdown.html', text: 'Build the scene list' }),
      ' and every scene appears here to be scheduled.'
    ]));
  } else {
    const list = h('div.ct-pick-list');
    scenes.forEach((scene) => {
      const on = sheet.sceneIds.includes(scene.id);
      const row = h('label.ct-pick-row' + (on ? '.is-on' : ''));
      const box = h('input', {
        type: 'checkbox', 'data-action-change': 'sheet-scene', 'data-scene': scene.id,
        'aria-label': 'Shoot scene ' + (scene.number || '') + ' on this day'
      });
      box.checked = on;
      row.append(box,
        h('span.ct-pick-no', { text: scene.number || '—' }),
        h('span.ct-pick-slug', { text: slugOf(scene) }),
        h('span.ct-pick-pages', { text: formatEighths(scene.eighths) }));
      list.append(row);
    });
    sc.append(list);
  }
  edit.append(sc);

  /* people — everybody, with a per-person time for the ones called */
  const pp = h('div.ct-pick');
  pp.append(h('h3.ct-pick-head', { text: 'Who is called' }));
  const plist = h('div.ct-pick-list');
  for (const group of Contacts.byDepartment()) {
    plist.append(h('div.ct-pick-dept.hue-' + hueOf(group.department), {
      text: group.department
    }));
    group.people.forEach((c) => {
      const on = Object.prototype.hasOwnProperty.call(sheet.calls, c.id);
      const row = h('div.ct-pick-row.ct-call-row' + (on ? '.is-on' : ''), {
        'data-contact': c.id
      });
      const box = h('input', {
        type: 'checkbox', 'data-action-change': 'sheet-person',
        'aria-label': 'Call ' + (c.name || 'this person') + ' on this day'
      });
      box.checked = on;
      const time = field('input.ct-call-time', {
        type: 'time', 'data-action-change': 'sheet-time',
        'aria-label': 'Call time for ' + (c.name || 'this person'),
        disabled: !on, placeholder: 'General'
      }, on ? sheet.calls[c.id] : '');
      row.append(
        h('label.ct-call-who', {}, [
          box,
          h('span.ct-pick-name', { text: c.name || 'Unnamed' }),
          h('span.ct-pick-role', { text: c.role })
        ]),
        time
      );
      plist.append(row);
    });
  }
  pp.append(plist);
  edit.append(pp);

  edit.append(renderRouteEdit(sheet, scenes));
  edit.append(renderSend(sheet, contacts, scenes));
  return edit;
}

/* The sheet as paper. Screen-hidden, print-shown. Built from the same
   data in the same pass as the form above, so the two cannot disagree. */
function renderSheetDoc(sheet, contacts, scenes) {
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const onSheet = sheet.sceneIds
    .map((id) => scenes.find((s) => s.id === id))
    .filter(Boolean);
  const eighths = onSheet.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const sched = scheduleOf(sheet, scenes);

  const doc = h('div.ct-doc');
  doc.append(h('div.ct-doc-head', {}, [
    h('p.ct-doc-eyebrow', { text: 'Call sheet' }),
    h('h3.ct-doc-title', { text: sheet.title || 'Shoot day' }),
    h('div.ct-doc-facts', {}, [
      docFact('Date', sheet.date ? prettyDate(sheet.date)
        : (sched.date ? prettyDate(sched.date) + ' (from the schedule)' : prettyDate(''))),
      docFact('General call', sheet.generalCall || 'Not set'),
      docFact('Location', sheet.location || 'Not set'),
      docFact('Scenes', String(onSheet.length) + ' · ' + formatEighths(eighths) + ' pages')
    ])
  ]));

  const lit = lightOf(sheet, scenes);
  if (lit) {
    doc.append(h('div.ct-doc-facts.ct-doc-light', {}, [
      docFact('Sunrise', lit.light.sunrise || '—'),
      docFact('Sunset', lit.light.sunset || '—'),
      docFact('Golden hour', [lit.light.goldenAm, lit.light.goldenPm].filter(Boolean).join(' · ') || '—'),
      docFact('Planned wrap', sheet.wrap || 'Not set')
    ]));
    doc.append(h('p.ct-doc-small', { text: lightNote(lit) }));
    const late = lateScenes(sheet, onSheet, lit.light);
    if (late.length) doc.append(h('p.ct-doc-flag', { text: lateText(sheet, onSheet, lit.light, late) }));
  }

  if (onSheet.length) {
    const table = h('table.ct-doc-table');
    table.append(h('caption', { text: 'Scenes' }));
    table.append(h('thead', {}, [row('th', ['Sc.', 'Set', 'I/E · D/N', 'Synopsis', 'Pages'])]));
    const body = h('tbody');
    onSheet.forEach((s) => body.append(row('td', [
      s.number || '—',
      s.location || 'Location TBC',
      s.intExt + ' · ' + s.dayNight,
      s.synopsis || '',
      formatEighths(s.eighths)
    ])));
    table.append(body);
    doc.append(table);
  }

  const called = Object.keys(sheet.calls)
    .map((id) => byId[id])
    .filter(Boolean)
    .sort((a, b) => {
      const da = DEPARTMENTS.indexOf(a.department);
      const db = DEPARTMENTS.indexOf(b.department);
      return da === db ? String(a.name).localeCompare(String(b.name)) : da - db;
    });

  if (called.length) {
    const table = h('table.ct-doc-table');
    table.append(h('caption', { text: 'Called' }));
    table.append(h('thead', {}, [row('th', ['Name', 'Role', 'Department', 'Call', 'Phone'])]));
    const body = h('tbody');
    called.forEach((c) => body.append(row('td', [
      c.name || 'Unnamed',
      c.role || '',
      c.department || '',
      sheet.calls[c.id] || (sheet.generalCall ? sheet.generalCall + ' (general)' : 'General call'),
      c.phone || ''
    ])));
    table.append(body);
    doc.append(table);
  } else {
    doc.append(h('p.ct-doc-none', { text: 'Nobody is called on this sheet yet.' }));
  }

  /* renderRouteDoc() returns null for a sheet with no scenes, and the
     native append() prints that as the word "null" on the paper. */
  const route = renderRouteDoc(onSheet);
  if (route) doc.append(route);

  if (sheet.notes) {
    doc.append(h('div.ct-doc-notes', {}, [
      h('p.ct-doc-eyebrow', { text: 'Notes' }),
      h('p', { text: sheet.notes })
    ]));
  }
  return doc;
}

const docFact = (label, value) =>
  h('div.ct-doc-fact', {}, [
    h('span.ct-doc-flabel', { text: label }),
    h('strong', { text: value })
  ]);

function row(cell, values) {
  const tr = h('tr');
  values.forEach((v) => tr.append(h(cell, { text: v })));
  return tr;
}

/* ---- the day's light, the route, and the message ----------------
   Three views read off models this page does not own: the sun from
   src/lib/sun.js, the places from the recces in src/lib/locations.js,
   the message from src/lib/callsheet-text.js. All derived on render;
   the only things written are recce fields, through setRecce(), which
   is the same record the Plan page's recce cards edit. */

const sheetScenes = (sheet, scenes) => sheet.sceneIds
  .map((id) => scenes.find((s) => s.id === id))
  .filter(Boolean);

/** The distinct places a sheet's scenes are shot at, in sheet order,
    each with its recce. A place is a scene's location: there is no
    list of them to keep in step. */
function placesOf(onSheet) {
  const seen = new Set();
  const out = [];
  for (const s of onSheet) {
    const name = Locations.locationName(s);
    const key = Locations.locationKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, name, recce: Locations.getRecce(name) });
  }
  return out;
}

/** The date the sheet is for: its own, else the schedule's. */
function sheetDateOf(sheet, scenes) {
  return sheet.date || scheduleOf(sheet, scenes).date || '';
}

/** { light, place } for the sheet's date at its first pinned place, or
    null with no date. Chennai stands in, flagged, for a place with no pin. */
function lightOf(sheet, scenes) {
  const date = sheetDateOf(sheet, scenes);
  if (!date) return null;
  const place = Geo.placeFor(placesOf(sheetScenes(sheet, scenes)));
  const light = Sun.daylight(date, place, { deviceOffset: deviceOffsetOn(date) });
  return light ? { light, place } : null;
}

/* What this device's clock was offset by on that date, for a place
   outside India (sun.js reads India as IST without asking). */
function deviceOffsetOn(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? new Date(+m[1], +m[2] - 1, +m[3], 12).getTimezoneOffset() : new Date().getTimezoneOffset();
}

function lightNote(lit) {
  return lit.place.fallback
    ? 'Times for Chennai (' + lit.light.zone + ') — no location on this sheet has a pin yet. Add one under Route & safety.'
    : 'Times at ' + lit.place.name + ', ' + lit.light.zone + '. Golden hour: the sun between 4° below and 6° above the horizon.';
}

/** The wrap the flag judges: the later of the sheet's planned wrap and
    the DPR's wrap for the single shoot day its scenes sit on. */
function wrapOf(sheet, onSheet) {
  const days = [...new Set(onSheet.map((s) => Locations.shootDayOf(s)).filter((d) => d > 0))];
  return DPR.laterWrap(sheet.wrap, days.length === 1 ? DPR.getDPR(days[0]).wrap : '');
}

/** The scenes that need daylight when the wrap is after sunset.
    No wrap typed, no flag: the check judges a time somebody wrote down. */
function lateScenes(sheet, onSheet, light) {
  if (!Sun.isPastSunset(wrapOf(sheet, onSheet), light)) return [];
  return onSheet.filter(Sun.needsDaylight);
}
function lateText(sheet, onSheet, light, late) {
  return 'Wrap ' + wrapOf(sheet, onSheet) + ' is after sunset (' + light.sunset + '). '
    + (late.length === 1 ? 'Exterior scene ' : 'Exterior scenes ')
    + late.map((s) => s.number || '—').join(', ')
    + ' need the light — shoot ' + (late.length === 1 ? 'it' : 'them') + ' before ' + light.sunset + '.';
}

function renderLight(sheet, scenes) {
  const wrap = h('div.ct-light', { 'aria-live': 'polite' });
  const lit = lightOf(sheet, scenes);
  if (!lit) {
    wrap.append(h('p.ct-light-note', { text: 'Give the sheet a date and its sunrise, sunset and golden hour appear here.' }));
    return wrap;
  }
  const { light } = lit;
  wrap.append(h('dl.ct-light-row', {}, [
    lightCell('Sunrise', light.sunrise || '—'),
    lightCell('Sunset', light.sunset || '—'),
    lightCell('Golden · morning', light.goldenAm || '—'),
    lightCell('Golden · evening', light.goldenPm || '—')
  ]));
  wrap.append(h('p.ct-light-note', { text: lightNote(lit) }));
  const onS = sheetScenes(sheet, scenes);
  const late = lateScenes(sheet, onS, light);
  if (late.length) wrap.append(h('p.ct-flag', { role: 'note', text: lateText(sheet, onS, light, late) }));
  return wrap;
}
const lightCell = (label, value) =>
  h('div.ct-light-cell', {}, [h('dt', { text: label }), h('dd', { text: value })]);

/* ---- route & safety: the editing side -------------------------- */
const ROUTE_FIELDS = [
  ['address', 'Address', 'Where the van goes — a pin, a landmark, a street'],
  ['parking', 'Parking', 'Where the unit parks, and how far the carry is'],
  ['hospital', 'Nearest hospital', 'Name, distance, casualty phone'],
  ['police', 'Nearest police station', 'Station, and its number']
];
const canLocate = () => typeof navigator !== 'undefined' && 'geolocation' in navigator;

function renderRouteEdit(sheet, scenes) {
  const places = placesOf(sheetScenes(sheet, scenes));
  const wrap = h('div.ct-pick.ct-route', { 'data-places': places.map((p) => p.key).join('|') });
  wrap.append(h('h3.ct-pick-head', { text: 'Route & safety' }));
  if (!places.length) {
    wrap.append(h('p.ct-pick-none', { text: 'Tick a scene with a location and its route and safety details appear here — and on the printed sheet.' }));
    return wrap;
  }
  wrap.append(h('p.ct-pick-none', { text: 'Filed against the location, so every sheet and the Plan page’s recce card share them.' }));
  places.forEach((p) => wrap.append(routePlace(p)));
  return wrap;
}

function routePlace(p) {
  const box = h('details.ct-route-place', { 'data-loc': p.name });
  const pin = Geo.coordsOf(p.recce);
  box.append(h('summary', {}, [
    h('span.ct-route-name', { text: p.name }),
    h('span.ct-route-pin', { text: pin ? 'Pinned' : 'No pin' })
  ]));
  const grid = h('div.ct-route-grid');
  ROUTE_FIELDS.forEach(([key, label, ph]) => {
    grid.append(labelled(label, field('input', {
      type: 'text', placeholder: ph, 'data-route-field': key,
      'aria-label': label + ' — ' + p.name
    }, p.recce[key])));
  });
  const geoInput = field('input', {
    type: 'text', inputmode: 'url', 'data-route-geo': '',
    placeholder: 'Paste a Google Maps link, or 13.0827, 80.2707',
    'aria-label': 'Map pin for ' + p.name
  }, pin ? pin.lat + ', ' + pin.lng : '');
  grid.append(labelled('Map pin', geoInput,
    h('span.ct-route-status', { 'aria-live': 'polite', text: pinText(pin) })));
  box.append(grid);
  const acts = h('div.ct-route-acts');
  if (canLocate()) {
    acts.append(h('button.btn.ct-route-btn', {
      type: 'button', 'data-action': 'route-locate', text: 'Use this device’s location'
    }));
  }
  const link = Geo.recceMapsLink(p.name, p.recce);
  acts.append(h('a.btn.ct-route-btn.ct-route-map', {
    href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Open in Maps'
  }));
  box.append(acts);
  return box;
}
const pinText = (pin) => pin ? 'Pinned at ' + pin.lat + ', ' + pin.lng
  : 'No pin yet — sunrise and sunset fall back to Chennai.';

/* ---- route & safety: the paper side ---------------------------- */
function renderRouteDoc(onSheet) {
  const places = placesOf(onSheet);
  if (!places.length) return null;
  const table = h('table.ct-doc-table.ct-doc-route');
  table.append(h('caption', { text: 'Route & safety' }));
  table.append(h('thead', {}, [row('th', ['Location', 'Address · map', 'Parking', 'Nearest hospital', 'Nearest police'])]));
  const body = h('tbody');
  places.forEach((p) => {
    const pin = Geo.coordsOf(p.recce);
    const where = h('td', {}, [
      p.recce.address || '',
      pin ? h('span.ct-doc-pin', { text: (p.recce.address ? ' · ' : '') + pin.lat + ', ' + pin.lng }) : null,
      h('a.ct-doc-map', {
        href: Geo.recceMapsLink(p.name, p.recce), target: '_blank', rel: 'noopener noreferrer',
        text: (p.recce.address || pin ? ' · ' : '') + 'Map'
      })
    ]);
    body.append(h('tr', {}, [
      h('td', { text: p.name }), where,
      h('td', { text: p.recce.parking || '—' }),
      h('td', { text: p.recce.hospital || 'Not noted' }),
      h('td', { text: p.recce.police || 'Not noted' })
    ]));
  });
  table.append(body);
  return table;
}

/* ---- the message ------------------------------------------------- */

/** Who is called, in the order the paper lists them. */
function calledOf(sheet, contacts) {
  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  return Object.keys(sheet.calls)
    .map((id) => byId[id])
    .filter(Boolean)
    .sort((a, b) => {
      const da = DEPARTMENTS.indexOf(a.department);
      const db = DEPARTMENTS.indexOf(b.department);
      return da === db ? String(a.name).localeCompare(String(b.name)) : da - db;
    });
}

/** The sheet's facts, looked up now, for callsheet-text.js. */
function factsOf(sheet, scenes) {
  const onSheet = sheetScenes(sheet, scenes);
  const sched = scheduleOf(sheet, scenes);
  const places = placesOf(onSheet);
  const lit = lightOf(sheet, scenes);
  const first = places.find((p) => Geo.coordsOf(p.recce)) || places.find((p) => p.recce.address) || null;
  const mapUrl = first ? Geo.recceMapsLink(first.name, first.recce)
    : Geo.mapsLink({ address: sheet.location || (places[0] ? places[0].name : '') });
  const eighths = onSheet.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const date = sheetDateOf(sheet, scenes);
  return {
    film: PDF.projectTitle(),
    title: sheet.title || 'Shoot day',
    dayNumber: sched.day || 0,
    date: date ? prettyDate(date) : '',
    generalCall: sheet.generalCall,
    wrap: sheet.wrap,
    location: sheet.location || (places[0] ? places[0].name : ''),
    mapUrl,
    light: lit ? { ...lit.light, fallback: lit.place.fallback } : null,
    scenes: onSheet.map((s) => ({ number: s.number, slug: slugOf(s), pages: formatEighths(s.eighths) })),
    pagesTotal: formatEighths(eighths),
    notes: sheet.notes
  };
}

const personOf = (sheet, c) =>
  ({ name: c.name, role: c.role, department: c.department, call: sheet.calls[c.id] || '' });

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

function renderSend(sheet, contacts, scenes) {
  const wrap = h('div.ct-pick.ct-send');
  wrap.append(h('h3.ct-pick-head', { text: 'Send this sheet' }));
  const facts = factsOf(sheet, scenes);
  const unit = WA.unitMessage(facts);
  const acts = h('div.ct-send-acts');
  acts.append(h('a.btn.primary.ct-send-wa', {
    href: WA.waLink('', unit), target: '_blank', rel: 'noopener noreferrer',
    text: 'Send to WhatsApp'
  }));
  if (canShare()) {
    acts.append(h('button.btn', { type: 'button', 'data-action': 'sheet-share', text: 'Share…' }));
  }
  acts.append(h('button.btn', { type: 'button', 'data-action': 'sheet-copy', text: 'Copy text' }));
  wrap.append(acts);
  wrap.append(h('p.ct-pick-none', {
    text: 'One message for the whole unit — WhatsApp asks which chat or group. '
        + unit.length + ' characters.'
  }));

  const called = calledOf(sheet, contacts);
  if (!called.length) {
    wrap.append(h('p.ct-pick-none', { text: 'Call somebody above and each person gets their own message, with their own call time first.' }));
    return wrap;
  }
  const list = h('ul.ct-send-list');
  called.forEach((c) => {
    const digits = WA.waDigits(c.phone);
    const li = h('li.ct-send-row', { 'data-contact': c.id });
    li.append(h('span.ct-send-who', {}, [
      h('span.ct-pick-name', { text: c.name || 'Unnamed' }),
      h('span.ct-pick-role', { text: [c.department, c.role].filter(Boolean).join(' · ') })
    ]));
    li.append(h('span.ct-send-call', {
      text: sheet.calls[c.id] || (sheet.generalCall ? sheet.generalCall + ' (general)' : 'General call')
    }));
    if (digits) {
      li.append(h('a.btn.ct-send-btn', {
        href: WA.waLink(digits, WA.personMessage(facts, personOf(sheet, c))),
        target: '_blank', rel: 'noopener noreferrer',
        'aria-label': 'WhatsApp ' + (c.name || 'this person') + ' their call',
        text: 'WhatsApp'
      }));
    } else {
      li.append(h('button.btn.ct-send-btn', {
        type: 'button', 'data-action': 'sheet-copy-person',
        'aria-label': 'Copy the message for ' + (c.name || 'this person') + ' — no phone number on the unit list',
        text: 'Copy text'
      }));
    }
    list.append(li);
  });
  wrap.append(list);
  return wrap;
}

/* ---- render -------------------------------------------------- */
function render() {
  const contacts = Contacts.listContacts();
  const sheets = Contacts.listCallSheets();
  const scenes = Scenes.listScenes();

  const main = h('main', { id: 'main' });
  main.append(renderHeader(contacts, sheets));
  main.append(renderPeople(contacts));
  main.append(renderSheets(sheets, contacts, scenes));

  app.replaceChildren(main);
  mountShell();
  wireActionBar();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[contacts] chrome', e); }
}

/* Re-render only the call sheets. A person's name changes on blur, and
   a full render at that moment would throw away the caret the user was
   about to tab into. The sheets still have to catch up, so they alone
   are rebuilt. */
function refreshSheets() {
  const old = document.getElementById('call-sheets');
  if (!old) { render(); return; }
  old.replaceWith(renderSheets(
    Contacts.listCallSheets(), Contacts.listContacts(), Scenes.listScenes()
  ));
}

/* ---- events — delegated, no inline handlers ------------------ */
const contactIdOf = (el) => el.closest('[data-contact]')?.dataset.contact;
const sheetIdOf   = (el) => el.closest('[data-sheet]')?.dataset.sheet;

/* The new person joins Cast (DEPARTMENTS[0], the model's default and
   the department most rows on a unit list belong to), which on a full
   list is thousands of pixels above the button. So focus the card the
   model just created — by its id, never by position — and bring it
   into view. "The last card on the page" was somebody else: typing
   renamed the last person in Post. scrollIntoView respects the
   `scroll-padding-top` on <html>, so the card lands below the band. */
delegate(document, 'click', '[data-action="contact-add"]', () => {
  const added = Contacts.addContact();
  render();
  const card = added && document.querySelector('[data-contact="' + added.id + '"]');
  const name = card && card.querySelector('.ct-name');
  if (!name) return;
  name.focus({ preventScroll: true });
  // `instant`: html scrolls smoothly, and a smooth trip of a few
  // thousand pixels left the field off-screen for a second of typing.
  card.scrollIntoView({ block: 'center', behavior: 'instant' });
});

delegate(document, 'click', '[data-action="contact-del"]', (e, el) => {
  const id = contactIdOf(el);
  const c = Contacts.listContacts().find((x) => x.id === id);
  const label = c && c.name ? ' ' + c.name : '';
  if (!confirm('Remove' + label + '? They come off every call sheet too.')) return;
  Contacts.removeContact(id);
  render();
});

delegate(document, 'change', '[data-contact-field]', (e, el) => {
  const id = contactIdOf(el);
  const key = el.dataset.contactField;
  Contacts.updateContact(id, { [key]: el.value });
  // Department moves the card to another group, so the list has to
  // rebuild — and focus follows the card to its new group rather than
  // falling to <body> (UX audit M1). Everything else only has to
  // reach the call sheets.
  if (key === 'department') {
    render();
    const sel = document.querySelector('[data-contact="' + CSS.escape(id) + '"] .ct-dept');
    if (sel) {
      sel.focus({ preventScroll: true });
      sel.closest('.ct-person').scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  } else refreshSheets();
});

delegate(document, 'click', '[data-action="sheet-add"]', () => {
  Contacts.addCallSheet();
  render();
  const last = document.querySelector('.ct-sheet:last-of-type .ct-sheet-title');
  if (last) last.focus();
});

delegate(document, 'click', '[data-action="sheet-del"]', (e, el) => {
  const id = sheetIdOf(el);
  const s = Contacts.listCallSheets().find((x) => x.id === id);
  const label = s && s.title ? ' "' + s.title + '"' : '';
  if (!confirm('Delete call sheet' + label + '? The people and the scenes stay.')) return;
  Contacts.removeCallSheet(id);
  render();
});

/* Typing saves as it goes — a reload or a closed tab must not take
   what was typed since the field was entered (UX audit H10). The
   store write only: the repaint stays on `change`, as above. */
saveOnInput('[data-contact-field]', (el) => {
  Contacts.updateContact(contactIdOf(el), { [el.dataset.contactField]: el.value });
});
/* The invalid mark follows the typing, both ways. */
delegate(document, 'input', '.ct-phone, .ct-email', (e, el) => {
  const line = el.parentElement && el.parentElement.querySelector('.ct-invalid');
  if (line) checkReach(el, line);
});
saveOnInput('[data-sheet-field]', (el) => {
  Contacts.updateCallSheet(sheetIdOf(el), { [el.dataset.sheetField]: el.value });
});

delegate(document, 'change', '[data-sheet-field]', (e, el) => {
  Contacts.updateCallSheet(sheetIdOf(el), { [el.dataset.sheetField]: el.value });
  refreshSheets();
});

delegate(document, 'change', '[data-action-change="sheet-scene"]', (e, el) => {
  Contacts.toggleSheetScene(sheetIdOf(el), el.dataset.scene, el.checked);
  el.closest('.ct-pick-row')?.classList.toggle('is-on', el.checked);
  syncDoc(el);
});

delegate(document, 'change', '[data-action-change="sheet-person"]', (e, el) => {
  const row = el.closest('.ct-call-row');
  const time = row?.querySelector('.ct-call-time');
  Contacts.setSheetCall(sheetIdOf(el), contactIdOf(el), el.checked, time ? time.value : '');
  if (row) row.classList.toggle('is-on', el.checked);
  if (time) { time.disabled = !el.checked; if (!el.checked) time.value = ''; }
  syncDoc(el);
});

delegate(document, 'change', '[data-action-change="sheet-time"]', (e, el) => {
  Contacts.setSheetCall(sheetIdOf(el), contactIdOf(el), true, el.value);
  syncDoc(el);
});

/* Repaint just this sheet's paper view. Rebuilding the whole section
   here would reset every checkbox the user is in the middle of ticking. */
function syncDoc(el) {
  const card = el.closest('.ct-sheet');
  if (!card) return;
  const sheet = Contacts.listCallSheets().find((s) => s.id === card.dataset.sheet);
  if (!sheet) return;
  const scenes = Scenes.listScenes();
  const doc = card.querySelector('.ct-doc');
  if (doc) doc.replaceWith(renderSheetDoc(sheet, Contacts.listContacts(), scenes));
  // Ticking a scene can move the sheet onto (or off) a schedule day.
  const line = card.querySelector('.ct-sched');
  if (line) line.replaceWith(renderSchedLine(sheet, scenes));
  syncDerived(card, sheet, scenes);
}

/* The parts of a sheet that are read off OTHER models — the light, the
   route block's place list, the send panel — rebuilt in place. The
   route block's inputs are only rebuilt when its set of places changed,
   so a field somebody is typing in survives a tick of a scene box. */
function syncDerived(card, sheet, scenes) {
  const contacts = Contacts.listContacts();
  const light = card.querySelector('.ct-light');
  if (light) light.replaceWith(renderLight(sheet, scenes));
  const route = card.querySelector('.ct-route');
  const places = placesOf(sheetScenes(sheet, scenes)).map((p) => p.key).join('|');
  if (route && route.dataset.places !== places) route.replaceWith(renderRouteEdit(sheet, scenes));
  const send = card.querySelector('.ct-send');
  if (send) send.replaceWith(renderSend(sheet, contacts, scenes));
}

/** Every sheet's derived parts, after a recce changed under all of them. */
function syncAllDerived() {
  const scenes = Scenes.listScenes();
  const sheets = Contacts.listCallSheets();
  const contacts = Contacts.listContacts();
  document.querySelectorAll('.ct-sheet[data-sheet]').forEach((card) => {
    const sheet = sheets.find((s) => s.id === card.dataset.sheet);
    if (!sheet) return;
    const doc = card.querySelector('.ct-doc');
    if (doc) doc.replaceWith(renderSheetDoc(sheet, contacts, scenes));
    syncDerived(card, sheet, scenes);
  });
}

delegate(document, 'click', '[data-action="sheet-sched-date"]', (e, el) => {
  const id = sheetIdOf(el);
  Contacts.updateCallSheet(id, { date: el.dataset.date || '' });
  refreshSheets();
  document.querySelector('[data-sheet="' + CSS.escape(id || '') + '"] [data-sheet-field="date"]')?.focus();
});

/** The sheet's title without a leading "<project> —". */
function dayName(title, project) {
  const t = String(title || '').trim();
  const p = String(project || '').trim();
  const rest = p && t.toLowerCase().startsWith(p.toLowerCase()) ? t.slice(p.length) : '';
  // Only at a separator: "Dragonfly Day 2" is not "Dragon" + "fly Day 2".
  if (/^\s*[—–:·|-]\s*\S/.test(rest)) return rest.replace(/^\s*[—–:·|-]\s*/, '');
  return t || 'Shoot day';
}

/* Print one sheet, not the page. The class comes off again on
   afterprint; the timeout is the fallback for browsers that never
   fire it (Safari, historically). */
function markOnlySheet(card) {
  document.querySelectorAll('.ct-sheet.is-printing')
    .forEach((n) => n.classList.remove('is-printing'));
  card.classList.add('is-printing');
}

delegate(document, 'click', '[data-action="sheet-print"]', (e, el) => {
  const card = el.closest('.ct-sheet');
  if (!card) return;
  markOnlySheet(card);
  document.body.classList.add('ct-printing');
  const clean = () => {
    document.body.classList.remove('ct-printing');
    card.classList.remove('is-printing');
    window.removeEventListener('afterprint', clean);
  };
  window.addEventListener('afterprint', clean);
  window.print();
  setTimeout(clean, 2000);
});

/* Same sheet, same rules — contacts.css already prints one call sheet
   per page off `ct-printing` and `.is-printing`, so lib/pdf.js is
   handed those classes rather than being taught the layout twice. What
   it adds is the page setup, the running band, and a filename a
   producer can find again: "Por Thozhil — Day 3", not "contacts". */
delegate(document, 'click', '[data-action="sheet-pdf"]', (e, el) => {
  const card = el.closest('.ct-sheet');
  if (!card) return;
  const sheet = Contacts.listCallSheets().find((s) => s.id === card.dataset.sheet);
  if (!sheet) return;
  /* A sheet is often titled "Dragon — Day 1", and the masthead and
     the filename already lead with the project, so it printed as
     "Dragon — Dragon — Day 1" (UX audit L12). The project prefix comes
     off the day name here; the stored title is untouched. */
  const project = PDF.projectTitle();
  const day = dayName(sheet.title, project);
  PDF.exportPDF({
    scope: 'callsheet',
    title: project + ' — ' + day,
    subtitle: [day, prettyDate(sheet.date), sheet.location].filter(Boolean).join(' · '),
    classes: ['ct-printing'],
    before: () => markOnlySheet(card),
    after: () => card.classList.remove('is-printing')
  });
});

/* ---- route & safety, and sending — events -----------------------
   A recce field is filed against the LOCATION, so one edit is true of
   every sheet that shoots there: the other sheets' copies of the field
   are brought into step in place, and every sheet's derived parts (the
   light, the paper, the message) are rebuilt. Nothing is re-rendered
   under the caret. */
const locOf = (el) => el.closest('[data-loc]')?.dataset.loc || '';

function stepRoutePlaces(name, except) {
  const recce = Locations.getRecce(name);
  const pin = Geo.coordsOf(recce);
  document.querySelectorAll('.ct-route-place').forEach((box) => {
    if (Locations.locationKey(box.dataset.loc) !== Locations.locationKey(name)) return;
    box.querySelectorAll('[data-route-field]').forEach((inp) => {
      if (inp !== except) inp.value = recce[inp.dataset.routeField] || '';
    });
    const geo = box.querySelector('[data-route-geo]');
    if (geo && geo !== except) geo.value = pin ? pin.lat + ', ' + pin.lng : '';
    const status = box.querySelector('.ct-route-status');
    if (status && !(except && except.matches('[data-route-geo]') && box.contains(except))) status.textContent = pinText(pin);
    const chip = box.querySelector('.ct-route-pin');
    if (chip) chip.textContent = pin ? 'Pinned' : 'No pin';
    const map = box.querySelector('.ct-route-map');
    if (map) map.href = Geo.recceMapsLink(name, recce);
  });
}

function afterRecce(name, except) {
  stepRoutePlaces(name, except);
  syncAllDerived();
}

saveOnInput('[data-route-field]', (el) => {
  const name = locOf(el);
  if (name) Locations.setRecce(name, { [el.dataset.routeField]: el.value });
});
delegate(document, 'change', '[data-route-field]', (e, el) => {
  const name = locOf(el);
  if (!name) return;
  Locations.setRecce(name, { [el.dataset.routeField]: el.value });
  afterRecce(name, el);
});

/* The pin field takes a pasted Maps link or a bare pair, keeps the
   COORDINATES and shows them back. What was pasted is not stored: the
   link is a way of typing two numbers. A link with none in it (a short
   maps.app.goo.gl link) is refused in words, and nothing is written. */
delegate(document, 'change', '[data-route-geo]', (e, el) => {
  const name = locOf(el);
  if (!name) return;
  const status = el.parentElement && el.parentElement.querySelector('.ct-route-status');
  const text = el.value.trim();
  if (!text) {
    Locations.setRecce(name, { lat: '', lng: '' });
    if (status) status.textContent = pinText(null);
    afterRecce(name, el);
    return;
  }
  const at = Geo.parseLatLng(text);
  if (!at) {
    if (status) {
      status.textContent = /goo\.gl|maps\.app/i.test(text)
        ? 'A short link carries no coordinates. Open it, then paste the long address-bar link.'
        : 'No coordinates in that. Paste a Google Maps link, or two numbers like 13.0827, 80.2707.';
    }
    el.setAttribute('aria-invalid', 'true');
    return;
  }
  el.removeAttribute('aria-invalid');
  Locations.setRecce(name, { lat: String(at.lat), lng: String(at.lng) });
  el.value = at.lat + ', ' + at.lng;
  if (status) status.textContent = pinText(at);
  afterRecce(name, el);
});

/* Where the phone is, as the location's pin — for the recce done
   standing in it. Optional, asked for only on the tap, and a refusal is
   a sentence rather than an error. */
delegate(document, 'click', '[data-action="route-locate"]', (e, el) => {
  const name = locOf(el);
  if (!name || !canLocate()) return;
  el.disabled = true;
  navigator.geolocation.getCurrentPosition((pos) => {
    el.disabled = false;
    const lat = Math.round(pos.coords.latitude * 1e6) / 1e6;
    const lng = Math.round(pos.coords.longitude * 1e6) / 1e6;
    Locations.setRecce(name, { lat: String(lat), lng: String(lng) });
    afterRecce(name, null);
    StudioUI.toast(name + ' pinned where this device is, to about '
      + Math.round(pos.coords.accuracy || 0) + ' m.');
  }, (err) => {
    el.disabled = false;
    StudioUI.toast(err && err.code === 1
      ? 'Location permission was refused — paste a Maps link instead.'
      : 'This device could not find where it is. Paste a Maps link instead.');
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
});

function sheetAndFacts(el) {
  const sheet = Contacts.listCallSheets().find((s) => s.id === sheetIdOf(el));
  if (!sheet) return null;
  return { sheet, facts: factsOf(sheet, Scenes.listScenes()) };
}

/* Clipboard, with the selection fallback for a browser (or an http
   preview) that has no async clipboard. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    const ta = h('textarea', { 'aria-hidden': 'true', class: 'ct-copy-buffer' });
    ta.value = text;
    document.body.append(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) { ok = false; }
    ta.remove();
    return ok;
  }
}

delegate(document, 'click', '[data-action="sheet-copy"]', async (e, el) => {
  const got = sheetAndFacts(el);
  if (!got) return;
  const ok = await copyText(WA.unitMessage(got.facts));
  StudioUI.toast(ok ? 'Call sheet copied — paste it into the unit group.' : 'Could not reach the clipboard.');
});

delegate(document, 'click', '[data-action="sheet-copy-person"]', async (e, el) => {
  const got = sheetAndFacts(el);
  const c = got && Contacts.listContacts().find((x) => x.id === contactIdOf(el));
  if (!c) return;
  const ok = await copyText(WA.personMessage(got.facts, personOf(got.sheet, c)));
  StudioUI.toast(ok ? 'Copied ' + (c.name || 'their') + '’s call — there is no phone number to send it to.'
    : 'Could not reach the clipboard.');
});

delegate(document, 'click', '[data-action="sheet-share"]', async (e, el) => {
  const got = sheetAndFacts(el);
  if (!got || !canShare()) return;
  try {
    await navigator.share({ title: [got.facts.film, got.facts.title].filter(Boolean).join(' — '), text: WA.unitMessage(got.facts) });
  } catch (err) {
    /* AbortError is the person closing the sheet; nothing to say. */
    if (err && err.name !== 'AbortError') StudioUI.toast('Sharing did not open on this device. Use Copy text.');
  }
});

render();
