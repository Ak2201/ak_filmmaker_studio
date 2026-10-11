#!/usr/bin/env node
/* ============================================================
   INSTAGRAM POSTERS  —  node scripts/make-posters.mjs
   ------------------------------------------------------------
   Three 1080x1350 (4:5) cards for the launch announcement. 4:5 is
   the tallest aspect the feed will show, so it takes the most
   screen on a phone; 1:1 wastes a fifth of the frame.

   SAME DISCIPLINE AS make-og.mjs AND make-icons.mjs. Every colour
   is read out of src/styles/tokens.css, the name and tagline come
   from src/data/brand.json, and — the part that matters for a
   PUBLIC claim — EVERY NUMBER ON THESE POSTERS IS COUNTED FROM
   src/data AT DRAW TIME. Nothing here types a figure.

   That is not neatness. navigation.json once advertised "32
   questions" for a blueprint with 24 steps, and start.html printed
   it verbatim; a poster is worse, because it is screenshotted and
   forwarded and cannot be corrected after the fact. If a count is
   wrong here it is because the data is wrong, which is a bug worth
   having rather than a lie worth shipping.

   DELIBERATELY NOT ON THESE POSTERS:
   - a price. Pay-once is true and durable; a rupee figure is not,
     because the launch prices are scheduled to rise and a post is
     forever. "Pay once. No subscription." says the honest half.
   - any testimonial or user count. testimonials.json is empty by
     design and inventing social proof is both prohibited here and
     trivially disproved.

   Output: social/poster-1..3.png, OUTSIDE public/ on purpose —
   public/ ships in the build and gets precached by the service
   worker, and marketing art has no business in a user's offline
   cache.

   THE TYPE IS WHATEVER SANS THE MACHINE HAS, exactly as make-og.mjs
   warns: librsvg resolves families through fontconfig and the brand
   face is a webfont. Draw these on a machine with real fonts, LOOK
   at them, then post.
   ============================================================ */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import sharp from 'sharp';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const OUT = join(root, 'social');
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));

/* ---- palette, from tokens.css (make-og.mjs's reader) -------- */
function palette() {
  const css = readFileSync(join(root, 'src', 'styles', 'tokens.css'), 'utf8');
  const block = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  const out = {};
  for (const [, n, v] of block.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{3,8})\s*;/g)) out[n] = v;
  const refs = {};
  for (const [, n, r] of block.matchAll(/--([a-z0-9-]+):\s*var\(--([a-z0-9-]+)\)\s*;/g)) refs[n] = r;
  for (let p = 0; p < 5; p++) for (const [n, r] of Object.entries(refs)) if (!out[n] && out[r]) out[n] = out[r];
  const need = ['paper', 'ink', 'ink-body', 'ink-muted', 'brand', 'brand-deep', 'feature', 'shorts', 'library'];
  const missing = need.filter((n) => !out[n]);
  if (missing.length) throw new Error('tokens.css is missing: ' + missing.join(', '));
  return out;
}
const C = palette();
const BRAND = J('src/data/brand.json');

/* ---- THE FACTS, COUNTED — never typed ---------------------- */
const nav = J('src/data/navigation.json');
const F = {
  stages: nav.phases.length,
  modules: nav.phases.reduce((n, p) => n + (p.modules || []).length, 0),
  shortSteps: J('src/data/steps.short.json').steps.length,
  featureSteps: (() => { const f = J('src/data/steps.feature.json'); return f.vol1.length + f.vol2.length; })(),
  terms: J('src/data/glossary.json').terms.length,
  films: J('src/data/films.json').length,
  stageNames: nav.phases.map((p) => p.name || p.id)
};
/* THE GUARD HAS TO REJECT A NON-NUMBER, NOT JUST A BAD NUMBER.
   Its first version read `typeof v === 'number' && !(v > 0)`, which
   lets `undefined` straight through — and it did: steps.short.json is
   {steps, beats}, not an array, so .length was undefined and poster 1
   rendered "undefined steps". A guard that only checks the values it
   already expected is not a guard. Anything that is not a positive
   integer stops the draw. */
for (const [k, v] of Object.entries(F)) {
  if (k === 'stageNames') {
    if (!Array.isArray(v) || !v.length || v.some((n) => !n)) throw new Error(`stageNames is ${JSON.stringify(v)}`);
    continue;
  }
  if (!Number.isInteger(v) || v <= 0) {
    throw new Error(`counted ${k} as ${v} (${typeof v}) — refusing to draw a poster with a number I cannot stand behind`);
  }
}

/* The ink ground is the app's default theme. Note tokens.css's bare
   :root carries the DARK palette, so --paper is the near-black and
   --ink is the light text; the names read inverted and are correct. */
const BG = C.paper, FG = C.ink, BODY = C['ink-body'], MUTED = C['ink-muted'];
const W = 1080, H = 1350;

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const FONT = "'Plus Jakarta Sans','Helvetica Neue',Helvetica,Arial,'Liberation Sans',sans-serif";

const text = (x, y, s, { size = 40, weight = 500, fill = FG, anchor = 'start', spacing = 0, op = 1 } = {}) =>
  `<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" font-weight="${weight}" fill="${fill}" text-anchor="${anchor}" letter-spacing="${spacing}" opacity="${op}">${esc(s)}</text>`;

/* the three-hue stripe the toolbar and the app icon both wear */
const stripe = (x, y, w, h = 10) => `
  <rect x="${x}" y="${y}" width="${w / 3}" height="${h}" fill="${C.feature}"/>
  <rect x="${x + w / 3}" y="${y}" width="${w / 3}" height="${h}" fill="${C.shorts}"/>
  <rect x="${x + (2 * w) / 3}" y="${y}" width="${w / 3}" height="${h}" fill="${C.library}"/>`;

/* the clapperboard, the same mark as the app icon, scaled */
const clapper = (cx, cy, s) => `
  <g transform="translate(${cx} ${cy}) scale(${s}) translate(-256 -280)">
    <g transform="rotate(-9 76 212)">
      <rect x="76" y="150" width="360" height="62" rx="6" fill="${FG}"/>
      <g fill="${BG}">
        ${[124, 209, 294, 379].map((x) => `<polygon points="${x},150 ${x + 30},150 ${x + 12},212 ${x - 18},212"/>`).join('')}
      </g>
    </g>
    <rect x="76" y="222" width="360" height="186" rx="10" fill="${FG}" opacity="0.14"/>
    <rect x="76" y="376" width="120" height="32" fill="${C.feature}"/>
    <rect x="196" y="376" width="120" height="32" fill="${C.shorts}"/>
    <rect x="316" y="376" width="120" height="32" fill="${C.library}"/>
  </g>`;

const frame = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">
  <defs><radialGradient id="glow" cx="50%" cy="22%" r="62%">
    <stop offset="0%" stop-color="${C.brand}" stop-opacity="0.30"/>
    <stop offset="100%" stop-color="${C.brand}" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${W}" height="${H}" fill="${BG}"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  ${inner}
  ${stripe(0, H - 10, W)}
</svg>`;

const footer = (y = H - 70) => text(80, y, BRAND.host, { size: 34, weight: 700, fill: C.brand, spacing: 1 });

/* ============ 1 — the announcement ========================== */
const p1 = frame(`
  ${text(80, 150, 'LAUNCHING SOON', { size: 30, weight: 800, fill: C.brand, spacing: 7 })}
  ${clapper(540, 400, 0.78)}
  ${text(80, 700, 'You have never', { size: 94, weight: 800 })}
  ${text(80, 790, 'made a film.', { size: 94, weight: 800 })}
  ${text(80, 892, 'Start one tonight.', { size: 94, weight: 800, fill: C.brand })}
  ${text(80, 985, esc(BRAND.tagline) + ' — all from one desk.', { size: 38, weight: 500, fill: BODY })}
  ${text(80, 1046, `${F.shortSteps} steps from the idea in your head`, { size: 38, weight: 500, fill: BODY })}
  ${text(80, 1100, 'to a short film that is ready to submit.', { size: 38, weight: 500, fill: BODY })}
  ${text(80, 1192, 'Invite-only at launch.', { size: 32, weight: 700, fill: MUTED })}
  ${footer()}`);

/* ============ 2 — what it is ================================ */
const stageRow = (i, name) => {
  const y = 520 + i * 104;
  const hue = [C.feature, C.shorts, C.library, C.brand, C['brand-deep']][i % 5];
  return `<rect x="80" y="${y - 34}" width="10" height="46" rx="5" fill="${hue}"/>
          ${text(124, y, String(i + 1).padStart(2, '0'), { size: 34, weight: 800, fill: hue })}
          ${text(196, y, name, { size: 46, weight: 700 })}`;
};
const TITLES = ['Story', 'Screenplay', 'Pre-production', 'Production', 'Post-production'];
const p2 = frame(`
  ${text(80, 150, 'WHAT IT IS', { size: 30, weight: 800, fill: C.brand, spacing: 7 })}
  ${text(80, 268, 'One desk, from', { size: 86, weight: 800 })}
  ${text(80, 356, 'idea to delivery.', { size: 86, weight: 800, fill: C.brand })}
  ${text(80, 432, `${F.stages} stages. ${F.modules} tools. No installing anything.`, { size: 36, weight: 500, fill: BODY })}
  ${TITLES.slice(0, F.stages).map((n, i) => stageRow(i, n)).join('')}
  ${text(80, 1098, 'Write the script. Break it down. Schedule the', { size: 34, weight: 500, fill: BODY })}
  ${text(80, 1148, 'shoot. Budget it. Print call sheets. Run the set.', { size: 34, weight: 500, fill: BODY })}
  ${text(80, 1222, 'Works offline. Your work stays in your browser.', { size: 32, weight: 700, fill: MUTED })}
  ${footer()}`);

/* ============ 3 — what you actually get ===================== */
/* ONE HELPER OWNS THE WHOLE BLOCK — heading AND its body lines —
   because the first version placed the heading from a helper and
   the body lines by hand at absolute y values I worked out in my
   head. They collided: 150px of reserved space for ~190px of type,
   so "122 terms in plain words" landed on top of the line above it.
   Measure from one place or the blocks will drift apart again the
   first time a line of copy changes length. */
const BLOCK_TOP = 536, BLOCK_GAP = 196, LEAD = 46;
const block = (i, head, lines) => {
  const y = BLOCK_TOP + i * BLOCK_GAP;
  return text(80, y, head, { size: 54, weight: 800, fill: C.brand })
    + lines.map((l, n) => text(80, y + 52 + n * LEAD, l, { size: 32, weight: 500, fill: BODY })).join('');
};
const p3 = frame(`
  ${text(80, 150, 'FOR A FIRST FILM', { size: 30, weight: 800, fill: C.brand, spacing: 7 })}
  ${text(80, 272, 'Not a course', { size: 86, weight: 800 })}
  ${text(80, 360, 'to watch.', { size: 86, weight: 800 })}
  ${text(80, 446, 'A desk that walks you through it.', { size: 38, weight: 500, fill: BODY })}
  ${block(0, `${F.shortSteps} + ${F.featureSteps} guided steps`, [
    'Each explains the craft, shows a worked example,',
    'asks you the questions, checks what you wrote.'
  ])}
  ${block(1, `${F.terms} terms in plain words`, [
    'And a real feature taken apart beside you, so you can',
    'see what the finished thing is supposed to look like.'
  ])}
  ${block(2, 'Made for Chennai', [
    'Rates, crew terms, CBFC rules and festival deadlines',
    'for films shot here. Tamil dialogue, English slugs.'
  ])}
  ${text(80, 1148, 'Pay once. No subscription.', { size: 50, weight: 800 })}
  ${text(80, 1204, 'Nothing to install. Your work stays in your browser.', { size: 30, weight: 500, fill: MUTED })}
  ${footer(1278)}`);

/* ============ the profile picture ==========================
   INSTAGRAM CROPS THE DP TO A CIRCLE AND DRAWS IT AT ~40px IN
   FEED. That rules out three things people reach for:

   - the app icon as-is. Its mark sits in generous padding, right
     for a home screen where it has a tile to itself, wrong here:
     inside a circle it becomes a speck in a field.
   - any text. A word at 40px is mush. The mark alone has to carry
     recognition, which the clapperboard can and a wordmark cannot.
   - anything in the corners, which the circle simply removes.

   So: the same clapperboard, zoomed until it nearly fills the
   circle, on the ink ground the app actually wears. Light on near
   black reads at any size, and the three-hue stripe supplies the
   colour that makes it findable in a list of grey avatars. 1080px
   square — Instagram stores far smaller, but it downscales better
   than it upscales.

   THE PROOF CHANGED THE DESIGN, which is the only reason to draw
   one. The first attempt scaled the mark 1.62 and kept the slate's
   two ruled lines: fine at 320px, mush at 40px — the mark floated
   in empty ground and the ruled lines read as dirt rather than as
   a slate. Scaled 1.95, the lines dropped, the colour stripe
   thickened to carry recognition at the size that matters.

   KEPT INSIDE A 78% SAFE CIRCLE. The square's corners are gone and
   the circle's edge is where a crop goes slightly wrong, so no
   part of the mark goes near it. ========================== */
const DP = 1080, DPC = DP / 2;
const dpSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${DP} ${DP}" width="${DP}" height="${DP}">
  <defs><radialGradient id="dpglow" cx="50%" cy="38%" r="68%">
    <stop offset="0%" stop-color="${C.brand}" stop-opacity="0.42"/>
    <stop offset="100%" stop-color="${C.brand}" stop-opacity="0"/>
  </radialGradient></defs>
  <rect width="${DP}" height="${DP}" fill="${BG}"/>
  <rect width="${DP}" height="${DP}" fill="url(#dpglow)"/>
  <g transform="translate(${DPC} ${DPC}) scale(1.95) translate(-256 -272)">
    <g transform="rotate(-9 76 212)">
      <rect x="76" y="150" width="360" height="62" rx="6" fill="${FG}"/>
      <g fill="${BG}">
        ${[124, 209, 294, 379].map((x) => `<polygon points="${x},150 ${x + 30},150 ${x + 12},212 ${x - 18},212"/>`).join('')}
      </g>
    </g>
    <rect x="76" y="222" width="360" height="186" rx="10" fill="${FG}" opacity="0.34"/>
    <rect x="76" y="222" width="360" height="186" rx="10" fill="none" stroke="${FG}" stroke-opacity="0.72" stroke-width="5"/>
    <g>
      <rect x="76"  y="364" width="120" height="44" fill="${C.feature}"/>
      <rect x="196" y="364" width="120" height="44" fill="${C.shorts}"/>
      <rect x="316" y="364" width="120" height="44" fill="${C.library}"/>
    </g>
  </g>
</svg>`;

/* ---- write -------------------------------------------------- */
mkdirSync(OUT, { recursive: true });
console.log('posters -> social/   (1080x1350, 4:5)');
console.log('facts counted from src/data:', JSON.stringify({ ...F, stageNames: undefined }));
await Promise.all([p1, p2, p3].map((svg, i) =>
  sharp(Buffer.from(svg)).png({ compressionLevel: 9 })
    .toFile(join(OUT, `poster-${i + 1}.png`))
    .then((r) => console.log(`  poster-${i + 1}.png  ${W}x${H}  ${(r.size / 1024).toFixed(0)} KB`))
));
for (let i = 1; i <= 3; i++) writeFileSync(join(OUT, `poster-${i}.svg`), [p1, p2, p3][i - 1]);

/* the DP, plus a circle-cropped proof at the size the feed uses —
   because "it looks fine" at 1080px tells you nothing about the
   40px circle that is what people actually see. */
await sharp(Buffer.from(dpSvg)).png({ compressionLevel: 9 })
  .toFile(join(OUT, 'instagram-dp.png'))
  .then((r) => console.log(`  instagram-dp.png  ${DP}x${DP}  ${(r.size / 1024).toFixed(0)} KB`));
writeFileSync(join(OUT, 'instagram-dp.svg'), dpSvg);

const mask = (d) => Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="#fff"/></svg>`);
const PREVIEW = [320, 150, 56, 40];
const tiles = await Promise.all(PREVIEW.map(async (d) => ({
  input: await sharp(Buffer.from(dpSvg)).resize(d, d)
    .composite([{ input: mask(d), blend: 'dest-in' }]).png().toBuffer(),
  top: 40, left: 0
})));
let x = 40;
for (const t of tiles) { t.left = x; x += (await sharp(t.input).metadata()).width + 40; }
for (const t of tiles) t.top = 40 + (320 - (await sharp(t.input).metadata()).height) / 2;
await sharp({ create: { width: x, height: 400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } })
  .composite(tiles).png().toFile(join(OUT, 'instagram-dp-preview.png'));
console.log(`  instagram-dp-preview.png   the circle crop at ${PREVIEW.join('px, ')}px, on white`);
console.log('  (svg beside each png, so a wording change needs no redraw by hand)');
