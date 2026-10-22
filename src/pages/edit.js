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
import { formatDuration } from '../lib/screenplay-analysis.js';
import { listSongs, durationSeconds, setTargetMinutes } from '../lib/songs.js';
import { targetRuntime } from '../lib/target-runtime.js';
import { shootDayOf } from '../lib/locations.js';
import {
  FILTERS, slug, passes as passesFilter, verdictLine, setupsText, attachPickups, puLabel, pickupNote,
  secondsByScene, runNote, syncCheck, projectFormat, deliverablesSummary, cutsNewestFirst, cutMeta,
  conflictBody, csvText, linkApi, storedLinks, restoreLink
} from '../lib/edit-model.js';
import { linkText } from '../lib/links.js';
import { mountStageGuide } from '../ui/stage-guide.js';
import { pageHeader, statCard, statStrip, notice, button, check, field, meter, panel, badge } from '../ui/kit/index.js';

const app = document.getElementById('app');

/* Which rows are showing. In memory only, like shoot.js's open day:
   a filter is not a fact about the film, and verify asserts zero
   idle writes. */
let filter = 'all';

/* The filters, the slug line, the verdicts and the running-time
   sentences are src/lib/edit-model.js's. */
const passes = (row, which = filter) => passesFilter(row, which);

/* ---- pieces -------------------------------------------------- */

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
  const txt = setupsText(row);
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
  const dayN = shootDayOf(s);
  if (dayN) head.append(h('span.el-day-chip.k-mono', { text: 'Day ' + String(dayN).padStart(2, '0') + ' shoot' }));
  head.append(h('span.el-pages', { text: formatEighths(s.eighths || 0) + ' pp' }));
  art.append(head);

  const facts = h('div.el-facts');
  facts.append(gotBadge(row));
  facts.append(setupsLine(row));
  const openPk = row.pickups.filter((p) => !p.done).length;
  if (openPk) facts.append(h('span.el-pending', { text: 'Pending pickup' + (openPk > 1 ? ' · ' + openPk : '') }));
  facts.append(check({
    label: 'Audio synced', checked: row.edit.sync, class: 'el-sync' + (row.edit.sync ? ' is-synced' : ''),
    attrs: { 'data-edit-field': 'sync', 'data-scene': s.id, 'aria-label': 'Audio synced for scene ' + (s.number || '') }
  }));
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

  /* THE FORMS FOLD AWAY. The note, the dailies links and the pick-up
     line used to be open on every card — about 355px a scene, so a
     36-scene film was a 13,000px page of empty fields. They sit in one
     disclosure per scene now; the summary says what is inside, the DOM
     is all still there (a closed <details> keeps its body), and the
     open/closed state is memory only (moreOpen), kept across renders. */
  const more = h('details.el-more', { 'data-scene': s.id });
  if (moreOpen.has(s.id)) more.open = true;
  const nLinks = row.edit.links.length;
  const has = [row.edit.note ? 'note written' : '', nLinks ? nLinks + (nLinks === 1 ? ' link' : ' links') : '']
    .filter(Boolean).join(' · ');
  more.append(h('summary.el-more-head', {}, [
    h('span', { text: 'Note, dailies and pick-ups' }),
    has ? h('span.el-more-meta.k-mono', { text: has }) : null
  ].filter(Boolean)));
  more.append(note);

  /* Where this scene's dailies / review live — addresses only. */
  more.append(linksBlock(row.edit.links, { scope: 'scene', id: s.id, name: 'dailies for scene ' + (s.number || ''), head: 'Dailies' }));

  /* Pick-ups owed on this scene, and a line to add one. */
  const mine = row.pickups;
  if (mine.length) {
    const ul = h('ul.el-pickups');
    mine.forEach((p) => ul.append(pickupItem(p, puNumber(p))));
    art.append(ul);
  }
  const add = h('form.el-pickup-add', { 'data-edit-form': 'pickup', 'data-scene': s.id });
  add.append(h('input', {
    type: 'text', name: 'what', placeholder: 'Add a pick-up — an insert, a line, a wide',
    'aria-label': 'New pick-up for scene ' + (s.number || '')
  }));
  add.append(button({ label: 'Add pick-up', type: 'submit', size: 'sm' }));
  more.append(add);
  art.append(more);

  return art;
}

/* "PU-03": the pick-up's place in the stored list, derived — a label for
   talking about the item, not an id anything stores. */
let puOrder = new Map();
const puNumber = (p) => puLabel(puOrder, p);

function pickupItem(p, tag) {
  const li = h('li.el-pickup' + (p.done ? '.is-done' : '.is-open'));
  if (tag && puOrder.has(p.id)) li.append(h('span.el-pu-tag.k-mono', { text: tag }));
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

/* ---- links: addresses to files that live elsewhere ------------ */

/** A list of anchors with a remove each, and a form to add one. Used on a
    scene row, a shoot day and a cut; `scope`/`id` say which. */
function linksBlock(links, { scope, id, name, head }) {
  const box = h('div.el-links', { 'data-link-scope': scope, 'data-link-id': id });
  if (head) box.append(h('span.el-links-h', { text: head }));
  if (links.length) {
    const ul = h('ul.el-link-list');
    links.forEach((l) => {
      ul.append(h('li.el-link', {}, [
        h('a', { href: l.url, target: '_blank', rel: 'noopener noreferrer', text: linkText(l) }),
        h('button.bd-icon', {
          type: 'button', 'data-edit-action': 'link-del', 'data-link': l.id,
          'aria-label': 'Remove link: ' + linkText(l), text: '×'
        })
      ]));
    });
    box.append(ul);
  }
  const f = h('form.el-link-add', { 'data-edit-form': 'link', 'data-link-scope': scope, 'data-link-id': id });
  f.append(h('input', { type: 'url', name: 'url', placeholder: 'Paste a link (Drive, Frame.io…)', 'aria-label': 'Link to ' + name }));
  f.append(h('input', { type: 'text', name: 'label', placeholder: 'Label (optional)', 'aria-label': 'Label for the link to ' + name }));
  f.append(button({ label: 'Add link', type: 'submit', size: 'sm' }));
  box.append(f);
  return box;
}

/* CUT VERSIONS LOAD WHEN THEY ARE NEAR. The section's own code (cards,
   notes, timecodes, the copy button) is src/ui/edit-cuts.js, a separate
   chunk, so the page's first paint does not carry it. The section itself
   is always here, heading and all, because #cuts is a fragment target and
   must resolve before any data or script arrives (CLAUDE.md, "A nav
   target must not depend on data existing"). */
let cutsMod = null;
let loadCuts = null;      // the current shell's loader, for the "New cut version" CTA
let wantCutName = false;  // the CTA was pressed: focus the new cut's name once it exists
function focusCutName() {
  const input = document.querySelector('#cuts [data-edit-form="cut"] input[name="name"]');
  if (!input) return false;
  wantCutName = false;
  input.focus();
  return true;
}
function cutsShell(data, scenes) {
  const sec = h('section.el-cuts', { id: 'cuts', 'aria-label': 'Cut versions' });
  sec.append(h('h2.el-h2', { text: 'Cut versions' }));
  const fill = (m) => {
    cutsMod = m; m.fillCuts(sec, data, scenes, { render, linksBlock });
    if (wantCutName) requestAnimationFrame(focusCutName);
  };
  loadCuts = () => (cutsMod ? fill(cutsMod) : load());
  if (cutsMod) { fill(cutsMod); return sec; }
  const load = () => import('../ui/edit-cuts.js').then(fill).catch(() => { /* a section, never the page */ });
  if (typeof IntersectionObserver === 'function') {
    const io = new IntersectionObserver((hits) => {
      if (hits.some((x) => x.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: '600px 0px' });
    io.observe(sec);
  } else load();
  return sec;
}

/* ---- the page ------------------------------------------------ */

/* The empty page keeps `#log` — navigation.json sends the phase
   menu to edit.html#log, and a fragment that resolves only once
   scenes exist leaves the person who has none exactly where they
   were (CLAUDE.md, "A nav target must not depend on data existing").
   It also says where the scenes come from, as a link. */
function renderEmpty(reason) {
  const main = h('main#main.el-main.k-page');
  main.append(pageHeader({ eyebrow: ['Post', 'Edit log'], title: 'Edit Log', class: 'bd-head' }));
  main.append(h('div.el-list', { id: 'log' }, [
    h('p.bd-deck.el-empty-why', { text: reason }),
    h('p', {}, [button({ label: 'Open the Scene List', iconAfter: 'arrow_forward', href: 'breakdown.html#scenes' })])
  ]));
  return main;
}

/** Pick-ups whose scene has left the list. Drawn on their own, with
    the same tick and remove, or nothing could ever clear them. */
function orphanBox(list) {
  const box = h('section.el-conflicts.el-orphans', { 'aria-label': 'Pick-ups on removed scenes' });
  box.append(h('h2.el-h2', { text: list.length === 1
    ? 'One pick-up on a scene no longer in the list'
    : list.length + ' pick-ups on scenes no longer in the list' }));
  const ul = h('ul.el-pickups');
  list.forEach((p) => ul.append(pickupItem(p, puNumber(p))));
  box.append(ul);
  box.append(h('p', { text: 'Restore the scene from the Breakdown’s bin, or remove the pick-up here.' }));
  return box;
}

/* `focus` is a selector for the control to hand focus back to after
   the full render, which replaces it — the pattern visualize.js's
   render() set. Without it focus falls to <body> (UX audit M1). */
/* Estimated seconds per scene, from the script's own words. Empty when
   there is no script to read, so nothing is drawn rather than guessed. */
function runPanel(run, target, cov) {
  const box = h('section.el-run', { 'aria-label': 'Running time' });
  const shown = target;
  const head = h('div.el-run-fig');
  if (run && run.scenes) {
    head.append(h('span.el-run-label', { text: 'Running time of the cut' }));
    head.append(h('strong.el-run-val.k-num', { text: formatDuration(run.seconds) }));
    head.append(h('span.el-run-note', { text: runNote(run, shown) }));
  } else {
    head.append(h('span.el-run-label', { text: 'Running time of the cut' }));
    head.append(h('span.el-run-note', { text: cov.counts.inCut
      ? 'Not measurable: the scenes carry no page length.'
      : 'Mark scenes In the cut and their estimated length adds up here.' }));
  }
  box.append(head);
  box.append(field({
    kind: 'number', label: 'Target length', addon: 'min',
    value: target || '', hint: 'One target for the film: the same figure as Reports’ runtime target',
    attrs: { 'data-edit-target': '', min: '0', max: '600', step: '1', 'aria-label': 'Target length in minutes' }
  }));
  return box;
}

/* ---- the side column: sync check, deliverables, cut timeline ---- */

let delMod = null;
function deliverablesPanel(Deliverables) {
  const { prog, open } = deliverablesSummary(Deliverables, projectFormat());
  const owed = h('ul.el-side-list');
  open.slice(0, 3).forEach((i) => owed.append(h('li', {}, [
    h('span', { text: i.label }),
    h('span.el-side-state.k-mono', { text: Deliverables.stateMeta(i.state).label })
  ])));
  return panel({
    eyebrow: 'Master deliverables',
    meta: prog.total ? prog.done + ' / ' + prog.total + ' delivered' : '',
    class: 'el-side-panel',
    body: prog.total
      ? [meter({ label: 'Deliverables delivered', value: prog.done, max: prog.total, show: 'pct', tone: prog.complete ? 'ok' : undefined }),
         open.length ? h('p.el-side-note', { text: 'Owed' + (open.length > 3 ? ' (first 3 of ' + open.length + ')' : '') + ':' }) : h('p.el-side-note', { text: 'Everything on the list is delivered.' }),
         open.length ? owed : null,
         h('a.el-side-link', { href: 'deliverables.html#checklist', text: 'Open the checklist' }),
         h('a.el-side-link', { href: 'deliverables.html#certification', text: 'Certification checks' })]
      : [h('p.el-side-note', { text: 'Nothing on the deliverables list counts yet.' }),
         h('a.el-side-link', { href: 'deliverables.html#checklist', text: 'Open the checklist' })]
  });
}


/** Every figure is derived: scenes in the cut with Audio synced ticked, the
    deliverables checklist's own progress, the cuts as they are stored. */
function asideBlock(cov, data) {
  const aside = h('aside.el-aside', { 'aria-label': 'Sync, deliverables and cut versions' });

  const sync = syncCheck(cov);
  aside.append(panel({
    eyebrow: 'Pre-dub sync check',
    meta: sync.inCut ? sync.synced + ' / ' + sync.inCut : '',
    class: 'el-side-panel',
    body: sync.inCut
      ? [meter({ label: 'Scenes in the cut with audio synced', value: sync.synced, max: sync.inCut, show: 'pct', tone: sync.synced === sync.inCut ? 'ok' : undefined }),
         h('p.el-side-note', { text: sync.note })]
      : [h('p.el-side-note', { text: 'Mark scenes In the cut, then tick Audio synced as each one is conformed.' })]
  }));

  /* The deliverables catalogue and the festival data are a separate chunk, so the
     page's first paint does not carry them (scripts/budget.json); the panel is
     here at once and fills when the chunk arrives. */
  const slot = panel({ eyebrow: 'Master deliverables', class: 'el-side-panel',
    body: [h('p.el-side-note', { text: 'Reading the checklist…' })] });
  aside.append(slot);
  const fill = (D) => slot.replaceWith(deliverablesPanel(D));
  if (delMod) fill(delMod);
  else import('../lib/deliverables.js').then((m) => { delMod = m.default; fill(delMod); })
    .catch(() => { /* a panel, never the page */ });

  const cuts = cutsNewestFirst(data);
  const tl = h('ol.el-side-list.el-timeline');
  cuts.slice(0, 4).forEach((c) => tl.append(h('li', {}, [
    h('a', { href: '#cuts', text: c.name }),
    h('span.el-side-state.k-mono', { text: cutMeta(c) })
  ])));
  aside.append(panel({
    eyebrow: 'Cut version timeline',
    meta: cuts.length ? String(cuts.length) : '',
    class: 'el-side-panel',
    body: cuts.length
      ? [tl, cuts.length > 4 ? h('p.el-side-note', { text: (cuts.length - 4) + ' older in Cut versions below.' }) : null]
      : [h('p.el-side-note', { text: 'No cut versions yet. Add the first one under Cut versions.' })]
  }));
  return aside;
}

function csvDownload() {
  const blob = new Blob([csvText(Scenes.listScenes(), listShots())], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: 'edit-log.csv' });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function render(focus) {
  const scenes = Scenes.listScenes();
  if (!scenes.length) {
    app.replaceChildren(renderEmpty(
      'No scenes yet. This page reads the shoot day’s marks against the scene list, '
      + 'so break the script down first and come back when the cameras have rolled.'));
    after(focus);
    return;
  }

  const data = Edit.loadEdit();
  const cov = Edit.coverage(scenes, listShots(), data);
  puOrder = attachPickups(cov, data);

  const main = h('main#main.el-main.k-page');

  /* ONE PAGE FRAME: the h1 is the page's name; "ready to lock" is a
     state, so it is a badge under it rather than a second title. */
  main.append(pageHeader({
    eyebrow: ['Post', 'Edit log'],
    title: 'Edit Log',
    class: 'bd-head',
    meta: cov.ready ? [badge({ label: 'Ready to lock', tone: 'ok', tag: true })] : [],
    sub: cov.ready
      ? 'Everything the cut needs is in the can and nothing it claims was dropped. '
        + 'Nothing here is stored — it is read from the shoot day’s marks and the shot list.'
      : 'What the set got, against what the cut needs. The marks come from the shoot day, '
        + 'the setups from the shot list; only the cut column and the notes are written here.',
    actions: [button({ label: 'New cut version', icon: 'add', variant: 'primary', href: '#cuts', attrs: { 'data-edit-action': 'cut-new' } })]
  }));

  /* The numbers. Pages, because that is the unit the schedule and
     the budget already count in — a scene count hides a one-line
     insert next to an eight-page set piece. Every figure is derived. */
  const withBar = (card, value, max, label) => {
    /* No `label` to meter(): it would print a second, visible copy of
       the card's own label above the bar. The bar is named for a
       screen reader on its progressbar instead. */
    const bar = meter({ value, max, show: false, class: 'el-stat-bar' });
    bar.querySelector('.k-meter-track')?.setAttribute('aria-label', label);
    card.append(bar);
    return card;
  };
  /* The open pick-ups by scene, so the figure says where, not only how many. */
  const pkNote = pickupNote(cov, scenes);
  main.append(statStrip([
    withBar(statCard({ label: 'Pages in the can', value: cov.pages.inCan + ' / ' + cov.pages.need }),
      cov.pages.eighthsInCan, cov.pages.eighthsNeed, 'Pages in the can'),
    { label: cov.counts.owed === 1 ? 'Scene still owed' : 'Scenes still owed', value: cov.counts.owed,
      note: cov.counts.owed ? 'before the cut can lock' : '', noteTone: cov.counts.owed ? 'warn' : '' },
    withBar(statCard({ label: 'Scenes in the cut', value: cov.counts.inCut + ' / ' + cov.counts.scenes }),
      cov.counts.inCut, cov.counts.scenes, 'Scenes in the cut'),
    { label: 'Locked', value: cov.counts.locked },
    { label: cov.counts.pickups === 1 ? 'Pick-up open' : 'Pick-ups open', value: cov.counts.pickups,
      note: pkNote, noteTone: cov.counts.pickups ? 'warn' : '' }
  ], { class: 'el-stats', label: 'Edit log figures' }));

  /* The running time of the cut: an ESTIMATE read off the script (and
     the song list), for the scenes marked In the cut or Locked. Not drawn
     when nothing is in the cut or the script cannot be measured. */
  const secondsOf = secondsByScene(scenes);
  const run = Object.keys(secondsOf).length
    ? Edit.cutRunTime(cov, secondsOf, listSongs().map((x) => ({ id: x.id, seconds: durationSeconds(x) })))
    : null;
  /* ONE target, and it is Reports' (songs.js `targetMinutes`). A value this
     log stored before that stays readable here as the fallback and is never
     dropped; the first time the field is set, it is the shared one that moves. */
  const target = targetRuntime().minutes;   // the same helper the screenplay's beats panel reads
  main.append(runPanel(run, target, cov));

  /* Conflicts first, because each one is two departments disagreeing
     about a scene, and that is the thing this page exists to show. */
  if (cov.conflicts.length) {
    const box = h('section.el-conflicts', { 'aria-label': 'Conflicts' });
    box.append(h('h2.el-h2', { text: cov.conflicts.length === 1
      ? 'One scene the set dropped and the cut still wants'
      : cov.conflicts.length + ' scenes the set dropped and the cut still wants' }));
    cov.conflicts.forEach((r) => {
      const pk = r.pickups.length;
      box.append(notice({
        tone: 'danger', banner: true, live: true,
        title: 'Conflict · Sc ' + (r.scene.number || '—') + ' · ' + slug(r.scene),
        body: conflictBody(r),
        action: [
          button({ label: 'Mark cut out', icon: 'content_cut', size: 'sm', variant: 'danger',
            attrs: { 'data-edit-action': 'conflict-cut-out', 'data-scene': r.scene.id } }),
          button({ label: pk ? 'Pick-up noted' : 'Schedule pick-up', icon: 'event', size: 'sm', disabled: !!pk,
            title: pk ? 'A pick-up is already on this scene' : 'Adds an open pick-up to this scene',
            attrs: { 'data-edit-action': 'conflict-pickup', 'data-scene': r.scene.id } })
        ]
      }));
    });
    main.append(box);
  }

  if (cov.orphans.length) main.append(orphanBox(cov.orphans));

  /* Toolbar: the filter, and the pick-up list out the door. */
  const body = h('div.el-body');
  const col = h('div.el-col');
  const tools = h('div.el-tools');
  const nav = h('div.el-filters', { role: 'group', 'aria-label': 'Show' });
  FILTERS.forEach((f) => {
    const n = cov.rows.filter((r) => passes(r, f.id)).length;
    nav.append(h('button.k-btn.k-btn--sm.el-filter' + (filter === f.id ? '.is-on' : ''), {
      type: 'button', 'data-edit-action': 'filter', 'data-filter': f.id,
      'aria-pressed': String(filter === f.id),
      text: f.label + ' · ' + n
    }));
  });
  tools.append(nav);
  tools.append(button({
    label: 'Copy pick-up list', icon: 'content_copy',
    title: 'The unshot scenes, the part-shot scenes and every open pick-up, as text',
    attrs: { 'data-edit-action': 'copy-pickups' }
  }));
  tools.append(button({
    label: 'Export CSV', icon: 'download',
    title: 'Every scene with the set’s word, the cut status, audio sync and the editor’s note',
    attrs: { 'data-edit-action': 'export-csv' }
  }));
  col.append(tools);

  const shown = cov.rows.filter((r) => passes(r));
  col.append(h('p.el-order.k-mono', { text: 'Sorted by script order · ' + shown.length + (shown.length === 1 ? ' scene' : ' scenes') + ' shown' }));
  const list = h('div.el-list', { id: 'log' });
  if (!shown.length) {
    list.append(h('p.bd-sub', { text: 'Nothing matches this filter.' }));
  } else {
    shown.forEach((r) => list.append(sceneRow(r)));
  }
  col.append(list);
  body.append(col, asideBlock(cov, data));
  main.append(body);
  main.append(cutsShell(data, scenes));
  main.append(h('p.bd-onward', {}, [
    button({ label: 'Next: Deliverables', iconAfter: 'arrow_forward', href: 'deliverables.html#checklist' })
  ]));

  app.replaceChildren(main);
  after(focus);
}

function after(focus) {
  if (focus) {
    const node = document.querySelector(focus);
    /* A field inside a closed scene disclosure cannot take focus. */
    const fold = node && node.closest('details.el-more');
    if (fold && !fold.open) fold.open = true;
    if (node) node.focus();
  }
  /* The blueprint's post-production questions, answered here (src/ui/stage-guide.js). */
  mountStageGuide(document.getElementById('main'), { stage: 'post' });
  /* Learn-in-place (src/ui/learn.js, loaded on demand so it stays out of first paint).
     It writes nothing; an unknown topic id returns null and is filtered. */
  import('../ui/learn.js').then((m) => {
    const at = document.getElementById("main");
    if (!at) return;
    const boxes = ["camera-to-cloud","proxy","backup-321","checksum"].map((id) => m.learn(id)).filter(Boolean);
    if (boxes.length) at.append(...boxes);
  }).catch(() => { /* a nicety, never the page */ });
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[edit] chrome', e); }
}

/* ---- events — delegated, no inline handlers ------------------ */

/* Which scene disclosures are open: memory only, never stored. */
const moreOpen = new Set();
document.addEventListener('toggle', (e) => {
  const d = e.target;
  if (!d || !d.matches || !d.matches('details.el-more')) return;
  const id = d.getAttribute('data-scene');
  if (d.open) moreOpen.add(id); else moreOpen.delete(id);
}, true);

delegate(document, 'click', '[data-edit-action]', (e, el) => {
  const act = el.getAttribute('data-edit-action');
  if (act === 'cut-new') {
    /* The link still lands on #cuts (fragments.js scrolls); the name of
       the new cut takes the focus once the section's code is in. */
    wantCutName = true;
    if (document.querySelector('#cuts [data-edit-form="cut"]')) requestAnimationFrame(focusCutName);
    else if (loadCuts) loadCuts();
    return;
  }
  if (act === 'filter') {
    filter = el.getAttribute('data-filter') || 'all';
    render('[data-edit-action="filter"][data-filter="' + filter + '"]');
    return;
  }
  if (act === 'conflict-cut-out') {
    /* The editor's own column is the one thing this page writes. */
    const id = el.getAttribute('data-scene');
    const prev = Edit.sceneEdit(id).cut;
    Edit.setSceneEdit(id, { cut: 'out' });
    render();
    if (StudioUI.toast) StudioUI.toast('Scene marked cut out', {
      action: 'Undo', onAction: () => { Edit.setSceneEdit(id, { cut: prev }); render(); }
    });
    return;
  }
  if (act === 'conflict-pickup') {
    const id = el.getAttribute('data-scene');
    const sc = Scenes.listScenes().find((x) => x.id === id);
    if (Edit.addPickup(id, 'Pick-up: scene ' + ((sc && sc.number) || '') + ' was dropped on the day')) {
      render();
      if (StudioUI.toast) StudioUI.toast('Pick-up added to the scene');
    }
    return;
  }
  if (act === 'pickup-del') {
    /* No confirm — a pick-up is one line — but an Undo, because the
       line is the only record of what the editor asked for. It goes
       back where it was, done flag and all. */
    const id = el.getAttribute('data-pickup');
    const all = Edit.listPickups();
    const at = all.findIndex((p) => p.id === id);
    const gone = all[at];
    const row = el.closest('[data-scene]');
    Edit.removePickup(id);
    render(row ? '[data-edit-form="pickup"][data-scene="' + CSS.escape(row.getAttribute('data-scene')) + '"] input' : null);
    if (gone && StudioUI.toast) {
      StudioUI.toast('Pick-up removed: ' + gone.what, {
        action: 'Undo',
        onAction: () => { Edit.restorePickup(gone, at); render(); }
      });
    }
    return;
  }
  if (act === 'export-csv') { csvDownload(); return; }
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
  Edit.setSceneEdit(id, { [key]: el.type === 'checkbox' ? el.checked : el.value });
  /* The cut state changes the verdict, the counts and the filter
     membership; a note changes nothing the page derives. Focus goes
     back to this scene's select — if the filter still shows it. */
  if (key === 'cut') render('[data-edit-field="cut"][data-scene="' + CSS.escape(id) + '"]');
});

/* A note saves as it is typed — on `change` alone, a reload or a
   closed tab took everything since the field was entered (UX audit
   H10). The store write only; the re-render stays on `change`. */
saveOnInput('[data-edit-field]', (el) => {
  Edit.setSceneEdit(el.getAttribute('data-scene'), { [el.getAttribute('data-edit-field')]: el.type === 'checkbox' ? el.checked : el.value });
});

delegate(document, 'change', '[data-edit-target]', (e, el) => {
  setTargetMinutes(el.value);
  /* The person has now set the shared target, so the Edit Log's legacy
     value is retired: left in place, it was the fallback a cleared field
     snapped back to, and nothing else could ever remove it. */
  if (Edit.getTargetMin()) Edit.setTargetMin(0);
  render('[data-edit-target]');
});

delegate(document, 'change', '[data-pickup-done]', (e, el) => {
  const id = el.getAttribute('data-pickup-done');
  Edit.updatePickup(id, { done: !!el.checked });
  render('[data-pickup-done="' + CSS.escape(id) + '"]');
});

delegate(document, 'submit', '[data-edit-form="pickup"]', (e, form) => {
  e.preventDefault();
  const input = form.querySelector('input[name="what"]');
  const id = form.getAttribute('data-scene');
  /* Back into the same scene's add line, so a run of pick-ups is
     typed without reaching for the mouse between them. */
  if (Edit.addPickup(id, input.value)) render('[data-edit-form="pickup"][data-scene="' + CSS.escape(id) + '"] input');
  else input.focus();
});

/* ---- links and cut versions ---------------------------------- */

/* linkApi and storedLinks are src/lib/edit-model.js's. */
const linkSel = (scope, id) => '[data-edit-form="link"][data-link-scope="' + scope + '"][data-link-id="' + CSS.escape(id) + '"] input';

delegate(document, 'submit', '[data-edit-form="link"]', (e, form) => {
  e.preventDefault();
  const scope = form.getAttribute('data-link-scope');
  const id = form.getAttribute('data-link-id');
  const r = linkApi[scope].add(id, {
    url: form.querySelector('[name="url"]').value,
    label: form.querySelector('[name="label"]').value
  });
  if (!r.added) {
    if (StudioUI.toastError) StudioUI.toastError(r.why);
    form.querySelector('[name="url"]').focus();
    return;
  }
  render(linkSel(scope, id));
});

delegate(document, 'click', '[data-edit-action="link-del"]', (e, el) => {
  const box = el.closest('[data-link-scope]');
  const scope = box.getAttribute('data-link-scope');
  const id = box.getAttribute('data-link-id');
  const lid = el.getAttribute('data-link');
  const before = storedLinks(scope, id).slice();
  const at = before.findIndex((l) => l.id === lid);
  const gone = before[at];
  linkApi[scope].del(id, lid);
  render(linkSel(scope, id));
  if (gone && StudioUI.toast) {
    StudioUI.toast('Link removed: ' + linkText(gone), {
      action: 'Undo',
      onAction: () => {
        /* Back at its old position (restoreLink, src/lib/edit-model.js). */
        restoreLink(scope, id, before, at, gone);
        render();
      }
    });
  }
});

render();
