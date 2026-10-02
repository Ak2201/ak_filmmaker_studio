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

const SKIN_KEY = 'fms_studio_skin_v1';
const DEFAULT = 'studio';

/* Match `:root[data-skin="name"]`, which is the only selector shape a
   skin file is allowed to use. Skins that also list a bare `:root`
   (studio does, to supply the defaults) still match on the attribute
   half, so the default skin is discovered like any other. */
const SKIN_RE = /:root\[data-skin=["']?([a-z0-9-]+)["']?\]/gi;

let cache = null;

/** A CSS string value — `"Studio"`, quotes and all — as a JS string. */
function unquote(v) {
  const t = String(v || '').trim().replace(/^["']|["']$/g, '');
  return t && t !== 'none' ? t : '';
}

/* ------------------------------------------------------------
   THE SKIN'S OWN STYLESHEET
   ------------------------------------------------------------
   One <link>, added when a skin that wants a face becomes
   active and removed when it stops being active. The point is
   that nobody on another skin pays for it: putting the face in
   every page's <head> would charge a font to five skins that
   never render a glyph of it.

   The allow-list is not about trusting the skin files — they are
   in this repository. It is about where the check belongs. This
   value becomes a <link href>, and the right place to constrain
   a URL is the line that uses it, so that a skin file copied in
   from somewhere else, or a future one written in a hurry,
   cannot quietly introduce a third-party request. The hosts are
   the two the Content Security Policy in vercel.json already
   names; anything else would be refused by the browser anyway,
   and failing here says why instead of leaving a console error.
   ------------------------------------------------------------ */
const FONT_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com'];
const FONT_LINK_ID = 'skin-font';

function applySkinFont(url) {
  if (typeof document === 'undefined') return;
  const existing = document.getElementById(FONT_LINK_ID);
  if (!url) { if (existing) existing.remove(); return; }

  let href = '';
  try {
    const parsed = new URL(url, location.href);
    if (parsed.protocol === 'https:' && FONT_HOSTS.indexOf(parsed.hostname) >= 0) {
      href = parsed.href;
    }
  } catch (e) { /* not a URL */ }
  if (!href) {
    console.warn('[skin] --sk-font-url is not an allowed font URL, ignoring:', url);
    if (existing) existing.remove();
    return;
  }
  if (existing && existing.getAttribute('href') === href) return;
  const link = existing || document.createElement('link');
  link.id = FONT_LINK_ID;
  link.rel = 'stylesheet';
  link.setAttribute('href', href);
  if (!existing) document.head.appendChild(link);
}

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
        const font = (rule.style && rule.style.getPropertyValue('--sk-font-url')) || '';
        found.set(id, {
          id,
          label: raw.trim().replace(/^["']|["']$/g, '') || id,
          /* Read the same way as the label, for the same reason: the
             skin file is the only place that knows, and a registry
             here would be a second list to keep in step. */
          fontUrl: unquote(font)
        });
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
  /* After the attribute, never before: the attribute is what makes
     the design correct, and the face is what makes it finished. A
     skin with no --sk-font-url passes '' and the link is removed,
     so switching away from Bright stops the fetch mattering. */
  const meta = listSkins().find((s2) => s2.id === skin);
  applySkinFont(meta && meta.fontUrl);

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
