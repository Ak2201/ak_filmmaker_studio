/* ============================================================
   PROJECT SETUP — the one way a film gets created.

   A modal sheet: the film's name, and the film you love, which every
   step of the studio then explains itself with. The hub's three doors
   open it, and so does every "new project" control — one creation
   path, so what a project starts with cannot differ by button.

   Creating goes through Store.createProject({title, format, fav, region,
   adopt:true}) and lands on the project home, dashboard.html (the project is open by
   then). The plan's new_projects limit is checked here as well as at
   the callers, because this is the one place that creates.

   Nothing is stored by merely opening it. The film list is derived
   from studies.js; the format list from Store.FORMATS.
   ============================================================ */
import '../styles/project-setup.css';
import { h } from '../lib/dom.js';
import Store from '../lib/store.js';
import PlanGate from '../lib/plan-gate.js';
import { listStudies, favouriteSlug } from '../lib/studies.js';
import { holdFocus, releaseFocus } from './modal-focus.js';
import { chosenRegion } from '../lib/region.js';
import { guessVisitorRegion } from '../lib/region-core.js';

const PROJECT_HOME_URL = 'dashboard.html';

/* Where the film is being made (docs/US-MARKET-PLAN.md §A3). It decides
   the film's paperwork (rupees, A4 and Indian dates, or dollars, US
   Letter and US dates) and whether the India-only material shows. The
   sheet starts on newFilmRegion() (= region.js regionForNewProject()): the device's stated market,
   else the browser's own guess. Changed later on the dashboard. */
/* region.js regionForNewProject(), inlined: the device's stated choice,
   else the VISITOR guess (§A3, §B: guessVisitorRegion, the shop's, so a
   UTC-clocked en-IN browser gets an Indian film and rupee prices alike).
   Not the call itself: a CORE function that another chunk calls is kept
   in CORE with its imports, and regionForNewProject() would make every
   page fetch the `region` chunk (1.6 KB on the Library, which had 269
   bytes to spare under scripts/budget.json on 22 Oct 2026). This file
   and hub.js are lazy, so importing region-core.js here costs no first
   paint. */
export function newFilmRegion() {
  try { return chosenRegion() || guessVisitorRegion(); } catch (e) { return 'IN'; }
}

const REGION_CHOICES = {
  IN:  { label: 'India' },
  INT: { label: 'Elsewhere' }
};

const FORMATS = {
  feature:     { label: 'Feature film', title: 'My feature film' },
  short:       { label: 'Short film',   title: 'My short film' }
};

let overlay = null;
let state = { format: 'feature', region: 'IN', dirty: false };
/* True from the first CREATE until the page leaves: the wait for the
   cloud push below is up to 3s, and a second press in it made a
   second project. */
let busy = false;

function build() {
  const films = listStudies();
  const cards = films.map((f, i) => {
    const m = f.meta;
    return h('label.ps-film.hue-' + (m.hue || 'feature'), { for: 'psFilm_' + m.slug }, [
      h('input', { type: 'radio', name: 'psFilm', id: 'psFilm_' + m.slug, value: m.slug }),
      h('span.ps-film-title', { text: m.title }),
      h('span.ps-film-meta', { text: [m.director, m.year].filter(Boolean).join(' · ') }),
      h('span.ps-film-genre', { text: m.genre || '' })
    ]);
  });

  overlay = h('div#projectSetup.modal-overlay', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'psHeading'
  }, [
    h('form.modal.ps-sheet', { id: 'projectSetupForm', novalidate: 'novalidate' }, [
      h('button.modal-close', { type: 'button', 'data-ps-close': '', title: 'Close', 'aria-label': 'Close', text: '×' }),
      h('h3#psHeading', { text: 'Start your film' }),
      h('p.deck', { text: 'Two quick questions. You can switch between films whenever you like and pick up where you left off.' }),

      h('label', { for: 'psTitle', text: 'Project name' }),
      h('input', { id: 'psTitle', type: 'text', maxlength: '120', required: 'required', autocomplete: 'off' }),
      h('p.ps-error', { id: 'psError', role: 'alert', hidden: 'hidden', text: 'Give your project a name.' }),

      h('fieldset.ps-format', {}, [
        h('legend', { text: 'Format' }),
        h('div.ps-format-row', { role: 'radiogroup', 'aria-label': 'Format' }, Object.keys(FORMATS).map((k) =>
          h('label.ps-format-opt', { for: 'psFormat_' + k }, [
            h('input', { type: 'radio', name: 'psFormat', id: 'psFormat_' + k, value: k }),
            h('span', { text: FORMATS[k].label })
          ])))
      ]),

      h('fieldset.ps-format.ps-region', {}, [
        h('legend', { text: 'Where is this film being made?' }),
        h('div.ps-format-row', { role: 'radiogroup', 'aria-label': 'Where is this film being made?' }, Object.keys(REGION_CHOICES).map((k) =>
          h('label.ps-format-opt', { for: 'psRegion_' + k }, [
            h('input', { type: 'radio', name: 'psRegion', id: 'psRegion_' + k, value: k }),
            h('span', { text: REGION_CHOICES[k].label })
          ]))),
        h('p.ps-hint', { text: 'India keeps rupees, A4 and the India-only checks. Elsewhere uses dollars, US Letter and US dates on the paperwork. You can change it later on the dashboard.' })
      ]),

      h('fieldset.ps-films', {}, [
        h('legend', { text: 'Your favourite film' }),
        h('p.ps-hint', { text: 'Pick one. We’ll explain every step with it, so the ideas land on a film you already know.' }),
        h('div.ps-film-grid', { role: 'radiogroup', 'aria-label': 'Your favourite film' }, cards)
      ]),

      h('div.modal-actions', {}, [
        h('button.mbtn', { type: 'button', 'data-ps-close': '', text: 'Cancel' }),
        h('button.mbtn.primary', { id: 'psSubmit', type: 'submit', text: 'Create and open' })
      ])
    ])
  ]);
  document.body.append(overlay);

  const form = overlay.querySelector('form');
  const title = overlay.querySelector('#psTitle');

  title.addEventListener('input', () => { state.dirty = true; overlay.querySelector('#psError').hidden = true; });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target.closest && e.target.closest('[data-ps-close]'))) close();
  });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
  form.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'psRegion') { state.region = REGION_CHOICES[e.target.value] ? e.target.value : state.region; return; }
    if (!e.target || e.target.name !== 'psFormat') return;
    const prev = state.format;
    state.format = e.target.value;
    overlay.querySelector('#psHeading').innerHTML = 'Start your <em>' + FORMATS[state.format].label.toLowerCase() + '.</em>';
    if (!state.dirty || title.value.trim() === FORMATS[prev].title) title.value = FORMATS[state.format].title;
  });
}

function selectedFilm() {
  const r = overlay.querySelector('input[name="psFilm"]:checked');
  return r ? r.value : '';
}

function showError(text) {
  const err = overlay.querySelector('#psError');
  err.textContent = text;
  err.hidden = false;
}

function submit() {
  if (busy) return;
  const title = overlay.querySelector('#psTitle');
  const name = title.value.trim();
  if (!name) {
    showError('Give your project a name.');
    title.focus();
    return;
  }
  if (!PlanGate.allowed('new_projects')) { close(); return; }
  busy = true;
  const btn = overlay.querySelector('#psSubmit');
  if (btn) btn.disabled = true;
  const fav = selectedFilm();
  const p = Store.createProject({ title: name, format: state.format, fav: fav || undefined, region: state.region, adopt: true });
  if (!p) {
    busy = false;
    if (btn) btn.disabled = false;
    showError('The project could not be created. Try again.');
    return;
  }
  /* Signed in, the new project's cloud push is in flight: give it a
     moment so a plan-limit refusal is heard (cloud.js carries it to
     the project home), then go. Signed out, settle() resolves at once. */
  const C = window.StudioCloud;
  const wait = C && typeof C.settle === 'function' ? C.settle(3000) : Promise.resolve();
  wait.then(() => { location.href = PROJECT_HOME_URL; }, () => { location.href = PROJECT_HOME_URL; });
}

/** Open the sheet. `format` is the door that was chosen. */
export function openProjectSetup(opts) {
  opts = opts || {};
  if (!PlanGate.allowed('new_projects')) return false;
  if (!overlay) build();
  const reg = newFilmRegion();
  state = { format: FORMATS[opts.format] ? opts.format : 'feature', region: REGION_CHOICES[reg] ? reg : 'IN', dirty: false };
  overlay.querySelector('#psTitle').value = FORMATS[state.format].title;
  overlay.querySelector('#psHeading').innerHTML = 'Start your <em>' + FORMATS[state.format].label.toLowerCase() + '.</em>';
  overlay.querySelector('#psError').hidden = true;
  busy = false;
  { const btn = overlay.querySelector('#psSubmit'); if (btn) btn.disabled = false; }
  const fr = overlay.querySelector('#psFormat_' + state.format);
  if (fr) fr.checked = true;
  const rr = overlay.querySelector('#psRegion_' + state.region);
  if (rr) rr.checked = true;
  let fav = '';
  try { fav = favouriteSlug(); } catch (e) { /* the first film below */ }
  const radios = Array.from(overlay.querySelectorAll('input[name="psFilm"]'));
  const pick = radios.find((r) => r.value === fav) || radios[0];
  if (pick) pick.checked = true;
  overlay.classList.add('show');
  holdFocus(overlay);
  setTimeout(() => { const t = overlay.querySelector('#psTitle'); t.focus(); t.select(); }, 50);
  return true;
}

export function closeProjectSetup() { close(); }
function close() {
  if (!overlay) return;
  overlay.classList.remove('show');
  releaseFocus(overlay);
}

export default { openProjectSetup, closeProjectSetup };
