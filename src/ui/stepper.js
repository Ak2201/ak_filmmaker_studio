/* ============================================================
   STEPPER — one step of a long page at a time
   ------------------------------------------------------------
   A page that is a row of sections (the Story path, a stage's
   blueprint questions) shows ONE of them, with a numbered step bar
   above and Back / Next below, so scrolling stays inside the step.

   Nothing here knows a page. The caller hands over its panels
   (`{ id, label, el }`, derived from what it already rendered) and
   this file:

     showOnly(panels, id)     hides every other panel with the `hidden`
                              attribute — never removes one, so every
                              data-key stays in the DOM
     stepBar(panels, id, o)   a generic numbered bar (buttons carrying
                              data-stepper-go); a page with its own bar
                              (Story) skips it
     stepFooter(panels, id)   Back / Next, sequential
     wireStepper(root, go)    one delegated click handler for both
     scrollToTop(el)          lands on a step's top, instantly — the
                              stylesheet's smooth scroll would leave the
                              reader short on a page that changes height

   It writes nothing to storage: the step lives in the caller's memory
   (and the address bar, through history.replaceState).
   ============================================================ */
import { h } from '../lib/dom.js';
import '../styles/stepper.css';

const idx = (panels, id) => panels.findIndex((p) => p.id === id);

export function showOnly(panels, id) {
  for (const p of panels) { if (p.el) p.el.hidden = p.id !== id; }
}

export function stepFooter(panels, id) {
  const i = idx(panels, id);
  if (i < 0) return null;
  const prev = panels[i - 1], next = panels[i + 1];
  if (!prev && !next) return null;
  const go = (p, text, cls) => h('button.btn' + cls, { type: 'button', 'data-stepper-go': p.id, text });
  return h('div.st-step-nav.stp-nav', {}, [
    prev ? go(prev, '← BACK: ' + String(prev.label).toUpperCase(), '') : null,
    h('span.stp-count', { text: 'Step ' + (i + 1) + ' of ' + panels.length }),
    next ? go(next, 'NEXT: ' + String(next.label).toUpperCase() + ' →', '.primary') : null
  ].filter(Boolean));
}

/* `num(p, i)` is what the circle says (default: the position); '' draws
   no circle. `title(p)` is the full name, for the tooltip. */
export function stepBar(panels, id, { label = 'Steps', done = () => false, num = (p, i) => String(i + 1), title = null } = {}) {
  const ol = h('ol.stp-list');
  panels.forEach((p, i) => {
    const on = p.id === id, d = !!done(p);
    const n = num(p, i);
    ol.append(h('li', {}, [h('button.stp-tab' + (on ? '.is-on' : '') + (d ? '.is-done' : ''), {
      type: 'button', 'data-stepper-go': p.id, 'aria-current': on ? 'step' : null,
      title: title ? title(p) || null : null
    }, [
      d && !on ? h('span.stp-n', { text: '✓', 'aria-label': 'done' }) : (n ? h('span.stp-n', { text: n }) : null),
      h('span.stp-label', { text: p.label })
    ].filter(Boolean))]));
  });
  return h('nav.stp-bar', { 'aria-label': label }, [ol]);
}

export function wireStepper(root, go) {
  root.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-stepper-go]');
    if (b && root.contains(b)) go(b.getAttribute('data-stepper-go'));
  });
}

export function scrollToTop(el) {
  if (el) el.scrollIntoView({ block: 'start', behavior: 'instant' });
}

/* Landing on a step, the one way every stepped page does it. The bar
   stays in view: where it is pinned (stepper.css / story.css, wide
   screens) the step lands just under it — its height is published as
   --stp-bar-h for the steps' scroll-margin — and where it scrolls with
   the page (a phone) the landing is the bar itself. Landed again once
   the step has laid out (questions, examples and fonts arrive after the
   first scroll and pushed a phone landing mid-step), unless the reader
   has taken over in the meantime. `exact` lands on `el` whatever the bar
   does (a fragment inside a step). Timers, not only rAF: a hidden tab
   runs no frames. */
let landLive = 0;
if (typeof addEventListener === 'function') {
  ['wheel', 'touchstart', 'keydown', 'pointerdown'].forEach((t) => addEventListener(t, () => { landLive = 0; }, { passive: true, capture: true }));
}
export function landUnder(el, bar, { exact = false } = {}) {
  if (!el) return;
  const pinned = !!bar && bar.isConnected && !bar.hidden && getComputedStyle(bar).position === 'sticky';
  if (pinned) document.documentElement.style.setProperty('--stp-bar-h', Math.round(bar.getBoundingClientRect().height) + 'px');
  const target = exact || pinned || !bar || bar.hidden ? el : bar;
  const go = () => target.scrollIntoView({ block: 'start', behavior: 'instant' });
  const mine = ++landLive;
  go();
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => { if (landLive === mine) go(); });
  setTimeout(() => { if (landLive === mine) go(); }, 450);
}

export default { showOnly, stepFooter, stepBar, wireStepper, scrollToTop, landUnder };
