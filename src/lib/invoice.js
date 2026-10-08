/* ============================================================
   INVOICES — the pure half: GSTIN checksum, financial year, number
   ------------------------------------------------------------
   Mirrors supabase-schema.sql §28 (gstin_valid, invoice_fy,
   invoice_number). The database is the authority; this exists so the
   form can say "that does not look right" before a round trip, and so
   the same rules are asserted in Node (scripts/test-invoice.mjs).
   ============================================================ */
const CS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const SHAPE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;

export const normaliseGstin = (s) => String(s || '').trim().toUpperCase();

/** Format, state code (01-38, 97, 99) and the mod-36 check character. */
export function gstinValid(s) {
  const g = normaliseGstin(s);
  if (!SHAPE.test(g)) return false;
  const st = Number(g.slice(0, 2));
  if (!((st >= 1 && st <= 38) || st === 97 || st === 99)) return false;
  let total = 0;
  for (let i = 0; i < 14; i++) {
    const p = CS.indexOf(g[i]) * (i % 2 === 0 ? 1 : 2);
    total += Math.floor(p / 36) + (p % 36);
  }
  return CS[(36 - (total % 36)) % 36] === g[14];
}

/** Indian financial year of an instant, read in Asia/Kolkata: "2026-27". */
export function financialYear(at) {
  const d = new Date(typeof at === 'string' || typeof at === 'number' ? at : at.getTime());
  const ist = new Date(d.getTime() + 330 * 60000);
  const y = ist.getUTCMonth() >= 3 ? ist.getUTCFullYear() : ist.getUTCFullYear() - 1;
  return `${y}-${String((y + 1) % 100).padStart(2, '0')}`;
}

export const invoiceNumber = (fy, seq) => `FMS/${fy}/${String(seq).padStart(6, '0')}`;
