import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { VitePWA } from 'vite-plugin-pwa';
import { sampleFigures } from './src/lib/sample-figures.js';
import { PLAN_ORDER, planName, LIST_PRICE, EDU_PRICE, inr } from './src/lib/plans.js';
import { loadMatrixModule } from './scripts/make-plan-features-sql.mjs';

/* ============================================================
   THE ICON FONT, DERIVED AND SELF-HOSTED — one subset for every page
   ------------------------------------------------------------
   Every map in the app (the launcher, the shell's rail, phase menu
   and breadcrumb, the command palette) draws its marks through
   iconSpan() in src/ui/icon.js as Material Symbols LIGATURES: the
   span's text is the symbol's name and the font turns it into a
   glyph. So a page that does not load the font prints the names —
   "home", "auto_stories" — as words (base.css hides them until
   chrome.js sees the face load; see `sym-ready`).

   The face is injected here, at build and in dev, into every page
   that renders the app (#app), and the subset is read off
   navigation.json and section-icons.json — the same files the marks
   come from. Add a module with a new `sym` and the font gains it with
   no other edit.

   SELF-HOSTED SINCE 14 OCT 2026 (owner: no Google Fonts host). The
   cut is scripts/lib/icon-font.mjs — HarfBuzz, from the fontsource
   package — and it is STRICTER than the API it replaces: Google
   answered a misspelt name with 200 and the whole 1.2MB face, so the
   only tell was the size; here a name that does not shape to one
   glyph FAILS THE BUILD and names the word. ~11KB, emitted as one
   hashed asset, preloaded, declared in an inline @font-face.

   `font-display: block`, as before: a mark is decorative (aria-hidden
   beside its own label), and painting its NAME for a frame is worse
   than painting nothing.
   ============================================================ */
function materialSymbols() {
  /* The site gate's build flag, stamped into every app page so the two
     harnesses can tell which build they were handed: `npm run verify`
     refuses a gated dist (it loads pages signed out), prove-gate.mjs
     refuses an open one. See src/lib/sitegate.js. */
  const siteGate = String(process.env.VITE_SITE_GATE || 'invite').toLowerCase() === 'off' ? 'off' : 'invite';
  const nav = JSON.parse(readFileSync(resolve(__dirname, 'src/data/navigation.json'), 'utf8'));
  const names = new Set();
  JSON.stringify(nav, (k, v) => { if (k === 'sym' && typeof v === 'string' && v) names.add(v); return v; });
  /* the section menu's own marks (src/ui/section-menu.js) are listed in
     section-icons.json, which this reads the way it reads the nav */
  const sec = JSON.parse(readFileSync(resolve(__dirname, 'src/data/section-icons.json'), 'utf8'));
  for (const n of sec.icons || []) names.add(n);
  JSON.stringify(sec.pages || {}, (k, v) => { if (k === 'icon' && typeof v === 'string' && v) names.add(v); return v; });
  const list = [...names].sort();
  const bad = list.filter((n) => !/^[a-z0-9_]+$/.test(n));
  if (bad.length) throw new Error('navigation.json / section-icons.json: not a Material Symbols name: ' + bad.join(', '));
  let font = null;   // { file, bytes }
  let command = 'build';
  const ready = (async () => {
    const { buildIconFont } = await import('./scripts/lib/icon-font.mjs');
    const { woff } = await buildIconFont(list);
    const hash = createHash('sha256').update(woff).digest('hex').slice(0, 10);
    font = { file: 'assets/material-symbols-' + hash + '.woff', bytes: Buffer.from(woff) };
    return font;
  })();
  /* The app pages only: the legal documents and the redirect stubs draw
     no marks, and the extension panel never had the font. */
  const isAppPage = (html) => html.includes('id="app"') && !html.includes('/src/pages/panel.js');
  return {
    name: 'fms-material-symbols',
    configResolved(c) { command = c.command; },
    async buildStart() {
      await ready;
      if (command !== 'build') return;
      this.emitFile({ type: 'asset', fileName: font.file, source: font.bytes });
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const f = await ready;
        if (!req.url || !req.url.endsWith('/' + f.file)) return next();
        res.setHeader('Content-Type', 'font/woff');
        res.end(f.bytes);
      });
    },
    async transformIndexHtml(html) {
      /* The public marketing pages (product-*.html, pricing.html) draw
         marks too but are no app pages: they carry data-fms-marketing, get
         the face and NOT the site-gate meta (they load no gate). */
      const marketing = html.includes('data-fms-marketing');
      if (!isAppPage(html) && !marketing) return;
      const f = await ready;
      return [
        ...(marketing ? [] : [{ tag: 'meta', attrs: { name: 'fms-site-gate', content: siteGate }, injectTo: 'head' }]),
        { tag: 'link', attrs: { rel: 'preload', href: f.file, as: 'font', type: 'font/woff', crossorigin: '' }, injectTo: 'head' },
        { tag: 'style', attrs: { 'data-fms-icons': '' }, injectTo: 'head',
          children: "@font-face{font-family:'Material Symbols Rounded';font-style:normal;font-weight:400;font-display:block;src:url(" + f.file + ") format('woff')}" }
      ];
    }
  };
}

/* ============================================================
   FONT PRELOADS — the three faces every page paints above the fold
   ------------------------------------------------------------
   src/styles/fonts.css declares the faces; a declared face is only
   fetched once layout finds text in it, which is AFTER the CSS has
   downloaded and parsed. For the three that every page paints at once —
   Inter (body), Space Grotesk (headings), JetBrains Mono (labels and
   figures), latin subset — that is a visible swap on every load, so
   they are preloaded. Nothing else is: Courier Prime, Playfair italic
   and the Tamil subsets stay on demand.

   The URLs are hashed, so this reads them out of the bundle at the end
   of the build rather than naming them. Dev serves the CSS unhashed
   and gets no preload, which is fine.
   ============================================================ */
const PRELOAD_FACES = ['inter-latin-wght-normal', 'space-grotesk-latin-wght-normal', 'jetbrains-mono-latin-wght-normal'];
function fontPreloads() {
  return {
    name: 'fms-font-preloads',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx || !ctx.bundle) return;
        const where = String(ctx.path || ctx.filename || '');
        if (/panel\.html$/.test(where)) return;
        if (!html.includes('id="app"') && !/(^|\/)(start|pricing|product-[a-z-]+)\.html$/.test(where)) return;
        const tags = [];
        for (const face of PRELOAD_FACES) {
          const a = Object.values(ctx.bundle).find((f) => f.type === 'asset' && /\.woff2$/.test(f.fileName)
            && [...(f.originalFileNames || []), f.name || ''].some((n) => n.includes(face)));
          if (!a) throw new Error('fms-font-preloads: no bundled asset for ' + face + ' — did fonts.css stop declaring it?');
          tags.push({ tag: 'link', attrs: { rel: 'preload', href: a.fileName, as: 'font', type: 'font/woff2', crossorigin: '' }, injectTo: 'head' });
        }
        return tags;
      }
    }
  };
}

/* ============================================================
   THE STEP INDEX, DERIVED — number and title of every blueprint
   step, as a virtual module, for the guide drawer's pill
   ------------------------------------------------------------
   src/ui/blueprint-drawer.js draws a "Blueprint step 16 · Title" pill
   on every module page a step's tools name. To label it, the pill
   needs each step's `num` and `title` and nothing else; to DRAW the
   step it needs the whole record, with its blocks and fields. Those
   used to come from one import of both blueprints' JSON (~170 KB raw,
   ~50 KB gzipped) on every one of those pages, to print a dozen words.

   This plugin derives the dozen words at build time, from the same
   three files, as `virtual:fms-step-index` — so there is no fourth
   copy of a title anywhere on disk to drift (CLAUDE.md rule 2), and
   `npm run extract` regenerating steps.feature.json regenerates this
   with it. The drawer imports the index for the pill and reaches the
   full records through `import()` when a pill is clicked.

   The ORDER and the NAMESPACES are the drawer's: the feature blueprint
   is vol1, vol2 (`feature`), production, post (`production`); the
   short film is its `steps` (`short`). Keep them in step with
   BLUEPRINTS in src/ui/blueprint-drawer-body.js.
   ============================================================ */
function stepIndex() {
  const VIRTUAL = 'virtual:fms-step-index';
  const RESOLVED = '\0' + VIRTUAL;
  const FILES = ['steps.feature.json', 'steps.production.json', 'steps.short.json']
    .map((f) => resolve(__dirname, 'src/data', f));
  const plain = (step) => String(step.titlePlain || String(step.title || '').replace(/<[^>]+>/g, '')).trim();
  const light = (ns) => (step) => ({ ns, step: { id: step.id, num: step.num, title: plain(step) } });
  return {
    name: 'fms-step-index',
    resolveId(id) { return id === VIRTUAL ? RESOLVED : null; },
    load(id) {
      if (id !== RESOLVED) return null;
      for (const f of FILES) this.addWatchFile(f);
      const [feature, production, short] = FILES.map((f) => JSON.parse(readFileSync(f, 'utf8')));
      const index = {
        feature: [
          ...(feature.vol1 || []).map(light('feature')),
          ...(feature.vol2 || []).map(light('feature')),
          ...(production.production || []).map(light('production')),
          ...(production.post || []).map(light('production'))
        ],
        short: (short.steps || []).map(light('short'))
      };
      return 'export default ' + JSON.stringify(index) + ';';
    }
  };
}

/* ============================================================
   THE PLAN FIGURES, SHARED (start.html's cards, pricing.html's cards)
   ------------------------------------------------------------
   One derivation of the tier lines, the card bullets and the matrix
   rows, filled into `values` as tier.adds.ID / tier.line.ID /
   tier.list.ID / matrix.rows. `cls` is the page's class prefix for the
   list's own marks ('st' on the landing page, 'pr' on pricing.html).
   A second copy of this would be the drift the matrix exists to end.
   ============================================================ */
async function planFigures(values, cls, fail) {
  const PAID = PLAN_ORDER.filter((id) => id !== 'free');
  /* WHAT EACH PLAN INCLUDES, from src/data/plan-matrix.json through
     src/lib/plan-matrix.js — the same functions schema section 35 is
     generated with, so the page, the database and the cards agree.
     The table has a row per feature, grouped by the plan that first
     includes it; each tier's line is that plan's addedBy(). Nothing
     here names a feature. */
  const M = await loadMatrixModule();
  const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const list = (xs) => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : (xs[0] || '');
  if (M.PAID.join() !== PAID.join()) fail('plan-matrix.json plans [' + M.PAID + '] are not the paid PLAN_ORDER [' + PAID + ']');
  for (const [i, id] of PAID.entries()) {
    const adds = M.addedBy(id).map(M.labelOf);
    if (!adds.length) fail('plan-matrix.json: ' + id + ' adds nothing to the plan below it');
    const line = (M.MATRIX.lines && M.MATRIX.lines[id]) || '';
    values['tier.adds.' + id] = esc((line ? line + ' ' : '') + (i === 0 ? '' : 'Everything in ' + planName(PAID[i - 1]) + ', plus ') + list(adds) + '.');
    /* The card's own bullets: the plan's line, then what it ADDS
       (the first six, the rest counted and left to the table). */
    values['tier.line.' + id] = esc(line);
    const own = M.addedBy(id);
    const pick = ((M.MATRIX.card && M.MATRIX.card[id]) || []).map((k) => {
      const row = own.find((r) => r.key === k);
      if (!row) fail('plan-matrix.json card.' + id + ' names "' + k + '", which ' + id + ' does not add.');
      return M.labelOf(row);
    });
    const shown = pick.length ? pick : adds.slice(0, 6);
    values['tier.list.' + id] = (i === 0 ? '' : '<li class="' + cls + '-inc-all">Everything in ' + esc(planName(PAID[i - 1])) + '</li>')
      + shown.map((t) => '<li>' + esc(t) + '</li>').join('')
      + (adds.length > shown.length ? '<li class="' + cls + '-inc-more">+ ' + (adds.length - shown.length) + ' more in the comparison</li>' : '');
  }
  const cell = (yes) => yes ? '<td class="' + cls + '-yes"><span aria-hidden="true">\u2713</span><span class="' + cls + '-vh">Included</span></td>'
                            : '<td class="' + cls + '-no"><span aria-hidden="true">\u2014</span><span class="' + cls + '-vh">Not included</span></td>';
  values['matrix.rows'] = PAID.map((id) => M.addedBy(id).map((row) =>
    '<tr><th scope="row">' + esc(M.labelOf(row)) + '</th>' + PAID.map((p) => cell(M.planHas(row, p))).join('') + '</tr>').join('')).join('');
  return { PAID, M, esc };
}

/* ============================================================
   START.HTML'S FIGURES AND TIER NAMES, STAMPED AT BUILD TIME
   ------------------------------------------------------------
   start.html keeps its words in the MARKUP (a crawler, a link preview
   and a reader with scripts off get the whole page), which used to
   mean the Dragon figures and the tier names were typed there by hand
   beside the data they describe. Now the markup carries placeholders,
   `{{fms:dragon.scenes}}` and `{{fms:plan.starter}}`, and this plugin
   fills them from the SAME functions the app uses:

   - dragon.*  sampleFigures() in src/lib/sample-figures.js over
               src/data/sample.dragon.json — the derivation the hub's
               first-run panel quotes. `:word` spells a small number.
   - plan.*    planName() over PLAN_ORDER in src/lib/plans.js, which
               billing.js re-exports. Prices are never stamped: they
               live in the server's plans table only.

   It FAILS THE BUILD, and the dev server's response, when a
   placeholder names nothing, when one is left unreplaced, or when the
   `li[data-tier]` list in the pricing section is not exactly
   PLAN_ORDER, in order — so a renamed id, a removed tier or a new one
   without its prose is a build error rather than a page that drifts.
   transformIndexHtml runs in `vite` (dev) as well as `vite build`.
   ============================================================ */
function startFigures() {
  const SAMPLE = resolve(__dirname, 'src/data/sample.dragon.json');
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const fail = (msg) => { throw new Error('start.html: ' + msg); };
  const json = (p) => JSON.parse(readFileSync(resolve(__dirname, 'src/data/' + p), 'utf8'));

  /* The eleven steps of the Short Blueprint are the landing page's
     primary section — they ARE the beginner curriculum — so the list
     is DERIVED from steps.short.json rather than typed beside it
     (invariant 2: a hand-written copy of a list on a sales page is
     the first thing to drift from the product). Title, pacing and the
     opening of the deck all come from the step itself; nothing here
     is editorial. Edit the blueprint and the landing page follows. */
  const sentences = (text, min) => {
    const plain = String(text || '').replace(/<[^>]+>/g, '');
    const parts = plain.split(/(?<=[.?!])\s+/);
    let out = '';
    for (const s of parts) { out += (out ? ' ' : '') + s; if (out.length >= min) break; }
    return out;
  };
  function shortList(steps) {
    return steps.map((s, i) => {
      const n = String(i + 1).padStart(2, '0');
      const title = String(s.titlePlain || '').replace(/\.$/, '');
      const time = String((s.badge && s.badge.time) || s.time || '').replace(/^~\s*/, '').toLowerCase();
      return '<li class="st-short-step" data-short-step="' + s.id + '">'
           + '<p class="st-sn" aria-hidden="true">' + n + '</p>'
           + '<h3 class="st-h3"><span class="st-vh">Step ' + n + '. </span>' + title + '</h3>'
           + '<p class="st-short-say">' + sentences(s.deck, 64) + '</p>'
           + (time ? '<p class="st-chip">' + time + '</p>' : '')
           + '</li>';
    }).join('');
  }

  return {
    name: 'fms-start-figures',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const file = String((ctx && (ctx.filename || ctx.path)) || '');
        if (!/(^|[\\/])start\.html$/.test(file)) return;
        const fig = sampleFigures(JSON.parse(readFileSync(SAMPLE, 'utf8')));
        const values = { ...Object.fromEntries(Object.entries(fig).map(([k, v]) => ['dragon.' + k, v])),
                         ...Object.fromEntries(PLAN_ORDER.map((id) => ['plan.' + id, planName(id)])) };

        /* THE LEARNING FIGURES. Every one is a COUNT of rows in the
           data the app itself renders, read here so that adding a
           step, a case study or a glossary term moves the sales page
           with it. Typing "11 steps" into the markup is how a page
           ends up advertising "32 questions" for a blueprint that has
           24 — which navigation.json did. */
        const SHORT = json('steps.short.json');
        const FEATURE = json('steps.feature.json');
        const STUDIES = json('studies.json');
        const GLOSSARY = json('glossary.json');
        const FILMS = json('films.json');
        const shortSteps = (SHORT.steps || []);
        values['short.steps'] = shortSteps.length;
        values['feature.steps'] = Object.values(FEATURE).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
        values['studies.count'] = (STUDIES.films || []).length;
        values['glossary.count'] = (GLOSSARY.terms || []).length;
        values['films.count'] = (Array.isArray(FILMS) ? FILMS : []).length;
        for (const k of ['short.steps', 'feature.steps', 'studies.count', 'glossary.count', 'films.count']) {
          if (!values[k]) fail(k + ' counted 0 — the data file it reads moved or changed shape.');
        }
        values['short.list'] = shortList(shortSteps);

        /* List prices (₹, pay once), from src/lib/plans.js — the SAME
           constant start.js reads at runtime to print the current price
           beside a scheduled one. It used to be declared here, which
           meant the page's two prices came from two places; the client
           then had to parse "₹799" back out of the DOM to show a rise,
           and that is how a wrong price ships. The server's plans table
           is still what the checkout charges, and the page says
           "confirmed at checkout". A scheduled rise is NEVER stamped: it
           arrives from price_notice() at runtime, because a figure baked
           into the HTML is a claim the server can contradict an hour
           later. */
        for (const id of PLAN_ORDER) values['price.' + id] = inr(LIST_PRICE[id]);
        /* The education track's display figures (EDU_PRICE, plans.js):
           price.student / price.cohort / price.edu. Nothing charges them. */
        for (const [k, v] of Object.entries(EDU_PRICE)) values['price.' + k] = inr(v);
        /* NO FREE TIER (owner, 11 Oct 2026): 'free' is the "no plan"
           state, never a column or a card. The trial is not a plan. */
        const PAID = PLAN_ORDER.filter((id) => id !== 'free');
        await planFigures(values, 'st', fail);
        /* The pricing list moved to pricing.html (Oct 2026). When a page
           that still carries one is built, it is checked as before. */
        if (html.includes('data-tier=')) {
          const tiers = [...html.matchAll(/<li\b[^>]*\bdata-tier="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
          const ids = tiers.map((m) => m[1]);
          if (ids.join(',') !== PAID.join(',')) {
            fail('the pricing list\'s data-tier ids [' + ids.join(', ') + '] are not the PAID tiers of PLAN_ORDER ['
                 + PAID.join(', ') + '] from src/lib/plans.js — add, remove or reorder the <li>s to match. There is no free tier.');
          }
          if ((html.replace(/<!--[\s\S]*?-->/g, '').match(/<li\b[^>]*\bdata-trial\b/g) || []).length !== 1) {
            fail('the pricing list needs exactly one <li data-trial> — the free TRIAL is the first card, not a free plan.');
          }
          for (const [, id, body] of tiers) {
            if (!body.includes('{{fms:plan.' + id + '}}')) fail('<li data-tier="' + id + '"> does not print its name as {{fms:plan.' + id + '}}.');
          }
        }
        if (!html.includes('{{fms:dragon.')) fail('no {{fms:dragon.*}} placeholder — the sample figures must be derived, not typed.');

        /* NO BARE RUPEE SIGN IN THE SOURCE. Every ₹ on this page must
           arrive from a {{fms:price.*}} expansion, which reads
           LIST_PRICE in src/lib/plans.js — the same constant the
           client reads to print a scheduled rise beside the current
           figure. A price typed into the markup is a claim the server
           can contradict an hour later, and the launch-offer band is
           exactly where somebody would type one. Checked on the
           SOURCE, before expansion, so the expansions themselves are
           the only ₹ that can survive. */
        if (html.includes('₹')) {
          const at = html.indexOf('₹');
          fail('a bare ₹ in the markup, near "' + html.slice(Math.max(0, at - 50), at + 20).replace(/\s+/g, ' ').trim()
               + '". Prices come from {{fms:price.<tier>}} (src/lib/plans.js), never typed; a scheduled rise arrives at runtime from price_notice().');
        }

        values.jsonld = '';
        const BR = JSON.parse(readFileSync(resolve(__dirname, 'src/data/brand.json'), 'utf8'));
        const ORIGIN = 'https://' + BR.host;
        /* The home page carries no FAQ and prints no price (the plans and the
           FAQ moved to pricing.html), so it declares only what it shows: the
           organization and the product, with no Offer and no FAQPage. The
           pricing page's own plugin block declares those beside the prices. */
        const ld = [
          { '@context': 'https://schema.org', '@type': 'Organization', name: BR.name, url: ORIGIN + '/', logo: ORIGIN + '/icons/icon-512.png' },
          { '@context': 'https://schema.org', '@type': 'Product', name: BR.name, description: BR.tagline, image: ORIGIN + '/og.png',
            brand: { '@type': 'Brand', name: BR.name } }
        ];
        values.jsonld = ld.map((o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');

        const out = html.replace(/\{\{fms:([a-zA-Z.]+)(?::(word))?\}\}/g, (all, key, fmt) => {
          if (!(key in values)) fail('unknown placeholder ' + all + '. Known: ' + Object.keys(values).join(', '));
          const v = values[key];
          return fmt === 'word' ? (WORDS[v] || String(v)) : String(v);
        });
        const left = out.match(/\{\{[^}]*\}\}/);
        if (left) fail('placeholder left unreplaced: ' + left[0]);
        return out;
      }
    }
  };
}

/* ============================================================
   THE MARKETING PAGES' FIGURES (product-*.html, pricing.html)
   ------------------------------------------------------------
   Same idea as startFigures() above and the same sources: a page keeps
   its words in the markup, and any figure in it is an `{{fms:...}}`
   placeholder filled here from the data the app itself renders, never
   typed. Product pages use only the sample film's figures (dragon.*),
   the tier names (plan.*), the list prices (price.*) and the blueprint
   counts, so that is the set stamped. An unknown placeholder or one left
   unreplaced FAILS THE BUILD (and the dev server's response).

   pricing.html will need the tier lists and the matrix rows startFigures()
   builds inline (tier.*, matrix.rows): when it lands, factor those out of
   startFigures() into a shared function and add them here, rather than
   typing a second copy of that derivation.
   ============================================================ */
const MARKETING_PAGE = /(^|[\\/])(pricing|product-[a-z-]+)\.html$/;
function marketingFigures() {
  const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'];
  const json = (p) => JSON.parse(readFileSync(resolve(__dirname, 'src/data/' + p), 'utf8'));
  return {
    name: 'fms-marketing-figures',
    transformIndexHtml: {
      order: 'pre',
      async handler(html, ctx) {
        const file = String((ctx && (ctx.filename || ctx.path)) || '');
        if (!MARKETING_PAGE.test(file)) return;
        const fail = (msg) => { throw new Error(file.split(/[\\/]/).pop() + ': ' + msg); };
        const fig = sampleFigures(json('sample.dragon.json'));
        const values = { ...Object.fromEntries(Object.entries(fig).map(([k, v]) => ['dragon.' + k, v])),
                         ...Object.fromEntries(PLAN_ORDER.map((id) => ['plan.' + id, planName(id)])) };
        for (const id of PLAN_ORDER) values['price.' + id] = inr(LIST_PRICE[id]);
        for (const [k, v] of Object.entries(EDU_PRICE)) values['price.' + k] = inr(v);
        const FEATURE = json('steps.feature.json');
        values['short.steps'] = (json('steps.short.json').steps || []).length;
        values['feature.steps'] = Object.values(FEATURE).reduce((n, v) => n + (Array.isArray(v) ? v.length : 0), 0);
        values['studies.count'] = (json('studies.json').films || []).length;
        values['glossary.count'] = (json('glossary.json').terms || []).length;
        for (const k of ['short.steps', 'feature.steps', 'studies.count', 'glossary.count']) {
          if (!values[k]) fail(k + ' counted 0: the data file it reads moved or changed shape.');
        }
        /* A price is never typed into the markup (see startFigures). */
        if (html.includes('₹')) fail('a bare rupee sign in the markup; prices come from {{fms:price.<tier>}}.');

        /* PRICING.HTML ONLY: the plan cards. The tier lines and card bullets
           are the SAME derivation start.html used (planFigures, above); the
           comparison table is written by scripts/make-marketing-pages.mjs
           from the same matrix and checked for drift by test:marketing. */
        if (/(^|[\\/])pricing\.html$/.test(file)) {
          const PAID = PLAN_ORDER.filter((id) => id !== 'free');
          await planFigures(values, 'pr', fail);
          const tiers = [...html.matchAll(/<li\b[^>]*\bdata-tier="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)];
          const ids = tiers.map((m) => m[1]);
          if (ids.join(',') !== PAID.join(',')) {
            fail('the plan cards\' data-tier ids [' + ids.join(', ') + '] are not the PAID tiers of PLAN_ORDER [' + PAID.join(', ')
                 + '] from src/lib/plans.js. There is no free tier.');
          }
          if ((html.replace(/<!--[\s\S]*?-->/g, '').match(/<aside\b[^>]*\sdata-trial[\s>]/g) || []).length !== 1) {
            fail('the pricing page needs exactly one <aside data-trial>: the free TRIAL is a strip above the cards, not a free plan.');
          }
          for (const [, id, body] of tiers) {
            if (!body.includes('{{fms:plan.' + id + '}}')) fail('<li data-tier="' + id + '"> does not print its name as {{fms:plan.' + id + '}}.');
          }
          /* JSON-LD: a Product with one Offer per plan (INR, the same LIST_PRICE
             as the visible prices) and the FAQPage, built from the static
             accordion markup so it cannot drift from it. */
          const plain = (t) => t.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();
          const faq = [...html.matchAll(/<dt>([\s\S]*?)<\/dt>\s*<dd>([\s\S]*?)<\/dd>/g)]
            .map((m) => ({ '@type': 'Question', name: plain(m[1]), acceptedAnswer: { '@type': 'Answer', text: plain(m[2]) } }));
          if (!faq.length) fail('no <dt>/<dd> FAQ markup found to build FAQPage JSON-LD from.');
          const BR = json('brand.json');
          const ORIGIN = 'https://' + BR.host;
          const ld = [
            { '@context': 'https://schema.org', '@type': 'Product', name: BR.name, description: BR.tagline, image: ORIGIN + '/og.png',
              brand: { '@type': 'Brand', name: BR.name },
              offers: PAID.filter((id) => LIST_PRICE[id] > 0).map((id) => ({
                '@type': 'Offer', name: planName(id), price: String(LIST_PRICE[id]), priceCurrency: 'INR',
                availability: 'https://schema.org/InStock', url: ORIGIN + '/purchase.html?plan=' + id })) },
            { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq }
          ];
          values.jsonld = ld.map((o) => '<script type="application/ld+json">' + JSON.stringify(o).replace(/</g, '\\u003c') + '</script>').join('\n');
        }
        const out = html.replace(/\{\{fms:([a-zA-Z.]+)(?::(word))?\}\}/g, (all, key, fmt) => {
          if (!(key in values)) fail('unknown placeholder ' + all + '. Known: ' + Object.keys(values).join(', '));
          return fmt === 'word' ? (WORDS[values[key]] || String(values[key])) : String(values[key]);
        });
        const left = out.match(/\{\{(?!brand:)[^}]*\}\}/);
        if (left) fail('placeholder left unreplaced: ' + left[0]);
        return out;
      }
    }
  };
}

/* The marketing pages that exist at the repo root, as rollup inputs.
   pricing.html is optional until its own branch lands. */
function marketingInputs() {
  const out = {};
  for (const f of readdirSync(__dirname)) {
    if (/^(pricing|product-[a-z-]+)\.html$/.test(f)) out[f.replace(/\.html$/, '')] = resolve(__dirname, f);
  }
  return out;
}

/* ============================================================
   THE PRODUCT NAME, STAMPED INTO EVERY PAGE (src/data/brand.json)
   ------------------------------------------------------------
   `{{brand:name|short|host|email|seller|tagline|upper}}` in any HTML
   entry. An unknown key throws, so a typo is a build error. The PWA
   manifest (public/manifest.webmanifest) carries `{{brand:name}}` too:
   it is filled in the output dir at writeBundle, before the service
   worker plugin globs dist/, and by a middleware under `vite dev`.
   ============================================================ */
export function brandReplace(text, brand, where = 'html') {
  const values = {
    name: brand.name, short: brand.short, host: brand.host, email: brand.supportEmail,
    seller: brand.seller, tagline: brand.tagline, upper: String(brand.name).toUpperCase()
  };
  return text.replace(/\{\{brand:([^}]*)\}\}/g, (all, key) => {
    if (!(key in values)) throw new Error(where + ': unknown placeholder ' + all + '. Known: ' + Object.keys(values).join(', '));
    return String(values[key]);
  });
}
/* ============================================================
   THE WORKED EXAMPLE'S SLICE OF studies.json (9 Oct 2026)
   ------------------------------------------------------------
   `virtual:beat-example-data` exports the ONE film the Feature
   blueprint's step 08 shows (its meta and beat sheets) and the
   beat-sheet methods, cut out of src/data/studies.json at build time.
   Before this, step 08 imported all of studies.json (the 104 KB
   data-studies chunk) on every first paint to show one card and fix
   fifteen labels, and that alone put feature.html over its first-paint
   budget. Derived, not copied (invariant 2): the JSON stays the only
   place the words live, and a missing film fails the build.
   ============================================================ */
export const BEAT_EXAMPLE_FILM = 'dragon';
function studySlicePlugin() {
  const ID = 'virtual:beat-example-data', RID = '\0' + ID;
  const COUNT = 'virtual:studies-count', RCOUNT = '\0' + COUNT;
  const file = resolve(__dirname, 'src/data/studies.json');
  return {
    name: 'fms-study-slice',
    resolveId(id) { return id === ID ? RID : id === COUNT ? RCOUNT : null; },
    load(id) {
      /* Just the NUMBER of case studies, for the hub's first-run tour line. */
      if (id === RCOUNT) {
        this.addWatchFile(file);
        return 'export const filmCount = ' + (JSON.parse(readFileSync(file, 'utf8')).films || []).length + ';\n';
      }
      if (id !== RID) return null;
      this.addWatchFile(file);
      const s = JSON.parse(readFileSync(file, 'utf8'));
      const film = (s.films || []).find((f) => f && f.meta && f.meta.slug === BEAT_EXAMPLE_FILM);
      if (!film) this.error('studies.json has no film "' + BEAT_EXAMPLE_FILM + '" for the worked example');
      return 'export const study = ' + JSON.stringify({ meta: film.meta, beatSheets: film.beatSheets || [] }) + ';\n'
        + 'export const methods = ' + JSON.stringify(s.beatSheetMethods || []) + ';\n';
    }
  };
}

function brandPlugin() {
  const load = () => JSON.parse(readFileSync(resolve(__dirname, 'src/data/brand.json'), 'utf8'));
  let outDir = 'dist';
  return {
    name: 'fms-brand',
    configResolved(c) { outDir = resolve(c.root, c.build.outDir); },
    transformIndexHtml: {
      order: 'pre',
      handler(html, ctx) { return brandReplace(html, load(), String((ctx && (ctx.filename || ctx.path)) || 'html')); }
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!/^\/manifest\.webmanifest(\?|$)/.test(req.url || '')) return next();
        res.setHeader('Content-Type', 'application/manifest+json');
        res.end(brandReplace(readFileSync(resolve(__dirname, 'public/manifest.webmanifest'), 'utf8'), load(), 'manifest.webmanifest'));
      });
    },
    writeBundle() {
      const f = resolve(outDir, 'manifest.webmanifest');
      if (!existsSync(f)) return;
      writeFileSync(f, brandReplace(readFileSync(f, 'utf8'), load(), 'manifest.webmanifest'));
    }
  };
}

/* ============================================================
   Multi-page build. Each page is a real HTML entry, so the
   output is still a pile of static files — same Vercel config,
   same GitHub Pages story, no server required.

   The win over the old setup is code-splitting: the feature
   blueprint was a single 253 KB HTML file that every visitor
   downloaded in full before seeing anything. Shared modules
   (store, chrome, cloud) now land in one cached chunk, and each
   page's data JSON is its own chunk.
   ============================================================ */

/* The app's version, from package.json, as a BUILD constant: the status bar
   (src/ui/status-bar.js) prints it, and nothing fetches it at run time. */
const APP_VERSION = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version || '';

/* ============================================================
   THE PHONE'S STATUS-BAR COLOUR, READ FROM tokens.css (19 Oct 2026)
   ------------------------------------------------------------
   Four pages carried `#16140f`, the retired palette, typed into their
   <head>, and the module pages carried no theme-color at all. On a
   studio page (one with #app) any typed theme-color is dropped and one
   is stamped from --surface-rail, the ground of the pinned phone band,
   so it cannot drift from the palette again. The public pages keep
   their own (generated elsewhere; they paint --surface-canvas).
   ============================================================ */
function themeColor() {
  const css = readFileSync(resolve(__dirname, 'src/styles/tokens.css'), 'utf8');
  const m = css.match(/--surface-rail:\s*(#[0-9a-fA-F]{3,8})\s*;/);
  if (!m) throw new Error('fms-theme-color: --surface-rail is not a hex in tokens.css');
  const rail = m[1];
  return {
    name: 'fms-theme-color',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('id="app"')) return html;
        const stripped = html.replace(/[ \t]*<meta name="theme-color"[^>]*>\n?/g, '');
        return stripped.replace('</head>', '<meta name="theme-color" content="' + rail + '">\n</head>');
      }
    }
  };
}

export default defineConfig({
  base: './',
  appType: 'mpa',
  define: { 'import.meta.env.VITE_APP_VERSION': JSON.stringify(APP_VERSION) },
  /* ------------------------------------------------------------
     DEV ONLY, AND IT FIXES A BUG THAT LOOKS LIKE A BROKEN APP.
     The site gate gives up after GIVE_UP_MS (20s) and FAILS CLOSED:
     a boot that has not finished is a redirect to invite.html, which
     is correct for a gate and indistinguishable from the page being
     broken. `boot()` in cloud.js awaits ensureClient(), which imports
     the ~98KB Supabase SDK. Vite pre-bundles a dependency on FIRST
     IMPORT unless told otherwise, so on a cold dev server that import
     could take longer than the 20 seconds the gate allows — and every
     gated page bounced to invite.html while the built site, where the
     SDK is already bundled, was fine. Diagnosed 8 Oct 2026 from the
     gate's own breadcrumb: reason 'timeout', from /settings.html.
     Naming it here pre-bundles it when the dev server starts instead.
     This changes nothing about the build: optimizeDeps is dev-only.
     ------------------------------------------------------------ */
  optimizeDeps: { include: ['@supabase/supabase-js'] },
  /* ------------------------------------------------------------
     PWA. `injectManifest` rather than `generateSW`: the caching
     rules are opinionated (Supabase must never be cached, HTML is
     stale-while-revalidate, hashed assets are cache-first), so the
     worker is written by hand in src/sw.js and the plugin's only
     job is to substitute the REAL built filenames into it. A
     hand-kept precache list would go stale the first time a chunk
     hash changed.

     `manifest: false` — public/manifest.webmanifest is authored,
     and every page already links it; there is nothing for the
     plugin to generate or inject.
     ------------------------------------------------------------ */
  plugins: [
    materialSymbols(),
    fontPreloads(),
    themeColor(),
    stepIndex(),
    brandPlugin(),
    studySlicePlugin(),
    startFigures(),
    marketingFigures(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: null,      // registration lives in src/lib/pwa.js
      manifest: false,
      devOptions: { enabled: false },   // no worker under `vite dev`
      injectManifest: {
        // The app shell, all four pages, the manifest and the icons.
        globPatterns: ['**/*.{html,js,css,svg,png,ico,webmanifest,woff,woff2}'],
        // Recorded media (public/media/**) is fetched on demand, never precached.
        globIgnores: ['media/**', 'marketing/**'],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024
      }
    })
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    /* es2022 for the top-level await in src/lib/store.js, which is
       what makes the overflow tier hydrate before any page reads a
       key. See the note above that await. */
    target: 'es2022',
    // The pages are content-heavy; a slightly larger inline limit
    // keeps the small SVG marks out of the network waterfall.
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        index:   resolve(__dirname, 'index.html'),
        dashboard: resolve(__dirname, 'dashboard.html'),
        budget:    resolve(__dirname, 'budget.html'),
        feature: resolve(__dirname, 'feature.html'),
        short:   resolve(__dirname, 'short.html'),
        library: resolve(__dirname, 'library.html'),
        breakdown: resolve(__dirname, 'breakdown.html'),
        stripboard: resolve(__dirname, 'stripboard.html'),
        reports:    resolve(__dirname, 'reports.html'),
        contacts:   resolve(__dirname, 'contacts.html'),
        visualize:  resolve(__dirname, 'visualize.html'),
        write:      resolve(__dirname, 'write.html'),
        screenplay: resolve(__dirname, 'screenplay.html'),
        plan:       resolve(__dirname, 'plan.html'),
        // Redirect stubs since 6 Oct 2026: the case studies and the
        // dissection are tabs of library.html. src/pages/moved.js keeps
        // their old #fragments working.
        study:      resolve(__dirname, 'study.html'),
        dissect:    resolve(__dirname, 'dissect.html'),
        settings:   resolve(__dirname, 'settings.html'),
        shoot:      resolve(__dirname, 'shoot.html'),
        // Post-Production: the suite's view of the shoot, and the checklist
        // of what leaves the building. See src/lib/editlog.js and
        // src/lib/deliverables.js.
        edit:         resolve(__dirname, 'edit.html'),
        deliverables: resolve(__dirname, 'deliverables.html'),
        story:      resolve(__dirname, 'story.html'),
        // Pre-production: the path from a script to a shoot day, one step at a time.
        preprod:    resolve(__dirname, 'preprod.html'),
        drafts:     resolve(__dirname, 'drafts.html'),
        screening:  resolve(__dirname, 'screening.html'),
        // The doorway to the cloud: where a closed gate sends a sign-in.
        invite:     resolve(__dirname, 'invite.html'),
        // The application console: the whole studio in numbers, plus
        // the gate's queue, codes and sessions. Administrators only.
        admin:      resolve(__dirname, 'admin.html'),
        // The money, out of the console: a user-side Purchase page (plans,
        // checkout, invoices, refund request) and an admin-only Purchases
        // page (payments, refunds, invoices, promo codes, tiers, growth).
        purchase:   resolve(__dirname, 'purchase.html'),
        purchases:  resolve(__dirname, 'purchases.html'),
        // The Idea Vault, a section of its own rather than a Story tab.
        vault:      resolve(__dirname, 'vault.html'),
        // The two documents Google will not publish an OAuth consent
        // screen without. They carry no app code — see src/pages/legal.js.
        privacy:    resolve(__dirname, 'privacy.html'),
        terms:      resolve(__dirname, 'terms.html'),
        refund:     resolve(__dirname, 'refund.html'),
        // The dead end: served by the host at any unknown path. Legal-style
        // page (words in markup, no chrome, no gate), not precached.
        notFound:   resolve(__dirname, '404.html'),
        // The public landing page: outside the site gate, no app code
        // (src/pages/start.js), the words in the markup like the legal pages.
        start:      resolve(__dirname, 'start.html'),
        // The public marketing pages: product-*.html (generated by
        // scripts/make-marketing-pages.mjs) and pricing.html when it exists.
        // Discovered, not listed, so a twelfth product page needs no edit here.
        ...marketingInputs(),
        // Redirect stubs at the old filenames. Shipped so existing
        // bookmarks, the links in the published README and anything
        // already shared keep resolving instead of 404ing.
        legacyFeature: resolve(__dirname, 'arunak-filmmaker-blueprint.html'),
        legacyShort:   resolve(__dirname, 'arunak-shortfilm-blueprint.html'),
        legacyLibrary: resolve(__dirname, 'arunak-filmmaker-library.html'),
        // The Chrome extension's side panel. Only in the extension build
        // (scripts/build-extension.mjs sets FMS_EXTENSION): on the website
        // it would be a page that can do nothing without chrome.* APIs.
        ...(process.env.FMS_EXTENSION ? { panel: resolve(__dirname, 'extension/panel.html') } : {})
      },
      output: {
        /* ------------------------------------------------------------
           CHUNKING — one shared core, the data by consumer, the rest
           by page.

           For a long time this was two rules: every src/data/*.json
           into `data`, every src/lib and src/ui module into `studio`.
           Both chunks were in every page's entry graph, so a module
           page downloaded the whole studio before it painted — the
           Shoot Day page fetched the case studies, both blueprints'
           steps, the pitch deck typesetter and the billing console:
           632 KB of code and 447 KB of JSON (212 + 146 KB gzipped)
           to draw a card with a slug line on it.

           THE CORE IS ONE CHUNK, STILL NAMED `studio`, AND STILL ON
           EVERY PAGE. CLAUDE.md invariant 6 depends on it: store.js
           must evaluate before anything reads localStorage, and
           cloud.js — which no module page imports by name — must
           evaluate everywhere, because its boot(), its `saved`
           subscriber and `window.StudioCloud` are what sync, Drive
           ownership (`ownsSync()`) and the gate's pause all read.
           Being in the chunk that every page's chrome.js pulls is
           how a module nobody imports runs on every page, so the
           core is listed by NAME below rather than derived: a module
           with a page-wide side effect belongs in CORE, and a module
           that is not in CORE evaluates only on the pages that import
           it. That is the one thing to check before moving a module
           out — grep its top level for addEventListener, a
           window.* global, Store.subscribe or a bare call.

           EVERYTHING ELSE IS LEFT TO THE SPLITTER (return undefined):
           a module one page imports lands in that page's chunk, a
           module several pages share lands in a chunk those pages
           share, and a module reached only through `import()` stays
           its own chunk — which is what keeps Supabase, pptxgenjs,
           the AI client, the typesetters and the sample script off
           the first paint, and now does the same for the step
           renderer, the story model and the PDF reader without a
           list of exceptions to keep.

           THE DATA IS GROUPED BY FILE, NOT BY CONSUMER, on purpose:
           content changes on its own schedule, and a chunk that holds
           JSON alone keeps its hash when code changes, so a returning
           visitor re-downloads the one that moved. The groups are the
           files one set of pages reads together; a JSON not named
           here (frameworks, deliverables, format-rules, write-presets,
           the element lexicon) is left to the splitter with its
           consumer. The two lazily-imported sample files keep their
           own chunks — hub.js and story-io.js reach them with
           `import()`, and naming them would put a quarter of a
           megabyte back on the first paint of every page that reads
           the sample's scene list.
           ------------------------------------------------------------ */
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('/node_modules/')) return;

          /* ---- the core: what chrome.js, cloud.js and shell.js need ---- */
          /* ---- STARTLIB: the pure modules the landing page shares ----
             Everything here is imported BOTH by something in CORE and by
             start.html, imports nothing itself, and must never end up inside
             `studio`.

             This was already costing us. funnel.js is imported by gate.js
             (CORE) for one bump_event call, so Rollup folded it into `studio`
             — and start.js's only JavaScript import is funnel.js, so the
             landing page was statically importing a 209 KB app bundle to send
             one counter. The page that exists to ship almost no JavaScript was
             shipping all of it, and nothing caught it: prove:growth asserts no
             SUPABASE chunk loads there, which was true the whole time.

             invite-code.js (gate.js + start.js, for a code in the URL) and
             auth-scope.js (drive.js + start-auth.js, for the Google scope)
             would each have arrived the same way.

             They must stay import-free for this to hold. The day one of them
             imports store.js, this line silently stops being enough and the
             209 KB comes back. trial-time.js (11 Oct 2026) joined them: the
             trial's length in hours is said the same way on the landing
             page and in the app, and it is pure for the same reason. */
          if (/\/src\/lib\/(funnel|invite-code|auth-scope|motion|trial-time|prefs|ports)\.js$/.test(id)) return 'startlib';
          const CORE_LIB = /\/src\/lib\/(store|overflow|sitegate|gate|plan-gate|billing|navmodel|usage|dom|pwa|skin|drive-sync|drive|backup|cloud|extension-bridge|account|cloud-api)\.js$/;
          /* kit/ (14 Oct 2026): the component builders are pure and small, and
             dialog.js (CORE) already draws with them — one shared copy. */
          const CORE_UI = /\/src\/ui\/(chrome|shell|tabs|section-menu|palette|fragments|footer|status-bar|no-project|actionbar|auth|modal-focus|icon|blueprint-drawer-mount|trial-band|motion-app|mobile-nav|project-switcher|dialog|ports-view|site-banner|kit\/[a-z-]+)\.js$/;
          const CORE_DATA = /\/src\/data\/(navigation|announcements|steps\.stages|section-icons)\.json$/;
          if (CORE_LIB.test(id) || CORE_UI.test(id) || CORE_DATA.test(id)) return 'studio';
          // billing.js's Razorpay helper, shared with the edge functions.
          if (id.includes('/supabase/functions/_shared/')) return 'studio';

          /* ---- the data, by file ---- */
          if (/\/src\/data\/sample\.[a-z]+\.(script|story)\.json$/.test(id)) return;   // lazy, see above
          if (/\/src\/data\/sample\.[a-z]+\.json$/.test(id)) return 'data-sample';
          if (/\/src\/data\/steps\.(feature|short|production|tanglish|priority|copy)\.json$/.test(id)) return 'data-steps';
          if (/\/src\/data\/(studies|dissections)\.json$/.test(id)) return 'data-studies';
          if (/\/src\/data\/(films|directors|rules|watchlist)\.json$/.test(id)) return 'data-library';
          if (/\/src\/data\/glossary\.json$/.test(id)) return 'data-glossary';
          if (/\/src\/data\/rates\.chennai\.[^/]*\.json$/.test(id)) return 'data-rates';
          if (/\/src\/data\/festivals(\.checks)?\.json$/.test(id)) return 'data-festivals';
          return;
        }
      }
    }
  },
  server: { port: 5173, open: false }
});
