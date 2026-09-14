/* ============================================================
   PWA — service worker registration + the install affordance
   ------------------------------------------------------------
   The README has always claimed the studio "works offline once
   the page is loaded". That was aspirational: there was no
   manifest and no service worker, so a second visit with no
   network got the browser's dinosaur. This module makes the
   claim true, and it is imported by every page entry.

   Two deliberate restraints:

     1. Nothing happens under `vite dev`. A service worker that
        caches a dev server's module graph is a debugging trap —
        you fix a file, reload, and get yesterday's bytes. The
        guard is import.meta.env.DEV rather than a hostname test,
        so `vite build && preview` on localhost still exercises
        the real worker (which is how this was verified).

     2. No install banner, no modal, no "add to home screen"
        nag. The browser fires `beforeinstallprompt`, we stash
        it, and a quiet toolbar button appears. If the browser
        never offers one — already installed, iOS, unsupported —
        the button never appears and nothing is said about it.

   The worker itself lives in src/sw.js and is built by
   vite-plugin-pwa (injectManifest), so its precache list is the
   real built filenames, not a hand-kept list.
   ============================================================ */

const isDev = !!(import.meta.env && import.meta.env.DEV);

/* A build flag for hosted previews. A service worker outlives the
   page that registered it: install one from a throwaway preview URL
   and it keeps serving its cached copy after the preview is replaced.
   `VITE_DISABLE_SW=1 npm run build` produces a build that never
   registers one. Production builds set nothing and behave normally. */
const swDisabled = !!(import.meta.env && import.meta.env.VITE_DISABLE_SW);

let deferredPrompt = null;
let installed = false;
const listeners = new Set();

function announce() {
  const available = !!deferredPrompt && !installed;
  listeners.forEach(fn => { try { fn(available); } catch (e) { /* a listener is not our problem */ } });
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Suppress the browser's own mini-infobar; we offer the button instead.
    e.preventDefault();
    deferredPrompt = e;
    announce();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    announce();
  });
}

/**
 * Subscribe to install availability. Called immediately with the
 * current state, so a late subscriber still sees an event that
 * fired during page boot.
 */
export function onInstallAvailable(cb) {
  listeners.add(cb);
  try { cb(!!deferredPrompt && !installed); } catch (e) {}
  return () => listeners.delete(cb);
}

export function canInstall() { return !!deferredPrompt && !installed; }

/** Show the browser's install dialog. No-op if none was offered. */
export async function promptInstall() {
  if (!deferredPrompt) return null;
  const prompt = deferredPrompt;
  deferredPrompt = null;      // a prompt event may only be used once
  announce();
  prompt.prompt();
  try {
    const choice = await prompt.userChoice;
    return choice && choice.outcome;
  } catch (e) {
    return null;
  }
}

/**
 * Register the service worker. Silent no-op in dev or where unsupported.
 * Memoised: every page entry calls this (directly, or through the shared
 * chrome), and one registration per document is enough.
 */
let registration = null;
export function registerSW() {
  if (registration) return registration;
  if (isDev || swDisabled) return Promise.resolve(null);
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return Promise.resolve(null);
  registration = navigator.serviceWorker
    .register('./sw.js', { scope: './' })
    .catch((err) => {
      // Offline capability is a bonus, never a reason to break the page.
      console.warn('[pwa] service worker registration failed', err);
      return null;
    });
  return registration;
}

export default { registerSW, onInstallAvailable, canInstall, promptInstall };
