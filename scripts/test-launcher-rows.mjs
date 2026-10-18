// launcher-rows.json against navigation.json, plan-gate and tokens.css. Node, no browser.
import { readFileSync } from 'node:fs';
const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
const nav = JSON.parse(read('src/data/navigation.json'));
const { rows } = JSON.parse(read('src/data/launcher-rows.json'));
const tokens = read('src/styles/tokens.css');
const icons = JSON.parse(read('src/data/section-icons.json')).icons;
const gate = read('src/lib/plan-gate.js');
const offSrc = (gate.match(/export const OFF_BY_DEFAULT = \[([^\]]*)\]/) || [, ''])[1];
const off = (offSrc.match(/'([^']+)'/g) || []).map((s) => s.slice(1, -1));
let bad = 0;
const ok = (name, c) => { if (!c) { bad++; console.error('FAIL', name); } };

ok('OFF_BY_DEFAULT parsed', off.length > 5);
const mods = [...(nav.global || []).flatMap((g) => g.modules || []), ...nav.phases.flatMap((p) => p.modules)];
const ids = new Set(mods.map((m) => m.id));
ok('row ids unique', new Set(rows.map((r) => r.id)).size === rows.length);
const placed = new Map();
for (const r of rows) {
  ok(`row ${r.id} has a label`, !!r.label);
  ok(`row ${r.id} hue class "${r.hue}" exists in tokens.css`, new RegExp('\\.' + r.hue + '\\b').test(tokens));
  ok(`row ${r.id} glyph "${r.sym}" is in section-icons.json`, icons.includes(r.sym));
  for (const id of r.modules) {
    ok(`row ${r.id}: module "${id}" exists in navigation.json`, ids.has(id));
    placed.set(id, (placed.get(id) || 0) + 1);
  }
}
for (const m of mods.filter((x) => x.status === 'built' && !off.includes(x.id))) {
  ok(`live module "${m.id}" is in exactly one row (found ${placed.get(m.id) || 0})`, placed.get(m.id) === 1);
}
for (const [id, n] of placed) ok(`"${id}" appears once`, n === 1);
if (bad) { console.error(bad + ' failure(s)'); process.exit(1); }
console.log('launcher rows ok: ' + rows.length + ' rows, ' + placed.size + ' modules');
