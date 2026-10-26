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

/* PRICES THE PAGE CAN RE-QUOTE (docs/US-MARKET-PLAN.md, PRICING-CLIENT).
   The build stamps RUPEES, so a crawler and a reader with scripts off see
   the figure that is charged today. A visitor outside India is shown the
   owner's DOLLAR figures at runtime (src/pages/pricing.js, start.js read
   price_notice('USD')), so every price stamp in VISIBLE text is wrapped in
   a span the script can find by what it is, never by parsing "₹599" back
   out of the page: data-price="<tier>" for a year, data-price-day="<tier>"
   or "from" for a day. Head tags (title, meta) keep plain rupee stamps. */
export const priceSpans = (html) => String(html)
  .replace(/\{\{fms:price\.(from|starter|indie|pro)\.day\}\}/g, (all, id) => `<span data-price-day="${id}">${all}</span>`)
  .replace(/\{\{fms:price\.(starter|indie|pro)\}\}/g, (all, id) => `<span data-price="${id}">${all}</span>`);
/** Copy that is true only for one CHARGE currency ("paid in Indian
 *  rupees"): both variants in the markup, the dollar one hidden until the
 *  server says dollars are charged (usd_checkout). Crawlers and scripts-off
 *  readers get the rupee sentence, which is what is charged today. */
export const chargeVariants = (inrHtml, usdHtml) => (usdHtml
  ? `<span data-charge="INR">${inrHtml}</span><span data-charge="USD" hidden>${usdHtml}</span>`
  : inrHtml);
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
  return { site, pages: readJson(pagesRel), compare: readJson(COMPARE_FILE), faq: readJson(FAQ_FILE), home: readJson(HOME_COPY), company: readJson(COMPANY_COPY), guides: readJson(GUIDES_COPY), versus: readJson(COMPARE_COPY), fixture, pagesRel };
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
      <a class="mk-nav-link" href="guides.html"${current === 'guides' ? ' aria-current="page"' : ''}>${esc(u.guides)}</a>
      <a class="mk-nav-link" href="guides.html#compare"${current === 'compare' ? ' aria-current="page"' : ''}>${esc(u.compare)}</a>
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
          <li><a href="trust.html">${esc(f.trust)}</a></li>
          <li><a href="guides.html">${esc(f.guides)}</a></li>
          <li><a href="guides.html#compare">${esc(f.compare)}</a></li>
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
    <h2 class="mk-modal-h" id="mkSignupTitle">${s.headingHtml || esc(s.heading)}</h2>
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
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.metaTitle)}">
<meta name="twitter:description" content="${esc(p.metaDescription)}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
${ldScripts([softwareLd('product-' + id), crumbsLd([{ name: 'Home', slug: 'start' }, { name: stage.label, slug: 'start#tools' }, { name: p.label, slug: 'product-' + id }])])}
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

/* The students band. It names a promo code ONLY while
   marketing-site.json says that code is live on the server
   (site.student.live): a band that tells a student to type a code the
   server does not know is a promise checkout breaks. Until then it asks
   the reader to write to us. Never a figure either way: the discount is
   quoted at checkout, in the currency the order is in. */
export function eduBand(site, e) {
  const st = site.student || {};
  const live = st.live === true && /^[A-Z0-9_-]{3,40}$/.test(st.code || '');
  const body = live ? esc(e.bodyLive.replace('{code}', st.code)) : esc(e.body);
  const cta = live
    ? `<a class="mk-btn mk-btn--outline" href="purchase.html?plan=indie">${esc(e.ctaLive)}</a>`
    : `<a class="mk-btn mk-btn--outline" href="contact.html">${esc(e.cta)}</a>`;
  return `<aside class="pr-edu" id="students" aria-labelledby="prEduH">
      <div class="pr-edu-text">
        <h3 class="mk-h3" id="prEduH">${esc(e.h)}</h3>
        <p class="mk-small"><strong>${esc(e.lead)}</strong> ${body}</p>
        <p class="mk-small">${esc(e.schools)} <a class="mk-link mk-link--inline" href="mailto:{{brand:email}}" translate="no">{{brand:email}}</a> ${esc(e.schoolsAfter)}</p>
      </div>
      ${cta}
    </aside>`;
}

export function renderPricing({ site, pages, compare, faq }) {
  const c = compare;
  const u = site.ui;
  const PAID = M.PAID;
  const stamp = (kind, id) => '{{fms:' + kind + '.' + id + '}}';
  const buyText = (id) => esc(c.plans.buy).replace('{name}', stamp('plan', id));

  const hero = `<section class="mk-hero pr-hero" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in">
    <h1 class="mk-h1" id="mkH1">${esc(c.hero.h1)}</h1>
    <p class="mk-sub">${priceSpans(chargeVariants(esc(c.hero.sub), c.hero.subUsd && esc(c.hero.subUsd)))}</p>
  </div>
</section>`;

  const card = (id, i) => {
    const pick = id === c.plans.pick;
    const buy = `<a class="mk-btn mk-btn--primary mk-btn--block pr-buy" href="purchase.html?plan=${id}" data-start-buy="${id}" data-plan="${id}" data-off-text="${esc(c.plans.buySignIn)}" data-open-text="${buyText(id)}">${buyText(id)}</a>`;
    return `      <li class="pr-tier${pick ? ' pr-pick' : ''}" data-tier="${id}">${pick ? `<p class="pr-pick-flag">${esc(c.plans.pickFlag)}</p>` : ''}<span class="pr-tier-tag">${esc(c.plans.tags[id])}</span><strong class="pr-tier-name">${stamp('plan', id)}</strong><p class="pr-tier-line">${stamp('tier.line', id)}</p><b class="pr-price">${priceSpans(stamp('price', id))}</b><span class="pr-once">${esc(c.plans.once)}<span class="pr-keep"> &middot; ${priceSpans(esc(c.plans.keep).replace('{{day}}', '{{fms:price.' + id + '.day}}'))}</span></span><span class="pr-charge" data-price-charge="${id}" hidden></span><ul class="pr-inc">${stamp('tier.list', id)}</ul>${buy}<a class="pr-alt" href="invite.html" data-start-auth="google" data-trial-link data-trial data-trial-only data-open-text="${esc(c.plans.altOpen)}">${esc(c.plans.alt)}</a></li>`;
  };

  const plans = `<section class="mk-sec mk-band-b pr-plans" id="pricing" aria-labelledby="prPlansH">
  <div class="mk-wrap">
    <div class="pr-head">
      <h2 class="mk-h2" id="prPlansH">${esc(c.plans.h)}</h2>
      <p class="mk-body pr-lede">${esc(c.plans.lede)}</p>
    </div>

    <aside class="pr-trial" data-trial aria-label="${esc(c.trial.h)}">
      <div class="pr-trial-text"><strong>${esc(c.trial.h)}</strong><span class="pr-trial-say">${c.trial.bodyHtml}</span></div>
      <a class="mk-btn mk-btn--outline" href="invite.html" data-start-auth="google" data-trial-only data-open-text="${esc(c.trial.ctaOpen)}">${c.trial.ctaHtml || esc(c.trial.cta)}</a>
    </aside>

    <div class="pr-offer" id="offer" hidden role="note" aria-labelledby="offer-h">
      <h3 class="mk-h3" id="offer-h">${esc(c.offer.h)}</h3>
      <p id="offerLine">${esc(c.offer.line)}</p>
      <p class="pr-offer-meta"><span class="pr-chip" id="offerSeats" hidden></span><span class="pr-chip" id="offerLeft" hidden></span></p>
      <p class="pr-fine">${esc(c.offer.fine)}</p>
    </div>

    <div class="pr-cur" data-price-switch hidden>
      <p class="pr-cur-line" id="prCurLine" role="status" aria-live="polite"></p>
      <div class="pr-cur-seg" role="group" aria-label="${esc(c.plans.currencyLabel)}">${['INR', 'USD'].map((v) => `<button type="button" class="pr-cur-btn" data-price-cur="${v}" aria-pressed="false">${v === 'INR' ? '&#8377; INR' : '$ USD'}</button>`).join('')}</div>
    </div>

    <ul class="pr-tiers" id="tiersIndividual">
${PAID.map(card).join('\n')}
    </ul>
    <p class="pr-fine" id="authMsg" role="status" aria-live="polite"></p>
    <p class="pr-note">${chargeVariants(c.plans.noteHtml, c.plans.noteUsdHtml)}</p>
    ${eduBand(site, c.edu)}
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
      <thead><tr><th scope="col">${esc(c.compare.what)}</th>${PAID.map((p) => `<th scope="col"><span class="pr-th-name">${stamp('plan', p)}</span><span class="pr-th-price">${priceSpans(stamp('price', p))}</span></th>`).join('')}</tr></thead>
${body}
    </table>
  </div>
</section>`;

  const faqSec = `<section class="mk-sec mk-band-b pr-faq" id="faq" aria-labelledby="prFaqH">
  <div class="mk-wrap pr-faq-grid">
    <div class="pr-faq-head">
      <h2 class="mk-h2" id="prFaqH">${esc(c.faq.h)}</h2>
      <p class="mk-body pr-lede">${esc(c.faq.lede)}</p>
${c.faq.contact ? `      <p class="mk-body pr-lede pr-contact">${esc(c.faq.contact.before)} <a class="mk-link mk-link--inline" href="mailto:{{brand:email}}" translate="no">{{brand:email}}</a>. ${esc(c.faq.contact.after)}</p>
` : ''}      <p class="mk-body pr-lede"><a class="mk-link" href="trust.html">${esc(site.trustLink)}${sym('arrow_forward')}</a></p>
    </div>
    <div class="pr-acc-list">
${faq.map((g, i) => `      <details class="pr-acc" name="pr-faq" id="faq-${i + 1}">
        <summary><span>${esc(g.group)}</span>${sym('expand_more')}</summary>
        <dl class="pr-qa">
${g.items.map((it) => { const t = it.trial ? ' data-trial' : ''; return `          <dt${t}>${esc(it.q)}</dt>\n          <dd${t}>${priceSpans(chargeVariants(it.aHtml || esc(it.a), it.aUsd && esc(it.aUsd)))}</dd>`; }).join('\n')}
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
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(c.meta.title)}">
<meta name="twitter:description" content="${esc(c.meta.description)}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
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
${leadForm(site.lead, 'pr')}
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
      /* A stage's clip is a product page's, or one of the recorder's
         cross-page clips (record-marketing-media.mjs SPACES.chain: the
         scene chain end to end), which no single product page owns. */
      const HOME_CLIPS = ['chain'];
      if (!s.video || !(site.stepCounts[s.video] || HOME_CLIPS.includes(s.video))) w('stage ' + (i + 1) + ': video must be a product page id or one of ' + HOME_CLIPS.join(', '));
      if (!site.stages.some((g) => g.id === s.id)) w('stage ' + (i + 1) + ': id ' + s.id + ' is not a stage in marketing-site.json');
    }
  });
  if (!Array.isArray(home.facts) || home.facts.length !== 4) w('exactly four facts');
  if (!home.panel || !Array.isArray(home.panel.items) || home.panel.items.length !== 3) w('panel needs three items');
  if (!home.pricing || !home.pricing.pill || !home.pricingTeaser) w('the closing needs pricingTeaser and pricing.pill');
  if (!home.optOut || !home.optOut.label || !home.optOut.done) w('optOut needs label and done (privacy.html promises the control)');
  if (!home.closing || !home.closing.h2 || !home.closing.sub || !home.closing.cta) w('closing needs h2, sub and cta');
  /* the trial line beside the price: its LENGTH is never typed, marketing.js
     fills [data-trial-length] from trial_offer() and hides [data-trial]
     when trials are switched off */
  const tr = home.trial;
  if (!tr || !tr.html || !tr.open || !/<span data-trial-length="(label|length)">[^<]+<\/span>/.test(tr.html)) w('trial needs html (with a <span data-trial-length="label"> fallback) and open');
  else if (/\d/.test(tr.html.replace(/<[^>]*>/g, ''))) w('trial.html types a number; the length comes from the server');
  const ex = home.exports;
  if (!ex || !ex.h2 || !ex.body || !Array.isArray(ex.items) || ex.items.length !== 3 || ex.items.some((i) => !i.sym || !i.title || !i.text)) w('exports needs h2, body and three {sym, title, text}');
  const an = home.answers;
  if (!an || !an.h2 || !Array.isArray(an.items) || an.items.length !== 4 || an.items.some((i) => !i.sym || !i.q || !(i.a || i.aHtml))) w('answers needs h2 and four {sym, q, a|aHtml}');
  if (!an || !an.contact || !an.contact.before || !an.contact.after) w('answers.contact needs before and after');
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
      <p class="mk-sub"${alt(home.hero, 'sub')}>${priceSpans(esc(home.hero.sub))}</p>
      <div class="mk-cta-row">
        <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(home.hero.cta)}</a>
      </div>
      <p class="st-note" data-trial data-off-text="${esc(site.signup.offerOff)}" data-open-text="${esc(home.trial.open)}">${home.trial.html}</p>
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
    <p class="st-note st-closing-note">${priceSpans(esc(home.pricingTeaser))}</p>
    <p class="st-note st-closing-note" data-trial data-off-text="${esc(site.signup.offerOff)}" data-open-text="${esc(home.trial.open)}">${home.trial.html}</p>
  </div>
</section>`;

  /* What comes out (every format listed is a download the studio has
     today), then the four questions the launch study's panel asked
     first, answered, and the support address. Both reuse the shared
     card classes in marketing.css: three export cards in .mk-cards, four
     answers in .mk-stages (4 / 2 / 1 columns). */
  const exportsSec = `<section class="mk-sec mk-band-a" id="exports" aria-labelledby="stExH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="stExH">${esc(home.exports.h2)}</h2>
    <p class="mk-body">${esc(home.exports.body)}</p>
    <div class="mk-cards">
${home.exports.items.map((it) => `      <article class="mk-card">
        <span class="mk-card-icon">${sym(it.sym)}</span>
        <h3 class="mk-h3">${esc(it.title)}</h3>
        <p class="mk-card-p">${esc(it.text)}</p>
      </article>`).join('\n')}
    </div>${home.exports.footHtml ? `
    <p class="mk-body mk-ex-foot">${home.exports.footHtml.replace('{{media}}', MEDIA_BASE)}</p>` : ''}
  </div>
</section>`;

  const answersSec = `<section class="mk-sec mk-band-b" id="answers" aria-labelledby="stAnH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="stAnH">${esc(home.answers.h2)}</h2>
    <div class="mk-stages">
${home.answers.items.map((it) => `      <article class="mk-card"${it.trial ? ' data-trial' : ''}>
        <span class="mk-card-icon">${sym(it.sym)}</span>
        <h3 class="mk-h3">${esc(it.q)}</h3>
        <p class="mk-card-p">${it.aHtml || esc(it.a)}</p>
      </article>`).join('\n')}
    </div>
    <p class="st-note">${esc(home.answers.contact.before)} <a class="mk-link mk-link--inline" href="mailto:{{brand:email}}" translate="no">{{brand:email}}</a>. ${esc(home.answers.contact.after)}</p>
    <p class="st-note"><a class="mk-link" href="trust.html">${esc(site.trustLink)}${sym('arrow_forward')}</a></p>
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
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
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
${exportsSec}
${answersSec}
${closing}
${leadForm(site.lead, 'st')}
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
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="https://{{brand:host}}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
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
      <p class="co-mail"><span class="co-mail-l">${esc(c.aside.emailLabel)}</span><a class="co-mail-a" href="mailto:{{brand:email}}"><span class="co-mail-v" id="coEmail" translate="no">{{brand:email}}</span></a><button type="button" class="mk-btn mk-btn--ghost co-copy" id="coCopy" hidden>${sym('content_copy')}<span>Copy address</span></button></p>
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

/* ---- structured data, shared ------------------------------------------
   JSON-LD is written here with {{brand:...}} stamps (the fms-brand plugin
   fills them). The SoftwareApplication carries NO offers, on purpose: a
   price in structured data is fixed at build time, while the price that
   is charged is the server's (price_notice(): the founding price rises on
   a date the server holds). The visible figures are corrected at runtime;
   JSON-LD cannot be, so on the day of the rise every page would tell a
   search engine a price nobody is charged. The one Offer list left is
   pricing.html's Product (vite.config.js marketingFigures()), and the
   owner rebuilds after the rise lands (docs/LAUNCH.md section 8). */
export const OG_ALT = '{{brand:name}}: {{brand:tagline}}';
export const ldScripts = (objs) => objs.map((o) => '<script type="application/ld+json">'
  + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');
const ORIGIN = 'https://{{brand:host}}';
export const softwareLd = (slug) => ({
  '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: '{{brand:name}}',
  applicationCategory: 'MultimediaApplication', operatingSystem: 'Web browser',
  url: ORIGIN + '/' + slug, description: '{{brand:tagline}}'
});
export const crumbsLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, item: ORIGIN + '/' + it.slug }))
});

/** The head every page added on 26 Oct 2026 shares: canonical, OG/Twitter
 *  with an alt text, and the page's JSON-LD. */
function publicHead({ title, description, slug, ld }) {
  const t = esc(title), d = esc(description);
  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="${ORIGIN}/${slug}">
<meta property="og:type" content="${ld.some((o) => o['@type'] === 'Article' || o['@type'] === 'HowTo') ? 'article' : 'website'}">
<meta property="og:site_name" content="{{brand:name}}">
<meta property="og:title" content="${t}">
<meta property="og:description" content="${d}">
<meta property="og:url" content="${ORIGIN}/${slug}">
<meta property="og:image" content="${ORIGIN}/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="${OG_ALT}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${t}">
<meta name="twitter:description" content="${d}">
<meta name="twitter:image" content="${ORIGIN}/og.png">
<meta name="twitter:image:alt" content="${OG_ALT}">
<meta property="og:locale" content="en_IN">
<meta name="theme-color" content="#0d0e13">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
${ldScripts(ld)}
</head>
<body>`;
}

const genNote = (from) => `<!-- GENERATED by scripts/make-marketing-pages.mjs from ${from}
     and src/data/marketing-site.json. Edit those, then run npm run make:marketing.
     npm run test:marketing fails when this file drifts from the generator. The
     words are in the markup on purpose (crawlers, link previews, scripts off);
     src/pages/marketing.js adds the header, the sign-up modal and the live
     trial length, and nothing else. -->`;

const pageTail = (site, pages) => `${footer(site, pages)}
${modal(site)}
<script type="module" src="/src/pages/marketing.js"></script>
</body>
</html>
`;

/** "26 October 2026" from an ISO day, with no clock and no zone involved. */
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export const longDay = (iso) => { const [y, m, d] = String(iso).split('-').map(Number); return d + ' ' + MONTHS[m - 1] + ' ' + y; };

/** The closing door every guide, comparison and the trust page share: the
 *  trial (data-trial-only: hidden when no trial runs; its length is filled
 *  into [data-trial-length]) and the plans, which are true in every state. */
function trialClose(g, h2, hue = '') {
  return `<section class="mk-sec mk-band-c mk-mid${hue ? ' ' + hue : ''}" id="start" aria-labelledby="mkMidH">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(h2)}</h2>
    <div class="mk-cta-row mk-cta-row--center">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-trial data-trial-only>${g.ui.ctaTrialHtml}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(g.ui.ctaPlans)}</a>
    </div>
    <p class="mk-small mk-close-note" data-trial data-trial-only>${esc(g.ui.ctaNote)}</p>
  </div>
</section>`;
}

/* ---- the guides, the comparisons and the trust page (26 Oct 2026) ------
   guide-<id>.html from marketing-guides.json, compare-<id>.html and
   trust.html from marketing-compare.json, and guides.html, the index of
   both. Same header, footer and sign-up modal as every public page. */

export const GUIDES_COPY = 'src/data/marketing-guides.json';
export const COMPARE_COPY = 'src/data/marketing-compare.json';
export const GUIDES_INDEX = 'guides.html';
export const TRUST_FILE = 'trust.html';
const slugOfFile = (f) => f.replace(/\.html$/, '');

export function validateGuides(g, c) {
  const bad = [];
  const w = (m) => bad.push('marketing-guides.json: ' + m);
  if (!g || !Array.isArray(g.guides)) { w('was not loaded'); return bad; }
  if (g.guides.length !== 7) w('seven guides, has ' + g.guides.length);
  const ids = g.guides.map((x) => x.id);
  if (new Set(ids).size !== ids.length) w('guide ids repeat');
  if (!/<span data-trial-length="label">free trial<\/span>/.test(g.ui.ctaTrialHtml || '')) w('ui.ctaTrialHtml must wrap "free trial" in <span data-trial-length="label">');
  for (const x of g.guides) {
    const t = (m) => w(x.id + ': ' + m);
    if (x.file !== 'guide-' + x.id + '.html') t('file must be guide-' + x.id + '.html');
    for (const k of ['label', 'card', 'metaTitle', 'metaDescription', 'h1', 'sub', 'sym']) if (!x[k]) t('missing ' + k);
    if (!/^hue-(library|feature|plan|shoot)$/.test(x.hue)) t('hue ' + x.hue + ' is not an existing hue class');
    if (!['Article', 'HowTo'].includes(x.kind)) t('kind is Article or HowTo');
    if (!Array.isArray(x.sections) || x.sections.length < 3) t('at least three sections');
    else x.sections.forEach((s, i) => { if (!s.h2 || !(s.body || s.list || s.steps)) t('section ' + (i + 1) + ' needs h2 and body, list or steps'); });
    if (x.kind === 'HowTo' && !(x.sections || []).some((s) => Array.isArray(s.steps) && s.steps.length >= 3)) t('a HowTo needs a section with three or more steps');
    if (!x.studio || !Array.isArray(x.studio.body) || !x.studio.body.length || !x.studio.ours || !Array.isArray(x.studio.links)) t('studio needs body, links and ours');
    else if (x.studio.plan !== null && !M.PAID.includes(x.studio.plan)) t('studio.plan must be a paid plan id or null');
    else if (x.studio.plan === null && !x.studio.planNote) t('a null studio.plan needs a planNote');
    if (!Array.isArray(x.related) || x.related.length !== 3 || x.related.some((r) => !ids.includes(r) || r === x.id)) t('related must be three other guide ids');
    for (const sct of x.sources || []) if (!/^https:\/\//.test(sct.url) || !/^\d{4}-\d\d-\d\d$/.test(sct.checked || '')) t('a source needs an https url and a checked date');
  }
  if (JSON.stringify(g).includes('₹')) w('a bare rupee sign; no figure is typed in a guide');
  const cw = (m) => bad.push('marketing-compare.json: ' + m);
  if (!c || !Array.isArray(c.pages) || c.pages.length !== 2) { cw('two comparison pages'); return bad; }
  for (const p of c.pages) {
    if (p.file !== 'compare-' + p.id + '.html') cw(p.id + ': file must be compare-' + p.id + '.html');
    if (!Array.isArray(p.rows) || !p.rows.length) cw(p.id + ': rows missing');
    for (const k of ['label', 'card', 'metaTitle', 'metaDescription', 'h1', 'sub', 'name']) if (!p[k]) cw(p.id + ': missing ' + k);
    for (const r of p.rows || []) {
      if (!c.us[r.us]) cw(p.id + ': row "' + r.feature + '" names an unknown us key ' + r.us);
      if (!r.them || !/^https:\/\//.test(r.source || '') || !/^\d{4}-\d\d-\d\d$/.test(r.checked || '')) cw(p.id + ': row "' + r.feature + '" needs them, an https source and a checked date (or omit the row)');
      /* Only "read" (a person opened the vendor's page and confirmed the
         sentence on `checked`) is ever printed; "unread" waits for that. */
      if (r.status !== 'read' && r.status !== 'unread') cw(p.id + ': row "' + r.feature + '" needs status "read" or "unread"');
    }
    if (/\b(better|best|worse|worst|superior|cheaper|faster)\b/i.test(JSON.stringify(p))) cw(p.id + ': no comparative superlatives');
  }
  const sw = c.switching && c.switching.sections;
  if (!Array.isArray(sw) || sw.length < 3) cw('switching needs three or more sections');
  else {
    sw.forEach((x, i) => { if (!x.h2 || !(x.body || x.list || x.steps) || !x.ours) cw('switching section ' + (i + 1) + ' needs h2, body/list/steps and ours'); });
    if (!sw.some((x) => Array.isArray(x.steps) && x.steps.length >= 3)) cw('switching needs a section with three or more steps (the HowTo)');
  }
  if (!/^\d{4}-\d\d-\d\d$/.test(c.updated || '')) cw('updated must be an ISO day');
  if (!c.trust || !Array.isArray(c.trust.sections) || c.trust.sections.length < 5) cw('trust needs five or more sections');
  return bad;
}

const crumbs = (items) => `<nav class="mk-crumbs" aria-label="Breadcrumb"><ol>${items.map((it, i) => (i === items.length - 1
  ? `<li><span aria-current="page">${esc(it.name)}</span></li>`
  : `<li><a href="${esc(it.href)}">${esc(it.name)}</a></li>`)).join('')}</ol></nav>`;

function guideBlock(s, i) {
  const parts = [`      <h2 class="mk-h2" id="g-${i + 1}">${esc(s.h2)}</h2>`];
  for (const t of s.body || []) parts.push(`      <p class="mk-body">${esc(t)}</p>`);
  if (s.list) parts.push(`      <ul class="mk-list">\n${s.list.map((t) => `        <li>${esc(t)}</li>`).join('\n')}\n      </ul>`);
  if (s.steps) parts.push(`      <ol class="mk-list mk-list--steps">\n${s.steps.map((st) => `        <li><b>${esc(st.name)}.</b> ${esc(st.text)}</li>`).join('\n')}\n      </ol>`);
  return parts.join('\n');
}

function guideCard(g, y) {
  return `      <article class="mk-card ${y.hue}">
        <span class="mk-card-icon">${sym(y.sym)}</span>
        <h3 class="mk-h3">${esc(y.label)}</h3>
        <p class="mk-card-p">${esc(y.card)}</p>
        <a class="mk-link" href="${esc(y.file)}">${esc(g.ui.read)}<span class="mk-vh">: ${esc(y.label)}</span>${sym('arrow_forward')}</a>
      </article>`;
}

function articleHero(h1, sub, crumbItems, extra = '') {
  return `<section class="mk-hero mk-hero--article" id="top" aria-labelledby="mkH1">
  <div class="mk-wrap mk-hero-in">
${crumbItems ? `    ${crumbs(crumbItems)}\n` : ''}    <h1 class="mk-h1" id="mkH1">${esc(h1)}</h1>
    <p class="mk-sub">${esc(sub)}</p>${extra}
  </div>
</section>`;
}

export function renderGuide(id, { site, pages, guides: g }) {
  const x = g.guides.find((y) => y.id === id);
  const slug = slugOfFile(x.file);
  const url = ORIGIN + '/' + slug;
  const art = { '@context': 'https://schema.org', '@type': x.kind, name: x.h1, description: x.metaDescription, inLanguage: 'en-IN', dateModified: g.updated, url, image: ORIGIN + '/og.png' };
  if (x.kind === 'HowTo') {
    art.step = x.sections.find((s) => s.steps).steps.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st.name, text: st.text }));
  } else {
    Object.assign(art, { headline: x.h1, author: { '@type': 'Organization', name: '{{brand:name}}', url: ORIGIN + '/' },
      publisher: { '@type': 'Organization', name: '{{brand:name}}', logo: { '@type': 'ImageObject', url: ORIGIN + '/icons/icon-512.png' } } });
  }
  const ld = [art, crumbsLd([{ name: g.ui.breadcrumbHome, slug: 'start' }, { name: g.ui.breadcrumbGuides, slug: 'guides' }, { name: x.label, slug }]), softwareLd(slug)];
  const st = x.studio;
  const top = M.PAID[M.PAID.length - 1];
  const planLine = st.plan
    ? `<p class="mk-plan-note">${sym('label')}<span>${esc(g.ui.onPlan)} {{fms:plan.${st.plan}}}${st.plan === top ? '' : ' and up'}.</span></p>`
    : `<p class="mk-plan-note">${sym('label')}<span>${esc(st.planNote)}</span></p>`;
  const sources = x.sources && x.sources.length ? `
<section class="mk-sec mk-band-a mk-sources" id="sources" aria-labelledby="mkSrcH">
  <div class="mk-wrap mk-prose">
    <h2 class="mk-h3" id="mkSrcH">${esc(g.ui.sourcesH)}</h2>
    <p class="mk-small">${esc(g.ui.sourcesNote)}</p>
    <ul class="mk-list mk-src-list">
${x.sources.map((sc) => `      <li><a class="mk-link mk-link--inline" href="${esc(sc.url)}" rel="noopener noreferrer">${esc(sc.label)}</a> <span class="mk-small">(read ${longDay(sc.checked)})</span></li>`).join('\n')}
    </ul>
  </div>
</section>` : '';
  const toc = x.sections.map((s, i) => `<li><a href="#g-${i + 1}">${esc(s.h2)}</a></li>`).join('');
  return `${publicHead({ title: x.metaTitle, description: x.metaDescription, slug, ld })}
${genNote(GUIDES_COPY)}
${header(site, pages, 'guides')}
<main id="main" class="mk mk-guide ${x.hue}">
${articleHero(x.h1, x.sub, [{ name: g.ui.breadcrumbHome, href: 'start.html' }, { name: g.ui.breadcrumbGuides, href: 'guides.html' }, { name: x.label }],
  `\n    <p class="mk-small mk-updated">${esc(g.ui.updatedLabel)} <time datetime="${esc(g.updated)}">${longDay(g.updated)}</time></p>`)}
<section class="mk-sec mk-band-b mk-article" id="guide" aria-label="${esc(x.label)}">
  <div class="mk-wrap mk-article-grid">
    <nav class="mk-toc" aria-label="${esc(site.ui.labelNav)}">
      <p class="mk-toc-h">${esc(site.ui.labelNav)}</p>
      <ol>${toc}<li><a href="#studio">${esc(g.ui.inStudio)}</a></li></ol>
    </nav>
    <div class="mk-prose">
${x.sections.map(guideBlock).join('\n')}
    </div>
  </div>
</section>
<section class="mk-sec mk-band-a mk-studio" id="studio" aria-labelledby="mkStudioH">
  <div class="mk-wrap mk-prose">
    <h2 class="mk-h2" id="mkStudioH">${esc(g.ui.inStudio)}</h2>
${st.body.map((t) => `    <p class="mk-body">${esc(t)}</p>`).join('\n')}
    ${planLine}
    <div class="mk-cta-row">
${st.links.map((l) => `      <a class="mk-link" href="${esc(l.href)}">${esc(l.label)}${sym('arrow_forward')}</a>`).join('\n')}
    </div>
  </div>
</section>${sources}
<section class="mk-sec mk-band-b" id="related" aria-labelledby="mkRelH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkRelH">${esc(g.ui.relatedH)}</h2>
    <div class="mk-cards">
${x.related.map((rid) => guideCard(g, g.guides.find((y) => y.id === rid))).join('\n')}
    </div>
  </div>
</section>
${trialClose(g, g.ui.closeH, x.hue)}
</main>
${pageTail(site, pages)}`;
}

export function renderGuidesIndex({ site, pages, guides: g, versus: c }) {
  const ix = g.index;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'CollectionPage', name: ix.h1, description: ix.metaDescription, url: ORIGIN + '/guides', inLanguage: 'en-IN',
      hasPart: [...g.guides.map((y) => ({ '@type': y.kind === 'HowTo' ? 'HowTo' : 'Article', name: y.label, url: ORIGIN + '/' + slugOfFile(y.file) })),
                ...c.pages.map((p) => ({ '@type': 'HowTo', name: p.label, url: ORIGIN + '/' + slugOfFile(p.file) }))] },
    crumbsLd([{ name: g.ui.breadcrumbHome, slug: 'start' }, { name: g.ui.breadcrumbGuides, slug: 'guides' }]),
    softwareLd('guides')
  ];
  return `${publicHead({ title: ix.metaTitle, description: ix.metaDescription, slug: 'guides', ld })}
${genNote(GUIDES_COPY + ', ' + COMPARE_COPY)}
${header(site, pages, 'guides')}
<main id="main" class="mk mk-guides">
${articleHero(ix.h1, ix.sub, null)}
<section class="mk-sec mk-band-b" id="guides" aria-labelledby="mkGuidesH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkGuidesH">${esc(ix.guidesH)}</h2>
    <div class="mk-cards">
${g.guides.map((y) => guideCard(g, y)).join('\n')}
    </div>
  </div>
</section>
<section class="mk-sec mk-band-a" id="compare" aria-labelledby="mkCmpH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkCmpH">${esc(ix.compareH)}</h2>
    <p class="mk-body">${esc(ix.compareLede)}</p>
    <div class="mk-cards">
${c.pages.map((p) => `      <article class="mk-card">
        <span class="mk-card-icon">${sym('swap_horiz')}</span>
        <h3 class="mk-h3">${esc(p.label)}</h3>
        <p class="mk-card-p">${esc(p.card)}</p>
        <a class="mk-link" href="${esc(p.file)}">${esc(g.ui.compareRead)}<span class="mk-vh">: ${esc(p.label)}</span>${sym('arrow_forward')}</a>
      </article>`).join('\n')}
      <article class="mk-card">
        <span class="mk-card-icon">${sym('lock')}</span>
        <h3 class="mk-h3">${esc(ix.trustH)}</h3>
        <p class="mk-card-p">${esc(ix.trustText)}</p>
        <a class="mk-link" href="trust.html">${esc(ix.trustLink)}${sym('arrow_forward')}</a>
      </article>
    </div>
  </div>
</section>
${trialClose(g, ix.closeH)}
</main>
${pageTail(site, pages)}`;
}

/* A competitor fact is PRINTED only once a person has read it on the
   vendor's own page (status "read"), with that page linked and the day
   it was read beside it. Unread rows stay in marketing-compare.json for
   the owner to check and never reach a page (test:marketing). */
export const readRows = (p) => (p.rows || []).filter((r) => r.status === 'read' && /^https:\/\//.test(r.source || '') && /^\d{4}-\d\d-\d\d$/.test(r.checked || ''));

/* compare-<id>.html: since 26 Oct 2026 a SWITCHING GUIDE (the URL is
   kept). The shared sections are our own facts only (what imports, the
   import step by step, what exports, the cost); the read rows, if any,
   follow as a table. A HowTo in the JSON-LD, from the steps. */
export function renderCompare(id, { site, pages, guides: g, versus: c }) {
  const p = c.pages.find((y) => y.id === id);
  const slug = slugOfFile(p.file);
  const url = ORIGIN + '/' + slug;
  const secs = c.switching.sections;
  const steps = secs.find((x) => Array.isArray(x.steps)).steps;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'HowTo', name: p.h1, description: p.metaDescription, inLanguage: 'en-IN', dateModified: c.updated, url, image: ORIGIN + '/og.png',
      step: steps.map((st, i) => ({ '@type': 'HowToStep', position: i + 1, name: st.name, text: st.text })) },
    crumbsLd([{ name: g.ui.breadcrumbHome, slug: 'start' }, { name: g.index.compareH, slug: 'guides' }, { name: p.label, slug }]),
    softwareLd(slug)
  ];
  const read = readRows(p);
  const table = read.length ? `
<section class="mk-sec mk-band-a" id="table" aria-labelledby="mkTableH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkTableH">${esc(c.ui.tableH)}</h2>
    <div class="mk-table-wrap" role="region" aria-labelledby="mkTableH" tabindex="0">
      <table class="mk-table">
        <thead><tr><th scope="col">${esc(c.ui.featureCol)}</th><th scope="col">{{brand:name}}</th><th scope="col">${esc(p.name)}</th></tr></thead>
        <tbody>
${read.map((r) => `          <tr>
            <th scope="row">${esc(r.feature)}</th>
            <td data-col="{{brand:name}}">${esc(c.us[r.us])}</td>
            <td data-col="${esc(p.name)}">${esc(r.them)} <a class="mk-link mk-link--inline" href="${esc(r.source)}" rel="noopener noreferrer">${esc(c.ui.sourceLabel)}<span class="mk-vh"> for ${esc(p.name)}, ${esc(r.feature)}</span></a> <span class="mk-small">(${esc(c.ui.checkedLabel)} <time datetime="${esc(r.checked)}">${longDay(r.checked)}</time>)</span></td>
          </tr>`).join('\n')}
        </tbody>
      </table>
    </div>
    <p class="mk-small mk-checked" id="checked">${esc(c.ui.noteBefore)} ${esc(c.ui.noteAfter)} <a class="mk-link mk-link--inline" href="mailto:{{brand:email}}" translate="no">{{brand:email}}</a> ${esc(c.ui.noteEnd)}</p>
  </div>
</section>` : '';
  const toc = secs.map((x, i) => `<li><a href="#g-${i + 1}">${esc(x.h2)}</a></li>`).join('');
  return `${publicHead({ title: p.metaTitle, description: p.metaDescription, slug, ld })}
${genNote(COMPARE_COPY)}
${header(site, pages, 'compare')}
<main id="main" class="mk mk-guide mk-compare">
${articleHero(p.h1, p.sub, [{ name: g.ui.breadcrumbHome, href: 'start.html' }, { name: g.index.compareH, href: 'guides.html#compare' }, { name: p.label }],
  `\n    <p class="mk-small mk-updated">${esc(c.ui.updatedLabel)} <time datetime="${esc(c.updated)}">${longDay(c.updated)}</time></p>`)}
<section class="mk-sec mk-band-b mk-article" id="guide" aria-label="${esc(p.label)}">
  <div class="mk-wrap mk-article-grid">
    <nav class="mk-toc" aria-label="${esc(site.ui.labelNav)}">
      <p class="mk-toc-h">${esc(site.ui.labelNav)}</p>
      <ol>${toc}<li><a href="#also">${esc(c.ui.alsoH)}</a></li></ol>
    </nav>
    <div class="mk-prose">
${secs.map(guideBlock).join('\n')}
    </div>
  </div>
</section>${table}
<section class="mk-sec mk-band-a" id="also" aria-labelledby="mkAlsoH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="mkAlsoH">${esc(c.ui.alsoH)}</h2>
    <p class="mk-body">${esc(c.ui.alsoLede)}</p>
    <div class="mk-stages">
${c.also.map((x) => `      <article class="mk-card">
        <span class="mk-card-icon">${sym(x.sym)}</span>
        <h3 class="mk-h3">${esc(x.title)}</h3>
        <p class="mk-card-p">${esc(x.text)}</p>
      </article>`).join('\n')}
    </div>
    <p class="mk-cta-row mk-also-links"><a class="mk-link" href="trust.html">${esc(c.trust.label)}${sym('arrow_forward')}</a></p>
    <p class="mk-small mk-tm">${esc(c.ui.trademark)}</p>
  </div>
</section>
${trialClose(g, c.ui.ctaH)}
</main>
${pageTail(site, pages)}`;
}

export function renderTrust({ site, pages, guides: g, versus: c }) {
  const t = c.trust;
  const ld = [
    { '@context': 'https://schema.org', '@type': 'WebPage', name: t.h1, description: t.metaDescription, url: ORIGIN + '/trust', inLanguage: 'en-IN' },
    crumbsLd([{ name: g.ui.breadcrumbHome, slug: 'start' }, { name: t.label, slug: 'trust' }]),
    softwareLd('trust')
  ];
  const secs = t.sections.map((s, i) => `<section class="mk-sec ${i % 2 ? 'mk-band-a' : 'mk-band-b'}" id="${esc(s.id)}" aria-labelledby="mkT-${esc(s.id)}">
  <div class="mk-wrap mk-prose">
    <span class="mk-card-icon">${sym(s.sym)}</span>
    <h2 class="mk-h2" id="mkT-${esc(s.id)}">${esc(s.h2)}</h2>
${s.body.map((b) => `    <p class="mk-body">${esc(b)}</p>`).join('\n')}${s.check ? `
    <p class="mk-plan-note">${sym('check_circle')}<span>${esc(s.check)}</span></p>` : ''}${s.link ? `
    <a class="mk-link" href="${esc(s.link.href)}">${esc(s.link.label)}${sym('arrow_forward')}</a>` : ''}
  </div>
</section>`).join('\n');
  const toc = `\n    <nav class="mk-toc mk-toc--row" aria-label="${esc(site.ui.labelNav)}"><ol>${t.sections.map((s) => `<li><a href="#${esc(s.id)}">${esc(s.h2)}</a></li>`).join('')}</ol></nav>`;
  return `${publicHead({ title: t.metaTitle, description: t.metaDescription, slug: 'trust', ld })}
${genNote(COMPARE_COPY)}
${header(site, pages, 'trust')}
<main id="main" class="mk mk-trust">
${articleHero(t.h1, t.sub, null, toc)}
${secs}
${trialClose(g, t.ctaH)}
</main>
${pageTail(site, pages)}`;
}

/* ---- the e-mail capture (start.html and pricing.html) -----------------
   MARKUP ONLY: src/pages/marketing.js binds it (lane A). The contract:
   form[data-lead-form] > input[type=email][name=email][required] with a
   label, input[name=consent] beside the explicit sentence and a link to
   the privacy policy's leads paragraph (privacy.html#leads), a submit
   button, and p[data-lead-status][role=status]. method="dialog" and no
   action: with scripts off the form submits nowhere, so an address never
   lands in a URL or a server log (the contact form's rule).
   HIDDEN until `lead.live` is true in marketing-site.json. privacy.html
   (words in markup, owner-edited) does not yet describe a product-news
   list: its only leads paragraph says the old launch-offers form was
   removed. A form that collects an address under a notice saying no form
   exists ships a wrong privacy notice, so the markup is in place for the
   binding and stays out of sight until the owner has written that
   paragraph (docs/LAUNCH.md section 8, owner step). */
export function leadForm(lead, idp) {
  return `<section class="mk-sec mk-band-a mk-lead" id="news" aria-labelledby="${idp}LeadH"${lead.live === true ? '' : ' hidden'}>
  <div class="mk-wrap mk-lead-in">
    <div class="mk-lead-text">
      <h2 class="mk-h3" id="${idp}LeadH">${esc(lead.h)}</h2>
      <p class="mk-small">${esc(lead.lede)}</p>
    </div>
    <form class="mk-lead-form" data-lead-form method="dialog" aria-labelledby="${idp}LeadH">
      <label class="mk-lead-label" for="${idp}LeadEmail">${esc(lead.label)}</label>
      <div class="mk-lead-row">
        <input class="mk-lead-input" id="${idp}LeadEmail" name="email" type="email" autocomplete="email" inputmode="email" maxlength="200" required>
        <button class="mk-btn mk-btn--outline" type="submit">${esc(lead.submit)}</button>
      </div>
      <label class="mk-lead-consent"><input type="checkbox" name="consent" value="yes"><span>${esc(lead.consent)} <a class="mk-link mk-link--inline" href="privacy.html#leads">${esc(lead.privacy)}</a></span></label>
      <p class="mk-small mk-lead-status" data-lead-status role="status"></p>
    </form>
  </div>
</section>`;
}

export function buildAll(opts = {}) {
  const inputs = loadInputs(opts);
  const problems = [...validate(inputs), ...validateHome(inputs.home, inputs), ...validateCompany(inputs.company), ...validateGuides(inputs.guides, inputs.versus)];
  if (problems.length) throw new Error('marketing copy is not valid:\n  - ' + problems.join('\n  - '));
  const out = {};
  for (const id of Object.keys(inputs.site.stepCounts)) out[inputs.pages[id].file] = renderPage(id, inputs);
  out[PRICING_FILE] = renderPricing(inputs);
  out[HOME_FILE] = renderHome(inputs);
  out[CONTACT_FILE] = renderContact(inputs);
  out[ABOUT_FILE] = renderAbout(inputs);
  for (const x of inputs.guides.guides) out[x.file] = renderGuide(x.id, inputs);
  out[GUIDES_INDEX] = renderGuidesIndex(inputs);
  for (const p of inputs.versus.pages) out[p.file] = renderCompare(p.id, inputs);
  out[TRUST_FILE] = renderTrust(inputs);
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
