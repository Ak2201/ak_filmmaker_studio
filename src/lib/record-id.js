/* A new id for a stored record. These ids are WRITTEN INTO users' saved
   work, so the shape is a contract: a UUID where the browser has one,
   else `<prefix>_<time base36>_<6 random base36>`. Ten models used to
   carry this line each (scenes s, characters ch, contacts c, festivals fs,
   locations m, script w, shots and costs by argument, the audience and
   coverage documents w); one copy here keeps them from drifting.

   NOT merged, because their stored shape differs: dpr.js (8 hex of the
   UUID behind a prefix), dissect.js (5 random chars), store.js's project
   id (8 random chars), gate.js (a full UUID fallback). Pure, imports
   nothing. */
export const newId = (prefix) =>
  (globalThis.crypto && crypto.randomUUID)
    ? crypto.randomUUID()
    : prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
