/* ============================================================
   THE KEYS A STEP OWNS
   ------------------------------------------------------------
   Two pure functions over a step object from src/data/steps.*.json.
   No DOM, no storage, no imports.

   They lived in src/ui/steps.js and still have their public home
   there — src/pages/feature.js and src/pages/short.js import them
   from it and nothing about that changes. They moved DOWN to lib
   because a second reader appeared: src/lib/blueprint-context.js has to
   know which keys a step owns to gather the user's answers as
   context for a model, and a *renderer* is the wrong place for a
   non-renderer to import from.

   The alternative was a second copy of this derivation in
   blueprint.js. CLAUDE.md has the money-parser entry about exactly
   that: four pages each grew their own copy of one parse and then
   disagreed about identical stored data. Twelve lines is not too
   small to share; the four copies of parseNum were shorter.
   ============================================================ */

/** Every data-key a step owns, in order — used by export, progress
    and the blueprint context. `raw` blocks are authored markup the
    extractors could not model, so their keys are read out of the
    string rather than out of a field list. */
export function stepKeys(step) {
  const keys = [];
  for (const b of (step && step.blocks) || []) {
    if (b.type === 'asks') keys.push(...(b.items || []).map((a) => a.key));
    else if (b.type === 'check') keys.push(...(b.items || []).map((i) => i.key));
    else if (b.type === 'raw') {
      for (const m of String(b.html).matchAll(/data-key="([^"]+)"/g)) keys.push(m[1]);
    }
  }
  return keys;
}

/** Field keys only. A `ck_` key is a checklist boolean: it is a tick,
    not something the user wrote, and counting it as an answer would
    put "true" in a prompt as if it were prose. */
export function stepFieldKeys(step) {
  return stepKeys(step).filter((k) => !k.startsWith('ck_'));
}
