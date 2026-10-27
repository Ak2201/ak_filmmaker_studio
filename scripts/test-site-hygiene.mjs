#!/usr/bin/env node
/* ============================================================
   SITE HYGIENE  —  npm run test:site   (27 Oct 2026)
   ------------------------------------------------------------
   Reads a BUILT site (PROVE_DIST, default dist-verify/) and fails on
   the tells of an unfinished website that a crawler, a link preview or
   a "view source" sees first: a page with no lang, an indexable page
   without a unique title, a description, a canonical, an og:image or
   exactly one h1; an empty studio shell left indexable; an <img>
   without alt; a published source map; a vercel.app URL; a missing
   robots.txt, sitemap.xml, llms.txt or favicon.ico; robots.txt shutting
   out search or AI crawlers; a sitemap URL whose page says noindex.

   No browser: the build's own files are the evidence. The words a
   page draws at run time are verify's business; this is the markup a
   crawler gets before any script runs.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.resolve(ROOT, process.env.PROVE_DIST || 'dist-verify');
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) pass++; else { fail++; console.log('  ✗ ' + msg); } };
if (!fs.existsSync(DIST)) { console.error('test:site: no build at ' + DIST + ' (run npm run build:verify)'); process.exit(1); }

const html = fs.readdirSync(DIST).filter((f) => f.endsWith('.html')).sort();
const read = (f) => fs.readFileSync(path.join(DIST, f), 'utf8');
const noindex = (s) => /<meta name="robots" content="[^"]*noindex/.test(s);
const titles = new Map();
let indexable = 0;

for (const f of html) {
  const s = read(f);
  ok(/<html[^>]*\blang="[a-z]{2}/.test(s), f + ': <html> has a lang attribute');
  for (const img of s.match(/<img\b[^>]*>/g) || []) ok(/\balt=/.test(img), f + ': <img> has alt: ' + img.slice(0, 80));
  ok(!s.includes('vercel.app'), f + ': names no vercel.app URL');
  if (s.includes('id="app"') && f !== 'index.html') ok(noindex(s), f + ': a studio shell (#app) is noindex');
  if (noindex(s)) continue;
  indexable++;
  const t = (s.match(/<title>([^<]*)<\/title>/) || [])[1] || '';
  ok(t.trim().length > 0, f + ': has a <title>');
  if (titles.has(t)) ok(false, f + ': title "' + t + '" is also ' + titles.get(t));
  titles.set(t, f);
  ok(/<meta name="description" content="[^"]{40,}"/.test(s), f + ': has a meta description');
  ok(/<link rel="canonical" href="https:\/\/[^"]+"/.test(s), f + ': has an absolute canonical');
  ok(/<meta property="og:image" content="https:\/\/[^"]+"/.test(s), f + ': has an absolute og:image');
  ok((s.match(/<h1[\s>]/g) || []).length === 1, f + ': exactly one <h1> in its markup');
  ok(/rel="icon"/.test(s) && /rel="apple-touch-icon"/.test(s), f + ': links an icon and an apple-touch-icon');
}
ok(indexable >= 30, 'the check read the indexable pages (' + indexable + ')');

const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]);
const maps = walk(DIST).filter((f) => f.endsWith('.map'));
ok(maps.length === 0, 'no source maps are published (' + maps.slice(0, 3).map((m) => path.relative(DIST, m)).join(', ') + ')');

for (const f of ['robots.txt', 'sitemap.xml', 'llms.txt', 'favicon.ico', '404.html']) ok(fs.existsSync(path.join(DIST, f)), f + ' is at the site root');
const robots = fs.existsSync(path.join(DIST, 'robots.txt')) ? read('robots.txt') : '';
ok(/^Sitemap: https:\/\/\S+\/sitemap\.xml$/m.test(robots), 'robots.txt names the sitemap');
/* Group by User-agent; a Disallow of the whole site for *, GPTBot or ClaudeBot fails. */
let agents = [], blocked = [];
for (const raw of robots.split('\n')) {
  const line = raw.replace(/#.*/, '').trim();
  const m = line.match(/^(User-agent|Disallow):\s*(.*)$/i);
  if (!m) continue;
  if (/^user-agent$/i.test(m[1])) agents.push(m[2].toLowerCase());
  else { if (m[2].trim() === '/') blocked.push(...agents); agents = []; }
}
for (const a of ['*', 'gptbot', 'claudebot']) ok(!blocked.includes(a), 'robots.txt does not shut out ' + a);

const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? read('sitemap.xml') : '';
const locs = [...sitemap.matchAll(/<loc>https:\/\/[^/]+\/([^<]*)<\/loc>/g)].map((m) => m[1]);
ok(locs.length >= 20, 'the sitemap lists the public pages (' + locs.length + ')');
for (const l of locs) {
  const f = (l.replace(/\/$/, '') || 'start') + '.html';
  if (!fs.existsSync(path.join(DIST, f))) { ok(false, 'sitemap URL /' + l + ' has no page'); continue; }
  ok(!noindex(read(f)), 'sitemap URL /' + l + ' is not noindex');
}
const llms = fs.existsSync(path.join(DIST, 'llms.txt')) ? read('llms.txt') : '';
ok(/^# \S/.test(llms) && !llms.includes('{{'), 'llms.txt starts with a title and carries no unstamped placeholder');

console.log((fail ? '✗' : '✓') + ' site hygiene: ' + pass + ' passed, ' + fail + ' failed (' + html.length + ' pages, ' + indexable + ' indexable)');
process.exit(fail ? 1 : 0);
