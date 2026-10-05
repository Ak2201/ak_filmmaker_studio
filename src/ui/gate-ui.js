/* ============================================================
   GATE UI — the takeover prompt, the invite-code box, the admin
   console (PRD 2.0 FR-101, FR-102, FR-103, FR-203)
   ------------------------------------------------------------
   The logic is src/lib/gate.js and its wiring is in cloud.js; this
   file only draws. It reaches cloud through window.StudioCloud, the
   way src/ui/auth.js and account-panel.js do, so importing it never
   puts cloud.js on a page that did not ask for it.

   THE ADMIN CONSOLE IS SHOWN BY ROLE, AND THE ROLE IS THE SERVER'S.
   `studio_status()` answers role = 'admin' from studio_members, and
   every admin_* RPC re-checks is_studio_admin() itself — so the
   console appearing is a convenience, and a console forced visible
   from devtools gets a refusal from every button. Same rule as
   VITE_ADMIN_EMAILS: visibility is not a boundary.

   No inline handlers (CSP); everything is delegate() on
   [data-gate-action].
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import { formatCode, normaliseCode } from '../lib/gate.js';
import '../styles/gate.css';

const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;
const toast = (msg, type) => { if (window.StudioUI && StudioUI.toast) StudioUI.toast(msg, type ? { type } : undefined); };

/* ---- FR-203: the takeover prompt -------------------------------- */

function since(ts) {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(ts)) / 1000));
  return s < 60 ? `${s} seconds ago` : `${Math.round(s / 60)} minute${Math.round(s / 60) === 1 ? '' : 's'} ago`;
}
function browserOf(ua) {
  const u = String(ua || '');
  const b = /Edg\//.test(u) ? 'Edge' : /Chrome\//.test(u) ? 'Chrome' : /Firefox\//.test(u) ? 'Firefox' : /Safari\//.test(u) ? 'Safari' : '';
  const os = /Windows/.test(u) ? 'Windows' : /Mac OS X/.test(u) ? 'macOS' : /Android/.test(u) ? 'Android' : /iPhone|iPad/.test(u) ? 'iOS' : /Linux/.test(u) ? 'Linux' : '';
  return [b, os].filter(Boolean).join(' on ');
}

/** Resolves true for "take over", false for "cancel". */
export function takeoverDialog(info = {}) {
  return new Promise((resolve) => {
    const prev = document.activeElement;
    const where = browserOf(info.userAgent);
    const card = h('div.cm-card.gt-card', {}, [
      h('h2#gtHeading', { text: 'Active in another window.' }),
      h('p.gt-body', { text: 'Your account is currently active in another Chrome window. Would you like to terminate that session and continue here?' }),
      h('p.gt-meta', { text: [where && `That session: ${where}`, info.lastSeen && `last seen ${since(info.lastSeen)}`].filter(Boolean).join(' · ') || ' ' }),
      h('p.gt-meta', { text: 'Cancelling keeps you working on this device exactly as before — only syncing to your account pauses.' }),
      h('div.gt-actions', {}, [
        h('button.btn.primary', { type: 'button', 'data-gt': 'take', text: 'TAKE OVER SESSION' }),
        h('button.btn', { type: 'button', 'data-gt': 'cancel', text: 'CANCEL' })
      ])
    ]);
    const m = h('div.cm-overlay.show.gt-overlay', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'gtHeading' }, [card]);
    const done = (v) => {
      m.remove();
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) prev.focus();
      resolve(v);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); done(false); }
      if (e.key === 'Tab') {   // keep focus inside the two buttons
        const b = [...card.querySelectorAll('button')];
        const i = b.indexOf(document.activeElement);
        e.preventDefault();
        b[(i + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus();
      }
    };
    card.addEventListener('click', (e) => {
      const t = e.target.closest('[data-gt]');
      if (t) done(t.dataset.gt === 'take');
    });
    document.addEventListener('keydown', onKey, true);
    document.body.append(m);
    card.querySelector('[data-gt="take"]').focus();
  });
}

/* ---- FR-101: the invite-code box -------------------------------- */

let codeBusy = false, codeError = '';

/** A settings section for entering a code, or null when there is
 *  nothing to ask: no cloud, or already a member, or no gate deployed. */
export function inviteSection(section, st) {
  const c = cloud();
  if (!c || !c.isConfigured()) return null;
  const signedIn = !!c.getSession();
  if (signedIn && st && (!st.deployed || (st.registered && !st.disabled))) return null;
  const sec = section('invite', 'Invite', signedIn ? 'Redeem your invite code.' : 'Have an invite code?',
    signedIn
      ? 'This studio’s cloud is invite-only. Enter the code you were given and your projects start syncing to this account. Everything on this device stays here either way.'
      : 'Cloud sync and the Chrome extension are invite-only. Enter your code, then sign in with Google — the code is spent only once Google has said who you are. Working on this device needs no code at all.');
  const form = h('form.gt-code', { 'data-gate-form': 'code', autocomplete: 'off' });
  form.append(h('label.gt-label', { for: 'gtCode', text: 'Invite or screening pass code' }));
  form.append(h('input#gtCode.gt-input', { type: 'text', inputmode: 'text', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX', maxlength: 40, 'data-gate-field': 'code', 'aria-describedby': 'gtCodeHint' }));
  form.append(h('p#gtCodeHint.gt-meta', { text: 'Spaces and dashes are ignored. A screening pass opens the screening room instead.' }));
  form.append(h('button.btn.primary', { type: 'submit', disabled: codeBusy, text: codeBusy ? 'CHECKING…' : (signedIn ? 'REDEEM CODE' : 'CONTINUE WITH GOOGLE') }));
  if (codeError) form.append(h('p.gt-error', { role: 'alert', text: codeError }));
  sec.append(form);
  return sec;
}

async function submitCode(form) {
  const g = gate(), c = cloud();
  const raw = form.querySelector('[data-gate-field="code"]').value;
  if (!g || !normaliseCode(raw)) return;
  codeBusy = true; codeError = ''; rerender();
  try {
    if (c.getSession()) {
      await g.redeemCode(raw);
      toast('Invite code accepted — sync is on.', 'success');
      await c.runGate();
      if (c.attachToCurrentProject) c.attachToCurrentProject();
    } else {
      const t = await g.verifyCode(raw);
      if (t.passType === 'screening_pass') {
        location.href = 'screening.html?pass=' + encodeURIComponent(normaliseCode(raw));
        return;
      }
      await c.signInWithGoogle();    // redirects; the ticket waits in sessionStorage
    }
  } catch (e) {
    codeError = /screening pass/i.test(e.message || '')
      ? 'That is a screening pass. Open it in the screening room.'
      : (e.message || 'That code could not be checked.');
  } finally {
    codeBusy = false; rerender();
  }
}

/* ---- FR-102 / FR-103: the admin console ------------------------- */

const admin = { codes: [], members: [], redemptions: [], projects: [], loaded: false, busy: false, error: '', made: null };

const fmtDate = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const DURATIONS = [
  ['2', '2 hours'], ['24', '24 hours'], ['168', '7 days'], ['720', '30 days'], ['', 'Never']
];

function codeState(c) {
  if (c.revoked_at) return 'Revoked';
  if (c.expires_at && Date.parse(c.expires_at) <= Date.now()) return 'Expired';
  if (c.redemptions_count >= c.max_redemptions) return 'Used up';
  return 'Active';
}

async function loadAdmin() {
  const g = gate();
  if (!g) return;
  admin.busy = true; admin.error = ''; rerender();
  try {
    const [codes, members, redemptions] = await Promise.all([g.admin.listCodes(), g.admin.listMembers(), g.admin.listRedemptions()]);
    admin.codes = codes; admin.members = members || []; admin.redemptions = redemptions;
    try { admin.projects = await g.admin.listProjects(); } catch (e) { admin.projects = []; }
    admin.loaded = true;
  } catch (e) {
    admin.error = e.message || 'The console could not load.';
  } finally {
    admin.busy = false; rerender();
  }
}

export function adminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('admin-console', 'Administrator', 'Invite codes and sessions.',
    'Issue codes, hand out time-limited screening passes, see who redeemed what, and end a session that should not be running. Every button here is re-checked by the database, not by this page.');
  if (!admin.loaded && !admin.busy && !admin.error) { loadAdmin(); }
  if (admin.error) sec.append(h('p.gt-error', { role: 'alert', text: admin.error }));
  if (!admin.loaded) { sec.append(h('p.gt-meta', { text: admin.busy ? 'Loading…' : '' })); return sec; }

  /* -- create -- */
  const form = h('form.gt-create', { 'data-gate-form': 'create' });
  form.append(h('h3.gt-h3', { text: 'Issue a code' }));
  const typeSel = h('select#gtType', { 'data-gate-field': 'type' }, [
    h('option', { value: 'standard', text: 'Standard invite — makes an account' }),
    h('option', { value: 'screening_pass', text: 'Screening pass — read-only, one project' })
  ]);
  const maxIn = h('input#gtMax', { type: 'number', min: 1, max: 1000, value: '1', 'data-gate-field': 'max' });
  const durSel = h('select#gtDur', { 'data-gate-field': 'dur' }, DURATIONS.map(([v, l]) => h('option', { value: v, text: l })));
  durSel.value = '168';
  const projSel = h('select#gtProj', { 'data-gate-field': 'project' }, [h('option', { value: '', text: 'Choose a project…' }),
    ...admin.projects.map((p) => h('option', { value: p.id, text: p.title || 'Untitled' }))]);
  const labelIn = h('input#gtLabel', { type: 'text', maxlength: 120, placeholder: 'Who is it for?', 'data-gate-field': 'label' });
  const field = (id, text, control) => h('div.gt-field', {}, [h('label', { for: id, text }), control]);
  form.append(h('div.gt-grid', {}, [
    field('gtType', 'Kind', typeSel), field('gtMax', 'Uses (opens, for a pass)', maxIn),
    field('gtDur', 'Expires after', durSel), field('gtProj', 'Project (screening pass)', projSel),
    field('gtLabel', 'Label', labelIn)
  ]));
  form.append(h('button.btn.primary', { type: 'submit', text: 'ISSUE CODE' }));
  if (admin.made) {
    form.append(h('p.gt-made', {}, [h('span', { text: 'New code: ' }), h('code.gt-codeval', { text: formatCode(admin.made.code) }),
      h('button.btn', { type: 'button', 'data-gate-action': 'copy', 'data-code': admin.made.code, text: 'COPY' })]));
  }
  sec.append(form);

  /* -- codes -- */
  sec.append(h('h3.gt-h3', { text: `Codes (${admin.codes.length})` }));
  if (!admin.codes.length) sec.append(h('p.gt-meta', { text: 'None issued yet.' }));
  else {
    const table = h('table.gt-table');
    table.append(h('thead', {}, [h('tr', {}, ['Code', 'Kind', 'Label', 'Used', 'Expires', 'State', ''].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const c of admin.codes) {
      const state = codeState(c);
      const proj = admin.projects.find((p) => p.id === c.target_project_id);
      tb.append(h('tr', {}, [
        h('td', {}, [h('code.gt-codeval', { text: formatCode(c.code) })]),
        h('td', { text: c.pass_type === 'screening_pass' ? 'Pass' + (proj ? ' · ' + proj.title : '') : 'Invite' }),
        h('td', { text: c.label || '' }),
        h('td', { text: `${c.redemptions_count} / ${c.max_redemptions}` }),
        h('td', { text: fmtDate(c.expires_at) }),
        h('td', { text: state }),
        h('td', {}, [state === 'Active' ? h('button.btn.danger', { type: 'button', 'data-gate-action': 'revoke', 'data-id': c.id, text: 'REVOKE' }) : null].filter(Boolean))
      ]));
    }
    table.append(tb);
    sec.append(h('div.gt-scroll', {}, [table]));
  }

  /* -- members and live sessions -- */
  sec.append(h('h3.gt-h3', { text: `Members (${admin.members.length})` }));
  const live = (m) => m.last_heartbeat && Date.now() - Date.parse(m.last_heartbeat) < 90000;
  if (admin.members.length) {
    const table = h('table.gt-table');
    table.append(h('thead', {}, [h('tr', {}, ['Email', 'Role', 'Session', 'Where', ''].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const m of admin.members) {
      tb.append(h('tr', {}, [
        h('td', { text: m.email }),
        h('td', { text: m.disabled_at ? m.role + ' (disabled)' : m.role }),
        h('td', { text: live(m) ? 'Active · ' + since(m.last_heartbeat) : m.last_heartbeat ? 'Idle since ' + fmtDate(m.last_heartbeat) : 'None' }),
        h('td', { text: [browserOf(m.user_agent), m.client_ip].filter(Boolean).join(' · ') }),
        h('td.gt-row-actions', {}, [
          live(m) ? h('button.btn', { type: 'button', 'data-gate-action': 'terminate', 'data-id': m.user_id, text: 'END SESSION' }) : null,
          !m.disabled_at && m.role !== 'admin' ? h('button.btn.danger', { type: 'button', 'data-gate-action': 'disable', 'data-id': m.user_id, 'data-email': m.email, text: 'DISABLE' }) : null
        ].filter(Boolean))
      ]));
    }
    table.append(tb);
    sec.append(h('div.gt-scroll', {}, [table]));
  }

  /* -- redemptions -- */
  sec.append(h('h3.gt-h3', { text: 'Recent redemptions and screening opens' }));
  if (!admin.redemptions.length) sec.append(h('p.gt-meta', { text: 'Nothing redeemed yet.' }));
  else {
    const byId = new Map(admin.codes.map((c) => [c.id, c]));
    const ul = h('ul.gt-list');
    admin.redemptions.slice(0, 50).forEach((r) => {
      const c = byId.get(r.code_id);
      const member = admin.members.find((m) => m.user_id === r.user_id);
      ul.append(h('li', { text: `${fmtDate(r.redeemed_at)} — ${c ? formatCode(c.code) : 'code'} — `
        + (member ? member.email : r.viewer_email ? r.viewer_email + ' (typed, not verified)' : 'anonymous viewer')
        + (r.access_id ? ` · access ${r.access_id}` : '') }));
    });
    sec.append(ul);
  }
  sec.append(h('button.btn', { type: 'button', 'data-gate-action': 'reload', text: 'REFRESH' }));
  return sec;
}

async function createCode(form) {
  const g = gate();
  const v = (f) => form.querySelector(`[data-gate-field="${f}"]`).value;
  const passType = v('type');
  const hours = v('dur');
  if (passType === 'screening_pass' && !v('project')) { toast('Choose the project the pass opens.', 'error'); return; }
  if (passType === 'screening_pass' && !hours) { toast('A screening pass needs an expiry.', 'error'); return; }
  try {
    admin.made = await g.admin.createCode({
      passType, maxRedemptions: Math.max(1, parseInt(v('max'), 10) || 1),
      expiresAt: hours ? new Date(Date.now() + Number(hours) * 3600e3).toISOString() : null,
      projectId: passType === 'screening_pass' ? v('project') : null, label: v('label')
    });
    await loadAdmin();
  } catch (e) { toast(e.message || 'The code was not created.', 'error'); }
}

/* ---- wiring ------------------------------------------------------ */

let rerender = () => {};
/** The settings page passes its own render so state changes redraw. */
export function wireGateUI(render) {
  rerender = render || (() => {});
}

delegate(document, 'submit', '[data-gate-form]', (e, form) => {
  e.preventDefault();
  if (form.dataset.gateForm === 'code') submitCode(form);
  else if (form.dataset.gateForm === 'create') createCode(form);
});
delegate(document, 'input', '[data-gate-field="code"]', (e, el) => {
  // Show the normalised form as it is typed (FR-101), keeping the caret at the end.
  const f = formatCode(el.value);
  if (f !== el.value) el.value = f;
});
delegate(document, 'click', '[data-gate-action]', async (e, el) => {
  const g = gate();
  const act = el.dataset.gateAction;
  try {
    if (act === 'revoke') {
      if (!window.confirm('Revoke this code? Nobody can redeem or open it again. Accounts already made with it are not affected.')) return;
      await g.admin.revokeCode(el.dataset.id); await loadAdmin();
    } else if (act === 'terminate') {
      await g.admin.terminate(el.dataset.id, false); await loadAdmin();
      toast('Session ended. If that device is still open it can take the session back.');
    } else if (act === 'disable') {
      if (!window.confirm(`Disable ${el.dataset.email}? Their session ends and their cloud sync stops. Nothing on their own device is touched.`)) return;
      await g.admin.terminate(el.dataset.id, true); await loadAdmin();
    } else if (act === 'reload') {
      await loadAdmin();
    } else if (act === 'copy') {
      await navigator.clipboard.writeText(formatCode(el.dataset.code));
      toast('Copied.');
    }
  } catch (err) { toast(err.message || 'That did not work.', 'error'); }
});

export default { takeoverDialog, inviteSection, adminSection, wireGateUI };
