/* ============================================================
   FAVOURITE FILM — the picker, and the small switcher
   ------------------------------------------------------------
   "Which of these films have you watched? Pick your favourite — we'll
   explain every step with it." The answer belongs to the PROJECT
   (store.js setProjectFav, on the project entry, beside its format);
   with no project open it falls back to the device's demo choice
   (studies.js selectDemo), which is what favouriteSlug() reads next.

   Two shapes, one handler:
     renderFilmPicker()   radio cards — the Story page's empty state and
                          Settings' "Favourite film" section
     renderFilmSwitch()   a row of small buttons beside an example, so a
                          writer can see the same step in another film

   THE CASE STUDIES ARE NOT IMPORTED UP FRONT. studies.js carries four
   films' worth of text (about 100 KB), and the Story, Settings and Write
   pages should not pay for it before first paint — scripts/budget.json
   fails a page that does. So the picker draws from the four identity
   lines in story-bible.json \`films\` (a copy, kept honest by
   scripts/test-bible.mjs), and the studies themselves are imported once
   the page has settled (loadFavStudies) — the examples appear then, and
   every subscriber (onFavChange) redraws.

   Writes only on a click. No inline handlers: one delegated listener,
   bound once.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { setProjectFav, projectFav, currentProject } from '../lib/store.js';
import BIBLE from '../data/story-bible.json';
import '../styles/story-bible.css';

const FILMS = BIBLE.films;
const DEMO_KEY = 'fms_studio_demo_v1';   // studies.js's key — test-bible.mjs checks they agree
const known = (slug) => FILMS.some((f) => f.slug === slug);

const listeners = new Set();
export const onFavChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
const tell = (slug) => listeners.forEach((fn) => { try { fn(slug); } catch (e) { console.warn('[fav]', e); } });

let S = null, loading = null;
/** Import the case studies once; every subscriber redraws when they land. */
export function loadFavStudies() {
  if (S) return Promise.resolve(S);
  if (!loading) {
    loading = import('../lib/studies.js').then((m) => { S = m; tell(''); return S; })
      .catch((e) => { loading = null; console.warn('[fav] studies', e); return null; });
  }
  return loading;
}
/** Import them a moment after the page has settled — not on its first paint. */
export function loadFavStudiesSoon(ms = 2500) {
  if (S || loading) return;
  setTimeout(loadFavStudies, ms);
}

export function hasOpenProject() {
  try { return !!currentProject(); } catch (e) { return false; }
}

/** The slug examples are told in: the project's choice, else the device's,
    else the first film — the same order studies.js favouriteSlug() reads. */
export function favSlug() {
  if (S) return S.favouriteSlug();
  let v = '';
  try { v = projectFav(); } catch (e) { /* no store */ }
  if (!known(v)) { try { v = localStorage.getItem(DEMO_KEY); } catch (e) { v = ''; } }
  return known(v) ? v : FILMS[0].slug;
}
/** The study for the favourite film, or null until the studies have loaded. */
export function favStudy() { return S ? S.favouriteStudy() : null; }

/** Choose a favourite: the open project's, else the device's. */
export async function chooseFavourite(slug) {
  if (!known(slug)) return false;
  if (hasOpenProject()) { setProjectFav(slug); loadFavStudies(); }
  else { const m = await loadFavStudies(); if (m) m.selectDemo(slug); }
  tell(slug);
  return true;
}

let wired = false;
function wire() {
  if (wired) return;
  wired = true;
  delegate(document, 'click', '[data-fav-pick]', (e, el) => {
    const slug = el.getAttribute('data-fav-pick');
    if (slug && slug !== favSlug()) chooseFavourite(slug);
  });
}

const meta = (f) => [f.year, f.director].filter(Boolean).join(' · ');

/** Radio cards, one per film. */
export function renderFilmPicker({ label = 'Your favourite film' } = {}) {
  wire();
  const cur = favSlug();
  const grp = h('div.fav-picker', { role: 'radiogroup', 'aria-label': label });
  for (const f of FILMS) {
    const on = f.slug === cur;
    grp.append(h('button.fav-card' + (on ? '.is-on' : ''), {
      type: 'button', role: 'radio', 'aria-checked': String(on), 'data-fav-pick': f.slug
    }, [
      h('span.fav-title', { text: f.title }),
      h('span.fav-meta', { text: meta(f) }),
      f.genre ? h('span.fav-genre', { text: f.genre }) : null
    ]));
  }
  return grp;
}

/** A row of small buttons: which film this example is told in. */
export function renderFilmSwitch({ label = 'Example from' } = {}) {
  wire();
  const cur = favSlug();
  const row = h('div.fav-switch', { role: 'group', 'aria-label': label }, [h('span.fav-switch-k', { text: label })]);
  for (const f of FILMS) {
    const on = f.slug === cur;
    row.append(h('button.fav-pill' + (on ? '.is-on' : ''), {
      type: 'button', 'aria-pressed': String(on), 'data-fav-pick': f.slug, text: f.title
    }));
  }
  return row;
}

export default { renderFilmPicker, renderFilmSwitch, chooseFavourite, onFavChange, hasOpenProject, loadFavStudies, loadFavStudiesSoon, favSlug, favStudy };
