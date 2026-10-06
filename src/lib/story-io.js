/* ============================================================
   STORY I/O — the story's ways in and out, shared by every page
   that offers them
   ------------------------------------------------------------
   story.html had these to itself: reading a synopsis out of a
   .docx / .pdf / .txt, the Dragon sample's story, the synopsis
   .txt and outline .md downloads, and which blueprint field holds
   which beat. The blueprints now offer the same things in Part I
   (src/ui/story-kit.js, plan rev. 3 §3), so they live here, once,
   and story.html imports them. A second copy is how the two pages
   would come to disagree about what a file holds.

   IT READS, AND IT WRITES ONLY `fms_story_v1`, through story.js.
   The blueprint blobs are read here and never written: a beat a
   writer typed in step 08 stays the blueprint's own, and the copy
   into the story is an explicit click in story-kit.js.
   ============================================================ */
import Store from './store.js';   // must evaluate before anything reads localStorage
import { h } from './dom.js';
import * as Story from './story.js';
import sample from '../data/sample.dragon.json';

/* The two blueprint blobs, READ ONLY here. The same strings the
   pages, the launcher and the backup format use; they are storage
   keys and a contract with saved work. */
export const FEATURE_KEY = 'fms_filmmaker_combined_v1';
export const SHORT_KEY = 'fms_shortfilm_blueprint_v1';

/* Which blueprint field holds which beat. Feature step 08's fifteen
   fields, b01..b15, are the fifteen Save the Cat! beats in order —
   the table's rows say so. Short step 04's five cells are the short
   five-beat, by name. The Story page shows these answers beside its
   beats; the blueprints show the Story page's steps beside these
   fields. One table, read both ways. */
const STC = ['opening_image', 'theme_stated', 'setup', 'catalyst', 'debate', 'break_into_two', 'b_story',
  'fun_and_games', 'midpoint', 'bad_guys_close_in', 'all_is_lost', 'dark_night', 'break_into_three', 'finale', 'final_image'];
export const BLUEPRINT_BEATS = {
  feature: {
    fw: 'save_the_cat', key: FEATURE_KEY, step: '08', name: 'Feature blueprint, step 08',
    fields: Object.fromEntries(STC.map((id, i) => [id, 'b' + String(i + 1).padStart(2, '0')]))
  },
  short: {
    fw: 'short_five', key: SHORT_KEY, step: '04', name: 'Short film blueprint, step 04',
    fields: { setup: 'b1_setup', disturbance: 'b2_disturb', escalation: 'b3_escalate', turn: 'b4_turn', image: 'b5_image' }
  }
};

const text = (v) => (typeof v === 'string' ? v.trim() : '');

/** A blueprint's saved answers (through the proxy: the open project). */
export function readBlueprint(ns = 'feature') {
  const key = (BLUEPRINT_BEATS[ns] || BLUEPRINT_BEATS.feature).key;
  try { const v = JSON.parse(localStorage.getItem(key) || '{}'); return v && typeof v === 'object' ? v : {}; }
  catch (e) { return {}; }
}

/** The field key that holds `beatId` in blueprint `ns`, or ''. */
export const blueprintField = (ns, beatId) => ((BLUEPRINT_BEATS[ns] || {}).fields || {})[beatId] || '';

/** What the writer typed for `beatId` in blueprint `ns`. */
export const blueprintBeatText = (ns, beatId, bp = readBlueprint(ns)) => text(bp[blueprintField(ns, beatId)]);

/** Every beat of the blueprint's framework with its field and answer. */
export function blueprintBeats(ns, bp = readBlueprint(ns)) {
  const map = BLUEPRINT_BEATS[ns];
  if (!map) return [];
  return Story.frameworkById(map.fw).beats.map((b) => ({ beat: b, key: map.fields[b.id] || '', text: text(bp[map.fields[b.id]]) }));
}

/** Nothing written in the story at all — the Story page's own test
 *  for showing its start cards. */
export const isEmptyStory = (s) => !String(s.source || '').trim() && !(s.marks || []).length &&
  !(s.outline || []).length && !String(s.idea || '').trim() && !String(s.logline || '').trim();

/* ---- reading a file ------------------------------------------ */

/* A PDF comes back laid out as on the page: hard line breaks at the
   margin and indentation. A synopsis is prose, so rejoin wrapped lines
   into paragraphs and keep blank lines as paragraph breaks. */
export const reflow = (t) => t.split(/\n\s*\n/).map((p) => p.split('\n').map((l) => l.trim()).filter(Boolean).join(' ')).filter(Boolean).join('\n\n');

/** The prose in a .docx, .pdf or text file, normalised. Throws an
 *  Error whose message is the sentence to show. */
export async function readSynopsisFile(file) {
  const name = file.name || 'file';
  const lower = name.toLowerCase();
  let out = '';
  try {
    if (lower.endsWith('.docx')) {
      const { extractDocxText } = await import('./docx-text.js');
      const res = await extractDocxText(await file.arrayBuffer());
      if (res.fatal) throw new Error(res.fatal);
      out = res.text;
    } else if (lower.endsWith('.pdf') || file.type === 'application/pdf') {
      const { extractLayoutText } = await import('./pdf-text.js');
      const res = await extractLayoutText(await file.arrayBuffer());
      if (res.fatal) throw new Error(res.fatal);
      out = reflow(res.text || '');
    } else {
      out = await file.text();
    }
  } catch (e) {
    throw new Error((e && e.message) || 'That file could not be read.');
  }
  out = String(out || '').replace(/\r\n?/g, '\n').trim();
  if (!out) throw new Error('That file has no text in it.');
  return { name, text: out };
}

/** The confirm a replacing import asks, word for word on both pages. */
export const replaceQuestion = (name) =>
  `Replace the synopsis on this page with ${name}? Highlights whose passages are not in the new text will show as detached.`;
export const importedSentence = (r) =>
  `Imported ${r.name} — ${r.text.split(/\s+/).length.toLocaleString()} words.`;

/* ---- the sample ----------------------------------------------- */

/* The sample's story is a lazy chunk (vite.config.js), read on the
   click. If it cannot load — offline before it was ever cached — the
   sample blueprint's synopsis is the fallback, as it always was. */
export async function sampleStory() {
  try {
    const st = (await import('../data/sample.dragon.story.json')).default.story;
    return { ...Story.blankStory(), ...JSON.parse(JSON.stringify(st)) };
  } catch (e) {
    const s = Story.blankStory();
    s.source = String(sample.blueprint && sample.blueprint.lad_2_synopsis || '').trim();
    s.sourceName = sample.title + ' (sample)';
    return s;
  }
}

/* ---- exports -------------------------------------------------- */

export function projectTitle() {
  try { const p = Store.currentProject && Store.currentProject(); return (p && p.title) || ''; } catch (e) { return ''; }
}
export function slug() {
  return (projectTitle() || 'story').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'story';
}
export function download(name, body, type) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export const canExportSynopsis = (s) => !!String(s.source || '').trim();
export const canExportOutline = (s) => !!((s.outline || []).length || (s.marks || []).length || String(s.logline || '').trim());

/** synopsis .txt — false when there is no synopsis. */
export function exportSynopsis(s) {
  if (!canExportSynopsis(s)) return false;
  download(slug() + '-synopsis.txt', Story.synopsisText(s), 'text/plain;charset=utf-8');
  return true;
}
/** the beat sheet and step outline as .md, in the story's own format. */
export function exportOutline(s) {
  download(slug() + '-outline.md', Story.outlineMarkdown(s, s.framework, { title: projectTitle() }), 'text/markdown;charset=utf-8');
  return true;
}

export default {
  FEATURE_KEY, SHORT_KEY, BLUEPRINT_BEATS, readBlueprint, blueprintField, blueprintBeatText, blueprintBeats,
  isEmptyStory, reflow, readSynopsisFile, replaceQuestion, importedSentence, sampleStory,
  projectTitle, slug, download, canExportSynopsis, canExportOutline, exportSynopsis, exportOutline
};
