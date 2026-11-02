/* ============================================================
   SCRIPT EDITOR — typewriter scrolling
   ------------------------------------------------------------
   While it is on, the line being typed stays at one height on the
   screen and the page moves under it, as on a typewriter. A view
   preference, not part of the script: the page owns the switch
   (`typewriter` in fms_studio_prefs_v1, written on a click only) and
   calls setOn(); nothing here writes anything.

   It acts on typing and caret movement INSIDE the page's lines only, so
   a click, a wheel scroll or an idle page never moves it. Reduced
   motion: the jump is instant. Instant is also the default — a glide per
   keystroke would lag behind a fast typist — and only a re-centre of
   more than half a screen glides, when motion is allowed.
   ============================================================ */
import { motionReduced } from '../../lib/chrome-prefs.js';

/** Where on screen the caret line rests, as a share of the viewport. */
export const REST = 0.4;

/** How far to scroll so a caret at `top` rests at `rest` (px); 0 inside a
 *  1.5px dead band so a steady line is not nudged by rounding. */
export function scrollDelta(top, rest) {
  const d = top - rest;
  return Math.abs(d) < 1.5 ? 0 : d;
}

/** The caret's viewport top in a textarea. Plain arithmetic, no mirror
 *  node: the row's top, plus the caret's visual line times the line
 *  height. A wrapped line has no newline to count, so the line is
 *  estimated from the caret's share of the text, which is exact on one
 *  visual line and within a line elsewhere: enough to hold the rest
 *  height. */
function caretTop(ta) {
  const r = ta.getBoundingClientRect();
  const cs = getComputedStyle(ta);
  const lh = parseFloat(cs.lineHeight) || (parseFloat(cs.fontSize) || 16) * 1.2;
  const padT = parseFloat(cs.paddingTop) || 0;
  let before = 0;
  try { before = ta.selectionStart || 0; } catch (e) { return r.top; }
  const inner = ta.clientHeight - padT - (parseFloat(cs.paddingBottom) || 0);
  const lines = Math.max(1, Math.round(inner / lh));
  const nl = ta.value.slice(0, before).split('\n').length - 1;
  const share = Math.floor((before / (ta.value.length || 1)) * lines);
  const line = lines <= 1 ? 0 : Math.min(lines - 1, Math.max(nl, share));
  return r.top + padT + line * lh;
}

export function mountTypewriter({ signal }) {
  let on = false;
  let raf = 0;
  const run = () => {
    raf = 0;
    const ta = document.activeElement;
    if (!on || !ta || !ta.matches || !ta.matches('#wr-page .wr-text')) return;
    const d = scrollDelta(caretTop(ta), window.innerHeight * REST);
    if (!d) return;
    const calm = motionReduced() || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
    const smooth = !calm && Math.abs(d) > window.innerHeight * 0.5;
    window.scrollBy({ top: d, behavior: smooth ? 'smooth' : 'instant' });
  };
  const later = () => { if (on && !raf) raf = requestAnimationFrame(run); };
  const inLine = (e) => e.target && e.target.matches && e.target.matches('#wr-page .wr-text');
  document.addEventListener('input', (e) => { if (inLine(e)) later(); }, { signal });
  document.addEventListener('keyup', (e) => {
    if (inLine(e) && /^(Arrow|Home$|End$|Page|Enter$|Backspace$|Delete$)/.test(e.key)) later();
  }, { signal });
  document.addEventListener('focusin', (e) => { if (inLine(e)) later(); }, { signal });
  return {
    setOn(v) {
      on = v === true;
      document.documentElement.classList.toggle('sc-typewriter', on);
      if (on) later();
    }
  };
}
