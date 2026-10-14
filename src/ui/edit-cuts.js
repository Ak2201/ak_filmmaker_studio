/* ============================================================
   CUT VERSIONS — the edit page's second half, loaded on demand
   ------------------------------------------------------------
   Everything about a cut: its card, the timecoded notes, the form that
   adds one, the copy button and the events behind them. Moved out of
   src/pages/edit.js so the page's first paint does not carry it (the
   page's budget in scripts/budget.json is judged on what loads before a
   project exists). edit.js loads this when the section nears the
   viewport and calls fillCuts(); the handlers below register once, on
   load, and repaint through the page's own render().

   Nothing here writes until somebody presses ADD, REMOVE or tick.
   ============================================================ */
import StudioUI from './chrome.js';
import { h, delegate } from '../lib/dom.js';
import Scenes from '../lib/scenes.js';
import Edit, { formatTimecode } from '../lib/editlog.js';

let render = () => {};

const sceneLabelOf = (scenes) => {
  const by = new Map(scenes.map((s) => [s.id, s]));
  return (id) => { const s = by.get(id); return s ? 'Sc ' + (s.number || '—') : ''; };
};

function noteItem(cut, n, label) {
  const li = h('li.el-cutnote' + (n.done ? '.is-done' : ''));
  const cb = h('input', {
    type: 'checkbox', 'data-cutnote-done': n.id, 'data-cut': cut.id,
    'aria-label': 'Done: ' + formatTimecode(n.tc) + ' ' + n.text
  });
  cb.checked = !!n.done;
  const lab = n.sceneId ? label(n.sceneId) : '';
  li.append(h('label.el-pickup-lab', {}, [
    cb,
    h('span.el-tc', { text: formatTimecode(n.tc) }),
    h('span', { text: (lab ? lab + ' — ' : '') + n.text })
  ]));
  li.append(h('button.bd-icon', {
    type: 'button', 'data-edit-action': 'note-del', 'data-cut': cut.id, 'data-note': n.id,
    'aria-label': 'Remove note at ' + formatTimecode(n.tc) + ': ' + n.text, text: '×'
  }));
  return li;
}

function cutCard(cut, scenes, label, linksBlock) {
  const art = h('article.el-cut', { 'data-cut': cut.id });
  art.append(h('div.el-head', {}, [
    h('h3.el-slug', { text: cut.name }),
    h('span.el-pages', { text: cut.date || '' }),
    h('button.bd-icon', {
      type: 'button', 'data-edit-action': 'cut-del', 'data-cut': cut.id,
      'aria-label': 'Remove cut ' + cut.name, text: '×'
    })
  ]));
  art.append(linksBlock(cut.links, { scope: 'cut', id: cut.id, name: cut.name, head: 'Where this cut lives' }));

  if (cut.notes.length) {
    const ul = h('ul.el-pickups');
    /* Open notes first, each group in time order — the order the
       copied text uses. */
    cut.notes.filter((n) => !n.done).concat(cut.notes.filter((n) => n.done))
      .forEach((n) => ul.append(noteItem(cut, n, label)));
    art.append(ul);
  } else {
    art.append(h('p.bd-sub', { text: 'No notes on this cut yet.' }));
  }

  const f = h('form.el-note-add', { 'data-edit-form': 'cutnote', 'data-cut': cut.id });
  f.append(h('input.el-tc-in', {
    type: 'text', name: 'tc', inputmode: 'numeric', autocomplete: 'off', placeholder: '0:42',
    'aria-label': 'Timecode in ' + cut.name + ' (seconds, M:SS or H:MM:SS)'
  }));
  const sel = h('select.bd-sel', { name: 'sceneId', 'aria-label': 'Scene this note is about (optional)' });
  sel.append(h('option', { value: '', text: 'Any scene' }));
  scenes.forEach((s) => sel.append(h('option', { value: s.id, text: 'Sc ' + (s.number || '—') + ' · ' + (s.location || 'No location') })));
  f.append(sel);
  f.append(h('input', { type: 'text', name: 'text', placeholder: 'Note — trim the pause, swap the take', 'aria-label': 'Note for ' + cut.name }));
  f.append(h('button.mini-btn', { type: 'submit', text: 'ADD NOTE' }));
  art.append(f);
  art.append(h('button.btn', {
    type: 'button', 'data-edit-action': 'cut-copy', 'data-cut': cut.id,
    text: 'COPY NOTES', title: 'This cut’s notes as plain text for an email'
  }));
  return art;
}

/** Cut versions, and dailies by shoot day. Both read at render; nothing
    is written until somebody presses ADD. */
function fillCuts(sec, data, scenes, api) {
  render = api.render;
  const linksBlock = api.linksBlock;
  sec.append(h('p.bd-sub', { text: 'Assembly, rough cut, fine cut. Each keeps its own notes pinned to a time, and the address of the file — the studio stores links, never footage.' }));
  const label = sceneLabelOf(scenes);
  data.cuts.forEach((c) => sec.append(cutCard(c, scenes, label, linksBlock)));
  const f = h('form.el-cut-add', { 'data-edit-form': 'cut' });
  f.append(h('input', { type: 'text', name: 'name', placeholder: 'New cut — Assembly, Rough cut v1', 'aria-label': 'Name of the new cut' }));
  f.append(h('input', { type: 'date', name: 'date', value: new Date().toISOString().slice(0, 10), 'aria-label': 'Date of the new cut' }));
  f.append(h('button.mini-btn', { type: 'submit', text: 'ADD CUT' }));
  sec.append(f);

  const days = [...new Set(scenes.map((s) => Number(s.shootDay) || 0).filter((n) => n > 0))].sort((a, b) => a - b);
  if (days.length) {
    const box = h('div.el-days', { id: 'dailies' });
    box.append(h('h2.el-h2', { text: 'Dailies by shoot day' }));
    days.forEach((day) => {
      box.append(h('div.el-day', {}, [
        h('h3.el-day-h', { text: 'Day ' + day }),
        linksBlock(Edit.dayLinks(day, data), { scope: 'day', id: String(day), name: 'day ' + day + ' dailies', head: '' })
      ]));
    });
    sec.append(box);
  }
}


/* ---- events — delegated, no inline handlers ------------------ */

delegate(document, 'submit', '[data-edit-form="cut"]', (e, form) => {
  e.preventDefault();
  const c = Edit.addCut({ name: form.querySelector('[name="name"]').value, date: form.querySelector('[name="date"]').value });
  if (!c) { form.querySelector('[name="name"]').focus(); return; }
  render('[data-cut="' + CSS.escape(c.id) + '"] input[name="tc"]');
});

delegate(document, 'submit', '[data-edit-form="cutnote"]', (e, form) => {
  e.preventDefault();
  const cutId = form.getAttribute('data-cut');
  const tc = form.querySelector('[name="tc"]');
  const text = form.querySelector('[name="text"]');
  if (Edit.parseTimecode(tc.value) == null) {
    tc.setAttribute('aria-invalid', 'true');
    if (StudioUI.toastError) StudioUI.toastError('That is not a timecode. Use seconds (42), 0:42 or 1:02:05.');
    tc.focus();
    return;
  }
  if (!text.value.trim()) { text.focus(); return; }
  Edit.addCutNote(cutId, { tc: tc.value, sceneId: form.querySelector('[name="sceneId"]').value, text: text.value });
  render('[data-edit-form="cutnote"][data-cut="' + CSS.escape(cutId) + '"] input[name="tc"]');
});

delegate(document, 'change', '[data-cutnote-done]', (e, el) => {
  const cutId = el.getAttribute('data-cut');
  Edit.updateCutNote(cutId, el.getAttribute('data-cutnote-done'), { done: !!el.checked });
  render('[data-cutnote-done="' + CSS.escape(el.getAttribute('data-cutnote-done')) + '"]');
});

delegate(document, 'click', '[data-edit-action="note-del"]', (e, el) => {
  const cutId = el.getAttribute('data-cut');
  const noteId = el.getAttribute('data-note');
  const cut = Edit.listCuts().find((c) => c.id === cutId);
  const at = cut ? cut.notes.findIndex((n) => n.id === noteId) : -1;
  const gone = at >= 0 ? cut.notes[at] : null;
  Edit.removeCutNote(cutId, noteId);
  render('[data-edit-form="cutnote"][data-cut="' + CSS.escape(cutId) + '"] input[name="tc"]');
  if (gone && StudioUI.toast) {
    StudioUI.toast('Note removed: ' + gone.text, {
      action: 'Undo',
      onAction: () => { Edit.restoreCutNote(cutId, gone, at); render(); }
    });
  }
});

delegate(document, 'click', '[data-edit-action="cut-del"]', (e, el) => {
  const cutId = el.getAttribute('data-cut');
  const all = Edit.listCuts();
  const at = all.findIndex((c) => c.id === cutId);
  const gone = all[at];
  Edit.removeCut(cutId);
  render('[data-edit-form="cut"] input');
  if (gone && StudioUI.toast) {
    StudioUI.toast('Cut removed: ' + gone.name, {
      action: 'Undo',
      onAction: () => { Edit.restoreCut(gone, at); render(); }
    });
  }
});

delegate(document, 'click', '[data-edit-action="cut-copy"]', (e, el) => {
  const cut = Edit.listCuts().find((c) => c.id === el.getAttribute('data-cut'));
  if (!cut) return;
  const text = Edit.cutNotesText(cut, sceneLabelOf(Scenes.listScenes()));
  const done = () => StudioUI.toastSuccess && StudioUI.toastSuccess('Notes copied');
  const fail = () => StudioUI.toastError && StudioUI.toastError('Could not copy — select the text on the page instead');
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, fail);
  else fail();
});


export { fillCuts };
export default { fillCuts };
