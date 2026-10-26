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
     - pricing.html: differs from the generator; its comparison table
       disagrees with src/data/plan-matrix.json (read here independently of
       the generator: a row missing, a row in no group, a cell that says
       what the matrix does not); the cards are not the paid plans in order;
       a price typed in the markup; an Education tab, a rating or a
       testimonial; the FAQ is not three <details> accordions of the real
       FAQ file; pricing.js reaches outside the light allowlist
     - a page is not registered: sitemap, gate exemption, both hosts'
       rewrites, the CSP's media-src, the icon font's subset
     - marketing.js imports something outside the light allowlist (the
       startlib rule: no store.js / cloud.js / gate.js on a public page)
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAll, validate, validatePricing, validateCompany, comparableRows, esc, PAGES_FILE, FIXTURE_FILE, PRICING_FILE, HOME_FILE, CONTACT_FILE, ABOUT_FILE } from './make-marketing-pages.mjs';

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

/* ---- pricing.html ---------------------------------------------------- */
{
  const tag = PRICING_FILE + ': ';
  const at = path.join(ROOT, PRICING_FILE);
  ok(validatePricing(inputs.compare, inputs.faq).length === 0, 'the pricing copy and the row grouping validate' + (validatePricing(inputs.compare, inputs.faq).length ? ': ' + validatePricing(inputs.compare, inputs.faq).join('; ') : ''));
  if (!fs.existsSync(at)) ok(false, tag + 'is not committed (run npm run make:marketing)');
  else {
    const html = fs.readFileSync(at, 'utf8');
    ok(html === files[PRICING_FILE], tag + 'committed HTML equals the generator output (run npm run make:marketing)');
    ok((html.match(/<h1[\s>]/g) || []).length === 1, tag + 'exactly one h1');
    ok(!/\sstyle="/.test(html) && !/\son[a-z]+="/i.test(html), tag + 'no inline style or handler (CSP)');
    ok(/<script type="module" src="\/src\/pages\/pricing\.js"><\/script>/.test(html), tag + 'loads pricing.js');
    ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), tag + 'no inline script');
    ok(!/\{\{(?!brand:|fms:)/.test(html), tag + 'no unknown {{ stamp');
    ok(/<link rel="canonical" href="https:\/\/{{brand:host}}\/pricing">/.test(html), tag + 'canonical is the {{brand:host}} stamp');
    ok(!html.includes('₹'), tag + 'no bare rupee sign: every price is a {{fms:price.*}} stamp');
    ok(!/\b(?:19|20)\d\d\b[^<]{0,12}(?:price|rise)/i.test(html.replace(/<!--[\s\S]*?-->/g, '')), tag + 'no date typed beside a price');
    const urls = [...html.matchAll(/\s(href|src|poster|action)="([^"]*)"/g)].map((m) => ({ attr: m[1], v: m[2] }));
    const bad = urls.filter(({ v }) => EXTERNAL.test(v) && !/^https:\/\/{{brand:host}}\//.test(v));
    ok(bad.length === 0, tag + 'no external host in href/src' + (bad.length ? ': ' + bad.map((b) => b.v).join(', ') : ''));
    ok(urls.filter(({ v }) => /^mailto:/.test(v)).every(({ v }) => v === 'mailto:{{brand:email}}'), tag + 'mailto is the {{brand:email}} stamp');
    ok(!/education|film school|student offer/i.test(html), tag + 'no Education tab or student card');
    ok(!/testimonial|\brated\b|★|&#9733;|\bstars?\b|trusted by|\bcustomers?\b/i.test(html), tag + 'no rating, testimonial or customer claim');
    ok(/<footer class="mk-foot"[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'footer links the three legal pages');
    ok(/<a class="mk-nav-link" href="pricing\.html" aria-current="page">/.test(html), tag + 'the header marks Pricing as the current page');
    for (const other of IDS) ok(new RegExp(`href="${pages[other].file.replace(/[.]/g, '\\.')}"`).test(html), `${tag}links to ${pages[other].file} (header and footer)`);

    /* the cards: the paid plans of plan-matrix.json, in order, and no free card */
    const matrix = JSON.parse(read('src/data/plan-matrix.json'));
    const PAID = Object.keys(matrix.plans).filter((id) => id !== 'free');
    const tiers = [...html.matchAll(/<li\b[^>]*\bdata-tier="([^"]*)"/g)].map((m) => m[1]);
    ok(tiers.join() === PAID.join(), tag + 'the cards are the paid plans in matrix order: ' + tiers.join(', '));
    ok((html.match(/<aside\b[^>]*\sdata-trial[\s>]/g) || []).length === 1, tag + 'exactly one free-trial strip, and it is not a card');
    for (const id of PAID) {
      ok(html.includes('{{fms:plan.' + id + '}}') && html.includes('{{fms:price.' + id + '}}') && html.includes('{{fms:tier.list.' + id + '}}'), `${tag}${id}: name, price and bullets are build-time stamps`);
      ok(new RegExp(`data-start-buy="${id}" data-plan="${id}"`).test(html) && html.includes(`href="purchase.html?plan=${id}"`), `${tag}${id}: the buy link carries the plan`);
    }
    ok(/id="offer"[^>]*\shidden/.test(html), tag + 'the price-rise band is in the markup and hidden until the server announces a rise');
    ok(/one payment/.test(html) && /a year/.test(html) && !/per month|\/mo\b|monthly|billed yearly|annually|auto-?renew(s|al)? on/i.test(html), tag + 'worded as sold: one payment for a year, nothing that reads as a recurring charge');
    /* §52: a plan is a year, marketed by the day. Every card prints its own
       per-day figure as a stamp, so the arithmetic is plans.js's, never typed. */
    for (const id of PAID) ok(html.includes('{{fms:price.' + id + '.day}}'), `${tag}${id}: the card prints its per-day cost as {{fms:price.${id}.day}}`);

    /* THE COMPARISON TABLE, read back out of the HTML and compared with the
       matrix JSON read here (not through the generator's own helpers). */
    const NAV = {};
    const navJson = JSON.parse(read('src/data/navigation.json'));
    for (const g of navJson.global || []) for (const m of g.modules || []) NAV[m.id] = m.label;
    for (const ph of navJson.phases || []) for (const m of ph.modules || []) NAV[m.id] = m.label;
    const ownLabel = (r) => r.label || NAV[r.key] || r.key;
    /* a group key given as an array is one table row for several matrix rows
       (they are the same feature to a buyer); each is shown under the first's label */
    const shownAs = new Map();
    let nShown = 0;
    for (const g of inputs.compare.groups) for (const e of g.keys) {
      const ks = Array.isArray(e) ? e : [e];
      nShown++;
      for (const k of ks) shownAs.set(k, ks[0]);
    }
    const labelOf = (r) => ownLabel(matrix.features.find((x) => x.key === (shownAs.get(r.key) || r.key)) || r);
    const wantRows = matrix.features.filter((r) => !r.inverted && PAID.some((p) => r.plans.includes(p)));
    const table = (html.match(/<table class="pr-table">[\s\S]*?<\/table>/) || [''])[0];
    ok(!!table, tag + 'has the comparison table');
    const headNames = [...(table.match(/<thead>[\s\S]*?<\/thead>/) || [''])[0].matchAll(/<span class="pr-th-name">([^<]*)<\/span>/g)].map((m) => m[1]);
    ok(headNames.join() === PAID.map((id) => '{{fms:plan.' + id + '}}').join(), tag + 'table columns are the paid plans in order: ' + headNames.join(', '));
    const got = [];
    for (const m of table.matchAll(/<tr><th scope="row">([^<]*)<\/th>((?:<td class="pr-(?:yes|no)">[\s\S]*?<\/td>)+)<\/tr>/g)) {
      got.push({ label: m[1].replace(/&amp;/g, '&'), cells: [...m[2].matchAll(/<td class="pr-(yes|no)">/g)].map((c) => c[1] === 'yes') });
    }
    ok(got.length === nShown && wantRows.every((r) => shownAs.has(r.key)), `${tag}the table has one row per feature a paid plan has (${got.length} of ${nShown}, from ${wantRows.length} matrix rows)`);
    const byLabel = new Map(got.map((g) => [g.label, g]));
    for (const r of wantRows) {
      const g = byLabel.get(labelOf(r));
      ok(!!g, `${tag}row "${labelOf(r)}" (${r.key}) is in the table`);
      if (g) ok(g.cells.join() === PAID.map((p) => r.plans.includes(p)).join(), `${tag}row "${labelOf(r)}": cells ${g.cells.map((c) => (c ? 'yes' : 'no')).join('/')} match the matrix`);
    }
    ok(new Set(got.map((g) => g.label)).size === got.length, tag + 'no row appears twice');
    ok(comparableRows().length === wantRows.length, tag + 'the generator and this test agree on which rows are sellable');
    const groupHeads = [...table.matchAll(/<tr class="pr-group"><th scope="colgroup" colspan="(\d+)">([^<]*)<\/th>/g)];
    ok(groupHeads.length === inputs.compare.groups.length && groupHeads.every((g) => Number(g[1]) === PAID.length + 1), tag + 'one heading per group, each spanning every column');
    ok(/\.pr-table thead th\s*\{[^}]*position:\s*sticky/.test(read('src/styles/pricing.css').replace(/\/\*[\s\S]*?\*\//g, '')), 'pricing.css: the table header is sticky');

    /* the FAQ: three accordions of the real FAQ file, single-open by name */
    const faq = JSON.parse(read('src/data/marketing-faq.json'));
    const acc = [...html.matchAll(/<details class="pr-acc" name="([^"]+)" id="faq-\d">/g)];
    ok(acc.length === 3 && new Set(acc.map((a) => a[1])).size === 1 && acc.length === faq.length, tag + 'FAQ is three <details name=...> accordions (single-open)');
    const nQ = (html.match(/<dt( data-trial)?>/g) || []).length;
    ok(nQ === faq.reduce((n, g) => n + g.items.length, 0) && (html.match(/<dd( data-trial)?>/g) || []).length === nQ, tag + 'every question in marketing-faq.json is in the markup, answered');
    ok(!/<details[^>]*\sopen[\s>]/.test(html), tag + 'the accordions start collapsed');

    /* icons the page draws are in the font subset */
    const icons = JSON.parse(read('src/data/section-icons.json')).icons;
    const nav = read('src/data/navigation.json');
    const drawn = new Set([...html.matchAll(/<span class="sym[^"]*" aria-hidden="true" translate="no">([a-z0-9_]+)<\/span>/g)].map((m) => m[1]));
    const missing = [...drawn].filter((nme) => !icons.includes(nme) && !nav.includes('"sym": "' + nme + '"') && !nav.includes('"sym":"' + nme + '"'));
    ok(missing.length === 0, tag + 'every icon is in the font subset' + (missing.length ? ': ' + missing.join(', ') : ''));
  }
  const pcss = read('src/styles/pricing.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(pcss) && !/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(pcss), 'pricing.css has no raw colour');
  ok(!/border-radius:\s*\d/.test(pcss), 'pricing.css types no literal radius');
  {
    const travels = [...pcss.matchAll(/transform:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => /translate/.test(v));
    ok(travels.every((v) => /var\(--motion\)/.test(v)), 'every translate in pricing.css is multiplied by --motion');
  }
  const pjs = read('src/pages/pricing.js');
  const pimports = [...pjs.matchAll(/^import\s+(?:[^'"]+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  const pallowed = [/^\.\/marketing\.js$/, /^\.\.\/styles\/pricing\.css$/, /^\.\.\/lib\/(funnel|start-auth|start-model|region-core|price-model)\.js$/];
  const pstray = pimports.filter((i) => !pallowed.some((a) => a.test(i)));
  ok(pstray.length === 0, 'pricing.js imports only the light allowlist (the startlib rule)' + (pstray.length ? ': ' + pstray.join(', ') : ''));
  ok(!/\bdocument\.write\b|\.innerHTML\s*=/.test(pjs), 'pricing.js builds no markup from strings');
}

/* ---- start.html (the home page) ------------------------------------- */
{
  const tag = HOME_FILE + ': ';
  const at = path.join(ROOT, HOME_FILE);
  const home = inputs.home;
  if (!fs.existsSync(at)) ok(false, tag + 'is not committed (run npm run make:marketing)');
  else {
    const html = fs.readFileSync(at, 'utf8');
    ok(html === files[HOME_FILE], tag + 'committed HTML equals the generator output (run npm run make:marketing)');
    ok((html.match(/<h1[\s>]/g) || []).length === 1, tag + 'exactly one h1');
    ok(!/\sstyle="/.test(html) && !/\son[a-z]+="/i.test(html), tag + 'no inline style or handler (CSP)');
    ok(/<script type="module" src="\/src\/pages\/start\.js"><\/script>/.test(html), tag + 'loads start.js');
    ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), tag + 'no inline script');
    ok(!/\{\{(?!brand:|fms:)/.test(html), tag + 'no unknown {{ stamp');
    ok(!html.includes('₹'), tag + 'no bare rupee sign');
    ok(/\{\{fms:dragon\./.test(html), tag + 'a sample figure is a stamp, not typed');
    ok(/<link rel="canonical" href="https:\/\/{{brand:host}}\/start">/.test(html), tag + 'canonical is the {{brand:host}} stamp');
    const urls = [...html.matchAll(/\s(href|src|poster|action)="([^"]*)"/g)].map((m) => ({ attr: m[1], v: m[2] }));
    const bad = urls.filter(({ v }) => EXTERNAL.test(v) && !/^https:\/\/{{brand:host}}\//.test(v));
    ok(bad.length === 0, tag + 'no external host in href/src/poster' + (bad.length ? ': ' + bad.map((b) => b.v).join(', ') : ''));
    ok(!/testimonial|\brated\b|★|trusted by|\bcustomers?\b|st-voice|id="voices"|inviteBand|leadForm/i.test(html), tag + 'no social proof, voices block, invite banner or e-mail offers form');
    /* five stages, media alternating; the fifth has no CTA and no video */
    const arts = [...html.matchAll(/<article class="st-stage[^"]*"[\s\S]*?<\/article>/g)].map((m) => m[0]);
    ok(arts.length === 5, tag + 'five stage rows');
    arts.forEach((a, i) => {
      ok(/st-stage--flip/.test(a) === (i % 2 === 1), `${tag}stage ${i + 1} puts its media ${i % 2 ? 'right' : 'left'}`);
      ok((i < 4) === /<video controls muted loop playsinline preload="none"/.test(a), `${tag}stage ${i + 1} ${i < 4 ? 'has' : 'has no'} demo video`);
      ok((i < 4) === /class="mk-link" href="product-/.test(a), `${tag}stage ${i + 1} ${i < 4 ? 'links to its product page' : 'has no CTA'}`);
    });
    const refs = [...html.matchAll(/(?:src|poster)="(\/marketing\/[^"]+)"/g)].map((m) => m[1]);
    if (!FIXTURE) for (const r of new Set(refs)) ok(fs.existsSync(path.join(ROOT, 'public', r)), `${tag}${r} exists under public/`);
    ok(/id="tools"/.test(html) && /id="start"/.test(html), tag + 'the #tools and #start anchors resolve');
    ok(/data-open-signup/.test(html) && /id="mkSignup"/.test(html), tag + 'Get started opens the sign-up modal');
    ok(/href="pricing\.html"/.test(html) && /<footer class="mk-foot"[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'links pricing and the three legal pages');
    ok(home.facts.length === 4 && (html.match(/class="st-fact-n"/g) || []).length === 4, tag + 'four facts');
    const icons = JSON.parse(read('src/data/section-icons.json')).icons;
    const nav = read('src/data/navigation.json');
    const drawn = new Set([...html.matchAll(/<span class="sym[^"]*" aria-hidden="true" translate="no">([a-z0-9_]+)<\/span>/g)].map((m) => m[1]));
    const missing = [...drawn].filter((nme) => !icons.includes(nme) && !nav.includes('"sym": "' + nme + '"') && !nav.includes('"sym":"' + nme + '"'));
    ok(missing.length === 0, tag + 'every icon is in the font subset' + (missing.length ? ': ' + missing.join(', ') : ''));
  }
  const scss = read('src/styles/start.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(scss) && !/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(scss), 'start.css has no raw colour');
  ok(!/border-radius:\s*\d/.test(scss), 'start.css types no literal radius');
  ok([...scss.matchAll(/transform:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => /translate/.test(v)).every((v) => /var\(--motion\)/.test(v)), 'every translate in start.css is multiplied by --motion');
  const sjs = read('src/pages/start.js');
  const simports = [...sjs.matchAll(/^import\s+(?:[^'"]+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  const sallowed = [/^\.\/marketing\.js$/, /^\.\.\/styles\/start\.css$/, /^\.\.\/lib\/(funnel|auth-scope|start-model|region-core|price-model)\.js$/];
  const sstray = simports.filter((i) => !sallowed.some((a) => a.test(i)));
  ok(sstray.length === 0, 'start.js imports only the light allowlist (the startlib rule)' + (sstray.length ? ': ' + sstray.join(', ') : ''));
  ok(!/\bdocument\.write\b|\.innerHTML\s*=/.test(sjs), 'start.js builds no markup from strings');
}

/* ---- contact.html and about.html (the company pages) ---------------- */
{
  ok(validateCompany(inputs.company).length === 0, 'the company copy validates' + (validateCompany(inputs.company).length ? ': ' + validateCompany(inputs.company).join('; ') : ''));
  const brandJson = JSON.parse(read('src/data/brand.json'));
  const personal = [brandJson.seller, brandJson.owner].filter((v) => typeof v === 'string' && v.trim());
  for (const file of [CONTACT_FILE, ABOUT_FILE]) {
    const tag = file + ': ';
    const at = path.join(ROOT, file);
    if (!fs.existsSync(at)) { ok(false, tag + 'is not committed (run npm run make:marketing)'); continue; }
    const html = fs.readFileSync(at, 'utf8');
    const slug = file.replace(/\.html$/, '');
    ok(html === files[file], tag + 'committed HTML equals the generator output (run npm run make:marketing)');
    ok((html.match(/<h1[\s>]/g) || []).length === 1, tag + 'exactly one h1');
    ok(!/\sstyle="/.test(html) && !/\son[a-z]+="/i.test(html), tag + 'no inline style or handler (CSP)');
    ok(/<script type="module" src="\/src\/pages\/company\.js"><\/script>/.test(html), tag + 'loads company.js');
    ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html), tag + 'no inline script');
    ok(!/\{\{(?!brand:)/.test(html), tag + 'no stamp other than {{brand:...}}');
    ok(!html.includes('₹'), tag + 'no bare rupee sign');
    ok(new RegExp(`<link rel="canonical" href="https://{{brand:host}}/${slug}">`).test(html), tag + 'canonical is the {{brand:host}} stamp');
    const urls = [...html.matchAll(/\s(href|src|poster|action)="([^"]*)"/g)].map((m) => ({ attr: m[1], v: m[2] }));
    const bad = urls.filter(({ v }) => EXTERNAL.test(v) && !/^https:\/\/{{brand:host}}\//.test(v));
    ok(bad.length === 0, tag + 'no external host in href/src' + (bad.length ? ': ' + bad.map((b) => b.v).join(', ') : ''));
    ok(urls.filter(({ v }) => /^mailto:/.test(v)).every(({ v }) => v === 'mailto:{{brand:email}}'), tag + 'mailto is the {{brand:email}} stamp');
    ok(!/testimonial|\brated\b|★|trusted by|\bcustomers?\b/i.test(html), tag + 'no rating, testimonial or customer claim');
    for (const p of personal) ok(!html.includes(p), tag + 'no personal name');
    /* the call to action: the landing page's door, and the plans */
    const trial = [...html.matchAll(/<a class="mk-btn mk-btn--primary mk-btn--lg" href="invite\.html" data-open-signup[^>]*>([^<]*)<\/a>/g)].map((m) => m[1]);
    ok(trial.length >= 1 && trial.every((t) => t === inputs.company.cta.start), tag + 'the primary CTA is "' + inputs.company.cta.start + '" through the sign-up door (invite.html, data-open-signup), as on start.html');
    ok(!/free trial/i.test(inputs.company.cta.start), tag + 'the primary CTA promises no trial (purchases off drops that promise, and a trial can be switched off)');
    ok(new RegExp(`<a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing\\.html">${inputs.company.cta.plans}</a>`).test(html), tag + 'the secondary CTA "' + inputs.company.cta.plans + '" goes to pricing.html');
    ok(/data-open-signup/.test(files[HOME_FILE]) && /href="invite\.html" data-open-signup/.test(files[HOME_FILE]), tag + 'start.html\'s CTA is the same door');
    ok(/id="mkSignup"/.test(html), tag + 'carries the sign-up modal the CTA opens');
    ok(/<footer class="mk-foot"[\s\S]*about\.html[\s\S]*contact\.html[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'footer links About, Contact and the three legal pages');
    const icons = JSON.parse(read('src/data/section-icons.json')).icons;
    const nav = read('src/data/navigation.json');
    const drawn = new Set([...html.matchAll(/<span class="sym[^"]*" aria-hidden="true" translate="no">([a-z0-9_]+)<\/span>/g)].map((m) => m[1]));
    const missing = [...drawn].filter((nme) => !icons.includes(nme) && !nav.includes('"sym": "' + nme + '"') && !nav.includes('"sym":"' + nme + '"'));
    ok(missing.length === 0, tag + 'every icon is in the font subset' + (missing.length ? ': ' + missing.join(', ') : ''));
  }
  {
    const html = files[CONTACT_FILE];
    const formTag = (html.match(/<form\b[^>]*>/) || [''])[0];
    ok(/\smethod="dialog"/.test(formTag) && !/\saction=/.test(formTag), 'contact.html: the form has no action and method="dialog", so it cannot submit to any server');
    ok(/\snovalidate/.test(formTag), 'contact.html: the form validates itself (novalidate, accessible messages)');
    for (const k of ['name', 'email', 'topic', 'message']) {
      ok(new RegExp(`<label class="co-label" for="co-${k}">`).test(html), `contact.html: ${k} has a label`);
      ok(new RegExp(`id="co-${k}"[^>]*aria-describedby="co-${k}-err`).test(html) && new RegExp(`<p class="co-err" id="co-${k}-err" hidden>`).test(html), `contact.html: ${k} is described by its error line`);
    }
    const opts = [...html.matchAll(/<option value="[^"]+"[^>]*>([^<]+)<\/option>/g)].map((m) => m[1].replace(/&amp;/g, '&'));
    ok(opts.join('|') === 'General|Billing & refunds|Bug report|Feature request|Press', 'contact.html: the topics are General / Billing & refunds / Bug report / Feature request / Press: ' + opts.join(', '));
    ok(/<span class="co-mail-v" id="coEmail" translate="no">{{brand:email}}<\/span>/.test(html), 'contact.html: the support address is printed as plain text from {{brand:email}}');
    ok(/href="refund\.html"/.test(html), 'contact.html: links the refund policy for refund requests');
    ok(/role="alert"/.test(html) && /role="status"/.test(html), 'contact.html: an alert summary and a status line');
    ok(html.includes(esc(inputs.company.contact.form.privacy)), 'contact.html: says in one line that nothing is sent to or stored on a server');
  }
  ok(/<p class="co-sign">&mdash; The {{brand:name}} team<\/p>/.test(files[ABOUT_FILE]), 'about.html: signed as the team');
  const ccss = read('src/styles/company.css').replace(/\/\*[\s\S]*?\*\//g, '');
  ok(!/#[0-9a-fA-F]{3,8}\b/.test(ccss) && !/\b(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(ccss), 'company.css has no raw colour');
  ok(!/border-radius:\s*\d/.test(ccss), 'company.css types no literal radius');
  ok([...ccss.matchAll(/transform:\s*([^;]+);/g)].map((m) => m[1]).filter((v) => /translate/.test(v)).every((v) => /var\(--motion\)/.test(v)), 'every translate in company.css is multiplied by --motion');
  const cjs = read('src/pages/company.js');
  const cimports = [...cjs.matchAll(/^import\s+(?:[^'"]+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  const callowed = [/^\.\/marketing\.js$/, /^\.\.\/styles\/company\.css$/, /^\.\.\/lib\/contact-model\.js$/];
  const cstray = cimports.filter((i) => !callowed.some((a) => a.test(i)));
  ok(cstray.length === 0, 'company.js imports only the light allowlist (the startlib rule)' + (cstray.length ? ': ' + cstray.join(', ') : ''));
  ok(!/\bdocument\.write\b|\.innerHTML\s*=|localStorage|sessionStorage|fetch\(/.test(cjs), 'company.js builds no markup from strings, stores nothing and fetches nothing');
  ok(!/^import/m.test(read('src/lib/contact-model.js')), 'contact-model.js imports nothing (pure)');
  /* The public pages' currency (docs/US-MARKET-PLAN.md): both helpers must
     stay import-free, or a public page drags the app in behind them. */
  for (const f of ['src/lib/price-model.js', 'src/lib/start-model.js']) ok(!/^\s*(import|export\s+[^;]*\bfrom\b)/m.test(read(f)), f + ' imports nothing (pure)');
  /* 404.html wears the frame too (header and footer, no contents list),
     and is not a paper surface: legal.css is dark and has no paper rules. */
  {
    const h = read('404.html');
    ok(/<header class="mk-top"/.test(h) && /<footer class="mk-foot"/.test(h), '404.html: carries the shared header and footer');
    ok(!/<html[^>]*data-surface="paper"/.test(h), '404.html: is not a paper surface');
    ok(/class="legal-page legal-page--solo"/.test(h), '404.html: one column, no contents list');
  }
  /* The legal pages: hand-written words, the site's frame stamped in (20 Oct 2026). */
  for (const f of ['privacy.html', 'terms.html', 'refund.html']) {
    const h = read(f);
    ok(/<header class="mk-top"/.test(h), f + ': carries the shared header');
    ok(/<footer class="mk-foot"[\s\S]*about\.html[\s\S]*contact\.html[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(h), f + ': the shared footer links About, Contact and the three legal pages');
    ok(!/<html[^>]*data-surface="paper"/.test(h), f + ': is not a paper surface any more');
    ok(/<html[^>]*\sdata-fms-marketing[\s>]/.test(h), f + ': carries data-fms-marketing, so the build injects the icon font the header\'s marks need');
    const main = (h.match(/<main\b[^>]*>([\s\S]*?)<\/main>/) || [])[1] || '';
    const ids = [...main.matchAll(/<h2\b[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
    const h2s = (main.match(/<h2\b/g) || []).length;
    const toc = (h.match(/<nav class="legal-toc"[\s\S]*?<\/nav>/) || [''])[0];
    const linked = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    ok(h2s > 0 && ids.length === h2s && JSON.stringify(ids) === JSON.stringify(linked), f + ': every heading has an id and the contents list links each, in order (' + ids.length + '/' + h2s + ')');
  }
  const ljs = read('src/pages/legal.js');
  const limports = [...ljs.matchAll(/^import\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  ok(JSON.stringify(limports) === JSON.stringify(['../styles/base.css', '../styles/marketing.css', '../styles/legal.css']) && !/^import\s.*from/m.test(ljs), 'legal.js imports the three stylesheets and nothing else: ' + limports.join(', '));
  ok(!/localStorage|sessionStorage|fetch\(/.test(ljs), 'legal.js stores nothing and fetches nothing');
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
  const allowed = [/^\.\.\/styles\/(base|marketing)\.css$/, /^\.\.\/lib\/(funnel|trial-time|invite-code|start-auth|visitor-region)\.js$/];   // visitor-region: import-free, public pages only
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
  for (const id of [...IDS.map((i) => 'product-' + i), 'pricing', 'contact', 'about']) {
    ok(gateRe.test('/' + id + '.html') && gateRe.test('/' + id), `${id} is exempt from the site gate (.html and clean)`);
    ok(vercel.rewrites.some((r) => r.source === '/' + id && r.destination === '/' + id + '.html'), `${id}: vercel rewrite`);
    ok(new RegExp(`from = "/${id}"\\s+to = "/${id}\\.html"\\s+status = 200`).test(netlify), `${id}: netlify rewrite`);
    ok(sitemap.includes(`<loc>https://${brandHost}/${id}</loc>`), `${id}: in sitemap.xml on the brand host`);
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.every((l) => l.startsWith('https://' + brandHost + '/')), 'every sitemap <loc> names the brand host');
}

/* ---- the price-rise date and the price today (start-model.js) -------
   Two audit bugs. The rise instant is 23:59 IST on its day; formatted in
   the reader's own zone it named the NEXT day east of India. And once the
   rise fires the build-stamped LIST_PRICE figures are stale while checkout
   charges effective_price(), so the page must take price_notice()'s
   current price_paise. Pure checks; the DOM half is asserted by reading
   pricing.js / start.js for the call. */
{
  const SM = await import(path.join(ROOT, 'src/lib/start-model.js'));
  const P = await import(path.join(ROOT, 'src/lib/plans.js'));
  const RISE_AT = '2026-10-31T18:29:00Z';
  const keepTZ = process.env.TZ;
  for (const tz of ['Asia/Singapore', 'Pacific/Auckland', 'America/Los_Angeles', 'Asia/Kolkata', 'UTC']) {
    process.env.TZ = tz;
    ok(SM.onDate(RISE_AT) === '31 October', `onDate names the IST day under TZ=${tz} (got ${SM.onDate(RISE_AT)})`);
  }
  process.env.TZ = 'Asia/Singapore';
  ok(new Date(RISE_AT).getDate() === 1, 'the Singapore case really is 1 November locally (the test exercises the bug)');
  const notice = { seats_total: 100, seats_taken: 1, plans: [
    { id: 'free', price_paise: 0 },
    { id: 'starter', price_paise: 59900, next_price_paise: 99900, next_price_at: RISE_AT },
    { id: 'indie', price_paise: 79900, next_price_paise: 149900, next_price_at: RISE_AT },
    { id: 'pro', price_paise: 99900, next_price_paise: 199900, next_price_at: RISE_AT }] };
  const band = SM.priceRiseBand(notice, Date.parse('2026-10-21T00:00:00Z'));
  ok(band && /until 31 October \(IST\)/.test(band.line) && !/November/.test(band.line), 'the band names 31 October (IST) in Singapore');
  ok(SM.risingTiers(notice).every((t) => / after 31 October \(IST\)$/.test(t.text)), 'each tier names 31 October (IST) in Singapore');
  if (keepTZ === undefined) delete process.env.TZ; else process.env.TZ = keepTZ;

  let agree = true;
  for (let r = 1; r <= 5000; r++) if (SM.perDayOf(r * 100) !== P.perDay(r)) { agree = false; break; }
  ok(agree, "start-model perDayOf(paise) agrees with plans.js perDay(rupees) for every whole rupee to 5000");
  ok(SM.PLAN_DAYS === P.PLAN_DAYS, 'one year is the same number of days in both');
  for (const id of ['starter', 'indie', 'pro']) ok(SM.inr(P.LIST_PRICE[id] * 100) === P.inr(P.LIST_PRICE[id]), `${id}: inr() matches the build stamp's format`);

  /* before the rise: the current prices ARE the stamp, so nothing moves */
  const before = SM.currentPrices(notice);
  ok(before.map((p) => p.id).join() === 'starter,indie,pro', 'currentPrices: the paid plans only, in order');
  ok(before.every((p) => p.price === P.inr(P.LIST_PRICE[p.id]) && p.day === P.perDay(P.LIST_PRICE[p.id])), 'before the rise the current figures equal the stamp');
  ok(SM.fromDayNow(notice) === P.perDay(599), 'before the rise the from-figure is the stamp');
  /* after the rise: price_notice() returns the new price_paise and no next_* */
  const fired = { plans: [
    { id: 'free', price_paise: 0, next_price_paise: null, next_price_at: null },
    { id: 'starter', price_paise: 99900, next_price_paise: null, next_price_at: null },
    { id: 'indie', price_paise: 149900, next_price_paise: null, next_price_at: null },
    { id: 'pro', price_paise: 199900, next_price_paise: null, next_price_at: null }] };
  ok(SM.priceRiseBand(fired, Date.now()) === null && SM.risingTiers(fired).length === 0, 'after the rise nothing is announced');
  const after = Object.fromEntries(SM.currentPrices(fired).map((p) => [p.id, p]));
  ok(after.starter.price === '₹999' && after.starter.day === '₹2.74', 'after the rise Basic reads ₹999, ₹2.74 a day');
  ok(after.indie.price === '₹1,499' && after.pro.price === '₹1,999', 'after the rise the other tiers read their new figure');
  ok(SM.fromDayNow(fired) === '₹2.74', 'after the rise the from-figure is the new cheapest');
  ok(SM.currentPrices({ plans: [{ id: 'starter', price_paise: null }, { id: 'pro', price_paise: '99900' }] }).length === 0, 'a missing or non-numeric price leaves the markup alone');
  ok(SM.currentPrices(null).length === 0 && SM.fromDayNow(null) === '', 'no notice: nothing');
  ok(SM.stampedFromDay('A year of the studio from about ₹1.64 a day, nothing') === '₹1.64', 'stampedFromDay reads "from about ₹X a day"');
  ok(SM.stampedFromDay('Pricing: a year of the studio from ₹1.64 a day') === '₹1.64', 'stampedFromDay reads "from ₹X a day"');
  ok(SM.swapFigure('from about ₹1.64 a day', '₹1.64', '₹2.74') === 'from about ₹2.74 a day', 'swapFigure rewrites the figure');
  ok(SM.swapFigure('₹1.645 and ₹1.64.', '₹1.64', '₹2.74') === '₹1.645 and ₹2.74.', 'swapFigure leaves a longer number alone');
  const pjs2 = read('src/pages/pricing.js');
  ok(/currentPrices\(notice\)/.test(pjs2) && /renderPricesNow\(notice\);\s*\/\/[^\n]*\n\s*if \(req === false\)/.test(pjs2), 'pricing.js rewrites the cards from the current price, before the purchases-off return');
  /* The table head and each card's per-day line carry price spans
     (priceSpans()), and pricing.js rewrites spans by what they are. */
  {
    const ph = read('pricing.html');
    ok(/<span class="pr-th-price"><span data-price="(starter|indie|pro)">/.test(ph) && /<span class="pr-keep">[^<]*<span data-price-day="(starter|indie|pro)">/.test(ph),
      'pricing.html wraps the table head\'s price and each per-day line in a price span');
    ok(/querySelectorAll\('\[data-price\]'\)/.test(pjs2) && /querySelectorAll\('\[data-price-day\]'\)/.test(pjs2), 'pricing.js corrects the table head and the per-day figure too (by span)');
  }
  ok(/priceNotice\(\)\.then[\s\S]*fromDayNow\(notice\)/.test(read('src/pages/start.js')), 'start.js corrects the hero\'s from-figure');
}

/* ---- one verb per action ------------------------------------------
   The header says Log in / Sign up; the modal it opens said "Sign in to
   start your trial", the pricing buttons swapped to "Sign in", and the
   plans CTA was "See the plans" on one page and "See plans" on two. The
   LABELS agree now (prose may still say "sign in" as a verb). */
for (const [file, html] of Object.entries(files)) {
  if (!/\.html$/.test(file)) continue;
  const labels = [...html.matchAll(/>\s*(Sign in[^<]*)</g)].map((m) => m[1].trim())
    .concat([...html.matchAll(/data-off-text="(Sign in[^"]*)"/g)].map((m) => m[1]));
  ok(labels.length === 0, file + ': no control or heading labelled "Sign in" [' + labels.join(' | ') + ']');
  ok(!/See the plans/.test(html), file + ': the plans CTA reads "See plans"');
}

console.log(`\ntest:marketing: ${pass} passed, ${fail} failed${FIXTURE ? ' (fixture copy; media existence NOT checked)' : ''}`);
process.exit(fail ? 1 : 0);
