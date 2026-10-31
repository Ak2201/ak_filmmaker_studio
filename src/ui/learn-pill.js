/* ============================================================
   LEARN PILL — the ONE trigger for every explainer (owner, 31 Oct 2026)
   ------------------------------------------------------------
   pillEl({ label, size, title, topic, exempt, attrs }) → button
   learnInline({ label, size, title, eyebrow, text, build }) → button

   Every "What is a …?" in the app is this button: the kit pill, a help
   icon and a question. It used to be a quiet dotted link in learn.js and
   four hand-rolled variants (budget, format notes, "Why this matters",
   the library's term cards). One class pair (`learn learn-pill`), one
   look (learn.css), so a proof can count them.

   This file imports no data and no explainer: learn.js adds the glossary
   topics on top, learnInline() opens the shared pop-up with a body the
   caller supplies (text or build). The explainer is a dynamic import on
   press, so a page with thirty pills pays for thirty buttons.

   A label is a question starting "What is / What are"; the few that are
   not (Why?, Who can see this budget?) say so with `exempt`, which
   prove:explainer reads. Nothing here writes storage.
   ============================================================ */
import { h } from '../lib/dom.js';
import '../styles/learn.css';

export const PILL_QUESTION = /^What (is|are) /;

/** The bare pill. size: 'md' (default, 32px) | 'sm' (28px). */
export function pillEl({ label, size = 'md', title = '', topic = '', exempt = false, extraClass = '', attrs = {} } = {}) {
  const cls = 'button.learn.learn-pill' + (size === 'sm' ? '.learn-pill--sm' : '') + (extraClass ? '.' + extraClass : '');
  const props = Object.assign({ type: 'button', 'aria-haspopup': 'dialog' }, attrs);
  if (topic) props['data-learn'] = topic;
  if (exempt) props['data-pill-exempt'] = '';
  if (title) props.title = title;
  return h(cls, props, [
    h('span.learn-pill-ic.sym', { text: 'help', 'aria-hidden': 'true', translate: 'no' }),
    h('span.learn-pill-label', { text: label })
  ]);
}

/** A pill that opens the explainer with a body the caller supplies. */
export function learnInline({ label, size = 'sm', title = '', heading = '', eyebrow = 'Explainer', text = '', build = null, exempt = false, topic = '', attrs = {}, extraClass = '', onClose = null } = {}) {
  const btn = pillEl({ label, size, title, topic, exempt: exempt || !PILL_QUESTION.test(label), extraClass, attrs });
  btn.addEventListener('click', () => {
    import('./explainer.js').then(({ openExplainer }) => openExplainer({
      title: heading || label,
      eyebrow,
      returnTo: btn,
      onClose,
      build: build || ((body) => { body.replaceChildren(h('p', { text })); })
    })).catch((e) => console.warn('[learn-pill] explainer', e));
  });
  return btn;
}

export default { pillEl, learnInline, PILL_QUESTION };
