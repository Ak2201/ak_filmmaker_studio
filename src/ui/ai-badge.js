/* ============================================================
   THE "AI" BADGE — on a record an AI Accept wrote
   ------------------------------------------------------------
   docs/AI-FAST-HARNESS.md B6(c). `aiBadge(record, kind)` is a small
   `span.ai-badge` ("AI") that says, to a screen reader too, what and when
   ("Drafted by AI — Shot division, 2 Nov", and ", changed since" once the
   content no longer matches what the run wrote). It returns null for a
   record with no stamp, so a caller filters before it appends
   (append(null) prints "null"). Reads the stamp only; writes nothing.
   `kind` is the record's AI_KINDS name (ai-stamp.js): without it "changed
   since" cannot be told and is left out.

   THIS FILE IS ON FIRST PAINT (the shot list, the scene list, every script
   row, a story step), and those pages sit at their byte budgets, so it is a
   stub: it draws the mark HIDDEN, with its generic label, and
   ai-badge-detail.js (a lazy chunk with the stylesheet, fetched only when a
   page really holds a stamped record) writes the words (which tool, which
   day, changed since) and shows it. If that chunk cannot load, the badge is
   shown with the generic label rather than left hidden.
   ============================================================ */
import { h } from '../lib/dom.js';

const GENERIC = 'Drafted by AI';

/** span.ai-badge, or null for a record no AI run stamped. */
export function aiBadge(record, kind) {
  if (!record || !(record.ai || (Array.isArray(record.aiFill) && record.aiFill.length))) return null;
  const b = h('span.ai-badge', { role: 'img', 'aria-label': GENERIC, title: GENERIC, text: 'AI', hidden: true });
  import('./ai-badge-detail.js').then((m) => m.describe(b, record, kind)).catch(() => { b.hidden = false; });   // the generic label stands
  return b;
}

export default { aiBadge };
