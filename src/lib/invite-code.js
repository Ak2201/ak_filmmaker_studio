/* ============================================================
   THE INVITE CODE, AS A PURE MODULE — NO IMPORTS, ON PURPOSE
   ------------------------------------------------------------
   The code's FORMAT, its STORAGE KEY and its LINK shapes. Nothing
   here touches the network, Supabase or the store; the whole file is
   string handling plus three guarded localStorage calls.

   WHY IT IS NOT IN gate.js, WHICH IS WHERE IT LIVED. start.html is
   the landing page now and it carries the sign-in, so it has to read
   a code out of its own URL and hold it across the Google round
   trip. But gate.js sits in the shared `studio` CORE chunk with
   store.js, sitegate.js, cloud.js and billing.js — importing it onto
   start.html would pull about a megabyte of app code onto the one
   page that deliberately ships almost none, and `prove:growth`
   asserts no Supabase chunk is fetched there at all.

   So the helpers move DOWN here and gate.js re-exports every one of
   them. There is still exactly one definition of each; gate.js's
   public surface is unchanged; and start.js can import this file for
   a few hundred bytes. Same move plans.js already makes so that
   vite.config.js can evaluate PLAN_ORDER at build time.
   ============================================================ */

/* THE CODE PASS. A valid invite code lets a visitor through the site
   gate WITHOUT signing in (owner's decision, 5 Oct 2026): the code is
   kept in this browser and re-verified by verify_invite() once per
   browser session, so a revoked, expired or exhausted code shuts the
   door on the next session. It spends nothing — redeem_invite() is
   still the step that makes a member, and it runs by itself the first
   time this browser signs in (cloud.js runGate()). In ALL_KEYS (reset
   forgets it) and in no other registry: it is a bearer secret for this
   browser, the way the device lock handle is, and a backup carrying it
   would hand the code to whoever restores the file. */
export const CODE_PASS_KEY = 'fms_invite_code_v1';

/** FR-101: strip whitespace and punctuation, capitalise. The server
 *  normalises too; this is so the box shows what will be checked. */
export const normaliseCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/** Display form: groups of four, the way a code is read aloud. */
export const formatCode = (s) => normaliseCode(s).replace(/(.{4})(?=.)/g, '$1-');

export function getCodePass() {
  try { const v = JSON.parse(localStorage.getItem(CODE_PASS_KEY) || 'null'); return v && v.code ? v : null; } catch (e) { return null; }
}
export function setCodePass(code, extra = {}) {
  const v = { code: normaliseCode(code), at: new Date().toISOString(), ...extra };
  try { localStorage.setItem(CODE_PASS_KEY, JSON.stringify(v)); } catch (e) { /* private mode: this visit only */ }
  return v;
}
export function clearCodePass() { try { localStorage.removeItem(CODE_PASS_KEY); } catch (e) { /* ignore */ } }

const DEFAULT_ORIGIN = 'https://thefilmmakerstudio.vercel.app/';
const here = () => (typeof location !== 'undefined' ? location.href : DEFAULT_ORIGIN);

/** The shareable form of a code: the doorway with the code in the
 *  FRAGMENT, which a browser never sends to a server, so the link can
 *  sit in a chat without landing in anybody's access log. invite.js
 *  reads it, strips it from the address bar and enters.
 *
 *  KEPT, although the console now hands out startInviteLink() below:
 *  every link already sent to somebody points here, and a code is a
 *  thing people paste into a WhatsApp group months later. */
export function inviteLink(code, base) {
  return new URL('invite.html#code=' + formatCode(code), base || here()).href;
}

/** The form the console copies NOW: the same code on the landing
 *  page, where the sign-in is. A code buys a longer trial rather than
 *  permanent free entry, and a trial is counted against a person on
 *  the server — so the code has to meet an account to be worth its
 *  seven days. start.js holds it across the Google round trip and
 *  cloud.js's runGate() redeems it on the way back in. */
export function startInviteLink(code, base) {
  return new URL('start.html#code=' + formatCode(code), base || here()).href;
}

/** The code carried by an invite link, or ''. Reads a fragment, so it
 *  works the same on invite.html and on start.html. */
export function codeFromLocation(loc) {
  const l = loc || (typeof location !== 'undefined' ? location : null);
  if (!l) return '';
  const m = /(?:^#|&)code=([^&]+)/.exec(String(l.hash || ''));
  return m ? normaliseCode(decodeURIComponent(m[1])) : '';
}
