#!/usr/bin/env node
/* ============================================================
   OPEN GRAPH IMAGE  —  node scripts/make-og.mjs
   ------------------------------------------------------------
   Draws the 1200×630 card a link preview shows (Open Graph, Twitter
   `summary_large_image`, WhatsApp, Slack) and writes it to
   public/og.png, which Vite copies to the dist root — so every public
   page's <meta property="og:image"> points at /og.png.

   Same approach as make-icons.mjs: every colour is READ OUT OF
   src/styles/tokens.css's first :root block (the ink theme, which is
   the default), the product name and the one-line hook are the only
   words, and sharp (librsvg) rasterises the SVG. Re-run it after a
   palette change; nothing here types a hex.

   THE TEXT IS SET IN WHATEVER SANS THE MACHINE HAS. librsvg resolves
   font-family through fontconfig, and the brand face (Plus Jakarta
   Sans) is a webfont no build machine carries, so the stack falls
   through to Liberation Sans / DejaVu Sans / whatever `sans-serif`
   resolves to. That makes the PNG machine-dependent at the glyph level
   — unlike the icons, which are pure geometry — which is why it is
   COMMITTED rather than generated at build: the hosts' build images
   have no fonts worth the name, and a card drawn in their fallback is
   a card drawn in nothing. Regenerate deliberately, look at it, commit.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT  = join(root, 'public');

// ------------------------------------------------------------
// PALETTE — parsed from the first :root block of tokens.css (make-icons.mjs's reader).
// ------------------------------------------------------------
function palette() {
  const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const out = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[name] = value;
  }
  // The legacy names alias the semantic layer (--paper: var(--bg-primary)),
  // so follow var() references until they land on a hex.
  const refs = {};
  for (const [, name, ref] of block.matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)\s*;/g)) refs[name] = ref;
  for (let pass = 0; pass < 5; pass++) {
    for (const [name, ref] of Object.entries(refs)) if (!out[name] && out[ref]) out[name] = out[ref];
  }
  const need = ['paper', 'paper-raised', 'ink', 'ink-body', 'ink-muted', 'brand', 'brand-deep', 'brand-bar', 'brand-bar-2', 'feature', 'shorts', 'library', 'rule'];
  const missing = need.filter(n => !out[n]);
  if (missing.length) throw new Error('tokens.css is missing: ' + missing.join(', '));
  return out;
}

const C = palette();

const NAME = 'FilmMakerStudio';
const HOOK = ['Pay once. No subscription.', 'Works offline — your work stays in your browser.'];
const SUB  = 'Write the script · Plan the shoot · Run the set';
const FONT = `'Plus Jakarta Sans', 'Liberation Sans', 'DejaVu Sans', Arial, sans-serif`;

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

function card() {
  const W = 1200, H = 630;
  // The clapper mark from the app icon, at card scale, in the corner.
  const slash = (x) => `<polygon points="${x},0 ${x + 22},0 ${x + 9},46 ${x - 13},46"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="${esc(NAME)} — ${esc(HOOK.join(' '))}">
  <title>${esc(NAME)}</title>
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${C['brand-bar']}"/>
      <stop offset="1" stop-color="${C['brand-bar-2']}"/>
    </linearGradient>
    <clipPath id="stick"><rect x="0" y="0" width="268" height="46" rx="5"/></clipPath>
  </defs>

  <rect width="${W}" height="${H}" fill="${C.paper}"/>
  <!-- the raised card -->
  <rect x="48" y="48" width="${W - 96}" height="${H - 96}" rx="28" fill="${C['paper-raised']}" stroke="${C.rule}" stroke-width="2"/>
  <!-- the brand band along the top edge -->
  <rect x="48" y="48" width="${W - 96}" height="14" rx="7" fill="url(#band)"/>

  <!-- the mark: a clapper, hinged open -->
  <g transform="translate(96 120)">
    <g transform="rotate(-9 0 46)">
      <rect x="0" y="0" width="268" height="46" rx="5" fill="${C.ink}"/>
      <g fill="${C.paper}" clip-path="url(#stick)">${slash(36)}${slash(100)}${slash(164)}${slash(228)}</g>
    </g>
    <rect x="0" y="54" width="268" height="140" rx="8" fill="${C.ink}"/>
    <g fill="${C.paper}" opacity="0.14">
      <rect x="28" y="98" width="212" height="10" rx="5"/>
      <rect x="28" y="124" width="140" height="10" rx="5"/>
    </g>
    <rect x="0"   y="170" width="90" height="24" fill="${C.feature}"/>
    <rect x="90"  y="170" width="89" height="24" fill="${C.shorts}"/>
    <rect x="179" y="170" width="89" height="24" fill="${C.library}"/>
  </g>

  <!-- the words -->
  <text x="420" y="178" font-family="${FONT}" font-size="34" font-weight="700" letter-spacing="6" fill="${C['brand-deep']}">${esc(NAME.toUpperCase())}</text>
  <text x="420" y="268" font-family="${FONT}" font-size="60" font-weight="800" letter-spacing="-1.5" fill="${C.ink}">${esc(HOOK[0])}</text>
  <text x="420" y="344" font-family="${FONT}" font-size="36" font-weight="600" fill="${C['ink-body']}">${esc(HOOK[1].split(' — ')[0])} —</text>
  <text x="420" y="394" font-family="${FONT}" font-size="36" font-weight="600" fill="${C['ink-body']}">${esc(HOOK[1].split(' — ')[1])}</text>

  <text x="96" y="520" font-family="${FONT}" font-size="26" font-weight="600" fill="${C['ink-muted']}">${esc(SUB)}</text>
  <text x="96" y="556" font-family="${FONT}" font-size="22" fill="${C['ink-muted']}">For independent filmmakers · Tamil dialogue, English slugs · In your browser</text>
</svg>
`;
}

mkdirSync(OUT, { recursive: true });
const svg = card();
const info = await sharp(Buffer.from(svg), { density: 144 })
  .resize(1200, 630)
  .png({ compressionLevel: 9, palette: true })
  .toFile(join(OUT, 'og.png'));
console.log(`og → public/og.png  1200×630  ${info.size} B  (palette from tokens.css: paper ${C.paper}, ink ${C.ink}, brand ${C.brand})`);
