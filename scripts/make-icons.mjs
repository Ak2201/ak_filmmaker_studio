#!/usr/bin/env node
/* ============================================================
   ICON GENERATOR  —  node scripts/make-icons.mjs
   ------------------------------------------------------------
   Draws the studio's app mark and writes it to public/icons/ as
   one SVG plus the three PNG sizes a manifest needs.

   The mark: a clapperboard, because the studio is printed
   matter — a paper slate on an ink ground, with the three-volume
   stripe (feature / short / library) along its bottom edge, the
   same stripe the toolbar wears on every page.

   Every colour is READ OUT OF src/styles/tokens.css rather than
   typed here. If a token changes, re-running this script moves
   the icons with it, and no hex in this repo can drift from the
   palette. Run it after any change to the ink/paper tokens.

   Rasterising is done by sharp (librsvg), so the output is
   byte-reproducible on any machine with the same deps.
   ============================================================ */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT  = join(root, 'public', 'icons');

// ------------------------------------------------------------
// PALETTE — parsed from the first :root block of tokens.css.
// ------------------------------------------------------------
function palette() {
  const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const out = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) {
    out[name] = value;
  }
  const need = ['paper', 'paper-raised', 'ink', 'feature', 'shorts', 'library'];
  const missing = need.filter(n => !out[n]);
  if (missing.length) throw new Error('tokens.css is missing: ' + missing.join(', '));
  return out;
}

const C = palette();

// ------------------------------------------------------------
// THE MARK — one function, two framings.
// `inset` is the maskable safe-zone shrink (0 = full bleed).
// ------------------------------------------------------------
function mark({ inset = 0 } = {}) {
  const S = 512;
  const scale = (S - inset * 2) / S;
  const slash = (x) =>
    `<polygon points="${x},150 ${x + 30},150 ${x + 12},212 ${x - 18},212"/>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="The Filmmaker's Studio">
  <title>The Filmmaker's Studio</title>
  <defs>
    <clipPath id="board"><rect x="76" y="222" width="360" height="186" rx="10"/></clipPath>
    <clipPath id="stick"><rect x="76" y="150" width="360" height="62" rx="6"/></clipPath>
  </defs>

  <rect width="${S}" height="${S}" fill="${C.ink}"/>

  <g transform="translate(${inset} ${inset}) scale(${scale.toFixed(6)})">
    <!-- the clapper stick, hinged open -->
    <g transform="rotate(-9 76 212)">
      <rect x="76" y="150" width="360" height="62" rx="6" fill="${C['paper-raised']}"/>
      <g fill="${C.ink}" clip-path="url(#stick)">
        ${slash(124)}${slash(209)}${slash(294)}${slash(379)}
      </g>
    </g>

    <!-- the slate -->
    <rect x="76" y="222" width="360" height="186" rx="10" fill="${C.paper}"/>

    <!-- two ruled lines, as on a real slate -->
    <g fill="${C.ink}" opacity="0.14">
      <rect x="112" y="284" width="288" height="12" rx="6"/>
      <rect x="112" y="318" width="196" height="12" rx="6"/>
    </g>

    <!-- the three volumes, the same stripe the toolbar wears -->
    <g clip-path="url(#board)">
      <rect x="76"  y="376" width="120" height="32" fill="${C.feature}"/>
      <rect x="196" y="376" width="120" height="32" fill="${C.shorts}"/>
      <rect x="316" y="376" width="120" height="32" fill="${C.library}"/>
    </g>
  </g>
</svg>
`;
}

// ------------------------------------------------------------
// WRITE
// ------------------------------------------------------------
mkdirSync(OUT, { recursive: true });

const any      = mark();                 // full bleed — "any" purpose
const maskable = mark({ inset: 58 });    // ~77% safe zone — "maskable"

writeFileSync(join(OUT, 'icon.svg'), any);
writeFileSync(join(OUT, 'icon-maskable.svg'), maskable);

const png = (svg, size, name) =>
  sharp(Buffer.from(svg))
    .resize(size, size)
    .png({ compressionLevel: 9 })
    .toFile(join(OUT, name))
    .then(info => console.log(`  ${name.padEnd(24)} ${size}×${size}  ${info.size} B`));

console.log('icons → public/icons/');
await Promise.all([
  png(any, 192, 'icon-192.png'),
  png(any, 512, 'icon-512.png'),
  png(maskable, 512, 'icon-maskable-512.png')
]);
console.log(`  icon.svg / icon-maskable.svg  (palette from tokens.css: ink ${C.ink}, paper ${C.paper})`);
