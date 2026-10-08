#!/usr/bin/env node
/* npm run test:brand — the product name and the seller's identity live in
   src/data/brand.json and nowhere else. Scans the shipped tree for strays. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const brand = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/brand.json'), 'utf8'));
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const spaced = String(brand.name).replace(/([a-z])([A-Z])/g, '$1 $2');
const names = [...new Set([brand.name, spaced])];
const PATTERNS = [/arunak/i, /curated by/i, /arunaaron85/i, ...names.map((n) => new RegExp(esc(n), 'i'))];

const SKIP_DIRS = new Set(['node_modules', 'legacy', 'docs', '.git', '.claude']);
const SKIP_PATHS = ['src/data/brand.json', 'scripts/check-brand.mjs', 'scripts/extract/'];
const TEXT = /\.(html|js|mjs|cjs|css|json|webmanifest|svg|txt|md|xml|toml|yml|yaml|map)$/i;

// Allowed lines: [file, regex the line must match]
const LINE_ALLOW = [
  ['src/lib/store.js', /arunak/i],
  ['src/lib/backup.js', /arunak/i],
  ['scripts/verify-migration.mjs', /arunak/i]
];
const PATH_FORM = /arunak-(filmmaker|shortfilm)-[\w.-]*/gi;

const roots = ['src', 'public', 'extension', 'scripts'];
const files = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html')).map((f) => f);
function walk(dir) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = dir + '/' + e.name;
    if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name) && !e.name.startsWith('dist')) walk(rel); }
    else if (TEXT.test(e.name)) files.push(rel);
  }
}
roots.forEach((r) => fs.existsSync(path.join(ROOT, r)) && walk(r));

let hits = 0;
for (const rel of files) {
  if (SKIP_PATHS.some((p) => rel === p || rel.startsWith(p))) continue;
  const lines = fs.readFileSync(path.join(ROOT, rel), 'utf8').split('\n');
  lines.forEach((line, i) => {
    const probe = line.replace(PATH_FORM, '');
    if (!PATTERNS.some((re) => re.test(probe))) return;
    if (LINE_ALLOW.some(([f, re]) => f === rel && re.test(probe))) return;
    hits++;
    console.log(`${rel}:${i + 1}: ${line.trim().slice(0, 140)}`);
  });
}
if (hits) { console.error(`\ncheck-brand: ${hits} stray brand reference(s). Use src/data/brand.json / {{brand:*}} / src/lib/brand.js.`); process.exit(1); }
console.log('check-brand: clean');
