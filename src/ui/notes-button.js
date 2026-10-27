/* ============================================================
   THE NOTES BUTTON, AND THE PINS ON BEATS AND SCENES — the light half
   ------------------------------------------------------------
   Owner, 23 Oct 2026 (sticky notes, src/lib/notes-model.js). A page
   puts `notesButton()` in its header and, on a beat card or a scene
   card, `notesPin(...)`: an empty slot this module fills with a small
   sticky chip when notes are pinned there. Either one opens the dock
   (src/ui/notes-dock.js), which is imported on the first press only.

   Counts come from the vault model (src/lib/story.js listVault, scoped
   to the open project); a view never reads storage itself.
   It refreshes the slots on `notes:changed`, on a storage event, and
   one frame after a redraw creates a slot (each call queues one
   rAF-throttled fill, which writes only to the DOM, never to storage). The dock is gated like the
   Idea Vault module it belongs to: guard('idea-vault').
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { button, sym } from './kit/index.js';
import { guard } from '../lib/plan-gate.js';
import { listVault } from '../lib/story.js';
import { isNote } from '../lib/notes-model.js';
import '../styles/notes.css';

const readNotes = () => { try { return listVault().filter(isNote); } catch (e) { return []; } };
function counts(notes) {
  const out = { all: notes.length };
  for (const n of notes) {
    const k = n.sceneId ? 'scene:' + n.sceneId : n.beat ? 'beat:' + n.beat : '';
    if (k) out[k] = (out[k] || 0) + 1;
  }
  return out;
}

/** The header button: "Notes" with the project's note count. */
export function notesButton({ size = 'sm', label = 'Notes' } = {}) {
  /* The count is part of the name ("Notes 1"): an aria-label on the
     count replaced the number with the word, so the name read "Notes
     notes". aria-expanded says whether the dock is open (notes-dock.js
     keeps it in step on every .nt-open). */
  const b = button({ label, icon: 'sticky_note_2', size, class: 'nt-open', attrs: { 'data-notes-open': '', title: 'Sticky notes for this film: open them beside the page',
    'aria-expanded': String(typeof document !== 'undefined' && document.documentElement.classList.contains('nt-dock-open')) } });
  b.append(h('span.nt-count', { 'data-notes-count': '' }));
  queue();
  return b;
}

/** A slot on a beat card (`beat: '<fw>:<beat>'`) or a scene card (`sceneId`). */
export function notesPin({ beat = '', sceneId = '', label = '' } = {}) {
  const key = sceneId ? 'scene:' + sceneId : beat ? 'beat:' + beat : '';
  if (!key) return null;
  queue();
  return h('span.nt-slot', { 'data-notes-pin': key, 'data-notes-label': label });
}

function fill() {
  const c = counts(readNotes());
  document.querySelectorAll('[data-notes-count]').forEach((el) => { el.textContent = c.all ? String(c.all) : ''; });
  document.querySelectorAll('[data-notes-pin]').forEach((el) => {
    const n = c[el.getAttribute('data-notes-pin')] || 0;
    if (String(n) === el.getAttribute('data-notes-n')) return;
    el.setAttribute('data-notes-n', String(n));
    if (!n) { el.replaceChildren(); return; }
    const label = el.getAttribute('data-notes-label') || 'this';
    el.replaceChildren(h('button.nt-chip', {
      type: 'button', 'data-notes-open': '', 'data-notes-ctx': el.getAttribute('data-notes-pin'), 'data-notes-ctx-label': label,
      title: n + ' sticky note' + (n === 1 ? '' : 's') + ' pinned to ' + label,
      'aria-label': n + ' sticky note' + (n === 1 ? '' : 's') + ' pinned to ' + label
    }, [sym('sticky_note_2'), h('span', { text: String(n) })]));
  });
}

let pending = false;
function queue() {
  if (pending || typeof requestAnimationFrame === 'undefined') return;
  pending = true;
  requestAnimationFrame(() => { pending = false; fill(); });
}

let wired = false;
function wire() {
  if (wired || typeof document === 'undefined') return;
  wired = true;
  delegate(document, 'click', '[data-notes-open]', (e, el) => {
    e.preventDefault();
    if (!guard('idea-vault', 'Sticky notes')) return;
    const k = el.getAttribute('data-notes-ctx') || '';
    const ctx = k.startsWith('scene:') ? { sceneId: k.slice(6) } : k.startsWith('beat:') ? { beat: k.slice(5) } : {};
    if (k) ctx.label = el.getAttribute('data-notes-ctx-label') || '';
    import('./notes-dock.js').then((m) => m.openNotes(ctx, el));
  });
  document.addEventListener('notes:changed', () => {
    document.querySelectorAll('[data-notes-pin]').forEach((el) => el.removeAttribute('data-notes-n'));
    queue();
  });
  window.addEventListener('storage', () => { document.querySelectorAll('[data-notes-pin]').forEach((el) => el.removeAttribute('data-notes-n')); queue(); });
}
wire();

/** Open the dock from code: `openNotesFor({ beat | sceneId, label })`. */
export function openNotesFor(ctx = {}, opener = null) {
  if (!guard('idea-vault', 'Sticky notes')) return Promise.resolve();
  return import('./notes-dock.js').then((m) => m.openNotes(ctx, opener));
}

export default { notesButton, notesPin, openNotesFor };
