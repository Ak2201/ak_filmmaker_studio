/* ============================================================
   THE VIEW'S PORTS — what this UI plugs into src/lib/ports.js
   ------------------------------------------------------------
   The logic layer asks the screen for a few things by name
   (docs/ARCHITECTURE.md §Ports). The cheap ones register beside their
   own code (dialog.js → 'ask', footer.js → 'brandLine'); the ones
   whose code is a page's worth of UI register here as a LAZY import,
   so a page pays for them only when the question is actually asked.

   A replacement UI provides the same names and nothing in src/lib/
   changes. Imported by chrome.js and by the extension panel (which
   has no chrome) — every page that can run cloud.js.
   ============================================================ */
import { setPort } from '../lib/ports.js';

// cloud.js: "your account is active in another window — take over?"
setPort('takeoverDialog', (info) => import('./gate-ui.js').then((m) => m.takeoverDialog(info)));
