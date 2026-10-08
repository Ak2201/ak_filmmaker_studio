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



/* ============================================================
   THE OFFLINE SHOOT PACK
   ------------------------------------------------------------
   The precache already holds every page as `page.html`. What it does
   NOT hold is the address people actually open: the host sets
   cleanUrls, so a phone that bookmarked `/shoot` asks for a URL no
   install ever cached, and offline it gets the hub instead of the
   day. makeOffline() asks the worker (src/sw.js, 'FMS_PACK') to fetch
   each page under both addresses and every file the page loads, and
   keep them in a cache of their own. offlineStatus() answers from the
   caches themselves — what is there, not what was promised — and
   counts a redirected entry as missing, which is the SW trap in
   CLAUDE.md read from the page's side.
   ============================================================ */
export const SHOOT_PACK = ['shoot.html', 'contacts.html', 'reports.html'];

export function offlineSupported() {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator
    && !!navigator.serviceWorker.controller && typeof caches !== 'undefined';
}

const base = () => new URL('./', location.href);
const cleanOf = (page) => new URL(page.replace(/\.html$/, ''), base()).href;
const ASSET = /\b(?:src|href)="([^"]+\.(?:js|css|json|woff2|svg|png|webmanifest))"/g;

async function usable(url) {
  const hit = await caches.match(url, { ignoreSearch: true });
  return hit && !hit.redirected ? hit : null;
}

/** For each page: is it cached, under its clean address too, and how
    many of the files it loads are cached beside it. */
export async function offlineStatus(pages = SHOOT_PACK) {
  if (typeof caches === 'undefined') return pages.map((page) => ({ page, ready: false, clean: false, files: 0, missing: 0 }));
  return Promise.all(pages.map(async (page) => {
    const html = await usable(new URL(page, base()).href);
    const clean = !!(await usable(cleanOf(page)));
    let files = 0, missing = 0;
    if (html) {
      const text = await html.clone().text();
      const urls = [...new Set([...text.matchAll(ASSET)].map((m) => new URL(m[1], base()).href))];
      for (const u of urls) { if (await usable(u)) files++; else missing++; }
      files += 1;
    }
    return { page, ready: !!html && missing === 0, clean, files, missing };
  }));
}

/** Ask the worker to keep the pack; resolves with offlineStatus(). */
export function makeOffline(pages = SHOOT_PACK) {
  if (!offlineSupported()) return Promise.reject(new Error('no service worker'));
  return new Promise((resolve, reject) => {
    const ch = new MessageChannel();
    const timer = setTimeout(() => reject(new Error('timeout')), 30000);
    ch.port1.onmessage = () => { clearTimeout(timer); offlineStatus(pages).then(resolve, reject); };
    navigator.serviceWorker.controller.postMessage(
      { type: 'FMS_PACK', urls: pages.map((p) => new URL(p, base()).href) }, [ch.port2]);
  });
}
export default { registerSW, onInstallAvailable, canInstall, promptInstall, offlineSupported, offlineStatus, makeOffline, SHOOT_PACK };
