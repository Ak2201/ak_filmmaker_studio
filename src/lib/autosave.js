/* ============================================================
   autosave.js — typed text reaches storage before the tab goes.

   The module pages save a field on `change`, and that is right for
   what `change` drives: a re-render, a regrouped list, a recount.
   It is wrong as the ONLY save, because `change` on a text field
   fires when focus leaves it — and a reload, a closed tab, a phone
   switching apps or a crash leaves no focus to lose. Everything
   typed since the field was entered was simply gone (UX audit H10).

   `saveOnInput()` adds the missing half: a debounced, render-free
   save on `input`, and every pending one flushed synchronously on
   `pagehide` and on `visibilitychange: hidden` — the pattern
   write.js already used, made page-agnostic. The page's `change`
   handler is untouched and still runs on blur, so whatever it
   re-renders still happens, at the moment it always did.

   The save callback must NOT render. It runs mid-typing; a render
   would replace the element under the caret. Pass the store write
   and nothing else.

   Nothing here runs without a keystroke behind it, so the
   four-seconds-of-idle assertion in `npm run verify` is unaffected:
   a timer only exists between an `input` event and its save.
   ============================================================ */

import { delegate } from './dom.js';

const DELAY = 400;
const pending = new Map();   // element -> { save, timer }

/* What `input` means "text was typed" for. A checkbox, a radio, a
   select or a file picker fires `input` and `change` together, so the
   page's own change handler already saved it. */
const SKIP = new Set(['checkbox', 'radio', 'file', 'button', 'submit', 'reset']);
function isTyped(el) {
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  return !SKIP.has((el.type || 'text').toLowerCase());
}

function run(el) {
  const p = pending.get(el);
  if (!p) return;
  clearTimeout(p.timer);
  pending.delete(el);
  // Saved even when a re-render has already replaced the field. A
  // `change` before that render would have cancelled this entry, so a
  // detached field still pending holds text that reached no store —
  // and its ancestors went with it, so `closest()` still finds its ids.
  try { p.save(el); } catch (e) { console.warn('[autosave]', e); }
}

/** Save every field with a pending keystroke, now. */
export function flushAutosave() {
  for (const el of [...pending.keys()]) run(el);
}

/**
 * Debounce `save(el)` on `input` for every typed field matching
 * `selector`. `save` writes to the store and does not render.
 */
export function saveOnInput(selector, save, delay = DELAY) {
  delegate(document, 'input', selector, (e, el) => {
    if (!isTyped(el)) return;
    const p = pending.get(el);
    if (p) clearTimeout(p.timer);
    pending.set(el, { save, timer: setTimeout(() => run(el), delay) });
  });
}

// The page's own change handler saves the same value; a pending
// debounce behind it would only write it twice.
document.addEventListener('change', (e) => {
  const p = pending.get(e.target);
  if (p) { clearTimeout(p.timer); pending.delete(e.target); }
}, true);

// `pagehide` is the one that fires on mobile where `unload` does not;
// `visibilitychange` covers an app switch the OS later kills.
addEventListener('pagehide', flushAutosave);
addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') flushAutosave();
});

/**
 * Run `render` without losing the field the person is typing in. For a
 * redraw nobody asked for — a lazy module arriving after first paint —
 * which would otherwise replace the focused input mid-word. Pending
 * text is saved first, so the redraw reads it back; then the same field
 * (matched by its data-* attributes) gets the focus and the caret back.
 */
export function preservingFocus(render) {
  const el = document.activeElement;
  if (!el || !isTyped(el)) { render(); return; }
  // Located by position among its own kind: the ids that tell one
  // shot's description from another's sit on an ancestor, and a
  // redraw of unchanged data puts every field back in the same order.
  const attrs = [...el.attributes].filter((a) => a.name.startsWith('data-'));
  const sel = el.tagName.toLowerCase() + attrs.map((a) => '[' + a.name + '="' + CSS.escape(a.value) + '"]').join('');
  const index = [...document.querySelectorAll(sel)].indexOf(el);
  let start = null, end = null;
  try { start = el.selectionStart; end = el.selectionEnd; } catch (e) { /* not a text type */ }
  flushAutosave();
  render();
  if (!attrs.length || index < 0 || el.isConnected) return;
  const next = document.querySelectorAll(sel)[index];
  if (!next) return;
  next.focus({ preventScroll: true });
  try { if (start !== null) next.setSelectionRange(start, end); } catch (e) { /* not a text type */ }
}

export default { saveOnInput, flushAutosave, preservingFocus };
