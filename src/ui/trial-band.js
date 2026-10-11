/* ============================================================
   THE TRIAL BAND — how long is left, where you cannot miss it
   ------------------------------------------------------------
   Section 30 gives a new account thirty minutes with the Dragon
   sample. This is the only thing on screen that says so.

   WHERE IT LIVES. Its own host, `.sh-trial`, built here only while a
   trial is running and put where the announcement plate used to be —
   just above `.sh-bar`, pinned (chrome.css). shell.js measures it into
   --sh-plate-h and parks the bar under it. No trial, no element: the
   page carries nothing and the measurement is 0. (This module used to
   borrow the announcement plate; the plate is gone.)

   MINUTES, NOT SECONDS. A second-by-second counter on a thirty-minute
   trial is pressure theatre; minutes are information. It also means a
   30-second interval rather than a 1s one, so a backgrounded tab is
   not doing arithmetic forever.

   THE CLOCK IS NOT THE AUTHORITY. This only renders. When the time is
   up it asks plan-gate to re-read billing_status() and the SERVER
   decides; the wall follows from that answer, not from this timer.
   Somebody who sets their clock back gets a few more minutes of
   reading the sample, which is not worth engineering against.
   ============================================================ */
import Store from '../lib/store.js';
import PlanGate from '../lib/plan-gate.js';
import { h } from '../lib/dom.js';

let tick = null;      // the minute-by-minute repaint
let endTimer = null;  // the one-shot at expiry

/** Whole minutes remaining, never negative. */
function minutesLeft(ends) {
  return Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 60000));
}

function sentence(mins) {
  if (mins <= 1) return 'Trial · under a minute left';
  if (mins <= 10) return 'Trial · ' + mins + ' minutes left';
  return 'Trial · ' + mins + ' minutes left with the sample film';
}

/* The band's height is measured by shell.js on resize; adding or
   removing the strip changes it without a resize. */
function remeasure() {
  try { window.dispatchEvent(new Event('resize')); } catch (e) { /* ignore */ }
}

function paint(host, ends) {
  const mins = minutesLeft(ends);
  if (!host.querySelector('.tb-text')) {
    host.append(
      h('span.sh-trial-flag.tb-flag', { text: 'TRIAL' }),
      h('span.sh-trial-text.tb-text', { role: 'status', 'aria-live': 'polite' }),
      h('a.btn.primary.tb-cta', { href: 'settings.html#plan', text: 'SEE PLANS' })
    );
  }
  host.querySelector('.tb-text').textContent = sentence(mins);
  /* Urgency is the truth about the clock, not a colour chosen to
     hurry anyone: it only appears in the last ten minutes, and the
     word it changes is the same word. */
  host.classList.toggle('is-urgent', mins <= 10);
  return mins;
}

/** The host, created above the bar if the shell is there. */
function takeHost() {
  let host = document.querySelector('.sh-trial');
  if (host) return host;
  const bar = document.querySelector('.sh-bar');
  if (!bar || !bar.parentNode) return null;   // a page with no shell: nothing to draw on
  host = h('div.sh-trial', { role: 'region', 'aria-label': 'Trial time left' });
  bar.parentNode.insertBefore(host, bar);
  return host;
}

function release() {
  const host = document.querySelector('.sh-trial');
  if (host) { host.remove(); remeasure(); }
  if (tick) { clearInterval(tick); tick = null; }
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
}

/** Re-arm the one-shot that asks the server when the time is up.
 *  setTimeout is clamped by browsers over long delays and drifts in a
 *  backgrounded tab, so it is capped and re-armed rather than trusted
 *  with the whole span. */
function armExpiry(ends) {
  if (endTimer) clearTimeout(endTimer);
  const ms = Math.min(Math.max(ends.getTime() - Date.now(), 0) + 1500, 120000);
  endTimer = setTimeout(() => {
    endTimer = null;
    if (Date.now() >= ends.getTime()) PlanGate.refresh();
    else armExpiry(ends);
  }, ms);
}

export function renderTrialBand() {
  if (typeof document === 'undefined') return;
  const ends = PlanGate.trialEndsAt();
  if (!ends || ends.getTime() <= Date.now()) { release(); return; }

  const fresh = !document.querySelector('.sh-trial');
  const host = takeHost();
  if (!host) return;
  paint(host, ends);
  if (fresh) remeasure();
  armExpiry(ends);

  if (!tick) {
    tick = setInterval(() => {
      const e = PlanGate.trialEndsAt();
      if (!e) { release(); return; }
      const hh = document.querySelector('.sh-trial');
      if (hh) paint(hh, e);
    }, 30000);
  }
}

if (typeof window !== 'undefined') {
  Store.subscribe('plan:changed', renderTrialBand);
  /* A backgrounded tab's interval drifts, so repaint the moment it
     comes back rather than showing a number that is minutes stale. */
  document.addEventListener('visibilitychange', () => { if (!document.hidden) renderTrialBand(); });
}

export default { renderTrialBand };
