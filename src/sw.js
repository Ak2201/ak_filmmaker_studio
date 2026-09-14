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

const BUILD    = digest(JSON.stringify(MANIFEST));
const PRECACHE = `studio-precache-${BUILD}`;
const RUNTIME  = `studio-runtime-${BUILD}`;
const KEEP     = new Set([PRECACHE, RUNTIME]);

const SCOPE = self.registration.scope;
const PRECACHE_URLS = [...new Set(MANIFEST.map(e => new URL(e.url, SCOPE).href))];
const SHELL = new URL('index.html', SCOPE).href;

/** Hosts whose responses must never enter a cache. */
function isNeverCached(url) {
  return /(^|\.)supabase\.(co|in|com|net)$/i.test(url.hostname);
}

/** Google Fonts: the stylesheet and the woff2 files it points at. */
function isFontHost(url) {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com';
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
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

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
  const cached = (await caches.match(request, { ignoreSearch: true })) || undefined;

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok && response.type === 'basic') {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => undefined);

  if (cached) return cached;
  const fresh = await network;
  if (fresh) return fresh;

  // Offline, and this exact page was never cached: the shell will do.
  const shell = await caches.match(SHELL, { ignoreSearch: true });
  if (shell) return shell;
  return new Response('Offline.', { status: 503, headers: { 'Content-Type': 'text/plain' } });
}

async function cacheFirst(request) {
  const cached = await caches.match(request, { ignoreSearch: false });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    // `opaque` is a cross-origin font we asked for by <link> — cacheable
    // even though we cannot read its status.
    if (response && (response.ok || response.type === 'opaque')) {
      const cache = await caches.open(RUNTIME);
      cache.put(request, response.clone());
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
