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
import { aiPill } from '../ui/ai-pill.js';   // the one way into AI; the Desk and ai.js load at a click
import PDF from '../lib/pdf.js';
import Scenes, { formatEighths } from '../lib/scenes.js';
import Script from '../lib/script.js';
import { matchScenes } from '../lib/screenplay-analysis.js';
import Shots, {
  SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS, SHOT_LENSES, SHOT_RIGS, isLinkable
} from '../lib/shots.js';
import { renderBlocking, renderSceneBoard, highlightCamera } from '../ui/blocking.js';
/* Drawn frames (NEXT-UI-REVAMP-PLAN phase 4): the picture is in the
   writer's Drive, the frame keeps `drive:<fileId>`. drive.js and
   drive-sync.js are CORE already; the generation itself (ai.js, the
   Desk) stays behind the pill's click. */
import { driveFileIdOf } from '../lib/drive.js';
import { onDriveStatus } from '../lib/drive-sync.js';
import { boardJobs, MAX_FRAMES, ASPECTS, aspectOf } from '../lib/board-frames.js';
import { uploadToFrame } from '../ui/frame-upload.js';
import { driveImage, currentBoardGate, onDriveReconnect, wireDriveImages } from '../ui/drive-image.js';
import { basicShotDivision } from '../lib/shot-rules.js';
import {
  plural, slugOf, shotSpec, headerFigures, sceneSpread, COV_FILTERS, keepShot as keepFor,
  scenePlan, pickMeta, pickedSummary, uncoveredIds, basicJobs, addBasicShots, basicNoneMatched,
  basicDoneStatus, aiDraftStatus, removeShotIds, shotDeleteQuestion, boardDeleteQuestion,
  frameBadge, rigLabel, framesIn, findEntry, restoreEntry, fileStem as stemOf
} from '../lib/visualize-model.js';
import {
  button, buttonGroup, badge, intExtBadge, todBadge, pageHeader, statStrip, notice, field as kitField,
  segmented, meter
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
    if (id === value) opt.selected = true;
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
  const head = pageHeader({
    class: 'bd-head vz-head',
    eyebrow: ['Visualise', 'the film seen before it is shot'],
    title: 'Visualise',
    sub: 'A shot list is the scene broken into the pieces the camera actually '
       + 'records. The storyboard draws those pieces and the lookbook says what '
       + 'they should feel like — all three hang off the scenes you have already '
       + 'broken down, so nothing is described twice.'
  });
  /* Every figure is counted from the model at render time. A stat that
     cannot be measured (no lens typed anywhere) is not shown at all —
     never a placeholder number. */
  const stats = statStrip([
    { label: shots.length === 1 ? 'shot' : 'shots', value: shots.length,
      note: shots.length ? done + ' in the can' : null, noteTone: shots.length && done === shots.length ? 'ok' : null },
    { label: 'scenes covered', value: covered + ' / ' + scenes.length },
    { label: frames.length === 1 ? 'frame' : 'frames', value: frames.length },
    { label: refs === 1 ? 'reference' : 'references', value: refs },
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

/* ---- section 1: the shot list -------------------------------- */
function renderShotList(scenes, shots) {
  const wrap = h('section.vz-shots' + (covCompact ? '.is-compact' : ''), { id: 'shot-list' });
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
     in src/lib/shotlist-export.js — one scope argument apart. */
  if (shots.length) {
    wrap.append(h('div.vz-tools.pdf-menu-host', {}, [
      h('span.vz-tools-lab', {
        text: shots.length + (shots.length === 1 ? ' setup' : ' setups')
            + ' across ' + sceneSpread(shots)
            + ' scenes'
      }),
      h('span.vz-tools-gap'),
      /* Filter and density: view state over the shot rows, in memory.
         The same controls at every width; on a phone they wrap above
         the cards. */
      segmented({
        label: 'Show shots', name: 'vz-filter', value: covFilter, quiet: true,
        action: 'vz-cov-filter', options: COV_FILTERS, class: 'vz-cov-filter'
      }),
      button({
        label: 'Compact', icon: 'density_small', size: 'sm', action: 'vz-cov-compact',
        class: 'vz-cov-compact', attrs: { 'aria-pressed': covCompact ? 'true' : 'false' },
        title: covCompact ? 'Show every field of each shot' : 'Show only the setup, size, move, lens and status'
      }),
      actionMenu('Export the shot division', [
        { label: 'Whole script — PDF', action: 'vz-pdf-all', hint: 'A4' },
        { label: 'Whole script — CSV', action: 'vz-csv-all', hint: 'spreadsheet' }
      ], { align: 'right' })
    ]));
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
  const uncovered = [];
  for (const group of Shots.shotsByScene(scenes)) {
    if (group.scene && !group.shots.length) {
      // "In the can" is a list of shots; a scene with none has none to show.
      if (covFilter === 'done') continue;
      uncovered.push(renderUncovered(group.scene));
      continue;
    }
    wrap.append(renderSceneBlock(group));
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
  return wrap;
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

function renderSceneBlock(group) {
  const scene = group.scene;
  const cov = Shots.coverageOf(group.shots);
  const block = h('div.vz-scene.k-panel' + (scene ? '' : '.is-orphan'), { 'data-scene': scene ? scene.id : '' });

  if (scene) {
    /* The current-scene card: identity, length, where the stripboard
       put it, and how far the coverage has got. Every figure is read
       off the scene and its shots; the stripboard day is the scene's
       own `shootDay`, and a scene without one says so rather than
       guessing. No call time: nothing stores one per scene. */
    const day = shootDayOf(scene);
    block.append(h('div.vz-scene-head.k-panel-head', {}, [
      ...sceneIdent(scene),
      h('span.vz-scene-count', {
        text: [formatEighths(Number(scene.eighths) || 0) + ' pgs',
          plural(cov.setups, 'shot', 'shots'), cov.done + ' in the can'].join(' · ')
      }),
      h('span.vz-scene-day', {}, [
        day ? h('a', { href: 'stripboard.html#stripboard', text: 'Day ' + day + ' on the stripboard' })
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
    /* Between a phone and a desk the seven columns do not fit, so the
       table scrolls inside itself and says so (UX audit L30). Below
       720px each row becomes a card instead (visualize.css §1b) and
       the hint is hidden: there is nothing sideways left to find. */
    const shown = group.shots.filter(keepShot);
    if (shown.length) {
      block.append(h('p.vz-scroll-hint', { 'aria-hidden': 'true', text: 'Swipe the table sideways for every column →' }));
      block.append(renderShotTable(group.shots, scene, shown));
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
      row.append(actionMenu('Export this scene', [
        { label: 'This scene — PDF', action: 'vz-pdf-scene', hint: 'A4' },
        { label: 'This scene — CSV', action: 'vz-csv-scene', hint: 'spreadsheet' }
      ], { align: 'right' }));
    }
    block.append(row);
  }
  return block;
}

/* THE COVERAGE TABLE. One row per setup: number, size over angle,
   movement, lens, what we see, and the status pill. Every cell is a
   field of the one shot record in src/lib/shots.js; the pill is the
   shot's `done`, printed in words. */
function renderShotTable(shots, scene, shown = shots) {
  const table = h('table.k-table.vz-table.vz-cov');
  table.append(h('caption.visually-hidden', {
    text: 'Coverage' + (scene ? ' for scene ' + (scene.number || '') : '')
  }));
  const head = h('tr');
  COV_COLS.forEach(([label, cls]) => head.append(
    h('th' + (cls ? '.' + cls : ''), { scope: 'col', text: label })
  ));
  table.append(h('thead', {}, [head]));

  const body = h('tbody');
  const cams = scene ? Shots.sceneCameras(scene.id) : [];
  /* Filtered rows keep their place in the FULL list, so the number
     placeholder and the up / down grips still mean the scene's order. */
  shots.forEach((shot, i) => { if (shown.includes(shot)) body.append(renderShotRow(shot, i, shots.length, cams)); });
  table.append(body);
  return h('div.k-table-wrap.vz-table-wrap', {
    role: 'region', tabindex: '0',
    'aria-label': 'Coverage table' + (scene ? ', scene ' + (scene.number || '') : '')
  }, [table]);
}

/* The coverage columns, once: the head prints them and each cell
   carries its column's words as data-label, which the phone card
   prints over the field (visualize.css §1b). */
const COV_COLS = [['Setup', 'vz-c-no'], ['Size & angle', 'vz-c-size'], ['Move', 'vz-c-move'],
  ['Lens, light & camera', 'vz-c-lens'], ['What we see', 'vz-c-desc'], ['Status', 'vz-c-done']];
const covLabel = (cls) => (COV_COLS.find((c) => c[1] === cls) || [''])[0];

/** The status pill: the shot's `done`, in words, and the control that
    flips it. A button with aria-pressed, so it is one Tab stop and
    Space or Enter marks a setup in the can. */
function statusPill(shot, i) {
  const st = Shots.shotStatus(shot);
  const n = shot.number || String(i + 1);
  return h('button.k-badge.k-badge--button.k-badge--' + st.tone + '.vz-status', {
    type: 'button', 'data-action': 'vz-shot-status',
    'aria-pressed': shot.done ? 'true' : 'false',
    'aria-label': 'Shot ' + n + ' is in the can',
    title: shot.done ? 'In the can — press to mark it still to shoot' : 'To shoot — press when it is in the can'
  }, [h('span.k-badge-dot', { 'aria-hidden': 'true' }), h('span', { text: st.label })]);
}

function renderShotRow(shot, i, total, cams = []) {
  const row = h('tr.vz-row' + (shot.done ? '.is-done' : '') + (shot.ai || shot.rules ? '.is-ai' : ''), {
    'data-shot': shot.id
  });

  const no = h('td.vz-c-no', { 'data-label': covLabel('vz-c-no') }, [
    cellInput(field('input.vz-no', {
      type: 'text', placeholder: String(i + 1),
      'data-shot-field': 'number', 'aria-label': 'Shot number'
    }, shot.number), true)
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
  row.append(no);
  row.append(h('td.vz-c-size', { 'data-label': covLabel('vz-c-size') }, [
    picker(SHOT_SIZES, shot.size, 'data-shot-field', 'size', 'Shot size'),
    picker(SHOT_ANGLES, shot.angle, 'data-shot-field', 'angle', 'Camera angle')
  ]));
  row.append(h('td.vz-c-move', { 'data-label': covLabel('vz-c-move') }, [picker(SHOT_MOVEMENTS, shot.movement, 'data-shot-field', 'movement', 'Camera movement')]));
  /* Lighting / rig is free text; the camera is a pick from the marks on
     this scene's blocking maps. No camera marks, no picker: the map is
     where a camera is made, so there is nothing to offer instead of an
     empty list. */
  const cell = h('td.vz-c-lens', { 'data-label': covLabel('vz-c-lens') }, [
    cellInput(field('input.vz-lens', {
      type: 'text', placeholder: '35mm', list: 'vzLenses', autocomplete: 'off',
      'data-shot-field': 'lens', 'aria-label': 'Lens'
    }, shot.lens), true),
    cellInput(field('input.vz-rig', {
      type: 'text', placeholder: 'Key from window', list: 'vzRigs', autocomplete: 'off',
      'data-shot-field': 'rig', 'aria-label': 'Lighting or rig'
    }, shot.rig), true)
  ]);
  if (cams.length) {
    cell.append(picker([{ id: '', label: 'No camera' }, ...cams.map((c) => ({ id: c.id, label: c.name }))],
      Shots.camOf(shot, cams) ? shot.cam : '', 'data-shot-field', 'cam', 'Camera on the blocking map'));
  }
  row.append(cell);
  row.append(h('td.vz-c-desc', { 'data-label': covLabel('vz-c-desc') }, [
    cellInput(field('textarea.vz-desc', {
      rows: '2', placeholder: 'One line of what the audience sees',
      'data-shot-field': 'description', 'aria-label': 'What we see'
    }, shot.description))
  ]));
  /* Status and the row grips share the last cell: the pill on top, the
     tray under it — a seventh column would push the table past the
     panel at 1280. */
  row.append(h('td.vz-c-done', {}, [h('div.vz-done-stack', {}, [statusPill(shot, i), h('div.row-ctrl.vz-c-ctrl', {}, [ctrlTray([
    ctrlBtn('↑', 'vz-shot-up', 'Move this shot earlier', i === 0),
    ctrlBtn('↓', 'vz-shot-down', 'Move this shot later', i === total - 1),
    ctrlBtn('✕', 'vz-shot-del', 'Delete this shot', false, true)
  ], 'Shot ' + (shot.number || String(i + 1)))])])]));
  return row;
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

/* THE AI HALF IS THE AI DESK'S 'shot-draft' TASK (src/lib/ai-tasks.js):
   the same draftShotDivision() over the ticked scenes, the same
   matchScenes() pairing, and the same append-only write marked
   `ai: true`. The pill below is the way in — greyed with the Pro offer
   on a plan without AI, a link to Settings with no key — so this page
   loads no model code and holds no key form. `after` hands the ids it
   wrote back here, so "Undo the last draft" still names them. */
function shotsDrafted(made) {
  aiLastRun = made || [];
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
  const wrap = h('section.vz-board', { id: 'storyboard' });
  wrap.append(
    h('h2.bd-h2', { text: 'Storyboard' }),
    h('p.bd-sub', {
      text: 'A frame per drawing, hanging off the shot it draws. Grouped by scene, '
          + 'in shot order — move a shot above and the board follows it.'
    }),
    noImageNote('A frame holds a picture, a link or a description. Upload a picture or '
      + 'draw one with AI: either is saved to your own Google Drive, and the frame (and every '
      + 'backup file) keeps only a link to it, because an image would not fit in this '
      + 'browser and would not survive a backup. Or paste the URL of your drawing, or '
      + 'write the frame in words. Words are often the better storyboard anyway.')
  );
  if (shots.length) wrap.append(renderDraw(scenes, shots, frames));

  if (!shots.length) {
    wrap.append(h('p.bd-none', {
      text: 'A frame draws a shot, so the shot list comes first. Add a shot above '
          + 'and every shot gets a slot on the board.'
    }));
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
  const col = h('article.vz-shotcol', { 'data-shot': shot.id, role: 'listitem' });
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

  col.append(button({ label: 'Frame', icon: 'add', size: 'sm', action: 'vz-frame-add', class: 'vz-add-frame' }));
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
  card.append(kitField({
    label: 'Caption', value: frame.caption, placeholder: 'What changes by the end of the shot',
    class: 'vz-fieldset', attrs: { 'data-frame-field': 'caption', 'aria-label': 'Frame caption' }
  }));

  /* The frame's shape: the slate takes it from [data-aspect] on the
     card (visualize.css), so a 2.39:1 film boards in 2.39:1. */
  const aspect = h('select.k-input.vz-frame-aspect', { 'data-frame-field': 'aspect', 'aria-label': 'Frame shape' });
  for (const a of ASPECTS) aspect.append(h('option', { value: a.id, text: a.label, selected: a.id === aspectOf(frame.aspect) }));
  card.append(h('label.vz-frame-shape', {}, [h('span.vz-frame-shape-lab', { text: 'Shape' }), aspect]));

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
function noImageNote(text) {
  return notice({ class: 'vz-note', title: 'No image uploads.', icon: 'info', body: text });
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
    if (!at) return;
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
  const blob = new Blob([text], { type: mime || 'text/plain' });
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
async function exportShotlist(scope, kind) {
  let Sheet;
  try { Sheet = await exporter(); }
  catch (e) { say('The exporter could not be loaded. Check the connection and try again.', 'warn'); return; }

  const summary = Sheet.summarise(scope);
  if (!summary.shots) { say('There are no shots in that scope yet.', 'warn'); return; }

  if (kind === 'csv') {
    const tail = scope === Sheet.ALL ? 'shot_division' : 'shot_division_scene';
    download(Sheet.toCSV(scope), fileStem() + '_' + tail + '.csv', 'text/csv');
    say('Exported ' + summary.shots + ' setups as CSV.');
    return;
  }

  const main = document.getElementById('main');
  if (!main) return;
  let node = null;
  PDF.exportPDF({
    scope: 'shotlist',
    setup: 'a4',
    label: Sheet.labelFor(scope),
    title: PDF.projectTitle() + ' — ' + Sheet.labelFor(scope),
    subtitle: Sheet.subtitleFor(scope),
    before: () => { node = Sheet.buildDocument(scope); main.append(node); },
    after: () => { if (node) { node.remove(); node = null; } }
  });
}

delegate(document, 'click', '[data-action="vz-pdf-all"]', () => exportShotlist('all', 'pdf'));
delegate(document, 'click', '[data-action="vz-csv-all"]', () => exportShotlist('all', 'csv'));
delegate(document, 'click', '[data-action="vz-pdf-scene"]', (e, el) => {
  const id = sceneIdOf(el);
  if (id) exportShotlist(id, 'pdf');
});
delegate(document, 'click', '[data-action="vz-csv-scene"]', (e, el) => {
  const id = sceneIdOf(el);
  if (id) exportShotlist(id, 'csv');
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
  render();
});
delegate(document, 'click', '[data-action="vz-ai-all"]', () => {
  aiPicked = new Set(Scenes.listScenes().map((s) => s.id));
  render();
});
delegate(document, 'click', '[data-action="vz-ai-none"]', () => {
  aiPicked = new Set();
  render();
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

  if (!made.length) {
    aiStatus = '';
    aiError = basicNoneMatched(chosen.length);
    render();
    return;
  }
  aiStatus = basicDoneStatus(made.length, result.byScene.size, noScript);
  aiError = '';
  render();
  say(plural(made.length, 'shot', 'shots') + ' drafted. Read them before you shoot them.');
});

delegate(document, 'click', '[data-action="vz-ai-undo"]', async () => {
  if (!aiLastRun.length) return;
  if (!await askDanger('Remove the ' + aiLastRun.length + ' shots from the last draft?\n\n'
    + 'Only those shots are removed. Anything you wrote or edited since is kept.')) return;
  removeShotIds(aiLastRun);
  aiLastRun = [];
  aiStatus = 'The last draft was removed.';
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
/* The status pill flips the shot's one stored boolean and repaints,
   keeping focus on the same pill so a run of Space presses walks a
   camera report down the table without the mouse. */
delegate(document, 'click', '[data-action="vz-shot-status"]', (e, el) => {
  const id = shotIdOf(el);
  const shot = Shots.listShots().find((s) => s.id === id);
  if (!shot) return;
  Shots.updateShot(id, { done: !shot.done });
  render('[data-shot="' + CSS.escape(id) + '"] [data-action="vz-shot-status"]');
});
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
delegate(document, 'click', '[data-action="vz-shot-up"]',  (e, el) => { Shots.moveShot(shotIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="vz-shot-down"]', (e, el) => { Shots.moveShot(shotIdOf(el),  1); render(); });
delegate(document, 'click', '[data-action="vz-shot-del"]',  async (e, el) => {
  const id = shotIdOf(el);
  if (!await askDanger(shotDeleteQuestion(id))) return;
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
delegate(document, 'change', '[data-shot-field]', (e, el) => {
  const key = el.dataset.shotField;
  const id = shotIdOf(el);
  const value = el.type === 'checkbox' ? el.checked : el.value;
  Shots.updateShot(id, { [key]: value });

  if (el.tagName === 'SELECT' || el.type === 'checkbox') { render(); return; }
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
delegate(document, 'click', '[data-action="vz-frame-up"]',   (e, el) => { Shots.moveFrame(frameIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="vz-frame-down"]', (e, el) => { Shots.moveFrame(frameIdOf(el),  1); render(); });
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
delegate(document, 'click', '[data-action="vz-frame-del"]',  async (e, el) => {
  if (!await askDanger('Delete this frame? The shot it draws is untouched.')) return;
  Shots.removeFrame(frameIdOf(el));
  render();
});
delegate(document, 'change', '[data-frame-field]', (e, el) => {
  const id = frameIdOf(el);
  Shots.updateFrame(id, { [el.dataset.frameField]: el.value });
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
  if (!await askDanger(boardDeleteQuestion(id))) return;
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
saveOnInput('[data-shot-field]', (el) => Shots.updateShot(shotIdOf(el), { [el.dataset.shotField]: el.value }));
saveOnInput('[data-frame-field]', (el) => Shots.updateFrame(frameIdOf(el), { [el.dataset.frameField]: el.value }));
saveOnInput('[data-board-field]', (el) => Shots.updateBoard(boardIdOf(el), { [el.dataset.boardField]: el.value }));
saveOnInput('[data-entry-field]', (el) => Shots.updateEntry(boardIdOf(el), entryIdOf(el), { [el.dataset.entryField]: el.value }));

render();
