/* ============================================================
   HUB — the project grid: filters, the cards, the empty states, the
   device-projects adoption panel, and the plan's say over the
   controls. Moved out of hub.js in the split of 7 Oct 2026, behaviour
   unchanged; every data-action and id is the one the proofs drive.

   The filter state lives here and is changed through three setters,
   because the hub's event wiring is the thing that hears the inputs.
   adoptDeviceProjectsNow() stays on hub.js: it re-renders the
   switcher, the status and the greeting, which are the page's.
   ============================================================ */
import Store from '../../lib/store.js';
import PlanGate from '../../lib/plan-gate.js';
import { STAGES, journey, guideJourney } from '../../lib/journey.js';
import { h } from '../../lib/dom.js';
import sample from '../../data/sample.dragon.json';
import { FEATURE_KEY, SHORT_KEY, DASHBOARD_URL, FORMAT_LABELS, fmtRelDate, $ } from './util.js';
import { renderFirstRun, renderSampleOnly } from './first-run.js';

const SAMPLE_TITLE = sample.title;

let projectFilter = 'all';
let projectSort = 'recent';
let projectSearchTerm = '';
export function setProjectFilter(v) { projectFilter = v; }
export function setProjectSearch(v) { projectSearchTerm = v; }
export function setProjectSort(v) { projectSort = v; }

function applyProjectFilters(projects) {
  let arr = projects.slice();
  if (projectFilter !== 'all') arr = arr.filter(p => p.format === projectFilter);
  if (projectSearchTerm) {
    arr = arr.filter(p => (p.title || '').toLowerCase().indexOf(projectSearchTerm) >= 0);
  }
  if (projectSort === 'alpha') {
    arr.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  } else if (projectSort === 'oldest') {
    arr.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || ''));
  } else {
    arr.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  }
  return arr;
}

/* A project's blueprint blob, by its format, bypassing the proxy —
   the cards speak about projects that are not open. */
function projectBlob(p) {
  try {
    const key = (p.format === 'short' ? SHORT_KEY : FEATURE_KEY) + '__' + p.id;
    const data = JSON.parse(Store.rawGet(key) || '{}');
    return data && typeof data === 'object' ? data : {};
  } catch (e) { return {}; }
}

/* Progress and stage for a card, from journey.js. The percentage used
   to be filled keys over SAVED keys — the trap blueprint-fields.js is
   named for, where eleven saved fields read 100% — and the label a
   band of that percentage ("PRE-PROD" at 50–79%) that knew nothing
   about the film. Now: the declared-field percentage, and the stage.
   The OPEN project gets the full journey (guide and tools, read through
   the proxy); any other project gets the guide's reading of its blob,
   because its tools live under another id. */
function projectStatus(p, active, openJourney) {
  const g = guideJourney(p.format, projectBlob(p));
  if (active && openJourney) {
    return {
      pct: g.pct,
      label: openJourney.complete ? 'ALL ' + STAGES.length + ' STAGES'
                                  : openJourney.currentLabel.toUpperCase()
    };
  }
  return { pct: g.pct, label: g.started ? g.currentLabel.toUpperCase() : 'EMPTY' };
}

function projectCard(p, currentId, openJourney) {
  const active = p.id === currentId;
  const status = projectStatus(p, active, openJourney);
  const pct = status.pct;
  const card = h('div', {
    class: 'project-card' + (active ? ' active' : '') + ' format-' + p.format,
    tabindex: '0', role: 'button',
    'data-action': 'switch-project', 'data-id': p.id,
    'aria-label': 'Switch to project ' + p.title
  }, [
    h('div.pc-actions', {}, [
      h('button', { 'data-action': 'rename-project', 'data-id': p.id, 'aria-label': 'Rename project', title: 'Rename', text: '✎' }),
      h('button', { 'data-action': 'duplicate-project', 'data-id': p.id, 'aria-label': 'Duplicate project', title: 'Duplicate', text: '⎘' }),
      h('button', { 'data-action': 'delete-project', 'data-id': p.id, 'aria-label': 'Delete project', title: 'Delete', text: '×' })
    ]),
    h('div.pc-format', {
      text: (FORMAT_LABELS[p.format] || String(p.format).toUpperCase()) +
            (active ? ' · ACTIVE' : '') + ' · ' + status.label
    }),
    h('div.pc-title', { title: 'Double-click to rename', 'data-dblaction': 'rename-project', 'data-id': p.id, text: p.title }),
    /* SHARE and OPEN sit IN the meta row, not over it. Share was
       absolutely placed at the card's bottom-right, which is exactly
       where "open →" ends, so hovering a card covered the one word
       that said what clicking does. And "open →" was a span: clicking
       it only switched the project, which left you on the hub. It is
       a link now, to the project's dashboard, switching first. */
    h('div.pc-meta', {}, [
      h('span.pc-stat', { text: pct + '% · edited ' + fmtRelDate(p.updatedAt) }),
      h('span.pc-foot', {}, [
        h('button.pc-share', { type: 'button', 'data-action': 'share-project', 'data-id': p.id, 'aria-label': 'Share project', title: 'Share', text: '↗ SHARE' }),
        h('a.pc-open', {
          href: DASHBOARD_URL, 'data-action': 'open-project', 'data-id': p.id,
          'aria-label': 'Open ' + p.title + ' on its dashboard', text: 'open →'
        })
      ])
    ])
  ]);
  return card;
}

/* ------------------------------------------------------------
   DEVICE PROJECTS, INSIDE AN ACCOUNT — the standing control.

   cloud.js offers this ONCE, on a first sign-in. A one-shot offer is
   not a control: dismiss it, or write a film next month while signed
   out, and there was no way left in the whole app to bring that work
   into the account. This panel is the way, and it is deliberately NOT
   dismissible — it is answered by acting, and it takes itself off the
   page the moment `listAdoptableProjects()` comes back empty.

   THE GATE IS THE STORE'S ANSWER, never a page-local copy of it.
   `listAdoptableProjects()` returns [] in the device namespace, so
   "is somebody signed in" and "is there anything to bring in" are one
   question, asked once, of the only file that knows. A page-local
   mirror of "am I signed in" is exactly what goes stale — the AI key
   bar stopped keeping one for this reason.

   THE WORDING IS LOAD-BEARING. An earlier version of this flow said
   UPLOAD ALL. Both halves of that were wrong: nothing is uploaded
   (membership is a local `ns` field — the server is not involved) and
   nothing moves. `adoptDeviceProjects()` ADDS the account to each
   entry's `ns`, so there is ONE copy of the data listed in TWO
   namespaces, and signing out still finds it. "Move" and "upload"
   both promise something the storage model does not do, and a backup
   that turned out to hold one film is what this studio's history says
   those promises cost.
   ------------------------------------------------------------ */

/** Who the projects would become reachable as. The account id lives in
    `fms_studio_account_v1`, but the id is not a thing a person
    recognises, so the email comes off the live session and "this
    account" is the honest fallback when it cannot be read. */
function adoptAccountLabel() {
  try {
    const email = window.StudioCloud && StudioCloud.getUserEmail && StudioCloud.getUserEmail();
    return email || 'this account';
  } catch (e) { return 'this account'; }
}

function renderAdoptNotice() {
  const host = $('#adoptNotice');
  if (!host) return;

  const adoptable = Store.listAdoptableProjects();
  host.textContent = '';
  host.hidden = adoptable.length === 0;
  if (!adoptable.length) return;

  const n   = adoptable.length;
  const one = n === 1;

  const panel = h('div.adopt-panel', {
    role: 'region', 'aria-label': 'Projects on this device only'
  }, [
    h('div.adopt-eyebrow', { text: 'ON THIS DEVICE ONLY' }),
    h('div.adopt-title', {
      text: one
        ? 'One project is on this device and not in this account.'
        : n + ' projects are on this device and not in this account.'
    }),
    h('p.adopt-deck', {
      text: 'Nothing is copied and nothing is taken away. '
          + (one ? 'It stays' : 'They stay') + ' on this device, in this browser, exactly where '
          + (one ? 'it is' : 'they are') + ' — and also become reachable while you are signed in as '
          + adoptAccountLabel() + '. One copy of the work, listed in both places: sign out and '
          + (one ? 'it is' : 'they are') + ' still here.'
    })
  ]);

  /* REQUIREMENT, not decoration: say which films, by name, BEFORE
     doing it. "3 projects" is a number somebody has to trust; three
     titles are a number they can check. */
  panel.append(h('div.adopt-affects', {
    text: one ? 'This affects one project:' : 'This affects all ' + n + ' of them:'
  }));
  const list = h('ul.adopt-list');
  adoptable.forEach((p) => list.append(h('li.adopt-item', {}, [
    h('span.adopt-name', { text: p.title }),
    h('span.adopt-fmt',  { text: FORMAT_LABELS[p.format] || String(p.format).toUpperCase() })
  ])));
  panel.append(list);

  panel.append(h('div.adopt-actions', {}, [
    h('button.btn.primary', {
      'data-action': 'adopt-device-projects',
      text: one ? 'ADD IT TO THIS ACCOUNT' : 'ADD ALL ' + n + ' TO THIS ACCOUNT'
    })
  ]));
  panel.append(h('div.adopt-fine', {
    text: 'A film can belong to this device and to one account. To put one into a '
        + 'different account, download a backup here and import it there.'
  }));

  host.append(panel);
}

function renderProjects() {
  const grid = $('#projectsGrid');
  const toolbar = $('#projectsToolbar');
  /* One call site, so every path that already re-renders the grid —
     projects:changed, current:changed, a cross-tab storage event,
     adoption itself — refreshes the panel too, and none of them has
     to know it exists. */
  renderAdoptNotice();
  if (!grid) return;
  const sampleOnly = PlanGate.sampleOnly();
  const projects  = sampleOnly ? Store.listProjects().filter((p) => p.title === SAMPLE_TITLE) : Store.listProjects();
  const currentId = Store.currentProjectId();

  if (toolbar) toolbar.hidden = projects.length < 2;

  grid.textContent = '';
  applyPlanToControls();

  if (projects.length === 0) {
    grid.append(sampleOnly ? renderSampleOnly() : renderFirstRun());
    return;
  }

  const filtered = applyProjectFilters(projects);

  if (filtered.length === 0) {
    grid.append(h('div.empty-projects-state', {}, [
      h('div.eps-title', { text: 'No projects match.' }),
      h('div.eps-deck', { text: 'Try a different filter or clear your search.' }),
      h('button.btn', { 'data-action': 'reset-project-filters', text: 'RESET FILTERS' })
    ]));
    return;
  }

  // The open project's journey, once per render, for its card's stage.
  const cur = currentId ? Store.currentProject() : null;
  const openJourney = cur ? journey(cur) : null;
  filtered.forEach(p => grid.append(projectCard(p, currentId, openJourney)));
  if (PlanGate.allowed('new_projects')) {
    grid.append(h('div.project-card.new-card', {
      tabindex: '0', role: 'button', 'data-action': 'new-project', 'aria-label': 'Create new project'
    }, [
      h('div.pc-plus', { 'aria-hidden': 'true', text: '+' }),
      h('div.pc-cta', { text: 'NEW PROJECT' })
    ]));
  } else if (sampleOnly) {
    grid.append(h('p.pc-plan-note', { text: 'Your plan opens the sample project. A paid plan adds films of your own.' }));
  }
}

/* Every way of making a project, hidden together or shown together:
   the head button, the backups menu's import, the tool cards. Hidden,
   not removed — the controls are markup the verify gate counts. */
function applyPlanToControls() {
  const can = PlanGate.allowed('new_projects');
  document.querySelectorAll('[data-action="new-project"], [data-action="import-all"], [data-action="duplicate-project"]').forEach((el) => {
    if (el.classList.contains('new-card')) return;   // drawn conditionally above
    el.hidden = !can;
  });
}

function resetProjectFilters() {
  projectFilter = 'all';
  projectSearchTerm = '';
  projectSort = 'recent';
  document.querySelectorAll('#projectsFilter button').forEach(b =>
    b.classList.toggle('active', b.dataset.fmt === 'all'));
  const search = $('#projectsSearch'); if (search) search.value = '';
  const sort = $('#projectsSort');     if (sort) sort.value = 'recent';
  renderProjects();
}

export { applyProjectFilters, projectBlob, projectStatus, projectCard, adoptAccountLabel, renderAdoptNotice, renderProjects, applyPlanToControls, resetProjectFilters };
