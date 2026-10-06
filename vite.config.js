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
        /* A few modules under src/lib/ are reached only through
           `import()` and must be allowed to stay their own chunk.
           Naming a chunk for them would defeat the dynamic import:
           `studio` is in every page's entry graph, so anything
           folded into it is downloaded on first paint whether the
           page ever uses it or not — which is the rule CLAUDE.md
           states for Supabase and pptxgenjs, and these are the
           same shape. Returning undefined leaves the splitter to
           give each one its own chunk.

             screenplay-export  the typesetter — Save as PDF
             shotlist-export    the shot division sheet
             script-import      the .fountain/.txt/.fdx parser
             ai                 the only module that can open a
                                network connection, so the page
                                that never drafts never loads it */
        manualChunks(id) {
          if (/\/src\/lib\/(screenplay-export|shotlist-export|script-import|ai)\.js$/.test(id)) return;
          if (id.includes('@supabase')) return 'supabase';
          /* The sample's 105 pages are the same shape of exception one
             level down, and the `data` rule below would have swallowed
             them: `data` is ONE chunk that every page's entry graph
             pulls, so folding a screenplay into it would put a quarter
             of a megabyte on the first paint of all twenty pages — to
             serve one click on the hub. hub.js reaches it with
             `import()`; returning undefined is what lets that mean
             something. */
          if (/\/src\/data\/sample\.dragon\.script\.json$/.test(id)) return;
          if (id.includes('/src/data/')) return 'data';
          if (id.includes('/src/lib/') || id.includes('/src/ui/')) return 'studio';
        }
      }
    }
  },
  server: { port: 5173, open: false }
});
