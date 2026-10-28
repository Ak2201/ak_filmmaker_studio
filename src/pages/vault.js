/* ============================================================
   IDEA VAULT — its own page, one click from the Story stage
   ------------------------------------------------------------
   The vault used to be a tab under the Story editor. The owner asked
   for it to be a section of its own, easy to reach and not inside the
   story space. The data did not move: clippings are still
   `fms_idea_vault_v1`, read and written through src/lib/story.js, and
   "pin to a beat" still reads the story's chosen framework from
   `fms_story_v1`. This page WRITES a story only for "ADD TO SYNOPSIS",
   which appends the clipping to the synopsis exactly as the Story
   page's own button does.

   STICKY NOTES (owner, 23 Oct 2026) share the array, and this page is
   their board (src/ui/idea-vault.js): the note controls are handled by
   src/ui/notes-actions.js, and this page adds the filters and the drag.
   ============================================================ */
import '../lib/store.js';          /* FIRST — it patches Storage.prototype. */
import '../styles/base.css';
import '../styles/chrome.css';
import '../styles/editorial.css';
import '../styles/widgets.css';
import '../styles/modules.css';
import '../styles/print.css';
import '../styles/story.css';
import '../styles/vault.css';
import '../styles/notes.css';
import StudioUI from '../ui/chrome.js';
import { mountShell } from '../ui/shell.js';
import { h, delegate } from '../lib/dom.js';
import * as Story from '../lib/story.js';
import { drainClipQueue, onClipQueued } from '../lib/extension-bridge.js';
import { renderVault } from '../ui/idea-vault.js';
import { pageHeader } from '../ui/kit/index.js';
import { bindNoteActions, changed, flushTyping, toSynopsis } from '../ui/notes-actions.js';
import { COLORS, filterBoard } from '../lib/notes-model.js';

const app = document.getElementById('app');
const view = { filter: 'all', color: '' };   // in memory: the board's filter
bindNoteActions();

function render() {
  const s = Story.loadStory();
  /* the studio's one column (.k-page), so the header's rule takes the
     measure like every page's instead of the viewport (8B pass) */
  const main = h('main#main.k-page');
  main.append(pageHeader({
    class: 'bd-head vault-head',
    eyebrow: ['Story', 'Idea Vault'],
    title: 'Idea Vault',
    sub: 'Everything you collect for this film, in one place: sticky notes and clippings. Pin one to a beat or a scene, or add it to the synopsis when it earns its place.'
  }));
  const sec = h('section.st-sec', { id: 'vault', 'data-tab-label': 'Idea Vault' });
  sec.append(renderVault(s, view));
  main.append(sec);
  app.replaceChildren(main);
  mountShell();
  try { StudioUI.autoAriaLabels(); StudioUI.polishEmptyStates(); } catch (e) { console.warn('[vault] chrome', e); }
}

delegate(document, 'click', '[data-st]', (e, el) => {
  const act = el.getAttribute('data-st');
  if (act === 'clip-add') {
    const ta = document.getElementById('stClip');
    const it = Story.addToVault({ snippet: ta && ta.value });
    /* Like the notes' Add: an empty box says what to do, and after an add
       the keyboard stays in the box for the next clipping (QA r2). */
    if (!it) { if (ta) ta.focus(); StudioUI.toast('Write or paste the clipping in the box first, then press Add to vault.'); return; }
    changed({ focus: 'stClip', added: it.id });
  } else if (act === 'clip-use') {
    /* The note's own path, so a clipping gets the same Undo. */
    const cid = el.getAttribute('data-clip');
    toSynopsis(cid, { control: '[data-st="clip-use"][data-clip="' + CSS.escape(cid) + '"]' });
  } else if (act === 'clip-del') {
    /* The notes' removal (notes-actions.js removeWithUndo): the focus goes
       to a neighbour, and Undo puts the clipping back IN ITS PLACE — it
       used to go through addToVault, which puts a clipping first. */
    const cid = el.getAttribute('data-clip');
    const items = Story.listVault();
    const at = items.findIndex((x) => x.id === cid);
    if (at < 0) return;
    const gone = items[at];
    const card = el.closest('[data-board-item]');
    const sib = card && (card.nextElementSibling || card.previousElementSibling);
    const focus = (sib && sib.getAttribute('data-board-item')) || 'stClip';
    Story.removeFromVault(cid);
    changed({ focus });
    StudioUI.toast('Clipping removed.', {
      action: 'UNDO',
      onAction: () => { if (Story.restoreToVault(gone, at)) changed({ focus: gone.id, control: '[data-st="clip-del"][data-clip="' + CSS.escape(gone.id) + '"]' }); }
    });
  }
});
delegate(document, 'change', '[data-st-field="clip-beat"]', (e, el) => {
  Story.updateVault(el.getAttribute('data-clip'), { beat: el.value });
});

/* ---- the board: filters, redraws, the drag ----------------------- */
delegate(document, 'click', '[data-action="vault-filter"]', (e, el) => {
  view.filter = el.getAttribute('data-value') || 'all';
  render();
});
delegate(document, 'change', '[data-vault-color]', (e, el) => {
  view.color = COLORS.includes(el.value) ? el.value : '';
  render();
});

/* A note write redraws the board, unless somebody is typing in it; the
   focus goes back to the control the change came from. */
document.addEventListener('notes:changed', (e) => {
  const d = e.detail || {};
  if (d.redraw === false) return;
  /* A note added under a filter that hides it read as lost: show the
     whole board again, and say so. */
  let reset = false;
  if (d.added && (view.filter !== 'all' || view.color)) {
    const it = Story.listVault().find((x) => x.id === d.added);
    let shown = it ? filterBoard([it], view.filter) : [];
    if (view.color) shown = shown.filter((x) => (x.color || COLORS[0]) === view.color);
    if (!shown.length) { view.filter = 'all'; view.color = ''; reset = true; }
  }
  render();
  if (reset) StudioUI.toast('Note added. The filter is off so you can see it.');
  if (d.focus) {
    const item = '[data-board-item="' + CSS.escape(d.focus) + '"] ';
    const el = (d.control && document.querySelector(d.control))
      || document.getElementById(d.focus)
      || document.querySelector(item + '[data-nt="grip"]')
      || document.querySelector(item + '.nt-text')
      || document.querySelector(item + 'button, ' + item + 'select');
    if (el) el.focus({ preventScroll: true });
  }
});

/* Drag a note by its grip onto another card: it lands BEFORE that card
   (after it, past the card's middle). One write, on the drop. The
   arrow keys on the grip are notes-actions.js's. */
let drag = null;
delegate(document, 'pointerdown', '[data-nt="grip"]', (e, el) => {
  if (e.button !== 0) return;
  const card = el.closest('[data-board-item]');
  if (!card) return;
  e.preventDefault();
  flushTyping();
  el.setPointerCapture && el.setPointerCapture(e.pointerId);
  drag = { id: card.getAttribute('data-board-item'), card, grip: el, target: null, after: false };
  card.classList.add('is-dragging');
});
document.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const under = document.elementFromPoint(e.clientX, e.clientY);
  const t = under && under.closest('[data-board-item]');
  document.querySelectorAll('.is-drop-before').forEach((x) => x.classList.remove('is-drop-before'));
  if (!t || t === drag.card) { drag.target = null; return; }
  const r = t.getBoundingClientRect();
  drag.target = t;
  drag.after = e.clientX > r.left + r.width / 2;
  if (!drag.after) t.classList.add('is-drop-before');
});
function endDrag(commitIt) {
  if (!drag) return;
  const d = drag; drag = null;
  d.card.classList.remove('is-dragging');
  document.querySelectorAll('.is-drop-before').forEach((x) => x.classList.remove('is-drop-before'));
  if (!commitIt || !d.target) return;
  const items = Story.listVault();
  const from = items.findIndex((x) => x.id === d.id);
  let to = items.findIndex((x) => x.id === d.target.getAttribute('data-board-item'));
  if (from < 0 || to < 0) return;
  if (d.after) to += 1;
  if (from < to) to -= 1;    // the note leaves its own place first
  if (Story.moveInVault(d.id, to)) changed({ focus: d.id });
}
document.addEventListener('pointerup', () => endDrag(true));
document.addEventListener('pointercancel', () => endDrag(false));
document.addEventListener('keydown', (e) => { if (drag && e.key === 'Escape') endDrag(false); });

/* Clips sent from the extension: those queued while this page was
   closed, and any that arrive while it is open (the side panel). */
const drain = () => drainClipQueue().then((n) => {
  if (n) {
    render();
    StudioUI.toast(`${n} clipping${n === 1 ? '' : 's'} arrived in the Idea Vault.`, { type: 'success' });
  }
});

render();
drain();
onClipQueued(drain);
