/* ============================================================
   EDIT LOG — the suite's view of the shoot
   ------------------------------------------------------------
   Read src/lib/editlog.js first; it owns every decision about what
   "owed" means. This file lays the answer out and takes the edits.

   THREE COLUMNS OF FACT PER SCENE, THREE OWNERS. What the set got
   (shoot.html's mark — read-only here, on purpose), what the shot
   list planned (visualize.html's setups and their ticks — read-only
   here too), and what the cut says (this page's one write). The
   page never pretends the editor was on the floor: there is no
   "mark shot" control here, and the link on an unshot scene goes to
   the shoot day where that mark belongs.

   A DESK PAGE, UNLIKE SHOOT. The suite has a monitor and a chair.
   So this is a list with a filter bar rather than a phone-first
   card stack — but it still has no table, because the gate measures
   horizontal overflow at 390px and a producer reads this on a phone
   in the car.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/edit.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import { saveOnInput } from '../lib/autosave.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import { listShots } from '../lib/shots.js';
import Edit, { CUT_STATES } from '../lib/editlog.js';

const app = document.getElementById('app');

/* Which rows are showing. In memory only, like shoot.js's open day:
   a filter is not a fact about the film, and verify asserts zero
   idle writes. */
let filter = 'all';

const FILTERS = [
  { id: 'all',   label: 'All scenes' },
  { id: 'owed',  label: 'Still owed' },
  { id: 'can',   label: 'In the can' },
  { id: 'cut',   label: 'In the cut' },
  { id: 'out',   label: 'Cut out' }
];

const slug = (s) => {
  const parts = [s.intExt, s.location || 'NO LOCATION'].filter(Boolean).join(' ');
  return parts + (s.dayNight ? ' — ' + s.dayNight : '');
};

function passes(row, which = filter) {
  switch (which) {
    case 'owed': return row.owed;
    case 'can':  return row.need && row.got === 'full';
    case 'cut':  return row.edit.cut === 'in' || row.edit.cut === 'locked';
    case 'out':  return row.edit.cut === 'out';
    default:     return true;
  }
}

/* ---- pieces -------------------------------------------------- */

function stat(num, label) {
  return h('div.bd-stat', {}, [h('strong', { text: num }), h('span', { text: label })]);
}

/** The set's word on a scene. Read-only; the link goes where it is written. */
function gotBadge(row) {
  const st = row.scene.shotState || '';
  const label = Scenes.shotLabel(st);
  return h('a.el-got.is-' + (st || 'none'), {
    href: 'shoot.html',
    title: 'Marked on the shoot day — change it there',
    text: label
  });
}

function setupsLine(row) {
  if (!row.planned) {
    return h('span.el-setups.is-none', { text: 'no shot list' });
  }
  const txt = row.done + ' of ' + row.planned + (row.planned === 1 ? ' setup' : ' setups') + ' ticked';
  return h('a.el-setups' + (row.setupsOpen ? '.is-open' : ''), { href: 'visualize.html#shot-list', text: txt });
}

function cutSelect(row) {
  const sel = h('select.bd-sel.el-cut', {
    'data-edit-field': 'cut',
    'data-scene': row.scene.id,
    'aria-label': 'Cut status for scene ' + (row.scene.number || '')
  });
  CUT_STATES.forEach((c) => {
    const o = h('option', { value: c.id, text: c.label });
    if (c.id === row.edit.cut) o.selected = true;
    sel.append(o);
  });
  return sel;
}

function sceneRow(row) {
  const s = row.scene;
  const cls = ['article.el-row'];
  if (row.owed) cls.push('is-owed');
  if (row.conflict) cls.push('is-conflict');
  if (row.edit.cut === 'out') cls.push('is-out');
  if (row.edit.cut === 'locked') cls.push('is-locked');
  const art = h(cls.join('.'), { 'data-scene': s.id });

  const head = h('div.el-head');
  head.append(h('span.el-num', { text: s.number || '—' }));
  head.append(h('h3.el-slug', { text: slug(s) }));
  head.append(h('span.el-pages', { text: formatEighths(s.eighths || 0) + ' pp' }));
  art.append(head);

  const facts = h('div.el-facts');
  facts.append(gotBadge(row));
  facts.append(setupsLine(row));
  facts.append(cutSelect(row));
  art.append(facts);

  /* The verdict in a sentence, only when there is something to say.
     A row with nothing wrong carries no sentence rather than a green
     one — "fine" forty times is noise. */
  const says = verdictLine(row);
  if (says) art.append(h('p.el-verdict' + (row.conflict ? '.is-conflict' : ''), { text: says }));

  const note = h('textarea.el-note', {
    rows: '1',
    placeholder: 'Editor’s note — what the cut needs from this scene',
    'data-edit-field': 'note',
    'data-scene': s.id,
    'aria-label': 'Editor’s note for scene ' + (s.number || '')
  });
  note.value = row.edit.note || '';
  art.append(note);

  /* Pick-ups owed on this scene, and a line to add one. */
  const mine = row.pickups;
  if (mine.length) {
    const ul = h('ul.el-pickups');
    mine.forEach((p) => ul.append(pickupItem(p)));
    art.append(ul);
  }
  const add = h('form.el-pickup-add', { 'data-edit-form': 'pickup', 'data-scene': s.id });
  add.append(h('input', {
    type: 'text', name: 'what', placeholder: 'Add a pick-up — an insert, a line, a wide',
    'aria-label': 'New pick-up for scene ' + (s.number || '')
  }));
  add.append(h('button.mini-btn', { type: 'submit', text: 'ADD' }));
  art.append(add);

  return art;
}

function verdictLine(row) {
  const st = row.scene.shotState || '';
  if (row.conflict) return 'Dropped on the day, but the cut has it. One of those two is wrong.';
  if (row.waste) return 'Shot, then cut. Coverage the film will not use.';
  if (row.edit.cut === 'out') return '';
  if (st === 'dropped') return 'Dropped on the day. Mark it cut out, or the cut is waiting on nothing.';
  if (row.got === 'none') return 'Not shot yet.';
  if (row.got === 'part') return 'Part shot — pick-ups owed before this scene can lock.';
  if (row.setupsOpen) return 'In the can on the set’s word; the shot list still has setups unticked.';
  return '';
}

function pickupItem(p) {
  const li = h('li.el-pickup' + (p.done ? '.is-done' : ''));
  const cb = h('input', {
    type: 'checkbox', 'data-pickup-done': p.id,
    'aria-label': 'Done: ' + p.what
  });
  cb.checked = !!p.done;
  li.append(h('label.el-pickup-lab', {}, [cb, h('span', { text: p.what })]));
  li.append(h('button.bd-icon', {
    type: 'button', 'data-edit-action': 'pickup-del', 'data-pickup': p.id,
    'aria-label': 'Remove pick-up: ' + p.what, text: '×'
  }));
  return li;
}

/* ---- the page ------------------------------------------------ */

function renderEmpty(reason) {
  const main = h('main#main.el-main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Post · edit log' }),
    h('h1.bd-title', { text: 'Edit log.' }),
    h('p.bd-deck', { text: reason })
  ]));
  return main;
}

function render() {
  const scenes = Scenes.listScenes();
  if (!scenes.length) {
    app.replaceChildren(renderEmpty(
      'No scenes yet. This page reads the shoot day’s marks against the scene list, '
      + 'so break the script down first and come back when the cameras have rolled.'));
    after();
    return;
  }

  const data = Edit.loadEdit();
  const cov = Edit.coverage(scenes, listShots(), data);
  const byScene = new Map();
  data.pickups.forEach((p) => {
    if (!byScene.has(p.sceneId)) byScene.set(p.sceneId, []);
    byScene.get(p.sceneId).push(p);
  });
  cov.rows.forEach((r) => { r.pickups = byScene.get(r.scene.id) || []; });

  const main = h('main#main.el-main');

  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Post · edit log' }),
    h('h1.bd-title', { text: cov.ready ? 'Ready to lock.' : 'Edit log.' }),
    h('p.bd-deck', {
      text: cov.ready
        ? 'Everything the cut needs is in the can and nothing it claims was dropped. '
          + 'Nothing here is stored — it is read from the shoot day’s marks and the shot list.'
        : 'What the set got, against what the cut needs. The marks come from the shoot day, '
          + 'the setups from the shot list; only the cut column and the notes are written here.'
    })
  ]));

  /* The numbers. Pages, because that is the unit the schedule and
     the budget already count in — a scene count hides a one-line
     insert next to an eight-page set piece. */
  const stats = h('div.bd-stats.el-stats');
  stats.append(stat(cov.pages.inCan + ' / ' + cov.pages.need, 'pages in the can'));
  stats.append(stat(String(cov.counts.owed), cov.counts.owed === 1 ? 'scene still owed' : 'scenes still owed'));
  stats.append(stat(String(cov.counts.inCut), 'in the cut'));
  stats.append(stat(String(cov.counts.locked), 'locked'));
  stats.append(stat(String(cov.counts.pickups), cov.counts.pickups === 1 ? 'pick-up open' : 'pick-ups open'));
  main.append(stats);

  /* Conflicts first, because each one is two departments disagreeing
     about a scene, and that is the thing this page exists to show. */
  if (cov.conflicts.length) {
    const box = h('section.el-conflicts', { 'aria-label': 'Conflicts' });
    box.append(h('h2.el-h2', { text: cov.conflicts.length === 1
      ? 'One scene the set dropped and the cut still wants'
      : cov.conflicts.length + ' scenes the set dropped and the cut still wants' }));
    const ul = h('ul');
    cov.conflicts.forEach((r) => ul.append(h('li', { text: 'Sc ' + (r.scene.number || '—') + ' · ' + slug(r.scene) })));
    box.append(ul);
    box.append(h('p', { text: 'Either the day out of days gets a pick-up day, or the cut lets the scene go. Decide it here, not in the grade.' }));
    main.append(box);
  }

  /* Toolbar: the filter, and the pick-up list out the door. */
  const tools = h('div.el-tools');
  const nav = h('div.el-filters', { role: 'group', 'aria-label': 'Show' });
  FILTERS.forEach((f) => {
    const n = cov.rows.filter((r) => passes(r, f.id)).length;
    nav.append(h('button.btn.el-filter' + (filter === f.id ? '.is-on' : ''), {
      type: 'button', 'data-edit-action': 'filter', 'data-filter': f.id,
      'aria-pressed': String(filter === f.id),
      text: f.label + ' · ' + n
    }));
  });
  tools.append(nav);
  tools.append(h('button.btn', {
    type: 'button', 'data-edit-action': 'copy-pickups',
    text: 'COPY PICK-UP LIST',
    title: 'The unshot scenes, the part-shot scenes and every open pick-up, as text'
  }));
  main.append(tools);

  const list = h('div.el-list', { id: 'log' });
  const shown = cov.rows.filter((r) => passes(r));
  if (!shown.length) {
    list.append(h('p.bd-sub', { text: 'Nothing matches this filter.' }));
  } else {
    shown.forEach((r) => list.append(sceneRow(r)));
  }
  main.append(list);

  app.replaceChildren(main);
  after();
}

function after() {
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[edit] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------ */

delegate(document, 'click', '[data-edit-action]', (e, el) => {
  const act = el.getAttribute('data-edit-action');
  if (act === 'filter') { filter = el.getAttribute('data-filter') || 'all'; render(); return; }
  if (act === 'pickup-del') { Edit.removePickup(el.getAttribute('data-pickup')); render(); return; }
  if (act === 'copy-pickups') {
    const text = Edit.pickupText() || 'Nothing owed — every scene the cut needs is in the can.';
    const done = () => StudioUI.toastSuccess && StudioUI.toastSuccess('Pick-up list copied');
    const fail = () => StudioUI.toastError && StudioUI.toastError('Could not copy — select the text on the page instead');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, fail);
    } else fail();
  }
});

delegate(document, 'change', '[data-edit-field]', (e, el) => {
  const id = el.getAttribute('data-scene');
  const key = el.getAttribute('data-edit-field');
  Edit.setSceneEdit(id, { [key]: el.value });
  /* The cut state changes the verdict, the counts and the filter
     membership; a note changes nothing the page derives. */
  if (key === 'cut') render();
});

/* A note saves as it is typed — on `change` alone, a reload or a
   closed tab took everything since the field was entered (UX audit
   H10). The store write only; the re-render stays on `change`. */
saveOnInput('[data-edit-field]', (el) => {
  Edit.setSceneEdit(el.getAttribute('data-scene'), { [el.getAttribute('data-edit-field')]: el.value });
});

delegate(document, 'change', '[data-pickup-done]', (e, el) => {
  Edit.updatePickup(el.getAttribute('data-pickup-done'), { done: !!el.checked });
  render();
});

delegate(document, 'submit', '[data-edit-form="pickup"]', (e, form) => {
  e.preventDefault();
  const input = form.querySelector('input[name="what"]');
  if (Edit.addPickup(form.getAttribute('data-scene'), input.value)) render();
  else input.focus();
});

render();
