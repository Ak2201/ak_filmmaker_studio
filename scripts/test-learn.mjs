/* Node check for the learn-in-place topics (src/data/learn.json).
   Pointers, not copies: every pointer has to land. No browser. */
import fs from 'node:fs';

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

if (fails.length) {
  console.error('test:learn FAILED (' + fails.length + ')');
  for (const f of fails) console.error('  - ' + f);
  process.exit(1);
}
console.log('test:learn ok: ' + topics.length + ' topics, ' + glossary.terms.length + ' glossary terms, '
  + films.length + ' films');
