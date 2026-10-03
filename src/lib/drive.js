/* ============================================================
   GOOGLE DRIVE — the client, and nothing about this studio
   ------------------------------------------------------------
   Auth, find-or-create one file, upload it, download it, read its
   head revision, list its revisions. This module does not know
   what a project is, never reads localStorage for anything but
   its own token-free bookkeeping (it reads none), and never
   decides whether an upload is a good idea. drive-sync.js owns
   all of that; keeping the two apart is what makes this half
   testable with a faked `fetch` and no Google account.

   ONE FILE, A STABLE ID, AND DRIVE'S OWN HISTORY.
   The backup is a single JSON file whose id we remember. Every
   push is a PATCH to that same id, which makes Drive's revision
   list the version history — "restore the one from Tuesday" is a
   `revisions` call rather than a scheme this app has to maintain,
   and a scheme this app maintained would be one more thing that
   can be wrong about somebody's months of writing.

   THE SCOPE IS drive.file, DELIBERATELY.
   Not `drive` and not `drive.readonly`: those are RESTRICTED,
   which means an annual security assessment before anyone but the
   developer can use the app. Not `drive.appdata` either, although
   it is non-sensitive in the same way `drive.file` is: appdata
   hides the file in a folder the user cannot open, and the whole
   premise of this studio is that the user's writing is theirs. A
   backup they cannot see, copy, download or keep is not a backup
   they own. `drive.file` grants access only to files this app
   created, which is exactly one file.

   THE TOKEN IS NEVER PERSISTED.
   It lives in a module variable and dies with the document. A
   credential written to storage is the same class of mistake as
   an API key inside a backup file, and this app already refuses
   that one (see ai.js). There is no refresh token because a
   refresh token needs a client secret and a server to keep it in,
   and this is a static build with neither. Access tokens last
   about an hour, so expiry is handled by ASKING AGAIN rather than
   by failing: once consent has been given, Google Identity
   Services can mint a new one silently from the user's existing
   Google session.

   THE CLIENT ID IS A BUILD SETTING, NOT A STORAGE KEY.
   `VITE_GOOGLE_CLIENT_ID` at build time. An OAuth client id is
   public (it ships in the page either way), it belongs to whoever
   deployed this build rather than to the person using it, and
   this feature was allowed exactly ONE new storage key — which
   went to the thing that genuinely varies per device, the file
   id. A build without the variable set reports
   `isConfigured() === false` and the settings page says so
   instead of offering a button that cannot work.

   CSP. `connect-src` must name https://www.googleapis.com and
   https://accounts.google.com; `script-src` must allow
   https://accounts.google.com/gsi/client; `frame-src` must allow
   https://accounts.google.com, because the silent token request
   is an iframe. All of it in BOTH vercel.json and netlify.toml.
   Without those entries the browser refuses the request before it
   leaves and the only symptom is a TypeError — the lesson
   api.anthropic.com already taught this codebase once.
   ============================================================ */

/* ------------------------------------------------------------
   CONSTANTS
   ------------------------------------------------------------ */
export const DRIVE_SCOPE   = 'https://www.googleapis.com/auth/drive.file';
export const API_ORIGIN    = 'https://www.googleapis.com';
export const IDENTITY_ORIGIN = 'https://accounts.google.com';
export const GIS_SRC       = IDENTITY_ORIGIN + '/gsi/client';

/** The one file. Named so a human scrolling their Drive knows what it is. */
export const BACKUP_FILE_NAME = 'filmmakers-studio-backup.json';
export const BACKUP_MIME      = 'application/json';

/** Build-time. See the header. */
export const CLIENT_ID = (import.meta.env && import.meta.env.VITE_GOOGLE_CLIENT_ID) || '';

/** Can this build talk to Drive at all? */
export function isConfigured() { return !!CLIENT_ID; }

/* ------------------------------------------------------------
   THE TOKEN — in memory, for the life of this document
   ------------------------------------------------------------ */
let _token = null;        // { value, expiresAt }  — never written anywhere
let _tokenClient = null;  // the GIS token client, built once
let _gisPromise = null;   // single-flight script load

/** True while a usable, unexpired token is held. */
export function hasToken() {
  return !!(_token && _token.value && Date.now() < _token.expiresAt);
}

/** Drop it. The next call asks Google again. */
export function forgetToken() { _token = null; }

/* A minute of slack, so a request is never sent with a token that
   expires while it is in flight. */
const EXPIRY_SLACK_MS = 60 * 1000;

/* The GIS token client has ONE callback for its lifetime, so the
   per-request resolvers are parked here rather than rebuilding the
   client per call — rebuilding it is what makes the silent path
   re-prompt, which defeats the whole point of the silent path. */
let _pending = null;
let _pendingErr = null;

function loadGIS() {
  if (_gisPromise) return _gisPromise;
  _gisPromise = new Promise((resolve, reject) => {
    const g = window.google;
    if (g && g.accounts && g.accounts.oauth2) return resolve(g);
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => {
      const got = window.google;
      if (got && got.accounts && got.accounts.oauth2) resolve(got);
      else reject(new Error('Google Identity Services loaded but exposed no oauth2 client.'));
    };
    s.onerror = () => {
      _gisPromise = null;
      reject(new Error(
        'Could not load Google Identity Services. If this build is behind a ' +
        'Content-Security-Policy, script-src has to allow ' + GIS_SRC + '.'
      ));
    };
    document.head.append(s);
  });
  return _gisPromise;
}

/**
 * Get an access token.
 *
 * `interactive: false` (the default on load) asks Google for one
 * WITHOUT showing anything — which works once the user has
 * consented, and fails quietly when they have not. That is the
 * whole expiry story: an hour-old token is replaced rather than
 * mourned.
 *
 * `interactive: true` is the Connect button and may open Google's
 * own consent window. Only ever reached from a click.
 */
export function getToken(opts) {
  opts = opts || {};
  if (hasToken() && !opts.force) return Promise.resolve(_token.value);
  if (!isConfigured()) {
    return Promise.reject(new Error('This build has no Google client id (VITE_GOOGLE_CLIENT_ID).'));
  }

  return loadGIS().then((google) => new Promise((resolve, reject) => {
    const done = (resp) => {
      if (!resp || !resp.access_token) {
        return reject(new Error(
          (resp && (resp.error_description || resp.error)) ||
          'Google did not return an access token.'
        ));
      }
      const ttl = (Number(resp.expires_in) || 3600) * 1000;
      _token = { value: resp.access_token, expiresAt: Date.now() + ttl - EXPIRY_SLACK_MS };
      resolve(_token.value);
    };

    if (!_tokenClient) {
      _tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: DRIVE_SCOPE,
        callback: (resp) => { const cb = _pending; _pending = null; (cb || done)(resp); },
        error_callback: (err) => {
          const cb = _pendingErr; _pendingErr = null;
          (cb || reject)(new Error((err && (err.message || err.type)) || 'Google sign-in was dismissed.'));
        }
      });
    }
    _pending = done;
    _pendingErr = reject;
    /* '' asks for a token with no UI if consent already exists;
       'consent' is the first time, and the only time anything is
       shown. Google's own window, never a field in this app. */
    _tokenClient.requestAccessToken({ prompt: opts.interactive ? 'consent' : '' });
  }));
}

/* ------------------------------------------------------------
   THE WIRE
   ------------------------------------------------------------ */

/* Swappable for a test. prove-drive.mjs replaces this to drive the
   conflict logic through every branch with no Google account — see
   the header of that script. Nothing in the app ever sets it. */
let _fetch = (...a) => window.fetch(...a);
export function __setFetch(fn) { _fetch = fn || ((...a) => window.fetch(...a)); }

async function call(url, opts) {
  opts = opts || {};
  let token = await getToken();
  let res = await _fetch(url, withAuth(opts, token));
  if (res.status === 401) {
    /* An hour went by. Ask again rather than failing — the user
       still has a Google session, and consent is already given. */
    forgetToken();
    token = await getToken({ force: true });
    res = await _fetch(url, withAuth(opts, token));
  }
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = (body && body.error && (body.error.message || body.error.status)) || '';
    } catch (e) { /* not JSON */ }
    const err = new Error('Drive ' + res.status + (detail ? ': ' + detail : ''));
    err.status = res.status;
    throw err;
  }
  return res;
}

function withAuth(opts, token) {
  const headers = Object.assign({}, opts.headers || {}, { Authorization: 'Bearer ' + token });
  return Object.assign({}, opts, { headers });
}

const q = (o) => Object.entries(o)
  .filter(([, v]) => v !== undefined && v !== null)
  .map(([k, v]) => encodeURIComponent(k) + '=' + encodeURIComponent(v))
  .join('&');

/* ------------------------------------------------------------
   THE FILE
   ------------------------------------------------------------ */

const FILE_FIELDS = 'id,name,headRevisionId,modifiedTime,webViewLink,trashed,size';

/**
 * The app's backup file, if this account already has one.
 *
 * Under `drive.file` this list can only ever return files THIS APP
 * created, so there is no risk of matching an unrelated file that
 * happens to share the name. Returns null when there is none.
 */
export async function findBackupFile(name) {
  const query = "name = '" + String(name || BACKUP_FILE_NAME).replace(/'/g, "\\'") +
                "' and trashed = false";
  const url = API_ORIGIN + '/drive/v3/files?' + q({
    q: query,
    spaces: 'drive',
    orderBy: 'modifiedTime desc',
    pageSize: 10,
    fields: 'files(' + FILE_FIELDS + ')'
  });
  const res = await call(url, { method: 'GET' });
  const body = await res.json();
  const files = (body && body.files) || [];
  return files.length ? files[0] : null;
}

/** Create the file, with its first contents. Returns the metadata. */
export async function createBackupFile(name, text) {
  const boundary = 'fms' + Math.random().toString(36).slice(2);
  const meta = { name: name || BACKUP_FILE_NAME, mimeType: BACKUP_MIME };
  const body =
    '--' + boundary + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(meta) + '\r\n' +
    '--' + boundary + '\r\nContent-Type: ' + BACKUP_MIME + '\r\n\r\n' +
    text + '\r\n' +
    '--' + boundary + '--';
  const url = API_ORIGIN + '/upload/drive/v3/files?' + q({
    uploadType: 'multipart',
    fields: FILE_FIELDS
  });
  const res = await call(url, {
    method: 'POST',
    headers: { 'Content-Type': 'multipart/related; boundary=' + boundary },
    body
  });
  return res.json();
}

/**
 * Replace the file's contents. Same id every time — that is the
 * whole design, and it is what makes Drive's revision list the
 * version history.
 *
 * `fields` asks for headRevisionId back, so the caller learns the
 * revision it just created without a second round trip. Learning
 * it matters: it is the thing the next push compares against.
 */
export async function uploadBackup(fileId, text) {
  const url = API_ORIGIN + '/upload/drive/v3/files/' + encodeURIComponent(fileId) + '?' + q({
    uploadType: 'media',
    fields: FILE_FIELDS
  });
  const res = await call(url, {
    method: 'PATCH',
    headers: { 'Content-Type': BACKUP_MIME },
    body: text
  });
  return res.json();
}

/** Metadata only — in particular `headRevisionId`, cheaply. */
export async function readMeta(fileId) {
  const url = API_ORIGIN + '/drive/v3/files/' + encodeURIComponent(fileId) + '?' +
              q({ fields: FILE_FIELDS });
  const res = await call(url, { method: 'GET' });
  return res.json();
}

/** The file's contents, as text. */
export async function downloadBackup(fileId) {
  const url = API_ORIGIN + '/drive/v3/files/' + encodeURIComponent(fileId) + '?' + q({ alt: 'media' });
  const res = await call(url, { method: 'GET' });
  return res.text();
}

/** Earlier versions Drive is keeping, newest first. */
export async function listRevisions(fileId) {
  const url = API_ORIGIN + '/drive/v3/files/' + encodeURIComponent(fileId) + '/revisions?' + q({
    fields: 'revisions(id,modifiedTime,size,keepForever)',
    pageSize: 200
  });
  const res = await call(url, { method: 'GET' });
  const body = await res.json();
  const rows = (body && body.revisions) || [];
  return rows.slice().reverse();  // Drive returns oldest first
}

/** One earlier version's contents, as text. */
export async function downloadRevision(fileId, revisionId) {
  const url = API_ORIGIN + '/drive/v3/files/' + encodeURIComponent(fileId) +
              '/revisions/' + encodeURIComponent(revisionId) + '?' + q({ alt: 'media' });
  const res = await call(url, { method: 'GET' });
  return res.text();
}

export default {
  DRIVE_SCOPE, API_ORIGIN, IDENTITY_ORIGIN, GIS_SRC,
  BACKUP_FILE_NAME, BACKUP_MIME, CLIENT_ID,
  isConfigured, hasToken, forgetToken, getToken,
  findBackupFile, createBackupFile, uploadBackup,
  readMeta, downloadBackup, listRevisions, downloadRevision,
  __setFetch
};
