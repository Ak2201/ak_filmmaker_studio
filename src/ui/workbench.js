/* ============================================================
   SCRIPT WORKBENCH — the reference and the page, side by side
   ------------------------------------------------------------
   The case-study page could show a film study and stop there, and
   it would be a reference book with a nicer cover. This is the half
   that makes it a tool: the study on the left, the writer's own
   attempt at the same seven beats on the right, at the same height
   on the screen. You read how 96 poses its question and you answer
   the same question one column over.

   THREE THINGS THIS FILE IS CAREFUL ABOUT.

   1. THE SAVE LOOP. CLAUDE.md records a defect where a save ran a
      refresh which ran a save, forever, and `verify` asserts zero
      localStorage writes across four seconds of idle. So: render
      READS state and never writes it — not once, not to "repair" a
      missing field; `normalise()` hands back a shape-guaranteed
      object precisely so that nothing has to save on load. Writes
      begin at a user event and nowhere else, debounced.

   2. TYPING NEVER RE-RENDERS. A re-render takes the caret with it.
      An input handler updates the in-memory object and then touches
      only the derived readouts — the assembled logline, the beat
      dots, the count — by DOM, never by rebuilding the field the
      user is in.

   3. THE WORK IS KEYED PER FILM. `arunak_workbench_v1` holds
      { slug: { logline, beats, scratch } }. Switching the demo film
      switches the notes with it, and writing under one film can
      never overwrite another's — the write re-reads the whole blob
      and replaces one slug's slot.

   The key is one of store.js's SCOPED_KEYS, so every read and write
   below is already suffixed with the open project by the storage
   proxy. That is also why store.js is imported first here: as a
   module the patch is import-order dependent, and this file touches
   localStorage.
   ============================================================ */
import '../lib/store.js';
import '../styles/workbench.css';
import { h, delegate } from '../lib/dom.js';
import { BEATS } from '../lib/studies.js';

const KEY = 'arunak_workbench_v1';
const SAVE_DELAY = 600;

/* A hue is a category, and an unknown category is no category. The
   data is authored, but a typo in it should degrade to the page
   accent rather than to a class that defines nothing. */
const HUES = ['feature', 'shorts', 'library', 'visualize', 'plan', 'shoot'];

/* The five parts of a logline, in the order they are spoken. `slot`
   is what the assembled line shows while the part is still blank —
   the blank is the instruction. */
const LOGLINE_PARTS = [
  {
    id: 'protagonist',
    label: 'Protagonist',
    ask: 'Who is it about? Name them by the flaw that will cost them, not by their job.',
    slot: '[a flawed protagonist]'
  },
  {
    id: 'incident',
    label: 'Inciting incident',
    ask: 'What arrives that they cannot ignore and cannot control? It does not have to be loud. It has to be unavoidable.',
    slot: '[inciting incident]'
  },
  {
    id: 'conflict',
    label: 'Conflict',
    ask: 'What reliably opposes them? Antagonism is a function, not a person — time and a decision already made will both do it.',
    slot: '[the opposition]'
  },
  {
    id: 'goal',
    label: 'Goal',
    ask: 'What must they do, stated so plainly you could film it?',
    slot: '[goal]'
  },
  {
    id: 'cost',
    label: 'Cost',
    ask: 'What is lost if they fail? If you cannot name the cost you do not yet know why the story ends.',
    slot: '[cost]'
  }
];

/* One prompt per canonical beat. These are the generic job — the
   reference column beside them says how this particular film did it,
   which is the whole arrangement of the page. */
const BEAT_PROMPTS = {
  opening:    'Write the life your story is about to interrupt. Not the interruption — the baseline it will be measured against.',
  inciting:   'What arrives? Keep it unavoidable rather than dramatic, and make sure it is not something they chose.',
  pp1:        'What do they commit to, and what question does that commitment pose? After this, stop adding events.',
  midpoint:   'Where do they stop reacting and start acting? Shrink the world here — fewer people, smaller rooms, less escape.',
  allLost:    'Make the cost concrete and the goal look unreachable. Information can do this better than catastrophe.',
  climax:     'They act on the need, not the want. What do they actually do, and what does it cost them to do it?',
  resolution: 'Show the changed equilibrium and what it took. An ending that withholds the obvious gift must give something else.'
};

/* ------------------------------------------------------------
   STATE — one workbench per page, so this is module state.
   `work` is the in-memory truth; storage is a copy of it.
   ------------------------------------------------------------ */
let host = null;
let study = null;
let slug = '';
let work = blank();
let saveTimer = null;

function blank() {
  return { logline: {}, beats: {}, scratch: '' };
}

/* ------------------------------------------------------------
   STORAGE
   ------------------------------------------------------------ */

/* Everything on the way in is a type guard. An empty array is
   truthy and JSON on disk is whatever the last version wrote, so
   "it parsed" is not the same as "it is the shape I expect". */
function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { return {}; }
  if (typeof raw !== 'string' || !raw) return {};
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (e) { return {}; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
  return parsed;
}

function normalise(value) {
  const out = blank();
  if (!value || typeof value !== 'object' || Array.isArray(value)) return out;

  const lg = value.logline;
  if (lg && typeof lg === 'object' && !Array.isArray(lg)) {
    LOGLINE_PARTS.forEach((p) => {
      if (typeof lg[p.id] === 'string') out.logline[p.id] = lg[p.id];
    });
  }
  const bt = value.beats;
  if (bt && typeof bt === 'object' && !Array.isArray(bt)) {
    BEATS.forEach((b) => {
      if (typeof bt[b.id] === 'string') out.beats[b.id] = bt[b.id];
    });
  }
  if (typeof value.scratch === 'string') out.scratch = value.scratch;
  return out;
}

/* Re-read before writing. The blob holds every film's notes and this
   function only ever owns one slot of it; replacing the whole object
   from a stale copy is how one film's work eats another's. */
function writeNow() {
  clearTimeout(saveTimer);
  saveTimer = null;
  if (!slug) return;
  const all = readAll();
  all[slug] = work;
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    status('Saved in this browser');
  } catch (e) {
    console.warn('[workbench] save failed', e);
    status('Could not save — storage is full or blocked');
  }
}

function persist() {
  clearTimeout(saveTimer);
  status('Saving…');
  saveTimer = setTimeout(writeNow, SAVE_DELAY);
}

/* A debounced keystroke that has not landed yet must not be lost to
   a closing tab. Neither listener writes unless a write is pending,
   so the idle-write assertion in `verify` stays satisfied. */
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => { if (saveTimer) writeNow(); });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && saveTimer) writeNow();
  });
}

/* ------------------------------------------------------------
   SMALL HELPERS
   ------------------------------------------------------------ */
const has = (s) => typeof s === 'string' && s.trim().length > 0;

function beatOf(id) {
  const list = Array.isArray(study && study.beats) ? study.beats : [];
  return list.find((b) => b && b.id === id) || null;
}

function filmLabel() {
  const m = (study && study.meta) || {};
  const tail = [m.director, m.year].filter(Boolean).join(', ');
  return (m.title || 'this film') + (tail ? ' (' + tail + ')' : '');
}

function toast(msg, type) {
  const ui = typeof window !== 'undefined' ? window.StudioUI : null;
  if (ui && typeof ui.toast === 'function') {
    try { ui.toast(msg, { type: type || 'info' }); return; } catch (e) { /* fall through */ }
  }
  console.info('[workbench]', msg);
}

function status(text) {
  const el = host && host.querySelector('[data-wb-status]');
  if (el) el.textContent = text;
}

/* A muted line where a study has not been written yet. The gap is
   the honest thing to render: a blank looks like a bug. */
const note = (text) => h('p.wb-note', { text: text });

const MISSING = 'Not written yet — this study is still being drafted.';

/* ------------------------------------------------------------
   LEFT PANE — the reference. Read-only, always.
   ------------------------------------------------------------ */
function refRow(label, value) {
  return h('div.wb-row', {}, [
    h('span.wb-row-lab', { text: label }),
    h('span.wb-row-val' + (has(value) ? '' : '.is-missing'), { text: has(value) ? value : '—' })
  ]);
}

function section(title, sub, body) {
  const sec = h('section.wb-sec', {}, [h('h3.wb-sec-h', { text: title })]);
  if (sub) sec.append(h('p.wb-sec-sub', { text: sub }));
  [].concat(body).forEach((node) => { if (node) sec.append(node); });
  return sec;
}

function refLogline() {
  const lg = (study && study.logline) || {};
  const kids = [];
  if (has(lg.line)) {
    kids.push(h('div.bd-example', {}, [
      h('span.bd-example-film', { text: (study.meta && study.meta.title) || 'The film' }),
      h('p.wb-line', { text: lg.line })
    ]));
  }
  const rows = h('div.wb-rows');
  LOGLINE_PARTS.forEach((p) => rows.append(refRow(p.label, lg[p.id])));
  kids.push(rows);
  if (!has(lg.line) && !LOGLINE_PARTS.some((p) => has(lg[p.id]))) kids.push(note(MISSING));
  /* No "on the right": below 62rem the columns stack, and a label
     that names a direction the layout no longer has is worse than
     no label. */
  return section('Logline anatomy', 'One sentence, five parts. The parts are the blanks you fill in.', kids);
}

function refBeats() {
  const wrap = h('div.wb-ref-beats');
  let any = false;
  BEATS.forEach((spec, i) => {
    const b = beatOf(spec.id) || {};
    if (has(b.function) || has(b.inFilm)) any = true;
    const card = h('article.wb-ref-beat', { id: 'wb-ref-' + spec.id }, [
      h('div.wb-beat-head', {}, [
        h('span.wb-beat-no', { text: String(i + 1) }),
        h('h4.wb-beat-name', { text: b.label || spec.label }),
        h('span.wb-act', { text: 'Act ' + (b.act || spec.act) })
      ])
    ]);
    if (has(b.function)) card.append(refRow('Function', b.function));
    if (has(b.inFilm)) card.append(refRow('In the film', b.inFilm));
    if (has(b.craft)) card.append(h('p.wb-craft', { text: b.craft }));
    if (!has(b.function) && !has(b.inFilm)) card.append(note(MISSING));
    wrap.append(card);
  });
  return section(
    'The seven beats',
    any
      ? 'What structural job each beat does, and how this film does it.'
      : 'The canonical beats. This film’s study has not been written yet — the prompts on the right still work.',
    wrap
  );
}

function refCharacters() {
  const list = Array.isArray(study && study.characters) ? study.characters : [];
  if (!list.length) return section('Character arcs', null, note(MISSING));
  const wrap = h('div.wb-chars');
  list.forEach((c) => {
    if (!c) return;
    const card = h('article.wb-char', {}, [
      h('div.wb-char-head', {}, [
        h('h4.wb-char-name', { text: c.name || 'Unnamed' }),
        h('span.wb-role', { text: c.role || 'character' })
      ])
    ]);
    [['Flaw', c.flaw], ['Want', c.want], ['Need', c.need],
     ['Loses outside', c.external], ['Loses inside', c.internal]]
      .forEach(([lab, val]) => { if (has(val)) card.append(refRow(lab, val)); });
    if (has(c.arc)) card.append(h('p.wb-arc', { text: c.arc }));
    wrap.append(card);
  });
  return section('Character arcs', 'Want is what they say. Need is what the ending is about.', wrap);
}

function refScenes() {
  const list = Array.isArray(study && study.scenes) ? study.scenes : [];
  if (!list.length) return section('Scene craft', null, note(MISSING));
  const wrap = h('div.wb-scenes');
  list.forEach((s) => {
    if (!s) return;
    const card = h('article.wb-scene', {}, [
      h('span.wb-technique', { text: s.technique || 'Technique' }),
      h('h4.wb-scene-name', { text: s.title || 'Untitled' })
    ]);
    if (has(s.how)) card.append(refRow('How', s.how));
    if (has(s.why)) card.append(refRow('Why it works', s.why));
    if (has(s.tanglish)) card.append(h('p.wb-tanglish', { text: s.tanglish }));
    wrap.append(card);
  });
  return section('Scene craft', 'The idea being demonstrated, not the plot of the scene.', wrap);
}

function renderReference() {
  const m = (study && study.meta) || {};
  const pane = h('aside.wb-ref', {
    'aria-label': 'Reference — ' + (m.title || 'the selected film')
  });
  pane.append(h('header.wb-pane-head', {}, [
    h('p.bd-eyebrow', { text: 'Reference · read only' }),
    h('h2.wb-pane-title', { text: m.title || 'No film selected' }),
    h('p.wb-pane-meta', {
      text: [m.director, m.year, m.genre].filter(Boolean).join(' · ')
    })
  ]));
  pane.append(refLogline(), refBeats(), refCharacters(), refScenes());
  return pane;
}

/* ------------------------------------------------------------
   RIGHT PANE — the writer's own page.
   ------------------------------------------------------------ */
function editLogline() {
  const lg = (study && study.logline) || {};
  const sec = h('section.wb-sec.wb-edit-sec', {}, [
    h('h3.wb-sec-h', { text: 'Your logline' }),
    h('p.wb-sec-sub', { text: 'Five blanks. Fill them in any order — the sentence assembles itself below.' })
  ]);

  LOGLINE_PARTS.forEach((p) => {
    const id = 'wb-lg-' + p.id;
    const field = h('div.wb-field');
    field.append(h('label.wb-lab', { for: id, text: p.label }));
    field.append(h('p.wb-ask', { text: p.ask }));
    if (has(lg[p.id])) {
      field.append(h('p.wb-model', {}, [
        h('span.wb-model-lab', { text: 'In ' + ((study.meta && study.meta.title) || 'the film') }),
        h('span', { text: lg[p.id] })
      ]));
    }
    const input = h('input.wb-input', {
      type: 'text',
      id: id,
      'data-wb-logline': p.id,
      placeholder: p.slot,
      autocomplete: 'off',
      spellcheck: 'true'
    });
    input.value = work.logline[p.id] || '';
    field.append(input);
    sec.append(field);
  });

  sec.append(h('div.wb-preview', { 'data-wb-preview': '', 'aria-live': 'polite' }));
  return sec;
}

function editBeats() {
  const sec = h('section.wb-sec.wb-edit-sec', {}, [
    h('h3.wb-sec-h', { text: 'Your beats' }),
    h('p.wb-sec-sub', { text: 'The same seven, in the same order as the reference — beside it on a wide screen, above it on a narrow one. Each prompt is the structural job; the answer is yours.' })
  ]);

  BEATS.forEach((spec, i) => {
    const ref = beatOf(spec.id) || {};
    const id = 'wb-bt-' + spec.id;
    const field = h('article.wb-field.wb-beat-field');
    field.append(h('div.wb-beat-head', {}, [
      h('span.wb-beat-no', { text: String(i + 1) }),
      h('label.wb-lab.wb-beat-name', { for: id, text: ref.label || spec.label }),
      h('span.wb-act', { text: 'Act ' + (ref.act || spec.act) }),
      h('span.wb-dot', { 'data-wb-dot': spec.id, 'aria-hidden': 'true' })
    ]));
    field.append(h('p.wb-ask', { text: has(ref.function) ? ref.function : BEAT_PROMPTS[spec.id] }));
    if (has(ref.function) && BEAT_PROMPTS[spec.id]) {
      field.append(h('p.wb-ask.wb-ask-sub', { text: BEAT_PROMPTS[spec.id] }));
    }
    const ta = h('textarea.wb-area', {
      id: id,
      rows: '3',
      'data-wb-beat': spec.id,
      placeholder: 'Your ' + (ref.label || spec.label).toLowerCase() + '…'
    });
    ta.value = work.beats[spec.id] || '';
    field.append(ta);
    sec.append(field);
  });

  return sec;
}

function editScratch() {
  const sec = h('section.wb-sec.wb-edit-sec', {}, [
    h('h3.wb-sec-h', { text: 'Scratchpad' }),
    h('p.wb-sec-sub', { text: 'Anything that is not yet a beat. Scenes you can see, a line you overheard, the ending you are afraid of.' })
  ]);
  const ta = h('textarea.wb-area.wb-scratch', {
    id: 'wb-scratch',
    rows: '8',
    'data-wb-scratch': '',
    'aria-label': 'Scratchpad',
    placeholder: 'Scenes, fragments, arguments with yourself…'
  });
  ta.value = work.scratch || '';
  sec.append(ta);
  return sec;
}

function renderEditor() {
  const pane = h('section.wb-edit', { 'aria-label': 'Your work' });
  pane.append(h('header.wb-pane-head', {}, [
    h('p.bd-eyebrow', { text: 'Your page · saves as you type' }),
    h('h2.wb-pane-title', { text: 'Write it yourself' }),
    h('p.wb-pane-meta', {
      text: 'These notes are filed under ' + ((study && study.meta && study.meta.title) || 'this film')
          + '. Switch the demo film and you switch notebooks — nothing here is overwritten.'
    })
  ]));
  pane.append(editLogline(), editBeats(), editScratch());
  return pane;
}

/* ------------------------------------------------------------
   DERIVED READOUTS — DOM only. Never a write, never a re-render.
   ------------------------------------------------------------ */
function assembled() {
  const g = (id) => {
    const v = work.logline[id];
    return has(v) ? v.trim() : null;
  };
  return [
    { text: 'When ' },
    { id: 'incident' }, { text: ', ' },
    { id: 'protagonist' }, { text: ' must ' },
    { id: 'goal' }, { text: ' against ' },
    { id: 'conflict' }, { text: ' — or ' },
    { id: 'cost' }, { text: '.' }
  ].map((part) => {
    if (part.text) return { text: part.text, blank: false };
    const value = g(part.id);
    const spec = LOGLINE_PARTS.find((p) => p.id === part.id);
    return value ? { text: value, blank: false } : { text: spec.slot, blank: true };
  });
}

function assembledText() {
  return assembled().map((p) => p.text).join('');
}

function paintPreview() {
  const box = host && host.querySelector('[data-wb-preview]');
  if (!box) return;
  const kids = assembled().map((p) =>
    p.blank ? h('span.wb-blank', { text: p.text }) : document.createTextNode(p.text));
  box.replaceChildren(h('span.wb-preview-lab', { text: 'Assembled' }), h('p.wb-line', {}, kids));
}

function paintProgress() {
  const filled = LOGLINE_PARTS.filter((p) => has(work.logline[p.id])).length
               + BEATS.filter((b) => has(work.beats[b.id])).length;
  const total = LOGLINE_PARTS.length + BEATS.length;
  const el = host && host.querySelector('[data-wb-progress]');
  if (el) el.textContent = filled + ' of ' + total + ' filled';
  const bar = host && host.querySelector('[data-wb-bar]');
  if (bar) {
    bar.style.setProperty('--wb-pct', Math.round((filled / total) * 100) + '%');
    bar.setAttribute('aria-valuenow', String(filled));
  }
}

function paintDot(id) {
  const dot = host && host.querySelector('[data-wb-dot="' + id + '"]');
  if (dot) dot.classList.toggle('is-filled', has(work.beats[id]));
}

function paintAllDots() {
  BEATS.forEach((b) => paintDot(b.id));
}

/* ------------------------------------------------------------
   QUICK-COPY TEMPLATES
   ------------------------------------------------------------ */
function loglineTemplate() {
  const lg = (study && study.logline) || {};
  const out = [
    'LOGLINE — fill in the blanks',
    '',
    'WHEN [inciting incident],',
    'a [protagonist, named by their flaw]',
    'must [goal]',
    'against [the opposition]',
    'or [cost].',
    ''
  ];
  LOGLINE_PARTS.forEach((p) => { out.push(p.label.toUpperCase() + ': ' + p.ask); });
  if (has(lg.line)) {
    out.push('', 'MODEL — ' + filmLabel(), '  ' + lg.line);
    LOGLINE_PARTS.forEach((p) => { if (has(lg[p.id])) out.push('  ' + p.label + ': ' + lg[p.id]); });
  }
  return out.join('\n');
}

function beatTemplate() {
  const out = ['BEAT SHEET — seven beats, three acts', ''];
  BEATS.forEach((spec, i) => {
    const ref = beatOf(spec.id) || {};
    out.push(String(i + 1) + '. ' + (ref.label || spec.label) + ' — Act ' + (ref.act || spec.act));
    out.push('   Job: ' + (has(ref.function) ? ref.function : BEAT_PROMPTS[spec.id]));
    if (has(ref.inFilm)) out.push('   In ' + filmLabel() + ': ' + ref.inFilm);
    out.push('   Yours: ');
    out.push('');
  });
  return out.join('\n');
}

function draftText() {
  const title = (study && study.meta && study.meta.title) || 'this film';
  const out = ['MY WORKBENCH — written against ' + title, '', 'LOGLINE'];
  LOGLINE_PARTS.forEach((p) => {
    out.push('  ' + p.label + ': ' + (has(work.logline[p.id]) ? work.logline[p.id].trim() : '—'));
  });
  out.push('  Assembled: ' + assembledText(), '', 'BEATS');
  BEATS.forEach((spec, i) => {
    out.push('  ' + (i + 1) + '. ' + spec.label);
    out.push('     ' + (has(work.beats[spec.id]) ? work.beats[spec.id].trim() : '—'));
  });
  out.push('', 'SCRATCHPAD', has(work.scratch) ? work.scratch.trim() : '—');
  return out.join('\n');
}

const COPIES = {
  'wb-copy-logline': { build: loglineTemplate, label: 'Logline template' },
  'wb-copy-beats':   { build: beatTemplate,    label: 'Beat sheet template' },
  'wb-copy-draft':   { build: draftText,       label: 'Your draft' }
};

async function copyOut(action) {
  const spec = COPIES[action];
  if (!spec) return;
  // The build is inside the try too: this runs from a sync delegated
  // handler, so anything that throws out here is an unhandled
  // rejection rather than a message the writer can act on.
  try {
    await navigator.clipboard.writeText(spec.build());
    toast(spec.label + ' copied to the clipboard.', 'success');
  } catch (e) {
    console.warn('[workbench] clipboard', e);
    toast('Could not reach the clipboard. Select the text by hand and copy it.', 'error');
  }
}

/* ------------------------------------------------------------
   THE BAR — what film, how far in, and the three copies.
   ------------------------------------------------------------ */
function renderBar() {
  const bar = h('div.wb-bar');
  bar.append(h('div.wb-bar-left', {}, [
    h('p.bd-eyebrow', { text: 'Script workbench' }),
    h('p.wb-bar-meta', {}, [
      h('span.wb-progress', { 'data-wb-progress': '', text: '' }),
      h('span.wb-sep', { text: '·', 'aria-hidden': 'true' }),
      h('span.wb-status', { 'data-wb-status': '', text: 'Saved in this browser' })
    ]),
    h('div.wb-meter', {
      'data-wb-bar': '', role: 'progressbar',
      'aria-label': 'Prompts filled',
      'aria-valuemin': '0', 'aria-valuemax': String(LOGLINE_PARTS.length + BEATS.length)
    })
  ]));
  bar.append(h('div.wb-tools', {}, [
    h('button.btn', { type: 'button', 'data-action': 'wb-copy-logline', text: 'Copy logline template' }),
    h('button.btn', { type: 'button', 'data-action': 'wb-copy-beats', text: 'Copy beat sheet' }),
    h('button.btn', { type: 'button', 'data-action': 'wb-copy-draft', text: 'Copy my draft' })
  ]));
  return bar;
}

/* ------------------------------------------------------------
   MOUNT — the whole public surface of this module.
   ------------------------------------------------------------ */
export function mountWorkbench(hostEl, nextStudy) {
  if (!hostEl) return;

  // A pending keystroke belongs to the film we are leaving. Land it
  // before the slug changes, or it lands in the wrong notebook.
  if (saveTimer) writeNow();

  host = hostEl;
  study = nextStudy && typeof nextStudy === 'object' ? nextStudy : null;
  slug = (study && study.meta && study.meta.slug) || '';
  work = slug ? normalise(readAll()[slug]) : blank();

  if (!study) {
    host.replaceChildren(h('div.wb.wb-none', {}, [
      h('p.bd-eyebrow', { text: 'Script workbench' }),
      h('p.bd-sub', { text: 'Pick a demo film and the workbench opens beside its study.' })
    ]));
    return;
  }

  const hue = HUES.indexOf((study.meta && study.meta.hue) || '') >= 0 ? study.meta.hue : '';
  const root = h('div.wb' + (hue ? '.hue-' + hue : ''), { 'data-wb': '', 'data-wb-slug': slug });
  root.append(renderBar(), h('div.wb-panes', {}, [renderReference(), renderEditor()]));
  host.replaceChildren(root);

  paintPreview();
  paintProgress();
  paintAllDots();
  status('Saved in this browser');
}

/* ------------------------------------------------------------
   EVENTS — delegated once, on the document. No inline handlers:
   a strict CSP ships and an inline one breaks the page under it.
   Bound at module scope rather than per mount, because mounting
   again on the same host would otherwise stack a second listener
   on every remaining one.
   ------------------------------------------------------------ */
if (typeof document !== 'undefined') {
  delegate(document, 'input', '[data-wb-logline]', (e, el) => {
    work.logline[el.dataset.wbLogline] = el.value;
    persist();
    paintPreview();
    paintProgress();
  });

  delegate(document, 'input', '[data-wb-beat]', (e, el) => {
    const id = el.dataset.wbBeat;
    work.beats[id] = el.value;
    persist();
    paintDot(id);
    paintProgress();
  });

  delegate(document, 'input', '[data-wb-scratch]', (e, el) => {
    work.scratch = el.value;
    persist();
  });

  delegate(document, 'click', '[data-action^="wb-copy-"]', (e, el) => {
    copyOut(el.dataset.action);
  });
}

export default { mountWorkbench };
