/* ============================================================
   THE ACCOUNT PANEL — list members, invite, revoke
   ------------------------------------------------------------
   The UI half of src/lib/account.js. Read that file's header for
   why this needed no new SQL and why seats are not negotiable from
   a browser.

   IT RENDERS NOTHING WHEN SIGNED OUT, and that is the honest
   default rather than a teaser: an account is the only thing on
   settings.html that is not about this device, so showing it to
   somebody with no account would be advertising a feature they
   cannot reach from there. The sign-in pill is the way in and it is
   on every page.

   THE PANEL NEVER DECIDES WHO MAY DO WHAT. It asks the row it was
   given — `role` comes from account.js, which reads it out of the
   database — and hides controls accordingly. That is tidiness, not
   security: anybody can call the same functions from a console, and
   what actually refuses them is RLS plus account_members_guard().
   The same caveat the admin console carries.

   STATE LIVES IN THE MODULE, NOT IN THE DOM. One `state` object,
   one render(), and every action re-reads from the database rather
   than patching the list in place — a members list that drifts from
   the rows is worse than a slow one, and this is a panel somebody
   opens twice a month.
   ============================================================ */
import { h, delegate } from '../lib/dom.js';
import Account from '../lib/account.js';

let state = { phase: 'idle', data: null, error: '', busy: '' };
let host  = null;

function setState(patch) {
  state = Object.assign({}, state, patch);
  paint();
}

/* ---- small pieces ------------------------------------------ */

function roleLabel(r) {
  return r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : 'Member';
}

function statusLabel(m) {
  if (m.status === 'active')  return 'joined';
  if (m.status === 'pending') return 'invited — has not signed in yet';
  return m.status;
}

function memberRow(m, canManage, myEmail) {
  const isOwner = m.role === 'owner';
  const isMe    = (m.invited_email || '').toLowerCase() === (myEmail || '').toLowerCase();

  const row = h('li.acct-row');
  row.append(h('div.acct-who', {}, [
    h('span.acct-mail', { text: m.invited_email + (isMe ? ' (you)' : '') }),
    h('span.acct-state', { text: roleLabel(m.role) + ' · ' + statusLabel(m) })
  ]));

  /* The owner's row has no remove button, and the reason is not
     politeness: account_members_guard() refuses the delete anyway,
     so offering it would be a button whose only outcome is an
     error. */
  if (canManage && !isOwner) {
    row.append(h('button.btn.acct-revoke', {
      type: 'button',
      'data-acct-action': 'revoke',
      'data-email': m.invited_email,
      text: m.status === 'pending' ? 'Cancel invite' : 'Remove'
    }));
  }
  return row;
}

function seatLine(seats) {
  const full = seats.used >= seats.limit;
  const p = h('p.acct-seats' + (full ? '.is-full' : ''), {
    text: 'Seats: ' + seats.used + ' of ' + seats.limit + '.'
  });
  if (full) {
    /* Says what the limit IS rather than offering a form that the
       database will reject. accounts_guard() refuses any client
       attempt to raise seat_limit — "Plan and limits are set by
       billing, not by the client" — so there is nothing this page
       could honestly put a button on. */
    p.append(h('span', {
      text: ' Inviting anybody else needs another seat, and seats are set by '
          + 'billing rather than from this page — raise seat_limit on the '
          + 'account in your Supabase project.'
    }));
  }
  return p;
}

/* ---- the three states -------------------------------------- */

function renderCreate() {
  const wrap = h('div.acct-create');
  wrap.append(h('p.st-note', {
    text: 'You do not have a studio account yet. Creating one lets you invite '
        + 'other people to the films you put in it. Your work is unaffected '
        + 'either way — this adds a shared space, it does not move anything '
        + 'into one.'
  }));
  wrap.append(h('label.acct-label', { for: 'acctName', text: 'STUDIO NAME' }));
  wrap.append(h('input#acctName.acct-input', {
    type: 'text', placeholder: 'My Studio', autocomplete: 'off', spellcheck: 'false'
  }));
  wrap.append(h('button.btn.primary', {
    type: 'button', 'data-acct-action': 'create',
    text: state.busy === 'create' ? 'Creating…' : 'Create the account'
  }));
  return wrap;
}

function renderMembers(d, myEmail) {
  const canManage = d.role === 'owner' || d.role === 'admin';
  const wrap = h('div.acct-body');

  wrap.append(h('p.acct-name', { text: d.account.name }));
  wrap.append(seatLine(d.seats));

  const list = h('ul.acct-list');
  if (!d.members.length) {
    list.append(h('li.acct-row', {}, [
      h('div.acct-who', {}, [h('span.acct-state', { text: 'No member rows yet.' })])
    ]));
  } else {
    d.members.forEach((m) => list.append(memberRow(m, canManage, myEmail)));
  }
  wrap.append(list);

  if (canManage && d.seats.used < d.seats.limit) {
    const form = h('div.acct-invite');
    form.append(h('label.acct-label', { for: 'acctEmail', text: 'INVITE BY EMAIL' }));
    form.append(h('input#acctEmail.acct-input', {
      type: 'email', placeholder: 'someone@example.com',
      autocomplete: 'off', spellcheck: 'false'
    }));
    const sel = h('select#acctRole.acct-input');
    sel.append(h('option', { value: 'member', text: 'Member — the films you share with them' }));
    sel.append(h('option', { value: 'admin',  text: 'Admin — every film in the account' }));
    form.append(sel);
    form.append(h('button.btn', {
      type: 'button', 'data-acct-action': 'invite',
      text: state.busy === 'invite' ? 'Inviting…' : 'Send the invite'
    }));
    form.append(h('p.st-note', {
      text: 'They join by signing in with Google using that exact address — there '
          + 'is no link to forward and nothing to copy. An admin can reach every '
          + 'film in this account, so invite as a member unless you mean it.'
    }));
    wrap.append(form);
  }

  if (canManage) wrap.append(filmsBlock(d));

  return wrap;
}

/* ---- which films are in the account -------------------------
   ATTACHING A FILM IS AN ACCESS-CONTROL CHANGE, NOT FILING, and
   this block exists to make that a decision rather than a side
   effect. has_project_access() grants every ACTIVE owner/admin of
   the account edit on every project whose account_id matches — so
   adding a film here hands it to everyone in the account, present
   and future, and the confirm says exactly that.

   It is also why creating an account does not sweep your films
   into it. The two actions are separate on purpose: one makes a
   shared space, the other decides what goes in it. */
function filmsBlock(d) {
  const wrap = h('div.acct-films');
  wrap.append(h('p.acct-label', { text: 'FILMS IN THIS ACCOUNT' }));

  const rows = d.projects || [];
  if (!rows.length) {
    wrap.append(h('p.st-note', {
      text: 'No films have reached the cloud yet. A project appears here once it '
          + 'has synced — this list is the account\u2019s, not this browser\u2019s.'
    }));
    return wrap;
  }

  const list = h('ul.acct-list');
  rows.forEach((p) => {
    const inAcc = p.account_id === d.account.id;
    const elsewhere = !!p.account_id && !inAcc;
    const row = h('li.acct-row');
    row.append(h('div.acct-who', {}, [
      h('span.acct-mail', { text: p.title || 'Untitled' }),
      h('span.acct-state', {
        text: inAcc ? 'shared with this account'
            : elsewhere ? 'in another account'
            : 'yours alone'
      })
    ]));
    /* A film held by a DIFFERENT account is not this panel's to
       move: the owner of that one decides. Shown, not actionable. */
    if (!elsewhere) {
      row.append(h('button.btn', {
        type: 'button',
        'data-acct-action': inAcc ? 'detach' : 'attach',
        'data-project': p.id,
        'data-title': p.title || 'Untitled',
        text: inAcc ? 'Make it mine alone' : 'Share with the account'
      }));
    }
    list.append(row);
  });
  wrap.append(list);
  return wrap;
}

/* ---- paint -------------------------------------------------- */

function paint() {
  if (!host) return;
  const c = window.StudioCloud;
  const myEmail = (c && c.getUserEmail && c.getUserEmail()) || '';

  host.replaceChildren();

  if (state.error) {
    host.append(h('p.acct-error', { role: 'alert', text: state.error }));
  }

  if (state.phase === 'loading') {
    host.append(h('p.st-note', { text: 'Reading the account…' }));
    return;
  }
  if (state.phase === 'none')  { host.append(renderCreate()); return; }
  if (state.phase === 'ready') { host.append(renderMembers(state.data, myEmail)); return; }
}

/* ---- load --------------------------------------------------- */

export async function refresh() {
  setState({ phase: 'loading', error: '' });
  try {
    const d = await Account.loadAccount();
    if (d) { try { d.projects = await Account.listProjects(); } catch (e) { d.projects = []; } }
    setState({ phase: d ? 'ready' : 'none', data: d, busy: '' });
  } catch (e) {
    setState({ phase: 'none', data: null, error: Account.explain(e), busy: '' });
  }
}

/**
 * Build the section. Returns null when signed out, so the caller can
 * append unconditionally — the same shape renderAdmin() uses.
 */
export function accountSection(section) {
  const c = window.StudioCloud;
  if (!c || !c.getSession || !c.getSession()) return null;

  const sec = section('account', 'Your account · shared with people you invite',
    'Who else can open these films.',
    'An account is the one thing on this page that is not about this browser. '
      + 'It is how a film reaches somebody else — they sign in with Google and '
      + 'the films in this account are there. Everything else on this page stays '
      + 'on this device.');

  host = h('div#acctHost');
  sec.append(host);
  paint();
  refresh();
  return sec;
}

/* ---- events — delegated, no inline handlers ----------------- */

delegate(document, 'click', '[data-acct-action]', (e, el) => {
  const act = el.getAttribute('data-acct-action');
  if (state.busy) return;

  if (act === 'create') {
    const name = (document.getElementById('acctName') || {}).value || '';
    setState({ busy: 'create', error: '' });
    Account.createAccount(name)
      .then((r) => { if (r && r.warning) setState({ error: r.warning }); return refresh(); })
      .catch((err) => setState({ busy: '', error: Account.explain(err) }));
    return;
  }

  if (act === 'invite') {
    const email = (document.getElementById('acctEmail') || {}).value || '';
    const role  = (document.getElementById('acctRole')  || {}).value || 'member';
    setState({ busy: 'invite', error: '' });
    Account.inviteMember(state.data.account.id, email, role)
      .then(() => refresh())
      .catch((err) => setState({ busy: '', error: Account.explain(err) }));
    return;
  }

  if (act === 'attach' || act === 'detach') {
    const id    = el.getAttribute('data-project');
    const title = el.getAttribute('data-title');
    const on    = act === 'attach';
    const msg = on
      ? 'Share "' + title + '" with ' + state.data.account.name + '?\n\n'
        + 'Everybody who is an owner or admin of this account \u2014 now or later \u2014 '
        + 'will be able to open and EDIT it. Nothing is copied or moved; you stay '
        + 'its owner.'
      : 'Take "' + title + '" back out of ' + state.data.account.name + '?\n\n'
        + 'Members lose access to it. Nothing written is deleted, and anybody '
        + 'invited to the film itself keeps that.';
    if (!confirm(msg)) return;
    setState({ busy: 'films', error: '' });
    Account.setProjectAccount(id, on ? state.data.account.id : null)
      .then(() => refresh())
      .catch((err) => setState({ busy: '', error: Account.explain(err) }));
    return;
  }

  if (act === 'revoke') {
    const email = el.getAttribute('data-email');
    if (!confirm('Remove ' + email + ' from this account?\n\nThey lose access to '
               + 'the films in it. Nothing they wrote is deleted.')) return;
    setState({ busy: 'revoke', error: '' });
    Account.revokeMember(state.data.account.id, email)
      .then(() => refresh())
      .catch((err) => setState({ busy: '', error: Account.explain(err) }));
  }
});

export default { accountSection, refresh };
