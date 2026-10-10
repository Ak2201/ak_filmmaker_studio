/* ============================================================
   LEARN — the collapsed "What is a logline?" box
   ------------------------------------------------------------
   CONTRACT (other modules code against this):
     learn(topicId, { film }) → HTMLElement | null
   - a closed <details class="learn">; null for an unknown topic, so
     callers must filter before a native append() (append(null) prints
     "null" — CLAUDE.md trap).
   - `film` is a studies.json slug; omitted → the project's favourite.
   Content: src/data/learn.json. Nothing here writes storage.
   ============================================================ */
import { h } from '../lib/dom.js';
import LEARN from '../data/learn.json';

export function topic(id) {
  return (LEARN.topics || []).find((t) => t.id === id) || null;
}

export function learn(topicId /* , opts */) {
  const t = topic(topicId);
  if (!t) return null;
  return h('details.learn', { 'data-learn': t.id }, [
    h('summary.learn-q', { text: t.question || ('What is ' + t.term + '?') })
  ]);
}

export default { learn, topic };
