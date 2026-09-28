/* ============================================================
   DEMO SELECTOR — which film the workspace is speaking in
   ------------------------------------------------------------
   The whole case-study page hangs off one choice, so the control
   for it is not a dropdown tucked into a toolbar. It is a band of
   tabs, sticky under the phase bar, showing every film the build
   ships with its year and its director.

   Three things it deliberately does:

   1. It is a SEGMENTED CONTROL, not a <select>. Four options that
      each carry three lines of identity do not fit in a listbox,
      and the selected one has to stay readable while you scroll —
      that is the point of it being sticky.

   2. It tells the truth about coverage. A film whose study is not
      finished carries a flag, using the same PARTIAL / SOON words
      the shell's module rows use. Discovering after three clicks
      that a film has nothing written is worse than being told.

   3. It knows nothing about the page. Clicking calls selectDemo()
      and stops; studies.js broadcasts and every subscriber redraws
      itself. That is why this file can be mounted anywhere.

   No inline handlers — a strict CSP ships. One delegated listener,
   bound once at import time, for however many selectors exist.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { listStudies, currentSlug, selectDemo, validate } from '../lib/studies.js';

export const PICK_ACTION = 'demo-pick';

/* How finished is this study? The flag vocabulary is the shell's, so
   an unfinished film reads the same here as an unbuilt module does
   in the phase menus. */
function coverage(study) {
  const gaps = validate(study);
  if (!gaps.length) return null;
  const hasAny = Boolean(
    (study.concept && study.concept.premise) ||
    (study.beats || []).length ||
    (study.scenes || []).length ||
    (study.characters || []).length
  );
  return hasAny ? 'PARTIAL' : 'SOON';
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-action="' + PICK_ACTION + '"]', (e, el) => {
    const slug = el.getAttribute('data-slug');
    // Re-selecting the open film would write localStorage and redraw
    // the page to produce the identical page. Nothing to do.
    if (!slug || slug === currentSlug()) return;
    selectDemo(slug);
  });
}

/**
 * Build the selector.
 *
 * @param {Object} [options]
 * @param {string} [options.label] the mono eyebrow above the tabs
 * @param {string} [options.note]  one muted line under them
 * @returns {HTMLElement}
 */
export function renderDemoSelector(options) {
  const opts = options || {};
  wire();

  const films = listStudies();
  const active = currentSlug();

  const bar = h('section.ds-bar', { 'aria-label': 'Demo film' });
  const inner = h('div.ds-inner');

  inner.append(h('p.bd-eyebrow.ds-label', {
    text: opts.label || 'Demo film · the whole workspace follows this choice'
  }));

  const tabs = h('div.ds-tabs', { role: 'group', 'aria-label': 'Choose the demo film' });
  for (const film of films) {
    const meta = film.meta || {};
    const on = meta.slug === active;
    const flag = coverage(film);
    const tab = h('button.ds-tab.hue-' + (meta.hue || 'feature') + (on ? '.is-on' : ''), {
      type: 'button',
      'data-action': PICK_ACTION,
      'data-slug': meta.slug,
      'aria-pressed': on ? 'true' : 'false'
    });
    tab.append(
      h('span.ds-tab-title', { text: meta.title || meta.slug }),
      h('span.ds-tab-meta', {
        text: [meta.year, meta.director].filter(Boolean).join(' · ')
      })
    );
    if (meta.genre) tab.append(h('span.ds-tab-genre', { text: meta.genre }));
    if (flag) {
      tab.append(h('span.ds-tab-flag', {
        text: flag,
        title: flag === 'SOON'
          ? 'This study has not been written yet'
          : 'This study is partly written'
      }));
    }
    tabs.append(tab);
  }
  inner.append(tabs);

  if (opts.note !== false) {
    inner.append(h('p.ds-note', {
      text: opts.note
        || 'A reading preference, not a project setting — kept on this device, never synced.'
    }));
  }

  bar.append(inner);
  return bar;
}

export default { renderDemoSelector, PICK_ACTION };
