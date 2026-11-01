/* ============================================================
   THE PRE-PRODUCTION PATH — where each step stands, derived
   ------------------------------------------------------------
   src/data/preprod-path.json says WHAT the steps are and in what order.
   This file answers HOW FAR each one is, for the open project, and
   stores nothing: every state is a question asked of the models that
   already exist. It composes src/lib/readiness.js (the pre-shoot checks)
   instead of re-deriving them, for the reason that file gives — two
   opinions about the same data disagree the first time one is edited.

   A step is one of
     done   the thing the step is for is there
     doing  started, not finished
     todo   not started
   and carries `missing` — short named items, the first few of which the
   path page prints — and `facts`, the one-line summary.

   A model that cannot be read must not take the path down: each step is
   read inside its own try, and one that throws comes out `todo` with a
   fact that says it could not be read.
   ============================================================ */
import data from '../data/preprod-path.json';
import Scenes from './scenes.js';
import { shootDayOf } from './locations.js';
import { readiness, sceneLabel } from './readiness.js';
import { listContacts, listCallSheets } from './contacts.js';
import { listSongs } from './songs.js';
import { listShots, listBoards, listFrames } from './shots.js';
import { loadScript, isNumberingLocked } from './script.js';
import { isDisabledEverywhere } from './plan-gate.js';

export const STEPS = data.steps;

const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const first = (list, n = 4) => list.slice(0, n).concat(list.length > n ? ['and ' + (list.length - n) + ' more'] : []);
const rank = (state) => (state === 'done' ? 2 : state === 'doing' ? 1 : 0);

/** Costed budget lines, counted the way the hub's launcher counts them. */
function costedLines() {
  try {
    const bag = JSON.parse(localStorage.getItem('fms_library_calc_v1') || '{}') || {};
    const rows = new Set();
    for (const [k, v] of Object.entries(bag)) {
      const m = k.match(/^ci_(\d+)_/);
      if (m && String(v == null ? '' : v).trim() !== '') rows.add(m[1]);
    }
    return rows.size;
  } catch (e) { return 0; }
}

function readers(ctx) {
  const { scenes, report } = ctx;
  const byId = Object.fromEntries((report.checks || []).map((c) => [c.id, c]));
  const failing = (id) => (byId[id] && !byId[id].passed ? byId[id].items : []);
  const known = (id) => !!byId[id];
  return {
    script() {
      const sc = loadScript();
      const els = sc.elements || [];
      const heads = els.filter((e) => e.type === 'scene' && String(e.text || '').trim()).length;
      const locked = isNumberingLocked(sc.numbering);
      if (!els.some((e) => String(e.text || '').trim())) return { state: 'todo', facts: ['No screenplay yet'], missing: ['Write or import a screenplay'] };
      const missing = [];
      if (!heads) missing.push('Add scene headings');
      if (!locked) missing.push('Lock the script (Screenplay Writer)');
      return { state: !missing.length ? 'done' : 'doing', facts: [plural(heads, 'scene heading') + (locked ? ' · numbers locked' : '')], missing };
    },
    scenes() {
      if (!scenes.length) return { state: 'todo', facts: ['No scenes yet'], missing: ['Add scenes by hand or from the script'] };
      const noLoc = failing('scene-location');
      return { state: noLoc.length ? 'doing' : 'done', facts: [plural(scenes.length, 'scene')], missing: noLoc.length ? ['No location: ' + first(noLoc, 3).join('; ')] : [] };
    },
    breakdown() {
      if (!scenes.length) return { state: 'todo', facts: ['Needs scenes first'], missing: [] };
      const untagged = scenes.filter((s) => !Object.values(s.elements || {}).some((v) => Array.isArray(v) && v.length));
      const tagged = scenes.length - untagged.length;
      const noCast = failing('scene-cast');
      const missing = [];
      if (untagged.length) missing.push('Nothing tagged in ' + plural(untagged.length, 'scene') + ': ' + first(untagged.map(sceneLabel), 3).join('; '));
      else if (noCast.length) missing.push('Nobody in ' + plural(noCast.length, 'scene') + ': ' + first(noCast, 3).join('; '));
      return { state: tagged === 0 ? 'todo' : missing.length ? 'doing' : 'done', facts: [tagged + ' of ' + plural(scenes.length, 'scene') + ' broken down'], missing };
    },
    vision() {
      const boards = listBoards(); const frames = listFrames();
      const n = boards.reduce((t, b) => t + (b.entries || []).length, 0);
      if (!n && !frames.length) return { state: 'todo', facts: ['No lookbook yet'], missing: ['Pin a few references to a board'] };
      return { state: 'done', facts: [plural(n, 'reference') + (frames.length ? ' · ' + plural(frames.length, 'storyboard frame') : '')], missing: [] };
    },
    shots() {
      if (!scenes.length) return { state: 'todo', facts: ['Needs scenes first'], missing: [] };
      const shots = listShots();
      const covered = new Set(shots.map((s) => s.sceneId));
      const bare = scenes.filter((s) => !covered.has(s.id));
      const missing = bare.length && shots.length ? ['No shots in ' + plural(bare.length, 'scene') + ': ' + first(bare.map(sceneLabel), 3).join('; ')] : [];
      return { state: !shots.length ? 'todo' : bare.length ? 'doing' : 'done', facts: [plural(shots.length, 'shot')], missing: shots.length ? missing : ['Plan how the first scene is covered'] };
    },
    people() {
      const contacts = listContacts();
      const uncast = failing('cast-uncast');
      if (!contacts.length) return { state: 'todo', facts: ['Nobody added yet'], missing: ['Add the cast and crew'] };
      const missing = uncast.length ? ['Nobody cast as ' + first(uncast, 4).join(', ')] : [];
      return { state: missing.length ? 'doing' : 'done', facts: [contacts.length === 1 ? '1 person' : contacts.length + ' people'], missing };
    },
    places() {
      const noRecce = failing('loc-recce'), refused = failing('loc-refused'), open = failing('loc-permission');
      if (!known('loc-recce')) return { state: 'todo', facts: ['Needs scenes with locations'], missing: [] };
      const missing = [];
      if (refused.length) missing.push('Refused: ' + first(refused, 3).join(', ') + ' — find somewhere else');
      if (noRecce.length) missing.push('No recce yet: ' + first(noRecce, 3).join(', '));
      if (open.length) missing.push('Permission not yet given: ' + first(open, 3).join(', '));
      const all = ctx.locationCount || 0;
      /* nothing recced and nothing asked for is "not started", not "started" */
      const untouched = all > 0 && noRecce.length === all && !refused.length;
      return { state: !missing.length ? 'done' : untouched ? 'todo' : 'doing', facts: [plural(all, 'location')], missing };
    },
    songs() {
      const songs = listSongs();
      const un = failing('song-unplaced');
      return { state: un.length ? 'doing' : 'done', facts: [plural(songs.length, 'song')], missing: un.length ? ['No scene for: ' + first(un, 3).join(', ')] : [] };
    },
    budget() {
      const n = costedLines();
      return { state: n ? 'done' : 'todo', facts: [n ? plural(n, 'line') + ' costed' : 'No figures yet'], missing: n ? [] : ['Cost the first lines'] };
    },
    schedule() {
      if (!scenes.length) return { state: 'todo', facts: ['Needs scenes first'], missing: [] };
      const unsched = failing('scene-day'), undated = failing('day-date');
      const placed = scenes.length - unsched.length;
      const missing = [];
      if (unsched.length) missing.push(plural(unsched.length, 'scene') + ' not on a shoot day');
      if (undated.length) missing.push('No date for ' + first(undated, 3).join(', '));
      return { state: !placed ? 'todo' : missing.length ? 'doing' : 'done', facts: [placed + ' of ' + plural(scenes.length, 'scene') + ' scheduled'], missing };
    },
    sheets() {
      const sheets = listCallSheets();
      const noSheet = failing('day-callsheet');
      if (!known('day-callsheet')) return { state: 'todo', facts: ['Needs a schedule first'], missing: [] };
      /* A call sheet belongs to a shoot day: with no scene on a day there is
         nothing for it to be done for, whatever sheets are stored. */
      if (!scenes.some((s) => shootDayOf(s))) return { state: 'todo', facts: ['Needs a schedule first'], missing: [] };
      const missing = noSheet.length ? ['No call sheet for ' + first(noSheet, 4).join(', ')] : [];
      return { state: !sheets.length ? 'todo' : missing.length ? 'doing' : 'done', facts: [plural(sheets.length, 'call sheet')], missing };
    },
    ready() {
      if (!report.hasFilm) return { state: 'todo', facts: ['Nothing to check yet'], missing: [] };
      const missing = [];
      if (report.blockers) missing.push(plural(report.blockers, 'thing') + ' would stop a shoot day');
      if (report.gaps) missing.push(plural(report.gaps, 'gap') + ' you would regret');
      return { state: report.ready ? 'done' : 'doing', facts: [report.ready ? 'Every check passes' : report.blockers + ' blocker' + (report.blockers === 1 ? '' : 's') + ' · ' + report.gaps + ' gap' + (report.gaps === 1 ? '' : 's')], missing };
    }
  };
}

/** Every step that applies to this film, in order, with its state.
 *  @returns {Array<{id,label,about,tool,pages,n,state,facts,missing}>} */
export function pathSteps() {
  let scenes = [];
  try { scenes = Scenes.listScenes(); } catch (e) { scenes = []; }
  let report = { checks: [], blockers: 0, gaps: 0, ready: false, hasFilm: false };
  try { report = readiness(); } catch (e) { console.warn('[preprod-path] readiness', e); }
  let locationCount = 0;
  try { locationCount = new Set(scenes.map((s) => String(s.location || '').trim().toLowerCase()).filter(Boolean)).size; } catch (e) { /* none */ }
  let songs = 0;
  try { songs = listSongs().length; } catch (e) { songs = 0; }
  const read = readers({ scenes, report, locationCount });
  return data.steps
    .filter((s) => !s.only || (s.only === 'songs' && songs > 0))
    .filter((s) => !s.module || !isDisabledEverywhere(s.module))
    .map((s, i) => {
      let r;
      try { r = read[s.id](); } catch (e) {
        console.warn('[preprod-path]', s.id, e);
        r = { state: 'todo', facts: ['Could not be read'], missing: [] };
      }
      return { ...s, n: i + 1, state: r.state, facts: r.facts || [], missing: r.missing || [] };
    });
}

/** The step to do next: the first that is not done, before "Ready", else Ready. */
export function nextStep(steps) {
  const open = steps.find((s) => s.state !== 'done' && s.id !== 'ready');
  return open || steps.find((s) => s.id === 'ready') || steps[0] || null;
}

/** Which step a page (and fragment) belongs to: the most specific match
 *  in `pages` — 'file#frag' beats 'file'. Null when the page is in none. */
export function stepForPage(steps, file, hash) {
  const f = String(file || '').toLowerCase();
  const frag = String(hash || '').replace(/^#/, '');
  let best = null, bestScore = 0;
  for (const s of steps) {
    for (const p of s.pages || []) {
      const [pf, pfrag] = p.toLowerCase().split('#');
      if (pf !== f) continue;
      const score = pfrag ? (pfrag === frag.toLowerCase() ? 3 : 0) : 1;
      if (score > bestScore) { best = s; bestScore = score; }
    }
  }
  return best;
}

export default { STEPS, pathSteps, nextStep, stepForPage };
