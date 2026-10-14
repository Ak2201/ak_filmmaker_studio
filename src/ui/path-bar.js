/* ============================================================
   THE PRE-PRODUCTION PATH BAR — the same strip on every tool page
   ------------------------------------------------------------
   preprod.html shows the path one step at a time. The tools the steps
   point at (breakdown, visualize, plan, budget, contacts, stripboard,
   reports) are separate pages, so without this a person who clicked
   through to one lost the path and had to remember where they were.

   mountPathBar(main) puts the numbered strip under the page's header and
   Back / Next at the foot of the page. The step for THIS page (and tab)
   is lit; a done step carries a tick. Each step is a link to its tool.
   The states come from src/lib/preprod-path.js, which derives them and
   stores nothing; this file stores nothing either.

   It re-lights when the tab changes (hashchange) from the steps it
   already read — no model is read twice per page load.
   ============================================================ */
import { h } from '../lib/dom.js';
import { pathSteps, stepForPage, nextStep } from '../lib/preprod-path.js';
import Store from '../lib/store.js';
import { button } from './kit/index.js';
import '../styles/stepper.css';
import '../styles/path-bar.css';

/* production serves clean URLs (/breakdown), the dev server .html */
const file = () => { const p = location.pathname.split('/').pop() || 'index'; return /\.html$/.test(p) ? p : p + '.html'; };
const hrefOf = (s) => (s.id === 'ready' ? 'preprod.html#step-ready' : s.tool.href);

export function mountPathBar(main) {
  if (!main || !Store.currentProject()) return null;
  let steps;
  try { steps = pathSteps(); } catch (e) { return null; }
  if (!steps.length) return null;
  const here = () => stepForPage(steps, file(), location.hash);
  const cur0 = here();
  if (!cur0) return null;

  const list = h('ol.stp-list');
  list.append(h('li', {}, [h('a.stp-tab.pp-all', { href: 'preprod.html', title: 'The whole pre-production path, one step at a time' }, [h('span.stp-n', { text: '◷', 'aria-hidden': 'true' }), h('span.stp-label', { text: 'Path' })])]));
  steps.forEach((s) => {
    list.append(h('li', {}, [h('a.stp-tab', { href: hrefOf(s), 'data-pp-step': s.id, title: s.about },
      [h('span.stp-n', { text: s.state === 'done' ? '✓' : String(s.n), 'aria-label': s.state === 'done' ? 'done' : null }), h('span.stp-label', { text: s.label })])]));
  });
  const bar = h('nav.stp-bar.pp-bar', { 'aria-label': 'Pre-production path' }, [list]);
  const foot = h('div.st-step-nav.stp-nav.pp-foot');

  const paint = () => {
    const cur = here() || cur0;
    const i = steps.findIndex((s) => s.id === cur.id);
    list.querySelectorAll('.stp-tab[data-pp-step]').forEach((a) => {
      const on = a.dataset.ppStep === cur.id;
      a.classList.toggle('is-on', on);
      a.classList.toggle('is-done', steps.find((s) => s.id === a.dataset.ppStep).state === 'done');
      if (on) a.setAttribute('aria-current', 'step'); else a.removeAttribute('aria-current');
    });
    const prev = steps[i - 1], next = steps[i + 1];
    foot.replaceChildren(...[
      prev ? button({ href: hrefOf(prev), label: '← BACK: ' + prev.label.toUpperCase() }) : null,
      h('span.stp-count', { text: 'Step ' + (i + 1) + ' of ' + steps.length + (cur.state === 'done' ? ' · done' : '') }),
      next ? button({ href: hrefOf(next), variant: 'primary', label: 'NEXT: ' + next.label.toUpperCase() + ' →' }) : null
    ].filter(Boolean));
    /* the lit step stays in view in a scrolling strip */
    const on = list.querySelector('.is-on');
    if (on && on.scrollIntoView) { try { on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'instant' }); } catch (e) { /* old engine */ } }
  };
  paint();

  const head = main.querySelector(':scope > header');
  if (head) head.after(bar); else main.prepend(bar);
  main.append(foot);
  /* On a tabbed page a link to a tool lands on the tab strip, with the page's
     header scrolled off above it — so the bar sits directly under the strip
     (tabs.js builds it after this runs), where a landing shows it. */
  const place = () => {
    const t = main.querySelector(':scope > nav.tabs');
    if (t && t.nextElementSibling !== bar) t.after(bar);
  };
  place();
  /* The strip is pinned under the band and the tab strip (stepper.css), so a
     tab's section has to land BELOW it: publish its height, as Story does. */
  main.classList.add('pp-has-bar');
  const measure = () => document.documentElement.style.setProperty('--stp-bar-h', Math.round(bar.getBoundingClientRect().height) + 'px');
  measure();
  try { document.fonts && document.fonts.ready.then(measure); } catch (e) { /* no Font Loading API */ }
  window.addEventListener('resize', measure, { passive: true });
  try { new MutationObserver(place).observe(main, { childList: true }); } catch (e) { /* older engine: it stays under the header */ }
  window.addEventListener('hashchange', paint);
  return { bar, foot, next: nextStep(steps) };
}

export default { mountPathBar };
