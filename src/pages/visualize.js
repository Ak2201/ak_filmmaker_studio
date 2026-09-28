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

   NO IMAGES. The studio is local-first: a storyboard frame and a
   lookbook entry carry a link or a description, never bytes. The
   reason is in the header of src/lib/shots.js, and the UI repeats it
   where a user would otherwise go looking for an upload button.

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

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes from '../lib/scenes.js';
import Shots, {
  SHOT_SIZES, SHOT_ANGLES, SHOT_MOVEMENTS, isLinkable
} from '../lib/shots.js';

const app = document.getElementById('app');

const sizeLabel = (id) => (SHOT_SIZES.find((s) => s.id === id) || { id }).id;

/** The slug line, read off the scene. Never stored on a shot. */
const slugOf = (scene) =>
  scene.intExt + '. ' + (scene.location || 'Location TBC') + ' — ' + scene.dayNight;

const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* ---- small builders ----------------------------------------- */
function field(spec, props, value) {
  const el = h(spec, props);
  if (value !== undefined) el.value = value;
  return el;
}
function picker(options, value, attr, name, label) {
  const s = h('select.vz-sel', { [attr]: name, 'aria-label': label });
  options.forEach((o) => {
    const id = typeof o === 'string' ? o : o.id;
    const text = typeof o === 'string' ? o : o.label;
    const opt = h('option', { value: id, text });
    if (id === value) opt.selected = true;
    s.append(opt);
  });
  return s;
}
function ctrlBtn(glyph, action, label, disabled, danger) {
  return h('button.row-ctrl-btn' + (danger ? '.del' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- header -------------------------------------------------- */
function renderHeader(scenes, shots, frames, boards) {
  // Only scenes that still exist count as covered. A shot left behind by
  // a deleted scene would otherwise push the numerator past the
  // denominator — "3 / 2 scenes covered", which is nonsense on a stat.
  const live = new Set(scenes.map((s) => s.id));
  const covered = new Set(shots.map((s) => s.sceneId).filter((id) => live.has(id))).size;
  const refs = Shots.countEntries(boards);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Visualize · the film seen before it is shot' }),
    h('h1.bd-title', { text: 'Shots & Frames.' }),
    h('p.bd-deck', {
      text: 'A shot list is the scene broken into the pieces the camera actually '
          + 'records. The storyboard draws those pieces and the lookbook says what '
          + 'they should feel like — all three hang off the scenes you have already '
          + 'broken down, so nothing is described twice.'
    }),
    h('div.bd-stats', {}, [
      stat(String(shots.length), shots.length === 1 ? 'shot' : 'shots'),
      stat(covered + ' / ' + scenes.length, 'scenes covered'),
      stat(String(frames.length), frames.length === 1 ? 'frame' : 'frames'),
      stat(String(refs), refs === 1 ? 'reference' : 'references')
    ])
  ]);
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
    h('a.btn.primary.bd-cta', { href: 'breakdown.html#scenes', text: 'Go to the breakdown  →' })
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
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'vz-shot-add', 'data-scene': firstSceneId,
      text: '+  Add the first shot'
    })
  ]);
}

/* ---- section 1: the shot list -------------------------------- */
function renderShotList(scenes, shots) {
  const wrap = h('section.vz-shots', { id: 'shot-list' });
  wrap.append(
    h('h2.bd-h2', { text: 'Shot list' }),
    h('p.bd-sub', {
      text: 'Grouped by scene, in script order. The scene number, the slug line and '
          + 'the counts are read from the breakdown — this page only adds the shots.'
    })
  );

  if (!scenes.length && !shots.length) {
    wrap.append(renderNoScenes());
    return wrap;
  }
  if (!shots.length) {
    wrap.append(renderNoShots(scenes[0].id));
    return wrap;
  }

  for (const group of Shots.shotsByScene(scenes)) {
    wrap.append(renderSceneBlock(group));
  }
  return wrap;
}

function renderSceneBlock(group) {
  const scene = group.scene;
  const block = h('div.vz-scene', { 'data-scene': scene ? scene.id : '' });

  if (scene) {
    block.append(h('div.vz-scene-head', {}, [
      h('span.vz-scene-no', { text: scene.number || '—' }),
      h('span.vz-scene-slug', { text: slugOf(scene) }),
      h('span.vz-scene-count', {
        text: group.shots.length
          ? plural(group.shots.length, 'shot', 'shots')
          : 'no shots yet'
      })
    ]));
  } else {
    block.append(h('div.vz-scene-head.is-orphan', {}, [
      h('span.vz-scene-no', { text: '!' }),
      h('span.vz-scene-slug', { text: 'Scene deleted in the breakdown' }),
      h('span.vz-scene-count', { text: plural(group.shots.length, 'orphaned shot', 'orphaned shots') })
    ]),
    h('p.vz-orphan-note', {
      text: 'These shots point at a scene that no longer exists. They are shown so '
          + 'you can move the writing somewhere else or delete them on purpose — '
          + 'nothing here is thrown away quietly.'
    }));
  }

  if (group.shots.length) block.append(renderShotTable(group.shots));

  if (scene) {
    block.append(h('button.btn.vz-add', {
      type: 'button', 'data-action': 'vz-shot-add', text: '+  Add shot'
    }));
  }
  return block;
}

function renderShotTable(shots) {
  const table = h('table.scene-table.vz-table');
  const head = h('tr');
  [['Shot', 'vz-c-no'], ['Size', ''], ['Angle', ''], ['Move', ''], ['Lens', 'vz-c-lens'],
    ['What we see', 'vz-c-desc'], ['Got it', 'vz-c-done'], ['', 'vz-c-ctrl']]
    .forEach(([label, cls]) => head.append(
      h('th' + (cls ? '.' + cls : ''), { scope: 'col', text: label })
    ));
  table.append(h('thead', {}, [head]));

  const body = h('tbody');
  shots.forEach((shot, i) => body.append(renderShotRow(shot, i, shots.length)));
  table.append(body);
  return table;
}

function renderShotRow(shot, i, total) {
  const row = h('tr.vz-row' + (shot.done ? '.is-done' : ''), { 'data-shot': shot.id });

  row.append(h('td.vz-c-no', {}, [
    field('input.vz-no', {
      type: 'text', placeholder: String(i + 1),
      'data-shot-field': 'number', 'aria-label': 'Shot number'
    }, shot.number)
  ]));
  row.append(h('td', {}, [picker(SHOT_SIZES, shot.size, 'data-shot-field', 'size', 'Shot size')]));
  row.append(h('td', {}, [picker(SHOT_ANGLES, shot.angle, 'data-shot-field', 'angle', 'Camera angle')]));
  row.append(h('td', {}, [picker(SHOT_MOVEMENTS, shot.movement, 'data-shot-field', 'movement', 'Camera movement')]));
  row.append(h('td.vz-c-lens', {}, [
    field('input.vz-lens', {
      type: 'text', placeholder: '35mm',
      'data-shot-field': 'lens', 'aria-label': 'Lens'
    }, shot.lens)
  ]));
  row.append(h('td.vz-c-desc', {}, [
    field('textarea.vz-desc', {
      rows: '2', placeholder: 'One line of what the audience sees',
      'data-shot-field': 'description', 'aria-label': 'What we see'
    }, shot.description)
  ]));
  row.append(h('td.vz-c-done', {}, [
    h('label.vz-check', {}, [
      h('input', {
        type: 'checkbox', 'data-shot-field': 'done',
        checked: shot.done ? true : null,
        'aria-label': 'Shot ' + (shot.number || String(i + 1)) + ' is in the can'
      }),
      h('span.vz-check-lab', { text: shot.done ? 'in the can' : 'to shoot' })
    ])
  ]));
  row.append(h('td.row-ctrl.vz-c-ctrl', {}, [
    ctrlBtn('↑', 'vz-shot-up', 'Move this shot earlier', i === 0),
    ctrlBtn('↓', 'vz-shot-down', 'Move this shot later', i === total - 1),
    ctrlBtn('✕', 'vz-shot-del', 'Delete this shot', false, true)
  ]));
  return row;
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
    noImageNote('A frame here holds a link or a description, not a picture. '
      + 'The studio keeps your work in this browser, where an image file would not '
      + 'fit and would not survive a backup — so paste the URL of your drawing, or '
      + 'write the frame in words. Words are often the better storyboard anyway.')
  );

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
    const block = h('div.vz-bd-scene');
    block.append(h('div.vz-scene-head' + (group.scene ? '' : '.is-orphan'), {}, [
      h('span.vz-scene-no', { text: group.scene ? (group.scene.number || '—') : '!' }),
      h('span.vz-scene-slug', {
        text: group.scene ? slugOf(group.scene) : 'Scene deleted in the breakdown'
      }),
      h('span.vz-scene-count', { text: plural(group.shots.length, 'shot', 'shots') })
    ]));
    const strip = h('div.vz-strip');
    group.shots.forEach((shot) => strip.append(renderShotColumn(shot, byShot.get(shot.id) || [])));
    block.append(strip);
    wrap.append(block);
  }
  return wrap;
}

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
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'vz-frame-add', 'data-shot': firstShotId,
      text: '+  Add the first frame'
    })
  ]);
}

function renderShotColumn(shot, frames) {
  const col = h('article.vz-shotcol', { 'data-shot': shot.id });
  col.append(h('div.vz-shotcol-head', {}, [
    h('span.vz-shotcol-no', { text: shot.number || '—' }),
    h('span.vz-shotcol-spec', { text: sizeLabel(shot.size) + ' · ' + shot.movement }),
    h('span.vz-shotcol-count', { text: plural(frames.length, 'frame', 'frames') })
  ]));
  // Always present, even when empty (CSS hides it): the shot-list's
  // change handler patches this line in place rather than re-rendering,
  // and a handler that has to create its own target is a handler that
  // forgets to.
  col.append(h('p.vz-shotcol-desc', { text: shot.description }));

  frames.forEach((frame, i) => col.append(renderFrame(frame, shot, i, frames.length)));

  col.append(h('button.btn.vz-add-frame', {
    type: 'button', 'data-action': 'vz-frame-add', text: '+  Frame'
  }));
  return col;
}

function renderFrame(frame, shot, i, total) {
  const card = h('div.vz-frame', { 'data-frame': frame.id });

  const slate = h('div.vz-frame-slate');
  slate.append(
    h('span.vz-frame-badge', { text: (shot.number || '—') + String.fromCharCode(97 + i) }),
    refView(frame.ref)
  );
  card.append(slate);

  card.append(labelled('Reference', field('input', {
    type: 'text', placeholder: 'https://… or describe the frame in words',
    'data-frame-field': 'ref', 'aria-label': 'Frame reference'
  }, frame.ref)));
  card.append(labelled('Caption', field('input', {
    type: 'text', placeholder: 'What changes by the end of the shot',
    'data-frame-field': 'caption', 'aria-label': 'Frame caption'
  }, frame.caption)));

  card.append(h('div.vz-frame-acts', {}, [
    ctrlBtn('↑', 'vz-frame-up', 'Move this frame earlier', i === 0),
    ctrlBtn('↓', 'vz-frame-down', 'Move this frame later', i === total - 1),
    ctrlBtn('✕', 'vz-frame-del', 'Delete this frame', false, true)
  ]));
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

  boards.forEach((board, i) => wrap.append(renderBoard(board, i, boards.length)));
  wrap.append(h('button.btn.vz-add', {
    type: 'button', 'data-action': 'vz-board-add', text: '+  Add board'
  }));
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
    h('button.btn.primary.bd-cta', {
      type: 'button', 'data-action': 'vz-board-add', text: '+  Add the first board'
    })
  ]);
}

function renderBoard(board, i, total) {
  const card = h('article.vz-boardcard', { 'data-board': board.id });

  card.append(h('div.vz-board-head', {}, [
    field('input.vz-board-name', {
      type: 'text', placeholder: 'Board name — Palette, Light, Texture…',
      'data-board-field': 'name', 'aria-label': 'Board name'
    }, board.name),
    h('span.vz-board-count', { text: plural(board.entries.length, 'reference', 'references') }),
    h('div.vz-board-acts', {}, [
      ctrlBtn('↑', 'vz-board-up', 'Move this board up', i === 0),
      ctrlBtn('↓', 'vz-board-down', 'Move this board down', i === total - 1),
      ctrlBtn('✕', 'vz-board-del', 'Delete this board', false, true)
    ])
  ]));

  card.append(labelled('What this board is for', field('input', {
    type: 'text', placeholder: 'One line the department can read first',
    'data-board-field': 'note', 'aria-label': 'What this board is for'
  }, board.note)));

  if (board.entries.length) {
    const table = h('table.scene-table.vz-table');
    const head = h('tr');
    [['Title', ''], ['Reference', 'vz-c-ref'], ['Why it matters', 'vz-c-desc'], ['', 'vz-c-ctrl']]
      .forEach(([label, cls]) => head.append(
        h('th' + (cls ? '.' + cls : ''), { scope: 'col', text: label })
      ));
    table.append(h('thead', {}, [head]));

    const body = h('tbody');
    board.entries.forEach((entry) => body.append(renderEntry(entry)));
    table.append(body);
    card.append(table);
  } else {
    card.append(h('p.vz-board-none', {
      text: 'Nothing on this board yet. A reference is a title, a link or a note, '
          + 'and the sentence that says why it is here.'
    }));
  }

  card.append(h('button.btn.vz-add', {
    type: 'button', 'data-action': 'vz-entry-add', text: '+  Add reference'
  }));
  return card;
}

function renderEntry(entry) {
  const row = h('tr', { 'data-entry': entry.id });
  row.append(h('td', {}, [
    field('input', {
      type: 'text', placeholder: 'What it is',
      'data-entry-field': 'title', 'aria-label': 'Reference title'
    }, entry.title)
  ]));

  const refCell = h('td.vz-c-ref');
  refCell.append(field('input', {
    type: 'text', placeholder: 'https://… or a note',
    'data-entry-field': 'ref', 'aria-label': 'Reference link or note'
  }, entry.ref));
  if (isLinkable(entry.ref)) {
    refCell.append(h('a.vz-entry-link', {
      href: entry.ref, target: '_blank', rel: 'noopener noreferrer', text: 'Open  ↗'
    }));
  }
  row.append(refCell);

  row.append(h('td.vz-c-desc', {}, [
    field('textarea', {
      rows: '2', placeholder: 'Why it matters — what the department should take from it',
      'data-entry-field': 'why', 'aria-label': 'Why it matters'
    }, entry.why)
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
  if (isLinkable(value)) {
    return h('a.vz-frame-view.vz-frame-link', {
      href: value, target: '_blank', rel: 'noopener noreferrer',
      text: 'Open the reference  ↗'
    });
  }
  if (value) return h('p.vz-frame-view.vz-frame-desc', { text: value });
  return h('p.vz-frame-view.vz-frame-none', {
    text: 'No reference yet — paste a link, or describe it below.'
  });
}

/* ---- shared bits --------------------------------------------- */
function labelled(label, control) {
  return h('label.vz-fieldset', {}, [h('span.vz-flabel', { text: label }), control]);
}
function noImageNote(text) {
  return h('p.vz-note', {}, [
    h('strong', { text: 'No image uploads. ' }),
    h('span', { text })
  ]);
}

/* ---- render --------------------------------------------------- */
function render() {
  const scenes = Scenes.listScenes();
  const shots = Shots.listShots();
  const frames = Shots.listFrames();
  const boards = Shots.listBoards();

  const main = h('main', { id: 'main' });
  main.append(
    renderHeader(scenes, shots, frames, boards),
    renderShotList(scenes, shots),
    renderStoryboard(scenes, shots, frames),
    renderLookbook(boards)
  );

  app.replaceChildren(main);
  mountShell();
  // Chrome initialises at import time, when #app is still empty — the
  // trap short.js fell into. Re-init after every render.
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[visualize] chrome', e); }
}

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
delegate(document, 'click', '[data-action="vz-shot-up"]',   (e, el) => { Shots.moveShot(shotIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="vz-shot-down"]', (e, el) => { Shots.moveShot(shotIdOf(el),  1); render(); });
delegate(document, 'click', '[data-action="vz-shot-del"]',  (e, el) => {
  const id = shotIdOf(el);
  const shot = Shots.listShots().find((s) => s.id === id);
  const frames = Shots.listFrames().filter((f) => f.shotId === id).length;
  const label = shot && shot.description ? ' "' + shot.description.slice(0, 40) + '"' : '';
  const also = frames ? ' Its ' + plural(frames, 'frame goes', 'frames go') + ' with it.' : '';
  if (!confirm('Delete shot' + label + '?' + also)) return;
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
delegate(document, 'click', '[data-action="vz-frame-del"]',  (e, el) => {
  if (!confirm('Delete this frame? The shot it draws is untouched.')) return;
  Shots.removeFrame(frameIdOf(el));
  render();
});
delegate(document, 'change', '[data-frame-field]', (e, el) => {
  const id = frameIdOf(el);
  Shots.updateFrame(id, { [el.dataset.frameField]: el.value });
  // The slate shows the reference. Patched in place, not re-rendered:
  // see the note on the shot-field handler above.
  if (el.dataset.frameField !== 'ref') return;
  const card = document.querySelector('.vz-frame[data-frame="' + id + '"]');
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
delegate(document, 'click', '[data-action="vz-board-del"]',  (e, el) => {
  const id = boardIdOf(el);
  const board = Shots.listBoards().find((b) => b.id === id);
  const n = board ? board.entries.length : 0;
  const also = n ? ' Its ' + plural(n, 'reference goes', 'references go') + ' with it.' : '';
  if (!confirm('Delete the board "' + ((board && board.name) || 'untitled') + '"?' + also)) return;
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
delegate(document, 'click', '[data-action="vz-entry-del"]', (e, el) => {
  Shots.removeEntry(boardIdOf(el), entryIdOf(el));
  render();
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

render();
