/* ============================================================
   KEEP THE BUDGET PRIVATE — the budget page's two faces of §55
   ------------------------------------------------------------
   · The OWNER, signed in, on a film the server knows, on a database
     where schema §55 has run, gets a switch under the estimator's
     "who sees it" line. It calls set_budget_private() and shows what
     the server reads back, not what was asked for.
   · A VIEW or COMMENT collaborator on a private film gets a plain
     state, "The owner keeps this budget private.", in place of the
     estimate and every cost tab of budget.html — never a local or empty
     budget that looks real ON THIS PAGE. Nothing on their device is
     deleted or changed; it is only not shown. Other views that read the
     same keys (the dashboard's budget rows, the readiness PDF, the DPR)
     are not locked: they still draw the viewer's old local copy.
   · The switch covers the two budget-page scopes only. The blueprints'
     own budget questions (feature v2s11_*, short s10_budget) live in the
     'feature' / 'short' blobs, which RLS cannot split by key, so they
     stay readable by everyone the film is shared with, screening passes
     included — and the sentences here say so.

   Everything is decided by src/lib/budget-privacy.js from cloud.js's
   budgetPrivacy(); unknown (signed out, §55 not run, never synced,
   offline) draws neither, so `npm run verify` — signed out — sees the
   page exactly as before. Built only when needed, stores nothing.
   RLS is the boundary; this is what the page says about it.
   ============================================================ */
import Store from '../lib/store.js';
import { h, delegate } from '../lib/dom.js';
import { showSwitch, budgetLocked, toggleMessage } from '../lib/budget-privacy.js';
import { check, emptyState } from './kit/index.js';

const cloud = () => (typeof window !== 'undefined' ? window.StudioCloud : null);
const signedIn = (c) => { try { return !!(c && c.getSession && c.getSession()); } catch (e) { return false; } };

let _onLock = () => {};
let _locked = false;
let _busy = false;

/** The viewer's state, for a section that is re-rendered (budget-costs.js). */
export function lockedNote() {
  return emptyState({
    icon: 'lock',
    class: 'bud-locked',
    title: 'The owner keeps this budget private.',
    body: 'Only the owner and people with an edit link can see or change it. Ask the owner for an edit link if you need the figures.'
  });
}
export const isBudgetLocked = () => _locked;

function switchEl(on) {
  const box = check({
    label: 'Keep the budget private',
    checked: on,
    class: 'bud-private-switch',
    attrs: { role: 'switch', 'aria-checked': on ? 'true' : 'false', 'aria-describedby': 'budPrivateHint', 'data-bud-private': '1' }
  });
  return h('div#budPrivacy.bud-privacy', {}, [
    box,
    h('p#budPrivateHint.hint.bud-private-hint', {
      text: 'Only you and people with an edit link can see or change the budget. '
          + 'People who already opened it may still have a copy on their device. '
          + 'Figures typed into the blueprint\u2019s budget questions are not covered: '
          + 'anyone the film is shared with can still read those, a screening pass included.'
    })
  ]);
}

/* Patched IN PLACE when the switch is already there: replacing the
   element after a toggle detached the very checkbox a keyboard or
   screen-reader user had just pressed, and focus fell to <body>. The
   element is built or removed only when the switch appears or goes. */
function paintSwitch(state) {
  const host = document.querySelector('.bud-who');
  const el = document.getElementById('budPrivacy');
  if (!showSwitch(state, signedIn(cloud()))) { if (el) el.remove(); return; }
  const on = !!state.private;
  const box = el && el.querySelector('input[data-bud-private]');
  if (box) {
    box.checked = on;
    box.setAttribute('aria-checked', on ? 'true' : 'false');
    box.setAttribute('aria-disabled', _busy ? 'true' : 'false');
    return;
  }
  const fresh = switchEl(on);
  if (el) el.replaceWith(fresh); else if (host) host.after(fresh);
}

function paintLock(state) {
  const locked = budgetLocked(state);
  if (locked === _locked) return;
  _locked = locked;
  const grid = document.querySelector('#estimate .bud-est-grid');
  if (grid) grid.hidden = locked;
  /* The head's standing actions act on the hidden estimate (and the CSV
     would export a stale local copy), so they go with it. */
  document.querySelectorAll('.bd-head [data-cx="csv-budget"], .bd-head [data-action="add-row"]').forEach((b) => { b.hidden = locked; });
  const est = document.getElementById('estimate');
  const note = document.getElementById('budLockedEst');
  if (locked && est && !note) {
    const n = lockedNote(); n.id = 'budLockedEst';
    if (grid) grid.before(n); else est.append(n);
  } else if (!locked && note) note.remove();
  _onLock(locked);
}

async function update(force) {
  const c = cloud();
  const pid = Store.currentProjectId();
  if (!c || !c.budgetPrivacy || !pid || !signedIn(c)) { paintSwitch(null); paintLock(null); return; }
  let state = null;
  try { state = await c.budgetPrivacy(pid, force ? { force: true } : undefined); } catch (e) { state = null; }
  if (Store.currentProjectId() !== pid) return;     // the project changed under the read
  paintSwitch(state);
  paintLock(state);
}

async function toggle(box) {
  const c = cloud();
  const pid = Store.currentProjectId();
  if (_busy) { box.checked = !box.checked; return; }   // a press while one is in flight changes nothing
  if (!c || !c.setBudgetPrivate || !pid) return;
  const want = !!box.checked;
  box.setAttribute('aria-checked', want ? 'true' : 'false');
  _busy = true;
  /* aria-disabled, not disabled: a disabled control drops focus, and
     the keyboard user who pressed it would land on <body>. _busy is
     what actually refuses a second press. */
  box.setAttribute('aria-disabled', 'true');
  let res = { ok: false, state: null };
  try { res = await c.setBudgetPrivate(pid, want); } catch (e) { res = { ok: false, state: null }; }
  _busy = false;
  const ui = window.StudioUI;
  if (ui && ui.toast) ui.toast(toggleMessage(want, res.ok), { type: res.ok ? 'success' : 'error' });
  /* Paint what the server says now; a failure puts the box back. Either
     way the box is re-enabled where it stands (paintSwitch patches the
     live element, so focus stays on it). */
  if (res.state && res.state.known) { paintSwitch(res.state); paintLock(res.state); }
  const live = document.querySelector('#budPrivacy input[data-bud-private]') || box;
  if (!(res.state && res.state.known)) live.checked = !want;
  live.disabled = false;
  live.setAttribute('aria-disabled', 'false');
  live.setAttribute('aria-checked', live.checked ? 'true' : 'false');
}

/** Wire it once, after the page has rendered. `onLock(locked)` lets the
    cost tabs re-render into (or out of) the private state. */
export function mountBudgetPrivacy(root, onLock) {
  if (typeof onLock === 'function') _onLock = onLock;
  delegate(root, 'change', 'input[data-bud-private]', (e, el) => { toggle(el); });
  Store.subscribe('cloud:booted', () => update());
  Store.subscribe('cloud:budget-privacy', (info) => { if (info && info.projectId === Store.currentProjectId()) { paintSwitch(info.state); paintLock(info.state); } });
  Store.subscribe('current:changed', () => update());
  const c = cloud();
  if (c && c.onAuth) { try { c.onAuth(() => update(true)); } catch (e) { /* no auth events */ } }
  if (c && c.isBooted && c.isBooted()) update();
}

export default { mountBudgetPrivacy, lockedNote, isBudgetLocked };
