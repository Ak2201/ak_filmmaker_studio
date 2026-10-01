#!/usr/bin/env node
/**
 * live-checks.mjs — run the live checks from docs/SECURITY-RLS.md against a
 * real Supabase project.
 *
 * WHY THIS EXISTS
 * ---------------
 * docs/SECURITY-RLS.md is a static audit of supabase-schema.sql. It found
 * three high-severity holes by reading, and sections 7 and 10 of the schema
 * fix them. A fix nobody re-tested is a fix nobody has. The document ends with
 * a list of live checks that need two real signed-in accounts, and that list
 * was a manual checklist nobody was going to work through twice. This turns it
 * into one command.
 *
 * The document makes the argument for itself better than I can, in its own
 * LIVE CHECK 1 §F1: "a line-by-line reading of the SQL produced a careful
 * audit and twenty correct observations, and could not see that the thing did
 * not run."
 *
 * It is a DEV TOOL. Nothing in src/ imports it, it is not an entry in
 * vite.config.js, and scripts/ is outside the build, so it cannot reach dist/
 * or the service worker's precache manifest.
 *
 * HOW TO ADD A CHECK
 * ------------------
 * Append an entry to the CHECKS array in section 7. Each entry declares what
 * it needs (`needs: ['mutate', 'A', 'B']`) and the runner turns an unmet need
 * into a NOT RUN line with the reason, so nothing has to be threaded through a
 * sequence of if-statements. Checks run in array order and share one `ctx`, so
 * an entry may leave something behind for a later one (L5 leaves a comment for
 * L6 and L7). The claim_invite() checks under "CLAIM_INVITE (§11)" in
 * docs/SECURITY-RLS.md are expected to land this way — see docs/LIVE-CHECKS.md.
 *
 * WHAT IT WILL NOT DO
 * -------------------
 *  - It will not accept a service_role / secret key. Most of these checks ask
 *    "what can a client holding the PUBLIC key do?" — a service_role key is
 *    BYPASSRLS, so every one of them would pass and prove nothing. The key is
 *    inspected and the run aborts if it is a secret. See assertPublishableKey().
 *  - It will not write anything without --mutate.
 *  - It will not touch a project it did not create in this run. There is
 *    deliberately no env var for "the project to test against".
 *  - It will not report a skipped check as a passing one. A check that could
 *    not run says NOT RUN and makes the whole run exit non-zero.
 *
 * USAGE
 * -----
 *   npm run live-checks                 # read-only. Writes nothing.
 *   npm run live-checks -- --mutate     # the full set. Creates and removes rows.
 *   npm run live-checks -- --mutate --keep
 *   npm run live-checks -- --json
 *
 * See docs/LIVE-CHECKS.md for credentials, what each check proves, and what a
 * failure means.
 */

import { randomUUID } from 'node:crypto';
import { styleText } from 'node:util';

// ============================================================
// 1. Arguments
// ============================================================

const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f, dflt) => {
  const hit = argv.find((a) => a.startsWith(f + '='));
  return hit ? hit.slice(f.length + 1) : dflt;
};

const OPT = {
  mutate:   has('--mutate'),
  keep:     has('--keep'),
  json:     has('--json'),
  skipSlow: has('--skip-slow'),
  // How long a share link gets before it expires, for the expiry check. The
  // run sleeps a little longer than this, so bigger is slower, not safer.
  expirySeconds:   Number(valOf('--expiry-seconds', '20')),
  realtimeSeconds: Number(valOf('--realtime-seconds', '8')),
  help: has('--help') || has('-h'),
};

if (OPT.help) {
  console.log(`
live-checks.mjs — run docs/SECURITY-RLS.md's live checks against a real project.

  --mutate              Perform the checks that must create and delete rows.
                        Without it they report NOT RUN. Nothing is written.
  --keep                Leave the rows this run created behind (for inspection).
  --json                Emit the results as JSON on stdout instead of a table.
  --skip-slow           Report the expiry and realtime checks as NOT RUN rather
                        than waiting for them.
  --expiry-seconds=N    Share lifetime for the expiry check (default 20).
  --realtime-seconds=N  How long to listen for realtime payloads (default 8).

Environment — see docs/LIVE-CHECKS.md:
  FMS_SUPABASE_URL          required   https://<ref>.supabase.co
  FMS_SUPABASE_ANON_KEY     required   the anon / publishable key ONLY
  FMS_A_ACCESS_TOKEN        account A's user JWT   (or FMS_A_REFRESH_TOKEN)
  FMS_B_ACCESS_TOKEN        account B's user JWT   (or FMS_B_REFRESH_TOKEN)
  FMS_A_ACCOUNT_ID          optional   a throwaway multi-seat account, for L9

Exit codes: 0 everything ran and passed · 1 at least one FAIL
            2 could not start · 3 ran, nothing failed, but incomplete.
`.trim());
  process.exit(0);
}

// ============================================================
// 2. Environment, secrets and the key-safety gate
// ============================================================

const ENV = {
  url:  (process.env.FMS_SUPABASE_URL || '').replace(/\/+$/, ''),
  anon: process.env.FMS_SUPABASE_ANON_KEY || '',
  A: {
    access:   process.env.FMS_A_ACCESS_TOKEN  || '',
    refresh:  process.env.FMS_A_REFRESH_TOKEN || '',
    email:    process.env.FMS_A_EMAIL         || '',
    password: process.env.FMS_A_PASSWORD      || '',
  },
  B: {
    access:   process.env.FMS_B_ACCESS_TOKEN  || '',
    refresh:  process.env.FMS_B_REFRESH_TOKEN || '',
    email:    process.env.FMS_B_EMAIL         || '',
    password: process.env.FMS_B_PASSWORD      || '',
  },
  // The one object this harness is allowed to use without having created it,
  // and the reason is structural rather than convenient. Live check 9 needs an
  // account with spare seats; accounts.seat_limit defaults to 1 and check L8
  // proves a client holding the public key cannot raise it. So a multi-seat
  // account can only be prepared with the service key in the SQL editor, which
  // this harness deliberately cannot do. Point it at a THROWAWAY account —
  // making someone an admin of an account grants them edit on every project in
  // it. The run adds and removes member rows and never deletes the account.
  aAccountId: process.env.FMS_A_ACCOUNT_ID || '',
};

/**
 * Nothing in this file ever prints a credential. Anything that might contain
 * one goes through redact() first. Server responses are echoed into the
 * report, so this runs over those too — GoTrue happily returns a fresh
 * access_token and refresh_token in a sign-in body.
 */
const SECRETS = [];
function registerSecret(s) {
  if (typeof s === 'string' && s.length >= 12 && !SECRETS.includes(s)) SECRETS.push(s);
}
function redact(text) {
  let out = String(text ?? '');
  for (const s of SECRETS) out = out.split(s).join('«redacted»');
  // Belt and braces: anything shaped like a JWT or a Supabase key, including
  // one this run never held.
  out = out.replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}/g, '«jwt»');
  out = out.replace(/sb_(secret|publishable)_[A-Za-z0-9_-]{8,}/g, 'sb_$1_«redacted»');
  return out;
}

/** Decode a legacy Supabase key (a JWT) far enough to read its `role` claim. */
function jwtRole(key) {
  const parts = key.split('.');
  if (parts.length !== 3) return null;   // the new sb_publishable_… format
  try {
    const body = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return typeof body.role === 'string' ? body.role : null;
  } catch { return null; }
}

/**
 * The single most important safety rule in this file.
 *
 * Checks like "an anonymous caller sees no rows" and "a comment guest cannot
 * write the document" are statements about the public key. A service_role key
 * is BYPASSRLS; every one of those checks would pass with one, and the pass
 * would be meaningless. So the key is inspected and a secret is a hard stop,
 * not a warning — a warning is something you scroll past.
 */
function assertPublishableKey(key) {
  if (/^sb_secret_/.test(key)) return 'FMS_SUPABASE_ANON_KEY holds a secret key (sb_secret_…).';
  const role = jwtRole(key);
  if (role && role !== 'anon') {
    return `FMS_SUPABASE_ANON_KEY holds a key whose role claim is "${role}", not "anon".`;
  }
  return null;
}

/**
 * Refuse to run beside a service key, too. We never read these; the point is
 * that a secret sitting in the same shell is one shell-history arrow-up from
 * being the value in FMS_SUPABASE_ANON_KEY.
 */
const STRAY_SECRET_VARS = Object.keys(process.env).filter((k) =>
  /SERVICE_ROLE|SERVICE_KEY|SECRET_KEY/.test(k) && (/^FMS_/.test(k) || /SUPABASE/.test(k)));

// ============================================================
// 3. The result recorder
// ============================================================

const PASS = 'PASS', FAIL = 'FAIL', SKIP = 'NOT RUN', AMBIG = 'AMBIGUOUS', INFO = 'INFO';
const results = [];

function record(id, source, title, status, detail) {
  results.push({ id, source, title, status, detail: redact(detail) });
  if (OPT.json) return;
  const paint = {
    [PASS]:  (s) => styleText('green', s),
    [FAIL]:  (s) => styleText(['red', 'bold'], s),
    [SKIP]:  (s) => styleText('yellow', s),
    [AMBIG]: (s) => styleText('magenta', s),
    [INFO]:  (s) => styleText('cyan', s),
  }[status];
  console.log(`${paint(status.padEnd(9))} ${id.padEnd(16)} ${title}`);
  if (detail) {
    for (const line of wrap(redact(detail), 92)) {
      console.log(styleText('gray', `${' '.repeat(28)}${line}`));
    }
  }
}

function wrap(text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/)) {
      if (line && (line + ' ' + word).length > width) { out.push(line); line = word; }
      else line = line ? line + ' ' + word : word;
    }
    out.push(line);
  }
  return out;
}

const pass  = (detail) => ({ status: PASS,  detail });
const fail  = (detail) => ({ status: FAIL,  detail });
const skip  = (detail) => ({ status: SKIP,  detail });
const ambig = (detail) => ({ status: AMBIG, detail });
const info  = (detail) => ({ status: INFO,  detail });

// ============================================================
// 4. HTTP
// ============================================================

const authFor = (session) => (session ? session.accessToken : ENV.anon);

/**
 * A network failure is not a check result. DNS that does not resolve, a
 * project that has been paused, a laptop with no wifi — each would otherwise
 * throw out of whichever check ran first and take the rest of the run with it.
 * They come back as a response object instead, so every check reaches its own
 * NOT RUN line.
 */
async function safeFetch(url, init) {
  try {
    const res = await fetch(url, init);
    return { res, text: await res.text(), networkError: null };
  } catch (err) {
    const msg = (err && ((err.cause && err.cause.message) || err.message)) || String(err);
    return { res: null, text: '', networkError: msg };
  }
}

async function rest(method, path, { session = null, body = null, prefer = null } = {}) {
  const headers = {
    apikey: ENV.anon,
    Authorization: `Bearer ${authFor(session)}`,
    Accept: 'application/json',
  };
  if (body !== null) headers['Content-Type'] = 'application/json';
  if (prefer) headers.Prefer = prefer;

  const { res, text, networkError } = await safeFetch(`${ENV.url}/rest/v1${path}`, {
    method, headers, body: body === null ? undefined : JSON.stringify(body),
  });
  if (networkError) {
    return { status: 0, ok: false, json: null, text: '', code: null, rows: null,
             message: null, networkError };
  }
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON body */ }
  const obj = json && !Array.isArray(json) ? json : null;
  return {
    status: res.status, ok: res.ok, json, text, networkError: null,
    code: obj ? (obj.code || null) : null,
    message: obj ? (obj.message || obj.msg || null) : null,
    rows: Array.isArray(json) ? json : null,
  };
}

const sel = (path, opts) => rest('GET', path, opts);
const ins = (path, body, opts = {}) =>
  rest('POST', path, { ...opts, body, prefer: opts.prefer || 'return=representation' });
const upd = (path, body, opts = {}) =>
  rest('PATCH', path, { ...opts, body, prefer: opts.prefer || 'return=representation' });
const del = (path, opts = {}) =>
  rest('DELETE', path, { ...opts, prefer: opts.prefer || 'return=representation' });
const rpc = (fn, args = {}, opts = {}) => rest('POST', `/rpc/${fn}`, { ...opts, body: args });

async function gotrue(method, path, { body = null, token = null, query = '' } = {}) {
  const headers = { apikey: ENV.anon, Accept: 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== null) headers['Content-Type'] = 'application/json';
  const { res, text, networkError } = await safeFetch(`${ENV.url}/auth/v1${path}${query}`, {
    method, headers, body: body === null ? undefined : JSON.stringify(body),
  });
  if (networkError) return { status: 0, ok: false, json: null, text: '', networkError };
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  return { status: res.status, ok: res.ok, json, text, networkError: null };
}

/** A one-line, credential-free rendering of a response, for the report. */
function describe(r) {
  if (!r) return '(no response)';
  if (r.networkError) return `the server could not be reached (${r.networkError})`;
  const bits = [`HTTP ${r.status}`];
  if (r.code) bits.push(r.code);
  if (r.message) bits.push(JSON.stringify(r.message));
  if (!r.code && !r.message) {
    const body = (r.text || '').slice(0, 200);
    bits.push(body === '' ? '(empty body)' : body);
  }
  return bits.join(' · ');
}

/**
 * `42501` is insufficient_privilege — both what RLS raises on a WITH CHECK
 * violation and what every guard trigger in schema section 7 raises
 * explicitly. PostgREST answers it as 401 or 403 depending on version, so the
 * code is what we assert on and the status is only reported.
 */
const isRlsRefused = (r) => r.code === '42501';

/**
 * Did an attempted write fail to happen, by either route?
 *
 * A policy can stop a write two ways and the difference is not a security
 * difference: a WITH CHECK or a guard trigger raises 42501, while a USING
 * clause that excludes the row matches nothing and PostgREST answers 200 [].
 * Both mean the attack did not land. The checks assert that nothing landed and
 * record which route refused it, rather than demanding 42501 and failing on a
 * policy that was merely written the other way.
 */
function wasBlocked(r) {
  if (r.networkError) return { blocked: null, how: describe(r) };
  if (isRlsRefused(r)) return { blocked: true, how: `42501 (${describe(r)})` };
  if (r.ok && Array.isArray(r.rows) && r.rows.length === 0) {
    return { blocked: true, how: 'matched no row — the USING clause excluded it' };
  }
  if (r.ok && Array.isArray(r.rows) && r.rows.length > 0) return { blocked: false, how: 'IT LANDED' };
  return { blocked: true, how: describe(r) };
}

/** A response that never arrived is indeterminate, never a finding. */
function unreachable(...responses) {
  const dead = responses.find((r) => r && r.networkError);
  return dead ? skip(`the server could not be reached (${dead.networkError})`) : null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ZERO_UUID = '00000000-0000-0000-0000-000000000000';

// ============================================================
// 5. Sessions
// ============================================================

let passwordGrantWorked = false;

/**
 * Resolve an identity to an access token. Three routes, in order of how well
 * they fit this project's own setup:
 *
 *  1. FMS_<L>_ACCESS_TOKEN — a user JWT lifted out of a signed-in browser.
 *     The route for a Google-only project, which is what this one now is:
 *     cloud.js ships exactly one auth call, signInWithGoogle().
 *  2. FMS_<L>_REFRESH_TOKEN — the same, but survives the hour-long expiry.
 *  3. FMS_<L>_EMAIL + _PASSWORD — only works if the Email provider is on,
 *     which supabase-schema.sql's header says to disable. If this route
 *     succeeds the run says so, because it is evidence for check PS1.
 */
async function resolveSession(label) {
  const cfg = ENV[label];
  registerSecret(cfg.access);
  registerSecret(cfg.refresh);
  registerSecret(cfg.password);

  let accessToken = '', via = '';

  if (cfg.access) {
    accessToken = cfg.access;
    via = `FMS_${label}_ACCESS_TOKEN`;
  } else if (cfg.refresh) {
    const r = await gotrue('POST', '/token', {
      query: '?grant_type=refresh_token', body: { refresh_token: cfg.refresh },
    });
    if (!r.ok || !r.json || !r.json.access_token) {
      return { error: `the refresh token for ${label} was rejected: ${r.networkError || `HTTP ${r.status}`}` };
    }
    registerSecret(r.json.access_token);
    registerSecret(r.json.refresh_token);
    accessToken = r.json.access_token;
    via = `FMS_${label}_REFRESH_TOKEN`;
  } else if (cfg.email && cfg.password) {
    const r = await gotrue('POST', '/token', {
      query: '?grant_type=password', body: { email: cfg.email, password: cfg.password },
    });
    if (!r.ok || !r.json || !r.json.access_token) {
      return { error: `password sign-in for ${label} was rejected: ` +
                      `${r.networkError || `HTTP ${r.status}`} — which is the CORRECT answer if ` +
                      `the Email provider is disabled as supabase-schema.sql's header requires. ` +
                      `Use FMS_${label}_ACCESS_TOKEN or FMS_${label}_REFRESH_TOKEN instead.` };
    }
    registerSecret(r.json.access_token);
    registerSecret(r.json.refresh_token);
    accessToken = r.json.access_token;
    via = `FMS_${label}_EMAIL/_PASSWORD (password grant — see PS1)`;
    passwordGrantWorked = true;
  } else {
    return { error: `no credentials for ${label}` };
  }

  registerSecret(accessToken);
  const who = await gotrue('GET', '/user', { token: accessToken });
  if (!who.ok || !who.json || !who.json.id) {
    return { error: `${label}'s token did not identify a user: ` +
                    `${who.networkError || `HTTP ${who.status}`}. An access token lifted from a ` +
                    `browser expires in about an hour — use FMS_${label}_REFRESH_TOKEN instead.` };
  }
  return {
    label, accessToken, via,
    userId: who.json.id,
    email: who.json.email || '',
    isAnonymous: who.json.is_anonymous === true,
  };
}

// ============================================================
// 6. The owned-objects ledger
// ============================================================

/**
 * "Never target a project the script did not create." Everything this run
 * makes is registered here and every destructive call goes through
 * assertOwned(). There is deliberately no way to point the harness at an
 * existing project: the destructive checks (delete a share, delete a comment,
 * delete a project) are not things to run against real work.
 */
const RUN_TAG = `live-check ${new Date().toISOString()} ${randomUUID().slice(0, 8)}`;
const owned = { projects: new Set(), accounts: new Set(), comments: new Set(), shares: new Set() };

function own(kind, id) { owned[kind].add(id); return id; }
function assertOwned(kind, id) {
  if (!owned[kind].has(id)) {
    throw new Error(`refusing to touch ${kind} ${id}: this run did not create it`);
  }
  return id;
}

const TABLES = ['projects', 'project_data', 'project_collaborators', 'shares',
                'comments', 'accounts', 'account_members'];

// --- helpers the checks share --------------------------------------

async function createShare(ctx, role, expiresAt) {
  const token = `lc-${randomUUID()}`;
  const r = await ins('/shares', {
    project_id: ctx.project.id, role, token, expires_at: expiresAt, created_by: ctx.A.userId,
  }, { session: ctx.A });
  if (!r.ok || !r.rows || !r.rows[0]) {
    throw new Error(`A could not create a ${role} share: ${describe(r)}`);
  }
  own('shares', r.rows[0].id);
  return { id: r.rows[0].id, token, role };
}

const claimAs = (session, token) => rpc('claim_share', { p_token: token }, { session });

/** The anonymous sweep of all seven tables, fetched once and shared. */
function makeSweep() {
  let cached = null;
  return async () => {
    if (cached) return cached;
    cached = {};
    for (const t of TABLES) cached[t] = await sel(`/${t}?select=*&limit=5`);
    return cached;
  };
}

/** The GoTrue settings document, fetched once and shared by PS1/PS2/PS4. */
function makeSettings() {
  let cached = null;
  return async () => (cached ||= await gotrue('GET', '/settings'));
}

// ============================================================
// 7. THE CHECKS
// ============================================================
//
// One entry per check. `needs` is declarative — the runner turns an unmet need
// into a NOT RUN line carrying the reason, so no check has to open with a
// ladder of if-statements. Entries run in array order and share one ctx, so a
// check may leave something for a later one; where that happens it is named.
//
// `source` cites where in docs/SECURITY-RLS.md the check comes from. Two
// entries say "task requirement" instead: PS1 and PS2 existed as an
// instruction before the audit's "still open" #6 was written, and that item
// now covers them.

const CHECKS = [

  // ---- provider settings: not SQL, and no policy can compensate ----
  //
  // "Google only" is two facts and this repository can only supply one. The
  // client ships exactly one auth call (signInWithGoogle in cloud.js) — that
  // is the markup. The other half is a dashboard setting, because Supabase
  // mints a session for any enabled provider and the /auth/v1 endpoints take
  // the public anon key that ships in the browser bundle. A provider no button
  // points at is still a working way in.

  {
    id: 'PS1',
    source: 'still open #6 · supabase-schema.sql header · task requirement',
    title: 'Email sign-in is disabled at the provider',
    run: async () => {
      const settings = await _settings();
      if (!settings.ok || !settings.json) {
        return skip(`GET /auth/v1/settings → ${settings.networkError || `HTTP ${settings.status}`}; ` +
          `the provider configuration could not be read with the publishable key. Check ` +
          `Authentication → Providers by hand: Email must be OFF.`);
      }
      const ext = settings.json.external || {};
      // Corroborate without sending a single email. A password grant against a
      // bogus address says which provider answered: email_provider_disabled
      // versus invalid_credentials. No email, no account, no side effect.
      const probe = await gotrue('POST', '/token', {
        query: '?grant_type=password',
        body: { email: `live-check-${randomUUID()}@example.com`, password: randomUUID() },
      });
      const errCode = (probe.json && (probe.json.error_code || probe.json.error)) || '';
      const errText = (probe.json && (probe.json.msg || probe.json.error_description)) || '';
      const probeSaysOff = /email_provider_disabled|provider is disabled|unsupported|not enabled/i
        .test(`${errCode} ${errText}`);
      const detail = `settings.external.email = ${ext.email} · password-grant probe → ` +
                     `HTTP ${probe.status} ${errCode || '(no error_code)'}`;

      if (ext.email === true) {
        return fail(`the Email provider is ENABLED. ${detail}. It covers both magic link and ` +
          `email+password, so an account can be created and a session minted without ever ` +
          `touching Google — signInWithOtp() can be called straight against ` +
          `${ENV.url}/auth/v1/otp with the key that ships in the bundle. "Google only" ` +
          `describes the markup and not the project. Turn Email off in Authentication → Providers.`);
      }
      if (passwordGrantWorked) {
        return fail(`settings report Email as off, yet this run signed an identity in with ` +
          `FMS_*_EMAIL/_PASSWORD, so the password grant works. Trust the behaviour, not the ` +
          `flag. ${detail}`);
      }
      if (ext.email !== false) {
        return skip(`settings.external.email is ${JSON.stringify(ext.email)} — this GoTrue does ` +
          `not report the flag, so it was not determined. ${detail}. Check by hand.`);
      }
      return pass(`${detail}${probeSaysOff ? ' (the probe agrees)' : ''}`);
    },
  },

  {
    id: 'PS2',
    source: 'still open #6 · supabase-schema.sql header · task requirement',
    title: 'Anonymous sign-in is off at the provider',
    run: async () => {
      const settings = await _settings();
      if (!settings.ok || !settings.json) {
        return skip(`GET /auth/v1/settings → ${settings.networkError || `HTTP ${settings.status}`}; ` +
          `the provider configuration could not be read. Check Authentication → Providers by hand.`);
      }
      const ext = settings.json.external || {};
      if (ext.anonymous_users === true) {
        return fail(`settings.external.anonymous_users = true. This is the sharper of the two: ` +
          `an anonymous session has a non-null auth.uid(), which satisfies the "is the caller ` +
          `signed in?" half of EVERY policy in supabase-schema.sql — including claim_share()'s ` +
          `own sign-in gate. Turn it off in Authentication → Providers.`);
      }
      if (ext.anonymous_users !== false) {
        return skip(`settings.external.anonymous_users is ${JSON.stringify(ext.anonymous_users)} — ` +
          `this GoTrue does not report the flag, so it was not determined. Check by hand.`);
      }
      if (!OPT.mutate) {
        return pass(`settings.external.anonymous_users = false (declared; --mutate also attempts ` +
          `an actual anonymous signup, because a flag is not behaviour)`);
      }
      // The active probe. If it succeeds it has created a user, which IS the
      // finding; the message says so with the id to delete.
      const probe = await gotrue('POST', '/signup', { body: {} });
      if (probe.ok && probe.json && (probe.json.access_token || probe.json.user)) {
        const uid = (probe.json.user && probe.json.user.id) || '(id not returned)';
        return fail(`an anonymous signup SUCCEEDED despite the flag reading false. A user now ` +
          `exists: ${uid}. Delete it in Authentication → Users and turn anonymous sign-ins off.`);
      }
      return pass(`settings.external.anonymous_users = false · POST /auth/v1/signup {} → ` +
        `HTTP ${probe.status} ${(probe.json && probe.json.error_code) || ''}`);
    },
  },

  {
    id: 'PS3',
    source: 'still open #6 · supabase-schema.sql header',
    title: 'Google is the ONLY sign-in provider enabled',
    run: async () => {
      const settings = await _settings();
      if (!settings.ok || !settings.json) {
        return skip(`GET /auth/v1/settings → ${settings.networkError || `HTTP ${settings.status}`}; ` +
          `the provider list could not be read. Check Authentication → Providers by hand.`);
      }
      const ext = settings.json.external || {};
      // `email` and `anonymous_users` have their own checks above; this one is
      // about everything else the header names — Apple, GitHub, phone/SMS,
      // SAML and the rest. Default-off, so this is a check rather than a change.
      const others = Object.entries(ext)
        .filter(([k, v]) => v === true && k !== 'google' && k !== 'email' && k !== 'anonymous_users')
        .map(([k]) => k);
      if (!('google' in ext)) {
        return skip(`settings.external does not list google, so this GoTrue's provider report ` +
          `cannot be read the way this check expects: ${JSON.stringify(ext)}`);
      }
      if (ext.google !== true) {
        return fail(`settings.external.google = ${ext.google}. The app ships exactly one auth ` +
          `call, signInWithGoogle(), so with Google off nobody can sign in at all.`);
      }
      if (others.length) {
        return fail(`providers enabled that no button points at: ${others.join(', ')}. ` +
          `Each is still reachable, because the anon key is public by design and anyone can ` +
          `call this project's /auth/v1 endpoints directly. Disable them in ` +
          `Authentication → Providers.`);
      }
      return pass(`google = true; nothing else enabled besides the two covered by PS1 and PS2`);
    },
  },

  {
    id: 'PS4',
    source: '"what would leak one user\'s projects to another" §4',
    title: 'The key this run used is the publishable one, not a secret',
    run: async () => {
      if (/^sb_publishable_/.test(ENV.anon)) return pass('sb_publishable_… key');
      if (jwtRole(ENV.anon) === 'anon') return pass('legacy JWT whose role claim is "anon"');
      return info('the key format was not recognised. assertPublishableKey() found nothing to ' +
        'object to, but could not positively confirm this is the anon key. The day somebody ' +
        'pastes a service key into the config box, every policy in SECURITY-RLS.md stops mattering.');
    },
  },

  // ---- anonymous, read-only, the public key ------------------------

  {
    id: 'A1',
    source: 'LIVE CHECK 1 §F1 / LIVE CHECK 2 §F1',
    title: 'No policy recursion (42P17) on any table, anonymously',
    run: async () => {
      const sweep = await _sweep();
      const un = unreachable(...Object.values(sweep)); if (un) return un;
      const bad = TABLES.filter((t) => sweep[t].code === '42P17' || sweep[t].status >= 500);
      if (bad.length) {
        return fail(`${bad.map((t) => `${t}: ${describe(sweep[t])}`).join(' | ')} — a mutual ` +
          `loop between policies on two tables. Postgres names the relation you entered ` +
          `through, so the error names the door, not the room: read pg_policies for every ` +
          `table in the cycle, not just the one in the message.`);
      }
      return pass(TABLES.map((t) => `${t}: ${sweep[t].status}`).join(' '));
    },
  },

  {
    id: 'A2',
    source: 'LIVE CHECK 2 §F2 / LIVE CHECK 3',
    title: 'All seven tables resolve (sections 6 and 7 are deployed)',
    run: async () => {
      const sweep = await _sweep();
      const un = unreachable(...Object.values(sweep)); if (un) return un;
      const missing = TABLES.filter((t) => sweep[t].code === 'PGRST205' || sweep[t].code === '42P01');
      if (missing.length) {
        return fail(`absent or not in the schema cache: ${missing.join(', ')}. ` +
          `Sections 6 and 7 of supabase-schema.sql may not have run, in which case everything ` +
          `section 7 hardened — share expiry and revocation, the account-move escalation, ` +
          `comment author-name leakage, comment status forgery — is unfixed live.`);
      }
      return pass(TABLES.join(', '));
    },
  },

  // Audit "check 0". Ambiguous by nature and it stays that way until a real
  // row is known to exist: with RLS on and no matching policy a SELECT returns
  // an empty set rather than an error, so an empty table and a working policy
  // look identical. Reporting this as a pass is exactly the failure mode this
  // harness is built to avoid.
  ...['projects', 'project_data', 'comments', 'shares'].map((t) => ({
    id: `A3.${t}`,
    source: 'live check 0',
    title: `anon SELECT ${t} returns no rows`,
    run: async (ctx) => {
      const sweep = await _sweep();
      const r = sweep[t];
      const un = unreachable(r); if (un) return un;
      if (!Array.isArray(r.rows)) return fail(describe(r));
      if (r.rows.length > 0) {
        return fail(`LEAK: ${r.rows.length} row(s) of ${t} visible to an anonymous caller ` +
          `holding only the publishable key — ${describe(r)}`);
      }
      if (!ctx.rowKnownToExist[t]) {
        return ambig(`HTTP 200 [] — but this run cannot prove ${t} holds any row, and RLS with ` +
          `no matching policy returns an empty set rather than an error, so an empty table and ` +
          `a working policy look identical. Run with --mutate; check R1 is the resolution.`);
      }
      return pass(`HTTP 200 [] while ${ctx.rowKnownToExist[t]} — the policy is doing the work`);
    },
  })),

  {
    id: 'A4',
    source: 'Enumeration',
    title: 'anon SELECT project_collaborators / accounts / account_members returns no rows',
    run: async () => {
      const sweep = await _sweep();
      const subset = ['project_collaborators', 'accounts', 'account_members'];
      const un = unreachable(...subset.map((t) => sweep[t])); if (un) return un;
      const leaky = subset.filter((t) => Array.isArray(sweep[t].rows) && sweep[t].rows.length > 0);
      if (leaky.length) return fail(`LEAK in ${leaky.join(', ')}`);
      const broken = subset.filter((t) => !Array.isArray(sweep[t].rows));
      if (broken.length) return fail(broken.map((t) => `${t}: ${describe(sweep[t])}`).join(' | '));
      return ambig('HTTP 200 [] on all three — the same ambiguity as A3: nothing here proves ' +
        'these tables hold a row. The write-side refusals (A6, A7) are the unambiguous half.');
    },
  },

  {
    id: 'A5',
    source: 'live check 0 · LIVE CHECK 2 §F1',
    title: 'has_project_access() answers false to anon, and project_owner_is_caller() exists',
    run: async () => {
      const hpa = await rpc('has_project_access', { pid: ZERO_UUID, min_role: 'view' });
      const poc = await rpc('project_owner_is_caller', { pid: ZERO_UUID });
      const un = unreachable(hpa, poc); if (un) return un;
      if (poc.code === 'PGRST202') {
        return fail(`project_owner_is_caller is not in the schema cache, so schema section 9 has ` +
          `not run — and it is section 9 that removes project_collaborators' outgoing RLS edge ` +
          `and so the recursion A1 tests for. ${describe(poc)}`);
      }
      // These three keep their anon grants on purpose: a policy that invokes a
      // function the caller cannot execute ERRORS rather than returning false,
      // which would break every share-link read.
      if (hpa.json !== false) return fail(`has_project_access → ${describe(hpa)} (expected false)`);
      if (poc.json !== false) return fail(`project_owner_is_caller → ${describe(poc)} (expected false)`);
      return pass('has_project_access → false · project_owner_is_caller → false');
    },
  },

  {
    id: 'A6',
    source: 'LIVE CHECK 3 verification table',
    title: 'anon INSERT into projects and accounts is refused by RLS, not by the gateway',
    run: async () => {
      // Attempted even in a dry run: an INSERT that RLS refuses writes nothing,
      // and if it is not refused, that is the finding.
      const p = await ins('/projects', { title: RUN_TAG, format: 'feature' });
      const a = await ins('/accounts', { name: RUN_TAG });
      const un = unreachable(p, a); if (un) return un;
      if (p.ok || a.ok) {
        return fail(`AN ANONYMOUS INSERT SUCCEEDED — projects: ${describe(p)} | accounts: ` +
          `${describe(a)}. A row tagged "${RUN_TAG}" now exists and an anonymous caller cannot ` +
          `remove it; delete it with the service key.`);
      }
      if (!isRlsRefused(p) || !isRlsRefused(a)) {
        return fail(`refused, but not with 42501, which means the gateway turned it away rather ` +
          `than a policy — projects: ${describe(p)} | accounts: ${describe(a)}`);
      }
      return pass(`projects: ${describe(p)} | accounts: ${describe(a)}`);
    },
  },

  {
    id: 'A7',
    source: 'LIVE CHECK 3 §F3',
    title: 'account_owner / account_role are NOT callable by anon (no membership oracle)',
    run: async () => {
      const probes = {
        account_owner: await rpc('account_owner', { aid: ZERO_UUID }),
        account_role:  await rpc('account_role',  { aid: ZERO_UUID }),
      };
      const un = unreachable(...Object.values(probes)); if (un) return un;
      const open = Object.entries(probes).filter(([, r]) => r.ok);
      if (open.length) {
        return fail(`CALLABLE BY ANON with the publishable key: ` +
          open.map(([n, r]) => `${n} → ${describe(r)}`).join(' | ') + ` — an anonymous ` +
          `account-membership oracle. These were granted to authenticated deliberately and to ` +
          `PUBLIC by accident: Postgres grants EXECUTE to PUBLIC on every new function, and ` +
          `"revoke ... from authenticated, anon" does not touch that grant. Check proacl.`);
      }
      const notDenied = Object.entries(probes)
        .filter(([, r]) => r.code !== '42501' && r.code !== 'PGRST202');
      if (notDenied.length) return fail(notDenied.map(([n, r]) => `${n} → ${describe(r)}`).join(' | '));
      return pass(Object.entries(probes).map(([n, r]) => `${n}: ${describe(r)}`).join(' | '));
    },
  },

  {
    id: 'A8',
    source: 'LIVE CHECK 3 §F3',
    title: 'purge_expired_shares is NOT callable by anon',
    // Split from A7 because this one is not a read. If F3 has regressed and the
    // function IS callable, calling it DELETES every expired row from `shares`.
    // There is no way to ask Postgres "may I?" without finding out by doing it
    // — a permission check that passes runs the body.
    needs: ['mutate'],
    skipReason: {
      mutate: 'this probe is destructive if it succeeds — the function deletes rows from ' +
        '`shares`, and permission can only be tested by calling it. This is the regression ' +
        'test for F3, the one live finding that was exploitable with nothing but the key that ' +
        'ships in the browser bundle.',
    },
    run: async () => {
      const r = await rpc('purge_expired_shares', {});
      const un = unreachable(r); if (un) return un;
      if (r.ok) {
        return fail(`CALLABLE BY ANON with the publishable key, and it has just deleted ` +
          `${JSON.stringify(r.json)} expired share row(s). F3 has regressed: §7.1's ` +
          `"revoke execute ... from authenticated, anon" does not touch the default PUBLIC ` +
          `grant. Add "revoke execute on function public.purge_expired_shares() from public;" ` +
          `and verify with proacl. ${describe(r)}`);
      }
      if (r.code !== '42501' && r.code !== 'PGRST202') return fail(describe(r));
      return pass(describe(r));
    },
  },

  {
    id: 'A9',
    source: 'LIVE CHECK 3 verification table',
    title: 'resolve_share() answers anon with no row for a token that does not exist',
    run: async () => {
      const r = await rpc('resolve_share', { p_token: `lc-no-such-token-${randomUUID()}` });
      const un = unreachable(r); if (un) return un;
      if (!r.ok) return fail(describe(r));
      if (!Array.isArray(r.rows) || r.rows.length !== 0) return fail(`expected [], got ${describe(r)}`);
      return pass('HTTP 200 [] — the token is the whole authentication and a wrong one yields nothing');
    },
  },

  // ---- the read side, with a real row ------------------------------

  {
    id: 'R1',
    source: 'LIVE CHECK 3 "still open" #1 — "the last cheap check"',
    title: 'With a real row in the database, an anonymous caller still sees nothing',
    needs: ['project'],
    run: async (ctx) => {
      const probes = {};
      for (const t of ['projects', 'project_data', 'comments']) {
        probes[t] = await sel(`/${t}?select=*&limit=5`);
      }
      const un = unreachable(...Object.values(probes)); if (un) return un;
      const leaky = Object.entries(probes).filter(([, r]) => Array.isArray(r.rows) && r.rows.length > 0);
      if (leaky.length) {
        return fail(`LEAK: ${leaky.map(([t, r]) => `${t} returned ${r.rows.length} row(s)`).join(', ')} ` +
          `to an anonymous caller holding only the publishable key.`);
      }
      const broken = Object.entries(probes).filter(([, r]) => !Array.isArray(r.rows));
      if (broken.length) return fail(broken.map(([t, r]) => `${t}: ${describe(r)}`).join(' | '));
      return pass(`projects, project_data and comments each hold at least one row created by ` +
        `this run, and all three return HTTP 200 [] anonymously. The ambiguity that survived ` +
        `three live runs is closed.`);
    },
  },

  {
    id: 'R2',
    source: 'Enumeration',
    title: 'A signed-in stranger (B, holding no grant) sees none of A\'s rows',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const probes = {
        projects: await sel(`/projects?select=*&id=eq.${ctx.project.id}`, { session: ctx.B }),
      };
      for (const t of ['project_data', 'comments', 'shares', 'project_collaborators']) {
        probes[t] = await sel(`/${t}?select=*&project_id=eq.${ctx.project.id}`, { session: ctx.B });
      }
      const un = unreachable(...Object.values(probes)); if (un) return un;
      const leaky = Object.entries(probes).filter(([, r]) => Array.isArray(r.rows) && r.rows.length > 0);
      if (leaky.length) {
        return fail(`B holds no grant on this project and still sees ` +
          leaky.map(([t, r]) => `${t} (${r.rows.length})`).join(', '));
      }
      return pass('projects, project_data, comments, shares, project_collaborators — all [] for B');
    },
  },

  // ---- the numbered live checks ------------------------------------

  {
    id: 'L1',
    source: 'live check 1',
    title: 'A comment-role guest cannot write project_data',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const share = await createShare(ctx, 'comment', null);
      const claim = await claimAs(ctx.B, share.token);
      if (!claim.ok) return skip(`B could not claim the comment link: ${describe(claim)}`);

      // Reading must be allowed, and checking it matters: otherwise a later
      // "0 rows" is indistinguishable from having no access at all.
      const read = await sel(`/project_data?select=scope&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      if (!read.rows || read.rows.length === 0) {
        return skip(`B claimed 'comment' but reads no project_data, so a write refusal below ` +
          `would prove nothing: ${describe(read)}`);
      }
      const insert = await ins('/project_data', {
        project_id: ctx.project.id, scope: 'locations', data: { live_check: 'should not land' },
      }, { session: ctx.B });
      const update = await upd(`/project_data?project_id=eq.${ctx.project.id}&scope=eq.feature`,
        { data: { live_check: 'should not land' } }, { session: ctx.B });

      if (insert.ok && insert.rows && insert.rows.length) {
        return fail(`a comment-role guest INSERTED project_data. This is the single most ` +
          `important thing in the schema: pd_write asks for 'edit', which only matches ` +
          `c.role = 'edit', so comment-only sharing is supposed to be read-only for the ` +
          `document. ${describe(insert)}`);
      }
      const ub = wasBlocked(update);
      if (ub.blocked === false) {
        return fail(`a comment-role guest UPDATED project_data: ${describe(update)}`);
      }
      await del(`/shares?id=eq.${assertOwned('shares', share.id)}`, { session: ctx.A });
      return pass(`B reads ${read.rows.length} scope(s) · INSERT ${describe(insert)} · ` +
        `UPDATE ${ub.how}`);
    },
  },

  {
    id: 'L2',
    source: 'live check 2 · finding P1 (HIGH)',
    title: 'An edit collaborator cannot move the project into an account they own',
    needs: ['project', 'B', 'bAccount'],
    run: async (ctx) => {
      const share = await createShare(ctx, 'edit', null);
      const claim = await claimAs(ctx.B, share.token);
      if (!claim.ok) return skip(`B could not claim the edit link: ${describe(claim)}`);

      // Positive control: B really does hold edit, so a refusal below is the
      // guard and not an absence of access.
      const control = await upd(`/projects?id=eq.${ctx.project.id}`,
        { title: `${RUN_TAG} (renamed by B)` }, { session: ctx.B });
      if (!control.rows || control.rows.length === 0) {
        return skip(`B claimed 'edit' but cannot even rename the project, so the move refusal ` +
          `below would prove nothing: ${describe(control)}`);
      }
      const move = await upd(`/projects?id=eq.${ctx.project.id}`,
        { account_id: ctx.bAccountId }, { session: ctx.B });
      const b = wasBlocked(move);
      if (b.blocked === null) return unreachable(move);
      if (!b.blocked) {
        return fail(`AN EDIT COLLABORATOR MOVED THE PROJECT into their own account. ` +
          `projects.account_id is read by has_project_access(), which grants an account's ` +
          `owner/admin edit unconditionally — so their access no longer depends on the ` +
          `collaborator row, and revoking the share does nothing. Then acc_delete lets them ` +
          `delete that account and accounts.id cascades to projects: the whole film, every ` +
          `project_data row and every comment. A guest invited to make notes can delete the ` +
          `film. ${describe(move)}`);
      }
      ctx.editShare = share;   // L3 reuses this claimed link
      return pass(`rename by B: ${control.rows.length} row, so B really holds edit · move: ${b.how}`);
    },
  },

  {
    id: 'L3',
    source: 'live check 3 · finding S1 (HIGH)',
    title: 'Deleting the shares row removes an already-claimed grant',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const share = ctx.editShare || await createShare(ctx, 'edit', null);
      if (!ctx.editShare) {
        const c = await claimAs(ctx.B, share.token);
        if (!c.ok) return skip(`B could not claim the link: ${describe(c)}`);
      }
      const before = await sel(`/project_data?select=scope&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      if (!before.rows || before.rows.length === 0) {
        return skip(`B does not read project_data before the revoke, so losing it afterwards ` +
          `proves nothing: ${describe(before)}`);
      }
      const revoke = await del(`/shares?id=eq.${assertOwned('shares', share.id)}`, { session: ctx.A });
      if (!revoke.ok) return skip(`A could not delete the shares row: ${describe(revoke)}`);
      ctx.editShare = null;

      const after = await sel(`/project_data?select=scope&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      const grant = await sel(
        `/project_collaborators?select=role,via_share&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      const un = unreachable(after, grant); if (un) return un;

      if (after.rows && after.rows.length > 0) {
        return fail(`B still reads ${after.rows.length} project_data row(s) after the link was ` +
          `revoked. project_collaborators.via_share is not cascading, which means a 7-day link ` +
          `is a 7-day window to claim PERMANENT access, and the revoke button's "Anyone using ` +
          `it will lose access" is a lie. ${describe(after)}`);
      }
      if (grant.rows && grant.rows.length > 0) {
        return fail(`the project_collaborators row survived the revoke: ${JSON.stringify(grant.rows)}`);
      }
      return pass(`before the revoke B read ${before.rows.length} scope(s); after, 0 — and the ` +
        `collaborator row went with the link`);
    },
  },

  {
    id: 'L4',
    source: 'live check 4 · findings S1, F4',
    title: 'An expired grant loses SELECT *and* UPDATE',
    needs: ['project', 'B', 'slow'],
    run: async (ctx) => {
      const expiresAt = new Date(Date.now() + OPT.expirySeconds * 1000).toISOString();
      const share = await createShare(ctx, 'edit', expiresAt);
      const claim = await claimAs(ctx.B, share.token);
      if (!claim.ok) return skip(`B could not claim the short-lived link: ${describe(claim)}`);

      const before = await sel(`/project_data?select=scope&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      if (!before.rows || before.rows.length === 0) {
        return skip(`B does not read project_data while the link is live: ${describe(before)}`);
      }
      await sleep((OPT.expirySeconds + 5) * 1000);

      const read  = await sel(`/project_data?select=scope&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      const write = await upd(`/projects?id=eq.${ctx.project.id}`,
        { title: `${RUN_TAG} (written after expiry)` }, { session: ctx.B });
      const un = unreachable(read, write); if (un) return un;

      const problems = [];
      if (read.rows && read.rows.length > 0) {
        problems.push(`SELECT still returns ${read.rows.length} row(s) after expiry`);
      }
      if (write.rows && write.rows.length > 0) {
        problems.push(`UPDATE on projects still LANDS after expiry — finding F4: proj_update ` +
          `carried an inline collaborator test with no expiry condition, so an expired ` +
          `collaborator lost SELECT and kept UPDATE. Silent in the worst way: the app shows ` +
          `them nothing while their writes still land`);
      }
      await del(`/shares?id=eq.${assertOwned('shares', share.id)}`, { session: ctx.A });
      if (problems.length) return fail(problems.join(' | '));
      return pass(`while live, B read ${before.rows.length} scope(s); ${OPT.expirySeconds}s later ` +
        `SELECT returns 0 rows and UPDATE is blocked (${describe(write)})`);
    },
  },

  {
    id: 'L5',
    source: 'live check 5 · findings C1, C4/F5',
    title: 'A comment author cannot set their own suggestion to accepted',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const share = await createShare(ctx, 'comment', null);
      const claim = await claimAs(ctx.B, share.token);
      if (!claim.ok) return skip(`B could not claim the comment link: ${describe(claim)}`);

      const made = await ins('/comments', {
        project_id: ctx.project.id, scope: 'feature', field_key: 'live_check_field',
        body: 'A suggestion from B, for the status-forgery check.',
        type: 'suggestion', suggest_from: 'before', suggest_to: 'after',
        // Deliberately wrong, to prove comments_set_author overrides both.
        author_name: 'should be ignored by the trigger', author_id: ctx.A.userId,
      }, { session: ctx.B });
      if (!made.ok || !made.rows || !made.rows[0]) {
        return skip(`B could not insert a suggestion, so there is nothing to forge: ${describe(made)}`);
      }
      const row = made.rows[0];
      own('comments', row.id);
      ctx.bComment = row;   // L6 and L7 build on this

      // Positive control: B can edit their own comment's body, so a block on
      // status is comments_guard rather than a blanket denial.
      const control = await upd(`/comments?id=eq.${row.id}`,
        { body: 'B edits their own note, which is allowed.' }, { session: ctx.B });
      const forge = await upd(`/comments?id=eq.${row.id}`, { status: 'accepted' }, { session: ctx.B });
      const fb = wasBlocked(forge);
      if (fb.blocked === null) return unreachable(forge);

      if (!fb.blocked || (forge.rows && forge.rows[0] && forge.rows[0].status === 'accepted')) {
        return fail(`B set status='accepted' on their own suggestion. The underlying field value ` +
          `never changes, so what this produces is a lie in the record: a suggestion that reads ` +
          `as approved by the writer and was not. In a tool whose entire point is tracking what ` +
          `was agreed, that is the interesting attack, not data loss. ${describe(forge)}`);
      }
      if (!control.rows || control.rows.length === 0) {
        return ambig(`the status change was blocked (${fb.how}) — but B cannot edit their own ` +
          `comment body either, so this may be a blanket denial rather than comments_guard.`);
      }
      // C4 / F5: the comment must not be movable between projects.
      let movedHow = null;
      if (ctx.bProjectId) {
        const moved = await upd(`/comments?id=eq.${row.id}`,
          { project_id: ctx.bProjectId }, { session: ctx.B });
        const mb = wasBlocked(moved);
        if (mb.blocked === false) {
          return fail(`status was correctly blocked, but B MOVED the comment into another ` +
            `project, taking its scope and field_key with it — findings C4 and F5, cm_update's ` +
            `WITH CHECK: ${describe(moved)}`);
        }
        movedHow = mb.how;
      }
      return pass(`body edit by B: allowed (${control.rows.length} row) · status='accepted': ` +
        `${fb.how}${movedHow ? ` · project_id move: ${movedHow}` : ''}`);
    },
  },

  {
    id: 'L6',
    source: 'live check 6 · finding C2',
    title: 'Deleting a root comment with replies is refused, and threads cap at one level',
    needs: ['project', 'B', 'bComment'],
    run: async (ctx) => {
      const reply = await ins('/comments', {
        project_id: ctx.project.id, scope: 'feature', field_key: 'live_check_field',
        body: "A's reply, which B must not be able to destroy.",
        parent_id: ctx.bComment.id, author_name: 'ignored',
      }, { session: ctx.A });
      if (!reply.ok || !reply.rows || !reply.rows[0]) {
        return skip(`A could not reply to B's comment: ${describe(reply)}`);
      }
      own('comments', reply.rows[0].id);

      const nuke = await del(`/comments?id=eq.${ctx.bComment.id}`, { session: ctx.B });
      const still = await sel(`/comments?select=id&id=eq.${reply.rows[0].id}`, { session: ctx.A });
      const nb = wasBlocked(nuke);
      if (nb.blocked === null) return unreachable(nuke);
      if (!nb.blocked) {
        return fail(`B deleted their root comment. parent_id references comments(id) on delete ` +
          `cascade, so A's reply went with it — other people's writing, removed by someone with ` +
          `no permission to touch it. A's reply still present: ` +
          `${still.rows ? still.rows.length : '?'}. ${describe(nuke)}`);
      }
      // §7.5 also caps depth: a reply to a reply means unbounded cascade.
      const deep = await ins('/comments', {
        project_id: ctx.project.id, scope: 'feature', field_key: 'live_check_field',
        body: 'A reply to a reply — unbounded depth means unbounded cascade.',
        parent_id: reply.rows[0].id, author_name: 'ignored',
      }, { session: ctx.A });
      if (deep.ok && deep.rows && deep.rows[0]) {
        own('comments', deep.rows[0].id);
        return fail(`the thread depth cap is not in place: a reply to a reply was accepted ` +
          `(${describe(deep)}). parent_id was entirely unconstrained before §7.5 — a reply ` +
          `could point at a comment in a different project, scope or field.`);
      }
      return pass(`B's delete of a replied-to root: ${nb.how} · A's reply survives · ` +
        `reply-to-a-reply: ${describe(deep)}`);
    },
  },

  {
    id: 'L7',
    source: 'live check 7 · finding C3',
    title: 'author_name carries no email address',
    needs: ['project', 'B', 'bComment'],
    run: async (ctx) => {
      const seen = await sel(`/comments?select=id,author_id,author_name&id=eq.${ctx.bComment.id}`,
        { session: ctx.A });
      const un = unreachable(seen); if (un) return un;
      if (!seen.rows || !seen.rows[0]) return skip(`A cannot read B's comment: ${describe(seen)}`);
      const row = seen.rows[0];
      const problems = [];
      if (typeof row.author_name === 'string' && row.author_name.includes('@')) {
        problems.push(`author_name contains '@'. cm_select shows every comment on a project to ` +
          `anyone holding a view link, so sending one hands over the email address of everyone ` +
          `who ever commented — the director, the producer, the crew. Nobody consented to that ` +
          `by writing a note`);
      }
      if (ctx.B.email && row.author_name === ctx.B.email) {
        problems.push("author_name is B's full email address");
      }
      if (row.author_id !== ctx.B.userId) {
        problems.push(`author_id is ${row.author_id}, not B's id — comments_set_author did not ` +
          `override the client-supplied value, and this run deliberately sent A's`);
      }
      if (problems.length) return fail(problems.join(' | '));
      const shown = String(row.author_name || '');
      return pass(`author_name = ${JSON.stringify(shown.length > 40 ? shown.slice(0, 40) + '…' : shown)}` +
        ` · no '@' · author_id forced to B's id although the client sent A's`);
    },
  },

  {
    id: 'L8',
    source: 'live check 8 · finding A1 (HIGH, billing)',
    title: 'An account owner cannot write plan, seat_limit or storage_limit_mb',
    needs: ['A', 'aAccount'],
    run: async (ctx) => {
      const id = ctx.aAccountId;
      const probes = {
        seat_limit:       await upd(`/accounts?id=eq.${id}`, { seat_limit: 9999 },        { session: ctx.A }),
        plan:             await upd(`/accounts?id=eq.${id}`, { plan: 'pro' },             { session: ctx.A }),
        storage_limit_mb: await upd(`/accounts?id=eq.${id}`, { storage_limit_mb: 999999 }, { session: ctx.A }),
      };
      const un = unreachable(...Object.values(probes)); if (un) return un;
      // Positive control: A can rename their own account.
      const control = await upd(`/accounts?id=eq.${id}`, { name: `${RUN_TAG} (renamed)` },
        { session: ctx.A });

      const outcomes = Object.entries(probes).map(([k, r]) => [k, r, wasBlocked(r)]);
      const landed = outcomes.filter(([, , b]) => b.blocked === false);
      if (landed.length) {
        return fail(`the customer wrote their own ${landed.map(([k]) => k).join(', ')}. ` +
          `enforce_seat_limit() is correct, and the limit it enforces is a column the person ` +
          `being limited can set to 9999 with one PATCH against the public REST endpoint — so ` +
          `the ceiling rises before the trigger checks it. ` +
          landed.map(([k, r]) => `${k}: ${describe(r)}`).join(' | '));
      }
      if (!control.rows || control.rows.length === 0) {
        return ambig(`all three were blocked, but A cannot rename their own account either ` +
          `(${describe(control)}), so this may be a blanket denial rather than accounts_guard.`);
      }
      return pass(`${outcomes.map(([k, , b]) => `${k}: ${b.how}`).join(' | ')} · rename control: allowed`);
    },
  },

  {
    id: 'L9',
    source: 'live check 9 · findings A2, A3 (HIGH), A5',
    title: "An account admin cannot mint an owner row, remove the owner's, or seize owner_id",
    // The one numbered check with a precondition the harness cannot create for
    // itself, and the reason is worth stating rather than burying: the attack
    // needs an account with at least three seats (A as owner, B as the
    // escalating admin, one spare for the owner row B tries to mint).
    // accounts.seat_limit defaults to 1, and check L8 is the proof that a
    // client holding the public key cannot raise it. The two checks are in
    // tension by design, so the account has to be prepared once with the
    // service key in the SQL editor.
    needs: ['A', 'B', 'preparedAccount'],
    run: async (ctx) => {
      const acct = ENV.aAccountId;
      const seen = await sel(`/accounts?select=id,owner_id,seat_limit&id=eq.${acct}`, { session: ctx.A });
      const un = unreachable(seen); if (un) return un;
      if (!seen.rows || !seen.rows[0]) {
        return skip(`A cannot read account ${acct} (${describe(seen)}) — check that ` +
          `FMS_A_ACCOUNT_ID names an account owned by the identity in FMS_A_*`);
      }
      if (seen.rows[0].owner_id !== ctx.A.userId) {
        return skip(`account ${acct} is owned by ${seen.rows[0].owner_id}, not by A. Refusing to ` +
          `write member rows on an account A does not own.`);
      }
      if (!ctx.B.email) {
        return skip('B\'s email is unknown (account_members is keyed on invited_email), so B ' +
          'cannot be made an admin. Supply a token for an identity whose /auth/v1/user ' +
          'response carries an email.');
      }

      const addedRows = [];
      try {
        // Setup: an owner member row for A — the row B will try to demote and
        // delete — and an active admin row for B.
        const ownerRow = await ins('/account_members', {
          account_id: acct, invited_email: ctx.A.email || `lc-owner-${randomUUID()}@example.com`,
          user_id: ctx.A.userId, role: 'owner', status: 'active', invited_by: ctx.A.userId,
        }, { session: ctx.A, prefer: 'return=representation,resolution=merge-duplicates' });
        if (ownerRow.ok && ownerRow.rows && ownerRow.rows.length) {
          addedRows.push(ownerRow.rows[0].invited_email);
        }
        const adminRow = await ins('/account_members', {
          account_id: acct, invited_email: ctx.B.email, user_id: ctx.B.userId,
          role: 'admin', status: 'active', invited_by: ctx.A.userId,
        }, { session: ctx.A, prefer: 'return=representation,resolution=merge-duplicates' });
        if (!adminRow.ok || !adminRow.rows || !adminRow.rows.length) {
          if (adminRow.code === '53400') {
            return skip(`the seat limit refused the invite (53400 — findings A5, A7). Account ` +
              `${acct} needs seat_limit >= 3; it reports ${seen.rows[0].seat_limit}. ` +
              `${describe(adminRow)}`);
          }
          return skip(`A could not make B an admin, so B is not an admin and every refusal ` +
            `below would prove nothing: ${describe(adminRow)}`);
        }
        addedRows.push(adminRow.rows[0].invited_email);

        // Positive control: am_select admits an owner/admin, so a real admin
        // reads the member rows. Without this, "every escalation was refused"
        // cannot be told apart from "B is not a member at all".
        const control = await sel(`/account_members?select=role,status&account_id=eq.${acct}`,
          { session: ctx.B });
        const isAdmin = Array.isArray(control.rows) && control.rows.length > 0;

        const mintEmail = `lc-owner-${randomUUID()}@example.com`;
        const probes = {
          'mint an owner row': await ins('/account_members', {
            account_id: acct, invited_email: mintEmail,
            role: 'owner', status: 'active', invited_by: ctx.B.userId,
          }, { session: ctx.B }),
          "demote the owner's row": await upd(
            `/account_members?account_id=eq.${acct}&role=eq.owner`,
            { role: 'member' }, { session: ctx.B }),
          "delete the owner's row": await del(
            `/account_members?account_id=eq.${acct}&role=eq.owner`, { session: ctx.B }),
          'seize accounts.owner_id': await upd(`/accounts?id=eq.${acct}`,
            { owner_id: ctx.B.userId }, { session: ctx.B }),
          'reassign a claimed seat': await upd(
            `/account_members?account_id=eq.${acct}` +
            `&invited_email=eq.${encodeURIComponent(ctx.B.email)}`,
            { user_id: ctx.A.userId }, { session: ctx.B }),
        };
        if (probes['mint an owner row'].ok && probes['mint an owner row'].rows &&
            probes['mint an owner row'].rows.length) {
          addedRows.push(mintEmail);
        }
        const un2 = unreachable(...Object.values(probes)); if (un2) return un2;

        const outcomes = Object.entries(probes).map(([k, r]) => [k, r, wasBlocked(r)]);
        const landed = outcomes.filter(([, , b]) => b.blocked === false);
        if (landed.length) {
          return fail(`AN ADMIN ESCALATED — ${landed.map(([k]) => k).join('; ')}. From owner, ` +
            `A2's path reaches accounts.owner_id, and has_project_access's account branch ` +
            `grants edit on EVERY project in the account, with the real owner locked out. ` +
            landed.map(([k, r]) => `${k}: ${describe(r)}`).join(' | '));
        }
        // A seat-limit refusal is a block for the wrong reason: it says the
        // account was full, not that the guard said no.
        const wrongReason = outcomes.filter(([, r]) => r.code === '53400');
        if (wrongReason.length) {
          return ambig(`nothing landed, but ${wrongReason.map(([k]) => k).join(', ')} was ` +
            `stopped by the seat limit (53400) rather than by account_members_guard. Give ` +
            `FMS_A_ACCOUNT_ID an account with more spare seats and re-run.`);
        }
        if (!isAdmin) {
          return ambig(`nothing landed, but B does not read account_members either ` +
            `(${describe(control)}), so B may not be an active admin and these refusals may be ` +
            `the ordinary non-member denial rather than the guard.`);
        }
        return pass(`B is an active admin (reads ${control.rows.length} member row(s)) · ` +
          outcomes.map(([k, , b]) => `${k}: ${b.how}`).join(' · '));
      } finally {
        // Only the rows this check added, on an account it does not own and
        // will never delete.
        for (const email of addedRows) {
          await del(`/account_members?account_id=eq.${acct}` +
            `&invited_email=eq.${encodeURIComponent(email)}`, { session: ctx.A });
        }
      }
    },
  },

  {
    id: 'L10',
    source: 'live check 10 · Enumeration caveat',
    title: 'A realtime subscriber with no access receives no INSERT, UPDATE or DELETE payload',
    needs: ['project', 'B', 'slow'],
    run: (ctx) => realtimeCheck(ctx),
  },

  // ---- regressions named in the live-run sections ------------------

  {
    id: 'F6',
    source: 'LIVE CHECK 3 §F6',
    title: 'A project owner cannot mint a share row attributed to someone else',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const r = await ins('/shares', {
        project_id: ctx.project.id, role: 'view', token: `lc-forged-${randomUUID()}`,
        created_by: ctx.B.userId,
      }, { session: ctx.A });
      const b = wasBlocked(r);
      if (b.blocked === null) return unreachable(r);
      if (!b.blocked) {
        own('shares', r.rows[0].id);
        return fail(`A created a shares row with created_by = B. Section 9 replaced ` +
          `sh_owner_write's WITH CHECK wholesale and dropped the created_by = auth.uid() ` +
          `conjunct with it. Rewriting a policy to fix its USING clause quietly rewrites its ` +
          `WITH CHECK too — diff both. ${describe(r)}`);
      }
      return pass(b.how);
    },
  },

  {
    id: 'P1b',
    source: 'findings P1, P2',
    title: 'Even the owner cannot hand projects.owner_id to another user',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const r = await upd(`/projects?id=eq.${ctx.project.id}`,
        { owner_id: ctx.B.userId }, { session: ctx.A });
      const b = wasBlocked(r);
      if (b.blocked === null) return unreachable(r);
      if (!b.blocked) {
        return fail(`owner_id was reassigned by a PATCH — projects_guard_owner is absent or not ` +
          `firing. ${describe(r)}`);
      }
      return pass(b.how);
    },
  },

  {
    id: 'D1',
    source: 'finding D1',
    title: 'project_data.updated_by is forced to auth.uid(), not taken from the client',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const r = await upd(`/project_data?project_id=eq.${ctx.project.id}&scope=eq.feature`,
        { data: { live_check: 'updated_by probe' }, updated_by: ctx.B.userId }, { session: ctx.A });
      const un = unreachable(r); if (un) return un;
      if (!r.ok || !r.rows || !r.rows.length) {
        return skip(`A could not write their own project_data row: ${describe(r)}`);
      }
      if (r.rows[0].updated_by === ctx.B.userId) {
        return fail(`updated_by came back as the value the client sent (B's id) while A was ` +
          `writing. cloud.js uses this column as the realtime self-echo guard, so an editor who ` +
          `stamps a collaborator's id onto every write makes that collaborator's browser ` +
          `discard every incoming change: their screen silently stops matching the document, ` +
          `with no error anywhere. ${describe(r)}`);
      }
      if (r.rows[0].updated_by !== ctx.A.userId) {
        return fail(`updated_by is ${r.rows[0].updated_by}, which is neither the ` +
          `client-supplied value nor A's id`);
      }
      return pass("the client sent B's id while A was writing; the row came back stamped with A's");
    },
  },

  {
    id: 'S4b',
    source: '§4 "An edit collaborator cannot create a share link"',
    title: 'An edit collaborator cannot re-delegate access downward',
    needs: ['project', 'B'],
    run: async (ctx) => {
      const share = await createShare(ctx, 'edit', null);
      const claim = await claimAs(ctx.B, share.token);
      if (!claim.ok) return skip(`B could not claim the edit link: ${describe(claim)}`);
      const mint = await ins('/shares', {
        project_id: ctx.project.id, role: 'edit', token: `lc-redelegate-${randomUUID()}`,
        created_by: ctx.B.userId,
      }, { session: ctx.B });
      const read = await sel(`/shares?select=token&project_id=eq.${ctx.project.id}`,
        { session: ctx.B });
      await del(`/shares?id=eq.${assertOwned('shares', share.id)}`, { session: ctx.A });
      const un = unreachable(mint, read); if (un) return un;

      const b = wasBlocked(mint);
      if (!b.blocked) {
        own('shares', mint.rows[0].id);
        return fail(`an edit collaborator created a share link — access can be re-delegated ` +
          `downward and the owner never sees it. ${describe(mint)}`);
      }
      if (read.rows && read.rows.length) {
        return fail(`an edit collaborator READ ${read.rows.length} share token(s) on the ` +
          `project. sh_owner_select is supposed to be owner-only, and the token is the whole ` +
          `authentication: a bearer credential anyone who forwards it forwards the access to.`);
      }
      return pass(`create: ${b.how} · read shares: ${describe(read)}`);
    },
  },

  {
    id: 'A8b',
    source: 'LIVE CHECK 3 §F3',
    title: 'purge_expired_shares is not callable by an ordinary signed-in user either',
    needs: ['A', 'mutate'],
    skipReason: {
      mutate: 'destructive if it succeeds — see A8. The function deletes rows from `shares`.',
    },
    run: async (ctx) => {
      const r = await rpc('purge_expired_shares', {}, { session: ctx.A });
      const un = unreachable(r); if (un) return un;
      if (r.ok) {
        return fail(`a signed-in user deleted rows from shares: ${describe(r)}. §7.1's revoke ` +
          `names authenticated and anon and does not touch the default PUBLIC grant; check proacl.`);
      }
      if (r.code !== '42501' && r.code !== 'PGRST202') return fail(describe(r));
      return pass(describe(r));
    },
  },

  {
    id: 'A6b',
    source: 'finding A6 · still open #4',
    title: 'claim_invite() — the account-invite gap',
    needs: ['A'],
    run: async (ctx) => {
      const r = await rpc('claim_invite', { p_token: 'probe' }, { session: ctx.A });
      const un = unreachable(r); if (un) return un;
      if (r.code === 'PGRST202' || r.status === 404) {
        return info(`confirmed still absent (${describe(r)}). account_members.user_id stays null ` +
          `until an invite is claimed and nothing claims one; am_select matches on ` +
          `user_id = auth.uid(), which is null, so an invitee cannot even see the invite. ` +
          `A known functional gap, not a security hole. If schema section 11 lands, this check ` +
          `flips to INFO "implemented" and the nine CLAIM_INVITE (§11) checks in ` +
          `docs/SECURITY-RLS.md become the thing to add here.`);
      }
      return info(`something now answers rpc/claim_invite: ${describe(r)}. If schema section 11 ` +
        `has landed, append the nine CLAIM_INVITE (§11) checks from docs/SECURITY-RLS.md to the ` +
        `CHECKS array — this harness does not cover them yet.`);
    },
  },
];

// Memoised fetches the checks above share. Declared after CHECKS because the
// entries only call them at run time.
const _sweep = makeSweep();
const _settings = makeSettings();

// ============================================================
// 8. Realtime
// ============================================================

/**
 * Audit live check 10. Two halves, and the second is what makes the first mean
 * anything:
 *
 *  - B subscribes to pd:<A's project> holding no grant, and must receive
 *    nothing for an INSERT, an UPDATE and a DELETE. All three, because DELETE
 *    payloads are documented as not RLS-filtered the way INSERT and UPDATE
 *    are: a DELETE event carries only the replica identity unless REPLICA
 *    IDENTITY FULL is set.
 *  - A subscribes to the same channel and must receive something.
 *
 * Without the positive control, "B received nothing" cannot be told apart from
 * "realtime is off for this project" or "the channel never subscribed" — a
 * skipped check reading as a passing one, which is the trap CLAUDE.md names
 * about the verify gate.
 */
async function realtimeCheck(ctx) {
  let createClient;
  try {
    ({ createClient } = await import('@supabase/supabase-js'));
  } catch (err) {
    return skip(`@supabase/supabase-js is not installed in this checkout, so the realtime ` +
      `socket cannot be opened: ${err && err.message}. Run npm install.`);
  }

  const pid = ctx.project.id;
  const clients = [];
  const mk = (session) => {
    const c = createClient(ENV.url, ENV.anon, {
      auth: { persistSession: false, autoRefreshToken: false },
      realtime: { params: { eventsPerSecond: 20 } },
    });
    c.realtime.setAuth(session.accessToken);
    clients.push(c);
    return c;
  };

  const listen = (client, label) => {
    const got = [];
    const ch = client.channel(`pd:${pid}`).on('postgres_changes',
      { event: '*', schema: 'public', table: 'project_data', filter: `project_id=eq.${pid}` },
      (payload) => got.push(payload.eventType || payload.type || 'event'));
    return new Promise((resolve) => {
      let settled = false;
      const done = (status) => { if (!settled) { settled = true; resolve({ label, status, got }); } };
      ch.subscribe((status) => {
        if (['SUBSCRIBED', 'CHANNEL_ERROR', 'TIMED_OUT', 'CLOSED'].includes(status)) done(status);
      });
      setTimeout(() => done('NO_CALLBACK'), 10000);
    });
  };

  try {
    const bSub = await listen(mk(ctx.B), 'B');
    const aSub = await listen(mk(ctx.A), 'A');

    if (bSub.status !== 'SUBSCRIBED' || aSub.status !== 'SUBSCRIBED') {
      return skip(`a channel did not subscribe (A: ${aSub.status}, B: ${bSub.status}). A channel ` +
        `that never subscribed receives nothing, which would read as a pass. Check that ` +
        `Realtime is enabled for this project and that project_data is in the ` +
        `supabase_realtime publication.`);
    }

    const scope = 'workbench';
    await del(`/project_data?project_id=eq.${pid}&scope=eq.${scope}`, { session: ctx.A });
    await sleep(500);
    const i = await ins('/project_data',
      { project_id: pid, scope, data: { live_check: 'realtime insert' } }, { session: ctx.A });
    await sleep(800);
    const u = await upd(`/project_data?project_id=eq.${pid}&scope=eq.${scope}`,
      { data: { live_check: 'realtime update' } }, { session: ctx.A });
    await sleep(800);
    const d = await del(`/project_data?project_id=eq.${pid}&scope=eq.${scope}`, { session: ctx.A });
    await sleep(OPT.realtimeSeconds * 1000);

    if (!i.ok || !u.rows || !u.rows.length) {
      return skip(`A's own writes did not land (insert ${describe(i)}, update ${describe(u)}), ` +
        `so there was nothing for either subscriber to receive`);
    }
    if (aSub.got.length === 0) {
      return skip(`realtime delivered nothing even to the project's OWNER after an insert, an ` +
        `update and a delete. B receiving nothing therefore proves nothing — it cannot be told ` +
        `apart from realtime being off. Enable Realtime for project_data and re-run. (A's ` +
        `writes: insert ${i.status}, update ${u.status}, delete ${d.status}.)`);
    }
    if (bSub.got.length > 0) {
      return fail(`B holds no grant on this project and received ${bSub.got.length} realtime ` +
        `payload(s): ${bSub.got.join(', ')}. The channel name is guessable. Move to Realtime ` +
        `Authorization (private channels) rather than relying on postgres_changes. (The owner ` +
        `received ${aSub.got.length}.)`);
    }
    return pass(`the owner received ${aSub.got.length} payload(s) (${aSub.got.join(', ')}); B, ` +
      `with no grant, received 0 — including on the DELETE`);
  } finally {
    for (const c of clients) {
      try { await c.removeAllChannels(); } catch { /* closing down */ }
      try { c.realtime.disconnect(); } catch { /* closing down */ }
    }
  }
}

// ============================================================
// 9. Setup and teardown
// ============================================================

async function setup(ctx) {
  if (!OPT.mutate) {
    console.log(styleText('yellow',
      '\n  DRY RUN. Nothing will be written. Every check that must create rows reports NOT RUN.' +
      '\n  Pass --mutate to run them; docs/LIVE-CHECKS.md lists exactly what gets created.\n'));
    return;
  }
  if (!ctx.A) {
    console.log(styleText('yellow',
      '\n  --mutate was passed but there is no session for A, so there is nothing to create.\n'));
    return;
  }
  console.log(styleText('cyan', `\n  Creating this run's objects, each tagged "${RUN_TAG}":`));

  const proj = await ins('/projects',
    { title: RUN_TAG, format: 'feature', owner_id: ctx.A.userId }, { session: ctx.A });
  if (!proj.ok || !proj.rows || !proj.rows[0]) {
    console.log(styleText('yellow', `  · project: FAILED — ${describe(proj)}`));
    return;
  }
  ctx.project = { id: own('projects', proj.rows[0].id) };
  console.log(`  · project ${ctx.project.id}`);

  for (const scope of ['feature', 'scenes']) {
    const r = await ins('/project_data',
      { project_id: ctx.project.id, scope, data: { live_check: RUN_TAG } }, { session: ctx.A });
    console.log(`  · project_data/${scope}: ${r.ok ? 'created' : describe(r)}`);
  }
  const seed = await ins('/comments', {
    project_id: ctx.project.id, scope: 'feature', field_key: 'live_check_field',
    body: "A's own note, so comments holds a row for the read-side check.",
    author_name: 'ignored by the trigger',
  }, { session: ctx.A });
  if (seed.ok && seed.rows && seed.rows[0]) {
    own('comments', seed.rows[0].id);
    console.log('  · comment: created');
  } else {
    console.log(`  · comment: ${describe(seed)}`);
  }

  // Now the anonymous sweep's `[]` means something — check R1.
  ctx.rowKnownToExist.projects = 'this run owns a project row';
  ctx.rowKnownToExist.project_data = 'this run owns project_data rows';
  if (seed.ok) ctx.rowKnownToExist.comments = 'this run owns a comment row';

  // One account each. A's is for L8; B's is the destination an edit
  // collaborator must not be able to move the project into. Deliberately NOT
  // linked to ctx.project: accounts cascade to projects, and a teardown that
  // deletes an account must not be able to take the project with it.
  for (const [label, session, key] of [['A', ctx.A, 'aAccountId'], ['B', ctx.B, 'bAccountId']]) {
    if (!session) continue;
    const r = await ins('/accounts', { name: `${RUN_TAG} (${label})`, owner_id: session.userId },
      { session });
    if (r.ok && r.rows && r.rows[0]) {
      ctx[key] = own('accounts', r.rows[0].id);
      console.log(`  · account for ${label}: ${ctx[key]}`);
    } else {
      console.log(styleText('yellow',
        `  · account for ${label}: ${describe(r)} — the checks needing it will report NOT RUN`));
    }
  }

  // A second project owned by B, the destination for L5's comment-move probe.
  if (ctx.B) {
    const r = await ins('/projects',
      { title: `${RUN_TAG} (B)`, format: 'short', owner_id: ctx.B.userId }, { session: ctx.B });
    if (r.ok && r.rows && r.rows[0]) {
      ctx.bProjectId = own('projects', r.rows[0].id);
      console.log(`  · project for B: ${ctx.bProjectId}`);
    }
  }
  console.log('');
}

async function teardown(ctx) {
  if (!OPT.mutate) return;
  if (OPT.keep) {
    console.log(styleText('yellow',
      `\n  --keep: leaving this run's rows in place. They are tagged "${RUN_TAG}".\n`));
    return;
  }
  console.log(styleText('cyan', "\n  Removing this run's objects:"));
  const report = [];

  // Shares and comments first, so a surviving row shows up as its own line
  // rather than vanishing silently inside a project cascade.
  for (const id of owned.shares) {
    const r = await del(`/shares?id=eq.${assertOwned('shares', id)}`, { session: ctx.A });
    report.push(`share ${id}: ${r.ok ? 'gone' : describe(r)}`);
  }
  for (const id of owned.comments) {
    let r = await del(`/comments?id=eq.${assertOwned('comments', id)}`, { session: ctx.A });
    if ((!r.rows || !r.rows.length) && ctx.B) r = await del(`/comments?id=eq.${id}`, { session: ctx.B });
    report.push(`comment ${id}: ` +
      `${r.rows && r.rows.length ? 'gone' : 'left (it cascades with the project)'}`);
  }
  for (const id of owned.projects) {
    assertOwned('projects', id);
    let r = await del(`/projects?id=eq.${id}`, { session: ctx.A });
    if ((!r.rows || !r.rows.length) && ctx.B) r = await del(`/projects?id=eq.${id}`, { session: ctx.B });
    report.push(`project ${id}: ${r.rows && r.rows.length ? 'gone' : `LEFT BEHIND — ${describe(r)}`}`);
  }
  for (const id of owned.accounts) {
    assertOwned('accounts', id);
    for (const s of [ctx.A, ctx.B].filter(Boolean)) {
      await del(`/account_members?account_id=eq.${id}`, { session: s });
    }
    let r = await del(`/accounts?id=eq.${id}`, { session: ctx.A });
    if ((!r.rows || !r.rows.length) && ctx.B) r = await del(`/accounts?id=eq.${id}`, { session: ctx.B });
    report.push(`account ${id}: ${r.rows && r.rows.length ? 'gone' : `LEFT BEHIND — ${describe(r)}`}`);
  }

  for (const line of report) {
    console.log(/LEFT BEHIND/.test(line) ? styleText('yellow', `  · ${line}`) : `  · ${line}`);
  }
  if (report.some((l) => /LEFT BEHIND/.test(l))) {
    console.log(styleText('yellow',
      `  Anything left behind is tagged "${RUN_TAG}" and can be removed by hand.`));
  }
  console.log('');
}

// ============================================================
// 10. The runner
// ============================================================

/**
 * Turn a check's declared `needs` into the reasons it cannot run. An unmet
 * need is a NOT RUN with an explanation, never a silent omission and never a
 * pass: "a harness that reports green because it skipped everything is worse
 * than no harness".
 */
function unmetNeeds(need, ctx) {
  switch (need) {
    case 'mutate':
      return OPT.mutate ? null : '--mutate was not passed; this check has to write rows';
    case 'A':
      return ctx.A ? null : 'no session for account A (FMS_A_ACCESS_TOKEN / FMS_A_REFRESH_TOKEN)';
    case 'B':
      return ctx.B ? null : 'no session for account B (FMS_B_ACCESS_TOKEN / FMS_B_REFRESH_TOKEN)';
    case 'project':
      if (!OPT.mutate) return '--mutate was not passed, so no project was created to test against';
      if (!ctx.A) return 'no session for account A, so no project could be created';
      return ctx.project ? null : 'the test project could not be created — see the setup lines above';
    case 'aAccount':
      return ctx.aAccountId ? null
        : 'an account owned by A could not be created — see the setup lines above';
    case 'bAccount':
      return ctx.bAccountId ? null
        : 'an account owned by B could not be created, so there is nowhere to move the project to';
    case 'preparedAccount':
      return ENV.aAccountId ? null
        : 'needs FMS_A_ACCOUNT_ID — a throwaway account owned by A with seat_limit >= 3. This ' +
          "run's own account has seat_limit = 1 (the column default), one seat short of the " +
          'attack, and raising it is exactly what check L8 proves a public key cannot do. ' +
          'Prepare one with the service key in the SQL editor; docs/LIVE-CHECKS.md has the SQL.';
    case 'bComment':
      return ctx.bComment ? null : 'check L5 did not produce a comment by B to build on';
    case 'slow':
      return OPT.skipSlow ? null : null;   // handled below, inverted
    default:
      return `unknown need "${need}"`;
  }
}

async function runCheck(entry, ctx) {
  const reasons = [];
  for (const need of entry.needs || []) {
    if (need === 'slow') {
      if (OPT.skipSlow) reasons.push('--skip-slow was passed and this check has to wait');
      continue;
    }
    const why = (entry.skipReason && entry.skipReason[need]) || unmetNeeds(need, ctx);
    if (why) reasons.push(why);
  }
  if (reasons.length) {
    return record(entry.id, entry.source, entry.title, SKIP, reasons.join(' · '));
  }
  try {
    const r = await entry.run(ctx);
    if (!r) return record(entry.id, entry.source, entry.title, SKIP, 'the check returned nothing');
    record(entry.id, entry.source, entry.title, r.status, r.detail);
  } catch (err) {
    // A throw is never a pass. It is also never a fail: a thrown check did not
    // reach a verdict, and saying it failed would send someone hunting a
    // security hole that is really a broken precondition.
    record(entry.id, entry.source, entry.title, SKIP,
      `threw before it could conclude: ${err && err.message}`);
  }
}

// ============================================================
// 11. Report
// ============================================================

function reportAndExit() {
  const count = (s) => results.filter((r) => r.status === s).length;
  const failed = count(FAIL), notRun = count(SKIP), ambiguous = count(AMBIG);
  const passed = count(PASS), noted = count(INFO);
  const verdict = failed ? 'FAILED' : (notRun + ambiguous ? 'INCOMPLETE' : 'ALL CLEAR');

  if (OPT.json) {
    console.log(JSON.stringify({
      runTag: RUN_TAG,
      mode: OPT.mutate ? 'mutate' : 'dry-run',
      summary: { passed, failed, notRun, ambiguous, info: noted, total: results.length },
      verdict, results,
    }, null, 2));
  } else {
    console.log(styleText('bold', '\n  ── summary ──'));
    console.log(`  ${passed} passed · ${failed} failed · ${notRun} not run · ` +
      `${ambiguous} ambiguous · ${noted} informational · ${results.length} total`);
    if (failed) {
      console.log(styleText(['red', 'bold'],
        `\n  FAILED. ${failed} check(s) found the live database behaving differently from ` +
        `docs/SECURITY-RLS.md.\n  Every FAIL line above carries the actual server response.`));
    } else if (notRun + ambiguous) {
      console.log(styleText('yellow',
        `\n  INCOMPLETE. Nothing failed, and ${notRun + ambiguous} check(s) reached no verdict, ` +
        `so\n  this run does NOT say the schema is sound. Green here would be a lie.` +
        `\n  Read the NOT RUN and AMBIGUOUS reasons above; docs/LIVE-CHECKS.md says what each needs.`));
    } else {
      console.log(styleText(['green', 'bold'],
        `\n  ALL CLEAR. Every automatable check in docs/SECURITY-RLS.md's live list ran and ` +
        `passed.\n  The manual ones are still manual — see docs/LIVE-CHECKS.md.`));
    }
    console.log('');
  }

  if (failed) process.exit(1);
  if (notRun + ambiguous) process.exit(3);
  process.exit(0);
}

// ============================================================
// 12. Main
// ============================================================

async function main() {
  if (!OPT.json) {
    console.log(styleText('bold', '\n  live-checks — docs/SECURITY-RLS.md against a real database'));
    console.log(styleText('gray',
      `  ${new Date().toISOString()} · ${OPT.mutate ? 'MUTATE' : 'dry run'} · ` +
      `${CHECKS.length} checks registered\n`));
  }

  // --- start-up gates -----------------------------------------------
  const startupErrors = [];
  if (!ENV.url)  startupErrors.push('FMS_SUPABASE_URL is not set.');
  if (!ENV.anon) startupErrors.push('FMS_SUPABASE_ANON_KEY is not set.');
  if (ENV.anon) {
    registerSecret(ENV.anon);
    const keyProblem = assertPublishableKey(ENV.anon);
    if (keyProblem) {
      startupErrors.push(`${keyProblem} Most of these checks ask what a client holding the ` +
        `PUBLIC key can do. A service_role key is BYPASSRLS: every one of them would pass and ` +
        `prove nothing. Use the anon / publishable key. Refusing to run.`);
    }
  }
  if (STRAY_SECRET_VARS.length) {
    startupErrors.push(`a secret key appears to be in this shell's environment as ` +
      `${STRAY_SECRET_VARS.join(', ')}. This harness never uses one and will not run beside ` +
      `one — unset it, so it cannot end up in FMS_SUPABASE_ANON_KEY by accident.`);
  }

  if (startupErrors.length) {
    for (const e of startupErrors) record('ENV', 'setup', 'Credentials and configuration', SKIP, e);
    console.log(styleText(['yellow', 'bold'],
      '\n  NOT RUN — not one check executed, because the harness could not start.'));
    console.log(styleText('yellow',
      '  This is not a pass. See docs/LIVE-CHECKS.md for the environment variables.\n'));
    if (OPT.json) {
      console.log(JSON.stringify({
        runTag: RUN_TAG, mode: 'not started', verdict: 'NOT RUN',
        summary: { passed: 0, failed: 0, notRun: results.length, ambiguous: 0, info: 0,
                   total: results.length },
        results,
      }, null, 2));
    }
    process.exit(2);
  }

  const ctx = {
    A: null, B: null, project: null, bProjectId: null,
    aAccountId: null, bAccountId: null, bComment: null, editShare: null,
    rowKnownToExist: { projects: null, project_data: null, comments: null, shares: null },
  };

  // --- reachability --------------------------------------------------
  const ping = await sel('/projects?select=id&limit=1');
  if (ping.networkError) {
    record('ENV', 'setup', 'The project is reachable', SKIP,
      `${ENV.url} could not be reached: ${ping.networkError}. No check was attempted; this is ` +
      `not a pass.`);
    console.log(styleText(['yellow', 'bold'],
      '\n  NOT RUN — the project could not be reached, so nothing was verified.\n'));
    if (OPT.json) {
      console.log(JSON.stringify({ runTag: RUN_TAG, mode: 'not started', verdict: 'NOT RUN',
        summary: { passed: 0, failed: 0, notRun: 1, ambiguous: 0, info: 0, total: 1 }, results },
        null, 2));
    }
    process.exit(2);
  }

  // --- sessions ------------------------------------------------------
  for (const label of ['A', 'B']) {
    const s = await resolveSession(label);
    if (s.error) {
      record(`SESSION.${label}`, 'setup', `Session for account ${label}`, SKIP, s.error);
    } else if (s.isAnonymous) {
      record(`SESSION.${label}`, 'setup', `Session for account ${label}`, FAIL,
        `the token for ${label} belongs to an ANONYMOUS user (is_anonymous = true). Anonymous ` +
        `sign-in is supposed to be off — see PS2 — and an anonymous identity is not a valid ` +
        `stand-in for a real collaborator.`);
    } else {
      ctx[label] = s;
      record(`SESSION.${label}`, 'setup', `Session for account ${label}`, INFO,
        `user ${s.userId}` +
        `${s.email ? ` · ${s.email.replace(/^(.).*(@.*)$/, '$1…$2')}` : ' · no email in the token'}` +
        ` · via ${s.via}`);
    }
  }
  if (ctx.A && ctx.B && ctx.A.userId === ctx.B.userId) {
    record('SESSION.AB', 'setup', 'A and B are two different people', FAIL,
      'FMS_A_* and FMS_B_* resolved to the same user id. Every collaborator check would pass ' +
      'trivially, which is worse than not running them. Supply two real identities.');
    ctx.B = null;
  }

  // --- run -----------------------------------------------------------
  try {
    await setup(ctx);
    for (const entry of CHECKS) await runCheck(entry, ctx);
  } finally {
    try { await teardown(ctx); } catch (err) {
      console.log(styleText('yellow',
        `\n  teardown threw: ${redact(err && err.message)}` +
        `\n  Rows tagged "${RUN_TAG}" may remain.\n`));
    }
  }

  reportAndExit();
}

main().catch((err) => {
  console.error(styleText(['red', 'bold'], `\n  live-checks crashed: ${redact(err && err.stack)}`));
  console.error(styleText('yellow', '  No verdict was reached. This is not a pass.\n'));
  process.exit(2);
});
