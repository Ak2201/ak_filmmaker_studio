#!/usr/bin/env node
/* ============================================================
   MAKE MARKETING PAGES — writes the eleven product-*.html files
   ------------------------------------------------------------
       npm run make:marketing                (real copy)
       node scripts/make-marketing-pages.mjs --fixture   (fixture copy)
       node scripts/make-marketing-pages.mjs --check     (diff only, writes nothing)

   Inputs
     src/data/marketing-site.json   the shared structure and copy: stages,
                                    the tool list, the header, the footer,
                                    the sign-up modal, the step counts
     src/data/marketing-pages.json  the per-page copy, keyed by page id.
                                    REQUIRED for a real run. A missing file
                                    is an error, never a silent skip.
     scripts/fixtures/marketing-pages.fixture.json
                                    stand-in copy with the exact step
                                    counts, chosen by --fixture or by
                                    MARKETING_FIXTURE=1, for testing the
                                    template before the copy exists.

   Output: product-<id>.html at the repo root, COMMITTED, so the words are
   in the markup (a crawler, a link preview and a reader with scripts off
   get the whole page), like start.html. The product name, host and
   support address are never typed here: the markup carries
   {{brand:...}} stamps (the fms-brand plugin fills them) and the page's
   figures may carry {{fms:...}} stamps (vite.config.js marketingFigures).

   The page is a template, so the same list drives the header's mega-menu,
   the footer columns, the "tools for every stage" block and the related
   cards: nothing here is a hand-written copy of that list.

   Exported for scripts/test-marketing.mjs: loadInputs, validate,
   renderPage, buildAll.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_FILE = 'src/data/marketing-site.json';
export const PAGES_FILE = 'src/data/marketing-pages.json';
export const FIXTURE_FILE = 'scripts/fixtures/marketing-pages.fixture.json';
export const MEDIA_BASE = '/marketing/';

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Escape text for an HTML text node or a double-quoted attribute. */
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Material Symbols mark. Always aria-hidden: the label beside it is the name. */
const sym = (name, cls = '') => `<span class="sym${cls ? ' ' + cls : ''}" aria-hidden="true" translate="no">${esc(name)}</span>`;

export function loadInputs({ fixture = false } = {}) {
  const site = readJson(SITE_FILE);
  const pagesRel = fixture ? FIXTURE_FILE : PAGES_FILE;
  if (!fs.existsSync(path.join(ROOT, pagesRel))) {
    throw new Error(pagesRel + ' is missing. The marketing pages are generated from it and there is no silent fallback.'
      + (fixture ? '' : ' (Use --fixture to generate from ' + FIXTURE_FILE + ' while the copy is being written.)'));
  }
  return { site, pages: readJson(pagesRel), fixture, pagesRel };
}

/** Every structural rule the template relies on. Returns a list of problems. */
export function validate({ site, pages }) {
  const bad = [];
  const ids = Object.keys(site.stepCounts);
  const staged = site.stages.flatMap((s) => s.pages);
  if ([...staged].sort().join() !== [...ids].sort().join()) bad.push('stages[].pages and stepCounts name different pages');
  if (Object.keys(site.tools).sort().join() !== [...ids].sort().join()) bad.push('tools and stepCounts name different pages');
  for (const s of site.stages) if (!/^hue-(library|feature|plan|shoot)$/.test(s.hue)) bad.push('stage ' + s.id + ': hue ' + s.hue + ' is not an existing hue class');
  if (Object.keys(pages).filter((k) => !k.startsWith('_')).sort().join() !== [...ids].sort().join()) {
    bad.push('the copy file keys [' + Object.keys(pages).filter((k) => !k.startsWith('_')).sort() + '] are not the page ids [' + [...ids].sort() + ']');
  }
  const stageOf = Object.fromEntries(site.stages.flatMap((s) => s.pages.map((p) => [p, s.id])));
  for (const id of ids) {
    const p = pages[id];
    if (!p) continue;
    const w = (m) => bad.push(id + ': ' + m);
    if (p.file !== 'product-' + id + '.html') w('file must be product-' + id + '.html, got ' + p.file);
    if (p.stage !== stageOf[id]) w('stage ' + p.stage + ' but marketing-site.json puts it in ' + stageOf[id]);
    for (const k of ['label', 'metaTitle', 'metaDescription']) if (!p[k] || typeof p[k] !== 'string') w('missing ' + k);
    if (!p.hero || !p.hero.h1 || !p.hero.sub) w('hero needs h1 and sub');
    if (!p.value || !p.value.h2 || !Array.isArray(p.value.body) || !p.value.body.length) w('value needs h2 and a body array');
    if (!p.demo || !p.demo.h2) w('demo.h2 missing');
    if (!Array.isArray(p.steps) || p.steps.length !== site.stepCounts[id]) w('needs exactly ' + site.stepCounts[id] + ' steps, has ' + (p.steps && p.steps.length));
    else p.steps.forEach((s, i) => { if (!s.title || !s.body) w('step ' + (i + 1) + ' needs title and body'); });
    if (!Array.isArray(p.related) || p.related.length !== 3 || new Set(p.related).size !== 3) w('related must be three distinct ids');
    else for (const r of p.related) { if (!ids.includes(r)) w('related id ' + r + ' is not a page'); if (r === id) w('related lists itself'); }
    if (!p.midCta || !p.midCta.h2) w('midCta.h2 missing');
    if (!Array.isArray(p.facts) || p.facts.length !== 3) w('facts must be exactly three');
    else p.facts.forEach((f, i) => { if (!f.value || !f.label) w('fact ' + (i + 1) + ' needs value and label'); });
  }
  return bad;
}

/* ---- the shared pieces ---------------------------------------------- */

const navOrder = (site) => site.stages.map((s) => ({ ...s, ids: s.pages }));

function toolLink(site, pages, id, current, cls = '') {
  const cur = current === id ? ' aria-current="page"' : '';
  return `<a${cls ? ` class="${cls}"` : ''} href="${esc(pages[id].file)}"${cur}>${sym(site.tools[id].icon)}<span>${esc(pages[id].label)}</span></a>`;
}

function header(site, pages, current) {
  const u = site.ui;
  const groups = navOrder(site).map((s) => `
          <div class="mk-mega-col ${s.hue}">
            <p class="mk-mega-h">${esc(s.label)}</p>
            <ul>
${s.ids.map((id) => `              <li>${toolLink(site, pages, id, current)}</li>`).join('\n')}
            </ul>
          </div>`).join('');
  return `<a class="mk-skip" href="#main">${esc(u.skip)}</a>
<div class="mk-sentinel" id="mkSentinel" aria-hidden="true"></div>
<header class="mk-top" id="mkTop">
  <div class="mk-top-in">
    <a class="mk-brand" href="start.html"><span class="mk-logo" aria-hidden="true">&#9654;</span>{{brand:name}}</a>
    <nav class="mk-nav" id="mkNav" aria-label="${esc(u.mainNav)}">
      <div class="mk-nav-item">
        <a class="mk-nav-link mk-nav-prod" id="mkProd" href="#tools" aria-haspopup="true" aria-expanded="false" aria-controls="mkMega"><span>${esc(u.product)}</span>${sym('expand_more')}</a>
        <div class="mk-mega" id="mkMega" role="group" aria-label="${esc(u.productNav)}">${groups}
        </div>
      </div>
      <a class="mk-nav-link" href="pricing.html">${esc(u.pricing)}</a>
      <a class="mk-nav-link mk-nav-login" href="invite.html" data-start-auth="google">${esc(u.login)}</a>
    </nav>
    <div class="mk-top-end">
      <a class="mk-nav-link mk-end-login" href="invite.html" data-start-auth="google">${esc(u.login)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--sm" href="invite.html" data-open-signup>${esc(u.signup)}</a>
      <a class="mk-burger" id="mkBurger" href="#mkFoot" aria-controls="mkNav" aria-expanded="false" aria-label="${esc(u.menu)}">${sym('menu')}</a>
    </div>
  </div>
</header>`;
}

function footer(site, pages) {
  const f = site.footer;
  const cols = navOrder(site).map((s) => `
      <div class="mk-foot-col ${s.hue}">
        <p class="mk-foot-h">${esc(s.label)}</p>
        <ul>
${s.ids.map((id) => `          <li><a href="${esc(pages[id].file)}">${esc(pages[id].label)}</a></li>`).join('\n')}
        </ul>
      </div>`).join('');
  return `<footer class="mk-foot" id="mkFoot">
  <div class="mk-wrap">
    <div class="mk-foot-grid">${cols}
      <div class="mk-foot-col">
        <p class="mk-foot-h">${esc(f.legalHeading)}</p>
        <ul>
          <li><a href="pricing.html">${esc(f.pricing)}</a></li>
          <li><a href="privacy.html">${esc(f.privacy)}</a></li>
          <li><a href="terms.html">${esc(f.terms)}</a></li>
          <li><a href="refund.html">${esc(f.refund)}</a></li>
          <li><a href="mailto:{{brand:email}}">${esc(f.support)}</a></li>
        </ul>
      </div>
    </div>
    <div class="mk-foot-base">
      <p class="mk-foot-note">${esc(f.note)}</p>
      <p class="mk-foot-copy">${f.copyright}</p>
    </div>
  </div>
</footer>`;
}

function modal(site) {
  const s = site.signup;
  const terms = esc(s.terms)
    .replace('{terms}', `<a href="terms.html">${esc(s.termsLabel)}</a>`)
    .replace('{privacy}', `<a href="privacy.html">${esc(s.privacyLabel)}</a>`);
  return `<div class="mk-modal" id="mkSignup" role="dialog" aria-modal="true" aria-labelledby="mkSignupTitle" hidden>
  <div class="mk-modal-scrim" data-close></div>
  <div class="mk-modal-card" tabindex="-1">
    <button class="mk-modal-x" type="button" data-close aria-label="${esc(s.close)}">${sym('close')}</button>
    <h2 class="mk-modal-h" id="mkSignupTitle">${esc(s.heading)}</h2>
    <p class="mk-modal-offer" id="mkOffer" data-off-text="${esc(s.offerOff)}" data-open-text="${esc(s.offerIn)}">${s.offer}</p>
    <a class="mk-btn mk-btn--primary mk-btn--block" id="mkGoogle" href="invite.html" data-start-auth="google" data-open-text="${esc(s.googleIn)}">${esc(s.google)}</a>
    <p class="mk-msg" id="mkMsg" role="status"></p>
    <p class="mk-modal-terms">${terms}</p>
    <p class="mk-modal-have">${esc(s.have)} <a href="invite.html" data-start-auth="google" data-open-text="${esc(s.googleIn)}">${esc(s.haveLink)}</a></p>
  </div>
</div>`;
}

/* ---- one page -------------------------------------------------------- */

export function renderPage(id, { site, pages }) {
  const p = pages[id];
  const u = site.ui;
  const stage = site.stages.find((s) => s.id === p.stage);
  const media = (name) => MEDIA_BASE + name;
  const still = (n) => media(id + '-' + n + '.webp');

  const hero = `<section class="mk-hero ${stage.hue}" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in">
    <p class="mk-eyebrow">${esc(stage.label)}</p>
    <h1 class="mk-h1" id="mkH1">${esc(p.hero.h1)}</h1>
    <p class="mk-sub">${esc(p.hero.sub)}</p>
    <div class="mk-cta-row">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(u.getStarted)}</a>
      <a class="mk-btn mk-btn--ghost mk-btn--lg" href="#demo">${sym('play_circle')}<span>${esc(u.watch)}</span></a>
    </div>
  </div>
</section>`;

  const labelBar = `<div class="mk-label ${stage.hue}">
  <div class="mk-wrap mk-label-in">
    <p class="mk-label-path">${sym(site.tools[id].icon)}<span>${esc(stage.label)}</span><span class="mk-label-sep" aria-hidden="true">/</span><strong>${esc(p.label)}</strong></p>
    <nav class="mk-label-nav" aria-label="${esc(u.labelNav)}">
      <a href="#demo">${esc(u.labelDemo)}</a>
      <a href="#how">${esc(u.labelHow)}</a>
      <a href="pricing.html">${esc(u.pricing)}</a>
    </nav>
  </div>
</div>`;

  const value = `<section class="mk-sec mk-band-b" id="value" aria-labelledby="mkValueH">
  <div class="mk-wrap mk-split">
    <div class="mk-split-text">
      <h2 class="mk-h2" id="mkValueH">${esc(p.value.h2)}</h2>
${p.value.body.map((t) => `      <p class="mk-body">${esc(t)}</p>`).join('\n')}
    </div>
    <figure class="mk-frame">
      <img src="${still(1)}" width="1280" height="720" alt="${esc(p.steps[0].title)}" loading="lazy" decoding="async">
    </figure>
  </div>
</section>`;

  const demo = `<section class="mk-sec mk-band-a" id="demo" aria-labelledby="mkDemoH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkDemoH">${esc(p.demo.h2)}</h2>
    <div class="mk-player">
      <video controls muted loop playsinline preload="none" width="1280" height="720" poster="${media(id + '.webp')}">
        <source src="${media(id + '.webm')}" type="video/webm">
        ${esc(u.demoFallback)}
      </video>
    </div>
  </div>
</section>`;

  const how = `<section class="mk-sec mk-band-c" id="how" aria-labelledby="mkHowH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkHowH">${esc(u.howHeading)}</h2>
    <div class="mk-how ${stage.hue}" data-steps="${p.steps.length}">
      <ol class="mk-steps" role="tablist" aria-label="${esc(u.howLabel)}" aria-orientation="vertical">
${p.steps.map((s, i) => `        <li role="presentation"><button class="mk-step" type="button" role="tab" id="mkStep${i + 1}" aria-controls="mkSlot" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" data-step="${i + 1}"><span class="mk-step-n" aria-hidden="true">${i + 1}</span><span class="mk-step-t">${esc(s.title)}</span><span class="mk-step-b">${esc(s.body)}</span></button></li>`).join('\n')}
      </ol>
      <div class="mk-slot" id="mkSlot" role="tabpanel" aria-labelledby="mkStep1">
${p.steps.map((s, i) => `        <figure class="mk-still${i === 0 ? ' is-on' : ''}" data-step="${i + 1}"${i === 0 ? '' : ' aria-hidden="true"'}><img src="${still(i + 1)}" width="1280" height="720" alt="${esc(s.title)}" loading="lazy" decoding="async"></figure>`).join('\n')}
      </div>
    </div>
  </div>
</section>`;

  const related = `<section class="mk-sec mk-band-a" id="related" aria-labelledby="mkRelH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkRelH">${esc(u.relatedHeading)}</h2>
    <div class="mk-cards">
${p.related.map((rid) => {
    const rs = site.stages.find((s) => s.id === pages[rid].stage);
    return `      <article class="mk-card ${rs.hue}">
        <span class="mk-card-icon">${sym(site.tools[rid].icon)}</span>
        <h3 class="mk-h3">${esc(pages[rid].label)}</h3>
        <p class="mk-card-p">${esc(site.tools[rid].blurb)}</p>
        <a class="mk-link" href="${esc(pages[rid].file)}">${esc(u.explore)}<span class="mk-vh"> ${esc(pages[rid].label)}</span>${sym('arrow_forward')}</a>
      </article>`;
  }).join('\n')}
    </div>
  </div>
</section>`;

  const tools = `<section class="mk-sec mk-band-b" id="tools" aria-labelledby="mkToolsH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkToolsH">${esc(u.toolsHeading)}</h2>
    <div class="mk-stages">
${navOrder(site).map((s) => `      <div class="mk-stage ${s.hue}">
        <p class="mk-stage-h"><span class="mk-dot" aria-hidden="true"></span>${esc(s.label)}</p>
        <ul>
${s.ids.map((tid) => `          <li>${toolLink(site, pages, tid, id)}</li>`).join('\n')}
        </ul>
      </div>`).join('\n')}
    </div>
  </div>
</section>`;

  const mid = `<section class="mk-sec mk-band-c mk-mid ${stage.hue}" id="start" aria-labelledby="mkMidH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(p.midCta.h2)}</h2>
    <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(u.midCta)}</a>
  </div>
</section>`;

  const facts = `<section class="mk-sec mk-band-a" id="facts" aria-labelledby="mkFactsH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkFactsH">${esc(u.factsHeading)}</h2>
    <ul class="mk-facts">
${p.facts.map((f) => `      <li><b class="mk-fact-n">${esc(f.value)}</b><span class="mk-fact-l">${esc(f.label)}</span></li>`).join('\n')}
    </ul>
    <a class="mk-link mk-link--lg" href="pricing.html">${esc(u.viewPricing)}${sym('arrow_forward')}</a>
  </div>
</section>`;

  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(p.metaTitle)}</title>
<meta name="description" content="${esc(p.metaDescription)}">
<link rel="canonical" href="https://{{brand:host}}/product-${id}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{brand:name}}">
<meta property="og:title" content="${esc(p.metaTitle)}">
<meta property="og:description" content="${esc(p.metaDescription)}">
<meta property="og:url" content="https://{{brand:host}}/product-${id}">
<meta property="og:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.metaTitle)}">
<meta name="twitter:description" content="${esc(p.metaDescription)}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
</head>
<body>
<!-- GENERATED by scripts/make-marketing-pages.mjs from src/data/marketing-site.json
     and src/data/marketing-pages.json. Edit those, then run npm run make:marketing.
     npm run test:marketing fails when this file drifts from the generator. The
     words are in the markup on purpose (crawlers, link previews, scripts off);
     src/pages/marketing.js adds the header's scroll state, the mega-menu, the
     sign-up modal and the step slot, and nothing else. -->
${header(site, pages, id)}
<main id="main" class="mk ${stage.hue}">
${hero}
${labelBar}
${value}
${demo}
${how}
${related}
${tools}
${mid}
${facts}
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/marketing.js"></script>
</body>
</html>
`;
}

export function buildAll(opts = {}) {
  const inputs = loadInputs(opts);
  const problems = validate(inputs);
  if (problems.length) throw new Error('marketing copy is not valid:\n  - ' + problems.join('\n  - '));
  const out = {};
  for (const id of Object.keys(inputs.site.stepCounts)) out[inputs.pages[id].file] = renderPage(id, inputs);
  return { files: out, inputs };
}

/* ---- CLI ------------------------------------------------------------- */
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const fixture = process.argv.includes('--fixture') || process.env.MARKETING_FIXTURE === '1';
  const check = process.argv.includes('--check');
  let built;
  try { built = buildAll({ fixture }); } catch (e) { console.error('make-marketing-pages: ' + e.message); process.exit(1); }
  let drift = 0;
  for (const [file, html] of Object.entries(built.files)) {
    const at = path.join(ROOT, file);
    const same = fs.existsSync(at) && fs.readFileSync(at, 'utf8') === html;
    if (check) { if (!same) { drift++; console.log('differs: ' + file); } continue; }
    if (!same) fs.writeFileSync(at, html);
    console.log((same ? 'unchanged ' : 'wrote     ') + file);
  }
  console.log('copy: ' + built.inputs.pagesRel);
  if (check && drift) process.exit(1);
}
