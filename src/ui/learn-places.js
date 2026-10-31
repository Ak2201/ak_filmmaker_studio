/* ============================================================
   LEARN PLACES — where a page's newcomer terms get their pill
   ------------------------------------------------------------
   A table of "under this subtitle, the pill for that topic". The pages
   that own these sections draw them in many branches (empty, populated,
   re-rendered per tab), so instead of threading a call through each
   renderer one observer fills any listed anchor that appears and has no
   pill yet. It is idempotent (an anchor already followed by a slot is
   skipped), writes NOTHING to storage, and learn.js (the topic data,
   the glossary pointers) is a dynamic import made only when an anchor
   exists, so a page with none of these pays for a selector sweep.

   Placement rule (UX spec §3): directly under the section's subtitle,
   left aligned. A new section is one more row here, and a topic id
   that learn.json does not hold simply draws nothing.
   ============================================================ */
import { h } from '../lib/dom.js';

const PLACES = [
  ['#stripboard > .bd-sub', 'stripboard'],
  ['#dood .bd-sub', 'dood'],
  ['#call-sheets > .bd-sub', 'call-sheet'],
  ['#sides > .bd-sub', 'sides'],
  ['#oneliner > .bd-sub', 'one-liner'],
  ['#elements > .bd-sub', 'breakdown-elements'],
  ['#shot-list > .bd-sub', 'shot-list'],
  ['.sa-head-copy > .sa-sub', 'coverage']
];

let queued = false;
const done = new WeakSet();   // an anchor is tried once: a topic that draws nothing must not loop
/* ONE sweep per frame, not one per row (review, 31 Oct 2026): the
   observer watches the whole document for the life of every page, so
   eight querySelectorAll calls a frame was the cost of a page that has
   none of these sections. */
const ALL = PLACES.map(([sel]) => sel).join(', ');
function place() {
  queued = false;
  for (const sub of document.querySelectorAll(ALL)) {
    if (done.has(sub)) continue;
    done.add(sub);
    const row = PLACES.find(([sel]) => sub.matches(sel));
    if (!row) continue;
    const topicId = row[1];
    /* The slot reserves the pill's height (learn.css), so the pill
       arriving a dynamic import later moves nothing below it. */
    const slot = h('div.learn-slot', { 'data-learn-place': topicId });
    sub.after(slot);
    import('./learn.js').then(({ learn }) => {
      const pill = learn(topicId);
      if (pill) slot.replaceChildren(pill); else slot.remove();
    }).catch(() => slot.remove());
  }
}
function schedule() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(place);
}

if (typeof document !== 'undefined' && typeof MutationObserver === 'function') {
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true });
  if (document.readyState !== 'loading') schedule();
  else document.addEventListener('DOMContentLoaded', schedule, { once: true });
}
