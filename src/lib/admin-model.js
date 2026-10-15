/* ============================================================
   ADMIN MODEL — the console's tabs, and what the Overview derives
   ------------------------------------------------------------
   The pure half of src/pages/admin.js: the tab registry's data, the
   Razorpay mode, the sub-nav counts, the ranked "Needs attention" list
   (as plain items — the page draws them), the health tiles' values and
   the people table's words. No DOM, no storage, no network.
   ============================================================ */
import { duration, n, num0, plural, fmtTime } from './admin-format.js';

/* THE TABS, in the order they appear. `group` is the sub-nav heading
   (src/ui/tabs.js draws it from data-tab-group); the ids of the first five
   are the old ones and every old fragment still resolves inside them. */
export const TAB_DEFS = [
  { id: 'overview',  label: 'Overview',          group: 'Run',     icon: 'dashboard',      hint: 'The numbers, and what needs you today.' },
  { id: 'health',    label: 'Launch & health',   group: 'Run',     icon: 'monitor_heart',  hint: 'Is everything switched on and working?' },
  { id: 'audit',     label: 'Audit log',         group: 'Run',     icon: 'history',        hint: 'Who changed what, and when.' },
  { id: 'people',    label: 'People',            group: 'People',  icon: 'groups',         hint: 'Members, access and organisations.' },
  { id: 'support',   label: 'Support',           group: 'People',  icon: 'support_agent',  hint: 'Look up an account and help with it.' },
  { id: 'requests',  label: 'Access & sharing',  group: 'People',  icon: 'share',          hint: 'Invite requests, codes and shared films.' },
  { id: 'purchases', label: 'Purchases',         group: 'Money',   icon: 'shopping_cart',  hint: 'Payments, invoices, refunds and promo codes.' },
  { id: 'growth',    label: 'Growth',            group: 'Money',   icon: 'trending_up',    hint: 'Visits, sign-ups and the funnel.' },
  { id: 'usage',     label: 'Usage',             group: 'Product', icon: 'bar_chart',      hint: 'What people use, and how much.' },
  { id: 'sync',      label: 'Sync & storage',    group: 'Product', icon: 'storage',        hint: 'Cloud sync, queues and stored work.' },
  { id: 'controls',  label: 'Controls',          group: 'Product', icon: 'toggle_on',      hint: 'Switches, plans and features.' }
];
export const TABS = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t.label]));
export const GROUP = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t.group]));
export const META = Object.fromEntries(TAB_DEFS.map((t) => [t.id, t]));
/** A block's own heading, where the module's first sub-heading does not already name it. */
export const BLOCK_TITLE = { features: 'Plan features', invoices: 'Invoices' };

/** The overview's empty state: nobody's numbers outlive their session. */
export const blankOverview = () => ({ phase: 'idle', data: null, accounts: [], users: [], error: '', loadedAt: 0 });

/** Razorpay mode, read from the PREFIX of the public key id — never the key. */
export function razorpayEnv(keyId) {
  if (/^rzp_test_/.test(keyId)) return 'TEST';
  if (/^rzp_live_/.test(keyId)) return 'LIVE';
  return null;
}

/** Waiting items that already have a count, per tab, for the sub-nav badges. */
export function pendingCounts(ovData, billing) {
  return {
    requests: ovData ? Number(ovData.requests_pending) || 0 : 0,
    purchases: billing ? Number(billing.refundRequestsPending) || 0 : 0
  };
}

/** The ranked list: health failures, failed receipts, refund requests over 48 hours,
 *  invite requests, other refund requests, abandoned payments. Anything the health
 *  report could not read is said, never counted as zero. Items are
 *  { label, tone, text, tab } (tone defaults to 'warn'); `pendingPurchases`
 *  is the billing block's count, used when the report has no refund slot. */
export function attentionItems(d, hs, pendingPurchases) {
  const out = [];
  const item = (o) => out.push({ tone: 'warn', ...o });
  const hd = hs.phase === 'ok' ? hs.data : null;
  const bad = (v) => !v || v.error;
  const COVERED = new Set(['receipts', 'payments_created', 'refunds', 'invite_requests']);
  if (hs.phase === 'error') item({ label: 'Health', tone: 'danger', text: 'The health report could not load: ' + hs.error, tab: 'health' });
  if (hd) {
    for (const c of hd.checks || []) {
      if (COVERED.has(c.id) || (c.level !== 'warn' && c.level !== 'unknown')) continue;
      item({ label: c.level === 'unknown' ? 'Unknown' : 'Health', tone: c.level === 'unknown' ? 'neutral' : 'danger', text: c.observed || c.id, tab: 'health' });
    }
    for (const c of hd.checks || []) if (c.level === 'unknown' && COVERED.has(c.id)) item({ label: 'Unknown', tone: 'neutral', text: c.observed, tab: 'health' });
    const r = hd.receipts;
    if (!bad(r) && Number(r.awaiting_recent) > 0) item({ label: r.awaiting_recent, text: `${Number(r.awaiting_recent) === 1 ? 'receipt' : 'receipts'} from the last 7 days ${Number(r.awaiting_recent) === 1 ? 'has' : 'have'} no mail recorded`, tab: 'health' });
  }
  const rf = hd && !bad(hd.refunds) ? hd.refunds : null;
  const pendingRefunds = rf ? Number(rf.requests_pending) || 0 : (pendingPurchases || 0);
  const old = rf && Number(rf.oldest_pending_age_seconds) > 48 * 3600;
  if (old && pendingRefunds) item({ label: pendingRefunds, tone: 'danger', text: `${pendingRefunds === 1 ? 'refund request' : 'refund requests'} waiting, the oldest ${duration(rf.oldest_pending_age_seconds)}`, tab: 'purchases' });
  const inv = Number(d.requests_pending) || 0;
  if (inv) item({ label: inv, text: inv === 1 ? 'person is waiting for an invite' : 'people are waiting for an invite', tab: 'requests' });
  if (!old && pendingRefunds) item({ label: pendingRefunds, text: pendingRefunds === 1 ? 'refund request is waiting for an answer' : 'refund requests are waiting for an answer', tab: 'purchases' });
  const ab = hd && !bad(hd.payments) ? Number(hd.payments.created_older_than_1h) || 0 : 0;
  if (ab) item({ label: ab, tone: 'neutral', text: `${ab === 1 ? 'payment' : 'payments'} still open after an hour (abandoned or not yet settled)`, tab: 'purchases' });
  return out;
}

/** Accounts on a paid plan, from billing's active_by_plan. */
export const payingCount = (byPlan) => Object.entries(byPlan || {}).filter(([k]) => k !== 'free').reduce((t, [, v]) => t + (Number(v) || 0), 0);

/** A tile's value from the health report: { value, sub?, title?, attention? }.
    A slot that errored, or a report that has not landed, is "—" / "…" and
    says so: never a zero that reads as healthy. */
export function healthTile(hs, slot, pick, { sub, hot = (v) => v > 0 } = {}) {
  if (hs.phase === 'error') return { value: '—', sub: 'unknown' };
  if (hs.phase !== 'ok') return { value: '…' };
  const v = hs.data[slot];
  if (!v || v.error) return { value: '—', sub: 'unknown', title: v && v.message ? v.message : null };
  const x = Number(pick(v)) || 0;
  return { value: n(x), sub, attention: hot(x) };
}

/** Refund backlog: pending, approved not refunded, failed. */
export const refundBacklog = (v) => num0(v.requests_pending) + num0(v.requests_approved_not_refunded) + num0(v.refunds_failed);

/** The Overview's closing meta line. */
export function overviewMeta(d) {
  return [
    plural(d.users_total, 'signed in', 'signed in'), `${n(d.users_active_7d)} active this week`,
    plural(d.accounts, 'organisation', 'organisations'), plural(d.projects, 'film', 'films'),
    `${n(d.sessions_live)} online`, `${plural(d.codes_active, 'code', 'codes')} open`, 'counted ' + fmtTime(d.generated_at)
  ].join(' · ');
}

/** An organisation's seats cell. */
export const orgSeats = (a) => `${n(a.seats_used)} of ${n(a.seat_limit)}` + (a.members_pending ? ` · ${n(a.members_pending)} invited` : '');

/** A person's standing: { text, mod } where mod is the tag's modifier ('' for none). */
export function userStanding(u) {
  if (u.disabled_at) return { text: 'disabled', mod: 'is-off' };
  if (u.studio_role === 'admin') return { text: 'admin', mod: 'is-admin' };
  if (u.studio_role) return { text: 'member', mod: '' };
  if (u.request_status === 'pending') return { text: 'waiting', mod: 'is-pending' };
  if (u.request_status === 'declined') return { text: 'declined', mod: 'is-off' };
  return { text: 'not a member', mod: '' };
}

/** Online now: a heartbeat in the last 90 seconds. */
export const isLive = (u, now = Date.now()) => !!(u.last_heartbeat && now - Date.parse(u.last_heartbeat) < 90000);

export default { TAB_DEFS, TABS, GROUP, META, BLOCK_TITLE, blankOverview, razorpayEnv, pendingCounts, attentionItems, payingCount, healthTile, refundBacklog, overviewMeta, orgSeats, userStanding, isLive };
