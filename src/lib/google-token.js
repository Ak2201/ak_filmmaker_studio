/* ============================================================
   GOOGLE TOKEN — the client's half of the google-token edge function
   ------------------------------------------------------------
   supabase/functions/google-token holds a person's Google REFRESH token
   (encrypted, schema §66) so Drive keeps working past the one-hour
   sign-in grant. This module is its only caller, and it never sees a
   refresh token come back, because the function never sends one.

     storeRefreshToken(token, scope)  after a drive-mode sign-in that
                                      returned session.provider_refresh_token
     mintAccessToken()                → { access_token, expires_in, scope };
                                      throws GoogleTokenError, whose code
                                      'regrant' means "Reconnect Google Drive"
     revokeGoogleGrant(userId?)       sign-out everywhere (no id) and the
                                      console's DELETE TOTALLY (an id; owner
                                      only). Best effort: resolves { ok, … }
                                      and never throws, because neither
                                      caller may be blocked by Google being
                                      unreachable; deleting the person drops
                                      the row by cascade anyway.
     googleTokenStatus()              → { has_token, updated_at } or null

   Lazy: it reaches the client through cloud-api.js, which imports cloud.js
   only when first called, so nothing here is in a first paint. A mint
   shares ONE in-flight promise (the ensureClient race trap, CLAUDE.md):
   two callers in the same tick get the same answer.
   ============================================================ */
import { cloudClient, rpc } from './cloud-api.js';

export const FN = 'google-token';

export class GoogleTokenError extends Error {
  constructor(message, code, status) { super(message); this.code = code || ''; this.status = status || 0; }
}

async function call(body) {
  const sb = await cloudClient();
  if (!sb) throw new GoogleTokenError('There is no connection to the studio server.', 'no-client');
  const { data, error } = await sb.functions.invoke(FN, { body });
  if (error) {
    let j = null;
    try { j = await error.context?.json?.(); } catch (e) { /* no body */ }
    const status = (error.context && error.context.status) || 0;
    const message = (j && j.error) || (status ? `The Google token service answered ${status}.` : 'The Google token service did not answer.');
    throw new GoogleTokenError(message, (j && j.code) || (status === 404 ? 'not_deployed' : ''), status);
  }
  return data;
}

export async function storeRefreshToken(token, scope = null) {
  if (!token) return false;
  await call({ action: 'store', refresh_token: String(token), scope: scope || null });
  return true;
}

let _minting = null;
export function mintAccessToken() {
  if (_minting) return _minting;
  const p = (async () => {
    const out = await call({ action: 'mint' });
    if (!out || typeof out.access_token !== 'string' || !out.access_token) throw new GoogleTokenError('The Google token service sent no access token.', 'empty');
    return { access_token: out.access_token, expires_in: Number(out.expires_in) || 3600, scope: String(out.scope || '') };
  })();
  /* Cleared when it settles, from outside the async body: a `finally` inside
     it can run before `_minting` is assigned (CLAUDE.md, item 14). */
  _minting = p;
  p.then(() => { if (_minting === p) _minting = null; }, () => { if (_minting === p) _minting = null; });
  return p;
}

export async function revokeGoogleGrant(userId = null) {
  try {
    const out = await call(userId ? { action: 'revoke', user_id: userId } : { action: 'revoke' });
    return { ok: true, revoked: !!(out && out.revoked), removed: !!(out && out.removed), google: (out && out.google) || '' };
  } catch (e) {
    return { ok: false, code: e.code || '', message: e.message || '' };
  }
}

export async function googleTokenStatus() {
  const { data, error } = await rpc('google_token_status');
  if (error) return null;
  return data && typeof data === 'object' ? { has_token: !!data.has_token, updated_at: data.updated_at || null } : null;
}

export default { FN, GoogleTokenError, storeRefreshToken, mintAccessToken, revokeGoogleGrant, googleTokenStatus };
