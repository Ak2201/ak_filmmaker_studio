/* ============================================================
   HUB — the resume card, the three blueprint doors' progress and the
   storage summary, read straight out of each blueprint's local data.
   Moved out of hub.js in the split of 7 Oct 2026, behaviour unchanged.

   A factory rather than a flat module because the page owns three
   things these functions read: the RESET list (ALL_KEYS, which the
   storage summary walks), the journey section (renderJourney() runs
   first so the stage label reads the open film's journey), and the
   flattened step lists the search index is built from. They are
   passed in once; nothing here imports hub.js.
   ============================================================ */
import Store from '../../lib/store.js';
import { parseNum, fmtINR } from '../../lib/money.js';
import { NOTE_PREFIX } from '../../lib/backup.js';
import { STAGES, guideJourney } from '../../lib/journey.js';
import { h, esc } from '../../lib/dom.js';
import { FEATURE_KEY, SHORT_KEY, LIB_CALC_KEY, FEATURE_URL, SHORT_URL, parseStorage, title, $ } from './util.js';

/**
 * @param {object} o
 * @param {string[]} o.allKeys           hub.js's ALL_KEYS, the reset list
 * @param {() => any} o.renderJourney    the page's journey section
 * @param {() => any} o.currentJourney   the journey it last drew (may be null)
 * @param {object[]} o.featureSteps      every feature step, flattened
 * @param {object[]} o.shortSteps        every short step
 */
export function createResumeCards({ allKeys, renderJourney, currentJourney, featureSteps, shortSteps }) {
  const ALL_KEYS = allKeys;
  const FEATURE_STEPS = featureSteps;
  const SHORT_STEPS = shortSteps;

// ============================================================
// PROGRESS — read straight out of each blueprint's local data
// ============================================================
/** "Part II · Screenplay", from the journey. */
function stageLabelOf(id, complete) {
  if (complete) return 'All ' + STAGES.length + ' stages';
  const st = STAGES.find((s) => s.id === id) || STAGES[0];
  return 'Part ' + st.part + ' · ' + st.label;
}

function featureStageLabel(data) {
  const cur = Store.currentProject();
  if (cur && cur.format !== 'short' && currentJourney()) {
    return stageLabelOf(currentJourney().current, currentJourney().complete);
  }
  const g = guideJourney('feature', data);
  return g.started ? stageLabelOf(g.current, false) : 'not started';
}

function computeFeatureStatus() {
  const data = parseStorage(FEATURE_KEY);
  const keys = Object.keys(data);
  if (keys.length === 0) return { pct: 0, title: '', stage: featureStageLabel(data), stepsDone: {}, lastEditedStep: null };
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
  const stage = featureStageLabel(data);
  let lastStepNum = null;
  Object.keys(stepsDone).forEach(k => {
    const match = k.match(/feat-(\d+)/);
    if (!match) return;
    const n = parseInt(match[1], 10);
    if (lastStepNum === null || n > lastStepNum) lastStepNum = n;
  });
  return {
    pct,
    title: data.meta_title || data.v1_title || '',
    stage,
    stepsDone,
    lastEditedStep: lastStepNum ? 'step-' + String(lastStepNum).padStart(2, '0') : null
  };
}

function computeShortStatus() {
  const data = parseStorage(SHORT_KEY);
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
  let lastStepNum = null;
  Object.keys(stepsDone).forEach(k => {
    const match = k.match(/short-(\d+)/);
    if (!match) return;
    const n = parseInt(match[1], 10);
    if (lastStepNum === null || n > lastStepNum) lastStepNum = n;
  });
  return {
    pct,
    title: data.meta_title || '',
    runtime: data.meta_runtime || '',
    stepsDone,
    lastEditedStep: lastStepNum ? 'step-' + String(lastStepNum).padStart(2, '0') : null
  };
}

function computeLibraryStatus() {
  const calc = parseStorage(LIB_CALC_KEY);
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

// ============================================================
// STATUS RENDER
// ============================================================
let lastFeatStatus, lastShortStatus, lastLibStatus;

function updateStatus() {
  // First: the door's "Stage" and the resume card read lastJourney.
  renderJourney();
  const f = computeFeatureStatus(); lastFeatStatus = f;
  $('#feat-title').textContent    = f.title || '—';
  $('#feat-stage').textContent    = f.stage || '—';
  $('#feat-progress').textContent = f.pct + '%';
  $('#feat-bar').style.width      = f.pct + '%';

  const s = computeShortStatus(); lastShortStatus = s;
  $('#short-title').textContent    = s.title || '—';
  $('#short-runtime').textContent  = s.runtime || '—';
  $('#short-progress').textContent = s.pct + '%';
  $('#short-bar').style.width      = s.pct + '%';

  const l = computeLibraryStatus(); lastLibStatus = l;
  $('#lib-calc').textContent  = l.count > 0 ? (l.count + ' items') : 'empty';
  $('#lib-total').textContent = l.total > 0 ? fmtINR(l.total) : '—';

  let bytes = 0, noteCount = 0;
  ALL_KEYS.forEach(k => {
    const v = localStorage.getItem(k);
    if (v) bytes += v.length;
  });
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key && key.startsWith(NOTE_PREFIX)) {
      noteCount++;
      bytes += (localStorage.getItem(key) || '').length;
    }
  }
  const kb = (bytes / 1024).toFixed(1);
  const parts = [];
  if (f.pct > 0 || f.title) parts.push('feature blueprint');
  if (s.pct > 0 || s.title) parts.push('short blueprint');
  if (l.count > 0) parts.push('equipment list (' + l.count + ' items)');
  if (noteCount > 0) parts.push(noteCount + ' private notes');
  const summary = parts.length
    ? 'Tracked: ' + parts.join(', ') + '. '
    : 'No projects yet — open a blueprint to start. ';
  $('#storageBytes').textContent = summary + 'Total local storage: ' + kb + ' KB.';

  updateResume(f, s);
  updateIndexChecks(f, s);
  unpolishFilled();
}

/* polishEmptyStates() runs once at boot, while these still read "—",
   and tags them .empty-charm (inline-flex, a leading dot). Once real
   content lands the class has to go, or every <strong> in the resume
   line becomes its own flex column and the sentence breaks apart. */
function unpolishFilled() {
  document.querySelectorAll('.empty-charm').forEach((el) => {
    if (el.textContent.trim() !== '—') el.classList.remove('empty-charm');
  });
}

function resumeBtn(href, label, alt) {
  return h('a', { href, class: 'resume-btn' + (alt ? ' alt' : ''), text: label });
}

/* "last touched step-24" printed the anchor id, which is the URL's
   word for a step and nobody's name for one. The link still goes to
   the id; the sentence says the step's number and title. */
function stepName(steps, id) {
  const st = steps.find((x) => x.id === id);
  return st ? st.num + ' · ' + title(st.titlePlain || st.title) : id;
}

function updateResume(f, s) {
  const card    = $('#resumeCard');
  const heading = $('#resumeTitle');
  const body    = $('#resumeBody');
  const actions = $('#resumeActions');
  actions.textContent = '';

  const featActive  = f.pct > 0 || f.title;
  const shortActive = s.pct > 0 || s.title;
  if (!featActive && !shortActive) { card.classList.remove('has-data'); return; }
  card.classList.add('has-data');

  const primary = ((f.pct >= s.pct && featActive) || !shortActive) ? 'feature' : 'short';

  if (primary === 'feature') {
    heading.textContent = f.title || 'Untitled feature';
    body.innerHTML = '<strong>' + esc(f.stage) + '</strong> · ' + f.pct + '% complete' +
      (f.lastEditedStep ? ' · last touched <strong>' + esc(stepName(FEATURE_STEPS, f.lastEditedStep)) + '</strong>' : '');
    actions.append(resumeBtn(FEATURE_URL + (f.lastEditedStep ? '#' + f.lastEditedStep : ''), 'CONTINUE FEATURE  →'));
    if (shortActive) {
      actions.append(resumeBtn(SHORT_URL + (s.lastEditedStep ? '#' + s.lastEditedStep : ''), '→ Switch to Short', true));
    }
  } else {
    heading.textContent = s.title || 'Untitled short';
    body.innerHTML = (s.runtime ? '<strong>' + esc(s.runtime) + '</strong> · ' : '') + s.pct + '% complete' +
      (s.lastEditedStep ? ' · last touched <strong>' + esc(stepName(SHORT_STEPS, s.lastEditedStep)) + '</strong>' : '');
    actions.append(resumeBtn(SHORT_URL + (s.lastEditedStep ? '#' + s.lastEditedStep : ''), 'CONTINUE SHORT  →'));
    if (featActive) {
      actions.append(resumeBtn(FEATURE_URL + (f.lastEditedStep ? '#' + f.lastEditedStep : ''), '→ Switch to Feature', true));
    }
  }
}

function updateIndexChecks(f, s) {
  document.querySelectorAll('[data-tcheck]').forEach(el => {
    const k = el.getAttribute('data-tcheck');
    const isComplete = f.stepsDone[k] === true || s.stepsDone[k] === true;
    const isPartial  = f.stepsDone[k] || s.stepsDone[k];
    el.classList.toggle('done', !!isPartial);
    if (isComplete) { el.textContent = '✓'; el.style.opacity = ''; }
    else if (isPartial) { el.textContent = '◐'; el.style.opacity = '0.6'; }
    else { el.textContent = '✓'; el.style.opacity = ''; }
  });
}

  return {
    updateStatus, computeFeatureStatus, computeShortStatus, computeLibraryStatus,
    /** The statuses the last updateStatus() computed — detectActivity() diffs against them. */
    lastStatus: () => ({ f: lastFeatStatus, s: lastShortStatus, l: lastLibStatus })
  };
}
