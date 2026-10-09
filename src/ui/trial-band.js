/* ============================================================
   THE TRIAL BAND — how long is left, where you cannot miss it
   ------------------------------------------------------------
   Section 30 gives a new account thirty minutes with the Dragon
   sample. This is the only thing on screen that says so.

   WHERE IT LIVES, AND WHY IT IS NOT A NEW ELEMENT. The pinned band is
   `.sh-plate` (announcements) above `.sh-bar` (the toolbar), and the
   arithmetic that keeps them from overlapping is measured, not
   assumed: shell.js publishes --sh-plate-h from the FIRST .sh-plate it
   finds and parks the bar at `top: var(--sh-plate-h)`. A second
   sticky band at top:0 would sit underneath the toolbar, and a hidden
   first plate would measure 0 and drop the toolbar on top of this one.

   So there is still exactly ONE .sh-plate. While a trial is running
   this module borrows it: the announcement's children are detached,
   kept, and put back when the trial ends. Nothing about the
   measurement changes, because from shell.js's point of view nothing
   has.

   That is also the right call editorially. The plate rotates marketing
   messages; for the thirty minutes a trial lasts, how much of it is
   left is strictly the more useful thing to show, and two stacked
   bands on a 390px phone is most of the screen gone.

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

let kept = null;      // the announcement's children, while we have the plate
let tick = null;      // the minute-by-minute repaint
let endTimer = null;  // the one-shot at expiry

const PLATE = '.sh-plate';

/** Whole minutes remaining, never negative. */
function minutesLeft(ends) {
  return Math.max(0, Math.ceil((ends.getTime() - Date.now()) / 60000));
}

function sentence(mins) {
  if (mins <= 1) return 'Trial · under a minute left';
  if (mins <= 10) return 'Trial · ' + mins + ' minutes left';
  return 'Trial · ' + mins + ' minutes left with the sample film';
}

function paint(plate, ends) {
  const mins = minutesLeft(ends);
  let body = plate.querySelector(':scope > .tb-body');
  if (!body) {
    body = h('div.tb-body', {}, [
      h('span.sh-plate-flag.tb-flag', { text: 'TRIAL' }),
      h('span.sh-plate-text.tb-text', { role: 'status', 'aria-live': 'polite' }),
      h('a.btn.primary.tb-cta', { href: 'settings.html#plan', text: 'SEE PLANS' })
    ]);
    plate.append(body);
  }
  body.querySelector('.tb-text').textContent = sentence(mins);
  /* Urgency is the truth about the clock, not a colour chosen to
     hurry anyone: it only appears in the last ten minutes, and the
     word it changes is the same word. */
  plate.classList.toggle('is-urgent', mins <= 10);
  return mins;
}

function takePlate() {
  const plate = document.querySelector(PLATE);
  if (!plate) return null;
  if (!plate.classList.contains('tb-on')) {
    kept = Array.from(plate.childNodes);
    kept.forEach((n) => n.remove());
    plate.classList.add('tb-on');
  }
  return plate;
}

function release() {
  const plate = document.querySelector(PLATE);
  if (plate && plate.classList.contains('tb-on')) {
    plate.querySelectorAll(':scope > .tb-body').forEach((n) => n.remove());
    plate.classList.remove('tb-on', 'is-urgent');
    if (kept) kept.forEach((n) => plate.append(n));
  }
  kept = null;
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

  const plate = takePlate();
  if (!plate) return;          // a page with no shell: nothing to borrow
  paint(plate, ends);
  armExpiry(ends);

  if (!tick) {
    tick = setInterval(() => {
      const e = PlanGate.trialEndsAt();
      if (!e) { release(); return; }
      paint(plate, e);
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
