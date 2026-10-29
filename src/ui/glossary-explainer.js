/* ============================================================
   GLOSSARY EXPLAINER — a glossary term opens the shared pop-up
   ------------------------------------------------------------
   openGlossaryTerm(term, trigger)

   chrome.js tags terms in step prose (span.glossary-term) and, since
   29 Oct 2026, a press on one opens the explainer (ui/explainer.js)
   instead of a hover tooltip: the kit modal on a desk, the bottom
   sheet on a phone. Same body as learn(): the definition, the Tanglish
   line, the example in each anchor film (learn.js termBody), up to two
   click-to-load videos, and "Why it matters" when a Learn topic points
   at this term and its blueprint step has a `why` block.

   Loaded on first press (dynamic import from chrome.js), so none of
   it is first paint. It writes nothing.
   ============================================================ */
import { h } from '../lib/dom.js';
import { termId } from '../lib/library-search.js';
import TOPICS from '../data/learn.json';

const WHY_MAX = 260;
const plain = (html) => {
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  return (box.textContent || '').replace(/\s+/g, ' ').trim();
};
function excerpt(text) {
  if (text.length <= WHY_MAX) return text;
  const cut = text.slice(0, WHY_MAX);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

async function whyFor(entry) {
  const names = [entry.term, ...(entry.aliases || [])].map((s) => String(s).toLowerCase());
  const t = (TOPICS.topics || []).find((x) => names.includes(String(x.glossary || '').toLowerCase()));
  if (!t) return null;
  for (const ptr of t.steps || []) {
    const [ns, id] = String(ptr).split('/');
    const m = ns === 'feature' ? await import('../data/steps.feature.json')
      : ns === 'short' ? await import('../data/steps.short.json') : null;
    const d = m && (m.default || m);
    const steps = !d ? [] : Array.isArray(d) ? d : Array.isArray(d.steps) ? d.steps : [].concat(d.vol1 || [], d.vol2 || []);
    const step = steps.find((s) => s && s.id === id);
    const b = step && (step.blocks || []).find((x) => x && x.type === 'why' && x.body);
    const text = b ? plain(b.body) : '';
    if (text) return excerpt(text);
  }
  return null;
}

export async function openGlossaryTerm(term, trigger) {
  const [{ openExplainer }, { termBody }] = await Promise.all([import('./explainer.js'), import('./learn.js')]);
  const key = String(term || '').toLowerCase();
  openExplainer({
    title: term,
    eyebrow: 'Film terminology',
    returnTo: trigger,
    build: async (body) => {
      const g = await import('../data/glossary.json').then((m) => m.default || m);
      const entry = (g.terms || []).find((x) => String(x.term).toLowerCase() === key
        || (x.aliases || []).some((a) => String(a).toLowerCase() === key));
      if (!entry) { body.replaceChildren(h('p', { text: term })); return; }
      const [rest, why] = await Promise.all([termBody(entry, { glossary: g }), whyFor(entry).catch(() => null)]);
      body.replaceChildren(...[
        h('div.learn-def', { text: entry.def }),
        rest,
        why ? h('div.learn-why', {}, [h('div.learn-label', { text: 'Why it matters' }), h('div.learn-why-text', { text: why })]) : null,
        h('a.learn-more', { href: 'library.html#' + termId(entry.term), text: 'Go deeper: film terminology' })
      ].filter(Boolean));
    }
  });
}
