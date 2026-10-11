/* Node check for the learn-in-place topics (src/data/learn.json).
   Pointers, not copies: every pointer has to land. No browser. */
import fs from 'node:fs';
import * as LS from '../src/lib/library-search.js';

const read = (p) => JSON.parse(fs.readFileSync(new URL('../src/data/' + p, import.meta.url), 'utf8'));
const learn = read('learn.json');
const glossary = read('glossary.json');
const videos = read('videos.json').videos || [];
const feature = read('steps.feature.json');
const short = read('steps.short.json');
const films = Object.keys(glossary.films);

const STEPS = {
  feature: new Set([].concat(feature.vol1 || [], feature.vol2 || []).map((s) => s.id)),
  short: new Set((short.steps || []).map((s) => s.id))
};
const norm = (k) => String(k).startsWith('lib:') ? 'lib:' + String(k).slice(4).trim().toLowerCase().replace(/\s+/g, ' ') : String(k);
const YT = /^[A-Za-z0-9_-]{11}$/;
const approved = (key) => videos.filter((v) => v && v.approved === true && YT.test(v.yt || '')
  && (v.for || []).some((k) => norm(k) === norm(key)));

const NEEDED = [
  'idea', 'logline', 'story-bible', 'character', 'protagonist', 'antagonist', 'supporting-cast', 'want', 'need',
  'stakes', 'flaw', 'fear', 'lie', 'wound', 'arc', 'conflict', 'theme', 'world', 'beat-sheet', 'step-outline',
  'synopsis', 'screenplay', 'scene-heading', 'action', 'character-cue', 'dialogue', 'parenthetical', 'transition',
  'contd', 'breakdown', 'stripboard', 'dood', 'call-sheet', 'shot-list'
];
/* The story and screenplay topics must reach at least one approved video. */
const MUST_HAVE_VIDEO = new Set(NEEDED.slice(0, NEEDED.indexOf('contd') + 1));

const fails = [];
const bad = (m) => fails.push(m);
const topics = learn.topics || [];
const ids = new Set();

for (const id of NEEDED) if (!topics.some((t) => t.id === id)) bad('missing topic: ' + id);

for (const t of topics) {
  const at = 'topic ' + t.id + ': ';
  if (!t.id || ids.has(t.id)) bad(at + 'missing or duplicate id');
  ids.add(t.id);
  if (!t.term) bad(at + 'no term');

  const key = String(t.glossary || '').toLowerCase();
  const term = glossary.terms.find((x) => String(x.term).toLowerCase() === key
    || (x.aliases || []).some((a) => String(a).toLowerCase() === key));
  if (!term) { bad(at + 'glossary term "' + t.glossary + '" not found'); continue; }
  if (!term.def || term.def.length < 20) bad(at + 'term has no def');
  if (!term.tanglish) bad(at + 'term has no tanglish');
  for (const f of films) {
    const ex = (term.examples || []).find((e) => e.film === f);
    if (!ex || !ex.note) bad(at + 'term "' + term.term + '" has no example for ' + f);
  }

  for (const ptr of t.steps || []) {
    const [ns, sid] = String(ptr).split('/');
    if (!STEPS[ns] || !STEPS[ns].has(sid)) bad(at + 'step pointer ' + ptr + ' does not exist');
  }

  const keys = [].concat(t.videos || [], (t.steps || []).map((p) => 'step:' + p));
  let found = 0;
  for (const k of keys) found += approved(k).length;
  for (const k of t.videos || []) {
    if (!approved(k).length) bad(at + 'video target ' + k + ' has no approved video');
  }
  if (MUST_HAVE_VIDEO.has(t.id) && !found) bad(at + 'resolves to no approved video at all');
}

/* ---- Film terminology (library.html#glossary): every term is complete ---- */
const STAGE_IDS = ['story', 'screenplay', 'preprod', 'production', 'post'];
const slugs = new Map();
const nameSet = new Set();
for (const t of glossary.terms) {
  nameSet.add(String(t.term).toLowerCase());
  for (const a of t.aliases || []) nameSet.add(String(a).toLowerCase());
}
for (const t of glossary.terms) {
  const at = 'term "' + t.term + '": ';
  if (!STAGE_IDS.includes(t.stage)) bad(at + 'stage "' + t.stage + '" is not one of ' + STAGE_IDS.join('|'));
  if (!t.def || t.def.length < 20) bad(at + 'no def');
  if (!t.tanglish) bad(at + 'no tanglish');
  for (const f of films) {
    const ex = (t.examples || []).find((e) => e.film === f);
    if (!ex || !ex.note || ex.note.length < 20) bad(at + 'no example for ' + f);
  }
  const sl = LS.termId(t.term);
  if (slugs.has(sl)) bad(at + 'id ' + sl + ' duplicates "' + slugs.get(sl) + '"');
  slugs.set(sl, t.term);
  for (const s of t.seeAlso || []) if (!nameSet.has(String(s).toLowerCase())) bad(at + 'seeAlso "' + s + '" is not a term');
}
if (glossary.terms.length < 110) bad('glossary has ' + glossary.terms.length + ' terms; the terminology space promises ~120');
for (const need of ['logline', 'motif', 'subtext', 'macguffin', 'foreshadowing', 'dramatic irony', 'plant', 'red herring', 'set piece',
  'sequence', 'act break', 'midpoint', 'climax', 'denouement', 'character arc', 'b-story', 'montage', 'intercut', 'v.o.', 'o.s.',
  '(more)', 'slugline', 'shot list', 'storyboard', 'coverage', 'master shot', 'close-up', 'insert', 'cutaway', 'pov shot', 'two-shot',
  'over-the-shoulder', 'dolly', 'crane', 'steadicam', 'focal length', 'depth of field', 'aspect ratio', 'lut', 'blocking', 'rehearsal',
  'call time', 'call sheet', 'slate', 'take', 'continuity', 'script supervisor', 'dit', 'dailies', 'wrap', 'assembly', 'rough cut',
  'fine cut', 'picture lock', 'edit decision list', 'edit sheet', 'conform', 'colour grade', 'adr', 'foley', 'sound mix', 'm&e', 'dcp',
  'deliverables', 'festival premiere status']) {
  if (!nameSet.has(need)) bad('terminology is missing: ' + need);
}

/* ---- the library's own search (src/lib/library-search.js, pure) ---- */
const lib = {
  films: read('films.json'), directors: read('directors.json'), rules: read('rules.json'),
  rates: read('rates.chennai.2024.json'), watchlist: read('watchlist.json'),
  studies: read('studies.json').films, terms: glossary.terms
};
const index = LS.buildIndex(lib);
const hit = (q, group, title) => LS.searchLibrary(index, q).some((g) => g.group === group
  && g.items.some((i) => i.title.toLowerCase().includes(String(title).toLowerCase()) && i.href.startsWith('library.html#')));
if (!hit('logline', 'glossary', 'logline')) bad('search "logline" has no terminology hit');
if (!hit('picture lock', 'glossary', 'picture lock')) bad('search "picture lock" has no terminology hit');
if (!hit('edit sheet', 'glossary', 'edit decision list')) bad('search "edit sheet" does not find the edit decision list');
const firstFilm = lib.films[0].title;
if (!hit(firstFilm.slice(0, 6), 'films', firstFilm)) bad('search by film title "' + firstFilm + '" does not find the film');
if (!hit(lib.directors[0].name.split(' ')[0], 'directors', lib.directors[0].name)) bad('search does not find a director');
if (LS.searchLibrary(index, "a").length !== 0) bad('a one-letter query must return nothing');
const anchors = new Set();
for (const e of index) {
  if (!e.id || /[^a-z0-9-]/.test(e.id)) bad('search anchor "' + e.id + '" is not a clean id');
  anchors.add(e.id);
}
const anchorIds = { films: lib.films.map((f) => LS.filmId(f.title)), directors: lib.directors.map((d) => LS.directorId(d.name)),
  rules: lib.rules.map((r) => LS.ruleId(r.n)), watch: lib.watchlist.map((w) => LS.watchId(w.step)),
  rates: lib.rates.sections.flatMap((s) => [LS.rateTableId(s.id)].concat(s.rows.map((r) => LS.rateRowId(s.id, r.item)))) };
for (const [k, list] of Object.entries(anchorIds)) {
  if (new Set(list).size !== list.length) bad('library anchors collide on the ' + k + ' shelf');
}

if (fails.length) {
  console.error('test:learn FAILED (' + fails.length + ')');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('test:learn ok: ' + topics.length + ' topics, ' + glossary.terms.length + ' glossary terms, '
  + films.length + ' films');
