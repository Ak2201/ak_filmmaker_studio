/* ============================================================
   make-demo.mjs — the walkthrough film on start.html
   ------------------------------------------------------------
   Records a calm ~90 second tour of the built studio, on the
   Dragon sample, and writes two files into public/media/:

     demo.mp4           H.264, the one source (no audio)
     demo-poster.webp   a still from early in the tour

   There used to be a VP9 demo.webm too, listed second. A browser takes
   the FIRST <source> it can play and every current one plays H.264, so
   the webm (3.5 MB, larger than the mp4) was never downloaded by anyone
   and only weighed down the deploy.

   Run AFTER a open build:   npm run build:open && npm run demo

   It serves dist/ with `vite preview` on port 5470 (spawned, and
   killed at the end), drives one Chromium page through the sample
   and back, and lets Playwright record the page. Nothing is typed
   into a real field: the tour is navigation and scrolling only.

   Animations are left on — the studio's motion is part of what is
   being shown — so navigator.webdriver is hidden for the run.

   Needs ffmpeg on PATH (or FFMPEG=/path). Chromium is
   PW_CHROMIUM or /opt/pw-browsers/chromium.
   ============================================================ */
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUT = path.join(ROOT, 'public', 'media');
const PORT = 5470;
const BASE = `http://localhost:${PORT}/`;
const FFMPEG = process.env.FFMPEG || 'ffmpeg';
const CHROME = process.env.PW_CHROMIUM || '/opt/pw-browsers/chromium';
const SIZE = { width: 1280, height: 720 };
const MAX_BYTES = 8 * 1024 * 1024;

if (!fs.existsSync(path.join(DIST, 'index.html'))) {
  console.error('dist/ is missing. Run `npm run build:open` first.');
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* The tour. Each stop is a page, how long to rest on arrival, and
   the scroll it makes: px down the page over ms. */
const TOUR = [
  { page: 'index.html?sample=1', rest: 4500, px: 900,  ms: 6000 },  // hub, the Dragon sample opens
  { page: 'story.html',          rest: 2000, px: 1200, ms: 8000 },  // the Story stage
  { page: 'write.html#screenplay', rest: 2000, px: 1500, ms: 10000 }, // the script
  { page: 'breakdown.html#scenes', rest: 2000, px: 1000, ms: 7000 }, // scenes from the script
  { page: 'stripboard.html#stripboard', rest: 2000, px: 1000, ms: 7000 }, // the schedule
  { page: 'contacts.html#call-sheets', rest: 2000, px: 800, ms: 7000 }, // call sheets
  { page: 'dashboard.html',     rest: 2000, px: 900,  ms: 8000 },  // where the film stands
];

function startPreview() {
  const child = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true,
  });
  child.stderr.on('data', () => {});
  return child;
}

async function waitForServer(url, tries = 80) {
  for (let i = 0; i < tries; i++) {
    try { const r = await fetch(url); if (r.ok) return; } catch (e) { /* not yet */ }
    await sleep(250);
  }
  throw new Error('vite preview did not answer on ' + url);
}

/* A smooth scroll that runs inside the page, in small steps, so the
   recording shows movement rather than a jump. */
async function scrollSlowly(page, px, ms) {
  await page.evaluate(async ({ px, ms }) => {
    const steps = Math.max(1, Math.round(ms / 50));
    const d = px / steps;
    for (let i = 0; i < steps; i++) {
      window.scrollBy({ top: d, behavior: 'instant' });
      await new Promise((r) => setTimeout(r, 50));
    }
  }, { px, ms });
}

async function main() {
  const preview = startPreview();
  const rawDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fms-demo-'));
  let browser;
  try {
    await waitForServer(BASE);
    browser = await chromium.launch({ executablePath: CHROME, headless: true });
    const context = await browser.newContext({
      viewport: SIZE,
      colorScheme: 'dark',
      serviceWorkers: 'block',
      recordVideo: { dir: rawDir, size: SIZE },
    });
    await context.addInitScript(() => {
      try { Object.defineProperty(navigator, 'webdriver', { get: () => false }); } catch (e) { /* ignore */ }
    });
    const page = await context.newPage();
    const started = Date.now();

    for (const stop of TOUR) {
      await page.goto(BASE + stop.page, { waitUntil: 'load' });
      await sleep(stop.rest);
      await scrollSlowly(page, stop.px, stop.ms);
      await sleep(800);
      console.log(`  ${stop.page.padEnd(30)} ${((Date.now() - started) / 1000).toFixed(1)}s`);
    }

    await sleep(1000);
    await context.close();
    const video = await page.video()?.path();
    if (!video) throw new Error('no video was recorded');
    const raw = path.join(rawDir, path.basename(video));
    encode(raw);
  } finally {
    if (browser) await browser.close().catch(() => {});
    try { process.kill(-preview.pid, 'SIGTERM'); } catch (e) { preview.kill('SIGTERM'); }
    fs.rmSync(rawDir, { recursive: true, force: true });
  }
}

function ff(args) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'inherit' });
  if (r.status !== 0) throw new Error('ffmpeg failed: ' + args.join(' '));
}

function duration(file) {
  const r = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  return Number(r.stdout.trim());
}

function encode(raw) {
  fs.mkdirSync(OUT, { recursive: true });
  const mp4 = path.join(OUT, 'demo.mp4');
  const poster = path.join(OUT, 'demo-poster.webp');

  ff(['-i', raw, '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '28',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  ff(['-ss', '5', '-i', raw, '-frames:v', '1', '-q:v', '80', poster]);

  const secs = duration(mp4);
  console.log(`duration ${secs.toFixed(1)}s`);
  for (const f of [mp4, poster]) {
    const bytes = fs.statSync(f).size;
    console.log(`${path.relative(ROOT, f)}  ${(bytes / 1024 / 1024).toFixed(2)} MB`);
    if (bytes > MAX_BYTES) throw new Error(`${path.basename(f)} is over 8 MB`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
