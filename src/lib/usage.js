/* ============================================================
   USAGE — counts of which tools are used, never what was in them
   ------------------------------------------------------------
   The client half of schema §43 (bump_usage). The owner approved it on
   12 Oct 2026 on four conditions, and this file is where each one lives:

     COUNTS ONLY.   bumpUsage(name) takes a NAME from a fixed shape
                    (module_open:<id>, or one of eight feature names) and
                    nothing else. There is no second argument. Content —
                    a script, a note, a character, a prompt, a file —
                    has no way in, and the server's CHECK list would
                    refuse it anyway.
     OPT-OUT.       Settings -> Privacy writes fms_usage_optout_v1 = '1'.
                    Read here on every bump (raw, try/catch), so turning
                    it off takes effect on the next click, and a turned-off
                    switch also empties anything already queued.
     SIGNED IN.     A signed-out visitor is never counted: there is no
                    plan to key on and no consent to have given. The
                    server ignores a non-member as well.
     QUIET.         Nothing is written to localStorage, ever (verify
                    asserts zero writes across four idle seconds — this
                    key is only READ). The queue is in memory. It is sent
                    ONCE, when the page is hidden or being left
                    (visibilitychange -> hidden, pagehide), never on a
                    timer and never on idle. Offline, or no session, or any
                    failure: it is dropped. A lost count is a rounding
                    error; a retry loop is a bug.

   THIS FILE IS IN CORE (vite.config.js CORE_LIB) because chrome.js
   imports it on every shell page, so it must stay small and import only
   what CORE already carries: store.js (rawGet) and navmodel.js (which
   module this page is). It does NOT import cloud.js or supabase: it
   reaches them through window.StudioCloud, and only once a session
   exists — a signed-out first load fetches no supabase chunk.

   MODULE OPENS are derived, not listed. navigation.json says which file
   and fragment each module lives at; a page that hosts several (tabs)
   counts the one the hash names, and counts again when the hash moves
   to another. A page with no module (settings, admin, dashboard) counts
   nothing.

   NEVER THROWS. Every public function swallows its own failure.
   ============================================================ */
import { rawGet } from './store.js';
import { allModules } from './navmodel.js';

export const OPTOUT_KEY = 'fms_usage_optout_v1';

/* The fixed feature names; the module names are module_open:<id> where
   <id> is a navigation.json module id (the same shape the server's
   usage_names() accepts). Anything else is dropped here and, were it not,
   ignored there. */
const FEATURES = new Set(['script_import', 'export_pdf', 'export_docx', 'ai_call', 'drive_connect', 'limit_hit', 'share_created', 'screening_pass_used']);
const MODULE_NAME = /^module_open:[a-z][a-z0-9-]*$/;
const MAX_QUEUE = 50;     // the server reads at most the first 50 of a call

let queue = [];
let last = '';            // collapses a double-fire of the same open

export function usageOptedOut() {
  try { return rawGet(OPTOUT_KEY) === '1'; } catch (e) { return true; }   // unreadable storage: do not count
}

const validName = (n) => typeof n === 'string' && (FEATURES.has(n) || MODULE_NAME.test(n));

/** Queue one count. Synchronous, in memory, and silent. */
export function bumpUsage(name) {
  try {
    if (!validName(name)) return;
    if (usageOptedOut()) { queue = []; return; }
    if (name === last && name.startsWith('module_open:')) return;
    last = name;
    if (queue.length < MAX_QUEUE) queue.push(name);
  } catch (e) { /* never throws */ }
}

/** Send the queue. Called only from the two leave-the-page events. */
async function flush() {
  try {
    if (!queue.length) return;
    const names = queue;
    queue = [];
    if (usageOptedOut()) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    const c = window.StudioCloud;
    /* No session means no client has been built (cloud.js only builds one
       to restore a session), so this never loads the SDK for a visitor. */
    if (!c || !c.getSession || !c.getSession() || !c.ensureClient) return;
    const sb = await c.ensureClient();
    if (!sb) return;
    await sb.rpc('bump_usage', { p_names: names });
  } catch (e) { /* a lost count is fine */ }
}

/* ---- which module is this page? ------------------------------------ */

const fileOf = (href) => String(href || '').split('#')[0].split('?')[0];
const fragOf = (href) => (String(href || '').split('#')[1] || '');

/** The module id this location opens, or ''. */
export function moduleHere(loc = location) {
  try {
    const file = (loc.pathname.split('/').pop() || 'index.html').replace(/^$/, 'index.html');
    const bare = file.replace(/\.html$/, '');
    const hash = String(loc.hash || '').replace(/^#/, '').split('?')[0];
    const here = allModules().filter((m) => {
      const f = fileOf(m.href);
      return f === file || f.replace(/\.html$/, '') === bare;
    });
    if (!here.length) return '';
    const exact = hash && here.find((m) => fragOf(m.href) === hash);
    if (exact) return exact.id;
    const first = here.find((m) => !fragOf(m.href)) || here[0];
    return first.id;
  } catch (e) { return ''; }
}

function countOpen() {
  const id = moduleHere();
  if (id) bumpUsage('module_open:' + id);
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  countOpen();
  window.addEventListener('hashchange', countOpen);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
}

export default { bumpUsage, usageOptedOut, moduleHere, OPTOUT_KEY };
