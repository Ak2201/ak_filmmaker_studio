/* ============================================================
   HUB — the first-run panel, the free tier's sample-only panel, and
   the two figures the hub quotes about the sample.
   Moved out of hub.js in the split of 7 Oct 2026, behaviour unchanged.

   READ IT IN A BROWSER. The text and data-key capture in verify runs
   after createProject(), which replaces this panel with the project
   grid, so nothing here is in baseline.json and no edit here can
   produce a missing word (CLAUDE.md, "Only its WIDTH is measured").
   The module count is DERIVED — BUILT_MODULE_COUNT from the launcher —
   because the hand-written number was wrong twice.
   ============================================================ */
import { h } from '../../lib/dom.js';
import { BUILT_MODULE_COUNT } from '../../ui/launcher.js';
import { sampleFigures } from '../../lib/sample-figures.js';
import sample from '../../data/sample.dragon.json';

const SAMPLE_TITLE = sample.title;

/* The figures the hub quotes about the sample, derived from the scene
   rows so the prose cannot drift from the board. ONE derivation,
   sampleFigures() in src/lib/sample-figures.js, which the build also
   uses to stamp start.html's copy of the same numbers. Function
   declarations, because the "where to start" markup is built before
   this section in source order and reads them. */
function sampleDays() { return sampleFigures(sample).days; }

function samplePages() { return sampleFigures(sample).pages; }

/* ------------------------------------------------------------
   FIRST RUN — what a stranger sees before anything is saved.

   Three jobs, in this order: say what the studio is in one line,
   let them look at something real without committing, and only then
   ask for a project. The ask used to come first, as a modal, which
   is why it is now the last thing on the panel rather than the first
   thing on the screen.
   ------------------------------------------------------------ */

const TOUR = [
  { href: 'library.html', label: 'Craft library',  note: 'Rules, directors, rates — no project needed' },
  { href: 'library.html#case-studies', label: 'Case studies',   note: 'Four films, beat by beat' },
  { href: 'library.html#dissection', label: 'Dissection',     note: 'A feature taken apart sequence by sequence' }
];

function renderFirstRun() {
  const panel = h('div.empty-projects-state', {}, [
    h('div.eps-icon', { text: '🎬', 'aria-hidden': 'true' }),
    h('div.eps-title', { text: 'A blank desk.' }),
    // DERIVED, not written. This sentence said "Twenty-two" while
    // navigation.json held twenty-four, one line away from the launcher's
    // own correct reduce over the same file — the hand-written list
    // invariant 2 exists to stop. A digit rather than a spelled word on
    // purpose: the alternative is a number-to-words helper for one
    // caller, and this panel already prints a derived digit further
    // down ("a feature, 36 scenes").
    //
    // The BUILT count, not the total. This is a promise, made to
    // somebody who has not committed anything yet, with no qualifier
    // beside it — so it has to be what they can open today, not what
    // the map lists. The launcher may quote the total because it
    // prints "N OF M BUILT" right next to it; this cannot.
    h('div.eps-deck', {
      text: BUILT_MODULE_COUNT + ' modules for writing, planning and shooting a film — '
          + 'script to call sheet. Everything you write stays in this browser '
          + 'unless you sign in.'
    })
  ]);

  const tour = h('div.eps-tour');
  tour.append(h('div.eps-tour-head', { text: 'Have a look around first' }));
  TOUR.forEach((t) => {
    const a = h('a.eps-tour-item', { href: t.href });
    a.append(h('span.eps-tour-label', { text: t.label }),
             h('span.eps-tour-note', { text: t.note }));
    tour.append(a);
  });
  panel.append(tour);

  /* The sample FIRST, and primary. A first-time filmmaker cannot judge
     an empty studio; the filled one is the thing to look at before
     being asked to name a film. Every action that was here is still
     here — only the order and the emphasis moved. */
  panel.append(h('div.eps-actions', {}, [
    h('button.btn.primary', { 'data-action': 'sample-project', text: 'OPEN THE SAMPLE FILM (' + SAMPLE_TITLE + ')' }),
    h('button.btn', { 'data-action': 'new-project', text: '+ CREATE FIRST PROJECT' })
  ]));
  panel.append(h('div.eps-fine', {
    text: 'The sample is a real project you can edit or delete — it just arrives with a few '
        + 'hundred fields filled in: a feature, ' + samplePages() + ' pages of script, the '
        + sample.scenes.length + ' scenes broken down from them, a crew and a budget, '
        + 'so every module has something to show.'
  }));
  return panel;
}

/* The free tier's hub: the sample, and the way up. */
function renderSampleOnly() {
  return h('div.empty-projects-state', {}, [
    h('div.eps-title', { text: 'Open the ' + SAMPLE_TITLE + ' sample.' }),
    h('div.eps-deck', { text: 'Your plan opens the sample project — ' + sample.scenes.length + ' scenes, a crew, a budget and a schedule to explore in every module. A paid plan adds films of your own.' }),
    h('div.iv-actions', {}, [
      h('button.btn.primary', { 'data-action': 'sample-project', text: 'OPEN THE SAMPLE' }),
      h('a.btn', { href: 'settings.html#plan', text: 'SEE PLANS' })
    ])
  ]);
}

export { renderFirstRun, renderSampleOnly, sampleDays, samplePages };
