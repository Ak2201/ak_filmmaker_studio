#!/usr/bin/env node
/* ============================================================
   OPEN GRAPH IMAGE  -  node scripts/make-og.mjs  (npm run og)
   ------------------------------------------------------------
   Draws the 1200x630 card a link preview shows (Open Graph, Twitter
   `summary_large_image`, WhatsApp, Slack) and writes public/og.png,
   which Vite copies to the dist root, so every public page's
   <meta property="og:image"> points at /og.png.

   THE 8B MIX (28 Oct 2026): near-black ground, white headline, ONE
   violet. Colours are READ OUT OF src/styles/tokens.css's first :root
   block (nothing here types a hex); the name is brand.json's, as written
   (sentence case, never upper-cased); the headline is Gabarito and the
   rest Onest, the self-hosted @fontsource files, inlined into a page that
   Chromium screenshots. (librsvg cannot read woff, which is why the old
   SVG route fell back to whatever sans the machine had.) The PNG is still
   COMMITTED, not generated at build: the hosts have no browser. Needs
   Chromium: PW_CHROMIUM=<path> if Playwright's own is not installed.
   Regenerate deliberately, look at it, commit.
   ============================================================ */

import { readFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { chromium } from 'playwright';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT  = join(root, 'public');

function palette() {
  const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const out = {};
  for (const [, name, value] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[name] = value;
  const need = ['ink', 'brand', 'brand-night', 'brand-bar', 'brand-bar-2', 'brand-bar-ink'];
  const missing = need.filter(n => !out[n]);
  if (missing.length) throw new Error('tokens.css is missing: ' + missing.join(', '));
  return out;
}
const C = palette();

const NAME = JSON.parse(readFileSync(new URL('../src/data/brand.json', import.meta.url), 'utf8')).name;
const HOOK = ['Less than a tea a day.', 'A year of the studio, and it works offline.'];
const SUB  = 'Write the screenplay. Plan the shoot. Run the set.';
const NOTE = 'For independent filmmakers. Tamil dialogue, English slugs. In your browser.';

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const font = (pkg, file) => readFileSync(join(root, 'node_modules', '@fontsource', pkg, 'files', file)).toString('base64');
const faces = [
  ['Gabarito', 800, font('gabarito', 'gabarito-latin-800-normal.woff2')],
  ['Gabarito', 700, font('gabarito', 'gabarito-latin-700-normal.woff2')],
  ['Onest', 400, font('onest', 'onest-latin-400-normal.woff2')],
  ['Onest', 600, font('onest', 'onest-latin-600-normal.woff2')]
].map(([f, w, b]) => `@font-face{font-family:'${f}';font-weight:${w};src:url(data:font/woff2;base64,${b}) format('woff2')}`).join('');

// The clapper mark from the app icon, at card scale: white stick, violet foot.
const slash = (x) => `<polygon points="${x},0 ${x + 22},0 ${x + 9},46 ${x - 13},46"/>`;
const mark = `<svg width="300" height="240" viewBox="0 0 300 240" aria-hidden="true">
  <defs><clipPath id="stick"><rect x="0" y="0" width="268" height="46" rx="5"/></clipPath>
  <clipPath id="board"><rect x="0" y="0" width="268" height="140" rx="8"/></clipPath></defs>
  <g transform="translate(16 30)">
    <g transform="rotate(-9 0 46)">
      <rect x="0" y="0" width="268" height="46" rx="5" fill="#fff"/>
      <g fill="${C['brand-bar']}" clip-path="url(#stick)">${slash(36)}${slash(100)}${slash(164)}${slash(228)}</g>
    </g>
    <g transform="translate(0 54)">
      <rect x="0" y="0" width="268" height="140" rx="8" fill="${C['brand-bar-2']}" stroke="#fff" stroke-opacity=".18" stroke-width="2"/>
      <g fill="#fff" opacity="0.16"><rect x="28" y="44" width="212" height="10" rx="5"/><rect x="28" y="70" width="140" height="10" rx="5"/></g>
      <g clip-path="url(#board)"><rect x="0" y="116" width="268" height="24" fill="${C.brand}"/></g>
    </g>
  </g></svg>`;

const html = `<!doctype html><meta charset="utf-8"><style>${faces}
*{margin:0;box-sizing:border-box}
body{width:1200px;height:630px;background:${C['brand-bar']};color:${C['brand-bar-ink']};font-family:'Onest',sans-serif;position:relative;overflow:hidden}
.card{position:absolute;inset:48px;border-radius:28px;background:${C['brand-bar-2']};border:2px solid rgba(255,255,255,.12)}
.band{position:absolute;left:48px;right:48px;top:48px;height:14px;border-radius:14px 14px 0 0;background:${C.brand}}
.mark{position:absolute;left:84px;top:110px}
.name{position:absolute;left:420px;top:112px;font:700 40px 'Gabarito';color:${C['brand-night']}}
.h1{position:absolute;left:420px;top:166px;font:800 72px/1.02 'Gabarito';letter-spacing:-1.5px;color:#fff}
.h2{position:absolute;left:420px;top:262px;width:690px;font:400 36px/1.3 'Onest';color:#fff;opacity:.86}
.sub{position:absolute;left:96px;top:470px;font:600 28px 'Onest';color:#fff}
.note{position:absolute;left:96px;top:518px;font:400 22px 'Onest';color:#fff;opacity:.7}
</style><div class="card"></div><div class="band"></div><div class="mark">${mark}</div>
<div class="name">${esc(NAME)}</div><div class="h1">${esc(HOOK[0])}</div><div class="h2">${esc(HOOK[1])}</div>
<div class="sub">${esc(SUB)}</div><div class="note">${esc(NOTE)}</div>`;

mkdirSync(OUT, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(html);
await page.evaluate(() => document.fonts.ready);
const shot = await page.screenshot({ type: 'png' });
await browser.close();
const info = await sharp(shot).png({ compressionLevel: 9, palette: true }).toFile(join(OUT, 'og.png'));
console.log(`og -> public/og.png  1200x630  ${info.size} B  (tokens.css: ground ${C['brand-bar']}, brand ${C.brand}; Gabarito + Onest)`);
