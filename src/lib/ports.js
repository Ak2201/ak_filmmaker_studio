/* ============================================================
   PORTS — the few things the logic layer needs FROM the screen
   ------------------------------------------------------------
   src/lib/ is the logic layer and never imports src/ui/ or src/pages/
   (docs/ARCHITECTURE.md, enforced by `npm run test:layers`). A handful
   of logic modules still need the screen to do one thing for them —
   cloud.js has to ask "upload these projects?", the pitch deck closes
   on the brand line. Instead of importing the view, they call a PORT
   here, and the view plugs itself in when it loads:

     view  (src/ui/dialog.js)   setPort('ask', ask)
     logic (src/lib/cloud.js)   await callPort('ask', false, message)

   Swap the UI and the new one registers the same names; nothing in
   src/lib/ changes. A port nobody registered answers its fallback,
   which is always the SAFE answer (a question nobody could show is a
   "no", a missing brand line is no line), never a guess.

   This file imports nothing, on purpose: it sits under CORE and under
   pages that load almost no JavaScript, so it must never pull a chunk
   in behind it (the startlib trap in CLAUDE.md).
   ============================================================ */

const ports = new Map();

/** The view registers an implementation. Re-registering replaces it. */
export function setPort(name, fn) {
  if (typeof fn !== 'function') throw new TypeError('[ports] ' + name + ' needs a function');
  ports.set(name, fn);
}

/** Whether a view has plugged this port in. */
export function hasPort(name) { return ports.has(name); }

/** Call a port; `fallback` is returned when nothing is registered. */
export function callPort(name, fallback, ...args) {
  const fn = ports.get(name);
  if (!fn) return fallback;
  return fn(...args);
}

/* The names in use, so a new UI knows what to provide:
     ask(messageOrOptions)        → Promise<boolean>   src/ui/dialog.js
     brandLine({ className })     → Element | null     src/ui/footer.js (null when branding is off) */
