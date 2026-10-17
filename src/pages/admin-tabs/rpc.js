/* ============================================================
   ADMIN TABS — the one way a tab module calls an RPC
   ------------------------------------------------------------
   Every admin RPC re-checks is_studio_admin() on the server; this file
   only gets the call there and turns a refusal into ONE plain sentence
   that says what the server said. It never names a likely cause it has
   not checked (CLAUDE.md, "Do not let a message GUESS").

   Pure helpers (duration, csv) live here too so health.js, audit.js and
   the Overview in admin.js agree about them.
   ============================================================ */

/* The call lives in src/lib/admin-api.js (rule V2) and the pure helpers
   in src/lib/admin-format.js; this file keeps the names the tabs import. */
export { describeError, callRpc } from '../../lib/admin-api.js';
export { duration, humanAction, csvCell } from '../../lib/admin-format.js';
