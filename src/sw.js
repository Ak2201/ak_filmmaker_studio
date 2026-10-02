/* ============================================================
   SERVICE WORKER — the offline promise, kept
   ------------------------------------------------------------
   Built by vite-plugin-pwa in `injectManifest` mode: the build
   replaces self.__WB_MANIFEST below with the REAL output
   filenames (content-hashed chunks, all four HTML pages, the
   manifest and the icons). Nothing here is hand-maintained, so
   nothing here can go stale when a chunk name changes.

   Three rules, in order of how often they matter:

     1. Supabase is never cached. Not the REST calls, not the
        realtime socket, not the auth endpoints. A cached
        authentication response is a security bug, and a cached
        row is worse than no row — it is a lie about what the
        collaborator last wrote. Those requests go straight to
        the network and the worker gets out of the way.

     2. Static assets are cache-first. Every JS/CSS/font URL the
        build emits carries a content hash, so a cached response
        can never be wrong: a changed file is a changed URL.

     3. HTML is stale-while-revalidate. The pages are shells; a
        one-load-old shell that paints instantly is a better
        trade than a blank screen on a slow train, and the fresh
        copy is in the cache before the reader scrolls.

   Cache names carry a digest of the precache manifest, so a new
   build lands in new caches and `activate` deletes the old ones.
   ============================================================ */

const MANIFEST = self.__WB_MANIFEST || [];

/** Small, stable string digest — enough to name a cache. */
function digest(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

/* The CSP a worker runs under is captured when it INSTALLS, from the
   headers of the response that delivered this script. It is not re-read
   afterwards. So a header-only change — one to vercel.json / netlify.toml
   with no source change — reaches nobody already carrying a worker: this
   file's bytes are identical, the browser's update check installs nothing,
   and the old policy stays enforced indefinitely.

   That is not hypothetical. connect-src gained the two Google Fonts hosts
   on 2026-10-01, because this worker intercepts those hosts on purpose
   (isFontHost -> cacheFirst) and a worker's own fetch() is a connect-src
   operation. The header went live and changed nothing for existing
   visitors: the font fetch was still refused, cacheFirst still had nothing
   cached, still rethrew, and the studio still rendered in fallback serif.
   Measured: 0 font entries in the runtime cache before, 5 after, and the
   display faces collapsing onto the width of a nonexistent font.

   Folding the epoch into BUILD fixes both halves. It changes this script's
   bytes, so every client installs a fresh worker that re-reads the header,
   and it rotates the cache names, so activate() sweeps whatever the old
   policy managed to cache. Bump it whenever the CSP changes. */
const CSP_EPOCH = '2026-10-01-fonts';

const BUILD    = digest(CSP_EPOCH + JSON.stringify(MANIFEST));
const PRECACHE = `studio-precache-${BUILD}`;
const RUNTIME  = `studio-runtime-${BUILD}`;
const KEEP     = new Set([PRECACHE, RUNTIME]);

const SCOPE = self.registration.scope;

/* The arunak-*.html entries are redirect stubs for the URLs the app
   shipped under in 2023; vercel.json answers them with a permanent
   301 to the page that replaced them. Precaching a URL whose entire
   job is to redirect stores a redirect, and nothing in the app ever
   navigates to one — they exist for an old bookmark, which the
   network handles fine. They are also the only manifest entries that
   redirect for a REASON rather than as a side effect of cleanUrls. */
const IS_REDIRECT_STUB = /(^|\/)arunak-[^/]*\.html$/;
const PRECACHE_URLS = [...new Set(
  MANIFEST
    .map(e => e.url)
    .filter(u => !IS_REDIRECT_STUB.test(u))
    .map(u => new URL(u, SCOPE).href)
)];
const SHELL = new URL('index.html', SCOPE).href;

/** Hosts whose responses must never enter a cache. */
function isNeverCached(url) {
  return /(^|\.)supabase\.(co|in|com|net)$/i.test(url.hostname);
}

/** Google Fonts: the stylesheet and the woff2 files it points at. */
function isFontHost(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
}

/* ------------------------------------------------------------
   A response with the redirect taint removed.

   A navigation answered by a service worker MUST NOT be given a
   response that was itself redirected. Chrome rejects it — "a
   redirected response was used for a request whose redirect mode is
   not 'follow'" — and the address bar shows ERR_FAILED. The server is
   fine, the page is fine, and the URL works in curl, which is what
   makes this one so hard to place.

   It bit here because vercel.json sets cleanUrls, so 21 of the 68
   precached URLs answer /page.html with a 308 to /page — every HTML
   page, index.html among them. fetch() follows that happily and
   Cache.put stores the result without complaining (both were checked
   against the real host; neither throws), so the poison goes in
   quietly at install and only surfaces on the next navigation to a
   .html URL. /dashboard worked the whole time; /dashboard.html did
   not.

   Rebuilding the response drops the redirected flag and keeps the
   status and the headers. Done on the way INTO the cache, so one
   rebuild serves every later read.
   ------------------------------------------------------------ */
async function clean(response) {
  if (!response || !response.redirected) return response;
  return new Response(await response.blob(), {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

/* A cached response that is redirected cannot be handed to a
   navigation, and a browser that ran an earlier build already has
   some. Treat one as a miss AND delete it, so an affected browser
   heals on its next load instead of needing the user to clear site
   data — which is not an instruction you can give someone who is
   just trying to open a page. */
async function matchUsable(request) {
  const hit = await caches.match(request, { ignoreSearch: true });
  if (!hit || !hit.redirected) return hit || undefined;
  const names = await caches.keys();
  await Promise.all(names.map(
    (n) => caches.open(n).then(c => c.delete(request, { ignoreSearch: true })).catch(() => {})
  ));
  return undefined;
}

function isHTML(request) {
  if (request.mode === 'navigate') return true;
  const accept = request.headers.get('accept') || '';
  return accept.includes('text/html');
}

// ------------------------------------------------------------
// INSTALL — fill the precache, then take over immediately.
// addAll() is atomic: one 404 and the whole install fails, which
// is the behaviour we want (a half-populated precache would fail
// later, offline, where it cannot be diagnosed).
// ------------------------------------------------------------
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(PRECACHE)
      .then(precacheAll)
      .then(() => self.skipWaiting())
  );
});

/* addAll() was atomic — one 404 failed the whole install, which is
   the behaviour we want, because a half-populated precache fails
   later, offline, where it cannot be diagnosed. Promise.all keeps
   that: it rejects on the first failure. What it adds is clean(),
   which addAll cannot do, because addAll puts the redirected
   response straight into the cache. */
async function precacheAll(cache) {
  await Promise.all(PRECACHE_URLS.map(async (url) => {
    const response = await fetch(url, { cache: 'reload' });
    if (!response.ok) throw new Error('precache ' + url + ': ' + response.status);
    await cache.put(url, await clean(response));
  }));
}

// ------------------------------------------------------------
// ACTIVATE — drop every cache from an earlier build.
// ------------------------------------------------------------
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.has(k)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// ------------------------------------------------------------
// FETCH
// ------------------------------------------------------------
self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try { url = new URL(request.url); } catch (e) { return; }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return;

  // 1. Supabase — hands off entirely.
  if (isNeverCached(url)) return;

  const sameOrigin = url.origin === self.location.origin;

  // 3. HTML — stale-while-revalidate.
  if (sameOrigin && isHTML(request)) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // 2. Static assets — cache-first (same-origin, plus the fonts).
  if (sameOrigin || isFontHost(url)) {
    event.respondWith(cacheFirst(request));
  }
});

async function staleWhileRevalidate(request) {
  const cache  = await caches.open(RUNTIME);
  const cached = await matchUsable(request);

  const network = fetch(request)
    .then((response) => {
      /* type 'basic' is true of a FOLLOWED redirect too, so this
         guard never caught the redirected copy — clean() is what
         does. */
      if (response && response.ok && response.type === 'basic') {
        clean(response.clone())
          .then(c => cache.put(request, c))
          .catch(() => {});
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;

  // Offline, and this exact page was never cached: the shell will do.
  /* The shell is index.html, which cleanUrls redirects to "/" — so the
     offline fallback was a redirected response too, and failed the
     same way the page it was standing in for did. */
  const shell = await matchUsable(new Request(SHELL));
  if (shell) return shell;
  return new Response('Offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached && !cached.redirected) return cached;
  try {
    const response = await fetch(request);
    // `opaque` is a cross-origin font we asked for by <link> — cacheable
    // even though we cannot read its status.
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(RUNTIME);
      clean(response.clone())
        .then(c => cache.put(request, c))
        .catch(() => {});
    }
    return response;
  } catch (e) {
    const any = await caches.match(request, { ignoreSearch: true });
    if (any) return any;
    throw e;
  }
}

// Allows a future "update available → reload" affordance without
// shipping a second worker.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});
