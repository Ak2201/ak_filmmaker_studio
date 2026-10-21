/* ============================================================
   THE OFFLINE SHOOT PACK SURVIVES A DEPLOY — src/sw.js, in Node
   ------------------------------------------------------------
   prove:sw opens the worker in a real browser and proves the pack
   works on the build that made it. It cannot see the NEXT build: a
   deploy changes BUILD, BUILD names the caches, and activate() sweeps
   every name it does not KEEP — the pack included. The pack is the
   only place the clean `/shoot` (the address a bookmark holds) is ever
   stored, so after one load with signal on the morning after a deploy,
   `/shoot` offline fell back to the hub: exactly the failure the pack
   exists to prevent, with nothing telling the crew.

   This runs the worker's own source twice (build A, then build B) in a
   vm against an in-memory Cache Storage and a fake network, and asserts:

     · build A's pack holds /shoot.html and the clean /shoot;
     · after build B installs and activates (online), /shoot OFFLINE is
       still the shoot day, not the hub, and it was re-fetched from the
       network (the new build's copy), not merely the old bytes kept;
     · the old build's caches are gone once the pack moved over;
     · if build B activates OFFLINE, the pack is not lost: the old one is
       kept until a later activate can move it;
     · activate does NOT wait on the carry: on lie-fi (requests that
       hang rather than fail) activate still finishes at once, the carry
       times out, and the old pack is kept for a later try;
     · nothing in any cache is `redirected: true` (clean() still guards
       every put — the redirected-response trap).

       node scripts/test-sw-pack.mjs   (or: npm run test:sw-pack)
   ============================================================ */
import fs from 'node:fs';
import vm from 'node:vm';

const SRC = fs.readFileSync(new URL('../src/sw.js', import.meta.url), 'utf8');
const ORIGIN = 'https://studio.test';
const SCOPE = ORIGIN + '/';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + msg); } };

/* ---- an in-memory Cache Storage --------------------------------- */
const keyOf = (req, ignoreSearch) => {
  const u = new URL(typeof req === 'string' ? req : req.url);
  if (ignoreSearch) u.search = '';
  return u.href;
};
class FakeCache {
  constructor() { this.map = new Map(); }
  async put(req, res) { this.map.set(keyOf(req), { body: await res.clone().text(), status: res.status, redirected: res.redirected, type: res.headers.get('content-type') || '' }); }
  async match(req, opts = {}) {
    const want = keyOf(req, opts.ignoreSearch);
    for (const [k, v] of this.map) if (keyOf(k, opts.ignoreSearch) === want) return mk(v);
    return undefined;
  }
  async delete(req, opts = {}) {
    const want = keyOf(req, opts.ignoreSearch); let hit = false;
    for (const k of [...this.map.keys()]) if (keyOf(k, opts.ignoreSearch) === want) { this.map.delete(k); hit = true; }
    return hit;
  }
  async keys() { return [...this.map.keys()].map((u) => new Request(u)); }
}
const mk = (v) => { const r = new Response(v.body, { status: v.status, headers: { 'content-type': v.type } }); if (v.redirected) Object.defineProperty(r, 'redirected', { value: true }); return r; };
const store = new Map();
const caches = {
  async open(n) { if (!store.has(n)) store.set(n, new FakeCache()); return store.get(n); },
  async keys() { return [...store.keys()]; },
  async delete(n) { return store.delete(n); },
  async has(n) { return store.has(n); },
  async match(req, opts) { for (const c of store.values()) { const r = await c.match(req, opts); if (r) return r; } return undefined; }
};

/* ---- a fake network: the host with cleanUrls ------------------- */
let online = true;
let hang = false;            // lie-fi: requests neither answer nor fail
let generation = 'A';
const pageBody = (name) => `<!doctype html><title>${name} ${generation}</title><script src="/assets/${name}-${generation}.js"></script>`;
async function fakeFetch(input, init) {
  if (hang) return new Promise((_, reject) => {
    const sig = init && init.signal;
    if (sig) sig.addEventListener('abort', () => reject(new TypeError('aborted')));
  });
  if (!online) throw new TypeError('Failed to fetch');
  const u = new URL(typeof input === 'string' ? input : input.url);
  const p = u.pathname;
  const html = (b) => new Response(b, { status: 200, headers: { 'content-type': 'text/html' } });
  if (p === '/' || p === '/index.html') return html(pageBody('hub'));
  const m = p.match(/^\/(shoot|reports|contacts)(\.html)?$/);
  if (m) return html(pageBody(m[1]));
  if (p.startsWith('/assets/')) return new Response('/* js */', { status: 200, headers: { 'content-type': 'text/javascript' } });
  return new Response('nope', { status: 404 });
}

/* ---- one build of the worker ------------------------------------ */
function boot(gen) {
  generation = gen;
  const handlers = {};
  const manifest = ['index.html', 'shoot.html', 'reports.html', 'contacts.html', `assets/hub-${gen}.js`, `assets/shoot-${gen}.js`]
    .map((url) => ({ url, revision: gen }));
  const self = {
    __WB_MANIFEST: manifest,
    registration: { scope: SCOPE },
    location: new URL(SCOPE),
    clients: { claim: async () => {} },
    skipWaiting: () => {},
    addEventListener: (t, fn) => { handlers[t] = fn; }
  };
  // Timers run fast (a carry fetch's 8s timeout becomes 20ms), so the lie-fi case is quick.
  const fastTimeout = (fn, ms) => setTimeout(fn, Math.min(ms || 0, 20));
  const ctx = vm.createContext({ self, caches, fetch: fakeFetch, Response, Request, Headers, URL, Promise, console, setTimeout: fastTimeout, clearTimeout, AbortController, TypeError, Error, Set, Map, JSON });
  vm.runInContext(SRC, ctx);
  const fire = async (type, data) => {
    const waits = []; let responded;
    const event = Object.assign({ waitUntil: (p) => waits.push(p), respondWith: (p) => { responded = p; } }, data || {});
    handlers[type](event);
    await Promise.all(waits);
    return responded;
  };
  return {
    install: () => fire('install'),
    activate: () => fire('activate'),
    pack: (urls) => fire('message', { data: { type: 'FMS_PACK', urls }, ports: [{ postMessage() {} }] }),
    navigate: async (path) => {
      const res = await fire('fetch', { request: new Request(ORIGIN + path, { headers: { accept: 'text/html' } }) });
      return res && (await res).text();
    }
  };
}
const allEntries = () => [...store.values()].flatMap((c) => [...c.map.values()]);

/* ---- build A: install, activate, make today available offline --- */
const A = boot('A');
await A.install(); await A.activate();
await A.pack([SCOPE + 'shoot.html', SCOPE + 'contacts.html', SCOPE + 'reports.html']);
ok(!!(await caches.match(ORIGIN + '/shoot')), 'build A: the pack holds the clean /shoot');
online = false;
ok(/shoot A/.test(await A.navigate('/shoot')), 'build A offline: /shoot is the shoot day');
online = true;

/* ---- the deploy: build B activates with signal ----------------- */
const B = boot('B');
await B.install(); await B.activate();
await B.navigate('/');      // the morning's first load: its waitUntil joins the carry
online = false;
const shootB = await B.navigate('/shoot');
ok(/shoot/.test(shootB), `after a deploy, /shoot offline is still the shoot day, not the hub — got ${JSON.stringify(shootB)}`);
ok(/shoot B/.test(shootB), '…and it is the NEW build\'s copy, re-packed on activate');
ok(/contacts/.test(await B.navigate('/contacts')), '…and so is every other page that was in the pack');
online = true;
const names = await caches.keys();
ok(names.length === 3 && names.filter((n) => n.startsWith('studio-pack-')).length === 1, `the old build's caches, its pack included, are swept once the pack moved — caches: ${names.join(', ')}`);

/* ---- a deploy that activates OFFLINE keeps the pack ------------- */
const C = boot('C');
await C.install();          // installed with signal…
online = false;
await C.activate();         // …activated without it (the page was closed and reopened on set)
ok(/shoot/.test(await C.navigate('/shoot')), 'a worker that activates offline does not throw the pack away');
online = true;
await C.navigate('/reports.html');   // the next navigation with signal (the first joins the failed carry's retry)
ok((await caches.keys()).filter((n) => n.startsWith('studio-pack-')).length === 1, 'the next navigation with signal moves the kept pack over, without waiting for a deploy');
online = false;
ok(/shoot C/.test(await C.navigate('/shoot')), '…as this build\'s copy');
online = true;
const D = boot('D');
await D.install(); await D.activate();
await D.navigate('/');
online = false;
ok(/shoot D/.test(await D.navigate('/shoot')), 'the next activate with signal re-packs it');
online = true;

/* ---- lie-fi: activate must not wait on the carry ----------------- */
const E = boot('E');
await E.install();
hang = true;
const t0 = Date.now();
const raced = await Promise.race([E.activate().then(() => 'done'), new Promise((r) => setTimeout(() => r('blocked'), 1000))]);
ok(raced === 'done', `activate finishes while the network hangs — got ${raced}`);
await E.navigate('/reports.html').catch(() => {});   // joins the carry; its fetches time out
ok(Date.now() - t0 < 3000, 'the carry gives up on hanging requests instead of holding the worker');
hang = false; online = false;
ok(/shoot D/.test(await E.navigate('/shoot')), 'a timed-out carry keeps the old pack: /shoot offline is still the shoot day');
online = true;
await E.navigate('/');
online = false;
ok(/shoot E/.test(await E.navigate('/shoot')), '…and the next load with signal moves it over');
online = true;

ok(allEntries().every((e) => !e.redirected), 'no cached response is redirected');

console.log(`test:sw-pack — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
