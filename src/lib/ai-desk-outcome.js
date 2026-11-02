/* ============================================================
   AI DESK OUTCOME — what the Desk says after an Accept or an Undo
   ------------------------------------------------------------
   PURE (no document, no imports), so test:ai-desk proves it in Node.

   A task reports through its page's `ctx.say` when it knows better than
   the Desk: "4 fields were filled in since the run, so nothing was
   written", "The notes were edited since and are left as they are". The
   Desk used to follow that with its own "<label>: applied." / "Undone."
   whatever happened, so the writer read two toasts that contradicted
   each other. The rule now: IF THE TASK SPOKE, THE DESK DOES NOT SPEAK
   AGAIN — except to carry the Undo button, which only the Desk can draw.

   An apply() that returns null wrote nothing (every such return in the
   task modules is a nothing-to-write path); one that returns undefined
   wrote and offers no undo. An undo returning `false` refused.
   ============================================================ */

/** Wrap a ctx (object or ctx function) so a call to its `say` is noticed.
    The task modules always resolve ctx, so a ctx function is enough; the
    proxy is made per resolve and lives as long as the undo closure does,
    so the Undo's own say is noticed too (reset() between the two). */
export function listenSay(ctx) {
  let spoke = false;
  const wrap = (c) => {
    if (!c || typeof c !== 'object') return c;
    return new Proxy(c, {
      get(t, k, r) {
        const v = Reflect.get(t, k, r);
        if (k !== 'say' || typeof v !== 'function') return v;
        return (...a) => { spoke = true; return v.apply(t, a); };
      }
    });
  };
  const wrapped = () => {
    let c = ctx;
    if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
    return wrap(c);
  };
  return { ctx: wrapped, spoke: () => spoke, reset: () => { spoke = false; } };
}

/** After an Accept that returned no undo function: the toast, or null.
    { text, type } where type is 'success' | 'info'. */
export function acceptNote(ret, spoke, label) {
  if (spoke) return null;
  if (ret === null) return { text: label + ': nothing was changed.', type: 'info' };
  return { text: label + ': applied.', type: 'success' };
}

/** After an Undo resolved with `ret`: the Desk's 'Undone.', or null. */
export function undoNote(ret, spoke) {
  if (spoke || ret === false) return null;
  return 'Undone.';
}
