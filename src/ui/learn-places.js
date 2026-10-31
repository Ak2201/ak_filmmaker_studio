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
function place() {
  queued = false;
  for (const [sel, topicId] of PLACES) {
    for (const sub of document.querySelectorAll(sel)) {
      if (done.has(sub)) continue;
      done.add(sub);
      const slot = h('div.learn-slot', { 'data-learn-place': topicId });
      sub.after(slot);
      import('./learn.js').then(({ learn }) => {
        const pill = learn(topicId);
        if (pill) slot.replaceChildren(pill); else slot.remove();
      }).catch(() => slot.remove());
    }
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
