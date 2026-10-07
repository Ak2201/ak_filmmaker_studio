/* ============================================================
   THE LOGLINE WORKSHOP — story.html, path step 2
   ------------------------------------------------------------
   A check of the writer's OWN logline against the five parts a
   logline is made of (protagonist, goal, obstacle, stakes, irony),
   and five variants. One call, through src/lib/ai.js
   loglineWorkshop(), which verifies every span it says the writer
   wrote — a "found" span that is not word for word in their logline
   is stripped and counted, and this panel prints the count.

   NOTHING IS OVERWRITTEN AUTOMATICALLY. A variant is a button,
   "Use this", that asks first; the old logline goes into an Undo
   toast, and the save is story.js's own (`setLogline`). Results are
   in memory only: a suggestion is not the writer's work, and a stored
   one is a suggestion nobody remembers asking for.

   story.js carries one import and one line for this. It hands over
   the AI modules it already loads (lazily, after first paint) so this
   file imports none of the model code itself.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import StudioUI from './chrome.js';
import { apiHost } from '../lib/ai-providers.js';
import { flushAutosave } from '../lib/autosave.js';
import '../styles/coverage.css';

const ws = { running: false, abort: null, status: '', error: '', result: null, forText: '' };
let api = null;     // { AI, Panelm, getStory, setLogline, rerender, format }

function liveLogline() {
  const ta = document.getElementById('stLogline');
  if (ta) return ta.value;
  const s = api && api.getStory();
  return s ? String(s.logline || '') : '';
}

const norm = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** The panel. `opts.AI` / `opts.Panelm` are null until story.js has
    loaded them; the panel says so rather than offering a button. */
export function renderLoglineWorkshop(s, opts) {
  api = opts;
  wire();
  const { AI, Panelm } = opts;
  const box = h('div.ai-panel.st-lw', { 'aria-label': 'Logline workshop' });
  box.append(h('div.ai-head', {}, [h('h3.ai-title', { text: 'Logline workshop' }), Panelm ? Panelm.aiMark('AI') : null]));
  if (!AI || !Panelm) { box.append(h('p.st-muted', { text: 'Checking for a key…' })); return box; }

  if (!Panelm.hasKey()) {
    const det = h('details.st-sugg-gate');
    det.append(h('summary', { text: 'Workshop my logline with AI (optional)' }));
    const kg = Panelm.keyGate('The logline workshop');
    if (kg) det.append(kg);
    box.replaceChildren(det);
    return box;
  }
  const kg = Panelm.keyGate('The logline workshop');
  if (kg) box.append(kg);
  box.append(Panelm.keyBar());
  box.append(Panelm.disclose('Your logline, your idea and up to 6,000 characters of your synopsis, to '
    + apiHost() + ' using the key on this device. One request. Nothing is sent until you click.'));

  const mine = norm(s.logline);
  box.append(h('div.ai-acts', {}, [
    ws.running
      ? h('button.btn.danger', { type: 'button', 'data-action': 'lw-stop', text: 'STOP' })
      : h('button.btn.primary', { type: 'button', 'data-action': 'lw-run', disabled: !mine,
        text: ws.result ? 'WORKSHOP IT AGAIN' : 'WORKSHOP MY LOGLINE' }),
    ws.result && !ws.running ? h('button.btn', { type: 'button', 'data-action': 'lw-clear', text: 'DISMISS' }) : null
  ]));
  if (!mine) box.append(h('p.st-muted', { text: 'Write your logline above first — the workshop works on yours.' }));
  const st = Panelm.statusLine(ws.status);
  if (st) box.append(st);
  const er = Panelm.errorLine(ws.error);
  if (er) box.append(er);
  if (ws.result) box.append(renderResult(ws.result, mine));
  return box;
}

function renderResult(res, mine) {
  const out = h('div.ai-result');
  out.append(h('div.ai-result-head', {}, [
    h('span.ai-mark', { title: 'Written by a model, not by you', text: 'MODEL READING' }),
    h('span.ai-result-meta', { text: 'by ' + res.model + ' · nothing changes until you choose a variant' })
  ]));
  if (norm(ws.forText) !== mine) {
    out.append(h('p.ai-caveat', { text: 'Your logline has changed since this check; it describes the earlier wording.' }));
  }
  if (res.removed) {
    out.append(h('p.cv-removed', { role: 'note', text: res.removed + (res.removed === 1 ? ' quote' : ' quotes')
      + ' removed because ' + (res.removed === 1 ? 'it was' : 'they were') + ' not in your logline.' }));
  }
  const ul = h('ul.st-lw-check');
  for (const c of res.check) {
    ul.append(h('li.st-lw-part' + (c.present ? '.is-on' : '.is-off'), {}, [
      h('span.st-lw-k', { text: (c.present ? '✓ ' : '— ') + c.label }),
      c.found ? h('q.st-lw-found', { text: c.found }) : h('span.st-lw-missing', { text: 'not in your logline' }),
      c.note ? h('span.st-lw-note', { text: c.note }) : null
    ]));
  }
  out.append(ul);
  const ol = h('ol.st-lw-variants');
  res.variants.forEach((v, i) => {
    ol.append(h('li.ai-option', {}, [
      h('p.ai-col-label', { text: 'VARIANT ' + (i + 1) + (v.angle ? ' · ' + v.angle.toUpperCase() : '') }),
      h('p.ai-speech', { text: v.text }),
      h('button.btn', { type: 'button', 'data-action': 'lw-use', 'data-i': String(i), text: 'USE THIS' })
    ]));
  });
  out.append(ol);
  out.append(h('p.ai-caveat', { text: 'Use this asks first, replaces the logline above, and keeps yours in an Undo.' }));
  return out;
}

async function run() {
  if (ws.running || !api || !api.AI) return;
  const logline = liveLogline();
  if (!norm(logline)) return;
  const s = api.getStory();
  ws.running = true; ws.error = ''; ws.status = 'Starting…'; ws.result = null;
  ws.abort = new AbortController();
  api.rerender();
  try {
    ws.result = await api.AI.loglineWorkshop({
      logline, idea: s.idea, synopsis: s.source, format: api.format ? api.format() : ''
    }, {
      signal: ws.abort.signal,
      onStatus: (m) => { ws.status = m; const n = document.querySelector('.st-lw .ai-status'); if (n) n.textContent = m; }
    });
    ws.forText = logline;
    ws.status = ws.result.variants.length + ' variants back. Your logline has not changed.';
  } catch (e) {
    ws.error = (e && e.message) || 'Something went wrong and nothing was changed.';
    ws.status = '';
  }
  ws.running = false; ws.abort = null;
  api.rerender();
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="lw-run"]', () => { run(); });
  delegate(document, 'click', '[data-action="lw-stop"]', () => { if (ws.abort) ws.abort.abort(); });
  delegate(document, 'click', '[data-action="lw-clear"]', () => {
    ws.result = null; ws.status = ''; ws.error = ''; if (api) api.rerender();
  });
  delegate(document, 'click', '[data-action="lw-use"]', (e, btn) => {
    const v = ws.result && ws.result.variants[Number(btn.dataset.i)];
    if (!v || !api) return;
    const before = liveLogline();
    if (!window.confirm('Replace your logline with this variant?\n\n“' + v.text + '”\n\nYour current logline is kept in an Undo.')) return;
    flushAutosave();   // a debounced keystroke must not land on top of the variant
    api.setLogline(v.text);
    StudioUI.toast('Logline replaced with variant ' + (Number(btn.dataset.i) + 1) + '.', {
      type: 'success', action: 'Undo',
      onAction: () => { api.setLogline(before); StudioUI.toast('Your logline is back.', { type: 'info' }); }
    });
  });
}

export default { renderLoglineWorkshop };
