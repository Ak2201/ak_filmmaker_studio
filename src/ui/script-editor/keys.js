/* ============================================================
   SCRIPT EDITOR — the keyboard
   ------------------------------------------------------------
   Moved out of src/pages/write.js unchanged. One handler, in this
   order:
     1. SmartType's list, when it is open, owns ↑ ↓ Return Tab Esc —
        and a Return that accepts a suggestion stops here, so it never
        also makes a new element.
     2. write-keys.js says what the key means for this element:
        Return makes the next element in the type that usually follows
        (or, on an EMPTY line, cycles its type in place); Tab and
        Shift+Tab walk Character → Parenthetical → Dialogue;
        Alt/Option+number (and Ctrl/Cmd+number where it is free) sets
        the type; Alt+D, Ctrl/Cmd+Shift+K and Ctrl/Cmd+Shift+S are
        dual dialogue, a note and the navigator.
   Shift+Return stays a line break inside the element. Return still
   goes through addElement(), which PATCHES the rows it touches (C2) —
   nothing here renders.

   Esc then Tab leaves the screenplay: Tab is taken only where the flow
   table has something to say, and Esc frees the next Tab, so the page
   never becomes a keyboard trap.
   ============================================================ */
import { delegate } from '../../lib/dom.js';
import Keys from '../../lib/write-keys.js';
import WriteKeys from '../write-shortcuts.js';
import { elFocus, autosize } from './rows.js';

/** Where Return would split this field, or null when it would not:
 *  the caret (or the selection) must start inside the text and stop
 *  short of its end. A caret at 0 is not a split — that would leave
 *  an empty element behind with the whole line moved under it. */
export function splitAt(ta) {
  let a, b;
  try { a = ta.selectionStart; b = ta.selectionEnd; } catch (e) { return null; }
  if (a == null || b == null) return null;
  return a > 0 && b < ta.value.length ? { a, b } : null;
}

/**
 * Wire the editor's keys onto `root`.
 * `ed` is the editor API (editor.js); `o` carries the page hooks plus
 * `idOf`, `setElementTypeAt(i, type)`, `persistNow` and an abort `signal`.
 */
export function wireKeys(root, ed, o) {
  const { signal } = o;
  const els = () => ed.getElements();
  const smart = o.smart;
  const idOf = o.idOf;

  const tabFree = new WeakSet();
  delegate(root, 'keydown', '.wr-text[data-el-field="text"]', (e, ta) => {
    if (e.isComposing) return;
    if (smart.handleKey(e, ta)) return;
    if (e.key === 'Escape') { tabFree.add(ta); return; }
    if (e.key === 'Tab' && tabFree.has(ta)) { tabFree.delete(ta); return; }
    tabFree.delete(ta);
    const i = ed.indexOf(idOf(ta, 'el'));
    if (i < 0) return;
    const el = els()[i];
    const prefs = o.getPrefs();
    const act = Keys.resolveKey(e, {
      type: el.type,
      empty: ta.value === '',
      prefs,
      known: o.known(),
      ctrlDigits: prefs.ctrlDigits || WriteKeys.ctrlDigitsFree()
    });
    if (!act) return;
    e.preventDefault();
    el.text = ta.value;                      // the debounce may not have fired
    smart.close();
    switch (act.kind) {
      case 'type':
        if (act.type !== el.type) o.setElementTypeAt(i, act.type);
        break;
      case 'return':
        /* ALL CAPS + Return in an action line, or a ">" forced
           transition: the line was a character or a transition. */
        if (act.op !== 'change' && o.inference && el.type === 'action' && ta.value.trim() && splitAt(ta) === null) {
          const became = o.inference.onReturn(i, ta);
          if (became) { ed.addElement(i, Keys.returnNext(became, prefs, o.known())); break; }
        }
        /* Return with the caret INSIDE the text splits the line there
           (UX audit L26): the text after the caret becomes the next
           element, in the SAME type — half a speech is still dialogue —
           and the caret lands at its start. A one-line type (heading,
           cue, transition) hands its tail to the type the flow table
           says follows it instead. At the end of the line, or
           with a selection reaching it, it is the flow table's move. */
        if (act.op !== 'change' && splitAt(ta) !== null) { ed.splitElement(i, ta, act.type); break; }
        if (act.op === 'change') o.setElementTypeAt(i, act.type);
        else ed.addElement(i, act.type);
        break;
      case 'tab':
        if (act.op === 'change') o.setElementTypeAt(i, act.type);
        else ed.addElement(i, act.type);
        break;
      case 'dual': ed.toggleDual(i); break;
      case 'note': openNote(i, ta); break;
      case 'navigator': openNavigator(); break;
      case 'find': openFind(); break;
      default: break;
    }
  }, { signal });

  /* Ctrl/Cmd+Shift+S from anywhere else on the page (a button, the
     type select). Inside a line the handler above has it already. */
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== 'KeyS' && String(e.key).toLowerCase() !== 's') return;
    if (e.target && e.target.closest && e.target.closest('.wr-text, .wk-nav')) return;
    if (!document.getElementById('wr-page')) return;
    e.preventDefault();
    openNavigator();
  }, { signal });

  /* Ctrl/Cmd+Shift+H: find and replace. The page that has a find bar
     listens for this event (screenplay.js mounts src/ui/script-replace-bar.js);
     a page without one simply ignores it. Outside a line too, like S. */
  function openFind() {
    document.dispatchEvent(new CustomEvent('fms:script-find', { detail: { id: curLineId() } }));
  }
  function curLineId() {
    const ta = document.activeElement;
    return ta && ta.closest ? (ta.closest('[data-el]')?.dataset.el || null) : null;
  }
  document.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || !e.shiftKey || e.altKey) return;
    if (e.code !== 'KeyH' && String(e.key).toLowerCase() !== 'h') return;
    if (e.target && e.target.closest && e.target.closest('.wr-text, .wk-nav')) return;
    if (!document.getElementById('wr-page')) return;
    e.preventDefault();
    openFind();
  }, { signal });

  function openNavigator() {
    WriteKeys.openNavigator({
      elements: els(),
      onJump: (id) => ed.applyFocus(elFocus(id))
    });
  }

  /* A NOTE ON THIS LINE (Ctrl/Cmd+Shift+K) — src/ui/comments.js's panel,
     hung off the element by its id. The private note half is local and
     always works (fms_note_script_<id>, the note family backup.js and
     reset already sweep); the shared thread needs the cloud, and says
     so. Loaded on first use: nothing on this page needed it before. */
  let commentsMod = null;
  async function openNote(i, ta) {
    const el = els()[i];
    const row = ta.closest('[data-el]');
    if (!el || !row) return;
    try {
      if (!commentsMod) {
        commentsMod = await import('../comments.js');
        commentsMod.mountComments({ scope: 'script' });
      }
      commentsMod.togglePanel('script_' + el.id, row);
    } catch (e) {
      o.say('Notes could not be opened here. Try again in a moment.');
    }
  }

  /* Backspace in an empty element deletes it and steps back, which is
     how every screenwriting app behaves and what makes the Return
     mapping above safe to be wrong about.

     It is UNDOABLE (UX audit L26). An empty line can still carry its
     type, alternate takes, a dual flag and a private note keyed by its
     id, and a Backspace too many used to take all of that with no way
     back. One toast for a run of removals, not one per key — an
     actionable toast does not time out, so a toast per Backspace would
     stack up on screen — and Undo puts every line of the run back, with
     its id, where it was. */
  let removedRun = [];      // [{ el, at }] in the order they were removed
  let removedToast = null;
  delegate(root, 'keydown', '.wr-text[data-el-field="text"]', (e, ta) => {
    if (e.key !== 'Backspace' || ta.value !== '' || els().length < 2) return;
    const i = ed.indexOf(idOf(ta, 'el'));
    if (i < 0) return;
    e.preventDefault();
    removedRun.push({ el: els()[i], at: i });
    ed.removeElement(i, (k) => els()[k - 1] || els()[k]);
    offerUndoRemoval();
  }, { signal });
  function offerUndoRemoval() {
    if (removedToast) { try { removedToast.dismiss(); } catch (e) { /* gone */ } }
    const run = removedRun;
    const n = run.length;
    try {
      removedToast = o.toast(n === 1 ? 'Empty line removed.' : n + ' empty lines removed.', {
        type: 'info', action: 'Undo',
        onAction: () => {
          if (removedRun === run) { removedRun = []; removedToast = null; }
          const list = els();
          for (let k = run.length - 1; k >= 0; k--) {
            const { el, at } = run[k];
            if (ed.indexOf(el.id) < 0) list.splice(Math.min(at, list.length), 0, el);
          }
          o.persistNow();
          ed.rerender(elFocus(run[0].el.id));
        }
      });
    } catch (e) { /* chrome may not be up */ }
  }
  /* MOVING BETWEEN LINES BY KEYBOARD (QA r2). Each element is its own
     textarea, so the browser's ↑ ↓ stop at its edges and Backspace /
     Delete at an edge did nothing: writing by keyboard meant the mouse
     on every line. As in every screenplay editor and word processor:
     ↓ on the last visual line goes to the next element (↑ on the first
     to the one before); Backspace at the start joins the line to the one
     above, Delete at the end pulls the next one up. A join is one Undo
     away, and keeps the joined line (its id, so its note) for it. */
  const visualLines = (ta) => {
    const cs = getComputedStyle(ta);
    const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
    const inner = ta.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0);
    return Math.max(1, Math.round(inner / lh));
  };
  const caretTo = (id, where) => {
    const node = document.querySelector(elFocus(id));
    if (!node) return;
    ed.applyFocus(node);   // caret at the end
    if (where === 'start') { try { node.setSelectionRange(0, 0); } catch (e) { /* select */ } }
  };
  delegate(root, 'keydown', '.wr-text[data-el-field="text"]', (e, ta) => {
    if (e.defaultPrevented || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (!['ArrowUp', 'ArrowDown', 'Backspace', 'Delete'].includes(e.key)) return;
    let a, b;
    try { a = ta.selectionStart; b = ta.selectionEnd; } catch (err) { return; }
    if (a !== b) return;
    const i = ed.indexOf(idOf(ta, 'el'));
    const list = els();
    if (i < 0) return;
    const down = e.key === 'ArrowDown';
    if (e.key === 'ArrowUp' || down) {
      const j = down ? i + 1 : i - 1;
      if (!list[j]) return;
      const edge = down ? a === ta.value.length : a === 0;
      if (edge || visualLines(ta) <= 1) {
        e.preventDefault();
        list[i].text = ta.value;
        caretTo(list[j].id, down ? 'start' : 'end');
        return;
      }
      /* A wrapped block: let the browser move first, and leave the
         element only when it could not (the caret was on the edge line). */
      setTimeout(() => {
        if (document.activeElement === ta && ta.selectionStart === a && ta.selectionEnd === a) {
          list[i].text = ta.value;
          caretTo(list[j].id, down ? 'start' : 'end');
        }
      }, 0);
      return;
    }
    if (ta.value === '') return;                 // the empty-line removal above has it
    if (e.key === 'Backspace' && a === 0 && i > 0) { e.preventDefault(); list[i].text = ta.value; joinLines(i - 1); }
    else if (e.key === 'Delete' && a === ta.value.length && i < list.length - 1) { e.preventDefault(); list[i].text = ta.value; joinLines(i); }
  }, { signal });
  /** Element i+1's text onto the end of element i; the caret at the seam. */
  function joinLines(i) {
    const list = els();
    const keep = list[i], gone = list[i + 1];
    if (!keep || !gone) return;
    const row = document.querySelector(elFocus(gone.id));
    if (row && row.value !== gone.text) gone.text = row.value;
    const was = keep.text;
    const seam = was.length;
    keep.text = was + gone.text;
    ed.removeElement(i + 1, () => keep);
    const ta = document.querySelector(elFocus(keep.id));
    if (ta) {
      ta.value = keep.text;
      autosize(ta);
      ta.focus();
      try { ta.setSelectionRange(seam, seam); } catch (e) { /* select */ }
    }
    try {
      o.toast('Lines joined.', {
        type: 'info', action: 'Undo',
        onAction: () => {
          const at = ed.indexOf(keep.id);
          if (at < 0 || ed.indexOf(gone.id) >= 0) return;
          keep.text = was;
          els().splice(at + 1, 0, gone);
          o.persistNow();
          ed.rerender(elFocus(gone.id));
        }
      });
    } catch (e) { /* chrome may not be up */ }
  }

  /* Typing anything closes the run: the next removal starts a new one. */
  document.addEventListener('input', (e) => {
    if (removedRun.length && e.target && e.target.matches && e.target.matches('.wr-text')) {
      removedRun = [];
      if (removedToast) { try { removedToast.dismiss(); } catch (err) { /* gone */ } removedToast = null; }
    }
  }, { capture: true, signal });
}
