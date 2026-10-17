/* ============================================================
   CLOUD API — the one door from the view to the backend
   ------------------------------------------------------------
   The view never imports @supabase, never calls ensureClient() and
   never fetches /rest/v1 or /functions/v1 itself
   (docs/ARCHITECTURE.md, `npm run test:layers`). It calls a function
   in src/lib/ that names what it wants — billing.js, gate.js, an
   admin-*.js module — and those are written on the two calls here.

   A swapped backend changes src/lib/; no screen has to know.
   ============================================================ */

/** cloud.js, loaded when first needed (it sets window.StudioCloud). */
async function cloud() {
  if (typeof window !== 'undefined' && window.StudioCloud) return window.StudioCloud;
  await import('./cloud.js');
  return (typeof window !== 'undefined' && window.StudioCloud) || null;
}

/** The signed-in client, or null (signed out, or no project in this build). */
export async function cloudClient() {
  const c = await cloud();
  return c && c.ensureClient ? await c.ensureClient() : null;
}

/** Call a database function. Answers { data, error } exactly as the
    client does; with no client the error is { code: 'no-client' }. */
export async function rpc(name, args) {
  const sb = await cloudClient();
  if (!sb) return { data: null, error: { code: 'no-client', message: 'There is no connection to the project (signed out, or this build carries no Supabase project).' } };
  return sb.rpc(name, args || {});
}

/** The project's public address and anon key, or null. Both are public
    (RLS guards the data); a logic module needs them for an anonymous call. */
export async function projectConfig() {
  const c = await cloud();
  const cfg = c && c.getCfg ? c.getCfg() : null;
  return cfg && cfg.url && cfg.key ? { url: String(cfg.url).replace(/\/+$/, ''), key: cfg.key } : null;
}

export default { cloudClient, rpc, projectConfig };
