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
  if (!sb) throw Object.assign(new Error('There is no connection to the project (signed out, or this build carries no Supabase project).'), { code: 'no-client' });
  const { data, error } = await sb.rpc(name, args || {});
  if (error) throw Object.assign(new Error(describeError(error, name)), { code: error.code || '', hint: error.hint || '' });
  return data;
}

/** 90 -> "2m", 7300 -> "2h", 200000 -> "2d". */
export function duration(seconds) {
  const s = Number(seconds);
  if (!Number.isFinite(s) || s < 0) return '—';
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'm';
  if (s < 86400) return Math.round(s / 3600) + 'h';
  return Math.round(s / 86400) + 'd';
}

/** "set_billing_settings" -> "Set billing settings". */
export function humanAction(a) {
  const t = String(a || '').replace(/[_:]+/g, ' ').trim();
  return t ? t[0].toUpperCase() + t.slice(1) : 'Unknown action';
}

/** A CSV cell. A cell that begins with = + - @ is prefixed so a spreadsheet does not run it. */
export function csvCell(v) {
  let s = v == null ? '' : typeof v === 'string' ? v : JSON.stringify(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
