/* ============================================================
   START MOTION — the landing page's scroll story (29 Oct 2026)
   ------------------------------------------------------------
   The owner's spec, made with the bundled `motion` package: animate()
   from motion/mini (WAAPI) and scroll() from motion, which hands each
   animation to the browser's own ScrollTimeline / ViewTimeline where
   there is one and drives it from one shared scroll listener where there
   is not. What it does, start.css doing the parts that need no script:

   1. The hero's words rise in one after another, then the action
      (start.css: CSS only, no script).
   2. The product video grows from a smaller card to the full content
      width as its centre reaches the window's: scroll-linked, so scrolling
      back shrinks it again. Wide windows only.
   3. The four stage cards stack (start.css: sticky, on a desk-sized
      window), and here each card sinks a little, scale and brightness,
      as the cards after it slide over it, while a progress line in the
      stack's gutter fills from the first card to the last.
   4. Every other section's parts fade and rise in as they enter,
      scroll-linked. A part with an id (a fragment target) only fades: an
      element with an id that travels is measured where it was.
   5. Hover and focus lifts are CSS (marketing.css, start.css).

   WHAT NEVER HAPPENS, the same rules as marketing.js's calm motion
   (which stands down on this page, so the two never veil one element
   twice). Reduced motion, the device Reduce-motion switch, a --motion of
   0 and Playwright (navigator.webdriver, like src/ui/motion-app.js) get
   none of 2-4, so the proofs see the page as written. Nothing already on
   screen when this runs is hidden (no flash of a painted page): only
   sections wholly below the fold are prepared. Every distance is times
   --motion. NOTHING STAYS VEILED: for print (beforeprint and the print
   media query) and for a stalled timeline (at 8s and after each scroll,
   a part that is wholly on screen and still faint means the timeline is
   not running) every animation is cancelled and every inline style put
   back; and if anything throws, the same.

   Imports: motion/mini and motion (leaves, no app code) and
   device-motion.js (import-free, read-only). test:marketing holds this
   list; prove:growth asserts no studio-* chunk reaches a public page.
   ============================================================ */
import { animate } from 'motion/mini';
import { scroll } from 'motion';
import { deviceReducedMotion } from '../lib/device-motion.js';

/* the stack's media query, as start.css states it; change both */
const STACK = '(min-width: 1100px) and (min-height: 700px) and (prefers-reduced-motion: no-preference)';
const WIDE = '(min-width: 900px)';
const PARTS = ':is(.mk-h2, .mk-sub, .mk-body, .st-note, .st-plans-cta, .mk-cta-row, .mk-more, .st-points > *, .st-stages > .st-stage)';

(function scrollStory() {
  const root = document.documentElement;
  let k = 1;
  try {
    if (deviceReducedMotion() || navigator.webdriver || root.classList.contains('ma-off')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    if (typeof Element.prototype.animate !== 'function') return;
    const m = parseFloat(getComputedStyle(root).getPropertyValue('--motion'));
    k = Number.isFinite(m) ? m : 1;
  } catch (e) { return; }
  if (!k) return;

  const anims = [];      // every animation made here, for restore()
  const stops = [];      // every scroll() subscription
  const touched = [];    // every element given an inline style
  const veiled = [];     // the reveal parts, for the backstop
  let restored = false;
  let fill = null;
  function restore() {
    if (restored) return;
    restored = true;
    for (const s of stops) { try { s(); } catch (e) { /* gone already */ } }
    for (const a of anims) { try { a.cancel(); } catch (e) { /* gone already */ } }
    for (const n of touched) { n.style.scale = ''; n.style.filter = ''; n.style.opacity = ''; n.style.translate = ''; }
    if (fill) fill.remove();
  }
  /* a scroll-linked animation: linear, the scroll is the clock */
  const linked = (el, frames, options) => {
    const a = animate(el, frames, { duration: 1, ease: 'linear' });
    anims.push(a);
    touched.push(el);
    stops.push(scroll(a, { target: el, ...options }));
  };

  try {
    const fold = window.innerHeight || 800;
    const vw = (q) => matchMedia(q).matches;
    const stacking = vw(STACK);

    /* 2. the video: 16% smaller (times --motion), full width once its
       centre reaches the window's */
    const fig = document.querySelector('.st-hero-media');
    if (fig && vw(WIDE)) linked(fig, { scale: [String(1 - 0.16 * k), '1'] }, { offset: ['start end', 'center center'] });

    /* 3. the stack: the line, and each card sinking under the next */
    const stack = document.querySelector('.st-tools .st-stages');
    if (stack && stacking) {
      fill = document.createElement('span');
      fill.className = 'st-fill';
      fill.setAttribute('aria-hidden', 'true');
      stack.append(fill);   // after the cards, so their :nth-child tops hold
      linked(fill, { transform: ['scaleY(0)', 'scaleY(1)'] }, { target: stack, offset: ['start start', 'end end'] });
      const cards = [...stack.querySelectorAll(':scope > .st-stage')];
      const tops = cards.map((c) => parseFloat(getComputedStyle(c).top) || 0);
      touched.push(...cards);
      /* how far each later card has slid up to its own sticky top, summed:
         0 while nothing covers the card, 1 per card stacked on it. One
         read of four rects a frame, on Motion's shared scroll listener. */
      stops.push(scroll(() => {
        if (restored) return;
        const vh = window.innerHeight || fold;
        const slid = cards.map((c, j) => {
          const t = c.getBoundingClientRect().top;
          return Math.min(1, Math.max(0, (vh - t) / Math.max(1, vh - tops[j])));
        });
        cards.forEach((c, i) => {
          let d = 0;
          for (let j = i + 1; j < cards.length; j++) d += slid[j];
          c.style.scale = d ? String(1 - 0.035 * k * d) : '';
          c.style.filter = d ? `brightness(${1 - 0.05 * d})` : '';
        });
      }));
    }

    /* 4. the reveals, for the sections wholly below the fold */
    for (const sec of document.querySelectorAll('main .mk-sec')) {
      if (sec.hidden || sec.getBoundingClientRect().top < fold) continue;
      for (const n of sec.querySelectorAll(PARTS)) {
        if (n.closest('[hidden]')) continue;
        if (stacking && n.matches('.st-stage')) continue;   // the stack is its own motion
        /* over the first 160px of its entry, or all of it if shorter */
        const f = Math.min(1, 160 / Math.max(1, n.offsetHeight));
        const frames = n.id
          ? { opacity: [0, 1] }
          : { opacity: [0, 1], translate: [`0 ${24 * k}px`, '0 0'] };
        linked(n, frames, { offset: ['start end', `${f} end`] });
        veiled.push(n);
      }
    }
  } catch (e) { restore(); return; }

  window.addEventListener('beforeprint', restore);
  try {
    const pm = matchMedia('print');
    if (pm.addEventListener) pm.addEventListener('change', (e) => { if (e.matches) restore(); });
  } catch (e) { /* beforeprint still restores */ }
  /* the backstop: a part wholly on screen is past its reveal range, so it
     must be opaque; if one is still faint the timeline is not running */
  const check = () => {
    if (restored) return;
    const vh = window.innerHeight;
    for (const n of veiled) {
      const r = n.getBoundingClientRect();
      if (r.height && r.top >= 0 && r.bottom <= vh && parseFloat(getComputedStyle(n).opacity) < 0.9) { restore(); return; }
    }
  };
  setTimeout(check, 8000);
  window.addEventListener('scrollend', check);
})();
