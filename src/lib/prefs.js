/* ============================================================
   PREFS — the one door from the view to the browser's storage
   ------------------------------------------------------------
   The view (src/ui/, src/pages/) never touches localStorage or
   sessionStorage itself (docs/ARCHITECTURE.md, `npm run test:layers`).
   It asks a MODEL in src/lib/ — scenes.js, contacts.js, a page's own
   *-state.js — and those models own their key names. This file is the
   small, safe toolkit those models are written on:

     readText / writeText / removeKey      a string under a key
     readJSON / writeJSON                  a parsed value, never a throw
     session.*                             the same, per browser tab

   Every call goes through the SAME Storage.prototype methods the app
   always used, so store.js's project proxy (invariant 6) scopes them
   exactly as before: a SCOPED key still gets its __<projectId>
   suffix. Nothing here renames, moves or migrates a key.

   Failures are answered, not thrown — private mode, a full quota, a
   blocked origin. A read answers the fallback; a write answers false,
   so a caller that must tell the user (a backup restore) still can.

   IMPORT-FREE on purpose: start.html and the startlib chunk share it
   (vite.config.js), and the day this imports store.js the landing page
   ships the whole app (the startlib trap in CLAUDE.md).
   ============================================================ */

function area(kind) {
  try { return kind === 'session' ? globalThis.sessionStorage : globalThis.localStorage; }
  catch (e) { return null; }   // a blocked origin throws on the property itself
}

function make(kind) {
  const readText = (key, fallback = null) => {
    try { const s = area(kind); const v = s ? s.getItem(key) : null; return v === null ? fallback : v; }
    catch (e) { return fallback; }
  };
  const writeText = (key, value) => {
    try { const s = area(kind); if (!s) return false; s.setItem(key, String(value)); return true; }
    catch (e) { return false; }
  };
  const removeKey = (key) => {
    try { const s = area(kind); if (!s) return false; s.removeItem(key); return true; }
    catch (e) { return false; }
  };
  const readJSON = (key, fallback = null) => {
    const raw = readText(key, null);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  };
  const writeJSON = (key, value) => {
    let raw;
    try { raw = JSON.stringify(value); } catch (e) { return false; }
    return writeText(key, raw);
  };
  /** Every key currently held (through the proxy's view of storage). */
  const keys = () => {
    try { const s = area(kind); if (!s) return []; const out = []; for (let i = 0; i < s.length; i++) out.push(s.key(i)); return out; }
    catch (e) { return []; }
  };
  /** Whether this storage can be written at all (private mode, quota). */
  const available = () => {
    try { const s = area(kind); if (!s) return false; const k = '__fms_probe__'; s.setItem(k, '1'); s.removeItem(k); return true; }
    catch (e) { return false; }
  };
  return { readText, writeText, removeKey, readJSON, writeJSON, keys, available };
}

const local = make('local');
export const { readText, writeText, removeKey, readJSON, writeJSON, keys, available } = local;
export const session = make('session');
export default { ...local, session };
