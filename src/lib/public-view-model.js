/* ============================================================
   PUBLIC VIEW — THE MODEL (pure: no DOM, no storage, no imports)
   ------------------------------------------------------------
   What a public view link may carry, and the scrubbing that makes
   sure it carries nothing else. Split from public-view.js so it can be
   tested in Node (scripts/prove-growth.mjs) and so the server-side
   proposal and the client agree on ONE list of private keys. See the
   header of public-view.js for the design; this file is its contract.
   ============================================================ */
export const VIEW_KINDS = ['pitch', 'callsheet'];

/* Keys that must never leave the owner's browser in a public payload.
   Matched case-insensitively against every key at every depth. */
export const PRIVATE_KEYS = /^(phone|phones|mobile|tel|telephone|whatsapp|email|e_mail|emails|contact_notes|notes_private|address|user_id|owner_id|account_id|project_id)$/i;

/** A deep copy with every private key removed. */
export function stripPrivate(v, depth = 0) {
  if (depth > 12) return null;
  if (Array.isArray(v)) return v.map((x) => stripPrivate(x, depth + 1));
  if (v && typeof v === 'object') {
    const out = {};
    for (const [k, x] of Object.entries(v)) if (!PRIVATE_KEYS.test(k)) out[k] = stripPrivate(x, depth + 1);
    return out;
  }
  return v;
}
/** True when a payload still carries a private key anywhere. */
export function hasPrivate(v, depth = 0) {
  if (depth > 12 || !v || typeof v !== 'object') return false;
  if (Array.isArray(v)) return v.some((x) => hasPrivate(x, depth + 1));
  return Object.entries(v).some(([k, x]) => PRIVATE_KEYS.test(k) || hasPrivate(x, depth + 1));
}

const txt = (v) => String(v ?? '').trim();
/* Free text the owner typed onto a sheet (its notes, a scene synopsis)
   is published as written — except anything shaped like an e-mail
   address or a phone number, which a unit list habitually picks up
   ("call Ravi on 98400 12345") and which a public link must not carry.
   Ten-plus digits, optionally spaced or dashed, with an optional +. */
export function redactContactish(s) {
  return String(s ?? '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[e-mail removed]')
    .replace(/\+?\d(?:[\s-]?\d){9,}/g, '[phone removed]');
}
const slugOf = (s) => [txt(s.intExt), txt(s.location) || 'LOCATION TBD', txt(s.dayNight)].filter(Boolean).join(' · ');

/** The pitch deck's data: `deck` is collectFrom()'s / collectPitch()'s
 *  output (pitch-deck.js), passed in so this file imports nothing. */
export function snapshotPitch(deck) {
  const d = deck && typeof deck === 'object' ? deck : {};
  return stripPrivate({ v: 1, kind: 'pitch', title: txt(d.title) || 'Untitled film', deck: d });
}

/**
 * One call sheet, flattened to what a printed sheet shows. `sheet` is
 * the stored row (ids only); `contacts` and `scenes` are the models it
 * points into. Contact phone/e-mail are never read, let alone copied.
 */
export function snapshotCallSheet(sheet, contacts = [], scenes = [], { project = '' } = {}) {
  const s = sheet || {};
  const byId = new Map((contacts || []).map((c) => [c.id, c]));
  const sceneById = new Map((scenes || []).map((x) => [x.id, x]));
  const calls = Object.entries(s.calls || {}).map(([id, time]) => {
    const c = byId.get(id);
    if (!c) return null;
    return { name: txt(c.name), role: txt(c.role), department: txt(c.department), time: txt(time) || txt(s.generalCall) };
  }).filter((c) => c && c.name);
  const sc = (s.sceneIds || []).map((id) => sceneById.get(id)).filter(Boolean).map((x) => ({
    number: txt(x.number), slug: slugOf(x), eighths: Number(x.eighths) || 0, synopsis: redactContactish(txt(x.synopsis).slice(0, 240))
  }));
  return stripPrivate({
    v: 1, kind: 'callsheet', title: txt(s.title) || 'Call sheet', project: txt(project),
    sheet: { date: txt(s.date), generalCall: txt(s.generalCall), location: txt(s.location), notes: redactContactish(txt(s.notes).slice(0, 2000)), scenes: sc, calls }
  });
}

/** A token is 32+ url-safe characters (the proposal mints 32 bytes, base64url). */
export const tokenShaped = (t) => /^[A-Za-z0-9_-]{32,128}$/.test(String(t || ''));
