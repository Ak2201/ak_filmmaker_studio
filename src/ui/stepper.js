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

export function stepBar(panels, id, { label = 'Steps', done = () => false } = {}) {
  const ol = h('ol.stp-list');
  panels.forEach((p, i) => {
    const on = p.id === id, d = !!done(p);
    ol.append(h('li', {}, [h('button.stp-tab' + (on ? '.is-on' : '') + (d ? '.is-done' : ''), {
      type: 'button', 'data-stepper-go': p.id, 'aria-current': on ? 'step' : null
    }, [
      h('span.stp-n', { text: d && !on ? '✓' : String(i + 1) }),
      h('span.stp-label', { text: p.label })
    ])]));
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

export default { showOnly, stepFooter, stepBar, wireStepper, scrollToTop };
