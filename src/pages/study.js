/* ============================================================
   CASE STUDIES — the demo film, read as craft
   ------------------------------------------------------------
   The library already teaches through four Tamil films, but it
   shows all four at once: four examples under every idea. That is
   a reference book, and a reference book is what you consult, not
   what you write beside.

   This page is the other shape. One film is SELECTED and the whole
   workspace speaks in its terms — the concept card, the logline
   anatomy, the characters, the seven beats, the scene studies and
   the glossary all redraw against it. Pick a different film and
   nothing on the page is a heading swap; every example changes.

   THE THREE-PART SHAPE.

   Every teaching card on this page is the same three steps, in the
   same order, with the same labels:

     1  what the thing IS          — the definition, film-agnostic
     2  how THIS film did it       — the analysis, from studies.json
     3  how to write YOURS         — the instruction you can act on

   That is the whole feature. A definition on its own is a glossary;
   an example on its own is trivia; an instruction on its own is a
   writing-advice tweet. The order matters too — a reader who meets
   the instruction before the example has nothing to measure it
   against.

   TRUTHFULNESS OVER COMPLETENESS.

   Three of the four studies are being written. validate() from
   studies.js reports exactly which fields are missing and this page
   renders that report — a named gap, not a blank card and not a
   card padded with another film's answer. When the prose lands, the
   gaps disappear with no code change here, because the page never
   hard-codes what it expects to find.

   Nothing on this page writes. It is a reading surface: the only
   localStorage touch in the whole flow is the demo-film preference,
   written by selectDemo() when a tab is clicked, and never from a
   render.
   ============================================================ */
import '../lib/store.js';
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/study.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import {
  BEATS, listStudies, getStudy, currentStudy, currentSlug,
  loadDemo, onDemoChange, validate, getBeatSheetMethod
} from '../lib/studies.js';
import { renderDemoSelector } from '../ui/demo-selector.js';
import { t, langToggle, currentLang, setLang, onLangChange, initLang } from '../lib/lang.js';
import glossary from '../data/glossary.json';

const app = document.getElementById('app');

/* The workbench is a sibling module built alongside this one. It is
   loaded through import.meta.glob rather than a literal dynamic
   import so that the build succeeds whether or not the file exists:
   a bare import() of a missing path is a rollup resolution error, and
   a page that cannot build is worse than a page without a workbench.
   Once the file lands it is bundled and chunked normally. */
const WORKBENCH = import.meta.glob('../ui/workbench*.js');

/* ------------------------------------------------------------
   Small helpers. `filled` is the one that matters: every section
   asks it before drawing, so an unwritten field becomes a named
   gap instead of an empty element with padding.
   ------------------------------------------------------------ */
const filled = (v) => typeof v === 'string' ? v.trim().length > 0 : Array.isArray(v) ? v.length > 0 : Boolean(v);
const ACT_NAMES = { 1: 'Act One · Setup', 2: 'Act Two · Confrontation', 3: 'Act Three · Resolution' };

/** A labelled line of analysis, or an honest blank naming what is absent. */
function line(label, value, missing) {
  const wrap = h('div.st-line');
  wrap.append(h('span.st-line-lab', { text: label }));
  wrap.append(filled(value)
    ? h('p.st-line-body', { text: value })
    : h('p.st-missing', { text: missing || 'Not written yet.' }));
  return wrap;
}

/** The "this has not been written" panel. It NAMES the fields. */
function gapPanel(title, what, fields) {
  const box = h('div.st-gap', { role: 'note' });
  box.append(h('p.bd-eyebrow.st-gap-lab', { text: 'Not written yet' }));
  box.append(h('p.st-gap-body', { text: what }));
  if (fields && fields.length) {
    const list = h('ul.st-gap-list');
    fields.forEach((f) => list.append(h('li', { text: f })));
    box.append(h('p.st-gap-sub', { text: 'Missing from ' + title + ':' }), list);
  }
  return box;
}

/** Turn validate()'s dotted ids into something a person reads. */
const GAP_WORDS = {
  'concept.premise': 'the premise',
  'concept.hook': 'the hook',
  'concept.howBuilt': 'how the film established it',
  'concept.yourTurn': 'the write-yours instruction',
  'logline.line': 'the logline itself',
  'logline.protagonist': 'the protagonist',
  'logline.incident': 'the inciting incident',
  'logline.conflict': 'the conflict',
  'logline.goal': 'the goal',
  'logline.cost': 'the cost of failure',
  characters: 'every character study',
  scenes: 'every scene-craft study'
};
function gapWord(id) {
  if (GAP_WORDS[id]) return GAP_WORDS[id];
  const beat = /^beat:([^.]+)(\.inFilm)?$/.exec(id);
  if (beat) {
    const canon = BEATS.find((b) => b.id === beat[1]);
    const label = canon ? canon.label : beat[1];
    return beat[2] ? label + ' — this film’s analysis' : label;
  }
  return id;
}
const gapsFor = (gaps, prefix) =>
  gaps.filter((g) => g === prefix || g.indexOf(prefix + '.') === 0 || g.indexOf(prefix + ':') === 0).map(gapWord);

/* ------------------------------------------------------------
   Definitions. The film-agnostic half of every card.

   Where the glossary already carries a definition, this reads it
   from there rather than restating it — one wording of "logline"
   in the app, not two that drift.
   ------------------------------------------------------------ */
const termIndex = Object.fromEntries((glossary.terms || []).map((t) => [String(t.term).toLowerCase(), t]));
const termDef = (name) => (termIndex[String(name).toLowerCase()] || {}).def || '';
const termTanglish = (name) => (termIndex[String(name).toLowerCase()] || {}).tanglish || '';

const DEF_PREMISE = 'A premise is the situation the story cannot happen without — who is in trouble, '
  + 'and what kind. It is not a theme and not a plot: it is the engine, stated so plainly that anyone '
  + 'can tell whether a scene is running on it.';
const DEF_HOOK = 'The hook is the reason a stranger keeps listening. A premise that is true but that '
  + 'nobody needs answered is a setting, not a story.';

/* ------------------------------------------------------------
   The three-part card. Everything teaching on this page is one.
   ------------------------------------------------------------ */
function threePart(parts) {
  const ol = h('ol.st-three');
  parts.forEach((p, i) => {
    const li = h('li.st-part' + (p.mod ? '.' + p.mod : ''));
    li.append(h('span.st-part-n', { text: String(i + 1), 'aria-hidden': 'true' }));
    li.append(h('p.st-part-lab', { text: p.lab }));
    [].concat(p.body || []).forEach((node) => {
      if (node === null || node === undefined || node === false) return;
      li.append(typeof node === 'string' ? h('p.st-part-body', { text: node }) : node);
    });
    ol.append(li);
  });
  return ol;
}

function guideCard(eyebrow, title, parts) {
  const card = h('article.st-guide');
  card.append(h('p.bd-eyebrow', { text: eyebrow }));
  card.append(h('h3.st-guide-title', { text: title }));
  card.append(threePart(parts));
  return card;
}

/* ------------------------------------------------------------
   HEADER
   ------------------------------------------------------------ */
function renderHeader(study, gaps) {
  const meta = study.meta || {};
  const head = h('header.bd-head');
  head.append(h('p.bd-eyebrow', { text: 'Case study · ' + (meta.genre || 'craft analysis') }));
  head.append(h('h1.bd-title', { text: meta.title || 'Untitled study' }));
  head.append(h('p.st-byline', {
    text: [meta.year, meta.director ? 'dir. ' + meta.director : ''].filter(Boolean).join(' · ')
  }));
  head.append(h('p.bd-deck', {
    text: filled(study.concept && study.concept.premise)
      ? study.concept.premise
      : 'This study has not been written yet. The structure below shows what it will cover, '
        + 'and names every part that is still missing.'
  }));

  const written = BEATS.filter((b) => {
    const got = (study.beats || []).find((x) => x.id === b.id);
    return got && filled(got.inFilm);
  }).length;
  head.append(h('div.bd-stats', {}, [
    stat(written + '/' + BEATS.length, written === 1 ? 'beat written' : 'beats written'),
    stat(String((study.characters || []).length), 'characters'),
    stat(String((study.scenes || []).length), 'scene studies'),
    stat(String((study.glossary || []).length), 'core terms')
  ]));

  if (gaps.length) {
    head.append(h('p.st-head-gap', {
      text: gaps.length + (gaps.length === 1 ? ' part of this study is' : ' parts of this study are')
        + ' still unwritten. They are named where they belong rather than hidden.'
    }));
  }

  if ((study.directorNotes || []).length) {
    const notes = h('div.st-notes');
    notes.append(h('p.bd-eyebrow', { text: 'What the director keeps doing' }));
    const ul = h('ul.st-note-list');
    study.directorNotes.forEach((n) => ul.append(h('li', { text: n })));
    notes.append(ul);
    head.append(notes);
  }
  return head;
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* ------------------------------------------------------------
   SECTION SHELL
   ------------------------------------------------------------ */
function section(id, eyebrow, title, deck) {
  const sec = h('section#' + id + '.st-sec', { 'aria-labelledby': id + '-h' });
  sec.append(h('p.bd-eyebrow', { text: eyebrow }));
  sec.append(h('h2.bd-h2', { id: id + '-h', text: title }));
  if (deck) sec.append(h('p.bd-sub', { text: deck }));
  return sec;
}

/* ------------------------------------------------------------
   1. CONCEPT — premise and logline, both in the three-part shape
   ------------------------------------------------------------ */
function renderConcept(study, gaps) {
  const title = study.meta.title;
  const sec = section('concept', 'The idea',
    'Concept and logline',
    'What the story is, before a single scene exists. Two cards, each in the same three '
    + 'steps: what it is, how ' + title + ' did it, how to write yours.');

  const conceptGaps = gapsFor(gaps, 'concept');
  const c = study.concept || {};
  if (conceptGaps.length === 4) {
    sec.append(gapPanel('the concept card', 'The concept study for ' + title
      + ' has not been written yet.', conceptGaps));
  } else {
    sec.append(guideCard('Concept', 'The premise', [
      { lab: 'What a premise is', body: [DEF_PREMISE, DEF_HOOK] },
      {
        lab: 'How ' + title + ' did it',
        mod: 'is-film',
        body: [
          line('The premise', c.premise),
          line('The hook', c.hook),
          line('How it was established', c.howBuilt)
        ]
      },
      {
        lab: 'How to write yours',
        mod: 'is-turn',
        body: filled(c.yourTurn) ? [c.yourTurn] : [h('p.st-missing', { text: 'The write-yours instruction is not written yet.' })]
      }
    ]));
  }

  const logGaps = gapsFor(gaps, 'logline');
  const l = study.logline || {};
  if (logGaps.length >= 6) {
    sec.append(gapPanel('the logline card', 'The logline study for ' + title
      + ' has not been written yet.', logGaps));
  } else {
    const defBody = [termDef('logline') || 'One sentence carrying the protagonist, their want, '
      + 'the obstacle and the cost of failure.'];
    if (termTanglish('logline')) defBody.push(h('span.tn', { text: termTanglish('logline') }));

    const filmBody = [];
    filmBody.push(filled(l.line)
      ? h('blockquote.st-logline', {}, [h('p', { text: l.line })])
      : h('p.st-missing', { text: 'The logline itself is not written yet.' }));
    filmBody.push(anatomyTable(l, title));

    sec.append(guideCard('Logline', 'One sentence, five parts', [
      { lab: 'What a logline is', body: defBody },
      { lab: 'How ' + title + ' did it', mod: 'is-film', body: filmBody },
      {
        lab: 'How to write yours',
        mod: 'is-turn',
        body: filled(l.yourTurn) ? [l.yourTurn] : [h('p.st-missing', { text: 'The write-yours instruction is not written yet.' })]
      }
    ]));
  }
  return sec;
}

const ANATOMY = [
  ['protagonist', 'Protagonist', 'Who wants it, and what is wrong with them'],
  ['incident', 'Inciting incident', 'What arrives that cannot be ignored'],
  ['conflict', 'Conflict', 'What stands in the way, reliably'],
  ['goal', 'Goal', 'The stateable thing they are trying to do'],
  ['cost', 'Cost', 'What is lost if they fail']
];

/* A real table: five named parts against one film's answers. It carries
   .scene-table so it inherits the studio's data-table frame — and, more
   usefully, that class makes the table its own scroll container, so a
   long answer cannot push the page sideways on a phone. */
function anatomyTable(logline, title) {
  const table = h('table.scene-table.st-anat');
  const thead = h('thead');
  thead.append(h('tr', {}, [
    h('th', { scope: 'col', text: 'Part' }),
    h('th', { scope: 'col', text: 'What it does' }),
    h('th', { scope: 'col', text: 'In ' + title })
  ]));
  const tbody = h('tbody');
  for (const [key, label, job] of ANATOMY) {
    const value = logline ? logline[key] : '';
    tbody.append(h('tr', {}, [
      h('td.st-anat-lab', { text: label }),
      h('td.st-anat-job', { text: job }),
      filled(value)
        ? h('td', { text: value })
        : h('td', {}, [h('span.st-missing', { text: 'Not written yet.' })])
    ]));
  }
  table.append(thead, tbody);
  return table;
}

/* ------------------------------------------------------------
   2. CHARACTERS — flaw, want vs need, external vs internal stakes
   ------------------------------------------------------------ */
function renderCharacters(study) {
  const title = study.meta.title;
  const sec = section('characters', 'Who it happens to',
    'Character arcs',
    'A want is what they say. A need is what the story is actually about. The gap between '
    + 'the two is the arc, and the stakes are what each side of it costs.');

  const chars = study.characters || [];
  if (!chars.length) {
    sec.append(gapPanel('the character studies',
      'No character studies have been written for ' + title + ' yet.',
      ['flaw, want, need, external and internal stakes, and the arc, for each principal']));
    return sec;
  }

  const grid = h('div.st-chars');
  for (const ch of chars) {
    const card = h('article.st-char');
    card.append(h('div.st-char-head', {}, [
      h('h3.st-char-name', { text: ch.name || 'Unnamed' }),
      ch.role ? h('span.st-char-role', { text: ch.role }) : null
    ]));
    card.append(line('The flaw', ch.flaw));

    const pair = h('div.st-pair');
    pair.append(pairCol('Want', 'the external, stateable goal', ch.want));
    pair.append(pairCol('Need', 'the internal thing they do not know they need', ch.need));
    card.append(pair);

    const stakes = h('div.st-pair');
    stakes.append(pairCol('External stakes', 'what they lose in the world', ch.external));
    stakes.append(pairCol('Internal stakes', 'what they lose in themselves', ch.internal));
    card.append(stakes);

    if (filled(ch.arc)) {
      card.append(h('p.st-arc', {}, [
        h('span.st-arc-lab', { text: 'Arc' }),
        h('span', { text: ch.arc })
      ]));
    }
    grid.append(card);
  }
  sec.append(grid);
  return sec;
}
function pairCol(label, job, value) {
  const col = h('div.st-pair-col');
  col.append(h('span.st-pair-lab', { text: label }));
  col.append(h('span.st-pair-job', { text: job }));
  col.append(filled(value)
    ? h('p.st-pair-body', { text: value })
    : h('p.st-missing', { text: 'Not written yet.' }));
  return col;
}

/* ------------------------------------------------------------
   3. BEATS — the seven canonical beats, grouped by act
   ------------------------------------------------------------
   Driven by BEATS, never by the film's own array. A study that is
   missing a beat therefore still shows the beat, labelled and in
   its act, with the hole named — which is the difference between
   "this film has six beats" and "one beat is unwritten".
   ------------------------------------------------------------ */
function renderBeats(study) {
  const title = study.meta.title;
  const sec = section('beats', 'How it is built',
    'The seven beats',
    'Each beat is a structural job first and a moment second. The job is the same in every '
    + 'film; what changes is how it is discharged — and that is the part worth stealing.');

  const byId = Object.fromEntries((study.beats || []).map((b) => [b.id, b]));
  const acts = h('div.st-acts');

  for (const act of ['1', '2', '3']) {
    const canon = BEATS.filter((b) => b.act === act);
    const block = h('section.st-act');
    block.append(h('h3.st-act-head', {}, [
      h('span.st-act-no', { text: 'Act ' + act }),
      h('span.st-act-name', { text: ACT_NAMES[act] })
    ]));
    for (const b of canon) {
      const got = byId[b.id] || {};
      const card = h('article.st-beat' + (filled(got.inFilm) ? '' : '.is-missing'));
      card.append(h('div.st-beat-head', {}, [
        h('span.st-beat-label', { text: got.label || b.label }),
        h('span.st-beat-act', { text: 'Act ' + (got.act || b.act) })
      ]));
      card.append(line('Structural function', got.function,
        'The structural function has not been written for this study yet.'));
      card.append(line('In ' + title, got.inFilm,
        'How ' + title + ' performs this beat has not been written yet.'));
      if (filled(got.craft)) {
        card.append(h('p.st-craft', {}, [
          h('span.st-craft-lab', { text: 'Steal this' }),
          h('span', { text: got.craft })
        ]));
      }
      block.append(card);
    }
    acts.append(block);
  }
  sec.append(acts);
  return sec;
}

/* ------------------------------------------------------------
   3b. NAMED BEAT SHEET — an optional second reading of the spine
   ------------------------------------------------------------
   Two halves, deliberately separated in the data.

   THE METHOD (studies.json → beatSheetMethods) owns what belongs to
   the template: the beat names, their page targets, and the
   structural job each one does. Those are facts about the sheet, not
   about any film, so they are written once. The first version of
   this section duplicated all fifteen function lines inside every
   film, which is four copies of one sentence waiting to drift.

   THE FILM (film.beatSheets[].beats) owns only its own half — how
   this picture discharges that beat, and what to steal from it.
   Keyed by beat id, so a film that has not written one yet renders
   as a named hole rather than vanishing, exactly like the seven
   canonical beats above.

   LANGUAGE. Every string exists in English and Tamil; the *Ta
   fields carry the Tamil. The toggle rebuilds this section alone and
   restores scroll, because re-rendering the page would throw the
   reader back to the top of a very long document.
   ------------------------------------------------------------ */

function renderBeatSheets(study) {
  const sheets = (study.beatSheets || []).filter((s) => s && getBeatSheetMethod(s.method));
  if (!sheets.length) return null;
  const title = study.meta.title;

  const sec = section('beatsheet', 'How it is built',
    sheets.length === 1
      ? 'The ' + getBeatSheetMethod(sheets[0].method).name + ' sheet'
      : 'Named beat sheets',
    'The same spine, subdivided by a published method \u2014 and marked where '
    + title + ' departs from it.');

  // The switch governs the whole section, so it sits above the
  // heading rather than after it.
  sec.insertBefore(langToggle({
    hint: currentLang() === 'tl'
      ? 'Vilakkam mattum Tanglish-la. Kattathoda peru, page number ellaam English-laye.'
      : 'Switches the explanation only. Beat names and page targets stay in English.'
  }), sec.firstChild);

  sheets.forEach((sheet) => {
    const method = getBeatSheetMethod(sheet.method);

    const head = h('div.st-sheet-head');
    head.append(h('h3.st-sheet-name', { text: method.name }));
    if (filled(method.attribution)) {
      head.append(h('p.st-sheet-attr', { text: method.attribution }));
    }
    if (filled(method.baseline)) {
      head.append(h('p.st-sheet-base', {}, [
        h('span.st-sheet-base-lab', { text: 'Written against' }),
        h('span', { text: method.baseline })
      ]));
    }
    if (filled(t(sheet, 'note'))) head.append(h('p.st-sheet-note', { text: t(sheet, 'note') }));
    sec.append(head);

    const list = h('ol.st-sheet');
    // Driven by the METHOD's beats, never by the film's object, so a
    // beat the film has not written is a visible hole rather than a
    // gap in the numbering.
    method.beats.forEach((mb) => {
      const fb = (sheet.beats || {})[mb.id] || {};
      const card = h('li.st-beat.st-sheet-beat' + (filled(fb.inFilm) ? '' : '.is-missing'));
      card.append(h('div.st-beat-head', {}, [
        h('span.st-sheet-n', { text: String(mb.n != null ? mb.n : '') }),
        h('span.st-beat-label', { text: mb.label }),
        h('span.st-sheet-page', { text: mb.pages || '' })
      ]));
      if (typeof mb.pct === 'number') {
        // Decoration for a sighted reader, noise for a screen reader,
        // which already has the page target on the line above.
        const bar = h('div.st-sheet-bar', { 'aria-hidden': 'true' });
        const fill = h('span.st-sheet-bar-fill');
        fill.style.width = Math.max(1, Math.min(100, mb.pct)) + '%';
        bar.append(fill);
        card.append(bar);
      }
      card.append(line('Structural function', t(mb, 'function'),
        'The structural function has not been written for this beat yet.'));
      card.append(line('In ' + title, t(fb, 'inFilm'),
        'How ' + title + ' performs this beat has not been written yet.'));
      if (filled(t(fb, 'craft'))) {
        card.append(h('p.st-craft', {}, [
          h('span.st-craft-lab', { text: 'Steal this' }),
          h('span', { text: t(fb, 'craft') })
        ]));
      }
      list.append(card);
    });
    sec.append(list);
  });

  return sec;
}

/* Swap the section in place rather than re-rendering the page: this
   can be beat 9 of 15 in a document several screens long, and
   throwing the reader back to the top to change language is not what
   pressing a one-word button asked for.

   Anchored to the SECTION, not to an absolute offset \u2014 English and
   Tanglish set to different heights, so restoring window.scrollY
   leaves the reader a hundred pixels adrift. */
function swapBeatSheetLanguage() {
  const old = document.getElementById('beatsheet');
  const study = currentStudy();
  if (!old || !study) return;
  const wasAt = old.getBoundingClientRect().top;
  const fresh = renderBeatSheets(study);
  if (!fresh) return;
  old.replaceWith(fresh);
  window.scrollBy(0, fresh.getBoundingClientRect().top - wasAt);
  const again = document.querySelector('#beatsheet .lang-btn.is-on');
  if (again) again.focus({ preventScroll: true });
  try { StudioUI.autoAriaLabels(); } catch (err) { /* chrome not up yet */ }
}

delegate(document, 'click', '[data-action="set-lang"]', (e, btn) => {
  setLang(btn.dataset.lang);
});

// setLang() broadcasts; this page answers by rebuilding the one
// section that has translated content. Other pages subscribe the same
// way, which is why the toggle lives in lib and not here.
onLangChange(swapBeatSheetLanguage);

/* ------------------------------------------------------------
   4. SCENES — technique, how, why, and the Tamil gloss
   ------------------------------------------------------------
   Cards rather than rows. The studio's data table is the right
   object for five short cells (see the logline anatomy above); it
   is the wrong one for four paragraphs, which at 390px would be a
   four-column horizontal scroll nobody reads.
   ------------------------------------------------------------ */
function renderScenes(study) {
  const title = study.meta.title;
  const sec = section('scenes', 'How it is written',
    'Scene craft',
    'One technique per study: what it is, how the scene executes it, and why it works. '
    + 'No plot — a study you could follow instead of watching the film is a worse lesson.');

  const scenes = study.scenes || [];
  if (!scenes.length) {
    sec.append(gapPanel('the scene studies',
      'No scene-craft studies have been written for ' + title + ' yet.',
      ['technique, how the scene executes it, and why it works, for each study']));
    return sec;
  }

  const grid = h('div.st-scenes');
  for (const s of scenes) {
    const card = h('article.st-scene');
    card.append(h('p.bd-eyebrow', { text: s.technique || 'Technique' }));
    card.append(h('h3.st-scene-title', { text: s.title || 'Untitled study' }));
    card.append(line('How it is done', s.how));
    card.append(line('Why it works', s.why));
    if (filled(s.tanglish)) card.append(h('span.tn', { text: s.tanglish }));
    grid.append(card);
  }
  sec.append(grid);
  return sec;
}

/* ------------------------------------------------------------
   5. GLOSSARY — every term, with THIS film's example
   ------------------------------------------------------------
   The library shows four examples per term. Here the selected film
   answers, attributed to its director, and the terms that film
   demonstrates best are pulled to the front. A term the film has no
   example for says so rather than borrowing another film's.
   ------------------------------------------------------------ */
function renderGlossary(study) {
  const meta = study.meta || {};
  const slug = meta.slug;
  const title = meta.title;
  const attribution = [title, meta.director ? 'dir. ' + meta.director : '']
    .filter(Boolean).join(' · ');

  const core = new Set((study.glossary || []).map((t) => String(t).toLowerCase()));
  const all = (glossary.terms || []).slice();
  const terms = all.filter((t) => core.has(String(t.term).toLowerCase()))
    .concat(all.filter((t) => !core.has(String(t.term).toLowerCase())));

  const sec = section('glossary', 'The words',
    'Glossary, in ' + title + '’s terms',
    core.size
      ? 'Every term the studio uses, each with this film’s own example. The '
        + core.size + ' terms ' + title + ' demonstrates best come first.'
      : 'Every term the studio uses, each with this film’s own example where one exists.');

  if (!terms.length) {
    sec.append(gapPanel('the glossary', 'No glossary terms have been written yet.', []));
    return sec;
  }

  /* A real-time filter. 21 terms is already past the point where
     scanning beats searching, and the list grows every time the studio
     learns a word. Filtering happens in the DOM against a precomputed
     haystack rather than re-rendering, so the caret never moves and
     the film's examples do not flicker while you type. */
  const filterRow = h('div.st-gloss-filter');
  const fid = 'glossFilter';
  filterRow.append(
    h('label.st-gloss-label', { for: fid, text: 'Filter terms' }),
    h('input#' + fid + '.st-gloss-input', {
      type: 'search', autocomplete: 'off', spellcheck: 'false',
      placeholder: 'subtext, slugline, match cut…',
      'data-action': 'gloss-filter', 'aria-controls': 'glossList'
    }),
    h('span#glossCount.st-gloss-count', {
      role: 'status', 'aria-live': 'polite',
      text: terms.length + ' terms'
    })
  );
  sec.append(filterRow);

  const list = h('div#glossList.gloss-list.st-gloss');
  for (const t of terms) {
    const isCore = core.has(String(t.term).toLowerCase());
    const item = h('article.gloss-item' + (isCore ? '.is-core' : ''));
    const dl = h('dl');
    const dt = h('dt');
    dt.append(document.createTextNode(t.term));
    if ((t.aliases || []).length) {
      dt.append(h('span.st-alias', { text: ' · ' + t.aliases.join(', ') }));
    }
    dl.append(dt);
    dl.append(h('dd', { text: t.def || '' }));
    item.append(dl);
    if (isCore) item.append(h('span.st-core-flag', { text: 'Core to ' + title }));
    if (t.tanglish) item.append(h('span.tn', { text: t.tanglish }));

    const example = (t.examples || []).find((e) => e.film === slug);
    if (example && filled(example.note)) {
      item.append(h('div.bd-example.st-ex', {}, [
        h('span.bd-example-film', { text: attribution }),
        h('span', { text: ' ' + example.note })
      ]));
    } else {
      item.append(h('p.st-missing', {
        text: 'No ' + title + ' example for this term yet.'
      }));
    }
    /* Everything a reader might type: the term, what it is also called,
       the definition and this film's example. Matching only the term
       would make the search useless for "the word for when a thing set
       up early comes back" — which is how people actually search. */
    const ex = (t.examples || []).find((e) => e.film === slug);
    item.setAttribute('data-search', [
      t.term, (t.aliases || []).join(' '), t.def, t.tanglish, ex && ex.note
    ].filter(Boolean).join(' ').toLowerCase());

    list.append(item);
  }
  sec.append(list);
  sec.append(h('p#glossNone.st-gloss-none', {
    hidden: true,
    text: 'No term matches that. Try a shorter word — the definitions are searched too.'
  }));
  return sec;
}

/* ------------------------------------------------------------
   6. WORKBENCH — mounted last, and optional by design
   ------------------------------------------------------------ */
function workbenchHost() {
  const sec = h('section#workbench.st-sec', { 'aria-label': 'Workbench' });
  sec.append(h('div.st-wb-host'));
  return sec;
}

async function mountWorkbenchInto(sec, study) {
  const host = sec.querySelector('.st-wb-host');
  const key = Object.keys(WORKBENCH).find((k) => /\/workbench\.js$/.test(k));
  if (!key) { sec.remove(); return; }
  try {
    const mod = await WORKBENCH[key]();
    const mount = mod && (mod.mountWorkbench || (mod.default && mod.default.mountWorkbench));
    if (typeof mount !== 'function') { sec.remove(); return; }
    mount(host, study);
  } catch (e) {
    console.warn('[study] workbench unavailable', e && e.message);
    sec.remove();
  }
}

/* ------------------------------------------------------------
   RENDER — the whole page, every time the film changes
   ------------------------------------------------------------
   A film change is not a heading swap, so this is not a patch: the
   page is rebuilt from the selected study. The one piece of state
   worth carrying across is focus, so the tab you clicked keeps it.
   ------------------------------------------------------------ */
function render() {
  const study = currentStudy();
  const main = h('main#main');

  if (!study) {
    main.append(h('div.bd-empty', {}, [
      h('div.bd-empty-mark', { text: '◉', 'aria-hidden': 'true' }),
      h('h2', { text: 'No case studies shipped' }),
      h('p', { text: 'src/data/studies.json holds no films, so there is nothing to select. '
        + 'The schema and validate() live in src/lib/studies.js.' })
    ]));
    app.replaceChildren(main);
    mountShell();
    return;
  }

  const gaps = validate(study);
  main.className = 'hue-' + (study.meta.hue || 'feature');
  main.setAttribute('data-demo', study.meta.slug);

  main.append(renderDemoSelector());
  main.append(renderHeader(study, gaps));
  main.append(renderConcept(study, gaps));
  main.append(renderCharacters(study));
  main.append(renderBeats(study));
  // Optional: only films with a study.beatSheets entry get this.
  const sheet = renderBeatSheets(study);
  if (sheet) main.append(sheet);
  main.append(renderScenes(study));
  main.append(renderGlossary(study));

  const wb = workbenchHost();
  main.append(wb);

  app.replaceChildren(main);
  mountShell();

  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[study] chrome', e); }

  mountWorkbenchInto(wb, study);
}

/* loadDemo() stamps data-demo on <html> and normalises a stale or
   missing preference back to a film that exists. It runs BEFORE the
   subscription below, because it broadcasts: subscribing first would
   render the page once for the load and once for the first paint. */
// Stamp data-lang before the first render so the CSS below is right
// on the first paint rather than after it.
initLang();

loadDemo();

/* A film change costs the clicked button its node, so hand focus to
   its replacement. preventScroll, because yanking the reader to the
   top of the page is not what pressing a tab asked for. */
let refocus = false;
delegate(document, 'click', '[data-action="demo-pick"]', () => { refocus = true; });

/* Bound once at module scope, not per render: a filter that re-binds on
   every demo change stacks listeners, and the page re-renders whenever
   the film changes. */
delegate(document, 'input', '[data-action="gloss-filter"]', (e, input) => {
  const q = String(input.value || '').trim().toLowerCase();
  const items = document.querySelectorAll('#glossList .gloss-item');
  let shown = 0;
  items.forEach((el) => {
    const hit = !q || (el.getAttribute('data-search') || '').includes(q);
    el.hidden = !hit;
    if (hit) shown++;
  });
  const count = document.getElementById('glossCount');
  if (count) {
    count.textContent = q
      ? shown + ' of ' + items.length + ' terms'
      : items.length + ' terms';
  }
  const none = document.getElementById('glossNone');
  if (none) none.hidden = shown !== 0;
});

onDemoChange(() => {
  render();
  if (!refocus) return;
  refocus = false;
  const tab = document.querySelector('.ds-tab.is-on');
  if (tab) { try { tab.focus({ preventScroll: true }); } catch (e) { tab.focus(); } }
});

render();

/* Exposed for the console and for the verifier, the way the other
   pages expose their models. Read-only: nothing here mutates. */
if (typeof window !== 'undefined') {
  window.StudioStudyPage = { render, listStudies, getStudy, currentSlug, validate };
}
