/* ============================================================
   INVITE REQUEST — the second route through the gate
   ------------------------------------------------------------
   Schema section 14. A signed-in account that is not a member can
   REQUEST an invite instead of waiting to be handed a code: the row
   carries the e-mail and name Google attested (copied server-side
   out of auth.users, never typed), a note, and which browser asked.
   An administrator approves or declines it from the console on
   settings.html; approval writes the membership directly.

   This module draws that one block and nothing else, so invite.html
   and the extension's side panel render the same thing and cannot
   drift: what the administrator will see, the ask, and afterwards
   where the ask stands. Who is signed in and whether the gate is
   deployed are read off window.StudioCloud at render time — a page
   -local mirror of either is what goes stale.

   No inline handlers (CSP). One delegated submit and one delegated
   click, registered at module evaluation, cover controls that do
   not exist yet. State is two module variables; a `rerender` the
   host page passes in is called when they change.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';

const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;

let busy = false, error = '';
let rerender = () => {};
/** The host page passes its own render so state changes redraw. */
export function wireRequestUI(render) { rerender = render || (() => {}); }

export const fmtWhen = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '');
const plusDays = (ts, n) => new Date(Date.parse(ts) + n * 86400e3);

function who() {
  const c = cloud();
  const u = (c && c.getUser && c.getUser()) || null;
  const m = (u && u.user_metadata) || {};
  return { email: (c && c.getUserEmail && c.getUserEmail()) || '', name: String(m.full_name || m.name || '').trim() };
}

/**
 * The block for a SIGNED-IN account the gate has closed on.
 * @param {object|null} st  the status from gate.status() / getGateState().status
 * @param {string} reason   getGateState().reason
 */
export function requestBlock(st, reason) {
  const wrap = h('div.ir');
  const c = cloud();

  if (reason === 'unreachable' || (!st && reason !== 'notdeployed')) {
    wrap.append(h('p.ir-p', { text: 'The studio could not be reached to check your invite. Sync is paused until it can; everything you write stays on this device meanwhile.' }));
    wrap.append(h('button.btn', { type: 'button', 'data-ir-action': 'recheck', disabled: busy, text: busy ? 'CHECKING…' : 'TRY AGAIN' }));
    return wrap;
  }
  if (!st || !st.deployed || reason === 'notdeployed') {
    wrap.append(h('p.ir-p', { text: 'Invites are not open yet, so there is nothing to request right now. Please check back soon — your work on this device is safe meanwhile.' }));
    if (c && c.isAdmin && c.isAdmin()) {
      wrap.append(h('p.ir-meta', { text: 'You are listed as an administrator of this build: run supabase-schema.sql sections 13 and 14 in the Supabase SQL editor, then the one-line admin bootstrap in 13.2. docs/GATE.md walks through it.' }));
    }
    wrap.append(h('button.btn', { type: 'button', 'data-ir-action': 'recheck', disabled: busy, text: busy ? 'CHECKING…' : 'CHECK AGAIN' }));
    return wrap;
  }
  if (st.disabled || reason === 'disabled' || reason === 'revoked') {
    wrap.append(h('p.ir-p', { text: 'This account was disabled by an administrator, so it no longer syncs. Nothing on this device has been touched. If you think that is a mistake, ask them to re-enable it — approving a new request below does that.' }));
  }

  const { email, name } = who();
  const status = st.requestStatus || '';

  if (status === 'pending') {
    wrap.append(h('p.ir-state.is-pending', {}, [h('strong', { text: 'Requested' }), h('span', { text: ' · ' + fmtWhen(st.requestedAt) })]));
    wrap.append(h('p.ir-p', { text: 'An administrator will see this request the next time they open the console. Once it is approved you are through on your next visit — nothing else to do. Until then, everything you write is saved on this device as usual.' }));
    wrap.append(h('button.btn', { type: 'button', 'data-ir-action': 'recheck', disabled: busy, text: busy ? 'CHECKING…' : 'CHECK AGAIN' }));
    return wrap;
  }

  if (status === 'declined') {
    const again = st.decidedAt ? plusDays(st.decidedAt, 7) : null;
    const canAsk = !again || again.getTime() <= Date.now();
    wrap.append(h('p.ir-state.is-declined', {}, [h('strong', { text: 'Declined' }), h('span', { text: ' · ' + fmtWhen(st.decidedAt) })]));
    if (st.decisionNote) wrap.append(h('blockquote.ir-note', { text: st.decisionNote }));
    if (!canAsk) {
      wrap.append(h('p.ir-p', { text: 'You can ask again from ' + again.toLocaleDateString(undefined, { dateStyle: 'medium' }) + '. Your work on this device is unaffected.' }));
      return wrap;
    }
    wrap.append(h('p.ir-p', { text: 'Enough time has passed that you can ask again.' }));
  }

  /* -- the ask -- */
  const form = h('form.ir-form', { 'data-ir-form': 'request', autocomplete: 'off' });
  form.append(h('p.ir-label', { text: 'What the administrator will see' }));
  const dl = h('dl.ir-who');
  if (name) dl.append(h('dt', { text: 'Name' }), h('dd', { text: name }));
  dl.append(h('dt', { text: 'Google account' }), h('dd', { text: email || '—' }));
  dl.append(h('dt', { text: 'Asked from' }), h('dd', { text: browserWord() }));
  form.append(dl);
  form.append(h('p.ir-meta', { text: 'These details come from your Google sign-in.' }));
  form.append(h('label.ir-label', { for: 'irNote', text: 'A line for them (optional)' }));
  form.append(h('textarea#irNote.ir-textarea', { rows: 3, maxlength: 1000, placeholder: 'Who you are, which film this is for, who told you about the studio.', 'data-ir-field': 'note' }));
  form.append(h('button.btn.primary', { type: 'submit', disabled: busy, text: busy ? 'SENDING…' : (status === 'declined' ? 'ASK AGAIN' : 'REQUEST AN INVITE') }));
  if (error) form.append(h('p.gt-error', { role: 'alert', text: error }));
  wrap.append(form);
  return wrap;
}

function browserWord() {
  const u = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : 'this browser';
  const os = /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Linux/.test(u) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' on ');
}

async function submitRequest(form) {
  const g = gate(), c = cloud();
  if (!g || !c) return;
  const note = (form.querySelector('[data-ir-field="note"]') || {}).value || '';
  busy = true; error = ''; rerender();
  try {
    await g.requestInvite(note);
    /* runGate() re-reads the status, so the gate's reason becomes
       'pending' and every subscriber — this block, the pill, the
       menu — redraws from the one answer. */
    await c.runGate();
  } catch (e) {
    error = e.message || 'The request could not be sent.';
  } finally {
    busy = false; rerender();
  }
}

delegate(document, 'submit', '[data-ir-form]', (e, form) => { e.preventDefault(); submitRequest(form); });
delegate(document, 'click', '[data-ir-action="recheck"]', async () => {
  const c = cloud();
  if (!c) return;
  busy = true; error = ''; rerender();
  try { const ok = await c.runGate(); if (ok && c.attachToCurrentProject) c.attachToCurrentProject(); }
  finally { busy = false; rerender(); }
});

export default { requestBlock, wireRequestUI, fmtWhen };
