/* The element index derivations, in Node: node scripts/test-element-index.mjs */
import { categoryTotals, indexTotals, indexRows, toCSV, planBatch } from '../src/lib/element-index.js';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  x ' + m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m} - got ${JSON.stringify(a)}, want ${JSON.stringify(b)}`);
const CATS = [{ id: 'cast', label: 'Cast', hue: 'el-cast' }, { id: 'props', label: 'Props', hue: 'el-props' }, { id: 'stunts', label: 'Stunts', hue: 'el-stunts' }];
const scenes = [
  { id: 'a', number: '1', elements: { cast: ['Ravi', 'Meena'], props: ['Knife'] } },
  { id: 'b', number: '2A', elements: { cast: ['ravi'], props: ['Chai, "hot"'], ghost: ['x'] } },
  { id: 'c', number: '', elements: { cast: [' '], props: [] } }
];
const t = categoryTotals(scenes, CATS);
eq(t.map((c) => [c.id, c.tags, c.elements]), [['cast', 3, 2], ['props', 2, 2], ['stunts', 0, 0]], 'totals, case-insensitive, unknown category ignored, empty kept at zero');
eq(indexTotals(t), { tags: 5, elements: 4 }, 'grand totals');
const rows = indexRows(scenes, CATS);
eq(rows.map((r) => r.name), ['Meena', 'Ravi', 'Chai, "hot"', 'Knife'], 'sorted by category then name');
eq(rows.find((r) => r.name === 'Ravi').scenes.map((s) => s.number), ['1', '2A'], 'scene numbers in script order');
eq(indexRows(scenes, CATS, 'props').length, 2, 'category filter');
const csv = toCSV(rows);
ok(csv.startsWith('"Category","Element","Scenes (count)","Scene numbers"\r\n'), 'csv header');
ok(csv.includes('"Props","Chai, ""hot""","1","2A"'), 'csv quotes commas and quotes');
eq(toCSV([]), '"Category","Element","Scenes (count)","Scene numbers"\r\n', 'empty csv is just the header');
const p = planBatch(scenes, ['a', 'b', 'zzz'], 'cast', 'RAVI');
eq([p.tags.length, p.already], [0, 2], 'batch skips scenes that already carry the name');
const q = planBatch(scenes, ['a', 'b', 'c'], 'stunts', ' Fall ');
eq([q.tags.length, q.already, q.tags[0].name], [3, 0, 'Fall'], 'batch trims and plans every scene');
eq(planBatch(scenes, ['a'], 'cast', '  ').tags, [], 'blank name plans nothing');
console.log(`element-index: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
