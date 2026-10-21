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

   PRICING. The same run also writes pricing.html (renderPricing): its header,
   footer and sign-up modal are the SAME three functions the product pages
   use, so the chrome stays single-sourced. Its copy is
   src/data/pricing-compare.json, its FAQ is src/data/marketing-faq.json, and
   the comparison table is built here from src/data/plan-matrix.json through
   the same labelOf()/planHas() the plan cards and schema section 36 use, so
   a cell cannot say what the matrix does not. The plan cards' prices, names
   and bullet lists are {{fms:...}} stamps filled at build time
   (vite.config.js planFigures).

   Exported for scripts/test-marketing.mjs: loadInputs, validate,
   renderPage, renderPricing, buildAll.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadMatrixModule } from './make-plan-features-sql.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SITE_FILE = 'src/data/marketing-site.json';
export const PAGES_FILE = 'src/data/marketing-pages.json';
export const FIXTURE_FILE = 'scripts/fixtures/marketing-pages.fixture.json';
export const MEDIA_BASE = '/marketing/';
export const COMPARE_FILE = 'src/data/pricing-compare.json';
export const FAQ_FILE = 'src/data/marketing-faq.json';
export const PRICING_FILE = 'pricing.html';

/** plan-matrix.js loaded in Node: the one place that knows a row's label and
 *  which plan has it. Loaded once, here, so buildAll stays synchronous. */
export const M = await loadMatrixModule();

const readJson = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

/** Escape text for an HTML text node or a double-quoted attribute. */
export const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The line a visitor OUTSIDE India reads instead (REGION-CONTENT,
 *  docs/US-MARKET-PLAN.md §E). A text field `x` may carry `xElsewhere`
 *  beside it (an array field, a parallel array); the page is still
 *  written with the India line, so crawlers and no-JS visitors read what
 *  they always did, and marketing.js swaps the text in for a visitor
 *  whose region is not India. Answers the attribute, or ''. */
export const alt = (o, k, i) => {
  const v = o && o[k + 'Elsewhere'];
  const t = Array.isArray(v) ? v[i] : (i === undefined ? v : null);
  return typeof t === 'string' && t.trim() ? ` data-mk-intl="${esc(t)}"` : '';
};

/** Material Symbols mark. Always aria-hidden: the label beside it is the name. */
const sym = (name, cls = '') => `<span class="sym${cls ? ' ' + cls : ''}" aria-hidden="true" translate="no">${esc(name)}</span>`;

export function loadInputs({ fixture = false } = {}) {
  const site = readJson(SITE_FILE);
  const pagesRel = fixture ? FIXTURE_FILE : PAGES_FILE;
  if (!fs.existsSync(path.join(ROOT, pagesRel))) {
    throw new Error(pagesRel + ' is missing. The marketing pages are generated from it and there is no silent fallback.'
      + (fixture ? '' : ' (Use --fixture to generate from ' + FIXTURE_FILE + ' while the copy is being written.)'));
  }
  return { site, pages: readJson(pagesRel), compare: readJson(COMPARE_FILE), faq: readJson(FAQ_FILE), home: readJson(HOME_COPY), company: readJson(COMPANY_COPY), fixture, pagesRel };
}

/** Every structural rule the template relies on. Returns a list of problems. */
export function validate({ site, pages, compare, faq }) {
  const bad = [];
  bad.push(...validatePricing(compare, faq));
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

/** The matrix rows a comparison table must show: every non-inverted row some
 *  PAID plan has (a row with no plan is switched off everywhere and is not
 *  sold, so it is not a line in a price list). */
export const comparableRows = () => M.MATRIX.features.filter((r) => !r.inverted && M.PAID.some((p) => M.planHas(r, p)));

/** Rules for pricing.html's copy and its row grouping. */
export function validatePricing(compare, faq) {
  const bad = [];
  const w = (m) => bad.push('pricing: ' + m);
  if (!compare) { w(COMPARE_FILE + ' was not loaded'); return bad; }
  for (const k of ['meta', 'hero', 'trial', 'plans', 'offer', 'compare', 'faq', 'close']) if (!compare[k]) w('copy block ' + k + ' missing');
  if (!Array.isArray(compare.groups) || !compare.groups.length) { w('groups missing'); return bad; }
  const want = comparableRows().map((r) => r.key);
  const seen = new Map();
  for (const g of compare.groups) {
    if (!g.id || !g.label || !Array.isArray(g.keys) || !g.keys.length) w('group ' + (g.id || '?') + ' needs id, label and keys');
    for (const entry of g.keys || []) {
      // an array is ONE table row for several matrix rows that are the same
      // feature to a buyer (a capability and the module it opens); they must
      // agree on every paid plan, or the merged row would hide a difference
      const ks = Array.isArray(entry) ? entry : [entry];
      if (!ks.length) w('group ' + g.id + ' has an empty merged row');
      for (const k of ks) {
        if (!M.MATRIX.features.some((r) => r.key === k)) w('group ' + g.id + ' names "' + k + '", which is not a plan-matrix.json row');
        else if (!want.includes(k)) w('group ' + g.id + ' names "' + k + '", which no paid plan has (or is an inverted restriction)');
        seen.set(k, (seen.get(k) || 0) + 1);
      }
      const rows = ks.map((k) => M.MATRIX.features.find((r) => r.key === k)).filter(Boolean);
      if (rows.length > 1 && M.PAID.some((p) => rows.some((r) => M.planHas(r, p) !== M.planHas(rows[0], p)))) {
        w('group ' + g.id + ' merges ' + ks.join(' + ') + ', which differ on a paid plan');
      }
    }
  }
  for (const k of want) if (!seen.has(k)) w('plan-matrix.json row "' + k + '" is in no comparison group');
  for (const [k, n] of seen) if (n > 1) w('row "' + k + '" is in ' + n + ' groups');
  for (const id of M.PAID) {
    if (!compare.plans.tags || !compare.plans.tags[id]) w('plans.tags.' + id + ' missing');
  }
  if (!M.PAID.includes(compare.plans && compare.plans.pick)) w('plans.pick is not a paid plan');
  if (!Array.isArray(faq) || faq.length !== 3) w('marketing-faq.json must hold exactly three groups (Billing, Plans, Your data)');
  else faq.forEach((g) => { if (!g.group || !Array.isArray(g.items) || !g.items.length || g.items.some((i) => !i.q || !i.a)) w('faq group "' + g.group + '" is malformed'); });
  const typed = JSON.stringify(compare);
  if (typed.includes('₹')) w('a bare rupee sign in the copy; prices are stamped, never typed');
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
        <a class="mk-nav-link mk-nav-prod" id="mkProd" href="start.html#tools" aria-haspopup="true" aria-expanded="false" aria-controls="mkMega"><span>${esc(u.product)}</span>${sym('expand_more')}</a>
        <div class="mk-mega" id="mkMega" role="group" aria-label="${esc(u.productNav)}">${groups}
        </div>
      </div>
      <a class="mk-nav-link" href="pricing.html"${current === 'pricing' ? ' aria-current="page"' : ''}>${esc(u.pricing)}</a>
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
          <li><a href="about.html">${esc(f.about)}</a></li>
          <li><a href="contact.html">${esc(f.contact)}</a></li>
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

  /* The hero shows the tool working: the headline across the top, the
     words and the one action under it, then the demo loop at full width,
     large on the first screen (the page's one moving picture, played in
     view by marketing.js). The player carries id="demo"; the label bar
     does not link to it, since the bar sits below it. No eyebrow: the label bar is the
     breadcrumb. */
  const hero = `<section class="mk-hero mk-hero--media ${stage.hue}" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in mk-hero-grid">
    <h1 class="mk-h1" id="mkH1">${esc(p.hero.h1)}</h1>
    <p class="mk-sub"${alt(p.hero, 'sub')}>${esc(p.hero.sub)}</p>
    <div class="mk-cta-row">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(u.getStarted)}</a>
    </div>
    <figure class="mk-player mk-hero-media" id="demo" aria-label="${esc(p.demo.h2)}">
      <video controls muted loop playsinline preload="none" width="1280" height="720" poster="${media(id + '.webp')}">
        <source src="${media(id + '.webm')}" type="video/webm">
        ${esc(u.demoFallback)}
      </video>
    </figure>
  </div>
</section>`;

  const labelBar = `<div class="mk-label ${stage.hue}">
  <div class="mk-wrap mk-label-in">
    <p class="mk-label-path">${sym(site.tools[id].icon)}${stage.label === p.label ? '' : `<span>${esc(stage.label)}</span><span class="mk-label-sep" aria-hidden="true">/</span>`}<strong>${esc(p.label)}</strong></p>
    <nav class="mk-label-nav" aria-label="${esc(u.labelNav)}">
      <a href="#how">${esc(u.labelHow)}</a>
      <a href="pricing.html">${esc(u.pricing)}</a>
    </nav>
  </div>
</div>`;

  const value = `<section class="mk-sec mk-band-b" id="value" aria-labelledby="mkValueH">
  <div class="mk-wrap mk-split">
    <div class="mk-split-text">
      <h2 class="mk-h2" id="mkValueH">${esc(p.value.h2)}</h2>
${p.value.body.map((t, i) => `      <p class="mk-body"${alt(p.value, 'body', i)}>${esc(t)}</p>`).join('\n')}
    </div>
    <ul class="mk-facts mk-facts--side" id="facts" aria-label="${esc(u.factsHeading)}">
${p.facts.map((f) => `      <li><b class="mk-fact-n"${alt(f, 'value')}>${esc(f.value)}</b><span class="mk-fact-l"${alt(f, 'label')}>${esc(f.label)}</span></li>`).join('\n')}
    </ul>
  </div>
</section>`;

  const how = `<section class="mk-sec mk-band-c" id="how" aria-labelledby="mkHowH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkHowH">${esc(u.howHeading)}</h2>
    <div class="mk-how ${stage.hue}" data-steps="${p.steps.length}">
      <ol class="mk-steps" role="tablist" aria-label="${esc(u.howLabel)}" aria-orientation="vertical">
${p.steps.map((s, i) => `        <li role="presentation"><button class="mk-step" type="button" role="tab" id="mkStep${i + 1}" aria-controls="mkSlot" aria-selected="${i === 0 ? 'true' : 'false'}" tabindex="${i === 0 ? '0' : '-1'}" data-step="${i + 1}"><span class="mk-step-n" aria-hidden="true">${i + 1}</span><span class="mk-step-t"${alt(s, "title")}>${esc(s.title)}</span><span class="mk-step-b"${alt(s, 'body')}>${esc(s.body)}</span></button></li>`).join('\n')}
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
    <div class="mk-cta-row mk-cta-row--center">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(u.getStarted)}</a>
      <a class="mk-link mk-link--lg" href="pricing.html">${esc(u.viewPricing)}${sym('arrow_forward')}</a>
    </div>
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
<link rel="preload" as="image" href="${media(id + '.webp')}" fetchpriority="high">
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
${how}
${related}
${tools}
${mid}
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/marketing.js"></script>
</body>
</html>
`;
}

/* ---- pricing.html ---------------------------------------------------- */

export function renderPricing({ site, pages, compare, faq }) {
  const c = compare;
  const u = site.ui;
  const PAID = M.PAID;
  const stamp = (kind, id) => '{{fms:' + kind + '.' + id + '}}';
  const buyText = (id) => esc(c.plans.buy).replace('{name}', stamp('plan', id));

  const hero = `<section class="mk-hero pr-hero" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in">
    <h1 class="mk-h1" id="mkH1">${esc(c.hero.h1)}</h1>
    <p class="mk-sub">${esc(c.hero.sub)}</p>
  </div>
</section>`;

  const card = (id, i) => {
    const pick = id === c.plans.pick;
    const buy = `<a class="mk-btn mk-btn--primary mk-btn--block pr-buy" href="purchase.html?plan=${id}" data-start-buy="${id}" data-plan="${id}" data-off-text="${esc(c.plans.buySignIn)}" data-open-text="${buyText(id)}">${buyText(id)}</a>`;
    return `      <li class="pr-tier${pick ? ' pr-pick' : ''}" data-tier="${id}">${pick ? `<p class="pr-pick-flag">${esc(c.plans.pickFlag)}</p>` : ''}<span class="pr-tier-tag">${esc(c.plans.tags[id])}</span><strong class="pr-tier-name">${stamp('plan', id)}</strong><p class="pr-tier-line">${stamp('tier.line', id)}</p><b class="pr-price">${stamp('price', id)}</b><span class="pr-once">${esc(c.plans.once)}<span class="pr-keep"> &middot; ${esc(c.plans.keep).replace('{{day}}', '{{fms:price.' + id + '.day}}')}</span></span><ul class="pr-inc">${stamp('tier.list', id)}</ul>${buy}<a class="pr-alt" href="invite.html" data-start-auth="google" data-trial-link data-open-text="${esc(c.plans.altOpen)}">${esc(c.plans.alt)}</a></li>`;
  };

  const plans = `<section class="mk-sec mk-band-b pr-plans" id="pricing" aria-labelledby="prPlansH">
  <div class="mk-wrap">
    <div class="pr-head">
      <h2 class="mk-h2" id="prPlansH">${esc(c.plans.h)}</h2>
      <p class="mk-body pr-lede">${esc(c.plans.lede)}</p>
    </div>

    <aside class="pr-trial" data-trial aria-label="${esc(c.trial.h)}">
      <div class="pr-trial-text"><strong>${esc(c.trial.h)}</strong><span class="pr-trial-say">${c.trial.bodyHtml}</span></div>
      <a class="mk-btn mk-btn--outline" href="invite.html" data-start-auth="google" data-open-text="${esc(c.trial.ctaOpen)}">${esc(c.trial.cta)}</a>
    </aside>

    <div class="pr-offer" id="offer" hidden role="note" aria-labelledby="offer-h">
      <h3 class="mk-h3" id="offer-h">${esc(c.offer.h)}</h3>
      <p id="offerLine">${esc(c.offer.line)}</p>
      <p class="pr-offer-meta"><span class="pr-chip" id="offerSeats" hidden></span><span class="pr-chip" id="offerLeft" hidden></span></p>
      <p class="pr-fine">${esc(c.offer.fine)}</p>
    </div>

    <ul class="pr-tiers" id="tiersIndividual">
${PAID.map(card).join('\n')}
    </ul>
    <p class="pr-fine" id="authMsg" role="status" aria-live="polite"></p>
    <p class="pr-note">${c.plans.noteHtml}</p>
  </div>
</section>`;

  const yes = `<td class="pr-yes"><span aria-hidden="true">✓</span><span class="mk-vh">${esc(c.compare.yes)}</span></td>`;
  const no = `<td class="pr-no"><span aria-hidden="true">—</span><span class="mk-vh">${esc(c.compare.no)}</span></td>`;
  const rowOf = (key) => M.MATRIX.features.find((r) => r.key === key);
  const body = c.groups.map((g) => `      <tbody id="cmp-${esc(g.id)}">
        <tr class="pr-group"><th scope="colgroup" colspan="${PAID.length + 1}">${esc(g.label)}</th></tr>
${g.keys.map((k) => { const r = rowOf(Array.isArray(k) ? k[0] : k); return `        <tr><th scope="row">${esc(M.labelOf(r))}</th>${PAID.map((p) => (M.planHas(r, p) ? yes : no)).join('')}</tr>`; }).join('\n')}
      </tbody>`).join('\n');
  const compareSec = `<section class="mk-sec mk-band-a pr-compare" id="compare" aria-labelledby="prCompH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="prCompH">${esc(c.compare.h)}</h2>
    <p class="mk-body pr-lede">${esc(c.compare.lede)}</p>
    <table class="pr-table">
      <caption class="mk-vh">${esc(c.compare.caption)}</caption>
      <colgroup><col class="pr-col-what">${PAID.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th scope="col">${esc(c.compare.what)}</th>${PAID.map((p) => `<th scope="col"><span class="pr-th-name">${stamp('plan', p)}</span><span class="pr-th-price">${stamp('price', p)}</span></th>`).join('')}</tr></thead>
${body}
    </table>
  </div>
</section>`;

  const faqSec = `<section class="mk-sec mk-band-b pr-faq" id="faq" aria-labelledby="prFaqH">
  <div class="mk-wrap pr-faq-grid">
    <div class="pr-faq-head">
      <h2 class="mk-h2" id="prFaqH">${esc(c.faq.h)}</h2>
      <p class="mk-body pr-lede">${esc(c.faq.lede)}</p>
    </div>
    <div class="pr-acc-list">
${faq.map((g, i) => `      <details class="pr-acc" name="pr-faq" id="faq-${i + 1}">
        <summary><span>${esc(g.group)}</span>${sym('expand_more')}</summary>
        <dl class="pr-qa">
${g.items.map((it) => `          <dt>${esc(it.q)}</dt>\n          <dd>${esc(it.a)}</dd>`).join('\n')}
        </dl>
      </details>`).join('\n')}
    </div>
  </div>
</section>`;

  const close = `<section class="mk-sec mk-band-c mk-mid pr-close" id="start" aria-labelledby="mkMidH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(c.close.h)}</h2>
    <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(c.close.cta)}</a>
  </div>
</section>`;

  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${esc(c.meta.title)}</title>
<meta name="description" content="${esc(c.meta.description)}">
<link rel="canonical" href="https://{{brand:host}}/pricing">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{brand:name}}">
<meta property="og:title" content="${esc(c.meta.title)}">
<meta property="og:description" content="${esc(c.meta.description)}">
<meta property="og:url" content="https://{{brand:host}}/pricing">
<meta property="og:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.meta.title)}">
<meta name="twitter:description" content="${esc(c.meta.description)}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
{{fms:jsonld}}
</head>
<body>
<!-- GENERATED by scripts/make-marketing-pages.mjs from src/data/pricing-compare.json,
     src/data/marketing-faq.json, src/data/plan-matrix.json and
     src/data/marketing-site.json. Edit those, then run npm run make:marketing.
     npm run test:marketing fails when this file drifts from the generator. The
     plan cards' names, prices and bullets are build-time (fms) stamps filled by
     vite.config.js at build time; a price is never typed. The words are in the
     markup on purpose (crawlers, link previews, scripts off); src/pages/pricing.js
     adds the live trial line, the scheduled price rise and the buy hand-off. -->
${header(site, pages, 'pricing')}
<main id="main" class="mk mk-pricing">
${hero}
${plans}
${compareSec}
${faqSec}
${close}
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/pricing.js"></script>
</body>
</html>
`;
}

/* ---- start.html (the home page) -------------------------------------- */

export const HOME_FILE = 'start.html';
export const HOME_COPY = 'src/data/marketing-home.json';

export function validateHome(home, { site, pages }) {
  const bad = [];
  const w = (m) => bad.push('marketing-home.json: ' + m);
  if (!home.hero || !home.hero.h1 || !home.hero.sub || !home.hero.note || !home.hero.cta || !home.hero.mediaLabel) w('hero needs h1, sub, note, cta and mediaLabel');
  if (!home.meta || !home.meta.title || !home.meta.description) w('meta needs title and description');
  if (!Array.isArray(home.stages) || home.stages.length !== 5) w('five stages');
  else home.stages.forEach((s, i) => {
    const last = i === 4;
    if (!s.id || !s.sym || !s.h2 || !s.body) w('stage ' + (i + 1) + ' needs id, sym, h2 and body');
    if (last) { if (s.cta || s.video) w('the fifth stage has no CTA and no video'); }
    else {
      if (!s.cta || !pages[s.cta.page] || !s.cta.label) w('stage ' + (i + 1) + ': cta.page must be a product page id');
      if (!s.video || !site.stepCounts[s.video]) w('stage ' + (i + 1) + ': video must be a product page id');
      if (!site.stages.some((g) => g.id === s.id)) w('stage ' + (i + 1) + ': id ' + s.id + ' is not a stage in marketing-site.json');
    }
  });
  if (!Array.isArray(home.facts) || home.facts.length !== 4) w('exactly four facts');
  if (!home.panel || !Array.isArray(home.panel.items) || home.panel.items.length !== 3) w('panel needs three items');
  if (!home.pricing || !home.pricing.pill || !home.pricingTeaser) w('the closing needs pricingTeaser and pricing.pill');
  if (!home.optOut || !home.optOut.label || !home.optOut.done) w('optOut needs label and done (privacy.html promises the control)');
  if (!home.closing || !home.closing.h2 || !home.closing.sub || !home.closing.cta) w('closing needs h2, sub and cta');
  return bad;
}

export function renderHome({ site, pages, home }) {
  const u = site.ui;
  const media = (name) => MEDIA_BASE + name;
  const hue = (id) => (site.stages.find((s) => s.id === id) || {}).hue || '';

  /* The first screen shows the product: the sample feature's scene list,
     large, beside the words (breakdown.* is the one loop the explorer
     below does not already use). */
  const hero = `<section class="mk-hero st-hero" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in st-hero-grid">
    <div class="st-hero-copy">
      <h1 class="mk-h1" id="mkH1">${esc(home.hero.h1)}</h1>
      <p class="mk-sub"${alt(home.hero, 'sub')}>${esc(home.hero.sub)}</p>
      <div class="mk-cta-row">
        <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(home.hero.cta)}</a>
      </div>
      <p class="st-note">${esc(home.hero.note)}</p>
    </div>
    <figure class="mk-player st-hero-media" aria-label="${esc(home.hero.mediaLabel)}">
      <video controls muted loop playsinline preload="none" width="1280" height="720" poster="${media('breakdown.webp')}">
        <source src="${media('breakdown.webm')}" type="video/webm">
        ${esc(u.demoFallback)}
      </video>
    </figure>
  </div>
</section>`;

  const facts = `<section class="st-facts-band" id="facts" aria-label="${esc(home.factsLabel)}">
  <div class="mk-wrap">
    <ul class="st-facts">
${home.facts.map((f) => `      <li><b class="st-fact-n"${alt(f, 'value')}>${esc(f.value)}</b><span class="st-fact-l"${alt(f, 'label')}>${esc(f.label)}</span></li>`).join('\n')}
    </ul>
  </div>
</section>`;

  const row = (s, i) => {
    const h = hue(s.id);
    const copy = `    <div class="st-copy">
      <span class="st-glyph">${sym(s.sym)}</span>
      <h2 class="mk-h2" id="st-h-${esc(s.id)}">${esc(s.h2)}</h2>
      <p class="mk-body"${alt(s, 'body')}>${esc(s.body)}</p>${s.cta ? `
      <a class="mk-link" href="${esc(pages[s.cta.page].file)}">${esc(s.cta.label)}${sym('arrow_forward')}</a>` : ''}
    </div>`;
    let mediaHtml;
    if (s.video) {
      mediaHtml = `    <div class="st-media">
      <div class="mk-player st-player">
        <video controls muted loop playsinline preload="none" width="1280" height="720" poster="${media(s.video + '.webp')}">
          <source src="${media(s.video + '.webm')}" type="video/webm">
          ${esc(u.demoFallback)}
        </video>
      </div>
    </div>`;
    } else {
      mediaHtml = `    <div class="st-media">
      <div class="st-panel" role="group" aria-label="${esc(home.panel.label)}">
        <ul>
${home.panel.items.map((it) => `          <li>${sym(it.sym)}<div><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div></li>`).join('\n')}
        </ul>
      </div>
    </div>`;
    }
    /* Three compositions, not one zigzag five times: the first stage is
       WIDE (words in a row, the loop full width under them), the middle
       three alternate at varied ratios, the last is a FIELD (no media). */
    const shape = i === 0 ? ' st-stage--wide' : (!s.video ? ' st-stage--field' : (s.mediaWide ? ' st-stage--media-wide' : ''));
    return `  <article class="st-stage${h ? ' ' + h : ' st-stage--brand'}${i % 2 ? ' st-stage--flip' : ''}${shape}" id="stage-${esc(s.id)}" aria-labelledby="st-h-${esc(s.id)}">
${copy}
${mediaHtml}
  </article>`;
  };

  const explorer = `<section class="mk-sec mk-band-b st-explorer" id="tools" aria-label="${esc(u.product)}">
  <div class="mk-wrap st-stages">
${home.stages.map(row).join('\n')}
  </div>
</section>`;

  const closing = `<section class="mk-sec mk-band-c mk-mid st-closing" id="start" aria-labelledby="mkMidH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(home.closing.h2)}</h2>
    <p class="mk-sub st-closing-sub">${esc(home.closing.sub)}</p>
    <div class="mk-cta-row mk-cta-row--center">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(home.closing.cta)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(home.pricing.pill)}</a>
    </div>
    <p class="st-note st-closing-note">${esc(home.pricingTeaser)}</p>
  </div>
</section>`;

  const t = esc(home.meta.title), d = esc(home.meta.description);
  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="https://{{brand:host}}/start">
<link rel="preload" as="image" href="${media('breakdown.webp')}" fetchpriority="high">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{brand:name}}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="https://{{brand:host}}/start">
<meta property="og:image" content="https://{{brand:host}}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="{{brand:name}}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
{{fms:jsonld}}
</head>
<body>
<!-- GENERATED by scripts/make-marketing-pages.mjs from src/data/marketing-home.json
     and src/data/marketing-site.json. Edit those, then run npm run make:marketing.
     npm run test:marketing fails when this file drifts from the generator.

     THE PUBLIC HOME PAGE, AND THE FRONT DOOR. Outside the site gate (EXEMPT in
     src/lib/sitegate.js); every signed-out visitor lands here. The words are in
     the markup (a crawler, a link preview and a reader with scripts off get the
     whole page). src/pages/start.js adds, on top of marketing.js (header state,
     mega-menu, sign-up modal, invite-code hold): the reason a Google sign-in
     did not complete, the landing_view count and the doorway rewrite of app
     links under the site gate. Every figure is an fms stamp
     (vite.config.js startFigures()), never typed; no price is printed here. -->
${header(site, pages, 'home')}
<main id="main" class="mk st">
${hero}
${facts}
${explorer}
${closing}
  <div class="mk-wrap st-optout"><button class="st-optout-btn" id="noCount" type="button" data-done="${esc(home.optOut.done)}">${esc(home.optOut.label)}</button></div>
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/start.js"></script>
</body>
</html>
`;
}

/* ---- contact.html and about.html -------------------------------------
   The company pages: the same header, footer and sign-up modal, the copy
   from src/data/marketing-company.json, and ONE call to action on each,
   the landing page's own: "Start your free trial" is the same
   <a href="invite.html" data-open-signup> door start.html's Get started
   is, and "See plans" goes to pricing.html. NO PERSONAL NAME: brand.json's
   seller is empty by the owner's decision, so About is signed by the team.

   The contact form SENDS NOTHING. It has no action (the CSP's form-action
   'self' would refuse a mailto: action anyway) and method="dialog", which
   outside a <dialog> submits nowhere, so with scripts off it cannot put a
   message into a URL or a server log. src/pages/company.js validates it
   and opens the visitor's own mail app with a mailto: link to the support
   address printed beside it. */

export const COMPANY_COPY = 'src/data/marketing-company.json';
export const CONTACT_FILE = 'contact.html';
export const ABOUT_FILE = 'about.html';

export function validateCompany(company) {
  const bad = [];
  const w = (m) => bad.push('marketing-company.json: ' + m);
  if (!company) { w('was not loaded'); return bad; }
  const c = company.contact, a = company.about, cta = company.cta;
  if (!cta || !cta.start || !cta.plans || !cta.startOpen) w('cta needs start, startOpen and plans');
  if (!c || !c.meta || !c.hero || !c.form || !c.aside || !c.close) w('contact needs meta, hero, form, aside and close');
  else {
    const f = c.form;
    for (const k of ['h2', 'name', 'email', 'topic', 'message', 'send', 'privacy', 'opened', 'failed', 'noscript', 'subjectPrefix']) if (!f[k]) w('contact.form.' + k + ' missing');
    if (!Array.isArray(f.topics) || f.topics.length !== 5 || f.topics.some((t) => !t.id || !t.label)) w('contact.form.topics must be five {id, label}');
    for (const k of ['summary', 'name', 'email', 'emailBad', 'topic', 'message', 'messageLong']) if (!f.errors || !f.errors[k]) w('contact.form.errors.' + k + ' missing');
  }
  if (!a || !a.meta || !a.hero || !a.why || !a.who || !a.does || !a.principles || !a.sign || !a.close) w('about needs meta, hero, why, who, does, principles, sign and close');
  else {
    if (!Array.isArray(a.does.items) || a.does.items.length !== 4) w('about.does needs four items (Story, Screenplay, Pre-production, Library)');
    if (!Array.isArray(a.principles.items) || a.principles.items.length !== 5) w('about.principles needs five items');
  }
  const typed = JSON.stringify(company);
  if (typed.includes('₹')) w('a bare rupee sign in the copy');
  return bad;
}

function companyHead({ title, description, slug }) {
  const t = esc(title), d = esc(description);
  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="https://{{brand:host}}/${slug}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{{brand:name}}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="https://{{brand:host}}/${slug}">
<meta property="og:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
</head>
<body>
<!-- GENERATED by scripts/make-marketing-pages.mjs from src/data/marketing-company.json
     and src/data/marketing-site.json. Edit those, then run npm run make:marketing.
     npm run test:marketing fails when this file drifts from the generator. The
     words are in the markup on purpose (crawlers, link previews, scripts off);
     src/pages/company.js adds marketing.js and the contact form's mailto. -->`;
}

/** The one call to action both company pages carry: the same neutral "Get
 *  started" door start.html and the product pages use (data-open-signup),
 *  and the plans. Not "Start your free trial": live, purchases are off and
 *  marketing.js drops every promise of a trial then, and a trial can also
 *  be switched off; a neutral door is true in every state. */
function companyCta(company, h2) {
  const cta = company.cta;
  return `<section class="mk-sec mk-band-c mk-mid co-cta" id="start" aria-labelledby="mkMidH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(h2)}</h2>
    <div class="mk-cta-row mk-cta-row--center">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-open-text="${esc(cta.startOpen)}">${esc(cta.start)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(cta.plans)}</a>
    </div>
  </div>
</section>`;
}

function companyHero(company, h1, sub) {
  const cta = company.cta;
  return `<section class="mk-hero co-hero" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in">
    <h1 class="mk-h1" id="mkH1">${esc(h1)}</h1>
    <p class="mk-sub">${esc(sub)}</p>
    <div class="mk-cta-row">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-open-text="${esc(cta.startOpen)}">${esc(cta.start)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(cta.plans)}</a>
    </div>
  </div>
</section>`;
}

export function renderContact({ site, pages, company }) {
  const c = company.contact;
  const f = c.form;
  const field = (id, label, control, hint) => `        <div class="co-field" data-field="${id}">
          <label class="co-label" for="co-${id}">${esc(label)}</label>${hint ? `
          <p class="co-hint" id="co-${id}-hint">${esc(hint)}</p>` : ''}
          ${control}
          <p class="co-err" id="co-${id}-err" hidden></p>
        </div>`;
  const desc = (id, hint) => `co-${id}-err${hint ? ` co-${id}-hint` : ''}`;
  const form = `<section class="mk-sec mk-band-b co-contact" id="write" aria-labelledby="coFormH">
  <div class="mk-wrap co-grid">
    <div class="co-main">
      <h2 class="mk-h2" id="coFormH">${esc(f.h2)}</h2>
      <form class="co-form" id="coForm" method="dialog" novalidate aria-labelledby="coFormH"
            data-err-summary="${esc(f.errors.summary)}" data-err-name="${esc(f.errors.name)}" data-err-email="${esc(f.errors.email)}"
            data-err-email-bad="${esc(f.errors.emailBad)}" data-err-topic="${esc(f.errors.topic)}" data-err-message="${esc(f.errors.message)}"
            data-err-message-long="${esc(f.errors.messageLong)}" data-opened="${esc(f.opened)}" data-failed="${esc(f.failed)}" data-subject="${esc(f.subjectPrefix)}">
        <noscript><p class="co-summary">${esc(f.noscript)}</p></noscript>
        <p class="co-summary" id="coSummary" role="alert" tabindex="-1" hidden></p>
${field('name', f.name, `<input class="co-input" id="co-name" name="name" type="text" autocomplete="name" maxlength="120" required aria-describedby="${desc('name')}">`)}
${field('email', f.email, `<input class="co-input" id="co-email" name="email" type="email" autocomplete="email" inputmode="email" maxlength="200" required aria-describedby="${desc('email', f.emailHint)}">`, f.emailHint)}
${field('topic', f.topic, `<select class="co-input" id="co-topic" name="topic" required aria-describedby="${desc('topic')}">
${f.topics.map((t, i) => `            <option value="${esc(t.id)}"${i === 0 ? ' selected' : ''}>${esc(t.label)}</option>`).join('\n')}
          </select>`)}
${field('message', f.message, `<textarea class="co-input co-area" id="co-message" name="message" rows="7" maxlength="4000" required aria-describedby="${desc('message', f.messageHint)}"></textarea>`, f.messageHint)}
        <div class="co-actions">
          <button class="mk-btn mk-btn--primary mk-btn--lg" type="submit">${sym('mail')}<span>${esc(f.send)}</span></button>
        </div>
        <p class="co-privacy">${sym('lock')}<span>${esc(f.privacy)}</span></p>
        <p class="co-status" id="coStatus" role="status" aria-live="polite"></p>
      </form>
    </div>
    <aside class="co-aside" aria-labelledby="coAsideH">
      <h2 class="mk-h3" id="coAsideH">${esc(c.aside.h2)}</h2>
      <p class="co-mail"><span class="co-mail-l">${esc(c.aside.emailLabel)}</span><span class="co-mail-v" id="coEmail" translate="no">{{brand:email}}</span></p>
      <div class="co-note">
        <h3 class="co-note-h">${esc(c.aside.refundH)}</h3>
        <p>${esc(c.aside.refundBody)}</p>
        <a class="mk-link" href="refund.html">${esc(c.aside.refundLink)}${sym('arrow_forward')}</a>
      </div>
      <div class="co-note">
        <h3 class="co-note-h">${esc(c.aside.faqH)}</h3>
        <p>${esc(c.aside.faqBody)}</p>
        <a class="mk-link" href="pricing.html#faq">${esc(c.aside.faqLink)}${sym('arrow_forward')}</a>
      </div>
    </aside>
  </div>
</section>`;
  return `${companyHead({ title: c.meta.title, description: c.meta.description, slug: 'contact' })}
${header(site, pages, 'contact')}
<main id="main" class="mk mk-company co-page">
${companyHero(company, c.hero.h1, c.hero.sub)}
${form}
${companyCta(company, c.close.h2)}
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/company.js"></script>
</body>
</html>
`;
}

export function renderAbout({ site, pages, company }) {
  const a = company.about;
  const why = `<section class="mk-sec mk-band-b" id="why" aria-labelledby="coWhyH">
  <div class="mk-wrap mk-split co-split">
    <div>
      <h2 class="mk-h2" id="coWhyH">${esc(a.why.h2)}</h2>
${a.why.body.map((t) => `      <p class="mk-body">${esc(t)}</p>`).join('\n')}
    </div>
    <div class="co-who">
      <h2 class="mk-h3" id="who">${esc(a.who.h2)}</h2>
      <p class="mk-body">${esc(a.who.body)}</p>
    </div>
  </div>
</section>`;
  const does = `<section class="mk-sec mk-band-a" id="what" aria-labelledby="coDoesH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="coDoesH">${esc(a.does.h2)}</h2>
    <div class="co-cards">
${a.does.items.map((it) => `      <article class="mk-card co-card">
        <span class="mk-card-icon">${sym(it.sym)}</span>
        <h3 class="mk-h3">${esc(it.title)}</h3>
        <p class="mk-card-p">${esc(it.text)}</p>${it.page ? `
        <a class="mk-link" href="${esc(it.page)}">${esc(it.link)}${sym('arrow_forward')}</a>` : ''}
      </article>`).join('\n')}
    </div>
  </div>
</section>`;
  const principles = `<section class="mk-sec mk-band-b" id="principles" aria-labelledby="coPrinH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="coPrinH">${esc(a.principles.h2)}</h2>
    <ul class="co-principles">
${a.principles.items.map((it) => `      <li>${sym(it.sym)}<div><b>${esc(it.title)}</b><span>${esc(it.text)}</span></div></li>`).join('\n')}
    </ul>
    <p class="co-sign">&mdash; ${esc(a.sign)}</p>
  </div>
</section>`;
  return `${companyHead({ title: a.meta.title, description: a.meta.description, slug: 'about' })}
${header(site, pages, 'about')}
<main id="main" class="mk mk-company co-page">
${companyHero(company, a.hero.h1, a.hero.sub)}
${why}
${does}
${principles}
${companyCta(company, a.close.h2)}
</main>
${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/company.js"></script>
</body>
</html>
`;
}

/* ---- the legal pages: privacy, terms, refund ---------------------------
   These three are HAND-WRITTEN and keep their words in the markup (a
   consent-screen reviewer, a crawler and a scripts-off reader get the whole
   document). Since 20 Oct 2026 they wear the public site's frame, so this run
   stamps only three MARKED regions in each file — the shared header, an
   "On this page" contents list, the shared footer — and gives an <h2> with no
   id a stable one so the contents can link it. Nothing between the markers
   is read as copy or rewritten; the legal text is never touched. No sign-up
   modal: legal.js loads no script that could open one, so "Sign up" stays a
   plain link to invite.html. */
export const LEGAL_FILES = ['privacy.html', 'terms.html', 'refund.html'];
/* Pages that wear the frame but are no document: the header and footer
   regions only, no contents list. 404.html loads legal.js like the three
   above, so without the frame it rendered as unstyled dark-on-dark text
   once the legal pages went dark. */
export const FRAME_FILES = ['404.html'];

export function renderFrame(file, src, { site, pages }) {
  let html = replaceRegion(src, 'header', header(site, pages, null), file);
  html = replaceRegion(html, 'footer', footer(site, pages), file);
  return html;
}

function slugOf(text) {
  const words = text.replace(/&[a-z]+;|&#\d+;/gi, ' ').replace(/^\s*\d+\.\s*/, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);
  let out = '';
  for (const w of words) { if ((out + '-' + w).length > 40 && out) break; out = out ? out + '-' + w : w; }
  return out || 'section';
}

function replaceRegion(html, key, body, file) {
  const open = `<!-- mk:${key} -->`, close = `<!-- /mk:${key} -->`;
  const i = html.indexOf(open), j = html.indexOf(close);
  if (i < 0 || j < i) throw new Error(`${file}: the ${open} … ${close} markers are missing`);
  return html.slice(0, i + open.length) + '\n' + body + '\n' + html.slice(j);
}

export function renderLegal(file, src, { site, pages }) {
  const m = src.match(/<main\b[^>]*>([\s\S]*?)<\/main>/);
  if (!m) throw new Error(file + ': no <main>');
  const used = new Set([...m[1].matchAll(/\sid="([^"]+)"/g)].map((x) => x[1]));
  const heads = [];
  const main = m[0].replace(/<h2(\s[^>]*)?>([\s\S]*?)<\/h2>/g, (all, attrs = '', inner) => {
    let id = (attrs.match(/\sid="([^"]+)"/) || [])[1];
    if (!id) {
      const base = slugOf(inner.replace(/<[^>]+>/g, ''));
      id = base; for (let n = 2; used.has(id); n++) id = base + '-' + n;
      used.add(id);
      all = `<h2${attrs} id="${id}">${inner}</h2>`;
    }
    heads.push({ id, label: inner.replace(/<[^>]+>/g, '').trim() });
    return all;
  });
  let html = src.replace(m[0], main);
  const label = esc(site.ui.labelNav);
  const items = heads.map((h) => `      <li><a href="#${h.id}">${h.label}</a></li>`).join('\n');
  const toc = `<nav class="legal-toc" aria-label="${label}">
  <p class="legal-toc-h">${label}</p>
  <ol>
${items}
  </ol>
</nav>
<details class="legal-toc-m">
  <summary>${label}</summary>
  <ol>
${items}
  </ol>
</details>`;
  html = replaceRegion(html, 'header', header(site, pages, null), file);
  html = replaceRegion(html, 'toc', toc, file);
  html = replaceRegion(html, 'footer', footer(site, pages), file);
  return html;
}

export function buildAll(opts = {}) {
  const inputs = loadInputs(opts);
  const problems = [...validate(inputs), ...validateHome(inputs.home, inputs), ...validateCompany(inputs.company)];
  if (problems.length) throw new Error('marketing copy is not valid:\n  - ' + problems.join('\n  - '));
  const out = {};
  for (const id of Object.keys(inputs.site.stepCounts)) out[inputs.pages[id].file] = renderPage(id, inputs);
  out[PRICING_FILE] = renderPricing(inputs);
  out[HOME_FILE] = renderHome(inputs);
  out[CONTACT_FILE] = renderContact(inputs);
  out[ABOUT_FILE] = renderAbout(inputs);
  /* The fixture swaps the page list, so the frame it would stamp is not the
     one on disk; the legal pages are built from the real copy only. */
  if (!opts.fixture) {
    for (const f of LEGAL_FILES) out[f] = renderLegal(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), inputs);
    for (const f of FRAME_FILES) out[f] = renderFrame(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), inputs);
  }
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
