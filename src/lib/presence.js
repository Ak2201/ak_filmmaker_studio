/* ============================================================
   PRESENCE — who else has this screenplay open, the pure half
   ------------------------------------------------------------
   Supabase Realtime's presence state is an object keyed by the
   presence key (here the user id), each holding one entry per open
   tab: { [userId]: [{ name, elId, editing, at, presence_ref }, …] }.
   This module turns that into the list the page draws, and stores
   nothing: presence lives in the Realtime server's memory while a page
   is open (supabase/schema/schema-48-presence.sql says who may join).

   WHAT IT IS NOT. The script syncs as one blob, last write wins
   (cloud.js scope `script`). Presence does not merge anything; it
   tells two writers they are both in the script, and warns while the
   other one is typing, so they can agree who writes. With the
   co-editing switch on (schema §49) the two copies DO merge, line by
   line (src/lib/script-merge.js), and each person's caret is drawn in
   the line they are on, at the character (`pos`).

   CLOCKS. "Is typing" is judged on THIS machine's clock: the page
   records when it last SAW a person's edit stamp change (lastSeen),
   rather than trusting the sender's `at`, because two laptops'
   clocks can disagree by minutes.
   ============================================================ */

/** How long after the last keystroke someone still counts as editing. */
export const EDIT_WINDOW_MS = 30000;

/** A name to show for a Supabase user: full name, then name, then the
    part of the e-mail before the @, then "A collaborator". */
export function displayNameOf(user) {
  const m = (user && user.user_metadata) || {};
  const n = String(m.full_name || m.name || '').trim();
  if (n) return n;
  const e = String((user && user.email) || m.email || '').trim();
  return e ? e.split('@')[0] : FALLBACK_NAME;
}
export const FALLBACK_NAME = 'A collaborator';

/** "Cal Collab" → "CC"; "cal" → "C". Whole characters, from the words
    that have a letter or digit in them: "😀 Dev" took the emoji's first
    UTF-16 half and printed a broken glyph (QA r4); it is "D" now. */
export function initials(name) {
  const all = String(name || '').trim().split(/\s+/).filter(Boolean);
  const worded = all.filter((w) => /[\p{L}\p{N}]/u.test(w));
  const parts = worded.length ? worded : all;
  if (!parts.length) return '?';
  const lead = (w) => { const m = w.match(/[\p{L}\p{N}]/u); return m ? m[0] : (Array.from(w)[0] || ''); };
  const first = lead(parts[0]);
  const last = parts.length > 1 ? lead(parts[parts.length - 1]) : '';
  return (first + last).toUpperCase();
}

/** The name on someone's caret: their first word — but the fallback
    for a nameless account is "Collaborator", never its article "A". */
export function caretTag(name) {
  const n = String(name || '').trim();
  if (!n || n === FALLBACK_NAME) return 'Collaborator';
  return n.split(/\s+/)[0];
}

/**
 * The other people here, one row each (several tabs of one person are
 * one row: the most recently active tab speaks for them), sorted by name.
 *   raw       Realtime's presenceState()
 *   selfKey   this user's key (left out: you know you are here)
 *   lastSeen  { [key]: ms } when this page last saw that person's `at` change
 *   now       ms
 *   page      'script' | 'story' — only tabs on that page; '' = every tab
 * → [{ key, name, elId, pos, editing }]   pos: the caret's offset in that
 *   line, or null when the other page did not say (an older build)
 */
export function presencePeople(raw, selfKey, lastSeen = {}, now = Date.now(), page = '') {
  const out = [];
  for (const [key, all] of Object.entries(raw || {})) {
    /* One channel per project carries both pages: a tab says which it is
       on (`page`; none is the screenplay, which never said). Given a
       page, only that page's tabs count. */
    const metas = page && Array.isArray(all) ? all.filter((m) => ((m && m.page) || 'script') === page) : all;
    if (key === selfKey || !Array.isArray(metas) || !metas.length) continue;
    const latest = metas.reduce((a, b) => ((Number(b && b.at) || 0) > (Number(a && a.at) || 0) ? b : a), metas[0]) || {};
    const seen = Number(lastSeen[key]) || 0;
    out.push({
      key,
      name: String(latest.name || 'A collaborator').slice(0, 80),
      elId: typeof latest.elId === 'string' ? latest.elId : '',
      pos: Number.isInteger(latest.pos) && latest.pos >= 0 ? latest.pos : null,
      step: typeof latest.step === 'string' ? latest.step : '',
      editing: !!latest.editing && seen > 0 && now - seen < EDIT_WINDOW_MS
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Update lastSeen from a fresh state: a person whose newest `at` moved
    since the last look is stamped with `now`. Returns the new map. */
export function noteSeen(raw, prevAt = {}, lastSeen = {}, now = Date.now()) {
  const at = {}, seen = { ...lastSeen };
  for (const [key, metas] of Object.entries(raw || {})) {
    if (!Array.isArray(metas) || !metas.length) continue;
    const newest = Math.max(...metas.map((m) => Number(m && m.at) || 0));
    at[key] = newest;
    if (newest && newest !== prevAt[key]) seen[key] = now;
  }
  for (const key of Object.keys(seen)) if (!(key in at)) delete seen[key];
  return { at, seen };
}

/** The sentence the warning strip says, or '' when nobody else types.
 *  `coEdit` is true when the co-editing switch (§49) is on: then saves
 *  MERGE line by line, so the only clash left is the same line, and
 *  "saves replace each other" would be untrue. */
export function editingWarning(people, coEdit = false) {
  const busy = (people || []).filter((p) => p.editing).map((p) => p.name);
  if (!busy.length) return '';
  const who = busy.length === 1 ? busy[0] : busy.slice(0, -1).join(', ') + ' and ' + busy[busy.length - 1];
  return who + (busy.length === 1 ? ' is' : ' are') + ' writing in this script now. '
    + (coEdit
      ? 'Your saves merge line by line; if you both change the same line, the later save keeps it.'
      : 'Saves replace each other, so agree who writes, or take turns.');
}

/** The Story page's line: who else has the beat sheet open, and the step
 *  each is on. `stepN(id)` is the step's number on THIS page (the number
 *  is derived, so each page counts its own), or 0 for a step it does not
 *  have. '' when nobody else is here.
 *  → "Also here: Cal Collab (editing step 3), Asha Rao." */
export function storyPresenceLine(people, stepN = () => 0) {
  const bits = (people || []).map((p) => {
    const n = p.step ? Number(stepN(p.step)) || 0 : 0;
    if (!n) return p.name;
    return p.name + ' (' + (p.editing ? 'editing' : 'on') + ' step ' + n + ')';
  });
  return bits.length ? 'Also here: ' + bits.join(', ') + '.' : '';
}

export default { EDIT_WINDOW_MS, displayNameOf, initials, presencePeople, noteSeen, editingWarning, storyPresenceLine };
