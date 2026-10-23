/* ============================================================
   STICKY NOTES — what the note controls DO, for every host
   ------------------------------------------------------------
   One set of delegated handlers on `document` for every `data-nt` /
   `data-nt-field` control (src/ui/note-card.js), bound once, whichever
   of the dock (notes-dock.js) or the board (vault.html) drew them.
   Every write goes through src/lib/story.js's vault calls, which
   re-read the array first, and then fires `notes:changed` on document:
     detail.story  true when the synopsis was written (the Story page redraws)
     detail.scene  a scene id whose synopsis was written (the Scene List redraws)
     detail.redraw false while somebody types, so a host keeps the caret
   ============================================================ */
import { delegate } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import * as Scenes from '../lib/scenes.js';
import { projectFormat } from '../lib/story-model.js';
import { makeNote, pinPatch, COLORS, isNote } from '../lib/notes-model.js';
import { appendClipToSynopsis } from '../lib/vault-model.js';
import { toast } from './kit/index.js';

export const changed = (detail = {}) => {
  try { document.dispatchEvent(new CustomEvent('notes:changed', { detail: { redraw: true, ...detail } })); } catch (e) { /* no DOM */ }
};

/** The pin select's rows for the open project: its beat sheet's beats
 *  (the five beats on a short film) and its scenes, in order. */
export function pinOptions() {
  let beats = [], scenes = [], beatTitle = 'Beats';
  try {
    const fw = Story.frameworkById(Story.effectiveFramework(Story.loadStory(), projectFormat()));
    beatTitle = 'Beats · ' + fw.short;
    beats = fw.beats.map((b) => ({ value: 'beat:' + Story.qualifyBeat(fw.id, b.id), label: b.label }));
  } catch (e) { /* no story yet */ }
  try {
    scenes = Scenes.listScenes().map((s, i) => ({
      value: 'scene:' + s.id,
      label: (s.number || String(i + 1)) + '. ' + ([s.intExt, s.location].filter(Boolean).join(' ') || 'Untitled scene')
    }));
  } catch (e) { /* no scenes */ }
  return { beats, scenes, beatTitle };
}

const find = (id) => Story.listVault().find((x) => x.id === id);

/* Typing saves on a short debounce, without a redraw. */
const typing = new Map();
function saveText(id, value) {
  clearTimeout(typing.get(id));
  typing.set(id, setTimeout(() => {
    typing.delete(id);
    const v = String(value).trim().slice(0, 4000);
    const it = find(id);
    if (!it || it.snippet === v || !v) return;
    Story.updateVault(id, { snippet: v });
    changed({ redraw: false });
  }, 400));
}
/** Write any text still on its debounce now (before a send or a move). */
export function flushTyping() {
  for (const [id, t] of typing) {
    clearTimeout(t);
    const el = document.querySelector('[data-nt-field="text"][data-note="' + CSS.escape(id) + '"]');
    if (el && el.value.trim()) Story.updateVault(id, { snippet: el.value.trim().slice(0, 4000) });
  }
  typing.clear();
}

function newColor(forId) {
  const on = document.querySelector('[data-nt="new-color"][data-for="' + CSS.escape(forId) + '"][aria-checked="true"]');
  const c = on && on.getAttribute('data-color');
  return COLORS.includes(c) ? c : COLORS[0];
}

function removeWithUndo(id) {
  const items = Story.listVault();
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return;
  const gone = items[at];
  Story.removeFromVault(id);
  changed();
  toast(isNote(gone) ? 'Note deleted.' : 'Clipping removed.', {
    action: 'UNDO', onAction: () => { if (Story.restoreToVault(gone, at)) changed(); }
  });
}

function move(id, delta) {
  flushTyping();
  const items = Story.listVault();
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return false;
  if (Story.moveInVault(id, at + delta)) { changed({ focus: id }); return true; }
  return false;
}

function toScene(id) {
  flushTyping();
  const it = find(id);
  if (!it || !it.sceneId) return;
  const sc = Scenes.listScenes().find((s) => s.id === it.sceneId);
  if (!sc) { toast('That scene is no longer in the scene list.'); return; }
  const before = sc.synopsis || '';
  Scenes.updateScene(sc.id, { synopsis: (before.trim() ? before.replace(/\s+$/, '') + '\n' : '') + it.snippet });
  changed({ scene: sc.id });
  toast('Added to scene ' + (sc.number || '') + '’s synopsis.', {
    action: 'UNDO', onAction: () => { Scenes.updateScene(sc.id, { synopsis: before }); changed({ scene: sc.id }); }
  });
}

function toSynopsis(id) {
  flushTyping();
  const before = Story.loadStory().source;
  if (!appendClipToSynopsis(id)) return;
  changed({ story: true });
  toast('Added to the end of the synopsis.', {
    action: 'UNDO', onAction: () => { const s = Story.loadStory(); s.source = before; Story.saveStory(s); changed({ story: true }); }
  });
}

function copy(id) {
  const it = find(id);
  if (!it) return;
  const ok = () => toast('Copied.', { type: 'success' });
  const fail = () => toast('Copy is not available here; select the text instead.');
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(it.snippet).then(ok, fail);
    else fail();
  } catch (e) { fail(); }
}

let bound = false;
/** Bind the handlers once. `onBeforeAdd(pin)` lets a host supply a pin. */
export function bindNoteActions() {
  if (bound || typeof document === 'undefined') return;
  bound = true;
  delegate(document, 'click', '[data-nt]', (e, el) => {
    const act = el.getAttribute('data-nt');
    const id = el.getAttribute('data-note');
    if (act === 'new-color') {
      const f = el.getAttribute('data-for');
      document.querySelectorAll('[data-nt="new-color"][data-for="' + CSS.escape(f) + '"]').forEach((b) => b.setAttribute('aria-checked', String(b === el)));
    } else if (act === 'add') {
      const f = el.getAttribute('data-for');
      const ta = document.getElementById(f);
      const note = makeNote(ta && ta.value, { color: newColor(f), ...pinPatch(el.getAttribute('data-pin')) });
      if (!note) { if (ta) ta.focus(); return; }
      if (Story.addNoteToVault(note)) { if (ta) ta.value = ''; changed({ focus: f }); }
      else toast('The note could not be saved: this browser’s storage refused it.', { type: 'error' });
    } else if (act === 'color') {
      const c = el.getAttribute('data-color');
      if (COLORS.includes(c) && Story.updateVault(id, { color: c })) changed({ focus: id });
    } else if (act === 'del') removeWithUndo(id);
    else if (act === 'up') move(id, -1);
    else if (act === 'down') move(id, 1);
    else if (act === 'to-synopsis') toSynopsis(id);
    else if (act === 'to-scene') toScene(id);
    else if (act === 'copy') copy(id);
  });
  delegate(document, 'input', '[data-nt-field="text"]', (e, el) => saveText(el.getAttribute('data-note'), el.value));
  delegate(document, 'change', '[data-nt-field="pin"]', (e, el) => {
    flushTyping();
    if (Story.updateVault(el.getAttribute('data-note'), pinPatch(el.value))) changed({ focus: el.getAttribute('data-note') });
  });
  /* The grip: arrow keys move the note one place. (Dragging is the
     board's own, src/ui/idea-vault.js.) */
  delegate(document, 'keydown', '[data-nt="grip"]', (e, el) => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown' && e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    e.preventDefault();
    move(el.getAttribute('data-note'), e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 1);
  });
  window.addEventListener('pagehide', flushTyping);
}

export default { bindNoteActions, pinOptions, flushTyping, changed };
