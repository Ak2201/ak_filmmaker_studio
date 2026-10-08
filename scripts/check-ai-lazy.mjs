#!/usr/bin/env node
/* ============================================================
   CHECK: src/lib/ai.js stays out of every first paint
   ------------------------------------------------------------
   verify's LAZY_CHUNKS guard fails a first paint that fetches a
   lazy chunk BY NAME (supabase-*, pptxgen-*, sample.dragon.script-*).
   ai.js has no chunk of its own in vite.config.js manualChunks, so
   there is no name to match. This check asks the same question by
   CONTENT instead: does a page's static first-paint graph — the
   modulepreload list Vite writes into each built HTML, which is the
   static import closure of its entry — contain the code of ai.js?

   The marker is a string only ai.js carries: the Anthropic browser-
   access header. It is searched for in every preloaded file of every
   page in scripts/budget.json.

   EXCEPT is a named list, not a silent skip. Each entry is a page
   that is known to pull ai.js statically today, with the reason. It
   is checked to be TRUE, so an exception that stops being needed
   fails the run (the same anti-rot rule verify applies to EXPECTED).

   Needs a built dist/ (`npm run build:open` or `npm run build`).
   Run:  node scripts/check-ai-lazy.mjs     (or: npm run test:ai-lazy)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const MARKER = 'anthropic-dangerous-direct-browser-access';

/* Pages that statically import ai.js today, and why. Remove an entry
   when ai.js gets its own chunk (vite.config.js manualChunks) and the
   page stops pulling it in. */
const EXCEPT = {
  settings: 'settings.js imports ai-panel.js statically (line 83), which imports ai.js. Fix: give ai.js a chunk in vite.config.js, then let settings load it lazily.',
};

const budget = JSON.parse(fs.readFileSync(path.join(ROOT, 'scripts', 'budget.json'), 'utf8'));
const pages = Object.keys(budget.pages);
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

const cache = new Map();
const read = (rel) => {
  if (!cache.has(rel)) cache.set(rel, fs.readFileSync(path.join(DIST, rel), 'utf8'));
  return cache.get(rel);
};

if (!fs.existsSync(DIST)) {
  console.log('check-ai-lazy: no dist/ — run npm run build:open first');
  process.exit(1);
}

const hits = {};
for (const page of pages) {
  const html = path.join(DIST, (page === 'hub' ? 'index' : page) + '.html');   // the hub is index.html
  if (!fs.existsSync(html)) { ok(false, `${page}: ${path.relative(ROOT, html)} is missing`); continue; }
  const doc = fs.readFileSync(html, 'utf8');
  const files = new Set();
  for (const m of doc.matchAll(/<script[^>]*\ssrc="([^"]+\.js)"/g)) files.add(m[1]);
  for (const m of doc.matchAll(/<link[^>]*rel="modulepreload"[^>]*href="([^"]+\.js)"/g)) files.add(m[1]);
  for (const m of doc.matchAll(/<link[^>]*href="([^"]+\.js)"[^>]*rel="modulepreload"/g)) files.add(m[1]);
  const carriers = [...files].filter((f) => read(f.replace(/^\.\//, '')).includes(MARKER)).map((f) => f.replace(/^\.\//, ''));
  hits[page] = carriers;
}

for (const page of pages) {
  const carriers = hits[page];
  if (!carriers) continue;
  if (EXCEPT[page]) {
    ok(carriers.length > 0, `${page}: listed in EXCEPT but ai.js no longer loads on its first paint — remove the entry`);
    console.log(`  · ${page}: excepted (${carriers.length} preloaded file${carriers.length === 1 ? '' : 's'} carry ai.js)`);
  } else {
    ok(carriers.length === 0, `${page}: first paint pulls ai.js in via ${carriers.join(', ')}`);
  }
}

console.log(`check-ai-lazy — ${pass} passed, ${fail} failed (${pages.length} pages)`);
if (fail) process.exit(1);
