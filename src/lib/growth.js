/* ============================================================
   GROWTH — the browser's half of schema sections 21 onward
   ------------------------------------------------------------
   Referral codes and credits (§22) and affiliate reports (§23). Leads and
   funnel counts are §29. GST invoices, gift licences and film-school seats
   are PLANNED, not in the schema yet; each will take the next free
   section number when it is written. Kept beside billing.js rather than inside it so the two can
   move independently: billing.js is the purchase, this is everything
   around it.

   The same rule as billing.js: this can READ and it can ASK. Every
   number that is money — a reward, a commission, a tax line — is
   computed by the database and only shown here. Nothing here writes to
   localStorage.
   ============================================================ */
import { normalisePromo } from '../../supabase/functions/_shared/razorpay.js';

const cloud = () => window.StudioCloud || null;
async function client() {
  const c = cloud();
  if (!c || !c.ensureClient) throw new Error('Cloud is not available on this page.');
  const sb = await c.ensureClient();
  if (!sb) throw new Error('This build has no cloud project configured.');
  return sb;
}
async function rpc(name, args) {
  const sb = await client();
  const { data, error } = await sb.rpc(name, args);
  if (error) throw error;
  return data;
}
/** "The function does not exist" — the section has not run yet. */
export const isMissing = (err) => /PGRST202|does not exist|Could not find/i.test(String((err && (err.code + ' ' + err.message)) || ''));

/* ---- §22 referrals --------------------------------------------- */
/** { eligible, code, percent_off, uses, reward_pct, reward_paise,
 *  owed_paise, paid_paise, credits:[{amount_paise,status,created_at,paid_at}] } */
export const myReferral = () => rpc('my_referral');

export const admin = {
  settings: () => rpc('admin_get_billing_settings'),
  setSettings: (patch) => rpc('admin_set_billing_settings', { p_patch: patch }),
  listReferralCredits: (status = null) => rpc('admin_list_referral_credits', { p_status: status }).then((d) => d || []),
  markReferralPaid: (ids, note) => rpc('admin_mark_referral_paid', { p_ids: ids, p_note: note || null }),
  /* §23: derived per affiliate code — orders, revenue net of discount, commission due */
  affiliateReport: () => rpc('admin_affiliate_report').then((d) => d || []),
  /* §29: the start page's launch-offer sign-ups and the daily funnel counts */
  leads: () => rpc('admin_list_leads').then((d) => d || []),
  funnel: (from = null, to = null) => rpc('admin_funnel', { p_from: from, p_to: to }).then((d) => d || []),
  affiliateOrders: (code) => rpc('admin_affiliate_orders', { p_code: normalisePromo(code) }).then((d) => d || [])
};

export { normalisePromo };
export default { myReferral, admin, isMissing };
