/* ============================================================
   START — the public landing page's only script
   ------------------------------------------------------------
   start.html sits OUTSIDE the site gate (EXEMPT in src/lib/sitegate.js)
   and is the one page a stranger, a crawler and a link preview will
   meet first, so it follows the legal pages' pattern (src/pages/legal.js):
   the words are in the MARKUP and this module adds only what cannot be
   static. No store.js (it touches no storage of its own), no chrome.js
   (no toolbar, no shell, no theme picker), no pwa.js, no skin — so
   start.css reads the fixed tokens, never --sk-*.

   What it does add, in order:

   1. The theme the reader CHOSE elsewhere in the studio (UX audit L20),
      read RAW off the device-wide key chrome.js writes, exactly as
      legal.js does. Read only; the OS setting stands when it is absent.
   2. The CTA's label. The build flag decides where "open the app" lands:
      with the gate on (what the hosts run) every app link is a redirect
      to invite.html, so the button says so; an open build points at the
      hub. Read the way sitegate.js reads it, and defaulted the same way.
   3. The five stages and their modules, DERIVED from navigation.json
      (invariant 2): label and purpose per built module, plus the two
      shelves that are not a stage. A hand-written copy of this list on
      a sales page would be the first thing to drift from the product.
   ============================================================ */
import '../styles/base.css';
import '../styles/start.css';

/* navigation.json is FETCHED, not imported. vite.config.js folds every
   `import` of src/data/*.json into one shared `data` chunk — 450KB that
   every app page needs and this page does not. A URL import emits the
   15KB file as its own asset and leaves the chunking rule alone. */
const NAV_URL = new URL('../data/navigation.json', import.meta.url);

/* ---- 1. the chosen theme ------------------------------------------ */
/* Dark only: one palette, stamped for anything that keys off it. */
document.documentElement.setAttribute('data-theme', 'dark');

/* ---- 2. the CTA ---------------------------------------------------- */
/* Named directly so Vite inlines the one string; reading it off the
   env OBJECT inlines every VITE_* value into this chunk. */
const GATED = String(import.meta.env.VITE_SITE_GATE || 'invite').toLowerCase() !== 'off';   // sitegate.js SITE_GATE
for (const n of document.querySelectorAll('[data-gated][data-open]')) {
  n.textContent = GATED ? n.dataset.gated : n.dataset.open;
  if (n.tagName === 'A') n.setAttribute('href', GATED ? 'invite.html#request' : (n.dataset.openHref || 'index.html'));
}

/* Under the gate every app page bounces a stranger, so a "try it" link
   would land them on the landing page they came from. Point every link
   into the app at the doorway instead. The open build keeps its hrefs. */
const APP_PAGE = /^(?!(?:invite|start|privacy|terms|refund|screening)(?:\.html)?(?:[?#]|$))[\w-]+\.html(?:[?#]|$)/;
function gateAppLinks(root) {
  if (!GATED) return;
  for (const a of root.querySelectorAll('a[href]')) {
    if (APP_PAGE.test(a.getAttribute('href'))) a.setAttribute('href', 'invite.html#request');
  }
}
gateAppLinks(document);

/* ---- 3. the stages ------------------------------------------------- */
function el(tag, attrs = {}, children = []) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'text') n.textContent = v;
    else if (k === 'class') n.className = v;
    else n.setAttribute(k, v);
  }
  for (const c of [].concat(children)) if (c != null) n.append(c);
  return n;
}

const built = (m) => m && m.status === 'built' && m.href;

function moduleList(mods) {
  return el('ul', { class: 'st-mods' }, mods.map((m) => el('li', {}, [
    el('a', { href: m.href, text: m.label }),
    m.purpose ? el('span', { text: ' — ' + m.purpose }) : null
  ])));
}

function stageCard(phase, index) {
  const mods = (phase.modules || []).filter(built);
  return el('article', { class: 'st-stage', 'data-stage': phase.id }, [
    el('p', { class: 'st-stage-n', text: String(index + 1).padStart(2, '0') }),
    el('h3', { class: 'st-h3', text: phase.label }),
    phase.blurb ? el('p', { class: 'st-stage-blurb', text: phase.blurb }) : null,
    moduleList(mods)
  ]);
}

function shelfCard(shelf) {
  const mods = (shelf.modules || []).filter(built);
  return el('article', { class: 'st-stage st-shelf', 'data-shelf': shelf.id }, [
    el('p', { class: 'st-stage-n', text: 'Shelf' }),
    el('h3', { class: 'st-h3', text: shelf.label }),
    shelf.blurb ? el('p', { class: 'st-stage-blurb', text: shelf.blurb }) : null,
    moduleList(mods)
  ]);
}

async function renderStages(host) {
  let nav;
  try {
    const r = await fetch(NAV_URL);
    if (!r.ok) throw new Error('navigation.json ' + r.status);
    nav = await r.json();
  } catch (e) {
    /* Offline on a first visit, or blocked: the <noscript> sentence is
       not shown (scripts ran), so say the same thing in its place. */
    host.replaceChildren(el('p', { class: 'st-note', text: 'The list of stages and modules could not be loaded just now. Everything else on this page stands.' }));
    return;
  }
  const phases  = nav.phases || [];
  const shelves = (nav.global || []).filter((g) => Array.isArray(g.modules) && g.modules.some(built) && !g.adminOnly);
  const total   = phases.reduce((n, p) => n + (p.modules || []).filter(built).length, 0)
                + shelves.reduce((n, s) => n + (s.modules || []).filter(built).length, 0);
  host.replaceChildren(
    el('p', { class: 'st-count', text: `${total} modules across ${phases.length} stages and ${shelves.length} shelves — every one of them built and live.` }),
    el('div', { class: 'st-stage-grid' }, [
      ...phases.map(stageCard),
      ...shelves.map(shelfCard)
    ])
  );
  gateAppLinks(host);
}

/* ---- 4. testimonials ----------------------------------------------
   src/data/testimonials.json is { testimonials: [], films: [] }. The
   section stays hidden while both are empty. When an entry exists and
   the markup does not already carry it (scripts/check-testimonials.mjs
   keeps hand-copied markup honest), draw it here so a consented quote
   can never be stranded in the JSON. Textual only, no storage. */
const VOICES_URL = new URL('../data/testimonials.json', import.meta.url);
async function renderVoices() {
  const sec = document.getElementById('voices');
  if (!sec) return;
  let data;
  try {
    const r = await fetch(VOICES_URL);
    if (!r.ok) return;
    data = await r.json();
  } catch (e) { return; }
  const T = (Array.isArray(data.testimonials) ? data.testimonials : []).filter((t) => t && t.id && t.quote && t.name && t.consentOn);
  const F = (Array.isArray(data.films) ? data.films : []).filter((f) => f && f.id && f.title && f.consentOn);
  const vl = document.getElementById('voiceList'), fl = document.getElementById('filmList');
  let shown = 0;
  for (const t of T) {
    if (sec.querySelector(`[data-testimonial="${CSS.escape(t.id)}"]`)) { shown++; continue; }
    vl.append(el('li', { class: 'st-voice', 'data-testimonial': t.id }, [
      el('blockquote', {}, [el('p', { text: t.quote })]),
      el('p', { class: 'st-voice-who', text: [t.name, t.role, t.film].filter(Boolean).join(' · ') })
    ]));
    shown++;
  }
  for (const f of F) {
    if (sec.querySelector(`[data-film="${CSS.escape(f.id)}"]`)) { shown++; continue; }
    fl.append(el('li', { class: 'st-film', 'data-film': f.id }, [
      el('strong', { text: f.title }),
      el('span', { text: ' ' + [f.year && `(${f.year})`, f.director, f.format].filter(Boolean).join(' · ') })
    ]));
    shown++;
  }
  if (!shown) return;
  vl.hidden = !vl.children.length;
  fl.hidden = !fl.children.length;
  sec.hidden = false;
}
renderVoices();

const host = document.getElementById('stageList');
if (host) renderStages(host);
