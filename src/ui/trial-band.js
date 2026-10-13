/* ============================================================
   THE TRIAL TIMER — how long is left, where you cannot miss it
   ------------------------------------------------------------
   Section 30 gives a new account a trial with the Dragon sample.
   This is the only thing on screen that says how long is left.

   WHERE IT LIVES (owner, 12 Oct 2026): the top strip is GONE. The
   clock is a block at the bottom of the studio rail, `.sh-rail-trial`
   (built hidden by shell.js buildRail, shown here while a trial runs),
   and on a phone, where the rail is a drawer, a small chip in the bar,
   `.sh-trial-chip`, whose tap opens that drawer. No trial, nothing
   shown; neither element takes any part of the page's height, so the
   band's measured numbers (--sh-plate-h is 0 now) are untouched.

   SECONDS, ALWAYS (owner, 12 Oct 2026). This file used to say a
   per-second counter is "pressure theatre" and repainted in whole
   minutes every 30s. The owner has reversed that on purpose: the
   timer ticks every second, at every length. Do not put the minutes
   back. What keeps it honest instead: it ticks only while the tab is
   visible (a hidden tab does no arithmetic and repaints the moment it
   returns), the ticking element is a role="timer" with aria-live off
   so a screen reader is not read a clock, and a separate polite
   region speaks only at ten minutes, one minute and expiry. Urgency
   in the last ten minutes is colour only; the words never change.

   THE CLOCK IS NOT THE AUTHORITY. This only renders. When the time is
   up it asks plan-gate to re-read billing_status() and the SERVER
   decides; the wall follows from that answer, not from this timer.
   Somebody who sets their clock back gets a few more minutes of
   reading the sample, which is not worth engineering against.
   ============================================================ */
import Store from '../lib/store.js';
import PlanGate from '../lib/plan-gate.js';
import { h } from '../lib/dom.js';
import { countdown } from '../lib/trial-time.js';

let tick = null;      // the one-second repaint
let endTimer = null;  // the one-shot at expiry
let lastText = '';    // what is on screen, so a day-long clock repaints only when it changes
let lastSecs = null;  // for announcing a threshold only when it is CROSSED

/* THE SERVER'S CLOCK, not this browser's (§33): billing_status()
   carries `server_now`, and plan-gate keeps the difference. A laptop
   ten minutes fast used to drop the timer ten minutes early; one ten
   minutes slow kept it up after the server had ended the trial. */
const now = () => (PlanGate.serverNow ? PlanGate.serverNow() : Date.now());

const URGENT_SECS = 600;

/** The block shell.js built at the foot of the rail (null on a page with no shell). */
const railBlock = () => document.querySelector('#studioRail .sh-rail-trial');
const chipEl = () => document.querySelector('.sh-bar .sh-trial-chip');

function fillRail(block) {
  if (block.querySelector('[role="timer"]')) return;
  block.append(
    h('span.sh-rail-trial-label', { text: 'TRIAL ENDS IN' }),
    h('span.sh-rail-trial-time', { role: 'timer', 'aria-live': 'off', 'aria-label': 'Trial time left' }),
    h('a.sh-rail-trial-cta', { href: 'purchase.html', text: 'SEE PLANS' }),
    h('span.visually-hidden.sh-rail-trial-say', { role: 'status', 'aria-live': 'polite' })
  );
}

/** The phone chip, put in the bar right after the rail's burger. */
function takeChip() {
  let chip = chipEl();
  if (chip) return chip;
  const bar = document.querySelector('.sh-bar');
  if (!bar) return null;
  chip = h('button.sh-trial-chip', { type: 'button', 'aria-label': 'Trial time left. Open the menu' });
  chip.append(h('span.sh-trial-chip-word', { text: 'Trial' }), h('span.sh-trial-chip-time'));
  chip.addEventListener('click', (e) => {
    /* Open the drawer through its own control: the burger is the one
       door setRail() has, so this edits nothing in shell.js. The click
       must not travel on to shell.js's outside-click handler, which
       closes the drawer for any click that is not on the rail or the
       burger — it would shut what this just opened. */
    e.stopPropagation();
    if (document.body.classList.contains('rail-shown')) return;
    const burger = document.getElementById('railToggle');
    if (burger) burger.click();
  });
  const burger = bar.querySelector('#railToggle');
  if (burger && burger.nextSibling) bar.insertBefore(chip, burger.nextSibling);
  else bar.append(chip);
  return chip;
}

const SAY = {
  600: 'Ten minutes left in your trial.',
  60: 'One minute left in your trial.',
  0: 'Your trial has ended.'
};

/* THE TEN-MINUTE NOTICE, FOR EYES. The polite region above speaks to a
   screen reader; a sighted reader got a colour change and nothing else,
   so the first they heard of the end was the wall. One toast, once per
   page, the moment ten minutes is crossed (or on arrival inside the last
   ten): what is left, what a plan costs, and that the work stays. It is
   the server's clock, so it is not urgency invented to hurry anyone. A
   toast with an action stays until answered (chrome.js), which is right
   for something carrying the only button that matters. Memory only. */
let warned = false;
function warnVisibly(secs) {
  if (warned || !(secs > 0) || secs > URGENT_SECS) return;
  warned = true;
  const mins = Math.max(1, Math.ceil(secs / 60));
  const lead = (mins === 1 ? 'One minute' : mins + ' minutes') + ' left in your free trial.';
  const say = (o) => {
    try {
      const ui = window.StudioUI;
      if (!ui || !ui.toast) return;
      ui.toast(lead + (o && o.price ? ' Plans from ' + o.price + ', one payment.' : '') + ' Everything you did stays.', {
        type: 'info', action: 'SEE PLANS', onAction: () => { location.href = 'purchase.html'; } });
    } catch (e) { /* no chrome: the rail still counts */ }
  };
  /* offerFor([]) is the cheapest plan above this one: "from" its price. */
  PlanGate.offerFor([]).then(say, () => say(null));
}

function announce(block, secs) {
  warnVisibly(secs);
  const say = block.querySelector('.sh-rail-trial-say');
  if (!say || lastSecs == null) return;
  for (const t of [0, 60, 600]) {   // the LOWEST threshold crossed wins
    if (lastSecs > t && secs <= t) { say.textContent = SAY[t]; return; }
  }
}

/** Paint both faces from one number. */
function paint(ends) {
  const ms = Math.max(0, ends.getTime() - now());
  const secs = Math.ceil(ms / 1000);
  const text = countdown(ms);
  const block = railBlock();
  if (block) {
    fillRail(block);
    block.hidden = false;
    const chip = takeChip();
    if (text !== lastText) {
      block.querySelector('.sh-rail-trial-time').textContent = text;
      if (chip) chip.querySelector('.sh-trial-chip-time').textContent = text;
    }
    /* Urgency is the truth about the clock, not a colour chosen to
       hurry anyone: last ten minutes only, and the words are the same. */
    const urgent = secs <= URGENT_SECS;
    block.classList.toggle('is-urgent', urgent);
    if (chip) chip.classList.toggle('is-urgent', urgent);
    announce(block, secs);
  }
  lastText = text;
  lastSecs = secs;
}

function release() {
  const block = railBlock();
  if (block) { block.hidden = true; block.replaceChildren(); block.classList.remove('is-urgent'); }
  const chip = chipEl();
  if (chip) chip.remove();
  if (tick) { clearInterval(tick); tick = null; }
  if (endTimer) { clearTimeout(endTimer); endTimer = null; }
  lastText = ''; lastSecs = null;
}

/** Re-arm the one-shot that asks the server when the time is up.
 *  setTimeout is clamped by browsers over long delays and drifts in a
 *  backgrounded tab, so it is capped and re-armed rather than trusted
 *  with the whole span. */
function armExpiry(ends) {
  if (endTimer) clearTimeout(endTimer);
  const ms = Math.min(Math.max(ends.getTime() - now(), 0) + 1500, 120000);
  endTimer = setTimeout(() => {
    endTimer = null;
    if (now() >= ends.getTime()) PlanGate.refresh();
    else armExpiry(ends);
  }, ms);
}

function startTick() {
  if (tick || document.hidden) return;
  tick = setInterval(() => {
    const e = PlanGate.trialEndsAt();
    if (!e) { release(); return; }
    paint(e);   // at zero it holds 0:00 until the server's answer (armExpiry) releases it
  }, 1000);
}

export function renderTrialBand() {
  if (typeof document === 'undefined') return;
  const ends = PlanGate.trialEndsAt();
  if (!ends || ends.getTime() <= now()) {
    release();
    /* Time is up here but the server still said "trial" when it was
       last asked — the request raced the clock. Ask again shortly,
       once, rather than leaving the page open until the 4-minute poll. */
    if (ends && !endTimer) endTimer = setTimeout(() => { endTimer = null; PlanGate.refresh(); }, 15000);
    return;
  }
  if (!railBlock()) return;   // a page with no shell: nothing to draw on
  paint(ends);
  armExpiry(ends);
  startTick();
}

if (typeof window !== 'undefined') {
  Store.subscribe('plan:changed', renderTrialBand);
  /* A hidden tab does no arithmetic: stop the one-second interval and
     repaint the moment the tab comes back. */
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (tick) { clearInterval(tick); tick = null; } }
    else renderTrialBand();
  });
}

export default { renderTrialBand };
