// videos.json shape + every `for` key resolves. Node, no browser.
import { readFileSync } from 'node:fs';
import { normKey, libKey } from '../src/lib/video-keys.js';
const read = (f) => JSON.parse(readFileSync(new URL('../src/data/' + f, import.meta.url), 'utf8'));
const data = read('videos.json');
const films = read('films.json'), directors = read('directors.json'), rules = read('rules.json'), gloss = read('glossary.json');
const feat = read('steps.feature.json'), prod = read('steps.production.json'), short = read('steps.short.json');
const nav = read('navigation.json');

const valid = new Set(['landing']);
for (const s of [...feat.vol1, ...feat.vol2]) valid.add('step:feature/' + s.id);
for (const s of [...prod.production, ...prod.post]) valid.add('step:production/' + s.id);
for (const s of short.steps) valid.add('step:short/' + s.id);
for (const f of films) valid.add(libKey('film', f.title));
for (const d of directors) valid.add(libKey('director', d.name));
for (const r of rules) valid.add(libKey('rule', r.n));
for (const t of gloss.terms) valid.add(libKey('glossary', t.term));
const mods = [];
for (const p of nav.phases) mods.push(p, ...(p.modules || []));   // a phase id covers every page of that phase
for (const g of nav.global || []) { mods.push(g, ...(g.modules || [])); }
for (const m of mods) if (m.id) valid.add('module:' + m.id);

let bad = 0;
const fail = (m) => { bad++; console.error('FAIL ' + m); };
if (!Array.isArray(data.videos)) fail('videos is not an array');
const ids = new Set();
for (const v of data.videos || []) {
  const w = v.id || '(no id)';
  if (!v.id || ids.has(v.id)) fail(w + ': missing or duplicate id');
  ids.add(v.id);
  if (!/^[A-Za-z0-9_-]{11}$/.test(v.yt || '')) fail(w + ': yt must be 11 chars [A-Za-z0-9_-]');
  if (!v.title || typeof v.title !== 'string') fail(w + ': title');
  /* channel and minutes are optional: research could not always read them,
     and the player omits what is missing. When present they must be sane. */
  if (v.channel != null && (typeof v.channel !== 'string' || !v.channel)) fail(w + ': channel');
  if (v.minutes != null && !(v.minutes > 0)) fail(w + ': minutes');
  if (typeof v.approved !== 'boolean') fail(w + ': approved must be boolean');
  if (!Array.isArray(v.for) || !v.for.length) fail(w + ': for[]');
  for (const k of v.for || []) if (!valid.has(normKey(k))) fail(w + ': unresolved key ' + k);
}
if (bad) { console.error(bad + ' problem(s)'); process.exit(1); }
console.log('videos ok: ' + data.videos.length + ' entries, ' + valid.size + ' valid keys');
