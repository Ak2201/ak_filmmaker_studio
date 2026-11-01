/* ============================================================
   GEMINI THROUGH A GOOGLE LOGIN — THE OWNER'S OWN, NO API KEY
   ------------------------------------------------------------
   The owner asked (1 Nov 2026) to run the AI tools on their own
   Gemini by signing in with Google instead of pasting a key.

   WHY THIS IS AN ADMIN-ONLY BUTTON AND NOT PART OF SIGN-IN.
   The Gemini API accepts a Google OAuth access token in place of a
   key, but Google bills an OAuth call to the Cloud project that OWNS
   THE OAUTH CLIENT — which is this studio's project, i.e. the owner's.
   For the owner that is exactly "my own Gemini". For anybody else it
   would be the owner paying for them, and the scopes below are not on
   the published consent screen (adding them to the main sign-in would
   put every user through Google's "unverified app" warning). So:

     - it is a SEPARATE Google window, asked for from a click in
       Settings → AI, shown only to an account in VITE_ADMIN_EMAILS
       (visibility, not a boundary — the real cap belongs in the Cloud
       console: a daily quota on the Generative Language API);
     - it never touches the sign-in scope set in auth-scope.js, so the
       consent every other user gives is unchanged;
     - the same OAuth client (VITE_GOOGLE_CLIENT_ID) is used, so
       nothing new is configured to get it running. That project must
       have the Generative Language API ENABLED.

   THE TOKEN. An access token lives about an hour. It is kept in
   memory and in sessionStorage (this tab only, gone when the tab
   closes) so moving between pages does not ask again. It is NEVER in
   localStorage, never in a registry, never synced or backed up — no
   storage contract changed. Google will not mint a new one without a
   window, so an expired token is reported, never silently renewed
   (the same rule drive.js learnt the hard way).

   NOT VERIFIED AGAINST GOOGLE when it was written: the scope set is
   the one Google's Gemini OAuth quickstart uses. If Google answers
   403 "insufficient scopes" or "API not enabled", the fix is in the
   Cloud console or in SCOPES below, nowhere else.
   ============================================================ */

const CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) || '';
/* Optional: bill a named Cloud project instead of the client's own. */
const QUOTA_PROJECT = (import.meta.env && import.meta.env.VITE_GEMINI_QUOTA_PROJECT) || '';
const GIS_SRC = 'https://accounts.google.com/gsi/client';

export const SCOPES = [
  'https://www.googleapis.com/auth/cloud-platform',
  'https://www.googleapis.com/auth/generative-language.retriever'
].join(' ');

/* sessionStorage, not localStorage: per tab, never a saved-work key. */
const TAB_KEY = 'fms_gemini_google_tok';
const SLACK_MS = 60 * 1000;

let _tok = null;   // { value, expiresAt }
let _gisP = null;
let _connectP = null;

export function isConfigured() { return !!CLIENT_ID; }

function readTab() {
  try {
    const t = JSON.parse(sessionStorage.getItem(TAB_KEY) || 'null');
    return t && typeof t.value === 'string' && Number(t.expiresAt) > Date.now() ? t : null;
  } catch (e) { return null; }
}
function writeTab(t) {
  try { t ? sessionStorage.setItem(TAB_KEY, JSON.stringify(t)) : sessionStorage.removeItem(TAB_KEY); } catch (e) { /* memory still has it */ }
}

/** The live token, or '' when there is none or it has expired. */
export function token() {
  if (!_tok) _tok = readTab();
  if (_tok && _tok.expiresAt > Date.now()) return _tok.value;
  _tok = null;
  return '';
}
export function isConnected() { return !!token(); }

/** Minutes left on the token, for the Settings line. */
export function minutesLeft() {
  return token() ? Math.max(0, Math.round((_tok.expiresAt - Date.now()) / 60000)) : 0;
}

/** The header pair a Gemini request carries instead of x-goog-api-key. */
export function authHeaders() {
  const t = token();
  if (!t) return null;
  const hd = { authorization: 'Bearer ' + t };
  if (QUOTA_PROJECT) hd['x-goog-user-project'] = QUOTA_PROJECT;
  return hd;
}

/** Drop the token here (an expiry, a 401). Does not revoke. */
export function forget() { _tok = null; writeTab(null); }

function loadGIS() {
  if (_gisP) return _gisP;
  _gisP = new Promise((resolve, reject) => {
    const ok = () => window.google && window.google.accounts && window.google.accounts.oauth2;
    if (ok()) return resolve(window.google);
    const s = document.createElement('script');
    s.src = GIS_SRC; s.async = true; s.defer = true;
    s.onload = () => (ok() ? resolve(window.google) : reject(new Error('Google Identity Services loaded without an oauth2 client.')));
    s.onerror = () => { _gisP = null; reject(new Error('Could not load Google Identity Services.')); };
    document.head.append(s);
  });
  return _gisP;
}

/**
 * Open Google's own window and ask for Gemini access. ONLY from a
 * click (a popup outside a user gesture is blocked). Resolves to the
 * token; rejects with a sentence a person can act on.
 */
export function connect() {
  if (!CLIENT_ID) return Promise.reject(new Error('This build has no Google client id (VITE_GOOGLE_CLIENT_ID).'));
  if (_connectP) return _connectP;
  _connectP = loadGIS().then((google) => new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPES,
      callback: (resp) => {
        if (!resp || !resp.access_token) {
          return reject(new Error((resp && (resp.error_description || resp.error)) || 'Google did not return an access token.'));
        }
        if (google.accounts.oauth2.hasGrantedAllScopes
          && !google.accounts.oauth2.hasGrantedAllScopes(resp, ...SCOPES.split(' '))) {
          return reject(new Error('Google did not grant every permission Gemini needs. Tick all the boxes on Google’s screen and try again.'));
        }
        const ttl = (Number(resp.expires_in) || 3600) * 1000;
        _tok = { value: resp.access_token, expiresAt: Date.now() + ttl - SLACK_MS };
        writeTab(_tok);
        resolve(_tok.value);
      },
      error_callback: (err) => reject(new Error((err && (err.message || err.type)) || 'The Google window was closed.'))
    });
    client.requestAccessToken({ prompt: '' });
  })).finally(() => { _connectP = null; });
  return _connectP;
}

/** Disconnect: revoke the grant at Google and forget the token. */
export async function disconnect() {
  const t = token();
  forget();
  if (!t) return;
  try {
    const google = await loadGIS();
    await new Promise((r) => google.accounts.oauth2.revoke(t, r));
  } catch (e) { /* forgotten here either way; Google expires it within the hour */ }
}

export default { SCOPES, isConfigured, token, isConnected, minutesLeft, authHeaders, forget, connect, disconnect };
