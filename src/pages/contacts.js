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
import { revealTarget } from '../ui/tabs.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import PDF from '../lib/pdf.js';
import Contacts from '../lib/contacts.js';
import Scenes, { formatEighths, ELEMENT_CATEGORIES } from '../lib/scenes.js';
import Locations from '../lib/locations.js';
import DPR from '../lib/dpr.js';
import Geo from '../lib/recce-geo.js';
import {
  hueOf, prettyDate as prettyDateIn, slugOf, unitCounts, deptOptions, reachProblem as reachProblemOf, scheduleOf, sheetScenes,
  eighthsOf, placesOf, sheetDateOf, lightOf, lightNote, wrapOf, lateScenes, lateText, ROUTE_FIELDS, pinText,
  pinRefusal, roundedPin, calledOf, groupCalled, callLabel, factsOf as factsFor, personOf, waRuns, dayName, nextSheetPatch
} from '../lib/contacts-model.js';
import WA from '../lib/callsheet-text.js';
import { askDanger } from '../ui/dialog.js';
import { pageHeader, statStrip, button, badge, panel } from '../ui/kit/index.js';

/* The call sheet's dates follow the FILM's style (an Indian film
   "12 February 2024", a US one "February 12, 2024"): it is paperwork, printed
   and sent. Derived per call, stored nowhere. */
const filmPrefs = () => PDF.filmPrefs();
const prettyDate = (iso) => prettyDateIn(iso, filmPrefs());

const app = document.getElementById('app');

/* The department hues, the dates, the slug line and every fact a call
   sheet derives are src/lib/contacts-model.js's. */

/* ---- header ------------------------------------------------- */
function renderHeader(contacts, sheets) {
  const { cast, depts } = unitCounts(contacts);
  /* ONE PAGE FRAME: the kit header itself, `.bd-head` like every page's
     (`.ct-head` kept for print.css and contacts.css), the figures inside it. */
  const wrap = pageHeader({
    class: 'bd-head ct-head',
    eyebrow: ['Cast & Crew', 'Call sheets & unit directory'],
    title: 'Cast & Crew',
    sub: 'Everybody on the film, once, with a department and a number. '
       + 'One call sheet per shoot day, built from this list and from the scenes '
       + 'in the breakdown — call times, the light, the route to the nearest hospital, '
       + 'and a WhatsApp message for each person called. A name is typed here and nowhere else.',
    actions: contacts.length
      ? [button({ label: 'New shoot day', icon: 'add', variant: 'primary', pill: true, action: 'sheet-add' })]
      : []
  });
  wrap.append(statStrip([
    { label: 'People', value: contacts.length, note: contacts.length === 1 ? 'person on the unit' : 'people on the unit' },
    { label: 'Cast', value: cast, note: 'in the cast' },
    { label: 'Departments', value: depts, note: depts === 1 ? 'department' : 'departments' },
    { label: 'Call sheets', value: sheets.length, note: sheets.length === 1 ? 'call sheet built' : 'call sheets built' }
  ], { class: 'ct-kpis', label: 'Unit figures' }));
  return wrap;
}

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
    button({ label: 'Add the first person', icon: 'add', variant: 'primary', pill: true, action: 'contact-add', class: 'bd-cta' })
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
    'data-contact': contact.id, id: 'c-' + contact.id,
    role: 'group', 'aria-label': contact.name || 'New person'
  });

  card.append(h('div.ct-person-bar', {}, [
    field('input.ct-name', {
      type: 'text', placeholder: 'Name', 'data-contact-field': 'name',
      'aria-label': 'Name'
    }, contact.name),
    field('input.ct-role', {
      type: 'text', placeholder: 'Role or job — "Director", "1st AC", "Line Producer"',
      'data-contact-field': 'role', 'aria-label': 'Role or job'
    }, contact.role),
    deptSelect(contact.department),
    h('div.ct-person-acts', {}, [
      iconBtn('✕', 'contact-del', 'Remove ' + (contact.name || 'this person'), false, true)
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
function reachProblem(el) {
  return reachProblemOf(el.value, el.type, !!(el.validity && el.validity.typeMismatch));
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
  const options = deptOptions(value);
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
  const wrap = h('section.ct-people', { id: 'contacts', 'data-tab-label': 'Unit directory' });
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

  wrap.append(button({ label: 'Add person', icon: 'add', action: 'contact-add', class: 'ct-add' }));
  return wrap;
}

/* ---- call sheets -------------------------------------------- */
function renderSheets(sheets, contacts, scenes) {
  const wrap = h('section.ct-sheets', { id: 'call-sheets', 'data-tab-label': 'Call sheets' });
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
  wrap.append(button({ label: 'New shoot day', icon: 'add', action: 'sheet-add', class: 'ct-add' }));
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
  const card = h('article.ct-sheet', { 'data-sheet': sheet.id, id: 'sheet-' + sheet.id });
  card.append(renderSheetEdit(sheet, contacts, scenes));
  card.append(renderSheetDoc(sheet, contacts, scenes));
  return card;
}

/* ---- the day at a glance -----------------------------------------
   A read-only summary of the sheet below it: the day's four times, the
   place and its pin, the light, the route and safety, and the scenes
   with their pages. Every line is looked up from the models the form
   below edits (the sheet, the scenes, the recce, the DPR, sun.js), so
   it adds no field and stores nothing. A fact that has no source is not
   drawn rather than drawn empty. */
function glanceFact(label, value) {
  return h('div.ct-gl-fact', {}, [h('span.ct-gl-l', { text: label }), h('strong', { text: value })]);
}
function renderDayCard(sheet, scenes) {
  const onSheet = sheetScenes(sheet, scenes);
  const sched = scheduleOf(sheet, scenes);
  const date = sheetDateOf(sheet, scenes);
  const total = Locations.calendarDays(scenes).length;
  const places = placesOf(onSheet);
  const lit = lightOf(sheet, scenes);
  const eighths = eighthsOf(onSheet);
  const dpr = sched.day ? DPR.getDPR(sched.day) : null;
  const wrap = wrapOf(sheet, onSheet);

  const card = h('section.ct-glance', { 'aria-label': 'This shoot day at a glance' });
  card.append(h('div.ct-gl-head', {}, [
    h('h3.ct-gl-title', { text: sheet.title || 'Shoot day' }),
    sched.day ? h('span.ct-gl-badge', { text: 'Day ' + sched.day + (total ? ' of ' + total : '') }) : null
  ]));
  card.append(h('div.ct-gl-times', {}, [
    glanceFact('Date', date ? prettyDate(date) : 'Not set'),
    glanceFact('General call', sheet.generalCall || 'Not set'),
    dpr && dpr.firstShot ? glanceFact('Ready to shoot', dpr.firstShot) : null,
    glanceFact('Planned wrap', wrap || 'Not set')
  ]));

  const cols = h('div.ct-gl-cols');
  // place + pin
  const first = places.find((p) => Geo.coordsOf(p.recce)) || places[0] || null;
  const pin = first ? Geo.coordsOf(first.recce) : null;
  const where = h('div.ct-gl-col', {}, [
    h('h4.ct-gl-h', { text: 'Location & unit base' }),
    h('p.ct-gl-p', { text: sheet.location || (first ? first.name : 'No location yet') })
  ]);
  if (first && first.recce.address) where.append(h('p.ct-gl-small', { text: first.recce.address }));
  if (pin) where.append(h('p.ct-gl-pin', { text: 'Lat ' + pin.lat + ' · Long ' + pin.lng }));
  if (first) where.append(h('a.ct-gl-link', {
    href: Geo.recceMapsLink(first.name, first.recce), target: '_blank', rel: 'noopener noreferrer', text: 'Open in Maps'
  }));
  cols.append(where);
  // light
  const sun = h('div.ct-gl-col', {}, [h('h4.ct-gl-h', { text: 'Solar & daylight' })]);
  if (lit) {
    const l = lit.light;
    sun.append(h('p.ct-gl-p', { text: 'Sunrise ' + (l.sunrise || '—') + ' · Sunset ' + (l.sunset || '—') }));
    const gold = [l.goldenAm, l.goldenPm].filter(Boolean).join(' · ');
    if (gold) sun.append(h('p.ct-gl-small', { text: 'Golden hour ' + gold }));
    sun.append(h('p.ct-gl-small', { text: lightNote(lit) }));
    const late = lateScenes(sheet, onSheet, l);
    if (late.length) sun.append(h('p.ct-flag', { role: 'note', text: lateText(sheet, onSheet, l, late) }));
  } else {
    sun.append(h('p.ct-gl-small', { text: 'Give the sheet a date and the light for the day appears here.' }));
  }
  cols.append(sun);
  // route + safety, from the recce fields the form below edits
  const safe = h('div.ct-gl-col', {}, [h('h4.ct-gl-h', { text: 'Route & emergency safety' })]);
  const noted = places.filter((p) => p.recce.hospital || p.recce.police);
  if (noted.length) {
    noted.forEach((p) => {
      const box = h('div.ct-gl-safe');
      if (noted.length > 1) box.append(h('span.ct-gl-l', { text: p.name }));
      if (p.recce.hospital) box.append(h('p.ct-gl-small', {}, [h('span.ct-gl-l', { text: 'Nearest hospital ' }), p.recce.hospital]));
      if (p.recce.police) box.append(h('p.ct-gl-small', {}, [h('span.ct-gl-l', { text: 'Nearest police ' }), p.recce.police]));
      safe.append(box);
    });
  } else {
    safe.append(h('p.ct-gl-small', { text: places.length
      ? 'No hospital or police station noted yet. Add them under Route & safety below.'
      : 'Tick a scene with a location and its route and safety details appear here.' }));
  }
  cols.append(safe);
  card.append(cols);

  // scenes
  const sc = h('div.ct-gl-scenes', {}, [
    h('h4.ct-gl-h', { text: 'Scenes to shoot' + (onSheet.length ? ' · ' + onSheet.length + ' · ' + formatEighths(eighths) + ' pages' : '') })
  ]);
  if (!onSheet.length) sc.append(h('p.ct-gl-small', { text: 'No scenes ticked for this day yet.' }));
  onSheet.forEach((s) => sc.append(h('div.ct-gl-scene', {}, [
    h('span.ct-gl-no', { text: 'Scene ' + (s.number || '—') }),
    h('span.ct-gl-slug', { text: slugOf(s) }),
    h('span.ct-gl-pg', { text: formatEighths(s.eighths) + ' pgs' }),
    s.synopsis ? h('span.ct-gl-syn', { text: s.synopsis }) : null
  ])));
  card.append(sc);
  return card;
}

function renderSheetEdit(sheet, contacts, scenes) {
  const edit = h('div.ct-edit');
  edit.append(renderDayCard(sheet, scenes));

  edit.append(h('div.ct-sheet-bar', {}, [
    field('input.ct-sheet-title', {
      type: 'text', placeholder: 'Shoot day', 'data-sheet-field': 'title',
      'aria-label': 'Call sheet title'
    }, sheet.title),
    h('div.ct-sheet-acts.pdf-menu-host', {}, [
      actionMenu('Export', [
        { label: 'Print this sheet', action: 'sheet-print' },
        { label: 'Save as PDF',      action: 'sheet-pdf', hint: 'this sheet only' },
        { label: 'Download sides packet', action: 'sheet-sides', hint: 'the day\'s scenes' }
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
  const onSheet = sheetScenes(sheet, scenes);
  const eighths = eighthsOf(onSheet);
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
    const table = h('table.ct-doc-table.ct-doc-scenes');
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
    doc.append(h('div.ct-doc-scroll', {}, [table]));   // scrolls sideways on a phone
  }

  const called = calledOf(sheet, contacts);

  if (called.length) {
    groupCalled(sheet, called).forEach((g) => {
    const table = h('table.ct-doc-table');
    table.append(h('caption', { text: 'Called — ' + g.label.toLowerCase() }));
    table.append(h('thead', {}, [row('th', ['Name', 'Role', 'Department', 'Call', 'Phone'])]));
    const body = h('tbody');
    g.people.forEach((c) => body.append(row('td', [
      c.name || 'Unnamed',
      c.role || '',
      c.department || '',
      callLabel(sheet, c),
      c.phone || ''
    ])));
    table.append(body);
    doc.append(h('div.ct-doc-scroll', {}, [table]));   // scrolls sideways on a phone
    });
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

/* sheetScenes, placesOf, sheetDateOf, lightOf, lightNote, wrapOf,
   lateScenes and lateText are src/lib/contacts-model.js's. */

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
/* ROUTE_FIELDS is src/lib/contacts-model.js's. */
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
    acts.append(h('button.k-btn.k-btn--secondary.ct-route-btn', {
      type: 'button', 'data-action': 'route-locate', text: 'Use this device’s location'
    }));
  }
  const link = Geo.recceMapsLink(p.name, p.recce);
  acts.append(h('a.k-btn.k-btn--secondary.ct-route-btn.ct-route-map', {
    href: link, target: '_blank', rel: 'noopener noreferrer', text: 'Open in Maps'
  }));
  box.append(acts);
  return box;
}
/* pinText is src/lib/contacts-model.js's. */

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
  return h('div.ct-doc-scroll', {}, [table]);   // scrolls sideways on a phone
}

/* ---- the message ------------------------------------------------- */

/* calledOf, groupCalled and personOf are src/lib/contacts-model.js's;
   the sheet's facts are too, given the film's title from pdf.js. */
const factsOf = (sheet, scenes) => factsFor(sheet, scenes, PDF.projectTitle(), filmPrefs());

const canShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function';

/** WhatsApp-markdown to DOM: *bold* runs become <strong>, everything
    else stays text (textContent only — never HTML from stored words). */
function waPreview(text) {
  const box = h('pre.ct-wa-preview', { 'aria-label': 'Message preview', tabindex: '0' });
  waRuns(text).forEach((runs, i, all) => {
    runs.forEach((r) => box.append(r.bold ? h('strong', { text: r.text }) : document.createTextNode(r.text)));
    if (i < all.length - 1) box.append(document.createTextNode('\n'));
  });
  return box;
}

function renderSend(sheet, contacts, scenes) {
  const facts = factsOf(sheet, scenes);
  const unit = WA.unitMessage(facts);
  const called = calledOf(sheet, contacts);

  const acts = h('div.ct-send-acts');
  acts.append(h('a.k-btn.k-btn--primary.k-btn--pill.ct-send-wa', {
    href: WA.waLink('', unit), target: '_blank', rel: 'noopener noreferrer'
  }, [h('span', { text: 'Send to WhatsApp' })]));
  if (canShare()) acts.append(button({ label: 'Share…', icon: 'share', action: 'sheet-share' }));
  acts.append(button({ label: 'Copy text', icon: 'content_copy', action: 'sheet-copy' }));

  const body = h('div.ct-send-body');
  body.append(h('p.ct-pick-none', {
    text: 'The message below is built from this sheet right now. WhatsApp asks which chat or group it goes to; nothing is sent from here. '
        + unit.length + ' characters.'
  }));
  body.append(waPreview(unit));
  body.append(acts);

  if (!called.length) {
    body.append(h('p.ct-pick-none', { text: 'Call somebody above and each person gets their own message, with their own call time first.' }));
  } else {
    const list = h('ul.ct-send-list');
    groupCalled(sheet, called).forEach((g) => {
      list.append(h('li.ct-send-group', { text: g.label + ' · ' + g.people.length }));
      g.people.forEach((c) => {
      const digits = WA.waDigits(c.phone);
      const li = h('li.ct-send-row', { 'data-contact': c.id });
      li.append(h('span.ct-send-who', {}, [
        h('span.ct-pick-name', { text: c.name || 'Unnamed' }),
        h('span.ct-pick-role', { text: [c.department, c.role].filter(Boolean).join(' · ') })
      ]));
      li.append(h('span.ct-send-call', { text: callLabel(sheet, c) }));
      if (digits) {
        li.append(h('a.k-btn.k-btn--sm.ct-send-btn', {
          href: WA.waLink(digits, WA.personMessage(facts, personOf(sheet, c))),
          target: '_blank', rel: 'noopener noreferrer',
          'aria-label': 'WhatsApp ' + (c.name || 'this person') + ' their call'
        }, [h('span', { text: 'WhatsApp' })]));
      } else {
        li.append(h('button.k-btn.k-btn--sm.ct-send-btn', {
          type: 'button', 'data-action': 'sheet-copy-person',
          'aria-label': 'Copy the message for ' + (c.name || 'this person') + ' — no phone number on the unit list'
        }, [h('span', { text: 'Copy text' })]));
      }
      list.append(li);
      });
    });
    body.append(list);
  }
  const el = panel({
    eyebrow: 'Dispatch',
    title: 'Send this sheet',
    meta: badge({ label: called.length + (called.length === 1 ? ' person called' : ' people called'), tone: called.length ? 'ok' : 'info', dot: true }),
    body
  });
  el.classList.add('ct-send');
  return el;
}

/* ---- render -------------------------------------------------- */
let firstRender = true;
function render() {
  const contacts = Contacts.listContacts();
  const sheets = Contacts.listCallSheets();
  const scenes = Scenes.listScenes();

  const main = h('main', { id: 'main' });
  main.append(renderHeader(contacts, sheets));
  /* ONE tab order, whatever the data: Unit directory, then Call sheets.
     It used to flip once a contact existed, so the tabs swapped places
     under the reader. Call sheets still OPEN first once there is a unit
     to call — chosen through tabs.js on the first render (no hash is
     written), and a hash in the address always wins. */
  const people = renderPeople(contacts);
  const sheetsEl = renderSheets(sheets, contacts, scenes);
  main.append(people, sheetsEl);

  app.replaceChildren(main);
  mountShell();
  if (firstRender) {
    firstRender = false;
    if (contacts.length && !location.hash) revealTarget('call-sheets');
    /* `?sheet=<id>` (Shoot Day's "View call sheet") lands on that day's
       sheet, not the top of the list. Once, after the tab has opened. */
    let want = '';
    try { want = new URLSearchParams(location.search).get('sheet') || ''; } catch (e) { /* ignore */ }
    if (want) requestAnimationFrame(() => requestAnimationFrame(() => {
      const card = document.querySelector('.ct-sheet[data-sheet="' + CSS.escape(want) + '"]');
      if (card) card.scrollIntoView({ block: 'start', behavior: 'instant' });
    }));
  }
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
  /* .ct-person, not any [data-contact]: every call sheet's "who is
     called" rows carry the same attribute and come first in the page,
     so the bare selector found a row on a hidden tab, scrolled there,
     and the focus — and the typing — went nowhere. */
  const card = added && document.querySelector('.ct-person[data-contact="' + CSS.escape(added.id) + '"]');
  const name = card && card.querySelector('.ct-name');
  if (!name) return;
  name.focus({ preventScroll: true });
  // `instant`: html scrolls smoothly, and a smooth trip of a few
  // thousand pixels left the field off-screen for a second of typing.
  card.scrollIntoView({ block: 'center', behavior: 'instant' });
});

delegate(document, 'click', '[data-action="contact-del"]', async (e, el) => {
  const id = contactIdOf(el);
  const c = Contacts.listContacts().find((x) => x.id === id);
  const label = c && c.name ? ' ' + c.name : '';
  if (!await askDanger('Remove' + label + '? They come off every call sheet too.', { confirm: 'Remove person' })) return;
  /* The card the focused ✕ sits on is about to go: name its neighbour
     first (by id), or the Add button, so a keyboard user is not sent
     back to <body>. */
  const cards = [...document.querySelectorAll('.ct-person[data-contact]')];
  const at = cards.findIndex((n) => n.dataset.contact === id);
  const next = cards[at + 1] || cards[at - 1] || null;
  const nextId = next ? next.dataset.contact : '';
  Contacts.removeContact(id);
  render();
  const target = (nextId && document.querySelector('.ct-person[data-contact="' + CSS.escape(nextId) + '"] .ct-name'))
    || document.querySelector('[data-action="contact-add"]');
  if (target) target.focus({ preventScroll: true });
});

delegate(document, 'change', '[data-contact-field]', (e, el) => {
  const id = contactIdOf(el);
  const key = el.dataset.contactField;
  Contacts.updateContact(id, { [key]: el.value });
  // The row's spoken name follows the Name box.
  if (key === 'name') {
    const row = el.closest('.ct-person'), del = row && row.querySelector('[data-action="contact-del"]');
    const nm = el.value.trim();
    if (row) row.setAttribute('aria-label', nm || 'New person');
    if (del) { del.setAttribute('aria-label', 'Remove ' + (nm || 'this person')); del.title = 'Remove ' + (nm || 'this person'); }
  }
  // Department moves the card to another group, so the list has to
  // rebuild — and focus follows the card to its new group rather than
  // falling to <body> (UX audit M1). Everything else only has to
  // reach the call sheets.
  if (key === 'department') {
    render();
    const sel = document.querySelector('.ct-person[data-contact="' + CSS.escape(id) + '"] .ct-dept');
    if (sel) {
      sel.focus({ preventScroll: true });
      sel.closest('.ct-person').scrollIntoView({ block: 'center', behavior: 'instant' });
    }
  } else refreshSheets();
});

delegate(document, 'click', '[data-action="sheet-add"]', () => {
  let want = null;
  try { want = new URLSearchParams(location.search).get('day'); } catch (e) { /* ignore */ }
  const patch = nextSheetPatch(Contacts.listCallSheets(), Locations.calendarDays(Scenes.listScenes()), want);
  const made = Contacts.addCallSheet(patch || undefined);
  render();
  /* The header's button is there on the Cast & Crew tab too: switch to
     Call Sheets (and say so in the address, as a tab click does), or
     the new sheet is made inside a hidden tab and the focus below lands
     on nothing. */
  /* The address names the NEW SHEET, not the section: the fragment
     resolver lands on whatever the hash names, and one that named the
     section pulled the page back to its top after the focus had gone
     to the sheet. */
  if (revealTarget('call-sheets') && location.hash !== '#call-sheets') {
    try { history.replaceState(history.state, '', location.pathname + location.search + '#sheet-' + made.id); } catch (e) { /* ignore */ }
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  }
  if (patch) StudioUI.toast(patch.title + ': ' + patch.sceneIds.length + (patch.sceneIds.length === 1 ? ' scene' : ' scenes') + ' ticked from the stripboard.');
  const last = document.querySelector('.ct-sheet:last-of-type .ct-sheet-title');
  if (last) {
    last.focus({ preventScroll: true });
    // `instant`: the page is smooth-scrolling and the sheet can be thousands of pixels down.
    last.closest('.ct-sheet').scrollIntoView({ block: 'start', behavior: 'instant' });
  }
});

delegate(document, 'click', '[data-action="sheet-del"]', async (e, el) => {
  const id = sheetIdOf(el);
  const s = Contacts.listCallSheets().find((x) => x.id === id);
  const label = s && s.title ? ' "' + s.title + '"' : '';
  if (!await askDanger('Delete call sheet' + label + '? The people and the scenes stay.', { confirm: 'Delete call sheet' })) return;
  const cards = [...document.querySelectorAll('.ct-sheet[data-sheet]')];
  const at = cards.findIndex((n) => n.dataset.sheet === id);
  const next = cards[at + 1] || cards[at - 1] || null;
  const nextId = next ? next.dataset.sheet : '';
  Contacts.removeCallSheet(id);
  render();
  const target = (nextId && document.querySelector('.ct-sheet[data-sheet="' + CSS.escape(nextId) + '"] .ct-sheet-title'))
    || document.querySelector('[data-action="sheet-add"]');
  if (target) target.focus({ preventScroll: true });
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
  /* Repaint what reads the field, not the section: rebuilding
     #call-sheets on a blur removes the control Tab is moving to. */
  syncDoc(el);
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
  const glance = card.querySelector('.ct-glance');
  if (glance) glance.replaceWith(renderDayCard(sheet, scenes));
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

/* dayName() is src/lib/contacts-model.js's. */

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

/* ---- the sides packet --------------------------------------------
   The day's scenes as pages: slug line, length, what happens and every
   element tagged to the scene, one block each, never split across a
   page. The same content as reports.html#sides, drawn into a throwaway
   host for the length of the print, so nothing is stored and a scene
   edited a second ago is what prints. */
function sidesPacket(sheet, scenes) {
  const onSheet = sheetScenes(sheet, scenes);
  const host = h('div.ct-sides-packet', { id: 'ct-sides-packet' });
  host.append(h('div.ct-sp-head', {}, [
    h('span.ct-sp-title', { text: 'Sides' }),
    h('span.ct-sp-meta', { text: onSheet.length + (onSheet.length === 1 ? ' scene' : ' scenes') + ' · '
      + formatEighths(eighthsOf(onSheet)) + ' pages' })
  ]));
  onSheet.forEach((s) => {
    const no = String(s.number || scenes.indexOf(s) + 1);
    const block = h('article.ct-sp-scene', {}, [
      h('div.ct-sp-bar', {}, [
        h('span.ct-sp-no', { text: no }),
        h('span.ct-sp-slug', { text: slugOf(s) }),
        h('span.ct-sp-pp', { text: formatEighths(s.eighths) + ' pp' })
      ]),
      h('p.ct-sp-syn', { text: String(s.synopsis || '').trim() || 'No synopsis written for this scene yet.' })
    ]);
    ELEMENT_CATEGORIES.forEach((cat) => {
      const names = (s.elements && s.elements[cat.id]) || [];
      if (names.length) block.append(h('p.ct-sp-el', {}, [h('strong', { text: cat.label + ' ' }), names.join(', ')]));
    });
    host.append(block);
  });
  return host;
}

delegate(document, 'click', '[data-action="sheet-sides"]', (e, el) => {
  const card = el.closest('.ct-sheet');
  const sheet = card && Contacts.listCallSheets().find((s) => s.id === card.dataset.sheet);
  if (!sheet) return;
  const scenes = Scenes.listScenes();
  if (!sheetScenes(sheet, scenes).length) { StudioUI.toast('Tick a scene on this sheet first.'); return; }
  const project = PDF.projectTitle();
  const day = dayName(sheet.title, project);
  PDF.exportPDF({
    scope: 'sides',
    title: project + ' — Sides — ' + day,
    subtitle: [day, prettyDate(sheet.date)].filter(Boolean).join(' · '),
    classes: ['ct-sides-printing'],
    before: () => (document.getElementById('main') || document.body).append(sidesPacket(sheet, scenes)),
    after: () => document.getElementById('ct-sides-packet')?.remove()
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
      status.textContent = pinRefusal(text);
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
    Locations.setRecce(name, roundedPin(pos.coords));
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
