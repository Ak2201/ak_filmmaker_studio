/* ============================================================
   google-token's PURE half — encryption, request shapes, Google's answers
   ------------------------------------------------------------
   Everything here runs the same in Deno (the edge function) and in Node
   (scripts/test-google-token.mjs): WebCrypto through globalThis.crypto,
   no Deno.*, no fetch, no database. The function does the I/O and asks
   this file what to make of it.

   THE CIPHERTEXT. base64( iv[12] || AES-256-GCM(ciphertext || tag[16]) ),
   with the user id as additional authenticated data. The AAD is what
   stops a row copied onto another user id from decrypting: the database
   is not trusted to keep user_id and enc_refresh together, the key is.

   NOTHING HERE LOGS, and nothing returns a refresh token to a caller.
   The only token a response ever carries is a fresh ACCESS token, which
   is what the browser had anyway after sign-in.
   ============================================================ */

export const ACTIONS = ['store', 'mint', 'revoke'];
export const TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const IV_BYTES = 12;
const TAG_BYTES = 16;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const subtle = () => {
  const c = globalThis.crypto;
  if (!c || !c.subtle) throw new Error('WebCrypto is not available');
  return c.subtle;
};

export function b64encode(bytes) {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
}

export function b64decode(str) {
  const clean = String(str ?? '').trim();
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(clean) || clean.length % 4 !== 0) throw new Error('not base64');
  const bin = atob(clean);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** GOOGLE_TOKEN_KEY (base64 of exactly 32 bytes, `openssl rand -base64 32`)
 *  as a non-extractable AES-GCM key. Throws with a sentence that names the
 *  setting, never the value. */
export async function importKey(b64) {
  let raw;
  try { raw = b64decode(b64); } catch { throw new Error('GOOGLE_TOKEN_KEY is not base64'); }
  if (raw.length !== 32) throw new Error(`GOOGLE_TOKEN_KEY must be 32 bytes (it decodes to ${raw.length})`);
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export async function encryptToken(key, plaintext, aad) {
  if (!plaintext) throw new Error('nothing to encrypt');
  if (!aad) throw new Error('no AAD (the user id) given');
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(String(aad)), tagLength: 128 }, key, enc.encode(String(plaintext))));
  const out = new Uint8Array(IV_BYTES + ct.length);
  out.set(iv, 0);
  out.set(ct, IV_BYTES);
  return b64encode(out);
}

/** Throws on a wrong key, a wrong AAD, a truncated or edited blob. */
export async function decryptToken(key, blob, aad) {
  const all = b64decode(blob);
  if (all.length < IV_BYTES + TAG_BYTES + 1) throw new Error('ciphertext too short');
  const iv = all.subarray(0, IV_BYTES);
  const ct = all.subarray(IV_BYTES);
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(String(aad)), tagLength: 128 }, key, ct);
  return dec.decode(pt);
}

/** A Google refresh token is an opaque printable string (today `1//…`,
 *  around 100 characters). Only the shape that could never be one is
 *  refused: empty, absurdly long, or carrying spaces or control bytes. */
export function isRefreshTokenShaped(s) {
  return typeof s === 'string' && s.length >= 10 && s.length <= 2048 && /^[\x21-\x7e]+$/.test(s);
}

/** The request body, checked. → { action, refreshToken?, scope?, userId? }
 *  or { error, status }. `userId` is only ever an ADMIN's target for
 *  revoke; who the caller is comes from the JWT, never the body. */
export function parseRequest(body) {
  const b = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const action = typeof b.action === 'string' ? b.action.trim().toLowerCase() : '';
  if (!ACTIONS.includes(action)) return { status: 400, error: 'Say what to do: store, mint or revoke.' };
  if (action === 'store') {
    if (!isRefreshTokenShaped(b.refresh_token)) return { status: 400, error: 'That is not a Google refresh token.' };
    const scope = typeof b.scope === 'string' ? b.scope.slice(0, 1000) : null;
    return { action, refreshToken: b.refresh_token, scope };
  }
  if (action === 'revoke' && b.user_id != null) {
    if (typeof b.user_id !== 'string' || !UUID.test(b.user_id)) return { status: 400, error: 'user_id is not a user id.' };
    return { action, userId: b.user_id.toLowerCase() };
  }
  return { action };
}

/** The form body for a refresh. Secrets go in the BODY, never the URL. */
export function refreshForm({ clientId, clientSecret, refreshToken }) {
  return new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }).toString();
}

export function revokeForm(token) {
  return new URLSearchParams({ token }).toString();
}

/** What a token-endpoint answer means. → { status, body, drop, rotate? }
 *  `drop`: delete the stored row (the grant is dead). `rotate`: Google sent
 *  a new refresh token, store it in place of the old one. The body never
 *  holds a refresh token. A message reports what Google said; it does not
 *  guess why (CLAUDE.md, "Do not let a message GUESS"). */
export function mintOutcome(httpStatus, json, { threw = false } = {}) {
  if (threw) return { status: 502, drop: false, body: { code: 'unreachable', error: 'Google’s token service did not answer.' } };
  const j = json && typeof json === 'object' ? json : {};
  if (httpStatus === 200 && typeof j.access_token === 'string' && j.access_token) {
    const expires = Number.isFinite(Number(j.expires_in)) ? Math.max(0, Math.floor(Number(j.expires_in))) : 3600;
    const out = { status: 200, drop: false, body: { access_token: j.access_token, expires_in: expires, scope: typeof j.scope === 'string' ? j.scope : '', token_type: 'Bearer' } };
    if (isRefreshTokenShaped(j.refresh_token)) out.rotate = j.refresh_token;
    return out;
  }
  const err = typeof j.error === 'string' ? j.error : '';
  if (err === 'invalid_grant') {
    return { status: 409, drop: true, body: { code: 'regrant', error: 'Google no longer accepts this account’s Drive grant (invalid_grant). Reconnect Google Drive.' } };
  }
  if (err === 'invalid_client' || err === 'unauthorized_client') {
    return { status: 503, drop: false, body: { code: 'client', error: `Google refused this studio’s OAuth client (${err}).` } };
  }
  return { status: 502, drop: false, body: { code: 'google', error: `Google’s token service answered ${httpStatus || 'nothing'}${err ? ' (' + err + ')' : ''}.` } };
}

/** What a revoke answer means. 200 is revoked; 400 invalid_token means
 *  Google had already forgotten it, which is the same outcome. Anything
 *  else (or no answer) keeps the row, so a later revoke can still reach it. */
export function revokeOutcome(httpStatus, json, { threw = false } = {}) {
  if (threw) return { revoked: false, drop: false, google: 'unreachable' };
  const err = json && typeof json === 'object' && typeof json.error === 'string' ? json.error : '';
  if (httpStatus === 200) return { revoked: true, drop: true, google: 'revoked' };
  if (httpStatus === 400 && (err === 'invalid_token' || err === 'invalid_request')) return { revoked: true, drop: true, google: 'already' };
  return { revoked: false, drop: false, google: `answered ${httpStatus}${err ? ' (' + err + ')' : ''}` };
}

/** For an error string that might carry what it was handed: anything that
 *  looks like a Google token is cut out before it can reach a log or a
 *  response. (The function logs status codes only; this is the belt.) */
export function redact(s) {
  return String(s ?? '').replace(/\b(1\/\/[\w-]{10,}|ya29\.[\w.-]{10,})/g, '[token]');
}
