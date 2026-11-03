/* ============================================================
   AI EFFORT — how hard a request thinks, in ONE table
   ------------------------------------------------------------
   Shots, scene pages and the like are structured work against a
   schema: LOW effort is fast and good enough, and the Desk's
   "Careful" switch raises it. Pure; the one read is the pref, once,
   at the start of a run — the effort is FIXED for a whole run,
   because the effort is part of what a prompt cache is keyed on and
   changing it between batches would throw the cache away.

   TASK_EFFORT is the one place a task's effort is decided (owner,
   3 Nov 2026: "Gemini takes longer than expected"). Two kinds:

   · EXTRACTION / CLASSIFICATION — the answer is on the page and the
     schema says where it goes (tags, shots, notes per scene, a shoot
     order, a recce list). Thinking longer does not find more of it;
     it only makes the wait longer. 'low'.
   · JUDGEMENT — coverage, the audience panel, a beat critique, a
     dialogue pass: the thinking IS the product. 'medium'.

   The Careful switch (aiCareful in fms_studio_prefs_v1) raises any
   task by ONE step (low → medium → high). The two big drafts keep
   their own pair (DRAFT_EFFORT: low, or high when careful), because
   that is what the Desk promised for them on 2 Nov and a test holds
   it. A task missing from the table is 'medium' — never 'low' by
   accident: a new judgement task must not quietly think less.
   ============================================================ */
import { readAiCareful } from './chrome-prefs.js';

export const DRAFT_EFFORT = { normal: 'low', careful: 'high' };

export const EFFORT_STEPS = ['low', 'medium', 'high'];

export const TASK_EFFORT = Object.freeze({
  // extraction / classification
  'breakdown-tags': 'low',
  'shot-draft': 'low',
  'gen-batch': 'low',
  'shoot-order': 'low',
  'recce-notes': 'low',
  'callsheet-notes': 'low',
  'budget-estimate': 'low',
  'scene-notes': 'low',
  'genre-comps': 'low',
  'blocking-draft': 'low',
  'character-arcs': 'low',
  'script-cleanup': 'low',
  'audience-ask': 'low',        // one viewer answering one question
  'test-key': 'low',
  // judgement
  'coverage': 'medium',
  'audience-test': 'medium',
  'audience-quick': 'medium',
  'beat-critique': 'medium',
  'tension-notes': 'medium',
  'dialogue-pass': 'medium',
  'voice-check': 'medium',
  'logline': 'medium',
  'story-steps': 'medium',
  'story-map': 'medium',
  'scene-story': 'medium',
  'blocking-enhance': 'medium',
  'draft-changes': 'medium',
  'day-wrap-summary': 'medium',
  'edit-notes': 'medium',
  'cert-read': 'medium',
  'gen-scenes': 'medium',
  'synopsis-script': 'medium'
});

const DEFAULT_EFFORT = 'medium';

const carefulNow = (careful) => (careful === undefined ? readAiCareful() : !!careful);

/** One step up the ladder; 'high' stays 'high'. */
export function raiseEffort(effort) {
  const i = EFFORT_STEPS.indexOf(effort);
  if (i < 0) return DEFAULT_EFFORT;
  return EFFORT_STEPS[Math.min(EFFORT_STEPS.length - 1, i + 1)];
}

/** The base effort of a task, as the table says (no pref read). */
export function baseEffort(taskId) {
  return TASK_EFFORT[taskId] || DEFAULT_EFFORT;
}

/** The effort for one task's run. `careful` defaults to the pref. */
export function taskEffort(taskId, careful) {
  const base = baseEffort(taskId);
  return carefulNow(careful) ? raiseEffort(base) : base;
}

/** The effort for a structured draft. `careful` defaults to the pref. */
export function draftEffort(careful) {
  return carefulNow(careful) ? DRAFT_EFFORT.careful : DRAFT_EFFORT.normal;
}

/* GEMINI. `thinkingLevel` is Gemini 3's knob and it does not take every
   word on every model: the Flash models take minimal / low / medium /
   high; Gemini 3 Pro (3.0) took only low / high, and an unknown level is
   a 400 — which reads as "the model is broken". 3.1 Pro takes medium.
   So the mapping is conservative: anything the model may refuse rounds
   UP (a slower answer beats no answer), and anything beyond 'high'
   ('max', 'xhigh', an Anthropic-only word) is 'high'. */
export function geminiThinkingLevel(effort, model = '') {
  const e = EFFORT_STEPS.includes(effort) ? effort : (effort === 'minimal' ? 'low' : 'high');
  const m = String(model || '');
  if (e === 'medium' && /^gemini-3(\.0)?-pro/.test(m)) return 'high';
  return e;
}

export default { DRAFT_EFFORT, EFFORT_STEPS, TASK_EFFORT, raiseEffort, baseEffort, taskEffort, draftEffort, geminiThinkingLevel };
