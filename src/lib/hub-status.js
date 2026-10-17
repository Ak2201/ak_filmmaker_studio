/* ============================================================
   HUB STATUS — where each blueprint stands, read straight out of its
   local data, and the storage summary
   ------------------------------------------------------------
   Moved out of src/pages/hub/resume-cards.js when the hub's view and
   logic were split (docs/ARCHITECTURE.md). Derivations only: nothing
   here draws, and nothing here writes. Every read goes through the
   storage proxy (src/lib/prefs.js), so it is the OPEN project's blob,
   exactly as before.

   The open project's journey is a PARAMETER (`openJourney`), not a
   closure over the page: the page computes it once per render.
   ============================================================ */
import { currentProject } from './store.js';
import { parseNum } from './money.js';
import { NOTE_PREFIX } from './backup.js';
import { STAGES, guideJourney, nextGuideStep } from './journey.js';
import { readText, keys as storedKeys } from './prefs.js';
import { readStoredObject } from './hub-activity.js';
import { FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY } from './hub-keys.js';

/** "Part II · Screenplay", from the journey. */
export function stageLabelOf(id, complete) {
  if (complete) return 'All ' + STAGES.length + ' stages';
  const st = STAGES.find((s) => s.id === id) || STAGES[0];
  return 'Part ' + st.part + ' · ' + st.label;
}

/** The feature's stage line: the open feature project's journey when
 *  there is one, else the guide's own reading of this blob. */
export function featureStageLabel(data, openJourney) {
  const cur = currentProject();
  if (cur && cur.format !== 'short' && openJourney) {
    return stageLabelOf(openJourney.current, openJourney.complete);
  }
  const g = guideJourney('feature', data);
  return g.started ? stageLabelOf(g.current, false) : 'not started';
}

/** @param {object|null} openJourney  the open project's journey (or null) */
export function computeFeatureStatus(openJourney) {
  const data = readStoredObject(FEATURE_KEY);
  const keys = Object.keys(data);
  if (keys.length === 0) return { pct: 0, title: '', stage: featureStageLabel(data, openJourney), stepsDone: {}, lastEditedStep: null };
  const stepsDone = {};
  keys.forEach(k => {
    if (k.startsWith('fc_v1_')) { stepsDone['feat-' + k.slice(6)] = !!data[k]; }
    if (k.startsWith('fc_v2_')) {
      const n = parseInt(k.slice(6), 10);
      if (!isNaN(n)) stepsDone['feat-' + String(n + 12).padStart(2, '0')] = !!data[k];
    }
    const m1 = k.match(/^s(\d+)_/);
    const m2 = k.match(/^v2s(\d+)_/);
    const b  = k.match(/^b(\d+)$/);
    if (m1 && data[k] && String(data[k]).trim()) {
      const n = String(m1[1]).padStart(2, '0');
      stepsDone['feat-' + n] = stepsDone['feat-' + n] || 'partial';
    }
    if (m2 && data[k] && String(data[k]).trim()) {
      const n = String(parseInt(m2[1], 10) + 12).padStart(2, '0');
      stepsDone['feat-' + n] = stepsDone['feat-' + n] || 'partial';
    }
    if (b && data[k] && String(data[k]).trim()) stepsDone['feat-08'] = stepsDone['feat-08'] || 'partial';

  });
  /* The denominator is the fields the blueprint DECLARES, not the
     keys that happen to be saved. Counting the saved blob meant a
     project with eleven filled fields read 100% complete, and the
     resume card offered it as "ready to shoot" while the dashboard
     said 3% for the same data. See src/lib/blueprint-fields.js. */
  /* And it is guideJourney()'s number, the one the project card and
     the dashboard print, rather than a second tally over the same
     fields: three surfaces on two pages reading one project have to
     say one percentage, and a local copy is how they stop agreeing. */
  const pct = guideJourney('feature', data).pct;
  /* The stage is journey.js's answer, not a band of the percentage.
     The bands said "Vol II · Pre-prod" for any blueprint 50–79% full,
     whatever the film actually had in it, and "ready to shoot" for a
     blueprint with no scenes. For the open feature project the stage is
     the journey's current one (guide AND tools); otherwise the guide's
     own reading of this blob. */
  const stage = featureStageLabel(data, openJourney);
  /* journey.js's answer, the same step the dashboard's Continue names. */
  const next = nextGuideStep('feature', data);
  return {
    pct,
    title: data.meta_title || data.v1_title || '',
    stage,
    stepsDone,
    lastEditedStep: next ? next.id : null
  };
}

export function computeShortStatus() {
  const data = readStoredObject(SHORT_KEY);
  const keys = Object.keys(data);
  if (keys.length === 0) return { pct: 0, title: '', runtime: '', stepsDone: {}, lastEditedStep: null };
  const stepsDone = {};
  keys.forEach(k => {
    const m  = k.match(/^s(\d+)_/);
    const cm = k.match(/^ck_s(\d+)_/);
    const bm = k.match(/^b(\d+)_/);
    const pm = k.match(/^p_/);
    const lm = k.match(/^ck_lock_/);
    if (m && data[k] && String(data[k]).trim()) {
      const n = String(m[1]).padStart(2, '0');
      stepsDone['short-' + n] = stepsDone['short-' + n] || 'partial';
    }
    if (cm && data[k] === true) {
      const n = String(cm[1]).padStart(2, '0');
      stepsDone['short-' + n] = true;
    }
    if (bm && data[k] && String(data[k]).trim()) stepsDone['short-04'] = stepsDone['short-04'] || 'partial';
    if (pm && data[k] && String(data[k]).trim()) stepsDone['short-09'] = stepsDone['short-09'] || 'partial';
    if (lm && data[k] === true) stepsDone['short-11'] = true;

    if (k.startsWith('_')) {
      if (k === '_sceneMap' && Array.isArray(data[k])) {
        if (data[k].some(r => Object.values(r).some(v => v && String(v).trim()))) {
          stepsDone['short-06'] = stepsDone['short-06'] || 'partial';
        }
      }
      if (k === '_script' && Array.isArray(data[k])) {
        if (data[k].some(s => s.slug || s.action || (s.dialogues || []).some(d => d.line))) {
          stepsDone['short-07'] = stepsDone['short-07'] || 'partial';
        }
      }
      return;
    }
  });
  /* The same number the project card and the dashboard print —
     guideJourney()'s, against the fields the SHORT blueprint declares.
     This used to add the script scenes and dialogue lines to both
     sides as well, which is the short editor's own scoring and nobody
     else's, so the resume card and the card under it disagreed about
     one film. The script's own progress lives on the Write page. */
  const pct = guideJourney('short', data).pct;
  const next = nextGuideStep('short', data);
  return {
    pct,
    title: data.meta_title || '',
    runtime: data.meta_runtime || '',
    stepsDone,
    lastEditedStep: next ? next.id : null
  };
}

export function computeLibraryStatus() {
  const calc = readStoredObject(LIB_CALC_KEY);
  const seenRows = {};
  Object.keys(calc).forEach(k => {
    const m = k.match(/^ci_(\d+)_(\w+)$/);
    if (!m) return;
    seenRows[m[1]] = seenRows[m[1]] || {};
    seenRows[m[1]][m[2]] = calc[k];
  });
  let count = 0, total = 0;
  Object.keys(seenRows).forEach(idx => {
    const r = seenRows[idx];
    // Was three unanchored suffix tests, the trap CLAUDE.md names:
    // `cr` matched "crew", a bare `l` matched "lens", `k` matched
    // "bank". library.js was fixed years-of-commits ago and this copy
    // never was, so the hub's budget figure and the calculator's
    // could disagree about identical data. One parser now, in lib.
    const days = parseNum(r.days);
    const rate = parseNum(r.rate);
    const sub = days * rate;
    if (sub > 0) { count++; total += sub; }
  });
  return { count, total };
}

/** Bytes the reset list and the private notes hold, through the proxy
 *  (so the open project's copy), and how many notes there are. */
export function storageUsage(allKeys) {
  let bytes = 0, noteCount = 0;
  allKeys.forEach(k => {
    const v = readText(k, null);
    if (v) bytes += v.length;
  });
  for (const key of storedKeys()) {
    if (key && key.startsWith(NOTE_PREFIX)) {
      noteCount++;
      bytes += (readText(key, null) || '').length;
    }
  }
  return { bytes, noteCount };
}

/** The storage line under the doors: what is tracked, and the total. */
export function storageSummary(f, s, l, usage) {
  const kb = (usage.bytes / 1024).toFixed(1);
  const parts = [];
  if (f.pct > 0 || f.title) parts.push('feature blueprint');
  if (s.pct > 0 || s.title) parts.push('short blueprint');
  if (l.count > 0) parts.push('equipment list (' + l.count + ' items)');
  if (usage.noteCount > 0) parts.push(usage.noteCount + ' private notes');
  const summary = parts.length
    ? 'Tracked: ' + parts.join(', ') + '. '
    : 'No projects yet — pick a door above to start a film. ';
  return summary + 'Total local storage: ' + kb + ' KB.';
}

export default { stageLabelOf, featureStageLabel, computeFeatureStatus, computeShortStatus, computeLibraryStatus, storageUsage, storageSummary };
