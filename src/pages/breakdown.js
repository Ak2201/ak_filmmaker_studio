/* ============================================================
   BREAKDOWN — scene list, tagging and the element index
   ------------------------------------------------------------
   Three views of ONE scene model (src/lib/scenes.js). Nothing here
   stores a second copy of anything: the element index is derived on
   every render, because two copies drift within a day.

   This page is also where the new visual language starts — generous
   spacing, one clear action per row, colour carrying meaning instead
   of decorating. The old pages put twelve small buttons in a strip and
   made the user read every one.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import Scenes, {
  INT_EXT, DAY_NIGHT, ELEMENT_CATEGORIES, formatEighths, totalEighths
} from '../lib/scenes.js';
import * as Songs from '../lib/songs.js';
import { loadScript } from '../lib/script.js';
import { suggestAll } from '../lib/screenplay-analysis.js';

const app = document.getElementById('app');
const catById = Object.fromEntries(ELEMENT_CATEGORIES.map((c) => [c.id, c]));

/* ---- header ------------------------------------------------ */
function renderHeader(scenes) {
  const eighths = totalEighths(scenes);
  return h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Breakdown · one scene model, three views' }),
    h('h1.bd-title', { text: 'Scene Breakdown.' }),
    h('p.bd-deck', {
      text: 'Every scene once — INT/EXT, time, location, length. The stripboard, '
          + 'the sides, the shot list and the call sheet all read from this, so it '
          + 'is the only place any of it gets typed.'
    }),
    h('div.bd-stats', {}, [
      stat(String(scenes.length), scenes.length === 1 ? 'scene' : 'scenes'),
      stat(formatEighths(eighths), eighths === 8 ? 'page' : 'pages'),
      stat(String(Scenes.elementIndex().length), 'elements'),
      stat(String(new Set(scenes.map((s) => s.location).filter(Boolean)).size), 'locations'),
      stat(String(Songs.listSongs().length), 'songs')
    ])
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ---- the teaching empty state ------------------------------
   StudioBinder's best idea: an empty module explains itself instead of
   showing a blank grid. Anchored in the four films like the glossary. */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◍', 'aria-hidden': 'true' }),
    h('h2', { text: 'Start with the scenes' }),
    h('p', {
      text: 'A scene is one continuous action, in one place, at one time. '
          + 'When the place or the time changes, the scene changes — that is the '
          + 'whole rule, and it is what makes everything downstream possible.'
    }),
    h('div.bd-how', {}, [
      how('1', 'List them', 'Number, INT or EXT, day or night, where, and one line of what happens.'),
      how('2', 'Measure them', 'Length in eighths of a page. Eight eighths is one page, and one page is roughly one minute.'),
      how('3', 'Tag them', 'Cast, props, wardrobe, vehicles. Tag once here and every report builds itself.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'Por Thozhil' }),
      h('span', {
        text: ' opens on an interior, day, a police station — one location, one '
            + 'continuous action. The moment the investigation moves outside, that '
            + 'is a new scene, a new line here, and eventually a different shoot day.'
      })
    ]),
    h('button.btn.primary.bd-cta', { type: 'button', 'data-action': 'scene-add', text: '+  Add the first scene' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- one scene ---------------------------------------------- */
function renderScene(scene, i, total) {
  const card = h('article.bd-scene', { 'data-scene': scene.id });

  card.append(h('div.bd-scene-bar', {}, [
    h('span.bd-scene-no', { text: scene.number || String(i + 1) }),
    field('input.bd-slug', {
      type: 'text', value: scene.location, placeholder: 'Location — where are we?',
      'data-scene-field': 'location', 'aria-label': 'Scene location'
    }),
    select(INT_EXT, scene.intExt, 'intExt', 'Interior or exterior'),
    select(DAY_NIGHT, scene.dayNight, 'dayNight', 'Time of day'),
    h('label.bd-eighths', {}, [
      h('span', { text: 'eighths' }),
      field('input', {
        type: 'number', min: '0', max: '80', step: '1', value: String(scene.eighths),
        'data-scene-field': 'eighths', 'aria-label': 'Length in eighths of a page'
      })
    ]),
    h('span.bd-pages', { text: formatEighths(scene.eighths) }),
    h('div.bd-scene-acts', {}, [
      iconBtn('↑', 'scene-up',   'Move earlier', i === 0),
      iconBtn('↓', 'scene-down', 'Move later',   i === total - 1),
      iconBtn('✕', 'scene-del',  'Delete scene', false, true)
    ])
  ]));

  card.append(field('textarea.bd-synopsis', {
    rows: '2', placeholder: 'What happens in this scene?',
    'data-scene-field': 'synopsis', 'aria-label': 'Scene synopsis'
  }, scene.synopsis));

  /* Which song this scene belongs to, if any. Only offered once a
     song exists — an empty dropdown on every scene card would be
     noise on the 95% of films that have not added one yet. */
  const songs = Songs.listSongs();
  if (songs.length) {
    const sel = h('select.bd-sel.bd-scene-song', {
      'data-scene-field': 'songId', 'aria-label': 'Part of which song'
    });
    const none = h('option', { value: '', text: 'Not part of a song' });
    if (!scene.songId) none.selected = true;
    sel.append(none);
    songs.forEach((sg) => {
      const opt = h('option', {
        value: sg.id,
        text: (sg.number ? sg.number + '. ' : '') + (sg.title || Songs.kindLabel(sg.kind))
      });
      if (sg.id === scene.songId) opt.selected = true;
      sel.append(opt);
    });
    card.append(h('label.bd-scene-songlink', {}, [h('span', { text: 'song' }), sel]));
  }

  const tags = h('div.bd-tags');
  for (const cat of ELEMENT_CATEGORIES) {
    const names = scene.elements[cat.id] || [];
    if (!names.length) continue;
    for (const name of names) {
      const chip = h(`span.bd-chip.hue-${cat.hue}`, { title: cat.label });
      chip.append(
        h('span.bd-chip-cat', { text: cat.label }),
        h('span.bd-chip-name', { text: name }),
        h('button.bd-chip-x', {
          type: 'button', 'data-action': 'el-remove',
          'data-cat': cat.id, 'data-name': name,
          'aria-label': `Remove ${name} from ${cat.label}`, text: '✕'
        })
      );
      tags.append(chip);
    }
  }
  const adder = h('div.bd-add-el');
  const sel = h('select.bd-add-cat', { 'aria-label': 'Element category' });
  ELEMENT_CATEGORIES.forEach((c) => sel.append(h('option', { value: c.id, text: c.label })));
  adder.append(sel, h('input.bd-add-name', {
    type: 'text', placeholder: 'Tag an element — name it, press Enter',
    'data-action-key': 'el-add', 'aria-label': 'Element name'
  }));
  tags.append(adder);
  card.append(tags);
  return card;
}

function field(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}
function select(options, value, fieldName, label) {
  const s = h('select.bd-sel', { 'data-scene-field': fieldName, 'aria-label': label });
  options.forEach((o) => {
    const opt = h('option', { value: o, text: o });
    if (o === value) opt.selected = true;
    s.append(opt);
  });
  return s;
}
function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

/* ---- songs --------------------------------------------------
   A Tamil feature carries four to six, and until now nothing in this
   studio knew what one was. The model is in src/lib/songs.js and the
   reasoning for it being its own model rather than a flag on a scene
   is at the top of that file.

   The card shows the PLAN and, once scenes are linked, what the script
   actually says — side by side, never merged. A song planned for two
   days whose scenes are spread over four is a schedule problem the
   producer has to see, and overwriting the plan with the derived
   figure would delete the evidence that there was ever a disagreement.
   The budget page settled this already: a hand-set figure is a
   decision, not a gap.
   ------------------------------------------------------------ */
function songSelect(options, value, fieldName, label) {
  const sel = h('select.bd-sel', { 'data-song-field': fieldName, 'aria-label': label });
  options.forEach((o) => {
    const opt = h('option', { value: o.id, text: o.label });
    if (o.id === value) opt.selected = true;
    sel.append(opt);
  });
  return sel;
}

function songField(spec, props, text) {
  const el = h(spec, props);
  if (text !== undefined) el.value = text;
  return el;
}

function renderSong(song, i, total, scenes) {
  const f = Songs.songFacts(song, scenes);
  const card = h('article.bd-song', { 'data-song': song.id });

  card.append(h('div.bd-song-bar', {}, [
    h('span.bd-song-no', { text: song.number || String(i + 1) }),
    songField('input.bd-song-title', {
      type: 'text', placeholder: 'Song title — or “untitled duet”',
      'data-song-field': 'title', 'aria-label': 'Song title'
    }, song.title),
    songSelect(Songs.SONG_KINDS, song.kind, 'kind', 'Kind of song'),
    songSelect(Songs.PLAYBACK_STATES, song.playback, 'playback', 'Playback state'),
    songSelect(Songs.UNITS, song.unit, 'unit', 'Which unit shoots it'),
    h('div.bd-song-acts', {}, [
      iconBtn('↑', 'song-up',   'Move earlier', i === 0),
      iconBtn('↓', 'song-down', 'Move later',   i === total - 1),
      iconBtn('✕', 'song-del',  'Delete song',  false, true)
    ])
  ]));

  card.append(songField('textarea.bd-song-sit', {
    rows: '2', 'data-song-field': 'situation', 'aria-label': 'Song situation',
    placeholder: 'What is the song doing in the story? The situation, not the lyrics.'
  }, song.situation));

  card.append(h('div.bd-song-grid', {}, [
    h('label.bd-song-f', {}, [
      h('span', { text: 'planned locations' }),
      songField('input', {
        type: 'text', 'data-song-field': 'locations', 'aria-label': 'Planned locations',
        placeholder: 'Marina, studio floor'
      }, song.locations)
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'planned days' }),
      songField('input', {
        type: 'number', min: '0', max: '60', step: '0.5',
        'data-song-field': 'days', 'aria-label': 'Planned shoot days'
      }, String(song.days || ''))
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'dancers' }),
      songField('input', {
        type: 'number', min: '0', max: '500', step: '1',
        'data-song-field': 'dancers', 'aria-label': 'Number of dancers'
      }, String(song.dancers || ''))
    ]),
    h('label.bd-song-f', {}, [
      h('span', { text: 'choreographer' }),
      songField('input', {
        type: 'text', 'data-song-field': 'choreographer', 'aria-label': 'Choreographer'
      }, song.choreographer)
    ])
  ]));

  /* What the script says, when it says anything. Shown as a separate
     line from the plan above, deliberately. */
  const facts = h('div.bd-song-facts');
  if (f.sceneCount) {
    facts.append(
      h('span', { text: f.sceneCount + (f.sceneCount === 1 ? ' scene' : ' scenes') + ' linked' }),
      h('span', { text: formatEighths(f.eighths) + ' pages' }),
      h('span', {
        text: f.scriptDays
          ? f.scriptDays + (f.scriptDays === 1 ? ' shoot day' : ' shoot days') + ' on the board'
          : 'no shoot day assigned yet'
      })
    );
  } else {
    facts.append(h('span', {
      text: 'No scenes linked yet — normal this early. Link them on a scene card above.'
    }));
  }
  card.append(facts);

  if (f.disagrees) {
    card.append(h('p.bd-song-warn', {
      text: 'The plan says ' + f.plannedDays
        + (f.plannedDays === 1 ? ' day' : ' days') + ' and the board has these scenes across '
        + f.scriptDays + (f.scriptDays === 1 ? ' day' : ' days')
        + '. Neither has been changed — decide which is right.'
    }));
  }
  /* A song cannot be picturised without a track to play, so a song
     with shoot days and no recording is a scheduling dependency, not
     a tidy-up. This is the one status here that can stop a day. */
  if (!f.ready && f.effectiveDays) {
    card.append(h('p.bd-song-warn', {
      text: 'Playback is “' + Songs.playbackLabel(song.playback) + '” but '
        + f.effectiveDays + (f.effectiveDays === 1 ? ' day is' : ' days are')
        + ' planned. Picturisation needs a track to play — this day cannot be shot yet.'
    }));
  }
  return card;
}

function renderSongs(scenes) {
  const songs = Songs.listSongs();
  const wrap = h('section.bd-songs', { id: 'songs' });
  const t = Songs.songTotals(songs, scenes);

  wrap.append(
    h('h2.bd-h2', { text: 'Songs' }),
    h('p.bd-sub', {
      text: 'A song is its own production unit — its own days, its own locations, '
          + 'often its own unit — and it is usually decided before a scene exists '
          + 'to hang it on. Plan it here, then link the scenes once they are '
          + 'written; the stripboard groups by song and the budget counts its days.'
    })
  );

  if (songs.length) {
    wrap.append(h('div.bd-stats', {}, [
      stat(String(t.count), t.count === 1 ? 'song' : 'songs'),
      stat(String(t.days), t.days === 1 ? 'shoot day' : 'shoot days'),
      stat(String(t.linkedScenes), 'linked scenes'),
      stat(String(t.peakDancers || '—'), 'peak dancers')
    ]));
    if (t.blocked) {
      wrap.append(h('p.bd-song-warn', {
        text: t.blocked + (t.blocked === 1 ? ' song has' : ' songs have')
          + ' shoot days planned with no recorded track. Those days cannot be shot.'
      }));
    }
    songs.forEach((sg, i) => wrap.append(renderSong(sg, i, songs.length, scenes)));
  } else {
    wrap.append(h('p.bd-none', {
      text: 'No songs yet. Most Tamil features carry four to six, and the count is '
          + 'part of what a producer is sold — so it is worth deciding early, even '
          + 'before the situations are written.'
    }));
  }

  wrap.append(h('button.btn.bd-add', {
    type: 'button', 'data-action': 'song-add', text: '+  Add song'
  }));
  return wrap;
}

/* ---- element index ------------------------------------------ */
function renderElements() {
  const index = Scenes.elementIndex();
  const wrap = h('section.bd-elements', { id: 'elements' });
  wrap.append(h('h2.bd-h2', { text: 'Elements' }),
              h('p.bd-sub', { text: 'Derived from the tags above. Nothing here is typed twice.' }));
  if (!index.length) {
    wrap.append(h('p.bd-none', { text: 'No elements tagged yet. Tag one on any scene and it appears here, with every scene it touches.' }));
    return wrap;
  }
  const grid = h('div.bd-el-grid');
  for (const item of index) {
    const cat = catById[item.category] || { label: item.category, hue: 'feature' };
    grid.append(h(`div.bd-el.hue-${cat.hue}`, {}, [
      h('span.bd-el-cat', { text: cat.label }),
      h('strong.bd-el-name', { text: item.name }),
      h('span.bd-el-scenes', {
        text: item.scenes.length === 1
          ? `scene ${item.scenes[0].number}`
          : `${item.scenes.length} scenes · ${item.scenes.map((s) => s.number).join(', ')}`
      })
    ]));
  }
  wrap.append(grid);
  return wrap;
}

/* ---- suggested from the script (PRD 2.0 FR-603) --------------
   The script's action lines and cues read for cast, props, vehicles,
   stunts and sound — see src/data/element-lexicon.json for what is
   looked for and why. A SUGGESTION IS NOT A TAG: each one is a button
   carrying the line it was read off, and nothing lands on a scene until
   somebody presses it. A breakdown is a 1st AD's judgement; this saves
   the typing, not the judgement. */
const SUGGEST_CATS = ['cast', 'props', 'vehicles', 'stunts', 'sound'];
function renderSuggestions(scenes) {
  const wrap = h('section.bd-suggest', { id: 'suggest' });
  wrap.append(h('h2.bd-h2', { text: 'Suggested from the script' }),
              h('p.bd-sub', { text: 'Read from each scene\u2019s cues and action lines, in the colour of its category. '
                + 'Press one to tag it; nothing is added until you do. The Nth scene heading in the script is matched to the Nth scene here.' }));
  const rows = scenes.length ? suggestAll(scenes, loadScript().elements) : [];
  if (!rows.length) {
    wrap.append(h('p.bd-none', { text: scenes.length
      ? 'Nothing to suggest \u2014 either everything the script mentions is already tagged, or there is no script text yet. Write or import the script on the Write page.'
      : 'Import or write a script and the elements it mentions are offered here, scene by scene.' }));
    return wrap;
  }
  const total = rows.reduce((n, r) => n + SUGGEST_CATS.reduce((m, c) => m + r.suggestions[c].length, 0), 0);
  wrap.append(h('div.bd-sug-tools', {}, [
    h('span.bd-sug-count', { text: `${total} suggestion${total === 1 ? '' : 's'} across ${rows.length} scene${rows.length === 1 ? '' : 's'}` }),
    h('button.btn', { type: 'button', 'data-action': 'sug-all', text: 'ADD ALL' })
  ]));
  const list = h('ol.bd-sug-list');
  for (const r of rows) {
    const li = h('li.bd-sug-scene', { 'data-scene': r.scene.id });
    li.append(h('div.bd-sug-head', {}, [
      h('strong', { text: `Scene ${r.scene.number || '\u2014'}` }),
      h('span.bd-sug-slug', { text: r.heading }),
      h('button.btn.bd-sug-scene-all', { type: 'button', 'data-action': 'sug-scene', text: 'ADD THESE' })
    ]));
    const tags = h('div.bd-tags');
    for (const cat of SUGGEST_CATS) {
      const c = catById[cat];
      for (const sug of r.suggestions[cat]) {
        tags.append(h(`button.bd-chip.bd-sug.hue-${c.hue}`, {
          type: 'button', 'data-action': 'sug-add', 'data-cat': cat, 'data-name': sug.name,
          title: 'From: ' + sug.from, 'aria-label': `Tag ${sug.name} as ${c.label} — from: ${sug.from}`
        }, [h('span.bd-chip-cat', { text: c.label }), h('span.bd-chip-name', { text: '+ ' + sug.name })]));
      }
    }
    li.append(tags);
    list.append(li);
  }
  wrap.append(list);
  return wrap;
}

function applySuggestions(sceneIds) {
  const scenes = Scenes.listScenes();
  const rows = suggestAll(scenes, loadScript().elements).filter((r) => !sceneIds || sceneIds.includes(r.scene.id));
  let n = 0;
  for (const r of rows) for (const cat of SUGGEST_CATS) for (const sug of r.suggestions[cat]) {
    Scenes.tagElement(r.scene.id, cat, sug.name); n++;
  }
  return n;
}

/* ---- render ------------------------------------------------- */
function render() {
  const scenes = Scenes.listScenes();
  const main = h('main', { id: 'main' });
  main.append(renderHeader(scenes));

  /* A NAV TARGET MUST NOT DEPEND ON DATA EXISTING.

     navigation.json sends the Breakdown phase to breakdown.html#scenes
     and #elements, and both ids used to live only on the populated
     branch. So on a studio with no scenes yet the fragment resolved to
     nothing and the browser stayed where it was — the phase menu
     looked broken to precisely the person who had never used the page.
     Measured before the fix: 6 of the 18 fragment hrefs in
     navigation.json were absent from the DOM, all 6 on the three
     scene-derived pages, in BOTH the no-project and the
     project-without-scenes states.

     Same shape as the hue-class trap and the skin-defaults trap: a
     thing the markup promises has to be there when the JS or the data
     has not arrived. So the ids move onto wrappers that always render,
     and the empty state lives inside the one it belongs to.
     renderElements() needed nothing — it already keeps its id and
     carries its own teaching copy when the index is empty. */
  const list = h('section.bd-list', { id: 'scenes' });
  if (!scenes.length) {
    list.append(renderEmpty());
  } else {
    scenes.forEach((s, i) => list.append(renderScene(s, i, scenes.length)));
    list.append(h('button.btn.bd-add', { type: 'button', 'data-action': 'scene-add', text: '+  Add scene' }));
  }
  /* renderSongs() is OUTSIDE the branch for the same reason the #scenes
     id moved onto an always-rendering wrapper: navigation.json sends
     the Breakdown phase to breakdown.html#songs, so that id has to
     exist before any data does. It wants to be unconditional anyway —
     a song list is decided before the scenes are, so hiding it until a
     scene exists would hide it at exactly the moment it is most
     useful. The branch-local version this replaces called it twice. */
  main.append(list, renderSuggestions(scenes), renderSongs(scenes), renderElements());

  app.replaceChildren(main);
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[breakdown] chrome', e); }
}

/* ---- events — delegated, no inline handlers ----------------- */
const sceneIdOf = (el) => el.closest('[data-scene]')?.dataset.scene;

delegate(document, 'click', '[data-action="scene-add"]', () => {
  Scenes.addScene();
  render();
  const last = document.querySelector('.bd-scene:last-of-type .bd-slug');
  if (last) last.focus();
});
delegate(document, 'click', '[data-action="scene-up"]',   (e, el) => { Scenes.moveScene(sceneIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="scene-down"]', (e, el) => { Scenes.moveScene(sceneIdOf(el),  1); render(); });
delegate(document, 'click', '[data-action="scene-del"]',  (e, el) => {
  const id = sceneIdOf(el);
  const scene = Scenes.listScenes().find((s) => s.id === id);
  const label = scene && (scene.location || scene.synopsis) ? ` "${(scene.location || scene.synopsis).slice(0, 40)}"` : '';
  if (!confirm(`Delete scene${label}? Its tagged elements go with it.`)) return;
  Scenes.removeScene(id);
  render();
});
delegate(document, 'click', '[data-action="sug-add"]', (e, el) => {
  Scenes.tagElement(sceneIdOf(el), el.dataset.cat, el.dataset.name);
  render();
});
delegate(document, 'click', '[data-action="sug-scene"]', (e, el) => {
  const n = applySuggestions([sceneIdOf(el)]);
  render();
  StudioUI.toast(`Tagged ${n} element${n === 1 ? '' : 's'}.`);
});
delegate(document, 'click', '[data-action="sug-all"]', () => {
  const n = applySuggestions(null);
  render();
  StudioUI.toast(`Tagged ${n} element${n === 1 ? '' : 's'} across the breakdown.`);
});
delegate(document, 'click', '[data-action="el-remove"]', (e, el) => {
  Scenes.untagElement(sceneIdOf(el), el.dataset.cat, el.dataset.name);
  render();
});

// Field edits RE-RENDER on change rather than per keystroke — a render
// on every character would steal the caret. But they SAVE as they are
// typed: on `change` alone, a reload or a closed tab took everything
// since the field was entered (UX audit H10). saveOnInput() debounces
// the store write and flushes it on pagehide / hidden.
import { saveOnInput } from '../lib/autosave.js';
const sceneValue = (el) => el.dataset.sceneField === 'eighths'
  ? Math.max(0, parseInt(el.value, 10) || 0) : el.value;
saveOnInput('[data-scene-field]', (el) => {
  Scenes.updateScene(sceneIdOf(el), { [el.dataset.sceneField]: sceneValue(el) });
});
delegate(document, 'change', '[data-scene-field]', (e, el) => {
  const key = el.dataset.sceneField;
  Scenes.updateScene(sceneIdOf(el), { [key]: sceneValue(el) });
  if (key === 'eighths') render();
});
delegate(document, 'keydown', '[data-action-key="el-add"]', (e, el) => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const cat = el.previousElementSibling.value;
  if (!el.value.trim()) return;
  Scenes.tagElement(sceneIdOf(el), cat, el.value);
  render();
});

/* ---- songs — events ----------------------------------------- */
const songIdOf = (el) => el.closest('[data-song]')?.dataset.song;

delegate(document, 'click', '[data-action="song-add"]', () => {
  Songs.addSong();
  render();
  const last = document.querySelector('.bd-song:last-of-type .bd-song-title');
  if (last) last.focus();
});
delegate(document, 'click', '[data-action="song-up"]',   (e, el) => { Songs.moveSong(songIdOf(el), -1); render(); });
delegate(document, 'click', '[data-action="song-down"]', (e, el) => { Songs.moveSong(songIdOf(el),  1); render(); });

/* Deleting a song UNLINKS its scenes rather than deleting them. A
   song row is a plan; the scenes are pages someone wrote. One button
   must never take both, and the confirm says which it takes. */
delegate(document, 'click', '[data-action="song-del"]', (e, el) => {
  const id = songIdOf(el);
  const song = Songs.listSongs().find((s) => s.id === id);
  if (!song) return;
  const linked = Songs.scenesFor(id);
  const label = song.title ? ` "${song.title.slice(0, 40)}"` : '';
  const note = linked.length
    ? `\n\n${linked.length} scene${linked.length === 1 ? '' : 's'} will be unlinked. `
      + 'The scenes themselves are kept.'
    : '';
  if (!confirm(`Delete song${label}?${note}`)) return;
  linked.forEach((sc) => Scenes.updateScene(sc.id, { songId: '' }));
  Songs.removeSong(id);
  render();
});

const songValue = (el) => {
  const key = el.dataset.songField;
  if (key === 'days') return Math.max(0, parseFloat(el.value) || 0);
  if (key === 'dancers') return Math.max(0, parseInt(el.value, 10) || 0);
  return el.value;
};
// Saved as typed, re-rendered on change — as the scene fields above.
saveOnInput('[data-song-field]', (el) => {
  Songs.updateSong(songIdOf(el), { [el.dataset.songField]: songValue(el) });
});
delegate(document, 'change', '[data-song-field]', (e, el) => {
  const id = songIdOf(el);
  const key = el.dataset.songField;
  Songs.updateSong(id, { [key]: songValue(el) });
  // These three change what the card reports about itself — the day
  // disagreement, the playback block, the header totals.
  if (key === 'days' || key === 'dancers' || key === 'playback') render();
});

render();
