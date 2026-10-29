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
import { loadMatrixModule } from './make-plan-features-sql.mjs';
import { buildAll, validate, validatePricing, validateCompany, validateGuides, readRows, comparableRows, esc, PAGES_FILE, FIXTURE_FILE, PRICING_FILE, HOME_FILE, CONTACT_FILE, ABOUT_FILE, GUIDES_INDEX, TRUST_FILE } from './make-marketing-pages.mjs';

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

  /* the header's Product menu and the footer list every page. (28 Oct
     2026: the "tools for every stage" block that repeated the same list a
     third time left the product pages, so two links, not three.) */
  for (const other of IDS) {
    const count = (html.match(new RegExp(`href="${pages[other].file.replace(/[.]/g, '\\.')}"`, 'g')) || []).length;
    const inHead = new RegExp(`<header class="mk-top"[\\s\\S]*href="${pages[other].file.replace(/[.]/g, '\\.')}"[\\s\\S]*</header>`).test(html);
    const inFoot = new RegExp(`<footer class="mk-foot"[\\s\\S]*href="${pages[other].file.replace(/[.]/g, '\\.')}"[\\s\\S]*</footer>`).test(html);
    ok(count >= 2 && inHead && inFoot, `${tag}${pages[other].file} is linked from the header and the footer (${count})`);
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
    /* 26 Oct 2026: ONE students-and-schools band under the cards (the
       launch study's most-asked gap), never an Education tab and never a
       card in the plan list, and it prints no figure: the student price is
       a promo quoted at checkout, which a stamp would make stale. */
    ok(!/role="tab"[^>]*>[^<]*(education|student)/i.test(html) && !/data-tier="(edu|student|cohort)/.test(html), tag + 'no Education tab or student card');
    {
      const edu = (html.match(/<aside class="pr-edu"[\s\S]*?<\/aside>/) || [''])[0];
      ok(!!edu && !/\{\{fms:price|data-price/.test(edu), tag + 'the students band prints no price');
      /* A code is named only while marketing-site.json says the server has
         it (site.student.live); until then the band asks the reader to
         write to us and names no code at all. */
      const st = site.student || {};
      if (st.live === true) ok(edu.includes(esc(st.code)) && /href="purchase\.html\?plan=indie"/.test(edu), tag + 'student code live: the band names ' + st.code + ' and links the purchase page');
      else ok(!edu.includes(st.code || 'STUDENT50') && !/\bcode\b/i.test(edu.replace(/<[^>]+>/g, ' ')) && /href="contact\.html"/.test(edu), tag + 'no student code is live: the band names no code and links contact.html');
    }
    ok(!/testimonial|\brated\b|★|&#9733;|\bstars?\b|trusted by|\bcustomers?\b/i.test(html), tag + 'no rating, testimonial or customer claim');
    ok(/<footer class="mk-foot"[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'footer links the three legal pages');
    ok(/<a class="mk-nav-link mk-nav-pricing" href="pricing\.html" aria-current="page">/.test(html), tag + 'the header marks Pricing as the current page');
    leadContract(html, tag);
    ok(/href="trust\.html"/.test(html), tag + 'links the trust page');
    ok(/<aside class="pr-pass" data-pass data-pass-only hidden[\s\S]*?data-pass-cta[\s\S]*?<\/aside>/.test(html), tag + 'the pass strip is pass-only, hidden, and its button is the pass CTA');
    for (const other of IDS) ok(new RegExp(`href="${pages[other].file.replace(/[.]/g, '\\.')}"`).test(html), `${tag}links to ${pages[other].file} (header and footer)`);

    /* the cards: the paid plans of plan-matrix.json, in order, and no free card */
    const matrix = JSON.parse(read('src/data/plan-matrix.json'));
    const PAID = Object.keys(matrix.plans).filter((id) => id !== 'free');
    const tiers = [...html.matchAll(/<li\b[^>]*\bdata-tier="([^"]*)"/g)].map((m) => m[1]);
    ok(tiers.join() === PAID.join(), tag + 'the cards are the paid plans in matrix order: ' + tiers.join(', '));
    for (const id of PAID) {
      ok(html.includes('{{fms:plan.' + id + '}}') && html.includes('{{fms:price.' + id + '}}') && html.includes('{{fms:tier.list.' + id + '}}'), `${tag}${id}: name, price and bullets are build-time stamps`);
      ok(new RegExp(`data-start-buy="${id}" data-plan="${id}"`).test(html) && html.includes(`href="purchase.html?plan=${id}"`), `${tag}${id}: the buy link carries the plan`);
    }
    /* ONE "N more in the comparison" rule for pricing.html and purchase.html's cards: a limit row is a cap, never counted */
    { const M = await loadMatrixModule();
      for (const id of PAID) {
        const n = M.addedBy(id).filter((r) => r.kind !== 'limit').length;
        ok(M.cardMore(id) === (n <= 5 ? 0 : n - Math.min(((matrix.card && matrix.card[id]) || []).length || 4, 4)), `${tag}${id}: cardMore() counts the non-limit additions the card does not list`);
      }
      ok(/M\.cardMore\(id\)/.test(read('vite.config.js')), tag + 'the public cards take their "N more" from cardMore(), the same function the studio cards share'); }
    ok(/id="offer"[^>]*\shidden/.test(html), tag + 'the price-rise band is in the markup and hidden until the server announces a rise');
    /* a year, never a month; whether it renews is a runtime slot (OFFER TERMS below) */
    ok(/a year/.test(html) && !/per month|\/mo\b|monthly|billed yearly|annually|auto-?renew(s|al)? on/i.test(html), tag + 'worded as sold: a plan is a year, nothing that reads as a monthly charge');
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
    const nQ = (html.match(/<dt( data-pass-faq| data-mode-faq)?>/g) || []).length;
    ok(nQ === faq.reduce((n, g) => n + g.items.length, 0) && (html.match(/<dd( data-pass-faq| data-mode-faq)?>/g) || []).length === nQ, tag + 'every question in marketing-faq.json is in the markup, answered');
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
    /* THE HOME PAGE'S SHAPE (28 Oct 2026, the owner's template): a hero
       with ONE visible action and the product video, four stage cards,
       three points on keeping your work, a plans teaser that names the
       from-per-day figure as a stamp, and one closing action. (It was a
       hero, four facts, five alternating stage rows, an exports block and
       four answers; the layout assertions follow the new shape.) */
    const heroSec = (html.match(/<section class="mk-hero st-hero"[\s\S]*?<\/section>/) || [''])[0];
    ok(/<video controls muted loop playsinline preload="none"/.test(heroSec), tag + 'the hero shows the product video');
    ok((heroSec.match(/<a class="mk-btn[^"]*"(?![^>]*\shidden)[^>]*>/g) || []).length === 1, tag + 'the hero has one visible action (its pass twin is hidden)');
    const arts = [...html.matchAll(/<article class="mk-card st-stage[^"]*"[\s\S]*?<\/article>/g)].map((m) => m[0]);
    ok(arts.length === 4, tag + 'four stage cards');
    arts.forEach((a, i) => {
      const href = (a.match(/class="mk-link" href="(product-[a-z-]+)\.html"/) || [])[1];
      ok(!!href && a.includes(`src="/marketing/${href.replace(/^product-/, '')}.webp"`), `${tag}stage card ${i + 1} links its product page and shows that page's own poster (${href})`);
    });
    ok((html.match(/<li class="mk-point">/g) || []).length === 3, tag + 'three points on keeping your work');
    const plansSec = (html.match(/<section class="mk-sec[^"]*" id="plans"[\s\S]*?<\/section>/) || [''])[0];
    ok(/\{\{fms:price\.from\.day\}\}/.test(plansSec) && /href="pricing\.html"/.test(plansSec), tag + 'the plans teaser names the from-per-day stamp and links pricing.html');
    const refs = [...html.matchAll(/(?:src|poster)="(\/marketing\/[^"]+)"/g)].map((m) => m[1]);
    if (!FIXTURE) for (const r of new Set(refs)) ok(fs.existsSync(path.join(ROOT, 'public', r)), `${tag}${r} exists under public/`);
    ok(/id="tools"/.test(html) && /id="start"/.test(html), tag + 'the #tools and #start anchors resolve');
    ok(/data-open-signup/.test(html) && /id="mkSignup"/.test(html), tag + 'Get started opens the sign-up modal');
    ok(/href="pricing\.html"/.test(html) && /<footer class="mk-foot"[\s\S]*privacy\.html[\s\S]*terms\.html[\s\S]*refund\.html/.test(html), tag + 'links pricing and the three legal pages');
    leadContract(html, tag);
    ok(/href="trust\.html"/.test(html), tag + 'links the trust page');
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
  const sallowed = [/^\.\/(marketing|start-motion)\.js$/, /^\.\.\/styles\/start\.css$/, /^\.\.\/lib\/(funnel|auth-scope|start-model|region-core|price-model)\.js$/];
  const sstray = simports.filter((i) => !sallowed.some((a) => a.test(i)));
  ok(sstray.length === 0, 'start.js imports only the light allowlist (the startlib rule)' + (sstray.length ? ': ' + sstray.join(', ') : ''));
  ok(!/\bdocument\.write\b|\.innerHTML\s*=/.test(sjs), 'start.js builds no markup from strings');
  /* start-motion.js (29 Oct 2026, the landing scroll story): the motion
     package (motion/mini's animate, motion's scroll) and the import-free
     device-motion.js, nothing else; it stands down under webdriver and
     both reduced-motion switches, and restores its veils for print and
     on an 8s backstop. */
  const mjs = read('src/pages/start-motion.js');
  const mimports = [...mjs.matchAll(/^import\s+(?:[^'"]+from\s+)?'([^']+)';/gm)].map((m) => m[1]);
  const mstray = mimports.filter((i) => !/^(motion|motion\/mini|\.\.\/lib\/device-motion\.js)$/.test(i));
  ok(mstray.length === 0, 'start-motion.js imports only motion, motion/mini and device-motion.js' + (mstray.length ? ': ' + mstray.join(', ') : ''));
  ok(/navigator\.webdriver/.test(mjs) && /deviceReducedMotion\(\)/.test(mjs) && /prefers-reduced-motion: reduce/.test(mjs), 'start-motion.js stands down under webdriver, the device switch and prefers-reduced-motion');
  ok(/beforeprint/.test(mjs) && /setTimeout\(check, 8000\)/.test(mjs), 'start-motion.js restores its veils for print and on the 8s backstop');
  ok(!/\bdocument\.write\b|\.innerHTML\s*=/.test(mjs), 'start-motion.js builds no markup from strings');
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
    ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), tag + 'no inline script');
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
    /* Finalised 28 Oct 2026: a legal page never ships a passage awaiting
       approval (CLAUDE.md item 64: "never release to main with a DRAFT
       comment in a legal page"), and the date at the top is the date of
       the latest "What changed" note, so the two cannot disagree. */
    const draft = h.match(/.{0,40}(\bDRAFT\b|AWAITING THE OWNER|<li>\s*Draft,).{0,40}/);
    ok(!draft, f + ': no DRAFT passage or marker' + (draft ? ': "' + draft[0].trim() + '"' : ''));
    const upd = (main.match(/<p class="legal-date">Last updated (\d{1,2} [A-Z][a-z]+ \d{4})<\/p>/) || [])[1];
    const chg = (main.match(/<h2 id="changes-h">What changed on (\d{1,2} [A-Z][a-z]+ \d{4})<\/h2>/) || [])[1];
    ok(upd && upd === chg, f + ': "Last updated" (' + upd + ') is the date of the "What changed" note (' + chg + ')');
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
  const allowed = [/^\.\.\/styles\/(base|marketing)\.css$/, /^\.\.\/lib\/(funnel|trial-time|invite-code|start-auth|visitor-region|attribution|start-model|pass-offer|offer-terms|device-motion)\.js$/, /^motion\/mini$/];   // device-motion (28 Oct 2026): a read-only, import-free leaf, asserted below   // motion/mini (28 Oct 2026): the motion package's WAAPI animate() only, a leaf with no app code; prove:growth still asserts no studio-* chunk   // visitor-region, attribution, start-model: each import-free (startlib rule), public pages only
  const stray = imports.filter((i) => !allowed.some((a) => a.test(i)));
  ok(stray.length === 0, 'marketing.js imports only the light allowlist (the startlib rule)' + (stray.length ? ': ' + stray.join(', ') : ''));
  const dm = read('src/lib/device-motion.js');
  ok(!/^import\s/m.test(dm) && !/setItem|removeItem/.test(dm), 'device-motion.js imports nothing and never writes storage');
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
  const NEW = [...inputs.guides.guides.map((x) => x.file), GUIDES_INDEX, ...inputs.versus.pages.map((p) => p.file), TRUST_FILE].map((f) => f.replace(/\.html$/, ''));
  for (const [f, re] of [['src/lib/plan-gate.js', /^const WALL_EXEMPT = \/(.*)\/;$/m], ['src/lib/return-to.js', /^const NEVER = \/(.*)\/;$/m]]) {
    const rx = new RegExp((read(f).match(re) || [])[1] || '$^');
    for (const id of NEW) ok(rx.test(f.includes('return-to') ? id + '.html' : id), `${id}: exempt in ${f}`);
  }
  const MP = new RegExp((vite.match(/^const MARKETING_PAGE = \/(.*)\/;$/m) || [])[1] || '$^');
  for (const id of NEW) ok(MP.test(id + '.html') && vite.includes('|guides|guide-[a-z-]+|compare-[a-z-]+|trust)\\.html$/.test(f)'), `${id}: stamped (MARKETING_PAGE) and a rollup input (marketingInputs)`);
  for (const id of [...IDS.map((i) => 'product-' + i), 'pricing', 'contact', 'about', ...NEW]) {
    ok(gateRe.test('/' + id + '.html') && gateRe.test('/' + id), `${id} is exempt from the site gate (.html and clean)`);
    ok(vercel.rewrites.some((r) => r.source === '/' + id && r.destination === '/' + id + '.html'), `${id}: vercel rewrite`);
    ok(new RegExp(`from = "/${id}"\\s+to = "/${id}\\.html"\\s+status = 200`).test(netlify), `${id}: netlify rewrite`);
    ok(sitemap.includes(`<loc>https://${brandHost}/${id}</loc>`), `${id}: in sitemap.xml on the brand host`);
  }
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  ok(locs.every((l) => l.startsWith('https://' + brandHost + '/')), 'every sitemap <loc> names the brand host');
}

/* ---- the e-mail capture markup (start.html, pricing.html) ----------
   The contract src/pages/marketing.js binds (lane A, 26 Oct 2026). */
function leadContract(html, tag) {
  const form = (html.match(/<form\b[^>]*\bdata-lead-form\b[^>]*>[\s\S]*?<\/form>/) || [''])[0];
  ok(!!form, tag + 'has form[data-lead-form]');
  if (!form) return;
  const sec = (html.match(/<section\b[^>]*\bid="news"[^>]*>/) || [''])[0];
  ok(inputs.site.lead.live === true ? !/\shidden[\s>]/.test(sec) : /\shidden>/.test(sec),
    tag + 'the lead section is hidden until site.lead.live is true (privacy.html must describe the list first)');
  const open = form.match(/<form\b[^>]*>/)[0];
  ok(!/\saction=/.test(open) && /\smethod="dialog"/.test(open), tag + 'the lead form has no action and method="dialog" (submits nowhere with scripts off)');
  const email = (form.match(/<input\b[^>]*\bname="email"[^>]*>/) || [''])[0];
  ok(/type="email"/.test(email) && /\srequired[\s>]/.test(email), tag + 'input[type=email][name=email][required]');
  const id = (email.match(/\sid="([^"]+)"/) || [])[1];
  ok(!!id && new RegExp(`<label[^>]*for="${id}"`).test(form), tag + 'the e-mail input has a label');
  const consent = (form.match(/<label class="mk-lead-consent">[\s\S]*?<\/label>/) || [''])[0];
  ok(/<input type="checkbox" name="consent"/.test(consent) && !/\schecked/.test(consent), tag + 'a consent checkbox, not pre-ticked');
  ok(consent.includes(esc(inputs.site.lead.consent)) && /href="privacy\.html#leads"/.test(consent), tag + 'the consent sentence says it in words and links privacy.html#leads');
  ok(/<button\b[^>]*type="submit"/.test(form), tag + 'a submit button');
  ok(/<p\b[^>]*\bdata-lead-status\b[^>]*role="status"/.test(form), tag + 'p[data-lead-status][role=status]');
}
ok(/<h3 id="leads">/.test(read('privacy.html')), 'privacy.html: the leads paragraph carries id="leads" (the consent link lands on it)');
{
  /* The leads paragraph says what add_lead() keeps — the address, the
     consent sentence, the source word and the time — and how to leave.
     And the form sends the source as a BUCKET, never the raw slug. */
  const pv = read('privacy.html');
  const leads = (pv.match(/<h3 id="leads">[\s\S]*?(?=<h[23]\b)/) || [''])[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  ok(/e-mail address/.test(leads) && /consent sentence/.test(leads) && /source word|short word/.test(leads) && /the time/.test(leads), 'privacy.html#leads names the four things add_lead() stores');
  ok(/unsubscribe/i.test(leads) && /delete/.test(leads) && leads.includes('{{brand:email}}'), 'privacy.html#leads says how to unsubscribe and delete');
  ok((pv.match(/\sid="leads"/g) || []).length === 1, 'privacy.html: exactly one id="leads"');
  const mj = read('src/pages/marketing.js');
  ok(/sourceBucket\(attribution\(\)\.src\)/.test(mj), 'marketing.js: the lead\'s source is sourceBucket(), never the raw ?src= slug');
  ok(/bumpOnce\('landing_view'\)/.test(mj), 'marketing.js: a guide, switching guide, trust or product page counts a landing_view (once per tab)');
}

/* ---- the guides, the comparisons, the trust page (26 Oct 2026) ------- */
{
  const g = inputs.guides, v = inputs.versus;
  const vg = validateGuides(g, v);
  ok(vg.length === 0, 'the guide and comparison copy validates' + (vg.length ? ': ' + vg.join('; ') : ''));
  /* the CBFC and OTT guides cite only what the data files cite, on the date they say */
  const cbfc = JSON.parse(read('src/data/cbfc-rules.json'));
  const deliv = JSON.parse(read('src/data/deliverables.json'));
  const known = new Map();
  const add = (urls, d) => { for (const u of urls || []) if (!known.has(u)) known.set(u, d); };
  add(cbfc.ratingsSource.sourceUrls, cbfc.ratingsSource.checked);
  add(cbfc.guidelinesNote.sourceUrls, cbfc.guidelinesNote.checked);
  for (const r of cbfc.rules) add(r.sourceUrls, r.checked);
  for (const gr of deliv.groups) add(gr.sourceUrls, gr.checked);
  for (const x of g.guides.filter((y) => y.sources)) for (const s of x.sources) {
    ok(known.has(s.url) && known.get(s.url) === s.checked, `${x.file}: source ${s.url} is one cbfc-rules.json / deliverables.json cites, checked ${known.get(s.url)} (copy says ${s.checked})`);
  }
  const files = [...g.guides.map((x) => x.file), GUIDES_INDEX, ...v.pages.map((p) => p.file), TRUST_FILE];
  const icons = JSON.parse(read('src/data/section-icons.json')).icons;
  const nav = read('src/data/navigation.json');
  /* llms.txt is generated from the public pages' own titles and descriptions */
  ok(fs.existsSync(path.join(ROOT, 'public/llms.txt')) && fs.readFileSync(path.join(ROOT, 'public/llms.txt'), 'utf8') === built.files['public/llms.txt'], 'public/llms.txt equals the generator output (run npm run make:marketing)');
  for (const file of files) {
    const tag = file + ': ';
    const at = path.join(ROOT, file);
    if (!fs.existsSync(at)) { ok(false, tag + 'is not committed (run npm run make:marketing)'); continue; }
    const html = fs.readFileSync(at, 'utf8');
    const slug = file.replace(/\.html$/, '');
    ok(html === built.files[file], tag + 'committed HTML equals the generator output (run npm run make:marketing)');
    ok((html.match(/<h1[\s>]/g) || []).length === 1, tag + 'exactly one h1');
    ok(!/\sstyle="/.test(html) && !/\son[a-z]+="/i.test(html), tag + 'no inline style or handler (CSP)');
    ok(/<script type="module" src="\/src\/pages\/marketing\.js"><\/script>/.test(html), tag + 'loads marketing.js');
    ok(!/<script(?![^>]*\bsrc=)[^>]*>/.test(html.replace(/<script type="application\/ld\+json">[\s\S]*?<\/script>/g, '')), tag + 'no inline script');
    ok(!/\{\{(?!brand:|fms:)/.test(html), tag + 'no unknown {{ stamp');
    ok(!html.includes('₹'), tag + 'no bare rupee sign');
    ok(new RegExp(`<link rel="canonical" href="https://{{brand:host}}/${slug}">`).test(html), tag + 'canonical is the {{brand:host}} stamp');
    for (const k of ['og:title', 'og:description', 'og:image', 'og:image:alt']) ok(new RegExp(`<meta property="${k}" content="[^"]+">`).test(html), tag + k);
    ok(/<meta name="twitter:card" content="summary_large_image">/.test(html) && /<meta name="description" content="[^"]{60,}">/.test(html), tag + 'twitter card and a meta description');
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const parsed = lds.map((t) => { try { return JSON.parse(t); } catch (e) { return null; } });
    ok(parsed.length > 0 && parsed.every(Boolean), tag + 'every JSON-LD block parses');
    const types = parsed.filter(Boolean).map((o) => o['@type']);
    ok(types.includes('SoftwareApplication') && types.includes('BreadcrumbList'), tag + 'SoftwareApplication and BreadcrumbList JSON-LD: ' + types.join(', '));
    ok(!lds.some((t) => /"offers"|"price"/.test(t)), tag + 'no offers or price in the JSON-LD (a build-time price goes stale at the server-held price rise)');
    if (file.startsWith('guide-')) ok(types.includes('Article') || types.includes('HowTo'), tag + 'Article or HowTo JSON-LD');
    /* the closing door: the launch pass (pass-only, hidden, its price a
       runtime slot) and the plans, which are true when no pass runs */
    ok(/<a class="mk-btn mk-btn--primary mk-btn--lg" href="invite\.html" data-open-signup data-pass-only hidden><span>Try the whole studio for <span data-pass-price><\/span><\/span><\/a>/.test(html), tag + 'the pass CTA goes to invite.html, is pass-only and hidden, and names the price as a runtime slot');
    ok(/<a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing\.html">/.test(html), tag + 'a plans CTA that stands when no pass runs');
    ok(!/testimonial|\brated\b|★|trusted by|\bcustomers?\b|users love/i.test(html), tag + 'no rating, testimonial or customer claim');
    ok(/<footer class="mk-foot"[\s\S]*trust\.html[\s\S]*guides\.html[\s\S]*privacy\.html/.test(html), tag + 'footer links trust, guides and the legal pages');
    /* external links: only the cited sources (guides) and the comparison's source cells */
    const anchors = [...html.matchAll(/<a\b[^>]*\shref="(https?:\/\/[^"]+)"[^>]*>/g)].filter((m) => !/^https:\/\/{{brand:host}}\//.test(m[1]));
    const guide = g.guides.find((x) => x.file === file);
    const page = v.pages.find((p) => p.file === file);
    const allowed = new Set([...((guide && guide.sources) || []).map((s) => esc(s.url)), ...((page && page.rows) || []).map((r) => esc(r.source))]);
    ok(anchors.every((m) => allowed.has(m[1])), tag + 'external links are cited sources only (' + anchors.length + ')');
    ok(anchors.every((m) => /rel="noopener noreferrer"/.test(m[0])), tag + 'every external link carries rel="noopener noreferrer"');
    const drawn = new Set([...html.matchAll(/<span class="sym[^"]*" aria-hidden="true" translate="no">([a-z0-9_]+)<\/span>/g)].map((m) => m[1]));
    const missing = [...drawn].filter((nme) => !icons.includes(nme) && !nav.includes('"sym": "' + nme + '"') && !nav.includes('"sym":"' + nme + '"'));
    ok(missing.length === 0, tag + 'every icon is in the font subset' + (missing.length ? ': ' + missing.join(', ') : ''));
  }
  /* THE SWITCHING GUIDES (compare-*.html). A competitor fact reaches a
     page only once a person has read it on the vendor's own page
     (status "read"), and then with its source link and the day it was
     read beside it. An unread row's words never render. */
  for (const p of v.pages) {
    const html = read(p.file);
    const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
    const shown = readRows(p);
    for (const r of p.rows) {
      if (r.status === 'read') continue;
      ok(!html.includes(esc(r.them)) && !html.includes(`href="${esc(r.source)}"`), p.file + ': the unread row "' + r.feature + '" does not render (neither its words nor its source)');
    }
    const body = (html.match(/<tbody>[\s\S]*?<\/tbody>/) || [''])[0];
    ok((body.match(/<tr>/g) || []).length === shown.length, p.file + ': one table row per read fact (' + shown.length + ')');
    for (const r of shown) {
      const row = body.split('</tr>').find((t) => t.includes(esc(r.them))) || '';
      ok(row.includes(`href="${esc(r.source)}"`) && row.includes(`<time datetime="${r.checked}">`), p.file + ': the read row "' + r.feature + '" links its source and says the day it was read');
    }
    if (shown.length) ok(/href="mailto:{{brand:email}}"/.test(body + html), p.file + ': says how to report a change');
    if (!shown.length) ok(!/side by side|compared with/i.test(text), p.file + ': no comparison wording while no competitor fact is read');
    ok(new RegExp('<h1 class="mk-h1" id="mkH1">' + esc(p.h1) + '</h1>').test(html) && /^Switching from /.test(p.h1) && /^Switching from /.test(p.label), p.file + ': the h1 and label say "Switching from ' + p.name + '"');
    ok(html.includes(esc(v.ui.trademark)), p.file + ': carries the trademark note');
    const lds = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => JSON.parse(m[1]));
    const how = lds.find((o) => o['@type'] === 'HowTo');
    ok(!!how && how.name === p.h1.replace(/\{\{brand:name\}\}/g, '{{brand:name}}') && Array.isArray(how.step) && how.step.length >= 3, p.file + ': HowTo JSON-LD named for the switching guide, with its steps');
    ok(!lds.some((o) => JSON.stringify(o).includes('side by side')), p.file + ': no "side by side" left in the JSON-LD');
  }
  {
    const ix = read(GUIDES_INDEX);
    for (const p of v.pages) ok(ix.includes(`<h3 class="mk-h3">${esc(p.label)}</h3>`), GUIDES_INDEX + ': lists "' + p.label + '"');
    ok(ix.includes(`<h2 class="mk-h2" id="mkCmpH">${esc(g.index.compareH)}</h2>`) && !/^Compare$/.test(g.index.compareH), GUIDES_INDEX + ': the section is about switching, not comparing');
  }
  for (const x of g.guides) {
    const html = read(x.file);
    ok(/id="studio"/.test(html), x.file + ': has the "In the studio" block');
    if (x.studio.plan) ok(html.includes('{{fms:plan.' + x.studio.plan + '}}'), x.file + ': names the plan as a stamp');
  }
  /* every public page's header and footer reach the new pages */
  for (const f of [HOME_FILE, PRICING_FILE, ABOUT_FILE, CONTACT_FILE, 'privacy.html', ...IDS.map((i) => pages[i].file)]) {
    const h = read(f);
    /* 28 Oct 2026: the bar holds Product, Pricing, Sign in and Get
       started; Guides and Switching are the Product menu's Learn column. */
    const head = (h.match(/<header class="mk-top"[\s\S]*?<\/header>/) || [''])[0];
    ok(/<a href="guides\.html"[^>]*>/.test(head) && new RegExp('<a href="guides\\.html#compare"[^>]*>[^]*?<span>' + esc(site.ui.compare) + '</span></a>').test(head) && site.ui.compare === 'Switching', f + ': the header\'s Product menu has Guides and Switching');
    ok(/<footer class="mk-foot"[\s\S]*href="trust\.html"/.test(h), f + ': the footer links the trust page');
    if (f !== 'privacy.html') ok(/<meta property="og:image:alt" content="[^"]+">/.test(h), f + ': og:image:alt');
  }
  for (const id of IDS) {
    const h = read(pages[id].file);
    ok(/"@type":"SoftwareApplication"/.test(h) && /"@type":"BreadcrumbList"/.test(h) && ![...h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].some((m) => /"offers"|"price"/.test(m[1])), pages[id].file + ': SoftwareApplication + BreadcrumbList JSON-LD, no build-time price in it');
  }
}

/* ---- THE LAUNCH PASS (27 Oct 2026) -----------------------------------
   The free trial is retired for the public; the pages offer the launch
   pass, and every figure in it (price, length, deadline, count) is the
   server's, filled at runtime from trial_offer().pass. These checks read
   the committed markup and the copy:
     - no price, length, date or count is typed anywhere a pass is named:
       every pass element's slots are EMPTY in the markup, and the pass
       copy in the JSON holds only the {price} / {length} tokens
     - the band is on every page that should carry it, exactly once, and
       hidden in the markup, with no countdown text in it
     - no "free trial" anywhere in public copy, except the FAQ's question
       "Is there a free trial?", whose answer starts "No"
     - "whole studio" appears only inside a pass element ([data-pass-only]
       or the band): it is the pass's scope, and with no pass it is no
       promise anybody keeps
     - pricing.html has exactly one pass strip, hidden in the markup
     - every [data-pass-only] has a [data-pass-off] fallback or stands
       alone as an extra (a button beside one that stays) */
{
  const g = inputs.guides, v = inputs.versus;
  const extra = [...g.guides.map((x) => x.file), GUIDES_INDEX, ...v.pages.map((p) => p.file), TRUST_FILE];
  const BAND_PAGES = [HOME_FILE, PRICING_FILE, ...IDS.map((i) => pages[i].file), ...extra];
  const PUBLIC = [...BAND_PAGES, ABOUT_FILE, CONTACT_FILE];
  const JSONS = ['src/data/marketing-site.json', 'src/data/marketing-home.json', 'src/data/marketing-faq.json', 'src/data/marketing-guides.json',
    'src/data/pricing-compare.json', 'src/data/marketing-compare.json', 'src/data/marketing-pages.json', 'src/data/marketing-company.json'];
  const noComments = (h) => h.replace(/<!--[\s\S]*?-->/g, '');
  /* the outer HTML of every element carrying `attr`, nesting-aware */
  const elementsWith = (html, attr) => {
    const out = [];
    const re = new RegExp('<([a-z][a-z0-9]*)\\b[^>]*\\s' + attr + '(?=[\\s>=])[^>]*>', 'g');
    let m;
    while ((m = re.exec(html))) {
      const tag = m[1];
      const tre = new RegExp('<(/?)' + tag + '\\b[^>]*>', 'g');
      tre.lastIndex = m.index;
      let depth = 0, end = -1, t;
      while ((t = tre.exec(html))) { depth += t[1] ? -1 : 1; if (depth === 0) { end = tre.lastIndex; break; } }
      out.push(html.slice(m.index, end < 0 ? html.length : end));
    }
    return out;
  };
  const text = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&middot;/g, '·').replace(/\s+/g, ' ').trim();
  let nPass = 0, nBand = 0;
  for (const f of PUBLIC) {
    const html = noComments(read(f));
    /* every slot is empty in the markup */
    const slots = [...html.matchAll(/<span data-pass-(price|length|timer|left|spoken)\b[^>]*>([^<]*)<\/span>/g)];
    ok(slots.every((m) => m[2] === ''), f + ': every pass slot is empty in the markup' + (slots.some((m) => m[2]) ? ': ' + slots.filter((m) => m[2]).map((m) => m[1] + '=' + m[2]).join(', ') : ''));
    /* no figure inside anything that names the pass */
    const passEls = [...elementsWith(html, 'data-pass-only'), ...elementsWith(html, 'data-pass-band'), ...elementsWith(html, 'data-pass')];
    for (const el of passEls) {
      nPass++;
      const t = text(el.replace(/\sdata-[a-z-]+="[^"]*"/g, ''));
      ok(!/\d|₹|\$|\{\{fms:/.test(t), f + ': a pass element types a figure, a price stamp or a date: "' + t.slice(0, 120) + '"');
    }
    /* [data-pass-only] is hidden in the markup, every one */
    const shown = [...html.matchAll(/<[a-z][a-z0-9]*\b[^>]*\sdata-pass-only\b[^>]*>/g)].filter((m) => !/\shidden[\s>]/.test(m[0]));
    ok(shown.length === 0, f + ': every [data-pass-only] is hidden in the markup' + (shown.length ? ': ' + shown.map((m) => m[0]).join(' ') : ''));
    /* no free trial in public copy, but for the FAQ question that says there is none */
    const plain = text(html.replace(/<script\b[\s\S]*?<\/script>/g, '').replace(/<head>[\s\S]*?<\/head>/, ''));
    const free = plain.replace(/Is there a free trial\? No\b/g, '').replace(/Is there a free trial\?/g, '');
    ok(!/free trial/i.test(free), f + ': no "free trial" in public copy (the pass replaced it)');
    for (const m of html.matchAll(/<(dt|h3)\b[^>]*>Is there a free trial\?<\/\1>\s*<(dd|p)\b[^>]*>\s*(<span data-pass-off>)?([^<]*)/g)) ok(/^No\b/.test(m[4]), f + ': "Is there a free trial?" is answered "No": ' + m[4].slice(0, 40));
    ok(!/data-trial/.test(html), f + ': no [data-trial*] slot is left');
    /* "whole studio" only inside a pass element */
    const outside = passEls.reduce((h, el) => h.split(el).join(''), html);
    ok(!/whole studio/i.test(text(outside.replace(/<head>[\s\S]*?<\/head>/, ''))), f + ': "the whole studio" is said only inside a pass element');
    /* the timer is never static */
    ok(!/\b\d+d \d\d:\d\d:\d\d\b|\b\d\d:\d\d:\d\d\b/.test(plain), f + ': no countdown in the static page');
    /* the band */
    const bands = elementsWith(html, 'data-pass-band');
    if (BAND_PAGES.includes(f)) {
      nBand++;
      ok(bands.length === 1, f + ': carries the launch band exactly once');
      const b = bands[0] || '';
      ok(/^<aside class="mk-pass" id="mkPass" data-pass-band hidden aria-label="[^"]+">/.test(b), f + ': the band is hidden in the markup');
      ok(/data-pass-timer aria-hidden="true"/.test(b) && /data-pass-spoken/.test(b) && !/aria-live/.test(b), f + ': the ticking digits are aria-hidden, a minute-level label carries them, and nothing ticks into a live region');
      ok(/<a class="mk-btn[^"]*" href="invite\.html" data-open-signup data-pass-cta><span>[^<]*<span data-pass-price><\/span><\/span><\/a>/.test(b), f + ': the band\'s button goes to the offer page (invite.html) and names the server\'s price');
      ok(new RegExp('<main id="main"[^>]*>\\s*<aside class="mk-pass"').test(html), f + ': the band is the first thing in <main>');
    } else ok(bands.length === 0, f + ': no launch band on this page');
  }
  ok(nPass >= PUBLIC.length * 2 && nBand === BAND_PAGES.length, `read ${nPass} pass elements on ${PUBLIC.length} public pages, the band on ${nBand}`);
  /* the copy: tokens only, never a figure */
  for (const f of JSONS) {
    const raw = JSON.parse(read(f));
    const walk = (o, at) => {
      if (typeof o === 'string') {
        if (/\{(price|length)\}|\b(pass|launch offer)\b/i.test(o) && !/^_/.test(at.split('.').pop())) {
          ok(!/\d|₹|\$/.test(o.replace(/\{\{fms:[a-z.]+\}\}/g, '')), f + ' ' + at + ': pass copy types no figure: "' + o.slice(0, 80) + '"');
        }
        ok(!/free trial/i.test(o) || /^Is there a free trial\?$/.test(o) || /^_/.test(at.split('.').pop()), f + ' ' + at + ': no "free trial" in the copy');
        return;
      }
      if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) walk(x, at + '.' + k);
    };
    walk(raw, '');
  }
  /* ---- OFFER TERMS (27 Oct 2026) -------------------------------------
     Whether a purchase renews is the console's choice (schema §62), so the
     static page and the marketing JSON never say it either way. Renewal
     wording lives only in
       - [data-offer-terms] slots (EMPTY in the markup; marketing.js fills
         them through src/lib/offer-terms.js from trial_offer()),
       - [data-mode-answer="once"|"renew"] lines (HIDDEN in the markup,
         shown by mode) and the FAQ question that has them, and
       - a competitor's sourced cell ([data-them]).
     Their sources in the JSON are the keys aOnce / aRenew / aRenewNote /
     renewNote and a comparison row's `them`. */
  {
    const CLAIM = /\brenew|auto-?pay|subscription|one payment|nothing renews|charged automatically/i;
    const CLAIM_KEYS = new Set(['aOnce', 'aRenew', 'aRenewNote', 'renewNote', 'them']);
    const OT = await import(path.join(ROOT, 'src/lib/offer-terms.js'));
    let nSlots = 0, nAnswers = 0;
    for (const f of [...PUBLIC, 'index.html']) {
      const html = noComments(read(f));
      const exempt = [...elementsWith(html, 'data-mode-answer'), ...elementsWith(html, 'data-offer-terms'), ...elementsWith(html, 'data-them'),
        ...[...html.matchAll(/<dt data-mode-faq>[^<]*<\/dt>/g)].map((m) => m[0])];
      const rest = exempt.reduce((h, el) => h.split(el).join(''), html).replace(/\sdata-[a-z-]+(="[^"]*")?/g, '');
      const hit = rest.match(new RegExp('.{0,60}(' + CLAIM.source + ').{0,60}', 'i'));
      ok(!hit, f + ': no renewal claim outside the offer-terms slots and mode answers' + (hit ? ': "' + hit[0].trim() + '"' : ''));
      ok(!/\{(planTerms|passTerms|planRenewNote)\}/.test(html), f + ': every offer-terms token became a slot');
      const slots = [...html.matchAll(/<span data-offer-terms data-offer-product="(year|pass)"(?: data-offer-form="chip")?>([^<]*)<\/span>/g)];
      nSlots += slots.length;
      ok(slots.length === (html.match(/data-offer-terms/g) || []).length && slots.every((m) => m[2] === ''), f + ': every [data-offer-terms] slot is empty in the markup (the static page claims no mode)');
      const tags = [...html.matchAll(/<[a-z]+\b[^>]*\sdata-mode-answer="([a-z]+)"[^>]*>/g)];
      nAnswers += tags.length;
      ok(tags.every((m) => ['neutral', 'once', 'renew'].includes(m[1]) && (m[1] === 'neutral' ? !/\shidden[\s>]/.test(m[0]) : /\shidden[\s>]/.test(m[0]))), f + ': a once / renew line is hidden in the markup, a neutral one is shown');
      ok(!/<span class="[^"]*" data-offer-wrap(?! hidden)/.test(html), f + ': every terms chip is hidden until it has words');
    }
    ok(nSlots >= PUBLIC.length, `read ${nSlots} offer-terms slots and ${nAnswers} mode lines`);
    /* the copy: renewal words only in the keys that feed those slots */
    for (const f of JSONS) {
      const walk = (o, at, parent) => {
        if (typeof o === 'string') {
          const k = at.split('.').pop();
          if (/^_/.test(k) || CLAIM_KEYS.has(k) || (k === 'q' && parent && parent.modes)) return;
          ok(!CLAIM.test(o), f + ' ' + at + ': no renewal claim in static copy (use {planTerms} / {passTerms}, or a mode answer): "' + o.slice(0, 90) + '"');
          return;
        }
        if (o && typeof o === 'object') for (const [k, x] of Object.entries(o)) walk(x, at + '.' + k, o);
      };
      walk(JSON.parse(read(f)), '', null);
    }
    /* the FAQ: "Is it a subscription?" carries all three answers, two hidden */
    {
      const ph = noComments(read(PRICING_FILE));
      const m = ph.match(/<dt data-mode-faq>Is it a subscription\?<\/dt>\s*<dd data-mode-faq>([\s\S]*?)<\/dd>/);
      ok(m && /data-mode-answer="neutral"(?![^>]*hidden)/.test(m[1]) && /data-mode-answer="once"[^>]*hidden/.test(m[1]) && /data-mode-answer="renew"[^>]*hidden/.test(m[1]),
        PRICING_FILE + ': "Is it a subscription?" has a shown neutral answer and both mode answers, hidden');
      const fq = JSON.parse(read('src/data/marketing-faq.json')).flatMap((g) => g.items).find((i) => i.modes);
      ok(fq && /cancel anytime/i.test(fq.aRenew) && !CLAIM.test(fq.a), 'marketing-faq.json: the renew answer says "cancel anytime", the neutral one claims no mode');
    }
    /* offer-terms.js: every renew string says "cancel anytime", once says it does not renew, unknown says neither */
    for (const [price, period, days] of [['₹99', 'pass', 7], ['', 'pass', 7], ['₹599', 'year'], ['', 'year'], ['₹49', 'pass', 1]]) {
      const rn = OT.offerTerms('renew', price, period, days), on = OT.offerTerms('once', price, period, days);
      const un = [OT.offerTerms(undefined, price, period, days), OT.offerTerms('monthly', price, period, days), OT.offerTerms(null, price, period, days)];
      const tag = `offerTerms(${period}${days ? ' ' + days : ''}${price ? ' ' + price : ''}): `;
      ok(/cancel anytime/i.test(rn.line) && /cancel anytime/i.test(rn.short) && rn.renews === true, tag + 'renew says "cancel anytime" in the line and the chip');
      ok(/nothing renews/i.test(on.line) && /nothing renews/i.test(on.short) && on.renews === false, tag + 'once says nothing renews');
      ok(un.every((u) => u.short === '' && u.renews === null && !CLAIM.test(u.line)), tag + 'an unknown mode claims neither');
    }
    const mj = read('src/pages/marketing.js');
    ok(/from '\.\.\/lib\/offer-terms\.js'/.test(mj) && /t\.plan_mode/.test(mj) && /raw\.mode/.test(mj) && /offerSlots\.take\(t\)/.test(mj), 'marketing.js fills the slots through offer-terms.js from trial_offer() plan_mode and pass.mode');
  }

  /* exactly one pass strip on pricing.html, never a card */
  {
    const ph = noComments(read(PRICING_FILE));
    ok((ph.match(/<aside\b[^>]*\sdata-pass[\s>]/g) || []).length === 1, PRICING_FILE + ': exactly one pass strip, and it is not a card');
    ok(/<aside class="pr-pass" data-pass data-pass-only hidden /.test(ph), PRICING_FILE + ': the pass strip is hidden in the markup');
    ok(!/<li\b[^>]*\bdata-tier="pass"/.test(ph), PRICING_FILE + ': the pass is never drawn as a tier');
  }
  /* marketing.js binds it from the server, with the pure model */
  {
    const mj = read('src/pages/marketing.js');
    ok(/from '\.\.\/lib\/pass-offer\.js'/.test(mj) && /passState\(raw, Date\.now\(\), readAt\)/.test(mj), 'marketing.js reads the pass through pass-offer.js passState, on the server clock (readAt)');
    ok(/t\.pass/.test(mj) && /trialOffer\(\)\.then/.test(mj), 'marketing.js takes the pass from trial_offer()');
    ok(/setInterval\(apply, 1000\)/.test(mj) && /\[data-pass-ended\]/.test(mj), 'marketing.js ticks every second and says the offer ended at zero');
    ok(!/Date\.parse\(['"]\d{4}|new Date\(['"]\d{4}/.test(mj), 'marketing.js holds no deadline of its own');
  }
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
   The studio says "Sign in" everywhere, so the public header and modal do
   too ("Sign up" stays: it is a different act). No control labelled "Log in",
   and the phone menu puts Pricing straight after it (order, not DOM). */
for (const [file, html] of Object.entries(files)) {
  if (!/\.html$/.test(file)) continue;
  const labels = [...html.matchAll(/>\s*(Log in[^<]*)</g)].map((m) => m[1].trim())
    .concat([...html.matchAll(/data-off-text="(Log in[^"]*)"/g)].map((m) => m[1]));
  ok(labels.length === 0, file + ': no control or heading labelled "Log in" [' + labels.join(' | ') + ']');
  ok(!/See the plans/.test(html), file + ': the plans CTA reads "See plans"');
}
ok(/\.mk-nav-login \{[^}]*order: -2/.test(read('src/styles/marketing.css')) && /\.mk-nav-pricing \{ order: -1/.test(read('src/styles/marketing.css')), 'marketing.css: the phone menu orders Sign in, then Pricing, above the product groups');
ok(/class="mk-nav-link mk-nav-pricing" href="pricing\.html"/.test(files[PRICING_FILE]), 'the header marks the Pricing link for the phone order');

console.log(`\ntest:marketing: ${pass} passed, ${fail} failed${FIXTURE ? ' (fixture copy; media existence NOT checked)' : ''}`);
process.exit(fail ? 1 : 0);
