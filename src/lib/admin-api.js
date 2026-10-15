/* ============================================================
   ADMIN API — the console's one door to the backend
   ------------------------------------------------------------
   Every read and write the administration console (admin.html, the
   tabs in src/pages/admin-tabs/, and the admin blocks in src/ui/) makes
   against the database or the edge functions goes through a function
   here. The view never calls ensureClient(), .rpc() or fetch()
   itself (docs/ARCHITECTURE.md, rule V2).

   EACH CALLER KEEPS ITS OWN SENTENCES. The console grew one RPC helper
   per module, and each one says "no cloud" and "the server refused" in
   its own words; those words are what a person reads, and the proofs
   read them too, so every helper below reproduces its original caller
   exactly — the same refusal text, the same thrown shape — rather than
   being merged into one that would change what somebody sees.

   The cloud object is passed IN (ctx.cloud, or window.StudioCloud read
   by the view), never looked up here, so "Cloud is not available on
   this page" still means what it meant: the page had no cloud.js.

   Every admin RPC re-checks is_studio_admin() / require_role() on the
   server; nothing here is the boundary.
   ============================================================ */

const NO_CLOUD = 'Cloud is not available on this page.';
const NO_PROJECT = 'This build has no cloud project configured.';
const NO_CLIENT = 'There is no connection to the project (signed out, or this build carries no Supabase project).';

/* ---- the tab slots (src/pages/admin-tabs/_rpc.js) ----------------- */

const SECTION_OF = { admin_usage: 43, admin_cohorts: 43, admin_sync_overview: 44, admin_limit_pressure: 44 };

/** A slot's failure as a sentence: a missing section is named as one. */
export function reasonOf(name, err) {
  const raw = String((err && (err.message || err.code)) || err || '');
  if (/PGRST202|does not exist|Could not find/i.test(`${err && err.code} ${raw}`)) {
    return `The database has no ${name}() yet — schema section ${SECTION_OF[name] || '?'} has not been run on it.`;
  }
  if (err && (err.code === '42501' || /Administrators only/i.test(raw))) return 'The database refused: this account is not an administrator.';
  return raw || 'The server did not say why.';
}

/** The read a tab slot makes; throws the server's error as it came. */
export async function slotCall(cloud, name, args) {
  const c = cloud;
  if (!c || !c.ensureClient) throw new Error(NO_CLOUD);
  const sb = await c.ensureClient();
  if (!sb) throw new Error(NO_PROJECT);
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw error;
  return data;
}

/* ---- the tab modules' call (src/pages/admin-tabs/rpc.js) ---------- */

/** What the server said, as a sentence. */
export function describeError(e, name) {
  if (!e) return 'The server did not say why.';
  const code = e.code || '';
  const msg = String(e.message || '').trim();
  if (code === 'PGRST202' || /Could not find the function/i.test(msg)) return `The server has no function ${name || 'with that name'} (${code || 'PGRST202'}).`;
  if (code === '42501') return (msg || 'Administrators only') + ' (42501).';
  return msg ? msg + (code ? ` (${code})` : '') : 'The server did not say why.';
}

/** Call an RPC through the cloud client; throws an Error whose message is the sentence. */
export async function callRpc(cloud, name, args) {
  const sb = cloud && cloud.ensureClient ? await cloud.ensureClient() : null;
  if (!sb) throw Object.assign(new Error(NO_CLIENT), { code: 'no-client' });
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw Object.assign(new Error(describeError(error, name)), { code: error.code || '', hint: error.hint || '' });
  return data;
}

/* ---- Controls (src/pages/admin-tabs/controls-body.js) ------------- */

/** The owner-only reads and writes; throws the server's error as it came. */
export async function controlsCall(cloud, name, args) {
  const c = cloud;
  const sb = c && c.ensureClient ? await c.ensureClient() : null;
  if (!sb) throw new Error(NO_PROJECT);
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw error;
  return data;
}

/* ---- the customer drawer and its callers (src/ui/admin-customer.js) */

/** Throws an Error carrying the server's message and code. `args` is
    passed through exactly as given (undefined stays undefined). */
export async function customerCall(cloud, name, args) {
  const c = cloud;
  if (!c || !c.ensureClient) throw new Error(NO_CLOUD);
  const sb = await c.ensureClient();
  if (!sb) throw new Error(NO_PROJECT);
  const { data, error } = await sb.rpc(name, args);
  if (error) {
    const e = new Error(error.message || 'The server refused that.');
    e.code = error.code;
    throw e;
  }
  return data;
}

/* ---- Growth: cohorts (src/ui/growth-admin.js) ---------------------- */

/** admin_cohorts(p_weeks); throws the server's error as it came. */
export async function cohorts(cloud, weeks) {
  const c = cloud;
  const sb = c && c.ensureClient ? await c.ensureClient() : null;
  if (!sb) throw new Error(NO_PROJECT);
  const { data, error } = await sb.rpc('admin_cohorts', { p_weeks: weeks });
  if (error) throw error;
  return data;
}

/* ---- invoices (src/ui/invoice-panels.js) --------------------------- */

/** 'mine' -> my_invoices(), 'all' -> admin_list_invoices(). Throws on
    any failure (the caller treats every one as "not deployed yet"). */
export async function listInvoices(cloud, kind) {
  const c = cloud;
  const sb = c && c.ensureClient ? await c.ensureClient() : null;
  if (!sb) throw new Error('no cloud');
  const { data, error } = await sb.rpc(kind === 'mine' ? 'my_invoices' : 'admin_list_invoices');
  if (error) throw error;
  return data;
}

/* ---- the edge-function probes (src/pages/admin-tabs/health.js) ----- */

/** The project's address with no trailing slash, or '' when this build has none. */
export function functionsBase(cloud) {
  const c = cloud;
  const cfg = c && c.getCfg ? c.getCfg() : null;
  return cfg && cfg.url ? String(cfg.url).replace(/\/+$/, '') : '';
}

/** One deliberately unauthenticated POST to /functions/v1/<fn>.
    { status, msg }: status -1 = answered with no CORS headers (deployed,
    status unreadable); 0 = no readable answer. States what it observed
    and never names a cause it has not checked. */
export async function probeFunction(base, fn) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 8000);
  try {
    /* No headers, a string body: a "simple" request, so no CORS preflight
       can stand between the page and the status. */
    const r = await fetch(`${base}/functions/v1/${fn}`, { method: 'POST', body: '{}', signal: ac.signal, cache: 'no-store', credentials: 'omit' });
    let msg = '';
    try { const j = await r.clone().json(); msg = String(j.error || j.message || ''); } catch (e) { /* no JSON body */ }
    return { status: r.status, msg: msg.slice(0, 140) };
  } catch (e) {
    if (e && e.name === 'AbortError') return { status: 0, msg: 'no answer in 8 seconds' };
    /* A readable answer failed. Ask again in no-cors mode: that resolves (an
       opaque response) when a server answered and merely sent no CORS
       headers — which is what rzp-webhook does on purpose, since only
       Razorpay calls it — and rejects on a real network failure. A missing
       function is NOT hidden by this: the platform answers a 404 for an
       undeployed function WITH CORS headers, so it would have been read
       above. */
    try {
      await fetch(`${base}/functions/v1/${fn}`, { method: 'POST', body: '{}', mode: 'no-cors', signal: ac.signal, cache: 'no-store', credentials: 'omit' });
      return { status: -1, msg: 'answered, but sends no CORS headers (as a webhook should), so the browser cannot read its status' };
    } catch (e2) {
      return { status: 0, msg: '' };
    }
  } finally { clearTimeout(timer); }
}

export default { reasonOf, slotCall, describeError, callRpc, controlsCall, customerCall, cohorts, listInvoices, functionsBase, probeFunction };
