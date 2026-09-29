/* ============================================================
   DISSECTION — taking a finished film apart
   ------------------------------------------------------------
   The case studies in studies.js are the WRITER'S view: concept,
   logline, beats, arcs — how a script gets built. A dissection is the
   opposite direction. You start with a finished film and work
   backwards: what job is each sequence doing, what drives the
   structure, which ideas recur and where they pay off.

   The point is not the worked example. It is the FRAMEWORK. A reader
   who only reads our dissection has learned one film; a reader who
   fills these fields in about their own footage has learned to watch.
   So every shipped dissection and every user-written one use exactly
   the same shape, and the page puts them side by side.

   WHAT THIS DELIBERATELY IS NOT. Every field is craft analysis — the
   dramatic function a sequence performs, the technique used, why it
   works. Not a retelling. No plot summaries, no quoted dialogue, no
   naming the mechanism of a reveal. A dissection that reproduces the
   film is a spoiler with footnotes, it teaches nothing you could not
   get by watching, and it is not ours to publish. The test is the
   same one studies.js uses: if you could follow the story from this
   text instead of seeing the film, it is the wrong text.
   ============================================================ */
import Store from './store.js';
import shipped from '../data/dissections.json';

/**
 * @typedef {Object} Sequence
 * @property {string} id
 * @property {string} label       a descriptive name for the sequence, not a plot beat
 * @property {string} act         '1' | '2' | '3'
 * @property {string} [at]        rough position, e.g. '~0:18' — orientation, not an index
 * @property {string} fn          the DRAMATIC FUNCTION: what this sequence does to the story
 * @property {string} technique   the craft used to do it
 * @property {string} why         why it works
 */

/**
 * @typedef {Object} Motif
 * @property {string} name
 * @property {string} what        the idea or image that recurs
 * @property {string} plant       how it is established
 * @property {string} payoff      what it is worth later
 */

/**
 * @typedef {Object} CraftNote
 * @property {string} area   structure | character | dialogue | image | editing | sound
 * @property {string} lesson one transferable sentence
 */

/**
 * @typedef {Object} Dissection
 * @property {{slug:string,title:string,director:string,year:string,genre:string,hue:string}} meta
 * @property {string} thesis     what the film is arguing, in one line
 * @property {string} engine     what actually drives the structure forward
 * @property {Sequence[]} sequences
 * @property {Motif[]} motifs
 * @property {CraftNote[]} craft
 * @property {string[]} questions  what to ask of YOUR film, derived from this one
 */

export const AREAS = ['structure', 'character', 'dialogue', 'image', 'editing', 'sound'];
export const ACTS = ['1', '2', '3'];

const KEY = 'fms_dissect_v1';

/** The dissections that ship with the app — read-only worked examples. */
export function listShipped() {
  return (shipped.films || []).slice();
}
export function getShipped(slug) {
  return listShipped().find((d) => d.meta.slug === slug) || null;
}

/* ---- the user's own dissection, one per project ------------- */

function readAll() {
  let raw = null;
  try { raw = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  if (!raw) return { mine: blank() };
  try {
    const p = JSON.parse(raw);
    const m = p && typeof p.mine === 'object' && p.mine ? p.mine : {};
    // An empty array is truthy — check the shape, not the truthiness.
    return {
      mine: {
        ...blank(),
        ...m,
        sequences: Array.isArray(m.sequences) ? m.sequences : [],
        motifs: Array.isArray(m.motifs) ? m.motifs : [],
        craft: Array.isArray(m.craft) ? m.craft : [],
        questions: Array.isArray(m.questions) ? m.questions : []
      }
    };
  } catch (e) { return { mine: blank() }; }
}

export function blank() {
  return { title: '', thesis: '', engine: '', sequences: [], motifs: [], craft: [], questions: [] };
}

export function loadMine() { return readAll().mine; }

export function saveMine(mine) {
  try { localStorage.setItem(KEY, JSON.stringify({ mine })); return true; }
  catch (e) { return false; }
}

const uid = () => (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);

export function blankSequence(patch = {}) {
  return { id: uid(), label: '', act: '1', at: '', fn: '', technique: '', why: '', ...patch };
}
export function blankMotif(patch = {}) {
  return { id: uid(), name: '', what: '', plant: '', payoff: '', ...patch };
}

/** Coverage of a dissection, derived — never stored. */
export function coverage(d) {
  if (!d) return { acts: {}, filled: 0, total: 0 };
  const acts = {};
  ACTS.forEach((a) => { acts[a] = (d.sequences || []).filter((s) => s.act === a).length; });
  const fields = (d.sequences || []).flatMap((s) => [s.fn, s.technique, s.why]);
  return {
    acts,
    filled: fields.filter((v) => v && v.trim()).length,
    total: fields.length,
    motifsWithPayoff: (d.motifs || []).filter((m) => m.payoff && m.payoff.trim()).length,
    motifs: (d.motifs || []).length
  };
}

/* A motif planted and never paid off is the most common finding a
   dissection turns up, so it is a first-class result rather than
   something the reader has to notice for themselves. */
export function danglingMotifs(d) {
  return (d && d.motifs || []).filter((m) => (m.what || '').trim() && !(m.payoff || '').trim());
}

if (typeof window !== 'undefined') {
  window.StudioDissect = { listShipped, getShipped, loadMine, saveMine, coverage, danglingMotifs };
}

export { KEY as DISSECT_KEY };
export default {
  AREAS, ACTS, listShipped, getShipped, blank, loadMine, saveMine,
  blankSequence, blankMotif, coverage, danglingMotifs
};
