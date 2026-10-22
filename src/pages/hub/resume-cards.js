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
import { fmtMoney } from '../../lib/money.js';
import * as Status from '../../lib/hub-status.js';
import { h } from '../../lib/dom.js';
import { PROJECT_HOME_URL, FORMAT_LABELS, fmtRelDate, title, $ } from './util.js';

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
// PROGRESS — read straight out of each blueprint's local data, by
// src/lib/hub-status.js. The open project's journey is handed in.
// ============================================================
const computeFeatureStatus = () => Status.computeFeatureStatus(currentJourney());
const computeShortStatus = () => Status.computeShortStatus();
const computeLibraryStatus = () => Status.computeLibraryStatus();

// ============================================================
// STATUS RENDER
// ============================================================
let lastFeatStatus, lastShortStatus, lastLibStatus;

const setText = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };

function updateStatus() {
  // First: the door's "Stage" and the resume card read lastJourney.
  renderJourney();
  const f = computeFeatureStatus(); lastFeatStatus = f;
  setText('#feat-title', f.title || '—');
  setText('#feat-stage', f.stage || '—');
  setText('#feat-progress', f.pct + '%');
  { const b = $('#feat-bar'); if (b) b.style.width = f.pct + '%'; }

  const s = computeShortStatus(); lastShortStatus = s;
  setText('#short-title', s.title || '—');
  setText('#short-runtime', s.runtime || '—');
  setText('#short-progress', s.pct + '%');
  { const b = $('#short-bar'); if (b) b.style.width = s.pct + '%'; }

  const l = computeLibraryStatus(); lastLibStatus = l;
  setText('#lib-calc', l.count > 0 ? (l.count + ' items') : 'empty');
  setText('#lib-total', l.total > 0 ? fmtMoney(l.total, l.currency, true) : '—');

  { const sb = $('#storageBytes'); if (sb) sb.textContent = Status.storageSummary(f, s, l, Status.storageUsage(ALL_KEYS)); }

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

function updateResume() {
  /* The blueprints are not destinations any more: the card names the
     open project and continues to ITS script. */
  const card    = $('#resumeCard');
  const heading = $('#resumeTitle');
  const body    = $('#resumeBody');
  const actions = $('#resumeActions');
  if (!card || !heading || !body || !actions) return;   // the hub no longer draws the resume card
  actions.textContent = '';
  const cur = Store.currentProject();
  if (!cur) { card.classList.remove('has-data'); return; }
  card.classList.add('has-data');
  heading.textContent = cur.title || 'Untitled project';
  body.textContent = (FORMAT_LABELS[cur.format] || cur.format) + ' · edited ' + fmtRelDate(cur.updatedAt);
  actions.append(resumeBtn(PROJECT_HOME_URL, 'CONTINUE  →'));
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
