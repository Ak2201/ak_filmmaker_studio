/* ============================================================
   THE BLUEPRINT, AS CONTEXT
   ------------------------------------------------------------
   CLAUDE.md open item 3, second half: "in-place work on the
   writing itself — dialogue passes, beat critique — using the
   blueprint as context." This module is the *blueprint as
   context* half. src/lib/ai.js is the model half and imports
   nothing from here: it takes the context as data, the same way
   draftShotDivision() takes scenes as data. Keeping the two
   apart is what lets src/lib/ai.js stay free of page data: it
   takes the context as an argument and knows nothing about steps.

   NOT src/lib/blueprint-fields.js, which is a different question
   about the same input. That file answers "how many fields does a
   blueprint declare" and returns an unordered Set for a progress
   denominator. This one answers "what has the writer actually
   said, in what order, under which labels" and returns prose for
   a prompt. Neither derivation is the other's, which is why
   sharing one would mean widening both.

   IT READS, IT NEVER WRITES. Not once, not to "repair" anything.
   Every function here is called from a click handler on a page
   that is already guarding the save loop, and a lib that saves
   on read is how that loop comes back.

   THE STORAGE KEY. `arunak_filmmaker_combined_v1` is the
   blueprint's blob and a contract with real users' saved work.
   It is exported here and src/pages/feature.js now imports it
   rather than keeping its own literal — but be honest about the
   state of that: the same string is still written out by hand in
   src/ui/chrome.js (three times), src/ui/launcher.js,
   src/lib/store.js and src/lib/cloud.js. This is one fewer copy,
   not the last one, and it is worth finishing when the
   `arunak_` rename in CLAUDE.md's open item 1 happens — that
   pass has to touch every one of these anyway.

   IT GOES THROUGH THE PROXY ON PURPOSE. This IS project data —
   the open film's answers — so plain `localStorage` is correct:
   src/lib/store.js suffixes the key with the project id and we
   get the film the user is looking at. That is the opposite of
   the AI key, which uses rawGet precisely to escape the proxy.

   WHAT COUNTS AS THE BLUEPRINT. The spine from
   src/data/steps.priority.json — the ten steps that make a
   blueprint somebody could read. Not all 32: a dialogue pass
   does not need the continuity-log owner, and a prompt stuffed
   with every field the user ever typed is a prompt where the
   logline is one line in two hundred. The spine is already the
   app's answer to "which of these matter", so it is the answer
   here too rather than a second hand-written list.
   ============================================================ */
import STEPS from '../data/steps.feature.json';
import PROD from '../data/steps.production.json';
import PRIORITY from '../data/steps.priority.json';
import { stepFieldKeys } from './step-keys.js';

/* The blueprint's blob. See the header: one declaration, and
   src/pages/feature.js imports it from here. */
export const BLUEPRINT_KEY = 'arunak_filmmaker_combined_v1';

/* Every step on the page, in page order, tagged with its namespace so
   a priority key can be built. Derived from the data, never listed. */
const ALL = [
  ...STEPS.vol1.map((s) => ({ ns: 'feature', step: s })),
  ...STEPS.vol2.map((s) => ({ ns: 'feature', step: s })),
  ...PROD.production.map((s) => ({ ns: 'production', step: s })),
  ...PROD.post.map((s) => ({ ns: 'production', step: s }))
];

/* The spine, resolved to real steps, in the order the data lists.
   src/ui/steps.js indexes the same file for the rendering side; this
   is a second READER of one datum, not a second copy of it. */
const SPINE = (Array.isArray(PRIORITY.spine) ? PRIORITY.spine : [])
  .map((entry) => (entry && typeof entry === 'object' ? entry.step : entry))
  .map((key) => ALL.find((x) => x.ns + ':' + x.step.id === key))
  .filter(Boolean);

/* ---- labels ------------------------------------------------
   A key is `s4_wound`; a model needs "The wound". The label is the
   ask's own label, or — for the bespoke `raw` blocks the extractors
   could not model — the <label> beside the field in the authored
   markup. Same derivation feature.js's Markdown export uses, and for
   the same reason: a hand-written key→label table is wrong by the
   second change. Built once, lazily, because it parses markup. */
let LABELS = null;

const clean = (s) => String(s ?? '')
  .replace(/<[^>]+>/g, '')
  .replace(/&amp;/g, '&')
  .replace(/^[A-Z]\s*·\s*/, '')      // "A · Logline attempt 1" → "Logline attempt 1"
  .replace(/\s+/g, ' ')
  .trim();

function humanise(key) {
  return key.replace(/^(v2)?s\d+_/, '').replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function labels() {
  if (LABELS) return LABELS;
  const map = new Map();
  for (const { step } of ALL) {
    for (const b of step.blocks || []) {
      if (b.type === 'asks') {
        for (const a of b.items || []) map.set(a.key, clean(a.label) || humanise(a.key));
      } else if (b.type === 'raw') {
        /* DOMParser rather than innerHTML on a live element: this can be
           called from a page that is not feature.html, and attaching
           authored markup to the document to read a label out of it
           would run whatever that markup carries. */
        let frag = null;
        try {
          frag = new DOMParser().parseFromString('<body>' + b.html + '</body>', 'text/html').body;
        } catch (e) { continue; }
        frag.querySelectorAll('[data-key]').forEach((el) => {
          const key = el.getAttribute('data-key');
          const own = el.closest('div, td, .ask');
          const lab = own && own.querySelector('label, .ask-label');
          map.set(key, (lab ? clean(lab.textContent) : '')
            || clean(el.getAttribute('placeholder')) || humanise(key));
        });
      }
    }
  }
  LABELS = map;
  return map;
}

export function labelFor(key) {
  return labels().get(key) || humanise(String(key));
}

/* ---- the stored answers ------------------------------------ */

/** The blueprint blob for the open project, or {}. Never throws, never
    writes — a private-mode browser gets an empty blueprint, not a
    broken page. */
export function loadBlueprint() {
  let raw = null;
  try { raw = localStorage.getItem(BLUEPRINT_KEY); } catch (e) { return {}; }
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : {};
  } catch (e) { return {}; }
}

const isProse = (v) => typeof v === 'string' && v.trim().length > 0;

/** One step's filled answers, labelled. `[]` when nothing is written. */
export function stepAnswers(stepId, data) {
  const found = ALL.find((x) => x.step.id === stepId);
  if (!found) return [];
  const blob = data || loadBlueprint();
  return stepFieldKeys(found.step)
    .map((k) => ({ key: k, label: labelFor(k), value: String(blob[k] ?? '').trim() }))
    .filter((a) => isProse(a.value));
}

/** A step's identity for a prompt or a panel heading. */
export function stepMeta(stepId) {
  const found = ALL.find((x) => x.step.id === stepId);
  if (!found) return null;
  const s = found.step;
  return {
    id: s.id,
    ns: found.ns,
    num: s.num,
    title: (s.titlePlain || String(s.title).replace(/<[^>]+>/g, '')).replace(/\.$/, ''),
    deck: clean(s.deck)
  };
}

/**
 * The blueprint as context: the spine steps' filled answers, in spine
 * order, labelled and grouped by step.
 *
 *   skipStepId  the step being critiqued — it is already in the
 *               prompt in full and repeating it as "context" tells
 *               the model the same thing twice in two voices.
 *
 * Returns [] when the blueprint is empty, which is a GATE, not an
 * error: a page must be able to ask "is there any context?" without
 * building a prompt to find out.
 */
export function blueprintContext({ skipStepId } = {}) {
  const blob = loadBlueprint();
  const out = [];
  for (const { step } of SPINE) {
    if (step.id === skipStepId) continue;
    const answers = stepAnswers(step.id, blob);
    if (!answers.length) continue;
    const meta = stepMeta(step.id);
    out.push({ step: meta.num + ' · ' + meta.title, answers });
  }
  return out;
}

/** How much of the blueprint is filled in, as a fraction of the spine.
    Used by the panels to say what they are about to send. */
export function contextSummary(context) {
  const steps = (context || []).length;
  const fields = (context || []).reduce((n, g) => n + g.answers.length, 0);
  return { steps, fields, spine: SPINE.length };
}

export default {
  BLUEPRINT_KEY, loadBlueprint, labelFor,
  stepAnswers, stepMeta, blueprintContext, contextSummary
};
