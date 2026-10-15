/* ============================================================
   ADMIN TAB — Support (support, #support)
   ------------------------------------------------------------
   A MANUAL QUEUE (plan §11, owner decision 4): there is no contact form,
   no anonymous submit and no outgoing mail. People write to the
   support@ mailbox; an administrator logs what matters here by hand.

   ONE QUEUE, ONE VOCABULARY. admin_list_support() merges three sources
   and says status as open / waiting / closed for all of them:
     ticket   stored as logged; an admin sets the status, assigns it, adds
              a note (admin_update_ticket)
     refund   a pending or approved refund request: open / waiting. It is
              DECIDED in Purchases (#refunds); the row links there.
     invite   a pending invite request: open. It is decided in the
              invite queue (#admin-console); the row links there.
   Closed tickets are the only closed rows, because decided requests are
   history and live in their own blocks.

   Importing admin-customer.js is what registers the people drawer
   (registerDrawer('user', …)); admin.js imports this module, so that
   import has run before the hash's drawer is first opened.

   Roles hide controls, the server decides (require_role, 42501): a
   finance admin may read the queue and sees no write controls, and any
   refusal the server sends is shown as the sentence it sent.

   State lives here. render(ctx) is synchronous; a load or a write
   finishes by calling ctx.rerender(), and the form's typed text is kept
   by the console's carryFields().
   ============================================================ */
import { h, delegate } from '../../lib/dom.js';
import { pill, emptyState, errorState, skeleton, dataTable, relTime, absTime } from '../../ui/admin-kit.js';
import { askText } from '../../ui/dialog.js';
import { errorSentence } from '../../lib/gate.js';
import { rpc, studioRole, can, currentRole, openUser } from '../../ui/admin-customer.js';
import { SOURCE, STATUS_TONE, STATUSES, cap, inView as rowInView, personOf as personIn, chipCounts, openCount, ticketPatch } from '../../lib/admin-support-model.js';

const S = { phase: 'idle', rows: [], error: '', status: 'active', source: 'all', who: 'all', busy: false };
let last = null;       // the latest ctx, for handlers that finish after a render
let roleAsked = false;

const toast = (msg, type, opts) => { if (window.StudioUI && window.StudioUI.toast) window.StudioUI.toast(msg, Object.assign(type ? { type } : {}, opts || {})); };
const redraw = () => { if (last && last.rerender) last.rerender(); };
const myId = () => { const c = window.StudioCloud; const s = c && c.getSession && c.getSession(); return (s && s.user && s.user.id) || ''; };

async function load() {
  S.phase = 'loading'; S.error = '';
  try {
    S.rows = (await rpc('admin_list_support', { p_status: null, p_limit: 500 })) || [];
    S.phase = 'ready';
  } catch (e) {
    S.error = errorSentence(e, 'The queue could not load.');
    S.phase = 'error';
  }
  redraw();
}

const inView = (r) => rowInView(r, S, myId());

/** The id of the person a row is about, when the console already knows them. */
const personOf = (row, ctx) => personIn(row, (ctx.overview && ctx.overview.users) || []);

function chip(group, value, label, count) {
  const on = S[group] === value;
  return h('button.ad-chip', { type: 'button', 'data-su-filter': group + ':' + value, 'aria-pressed': String(on) }, [label, count != null ? h('span.su-n', { text: ' ' + count }) : null]);
}
function filters() {
  const k = chipCounts(S.rows);
  const grp = (label, chips) => h('div.su-group', { role: 'group', 'aria-label': label }, [h('span.su-gl', { text: label }), ...chips]);
  return h('div.su-filters', {}, [
    grp('Status', [
      chip('status', 'active', 'Active', k.active), chip('status', 'open', 'Open', k.open),
      chip('status', 'waiting', 'Waiting', k.waiting), chip('status', 'closed', 'Closed', k.closed), chip('status', 'all', 'All', k.all)
    ]),
    grp('Source', [
      chip('source', 'all', 'All'), chip('source', 'ticket', 'Tickets', k.ticket),
      chip('source', 'refund', 'Refunds', k.refund), chip('source', 'invite', 'Invites', k.invite)
    ]),
    grp('Assigned', [chip('who', 'all', 'Anyone'), chip('who', 'mine', 'Me'), chip('who', 'none', 'Nobody')])
  ]);
}

function rowActions(r, ctx) {
  const writer = can('ticket');
  const pid = personOf(r, ctx);
  const kids = [];
  if (r.source === 'ticket' && writer) {
    kids.push(h('select.su-status', { 'data-su-act': 'status', 'data-id': r.id, 'aria-label': 'Status of ' + r.subject }, STATUSES.map((v) => h('option', { value: v, text: cap(v), selected: v === r.status ? '' : null }))));
    kids.push(r.assignee && r.assignee === myId()
      ? h('button.btn.cu-mini', { type: 'button', 'data-su-act': 'unassign', 'data-id': r.id, text: 'UNASSIGN' })
      : h('button.btn.cu-mini', { type: 'button', 'data-su-act': 'assign', 'data-id': r.id, 'aria-label': 'Assign ' + r.subject + ' to me', text: 'ASSIGN TO ME' }));
    kids.push(h('button.btn.cu-mini', { type: 'button', 'data-su-act': 'note', 'data-id': r.id, 'aria-label': 'Add a note to ' + r.subject, text: 'NOTE' }));
  }
  if (r.source === 'refund') kids.push(h('a.btn.cu-mini', { href: '#refunds', text: 'OPEN IN PURCHASES' }));
  if (r.source === 'invite') kids.push(h('a.btn.cu-mini', { href: '#admin-console', text: 'OPEN REQUEST' }));
  if (pid) kids.push(h('button.btn.cu-mini', { type: 'button', 'data-su-act': 'person', 'data-uid': pid, 'aria-label': 'Open ' + r.email, text: 'PERSON' }));
  return h('div.su-acts', {}, kids);
}

function queue(ctx) {
  const rows = S.rows.filter(inView);
  const empty = S.rows.length
    ? emptyState({ title: 'Nothing matches these filters', body: 'Widen Status or Source to see more.', icon: '◇' })
    : emptyState({ title: 'The queue is empty', body: 'No tickets are logged, no refund request is waiting and nobody is waiting for an invite.', stamp: true, icon: '✓' });
  return dataTable({
    caption: `${rows.length} of ${S.rows.length} in view`,
    rows,
    rowId: (r) => r.source + ':' + r.id,
    empty,
    toolbar: [h('button.ad-chip', { type: 'button', 'data-su-act': 'reload', title: 'Load the queue again', text: 'Reload' })],
    columns: [
      { key: 'source', label: 'Source', render: (r) => pill((SOURCE[r.source] || { label: cap(r.source) }).label, (SOURCE[r.source] || {}).tone || 'neutral') },
      { key: 'subject', label: 'Request', render: (r) => h('div.su-what', {}, [
        h('strong', { text: r.subject }),
        h('span.ad-sub', { text: r.email || '—' }),
        r.detail ? h('span.su-detail', { text: r.detail }) : null
      ]), title: (r) => r.detail || r.subject },
      { key: 'status', label: 'Status', render: (r) => pill(cap(r.status), STATUS_TONE[r.status] || 'neutral', { dot: true }) },
      { key: 'assignee', label: 'Assigned', render: (r) => (r.source === 'ticket' ? (r.assignee_email || 'Nobody') : '—') },
      { key: 'notes', label: 'Notes', align: 'end', render: (r) => (r.source === 'ticket' ? String(r.notes || 0) : '—') },
      { key: 'created_at', label: 'Logged', render: (r) => h('time.ad-when', { datetime: new Date(r.created_at).toISOString(), title: absTime(r.created_at), text: relTime(r.created_at) }) },
      { key: 'act', label: '', render: (r) => rowActions(r, ctx) }
    ]
  });
}

function logForm() {
  const r = currentRole();
  if (r === undefined) return null;
  if (!can('ticket')) {
    return h('div.ad-card', {}, [
      h('h3.ad-card-h', { text: 'Log a ticket' }),
      h('p.ad-meta', { text: 'Your role (' + (r || 'none') + ') can read this queue but not change it. Logging and updating tickets needs the support role.' })
    ]);
  }
  return h('form.ad-card.su-log', { 'data-su-form': 'log', autocomplete: 'off' }, [
    h('h3.ad-card-h', { text: 'Log a ticket' }),
    h('p.ad-meta', { text: 'For a message that arrived at the support@ mailbox. Nothing is sent to the person from here.' }),
    h('div.gr-fields', {}, [
      h('div', {}, [h('label', { for: 'suEmail', text: 'Their e-mail' }), h('input', { id: 'suEmail', name: 'email', type: 'email', required: true, maxlength: '254', placeholder: 'name@example.com' })]),
      h('div', {}, [h('label', { for: 'suSubject', text: 'Subject' }), h('input', { id: 'suSubject', name: 'subject', type: 'text', required: true, maxlength: '200' })])
    ]),
    h('div.gt-field', {}, [h('label', { for: 'suBody', text: 'What they said' }), h('textarea', { id: 'suBody', name: 'body', rows: '4', maxlength: '4000', placeholder: 'Paste or summarise the message (up to 4000 characters)' })]),
    h('div.ba-actions', {}, [h('button.btn.primary', { type: 'submit', disabled: S.busy ? '' : null, text: 'LOG TICKET' })])
  ]);
}

export function render(ctx) {
  last = ctx;
  if (!roleAsked) { roleAsked = true; studioRole().then(redraw); }
  if (S.phase === 'idle') load();

  const wrap = h('div.su');
  wrap.append(h('div.ad-bar', {}, [
    h('p.ad-meta', { text: 'A manual queue: refund requests, invite requests, and tickets an administrator logs by hand from the support mailbox.' })
  ]));
  if (S.phase === 'loading' || S.phase === 'idle') { wrap.append(skeleton({ kind: 'rows', count: 5 })); return wrap; }
  if (S.phase === 'error') {
    wrap.append(errorState({ title: 'The queue could not load', why: S.error, onRetry: () => { S.phase = 'idle'; redraw(); } }));
    return wrap;
  }
  wrap.append(filters(), queue(ctx), logForm());
  return wrap;
}

export function badge() {
  if (S.phase !== 'ready') return null;
  return openCount(S.rows);
}

/* ---- handlers ------------------------------------------------------ */

const wrote = (msg) => toast(msg, 'success', { action: 'View in audit log', onAction: () => { location.hash = '#audit'; } });
async function update(id, patch, said) {
  try {
    await rpc('admin_update_ticket', ticketPatch(id, patch));
    wrote(said);
    await load();
  } catch (e) { toast(errorSentence(e, 'The ticket was not changed.'), 'error'); redraw(); }
}
const find = (id) => S.rows.find((r) => r.source === 'ticket' && r.id === id);

delegate(document, 'click', '[data-su-filter]', (e, el) => {
  const [g, v] = el.dataset.suFilter.split(':');
  if (g in S) { S[g] = v; redraw(); }
});
delegate(document, 'click', '[data-su-act]', async (e, el) => {
  if (el.tagName === 'SELECT') return;
  const act = el.dataset.suAct;
  const id = el.dataset.id;
  if (act === 'reload') { S.phase = 'idle'; redraw(); }
  else if (act === 'person') openUser(el.dataset.uid);
  else if (act === 'assign') update(id, { p_assignee: myId() }, 'Assigned to you.');
  else if (act === 'unassign') update(id, { p_unassign: true }, 'Unassigned.');
  else if (act === 'note') {
    const t = find(id);
    const text = await askText({ title: 'Add a note to “' + ((t && t.subject) || 'this ticket') + '”?', body: 'Kept with the ticket for administrators; the audit log records that a note was added. It is not sent to anyone.', confirm: 'Add note', placeholder: 'Up to 2000 characters' });
    if (text) update(id, { p_note: text }, 'Note added.');
  }
});
delegate(document, 'change', 'select[data-su-act="status"]', (e, el) => {
  update(el.dataset.id, { p_status: el.value }, 'Marked ' + el.value + '.');
});
delegate(document, 'submit', '[data-su-form="log"]', async (e, form) => {
  e.preventDefault();
  if (S.busy) return;
  const f = new FormData(form);
  S.busy = true;
  try {
    await rpc('admin_log_ticket', { p_email: String(f.get('email') || '').trim(), p_subject: String(f.get('subject') || '').trim(), p_body: String(f.get('body') || '') });
    wrote('Ticket logged.');
    S.busy = false;
    await load();
  } catch (err) { S.busy = false; toast(errorSentence(err, 'The ticket was not logged.'), 'error'); redraw(); }
});

export default { render, badge };
