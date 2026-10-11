/* ============================================================
   VIDEO THUMBNAILS, FETCHED ONCE AND SERVED FROM OUR OWN ORIGIN
   ------------------------------------------------------------
   The owner asked for the video's thumbnail instead of a bare play
   button. There are two ways to do that and only one of them is
   consistent with what this app already promises.

   NOT BY HOTLINKING i.ytimg.com. The watch block is a click-to-load
   FACADE: nothing reaches Google until the reader presses play, the
   player is `youtube-nocookie.com`, and the facade says "Plays from
   YouTube" before the click so the reader can decide. An <img> from
   i.ytimg.com would send every reader's IP address to Google on page
   load, before any decision — quietly undoing the one thing the
   facade exists to do. It would also need `img-src` widened in BOTH
   vercel.json and netlify.toml (CLAUDE.md's rule about a provider's
   origin in both host configs, in the same commit).

   SO THE THUMBNAIL IS FETCHED ONCE, HERE, AND COMMITTED. This is the
   same shape as `public/media/demo-poster.webp`, which the landing
   page's film already uses, and as `npm run og` and `npm run icons`:
   an author-time generator whose output is a static asset. At runtime
   the facade loads an image from `self`, which the existing CSP
   already allows, and Google still hears nothing until the click.

   Re-runnable and incremental: a thumbnail already on disk is left
   alone, so this fetches only what is new. `--force` re-fetches.

   Run:  npm run thumbs
   ============================================================ */
import { readFileSync, existsSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OUT = path.join(ROOT, 'public', 'media', 'vid');
const DATA = path.join(ROOT, 'src', 'data', 'videos.json');
const FORCE = process.argv.includes('--force');

/* 480x360 is YouTube's `hqdefault`, which exists for every video.
   `maxresdefault` is nicer and 404s on plenty of them, so it is tried
   first and falls back rather than being relied on. */
const SOURCES = (id) => [
  `https://i.ytimg.com/vi/${id}/maxresdefault.jpg`,
  `https://i.ytimg.com/vi/${id}/hqdefault.jpg`
];

/* 16:9 at 2x of the widest the block is drawn, which is plenty for a
   facade nobody looks at closely. hqdefault is 4:3 with letterbox
   bars baked in; cover-cropping to 16:9 removes them. */
const W = 640, H = 360;

const data = JSON.parse(readFileSync(DATA, 'utf8'));
const videos = (data.videos || []).filter((v) => v && v.approved === true && v.yt);

if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true });

const before = new Set(existsSync(OUT) ? readdirSync(OUT) : []);
let made = 0, kept = 0, failed = [];

for (const v of videos) {
  const file = path.join(OUT, v.yt + '.webp');
  if (!FORCE && existsSync(file)) { kept++; continue; }
  let buf = null;
  for (const url of SOURCES(v.yt)) {
    try {
      const r = await fetch(url);
      if (!r.ok) continue;
      const b = Buffer.from(await r.arrayBuffer());
      /* YouTube answers a missing maxresdefault with a 120x90 grey
         placeholder rather than a 404, so the size is the real test. */
      const meta = await sharp(b).metadata();
      if (meta.width < 320) continue;
      buf = b; break;
    } catch (e) { /* try the next source */ }
  }
  if (!buf) { failed.push(v.id); continue; }
  await sharp(buf).resize(W, H, { fit: 'cover', position: 'centre' })
    .webp({ quality: 72 }).toFile(file);
  made++;
}

/* THE DATA CARRIES WHICH ONES EXIST, so the facade can ask before it
   requests. Without this the app emitted an <img> for every approved
   video, and the two with no still answered 404 — harmless to look at
   (the onerror drops the image) but a real console error, which
   `prove:ai-coverage`'s "no page errors" check fails on, in every
   context it runs. Derived from the DISK on every run rather than
   from what this run fetched, so deleting a file or adding a video
   keeps the flag honest. */
let flagged = 0;
for (const v of (data.videos || [])) {
  const has = !!(v.yt && existsSync(path.join(OUT, v.yt + '.webp')));
  if (v.thumb !== has) { if (has) v.thumb = true; else delete v.thumb; flagged++; }
}
if (flagged) {
  writeFileSync(DATA, JSON.stringify(data, null, 2) + '\n');
  console.log(`videos.json: ${flagged} thumb flag(s) updated`);
}

/* A thumbnail whose video has left the catalogue is dead weight in the
   repo and in the precache; name it rather than silently keeping it. */
const want = new Set(videos.map((v) => v.yt + '.webp'));
const orphans = [...before].filter((f) => f.endsWith('.webp') && !want.has(f));

console.log(`thumbs: ${made} fetched, ${kept} already on disk, ${videos.length} approved videos`);
if (orphans.length) console.log('orphans (no approved video any more): ' + orphans.join(', '));
if (failed.length) {
  console.log('NO THUMBNAIL for: ' + failed.join(', '));
  console.log('The facade falls back to the plain play button for those, which is why it still has one.');
}
