/* The product's identity, read from src/data/brand.json — the ONE place
   the name lives. HTML pages get the same values stamped at build time by
   the `fms-brand` plugin in vite.config.js ({{brand:name}} etc.). */
import brand from '../data/brand.json';

export const BRAND = Object.freeze({ ...brand });
export const BRAND_NAME = BRAND.name;
export const BRAND_HOST = BRAND.host;
export const BRAND_PATH = BRAND.path;
export const SUPPORT_EMAIL = BRAND.supportEmail;

/** "FILMMAKERSTUDIO" — for the uppercase eyebrows and bands. */
export const brandUpper = () => BRAND.name.toUpperCase();
/** "Made with FilmMakerStudio" — the growth line, without the host. */
export const madeWith = () => 'Made with ' + BRAND.name;
