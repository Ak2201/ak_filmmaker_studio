/* ============================================================
   AI HISTORY — READ: the open project's records, for ai-history.js
   ------------------------------------------------------------
   Reads each owning model (so every model's own cleaning applies) and
   hands the arrays to the pure collectAI(). Reads only, writes nothing,
   no document. LAZY: the Desk's History tab and the dashboard's AI
   disclosure import this at a click, so none of these models is pulled
   into a page that did not already have it.
   ============================================================ */
import * as Shots from './shots.js';
import * as Scenes from './scenes.js';
import * as Script from './script.js';
import * as Story from './story.js';
import * as Chars from './characters.js';
import * as Contacts from './contacts.js';
import * as Loc from './locations.js';
import * as Edit from './editlog.js';
import { collectAI } from './ai-history.js';

const safe = (fn, fallback) => { try { const v = fn(); return v == null ? fallback : v; } catch (e) { return fallback; } };

/** The records an AI run may have stamped, by source name (see collectAI). */
export function readSources() {
  const story = safe(() => Story.loadStory(), null);
  const doc = safe(() => Script.loadScript(), { elements: [], documents: [] });
  const scenes = safe(() => Scenes.listScenes(), []);
  const slugById = new Map(scenes.map((s) => [s.id, Scenes.slug(s)]));
  const edit = safe(() => Edit.loadEdit(), { scenes: {} });
  return {
    shots: safe(() => Shots.listShots(), []),
    frames: safe(() => Shots.listFrames(), []),
    blocks: safe(() => Shots.listBlocks(), []),
    scenes,
    elements: doc.elements || [],
    documents: doc.documents || [],
    story: story ? { id: 'story', ...story } : null,
    steps: story ? story.outline || [] : [],
    marks: story ? story.marks || [] : [],
    characters: safe(() => Chars.loadCharacters(), []),
    notes: safe(() => Story.listVault(), []),
    callsheets: safe(() => Contacts.listCallSheets(), []),
    /* the recce cards of the places the scenes name, by their stored key (no list export in locations.js:
       it is on many pages' first paint) */
    recce: safe(() => Loc.locationIndex(scenes).map((l) => ({ id: l.key, ...l.recce, name: l.name })), []),
    edits: Object.entries((edit && edit.scenes) || {}).map(([sceneId, e]) => ({ ...e, id: sceneId, label: slugById.get(sceneId) || '' }))
  };
}

/** Every AI stamp in the open project, as entries (ai-history.js collectAI). */
export const readProjectAI = () => collectAI(readSources());

export default { readSources, readProjectAI };
