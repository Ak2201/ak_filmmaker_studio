/* ============================================================
   THE OVERFLOW TIER — IndexedDB under localStorage
   ------------------------------------------------------------
   localStorage is billed in UTF-16 code units against roughly 5 MB,
   and one feature project in this app measures ~302 KB of JSON —
   ~604 KB of quota, of which the screenplay alone is 83%. That is
   EIGHT films and the studio is full. For a tool people keep months
   of work in, that ceiling is not a performance note; it is the point
   at which somebody's writing stops being saved.

   What makes it worse is how it fails. `localStorage.setItem` throws
   QuotaExceededError, `rawSet` returns false, and almost nobody looks
   at the return. The sample seeder caught and discarded it outright.
   So the first symptom of a full studio is a field that saves and
   never comes back — the exact failure mode CLAUDE.md's invariant 1
   is written to prevent, arrived at from a direction the key names
   cannot protect against.

   This module is the second tier. Values over a threshold live in
   IndexedDB, which is measured in hundreds of megabytes; everything
   small stays exactly where it is. It knows nothing about projects,
   namespaces or key shapes — store.js owns all of that, and this file
   owns one question: where do the bytes physically go.

   BY SIZE, NEVER BY NAME. Nothing here enumerates which keys are
   big. A list of "the large ones" is wrong by the second change, the
   same way a hand-written list of steps or skins is wrong by the
   second change — and the module added next year would quietly keep
   filling the small tier. The threshold decides, and only the
   threshold.
   ============================================================ */

const DB_NAME  = 'fms_overflow';
const DB_VER   = 1;
const STORE    = 'blobs';

/* The sentinel left in localStorage in place of an overflowed value.

   A STUB RATHER THAN NOTHING, and this is the load-bearing decision
   in the whole design. The key's EXISTENCE is read all over this
   codebase by machinery that has no idea the overflow tier exists:
   `exportAll()` walks keys to build a backup, `resetAll()` walks them
   to erase one, `migratePrefix()` enumerates them to rename them, and
   a dozen pages do `if (saved)`. Remove the key from localStorage and
   every one of those silently skips the biggest thing in the project
   — which is how a backup comes to call itself a full studio backup
   while holding none of the scripts. That trap is named twice in
   CLAUDE.md already; it is not getting a third outing.

   So the key stays, with a tiny value that says "the bytes are next
   door, and there are this many of them". The length is carried so
   the usage meter can account for overflowed data without reading
   any of it back — which also means the stub is not a fixed width:
   ten characters of marker plus the decimal length, so 15 for a
   300 KB value and wider for a larger one. Small enough that the
   distinction never matters; stated because a note claiming a fixed
   twelve is a note somebody will one day rely on. */
const STUB_PREFIX = '\u0001fms-idb\u0001';   // escape, not a literal:
/* a real NUL byte in the source makes git treat this whole file as
   BINARY — `git diff` prints nothing reviewable for it — so the
   sentinel is written as an escape and the file stays ASCII. U+0001
   is still a control character no JSON value and no human can type
   into a field, which is all the sentinel needs to be. */

export const isStub = (v) => typeof v === 'string' && v.startsWith(STUB_PREFIX);
export const makeStub = (value) => STUB_PREFIX + String(value).length;
export const stubLength = (v) => (isStub(v) ? Number(v.slice(STUB_PREFIX.length)) || 0 : 0);

/* 64 KB. Low enough that the one key that actually matters — a
   screenplay — is always on the big tier, high enough that the
   blueprint, the scenes and the contacts (16 KB at their largest in
   the sample) never leave localStorage and the common path is
   untouched. */
export const THRESHOLD = 64 * 1024;

let _db = null;
let _state = 'cold';          // cold | ready | unavailable

export const state = () => _state;
export const available = () => _state === 'ready';

function openDB() {
  return new Promise((resolve) => {
    let req;
    try {
      if (typeof indexedDB === 'undefined' || !indexedDB) return resolve(null);
      req = indexedDB.open(DB_NAME, DB_VER);
    } catch (e) { return resolve(null); }   // Safari private mode throws here
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => resolve(null);
    req.onblocked = () => resolve(null);
  });
}

/** Every overflowed value, as a Map keyed by the full storage key.
 *
 *  One read of one object store at boot. The alternative — fetching
 *  each value on demand — cannot work, because `localStorage.getItem`
 *  is synchronous and so is every one of this app's ~700 reads of it.
 *  Making those async is a refactor of every page; hydrating once is
 *  a few milliseconds. */
export async function hydrate(timeoutMs = 3000) {
  if (_state !== 'cold') return _cache;
  const timeout = new Promise((r) => setTimeout(() => r('timeout'), timeoutMs));
  const work = (async () => {
    _db = await openDB();
    if (!_db) return 'unavailable';
    return await new Promise((resolve) => {
      try {
        const tx = _db.transaction(STORE, 'readonly');
        const os = tx.objectStore(STORE);
        const keys = os.getAllKeys();
        const vals = os.getAll();
        tx.oncomplete = () => {
          const k = keys.result || [], v = vals.result || [];
          for (let i = 0; i < k.length; i++) _cache.set(String(k[i]), String(v[i]));
          resolve('ready');
        };
        tx.onerror = tx.onabort = () => resolve('unavailable');
      } catch (e) { resolve('unavailable'); }
    });
  })();

  const outcome = await Promise.race([work, timeout]);
  /* A TIMEOUT IS NOT A READY STATE. IndexedDB can hang rather than
     fail — a blocked upgrade, a wedged profile — and a top-level
     await that never settles is an app that never boots. The race
     bounds it; what it must never do is let the app proceed believing
     the tier is healthy, because then a stub reads as a miss and the
     next autosave writes an empty document over a key whose real
     bytes are sitting in a database nobody could open. store.js
     refuses writes to stubbed keys while this says `unavailable`. */
  _state = outcome === 'ready' ? 'ready' : 'unavailable';
  return _cache;
}

const _cache = new Map();
export const cache = () => _cache;

/** Bytes currently held on the big tier, for the usage meter. */
export function overflowBytes() {
  let n = 0;
  for (const v of _cache.values()) n += v.length;
  return n;
}

export function put(key, value) {
  _cache.set(key, value);                 // reads are correct immediately
  if (!available()) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(String(value), String(key));
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

export function del(key) {
  _cache.delete(key);
  if (!available()) return Promise.resolve(false);
  return new Promise((resolve) => {
    try {
      const tx = _db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(String(key));
      tx.oncomplete = () => resolve(true);
      tx.onerror = tx.onabort = () => resolve(false);
    } catch (e) { resolve(false); }
  });
}

/** Read back from the database rather than the cache — the proof a
 *  write landed, which is what `set, verify, then remove` needs. */
export function readBack(key) {
  if (!available()) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const tx = _db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(String(key));
      tx.oncomplete = () => resolve(req.result == null ? null : String(req.result));
      tx.onerror = tx.onabort = () => resolve(null);
    } catch (e) { resolve(null); }
  });
}

export default { hydrate, put, del, readBack, cache, available, state,
                 isStub, makeStub, stubLength, overflowBytes, THRESHOLD };
