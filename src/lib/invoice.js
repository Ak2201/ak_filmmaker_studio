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

/* Amount in words, as Indian invoices print it: crore, lakh, thousand,
   hundred. 59900 paise -> "Rupees Five Hundred Ninety-Nine only";
   49950 -> "Rupees Four Hundred Ninety-Nine and Fifty Paise only". */
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve',
  'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];
const below100 = (n) => (n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : ''));
const below1000 = (n) => [n >= 100 ? ONES[Math.floor(n / 100)] + ' Hundred' : '', below100(n % 100)].filter(Boolean).join(' ');
function words(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 1e7); n %= 1e7;
  const lakh = Math.floor(n / 1e5); n %= 1e5;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (crore) parts.push(words(crore) + ' Crore');
  if (lakh) parts.push(below100(lakh) + ' Lakh');
  if (thousand) parts.push(below100(thousand) + ' Thousand');
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}
/* A dollar invoice (schema §56) counts the international way: million,
   thousand, hundred. 1950 cents -> "US Dollars Nineteen and Fifty Cents only". */
function intlWords(n) {
  if (n === 0) return 'Zero';
  const parts = [];
  const million = Math.floor(n / 1e6); n %= 1e6;
  const thousand = Math.floor(n / 1e3); n %= 1e3;
  if (million) parts.push(intlWords(million) + ' Million');
  if (thousand) parts.push(below1000(thousand) + ' Thousand');
  if (n) parts.push(below1000(n));
  return parts.join(' ');
}
/** `minor` is in minor units of `currency` (paise, or cents for 'USD'). */
export function amountInWords(paise, currency = 'INR') {
  const p = Math.max(0, Math.round(Number(paise) || 0));
  const r = Math.floor(p / 100), ps = p % 100;
  if (currency === 'USD') return `US Dollars ${intlWords(r)}${ps ? ' and ' + below100(ps) + ' Cents' : ''} only`;
  return `Rupees ${words(r)}${ps ? ' and ' + below100(ps) + ' Paise' : ''} only`;
}
