/* ============================================================
   WHERE A RECCE IS — coordinates, Maps links, and the fallback
   ------------------------------------------------------------
   Pure helpers over the two recce fields `lat` / `lng`
   (src/lib/locations.js blankRecce). Nothing here reads or writes
   storage: the pages pass a recce in and get an answer back, so the
   parsing is testable in Node (scripts/test-callsheet.mjs).

   The coordinates are stored as the strings an <input> gives back,
   like every other recce field, and read as numbers here. A blank or
   unreadable pair is "no coordinates", never 0,0 — which is a real
   place, in the Gulf of Guinea.

   A Maps LINK is a plain https navigation, not a fetch: nothing here
   asks Google for anything, so connect-src is untouched.
   ============================================================ */
import { CHENNAI, validLatLng } from './sun.js';

const NUM = '(-?\\d{1,3}(?:\\.\\d+)?)';
const PATTERNS = [
  new RegExp('!3d' + NUM + '!4d' + NUM),               // place pin inside a /data= path — the exact spot
  new RegExp('@' + NUM + ',\\s*' + NUM),                // /maps/@13.08,80.27,15z — the map's centre
  new RegExp('[?&](?:q|query|ll|destination|center|sll)=' + NUM + '(?:,|%2C)\\s*' + NUM, 'i'),
  new RegExp('^\\s*' + NUM + '\\s*[,\\s]\\s*' + NUM + '\\s*$')   // a bare "13.0827, 80.2707"
];

/**
 * Pull a latitude and longitude out of whatever was pasted: a Google
 * Maps URL (`@lat,lng`, `?q=lat,lng`, `!3d…!4d…`) or a bare pair.
 * → { lat, lng } as numbers, or null. A short link (maps.app.goo.gl)
 * carries no coordinates until it is followed, and this does not
 * follow links, so it answers null and the page says so.
 */
export function parseLatLng(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  let decoded = s;
  try { decoded = decodeURIComponent(s); } catch (e) { /* keep as typed */ }
  for (const re of PATTERNS) {
    const m = re.exec(decoded);
    if (!m) continue;
    const lat = Number(m[1]), lng = Number(m[2]);
    if (validLatLng(lat, lng)) return { lat: round6(lat), lng: round6(lng) };
  }
  return null;
}

const round6 = (n) => Math.round(n * 1e6) / 1e6;

/** A recce's own coordinates, or null. */
export function coordsOf(recce) {
  if (!recce) return null;
  const sLat = String(recce.lat ?? '').trim();
  const sLng = String(recce.lng ?? '').trim();
  if (!sLat || !sLng) return null;
  const lat = Number(sLat), lng = Number(sLng);
  return validLatLng(lat, lng) ? { lat, lng } : null;
}

/**
 * The place a day's light is computed for: the first location (in the
 * order given — the day's shooting order) whose recce has coordinates.
 * Otherwise Chennai, flagged `fallback: true` so the page can say so.
 *
 *   places: [{ name, recce }]
 *   → { lat, lng, name, fallback }
 */
export function placeFor(places) {
  for (const p of places || []) {
    const c = coordsOf(p && p.recce);
    if (c) return { ...c, name: p.name, fallback: false };
  }
  return { lat: CHENNAI.lat, lng: CHENNAI.lng, name: CHENNAI.label, fallback: true };
}

/**
 * A Google Maps link that opens the place in the app on a phone and in
 * the browser on a desk — the documented `api=1` search URL, no key.
 * Coordinates win over an address, an address over a bare name. '' when
 * there is nothing to search for.
 */
export function mapsLink({ lat, lng, address, name } = {}) {
  const c = coordsOf({ lat, lng });
  const query = c ? c.lat + ',' + c.lng : String(address || name || '').trim();
  if (!query) return '';
  return 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(query);
}

/** The Maps link for one recce, filed under `name`. */
export function recceMapsLink(name, recce) {
  return mapsLink({ ...(recce || {}), name });
}

export default { parseLatLng, coordsOf, placeFor, mapsLink, recceMapsLink };
