/* ============================================================
   THE FILMMAKER'S STUDIO — FIELD COMMENTS
   ------------------------------------------------------------
   The UI half of CLAUDE.md open item 5. The API it drives has been
   sitting finished in src/lib/cloud.js — listComments / createComment /
   updateCommentStatus, threads, suggestions, accept and reject — with
   nothing attached to it.

   THREE DECISIONS, and each of them is the reason a line below looks
   the way it does.

   1. A COMMENT HANGS OFF A FIELD, NOT OFF A POSITION.
      This is a form of several hundred inputs, not a prose document.
      There are no stable character offsets to anchor to: the whole
      point of a note is that the text under it is about to change.
      `comments.field_key` is the same `data-key` string the blueprint
      saves under — the one identifier CLAUDE.md's first invariant says
      is a contract and will not be renamed. So a thread survives the
      value it was written about being rewritten from scratch, which is
      exactly what a suggestion asks for.

   2. ACCEPTING A SUGGESTION GOES THROUGH THE NORMAL SAVE PATH.
      applyValue() sets `.value` and then dispatches a BUBBLING `input`
      and `change` from the field itself. That is the same event the
      user's own keystroke produces, so every listener the page already
      has runs in the order it already runs in: the page's debounced
      save, the derived widgets, the cloud push. Nothing here writes
      localStorage, and nothing here calls the page's saveData()
      directly.

      The alternative — write the store, then re-render — is the bug
      CLAUDE.md names as "don't persist the same thing twice", one
      level up: a second way for a value to change is a second thing to
      keep in step, and the one that skips the field would silently
      skip the word counter, the pacing chart and the budget with it.
      The status is only marked 'accepted' AFTER the value has landed;
      if the write fails, the row stays open and honest.

   3. IT DEGRADES HONESTLY, BECAUSE LOCAL-FIRST IS THE PRODUCT.
      The private note — one textarea, `arunak_note_<key>`, on this
      device, no account — is the FIRST thing in the panel and it works
      in every state, including no cloud, signed out, and offline. The
      shared thread is a second section underneath that says plainly
      which of those states you are in. It never pretends: "no comments
      yet" is only ever printed when we have actually asked the server
      and it answered.

   NO NEW STORAGE KEYS. The private note reuses the `arunak_note_`
   prefix that feature.js has always used, so nothing needs adding to
   SCOPED_KEYS / PROJECT_KEYS / ALL_KEYS / the Supabase scope list.
   Panel state is in memory.

   NO INLINE HANDLERS. One delegated listener on `[data-cmt-action]`,
   in its own attribute namespace so it cannot collide with a page's
   own `data-action` map.
   ============================================================ */
import Store from '../lib/store.js';
import { esc, delegate } from '../lib/dom.js';
import '../styles/comments.css';

/* ------------------------------------------------------------
   CONFIG — one per page
   ------------------------------------------------------------ */
let CFG = {
  scope: 'feature',              // comments.scope — matches the DB scope name
  notePrefix: 'arunak_note_',    // existing local key prefix. Do not change.
  hostSelector: '.ask, .pp-ask', // the block a panel is appended to
  onNoteChange: null             // (key, hasNote) — page updates its own badge
};

let _wired   = false;
let _role    = null;   // 'owner' | 'edit' | 'comment' | 'view' | null
let _roleFor = null;   // project id the role was read for
let _threads = new Map();  // field_key -> rows[]  (last fetched)
let _loadedFor = null;     // project id _threads belongs to

const cloud = () => (typeof window !== 'undefined' ? window.StudioCloud : null);

/** Configured means a Supabase URL + anon key exist in this browser. */
function isConfigured() {
  const c = cloud();
  try { return !!(c && c.isConfigured && c.isConfigured()); } catch (e) { return false; }
}
function signedIn() {
  const c = cloud();
  try { return !!(c && c.getSession && c.getSession()); } catch (e) { return false; }
}
function projectId() {
  try { return Store.currentProjectId(); } catch (e) { return null; }
}
function online() {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

/* Whether this user may resolve a suggestion.

   Asked rather than assumed. An RLS refusal arrives as a 403 in the
   middle of a click, which is a bad moment to find out you were never
   allowed — and the schema now requires edit-level access to change a
   comment's status (docs/SECURITY-RLS.md, C1), so a comment-only guest
   genuinely cannot accept, however the buttons look. */
const canResolve = () => _role === 'owner' || _role === 'edit';
const canPost    = () => _role === 'owner' || _role === 'edit' || _role === 'comment';

/* ------------------------------------------------------------
   PRIVATE NOTE (local, always available)
   ------------------------------------------------------------ */
export function hasNote(key) {
  try { return !!localStorage.getItem(CFG.notePrefix + key); } catch (e) { return false; }
}
function readNote(key) {
  try { return localStorage.getItem(CFG.notePrefix + key) || ''; } catch (e) { return ''; }
}
function writeNote(key, value) {
  try {
    if (value.trim()) localStorage.setItem(CFG.notePrefix + key, value);
    else localStorage.removeItem(CFG.notePrefix + key);
  } catch (e) { /* private mode, quota — the panel still works */ }
  if (typeof CFG.onNoteChange === 'function') {
    try { CFG.onNoteChange(key, !!value.trim()); } catch (e) {}
  }
}

/* ------------------------------------------------------------
   THE NORMAL SAVE PATH
   ------------------------------------------------------------ */
export function fieldEl(key) {
  const sel = (typeof CSS !== 'undefined' && CSS.escape)
    ? '[data-key="' + CSS.escape(key) + '"]'
    : '[data-key="' + key.replace(/"/g, '\\"') + '"]';
  return document.querySelector(sel);
}
export function fieldValue(key) {
  const el = fieldEl(key);
  if (!el) return '';
  if (el.tagName === 'LI') return el.classList.contains('checked') ? 'checked' : '';
  return el.value == null ? '' : String(el.value);
}

/* Set a field the way a person would.

   `.value` then a BUBBLING input + change. Everything the page wired —
   its own debouncedSave, the derived widgets, the cloud push — is
   listening for exactly these. Nothing here touches localStorage. */
function applyValue(key, value) {
  const el = fieldEl(key);
  if (!el) throw new Error('That field is not on this page.');
  if (el.tagName === 'LI') throw new Error('A checklist item cannot take a suggested value.');
  el.value = value == null ? '' : String(value);
  el.dispatchEvent(new Event('input',  { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
  el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  try { el.focus({ preventScroll: true }); } catch (e) { /* not focusable */ }
  return el;
}

/* ------------------------------------------------------------
   CLOUD READS
   ------------------------------------------------------------ */
async function ensureRole(pid) {
  if (_roleFor === pid && _role !== null) return _role;
  const c = cloud();
  if (!c || !c.getProjectRole) return null;
  try {
    _role = await c.getProjectRole(pid);
    _roleFor = pid;
  } catch (e) { _role = null; }
  return _role;
}

/** All comments on the open project, grouped by field. One query. */
export async function loadThreads(force) {
  const pid = projectId();
  _threads = new Map();
  if (!pid || !isConfigured() || !signedIn()) { _loadedFor = null; return _threads; }
  if (_loadedFor === pid && !force) return _threads;
  const c = cloud();
  let rows = [];
  try { rows = await c.listComments(pid, CFG.scope, null); }
  catch (e) { _loadedFor = null; return _threads; }
  rows.forEach((r) => {
    const list = _threads.get(r.field_key) || [];
    list.push(r);
    _threads.set(r.field_key, list);
  });
  _loadedFor = pid;
  return _threads;
}

/** How many OPEN shared comments sit on a field. */
export function openCount(key) {
  const rows = _threads.get(key) || [];
  return rows.filter((r) => r.status === 'open').length;
}

/* Paint the count onto every field button that has one.

   The page owns the buttons (feature.js builds them in
   attachCommentButtons); this only adds a badge, so a page without
   them loses nothing. */
export function paintBadges() {
  document.querySelectorAll('.comment-btn[data-note-key]').forEach((btn) => {
    const key = btn.dataset.noteKey;
    const n = openCount(key);
    btn.classList.toggle('has-thread', n > 0);
    if (n > 0) btn.setAttribute('data-thread-count', String(n));
    else btn.removeAttribute('data-thread-count');
  });
}

/* ------------------------------------------------------------
   RENDER
   ------------------------------------------------------------ */
function when(iso) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const mins = Math.round((Date.now() - t) / 60000);
  if (mins < 1)    return 'just now';
  if (mins < 60)   return mins + ' min ago';
  const hrs = Math.round(mins / 60);
  if (hrs < 24)    return hrs + ' hr ago';
  return new Date(t).toLocaleDateString();
}

/* The honest status line. Every branch here is a real state the app
   can be in, and each says what still works rather than only what
   does not. */
function cloudStateHTML() {
  if (!isConfigured()) {
    return '<p class="cmt-state">Shared comments live in a Supabase account. This browser '
      + 'is not connected to one, so nothing here leaves the device.'
      + '<button type="button" class="cmt-btn" data-cmt-action="connect">CONNECT AN ACCOUNT</button></p>';
  }
  if (!signedIn()) {
    return '<p class="cmt-state">Sign in to read and post shared comments. Your private note '
      + 'above is saved either way.'
      + '<button type="button" class="cmt-btn" data-cmt-action="signin">SIGN IN</button></p>';
  }
  if (!projectId()) {
    return '<p class="cmt-state">Open a project before commenting — a thread belongs to a film.</p>';
  }
  if (!online()) {
    return '<p class="cmt-state cmt-warn">Offline. Shared comments will load when you are back on '
      + 'a connection; your private note is already saved here.</p>';
  }
  return '';
}

function suggestionHTML(r, resolvable) {
  const from = r.suggest_from == null ? '' : String(r.suggest_from);
  const to   = r.suggest_to   == null ? '' : String(r.suggest_to);
  let html =
    '<div class="cmt-sugg">' +
      '<div class="cmt-sugg-side cmt-sugg-from">' +
        '<span class="cmt-sugg-lab">WAS</span>' +
        '<span class="cmt-sugg-txt">' + (from ? esc(from) : '<em>empty</em>') + '</span>' +
      '</div>' +
      '<div class="cmt-sugg-side cmt-sugg-to">' +
        '<span class="cmt-sugg-lab">PROPOSED</span>' +
        '<span class="cmt-sugg-txt">' + (to ? esc(to) : '<em>empty</em>') + '</span>' +
      '</div>' +
    '</div>';
  if (r.status === 'open' && resolvable) {
    html += '<div class="cmt-acts">' +
      '<button type="button" class="cmt-btn cmt-accept" data-cmt-action="accept" data-id="' + esc(r.id) + '">ACCEPT · REPLACE THE FIELD</button>' +
      '<button type="button" class="cmt-btn" data-cmt-action="reject" data-id="' + esc(r.id) + '">DECLINE</button>' +
    '</div>';
  } else if (r.status === 'open') {
    html += '<p class="cmt-hint">Only someone with edit access can accept this.</p>';
  }
  return html;
}

function commentHTML(r, replies, resolvable, mine) {
  const badge = r.status === 'open' ? '' :
    '<span class="cmt-status cmt-status-' + esc(r.status) + '">' + esc(r.status.toUpperCase()) + '</span>';
  const kind = r.type === 'comment' ? '' :
    '<span class="cmt-kind cmt-kind-' + esc(r.type) + '">' + esc(r.type.toUpperCase()) + '</span>';
  let html =
    '<article class="cmt-item' + (r.status !== 'open' ? ' is-closed' : '') + '">' +
      '<header class="cmt-head">' +
        '<span class="cmt-who">' + esc(r.author_name || 'Someone') + '</span>' +
        kind + badge +
        '<span class="cmt-when">' + esc(when(r.created_at)) + '</span>' +
      '</header>' +
      '<p class="cmt-body">' + esc(r.body || '') + '</p>' +
      (r.type === 'suggestion' ? suggestionHTML(r, resolvable) : '');
  if (r.type !== 'suggestion' && r.status === 'open' && resolvable) {
    html += '<div class="cmt-acts">' +
      '<button type="button" class="cmt-btn" data-cmt-action="resolve" data-id="' + esc(r.id) + '">MARK RESOLVED</button>' +
    '</div>';
  }
  if (replies.length) {
    html += '<div class="cmt-replies">' + replies.map((x) =>
      '<div class="cmt-reply">' +
        '<span class="cmt-who">' + esc(x.author_name || 'Someone') + '</span>' +
        '<span class="cmt-when">' + esc(when(x.created_at)) + '</span>' +
        '<p class="cmt-body">' + esc(x.body || '') + '</p>' +
      '</div>').join('') + '</div>';
  }
  html += '<div class="cmt-foot">';
  if (canPost()) {
    html += '<button type="button" class="cmt-link" data-cmt-action="reply" data-id="' + esc(r.id) + '">REPLY</button>';
  }
  if (mine || resolvable) {
    html += '<button type="button" class="cmt-link cmt-link-danger" data-cmt-action="delete" data-id="' + esc(r.id) +
            '">DELETE</button>';
  }
  html += '</div>';
  if (canPost()) {
    html +=
      '<form class="cmt-reply-form" data-cmt-reply="' + esc(r.id) + '" hidden>' +
        '<label class="cmt-lab" for="cmtReply-' + esc(r.id) + '">YOUR REPLY</label>' +
        '<textarea id="cmtReply-' + esc(r.id) + '" class="cmt-input" name="body" rows="2"></textarea>' +
        '<button type="submit" class="cmt-btn">POST REPLY</button>' +
      '</form>';
  }
  html += '</article>';
  return html;
}

/* A message that has to survive the re-render that follows the action
   that produced it.

   The accept path is the reason this exists. It applies the value,
   marks the row, then re-renders the thread — so an error written
   straight into the DOM was being wiped by the refresh one tick
   later, and the one failure the user most needs to read (the text
   landed, the bookkeeping did not) was the one that never appeared.
   Keyed by field so it is re-emitted by threadHTML on every render
   until something clears it. */
const _notice = new Map();
function setNotice(key, msg) { if (key) _notice.set(key, msg); }
function clearNotice(key) { _notice.delete(key); }

function threadHTML(key) {
  const state = cloudStateHTML();
  if (state) return state;
  const notice = _notice.get(key)
    ? '<p class="cmt-err cmt-notice">' + esc(_notice.get(key)) + '</p>'
    : '';
  return notice + threadBodyHTML(key);
}

function threadBodyHTML(key) {
  const rows = _threads.get(key) || [];
  const roots = rows.filter((r) => !r.parent_id);
  const byParent = new Map();
  rows.filter((r) => r.parent_id).forEach((r) => {
    const l = byParent.get(r.parent_id) || []; l.push(r); byParent.set(r.parent_id, l);
  });
  const me = (() => { const c = cloud(); const u = c && c.getUser && c.getUser(); return u && u.id; })();
  const resolvable = canResolve();

  let html = '';
  if (!roots.length) {
    html += '<p class="cmt-state">No shared comments on this field yet.</p>';
  } else {
    html += '<div class="cmt-list">' + roots.map((r) =>
      commentHTML(r, byParent.get(r.id) || [], resolvable, me && r.author_id === me)
    ).join('') + '</div>';
  }

  if (!canPost()) {
    html += '<p class="cmt-hint">You have read-only access to this project.</p>';
    return html;
  }

  const current = fieldValue(key);
  html +=
    '<form class="cmt-new" data-cmt-form="' + esc(key) + '">' +
      '<label class="cmt-lab" for="cmtBody-' + esc(key) + '">ADD TO THE THREAD</label>' +
      '<textarea id="cmtBody-' + esc(key) + '" class="cmt-input" name="body" rows="2" ' +
        'placeholder="What needs saying about this field?"></textarea>' +
      '<div class="cmt-new-row">' +
        '<label class="cmt-check"><input type="checkbox" name="issuggest" data-cmt-action="togglesuggest"> ' +
          'Propose a replacement</label>' +
        '<button type="submit" class="cmt-btn cmt-post">POST</button>' +
      '</div>' +
      '<div class="cmt-sugg-new" hidden>' +
        '<label class="cmt-lab" for="cmtTo-' + esc(key) + '">PROPOSED TEXT</label>' +
        '<textarea id="cmtTo-' + esc(key) + '" class="cmt-input" name="suggestto" rows="3">' + esc(current) + '</textarea>' +
        '<p class="cmt-hint">Accepting this writes it into the field and saves it the ordinary way.</p>' +
      '</div>' +
      '<p class="cmt-err" hidden></p>' +
    '</form>';
  return html;
}

function panelHTML(key) {
  return '' +
    '<section class="cmt-sec cmt-sec-note">' +
      '<div class="lab">PRIVATE NOTE · saved on this device only</div>' +
      '<textarea class="cmt-note" data-cmt-note="' + esc(key) + '" ' +
        'placeholder="Type a note. It stays on this browser, attached to this field."></textarea>' +
    '</section>' +
    '<section class="cmt-sec cmt-sec-thread" data-cmt-thread="' + esc(key) + '">' +
      '<div class="lab">SHARED THREAD · everyone on this project</div>' +
      '<div class="cmt-thread-body"><p class="cmt-state">Loading…</p></div>' +
    '</section>';
}

/* ------------------------------------------------------------
   OPEN / CLOSE
   ------------------------------------------------------------ */
export function togglePanel(key, host) {
  if (!key || !host) return;
  clearNotice(key);
  let panel = host.querySelector('.comment-panel[data-note-key="' + CSS.escape(key) + '"]');
  if (panel) {
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      const ta = panel.querySelector('.cmt-note');
      if (ta) ta.focus();
      refreshThread(key);
    }
    return;
  }
  panel = document.createElement('div');
  panel.className = 'comment-panel cmt-panel open';
  panel.dataset.noteKey = key;
  panel.innerHTML = panelHTML(key);
  const ta = panel.querySelector('.cmt-note');
  ta.value = readNote(key);
  host.appendChild(panel);
  ta.focus();
  refreshThread(key);
}

/** Re-render just the shared half of an open panel. */
async function refreshThread(key) {
  const sec = document.querySelector('.cmt-sec-thread[data-cmt-thread="' + CSS.escape(key) + '"]');
  if (!sec) return;
  const body = sec.querySelector('.cmt-thread-body');
  const pid = projectId();
  if (isConfigured() && signedIn() && pid && online()) {
    await ensureRole(pid);
    await loadThreads(true);
    paintBadges();
  }
  body.innerHTML = threadHTML(key);
}

/** Every open panel, after a realtime event or a post. */
async function refreshAllOpen() {
  const open = [...document.querySelectorAll('.cmt-panel.open')].map((p) => p.dataset.noteKey);
  if (!open.length) { await loadThreads(true); paintBadges(); return; }
  await loadThreads(true);
  paintBadges();
  open.forEach((k) => {
    const sec = document.querySelector('.cmt-sec-thread[data-cmt-thread="' + CSS.escape(k) + '"]');
    if (sec) sec.querySelector('.cmt-thread-body').innerHTML = threadHTML(k);
  });
}

/* ------------------------------------------------------------
   ACTIONS
   ------------------------------------------------------------ */
function rowById(id) {
  for (const rows of _threads.values()) {
    const hit = rows.find((r) => r.id === id);
    if (hit) return hit;
  }
  return null;
}

function showErr(el, msg) {
  const form = el.closest('.cmt-sec-thread');
  const p = form && form.querySelector('.cmt-err');
  if (p) { p.textContent = msg; p.hidden = false; return; }
  if (window.StudioUI && StudioUI.toastError) StudioUI.toastError(msg);
  else console.warn('[comments]', msg);
}
function ok(msg) {
  if (window.StudioUI && StudioUI.toastSuccess) StudioUI.toastSuccess(msg, { duration: 2200 });
}

/* Accept: write the value first, mark the row second.

   The order is the whole point. If applyValue() throws — the field is
   on another page, or it is a checklist item — nothing is marked, and
   the suggestion stays open saying so. A row that reads 'accepted'
   always means the text actually landed. */
async function accept(id, el) {
  const row = rowById(id);
  if (!row) return;
  const c = cloud();
  clearNotice(row.field_key);
  try {
    applyValue(row.field_key, row.suggest_to);
  } catch (e) {
    showErr(el, e.message || String(e));
    return;
  }
  try {
    await c.updateCommentStatus(id, 'accepted');
    ok('Suggestion applied and saved.');
  } catch (e) {
    // The text is in the field and the page has already saved it. Only
    // the bookkeeping failed, and saying so is better than rolling a
    // good edit back out from under the writer. It goes in the notice
    // map, not the DOM, because refreshAllOpen() below would wipe it.
    setNotice(row.field_key,
      'Applied to the field and saved here, but could not mark it accepted: ' + (e.message || e));
  }
  await refreshAllOpen();
}

async function setStatus(id, status, el) {
  const c = cloud();
  try { await c.updateCommentStatus(id, status); }
  catch (e) { showErr(el, e.message || String(e)); return; }
  await refreshAllOpen();
}

async function remove(id, el) {
  const c = cloud();
  if (!window.confirm('Delete this comment for everyone on the project?')) return;
  try { await c.deleteComment(id); }
  catch (e) { showErr(el, e.message || String(e)); return; }
  await refreshAllOpen();
}

async function postReply(parentId, body, el) {
  const c = cloud();
  const row = rowById(parentId);
  if (!row) return;
  try {
    await c.createComment({
      projectId: projectId(), scope: CFG.scope, fieldKey: row.field_key,
      body, type: 'comment', parentId
    });
  } catch (e) { showErr(el, e.message || String(e)); return; }
  await refreshAllOpen();
}

async function submitNew(form) {
  const key   = form.getAttribute('data-cmt-form');
  const body  = form.querySelector('[name="body"]').value.trim();
  const isSug = form.querySelector('[name="issuggest"]').checked;
  const to    = form.querySelector('[name="suggestto"]').value;
  const err   = form.querySelector('.cmt-err');
  err.hidden = true;
  if (!body) { err.textContent = 'Write something first.'; err.hidden = false; return; }
  const c = cloud();
  try {
    await c.createComment({
      projectId: projectId(),
      scope: CFG.scope,
      fieldKey: key,
      body,
      type: isSug ? 'suggestion' : 'comment',
      suggestFrom: isSug ? fieldValue(key) : null,
      suggestTo:   isSug ? to : null
    });
  } catch (e) {
    err.textContent = e.message || String(e);
    err.hidden = false;
    return;
  }
  await refreshAllOpen();
}

/* ------------------------------------------------------------
   WIRING — one delegated listener set, installed once
   ------------------------------------------------------------ */
function wire() {
  if (_wired) return;
  _wired = true;

  delegate(document, 'click', '[data-cmt-action]', (e, el) => {
    const act = el.getAttribute('data-cmt-action');
    const id  = el.getAttribute('data-id');
    if (act === 'togglesuggest') return;  // change handler owns it
    e.preventDefault();
    if (act === 'connect' || act === 'signin') {
      if (window.StudioUI && StudioUI.openCloudAuthModal) StudioUI.openCloudAuthModal();
      return;
    }
    if (act === 'accept')  return void accept(id, el);
    if (act === 'reject')  return void setStatus(id, 'rejected', el);
    if (act === 'resolve') return void setStatus(id, 'resolved', el);
    if (act === 'delete')  return void remove(id, el);
    if (act === 'reply') {
      const form = el.closest('.cmt-item').querySelector('.cmt-reply-form');
      if (!form) return;
      form.hidden = !form.hidden;
      if (!form.hidden) form.querySelector('textarea').focus();
    }
  });

  delegate(document, 'submit', '.cmt-reply-form', (e, form) => {
    e.preventDefault();
    const body = form.querySelector('[name="body"]').value.trim();
    if (!body) return;
    postReply(form.getAttribute('data-cmt-reply'), body, form);
  });

  delegate(document, 'change', '[data-cmt-action="togglesuggest"]', (e, el) => {
    const form = el.closest('.cmt-new');
    if (!form) return;
    const box = form.querySelector('.cmt-sugg-new');
    box.hidden = !el.checked;
    if (el.checked) {
      // Re-read: the field may have moved on since the panel opened.
      form.querySelector('[name="suggestto"]').value = fieldValue(form.getAttribute('data-cmt-form'));
    }
  });

  delegate(document, 'submit', '.cmt-new', (e, form) => {
    e.preventDefault();
    submitNew(form);
  });

  // The private note. Local, immediate, no account needed.
  delegate(document, 'input', '[data-cmt-note]', (e, ta) => {
    writeNote(ta.getAttribute('data-cmt-note'), ta.value);
  });

  // Somebody else commented, or another device did.
  Store.subscribe('cloud:comment', () => { refreshAllOpen(); });
  // Switching project throws every cached thread away.
  Store.subscribe('current:changed', () => {
    _threads = new Map(); _loadedFor = null; _role = null; _roleFor = null;
    document.querySelectorAll('.cmt-panel').forEach((p) => p.remove());
    paintBadges();
  });
  const c = cloud();
  if (c && c.onAuth) {
    c.onAuth(() => { _role = null; _roleFor = null; _loadedFor = null; refreshAllOpen(); });
  }
}

/* ------------------------------------------------------------
   PUBLIC
   ------------------------------------------------------------ */
let _mounted = false;
export function mountComments(options) {
  CFG = Object.assign({}, CFG, options || {});
  wire();
  // One quiet pass so the badges are right on arrival. Deliberately
  // not awaited and deliberately silent: a page must render fully
  // before anyone has signed into anything. Once only — pages call
  // attachCommentButtons() again after a re-render and this must not
  // turn into a query per call.
  if (_mounted) return;
  _mounted = true;
  if (isConfigured() && signedIn() && online()) {
    const pid = projectId();
    if (pid) ensureRole(pid).then(() => loadThreads(true)).then(paintBadges).catch(() => {});
  }
}

export default { mountComments, togglePanel, paintBadges, hasNote, openCount, loadThreads };
