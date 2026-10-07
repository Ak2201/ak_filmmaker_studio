import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { VitePWA } from 'vite-plugin-pwa';

/* ============================================================
   THE ICON FONT, DERIVED — one <link> for every page, from the data
   ------------------------------------------------------------
   Every map in the app (the launcher, the shell's rail, phase menu
   and breadcrumb, the command palette) draws its marks through
   iconSpan() in src/ui/icon.js as Material Symbols LIGATURES: the
   span's text is the symbol's name and the font turns it into a
   glyph. So a page that does not load the font prints the names —
   "home", "auto_stories", "format_list_numbered" — as words, over
   the labels beside them. story.html and screening.html shipped
   exactly that, because the <link> was hand-pasted into seventeen
   HTML files and those two were written after the paste.

   A hand-kept list in seventeen places is the bug CLAUDE.md names
   about the steps living in three. So the tag is injected here, at
   build and in dev, into every page that renders the app (#app) and
   already uses Google Fonts, and the `icon_names=` subset is read off
   navigation.json — the same file the marks come from. Add a module
   with a new `sym` and the font gains it with no other edit.

   Two things in the URL are load-bearing and both look like noise:

   `icon_names=` makes Google return a font containing only those
   symbols: ~14KB against 1.2MB for the full face, measured, on a file
   that sits in first paint. AND A MISSPELT NAME DOES NOT FAIL — the
   API answers 200 and serves the WHOLE face, so neither the status
   nor the page tells you; the only tell is the size. The shape check
   below catches a typo that is not a legal name at all; a legal name
   that is not a real symbol still has to be verified against the API
   before it ships.

   `display=block` rather than `swap`: under swap a slow network
   paints the words across the map before the font arrives. Block
   renders nothing for up to three seconds instead, which is the
   right trade for a mark that is decorative — every icon is
   aria-hidden and sits beside its own text label.

   Needs no CSP change: style-src already allows fonts.googleapis.com
   and font-src already allows fonts.gstatic.com.
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
  const list = [...names].sort();
  const bad = list.filter((n) => !/^[a-z0-9_]+$/.test(n));
  if (bad.length) throw new Error('navigation.json: not a Material Symbols name: ' + bad.join(', '));
  const href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,0,0'
             + '&icon_names=' + list.join(',') + '&display=block';
  return {
    name: 'fms-material-symbols',
    transformIndexHtml(html) {
      // The app pages only: the legal documents and the redirect stubs
      // draw no marks, and the extension panel loads no remote font.
      if (!html.includes('id="app"') || !html.includes('fonts.googleapis.com')) return;
      return [
        { tag: 'meta', attrs: { name: 'fms-site-gate', content: siteGate }, injectTo: 'head' },
        { tag: 'link', attrs: { rel: 'stylesheet', href }, injectTo: 'head' }
      ];
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
   Multi-page build. Each page is a real HTML entry, so the
   output is still a pile of static files — same Vercel config,
   same GitHub Pages story, no server required.

   The win over the old setup is code-splitting: the feature
   blueprint was a single 253 KB HTML file that every visitor
   downloaded in full before seeing anything. Shared modules
   (store, chrome, cloud) now land in one cached chunk, and each
   page's data JSON is its own chunk.
   ============================================================ */

export default defineConfig({
  base: './',
  appType: 'mpa',
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
    stepIndex(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectRegister: null,      // registration lives in src/lib/pwa.js
      manifest: false,
      devOptions: { enabled: false },   // no worker under `vite dev`
      injectManifest: {
        // The app shell, all four pages, the manifest and the icons.
        globPatterns: ['**/*.{html,js,css,svg,png,ico,webmanifest,woff2}'],
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
        screening:  resolve(__dirname, 'screening.html'),
        // The doorway to the cloud: where a closed gate sends a sign-in.
        invite:     resolve(__dirname, 'invite.html'),
        // The application console: the whole studio in numbers, plus
        // the gate's queue, codes and sessions. Administrators only.
        admin:      resolve(__dirname, 'admin.html'),
        // The two documents Google will not publish an OAuth consent
        // screen without. They carry no app code — see src/pages/legal.js.
        privacy:    resolve(__dirname, 'privacy.html'),
        terms:      resolve(__dirname, 'terms.html'),
        refund:     resolve(__dirname, 'refund.html'),
        // The public landing page: outside the site gate, no app code
        // (src/pages/start.js), the words in the markup like the legal pages.
        start:      resolve(__dirname, 'start.html'),
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
          const CORE_LIB = /\/src\/lib\/(store|overflow|sitegate|gate|plan-gate|billing|navmodel|dom|pwa|skin|drive-sync|drive|backup|cloud|extension-bridge|account)\.js$/;
          const CORE_UI = /\/src\/ui\/(chrome|shell|tabs|palette|fragments|footer|no-project|actionbar|auth|modal-focus|icon|blueprint-drawer-mount)\.js$/;
          const CORE_DATA = /\/src\/data\/(navigation|announcements|steps\.stages)\.json$/;
          if (CORE_LIB.test(id) || CORE_UI.test(id) || CORE_DATA.test(id)) return 'studio';
          // billing.js's Razorpay helper, shared with the edge functions.
          if (id.includes('/supabase/functions/_shared/')) return 'studio';

          /* ---- the data, by file ---- */
          if (/\/src\/data\/sample\.dragon\.(script|story)\.json$/.test(id)) return;   // lazy, see above
          if (/\/src\/data\/sample\.dragon\.json$/.test(id)) return 'data-sample';
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
