/* ============================================================
   AI EFFORT — how hard a structured draft thinks
   ------------------------------------------------------------
   Shots, scene pages and the like are structured work against a
   schema: LOW effort is fast and good enough, and the Desk's
   "Careful" switch raises it. Pure; the one read is the pref, once,
   at the start of a run — the effort is FIXED for a whole run,
   because the effort is part of what a prompt cache is keyed on and
   changing it between batches would throw the cache away.
   ============================================================ */
import { readAiCareful } from './chrome-prefs.js';

export const DRAFT_EFFORT = { normal: 'low', careful: 'high' };

/** The effort for a structured draft. `careful` defaults to the pref. */
export function draftEffort(careful) {
  const on = careful === undefined ? readAiCareful() : !!careful;
  return on ? DRAFT_EFFORT.careful : DRAFT_EFFORT.normal;
}

export default { DRAFT_EFFORT, draftEffort };
