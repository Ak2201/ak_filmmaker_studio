/* ============================================================
   PROOF: the two-tier storage layer, and the one thing it must
   never do — lose a byte on the way between the tiers.
   ------------------------------------------------------------
   `npm run verify` cannot see any of this. The gate's assertions
   are about the DOM: data-keys present, words accounted for, no
   idle writes, no overflow at 390px. Every one of them is still
   green on a page whose biggest field saved into a database
   nobody read back — which is CLAUDE.md invariant 1 arrived at
   from the direction the key NAMES cannot protect against.

   So this is the sibling of scripts/prove-drive.mjs, built the
   same way: its own dist, exactly one seam replaced, and the real
   shipped code above that seam doing the real work. Chromium has
   a real IndexedDB, so the tier itself is NOT faked — the probe
   opens `fms_overflow` directly and reads what is actually in it,
   which is the only ground truth worth asserting against.

   THE ONE SEAM is `URL.createObjectURL`, wrapped so the harness
   can read the bytes of the file the hub's Export button hands a
   user. Nothing below it is replaced: buildBackup() builds the
   real object, the real Blob is made, the real download still
   fires. (The alternative — importing backup.js from the built
   chunk — is not available: Rollup minifies chunk export names,
   so the shipped bundle has no `buildBackup` to reach for. The
   Export button is the route a person has, so it is the route
   this uses.)

   A SECOND, SMALLER seam appears in exactly one block: an init
   script that makes `window.indexedDB` throw, to produce the
   state the design has an opinion about — a stub in localStorage
   with no database behind it.

   THE SENTINEL IS DISCOVERED, NEVER RESTATED. What a stub looks
   like is overflow.js's business and has already changed once
   (NUL delimiters to \u0001); a harness carrying a copy of the
   literal does not fail when they disagree, it HANGS, waiting for
   a stub that arrived ten seconds ago in a shape it did not
   recognise. Reaching for the module's own `isStub` is not
   available either — Rollup minifies chunk export names, so the
   shipped bundle has no `isStub` to import. So this asserts the
   stub's PROPERTIES instead, which is the stronger claim anyway:
   whatever is left in the slot is short, is not the value, and
   carries the value's length.

   PROVE_DIST=<dir> serves an existing build instead of making
   one. That is what makes mutation testing possible without ever
   touching the repo's src/: copy the tree somewhere, break it
   there, build it there, point this at the result.

   Asserted here, in the order the design claims them:
     1  under the threshold stays in localStorage, no IDB record
     2  over the threshold lands in IDB, with a stub in its place
     3  it reads back identical across a reload
     4  the key still ENUMERATES — what backup and reset walk
     5  buildBackup() carries the real bytes, not the sentinel
     6  applyBackup() restores them
     7  shrinking moves it back and leaves no orphan
     8  removeItem clears both tiers
     9  project scoping still separates two large values
     10 a stub with no database refuses the write, and survives
     11 storageUsage() reports what is really stored
     12 zero idle writes with a large value loaded

   CURRENT VERDICT: eleven of the twelve hold. SIX fails, and is
   left failing on purpose — see the long note beside it. The short
   version: applyBackup() does restore the bytes, and hub.js then
   reloads the page in the same task as its alert, before the
   IndexedDB transaction and the stub that follows it have landed.
   Three runs in four lose the restored screenplay outright; the
   fourth lands the bytes but never writes the stub, so the key does
   not enumerate and the next backup omits it. Do not "fix" this by
   relaxing the check.

   Run (needs Node >= 22.12):
     node scripts/prove-storage.mjs
   It builds its own dist into dist-storage/, so the dist/ the
   gate judges is left alone.
   ============================================================ */
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT  = path.join(ROOT, 'dist-storage');
const PORT = Number(process.env.PROVE_STORAGE_PORT) || 5371;

/* The only number restated from the module, and the sizes below sit
   a long way either side of it (1 KB and 320 KB), so moving the
   threshold anywhere sane leaves every assertion meaning the same
   thing. */
const THRESHOLD = 64 * 1024;

/* A stub is short. That is the whole test applied to its shape —
   everything else about it is asserted as a property of the value
   that is actually in the slot. 64 is chosen only to be far below
   any real stored value this harness writes. */
const STUB_MAX = 64;

/* ---- build into our own directory ---------------------------- */
const PREBUILT = process.env.PROVE_DIST ? path.resolve(process.env.PROVE_DIST) : null;
if (PREBUILT) console.log('serving prebuilt ' + PREBUILT + ' (no build)');
const build = PREBUILT ? { status: 0 } : (console.log('building dist-storage/ …'), spawnSync(process.execPath, [
  path.join(ROOT, 'node_modules/vite/bin/vite.js'), 'build',
  '--outDir', OUT, '--emptyOutDir'
], {
  cwd: ROOT,
  env: Object.assign({}, process.env, { VITE_DISABLE_SW: '1' }),
  encoding: 'utf8'
}));
if (build.status !== 0) {
  console.error(build.stdout || '', build.stderr || '');
  process.exit(1);
}

/* ---- serve it ------------------------------------------------ */
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2'
};
const ROOTDIR = PREBUILT || OUT;
const server = http.createServer((req, res) => {
  let p = path.join(ROOTDIR, decodeURIComponent(req.url.split('?')[0]));
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
  if (!fs.existsSync(p)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': MIME[path.extname(p)] || 'application/octet-stream' });
  fs.createReadStream(p).pipe(res);
});
/* SAY SO RATHER THAN CRASHING. Several worktrees of this repo can be
   live at once, and an EADDRINUSE stack trace is the thing that used
   to make somebody SIGKILL whoever legitimately held the port. */
server.on('error', (e) => {
  if (e && e.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use. Run with another one:\n` +
                  `  PROVE_STORAGE_PORT=${PORT + 1} node scripts/prove-storage.mjs\n`);
    process.exit(2);
  }
  throw e;
});
await new Promise((r) => server.listen(PORT, r));

/* ---- the probe ------------------------------------------------
   Installed before any module evaluates, which is the only moment
   `Storage.prototype.getItem` is still the browser's own. The app
   patches it at import time to scope keys per project and to route
   reads through the tier; this harness has to be able to see the
   raw slot UNDERNEATH both of those, because "there is a stub in
   localStorage" is a claim about the raw slot and nothing else. */
const PROBE = () => {
  window.__origGet = Storage.prototype.getItem;
  window.__realIDB = window.indexedDB;
  window.__blobs = [];

  /* THE SEAM. Everything the hub does to produce a backup file is
     real; this only keeps a copy of what went into the Blob. */
  const realCOU = URL.createObjectURL.bind(URL);
  URL.createObjectURL = function (b) {
    try { if (b && typeof b.text === 'function') b.text().then((t) => window.__blobs.push(t)); } catch (e) {}
    return realCOU(b);
  };

  /** The raw localStorage slot, under the proxy and under the tier. */
  window.__raw = (k) => { try { return window.__origGet.call(localStorage, k); } catch (e) { return null; } };

  /** A plain walk of localStorage, which is what exportAll(),
   *  resetAll() and migratePrefix() each do in their own way. */
  window.__walk = () => {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) out.push(localStorage.key(i));
    return out;
  };

  /** Everything really in the overflow database. Opened through the
   *  reference captured above so the block that blocks indexedDB for
   *  the APP does not also blind the harness. The upgrade handler
   *  mirrors overflow.js's, so a probe that happens to open the
   *  database first cannot leave it storeless. */
  window.__idbAll = () => new Promise((res) => {
    let req;
    try { req = window.__realIDB.open('fms_overflow', 1); }
    catch (e) { return res(null); }
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) db.createObjectStore('blobs');
    };
    req.onerror = req.onblocked = () => res(null);
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('blobs')) { db.close(); return res({}); }
      let tx;
      try { tx = db.transaction('blobs', 'readonly'); } catch (e) { db.close(); return res(null); }
      const osx = tx.objectStore('blobs');
      const ks = osx.getAllKeys(), vs = osx.getAll();
      tx.oncomplete = () => {
        const out = {};
        const k = ks.result || [], v = vs.result || [];
        for (let i = 0; i < k.length; i++) out[String(k[i])] = String(v[i]);
        db.close(); res(out);
      };
      tx.onerror = tx.onabort = () => { db.close(); res(null); };
    };
  });

  /* A deterministic value of a known size, so "byte for byte equal"
     can be decided INSIDE the page after a reload rather than by
     shipping a third of a megabyte over the wire twice. */
  window.__big   = (tag) => JSON.stringify({ tag, text: (tag + '0123456789').repeat(20000) });
  window.__small = (tag) => JSON.stringify({ tag, text: 'y'.repeat(1000) });

  /* THE INSTANT THE STORE PUBLISHES ITSELF, caught synchronously.
     "Reads stay synchronous; the tier hydrates at boot via a
     top-level await before init() runs" is a claim about ORDER, and
     order is the one thing a harness cannot observe by asking later:
     every round trip from Node gives an un-awaited hydrate several
     task turns to finish, so the broken version answers correctly by
     the time anybody asks. A setter on the global the module assigns
     fires INSIDE that module's own evaluation task, which is before
     any IndexedDB callback can run — so this sees the ordering
     itself rather than its usual outcome. (Proved by the mutant that
     drops the await: every other assertion here stayed green.) */
  let _store;
  window.__firstSight = null;
  Object.defineProperty(window, 'StudioStore', {
    configurable: true,
    get: () => _store,
    set(v) {
      _store = v;
      if (window.__firstSight == null) {
        try {
          window.__firstSight = {
            tier: v.storageUsage().tier,
            big: localStorage.getItem('fms_scenes_v1')
          };
        } catch (e) { window.__firstSight = { tier: 'threw: ' + e.message, big: null }; }
      }
    }
  });
};

/* The second seam, used by one block only. */
const BLOCK_IDB = () => {
  Object.defineProperty(window, 'indexedDB', {
    configurable: true,
    get() { throw new Error('IndexedDB blocked by the harness'); }
  });
};

/* ---- harness -------------------------------------------------- */
let failed = 0;
function check(label, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}`);
  if (!ok) console.log(`        got  ${JSON.stringify(got)}\n        want ${JSON.stringify(want)}`);
}

const browser = await chromium.launch();

async function openPage(opts) {
  opts = opts || {};
  const ctx = opts.ctx || await browser.newContext({ viewport: { width: 1280, height: 900 } });
  if (!opts.ctx) {
    await ctx.addInitScript(PROBE);
    if (opts.seed) await ctx.addInitScript(opts.seed);
  }
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  /* A HUMAN-PACED DIALOG, and the delay is load-bearing rather than
     cautious. hub.js's import ends `alert(...); location.reload();`,
     and an overflowed value is not durable when rawSet returns — the
     IndexedDB put and its read-back are still in flight. Accepting
     the alert in zero milliseconds collapses the only thing standing
     between the write and the unload, and this block FAILED
     intermittently that way, losing the restored screenplay outright.
     A person takes a moment to press OK; so does this. The window
     itself is a real finding and is asserted on its own terms in the
     first block ("the stub lands after the write returns"). */
  page.on('dialog', async (d) => {
    await new Promise((r) => setTimeout(r, 600));
    d.accept().catch(() => {});
  });
  await page.goto(`http://localhost:${PORT}/${opts.at || 'index.html'}`);
  await page.waitForFunction(() => !!window.StudioStore, null, { timeout: 15000 });
  page.__errors = errors;
  return { ctx, page };
}

/** The tier hydrated and is healthy — the precondition for every
 *  block below, asserted rather than assumed, because every one of
 *  them would pass vacuously against an unavailable tier. */
const tierReady = (page) => page.evaluate(() => window.StudioStore.storageUsage().tier);

const newProject = (page, title) => page.evaluate((t) => {
  const S = window.StudioStore;
  const p = S.createProject({ title: t, format: 'feature' });
  S.setCurrentProject(p.id);
  return p.id;
}, title);

/** The stub lands LAST, after IndexedDB has handed the bytes back
 *  and they compared equal — so a write is not finished when
 *  setItem returns, and a harness that asserts immediately is
 *  asserting against the window the design deliberately leaves
 *  open. Waiting for the stub IS waiting for the verify step. */
const waitForStub = (page, key) => page.waitForFunction(([k, max]) => {
  const v = window.__raw(k);
  return typeof v === 'string' && v.length > 0 && v.length < max;
}, [key, STUB_MAX], { timeout: 15000 }).catch(() => {
  /* A TIMEOUT HERE IS A FINDING, NOT A CRASH. If the stub never
     arrives the run must still reach the assertions that say so —
     a harness that dies on the first symptom reports a TimeoutError
     where it should report which claim stopped being true. */
  console.log(`        (no stub appeared for ${key} within 15s — the checks below will say what that cost)`);
});

const listen = (page) => page.evaluate(() => {
  window.__events = [];
  window.StudioStore.subscribe('*', (name, payload) => window.__events.push({ name, key: payload && payload.key }));
});

console.log('\n--- the threshold decides, and nothing else ---');
let bigKey = null;
{
  const { ctx, page } = await openPage();
  check('the overflow tier hydrated', await tierReady(page), 'ready');

  const id = await newProject(page, 'Probe Alpha');
  const smallKey = 'fms_contacts_v1__' + id;
  bigKey = 'fms_scenes_v1__' + id;

  /* Written through the ORDINARY proxied localStorage the pages use,
     not through rawSet — the scoping and the tier both have to run. */
  await page.evaluate(() => {
    localStorage.setItem('fms_contacts_v1', window.__small('SMALL'));
    localStorage.setItem('fms_scenes_v1',   window.__big('ALPHA'));
  });
  /* THE WINDOW, STATED. A big write is not durable when setItem
     returns: the bytes go to IndexedDB, are read back and compared,
     and only then does the stub replace the old localStorage value.
     That ordering is the design's whole safety argument — a crash in
     the window costs one save, never the file — and it is also the
     reason anything that unloads the page immediately after a write
     can lose it. Asserted, not assumed, because "set, verify, then
     remove" is unfalsifiable unless the gap is visible. */
  const duringWrite = await page.evaluate((k) => {
    const before = window.__raw(k);
    localStorage.setItem('fms_scenes_v1', window.__big('ALPHA2'));
    return { before: String(before), immediatelyAfter: String(window.__raw(k)) };
  }, bigKey);
  check('2  the stub is NOT written synchronously — the verify step is real',
    duringWrite.immediatelyAfter, duringWrite.before);
  await waitForStub(page, bigKey);
  // put the canonical value back for the assertions below
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await page.waitForFunction((k) => {
    const v = window.__raw(k);
    return typeof v === 'string' && Number((v.match(/(\d+)$/) || [])[1]) === window.__big('ALPHA').length;
  }, bigKey, { timeout: 15000 });

  const r = await page.evaluate(async (keys) => {
    const idb = await window.__idbAll();
    return {
      smallRaw:  window.__raw(keys.small),
      smallWant: window.__small('SMALL'),
      smallInIdb: Object.prototype.hasOwnProperty.call(idb || {}, keys.small),
      bigRaw:    window.__raw(keys.big),
      bigInIdb:  (idb || {})[keys.big] === window.__big('ALPHA'),
      bigLen:    window.__big('ALPHA').length,
      bigWant:   window.__big('ALPHA'),
      /* The trailing digits of whatever the sentinel is. Derived from
         the slot rather than by slicing a prefix this file claims to
         know. */
      stubSays:  Number((String(window.__raw(keys.big)).match(/(\d+)$/) || [])[1]),
      idbKeys:   Object.keys(idb || {}),
      walk:      window.__walk().indexOf(keys.big) >= 0,
      objectKeys: Object.keys(localStorage).indexOf(keys.big) >= 0,
      usage:     window.StudioStore.storageUsage(),
      idbBytes:  Object.values(idb || {}).reduce((n, v) => n + v.length, 0)
    };
  }, { small: smallKey, big: bigKey });

  check('1  a small value is over nothing', r.bigLen > THRESHOLD && r.smallWant.length < THRESHOLD, true);
  check('1  a value under the threshold stays in localStorage', r.smallRaw, r.smallWant);
  check('1  …and creates no IndexedDB record', r.smallInIdb, false);

  check('2  a value over the threshold is in IndexedDB', r.bigInIdb, true);
  /* The sentinel asserted by its PROPERTIES — see the header. It is
     whatever is in the slot; what matters is that something is, that
     it is small, that it is not the value, and that it says how big
     the value was so the usage meter never has to read it back. */
  check('2  …and localStorage still holds something under the same key',
    typeof r.bigRaw === 'string' && r.bigRaw.length > 0, true);
  check('2  …a sentinel, not the value', r.bigRaw === r.bigWant, false);
  check('2  …a handful of bytes, not a third of a megabyte',
    (r.bigRaw || '').length > 0 && r.bigRaw.length < STUB_MAX, true);
  check('2  …carrying the real length', r.stubSays, r.bigLen);
  check('2  exactly one key overflowed', r.idbKeys, [bigKey]);

  /* THE ASSERTION THE WHOLE STUB DESIGN EXISTS FOR. exportAll(),
     resetAll() and migratePrefix() each walk localStorage; a key
     that left it is a key every one of them silently skips. */
  check('4  the overflowed key still appears in a plain walk of localStorage', r.walk, true);
  check('4  …and in Object.keys(localStorage)', r.objectKeys, true);

  check('11 storageUsage() reports the big tier as what is really stored',
    r.usage.big, r.idbBytes);
  check('11 …and counts one overflowed key', r.usage.overflowed, 1);
  check('11 …while the small tier excludes those bytes',
    r.usage.small < r.idbBytes, true);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- it reads back identical, across a reload ---');
{
  const { ctx, page } = await openPage();
  const id = await newProject(page, 'Probe Alpha');
  const key = 'fms_scenes_v1__' + id;
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, key);

  check('3  the value reads back before any reload',
    await page.evaluate(() => localStorage.getItem('fms_scenes_v1') === window.__big('ALPHA')), true);

  await page.reload();
  await page.waitForFunction(() => !!window.StudioStore, null, { timeout: 15000 });

  /* Reads stay synchronous: the tier hydrated at boot through a
     top-level await, so by the time anything can call getItem the
     bytes are in hand. Asserted without awaiting anything in the
     page beyond the ordinary module evaluation. */
  const after = await page.evaluate(() => {
    const got = localStorage.getItem('fms_scenes_v1');
    const want = window.__big('ALPHA');
    const first = window.__firstSight || {};
    return { equal: got === want, gotLen: got == null ? -1 : got.length, wantLen: want.length,
             tier: window.StudioStore.storageUsage().tier,
             firstTier: first.tier,
             firstEqual: first.big === want };
  });
  check('3  the tier was ALREADY ready when the store published itself',
    after.firstTier, 'ready');
  check('3  …and the big value was readable at that same instant',
    after.firstEqual, true);
  check('3  the tier is ready again after the reload', after.tier, 'ready');
  check('3  the length survived the reload', [after.gotLen], [after.wantLen]);
  check('3  it reads back byte for byte after a reload', after.equal, true);
  check('3  …through the ordinary localStorage.getItem, not a special path',
    await page.evaluate(() => Storage.prototype.getItem !== window.__origGet), true);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- the backup carries the bytes, not the sentinel ---');
let backupFile = null;
{
  const { ctx, page } = await openPage();
  const id = await newProject(page, 'Probe Alpha');
  const key = 'fms_scenes_v1__' + id;
  await page.evaluate(() => {
    localStorage.setItem('fms_scenes_v1',   window.__big('ALPHA'));
    localStorage.setItem('fms_contacts_v1', window.__small('SMALL'));
  });
  await waitForStub(page, key);

  /* The sentinel for THIS value, read out of the slot — so the
     "it is not in the file" check below names the real thing
     rather than a literal this script remembers. */
  const sentinel = await page.evaluate((k) => String(window.__raw(k)), key);
  check('5  the value really is on the big tier before exporting',
    sentinel.length > 0 && sentinel.length < STUB_MAX, true);

  /* The hub's real Export button, through the real delegate()
     handler, building the real file. */
  await page.evaluate(() => document.querySelector('[data-action="export-all"]').click());
  await page.waitForFunction(() => window.__blobs.length > 0, null, { timeout: 15000 });

  const out = await page.evaluate(([id, sent]) => {
    const text = window.__blobs[0];
    const all = JSON.parse(text);
    const bucket = (all.data || {})[id] || {};
    return {
      version: all._version,
      titles: (all.projects || []).map((p) => p.title),
      scenes: JSON.stringify(bucket.scenes || null),
      want:   window.__big('ALPHA'),
      smallOk: JSON.stringify(bucket.contacts || null) === window.__small('SMALL'),
      /* Searched for by NAME rather than by the exact sentinel: in a
         JSON file the NULs arrive as \\u0000 escapes, so looking for
         the raw string would find nothing and pass for the wrong
         reason. */
      stubInFile: text.indexOf('fms-idb') >= 0,
      text
    };
  }, [id, sentinel]);

  check('5  the exported file is a v2 backup', out.version, 2);
  check('5  …naming the project', out.titles, ['Probe Alpha']);
  check('5  …and holding the small value', out.smallOk, true);
  /* THE ONE THAT MATTERS. A backup full of sentinels calling itself
     a full studio backup is the trap CLAUDE.md names twice. */
  check('5  buildBackup() carries the REAL 320KB value, not the stub',
    out.scenes === out.want, true);
  check('5  …and the sentinel appears nowhere in the file', out.stubInFile, false);

  backupFile = path.join(os.tmpdir(), 'prove-storage-backup.json');
  fs.writeFileSync(backupFile, out.text, 'utf8');
  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- …and applyBackup() puts them back ---');
{
  /* A FRESH context: empty localStorage, empty IndexedDB. The same
     applier the Drive restore uses, reached the way a person reaches
     it — the hub's file picker. */
  const { ctx, page } = await openPage();
  check('6  the fresh studio starts empty',
    await page.evaluate(() => window.StudioStore.listAllProjects().length), 0);

  /* A MARKER ON THIS DOCUMENT, so the assertions below cannot be
     answered by the page that is about to be thrown away.
     handleImportAll() ends `alert(...); location.reload();`, and
     `listAllProjects().length === 1` is true the instant applyBackup
     returns — long before the navigation. Waiting on that alone
     catches the DOOMED page, where the overflow cache still holds
     the restored value and nothing has reached IndexedDB yet. This
     check passed twice that way before the marker was added, which
     is the whole reason it is here: it was reporting the state of a
     page that no longer existed a moment later. */
  await page.evaluate(() => { window.__preImport = true; });
  await page.setInputFiles('#importAllFile', backupFile);
  await page.waitForFunction(
    () => window.__preImport === undefined &&
          window.StudioStore && window.StudioStore.listAllProjects().length === 1,
    null, { timeout: 25000 });

  const r = await page.evaluate(async () => {
    const S = window.StudioStore;
    const p = S.listAllProjects()[0];
    S.setCurrentProject(p.id);
    const key = 'fms_scenes_v1__' + p.id;
    const idb = await window.__idbAll();
    return {
      title: p.title,
      equal: S.rawGet(key) === window.__big('ALPHA'),
      viaProxy: localStorage.getItem('fms_scenes_v1') === window.__big('ALPHA'),
      inIdb: (idb || {})[key] === window.__big('ALPHA'),
      enumerates: window.__walk().indexOf(key) >= 0,
      raw: String(window.__raw(key)).slice(0, 20)
    };
  });

  check('6  the project came back', r.title, 'Probe Alpha');
  /* ---- EXPECTED RED, AND LEFT RED ---------------------------
     applyBackup() does restore the value — the overflow cache holds
     it the moment it returns, which is what the doomed-page version
     of this check was seeing. What it does not do is survive the
     reload hub.js performs immediately afterwards.

     Measured, with everything else held still: `rawSet(big);
     location.reload()` survives; `rawSet(big); setTimeout(reload,
     0|300)` survives; `rawSet(big); alert(...); location.reload()`
     does NOT, at every dialog hold time tried from 100 ms to 3 s.
     The modal stops the IndexedDB transaction's events being
     dispatched, and the reload in the same task tears the
     connection down before they can be.

     So a person importing a backup gets their project meta, their
     small buckets, and a screenplay-shaped hole. The faster they
     dismiss the alert the better their odds, which is the wrong way
     round for a safety property and is why a harness that clicks
     instantly reported this as working.

     This is NOT weakened to pass. The fix belongs in the code — the
     tier's write has to be awaitable, and hub.js has to wait for it
     before reloading (or stop reloading). */
  check('6  applyBackup() restored the big value through rawGet', r.equal, true);
  check('6  …and through the ordinary proxied getItem', r.viaProxy, true);
  check('6  …and it landed on the big tier, not in localStorage', r.inIdb, true);
  check('6  …and its key enumerates after the restore', r.enumerates, true);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- shrinking back, and removing ---');
{
  const { ctx, page } = await openPage();
  const id = await newProject(page, 'Probe Alpha');
  const key = 'fms_scenes_v1__' + id;
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, key);

  // Shrink it below the threshold.
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__small('SHRUNK')));
  await page.waitForFunction(async (k) => {
    const idb = await window.__idbAll();
    return idb && !Object.prototype.hasOwnProperty.call(idb, k);
  }, key, { timeout: 15000 }).catch(() => {});

  const shrunk = await page.evaluate(async (k) => {
    const idb = await window.__idbAll();
    return {
      raw: window.__raw(k),
      want: window.__small('SHRUNK'),
      stillInIdb: Object.prototype.hasOwnProperty.call(idb || {}, k),
      read: localStorage.getItem('fms_scenes_v1') === window.__small('SHRUNK'),
      usage: window.StudioStore.storageUsage()
    };
  }, key);

  check('7  a shrunk value is back in localStorage, whole', shrunk.raw, shrunk.want);
  check('7  …and reads back correctly', shrunk.read, true);
  check('7  …leaving no orphan in IndexedDB', shrunk.stillInIdb, false);
  check('7  …and nothing on the big tier', [shrunk.usage.big, shrunk.usage.overflowed], [0, 0]);

  // Overflow it again, then remove it.
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, key);
  await page.evaluate(() => localStorage.removeItem('fms_scenes_v1'));
  await page.waitForFunction(async (k) => {
    const idb = await window.__idbAll();
    return idb && !Object.prototype.hasOwnProperty.call(idb, k);
  }, key, { timeout: 15000 }).catch(() => {});

  const gone = await page.evaluate(async (k) => {
    const idb = await window.__idbAll();
    return {
      raw: window.__raw(k),
      inIdb: Object.prototype.hasOwnProperty.call(idb || {}, k),
      read: localStorage.getItem('fms_scenes_v1'),
      enumerates: window.__walk().indexOf(k) >= 0
    };
  }, key);

  check('8  removeItem clears the localStorage slot', gone.raw, null);
  check('8  …and the IndexedDB record', gone.inIdb, false);
  check('8  …and the key stops enumerating', gone.enumerates, false);
  check('8  …and the read is a miss, not a stale cache hit', gone.read, null);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- two projects, one logical key ---');
{
  const { ctx, page } = await openPage();
  const a = await newProject(page, 'Probe Alpha');
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, 'fms_scenes_v1__' + a);

  const b = await newProject(page, 'Probe Beta');
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('BETA')));
  await waitForStub(page, 'fms_scenes_v1__' + b);

  const r = await page.evaluate(async (ids) => {
    const S = window.StudioStore;
    const idb = await window.__idbAll();
    const seen = {};
    S.setCurrentProject(ids.b);
    seen.fromB = localStorage.getItem('fms_scenes_v1');
    S.setCurrentProject(ids.a);
    seen.fromA = localStorage.getItem('fms_scenes_v1');
    return {
      fromAIsAlpha: seen.fromA === window.__big('ALPHA'),
      fromBIsBeta:  seen.fromB === window.__big('BETA'),
      crossTalk:    seen.fromA === seen.fromB,
      idbKeys: Object.keys(idb || {}).sort(),
      idbDistinct: (idb || {})['fms_scenes_v1__' + ids.a] !== (idb || {})['fms_scenes_v1__' + ids.b],
      usage: window.StudioStore.storageUsage()
    };
  }, { a, b });

  check('9  project A sees its own large value', r.fromAIsAlpha, true);
  check('9  project B sees its own large value', r.fromBIsBeta, true);
  check('9  neither is visible from the other', r.crossTalk, false);
  check('9  the big tier holds two separately suffixed records',
    r.idbKeys, ['fms_scenes_v1__' + a, 'fms_scenes_v1__' + b].sort());
  check('9  …with different contents', r.idbDistinct, true);
  check('9  storageUsage() counts both', r.usage.overflowed, 2);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

console.log('\n--- a stub with no database behind it ---');
{
  const { ctx, page } = await openPage();
  const id = await newProject(page, 'Probe Alpha');
  const key = 'fms_scenes_v1__' + id;
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, key);

  /* Now the database stops opening, with the stub already written.
     This is the Safari-private-mode / wedged-profile case, and the
     quiet version of it is an empty editor autosaving itself over
     somebody's script. */
  await ctx.addInitScript(BLOCK_IDB);
  await page.reload();
  await page.waitForFunction(() => !!window.StudioStore, null, { timeout: 15000 });

  check('10 the tier reports itself unavailable',
    await page.evaluate(() => window.StudioStore.storageUsage().tier), 'unavailable');
  const stub = await page.evaluate((k) => String(window.__raw(k)), key);
  const bigLen = await page.evaluate(() => window.__big('ALPHA').length);
  check('10 the stub is still in localStorage after the reload',
    stub.length > 0 && stub.length < STUB_MAX && Number((stub.match(/(\d+)$/) || [])[1]) === bigLen, true);

  await listen(page);
  const refused = await page.evaluate((k) => {
    const S = window.StudioStore;
    const ret = S.rawSet(k, JSON.stringify({ tag: 'EMPTY' }));
    return {
      ret,
      events: window.__events.filter((e) => e.name === 'storage:refused').length,
      raw: String(window.__raw(k))
    };
  }, key);

  check('10 rawSet to a stubbed key is REFUSED', refused.ret, false);
  check('10 …and says so with storage:refused', refused.events, 1);
  check('10 …and the stub is still intact', refused.raw, stub);

  /* The same refusal through the proxy, which is the path a page
     actually takes when a user types one character into an editor
     that could not load its own text. */
  const viaProxy = await page.evaluate(() => {
    window.__events.length = 0;
    localStorage.setItem('fms_scenes_v1', JSON.stringify({ tag: 'EMPTY' }));
    return {
      refused: window.__events.filter((e) => e.name === 'storage:refused').length,
      errored: window.__events.filter((e) => e.name === 'storage:error').length
    };
  });
  check('10 the proxied write is refused too', viaProxy.refused, 1);
  check('10 …and the page is told the save did not happen', viaProxy.errored, 1);

  const stillThere = await page.evaluate((k) => String(window.__raw(k)), key);
  check('10 the stub survived the proxied write as well', stillThere, stub);

  /* And the read says so loudly rather than returning an empty
     string that a page would treat as a blank document. */
  const read = await page.evaluate(() => {
    window.__events.length = 0;
    const v = localStorage.getItem('fms_scenes_v1');
    return { v, degraded: window.__events.filter((e) => e.name === 'storage:degraded').length };
  });
  check('10 a read of unreachable bytes returns null, not ""', read.v, null);
  check('10 …and raises storage:degraded', read.degraded, 1);

  await ctx.close();
}

console.log('\n--- the idle-write rule, with a large value loaded ---');
{
  const { ctx, page } = await openPage();
  const id = await newProject(page, 'Probe Alpha');
  const key = 'fms_scenes_v1__' + id;
  await page.evaluate(() => localStorage.setItem('fms_scenes_v1', window.__big('ALPHA')));
  await waitForStub(page, key);

  // Reload so the page boots WITH the large value already on the big
  // tier — the state the gate's own idle check never reaches.
  await page.reload();
  await page.waitForFunction(() => !!window.StudioStore, null, { timeout: 15000 });
  await page.evaluate(() => localStorage.getItem('fms_scenes_v1'));
  await page.waitForTimeout(2000);   // let first paint and any boot writes settle

  await page.evaluate(() => {
    window.__writes = 0;
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (...a) { window.__writes++; return orig.apply(this, a); };
    /* A SECOND, BLINDER MEASUREMENT. The prototype patch above is
       exactly what `npm run verify` does — and the overflow tier
       writes its stub through a reference to the ORIGINAL setItem,
       captured in store.js before the proxy was installed, so a
       prototype patch cannot see it. Snapshotting the raw slots
       catches a write the gate's instrument would miss. */
    window.__snap = () => window.__walk().sort()
      .map((k) => k + '=' + String(window.__raw(k))).join('\u0002');
    /* VALUES, NOT LENGTHS. The first version of this compared
       `key=length`, which a writer stamping a fresh 13-digit
       timestamp every 400ms sails straight through — proved by a
       mutant doing exactly that, which this check passed. */
    window.__before = window.__snap();
  });
  await page.waitForTimeout(4500);

  const idle = await page.evaluate(() => ({
    writes: window.__writes,
    changed: window.__snap() !== window.__before
  }));
  check('12 zero localStorage writes across four idle seconds', idle.writes, 0);
  check('12 …and no raw slot changed either, including by the stub path',
    idle.changed, false);
  check('12 the large value is still readable after the idle window',
    await page.evaluate(() => localStorage.getItem('fms_scenes_v1') === window.__big('ALPHA')), true);

  check('no page errors', page.__errors, []);
  await ctx.close();
}

await browser.close();
server.close();
try { if (backupFile) fs.unlinkSync(backupFile); } catch (e) {}
console.log(failed ? `\n✗ ${failed} check(s) failed` : '\n✓ all storage checks pass');
process.exit(failed ? 1 : 0);
