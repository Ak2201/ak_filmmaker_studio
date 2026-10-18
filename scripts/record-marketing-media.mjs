#!/usr/bin/env node
/* ============================================================
   MARKETING MEDIA  -  npm run record:marketing
   ------------------------------------------------------------
   Drives the REAL app (dist/, build it with `npm run build:open`
   first: the gated build would bounce every page to the doorway)
   on the Dragon sample project and writes, for each of the 11
   product pages of the marketing site, into public/marketing/:

     <id>.webm      silent demo loop, 6-11 s, VP9, <= 1.2 MB
     <id>.webp      poster: the first meaningful frame
     <id>-<n>.webp  one 1280x720 still per how-it-works step, <= 150 KB

   Committed, not generated at build: the hosts have no browser.
   Re-runnable: every file is overwritten. Exits non-zero when a
   file is missing, a size cap is exceeded, or two stills of one
   page are the same picture.

   Env: PW_CHROMIUM  path to a Chromium executable (optional; by
                     default Playwright's own, see
                     PLAYWRIGHT_BROWSERS_PATH)
        ONLY         comma list of ids, to redo a few
   Needs ffmpeg and ffprobe on PATH.
   ============================================================ */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const OUT = join(ROOT, 'public', 'marketing');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.webmanifest': 'application/manifest+json', '.woff2': 'font/woff2', '.woff': 'font/woff', '.ico': 'image/x-icon' };

const VIDEO_MAX = 1.2 * 1024 * 1024;     // bytes
const STILL_MAX = 150 * 1024;
const POSTER_MAX = 150 * 1024;
const DEMO_SECONDS = 9;                  // length kept after trimming
const FPS = 12;
const W = 1280, H = 720;

if (!existsSync(join(DIST, 'index.html'))) { console.error('dist/ is missing: run `npm run build:open` first.'); process.exit(1); }
if (/name="fms-site-gate"[^>]*content="invite"|data-site-gate="invite"/.test(readFileSync(join(DIST, 'index.html'), 'utf8'))) {
  console.error('dist/ looks like the GATED build; run `npm run build:open`.'); process.exit(1);
}

/* ---------- the tiny static server (same pattern as make-shots.mjs) ---------- */
const server = createServer((req, res) => {
  const p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = join(DIST, p);
  if (!f.startsWith(DIST)) { res.writeHead(403); return res.end(); }
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f) && existsSync(f + '.html')) f += '.html';
  if (!existsSync(f)) { res.writeHead(404); return res.end('nf'); }
  res.writeHead(200, { 'Content-Type': TYPES[extname(f)] || 'application/octet-stream' });
  res.end(readFileSync(f));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${server.address().port}/`;

/* ---------- small driving helpers ---------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* Nothing in frame that is not the product: toasts, tours, the skip
   link, the announcement strip, install prompts. */
const QUIET_CSS = `
  .toast, .toast-host, [class*="toast"], .skip-link, [class*="announce"], [class*="tour"],
  [class*="install"], .fms-tour, #fms-tour { display: none !important; }
  html { scroll-behavior: auto !important; }
`;

function driver(page) {
  const d = {
    page,
    async pause(ms) { await sleep(ms); },
    /* a deliberate, visible pointer glide to the middle of a locator */
    async glide(loc) {
      const box = await loc.boundingBox().catch(() => null);
      if (!box) return false;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 28 });
      return true;
    },
    async click(loc, settle = 500) {
      await loc.scrollIntoViewIfNeeded({ timeout: 4000 }).catch(() => {});
      await d.glide(loc);
      await sleep(180);
      await loc.click({ timeout: 4000 });
      await sleep(settle);
    },
    /* smooth scroll by wheel ticks so a recording shows travel, not a jump */
    async scroll(dy, ms = 1200) {
      await page.mouse.move(W / 2, H / 2);
      const n = Math.max(1, Math.round(Math.abs(dy) / 40));
      for (let i = 0; i < n; i++) { await page.mouse.wheel(0, Math.sign(dy) * 40); await sleep(ms / n); }
      await sleep(250);
    },
    async scrollTop() { await page.evaluate(() => { window.scrollTo(0, 0); document.querySelectorAll('main, .app-main, .tabs-panel').forEach((e) => { e.scrollTop = 0; }); }); await sleep(250); },
    async scrollTo(loc, offset = 120) {
      await loc.evaluate((el, o) => { const r = el.getBoundingClientRect(); window.scrollBy(0, r.top - o); }, offset);
      await sleep(350);
    },
    t: (text) => page.locator('button, [role=tab], summary, a', { hasText: text }).filter({ visible: true }).first(),
    async type(loc, text, delay = 70) { await loc.pressSequentially(text, { delay }); }
  };
  return d;
}

async function openPage(d, url, ready, prep) {
  await d.page.goto(BASE + url, { waitUntil: 'load' });
  if (ready) await d.page.waitForSelector(ready, { timeout: 12000 });
  await d.page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await sleep(1400);
  await d.page.evaluate(() => { window.scrollTo(0, 0); }).catch(() => {});
  if (prep) await prep(d);
  await d.page.mouse.move(W - 40, H / 2);
  await sleep(300);
}

/* ============================================================
   THE ELEVEN SPACES
   ready: a selector proving the space drew;  demo(d): ~9 s of
   deliberate driving;  stills: one function per step of the
   page, each leaving the space in a DIFFERENT meaningful state.
   The page is opened once for the demo and once for the stills.
   ============================================================ */
const SPACES = {
  writing: {
    url: 'screenplay.html', ready: '.wr-el .wr-text',
    /* the first scene heading under the bar: the demo starts where the story does, not on the sample notice */
    async prep(d) { await d.scrollTo(d.page.locator('.wr-el.t-scene').first(), 230); },
    async demo(d) {
      const p = d.page;
      const line = p.locator('.wr-el.t-action .wr-text').nth(3);
      await d.click(line, 600);
      await p.keyboard.press('Control+End');
      await p.keyboard.press('Enter');
      await d.pause(500);
      await p.keyboard.press('Tab');                 // the new empty line changes type
      await d.pause(900);
      await p.keyboard.type('RAGAVAN', { delay: 110 });
      await p.keyboard.press('Enter');               // character -> dialogue
      await d.pause(500);
      await p.keyboard.type('Not today. Not this time.', { delay: 80 });
      await d.pause(900);
      await p.keyboard.press('Enter');
      await d.pause(300);
      await p.keyboard.press('Tab');
      await d.pause(1200);
    },
    stills: [
      async () => {},                                                      // 1 the page as written
      async (d) => { await d.click(d.page.locator('.wr-el.t-action .wr-text').nth(3), 400); await d.page.keyboard.press('Control+End'); await d.page.keyboard.press('Enter'); await d.pause(300); await d.page.keyboard.press('Tab'); await d.pause(500); }, // 2 a fresh line takes a new type on Tab
      async (d) => { await d.page.keyboard.type('RAGAVAN', { delay: 20 }); await d.page.keyboard.press('Enter'); await d.page.keyboard.type('Not today. Not this time.', { delay: 15 }); await d.pause(500); }, // 3 dialogue follows the cue
      async (d) => { await d.scroll(1500, 700); } // 4 the long page, scrolled further into the script
    ]
  },

  story: {
    url: 'story.html', ready: 'h1',
    async demo(d) {
      await d.scroll(260, 1400);
      await d.pause(500);
      await d.scroll(300, 1400);
      await d.scrollTop();
      await d.click(d.t('Synopsis & Tagging'), 1400);
      await d.scroll(300, 1200);
      await d.pause(600);
      await d.scrollTop();
      await d.click(d.t('Pacing & Story Notes'), 1500);
    },
    stills: [
      async () => {},                                                                                 // 1 beat sheet
      async (d) => { await d.scroll(520, 500); },                                                     // 2 the beats, scrolled
      async (d) => { await d.scrollTop(); await d.click(d.t('Synopsis & Tagging'), 900); }                       // 3 synopsis and tagging
    ]
  },

  storyboard: {
    url: 'visualize.html#storyboard', ready: '#tab-storyboard.is-on, h1',
    async demo(d) {
      await d.pause(600);
      await d.scroll(360, 1500);
      await d.pause(500);
      await d.scroll(300, 1400);
      await d.pause(500);
      await d.click(d.t('Blocking'), 1400);
      await d.click(d.t('Storyboard'), 1400);
    },
    stills: [
      async () => {},                                                                                 // 1 storyboard head
      async (d) => { await d.scroll(480, 500); },                                                     // 2 frames per shot
      async (d) => { await d.scrollTop(); await d.click(d.t('Blocking'), 900); },                      // 3 blocking
      async (d) => { await d.scrollTop(); await d.click(d.t('Scene board'), 900); }                    // 4 scene board
    ]
  },

  breakdown: {
    url: 'breakdown.html#scenes', ready: '.bd-slug',
    async demo(d) {
      await d.pause(500);
      await d.scroll(200, 900);
      await d.click(d.page.locator('.bd-sl-toggle').first(), 1200);
      await d.scroll(260, 1000);
      await d.click(d.page.locator('.bd-sl-toggle').nth(1), 1200);
      await d.scrollTop();
      await d.click(d.page.locator('#bdSceneSearch'), 300);
      await d.type(d.page.locator('#bdSceneSearch'), 'canteen', 120);
      await d.pause(1500);
    },
    stills: [
      async (d) => { await d.click(d.t('Whole script'), 900); },                                       // 1 the whole script, tagged
      async (d) => { await d.click(d.t('Scene List'), 800); },                                         // 2 the scene list
      async (d) => { await d.click(d.page.locator('.bd-sl-toggle').first(), 800); },                    // 3 a scene opened
      async (d) => { await d.scroll(520, 500); },                                                      // 4 more scenes, chips by category
      async (d) => { await d.scrollTop(); await d.click(d.page.locator('#bdSceneSearch'), 200); await d.type(d.page.locator('#bdSceneSearch'), 'night', 30); await d.pause(700); } // 5 filtered
    ]
  },

  catalog: {
    url: 'breakdown.html#elements', ready: '#tab-elements.is-on',
    async demo(d) {
      await d.pause(800);
      await d.scroll(180, 800);
      const cat = (n) => d.page.locator('.bdx-side .bdx-cat', { hasText: n }).first();
      await d.click(cat('Props'), 1400);
      await d.click(cat('Wardrobe'), 1400);
      await d.click(cat('Cast'), 1400);
      await d.scroll(300, 1200);
    },
    stills: [
      async () => {},                                                                                  // 1 all elements
      async (d) => { await d.click(d.page.locator('.bdx-side .bdx-cat', { hasText: 'Props' }).first(), 800); },   // 2 props only
      async (d) => { await d.click(d.page.locator('.bdx-side .bdx-cat', { hasText: 'Wardrobe' }).first(), 800); } // 3 wardrobe only
    ]
  },

  'shot-list': {
    url: 'visualize.html#shot-list', ready: '#tab-shot-list.is-on, h1',
    async demo(d) {
      await d.pause(700);
      await d.click(d.t('To shoot'), 1200);
      await d.click(d.t('All'), 900);
      await d.scroll(300, 1400);
      await d.click(d.t('Compact'), 1300);
      await d.scrollTop();
      await d.click(d.t('Compact'), 1000);
    },
    stills: [
      async () => {},                                                                                  // 1 setups for a scene
      async (d) => { await d.scroll(560, 500); },                                                      // 2 a later scene
      async (d) => { await d.scrollTop(); await d.click(d.t('Compact'), 800); }                         // 3 compact view
    ]
  },

  schedule: {
    url: 'stripboard.html', ready: '#tab-stripboard.is-on',
    async demo(d) {
      await d.pause(600);
      await d.scroll(300, 1100);
      await d.click(d.page.locator('.sb-seg-btn', { hasText: 'Location' }), 1400);
      await d.click(d.page.locator('.sb-seg-btn', { hasText: 'Shoot day' }), 1400);
      await d.scroll(300, 1100);
      await d.scrollTop();
      await d.click(d.page.locator('#tab-dood'), 1500);
      await d.scroll(260, 1000);
    },
    stills: [
      async () => {},                                                                                  // 1 the board and its numbers
      async (d) => { await d.scroll(480, 500); },                                                      // 2 strips, in script order
      async (d) => { await d.scrollTop(); await d.click(d.page.locator('.sb-seg-btn', { hasText: 'Location' }), 700); await d.scroll(480, 500); },   // 3 grouped by location
      async (d) => { await d.scrollTop(); await d.click(d.page.locator('.sb-seg-btn', { hasText: 'Shoot day' }), 700); await d.scroll(480, 500); }, // 4 grouped by shoot day
      async (d) => { await d.scrollTop(); await d.click(d.page.locator('#tab-dood'), 1000); await d.scroll(300, 400); } // 5 day out of days
    ]
  },

  budget: {
    url: 'budget.html', ready: '#ci_1_days',
    async demo(d) {
      const p = d.page;
      await d.pause(700);
      await d.scroll(520, 1400);
      const days = p.locator('#ci_1_days');
      await d.click(days, 300);
      await p.keyboard.press('Control+A');
      await p.keyboard.type('24', { delay: 200 });
      await p.keyboard.press('Tab');
      await d.pause(900);
      await d.scrollTop();
      await d.pause(1800);
    },
    stills: [
      async () => {},                                                                                  // 1 totals
      async (d) => { await d.scroll(560, 500); },                                                      // 2 the lines
      async (d) => { await d.scrollTop(); await d.click(d.t('Schedule impact'), 1000); },               // 3 schedule impact
      async (d) => { await d.scrollTop(); await d.click(d.t('Top sheet'), 1000); }                      // 4 top sheet
    ]
  },

  'call-sheets': {
    url: 'contacts.html#call-sheets', ready: '.ct-sheet-title',
    async demo(d) {
      await d.pause(700);
      await d.scroll(360, 1500);
      await d.pause(500);
      await d.scroll(400, 1500);
      await d.pause(500);
      await d.scroll(400, 1500);
      await d.pause(500);
    },
    stills: [
      async () => {},                                                                                  // 1 day, call, wrap, location
      async (d) => { await d.scroll(520, 500); },                                                      // 2 scenes and who is called
      async (d) => { await d.scroll(700, 500); }                                                       // 3 further down: cast call times
    ]
  },

  'cast-crew': {
    url: 'contacts.html#contacts', ready: '.ct-name',
    async demo(d) {
      await d.pause(700);
      await d.scroll(420, 1500);
      await d.pause(500);
      await d.scroll(520, 1500);
      await d.pause(500);
      await d.scroll(520, 1500);
      await d.pause(600);
    },
    stills: [
      async () => {},                                                                                  // 1 the unit list, cast first
      async (d) => { await d.scroll(1400, 500); },                                                     // 2 further departments
      async (d) => { await d.scroll(1400, 500); }                                                      // 3 and further still
    ]
  },

  sides: {
    url: 'reports.html#sides', ready: 'input[type=checkbox]',
    async demo(d) {
      const p = d.page;
      await d.pause(700);
      await d.click(d.t('Clear'), 900);
      const boxes = p.locator('main input[type=checkbox]').filter({ visible: true });
      await d.click(boxes.nth(2), 700);
      await d.click(boxes.nth(4), 700);
      await d.click(boxes.nth(5), 900);
      await d.click(d.t('Export'), 1400);
    },
    stills: [
      async () => {},                                                                                  // 1 every scene picked
      async (d) => { await d.click(d.t('Clear'), 400); const b = d.page.locator('main input[type=checkbox]').filter({ visible: true }); await d.click(b.nth(2), 300); await d.click(b.nth(4), 600); }, // 2 two scenes picked
      async (d) => { await d.click(d.t('Export'), 900); }                                              // 3 the export menu
    ]
  }
};

/* ---------- media plumbing ---------- */
const kb = (n) => (n / 1024).toFixed(0) + ' KB';

async function toWebp(png, max, label) {
  let q = 74, buf;
  do { buf = await sharp(png).resize(W, H, { fit: 'cover' }).webp({ quality: q, effort: 5 }).toBuffer(); q -= 6; } while (buf.length > max && q > 20);
  return buf;
}

function ffmpegEncode(src, dst, ss, size, crf) {
  const args = ['-y', '-v', 'error', '-ss', String(ss), '-t', String(DEMO_SECONDS), '-i', src, '-an',
    '-vf', `fps=${FPS},scale=${size[0]}:${size[1]}:flags=lanczos`,
    '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', String(crf), '-row-mt', '1', '-deadline', 'good', '-cpu-used', '2', '-pix_fmt', 'yuv420p', dst];
  execFileSync('ffmpeg', args, { stdio: ['ignore', 'inherit', 'inherit'] });
}

/* ---------- run ---------- */
const only = (process.env.ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
const ids = Object.keys(SPACES).filter((id) => !only.length || only.includes(id));
mkdirSync(OUT, { recursive: true });
const TMP = mkdtempSync(join(tmpdir(), 'fms-mkt-'));

const browser = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
const baseOpts = { viewport: { width: W, height: H }, serviceWorkers: 'block', colorScheme: 'dark', reducedMotion: 'no-preference' };

/* Fonts go through Node (see make-shots.mjs): harmless where the network works,
   and where it does not the page keeps its self-hosted faces anyway. */
async function newCtx(extra = {}) {
  const ctx = await browser.newContext({ ...baseOpts, ...extra });
  await ctx.addInitScript((css) => {
    const put = () => { const s = document.createElement('style'); s.textContent = css; (document.head || document.documentElement).appendChild(s); };
    if (document.head) put(); else document.addEventListener('DOMContentLoaded', put);
  }, QUIET_CSS);
  return ctx;
}

/* seed the Dragon sample once; every later context starts from its storage */
const seed = await newCtx();
const sp = await seed.newPage();
await sp.goto(BASE + 'index.html?sample=1', { waitUntil: 'load' });
await sp.waitForTimeout(3500);
/* indexedDB: the sample's 106-page script lives in `fms_overflow`, not localStorage */
const storageState = await seed.storageState({ indexedDB: true });
await seed.close();

const rows = [];
const problems = [];
const note = (m) => { problems.push(m); console.error('PROBLEM: ' + m); };

for (const id of ids) {
  const S = SPACES[id];
  console.log(`\n== ${id}  (${S.url})`);

  /* --- the demo, recorded --- */
  const vdir = join(TMP, id);
  mkdirSync(vdir, { recursive: true });
  const rctx = await newCtx({ storageState, recordVideo: { dir: vdir, size: { width: W, height: H } } });
  const rpage = await rctx.newPage();
  const rd = driver(rpage);
  const t0 = Date.now();
  let startAt = 0;
  try {
    await openPage(rd, S.url, S.ready, S.prep);
    startAt = (Date.now() - t0) / 1000 - 0.4;     // the first settled frame, a touch before
    await S.demo(rd);
    await sleep(500);
  } catch (e) { note(`${id}: demo failed: ${e.message.split('\n')[0]}`); }
  const poster = await rpage.screenshot({ type: 'png' }).catch(() => null);
  const vpath = await rpage.video().path();
  await rctx.close();                              // flushes the video
  const webm = join(OUT, id + '.webm');
  try {
    let done = false;
    for (const [size, crf] of [[[1280, 720], 36], [[1280, 720], 42], [[1280, 720], 48], [[960, 540], 40], [[960, 540], 48], [[854, 480], 50]]) {
      ffmpegEncode(vpath, webm, Math.max(0, startAt).toFixed(2), size, crf);
      if (statSync(webm).size <= VIDEO_MAX) { done = true; break; }
    }
    if (!done) note(`${id}: video still over ${kb(VIDEO_MAX)} at the smallest setting`);
  } catch (e) { note(`${id}: ffmpeg failed: ${e.message.split('\n')[0]}`); }

  /* poster = first meaningful frame: the frame at the start of the trimmed clip */
  try {
    const f = join(vdir, 'poster.png');
    execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', (Math.max(0, startAt) + 0.5).toFixed(2), '-i', vpath, '-frames:v', '1', f]);
    writeFileSync(join(OUT, id + '.webp'), await toWebp(readFileSync(f), POSTER_MAX, 'poster'));
  } catch (e) {
    if (poster) writeFileSync(join(OUT, id + '.webp'), await toWebp(poster, POSTER_MAX, 'poster'));
    else note(`${id}: no poster`);
  }

  /* --- the stills --- */
  const sctx = await newCtx({ storageState });
  const spg = await sctx.newPage();
  const sd = driver(spg);
  const hashes = new Set();
  try {
    await openPage(sd, S.url, S.ready, S.prep);
    for (let i = 0; i < S.stills.length; i++) {
      try { await S.stills[i](sd); } catch (e) { note(`${id}-${i + 1}: step failed: ${e.message.split('\n')[0]}`); }
      await sleep(500);
      await spg.mouse.move(W - 30, H - 60);          // the pointer out of the way
      await sleep(250);
      const png = await spg.screenshot({ type: 'png' });
      const buf = await toWebp(png, STILL_MAX, 'still');
      writeFileSync(join(OUT, `${id}-${i + 1}.webp`), buf);
      const h = createHash('sha1').update(await sharp(png).resize(160, 90).raw().toBuffer()).digest('hex');
      if (hashes.has(h)) note(`${id}-${i + 1}: identical to an earlier still of this page`);
      hashes.add(h);
    }
  } catch (e) { note(`${id}: stills failed: ${e.message.split('\n')[0]}`); }
  await sctx.close();
}

await browser.close();
server.close();
try { rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* tmp */ }

/* ---------- verify and print the size table ---------- */
const COUNTS = { writing: 4, story: 3, storyboard: 4, breakdown: 5, catalog: 3, 'shot-list': 3, schedule: 5, budget: 4, 'call-sheets': 3, 'cast-crew': 3, sides: 3 };
let total = 0;
console.log('\nfile                         size');
for (const id of ids) {
  const want = [[id + '.webm', VIDEO_MAX], [id + '.webp', POSTER_MAX]];
  for (let n = 1; n <= COUNTS[id]; n++) want.push([`${id}-${n}.webp`, STILL_MAX]);
  for (const [f, max] of want) {
    const p = join(OUT, f);
    if (!existsSync(p)) { note(`missing ${f}`); continue; }
    const s = statSync(p).size;
    total += s;
    if (s > max) note(`${f} is ${kb(s)}, cap ${kb(max)}`);
    console.log(`${f.padEnd(28)} ${kb(s).padStart(8)}${s > max ? '   OVER CAP' : ''}`);
  }
}
console.log(`\ntotal ${(total / 1024 / 1024).toFixed(2)} MB across ${ids.length} pages`);
if (problems.length) { console.error(`\n${problems.length} problem(s):\n - ` + problems.join('\n - ')); process.exit(1); }
console.log('ok');
