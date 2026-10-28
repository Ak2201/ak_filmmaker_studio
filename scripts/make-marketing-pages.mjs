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

/* ---- THE LAUNCH PASS (27 Oct 2026) -----------------------------------
   The free trial is retired for the public; while the launch offer runs
   the pages offer a paid pass. NOTHING ABOUT IT IS TYPED: the copy holds
   {price} and {length} tokens, written here as EMPTY runtime slots
   (<span data-pass-price>, <span data-pass-length>) that marketing.js
   fills from trial_offer().pass through src/lib/pass-offer.js. Every
   element that names the pass is [data-pass-only] and hidden in the
   markup, so a crawler, a link preview, verify and a reader with scripts
   off meet no price, no length, no clock and no count; beside it a
   [data-pass-off] variant says what is true with no pass (the yearly
   plans, never a free trial). marketing.js swaps the two while the
   server says the pass is open, and back when it closes. */
export const passSlots = (text) => esc(text)
  .replace(/\{price\}/g, '<span data-pass-price></span>')
  .replace(/\{length\}/g, '<span data-pass-length></span>');
/** The pass sentence beside the fallback: the fallback FIRST, the pass
 *  variant hidden and LAST (a reader that cuts at the hidden span, as the
 *  FAQ's JSON-LD would, keeps only what is true without the pass). */
export const passOr = (passHtml, offHtml) => `<span data-pass-off>${offHtml}</span><span data-pass-only hidden>${passHtml}</span>`;
/** A button label holding a slot: ONE flex item, so .mk-btn's gap does not
 *  open a second space between the words and the price. */
export const passBtn = (text) => `<span>${passSlots(text)}</span>`;

/* ---- OFFER TERMS (27 Oct 2026) ----------------------------------------
   Whether a purchase RENEWS is the owner's choice in the console, per
   product (billing_settings.pass_mode / plan_mode, schema §62), and it can
   change on any day without a rebuild. So the static page never says it
   either way: the copy holds tokens, written here as EMPTY runtime slots
   that marketing.js fills through src/lib/offer-terms.js (the ONLY wording
   of renewal terms) from trial_offer() — pass.mode and plan_mode:
     {planTerms}      a yearly plan's terms, as a sentence
     {passTerms}      the launch pass's terms, as a sentence
     {planRenewNote}  site.terms.renewNote, hidden, shown only on 'renew'
   An unknown mode leaves every slot empty and every renew-only line
   hidden, so the words around a token must be true in EITHER mode
   (test:marketing reads the static markup for renewal wording). A token
   inside a tag, the <title> or a <script> is a build error: an attribute
   or a JSON-LD answer cannot hold a slot. */
const TERMS_TOKEN = /\{(planTerms|passTerms|planRenewNote)\}/;
/** One runtime slot. `chip` is the compact form (no full stop). */
export const termsSlot = (product, chip = false) => `<span data-offer-terms data-offer-product="${product}"${chip ? ' data-offer-form="chip"' : ''}></span>`;
/** A chip and its own separator, hidden until the slot has words. */
export const termsChip = (product, cls, sep = true) => `<span class="${cls}" data-offer-wrap hidden>${sep ? '<span class="mk-pass-sep" aria-hidden="true"> &middot; </span>' : ''}${termsSlot(product, true)}</span>`;
/** Every offer-terms token in a built page, as its slot. */
export function termsSlots(html, site) {
  const note = `<span data-mode-answer="renew" data-offer-product="year" hidden>${esc(site.terms.renewNote)}</span>`;
  return html.replace(/<script\b[\s\S]*?<\/script>|<title>[\s\S]*?<\/title>|<[^>]*>|\{(planTerms|passTerms|planRenewNote)\}/g, (m, k) => {
    if (!k) {
      if (TERMS_TOKEN.test(m)) throw new Error('an offer-terms token inside a tag, a title or a script: ' + m.slice(0, 100));
      return m;
    }
    return k === 'planRenewNote' ? note : termsSlot(k === 'passTerms' ? 'pass' : 'year');
  });
}

/** THE LAUNCH BAND: one strip at the top of start, pricing and every
 *  product, guide, switching and trust page. Hidden in the markup and
 *  shown only while passState() says 'open'. The countdown digits are
 *  aria-hidden (they change every second); [data-pass-spoken] carries the
 *  same deadline to the minute for a screen reader, and nothing here is a
 *  live region except the one "has ended" line. */
export function passBand(site) {
  const p = site.pass;
  return `<aside class="mk-pass" id="mkPass" data-pass-band hidden aria-label="${esc(p.label)}">
  <div class="mk-wrap mk-pass-in">
    <p class="mk-pass-line" data-pass-live><strong class="mk-pass-tag">${esc(p.label)}</strong> <span class="mk-pass-what">${passSlots(p.line)}</span>${termsChip('pass', 'mk-pass-terms')}<span class="mk-pass-when" data-pass-when hidden><span class="mk-pass-sep" aria-hidden="true"> &middot; </span>${esc(p.ends)} <span class="mk-pass-timer" data-pass-timer aria-hidden="true"></span><span class="mk-vh" data-pass-spoken></span></span><span class="mk-pass-left" data-pass-left-wrap hidden><span class="mk-pass-sep" aria-hidden="true"> &middot; </span><span data-pass-left></span></span></p>
    <p class="mk-pass-ended" data-pass-ended role="status" hidden>${esc(p.ended)}</p>
    <a class="mk-btn mk-btn--primary mk-btn--sm mk-pass-cta" href="invite.html" data-open-signup data-pass-cta>${passBtn(p.cta)}</a>
  </div>
</aside>`;
}

/** THE CLOSING BAND every public page ends on (28 Oct 2026): one dark
 *  band, one heading, the action(s) under it, and an optional line. The
 *  buttons are passed in, because what a page may offer differs (the pass
 *  pair, or the neutral door and the plans). id="start" is the anchor the
 *  pages already link to. */
export function closeBand(h2, buttons, extra = '', hue = '', sub = '') {
  return `<section class="mk-sec mk-close${hue ? ' ' + hue : ''}" id="start" aria-labelledby="mkMidH" data-surface="dark">
  <div class="mk-wrap mk-center">
    <h2 class="mk-h2" id="mkMidH">${esc(h2)}</h2>${sub ? `
    <p class="mk-sub">${sub}</p>` : ''}
    <div class="mk-cta-row mk-cta-row--center">${buttons}
    </div>${extra}
  </div>
</section>`;
}

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
  /* the launch pass's copy: every figure is a runtime slot, never typed */
  const ps = site.pass || {};
  for (const k of ['label', 'line', 'ends', 'ended', 'cta', 'ctaFull', 'note']) if (!ps[k]) bad.push('marketing-site.json: pass.' + k + ' missing');
  if (!/\{price\}/.test(ps.cta || '') || !/\{price\}/.test(ps.line || '') || !/\{length\}/.test(ps.line || '')) bad.push('marketing-site.json: pass.line names {length} and {price}, pass.cta names {price}');
  if (!site.signup || !/\{price\}/.test(site.signup.headingPass || '') || !/\{length\}/.test(site.signup.offerPass || '')) bad.push('marketing-site.json: signup.headingPass names {price} and signup.offerPass names {length}');
  if (!site.terms || !site.terms.renewNote) bad.push('marketing-site.json: terms.renewNote missing (the renew-only line beside {planRenewNote})');
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
  for (const k of ['meta', 'hero', 'pass', 'plans', 'offer', 'compare', 'faq', 'close']) if (!compare[k]) w('copy block ' + k + ' missing');
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
  if (Array.isArray(faq)) for (const g of faq) for (const i of g.items || []) if (i.modes && (!i.aOnce || !i.aRenew || !/cancel anytime/i.test(i.aRenew))) w('faq "' + i.q + '": a mode answer needs aOnce and aRenew, and aRenew says "cancel anytime"');
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
  /* Guides, the switching guides and the trust page sit in the Product
     menu's last column, so the bar itself holds four things: Product,
     Pricing, Sign in, Get started (28 Oct 2026). */
  const cur = (k) => (current === k ? ' aria-current="page"' : '');
  const resources = `
          <div class="mk-mega-col mk-mega-col--more">
            <p class="mk-mega-h">${esc(u.resources)}</p>
            <ul>
              <li><a href="guides.html"${cur('guides')}>${sym('menu_book')}<span>${esc(u.guides)}</span></a></li>
              <li><a href="guides.html#compare"${cur('compare')}>${sym('swap_horiz')}<span>${esc(u.compare)}</span></a></li>
              <li><a href="trust.html"${cur('trust')}>${sym('lock')}<span>${esc(site.footer.trust)}</span></a></li>
            </ul>
          </div>`;
  return `<a class="mk-skip" href="#main">${esc(u.skip)}</a>
<div class="mk-sentinel" id="mkSentinel" aria-hidden="true"></div>
<header class="mk-top" id="mkTop" data-surface="dark">
  <div class="mk-top-in">
    <a class="mk-brand" href="start.html"><span class="mk-logo" aria-hidden="true">&#9654;</span>{{brand:name}}</a>
    <nav class="mk-nav" id="mkNav" aria-label="${esc(u.mainNav)}">
      <div class="mk-nav-item">
        <a class="mk-nav-link mk-nav-prod" id="mkProd" href="start.html#tools" aria-haspopup="true" aria-expanded="false" aria-controls="mkMega"><span>${esc(u.product)}</span>${sym('expand_more')}</a>
        <div class="mk-mega" id="mkMega" role="group" aria-label="${esc(u.productNav)}">${groups}${resources}
        </div>
      </div>
      <a class="mk-nav-link mk-nav-pricing" href="pricing.html"${cur('pricing')}>${esc(u.pricing)}</a>
      <a class="mk-nav-link mk-nav-login" href="invite.html" data-start-auth="google">${esc(u.login)}</a>
    </nav>
    <div class="mk-top-end">
      <a class="mk-nav-link mk-end-login" href="invite.html" data-start-auth="google">${esc(u.login)}</a>
      <a class="mk-btn mk-btn--primary mk-btn--sm" href="invite.html" data-open-signup>${esc(u.getStarted)}</a>
      <a class="mk-burger" id="mkBurger" href="#mkFoot" aria-controls="mkNav" aria-expanded="false" aria-label="${esc(u.menu)}">${sym('menu')}</a>
    </div>
  </div>
</header>`;
}

/* The footer: the brand and one line, then three columns (the tools, the
   company, the reading), then the legal row. Dark, like the header. */
function footer(site, pages) {
  const f = site.footer;
  const tools = navOrder(site).flatMap((s) => s.ids);
  const a = (href, t) => `<a href="${href}">${esc(t)}</a>`;
  const col = (h, items, cls = '') => `
      <div class="mk-foot-col${cls}">
        <p class="mk-foot-h">${esc(h)}</p>
        <ul>
${items.map((it) => `          <li>${it}</li>`).join('\n')}
        </ul>
      </div>`;
  return `<footer class="mk-foot" id="mkFoot" data-surface="dark">
  <div class="mk-wrap">
    <div class="mk-foot-grid">
      <div class="mk-foot-brand">
        <a class="mk-brand" href="start.html"><span class="mk-logo" aria-hidden="true">&#9654;</span>{{brand:name}}</a>
        <p class="mk-foot-note">${esc(f.note)}</p>
      </div>${col(f.productHeading, tools.map((id) => a(esc(pages[id].file), pages[id].label)), ' mk-foot-col--tools')}${col(f.legalHeading, [a('pricing.html', f.pricing), a('about.html', f.about), a('contact.html', f.contact), a('trust.html', f.trust)])}${col(f.readHeading, [a('guides.html', f.guides), a('guides.html#compare', f.compare), a('mailto:{{brand:email}}', f.support)])}
    </div>
    <div class="mk-foot-base">
      <p class="mk-foot-copy">${f.copyright}</p>
      <ul class="mk-foot-legal">
        <li>${a('privacy.html', f.privacy)}</li>
        <li>${a('terms.html', f.terms)}</li>
        <li>${a('refund.html', f.refund)}</li>
      </ul>
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
    <h2 class="mk-modal-h" id="mkSignupTitle">${passOr(passSlots(s.headingPass), esc(s.heading))}</h2>
    <p class="mk-modal-offer" id="mkOffer" data-off-text="${esc(s.offerOff)}" data-open-text="${esc(s.offerIn)}">${passOr(passSlots(s.offerPass), esc(s.offer))}</p>
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

  /* THE TEMPLATE (28 Oct 2026): one dark hero (the stage as a kicker, the
     headline, one sentence, one action, then the tool working at full
     width), three plain facts, How it works, three related tools, and
     one closing action. The player carries id="demo". */
  const hero = `<section class="mk-hero mk-hero--media ${stage.hue}" id="top" aria-labelledby="mkH1" data-surface="dark">
  <div class="mk-wrap mk-hero-in">
    <p class="mk-kicker">${sym(site.tools[id].icon)}<span>${esc(stage.label)}</span></p>
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

  const value = `<section class="mk-sec mk-band-a" id="value" aria-labelledby="mkValueH">
  <div class="mk-wrap grid gap-10 lg:grid-cols-12 lg:gap-16">
    <div class="mk-intro lg:col-span-5">
      <h2 class="mk-h2" id="mkValueH">${esc(p.value.h2)}</h2>
${p.value.body.map((t, i) => `      <p class="mk-body"${alt(p.value, 'body', i)}>${esc(t)}</p>`).join('\n')}
    </div>
    <ul class="mk-facts grid gap-4 sm:grid-cols-3 lg:col-span-7 lg:grid-cols-1" id="facts" aria-label="${esc(u.factsHeading)}">
${p.facts.map((f) => `      <li><b class="mk-fact-n"${alt(f, 'value')}>${esc(f.value)}</b><span class="mk-fact-l"${alt(f, 'label')}>${esc(f.label)}</span></li>`).join('\n')}
    </ul>
  </div>
</section>`;

  const how = `<section class="mk-sec mk-band-b" id="how" aria-labelledby="mkHowH">
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
    <div class="mk-cards grid gap-5 md:grid-cols-3">
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

  const mid = closeBand(p.midCta.h2, `
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-off>${esc(u.getStarted)}</a>
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-only hidden>${passBtn(site.pass.ctaFull)}</a>`, '', stage.hue);


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
<meta name="theme-color" content="#0d0c11">
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
${passBand(site)}
${hero}
${value}
${how}
${related}
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

/** A question whose true answer depends on the console's mode ("Is it a
 *  subscription?"): the NEUTRAL answer shown in the markup, the 'once' and
 *  'renew' answers hidden beside it, marketing.js showing the one the
 *  server names. Then the payment sentence, which is true in either. */
const modeAnswers = (it) => `<span data-mode-answer="neutral" data-offer-product="year">${esc(it.a)}</span><span data-mode-answer="once" data-offer-product="year" hidden>${esc(it.aOnce)}</span><span data-mode-answer="renew" data-offer-product="year" hidden>${esc(it.aRenew)}</span>${it.aPay ? ' ' + chargeVariants(esc(it.aPay), it.aPayUsd && esc(it.aPayUsd)) : ''}`;
/** An answer's extra sentence that is true only on auto-renew. */
const renewNote = (it) => (it.aRenewNote ? `<span data-mode-answer="renew" data-offer-product="year" hidden> ${esc(it.aRenewNote)}</span>` : '');

export function renderPricing({ site, pages, compare, faq }) {
  const c = compare;
  const u = site.ui;
  const PAID = M.PAID;
  const stamp = (kind, id) => '{{fms:' + kind + '.' + id + '}}';
  const buyText = (id) => esc(c.plans.buy).replace('{name}', stamp('plan', id));

  const hero = `<section class="mk-hero pr-hero" id="top" aria-labelledby="mkH1" data-surface="dark">
  <div class="mk-wrap mk-hero-in">
    <h1 class="mk-h1" id="mkH1">${esc(c.hero.h1)}</h1>
    <p class="mk-sub">${priceSpans(chargeVariants(esc(c.hero.sub), c.hero.subUsd && esc(c.hero.subUsd)))}</p>
  </div>
</section>`;

  const card = (id, i) => {
    const pick = id === c.plans.pick;
    const buy = `<a class="mk-btn mk-btn--primary mk-btn--block pr-buy" href="purchase.html?plan=${id}" data-start-buy="${id}" data-plan="${id}" data-off-text="${esc(c.plans.buySignIn)}" data-open-text="${buyText(id)}">${buyText(id)}</a>`;
    return `      <li class="pr-tier${pick ? ' pr-pick' : ''}" data-tier="${id}">${pick ? `<p class="pr-pick-flag">${esc(c.plans.pickFlag)}</p>` : ''}<span class="pr-tier-tag">${esc(c.plans.tags[id])}</span><strong class="pr-tier-name">${stamp('plan', id)}</strong><p class="pr-tier-line">${stamp('tier.line', id)}</p><b class="pr-price">${priceSpans(stamp('price', id))}</b><span class="pr-once">${esc(c.plans.once)}<span class="pr-keep"> &middot; ${priceSpans(esc(c.plans.keep).replace('{{day}}', '{{fms:price.' + id + '.day}}'))}</span></span><span class="pr-charge" data-price-charge="${id}" hidden></span>${termsChip('year', 'pr-charge pr-terms', false)}<ul class="pr-inc">${stamp('tier.list', id)}</ul>${buy}<a class="pr-alt" href="invite.html" data-start-auth="google" data-pass-only hidden data-open-text="${esc(c.plans.altOpen)}">${passSlots(c.plans.alt)}</a></li>`;
  };

  const plans = `<section class="mk-sec mk-band-b pr-plans" id="pricing" aria-labelledby="prPlansH">
  <div class="mk-wrap">
    <div class="pr-head">
      <h2 class="mk-h2" id="prPlansH">${esc(c.plans.h)}</h2>
      <p class="mk-body pr-lede">${esc(c.plans.lede)}</p>
    </div>

    <aside class="pr-pass" data-pass data-pass-only hidden aria-label="${esc(c.pass.label)}">
      <div class="pr-pass-text"><strong>${esc(c.pass.h)}</strong><span class="pr-pass-say">${passSlots(c.pass.body)}</span>${termsChip('pass', 'pr-pass-say pr-pass-terms', false)}</div>
      <a class="mk-btn mk-btn--outline" href="invite.html" data-open-signup data-pass-cta data-open-text="${esc(c.pass.ctaOpen)}">${passBtn(c.pass.cta)}</a>
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
    <details class="pr-more" id="compare-table">
      <summary class="pr-more-s"><span>${esc(c.compare.toggle)}</span>${sym('expand_more')}</summary>
    <table class="pr-table">
      <caption class="mk-vh">${esc(c.compare.caption)}</caption>
      <colgroup><col class="pr-col-what">${PAID.map(() => '<col>').join('')}</colgroup>
      <thead><tr><th scope="col">${esc(c.compare.what)}</th>${PAID.map((p) => `<th scope="col"><span class="pr-th-name">${stamp('plan', p)}</span><span class="pr-th-price">${priceSpans(stamp('price', p))}</span></th>`).join('')}</tr></thead>
${body}
    </table>
    </details>
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
        <summary><span>${esc(g.group)}</span><span class="mk-mark" aria-hidden="true"></span></summary>
        <dl class="pr-qa">
${g.items.map((it) => { const t = it.pass ? ' data-pass-faq' : (it.modes ? ' data-mode-faq' : ''); const a = it.pass ? passOr(passSlots(it.aPass), esc(it.a)) : it.modes ? modeAnswers(it) : chargeVariants(it.aHtml || esc(it.a), it.aUsd && esc(it.aUsd)); return `          <dt${t}>${esc(it.q)}</dt>\n          <dd${t}>${priceSpans(a)}${renewNote(it)}</dd>`; }).join('\n')}
        </dl>
      </details>`).join('\n')}
    </div>
  </div>
</section>`;

  const close = closeBand(c.close.h, `
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup>${esc(c.close.cta)}</a>`);

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
<meta name="theme-color" content="#0d0c11">
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
     adds the scheduled price rise and the buy hand-off; marketing.js fills the
     launch pass's slots from the server. -->
${header(site, pages, 'pricing')}
<main id="main" class="mk mk-pricing">
${passBand(site)}
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
  /* THE HOME PAGE (28 Oct 2026): a hero, four stage cards, three points
     on keeping your work, a plans teaser and one closing action. */
  if (!home.stagesH2) w('stagesH2 missing');
  if (!Array.isArray(home.stages) || home.stages.length !== 4) w('four stage cards');
  else home.stages.forEach((s, i) => {
    if (!s.id || !s.sym || !s.h2 || !s.body) w('stage ' + (i + 1) + ' needs id, sym, h2 and body');
    if (!s.cta || !pages[s.cta.page] || !s.cta.label) w('stage ' + (i + 1) + ': cta.page must be a product page id');
    if (!site.stages.some((g) => g.id === s.id)) w('stage ' + (i + 1) + ': id ' + s.id + ' is not a stage in marketing-site.json');
  });
  if (!home.own || !home.own.h2 || !Array.isArray(home.own.items) || home.own.items.length !== 3 || home.own.items.some((i) => !i.sym || !i.title || !i.text)) w('own needs h2 and three {sym, title, text}');
  if (!home.plans || !home.plans.h2 || !home.plans.pill || !/\{\{fms:price\.from\.day\}\}/.test(home.plans.teaser || '')) w('plans needs h2, pill and a teaser naming {{fms:price.from.day}}');
  if (!home.optOut || !home.optOut.label || !home.optOut.done) w('optOut needs label and done (privacy.html promises the control)');
  if (!home.closing || !home.closing.h2 || !home.closing.sub || !home.closing.cta) w('closing needs h2, sub and cta');
  /* the pass line in the plans teaser: no figure is typed, marketing.js
     fills its slots from trial_offer().pass and shows it only while it is open */
  const ps = home.pass;
  if (!ps || !ps.note || !ps.off || !ps.open || !home.hero.ctaPass) w('pass needs note, off and open, and hero.ctaPass');
  else if (/\d/.test(ps.note + ps.off + home.hero.ctaPass)) w('the pass copy types a number; every figure comes from the server');
  else if (!/\{price\}/.test(home.hero.ctaPass)) w('hero.ctaPass names the price as {price}');
  return bad;
}

/* The stage card's picture: its product page's own poster frame. */
export const HOME_HERO_CLIP = 'chain';

export function renderHome({ site, pages, home }) {
  const u = site.ui;
  const media = (name) => MEDIA_BASE + name;
  const hue = (id) => (site.stages.find((s) => s.id === id) || {}).hue || '';

  /* The first screen: one line, one sentence, one action, and the scene
     chain running end to end under it (the recorder's cross-page clip). */
  const hero = `<section class="mk-hero st-hero" id="top" aria-labelledby="mkH1" data-surface="dark">
  <div class="mk-wrap mk-hero-in">
    <h1 class="mk-h1" id="mkH1">${esc(home.hero.h1)}</h1>
    <p class="mk-sub"${alt(home.hero, 'sub')}>${priceSpans(esc(home.hero.sub))}</p>
    <div class="mk-cta-row">
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-off>${esc(home.hero.cta)}</a>
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-only hidden>${passBtn(home.hero.ctaPass)}</a>
    </div>
    <figure class="mk-player mk-hero-media st-hero-media" aria-label="${esc(home.hero.mediaLabel)}">
      <video controls muted loop playsinline preload="none" width="1280" height="720" poster="${media(HOME_HERO_CLIP + '.webp')}">
        <source src="${media(HOME_HERO_CLIP + '.webm')}" type="video/webm">
        ${esc(u.demoFallback)}
      </video>
    </figure>
    <p class="mk-caption">${esc(home.hero.note)}</p>
  </div>
</section>`;

  const card = (s) => {
    const h = hue(s.id);
    const page = pages[s.cta.page];
    return `      <article class="mk-card st-stage ${h}" id="stage-${esc(s.id)}" aria-labelledby="st-h-${esc(s.id)}">
        <img class="st-shot" src="${media(s.cta.page + '.webp')}" width="1280" height="720" alt="" loading="lazy" decoding="async">
        <div class="st-stage-in">
          <span class="mk-card-icon">${sym(s.sym)}</span>
          <h3 class="mk-h3" id="st-h-${esc(s.id)}">${esc(s.h2)}</h3>
          <p class="mk-card-p"${alt(s, 'body')}>${esc(s.body)}</p>
          <a class="mk-link" href="${esc(page.file)}">${esc(s.cta.label)}${sym('arrow_forward')}</a>
        </div>
      </article>`;
  };
  const stages = `<section class="mk-sec mk-band-a st-tools" id="tools" aria-labelledby="stToolsH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="stToolsH">${esc(home.stagesH2)}</h2>
    <div class="st-stages grid gap-5 sm:grid-cols-2 xl:grid-cols-4">
${home.stages.map(card).join('\n')}
    </div>
  </div>
</section>`;

  const own = `<section class="mk-sec mk-band-b st-own" id="local-first" aria-labelledby="stOwnH">
  <div class="mk-wrap">
    <h2 class="mk-h2" id="stOwnH">${esc(home.own.h2)}</h2>
    <ul class="st-points grid gap-5 md:grid-cols-3">
${home.own.items.map((it) => `      <li class="mk-point"><span class="mk-card-icon">${sym(it.sym)}</span><b class="mk-h3">${esc(it.title)}</b><span class="mk-card-p">${esc(it.text)}</span></li>`).join('\n')}
    </ul>
    <p class="mk-more"><a class="mk-link" href="trust.html">${esc(site.trustLink)}${sym('arrow_forward')}</a></p>
  </div>
</section>`;

  const plans = `<section class="mk-sec mk-band-a st-plans" id="plans" aria-labelledby="stPlansH">
  <div class="mk-wrap">
    <div class="st-plans-in grid gap-8 lg:grid-cols-12 lg:items-center">
      <div class="lg:col-span-8">
        <h2 class="mk-h2" id="stPlansH">${esc(home.plans.h2)}</h2>
        <p class="mk-body">${priceSpans(esc(home.plans.teaser))}</p>
        <p class="mk-small st-note" data-off-text="${esc(site.signup.offerOff)}" data-open-text="${esc(home.pass.open)}">${passOr(passSlots(home.pass.note), esc(home.pass.off))}</p>
      </div>
      <div class="st-plans-cta lg:col-span-4">
        <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(home.plans.pill)}</a>
      </div>
    </div>
  </div>
</section>`;

  const closing = closeBand(home.closing.h2, `
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-off>${esc(home.closing.cta)}</a>
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-only hidden>${passBtn(site.pass.cta)}</a>`,
  '', '', esc(home.closing.sub));

  const t = esc(home.meta.title), d = esc(home.meta.description);
  return `<!DOCTYPE html>
<html lang="en" data-volume="studio" data-fms-marketing>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover">
<title>${t}</title>
<meta name="description" content="${d}">
<link rel="canonical" href="https://{{brand:host}}/start">
<link rel="preload" as="image" href="${media(HOME_HERO_CLIP + '.webp')}" fetchpriority="high">
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
<meta name="theme-color" content="#0d0c11">
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
     (vite.config.js startFigures()), never typed. -->
${header(site, pages, 'home')}
<main id="main" class="mk st">
${passBand(site)}
${hero}
${stages}
${own}
${plans}
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
   the landing page's own: "Get started" is the same
   <a href="invite.html" data-open-signup> door start.html's is, and
   "See plans" goes to pricing.html. NO PERSONAL NAME: brand.json's
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
<meta name="theme-color" content="#0d0c11">
<link rel="icon" href="./icons/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="./icons/icon-192.png">
<link rel="manifest" href="./manifest.webmanifest">
${ldScripts([orgLd()])}
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
 *  and the plans. Not the launch pass: a neutral door is true in every
 *  state, whether or not the pass is open. */
function companyCta(company, h2) {
  const cta = company.cta;
  return closeBand(h2, `
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-open-text="${esc(cta.startOpen)}">${esc(cta.start)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(cta.plans)}</a>`);
}

function companyHero(company, h1, sub) {
  const cta = company.cta;
  return `<section class="mk-hero co-hero" id="top" aria-labelledby="mkH1" data-surface="dark">
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
/* The business behind the site, on about.html and contact.html. No person
   and no address: brand.json's seller is empty by the owner's decision. */
export const orgLd = () => ({
  '@context': 'https://schema.org', '@type': 'Organization', name: '{{brand:name}}', url: ORIGIN + '/start',
  logo: ORIGIN + '/icons/icon-512.png', email: '{{brand:email}}',
  contactPoint: { '@type': 'ContactPoint', contactType: 'support', email: '{{brand:email}}', url: ORIGIN + '/contact' }
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
<meta name="theme-color" content="#0d0c11">
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
     src/pages/marketing.js adds the header, the sign-up modal and the launch
     pass's runtime slots, and nothing else. -->`;

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
 *  launch pass ([data-pass-only]: hidden in the markup, shown only while
 *  the server says it is open, its figures runtime slots) and the plans,
 *  which are true in every state. */
function passClose(g, h2, hue = '') {
  return closeBand(h2, `
      <a class="mk-btn mk-btn--primary mk-btn--lg" href="invite.html" data-open-signup data-pass-only hidden>${passBtn(g.ui.ctaPass)}</a>
      <a class="mk-btn mk-btn--outline mk-btn--lg" href="pricing.html">${esc(g.ui.ctaPlans)}</a>`, `
    <p class="mk-small mk-close-note" data-pass-only hidden>${passSlots(g.ui.ctaPassNote)}</p>`, hue);
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
  if (!/\{price\}/.test(g.ui.ctaPass || '') || !g.ui.ctaPassNote || /\d/.test(g.ui.ctaPass + g.ui.ctaPassNote)) w('ui.ctaPass names the price as {price}, ui.ctaPassNote exists, and neither types a figure');
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
  return `<section class="mk-hero mk-hero--article" id="top" aria-labelledby="mkH1" data-surface="dark">
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
${passBand(site)}
${articleHero(x.h1, x.sub, [{ name: g.ui.breadcrumbHome, href: 'start.html' }, { name: g.ui.breadcrumbGuides, href: 'guides.html' }, { name: x.label }],
  `\n    <p class="mk-small mk-updated">${esc(g.ui.updatedLabel)} <time datetime="${esc(g.updated)}">${longDay(g.updated)}</time></p>`)}
<section class="mk-sec mk-band-a mk-article" id="guide" aria-label="${esc(x.label)}">
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
<section class="mk-sec mk-band-b mk-studio" id="studio" aria-labelledby="mkStudioH">
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
${passClose(g, g.ui.closeH, x.hue)}
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
${passBand(site)}
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
${passClose(g, ix.closeH)}
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
            <td data-col="${esc(p.name)}" data-them>${esc(r.them)} <a class="mk-link mk-link--inline" href="${esc(r.source)}" rel="noopener noreferrer">${esc(c.ui.sourceLabel)}<span class="mk-vh"> for ${esc(p.name)}, ${esc(r.feature)}</span></a> <span class="mk-small">(${esc(c.ui.checkedLabel)} <time datetime="${esc(r.checked)}">${longDay(r.checked)}</time>)</span></td>
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
${passBand(site)}
${articleHero(p.h1, p.sub, [{ name: g.ui.breadcrumbHome, href: 'start.html' }, { name: g.index.compareH, href: 'guides.html#compare' }, { name: p.label }],
  `\n    <p class="mk-small mk-updated">${esc(c.ui.updatedLabel)} <time datetime="${esc(c.updated)}">${longDay(c.updated)}</time></p>`)}
<section class="mk-sec mk-band-a mk-article" id="guide" aria-label="${esc(p.label)}">
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
${passClose(g, c.ui.ctaH)}
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
${passBand(site)}
${articleHero(t.h1, t.sub, null, toc)}
${secs}
${passClose(g, t.ctaH)}
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

/* ---- llms.txt (27 Oct 2026) -------------------------------------------
   The plain-text map of the public site for language-model crawlers
   (llmstxt.org): one line per public page, its own <title> and meta
   description, so it cannot drift from the pages. public/ is copied
   raw (no {{brand:*}} stamping), so the brand is resolved here from
   brand.json; a title that leans on a price stamp keeps only the words
   before it, because a price is the server's to say. */
export const LLMS_FILE = 'public/llms.txt';
export function renderLlms(files) {
  const brand = readJson('src/data/brand.json');
  const stamp = (t) => String(t).replace(/\{\{brand:(\w+)\}\}/g, (_, k) => brand[k] || '');
  const meta = (html, re) => { const m = html.match(re); return m ? stamp(m[1]).replace(/&amp;/g, '&').replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').trim() : ''; };
  const line = (file) => {
    const html = files[file] || fs.readFileSync(path.join(ROOT, file), 'utf8');
    let title = meta(html, /<title>([^<]*)<\/title>/);
    if (title.includes('{{')) title = title.split(/[:{]/)[0].trim();
    const desc = meta(html, /<meta name="description" content="([^"]*)"/).replace(/\s*\{\{[^}]*\}\}[^.]*\.?/g, '');
    return `- [${title}](https://${brand.host}/${file.replace(/\.html$/, '')}): ${desc}`;
  };
  const pub = Object.keys(files).filter((f) => f.endsWith('.html') && !LEGAL_FILES.includes(f) && !FRAME_FILES.includes(f))
    .sort((a, b) => (b === HOME_FILE) - (a === HOME_FILE));
  const guides = pub.filter((f) => /^guide/.test(f)), versus = pub.filter((f) => /^compare-/.test(f)), products = pub.filter((f) => /^product-/.test(f));
  const main = pub.filter((f) => !guides.includes(f) && !versus.includes(f) && !products.includes(f));
  const block = (h, list) => list.length ? `\n## ${h}\n\n${list.map(line).join('\n')}\n` : '';
  return `# ${brand.name}

> ${brand.tagline}. A browser-based studio for independent filmmakers: write the screenplay, plan the shoot, run the set. Work is saved in the browser, with optional sign-in sync and Google Drive backup. Plans are bought one year at a time; each plan's price and terms are on the pricing page.

This file is GENERATED by scripts/make-marketing-pages.mjs from the public pages' own titles and descriptions.
${block('Site', main)}${block('Product', products)}${block('Guides', guides)}${block('Switching', versus)}${block('Policies', LEGAL_FILES)}`;
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
  for (const f of Object.keys(out)) out[f] = termsSlots(out[f], inputs.site);
  /* The fixture swaps the page list, so the frame it would stamp is not the
     one on disk; the legal pages are built from the real copy only. */
  if (!opts.fixture) {
    for (const f of LEGAL_FILES) out[f] = renderLegal(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), inputs);
    for (const f of FRAME_FILES) out[f] = renderFrame(f, fs.readFileSync(path.join(ROOT, f), 'utf8'), inputs);
    out[LLMS_FILE] = renderLlms(out);
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
