/* The product's identity, read from src/data/brand.json — the ONE place
   the name lives. HTML pages get the same values stamped at build time by
   the `fms-brand` plugin in vite.config.js ({{brand:name}} etc.). */
import brand from '../data/brand.json';

export const BRAND = Object.freeze({ ...brand });
export const BRAND_HOST = BRAND.host;
export const BRAND_PATH = BRAND.path;
export const SUPPORT_EMAIL = BRAND.supportEmail;

/** "FS" — the first and last capitals of the product name, never typed,
 *  so a rename re-letters the rail's tile and the invoice's mark. */
export function monogram() {
  const caps = String(BRAND.name || '').match(/\p{Lu}/gu) || [];
  if (!caps.length) return String(BRAND.name || 'S').slice(0, 1).toUpperCase();
  return caps.length === 1 ? caps[0] : caps[0] + caps[caps.length - 1];
}
