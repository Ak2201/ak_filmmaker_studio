/* ============================================================
   CHROME AUTH — the sign-in modal's one backend step
   ------------------------------------------------------------
   src/ui/auth.js draws the sign-in modal and reaches cloud through
   window.StudioCloud, so importing it never puts cloud.js on a page
   that did not ask for it. The one thing it did to the backend itself
   — save a project's address and anon key, then build a client to
   prove they work — is here, so the view never calls ensureClient().
   ============================================================ */

const cloud = () => (typeof window !== 'undefined' && window.StudioCloud) || null;

/** Point this browser at a Supabase project and connect to it.
 *  Answers the client (truthy) when the project answered, else a falsy
 *  value — exactly what cloud.js's ensureClient() answers. */
export async function connectProject({ url, key }) {
  const c = cloud();
  if (!c) return null;
  c.setCfg({ url, key });
  return await c.ensureClient();
}

export default { connectProject };
