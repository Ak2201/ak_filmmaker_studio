/* ============================================================
   CASE STUDIES — the demo film, as application state
   ------------------------------------------------------------
   The app already teaches through four Tamil films, but it shows all
   four at once: every step lists four examples side by side. That is
   a reference book. This makes the film a SELECTION — pick one and
   the whole workspace speaks in that film's terms.

   WHAT IS IN THE DATA, AND WHAT DELIBERATELY IS NOT.

   Every field here is craft ANALYSIS: what structural job a beat
   does, what decision the director made, why it works. None of it is
   a retelling. There are no scene-by-scene plot summaries and no
   quoted dialogue, because a study that reproduces the film is both a
   worse lesson and not ours to publish. If a reader could follow the
   plot from this file instead of watching the film, it has gone
   wrong. Loglines are one sentence, which is what a logline is.

   The selected film is a DEVICE preference, like the theme and the
   skin: it is about how you are reading, not about the film you are
   making. So it is a plain localStorage key, deliberately NOT one of
   store.js's project-scoped keys and deliberately not synced.
   ============================================================ */
import studies from '../data/studies.json';

/**
 * @typedef {Object} FilmMeta
 * @property {string} slug     stable id, used in URLs and storage
 * @property {string} title
 * @property {string} director
 * @property {string} year
 * @property {string} genre
 * @property {string} hue      a volume/phase hue token name — colour = which film
 */

/**
 * @typedef {Object} ConceptStudy
 * @property {string} premise    the core idea, one or two sentences
 * @property {string} hook       what makes it refuse to let go
 * @property {string} howBuilt   how THIS director established it early
 * @property {string} yourTurn   the actionable instruction for the reader
 */

/**
 * @typedef {Object} LoglineStudy
 * @property {string} line       the film's logline, one sentence
 * @property {string} protagonist
 * @property {string} incident
 * @property {string} conflict
 * @property {string} goal
 * @property {string} cost       what is lost if they fail
 * @property {string} yourTurn
 */

/**
 * @typedef {Object} CharacterStudy
 * @property {string} name
 * @property {string} role       protagonist / antagonist / mirror / ally
 * @property {string} flaw
 * @property {string} want       the external, stateable goal
 * @property {string} need       the internal thing they do not know they need
 * @property {string} external   what they lose in the world if they fail
 * @property {string} internal   what they lose in themselves
 * @property {string} arc        the shape of the change, in one line
 */

/**
 * @typedef {Object} Beat
 * @property {string} id         one of the canonical beat ids below
 * @property {string} label
 * @property {string} act        '1' | '2' | '3'
 * @property {string} function   the STRUCTURAL job this beat performs
 * @property {string} inFilm     how this film performs that job — analysis, not plot
 * @property {string} [craft]    the technique worth stealing
 */

/**
 * @typedef {Object} SceneStudy
 * @property {string} title      a short descriptive name, not a plot summary
 * @property {string} technique  the craft idea being demonstrated
 * @property {string} how        how the scene executes it
 * @property {string} why        why it works
 * @property {string} [tanglish]
 */

/**
 * @typedef {Object} FilmStudy
 * @property {FilmMeta} meta
 * @property {ConceptStudy} concept
 * @property {LoglineStudy} logline
 * @property {CharacterStudy[]} characters
 * @property {Beat[]} beats
 * @property {SceneStudy[]} scenes
 * @property {string[]} directorNotes  key decisions, one line each
 * @property {string[]} glossary       glossary term ids this film demonstrates best
 */

/* The canonical structural beats. The spec asked for five named ones;
   these are those five plus the two that make a three-act read as
   three acts rather than a list. Every study must cover all of them —
   a study with a hole is a lesson with a hole, and validate() says so. */
export const BEATS = [
  { id: 'opening',   label: 'Opening Image',    act: '1' },
  { id: 'inciting',  label: 'Inciting Incident', act: '1' },
  { id: 'pp1',       label: 'Plot Point 1',      act: '1' },
  { id: 'midpoint',  label: 'Midpoint',          act: '2' },
  { id: 'allLost',   label: 'All Hope Is Lost',  act: '2' },
  { id: 'climax',    label: 'Climax',            act: '3' },
  { id: 'resolution', label: 'Resolution',       act: '3' }
];

/* ------------------------------------------------------------
   NAMED BEAT SHEETS — the method half
   ------------------------------------------------------------
   A published beat sheet (Save the Cat, and any other added later)
   is described once in studies.json under beatSheetMethods: the beat
   names, their page targets, and the structural job each does. Those
   are properties of the method, not of a film, so a film's own entry
   carries only its half — how that picture discharges each beat.

   Exposed through here rather than by importing the JSON into a
   page, for the same reason getStudy() exists: the data shape is
   this module's business.
   ------------------------------------------------------------ */

/** Every beat-sheet method the build shipped. */
export function listBeatSheetMethods() {
  return (studies.beatSheetMethods || []).slice();
}

/** @returns {object|null} the method a film's sheet refers to. */
export function getBeatSheetMethod(id) {
  return listBeatSheetMethods().find((m) => m.id === id) || null;
}

const DEMO_KEY = 'fms_studio_demo_v1';

/** Every study the build shipped, in display order. */
export function listStudies() {
  return (studies.films || []).slice();
}

/** @returns {FilmStudy|null} */
export function getStudy(slug) {
  return listStudies().find((f) => f.meta.slug === slug) || null;
}

export function defaultSlug() {
  const all = listStudies();
  return all.length ? all[0].meta.slug : '';
}

/** The currently selected demo film. Falls back rather than throwing. */
export function currentSlug() {
  let v = null;
  try { v = localStorage.getItem(DEMO_KEY); } catch (e) {}
  return getStudy(v) ? v : defaultSlug();
}

export function currentStudy() {
  return getStudy(currentSlug());
}

/* Selecting a film is a broadcast, not a page load. Subscribers redraw
   themselves; nothing here knows what a component is. */
const listeners = new Set();
export function onDemoChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function selectDemo(slug) {
  if (!getStudy(slug)) return currentSlug();
  try { localStorage.setItem(DEMO_KEY, slug); } catch (e) {}
  document.documentElement.setAttribute('data-demo', slug);
  listeners.forEach((fn) => { try { fn(slug); } catch (e) { console.warn('[demo]', e); } });
  return slug;
}

export function loadDemo() { return selectDemo(currentSlug()); }

/* A study with a missing beat or an empty field is a lesson with a
   hole in it, and the hole is invisible until a reader reaches it. The
   page calls this and renders what is missing rather than a blank. */
export function validate(study) {
  const gaps = [];
  if (!study) return ['study missing'];
  const need = ['premise', 'hook', 'howBuilt', 'yourTurn'];
  need.forEach((k) => { if (!study.concept || !study.concept[k]) gaps.push(`concept.${k}`); });
  ['line', 'protagonist', 'incident', 'conflict', 'goal', 'cost'].forEach((k) => {
    if (!study.logline || !study.logline[k]) gaps.push(`logline.${k}`);
  });
  if (!(study.characters || []).length) gaps.push('characters');
  BEATS.forEach((b) => {
    const got = (study.beats || []).find((x) => x.id === b.id);
    if (!got) gaps.push(`beat:${b.id}`);
    else if (!got.inFilm) gaps.push(`beat:${b.id}.inFilm`);
  });
  if (!(study.scenes || []).length) gaps.push('scenes');
  return gaps;
}

if (typeof window !== 'undefined') {
  window.StudioStudies = { listStudies, getStudy, currentSlug, currentStudy, selectDemo, loadDemo, validate, BEATS,
    listBeatSheetMethods, getBeatSheetMethod };
}

export { DEMO_KEY };
export default { listStudies, getStudy, currentSlug, currentStudy, selectDemo, loadDemo, onDemoChange, validate, BEATS,
  listBeatSheetMethods, getBeatSheetMethod };
