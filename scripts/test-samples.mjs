/* ============================================================
   SAMPLES — every registered sample keeps the sample rules
   ------------------------------------------------------------
   CLAUDE.md open item 8: a sample is a RECONSTRUCTION; no real person
   beside a contact detail; no reproduction of a real screenplay. And
   the registry (src/lib/samples.js) promises that the files it names
   exist and agree with each other. Asserted for EVERY sample:
     · _about says "reconstruction";
     · every contact email ends .example, every call-sheet name is a
       contact, scene numbers are unique;
     · the story outline's sceneIds resolve to the ids hub.js builds
       (`${id}-sc-<number>`);
     · the script's headings equal the scene list in count and order
       (INT/EXT and DAY/NIGHT agree, normalised like scene-sync's norm);
     · call-sheet scenes, shots, frames and media links resolve;
     · the derived figures are positive;
     · The Dark Knight carries none of the film's famous lines.
   Pure Node, no browser.   node scripts/test-samples.mjs
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sampleFigures } from '../src/lib/sample-figures.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA = path.join(ROOT, 'src', 'data');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };
const norm = (t) => String(t ?? '').trim().replace(/\s+/g, ' ').toUpperCase();

// The registry's ids, read off the module (it imports JSON, which Node
// will not without attributes), and the files it points at.
const reg = fs.readFileSync(path.join(ROOT, 'src', 'lib', 'samples.js'), 'utf8');
const ids = [...reg.matchAll(/^\s{4}id:\s*'([a-z]+)'/gm)].map((m) => m[1]);
ok(ids.length >= 2, 'registry lists at least dragon and darkknight');
ok(ids[0] === 'dragon', 'dragon is first (the default)');
ok(/DEFAULT_SAMPLE\s*=\s*'dragon'/.test(reg), "DEFAULT_SAMPLE is 'dragon'");

const FORBIDDEN = ['why so serious', 'die a hero', 'become the villain', 'gotham deserves', 'deserves a better class', 'magic trick', 'agent of chaos',
  'some men just want', "let's put a smile", 'let’s put a smile', 'you complete me', 'the night is darkest'];

for (const id of ids) {
  const read = (f) => fs.readFileSync(path.join(DATA, `sample.${id}${f}.json`), 'utf8');
  for (const f of ['.script', '.story']) {
    ok(reg.includes(`../data/sample.${id}${f}.json`), `${id}: registry loads the ${f.slice(1)} file`);
  }
  const rawMain = read(''), rawScript = read('.script'), rawStory = read('.story');
  const d = JSON.parse(rawMain), sc = JSON.parse(rawScript), st = JSON.parse(rawStory).story;
  const tag = (m) => `${id}: ${m}`;

  ok(/reconstruction/i.test([].concat(d._about).join(' ')), tag('_about says "reconstruction"'));
  ok(typeof d.title === 'string' && d.title, tag('has a title'));

  const bad = d.contacts.filter((c) => !/\.example$/i.test(String(c.email || '')));
  ok(d.contacts.length > 0 && !bad.length, tag('every contact email ends .example ' + bad.map((c) => c.email).join(',')));

  const numbers = d.scenes.map((s) => String(s.number));
  ok(new Set(numbers).size === numbers.length, tag('scene numbers are unique'));
  const sceneId = (n) => `${id}-sc-${n}`;
  const ids_ = new Set(numbers.map(sceneId));

  const outline = (st && st.outline) || [];
  ok(outline.length > 0, tag('story has an outline'));
  for (const step of outline) if (step.sceneId) ok(ids_.has(step.sceneId), tag(`outline step ${step.id} names a real scene (${step.sceneId})`));
  ok(String(st.logline || '').length > 0 && String(st.idea || '').length > 0, tag('story has idea and logline'));

  const heads = (sc.elements || []).filter((e) => e.type === 'scene' && String(e.text || '').trim());
  ok(heads.length === d.scenes.length, tag(`script headings (${heads.length}) equal scenes (${d.scenes.length})`));
  heads.forEach((h, i) => {
    const s = d.scenes[i]; if (!s) return;
    const t = norm(h.text);
    ok(t.startsWith(norm(s.intExt)), tag(`heading ${i + 1} INT/EXT matches scene ${s.number}`));
    ok(new RegExp('\\b' + norm(s.dayNight).replace('/', '\\/') + '\\b').test(t), tag(`heading ${i + 1} ${s.dayNight} matches scene ${s.number}`));
  });
  ok((sc.elements || [])[0] && /reconstruction|sample|placeholder/i.test(sc.elements[0].text || ''), tag('first script element says what it is'));

  const names = new Set(d.contacts.map((c) => c.name));
  for (const cs of d.callSheets) {
    ok(/reconstruction|invented|sample/i.test(cs.notes || ''), tag(`call sheet "${cs.title}" says it is invented`));
    for (const n of cs.sceneNumbers || []) ok(numbers.includes(String(n)), tag(`call sheet scene ${n} exists`));
    for (const n of Object.keys(cs.calls || {})) ok(names.has(n), tag(`call sheet names a contact: ${n}`));
    ok(Object.prototype.hasOwnProperty.call(d.days, String(cs.day)), tag(`call sheet day ${cs.day} is on the calendar`));
  }
  const shotKeys = new Set();
  for (const s of d.shots) {
    ok(numbers.includes(String(s.scene)), tag(`shot ${s.scene}/${s.number} names a scene`));
    shotKeys.add(s.scene + '/' + s.number);
  }
  for (const f of d.frames) ok(shotKeys.has(f.scene + '/' + f.shotNumber), tag(`frame names a shot (${f.scene}/${f.shotNumber})`));
  const locs = new Set(d.scenes.map((s) => String(s.location).trim().toLowerCase()));
  for (const m of d.media) if (m.linkedTo) ok(locs.has(String(m.linkedTo).trim().toLowerCase()), tag(`media links a scene location (${m.linkedTo})`));
  for (const k of Object.keys(d.recces)) ok(locs.has(k.trim().toLowerCase()), tag(`recce is for a scene location (${k})`));
  for (const s of d.scenes) ok(Object.prototype.hasOwnProperty.call(d.days, String(s.shootDay)), tag(`scene ${s.number} shoot day ${s.shootDay} is on the calendar`));

  const fig = sampleFigures(d);
  ok(fig.scenes > 0 && fig.days > 0 && fig.locations > 0 && fig.unit > 0, tag('derived figures are positive ' + JSON.stringify(fig)));
  ok(d.calc.length > 0 && d.calc.every((r) => r.item && Number(r.rate) > 0 && Number(r.days) > 0), tag('budget rows are positive'));

  if (id === 'darkknight') {
    for (const [name, raw] of [['main', rawMain], ['script', rawScript], ['story', rawStory]]) {
      const low = raw.toLowerCase();
      for (const p of FORBIDDEN) ok(!low.includes(p), tag(`${name} file has no "${p}"`));
    }
  }
}

/* Every sample row is LINKED to its heading at creation (QA r2): an
   unlinked row is never binned, so a heading changed before the first
   sync left a ghost scene in the Breakdown for good. And a sample says
   it is made in India, so India-only tools are offered on it. */
{
  await import('./node-seams.mjs');
  const HS = await import('../src/lib/hub-sample.js');
  const SA = await import('../src/lib/screenplay-analysis.js');
  const Sync = await import('../src/lib/scene-sync.js');
  const { SAMPLES } = await import('../src/lib/samples.js');
  for (const meta of SAMPLES) {
    const sample = { ...meta, data: (await meta.loadData()).default };
    const pages = (await meta.loadScript()).default.elements;
    const scenes = HS.sampleScenes(sample);
    const els = HS.sampleScript(sample, pages).elements;
    const n = HS.linkSampleScenes(scenes, els, SA);
    ok(n === scenes.length && scenes.every((s) => s.scriptElId), `${meta.id}: every scene is linked to its heading at creation (${n}/${scenes.length})`);
    ok(meta.region === 'IN', `${meta.id}: the sample is marked as made in India`);
    // the 8th heading turned into action: its scene goes to the bin, as in any project
    const heads = els.filter((e) => e.type === 'scene');
    const eighth = heads[7];
    const edited = els.map((e) => (e === eighth ? { ...e, type: 'action' } : e));
    const plan = Sync.reconcile(edited, scenes, { prev: Sync.headingMap ? Sync.headingMap(els) : undefined });
    const lost = scenes.find((s) => s.scriptElId === eighth.id);
    ok(lost && plan.bin.some((b) => b.sceneId === lost.id), `${meta.id}: removing a heading bins its scene`);
  }
}

console.log(`test-samples — ${pass} passed, ${fail} failed (${ids.join(', ')})`);
if (fail) process.exit(1);
