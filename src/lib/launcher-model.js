/* ============================================================
   LAUNCHER MODEL — what each module on the map holds, derived
   ------------------------------------------------------------
   Moved out of src/ui/launcher.js when the view and the logic were
   split (docs/ARCHITECTURE.md). One snapshot per render, and one probe
   per module id in navigation.json that turns it into a state line.
   Reads only: the launcher must never write during a render (the
   idle-write assertion in verify is watching).
   ============================================================ */
import { listScenes, elementIndex } from './scenes.js';
import { listShots, listFrames, listBoards, countEntries } from './shots.js';
import { loadScript, pageCount, formatPages, hasTitlePage, TITLE_FIELDS } from './script.js';
import { listContacts, listCallSheets } from './contacts.js';
import { locationIndex, listMedia, listDayDates, shootDayOf, castOf } from './locations.js';
import { loadStory, listVault } from './story.js';
import { coverage } from './editlog.js';
import { listItems as listDeliverables, progress as deliverablesProgress } from './deliverables.js';
import { readJSON } from './prefs.js';
import { FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY, DISSECT_KEY, WORKBENCH_KEY } from './hub-keys.js';

/* The three blueprint-era blobs have no model module of their own —
   they are field bags read by the page that owns them. The strings
   are the same ones in store.js SCOPED_KEYS and hub.js, which is the
   existing precedent for naming them at the point of use. They are
   read here and never written; if one is ever renamed under a
   migration, this file reports "not started" rather than losing
   anything. */
/* (FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY, DISSECT_KEY, WORKBENCH_KEY:
   src/lib/hub-keys.js, the same strings.) */

/* ------------------------------------------------------------
   READING THE STUDIO
   ------------------------------------------------------------
   One snapshot per render. Every read is wrapped: a corrupt blob or
   a browser with storage switched off must cost the tile its state
   line, never the page — the console-error assertion is one of the
   things verify fails on, and the hub is the page a lost user lands
   on first.
   ------------------------------------------------------------ */

export function safe(fn, fallback) {
  try {
    const v = fn();
    return v === undefined || v === null ? fallback : v;
  } catch (e) {
    return fallback;
  }
}

function blob(key) {
  return safe(() => {
    const parsed = readJSON(key, null);
    return parsed && typeof parsed === 'object' ? parsed : {};
  }, {});
}

/** Does this stored value represent something the user actually wrote? */
function written(v) {
  if (v === true) return true;
  if (typeof v === 'string') return v.trim().length > 0;
  if (Array.isArray(v)) return v.some(written);
  if (v && typeof v === 'object') return Object.values(v).some(written);
  return false;
}

/** How many distinct blueprint steps have anything in them.
    `map` turns a key prefix into a step ordinal; Volume II of the
    feature starts at 13, which is why it carries an offset. */
function stepsTouched(bag, map) {
  const seen = new Set();
  for (const [k, v] of Object.entries(bag)) {
    if (!written(v)) continue;
    for (const [re, offset] of map) {
      const m = k.match(re);
      if (m) { seen.add(parseInt(m[1], 10) + offset); break; }
    }
  }
  return seen.size;
}

/** Budget rows are flat `ci_<row>_<field>` keys; count the rows with
    anything on them rather than the keys, which over-counts by three. */
function costedRows(bag) {
  const rows = new Set();
  for (const [k, v] of Object.entries(bag)) {
    const m = k.match(/^ci_(\d+)_/);
    if (m && written(v)) rows.add(m[1]);
  }
  return rows.size;
}

export function snapshot() {
  const scenes = safe(listScenes, []);
  const script = safe(loadScript, { elements: [], revisions: [], documents: [] });
  const dissect = safe(() => blob(DISSECT_KEY).mine, null) || {};
  const days = new Set(scenes.map(shootDayOf).filter(Boolean));
  const cast = new Set();
  scenes.forEach((s) => castOf(s).forEach((c) => cast.add(String(c).toLowerCase())));

  return {
    scenes,
    days,
    cast,
    tagged: scenes.filter((s) => Object.values(s.elements || {}).some((v) => v && v.length)).length,
    elements: safe(elementIndex, []).length,
    shots: safe(listShots, []).length,
    frames: safe(listFrames, []).length,
    boards: safe(listBoards, []),
    script,
    pages: safe(() => pageCount(script.elements), 0),
    contacts: safe(listContacts, []).length,
    callSheets: safe(listCallSheets, []).length,
    media: safe(listMedia, []).length,
    locations: safe(() => locationIndex(scenes), []).length,
    dates: Object.keys(safe(listDayDates, {})).length,
    feature: stepsTouched(blob(FEATURE_KEY), [[/^s(\d+)_/, 0], [/^v2s(\d+)_/, 12], [/^fc_v1_(\d+)/, 0], [/^fc_v2_(\d+)/, 12]]),
    short: stepsTouched(blob(SHORT_KEY), [[/^s(\d+)_/, 0], [/^ck_s(\d+)_/, 0]]),
    costed: costedRows(blob(LIB_CALC_KEY)),
    sequences: Array.isArray(dissect.sequences) ? dissect.sequences.length : 0,
    dissectStarted: written(dissect.thesis) || written(dissect.title) || written(dissect.engine),
    studied: Object.values(blob(WORKBENCH_KEY)).filter(written).length,
    story: safe(loadStory, { source: '', marks: [] }),
    clips: safe(listVault, []).length,
    /* Post. Both derived at read time from models already in this
       snapshot plus their own small key; see editlog.js / deliverables.js. */
    edit: safe(() => coverage(scenes), null),
    deliverables: safe(() => deliverablesProgress(listDeliverables()), null)
  };
}


const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/* A state is { kind, text }. `work` means this module holds something
   of the user's; `empty` means it is waiting; `ref` means it is
   reference material and emptiness is not a state it can be in. Three
   kinds rather than a boolean, because "no festivals saved" would be
   a nonsense thing to say about the glossary. */
const work = (text) => ({ kind: 'work', text });
const empty = (text) => ({ kind: 'empty', text });
const ref = (text) => ({ kind: 'ref', text });

/* Keyed by the module id in navigation.json. A module with no entry
   renders without a state line — honest silence rather than a
   confident "0", which for half of these would be wrong. */
const PROBES = {
  'story-beats': (s) => (s.story.marks.length ? work(plural(s.story.marks.length, 'passage tagged', 'passages tagged'))
                        : String(s.story.source || '').trim() ? empty('synopsis, nothing tagged') : empty('no synopsis yet')),
  'idea-vault':  (s) => (s.clips ? work(plural(s.clips, 'clipping', 'clippings')) : empty('nothing clipped yet')),
  'feature-blueprint': (s) => (s.feature ? work(plural(s.feature, 'step started', 'steps started')) : empty('not started')),
  'short-blueprint':   (s) => (s.short ? work(plural(s.short, 'step started', 'steps started')) : empty('not started')),
  glossary:            () => ref('reference'),
  'case-studies':      (s) => (s.studied ? work(plural(s.studied, 'film worked', 'films worked')) : ref('reference · no notes yet')),
  dissection:          (s) => (s.sequences ? work(plural(s.sequences, 'sequence mapped', 'sequences mapped'))
                              : s.dissectStarted ? work('started') : empty('not started')),

  screenplay: (s) => (s.pages ? work(formatPages(s.pages) + ' pages written') : empty('no pages yet')),
  revisions:  (s) => (s.script.revisions.length ? work(plural(s.script.revisions.length, 'draft saved', 'drafts saved')) : empty('no drafts yet')),
  /* `docs` is the Title Page module now (navigation.json); it counts the
     title page's filled fields, not the pitch documents it once listed. */
  docs:       (s) => (hasTitlePage(s.script.titlePage)
                       ? work(plural(TITLE_FIELDS.filter((f) => String(s.script.titlePage[f] ?? '').trim()).length, 'field filled', 'fields filled'))
                       : empty('not filled in yet')),

  'scene-list': (s) => (s.scenes.length ? work(plural(s.scenes.length, 'scene', 'scenes')) : empty('no scenes yet')),
  breakdowns:   (s) => (s.tagged ? work(`${s.tagged} of ${s.scenes.length} tagged`)
                       : s.scenes.length ? empty('nothing tagged yet') : empty('needs scenes first')),
  'auto-tag':   (s) => (s.pages ? work('reads ' + formatPages(s.pages) + ' pages') : empty('needs a screenplay')),
  'screen-time':(s) => (s.scenes.length ? work(plural(s.scenes.length, 'scene timed', 'scenes timed')) : empty('needs scenes first')),
  'cast-matrix':(s) => (s.cast.size ? work(plural(s.cast.size, 'character', 'characters')) : empty('no cast yet')),
  'pitch-deck': (s) => (String(s.story.source || '').trim() || s.feature ? work('ready to export') : empty('needs a synopsis')),
  elements:     (s) => (s.elements ? work(plural(s.elements, 'element', 'elements')) : empty('no elements yet')),
  stripboard:   (s) => (s.days.size ? work(plural(s.days.size, 'shoot day', 'shoot days'))
                       : s.scenes.length ? empty('not scheduled yet') : empty('needs scenes first')),
  sides:        (s) => (s.days.size ? work(plural(s.days.size, 'day of sides', 'days of sides')) : empty('needs a schedule')),
  reports:      (s) => (s.scenes.length ? work(plural(s.scenes.length, 'scene to report', 'scenes to report')) : empty('nothing to report yet')),

  'shot-list': (s) => (s.shots ? work(plural(s.shots, 'shot', 'shots')) : empty('no shots yet')),
  storyboard:  (s) => (s.frames ? work(plural(s.frames, 'frame', 'frames')) : empty('no frames yet')),
  lookbook:    (s) => {
    const entries = safe(() => countEntries(s.boards), 0);
    if (!s.boards.length) return empty('no boards yet');
    return work(`${plural(s.boards.length, 'board', 'boards')} · ${plural(entries, 'image', 'images')}`);
  },

  budget:   (s) => (s.costed ? work(plural(s.costed, 'line costed', 'lines costed')) : empty('nothing costed yet')),
  contacts: (s) => (s.contacts ? work(plural(s.contacts, 'person', 'people')) : empty('nobody added yet')),
  calendar: (s) => (s.dates ? work(plural(s.dates, 'day dated', 'days dated'))
                   : s.days.size ? empty('no dates set') : empty('needs a schedule')),
  media:    (s) => (s.media ? work(plural(s.media, 'file', 'files')) : empty('no files yet')),

  locations:     (s) => (s.locations ? work(plural(s.locations, 'location', 'locations')) : empty('no locations yet')),
  'call-sheets': (s) => (s.callSheets ? work(plural(s.callSheets, 'call sheet', 'call sheets')) : empty('none yet')),
  dood:          (s) => (s.cast.size ? work(plural(s.cast.size, 'cast member', 'cast members')) : empty('no cast tagged')),

  'edit-log': (s) => {
    if (!s.scenes.length) return empty('needs scenes first');
    const c = s.edit && s.edit.counts;
    if (!c) return empty('nothing marked yet');
    if (!c.inCan && !c.owed && !c.inCut) return empty('nothing marked shot yet');
    return work(c.owed ? plural(c.owed, 'scene still owed', 'scenes still owed') : 'everything the cut needs is in');
  },
  deliverables: (s) => {
    const p = s.deliverables;
    if (!p || (!p.done && !p.doing && !p.skipped)) return empty('nothing ticked yet');
    return work(`${p.done} of ${p.total} delivered`);
  }
};

export function stateOf(m, snap) {
  const probe = PROBES[m.id];
  if (!probe) return null;
  return safe(() => probe(snap), null);
}

/** The project home's rows (src/data/launcher-rows.json) resolved against
 *  the map. Pure: `groups` is moduleGroups(), `rows` the JSON's `rows`.
 *  An id the map does not have is skipped (test:launcher-rows is what
 *  fails on it); `hidden(id)` marks a module nobody can open (kept in the
 *  list so plan-gate and the DOM still see it). A row with no live module
 *  comes back `hidden: true`. */
export function resolveRows(rows, groups, hidden = () => false) {
  const byId = new Map();
  (groups || []).forEach((g) => (g.modules || []).forEach((m) => { if (!byId.has(m.id)) byId.set(m.id, m); }));
  return (rows || []).map((r) => {
    const modules = (r.modules || []).map((id) => byId.get(id)).filter(Boolean)
      .map((m) => ({ m, hidden: !!hidden(m.id) }));
    return { ...r, modules, hidden: !modules.some((x) => !x.hidden) };
  });
}

export default { safe, snapshot, stateOf, resolveRows };
