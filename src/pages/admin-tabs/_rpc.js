/* ============================================================
   ADMIN TABS — the one way a tab asks the database a question
   ------------------------------------------------------------
   Every tab here is a view of an admin_* RPC that re-checks
   is_studio_admin() on the server (the page is a convenience, the RPC is
   the boundary). A tab holds a slot { phase, data, error } per read and
   asks through load(): one request in flight per slot, a failure kept as
   a SENTENCE, and the console re-rendered when the answer lands.

   A section that has not run on the database yet is reported as that
   ("schema section 43 has not run"), not as a generic failure, so the
   owner knows which step is missing. Nothing is cached across page loads
   and nothing is written anywhere.
   ============================================================ */

const SECTION_OF = { admin_usage: 43, admin_cohorts: 43, admin_sync_overview: 44, admin_limit_pressure: 44 };

export function reasonOf(name, err) {
  const raw = String((err && (err.message || err.code)) || err || '');
  if (/PGRST202|does not exist|Could not find/i.test(`${err && err.code} ${raw}`)) {
    return `The database has no ${name}() yet — schema section ${SECTION_OF[name] || '?'} has not been run on it.`;
  }
  if (err && (err.code === '42501' || /Administrators only/i.test(raw))) return 'The database refused: this account is not an administrator.';
  return raw || 'The server did not say why.';
}

async function call(ctx, name, args) {
  const c = ctx.cloud;
  if (!c || !c.ensureClient) throw new Error('Cloud is not available on this page.');
  const sb = await c.ensureClient();
  if (!sb) throw new Error('This build has no cloud project configured.');
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw error;
  return data;
}

/** A read slot: { phase: 'idle'|'loading'|'ok'|'error', data, error, key, at }. */
export const slot = () => ({ phase: 'idle', data: null, error: '', key: '', at: 0 });

/** Start the read when the slot is idle or its key changed. Returns the slot. */
export function load(ctx, s, name, args, key = '') {
  if (s.phase === 'loading') return s;
  if (s.phase !== 'idle' && s.key === key) return s;
  s.phase = 'loading'; s.key = key; s.error = '';
  call(ctx, name, args)
    .then((d) => { s.data = d; s.phase = 'ok'; s.at = Date.now(); })
    .catch((e) => { s.phase = 'error'; s.error = reasonOf(name, e); })
    .finally(() => ctx.rerender());
  return s;
}
export const reset = (s) => { s.phase = 'idle'; s.key = ''; };
