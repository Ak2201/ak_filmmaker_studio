/* ============================================================
   SEARCH LANDS ON THE LINE — script.html#line-<element id>
   ------------------------------------------------------------
   The command palette finds a line of dialogue or action and opens
   the script at it: `script.html#line-<id>`. This is the page's half.
   It reads the hash on load and on `hashchange`, scrolls that row to
   the middle of the page, puts the caret at the start of it, and
   flashes a highlight that fades after a moment.

   WHY NOT LET THE BROWSER DO IT. Nothing on the page has an `id` of
   `line-…` (rows carry `data-el`), and the page renders from JS after
   the one moment the browser tries a fragment. And the generic landing
   in fragments.js waits for an element id, so it never fires here.

   TWO TRAPS THIS RESPECTS, both named in CLAUDE.md.
   1. A STABLE POSITION IS NOT AN ARRIVAL, and `behavior: 'auto'` is not
      instant (base.css makes it smooth). Every scroll here is
      `behavior: 'instant'`, and it is repeated each frame until the page
      stops moving: the script is built in runs that the browser skips
      while off screen (`content-visibility: auto`, write.css), so the
      row's real position only exists once the run near it has been laid
      out, and the first scroll lands short.
   2. A reader who starts scrolling or typing owns the page. Any wheel,
      touch, key or press ends the settling at once, so it never drags
      the page back.

   IT WRITES NOTHING. No storage, no model change: focusing a row only
   places a caret, and the highlight is a class removed after 1.5s.
   An id that names no row does nothing and throws nothing.
   ============================================================ */
import '../styles/script-find.css';

const PREFIX = 'line-';
const MAX_FRAMES = 120;       // ~2s at 60fps: the longest we keep correcting
const SHOW_MS = 1500;         // how long the highlight stays

/** The element id a hash names, or '' (not a line hash, or undecodable). */
export function lineIdFromHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  if (!raw.startsWith(PREFIX)) return '';
  const enc = raw.slice(PREFIX.length);
  try { return decodeURIComponent(enc); } catch (e) { return enc; }
}

/**
 * Wire the landing. `editor` is the mounted script editor (rowOf).
 * Lands on the current hash now, and on every later hashchange.
 * Returns a function that lands on a given id (for callers and tests).
 */
export function installLineLanding(editor) {
  let cancel = null;
  let fade = 0;

  const coarse = () => {
    try { return matchMedia('(pointer: coarse)').matches; } catch (e) { return false; }
  };

  function clearHighlight() {
    if (fade) { clearTimeout(fade); fade = 0; }
    document.querySelectorAll('.wr-el.sc-found').forEach((r) => r.classList.remove('sc-found'));
  }

  function land(id) {
    if (cancel) cancel();
    clearHighlight();
    if (!id || !editor || typeof editor.rowOf !== 'function') return false;
    let row = null;
    try { row = editor.rowOf(id); } catch (e) { row = null; }
    if (!row) return false;

    let frames = 0, stable = 0, done = false;
    let lastY = NaN, lastTop = NaN;
    const stop = () => {
      if (done) return;
      done = true;
      removeEventListener('wheel', stop, true);
      removeEventListener('touchstart', stop, true);
      removeEventListener('keydown', stop, true);
      removeEventListener('mousedown', stop, true);
      if (cancel === stop) cancel = null;
    };
    cancel = stop;
    for (const t of ['wheel', 'touchstart', 'keydown', 'mousedown']) {
      addEventListener(t, stop, { capture: true, passive: true });
    }

    const arrive = () => {
      const r = editor.rowOf(id);
      if (!r) return;
      r.classList.add('sc-found');
      fade = setTimeout(() => { fade = 0; r.classList.remove('sc-found'); }, SHOW_MS);
      /* A caret, not a keyboard: on a touch screen focusing a text box
         raises the keyboard and shrinks the view, which is not what a
         reader who tapped a search result asked for. */
      const ta = r.querySelector('.wr-text');
      if (ta && !coarse()) {
        try {
          ta.focus({ preventScroll: true });
          ta.setSelectionRange(0, 0);
        } catch (e) { /* a row that cannot take focus is still highlighted */ }
      }
    };

    const step = () => {
      if (done) return;
      const r = editor.rowOf(id);
      if (!r) { stop(); return; }   // re-rendered away: nothing to land on
      r.scrollIntoView({ block: 'center', behavior: 'instant' });
      const y = window.scrollY;
      const top = r.getBoundingClientRect().top;
      if (y === lastY && top === lastTop) stable++; else stable = 0;
      lastY = y; lastTop = top;
      if (stable >= 3 || ++frames >= MAX_FRAMES) { stop(); arrive(); return; }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    return true;
  }

  const onHash = () => { const id = lineIdFromHash(location.hash); if (id) land(id); };
  addEventListener('hashchange', onHash);
  onHash();
  return land;
}

export default { installLineLanding, lineIdFromHash };
