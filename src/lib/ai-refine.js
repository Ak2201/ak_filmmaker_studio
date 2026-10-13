/* ============================================================
   AI REFINE — the text a chat refinement appends to a prompt
   ------------------------------------------------------------
   PURE, so scripts/test-ai-desk.mjs can load it in Node (ai.js
   cannot be: it imports store.js, which patches Storage).
   Re-exported from src/lib/ai.js.

   A refinement does NOT change the wire. callModel() takes one
   system + one user message against a JSON schema; a refine call
   re-sends the task's own system prompt and its own user message
   with this block appended, against the SAME schema, so every
   task's parser and checks still apply to the refined answer.

     refineBlock({ previous, instructions }) → string ('' if there
       is nothing to refine)
     withRefine({ system, user }, refine)   → { system, user } with
       the block appended to `user`; refine undefined → unchanged
   ============================================================ */

export function refineBlock({ previous, instructions } = {}) {
  const asks = [].concat(instructions || [])
    .map((s) => String(s == null ? '' : s).trim())
    .filter(Boolean);
  if (previous === undefined && !asks.length) return '';
  let prev;
  try { prev = JSON.stringify(previous === undefined ? null : previous, null, 2); }
  catch (e) { prev = String(previous); }
  return '\n\n---\n'
    + 'Your previous answer (JSON):\n' + prev + '\n\n'
    + 'The writer asks for these changes, in order:\n'
    + (asks.length ? asks.map((s, i) => (i + 1) + '. ' + s).join('\n') : '(none)') + '\n\n'
    + 'Apply every change asked for, the later ones on top of the earlier ones. '
    + 'Keep everything they did not ask to change. Return the same JSON shape.';
}

export function withRefine(prompt, refine) {
  if (!refine) return prompt;
  return { ...prompt, user: String(prompt.user || '') + refineBlock(refine) };
}

export default { refineBlock, withRefine };
