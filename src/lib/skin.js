/* ============================================================
   SKINS — the design language, swappable at runtime.
   ------------------------------------------------------------
   A skin is one CSS file in src/styles/skins/ that sets the --sk-*
   variables described in skins/_contract.css. This module is the
   plumbing that makes dropping a file in there enough:

     1. import.meta.glob pulls in every skin file at build time, so
        a new file ships without an import line being added anywhere.
     2. discover() reads the loaded stylesheets back out of the CSSOM
        looking for `:root[data-skin="…"]`, so the PICKER is derived
        from the files too. Nothing hand-maintains a list of skins.

   Deriving the list rather than declaring it is the same rule the
   steps and the films follow: a list of the things that exist,
   written by hand, is a list that is wrong by the second change.

   The stored value is a device preference, like the theme — it is
   about this screen, not about the film — so it is deliberately NOT
   one of store.js's project-scoped keys and deliberately not synced.
   ============================================================ */

/* Eager, not lazy: a skin that arrives after first paint is a flash
   of the wrong design, and these files are a few hundred bytes each. */
import.meta.glob('../styles/skins/*.css', { eager: true });

const SKIN_KEY = 'arunak_studio_skin_v1';
const DEFAULT = 'studio';

/* Match `:root[data-skin="name"]`, which is the only selector shape a
   skin file is allowed to use. Skins that also list a bare `:root`
   (studio does, to supply the defaults) still match on the attribute
   half, so the default skin is discovered like any other. */
const SKIN_RE = /:root\[data-skin=["']?([a-z0-9-]+)["']?\]/gi;

let cache = null;

/** Every skin the build shipped, discovered from the CSSOM. */
export function listSkins() {
  if (cache) return cache;
  const found = new Map();
  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    // A cross-origin stylesheet throws on .cssRules. Ours never are,
    // but a browser extension's might be, and one throw here would
    // leave the picker empty.
    try { rules = sheet.cssRules; } catch (e) { continue; }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (!rule.selectorText) continue;
      SKIN_RE.lastIndex = 0;
      let m;
      while ((m = SKIN_RE.exec(rule.selectorText))) {
        const id = m[1];
        if (found.has(id)) continue;
        // --sk-name is a CSS string: "Studio", quotes and all.
        const raw = (rule.style && rule.style.getPropertyValue('--sk-name')) || '';
        found.set(id, { id, label: raw.trim().replace(/^["']|["']$/g, '') || id });
      }
    }
  }
  if (!found.has(DEFAULT)) found.set(DEFAULT, { id: DEFAULT, label: 'Studio' });
  cache = [...found.values()].sort((a, b) =>
    a.id === DEFAULT ? -1 : b.id === DEFAULT ? 1 : a.label.localeCompare(b.label));
  return cache;
}

export function currentSkin() {
  return document.documentElement.getAttribute('data-skin') || DEFAULT;
}

export function applySkin(id) {
  const known = listSkins().some((s) => s.id === id);
  const skin = known ? id : DEFAULT;
  // Root attribute first, exactly as applyTheme does: documentElement
  // exists before body, so this cannot flash the wrong design.
  document.documentElement.setAttribute('data-skin', skin);
  try { localStorage.setItem(SKIN_KEY, skin); } catch (e) {}
  document.querySelectorAll('.skin-picker button').forEach((b) => {
    b.classList.toggle('active', b.dataset.skin === skin);
    b.setAttribute('aria-checked', String(b.dataset.skin === skin));
  });
  return skin;
}

export function loadSkin() {
  let stored;
  try { stored = localStorage.getItem(SKIN_KEY); } catch (e) {}
  // Stamp the attribute even for the default. Unset, the app still
  // renders (studio.css declares its values on bare :root too), but
  // then nothing can tell "chose studio" from "never chose", and the
  // picker would have no active state to show.
  return applySkin(stored || DEFAULT);
}

/* Exposed on window for the same reason StudioUI is: scripts/verify
   drives the skin from outside the module graph, and a design layer
   that cannot be swapped from a test is a design layer whose swap is
   never tested. */
if (typeof window !== 'undefined') {
  window.StudioSkin = { listSkins, currentSkin, applySkin, loadSkin };
}

export { SKIN_KEY, DEFAULT as DEFAULT_SKIN };
export default { listSkins, currentSkin, applySkin, loadSkin };
