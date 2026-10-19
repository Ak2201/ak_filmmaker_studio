/* ============================================================
   LIBRARY SEARCH — the library's own index, and nothing else
   ------------------------------------------------------------
   Owner's brief: "search in library should search only items in
   library space". The command palette searches the whole studio;
   this searches the eight shelves the Library page is made of —
   films, directors, rules, equipment, the watch list, case studies,
   dissection, film terminology — and every hit is a link to
   `library.html#<anchor>` that exists in the DOM the page draws.

   PURE. It imports nothing, reads no storage, writes no storage and
   touches no DOM, so it is safe in the first paint of any page and
   testable in Node (scripts/test-learn.mjs does). The page hands it
   the same arrays it renders from; the index is a derivation, never
   a second copy of the content. Film terminology arrives later (the
   glossary is a lazy chunk), through buildIndex() again.

   ANCHORS. Each shelf item needs a stable id; the page and this file
   must agree on it, so the id builders live here and the page imports
   them. Never hand-write one on either side.
   ============================================================ */

/** Lowercase, hyphen-joined, ASCII-safe. "M&E" → "m-e", "(MORE)" → "more". */
export function slug(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export const filmId = (title) => 'film-' + slug(title);
export const directorId = (name) => 'director-' + slug(name);
export const ruleId = (n) => 'rule-' + slug(n);
export const rateTableId = (sectionId) => 'rates-' + slug(sectionId);
export const rateRowId = (sectionId, item) => 'rate-' + slug(sectionId) + '-' + slug(item);
export const watchId = (step) => 'watch-' + slug(step);
export const termId = (term) => 'term-' + slug(term);

/** The shelves, in page order. `id` is the tab's section id. */
export const GROUPS = [
  { id: 'films', label: 'Films' },
  { id: 'directors', label: 'Directors' },
  { id: 'rules', label: 'Rules' },
  { id: 'equipment', label: 'Equipment & rates' },
  { id: 'watch', label: 'Watch list' },
  { id: 'case-studies', label: 'Case studies' },
  { id: 'dissection', label: 'Dissection' },
  { id: 'glossary', label: 'Film terminology' }
];

const plain = (s) => String(s == null ? '' : s).replace(/<[^>]*>/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const fold = (s) => plain(s).toLowerCase();
const arr = (v) => (Array.isArray(v) ? v : []);

function entry(group, id, title, sub, extra, weight) {
  const t = plain(title);
  return {
    group, id, title: t, sub: plain(sub),
    t: t.toLowerCase(),
    hay: fold([t, sub, extra].filter(Boolean).join(' ')),
    w: weight || 0
  };
}

/**
 * @param {object} src  { films, directors, rules, rates, watchlist,
 *                        studies, dissections, terms }  — any may be absent.
 * @returns {Array} flat entries; groups are carried on each.
 */
export function buildIndex(src) {
  const s = src || {};
  const out = [];

  for (const f of arr(s.films)) {
    out.push(entry('films', filmId(f.title), f.title, [f.director, f.year].filter(Boolean).join(' · '),
      [f.meta, arr(f.tags).join(' '), arr(f.genres).join(' '), f.lesson].join(' ')));
  }
  for (const d of arr(s.directors)) {
    out.push(entry('directors', directorId(d.name), d.name, d.era || d.archetype,
      [d.years, d.signature, d.watch, arr(d.traits).map((t) => t.term + ' ' + t.value).join(' ')].join(' ')));
  }
  for (const r of arr(s.rules)) {
    out.push(entry('rules', ruleId(r.n), r.text, 'Rule ' + r.n + (r.attribution ? ' · ' + r.attribution : ''), r.attribution));
  }
  const rates = (s.rates && s.rates.sections) || [];
  for (const sec of rates) {
    out.push(entry('equipment', rateTableId(sec.id), sec.heading, 'Rate table', sec.note, 1));
    for (const row of arr(sec.rows)) {
      out.push(entry('equipment', rateRowId(sec.id, row.item), row.item, sec.heading, [row.raw, row.note].join(' ')));
    }
  }
  for (const st of arr(s.watchlist)) {
    out.push(entry('watch', watchId(st.step), st.heading, st.label, '', 1));
    for (const f of arr(st.films)) {
      out.push(entry('watch', watchId(st.step), f.title + (f.year ? ' (' + f.year + ')' : ''), st.label + ' · ' + plain(st.heading), f.why));
    }
  }
  for (const c of arr(s.studies)) {
    const m = c.meta || c;
    out.push(entry('case-studies', 'case-studies', m.title, [m.director, m.year, m.genre].filter(Boolean).join(' · '),
      [m.slug, c.concept && c.concept.premise].join(' ')));
  }
  for (const d of arr(s.dissections)) {
    const m = d.meta || d;
    out.push(entry('dissection', 'dissection', m.title, [m.director, m.year].filter(Boolean).join(' · '), m.slug));
  }
  for (const t of arr(s.terms)) {
    out.push(entry('glossary', termId(t.term), t.term,
      stageLabel(t.stage) + (t.def ? ' · ' + firstSentence(t.def) : ''),
      [arr(t.aliases).join(' '), t.def, t.tanglish, arr(t.examples).map((e) => e.note).join(' ')].join(' '), 0));
    const last = out[out.length - 1];
    last.alias = arr(t.aliases).map((a) => String(a).toLowerCase());
  }
  return out;
}

export const STAGES = [
  { id: 'story', label: 'Story' },
  { id: 'screenplay', label: 'Screenplay' },
  { id: 'preprod', label: 'Pre-Production' },
  { id: 'production', label: 'Production' },
  { id: 'post', label: 'Post' }
];
export function stageLabel(id) {
  const s = STAGES.find((x) => x.id === id);
  return s ? s.label : '';
}
function firstSentence(t) {
  const m = String(t).match(/^.*?[.!?](\s|$)/);
  const s = (m ? m[0] : String(t)).trim();
  return s.length > 110 ? s.slice(0, 107).replace(/\s+\S*$/, '') + '…' : s;
}

function score(e, tokens, q) {
  let sc = 0;
  for (const tk of tokens) {
    if (!e.hay.includes(tk)) return 0;
  }
  if (e.t === q) sc += 100;
  else if (e.t.startsWith(q)) sc += 60;
  else if (e.t.includes(q)) sc += 40;
  if (e.alias && e.alias.some((a) => a === q || a.startsWith(q))) sc += 50;
  for (const tk of tokens) if (e.t.includes(tk)) sc += 6;
  return sc + 1 - e.w;
}

/**
 * @returns {Array<{group:string,label:string,total:number,items:Array<{title:string,sub:string,id:string,href:string}>}>}
 *   in page order, only groups with hits. `limit` caps items per group.
 */
export function searchLibrary(index, query, opts) {
  const q = fold(query);
  if (!q || q.length < 2) return [];
  const limit = (opts && opts.limit) || 6;
  const tokens = q.split(' ').filter(Boolean);
  const by = new Map();
  const seen = new Set();
  for (const e of index || []) {
    const sc = score(e, tokens, q);
    if (!sc) continue;
    const key = e.group + '|' + e.id + '|' + e.t;
    if (seen.has(key)) continue;
    seen.add(key);
    if (!by.has(e.group)) by.set(e.group, []);
    by.get(e.group).push({ e, sc });
  }
  const out = [];
  for (const g of GROUPS) {
    const hits = by.get(g.id);
    if (!hits) continue;
    hits.sort((a, b) => b.sc - a.sc);
    out.push({
      group: g.id, label: g.label, total: hits.length, best: hits[0].sc,
      items: hits.slice(0, limit).map(({ e }) => ({
        title: e.title, sub: e.sub, id: e.id, href: 'library.html#' + e.id
      }))
    });
  }
  /* The shelf whose best hit is the closest match leads (a term named
     "logline" beats a watch-list step that merely mentions it); a tie
     keeps page order, because the sort is stable. */
  out.sort((a, b) => b.best - a.best);
  return out;
}

/* ---- the Library index (the master index the hub used to carry) ----
   A derived list of the library's sections and, under each, its items,
   each a link to an anchor on this page. Derived from the same arrays;
   nothing hand-listed. `sections` is [{id,title,desc}] from the page. */
export function libraryContents(sections, src) {
  const s = src || {};
  const items = {
    films: arr(s.films).map((f) => ({ title: f.title, id: filmId(f.title) })),
    directors: arr(s.directors).map((d) => ({ title: d.name, id: directorId(d.name) })),
    equipment: ((s.rates && s.rates.sections) || []).map((x) => ({ title: x.heading, id: rateTableId(x.id) })),
    watch: arr(s.watchlist).map((w) => ({ title: w.label + ' · ' + plain(w.heading), id: watchId(w.step) }))
  };
  return arr(sections).map((sec) => Object.assign({}, sec, { items: items[sec.id] || sec.items || [] }));
}

export default { slug, buildIndex, searchLibrary, libraryContents, GROUPS, STAGES, stageLabel,
  filmId, directorId, ruleId, rateTableId, rateRowId, watchId, termId };
