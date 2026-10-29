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
     detail.focus   the id of an element, or of a note / clipping, to focus
     detail.control a selector for the exact control to focus (the colour
                    dot pressed, the pin select changed); tried first
   ============================================================ */
import { delegate } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import * as Scenes from '../lib/scenes.js';
import Store from '../lib/store.js';
import { makeNote, pinPatch, COLORS, isNote, undoAppend } from '../lib/notes-model.js';
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
      label: sceneLabel(s, i)
    }));
  } catch (e) { /* no scenes */ }
  return { beats, scenes, beatTitle };
}

/* A scene's pin row: its number and slug line. A scene with no location
   yet (a Beat Sheet Send makes those) adds the start of its synopsis, or
   every one read "1. INT", "2. INT" (QA r2). */
export function sceneLabel(s, i) {
  const slug = [s.intExt, s.location].filter(Boolean).join(' ');
  const syn = String(s.synopsis || '').replace(/\s+/g, ' ').trim();
  const gist = !s.location && syn ? (syn.length > 40 ? syn.slice(0, 39).trimEnd() + '…' : syn) : '';
  return (s.number || String(i + 1)) + '. ' + ([slug, gist].filter(Boolean).join(' · ') || 'Untitled scene');
}

/* The open project's format, read from its entry (story-model.js has the
   same one-liner, but importing it pulls the character and screen-time
   models onto every page that shows a note). */
export const projectFormat = () => { try { const p = Store.currentProject && Store.currentProject(); return (p && p.format) || ''; } catch (e) { return ''; } };

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

function pickNewColor(el) {
  const f = el.getAttribute('data-for');
  document.querySelectorAll('[data-nt="new-color"][data-for="' + CSS.escape(f) + '"]').forEach((b) => {
    b.setAttribute('aria-checked', String(b === el));
    b.tabIndex = b === el ? 0 : -1;
  });
}

function newColor(forId) {
  const on = document.querySelector('[data-nt="new-color"][data-for="' + CSS.escape(forId) + '"][aria-checked="true"]');
  const c = on && on.getAttribute('data-color');
  return COLORS.includes(c) ? c : COLORS[0];
}

/* Where the focus goes when a card leaves: the card after it, else the
   one before, else the host's new-note box — never <body>. */
function neighbourOf(el) {
  const card = el && el.closest('[data-board-item], [data-note-card]');
  const idOf = (c) => c && (c.getAttribute('data-board-item') || c.getAttribute('data-note-card'));
  const next = card && (idOf(card.nextElementSibling) || idOf(card.previousElementSibling));
  return next || (el && el.closest('.nt-dock') ? 'ntDockNew' : 'ntBoardNew');
}

function removeWithUndo(id, el) {
  const items = Story.listVault();
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return;
  const gone = items[at];
  const focus = neighbourOf(el);
  Story.removeFromVault(id);
  changed({ focus });
  toast(isNote(gone) ? 'Note deleted.' : 'Clipping removed.', {
    action: 'Undo', onAction: () => { if (Story.restoreToVault(gone, at)) changed(); }
  });
}

/* `act` is the arrow pressed ('up' / 'down'): the focus stays on it on
   the moved note, so Enter again moves it again; at an end, where that
   arrow is disabled, on the other one. From the grip (no act) the grip. */
function move(id, delta, act = '') {
  flushTyping();
  const items = Story.listVault();
  const at = items.findIndex((x) => x.id === id);
  if (at < 0) return false;
  if (!Story.moveInVault(id, at + delta)) return false;
  const to = Story.listVault().findIndex((x) => x.id === id);
  const end = (act === 'up' && to <= 0) || (act === 'down' && to >= items.length - 1);
  const arrow = act && (end ? (act === 'up' ? 'down' : 'up') : act);
  changed({ focus: id, control: arrow ? '[data-nt="' + arrow + '"][data-note="' + CSS.escape(id) + '"]:not([disabled])' : '' });
  return true;
}

function toScene(id) {
  flushTyping();
  const it = find(id);
  if (!it || !it.sceneId) return;
  const sc = Scenes.listScenes().find((s) => s.id === it.sceneId);
  if (!sc) { toast('That scene is no longer in the scene list.'); return; }
  const before = sc.synopsis || '';
  Scenes.updateScene(sc.id, { synopsis: (before.trim() ? before.replace(/\s+$/, '') + '\n' : '') + it.snippet });
  const after = sceneSynopsis(sc.id);
  const control = '[data-nt="to-scene"][data-note="' + CSS.escape(id) + '"]';
  changed({ scene: sc.id, focus: id, control });
  /* The toast never times out, so the scene may have been edited since:
     undoAppend() takes out only what this press added (QA, 26 Oct 2026:
     the old undo put the synopsis back whole and lost a later edit). */
  toast('Added to scene ' + (sc.number || '') + '’s synopsis.', {
    action: 'Undo', onAction: () => {
      const back = undoAppend(sceneSynopsis(sc.id), before, after);
      if (back === null) { toast(CHANGED_SINCE); return; }
      Scenes.updateScene(sc.id, { synopsis: back });
      changed({ scene: sc.id });
    }
  });
}
const sceneSynopsis = (sid) => { const x = Scenes.listScenes().find((s) => s.id === sid); return x ? (x.synopsis || '') : ''; };
const CHANGED_SINCE = 'Not undone: the added text has been edited since. Change it by hand.';

/** "Add to synopsis" for a note OR a clipping (the board's clip-use calls
 *  this too, so both offer the same Undo). `control` is the button to
 *  give the focus back to after the host redraws. */
export function toSynopsis(id, { control = '' } = {}) {
  flushTyping();
  const before = Story.loadStory().source;
  if (!appendClipToSynopsis(id)) return false;
  const after = Story.loadStory().source;
  changed({ story: true, focus: id, control: control || '[data-nt="to-synopsis"][data-note="' + CSS.escape(id) + '"]' });
  toast('Added to the end of the synopsis.', {
    action: 'Undo', onAction: () => {
      const s = Story.loadStory();
      const back = undoAppend(s.source, before, after);
      if (back === null) { toast(CHANGED_SINCE); return; }
      s.source = back; Story.saveStory(s); changed({ story: true });
    }
  });
  return true;
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
    if (act === 'new-color') pickNewColor(el); else if (act === 'add') {
      const f = el.getAttribute('data-for');
      const ta = document.getElementById(f);
      const note = makeNote(ta && ta.value, { color: newColor(f), ...pinPatch(el.getAttribute('data-pin')) });
      /* An empty box used to do nothing and say nothing (QA, 26 Oct 2026). */
      if (!note) { if (ta) ta.focus(); toast('Write the note in the box first, then press Add note.'); return; }
      if (Story.addNoteToVault(note)) { if (ta) ta.value = ''; changed({ focus: f, added: note.id }); }
      else toast('The note could not be saved: this browser’s storage refused it.', { type: 'error' });
    } else if (act === 'color') {
      const c = el.getAttribute('data-color');
      if (COLORS.includes(c) && Story.updateVault(id, { color: c })) {
        changed({ focus: id, control: '[data-nt="color"][data-note="' + CSS.escape(id) + '"][data-color="' + CSS.escape(c) + '"]' });
      }
    } else if (act === 'del') removeWithUndo(id, el);
    else if (act === 'up') move(id, -1, 'up');
    else if (act === 'down') move(id, 1, 'down');
    else if (act === 'to-synopsis') toSynopsis(id);
    else if (act === 'to-scene') toScene(id);
    else if (act === 'copy') copy(id);
  });
  delegate(document, 'input', '[data-nt-field="text"]', (e, el) => saveText(el.getAttribute('data-note'), el.value));
  delegate(document, 'change', '[data-nt-field="pin"]', (e, el) => {
    flushTyping();
    const nid = el.getAttribute('data-note');
    if (Story.updateVault(nid, pinPatch(el.value))) changed({ focus: nid, control: '[data-nt-field="pin"][data-note="' + CSS.escape(nid) + '"]' });
  });
  /* A note cannot be empty (listVault and "Add to synopsis" need text),
     so clearing one used to look saved and quietly came back on reload.
     Leaving an emptied field now puts the text back and says why. */
  delegate(document, 'focusout', '[data-nt-field="text"]', (e, el) => {
    if (el.value.trim()) return;
    const nid = el.getAttribute('data-note');
    clearTimeout(typing.get(nid)); typing.delete(nid);
    const it = find(nid);
    if (!it) return;
    el.value = it.snippet;
    toast('A note can’t be empty, so its text is back. To remove the note, press Delete.');
  });
  /* The new note's colour row is a radio group: one Tab stop, and the
     arrow keys move the choice (roving tabindex, set in note-card.js). */
  delegate(document, 'keydown', '[data-nt="new-color"]', (e, el) => {
    const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
    if (!step) return;
    e.preventDefault();
    const row = [...document.querySelectorAll('[data-nt="new-color"][data-for="' + CSS.escape(el.getAttribute('data-for')) + '"]')];
    const next = row[(row.indexOf(el) + step + row.length) % row.length];
    pickNewColor(next);
    next.focus();
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

export default { bindNoteActions, pinOptions, flushTyping, changed, toSynopsis, projectFormat };
