import { defineConfig } from 'vite';
import { resolve } from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';

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
    target: 'es2020',
    // The pages are content-heavy; a slightly larger inline limit
    // keeps the small SVG marks out of the network waterfall.
    assetsInlineLimit: 2048,
    rollupOptions: {
      input: {
        index:   resolve(__dirname, 'index.html'),
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
        // Redirect stubs at the old filenames. Shipped so existing
        // bookmarks, the links in the published README and anything
        // already shared keep resolving instead of 404ing.
        legacyFeature: resolve(__dirname, 'arunak-filmmaker-blueprint.html'),
        legacyShort:   resolve(__dirname, 'arunak-shortfilm-blueprint.html'),
        legacyLibrary: resolve(__dirname, 'arunak-filmmaker-library.html')
      },
      output: {
        manualChunks(id) {
          if (id.includes('@supabase')) return 'supabase';
          if (id.includes('/src/data/')) return 'data';
          if (id.includes('/src/lib/') || id.includes('/src/ui/')) return 'studio';
        }
      }
    }
  },
  server: { port: 5173, open: false }
});
