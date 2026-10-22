/* The product's identity, read from src/data/brand.json — the ONE place
   the name lives. HTML pages get the same values stamped at build time by
   the `fms-brand` plugin in vite.config.js ({{brand:name}} etc.). */
import brand from '../data/brand.json';

export const BRAND = Object.freeze({ ...brand });
export const BRAND_HOST = BRAND.host;
export const BRAND_PATH = BRAND.path;
export const SUPPORT_EMAIL = BRAND.supportEmail;

