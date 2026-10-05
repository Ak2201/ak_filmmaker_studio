/* ============================================================
   ACCOUNT UI — sign-in pill, auth modal, account menu
   ------------------------------------------------------------
   Lifted out of chrome.js, which had grown a cloud section with
   four inline `onclick`/`onsubmit` attributes in it. Those were
   invisible to `npm run verify` — the modal is built lazily, so a
   page that never opens it has no inline handler to count — and
   fatal under the shipped CSP (`script-src 'self'`): the button
   that starts a sign-in was the one control on the site guaranteed
   not to work in production. Everything here is `delegate()` plus
   `data-auth-action`.

   WHAT THIS FILE PROMISES THE USER
   The account is durable backup and cross-device continuity. It is
   not where the work lives. Every state below — signed out, mid
   redirect, signed in, offline, errored — is a state in which the
   app keeps saving to this device, and the copy says so rather
   than implying the network is load-bearing.

   ONE WAY IN: Google. There used to be a magic-link/OTP path beside
   it; it is gone, along with the email field that fed it. Anything
   that reads like a second way in — a password field, another
   provider, an anonymous session — is a regression, not a feature.

   LOAD ORDER: imports ../lib/store.js first, for the reason in the
   banner at the top of that file. The import looks unused. It is not.
   ============================================================ */
import Store from '../lib/store.js';
import { delegate, h } from '../lib/dom.js';
/* account.js imports nothing and reaches cloud.js through its global,
   so this cannot cycle back into chrome.js the way an import of
   cloud.js would. It is in the same `studio` chunk already. */
import Account from '../lib/account.js';
import '../styles/auth.css';

const global = typeof window !== 'undefined' ? window : globalThis;

/* cloud.js and chrome.js are both reached through their globals rather
   than imported. chrome.js imports THIS file, so importing it back
   would be a cycle; cloud.js is in the same shared chunk and assigns
   window.StudioCloud at evaluation time, so by the time any handler
   here runs it is there. Both lookups are deliberately late-bound. */
const cloud = () => global.StudioCloud || null;
const ui    = () => global.StudioUI || null;

function toastError(msg) {
  const u = ui();
  if (u && u.toastError) u.toastError(msg); else console.warn('[auth]', msg);
}
function toastOk(msg) {
  const u = ui();
  if (u && u.toastSuccess) u.toastSuccess(msg); else console.log('[auth]', msg);
}

const errText = (e) => (e && (e.message || e.error_description)) || String(e || 'Something went wrong.');

function fmtEmail(e) {
  if (!e) return '';
  if (e.length > 22) return e.slice(0, 8) + '…' + e.slice(-10);
  return e;
}

// ============================================================
// SIGN-IN PILL
// ============================================================
// Three things in one control, because the toolbar has room for one:
// who you are, whether the account has your latest words, and the way
// in if you are not signed in yet.
// ============================================================
let _pillWired = false;

export function attachSignInPill(host) {
  if (!host || host.querySelector('#signInPill')) return;
  const pill = h('button#signInPill.sign-in-pill', {
    type: 'button',
    'data-auth-action': 'pill'
  }, [
    h('span.sip-dot', { 'aria-hidden': 'true' }),
    h('span.sip-label', { text: 'SIGN IN' })
  ]);
  host.appendChild(pill);
  refreshSignInPill();

  // Subscribe once per page, not once per pill. Sync state arrives on
  // the store bus instead (see the bottom of this file), so there is
  // one subscription per concern rather than two doing the same work.
  if (!_pillWired) {
    _pillWired = true;
    const c = cloud();
    if (c && c.onAuth) c.onAuth(() => { resetAccountCache(); refreshSignInPill(); });
  }
}

/* The pill reads state; it never writes any. Worth saying out loud:
   `verify` asserts zero localStorage writes across four idle seconds,
   and a status indicator that persisted its own last-seen state would
   be exactly the sort of thing that trips it. */
export function refreshSignInPill() {
  const pill = document.getElementById('signInPill');
  if (!pill) return;
  const c    = cloud();
  const sess = c && c.getSession && c.getSession();
  const lab  = pill.querySelector('.sip-label');
  if (!lab) return;

  // --- redirecting -------------------------------------------------
  if (c && c.isSigningIn && c.isSigningIn()) {
    pill.classList.remove('signed-in');
    pill.dataset.sync = 'busy';
    lab.textContent = 'OPENING GOOGLE…';
    pill.title = 'Waiting for Google. Your work is saved on this device.';
    pill.setAttribute('aria-label', 'Signing in with Google');
    pill.disabled = true;
    return;
  }
  pill.disabled = false;

  // --- signed out --------------------------------------------------
  if (!sess || !sess.user) {
    pill.classList.remove('signed-in');
    pill.dataset.sync = 'off';
    lab.textContent = 'SIGN IN';
    pill.title = 'Sign in to back up your projects to your account and pick them up on another device. Local-only keeps working either way.';
    pill.setAttribute('aria-label', 'Sign in to your account');
    return;
  }

  // --- signed in ---------------------------------------------------
  const email = (c.getUserEmail && c.getUserEmail()) || 'signed in';
  const st    = (c.getSyncStatus && c.getSyncStatus()) || { state: 'idle', detail: '' };
  pill.classList.add('signed-in');
  pill.dataset.sync = syncTone(st.state);
  lab.textContent = fmtEmail(email);
  pill.title = 'Signed in as ' + email + (st.detail ? ' · ' + st.detail : '');
  pill.setAttribute('aria-label', 'Account menu for ' + email + '. ' + (st.detail || ''));
}

/* Five sync states collapse to four tones, because the dot has to be
   readable at 6px and "synced" and "idle" mean the same thing to the
   person looking at it: nothing outstanding. */
function syncTone(state) {
  const S = (cloud() && cloud().SYNC_STATES) || {};
  if (state === S.SYNCING) return 'busy';
  if (state === S.OFFLINE) return 'waiting';
  if (state === S.ERROR)   return 'error';
  if (state === S.OFF)     return 'off';
  return 'ok';
}

// ============================================================
// ACCOUNT MENU
// ============================================================
/* Three questions in the order people actually ask them: who am I
   signed in as, which studio account am I in and what am I in it,
   and is my work anywhere other than this laptop. Then the way out.

   THE ACCOUNT ROW IS A SECOND ROUND TRIP AND IT MUST NOT BLOCK THE
   MENU. loadAccount() is two selects against Supabase; a menu that
   waited on them would hang for the length of a network on a control
   whose commonest use is SIGN OUT. So the menu paints immediately
   from what the session already holds, and the account row fills in
   underneath when the query lands — or says it could not, because a
   failed read is a state worth seeing rather than a blank space.

   THE RESULT IS CACHED IN THIS MODULE AND NOWHERE ELSE. Reopening
   the menu is then free, and an account changed elsewhere is picked
   up on the next auth event, which clears it. It must NOT go to
   localStorage: `verify` asserts zero writes across four idle seconds
   and a menu that remembered itself would trip it, correctly — the
   same reason the command palette keeps its recents in memory.

   THE ROLE IS A LABEL, NOT A PERMISSION, and this is the first place
   in the app that shows one. account_members.role is also what
   has_project_access() reads, so it is tempting to treat what is
   printed here as authority. Do not. Nothing in this menu refuses
   anything; what refuses is RLS. That distinction is load-bearing
   right now rather than theoretical: docs/SECURITY-RLS.md still has
   ten live checks that have never been run against a database, and
   acc_insert has no WITH CHECK — accounts_guard() is BEFORE UPDATE
   only — so an INSERT may carry its own plan and seat_limit. A role
   rendered here is a value this app has not yet proven unforgeable.
   Display it; never gate on it. account-panel.js carries the same
   caveat for the same reason.

   WHAT IS DELIBERATELY NOT COPIED FROM THE REFERENCE. The design
   this was built against puts a tick beside the current account and
   a "My Profile" button in the header. Both are omitted. loadAccount()
   returns one account — there is no switching — so a tick that can
   never be absent is decoration dressed as state, and there is no
   profile in this app for a profile button to open. A control that
   cannot vary, or cannot lead anywhere, is worse than no control. */

/* Identity is the PRODUCT's voice, so the avatar is --brand and not
   --accent. [data-phase] and [data-volume] both repoint --accent, and
   this menu is appended to document.body on every page in the studio:
   on accent it would wear the colour of whatever phase you happened
   to open it from, which is the one thing --brand exists to prevent. */

let _acct = { phase: 'idle', data: null, error: '' };

/* A different user must never see the previous one's account name for
   even a frame, so any auth movement drops the cache rather than
   refreshing it. Cheap: the next open re-reads. */
export function resetAccountCache() {
  _acct = { phase: 'idle', data: null, error: '' };
}

function displayName() {
  const c = cloud();
  const u = (c && c.getUser && c.getUser()) || null;
  const m = (u && u.user_metadata) || {};
  const n = String(m.full_name || m.name || '').trim();
  if (n) return n;
  /* Google supplies a name on every account this app can sign in
     with, but it is metadata and metadata can be absent. The local
     part of the address is a worse name and a correct fallback. */
  const email = (c && c.getUserEmail && c.getUserEmail()) || '';
  return email.split('@')[0] || 'Signed in';
}

function initials(name) {
  const parts = String(name || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!parts.length) return '?';
  const a = parts[0][0] || '';
  const b = parts.length > 1 ? (parts[parts.length - 1][0] || '') : '';
  return (a + b).toUpperCase();
}

function roleWord(r) {
  return r === 'owner' ? 'Owner' : r === 'admin' ? 'Admin' : 'Member';
}

/* Counted the way enforce_seat_limit() counts — account.js already
   did that arithmetic, so this reads its answer rather than redoing
   it. Two opinions about one number disagree the first time one of
   them is edited. */
function seatWord(seats) {
  if (!seats || !seats.limit) return '';
  return seats.used + ' of ' + seats.limit + ' seat' + (seats.limit === 1 ? '' : 's');
}

function paintAccountBlock() {
  const wrap = document.getElementById('amAccount');
  if (!wrap) return;                       // menu closed while the query was in flight
  wrap.textContent = '';

  if (_acct.phase === 'idle' || _acct.phase === 'loading') {
    wrap.append(h('p.am-acct-note', { text: 'Checking your account…' }));
    return;
  }

  if (_acct.phase === 'error') {
    wrap.append(h('p.am-acct-note.is-bad', { text: _acct.error || 'Could not read your account.' }));
    return;
  }

  /* No account is not an error and must not read as one: most people
     signed in to back their own work up have exactly this and need
     nothing else. */
  if (!_acct.data) {
    wrap.append(
      h('a.am-item', { href: 'settings.html#account', text: '+ CREATE A STUDIO ACCOUNT' }),
      h('p.am-acct-note', { text: 'An account is how a film reaches somebody else.' })
    );
    return;
  }

  const d    = _acct.data;
  const name = (d.account && d.account.name) || 'Your account';
  const seat = seatWord(d.seats);
  const sub  = roleWord(d.role) + (seat ? ' · ' + seat : '');

  /* settings.html#account resolves because accountSection() is
     rendered whenever there is a session, and this menu only exists
     when there is one. Worth stating: a nav target that depends on
     data existing is a trap this codebase has already paid for. */
  wrap.append(h('a.am-acct', {
    href: 'settings.html#account',
    'aria-label': 'Account settings for ' + name + '. You are ' + roleWord(d.role) + '.'
  }, [
    h('span.am-acct-mark', { 'aria-hidden': 'true', text: initials(name) }),
    h('span.am-acct-text', {}, [
      h('span.am-acct-name', { text: name }),
      h('span.am-acct-sub', { text: sub })
    ])
  ]));
}

async function fillAccountBlock() {
  if (_acct.phase === 'ok' || _acct.phase === 'loading') { paintAccountBlock(); return; }
  _acct = { phase: 'loading', data: null, error: '' };
  paintAccountBlock();
  try {
    const data = await Account.loadAccount();
    _acct = { phase: 'ok', data: data || null, error: '' };
  } catch (err) {
    /* account.js owns the translation from a Postgres code to a
       sentence; this file does not get a second opinion about it. */
    _acct = { phase: 'error', data: null, error: Account.explain(err) };
  }
  paintAccountBlock();
}

function closeAccountMenu() {
  const m = document.getElementById('accountMenu');
  if (m) m.remove();
}

export function openAccountMenu(anchor) {
  if (document.getElementById('accountMenu')) { closeAccountMenu(); return; }
  const c  = cloud();
  if (!c) return;
  const st    = (c.getSyncStatus && c.getSyncStatus()) || { state: 'idle', detail: '' };
  const email = (c.getUserEmail && c.getUserEmail()) || '';
  const name  = displayName();

  const menu = h('div#accountMenu.account-menu', { role: 'menu' }, [
    h('div.am-you', {}, [
      h('span.am-avatar', { 'aria-hidden': 'true', text: initials(name) }),
      h('span.am-you-text', {}, [
        h('span.am-you-name', { text: name }),
        /* NOT .am-email: chrome.css styles that class as a bordered
           standalone row, which is wrong inside this header. A new
           name rather than an override, because beating a rule in
           another sheet depends on import order — see the ordering
           trap in CLAUDE.md. */
        h('span.am-you-mail', { text: email })
      ])
    ]),
    h('div#amAccount.am-account'),
    h('div.am-sync', { 'data-sync': syncTone(st.state) }, [
      h('span.am-sync-dot', { 'aria-hidden': 'true' }),
      h('span.am-sync-text', { text: st.detail || 'Local only' })
    ]),
    h('button.am-item', { type: 'button', role: 'menuitem', 'data-auth-action': 'sync',     text: '↻ SYNC NOW' }),
    h('button.am-item', { type: 'button', role: 'menuitem', 'data-auth-action': 'settings', text: '⚙ CLOUD SETTINGS' }),
    h('button.am-item.danger', { type: 'button', role: 'menuitem', 'data-auth-action': 'signout', text: 'SIGN OUT' }),
    h('p.am-foot', { text: 'Signing out leaves every project on this device.' })
  ]);
  document.body.appendChild(menu);
  fillAccountBlock();

  const r = anchor.getBoundingClientRect();
  menu.style.top = (r.bottom + 6) + 'px';
  /* Clamp to the viewport. At 390px the toolbar pill sits close to the
     right edge and a 220px menu pinned to it pushed the document
     sideways — which `verify` measures, and which is a real thumb
     problem before it is a test failure. */
  const width = 260;
  const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - width - 8));
  menu.style.right = right + 'px';
  menu.classList.add('show');

  setTimeout(() => {
    document.addEventListener('click', function close(ev) {
      if (!menu.contains(ev.target) && ev.target !== anchor) {
        closeAccountMenu();
        document.removeEventListener('click', close);
      }
    });
  }, 50);
}

// ============================================================
// AUTH MODAL
// ============================================================
const GOOGLE_MARK =
  '<svg viewBox="0 0 24 24" width="15" height="15" fill="currentColor" aria-hidden="true" focusable="false">' +
  '<path d="M21.35 11.1h-9.18v2.92h5.27c-.23 1.4-1.6 4.11-5.27 4.11-3.17 0-5.76-2.62-5.76-5.85s2.59-5.85 5.76-5.85c1.81 0 3.02.77 3.71 1.43l2.53-2.43C16.79 4.06 14.62 3 12.17 3 6.92 3 2.7 7.22 2.7 12.27s4.22 9.27 9.47 9.27c5.47 0 9.1-3.84 9.1-9.25 0-.62-.07-1.09-.16-1.59z"/>' +
  '</svg>';

function ensureCloudAuthModal() {
  let m = document.getElementById('cloudAuthModal');
  if (m) return m;

  const card = h('form.cm-card', { novalidate: true }, [
    h('button.cm-close', { type: 'button', 'aria-label': 'Close', 'data-auth-action': 'close', text: '×' }),
    h('div.cm-eyebrow', { text: 'ACCOUNT · OPTIONAL' }),
    h('h2#cmHeading', { html: 'Sign <em>in.</em>' }),
    h('p.cm-deck', {
      text: 'Your writing is saved on this device either way. An account adds a durable backup and lets you pick the same project up on another machine.'
    }),
    h('p#cmError.auth-error', { role: 'alert', hidden: true }),

    // ---- first-run configuration -----------------------------------
    h('div#cmConfigBlock.cm-config', { hidden: true }, [
      h('label', { for: 'cmCfgUrl', text: 'Supabase Project URL' }),
      h('input#cmCfgUrl', { type: 'url', placeholder: 'https://xxxx.supabase.co', autocomplete: 'off', spellcheck: 'false' }),
      h('label', { for: 'cmCfgKey', text: 'Anon (public) key' }),
      h('input#cmCfgKey', { type: 'text', placeholder: 'eyJhbGciOi…', autocomplete: 'off', spellcheck: 'false' }),
      h('button.cm-btn.primary', { type: 'button', 'data-auth-action': 'save-cfg', text: 'SAVE & CONTINUE' }),
      h('p.cm-hint', {
        text: 'The anon key is public by design — access is decided by row-level policies on the database, not by hiding this string. Never paste a service-role key here.'
      })
    ]),

    // ---- the only way in -------------------------------------------
    // Google, and nothing else. One path means one set of states to
    // get right, one thing to explain, and no password for this app to
    // hold, lose or leak. It is also the only provider enabled on the
    // Supabase side — see the header of supabase-schema.sql; a button
    // removed here is not a provider disabled there.
    h('div#cmAuthBlock', {}, [
      h('button#cmGoogle.cm-btn.google', { type: 'button', 'data-auth-action': 'google' }, [
        h('span.g-mark', { html: GOOGLE_MARK, 'aria-hidden': 'true' }),
        h('span.cm-btn-label', { text: 'CONTINUE WITH GOOGLE' })
      ]),
      h('p.cm-hint', { text: 'Google is the only way in. There is no password for this app to remember or lose, and no email address stored here until you sign in.' }),
      /* Hidden unless mayConfigure() says otherwise — see it for why
         an ordinary visitor should never meet this. Rendered rather
         than omitted so that showConfigBlock() has something to
         unhide when an admin signs in without reloading. */
      h('a#cmCfgLink.cm-link', { href: '#', 'data-auth-action': 'show-cfg', hidden: true, text: 'Configure your own Supabase project →' })
    ])
  ]);

  m = h('div#cloudAuthModal.cm-overlay', {
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'cmHeading'
  }, [card]);
  document.body.appendChild(m);

  // A <form> with no inline onsubmit: Enter in either config field
  // should save the config rather than reload the page. With the email
  // path gone the auth block has no text input left, so Enter there can
  // only come from the Google button, which the click delegate already
  // handles — preventDefault and stop, rather than starting a second
  // redirect on top of the first.
  card.addEventListener('submit', (e) => {
    e.preventDefault();
    const block = m.querySelector('#cmConfigBlock');
    if (block && !block.hidden) saveConfig();
  });
  m.addEventListener('click', (e) => { if (e.target === m) closeCloudAuthModal(); });
  return m;
}

function setModalError(msg) {
  const el = document.getElementById('cmError');
  if (!el) return;
  if (!msg) { el.hidden = true; el.textContent = ''; return; }
  el.textContent = msg;
  el.hidden = false;
}

function setBusy(id, busy, busyLabel, restLabel) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const lab = btn.querySelector('.cm-btn-label');
  btn.disabled = !!busy;
  btn.setAttribute('aria-busy', busy ? 'true' : 'false');
  if (lab) lab.textContent = busy ? busyLabel : restLabel;
}

export function openCloudAuthModal(opts) {
  opts = opts || {};
  const c = cloud();
  if (!c) { toastError('The account module did not load on this page.'); return; }

  const m = ensureCloudAuthModal();
  const heading = m.querySelector('#cmHeading');
  setModalError('');

  /* The escape hatch for self-hosters, shown to the people it is for
     and to nobody else. Set every time the modal opens rather than
     once at build: isAdmin() reads the SIGNED-IN address, which is
     null until a sign-in lands, so a value decided at render time
     would be stale for exactly the person it is meant for. */
  const cfgLink = m.querySelector('#cmCfgLink');
  if (cfgLink) cfgLink.hidden = !mayConfigure();

  if (c.isConfigured()) {
    m.querySelector('#cmConfigBlock').hidden = true;
    m.querySelector('#cmAuthBlock').hidden = false;
    if (opts.mode === 'settings' && mayConfigure()) {
      heading.innerHTML = 'Account <em>settings.</em>';
      showConfigBlock();
    } else {
      heading.innerHTML = 'Sign <em>in.</em>';
    }
  } else {
    // Nothing to sign in TO yet. Google cannot be offered before the
    // project this browser talks to is known.
    m.querySelector('#cmConfigBlock').hidden = false;
    m.querySelector('#cmAuthBlock').hidden = true;
    heading.innerHTML = 'Connect an <em>account.</em>';
    const cfg = c.getCfg() || {};
    m.querySelector('#cmCfgUrl').value = cfg.url || '';
    m.querySelector('#cmCfgKey').value = cfg.key || '';
  }

  if (opts.shareMeta) {
    const old = m.querySelector('.cm-share-banner');
    if (old) old.remove();
    const banner = h('div.cm-share-banner', {}, [
      h('strong', { text: '📎 You have been invited: ' }),
      // textContent, not innerHTML: the title comes off a share link,
      // which is to say from somebody else.
      h('span', { text: '"' + opts.shareMeta.title + '" · role: ' + opts.shareMeta.role + '.' }),
      h('br'),
      h('span', { text: 'Sign in to claim it.' })
    ]);
    m.querySelector('.cm-card').insertBefore(banner, m.querySelector('#cmError'));
  }

  m.classList.add('show');
  setTimeout(() => {
    /* Focus the first thing you would actually use. With the email
       field gone that is the Google button itself — not a text input,
       so nothing here assumes one exists. */
    const ip = m.querySelector('#cmConfigBlock').hidden
      ? m.querySelector('#cmGoogle')
      : m.querySelector('#cmCfgUrl');
    if (ip) ip.focus();
  }, 80);
}

export function closeCloudAuthModal() {
  const m = document.getElementById('cloudAuthModal');
  if (m) m.classList.remove('show');
}

// ----- actions -------------------------------------------------
/* WHO IS ALLOWED TO RETARGET THIS BROWSER AT ANOTHER DATABASE.
   ------------------------------------------------------------
   Two cases, and the second is the one that must not be forgotten:

     - an ADMIN, as named by VITE_ADMIN_EMAILS — a convenience, not a
       security control. The bundle is public and anybody can call
       setCfg() from a console; what stops them reading another
       account's rows is RLS, not this. See isAdmin() in cloud.js.
     - ANY visitor, when the build carries no project of its own.
       Without this clause a self-hosted build with empty env vars
       would hide the only form that could ever configure it, and the
       app would be permanently unable to sign anybody in — the
       chicken-and-egg the build-time config exists to break, put back
       by the fix for it.

   Ordinary visitors to the hosted build meet neither case, which is
   the point: they came to write a film, and a project URL and a JWT
   are not their problem. */
export function mayConfigure() {
  const c = cloud();
  if (!c) return false;
  if (!c.isConfigured || !c.isConfigured()) return true;
  return !!(c.isAdmin && c.isAdmin());
}

export function showConfigBlock() {
  if (!mayConfigure()) return;
  const c = cloud();
  const m = ensureCloudAuthModal();
  m.querySelector('#cmConfigBlock').hidden = false;
  const cfg = (c && c.getCfg && c.getCfg()) || {};
  m.querySelector('#cmCfgUrl').value = cfg.url || '';
  m.querySelector('#cmCfgKey').value = cfg.key || '';
}

export async function saveConfig() {
  const c = cloud();
  if (!c) return;
  const m = ensureCloudAuthModal();
  const url = m.querySelector('#cmCfgUrl').value.trim();
  const key = m.querySelector('#cmCfgKey').value.trim();
  if (!url || !key) { setModalError('Both the project URL and the anon key are required.'); return; }
  if (/service_role/.test(key)) {
    // Not a real check — just the one mistake worth catching early.
    setModalError('That looks like a service-role key. Only the anon (public) key belongs in a browser.');
    return;
  }
  setModalError('');
  c.setCfg({ url, key });
  const ok = await c.ensureClient();
  if (!ok) {
    setModalError('Could not reach that project. Check the URL and the anon key.');
    return;
  }
  toastOk('Connected. Sign in below.');
  m.querySelector('#cmConfigBlock').hidden = true;
  m.querySelector('#cmAuthBlock').hidden = false;
  m.querySelector('#cmHeading').innerHTML = 'Sign <em>in.</em>';
}

export async function startGoogle() {
  const c = cloud();
  if (!c) return;
  setModalError('');
  setBusy('cmGoogle', true, 'OPENING GOOGLE…', 'CONTINUE WITH GOOGLE');
  refreshSignInPill();
  try {
    await c.signInWithGoogle();
    // If this resolves at all, the navigation is already under way.
  } catch (e) {
    setBusy('cmGoogle', false, 'OPENING GOOGLE…', 'CONTINUE WITH GOOGLE');
    refreshSignInPill();
    setModalError(errText(e));
    toastError(errText(e));
  }
}

// ============================================================
// ONE DELEGATED LISTENER
// ============================================================
// Replaces four inline attributes. Registered at module evaluation on
// `document`, so it covers controls that do not exist yet — which is
// all of them, since the modal is built on first open.
// ============================================================
delegate(document, 'click', '[data-auth-action]', async (e, el) => {
  const act = el.getAttribute('data-auth-action');
  if (act === 'show-cfg' || el.tagName === 'A') e.preventDefault();
  const c = cloud();

  switch (act) {
    case 'pill': {
      const sess = c && c.getSession && c.getSession();
      if (sess && sess.user) openAccountMenu(el); else openCloudAuthModal();
      break;
    }
    case 'close':    closeCloudAuthModal(); break;
    case 'google':   await startGoogle(); break;
    case 'save-cfg': await saveConfig(); break;
    case 'show-cfg': showConfigBlock(); break;
    case 'settings': closeAccountMenu(); openCloudAuthModal({ mode: 'settings' }); break;
    case 'sync': {
      closeAccountMenu();
      if (!c) break;
      try {
        await c.flushQueue();
        await c.attachToCurrentProject();
        const st = c.getSyncStatus ? c.getSyncStatus() : null;
        toastOk(st && st.detail ? st.detail : 'Synced.');
      } catch (err) { toastError(errText(err)); }
      break;
    }
    case 'signout': {
      closeAccountMenu();
      if (!c) break;
      await c.signOut();
      refreshSignInPill();
      const u = ui();
      if (u && u.toastInfo) {
        u.toastInfo('Signed out. Every project is still on this device.');
      }
      break;
    }
    default: break;
  }
});

// Escape closes the modal, same as every other overlay in the app.
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  const m = document.getElementById('cloudAuthModal');
  if (m && m.classList.contains('show')) closeCloudAuthModal();
  closeAccountMenu();
});

/* Keep the pill honest about state that changed elsewhere: a sign-in
   in another tab, a queue that drained, a project switch. */
Store.subscribe('cloud:status', () => refreshSignInPill());
Store.subscribe('cloud:auth-error', (info) => {
  setModalError(info && info.message ? info.message : 'Sign-in did not complete.');
});

export default {
  attachSignInPill,
  refreshSignInPill,
  openAccountMenu,
  resetAccountCache,
  openCloudAuthModal,
  closeCloudAuthModal,
  showConfigBlock,
  saveConfig,
  startGoogle
};
