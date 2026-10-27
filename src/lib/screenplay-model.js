/* ============================================================
   SCREENPLAY MODEL — what screenplay.html works out, without the DOM
   ------------------------------------------------------------
   The Screenplay Writer's derivations and sentences: the draft
   label, the type pill's Alt+digit, the hint strip's key line, the
   status strip's words / pages / running time, the position strip's
   scene and shots, the running-time split against the target, the
   import's one-line reading. src/pages/screenplay.js keeps building
   the DOM, wiring events and holding view state (docs/ARCHITECTURE.md).

   Pure: no `document`, no storage, no view imports. The screenplay
   analysis is passed IN (`A`) because the page loads it lazily, and
   a static import here would put it in the page's first paint.
   ============================================================ */
import Keys from './write-keys.js';
import { latestDraft, changedSinceDraft } from './drafts.js';
import { pageCount, formatPages, formatRuntime, wordCount } from './script.js';
import { sceneLabel } from './caret-position.js';

/* ---- the crumb ------------------------------------------------- */
/** "Draft 3 · unsaved draft changes", or "No numbered draft yet" (the autosave is a separate status). */
export function draftLabel(doc) {
  const last = latestDraft(doc);
  if (!last) return 'No numbered draft yet';
  return last.name + (changedSinceDraft(doc) ? ' · unsaved draft changes' : '');
}

/** Nothing typed on any line yet. */
export const isBlankScript = (elements) => elements.every((e) => !String(e.text || '').trim());

/** The start hint shows while the script is one empty line (or none). */
export const showStartHint = (elements) =>
  elements.length <= 1 && elements.every((e) => !String(e.text || '').trim());

/* ---- the type pill and the hint strip --------------------------- */
/** '[Alt+3]' for a type under this preset, or '' if no digit sets it. */
export function typeKeyHint(type, preset, known) {
  const dm = Keys.digitMap(preset, known);
  const digit = Object.keys(dm).find((d) => dm[d] === type);
  return digit ? '[Alt+' + digit + ']' : '';
}

/* The chip bar's short labels. The ORDER is the preset's Alt+digit
   order (Keys.cycleOrder), so the 4th chip is what Alt+4 sets and the
   chips agree with the type menu and the shortcuts (QA: the bar was a
   fixed list with Dialogue before Paren and no Shot). */
const CHIP_LABELS = { scene: 'Scene', action: 'Action', character: 'Character', paren: 'Paren',
  dialogue: 'Dialogue', transition: 'Trans', shot: 'Shot' };
/** [{ id, label }] for the chip bar, in the preset's digit order. */
export function chipTypes(preset, known) {
  return Keys.cycleOrder(preset, known).map((id) => ({ id, label: CHIP_LABELS[id] || typeName(id) }));
}

/** A type's name as the hint strip says it. */
export const typeName = (t) => (Keys.TYPE_NAMES && Keys.TYPE_NAMES[t]) || t;

/** Where Enter and Tab go from this line, from the same tables the
    keys obey: "Enter → Action · Tab → Character · Alt+1–7 any type". */
export function tipKeysLine(type, empty, prefs, known) {
  const ret = Keys.returnNext(type, prefs, known);
  const tab = Keys.tabAction(type, empty, false, known);
  return [
    ret ? 'Enter → ' + typeName(ret) : null,
    tab ? 'Tab → ' + typeName(tab.type) : null,
    'Alt+1–7 any type'
  ].filter(Boolean).join(' · ');
}

/* ---- the status strip ------------------------------------------ */
/** Words (formatted), pages and whether anything is written. */
export function scriptStats(elements) {
  /* A blank page is 0 pages, not the 0.1 one empty heading line measures
     to — the strip read "Words 0 · Pages 0.1 · Runtime —". */
  const written = elements.some((e) => String(e.text || '').trim());
  return {
    written,
    pages: written ? pageCount(elements) : 0,
    words: elements.reduce((n, e) => n + wordCount(e.text), 0).toLocaleString()
  };
}

/** The running time from the analysis' per-scene estimate (dialogue
    and action at speaking pace), falling back to a page a minute when
    the estimate is nothing: { text, minutes }. */
export function estimatedRuntime(A, elements, pages) {
  const sec = A.sliceScript(elements).reduce((n, sl) => n + A.estimateSlice(sl).seconds, 0);
  /* Whole minutes the way Script analysis rounds them (runtimeMinutes:
     whole seconds, minutes floored). Math.round here put the writer a
     minute ahead of the analysis tab for the same script — 2H 17M
     against 2h 16m (QA r4). */
  const mins = A.runtimeMinutes(sec);
  return {
    text: sec ? formatRuntime(mins) : formatRuntime(pages),
    minutes: sec ? mins : Math.round(pages)
  };
}

/** The running time split into dialogue and the rest, by the same
    arithmetic as the estimate, so it always sums to the total. */
export function splitRuntime(A, elements) {
  let dia = 0;
  let all = 0;
  for (const sl of A.sliceScript(elements)) {
    const est = A.estimateSlice(sl);
    all += est.seconds;
    dia += est.dialogueWords / A.DIALOGUE_WPS + est.speeches * A.SPEAKER_BEAT;
  }
  dia = Math.min(dia, all);
  return { all, dia, act: Math.max(0, all - dia) };
}

/** "on target", "4 min over", "2 min under". */
export function targetDeltaText(estimateMin, targetMin) {
  const d = estimateMin - targetMin;
  return d === 0 ? 'on target' : Math.abs(d) + ' min ' + (d > 0 ? 'over' : 'under');
}

/** "Target 120 min (Reports)" / "(Edit Log)". */
export const targetLabel = (target) =>
  'Target ' + target.minutes + ' min' + (target.source === 'edit' ? ' (Edit Log)' : ' (Reports)');

/** Where the beats should land: a page a minute against the target
    when one is set; otherwise a feature's ~110 pages or a short's ~15. */
export function targetPagesFor(target, projectFormat) {
  if (target.minutes > 0) return target.minutes;
  return /short/i.test(String(projectFormat || '')) ? 15 : 110;
}

/* ---- the position strip ---------------------------------------- */
/** "Scene 4 of 31" ("Scene 12A (13 of 37)" with locked numbers), "31
    scenes", or "No scenes yet". */
export function scenePosText(p, total, locked) {
  return p && p.scene ? sceneLabel(p, total, locked)
    : total ? total + (total === 1 ? ' scene' : ' scenes') : 'No scenes yet';
}

/** "6 shots · Pan 2, Dolly 1", or "No shots planned". */
export function shotsSummary(list) {
  const moves = new Map();
  list.forEach((x) => { const m = String(x.movement || '').trim(); if (m) moves.set(m, (moves.get(m) || 0) + 1); });
  const how = [...moves].map(([m, n]) => m + ' ' + n).join(', ');
  return list.length
    ? list.length + (list.length === 1 ? ' shot' : ' shots') + (how ? ' · ' + how : '')
    : 'No shots planned';
}

/* ---- import and export ------------------------------------------ */
/** What a file read as, in one line. */
export function importReadText(name, plan) {
  return 'Read ' + (name ? '“' + name + '” ' : '') + 'as ' + (plan.formatLabel || plan.format) + ': '
    + plan.elements.length + (plan.elements.length === 1 ? ' line, ' : ' lines, ') + formatPages(plan.pages) + ' pages, '
    + plan.scenes.length + (plan.scenes.length === 1 ? ' scene.' : ' scenes.');
}

/** What an import did, as the toast says it. */
export const importDoneText = (done) =>
  'Imported ' + done.elements + (done.elements === 1 ? ' line and ' : ' lines and ') + done.scenes + (done.scenes === 1 ? ' scene' : ' scenes') + '.'
  + (done.binned > 0
    ? ' The Breakdown’s earlier ' + (done.binned === 1 ? 'scene is' : done.binned + ' scenes are')
      + ' in its bin, with ' + (done.binned === 1 ? 'its' : 'their') + ' shots and notes; restore any you want from there.'
    : '')
  + ' Next: Screenplay Analysis.';

/** The replace-import confirmation: what happens to the script AND to the
    Breakdown (QA: it named only the draft, and the rows' work went to the
    bin unannounced). `sceneCount` is the Breakdown's rows now. */
export const importReplaceBody = (sceneCount) =>
  'A draft of the current one is saved first, so it can be restored.'
  + (sceneCount > 0
    ? ' The Breakdown’s ' + (sceneCount === 1 ? 'scene goes' : sceneCount + ' scenes go')
      + ' to its bin, with ' + (sceneCount === 1 ? 'its' : 'their') + ' shots and notes, and the imported scenes take their place.'
    : '');

/** The working-copy PDF's subtitle. */
export const pdfSubtitle = (doc) =>
  [draftLabel(doc), formatPages(pageCount(doc.elements)) + ' pages'].filter(Boolean).join(' · ');
