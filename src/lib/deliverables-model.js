/* ============================================================
   DELIVERABLES PAGE MODEL — what deliverables.html reads, no DOM
   ------------------------------------------------------------
   src/lib/deliverables.js owns the checklist and its storage. This
   file is the rest of what src/pages/deliverables.js needs and the
   screen does not: the blueprint's two answers it quotes (READ from
   the open project's blueprint blob, never written here), the
   project's format, which tab a hash names, and the sentences the
   certification and dialogue-list tabs print around their data.
   ============================================================ */
import { readJSON } from './prefs.js';
import Store from './store.js';
import { loadScript } from './script.js';
import { listScenes } from './scenes.js';
import { dialogueRows, REEL_MINUTES } from './dialogue-list.js';

/* The feature blueprint's blob. Read through the store.js proxy (prefs
   goes through the same Storage.prototype), so it is the open
   project's; never written from this page. */
const FEATURE_KEY = 'fms_filmmaker_combined_v1';

/** The blueprint's post step holds two free-text answers this page
    sits beside: who needs what (`po_deliver_list`) and the release
    plan (`po_release_plan`). Empty strings when there are none. */
export function blueprintSays() {
  try {
    const bag = readJSON(FEATURE_KEY, {});
    return {
      list: String((bag && bag.po_deliver_list) || '').trim(),
      plan: String((bag && bag.po_release_plan) || '').trim()
    };
  } catch (e) { return { list: '', plan: '' }; }
}

/** The open project's format, or ''. */
export function projectFormat() {
  try { const p = Store.currentProject && Store.currentProject(); return (p && p.format) || ''; }
  catch (e) { return ''; }
}

/* Which tab. #certification and #dialogue-list land on their tab;
   anything else (#festivals, #checklist, a group's #g-…) is the
   checklist. */
export const TABS = [
  { id: 'checklist',     label: 'Checklist' },
  { id: 'certification', label: 'Certification' },
  { id: 'dialogue-list', label: 'Dialogue list' }
];
export function tabFromHash(hash) {
  const h = String(hash || '').replace(/^#/, '');
  return TABS.some((t) => t.id === h && t.id !== 'checklist') ? h : 'checklist';
}

/** The tab an arrow, Home or End key moves to from `id`, or '' for any
    other key (the WAI-ARIA tabs pattern). */
export function tabForKey(id, key) {
  const ids = TABS.map((t) => t.id);
  const i = ids.indexOf(id);
  let j = -1;
  if (key === 'ArrowRight') j = (i + 1) % ids.length;
  else if (key === 'ArrowLeft') j = (i - 1 + ids.length) % ids.length;
  else if (key === 'Home') j = 0;
  else if (key === 'End') j = ids.length - 1;
  return j < 0 ? '' : ids[j];
}

/** The items a filter shows: everything, or those a WHEN asks for plus
    the 'always' items any screening needs. */
export const shownItems = (all, show) =>
  (show === 'all' ? all : all.filter((i) => i.when === show || i.when === 'always'));

export const TOOL_LINK = {
  'dialogue-list': 'Prepare the dialogue list and the subtitle skeleton',
  certification: 'Check the script for certification flags'
};

export const fmtChecked = (iso) => {
  const d = new Date(String(iso || '') + 'T00:00:00');
  return Number.isNaN(d.getTime()) ? String(iso || '') : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
};

/** A source URL's host, for a link's text; the URL itself if it will not parse. */
export function hostOf(u) {
  try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; }
}

/** A festival's format line. */
export const festivalFormat = (r) => (r.format
  ? 'Format: ' + r.format + (r.maxLength ? ' · ' + r.maxLength : '')
  : (r.known ? 'Format not recorded in the catalogue' : 'Not in the catalogue — check their page'));

/** A streamer group's kind line. */
export const streamerKind = (g) => (g.kind === 'workflow' ? 'our own checklist · checked ' + fmtChecked(g.checked)
  : g.published ? 'published spec · checked ' + fmtChecked(g.checked) : 'no published spec — template');

/* ---- certification -------------------------------------------- */
export const KIND_LABEL = { requirement: 'Requirement', review: 'For the committee', caution: 'Legal caution' };
export const CONFIDENCE_LABEL = {
  official: 'Read on the regulator’s own site.',
  secondary: 'Read from reports of the official text, not the text itself.',
  uncertain: 'Uncertain — reported, not confirmed.'
};
export const TYPE_LABEL = { dialogue: 'dialogue', action: 'action', heading: 'heading', paren: 'parenthetical', synopsis: 'scene synopsis', elements: 'breakdown tag' };

/** Why the rating hint says what it says. */
export function hintWhy(hint) {
  return hint.reasons.length
    ? 'Because of: ' + hint.reasons.map((r) => r.label.toLowerCase() + ' (' + r.tier + ', '
        + r.scenes + (r.scenes === 1 ? ' scene' : ' scenes') + ')').join('; ') + '.'
    : 'Nothing in the word lists that this app associates with a higher category.';
}

/** The distinct terms a flag matched, lower-cased, as one short line. */
export function flagTerms(f) {
  const terms = [...new Set(f.hits.map((x) => x.term.toLowerCase()))];
  return terms.slice(0, 6).join(', ') + (terms.length > 6 ? ', …' : '');
}

/** "3 scenes: 4, 9, 12" — the first twelve. */
export function ruleScenes(b) {
  const nums = b.scenes.map((row) => row.number);
  return (b.scenes.length === 1 ? '1 scene: ' : b.scenes.length + ' scenes: ')
    + nums.slice(0, 12).join(', ') + (nums.length > 12 ? ', …' : '');
}

/** How sure a rule's source is, and what to check, as one line ('' for none). */
export function ruleCertainty(r) {
  const conf = CONFIDENCE_LABEL[r.confidence];
  if (!conf && !r.uncertain) return '';
  return [conf, r.uncertain ? 'Check: ' + r.uncertain : ''].filter(Boolean).join(' ');
}

/* ---- dialogue list --------------------------------------------- */

/** Every spoken line, read from the script now. */
export function dialogueData() {
  return dialogueRows(loadScript().elements, listScenes(), { reelMinutes: REEL_MINUTES });
}

/** A line's place: number, reel, scene. */
export const dialogueMeta = (r) => r.n + ' · reel ' + r.reel + (r.scene ? ' · scene ' + r.scene : ' · before the first scene');
/** Who speaks it, with the parenthetical. */
export const dialogueWho = (r) => (r.character || 'NO CUE') + (r.parenthetical ? ' (' + r.parenthetical + ')' : '');

/** The print job's subtitle. */
export const dialogueSubtitle = (dl) =>
  dl.rows.length + ' lines · ' + dl.scenes + ' scenes · reels estimated at ' + REEL_MINUTES + ' minutes';

/** A filename stem from the film's title: "Por Thozhil" → "por-thozhil". */
export function fileBase(title) {
  return (title || 'film').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'film';
}

export default {
  blueprintSays, projectFormat, TABS, tabFromHash, tabForKey, shownItems, TOOL_LINK, fmtChecked, hostOf,
  festivalFormat, streamerKind, KIND_LABEL, CONFIDENCE_LABEL, TYPE_LABEL, hintWhy, flagTerms, ruleScenes,
  ruleCertainty, dialogueData, dialogueMeta, dialogueWho, dialogueSubtitle, fileBase
};
