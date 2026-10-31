/* ============================================================
   THE GOOGLE PICKER — how a teammate opens a shared folder
   ------------------------------------------------------------
   Under drive.file the app sees only files it created and files the
   user PICKED. A folder shared with a teammate is invisible to the
   studio until they pick it once here (drive-project-sync openShared).
   When picking the folder does not unlock its files (the spike's Q1
   answered "no"), the same Picker is opened a second time on the
   folder's contents with multiselect: Fallback A.

   Loaded lazily, and only on a click: https://apis.google.com/js/api.js
   (script-src) draws an iframe from https://docs.google.com
   (frame-src); both are in the CSP of vercel.json AND netlify.toml.

   Build settings, both public: VITE_GOOGLE_API_KEY (restricted to the
   Picker and Drive APIs by HTTP referrer) and VITE_GOOGLE_APP_ID (the
   Cloud project number). Without the key the Picker cannot open, and
   the caller says so.

   `window.__fmsPicker` is a PROOF hook (scripts/prove-drive-only.mjs
   stands in for Google's iframe), like plan-gate's __fmsKeepWall.
   Nothing in the app sets it.
   ============================================================ */
export const PICKER_SRC = 'https://apis.google.com/js/api.js';
const env = (typeof import.meta !== 'undefined' && import.meta.env) || {};
const API_KEY = String(env.VITE_GOOGLE_API_KEY || '').trim();
const APP_ID = String(env.VITE_GOOGLE_APP_ID || '').trim();
export const pickerConfigured = () => !!API_KEY;

let _load = null;
function loadPicker() {
  if (_load) return _load;
  _load = new Promise((resolve, reject) => {
    const done = () => window.gapi.load('picker', { callback: () => resolve(window.google), onerror: () => reject(new Error('The Google Picker did not load.')) });
    if (window.gapi && window.gapi.load) { done(); return; }
    const s = document.createElement('script');
    s.src = PICKER_SRC; s.async = true;
    s.onload = done;
    s.onerror = () => { _load = null; reject(new Error('Could not load the Google Picker. script-src must allow ' + PICKER_SRC + '.')); };
    document.head.append(s);
  });
  return _load;
}

/**
 * @param {{ token: string, folderId: string, kind: 'folder'|'files' }} o
 * @returns {Promise<string[]>} the picked ids ([] when cancelled)
 */
export async function pick(o) {
  if (typeof window !== 'undefined' && typeof window.__fmsPicker === 'function') return window.__fmsPicker({ folderId: o.folderId, kind: o.kind });
  if (!API_KEY) throw new Error('This build has no Google API key (VITE_GOOGLE_API_KEY), so a shared folder cannot be opened here.');
  const google = await loadPicker();
  const P = google.picker;
  return new Promise((resolve) => {
    let view;
    if (o.kind === 'folder') {
      view = new P.DocsView(P.ViewId.FOLDERS).setSelectFolderEnabled(true).setIncludeFolders(true)
        .setOwnedByMe(false).setMimeTypes('application/vnd.google-apps.folder');
      if (o.folderId && typeof view.setFileIds === 'function') view.setFileIds(o.folderId);
    } else {
      view = new P.DocsView().setParent(o.folderId).setIncludeFolders(true).setSelectFolderEnabled(false);
    }
    const b = new P.PickerBuilder().setOAuthToken(o.token).setDeveloperKey(API_KEY).addView(view)
      .setTitle(o.kind === 'folder' ? 'Pick the film’s folder' : 'Select all (Ctrl/⌘+A), then Select')
      .setCallback((d) => {
        if (d.action === P.Action.PICKED) resolve((d.docs || []).map((x) => x.id));
        else if (d.action === P.Action.CANCEL) resolve([]);
      });
    if (APP_ID) b.setAppId(APP_ID);
    if (o.kind === 'files') b.enableFeature(P.Feature.MULTISELECT_ENABLED);
    b.build().setVisible(true);
  });
}

export default { pick, pickerConfigured, PICKER_SRC };
