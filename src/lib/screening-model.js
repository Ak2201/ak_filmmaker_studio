/* ============================================================
   SCREENING MODEL — the screening room's backend and derivations
   ------------------------------------------------------------
   The logic half of src/pages/screening.js. A pass holder is NOT a user
   of the studio: no account, no sign-in, and nothing of theirs may be
   kept. So the room has its OWN anonymous Supabase client — built from
   the build's public URL and anon key, keeping no session
   (persistSession: false), never touching storage — and never the
   studio's (cloud.js). The server decides everything that matters in
   screening_open() (schema section 13.6); this module asks it.
   ============================================================ */
import { createGate, errorSentence } from './gate.js';
import { openPublicView } from './public-view.js';

let client = null;
/** The room's anonymous client, or null when the build carries no
 *  project. Lazy: the SDK is fetched on first need only. */
export async function guestClient() {
  if (client) return client;
  const env = import.meta.env || {};
  const url = String(env.VITE_SUPABASE_URL || '').trim();
  const key = String(env.VITE_SUPABASE_ANON_KEY || '').trim();
  if (!url || !key) return null;
  const { createClient } = await import('@supabase/supabase-js');
  client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  return client;
}

/* The gate's calls, on the guest client. */
const Gate = createGate(guestClient);

/** Open a screening pass. Resolves the pass the server returned;
 *  rejects with the gate's error (err.code 'nocloud' when unconnected). */
export const openScreening = (code, email) => Gate.openScreening(code, email);

/** Open a public view token (VITE_PUBLIC_VIEW only). */
export const openSharedView = (token) => guestClient().then((c) => openPublicView(c, token));

/** The sentence a failed open is told with. */
export function openFailedSentence(err) {
  return err.code === 'nocloud'
    ? 'This copy of the studio is not connected to a cloud project, so it cannot open passes.'
    : errorSentence(err, 'That screening pass could not be opened.');
}

/** "This pass closes in …" for `ms` left. */
export function expiryText(ms) {
  if (ms <= 0) return 'This pass has expired.';
  const m = Math.round(ms / 60000);
  if (m < 60) return `This pass closes in ${m} minute${m === 1 ? '' : 's'}.`;
  const hrs = Math.round(m / 60);
  if (hrs < 48) return `This pass closes in ${hrs} hour${hrs === 1 ? '' : 's'}.`;
  return `This pass closes in ${Math.round(hrs / 24)} days.`;
}

/** What a pass carries, unpacked: the blueprint, the story, the scenes. */
export function passScopes(pass) {
  const scopes = pass.scopes || {};
  return {
    bp: scopes.feature || {},
    story: scopes.story || null,
    scenes: (scopes.scenes && Array.isArray(scopes.scenes.scenes)) ? scopes.scenes.scenes : []
  };
}

/** The forensic watermark's three lines. */
export function watermarkLines(p) {
  return [`SCREENING PASS · ACCESS ${p.accessId}`, p.viewerEmail || 'viewer not named',
    new Date(p.openedAt).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'];
}

/** A public view token from a location hash (`#view=<t>`), or ''. */
export function viewTokenFrom(hash) {
  const m = /(?:^#|&)view=([A-Za-z0-9_-]+)/.exec(hash || '');
  return m ? m[1] : '';
}

export default { guestClient, openScreening, openSharedView, openFailedSentence, expiryText, passScopes, watermarkLines, viewTokenFrom };
