/* ============================================================
   FILMMAKER STUDIO — the extension's service worker (PRD 2.0 §4.2, §4.3)
   ------------------------------------------------------------
   Four jobs, and nothing else:

     FR-204  the heartbeat. A chrome.alarms ping every 30 seconds to
             session_ping(). On 'conflict' (the PRD's 409: another
             device took the session) or P0401 (the 401: the invite was
             revoked), it clears chrome.storage.session — the only place
             the credentials ever were — and tells every open page.
     FR-205  the release. When the last browser window closes, it frees
             the lock at once rather than leaving it for the server's
             90-second cutoff.
     FR-302  the clipper. "Send to Filmmaker Studio" on any text
             selection queues the snippet, its URL and the page title in
             chrome.storage.local; the app drains that queue into the
             open project's Idea Vault the next time a page loads (or at
             once, if one is open). A clipping is not a credential, which
             is why .local is allowed for it and nothing else.
     FR-301  the side panel opens on the toolbar button.

   WHY A PLAIN FILE AND NOT A BUNDLED MODULE. A service worker may not
   use top-level await, wakes cold on every alarm, and needs none of the
   app. It reads the Supabase session exactly as supabase-js wrote it
   into chrome.storage.session (the key `sb-<ref>-auth-token`), refreshes
   an expired access token itself — an hour-old token with no app page
   open to refresh it is not a revoked session — and writes the refreshed
   session back in the same format, so the pages pick it up.

   Config (project URL and publishable key) comes from ext-config.json,
   written by scripts/build-extension.mjs from .env. Both values are
   public; RLS is what guards the database.
   ============================================================ */

const ALARM = 'fms-heartbeat';
const MENU = 'fms-clip';
const CLIP_QUEUE_KEY = 'fms_clip_queue';
const SESSION_ID_KEY = 'fms_session_id';

let cfgPromise = null;
function config() {
  if (!cfgPromise) {
    cfgPromise = fetch(chrome.runtime.getURL('extension/ext-config.json'))
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
  }
  return cfgPromise;
}
const authKey = (cfg) => `sb-${cfg.ref}-auth-token`;

/* ---- install / startup ------------------------------------------ */

function setup() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({ id: MENU, title: 'Send to __NAME__', contexts: ['selection'] });
  });
  // 0.5 minutes is the shortest period Chrome allows an alarm (since
  // Chrome 120), and exactly the PRD's 30-second cadence.
  chrome.alarms.create(ALARM, { periodInMinutes: 0.5 });
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }
}
chrome.runtime.onInstalled.addListener(setup);
chrome.runtime.onStartup.addListener(setup);

/* ---- FR-302: the clipper ----------------------------------------- */

async function queueClip(info, tab) {
  const snippet = String((info && info.selectionText) || '').trim();
  if (!snippet) return null;
  const clip = {
    id: crypto.randomUUID(),
    snippet: snippet.slice(0, 4000),
    url: String((tab && tab.url) || (info && info.pageUrl) || '').slice(0, 2000),
    title: String((tab && tab.title) || '').slice(0, 300),
    at: Date.now()
  };
  const got = await chrome.storage.local.get(CLIP_QUEUE_KEY);
  const queue = Array.isArray(got[CLIP_QUEUE_KEY]) ? got[CLIP_QUEUE_KEY] : [];
  queue.push(clip);
  await chrome.storage.local.set({ [CLIP_QUEUE_KEY]: queue.slice(-500) });
  chrome.action.setBadgeText({ text: String(Math.min(queue.length, 99)) }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'fms-clip-queued' }).catch(() => { /* no page open: drained on next load */ });
  return clip;
}
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU) queueClip(info, tab);
});
// The badge counts what is waiting; once a page drains the queue it goes.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[CLIP_QUEUE_KEY]) {
    const n = (changes[CLIP_QUEUE_KEY].newValue || []).length;
    chrome.action.setBadgeText({ text: n ? String(Math.min(n, 99)) : '' }).catch(() => {});
  }
});

/* ---- the session, as supabase-js stored it ----------------------- */

async function readSession(cfg) {
  const raw = (await chrome.storage.session.get(authKey(cfg)))[authKey(cfg)];
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch (e) { return null; }
}

async function refresh(cfg, sess) {
  const r = await fetch(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: { apikey: cfg.key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: sess.refresh_token })
  });
  if (!r.ok) return null;
  const next = await r.json();
  if (!next || !next.access_token) return null;
  if (!next.expires_at && next.expires_in) next.expires_at = Math.floor(Date.now() / 1000) + next.expires_in;
  await chrome.storage.session.set({ [authKey(cfg)]: JSON.stringify(next) });
  return next;
}

async function rpc(cfg, sess, name, args) {
  return fetch(`${cfg.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: cfg.key, Authorization: `Bearer ${sess.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {})
  });
}

/* ---- FR-204: the heartbeat --------------------------------------- */

async function lost(reason) {
  // The PRD's instruction, literally: clear session storage and route
  // to the gatekeeper. The CREDENTIALS go; the user's work, which lives
  // in the extension's localStorage like the website's, does not.
  await chrome.storage.session.clear();
  chrome.action.setBadgeText({ text: '!' }).catch(() => {});
  chrome.runtime.sendMessage({ type: 'fms-session-lost', reason }).catch(() => {});
}

async function heartbeat() {
  const cfg = await config();
  if (!cfg) return 'noconfig';
  let sess = await readSession(cfg);
  const sid = (await chrome.storage.session.get(SESSION_ID_KEY))[SESSION_ID_KEY];
  if (!sess || !sid) return 'signedout';
  if (sess.expires_at && sess.expires_at * 1000 < Date.now() + 60e3) {
    sess = await refresh(cfg, sess);
    if (!sess) { await lost('expired'); return 'expired'; }
  }
  let r;
  try { r = await rpc(cfg, sess, 'session_ping', { p_session: sid }); }
  catch (e) { return 'offline'; }   // a dropped connection is not a lost lock
  if (r.status === 401) {
    sess = await refresh(cfg, sess);
    if (!sess) { await lost('expired'); return 'expired'; }
    r = await rpc(cfg, sess, 'session_ping', { p_session: sid });
  }
  let body = null;
  try { body = await r.json(); } catch (e) { body = null; }
  if (!r.ok) {
    const code = body && body.code;
    if (code === 'PGRST202' || code === '42883') return 'notdeployed';   // section 13 not run: nothing to keep
    if (code === 'P0401') { await lost('revoked'); return 'revoked'; }
    return 'error';
  }
  const status = Array.isArray(body) ? body[0] && body[0].status : body && body.status;
  if (status === 'conflict') { await lost('conflict'); return 'conflict'; }
  return 'ok';
}
chrome.alarms.onAlarm.addListener((a) => { if (a.name === ALARM) heartbeat(); });

/* ---- FR-205: the release ----------------------------------------- */

async function release() {
  const cfg = await config();
  if (!cfg) return;
  const sess = await readSession(cfg);
  const sid = (await chrome.storage.session.get(SESSION_ID_KEY))[SESSION_ID_KEY];
  if (!sess || !sid) return;
  try { await rpc(cfg, sess, 'session_release', { p_session: sid }); } catch (e) { /* the 90s cutoff covers it */ }
}
async function releaseIfLastWindow() {
  const wins = await chrome.windows.getAll();
  if (!wins.length) await release();
}
chrome.windows.onRemoved.addListener(() => { releaseIfLastWindow(); });
/* onSuspend fires whenever Chrome idles this worker, which with a
   30-second alarm is often. Releasing every time would free the lock
   while the user is still writing, so it releases only when there is
   no window left for the user to be writing in. */
chrome.runtime.onSuspend.addListener(() => { releaseIfLastWindow(); });

// Exposed for the extension's own test harness (scripts/prove-extension.mjs),
// which drives these without a real right-click or a 30-second wait.
self.__fms = { heartbeat, queueClip, release, setup };
