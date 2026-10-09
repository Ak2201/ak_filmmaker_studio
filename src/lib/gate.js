/* ============================================================
   GATE — invite codes, the one-device lock, screening passes
   ------------------------------------------------------------
   The client half of supabase-schema.sql section 13 (PRD 2.0 §4.1,
   §4.2). The website and the Chrome extension both use it; what
   differs between them is only WHERE the short-lived things live,
   which is the `holder` below.

   WHAT THE GATE GUARDS: the cloud. Local work in this browser needs no
   code and no account and never will — a writing tool that locks
   months of somebody's work behind an invite is the worst trade this
   app could make. So a closed gate, a revoked code or a lost device
   lock PAUSES SYNC and says so. It never deletes, hides or overwrites
   anything typed here.

   IT USED TO FAIL OPEN UNTIL THE SCHEMA RAN, AND IT NO LONGER DOES.
   Every call still distinguishes "the function does not exist"
   (section 13 has not been applied to this project) from "the
   function said no" — `deployed: false` against a refusal — but the
   caller in cloud.js now treats BOTH as a closed gate. The fail-open
   version shipped so the code could land before the SQL, and what it
   produced was a studio any Google account could sync to, which is
   the one thing a gate exists to prevent. The distinction survives
   for the MESSAGE: "not switched on yet" is a sentence for the
   administrator, "no invite" is a sentence for the visitor.

   TWO ROUTES THROUGH IT NOW, not one. A code, as before. Or a REQUEST
   (schema section 14): a signed-in account with no membership asks,
   the row carries the e-mail Google attested rather than one typed
   in, and an administrator approves it from the console on
   settings.html. Approval writes the membership directly; no code is
   involved. `status()` returns where that request stands so
   invite.html can say "asked on Tuesday, waiting" instead of offering
   the form again.

   WHERE THINGS LIVE.
     pre-auth ticket  10 minutes, survives the Google redirect. Website:
                      sessionStorage (dies with the tab). Extension:
                      chrome.storage.session (dies with the browser).
                      Never localStorage, never chrome.storage.local.
     lock handle      a random id naming this browser's claim on the
                      account's one active session. Useless without the
                      account's own JWT — every RPC checks auth.uid().
                      Website: localStorage `fms_device_session_v1`,
                      shared by the tabs of one browser so two tabs are
                      one device, not a conflict with itself. It is in
                      ALL_KEYS (reset clears it) and deliberately NOT in
                      GLOBAL_KEYS, for the reason fms_drive_sync_v1 is
                      not: restored on another machine it would make
                      that machine claim this one's lock. Extension:
                      chrome.storage.session, per PRD FR-202.
   ============================================================ */

import { bumpEvent } from './funnel.js';

export const TICKET_KEY = 'fms_preauth_ticket';
export const DEVICE_SESSION_KEY = 'fms_device_session_v1';
/* The code's FORMAT, its STORAGE KEY and its LINK shapes moved to
   src/lib/invite-code.js, which imports nothing. start.html carries
   the sign-in now and must read a code out of its own URL, and this
   module is in the shared CORE chunk — importing it there would put
   the whole app on the landing page. Re-exported here so every
   existing caller of gate.js is unchanged. */
import {
  CODE_PASS_KEY, getCodePass, setCodePass, clearCodePass,
  inviteLink, startInviteLink, codeFromLocation,
  normaliseCode, formatCode
} from './invite-code.js';
export {
  CODE_PASS_KEY, getCodePass, setCodePass, clearCodePass,
  inviteLink, startInviteLink, codeFromLocation,
  normaliseCode, formatCode
};

export const HEARTBEAT_MS = 30000;   // PRD §6: 30 seconds
export const STALE_MS = 90000;       // the server's cutoff; stated here for the UI

const uuid = () => (globalThis.crypto && crypto.randomUUID
  ? crypto.randomUUID()
  : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0; return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
    }));

/** The sentence a person sees for a failed gate call. A dropped
 *  connection surfaces from fetch() as a TypeError whose message is the
 *  browser's own ("Failed to fetch", "Load failed", "NetworkError…"),
 *  and that used to be printed verbatim (UX audit M16). A server's own
 *  refusal is already a sentence and passes through. */
export function errorSentence(err, fallback) {
  const msg = (err && err.message) || '';
  if (/failed to fetch|load failed|networkerror|network request failed/i.test(msg)) {
    return (typeof navigator !== 'undefined' && navigator.onLine === false)
      ? 'This device is offline. Connect to the internet and try again.'
      : 'The studio could not reach its server. Check the connection and try again.';
  }
  return msg || fallback;
}

/* ---- holders ------------------------------------------------- */

const webHolder = {
  getTicket() { try { return JSON.parse(sessionStorage.getItem(TICKET_KEY) || 'null'); } catch (e) { return null; } },
  setTicket(t) { try { if (t) sessionStorage.setItem(TICKET_KEY, JSON.stringify(t)); else sessionStorage.removeItem(TICKET_KEY); } catch (e) { /* private mode */ } },
  getSessionId() {
    try {
      let id = localStorage.getItem(DEVICE_SESSION_KEY);
      if (!id) { id = uuid(); localStorage.setItem(DEVICE_SESSION_KEY, id); }
      return id;
    } catch (e) { return memId || (memId = uuid()); }
  },
  rotateSessionId() {
    const id = uuid();
    try { localStorage.setItem(DEVICE_SESSION_KEY, id); } catch (e) { memId = id; }
    return id;
  }
};
let memId = null;
let holder = webHolder;
/** The extension swaps in a chrome.storage.session holder. Its methods
 *  may return promises; every caller below awaits them. */
export function useHolder(h) { holder = h || webHolder; }

/* ---- errors -------------------------------------------------- */

/** Did this error come from a function that is not there? PostgREST
 *  answers PGRST202 for an RPC missing from its schema cache, and
 *  Postgres 42883 for an undefined function. */
export const isMissing = (err) => !!err && (err.code === 'PGRST202' || err.code === '42883' ||
  /Could not find the function|does not exist/i.test(String(err.message || '')));
/** The PRD's 401: no membership, or disabled. */
export const isRevoked = (err) => !!err && (err.code === 'P0401' || /no active invite|disabled by an administrator/i.test(String(err.message || '')));

export class GateError extends Error {
  constructor(message, code) { super(message); this.code = code || ''; }
}

const one = (data) => (Array.isArray(data) ? data[0] : data) || null;

/* ---- the client ---------------------------------------------- */

/** `getClient` resolves to a supabase-js client (or null when this build
 *  has no Supabase project). Passed in, not imported, so this module
 *  never drags cloud.js onto a page that does not want it. */
export function createGate(getClient) {
  const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent : '').slice(0, 300);
  async function rpc(name, args) {
    const sb = await getClient();
    if (!sb) throw new GateError('This build has no cloud project configured.', 'nocloud');
    const { data, error } = await sb.rpc(name, args || {});
    if (error) throw Object.assign(new GateError(error.message, error.code), { cause: error });
    return data;
  }

  /** { deployed, registered, role, disabled,
   *    requestStatus: '' | 'pending' | 'approved' | 'declined',
   *    requestedAt, decidedAt, decisionNote, pendingRequests }
   *  `registered` is FALSE when the functions are missing: nobody has
   *  been admitted by a gate that does not exist, and saying otherwise
   *  is how the fail-open version let everybody through. */
  async function status() {
    const blank = { deployed: false, registered: false, role: '', disabled: false,
                    requestStatus: '', requestedAt: null, decidedAt: null, decisionNote: '', pendingRequests: 0 };
    try {
      const r = one(await rpc('studio_status')) || {};
      return { deployed: true, registered: !!r.registered, role: r.role || '', disabled: !!r.disabled,
               requestStatus: r.request_status || '', requestedAt: r.requested_at || null,
               decidedAt: r.decided_at || null, decisionNote: r.decision_note || '',
               pendingRequests: Number(r.pending_requests) || 0 };
    } catch (e) {
      if (isMissing(e)) return blank;
      throw e;
    }
  }

  /** Section 14: queue this signed-in account for an administrator.
   *  Resolves to { status, requestedAt, decidedAt, decisionNote, timesAsked }. */
  async function requestInvite(note) {
    try {
      const r = one(await rpc('request_invite', { p_note: String(note || '').slice(0, 1000) || null, p_user_agent: ua() })) || {};
      bumpEvent('invite_request');   // §29 daily count, fire-and-forget
      return { status: r.status || 'pending', requestedAt: r.requested_at || null, decidedAt: r.decided_at || null,
               decisionNote: r.decision_note || '', timesAsked: Number(r.times_asked) || 1 };
    } catch (e) {
      if (isMissing(e)) throw new GateError('Invite requests are not open yet.', 'notdeployed');
      throw e;
    }
  }

  async function verifyCode(code) {
    const c = normaliseCode(code);
    if (c.length < 6) throw new GateError('That code is too short — check it and try again.', 'short');
    try {
      const r = one(await rpc('verify_invite', { p_code: c }));
      const t = { ticket: r.ticket, passType: r.pass_type, expiresAt: r.expires_at };
      await holder.setTicket(t);
      return t;
    } catch (e) {
      if (isMissing(e)) throw new GateError('Invite codes are not available yet.', 'notdeployed');
      throw e;
    }
  }

  /** Spend the pending ticket, if any. Resolves to the membership row,
   *  or null when there was nothing to redeem. */
  async function redeemPending() {
    const t = await holder.getTicket();
    if (!t || !t.ticket) return null;
    if (t.expiresAt && Date.parse(t.expiresAt) < Date.now()) {
      await holder.setTicket(null);
      throw new GateError('The code was entered more than ten minutes ago — enter it again.', 'expired');
    }
    try {
      const r = one(await rpc('redeem_invite', { p_ticket: t.ticket }));
      await holder.setTicket(null);
      return r;
    } catch (e) {
      await holder.setTicket(null);
      throw e;
    }
  }

  /** Signed in already: verify and redeem in one step. */
  async function redeemCode(code) {
    await verifyCode(code);
    return redeemPending();
  }

  /* ---- the lock ---- */

  /** 'ok' | { conflict: true, lastSeen, userAgent } */
  async function acquire() {
    const r = one(await rpc('session_acquire', { p_session: await holder.getSessionId(), p_user_agent: ua() }));
    if (r && r.status === 'conflict') return { conflict: true, lastSeen: r.other_last_seen, userAgent: r.other_user_agent || '' };
    return 'ok';
  }
  async function takeover() {
    await rpc('session_takeover', { p_session: await holder.getSessionId(), p_user_agent: ua() });
    return 'ok';
  }
  /** 'ok' | 'conflict' | 'revoked' */
  async function ping() {
    try {
      const r = one(await rpc('session_ping', { p_session: await holder.getSessionId() }));
      return (r && r.status) || 'ok';
    } catch (e) {
      if (isRevoked(e)) return 'revoked';
      throw e;
    }
  }
  async function release() {
    try { await rpc('session_release', { p_session: await holder.getSessionId() }); } catch (e) { /* best effort */ }
  }

  /* ---- admin ---- */
  const admin = {
    async listCodes() {
      const sb = await getClient();
      const { data, error } = await sb.from('invite_codes').select('*').order('created_at', { ascending: false }).limit(200);
      if (error) throw new GateError(error.message, error.code);
      return data || [];
    },
    async listRedemptions(codeId) {
      const sb = await getClient();
      let q = sb.from('invite_redemptions').select('*').order('redeemed_at', { ascending: false }).limit(200);
      if (codeId) q = q.eq('code_id', codeId);
      const { data, error } = await q;
      if (error) throw new GateError(error.message, error.code);
      return data || [];
    },
    /** Cloud projects this admin can see, for the screening-pass
     *  picker. A plain read — NOT pullProjectList(), which merges every
     *  project into this browser and pulls all of its data. */
    async listProjects() {
      const sb = await getClient();
      const { data, error } = await sb.from('projects').select('id,title,format').order('updated_at', { ascending: false }).limit(200);
      if (error) throw new GateError(error.message, error.code);
      return data || [];
    },
    createCode({ passType = 'standard', maxRedemptions = 1, expiresAt = null, projectId = null, label = '' } = {}) {
      return rpc('admin_create_invite', {
        p_pass_type: passType, p_max_redemptions: maxRedemptions,
        p_expires_at: expiresAt, p_target_project: projectId, p_label: label || null
      }).then(one);
    },
    revokeCode: (id) => rpc('admin_revoke_invite', { p_id: id }),
    listMembers: () => rpc('admin_list_members'),
    terminate: (userId, disable = false) => rpc('admin_terminate_session', { p_user: userId, p_disable: disable }),
    /* Section 14. `status` filters ('pending' | 'approved' | 'declined');
       null lists everything, pending first. */
    listRequests: async (status = null) => {
      try { return (await rpc('admin_list_requests', { p_status: status })) || []; }
      catch (e) { if (isMissing(e)) return []; throw e; }
    },
    decideRequest: (userId, approve, note = '') => rpc('admin_decide_request', { p_user: userId, p_approve: !!approve, p_note: note || null }),
    /** Recover a declined account. There is no undo_decline function
     *  and there should not be: approving a declined row inserts the
     *  membership and sets the status to 'approved', which is what
     *  ends the cooling-off too (it is read from status + decided_at).
     *  Named so the console can say what it means. Schema section 25. */
    recoverRequest: (userId, note = '') => rpc('admin_decide_request', { p_user: userId, p_approve: true, p_note: note || null }),
    /** Clear a user back to a stranger: membership, invite request,
     *  code redemptions, the device lock and their auth session.
     *  Leaves their projects, their organisation and any payment
     *  alone — see schema section 25 for why. Returns a summary of
     *  what actually went. */
    resetUser: (userId, note = '') => rpc('admin_reset_user', { p_user: userId, p_note: note || null }),
    /* Section 15: the application as a whole. Read-only. */
    overview: async () => (await rpc('admin_overview')) || {},
    listAccounts: async () => (await rpc('admin_list_accounts')) || [],
    listUsers: async () => (await rpc('admin_list_users')) || []
  };

  /* ---- screening room (anonymous) ---- */
  async function openScreening(code, viewerEmail) {
    try {
      const r = one(await rpc('screening_open', { p_code: normaliseCode(code), p_viewer_email: viewerEmail || null }));
      if (!r) throw new GateError('That screening pass is not valid.', 'invalid');
      return { projectId: r.project_id, title: r.title, format: r.format, accessId: r.access_id,
               expiresAt: r.expires_at, scopes: r.scopes || {} };
    } catch (e) {
      if (isMissing(e)) throw new GateError('Screening passes are not available yet.', 'notdeployed');
      throw e;
    }
  }

  return { status, verifyCode, redeemPending, redeemCode, requestInvite, acquire, takeover, ping, release,
           admin, openScreening, sessionId: () => holder.getSessionId(),
           hasPendingTicket: async () => !!((await holder.getTicket()) || {}).ticket };
}

/* ---- the heartbeat --------------------------------------------
   One timer per document. Every tab of a browser pings with the same
   handle, which the server treats as one device; a background tab's
   timers are throttled to about once a minute, still well inside the
   90-second cutoff. `onLost('conflict'|'revoked')` is called once,
   and the beat stops — resuming is a deliberate takeover. */
export function startHeartbeat(gate, { onLost, intervalMs = HEARTBEAT_MS } = {}) {
  let timer = 0, stopped = false;
  const beat = async () => {
    if (stopped) return;
    try {
      const r = await gate.ping();
      if (r === 'conflict' || r === 'revoked') { stop(); if (onLost) onLost(r); }
    } catch (e) {
      if (isMissing(e)) { stop(); return; }   // schema not deployed: no lock to keep
      /* A network failure is not a lost lock. Keep beating; the server
         only frees the lock after 90 seconds of silence, and the next
         ping that gets through re-acquires it if nobody else has. */
    }
  };
  function stop() { stopped = true; clearInterval(timer); }
  timer = setInterval(beat, intervalMs);
  beat();
  return { stop, beat };
}
