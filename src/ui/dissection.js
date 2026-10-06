/* ============================================================
   DISSECTION — the worked example, and yours beside it
   ------------------------------------------------------------
   WHERE IT LIVES. This was dissect.html's page module. Since 6 Oct
   2026 it is a tab of the Library (library.html#dissection), so it is
   a renderer: mountDissection(container) draws into the library's tab
   and every rebuild (add, remove, reorder) re-draws there. dissect.html
   is a redirect stub. The storage key, fms_dissect_v1, is owned by
   src/lib/dissect.js and did not move.

   Two halves of ONE shape. The shipped dissection and the one the
   reader writes use exactly the same fields (src/lib/dissect.js), so
   the page is a form with the answer key printed above it. That is
   the whole pedagogy: a reader who only reads our example has learned
   one film; a reader who fills the same fields in about their own
   footage has learned to watch.

   WHAT THE EXAMPLE IS. Craft analysis — the job a sequence does, the
   technique used, why it works. Never a retelling. The data file says
   the same thing at more length and for the same reason.

   NOTHING DERIVED IS STORED. Coverage and the dangling-motif list are
   computed from the dissection on every refresh. Two copies of a
   count drift within a day, and a stale count on a page whose entire
   purpose is finding holes is worse than no count.

   WRITES. Typing never renders and never writes: `input` updates the
   in-memory model and arms a debounce, `change` (which fires on blur)
   flushes it and repaints only the two derived strips. Add and remove
   are the only things that rebuild the form, and they flush first.
   An idle page writes nothing at all, which is what verify asserts.
   ============================================================ */
import '../lib/store.js';
import '../styles/dissect.css';

import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';
import {
  AREAS, ACTS, listShipped, loadMine, saveMine,
  blankSequence, blankMotif, coverage, danglingMotifs
} from '../lib/dissect.js';

/* The element the dissection renders into, handed over by
   mountDissection(). */
let app = null;

const ACT_NAME = { 1: 'Act One', 2: 'Act Two', 3: 'Act Three' };
const AREA_LABEL = {
  structure: 'Structure', character: 'Character', dialogue: 'Dialogue',
  image: 'Image', editing: 'Editing', sound: 'Sound'
};
const areaLabel = (a) => AREA_LABEL[a] || a;

/* The state the page edits. Loaded once; saved on a debounce. */
let mine = loadMine();

/* ---- persistence ------------------------------------------- */
let saveTimer = null;
function flush() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  saveMine(mine);
}
function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveTimer = null; saveMine(mine); }, 600);
}
// The one write that is allowed to happen without a keystroke behind
// it: a debounce still pending when the tab goes away.
window.addEventListener('pagehide', () => { if (saveTimer) flush(); });

/* ============================================================
   1. THE WORKED EXAMPLE
   ============================================================ */

function renderExample(film) {
  const sec = h(`section#example.ds-example.hue-${film.meta.hue || 'visualize'}`);

  sec.append(h('div.ds-film', {}, [
    h('p.bd-eyebrow', { text: 'Worked example · read the method, not the film' }),
    h('h2.ds-film-title', { text: film.meta.title }),
    h('p.ds-film-meta', {
      text: [film.meta.year, film.meta.director, film.meta.genre].filter(Boolean).join(' · ')
    })
  ]));

  sec.append(h('div.ds-claims', {}, [
    claim('Thesis', 'What the film argues', film.thesis),
    claim('Engine', 'What drives the structure', film.engine)
  ]));

  /* Sequences, grouped by act. The grouping is derived from the data —
     an act with no sequences simply does not appear. */
  const seqWrap = h('div.ds-acts');
  for (const act of ACTS) {
    const inAct = (film.sequences || []).filter((s) => s.act === act);
    if (!inAct.length) continue;
    const col = h('div.ds-act');
    col.append(h('h3.ds-act-h', {}, [
      h('span.ds-act-name', { text: ACT_NAME[act] || 'Act ' + act }),
      h('span.ds-act-count', { text: inAct.length + (inAct.length === 1 ? ' sequence' : ' sequences') })
    ]));
    inAct.forEach((s) => col.append(renderExampleSeq(s)));
    seqWrap.append(col);
  }
  sec.append(h('h3.bd-h2.ds-h', { text: 'Sequence by sequence' }),
             h('p.bd-sub', { text: 'Each one named for the job it does, not for what happens in it. That is the discipline — if the label is an event, you are summarising.' }),
             seqWrap);

  /* Motifs */
  if ((film.motifs || []).length) {
    const grid = h('div.ds-motifs');
    film.motifs.forEach((m) => grid.append(renderExampleMotif(m)));
    sec.append(h('h3.bd-h2.ds-h', { text: 'Motifs, planted and paid' }),
               h('p.bd-sub', { text: 'An idea that recurs is a promise. The second column is where it is made; the third is where it is kept.' }),
               grid);
  }

  /* Craft notes, grouped by area, in the canonical AREAS order. */
  if ((film.craft || []).length) {
    const grid = h('div.ds-craft');
    for (const area of AREAS) {
      const notes = film.craft.filter((c) => c.area === area);
      if (!notes.length) continue;
      const card = h('div.ds-craft-card');
      card.append(h('span.ds-craft-area', { text: areaLabel(area) }));
      notes.forEach((n) => card.append(h('p.ds-craft-lesson', { text: n.lesson })));
      grid.append(card);
    }
    sec.append(h('h3.bd-h2.ds-h', { text: 'What is transferable' }),
               h('p.bd-sub', { text: 'One sentence per area that you could use on a film that has nothing else in common with this one.' }),
               grid);
  }

  /* Questions */
  if ((film.questions || []).length) {
    const list = h('ol.ds-questions');
    film.questions.forEach((q) => list.append(h('li.ds-question', { text: q })));
    sec.append(h('h3.bd-h2.ds-h', { text: 'Ask these of your own film' }),
               h('p.bd-sub', { text: 'The point of dissecting someone else’s picture. Every one of these is a question about yours.' }),
               list);
  }

  return sec;
}

const claim = (label, sub, body) =>
  h('div.ds-claim', {}, [
    h('span.ds-claim-lab', { text: label }),
    h('span.ds-claim-sub', { text: sub }),
    h('p.ds-claim-body', { text: body || '—' })
  ]);

function renderExampleSeq(s) {
  const card = h('article.ds-seq');
  card.append(h('div.ds-seq-top', {}, [
    h('span.ds-seq-at', { text: s.at || '' }),
    h('strong.ds-seq-label', { text: s.label })
  ]));
  card.append(h('dl.ds-seq-body', {}, [
    h('dt', { text: 'Function' }),  h('dd', { text: s.fn }),
    h('dt', { text: 'Technique' }), h('dd', { text: s.technique }),
    h('dt', { text: 'Why' }),       h('dd', { text: s.why })
  ]));
  return card;
}

function renderExampleMotif(m) {
  return h('article.ds-motif', {}, [
    h('strong.ds-motif-name', { text: m.name }),
    h('p.ds-motif-what', { text: m.what }),
    h('div.ds-chain', {}, [
      h('div.ds-chain-half', {}, [
        h('span.ds-chain-lab', { text: 'Plant' }),
        h('p', { text: m.plant })
      ]),
      h('span.ds-chain-arrow', { text: '→', 'aria-hidden': 'true' }),
      h('div.ds-chain-half', {}, [
        h('span.ds-chain-lab', { text: 'Payoff' }),
        h('p', { text: m.payoff })
      ])
    ])
  ]);
}

/* ============================================================
   2. YOUR DISSECTION
   ============================================================ */

function hasAny(d) {
  return Boolean(
    (d.title || '').trim() || (d.thesis || '').trim() || (d.engine || '').trim()
    || (d.sequences || []).length || (d.motifs || []).length
    || (d.craft || []).length || (d.questions || []).length
  );
}

function renderMine() {
  const sec = h('section#mine.ds-mine');
  sec.append(h('header.ds-mine-head', {}, [
    h('p.bd-eyebrow', { text: 'Your dissection · the same fields, your film' }),
    h('h2.bd-h2', { text: 'Take one apart yourself.' }),
    h('p.bd-sub', {
      text: 'Everything you write here stays in this browser, on this project. '
          + 'The two strips below are worked out from what you have typed — '
          + 'they are never stored, so they cannot go stale.'
    })
  ]));

  if (!hasAny(mine)) { sec.append(renderEmpty()); return sec; }

  sec.append(renderStats(), renderDangling());

  /* The film being dissected */
  sec.append(h('div.ds-form-block', {}, [
    labelled('The film', 'Title, year, director — whatever you need to find it again.',
      input('doc:title', mine.title, 'e.g. Aaranya Kaandam (2011, Thiagarajan Kumararaja)')),
    labelled('Thesis', 'What is it arguing? One line. If you cannot compress it, keep watching.',
      area('doc:thesis', mine.thesis, 'The film argues that…')),
    labelled('Engine', 'What actually drives the structure forward — a want, a clock, a pressure, a question?',
      area('doc:engine', mine.engine, 'The structure advances because…'))
  ]));

  /* Sequences */
  const seqs = h('div.ds-rows', { id: 'mine-seqs' });
  (mine.sequences || []).forEach((s, i) => seqs.append(renderSeqRow(s, i, mine.sequences.length)));
  sec.append(block(
    'Sequences',
    'Name each one for the job it does. If your label is an event, you are writing a summary instead of a dissection.',
    seqs,
    'seq-add', '+  Add sequence',
    (mine.sequences || []).length ? null : 'No sequences yet. Ten to fourteen is a feature; start with the ones you can already name.'
  ));

  /* Motifs */
  const motifs = h('div.ds-rows', { id: 'mine-motifs' });
  (mine.motifs || []).forEach((m) => motifs.append(renderMotifRow(m)));
  sec.append(block(
    'Motifs',
    'An idea, image or sound that recurs. Write the plant and the payoff separately — the gap between them is the finding.',
    motifs,
    'motif-add', '+  Add motif',
    (mine.motifs || []).length ? null : 'No motifs yet. List what repeats first; work out what it is worth afterwards.'
  ));

  /* Craft notes */
  const craft = h('div.ds-rows', { id: 'mine-craft' });
  (mine.craft || []).forEach((c, i) => craft.append(renderCraftRow(c, i)));
  sec.append(block(
    'Transferable notes',
    'One sentence per area that would still be true on a film with nothing else in common with this one.',
    craft,
    'craft-add', '+  Add note',
    (mine.craft || []).length ? null : 'Nothing noted yet. A note you could not use on your own film is an observation, not a lesson.'
  ));

  /* Questions */
  const qs = h('div.ds-rows', { id: 'mine-questions' });
  (mine.questions || []).forEach((q, i) => qs.append(renderQuestionRow(q, i)));
  sec.append(block(
    'Questions for my film',
    'Turn each finding into something you can ask of your own draft. This is the only part that changes what you write next.',
    qs,
    'q-add', '+  Add question',
    (mine.questions || []).length ? null : 'No questions yet. Five to seven is plenty, and the awkward ones are the useful ones.'
  ));

  return sec;
}

function block(title, sub, body, addAction, addLabel, noneText) {
  const wrap = h('div.ds-form-block');
  wrap.append(h('h3.ds-block-h', { text: title }), h('p.ds-block-sub', { text: sub }));
  if (noneText) wrap.append(h('p.ds-none', { text: noneText }));
  wrap.append(body);
  wrap.append(h('button.btn.ds-add', { type: 'button', 'data-action': addAction, text: addLabel }));
  return wrap;
}

/* ---- derived strips — recomputed, never stored -------------- */
function renderStats() {
  const c = coverage(mine);
  const pct = c.total ? Math.round((c.filled / c.total) * 100) : 0;
  return h('div.bd-stats.ds-stats', { id: 'mine-stats' }, [
    stat(String((mine.sequences || []).length), 'sequences'),
    stat(c.acts['1'] + ' · ' + c.acts['2'] + ' · ' + c.acts['3'], 'across the three acts'),
    stat(pct + '%', 'of sequence fields written'),
    stat(c.motifsWithPayoff + ' / ' + c.motifs, 'motifs paid off')
  ]);
}
const stat = (value, label) =>
  h('div.bd-stat', {}, [h('strong', { text: value }), h('span', { text: label })]);

/* A motif planted and never paid off is the most useful thing a
   dissection turns up, so it gets a panel rather than a footnote. */
function renderDangling() {
  const list = danglingMotifs(mine);
  const box = h('div.ds-dangle', { id: 'mine-dangling' });
  if (!list.length) {
    box.classList.add('is-clear');
    box.append(
      h('span.ds-dangle-lab', { text: 'Dangling motifs' }),
      h('p.ds-dangle-body', {
        text: (mine.motifs || []).length
          ? 'None. Every motif you have listed has a payoff written against it.'
          : 'Nothing to check yet. Add a motif and this panel watches it for you.'
      })
    );
    return box;
  }
  box.append(
    h('span.ds-dangle-lab', { text: list.length === 1 ? '1 dangling motif' : list.length + ' dangling motifs' }),
    h('p.ds-dangle-body', {
      text: 'Planted, never paid. Either the film cashes it somewhere you have not spotted yet, '
          + 'or it does not — and in your own draft, that is the note.'
    })
  );
  const ul = h('ul.ds-dangle-list');
  list.forEach((m) => ul.append(h('li', { text: (m.name || '').trim() || m.what })));
  box.append(ul);
  return box;
}

/* ---- the teaching empty state ------------------------------- */
function renderEmpty() {
  return h('div.bd-empty', {}, [
    h('div.bd-empty-mark', { text: '◎', 'aria-hidden': 'true' }),
    h('h2', { text: 'Take a film apart' }),
    h('p', {
      text: 'Watching teaches you what a film did. Dissecting teaches you how. '
          + 'Pick one you admire, watch it twice, and write down the job each '
          + 'sequence performs — not what happens in it.'
    }),
    h('div.bd-how', {}, [
      how('1', 'Name the engine', 'One line on what the film argues, one on what drives it forward. If the engine is a chase, the second act will be a chase.'),
      how('2', 'Label by function', 'Ten to fourteen sequences, each named for what it does to the story. "The antagonist sets the terms", never "the bank job".'),
      how('3', 'Chase the payoffs', 'List what recurs, write its plant and its payoff, and stare at whatever has no payoff. That gap is the lesson.')
    ]),
    h('div.bd-example', {}, [
      h('span.bd-example-film', { text: 'The example above' }),
      h('span', {
        text: ' has fourteen sequences and five motifs. You do not need that many. '
            + 'Four sequences honestly described teach you more than fourteen '
            + 'copied from someone else’s essay.'
      })
    ]),
    h('button.btn.primary.bd-cta', { type: 'button', 'data-action': 'mine-start', text: '+  Start a dissection' })
  ]);
}
const how = (n, title, body) =>
  h('div.bd-how-step', {}, [
    h('span.bd-how-num', { text: n }),
    h('strong', { text: title }),
    h('p', { text: body })
  ]);

/* ---- editable rows ------------------------------------------ */
function renderSeqRow(s, i, total) {
  const row = h('article.ds-row.ds-row-seq', { 'data-seq': s.id });
  row.append(h('div.ds-row-bar', {}, [
    h('span.ds-row-n', { text: String(i + 1) }),
    input('seq:label', s.label, 'What job does this sequence do?', 'ds-row-title', 'Sequence label'),
    actSelect(s.act),
    input('seq:at', s.at, '~0:00', 'ds-row-at', 'Rough position'),
    h('div.ds-row-acts', {}, [
      iconBtn('↑', 'seq-up', 'Move earlier', i === 0),
      iconBtn('↓', 'seq-down', 'Move later', i === total - 1),
      iconBtn('✕', 'seq-del', 'Remove sequence', false, true)
    ])
  ]));
  row.append(h('div.ds-row-grid', {}, [
    labelled('Function', 'What it does to the story', area('seq:fn', s.fn, 'This sequence…')),
    labelled('Technique', 'How it does it', area('seq:technique', s.technique, 'Done by…')),
    labelled('Why', 'Why it works', area('seq:why', s.why, 'It works because…'))
  ]));
  return row;
}

function renderMotifRow(m) {
  const row = h('article.ds-row.ds-row-motif', { 'data-motif': m.id });
  const dangling = (m.what || '').trim() && !(m.payoff || '').trim();
  if (dangling) row.classList.add('is-dangling');
  row.append(h('div.ds-row-bar', {}, [
    input('motif:name', m.name, 'Name the motif', 'ds-row-title', 'Motif name'),
    h('div.ds-row-acts', {}, [iconBtn('✕', 'motif-del', 'Remove motif', false, true)])
  ]));
  row.append(h('div.ds-row-grid', {}, [
    labelled('What recurs', 'The idea, image or sound', area('motif:what', m.what, 'It keeps coming back as…')),
    labelled('Plant', 'How it is established', area('motif:plant', m.plant, 'First established by…')),
    labelled('Payoff', 'What it is worth later', area('motif:payoff', m.payoff, 'It is cashed when…'))
  ]));
  return row;
}

function renderCraftRow(c, i) {
  const row = h('article.ds-row.ds-row-craft', { 'data-craft': String(i) });
  row.append(h('div.ds-row-bar', {}, [
    areaSelect(c.area),
    h('div.ds-row-acts', {}, [iconBtn('✕', 'craft-del', 'Remove note', false, true)])
  ]));
  row.append(area('craft:lesson', c.lesson, 'One sentence you could use on a different film.', 'ds-craft-input', 'Transferable lesson'));
  return row;
}

function renderQuestionRow(q, i) {
  const row = h('article.ds-row.ds-row-q', { 'data-question': String(i) });
  row.append(h('span.ds-row-n', { text: String(i + 1) }));
  row.append(area('question:text', q, 'Ask this of your own draft…', 'ds-q-input', 'Question for my film'));
  row.append(h('div.ds-row-acts', {}, [iconBtn('✕', 'q-del', 'Remove question', false, true)]));
  return row;
}

/* ---- small builders ----------------------------------------- */
function labelled(label, sub, control) {
  const id = 'f_' + Math.random().toString(36).slice(2, 9);
  control.id = id;
  return h('div.ds-field', {}, [
    h('label.ds-flabel', { for: id }, [
      h('span.ds-flabel-main', { text: label }),
      sub ? h('span.ds-flabel-sub', { text: sub }) : null
    ]),
    control
  ]);
}

function input(spec, value, placeholder, cls, aria) {
  const el = h('input' + (cls ? '.' + cls : ''), {
    type: 'text', 'data-mine': spec, placeholder: placeholder || '',
    'aria-label': aria || placeholder || spec
  });
  el.value = value || '';
  return el;
}

function area(spec, value, placeholder, cls, aria) {
  const el = h('textarea' + (cls ? '.' + cls : ''), {
    rows: '3', 'data-mine': spec, placeholder: placeholder || '',
    'aria-label': aria || placeholder || spec
  });
  el.value = value || '';
  return el;
}

function actSelect(value) {
  const s = h('select.ds-row-act', { 'data-mine': 'seq:act', 'aria-label': 'Act' });
  ACTS.forEach((a) => {
    const o = h('option', { value: a, text: ACT_NAME[a] || 'Act ' + a });
    if (a === value) o.selected = true;
    s.append(o);
  });
  return s;
}

function areaSelect(value) {
  const s = h('select.ds-row-area', { 'data-mine': 'craft:area', 'aria-label': 'Craft area' });
  AREAS.forEach((a) => {
    const o = h('option', { value: a, text: areaLabel(a) });
    if (a === value) o.selected = true;
    s.append(o);
  });
  return s;
}

function iconBtn(glyph, action, label, disabled, danger) {
  return h('button.bd-icon.ds-icon' + (danger ? '.is-danger' : ''), {
    type: 'button', 'data-action': action, title: label,
    'aria-label': label, text: glyph, disabled: disabled || false
  });
}

/* ============================================================
   3. RENDER
   ============================================================ */

function renderHeader(films) {
  const seqCount = films.reduce((n, f) => n + (f.sequences || []).length, 0);
  const mineCount = (mine.sequences || []).length;
  /* No title and no deck: the Library's own section head above this
     tab carries both ("Film Dissection.", and the deck that used to sit
     here), and saying them twice in one screen read as a stutter. */
  return h('header.bd-head.dx-head', {}, [
    h('p.bd-eyebrow', { text: 'Dissection · working backwards from a finished film' }),
    h('div.bd-stats', {}, [
      stat(String(films.length), films.length === 1 ? 'worked example' : 'worked examples'),
      stat(String(seqCount), 'sequences analysed'),
      stat(String(mineCount), mineCount === 1 ? 'sequence of your own' : 'sequences of your own')
    ])
  ]);
}

function render() {
  if (!app) return;
  const films = listShipped();
  const main = h('div.dx-root');
  main.append(renderHeader(films));
  films.forEach((f) => main.append(renderExample(f)));
  main.append(renderMine());

  app.replaceChildren(main);
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[dissect] chrome', e); }
}

/* Repaint only what is derived. Rebuilding the form on every blur
   would move the caret out from under a reader tabbing through it. */
function refreshDerived() {
  const stats = document.getElementById('mine-stats');
  if (stats) stats.replaceWith(renderStats());
  const dangle = document.getElementById('mine-dangling');
  if (dangle) dangle.replaceWith(renderDangling());
}

/* ============================================================
   4. EVENTS — delegated, no inline handlers
   ============================================================ */

const seqOf = (el) => (mine.sequences || []).find((s) => s.id === el.closest('[data-seq]')?.dataset.seq);
const motifOf = (el) => (mine.motifs || []).find((m) => m.id === el.closest('[data-motif]')?.dataset.motif);
const craftIndexOf = (el) => Number(el.closest('[data-craft]')?.dataset.craft);
const qIndexOf = (el) => Number(el.closest('[data-question]')?.dataset.question);

function applyEdit(el) {
  const spec = String(el.dataset.mine || '');
  const cut = spec.indexOf(':');
  const kind = cut < 0 ? spec : spec.slice(0, cut);
  const field = cut < 0 ? '' : spec.slice(cut + 1);
  const value = el.value;

  if (kind === 'doc') { mine[field] = value; return true; }
  if (kind === 'seq') { const s = seqOf(el); if (!s) return false; s[field] = value; return true; }
  if (kind === 'motif') { const m = motifOf(el); if (!m) return false; m[field] = value; return true; }
  if (kind === 'craft') {
    const i = craftIndexOf(el);
    if (!Number.isInteger(i) || !mine.craft[i]) return false;
    mine.craft[i][field] = value;
    return true;
  }
  if (kind === 'question') {
    const i = qIndexOf(el);
    if (!Number.isInteger(i) || i < 0 || i >= mine.questions.length) return false;
    mine.questions[i] = value;
    return true;
  }
  return false;
}

// Typing: update the model, arm the debounce, touch nothing else.
delegate(document, 'input', '[data-mine]', (e, el) => { if (applyEdit(el)) scheduleSave(); });

// Blur (and every select change): flush, then repaint the derived strips.
delegate(document, 'change', '[data-mine]', (e, el) => {
  if (!applyEdit(el)) return;
  flush();
  const row = el.closest('.ds-row-motif');
  if (row) {
    const m = motifOf(el);
    row.classList.toggle('is-dangling', Boolean(m && (m.what || '').trim() && !(m.payoff || '').trim()));
  }
  refreshDerived();
});

function mutate(fn) { fn(); flush(); render(); }

delegate(document, 'click', '[data-action="mine-start"]', () => {
  mutate(() => { mine.sequences.push(blankSequence()); });
  document.querySelector('.ds-row-seq .ds-row-title')?.focus();
});

delegate(document, 'click', '[data-action="seq-add"]', () => {
  mutate(() => { mine.sequences.push(blankSequence()); });
  document.querySelector('.ds-row-seq:last-of-type .ds-row-title')?.focus();
});
delegate(document, 'click', '[data-action="seq-del"]', (e, el) => {
  const s = seqOf(el);
  if (!s) return;
  const name = (s.label || '').trim();
  if (!confirm(name ? 'Remove the sequence "' + name + '"?' : 'Remove this sequence?')) return;
  mutate(() => { mine.sequences = mine.sequences.filter((x) => x !== s); });
});
delegate(document, 'click', '[data-action="seq-up"]', (e, el) => moveSeq(el, -1));
delegate(document, 'click', '[data-action="seq-down"]', (e, el) => moveSeq(el, 1));
function moveSeq(el, dir) {
  const s = seqOf(el);
  const i = mine.sequences.indexOf(s);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= mine.sequences.length) return;
  mutate(() => { mine.sequences.splice(j, 0, mine.sequences.splice(i, 1)[0]); });
}

delegate(document, 'click', '[data-action="motif-add"]', () => {
  mutate(() => { mine.motifs.push(blankMotif()); });
  document.querySelector('.ds-row-motif:last-of-type .ds-row-title')?.focus();
});
delegate(document, 'click', '[data-action="motif-del"]', (e, el) => {
  const m = motifOf(el);
  if (!m) return;
  const name = (m.name || '').trim();
  if (!confirm(name ? 'Remove the motif "' + name + '"?' : 'Remove this motif?')) return;
  mutate(() => { mine.motifs = mine.motifs.filter((x) => x !== m); });
});

delegate(document, 'click', '[data-action="craft-add"]', () => {
  mutate(() => { mine.craft.push({ area: AREAS[0], lesson: '' }); });
  document.querySelector('.ds-row-craft:last-of-type .ds-craft-input')?.focus();
});
delegate(document, 'click', '[data-action="craft-del"]', (e, el) => {
  const i = craftIndexOf(el);
  if (!Number.isInteger(i)) return;
  mutate(() => { mine.craft.splice(i, 1); });
});

delegate(document, 'click', '[data-action="q-add"]', () => {
  mutate(() => { mine.questions.push(''); });
  document.querySelector('.ds-row-q:last-of-type .ds-q-input')?.focus();
});
delegate(document, 'click', '[data-action="q-del"]', (e, el) => {
  const i = qIndexOf(el);
  if (!Number.isInteger(i)) return;
  mutate(() => { mine.questions.splice(i, 1); });
});

/** Render the dissection into `container`. The library calls this
 *  once for its Dissection tab; the shell is the caller's business. */
export function mountDissection(container) {
  app = container;
  render();
}

export default { mountDissection };
