/* ============================================================
   PROJECT SETUP — the one way a film gets created.

   A modal sheet: the film's name, and the film you love, which every
   step of the studio then explains itself with. The hub's three doors
   open it, and so does every "new project" control — one creation
   path, so what a project starts with cannot differ by button.

   Creating goes through Store.createProject({title, format, fav,
   adopt:true}) and lands on the dashboard (the project is open by
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

const DASHBOARD_URL = 'dashboard.html';

const FORMATS = {
  feature:     { label: 'Feature film', title: 'My feature film' },
  short:       { label: 'Short film',   title: 'My short film' },
  documentary: { label: 'Documentary',  title: 'My documentary' },
  musicvideo:  { label: 'Music video',  title: 'My music video' },
  adfilm:      { label: 'Ad film',      title: 'My ad film' }
};

let overlay = null;
let state = { format: 'feature', dirty: false };

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
  const formatOpts = Object.keys(FORMATS).map((k) => h('option', { value: k, text: FORMATS[k].label }));

  overlay = h('div#projectSetup.modal-overlay', {
    role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'psHeading'
  }, [
    h('form.modal.ps-sheet', { id: 'projectSetupForm', novalidate: 'novalidate' }, [
      h('button.modal-close', { type: 'button', 'data-ps-close': '', title: 'Close', 'aria-label': 'Close', text: '×' }),
      h('h3#psHeading', { html: 'Start your <em>film.</em>' }),
      h('p.deck', { text: 'Two quick questions. You can switch between films whenever you like and pick up where you left off.' }),

      h('label', { for: 'psTitle', text: 'PROJECT NAME' }),
      h('input', { id: 'psTitle', type: 'text', maxlength: '120', required: 'required', autocomplete: 'off' }),
      h('p.ps-error', { id: 'psError', role: 'alert', hidden: 'hidden', text: 'Give your project a name.' }),

      h('fieldset.ps-films', {}, [
        h('legend', { text: 'YOUR FAVOURITE FILM' }),
        h('p.ps-hint', { text: 'Pick one. We’ll explain every step with it, so the ideas land on a film you already know.' }),
        h('div.ps-film-grid', { role: 'radiogroup', 'aria-label': 'Your favourite film' }, cards)
      ]),

      h('details.ps-more', { id: 'psMore' }, [
        h('summary', { text: 'More formats' }),
        h('p.ps-hint', { text: 'Making a documentary, a music video or an ad film? Choose it here.' }),
        h('label', { for: 'psFormat', text: 'FORMAT' }),
        h('select', { id: 'psFormat' }, formatOpts)
      ]),

      h('div.modal-actions', {}, [
        h('button.mbtn', { type: 'button', 'data-ps-close': '', text: 'CANCEL' }),
        h('button.mbtn.primary', { id: 'psSubmit', type: 'submit', text: 'CREATE & OPEN' })
      ])
    ])
  ]);
  document.body.append(overlay);

  const form = overlay.querySelector('form');
  const title = overlay.querySelector('#psTitle');
  const fmt = overlay.querySelector('#psFormat');

  title.addEventListener('input', () => { state.dirty = true; overlay.querySelector('#psError').hidden = true; });
  fmt.addEventListener('change', () => {
    state.format = fmt.value;
    if (!state.dirty) title.value = FORMATS[state.format].title;
  });
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay || (e.target.closest && e.target.closest('[data-ps-close]'))) close();
  });
  overlay.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } });
  form.addEventListener('submit', (e) => { e.preventDefault(); submit(); });
}

function selectedFilm() {
  const r = overlay.querySelector('input[name="psFilm"]:checked');
  return r ? r.value : '';
}

function submit() {
  const title = overlay.querySelector('#psTitle');
  const name = title.value.trim();
  if (!name) {
    overlay.querySelector('#psError').hidden = false;
    title.focus();
    return;
  }
  if (!PlanGate.allowed('new_projects')) { close(); return; }
  const fav = selectedFilm();
  const p = Store.createProject({ title: name, format: state.format, fav: fav || undefined, adopt: true });
  if (!p) return;
  /* Signed in, the new project's cloud push is in flight: give it a
     moment so a plan-limit refusal is heard (cloud.js carries it to
     the dashboard), then go. Signed out, settle() resolves at once. */
  const C = window.StudioCloud;
  const wait = C && typeof C.settle === 'function' ? C.settle(3000) : Promise.resolve();
  wait.then(() => { location.href = DASHBOARD_URL; }, () => { location.href = DASHBOARD_URL; });
}

/** Open the sheet. `format` is the door that was chosen. */
export function openProjectSetup(opts) {
  opts = opts || {};
  if (!PlanGate.allowed('new_projects')) return false;
  if (!overlay) build();
  state = { format: FORMATS[opts.format] ? opts.format : 'feature', dirty: false };
  overlay.querySelector('#psFormat').value = state.format;
  overlay.querySelector('#psTitle').value = FORMATS[state.format].title;
  overlay.querySelector('#psError').hidden = true;
  // A door is feature or short; anything else came from the disclosure.
  overlay.querySelector('#psMore').open = !(state.format === 'feature' || state.format === 'short') ? true : false;
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
