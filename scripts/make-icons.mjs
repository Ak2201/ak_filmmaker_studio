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
const BRAND = JSON.parse(readFileSync(new URL('../src/data/brand.json', import.meta.url), 'utf8')).name;

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
  // The legacy names alias the semantic layer (--paper: var(--bg-primary)),
  // so follow var() references until they land on a hex.
  const refs = {};
  for (const [, name, ref] of block.matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)\s*;/g)) refs[name] = ref;
  for (let pass = 0; pass < 5; pass++) {
    for (const [name, ref] of Object.entries(refs)) if (!out[name] && out[ref]) out[name] = out[ref];
  }
  const need = ['ink', 'brand', 'brand-bar-ink'];
  out.paper = out['brand-bar-ink']; out['paper-raised'] = out['brand-bar-ink'];   // white marks on the near-black ground (the old paper tokens no longer exist)
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

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S}" height="${S}" role="img" aria-label="${BRAND}">
  <title>${BRAND}</title>
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

    <!-- the one violet (8B mix): a single brand stripe along the slate's foot -->
    <g clip-path="url(#board)">
      <rect x="76" y="376" width="360" height="32" fill="${C.brand}"/>
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

/* THE GOOGLE CONSENT SCREEN wants its own file, and the reason is a
   format constraint rather than a design one: it accepts JPG, PNG or
   BMP and NOT SVG, at most 1MB, square, and it renders at 120px. So
   the one place that may not simply reference icon.svg is the one
   place a stranger sees the mark before they trust us with an
   account.

   It is the SAME mark — redrawing it here would be a second opinion
   about the brand, and the next palette change would move one of
   them and not the other. It is generated from `mark()` like the
   rest, so `npm run icons` keeps all four in step.

   Google Cloud Console → Branding → App logo. Uploading a logo
   RE-TRIGGERS branding verification, so upload it before submitting,
   not after. */ 

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
  png(maskable, 512, 'icon-maskable-512.png'),
  png(any, 120, 'icon-consent-120.png')
]);
console.log(`  icon.svg / icon-maskable.svg  (palette from tokens.css: ink ${C.ink}, paper ${C.paper}, brand ${C.brand})`);

/* favicon.ico at the site root (27 Oct 2026). Every page links icon.svg,
   but browsers, link unfurlers and crawlers still ask for /favicon.ico
   by name, and a 404 there is one of the tells of an unfinished site.
   An .ico may hold PNG images directly (Vista+, every current browser),
   so this writes the ICO header and directory by hand around two PNGs:
   no extra dependency. */
const icoSizes = [16, 32, 48];
const icoPngs = await Promise.all(icoSizes.map((s) => sharp(Buffer.from(any)).resize(s, s).png({ compressionLevel: 9 }).toBuffer()));
const icoHead = Buffer.alloc(6 + 16 * icoSizes.length);
icoHead.writeUInt16LE(0, 0); icoHead.writeUInt16LE(1, 2); icoHead.writeUInt16LE(icoSizes.length, 4);
let icoOff = icoHead.length;
icoSizes.forEach((s, i) => {
  const e = 6 + 16 * i;
  icoHead.writeUInt8(s, e); icoHead.writeUInt8(s, e + 1);    // width, height (<256)
  icoHead.writeUInt16LE(1, e + 4); icoHead.writeUInt16LE(32, e + 6);   // planes, bpp
  icoHead.writeUInt32LE(icoPngs[i].length, e + 8); icoHead.writeUInt32LE(icoOff, e + 12);
  icoOff += icoPngs[i].length;
});
writeFileSync(join(root, 'public', 'favicon.ico'), Buffer.concat([icoHead, ...icoPngs]));
console.log(`  ../favicon.ico            ${icoSizes.join('/')}  ${icoOff} B`);
