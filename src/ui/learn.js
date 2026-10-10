/* ============================================================
   LEARN IN PLACE — a closed <details> that explains one craft term
   ------------------------------------------------------------
   learn(topicId, { film }) → HTMLElement | null

   Drop the result where a beginner might stop and ask "what is
   this?". It is ONE quiet line while closed. The body is built on
   the first open, so a page with thirty of them pays for thirty
   <details> and nothing else.

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
   first paint of a page that merely hosts a closed box.

   It writes NOTHING: no storage, no keys. The film comes from
   favouriteSlug() when lib/studies.js has one, else the selected
   demo (currentSlug()); `film` overrides either. An open box
   follows onDemoChange() so its example tracks the picker.

   Returns null for an unknown id, so callers can filter before
   append — Element.append(null) prints the text "null".
   ============================================================ */
import TOPICS from '../data/learn.json';
import { h } from '../lib/dom.js';
import '../styles/learn.css';

const LIST = Array.isArray(TOPICS && TOPICS.topics) ? TOPICS.topics : [];
const BY_ID = new Map(LIST.map((t) => [t.id, t]));
const MAX_VIDEOS = 2;
const WHY_MAX = 260;

/** The topic record for an id, or null. */
export function topic(id) { return BY_ID.get(id) || null; }

function summaryText(t) {
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
  return { href: 'library.html#glossary', text: 'Go deeper: the glossary' };
}

async function fill(box, t, opts) {
  const body = box.querySelector('.learn-body');
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
  if (S && S.onDemoChange && !opts.film) {
    const off = S.onDemoChange(() => {
      if (!box.isConnected) { if (typeof off === 'function') off(); return; }
      draw(slugNow());
    });
  }

  const more = linkFor(t);
  const kids = [
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
  body.removeAttribute('aria-busy');
}

/** @returns {HTMLDetailsElement|null} a closed box, or null for an unknown topic */
export function learn(topicId, opts = {}) {
  const t = topic(topicId);
  if (!t) return null;
  const o = opts || {};
  const box = h('details.learn', { 'data-learn': t.id }, [
    h('summary', {}, [h('span.learn-q', { text: summaryText(t) })]),
    h('div.learn-body', { 'aria-busy': 'true' }, [h('div.learn-wait', { text: 'Loading…' })])
  ]);
  let built = false;
  box.addEventListener('toggle', () => {
    if (!box.open || built) return;
    built = true;
    fill(box, t, o).catch(() => {
      const body = box.querySelector('.learn-body');
      if (body) body.replaceChildren(h('p', {}, [h('a.learn-more', { href: 'library.html#glossary', text: 'Open the glossary' })]));
    });
  });
  return box;
}

export default { learn, topic };
