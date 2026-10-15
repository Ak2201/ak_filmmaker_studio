/* ============================================================
   ADMIN SUPPORT MODEL — the support queue's filters and words
   ------------------------------------------------------------
   The pure half of the Support tab (src/pages/admin-tabs/support.js):
   which rows a filter shows, what each status and source is called,
   and who a row is about. The queue itself is admin_list_support()'s.
   ============================================================ */

export const SOURCE = {
  ticket: { label: 'Ticket', tone: 'neutral' },
  refund: { label: 'Refund', tone: 'warn' },
  invite: { label: 'Invite', tone: 'accent' }
};
export const STATUS_TONE = { open: 'warn', waiting: 'accent', closed: 'ok' };
export const STATUSES = ['open', 'waiting', 'closed'];
/** "open" -> "Open". */
export const cap = (s) => String(s || '').replace(/^./, (c) => c.toUpperCase());

/** Whether a row shows under these filters ({status, source, who});
    `me` is the signed-in user's id, for "Me". */
export function inView(r, f, me) {
  if (f.status === 'active' && r.status === 'closed') return false;
  if (f.status !== 'active' && f.status !== 'all' && r.status !== f.status) return false;
  if (f.source !== 'all' && r.source !== f.source) return false;
  if (f.who === 'mine' && r.assignee !== me) return false;
  if (f.who === 'none' && r.assignee) return false;
  return true;
}

/** The id of the person a row is about, when the console already knows them. */
export function personOf(row, users) {
  if (row.source === 'invite') return row.id;
  const hit = (users || []).find((u) => String(u.email || '').toLowerCase() === String(row.email || '').toLowerCase());
  return hit ? hit.user_id : '';
}

/** The counts the filter chips carry. */
export function chipCounts(rows) {
  const c = (f) => rows.filter(f).length;
  return {
    active: c((r) => r.status !== 'closed'), open: c((r) => r.status === 'open'),
    waiting: c((r) => r.status === 'waiting'), closed: c((r) => r.status === 'closed'), all: rows.length,
    ticket: c((r) => r.source === 'ticket'), refund: c((r) => r.source === 'refund'), invite: c((r) => r.source === 'invite')
  };
}

/** The sub-nav count: open rows, or null for none. */
export const openCount = (rows) => rows.filter((r) => r.status === 'open').length || null;

/** admin_update_ticket()'s arguments: every field present, the patch on top. */
export const ticketPatch = (id, patch) => ({ p_id: id, p_status: null, p_assignee: null, p_note: null, p_unassign: false, ...patch });

export default { SOURCE, STATUS_TONE, STATUSES, cap, inView, personOf, chipCounts, openCount, ticketPatch };
