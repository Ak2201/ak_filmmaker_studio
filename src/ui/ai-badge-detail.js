/* ============================================================
   THE "AI" BADGE — the words (lazy; see ai-badge.js)
   ------------------------------------------------------------
   Fills a badge's label from the stamp: which tool, which day, and whether
   the content has changed since. Reads only. A stamp that turns out to be
   nothing (a hand-edited `ai: {}`) removes the badge rather than leave a
   claim nothing backs.
   ============================================================ */
import { readStamp, isEdited } from '../lib/ai-stamp.js';
import { taskName } from '../lib/ai-history.js';
import '../styles/ai-badge.css';

const when = (iso) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

/** The badge's words: what happened, by which tool, when ('' = no stamp). */
export function badgeLabel(record, kind) {
  const st = readStamp(record);
  const made = st.created;
  const fill = st.fills[st.fills.length - 1];
  const s = made || fill;
  if (!s) return '';
  let edited = false;
  if (kind) edited = made ? (!made.legacy && isEdited(kind, record, made)) : isEdited(kind, record, fill);
  const verb = made ? 'Drafted by AI' : (fill.mode === 'append' ? 'Added to by AI' : fill.mode === 'replace' ? 'Rewritten by AI' : 'Filled in by AI');
  const date = s.at ? when(s.at) : '';
  return verb + ' — ' + taskName(s.task) + (date ? ', ' + date : '') + (edited ? ', changed since' : '');
}

/** Put the words on a badge `ai-badge.js` drew. */
export function describe(el, record, kind) {
  const label = badgeLabel(record, kind);
  if (!label) { el.remove(); return; }
  el.hidden = false;
  el.setAttribute('aria-label', label);
  el.title = label;
  el.classList.toggle('is-edited', /changed since$/.test(label));
}

export default { badgeLabel, describe };
