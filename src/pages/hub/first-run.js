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
import { sampleFigures } from '../../lib/sample-figures.js';
import { SAMPLES } from '../../lib/samples.js';
import dragonData from '../../data/sample.dragon.json';
import films from '../../data/films.json';
import directors from '../../data/directors.json';
import rules from '../../data/rules.json';
import PlanGate from '../../lib/plan-gate.js';
import Store from '../../lib/store.js';


/* The figures the hub quotes about the sample, derived from the scene
   rows so the prose cannot drift from the board. ONE derivation,
   sampleFigures() in src/lib/sample-figures.js, which the build also
   uses to stamp start.html's copy of the same numbers. Function
   declarations, because the "where to start" markup is built before
   this section in source order and reads them. */
function sampleDays(data = dragonData) { return sampleFigures(data).days; }

function samplePages(data = dragonData) { return sampleFigures(data).pages; }

/* One button per registered sample; labels come from the registry. */
function sampleButtons(prefix, primary) {
  return SAMPLES.map((sm, i) => h('button.k-btn' + (primary && i === 0 ? '.k-btn--primary' : '.k-btn--secondary'), {
    type: 'button', 'data-action': 'sample-project', 'data-sample': sm.id,
    title: sm.blurb, text: prefix + sm.label
  }));
}

/* ------------------------------------------------------------
   FIRST RUN — what a stranger sees before anything is saved.

   Three jobs, in this order: say what the studio is in one line,
   let them look at something real without committing, and only then
   ask for a project. The ask used to come first, as a modal, which
   is why it is now the last thing on the panel rather than the first
   thing on the screen.
   ------------------------------------------------------------ */

/* THE THREE DOORS, in the hero, when there is no project. Moved here
   from hub.js's old #doors section (owner, 11 Oct 2026: "if there is no
   project let have three doors, pick a path"). Same classes, same
   data-actions, so hub-doors.css and the delegate need no change. */
function renderFirstRun() {
  const panel = h('div#doors.first-run-doors');
  panel.append(h('div.fr-pick', {}, [
    h('div.lab', { text: 'PICK A PATH' }),
    h('p.deck', { text: 'New to filmmaking? That is fine. Choose what you want to do first. We will ask for a name and a favourite film, then open your script, with the rest of your project one step away.' })
  ]));
  const doors = h('div.doors', {}, [
    h('div.door', {}, [
      h('div.door-tag', {}, [h('span.door-num-circle', { text: 'I' }), ' A FULL-LENGTH STORY']),
      h('h3', {}, ['Feature', h('br'), h('span.light', { text: 'film.' })]),
      h('p.door-sub', { text: 'A story you tell over an hour or more. We walk you from the first spark to the finished film, one stage at a time.' }),
      h('button.door-cta', { type: 'button', 'data-action': 'start-feature' }, [h('span', { text: 'START A FEATURE' }), h('span.arrow', { text: '→' })])
    ]),
    h('div.door.shorts', {}, [
      h('div.door-tag', {}, [h('span.door-num-circle', { text: 'II' }), ' UNDER 30 MINUTES']),
      h('h3', {}, ['Short', h('br'), h('span.light', { text: 'film.' })]),
      h('p.door-sub', { text: 'The quickest way to make something real. A tighter story, a smaller crew, a film you can finish and show.' }),
      h('button.door-cta', { type: 'button', 'data-action': 'start-short' }, [h('span', { text: 'START A SHORT' }), h('span.arrow', { text: '→' })])
    ]),
    h('div.door.library', {}, [
      h('div.door-tag', {}, [h('span.door-num-circle', { text: 'III' }), ' LEARN FIRST']),
      h('h3', {}, ['Learning', h('br'), h('span.light', { text: 'library.' })]),
      h('p.door-sub', { text: 'Not ready to start? Read how films you know were built: ' + films.length + ' films, ' + directors.length + ' directors and ' + rules.length + ' rules of thumb. No project needed.' }),
      h('a.door-cta', { href: 'library.html' }, [h('span', { text: 'OPEN THE LIBRARY' }), h('span.arrow', { text: '→' })])
    ])
  ]);
  panel.append(doors);
  /* The library door always shows (owner, 19 Oct 2026): the films,
     directors, rules, rates and watch list are not modules, so the three
     module shelves being off does not empty the Library. */
  /* The sample is the secondary way in: a filled studio to look at
     before being asked to name a film. */
  panel.append(h('div.eps-actions', {}, sampleButtons('Or open a sample film: ', false)));
  panel.append(h('div.eps-fine', {
    text: 'A sample is a real project you can edit or delete: a feature, its pages of script (Dragon has ' + samplePages()
        + '), the ' + dragonData.scenes.length + ' scenes broken down from them, a crew and a budget. '
        + 'Everything you write stays in this browser unless you sign in.'
  }));
  return panel;
}

/* The welcome card after a purchase (?welcome=plan, from invite.html or
   settings). The parameter is consumed; nothing is stored, so it shows
   once per purchase by construction. */
export function welcomeCard() {
  let params;
  try { params = new URLSearchParams(location.search); } catch (e) { return null; }
  if (params.get('welcome') !== 'plan') return null;
  params.delete('welcome');
  const q = params.toString();
  try { history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash); } catch (e) { /* ignore */ }
  const cur = PlanGate.currentPlan();
  const name = cur && cur.planName && cur.plan !== 'free' ? cur.planName : '';
  const card = h('section.section.tw-section#welcomePlan', { role: 'status', 'aria-label': 'Welcome' }, [
    h('div.section-inner', {}, [
      h('h2', { text: name ? 'You’re on ' + name + '. Welcome in.' : 'Welcome in.' }),
      h('p.deck', { text: 'Your plan is active for a year. Your invoice, and the date it ends, are on the Purchase page.' }),
      h('div.eps-actions', {}, [
        h('button.k-btn.k-btn--primary', { type: 'button', 'data-action': 'new-project', text: 'Start your film' }),
        h('a.k-btn.k-btn--secondary', { href: 'purchase.html', text: 'See what unlocked' }),
        h('button.k-btn.k-btn--secondary', { type: 'button', 'data-fr-action': 'dismiss-welcome', text: 'Dismiss' })
      ])
    ])
  ]);
  return card;
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-fr-action="dismiss-welcome"]');
  if (b) { const c = document.getElementById('welcomePlan'); if (c) c.remove(); }
});

/* The free trial's hub: the sample, and the way up. There is no free
   PLAN (owner, 11 Oct 2026), so it does not call this one. */
function renderSampleOnly() {
  const see = h('a.k-btn.k-btn--secondary', { href: 'purchase.html', text: 'See plans' });
  /* The way up, named and priced once the plan rows answer. */
  PlanGate.offerFor(['new_projects']).then((o) => {
    if (!o) return;
    see.href = o.href;
    see.textContent = 'Own film: ' + PlanGate.offerText(o);
  }).catch(() => { /* "See plans" stands */ });
  return h('div.empty-projects-state', {}, [
    h('div.eps-title', { text: 'Open a sample film.' }),
    h('div.eps-deck', { text: 'Your free trial opens the sample projects — scenes, a crew, a budget and a schedule to explore in every module. A plan adds films of your own.' }),
    h('div.iv-actions', {}, [
      ...sampleButtons('Open ', true),
      see
    ])
  ]);
}

export { renderFirstRun, renderSampleOnly, sampleDays, samplePages };
