/* ============================================================
   BREAKDOWN RUN — the whole script, start to end, in one call
   ------------------------------------------------------------
   Owner's ask: "if a screenplay is written even for 5 pages and the
   user asks for breakdown it should do it from start to end —
   character bible, location, day or night shoot, characters, scene
   order." This is that call, and it invents nothing: it composes what
   the studio already has.

     1. syncScript()   (scene-sync.js)  every heading gets a scene row,
                       linked by its element id, in script order —
                       INCLUDING headings that pre-existed (no `prev`,
                       so nothing is "old").
     2. cast from CUES (screenplay-analysis.js suggestElements) tagged
                       with tagMany(). ONLY the people the script's
                       character cues name; props, vehicles, stunts and
                       sound stay SUGGESTIONS — breakdown.js's "a
                       suggestion is not a tag".
     3. characters     mergeWithCues + tableRead + castMatrix.
     4. locations      locationIndex + byLocation.
     5. totals         pages, INT/EXT, DAY/NIGHT, night pages, cast,
                       locations, screen time.

   THE ONLY WRITES are syncScript's scene rows and tagMany's cast tags.
   Idempotent: a second run plans nothing and tags nothing. The returned
   `applied.undo()` removes exactly the tags THIS run wrote (not the
   scene rows — those are the script's, and leaving the script is how
   they go, through the bin).

   `elements` defaults to the stored script. Pass them when the caller
   holds a newer copy in memory (the Write page).
   ============================================================ */
import './store.js';   // must evaluate before anything reads localStorage
import { listScenes, tagMany, untagMany, totalEighths, formatEighths } from './scenes.js';
import { loadScript } from './script.js';
import { syncScript } from './scene-sync.js';
import { suggestElements, castMatrix, screenTime, formatDuration, cueName } from './screenplay-analysis.js';
import { loadCharacters, mergeWithCues, tableRead, ownerOf } from './characters.js';
import { locationIndex, byLocation } from './locations.js';

export const NO_LOCATION = 'Unassigned';
const textOf = (el) => String((el && el.text) ?? '').trim();

/** The elements under each scene heading, keyed by the heading's id —
 *  an exact link, no guessing: `{ heading, elements }` per id. */
function slicesById(elements) {
  const out = new Map();
  let cur = null;
  for (const el of elements || []) {
    if (!el) continue;
    if (el.type === 'scene' && textOf(el)) { cur = { heading: textOf(el), elements: [] }; out.set(el.id, cur); continue; }
    if (cur && textOf(el)) cur.elements.push(el);
  }
  return out;
}

/** Cast the script's CUES name, per scene, as tags to write. Stored
 *  characters lend their own spelling ("ANBU" + alias "ANBUSELVAN"). */
function castTags(scenes, elements) {
  const slices = slicesById(elements);
  const bible = loadCharacters();
  const tags = [];
  for (const scene of scenes) {
    const slice = scene.scriptElId && slices.get(scene.scriptElId);
    if (!slice) continue;
    const cues = new Set(slice.elements.filter((e) => e.type === 'character').map((e) => cueName(e.text)).filter(Boolean));
    if (!cues.size) continue;
    for (const sug of suggestElements(scene, slice).cast) {
      if (!cues.has(cueName(sug.name))) continue;       // a caps intro in action, not a cue
      const own = ownerOf(bible, cueName(sug.name));
      tags.push({ sceneId: scene.id, category: 'cast', name: own ? own.name : sug.name });
    }
  }
  return tags;
}

const bump = (o, k) => { o[k] = (o[k] || 0) + 1; };

/** Characters, locations and totals, READ from what is stored now.
 *  Pure of writes — the page calls it on every render. */
export function summarize({ elements } = {}) {
  const els = elements || loadScript().elements;
  const scenes = listScenes();
  const numbers = new Map(scenes.map((s) => [s.id, s.number]));
  const order = new Map(scenes.map((s, i) => [s.id, i]));

  // 3. characters
  const list = loadCharacters();
  const merged = mergeWithCues(list, els);
  const read = tableRead(els, list);
  const readBy = new Map(read.rows.map((r) => [cueName(r.name), r]));
  const matrix = castMatrix(scenes, els);
  const matrixBy = new Map(matrix.characters.map((c) => [c.key, c]));
  const characters = merged.map((c) => {
    const keys = new Set([c.name, ...(c.aliases || []), ...(c.names || [])].map(cueName).filter(Boolean));
    const ids = new Set();
    let lines = 0;
    for (const k of keys) {
      const m = matrixBy.get(k);
      if (m) { for (const id of m.scenes) ids.add(id); lines += m.lines; }
    }
    const r = readBy.get(cueName(c.name));
    const sceneRows = [...ids].filter((id) => order.has(id)).sort((a, b) => order.get(a) - order.get(b));
    return {
      name: c.name,
      inBible: !c.derived,
      id: c.derived ? '' : c.id,
      scenes: sceneRows.map((id) => numbers.get(id)),
      sceneIds: sceneRows,
      firstScene: sceneRows.length ? numbers.get(sceneRows[0]) : '',
      cues: c.cues || 0,
      lines: r ? r.lines : lines,
      words: r ? r.words : 0
    };
  }).filter((c) => c.scenes.length || c.cues)
    .sort((a, b) => b.scenes.length - a.scenes.length || b.words - a.words || a.name.localeCompare(b.name));

  // 4. locations
  const index = new Map(locationIndex(scenes).map((l) => [l.name.toLowerCase(), l]));
  const locations = byLocation(scenes, numbers, NO_LOCATION).map((l) => {
    const ix = index.get(l.name.toLowerCase());
    return {
      name: l.name,
      key: ix ? ix.key : '',
      unassigned: l.name === NO_LOCATION && !ix,
      intExt: l.ie,
      dayNight: l.dn,
      scenes: l.numbers,
      count: l.count,
      eighths: l.eighths,
      pages: formatEighths(l.eighths),
      days: ix ? ix.days : []
    };
  });

  // 5. totals
  const intExt = {}, dayNight = {};
  let nightEighths = 0;
  for (const s of scenes) {
    bump(intExt, s.intExt || 'INT');
    bump(dayNight, s.dayNight || 'DAY');
    if (s.dayNight === 'NIGHT') nightEighths += Number(s.eighths) || 0;
  }
  const eighths = totalEighths(scenes);
  const screen = screenTime(scenes, els);
  const castNames = new Set(characters.filter((c) => c.scenes.length).map((c) => cueName(c.name)));
  const totals = {
    scenes: scenes.length,
    eighths,
    pages: formatEighths(eighths),
    intExt,
    dayNight,
    nightEighths,
    nightPages: formatEighths(nightEighths),
    cast: castNames.size,
    locations: locations.filter((l) => !l.unassigned).length,
    screenSeconds: screen.total,
    runtime: formatDuration(screen.total)
  };

  return { scenes, characters, locations, totals };
}

/** Run the whole breakdown: the two writes, then the summary.
 *  Returns { scenes, characters, locations, totals, applied }. */
export function runBreakdown({ elements, numbering } = {}) {
  const script = elements ? null : loadScript();
  const els = elements || script.elements;
  const numb = numbering !== undefined ? numbering : (script ? script.numbering : undefined);

  // 1. every heading a scene row
  const { plan, result } = syncScript(els, { numbering: numb });
  // 2. cast, from cues only
  const tags = plan.empty ? [] : tagMany(castTags(listScenes(), els));

  const applied = {
    empty: !!plan.empty,
    scenesAdded: result.added.length,
    scenesLinked: plan.update.filter((u) => u.patch && u.patch.scriptElId).length,
    scenesUpdated: result.updated,
    restored: result.restored.length,
    binned: result.binned.length,
    held: plan.held.length,
    castTagged: tags.length,
    tags,
    undo: () => untagMany(tags)
  };
  return { ...summarize({ elements: els }), applied };
}

export default { runBreakdown, summarize, NO_LOCATION };
