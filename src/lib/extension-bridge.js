/* ============================================================
   EXTENSION BRIDGE — the app's half of the Chrome extension
   ------------------------------------------------------------
   The extension (extension/ at the repo root) packages this same
   build and opens its pages in the side panel and in tabs, so on
   those pages `chrome.storage` and `chrome.runtime` exist. On the
   website they do not, and every function here is a no-op there.

   CLIPPINGS. The context-menu "Send to Filmmaker Studio" runs in the
   extension's service worker, which has no localStorage and no idea
   which project is open. So it appends to a QUEUE in
   chrome.storage.local and pings any open page; the page drains the
   queue into the open project's Idea Vault through story.js. A clip
   carries its own id, and addToVault() ignores an id it has already
   stored, so a page that drains, crashes and drains again does not
   double anything.

   A clipping is not a credential, which is why chrome.storage.local
   is allowed for it. The session token is the one thing PRD FR-202
   forbids there, and nothing in this file touches it.
   ============================================================ */
import { addToVault } from './story.js';

export const CLIP_QUEUE_KEY = 'fms_clip_queue';

const ext = () => {
  const c = globalThis.chrome;
  return c && c.runtime && c.runtime.id && c.storage && c.storage.local ? c : null;
};

export const inExtension = () => !!ext();

/** Move queued clips into the open project's Idea Vault. Resolves to
 *  the number stored. The queue is only cleared of the clips that were
 *  read, so a clip that arrives mid-drain survives to the next one. */
export async function drainClipQueue() {
  const c = ext();
  if (!c) return 0;
  try {
    const got = await c.storage.local.get(CLIP_QUEUE_KEY);
    const queue = Array.isArray(got[CLIP_QUEUE_KEY]) ? got[CLIP_QUEUE_KEY] : [];
    if (!queue.length) return 0;
    let n = 0;
    for (const clip of queue) if (addToVault(clip)) n++;
    const after = await c.storage.local.get(CLIP_QUEUE_KEY);
    const ids = new Set(queue.map((q) => q.id));
    const rest = (after[CLIP_QUEUE_KEY] || []).filter((q) => !ids.has(q.id));
    await c.storage.local.set({ [CLIP_QUEUE_KEY]: rest });
    return n;
  } catch (e) {
    console.warn('[extension] clip queue', e);
    return 0;
  }
}

/** Call `cb` whenever the service worker says a clip was queued. */
export function onClipQueued(cb) {
  const c = ext();
  if (!c || !c.runtime.onMessage) return () => {};
  const fn = (msg) => { if (msg && msg.type === 'fms-clip-queued') cb(); };
  c.runtime.onMessage.addListener(fn);
  return () => c.runtime.onMessage.removeListener(fn);
}

/* ---- FR-202: credentials live in chrome.storage.session -------------
   supabase-js accepts any storage with getItem/setItem/removeItem, sync
   or async. Inside the extension cloud.js hands it THIS one, so the
   Supabase session (access token, refresh token, user) is kept in
   chrome.storage.session — in memory, shared by the extension's pages
   and its service worker, gone when the browser is fully closed — and
   never in localStorage or chrome.storage.local. That one substitution
   is what PRD FR-202's "browser lifecycle binding" comes down to. */
export function sessionStorageAdapter() {
  const c = ext();
  if (!c || !c.storage.session) return null;
  return {
    async getItem(key) { const r = await c.storage.session.get(key); return r[key] ?? null; },
    async setItem(key, value) { await c.storage.session.set({ [key]: value }); },
    async removeItem(key) { await c.storage.session.remove(key); }
  };
}

/** gate.js's holder for the extension: the pre-auth ticket and the lock
 *  handle, both in chrome.storage.session. */
export function gateHolder() {
  const c = ext();
  if (!c || !c.storage.session) return null;
  const S = c.storage.session;
  return {
    async getTicket() { return (await S.get('fms_preauth_ticket')).fms_preauth_ticket || null; },
    async setTicket(t) { if (t) await S.set({ fms_preauth_ticket: t }); else await S.remove('fms_preauth_ticket'); },
    async getSessionId() {
      let id = (await S.get('fms_session_id')).fms_session_id;
      if (!id) { id = crypto.randomUUID(); await S.set({ fms_session_id: id }); }
      return id;
    },
    async rotateSessionId() { const id = crypto.randomUUID(); await S.set({ fms_session_id: id }); return id; }
  };
}

/* ---- FR-201: Google sign-in through chrome.identity ----------------
   An extension page cannot complete Supabase's redirect flow — Google
   would send the browser to a chrome-extension:// URL. launchWebAuthFlow
   opens the consent window itself and hands back the final redirect,
   https://<extension-id>.chromiumapp.org/#access_token=…, which must be
   on the Supabase project's Redirect URLs list (docs/EXTENSION.md). */
export function extensionRedirectUrl() {
  const c = ext();
  return c && c.identity ? c.identity.getRedirectURL() : '';
}

export async function extensionGoogleTokens(supabaseUrl, scopes) {
  const c = ext();
  if (!c || !c.identity) throw new Error('chrome.identity is not available here.');
  const redirect = c.identity.getRedirectURL();
  const url = new URL(supabaseUrl.replace(/\/$/, '') + '/auth/v1/authorize');
  url.searchParams.set('provider', 'google');
  url.searchParams.set('redirect_to', redirect);
  if (scopes) url.searchParams.set('scopes', scopes);
  url.searchParams.set('prompt', 'select_account');
  const back = await c.identity.launchWebAuthFlow({ url: url.toString(), interactive: true });
  const hash = new URLSearchParams(String(back || '').split('#')[1] || '');
  const query = new URL(back).searchParams;
  const err = hash.get('error_description') || query.get('error_description') || hash.get('error') || query.get('error');
  if (err) throw new Error('Google sign-in did not complete: ' + err);
  const access_token = hash.get('access_token');
  const refresh_token = hash.get('refresh_token');
  if (!access_token || !refresh_token) throw new Error('Google sign-in returned no session. Check the extension redirect URL is allowed in Supabase.');
  return { access_token, refresh_token };
}

/** Call `cb(reason)` when the service worker has cleared the session
 *  (another device took it over, the invite was revoked, or the token
 *  could not be refreshed). */
export function onSessionLost(cb) {
  const c = ext();
  if (!c || !c.runtime.onMessage) return () => {};
  const fn = (msg) => { if (msg && msg.type === 'fms-session-lost') cb(msg.reason || ''); };
  c.runtime.onMessage.addListener(fn);
  return () => c.runtime.onMessage.removeListener(fn);
}
