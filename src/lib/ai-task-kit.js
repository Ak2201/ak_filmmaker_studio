/* ============================================================
   AI TASK KIT — the small helpers the lane modules share
   ------------------------------------------------------------
   ai-tasks-preprod.js, ai-tasks-post.js and ai-tasks-story.js build
   AI Desk tasks ({id, kind, input, run, apply, identity?, editable?},
   docs/AI-EVERYWHERE.md) with the same helpers ai-tasks.js keeps for
   itself. LOGIC only: no document, nothing from src/ui or src/pages
   (scripts/check-layers.mjs). Pure apart from `ai()`, which loads
   src/lib/ai.js on demand so this file costs a first paint nothing.
   The refine text comes from ai-refine.js (pure), never from ai.js.
   ============================================================ */
import { refineBlock } from './ai-refine.js';

/** src/lib/ai.js, loaded on first use: `(await ai()).callModelForTask(…)`. */
export const ai = () => import('./ai.js');

/** A ctx, or the ctx a ctx function resolves to; always an object. */
export const resolve = (ctx) => {
  let c = ctx;
  if (typeof c === 'function') { try { c = c(); } catch (e) { c = {}; } }
  return (c && typeof c === 'object') ? c : {};
};
export const call = (fn, ...args) => (typeof fn === 'function' ? fn(...args) : undefined);
/** A refusal the Desk shows in the writer's words (kind 'nocontent'). */
export const fail = (msg) => { const e = new Error(msg); e.kind = 'nocontent'; throw e; };
export const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

/* What apply() needs beside the ticked items. Pinned to the result it
   belongs to (non-enumerable, so a refinement's `previous` never carries
   it): the Desk keeps a version per run and Accept can be pressed on any
   of them. Memory for this visit only, never storage. */
const last = new Map();
export function remember(id, result, mem) {
  last.set(id, mem);
  if (result && typeof result === 'object') Object.defineProperty(result, 'memo', { value: mem, enumerable: false });
  return result;
}
export const recall = (id, result) => (result && result.memo) || last.get(id);

/** The refine block as ai.js writes it, or ''. `pick(previous)` may
    trim the previous answer to the part that matters. */
export function refineText(refine, pick) {
  if (!refine) return '';
  const previous = typeof pick === 'function' ? pick(refine.previous) : refine.previous;
  return String(refineBlock({ previous, instructions: refine.instructions }) || '').trim();
}

/** Text a model sent back, held to a length and to one line break style. */
export const clip = (s, n) => String(s == null ? '' : s).replace(/\r\n?/g, '\n').trim().slice(0, n);

export default { ai, resolve, call, fail, plural, remember, recall, refineText, clip };
