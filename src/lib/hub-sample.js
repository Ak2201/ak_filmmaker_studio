/* ============================================================
   HUB SAMPLE — building and writing a sample project (Dragon, …)
   ------------------------------------------------------------
   Moved out of src/pages/hub.js when the hub's view and logic were
   split (docs/ARCHITECTURE.md). The page still decides WHEN to open a
   sample, loads the lazy chunks, creates the project and says so; this
   module is the only thing that knows how to turn a sample's data into
   the app's records, and how to write them.

   THE CONTENT IS NOT HERE. It is src/data/sample.<id>.json — invariant
   2, content lives in the data files. The writer writes through the
   same key shapes the app reads back:

     fms_filmmaker_combined_v1   the blueprint blob, field → value
     fms_scenes_v1               { scenes: [...] }        scenes.js
     fms_contacts_v1             { contacts, callSheets } contacts.js
     fms_locations_v1            { days, recces, media }  locations.js
     fms_shots_v1                { shots, frames, boards } shots.js
     fms_script_v1               { elements, revisions, documents }
     fms_library_calc_v1         ci_<n>_item|days|rate    ui/budget.js
     fms_story_v1                the sample's story, when it has one

   Every one of those is in SCOPED_KEYS, and createProject() has
   already made the new project current, so the storage proxy suffixes
   every write with its id. Nothing here goes near rawSet.

   ONE REPRESENTATION PER THING. Scene ids are DERIVED from the scene
   number; the data file refers to a scene by number and never writes
   an id. Shoot days, locations, cast, page counts and a call sheet's
   date are likewise never listed in the file — they are what the
   scene rows and the calendar already say. The blueprint's own legacy
   scene/cast/location tables (sl_*, cast_*, loc_*) are left empty on
   purpose: filling them would be the scene list stored twice, which
   is the stranded-key trap by another name.
   ============================================================ */
import { formatEighths } from './scenes.js';
import { locationKey, locationLink } from './locations.js';
import { sampleFigures } from './sample-figures.js';
import { writeText } from './prefs.js';
import {
  FEATURE_KEY, LIB_CALC_KEY, SCENES_KEY, CONTACTS_KEY, SHOTS_KEY, SCRIPT_KEY, LOCS_KEY, STORY_KEY
} from './hub-keys.js';

/* Every builder below takes the sample object from src/lib/samples.js
   (with its main JSON attached as `data`) and prefixes its ids with the
   sample's own id, so Dragon's stay dragon-sc-<n> byte for byte and a
   second sample cannot collide. */
const sampleSceneId   = (sample, number) => sample.id + '-sc-' + String(number);
const sampleContactId = (sample, i)      => sample.id + '-c-' + (i + 1);
const sampleShotId    = (sample, scene, number) => sample.id + '-sh-' + scene + '-' + number;

/** The sample's shoot days and screenplay pages — the same derivation
    the first-run panel and start.html quote. */
export const sampleDays  = (data) => sampleFigures(data).days;
export const samplePages = (data) => sampleFigures(data).pages;

/** Pages per day as the schedule step's <select> words it. Assigning a
    value that is not one of its options silently blanks the field —
    the select trap src/ui/budget.js documents — so this maps the
    derived figure onto the vocabulary that exists. */
const PAGES_PER_DAY_BANDS = [
  [1.5, '~1 page (heavy production)'],
  [2.5, '~2 pages (standard prestige)'],
  [3.5, '~3 pages (mainstream)'],
  [4.5, '~4 pages (TV / fast-paced)'],
  [Infinity, '~5+ pages (indie / low-budget)']
];

export function sampleScenes(sample) {
  return sample.data.scenes.map((s) => ({ ...s, id: sampleSceneId(sample, s.number) }));
}

/** Each scene takes the beat of the outline step written for it. */
export function applyStoryBeats(scenes, story) {
  if (story) for (const st of story.outline) { const sc = scenes.find((x) => x.id === st.sceneId); if (sc && !sc.beatId) sc.beatId = st.beat; }
  return scenes;
}

/** The blueprint blob: the written answers, the ticked checklists, and
    the four figures that are DERIVED from the schedule rather than
    typed beside it, so the paperwork cannot disagree with the board. */
export function sampleBlueprint(sample, scenes) {
  const fields = { ...sample.data.blueprint };
  fields.meta_title = sample.title;
  fields.v1_title   = sample.title;

  const days = sampleDays(sample.data);
  const eighths = scenes.reduce((a, s) => a + (Number(s.eighths) || 0), 0);
  const perDay = days ? (eighths / 8) / days : 0;

  fields.p3_days     = String(days);
  fields.v2s11_days  = String(days);
  fields.v2s11_pages = (PAGES_PER_DAY_BANDS.find(([max]) => perDay < max) || [])[1] || '';
  fields.v2_shoot    = days + ' days · ' + formatEighths(eighths) + ' pages';

  for (const key of sample.data.blueprintChecks) fields[key] = true;
  return fields;
}

export function sampleContacts(sample) {
  return sample.data.contacts.map((c, i) => ({ ...c, id: sampleContactId(sample, i) }));
}

/** A call sheet holds ids, never copies — contacts.js is explicit
    about it — and its date comes off the shoot-day calendar rather
    than being written down a second time. */
export function sampleCallSheets(sample, contacts) {
  const idByName = new Map(contacts.map((c) => [c.name, c.id]));
  return sample.data.callSheets.map((cs, i) => ({
    id: sample.id + '-cs-' + (i + 1),
    title: cs.title,
    date: sample.data.days[String(cs.day)] || '',
    generalCall: cs.generalCall,
    location: cs.location,
    notes: cs.notes,
    sceneIds: (cs.sceneNumbers || []).map((n) => sampleSceneId(sample, n)),
    calls: Object.fromEntries(Object.entries(cs.calls || {})
      .map(([name, time]) => [idByName.get(name), time])
      .filter(([id]) => Boolean(id)))
  }));
}

/** Recces are filed under locations.js's normalised key and media
    under its `loc:` link token, both derived from the location name a
    scene already carries. */
export function sampleLocations(sample) {
  const recces = {};
  for (const [name, rec] of Object.entries(sample.data.recces)) recces[locationKey(name)] = rec;
  return {
    days: { ...sample.data.days },
    recces,
    media: sample.data.media.map((m, i) => ({
      id: sample.id + '-md-' + (i + 1),
      title: m.title,
      url: m.url || '',
      kind: m.kind,
      notes: m.notes || '',
      linkedTo: m.linkedTo ? locationLink(m.linkedTo) : ''
    }))
  };
}

export function sampleShots(sample) {
  const shots = sample.data.shots.map((s) => ({
    id: sampleShotId(sample, s.scene, s.number),
    sceneId: sampleSceneId(sample, s.scene),
    number: s.number,
    size: s.size,
    angle: s.angle,
    movement: s.movement,
    lens: s.lens,
    description: s.description,
    done: false,
    ai: false
  }));
  const frames = sample.data.frames.map((f, i) => ({
    id: sample.id + '-fr-' + (i + 1),
    shotId: sampleShotId(sample, f.scene, f.shotNumber),
    caption: f.caption,
    ref: f.ref
  }));
  const boards = sample.data.boards.map((b, i) => ({
    id: sample.id + '-bd-' + (i + 1),
    name: b.name,
    note: b.note || '',
    entries: (b.entries || []).map((e, j) => ({
      id: sample.id + '-bd-' + (i + 1) + '-en-' + (j + 1),
      title: e.title, ref: e.ref || '', why: e.why || ''
    }))
  }));
  return { shots, frames, boards };
}

/* `elements` is passed in rather than read off `sample`, because the
   105 pages live in their own file and arrive by dynamic import — see
   openSampleProject() in hub.js. An empty array is a legitimate
   argument: the project is still worth having without the screenplay. */
export function sampleScript(sample, elements) {
  const now = new Date().toISOString();
  return {
    elements: (elements || []).map((e, i) => ({
      id: sample.id + '-el-' + (i + 1), type: e.type, text: e.text
    })),
    // No revision history: a snapshot the user did not take is a
    // fiction, and restoring one would silently replace their draft.
    revisions: [],
    documents: sample.data.script.documents.map((d, i) => ({
      id: sample.id + '-doc-' + (i + 1),
      title: d.title, kind: d.kind, body: d.body, updated: now
    }))
  };
}

/** The estimator stores one flat field per cell, `ci_<n>_item|days|rate`,
    1-indexed. Unchanged shape on purpose — invariant 1. */
export function sampleCalc(sample) {
  const data = {};
  sample.data.calc.forEach((row, i) => {
    const n = i + 1;
    data['ci_' + n + '_item']   = row.item;
    data['ci_' + n + '_custom'] = '';
    data['ci_' + n + '_days']   = row.days;
    data['ci_' + n + '_rate']   = row.rate;
  });
  return data;
}

/**
 * Write a sample's records into the OPEN project (createProject() has
 * just made it current). In order, and the first refused write stops
 * the rest — private mode, a full quota — exactly as one try block
 * around the writes always did; the project itself still exists.
 */
export function writeSampleData(sample, { scenes, contacts, pages, story, match }) {
  try {
    const put = (key, value) => { if (!writeText(key, JSON.stringify(value))) throw new Error('storage refused ' + key); };
    if (match) linkSampleScenes(scenes, sampleScript(sample, pages).elements, match);
    put(FEATURE_KEY,  sampleBlueprint(sample, scenes));
    put(SCENES_KEY,   { scenes });
    put(CONTACTS_KEY, {
      contacts, callSheets: sampleCallSheets(sample, contacts)
    });
    put(LOCS_KEY,     sampleLocations(sample));
    put(SHOTS_KEY,    sampleShots(sample));
    put(SCRIPT_KEY,   sampleScript(sample, pages));
    put(LIB_CALC_KEY, sampleCalc(sample));
    if (story) put(STORY_KEY, story);
  } catch (e) { /* private mode — the project itself still exists */ }
}

/** Give each sample scene its heading's id (`scriptElId`) at creation,
    with the confident tiers scene-sync.js's rule 5 uses — `match` is
    src/lib/screenplay-analysis.js (passed in, so this module stays light
    and pure). The rows used to ship unlinked and were linked by the
    first sync, so a heading changed BEFORE that sync left its row in
    the Breakdown for good: unlinked rows are never binned (QA r2).
    Mutates `scenes`; returns how many were linked. */
export function linkSampleScenes(scenes, elements, { matchScenes, isConfident }) {
  let n = 0;
  const m = matchScenes(scenes, elements);
  for (const p of m.pairs) {
    if (p.slice && p.slice.id && isConfident(p.how) && !p.scene.scriptElId) { p.scene.scriptElId = p.slice.id; n++; }
  }
  return n;
}

export default {
  linkSampleScenes, sampleDays, samplePages, sampleScenes, applyStoryBeats, sampleBlueprint, sampleContacts,
  sampleCallSheets, sampleLocations, sampleShots, sampleScript, sampleCalc, writeSampleData
};
