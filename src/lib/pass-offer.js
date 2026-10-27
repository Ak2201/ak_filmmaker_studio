/* ============================================================
   THE LAUNCH PASS — what the offer is right now (27 Oct 2026)
   ------------------------------------------------------------
   The free trial is retired for the public (owner, 27 Oct 2026). In its
   place: a paid week of the whole studio, sold as a LAUNCH OFFER with a
   real end. The server owns every figure — price, length, deadline,
   cap — in billing_settings (schema §61), the owner edits them in the
   console, and trial_offer() / price_notice() hand them to the page as

     pass: { open, amount_paise, days, plan, ends_at, cap, left, now }

   THE SCARCITY HAS TO BE TRUE. The countdown runs to the server's
   deadline from the server's clock (`now`), so every visitor sees the
   same end and a visitor's clock cannot move it; it never restarts per
   visit; at zero the page says the offer has ended because the server
   now refuses it (quote_pass 'closed'); "N left" is the real count of
   paid passes under the real cap. A missing or malformed field means NO
   offer, never a guessed one: this fails CLOSED, like aiUnlocked(),
   because the cost of showing an offer that does not exist is a
   stranger who pays nothing and is refused at checkout.

   PURE AND IMPORT-FREE: it sits in vite.config.js's `startlib` chunk
   (the landing pages and CORE both use it). Do not import anything here.
   ============================================================ */

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const time = (v) => { const t = typeof v === 'string' || typeof v === 'number' ? Date.parse(v) : NaN; return Number.isFinite(t) ? t : null; };

/** Normalise the server's `pass` block, or null when there is no usable offer. */
export function readPass(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const amount = num(raw.amount_paise), days = num(raw.days);
  if (!(amount > 0) || !(days > 0)) return null;
  const cap = num(raw.cap), left = num(raw.left);
  return {
    open: raw.open === true,
    amountPaise: Math.round(amount),
    days: Math.round(days),
    plan: typeof raw.plan === 'string' && raw.plan ? raw.plan : 'pro',
    endsAt: time(raw.ends_at),
    cap: cap != null && cap > 0 ? Math.round(cap) : null,
    left: left != null && left >= 0 ? Math.round(left) : null,
    serverNow: time(raw.now)
  };
}

/** The offer at local time `nowMs`, read at local time `readAtMs` (when the
 *  server's `now` arrived). Returns
 *    { state: 'none' }                        nothing to offer, show nothing
 *    { state: 'closed', pass }                the launch offer has ended
 *    { state: 'open', pass, msLeft|null, left|null }
 *  msLeft is null when there is no deadline (no timer is drawn). The
 *  deadline is measured on the SERVER's clock: the elapsed local time since
 *  the reading is added to the server's `now`, so a visitor whose clock is
 *  days off still sees the true countdown. */
export function passState(raw, nowMs = Date.now(), readAtMs = nowMs) {
  const pass = readPass(raw);
  if (!pass) return { state: 'none' };
  if (!pass.open) return { state: 'closed', pass };
  if (pass.cap != null && pass.left != null && pass.left <= 0) return { state: 'closed', pass };
  let msLeft = null;
  if (pass.endsAt != null) {
    const serverNow = pass.serverNow != null ? pass.serverNow + Math.max(0, nowMs - readAtMs) : nowMs;
    msLeft = pass.endsAt - serverNow;
    if (msLeft <= 0) return { state: 'closed', pass };
  }
  return { state: 'open', pass, msLeft, left: pass.cap != null ? pass.left : null };
}

const two = (n) => String(n).padStart(2, '0');

/** "3d 04:12:09", "04:12:09" under a day; '' for null. */
export function countdownText(msLeft) {
  if (msLeft == null || !(msLeft > 0)) return '';
  const s = Math.floor(msLeft / 1000);
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return (d ? d + 'd ' : '') + two(h) + ':' + two(m) + ':' + two(sec);
}

/** The price in rupees for display, "₹49" (whole rupees; paise shown only if any). */
export function passPrice(pass) {
  if (!pass || !(pass.amountPaise > 0)) return '';
  const r = pass.amountPaise / 100;
  return '₹' + (Number.isInteger(r) ? String(r) : r.toFixed(2));
}

/** "7 days" / "1 day". */
export function passLength(pass) {
  if (!pass || !(pass.days > 0)) return '';
  return pass.days + (pass.days === 1 ? ' day' : ' days');
}

/** "312 of 500 left", or '' with no cap. */
export function leftText(st) {
  if (!st || st.state !== 'open' || st.left == null || !st.pass || st.pass.cap == null) return '';
  return st.left + ' of ' + st.pass.cap + ' left';
}

export default { readPass, passState, countdownText, passPrice, passLength, leftText };
