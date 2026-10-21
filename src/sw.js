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
/* 2026-10-14: the fonts are self-hosted and the CSP dropped both
   Google Fonts hosts, so the epoch moves again — a worker still carrying
   the old policy would keep a runtime cache of Google font files. */
const CSP_EPOCH = '2026-10-14-self-hosted-fonts';

const BUILD    = digest(CSP_EPOCH + JSON.stringify(MANIFEST));
const PRECACHE = `studio-precache-${BUILD}`;
const RUNTIME  = `studio-runtime-${BUILD}`;
const PACK     = `studio-pack-${BUILD}`;     // the offline shoot pack, see FMS_PACK below
const KEEP     = new Set([PRECACHE, RUNTIME, PACK]);

const SCOPE = self.registration.scope;

/* The arunak-*.html entries are redirect stubs for the URLs the app
   shipped under in 2023; vercel.json answers them with a permanent
   301 to the page that replaced them. Precaching a URL whose entire
   job is to redirect stores a redirect, and nothing in the app ever
   navigates to one — they exist for an old bookmark, which the
   network handles fine. They are also the only manifest entries that
   redirect for a REASON rather than as a side effect of cleanUrls. */
const IS_REDIRECT_STUB = /(^|\/)arunak-[^/]*\.html$/;
/* 404.html is the host's dead-end page; caching it would let it stand in
   for a real page offline. */
const IS_NOT_FOUND = /(^|\/)404\.html$/;
const PRECACHE_URLS = [...new Set(
  MANIFEST
    .map(e => e.url)
    .filter(u => !IS_REDIRECT_STUB.test(u) && !IS_NOT_FOUND.test(u))
    .map(u => new URL(u, SCOPE).href)
)];
const SHELL = new URL('index.html', SCOPE).href;

/** Hosts whose responses must never enter a cache. */
function isNeverCached(url) {
  return /(^|\.)supabase\.(co|in|com|net)$/i.test(url.hostname);
}

/* No font host any more (14 Oct 2026): every face is a hashed asset on
   this origin, precached with the rest, so there is no third-party
   host this worker has to treat as static. */

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
/* EXCEPT AN OFFLINE SHOOT PACK THAT HAS NOT MOVED OVER YET.

   The pack's name carries BUILD like every other cache, so a deploy
   used to sweep it with the rest — and the pack is the only place the
   clean `/shoot` a bookmark holds is ever stored. One load with signal
   the morning after a deploy (skipWaiting: the new worker activates at
   once) and `/shoot` offline was the hub, the exact failure the pack
   exists to prevent, with nothing telling the crew.

   So activate RE-PACKS first: the pages an older pack holds (its
   typed `.html` keys) go through packPages() into this build's pack,
   fresh from the network, assets and clean address included. Only
   when every one of them made it is the old pack deleted. Activated
   without signal, the old pack is KEPT — stale bytes beat the hub —
   and the next same-origin navigation with signal tries again
   (carryPack below), so it does not wait for the next deploy.

   THE CARRY IS NOT IN ACTIVATE'S waitUntil. Every fetch the new
   worker handles waits until it is `activated`, so a carry inside
   activate held the first load after a deploy behind half a dozen
   sequential network fetches — and on weak signal, where requests hang
   rather than fail, behind nothing at all, for minutes, which is the
   on-set morning the pack exists for. Activate sweeps everything but
   the packs and claims; the carry runs after, joined by the next
   navigation's waitUntil, and each of its fetches gives up after
   CARRY_FETCH_MS. A timeout is "no signal": the old pack stays. */
const PACK_PREFIX = 'studio-pack-';
let packCarry = null;          // the in-flight carry, shared by activate and navigations
let packPending = true;        // until a carry finds no older pack (re-checked once per worker start)
const CARRY_FETCH_MS = 8000;   // one carry fetch on lie-fi: past this it is "no signal"

/** Move every older pack into PACK. Resolves with the names of the
    old packs that could NOT be moved (and so must be kept). */
function carryPack() {
  if (!packPending) return Promise.resolve(new Set());
  if (packCarry) return packCarry;
  packCarry = (async () => {
    const old = (await caches.keys()).filter((k) => k.startsWith(PACK_PREFIX) && k !== PACK);
    if (!old.length) { packPending = false; return new Set(); }
    const pages = new Set();
    for (const name of old) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) {
        const u = new URL(req.url);
        if (u.origin === self.location.origin && /\.html$/.test(u.pathname)) pages.add(u.href);
      }
    }
    /* packPages() THROWS when the network does (no signal): keep the
       old pack. A page the host answered with a non-ok status is gone
       from the site, and retrying it on every navigation would be a
       request loop for a page that will never come back, so that
       counts as moved. */
    /* A page that moved without every one of its files did not move:
       its old pack still has them, so keep it rather than delete the
       only copy of the script the page needs offline. */
    try {
      const results = pages.size ? await packPages([...pages], { timeout: CARRY_FETCH_MS }) : [];
      if (results.some((r) => r.ok && r.missing)) return new Set(old);
    } catch (e) { return new Set(old); }
    await Promise.all(old.map((n) => caches.delete(n)));
    packPending = false;
    return new Set();
  })().finally(() => { packCarry = null; });
  return packCarry;
}

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => !KEEP.has(k) && !k.startsWith(PACK_PREFIX)).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
      // Started, not awaited: the next navigation's waitUntil joins it (packCarry is shared).
      .then(() => { carryPack().catch(() => {}); })
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
    // An older shoot pack kept by an offline activate: move it now, with signal.
    if (packPending) event.waitUntil(carryPack().catch(() => {}));
    return;
  }

  // 2. Static assets — cache-first (same-origin; the fonts are too).
  if (sameOrigin) {
    event.respondWith(cacheFirst(request));
  }
});

/* A page is cached under its PATH, never its query. The shell is the same
   bytes whatever follows the `?` (pages read the query from location), and
   the query is where the bearer strings travel: `?share=<token>`, an
   invite `?code=`, and Supabase's OAuth `?code=` on the sign-in return.
   Keyed by the full URL they sat in Cache Storage indefinitely. Lookups
   already ignore the query (matchUsable), so nothing else changes. */
function pageKey(request) {
  const u = new URL(request.url);
  return u.origin + u.pathname;
}

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
          .then(c => cache.put(pageKey(request), c))
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
  if (event.data && event.data.type === 'FMS_PACK') {
    const port = event.ports && event.ports[0];
    event.waitUntil(
      packPages(event.data.urls)
        .then((results) => { if (port) port.postMessage({ ok: true, results }); })
        .catch((e) => { if (port) port.postMessage({ ok: false, error: String(e && e.message || e) }); })
    );
  }
});

/* ------------------------------------------------------------
   THE OFFLINE SHOOT PACK (src/lib/pwa.js makeOffline)
   ------------------------------------------------------------
   For each same-origin page: the page under its typed `.html` address
   AND its clean address (cleanUrls answers `/shoot.html` with a 308 to
   `/shoot`, and the clean one is what a bookmark holds — the precache
   never has it, so offline it fell back to the hub), plus every file
   the page's HTML names. Each response goes through clean() on the way
   in, so nothing redirected is ever stored — the trap that shipped a
   broken page once. The clean address is stored only when the host
   served THE SAME page there: a host without cleanUrls may answer
   `/shoot` with a 404 or with the hub, and keeping either under that
   name would be a lie the next offline morning.
   ------------------------------------------------------------ */
const PACK_ASSET = /\b(?:src|href)="([^"]+\.(?:js|css|json|woff2|svg|png|webmanifest))"/g;

/* fetch(), or — given a timeout — fetch() that rejects once `ms` pass,
   aborting the request too. Raced as well as aborted, so a request that
   ignores the signal still cannot hold the caller. */
function fetchWithin(input, init, ms) {
  if (!ms) return fetch(input, init);
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  let timer;
  const late = new Promise((_, reject) => {
    timer = setTimeout(() => { if (ctl) ctl.abort(); reject(new TypeError('timed out: ' + input)); }, ms);
  });
  return Promise.race([fetch(input, Object.assign({}, init, ctl ? { signal: ctl.signal } : {})), late])
    .finally(() => clearTimeout(timer));
}

async function packPages(urls, opts = {}) {
  const ms = opts.timeout || 0;
  const cache = await caches.open(PACK);
  const precache = await caches.open(PRECACHE);
  const out = [];
  for (const raw of [].concat(urls || [])) {
    let url;
    try { url = new URL(raw, SCOPE); } catch (e) { continue; }
    if (url.origin !== self.location.origin || !/\.html$/.test(url.pathname)) continue;
    const typed = url.href;
    const res = await fetchWithin(typed, { cache: 'reload' }, ms);
    if (!res.ok) { out.push({ url: typed, ok: false }); continue; }
    const body = await res.clone().text();
    await cache.put(typed, await clean(res));

    const cleanUrl = typed.replace(/\.html$/, '');
    let cleanOk = false;
    try {
      const alt = await fetchWithin(cleanUrl, { cache: 'reload' }, ms);
      if (alt.ok && (await alt.clone().text()) === body) {
        await cache.put(cleanUrl, await clean(alt));
        cleanOk = true;
      }
    } catch (e) { /* the typed address is enough */ }

    const assets = [...new Set([...body.matchAll(PACK_ASSET)].map((m) => new URL(m[1], typed).href))]
      .filter((a) => new URL(a).origin === self.location.origin);
    let files = 1, missing = 0;
    await Promise.all(assets.map(async (a) => {
      /* Held by this build's precache or pack: enough. Held anywhere
         else (an older pack, which the carry is about to delete): copy
         it in, or the delete takes the only offline copy with it. */
      if (await precache.match(a) || await cache.match(a)) { files++; return; }
      const have = await caches.match(a);
      if (have && !have.redirected) { await cache.put(a, await clean(have)); files++; return; }
      const r = await fetchWithin(a, undefined, ms).catch(() => null);
      /* Only a request that never answered is missing; a file the host
         no longer serves is gone, and waiting for it would retry forever. */
      if (r && r.ok) { await cache.put(a, await clean(r)); files++; } else if (!r) missing++;
    }));
    out.push({ url: typed, ok: true, clean: cleanOk, files, missing });
  }
  return out;
}
