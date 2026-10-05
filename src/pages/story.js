/* ============================================================
   STORY — the Story stage's workspace (PRD 2.0 §4.5)
   ------------------------------------------------------------
   A synopsis on the left, the beats of a structural framework on the
   right, and a tension curve over both. The model is src/lib/story.js;
   this file only draws it and turns gestures into calls on it.

   THREE WAYS IN (FR-402): the sample, a blank page, or a file. The
   sample synopsis is read from src/data/sample.dragon.json — the same
   project the hub seeds — rather than written a second time here.

   WHAT THE PAGE HOLDS IN MEMORY AND NOTHING ELSE: whether the synopsis
   is being edited or tagged, which beat card is lit, and the AI job in
   flight. None of that is a fact about the film, and `verify` asserts
   zero idle localStorage writes.

   OFFSETS. The tagging pane renders the synopsis as text nodes and
   <mark> elements and nothing else, under `white-space: pre-wrap`, so
   the character offset of a selection is the length of a Range from
   the pane's start to the selection — the same string the model
   indexes. Add any other node to that pane and every new tag lands in
   the wrong place.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/ai.css';
import '../styles/story.css';
import '../styles/pdf.css';

import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import { drainClipQueue, onClipQueued } from '../lib/extension-bridge.js';
import sample from '../data/sample.dragon.json';
import Pitch from '../lib/pitch-deck.js';

const app = document.getElementById('app');

let mode = null;          // 'edit' | 'tag' — null means "decide from the data"
let litBeat = '';         // the beat card whose passages are illuminated
let flashMark = '';       // a mark to scroll to after the next render
let AI = null, Panelm = null, aiJob = null, aiStatus = '', aiError = '';
let saveTimer = 0;

const story = () => Story.loadStory();
const pct = (x) => Math.round(x * 100) + '%';

/* ---- persistence ---------------------------------------------- */

function commit(s, { rerender = true } = {}) {
  Story.saveStory(s);
  if (rerender) render();
}

/* ---- the three ways in (FR-402) -------------------------------- */

function renderModes() {
  const sec = h('section.st-modes', { 'aria-label': 'Start the story' });
  const card = (eyebrow, title, body, control) =>
    h('div.st-mode', {}, [h('p.bd-eyebrow', { text: eyebrow }), h('h2.st-mode-title', { text: title }),
      h('p.st-mode-body', { text: body }), control]);
  sec.append(card('Sample', 'Start from Dragon.',
    'The sample project’s synopsis, ready to tag. A quick way to see what the matrix and the curve do before you bring your own.',
    h('button.btn', { type: 'button', 'data-st': 'sample', text: 'USE THE SAMPLE' })));
  sec.append(card('New', 'A blank page.',
    'Write or paste a synopsis. A paragraph is enough to start; the structure is easier to see once there are five or six.',
    h('button.btn.primary', { type: 'button', 'data-st': 'new', text: 'START WRITING' })));
  const drop = h('label.st-drop', {}, [
    h('span', { text: 'Drop a .docx, .pdf or .txt here, or choose a file' }),
    h('input.st-file', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'data-st-field': 'file' })
  ]);
  sec.append(card('Import', 'Bring a file.',
    'A synopsis or treatment from Word, a PDF or plain text. Nothing is changed until you see it here.', drop));
  return sec;
}

/* ---- the heatmap (FR-505) ------------------------------------- */

function renderHeat(s) {
  const heat = Story.heatmap(s);
  const fig = h('figure.st-heat');
  if (!heat.length) return null;
  const W = 1000, H = 140, pad = 6, n = heat.length, bw = W / n;
  const y = (t) => H - pad - ((t - 1) / 9) * (H - pad * 2);
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'st-heat-svg');
  svg.setAttribute('role', 'img');
  const flags = Story.pacingFlags(s).filter((f) => f.kind === 'slack');
  svg.setAttribute('aria-label',
    `Tension across the story in ${n} slices, from ${Math.round(Math.min(...heat.map((w) => w.tension)))} to ` +
    `${Math.round(Math.max(...heat.map((w) => w.tension)))} out of 10. ` +
    (flags.length ? `${flags.length} slack stretch${flags.length === 1 ? '' : 'es'} flagged.` : 'No slack stretch flagged.'));
  const el = (tag, attrs) => { const e = document.createElementNS(ns, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); return e; };
  // Act dividers, recessive.
  for (const r of Story.PACING.regions.slice(1)) {
    svg.append(el('line', { x1: r.from * W, x2: r.from * W, y1: 0, y2: H, class: 'st-heat-act' }));
  }
  // Slack stretches, behind the bars.
  for (const f of flags) {
    const a = heat.find((w) => w.from >= f.from) || heat[0];
    const b = [...heat].reverse().find((w) => w.to <= f.to) || heat[n - 1];
    svg.append(el('rect', { x: a.i * bw, y: 0, width: (b.i - a.i + 1) * bw, height: H, class: 'st-heat-slack' }));
  }
  // One bar per slice: one hue, magnitude as opacity. A 2px gap
  // between bars, and a hover title on each.
  heat.forEach((w) => {
    const r = el('rect', {
      x: w.i * bw + 1, width: Math.max(1, bw - 2), y: y(w.tension), height: H - pad - y(w.tension),
      rx: 2, class: 'st-heat-bar' + (w.estimated ? ' is-est' : ''),
      'fill-opacity': (0.25 + (w.tension / 10) * 0.75).toFixed(2), 'data-st': 'heat', 'data-from': w.from
    });
    const t = el('title', {});
    t.textContent = `${pct(w.pos)} — tension ${w.tension.toFixed(1)}` +
      (w.beat ? ` (${w.beat.label})` : ' (estimated from the text)') + `, convention ${w.expected.toFixed(1)}`;
    r.append(t);
    svg.append(r);
  });
  const line = (pts, cls) => svg.append(el('polyline', { points: pts.map(([x, v]) => `${x},${y(v)}`).join(' '), class: cls }));
  line(heat.map((w) => [(w.i + 0.5) * bw, w.expected]), 'st-heat-expected');
  line(heat.map((w) => [(w.i + 0.5) * bw, w.tension]), 'st-heat-line');
  fig.append(svg);
  const acts = h('div.st-heat-acts', { 'aria-hidden': 'true' });
  Story.PACING.regions.forEach((r) => acts.append(h('span', { text: r.label })));
  fig.append(acts);
  fig.append(h('figcaption.st-heat-cap', {}, [
    h('span.st-key.st-key-line', { text: 'This story' }),
    h('span.st-key.st-key-exp', { text: `${Story.frameworkById(s.framework).short} convention` }),
    h('span.st-key.st-key-slack', { text: 'Slack stretch' }),
    h('span.st-heat-note', { text: 'Tagged passages take their beat’s tension; the rest is estimated from the words and is only a prompt to look.' })
  ]));
  // The table view, for anybody the chart does not serve.
  const det = h('details.st-heat-table');
  det.append(h('summary', { text: 'Show as a table' }));
  const tbl = h('table');
  tbl.append(h('thead', {}, [h('tr', {}, ['Where', 'Tension', 'Convention', 'Source'].map((c) => h('th', { scope: 'col', text: c })))]));
  const tb = h('tbody');
  heat.forEach((w) => tb.append(h('tr', {}, [
    h('td', { text: pct(w.pos) }), h('td', { text: w.tension.toFixed(1) }), h('td', { text: w.expected.toFixed(1) }),
    h('td', { text: w.beat ? w.beat.label : 'estimated' })])));
  tbl.append(tb);
  det.append(h('div.st-table-wrap', {}, [tbl]));
  fig.append(det);
  return fig;
}

function renderFlags(s) {
  const flags = Story.pacingFlags(s);
  if (!flags.length) {
    return h('p.st-flags-ok', { text: s.marks.length
      ? 'No pacing flags for this framework.'
      : 'Tag a few passages and the pacing notes appear here.' });
  }
  const ul = h('ul.st-flags', { 'aria-label': 'Pacing notes' });
  flags.forEach((f) => {
    const li = h('li.st-flag.is-' + f.level);
    if (Number.isFinite(f.from)) {
      li.append(h('button.st-flag-go', { type: 'button', 'data-st': 'goto', 'data-from': f.from, 'data-to': f.to, text: f.text }));
    } else li.append(h('span', { text: f.text }));
    ul.append(li);
  });
  return ul;
}

/* ---- the two panes (FR-502) ----------------------------------- */

function renderSource(s) {
  const pane = h('section.st-pane.st-src-pane', { 'aria-label': 'Source synopsis' });
  const head = h('div.st-pane-head');
  head.append(h('h2.bd-h2', { text: 'Synopsis' }));
  const toggle = h('div.st-toggle', { role: 'group', 'aria-label': 'Synopsis mode' });
  [['tag', 'TAG'], ['edit', 'EDIT']].forEach(([id, label]) => toggle.append(h('button.btn' + (mode === id ? '.is-on' : ''), {
    type: 'button', 'data-st': 'mode', 'data-mode': id, 'aria-pressed': String(mode === id), text: label })));
  head.append(toggle);
  pane.append(head);

  if (mode === 'edit') {
    pane.append(h('label.st-label', { for: 'stSource', text: 'Write or paste the synopsis. Highlights follow their passage when you edit around them.' }));
    pane.append(h('textarea#stSource.st-text', { rows: 18, 'data-st-field': 'source', spellcheck: 'true' }, []));
    pane.querySelector('textarea').value = s.source;
    return pane;
  }

  const fw = Story.frameworkById(s.framework);
  const bar = h('div.st-tagbar');
  bar.append(h('label', { for: 'stTagBeat', text: 'Select text, then tag it as' }));
  const sel = h('select#stTagBeat');
  fw.beats.forEach((b) => sel.append(h('option', { value: b.id, text: b.label })));
  if (litBeat && fw.beats.some((b) => b.id === litBeat)) sel.value = litBeat;
  bar.append(sel);
  bar.append(h('button#stTagBtn.btn.primary', { type: 'button', 'data-st': 'tag', disabled: true, text: 'TAG SELECTION' }));
  pane.append(bar);

  const src = h('div#stSrc.st-src', { tabindex: '0', 'aria-label': 'Synopsis — select a passage to tag it' });
  const len = s.source.length;
  let at = 0;
  const live = Story.anchor(s).filter((m) => !m.detached).sort((a, b) => a.start - b.start);
  for (const m of live) {
    if (m.start < at) continue;        // overlapping passages: the earlier one draws
    if (m.start > at) src.append(document.createTextNode(s.source.slice(at, m.start)));
    const r = Story.beatOf(m, s.framework, len);
    const mk = h('mark.st-mark' + (r.inferred ? '.is-inferred' : '') + (litBeat && r.beat && r.beat.id === litBeat ? '.is-lit' : ''), {
      'data-mark': m.id, 'data-beat': r.beat ? r.beat.id : '',
      title: (r.beat ? r.beat.label : '') + (r.inferred ? ' (placed by position)' : '')
    });
    mk.textContent = s.source.slice(m.start, m.end);
    src.append(mk);
    at = m.end;
  }
  if (at < len) src.append(document.createTextNode(s.source.slice(at)));
  pane.append(src);
  return pane;
}

function renderMatrix(s) {
  const pane = h('section.st-pane.st-matrix', { 'aria-label': 'Beat matrix' });
  const fw = Story.frameworkById(s.framework);
  pane.append(h('div.st-pane-head', {}, [h('h2.bd-h2', { text: fw.label })]));
  pane.append(h('p.bd-sub', { text: fw.blurb }));
  const list = h('ol.st-beats');
  for (const row of Story.matrix(s)) {
    const b = row.beat;
    const li = h('li.st-beat' + (litBeat === b.id ? '.is-lit' : '') + (row.marks.length ? '' : '.is-empty'), { 'data-beat-card': b.id });
    const top = h('div.st-beat-top');
    top.append(h('button.st-beat-name', { type: 'button', 'data-st': 'light', 'data-beat': b.id,
      'aria-pressed': String(litBeat === b.id), text: b.label }));
    top.append(h('span.st-beat-at', { text: '~' + pct(b.at) }));
    const tid = 'stT_' + b.id;
    top.append(h('label.st-beat-tlabel', { for: tid, text: 'Tension' }));
    const ti = h('input#' + tid + '.st-beat-t', { type: 'number', min: 1, max: 10, step: 1,
      'data-st-field': 'tension', 'data-beat': b.id, value: String(row.tension) });
    top.append(ti);
    li.append(top);
    li.append(h('p.st-beat-prompt', { text: b.prompt }));
    if (row.marks.length) {
      const ul = h('ul.st-beat-marks');
      for (const m of row.marks) {
        const mi = h('li.st-beat-mark');
        mi.append(h('button.st-quote', { type: 'button', 'data-st': 'goto-mark', 'data-mark': m.id,
          text: '“' + (m.text.length > 160 ? m.text.slice(0, 157) + '…' : m.text) + '”' }));
        const meta = h('div.st-beat-meta');
        if (m.inferred) meta.append(h('span.st-badge', { text: 'placed by position' }));
        if (m.origin === 'ai') meta.append(h('span.st-badge', { text: 'drafted by AI' }));
        const rs = h('select.st-retag', { 'data-st-field': 'retag', 'data-mark': m.id, 'aria-label': 'Move this passage to another beat' });
        rs.append(h('option', { value: '', text: m.inferred ? 'Tag as…' : 'Untag (place by position)' }));
        fw.beats.forEach((x) => rs.append(h('option', { value: x.id, text: x.label, selected: !m.inferred && x.id === b.id })));
        if (m.inferred) rs.value = '';
        meta.append(rs);
        meta.append(h('button.btn.st-x', { type: 'button', 'data-st': 'unmark', 'data-mark': m.id, 'aria-label': 'Remove this highlight', text: 'REMOVE' }));
        mi.append(meta);
        if (m.rationale) mi.append(h('p.st-why', { text: m.rationale }));
        ul.append(mi);
      }
      li.append(ul);
    }
    list.append(li);
  }
  pane.append(list);
  return pane;
}

/* ---- AI (FR-504) ---------------------------------------------- */

function renderAI(s) {
  const sec = h('section.st-ai', { 'aria-label': 'Map beats with AI' });
  sec.append(h('h2.bd-h2', { text: 'Map the beats with AI' }));
  sec.append(h('p.bd-sub', { text: 'The model quotes the passage it thinks performs each beat. A quote that is not word for word in your synopsis is dropped and counted, and a passage you already tagged in this framework is never moved.' }));
  if (!Panelm) { sec.append(h('p.st-muted', { text: 'Checking for a key…' })); return sec; }
  const kg = Panelm.keyGate('Mapping');
  if (kg) { sec.append(kg); if (kg.dataset.blocking === 'true') return sec; }
  sec.append(Panelm.keyBar());
  if (!s.source.trim()) {
    sec.append(Panelm.gate('No synopsis yet.', 'Write, paste or import one first; the model reads only what is on this page.', null));
    return sec;
  }
  sec.append(Panelm.disclose('The synopsis on this page and the names of the ' + Story.frameworkById(s.framework).short + ' beats. Nothing else.'));
  const row = h('div.st-ai-row');
  if (aiJob) row.append(h('button.btn', { type: 'button', 'data-st': 'ai-stop', text: 'STOP' }));
  else row.append(h('button.btn.primary', { type: 'button', 'data-st': 'ai-run', text: 'MAP ' + Story.frameworkById(s.framework).short.toUpperCase() + ' BEATS' }));
  sec.append(row);
  if (aiStatus) sec.append(Panelm.statusLine(aiStatus));
  if (aiError) sec.append(Panelm.errorLine(aiError));
  return sec;
}

async function primeAI() {
  try {
    const [a, p] = await Promise.all([import('../lib/ai.js'), import('../ui/ai-panel.js')]);
    AI = a; Panelm = p;
    Panelm.wireAIPanel();
    Panelm.onAIChange(() => render());
    render();
  } catch (e) { console.warn('[story] ai', e); }
}

async function runAI() {
  const s = story();
  const fw = Story.frameworkById(s.framework);
  aiError = ''; aiStatus = 'Starting…';
  aiJob = new AbortController();
  render();
  try {
    const res = await AI.draftBeatMap({ synopsis: s.source, framework: fw },
      { signal: aiJob.signal, onStatus: (t) => { aiStatus = t; const el = document.querySelector('.st-ai .ai-status'); if (el) el.textContent = t; } });
    const fresh = story();
    const { added, dropped } = Story.applyBeatMap(fresh, fw.id, res.rows);
    Story.saveStory(fresh);
    aiStatus = `${added} passage${added === 1 ? '' : 's'} tagged` +
      (dropped ? `; ${dropped} quote${dropped === 1 ? ' was' : 's were'} not word for word in the synopsis and ${dropped === 1 ? 'was' : 'were'} dropped` : '') +
      (res.truncated ? '. The reply was cut short, so some beats may be missing.' : '.');
  } catch (e) {
    aiStatus = '';
    aiError = e && e.code === 'aborted' ? 'Stopped. Nothing was changed.' : (e && e.message) || 'The request failed.';
  } finally {
    aiJob = null;
    render();
  }
}

/* ---- the pitch deck (FR-605) --------------------------------
   One button. What goes in is listed beside it, read from the same
   models the deck reads, so nobody prints a deck to find out what is
   in it. */
function renderPitch() {
  const sec = h('section#pitch.st-pitch', { 'aria-label': 'Pitch deck' });
  sec.append(h('h2.bd-h2', { text: 'Pitch deck' }));
  sec.append(h('p.bd-sub', { text: 'A landscape PDF compiled from this project: the logline, this synopsis, the tagged beats, the characters, key scenes and the numbers. A slide with nothing to say is left out.' }));
  let d = null;
  try { d = Pitch.collectPitch(); } catch (e) { d = null; }
  const have = d ? [
    d.logline && 'logline', d.synopsis && 'synopsis', d.beats.length && `${d.beats.length} beats`,
    d.characters.length && `${d.characters.length} characters`, d.keyScenes.length && `${d.keyScenes.length} key scenes`,
    d.numbers.length && 'production numbers'
  ].filter(Boolean) : [];
  sec.append(h('p.st-muted', { text: have.length ? 'In the deck: ' + have.join(' \u00b7 ') + '.' : 'Nothing to pitch yet \u2014 add a synopsis or a logline first.' }));
  sec.append(h('button.btn.primary', { type: 'button', 'data-st': 'pitch', disabled: !have.length, text: 'EXPORT PITCH DECK (PDF)' }));
  return sec;
}

/* ---- the Idea Vault (FR-302) ---------------------------------- */

function renderVault(s) {
  const sec = h('section#vault.st-vault', { 'aria-label': 'Idea Vault' });
  sec.append(h('h2.bd-h2', { text: 'Idea Vault' }));
  sec.append(h('p.bd-sub', { text: 'Clippings for this film — a headline, a line from an article, a reference. The Chrome extension’s “Send to Filmmaker Studio” lands here with the page it came from; you can also add one by hand.' }));
  const add = h('div.st-vault-add');
  add.append(h('label.st-label', { for: 'stClip', text: 'Add a clipping' }));
  add.append(h('textarea#stClip.st-text', { rows: 2 }));
  add.append(h('button.btn', { type: 'button', 'data-st': 'clip-add', text: 'ADD TO VAULT' }));
  sec.append(add);
  const items = Story.listVault();
  if (!items.length) { sec.append(h('p.st-muted', { text: 'Nothing clipped yet.' })); return sec; }
  const fw = Story.frameworkById(s.framework);
  const ul = h('ul.st-clips');
  for (const it of items) {
    const li = h('li.st-clip');
    li.append(h('p.st-clip-text', { text: it.snippet }));
    const meta = h('div.st-clip-meta');
    let host = '';
    try { host = it.url ? new URL(it.url).hostname : ''; } catch (e) { host = ''; }
    if (host) meta.append(h('a.st-clip-src', { href: it.url, target: '_blank', rel: 'noopener noreferrer', text: host }));
    meta.append(h('span.st-muted', { text: new Date(it.at).toLocaleDateString() }));
    const ps = h('select', { 'data-st-field': 'clip-beat', 'data-clip': it.id, 'aria-label': 'Pin this clipping to a beat' });
    ps.append(h('option', { value: '', text: 'Pin to a beat…' }));
    fw.beats.forEach((b) => ps.append(h('option', { value: fw.id + ':' + b.id, text: b.label })));
    ps.value = it.beat && it.beat.startsWith(fw.id + ':') ? it.beat : '';
    meta.append(ps);
    meta.append(h('button.btn', { type: 'button', 'data-st': 'clip-use', 'data-clip': it.id, text: 'ADD TO SYNOPSIS' }));
    meta.append(h('button.btn.st-x', { type: 'button', 'data-st': 'clip-del', 'data-clip': it.id, text: 'REMOVE' }));
    li.append(meta);
    ul.append(li);
  }
  sec.append(ul);
  return sec;
}

/* ---- the page ------------------------------------------------- */

/* Re-entrancy guard. Removing a focused textarea fires `change` on
   blur, from INSIDE replaceChildren, and that handler renders. A nested
   replaceChildren then finds its old children already gone and throws.
   So a render requested during a render is queued, not run. */
let rendering = false, again = false;
function render() {
  if (rendering) { again = true; return; }
  rendering = true;
  try { draw(); } finally {
    rendering = false;
    if (again) { again = false; render(); }
  }
}

function draw() {
  const s = story();
  if (mode === null) mode = s.source.trim() ? 'tag' : 'edit';
  const main = h('main#main.st-main');
  main.append(h('header.bd-head', {}, [
    h('p.bd-eyebrow', { text: 'Story · beats & pacing' }),
    h('h1.bd-title', { text: 'Story.' }),
    h('p.bd-deck', { text: 'Your synopsis against a structure. Tag the passages that turn the story, switch frameworks to see the same story another way, and watch where the tension sags.' })
  ]));

  // FR-402: the three ways in, for as long as there is nothing here.
  // The blank page is already open under them, so "New" is just focus.
  if (!s.source.trim() && !s.marks.length) main.append(renderModes());

  const bar = h('div.st-bar');
  bar.append(h('label', { for: 'stFw', text: 'Framework' }));
  const fsel = h('select#stFw', { 'data-st-field': 'framework' });
  Story.frameworks().forEach((f) => fsel.append(h('option', { value: f.id, text: f.label })));
  fsel.value = s.framework;
  bar.append(fsel);
  bar.append(h('label.btn.st-import', {}, [
    h('span', { text: 'IMPORT' }),
    h('input.st-file', { type: 'file', accept: '.txt,.md,.text,.docx,.pdf', 'data-st-field': 'file', 'aria-label': 'Import a synopsis file' })
  ]));
  if (s.source.trim() || s.marks.length) {
    bar.append(h('button.btn.danger', { type: 'button', 'data-st': 'clear', text: 'START OVER' }));
  }
  main.append(bar);

  if (s.source.trim()) {
    const heat = renderHeat(s);
    if (heat) main.append(h('section.st-pacing', { 'aria-label': 'Pacing' }, [h('h2.bd-h2', { text: 'Pacing' }), heat, renderFlags(s)]));
  }
  main.append(h('div.st-panes', {}, [renderSource(s), renderMatrix(s)]));
  main.append(renderAI(s));
  main.append(renderPitch());
  main.append(renderVault(s));
  app.replaceChildren(main);
  after();
}

function after() {
  mountShell();
  try {
    StudioUI.autoAriaLabels();
    StudioUI.wireGlossaryPopovers();
    StudioUI.polishEmptyStates();
  } catch (e) { console.warn('[story] chrome', e); }
  if (flashMark) {
    const el = document.querySelector(`.st-mark[data-mark="${CSS.escape(flashMark)}"]`);
    flashMark = '';
    if (el) { el.scrollIntoView({ block: 'center' }); el.classList.add('is-flash'); }
  }
}

/* ---- import --------------------------------------------------- */

/* A PDF comes back laid out as on the page: hard line breaks at the
   margin and indentation. A synopsis is prose, so rejoin wrapped lines
   into paragraphs and keep blank lines as paragraph breaks. */
const reflow = (t) => t.split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');

async function importFile(file) {
  if (!file) return;
  const name = file.name || 'file';
  const lower = name.toLowerCase();
  let text = '';
  try {
    if (lower.endsWith('.docx')) {
      const { extractDocxText } = await import('../lib/docx-text.js');
      const res = await extractDocxText(await file.arrayBuffer());
      if (res.fatal) throw new Error(res.fatal);
      text = res.text;
    } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const { extractLayoutText } = await import('../lib/pdf-text.js');
      const res = await extractLayoutText(await file.arrayBuffer());
      if (res.fatal) throw new Error(res.fatal);
      text = reflow(res.text || '');
    } else {
      text = await file.text();
    }
  } catch (e) {
    StudioUI.toast((e && e.message) || 'That file could not be read.', { type: 'error' });
    return;
  }
  text = String(text || '').replace(/\r\n?/g, '\n').trim();
  if (!text) { StudioUI.toast('That file has no text in it.', { type: 'error' }); return; }
  const s = story();
  if (s.source.trim() && !window.confirm(`Replace the synopsis on this page with ${name}? Highlights whose passages are not in the new text will show as detached.`)) return;
  s.source = text;
  s.sourceName = name;
  mode = 'tag';
  commit(s);
  StudioUI.toast(`Imported ${name} — ${text.split(/\s+/).length.toLocaleString()} words.`);
}

/* ---- events — delegated, no inline handlers ------------------- */

function selectionOffsets() {
  const root = document.getElementById('stSrc');
  const sel = window.getSelection();
  if (!root || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const r = sel.getRangeAt(0);
  if (!root.contains(r.startContainer) || !root.contains(r.endContainer)) return null;
  const off = (node, o) => { const x = document.createRange(); x.selectNodeContents(root); x.setEnd(node, o); return x.toString().length; };
  let start = off(r.startContainer, r.startOffset), end = off(r.endContainer, r.endOffset);
  const src = story().source;
  // Trim whitespace at the edges so a sloppy drag still tags the words.
  while (start < end && /\s/.test(src[start])) start++;
  while (end > start && /\s/.test(src[end - 1])) end--;
  return end > start ? { start, end } : null;
}

document.addEventListener('selectionchange', () => {
  const btn = document.getElementById('stTagBtn');
  if (btn) btn.disabled = !selectionOffsets();
});

delegate(document, 'click', '[data-st]', (e, el) => {
  const act = el.getAttribute('data-st');
  const s = story();
  if (act === 'sample') {
    s.source = String(sample.blueprint && sample.blueprint.lad_2_synopsis || '').trim();
    s.sourceName = sample.title + ' (sample)';
    mode = 'tag';
    commit(s);
  } else if (act === 'new') {
    if (mode !== 'edit') { mode = 'edit'; render(); }
    const ta = document.getElementById('stSource'); if (ta) ta.focus();
  } else if (act === 'mode') {
    mode = el.getAttribute('data-mode'); render();
  } else if (act === 'tag') {
    const o = selectionOffsets();
    if (!o) return;
    if (s.marks.some((m) => m.start < o.end && m.end > o.start)) {
      StudioUI.toast('That overlaps a passage already tagged. Remove that highlight first, or select different words.', { type: 'error' });
      return;
    }
    const beat = document.getElementById('stTagBeat').value;
    const m = Story.addMark(s, { ...o, fw: s.framework, beat });
    window.getSelection().removeAllRanges();
    litBeat = beat;
    commit(s);
    if (m) StudioUI.toast(`Tagged as ${Story.beatById(s.framework, beat).label}.`);
  } else if (act === 'light') {
    const b = el.getAttribute('data-beat');
    litBeat = litBeat === b ? '' : b;
    const first = litBeat && Story.matrix(s).find((r) => r.beat.id === litBeat);
    if (first && first.marks[0]) { flashMark = first.marks[0].id; if (mode !== 'tag') mode = 'tag'; }
    render();
  } else if (act === 'goto-mark') {
    flashMark = el.getAttribute('data-mark');
    if (mode !== 'tag') mode = 'tag';
    render();
  } else if (act === 'goto' || act === 'heat') {
    const from = Number(el.getAttribute('data-from'));
    if (mode !== 'tag') { mode = 'tag'; render(); }
    scrollToOffset(from);
  } else if (act === 'unmark') {
    Story.removeMark(s, el.getAttribute('data-mark'));
    commit(s);
  } else if (act === 'clear') {
    if (!window.confirm('Clear the synopsis, every highlight and every tension score on this page? The Idea Vault is kept.')) return;
    const blank = Story.blankStory();
    blank.framework = s.framework;
    mode = null; litBeat = '';
    commit(blank);
  } else if (act === 'pitch') {
    if (!Pitch.exportPitchPDF()) StudioUI.toast('Nothing to put in a deck yet.', { type: 'error' });
  } else if (act === 'ai-run') {
    if (AI) runAI();
  } else if (act === 'ai-stop') {
    if (aiJob) aiJob.abort();
  } else if (act === 'clip-add') {
    const ta = document.getElementById('stClip');
    if (Story.addToVault({ snippet: ta && ta.value })) render();
  } else if (act === 'clip-use') {
    const it = Story.listVault().find((x) => x.id === el.getAttribute('data-clip'));
    if (!it) return;
    s.source = (s.source.trim() ? s.source.replace(/\s+$/, '') + '\n\n' : '') + it.snippet;
    commit(s);
    StudioUI.toast('Added to the end of the synopsis.');
  } else if (act === 'clip-del') {
    Story.removeFromVault(el.getAttribute('data-clip'));
    render();
  }
});

function scrollToOffset(from) {
  const root = document.getElementById('stSrc');
  if (!root || !Number.isFinite(from)) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0, node;
  while ((node = walker.nextNode())) {
    if (seen + node.length > from) {
      const r = document.createRange();
      r.setStart(node, Math.max(0, from - seen)); r.collapse(true);
      const rect = r.getBoundingClientRect();
      window.scrollBy({ top: rect.top - window.innerHeight / 3 });
      const host = node.parentElement && node.parentElement.closest('.st-mark');
      if (host) host.classList.add('is-flash');
      return;
    }
    seen += node.length;
  }
}

delegate(document, 'change', '[data-st-field]', (e, el) => {
  const f = el.getAttribute('data-st-field');
  const s = story();
  if (f === 'framework') {
    s.framework = el.value; litBeat = '';
    commit(s);   // the framework in view is remembered; the mapping is derived
  } else if (f === 'file') {
    const file = el.files && el.files[0];
    el.value = '';
    importFile(file);
  } else if (f === 'source') {
    clearTimeout(saveTimer);
    s.source = el.value;
    commit(s);
  } else if (f === 'tension') {
    Story.setTension(s, s.framework, el.getAttribute('data-beat'), el.value);
    commit(s);
  } else if (f === 'retag') {
    Story.tagMark(s, el.getAttribute('data-mark'), s.framework, el.value);
    commit(s);
  } else if (f === 'clip-beat') {
    Story.updateVault(el.getAttribute('data-clip'), { beat: el.value });
  }
});

// Typing saves without redrawing — a redraw would steal the caret.
delegate(document, 'input', 'textarea[data-st-field="source"]', (e, el) => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { const s = story(); s.source = el.value; Story.saveStory(s); }, 600);
});

// Drag and drop onto the import card.
document.addEventListener('dragover', (e) => { if (e.target.closest && e.target.closest('.st-drop')) { e.preventDefault(); e.target.closest('.st-drop').classList.add('is-over'); } });
document.addEventListener('dragleave', (e) => { const d = e.target.closest && e.target.closest('.st-drop'); if (d) d.classList.remove('is-over'); });
document.addEventListener('drop', (e) => {
  const d = e.target.closest && e.target.closest('.st-drop');
  if (!d) return;
  e.preventDefault();
  d.classList.remove('is-over');
  importFile(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
});

// Clips sent from the extension — those queued while this page was
// closed, and any that arrive while it is open (the side panel).
const drain = () => drainClipQueue().then((n) => {
  if (n) { render(); StudioUI.toast(`${n} clipping${n === 1 ? '' : 's'} arrived in the Idea Vault.`); }
});
drain();
onClipQueued(drain);

render();
primeAI();
