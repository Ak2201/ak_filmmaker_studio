/* ============================================================
   THE LOGLINE WORKSHOP — story.html, path step 2
   ------------------------------------------------------------
   A check of the writer's OWN logline against the five parts a
   logline is made of (protagonist, goal, obstacle, stakes, irony),
   and five variants. One call, through src/lib/ai.js
   loglineWorkshop(), which verifies every span it says the writer
   wrote — a "found" span that is not word for word in their logline
   is stripped and counted, and this panel prints the count.

   IT RUNS IN THE AI DESK. This panel is the heading and one AI pill
   for the Desk's 'logline' task (src/lib/ai-tasks.js): the check is
   the Desk's note, the five variants are its list, and Accept takes
   the ticked variant as the logline through story.js's own save
   (`setLogline`), with Undo. Nothing is overwritten without that
   Accept, and results live in the Desk's memory only — a suggestion
   is not the writer's work.

   KEPT ALTERNATES. Every OTHER variant the writer ticks on that Accept
   is kept on the story as `loglineAlts` (strings; an additive field of
   the story blob, no key) and listed here under "Kept variants", each
   with "Use this" — which swaps it with the logline in use, so the
   one it replaces becomes an alternate rather than vanishing — and
   "Remove", with an Undo. Written only through story.js's commit
   (`setLoglineAlts`), the page's one save path.

   story.js carries one import and one line for this. This file
   imports none of the model code: the pill loads the Desk at a click,
   and the Desk loads ai.js.
   ============================================================ */
import { h } from '../lib/dom.js';
import { flushAutosave } from '../lib/autosave.js';
import { aiPill } from './ai-pill.js';
import StudioUI from './chrome.js';
import { loglineAltsOf } from '../lib/ai-writing-apply.js';
import '../styles/coverage.css';

/** The words in the logline field right now (a debounced keystroke
    may not have saved yet), else the stored logline. */
function liveLogline(getStory) {
  const ta = document.getElementById('stLogline');
  if (ta) return ta.value;
  const s = getStory && getStory();
  return s ? String(s.logline || '') : '';
}

/* The kept alternates, each with Use this / Remove. Both write
   through the page's own commit and re-read the story first, so a
   stale copy never saves over a newer one. */
function renderAlts(s, opts) {
  const alts = loglineAltsOf(s);
  if (!alts.length || typeof opts.setLoglineAlts !== 'function' || typeof opts.setLogline !== 'function') return null;
  const cur = () => opts.getStory ? opts.getStory() : s;
  const list = h('ul.st-lw-variants.st-lw-alts', { 'aria-label': 'Kept logline variants' });
  alts.forEach((t) => {
    const use = h('button.k-btn.k-btn--secondary.k-btn--sm', { type: 'button', text: 'Use this', 'aria-label': 'Use this variant as the logline' });
    const del = h('button.k-btn.k-btn--ghost.k-btn--sm', { type: 'button', text: 'Remove', 'aria-label': 'Remove this kept variant' });
    use.addEventListener('click', () => {
      flushAutosave();
      const now = loglineAltsOf(cur());
      const was = liveLogline(opts.getStory).trim();
      const next = now.filter((x) => x !== t);
      if (was && !next.includes(was)) next.push(was);
      opts.setLogline(t);
      opts.setLoglineAlts(next);
    });
    del.addEventListener('click', () => {
      const before = loglineAltsOf(cur());
      opts.setLoglineAlts(before.filter((x) => x !== t));
      try {
        StudioUI.toast('Variant removed.', {
          action: 'Undo',
          onAction: () => { const now = loglineAltsOf(cur()); if (!now.includes(t)) opts.setLoglineAlts(now.concat([t])); }
        });
      } catch (e) { /* chrome may not be up */ }
    });
    list.append(h('li.st-lw-alt', {}, [h('span.st-lw-alt-text', { text: t }), h('span.st-lw-alt-acts', {}, [use, del])]));
  });
  return h('div.st-lw-kept', {}, [h('h4.st-sub', { text: 'Kept variants' }), list]);
}

/** The panel. `opts` { getStory, setLogline, setLoglineAlts, format } from story.js. */
export function renderLoglineWorkshop(s, opts = {}) {
  const box = h('div.ai-panel.st-lw', { 'aria-label': 'Logline workshop' });
  box.append(h('div.ai-head', {}, [h('h3.ai-title', { text: 'Logline workshop' })]));
  box.append(h('p.st-muted', { text: 'A check of your logline for protagonist, goal, obstacle, stakes and irony — quoting only your words — and five variants to take or leave.' }));
  const pill = aiPill({
    label: 'Workshop my logline',
    tasks: ['logline'],
    ctx: () => {
      flushAutosave();   // a debounced keystroke must not land on top of a variant
      return {
        identity: 'logline',
        getLogline: () => liveLogline(opts.getStory),
        getStory: opts.getStory,
        setLogline: (t) => { flushAutosave(); if (opts.setLogline) opts.setLogline(t); },
        setLoglineAlts: opts.setLoglineAlts ? (list) => opts.setLoglineAlts(list) : undefined,
        format: opts.format
      };
    }
  });
  if (pill) box.append(h('div.ai-acts', {}, [pill]));
  const kept = renderAlts(s, opts);
  if (kept) box.append(kept);
  if (!String((s && s.logline) || '').trim()) {
    box.append(h('p.st-muted', { text: 'Write your logline above first — the workshop works on yours.' }));
  }
  return box;
}

export default { renderLoglineWorkshop };
