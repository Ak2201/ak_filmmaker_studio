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

// The page's own change handler usually saves the same value — but
// not every field wired here has one, and dropping the pending write
// on `change` lost the last keystrokes of any that did not when focus
// left inside the debounce. Flushing writes the same value twice at
// worst; dropping it loses text at worst. Flush.
document.addEventListener('change', (e) => {
  if (pending.has(e.target)) run(e.target);
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
/* THE FIELD BEING REPLACED SPEAKS ONE LAST TIME. Chromium fires
   `change` — synchronously, with the element still connected — when a
   focused field whose value changed since it was focused is removed by
   the redraw. Its value is what was typed BEFORE the redraw, and the
   redraw is usually there because the store moved on (another window
   saved): the page's change handler then wrote that older text back
   over the newer one, and the sync carried it on (prove:beat-sync, the
   stale field saved over the other window's edit — intermittent,
   because the field is only still "changed" until its first blur).
   The typed text is already safe: flushAutosave() runs first. So that
   one element's `change` during its own redraw is dropped here, before
   any page listener (window, capture) sees it. */
let replacing = null;
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('change', (e) => {
    if (replacing && e.target === replacing) e.stopImmediatePropagation();
  }, true);
}

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
  const outer = replacing;
  replacing = el;
  try { render(); } finally { replacing = outer; }
  if (!attrs.length || index < 0 || el.isConnected) return;
  const next = document.querySelectorAll(sel)[index];
  if (!next) return;
  next.focus({ preventScroll: true });
  try { if (start !== null) next.setSelectionRange(start, end); } catch (e) { /* not a text type */ }
}

export default { saveOnInput, flushAutosave, preservingFocus };
