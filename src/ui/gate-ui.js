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
import { BRAND } from '../lib/brand.js';
import { formatCode, normaliseCode, setCodePass, startInviteLink, errorSentence } from '../lib/gate.js';
import '../styles/gate.css';

const cloud = () => window.StudioCloud || null;
const gate = () => (cloud() && cloud().gate) || null;
const toast = (msg, type, duration) => {
  if (!window.StudioUI || !StudioUI.toast) return;
  const o = {};
  if (type) o.type = type;
  if (duration) o.duration = duration;
  StudioUI.toast(msg, Object.keys(o).length ? o : undefined);
};

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
let codeTyped = '';   // the box is rebuilt on every redraw; what was typed comes back (M16)

/** A settings section for entering a code, or null when there is
 *  nothing to ask: no cloud, or already a member, or no gate deployed. */
export function inviteSection(section, st) {
  const c = cloud();
  if (!c || !c.isConfigured()) return null;
  const signedIn = !!c.getSession();
  if (signedIn && st && (!st.deployed || (st.registered && !st.disabled))) return null;
  const sec = section('invite', signedIn ? 'Invite' : 'With a code', 'Have an invite code?',
    signedIn
      ? 'If somebody handed you a code, enter it and you are through. No code? Request an invite instead — the administrator sees the account you signed in with.'
      : 'A code lets you straight in, with no sign-in. Enter it and you are through on this browser; sign in with Google whenever you want your work backed up to an account.');
  const form = h('form.gt-code', { 'data-gate-form': 'code', autocomplete: 'off' });
  form.append(h('label.gt-label', { for: 'gtCode', text: 'Invite or screening pass code' }));
  form.append(h('input#gtCode.gt-input', { type: 'text', inputmode: 'text', autocapitalize: 'characters', spellcheck: 'false',
    placeholder: 'XXXX-XXXX-XXXX', maxlength: 40, 'data-gate-field': 'code', 'aria-describedby': 'gtCodeHint', value: formatCode(codeTyped) }));
  form.append(h('p#gtCodeHint.gt-meta', { text: 'Spaces and dashes are ignored. A screening pass opens the screening room instead.' }));
  /* The signed-out label used to read CONTINUE WITH GOOGLE, which is
     what happens AFTER a code checks out — and with the box empty the
     submit did nothing at all, so the button that most looked like the
     way in was a dead click. It names the code now, and an empty
     submit says where the way in is. */
  form.append(h('button.btn.primary', { type: 'submit', disabled: codeBusy, text: codeBusy ? 'CHECKING…' : (signedIn ? 'REDEEM CODE' : 'ENTER WITH THIS CODE') }));
  if (codeError) form.append(h('p.gt-error', { role: 'alert', text: codeError }));
  sec.append(form);
  /* The other route, when this box is drawn somewhere other than the
     doorway itself. invite.html renders the request block beside it,
     so it does not need the pointer. */
  if (signedIn && !/(^|\/)invite(\.html)?$/.test(location.pathname)) {
    sec.append(h('p.gt-meta', {}, [h('a', { href: 'invite.html', text: 'No code? Request an invite →' })]));
  }
  sec.append(h('p.gt-meta', {}, [h('a', { href: 'start.html', text: 'What is this? About ' + BRAND.name + ' →' })]));   // the public landing page, outside the gate
  return sec;
}

async function submitCode(form) {
  const g = gate(), c = cloud();
  const raw = form.querySelector('[data-gate-field="code"]').value;
  if (!g) return;
  codeTyped = raw;
  if (!normaliseCode(raw)) {
    codeError = c.getSession()
      ? 'Enter the code you were given — or request an invite above.'
      : 'Enter the code you were given. With no code, sign in with Google and ask for an invite.';
    rerender();
    form.querySelector('[data-gate-field="code"]').focus();
    return;
  }
  codeError = '';
  codeBusy = true; codeError = ''; rerender();
  try {
    if (c.getSession()) {
      await g.redeemCode(raw);
      codeTyped = '';
      toast('Invite code accepted — sync is on.', 'success');
      await c.runGate();
      if (c.attachToCurrentProject) c.attachToCurrentProject();
    } else {
      const t = await g.verifyCode(raw);
      if (t.passType === 'screening_pass') {
        location.href = 'screening.html?pass=' + encodeURIComponent(normaliseCode(raw));
        return;
      }
      /* Code-only entry: remember the code in this browser and go in.
         No sign-in is asked for. The ticket verifyCode() left in
         sessionStorage is still redeemed if they do sign in within ten
         minutes, and after that cloud.js redeems the remembered code
         itself on the first sign-in. */
      setCodePass(raw);
      try { sessionStorage.setItem('fms_sitegate_pass', '1'); } catch (e) { /* re-verified on arrival */ }
      location.assign('index.html');
      return;
    }
  } catch (e) {
    codeError = /screening pass/i.test(e.message || '')
      ? 'That is a screening pass. Open it in the screening room.'
      : errorSentence(e, 'That code could not be checked.');
  } finally {
    codeBusy = false; rerender();
  }
}

/* ---- FR-102 / FR-103: the admin console ------------------------- */

const admin = { codes: [], members: [], redemptions: [], projects: [], requests: [], loaded: false, busy: false, error: '', made: null, showAllDecided: false,
  /* What the admin has typed into "Issue a code" but not submitted. The
     console redraws on every load — twice after each code it issues —
     and a redraw rebuilt the form from defaults, so a second code begun
     during the reload came out as a STANDARD invite with no project. */
  draft: {} };

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

async function loadAdmin({ quiet = false } = {}) {
  const g = gate();
  if (!g) return;
  admin.busy = true; admin.error = '';
  if (!quiet) rerender();   // a reload of a console already on screen keeps it on screen
  try {
    const [codes, members, redemptions, requests] = await Promise.all([g.admin.listCodes(), g.admin.listMembers(), g.admin.listRedemptions(), g.admin.listRequests()]);
    admin.codes = codes; admin.members = members || []; admin.redemptions = redemptions; admin.requests = requests || [];
    try { admin.projects = await g.admin.listProjects(); } catch (e) { admin.projects = []; }
    admin.loaded = true;
  } catch (e) {
    admin.error = errorSentence(e, 'The console could not load.');
  } finally {
    admin.busy = false; rerender();
  }
}

export function adminSection(section, st) {
  if (!st || !st.deployed || st.role !== 'admin') return null;
  const sec = section('admin-console', 'Administrator', 'Invite requests, codes and sessions.',
    'Approve or decline the people who asked, issue codes, hand out time-limited screening passes, see who redeemed what, and end a session that should not be running. Every button here is re-checked by the database, not by this page.');
  if (!admin.loaded && !admin.busy && !admin.error) { loadAdmin(); }
  if (admin.error) sec.append(h('p.gt-error', { role: 'alert', text: admin.error }));
  if (!admin.loaded) { sec.append(h('p.gt-meta', { text: admin.busy ? 'Loading…' : '' })); return sec; }

  /* -- requests (section 14) -- The queue first, because it is the
     part with people waiting on it. Pending rows get the two buttons;
     decided rows are history, kept short. */
  const pending = admin.requests.filter((r) => r.status === 'pending');
  const decided = admin.requests.filter((r) => r.status !== 'pending');
  sec.append(h('h3.gt-h3', { id: 'gtRequests', text: `Invite requests (${pending.length} waiting)` }));
  if (!pending.length) sec.append(h('p.gt-meta', { text: 'Nobody is waiting. A request appears here when somebody signs in with Google and asks on invite.html.' }));
  else {
    const table = h('table.gt-table.gt-requests');
    table.append(h('thead', {}, [h('tr', {}, ['Who', 'Asked', 'Their note', 'From', ''].map((t) => h('th', { scope: 'col', text: t })))]));
    const tb = h('tbody');
    for (const r of pending) {
      tb.append(h('tr', { 'data-request': r.user_id }, [
        h('td', {}, [h('strong', { text: r.display_name || r.email }), r.display_name ? h('br') : null, r.display_name ? h('span.gt-meta', { text: r.email }) : null].filter(Boolean)),
        h('td', { text: fmtDate(r.requested_at) + (r.times_asked > 1 ? ` · asked ${r.times_asked}×` : '') }),
        h('td', { text: r.note || '—' }),
        h('td', { text: browserOf(r.user_agent) || '—' }),
        h('td.gt-row-actions', {}, [
          h('button.btn.primary', { type: 'button', 'data-gate-action': 'approve', 'data-id': r.user_id, 'data-email': r.email, 'aria-label': 'Approve ' + r.email, text: 'APPROVE' }),
          h('button.btn.danger', { type: 'button', 'data-gate-action': 'decline', 'data-id': r.user_id, 'data-email': r.email, 'aria-label': 'Decline ' + r.email, text: 'DECLINE' })
        ])
      ]));
    }
    table.append(tb);
    sec.append(h('div.gt-scroll', {}, [table]));
  }
  if (decided.length) {
    /* DECIDED ROWS ARE NOT ONLY HISTORY. A decline used to be final as
       far as the console went — the list was text, so an administrator
       who changed their mind, or mis-clicked, had nowhere to go and the
       person waited out seven days for nothing. A declined row now
       carries LET THEM IN; an approved one carries CLEAR, which is the
       way back out. Owner's ask, 8 Oct 2026. */
    const det = h('details.gt-decided', { open: admin.showAllDecided }, [h('summary', { text: `Decided (${decided.length})` })]);
    const ul = h('ul.gt-list.gt-list-plain');
    /* CLEAR is refused by the database for an administrator and for
       yourself (admin_reset_user), so the button is not offered there. */
    const protectedEmails = new Set(admin.members.filter((m) => m.role === 'admin').map((m) => String(m.email || '').toLowerCase()));
    const me = String((cloud() && cloud().getUserEmail && cloud().getUserEmail()) || '').toLowerCase();
    if (me) protectedEmails.add(me);
    const shown = admin.showAllDecided ? decided : decided.slice(0, 30);
    shown.forEach((r) => {
      const line = `${fmtDate(r.decided_at)} — ${r.email} — ${r.status}`
        + (r.decided_by_email ? ` by ${r.decided_by_email}` : '')
        + (r.decision_note ? ` — “${r.decision_note}”` : '');
      ul.append(h('li.gt-decided-row', {}, [
        h('span', { text: line }),
        h('span.gt-row-actions', {}, [
          r.status === 'declined'
            ? h('button.btn.primary', { type: 'button', 'data-gate-action': 'recover', 'data-id': r.user_id, 'data-email': r.email, 'aria-label': 'Let ' + r.email + ' in', text: 'LET THEM IN' })
            : null,
          protectedEmails.has(String(r.email || '').toLowerCase()) ? null
            : h('button.btn.danger', { type: 'button', 'data-gate-action': 'reset-user', 'data-id': r.user_id, 'data-email': r.email, 'aria-label': 'Clear ' + r.email, text: 'CLEAR' })
        ].filter(Boolean))
      ]));
    });
    det.append(ul);
    if (decided.length > 30) {
      det.append(h('p', {}, [h('button.btn', { type: 'button', 'data-gate-action': 'toggle-decided',
        text: admin.showAllDecided ? 'SHOW FEWER' : `SHOW ALL (${decided.length})` })]));
    }
    sec.append(det);
  }

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
  for (const [f, el] of [['type', typeSel], ['max', maxIn], ['dur', durSel], ['project', projSel], ['label', labelIn]]) {
    if (admin.draft[f] != null) el.value = admin.draft[f];
  }
  const field = (id, text, control) => h('div.gt-field', {}, [h('label', { for: id, text }), control]);
  form.append(h('div.gt-grid', {}, [
    field('gtType', 'Kind', typeSel), field('gtMax', 'Uses (opens, for a pass)', maxIn),
    field('gtDur', 'Expires after', durSel), field('gtProj', 'Project (screening pass)', projSel),
    field('gtLabel', 'Label', labelIn)
  ]));
  form.append(h('button.btn.primary', { type: 'submit', text: 'ISSUE CODE' }));
  /* docs/BILLING.md §8: a visitor who enters on a code alone is not
     signed in, has no organisation and so no plan — the plan gate does
     not apply to them. Say so where the code is made. */
  form.append(h('p.gt-meta', { text: 'A standard code grants full access to every module: a code-only visitor has no account to carry a plan, so the plan tiers and their feature locks do not apply until they sign in.' }));
  if (admin.made) {
    form.append(h('p.gt-made', {}, [h('span', { text: 'New code: ' }), h('code.gt-codeval', { text: formatCode(admin.made.code) }),
      h('button.btn', { type: 'button', 'data-gate-action': 'copy', 'data-code': admin.made.code, text: 'COPY CODE' })]));
    if (admin.made.pass_type === 'standard') {
      /* The same code as a link. Whoever opens it is in, no sign-in —
         so this is the thing to send, and the code is the thing to read
         aloud when a link cannot travel.

         IT POINTS AT start.html NOW, not invite.html (§30). A code no
         longer admits somebody outright — it buys a seven-day trial,
         and a trial is counted against a person on the server, so the
         code has to meet an account to be worth its seven days. The
         landing page holds it across the Google round trip and
         cloud.js's runGate() redeems it on the way back in.
         inviteLink() still exists and still builds the invite.html
         form, because every link already sent to somebody points
         there and a code is a thing people paste into a group chat
         months later. */
      form.append(h('p.gt-made', {}, [h('span', { text: 'Or share the link: ' }), h('code.gt-codeval.gt-link', { text: startInviteLink(admin.made.code) }),
        h('button.btn.primary', { type: 'button', 'data-gate-action': 'copy-link', 'data-code': admin.made.code, text: 'COPY LINK' })]));
    }
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
        h('td.gt-row-actions', {}, [
          state === 'Active' && c.pass_type === 'standard' ? h('button.btn', { type: 'button', 'data-gate-action': 'copy-link', 'data-code': c.code, text: 'COPY LINK' }) : null,
          state === 'Active' ? h('button.btn.danger', { type: 'button', 'data-gate-action': 'revoke', 'data-id': c.id, text: 'REVOKE' }) : null
        ].filter(Boolean))
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
          !m.disabled_at && m.role !== 'admin' ? h('button.btn.danger', { type: 'button', 'data-gate-action': 'disable', 'data-id': m.user_id, 'data-email': m.email, 'aria-label': 'Disable ' + m.email, text: 'DISABLE' }) : null,
          /* DISABLE keeps the row and stops them; CLEAR removes the row
             and makes the next sign-in a new one. Not offered for an
             admin — schema section 25 refuses it anyway, and a button
             that always errors is worse than no button. */
          m.role !== 'admin' ? h('button.btn.danger', { type: 'button', 'data-gate-action': 'reset-user', 'data-id': m.user_id, 'data-email': m.email, 'aria-label': 'Clear ' + m.email, text: 'CLEAR' }) : null
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
    admin.draft = {};
    await loadAdmin({ quiet: true });
    rerender();
  } catch (e) { toast(errorSentence(e, 'The code was not created.'), 'error'); }
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
const keepDraft = (e, el) => { if (el.closest('form.gt-create')) admin.draft[el.dataset.gateField] = el.value; };
delegate(document, 'input', 'form.gt-create [data-gate-field]', keepDraft);
delegate(document, 'change', 'form.gt-create [data-gate-field]', keepDraft);
delegate(document, 'input', '[data-gate-field="code"]', (e, el) => {
  // Show the normalised form as it is typed (FR-101), keeping the caret at the end.
  const f = formatCode(el.value);
  if (f !== el.value) el.value = f;
});
delegate(document, 'click', '[data-gate-action]', async (e, el) => {
  const g = gate();
  const act = el.dataset.gateAction;
  if (el.disabled) return;
  if (act === 'toggle-decided') { admin.showAllDecided = !admin.showAllDecided; rerender(); return; }
  el.disabled = true;   // one click, one RPC
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
    } else if (act === 'approve') {
      await g.admin.decideRequest(el.dataset.id, true); await loadAdmin();
      toast(`${el.dataset.email} is in. They are through the gate on their next visit.`, 'success');
    } else if (act === 'decline') {
      /* window.prompt, like the confirms beside it: null is Cancel, an
         empty string is "decline, no note". The note is shown to them. */
      const note = window.prompt(`Decline ${el.dataset.email}? They can ask again after seven days.\n\nA line for them (optional):`, '');
      if (note === null) return;
      await g.admin.decideRequest(el.dataset.id, false, note); await loadAdmin();
    } else if (act === 'recover') {
      /* The mirror of 'decline', and it needs no new RPC: approving a
         declined row inserts the membership and flips the status, which
         is also what ends the seven-day cooling-off. */
      await g.admin.recoverRequest(el.dataset.id); await loadAdmin();
      toast(`${el.dataset.email} is in after all. The decline is undone and the cooling-off with it.`, 'success');
    } else if (act === 'reset-user') {
      /* Destructive, so it says exactly what goes and exactly what does
         NOT — "fresh" reads as "deleted" to most people, and the thing
         an administrator is most afraid of here is losing somebody's
         films. Schema section 25 keeps that promise; this sentence is
         the one the person clicking actually reads. */
      if (!window.confirm(`Clear ${el.dataset.email}?\n\nThis removes their membership, their invite request, the invite code they used (freeing it) and their session — so their next sign-in starts as a new one.\n\nTheir projects, their organisation and any payment are NOT touched.`)) return;
      const out = await g.admin.resetUser(el.dataset.id);
      await loadAdmin();
      const bits = [];
      if (out && out.membership_removed) bits.push('membership removed');
      if (out && out.request_removed) bits.push('request cleared');
      if (out && out.redemptions_freed) bits.push(`${out.redemptions_freed} code ${out.redemptions_freed === 1 ? 'use' : 'uses'} freed`);
      if (out && out.device_lock_cleared) bits.push('device lock cleared');
      bits.push(out && out.signed_out ? 'signed out' : 'session left in place');
      toast(`${el.dataset.email} is a stranger again — ${bits.join(', ')}.`, 'success', 6000);
    } else if (act === 'reload') {
      await loadAdmin();
    } else if (act === 'copy') {
      await navigator.clipboard.writeText(formatCode(el.dataset.code));
      toast('Code copied.');
    } else if (act === 'copy-link') {
      await navigator.clipboard.writeText(startInviteLink(el.dataset.code));
      toast('Invite link copied — it opens the landing page and starts a 7-day trial on sign-in.');
    }
  } catch (err) { toast(errorSentence(err, 'That did not work.'), 'error'); }
  finally { el.disabled = false; }
});

export default { takeoverDialog, inviteSection, adminSection, wireGateUI };
