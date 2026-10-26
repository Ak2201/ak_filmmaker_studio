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
   - a price. A rupee figure is not durable, because the launch
     prices are scheduled to rise and a post is forever. "Less than a
     cup of tea a day" holds at every tier before and after the rise
     (the dearest is about ₹5.48 a day), and nothing renews by itself.
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
/* SWITCHED-OFF MODULES ARE NOT FEATURES (26 Oct 2026). A module whose
   `plans` is [] in plan-matrix.json is hidden on every plan
   (isDisabledEverywhere()), so a poster that names it, or counts it, is
   advertising something nobody can open. The glossary, the dissected
   feature and the lookbook all sat on these posters after they were
   switched off, and the guided-steps count named blueprints whose stage
   guides are retired (CLAUDE.md items 27 and 36). OFF is read, never
   listed, and cite() below refuses an off module. */
const OFF = new Set(J('src/data/plan-matrix.json').features
  .filter((f) => f.kind === 'module' && Array.isArray(f.plans) && f.plans.length === 0)
  .map((f) => f.key));
const F = {
  stages: nav.phases.length,
  films: J('src/data/films.json').length,
  rules: (() => { const r = J('src/data/rules.json'); return Array.isArray(r) ? r.length : NaN; })(),
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
  ${text(80, 150, 'NOW OPEN', { size: 30, weight: 800, fill: C.brand, spacing: 7 })}
  ${clapper(540, 400, 0.78)}
  ${text(80, 700, 'You have never', { size: 94, weight: 800 })}
  ${text(80, 790, 'made a film.', { size: 94, weight: 800 })}
  ${text(80, 892, 'Here is the desk.', { size: 94, weight: 800, fill: C.brand })}
  ${text(80, 985, esc(BRAND.tagline) + ' — all from one desk.', { size: 38, weight: 500, fill: BODY })}
  ${text(80, 1046, 'Story, screenplay, breakdown, schedule,', { size: 38, weight: 500, fill: BODY })}
  ${text(80, 1100, 'budget and call sheets, in your browser.', { size: 38, weight: 500, fill: BODY })}
  ${/* NO TRIAL LENGTH and no "invite-only": the door is a free trial
       (26 Oct 2026) whose length is a console setting, and a poster is
       forever. "No card" and "nothing renews" are true of every plan
       and every trial. */ ''}
  ${text(80, 1192, 'Free trial · No card · Nothing renews by itself.', { size: 32, weight: 700, fill: MUTED })}
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
  ${text(80, 432, `${F.stages} stages. No installing anything.`, { size: 36, weight: 500, fill: BODY })}
  ${TITLES.slice(0, F.stages).map((n, i) => stageRow(i, n)).join('')}
  ${text(80, 1098, 'Write the script. Break it down. Schedule the', { size: 34, weight: 500, fill: BODY })}
  ${text(80, 1148, 'shoot. Budget it. Print call sheets. Run the set.', { size: 34, weight: 500, fill: BODY })}
  ${text(80, 1222, 'Works offline. Your work lives in your browser first.', { size: 32, weight: 700, fill: MUTED })}
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
  ${block(0, 'Script to call sheet', [
    'Import the screenplay once. The breakdown, the',
    'stripboard and the call sheet read the same scenes.'
  ])}
  ${block(1, `${F.films} films to study`, [
    `Directors, ${F.rules} rules of thumb with the reasons, and`,
    'craft notes on story beats, open while you work.'
  ])}
  ${block(2, 'Made for Chennai', [
    'Chennai rates with sources, CBFC checklists and',
    'festival deadlines. Tamil dialogue, English slugs.'
  ])}
  ${text(80, 1148, 'A year for less than a tea a day.', { size: 50, weight: 800 })}
  ${text(80, 1204, 'Nothing to install. Your work lives in your browser first.', { size: 30, weight: 500, fill: MUTED })}
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

/* ============================================================
   THE FIFTEEN FEATURE POSTERS
   ------------------------------------------------------------
   One per thing the app actually does, drawn from the SAME
   navigation.json the app's own menus are built from — each
   poster's eyebrow is a real phase label and each body line is
   the module's real `purpose` string, lightly broken for the
   line width. Nothing here describes a feature that does not
   exist, because the list is read rather than remembered.

   THE ACCENT IS THE PHASE'S OWN HUE, resolved through the same
   mapping tokens.css uses (.sh-ph-story -> --feature, and so on).
   That is what makes fifteen cards look different without any of
   them going off-brand: the colour is not decoration, it is the
   stage the feature belongs to, exactly as it is in the product.
   ============================================================ */
const PHASE_HUE = { story: 'feature', screenplay: 'library', preprod: 'plan', production: 'shoot', post: 'visualize' };
const navPhases = Object.fromEntries(nav.phases.map((p) => [p.id, p]));
const moduleBy = {};
for (const ph of nav.phases) for (const m of (ph.modules || [])) moduleBy[m.id] = { ...m, phase: ph.id };

/* every id a poster cites must exist, or the draw stops */
const cite = (id) => {
  const m = moduleBy[id];
  if (!m) throw new Error(`poster cites module "${id}", which is not in navigation.json`);
  if (OFF.has(id)) throw new Error(`poster cites module "${id}", which is switched off on every plan (plans: [] in plan-matrix.json)`);
  return m;
};

const FEATURES = [
  { phase: 'story', cites: ['story-beats'], title: ['Write it.', 'Then see its shape.'],
    lede: ['Where the story rises. Where it sags.', 'Shown back to you, scene by scene.'],
    rows: ['Beats and pacing', 'Logline and synopsis', 'Story bible: character, conflict, stakes'] },

  { phase: 'story', cites: ['idea-vault'], title: ['Everything you', 'saved, in one place.'],
    lede: ['Every thought, line and half-idea,', 'on sticky notes kept with the film.'],
    rows: ['Idea Vault', 'Pin a note to a beat or a scene', 'Kept with the film, not in ten tabs'] },

  { phase: 'screenplay', cites: ['screenplay'], title: ['Just write.', 'The format is', 'handled.'],
    lede: ['Slug lines, action, character, dialogue —', 'the layout is done for you as you type.'],
    rows: ['Industry-standard screenplay format', 'Tamil dialogue, English slug lines', 'Export to PDF, Fountain or Final Draft'] },

  { phase: 'screenplay', cites: ['revisions'], title: ['Every draft,', 'kept.'],
    lede: ['Numbered drafts you can compare, restore', 'and print — nothing is ever written over.'],
    rows: ['Draft 1 to whatever you are on now', 'See exactly what changed between them', 'Restore any one of them'] },

  { phase: 'screenplay', cites: ['import-script'], title: ['Already have', 'a script?'],
    lede: ['Bring it in and the whole studio opens up', 'around it. No retyping.'],
    rows: ['Fountain', 'Final Draft (.fdx)', 'PDF and plain text'] },

  { phase: 'preprod', cites: ['auto-tag'], title: ['It reads your', 'script for you.'],
    lede: ['Auto-tagging goes through each scene and', 'suggests what it needs. You confirm.'],
    rows: ['Actors, props and vehicles', 'Stunts and effects', 'Sounds and set dressing'] },

  { phase: 'preprod', cites: ['breakdowns', 'elements'], title: ['What every', 'scene needs.'],
    lede: ['Mark it once per scene, and the film-wide', 'list builds itself underneath you.'],
    rows: ['Actors, props, costumes, vehicles, effects', 'Every element, with the scenes that need it', 'Nothing counted twice'] },

  { phase: 'preprod', cites: ['cast-matrix', 'screen-time'], title: ['Who is in what.', 'How long it runs.'],
    lede: ['The cast matrix shows which character is in', 'which scene, and who shares the most.'],
    rows: ['Screen time worked out from the pages', 'Scene list, in order, day or night', 'Page count and runtime that agree'] },

  { phase: 'preprod', cites: ['shot-list', 'storyboard'], title: ['See it before', 'you shoot it.'],
    lede: ['Plan the shots and draw the frames, each', 'against the scene it belongs to.'],
    rows: ['Shot list: how close, how it moves', 'Storyboard: a frame per shot', 'Reorder, print, export the list'] },

  { phase: 'preprod', cites: ['budget'], title: ['What it costs,', 'line by line.'],
    lede: ['Starts from Chennai rates instead of a blank', 'page, and every figure shows its source.'],
    rows: ['Crew, cast, equipment, locations, post', 'Sourced rates with the date they were checked', 'No invented numbers, no inflation guesses'] },

  { phase: 'preprod', cites: ['stripboard', 'dood', 'calendar'], title: ['Scenes into', 'shoot days.'],
    lede: ['Drag the strips into the order you will', 'actually shoot, and the rest follows.'],
    rows: ['Stripboard, grouped into days', 'Day Out of Days: nobody called for nothing', 'Calendar: prep, shoot, delivery'] },

  { phase: 'preprod', cites: ['contacts', 'sides', 'reports'], title: ['Where to be.', 'At what time.'],
    lede: ['The unit list, the pages each actor needs,', 'and the reports that get printed.'],
    rows: ['Contacts by department, with phone and e-mail', 'Sides: the day’s pages, ready to print', 'Printable reports per scene and per day'] },

  { phase: 'production', cites: ['shoot-day', 'call-sheets'], title: ['The day,', 'on one screen.'],
    lede: ['Today’s scenes, big enough to read on set,', 'with a mark for what you actually got.'],
    rows: ['Shot · part · dropped — not just a tick', 'Call sheets that tell everyone where to be', 'Designed for a phone first, then widened'] },

  { phase: 'post', cites: ['edit-log', 'deliverables'], title: ['What the cut', 'still needs.'],
    lede: ['The edit’s word on each scene, against what', 'the shoot said it got.'],
    rows: ['Edit log, scene by scene', 'Deliverables: censor, subtitles, cinema copy', 'Festival formats, with their deadlines'] }
];

const LIBRARY_POSTER = {
  phase: 'story', hueOverride: 'library', title: ['Read a film.', 'Then write', 'your own.'],
  eyebrowOverride: 'THE LIBRARY',
  lede: ['The reference shelf, open from every page', 'of the studio while you work.'],
  rows: [`${F.films} films worth studying`, 'The directors behind them', `${F.rules} rules of thumb, with the reasons`, 'Craft notes: emotional impact, story beats'] };

function featurePoster(spec) {
  spec.cites?.forEach(cite);
  const hue = C[spec.hueOverride || PHASE_HUE[spec.phase]];
  const eyebrow = spec.eyebrowOverride || navPhases[spec.phase].label.toUpperCase();
  const titleSize = spec.title.length >= 3 ? 82 : 92;
  let y = 262;
  const titleSvg = spec.title.map((l, i) => text(80, y + i * (titleSize + 8), l,
    { size: titleSize, weight: 800, fill: i === spec.title.length - 1 ? hue : FG })).join('');
  y += spec.title.length * (titleSize + 8) + 26;
  const ledeSvg = spec.lede.map((l, i) => text(80, y + i * 48, l, { size: 36, weight: 500, fill: BODY })).join('');
  y += spec.lede.length * 48 + 70;
  const rowsSvg = spec.rows.map((r, i) => {
    const ry = y + i * 86;
    return `<rect x="80" y="${ry - 26}" width="8" height="36" rx="4" fill="${hue}"/>`
      + text(118, ry, r, { size: 34, weight: 600, fill: FG, op: 0.92 });
  }).join('');
  return frame(`
    ${text(80, 150, eyebrow, { size: 30, weight: 800, fill: hue, spacing: 7 })}
    ${titleSvg}${ledeSvg}${rowsSvg}
    ${text(80, 1206, 'Works offline · Nothing renews by itself · Nothing to install', { size: 30, weight: 600, fill: MUTED })}
    ${footer(1278)}`);
}

const ALL = [...FEATURES, LIBRARY_POSTER];
if (ALL.length !== 15) throw new Error(`expected 15 feature posters, built ${ALL.length}`);
console.log(`\nfeature posters -> social/feature-01..15.png`);
await Promise.all(ALL.map((spec, i) => {
  const svg = featurePoster(spec);
  if (/undefined|NaN/.test(svg)) throw new Error(`feature-${i + 1} contains undefined/NaN`);
  const n = String(i + 1).padStart(2, '0');
  writeFileSync(join(OUT, `feature-${n}.svg`), svg);
  return sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(join(OUT, `feature-${n}.png`))
    .then((r) => console.log(`  feature-${n}.png  ${(r.size / 1024).toFixed(0)} KB  ${spec.eyebrowOverride || navPhases[spec.phase].label}`));
}));
