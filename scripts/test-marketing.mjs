#!/usr/bin/env node
/* ============================================================
   TEST — the public marketing pages (product-*.html)
   ------------------------------------------------------------
       npm run test:marketing                 real copy (src/data/marketing-pages.json)
       node scripts/test-marketing.mjs --fixture   fixture copy

   No browser. Fails when:
     - the copy file is missing (a real run never falls back silently)
     - a committed page differs from the generator's output
     - a /marketing/* reference does not exist under public/ (the media
       existence check is SKIPPED under --fixture, and says so: the media
       is made on another branch and lands at merge)
     - a page's step count, the stills in its slot and the stills on disk
       disagree
     - a related id is unknown, repeated, or the page itself
     - an href/src/poster names an external host (mailto is fine, and so
       is the canonical link, which must be the {{brand:host}} stamp)
     - marketing.css holds a raw colour, or a page has an inline style or
       handler
     - a page has other than one h1, or does not link to pricing.html
     - a page is not registered: sitemap, gate exemption, both hosts'
       rewrites, the CSP's media-src, the icon font's subset
     - marketing.js imports something outside the light allowlist (the
       startlib rule: no store.js / cloud.js / gate.js on a public page)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, validate, PAGES_FILE, FIXTURE_FILE } from './make-marketing-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FIXTURE = process.argv.includes('--fixture') || process.env.MARKETING_FIXTURE === '1';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ✗ ' + m); } };

/* ---- the copy, and the generator's own validation ----------------- */
let built;
try { built = buildAll({ fixture: FIXTURE }); } catch (e) {
  console.log('  ✗ ' + e.message);
  console.log(`\ntest:marketing: FAILED before any page was read (copy: ${FIXTURE ? FIXTURE_FILE : PAGES_FILE})`);
  process.exit(1);
}
const { files, inputs } = built;
const { site, pages } = inputs;
const IDS = Object.keys(site.stepCounts);
console.log(`copy: ${inputs.pagesRel}${FIXTURE ? '  (FIXTURE: the media existence check is skipped)' : ''}`);
ok(validate(inputs).length === 0, 'the copy validates');
ok(IDS.length === 11, 'eleven product pages');

const brand = JSON.parse(read('src/data/brand.json'));
const brandHost = String(brand.host);

/* ---- per page ------------------------------------------------------ */
const EXTERNAL = /^(?:[a-z][a-z0-9+.-]*:)?\/\//i;
for (const id of IDS) {
  const file = pages[id].file;
  const at = path.join(ROOT, file);
  const tag = `${file}: `;
  if (!fs.existsSync(at)) { ok(false, tag + 'is not committed (run npm run make:marketing)'); continue; }
  const html = fs.readFileSync(at, 'utf8');
  ok(html === files[file], tag + 'committed HTML equals the generator output (run npm run make:marketing)');

  ok((html.match(/<h1[\s>]/g) || []).length === 1, tag + 'exactly one h1');
  ok(/href="pricing\.html"/.test(html), tag + 'links to pricing.html');
  ok(!/\sstyle="/.test(html) && !/\son[a-z]+="/i.test(html), tag + 'no inline style or handler (CSP)');
  ok(/<script type="module" src="\/src\/pages\/marketing\.js"><\/script>/.test(html), tag + 'loads marketing.js');
  ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), tag + 'no inline script');
  ok(!/\{\{(?!brand:|fms:)/.test(html), tag + 'no unknown {{ stamp');
  ok(/<link rel="canonical" href="https:\/\/{{brand:host}}\//.test(html), tag + 'canonical is the {{brand:host}} stamp');

  /* no external host in any URL attribute (the canonical link is the stamp above) */
  const urls = [...html.matchAll(/\s(href|src|poster|action)="([^"]*)"/g)].map((m) => ({ attr: m[1], v: m[2] }));
  const bad = urls.filter(({ v }) => EXTERNAL.test(v) && !/^https:\/\/{{brand:host}}\//.test(v));
  ok(bad.length === 0, tag + 'no external host in href/src/poster' + (bad.length ? ': ' + bad.map((b) => b.v).join(', ') : ''));
  ok(urls.filter(({ v }) => /^mailto:/.test(v)).every(({ v }) => v === 'mailto:{{brand:email}}'), tag + 'mailto is the {{brand:email}} stamp');

  /* steps == stills in the slot == stills referenced == stills on disk */
  const n = site.stepCounts[id];
  const tabs = (html.match(/class="mk-step"/g) || []).length;
  const slot = (html.match(/class="mk-still(?: is-on)?"/g) || []).length;
  ok(tabs === n && slot === n && pages[id].steps.length === n, `${tag}${n} steps, ${tabs} step buttons, ${slot} stills in the slot`);
  const refs = [...html.matchAll(/(?:src|poster)="(\/marketing\/[^"]+)"/g)].map((m) => m[1]);
  for (let i = 1; i <= n; i++) ok(refs.includes(`/marketing/${id}-${i}.webp`), `${tag}references the still for step ${i}`);
  ok(refs.includes(`/marketing/${id}.webp`) && /<source src="\/marketing\/[^"]+\.webm" type="video\/webm">/.test(html), tag + 'references the poster and the demo loop');
  ok(/<video controls muted loop playsinline preload="none"/.test(html), tag + 'video is muted, playsinline, preload=none, with controls');
  const vsrc = [...html.matchAll(/<source src="(\/marketing\/[^"]+)"/g)].map((m) => m[1]);
  refs.push(...vsrc);
  if (!FIXTURE) {
    for (const r of new Set(refs)) ok(fs.existsSync(path.join(ROOT, 'public', r)), `${tag}${r} exists under public/`);
    ok(!fs.existsSync(path.join(ROOT, 'public', 'marketing', `${id}-${n + 1}.webp`)), `${tag}no still on disk beyond step ${n}`);
  }

  /* related: three distinct other pages, and the cards link to them */
  const rel = (html.match(/<section class="mk-sec[^"]*" id="related"[\s\S]*?<\/section>/) || [''])[0];
  const relLinks = [...rel.matchAll(/class="mk-link" href="([^"]+)"/g)].map((m) => m[1]);
  const want = pages[id].related.map((r) => pages[r].file);
  ok(relLinks.length === 3 && new Set(relLinks).size === 3 && relLinks.join() === want.join(), tag + 'three distinct related cards: ' + relLinks.join(', '));
  ok(!relLinks.includes(file), tag + 'related does not list itself');
  ok(relLinks.every((l) => IDS.some((x) => pages[x].file === l)), tag + 'every related link is a product page');

  /* the header and the footer list every page, the tools block too */
  for (const other of IDS) {
    const count = (html.match(new RegExp(`href="${pages[other].file.replace(/[.]/g, '\\.')}"`, 'g')) || []).length;
    ok(count >= 3, `${tag}${pages[other].file} is linked from the header, the stage block and the footer (${count})`);
  }
  ok(/<footer class="mk-foot"[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'footer links the three legal pages');

  /* icons: every mark the page draws is in the font subset */
  const icons = JSON.parse(read('src/data/section-icons.json')).icons;
  const nav = read('src/data/navigation.json');
  const drawn = new Set([...html.matchAll(/<span class="sym[^"]*" aria-hidden="true" translate="no">([a-z0-9_]+)<\/span>/g)].map((m) => m[1]));
  const missing = [...drawn].filter((nme) => !icons.includes(nme) && !nav.includes('"sym": "' + nme + '"') && !nav.includes('"sym":"' + nme + '"'));
  ok(missing.length === 0, tag + 'every icon is in the font subset' + (missing.length ? ': ' + missing.join(', ') : ''));
}

/* ---- the stylesheet and the script --------------------------------- */
const css = read('src/styles/marketing.css');
const cssNoComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/#[0-9a-fA-F]{3,8}\b/.test(cssNoComments) && !/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(cssNoComments), 'marketing.css has no raw colour');
ok(!/border-radius:\s*\d/.test(cssNoComments), 'marketing.css types no literal radius');
{
  /* every transform that travels is multiplied by --motion (a rotate or none is not a distance) */
  const travels = [...cssNoComments.matchAll(/transform:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => /translate/.test(v));
  ok(travels.every((v) => /var\(--motion\)/.test(v)), 'every translate in marketing.css is multiplied by --motion' + (travels.some((v) => !/var\(--motion\)/.test(v)) ? ': ' + travels.filter((v) => !/var\(--motion\)/.test(v)).join(' | ') : ''));
}
{
  const js = read('src/pages/marketing.js');
  const imports = [...js.matchAll(/^import\s+(?:[^'"]+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  const allowed = [/^\.\.\/styles\/(base|marketing)\.css$/, /^\.\.\/lib\/(funnel|trial-time|invite-code|start-auth)\.js$/];
  const stray = imports.filter((i) => !allowed.some((a) => a.test(i)));
  ok(stray.length === 0, 'marketing.js imports only the light allowlist (the startlib rule)' + (stray.length ? ': ' + stray.join(', ') : ''));
  ok(!/\bdocument\.write\b|\.innerHTML\s*=/.test(js), 'marketing.js builds no markup from strings');
}

/* ---- registration ---------------------------------------------------- */
{
  const sitemap = read('public/sitemap.xml');
  const sitegate = read('src/lib/sitegate.js');
  const gateRe = new RegExp((sitegate.match(/^const EXEMPT = \/(.*)\/;$/m) || [])[1] || '$^');
  const vercel = JSON.parse(read('vercel.json'));
  const netlify = read('netlify.toml');
  const vite = read('vite.config.js');
  const csp = (vercel.headers.flatMap((h) => h.headers).find((h) => h.key === 'Content-Security-Policy') || {}).value || '';
  ok(/media-src 'self'/.test(csp), "vercel.json CSP has media-src 'self'");
  ok(/media-src 'self'/.test(netlify), "netlify.toml CSP has media-src 'self'");
  ok(vercel.headers.some((h) => h.source === '/marketing/(.*)'), 'vercel.json caches /marketing/* for long');
  ok(/for = "\/marketing\/\*"/.test(netlify), 'netlify.toml caches /marketing/* for long');
  ok(/globIgnores: \[[^\]]*'marketing\/\*\*'/.test(vite), 'the service worker does not precache /marketing/* (video size)');
  ok(/marketingInputs\(\)/.test(vite) && /fms-marketing-figures|marketingFigures\(\)/.test(vite), 'vite.config.js discovers the pages and stamps their figures');
  for (const id of [...IDS.map((i) => 'product-' + i), 'pricing']) {
    ok(gateRe.test('/' + id + '.html') && gateRe.test('/' + id), `${id} is exempt from the site gate (.html and clean)`);
    ok(vercel.rewrites.some((r) => r.source === '/' + id && r.destination === '/' + id + '.html'), `${id}: vercel rewrite`);
    ok(new RegExp(`from = "/${id}"\\s+to = "/${id}\\.html"\\s+status = 200`).test(netlify), `${id}: netlify rewrite`);
    ok(sitemap.includes(`<loc>https://${brandHost}/${id}</loc>`), `${id}: in sitemap.xml on the brand host`);
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.every((l) => l.startsWith('https://' + brandHost + '/')), 'every sitemap <loc> names the brand host');
}

console.log(`\ntest:marketing: ${pass} passed, ${fail} failed${FIXTURE ? ' (fixture copy; media existence NOT checked)' : ''}`);
process.exit(fail ? 1 : 0);
