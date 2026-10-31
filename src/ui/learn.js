/* ============================================================
   LEARN — a quiet "What is …?" that explains one craft term
   ------------------------------------------------------------
   learn(topicId, { film }) → HTMLButtonElement | null

   Drop the result where a beginner might stop and ask "what is
   this?". It is the kit PILL (learn-pill.js), the same on every page:
   a help icon and the question. A topic may carry `text` (its own
   words, no glossary term) and `pill` (the label). Pressing it opens the
   explainer (src/ui/explainer.js) OVER the page — the kit modal on a
   desk, the bottom sheet on a phone — and never expands in place, so
   the work under it does not move (owner, 29 Oct 2026; it was a
   <details> until then). The body is built on each open, so a page
   with thirty of them pays for thirty buttons and nothing else.

   POINTERS, NOT COPIES. src/data/learn.json names a glossary term,
   some blueprint steps and some video keys; the words come from
   those files at open time:
     - definition, Tanglish and the film example: glossary.json
     - videos: approvedFor() in lib/videos.js, shown through the
       click-to-load facade in ui/video.js (nothing loads before a
       click, and the player is youtube-nocookie)
     - "Why it matters": the blueprint step's own `why` block
   Every one of those is loaded with a dynamic import() on first
   open (glossary 40 KB, videos 28 KB, studies 100 KB, the step
   JSON), because each is its own chunk and none belongs in the
   first paint of a page that merely hosts a closed box. The explainer
   itself is a dynamic import too.

   It writes NOTHING: no storage, no keys. The film comes from
   favouriteSlug() when lib/studies.js has one, else the selected
   demo (currentSlug()); `film` overrides either. An open explainer
   follows onDemoChange() so its example tracks the picker, and stops
   listening when it closes.

   Returns null for an unknown id, so callers can filter before
   append — Element.append(null) prints the text "null".
   ============================================================ */
import TOPICS from '../data/learn.json';
import { h } from '../lib/dom.js';
import { termId } from '../lib/library-search.js';
import { pillEl } from './learn-pill.js';

const LIST = Array.isArray(TOPICS && TOPICS.topics) ? TOPICS.topics : [];
const BY_ID = new Map(LIST.map((t) => [t.id, t]));
const MAX_VIDEOS = 2;
const WHY_MAX = 260;

/** The topic record for an id, or null. */
export function topic(id) { return BY_ID.get(id) || null; }

function summaryText(t) {
  if (t.pill) return t.pill;
  if (t.question) return t.question;
  const w = String(t.term || t.id);
  return 'What is ' + (/^[aeiou]/i.test(w) ? 'an ' : 'a ') + w + '?';
}

/* ---- lazy sources ------------------------------------------- */
let glossaryP = null;
let studiesP = null;
const stepsP = {};
const loadGlossary = () => glossaryP || (glossaryP = import('../data/glossary.json').then((m) => m.default || m).catch(() => null));
const loadStudies = () => studiesP || (studiesP = import('../lib/studies.js').catch(() => null));
function loadSteps(ns) {
  if (stepsP[ns]) return stepsP[ns];
  const src = ns === 'feature' ? import('../data/steps.feature.json')
    : ns === 'short' ? import('../data/steps.short.json') : Promise.resolve(null);
  stepsP[ns] = src.then((m) => {
    const d = m && (m.default || m);
    if (!d) return [];
    if (Array.isArray(d)) return d;
    if (Array.isArray(d.steps)) return d.steps;
    return [].concat(d.vol1 || [], d.vol2 || []);
  }).catch(() => []);
  return stepsP[ns];
}

function plain(html) {
  const box = document.createElement('div');
  box.innerHTML = String(html || '');
  return (box.textContent || '').replace(/\s+/g, ' ').trim();
}
function excerpt(text) {
  if (text.length <= WHY_MAX) return text;
  const cut = text.slice(0, WHY_MAX);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '));
  return stop > 80 ? cut.slice(0, stop + 1) : cut.replace(/\s+\S*$/, '') + '…';
}

/** The first non-empty `why` block among the topic's steps, trimmed. */
async function whyFor(t) {
  for (const ptr of t.steps || []) {
    const [ns, id] = String(ptr).split('/');
    const steps = await loadSteps(ns);
    const step = steps.find((s) => s && s.id === id);
    if (!step) continue;
    for (const b of step.blocks || []) {
      if (b && b.type === 'why' && b.body) {
        const text = plain(b.body);
        if (text) return { text: excerpt(text), step: step.titlePlain || '', ptr };
      }
    }
  }
  return null;
}

async function videosFor(t) {
  const [{ approvedFor }, vid] = await Promise.all([import('../lib/videos.js'), import('./video.js')]);
  const keys = [].concat(t.videos || [], (t.steps || []).map((p) => 'step:' + p));
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    for (const v of approvedFor(k)) {
      if (seen.has(v.yt)) continue;
      seen.add(v.yt);
      out.push(v);
    }
  }
  return vid.watchBlock(out.slice(0, MAX_VIDEOS), 'Watch');
}

/* ---- the example, which follows the selected film ------------ */
function favourite(S) {
  try { if (S && typeof S.favouriteSlug === 'function') { const f = S.favouriteSlug(); if (f) return f; } } catch (e) { /* */ }
  return S && S.currentSlug ? S.currentSlug() : '';
}
function exampleBlock(term, glossary, S, slug) {
  const ex = (term && term.examples) || [];
  const pick = ex.find((e) => e.film === slug) || ex[0];
  if (!pick) return null;
  const study = S && S.getStudy ? S.getStudy(pick.film) : null;
  const title = (study && study.meta && study.meta.title) || pick.film;
  return h('div.learn-ex', {}, [
    h('strong.learn-ex-film', { text: 'In ' + title + ': ' }),
    pick.note
  ]);
}

function linkFor(t) {
  const first = (t.steps || [])[0];
  if (first) {
    const [ns, id] = first.split('/');
    if (ns === 'feature' || ns === 'short') {
      return { href: ns + '.html#' + id, text: 'Go deeper: the blueprint step' };
    }
  }
  /* No blueprint step to point at: the term's own card in the library's
     Film terminology space (ids come from library-search.js). */
  if (t.glossary) return { href: 'library.html#' + termId(t.glossary), text: 'Go deeper: film terminology' };
  return { href: 'library.html#glossary', text: 'Go deeper: film terminology' };
}

async function fill(body, t, opts, live) {
  const [glossary, S, why, vids] = await Promise.all([
    loadGlossary(), loadStudies(), whyFor(t).catch(() => null), videosFor(t).catch(() => null)
  ]);
  const key = String(t.glossary || '').toLowerCase();
  const term = glossary && (glossary.terms || []).find((x) =>
    String(x.term).toLowerCase() === key || (x.aliases || []).some((a) => String(a).toLowerCase() === key));

  const slot = h('div.learn-example');
  const draw = (slug) => {
    slot.replaceChildren();
    const ex = exampleBlock(term, glossary, S, slug);
    if (ex) slot.append(ex);
  };
  const slugNow = () => opts.film || favourite(S);
  draw(slugNow());
  if (S && S.onDemoChange && !opts.film && live.open) {
    const off = S.onDemoChange(() => {
      if (!live.open) { if (typeof off === 'function') off(); return; }
      draw(slugNow());
    });
    live.off = off;
  }

  const more = linkFor(t);
  const kids = [
    t.text ? h('div.learn-def', { text: t.text }) : null,
    term ? h('div.learn-def', { text: term.def }) : null,
    term && term.tanglish ? h('div.learn-tn', { lang: 'ta-Latn', text: term.tanglish }) : null,
    slot,
    why ? h('div.learn-why', {}, [
      h('div.learn-label', { text: 'Why it matters' }),
      h('div.learn-why-text', { text: why.text })
    ]) : null,
    vids,
    h('a.learn-more', { href: more.href, text: more.text })
  ].filter(Boolean);
  body.replaceChildren(...kids);
}

/* ---- the same body for a whole term, for the library ----------
   termBody(term, { film, glossary }) → Promise<HTMLElement>
   The library's Film terminology space shows every term with what a
   learn() box shows when it opens: the Tanglish line, the example in
   the reader's favourite film (the other films listed under it), the
   click-to-load video. `term` is a glossary record the caller already
   holds, so nothing here imports the glossary; nothing is written. */
export async function termBody(term, opts = {}) {
  const o = opts || {};
  const S = await loadStudies();
  const films = (o.glossary && o.glossary.films) || {};
  const all = ((term && term.examples) || []).filter((e) => e && e.note);
  const slot = h('div.learn-example');
  const draw = (slug) => {
    slot.replaceChildren();
    const pick = all.find((e) => e.film === slug) || all[0];
    const ex = exampleBlock(term, o.glossary, S, slug);
    if (ex) slot.append(ex);
    const rest = all.filter((e) => e !== pick);
    if (rest.length) {
      slot.append(h('ul.learn-ex-more', {}, rest.map((e) => h('li', {}, [
        h('span.learn-ex-film', { text: (films[e.film] || e.film) + ': ' }), e.note
      ]))));
    }
  };
  draw(o.film || favourite(S));
  if (S && S.onDemoChange && !o.film) {
    const off = S.onDemoChange(() => {
      if (!slot.isConnected) { if (typeof off === 'function') off(); return; }
      draw(favourite(S));
    });
  }
  const vids = await videosFor({ videos: ['lib:glossary/' + term.term], steps: [] }).catch(() => null);
  return h('div.learn-term', {}, [
    term.tanglish ? h('div.learn-tn', { lang: 'ta-Latn', text: term.tanglish }) : null,
    slot,
    vids
  ].filter(Boolean));
}

/** @returns {HTMLButtonElement|null} the trigger (the kit pill), or null for an unknown topic.
    opts.size 'sm' is for field labels and term cards. */
export function learn(topicId, opts = {}) {
  const t = topic(topicId);
  if (!t) return null;
  const o = opts || {};
  const btn = pillEl({ label: summaryText(t), size: o.size, topic: t.id, exempt: !!t.exempt });
  btn.addEventListener('click', () => {
    const live = { open: true, off: null };
    import('./explainer.js').then(({ openExplainer }) => openExplainer({
      title: t.question || summaryText(t),
      returnTo: btn,
      onClose: () => {
        live.open = false;
        if (typeof live.off === 'function') { try { live.off(); } catch (e) { /* */ } }
      },
      build: (body) => fill(body, t, o, live).catch(() => {
        body.replaceChildren(h('p', {}, [h('a.learn-more', { href: 'library.html#glossary', text: 'Open film terminology' })]));
      })
    })).catch((e) => console.warn('[learn] explainer', e));
  });
  return btn;
}

export default { learn, topic, termBody };
