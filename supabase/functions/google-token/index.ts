/* ============================================================
   google-token — the server-held Google refresh token (schema §66)
   ------------------------------------------------------------
   Drive-only storage (docs/DRIVE-STORAGE.md) needs Drive to keep working
   after the one-hour access token from sign-in runs out, without a popup.
   Google gives a REFRESH token for that only to a server that holds the
   OAuth client SECRET, so this function holds both: the secret as a
   function secret, the refresh token encrypted in public.google_tokens.

   Deploy WITH JWT verification (the default):
       supabase functions deploy google-token
   Every action reads WHO from the caller's JWT, never from the body.

     POST { action: 'store', refresh_token, scope? }   → 204
          encrypt (AES-256-GCM, random 12-byte IV, AAD = user id) and
          upsert. Refused (409 code 'mode') unless storage_mode is 'drive':
          no grant is collected before the studio needs one.
     POST { action: 'mint' }                           → 200 { access_token, expires_in, scope }
          decrypt, refresh at Google. invalid_grant → the row is deleted
          and 409 { code: 'regrant' } (the client offers "Reconnect Google
          Drive"). No row → 404 { code: 'no_token' }. A refresh token is
          NEVER returned.
     POST { action: 'revoke', user_id? }               → 200 { revoked, removed, google }
          revoke at Google, then delete the row. user_id (somebody else)
          is for the console's DELETE TOTALLY and needs the owner role,
          asked of the database as the caller (studio_role()). If Google
          cannot be reached the row is KEPT so a later revoke can still
          reach it; deleting the person cascades it away regardless.

   Secrets (`supabase secrets set`, never in the repo):
     GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   the ONE OAuth client sign-in uses
     GOOGLE_TOKEN_KEY                         `openssl rand -base64 32`
   SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY are
   provided by the platform. docs/LIVE-STEPS-2026-10-31.md is the runbook.

   NEVER LOG A TOKEN. This file logs nothing but an action name and a
   status code; error bodies say what was observed (Google's own error
   code), never a guessed cause.
   ============================================================ */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  parseRequest, importKey, encryptToken, decryptToken, refreshForm, revokeForm,
  mintOutcome, revokeOutcome, redact, TOKEN_URL, REVOKE_URL
} from '../_shared/google-token.js';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS'
};
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
const noContent = () => new Response(null, { status: 204, headers: { ...CORS, 'Cache-Control': 'no-store' } });

async function googlePost(url: string, form: string) {
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: form });
    let j: unknown = null;
    try { j = await r.json(); } catch { /* an empty or non-JSON body */ }
    return { status: r.status, json: j, threw: false };
  } catch {
    return { status: 0, json: null, threw: true };
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'POST only' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID') ?? '';
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET') ?? '';
  const keyB64 = Deno.env.get('GOOGLE_TOKEN_KEY') ?? '';
  if (!clientId || !clientSecret || !keyB64) {
    return json(503, { code: 'not_configured', error: 'Google Drive renewal is not configured on this studio yet (GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET or GOOGLE_TOKEN_KEY is unset).' });
  }
  let key: CryptoKey;
  try { key = await importKey(keyB64); } catch (e) { return json(503, { code: 'not_configured', error: (e as Error).message }); }

  // who (asked of Auth with the caller's own JWT)
  const auth = req.headers.get('Authorization') ?? '';
  if (!auth.startsWith('Bearer ')) return json(401, { error: 'Sign in first.' });
  const asUser = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: who, error: whoErr } = await asUser.auth.getUser();
  if (whoErr || !who?.user) return json(401, { error: 'Sign in first.' });
  const me = who.user.id;

  let body: unknown = {};
  try { body = await req.json(); } catch { /* empty body */ }
  const ask = parseRequest(body) as { action?: string; refreshToken?: string; scope?: string | null; userId?: string; status?: number; error?: string };
  if (ask.error) return json(ask.status ?? 400, { error: ask.error });

  const svc = createClient(url, serviceKey);

  if (ask.action === 'store') {
    const { data: mode, error: modeErr } = await svc.rpc('get_storage_mode');
    if (modeErr) return json(503, { code: 'schema', error: 'The storage mode could not be read (' + (modeErr.code || 'error') + ').' });
    if (mode !== 'drive') return json(409, { code: 'mode', error: 'Films are kept on the studio server at the moment, so no Google grant is stored.' });
    let enc: string;
    try { enc = await encryptToken(key, ask.refreshToken, me); } catch { return json(500, { error: 'The grant could not be encrypted.' }); }
    const { error } = await svc.from('google_tokens').upsert(
      { user_id: me, enc_refresh: enc, scope: ask.scope ?? null, updated_at: new Date().toISOString() },
      { onConflict: 'user_id' }
    );
    if (error) { console.warn('[google-token] store', error.code); return json(500, { error: 'The grant could not be saved (' + (error.code || 'error') + ').' }); }
    return noContent();
  }

  if (ask.action === 'mint') {
    const { data: row, error } = await svc.from('google_tokens').select('enc_refresh').eq('user_id', me).maybeSingle();
    if (error) return json(500, { error: 'The grant could not be read (' + (error.code || 'error') + ').' });
    if (!row) return json(404, { code: 'no_token', error: 'No Google Drive grant is stored for this account.' });
    let refresh: string;
    try { refresh = await decryptToken(key, row.enc_refresh, me); } catch {
      // Unreadable with this key (rotated, or the row was moved): it can
      // never be used again, so it goes and the person reconnects once.
      await svc.from('google_tokens').delete().eq('user_id', me);
      return json(409, { code: 'regrant', error: 'The stored Drive grant could not be decrypted with this studio’s key. Reconnect Google Drive.' });
    }
    const g = await googlePost(TOKEN_URL, refreshForm({ clientId, clientSecret, refreshToken: refresh }));
    const out = mintOutcome(g.status, g.json, { threw: g.threw });
    if (out.drop) await svc.from('google_tokens').delete().eq('user_id', me);
    if (out.rotate) {
      try {
        const enc = await encryptToken(key, out.rotate, me);
        await svc.from('google_tokens').update({ enc_refresh: enc, updated_at: new Date().toISOString() }).eq('user_id', me);
      } catch { /* the old one still works until Google says otherwise */ }
    } else if (out.status === 200) {
      await svc.from('google_tokens').update({ updated_at: new Date().toISOString() }).eq('user_id', me);
    }
    const outCode = redact((out.body as { code?: string }).code ?? '');
    if (out.status !== 200) console.warn('[google-token] mint', out.status, outCode);
    return json(out.status, out.body);
  }

  // revoke
  let target = me;
  if (ask.userId && ask.userId !== me) {
    const { data: role, error: roleErr } = await asUser.rpc('studio_role');
    if (roleErr) return json(403, { error: roleErr.message || 'Administrators only.' });
    if (role !== 'owner') return json(403, { error: 'Only the studio owner can revoke somebody else’s Google grant.' });
    target = ask.userId;
  }
  const { data: row, error } = await svc.from('google_tokens').select('enc_refresh').eq('user_id', target).maybeSingle();
  if (error) return json(500, { error: 'The grant could not be read (' + (error.code || 'error') + ').' });
  if (!row) return json(200, { revoked: false, removed: false, google: 'none' });
  let refresh = '';
  try { refresh = await decryptToken(key, row.enc_refresh, target); } catch { /* unreadable: nothing to tell Google */ }
  let res: { revoked: boolean; drop: boolean; google: string } = { revoked: false, drop: true, google: 'undecryptable' };
  if (refresh) {
    const g = await googlePost(REVOKE_URL, revokeForm(refresh));
    res = revokeOutcome(g.status, g.json, { threw: g.threw });
  }
  let removed = false;
  if (res.drop) {
    const { error: delErr } = await svc.from('google_tokens').delete().eq('user_id', target);
    removed = !delErr;
  }
  console.warn('[google-token] revoke', res.google);
  return json(res.drop ? 200 : 502, { revoked: res.revoked, removed, google: res.google });
});
