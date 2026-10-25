/* ============================================================
   THE NOTES DOCK — sticky notes beside the page you are writing on
   ------------------------------------------------------------
   Owner, 23 Oct 2026: sticky notes "I can use while writing the scene
   order or the synopsis". So it is NOT a modal: it docks on the right
   at 1100px and up and the page narrows beside it (the AI Desk's frame,
   ai-desk.css — `main` takes a margin, it is never translated), and it
   is a bottom sheet over the page below that. Escape or Close puts it
   away. It is LAZY: src/ui/notes-button.js imports it on the first
   press, so nothing here is in any page's first paint.

   It stores nothing of its own (which notes show is the open context,
   in memory). The notes are the Idea Vault's records; the controls are
   note-card.js's and their effects notes-actions.js's.
   ============================================================ */
import { h } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import { button } from './kit/index.js';
import { isNote, hereFirst, notesFor, pinValue } from '../lib/notes-model.js';
import { noteCard, noteAdd } from './note-card.js';
import { bindNoteActions, pinOptions } from './notes-actions.js';
import '../styles/notes.css';

let dock = null, body = null, title = null, returnTo = null;
let ctx = {};          // { beat, sceneId, label }: the context the dock opened on
let open = false;

function pinOf(c) { return c.sceneId ? 'scene:' + c.sceneId : c.beat ? 'beat:' + c.beat : ''; }

function draw(focusId) {
  if (!body) return;
  const pins = pinOptions();
  const items = Story.listVault();
  const notes = hereFirst(items, ctx);
  const here = (ctx.beat || ctx.sceneId) ? notesFor(items, ctx).length : 0;
  const kids = [];
  kids.push(noteAdd('ntDockNew', { pin: pinOf(ctx) }));
  if (ctx.label) {
    kids.push(h('p.nt-ctx', { role: 'status' }, [
      h('strong', { text: here + ' pinned to ' + ctx.label }),
      here ? ' · shown first' : ' · a note added here is pinned to it',
      ' ',
      h('button.st-link', { type: 'button', 'data-nt-dock': 'all', text: 'Show all notes' })
    ]));
  }
  if (!notes.length) {
    kids.push(h('p.nt-empty', { text: 'No notes yet. Write one above: a thought, a line of dialogue, an image you want in the film. It stays with this project.' }));
  } else {
    const ul = h('ul.nt-list', { 'aria-label': 'Sticky notes' });
    notes.forEach((n) => ul.append(noteCard(n, { pins, compact: true })));
    kids.push(ul);
  }
  kids.push(h('p.nt-foot', {}, [h('a.st-link', { href: 'vault.html#vault', text: 'Open the board' }), ' to arrange every note and clipping.']));
  body.replaceChildren(...kids);
  title.textContent = 'Notes · ' + items.filter(isNote).length;
  if (focusId) {
    const el = body.querySelector('#' + CSS.escape(focusId)) || body.querySelector('[data-note-card="' + CSS.escape(focusId) + '"] .nt-text');
    if (el) el.focus({ preventScroll: false });
  }
}

function build() {
  title = h('h2.nt-dock-title#ntDockTitle', { text: 'Notes' });
  body = h('div.nt-dock-body');
  dock = h('aside.nt-dock', { 'aria-labelledby': 'ntDockTitle', tabindex: '-1', hidden: true }, [
    h('div.nt-dock-head', {}, [title,
      button({ label: 'Close notes', icon: 'close', iconOnly: true, size: 'sm', variant: 'ghost', attrs: { 'data-nt-dock': 'close' } })]),
    body
  ]);
  document.body.append(dock);
  dock.addEventListener('click', (e) => {
    const b = e.target.closest('[data-nt-dock]');
    if (!b) return;
    const a = b.getAttribute('data-nt-dock');
    if (a === 'close') closeNotes();
    else if (a === 'all') { ctx = {}; draw(); }
  });
  document.addEventListener('keydown', (e) => {
    if (!open || e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('dialog[open], .k-modal-backdrop')) return;
    closeNotes();
  });
  document.addEventListener('notes:changed', (e) => {
    if (!open) return;
    const d = e.detail || {};
    if (d.redraw === false) { title.textContent = 'Notes · ' + Story.listVault().filter(isNote).length; return; }
    draw(d.focus);
  });
  /* Another tab, or a sync, changed the vault. */
  window.addEventListener('storage', (e) => { if (open && (!e.key || /fms_idea_vault_v1/.test(e.key)) && !dock.contains(document.activeElement)) draw(); });
}

function measure() {
  const w = dock && !dock.hidden && window.matchMedia('(min-width: 1100px)').matches ? dock.offsetWidth : 0;
  document.documentElement.style.setProperty('--nt-dock-w', w + 'px');
}

/** Open the dock on a context: { beat: '<fw>:<id>' | sceneId, label }. */
export function openNotes(c = {}, opener = null) {
  bindNoteActions();
  if (!dock) build();
  ctx = c || {};
  returnTo = opener || document.activeElement;
  /* One right-hand panel at a time: the AI Desk steps aside. */
  if (document.documentElement.classList.contains('ai-desk-open')) {
    import('./ai-desk.js').then((m) => m.closeDesk && m.closeDesk()).catch(() => {});
  }
  dock.hidden = false;
  open = true;
  document.documentElement.classList.add('nt-dock-open');
  draw();
  measure();
  window.addEventListener('resize', measure);
  const first = body.querySelector('#ntDockNew');
  if (first) first.focus({ preventScroll: true });
}

export function closeNotes() {
  if (!dock || !open) return;
  dock.hidden = true;
  open = false;
  document.documentElement.classList.remove('nt-dock-open');
  window.removeEventListener('resize', measure);
  measure();
  if (returnTo && returnTo.isConnected) returnTo.focus({ preventScroll: true });
}

export const isOpen = () => open;
export { pinValue };
export default { openNotes, closeNotes, isOpen };
