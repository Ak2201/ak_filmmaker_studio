/* ============================================================
   VISUALIZE — shot list, storyboard, lookbook
   ------------------------------------------------------------
   Three views of ONE shot model (src/lib/shots.js) sitting on top of
   the scene model (src/lib/scenes.js), which is READ here and never
   written. The breakdown owns scenes; this page owns what the camera
   does in them.

   Nothing on this page stores a second copy of anything. A shot holds
   a scene id, a frame holds a shot id, and every slug line, scene
   number and shot count on screen is looked up or counted at render
   time. Rename a location in the breakdown and this page says the new
   name, because it was never typed here.

   NO IMAGES IN THE BROWSER. The studio is local-first: a storyboard
   frame and a lookbook entry carry a link or a description, never
   bytes. The reason is in the header of src/lib/shots.js. A frame's
   PICTURE — drawn with AI or uploaded (src/ui/frame-upload.js) — is a
   file in the writer's own Google Drive, and the frame keeps only
   `drive:<fileId>`; the UI says so where the upload button is.

   Every colour is a token, every shape is a --sk-* skin variable, and
   there is not one inline handler — a strict CSP ships in
   vercel.json, so everything clickable carries data-action and is
   bound once by delegate().
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/visualize.css';
import '../styles/pdf.css';
/* The panel around the model call — key form, key bar, gates,
   disclosure — is src/ui/ai-panel.js on every page that has one,
   and this is the stylesheet that dresses it. Loading it here is
   what makes the shared markup look like the studio; without it
   the module's `.ai-*` classes would land on an unstyled page. */
import '../styles/ai.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { actionMenu, wireActionBar } from '../ui/actionbar.js';
import { h, delegate } from '../lib/dom.js';
import { isDisabledEverywhere } from '../lib/plan-gate.js';
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk and ai.js load at a click
import PDF from '../lib/pdf.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Script from '../lib/script.js';
import { matchScenes } from '../lib/screenplay-analysis.js';
import Shots, {
  SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS, SHOT_LENSES, SHOT_RIGS, SHOT_COLUMNS, DEFAULT_COLUMNS, isLinkable
} from '../lib/shots.js';
import { readShotView, saveShotView } from '../lib/chrome-prefs.js';
import { renderBlocking, renderSceneBoard, highlightCamera } from '../ui/blocking.js';
/* Drawn frames (NEXT-UI-REVAMP-PLAN phase 4): the picture is in the
   writer's Drive, the frame keeps `drive:<fileId>`. drive.js and
   drive-sync.js are CORE already; the generation itself (ai.js, the
   Desk) stays behind the pill's click. */
import Drive, { driveFileIdOf } from '../lib/drive.js';
import { onDriveStatus } from '../lib/drive-sync.js';
import { boardJobs, MAX_FRAMES, ASPECTS, aspectOf } from '../lib/board-frames.js';
import { uploadToFrame, uploadManyToFrames, chooseFile } from '../ui/frame-upload.js';
import { driveImage, currentBoardGate, onDriveReconnect, reconnectDrive, wireDriveImages, cachedImageUrl, driveImageBlob } from '../ui/drive-image.js';
import { basicShotDivision } from '../lib/shot-rules.js';
import {
  plural, slugOf, shotSpec, headerFigures, sceneSpread, COV_FILTERS, keepShot as keepFor,
  scenePlan, pickMeta, pickedSummary, uncoveredIds, basicJobs, addBasicShots, basicNoneMatched,
  basicDoneStatus, aiDraftStatus, removeShotIds, draftSnapshot, shotDeleteQuestion, boardDeleteQuestion,
  frameBadge, rigLabel, framesIn, findEntry, restoreEntry, fileStem as stemOf
} from '../lib/visualize-model.js';
import {
  button, buttonGroup, badge, intExtBadge, todBadge, pageHeader, statStrip, notice, field as kitField,
  segmented, meter, check, sym
} from '../ui/kit/index.js';
import { shootDayOf } from '../lib/locations.js';

/* A lazy chunk, for the reason CLAUDE.md gives for Supabase and
   pptxgenjs: it is not needed to look at a shot list. The
   exporter is only reached from a click on Export. */
const exporter = () => import('../lib/shotlist-export.js');

const app = document.getElementById('app');

/* VIEW STATE for the coverage table and the board. None of it is
   stored: a filter, a density and an expanded strip are how you are
   looking at the work, not the work — and the idle-write assertion in
   `verify` would catch a view that saved itself. */
let covFilter = 'all';            // 'all' | 'todo' | 'done'
let covCompact = false;
let uncoveredOpen = false;       // the uncovered-scenes bar's open state, kept across render()
const boardOpen = new Set();      // scene ids whose phone strip shows every shot
const keepShot = (shot) => keepFor(covFilter, shot);

/* HOW THIS DEVICE LOOKS AT THE SHOT LIST: List or Board, the visible
   columns (which are also the export's), grouping by setup, and the
   storyboard's frames per row. Kept in the existing device prefs blob
   (chrome-prefs.js readShotView) and written on a click only — never in
   the project's shot key, which holds the work and nothing about how
   it is viewed. */
const SAVED_VIEW = readShotView();
const PER_ROW = [0, 2, 3, 4];             // 0 = as many as fit
const view = {
  mode: SAVED_VIEW.mode === 'board' ? 'board' : 'list',
  cols: Array.isArray(SAVED_VIEW.cols) ? Shots.cleanColumns(SAVED_VIEW.cols) : DEFAULT_COLUMNS.slice(),
  group: SAVED_VIEW.group === true,
  perRow: PER_ROW.includes(SAVED_VIEW.perRow) ? SAVED_VIEW.perRow : 0
};
const saveView = () => saveShotView({ mode: view.mode, cols: view.cols, group: view.group, perRow: view.perRow });
let colMenuOpen = false;          // the Columns disclosure, kept open across render()
let liveText = '';                // the last keyboard move, for the polite live region

/* ---- small builders -----------------------------------------
   The kit (src/ui/kit/) draws every control on this page. These are
   only the in-table forms of a kit field: a bare control inside the
   kit's `.k-control` frame, because a table cell has no room for a
   label row and the column head already says what the cell is. */
function field(spec, props, value) {
  const el = h(spec, props);
  if (value !== undefined) el.value = value;
  return el;
}
/** A kit select frame around a native select (the cell variant). */
function picker(options, value, attr, name, label) {
  const s = h('select', { [attr]: name, 'aria-label': label });
  options.forEach((o) => {
    const id = typeof o === 'string' ? o : o.id;
    const text = typeof o === 'string' ? o : o.label;
    const opt = h('option', { value: id, text });
    if (o && o.title) opt.title = o.title;
    if (id === value) { opt.selected = true; if (o && o.title) s.title = o.title; }
    s.append(opt);
  });
  return h('div.k-control.k-select.k-control--cell', {}, [s]);
}
/** A kit input frame around an input or textarea (the cell variant). */
function cellInput(el, mono) {
  if (el.tagName === 'TEXTAREA') el.classList.add('k-textarea');
  else el.classList.add('k-input');
  return h('div.k-control.k-control--cell'
    + (mono ? '.k-control--mono' : '') + (el.tagName === 'TEXTAREA' ? '.k-control--textarea' : ''), {}, [el]);
}
/** The row grips: icon buttons in the kit's tray. */
const ICON = { '↑': 'arrow_upward', '↓': 'arrow_downward', '✕': 'delete' };
function ctrlBtn(glyph, action, label, disabled, danger) {
  return button({
    label, icon: ICON[glyph] || glyph, iconOnly: true, size: 'sm', action,
    variant: danger ? 'danger' : 'ghost', disabled: disabled || false, title: label,
    class: 'row-ctrl-btn' + (danger ? ' del' : '')
  });
}
const ctrlTray = (btns, label) => buttonGroup(btns, { label });
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/** The scene's identity, the same three marks everywhere on the page:
    the number as a tag, the slug, and INT/EXT + time of day as badges
    whose letters are printed (colour is never the only signal). */
function sceneIdent(scene) {
  return [
    badge({ label: scene.number || '—', tag: true, class: 'vz-scene-no' }),
    h('span.vz-scene-slug', { text: slugOf(scene) }),
    h('span.vz-scene-badges', {}, [intExtBadge(scene.intExt), todBadge(scene.dayNight)])
  ];
}

/* ---- header -------------------------------------------------- */
function renderHeader(scenes, shots, frames, boards) {
  // Only scenes that still exist count as covered (headerFigures).
  const { covered, refs, done, lens } = headerFigures(scenes, shots, boards);
  const lookbookOn = !isDisabledEverywhere('lookbook');
  const head = pageHeader({
    class: 'bd-head vz-head',
    eyebrow: ['Visualise', 'the film seen before it is shot'],
    title: 'Visualise',
    /* The lookbook is switched off for everybody (plan-matrix), so the
       sentence names it only while it exists; asked of the gate. */
    sub: lookbookOn
      ? 'A shot list is the scene broken into the pieces the camera actually '
       + 'records. The storyboard draws those pieces and the lookbook says what '
       + 'they should feel like — all three hang off the scenes you have already '
       + 'broken down, so nothing is described twice.'
      : 'A shot list is the scene broken into the pieces the camera actually '
       + 'records, and the storyboard draws those pieces. Both hang off the scenes '
       + 'you have already broken down, so nothing is described twice.'
  });
  /* Every figure is counted from the model at render time. A stat that
     cannot be measured (no lens typed anywhere) is not shown at all —
     never a placeholder number. */
  const stats = statStrip([
    { label: shots.length === 1 ? 'shot' : 'shots', value: shots.length,
      note: shots.length ? done + ' in the can' : null, noteTone: shots.length && done === shots.length ? 'ok' : null },
    { label: 'scenes covered', value: covered + ' / ' + scenes.length },
    { label: frames.length === 1 ? 'frame' : 'frames', value: frames.length },
    // Only once a shot carries an estimate: never a placeholder figure.
    Shots.minutesOf(shots).total ? { label: 'estimated', value: Shots.formatMinutes(Shots.minutesOf(shots).total) } : null,
    lookbookOn ? { label: refs === 1 ? 'reference' : 'references', value: refs } : null,   // lookbook boards
    lens ? { label: 'Primary lens', value: lens.lens, note: plural(lens.count, 'setup', 'setups') } : null
  ].filter(Boolean), { class: 'vz-stats', label: 'Visualise in numbers' });
  head.append(stats);
  return head;
}

/* ---- the teaching empty states ------------------------------
   Same shape as the breakdown's and the board's: an empty module
   explains what it is for instead of showing a blank grid, and is
   anchored in the films the library already teaches from. */
function renderNoScenes() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▥', 'aria-hidden': 'true' }),
    h('h2', { text: 'A shot list needs scenes first' }),
    h('p', {
      text: 'A shot belongs to a scene — that is what makes it schedulable, '
          + 'countable and shootable. Break the script into scenes once and this '
          + 'page has something to hang shots on.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Break it down', 'List the scenes with INT/EXT, time, location and length. That is the breakdown page.'),
      how('2', 'Come back here', 'Every scene appears with its own shot list, already numbered.'),
      how('3', 'Cover the scene', 'A wide to see where we are, a medium to play it, a close for the moment that matters.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why it works this way' }),
      h('span', {
        text: ' A shot list written on its own is a list nobody can schedule. '
            + 'Attached to a scene it is a day of work, a page count and a set of '
            + 'lenses to hire — the same shots, suddenly useful.'
      })
    ]),
    button({ label: 'Go to the breakdown', href: 'breakdown.html#scenes', variant: 'primary', pill: true, iconAfter: 'arrow_forward', class: 'bd-cta' })
  ]);
}

function renderNoShots(firstSceneId) {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◱', 'aria-hidden': 'true' }),
    h('h2', { text: 'Cover the first scene' }),
    h('p', {
      text: 'A shot is one continuous run of the camera. Say how big it is, where '
          + 'it looks from, whether it moves, and what we see — four decisions, and '
          + 'the scene is planned.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Size it', 'Wide to establish, medium to play the scene, close for the thing that matters.'),
      how('2', 'Place it', 'Angle and movement. Static is a decision too, and usually the right one.'),
      how('3', 'Describe it', 'One line of what the audience sees. If you cannot write it, it is two shots.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Por Thozhil' }),
      h('span', {
        text: ' holds its interrogation scenes in long, static mediums and saves the '
            + 'close-up for the line that turns the case. The list is where that plan '
            + 'stops being a feeling and starts being a number of setups.'
      })
    ]),
    button({ label: 'Add the first shot', icon: 'add', variant: 'primary', pill: true, action: 'vz-shot-add',
      class: 'bd-cta', attrs: { 'data-scene': firstSceneId } })
  ]);
}

/* ---- section 1: the shot list --------------------------------
   TWO VIEWS OF THE SAME SHOTS (20 Oct 2026): the List (the coverage
   table, a column per field) and the Board (a card per shot with its
   first frame's picture), Celtx / StudioBinder style. Both read the one
   shot model; the toggle, the columns, the grouping and the frames per
   row are how this device looks at the work (view state above), never
   the work. */
function renderShotList(scenes, shots) {
  const wrap = h('section.vz-shots' + (covCompact ? '.is-compact' : '') + '.is-' + view.mode, { id: 'shot-list' });
  /* The tab's count: the shots on the list, counted. No badge at zero —
     a "0" pill reads as a notification, not a number. */
  if (shots.length) wrap.dataset.tabBadge = String(shots.length);
  wrap.append(
    h('h2.bd-h2', { text: 'Shot list' }),
    h('p.bd-sub', {
      text: 'Grouped by scene, in script order. The scene number, the slug line and '
          + 'the counts are read from the breakdown — this page only adds the shots.'
    })
  );

  /* The whole-script export. The per-scene one is on each scene,
     because "this scene" is a thing you ask for while looking at
     that scene and nowhere else. Both go through the same builder
     in src/lib/shotlist-export.js — one scope argument apart — and
     both print the columns the column menu shows. */
  if (shots.length) {
    const time = Shots.formatMinutes(Shots.minutesOf(shots).total);
    wrap.append(h('div.vz-tools.pdf-menu-host', {}, [
      h('span.vz-tools-lab', {
        text: shots.length + (shots.length === 1 ? ' setup' : ' setups')
            + ' across ' + sceneSpread(shots)
            + ' scenes' + (time ? ' · ' + time + ' estimated' : '')
      }),
      h('span.vz-tools-gap'),
      segmented({
        label: 'Shot list view', name: 'vz-mode', value: view.mode, quiet: true,
        action: 'vz-mode', class: 'vz-mode',
        options: [{ value: 'list', label: 'List', icon: 'view_list' }, { value: 'board', label: 'Board', icon: 'grid_view' }]
      }),
      columnMenu(),
      button({
        label: 'Group by setup', icon: 'view_agenda', size: 'sm', action: 'vz-group', class: 'vz-group-btn',
        attrs: { 'aria-pressed': view.group ? 'true' : 'false' },
        title: view.group ? 'Show the shots in shooting order again' : 'Gather each scene’s shots under their camera setup'
      }),
      /* Filter and density: view state over the shot rows, in memory.
         The same controls at every width; on a phone they wrap above
         the cards. */
      segmented({
        label: 'Show shots', name: 'vz-filter', value: covFilter, quiet: true,
        action: 'vz-cov-filter', options: COV_FILTERS, class: 'vz-cov-filter'
      }),
      view.mode === 'list' ? button({
        label: 'Compact', icon: 'density_small', size: 'sm', action: 'vz-cov-compact',
        class: 'vz-cov-compact', attrs: { 'aria-pressed': covCompact ? 'true' : 'false' },
        title: covCompact ? 'Show every field of each shot' : 'Show only the number, size, move, lens and status'
      }) : null,
      actionMenu('Export the shot division', exportItems('all'), { align: 'right' })
    ].filter(Boolean)));
  }

  if (!scenes.length && !shots.length) {
    wrap.append(renderNoScenes());
    return wrap;
  }
  if (!shots.length) {
    wrap.append(renderNoShots(scenes[0].id));
    return wrap;
  }

  /* Covered scenes get the full coverage table. Scenes with no shots
     yet are still every one of them here — a scene hidden is a scene
     nobody covers — but as one compact row each, in script order, so
     the tables are not lost between thirty empty headers. */
  /* The uncovered scenes are gathered into one compact bar at the foot of
     the page (a <details>, closed until opened, still in the DOM) so they
     never push the covered scenes' tables down. render() rebuilds it every
     time, so its open state is kept in `uncoveredOpen`. */
  const dayMins = Shots.minutesByDay(scenes, shots);
  const uncovered = [];
  for (const group of Shots.shotsByScene(scenes)) {
    if (group.scene && !group.shots.length) {
      // "In the can" is a list of shots; a scene with none has none to show.
      if (covFilter === 'done') continue;
      uncovered.push(renderUncovered(group.scene));
      continue;
    }
    wrap.append(renderSceneBlock(group, dayMins));
  }
  if (uncovered.length) {
    const run = h('div.vz-uncovered', { role: 'list', 'aria-label': 'Scenes with no shots yet' });
    run.append(...uncovered);
    const bar = h('details.vz-uncovered-bar', {}, [
      h('summary.vz-uncovered-sum', { text: 'Uncovered scenes (' + uncovered.length + ')' }),
      run
    ]);
    bar.open = uncoveredOpen;
    bar.addEventListener('toggle', () => { uncoveredOpen = bar.open; });
    wrap.append(bar);
  }
  // Where a keyboard move is announced ("Shot 3 is now 2 of 5").
  wrap.append(h('p.visually-hidden', { id: 'vz-live', role: 'status', 'aria-live': 'polite', text: liveText }));
  return wrap;
}

/** The export menu for a scope: the PDF in each layout, the CSV, and the
    frame pictures as a ZIP. Every item prints the visible columns. */
function exportItems(scope) {
  const all = scope === 'all';
  const who = all ? 'Whole script' : 'This scene';
  const act = (kind) => 'vz-' + kind + (all ? '-all' : '-scene');
  return [
    { label: who + ' — PDF list', action: act('pdf'), hint: 'A4', data: { layout: 'list' } },
    { label: who + ' — PDF 4-grid', action: act('pdf'), hint: 'storyboard', data: { layout: 'grid4' } },
    { label: who + ' — PDF 6-grid', action: act('pdf'), hint: 'storyboard', data: { layout: 'grid6' } },
    { label: who + ' — CSV', action: act('csv'), hint: 'spreadsheet' },
    { label: who + ' — frame pictures', action: act('zip'), hint: 'ZIP' }
  ];
}

/** Show / hide columns. A disclosure of checkboxes, so it stays open
    while several are ticked; the same list drives the PDF and the CSV. */
function columnMenu() {
  const d = h('details.vz-colmenu');
  d.open = colMenuOpen;
  d.addEventListener('toggle', () => { colMenuOpen = d.open; });
  d.append(
    h('summary.k-btn.k-btn--secondary.k-btn--sm.vz-colmenu-btn', { 'aria-label': 'Columns: choose what the list shows and exports' }, [
      sym('tune'), h('span', { text: 'Columns' }), h('span.vz-colmenu-n.k-mono', { text: String(view.cols.length) })
    ]),
    h('div.vz-colmenu-panel', { role: 'group', 'aria-label': 'Columns to show and export' }, [
      h('p.vz-colmenu-note', { text: 'The shot number always shows. The PDF prints the same columns; the CSV always carries every column.' }),
      ...SHOT_COLUMNS.map((c) => check({
        label: c.label, checked: view.cols.includes(c.id), class: 'vz-colmenu-item',
        attrs: { 'data-action': 'vz-col', 'data-col': c.id }
      }))
    ])
  );
  return d;
}

/** One uncovered scene: its identity and the way to start covering it. */
function renderUncovered(scene) {
  return h('div.vz-scene.is-empty', { 'data-scene': scene.id, role: 'listitem' }, [
    h('div.vz-scene-head', {}, [
      ...sceneIdent(scene),
      h('span.vz-scene-count', { text: 'no shots yet' }),
      button({ label: 'Add shot', icon: 'add', size: 'sm', action: 'vz-shot-add', class: 'vz-add' })
    ])
  ]);
}

function renderSceneBlock(group, dayMins = new Map()) {
  const scene = group.scene;
  const cov = Shots.coverageOf(group.shots);
  const time = Shots.minutesOf(group.shots);
  const block = h('div.vz-scene.k-panel' + (scene ? '' : '.is-orphan'), { 'data-scene': scene ? scene.id : '' });

  if (scene) {
    /* The current-scene card: identity, length, where the stripboard
       put it, how far the coverage has got and how long it will take.
       Every figure is read off the scene and its shots; the stripboard
       day is the scene's own `shootDay`, and a scene without one says
       so rather than guessing. The day's total is every scene on that
       day added up (Shots.minutesByDay), never stored. */
    const day = shootDayOf(scene);
    const dayTotal = day && dayMins.get(day) ? Shots.formatMinutes(dayMins.get(day).total) : '';
    block.append(h('div.vz-scene-head.k-panel-head', {}, [
      ...sceneIdent(scene),
      h('span.vz-scene-count', {
        text: [formatEighths(Number(scene.eighths) || 0) + ' pgs',
          plural(cov.setups, 'shot', 'shots'), cov.done + ' in the can'].join(' · ')
      }),
      h('span.vz-scene-time.k-mono', {
        title: time.timed ? plural(time.timed, 'shot has', 'shots have') + ' a time estimate' : 'Type minutes on a shot to see the scene’s running time',
        text: time.total ? Shots.formatMinutes(time.total) + (time.timed < time.count ? ' (' + time.timed + ' of ' + time.count + ' timed)' : '') : 'No time estimate'
      }),
      h('span.vz-scene-day', {}, [
        day ? h('a', { href: 'stripboard.html#stripboard', text: 'Day ' + day + ' on the stripboard' + (dayTotal ? ' · ' + dayTotal + ' that day' : '') })
          : h('span', { text: 'Not on the stripboard yet' })
      ])
    ]));
    if (cov.setups) {
      block.append(h('div.vz-scene-progress', {}, [
        meter({
          label: cov.done + ' of ' + plural(cov.setups, 'setup', 'setups') + ' completed',
          value: cov.done, max: cov.setups, show: false,
          tone: cov.done === cov.setups ? 'ok' : null, class: 'vz-scene-meter'
        })
      ]));
    }
  } else {
    block.append(h('div.vz-scene-head.k-panel-head.is-orphan', {}, [
      badge({ label: '!', tag: true, tone: 'warn', class: 'vz-scene-no' }),
      h('span.vz-scene-slug', { text: 'Scene deleted in the breakdown' }),
      h('span.vz-scene-count', { text: plural(group.shots.length, 'orphaned shot', 'orphaned shots') })
    ]),
    notice({
      tone: 'warn', class: 'vz-orphan-note',
      body: 'These shots point at a scene that no longer exists. They are shown so '
          + 'you can move the writing somewhere else or delete them on purpose — '
          + 'nothing here is thrown away quietly.'
    }));
  }

  if (group.shots.length) {
    const shown = group.shots.filter(keepShot);
    if (shown.length) {
      if (view.mode === 'board') block.append(renderShotCards(group.shots, scene, shown));
      else {
        /* Between a phone and a desk the columns do not fit, so the
           table scrolls inside itself and says so (UX audit L30). Below
           720px each row becomes a card instead (visualize.css §1b) and
           the hint is hidden: there is nothing sideways left to find. */
        block.append(h('p.vz-scroll-hint', { 'aria-hidden': 'true', text: 'Swipe the table sideways for every column →' }));
        block.append(renderShotTable(group.shots, scene, shown));
      }
      if (view.group) block.append(h('p.vz-group-note', { text: 'Grouped by setup. Reordering is off while grouped: switch Group by setup off to drag or move shots.' }));
    } else {
      block.append(h('p.vz-filter-none', {
        text: covFilter === 'done' ? 'Nothing in this scene is in the can yet.' : 'Every shot in this scene is in the can.'
      }));
    }
  }

  if (scene) {
    const row = h('div.vz-scene-acts.k-panel-foot.pdf-menu-host', {}, [
      button({ label: 'Add shot', icon: 'add', size: 'sm', action: 'vz-shot-add', class: 'vz-add' })
    ]);
    // Only offered once there is something to put on the sheet.
    if (group.shots.length) {
      row.append(button({
        label: 'Renumber', icon: 'format_list_numbered', size: 'sm', variant: 'ghost', action: 'vz-shot-renumber',
        title: 'Number the shots 1, 2, 3 in this order. Locked numbers (and ones like 4A) are kept.'
      }));
      row.append(actionMenu('Export this scene', exportItems(scene.id), { align: 'right' }));
    }
    block.append(row);
  }
  return block;
}

/* The columns, once. `cell` builds the field; the number column and the
   row grips are not in the menu because a shot always has both. Each
   cell carries its column's words as data-label, which the phone card
   prints over the field (visualize.css §1b). */
const COLDEFS = {
  /* The size reads as its code (EWS, MCU…), which is what a crew says
     and what fits a cell; the full words are the option's title. */
  size:        { label: 'Size', cls: 'vz-c-size', cell: (s) => picker(SHOT_SIZES.map((o) => ({ id: o.id, label: o.id, title: o.label })), s.size, 'data-shot-field', 'size', 'Shot size') },
  angle:       { label: 'Angle', cls: 'vz-c-angle', cell: (s) => picker(SHOT_ANGLES, s.angle, 'data-shot-field', 'angle', 'Camera angle') },
  movement:    { label: 'Move', cls: 'vz-c-move', cell: (s) => picker(SHOT_MOVEMENTS, s.movement, 'data-shot-field', 'movement', 'Camera movement') },
  lens:        { label: 'Lens', cls: 'vz-c-lens', cell: (s) => cellInput(field('input.vz-lens', {
    type: 'text', placeholder: '35mm', list: 'vzLenses', autocomplete: 'off', 'data-shot-field': 'lens', 'aria-label': 'Lens',
    ...(s.lens ? { title: s.lens } : {})
  }, s.lens), true) },
  rig:         { label: 'Light / rig', cls: 'vz-c-rig', cell: (s) => cellInput(field('input.vz-rig', {
    type: 'text', placeholder: 'e.g. key from window', list: 'vzRigs', autocomplete: 'off', 'data-shot-field': 'rig', 'aria-label': 'Lighting or rig'
  }, s.rig), true) },
  /* Setup is free text whose default is the blocking camera's name
     (Shots.setupOf), shown as the placeholder; the camera itself is a
     pick from the marks on this scene's maps. No camera marks, no
     picker: the map is where a camera is made. */
  setup:       { label: 'Setup', cls: 'vz-c-setup', cell: (s, cams) => {
    const cam = Shots.camOf(s, cams);
    const out = [cellInput(field('input.vz-setup', {
      type: 'text', placeholder: cam ? cam.name : 'e.g. A', autocomplete: 'off',
      'data-shot-field': 'setup', 'aria-label': 'Camera setup'
    }, s.setup), true)];
    if (cams.length) {
      out.push(picker([{ id: '', label: 'No camera' }, ...cams.map((c) => ({ id: c.id, label: c.name }))],
        cam ? s.cam : '', 'data-shot-field', 'cam', 'Camera on the blocking map'));
    }
    return out;
  } },
  mins:        { label: 'Min', cls: 'vz-c-mins', cell: (s) => cellInput(field('input.vz-mins', {
    type: 'text', inputmode: 'decimal', placeholder: '—', autocomplete: 'off',
    'data-shot-field': 'mins', 'aria-label': 'Time estimate in minutes', title: 'Minutes for this setup: 12, 7.5, 1h 30 or 1:30'
  }, s.mins), true) },
  description: { label: 'What we see', cls: 'vz-c-desc', cell: (s) => cellInput(field('textarea.vz-desc', {
    rows: '2', placeholder: 'One line of what the audience sees', 'data-shot-field': 'description', 'aria-label': 'What we see'
  }, s.description)) },
  done:        { label: 'Done', cls: 'vz-c-done', cell: (s, cams, n) => doneBox(s, n) }
};
const visibleCols = () => Shots.cleanColumns(view.cols);

/** The status checkbox: the shot's one stored boolean, `done`. */
function doneBox(shot, n) {
  return check({
    label: 'In the can', checked: !!shot.done, class: 'vz-done-check',
    attrs: { 'data-shot-field': 'done', 'aria-label': 'Shot ' + n + ' is in the can' }
  });
}

/** The ordered runs a scene's shots are drawn in: one run in shot order,
    or one per setup when grouped. Filtered shots keep their place. */
function shotRuns(shots, cams) {
  return view.group ? Shots.groupBySetup(shots, cams) : [{ label: null, shots }];
}

/* THE COVERAGE TABLE. One row per setup, a column per visible field.
   Every cell is a field of the one shot record in src/lib/shots.js. */
function renderShotTable(shots, scene, shown = shots) {
  const cols = visibleCols();
  const table = h('table.k-table.vz-table.vz-cov');
  table.append(h('caption.visually-hidden', {
    text: 'Coverage' + (scene ? ' for scene ' + (scene.number || '') : '')
  }));
  const head = h('tr');
  head.append(h('th.vz-c-no', { scope: 'col', text: 'Shot' }));
  cols.forEach((id) => head.append(h('th.' + COLDEFS[id].cls, { scope: 'col', text: COLDEFS[id].label })));
  head.append(h('th.vz-c-ctrl', { scope: 'col' }, [h('span.visually-hidden', { text: 'Order and delete' })]));
  table.append(h('thead', {}, [head]));

  const sortable = !view.group;
  const body = h('tbody', sortable && scene ? { 'data-sort-scene': scene.id } : {});
  const cams = scene ? Shots.sceneCameras(scene.id) : [];
  for (const run of shotRuns(shots, cams)) {
    const mine = run.shots.filter((s) => shown.includes(s));
    if (!mine.length) continue;
    if (run.label !== null) {
      const t = Shots.formatMinutes(Shots.minutesOf(run.shots).total);
      body.append(h('tr.vz-setup-row', {}, [h('th', { scope: 'rowgroup', colspan: String(cols.length + 2) }, [
        h('span.vz-setup-name', { text: run.label || 'No setup' }),
        h('span.vz-setup-meta.k-mono', { text: plural(run.shots.length, 'shot', 'shots') + (t ? ' · ' + t : '') })
      ])]));
    }
    /* Filtered rows keep their place in the FULL list, so the number
       placeholder and the up / down grips still mean the scene's order. */
    for (const shot of mine) body.append(renderShotRow(shot, shots.indexOf(shot), shots.length, cams, cols, sortable && !!scene, edgeOf(shot, shown)));
  }
  table.append(body);
  return h('div.k-table-wrap.vz-table-wrap', {
    role: 'region', tabindex: '0',
    'aria-label': 'Coverage table' + (scene ? ', scene ' + (scene.number || '') : '')
  }, [table]);
}

/** The number cell: the number, its lock, and the provenance tag. */
function numberCell(shot, i) {
  const locked = Shots.isLockedNumber(shot);
  const no = h('td.vz-c-no', { 'data-label': 'Shot' }, [
    h('div.vz-no-row', {}, [
      cellInput(field('input.vz-no', {
        type: 'text', placeholder: String(i + 1),
        'data-shot-field': 'number', 'aria-label': 'Shot number'
      }, shot.number), true),
      button({
        label: locked ? 'Number locked: auto-numbering leaves it alone' : 'Lock this number',
        icon: locked ? 'lock' : 'lock_open', iconOnly: true, size: 'sm', variant: 'ghost',
        action: 'vz-shot-lock', class: 'vz-lock' + (locked ? ' is-locked' : ''),
        attrs: { 'aria-pressed': locked ? 'true' : 'false' },
        title: locked ? 'Locked — Renumber and moves keep this number. Press to unlock.' : 'Unlocked — Renumber and moves number this shot in order. Press to lock.'
      })
    ])
  ]);
  /* A shot a machine drafted is marked, permanently and visibly,
     so a person can always tell what they wrote from what was
     written for them. It is an ordinary shot in every other
     respect — editable, movable, deletable, exported. */
  if (shot.ai) {
    no.append(badge({ label: 'AI draft', tone: 'info', tag: true, class: 'vz-ai-tag',
      title: 'Drafted by AI — edit or delete it like any other shot' }));
  } else if (shot.rules) {
    // The basic breakdown (src/lib/shot-rules.js) — rules, not a model,
    // and marked just as plainly.
    no.append(badge({ label: 'Basic', tag: true, class: 'vz-ai-tag vz-rules-tag',
      title: 'Drafted by the basic breakdown from the script — edit or delete it like any other shot' }));
  }
  return no;
}

/** First / last among the rows ON SCREEN: with a filter on, a move
    steps over hidden shots (Shots.moveShot's `keep`), so the arrows
    are disabled by what is visible, not by the full list. */
const edgeOf = (shot, shown) => ({ first: shown[0] === shot, last: shown[shown.length - 1] === shot });

/** The grip (drag, or the arrow keys) and the row's buttons. */
function rowControls(shot, i, total, sortable, edge = { first: i === 0, last: i === total - 1 }) {
  const n = shot.number || String(i + 1);
  const btns = [];
  if (sortable) {
    btns.push(button({
      label: 'Reorder shot ' + n + ': drag, or press the arrow keys', icon: 'drag_indicator', iconOnly: true, size: 'sm',
      variant: 'ghost', action: 'vz-shot-grip', class: 'vz-grip', title: 'Drag to reorder (or focus and press ↑ / ↓)'
    }));
    btns.push(ctrlBtn('↑', 'vz-shot-up', 'Move this shot earlier', edge.first));
    btns.push(ctrlBtn('↓', 'vz-shot-down', 'Move this shot later', edge.last));
  }
  btns.push(ctrlBtn('✕', 'vz-shot-del', 'Delete this shot', false, true));
  return h('div.row-ctrl.vz-c-ctrl', {}, [ctrlTray(btns, 'Shot ' + n)]);
}

function renderShotRow(shot, i, total, cams = [], cols = visibleCols(), sortable = true, edge) {
  const row = h('tr.vz-row' + (shot.done ? '.is-done' : '') + (shot.ai || shot.rules ? '.is-ai' : ''), {
    'data-shot': shot.id
  });
  if (sortable) row.dataset.sortable = '';
  const n = shot.number || String(i + 1);
  row.append(numberCell(shot, i));
  for (const id of cols) {
    const c = COLDEFS[id];
    const made = c.cell(shot, cams, n);
    row.append(h('td.' + c.cls, { 'data-label': c.label }, Array.isArray(made) ? made : [made]));
  }
  row.append(h('td.vz-c-ctrl', {}, [rowControls(shot, i, total, sortable, edge)]));
  return row;
}

/* THE BOARD: a card per shot, its first frame on top. The same fields as
   the table, read-only here except the status box; the List is where a
   shot is typed. A card is a drop target for pictures too (one frame
   each, through the storyboard's upload). */
function renderShotCards(shots, scene, shown = shots) {
  const cols = visibleCols();
  const cams = scene ? Shots.sceneCameras(scene.id) : [];
  const byShot = Shots.framesByShot();
  const sortable = !view.group && !!scene;
  const out = h('div.vz-cards-wrap.k-panel-body');
  for (const run of shotRuns(shots, cams)) {
    const mine = run.shots.filter((s) => shown.includes(s));
    if (!mine.length) continue;
    if (run.label !== null) {
      const t = Shots.formatMinutes(Shots.minutesOf(run.shots).total);
      out.append(h('h3.vz-setup-head', {}, [
        h('span.vz-setup-name', { text: run.label || 'No setup' }),
        h('span.vz-setup-meta.k-mono', { text: plural(run.shots.length, 'shot', 'shots') + (t ? ' · ' + t : '') })
      ]));
    }
    const grid = h('div.vz-cards', { role: 'list', 'aria-label': 'Shots' + (scene ? ', scene ' + (scene.number || '') : '') });
    if (sortable) grid.dataset.sortScene = scene.id;
    for (const shot of mine) grid.append(renderShotCard(shot, shots.indexOf(shot), shots.length, cams, cols, (byShot.get(shot.id) || [])[0], sortable, edgeOf(shot, shown)));
    out.append(grid);
  }
  return out;
}

function renderShotCard(shot, i, total, cams, cols, frame, sortable, edge) {
  const n = shot.number || String(i + 1);
  const card = h('article.vz-card' + (shot.done ? '.is-done' : ''), {
    'data-shot': shot.id, 'data-drop-shot': shot.id, role: 'listitem', 'aria-label': 'Shot ' + n
  });
  if (sortable) card.dataset.sortable = '';
  const thumb = h('div.vz-card-thumb', { 'data-aspect': aspectOf(frame && frame.aspect) }, [
    frame ? refView(frame.ref) : h('p.vz-frame-view.vz-frame-none', { text: 'No frame yet — drop a picture here' }),
    h('span.vz-card-no.k-mono', { text: n })
  ]);
  card.append(thumb);
  const spec = ['size', 'angle', 'movement', 'lens'].filter((id) => cols.includes(id))
    .map((id) => (id === 'size' ? shotSpec({ size: shot.size }) : String(shot[id] || '').trim())).filter(Boolean);
  card.append(h('div.vz-card-head', {}, [
    h('span.vz-card-spec.k-mono', { text: spec.join(' · ') || 'Shot ' + n }),
    cols.includes('done') ? doneBox(shot, n) : null
  ].filter(Boolean)));
  const meta = [];
  if (cols.includes('setup')) { const su = Shots.setupOf(shot, cams); if (su) meta.push(su); }
  if (cols.includes('rig') && String(shot.rig || '').trim()) meta.push(String(shot.rig).trim());
  if (cols.includes('mins')) { const m = Shots.formatMinutes(Shots.shotMinutes(shot)); if (m) meta.push(m); }
  if (meta.length) card.append(h('p.vz-card-meta.k-mono', { text: meta.join(' · ') }));
  if (cols.includes('description') && shot.description) card.append(h('p.vz-card-desc', { text: shot.description }));
  card.append(h('div.vz-card-foot', {}, [rowControls(shot, i, total, sortable, edge)]));
  return card;
}

/* ============================================================
   SECTION 1b: DRAFT A SHOT DIVISION
   ------------------------------------------------------------
   CLAUDE.md open item 3 — bring your own key — applied to the
   one job on this page a machine is actually good at: turning a
   scene that is already written into the list of setups that
   shoots it.

   TWO GATES, INDEPENDENTLY. No key and no script are different
   problems with different fixes, so the panel says which one it
   is and what to do about it rather than showing a disabled
   button. A third condition — no scenes — is the shot list's
   own empty state above, and the panel defers to it.

   THE SCREENPLAY IS THE USER'S UNPUBLISHED WORK. Nothing here
   runs on load, nothing runs on a timer. The panel states
   exactly what leaves the browser and where it goes, and the
   only thing that sends it is a click on a button that says so.

   NOTHING IS OVERWRITTEN. Drafted shots are APPENDED. A scene
   that already has shots is unticked by default and says why,
   and the run that just happened can be undone in one click
   because the ids it created are still in memory.

   All of the machinery is in src/lib/ai.js and is loaded on
   demand. The key lives on the device, unscoped and unsynced —
   the header of that file has the four places it is
   deliberately absent from.

   THE PANEL AROUND IT IS NOT WRITTEN HERE. The key form, the key
   bar, the key gate, the disclosure, the status and the error
   line all come from src/ui/ai-panel.js, exactly as they do for
   the dialogue pass on write.html and the step critique on
   feature.html. This page used to carry its own copy of all six,
   which is the duplication that module exists to prevent — and
   the worst kind of it, because a hand-copied key form is a
   hand-copied chance to lose `type="password"`. What is left
   below is the only thing that is actually about shots.
   ============================================================ */

/* View state. None of it is stored: a selection is not the
   user's work, and a run in flight that survived a reload would
   be a lie about a request that is no longer happening.

   Nothing here mirrors the key or the model any more. Whether a
   key exists, what it is masked to and which model is chosen are
   AI's answers, asked at render time through the panel module —
   a page-local copy of that state is a copy that can go stale
   the moment another panel changes it. */
let aiPicked = null;           // Set<sceneId>, or null until first render
let aiStatus = '';
let aiError = '';
let aiRunning = false;
let aiLastRun = [];            // shot ids from the most recent draft
let aiLastSnap = null;         // what those shots looked like when drafted (draftSnapshot)

/* THE AI HALF IS THE AI DESK'S 'shot-draft' TASK (src/lib/ai-tasks.js):
   the same draftShotDivision() over the ticked scenes, the same
   matchScenes() pairing, and the same append-only write marked
   `ai: true`. The pill below is the way in — greyed with the Pro offer
   on a plan without AI, a link to Settings with no key — so this page
   loads no model code and holds no key form. `after` hands the ids it
   wrote back here, so "Undo the last draft" still names them. */
function shotsDrafted(made) {
  aiLastRun = made || [];
  aiLastSnap = draftSnapshot(aiLastRun);
  aiError = '';
  aiStatus = aiDraftStatus(aiLastRun.length);
  preservingFocus(render);
}

/* Which script text goes with which scene is matchScenes()'s answer,
   the same one the breakdown and the reports print: by heading, not by
   position, with the text above the first heading belonging to no
   scene. This page used to cut the script itself and keep that
   preamble as slice 0, so every scene was sent the previous scene's
   pages. The run handler reads `bySceneId` from here rather than
   slicing a second time. */
function aiScenePlan(scenes, shots) {
  const script = Script.loadScript();
  const match = matchScenes(scenes, script.elements);
  return scenePlan(script, match, shots);
}

function aiScenePicker(plan) {
  const list = h('div.vz-ai-scenes', { role: 'group', 'aria-label': 'Scenes to draft' });
  for (const row of plan.rows) {
    const id = row.scene.id;
    const box = h('input', {
      type: 'checkbox', 'data-action': 'vz-ai-pick', 'data-scene': id,
      'aria-label': 'Draft shots for scene ' + (row.scene.number || '—')
    });
    box.checked = aiPicked.has(id);
    const label = h('label.k-check.vz-ai-pickrow' + (row.existing ? '.has-shots' : ''), {}, [
      box,
      badge({ label: row.scene.number || '—', tag: true, class: 'vz-scene-no' }),
      h('span.vz-ai-pickslug', { text: slugOf(row.scene) }),
      h('span.vz-ai-pickmeta', { text: pickMeta(row) })
    ]);
    list.append(label);
  }
  return list;
}

/* The panel's pieces that do not need the AI module. The basic
   breakdown must not be hidden behind a lazy import that is only
   there for the key: with the panel module still loading, or failed,
   the rules still run. */
const localGate = (lead, body, cta) =>
  h('div.ai-gate', {}, [h('p', {}, [h('strong', { text: lead + ' ' }), h('span', { text: body })]), cta]);
const localStatus = (text) => (text ? h('p.ai-status', { role: 'status', text }) : null);
const localError = (text) =>
  (text ? h('p.ai-error', { role: 'alert' }, [h('strong', { text: 'It did not run. ' }), h('span', { text })]) : null);

function renderAI(scenes, shots) {
  const wrap = h('section.vz-ai', { id: 'draft' });
  wrap.append(
    h('h2.bd-h2', { text: 'Draft a shot division' }),
    h('p.bd-sub', {
      text: 'A first pass at the coverage, from the script you have already written. '
          + 'It is a draft — every shot it makes is an ordinary shot you can change, '
          + 'reorder or delete, and it is marked so you always know which is which.'
    })
  );

  /* GATE 2 — the script. Also independent: a key with no script
     is a different problem with a different answer, and the rules
     have nothing to read without one either. */
  const plan = aiScenePlan(scenes, shots);
  if (!plan.hasScript) {
    wrap.append(localGate(
      'There is no script yet.',
      'A shot division is a reading of the scene as written — without the '
        + 'pages there is nothing to read, and a division invented from a slug '
        + 'line is a guess dressed up as a plan.',
      button({ label: 'Write the screenplay', href: 'screenplay.html', variant: 'primary', pill: true, iconAfter: 'arrow_forward', class: 'bd-cta' })
    ));
    return wrap;
  }

  /* The scene list is the shot list's own empty state above. */
  if (!scenes.length) {
    wrap.append(h('p.bd-none', {
      text: 'Break the script into scenes first — a shot belongs to a scene, and the '
          + 'breakdown is where scenes are made.'
    }));
    return wrap;
  }

  if (aiPicked === null) {
    // First render: everything that has no shots yet. A scene that is
    // already covered is not silently re-covered.
    aiPicked = uncoveredIds(plan);
  }

  wrap.append(notice({
    class: 'vz-note vz-basic-note', title: 'No key needed.', icon: 'rule',
    body: 'The basic breakdown reads the ticked scenes on this device, by rule: a master, '
        + 'an over-the-shoulder pair for a two-hander, a single for each speaker, the '
        + 'shot lines you wrote, a move where somebody runs, a POV where somebody looks, '
        + 'and inserts for the props. Nothing leaves this browser. The AI draft sends the '
        + 'ticked scenes only, and shows you what it sends before it does.'
  }));

  wrap.append(h('div.vz-ai-picks', {}, [
    button({ label: 'Tick all', size: 'sm', action: 'vz-ai-all' }),
    button({ label: 'Clear', size: 'sm', variant: 'ghost', action: 'vz-ai-none' }),
    h('span.vz-ai-count', { text: pickedSummary(scenes, aiPicked) })
  ]));
  if (plan.notes.length) wrap.append(h('p.bd-match-note', { text: plan.notes.join(' ') }));
  wrap.append(aiScenePicker(plan));

  const none = aiPicked.size === 0;
  const basicBtn = button({
    label: 'Basic breakdown (no AI key needed)', variant: 'primary', icon: 'rule',
    action: 'vz-basic-run', disabled: none || aiRunning
  });
  /* ctx is computed at the click, so it carries the scenes ticked THEN. */
  const pill = aiPill({
    label: 'Draft ' + plural(aiPicked.size, 'scene', 'scenes') + ' with AI',
    tasks: ['shot-draft'],
    ctx: () => {
      const ids = [...(aiPicked || [])];
      return { identity: 'shots:' + ids.slice().sort().join(','), sceneIds: ids, after: shotsDrafted };
    }
  });
  wrap.append(h('div.vz-ai-acts', {}, [
    basicBtn,
    pill,
    aiLastRun.length && !aiRunning
      ? button({ label: 'Undo the last draft (' + aiLastRun.length + ')', icon: 'history', action: 'vz-ai-undo' })
      : null
  ].filter(Boolean)));

  const status = localStatus(aiStatus);
  if (status) wrap.append(status);
  const error = localError(aiError);
  if (error) wrap.append(error);

  return wrap;
}

/* ---- section 2: the storyboard -------------------------------
   A board, grouped by scene, in shot order — which is the order the
   shot list above already holds, so the board cannot drift out of
   step with it. */
function renderStoryboard(scenes, shots, frames) {
  const wrap = h('section.vz-board', { id: 'storyboard', 'data-per-row': String(view.perRow) });
  wrap.append(
    h('h2.bd-h2', { text: 'Storyboard' }),
    h('p.bd-sub', {
      text: 'A frame per drawing, hanging off the shot it draws. Grouped by scene, '
          + 'in shot order — move a shot in the Shot List and the board follows it.'
    }),
    noImageNote('A frame holds a picture, a link or a description. Upload a picture or '
      + 'draw one with AI: either is saved to your own Google Drive, and the frame (and every '
      + 'backup file) keeps only a link to it, because an image would not fit in this '
      + 'browser and would not survive a backup. Or paste the URL of your drawing, or '
      + 'write the frame in words. Words are often the better storyboard anyway.',
    'Pictures are kept in your Google Drive.')
  );
  if (shots.length) wrap.append(renderDraw(scenes, shots, frames));
  /* Frames per row: how wide the board's cards sit on a desk. A phone
     always shows one sideways row (visualize.css §9), so the control
     is only drawn where it does something. */
  if (shots.length && frames.length) {
    wrap.append(h('div.vz-board-tools', {}, [
      segmented({
        label: 'Shots per row', name: 'vz-per-row', value: String(view.perRow), quiet: true,
        action: 'vz-per-row', class: 'vz-per-row',
        options: PER_ROW.map((n) => ({ value: String(n), label: n ? String(n) + ' per row' : 'Fit' }))
      }),
      h('span.vz-board-hint', { text: 'Drop pictures on a shot to add one frame per picture.' })
    ]));
  }

  if (!shots.length) {
    /* The Shot List is another tab, and with no scenes it cannot add a
       shot either, so the line names where the next step really is. */
    wrap.append(scenes.length
      ? h('p.bd-none', {}, ['A frame draws a shot, so the shot list comes first. Add a shot in the ',
        h('a', { href: '#shot-list', text: 'Shot List' }), ' and every shot gets a slot on the board.'])
      : h('p.bd-none', {}, ['A frame draws a shot, and a shot belongs to a scene, so the breakdown comes first. ',
        h('a', { href: 'breakdown.html#scenes', text: 'Break the script into scenes' }), ', then add shots in the Shot List.']));
    return wrap;
  }
  if (!frames.length) {
    wrap.append(renderNoFrames(shots[0].id));
    return wrap;
  }

  const byShot = Shots.framesByShot();
  for (const group of Shots.shotsByScene(scenes)) {
    if (!group.shots.length) continue;
    const sid = group.scene ? group.scene.id : '';
    const open = boardOpen.has(sid);
    const nFrames = framesIn(group.shots, byShot);
    const block = h('div.vz-bd-scene.k-panel');
    block.append(h('div.vz-scene-head.k-panel-head' + (group.scene ? '' : '.is-orphan'), {}, [
      ...(group.scene
        ? sceneIdent(group.scene)
        : [badge({ label: '!', tag: true, tone: 'warn', class: 'vz-scene-no' }),
          h('span.vz-scene-slug', { text: 'Scene deleted in the breakdown' })]),
      h('span.vz-scene-count', { text: plural(group.shots.length, 'shot', 'shots') + ' · ' + plural(nFrames, 'frame', 'frames') }),
      /* On a phone the scene's shots are one sideways row of cards, so
         the head offers the whole set as a stack. A desk grid already
         shows every card, and the button is hidden there. */
      group.shots.length > 1 ? button({
        label: open ? 'Show as a row' : 'View all (' + group.shots.length + ')',
        icon: open ? 'unfold_less' : 'unfold_more', size: 'sm', variant: 'ghost',
        action: 'vz-board-all', class: 'vz-board-all',
        attrs: { 'data-scene': sid, 'aria-expanded': open ? 'true' : 'false' }
      }) : null
    ]));
    const strip = h('div.vz-strip.k-panel-body' + (open ? '.is-open' : ''), {
      role: 'list', 'aria-label': 'Shots and frames' + (group.scene ? ', scene ' + (group.scene.number || '') : '')
    });
    group.shots.forEach((shot) => strip.append(renderShotColumn(shot, byShot.get(shot.id) || [])));
    block.append(strip);
    wrap.append(block);
  }
  return wrap;
}

/* ---- drawn frames: the AI pill, or why it cannot run --------
   Real counts only: how many shots have no drawn frame yet. The gate
   (board-frames.js boardGate) is read live, and this block alone is
   repainted when Drive's state moves — never the page, which would
   take the cursor out of a field being typed in. */
function renderDraw(scenes, shots, frames) {
  wireDriveImages();
  const todo = boardJobs({ shots, scenes, frames, max: Infinity }).jobs.length;
  const gate = currentBoardGate();
  const wrap = h('div.vz-draw.k-panel', { 'data-gate': gate.state });
  const head = h('div.vz-draw-acts');
  if (!todo) {
    head.append(button({ label: 'Draw frames with AI', icon: 'auto_awesome', disabled: true, class: 'vz-draw-off' }));
  } else if (gate.ok) {
    head.append(aiPill({
      label: 'Draw ' + plural(Math.min(todo, MAX_FRAMES), 'frame', 'frames') + ' with AI',
      tasks: ['board-frames'],
      provider: 'gemini',
      ctx: () => ({ identity: 'board:all', after: () => render() })
    }));
  } else {
    head.append(button({ label: 'Draw frames with AI', icon: 'auto_awesome', disabled: true, class: 'vz-draw-off' }));
    if (gate.reconnect) head.append(button({ label: 'Reconnect Drive', size: 'sm', action: 'drive-reconnect', class: 'vz-draw-fix' }));
    if (gate.href) head.append(button({ label: gate.hrefLabel || 'Fix this', size: 'sm', href: gate.href, class: 'vz-draw-fix' }));
  }
  head.append(h('span.vz-draw-count.k-mono', {
    text: todo ? plural(todo, 'shot', 'shots') + ' without a drawing' : 'Every shot has a drawing'
  }));
  wrap.append(head);
  if (!gate.ok && todo) wrap.append(h('p.vz-draw-why.drv-img-note', { role: 'status', text: gate.text }));
  wrap.append(h('p.vz-draw-note', {
    text: 'Gemini draws one picture per shot that has none yet, up to ' + MAX_FRAMES + ' a run, in the style you pick '
      + '(pencil, ink, marker or colour) with your own Gemini key. You tick the ones to keep; nothing is saved until you accept. '
      + 'Kept pictures go to your Google Drive — not into this browser and not into backup files, which keep only the link.'
  }));
  return wrap;
}

function repaintDraw() {
  const el = document.querySelector('.vz-draw');
  if (!el) return;
  const scenes = Scenes.listScenes();
  const shots = Shots.listShots();
  if (!shots.length) return;
  const next = renderDraw(scenes, shots, Shots.listFrames());
  if (next.dataset.gate !== el.dataset.gate || next.textContent !== el.textContent) el.replaceWith(next);
}
onDriveStatus(repaintDraw);
onDriveReconnect(repaintDraw);
/* The session is restored after the first paint (cloud.js reads it
   behind an await), so "signed out" can be true only for a moment:
   repaint when it lands. Reached through the global, as comments.js
   does, after every module in the chunk has evaluated. */
setTimeout(() => {
  const c = window.StudioCloud;
  if (c && typeof c.onAuth === 'function') c.onAuth(() => repaintDraw());
  repaintDraw();
}, 0);

function renderNoFrames(firstShotId) {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '▢', 'aria-hidden': 'true' }),
    h('h2', { text: 'Draw the first frame' }),
    h('p', {
      text: 'A storyboard is not art — it is a question answered in advance. Where '
          + 'is the camera, who is in the frame, and what changes by the end of the '
          + 'shot. A frame that answers those three is doing its job.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Pick the shot', 'Every frame belongs to a shot from the list above, so the board is always in order.'),
      how('2', 'Point at the image', 'Paste the link to a drawing or a photograph you already have somewhere.'),
      how('3', 'Or write it', 'Describe the frame in one sentence. On a small film that is faster and just as useful.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Kaaka Muttai' }),
      h('span', {
        text: ' was boarded in a notebook by hand. What travelled to set was not the '
            + 'drawing but the decision inside it — which is exactly the part that '
            + 'fits in a sentence.'
      })
    ]),
    button({ label: 'Add the first frame', icon: 'add', variant: 'primary', pill: true,
      action: 'vz-frame-add', class: 'bd-cta', attrs: { 'data-shot': firstShotId } })
  ]);
}

function renderShotColumn(shot, frames) {
  // A drop target: pictures dropped here become one frame each.
  const col = h('article.vz-shotcol', { 'data-shot': shot.id, 'data-drop-shot': shot.id, role: 'listitem' });
  /* The card's head is the parent shot, read off it: number, size,
     lens and the move as a chip. Nothing is typed twice. */
  col.append(h('div.vz-shotcol-head', {}, [
    badge({ label: shot.number || '—', tag: true, class: 'vz-shotcol-no' }),
    h('span.vz-shotcol-spec', { text: shotSpec(shot) }),
    shot.movement ? h('span.vz-shotcol-move.k-mono', { text: shot.movement }) : null,
    h('span.vz-shotcol-count', { text: plural(frames.length, 'frame', 'frames') })
  ]));
  // Always present, even when empty (CSS hides it): the shot-list's
  // change handler patches this line in place rather than re-rendering,
  // and a handler that has to create its own target is a handler that
  // forgets to.
  col.append(h('p.vz-shotcol-desc', { text: shot.description }));

  frames.forEach((frame, i) => col.append(renderFrame(frame, shot, i, frames.length)));

  col.append(h('div.vz-shotcol-acts', {}, [
    button({ label: 'Frame', icon: 'add', size: 'sm', action: 'vz-frame-add', class: 'vz-add-frame' }),
    button({ label: 'Pictures', icon: 'upload', size: 'sm', variant: 'ghost', action: 'vz-frame-bulk', class: 'vz-add-pics',
      title: 'Choose several pictures: one new frame each, saved to your Google Drive' })
  ]));
  return col;
}

function renderFrame(frame, shot, i, total, cams) {
  const card = h('div.vz-frame', { 'data-frame': frame.id, 'data-aspect': aspectOf(frame.aspect) });

  /* The slate: a frame-shaped space for the reference, labelled the way
     the camera report labels it — the frame id top left, the lens top
     right when the shot names one, the move bottom left. Every mark is
     read off the shot; none is invented for the picture. */
  const slate = h('div.vz-frame-slate');
  const cam = Shots.camOf(shot, cams || Shots.sceneCameras(shot.sceneId));
  const rig = rigLabel(shot, cam);
  // Element.append(null) prints "null" (CLAUDE.md row 22): filter first.
  slate.append(...[
    h('span.vz-frame-badge.k-mono', { text: frameBadge(shot, i) }),
    shot.lens ? h('span.vz-frame-lens.k-mono', { text: shot.lens }) : null,
    refView(frame.ref),
    h('span.vz-frame-move.k-mono', { text: shot.movement }),
    rig ? h('span.vz-frame-rig.k-mono', { text: rig }) : null
  ].filter(Boolean));
  card.append(slate);

  /* A drawn frame's reference is the Drive file it lives in. The stored
     `drive:<fileId>` is a pointer, not something to read or retype, so
     the field says where the picture is and is read-only, with no
     data-frame-field: nothing typed here can overwrite the pointer.
     The stored ref is unchanged. */
  card.append(driveFileIdOf(String(frame.ref || '').trim())
    ? kitField({
      label: 'Reference', value: 'In your Google Drive',
      hint: 'The picture lives in your Drive; the frame keeps only the link.',
      class: 'vz-fieldset vz-ref-drive', attrs: { readonly: '', 'aria-label': 'Frame reference', 'aria-readonly': 'true' }
    })
    : kitField({
      label: 'Reference', value: frame.ref, placeholder: 'https://… or describe the frame in words',
      class: 'vz-fieldset', attrs: { 'data-frame-field': 'ref', 'aria-label': 'Frame reference' }
    }));
  /* The panel's three lines, Boords-style. Action shows the older
     caption until it is edited (Shots.frameAction); the edit moves it. */
  card.append(kitField({
    label: 'Action', value: Shots.frameAction(frame), placeholder: 'What happens — what changes by the end of the shot',
    class: 'vz-fieldset', attrs: { 'data-frame-field': 'action', 'aria-label': 'Frame action' }
  }));
  card.append(kitField({
    label: 'Dialogue', value: frame.dialogue, placeholder: 'The line spoken over this frame',
    class: 'vz-fieldset', attrs: { 'data-frame-field': 'dialogue', 'aria-label': 'Frame dialogue' }
  }));
  card.append(kitField({
    label: 'Camera', value: frame.camera, placeholder: 'Push in, rack focus, pan left…',
    class: 'vz-fieldset', attrs: { 'data-frame-field': 'camera', 'aria-label': 'Frame camera note' }
  }));

  /* The frame's shape: the slate takes it from [data-aspect] on the
     card (visualize.css), so a 2.39:1 film boards in 2.39:1. */
  const aspect = h('select.vz-frame-aspect', { 'data-frame-field': 'aspect', 'aria-label': 'Frame shape' });
  for (const a of ASPECTS) aspect.append(h('option', { value: a.id, text: a.label, selected: a.id === aspectOf(frame.aspect) }));
  /* In the kit's select frame, so it is a field's height beside the
     other fields rather than a bare 20px select. */
  card.append(h('label.vz-frame-shape', {}, [h('span.vz-frame-shape-lab', { text: 'Shape' }),
    h('div.k-control.k-select.vz-frame-aspect-box', {}, [aspect])]));

  card.append(h('div.vz-frame-acts', {}, [
    button({ label: driveFileIdOf(String(frame.ref || '').trim()) ? 'Replace picture' : 'Upload picture', icon: 'upload', size: 'sm',
      action: 'vz-frame-upload', class: 'vz-frame-upload', attrs: { 'data-label': frameBadge(shot, i) } }),
    ctrlTray([
    ctrlBtn('↑', 'vz-frame-up', 'Move this frame earlier', i === 0),
    ctrlBtn('↓', 'vz-frame-down', 'Move this frame later', i === total - 1),
    ctrlBtn('✕', 'vz-frame-del', 'Delete this frame', false, true)
  ], 'Frame')]));
  return card;
}

/* ---- section 3: the lookbook ---------------------------------- */
function renderLookbook(boards) {
  const wrap = h('section.vz-look', { id: 'lookbook' });
  wrap.append(
    h('h2.bd-h2', { text: 'Lookbook' }),
    h('p.bd-sub', {
      text: 'Named boards — palette, light, texture, wardrobe — each holding the '
          + 'references you will hand to a department, and the reason each one is there.'
    }),
    noImageNote('References are links or notes, never uploaded images. A board that '
      + 'says why a reference matters survives the meeting; a wall of pictures does not.')
  );

  if (!boards.length) {
    wrap.append(renderNoBoards());
    return wrap;
  }

  const grid = h('div.vz-boards');
  boards.forEach((board, i) => grid.append(renderBoard(board, i, boards.length)));
  wrap.append(grid, button({ label: 'Add board', icon: 'add', action: 'vz-board-add', class: 'vz-add' }));
  return wrap;
}

function renderNoBoards() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◈', 'aria-hidden': 'true' }),
    h('h2', { text: 'Say what the film looks like' }),
    h('p', {
      text: 'A lookbook is how a department head learns the film without reading the '
          + 'script. Four boards is usually enough: the palette, the light, the '
          + 'textures and the wardrobe.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Name a board', 'One board per question. Palette. Light. Texture. Wardrobe.'),
      how('2', 'Add references', 'A title, a link or a note, and — the important column — why it matters.'),
      how('3', 'Hand it over', 'The "why" is what the department acts on. A reference without one is decoration.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Why the third column exists' }),
      h('span', {
        text: ' "This frame, because the practicals do all the work and nothing is '
            + 'lit from the front" is a brief. The same frame with no sentence under '
            + 'it is a picture somebody liked.'
      })
    ]),
    button({ label: 'Add the first board', icon: 'add', variant: 'primary', pill: true,
      action: 'vz-board-add', class: 'bd-cta' })
  ]);
}

function renderBoard(board, i, total) {
  const card = h('article.vz-boardcard.k-panel', { 'data-board': board.id });

  card.append(h('div.vz-board-head.k-panel-head', {}, [
    h('div.k-control.vz-board-namebox', {}, [field('input.k-input.vz-board-name', {
      type: 'text', placeholder: 'Board name — Palette, Light, Texture…',
      'data-board-field': 'name', 'aria-label': 'Board name'
    }, board.name)]),
    h('span.vz-board-count', { text: plural(board.entries.length, 'reference', 'references') }),
    h('div.vz-board-acts', {}, [ctrlTray([
      ctrlBtn('↑', 'vz-board-up', 'Move this board up', i === 0),
      ctrlBtn('↓', 'vz-board-down', 'Move this board down', i === total - 1),
      ctrlBtn('✕', 'vz-board-del', 'Delete this board', false, true)
    ], 'Board')])
  ]));

  const body = h('div.k-panel-body.vz-board-body');
  body.append(kitField({
    label: 'What this board is for', value: board.note, placeholder: 'One line the department can read first',
    class: 'vz-fieldset', attrs: { 'data-board-field': 'note', 'aria-label': 'What this board is for' }
  }));

  if (board.entries.length) {
    const table = h('table.k-table.vz-table.vz-refs');
    const head = h('tr');
    [['Title', ''], ['Reference', 'vz-c-ref'], ['Why it matters', 'vz-c-desc'], ['', 'vz-c-ctrl']]
      .forEach(([label, cls]) => head.append(
        h('th' + (cls ? '.' + cls : ''), { scope: 'col', text: label })
      ));
    table.append(h('thead', {}, [head]));

    const tbody = h('tbody');
    board.entries.forEach((entry) => tbody.append(renderEntry(entry)));
    table.append(tbody);
    body.append(h('div.k-table-wrap.vz-table-wrap', {
      role: 'region', tabindex: '0', 'aria-label': 'References on ' + (board.name || 'this board')
    }, [table]));
  } else {
    body.append(h('p.vz-board-none', {
      text: 'Nothing on this board yet. A reference is a title, a link or a note, '
          + 'and the sentence that says why it is here.'
    }));
  }
  card.append(body);

  card.append(h('div.k-panel-foot.vz-board-foot', {}, [
    button({ label: 'Add reference', icon: 'add', size: 'sm', action: 'vz-entry-add', class: 'vz-add' })
  ]));
  return card;
}

function renderEntry(entry) {
  const row = h('tr', { 'data-entry': entry.id });
  row.append(h('td', {}, [
    cellInput(field('input', {
      type: 'text', placeholder: 'What it is',
      'data-entry-field': 'title', 'aria-label': 'Reference title'
    }, entry.title))
  ]));

  const refCell = h('td.vz-c-ref');
  refCell.append(cellInput(field('input', {
    type: 'text', placeholder: 'https://… or a note',
    'data-entry-field': 'ref', 'aria-label': 'Reference link or note'
  }, entry.ref)));
  if (isLinkable(entry.ref)) {
    refCell.append(h('a.vz-entry-link', {
      href: entry.ref, target: '_blank', rel: 'noopener noreferrer', text: 'Open  ↗'
    }));
  }
  row.append(refCell);

  row.append(h('td.vz-c-desc', {}, [
    cellInput(field('textarea', {
      rows: '2', placeholder: 'Why it matters — what the department should take from it',
      'data-entry-field': 'why', 'aria-label': 'Why it matters'
    }, entry.why))
  ]));
  row.append(h('td.row-ctrl.vz-c-ctrl', {}, [
    ctrlBtn('✕', 'vz-entry-del', 'Remove this reference', false, true)
  ]));
  return row;
}

/** How a reference is shown: a link when it is one, the words when it
    is not, and an invitation when it is empty. Its own element so a
    single edit can swap it without rebuilding the page — see the
    change handler, and the note there about not stealing focus. */
function refView(ref) {
  const value = String(ref || '').trim();
  const fileId = driveFileIdOf(value);
  if (fileId) {
    // The picture is in the writer's Drive: fetched with the Drive token,
    // or a "Reconnect Drive" control — never a broken image.
    const pic = driveImage(fileId, 'Drawn storyboard frame');
    pic.classList.add('vz-frame-view', 'vz-frame-pic');
    return pic;
  }
  if (isLinkable(value)) {
    return h('a.vz-frame-view.vz-frame-link', {
      href: value, target: '_blank', rel: 'noopener noreferrer',
      text: 'Open the reference  ↗'
    });
  }
  if (value) return h('p.vz-frame-view.vz-frame-desc', { text: value });
  return h('p.vz-frame-view.vz-frame-none', {
    text: 'No picture yet — upload one, paste a link, or describe it below.'
  });
}

/* ---- shared bits --------------------------------------------- */
function noImageNote(text, title = 'No image uploads.') {
  return notice({ class: 'vz-note', title, icon: 'info', body: text });
}


/* ---- render --------------------------------------------------- */
/* The scene board reads the script through the same content match every
   other view uses, never a copy of it. */
function sceneBoardPairs(scenes) {
  try { return matchScenes(scenes, Script.loadScript().elements).pairs; }
  catch (e) { return []; }
}

function render(focus) {
  const scenes = Scenes.listScenes();
  const shots = Shots.listShots();
  const frames = Shots.listFrames();
  const boards = Shots.listBoards();

  const main = h('main', { id: 'main' });
  main.append(
    renderHeader(scenes, shots, frames, boards),
    renderShotList(scenes, shots),
    renderAI(scenes, shots),
    renderStoryboard(scenes, shots, frames),
    renderBlocking(scenes, render),
    renderSceneBoard(scenes, shots, frames, null, sceneBoardPairs(scenes), render),
    renderLookbook(boards),
    h('datalist#vzLenses', {}, SHOT_LENSES.map((l) => h('option', { value: l }))),
    h('datalist#vzRigs', {}, SHOT_RIGS.map((l) => h('option', { value: l })))
  );

  app.replaceChildren(main);
  /* Learn-in-place (src/ui/learn.js, loaded on demand so it stays out of first paint).
     It writes nothing; an unknown topic id returns null and is filtered. */
  import('../ui/learn.js').then((m) => {
    const at = document.querySelector("#blocking > h2");
    /* Several renders in a row (an arrow key held on a mark) each start
       this import, and every promise lands in the same DOM: insert only
       where the box is not already there, or they stack up. */
    if (!at || at.parentElement.querySelector(':scope > details.learn[data-learn="blocking-diagram"]')) return;
    const boxes = ["blocking-diagram"].map((id) => m.learn(id)).filter(Boolean);
    if (boxes.length) at.after(...boxes);
  }).catch(() => { /* a nicety, never the page */ });
  mountShell();
  wireActionBar();
  // Chrome initialises at import time, when #app is still empty — the
  // trap short.js fell into. Re-init after every render.
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[visualize] chrome', e); }

  if (focus) {
    const node = document.querySelector(focus);
    if (node) node.focus();
  }
}

function say(message, type) {
  try { StudioUI.toast(message, { type: type || 'info' }); } catch (e) { /* chrome may not be up */ }
}

function download(text, filename, mime) {
  downloadBlob(new Blob([text], { type: mime || 'text/plain' }), filename);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const fileStem = () => stemOf(PDF.projectTitle());

/* ---- the shot division as a document -------------------------
   One path for both scopes. `scope` is a scene id or 'all', and
   everything downstream — the document, the CSV, the subtitle,
   the filename — takes the same argument, so the two cannot
   drift apart. */
/** A frame's picture as this page visit holds it, for the PDF sheet. */
const imageFor = (frame) => {
  const id = driveFileIdOf(String((frame && frame.ref) || '').trim());
  return id ? cachedImageUrl(id) : '';
};

async function exportShotlist(scope, kind, layout = 'list') {
  let Sheet;
  try { Sheet = await exporter(); }
  catch (e) { say('The exporter could not be loaded. Check the connection and try again.', 'warn'); return; }

  const summary = Sheet.summarise(scope);
  if (!summary.shots) { say('There are no shots in that scope yet.', 'warn'); return; }
  // The column menu is the export's column list too.
  const columns = visibleCols();

  if (kind === 'csv') {
    const tail = scope === Sheet.ALL ? 'shot_division' : 'shot_division_scene';
    // One fixed schema, whatever the column menu hides (see toCSV).
    download(Sheet.toCSV(scope), fileStem() + '_' + tail + '.csv', 'text/csv');
    say('Exported ' + summary.shots + ' setups as CSV.');
    return;
  }
  if (kind === 'zip') { exportPictures(Sheet, scope); return; }

  const main = document.getElementById('main');
  if (!main) return;
  layout = Sheet.layoutOf(layout);
  /* A storyboard sheet prints the pictures this page visit already
     holds; with a Drive token, the ones not yet on screen are fetched
     first (one at a time) so the sheet is not half blank. */
  if (layout !== 'list' && Drive.hasToken()) {
    const want = Sheet.frameFiles(scope).filter((f) => !cachedImageUrl(f.fileId));
    if (want.length) say('Collecting ' + plural(want.length, 'picture', 'pictures') + ' from your Google Drive for the sheet…');
    for (const f of want) { try { await driveImageBlob(f.fileId); } catch (e) { /* printed as an empty box */ } }
  }
  let node = null;
  PDF.exportPDF({
    scope: 'shotlist',
    setup: 'a4',
    label: Sheet.labelFor(scope),
    title: PDF.projectTitle() + ' — ' + Sheet.labelFor(scope),
    subtitle: Sheet.subtitleFor(scope),
    before: () => { node = Sheet.buildDocument(scope, { columns, layout, imageFor }); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

/* THE FRAME PICTURES AS A ZIP. Only frames whose picture is a file in
   the writer's Drive (`drive:<fileId>`) have bytes to send; each is
   read with the Drive token (or taken from this page visit), stored
   uncompressed by src/lib/zip-write.js and handed over as one file.
   Nothing is kept: the archive is built, downloaded and dropped. */
async function exportPictures(Sheet, scope) {
  const list = Sheet.frameFiles(scope);
  if (!list.length) { say('No frame in that scope has a picture in your Google Drive yet.', 'warn'); return; }
  if (!Drive.hasToken() && list.some((f) => !cachedImageUrl(f.fileId))) {
    say('The pictures are in your Google Drive: press Reconnect Drive on the storyboard first, then export again.', 'warn');
    return;
  }
  say('Collecting ' + plural(list.length, 'picture', 'pictures') + ' from your Google Drive…');
  const files = [];
  let missed = 0;
  for (const f of list) {
    try {
      const blob = await driveImageBlob(f.fileId);
      files.push([f.stem + Sheet.extFor(blob.type), new Uint8Array(await blob.arrayBuffer())]);
    } catch (e) { missed++; }
  }
  if (!files.length) { say('Drive did not send any of the pictures. Reconnect Drive and try again.', 'warn'); return; }
  const { zipStore } = await import('../lib/zip-write.js');
  downloadBlob(new Blob([zipStore(files)], { type: 'application/zip' }),
    fileStem() + (scope === Sheet.ALL ? '_frames' : '_frames_scene') + '.zip');
  say('Exported ' + plural(files.length, 'picture', 'pictures') + ' as a ZIP.'
    + (missed ? ' ' + plural(missed, 'picture was', 'pictures were') + ' not sent by Drive and left out.' : ''));
}

const layoutOfEl = (el) => el.dataset.layout || 'list';
delegate(document, 'click', '[data-action="vz-pdf-all"]', (e, el) => exportShotlist('all', 'pdf', layoutOfEl(el)));
delegate(document, 'click', '[data-action="vz-csv-all"]', () => exportShotlist('all', 'csv'));
delegate(document, 'click', '[data-action="vz-zip-all"]', () => exportShotlist('all', 'zip'));
delegate(document, 'click', '[data-action="vz-pdf-scene"]', (e, el) => {
  const id = sceneIdOf(el);
  if (id) exportShotlist(id, 'pdf', layoutOfEl(el));
});
delegate(document, 'click', '[data-action="vz-csv-scene"]', (e, el) => {
  const id = sceneIdOf(el);
  if (id) exportShotlist(id, 'csv');
});
delegate(document, 'click', '[data-action="vz-zip-scene"]', (e, el) => {
  const id = sceneIdOf(el);
  if (id) exportShotlist(id, 'zip');
});

/* ---- the AI panel ---------------------------------------------
   Every one of these is reached from a click and from nowhere
   else. Nothing below runs on load.

   THE KEY AND THE MODEL CALL ARE NOT HERE. The key lives in
   Settings, and the AI draft runs in the AI Desk (the pill in
   renderAI). What is below is the picker, the basic breakdown and
   the undo — the parts that are about shots. */
delegate(document, 'change', 'input[data-action="vz-ai-pick"]', (e, box) => {
  const id = box.dataset.scene;
  if (!id || !aiPicked) return;
  if (box.checked) aiPicked.add(id); else aiPicked.delete(id);
  // The render replaces the box: put the focus back on it, or each tick
  // sends a keyboard user to the top of the page.
  render('input[data-action="vz-ai-pick"][data-scene="' + CSS.escape(id) + '"]');
});
delegate(document, 'click', '[data-action="vz-ai-all"]', () => {
  aiPicked = new Set(Scenes.listScenes().map((s) => s.id));
  render('[data-action="vz-ai-all"]');
});
delegate(document, 'click', '[data-action="vz-ai-none"]', () => {
  aiPicked = new Set();
  render('[data-action="vz-ai-none"]');
});

/* The basic breakdown: the same picker, the same append-only write
   and the same Undo as the AI draft, with the rules in
   src/lib/shot-rules.js in place of the model. No key, no network,
   no module to wait for — it is in this page's own bundle. */
delegate(document, 'click', '[data-action="vz-basic-run"]', async () => {
  if (aiRunning) return;
  const scenes = Scenes.listScenes();
  const chosen = scenes.filter((s) => aiPicked && aiPicked.has(s.id));
  if (!chosen.length) { aiError = 'Tick at least one scene.'; render(); return; }

  const plan = aiScenePlan(scenes, []);
  const { jobs, noScript } = basicJobs(chosen, plan);

  const result = await basicShotDivision(jobs);
  const made = addBasicShots(result.byScene);
  aiLastRun = made;
  aiLastSnap = draftSnapshot(made);

  if (!made.length) {
    aiStatus = '';
    aiError = basicNoneMatched(chosen.length);
    render();
    return;
  }
  aiStatus = basicDoneStatus(made.length, result.byScene.size, noScript);
  aiError = '';
  /* The scenes just drafted come off the pick: left ticked, a second
     press drafted all 254 shots again on top of the first. */
  for (const id of result.byScene.keys()) aiPicked.delete(id);
  render();
  say(plural(made.length, 'shot', 'shots') + ' drafted. Read them before you shoot them.');
});

delegate(document, 'click', '[data-action="vz-ai-undo"]', async () => {
  if (!aiLastRun.length) return;
  if (!await askDanger('Remove the ' + aiLastRun.length + ' shots from the last draft?\n\n'
    + 'Only those shots are removed. Anything you wrote or edited since is kept.')) return;
  const { kept } = removeShotIds(aiLastRun, aiLastSnap);
  aiLastRun = [];
  aiLastSnap = null;
  aiPicked = null;   // re-read: the scenes the draft covered are uncovered again
  aiStatus = 'The last draft was removed.'
    + (kept.length ? ' ' + plural(kept.length, 'shot you edited or drew a frame for was', 'shots you edited or drew frames for were') + ' kept.' : '');
  render();
});

/* ---- events — delegated, no inline handlers -------------------
   An id comes off the button itself when it has one (the empty-state
   calls to action live outside any row) and otherwise off the nearest
   ancestor that carries it. */
const idOf = (el, name) =>
  el.dataset[name] || (el.closest('[data-' + name + ']') || { dataset: {} }).dataset[name];

const sceneIdOf = (el) => idOf(el, 'scene');
const shotIdOf  = (el) => idOf(el, 'shot');
const frameIdOf = (el) => idOf(el, 'frame');
const boardIdOf = (el) => idOf(el, 'board');
const entryIdOf = (el) => idOf(el, 'entry');

/* shots */
delegate(document, 'click', '[data-action="vz-shot-add"]', (e, el) => {
  const sceneId = sceneIdOf(el);
  if (!sceneId) return;
  const shot = Shots.addShot(sceneId);
  render();
  const input = document.querySelector('[data-shot="' + shot.id + '"] .vz-desc');
  if (input) input.focus();
});
/* ---- the view: List / Board, columns, grouping, frames per row ----
   Each is a click, and each is saved for this device (saveView) at the
   click and nowhere else. */
delegate(document, 'click', '[data-action="vz-mode"]', (e, el) => {
  const v = el.dataset.value === 'board' ? 'board' : 'list';
  if (v === view.mode) return;
  view.mode = v;
  saveView();
  render('[data-action="vz-mode"][data-value="' + v + '"]');
});
delegate(document, 'change', 'input[data-action="vz-col"]', (e, box) => {
  const id = box.dataset.col;
  const on = new Set(view.cols);
  if (box.checked) on.add(id); else on.delete(id);
  view.cols = Shots.cleanColumns([...on]);
  saveView();
  render('input[data-action="vz-col"][data-col="' + CSS.escape(id) + '"]');
});
/* The Columns disclosure closes on Escape and on a click outside it. */
document.addEventListener('click', (e) => {
  const open = document.querySelector('details.vz-colmenu[open]');
  if (open && !open.contains(e.target)) { open.open = false; colMenuOpen = false; }
});
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const open = document.querySelector('details.vz-colmenu[open]');
  if (!open) return;
  open.open = false; colMenuOpen = false;
  const sum = open.querySelector('summary');
  if (sum) sum.focus();
});
delegate(document, 'click', '[data-action="vz-group"]', () => {
  view.group = !view.group;
  saveView();
  render('[data-action="vz-group"]');
});
delegate(document, 'click', '[data-action="vz-per-row"]', (e, el) => {
  const n = Number(el.dataset.value);
  if (!PER_ROW.includes(n) || n === view.perRow) return;
  view.perRow = n;
  saveView();
  render('[data-action="vz-per-row"][data-value="' + n + '"]');
});

/* ---- order and numbers -----------------------------------------
   Every move goes through one path: reorder, then — only if the scene
   was already in auto order — auto-number it (Shots.autoNumber leaves
   locked numbers, and ones like 4A, alone; a scene numbered by hand is
   never renumbered by a move, only by the Renumber button), then repaint with the focus back on the moved shot. */
const sceneOfShot = (id) => (Shots.listShots().find((s) => s.id === id) || {}).sceneId;
function announce(id) {
  const list = Shots.listShots();
  const shot = list.find((s) => s.id === id);
  if (!shot) return;
  const mine = list.filter((s) => s.sceneId === shot.sceneId);
  liveText = 'Shot ' + (shot.number || '') + ' is now ' + (mine.indexOf(shot) + 1) + ' of ' + mine.length + '.';
  const live = document.getElementById('vz-live');
  if (live) live.textContent = liveText;
}
function moveShotBy(id, delta, focusAction) {
  const scene = sceneOfShot(id);
  if (scene === undefined) return;
  // Renumber only a scene that was in auto order before the move; a
  // scene numbered by hand keeps every number it was given.
  const ordered = Shots.sceneAutoOrdered(scene);
  Shots.moveShot(id, delta, covFilter === 'all' ? undefined : keepShot);
  if (ordered) Shots.autoNumber(scene);
  render();
  if (focusAction === 'vz-shot-grip') {
    const g = document.querySelector('[data-shot="' + CSS.escape(id) + '"] [data-action="vz-shot-grip"]');
    if (g) g.focus();
  } else {
    refocusMoved('shot', id, focusAction, focusAction === 'vz-shot-up' ? 'vz-shot-down' : 'vz-shot-up');
  }
  announce(id);
}
delegate(document, 'click', '[data-action="vz-shot-renumber"]', (e, el) => {
  const id = sceneIdOf(el);
  if (!id) return;
  const n = Shots.autoNumber(id);
  render('[data-scene="' + CSS.escape(id) + '"] [data-action="vz-shot-renumber"]');
  say(n ? plural(n, 'number', 'numbers') + ' changed. Locked numbers were kept.' : 'The shots were already numbered in order.');
});
delegate(document, 'click', '[data-action="vz-shot-lock"]', (e, el) => {
  const id = shotIdOf(el);
  const shot = Shots.listShots().find((s) => s.id === id);
  if (!shot) return;
  const locked = Shots.isLockedNumber(shot);
  const typed = String(shot.number || '').trim();
  /* Unlocking a number like "4A" hands it back to the list: it takes
     the next ordinal at once, or it would still read as the writer's own
     — with an Undo, because the typed number is otherwise gone. */
  const ordinal = /^\d*$/.test(typed);
  const before = Shots.listShots().filter((s) => s.sceneId === shot.sceneId)
    .map((s) => [s.id, { number: s.number, numLocked: !!s.numLocked }]);
  if (!locked && !typed) {
    /* Locking a blank stamps the number the row shows, so the lock holds
       a real number rather than a placeholder autoNumber could repeat. */
    const mine = Shots.listShots().filter((s) => s.sceneId === shot.sceneId);
    Shots.updateShot(id, { numLocked: true, number: String(mine.findIndex((s) => s.id === id) + 1) });
  } else {
    Shots.updateShot(id, locked && !ordinal ? { numLocked: false, number: '' } : { numLocked: !locked });
  }
  if (locked) Shots.autoNumber(shot.sceneId);
  render('[data-shot="' + CSS.escape(id) + '"] [data-action="vz-shot-lock"]');
  if (locked && !ordinal && StudioUI.toast) {
    StudioUI.toast('Shot ' + typed + ' unlocked and renumbered', {
      action: 'Undo',
      onAction: () => { for (const [sid, was] of before) Shots.updateShot(sid, was); render(); }
    });
  }
});
/* The grip: the arrow keys move the shot one place (a list reads ↑ ↓,
   a board of cards ← → as well). Drag is below. */
delegate(document, 'keydown', '[data-action="vz-shot-grip"]', (e, el) => {
  const back = e.key === 'ArrowUp' || e.key === 'ArrowLeft';
  const fwd = e.key === 'ArrowDown' || e.key === 'ArrowRight';
  if (!back && !fwd) return;
  e.preventDefault();
  moveShotBy(shotIdOf(el), back ? -1 : 1, 'vz-shot-grip');
});

/* DRAG TO REORDER, with pointer events so a mouse, a pen and a finger
   all work (the grip is `touch-action: none`). The drop computes the
   scene's FULL order — rows hidden by a filter keep their place — and
   writes it through Shots.reorderShots, then auto-numbers. Escape or a
   cancelled pointer puts everything back untouched. */
let drag = null;
function clearDropMarks() {
  document.querySelectorAll('.is-drop-before, .is-drop-after, .is-dragging')
    .forEach((n) => n.classList.remove('is-drop-before', 'is-drop-after', 'is-dragging'));
}
delegate(document, 'pointerdown', '[data-action="vz-shot-grip"]', (e, grip) => {
  if (e.button !== 0) return;
  const item = grip.closest('[data-sortable]');
  const box = grip.closest('[data-sort-scene]');
  if (!item || !box) return;
  drag = {
    id: item.dataset.shot, scene: box.dataset.sortScene, box, item, pid: e.pointerId,
    x: e.clientX, y: e.clientY, moved: false, target: null, after: false,
    cards: box.classList.contains('vz-cards')
  };
  try { grip.setPointerCapture(e.pointerId); } catch (err) { /* older engines */ }
});
document.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.pid) return;
  if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 5) return;
  drag.moved = true;
  e.preventDefault();
  clearDropMarks();
  drag.item.classList.add('is-dragging');
  let best = null, bestD = Infinity;
  for (const n of drag.box.querySelectorAll('[data-sortable]')) {
    if (n === drag.item) continue;
    const r = n.getBoundingClientRect();
    const d = drag.cards ? Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2))
      : Math.abs(e.clientY - (r.top + r.height / 2));
    if (d < bestD) { bestD = d; best = n; }
  }
  drag.target = best;
  if (best) {
    const r = best.getBoundingClientRect();
    drag.after = drag.cards ? e.clientX > r.left + r.width / 2 : e.clientY > r.top + r.height / 2;
    best.classList.add(drag.after ? 'is-drop-after' : 'is-drop-before');
  }
  // Near the top or bottom of the window, the page scrolls with the drag.
  if (e.clientY < 72) window.scrollBy(0, -14);
  else if (e.clientY > window.innerHeight - 72) window.scrollBy(0, 14);
});
function endDrag(commit) {
  const d = drag;
  drag = null;
  clearDropMarks();
  if (!d || !commit || !d.moved || !d.target) return;
  const ids = Shots.listShots().filter((s) => s.sceneId === d.scene).map((s) => s.id).filter((id) => id !== d.id);
  const at = ids.indexOf(d.target.dataset.shot);
  if (at < 0) return;
  ids.splice(at + (d.after ? 1 : 0), 0, d.id);
  const ordered = Shots.sceneAutoOrdered(d.scene);
  Shots.reorderShots(d.scene, ids);
  if (ordered) Shots.autoNumber(d.scene);
  render();
  const g = document.querySelector('[data-shot="' + CSS.escape(d.id) + '"] [data-action="vz-shot-grip"]');
  if (g) g.focus();
  announce(d.id);
}
document.addEventListener('pointerup', (e) => { if (drag && e.pointerId === drag.pid) endDrag(true); });
document.addEventListener('pointercancel', (e) => { if (drag && e.pointerId === drag.pid) endDrag(false); });
document.addEventListener('keydown', (e) => { if (drag && e.key === 'Escape') endDrag(false); });
/* The coverage view: filter and density. Both are module state (see
   VIEW STATE above) and repaint the page with focus kept on the control. */
delegate(document, 'click', '[data-action="vz-cov-filter"]', (e, el) => {
  const v = el.dataset.value;
  if (!COV_FILTERS.some((f) => f.value === v) || v === covFilter) return;
  covFilter = v;
  render('[data-action="vz-cov-filter"][data-value="' + CSS.escape(v) + '"]');
});
delegate(document, 'click', '[data-action="vz-cov-compact"]', () => {
  covCompact = !covCompact;
  render('[data-action="vz-cov-compact"]');
});
/* The phone board's "View all": one scene's strip from a sideways row
   to a stack. A desk shows every shot already; the button is not drawn
   there (visualize.css), so this is placement, not a second feature. */
delegate(document, 'click', '[data-action="vz-board-all"]', (e, el) => {
  const id = el.dataset.scene || '';
  if (boardOpen.has(id)) boardOpen.delete(id); else boardOpen.add(id);
  render('[data-action="vz-board-all"][data-scene="' + CSS.escape(id) + '"]');
});
/* A move re-renders the page, which dropped the focus to <body>: a
   keyboard user pressing ↓ twice moved the shot once and then nothing.
   The focus follows the row to its new place — on the same arrow while
   it can still move that way, else on the other one. */
function refocusMoved(host, id, action, other) {
  const at = '[data-' + host + '="' + CSS.escape(id) + '"] ';
  const node = document.querySelector(at + '[data-action="' + action + '"]:not(:disabled)')
    || document.querySelector(at + '[data-action="' + other + '"]:not(:disabled)');
  if (node) node.focus();
}
delegate(document, 'click', '[data-action="vz-shot-up"]',  (e, el) => moveShotBy(shotIdOf(el), -1, 'vz-shot-up'));
delegate(document, 'click', '[data-action="vz-shot-down"]', (e, el) => moveShotBy(shotIdOf(el),  1, 'vz-shot-down'));
delegate(document, 'click', '[data-action="vz-shot-del"]',  async (e, el) => {
  const id = shotIdOf(el);
  if (!await askDanger(shotDeleteQuestion(id), { confirm: 'Delete shot' })) return;
  Shots.removeShot(id);
  render();
});

/* Field edits save on change rather than per keystroke: the model is
   small, but re-rendering on every character would be silly.

   A full re-render is fine from a select or a checkbox — the control
   has already been used and closed. It is NOT fine from a text field:
   `change` fires as focus leaves, usually on Tab, and rebuilding the
   page at that moment destroys the element the browser was about to
   focus. So the two places a typed value is mirrored are patched in
   place instead. */
/* A typed number is the writer's: it locks, so a later move or Renumber
   keeps it. Clearing the field hands the number back to the list. */
function shotPatch(el) {
  const key = el.dataset.shotField;
  const value = el.type === 'checkbox' ? el.checked : el.value;
  if (key === 'number') return { number: value, numLocked: String(value).trim() !== '' };
  return { [key]: value };
}
delegate(document, 'change', '[data-shot-field]', (e, el) => {
  const key = el.dataset.shotField;
  const id = shotIdOf(el);
  const value = el.type === 'checkbox' ? el.checked : el.value;
  Shots.updateShot(id, shotPatch(el));

  /* The status box keeps the focus, so Space walks a camera report down
     the list without the mouse. */
  if (el.type === 'checkbox') { render('[data-shot="' + CSS.escape(id) + '"] [data-shot-field="' + key + '"]'); return; }
  if (el.tagName === 'SELECT') { render(); return; }
  if (key === 'number') {
    // The lock follows the typed number, patched in place (focus is leaving).
    const lock = document.querySelector('[data-shot="' + CSS.escape(id) + '"] [data-action="vz-shot-lock"]');
    const shot = Shots.listShots().find((s) => s.id === id);
    if (lock && shot) {
      const on = Shots.isLockedNumber(shot);
      lock.setAttribute('aria-pressed', on ? 'true' : 'false');
      lock.classList.toggle('is-locked', on);
      const glyph = lock.querySelector('.sym');
      if (glyph) glyph.textContent = on ? 'lock' : 'lock_open';
    }
  }
  if (key === 'description') {
    const col = document.querySelector('.vz-shotcol[data-shot="' + id + '"]');
    const line = col && col.querySelector('.vz-shotcol-desc');
    if (line) line.textContent = value;
  }
  if (key === 'lens') {
    // The board card's head names the lens; patched for the same reason.
    const shot = Shots.listShots().find((s) => s.id === id);
    const spec = document.querySelector('.vz-shotcol[data-shot="' + id + '"] .vz-shotcol-spec');
    if (shot && spec) spec.textContent = shotSpec(shot);
  }
});

/* The map's half of the link: a focused shot row lights its camera on every
   map (in memory; the Blocking tab draws it too when opened). */
delegate(document, 'focusin', 'tr.vz-row', (e, row) => {
  const shot = Shots.listShots().find((x) => x.id === row.dataset.shot);
  const cam = shot && Shots.camOf(shot);
  highlightCamera(cam ? cam.id : '');
});

/* frames */
delegate(document, 'click', '[data-action="vz-frame-add"]', (e, el) => {
  const shotId = shotIdOf(el);
  if (!shotId) return;
  const frame = Shots.addFrame(shotId);
  render();
  const input = document.querySelector('[data-frame="' + frame.id + '"] [data-frame-field="ref"]');
  if (input) input.focus();
});
delegate(document, 'click', '[data-action="vz-frame-up"]',   (e, el) => { const id = frameIdOf(el); Shots.moveFrame(id, -1); render(); refocusMoved('frame', id, 'vz-frame-up', 'vz-frame-down'); });
delegate(document, 'click', '[data-action="vz-frame-down"]', (e, el) => { const id = frameIdOf(el); Shots.moveFrame(id,  1); render(); refocusMoved('frame', id, 'vz-frame-down', 'vz-frame-up'); });
delegate(document, 'click', '[data-action="vz-frame-upload"]', (e, el) => {
  const id = frameIdOf(el);
  const frame = Shots.listFrames().find((f) => f.id === id);
  if (!frame) return;
  uploadToFrame({
    frame,
    label: el.dataset.label || 'shot',
    update: (patch) => Shots.updateFrame(id, patch),
    after: () => render(),
    toast: (m, o) => StudioUI.toast(m, o),
    say: (m) => { try { StudioUI.toast(m, { type: 'info' }); } catch (err) { /* chrome may not be up */ } }
  });
});
/* MANY PICTURES AT ONCE: picked with "Pictures" or dropped on a shot
   (a storyboard card or a Board card). One new frame per picture, each
   uploaded in turn through the same single-frame path, and one Undo. */
function addPictures(shotId, files) {
  const shot = Shots.listShots().find((s) => s.id === shotId);
  if (!shot || !files || !files.length) return;
  const label = (frame) => {
    const mine = Shots.listFrames().filter((f) => f.shotId === shotId);
    return (shot.number || 'shot') + String.fromCharCode(97 + Math.max(0, mine.findIndex((f) => f.id === frame.id)));
  };
  uploadManyToFrames({
    files,
    label,
    addFrame: () => Shots.addFrame(shotId),
    updateFrame: (id, patch) => Shots.updateFrame(id, patch),
    removeFrame: (id) => Shots.removeFrame(id),
    after: () => render(),
    toast: (m, o) => StudioUI.toast(m, o),
    say: (m) => { try { StudioUI.toast(m, { type: 'info' }); } catch (err) { /* chrome may not be up */ } }
  });
}
delegate(document, 'click', '[data-action="vz-frame-bulk"]', async (e, el) => {
  const shotId = shotIdOf(el);
  if (!shotId) return;
  /* The press is a click, so a lapsed token can be renewed here — and
     then the picker needs a click of its own (Google's window used this
     one), exactly as the single Upload does. */
  const gate = currentBoardGate();
  if (!gate.ok) {
    if (gate.reconnect) {
      try { await reconnectDrive(); say('Drive is connected again. Press Pictures once more to choose them.'); }
      catch (err) { say('Google did not reconnect Drive (' + String((err && err.message) || 'cancelled').slice(0, 80) + ').'); }
    } else say(gate.text);
    return;
  }
  const files = await chooseFile(true);
  if (files.length) addPictures(shotId, files);
});
const hasFiles = (e) => !!(e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files'));
delegate(document, 'dragover', '[data-drop-shot]', (e, el) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'copy';
  el.classList.add('is-file-over');
});
delegate(document, 'dragleave', '[data-drop-shot]', (e, el) => {
  if (!el.contains(e.relatedTarget)) el.classList.remove('is-file-over');
});
delegate(document, 'drop', '[data-drop-shot]', (e, el) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  el.classList.remove('is-file-over');
  addPictures(el.dataset.dropShot, Array.from(e.dataTransfer.files || []));
});
delegate(document, 'click', '[data-action="vz-frame-del"]',  async (e, el) => {
  if (!await askDanger('Delete this frame? The shot it draws is untouched.', { confirm: 'Delete frame' })) return;
  Shots.removeFrame(frameIdOf(el));
  render();
});
/* The action field MOVES an older caption into `action` (Shots.actionPatch). */
const framePatch = (el) => (el.dataset.frameField === 'action'
  ? Shots.actionPatch(el.value) : { [el.dataset.frameField]: el.value });
delegate(document, 'change', '[data-frame-field]', (e, el) => {
  const id = frameIdOf(el);
  Shots.updateFrame(id, framePatch(el));
  // The slate shows the reference. Patched in place, not re-rendered:
  // see the note on the shot-field handler above.
  const card = document.querySelector('.vz-frame[data-frame="' + id + '"]');
  if (el.dataset.frameField === 'aspect') { if (card) card.dataset.aspect = aspectOf(el.value); return; }
  if (el.dataset.frameField !== 'ref') return;
  const view = card && card.querySelector('.vz-frame-view');
  if (view) view.replaceWith(refView(el.value));
});

/* lookbook */
delegate(document, 'click', '[data-action="vz-board-add"]', () => {
  const board = Shots.addBoard();
  render();
  const input = document.querySelector('[data-board="' + board.id + '"] .vz-board-name');
  if (input) input.focus();
});
delegate(document, 'click', '[data-action="vz-board-up"]',   (e, el) => { Shots.moveBoard(boardIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="vz-board-down"]', (e, el) => { Shots.moveBoard(boardIdOf(el),  1); render(); });
delegate(document, 'click', '[data-action="vz-board-del"]',  async (e, el) => {
  const id = boardIdOf(el);
  if (!await askDanger(boardDeleteQuestion(id), { confirm: 'Delete board' })) return;
  Shots.removeBoard(id);
  render();
});
delegate(document, 'change', '[data-board-field]', (e, el) => {
  Shots.updateBoard(boardIdOf(el), { [el.dataset.boardField]: el.value });
});

delegate(document, 'click', '[data-action="vz-entry-add"]', (e, el) => {
  const boardId = boardIdOf(el);
  if (!boardId) return;
  const entry = Shots.addEntry(boardId);
  render();
  const input = document.querySelector('[data-entry="' + entry.id + '"] [data-entry-field="title"]');
  if (input) input.focus();
});
/* No confirm for one reference — but an Undo, because a pasted link
   and its note are typed once and cannot be found again (UX audit
   L16). It goes back in its old place. */
delegate(document, 'click', '[data-action="vz-entry-del"]', (e, el) => {
  const boardId = boardIdOf(el);
  const entryId = entryIdOf(el);
  const { at, gone } = findEntry(boardId, entryId);
  Shots.removeEntry(boardId, entryId);
  render('[data-board="' + CSS.escape(boardId || '') + '"] [data-action="vz-entry-add"]');
  if (!gone || !StudioUI.toast) return;
  StudioUI.toast('Reference removed' + (gone.title ? ': ' + gone.title : ''), {
    action: 'Undo',
    onAction: () => { if (restoreEntry(boardId, gone, at)) render(); }
  });
});
delegate(document, 'change', '[data-entry-field]', (e, el) => {
  Shots.updateEntry(boardIdOf(el), entryIdOf(el), { [el.dataset.entryField]: el.value });
  if (el.dataset.entryField !== 'ref') return;
  // A reference that is a URL grows an "Open" link beside it. Added and
  // removed in place, for the same focus reason as above.
  const cell = el.closest('.vz-c-ref');
  if (!cell) return;
  const link = cell.querySelector('.vz-entry-link');
  if (isLinkable(el.value)) {
    if (link) link.setAttribute('href', el.value);
    else cell.append(h('a.vz-entry-link', {
      href: el.value, target: '_blank', rel: 'noopener noreferrer', text: 'Open  ↗'
    }));
  } else if (link) {
    link.remove();
  }
});

/* Typed text SAVES as it is typed, though everything above still
   repaints on `change`: on `change` alone, a reload or a closed tab
   took everything since the field was entered (UX audit H10).
   saveOnInput() debounces the store write — nothing else — and
   flushes it on pagehide / hidden. Selects and checkboxes are skipped;
   their `change` already saved them. */
import { saveOnInput, preservingFocus } from '../lib/autosave.js';
import { askDanger } from '../ui/dialog.js';
saveOnInput('[data-shot-field]', (el) => Shots.updateShot(shotIdOf(el), shotPatch(el)));
saveOnInput('[data-frame-field]', (el) => Shots.updateFrame(frameIdOf(el), framePatch(el)));
saveOnInput('[data-board-field]', (el) => Shots.updateBoard(boardIdOf(el), { [el.dataset.boardField]: el.value }));
saveOnInput('[data-entry-field]', (el) => Shots.updateEntry(boardIdOf(el), entryIdOf(el), { [el.dataset.entryField]: el.value }));

render();
