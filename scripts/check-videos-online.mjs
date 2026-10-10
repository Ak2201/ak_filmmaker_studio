#!/usr/bin/env node
/* ============================================================
   check-videos-online.mjs — npm run test:videos:online
   ------------------------------------------------------------
   Every APPROVED video in src/data/videos.json is asked of YouTube's
   public oEmbed endpoint (no key, no account): does this id exist and
   embed, and what title and channel does YouTube say it has?

   Why: the ids came from search results and none is `verified`. A
   wrong or removed id shows our curated title over somebody else's
   film, or YouTube's error card, and nothing offline can tell.

   Needs a network that reaches www.youtube.com — the cloud container
   cannot (ENOTFOUND), so this is run on the owner's machine. It writes
   nothing: it prints a table and exits 1 if any id is dead. Flip
   `verified: true` by hand only for the rows you have looked at.

   A title that differs from ours is a WARNING, not a failure: we
   shorten titles on purpose. Read those rows, though — a completely
   different title is the wrong video.
   ============================================================ */
import { readFileSync } from 'node:fs';

const data = JSON.parse(readFileSync(new URL('../src/data/videos.json', import.meta.url), 'utf8'));
const list = (data.videos || []).filter((v) => v.approved);
const words = (s) => new Set(String(s || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter((w) => w.length > 3));
const overlap = (a, b) => { const A = words(a), B = words(b); if (!A.size) return 1; let n = 0; for (const w of A) if (B.has(w)) n++; return n / A.size; };

let dead = 0, warn = 0;
for (const v of list) {
  const url = 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v.yt);
  let line;
  try {
    const r = await fetch(url);
    if (r.status !== 200) { dead++; line = `DEAD  ${r.status}  ${v.id}  (${v.yt})  — removed, private, or embedding disabled`; }
    else {
      const o = await r.json();
      const sim = overlap(v.title, o.title);
      const tag = sim < 0.5 ? (warn++, 'WARN') : 'ok  ';
      line = `${tag}  ${v.id}\n      ours:    ${v.title}\n      youtube: ${o.title} — ${o.author_name}`;
    }
  } catch (e) {
    console.error(`cannot reach youtube.com (${(e.cause && e.cause.code) || e.message}). Run this where YouTube is reachable.`);
    process.exit(2);
  }
  console.log(line);
}
console.log(`\n${list.length} approved · ${dead} dead · ${warn} with a title that barely matches ours`);
process.exit(dead ? 1 : 0);
